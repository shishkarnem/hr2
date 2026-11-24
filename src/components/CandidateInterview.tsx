import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader, FileText, CheckCircle, MessageSquare, Award, RefreshCw, Send, Upload, CheckCircle2, ChevronDown, ChevronUp, Shuffle } from "lucide-react";
import { dbClient } from "@/lib/dbClient";
import { LoadingPhrase } from "@/components/LoadingPhrase";
import { useAIWait } from "@/components/AIWaitProvider";
import { getCandidateSession } from "@/lib/candidateSession";
import { getUploadService } from "@/services/FileUploadService";
import { useAIReady } from "@/lib/aiReady";
import { aiRestart } from "@/lib/aiClient";
import EmbeddedMarkdown from "@/components/EmbeddedMarkdown";
import RichMarkdown from "@/components/RichMarkdown";
import AudioField from "@/components/AudioField";
import MiniAudioField from "@/components/MiniAudioField";
import ResumeDropzone, { detectFileTypeFromNameOrMime } from "@/components/ResumeDropzone";
import DisclosureBlock from "@/components/DisclosureBlock";
import { VacancyPausedDialog, isVacancyPausedError } from "@/components/VacancyPausedDialog";
import LimitExhaustedOverlay from "@/components/LimitExhaustedOverlay";
import { toUserError, formatUserError } from "@/lib/userError";
import {
  startResumeScreenV2, pollJobUntilTerminal,
  getActiveJob, clearActiveJob, isSuccess, isTerminal, fetchJobStatus, getCandidateToken,
} from "@/lib/aiJobs";
import { describeJobError } from "@/lib/feedbackAdapters";
import { useCandidateAiJob } from "@/hooks/useCandidateAiJob";
import { adaptCandidateChecklist, adaptCandidateSituations } from "@/lib/feedbackAdapters";
import CandidateChecklistReport from "@/components/reports/CandidateChecklistReport";
import CandidateSituationsReport from "@/components/reports/CandidateSituationsReport";
import CandidateOverallReport from "@/components/reports/CandidateOverallReport";
import { useLandingTheme } from "./LandingStyleEditor";
import { CandidateFieldsEditorBlock } from "@/components/CandidateFieldsEditorBlock";
import { parseVacancyCustomFieldsConfig } from "@/constants/candidateFields";

type Stage = "resume" | "checklist" | "situations" | "done";

/**
 * Safe diagnostic logger for the resume-submit pipeline. We log ONLY short
 * status tags + safe codes — never the resume text, candidate token, email
 * parameters. Lands in browser console for diagnostics.
 */
function rrLog(event: string, extra?: Record<string, unknown>) {
  try {
    // eslint-disable-next-line no-console
    console.info(`[rr_resume] ${event}`, extra || {});
  } catch { /* ignore */ }
}

/** Map a safe error code (from edge function or pre-invoke throw) to RU copy. */
function describeResumeSubmitError(code: string): string {
  const s = String(code || "").toLowerCase();
  if (s === "candidate_session_missing" || s === "candidate_token_required" || s === "bad_token") {
    return "Сессия кандидата истекла. Войдите снова, чтобы продолжить.";
  }
  if (s === "no_resume") return "Резюме слишком короткое или не сохранилось. Добавьте больше текста и повторите.";
  if (s === "no_project") return "Вакансия не привязана к вашему профилю. Откройте ссылку вакансии заново.";
  if (s === "no_credits") return "У работодателя закончились средства на ИИ-собеседование. Свяжитесь с ним напрямую.";
  if (s === "resume_save_failed") return "Не удалось сохранить резюме. Повторите попытку через минуту.";
  if (s === "runtime_no_background") return "Сервер ИИ временно недоступен. Повторите попытку чуть позже.";
  if (s === "bad_request_id" || s === "bad_async_version" || s === "bad_body") {
    return "Не удалось отправить запрос. Перезагрузите страницу и повторите.";
  }
  if (s === "job_create_failed") return "Не удалось создать задание. Попробуйте ещё раз через минуту.";
  if (s === "failed to fetch" || s === "networkerror" || s.includes("network")) {
    return "Нет связи с сервером. Проверьте интернет и повторите.";
  }
  // Fall through to the generic AI-job describer for terminal statuses.
  const generic = describeJobError(s);
  return generic || "Не удалось отправить резюме на оценку. Повторите попытку.";
}

type QuestionKind = "choice" | "multichoice" | "text" | "paragraph";
type Question = {
  id: string;
  kind: QuestionKind;
  question: string;
  options?: string[] | null;
  correct?: string | null;
  correct_options?: string[] | null;
  expected_answer?: string | null;
};
type Situation = { id: string; title: string; brief: string };

function shuffleArr<T>(a: T[]): T[] {
  const arr = [...a];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function normalizeQKind(raw: any): QuestionKind {
  const k = String(raw || "").toLowerCase().trim();
  if (k === "multichoice" || k === "multiple_choice" || k === "checkbox") return "multichoice";
  if (k === "paragraph" || k === "textarea" || k === "long_text") return "paragraph";
  if (k === "choice" || k === "single_choice" || k === "radio" || k === "select") return "choice";
  return "text";
}

function prepareCandidateQuestions(rawQs: any[], doShuffle = true): Question[] {
  if (!Array.isArray(rawQs) || rawQs.length === 0) return [];
  const hasMulti = rawQs.some((q) => normalizeQKind(q?.kind) === "multichoice");
  const hasPara = rawQs.some((q) => normalizeQKind(q?.kind) === "paragraph");
  let cIdx = 0;
  let oIdx = 0;
  const totalChoice = rawQs.filter((q) => {
    const k = normalizeQKind(q?.kind);
    return k === "choice" || k === "multichoice";
  }).length;
  const totalOpen = rawQs.length - totalChoice;

  const mapped: Question[] = rawQs.map((q, idx) => {
    let kind = normalizeQKind(q?.kind);
    if (!hasMulti && kind === "choice") {
      cIdx++;
      if (cIdx > Math.ceil(totalChoice / 2)) kind = "multichoice";
    }
    if (!hasPara && kind === "text") {
      oIdx++;
      if (oIdx > Math.ceil(totalOpen / 2)) kind = "paragraph";
    }
    const opts =
      (kind === "choice" || kind === "multichoice") && Array.isArray(q?.options) && q.options.length > 0
        ? shuffleArr(q.options.map((o: any) => String(o || "").trim()).filter(Boolean))
        : q?.options || null;
    return {
      ...q,
      id: q?.id || `q${idx + 1}`,
      kind,
      question: String(q?.question || ""),
      options: opts,
    };
  });
  return doShuffle ? shuffleArr(mapped) : mapped;
}

type Props = {
  projectId: string;
  candidateId: string;
  onCompleted?: (passed: boolean, score: number) => void;
  /** External URL-driven sub-tab: "resume" | "checklist" | "situations" | "overall". */
  subTab?: string;
  /** Called when the internal stage changes so parent can sync URL. */
  onSubTabChange?: (sub: "resume" | "checklist" | "situations" | "overall") => void;
  /** Called by the "Обновить балл" button on the Итог tab so parent can
   *  re-hydrate candidate.scores + flow-state from the DB. Avoids waiting
   *  for the Realtime subscription and eliminates the "надо F5" case. */
  onRefresh?: () => void | Promise<void>;
  activeTheme?: any;
};

// FN импортируется из единого конфига — используется только для multipart/FormData запросов.
import { FN } from "@/config";

async function call(fn: string, body: any) {
  // 1. Primary path: Local Express backend
  try {
    const directFileUrl = typeof body?.file_url === "string" && body.file_url.startsWith("/")
      ? `${window.location.origin}${body.file_url}`
      : body?.file_url;
    let candidateToken: string | null = null;
    try {
      const raw = localStorage.getItem("cand_session");
      if (raw) candidateToken = (JSON.parse(raw) as any)?.token || null;
    } catch { /* ignore */ }

    const localRes = await fetch(`/api/${fn}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(candidateToken ? { "x-candidate-token": candidateToken } : {}),
      },
      body: JSON.stringify({ ...body, file_url: directFileUrl, candidate_token: candidateToken }),
    });
    const j = await localRes.json().catch(() => null);
    if (localRes.ok) {
      if (j && !j.error) return j;
      if (j?.error) {
        const e: any = new Error(j.error);
        e.jobId = j.job_id || null;
        e.fallbackAvailable = !!j.fallback_available;
        throw e;
      }
      return j;
    }
    if (j?.error || j?.message) {
      const e: any = new Error(j.error || j.message);
      e.jobId = j.job_id || null;
      e.fallbackAvailable = !!j.fallback_available;
      throw e;
    }
    throw new Error(`HTTP ${localRes.status}`);
  } catch (err: any) {
    if (err?.message && !err.message.includes("Failed to fetch") && !err.message.includes("NetworkError")) {
      throw err;
    }
    // Secondary fallback only on true network connection failure
    let candidateToken: string | null = null;
    try {
      const raw = localStorage.getItem("cand_session");
      if (raw) candidateToken = (JSON.parse(raw) as any)?.token || null;
    } catch { /* ignore */ }
    const { data, error } = await dbClient.functions.invoke(fn, {
      body: { ...body, candidate_token: candidateToken },
      headers: candidateToken ? { "x-candidate-token": candidateToken } : undefined,
    });
    const errCode = (data as any)?.error || (error as any)?.message || null;
    if (errCode) {
      const e: any = new Error(errCode);
      e.jobId = (data as any)?.job_id || null;
      e.fallbackAvailable = !!(data as any)?.fallback_available;
      throw e;
    }
    if (error) {
      throw new Error(`fn_${fn}_failed`);
    }
    return data as any;
  }
}

const stageToSub = (s: Stage): "resume" | "checklist" | "situations" | "overall" =>
  s === "done" ? "overall" : (s as any);
const subToStage = (s: string | undefined): Stage => {
  if (s === "overall") return "done";
  if (s === "checklist" || s === "situations" || s === "resume") return s;
  return "resume";
};

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

export default function CandidateInterview({ projectId, candidateId, onCompleted, subTab, onSubTabChange, onRefresh, activeTheme: passedTheme }: Props) {
  const { run: aiWaitRun } = useAIWait();
  const aiReady = useAIReady();
  const { activeTheme: hookTheme } = useLandingTheme();
  const activeTheme = passedTheme || hookTheme;
  const btnRadius = activeTheme?.btnBorderRadius === 999
    ? "9999px"
    : activeTheme?.btnBorderRadius != null
    ? `${activeTheme.btnBorderRadius}px`
    : "12px";
  const containerRadius = activeTheme?.containerBorderRadius != null ? `${activeTheme.containerBorderRadius}px` : "16px";
  const containerBorder = activeTheme?.containerBorderColor
    ? hexToRgba(activeTheme.containerBorderColor, activeTheme.containerBorderOpacity ?? 20)
    : "rgba(255, 255, 255, 0.20)";
  const iconColor = activeTheme?.iconColor || "#FFFFFF";
  const boldTextColor = activeTheme?.boldTextColor || "#FFFFFF";

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
    borderColor: btnBorderRgba,
    borderRadius: btnRadius,
    borderWidth: `${activeTheme?.btnBorderWidth ?? 1}px`,
    fontFamily: activeTheme?.fontFamily || undefined,
  };

  const inactiveBtnStyle: React.CSSProperties = {
    backgroundColor: "transparent",
    color: activeTheme?.btnInactiveTextColor || "#FFFFFF",
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
  const [stage, _setStage] = useState<Stage>("resume");
  const setStage = useCallback((s: Stage) => {
    _setStage(s);
    try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch {}
    try { onSubTabChange?.(stageToSub(s)); } catch { /* ignore */ }
    if (candidateId && (s === "checklist" || s === "situations" || s === "done")) {
      void (async () => {
        try {
          const targetCrm = s === "done" ? undefined : s;
          if (targetCrm) {
            await (dbClient as any).rpc("candidate_set_stage", {
              _candidate: candidateId,
              _stage: targetCrm,
            });
            window.dispatchEvent(new CustomEvent("candidate_stage_updated", { detail: { candidateId, stage: targetCrm } }));
            try {
              new BroadcastChannel("crm_stage_sync").postMessage({ type: "candidate_stage_updated", candidateId, stage: targetCrm });
            } catch {}
          }
        } catch {}
      })();
    }
  }, [onSubTabChange, candidateId]);
  // External URL → local stage
  useEffect(() => {
    if (!subTab) return;
    const target = subToStage(subTab);
    if (target !== stage) _setStage(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subTab]);
  const [passScore, setPassScore] = useState(70);
  // Vacancy paused (no employer funds)
  const [paused, setPaused] = useState<null | { email?: string|null; phone?: string|null; telegram?: string|null }>(null);
  // Лимиты RR §1: блокировка кандидата, если у работодателя нет свободных
  // лимитов на интервью по этой вакансии (и ещё не списано по этому
  // кандидату — повторное прохождение не блокируем).
  const [interviewLimitBlocked, setInterviewLimitBlocked] = useState<null | {
    name?: string|null; email?: string|null; phone?: string|null;
  }>(null);
  // Rich AI feedback restored from DB
  const [checklistFeedback, setChecklistFeedback] = useState<any>(null);

  // resume
  const [resumeText, setResumeText] = useState("");
  const [resumeCriteriaMd, setResumeCriteriaMd] = useState("");
  const [resumeCriteriaOpen, setResumeCriteriaOpen] = useState(false);
  const [candData, setCandData] = useState<any>(null);
  const [customFieldsConfig, setCustomFieldsConfig] = useState<any>(null);
  const [resumeResult, setResumeResult] = useState<{
    score: number;
    summary: string;
    strengths: string[];
    gaps: string[];
    areas_to_clarify?: string[];
    recommendations?: string[];
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadedResume, setUploadedResume] = useState<{ url: string; filename: string; fileType?: string } | null>(null);
  const [uploadError, setUploadError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  // По умолчанию открыто поле ввода. В режим «предпросмотра» переключаемся
  // ТОЛЬКО когда текст пришёл не от пользователя (распознавание файла или
  // ранее сохранённая оценка из БД). Иначе при первом нажатии клавиши
  // resumeText становится непустым и условие `resumeText && !resumeEditMode`
  // мгновенно сворачивало textarea — пользователь не мог печатать.
  const [resumeEditMode, setResumeEditMode] = useState(true);
  const [pausedOpen, setPausedOpen] = useState(false);
  const [resumeTooShortOpen, setResumeTooShortOpen] = useState(false);
  const resumeTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const restartFiredRef = useRef<string | null>(null);

  // checklist
  const [questions, setQuestions] = useState<Question[]>([]);
  const [shuffleChecklist, setShuffleChecklist] = useState(true);
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [checklistScore, setChecklistScore] = useState<number | null>(null);

  const shuffleQuestionOptions = (qId: string) => {
    setQuestions((prev) =>
      prev.map((q) =>
        q.id === qId && Array.isArray(q.options) && q.options.length > 1
          ? { ...q, options: shuffleArr(q.options) }
          : q
      )
    );
  };

  // situations
  const [situations, setSituations] = useState<Situation[]>([]);
  const [sitAnswers, setSitAnswers] = useState<Record<string, string>>({});
  const [situationsScore, setSituationsScore] = useState<number | null>(null);
  const [situationsFeedback, setSituationsFeedback] = useState<{ id: string; feedback: string; score: number }[]>([]);
  // Raw structured object (prefers `candidate_situations_feedback`; falls back
  // to legacy `situations_feedback` only as a SAFE TEXT path through the
  // adapter — employer-only fields are stripped before reaching the UI).
  const [situationsFeedbackRaw, setSituationsFeedbackRaw] = useState<any>(null);

  const [finalScore, setFinalScore] = useState<number | null>(null);
  // Optional combined-feedback (Phase 4). Shown ONLY if the employer ran the
  // overall AI evaluation; otherwise the block stays hidden. Strictly the
  // candidate-facing object — no employer-only keys.
  const [candOverallFeedback, setCandOverallFeedback] = useState<any>(null);

  useEffect(() => {
    (async () => {
      // NOTE (Pass A): /restart is NOT fired on page open. It produced a
      // visible "AI restart" overlay before the candidate even submitted a
      // resume and reset the AI context for nothing. The actual provider
      // reset (RR Pro Max fallback) happens server-side inside the AI
      // attempt — ProTalk primary uses a per-job chatId so no restart is
      // required. See ai-interview-screen-resume-v2 / RrProMaxProvider.restart.
      // Re-hydrate candidate data and recognized resume text from DB first
      const cleanId = String(candidateId).replace(/^candidate_?/i, "").replace(/^cand_?/i, "").trim();
      let candRow: any = null;
      try {
        const { data } = await (dbClient as any)
          .from("candidates")
          .select("*")
          .or(`id.eq.${candidateId},public_id.eq.${cleanId},id.eq.${cleanId}`)
          .maybeSingle();
        candRow = data;
        if (candRow) {
          setCandData(candRow);
          if (candRow.resume_url) {
            const rUrl = String(candRow.resume_url).trim();
            const fName = (candRow as any)?.resume_name || "Резюме";
            const fType = detectFileTypeFromNameOrMime(fName || rUrl);
            setUploadedResume((prev) => prev || { url: rUrl, filename: fName, fileType: fType });
          }
        }
        const txt = String((candRow as any)?.resume_text || "");
        if (txt.trim().length >= 1) {
          setResumeText(txt);
          setResumeEditMode(false);
        }
      } catch { /* ignore */ }

      const alreadyPassedScreening = Boolean(
        candRow?.interview_charged_at ||
        (candRow?.resume_score != null && Number(candRow?.resume_score) > 0) ||
        (candRow?.score != null && Number(candRow?.score) > 0) ||
        candRow?.resume_ai_feedback ||
        candRow?.checklist_score != null ||
        candRow?.situations_score != null ||
        ["screening", "checklist", "situations", "interview_success", "interview_reject", "professional", "product", "systems", "certified"].includes(candRow?.crm_stage || "") ||
        ["checklist", "situations", "interview_success", "interview_reject", "training", "certified"].includes(candRow?.stage || "") ||
        ["checklist", "situations", "interview_success", "interview_reject", "training", "certified"].includes(candRow?.current_stage || "")
      );

      // Gate 1: Check limits ONLY for new candidates who have not yet passed screening!
      // Candidates who already passed screening MUST be allowed to continue even with 0 vacancy balance.
      if (!alreadyPassedScreening) {
        try {
          const { data: gate } = await (dbClient as any).rpc("can_start_interview", { _candidate: candidateId });
          if (gate && gate.ok === false && gate.reason === "no_funds") {
            setPaused(gate.employer_contacts || {});
            return;
          }
        } catch {}

        try {
          const { data: limit } = await (dbClient as any).rpc("project_limit_status", {
            _project: projectId, _candidate: candidateId, _kind: "interview",
          });
          if (limit && limit.has_capacity === false && limit.already_charged === false) {
            setInterviewLimitBlocked(limit.employer || {});
            return;
          }
        } catch { /* мягкая ошибка — не блокируем флоу */ }
      }

      const cleanPid = String(projectId).replace(/^vac_?/i, "").trim();
      const { data: pr } = await (dbClient as any)
        .from("projects")
        .select("interview_pass_score,candidate_fields_config")
        .or(`id.eq.${projectId},public_id.eq.${cleanPid},id.eq.${cleanPid},slug.eq.${projectId}`)
        .maybeSingle();
      const effPass = Number((pr as any)?.interview_pass_score ?? 70);
      setPassScore(effPass > 0 ? effPass : 70);
      if ((pr as any)?.candidate_fields_config) {
        setCustomFieldsConfig(parseVacancyCustomFieldsConfig((pr as any).candidate_fields_config));
      }

      const r = await call("ai-list-interview-checklist", { project_id: projectId });
      const qs: Question[] = r.questions || [];
      const doShuffle = r.shuffle !== false;
      setShuffleChecklist(doShuffle);
      if (r.resume_criteria_md) {
        setResumeCriteriaMd(String(r.resume_criteria_md));
      }
      setQuestions(prepareCandidateQuestions(qs, doShuffle));
      setSituations(r.situations || []);

      // Fetch existing scores from candidate_scores or fallback to candRow
      const resolvedId = candRow?.id || candidateId;
      let sc: any = null;
      try {
        const { data } = await (dbClient as any).from("candidate_scores")
          .select("resume_score,checklist_score,situations_score,overall_score,assessment_summary,resume_feedback,checklist_feedback,situations_feedback,candidate_resume_feedback,candidate_checklist_feedback,candidate_situations_feedback,candidate_overall_feedback")
          .or(`candidate_id.eq.${resolvedId},candidate_id.eq.${candidateId},candidate_id.eq.${cleanId}`)
          .maybeSingle();
        sc = data;
      } catch {}

      const effResumeScore = sc?.resume_score ?? candRow?.resume_score ?? null;
      const candRes = (sc as any)?.candidate_resume_feedback || sc?.resume_feedback || candRow?.resume_ai_feedback || null;
      if (effResumeScore != null) {
        const crf = typeof candRes === "string" ? (() => { try { return JSON.parse(candRes); } catch { return {}; } })() : (candRes || {});
        setResumeResult({
          score: Number(effResumeScore),
          summary: String(crf.summary || sc?.assessment_summary || (candRow as any)?.notes || ""),
          strengths: Array.isArray(crf.strengths) ? crf.strengths : [],
          gaps: Array.isArray(crf.gaps) ? crf.gaps : [],
          areas_to_clarify: Array.isArray(crf.areas_to_clarify) ? crf.areas_to_clarify : [],
          recommendations: Array.isArray(crf.recommendations) ? crf.recommendations : [],
        });
      }

      const candChk = (sc as any)?.candidate_checklist_feedback || sc?.checklist_feedback || candRow?.checklist_ai_feedback || null;
      const effChkScore = sc?.checklist_score ?? candRow?.checklist_score ?? null;
      if (effChkScore != null) setChecklistScore(Number(effChkScore));
      if (candChk) setChecklistFeedback(candChk);

      const candSit = (sc as any)?.candidate_situations_feedback || sc?.situations_feedback || candRow?.situations_ai_feedback || null;
      const effSitScore = sc?.situations_score ?? candRow?.situations_score ?? null;
      if (effSitScore != null) setSituationsScore(Number(effSitScore));
      if (candSit) {
        setSituationsFeedbackRaw(candSit);
        const parsed = typeof candSit === "string" ? (() => { try { return JSON.parse(candSit); } catch { return null; } })() : candSit;
        if (parsed?.items) setSituationsFeedback(parsed.items);
      }

      const candOverall = (sc as any)?.candidate_overall_feedback || candRow?.ai_overall_summary || null;
      if (candOverall) {
        const parsed = typeof candOverall === "string" ? (() => { try { return JSON.parse(candOverall); } catch { return null; } })() : candOverall;
        if (parsed && typeof parsed === "object") setCandOverallFeedback(parsed);
      }

      const effOverall = sc?.overall_score ?? candRow?.overall_score ?? candRow?.score ?? null;
      if (effOverall != null && Number(effOverall) >= 0) {
        setFinalScore(Math.round(Number(effOverall)));
      } else {
        const vals = [effResumeScore, effChkScore, effSitScore].map(Number).filter(x => Number.isFinite(x) && x >= 0);
        if (vals.length === 3) {
          setFinalScore(Math.round(vals.reduce((a, b) => a + b, 0) / 3));
        }
      }

      // Auto-jump to next step if not explicitly set in URL subTab
      if (!subTab) {
        if (effSitScore != null) setStage("done");
        else if (effChkScore != null) setStage("situations");
        else if (effResumeScore != null) setStage("checklist");
      }
    })();
  }, [projectId, candidateId]);

  // Re-hydrate active v2 resume job after reload/refocus. Never starts a NEW
  // job — only resumes polling on whatever job_id the user already launched.
  useEffect(() => {
    const rec = getActiveJob("screen_resume", candidateId);
    if (!rec) return;
    let cancelled = false;
    const ac = new AbortController();
    (async () => {
      try {
        // Stale-guard: if the saved active job has been quiet on the server
        // for more than 3 minutes (no status change), it's almost certainly
        // dead from a previous tab/session. Drop the localStorage pointer so
        // the next click on "Отправить на оценку" starts a fresh job — the
        // old behavior silently re-attached polling to a zombie record and
        // the user never saw a new ProTalk request fire.
        try {
          const probe = await fetchJobStatus(rec.job_id);
          if (!probe) { clearActiveJob("screen_resume", candidateId); return; }
          const ageMs = Date.now() - new Date(probe.updated_at || probe.created_at).getTime();
          if (!isTerminal(probe.status) && ageMs > 3 * 60_000) {
            clearActiveJob("screen_resume", candidateId);
            return;
          }
          if (isTerminal(probe.status)) {
            if (isSuccess(probe.status)) await refetchCandidateScores();
            clearActiveJob("screen_resume", candidateId);
            return;
          }
        } catch { /* network — continue with poll, it has its own timeout */ }
        const row = await pollJobUntilTerminal({ jobId: rec.job_id, signal: ac.signal });
        if (cancelled) return;
        if (isSuccess(row.status)) {
          await refetchCandidateScores();
        }
      } catch { /* aborted or timeout */ }
      finally { if (!cancelled) clearActiveJob("screen_resume", candidateId); }
    })();
    return () => { cancelled = true; ac.abort(); };
  }, [candidateId]);

  // NOTE: /restart is NOT fired on resume stage entry to avoid blocking overlays
  // and page hang. Recognition and screening use distinct chat_id / jobs directly.

  // Reload-recovery for checklist v2 job. Resumes polling, never re-starts;
  // on terminal success refetches DB so candidate sees fresh score/feedback.
  // NOTE (D1a-FIX): reload-recovery for checklist_grade and situations_grade
  // is now owned by useCandidateAiJob (single lifecycle owner). The hook
  // mounts, reads namespaced active job from localStorage, resumes polling
  // and fires onSuccess/onFailure exactly once per jobId. No parallel
  // pollJobUntilTerminal loop is allowed for v2 grading.

  const refetchCandidateScores = async () => {
    const cleanId = String(candidateId).replace(/^candidate/i, "").trim();
    let candRow: any = null;
    try {
      const { data } = await (dbClient as any).from("candidates").select("*")
        .or(`id.eq.${candidateId},public_id.eq.${cleanId},id.eq.${cleanId}`).maybeSingle();
      if (data) {
        candRow = data;
        setCandData(data);
      }
    } catch { /* ignore */ }
    const resolvedId = candRow?.id || candidateId;
    let sc: any = null;
    try {
      const { data } = await (dbClient as any).from("candidate_scores")
        .select("resume_score,checklist_score,situations_score,overall_score,assessment_summary,resume_feedback,checklist_feedback,situations_feedback,candidate_resume_feedback,candidate_checklist_feedback,candidate_situations_feedback,candidate_overall_feedback")
        .or(`candidate_id.eq.${resolvedId},candidate_id.eq.${candidateId},candidate_id.eq.${cleanId}`).maybeSingle();
      sc = data;
    } catch { /* ignore */ }

    const effResumeScore = sc?.resume_score ?? candRow?.resume_score ?? null;
    const candRes = (sc as any)?.candidate_resume_feedback || sc?.resume_feedback || candRow?.resume_ai_feedback || null;
    if (effResumeScore != null) {
      const crf = typeof candRes === "string" ? (() => { try { return JSON.parse(candRes); } catch { return {}; } })() : (candRes || {});
      setResumeResult({
        score: Number(effResumeScore),
        summary: String(crf.summary || sc?.assessment_summary || (candRow as any)?.notes || ""),
        strengths: Array.isArray(crf.strengths) ? crf.strengths : [],
        gaps: Array.isArray(crf.gaps) ? crf.gaps : [],
        areas_to_clarify: Array.isArray(crf.areas_to_clarify) ? crf.areas_to_clarify : [],
        recommendations: Array.isArray(crf.recommendations) ? crf.recommendations : [],
      });
    }

    const candChk = (sc as any)?.candidate_checklist_feedback || sc?.checklist_feedback || candRow?.checklist_ai_feedback || null;
    const effChkScore = sc?.checklist_score ?? candRow?.checklist_score ?? null;
    if (effChkScore != null) setChecklistScore(Number(effChkScore));
    if (candChk) setChecklistFeedback(candChk);

    const candSit = (sc as any)?.candidate_situations_feedback || sc?.situations_feedback || candRow?.situations_ai_feedback || null;
    const effSitScore = sc?.situations_score ?? candRow?.situations_score ?? null;
    if (effSitScore != null) setSituationsScore(Number(effSitScore));
    if (candSit) {
      setSituationsFeedbackRaw(candSit);
      const parsed = typeof candSit === "string" ? (() => { try { return JSON.parse(candSit); } catch { return null; } })() : candSit;
      if (parsed?.items) setSituationsFeedback(parsed.items);
    }

    const candOverall = (sc as any)?.candidate_overall_feedback || candRow?.ai_overall_summary || null;
    if (candOverall) {
      const parsed = typeof candOverall === "string" ? (() => { try { return JSON.parse(candOverall); } catch { return null; } })() : candOverall;
      if (parsed && typeof parsed === "object") setCandOverallFeedback(parsed);
    }

    const effOverall = sc?.overall_score ?? candRow?.overall_score ?? candRow?.score ?? null;
    const completedScores = [effResumeScore, effChkScore, effSitScore]
      .filter((x): x is number => typeof x === "number" && !isNaN(x) && x >= 0);
    let computedFinal: number | null = null;
    if (completedScores.length > 0) {
      const rawAvg = completedScores.reduce((a, b) => a + b, 0) / completedScores.length;
      computedFinal = rawAvg % 1 === 0 ? rawAvg : Number(rawAvg.toFixed(1));
      setFinalScore(computedFinal);
    } else if (effOverall != null && Number(effOverall) >= 0) {
      computedFinal = Math.round(Number(effOverall));
      setFinalScore(computedFinal);
    }
    return {
      candRow,
      sc,
      effResumeScore,
      effChkScore,
      effSitScore,
      effOverall: computedFinal,
    };
  };

  useEffect(() => {
    if (!candidateId) return;
    const ch = dbClient
      .channel(`candidate_interview_scores_${candidateId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "candidate_scores", filter: `candidate_id=eq.${candidateId}` }, () => {
        void refetchCandidateScores();
      })
      .subscribe();
    return () => { dbClient.removeChannel(ch); };
  }, [candidateId]);

  const submitResume = async () => {
    rrLog("submit_started", { len: resumeText.length });
    if (!resumeText.trim() || resumeText.length < 50) {
      // Branded popup instead of a native alert. Keep textarea open, do not
      // switch to preview, do not call AI, do not create a job/debit.
      setResumeEditMode(true);
      setResumeTooShortOpen(true);
      rrLog("validation_failed", { reason: "too_short" });
      // Restore focus to textarea so the candidate can keep typing.
      setTimeout(() => { try { resumeTextareaRef.current?.focus(); } catch { /* ignore */ } }, 0);
      return;
    }
    rrLog("validation_passed");
    // Ensure candidate token is present or auto-bootstrapped
    let tokenPresent = false;
    try {
      tokenPresent = !!(JSON.parse(localStorage.getItem("cand_session") || "null") as any)?.token;
    } catch { /* ignore */ }
    if (!tokenPresent) {
      const autoToken = getCandidateToken(candidateId);
      tokenPresent = !!autoToken;
    }
    rrLog("token_present", { ok: tokenPresent });

    // Double-click guard: if an active job already exists for this candidate,
    // first verify it's still actually running on the server. Stale records
    // from a previous interview attempt (already terminal, cancelled, or
    // belonging to a different request) must NOT block a fresh submit.
    const existingActive = getActiveJob("screen_resume", candidateId);
    rrLog("active_job_found", { ok: !!existingActive });
    if (existingActive) {
      try {
        const row = await fetchJobStatus(existingActive.job_id, candidateId);
        if (!row) {
          // Unknown / inaccessible — treat as stale.
          clearActiveJob("screen_resume", candidateId);
        } else if (isSuccess(row.status)) {
          // Already successfully scored — just refetch and exit.
          clearActiveJob("screen_resume", candidateId);
          await refetchCandidateScores();
          return;
        } else if (isTerminal(row.status)) {
          // Terminal but not success — drop and allow a new attempt.
          clearActiveJob("screen_resume", candidateId);
        } else {
          // Possibly running, but verify it's not a zombie. If the server
          // hasn't moved the status in >3 minutes the job is dead (background
          // worker likely crashed or the previous tab was closed before
          // EdgeRuntime.waitUntil finished). Drop the pointer so this click
          // starts a fresh ProTalk request and re-charges nothing because
          // request_id + idempotency are derived per attempt.
          const ageMs = Date.now() - new Date(row.updated_at || row.created_at).getTime();
          if (ageMs > 3 * 60_000) {
            rrLog("active_job_stale_dropped", { ageMs });
            clearActiveJob("screen_resume", candidateId);
            // fall through to the fresh-start path below
          } else {
          // Truly running on the server — resume polling, do not start a new one.
          setBusy(true);
          try {
            await aiWaitRun<any>({
              title: "Анализ резюме",
              timeoutMs: 180_000,
              task: async () => {
                const r = await pollJobUntilTerminal({ jobId: existingActive.job_id });
                clearActiveJob("screen_resume", candidateId);
                if (!isSuccess(r.status)) throw new Error(describeResumeSubmitError(r.status));
                await refetchCandidateScores();
                return { ok: true };
              },
            });
          } finally { setBusy(false); }
          return;
          }
        }
      } catch {
        clearActiveJob("screen_resume", candidateId);
      }
    }
    setBusy(true);
    try {
      // Phase 3B-2A: switch resume screening to the async v2 lifecycle.
      // The HTTP request returns a job_id quickly; the wait overlay only
      // bridges the polling phase. Closing tab / reloading is safe — the
      // mount effect above re-attaches polling.
      const overlayResult = await aiWaitRun<any>({
        title: "Анализ резюме",
        timeoutMs: 180_000,
        task: async () => {
          rrLog("invoke_started");
          const start = await startResumeScreenV2({
            candidateId,
            resumeText,
            resumeUrl: uploadedResume?.url || (candData as any)?.resume_url,
          });
          rrLog("invoke_http_status", { ok: true, reused: start.reused, terminal: start.terminal, status: start.status });

          if (!start.terminal) {
            const row = await pollJobUntilTerminal({ jobId: start.job_id });
            if (!isSuccess(row.status)) {
              rrLog("invoke_error_code", { code: row.status, phase: "terminal" });
              throw new Error(describeResumeSubmitError(row.status));
            }
          }

          clearActiveJob("screen_resume", candidateId);
          await refetchCandidateScores();
          if (candidateId) {
            try {
              await (dbClient as any).rpc("candidate_set_stage", {
                _candidate: candidateId,
                _stage: "checklist",
              });
              window.dispatchEvent(new CustomEvent("candidate_stage_updated", { detail: { candidateId, stage: "checklist" } }));
              try {
                new BroadcastChannel("crm_stage_sync").postMessage({ type: "candidate_stage_updated", candidateId, stage: "checklist" });
              } catch {}
            } catch {}
          }
          return { ok: true };
        },
      });
      // User pressed «Отмена» on the wait overlay → aiWaitRun resolves with
      // `undefined`. The background task keeps running on the server but the
      // localStorage active-job pointer must be cleared so the NEXT click on
      // «Отправить на оценку» starts a brand-new request rather than silently
      // re-attaching to the cancelled job (which produced the «overlay opens
      // but ProTalk never gets called» symptom).
      if (overlayResult === undefined) {
        rrLog("overlay_cancelled_clearing_active_job");
        try { clearActiveJob("screen_resume", candidateId); } catch { /* ignore */ }
      }
    } catch (e: any) {
      if (isVacancyPausedError(e)) { setPausedOpen(true); }
      else {
        const rawCode = String(e?.message || "").slice(0, 96);
        rrLog("invoke_error_code", { code: rawCode, phase: "client" });
        // Map known pre-invoke / safe codes; fall back to userError formatter.
        const isSafeCode = /^[a-z0-9_:-]{1,64}$/i.test(rawCode);
        const friendly = isSafeCode
          ? describeResumeSubmitError(rawCode)
          : formatUserError(toUserError(e));
        // Clear any stale active-job pointer so the candidate can retry.
        try { clearActiveJob("screen_resume", candidateId); } catch { /* ignore */ }
        alert(friendly);
      }
    }
    finally { setBusy(false); }
  };

  const sendResumeToRR = async (fileOverride?: { url: string; filename: string; fileType?: string }) => {
    const targetFile = fileOverride || uploadedResume;
    if (!targetFile) return;
    const fType = targetFile.fileType || detectFileTypeFromNameOrMime(targetFile.filename || targetFile.url);
    const rawUrl = targetFile.url || "";
    const fullFileUrl = rawUrl.startsWith("http")
      ? rawUrl
      : (typeof window !== "undefined" ? `${window.location.origin}${rawUrl}` : rawUrl);
    setParsing(true);
    setUploadError("");
    try {
      const r = await aiWaitRun<any>({
        title: "Распознавание резюме",
        task: (attempt) =>
          call("ai-ingest-document", {
            entity: "resume",
            entity_id: candidateId,
            candidate_id: candidateId,
            file_url: fullFileUrl,
            filename: targetFile.filename,
            file_type: fType,
            use_promax: attempt > 0,
          }),
        fallback: {
          viewerAllowed: true,
          onSuccess: async (data) => {
            const text = String(data?.text || data?.result || data?.data?.text || data?.reply || data?.content || "")
              .replace(/^\s*```(?:markdown|md)?\s*\n?/i, "")
              .replace(/\n?```\s*$/i, "")
              .trim()
              .slice(0, 20000);
            if (text.trim()) {
              setResumeText(text);
              setResumeEditMode(false);
              const resolvedUrl = data?.resume_url || data?.file_url || fullFileUrl || "";
              if (resolvedUrl) {
                setUploadedResume({
                  url: resolvedUrl,
                  filename: targetFile.filename || "Резюме",
                  fileType: fType,
                });
              }
              try {
                const { data: candRow } = await (dbClient as any)
                  .from("candidates")
                  .select("*")
                  .eq("id", candidateId)
                  .maybeSingle();
                if (candRow) setCandData(candRow);
              } catch { /* ignore */ }
              await refetchCandidateScores();
            }
          },
        },
      });
      if (!r) return;
      const text = String(r?.text || r?.result || r?.data?.text || r?.reply || r?.content || "")
        .replace(/^\s*```(?:markdown|md)?\s*\n?/i, "")
        .replace(/\n?```\s*$/i, "")
        .trim()
        .slice(0, 20000);
      if (!text.trim()) throw new Error("ИИ не смог распознать резюме");
      setResumeText(text);
      setResumeEditMode(false);
      const resolvedUrl = r?.resume_url || r?.file_url || fullFileUrl || "";
      if (resolvedUrl) {
        setUploadedResume({
          url: resolvedUrl,
          filename: targetFile.filename || "Резюме",
          fileType: fType,
        });
      }
      try {
        const { data: candRow } = await (dbClient as any)
          .from("candidates")
          .select("*")
          .eq("id", candidateId)
          .maybeSingle();
        if (candRow) setCandData(candRow);
      } catch { /* ignore */ }
      await refetchCandidateScores();
    } catch (e: any) {
      setUploadError(e?.message || "Файл резюме недоступен — загрузите файл заново или проверьте ссылку.");
    } finally {
      setParsing(false);
    }
  };

  const onUploadResume = async (f: File, detectedFileType?: string) => {
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) { alert("Файл больше 10 МБ"); return; }
    setUploading(true);
    setUploadError("");
    try {
      const rawUrl = await getUploadService().uploadFromFile(f);
      const fullUrl = rawUrl.startsWith("http")
        ? rawUrl
        : (typeof window !== "undefined" ? `${window.location.origin}${rawUrl}` : rawUrl);
      const fileType = detectedFileType || detectFileTypeFromNameOrMime(f.name, f.type);
      const uploaded = { url: fullUrl, filename: f.name, fileType };
      setUploadedResume(uploaded);
      setUploading(false);
      await sendResumeToRR(uploaded);
    } catch (e: any) {
      setUploadError(formatUserError(toUserError(e, { kind: "bad_file", message: "Не удалось загрузить резюме. Проверьте формат и размер файла." })));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const onResumeLink = async (linkInfo: { url: string; filename: string; fileType: string }) => {
    setUploadError("");
    const uploaded = { url: linkInfo.url, filename: linkInfo.filename, fileType: linkInfo.fileType };
    setUploadedResume(uploaded);
    await sendResumeToRR(uploaded);
  };

  /**
   * Checklist v2 (Phase 3B-2B Step D1a-FIX): single-owner async lifecycle.
   * useCandidateAiJob owns request_id creation, polling, focus/visibility
   * wake-up, reload-recovery, terminal cleanup, and onSuccess/onFailure
   * dispatch. submitChecklist only:
   *   - calls hook.start() (in-memory lock guards double-click)
   *   - awaits a Promise that the hook resolves via onSuccess/onFailure
   *   - never reads/writes localStorage, never calls pollJobUntilTerminal,
   *     never generates a request_id.
   */
  const checklistPendingRef = useRef<((ok: boolean) => void) | null>(null);
  const situationsPendingRef = useRef<((ok: boolean) => void) | null>(null);

  const refetchChecklistFromDb = async () => {
    return await refetchCandidateScores();
  };

  const refetchSituationsFromDb = async (): Promise<{ overall: number } | null> => {
    const res = await refetchCandidateScores();
    const overall = res?.effOverall ?? (res?.effSitScore != null ? Number(res.effSitScore) : 0);
    return { overall };
  };

  const checklistJob = useCandidateAiJob({
    kind: "checklist_grade",
    candidateId,
    onSuccess: async () => {
      try { await refetchChecklistFromDb(); } catch { /* swallow — UI keeps stale state */ }
      try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch {}
      if (candidateId) {
        try {
          await (dbClient as any).rpc("candidate_set_stage", {
            _candidate: candidateId,
            _stage: "situations",
          });
          window.dispatchEvent(new CustomEvent("candidate_stage_updated", { detail: { candidateId, stage: "situations" } }));
          try {
            new BroadcastChannel("crm_stage_sync").postMessage({ type: "candidate_stage_updated", candidateId, stage: "situations" });
          } catch {}
        } catch {}
      }
      checklistPendingRef.current?.(true);
      checklistPendingRef.current = null;
    },
    onFailure: ({ message }) => {
      try { alert(message); } catch { /* ignore */ }
      checklistPendingRef.current?.(false);
      checklistPendingRef.current = null;
    },
  });

  const situationsJob = useCandidateAiJob({
    kind: "situations_grade",
    candidateId,
    onSuccess: async (jobId) => {
      let info: { overall: number } | null = null;
      try { info = await refetchSituationsFromDb(); } catch { /* swallow */ }
      const overall = info?.overall ?? 0;
      // Server-authoritative advance. The frontend sends ONLY { job_id }; the
      // server checks job ownership/type/status/project, the score and the
      // allowed source stage, then decides whether to move the candidate.
      let passed = false;
      try {
        let candidateToken: string | null = null;
        try {
          const raw = localStorage.getItem("cand_session");
          if (raw) candidateToken = (JSON.parse(raw) as any)?.token || null;
        } catch { /* ignore */ }
        const { data } = await dbClient.functions.invoke<any>("candidate-stage-advance-v2", {
          body: { job_id: jobId, candidate_token: candidateToken },
          headers: candidateToken ? { "x-candidate-token": candidateToken } : undefined,
        });
        // Treat advanced or already-in-next-stage as "passed". below_threshold
        // / stage_conflict / job_not_succeeded are NOT technical failures —
        // they leave the local stage untouched and the candidate sees the
        // actual interview score. A real failure (no response, network err)
        // is also treated as not-passed; the candidate can retry safely.
        passed = Boolean(data && (data.advanced === true || (data.already === true && overall >= passScore)));
      } catch { /* non-fatal — UX shows the interview result */ }
      const finalStage = passed ? "interview_success" : "interview_reject";
      if (candidateId) {
        try {
          await (dbClient as any).rpc("candidate_set_stage", {
            _candidate: candidateId,
            _stage: finalStage,
          });
          window.dispatchEvent(new CustomEvent("candidate_stage_updated", { detail: { candidateId, stage: finalStage } }));
          try {
            new BroadcastChannel("crm_stage_sync").postMessage({ type: "candidate_stage_updated", candidateId, stage: finalStage });
          } catch {}
        } catch {}
      }
      try { await refetchCandidateScores(); } catch { /* ignore */ }
      setStage("done");
      try { void onRefresh?.(); } catch { /* ignore */ }
      situationsPendingRef.current?.(true);
      situationsPendingRef.current = null;
    },
    onFailure: ({ message }) => {
      try { alert(message); } catch { /* ignore */ }
      situationsPendingRef.current?.(false);
      situationsPendingRef.current = null;
    },
  });

  const submitChecklist = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await aiWaitRun<any>({
        title: "AI анализирует ответы анкеты. Можно продолжить работу — результат сохранится автоматически",
        timeoutMs: 180_000,
        task: () => new Promise<boolean>((resolve) => {
          checklistPendingRef.current = resolve;
          void checklistJob.start({ kind: "checklist_grade", answers });
        }),
      });
      await refetchCandidateScores();
    } finally { setBusy(false); }
  };

  /**
   * Situations v2 (D1a-FIX): single-owner async lifecycle. Lifecycle, stage
   * advance and onCompleted are all routed through useCandidateAiJob's
   * onSuccess callback. submitSituations only kicks off the hook and waits
   * for terminal — it never reads localStorage, never polls, never decides
   * pass/fail itself.
   */
  const submitSituations = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await aiWaitRun<any>({
        title: "AI анализирует решения ситуаций. Можно продолжить работу — результат сохранится автоматически",
        task: () => new Promise<boolean>((resolve) => {
          situationsPendingRef.current = resolve;
          void situationsJob.start({ kind: "situations_grade", answers: sitAnswers });
        }),
      });
    } finally { setBusy(false); }
  };

  const reset = () => {
    restartFiredRef.current = null; // ensure /restart fires again on retake
    try {
      clearActiveJob("screen_resume", candidateId);
      clearActiveJob("checklist_grade", candidateId);
      clearActiveJob("situations_grade", candidateId);
    } catch { /* ignore */ }
    setStage("resume"); setResumeResult(null); setResumeText(""); setResumeEditMode(true); setAnswers({}); setChecklistScore(null);
    setSitAnswers({}); setSituationsScore(null); setSituationsFeedback([]); setFinalScore(null);
  };

  const stageBadge = (s: Stage, label: string, score: number | null) => (
    <button
      type="button"
      onClick={() => setStage(s)}
      disabled={stageLocked(s)}
      className={`px-4 py-2 text-sm font-bold flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer border ${
        stage === s
          ? "landing-btn-active shadow-md"
          : "landing-btn-inactive hover:bg-white/10"
      }`}
      style={stage === s ? activeBtnStyle : inactiveBtnStyle}
    >
      <span>{label}</span>
      {score != null && (
        <span
          className="text-sm px-2 py-0.5 rounded font-bold border border-white/20"
          style={{
            backgroundColor: "rgba(255,255,255,0.1)",
            color: stage === s ? (activeTheme?.btnActiveTextColor || "#FFFFFF") : "#FFFFFF",
          }}
        >
          {score}
        </span>
      )}
    </button>
  );

  const stageLocked = (s: Stage) => {
    if (s === "resume") return false;
    // Checklist requires resume evaluation completed with valid result or score
    const hasResumeScore = resumeResult != null ||
      (candData?.resume_score != null && Number(candData.resume_score) > 0) ||
      Boolean(candData?.resume_ai_feedback);
    if (s === "checklist") {
      return !hasResumeScore;
    }
    // Situations requires checklist completed
    const hasChecklistScore = checklistScore != null ||
      (candData?.checklist_score != null && Number(candData.checklist_score) > 0) ||
      Boolean(candData?.checklist_ai_feedback);
    if (s === "situations") {
      return !hasResumeScore || !hasChecklistScore;
    }
    // Done requires situations completed
    const hasSitScore = situationsScore != null ||
      (candData?.situations_score != null && Number(candData.situations_score) > 0) ||
      Boolean(candData?.situations_ai_feedback);
    if (s === "done") {
      return !hasResumeScore || !hasChecklistScore || !hasSitScore;
    }
    return false;
  };

  const hasPassedScreening = Boolean(
    candData?.interview_charged_at ||
    (candData?.resume_score != null && Number(candData?.resume_score) > 0) ||
    (candData?.score != null && Number(candData?.score) > 0) ||
    candData?.resume_ai_feedback ||
    (resumeResult?.score != null && Number(resumeResult.score) > 0) ||
    resumeResult != null ||
    stage !== "resume" ||
    checklistScore != null ||
    situationsScore != null
  );

  if (paused && !hasPassedScreening) {
    const tg = (paused.telegram || "").trim().replace(/^@/, "");
    return (
      <div
        className="section-card liquid-glass-card bg-transparent border backdrop-blur-2xl p-6 md:p-8 text-center space-y-4 shadow-2xl max-w-2xl mx-auto"
        style={{ borderColor: containerBorder, borderRadius: containerRadius }}
      >
        <div
          className="w-16 h-16 mx-auto rounded-2xl bg-transparent border flex items-center justify-center text-3xl shadow-lg"
          style={{ borderColor: activeTheme?.btnBorderColor || "rgba(255,255,255,0.2)" }}
        >
          ⏸
        </div>
        <h2 className="text-xl md:text-2xl font-bold" style={headingStyle}>
          Вакансия временно на паузе
        </h2>
        <p className="text-sm text-white/85 max-w-md mx-auto leading-relaxed">
          У работодателя сейчас закончились средства для проведения ИИ-собеседования. Свяжитесь с ним напрямую — отбор продолжается через личное общение.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 text-left pt-2">
          {paused.email ? (
            <div
              className="section-card liquid-glass-card bg-transparent border p-4 backdrop-blur-xl"
              style={{ borderColor: containerBorder, borderRadius: btnRadius }}
            >
              <div className="text-sm font-bold" style={{ color: boldTextColor }}>Email</div>
              <a className="text-white hover:underline text-sm break-all font-bold block mt-1 transition" href={`mailto:${paused.email}`}>
                {paused.email}
              </a>
            </div>
          ) : null}
          {paused.phone ? (
            <div
              className="section-card liquid-glass-card bg-transparent border p-4 backdrop-blur-xl"
              style={{ borderColor: containerBorder, borderRadius: btnRadius }}
            >
              <div className="text-sm font-bold" style={{ color: boldTextColor }}>Телефон</div>
              <a className="text-white hover:underline text-sm font-bold block mt-1 transition" href={`tel:${paused.phone.replace(/[^\d+]/g, "")}`}>
                {paused.phone}
              </a>
            </div>
          ) : null}
          {tg ? (
            <div
              className="section-card liquid-glass-card bg-transparent border p-4 backdrop-blur-xl"
              style={{ borderColor: containerBorder, borderRadius: btnRadius }}
            >
              <div className="text-sm font-bold" style={{ color: boldTextColor }}>Telegram</div>
              <a className="text-white hover:underline text-sm font-bold block mt-1 transition" href={tg.startsWith("http") ? tg : `https://t.me/${tg}`} target="_blank" rel="noopener noreferrer">
                @{tg}
              </a>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  if (interviewLimitBlocked && !hasPassedScreening) {
    return <LimitExhaustedOverlay kind="interview" employer={interviewLimitBlocked} />;
  }

  return (
    <div className="space-y-5">
      <div
        className="section-card liquid-glass-card bg-transparent backdrop-blur-2xl border p-6 shadow-xl space-y-4"
        style={{
          borderColor: containerBorder,
          borderRadius: containerRadius,
        }}
      >
        <div className="flex items-center gap-3 mb-3">
          <div
            className="w-10 h-10 rounded-xl bg-transparent border flex items-center justify-center backdrop-blur-xl"
            style={{ borderColor: activeTheme?.btnBorderColor || "rgba(255,255,255,0.2)" }}
          >
            <MessageSquare className="w-5 h-5" style={{ color: iconColor }} />
          </div>
          <div className="flex-1">
            <h2 className="text-base font-bold text-white">ИИ-Интервью</h2>
            <p className="text-sm text-slate-300">Пройдите 3 этапа. Проходной средний балл: <b style={{ color: boldTextColor }}>{passScore}</b>. При неуспехе можно пересдать.</p>
          </div>
        </div>
        {(() => {
          const vals = [
            resumeResult?.score ?? (candData?.resume_score != null ? Number(candData.resume_score) : null),
            checklistScore ?? (candData?.checklist_score != null ? Number(candData.checklist_score) : null),
            situationsScore ?? (candData?.situations_score != null ? Number(candData.situations_score) : null),
          ].filter((x): x is number => typeof x === "number" && !isNaN(x) && x >= 0);
          const displayFinalScore = vals.length > 0
            ? (vals.reduce((a, b) => a + b, 0) / vals.length % 1 === 0
                ? vals.reduce((a, b) => a + b, 0) / vals.length
                : Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1)))
            : (finalScore != null ? finalScore : null);

          return (
            <div className="flex flex-wrap gap-2">
              {stageBadge("resume", "1. Резюме", resumeResult?.score ?? null)}
              {stageBadge("checklist", "2. Чек-лист", checklistScore)}
              {stageBadge("situations", "3. Ситуации", situationsScore)}
              {stageBadge("done", "4. Итог", displayFinalScore)}
            </div>
          );
        })()}
      </div>

      {stage === "resume" && (
        <div
          className="section-card liquid-glass-card bg-transparent backdrop-blur-2xl border p-6 space-y-4 shadow-xl"
          style={{
            borderColor: containerBorder,
            borderRadius: containerRadius,
          }}
        >
          <h3 className="font-bold text-base" style={headingStyle}>Этап 1: Скрининг резюме</h3>

          {/* Collapsible Resume Criteria Dropdown */}
          <div className="rounded-2xl border border-[#E7C768]/45 bg-transparent backdrop-blur-xl overflow-hidden">
            <button
              type="button"
              onClick={() => setResumeCriteriaOpen((v) => !v)}
              className="w-full px-4 py-3 flex items-center justify-between gap-3 text-left cursor-pointer hover:border-[#E7C768] transition"
            >
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="w-4 h-4 text-[#E7C768] shrink-0" />
                <span className="text-sm font-bold" style={headingStyle}>
                  Критерии оценки резюме по вакансии
                </span>
              </div>
              <span className="inline-flex items-center gap-1 text-sm font-semibold text-[#E7C768] shrink-0">
                {resumeCriteriaOpen ? "Скрыть критерии" : "Показать критерии"}
                {resumeCriteriaOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </span>
            </button>
            {resumeCriteriaOpen && (
              <div className="px-4 pb-4 pt-2 border-t border-white/15 text-sm text-white/95 leading-relaxed">
                <RichMarkdown
                  tone="resume"
                  text={
                    resumeCriteriaMd.trim() ||
                    "## Критерии оценки резюме\n- Профильный опыт работы по вакансии\n- Соответствие ключевым обязанностям и навыкам"
                  }
                />
              </div>
            )}
          </div>

          {resumeResult ? (
            <div className="space-y-3">
              <div className="text-3xl font-extrabold" style={headingStyle}>{resumeResult.score}/100</div>
              <div className="text-sm text-white"><RichMarkdown tone="resume">{resumeResult.summary || ""}</RichMarkdown></div>
              {resumeResult.strengths?.length > 0 && (<div><div className="text-sm text-white/90 font-bold">Сильные стороны</div><ul className="text-sm text-slate-200 list-disc pl-5">{resumeResult.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul></div>)}
              {(resumeResult.areas_to_clarify?.length ?? 0) > 0 && (
                <div><div className="text-sm text-amber-300 font-bold">Что стоит уточнить</div>
                  <ul className="text-sm text-slate-200 list-disc pl-5">
                    {resumeResult.areas_to_clarify!.map((s, i) => <li key={i}>{s}</li>)}
                  </ul></div>
              )}
              {(resumeResult.recommendations?.length ?? 0) > 0 && (
                <div><div className="text-sm text-slate-200 font-bold">Рекомендации</div>
                  <ul className="text-sm text-slate-200 list-disc pl-5">
                    {resumeResult.recommendations!.map((s, i) => <li key={i}>{s}</li>)}
                  </ul></div>
              )}
              {resumeResult.gaps?.length > 0 && (
                <div><div className="text-sm text-amber-300 font-bold">Что улучшить</div>
                  <ul className="text-sm text-slate-200 list-disc pl-5">
                    {resumeResult.gaps.map((s, i) => <li key={i}>{s}</li>)}
                  </ul></div>
              )}

              <div className="pt-2">
                <CandidateFieldsEditorBlock
                  candidateId={candidateId}
                  candidate={candData}
                  customFieldsConfig={customFieldsConfig}
                  persistToDb={true}
                  editable={true}
                  compact={true}
                  activeTheme={activeTheme}
                  title="Анкета кандидата (26 стандартных и дополнительные поля)"
                  subtitle="Данные автоматически распознаны из резюме. Вы можете дополнить или отредактировать любое поле."
                  onSaved={() => { void refetchCandidateScores(); }}
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setStage("checklist")}
                  className="landing-btn-active font-bold text-sm px-5 py-2.5 flex items-center gap-2 border cursor-pointer shadow-md transition"
                  style={activeBtnStyle}
                >
                  Перейти к чек-листу →
                </button>
                <button
                  type="button"
                  onClick={() => { restartFiredRef.current = null; try { clearActiveJob("screen_resume", candidateId); } catch { /* ignore */ } setResumeResult(null); }}
                  className="landing-btn-inactive text-sm px-4 py-2 flex items-center gap-1 border hover:bg-white/10"
                  style={inactiveBtnStyle}
                >
                  <RefreshCw className="w-3.5 h-3.5"/>Пересдать
                </button>
              </div>
            </div>
          ) : (
            <>
              <ResumeDropzone
                uploading={uploading}
                parsing={parsing}
                uploaded={uploadedResume ? { filename: uploadedResume.filename, url: uploadedResume.url, fileType: uploadedResume.fileType } : null}
                hasRecognizedText={Boolean(resumeText.trim())}
                error={uploadError}
                busy={busy}
                onFile={onUploadResume}
                onUrl={onResumeLink}
                onClear={() => setUploadedResume(null)}
                onSend={aiReady ? () => sendResumeToRR() : undefined}
                sendLabel={aiReady ? "Распознать резюме" : "Готовим ИИ…"}
                sendDisabled={!aiReady}
                fileMissing={/Файл резюме недоступен/i.test(uploadError) || /file[_ ](deleted|missing)|no_resume/i.test(uploadError)}
                activeTheme={activeTheme}
              />
              {resumeText && !resumeEditMode ? (
                <div className="relative w-full bg-transparent border border-white/20 rounded-xl px-4 py-3 backdrop-blur-xl">
                  <button
                    type="button"
                    onClick={() => setResumeEditMode(true)}
                    className="absolute top-2 right-2 text-sm font-bold bg-white/10 hover:bg-white/20 px-2.5 py-1 rounded-md"
                    style={{ color: boldTextColor }}
                  >
                    Редактировать
                  </button>
                  <RichMarkdown tone="resume">{resumeText}</RichMarkdown>
                </div>
              ) : (
                <>
                  <textarea
                    ref={resumeTextareaRef}
                    value={resumeText}
                    onChange={e => setResumeText(e.target.value)}
                    rows={12}
                    maxLength={20000}
                    placeholder="Вставьте текст вашего резюме или загрузите файл — ИИ распознает и заполнит это поле автоматически. Поддерживается Markdown."
                    className="w-full bg-transparent text-white border border-white/20 rounded-xl px-3 py-2 text-sm font-mono backdrop-blur-xl"
                  />
                  <div className="flex items-center justify-between text-sm font-mono">
                    <span className={resumeText.length < 50 ? "text-amber-300" : "text-white/80"}>
                      {resumeText.length} / 50 символов
                      {resumeText.length < 50 && " — нужно больше деталей для AI-оценки"}
                    </span>
                  </div>
                  {resumeText && (
                    <button
                      type="button"
                      onClick={() => setResumeEditMode(false)}
                      className="text-sm font-bold bg-white/10 hover:bg-white/20 px-2.5 py-1 rounded-md self-start"
                      style={{ color: boldTextColor }}
                    >
                      Предпросмотр
                    </button>
                  )}
                </>
              )}
              {busy && <LoadingPhrase entity="interview" />}
              <button
                type="button"
                disabled={busy || resumeText.trim().length < 50}
                onClick={submitResume}
                className="landing-btn-active font-bold text-sm px-5 py-2.5 flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed border cursor-pointer shadow-md transition"
                style={activeBtnStyle}
                title={resumeText.trim().length < 50 ? "Минимум 50 символов" : undefined}
              >
                {busy ? <Loader className="w-4 h-4 animate-spin"/> : <FileText className="w-4 h-4"/>} Отправить на оценку
              </button>
              {resumeTooShortOpen && (
                <div
                  role="dialog"
                  aria-modal="true"
                  className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-transparent"
                  onClick={() => setResumeTooShortOpen(false)}
                >
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="section-card liquid-glass-card w-full max-w-sm bg-transparent border shadow-2xl p-6 text-center backdrop-blur-2xl"
                    style={{
                      borderColor: containerBorder,
                      borderRadius: containerRadius,
                    }}
                  >
                    <div className="text-4xl mb-2">🤖</div>
                    <h4 className="text-lg font-bold text-white mb-2">Резюме пока слишком короткое</h4>
                    <p className="text-sm text-slate-200 leading-relaxed">
                      Добавьте больше информации об опыте, навыках и результатах.
                      Для отправки на AI-оценку нужно минимум 50 символов.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setResumeTooShortOpen(false);
                        setTimeout(() => { try { resumeTextareaRef.current?.focus(); } catch { /* ignore */ } }, 0);
                      }}
                      className="mt-5 inline-flex items-center justify-center px-5 py-2.5 rounded-xl landing-btn-active font-bold text-sm shadow cursor-pointer border"
                      style={{
                        backgroundColor: activeTheme?.btnActiveBgColor || undefined,
                        color: activeTheme?.btnActiveTextColor || undefined,
                        borderColor: activeTheme?.btnBorderColor || undefined,
                        borderRadius: btnRadius,
                      }}
                    >
                      Продолжить редактирование
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {stage === "checklist" && (
        <div
          className="section-card liquid-glass-card bg-transparent backdrop-blur-2xl border p-6 space-y-4 shadow-xl"
          style={{
            borderColor: containerBorder,
            borderRadius: containerRadius,
          }}
        >
          <h3 className="font-bold text-base" style={headingStyle}>Этап 2: Чек-лист ({questions.length} вопросов)</h3>
          {stageLocked("checklist") ? (
            <div className="text-sm text-amber-200 bg-transparent border border-amber-500/30 rounded-xl p-4 backdrop-blur-xl">
              ⛔ Сначала пройдите этап «Резюме» — без оценки резюме чек-лист недоступен.
              <button type="button" onClick={() => setStage("resume")} className="ml-2 underline" style={{ color: boldTextColor }}>Перейти к резюме</button>
            </div>
          ) : checklistScore != null ? (
            <div className="space-y-3">
              <CandidateChecklistReport
                view={adaptCandidateChecklist(checklistFeedback)}
                score={checklistScore}
              />
              <div className="flex flex-wrap items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setStage("situations")}
                  className="landing-btn-active font-bold text-sm px-5 py-2.5 flex items-center gap-2 border cursor-pointer shadow-md transition"
                  style={activeBtnStyle}
                >
                  Перейти к ситуациям →
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setChecklistScore(null);
                    setChecklistFeedback(null);
                    setAnswers({});
                    setQuestions((qs) => prepareCandidateQuestions(qs, shuffleChecklist));
                  }}
                  className="landing-btn-inactive text-sm px-4 py-2 flex items-center gap-1 border hover:bg-white/10"
                  style={inactiveBtnStyle}
                >
                  <RefreshCw className="w-3.5 h-3.5"/>Пересдать
                </button>
              </div>
            </div>
          ) : questions.length === 0 ? (
            <p className="text-sm text-amber-300">Чек-лист ещё не настроен работодателем.</p>
          ) : (
            <>
              {questions.map((q, i) => {
                const qKind = normalizeQKind(q.kind);
                const rawAns = answers[q.id];
                const selectedMulti: string[] = Array.isArray(rawAns)
                  ? rawAns
                  : typeof rawAns === "string" && rawAns.includes("||")
                  ? rawAns.split("||").map((s) => s.trim()).filter(Boolean)
                  : [];
                return (
                  <div key={q.id} className="bg-transparent border border-white/20 rounded-2xl p-4 space-y-3 backdrop-blur-xl">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm text-white font-semibold">
                        <span className="text-[#E7C768] mr-1.5">#{i + 1}.</span>
                        {q.question}
                      </div>
                      <span className="px-2.5 py-0.5 rounded-xl border border-[#E7C768]/45 text-sm font-semibold text-[#E7C768]">
                        {qKind === "choice"
                          ? "Список"
                          : qKind === "multichoice"
                          ? "Мультивыбор"
                          : qKind === "paragraph"
                          ? "Абзац"
                          : "Текст"}
                      </span>
                    </div>

                    {qKind === "choice" && Array.isArray(q.options) ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {q.options.map((opt, oi) => {
                          const selected = rawAns === opt;
                          return (
                            <button
                              key={`${opt}-${oi}`}
                              type="button"
                              onClick={() => {
                                setAnswers((prev) => ({ ...prev, [q.id]: opt }));
                              }}
                              className={`px-4 py-2.5 rounded-xl text-sm font-semibold border text-left flex items-center gap-2.5 transition cursor-pointer ${
                                selected
                                  ? "landing-btn-active font-bold"
                                  : "landing-btn-inactive hover:border-[#E7C768]"
                              }`}
                              style={selected ? activeBtnStyle : inactiveBtnStyle}
                            >
                              <span
                                className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                                  selected ? "border-current bg-current" : "border-[#E7C768]"
                                }`}
                              />
                              <span className="break-words">{opt}</span>
                            </button>
                          );
                        })}
                      </div>
                    ) : qKind === "multichoice" && Array.isArray(q.options) ? (
                      <div className="space-y-2">
                        <div className="text-sm text-white/80">Выберите все подходящие варианты ответа:</div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {q.options.map((opt, oi) => {
                            const checked = selectedMulti.includes(opt);
                            return (
                              <button
                                key={`${opt}-${oi}`}
                                type="button"
                                onClick={() => {
                                  const next = checked
                                    ? selectedMulti.filter((x) => x !== opt)
                                    : [...selectedMulti, opt];
                                  setAnswers((prev) => ({ ...prev, [q.id]: next }));
                                }}
                                className={`px-4 py-2.5 rounded-xl text-sm font-semibold border text-left flex items-center gap-2.5 transition cursor-pointer ${
                                  checked
                                    ? "landing-btn-active font-bold"
                                    : "landing-btn-inactive hover:border-[#E7C768]"
                                }`}
                                style={checked ? activeBtnStyle : inactiveBtnStyle}
                              >
                                <span className="shrink-0">{checked ? "☑" : "☐"}</span>
                                <span className="break-words">{opt}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ) : qKind === "paragraph" ? (
                      <MiniAudioField
                        label=""
                        value={typeof rawAns === "string" ? rawAns : ""}
                        onChange={(val) => setAnswers((prev) => ({ ...prev, [q.id]: val }))}
                        placeholder={`Напишите развернутый ответ несколькими предложениями или надиктуйте голосом (#${i + 1})...`}
                        minRows={3}
                      />
                    ) : (
                      <MiniAudioField
                        label=""
                        value={typeof rawAns === "string" ? rawAns : ""}
                        onChange={(val) => setAnswers((prev) => ({ ...prev, [q.id]: val }))}
                        placeholder={`Напишите краткий ответ строкой или надиктуйте голосом (#${i + 1})...`}
                        minRows={1}
                      />
                    )}
                  </div>
                );
              })}
              {busy && <LoadingPhrase entity="interview" />}
              <button
                type="button"
                disabled={busy}
                onClick={submitChecklist}
                className="landing-btn-active font-bold text-sm px-5 py-2.5 flex items-center gap-2 disabled:opacity-60 border cursor-pointer shadow-md transition"
                style={activeBtnStyle}
              >
                {busy ? <Loader className="w-4 h-4 animate-spin"/> : <Send className="w-4 h-4"/>} Отправить ответы
              </button>
            </>
          )}
        </div>
      )}

      {stage === "situations" && (
        <div
          className="section-card liquid-glass-card bg-transparent backdrop-blur-2xl border p-6 space-y-4 shadow-xl"
          style={cardStyle}
        >
          <h3 className="font-bold text-base" style={headingStyle}>Этап 3: Ролевые ситуации</h3>
          {stageLocked("situations") ? (
            <div className="text-sm text-amber-200 bg-transparent border border-amber-500/30 rounded-xl p-4 backdrop-blur-xl">
              ⛔ Сначала пройдите этап «Чек-лист» — без него ролевые ситуации недоступны.
              <button type="button" onClick={() => setStage("checklist")} className="ml-2 underline" style={{ color: boldTextColor }}>Перейти к чек-листу</button>
            </div>
          ) : situationsScore != null ? (
            <div className="space-y-3">
              <CandidateSituationsReport
                view={adaptCandidateSituations(situationsFeedbackRaw)}
                score={situationsScore}
              />
              <div className="flex flex-wrap gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setStage("done")}
                  className="landing-btn-active font-bold text-sm px-5 py-2 flex items-center gap-1 border cursor-pointer shadow-md transition"
                  style={activeBtnStyle}
                >
                  <Award className="w-4 h-4"/> Показать итоговую оценку →
                </button>
                <button
                  type="button"
                  onClick={() => { setSituationsScore(null); setSitAnswers({}); setSituationsFeedback([]); setSituationsFeedbackRaw(null); setFinalScore(null); }}
                  className="landing-btn-inactive text-sm px-4 py-2 flex items-center gap-1 border hover:bg-white/10"
                  style={inactiveBtnStyle}
                >
                  <RefreshCw className="w-3.5 h-3.5"/>Пересдать
                </button>
              </div>
            </div>
          ) : situations.length === 0 ? (
            <p className="text-sm text-amber-300">Ситуации ещё не настроены работодателем.</p>
          ) : (
            <>
              {situations.map((s, i) => (
                <div key={s.id} className="bg-transparent border border-white/15 rounded-2xl p-4 space-y-3 backdrop-blur-xl">
                  <div className="text-sm font-bold" style={{ color: boldTextColor }}>Ситуация #{i+1}: {s.title}</div>
                  <div className="text-sm text-slate-200"><RichMarkdown tone="chat">{s.brief}</RichMarkdown></div>
                  <AudioField
                    value={sitAnswers[s.id] || ""}
                    onChange={val => setSitAnswers({ ...sitAnswers, [s.id]: val })}
                    placeholder={`Напишите или надиктуйте голосом ваш ответ для ситуации «${s.title}»...`}
                  />
                </div>
              ))}
              {busy && <LoadingPhrase entity="interview" />}
              <button
                type="button"
                disabled={busy}
                onClick={submitSituations}
                className="landing-btn-active font-bold text-sm px-5 py-2.5 flex items-center gap-2 disabled:opacity-60 border cursor-pointer shadow-md transition"
                style={activeBtnStyle}
              >
                {busy ? <Loader className="w-4 h-4 animate-spin"/> : <Award className="w-4 h-4"/>} Завершить интервью
              </button>
            </>
          )}
        </div>
      )}

      {stage === "done" && (() => {
        const vals: number[] = [
          resumeResult?.score ?? (candData?.resume_score != null ? Number(candData.resume_score) : null),
          checklistScore ?? (candData?.checklist_score != null ? Number(candData.checklist_score) : null),
          situationsScore ?? (candData?.situations_score != null ? Number(candData.situations_score) : null),
        ].filter((x): x is number => typeof x === "number" && !isNaN(x) && x >= 0);
        const avg = vals.length
          ? (Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100).toFixed(2)
          : (finalScore != null ? String(finalScore) : "—");
        const passed = (vals.length === 3 || finalScore != null) && Number(avg) >= passScore;
        const stageSummary = (label: string, score: number | null | undefined, summary: string | undefined) => {
          const isCompleted = typeof score === "number";
          const effectiveSummary = summary || (isCompleted ? `Этап «${label}» успешно завершён с результатом ${score}/100.` : "");
          return (
            <div className="bg-transparent border border-white/15 rounded-2xl p-4 backdrop-blur-xl">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[14px] font-bold" style={{ color: boldTextColor }}>{label}</span>
                <span className="text-base font-bold" style={{ color: boldTextColor }}>
                  {isCompleted ? `${score}/100` : "—"}
                </span>
              </div>
              {isCompleted || effectiveSummary ? (
                <div className="text-[14px] text-slate-100 leading-relaxed">
                  <RichMarkdown tone="resume">{effectiveSummary}</RichMarkdown>
                </div>
              ) : (
                <div className="text-[14px] text-slate-400 italic">Этап ещё не пройден.</div>
              )}
            </div>
          );
        };
        let chkSummary = "";
        if (typeof checklistFeedback === "string" && checklistFeedback.trim()) {
          try {
            const parsed = JSON.parse(checklistFeedback);
            chkSummary = parsed?.summary || parsed?.candidate?.summary || parsed?.text || checklistFeedback;
          } catch {
            chkSummary = checklistFeedback;
          }
        } else if (checklistFeedback && typeof checklistFeedback === "object") {
          chkSummary = (checklistFeedback as any)?.summary || (checklistFeedback as any)?.candidate?.summary || (checklistFeedback as any)?.text || "";
        }
        if (!chkSummary && checklistScore != null) {
          chkSummary = `Чек-лист успешно пройден: оценка ${checklistScore}/100.`;
        }

        let sitSummary = "";
        if (typeof situationsFeedbackRaw === "string" && situationsFeedbackRaw.trim()) {
          try {
            const parsed = JSON.parse(situationsFeedbackRaw);
            sitSummary = parsed?.summary || parsed?.advice || parsed?.text || situationsFeedbackRaw;
          } catch {
            sitSummary = situationsFeedbackRaw;
          }
        } else if (situationsFeedbackRaw && typeof situationsFeedbackRaw === "object") {
          sitSummary = (situationsFeedbackRaw as any)?.summary || (situationsFeedbackRaw as any)?.advice || (situationsFeedbackRaw as any)?.text || "";
        }
        if (!sitSummary && situationsScore != null) {
          sitSummary = `Ролевые ситуации успешно пройдены: оценка ${situationsScore}/100.`;
        }

        return (
          <div className="space-y-5">
            <div
              className="section-card liquid-glass-card bg-transparent backdrop-blur-2xl border p-6 text-center space-y-4 shadow-xl"
              style={{
                borderColor: containerBorder,
                borderRadius: containerRadius,
              }}
            >
              <Award className="w-12 h-12 mx-auto" style={{ color: iconColor }} />
              <div className="text-5xl font-extrabold text-white">{avg}<span className="text-2xl text-slate-300">/100</span></div>
              <p className="text-sm text-slate-200">
                Средний балл по {vals.length || 0} из 3 этапов. Проходной: <b>{passScore}</b>.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    await refetchCandidateScores();
                    try { await Promise.resolve(onRefresh?.()); } catch { /* ignore */ }
                  }}
                  className="landing-btn-inactive border text-white text-sm font-bold px-4 py-2 inline-flex items-center gap-1 hover:bg-white/10"
                  style={inactiveBtnStyle}
                  title="Подтянуть последние баллы из базы данных"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Обновить балл
                </button>
              </div>
              {vals.length < 3 ? (
                <p className="text-amber-300 font-bold text-sm">
                  Пройдите все три этапа, чтобы открыть обучение.
                </p>
              ) : passed ? (
                <div className="space-y-3">
                  <p className="font-bold" style={{ color: boldTextColor }}>Интервью пройдено — доступ к обучению открыт!</p>
                  <button
                    type="button"
                    onClick={async () => {
                      try { await Promise.resolve(onRefresh?.()); } catch { /* ignore */ }
                      onCompleted?.(true, Number(avg));
                    }}
                    className="landing-btn-active font-bold text-sm px-6 py-3 inline-flex items-center gap-2 border cursor-pointer shadow-md transition"
                    style={activeBtnStyle}
                  >
                    Перейти к обучению
                  </button>
                </div>
              ) : (
                <>
                  <p className="text-amber-300 font-bold text-sm">Нужен более высокий балл. Можно пересдать все этапы.</p>
                  <button
                    type="button"
                    onClick={reset}
                    className="landing-btn-active font-bold text-sm px-5 py-2.5 border cursor-pointer shadow-md transition"
                    style={activeBtnStyle}
                  >
                    Начать заново
                  </button>
                </>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {stageSummary("1. Резюме", resumeResult?.score ?? null, resumeResult?.summary || "")}
              {stageSummary("2. Чек-лист", checklistScore, chkSummary)}
              {stageSummary("3. Ситуации", situationsScore, sitSummary)}
            </div>

            {/* Подробные разборы этапов по 4 блока */}
            <div className="space-y-4 pt-2">
              <h3 className="text-lg font-bold" style={headingStyle}>
                Подробные результаты по всем этапам собеседования
              </h3>

              {/* 1. Резюме (Скрининг) — 4 блока */}
              {(resumeResult || candData?.resume_score != null) && (
                <div
                  className="section-card liquid-glass-card bg-transparent backdrop-blur-2xl border p-5 space-y-4 shadow-xl"
                  style={{ borderColor: containerBorder, borderRadius: containerRadius }}
                >
                  <div className="flex items-center justify-between">
                    <h4 className="text-base font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#CBA335] bg-clip-text text-transparent">
                      Этап 1: Скрининг резюме
                    </h4>
                    <span className="text-xl font-extrabold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#CBA335] bg-clip-text text-transparent">
                      {resumeResult?.score ?? candData?.resume_score ?? 0}/100
                    </span>
                  </div>
                  {/* Блок 1: Результат с описанием */}
                  {(resumeResult?.summary || candData?.resume_score != null) && (
                    <div className="text-[14px] text-white/95 leading-[1.6]">
                      <RichMarkdown tone="resume">{resumeResult?.summary || `Скрининг резюме завершён: оценка ${candData?.resume_score ?? 0}/100.`}</RichMarkdown>
                    </div>
                  )}
                  {/* Блок 2 и 3: Плюсы и Минусы */}
                  {((resumeResult?.strengths?.length ?? 0) > 0 || (resumeResult?.gaps?.length ?? 0) > 0 || (resumeResult?.areas_to_clarify?.length ?? 0) > 0) && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {(resumeResult?.strengths?.length ?? 0) > 0 && (
                        <div className="bg-transparent border border-[#E7C768]/40 rounded-xl p-4 space-y-2">
                          <div className="text-[14px] font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#CBA335] bg-clip-text text-transparent">
                            Плюсы (сильные стороны)
                          </div>
                          <ul className="list-disc pl-5 text-[14px] text-white/95 leading-[1.6] space-y-1">
                            {resumeResult!.strengths.map((s, i) => <li key={i}>{s}</li>)}
                          </ul>
                        </div>
                      )}
                      {((resumeResult?.gaps?.length ?? 0) > 0 || (resumeResult?.areas_to_clarify?.length ?? 0) > 0) && (
                        <div className="bg-transparent border border-white/20 rounded-xl p-4 space-y-2">
                          <div className="text-[14px] font-bold text-white">
                            Минусы (зоны роста)
                          </div>
                          <ul className="list-disc pl-5 text-[14px] text-white/90 leading-[1.6] space-y-1">
                            {(resumeResult?.gaps?.length ? resumeResult.gaps : (resumeResult?.areas_to_clarify || [])).map((s, i) => <li key={i}>{s}</li>)}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                  {/* Блок 4: Рекомендации и критерии оценки */}
                  {((resumeResult?.recommendations?.length ?? 0) > 0 || (resumeResult?.areas_to_clarify?.length ?? 0) > 0 || resumeCriteriaMd.trim().length > 0) && (
                    <div className="bg-transparent border border-white/15 rounded-xl p-4 space-y-2">
                      <div className="text-[14px] font-bold text-[#E7C768]">
                        Результаты по критериям оценки
                      </div>
                      {resumeResult?.recommendations && resumeResult.recommendations.length > 0 && (
                        <ul className="list-disc pl-5 text-[14px] text-white/90 leading-[1.6] space-y-1">
                          {resumeResult.recommendations.map((s, i) => <li key={i}>{s}</li>)}
                        </ul>
                      )}
                      {resumeResult?.areas_to_clarify && resumeResult.areas_to_clarify.length > 0 && !resumeResult.recommendations?.length && (
                        <ul className="list-disc pl-5 text-[14px] text-white/90 leading-[1.6] space-y-1">
                          {resumeResult.areas_to_clarify.map((s, i) => <li key={i}>{s}</li>)}
                        </ul>
                      )}
                      {resumeCriteriaMd.trim().length > 0 && (
                        <div className="text-[14px] text-white/85 leading-[1.6] pt-1">
                          <RichMarkdown tone="resume">{resumeCriteriaMd}</RichMarkdown>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* 2. Чек-лист — 4 блока */}
              {(checklistScore != null || checklistFeedback || candData?.checklist_score != null) && (
                <div
                  className="section-card liquid-glass-card bg-transparent backdrop-blur-2xl border p-5 space-y-4 shadow-xl"
                  style={{ borderColor: containerBorder, borderRadius: containerRadius }}
                >
                  <CandidateChecklistReport
                    view={adaptCandidateChecklist(checklistFeedback || candData?.checklist_ai_feedback)}
                    score={checklistScore ?? candData?.checklist_score}
                  />
                </div>
              )}

              {/* 3. Ситуации — 4 блока */}
              {(situationsScore != null || situationsFeedbackRaw || candData?.situations_score != null) && (
                <div
                  className="section-card liquid-glass-card bg-transparent backdrop-blur-2xl border p-5 space-y-4 shadow-xl"
                  style={{ borderColor: containerBorder, borderRadius: containerRadius }}
                >
                  <CandidateSituationsReport
                    view={adaptCandidateSituations(situationsFeedbackRaw || candData?.situations_ai_feedback)}
                    score={situationsScore ?? candData?.situations_score}
                  />
                </div>
              )}
            </div>

            <CandidateFieldsEditorBlock
              candidateId={candidateId}
              candidate={candData}
              customFieldsConfig={customFieldsConfig}
              persistToDb={true}
              editable={true}
              compact={true}
              activeTheme={activeTheme}
              title="Анкета кандидата (26 стандартных и дополнительные поля)"
              subtitle="Итоговая анкета кандидата по вакансии. Вы можете дополнить или отредактировать поля."
              onSaved={() => { void refetchCandidateScores(); }}
            />
            {candOverallFeedback && <CandidateOverallReport feedback={candOverallFeedback} />}
          </div>
        );
      })()}
      <VacancyPausedDialog open={pausedOpen} projectId={projectId} onClose={() => setPausedOpen(false)} />
    </div>
  );
}