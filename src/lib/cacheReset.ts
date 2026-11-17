/**
 * Сброс прикладного кэша между ролями/маршрутами.
 *
 * Что чистим всегда:
 *  - весь sessionStorage (кроме явных whitelisted ключей)
 *  - транзиентные ключи localStorage: demo-флоу, drag-and-drop, чат AI-ассистента
 *
 * Что сохраняем по умолчанию:
 *  - database auth-токены (`sb-*`)
 *  - реферальные/онбординг-флаги (`rr_*`)
 *
 * Флаги keepEmployer / keepCandidate дополнительно сохраняют ключи
 * соответствующей роли (employer_session_*, cand_session*, и т.п.).
 */

export type ResetOptions = {
  keepEmployer?: boolean;
  keepCandidate?: boolean;
};

const EMPLOYER_KEYS = new Set([
  "emp_token",
  "emp_user",
  "employer_session_id",
  "employer_session_user_id",
  "employer_tg_id",
  "employer_assistant_chat_v1",
]);

const CANDIDATE_KEYS = new Set([
  "cand_token",
  "cand_user",
  "cand_session",
  "cand_session_id",
  "cand_role",
]);

// Транзиентные ключи — всегда удаляются при сбросе.
const TRANSIENT_PREFIXES = ["demo:tpl:"];
const TRANSIENT_KEYS = new Set([
  "demo:state",
  "dragged_candidate_id",
]);

const SESSION_KEEP = new Set<string>([
  "show_employer_entry_loader",
  "landing_visited",
  "rr_preloaded",
]);

function shouldKeepSession(key: string): boolean {
  if (SESSION_KEEP.has(key)) return true;
  if (key.startsWith("sb-")) return true;
  if (key.startsWith("rr_")) return true;
  if (key.startsWith("emp_")) return true;
  if (key.startsWith("cand_")) return true;
  return false;
}

function shouldKeep(key: string, opts: ResetOptions): boolean {
  // Транзиентные — никогда не сохраняем.
  if (TRANSIENT_KEYS.has(key)) return false;
  if (TRANSIENT_PREFIXES.some((p) => key.startsWith(p))) return false;

  // database auth — всегда сохраняем.
  if (key.startsWith("sb-")) return true;
  // Реферал/оферта/онбординг — всегда сохраняем.
  if (key.startsWith("rr_")) return true;

  // Авторизация работодателя / соискателя — всегда сохраняем
  if (key.startsWith("emp_")) return true;
  if (key.startsWith("cand_")) return true;

  if (opts.keepEmployer && EMPLOYER_KEYS.has(key)) return true;
  if (opts.keepCandidate && CANDIDATE_KEYS.has(key)) return true;

  // Всё остальное (включая ключи противоположной роли) — удаляем.
  return false;
}

export function resetAppCache(opts: ResetOptions = {}): void {
  try {
    const ls = window.localStorage;
    const toRemove: string[] = [];
    for (let i = 0; i < ls.length; i++) {
      const key = ls.key(i);
      if (!key) continue;
      if (!shouldKeep(key, opts)) toRemove.push(key);
    }
    for (const k of toRemove) ls.removeItem(k);
  } catch { /* ignore */ }

  try {
    const ss = window.sessionStorage;
    const toRemove: string[] = [];
    for (let i = 0; i < ss.length; i++) {
      const key = ss.key(i);
      if (!key) continue;
      if (!shouldKeepSession(key)) toRemove.push(key);
    }
    for (const k of toRemove) ss.removeItem(k);
  } catch { /* ignore */ }
}

export function resetEmployerSessionAndCache(): void {
  try {
    const ls = window.localStorage;
    const toRemove: string[] = [];
    for (let i = 0; i < ls.length; i++) {
      const key = ls.key(i);
      if (!key) continue;
      const lower = key.toLowerCase();
      if (
        lower.startsWith("emp_") ||
        lower.startsWith("employer_") ||
        lower === "employer_id" ||
        lower === "emp_token" ||
        lower === "emp_user" ||
        lower === "employer_token" ||
        lower === "employer_session_id" ||
        lower === "employer_session_user_id" ||
        lower === "employer_tg_id" ||
        lower === "employer_assistant_chat_v1" ||
        lower.includes("employer") ||
        (lower.startsWith("sb-") && lower.includes("auth-token"))
      ) {
        toRemove.push(key);
      }
    }
    for (const k of toRemove) ls.removeItem(k);
  } catch { /* ignore */ }

  try {
    const ss = window.sessionStorage;
    const toRemove: string[] = [];
    for (let i = 0; i < ss.length; i++) {
      const key = ss.key(i);
      if (!key) continue;
      const lower = key.toLowerCase();
      if (
        lower.startsWith("emp_") ||
        lower.startsWith("employer_") ||
        lower === "show_employer_entry_loader" ||
        lower === "employer_preloaded" ||
        lower.includes("employer")
      ) {
        toRemove.push(key);
      }
    }
    for (const k of toRemove) ss.removeItem(k);
  } catch { /* ignore */ }
}

// Идентификатор раздела для CacheResetGuard.
export type RouteScope = "employer" | "candidate" | "public";

export function routeScope(pathname: string): RouteScope {
  const p = (pathname || "/").toLowerCase();
  if (p.startsWith("/emp") || p === "/setup" || p.startsWith("/employer")) return "employer";
  if (p.startsWith("/cand") || p.startsWith("/candidate")) return "candidate";
  return "public";
}

export function resetForScope(scope: RouteScope): void {
  // Always clean up any custom landing theme styles and resets when switching scopes
  if (typeof document !== "undefined") {
    const landingStyle = document.getElementById("landing-custom-theme-styles");
    if (landingStyle) {
      landingStyle.remove();
    }
  }

  if (scope === "employer") return resetAppCache({ keepEmployer: true });
  if (scope === "candidate") return resetAppCache({ keepCandidate: true });
  // public: чистим кэш и гарантированно сбрасываем авторизацию работодателя на главном лендинге
  resetEmployerSessionAndCache();
  return resetAppCache({ keepEmployer: false, keepCandidate: true });
}