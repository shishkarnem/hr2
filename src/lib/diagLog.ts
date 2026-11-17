/**
 * diagLog — временная безопасная runtime-диагностика клиентских кнопок
 * (Phase: «Пересчитать AI-оценку» / «Сформировать итог»).
 *
 * Пишет ТОЛЬКО технические коды этапов в public.client_errors.
 * Запрещено сохранять: JWT, candidate_token, тексты резюме, ответы
 * кандидата, промпты, персональные данные, полное содержимое response.
 *
 * Все вызовы делаются fire-and-forget — диагностика никогда не должна
 * влиять на пользовательский поток или таймауты основного запроса.
 */
import { dbClient } from "@/lib/dbClient";

const MAX_STR = 200;
function safeStr(v: unknown): string {
  if (v == null) return "";
  const s = String(v);
  return s.length > MAX_STR ? s.slice(0, MAX_STR) : s;
}

// Whitelisted meta keys. Anything else выбрасывается. Значения приводятся
// к строке ≤200 символов или числу/булю.
const ALLOWED_KEYS = new Set([
  "stage", "code", "http_status", "request_id", "job_id",
  "first_status", "last_status", "terminal_status", "attempts",
  "ms", "candidate_id_tail", "session", "extra_code",
  "kind", "project_id", "employer_id", "action", "route",
]);

export function safeMeta(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input || {})) {
    if (!ALLOWED_KEYS.has(k)) continue;
    if (v == null) continue;
    if (typeof v === "number" || typeof v === "boolean") out[k] = v;
    else out[k] = safeStr(v);
  }
  return out;
}

/** candidate UUID → последние 8 символов, для корреляции без раскрытия id. */
export function tail(id: string | null | undefined): string {
  const s = String(id || "");
  return s.length <= 8 ? s : s.slice(-8);
}

const seenDiagKeys = new Set<string>();

/**
 * Записывает диагностическую строку в client_errors. Никогда не бросает
 * исключения наружу. `message` обязан быть коротким техническим кодом.
 */
export function diagLog(source: string, message: string, meta: Record<string, unknown> = {}): void {
  try {
    const src = safeStr(source) || "diag";
    const msg = safeStr(message) || "unknown";
    if (/websocket|vite|hmr|ResizeObserver|Script error/i.test(msg)) return;
    const dedupeKey = `${src}:${msg}:${String(meta?.stage ?? "")}`;
    if (seenDiagKeys.has(dedupeKey)) return;
    seenDiagKeys.add(dedupeKey);

    const route = typeof window !== "undefined" ? window.location.pathname : "";
    const userAgent = typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 200) : "";
    const payload = {
      source: src,
      route: safeStr(route),
      message: msg,
      user_agent: userAgent,
      meta: safeMeta({ ...meta, route }) as unknown as Record<string, string | number | boolean>,
    };
    void (dbClient.from("client_errors") as any).insert(payload).then(() => undefined, () => undefined);
  } catch { /* swallow */ }
}

let globalErrorListenersInstalled = false;
export function installGlobalClientErrorLogger(): void {
  if (globalErrorListenersInstalled || typeof window === "undefined") return;
  globalErrorListenersInstalled = true;
  window.addEventListener("error", (ev) => {
    const msg = ev.message || "";
    if (!msg || /websocket|vite|hmr|ResizeObserver|Script error/i.test(msg)) return;
    diagLog("window_error", msg, {
      stage: ev.filename ? `${ev.filename.split("/").pop()}:${ev.lineno || 0}` : "script",
    });
  });
  window.addEventListener("unhandledrejection", (ev) => {
    const reason = ev.reason instanceof Error ? ev.reason.message : String(ev.reason || "");
    if (!reason || /websocket|vite|hmr|AbortError|Failed to fetch/i.test(reason)) return;
    diagLog("unhandled_rejection", reason.slice(0, 160), { stage: "promise" });
  });
}

if (typeof window !== "undefined") {
  installGlobalClientErrorLogger();
}

/**
 * Достаёт безопасный код ошибки из ответа database.functions.invoke
 * без раскрытия токенов и тел запроса. Возвращает {code, http_status}.
 */
export async function extractInvokeError(error: unknown): Promise<{ code: string; http_status: number | null }> {
  if (!error) return { code: "", http_status: null };
  const anyErr = error as { message?: string; context?: { status?: number; json?: () => Promise<unknown> } };
  let code = anyErr?.message || "invoke_error";
  let http: number | null = anyErr?.context?.status ?? null;
  try {
    const j = anyErr?.context && typeof anyErr.context.json === "function"
      ? await anyErr.context.json()
      : null;
    const body = j as { error?: unknown; code?: unknown } | null;
    if (body && (body.error || body.code)) {
      code = String(body.error ?? body.code);
    }
  } catch { /* ignore */ }
  // Whitelist: код должен быть коротким snake_case-идентификатором.
  if (!/^[a-z0-9_:-]{1,64}$/i.test(code)) code = `http_${http ?? "err"}`;
  return { code: code.slice(0, 64), http_status: http };
}