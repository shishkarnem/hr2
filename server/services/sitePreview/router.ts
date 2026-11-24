import { Router, Request, Response } from "express";
import { getOrCaptureSitePreview } from "./capture";
import { getOrFetchFavicon } from "./favicon";
import { assertSafeExternalUrl } from "./ssrfGuard";

export const sitePreviewRouter = Router();

sitePreviewRouter.get("/site-preview", async (req: Request, res: Response) => {
  try {
    const rawUrl = typeof req.query.url === "string" ? req.query.url : "";
    if (!rawUrl.trim()) {
      return res.status(400).json({ error: "Missing url query parameter" });
    }

    try {
      await assertSafeExternalUrl(rawUrl);
    } catch (err: any) {
      return res.status(400).json({ error: err?.message || "Invalid or unsafe URL" });
    }

    const refresh = req.query.refresh === "1" || req.query.refresh === "true";
    const result = await getOrCaptureSitePreview(rawUrl, { refresh });

    res.setHeader("Content-Type", result.contentType);
    res.setHeader("X-Preview-Provider", result.provider);
    res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    if (result.isFallback) {
      res.setHeader("Cache-Control", "no-store");
    } else {
      res.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
    }
    return res.send(result.buffer);
  } catch (err: any) {
    console.error("[SitePreview] Route error:", err?.message || err);
    return res.status(502).json({ error: "Failed to capture website preview" });
  }
});

sitePreviewRouter.get("/site-favicon", async (req: Request, res: Response) => {
  try {
    const rawUrl = typeof req.query.url === "string" ? req.query.url : "";
    if (!rawUrl.trim()) {
      return res.status(400).json({ error: "Missing url query parameter" });
    }

    try {
      await assertSafeExternalUrl(rawUrl);
    } catch (err: any) {
      return res.status(400).json({ error: err?.message || "Invalid or unsafe URL" });
    }

    const result = await getOrFetchFavicon(rawUrl);
    res.setHeader("Content-Type", result.contentType);
    res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    if (result.isFallback) {
      res.setHeader("Cache-Control", "public, max-age=300");
    } else {
      res.setHeader("Cache-Control", "public, max-age=604800, stale-while-revalidate=86400");
    }
    return res.send(result.buffer);
  } catch (err: any) {
    console.error("[SiteFavicon] Route error:", err?.message || err);
    return res.status(502).json({ error: "Failed to fetch favicon" });
  }
});
