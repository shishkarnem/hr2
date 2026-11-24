// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import type { Server } from "http";
import { PWA_ICON_FALLBACKS } from "./pwaIconsFallback";
import {
  registerPwaAssetRoutes,
  isBuiltDistDir,
  setStaticAssetHeaders,
  type StaticRoots,
} from "./staticAssets";

describe("PWA static assets & embedded icon fallbacks", () => {
  let server: Server;
  let baseUrl = "";

  const emptyRoots: StaticRoots = {
    projectRoot: "/nonexistent-root-for-test",
    distPath: "/nonexistent-dist-for-test",
    distIndexExists: false,
    publicPath: "/nonexistent-public-for-test",
    publicExists: false,
  };

  beforeAll(async () => {
    const app = express();
    registerPwaAssetRoutes(app, emptyRoots);
    await new Promise<void>((resolve) => {
      server = app.listen(0, "127.0.0.1", () => {
        const addr = server.address();
        if (addr && typeof addr === "object") {
          baseUrl = `http://127.0.0.1:${addr.port}`;
        }
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("embeds valid PNG buffers for all manifest & push PWA icons", () => {
    const pngPaths = [
      "/icons/pwa/pwa-192x192.png",
      "/icons/pwa/pwa-512x512.png",
      "/icons/pwa/pwa-maskable-192x192.png",
      "/icons/pwa/pwa-maskable-512x512.png",
      "/icons/pwa/badge-72x72.png",
      "/icons/apple/apple-touch-icon.png",
      "/icons/seo/favicon-192x192.png",
      "/icons/favicon/favicon-32x32.png",
      "/icons/favicon/favicon-16x16.png",
    ];
    for (const p of pngPaths) {
      const asset = PWA_ICON_FALLBACKS[p];
      expect(asset, `Missing fallback for ${p}`).toBeDefined();
      expect(asset.contentType).toBe("image/png");
      expect(asset.buffer.subarray(0, 4).toString("hex")).toBe("89504e47");
    }
  });

  it("serves /icons/pwa/pwa-192x192.png and sibling PWA assets with 200 even when disk paths are missing", async () => {
    const res192 = await fetch(`${baseUrl}/icons/pwa/pwa-192x192.png`);
    expect(res192.status).toBe(200);
    expect(res192.headers.get("content-type")).toBe("image/png");
    const buf = Buffer.from(await res192.arrayBuffer());
    expect(buf.subarray(0, 4).toString("hex")).toBe("89504e47");
    expect(buf.length).toBe(PWA_ICON_FALLBACKS["/icons/pwa/pwa-192x192.png"].buffer.length);

    const resManifest = await fetch(`${baseUrl}/manifest.webmanifest`);
    expect(resManifest.status).toBe(200);
    expect(resManifest.headers.get("content-type")).toContain("application/manifest+json");

    const resSw = await fetch(`${baseUrl}/sw.js`);
    expect(resSw.status).toBe(200);
    expect(resSw.headers.get("content-type")).toContain("application/javascript");

    const resPushSw = await fetch(`${baseUrl}/push-sw.js`);
    expect(resPushSw.status).toBe(200);
    expect(resPushSw.headers.get("content-type")).toContain("application/javascript");

    const resFav = await fetch(`${baseUrl}/favicon.ico`);
    expect(resFav.status).toBe(200);
  });

  it("never treats the source root containing /src/main.tsx as a built dist directory", () => {
    expect(isBuiltDistDir(process.cwd())).toBe(false);
  });

  it("sets strict module-compatible MIME types for .js, .mjs, and .wasm assets", () => {
    const headers: Record<string, string> = {};
    const fakeRes = {
      setHeader(k: string, v: string) {
        headers[k.toLowerCase()] = v;
      },
    } as any;

    setStaticAssetHeaders(fakeRes, "/app/dist/assets/index-123.js");
    expect(headers["content-type"]).toBe("application/javascript; charset=utf-8");

    setStaticAssetHeaders(fakeRes, "/app/dist/assets/pdf.worker.min.mjs");
    expect(headers["content-type"]).toBe("application/javascript; charset=utf-8");

    setStaticAssetHeaders(fakeRes, "/app/dist/assets/module.wasm");
    expect(headers["content-type"]).toBe("application/wasm");
  });
});
