import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { assertSafeExternalUrl, fetchExternalSafe } from "./ssrfGuard";

export type CapturedFavicon = {
  buffer: Buffer;
  contentType: string;
  isFallback: boolean;
};

const FAVICON_CACHE_DIR = path.resolve(process.cwd(), "data", "site-favicons");
const FAVICON_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const memCache = new Map<string, { data: CapturedFavicon; expiresAt: number }>();
const inFlight = new Map<string, Promise<CapturedFavicon>>();

function detectFaviconContentType(buf: Buffer, headerType?: string | null): string | null {
  if (!buf || buf.length < 16) return null;
  // PNG
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  // JPEG
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  // WebP
  if (buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP") {
    return "image/webp";
  }
  // ICO
  if (buf[0] === 0x00 && buf[1] === 0x00 && buf[2] === 0x01 && buf[3] === 0x00) return "image/x-icon";
  // GIF
  if (buf.subarray(0, 3).toString("ascii") === "GIF") return "image/gif";
  // SVG
  const head = buf.subarray(0, 256).toString("utf8").trim().toLowerCase();
  if (head.includes("<svg") || (headerType && headerType.includes("svg"))) return "image/svg+xml; charset=utf-8";
  return null;
}

function buildSvgFaviconFallback(host: string): CapturedFavicon {
  const letter = (host.replace(/^www\./, "")[0] || "W").toUpperCase().replace(/[^A-ZА-ЯЁ0-9]/g, "") || "W";
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
  <defs>
    <linearGradient id="fg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#F4EE8E"/>
      <stop offset="50%" stop-color="#E7C768"/>
      <stop offset="100%" stop-color="#D99E41"/>
    </linearGradient>
  </defs>
  <rect width="64" height="64" rx="16" fill="#17344F" stroke="url(#fg)" stroke-width="3"/>
  <text x="32" y="42" text-anchor="middle" fill="url(#fg)" font-family="system-ui, -apple-system, sans-serif" font-size="30" font-weight="700">${letter}</text>
</svg>`;
  return {
    buffer: Buffer.from(svg, "utf8"),
    contentType: "image/svg+xml; charset=utf-8",
    isFallback: true,
  };
}

function getFaviconCachePaths(host: string) {
  const hash = crypto.createHash("sha256").update(host).digest("hex");
  const metaPath = path.resolve(FAVICON_CACHE_DIR, `${hash}.json`);
  const binPath = path.resolve(FAVICON_CACHE_DIR, `${hash}.bin`);
  if (!metaPath.startsWith(FAVICON_CACHE_DIR + path.sep) || !binPath.startsWith(FAVICON_CACHE_DIR + path.sep)) {
    throw new Error("Invalid favicon cache path");
  }
  return { metaPath, binPath };
}

async function fetchFaviconFromSource(endpoint: string, skipDnsCheck = false): Promise<CapturedFavicon | null> {
  try {
    const { response, buffer } = await fetchExternalSafe(endpoint, {
      timeoutMs: 5000,
      maxBytes: 512 * 1024,
      skipDnsCheckForTrustedApi: skipDnsCheck,
    });
    if (!response.ok) return null;
    const ct = detectFaviconContentType(buffer, response.headers.get("content-type"));
    if (!ct || buffer.length < 32) return null;
    return { buffer, contentType: ct, isFallback: false };
  } catch {
    return null;
  }
}

export async function getOrFetchFavicon(rawUrl: string): Promise<CapturedFavicon> {
  const safeUrl = await assertSafeExternalUrl(rawUrl);
  const parsed = new URL(safeUrl);
  const host = parsed.hostname.toLowerCase();

  const mem = memCache.get(host);
  if (mem && mem.expiresAt > Date.now()) {
    return mem.data;
  }

  try {
    const { metaPath, binPath } = getFaviconCachePaths(host);
    const meta = JSON.parse(await fs.readFile(metaPath, "utf8"));
    if (meta.createdAt && Date.now() - Number(meta.createdAt) < FAVICON_TTL_MS) {
      const buffer = await fs.readFile(binPath);
      if (buffer.length >= 32) {
        const hit: CapturedFavicon = {
          buffer,
          contentType: meta.contentType || "image/png",
          isFallback: false,
        };
        memCache.set(host, { data: hit, expiresAt: Date.now() + 60 * 60 * 1000 });
        return hit;
      }
    }
  } catch {
    // Cache miss
  }

  let pending = inFlight.get(host);
  if (!pending) {
    pending = (async () => {
      const sources: Array<() => Promise<CapturedFavicon | null>> = [
        () => fetchFaviconFromSource(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`, true),
        () => fetchFaviconFromSource(`https://icons.duckduckgo.com/ip3/${encodeURIComponent(host)}.ico`, true),
        () => fetchFaviconFromSource(`${parsed.origin}/favicon.ico`, false),
      ];

      for (const loader of sources) {
        const found = await loader();
        if (found) return found;
      }
      return buildSvgFaviconFallback(host);
    })().finally(() => {
      inFlight.delete(host);
    });
    inFlight.set(host, pending);
  }

  const result = await pending;
  memCache.set(host, {
    data: result,
    expiresAt: Date.now() + (result.isFallback ? 60 * 1000 : 60 * 60 * 1000),
  });
  if (!result.isFallback) {
    try {
      await fs.mkdir(FAVICON_CACHE_DIR, { recursive: true });
      const { metaPath, binPath } = getFaviconCachePaths(host);
      await fs.writeFile(binPath, result.buffer);
      await fs.writeFile(
        metaPath,
        JSON.stringify({ host, contentType: result.contentType, createdAt: Date.now() }),
        "utf8"
      );
    } catch {
      // Ignore cache write errors
    }
  }
  return result;
}
