export const OLD_DEFAULT_COVER_URL =
  "https://file.pro-talk.ru/tgf/GgMpJwQ9JCkYKglyGHQMJH0GOjgMOTE_BA9wETwiCzYmBQ95AyhoBSJLMhgZEyQdKwssKyoEUnQKdGsEfDonABIYETY4NRQmEV9uZlUAaA11VQJrCjgDAzkkAVczLRouDiMXfQxTNBdFGT8aIyw2ZyIcIQsIKjIuHhtsBXZSBGZ5T3FP.png";

export const NEW_DEFAULT_COVER_URL =
  "https://file.pro-talk.ru/tgf/GTUpJwQ9JCkYKglyGHQMIlsGO04KNgwaLzU1Cx8YNSsQAT5gdCtKGAEJfEgZEyI8Ag0eCgoBGFEKAgMqXRAcPTRLCjkpNQQeLA8YFgdnGHEWMGMtN05yTm9kWVx2bl1SGBMkTzhDL1JEJjw_EgstGT0CNywaIC0xBGA3AAwZVgAuOy4GJH9dVHVpW19rZFYD.jpg";

export interface TgMediaItem {
  type: "photo" | "video";
  url?: string;
  posterUrl?: string;
  tooLarge?: boolean;
  sizeMb?: number;
  width?: number;
  height?: number;
  duration?: number;
  postUrl?: string;
}

export interface TgButtonItem {
  text: string;
  url: string;
}

export interface TgCollapsePayload {
  markdown: string;
  summary?: string;
  credit?: string;
  isOpen?: boolean;
}

export type BlogContentSegment =
  | { kind: "markdown"; markdown: string }
  | { kind: "tg-video"; item: TgMediaItem }
  | { kind: "tg-gallery"; items: TgMediaItem[] }
  | { kind: "tg-buttons"; rows: TgButtonItem[][] }
  | { kind: "tg-collapse"; payload: TgCollapsePayload };

export function isVideoMediaUrl(url?: string | null): boolean {
  if (!url || typeof url !== "string") return false;
  const clean = url.split(/[?#]/)[0].trim().toLowerCase();
  return /\.(mp4|webm|mov|m4v|ogg)$/.test(clean);
}

export function isSafeBlogUrl(rawUrl?: string | null): boolean {
  if (!rawUrl || typeof rawUrl !== "string") return false;
  const trimmed = rawUrl.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return true;
  if (/^mailto:/i.test(trimmed) || /^tel:/i.test(trimmed) || /^tg:/i.test(trimmed)) return true;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

export function replaceLegacyDefaultCover(url?: string | null): string {
  const trimmed = typeof url === "string" ? url.trim() : "";
  if (!trimmed || trimmed === OLD_DEFAULT_COVER_URL || isVideoMediaUrl(trimmed)) {
    return NEW_DEFAULT_COVER_URL;
  }
  if (!isSafeBlogUrl(trimmed)) {
    return NEW_DEFAULT_COVER_URL;
  }
  return trimmed;
}

export function resolvePostCoverImage(post: {
  cover_image_url?: string | null;
  cover_url?: string | null;
}): string {
  const raw = post?.cover_image_url || post?.cover_url || "";
  return replaceLegacyDefaultCover(raw);
}

export function resolvePostCoverVideo(post: {
  cover_video_url?: string | null;
}): string | null {
  const raw = typeof post?.cover_video_url === "string" ? post.cover_video_url.trim() : "";
  if (!raw || !isSafeBlogUrl(raw)) return null;
  return raw;
}

export function getBlogPostPath(post: { public_id?: string | number; slug?: string | null; id?: string }): string {
  if (post?.slug && typeof post.slug === "string" && post.slug.trim()) {
    return `/blog/${encodeURIComponent(post.slug.trim())}`;
  }
  if (post?.public_id) {
    return `/blog/post${post.public_id}`;
  }
  return `/blog/${encodeURIComponent(post?.id || "")}`;
}

function normalizeTelegramMediaItem(raw: any): TgMediaItem | null {
  if (!raw || typeof raw !== "object") return null;
  const type = raw.type === "video" ? "video" : "photo";
  const rawUrl = typeof raw.url === "string" ? raw.url.trim() : "";
  const url = rawUrl && isSafeBlogUrl(rawUrl)
    ? (rawUrl === OLD_DEFAULT_COVER_URL ? NEW_DEFAULT_COVER_URL : rawUrl)
    : undefined;
  const rawPoster = typeof raw.posterUrl === "string" ? raw.posterUrl.trim() : "";
  const posterUrl = rawPoster && isSafeBlogUrl(rawPoster)
    ? (rawPoster === OLD_DEFAULT_COVER_URL ? NEW_DEFAULT_COVER_URL : rawPoster)
    : undefined;
  const rawPostUrl = typeof raw.postUrl === "string" ? raw.postUrl.trim() : "";
  const postUrl = rawPostUrl && isSafeBlogUrl(rawPostUrl) ? rawPostUrl : undefined;

  if (!url && !posterUrl && !postUrl) return null;
  return {
    type,
    url,
    posterUrl,
    tooLarge: Boolean(raw.tooLarge),
    sizeMb: typeof raw.sizeMb === "number" ? raw.sizeMb : undefined,
    width: typeof raw.width === "number" ? raw.width : undefined,
    height: typeof raw.height === "number" ? raw.height : undefined,
    duration: typeof raw.duration === "number" ? raw.duration : undefined,
    postUrl,
  };
}

function findBalancedJsonEnd(source: string, openIdx: number): number {
  const openChar = source[openIdx];
  const closeChar = openChar === "{" ? "}" : openChar === "[" ? "]" : "";
  if (!closeChar) return -1;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = openIdx; i < source.length; i++) {
    const ch = source[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
    } else if (ch === "{" || ch === "[") {
      depth++;
    } else if (ch === "}" || ch === "]") {
      depth--;
      if (depth === 0) {
        return i;
      }
    }
  }
  return -1;
}

function cleanAdjacentMarkdownChunk(raw: string): string {
  if (!raw) return "";
  let s = raw.replace(/\r\n/g, "\n");
  if (s.includes(OLD_DEFAULT_COVER_URL)) {
    s = s.split(OLD_DEFAULT_COVER_URL).join(NEW_DEFAULT_COVER_URL);
  }
  // Separate Telegram inline dividers like ♦️♦️♦️♦️> Link or #tag> Оригинал into distinct lines
  s = s.replace(/([♦️🔹🔸▪️▫️]+)\s*>/g, "$1\n\n>");
  s = s.replace(/(#[а-яА-Яa-zA-Z0-9_]+)>\s*/g, "$1\n\n> ");
  return s;
}

const TG_FENCE_START_RE = /```(tg-video|tg-gallery|tg-buttons|tg-collapse)\b/;

export function tokenizeTelegramMarkdown(rawContent: string): BlogContentSegment[] {
  if (!rawContent) return [];
  const source = rawContent.replace(/\r\n/g, "\n");
  const segments: BlogContentSegment[] = [];
  let cursor = 0;

  while (cursor < source.length) {
    const remaining = source.slice(cursor);
    const match = TG_FENCE_START_RE.exec(remaining);
    if (!match) {
      const tail = cleanAdjacentMarkdownChunk(remaining);
      if (tail.trim()) segments.push({ kind: "markdown", markdown: tail });
      break;
    }

    const fenceStart = cursor + match.index;
    if (fenceStart > cursor) {
      const before = cleanAdjacentMarkdownChunk(source.slice(cursor, fenceStart));
      if (before.trim()) segments.push({ kind: "markdown", markdown: before });
    }

    const blockType = match[1] as "tg-video" | "tg-gallery" | "tg-buttons" | "tg-collapse";
    let jsonStart = fenceStart + match[0].length;
    while (jsonStart < source.length && /\s/.test(source[jsonStart])) {
      jsonStart++;
    }

    const jsonEnd = jsonStart < source.length ? findBalancedJsonEnd(source, jsonStart) : -1;
    if (jsonEnd === -1) {
      // Fallback: find next closing triple backticks
      const closeIdx = source.indexOf("```", fenceStart + match[0].length);
      if (closeIdx === -1) {
        const rest = cleanAdjacentMarkdownChunk(source.slice(fenceStart));
        if (rest.trim()) segments.push({ kind: "markdown", markdown: rest });
        break;
      }
      cursor = closeIdx + 3;
      continue;
    }

    const jsonRaw = source.slice(jsonStart, jsonEnd + 1);
    let afterEnd = jsonEnd + 1;
    while (afterEnd < source.length && /\s/.test(source[afterEnd])) {
      afterEnd++;
    }
    if (source.startsWith("```", afterEnd)) {
      afterEnd += 3;
    }

    try {
      const parsed = JSON.parse(jsonRaw);
      if (blockType === "tg-video") {
        const item = normalizeTelegramMediaItem({ ...parsed, type: "video" });
        if (item) segments.push({ kind: "tg-video", item });
      } else if (blockType === "tg-gallery" && Array.isArray(parsed)) {
        const items = parsed.map(normalizeTelegramMediaItem).filter((x): x is TgMediaItem => Boolean(x));
        if (items.length > 0) segments.push({ kind: "tg-gallery", items });
      } else if (blockType === "tg-buttons" && Array.isArray(parsed)) {
        const rows: TgButtonItem[][] = parsed
          .filter((r) => Array.isArray(r))
          .map((r) =>
            r
              .filter((b: any) => b && typeof b.text === "string" && typeof b.url === "string" && isSafeBlogUrl(b.url))
              .map((b: any) => ({ text: b.text.trim(), url: b.url.trim() }))
          )
          .filter((r) => r.length > 0);
        if (rows.length > 0) segments.push({ kind: "tg-buttons", rows });
      } else if (blockType === "tg-collapse" && parsed && typeof parsed === "object") {
        const md = typeof parsed.markdown === "string" ? cleanAdjacentMarkdownChunk(parsed.markdown) : "";
        if (md.trim()) {
          segments.push({
            kind: "tg-collapse",
            payload: {
              markdown: md,
              summary: typeof parsed.summary === "string" && parsed.summary.trim() ? parsed.summary.trim() : undefined,
              credit: typeof parsed.credit === "string" && parsed.credit.trim() ? parsed.credit.trim() : undefined,
              isOpen: Boolean(parsed.isOpen),
            },
          });
        }
      }
    } catch {
      // Ignore malformed telegram JSON block gracefully without crashing article render
    }

    cursor = afterEnd;
  }

  return segments;
}
