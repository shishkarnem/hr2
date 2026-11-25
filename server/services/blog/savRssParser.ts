import { XMLParser } from "fast-xml-parser";
import { transliterateToSlug } from "../../db/helpers";
import {
  OLD_DEFAULT_COVER_URL,
  NEW_DEFAULT_COVER_URL,
  isAllowedBlogUrl,
  isVideoMediaUrl,
  normalizeBlogCoverImageUrl,
} from "./blogSchema";

export interface SavRssMediaItem {
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

export interface SavRssButtonItem {
  text: string;
  url: string;
}

export interface SavRssParsedItem {
  externalId: string;
  slug: string;
  title: string;
  excerpt: string;
  contentMd: string;
  coverImageUrl: string;
  coverVideoUrl: string | null;
  sourceUrl: string | null;
  telegramPostUrl: string | null;
  rssCategory: string;
  authorName: string;
  authorRole: string;
  readTimeMinutes: number;
  seoTitle: string;
  seoDescription: string;
  seoKeywords: string;
  publishedAt: string;
  updatedAt: string;
  mediaItems: SavRssMediaItem[];
  buttonsRows: SavRssButtonItem[][];
}

function asArray<T>(val: T | T[] | undefined | null): T[] {
  if (val === undefined || val === null) return [];
  return Array.isArray(val) ? val : [val];
}

function extractText(val: any): string {
  if (val === undefined || val === null) return "";
  if (typeof val === "string") return val;
  if (typeof val === "number" || typeof val === "boolean") return String(val);
  if (Array.isArray(val)) {
    return val.map(extractText).filter(Boolean).join("\n");
  }
  if (typeof val === "object") {
    if (typeof val["#text"] === "string") return val["#text"];
    if (typeof val["__cdata"] === "string") return val["__cdata"];
  }
  return "";
}

function scalarText(val: any): string {
  return extractText(val).trim();
}

function detectSavPrefix(rssNode: Record<string, any> | undefined): string {
  if (!rssNode || typeof rssNode !== "object") return "sav";
  for (const [k, v] of Object.entries(rssNode)) {
    if (k.startsWith("@_xmlns:") && typeof v === "string" && v.includes("/ns/blog")) {
      return k.slice("@_xmlns:".length);
    }
  }
  return "sav";
}

function replaceOldDefaultUrlsInText(text: string): string {
  if (!text) return text;
  if (!text.includes(OLD_DEFAULT_COVER_URL)) return text;
  return text.split(OLD_DEFAULT_COVER_URL).join(NEW_DEFAULT_COVER_URL);
}

function parseIsoDateOrNow(raw: string, fallbackIso: string): string {
  if (!raw) return fallbackIso;
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) return fallbackIso;
  return new Date(ms).toISOString();
}

function stripHtmlToPlainText(html: string, maxLen = 240): string {
  if (!html) return "";
  const plain = html
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/[^\s)]+/gi, " ")
    .replace(/[*_~#`>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (plain.length <= maxLen) return plain;
  const cut = plain.slice(0, maxLen);
  const idx = cut.lastIndexOf(" ");
  return (idx > 60 ? cut.slice(0, idx) : cut).trimEnd() + "…";
}

function parseMediaJson(raw: string): SavRssMediaItem[] {
  if (!raw || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const items: SavRssMediaItem[] = [];
    for (const entry of parsed) {
      if (!entry || typeof entry !== "object") continue;
      const type = entry.type === "video" ? "video" : "photo";
      const rawUrl = typeof entry.url === "string" ? replaceOldDefaultUrlsInText(entry.url.trim()) : undefined;
      const rawPoster = typeof entry.posterUrl === "string" ? replaceOldDefaultUrlsInText(entry.posterUrl.trim()) : undefined;
      const safeUrl = rawUrl && isAllowedBlogUrl(rawUrl) ? rawUrl : undefined;
      const safePoster = rawPoster && isAllowedBlogUrl(rawPoster) ? rawPoster : undefined;
      const safePostUrl = typeof entry.postUrl === "string" && isAllowedBlogUrl(entry.postUrl) ? entry.postUrl.trim() : undefined;
      if (!safeUrl && !safePoster && !safePostUrl) continue;
      items.push({
        type,
        url: safeUrl,
        posterUrl: safePoster,
        tooLarge: Boolean(entry.tooLarge),
        sizeMb: typeof entry.sizeMb === "number" ? entry.sizeMb : undefined,
        width: typeof entry.width === "number" ? entry.width : undefined,
        height: typeof entry.height === "number" ? entry.height : undefined,
        duration: typeof entry.duration === "number" ? entry.duration : undefined,
        postUrl: safePostUrl,
      });
    }
    return items;
  } catch {
    return [];
  }
}

function parseButtonsJson(raw: string): SavRssButtonItem[][] {
  if (!raw || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const rows: SavRssButtonItem[][] = [];
    for (const row of parsed) {
      if (!Array.isArray(row)) continue;
      const cleanRow: SavRssButtonItem[] = [];
      for (const btn of row) {
        if (!btn || typeof btn !== "object") continue;
        const text = typeof btn.text === "string" ? btn.text.trim() : "";
        const url = typeof btn.url === "string" ? btn.url.trim() : "";
        if (text && url && isAllowedBlogUrl(url)) {
          cleanRow.push({ text, url });
        }
      }
      if (cleanRow.length > 0) rows.push(cleanRow);
    }
    return rows;
  } catch {
    return [];
  }
}

function extractSlugFromLink(link: string): string {
  if (!link) return "";
  try {
    const parsed = new URL(link);
    const parts = parsed.pathname.split("/").filter(Boolean);
    return parts[parts.length - 1] || "";
  } catch {
    const clean = link.split(/[?#]/)[0];
    const parts = clean.split("/").filter(Boolean);
    return parts[parts.length - 1] || "";
  }
}

function sanitizeSlug(raw: string): string {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function parseSavRssXml(xmlText: string): SavRssParsedItem[] {
  if (!xmlText || !xmlText.trim()) return [];

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    trimValues: false,
    parseTagValue: false,
    processEntities: true,
    cdataPropName: "__cdata",
  });

  const doc = parser.parse(xmlText);
  const rss = doc?.rss;
  const channel = rss?.channel || doc?.channel;
  if (!channel) return [];

  const savPrefix = detectSavPrefix(rss);
  const savTag = (name: string) => `${savPrefix}:${name}`;

  const rawItems = asArray<Record<string, any>>(channel.item);
  const parsedItems: SavRssParsedItem[] = [];

  for (const item of rawItems) {
    if (!item || typeof item !== "object") continue;

    const title = scalarText(item.title) || "Публикация SAV AI";
    const linkRaw = scalarText(item.link);
    const guidRaw = scalarText(item.guid);
    const sourceUrl = isAllowedBlogUrl(linkRaw) ? linkRaw : isAllowedBlogUrl(guidRaw) ? guidRaw : null;

    const savId = scalarText(item[savTag("id")]);
    const externalId = savId || guidRaw || linkRaw;
    if (!externalId) continue;

    const nowIso = new Date().toISOString();
    const publishedAt = parseIsoDateOrNow(
      scalarText(item[savTag("publishedAt")]) || scalarText(item.pubDate),
      nowIso
    );
    const updatedAt = parseIsoDateOrNow(
      scalarText(item[savTag("updatedAt")]) || scalarText(item["atom:updated"]) || scalarText(item.pubDate),
      publishedAt
    );

    const rawSlug =
      scalarText(item[savTag("slug")]) ||
      extractSlugFromLink(linkRaw) ||
      transliterateToSlug(title);
    const slug = sanitizeSlug(rawSlug) || transliterateToSlug(title) || `post-${Date.now()}`;

    const rssCategory =
      scalarText(item[savTag("category")]) ||
      scalarText(asArray(item.category)[0]) ||
      "ИИ и автоматизация";

    const authorName =
      scalarText(item[savTag("authorName")]) ||
      scalarText(item["dc:creator"]) ||
      scalarText(item.author) ||
      "SAV AI";

    const authorRole = scalarText(item[savTag("authorRole")]) || "Telegram @SAV_AI";

    const telegramPostRaw = scalarText(item[savTag("telegramPostUrl")]);
    const telegramPostUrl = isAllowedBlogUrl(telegramPostRaw) ? telegramPostRaw : null;

    const mediaRaw = extractText(item[savTag("mediaJson")]).trim();
    const mediaItems = parseMediaJson(mediaRaw);

    const buttonsRaw = extractText(item[savTag("buttonsJson")]).trim();
    const buttonsRows = parseButtonsJson(buttonsRaw);

    // Enclosures & media:* fallbacks
    const enclosures = asArray<Record<string, any>>(item.enclosure);
    const videoEnclosure = enclosures.find(
      (e) =>
        typeof e?.["@_type"] === "string" &&
        e["@_type"].toLowerCase().startsWith("video/") &&
        isAllowedBlogUrl(e?.["@_url"])
    );
    const imageEnclosure = enclosures.find(
      (e) =>
        typeof e?.["@_type"] === "string" &&
        e["@_type"].toLowerCase().startsWith("image/") &&
        isAllowedBlogUrl(e?.["@_url"])
    );

    const mediaThumbUrl = scalarText(item["media:thumbnail"]?.["@_url"]);
    const mediaContents = asArray<Record<string, any>>(item["media:content"]);
    const mediaContentImage = mediaContents.find(
      (mc) =>
        (mc?.["@_medium"] === "image" ||
          (typeof mc?.["@_type"] === "string" && mc["@_type"].toLowerCase().startsWith("image/"))) &&
        isAllowedBlogUrl(mc?.["@_url"])
    );

    // Resolve coverVideoUrl
    const savCoverVideo = scalarText(item[savTag("coverVideo")]);
    const firstPlayableMediaVideo = mediaItems.find((m) => m.type === "video" && !m.tooLarge && m.url);
    const rawCoverVideo =
      (savCoverVideo && isAllowedBlogUrl(savCoverVideo) ? savCoverVideo : null) ||
      (videoEnclosure?.["@_url"] ? String(videoEnclosure["@_url"]).trim() : null) ||
      firstPlayableMediaVideo?.url ||
      null;
    const coverVideoUrl = rawCoverVideo && isAllowedBlogUrl(rawCoverVideo) ? rawCoverVideo : null;

    // Resolve coverImageUrl (NEVER video, always replace OLD_DEFAULT_COVER_URL -> NEW_DEFAULT_COVER_URL)
    const savCoverImage = scalarText(item[savTag("coverImage")]);
    const firstMediaPhoto = mediaItems.find((m) => m.type === "photo" && m.url);
    const firstMediaPoster = mediaItems.find((m) => m.posterUrl);
    const candidateImages = [
      savCoverImage,
      imageEnclosure?.["@_url"],
      mediaThumbUrl,
      mediaContentImage?.["@_url"],
      firstMediaPhoto?.url,
      firstMediaPoster?.posterUrl,
    ];
    let resolvedCoverImage = NEW_DEFAULT_COVER_URL;
    for (const candidate of candidateImages) {
      if (!candidate || typeof candidate !== "string") continue;
      const trimmed = candidate.trim();
      if (!trimmed || trimmed === OLD_DEFAULT_COVER_URL || isVideoMediaUrl(trimmed)) continue;
      if (isAllowedBlogUrl(trimmed)) {
        resolvedCoverImage = trimmed;
        break;
      }
    }
    const coverImageUrl = normalizeBlogCoverImageUrl(resolvedCoverImage);

    // Preserve exact line breaks inside sav:contentMarkdown
    const rawContentMd = extractText(item[savTag("contentMarkdown")]);
    const fallbackContentHtml = extractText(item["content:encoded"]) || extractText(item.description);
    const contentMd = replaceOldDefaultUrlsInText(
      rawContentMd && rawContentMd.trim().length > 0 ? rawContentMd.replace(/^\r?\n+|\r?\n+$/g, "") : fallbackContentHtml
    );

    const rawDesc = scalarText(item.description) || scalarText(item[savTag("seoDescription")]);
    const excerpt = stripHtmlToPlainText(rawDesc || contentMd, 240);

    const parsedReadTime = Number.parseInt(scalarText(item[savTag("readTimeMinutes")]), 10);
    const wordCount = contentMd ? contentMd.replace(/```[\s\S]*?```/g, " ").trim().split(/\s+/).filter(Boolean).length : 0;
    const readTimeMinutes =
      Number.isFinite(parsedReadTime) && parsedReadTime > 0
        ? parsedReadTime
        : Math.max(1, Math.ceil(wordCount / 180));

    const seoTitle = scalarText(item[savTag("seoTitle")]) || title;
    const seoDescription = scalarText(item[savTag("seoDescription")]) || excerpt;
    const seoKeywords = scalarText(item[savTag("seoKeywords")]) || `${rssCategory}, ИИ, автоматизация, Робот Рекрутер`;

    parsedItems.push({
      externalId,
      slug,
      title,
      excerpt,
      contentMd,
      coverImageUrl,
      coverVideoUrl,
      sourceUrl,
      telegramPostUrl,
      rssCategory,
      authorName,
      authorRole,
      readTimeMinutes,
      seoTitle,
      seoDescription,
      seoKeywords,
      publishedAt,
      updatedAt,
      mediaItems,
      buttonsRows,
    });
  }

  return parsedItems;
}
