import { useEffect, useMemo, useState } from "react";
import { RichTrainingMaterialCard } from "@/components/RichTrainingMarkdown";
import { BookOpen, CheckCircle2, Lock, RefreshCw, Sparkles, GraduationCap, ChevronLeft, ChevronRight, CheckSquare, Square } from "lucide-react";
import { dbClient } from "@/lib/dbClient";
import { parseSubpages, buildCompositeSubpageTitle, TrainingSubpage } from "@/lib/trainingSubpages";
import { LoadingPhrase } from "@/components/LoadingPhrase";
import { useAIWait } from "@/components/AIWaitProvider";
import Reveal from "@/components/Reveal";
import { VacancyPausedDialog, isVacancyPausedError } from "@/components/VacancyPausedDialog";
import LimitExhaustedOverlay from "@/components/LimitExhaustedOverlay";
import { toUserError, formatUserError } from "@/lib/userError";
import CandidateTrainingStageReport from "@/components/reports/CandidateTrainingStageReport";
import { useLandingTheme, buildThemeCss } from "./LandingStyleEditor";
import { CompanyThemedLogo } from "@/components/CompanyThemedLogo";
import MiniAudioField from "@/components/MiniAudioField";
import AudioField from "@/components/AudioField";

type Stage = "professional" | "product" | "system";
const STAGES: { key: Stage; title: string; icon: string }[] = [
  { key: "professional", title: "Профессиональное обучение", icon: "💼" },
  { key: "product",      title: "Продуктовое обучение",      icon: "🎁" },
  { key: "system",       title: "Системное обучение",        icon: "⚙️" },
];

export type QKind = "choice" | "multichoice" | "string" | "paragraph" | "text";
export type Q = {
  id: string;
  kind: QKind;
  question: string;
  points: number;
  options?: { text: string; is_correct?: boolean }[] | null;
  correct?: string | string[] | null;
  expected_answer?: string | null;
};

function shuffleArr<T>(a: T[]): T[] {
  const arr = [...a];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function hexToRgba(hex: string, opacityPercent: number): string {
  if (!hex) return "transparent";
  let clean = hex.replace("#", "").trim();
  if (clean.length === 3) {
    clean = clean.split("").map((c) => c + c).join("");
  }
  if (clean.length !== 6) return hex;
  const num = parseInt(clean, 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  const a = Math.max(0, Math.min(100, opacityPercent)) / 100;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

export default function CandidateStageTraining({
  candidateId,
  projectId,
  activeTheme: passedTheme,
  companyLogo,
  companyName,
  vacancyTitle,
  roleName,
  initialStage,
}: {
  candidateId: string;
  projectId: string;
  activeTheme?: any;
  companyLogo?: string;
  companyName?: string;
  vacancyTitle?: string;
  roleName?: string;
  initialStage?: Stage;
}) {
  const { run: aiWaitRun } = useAIWait();
  const { activeTheme: hookTheme } = useLandingTheme();
  const activeTheme = passedTheme || hookTheme;
  const iconColor = activeTheme?.iconColor || "#FFFFFF";
  const boldTextColor = activeTheme?.boldTextColor || "#FFFFFF";
  const btnRadius = activeTheme?.btnBorderRadius === 999
    ? "9999px"
    : activeTheme?.btnBorderRadius != null
    ? `${activeTheme.btnBorderRadius}px`
    : "12px";
  const containerRadius = activeTheme?.containerBorderRadius != null ? `${activeTheme.containerBorderRadius}px` : "16px";
  const containerBorder = activeTheme?.containerBorderColor
    ? hexToRgba(activeTheme.containerBorderColor, activeTheme.containerBorderOpacity ?? 20)
    : "rgba(255, 255, 255, 0.20)";

  const btnBorderRgba = activeTheme?.btnBorderColor
    ? hexToRgba(activeTheme.btnBorderColor, activeTheme.btnBorderOpacity ?? 20)
    : "rgba(255, 255, 255, 0.25)";

  const headingStyle: React.CSSProperties = useMemo(() => {
    const font = activeTheme?.fontFamily || undefined;
    if (activeTheme?.headingsColorMode === "gradient-gold") {
      return {
        fontFamily: font,
        backgroundImage: "linear-gradient(to right, #F5E296, #D4AF37, #AA771C)",
        WebkitBackgroundClip: "text",
        backgroundClip: "text",
        WebkitTextFillColor: "transparent",
        color: "transparent",
      };
    }
    if (activeTheme?.headingsColorMode === "gradient-silver") {
      return {
        fontFamily: font,
        backgroundImage: "linear-gradient(to right, #FFFFFF, #E2E8F0, #94A3B8)",
        WebkitBackgroundClip: "text",
        backgroundClip: "text",
        WebkitTextFillColor: "transparent",
        color: "transparent",
      };
    }
    const solid = activeTheme?.headingsSolidColor || "#FFFFFF";
    return {
      fontFamily: font,
      color: solid,
      WebkitTextFillColor: solid,
    };
  }, [activeTheme]);

  const activeBtnStyle: React.CSSProperties = {
    backgroundColor: activeTheme ? hexToRgba(activeTheme.btnActiveBgColor || "#E7C768", activeTheme.btnActiveOpacity ?? 100) : "#FFFFFF",
    color: activeTheme?.btnActiveTextColor || "#000000",
    WebkitTextFillColor: activeTheme?.btnActiveTextColor || "#000000",
    borderColor: btnBorderRgba,
    borderRadius: btnRadius,
    borderWidth: `${activeTheme?.btnBorderWidth ?? 1}px`,
    fontFamily: activeTheme?.fontFamily || undefined,
  };

  const inactiveBtnStyle: React.CSSProperties = {
    backgroundColor: "transparent",
    color: activeTheme?.btnInactiveTextColor || "#FFFFFF",
    WebkitTextFillColor: activeTheme?.btnInactiveTextColor || "#FFFFFF",
    borderColor: btnBorderRgba,
    borderRadius: btnRadius,
    borderWidth: `${activeTheme?.btnBorderWidth ?? 1}px`,
    backdropFilter: `blur(${activeTheme?.glassBlurPx ?? 24}px)`,
    WebkitBackdropFilter: `blur(${activeTheme?.glassBlurPx ?? 24}px)`,
    fontFamily: activeTheme?.fontFamily || undefined,
  };

  const cardStyle: React.CSSProperties = {
    backgroundColor: "transparent",
    backdropFilter: `blur(${activeTheme?.glassBlurPx ?? 24}px)`,
    WebkitBackdropFilter: `blur(${activeTheme?.glassBlurPx ?? 24}px)`,
    borderColor: containerBorder,
    borderWidth: `${activeTheme?.containerBorderWidth ?? 1}px`,
    borderRadius: containerRadius,
    fontFamily: activeTheme?.fontFamily || undefined,
  };

  const [progress, setProgress] = useState<Record<Stage, { passed: boolean; best: number; attempts: number }>>({
    professional: { passed: false, best: 0, attempts: 0 },
    product: { passed: false, best: 0, attempts: 0 },
    system: { passed: false, best: 0, attempts: 0 },
  });
  const [progressLoaded, setProgressLoaded] = useState(false);
  const [active, setActive] = useState<Stage>(initialStage || "professional");

  useEffect(() => {
    if (initialStage && (initialStage === "professional" || initialStage === "product" || initialStage === "system")) {
      setActive(initialStage);
    }
  }, [initialStage]);

  // Synchronize candidate training stage in CRM and broadcast real-time event ONLY after initial DB progress loads
  useEffect(() => {
    if (!candidateId || !progressLoaded) return;
    const passedAll = Boolean(progress.professional?.passed && progress.product?.passed && progress.system?.passed);
    const targetStage = passedAll ? "certified" : active === "system" ? "systems" : active;

    void (async () => {
      try {
        await (dbClient as any).rpc("candidate_set_stage", {
          _candidate: candidateId,
          _stage: targetStage,
        });
        window.dispatchEvent(
          new CustomEvent("candidate_stage_updated", { detail: { candidateId, stage: targetStage } })
        );
        try {
          new BroadcastChannel("crm_stage_sync").postMessage({
            type: "candidate_stage_updated",
            candidateId,
            stage: targetStage,
          });
        } catch {}
      } catch (e) {
        console.warn("[CandidateStageTraining] Stage sync error:", e);
      }
    })();
  }, [progressLoaded, active, candidateId, progress.professional?.passed, progress.product?.passed, progress.system?.passed]);
  const [material, setMaterial] = useState<string>("");
  const [activeSubpageIdx, setActiveSubpageIdx] = useState<number>(0);
  const [questions, setQuestions] = useState<Q[]>([]);
  const [examQuestions, setExamQuestions] = useState<Q[]>([]);
  const [shuffle, setShuffle] = useState(true);
  const [passScore, setPassScore] = useState(70);
  const [totalScore, setTotalScore] = useState(100);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [mode, setMode] = useState<"reading" | "exam" | "result">("reading");
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [lastResult, setLastResult] = useState<{ score: number; passed: boolean; per_question: any[] } | null>(null);
  const [candidateSummary, setCandidateSummary] = useState<any>(null);
  const [pausedOpen, setPausedOpen] = useState(false);
  const [interviewGate, setInterviewGate] = useState<null | { avg: number | null; pass: number }>(null);
  // Лимиты RR §2: блокировка обучения, если у работодателя нет свободных
  // лимитов на обучение (и ещё не списано по этому кандидату).
  const [trainingLimitBlocked, setTrainingLimitBlocked] = useState<null | {
    name?: string|null; email?: string|null; phone?: string|null;
  }>(null);

  const callEdge = async <T,>(fn: string, body: any): Promise<T> => {
    // Кандидат не имеет database Auth — передаём его сессионный токен в теле и в заголовке.
    let candidateToken: string | null = null;
    try {
      const raw = localStorage.getItem("cand_session");
      if (raw) candidateToken = (JSON.parse(raw) as any)?.token || null;
    } catch { /* ignore */ }

    try {
      const forceProMax = typeof window !== "undefined" && Boolean((window as any).__RR_FORCE_PROMAX);
      const localRes = await fetch(`/api/${fn}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(candidateToken ? { "x-candidate-token": candidateToken } : {}),
        },
        body: JSON.stringify({
          ...body,
          candidate_token: candidateToken,
          ...(forceProMax ? { use_promax: true } : {}),
        }),
      });
      if (localRes.status !== 404) {
        const localJson = await localRes.json().catch(() => ({}));
        if (!localRes.ok || (localJson as any)?.error) {
          const e: any = new Error((localJson as any)?.error || `http_${localRes.status}`);
          e.jobId = (localJson as any)?.job_id || null;
          e.fallbackAvailable = !!(localJson as any)?.fallback_available;
          throw e;
        }
        return localJson as T;
      }
    } catch (localErr: any) {
      if (localErr?.message && !String(localErr.message).includes("Failed to fetch")) {
        throw localErr;
      }
    }

    const { data, error } = await dbClient.functions.invoke(fn, {
      body: { ...body, candidate_token: candidateToken },
      headers: candidateToken ? { "x-candidate-token": candidateToken } : undefined,
    });
    if (error) {
      // Извлекаем тело ответа (job_id, fallback_available) — нужно для
      // оверлея RR Pro Max.
      let bodyJson: any = null;
      try {
        const ctx: any = (error as any).context;
        if (ctx && typeof ctx.json === "function") bodyJson = await ctx.json();
      } catch { /* ignore */ }
      const msg = bodyJson?.error || (data as any)?.error || (error as any)?.message || `fn_${fn}_failed`;
      const e: any = new Error(msg);
      e.jobId = bodyJson?.job_id || null;
      e.fallbackAvailable = !!bodyJson?.fallback_available;
      throw e;
    }
    if (data && typeof data === "object" && "error" in (data as any) && (data as any).error) {
      const e: any = new Error((data as any).error);
      e.jobId = (data as any).job_id || null;
      e.fallbackAvailable = !!(data as any).fallback_available;
      throw e;
    }
    return data as T;
  };

  // Load progress
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: flow } = await (dbClient as any).rpc("candidate_flow_state", {
          candidate_id: candidateId,
          _project: projectId,
        });
        const rawPassServer = Number((flow as any)?.interview_pass_score);
        const passScoreServer = Number.isFinite(rawPassServer) && rawPassServer > 0 ? rawPassServer : 70;
        const avgServer = (flow as any)?.interview_average == null ? null : Number((flow as any).interview_average);
        const passed = !!(flow as any)?.interview_passed;
        if (!cancelled && !passed) {
          setInterviewGate({ avg: avgServer, pass: passScoreServer });
        } else {
          setInterviewGate(null);
        }
      } catch {
        if (!cancelled) { setInterviewGate(null); }
      }

      // Лимиты RR — единоразовая проверка при входе в систему обучения.
      try {
        const { data: limit } = await (dbClient as any).rpc("project_limit_status", {
          _project: projectId, _candidate: candidateId, _kind: "training",
        });
        if (!cancelled && limit && limit.has_capacity === false && limit.already_charged === false) {
          setTrainingLimitBlocked(limit.employer || {});
          return;
        }
      } catch { /* мягкая ошибка */ }
      const { data } = await dbClient.from("candidate_stage_progress")
        .select("stage,best_score,attempts,passed_at").eq("candidate_id", candidateId);
      if (cancelled) return;
      const next = { ...progress };
      (data || []).forEach((r: any) => {
        const normKey: Stage = r.stage === "systems" ? "system" : (r.stage as Stage);
        if (normKey === "professional" || normKey === "product" || normKey === "system") {
          next[normKey] = { passed: !!r.passed_at, best: r.best_score || 0, attempts: r.attempts || 0 };
        }
      });
      setProgress(next);
      // auto-jump to first unpassed stage
      const firstOpen = STAGES.find(s => !next[s.key].passed)?.key || "system";
      setActive(firstOpen);
      setProgressLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [candidateId, projectId]);

  // Load material + questions for active stage
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch {}
      setMode("reading");
      setAnswers({});
      setLastResult(null);
      setActiveSubpageIdx(0);
      try {
        let b: any = null;
        try {
          const sqlRes = await fetch(`/api/training-blocks?project_id=${encodeURIComponent(projectId)}&stage=${encodeURIComponent(active)}`);
          if (sqlRes.ok) {
            const sqlBlocks = await sqlRes.json();
            if (Array.isArray(sqlBlocks) && sqlBlocks.length > 0) {
              b = sqlBlocks[0];
            }
          }
        } catch (sqlErr) {
          console.warn("[CandidateStageTraining] Error loading from ProTalk PG:", sqlErr);
        }

        if (!b) {
          const { data: blocks } = await dbClient.from("training_blocks")
            .select("materials_md,title,updated_at")
            .eq("project_id", projectId).eq("stage", active)
            .order("updated_at", { ascending: false })
            .limit(1);
          b = (blocks || [])[0];
        }

        if (cancelled) return;
        setMaterial(b ? (b.materials_md || b.content || "") : "");
        const r = await callEdge<{ questions: Q[]; pass_score: number; total_score: number; shuffle?: boolean }>("ai-list-stage-questions", {
          project_id: projectId, stage: active,
        });
        if (cancelled) return;
        setQuestions(r.questions || []);
        setShuffle(r.shuffle !== false);
        setPassScore(Number(r.pass_score) > 0 ? Number(r.pass_score) : 70);
        setTotalScore(r.total_score || 100);
        // Restore last attempt result from DB so it persists across reloads
        const { data: prog } = await dbClient.from("candidate_stage_progress")
          .select("last_score,last_feedback,last_answers,passed_at,attempts,best_score,candidate_summary")
          .eq("candidate_id", candidateId).eq("stage", active).maybeSingle();
        if (cancelled) return;
        if (prog && (prog.attempts || 0) > 0 && prog.last_feedback) {
          let parsedFeedback = prog.last_feedback;
          if (typeof parsedFeedback === "string") {
            try { parsedFeedback = JSON.parse(parsedFeedback); } catch { parsedFeedback = []; }
          }
          setLastResult({
            score: Number(prog.last_score || 0),
            passed: !!prog.passed_at,
            per_question: Array.isArray(parsedFeedback) ? parsedFeedback : [],
          });
          setCandidateSummary((prog as any).candidate_summary || null);
        }
      } finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [active, projectId, candidateId]);

  const canEnter = (s: Stage) => {
    const idx = STAGES.findIndex(x => x.key === s);
    if (idx === 0) return true;
    return progress[STAGES[idx - 1].key].passed;
  };

  const getMultichoiceSelected = (qId: string): string[] => {
    const raw = answers[qId];
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    } catch {}
    return raw.split(",").map((s) => s.trim()).filter(Boolean);
  };

  const toggleMultichoiceOption = (qId: string, optText: string) => {
    const current = getMultichoiceSelected(qId);
    const next = current.includes(optText)
      ? current.filter((t) => t !== optText)
      : [...current, optText];
    setAnswers((a) => ({ ...a, [qId]: JSON.stringify(next) }));
  };

  const submit = async () => {
    setChecking(true);
    try {
      const payload = examQuestions.map(q => ({ question_id: q.id, value: answers[q.id] || "" }));
      const stageTitle =
        active === "professional" ? "Проверка профессионального теста"
        : active === "product" ? "Проверка продуктового теста"
        : "Проверка системного теста";
      const r = await aiWaitRun<any>({
        title: stageTitle,
        theme: activeTheme,
        task: () => callEdge<any>("ai-grade-training-quiz", {
          candidate_id: candidateId,
          project_id: projectId,
          stage: active,
          answers: payload,
          questions: examQuestions.length ? examQuestions : questions,
          pass_score: passScore,
          total_score: totalScore,
        }),
        fallback: {
          viewerAllowed: true,
          onSuccess: async (data: any) => {
            // Резервная модель вернула результат — обновляем UI как при основном пути.
            if (data) {
              setLastResult({ score: data.score, passed: data.passed, per_question: data.per_question });
              if (data.candidate_summary) setCandidateSummary(data.candidate_summary);
              setProgress(p => ({ ...p, [active]: { passed: data.passed || p[active].passed, best: Math.max(p[active].best, data.score || 0), attempts: data.attempts || (p[active].attempts + 1) } }));
              setMode("result");
            }
          },
        },
      });
      if (!r) return;
      // Списание лимита обучения выполняется ТОЛЬКО на сервере в
      // ai-grade-training-quiz (RPC charge_project_limit) при stage=professional.
      // Идемпотентно по (candidate, kind): повторные сдачи и последующие этапы
      // (product, system) не приводят к повторному списанию.
      setLastResult({ score: r.score, passed: r.passed, per_question: r.per_question });
      if (r.candidate_summary) {
        setCandidateSummary(r.candidate_summary);
      } else {
        // Refresh candidate-facing summary from DB (saved by edge function).
        try {
          const { data: prog } = await dbClient.from("candidate_stage_progress")
            .select("candidate_summary").eq("candidate_id", candidateId).eq("stage", active).maybeSingle();
          setCandidateSummary((prog as any)?.candidate_summary || null);
        } catch { /* ignore */ }
      }
      setProgress(p => ({ ...p, [active]: { passed: r.passed || p[active].passed, best: Math.max(p[active].best, r.score), attempts: r.attempts || (p[active].attempts + 1) } }));
      // Re-sync FULL progress from DB so locked/unlocked state of next stages
      // refreshes immediately without page reload.
      try {
        const { data: prog } = await dbClient.from("candidate_stage_progress")
          .select("stage,best_score,attempts,passed_at").eq("candidate_id", candidateId);
        if (prog) {
          const next = { ...progress };
          (prog as any[]).forEach((row) => {
            const normKey: Stage = row.stage === "systems" ? "system" : (row.stage as Stage);
            if (normKey === "professional" || normKey === "product" || normKey === "system") {
              next[normKey] = { passed: !!row.passed_at, best: row.best_score || 0, attempts: row.attempts || 0 };
            }
          });
          setProgress(next);
        }
      } catch { /* ignore */ }
      setMode("result");
      try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch {}
    } catch (e: any) {
      if (isVacancyPausedError(e)) setPausedOpen(true);
      else alert("Ошибка проверки: " + formatUserError(toUserError(e)));
    } finally { setChecking(false); }
  };

  const overall = useMemo(() => {
    const passed = STAGES.filter(s => progress[s.key].passed).length;
    return Math.round((passed / STAGES.length) * 100);
  }, [progress]);

  const startExam = () => {
    let qs = questions;
    if (shuffle) {
      qs = shuffleArr(qs).map(q => q.kind === "choice" && q.options
        ? { ...q, options: shuffleArr(q.options) }
        : q);
    }
    setExamQuestions(qs);
    setAnswers({});
    setMode("exam");
    try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch {}
  };

  if (trainingLimitBlocked) {
    return <LimitExhaustedOverlay kind="training" employer={trainingLimitBlocked} />;
  }



  return (
    <div
      id="candidate-training-root"
      className="candidate-training-root company-landing-root training-preview-root w-full max-w-full space-y-4 sm:space-y-5 px-[2%] sm:px-4 overflow-hidden"
    >
      {activeTheme && (
        <style>{buildThemeCss(activeTheme)}</style>
      )}
      {/* Progress header */}
      <Reveal
        direction="down"
        className="section-card liquid-glass-card bg-transparent backdrop-blur-2xl border px-[2%] py-3 sm:px-4 sm:py-4 md:p-6 shadow-xl space-y-3 sm:space-y-4 w-full"
        style={cardStyle}
      >
        <div className="flex items-center gap-3 mb-2 sm:mb-3 flex-wrap sm:flex-nowrap">
          <CompanyThemedLogo
            logoUrl={companyLogo}
            companyName={companyName}
            theme={activeTheme}
            size="md"
            className="shrink-0"
          />
          <div className="flex-1 min-w-0">
            <h2 className="text-base sm:text-lg font-bold truncate break-words" style={headingStyle}>Курс обучения — 3 этапа</h2>
            <p className="text-sm text-slate-300 break-words">Этапы открываются по очереди. Тест каждого можно перепроходить неограниченно — пока не наберёте {passScore} баллов.</p>
          </div>
          <div className="text-right shrink-0">
            <div className="text-lg sm:text-xl font-bold" style={{ color: boldTextColor }}>{overall}%</div>
            <div className="text-sm text-slate-400">общий прогресс</div>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {STAGES.map(s => {
            const st = progress[s.key];
            const locked = !canEnter(s.key);
            const isActive = active === s.key;
            const btnTextColor = isActive
              ? (activeTheme?.btnActiveTextColor || "#000000")
              : (activeTheme?.btnInactiveTextColor || "#FFFFFF");
            return (
              <button
                key={s.key}
                type="button"
                disabled={locked}
                onClick={() => setActive(s.key)}
                className={`p-2 sm:p-2.5 md:p-3 text-left border transition cursor-pointer flex flex-col justify-between gap-1 shadow-sm break-words whitespace-normal text-wrap ${
                  isActive
                    ? "landing-btn-active font-bold"
                    : locked
                      ? "bg-transparent text-slate-500 border-white/10 cursor-not-allowed opacity-50"
                      : "landing-btn-inactive hover:bg-white/10"
                }`}
                style={{
                  ...(isActive ? activeBtnStyle : inactiveBtnStyle),
                  color: btnTextColor,
                }}
              >
                <div className="flex items-center justify-between text-sm font-bold leading-tight break-words whitespace-normal text-wrap" style={{ color: btnTextColor }}>
                  <span className="inline-flex items-center gap-1.5 break-words whitespace-normal text-wrap" style={{ color: btnTextColor }}>
                    {s.key === "professional" ? (
                      <CompanyThemedLogo
                        logoUrl={companyLogo}
                        companyName={companyName}
                        theme={activeTheme}
                        size="sm"
                        className="w-4 h-4 shrink-0 inline-flex"
                      />
                    ) : (
                      <span className="shrink-0">{s.icon}</span>
                    )}
                    <span className="break-words whitespace-normal text-wrap" style={{ color: btnTextColor }}>{s.title}</span>
                  </span>
                  {locked ? <Lock className="w-4 h-4 text-white/40 shrink-0" /> : st.passed ? <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: isActive ? btnTextColor : iconColor }} /> : null}
                </div>
                <div className="text-sm opacity-85 mt-1 break-words whitespace-normal text-wrap" style={{ color: btnTextColor }}>
                  {st.passed ? `Сдан • ${st.best}/${totalScore}` : st.attempts > 0 ? `Попыток: ${st.attempts}, лучший: ${st.best}` : "Не начат"}
                </div>
              </button>
            );
          })}
        </div>
      </Reveal>

      {loading ? (
        <Reveal
          direction="fade"
          className="section-card liquid-glass-card bg-transparent backdrop-blur-2xl border p-10 text-center shadow-xl"
          style={cardStyle}
        >
          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" style={{ color: iconColor }} />
          <LoadingPhrase entity="training" />
        </Reveal>
      ) : !canEnter(active) ? (
        <Reveal
          direction="scale"
          className="section-card liquid-glass-card bg-transparent backdrop-blur-2xl border p-8 text-center text-white space-y-2 shadow-xl"
          style={cardStyle}
        >
          <Lock className="w-8 h-8 mx-auto mb-2" style={{ color: iconColor }} />
          <p className="text-sm">Сначала сдайте предыдущий этап.</p>
        </Reveal>
      ) : mode === "reading" ? (
        <Reveal direction="up" className="space-y-4">
          {questions.length > 0 && (
            <button
              type="button"
              onClick={startExam}
              className="w-full landing-btn-active text-sm py-3.5 px-6 font-bold flex items-center justify-center gap-2 shadow-lg transition border cursor-pointer"
              style={{
                ...activeBtnStyle,
                color: activeTheme?.btnActiveTextColor || "#000000",
                WebkitTextFillColor: activeTheme?.btnActiveTextColor || "#000000",
              }}
            >
              <Sparkles className="w-4 h-4 shrink-0" style={{ color: activeTheme?.btnActiveTextColor || "#000000", stroke: activeTheme?.btnActiveTextColor || "#000000" }} />
              <span style={{ color: activeTheme?.btnActiveTextColor || "#000000", WebkitTextFillColor: activeTheme?.btnActiveTextColor || "#000000" }}>
                {progress[active].attempts > 0
                  ? `Перепройти тест (${questions.length} вопр., проходной ${passScore}/${totalScore})`
                  : `Перейти к тесту (${questions.length} вопр., проходной ${passScore}/${totalScore})`}
              </span>
            </button>
          )}
          {material ? (() => {
            const effectiveRole = roleName || vacancyTitle || "";
            const currentStageTitle = STAGES.find(s => s.key === active)?.title || "Основной материал";
            const compositeFallbackTitle = buildCompositeSubpageTitle({
              companyName,
              vacancyTitle: effectiveRole,
              subpageIdx: 0,
              totalSubpages: 1,
            });
            const parsedSubpages = parseSubpages(material, compositeFallbackTitle).map((p, pIdx, arr) => {
              const trimmed = (p.title || "").trim();
              const isGeneric =
                !trimmed ||
                trimmed === "Основной материал" ||
                trimmed === currentStageTitle ||
                /^Подстраница\s+\d+$/i.test(trimmed) ||
                /^Раздел\s+\d+$/i.test(trimmed);
              if (isGeneric) {
                return {
                  ...p,
                  title: buildCompositeSubpageTitle({
                    companyName,
                    vacancyTitle: effectiveRole,
                    subpageIdx: pIdx,
                    totalSubpages: arr.length,
                  }),
                };
              }
              return p;
            });
            const currentSubpage = parsedSubpages[activeSubpageIdx] || parsedSubpages[0] || { id: "p1", title: "", content: material };
            return (
              <div className="space-y-4">
                {parsedSubpages.length > 1 && (
                  <div
                    className="section-card liquid-glass-card px-[2%] py-3 sm:px-4 sm:py-3.5 space-y-2.5 sm:space-y-3 shadow-xl border w-full"
                    style={cardStyle}
                  >
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <BookOpen className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" style={{ color: iconColor }} />
                        <span className="text-sm font-bold truncate" style={headingStyle}>
                          Подстраницы обучения
                        </span>
                      </div>
                      <span
                        className="text-sm font-semibold border px-2.5 py-1 rounded-xl"
                        style={{
                          color: activeTheme?.bodyTextColor || "#CBD5E1",
                          borderColor: containerBorder,
                        }}
                      >
                        Подстраница {activeSubpageIdx + 1} из {parsedSubpages.length}
                      </span>
                    </div>

                    <div className="flex flex-col sm:flex-row flex-wrap gap-2">
                      {parsedSubpages.map((p, pIdx) => {
                        const isCurrent = pIdx === activeSubpageIdx;
                        const btnTextColor = isCurrent
                          ? (activeTheme?.btnActiveTextColor || "#000000")
                          : (activeTheme?.btnInactiveTextColor || "#FFFFFF");
                        return (
                          <button
                            key={p.id || pIdx}
                            type="button"
                            onClick={() => setActiveSubpageIdx(pIdx)}
                            className={`px-3 py-2 text-sm font-bold border transition text-left cursor-pointer shadow-md break-words whitespace-normal text-wrap leading-snug ${
                              isCurrent ? "landing-btn-active" : "landing-btn-inactive"
                            }`}
                            style={{
                              ...(isCurrent ? activeBtnStyle : inactiveBtnStyle),
                              color: btnTextColor,
                              WebkitTextFillColor: btnTextColor,
                            }}
                          >
                            <span className="break-words whitespace-normal text-wrap" style={{ color: btnTextColor, WebkitTextFillColor: btnTextColor }}>
                              {pIdx + 1}. {p.title || `Раздел ${pIdx + 1}`}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <RichTrainingMaterialCard
                  title={`${STAGES.find(s => s.key === active)?.title}${parsedSubpages.length > 1 && currentSubpage.title ? ` • ${currentSubpage.title}` : ""}`}
                  logoUrl={companyLogo}
                  companyName={companyName}
                  theme={activeTheme}
                >
                  {currentSubpage.content || material}
                </RichTrainingMaterialCard>

                {parsedSubpages.length > 1 && (
                  <div className="flex items-center justify-between gap-2.5 flex-wrap pt-1">
                    <button
                      type="button"
                      disabled={activeSubpageIdx === 0}
                      onClick={() => setActiveSubpageIdx(i => Math.max(0, i - 1))}
                      className="px-3 sm:px-4 py-2 sm:py-2.5 text-sm font-bold flex items-center gap-1.5 transition disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer border shadow-sm break-words whitespace-normal text-wrap"
                      style={{
                        ...inactiveBtnStyle,
                        color: activeTheme?.btnInactiveTextColor || "#FFFFFF",
                        WebkitTextFillColor: activeTheme?.btnInactiveTextColor || "#FFFFFF",
                      }}
                    >
                      <ChevronLeft className="w-4 h-4 shrink-0" style={{ color: activeTheme?.btnInactiveTextColor || "#FFFFFF", stroke: activeTheme?.btnInactiveTextColor || "#FFFFFF" }} /> <span className="break-words" style={{ color: activeTheme?.btnInactiveTextColor || "#FFFFFF", WebkitTextFillColor: activeTheme?.btnInactiveTextColor || "#FFFFFF" }}>Предыдущая подстраница</span>
                    </button>

                    <span
                      className="text-sm font-medium"
                      style={{ color: activeTheme?.bodyTextColor || "#CBD5E1" }}
                    >
                      {activeSubpageIdx + 1} из {parsedSubpages.length}
                    </span>

                    {activeSubpageIdx < parsedSubpages.length - 1 ? (
                      <button
                        type="button"
                        onClick={() => setActiveSubpageIdx(i => Math.min(parsedSubpages.length - 1, i + 1))}
                        className="landing-btn-active px-3 sm:px-4 py-2 sm:py-2.5 text-sm font-bold flex items-center gap-1.5 transition cursor-pointer border shadow-sm break-words whitespace-normal text-wrap"
                        style={{
                          ...activeBtnStyle,
                          color: activeTheme?.btnActiveTextColor || "#000000",
                          WebkitTextFillColor: activeTheme?.btnActiveTextColor || "#000000",
                        }}
                      >
                        <span className="break-words font-bold" style={{ color: activeTheme?.btnActiveTextColor || "#000000", WebkitTextFillColor: activeTheme?.btnActiveTextColor || "#000000" }}>Следующая подстраница</span> <ChevronRight className="w-4 h-4 shrink-0" style={{ color: activeTheme?.btnActiveTextColor || "#000000", stroke: activeTheme?.btnActiveTextColor || "#000000" }} />
                      </button>
                    ) : questions.length > 0 ? (
                      <button
                        type="button"
                        onClick={startExam}
                        className="landing-btn-active px-4 sm:px-6 py-2 sm:py-2.5 text-sm font-bold flex items-center gap-1.5 shadow-xl hover:brightness-105 transition cursor-pointer border break-words whitespace-normal text-wrap"
                        style={{
                          ...activeBtnStyle,
                          color: activeTheme?.btnActiveTextColor || "#000000",
                          WebkitTextFillColor: activeTheme?.btnActiveTextColor || "#000000",
                        }}
                      >
                        <Sparkles className="w-4 h-4 shrink-0" style={{ color: activeTheme?.btnActiveTextColor || "#000000", stroke: activeTheme?.btnActiveTextColor || "#000000" }} />
                        <span className="break-words font-bold" style={{ color: activeTheme?.btnActiveTextColor || "#000000", WebkitTextFillColor: activeTheme?.btnActiveTextColor || "#000000" }}>Перейти к тесту</span>
                      </button>
                    ) : null}
                  </div>
                )}
              </div>
            );
          })() : (
            <div
              className="section-card liquid-glass-card bg-transparent backdrop-blur-2xl border p-6 shadow-xl"
              style={cardStyle}
            >
              <p className="text-slate-400 text-sm">Материалы по этапу ещё не подготовлены работодателем.</p>
            </div>
          )}
          {questions.length > 0 ? (
            <button
              type="button"
              onClick={startExam}
              className="w-full landing-btn-active text-sm py-3.5 px-6 font-bold flex items-center justify-center gap-2 shadow-lg transition border cursor-pointer"
              style={{
                ...activeBtnStyle,
                color: activeTheme?.btnActiveTextColor || "#000000",
                WebkitTextFillColor: activeTheme?.btnActiveTextColor || "#000000",
              }}
            >
              <Sparkles className="w-4 h-4 shrink-0" style={{ color: activeTheme?.btnActiveTextColor || "#000000", stroke: activeTheme?.btnActiveTextColor || "#000000" }} />
              <span className="font-bold" style={{ color: activeTheme?.btnActiveTextColor || "#000000", WebkitTextFillColor: activeTheme?.btnActiveTextColor || "#000000" }}>
                {progress[active].attempts > 0
                  ? `Перепройти тест (${questions.length} вопр., проходной ${passScore}/${totalScore})`
                  : `Перейти к тесту (${questions.length} вопр., проходной ${passScore}/${totalScore})`}
              </span>
            </button>
          ) : (
            <div
              className="w-full bg-transparent border text-slate-300 text-sm py-3 px-4 text-center backdrop-blur-xl"
              style={{
                borderColor: containerBorder,
                borderRadius: containerRadius,
                borderWidth: `${activeTheme?.containerBorderWidth ?? 1}px`,
              }}
            >
              Тест по этому этапу ещё не сформирован работодателем.
            </div>
          )}
        </Reveal>
      ) : mode === "exam" ? (
        <Reveal
          direction="up"
          className="section-card liquid-glass-card bg-transparent backdrop-blur-2xl border p-6 space-y-4 shadow-xl"
          style={cardStyle}
        >
          <div className="flex items-center justify-between gap-3 border-b pb-3" style={{ borderColor: containerBorder }}>
            <h3 className="text-base font-bold" style={headingStyle}>Тест: {STAGES.find(s => s.key === active)?.title}</h3>
            <span
              className="text-sm font-semibold px-2.5 py-1 border"
              style={{
                color: activeTheme?.bodyTextColor || "#CBD5E1",
                borderColor: containerBorder,
                borderRadius: btnRadius,
                borderWidth: `${activeTheme?.containerBorderWidth ?? 1}px`
              }}
            >
              Проходной балл: {passScore} / {totalScore}
            </span>
          </div>
          {examQuestions.map((q, i) => (
            <Reveal
              key={q.id}
              direction="left"
              delay={i * 60}
              className="p-4 space-y-3 border backdrop-blur-xl"
              style={{
                ...cardStyle,
                backgroundColor: activeTheme?.containerBgColor
                  ? hexToRgba(activeTheme.containerBgColor, activeTheme.containerBgOpacity ?? 12)
                  : "rgba(0, 0, 0, 0.25)",
              }}
            >
              <div className="flex items-center justify-between text-sm font-bold" style={{ color: boldTextColor }}>
                <span>Вопрос {i + 1} • {q.points} б.</span>
                <span
                  className="text-sm px-2.5 py-0.5 border font-medium"
                  style={{
                    color: iconColor,
                    borderColor: containerBorder,
                    borderRadius: btnRadius,
                  }}
                >
                  {q.kind === "string" ? "Строка" : q.kind === "paragraph" ? "Абзац" : q.kind === "multichoice" ? "Мультивыбор" : "Один из списка"}
                </span>
              </div>
              <div className="text-sm font-medium leading-relaxed" style={{ color: activeTheme?.bodyTextColor || "#FFFFFF" }}>
                {q.question}
              </div>
              {q.kind === "choice" ? (
                <div className="space-y-1.5">
                  {(q.options || []).map((o, oi) => {
                    const isSelected = answers[q.id] === o.text;
                    return (
                      <label
                        key={oi}
                        className={`flex items-start gap-2.5 p-2.5 cursor-pointer border transition text-sm ${
                          isSelected ? "landing-btn-active font-bold" : "landing-btn-inactive hover:bg-white/10"
                        }`}
                        style={isSelected ? activeBtnStyle : inactiveBtnStyle}
                      >
                        <input
                          type="radio"
                          name={q.id}
                          checked={isSelected}
                          onChange={() => setAnswers(a => ({ ...a, [q.id]: o.text }))}
                          className="mt-1 cursor-pointer"
                          style={{ accentColor: iconColor }}
                        />
                        <span
                          className="text-sm leading-relaxed"
                          style={{
                            color: isSelected
                              ? (activeTheme?.btnActiveTextColor || "#000000")
                              : (activeTheme?.btnInactiveTextColor || "rgb(241 245 249)"),
                            WebkitTextFillColor: isSelected
                              ? (activeTheme?.btnActiveTextColor || "#000000")
                              : (activeTheme?.btnInactiveTextColor || "rgb(241 245 249)"),
                          }}
                        >
                          {o.text}
                        </span>
                      </label>
                    );
                  })}
                </div>
              ) : q.kind === "multichoice" ? (
                <div className="space-y-2">
                  <div className="text-sm" style={{ color: activeTheme?.bodyTextColor || "#CBD5E1" }}>
                    Выберите один или несколько правильных вариантов:
                  </div>
                  {(q.options || []).map((o, oi) => {
                    const isSelected = getMultichoiceSelected(q.id).includes(o.text);
                    return (
                      <div
                        key={oi}
                        role="button"
                        tabIndex={0}
                        onClick={() => toggleMultichoiceOption(q.id, o.text)}
                        onKeyDown={(e) => {
                          if (e.key === " " || e.key === "Enter") {
                            e.preventDefault();
                            toggleMultichoiceOption(q.id, o.text);
                          }
                        }}
                        className={`flex items-start gap-2.5 p-2.5 cursor-pointer border transition text-sm select-none ${
                          isSelected ? "landing-btn-active font-bold" : "landing-btn-inactive hover:bg-white/10"
                        }`}
                        style={isSelected ? activeBtnStyle : inactiveBtnStyle}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          readOnly
                          tabIndex={-1}
                          className="pointer-events-none mt-1 cursor-pointer"
                          style={{ accentColor: iconColor }}
                        />
                        <span
                          className="text-sm leading-relaxed pointer-events-none"
                          style={{
                            color: isSelected
                              ? (activeTheme?.btnActiveTextColor || "#000000")
                              : (activeTheme?.btnInactiveTextColor || "rgb(241 245 249)"),
                            WebkitTextFillColor: isSelected
                              ? (activeTheme?.btnActiveTextColor || "#000000")
                              : (activeTheme?.btnInactiveTextColor || "rgb(241 245 249)"),
                          }}
                        >
                          {o.text}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : q.kind === "string" ? (
                <div className="space-y-2">
                  <MiniAudioField
                    value={answers[q.id] || ""}
                    onChange={(val) => setAnswers(a => ({ ...a, [q.id]: val }))}
                    placeholder="Введите краткий ответ или нажмите на микрофон..."
                    theme={activeTheme}
                    sphereColor={iconColor}
                    borderColor={containerBorder}
                  />
                </div>
              ) : (
                <div className="space-y-2">
                  <AudioField
                    value={answers[q.id] || ""}
                    onChange={(val) => setAnswers(a => ({ ...a, [q.id]: val }))}
                    placeholder="Введите развернутый ответ или запишите через микрофон..."
                    theme={activeTheme}
                  />
                </div>
              )}
            </Reveal>
          ))}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setMode("reading")}
              className="flex-1 landing-btn-inactive text-sm py-2.5 border transition cursor-pointer"
              style={inactiveBtnStyle}
            >
              <span
                style={{
                  color: activeTheme?.btnInactiveTextColor || "#FFFFFF",
                  WebkitTextFillColor: activeTheme?.btnInactiveTextColor || "#FFFFFF",
                }}
              >
                ← К материалу
              </span>
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={checking}
              className="flex-[2] landing-btn-active text-sm py-2.5 font-bold flex items-center justify-center gap-2 disabled:opacity-60 border cursor-pointer shadow-md transition"
              style={{
                ...activeBtnStyle,
                color: activeTheme?.btnActiveTextColor || "#000000",
                WebkitTextFillColor: activeTheme?.btnActiveTextColor || "#000000",
              }}
            >
              {checking ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" style={{ color: activeTheme?.btnActiveTextColor || "#000000" }} />
                  <span style={{ color: activeTheme?.btnActiveTextColor || "#000000", WebkitTextFillColor: activeTheme?.btnActiveTextColor || "#000000" }}>Проверяем…</span>
                </>
              ) : (
                <span style={{ color: activeTheme?.btnActiveTextColor || "#000000", WebkitTextFillColor: activeTheme?.btnActiveTextColor || "#000000" }}>Проверить ответы</span>
              )}
            </button>
          </div>
          {checking && <LoadingPhrase entity="training" />}
        </Reveal>
      ) : (
        <Reveal
          direction="scale"
          className="section-card liquid-glass-card bg-transparent backdrop-blur-2xl border p-6 space-y-4 shadow-xl"
          style={cardStyle}
        >
          <div
            className="border-b pb-3 flex items-center justify-between gap-2 flex-wrap"
            style={{ borderColor: containerBorder }}
          >
            <h3 className="text-base font-bold" style={headingStyle}>
              Результат проверки аттестации
            </h3>
          </div>
          <CandidateTrainingStageReport
            passed={!!lastResult?.passed}
            score={Number(lastResult?.score || 0)}
            max={totalScore}
            passScore={passScore}
            summary={candidateSummary}
            theme={activeTheme}
            perQuestionLegacy={(lastResult?.per_question || []).map((pq: any) => ({
              ...pq,
              question: questions.find((qq) => qq.id === pq.id)?.question,
            }))}
          />
          <div className="flex gap-2">
            {!lastResult?.passed && (
              <button
                type="button"
                onClick={() => { setLastResult(null); startExam(); }}
                className="flex-1 landing-btn-active text-sm py-2.5 font-bold border cursor-pointer shadow-md"
                style={{
                  ...activeBtnStyle,
                  color: activeTheme?.btnActiveTextColor || "#000000",
                  WebkitTextFillColor: activeTheme?.btnActiveTextColor || "#000000",
                }}
              >
                <span style={{ color: activeTheme?.btnActiveTextColor || "#000000", WebkitTextFillColor: activeTheme?.btnActiveTextColor || "#000000" }}>
                  Перепройти тест
                </span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setMode("reading")}
              className="flex-1 landing-btn-inactive text-sm py-2.5 font-bold border transition cursor-pointer"
              style={{
                ...inactiveBtnStyle,
                color: activeTheme?.btnInactiveTextColor || "#FFFFFF",
                WebkitTextFillColor: activeTheme?.btnInactiveTextColor || "#FFFFFF",
              }}
            >
              <span style={{ color: activeTheme?.btnInactiveTextColor || "#FFFFFF", WebkitTextFillColor: activeTheme?.btnInactiveTextColor || "#FFFFFF" }}>
                К материалу
              </span>
            </button>
            {lastResult?.passed && (() => {
              const idx = STAGES.findIndex(s => s.key === active);
              const next = STAGES[idx + 1];
              if (!next) return <div className="flex-1 text-center text-sm font-bold py-2.5" style={{ color: boldTextColor }}>🎓 Курс пройден полностью!</div>;
              return (
                <button
                  type="button"
                  onClick={() => setActive(next.key)}
                  className="flex-1 landing-btn-active text-sm py-2.5 font-bold border cursor-pointer shadow-md"
                  style={{
                    ...activeBtnStyle,
                    color: activeTheme?.btnActiveTextColor || "#000000",
                    WebkitTextFillColor: activeTheme?.btnActiveTextColor || "#000000",
                  }}
                >
                  <span style={{ color: activeTheme?.btnActiveTextColor || "#000000", WebkitTextFillColor: activeTheme?.btnActiveTextColor || "#000000" }}>
                    Следующий этап → {next.icon}
                  </span>
                </button>
              );
            })()}
          </div>
        </Reveal>
      )}
      <VacancyPausedDialog open={pausedOpen} projectId={projectId} onClose={() => setPausedOpen(false)} />
    </div>
  );
}