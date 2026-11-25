// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import http from "http";

const mockState = vi.hoisted(() => ({
  getTelegramBotConfig: vi.fn(),
  queryRun: vi.fn(),
  dbExec: vi.fn(),
  dbRun: vi.fn(),
  dbGet: vi.fn(),
  employerSessions: {} as Record<string, any>,
  findEmployerInDB: vi.fn(),
  resolveEmployerByToken: vi.fn(),
  ensureEmployerPublicId: vi.fn(),
  createSignedEmployerToken: vi.fn(),
}));

vi.mock("../../../telegram", () => ({
  getTelegramTokenFromDB: vi.fn(async () => "8969850170:AAEQLiyXNTJvoXCXElzmCndGjnC-e9t00mQ"),
  processPendingTransactionNotifications: vi.fn(async () => 0),
  getTelegramBotConfig: (...args: any[]) => mockState.getTelegramBotConfig(...args),
  cleanTelegramBaseUrl: (u: string) => (u || "https://eu1.account.dialog.ai.atiks.org").replace(/\/+$/, ""),
  PROXY_PRESETS: {
    dialog_ai: "https://eu1.account.dialog.ai.atiks.org",
    direct: "https://api.telegram.org",
  },
}));

vi.mock("../../../db", () => ({
  getProTalkDB: vi.fn(async () => ({
    exec: (...args: any[]) => mockState.dbExec(...args),
    run: (...args: any[]) => mockState.dbRun(...args),
    get: (...args: any[]) => mockState.dbGet(...args),
  })),
  queryRun: (...args: any[]) => mockState.queryRun(...args),
}));

vi.mock("../../../backup", () => ({
  executeDatabaseBackup: vi.fn(async () => ({ success: true })),
}));

vi.mock("../../auth/helpers", () => ({
  employerSessions: mockState.employerSessions,
  resolveEmployerByToken: (...args: any[]) => mockState.resolveEmployerByToken(...args),
  createSignedEmployerToken: (...args: any[]) => mockState.createSignedEmployerToken(...args),
  findEmployerInDB: (...args: any[]) => mockState.findEmployerInDB(...args),
  ensureEmployerPublicId: (...args: any[]) => mockState.ensureEmployerPublicId(...args),
}));

import { adminRouter } from "../index";

async function invokeRouter(
  method: "GET" | "POST",
  urlPath: string,
  options?: { headers?: Record<string, string>; body?: any }
): Promise<{ status: number; json: any }> {
  const app = express();
  app.use(express.json());
  app.use("/api/admin", adminRouter);

  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, "127.0.0.1", async () => {
      try {
        const addr = server.address() as any;
        const res = await fetch(`http://127.0.0.1:${addr.port}${urlPath}`, {
          method,
          headers: {
            "Content-Type": "application/json",
            ...(options?.headers || {}),
          },
          body: options?.body !== undefined ? JSON.stringify(options.body) : undefined,
        });
        const json = await res.json();
        resolve({ status: res.status, json });
      } catch (err) {
        reject(err);
      } finally {
        server.close();
      }
    });
  });
}

describe("admin auth, session-check, login-admin & /bot-settings routes", () => {
  const ADMIN_PWD = process.env.ADMIN_PASSWORD || "wkL35eTm";

  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(mockState.employerSessions).forEach((k) => delete mockState.employerSessions[k]);
    mockState.dbExec.mockResolvedValue(undefined);
    mockState.dbRun.mockResolvedValue(undefined);
    mockState.queryRun.mockResolvedValue({ changes: 1 });
    mockState.ensureEmployerPublicId.mockImplementation(async (_db: any, emp: any) => String(emp.public_id || "100007"));
    mockState.createSignedEmployerToken.mockImplementation((emp: any) => `signed_${emp.id}`);
    mockState.resolveEmployerByToken.mockImplementation(async (_db: any, token: string) => mockState.employerSessions[token] || null);
    mockState.getTelegramBotConfig.mockResolvedValue({
      botToken: "8969850170:AAEQLiyXNTJvoXCXElzmCndGjnC-e9t00mQ",
      botUsername: "@RoboRecrutBot",
      proxyType: "dialog_ai",
      apiBaseUrl: "https://eu1.account.dialog.ai.atiks.org",
      adminTelegramId: "169262990",
    });
  });

  it("POST /api/admin/auth/verify validates password with timing-safe comparison", async () => {
    const invalid = await invokeRouter("POST", "/api/admin/auth/verify", {
      body: { password: "wrong-password" },
    });
    expect(invalid.status).toBe(401);
    expect(invalid.json.success).toBe(false);

    const valid = await invokeRouter("POST", "/api/admin/auth/verify", {
      body: { password: ADMIN_PWD },
    });
    expect(valid.status).toBe(200);
    expect(valid.json.success).toBe(true);
  });

  it("GET /api/admin/session-check requires token and grants isAdmin only to admin/super_admin DB roles", async () => {
    const anon = await invokeRouter("GET", "/api/admin/session-check?employerId=100007");
    expect(anon.status).toBe(200);
    expect(anon.json.authenticated).toBe(false);
    expect(anon.json.isAdmin).toBe(false);

    mockState.employerSessions["emp-tok"] = {
      id: "emp-200001",
      public_id: "200001",
      email: "employer@company.ru",
      role: "employer",
    };
    const employerRes = await invokeRouter("GET", "/api/admin/session-check", {
      headers: { Authorization: "Bearer emp-tok" },
    });
    expect(employerRes.status).toBe(200);
    expect(employerRes.json.authenticated).toBe(true);
    expect(employerRes.json.isAdmin).toBe(false);
    expect(employerRes.json.user.role).toBe("employer");

    mockState.employerSessions["admin-tok"] = {
      id: "emp-100007",
      public_id: "100007",
      email: "admin@company.ru",
      role: "admin",
    };
    const adminRes = await invokeRouter("GET", "/api/admin/session-check", {
      headers: { Authorization: "Bearer admin-tok" },
    });
    expect(adminRes.status).toBe(200);
    expect(adminRes.json.authenticated).toBe(true);
    expect(adminRes.json.isAdmin).toBe(true);

    mockState.employerSessions["super-tok"] = {
      id: "emp-100008",
      public_id: "100008",
      email: "super@company.ru",
      role: "super_admin",
    };
    const superRes = await invokeRouter("GET", "/api/admin/session-check", {
      headers: { Authorization: "Bearer super-tok" },
    });
    expect(superRes.status).toBe(200);
    expect(superRes.json.authenticated).toBe(true);
    expect(superRes.json.isAdmin).toBe(true);
  });

  it("POST /api/admin/auth/login-admin rejects passwordless requests and non-admin roles", async () => {
    const noPwd = await invokeRouter("POST", "/api/admin/auth/login-admin", {
      body: { employerId: "100007" },
    });
    expect(noPwd.status).toBe(400);

    mockState.findEmployerInDB.mockResolvedValueOnce({
      id: "emp-200001",
      public_id: "200001",
      email: "employer@company.ru",
      password_hash: "secret123",
      role: "employer",
    });
    const nonAdmin = await invokeRouter("POST", "/api/admin/auth/login-admin", {
      body: { email: "employer@company.ru", password: "secret123" },
    });
    expect(nonAdmin.status).toBe(403);

    mockState.findEmployerInDB.mockResolvedValueOnce({
      id: "emp-100008",
      public_id: "100008",
      email: "super@company.ru",
      password_hash: "secret123",
      role: "super_admin",
    });
    const ok = await invokeRouter("POST", "/api/admin/auth/login-admin", {
      body: { email: "super@company.ru", password: "secret123" },
    });
    expect(ok.status).toBe(200);
    expect(ok.json.isAdmin).toBe(true);
    expect(ok.json.token).toBe("signed_emp-100008");
  });

  it("GET /api/admin/tables rejects unauthenticated callers with 401", async () => {
    const unauth = await invokeRouter("GET", "/api/admin/tables");
    expect(unauth.status).toBe(401);
  });

  it("GET /api/admin/bot-settings rejects missing or invalid credentials with 401", async () => {
    const noAuth = await invokeRouter("GET", "/api/admin/bot-settings");
    expect(noAuth.status).toBe(401);

    const badPwd = await invokeRouter("GET", "/api/admin/bot-settings", {
      headers: { "x-admin-password": "bad" },
    });
    expect(badPwd.status).toBe(401);
  });

  it("GET /api/admin/bot-settings accepts x-admin-password, legacy ?pwd=, and admin Bearer token", async () => {
    const byHeader = await invokeRouter("GET", "/api/admin/bot-settings", {
      headers: { "x-admin-password": ADMIN_PWD },
    });
    expect(byHeader.status).toBe(200);
    expect(byHeader.json.success).toBe(true);
    expect(byHeader.json.maskedToken).toBe("896985••••••••00mQ");
    expect(byHeader.json.isTokenConfigured).toBe(true);

    const byQuery = await invokeRouter(
      "GET",
      `/api/admin/bot-settings?pwd=${encodeURIComponent(ADMIN_PWD)}`
    );
    expect(byQuery.status).toBe(200);
    expect(byQuery.json.maskedToken).toBe("896985••••••••00mQ");

    mockState.employerSessions["adm-tok-1"] = {
      id: "emp-100007",
      public_id: "100007",
      role: "admin",
    };
    const byBearer = await invokeRouter("GET", "/api/admin/bot-settings", {
      headers: { Authorization: "Bearer adm-tok-1" },
    });
    expect(byBearer.status).toBe(200);
    expect(byBearer.json.botUsername).toBe("@RoboRecrutBot");
  });

  it("GET /api/admin/bot-settings never returns 500 on malformed config or DB throw", async () => {
    mockState.getTelegramBotConfig.mockResolvedValueOnce({
      botToken: 12345 as any,
      botUsername: null as any,
      proxyType: "dialog_ai",
      apiBaseUrl: undefined as any,
      adminTelegramId: 999888 as any,
    });

    const malformed = await invokeRouter("GET", "/api/admin/bot-settings", {
      headers: { "x-admin-password": ADMIN_PWD },
    });
    expect(malformed.status).toBe(200);
    expect(malformed.json.success).toBe(true);
    expect(malformed.json.maskedToken).toBe("");
    expect(malformed.json.adminTelegramId).toBe("999888");

    mockState.getTelegramBotConfig.mockRejectedValueOnce(new Error("DB connection failed"));
    const threw = await invokeRouter("GET", "/api/admin/bot-settings", {
      headers: { "x-admin-password": ADMIN_PWD },
    });
    expect(threw.status).toBe(200);
    expect(threw.json.success).toBe(true);
    expect(threw.json.fallback).toBe(true);
  });

  it("POST /api/admin/bot-settings requires authorization and preserves masked token", async () => {
    const unauth = await invokeRouter("POST", "/api/admin/bot-settings", {
      body: { botUsername: "@OtherBot" },
    });
    expect(unauth.status).toBe(401);

    const saved = await invokeRouter("POST", "/api/admin/bot-settings", {
      headers: { "x-admin-password": ADMIN_PWD },
      body: {
        botToken: "896985••••••••00mQ",
        botUsername: "@UpdatedBot",
        proxyType: "direct",
        adminTelegramId: "123456",
      },
    });
    expect(saved.status).toBe(200);
    expect(saved.json.success).toBe(true);
    expect(saved.json.config.botToken).toBeUndefined();
    expect(saved.json.config.isTokenConfigured).toBe(true);
    expect(mockState.dbExec).toHaveBeenCalledWith(
      expect.stringContaining("CREATE TABLE IF NOT EXISTS telegram_bot_config")
    );
    expect(mockState.queryRun).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO telegram_bot_config"),
      [expect.stringContaining("8969850170:AAEQLiyXNTJvoXCXElzmCndGjnC-e9t00mQ")]
    );
  });
});
