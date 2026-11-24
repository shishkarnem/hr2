import { Router, Request, Response } from "express";
import { getProTalkDB } from "../../db";
import { resolveEmployerByToken, candidateSessions } from "../auth/helpers";
import {
  getOrCreateVapidKeys,
  parseNotificationsConfig,
  upsertPushSubscription,
  removePushSubscription,
  getUserPushSubscriptions,
  sendWebPushToOwner,
  NotificationOwnerRole,
} from "../../services/push/pushService";
import crypto from "crypto";

export const pushRouter = Router();

async function resolveActor(db: any, req: Request): Promise<{
  role: NotificationOwnerRole;
  row: any;
  ownerId: string;
  ownerPublicId: string | null;
  allIds: string[];
} | null> {
  const candToken = String(
    req.headers["x-candidate-token"] || req.body?.candidate_token || req.query.candidate_token || ""
  ).trim();
  const rawCandId = String(
    req.headers["x-candidate-id"] ||
      req.body?.candidate_id ||
      req.body?.candidateId ||
      req.query.candidate_id ||
      ""
  ).trim();

  if (candToken || rawCandId) {
    const cleanCand = rawCandId.replace(/^candidate/i, "").replace(/^cand/i, "").trim();
    let cand: any = null;
    if (cleanCand || rawCandId) {
      cand = await db.get(
        `SELECT * FROM candidates WHERE id = ? OR CAST(public_id AS TEXT) = ? OR CAST(legacy_public_id AS TEXT) = ? LIMIT 1`,
        [rawCandId, cleanCand, cleanCand]
      );
    }
    if (!cand && candToken) {
      const sess = (candidateSessions as any)[candToken];
      if (sess?.id) {
        cand = await db.get(`SELECT * FROM candidates WHERE id = ? LIMIT 1`, [sess.id]);
      } else {
        const cleanTok = candToken.replace(/^candidate/i, "").replace(/^cand/i, "").trim();
        cand = await db.get(
          `SELECT * FROM candidates WHERE id = ? OR CAST(public_id AS TEXT) = ? LIMIT 1`,
          [candToken, cleanTok]
        );
      }
    }
    if (cand) {
      const allIds = [cand.id, cand.public_id, cand.legacy_public_id].filter(Boolean).map(String);
      return {
        role: "candidate",
        row: cand,
        ownerId: String(cand.id),
        ownerPublicId: cand.public_id ? String(cand.public_id) : null,
        allIds: Array.from(new Set(allIds)),
      };
    }
  }

  const authHeader = String(req.headers.authorization || req.headers["x-employer-token"] || "");
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  const rawEmpId = String(
    req.headers["x-employer-id"] ||
      req.body?.employer_id ||
      req.body?.employerId ||
      req.query.employer_id ||
      ""
  ).trim();

  let emp: any = null;
  if (token) {
    emp = await resolveEmployerByToken(db, token);
  }
  if (!emp && rawEmpId) {
    const bare = rawEmpId.replace(/^emp-?/i, "").trim();
    emp = await db.get(
      `SELECT * FROM employers WHERE id = ? OR CAST(public_id AS TEXT) = ? OR user_id = ? LIMIT 1`,
      [rawEmpId, bare, rawEmpId]
    );
  }
  if (emp) {
    const allIds = [emp.id, emp.public_id, emp.user_id].filter(Boolean).map(String);
    return {
      role: "employer",
      row: emp,
      ownerId: String(emp.id),
      ownerPublicId: emp.public_id ? String(emp.public_id) : null,
      allIds: Array.from(new Set(allIds)),
    };
  }

  return null;
}

pushRouter.get(["/push/vapid-public-key", "/notifications/vapid-public-key"], async (_req: Request, res: Response) => {
  try {
    const db = await getProTalkDB();
    const keys = await getOrCreateVapidKeys(db);
    return res.json({ ok: true, publicKey: keys.publicKey });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || "vapid_error" });
  }
});

pushRouter.get("/push/status", async (req: Request, res: Response) => {
  try {
    const db = await getProTalkDB();
    const actor = await resolveActor(db, req);
    const keys = await getOrCreateVapidKeys(db);
    if (!actor) {
      return res.json({ ok: true, publicKey: keys.publicKey, subscriptionsCount: 0, endpoints: [] });
    }
    const subs = await getUserPushSubscriptions(db, actor.role, actor.allIds);
    return res.json({
      ok: true,
      role: actor.role,
      publicKey: keys.publicKey,
      subscriptionsCount: subs.length,
      endpoints: subs.map((s: any) => ({
        id: s.id,
        endpoint: s.endpoint,
        deviceLabel: s.device_label || null,
        updatedAt: s.updated_at,
      })),
    });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || "push_status_failed" });
  }
});

pushRouter.post("/push/subscribe", async (req: Request, res: Response) => {
  try {
    const db = await getProTalkDB();
    const actor = await resolveActor(db, req);
    if (!actor) {
      return res.status(401).json({ ok: false, error: "unauthorized", message: "Требуется авторизация" });
    }

    const sub = req.body?.subscription || req.body;
    const endpoint = String(sub?.endpoint || "").trim();
    const p256dh = String(sub?.keys?.p256dh || req.body?.p256dh || "").trim();
    const auth = String(sub?.keys?.auth || req.body?.auth || "").trim();

    if (!endpoint || !p256dh || !auth) {
      return res.status(400).json({ ok: false, error: "invalid_subscription", message: "Некорректная подписка Push" });
    }

    const ua = String(req.headers["user-agent"] || "").slice(0, 300);
    const deviceLabel = String(req.body?.deviceLabel || "").slice(0, 120) || (
      /iPhone|iPad|iOS/i.test(ua) ? "iOS устройство" : /Android/i.test(ua) ? "Android устройство" : "Браузер"
    );

    const saved = await upsertPushSubscription(db, {
      ownerType: actor.role,
      ownerId: actor.ownerId,
      ownerPublicId: actor.ownerPublicId,
      endpoint,
      p256dh,
      auth,
      userAgent: ua,
      deviceLabel,
    });

    // Ensure push channel is enabled in notifications_config if not explicitly disabled
    const cfg = parseNotificationsConfig(actor.row.notifications_config, actor.role);
    if (cfg.channels.push === false) {
      cfg.channels.push = true;
      const tbl = actor.role === "candidate" ? "candidates" : "employers";
      await db.run(`UPDATE ${tbl} SET notifications_config = ?, updated_at = NOW() WHERE id = ?`, [
        JSON.stringify(cfg),
        actor.ownerId,
      ]);
    }

    const subs = await getUserPushSubscriptions(db, actor.role, actor.allIds);
    return res.json({
      ok: true,
      id: saved.id,
      subscriptionsCount: subs.length,
    });
  } catch (err: any) {
    console.error("[Push Subscribe Error]:", err);
    return res.status(500).json({ ok: false, error: err?.message || "subscribe_failed" });
  }
});

pushRouter.post("/push/unsubscribe", async (req: Request, res: Response) => {
  try {
    const db = await getProTalkDB();
    const endpoint = String(req.body?.endpoint || req.body?.subscription?.endpoint || "").trim();
    if (endpoint) {
      await removePushSubscription(db, endpoint);
    }
    const actor = await resolveActor(db, req);
    const subs = actor ? await getUserPushSubscriptions(db, actor.role, actor.allIds) : [];
    return res.json({ ok: true, subscriptionsCount: subs.length });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || "unsubscribe_failed" });
  }
});

pushRouter.post("/push/test", async (req: Request, res: Response) => {
  try {
    const db = await getProTalkDB();
    const actor = await resolveActor(db, req);
    if (!actor) {
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }

    const targetUrl =
      actor.role === "candidate"
        ? `/cand${actor.ownerPublicId || actor.ownerId}/profile`
        : `/emp${actor.ownerPublicId || actor.ownerId}/profile`;

    const result = await sendWebPushToOwner(db, {
      ownerType: actor.role,
      ownerIds: actor.allIds,
      title: "Робот Рекрутер — тест уведомлений",
      body: "Push-уведомления успешно настроены и работают на этом устройстве.",
      url: targetUrl,
      tag: `rr-test-${Date.now()}`,
      data: { kind: "test", role: actor.role },
    });

    if (req.body?.includeBell !== false) {
      try {
        await db.run(
          `INSERT INTO notifications (id, user_id, user_role, kind, title, body, link, meta_json, created_at, recipient_kind, candidate_id)
           VALUES (?, ?, ?, 'system', ?, ?, ?, ?, NOW(), ?, ?)`,
          [
            `notif_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`,
            actor.ownerId,
            actor.role,
            "Тестовое уведомление",
            "Проверка работы колокольчика и Push-оповещений в вашем профиле прошла успешно.",
            targetUrl,
            JSON.stringify({ test: true, sentPush: result.sent }),
            actor.role,
            actor.role === "candidate" ? actor.ownerId : null,
          ]
        );
      } catch {}
    }

    return res.json({ ok: true, ...result });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || "test_push_failed" });
  }
});

pushRouter.get("/notifications/preferences", async (req: Request, res: Response) => {
  try {
    const db = await getProTalkDB();
    const actor = await resolveActor(db, req);
    if (!actor) {
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }
    const config = parseNotificationsConfig(actor.row.notifications_config, actor.role);
    const subs = await getUserPushSubscriptions(db, actor.role, actor.allIds);
    const hasEmployerBotTarget = Boolean(
      String(actor.row.telegram_chat_id || "").trim() ||
        config.telegram_user_ids ||
        config.telegram_group_ids ||
        config.telegram_channel_ids
    );
    return res.json({
      ok: true,
      role: actor.role,
      config,
      subscriptionsCount: subs.length,
      telegramConnected:
        actor.role === "employer"
          ? hasEmployerBotTarget
          : Boolean(actor.row.social_telegram || actor.row.telegram_id),
      telegramUsername:
        actor.role === "employer"
          ? actor.row.contact_telegram || actor.row.telegram_username || ""
          : actor.row.social_telegram || "",
    });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || "prefs_get_failed" });
  }
});

async function handleSaveNotificationPreferences(req: Request, res: Response) {
  try {
    const db = await getProTalkDB();
    const actor = await resolveActor(db, req);
    if (!actor) {
      return res.status(401).json({
        ok: false,
        error: "unauthorized",
        message: "Сессия не определена. Обновите страницу или войдите повторно.",
      });
    }

    const { mergeNotificationsConfig } = await import("../../services/push/pushService");
    const incoming = req.body?.config || req.body?.notifications_config || req.body || {};
    const merged = mergeNotificationsConfig(actor.row.notifications_config, incoming, actor.role);
    const serialized = JSON.stringify(merged);

    if (actor.role === "candidate") {
      await db.run(`UPDATE candidates SET notifications_config = ?, updated_at = NOW() WHERE id = ?`, [
        serialized,
        actor.ownerId,
      ]);
    } else if (incoming?.telegram_user_ids !== undefined) {
      try {
        await db.run(
          `UPDATE employers SET notifications_config = ?, telegram_chat_id = ?, updated_at = NOW() WHERE id = ?`,
          [serialized, merged.telegram_user_ids || "", actor.ownerId]
        );
      } catch (colErr: any) {
        // Fallback in case legacy bigint column migration hasn't run yet on external DB
        console.warn("[PushPrefs] telegram_chat_id update notice:", colErr?.message);
        await db.run(`UPDATE employers SET notifications_config = ?, updated_at = NOW() WHERE id = ?`, [
          serialized,
          actor.ownerId,
        ]);
      }
    } else {
      await db.run(`UPDATE employers SET notifications_config = ?, updated_at = NOW() WHERE id = ?`, [
        serialized,
        actor.ownerId,
      ]);
    }

    return res.json({ ok: true, role: actor.role, config: merged });
  } catch (err: any) {
    console.error("[PushPrefs Save Error]:", err?.message || err);
    return res.status(500).json({
      ok: false,
      error: err?.message || "prefs_save_failed",
      message: "Не удалось сохранить настройки уведомлений",
    });
  }
}

pushRouter.put(["/notifications/preferences", "/notifications/preferences/save"], handleSaveNotificationPreferences);
pushRouter.post(["/notifications/preferences", "/notifications/preferences/save"], handleSaveNotificationPreferences);
