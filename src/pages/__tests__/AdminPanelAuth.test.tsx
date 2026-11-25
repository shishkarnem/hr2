// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AdminPanel from "../AdminPanel";
import { classifyClient } from "@/components/admin/panel/adminConfig";

vi.mock("@/components/RRImage", () => ({
  default: ({ alt }: { alt?: string }) => <img alt={alt || "logo"} />,
}));

vi.mock("@/components/AuthModal", () => ({
  default: ({
    isOpen,
    initialMode,
    surfaceVariant,
  }: {
    isOpen: boolean;
    initialMode?: string;
    surfaceVariant?: string;
  }) =>
    isOpen ? (
      <div
        data-testid="auth-modal"
        data-mode={initialMode}
        data-surface={surfaceVariant || "glass"}
      >
        AuthModal
      </div>
    ) : null,
}));

vi.mock("@/components/admin/BlogAdmin", () => ({
  default: () => <div>BlogAdmin</div>,
}));

vi.mock("@/components/admin/sections/ClientsAndCandidates", () => ({
  ClientsSection: () => <div>ClientsSection</div>,
  CandidatesSection: () => <div>CandidatesSection</div>,
}));

describe("AdminPanel strict auth, DB role gate, and RBAC visibility", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it("denies access without auto-login when user has no token and uses blue-gradient AuthModal", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    render(
      <MemoryRouter>
        <AdminPanel />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Панель администратора")).toBeTruthy();
    });

    const loginBtn = screen.getByText("Войти в аккаунт");
    expect(loginBtn).toBeTruthy();
    expect(screen.getByText("Зарегистрироваться")).toBeTruthy();
    expect(screen.queryByText(/100007/)).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();

    fireEvent.click(loginBtn);
    await waitFor(() => {
      const modal = screen.getByTestId("auth-modal");
      expect(modal.getAttribute("data-surface")).toBe("blue-gradient");
    });
  });

  it("denies access to authenticated non-admin role (employer)", async () => {
    localStorage.setItem("emp_token", "tok-emp");
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: true,
          authenticated: true,
          isAdmin: false,
          user: {
            id: "emp-200001",
            publicId: "200001",
            email: "user@company.ru",
            role: "employer",
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    render(
      <MemoryRouter>
        <AdminPanel />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Доступ ограничен")).toBeTruthy();
    });
    expect(screen.getByText("Войти под другим аккаунтом")).toBeTruthy();
  });

  it("hides База данных, Роли, ИИ, and Telegram Токен for regular admin role", async () => {
    localStorage.setItem("emp_token", "tok-admin");
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: true,
          authenticated: true,
          isAdmin: true,
          user: {
            id: "emp-100009",
            publicId: "100009",
            email: "admin@company.ru",
            role: "admin",
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    render(
      <MemoryRouter>
        <AdminPanel />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("ClientsSection")).toBeTruthy();
    });

    expect(screen.queryByText("База данных")).toBeNull();
    expect(screen.queryByText("Роли")).toBeNull();
    expect(screen.queryByText("Telegram Токен")).toBeNull();
    expect(screen.queryByText(/^ИИ$/)).toBeNull();
    expect(screen.getByText("Рассылки")).toBeTruthy();
  });

  it("grants access to super_admin DB role including База данных and Роли", async () => {
    localStorage.setItem("emp_token", "tok-super");
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: true,
          authenticated: true,
          isAdmin: true,
          user: {
            id: "emp-100008",
            publicId: "100008",
            email: "super@company.ru",
            role: "super_admin",
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    render(
      <MemoryRouter>
        <AdminPanel />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("ClientsSection")).toBeTruthy();
    });

    expect(screen.getByText("База данных")).toBeTruthy();
    const mobileDropdownBtn = screen.getAllByRole("button", { name: /Клиенты/i })[0];
    fireEvent.click(mobileDropdownBtn);
    expect(screen.getAllByText("Роли").length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText("Telegram Токен")).toBeNull();
    expect(screen.queryByText(/^ИИ$/)).toBeNull();
  });

  it("grants super_admin access (База данных and Роли) to employer 100007", async () => {
    localStorage.setItem("emp_token", "tok-100007");
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: true,
          authenticated: true,
          isAdmin: true,
          user: {
            id: "b5396cf9-9cd0-4614-a60d-ff77bae24ed5",
            publicId: "100007",
            email: "shishkarnem@gmail.com",
            role: "super_admin",
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    render(
      <MemoryRouter>
        <AdminPanel />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("ClientsSection")).toBeTruthy();
    });

    expect(screen.getByText("База данных")).toBeTruthy();
    const mobileDropdownBtn = screen.getAllByRole("button", { name: /Клиенты/i })[0];
    fireEvent.click(mobileDropdownBtn);
    expect(screen.getAllByText("Роли").length).toBeGreaterThanOrEqual(2);
  });

  it("classifies clients across the 4 Kanban stages", () => {
    expect(
      classifyClient({ companies_count: 0, projects_count: 0, candidates_count: 0, has_topup: false }).key
    ).toBe("new");
    expect(
      classifyClient({ companies_count: 1, projects_count: 0, candidates_count: 0, has_topup: false }).key
    ).toBe("setup");
    expect(
      classifyClient({ companies_count: 1, projects_count: 2, candidates_count: 4, has_topup: false }).key
    ).toBe("active");
    expect(
      classifyClient({ companies_count: 1, projects_count: 2, candidates_count: 4, has_topup: true }).key
    ).toBe("paying");
  });
});
