// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express from "express";
import type { Server } from "http";
import { employerAuthRouter } from "../employerAuth";
import { createSignedEmployerToken } from "../helpers";
import * as dbMod from "../../../db";

describe("POST /api/signup-bootstrap", () => {
  let server: Server;
  let baseUrl = "";

  const mockEmp = {
    id: "emp-10075510586",
    public_id: "10075510586",
    email: "owner@example.com",
    referrer_id: null,
  };

  beforeAll(async () => {
    vi.spyOn(dbMod, "getProTalkDB").mockResolvedValue({
      get: vi.fn(async (sql: string) => {
        if (sql.includes("FROM employers WHERE id = ?")) return mockEmp;
        return null;
      }),
      all: vi.fn(async () => []),
      run: vi.fn(async () => ({ changes: 1 })),
    } as any);

    const app = express();
    app.use(express.json());
    app.use("/api", employerAuthRouter);

    await new Promise<void>((resolve) => {
      server = app.listen(0, "127.0.0.1", () => {
        const addr = server.address();
        if (addr && typeof addr === "object") {
          baseUrl = `http://127.0.0.1:${addr.port}`;
        }
        resolve();
      });
    });
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("rejects unauthenticated requests with 401", async () => {
    const res = await fetch(`${baseUrl}/api/signup-bootstrap`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(401);
  });

  it("returns 200 ok for signed employer session instead of 404", async () => {
    const token = createSignedEmployerToken(mockEmp);
    const res = await fetch(`${baseUrl}/api/signup-bootstrap`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.public_id).toBe("10075510586");
    expect(data.alreadyBootstrapped).toBe(true);
  });
});
