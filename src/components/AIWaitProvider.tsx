import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { rrImg } from "@/lib/img";
import { useTypewriter } from "@/hooks/useTypewriter";
import { dbClient } from "@/lib/dbClient";
import { brandImage } from "@/config";
import { toast } from "sonner";
import { toUserError } from "@/lib/userError";
import { buildPhraseQueue, resolveContext, type MascotContext } from "@/lib/loadingPhrases";
import { setAIWaitActive } from "@/lib/aiReady";
import { ensureGoogleFontLoaded } from "@/components/LandingStyleEditor";
import {
  getActiveCompanyTheme,
  Overlay,
  FallbackOverlay,
} from "./ai-wait/AIWaitOverlays";

export { getActiveCompanyTheme };

/**
 * Global AI wait overlay.
 *
 * Wrap any AI/neural-network call with `await run({ title, task })`. The
 * overlay shows a thinking robot with a typing speech bubble, a forward
 * counter and a 120s timeout. On success it briefly shows a happy robot
 * (or a "Далее" button if `autoCloseOnSuccess=false`). On error/timeout it
 * shows the broken robot with "Повторить" / "Отмена" buttons.
 */

const IMG_LOADING = "https://file.pro-talk.ru/tgf/GgMpJwQ9JCkYKglyGHQMDl0WOR0fETccDCUtbFUtHwVPfz9jLBt_GzIXJBcZEyJTNAssKy0_NkEKRzAWAwkpCiA-KD84NRQmEV9uZlUAaA11VQJrCjgDAzkkAVczLRouDiMXfQxTNBdFGT8aIyw2ZyIcIQsIKjIuHhtsBXZSBGZ5T3FP.png";
const IMG_SUCCESS = "https://file.pro-talk.ru/tgf/GgMpJwQ9JCkYKglyGHQMDlxjOR0fETsiGiEKEj4PGBA2XGB3NztnHzoeFR4ZNSknICsGKRggOF1hcDcIXD8jSnc_CmYiIHUfERRuZVYBbwR-UgZhcTgEPCEzHg12LBofHwUTQxJgIBNEJgMNJhwOPF0uPT48DRs5Hkp0AHZRAWd8S3NObQ.png";
const IMG_ERROR = "https://file.pro-talk.ru/tgf/GgMpJwQ9JCkYKglyGHQMDlwGOR0fERA8BTsqaDc7PBsDAWl8IxYBGRQNJhEZEyJQNAssKy0_NkEKWRUtawUYEzweFhg4NRQmEV9uZlUAaA11VQJrCjgDAzkkAVczLRouDiMXfQxTNBdFGT8aIyw2ZyIcIQsIKjIuHhtsBXZSBGZ5T3FP.png";

// Скорость печати маскота и пауза между репликами.
// 80–100 симв/сек по требованиям релиза I-4, ~1.4 с тишины после реплики.
const TYPING_CPS = 90;
const PHRASE_HOLD_MS = 1400;

// Универсальные стадии «живого» ожидания ИИ. Если серверная операция
// сообщает реальную стадию — она будет иметь приоритет, иначе пользователь
// видит ненумерованное продвижение. Никаких выдуманных процентов.
const STAGES: string[] = [
  "Подготавливаем данные",
  "Изучаем контекст",
  "Анализируем ответы",
  "Проверяем результат",
  "Формируем вывод",
  "Сохраняем результат",
];

type Status = "idle" | "loading" | "success" | "error" | "fallback";

interface FallbackConfig {
  /** Only show the RR Pro Max button to viewers explicitly allowed by caller. */
  viewerAllowed: boolean;
  /** Called after the fallback returns successfully (refresh local state). */
  onSuccess?: (data: any) => void | Promise<void>;
}

interface RunOptions<T> {
  title?: string;
  task: (attempt: number) => Promise<T>;
  timeoutMs?: number;
  autoCloseOnSuccess?: boolean;
  /** Don't block the awaiting caller — resolve immediately, overlay handles UI */
  fireAndForget?: boolean;
  /** Optional RR Pro Max fallback for technical AI failures. */
  fallback?: FallbackConfig;
  /** Optional company style theme */
  theme?: any;
}

interface AIWaitContextValue {
  run: <T>(opts: RunOptions<T>) => Promise<T | undefined>;
}

const AIWaitContext = createContext<AIWaitContextValue | null>(null);

export function useAIWait(): AIWaitContextValue {
  const ctx = useContext(AIWaitContext);
  if (!ctx) {
    // Soft-fallback: if provider missing, just run the task without UI
    return {
      run: async ({ task }) => {
        try { return await task(0); } catch { return undefined; }
      },
    };
  }
  return ctx;
}

interface State {
  status: Status;
  title: string;
  phrase: string;
  phraseSeq: number; // монотонный счётчик — заставляет useTypewriter перезапуститься
  elapsed: number;
  error: string;
  attemptCount: number;
  // Internal control — current task and resolver
  task: ((attempt: number) => Promise<any>) | null;
  resolver: ((v: any) => void) | null;
  timeoutMs: number;
  autoCloseOnSuccess: boolean;
  fallback: FallbackConfig | null;
  lastErrorJobId: string | null;
  lastErrorFallbackAvailable: boolean;
  fallbackPhase: "connecting" | "running" | null;
  fallbackBusy: boolean;
  theme?: any;
}

export const AIWaitProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<State>({
    status: "idle",
    title: "",
    phrase: "",
    phraseSeq: 0,
    elapsed: 0,
    error: "",
    attemptCount: 0,
    task: null,
    resolver: null,
    timeoutMs: 120_000,
    autoCloseOnSuccess: true,
    fallback: null,
    lastErrorJobId: null,
    lastErrorFallbackAvailable: false,
    fallbackPhase: null,
    fallbackBusy: false,
    theme: null,
  });

  const cancelledRef = useRef(false);
  // Защита от двойного запуска: пока активен loading/fallback overlay,
  // повторные вызовы run() отбрасываются. Это исключает дубль-списания
  // лимитов и параллельные AI-задачи от одного клика.
  const busyRef = useRef(false);
  // Очередь реплик и таймер ротации — стабильно живут вне реактивного цикла.
  const queueRef = useRef<string[]>([]);
  const queueIdxRef = useRef(0);
  const ctxRef = useRef<MascotContext>("universal");
  const phraseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearPhraseTimer = useCallback(() => {
    if (phraseTimerRef.current) {
      clearTimeout(phraseTimerRef.current);
      phraseTimerRef.current = null;
    }
  }, []);

  const refillQueue = useCallback((ctx: MascotContext) => {
    queueRef.current = buildPhraseQueue(ctx);
    queueIdxRef.current = 0;
  }, []);

  const scheduleNextPhrase = useCallback((current: string) => {
    clearPhraseTimer();
    const typeMs = Math.ceil((current.length * 1000) / TYPING_CPS);
    phraseTimerRef.current = setTimeout(() => {
      // Перейти к следующей реплике той же очереди; при исчерпании — пересоздать.
      let nextIdx = queueIdxRef.current + 1;
      if (nextIdx >= queueRef.current.length) {
        refillQueue(ctxRef.current);
        nextIdx = 0;
      }
      queueIdxRef.current = nextIdx;
      const nextPhrase = queueRef.current[nextIdx] || "";
      setState((s) => (s.status === "loading"
        ? { ...s, phrase: nextPhrase, phraseSeq: s.phraseSeq + 1 }
        : s));
    }, typeMs + PHRASE_HOLD_MS);
  }, [clearPhraseTimer, refillQueue]);

  // Каждое обновление текущей фразы перепланирует переход к следующей.
  useEffect(() => {
    if (state.status !== "loading") {
      clearPhraseTimer();
      return;
    }
    scheduleNextPhrase(state.phrase);
    return clearPhraseTimer;
    // phraseSeq меняется на каждую новую реплику — этого достаточно
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.status, state.phraseSeq]);

  const beginTask = useCallback((
    title: string,
    task: (attempt: number) => Promise<any>,
    timeoutMs: number,
    autoCloseOnSuccess: boolean,
    resolver: ((v: any) => void) | null,
    fallback: FallbackConfig | null,
    attemptCount: number = 0,
    theme: any = null
  ) => {
    cancelledRef.current = false;
    busyRef.current = true;
    if (theme?.fontFamily) {
      ensureGoogleFontLoaded(theme.fontFamily);
    }
    const ctx = resolveContext(title);
    ctxRef.current = ctx;
    refillQueue(ctx);
    const firstPhrase = queueRef.current[0] || "";
    setState({
      status: "loading",
      title,
      phrase: firstPhrase,
      phraseSeq: 0,
      elapsed: 0,
      error: "",
      attemptCount,
      task,
      resolver,
      timeoutMs,
      autoCloseOnSuccess,
      fallback,
      lastErrorJobId: null,
      lastErrorFallbackAvailable: false,
      fallbackPhase: null,
      fallbackBusy: false,
      theme: theme || null,
    });

    const startedAt = Date.now();
    const timeoutP = new Promise<never>((_, rej) => {
      setTimeout(() => rej(new Error("Превышено время ожидания (120с)")), timeoutMs);
    });

    if (typeof window !== "undefined") {
      (window as any).__RR_FORCE_PROMAX = attemptCount > 0;
    }

    Promise.race([task(attemptCount), timeoutP])
      .then(async (result) => {
        if (typeof window !== "undefined") {
          (window as any).__RR_FORCE_PROMAX = false;
        }
        if (cancelledRef.current) return;
        if (attemptCount > 0 && fallback?.onSuccess) {
          try {
            await fallback.onSuccess(result);
          } catch {
            /* ignore caller-side callback errors */
          }
        }
        clearPhraseTimer();
        setState((s) => ({ ...s, status: "success", elapsed: Math.round((Date.now() - startedAt) / 1000) }));
        if (autoCloseOnSuccess) {
          setTimeout(() => {
            if (cancelledRef.current) return;
            setState((s) => ({ ...s, status: "idle", task: null, resolver: null }));
            busyRef.current = false;
            resolver?.(result);
          }, 800);
        }
        // If not auto-close, resolver fires when user clicks "Далее"
        if (!autoCloseOnSuccess) {
          // store result on state via resolver wrapper
          (window as any).__aiwait_lastResult = result;
        }
      })
      .catch((err: any) => {
        if (typeof window !== "undefined") {
          (window as any).__RR_FORCE_PROMAX = false;
        }
        if (cancelledRef.current) return;
        clearPhraseTimer();
        // ВАЖНО: никогда не показываем raw error.message
        const raw = String(err?.message || err || "");
        const ue = toUserError(err);
        const isTimeoutish =
          ue.kind === "timeout" ||
          ue.kind === "ai_temporary" ||
          /504|gateway|timed?\s*out|protalk_5\d\d/i.test(raw);
        const msg = isTimeoutish
          ? "Нейросеть не успела завершить проверку. Повторите попытку с RR ProMax."
          : ue.message;
        const fbAvail = !!(err?.fallbackAvailable || err?.fallback_available);
        setState((s) => ({
          ...s,
          status: "error",
          error: msg,
          elapsed: Math.round((Date.now() - startedAt) / 1000),
          lastErrorJobId: err?.jobId || null,
          lastErrorFallbackAvailable: fbAvail,
        }));
      });
  }, [clearPhraseTimer, refillQueue]);

  const run = useCallback(<T,>(opts: RunOptions<T>): Promise<T | undefined> => {
    if (busyRef.current) {
      // Не запускаем второй раз, пока текущая задача не завершилась.
      return Promise.resolve(undefined);
    }
    const title = opts.title || "Запрос к ИИ";
    const timeoutMs = opts.timeoutMs ?? 120_000;
    const autoCloseOnSuccess = opts.autoCloseOnSuccess ?? true;
    const fallback = opts.fallback || null;
    const theme = getActiveCompanyTheme(opts.theme);

    if (opts.fireAndForget) {
      beginTask(title, opts.task, timeoutMs, autoCloseOnSuccess, null, fallback, 0, theme);
      return Promise.resolve(undefined);
    }

    return new Promise<T | undefined>((resolve) => {
      beginTask(title, opts.task, timeoutMs, autoCloseOnSuccess, resolve as (v: any) => void, fallback, 0, theme);
    });
  }, [beginTask]);

  // Tick: elapsed seconds while loading
  useEffect(() => {
    if (state.status !== "loading" && state.status !== "fallback") return;
    const id = setInterval(() => {
      setState((s) => (s.status === "loading" || s.status === "fallback" ? { ...s, elapsed: s.elapsed + 1 } : s));
    }, 1000);
    return () => clearInterval(id);
  }, [state.status]);

  // Sync global AIWait status so AIRestartGate does not render duplicate overlay
  useEffect(() => {
    setAIWaitActive(state.status !== "idle");
    return () => setAIWaitActive(false);
  }, [state.status]);

  // Очистка таймера фраз при размонтировании провайдера.
  useEffect(() => () => clearPhraseTimer(), [clearPhraseTimer]);

  const handleRetry = useCallback(() => {
    if (!state.task) return;
    if (state.fallbackBusy) return; // защита от двойного клика
    const nextAttempt = state.attemptCount + 1;
    beginTask(state.title, state.task, state.timeoutMs, state.autoCloseOnSuccess, state.resolver, state.fallback, nextAttempt, state.theme);
  }, [state, beginTask]);

  const handleCancel = useCallback(() => {
    cancelledRef.current = true;
    busyRef.current = false;
    clearPhraseTimer();
    state.resolver?.(undefined);
    setState((s) => ({ ...s, status: "idle", task: null, resolver: null }));
  }, [state.resolver, clearPhraseTimer]);

  const handleNext = useCallback(() => {
    const result = (window as any).__aiwait_lastResult;
    state.resolver?.(result);
    delete (window as any).__aiwait_lastResult;
    busyRef.current = false;
    setState((s) => ({ ...s, status: "idle", task: null, resolver: null }));
  }, [state.resolver]);

  const handleFallback = useCallback(async () => {
    const jobId = state.lastErrorJobId;
    const fb = state.fallback;
    if (!jobId && state.task) {
      handleRetry();
      return;
    }
    if (!jobId || !fb) return;
    // Switch to fallback overlay; lock button against double-click.
    setState((s) => ({
      ...s,
      status: "fallback",
      elapsed: 0,
      error: "",
      fallbackPhase: "connecting",
      fallbackBusy: true,
    }));
    const phaseTimer = setTimeout(() => {
      setState((s) => (s.status === "fallback" ? { ...s, fallbackPhase: "running" } : s));
    }, 1500);
    try {
      let candidateToken: string | null = null;
      try {
        const raw = localStorage.getItem("cand_session");
        if (raw) candidateToken = (JSON.parse(raw) as any)?.token || null;
      } catch { /* ignore */ }
      if (typeof window !== "undefined") {
        (window as any).__RR_FORCE_PROMAX = true;
      }
      const { data, error } = await dbClient.functions.invoke("ai-fallback-rr-pro-max", {
        body: { job_id: jobId, use_promax: true },
        headers: candidateToken ? { "x-candidate-token": candidateToken } : undefined,
      });
      if (typeof window !== "undefined") {
        (window as any).__RR_FORCE_PROMAX = false;
      }
      clearTimeout(phaseTimer);
      if (error || (data && (data as any).error)) {
        if (state.task) {
          handleRetry();
          return;
        }
        setState((s) => ({
          ...s,
          status: "error",
          error: "Даже резервная модель не смогла завершить задачу. Попробуйте позднее или обратитесь в поддержку.",
          fallbackPhase: null,
          fallbackBusy: false,
        }));
        return;
      }
      try { await fb.onSuccess?.(data); } catch { /* ignore caller-side errors */ }
      toast.success("Робот Рекрутер успешно завершил задачу");
      const resolver = state.resolver;
      setState((s) => ({ ...s, status: "idle", task: null, resolver: null, fallbackPhase: null, fallbackBusy: false }));
      busyRef.current = false;
      resolver?.(data);
    } catch {
      if (typeof window !== "undefined") {
        (window as any).__RR_FORCE_PROMAX = false;
      }
      clearTimeout(phaseTimer);
      if (state.task) {
        handleRetry();
        return;
      }
      setState((s) => ({
        ...s,
        status: "error",
        error: "Даже резервная модель не смогла завершить задачу. Попробуйте позднее или обратитесь в поддержку.",
        fallbackPhase: null,
        fallbackBusy: false,
      }));
    }
  }, [state.lastErrorJobId, state.fallback, state.resolver, state.task, handleRetry]);

  const value = useMemo<AIWaitContextValue>(() => ({ run }), [run]);

  return (
    <AIWaitContext.Provider value={value}>
      {children}
      {state.status !== "idle" && (
        state.status === "fallback" ? (
          <FallbackOverlay
            phase={state.fallbackPhase || "connecting"}
            elapsed={state.elapsed}
            theme={state.theme}
          />
        ) : (
        <Overlay
          status={state.status}
          title={state.title}
          phrase={state.phrase}
          phraseSeq={state.phraseSeq}
          elapsed={state.elapsed}
          error={state.error}
          autoCloseOnSuccess={state.autoCloseOnSuccess}
          showFallback={
            state.status === "error" &&
            !!state.fallback?.viewerAllowed &&
            state.lastErrorFallbackAvailable &&
            !!state.lastErrorJobId
          }
          fallbackBusy={state.fallbackBusy}
          onFallback={handleFallback}
          onRetry={handleRetry}
          onCancel={handleCancel}
          onNext={handleNext}
          theme={state.theme}
        />)
      )}
    </AIWaitContext.Provider>
  );
};

export default AIWaitProvider;
