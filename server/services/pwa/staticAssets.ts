import express, { type Express, type Request, type Response, type NextFunction } from "express";
import fs from "fs";
import path from "path";
import { PWA_ICON_FALLBACKS } from "./pwaIconsFallback";

export interface StaticRoots {
  projectRoot: string;
  distPath: string;
  distIndexExists: boolean;
  publicPath: string;
  publicExists: boolean;
}

const MIME_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".xml": "application/xml; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

const DEV_SW_FALLBACK =
  `/* Dev-safe PWA & Web Push Service Worker */\n` +
  `self.addEventListener("install", function () { self.skipWaiting(); });\n` +
  `self.addEventListener("activate", function (event) { event.waitUntil(self.clients.claim()); });\n` +
  `try { importScripts("/push-sw.js"); } catch (e) {}\n`;

const PUSH_SW_FALLBACK = `/* Web Push & Notification Click Service Worker Extension */
self.addEventListener("push", function (event) {
  let payload = {
    title: "Робот Рекрутер",
    body: "Новое уведомление в вашем кабинете",
    icon: "/icons/pwa/pwa-192x192.png",
    badge: "/icons/pwa/badge-72x72.png",
    url: "/",
    tag: "rr-notification",
    data: {},
  };
  try {
    if (event.data) {
      const parsed = event.data.json();
      payload = { ...payload, ...parsed, data: { ...(parsed.data || {}), url: parsed.url || parsed.data?.url || "/" } };
    }
  } catch (e) {
    try {
      const txt = event.data ? event.data.text() : "";
      if (txt) payload.body = txt;
    } catch {}
  }
  const options = {
    body: payload.body,
    icon: payload.icon || "/icons/pwa/pwa-192x192.png",
    badge: payload.badge || "/icons/pwa/badge-72x72.png",
    tag: payload.tag || "rr-notification",
    renotify: true,
    requireInteraction: false,
    vibrate: [120, 60, 120],
    data: { url: payload.url || "/", ...(payload.data || {}) },
  };
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(payload.title || "Робот Рекрутер", options),
      self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (clientList) {
        for (const client of clientList) client.postMessage({ type: "RR_PUSH_RECEIVED", payload });
      }).catch(function () {}),
    ])
  );
});
self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  const targetUrl = (event.notification && event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (clientList) {
      for (const client of clientList) {
        try {
          const clientUrl = new URL(client.url);
          const destUrl = new URL(targetUrl, self.location.origin);
          if (clientUrl.origin === destUrl.origin && "focus" in client) {
            client.focus();
            if ("navigate" in client && clientUrl.pathname !== destUrl.pathname) return client.navigate(destUrl.href);
            return client;
          }
        } catch {}
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});
`;

export const MANIFEST_FALLBACK = {
  id: "/",
  name: "Робот Рекрутер — ИИ-платформа найма",
  short_name: "Робот Рекрутер",
  description:
    "ИИ-платформа для автоматического подбора персонала, онлайн-собеседований и корпоративного обучения.",
  lang: "ru",
  dir: "ltr",
  theme_color: "#17344F",
  background_color: "#17344F",
  display: "standalone",
  display_override: ["standalone", "minimal-ui"],
  orientation: "portrait-primary",
  scope: "/",
  start_url: "/",
  categories: ["business", "productivity"],
  icons: [
    { src: "/icons/pwa/pwa-192x192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "/icons/pwa/pwa-512x512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    { src: "/icons/pwa/pwa-maskable-192x192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
    { src: "/icons/pwa/pwa-maskable-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
  ],
};

function getAnchorDirs(): string[] {
  const dirs: string[] = [process.cwd()];
  try {
    if (typeof __dirname === "string" && __dirname) {
      dirs.push(__dirname);
    }
  } catch {
    // ignore in pure ESM
  }
  if (process.argv[1]) {
    dirs.push(path.dirname(path.resolve(process.argv[1])));
  }
  return Array.from(new Set(dirs.filter(Boolean)));
}

function isFile(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function isDir(dirPath: string): boolean {
  try {
    return fs.statSync(dirPath).isDirectory();
  } catch {
    return false;
  }
}

export function resolveStaticRoots(): StaticRoots {
  const anchors = getAnchorDirs();
  const distCandidates: string[] = [];
  const publicCandidates: string[] = [];
  const rootCandidates: string[] = [];

  for (const anchor of anchors) {
    distCandidates.push(path.join(anchor, "dist"));
    distCandidates.push(anchor);
    distCandidates.push(path.resolve(anchor, "..", "dist"));

    publicCandidates.push(path.join(anchor, "public"));
    publicCandidates.push(path.resolve(anchor, "..", "public"));

    rootCandidates.push(anchor);
    rootCandidates.push(path.resolve(anchor, ".."));
  }

  const uniqueDist = Array.from(new Set(distCandidates));
  const distWithIndex = uniqueDist.find((dir) => isFile(path.join(dir, "index.html")));
  const distWithAssets = uniqueDist.find((dir) => isDir(path.join(dir, "assets")));
  const distPath = distWithIndex || distWithAssets || path.join(process.cwd(), "dist");
  const distIndexExists = isFile(path.join(distPath, "index.html"));

  const uniquePublic = Array.from(new Set(publicCandidates));
  const resolvedPublic = uniquePublic.find((dir) => isDir(dir));
  const publicPath = resolvedPublic || path.join(process.cwd(), "public");
  const publicExists = isDir(publicPath);

  const uniqueRoots = Array.from(new Set(rootCandidates));
  const projectRoot =
    uniqueRoots.find((dir) => isFile(path.join(dir, "package.json"))) || process.cwd();

  return {
    projectRoot,
    distPath,
    distIndexExists,
    publicPath,
    publicExists,
  };
}

function safeResolveUnder(baseDir: string, urlPath: string): string | null {
  const cleanRel = urlPath.replace(/^\/+/, "");
  if (!cleanRel || cleanRel.includes("\0")) return null;
  const resolvedBase = path.resolve(baseDir);
  const resolvedTarget = path.resolve(resolvedBase, cleanRel);
  if (resolvedTarget !== resolvedBase && !resolvedTarget.startsWith(resolvedBase + path.sep)) {
    return null;
  }
  return isFile(resolvedTarget) ? resolvedTarget : null;
}

function sendAssetFileOrFallback(req: Request, res: Response, next: NextFunction, roots: StaticRoots) {
  const reqPath = (req.path || "").split("?")[0];
  const diskFile =
    safeResolveUnder(roots.distPath, reqPath) ||
    safeResolveUnder(roots.publicPath, reqPath);

  if (diskFile) {
    const ext = path.extname(diskFile).toLowerCase();
    if (MIME_TYPES[ext]) {
      res.setHeader("Content-Type", MIME_TYPES[ext]);
    }
    res.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.sendFile(diskFile);
  }

  const fallback = PWA_ICON_FALLBACKS[reqPath];
  if (fallback) {
    res.setHeader("Content-Type", fallback.contentType);
    res.setHeader("Content-Length", String(fallback.buffer.length));
    res.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.status(200).send(fallback.buffer);
  }

  return next();
}

export function registerPwaAssetRoutes(app: Express, roots: StaticRoots): void {
  app.get("/sw.js", (_req, res) => {
    res.setHeader("Content-Type", "application/javascript; charset=utf-8");
    res.setHeader("Service-Worker-Allowed", "/");
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    const distSw = safeResolveUnder(roots.distPath, "/sw.js");
    if (distSw) {
      return res.sendFile(distSw);
    }
    return res.send(DEV_SW_FALLBACK);
  });

  app.get("/push-sw.js", (_req, res) => {
    res.setHeader("Content-Type", "application/javascript; charset=utf-8");
    res.setHeader("Service-Worker-Allowed", "/");
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    const diskSw =
      safeResolveUnder(roots.distPath, "/push-sw.js") ||
      safeResolveUnder(roots.publicPath, "/push-sw.js");
    if (diskSw) {
      return res.sendFile(diskSw);
    }
    return res.send(PUSH_SW_FALLBACK);
  });

  app.get("/manifest.webmanifest", (_req, res) => {
    res.setHeader("Content-Type", "application/manifest+json; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    const diskManifest =
      safeResolveUnder(roots.distPath, "/manifest.webmanifest") ||
      safeResolveUnder(roots.publicPath, "/manifest.webmanifest");
    if (diskManifest) {
      return res.sendFile(diskManifest);
    }
    return res.json(MANIFEST_FALLBACK);
  });

  app.get("/favicon.ico", (req, res, next) => sendAssetFileOrFallback(req, res, next, roots));
  app.get("/icons/*", (req, res, next) => sendAssetFileOrFallback(req, res, next, roots));
}

export function registerPublicStaticFallback(app: Express, roots: StaticRoots): void {
  if (roots.publicExists) {
    app.use(
      express.static(roots.publicPath, {
        index: false,
        maxAge: "1d",
      })
    );
  }
}
