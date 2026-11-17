import { ProTalkDbWrapper, queryGet, queryRun } from "./db";

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

// 1. Получение настроек бота и прокси из ProTalk PG
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
      "SELECT config_json FROM telegram_bot_config WHERE id = ?",
      ["default"]
    );

    if (!row?.config_json) return defaultConfig;
    const parsed = typeof row.config_json === "string" ? JSON.parse(row.config_json) : row.config_json;
    return { ...defaultConfig, ...parsed };
  } catch {
    return defaultConfig;
  }
}

// 2. Очистка и нормализация базового URL
export function cleanTelegramBaseUrl(rawUrl: string): string {
  if (!rawUrl || typeof rawUrl !== "string") return PROXY_PRESETS.dialog_ai;
  let u = rawUrl.trim().replace(/\/+$/, "");
  // Если пользователь случайно скопировал адрес целиком с /bot<TOKEN>/...
  u = u.replace(/\/bot[^\/]+.*$/i, "");
  if (!/^https?:\/\//i.test(u)) u = "https://" + u;
  return u;
}

export async function getTelegramTokenFromDB(db?: ProTalkDbWrapper): Promise<string> {
  try {
    if (db) {
      const cfgRow = await db.get("SELECT config_json FROM telegram_bot_config WHERE id = 'default'");
      if (cfgRow?.config_json) {
        const parsed = typeof cfgRow.config_json === "string" ? JSON.parse(cfgRow.config_json) : cfgRow.config_json;
        if (parsed.botToken && typeof parsed.botToken === "string" && parsed.botToken.trim()) {
          return parsed.botToken.trim();
        }
      }
      const botRow = await db.get("SELECT bot_token as token FROM telegram_bots WHERE is_active = 1 ORDER BY updated_at DESC LIMIT 1");
      if (botRow && botRow.token && typeof botRow.token === "string" && botRow.token.trim()) {
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

// 3. Отправка текстовых сообщений (sendMessage) с поддержкой прокси и fallback
export async function sendTelegramMessage(
  firstArg: ProTalkDbWrapper | string | number | SendTelegramMessageOptions,
  secondArg?: string | number,
  thirdArg?: string
): Promise<{ ok: boolean; result?: any; error?: string; usedFallback?: boolean }> {
  let options: SendTelegramMessageOptions;

  if (typeof firstArg === "object" && firstArg !== null && "chatId" in firstArg) {
    options = firstArg as SendTelegramMessageOptions;
  } else if (typeof firstArg === "object" && firstArg !== null && "get" in firstArg) {
    // Legacy call: sendTelegramMessage(db, chatId, text)
    options = {
      chatId: secondArg as string | number,
      text: thirdArg as string,
      parseMode: "HTML",
    };
  } else {
    // Call: sendTelegramMessage(chatId, text)
    options = {
      chatId: firstArg as string | number,
      text: secondArg as string,
      parseMode: "HTML",
    };
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

  const payload: any = {
    chat_id: String(options.chatId),
    text: options.text,
  };
  if (options.parseMode) {
    payload.parse_mode = options.parseMode;
  }

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

    // If HTML parsing failed, retry plain text
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

    // Автоматический Fallback на api.telegram.org при сбое прокси
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
        if (resFb.ok && dataFb.ok) {
          return { ok: true, result: dataFb.result, usedFallback: true };
        }
        return { ok: false, error: dataFb.description || `Fallback HTTP ${resFb.status}` };
      } catch (fbErr: any) {
        return { ok: false, error: `Fallback failed: ${fbErr.message}` };
      }
    }
    return { ok: false, error: primaryErr.message };
  }
}

// 4. Отправка файлов / бэкапов (sendDocument)
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

  const formData = new FormData();
  formData.append("chat_id", String(options.chatId));
  if (options.caption) formData.append("caption", options.caption);
  if (options.caption) formData.append("parse_mode", "HTML");

  const lowerName = (options.filename || "").toLowerCase();
  const mimeType = lowerName.endsWith(".zip")
    ? "application/zip"
    : lowerName.endsWith(".json")
      ? "application/json"
      : "application/octet-stream";
  const blob = new Blob([new Uint8Array(options.fileBuffer)], { type: mimeType });
  formData.append("document", blob, options.filename);

  const primaryUrl = `${primaryBase}/bot${token}/sendDocument`;

  try {
    const res = await fetch(primaryUrl, {
      method: "POST",
      body: formData,
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
          body: formData,
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

  const lines = changes.map(
    (c) => `• <b>${c.label || c.field}:</b> ${c.to} (${c.delta >= 0 ? "+" : ""}${c.delta})`
  );

  const messageText =
    `<b>⚡ Изменение лимитов аккаунта</b>\n\n` +
    `👤 <b>Аккаунт:</b> ${empName} (ID: <code>${empPublicId}</code>)\n\n` +
    `📋 <b>Обновленные лимиты:</b>\n${lines.join("\n")}\n\n` +
    `📝 <b>Примечание:</b> ${noteStr}\n` +
    `🕒 <b>Дата:</b> ${dateStr}`;

  // 1. Send to Employer if Telegram username/chat is configured
  const rawTg = emp.telegram_chat_id || emp.contact_telegram || emp.telegram_username;
  if (rawTg && typeof rawTg === "string" && rawTg.trim()) {
    let empChatId = rawTg.trim().replace(/^(https?:\/\/)?(t\.me|telegram\.me)\//i, "");
    if (empChatId) {
      if (!empChatId.startsWith("@") && !/^-?\d+$/.test(empChatId)) {
        empChatId = `@${empChatId}`;
      }
      try {
        await sendTelegramMessage(db, empChatId, messageText);
      } catch (e: any) {
        console.error("[Telegram] Failed to send limits change notif to employer:", e.message);
      }
    }
  }

  // 2. Internal notifications for the web CRM system UI
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

  const lines = changes.map(
    (c) => `• <b>${c.label || c.field}:</b> ${formatVal(c.from)} → <b>${formatVal(c.to)}</b>`
  );

  const messageText =
    `<b>📝 Корректировка данных профиля</b>\n\n` +
    `👤 <b>Клиент:</b> ${empName} (ID: <code>${empPublicId}</code>)\n\n` +
    `📋 <b>Измененные данные:</b>\n${lines.join("\n")}\n\n` +
    `📝 <b>Примечание:</b> ${noteStr}\n` +
    `🕒 <b>Дата:</b> ${dateStr}`;

  // 1. Send to Employer if Telegram username/chat is configured
  const rawTg = emp.telegram_chat_id || emp.contact_telegram || emp.telegram_username;
  if (rawTg && typeof rawTg === "string" && rawTg.trim()) {
    let empChatId = rawTg.trim().replace(/^(https?:\/\/)?(t\.me|telegram\.me)\//i, "");
    if (empChatId) {
      if (!empChatId.startsWith("@") && !/^-?\d+$/.test(empChatId)) {
        empChatId = `@${empChatId}`;
      }
      try {
        await sendTelegramMessage(db, empChatId, messageText);
      } catch (e: any) {
        console.error("[Telegram] Failed to send profile change notif to employer:", e.message);
      }
    }
  }

  // 2. Internal Notifications for CRM UI (No Telegram spam to admin)
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

let isWorkerRunning = false;

export async function processPendingTransactionNotifications(db: ProTalkDbWrapper) {
  if (isWorkerRunning) {
    return 0;
  }

  isWorkerRunning = true;
  const tgConfig = await getTelegramBotConfig();
  const ADMIN_CHAT_ID = tgConfig.adminTelegramId || process.env.ADMIN_TELEGRAM_ID || "169262990";

  try {
    // Select unsent transactions in small batches (max 10) to avoid overloading or rate limits
    const txs = await db.all(`
      SELECT 
        t.id, t.wallet_id, t.amount_rr, t.type, t.description, t.note, t.ref_table, t.ref_id, t.created_at,
        e.id as emp_db_id, e.name as emp_name, e.contact_name as emp_contact_name, e.public_id as emp_public_id, e.email as emp_email, e.contact_email as emp_contact_email,
        e.telegram_chat_id as emp_telegram_chat_id, e.contact_telegram as emp_contact_telegram, e.telegram_username as emp_telegram_username
      FROM transactions t
      LEFT JOIN wallets w ON t.wallet_id = w.id
      LEFT JOIN employers e ON (w.employer_id = e.id OR t.ref_id = e.id OR t.ref_id = CAST(e.public_id AS TEXT))
      WHERE NOT EXISTS (SELECT 1 FROM transaction_telegram_notifications ttn WHERE ttn.transaction_id = t.id)
      ORDER BY t.created_at ASC
      LIMIT 10
    `);

    if (!txs || txs.length === 0) return 0;

    let processedCount = 0;
    for (const tx of txs) {
      // Atomic pre-reservation: skip if already present
      try {
        const existingLock = await db.get(
          `SELECT id FROM transaction_telegram_notifications WHERE transaction_id = ? LIMIT 1`,
          [tx.id]
        );
        if (existingLock) continue;
        await db.run(
          `INSERT INTO transaction_telegram_notifications (transaction_id, chat_id, status, response_data, sent_at)
           VALUES (?, 'reserved', 'processing', '{}', CURRENT_TIMESTAMP)`,
          [tx.id]
        );
      } catch (e: any) {
        // Transaction already locked or processed by a concurrent run
        continue;
      }

      const empName = tx.emp_name || tx.emp_contact_name || tx.emp_email || tx.emp_contact_email || "Пользователь";
      const empId = tx.emp_public_id || tx.ref_id || "—";
      const amtNum = Number(tx.amount_rr || 0);
      const amountStr = (amtNum > 0 ? "+" : "") + amtNum + " RR";

      const rawType = String(tx.type || "").toLowerCase();
      const rawDesc = String(tx.description || tx.note || "").toLowerCase();

      // Admin receives Telegram ONLY for key business events (Registration, Purchases, Topups, Referrals)
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

      // 2. Check if employer has Telegram ID / Chat ID / Username in profile - send directly to user
      const rawTgTarget = tx.emp_telegram_chat_id || tx.emp_contact_telegram || tx.emp_telegram_username;
      let empTgRes: any = null;
      let empChatTarget: string | null = null;

      if (rawTgTarget && typeof rawTgTarget === "string" && rawTgTarget.trim()) {
        let empChatId = rawTgTarget.trim();
        empChatId = empChatId.replace(/^(https?:\/\/)?(t\.me|telegram\.me)\//i, "");

        if (empChatId) {
          if (!empChatId.startsWith("@") && !/^-?\d+$/.test(empChatId)) {
            empChatId = `@${empChatId}`;
          }
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

      // 3. Update reservation record to completed status
      const finalChats = [
        (isImportantForAdmin && !isAdminManualOrAi) ? ADMIN_CHAT_ID : null,
        empChatTarget
      ].filter(Boolean).join(",") || "internal";

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

      // 4. Save into notifications table for admin (with deduplication check)
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

      // 5. Save into notifications table for employer (with deduplication check)
      const empUserId = tx.emp_db_id || tx.emp_public_id;
      if (empUserId) {
        try {
          const existingEmpNotif = await db.get(
            `SELECT id FROM notifications WHERE user_role = 'employer' AND user_id = ? AND meta_json LIKE ? LIMIT 1`,
            [empUserId, `%"transaction_id":"${tx.id}"%`]
          );

          if (!existingEmpNotif) {
            const notifId = genId("notif");
            await db.run(
              `INSERT INTO notifications (id, user_id, user_role, kind, title, body, link, meta_json, created_at)
               VALUES (?, ?, 'employer', 'transaction', ?, ?, '/dashboard/billing', ?, CURRENT_TIMESTAMP)`,
              [
                notifId,
                empUserId,
                `💳 Транзакция ${amountStr}`,
                `Операция по вашему счёту: ${amountStr}. ${tx.description || tx.note || ""}`,
                JSON.stringify({ transaction_id: tx.id, amount_rr: tx.amount_rr }),
              ]
            );
          }
        } catch (e: any) {
          console.error("[Notifications] Failed to record notification for employer:", e.message);
        }
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

/**
 * Sends a Telegram notification respecting individual vacancy notification routing.
 * If the vacancy has custom_enabled = true and group/channel IDs configured, messages are routed there.
 * Otherwise, falls back to employer's default telegram chat ID.
 */
export async function sendVacancyTelegramNotification(
  db: ProTalkDbWrapper,
  projectId: string,
  messageText: string
): Promise<{ sent: number; targets: string[] }> {
  const sentTargets: string[] = [];
  try {
    if (!db || !projectId || !messageText) return { sent: 0, targets: [] };

    const proj = await db.get("SELECT id, employer_id, notifications_config FROM projects WHERE id = ? OR public_id = ? LIMIT 1", [projectId, projectId]);
    let customEnabled = false;
    let customChatIds: string[] = [];

    if (proj?.notifications_config) {
      try {
        const notifCfg = typeof proj.notifications_config === "string" ? JSON.parse(proj.notifications_config) : proj.notifications_config;
        if (notifCfg && notifCfg.custom_enabled) {
          customEnabled = true;
          const rawIds = [notifCfg.telegram_group_ids, notifCfg.telegram_channel_ids, notifCfg.telegram_user_ids].filter(Boolean).join(",");
          customChatIds = rawIds.split(",").map((s: string) => s.trim()).filter(Boolean);
        }
      } catch (e) {
        console.warn("[Telegram] Error parsing vacancy notifications_config:", e);
      }
    }

    if (customEnabled && customChatIds.length > 0) {
      for (const target of customChatIds) {
        let cleanTarget = target.replace(/^(https?:\/\/)?(t\.me|telegram\.me)\//i, "");
        if (!cleanTarget.startsWith("@") && !/^-?\d+$/.test(cleanTarget)) {
          cleanTarget = `@${cleanTarget}`;
        }
        try {
          await sendTelegramMessage(db, cleanTarget, messageText);
          sentTargets.push(cleanTarget);
        } catch (err: any) {
          console.error(`[Telegram] Failed to send vacancy notification to ${cleanTarget}:`, err.message);
        }
      }
      return { sent: sentTargets.length, targets: sentTargets };
    }

    // Fallback: employer default telegram
    if (proj?.employer_id) {
      const emp = await db.get("SELECT telegram_chat_id, contact_telegram, telegram_username FROM employers WHERE id = ? OR public_id = ? LIMIT 1", [proj.employer_id, proj.employer_id]);
      const rawTg = emp?.telegram_chat_id || emp?.contact_telegram || emp?.telegram_username;
      if (rawTg && typeof rawTg === "string" && rawTg.trim()) {
        let empChatId = rawTg.trim().replace(/^(https?:\/\/)?(t\.me|telegram\.me)\//i, "");
        if (!empChatId.startsWith("@") && !/^-?\d+$/.test(empChatId)) {
          empChatId = `@${empChatId}`;
        }
        await sendTelegramMessage(db, empChatId, messageText);
        sentTargets.push(empChatId);
      }
    }
  } catch (err: any) {
    console.error("[Telegram] Error in sendVacancyTelegramNotification:", err.message);
  }
  return { sent: sentTargets.length, targets: sentTargets };
}

