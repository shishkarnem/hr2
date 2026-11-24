import crypto from "crypto";
import { Router, Request, Response } from "express";
import { getProTalkDB, PgDBWrapper } from "../../db";
import { resolveEmployerByToken } from "../auth/helpers";

export const decisionTemplatesRouter = Router();

const VALID_TYPES = new Set(["invited", "review", "rejected"]);

export function normalizeDecisionType(raw: any): "invited" | "review" | "rejected" {
  const s = String(raw || "").trim().toLowerCase();
  if (s === "invited" || s === "approve" || s === "approved") return "invited";
  if (s === "rejected" || s === "reject") return "rejected";
  return "review";
}

export async function resolveCanonicalEmployerKey(
  db: PgDBWrapper,
  req: Request,
  explicitEmpId?: any
): Promise<string | null> {
  const authHdr = String(req.headers.authorization || "");
  const bearerToken = authHdr.startsWith("Bearer ") ? authHdr.slice(7).trim() : "";
  if (bearerToken) {
    const emp = await resolveEmployerByToken(db, bearerToken).catch(() => null);
    if (emp) {
      return String(emp.public_id || emp.id).trim();
    }
  }

  const raw = String(
    explicitEmpId ||
      req.query.employer_id ||
      req.body?.employer_id ||
      req.headers["x-employer-id"] ||
      ""
  ).trim();
  if (!raw) return null;

  const clean = raw.replace(/^emp-?/i, "").trim();
  const empRow = await db
    .get(
      `SELECT id, public_id FROM employers
       WHERE id = ? OR CAST(public_id AS TEXT) = ? OR id = ? OR CAST(public_id AS TEXT) = ?
       LIMIT 1`,
      [raw, clean, `emp-${clean}`, raw]
    )
    .catch(() => null);

  if (empRow) return String(empRow.public_id || empRow.id).trim();
  return clean || raw;
}

export async function rememberDecisionTemplateSelection(
  db: PgDBWrapper,
  employerKey: string,
  decisionType: "invited" | "review" | "rejected",
  templateId: string | null
): Promise<void> {
  if (!employerKey || !VALID_TYPES.has(decisionType)) return;
  await db.run(
    `INSERT INTO employer_decision_template_state (employer_id, decision_type, last_template_id, updated_at)
     VALUES (?, ?, ?, NOW())
     ON CONFLICT (employer_id, decision_type) DO UPDATE SET
       last_template_id = EXCLUDED.last_template_id,
       updated_at = NOW()`,
    [employerKey, decisionType, templateId || null]
  );
}

decisionTemplatesRouter.get("/crm/decision-templates", async (req: Request, res: Response) => {
  try {
    const db = await getProTalkDB();
    const employerKey = await resolveCanonicalEmployerKey(db, req);
    if (!employerKey) {
      return res.json({
        ok: true,
        employer_id: null,
        templates: [],
        last_selected: { invited: null, review: null, rejected: null },
      });
    }

    const filterType = req.query.decision_type ? normalizeDecisionType(req.query.decision_type) : null;
    const templates = filterType
      ? await db.all(
          `SELECT id, employer_id, decision_type, title, body, is_default, created_at, updated_at
           FROM employer_decision_templates
           WHERE employer_id = ? AND decision_type = ?
           ORDER BY is_default DESC, updated_at DESC`,
          [employerKey, filterType]
        )
      : await db.all(
          `SELECT id, employer_id, decision_type, title, body, is_default, created_at, updated_at
           FROM employer_decision_templates
           WHERE employer_id = ?
           ORDER BY decision_type ASC, is_default DESC, updated_at DESC`,
          [employerKey]
        );

    const stateRows = await db.all(
      `SELECT decision_type, last_template_id FROM employer_decision_template_state WHERE employer_id = ?`,
      [employerKey]
    );

    const lastSelected: Record<string, string | null> = {
      invited: null,
      review: null,
      rejected: null,
    };
    for (const row of stateRows || []) {
      const dt = String(row.decision_type || "");
      if (VALID_TYPES.has(dt)) {
        lastSelected[dt] = row.last_template_id || null;
      }
    }

    return res.json({
      ok: true,
      employer_id: employerKey,
      templates: templates || [],
      last_selected: lastSelected,
    });
  } catch (err: any) {
    console.error("[GET /crm/decision-templates Error]:", err);
    return res.status(500).json({ ok: false, error: err?.message || "Не удалось загрузить шаблоны" });
  }
});

decisionTemplatesRouter.post("/crm/decision-templates", async (req: Request, res: Response) => {
  try {
    const db = await getProTalkDB();
    const employerKey = await resolveCanonicalEmployerKey(db, req, req.body?.employer_id);
    if (!employerKey) {
      return res.status(401).json({ ok: false, error: "Не определён работодатель" });
    }

    const decisionType = normalizeDecisionType(req.body?.decision_type);
    const title = String(req.body?.title || "").trim();
    const body = String(req.body?.body || "").trim();
    const isDefault = Boolean(req.body?.is_default);
    const selectImmediately = Boolean(req.body?.select_after_save ?? true);

    if (!title) {
      return res.status(400).json({ ok: false, error: "Укажите название шаблона" });
    }
    if (!body) {
      return res.status(400).json({ ok: false, error: "Укажите текст шаблона" });
    }

    const id = `dtpl-${crypto.randomUUID()}`;
    if (isDefault) {
      await db.run(
        `UPDATE employer_decision_templates SET is_default = FALSE WHERE employer_id = ? AND decision_type = ?`,
        [employerKey, decisionType]
      );
    }

    await db.run(
      `INSERT INTO employer_decision_templates (id, employer_id, decision_type, title, body, is_default, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [id, employerKey, decisionType, title, body, isDefault]
    );

    if (selectImmediately) {
      await rememberDecisionTemplateSelection(db, employerKey, decisionType, id);
    }

    const created = await db.get(`SELECT * FROM employer_decision_templates WHERE id = ? LIMIT 1`, [id]);
    return res.status(201).json({ ok: true, template: created });
  } catch (err: any) {
    console.error("[POST /crm/decision-templates Error]:", err);
    return res.status(500).json({ ok: false, error: err?.message || "Не удалось создать шаблон" });
  }
});

decisionTemplatesRouter.put("/crm/decision-templates/:id", async (req: Request, res: Response) => {
  try {
    const db = await getProTalkDB();
    const employerKey = await resolveCanonicalEmployerKey(db, req, req.body?.employer_id);
    if (!employerKey) {
      return res.status(401).json({ ok: false, error: "Не определён работодатель" });
    }

    const tplId = String(req.params.id || "").trim();
    const existing = await db.get(
      `SELECT * FROM employer_decision_templates WHERE id = ? AND employer_id = ? LIMIT 1`,
      [tplId, employerKey]
    );
    if (!existing) {
      return res.status(404).json({ ok: false, error: "Шаблон не найден" });
    }

    const decisionType = req.body?.decision_type
      ? normalizeDecisionType(req.body.decision_type)
      : normalizeDecisionType(existing.decision_type);
    const title = req.body?.title !== undefined ? String(req.body.title).trim() : existing.title;
    const body = req.body?.body !== undefined ? String(req.body.body).trim() : existing.body;
    const isDefault = req.body?.is_default !== undefined ? Boolean(req.body.is_default) : Boolean(existing.is_default);

    if (!title || !body) {
      return res.status(400).json({ ok: false, error: "Название и текст шаблона не могут быть пустыми" });
    }

    if (isDefault) {
      await db.run(
        `UPDATE employer_decision_templates SET is_default = FALSE WHERE employer_id = ? AND decision_type = ? AND id != ?`,
        [employerKey, decisionType, tplId]
      );
    }

    await db.run(
      `UPDATE employer_decision_templates
       SET decision_type = ?, title = ?, body = ?, is_default = ?, updated_at = NOW()
       WHERE id = ? AND employer_id = ?`,
      [decisionType, title, body, isDefault, tplId, employerKey]
    );

    const updated = await db.get(`SELECT * FROM employer_decision_templates WHERE id = ? LIMIT 1`, [tplId]);
    return res.json({ ok: true, template: updated });
  } catch (err: any) {
    console.error("[PUT /crm/decision-templates/:id Error]:", err);
    return res.status(500).json({ ok: false, error: err?.message || "Не удалось обновить шаблон" });
  }
});

decisionTemplatesRouter.delete("/crm/decision-templates/:id", async (req: Request, res: Response) => {
  try {
    const db = await getProTalkDB();
    const employerKey = await resolveCanonicalEmployerKey(db, req);
    if (!employerKey) {
      return res.status(401).json({ ok: false, error: "Не определён работодатель" });
    }

    const tplId = String(req.params.id || "").trim();
    const existing = await db.get(
      `SELECT * FROM employer_decision_templates WHERE id = ? AND employer_id = ? LIMIT 1`,
      [tplId, employerKey]
    );
    if (!existing) {
      return res.status(404).json({ ok: false, error: "Шаблон не найден" });
    }

    await db.run(`DELETE FROM employer_decision_templates WHERE id = ? AND employer_id = ?`, [tplId, employerKey]);
    await db.run(
      `UPDATE employer_decision_template_state
       SET last_template_id = NULL, updated_at = NOW()
       WHERE employer_id = ? AND last_template_id = ?`,
      [employerKey, tplId]
    );

    return res.json({ ok: true, deleted_id: tplId });
  } catch (err: any) {
    console.error("[DELETE /crm/decision-templates/:id Error]:", err);
    return res.status(500).json({ ok: false, error: err?.message || "Не удалось удалить шаблон" });
  }
});

decisionTemplatesRouter.post("/crm/decision-templates/select", async (req: Request, res: Response) => {
  try {
    const db = await getProTalkDB();
    const employerKey = await resolveCanonicalEmployerKey(db, req, req.body?.employer_id);
    if (!employerKey) {
      return res.status(401).json({ ok: false, error: "Не определён работодатель" });
    }

    const decisionType = normalizeDecisionType(req.body?.decision_type);
    const templateId = req.body?.template_id ? String(req.body.template_id).trim() : null;

    await rememberDecisionTemplateSelection(db, employerKey, decisionType, templateId);
    return res.json({ ok: true, employer_id: employerKey, decision_type: decisionType, last_template_id: templateId });
  } catch (err: any) {
    console.error("[POST /crm/decision-templates/select Error]:", err);
    return res.status(500).json({ ok: false, error: err?.message || "Не удалось сохранить выбор шаблона" });
  }
});
