import { Router, Request, Response } from "express";
import crypto from "crypto";
import { getProTalkDB } from "../../db";
import { decisionTemplatesRouter } from "./decisionTemplates";

export const crmRouter = Router();
crmRouter.use(decisionTemplatesRouter);

crmRouter.get("/crm/dialogs/:employerId", async (req: Request, res: Response) => {
  try {
    const { employerId } = req.params;
    const db = await getProTalkDB();
    const row = await db.get(
      "SELECT templates_json FROM crm_dialog_templates WHERE employer_id = ? LIMIT 1",
      [employerId]
    );
    if (row && row.templates_json) {
      try {
        const templates =
          typeof row.templates_json === "string" ? JSON.parse(row.templates_json) : row.templates_json;
        return res.json({ success: true, templates });
      } catch {}
    }
    return res.json({ success: true, templates: null });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

crmRouter.post("/crm/dialogs/:employerId", async (req: Request, res: Response) => {
  try {
    const { employerId } = req.params;
    const { templates } = req.body;
    if (!templates) return res.status(400).json({ error: "Missing templates" });
    const db = await getProTalkDB();
    const jsonStr = typeof templates === "string" ? templates : JSON.stringify(templates);
    await db.run(
      `INSERT INTO crm_dialog_templates (id, employer_id, templates_json, updated_at)
       VALUES (?, ?, ?, NOW())
       ON CONFLICT (employer_id) DO UPDATE SET
         templates_json = EXCLUDED.templates_json,
         updated_at = NOW()`,
      [`cdt-${crypto.randomUUID()}`, employerId, jsonStr]
    );
    return res.json({ success: true, saved: true });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

async function resolveConstructorKeys(
  db: any,
  rawEmployerId: string
): Promise<{ canonicalKey: string; lookupKeys: string[] }> {
  const raw = String(rawEmployerId || "").trim();
  const clean = raw.replace(/^emp-?/i, "").trim();
  const candidates = Array.from(new Set([raw, clean].filter(Boolean)));
  if (candidates.length === 0) {
    return { canonicalKey: "emp", lookupKeys: ["emp"] };
  }

  try {
    const emp = await db.get(
      `SELECT id, public_id FROM employers
       WHERE id = ? OR id = ? OR (public_id IS NOT NULL AND CAST(public_id AS TEXT) = ?)
       LIMIT 1`,
      [raw, `emp-${clean}`, clean]
    );
    if (emp) {
      const canonicalKey =
        emp.public_id != null && String(emp.public_id).trim() !== ""
          ? String(emp.public_id).trim()
          : String(emp.id || clean || raw);
      const lookupKeys = Array.from(
        new Set(
          [canonicalKey, emp.id ? String(emp.id) : "", raw, clean].filter(Boolean)
        )
      );
      return { canonicalKey, lookupKeys };
    }
  } catch {
    // ignore lookup fallback
  }

  return { canonicalKey: clean || raw, lookupKeys: candidates };
}

crmRouter.get("/crm/constructor/:employerId", async (req: Request, res: Response) => {
  try {
    const { employerId } = req.params;
    const db = await getProTalkDB();
    const { lookupKeys } = await resolveConstructorKeys(db, employerId);
    const placeholders = lookupKeys.map(() => "?").join(", ");
    const row = await db.get(
      `SELECT settings_json FROM crm_constructor_settings
       WHERE employer_id IN (${placeholders})
       ORDER BY updated_at DESC NULLS LAST
       LIMIT 1`,
      lookupKeys
    );
    if (row && row.settings_json) {
      try {
        const settings =
          typeof row.settings_json === "string" ? JSON.parse(row.settings_json) : row.settings_json;
        return res.json({ success: true, settings });
      } catch {}
    }
    return res.json({ success: true, settings: null });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

crmRouter.post("/crm/constructor/:employerId", async (req: Request, res: Response) => {
  try {
    const { employerId } = req.params;
    let rawSettings = req.body?.settings;
    if (!rawSettings && typeof req.body === "string") {
      try {
        rawSettings = JSON.parse(req.body)?.settings;
      } catch {}
    }
    if (!rawSettings) return res.status(400).json({ error: "Missing settings" });

    const incomingSettings =
      typeof rawSettings === "string" ? JSON.parse(rawSettings) : rawSettings;
    if (!incomingSettings || typeof incomingSettings !== "object" || Array.isArray(incomingSettings)) {
      return res.status(400).json({ error: "Invalid settings payload" });
    }

    const db = await getProTalkDB();
    const { canonicalKey, lookupKeys } = await resolveConstructorKeys(db, employerId);
    const placeholders = lookupKeys.map(() => "?").join(", ");

    const existingRow = await db.get(
      `SELECT settings_json FROM crm_constructor_settings
       WHERE employer_id IN (${placeholders})
       ORDER BY updated_at DESC NULLS LAST
       LIMIT 1`,
      lookupKeys
    );

    let prevSettings: Record<string, any> = {};
    if (existingRow?.settings_json) {
      try {
        const parsed =
          typeof existingRow.settings_json === "string"
            ? JSON.parse(existingRow.settings_json)
            : existingRow.settings_json;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          prevSettings = parsed;
        }
      } catch {}
    }

    const mergedSettings = {
      ...prevSettings,
      ...incomingSettings,
    };

    const jsonStr = JSON.stringify(mergedSettings);
    await db.run(
      `INSERT INTO crm_constructor_settings (employer_id, settings_json, updated_at)
       VALUES (?, ?, NOW())
       ON CONFLICT (employer_id) DO UPDATE SET
         settings_json = EXCLUDED.settings_json,
         updated_at = NOW()`,
      [canonicalKey, jsonStr]
    );
    return res.json({ success: true, saved: true, employerId: canonicalKey });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});
