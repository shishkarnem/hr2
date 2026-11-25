import { getProTalkDB } from "../../db";
import { executeProTalkQuery, queryAllPg } from "../../db/protalkDb";
import { ensureBlogSchemaPg, OLD_DEFAULT_COVER_URL } from "./blogSchema";
import { parseSavRssXml, SavRssParsedItem } from "./savRssParser";

export const SAV_RSS_DOMAINS = [
  "https://savbot.ru",
  "https://sav-ai.ru",
  "https://aisav.ru",
  "https://ai-greenland.ru",
  "https://aisav.online",
] as const;

const RSS_FETCH_TIMEOUT_MS = 15000;
const SYNC_INTERVAL_MS = 10 * 60 * 1000;
const INITIAL_DELAY_MS = 10 * 1000;

let inFlightSyncPromise: Promise<SavRssSyncResult> | null = null;
let schedulerStarted = false;

export interface SavRssSyncResult {
  ok: boolean;
  added: number;
  updated: number;
  skipped: number;
  totalParsed: number;
  sourceDomain: string | null;
  sourceUrl: string | null;
  error?: string;
}

export async function fetchSavRssFeedWithFailover(options?: {
  limit?: number;
  category?: string;
  fetchImpl?: typeof fetch;
}): Promise<{ xmlText: string; sourceUrl: string; sourceDomain: string }> {
  const fetchFn = options?.fetchImpl || fetch;
  const rawLimit = Number(options?.limit ?? 100);
  const limit = Number.isFinite(rawLimit) ? Math.min(200, Math.max(1, Math.round(rawLimit))) : 100;

  const qs = new URLSearchParams();
  qs.set("limit", String(limit));
  if (options?.category && options.category.trim()) {
    qs.set("category", options.category.trim());
  }
  const query = `?${qs.toString()}`;

  const errors: string[] = [];

  for (const domain of SAV_RSS_DOMAINS) {
    for (const feedPath of ["/rss.xml", "/feed.xml"]) {
      const targetUrl = `${domain}${feedPath}${query}`;
      try {
        const res = await fetchFn(targetUrl, {
          method: "GET",
          headers: {
            Accept: "application/rss+xml, application/xml, text/xml;q=0.9",
            "Cache-Control": "no-cache",
          },
          signal: AbortSignal.timeout(RSS_FETCH_TIMEOUT_MS),
        });

        if (!res.ok) {
          errors.push(`${targetUrl} -> HTTP ${res.status}`);
          continue;
        }

        const xmlText = await res.text();
        if (!xmlText || (!xmlText.includes("<rss") && !xmlText.includes("<channel"))) {
          errors.push(`${targetUrl} -> invalid XML body`);
          continue;
        }

        return {
          xmlText,
          sourceUrl: targetUrl,
          sourceDomain: new URL(domain).hostname,
        };
      } catch (err: any) {
        errors.push(`${targetUrl} -> ${err?.message || "network error"}`);
      }
    }
  }

  throw new Error(`All SAV RSS sources failed: ${errors.join("; ")}`);
}

function generateUniquePublicId(usedPublicIds: Set<string>): number {
  for (let i = 0; i < 100; i++) {
    const candidate = Math.floor(700000 + Math.random() * 69000);
    const str = String(candidate);
    if (!usedPublicIds.has(str)) {
      usedPublicIds.add(str);
      return candidate;
    }
  }
  const fallback = 700000 + (Date.now() % 69000);
  usedPublicIds.add(String(fallback));
  return fallback;
}

function ensureUniqueSlug(baseSlug: string, usedSlugs: Set<string>, publicId: number | string, ownSlug?: string | null): string {
  const clean = baseSlug || `post${publicId}`;
  if (ownSlug && clean === ownSlug) return clean;
  if (!usedSlugs.has(clean)) {
    usedSlugs.add(clean);
    return clean;
  }
  const suffixed = `${clean}-${publicId}`;
  usedSlugs.add(suffixed);
  return suffixed;
}

export async function upsertParsedSavRssItems(items: SavRssParsedItem[]): Promise<{
  added: number;
  updated: number;
  skipped: number;
}> {
  if (items.length === 0) {
    return { added: 0, updated: 0, skipped: 0 };
  }

  await ensureBlogSchemaPg();

  const existingRows = await queryAllPg<{
    id: string;
    public_id: string | number | null;
    slug: string | null;
    external_id: string | null;
    external_updated_at: string | null;
    cover_url: string | null;
    cover_image_url: string | null;
    cover_video_url: string | null;
    rss_category: string | null;
  }>(
    `SELECT id, public_id, slug, external_id, external_updated_at, cover_url, cover_image_url, cover_video_url, rss_category
     FROM posts;`
  ).catch(async () => {
    const db = await getProTalkDB();
    return db.all(
      `SELECT id, public_id, slug, external_id, external_updated_at, cover_url, cover_image_url, cover_video_url, rss_category
       FROM posts`
    );
  });

  const byExternalId = new Map<string, (typeof existingRows)[number]>();
  const usedPublicIds = new Set<string>();
  const usedSlugs = new Set<string>();

  for (const row of existingRows) {
    if (row.external_id) byExternalId.set(String(row.external_id), row);
    if (row.public_id != null) usedPublicIds.add(String(row.public_id));
    if (row.slug) usedSlugs.add(String(row.slug).toLowerCase());
  }

  let added = 0;
  let updated = 0;
  let skipped = 0;

  for (const item of items) {
    const existing = byExternalId.get(item.externalId);
    const mediaJsonStr = JSON.stringify(item.mediaItems || []);
    const buttonsJsonStr = JSON.stringify(item.buttonsRows || []);

    if (existing) {
      const hasLegacyDefaultCover =
        existing.cover_url === OLD_DEFAULT_COVER_URL ||
        existing.cover_image_url === OLD_DEFAULT_COVER_URL;

      if (
        existing.external_updated_at === item.updatedAt &&
        !hasLegacyDefaultCover &&
        Boolean(existing.cover_image_url)
      ) {
        skipped++;
        continue;
      }

      const safeSlug = ensureUniqueSlug(
        item.slug,
        usedSlugs,
        existing.public_id || existing.id,
        existing.slug?.toLowerCase() || null
      );

      await executeProTalkQuery(
        `UPDATE posts
         SET title = $1,
             slug = $2,
             cover_url = $3,
             cover_image_url = $3,
             cover_video_url = $4,
             excerpt = $5,
             content_md = $6,
             rss_category = $7,
             source_url = $8,
             telegram_post_url = $9,
             media_json = $10,
             buttons_json = $11,
             author_name = $12,
             author_role = $13,
             read_time_minutes = $14,
             seo_title = $15,
             seo_description = $16,
             seo_keywords = $17,
             external_updated_at = $18,
             updated_at = $19
         WHERE external_id = $20;`,
        [
          item.title,
          safeSlug,
          item.coverImageUrl,
          item.coverVideoUrl,
          item.excerpt,
          item.contentMd,
          item.rssCategory,
          item.sourceUrl,
          item.telegramPostUrl,
          mediaJsonStr,
          buttonsJsonStr,
          item.authorName,
          item.authorRole,
          item.readTimeMinutes,
          item.seoTitle,
          item.seoDescription,
          item.seoKeywords,
          item.updatedAt,
          item.updatedAt,
          item.externalId,
        ]
      );
      updated++;
    } else {
      const id = `post-rss-${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-4)}`;
      const publicId = generateUniquePublicId(usedPublicIds);
      const safeSlug = ensureUniqueSlug(item.slug, usedSlugs, publicId, null);

      await executeProTalkQuery(
        `INSERT INTO posts (
           id, public_id, slug, title, cover_url, cover_image_url, cover_video_url,
           excerpt, content_md, is_published, category, rss_category,
           external_id, external_updated_at, source_url, telegram_post_url,
           media_json, buttons_json, author_name, author_role, read_time_minutes,
           seo_title, seo_description, seo_keywords, is_pinned, pinned_at,
           created_at, updated_at
         ) VALUES (
           $1, $2, $3, $4, $5, $5, $6,
           $7, $8, 1, 'blog', $9,
           $10, $11, $12, $13,
           $14, $15, $16, $17, $18,
           $19, $20, $21, 0, NULL,
           $22, $23
         )
         ON CONFLICT (external_id) WHERE external_id IS NOT NULL DO NOTHING;`,
        [
          id,
          publicId,
          safeSlug,
          item.title,
          item.coverImageUrl,
          item.coverVideoUrl,
          item.excerpt,
          item.contentMd,
          item.rssCategory,
          item.externalId,
          item.updatedAt,
          item.sourceUrl,
          item.telegramPostUrl,
          mediaJsonStr,
          buttonsJsonStr,
          item.authorName,
          item.authorRole,
          item.readTimeMinutes,
          item.seoTitle,
          item.seoDescription,
          item.seoKeywords,
          item.publishedAt,
          item.updatedAt,
        ]
      );
      added++;
    }
  }

  return { added, updated, skipped };
}

export async function syncSavRssFeed(options?: {
  limit?: number;
  category?: string;
}): Promise<SavRssSyncResult> {
  if (inFlightSyncPromise) {
    return inFlightSyncPromise;
  }

  inFlightSyncPromise = (async (): Promise<SavRssSyncResult> => {
    try {
      await ensureBlogSchemaPg();
      const { xmlText, sourceUrl, sourceDomain } = await fetchSavRssFeedWithFailover(options);
      const parsedItems = parseSavRssXml(xmlText);
      const stats = await upsertParsedSavRssItems(parsedItems);

      console.log(
        `[SAV RSS Sync] Completed from ${sourceDomain}: added=${stats.added}, updated=${stats.updated}, skipped=${stats.skipped} (parsed=${parsedItems.length})`
      );

      return {
        ok: true,
        added: stats.added,
        updated: stats.updated,
        skipped: stats.skipped,
        totalParsed: parsedItems.length,
        sourceDomain,
        sourceUrl,
      };
    } catch (err: any) {
      console.warn("[SAV RSS Sync] Error:", err?.message || err);
      return {
        ok: false,
        added: 0,
        updated: 0,
        skipped: 0,
        totalParsed: 0,
        sourceDomain: null,
        sourceUrl: null,
        error: err?.message || "RSS sync failed",
      };
    } finally {
      inFlightSyncPromise = null;
    }
  })();

  return inFlightSyncPromise;
}

export function initSavRssScheduler(): void {
  if (schedulerStarted) return;
  schedulerStarted = true;

  setTimeout(() => {
    syncSavRssFeed({ limit: 100 }).catch((err) => {
      console.warn("[SAV RSS Scheduler] Initial sync warning:", err?.message || err);
    });
  }, INITIAL_DELAY_MS);

  setInterval(() => {
    syncSavRssFeed({ limit: 100 }).catch((err) => {
      console.warn("[SAV RSS Scheduler] Periodic sync warning:", err?.message || err);
    });
  }, SYNC_INTERVAL_MS);

  console.log("[SAV RSS Scheduler] Initialized (initial run in 10s, interval every 10 minutes)");
}
