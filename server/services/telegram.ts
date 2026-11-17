import crypto from "crypto";
import { ProTalkDbWrapper, queryGet } from "../db";

function genId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).substring(2, 10)}${Date.now().toString(36)}`;
}

export interface TelegramBotConfig {
  botToken: string;
  botUsername: string;
  proxyType: "dialog_ai" | "custom_cloudflare" | "direct";
  apiBaseUrl: string;
  adminTelegramId: string;
}

export const PROXY_PRESETS = {
  dialog_ai: "https://eu1.account.dialog.ai.atiks.org",
  direct: "https://api.telegram.org",
};

export async function getTelegramBotConfig(): Promise<TelegramBotConfig> {
  const defaultConfig: TelegramBotConfig = {
    botToken: process.env.TELEGRAM_BOT_TOKEN || "8969850170:AAEQLiyXNTJvoXCXElzmCndGjnC-e9t00mQ",
    botUsername: "@RoboRecrutBot",
    proxyType: "dialog_ai",
    apiBaseUrl: process.env.TELEGRAM_API_BASE || PROXY_PRESETS.dialog_ai,
    adminTelegramId: process.env.ADMIN_TELEGRAM_ID || "169262990",
  };

  try {
    const row = await queryGet<{ config_json: string }>(
      `SELECT config_json FROM telegram_bot_config WHERE id = ?`,
      ["default"]
    );
    if (!row?.config_json) return defaultConfig;
    const parsed = typeof row.config_json === "string" ? JSON.parse(row.config_json) : row.config_json;
    return { ...defaultConfig, ...parsed };
  } catch {
    return defaultConfig;
  }
}

export function cleanTelegramBaseUrl(rawUrl: string): string {
  if (!rawUrl || typeof rawUrl !== "string") return PROXY_PRESETS.dialog_ai;
  let u = rawUrl.trim().replace(/\/+$/, "");
  u = u.replace(/\/bot[^\/]+.*$/i, "");
  if (!/^https?:\/\//i.test(u)) u = "https://" + u;
  return u;
}

export async function getTelegramTokenFromDB(db?: ProTalkDbWrapper): Promise<string> {
  try {
    if (db) {
      const cfgRow = await db.get(`SELECT config_json FROM telegram_bot_config WHERE id = 'default'`);
      if (cfgRow?.config_json) {
        const parsed = typeof cfgRow.config_json === "string" ? JSON.parse(cfgRow.config_json) : cfgRow.config_json;
        if (parsed.botToken && typeof parsed.botToken === "string" && parsed.botToken.trim()) {
          return parsed.botToken.trim();
        }
      }
      const botRow = await db.get(
        `SELECT bot_token as token FROM telegram_bots WHERE is_active = 1 ORDER BY updated_at DESC LIMIT 1`
      );
      if (botRow?.token && typeof botRow.token === "string" && botRow.token.trim()) {
        return botRow.token.trim();
      }
    }
  } catch (e: any) {
    console.error("[Telegram] Error reading token from ProTalk PG:", e.message);
  }
  return process.env.TELEGRAM_BOT_TOKEN || "8969850170:AAEQLiyXNTJvoXCXElzmCndGjnC-e9t00mQ";
}

export interface SendTelegramMessageOptions {
  chatId: string | number;
  text: string;
  parseMode?: "HTML" | "Markdown" | "MarkdownV2";
  botToken?: string;
  apiBaseUrl?: string;
  timeoutMs?: number;
}

export async function sendTelegramMessage(
  firstArg: ProTalkDbWrapper | string | number | SendTelegramMessageOptions,
  secondArg?: string | number,
  thirdArg?: string
): Promise<{ ok: boolean; result?: any; error?: string; usedFallback?: boolean }> {
  let options: SendTelegramMessageOptions;

  if (typeof firstArg === "object" && firstArg !== null && "chatId" in firstArg) {
    options = firstArg as SendTelegramMessageOptions;
  } else if (typeof firstArg === "object" && firstArg !== null && "get" in firstArg) {
    options = { chatId: secondArg as string | number, text: thirdArg as string, parseMode: "HTML" };
  } else {
    options = { chatId: firstArg as string | number, text: secondArg as string, parseMode: "HTML" };
  }

  const config = await getTelegramBotConfig();
  const token = options.botToken || config.botToken || (await getTelegramTokenFromDB());
  const rawBase = options.apiBaseUrl || config.apiBaseUrl || PROXY_PRESETS.dialog_ai;
  const primaryBase = cleanTelegramBaseUrl(rawBase);
  const timeoutMs = options.timeoutMs || 12000;

  if (!token) {
    console.warn("[Telegram] Bot token is not configured.");
    return { ok: false, error: "Bot token is missing" };
  }

  const payload: any = { chat_id: String(options.chatId), text: options.text };
  if (options.parseMode) payload.parse_mode = options.parseMode;

  const primaryUrl = `${primaryBase}/bot${token}/sendMessage`;

  try {
    const res = await fetch(primaryUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const data: any = await res.json();
    if (res.ok && data.ok) return { ok: true, result: data.result };

    if (payload.parse_mode && data?.description && data.description.includes("can't parse entities")) {
      delete payload.parse_mode;
      const retryRes = await fetch(primaryUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(timeoutMs),
      });
      const retryData: any = await retryRes.json();
      if (retryRes.ok && retryData.ok) return { ok: true, result: retryData.result };
    }

    throw new Error(data.description || `HTTP ${res.status}`);
  } catch (primaryErr: any) {
    console.warn(`[Telegram] Primary endpoint failed (${primaryUrl}):`, primaryErr.message);

    if (!primaryBase.includes("api.telegram.org")) {
      const fallbackUrl = `https://api.telegram.org/bot${token}/sendMessage`;
      try {
        const resFb = await fetch(fallbackUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(timeoutMs),
        });
        const dataFb: any = await resFb.json();
        if (resFb.ok && dataFb.ok) return { ok: true, result: dataFb.result, usedFallback: true };
        return { ok: false, error: dataFb.description || `Fallback HTTP ${resFb.status}` };
      } catch (fbErr: any) {
        return { ok: false, error: `Fallback failed: ${fbErr.message}` };
      }
    }
    return { ok: false, error: primaryErr.message };
  }
}

export async function sendTelegramDocument(options: {
  chatId: string | number;
  fileBuffer: Buffer | Uint8Array;
  filename: string;
  caption?: string;
  botToken?: string;
  apiBaseUrl?: string;
  timeoutMs?: number;
}): Promise<{ ok: boolean; result?: any; error?: string }> {
  const config = await getTelegramBotConfig();
  const token = options.botToken || config.botToken || (await getTelegramTokenFromDB());
  const rawBase = options.apiBaseUrl || config.apiBaseUrl || PROXY_PRESETS.dialog_ai;
  const primaryBase = cleanTelegramBaseUrl(rawBase);
  const timeoutMs = options.timeoutMs || 30000;

  if (!token) return { ok: false, error: "Bot token is missing" };

  const mime = options.filename.toLowerCase().endsWith(".zip")
    ? "application/zip"
    : options.filename.toLowerCase().endsWith(".sql")
    ? "application/sql"
    : "application/json";

  const buildForm = () => {
    const fd = new FormData();
    fd.append("chat_id", String(options.chatId));
    if (options.caption) {
      fd.append("caption", options.caption);
      fd.append("parse_mode", "HTML");
    }
    fd.append("document", new Blob([new Uint8Array(options.fileBuffer)], { type: mime }), options.filename);
    return fd;
  };

  const primaryUrl = `${primaryBase}/bot${token}/sendDocument`;

  try {
    const res = await fetch(primaryUrl, {
      method: "POST",
      body: buildForm(),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const data: any = await res.json();
    if (res.ok && data.ok) return { ok: true, result: data.result };
    throw new Error(data.description || `HTTP ${res.status}`);
  } catch (err: any) {
    if (!primaryBase.includes("api.telegram.org")) {
      const fbUrl = `https://api.telegram.org/bot${token}/sendDocument`;
      try {
        const resFb = await fetch(fbUrl, {
          method: "POST",
          body: buildForm(),
          signal: AbortSignal.timeout(timeoutMs),
        });
        const dataFb: any = await resFb.json();
        return { ok: Boolean(dataFb?.ok), result: dataFb?.result, error: dataFb?.description };
      } catch (fbErr: any) {
        return { ok: false, error: `Fallback failed: ${fbErr.message}` };
      }
    }
    return { ok: false, error: err.message };
  }
}

export async function recordNotificationForAdmin(
  db: ProTalkDbWrapper,
  title: string,
  body: string,
  kind = "transaction",
  link = "/admin",
  metaJson: any = {}
) {
  try {
    const notifId = genId("notif");
    await db.run(
      `INSERT INTO notifications (id, user_role, kind, title, body, link, meta_json, created_at)
       VALUES (?, 'admin', ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [notifId, kind, title, body, link, JSON.stringify(metaJson)]
    );
    return notifId;
  } catch (e: any) {
    console.error("[Notifications] Failed to record notification:", e.message);
    return null;
  }
}

export async function notifyLimitChangesToTelegram(
  db: ProTalkDbWrapper,
  emp: any,
  changes: Array<{ field: string; label: string; from: number; to: number; delta: number }>,
  note?: string
) {
  if (!emp || !changes || changes.length === 0) return;
  const empName = emp.name || emp.contact_name || emp.email || emp.contact_email || "Клиент";
  const empPublicId = emp.public_id || emp.id || "—";
  const noteStr = note || "Корректировка лимитов";
  const dateStr = new Date().toLocaleString("ru-RU");

  const lines = changes.map((c) => `• <b>${c.label || c.field}:</b> ${c.to} (${c.delta >= 0 ? "+" : ""}${c.delta})`);
  const messageText =
    `<b>⚡ Изменение лимитов аккаунта</b>\n\n` +
    `👤 <b>Аккаунт:</b> ${empName} (ID: <code>${empPublicId}</code>)\n\n` +
    `📋 <b>Обновленные лимиты:</b>\n${lines.join("\n")}\n\n` +
    `📝 <b>Примечание:</b> ${noteStr}\n` +
    `🕒 <b>Дата:</b> ${dateStr}`;

  const rawTg = emp.telegram_chat_id || emp.contact_telegram || emp.telegram_username;
  if (rawTg && typeof rawTg === "string" && rawTg.trim()) {
    let empChatId = rawTg.trim().replace(/^(https?:\/\/)?(t\.me|telegram\.me)\//i, "");
    if (empChatId) {
      if (!empChatId.startsWith("@") && !/^-?\d+$/.test(empChatId)) empChatId = `@${empChatId}`;
      try {
        await sendTelegramMessage(db, empChatId, messageText);
      } catch (e: any) {
        console.error("[Telegram] Failed to send limits change notif to employer:", e.message);
      }
    }
  }

  try {
    const notifTitle = `⚡ Изменение лимитов (${changes.length})`;
    const notifBody = `Обновлены лимиты: ${changes.map((c) => `${c.label} (${c.delta >= 0 ? "+" : ""}${c.delta})`).join(", ")}. ${noteStr}`;
    await recordNotificationForAdmin(db, `⚡ Лимиты изменены: ${empName}`, notifBody, "limits", `/admin`, {
      employer_id: emp.id,
      changes,
    });
    const notifId = genId("notif");
    await db.run(
      `INSERT INTO notifications (id, user_id, user_role, kind, title, body, link, meta_json, created_at)
       VALUES (?, ?, 'employer', 'limits', ?, ?, '/dashboard', ?, CURRENT_TIMESTAMP)`,
      [notifId, emp.id, notifTitle, notifBody, JSON.stringify({ changes, note: noteStr })]
    );
  } catch (e: any) {
    console.error("[Notifications] Failed to record internal notifications for limits:", e.message);
  }
}

export async function notifyProfileChangesToTelegram(
  db: ProTalkDbWrapper,
  emp: any,
  changes: Array<{ field: string; label?: string; from: any; to: any }>,
  note?: string
) {
  if (!emp || !changes || changes.length === 0) return;
  const empName = emp.name || emp.contact_name || emp.email || emp.contact_email || "Клиент";
  const empPublicId = emp.public_id || emp.id || "—";
  const noteStr = note || "Корректировка данных";
  const dateStr = new Date().toLocaleString("ru-RU");

  const formatVal = (val: any) => {
    if (val === null || val === undefined || val === "") return "—";
    if (typeof val === "boolean") return val ? "Да" : "Нет";
    if (typeof val === "object") return JSON.stringify(val);
    return String(val);
  };

  const lines = changes.map((c) => `• <b>${c.label || c.field}:</b> ${formatVal(c.from)} → <b>${formatVal(c.to)}</b>`);
  const messageText =
    `<b>📝 Корректировка данных профиля</b>\n\n` +
    `👤 <b>Клиент:</b> ${empName} (ID: <code>${empPublicId}</code>)\n\n` +
    `📋 <b>Измененные данные:</b>\n${lines.join("\n")}\n\n` +
    `📝 <b>Примечание:</b> ${noteStr}\n` +
    `🕒 <b>Дата:</b> ${dateStr}`;

  const rawTg = emp.telegram_chat_id || emp.contact_telegram || emp.telegram_username;
  if (rawTg && typeof rawTg === "string" && rawTg.trim()) {
    let empChatId = rawTg.trim().replace(/^(https?:\/\/)?(t\.me|telegram\.me)\//i, "");
    if (empChatId) {
      if (!empChatId.startsWith("@") && !/^-?\d+$/.test(empChatId)) empChatId = `@${empChatId}`;
      try {
        await sendTelegramMessage(db, empChatId, messageText);
      } catch (e: any) {
        console.error("[Telegram] Failed to send profile change notif to employer:", e.message);
      }
    }
  }

  try {
    const notifTitle = `📝 Корректировка профиля (${changes.length})`;
    const notifBody = `Обновлены данные: ${changes.map((c) => c.label || c.field).join(", ")}. ${noteStr}`;
    await recordNotificationForAdmin(db, `📝 Профиль обновлен: ${empName}`, notifBody, "profile", `/admin`, {
      employer_id: emp.id,
      changes,
    });
    const notifId = genId("notif");
    await db.run(
      `INSERT INTO notifications (id, user_id, user_role, kind, title, body, link, meta_json, created_at)
       VALUES (?, ?, 'employer', 'profile', ?, ?, '/profile', ?, CURRENT_TIMESTAMP)`,
      [notifId, emp.id, notifTitle, notifBody, JSON.stringify({ changes, note: noteStr })]
    );
  } catch (e: any) {
    console.error("[Notifications] Failed to record internal notifications for profile change:", e.message);
  }
}

let isWorkerRunning = false;

export async function processPendingTransactionNotifications(db: ProTalkDbWrapper) {
  if (isWorkerRunning) return 0;
  isWorkerRunning = true;

  try {
    const cfg = await getTelegramBotConfig();
    const ADMIN_CHAT_ID = cfg.adminTelegramId || "169262990";

    const txs = await db.all(`
      SELECT
        t.id, t.wallet_id, t.amount_rr, t.type, t.description, t.note, t.ref_table, t.ref_id, t.created_at,
        e.id as emp_db_id, e.name as emp_name, e.contact_name as emp_contact_name, e.public_id as emp_public_id,
        e.email as emp_email, e.contact_email as emp_contact_email,
        e.telegram_chat_id as emp_telegram_chat_id, e.contact_telegram as emp_contact_telegram, e.telegram_username as emp_telegram_username
      FROM transactions t
      LEFT JOIN wallets w ON t.wallet_id = w.id
      LEFT JOIN employers e ON (w.employer_id = e.id OR t.ref_id = e.id OR t.ref_id = e.public_id::text)
      WHERE t.id NOT IN (SELECT transaction_id FROM transaction_telegram_notifications WHERE transaction_id IS NOT NULL)
      ORDER BY t.created_at ASC
      LIMIT 10
    `);

    if (!txs || txs.length === 0) return 0;

    let processedCount = 0;
    for (const tx of txs) {
      // Atomic idempotency reservation using PG UNIQUE(transaction_id)
      const lockRes = await db.run(
        `INSERT INTO transaction_telegram_notifications (transaction_id, chat_id, status, response_data, sent_at)
         VALUES (?, 'reserved', 'processing', '{}', CURRENT_TIMESTAMP)
         ON CONFLICT (transaction_id) DO NOTHING
         RETURNING id`,
        [tx.id]
      );
      if (!lockRes.lastID && lockRes.changes === 0) continue;

      const empName = tx.emp_name || tx.emp_contact_name || tx.emp_email || tx.emp_contact_email || "Пользователь";
      const empId = tx.emp_public_id || tx.ref_id || "—";
      const amtNum = Number(tx.amount_rr || 0);
      const amountStr = (amtNum > 0 ? "+" : "") + amtNum + " RR";

      const rawType = String(tx.type || "").toLowerCase();
      const rawDesc = String(tx.description || tx.note || "").toLowerCase();

      const isImportantForAdmin =
        ["topup", "deposit", "pay", "payment", "robokassa", "purchase", "tariff_purchase", "limit_purchase", "start", "signup", "welcome", "welcome_bonus", "referral", "ref", "referral_bonus"].includes(rawType) ||
        rawDesc.includes("пополнение") ||
        rawDesc.includes("покупк") ||
        rawDesc.includes("приветственный") ||
        rawDesc.includes("реферал");

      const isAdminManualOrAi =
        ["admin", "admin_adjustment", "ai_cost", "spend", "usage", "limit_adjustment"].includes(rawType) ||
        rawDesc.includes("корректировка администратором") ||
        rawDesc.includes("расход ии");

      let tgRes: any = null;
      if (isImportantForAdmin && !isAdminManualOrAi) {
        const htmlMsg =
          `<b>💳 Важное событие в системе!</b>\n\n` +
          `<b>🆔 ID транзакции:</b> <code>${tx.id}</code>\n` +
          `<b>👤 Пользователь:</b> ${empName} (ID: <code>${empId}</code>)\n` +
          `<b>💰 Сумма:</b> <b>${amountStr}</b>\n` +
          `<b>📊 Тип:</b> <code>${tx.type || "—"}</code>\n` +
          `<b>📝 Описание:</b> ${tx.description || tx.note || "—"}\n` +
          `<b>📌 Детали:</b> ${tx.note || "—"}\n` +
          `<b>🕒 Дата:</b> ${tx.created_at || new Date().toISOString()}`;
        tgRes = await sendTelegramMessage(db, ADMIN_CHAT_ID, htmlMsg);
      }

      const rawTgTarget = tx.emp_telegram_chat_id || tx.emp_contact_telegram || tx.emp_telegram_username;
      let empTgRes: any = null;
      let empChatTarget: string | null = null;

      if (rawTgTarget && typeof rawTgTarget === "string" && rawTgTarget.trim()) {
        let empChatId = rawTgTarget.trim().replace(/^(https?:\/\/)?(t\.me|telegram\.me)\//i, "");
        if (empChatId) {
          if (!empChatId.startsWith("@") && !/^-?\d+$/.test(empChatId)) empChatId = `@${empChatId}`;
          empChatTarget = empChatId;
          const empMsg =
            `<b>💳 Изменение баланса на Робот Рекрутер</b>\n\n` +
            `<b>💰 Операция:</b> <b>${amountStr}</b>\n` +
            `<b>📊 Назначение:</b> ${tx.description || tx.note || "Изменение баланса по аккаунту"}\n` +
            `<b>📌 Детали:</b> ${tx.note || "—"}\n` +
            `<b>🕒 Дата:</b> ${tx.created_at || new Date().toISOString()}`;
          empTgRes = await sendTelegramMessage(db, empChatId, empMsg);
        }
      }

      const finalChats =
        [isImportantForAdmin && !isAdminManualOrAi ? ADMIN_CHAT_ID : null, empChatTarget].filter(Boolean).join(",") ||
        "internal";

      await db.run(
        `UPDATE transaction_telegram_notifications
         SET chat_id = ?, status = ?, response_data = ?, sent_at = CURRENT_TIMESTAMP
         WHERE transaction_id = ?`,
        [
          finalChats,
          (tgRes && tgRes.ok) || (empTgRes && empTgRes.ok) || (!isImportantForAdmin && !empChatTarget) ? "sent" : "failed",
          JSON.stringify({ admin: tgRes, employer: empTgRes }),
          tx.id,
        ]
      );

      const title = `💳 Транзакция ${amountStr} (${empName})`;
      const plainBody = `Транзакция ${tx.id}: ${amountStr}. Пользователь ${empName} (ID: ${empId}). Тип: ${tx.type || "—"}. ${tx.description || tx.note || ""}`;
      const existingAdminNotif = await db.get(
        `SELECT id FROM notifications WHERE user_role = 'admin' AND meta_json LIKE ? LIMIT 1`,
        [`%"transaction_id":"${tx.id}"%`]
      );
      if (!existingAdminNotif) {
        await recordNotificationForAdmin(db, title, plainBody, "transaction", `/admin`, {
          transaction_id: tx.id,
          employer_id: empId,
          amount_rr: tx.amount_rr,
        });
      }

      const empUserId = tx.emp_db_id || tx.emp_public_id;
      if (empUserId) {
        try {
          const existingEmpNotif = await db.get(
            `SELECT id FROM notifications WHERE user_role = 'employer' AND user_id = ? AND meta_json LIKE ? LIMIT 1`,
            [String(empUserId), `%"transaction_id":"${tx.id}"%`]
          );
          if (!existingEmpNotif) {
            await db.run(
              `INSERT INTO notifications (id, user_id, user_role, kind, title, body, link, meta_json, created_at)
               VALUES (?, ?, 'employer', 'transaction', ?, ?, '/dashboard/billing', ?, CURRENT_TIMESTAMP)`,
              [
                genId("notif"),
                String(empUserId),
                `💳 Транзакция ${amountStr}`,
                `Операция по вашему счёту: ${amountStr}. ${tx.description || tx.note || ""}`,
                JSON.stringify({ transaction_id: tx.id, amount_rr: tx.amount_rr }),
              ]
            );
          }
        } catch {}
      }

      processedCount++;
    }
    return processedCount;
  } catch (err: any) {
    console.error("[TelegramNotifier] Error processing transactions:", err.message);
    return 0;
  } finally {
    isWorkerRunning = false;
  }
}

export async function sendVacancyTelegramNotification(
  db: ProTalkDbWrapper,
  projectId: string,
  messageText: string
): Promise<{ sent: number; targets: string[] }> {
  const sentTargets: string[] = [];
  try {
    if (!db || !projectId || !messageText) return { sent: 0, targets: [] };

    const proj = await db.get(
      `SELECT id, employer_id, notifications_config FROM projects WHERE id = ? OR public_id::text = ? LIMIT 1`,
      [projectId, projectId]
    );
    let customEnabled = false;
    let customChatIds: string[] = [];

    if (proj?.notifications_config) {
      try {
        const notifCfg = typeof proj.notifications_config === "string" ? JSON.parse(proj.notifications_config) : proj.notifications_config;
        if (notifCfg && notifCfg.custom_enabled) {
          customEnabled = true;
          const rawIds = [notifCfg.telegram_group_ids, notifCfg.telegram_channel_ids, notifCfg.telegram_user_ids]
            .filter(Boolean)
            .join(",");
          customChatIds = rawIds.split(",").map((s: string) => s.trim()).filter(Boolean);
        }
      } catch (e) {
        console.warn("[Telegram] Error parsing vacancy notifications_config:", e);
      }
    }

    if (customEnabled && customChatIds.length > 0) {
      for (const target of customChatIds) {
        let cleanTarget = target.replace(/^(https?:\/\/)?(t\.me|telegram\.me)\//i, "");
        if (!cleanTarget.startsWith("@") && !/^-?\d+$/.test(cleanTarget)) cleanTarget = `@${cleanTarget}`;
        try {
          await sendTelegramMessage(db, cleanTarget, messageText);
          sentTargets.push(cleanTarget);
        } catch (err: any) {
          console.error(`[Telegram] Failed to send vacancy notification to ${cleanTarget}:`, err.message);
        }
      }
      return { sent: sentTargets.length, targets: sentTargets };
    }

    if (proj?.employer_id) {
      const emp = await db.get(
        `SELECT telegram_chat_id, contact_telegram, telegram_username FROM employers WHERE id = ? OR public_id::text = ? LIMIT 1`,
        [String(proj.employer_id), String(proj.employer_id)]
      );
      const rawTg = emp?.telegram_chat_id || emp?.contact_telegram || emp?.telegram_username;
      if (rawTg && typeof rawTg === "string" && rawTg.trim()) {
        let empChatId = rawTg.trim().replace(/^(https?:\/\/)?(t\.me|telegram\.me)\//i, "");
        if (!empChatId.startsWith("@") && !/^-?\d+$/.test(empChatId)) empChatId = `@${empChatId}`;
        await sendTelegramMessage(db, empChatId, messageText);
        sentTargets.push(empChatId);
      }
    }
  } catch (err: any) {
    console.error("[Telegram] Error in sendVacancyTelegramNotification:", err.message);
  }
  return { sent: sentTargets.length, targets: sentTargets };
}

export function verifyTelegramInitData(initData: string, botToken: string): boolean {
  if (!initData || !botToken) return false;
  try {
    const urlParams = new URLSearchParams(initData);
    const hash = urlParams.get("hash");
    if (!hash) return false;
    urlParams.delete("hash");
    const params: string[] = [];
    for (const [key, value] of urlParams.entries()) {
      params.push(`${key}=${value}`);
    }
    params.sort();
    const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
    const calculatedHash = crypto.createHmac("sha256", secretKey).update(params.join("\n")).digest("hex");
    return calculatedHash === hash;
  } catch {
    return false;
  }
}

export async function sendTelegramApiMessage(options: {
  chatId: string | number;
  text: string;
  botToken?: string;
  apiBaseUrl?: string;
  secondaryApiBaseUrl?: string;
  replyMarkup?: any;
  timeoutMs?: number;
}) {
  const token = options.botToken || process.env.TELEGRAM_BOT_TOKEN;
  const primaryBaseUrl = cleanTelegramBaseUrl(options.apiBaseUrl || "https://api.telegram.org");
  const timeoutMs = options.timeoutMs || 10000;
  if (!token) return { ok: false, description: "Токен бота не задан" };

  const urlsToTry = [primaryBaseUrl];
  if (options.secondaryApiBaseUrl) {
    const sec = cleanTelegramBaseUrl(options.secondaryApiBaseUrl);
    if (!urlsToTry.includes(sec)) urlsToTry.push(sec);
  }

  let lastError: any = null;
  for (const baseUrl of urlsToTry) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${baseUrl}/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: String(options.chatId),
          text: options.text,
          reply_markup: options.replyMarkup,
        }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.ok) {
        return { ok: true, data, description: "Успешно отправлено", usedBaseUrl: baseUrl };
      }
      lastError = { ok: false, description: data?.description || `HTTP ${res.status}`, data };
      if (res.status >= 400 && res.status < 500 && res.status !== 429) return lastError;
    } catch (err: any) {
      clearTimeout(timer);
      lastError = {
        ok: false,
        description: err.name === "AbortError" ? `Таймаут (${timeoutMs}ms) к ${baseUrl}` : err.message,
        error: err,
      };
    }
  }
  return lastError;
}
