import crypto from "crypto";
import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import { createRequire } from "module";
import {
  assertSafeExternalUrl,
  fetchExternalSafe,
  isPrivateOrReservedIp,
  normalizeExternalUrl,
} from "./ssrfGuard";

export type CapturedPreview = {
  buffer: Buffer;
  contentType: string;
  isFallback: boolean;
  provider: string;
  url: string;
};

const CACHE_DIR = path.resolve(process.cwd(), "data", "site-previews");
const REAL_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const FALLBACK_CACHE_TTL_MS = 60 * 1000; // 1 min so next visit retries live capture

const inFlightCaptures = new Map<string, Promise<CapturedPreview>>();
const memoryCache = new Map<string, { data: CapturedPreview; expiresAt: number }>();

const CHROMIUM_CANDIDATES = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  process.env.CHROME_PATH,
  "/ms-playwright/chrome-headless-shell-linux64/chrome-headless-shell",
  "/ms-playwright/chromium_headless_shell-1247/chrome-headless-shell-linux64/chrome-headless-shell",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].filter((p): p is string => Boolean(p));

const PLAYWRIGHT_MODULE_CANDIDATES = [
  "playwright-core",
  "playwright",
  "/usr/local/share/bun-global/node_modules/playwright-core",
  "/usr/lib/node_modules/playwright-core",
];

let sharedBrowserPromise: Promise<any> | null = null;
let sharedBrowserIdleTimer: NodeJS.Timeout | null = null;

function findChromiumExecutable(): string | null {
  for (const candidate of CHROMIUM_CANDIDATES) {
    try {
      if (fsSync.existsSync(candidate)) return candidate;
    } catch {
      // Ignore permission/stat errors
    }
  }
  return null;
}

function loadPlaywrightCore(): any | null {
  const req = createRequire(path.resolve(process.cwd(), "package.json"));
  for (const modPath of PLAYWRIGHT_MODULE_CANDIDATES) {
    try {
      if (modPath.startsWith("/") && !fsSync.existsSync(modPath)) continue;
      const loaded = req(modPath);
      if (loaded?.chromium) return loaded;
    } catch {
      // Ignore missing optional dependency
    }
  }
  return null;
}

async function getSharedBrowser(): Promise<any | null> {
  const execPath = findChromiumExecutable();
  if (!execPath) return null;
  const pw = loadPlaywrightCore();
  if (!pw) return null;

  if (sharedBrowserIdleTimer) {
    clearTimeout(sharedBrowserIdleTimer);
    sharedBrowserIdleTimer = null;
  }

  if (!sharedBrowserPromise) {
    sharedBrowserPromise = pw.chromium
      .launch({
        executablePath: execPath,
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
          "--no-first-run",
          "--disable-background-networking",
        ],
      })
      .then((browser: any) => {
        browser.on("disconnected", () => {
          sharedBrowserPromise = null;
        });
        return browser;
      })
      .catch((err: any) => {
        sharedBrowserPromise = null;
        console.warn("[SitePreview] Headless Chromium unavailable:", err?.message || err);
        return null;
      });
  }

  const browser = await sharedBrowserPromise;
  if (browser) {
    sharedBrowserIdleTimer = setTimeout(() => {
      const p = sharedBrowserPromise;
      sharedBrowserPromise = null;
      p?.then((b: any) => b?.close?.()).catch(() => {});
    }, 60_000);
  }
  return browser;
}

export function detectRasterImageType(buf: Buffer): string | null {
  if (!buf || buf.length < 16) return null;
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return "image/png";
  }
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return "image/jpeg";
  }
  // WebP: RIFF....WEBP
  if (
    buf.subarray(0, 4).toString("ascii") === "RIFF" &&
    buf.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

function isValidScreenshotBuffer(buf: Buffer): { ok: boolean; mime?: string } {
  const mime = detectRasterImageType(buf);
  if (!mime) return { ok: false };
  const minBytes = mime === "image/png" ? 12000 : 8000;
  if (buf.length < minBytes) return { ok: false };
  return { ok: true, mime };
}

function getCachePaths(normalizedUrl: string): { metaPath: string; imgPath: string } {
  const hash = crypto.createHash("sha256").update(normalizedUrl).digest("hex");
  const metaPath = path.resolve(CACHE_DIR, `${hash}.json`);
  const imgPath = path.resolve(CACHE_DIR, `${hash}.bin`);
  if (!metaPath.startsWith(CACHE_DIR + path.sep) || !imgPath.startsWith(CACHE_DIR + path.sep)) {
    throw new Error("Invalid cache path");
  }
  return { metaPath, imgPath };
}

async function readDiskCache(normalizedUrl: string): Promise<CapturedPreview | null> {
  try {
    const { metaPath, imgPath } = getCachePaths(normalizedUrl);
    const metaRaw = await fs.readFile(metaPath, "utf8");
    const meta = JSON.parse(metaRaw);
    const ttl = meta.isFallback ? FALLBACK_CACHE_TTL_MS : REAL_CACHE_TTL_MS;
    if (!meta.createdAt || Date.now() - Number(meta.createdAt) > ttl) {
      return null;
    }
    const buffer = await fs.readFile(imgPath);
    if (!buffer || buffer.length < 64) return null;
    return {
      buffer,
      contentType: meta.contentType || "image/jpeg",
      isFallback: Boolean(meta.isFallback),
      provider: meta.provider || "disk-cache",
      url: normalizedUrl,
    };
  } catch {
    return null;
  }
}

async function writeDiskCache(normalizedUrl: string, item: CapturedPreview): Promise<void> {
  if (item.isFallback) return; // Never persist fallback SVG to disk
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    const { metaPath, imgPath } = getCachePaths(normalizedUrl);
    await fs.writeFile(imgPath, item.buffer);
    await fs.writeFile(
      metaPath,
      JSON.stringify({
        url: normalizedUrl,
        contentType: item.contentType,
        provider: item.provider,
        isFallback: false,
        createdAt: Date.now(),
      }),
      "utf8"
    );
  } catch (err: any) {
    console.warn("[SitePreview] Disk cache write skipped:", err?.message || err);
  }
}

async function captureViaPlaywright(safeUrl: string): Promise<CapturedPreview | null> {
  const browser = await getSharedBrowser();
  if (!browser) return null;

  let context: any = null;
  try {
    context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      deviceScaleFactor: 1,
      ignoreHTTPSErrors: true,
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      locale: "ru-RU",
    });
    const page = await context.newPage();

    // Block navigation/subrequests to private or non-http schemes inside Chromium
    await page.route("**/*", async (route: any) => {
      const reqUrl = route.request().url();
      if (reqUrl.startsWith("data:") || reqUrl.startsWith("blob:")) {
        return route.continue();
      }
      try {
        const parsed = new URL(reqUrl);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
          return route.abort();
        }
        const host = parsed.hostname.toLowerCase();
        if (host === "localhost" || host.endsWith(".local") || host.endsWith(".localhost")) {
          return route.abort();
        }
        if (/^\d+\.\d+\.\d+\.\d+$/.test(host) && isPrivateOrReservedIp(host)) {
          return route.abort();
        }
      } catch {
        return route.abort();
      }
      return route.continue();
    });

    await page.goto(safeUrl, { waitUntil: "domcontentloaded", timeout: 11000 });
    await Promise.race([
      page.waitForLoadState("networkidle", { timeout: 3000 }).catch(() => {}),
      page.waitForTimeout(1400),
    ]);
    await page.waitForTimeout(450);

    const buf = await page.screenshot({ type: "jpeg", quality: 84 });
    const check = isValidScreenshotBuffer(buf);
    if (!check.ok || !check.mime) return null;

    return {
      buffer: buf,
      contentType: check.mime,
      isFallback: false,
      provider: "chromium",
      url: safeUrl,
    };
  } catch (err: any) {
    console.warn(`[SitePreview] Chromium capture failed for ${safeUrl}:`, err?.message || err);
    return null;
  } finally {
    if (context) {
      await context.close().catch(() => {});
    }
  }
}

async function captureViaThumIo(safeUrl: string): Promise<CapturedPreview | null> {
  try {
    const endpoint = `https://image.thum.io/get/width/1280/crop/720/noanimate/${safeUrl}`;
    const { response, buffer } = await fetchExternalSafe(endpoint, {
      timeoutMs: 9000,
      maxBytes: 5 * 1024 * 1024,
      skipDnsCheckForTrustedApi: true,
    });
    if (!response.ok) return null;
    const check = isValidScreenshotBuffer(buffer);
    if (!check.ok || !check.mime) return null;
    return {
      buffer,
      contentType: check.mime,
      isFallback: false,
      provider: "thum.io",
      url: safeUrl,
    };
  } catch {
    return null;
  }
}

async function captureViaMicrolink(safeUrl: string): Promise<CapturedPreview | null> {
  try {
    const endpoint = `https://api.microlink.io/?url=${encodeURIComponent(safeUrl)}&screenshot=true&meta=false&viewport.width=1280&viewport.height=720`;
    const { response, buffer } = await fetchExternalSafe(endpoint, {
      timeoutMs: 12000,
      maxBytes: 1024 * 1024,
      headers: { Accept: "application/json" },
      skipDnsCheckForTrustedApi: true,
    });
    if (!response.ok) return null;
    const json = JSON.parse(buffer.toString("utf8"));
    const shotUrl = json?.data?.screenshot?.url;
    if (!shotUrl || typeof shotUrl !== "string") return null;

    const imgRes = await fetchExternalSafe(shotUrl, {
      timeoutMs: 10000,
      maxBytes: 8 * 1024 * 1024,
      skipDnsCheckForTrustedApi: true,
    });
    if (!imgRes.response.ok) return null;
    const check = isValidScreenshotBuffer(imgRes.buffer);
    if (!check.ok || !check.mime) return null;
    return {
      buffer: imgRes.buffer,
      contentType: check.mime,
      isFallback: false,
      provider: "microlink",
      url: safeUrl,
    };
  } catch {
    return null;
  }
}

async function captureViaMshots(safeUrl: string): Promise<CapturedPreview | null> {
  const endpoint = `https://s0.wp.com/mshots/v1/${encodeURIComponent(safeUrl)}?w=1280&h=720`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, 2500));
      }
      const { response, buffer } = await fetchExternalSafe(endpoint, {
        timeoutMs: 9000,
        maxBytes: 5 * 1024 * 1024,
        skipDnsCheckForTrustedApi: true,
      });
      if (!response.ok) continue;
      const check = isValidScreenshotBuffer(buffer);
      if (check.ok && check.mime) {
        return {
          buffer,
          contentType: check.mime,
          isFallback: false,
          provider: "mshots",
          url: safeUrl,
        };
      }
    } catch {
      // Retry next attempt
    }
  }
  return null;
}

async function captureViaOgImageAndTitle(safeUrl: string): Promise<{ preview: CapturedPreview | null; title: string | null }> {
  let pageTitle: string | null = null;
  try {
    const { response, buffer, finalUrl } = await fetchExternalSafe(safeUrl, {
      timeoutMs: 6500,
      maxBytes: 512 * 1024,
      headers: { Accept: "text/html,application/xhtml+xml" },
    });
    if (!response.ok) return { preview: null, title: null };
    const html = buffer.toString("utf8");

    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (titleMatch?.[1]) {
      pageTitle = titleMatch[1].replace(/\s+/g, " ").trim().slice(0, 80);
    }

    const metaPatterns = [
      /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
      /<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image(?::src)?["']/i,
    ];

    for (const pattern of metaPatterns) {
      const m = html.match(pattern);
      if (!m?.[1]) continue;
      try {
        const resolvedImg = new URL(m[1].trim(), finalUrl).toString();
        const imgFetch = await fetchExternalSafe(resolvedImg, {
          timeoutMs: 6000,
          maxBytes: 4 * 1024 * 1024,
        });
        if (!imgFetch.response.ok) continue;
        const mime = detectRasterImageType(imgFetch.buffer);
        if (mime && imgFetch.buffer.length >= 4096) {
          return {
            preview: {
              buffer: imgFetch.buffer,
              contentType: mime,
              isFallback: false,
              provider: "og-image",
              url: safeUrl,
            },
            title: pageTitle,
          };
        }
      } catch {
        // Ignore broken og:image candidate
      }
    }
  } catch {
    // Ignore HTML fetch error
  }
  return { preview: null, title: pageTitle };
}

function escapeXml(str: string): string {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildSvgPreviewFallback(safeUrl: string, siteTitle?: string | null): CapturedPreview {
  let host = safeUrl;
  try {
    host = new URL(safeUrl).hostname.replace(/^www\./, "");
  } catch {
    // Keep safeUrl
  }
  const displayTitle = escapeXml((siteTitle || host).slice(0, 48));
  const displayHost = escapeXml(host.slice(0, 60));
  const initial = escapeXml((host[0] || "W").toUpperCase());

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="540" viewBox="0 0 1280 540" role="img" aria-label="${displayHost}">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0E2235" />
      <stop offset="50%" stop-color="#17344F" />
      <stop offset="100%" stop-color="#10283E" />
    </linearGradient>
    <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#F4EE8E" />
      <stop offset="50%" stop-color="#E7C768" />
      <stop offset="100%" stop-color="#D99E41" />
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="35%" r="55%">
      <stop offset="0%" stop-color="#E7C768" stop-opacity="0.22" />
      <stop offset="100%" stop-color="#17344F" stop-opacity="0" />
    </radialGradient>
  </defs>
  <rect width="1280" height="540" fill="url(#bgGrad)" />
  <rect width="1280" height="540" fill="url(#glow)" />
  <rect x="44" y="38" width="1192" height="464" rx="28" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.16)" stroke-width="1.5" />
  <circle cx="90" cy="76" r="6" fill="rgba(255,255,255,0.35)" />
  <circle cx="114" cy="76" r="6" fill="rgba(255,255,255,0.25)" />
  <circle cx="138" cy="76" r="6" fill="rgba(231,199,104,0.65)" />
  <rect x="176" y="58" width="420" height="36" rx="18" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.14)" />
  <text x="198" y="81" fill="#CBD5E1" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif" font-size="16" font-weight="500">${displayHost}</text>
  <rect x="576" y="148" width="128" height="128" rx="34" fill="rgba(255,255,255,0.06)" stroke="url(#goldGrad)" stroke-width="2" />
  <text x="640" y="232" text-anchor="middle" fill="url(#goldGrad)" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif" font-size="64" font-weight="700">${initial}</text>
  <text x="640" y="338" text-anchor="middle" fill="url(#goldGrad)" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif" font-size="36" font-weight="700">${displayTitle}</text>
  <text x="640" y="386" text-anchor="middle" fill="#E2E8F0" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif" font-size="20" font-weight="500">${displayHost}</text>
</svg>`;

  return {
    buffer: Buffer.from(svg, "utf8"),
    contentType: "image/svg+xml; charset=utf-8",
    isFallback: true,
    provider: "svg-fallback",
    url: safeUrl,
  };
}

async function performCapture(safeUrl: string): Promise<CapturedPreview> {
  // 1. Prefer local Chromium if available on host (zero quota limits, high fidelity),
  //    or race external screenshot services if headless Chromium is absent/slow.
  const pwPromise = captureViaPlaywright(safeUrl);
  const pwResult = await pwPromise;
  if (pwResult) return pwResult;

  // 2. Fallback to Thum.io and Microlink when Chromium isn't installed or failed on target
  const [thumRes, microlinkRes] = await Promise.all([
    captureViaThumIo(safeUrl),
    captureViaMicrolink(safeUrl),
  ]);
  if (microlinkRes) return microlinkRes;
  if (thumRes) return thumRes;

  // 3. WordPress mShots fallback
  const mshotsRes = await captureViaMshots(safeUrl);
  if (mshotsRes) return mshotsRes;

  // 4. OpenGraph image & title extraction
  const ogRes = await captureViaOgImageAndTitle(safeUrl);
  if (ogRes.preview) return ogRes.preview;

  // 5. Crisp Liquid Glass SVG fallback card (never a blank white box)
  return buildSvgPreviewFallback(safeUrl, ogRes.title);
}

export async function getOrCaptureSitePreview(
  rawUrl: string,
  options: { refresh?: boolean } = {}
): Promise<CapturedPreview> {
  const safeUrl = await assertSafeExternalUrl(rawUrl);
  const normalizedKey = normalizeExternalUrl(safeUrl) || safeUrl;

  if (!options.refresh) {
    const mem = memoryCache.get(normalizedKey);
    if (mem && mem.expiresAt > Date.now()) {
      return mem.data;
    }

    const disk = await readDiskCache(normalizedKey);
    if (disk) {
      memoryCache.set(normalizedKey, {
        data: disk,
        expiresAt: Date.now() + (disk.isFallback ? FALLBACK_CACHE_TTL_MS : 30 * 60 * 1000),
      });
      return disk;
    }
  }

  let pending = inFlightCaptures.get(normalizedKey);
  if (!pending) {
    pending = performCapture(safeUrl).finally(() => {
      inFlightCaptures.delete(normalizedKey);
    });
    inFlightCaptures.set(normalizedKey, pending);
  }

  const captured = await pending;
  memoryCache.set(normalizedKey, {
    data: captured,
    expiresAt: Date.now() + (captured.isFallback ? FALLBACK_CACHE_TTL_MS : 30 * 60 * 1000),
  });
  await writeDiskCache(normalizedKey, captured);
  return captured;
}
