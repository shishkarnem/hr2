import { Router, Request, Response } from "express";
import { getProTalkDB } from "../../db";
import { queryPgRaw } from "../../db/pgClient";
import { getAppVersionPg } from "../../db/protalkDb";

export const publicContentRouter = Router();

publicContentRouter.get(["/app-version", "/system/version"], async (_req: Request, res: Response) => {
  try {
    const version = await getAppVersionPg();
    return res.json({ version });
  } catch {
    return res.json({ version: "v.2.30" });
  }
});

let cachedFaq: any = null;
let cachedFaqTime = 0;
const FAQ_CACHE_TTL = 60 * 1000;

publicContentRouter.get("/faq", async (_req: Request, res: Response) => {
  try {
    const now = Date.now();
    if (cachedFaq && now - cachedFaqTime < FAQ_CACHE_TTL) {
      res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
      return res.json(cachedFaq);
    }
    const dbInstance = await getProTalkDB();
    const rows = await dbInstance.all(
      "SELECT id, question, answer, category, sort_order FROM faq_items WHERE COALESCE(is_published::text, '1') IN ('1', 'true', 't') ORDER BY category ASC, sort_order ASC"
    );
    cachedFaq = rows;
    cachedFaqTime = now;
    res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
    return res.json(rows);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

publicContentRouter.get("/onboarding", async (_req: Request, res: Response) => {
  try {
    const dbInstance = await getProTalkDB();
    const rows = await dbInstance.all(
      "SELECT id, section, field_key, kind, title, body_md, selector, order_idx FROM onboarding_content ORDER BY section ASC, order_idx ASC"
    );
    return res.json(rows);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

publicContentRouter.get("/job-titles", async (req: Request, res: Response) => {
  try {
    const pgRes = await queryPgRaw(`
      SELECT 
        jt.id,
        jt.title,
        jt.usage_count,
        jt.is_basic,
        jt.category,
        jt.description,
        jt.created_at,
        jt.created_by,
        COALESCE(NULLIF(TRIM(jt.company_name), ''), '') as company_name
      FROM job_titles jt
      ORDER BY jt.title ASC
    `);
    const rows = pgRes.rows || [];

    const uniqueMap = new Map<string, any>();
    for (const r of rows) {
      const key = (r.title || "").trim().toLowerCase();
      if (!key) continue;
      uniqueMap.set(key, r);
    }

    const result = Array.from(uniqueMap.values()).map((r: any) => ({
      id: r.id,
      title: r.title,
      usage_count: Number(r.usage_count ?? 0),
      is_basic: Boolean(r.is_basic && r.is_basic !== "0" && r.is_basic !== "false"),
      category: r.category || "",
      description: r.description || "",
      company_name: r.company_name || "",
      created_by: r.created_by || "",
      created_at: r.created_at || "",
    }));

    const paginated = req.query.paginated === "1" || req.query.paginated === "true";
    if (paginated) {
      const q = String(req.query.q || "").trim().toLowerCase();
      const filtered = q
        ? result.filter((r) => r.title.toLowerCase().includes(q) || String(r.id).toLowerCase().includes(q))
        : result;
      const rawLimit = Number(req.query.limit ?? 20);
      const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(100, Math.floor(rawLimit)) : 20;
      const rawOffset = Number(req.query.offset ?? 0);
      const offset = Number.isFinite(rawOffset) && rawOffset >= 0 ? Math.floor(rawOffset) : 0;
      const items = filtered.slice(offset, offset + limit);
      return res.json({
        items,
        total: filtered.length,
        hasMore: offset + items.length < filtered.length,
      });
    }

    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

publicContentRouter.post("/job-titles/increment", async (req: Request, res: Response) => {
  try {
    const { id, title } = req.body || {};
    if (id) {
      await queryPgRaw("UPDATE job_titles SET usage_count = COALESCE(usage_count, 0) + 1 WHERE id = $1", [id]);
    }
    if (title) {
      await queryPgRaw(
        "UPDATE job_titles SET usage_count = COALESCE(usage_count, 0) + 1 WHERE LOWER(title) = LOWER($1)",
        [String(title).trim()]
      );
    }
    return res.json({ ok: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

publicContentRouter.post("/job-titles", async (req: Request, res: Response) => {
  try {
    const { title, company_name, created_by } = req.body || {};
    const t = String(title || "").trim();
    if (!t) return res.status(400).json({ error: "Title is required" });
    const dbInstance = await getProTalkDB();

    let resolvedComp = company_name ? String(company_name).trim() : "";
    if (!resolvedComp && created_by) {
      const emp = await dbInstance.get(
        "SELECT company_name, name FROM employers WHERE user_id = ? OR id = ? OR CAST(public_id AS TEXT) = ? LIMIT 1",
        [created_by, created_by, String(created_by)]
      );
      if (emp) {
        resolvedComp = (emp.company_name || emp.name || "").trim();
      }
    }

    const existing = await dbInstance.get("SELECT * FROM job_titles WHERE LOWER(title) = LOWER(?) LIMIT 1", [t]);
    if (existing) {
      if (resolvedComp) {
        await queryPgRaw("UPDATE job_titles SET company_name = $1 WHERE id = $2", [resolvedComp, existing.id]);
      }
      if (created_by) {
        await queryPgRaw("UPDATE job_titles SET created_by = $1 WHERE id = $2", [created_by, existing.id]);
      }
      return res.json({
        id: existing.id,
        title: existing.title,
        usage_count: Number(existing.usage_count ?? 0),
        is_basic: Boolean(existing.is_basic),
        company_name: resolvedComp || existing.company_name || "",
        created_by: created_by || existing.created_by || "",
      });
    }

    const id = `jt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const initUsage = 0;
    await queryPgRaw(
      "INSERT INTO job_titles (id, title, usage_count, is_basic, company_name, created_by) VALUES ($1, $2, $3, 0, $4, $5)",
      [id, t, initUsage, resolvedComp || "", created_by || null]
    );
    return res.json({
      id,
      title: t,
      usage_count: initUsage,
      is_basic: false,
      company_name: resolvedComp || "",
      created_by: created_by || "",
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

publicContentRouter.delete("/job-titles/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const dbInstance = await getProTalkDB();
    await dbInstance.run("DELETE FROM job_titles WHERE id = ? OR title = ?", [id, id]);
    return res.json({ ok: true, deletedId: id });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});
