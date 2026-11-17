import { Router, Request, Response } from "express";
import crypto from "crypto";
import { getProTalkDB, recalculateEmployerBalances, checkRateLimit, PgDBWrapper } from "../../db";
import { getTelegramTokenFromDB, sendTelegramMessage, processPendingTransactionNotifications } from "../../telegram";
import { genId } from "./helpers";

export const robokassaRouter = Router();

export interface RobokassaSettings {
  merchantLogin: string;
  password1: string;
  password2: string;
  isTest: boolean;
  taxRate: string | null;
  itemName: string;
  domain?: string;
  resultUrl?: string;
  successUrl?: string;
  failUrl?: string;
  hashAlgorithm?: string;
  domain1?: string;
  domain2?: string;
}

export const DEFAULT_ROBOKASSA_ONLINE_SETTINGS: RobokassaSettings = {
  merchantLogin: "hr-rr.online",
  password1: "hrPass1_2026",
  password2: "hrPass2_2026",
  isTest: false,
  taxRate: null,
  itemName: "Цифровые единицы RR",
  domain: "https://hr-rr.online",
  resultUrl: "https://hr-rr.online/api/payments/robokassa/result",
  successUrl: "https://hr-rr.online/payment/success",
  failUrl: "https://hr-rr.online/payment/fail",
  hashAlgorithm: "MD5",
};

export const DEFAULT_ROBOKASSA_RU_SETTINGS: RobokassaSettings = {
  merchantLogin: "hr-rr.ru",
  password1: "hrPass1_2026",
  password2: "hrPass2_2026",
  isTest: false,
  taxRate: null,
  itemName: "Цифровые единицы RR",
  domain: "https://hr-rr.ru",
  resultUrl: "https://hr-rr.ru/api/payments/robokassa/result",
  successUrl: "https://hr-rr.ru/payment/success",
  failUrl: "https://hr-rr.ru/payment/fail",
  hashAlgorithm: "MD5",
};

export async function getRobokassaSettingsFromDB(targetDomain?: string): Promise<RobokassaSettings> {
  try {
    const db = await getProTalkDB();
    const isRu = Boolean(targetDomain && (targetDomain.includes("hr-rr.ru") || targetDomain.endsWith(".ru")));
    const key = isRu ? "robokassa:hr-rr.ru" : "robokassa:hr-rr.online";
    const defaultSettings = isRu ? DEFAULT_ROBOKASSA_RU_SETTINGS : DEFAULT_ROBOKASSA_ONLINE_SETTINGS;

    const row =
      (await db.get("SELECT config_json FROM system_configs WHERE id = ? LIMIT 1", [key])) ||
      (!isRu ? await db.get("SELECT config_json FROM system_configs WHERE id = 'robokassa' LIMIT 1") : null);

    if (row?.config_json) {
      const parsed = typeof row.config_json === "string" ? JSON.parse(row.config_json) : row.config_json;
      return { ...defaultSettings, ...parsed };
    }
    return defaultSettings;
  } catch {
    return targetDomain?.includes("hr-rr.ru") ? DEFAULT_ROBOKASSA_RU_SETTINGS : DEFAULT_ROBOKASSA_ONLINE_SETTINGS;
  }
}

export async function getAllRobokassaSettingsFromDB(): Promise<{ online: RobokassaSettings; ru: RobokassaSettings }> {
  const online = await getRobokassaSettingsFromDB("hr-rr.online");
  const ru = await getRobokassaSettingsFromDB("hr-rr.ru");
  return { online, ru };
}

robokassaRouter.get("/admin/telegram-token", async (_req: Request, res: Response) => {
  try {
    const db = await getProTalkDB();
    const token = await getTelegramTokenFromDB(db);
    const tokenRow = await db.get("SELECT * FROM telegram_bots WHERE is_active = 1 ORDER BY updated_at DESC LIMIT 1");
    return res.json({ success: true, token, details: tokenRow || null });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

robokassaRouter.post("/admin/telegram-token", async (req: Request, res: Response) => {
  try {
    const { token, bot_username } = req.body || {};
    if (!token || typeof token !== "string" || !token.trim()) {
      return res.status(400).json({ success: false, error: "Token is required" });
    }
    const cleanToken = token.trim();
    const cleanUsername = (bot_username || "@RoboRecrutBot").trim();
    const db = await getProTalkDB();

    await db.run("UPDATE telegram_bots SET is_active = 0");
    await db.run(
      `INSERT INTO telegram_bots (id, bot_name, bot_username, bot_token, status, mode, welcome_message, is_active, updated_at)
       VALUES (?, 'RoboRecruiter Telegram Bot', ?, ?, 'active', 'webhook_and_polling', 'Привет!', 1, NOW())`,
      [genId("tg-bot"), cleanUsername, cleanToken]
    );

    return res.json({
      success: true,
      token: cleanToken,
      message: "Telegram token saved to PostgreSQL BD ProTalk successfully",
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

robokassaRouter.post("/admin/test-telegram-notification", async (_req: Request, res: Response) => {
  try {
    const db = await getProTalkDB();
    let emp = await db.get(
      "SELECT * FROM employers WHERE CAST(public_id AS TEXT) = '100007' OR CAST(public_id AS TEXT) = '1000007' OR id = '100007' OR LOWER(email) = 'shishkarnem@gmail.com' LIMIT 1"
    );
    if (!emp) emp = await db.get("SELECT * FROM employers LIMIT 1");
    if (!emp) return res.status(404).json({ success: false, error: "Employer not found in PostgreSQL BD ProTalk" });

    let wallet = await db.get("SELECT id FROM wallets WHERE employer_id = ?", [emp.id]);
    if (!wallet) {
      const wId = genId("wall");
      await db.run("INSERT INTO wallets (id, employer_id, units_balance) VALUES (?, ?, ?)", [wId, emp.id, Number(emp.balance || 0)]);
      wallet = { id: wId };
    }

    const testTxId = genId("tx-test");
    const testAmount = 100;
    const testNote = "Тестовая транзакция для проверки Telegram-уведомления (пользователь 1000007)";

    await db.run(
      `INSERT INTO transactions (id, wallet_id, amount_rr, type, type_balance, description, note, ref_table, ref_id, created_at)
       VALUES (?, ?, ?, 'test_bonus', 'admin', 'Тестовая транзакция 1000007', ?, 'employers', ?, NOW())`,
      [testTxId, wallet.id, testAmount, testNote, emp.id]
    );

    await recalculateEmployerBalances(db, emp.id);
    const processedCount = await processPendingTransactionNotifications(db);
    const sentRecord = await db.get("SELECT * FROM transaction_telegram_notifications WHERE transaction_id = ?", [testTxId]);
    const notifRecord = await db.get("SELECT * FROM notifications ORDER BY created_at DESC LIMIT 1");
    const activeToken = await getTelegramTokenFromDB(db);

    return res.json({
      success: true,
      message: "Тестовое уведомление обработано",
      test_user: { id: emp.id, public_id: emp.public_id, email: emp.email || emp.contact_email },
      transaction_id: testTxId,
      processedCount,
      telegram_sent: sentRecord || null,
      admin_notification: notifRecord || null,
      active_token: activeToken,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

robokassaRouter.all(["/payments/robokassa/initiate", "/robokassa/create", "/payments/robokassa/create"], async (req: Request, res: Response) => {
  try {
    const clientIp = (req.headers["x-forwarded-for"] as string) || req.ip || "local";
    const rl = await checkRateLimit(`robokassa:create:${clientIp}`, 30, 60);
    if (!rl.allowed) {
      return res.status(429).json({ ok: false, error: "rate_limited", retryAfterSeconds: rl.retryAfterSeconds });
    }

    const payload = { ...(req.query || {}), ...(req.body || {}) };
    const { employer_id, employerId, userId, payPrice, baseEnergy, baseIikr, amount_rub, rr_amount, bonus_rr, description, domain } = payload;

    const rawEmp = employer_id || employerId || userId || "100007";
    const cleanEmp = String(rawEmp).replace(/^emp/i, "");
    const db = await getProTalkDB();
    const emp =
      (await db.get("SELECT * FROM employers WHERE id = ? OR CAST(public_id AS TEXT) = ? OR CAST(public_id AS TEXT) = ? LIMIT 1", [
        rawEmp,
        String(rawEmp),
        cleanEmp,
      ])) || (await db.get("SELECT * FROM employers LIMIT 1"));

    if (!emp) return res.status(404).json({ ok: false, error: "employer_not_found" });

    const rub = Math.max(100, Math.floor(Number(payPrice || amount_rub || rr_amount || baseEnergy || baseIikr || 1000)));
    const rrQty = Math.max(100, Math.floor(Number(rr_amount || baseEnergy || baseIikr || amount_rub || rub)));
    const bonus = Math.max(0, Math.floor(Number(bonus_rr || 0)));
    const outSum = rub.toFixed(2);

    const maxInvRow = await db.get("SELECT MAX(CAST(inv_id AS INTEGER)) as max_inv FROM payments_robokassa WHERE inv_id ~ '^[0-9]+$'");
    const invId = String((Number(maxInvRow?.max_inv) || 10000) + 1);

    const rawDomain = String(domain || payload.origin || req.headers.origin || req.headers.referer || req.headers.host || "");
    const isRuDomain = rawDomain.includes("hr-rr.ru");
    const targetDomainKey = isRuDomain ? "hr-rr.ru" : "hr-rr.online";
    const rkSettings = await getRobokassaSettingsFromDB(targetDomainKey);
    const itemName = rkSettings.itemName || "Цифровые единицы RR";

    const receiptObj = {
      items: [{ name: itemName, quantity: rrQty, sum: rub, tax: null }],
    };
    const receiptJson = JSON.stringify(receiptObj);

    const shpParams: Record<string, string> = {
      Shp_employerId: String(emp.public_id || cleanEmp),
      Shp_rrAmount: String(rrQty),
      Shp_userId: String(emp.user_id || emp.id || cleanEmp),
    };
    const shpSignString = Object.keys(shpParams)
      .sort()
      .map((k) => `${k}=${shpParams[k]}`)
      .join(":");

    const rawSignatureString = `${rkSettings.merchantLogin}:${outSum}:${invId}:${receiptJson}:${rkSettings.password1}:${shpSignString}`;
    const signature = crypto.createHash("md5").update(rawSignatureString).digest("hex");

    const desc = description || `${itemName} (${rrQty} RR)`;
    const payId = `rk-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    await db.run(
      `INSERT INTO payments_robokassa (
        id, inv_id, user_id, employer_id, package_code, amount_rub, "rr_Resource", bonus_rr,
        status, robokassa_out_sum, signature_ok, description, offer_accepted, raw_payload,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, '0', ?, '1', ?, NOW(), NOW())`,
      [
        payId,
        invId,
        emp.user_id || emp.id,
        emp.id,
        rub >= 10000 ? "enterprise" : rub >= 3000 ? "pro" : "start",
        String(rub),
        String(rrQty),
        String(bonus),
        outSum,
        desc,
        JSON.stringify({
          receipt: receiptObj,
          shp: shpParams,
          req: payload,
          merchantLogin: rkSettings.merchantLogin,
          domain: isRuDomain ? "https://hr-rr.ru" : "https://hr-rr.online",
        }),
      ]
    );

    const fields: Record<string, string> = {
      MerchantLogin: rkSettings.merchantLogin,
      OutSum: outSum,
      InvId: invId,
      Description: desc,
      SignatureValue: signature,
      Receipt: receiptJson,
      ...shpParams,
    };
    if (rkSettings.isTest) fields.IsTest = "1";

    const robokassaBaseUrl = "https://auth.robokassa.ru/Merchant/Index.aspx";
    const queryString = Object.entries(fields)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join("&");

    return res.json({
      ok: true,
      action: robokassaBaseUrl,
      method: "POST",
      fields,
      payment_url: `${robokassaBaseUrl}?${queryString}`,
      inv_id: invId,
      payment_id: payId,
      receipt: receiptObj,
      out_sum: outSum,
      merchantLogin: rkSettings.merchantLogin,
      domain: isRuDomain ? "https://hr-rr.ru" : "https://hr-rr.online",
    });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

async function completeRobokassaPayment(
  db: PgDBWrapper,
  invId: string,
  outSum: string,
  rawPayload: any
): Promise<{ success: boolean; error?: string; credited?: number; employerId?: string }> {
  const paymentRow = await db.get("SELECT * FROM payments_robokassa WHERE inv_id = ? LIMIT 1", [invId]);
  if (!paymentRow) return { success: false, error: `Payment not found for InvId ${invId}` };

  if (["completed", "paid", "success"].includes(paymentRow.status)) {
    return { success: true, credited: Number(paymentRow.rr_Resource || paymentRow.amount_rub || 0), employerId: paymentRow.employer_id };
  }

  const empId = paymentRow.employer_id;
  const cleanEmp = String(empId).replace(/^emp/i, "");
  const emp = await db.get("SELECT * FROM employers WHERE id = ? OR CAST(public_id AS TEXT) = ? OR CAST(public_id AS TEXT) = ? LIMIT 1", [
    empId,
    String(empId),
    cleanEmp,
  ]);
  if (!emp) return { success: false, error: `Employer not found: ${empId}` };

  const rrCredit = Math.max(100, Math.floor(Number(paymentRow.rr_Resource || paymentRow.amount_rub || outSum || 1000)));
  const bonus = Math.max(0, Math.floor(Number(paymentRow.bonus_rr || 0)));
  const totalAdded = rrCredit + bonus;
  const rub = Number(outSum || paymentRow.amount_rub || rrCredit);

  await db.run(
    `UPDATE payments_robokassa SET status = 'completed', signature_ok = '1', paid_at = NOW(), updated_at = NOW(), robokassa_out_sum = ? WHERE id = ?`,
    [String(rub), paymentRow.id]
  );

  let wallet = await db.get("SELECT * FROM wallets WHERE employer_id = ? LIMIT 1", [emp.id]);
  if (!wallet) {
    const wId = genId("wall");
    await db.run("INSERT INTO wallets (id, employer_id, units_balance) VALUES (?, ?, ?)", [wId, emp.id, Number(emp.balance || 0)]);
    wallet = { id: wId };
  }

  const txId = genId("tx-rk");
  const desc = paymentRow.description || `Пополнение баланса (Робокасса: ${rub} ₽)`;
  await db.run(
    `INSERT INTO transactions (id, wallet_id, amount_rr, type, type_balance, description, note, ref_table, ref_id, created_at)
     VALUES (?, ?, ?, 'topup', 'pay', ?, ?, 'payments_robokassa', ?, NOW())`,
    [txId, wallet.id, totalAdded, desc, `${desc} [Счет #${invId}]`, paymentRow.id]
  );

  try {
    await db.run(
      `INSERT INTO payments (id, employer_id, company_name, amount, item_type, item_name, status, data_json, created_at)
       VALUES (?, ?, ?, ?, 'robokassa', ?, 'completed', ?, NOW()) ON CONFLICT (id) DO NOTHING`,
      [genId("pay"), emp.id, emp.company_name || "", rub, desc, JSON.stringify(rawPayload)]
    );
  } catch {}

  try {
    await db.run(
      `INSERT INTO payment_history (id, employer_id, amount_rr, type, note, created_at)
       VALUES (?, ?, ?, 'robokassa', ?, NOW()) ON CONFLICT (id) DO NOTHING`,
      [genId("ph"), emp.id, totalAdded, `${desc} [Счет #${invId}]`]
    );
  } catch {}

  await recalculateEmployerBalances(db, emp.id);

  try {
    const adminTgId = process.env.ADMIN_TELEGRAM_ID || "169262990";
    const msg =
      `<b>⚡️ Успешная оплата через Робокассу!</b>\n\n` +
      `<b>🧾 Счет:</b> <code>#${invId}</code>\n` +
      `<b>👤 Работодатель:</b> ${emp.name || emp.display_name || emp.email || "Работодатель"} (ID: <code>${emp.public_id || emp.id}</code>)\n` +
      `<b>💵 Сумма:</b> <b>${rub.toLocaleString("ru-RU")} ₽</b>\n` +
      `<b>🪙 Зачислено:</b> <b>+${totalAdded.toLocaleString("ru-RU")} RR</b>\n` +
      `<b>📦 Позиция в чеке:</b> <code>Цифровые единицы RR</code> (НДС: null)\n` +
      `<b>🕒 Время:</b> ${new Date().toLocaleString("ru-RU")}`;
    await sendTelegramMessage(db, adminTgId, msg);
  } catch (tgErr: any) {
    console.warn("[Telegram notify error]:", tgErr?.message);
  }

  return { success: true, credited: totalAdded, employerId: emp.id };
}

robokassaRouter.all(["/payments/robokassa/result", "/robokassa/result"], async (req: Request, res: Response) => {
  try {
    const db = await getProTalkDB();
    const data = { ...(req.query || {}), ...(req.body || {}) };
    const outSum = String(data.OutSum || data.out_sum || "");
    const invId = String(data.InvId || data.inv_id || "");
    const signature = String(data.SignatureValue || data.signature || "").toUpperCase();

    if (!outSum || !invId) return res.status(400).send("ERROR: OutSum and InvId are required");

    const paymentRow = await db.get("SELECT * FROM payments_robokassa WHERE inv_id = ? LIMIT 1", [invId]);
    let isRu = false;
    if (paymentRow?.raw_payload) {
      try {
        const parsed = JSON.parse(paymentRow.raw_payload);
        if (parsed?.merchantLogin?.includes("hr-rr.ru") || parsed?.domain?.includes("hr-rr.ru")) isRu = true;
      } catch {}
    } else if (String(data.MerchantLogin || req.headers.host || "").includes("hr-rr.ru")) {
      isRu = true;
    }

    const rkSettings = await getRobokassaSettingsFromDB(isRu ? "hr-rr.ru" : "hr-rr.online");
    const fallbackSettings = await getRobokassaSettingsFromDB(isRu ? "hr-rr.online" : "hr-rr.ru");

    const shpParams: Record<string, string> = {};
    for (const [k, v] of Object.entries(data)) {
      if (k.startsWith("Shp_") || k.startsWith("shp_")) shpParams[k] = String(v);
    }
    const sortedShpKeys = Object.keys(shpParams).sort();
    const shpStr = sortedShpKeys.length > 0 ? ":" + sortedShpKeys.map((k) => `${k}=${shpParams[k]}`).join(":") : "";

    let calculatedSign = crypto.createHash("md5").update(`${outSum}:${invId}:${rkSettings.password2}${shpStr}`).digest("hex").toUpperCase();
    if (calculatedSign !== signature) {
      const fb = crypto.createHash("md5").update(`${outSum}:${invId}:${fallbackSettings.password2}${shpStr}`).digest("hex").toUpperCase();
      if (fb === signature) calculatedSign = fb;
    }

    if (calculatedSign !== signature) {
      try {
        await db.run(`UPDATE payments_robokassa SET signature_ok = '0', raw_payload = ? WHERE inv_id = ?`, [
          JSON.stringify({ data, calculatedSign, gotSignature: signature }),
          invId,
        ]);
      } catch {}
      return res.status(400).send("bad sign");
    }

    const result = await completeRobokassaPayment(db, invId, outSum, data);
    if (!result.success) return res.status(500).send(`ERROR: ${result.error}`);
    return res.status(200).type("text/plain").send(`OK${invId}`);
  } catch (err: any) {
    return res.status(500).send(`ERROR: ${err.message}`);
  }
});

robokassaRouter.all(["/payments/robokassa/success", "/robokassa/success"], async (req: Request, res: Response) => {
  try {
    const db = await getProTalkDB();
    const data = { ...(req.query || {}), ...(req.body || {}) };
    const outSum = String(data.OutSum || data.out_sum || "");
    const invId = String(data.InvId || data.inv_id || "");
    const signature = String(data.SignatureValue || data.signature || "").toUpperCase();

    const paymentRow = await db.get("SELECT * FROM payments_robokassa WHERE inv_id = ? LIMIT 1", [invId]);
    let isRu = false;
    if (paymentRow?.raw_payload) {
      try {
        const parsed = JSON.parse(paymentRow.raw_payload);
        if (parsed?.merchantLogin?.includes("hr-rr.ru") || parsed?.domain?.includes("hr-rr.ru")) isRu = true;
      } catch {}
    } else if (String(data.MerchantLogin || req.headers.host || "").includes("hr-rr.ru")) {
      isRu = true;
    }

    const rkSettings = await getRobokassaSettingsFromDB(isRu ? "hr-rr.ru" : "hr-rr.online");
    const fallbackSettings = await getRobokassaSettingsFromDB(isRu ? "hr-rr.online" : "hr-rr.ru");
    const shpParams: Record<string, string> = {};
    for (const [k, v] of Object.entries(data)) {
      if (k.startsWith("Shp_") || k.startsWith("shp_")) shpParams[k] = String(v);
    }
    const sortedShpKeys = Object.keys(shpParams).sort();
    const shpStr = sortedShpKeys.length > 0 ? ":" + sortedShpKeys.map((k) => `${k}=${shpParams[k]}`).join(":") : "";

    let calculatedSign = crypto.createHash("md5").update(`${outSum}:${invId}:${rkSettings.password1}${shpStr}`).digest("hex").toUpperCase();
    if (signature && calculatedSign !== signature) {
      const fb = crypto.createHash("md5").update(`${outSum}:${invId}:${fallbackSettings.password1}${shpStr}`).digest("hex").toUpperCase();
      if (fb === signature) calculatedSign = fb;
    }

    if (signature && calculatedSign === signature) {
      await completeRobokassaPayment(db, invId, outSum, data);
    }
    return res.redirect(`/payment/success?InvId=${encodeURIComponent(invId)}`);
  } catch {
    return res.redirect("/payment/success");
  }
});

robokassaRouter.all(["/payments/robokassa/fail", "/robokassa/fail"], async (req: Request, res: Response) => {
  try {
    const data = { ...(req.query || {}), ...(req.body || {}) };
    const invId = String(data.InvId || data.inv_id || "");
    if (invId) {
      const db = await getProTalkDB();
      await db.run("UPDATE payments_robokassa SET status = 'fail', updated_at = NOW() WHERE inv_id = ?", [invId]);
    }
  } catch {}
  return res.redirect("/payment/fail");
});

robokassaRouter.get("/robokassa/settings", async (_req: Request, res: Response) => {
  try {
    const { online, ru } = await getAllRobokassaSettingsFromDB();
    return res.json({ ok: true, settings: online, onlineSettings: online, ruSettings: ru });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

robokassaRouter.post("/robokassa/settings", async (req: Request, res: Response) => {
  try {
    const db = await getProTalkDB();
    const { onlineSettings, ruSettings, settings } = req.body || {};
    const currentOnline = await getRobokassaSettingsFromDB("hr-rr.online");
    const currentRu = await getRobokassaSettingsFromDB("hr-rr.ru");

    const updatedOnline: RobokassaSettings = {
      ...currentOnline,
      ...(onlineSettings || (settings?.merchantLogin === "hr-rr.online" ? settings : {})),
    };
    const updatedRu: RobokassaSettings = {
      ...currentRu,
      ...(ruSettings || (settings?.merchantLogin === "hr-rr.ru" ? settings : {})),
    };

    for (const [key, val] of [
      ["robokassa:hr-rr.online", updatedOnline],
      ["robokassa:hr-rr.ru", updatedRu],
      ["robokassa", updatedOnline],
    ] as const) {
      await db.run(
        `INSERT INTO system_configs (id, config_json, updated_at) VALUES (?, ?, NOW())
         ON CONFLICT (id) DO UPDATE SET config_json = EXCLUDED.config_json, updated_at = NOW()`,
        [key, JSON.stringify(val)]
      );
    }

    return res.json({ ok: true, settings: updatedOnline, onlineSettings: updatedOnline, ruSettings: updatedRu });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

robokassaRouter.get("/robokassa/payments", async (req: Request, res: Response) => {
  try {
    const db = await getProTalkDB();
    const rawEmp = (req.query.employer_id as string) || (req.query.employerId as string) || "";
    if (rawEmp) {
      const cleanEmp = rawEmp.replace(/^emp/i, "");
      const emp = await db.get("SELECT id, public_id, user_id FROM employers WHERE id = ? OR CAST(public_id AS TEXT) = ? OR CAST(public_id AS TEXT) = ? LIMIT 1", [
        rawEmp,
        rawEmp,
        cleanEmp,
      ]);
      const rows = await db.all(
        `SELECT * FROM payments_robokassa WHERE employer_id IN (?, ?) OR user_id IN (?, ?) ORDER BY created_at DESC LIMIT 100`,
        [emp?.id || rawEmp, String(emp?.public_id || cleanEmp), emp?.user_id || rawEmp, emp?.id || rawEmp]
      );
      return res.json({ ok: true, payments: rows || [] });
    }
    const rows = await db.all(`SELECT * FROM payments_robokassa ORDER BY created_at DESC LIMIT 100`);
    return res.json({ ok: true, payments: rows || [] });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});
