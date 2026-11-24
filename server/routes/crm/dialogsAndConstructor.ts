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

crmRouter.get("/crm/constructor/:employerId", async (req: Request, res: Response) => {
  try {
    const { employerId } = req.params;
    const db = await getProTalkDB();
    const row = await db.get(
      "SELECT settings_json FROM crm_constructor_settings WHERE employer_id = ? LIMIT 1",
      [employerId]
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
    const { settings } = req.body;
    if (!settings) return res.status(400).json({ error: "Missing settings" });
    const db = await getProTalkDB();
    const jsonStr = typeof settings === "string" ? settings : JSON.stringify(settings);
    await db.run(
      `INSERT INTO crm_constructor_settings (id, employer_id, settings_json, updated_at)
       VALUES (?, ?, ?, NOW())
       ON CONFLICT (employer_id) DO UPDATE SET
         settings_json = EXCLUDED.settings_json,
         updated_at = NOW()`,
      [`ccs-${crypto.randomUUID()}`, employerId, jsonStr]
    );
    return res.json({ success: true, saved: true });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});
