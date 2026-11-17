import { beginAIRestart, endAIRestart } from "./aiReady";
import { resolveActiveEmployerId } from "./actorSession";

/**
 * ============================================================================
 * ЖЕСТКОЕ АРХИТЕКТУРНОЕ ПРАВИЛО ПРОЕКТА (ОБЯЗАТЕЛЬНО К СОБЛЮДЕНИЮ):
 * 1. Все операции выполняются ТОЛЬКО напрямую через базу данных (PostgreSQL BD ProTalk)
 *    и маршруты Express (/api/*).
 * 2. ИСТИНА ВСЕГДА БЕРЕТСЯ ИЗ БАЗЫ ДАННЫХ (таблицы `protalk_bots` и `protalk_prompts`).
 *    При нажатии на «Повторить с RR ProMax» во всех оверлеях запрос идет через
 *    резервного бота `bot_id = 67370` и токен `XQD2bU7dIwQu9T4TpygQEpZYZrIx81hY`.
 * ============================================================================
 */

async function invoke<T = any>(fn: "ai-chat" | "ai-enhance" | "ai-evaluate" | "ai-generate-onboarding" | "ai-restart" | "ai-company-analyze", body: any): Promise<T> {
  const friendly = (code: string): string => {
    if (code === "ai_empty_response") return "ИИ не вернул ответ. Попробуйте ещё раз.";
    if (code === "no_session" || /auth|jwt|unauthor/i.test(code)) {
      return "Не удалось подтвердить вход. Перезагрузите страницу.";
    }
    if (code === "no_credits" || code === "insufficient_funds") return "Недостаточно RR на балансе. Пополните в разделе «Тариф & Счета».";
    if (code === "rate_limited" || /429/.test(code)) return "Слишком много запросов к ИИ. Подождите 30 секунд и повторите.";
    return code;
  };

  const localEndpointMap: Record<string, string> = {
    "ai-chat": "/api/employer-assist",
    "ai-enhance": "/api/enhance-all-fields",
    "ai-evaluate": "/api/evaluate-interview",
    "ai-generate-onboarding": "/api/generate-project-onboarding",
    "ai-company-analyze": "/api/parse-company-file",
    "ai-restart": "/api/ai-restart",
    "ai-generate-stage-test": "/api/generate-stage-test",
  };

  const isCandidateOnly = Boolean(
    body?.candidate_id &&
      body?.kind !== "employer" &&
      !body?.employer_id &&
      !body?.employer_public_id
  );
  const resolvedEmp = isCandidateOnly ? undefined : resolveActiveEmployerId(body);
  const forceProMax = typeof window !== "undefined" && Boolean((window as any).__RR_FORCE_PROMAX);
  const enrichedBody = {
    ...(resolvedEmp ? { employer_id: resolvedEmp, employer_public_id: resolvedEmp } : {}),
    ...body,
    ...(forceProMax ? { use_promax: true } : {}),
  };

  const localEndpoint = localEndpointMap[fn] || `/api/${fn}`;
  const resp = await fetch(localEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(enrichedBody),
  });
  const json = await resp.json().catch(() => null);
  if (resp.ok && json && !(typeof json === "object" && "error" in json && (json as any).error)) {
    return json as T;
  }
  const errMsg = (json && typeof json === "object" && ((json as any).error || (json as any).message))
    ? String((json as any).error || (json as any).message)
    : "Не удалось обработать ИИ запрос. Попробуйте повторить с RR ProMax.";
  throw new Error(friendly(errMsg));
}

export type ChatKind = "employer" | "candidate" | "vacancy_consultant";

export async function aiChat(opts: {
  kind: ChatKind;
  messages: { role: "system" | "user" | "assistant"; content: string }[];
  context?: string;
  project_id?: string;
  candidate_id?: string;
  employer_id?: string;
}): Promise<string> {
  const data = await invoke<{ reply: string }>("ai-chat", opts);
  return data?.reply || "";
}

export async function aiEnhanceSingle(opts: {
  field: string;
  value: string;
  role_name?: string;
  company_name?: string;
  employer_id?: string;
  company_id?: string;
  all_fields?: Record<string, any>;
  hint?: string;
  template?: string;
}): Promise<string> {
  const data = await invoke<any>("ai-enhance", { mode: "single", ...opts });
  return (data?.value ?? data?.text ?? (typeof data === "string" ? data : "")).toString();
}

export async function aiEnhanceAll(opts: {
  mode: "all_vacancy" | "all_company";
  fields: Record<string, any>;
  role_name?: string;
  company_name?: string;
  employer_id?: string;
  company_id?: string;
  hint?: string;
  templates?: Record<string, string>;
  /** Up to 5000 chars of parsed-from-file context (raw text from document). */
  file_context?: string;
  /** Existing company record (for shared schedule/motivation/team/system fields). */
  company_context?: Record<string, any>;
}): Promise<Record<string, any>> {
  const data = await invoke<any>("ai-enhance", opts);
  const out = data?.fields ? { ...data.fields } : (data || {});
  if (data?.candidate_fields_config && !out.candidate_fields_config) {
    out.candidate_fields_config = data.candidate_fields_config;
  }
  return out;
}

export async function aiEvaluate<T = any>(opts: {
  mode: "resume" | "checklist" | "situations" | "training_block" | "overall_candidate";
  payload: any;
  candidate_id?: string;
  project_id?: string;
}): Promise<T> {
  const data = await invoke<{ result: T }>("ai-evaluate", opts);
  return data?.result as T;
}

export async function aiGenerateOnboarding(opts: {
  project_id?: string;
  role_name: string;
  company_name?: string;
  brief?: string;
  save?: boolean;
}): Promise<any> {
  const data = await invoke<{ ok: boolean; data: any }>("ai-generate-onboarding", opts);
  return data?.data;
}

export async function aiRestart(
  employer_public_id?: string,
  opts?: { demo_user_id?: string; candidate_id?: string; force?: boolean },
): Promise<void> {
  // Dedup: don't fire /restart more often than once per 10 minutes for the
  // same actor key. Repeated mounts/re-renders of editors must not spam the
  // ProTalk channel.
  const actor = opts?.demo_user_id
    ? `demo:${opts.demo_user_id}`
    : (opts?.candidate_id
        ? `cand:${opts.candidate_id}`
        : (employer_public_id || "anon"));
  if (!opts?.force) try {
    const key = `ai_restart_dedup:${actor}`;
    const now = Date.now();
    const last = Number(sessionStorage.getItem(key) || "0");
    if (last && now - last < 10 * 60 * 1000) return;
    sessionStorage.setItem(key, String(now));
  } catch { /* sessionStorage unavailable — fall through */ }
  beginAIRestart();
  try {
    try {
      const res = await fetch("/api/ai-restart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employer_public_id,
          demo_user_id: opts?.demo_user_id,
          candidate_id: opts?.candidate_id,
        }),
      });
      if (res.ok) return;
    } catch (localErr) {
      console.warn("[aiRestart] Direct Express API failed, falling back to invoke:", localErr);
    }
    await invoke("ai-restart", {
      employer_public_id,
      demo_user_id: opts?.demo_user_id,
      candidate_id: opts?.candidate_id,
    });
  } finally {
    endAIRestart();
  }
}

export async function aiCompanyAnalyze(opts: {
  company_id?: string;
  employer_public_id?: string;
  file_url?: string;
  raw_text?: string;
}): Promise<{ fields: Record<string, any>; raw: string }> {
  const data = await invoke<{ ok: boolean; fields: Record<string, any>; raw: string }>("ai-company-analyze", opts);
  return { fields: data?.fields || {}, raw: data?.raw || "" };
}