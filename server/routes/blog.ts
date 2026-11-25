import { Router, Request, Response } from "express";
import path from "path";
import fs from "fs";
import { getProTalkDB } from "../db";
import { transliterateToSlug } from "../common";
import { ACADEMY_SECTIONS } from "../../src/lib/academyContent";
import { executeProTalkQuery, queryAllPg, queryGetPg } from "../db/protalkDb";
import { employerSessions, resolveEmployerByToken } from "./auth/helpers";
import {
  ensureBlogSchemaPg,
  getPinnedBlogPostsCountPg,
  isAllowedBlogUrl,
  MAX_PINNED_POSTS,
  normalizeBlogCoverImageUrl,
} from "../services/blog/blogSchema";
import { syncSavRssFeed } from "../services/blog/savRssSync";

export async function ensureAcademyPostsSeeded(dbInstance: any) {
  try {
    for (const sec of ACADEMY_SECTIONS) {
      const existing = await dbInstance.get(
        "SELECT id, content_md FROM posts WHERE id = ? OR public_id = ? OR slug = ? LIMIT 1",
        [sec.id, sec.publicId, sec.slug]
      );
      if (!existing) {
        await dbInstance.run(
          `INSERT INTO posts (id, public_id, slug, title, cover_url, excerpt, content_md, is_published, category, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 1, 'academy', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
          [sec.id, sec.publicId, sec.slug, sec.title, "/files/13/rr-logo.png", sec.excerpt, sec.content_md]
        );
      }
    }
  } catch (err: any) {
    console.warn("[Academy] Seed notice:", err.message);
  }
}

export function cleanArticleExcerptServer(text: string, maxLength = 220): string {
  if (!text) return "";
  let s = String(text);

  s = s.replace(/:::(?:carousel|frame|button)[\s\S]*?:::/gi, " ");
  s = s.replace(/```tg-(?:video|gallery|buttons|collapse)[\s\S]*?```/gi, " ");
  s = s.replace(/<iframe[\s\S]*?<\/iframe>/gi, " ");
  s = s.replace(/<[^>]+>/g, " ");
  s = s.replace(/!\[[^\]]*\]\([^)]*\)/g, " ");
  s = s.replace(/![^\s]*https?:\/\/[^\s]+/gi, " ");
  s = s.replace(/!\[[^\]]*\]/g, " ");
  s = s.replace(/https?:\/\/[^\s)]+/gi, " ");
  s = s.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
  s = s.replace(/^\s*\|.*?\|\s*$/gm, " ");
  s = s.replace(/\|/g, " ");
  s = s.replace(/```[\s\S]*?```/g, " ");
  s = s.replace(/`([^`]+)`/g, "$1");
  s = s.replace(/^#{1,6}\s+/gm, " ");
  s = s.replace(/^>\s?/gm, " ");
  s = s.replace(/^\s*[-+*]\s+/gm, " ");
  s = s.replace(/^\s*\d+\.\s+/gm, " ");
  s = s.replace(/[*_~#]/g, "");
  s = s.replace(/\s+/g, " ").trim();

  if (s.length > maxLength) {
    const truncated = s.slice(0, maxLength);
    const lastSpace = truncated.lastIndexOf(" ");
    return (lastSpace > 50 ? truncated.slice(0, lastSpace) : truncated).trimEnd() + "…";
  }
  return s;
}

function parseBoolFlag(val: any): boolean {
  return Boolean(val && val !== "0" && val !== 0 && val !== "false");
}

function normalizePostRow(row: any) {
  if (!row) return row;
  const isAcademy = row.category === "academy" || Number(row.public_id) >= 770001;
  const rawImg = row.cover_image_url || row.cover_url;
  const coverImage = isAcademy
    ? rawImg || "/files/13/rr-logo.png"
    : normalizeBlogCoverImageUrl(rawImg);
  const coverVideo =
    row.cover_video_url && isAllowedBlogUrl(row.cover_video_url) ? String(row.cover_video_url).trim() : null;

  return {
    ...row,
    cover_url: coverImage,
    cover_image_url: coverImage,
    cover_video_url: coverVideo,
    is_published: parseBoolFlag(row.is_published),
    is_pinned: parseBoolFlag(row.is_pinned),
  };
}

function isAdminEmployerRecord(emp: any): boolean {
  if (!emp || typeof emp !== "object") return false;
  const role = String(emp.role || "").trim().toLowerCase();
  return [
    "admin",
    "super_admin",
    "super-admin",
    "superadmin",
    "админ",
    "супер-админ",
    "суперадмин",
  ].includes(role);
}

async function verifyAdminRequest(req: Request): Promise<{ ok: true; admin: any } | { ok: false; status: number; error: string }> {
  const authHeader = (req.headers.authorization || req.headers["x-employer-token"] || "") as string;
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return { ok: false, status: 401, error: "Требуется авторизация администратора" };
  }

  const db = await getProTalkDB();
  let emp: any = null;

  if (employerSessions[token]) {
    emp = employerSessions[token];
  }
  if (!emp) {
    emp = await resolveEmployerByToken(db, token);
  }
  if (!emp && token.startsWith("emp_token_")) {
    const rawId = token.slice("emp_token_".length).trim();
    if (rawId) {
      const cleanPid = rawId.replace(/^emp-?/i, "").trim();
      emp = await db
        .get(
          "SELECT id, public_id, email, contact_email, name, role FROM employers WHERE id = ? OR CAST(public_id AS TEXT) = ? LIMIT 1",
          [rawId, cleanPid]
        )
        .catch(() => null);
    }
  }

  if (!emp) {
    return { ok: false, status: 401, error: "Сессия администратора не найдена или истекла" };
  }
  if (!isAdminEmployerRecord(emp)) {
    return { ok: false, status: 403, error: "Доступ разрешён только администратору" };
  }
  return { ok: true, admin: emp };
}

export const blogRouter = Router();

blogRouter.get("/posts", async (req: Request, res: Response) => {
  try {
    await ensureBlogSchemaPg();

    const all = req.query.all === "true";
    const paginated = req.query.paginated === "1" || req.query.paginated === "true";
    const category = req.query.category as string | undefined;
    const rssCategory = typeof req.query.rss_category === "string" ? req.query.rss_category.trim() : "";
    const search = typeof (req.query.q || req.query.search) === "string" ? String(req.query.q || req.query.search).trim() : "";

    const rawLimit = req.query.limit !== undefined ? Number(req.query.limit) : undefined;
    const rawOffset = req.query.offset !== undefined ? Number(req.query.offset) : 0;
    const safeLimit =
      rawLimit !== undefined && Number.isFinite(rawLimit) && rawLimit > 0
        ? Math.min(200, Math.round(rawLimit))
        : paginated
        ? 20
        : undefined;
    const safeOffset = Number.isFinite(rawOffset) && rawOffset >= 0 ? Math.round(rawOffset) : 0;

    if (category === "academy") {
      const academyWhere = all
        ? "WHERE (category = 'academy' OR CAST(public_id AS BIGINT) >= 770001)"
        : "WHERE (category = 'academy' OR CAST(public_id AS BIGINT) >= 770001) AND (is_published = 1 OR CAST(is_published AS TEXT) = '1' OR CAST(is_published AS TEXT) = 'true')";
      const baseOrder = "ORDER BY CAST(public_id AS BIGINT) ASC, created_at ASC";

      if (paginated) {
        const pageLimit = Math.min(50, safeLimit || 20);
        const [cntRow, rows] = await Promise.all([
          queryGetPg<{ cnt: string | number }>(`SELECT COUNT(*) AS cnt FROM posts ${academyWhere}`),
          queryAllPg(`SELECT * FROM posts ${academyWhere} ${baseOrder} LIMIT $1 OFFSET $2`, [pageLimit, safeOffset]),
        ]);
        const total = Number(cntRow?.cnt || 0);
        return res.json({
          items: (rows || []).map(normalizePostRow),
          total,
          hasMore: safeOffset + (rows?.length || 0) < total,
        });
      }

      const sql = `SELECT * FROM posts ${academyWhere} ${baseOrder}`;
      const rows = await queryAllPg(sql).catch(async () => {
        const db = await getProTalkDB();
        await ensureAcademyPostsSeeded(db);
        return db.all(sql);
      });
      return res.json((rows || []).map(normalizePostRow));
    }

    const whereClauses: string[] = [];
    const params: any[] = [];

    if (category === "all" || (all && !category)) {
      // Admin all posts view
    } else {
      whereClauses.push("(category IS NULL OR category = 'blog' OR category = '')");
    }

    if (!all) {
      whereClauses.push("(is_published = 1 OR CAST(is_published AS TEXT) = '1' OR CAST(is_published AS TEXT) = 'true')");
    }

    if (rssCategory && rssCategory.toLowerCase() !== "all") {
      params.push(rssCategory);
      whereClauses.push(`LOWER(COALESCE(rss_category, '')) = LOWER($${params.length})`);
    }

    if (search) {
      params.push(`%${search}%`);
      const pIdx = params.length;
      whereClauses.push(
        `(title ILIKE $${pIdx} OR COALESCE(excerpt, '') ILIKE $${pIdx} OR COALESCE(content_md, '') ILIKE $${pIdx} OR COALESCE(rss_category, '') ILIKE $${pIdx})`
      );
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";
    const orderSql = `ORDER BY COALESCE(is_pinned, 0) DESC, pinned_at DESC NULLS LAST, created_at DESC`;

    if (paginated) {
      const countSql = `SELECT COUNT(*) AS cnt FROM posts ${whereSql}`;
      const countRow = await queryGetPg<{ cnt: string | number }>(countSql, params);
      const total = Number(countRow?.cnt || 0);

      const pageLimit = Math.min(50, safeLimit || 20);
      const dataParams = [...params, pageLimit, safeOffset];
      const itemsSql = `SELECT * FROM posts ${whereSql} ${orderSql} LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`;
      const rows = await queryAllPg(itemsSql, dataParams);

      const catRows = await queryAllPg<{ rss_category: string }>(
        `SELECT DISTINCT rss_category
         FROM posts
         WHERE (category IS NULL OR category = 'blog' OR category = '')
           AND (is_published = 1 OR CAST(is_published AS TEXT) = '1' OR CAST(is_published AS TEXT) = 'true')
           AND rss_category IS NOT NULL
           AND TRIM(rss_category) != ''
         ORDER BY rss_category ASC;`
      ).catch(() => []);

      const [pinnedCount, acadCntRow] = await Promise.all([
        getPinnedBlogPostsCountPg().catch(() => 0),
        all
          ? queryGetPg<{ cnt: string | number }>(
              `SELECT COUNT(*) AS cnt FROM posts WHERE category = 'academy' OR CAST(public_id AS BIGINT) >= 770001`
            ).catch(() => null)
          : Promise.resolve(null),
      ]);

      return res.json({
        items: (rows || []).map(normalizePostRow),
        total,
        hasMore: safeOffset + (rows?.length || 0) < total,
        categories: (catRows || []).map((c) => c.rss_category),
        pinnedCount,
        academyTotal: acadCntRow ? Number(acadCntRow.cnt || 0) : undefined,
      });
    }

    let limitSql = "";
    const queryParams = [...params];
    if (safeLimit) {
      queryParams.push(safeLimit, safeOffset);
      limitSql = ` LIMIT $${queryParams.length - 1} OFFSET $${queryParams.length}`;
    }

    const fullSql = `SELECT * FROM posts ${whereSql} ${orderSql}${limitSql}`;
    try {
      const pgRes = await executeProTalkQuery(fullSql, queryParams);
      if (pgRes.rows) {
        return res.json(pgRes.rows.map(normalizePostRow));
      }
    } catch (pgErr) {
      console.warn("[Blog PG query notice]:", pgErr);
    }

    const dbInstance = await getProTalkDB();
    if (category === "all" || !category) {
      await ensureAcademyPostsSeeded(dbInstance);
    }
    const rows = (await dbInstance.all(fullSql, queryParams)) || [];
    return res.json(rows.map(normalizePostRow));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

blogRouter.get(["/academy", "/academy/posts"], async (_req: Request, res: Response) => {
  try {
    try {
      const pgRes = await executeProTalkQuery(
        "SELECT * FROM posts WHERE category = 'academy' OR CAST(public_id AS BIGINT) >= 770001 ORDER BY CAST(public_id AS BIGINT) ASC, created_at ASC"
      );
      if (pgRes.rows && pgRes.rows.length > 0) {
        return res.json(pgRes.rows.map(normalizePostRow));
      }
    } catch {}

    const dbInstance = await getProTalkDB();
    await ensureAcademyPostsSeeded(dbInstance);
    const rows =
      (await dbInstance.all(
        "SELECT * FROM posts WHERE category = 'academy' OR CAST(public_id AS BIGINT) >= 770001 ORDER BY CAST(public_id AS BIGINT) ASC, created_at ASC"
      )) || [];
    res.json(rows.map(normalizePostRow));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

blogRouter.get("/posts/:identifier", async (req: Request, res: Response) => {
  try {
    await ensureBlogSchemaPg();
    const rawIdentifier = String(req.params.identifier || "").trim();
    const strippedPostPrefix = /^post\d+$/i.test(rawIdentifier)
      ? rawIdentifier.replace(/^post/i, "")
      : rawIdentifier;

    try {
      const pgRes = await executeProTalkQuery(
        `SELECT * FROM posts
         WHERE CAST(public_id AS TEXT) = $1
            OR id = $1
            OR slug = $1
            OR CAST(public_id AS TEXT) = $2
         LIMIT 1`,
        [rawIdentifier, strippedPostPrefix]
      );
      if (pgRes.rows && pgRes.rows.length > 0) {
        return res.json(normalizePostRow(pgRes.rows[0]));
      }
    } catch {}

    const dbInstance = await getProTalkDB();
    let post = await dbInstance.get(
      "SELECT * FROM posts WHERE CAST(public_id AS TEXT) = ? OR id = ? OR slug = ? OR CAST(public_id AS TEXT) = ?",
      [rawIdentifier, rawIdentifier, rawIdentifier, strippedPostPrefix]
    );
    if (!post) {
      await ensureAcademyPostsSeeded(dbInstance);
      post = await dbInstance.get(
        "SELECT * FROM posts WHERE CAST(public_id AS TEXT) = ? OR id = ? OR slug = ? OR CAST(public_id AS TEXT) = ?",
        [rawIdentifier, rawIdentifier, rawIdentifier, strippedPostPrefix]
      );
    }
    if (!post) return res.status(404).json({ error: "Post not found" });
    res.json(normalizePostRow(post));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

blogRouter.post("/posts/:id/pin", async (req: Request, res: Response) => {
  try {
    const auth = await verifyAdminRequest(req);
    if (!auth.ok) {
      return res.status(auth.status).json({ error: auth.error });
    }

    await ensureBlogSchemaPg();
    const { id } = req.params;
    const target = await queryGetPg<any>(
      `SELECT * FROM posts WHERE id = $1 OR CAST(public_id AS TEXT) = $1 LIMIT 1`,
      [id]
    );
    if (!target) {
      return res.status(404).json({ error: "Статья не найдена" });
    }
    if (target.category === "academy" || Number(target.public_id) >= 770001) {
      return res.status(400).json({ error: "Закрепление доступно только для статей блога" });
    }

    const currentlyPinned = parseBoolFlag(target.is_pinned);
    const desiredPinned = typeof req.body?.pinned === "boolean" ? req.body.pinned : !currentlyPinned;

    if (desiredPinned && !currentlyPinned) {
      const pinnedCount = await getPinnedBlogPostsCountPg();
      if (pinnedCount >= MAX_PINNED_POSTS) {
        return res.status(400).json({
          error: `Можно закрепить не более ${MAX_PINNED_POSTS} статей. Сначала открепите одну из закреплённых публикаций.`,
          pinnedCount,
          maxPinned: MAX_PINNED_POSTS,
        });
      }
    }

    const nextPinnedInt = desiredPinned ? 1 : 0;
    const nextPinnedAt = desiredPinned ? new Date().toISOString() : null;

    await executeProTalkQuery(
      `UPDATE posts SET is_pinned = $1, pinned_at = $2 WHERE id = $3`,
      [nextPinnedInt, nextPinnedAt, target.id]
    );

    const updated = await queryGetPg<any>(`SELECT * FROM posts WHERE id = $1 LIMIT 1`, [target.id]);
    const pinnedCount = await getPinnedBlogPostsCountPg();

    return res.json({
      success: true,
      post: normalizePostRow(updated),
      pinnedCount,
      maxPinned: MAX_PINNED_POSTS,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

blogRouter.post("/blog/sync-rss", async (req: Request, res: Response) => {
  try {
    const auth = await verifyAdminRequest(req);
    if (!auth.ok) {
      return res.status(auth.status).json({ error: auth.error });
    }

    const result = await syncSavRssFeed({
      limit: req.body?.limit !== undefined ? Number(req.body.limit) : 100,
      category: typeof req.body?.category === "string" ? req.body.category : undefined,
    });

    if (!result.ok) {
      return res.status(502).json({ success: false, ...result });
    }

    return res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

blogRouter.post("/posts", async (req: Request, res: Response) => {
  try {
    await ensureBlogSchemaPg();
    const dbInstance = await getProTalkDB();
    const { title, cover_url, excerpt, content_md, is_published, category, rss_category } = req.body;
    const id = "post-" + Math.random().toString(36).substring(2, 9);
    const public_id = Math.floor(700000 + Math.random() * 69000);
    const slug = transliterateToSlug(title || "") || `post${public_id}`;
    const cleanExcerpt = cleanArticleExcerptServer(excerpt || content_md || "", 240);
    const created_at = new Date().toISOString();
    const updated_at = created_at;
    const pubInt = is_published ? 1 : 0;
    const postCat = category || "blog";
    const normalizedCover =
      postCat === "academy"
        ? cover_url || "/files/13/rr-logo.png"
        : normalizeBlogCoverImageUrl(cover_url);

    await dbInstance.run(
      `INSERT INTO posts (id, public_id, slug, title, cover_url, cover_image_url, excerpt, content_md, is_published, category, rss_category, is_pinned, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      [id, public_id, slug, title || "", normalizedCover, normalizedCover, cleanExcerpt, content_md || "", pubInt, postCat, rss_category || null, created_at, updated_at]
    );

    const created = await dbInstance.get("SELECT * FROM posts WHERE id = ?", [id]);
    res.json(normalizePostRow(created));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

blogRouter.put("/posts/:id", async (req: Request, res: Response) => {
  try {
    await ensureBlogSchemaPg();
    const dbInstance = await getProTalkDB();
    const { id } = req.params;
    const { title, cover_url, excerpt, content_md, is_published, category, rss_category } = req.body;
    const updated_at = new Date().toISOString();
    const pubInt = is_published !== undefined ? (is_published ? 1 : 0) : 1;
    const slug = req.body.slug || transliterateToSlug(title || "");
    const cleanExcerpt = cleanArticleExcerptServer(excerpt || content_md || "", 240);

    const existing = await dbInstance.get("SELECT category, public_id FROM posts WHERE id = ? OR CAST(public_id AS TEXT) = ? LIMIT 1", [id, id]);
    const effectiveCategory = category || existing?.category || "blog";
    const normalizedCover =
      effectiveCategory === "academy" || Number(existing?.public_id) >= 770001
        ? cover_url || "/files/13/rr-logo.png"
        : normalizeBlogCoverImageUrl(cover_url);

    await dbInstance.run(
      `UPDATE posts
       SET title = ?,
           slug = CASE WHEN ? != '' THEN ? ELSE slug END,
           cover_url = ?,
           cover_image_url = ?,
           excerpt = ?,
           content_md = ?,
           is_published = ?,
           category = COALESCE(?, category),
           rss_category = COALESCE(?, rss_category),
           updated_at = ?
       WHERE id = ? OR CAST(public_id AS TEXT) = ?`,
      [title || "", slug, slug, normalizedCover, normalizedCover, cleanExcerpt, content_md || "", pubInt, category || null, rss_category || null, updated_at, id, id]
    );

    const updated = await dbInstance.get("SELECT * FROM posts WHERE id = ? OR CAST(public_id AS TEXT) = ?", [id, id]);
    res.json(normalizePostRow(updated));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

blogRouter.delete("/posts/:id", async (req: Request, res: Response) => {
  try {
    const dbInstance = await getProTalkDB();
    const { id } = req.params;
    await dbInstance.run("DELETE FROM posts WHERE id = ? OR CAST(public_id AS TEXT) = ?", [id, id]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

blogRouter.post("/posts/upload-cover", async (req: Request, res: Response) => {
  try {
    const { dataUrl, fileName, userId } = req.body;
    if (!dataUrl) return res.status(400).json({ error: "dataUrl required" });
    const matches = dataUrl.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      return res.status(400).json({ error: "Invalid base64 data" });
    }
    const mimeType = matches[1];
    const buffer = Buffer.from(matches[2], "base64");

    const raw = fileName || "post_image.png";
    const lastDot = raw.lastIndexOf('.');
    const ext = lastDot > 0 ? raw.substring(lastDot + 1).toLowerCase() : (mimeType.includes("png") ? "png" : mimeType.includes("gif") ? "gif" : mimeType.includes("svg") ? "svg" : "jpg");
    const rawBase = lastDot > 0 ? raw.substring(0, lastDot) : raw;

    const ruMap: Record<string, string> = {
      'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo', 'ж': 'zh',
      'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o',
      'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'kh', 'ц': 'ts',
      'ч': 'ch', 'ш': 'sh', 'щ': 'shch', 'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya'
    };

    const cleanBase = rawBase
      .toLowerCase()
      .split('')
      .map((c: string) => ruMap[c] || c)
      .join('')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'file';

    const userDigits = String(userId || '').replace(/\D/g, '') || '856459';
    const cleanUser = userDigits.length >= 6 ? userDigits.slice(-6) : userDigits.padStart(6, '0');

    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const timestamp = `${now.getFullYear()}_${pad(now.getMonth() + 1)}_${pad(now.getDate())}_${pad(now.getHours())}_${pad(now.getMinutes())}_${pad(now.getSeconds())}`;

    const name = `${cleanBase}_${cleanUser}_${timestamp}.${ext}`;
    const protalkToken = process.env.PROTALK_UPLOAD_TOKEN || "YGteXX1vXVluYlh3GHAXLVsoEzcRMC49MCcdHwESNBEMUh5fKCIfNHINdUo1AxQYaGtdWGtjUgVvAH9YAmk";

    try {
      const formData = new FormData();
      const blob = new Blob([buffer], { type: mimeType });
      formData.append("file", blob, name);

      const pRes = await fetch("https://file.pro-talk.ru/tgf", {
        method: "POST",
        headers: {
          "X-Upload-Token": protalkToken,
          "X-Preserve-Alpha": "true",
        },
        body: formData,
      });

      if (pRes.ok) {
        const txt = await pRes.text();
        let pUrl = "";
        try {
          const j = JSON.parse(txt);
          if (j && j.url) pUrl = j.url;
        } catch {
          if (txt.startsWith("http")) pUrl = txt.trim();
        }

        if (pUrl) {
          return res.json({ url: pUrl, key: Math.random().toString(36).substring(2, 10) });
        }
      }

      const pRes2 = await fetch("https://filestore.pro-talk.ru/up", {
        method: "POST",
        headers: {
          "X-Upload-Token": protalkToken,
          "X-Preserve-Alpha": "true",
        },
        body: formData,
      });

      if (pRes2.ok) {
        const txt2 = await pRes2.text();
        let pUrl2 = "";
        try {
          const j2 = JSON.parse(txt2);
          if (j2 && j2.url) pUrl2 = j2.url;
        } catch {
          if (txt2.startsWith("http")) pUrl2 = txt2.trim();
        }

        if (pUrl2) {
          return res.json({ url: pUrl2, key: Math.random().toString(36).substring(2, 10) });
        }
      }
    } catch (pErr) {
      console.warn("[ProTalk Upload Warning] Remote upload error, falling back to local file:", pErr);
    }

    const targetDir = path.join(process.cwd(), "public", "posts");
    if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(path.join(targetDir, name), buffer);

    const host = req.headers.host || "hh-rr.ru";
    const protocol = req.headers["x-forwarded-proto"] || "https";
    const fullUrl = `${protocol}://${host}/posts/${name}`;
    res.json({ url: fullUrl });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

blogRouter.get("/posts/:id/comments", async (req: Request, res: Response) => {
  try {
    const dbInstance = await getProTalkDB();
    const { id } = req.params;
    const rows = await dbInstance.all("SELECT * FROM post_comments WHERE post_id = ? ORDER BY created_at ASC", [id]);
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

blogRouter.post("/posts/:id/comments", async (req: Request, res: Response) => {
  try {
    const dbInstance = await getProTalkDB();
    const { id } = req.params;
    const { body, user_id, parent_id } = req.body;
    const commentId = "cmt-" + Math.random().toString(36).substring(2, 9);
    const created_at = new Date().toISOString();
    await dbInstance.run(
      "INSERT INTO post_comments (id, post_id, parent_id, user_id, body, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      [commentId, id, parent_id || null, user_id || "guest", body || "", created_at]
    );
    const created = await dbInstance.get("SELECT * FROM post_comments WHERE id = ?", [commentId]);
    res.json(created);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

blogRouter.delete("/comments/:id", async (req: Request, res: Response) => {
  try {
    const dbInstance = await getProTalkDB();
    const { id } = req.params;
    await dbInstance.run("DELETE FROM post_comments WHERE id = ?", [id]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

blogRouter.get("/posts/:id/reactions", async (req: Request, res: Response) => {
  try {
    const dbInstance = await getProTalkDB();
    const { id } = req.params;
    const rows = await dbInstance.all("SELECT * FROM post_reactions WHERE post_id = ?", [id]);
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

blogRouter.post("/posts/:id/reactions", async (req: Request, res: Response) => {
  try {
    const dbInstance = await getProTalkDB();
    const { id } = req.params;
    const { kind, user_id, comment_id } = req.body;
    const u = user_id || "guest";
    
    let existing;
    if (comment_id) {
      existing = await dbInstance.get("SELECT * FROM post_reactions WHERE comment_id = ? AND user_id = ? AND kind = ?", [comment_id, u, kind]);
    } else {
      existing = await dbInstance.get("SELECT * FROM post_reactions WHERE post_id = ? AND user_id = ? AND kind = ?", [id, u, kind]);
    }

    if (existing) {
      await dbInstance.run("DELETE FROM post_reactions WHERE id = ?", [existing.id]);
      res.json({ action: "removed" });
    } else {
      const rid = "react-" + Math.random().toString(36).substring(2, 9);
      await dbInstance.run(
        "INSERT INTO post_reactions (id, post_id, comment_id, user_id, kind) VALUES (?, ?, ?, ?, ?)",
        [rid, comment_id ? null : id, comment_id || null, u, kind]
      );
      res.json({ action: "added" });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
