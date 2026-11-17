import { Router, Request, Response } from "express";
import { getProTalkDB, queryRun } from "../../db";
import {
  getTelegramTokenFromDB,
  processPendingTransactionNotifications,
  getTelegramBotConfig,
  cleanTelegramBaseUrl,
  PROXY_PRESETS,
  TelegramBotConfig,
} from "../../telegram";
import { executeDatabaseBackup } from "../../backup";
import { employerSessions } from "../auth";

export const adminAuthTelegramRouter = Router();

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "wkL35eTm";

function genId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).substring(2, 10)}${Date.now().toString(36)}`;
}

adminAuthTelegramRouter.post(["/auth/verify", "/admin/auth/verify"], (req: Request, res: Response) => {
  const { password } = req.body || {};
  if (password === ADMIN_PASSWORD) {
    return res.json({ success: true, message: "Авторизация успешна" });
  }
  return res.status(401).json({ success: false, error: "Неверный пароль администратора" });
});

async function handleAdminSessionCheck(req: Request, res: Response) {
  try {
    const authHeader = req.headers.authorization || (req.headers["x-employer-token"] as string);
    const token =
      (authHeader ? authHeader.replace("Bearer ", "").trim() : "") ||
      (req.query.token as string) ||
      (req.body?.token as string) ||
      "";
    const rawEmpParam =
      (req.query.employerId as string) ||
      (req.headers["x-employer-id"] as string) ||
      (req.body?.employerId as string) ||
      (req.body?.employer_id as string) ||
      "";
    const emailParam = (req.query.email as string) || (req.body?.email as string) || "";
    const db = await getProTalkDB();

    let emp: any = null;

    if (token && employerSessions[token]) {
      const sess = employerSessions[token];
      if (sess?.id || sess?.public_id || sess?.email) {
        emp = await db.get(
          "SELECT id, public_id, email, name, role FROM employers WHERE id = ? OR CAST(public_id AS TEXT) = ? OR LOWER(email) = LOWER(?) LIMIT 1",
          [sess.id || "", String(sess.public_id || ""), sess.email || ""]
        );
      }
      if (!emp) emp = sess;
    }

    if (!emp && token) {
      const rawPart = token.replace("emp_token_", "").trim();
      emp = await db.get(
        "SELECT id, public_id, email, name, role FROM employers WHERE id = ? OR CAST(public_id AS TEXT) = ? OR id = ? OR CAST(public_id AS TEXT) = ? LIMIT 1",
        [token, token, rawPart, `emp-${rawPart}`]
      );
    }

    if (!emp && rawEmpParam) {
      const clean = String(rawEmpParam).replace(/^emp-?/i, "").trim();
      emp = await db.get(
        "SELECT id, public_id, email, name, role FROM employers WHERE id = ? OR CAST(public_id AS TEXT) = ? OR id = ? OR CAST(public_id AS TEXT) = ? LIMIT 1",
        [rawEmpParam, rawEmpParam, clean, `emp-${clean}`]
      );
    }

    if (!emp && emailParam) {
      const normEmail = emailParam.toLowerCase().trim();
      emp = await db.get(
        "SELECT id, public_id, email, name, role FROM employers WHERE LOWER(email) = ? OR LOWER(contact_email) = ? LIMIT 1",
        [normEmail, normEmail]
      );
    }

    if (emp) {
      const isAdm =
        emp.role === "admin" ||
        String(emp.role || "").toLowerCase() === "admin" ||
        emp.is_admin === 1 ||
        emp.is_admin === true ||
        String(emp.public_id) === "100007" ||
        (emp.email && emp.email.toLowerCase() === "shishkarnem@gmail.com");

      if (isAdm && emp.role !== "admin") {
        try {
          await db.run("UPDATE employers SET role = 'admin' WHERE id = ?", [emp.id]);
        } catch {}
      }

      return res.json({
        success: true,
        isAdmin: isAdm,
        user: {
          id: emp.id,
          publicId: emp.public_id,
          public_id: emp.public_id,
          name: emp.name,
          email: emp.email,
          role: isAdm ? "admin" : emp.role || "employer",
        },
      });
    }

    return res.json({ success: false, isAdmin: false });
  } catch (err: any) {
    return res.status(500).json({ success: false, isAdmin: false, error: err.message });
  }
}

adminAuthTelegramRouter.get(["/session-check", "/auth/session-check"], handleAdminSessionCheck);
adminAuthTelegramRouter.post(["/session-check", "/auth/session-check"], handleAdminSessionCheck);

adminAuthTelegramRouter.post(["/auth/login-admin", "/login-admin"], async (req: Request, res: Response) => {
  try {
    const { password, employerId, email } = req.body || {};
    const db = await getProTalkDB();

    if (password === ADMIN_PASSWORD) {
      const adminRow = (await db.get(
        "SELECT id, public_id, email, name, role FROM employers WHERE role = 'admin' OR CAST(public_id AS TEXT) = '100007' LIMIT 1"
      )) || {
        id: "emp-100007",
        public_id: "100007",
        email: "shishkarnem@gmail.com",
        name: "Администратор",
        role: "admin",
      };

      const adminToken = `emp_token_${adminRow.id || "emp-100007"}`;
      employerSessions[adminToken] = adminRow;

      return res.json({
        success: true,
        isAdmin: true,
        token: adminToken,
        user: {
          id: adminRow.id,
          publicId: adminRow.public_id || "100007",
          public_id: adminRow.public_id || "100007",
          name: adminRow.name,
          email: adminRow.email,
          role: "admin",
        },
      });
    }

    let emp: any = null;
    if (employerId) {
      const clean = String(employerId).replace(/^emp-?/i, "").trim();
      emp = await db.get(
        "SELECT id, public_id, email, name, role FROM employers WHERE id = ? OR CAST(public_id AS TEXT) = ? OR id = ? OR CAST(public_id AS TEXT) = ? LIMIT 1",
        [employerId, employerId, clean, `emp-${clean}`]
      );
    }
    if (!emp && email) {
      const normEmail = String(email).toLowerCase().trim();
      emp = await db.get(
        "SELECT id, public_id, email, name, role FROM employers WHERE LOWER(email) = ? OR LOWER(contact_email) = ? LIMIT 1",
        [normEmail, normEmail]
      );
    }

    if (emp) {
      const isAdm =
        emp.role === "admin" ||
        String(emp.role || "").toLowerCase() === "admin" ||
        emp.is_admin === 1 ||
        emp.is_admin === true ||
        String(emp.public_id) === "100007" ||
        (emp.email && emp.email.toLowerCase() === "shishkarnem@gmail.com");

      if (isAdm) {
        const token = `emp_token_${emp.id}`;
        employerSessions[token] = emp;
        return res.json({
          success: true,
          isAdmin: true,
          token,
          user: {
            id: emp.id,
            publicId: emp.public_id,
            public_id: emp.public_id,
            name: emp.name,
            email: emp.email,
            role: "admin",
          },
        });
      }
    }

    return res.status(401).json({ success: false, error: "Неверные учетные данные администратора" });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

adminAuthTelegramRouter.get(["/bot-settings", "/api/admin/bot-settings"], async (_req: Request, res: Response) => {
  try {
    const config = await getTelegramBotConfig();
    const rawToken = config.botToken || "";
    const maskedToken =
      rawToken.length > 12
        ? `${rawToken.substring(0, 6)}••••••••${rawToken.substring(rawToken.length - 4)}`
        : rawToken
        ? "••••••••••••"
        : "";

    return res.json({
      success: true,
      botUsername: config.botUsername,
      proxyType: config.proxyType || "dialog_ai",
      apiBaseUrl: config.apiBaseUrl,
      adminTelegramId: config.adminTelegramId,
      isTokenConfigured: Boolean(rawToken),
      maskedToken,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

adminAuthTelegramRouter.post(["/bot-settings", "/api/admin/bot-settings"], async (req: Request, res: Response) => {
  try {
    const { botToken, botUsername, proxyType, apiBaseUrl, adminTelegramId } = req.body || {};
    const current = await getTelegramBotConfig();

    let resolvedBaseUrl = PROXY_PRESETS.dialog_ai;
    if (proxyType === "dialog_ai") {
      resolvedBaseUrl = PROXY_PRESETS.dialog_ai;
    } else if (proxyType === "direct") {
      resolvedBaseUrl = PROXY_PRESETS.direct;
    } else if (proxyType === "custom_cloudflare") {
      resolvedBaseUrl = cleanTelegramBaseUrl(apiBaseUrl || "");
    }

    const finalToken =
      !botToken || typeof botToken !== "string" || botToken.includes("•••") || !botToken.trim()
        ? current.botToken
        : botToken.trim();

    const updated: TelegramBotConfig = {
      ...current,
      botToken: finalToken,
      botUsername: botUsername?.trim() || current.botUsername,
      proxyType: proxyType || "dialog_ai",
      apiBaseUrl: resolvedBaseUrl,
      adminTelegramId: adminTelegramId?.trim() || current.adminTelegramId,
    };

    const db = await getProTalkDB();
    await queryRun(
      `INSERT INTO telegram_bot_config (id, config_json)
       VALUES ('default', ?)
       ON CONFLICT (id) DO UPDATE SET config_json = EXCLUDED.config_json`,
      [JSON.stringify(updated)]
    );

    try {
      await db.run("UPDATE telegram_bots SET is_active = 0");
      await db.run(
        `INSERT INTO telegram_bots (id, bot_name, bot_username, bot_token, status, mode, welcome_message, is_active, updated_at)
         VALUES (?, 'RoboRecruiter Telegram Bot', ?, ?, 'active', 'webhook_and_polling', 'Привет!', 1, NOW())`,
        [genId("tg-bot"), updated.botUsername, updated.botToken]
      );
    } catch {}

    return res.json({
      success: true,
      message: "Настройки успешно сохранены в PostgreSQL",
      config: {
        ...updated,
        botToken: undefined,
        isTokenConfigured: Boolean(finalToken),
      },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

adminAuthTelegramRouter.post(["/backup/trigger", "/api/admin/backup/trigger"], async (_req: Request, res: Response) => {
  try {
    const result = await executeDatabaseBackup("Ручной запуск из Панели Системного Админа");
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

adminAuthTelegramRouter.get("/telegram-token", async (_req: Request, res: Response) => {
  try {
    const db = await getProTalkDB();
    const token = await getTelegramTokenFromDB(db);
    const tokenRow = await db.get(
      "SELECT * FROM telegram_bots WHERE COALESCE(is_active::text, '0') IN ('1', 'true', 't') ORDER BY updated_at DESC NULLS LAST LIMIT 1"
    );
    return res.json({
      success: true,
      token,
      details: tokenRow || null,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

adminAuthTelegramRouter.post("/telegram-token", async (req: Request, res: Response) => {
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

adminAuthTelegramRouter.post("/test-telegram-notification", async (_req: Request, res: Response) => {
  try {
    const db = await getProTalkDB();

    let emp = await db.get(
      "SELECT * FROM employers WHERE CAST(public_id AS TEXT) = '100007' OR CAST(public_id AS TEXT) = '1000007' OR id = '100007' OR LOWER(email) = 'shishkarnem@gmail.com' LIMIT 1"
    );
    if (!emp) {
      emp = await db.get("SELECT * FROM employers LIMIT 1");
    }
    if (!emp) {
      return res.status(404).json({ success: false, error: "Employer not found in PostgreSQL BD ProTalk" });
    }

    let wallet = await db.get("SELECT id FROM wallets WHERE employer_id = ? LIMIT 1", [emp.id]);
    if (!wallet) {
      const wId = genId("wall");
      await db.run("INSERT INTO wallets (id, employer_id, units_balance) VALUES (?, ?, ?)", [
        wId,
        emp.id,
        Number(emp.balance || 0),
      ]);
      wallet = { id: wId };
    }

    const testTxId = genId("tx-test");
    const testAmount = 100;
    const testNote = "Тестовая транзакция для проверки Telegram-уведомления (пользователь 100007)";

    await db.run(
      `INSERT INTO transactions (id, wallet_id, amount_rr, type, type_balance, description, note, ref_table, ref_id, created_at)
       VALUES (?, ?, ?, 'test_bonus', 'admin', 'Тестовая транзакция 100007', ?, 'employers', ?, NOW())`,
      [testTxId, wallet.id, testAmount, testNote, emp.id]
    );

    const processedCount = await processPendingTransactionNotifications(db);
    const sentRecord = await db.get(
      "SELECT * FROM transaction_telegram_notifications WHERE transaction_id = ? LIMIT 1",
      [testTxId]
    );
    const notifRecord = await db.get(
      "SELECT * FROM notifications ORDER BY created_at DESC NULLS LAST LIMIT 1"
    );
    const activeToken = await getTelegramTokenFromDB(db);

    return res.json({
      success: true,
      message: "Тестовая транзакция создана и отправлена в Telegram!",
      test_user: {
        id: emp.id,
        public_id: emp.public_id,
        email: emp.email || emp.contact_email,
      },
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
