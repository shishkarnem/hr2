/**
 * Helpers for resolving direct, permanent Cloud CDN URLs (https://file.pro-talk.ru/tgf/...)
 * for images, logos, mascots, and attachments stored in ProTalk File Storage.
 */

import { ID_TO_CDN_URL, PATH_TO_CDN_URL } from "./fileCdnMap";

export { ID_TO_CDN_URL, PATH_TO_CDN_URL };

// Default Direct ProTalk CDN Logo URL (ID 11: RR-Logo.png)
export const DEFAULT_RR_LOGO_URL =
  ID_TO_CDN_URL["11"] ||
  "https://file.pro-talk.ru/tgf/GgMpJwQ9JCkYKglyGHQMDkIGOR0fDho9PCs3F1wJCj8mZg4YMSJmEyQcdD8ZEyI7NAssKy0_NkEKRzENCmkFGwoPPms4NRQmEV9uZlUAaA11VQJrCjgDAzkkAVczLRouDiMXfQxTNBdFGT8aIyw2ZyIcIQsIKjIuHhtsBXZSBGZ5T3FP.png";

// Default Mascot Greeting URL (ID 4: RR3.png)
export const DEFAULT_RR_MASCOT_GREETING_URL =
  ID_TO_CDN_URL["4"] ||
  "https://file.pro-talk.ru/tgf/GgMpJwQ9JCkYKglyGHQMDlwWOR0fEGxkAQEBIwojNCdSRw1SHyxIDhoNLjQZEyJXNAssKy0_NkEKXw4sBCN6KC8xPgY4NRQmEV9uZlUAaA11VQJrCjgDAzkkAVczLRouDiMXfQxTNBdFGT8aIyw2ZyIcIQsIKjIuHhtsBXZSBGZ5T3FP.png";

/**
 * Returns the full direct CDN URL for any image, resolving /files/:id, /logos/...,
 * relative paths, or host-prefixed /files URLs to https://file.pro-talk.ru/tgf/...
 */
export function rrImg(url: string | null | undefined, _width?: number, _quality?: number): string {
  if (!url) return "";
  let cleanUrl = String(url).trim();

  // 1. If full direct ProTalk CDN URL, return immediately
  if (cleanUrl.startsWith("https://file.pro-talk.ru/")) {
    return cleanUrl;
  }

  // 2. If app domain was prepended (e.g. https://ais-dev-.../files/4/rr3.png -> /files/4/rr3.png)
  const hostMatch = cleanUrl.match(/^https?:\/\/[^\/]+(\/files?\/.*)$/i);
  if (hostMatch) {
    cleanUrl = hostMatch[1];
  }

  // 3. Direct lookup in PATH_TO_CDN_URL
  const lowerUrl = cleanUrl.toLowerCase();
  if (PATH_TO_CDN_URL[cleanUrl]) return PATH_TO_CDN_URL[cleanUrl];
  if (PATH_TO_CDN_URL[lowerUrl]) return PATH_TO_CDN_URL[lowerUrl];
  if (!cleanUrl.startsWith("/") && PATH_TO_CDN_URL[`/${cleanUrl}`]) return PATH_TO_CDN_URL[`/${cleanUrl}`];
  if (!cleanUrl.startsWith("/") && PATH_TO_CDN_URL[`/${lowerUrl}`]) return PATH_TO_CDN_URL[`/${lowerUrl}`];

  // 4. Resolve /files/:id/:filename? or /file/:id
  const match = cleanUrl.match(/^\/files?\/([A-Za-z0-9_-]+)(?:\/.*)?$/i);
  if (match) {
    const fileIdOrKey = match[1];
    if (ID_TO_CDN_URL[fileIdOrKey]) {
      return ID_TO_CDN_URL[fileIdOrKey];
    }
  }

  // 5. Resolve legacy /logos/... paths to direct ProTalk CDN URLs
  if (cleanUrl.startsWith("/logos/") || cleanUrl.startsWith("logos/")) {
    const filename = cleanUrl.replace(/^\/?logos\//i, "");
    if (/logo/i.test(filename)) return DEFAULT_RR_LOGO_URL;
    if (/rr3/i.test(filename)) return DEFAULT_RR_MASCOT_GREETING_URL;
    if (/rr4/i.test(filename)) return ID_TO_CDN_URL["5"] || cleanUrl;
    if (/rr5/i.test(filename)) return ID_TO_CDN_URL["6"] || cleanUrl;
    if (/rr6/i.test(filename)) return ID_TO_CDN_URL["7"] || cleanUrl;
    if (/rr7/i.test(filename)) return ID_TO_CDN_URL["8"] || cleanUrl;
    if (/rr8/i.test(filename)) return ID_TO_CDN_URL["9"] || cleanUrl;
    if (/rr9/i.test(filename)) return ID_TO_CDN_URL["10"] || cleanUrl;
    if (/rr10/i.test(filename)) return ID_TO_CDN_URL["3"] || cleanUrl;
    if (/rr11/i.test(filename)) return ID_TO_CDN_URL["2"] || cleanUrl;
    if (/rrpromax|rr2/i.test(filename)) return ID_TO_CDN_URL["13"] || cleanUrl;
  }

  return cleanUrl;
}