import crypto from "crypto";
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
import { employerSessions, resolveEmployerByToken, createSignedEmployerToken, findEmployerInDB, ensureEmployerPublicId } from "../auth/helpers";

export const adminAuthTelegramRouter = Router();

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "wkL35eTm";

export const SUPER_ADMIN_ROLE_SET = new Set([
  "super_admin",
  "super-admin",
  "superadmin",
  "супер-админ",
  "суперадмин",
]);

const ADMIN_ROLE_SET = new Set([
  "admin",
  "админ",
  ...SUPER_ADMIN_ROLE_SET,
]);

export function isAdminOrSuperAdminRole(role: any): boolean {
  if (!role || typeof role !== "string") return false;
  return ADMIN_ROLE_SET.has(role.trim().toLowerCase());
}

export function isSuperAdminRole(role: any): boolean {
  if (!role || typeof role !== "string") return false;
  return SUPER_ADMIN_ROLE_SET.has(role.trim().toLowerCase());
}

export function isPrimarySuperAdminEmployer(emp: any): boolean {
  if (!emp || typeof emp !== "object") return false;
  const pid = String(emp.public_id ?? emp.publicId ?? "").replace(/^emp-?/i, "").trim();
  const empId = String(emp.id ?? "").trim();
  const email = String(emp.email ?? emp.contact_email ?? "").trim().toLowerCase();
  return (
    pid === "100007" ||
    empId === "b5396cf9-9cd0-4614-a60d-ff77bae24ed5" ||
    email === "shishkarnem@gmail.com"
  );
}

function timingSafePasswordEquals(candidate: string, expected: string): boolean {
  const a = Buffer.from(candidate, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export async function resolveAuthorizedAdminEmployer(req: Request): Promise<any | null> {
  const authHeader =
    (typeof req.headers.authorization === "string" ? req.headers.authorization : "") ||
    (typeof req.headers["x-employer-token"] === "string" ? req.headers["x-employer-token"] : "");
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;

  try {
    const db = await getProTalkDB();
    const emp = await resolveEmployerByToken(db, token);
    if (!emp) return null;
    if (!isAdminOrSuperAdminRole(emp.role)) return null;
    return emp;
  } catch {
    return null;
  }
}

export async function isAuthorizedAdminOrSysAdmin(req: Request): Promise<boolean> {
  const headerPwd = typeof req.headers["x-admin-password"] === "string" ? req.headers["x-admin-password"] : "";
  const queryPwd = typeof req.query.pwd === "string" ? req.query.pwd : "";
  const suppliedPwd = headerPwd || queryPwd;
  if (suppliedPwd && timingSafePasswordEquals(suppliedPwd, ADMIN_PASSWORD)) {
    return true;
  }

  const adminEmp = await resolveAuthorizedAdminEmployer(req);
  return Boolean(adminEmp);
}

export async function isAuthorizedSuperAdmin(req: Request): Promise<boolean> {
  const headerPwd = typeof req.headers["x-admin-password"] === "string" ? req.headers["x-admin-password"] : "";
  const queryPwd = typeof req.query.pwd === "string" ? req.query.pwd : "";
  const suppliedPwd = headerPwd || queryPwd;
  if (suppliedPwd && timingSafePasswordEquals(suppliedPwd, ADMIN_PASSWORD)) {
    return true;
  }

  const adminEmp = await resolveAuthorizedAdminEmployer(req);
  return Boolean(adminEmp && (isSuperAdminRole(adminEmp.role) || isPrimarySuperAdminEmployer(adminEmp)));
}

function genId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).substring(2, 10)}${Date.now().toString(36)}`;
}

adminAuthTelegramRouter.post(["/auth/verify", "/admin/auth/verify"], (req: Request, res: Response) => {
  const { password } = req.body || {};
  if (typeof password === "string" && timingSafePasswordEquals(password, ADMIN_PASSWORD)) {
    return res.json({ success: true, message: "Авторизация успешна" });
  }
  return res.status(401).json({ success: false, error: "Неверный пароль администратора" });
});

async function handleAdminSessionCheck(req: Request, res: Response) {
  try {
    const authHeader =
      (typeof req.headers.authorization === "string" ? req.headers.authorization : "") ||
      (typeof req.headers["x-employer-token"] === "string" ? req.headers["x-employer-token"] : "");
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();

    if (!token) {
      return res.json({ success: false, authenticated: false, isAdmin: false, user: null });
    }

    const db = await getProTalkDB();
    const emp = await resolveEmployerByToken(db, token);

    if (!emp) {
      return res.json({ success: false, authenticated: false, isAdmin: false, user: null });
    }

    const pubId = await ensureEmployerPublicId(db, emp);
    const rawRole = String(emp.role || "employer").trim();
    const dbRole =
      isPrimarySuperAdminEmployer({ ...emp, public_id: pubId }) &&
      (!rawRole || rawRole.toLowerCase() === "admin" || rawRole.toLowerCase() === "employer")
        ? "super_admin"
        : rawRole;
    const isAdm = isAdminOrSuperAdminRole(dbRole);

    return res.json({
      success: true,
      authenticated: true,
      isAdmin: isAdm,
      user: {
        id: emp.id,
        publicId: pubId,
        public_id: pubId,
        name: emp.name || emp.contact_name || "",
        email: emp.email || emp.contact_email || "",
        role: dbRole || "employer",
      },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, authenticated: false, isAdmin: false, error: err.message });
  }
}

adminAuthTelegramRouter.get(["/session-check", "/auth/session-check"], handleAdminSessionCheck);
adminAuthTelegramRouter.post(["/session-check", "/auth/session-check"], handleAdminSessionCheck);

adminAuthTelegramRouter.post(["/auth/login-admin", "/login-admin"], async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body || {};
    const emailNorm = typeof email === "string" ? email.trim().toLowerCase() : "";
    const pwdStr = typeof password === "string" ? password : "";

    if (!emailNorm || !pwdStr) {
      return res.status(400).json({
        success: false,
        error: "Укажите email и пароль зарегистрированного администратора",
      });
    }

    const db = await getProTalkDB();
    const emp = await findEmployerInDB(db, emailNorm);
    if (!emp) {
      return res.status(401).json({ success: false, error: "Пользователь не найден" });
    }

    const storedHash = emp.password_hash ? String(emp.password_hash).trim() : "";
    if (!storedHash || !timingSafePasswordEquals(pwdStr, storedHash)) {
      return res.status(401).json({ success: false, error: "Неверный email или пароль" });
    }

    const dbRole = String(emp.role || "employer").trim();
    if (!isAdminOrSuperAdminRole(dbRole)) {
      return res.status(403).json({
        success: false,
        error: "Доступ к админ-панели разрешён только пользователям с ролью администратора или супер-администратора",
      });
    }

    const pubId = await ensureEmployerPublicId(db, emp);
    const resolvedLoginRole =
      isPrimarySuperAdminEmployer({ ...emp, public_id: pubId }) &&
      (!dbRole || dbRole.toLowerCase() === "admin" || dbRole.toLowerCase() === "employer")
        ? "super_admin"
        : dbRole;
    const token = createSignedEmployerToken({ ...emp, public_id: pubId, role: resolvedLoginRole });
    employerSessions[token] = { ...emp, role: resolvedLoginRole };

    return res.json({
      success: true,
      isAdmin: true,
      token,
      user: {
        id: emp.id,
        publicId: pubId,
        public_id: pubId,
        name: emp.name || emp.contact_name || "",
        email: emp.email || emp.contact_email || emailNorm,
        role: resolvedLoginRole,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

adminAuthTelegramRouter.get(["/bot-settings", "/api/admin/bot-settings"], async (req: Request, res: Response) => {
  if (!(await isAuthorizedAdminOrSysAdmin(req))) {
    return res.status(401).json({ success: false, error: "Требуется авторизация системного администратора" });
  }
  try {
    const config = await getTelegramBotConfig();
    const rawToken = typeof config?.botToken === "string" ? config.botToken.trim() : "";
    const maskedToken =
      rawToken.length > 12
        ? `${rawToken.substring(0, 6)}••••••••${rawToken.substring(rawToken.length - 4)}`
        : rawToken
        ? "••••••••••••"
        : "";

    return res.json({
      success: true,
      botUsername: typeof config?.botUsername === "string" ? config.botUsername : "@RoboRecrutBot",
      proxyType: config?.proxyType || "dialog_ai",
      apiBaseUrl: typeof config?.apiBaseUrl === "string" ? config.apiBaseUrl : PROXY_PRESETS.dialog_ai,
      adminTelegramId: config?.adminTelegramId ? String(config.adminTelegramId) : "169262990",
      isTokenConfigured: Boolean(rawToken),
      maskedToken,
    });
  } catch (err: any) {
    console.error("[Admin] GET /bot-settings error:", err?.message || err);
    return res.json({
      success: true,
      botUsername: "@RoboRecrutBot",
      proxyType: "dialog_ai",
      apiBaseUrl: PROXY_PRESETS.dialog_ai,
      adminTelegramId: "169262990",
      isTokenConfigured: Boolean(process.env.TELEGRAM_BOT_TOKEN),
      maskedToken: process.env.TELEGRAM_BOT_TOKEN ? "••••••••••••" : "",
      fallback: true,
    });
  }
});

adminAuthTelegramRouter.post(["/bot-settings", "/api/admin/bot-settings"], async (req: Request, res: Response) => {
  if (!(await isAuthorizedAdminOrSysAdmin(req))) {
    return res.status(401).json({ success: false, error: "Требуется авторизация системного администратора" });
  }
  try {
    const { botToken, botUsername, proxyType, apiBaseUrl, adminTelegramId } = req.body || {};
    const current = await getTelegramBotConfig();

    let resolvedBaseUrl = PROXY_PRESETS.dialog_ai;
    if (proxyType === "dialog_ai") {
      resolvedBaseUrl = PROXY_PRESETS.dialog_ai;
    } else if (proxyType === "direct") {
      resolvedBaseUrl = PROXY_PRESETS.direct;
    } else if (proxyType === "custom_cloudflare") {
      resolvedBaseUrl = cleanTelegramBaseUrl(typeof apiBaseUrl === "string" ? apiBaseUrl : "");
    }

    const finalToken =
      !botToken || typeof botToken !== "string" || botToken.includes("•••") || !botToken.trim()
        ? current.botToken
        : botToken.trim();

    const updated: TelegramBotConfig = {
      ...current,
      botToken: finalToken,
      botUsername: typeof botUsername === "string" && botUsername.trim() ? botUsername.trim() : current.botUsername,
      proxyType: proxyType === "direct" || proxyType === "custom_cloudflare" ? proxyType : "dialog_ai",
      apiBaseUrl: resolvedBaseUrl,
      adminTelegramId:
        typeof adminTelegramId === "string" && adminTelegramId.trim()
          ? adminTelegramId.trim()
          : current.adminTelegramId,
    };

    const db = await getProTalkDB();
    await db
      .exec(
        `CREATE TABLE IF NOT EXISTS telegram_bot_config (
          id TEXT PRIMARY KEY,
          config_json TEXT,
          updated_at TIMESTAMPTZ DEFAULT NOW()
        )`
      )
      .catch(() => {});

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

adminAuthTelegramRouter.post(["/backup/trigger", "/api/admin/backup/trigger"], async (req: Request, res: Response) => {
  if (!(await isAuthorizedAdminOrSysAdmin(req))) {
    return res.status(401).json({ success: false, error: "Требуется авторизация системного администратора" });
  }
  try {
    const result = await executeDatabaseBackup("Ручной запуск из Панели Системного Админа");
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

adminAuthTelegramRouter.get("/telegram-token", async (req: Request, res: Response) => {
  if (!(await isAuthorizedAdminOrSysAdmin(req))) {
    return res.status(401).json({ success: false, error: "Требуется авторизация администратора" });
  }
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
  if (!(await isAuthorizedAdminOrSysAdmin(req))) {
    return res.status(401).json({ success: false, error: "Требуется авторизация администратора" });
  }
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

adminAuthTelegramRouter.post("/test-telegram-notification", async (req: Request, res: Response) => {
  if (!(await isAuthorizedAdminOrSysAdmin(req))) {
    return res.status(401).json({ success: false, error: "Требуется авторизация администратора" });
  }
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
