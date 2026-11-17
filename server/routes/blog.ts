import { Router, Request, Response } from "express";
import path from "path";
import fs from "fs";
import { getProTalkDB } from "../db";
import { transliterateToSlug } from "../common";
import { ACADEMY_SECTIONS } from "../../src/lib/academyContent";
import { executeProTalkQuery } from "../db/protalkDb";

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

  // 1. Remove custom blocks completely
  s = s.replace(/:::(?:carousel|frame|button)[\s\S]*?:::/gi, " ");
  s = s.replace(/<iframe[\s\S]*?<\/iframe>/gi, " ");
  s = s.replace(/<[^>]+>/g, " ");

  // 2. Remove standard markdown images ![alt](url)
  s = s.replace(/!\[[^\]]*\]\([^)]*\)/g, " ");

  // 3. Remove malformed images like !Nakvalnia2https://... or !alt(url) or ![alt]
  s = s.replace(/![^\s]*https?:\/\/[^\s]+/gi, " ");
  s = s.replace(/!\[[^\]]*\]/g, " ");

  // 4. Remove standalone URLs (http:// or https://)
  s = s.replace(/https?:\/\/[^\s)]+/gi, " ");

  // 5. Replace links [text](url) with just the text
  s = s.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");

  // 6. Remove markdown tables
  s = s.replace(/^\s*\|.*?\|\s*$/gm, " ");
  s = s.replace(/\|/g, " ");

  // 7. Remove headers, quotes, lists, code blocks
  s = s.replace(/```[\s\S]*?```/g, " ");
  s = s.replace(/`([^`]+)`/g, "$1");
  s = s.replace(/^#{1,6}\s+/gm, " ");
  s = s.replace(/^>\s?/gm, " ");
  s = s.replace(/^\s*[-+*]\s+/gm, " ");
  s = s.replace(/^\s*\d+\.\s+/gm, " ");

  // 8. Remove formatting markers (*, _, ~, #)
  s = s.replace(/[*_~#]/g, "");

  // 9. Normalize whitespace
  s = s.replace(/\s+/g, " ").trim();

  // 10. Truncate cleanly at word boundary
  if (s.length > maxLength) {
    const truncated = s.slice(0, maxLength);
    const lastSpace = truncated.lastIndexOf(" ");
    return (lastSpace > 50 ? truncated.slice(0, lastSpace) : truncated).trimEnd() + "…";
  }
  return s;
}

export const blogRouter = Router();

blogRouter.get("/posts", async (req: Request, res: Response) => {
  try {
    const all = req.query.all === "true";
    const category = req.query.category as string | undefined;

    let pgSql = "";
    if (category === "academy") {
      pgSql = all
        ? "SELECT * FROM posts WHERE category = 'academy' OR CAST(public_id AS BIGINT) >= 770001 ORDER BY CAST(public_id AS BIGINT) ASC, created_at ASC"
        : "SELECT * FROM posts WHERE (category = 'academy' OR CAST(public_id AS BIGINT) >= 770001) AND (is_published = 1 OR CAST(is_published AS TEXT) = '1' OR CAST(is_published AS TEXT) = 'true') ORDER BY CAST(public_id AS BIGINT) ASC, created_at ASC";
    } else if (category === "blog") {
      pgSql = all
        ? "SELECT * FROM posts WHERE (category IS NULL OR category = 'blog' OR category = '') ORDER BY created_at DESC"
        : "SELECT * FROM posts WHERE (category IS NULL OR category = 'blog' OR category = '') AND (is_published = 1 OR CAST(is_published AS TEXT) = '1' OR CAST(is_published AS TEXT) = 'true') ORDER BY created_at DESC";
    } else if (category === "all") {
      pgSql = all
        ? "SELECT * FROM posts ORDER BY created_at DESC"
        : "SELECT * FROM posts WHERE is_published = 1 OR CAST(is_published AS TEXT) = '1' OR CAST(is_published AS TEXT) = 'true' ORDER BY created_at DESC";
    } else {
      pgSql = all 
        ? "SELECT * FROM posts ORDER BY created_at DESC" 
        : "SELECT * FROM posts WHERE (category IS NULL OR category = 'blog' OR category = '') AND (is_published = 1 OR CAST(is_published AS TEXT) = '1' OR CAST(is_published AS TEXT) = 'true') ORDER BY created_at DESC";
    }

    try {
      const pgRes = await executeProTalkQuery(pgSql);
      if (pgRes.rows && pgRes.rows.length > 0) {
        return res.json(pgRes.rows.map((r: any) => ({ ...r, is_published: Boolean(r.is_published && r.is_published !== "0" && r.is_published !== "false") })));
      }
    } catch (pgErr) {
      console.warn("[Blog PG query notice]:", pgErr);
    }

    const dbInstance = await getProTalkDB();
    if (category === "academy" || category === "all" || !category) {
      await ensureAcademyPostsSeeded(dbInstance);
    }
    const rows = (await dbInstance.all(pgSql)) || [];
    res.json(rows.map((r: any) => ({ ...r, is_published: Boolean(r.is_published) })));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

blogRouter.get(["/academy", "/academy/posts"], async (req: Request, res: Response) => {
  try {
    try {
      const pgRes = await executeProTalkQuery(
        "SELECT * FROM posts WHERE category = 'academy' OR CAST(public_id AS BIGINT) >= 770001 ORDER BY CAST(public_id AS BIGINT) ASC, created_at ASC"
      );
      if (pgRes.rows && pgRes.rows.length > 0) {
        return res.json(pgRes.rows.map((r: any) => ({ ...r, is_published: Boolean(r.is_published && r.is_published !== "0" && r.is_published !== "false") })));
      }
    } catch {}

    const dbInstance = await getProTalkDB();
    await ensureAcademyPostsSeeded(dbInstance);
    const rows = (await dbInstance.all(
      "SELECT * FROM posts WHERE category = 'academy' OR CAST(public_id AS BIGINT) >= 770001 ORDER BY CAST(public_id AS BIGINT) ASC, created_at ASC"
    )) || [];
    res.json(rows.map((r: any) => ({ ...r, is_published: Boolean(r.is_published) })));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

blogRouter.get("/posts/:identifier", async (req: Request, res: Response) => {
  try {
    const { identifier } = req.params;
    try {
      const pgRes = await executeProTalkQuery(
        "SELECT * FROM posts WHERE CAST(public_id AS TEXT) = $1 OR id = $1 OR slug = $1 LIMIT 1",
        [identifier]
      );
      if (pgRes.rows && pgRes.rows.length > 0) {
        const r = pgRes.rows[0];
        return res.json({ ...r, is_published: Boolean(r.is_published && r.is_published !== "0" && r.is_published !== "false") });
      }
    } catch {}

    const dbInstance = await getProTalkDB();
    let post = await dbInstance.get(
      "SELECT * FROM posts WHERE CAST(public_id AS TEXT) = ? OR id = ? OR slug = ?",
      [identifier, identifier, identifier]
    );
    if (!post) {
      await ensureAcademyPostsSeeded(dbInstance);
      post = await dbInstance.get(
        "SELECT * FROM posts WHERE CAST(public_id AS TEXT) = ? OR id = ? OR slug = ?",
        [identifier, identifier, identifier]
      );
    }
    if (!post) return res.status(404).json({ error: "Post not found" });
    res.json({ ...post, is_published: Boolean(post.is_published) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

blogRouter.post("/posts", async (req: Request, res: Response) => {
  try {
    const dbInstance = await getProTalkDB();
    const { title, cover_url, excerpt, content_md, is_published, category } = req.body;
    const id = "post-" + Math.random().toString(36).substring(2, 9);
    const public_id = Math.floor(700000 + Math.random() * 90000);
    const slug = transliterateToSlug(title || "") || `post${public_id}`;
    const cleanExcerpt = cleanArticleExcerptServer(excerpt || content_md || "", 240);
    const created_at = new Date().toISOString();
    const updated_at = created_at;
    const pubInt = is_published ? 1 : 0;
    const postCat = category || "blog";

    await dbInstance.run(
      `INSERT INTO posts (id, public_id, slug, title, cover_url, excerpt, content_md, is_published, category, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, public_id, slug, title || "", cover_url || "", cleanExcerpt, content_md || "", pubInt, postCat, created_at, updated_at]
    );

    const created = await dbInstance.get("SELECT * FROM posts WHERE id = ?", [id]);
    res.json({ ...created, is_published: Boolean(created?.is_published) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

blogRouter.put("/posts/:id", async (req: Request, res: Response) => {
  try {
    const dbInstance = await getProTalkDB();
    const { id } = req.params;
    const { title, cover_url, excerpt, content_md, is_published, category } = req.body;
    const updated_at = new Date().toISOString();
    const pubInt = is_published !== undefined ? (is_published ? 1 : 0) : 1;
    const slug = req.body.slug || transliterateToSlug(title || "");
    const cleanExcerpt = cleanArticleExcerptServer(excerpt || content_md || "", 240);

    await dbInstance.run(
      `UPDATE posts SET title = ?, slug = CASE WHEN ? != '' THEN ? ELSE slug END, cover_url = ?, excerpt = ?, content_md = ?, is_published = ?, category = COALESCE(?, category), updated_at = ?
       WHERE id = ? OR CAST(public_id AS TEXT) = ?`,
      [title || "", slug, slug, cover_url || "", cleanExcerpt, content_md || "", pubInt, category || null, updated_at, id, id]
    );

    const updated = await dbInstance.get("SELECT * FROM posts WHERE id = ? OR CAST(public_id AS TEXT) = ?", [id, id]);
    res.json({ ...updated, is_published: Boolean(updated?.is_published) });
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
