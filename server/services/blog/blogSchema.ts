import { executeProTalkQuery, queryGetPg } from "../../db/protalkDb";

export const OLD_DEFAULT_COVER_URL =
  "https://file.pro-talk.ru/tgf/GgMpJwQ9JCkYKglyGHQMJH0GOjgMOTE_BA9wETwiCzYmBQ95AyhoBSJLMhgZEyQdKwssKyoEUnQKdGsEfDonABIYETY4NRQmEV9uZlUAaA11VQJrCjgDAzkkAVczLRouDiMXfQxTNBdFGT8aIyw2ZyIcIQsIKjIuHhtsBXZSBGZ5T3FP.png";

export const NEW_DEFAULT_COVER_URL =
  "https://file.pro-talk.ru/tgf/GTUpJwQ9JCkYKglyGHQMIlsGO04KNgwaLzU1Cx8YNSsQAT5gdCtKGAEJfEgZEyI8Ag0eCgoBGFEKAgMqXRAcPTRLCjkpNQQeLA8YFgdnGHEWMGMtN05yTm9kWVx2bl1SGBMkTzhDL1JEJjw_EgstGT0CNywaIC0xBGA3AAwZVgAuOy4GJH9dVHVpW19rZFYD.jpg";

export const MAX_PINNED_POSTS = 10;

let schemaReadyPromise: Promise<void> | null = null;

export function isVideoMediaUrl(url?: string | null): boolean {
  if (!url || typeof url !== "string") return false;
  const clean = url.split(/[?#]/)[0].trim().toLowerCase();
  return /\.(mp4|webm|mov|m4v|ogg)$/.test(clean);
}

export function isAllowedBlogUrl(rawUrl?: string | null): boolean {
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

export function normalizeBlogCoverImageUrl(rawUrl?: string | null): string {
  const trimmed = typeof rawUrl === "string" ? rawUrl.trim() : "";
  if (!trimmed || trimmed === OLD_DEFAULT_COVER_URL || isVideoMediaUrl(trimmed)) {
    return NEW_DEFAULT_COVER_URL;
  }
  if (!isAllowedBlogUrl(trimmed)) {
    return NEW_DEFAULT_COVER_URL;
  }
  return trimmed;
}

export async function ensureBlogSchemaPg(force = false): Promise<void> {
  if (schemaReadyPromise && !force) {
    return schemaReadyPromise;
  }

  schemaReadyPromise = (async () => {
    try {
      await executeProTalkQuery(`
        ALTER TABLE IF EXISTS posts
          ADD COLUMN IF NOT EXISTS external_id TEXT,
          ADD COLUMN IF NOT EXISTS external_updated_at TEXT,
          ADD COLUMN IF NOT EXISTS cover_image_url TEXT,
          ADD COLUMN IF NOT EXISTS cover_video_url TEXT,
          ADD COLUMN IF NOT EXISTS source_url TEXT,
          ADD COLUMN IF NOT EXISTS telegram_post_url TEXT,
          ADD COLUMN IF NOT EXISTS media_json TEXT,
          ADD COLUMN IF NOT EXISTS buttons_json TEXT,
          ADD COLUMN IF NOT EXISTS author_name TEXT,
          ADD COLUMN IF NOT EXISTS author_role TEXT,
          ADD COLUMN IF NOT EXISTS read_time_minutes INTEGER,
          ADD COLUMN IF NOT EXISTS rss_category TEXT,
          ADD COLUMN IF NOT EXISTS seo_title TEXT,
          ADD COLUMN IF NOT EXISTS seo_description TEXT,
          ADD COLUMN IF NOT EXISTS seo_keywords TEXT,
          ADD COLUMN IF NOT EXISTS is_pinned INTEGER DEFAULT 0,
          ADD COLUMN IF NOT EXISTS pinned_at TEXT;
      `);

      await executeProTalkQuery(`
        CREATE UNIQUE INDEX IF NOT EXISTS uq_posts_external_id
        ON posts (external_id)
        WHERE external_id IS NOT NULL;
      `);

      await executeProTalkQuery(`
        CREATE INDEX IF NOT EXISTS idx_posts_pin_created
        ON posts (COALESCE(is_pinned, 0) DESC, pinned_at DESC NULLS LAST, created_at DESC);
      `);

      // Backfill old default cover PNG to the new branded cover JPG
      await executeProTalkQuery(
        `UPDATE posts
         SET cover_url = $1,
             cover_image_url = $1
         WHERE cover_url = $2 OR cover_image_url = $2;`,
        [NEW_DEFAULT_COVER_URL, OLD_DEFAULT_COVER_URL]
      );

      // Ensure non-empty cover_image_url for existing blog posts with image cover_url
      await executeProTalkQuery(
        `UPDATE posts
         SET cover_image_url = cover_url
         WHERE (cover_image_url IS NULL OR TRIM(cover_image_url) = '')
           AND cover_url IS NOT NULL
           AND TRIM(cover_url) != ''
           AND cover_url !~* '\\.(mp4|webm|mov|m4v|ogg)([?#].*)?$';`
      );
    } catch (err: any) {
      schemaReadyPromise = null;
      console.warn("[BlogSchema] Migration notice:", err?.message || err);
    }
  })();

  return schemaReadyPromise;
}

export async function getPinnedBlogPostsCountPg(): Promise<number> {
  const row = await queryGetPg<{ cnt: string | number }>(
    `SELECT COUNT(*) AS cnt
     FROM posts
     WHERE COALESCE(is_pinned, 0) = 1
       AND (category IS NULL OR category = 'blog' OR category = '');`
  );
  return Number(row?.cnt || 0);
}
