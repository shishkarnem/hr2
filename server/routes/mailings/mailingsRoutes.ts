import { Router, Request, Response } from "express";
import { getProTalkDB } from "../../db";
import { resolveAuthorizedAdminEmployer } from "../admin/authAndTelegram";
import {
  deleteMailingRecord,
  dispatchMailingCampaign,
  ensureMailingsSchemaPg,
  listMailingRecipientsPage,
  listMailingsPage,
  MailingAudienceType,
  previewMailingAudience,
  saveMailingRecord,
  sendTestTelegramMailing,
} from "../../services/mailings/mailingsService";

export const adminMailingsRouter = Router();

adminMailingsRouter.get("/mailings", async (req: Request, res: Response) => {
  try {
    await ensureMailingsSchemaPg();
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const offset = Math.max(0, Number(req.query.offset) || 0);
    const search = typeof req.query.q === "string" ? req.query.q : "";
    const result = await listMailingsPage({ search, limit, offset });
    return res.json({ success: true, ...result });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || "Ошибка загрузки рассылок" });
  }
});

adminMailingsRouter.get("/mailings/recipients", async (req: Request, res: Response) => {
  try {
    const db = await getProTalkDB();
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const offset = Math.max(0, Number(req.query.offset) || 0);
    const search = typeof req.query.q === "string" ? req.query.q : "";
    const kind = typeof req.query.kind === "string" ? req.query.kind : "all";
    const result = await listMailingRecipientsPage(db, { kind, search, limit, offset });
    return res.json({ success: true, ...result });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || "Ошибка загрузки получателей" });
  }
});

adminMailingsRouter.post("/mailings/preview-audience", async (req: Request, res: Response) => {
  try {
    const db = await getProTalkDB();
    const audienceType = (req.body?.audience_type || "employers") as MailingAudienceType;
    const selectedRecipients = Array.isArray(req.body?.selected_recipients) ? req.body.selected_recipients : [];
    const stats = await previewMailingAudience(db, audienceType, selectedRecipients);
    return res.json({ success: true, ...stats });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || "Ошибка расчёта аудитории" });
  }
});

adminMailingsRouter.post("/mailings", async (req: Request, res: Response) => {
  try {
    const title = String(req.body?.title || "").trim();
    const bodyMd = String(req.body?.body_md || "").trim();
    if (!title || !bodyMd) {
      return res.status(400).json({ success: false, error: "Укажите заголовок и текст письма" });
    }
    const db = await getProTalkDB();
    const adminEmp = await resolveAuthorizedAdminEmployer(req);
    const saved = await saveMailingRecord(
      db,
      {
        id: req.body?.id || null,
        title,
        body_md: bodyMd,
        image_url: req.body?.image_url || null,
        button_text: req.body?.button_text || null,
        button_url: req.body?.button_url || null,
        audience_type: req.body?.audience_type || "employers",
        selected_recipients: req.body?.selected_recipients || [],
        send_in_app: req.body?.send_in_app !== false,
        send_push: req.body?.send_push !== false,
        send_telegram: req.body?.send_telegram !== false,
      },
      adminEmp || {}
    );
    return res.json({ success: true, mailing: saved });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || "Ошибка сохранения черновика" });
  }
});

adminMailingsRouter.post("/mailings/test-telegram", async (req: Request, res: Response) => {
  try {
    const title = String(req.body?.title || "").trim();
    const bodyMd = String(req.body?.body_md || "").trim();
    if (!title || !bodyMd) {
      return res.status(400).json({ success: false, error: "Укажите заголовок и текст письма для теста" });
    }
    const adminEmp = await resolveAuthorizedAdminEmployer(req);
    const result = await sendTestTelegramMailing(req.body?.chat_id, adminEmp, {
      title,
      body_md: bodyMd,
      image_url: req.body?.image_url || null,
      button_text: req.body?.button_text || null,
      button_url: req.body?.button_url || null,
    });
    if (!result.ok) {
      return res.status(400).json({ success: false, error: result.error || "Не удалось отправить тест в Telegram" });
    }
    return res.json({ success: true, chatId: result.chatId });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || "Ошибка тестовой отправки" });
  }
});

adminMailingsRouter.post("/mailings/send", async (req: Request, res: Response) => {
  try {
    const title = String(req.body?.title || "").trim();
    const bodyMd = String(req.body?.body_md || "").trim();
    const sendInApp = req.body?.send_in_app !== false;
    const sendPush = req.body?.send_push !== false;
    const sendTelegram = req.body?.send_telegram !== false;

    if (!title || !bodyMd) {
      return res.status(400).json({ success: false, error: "Укажите заголовок и текст письма" });
    }
    if (!sendInApp && !sendPush && !sendTelegram) {
      return res.status(400).json({ success: false, error: "Выберите хотя бы один канал доставки" });
    }

    const db = await getProTalkDB();
    const adminEmp = await resolveAuthorizedAdminEmployer(req);
    const sent = await dispatchMailingCampaign(
      db,
      {
        id: req.body?.id || null,
        title,
        body_md: bodyMd,
        image_url: req.body?.image_url || null,
        button_text: req.body?.button_text || null,
        button_url: req.body?.button_url || null,
        audience_type: req.body?.audience_type || "employers",
        selected_recipients: req.body?.selected_recipients || [],
        send_in_app: sendInApp,
        send_push: sendPush,
        send_telegram: sendTelegram,
      },
      adminEmp || {}
    );

    return res.json({ success: true, mailing: sent });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || "Ошибка отправки рассылки" });
  }
});

adminMailingsRouter.delete("/mailings/:id", async (req: Request, res: Response) => {
  try {
    const db = await getProTalkDB();
    await deleteMailingRecord(db, String(req.params.id));
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || "Ошибка удаления рассылки" });
  }
});
