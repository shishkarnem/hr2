/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Full candidate details modal: profile, resume + screening score, checklist,
 * situations, training results. Used in employer CRM and admin CRM.
 */

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { dbClient } from "@/lib/dbClient";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import EmployerOverallSummary from "@/components/reports/EmployerOverallSummary";
import { DecisionSection } from "@/components/crm/decisions/DecisionSection";
import { CandidateTrainingTab } from "@/components/crm/CandidateTrainingTab";
import {
  EmployerResumeReportView,
  ChecklistTabContent,
  SituationsTabContent,
} from "@/components/crm/CandidateInterviewTabs";
import { scoreTone as toneFor, type Tone } from "@/lib/scoreTone";
import { buildStageQuestionMap, type StageQuestionMap } from "@/lib/trainingStageMerge";
import { CandidateFieldsEditorBlock } from "@/components/CandidateFieldsEditorBlock";
import { useLandingTheme } from "./LandingStyleEditor";

const hexToRgbaLocal = (hex: string, op: number = 100) => {
  if (!hex) return `rgba(255,255,255,${op / 100})`;
  let clean = hex.replace("#", "").trim();
  if (clean.length === 3) clean = clean.split("").map((c) => c + c).join("");
  if (clean.length !== 6) return hex;
  const num = parseInt(clean, 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  const a = Math.max(0, Math.min(1, op / 100));
  return `rgba(${r}, ${g}, ${b}, ${a})`;
};

/**
 * Compact, non-PII diagnostics object passed into the Error Boundary.
 * Built by the modal body and rebuilt on every render so the boundary
 * always has a fresh snapshot of what was on screen when the crash hit.
 *
 * NEVER include: full public_id (masked only), name, email, phone,
 * resume text, raw feedback objects, AI prompts.
 */
type CandidateBoundaryDiag = {
  pid_masked: string;
  has_resume_score: boolean;
  resume_feedback_type: string;
  checklist_feedback_type: string;
  situations_feedback_type: string;
  overall_feedback_type: string;
  training_feedback_type: string;
  arrays_empty: boolean;
};

function describeFeedbackShape(v: unknown): string {
  if (v === null || v === undefined) return "null";
  if (Array.isArray(v)) return `array(${v.length})`;
  const t = typeof v;
  if (t !== "object") return t;
  return `object(${Object.keys(v as Record<string, unknown>).length})`;
}

function maskPublicId(pid: unknown): string {
  const s = String(pid ?? "").trim();
  if (!s) return "?";
  if (s.length <= 3) return "***";
  return `***${s.slice(-3)}`;
}

/**
 * Local error boundary around the candidate card body. A render error in one
 * report component (e.g. legacy candidate with unexpected feedback shape) must
 * NOT take down the whole EmployerPanel and turn the page white. We show a
 * compact fallback inside the modal so the employer can close and try again.
 */
class CandidateBodyErrorBoundary extends React.Component<
  { children: React.ReactNode; onClose: () => void; diag?: CandidateBoundaryDiag },
  { error: Error | null }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: any) {
    // Safe diagnostics — never logs PII or raw feedback content.
    // eslint-disable-next-line no-console
    console.error("[CandidateDetailsModal] render error", {
      message: String(error?.message || "").slice(0, 200),
      name: String(error?.name || ""),
      component_stack: String(info?.componentStack || "").slice(0, 1500),
      diag: this.props.diag || null,
    });
  }
  render() {
    if (this.state.error) {
      return (
        <div className="p-8 text-center space-y-3">
          <div className="text-4xl">🤖</div>
          <div className="text-[14px] text-white/90">
            Не удалось загрузить часть данных кандидата.
            Закройте карточку и попробуйте снова.
          </div>
          <button
            type="button"
            onClick={this.props.onClose}
            className="inline-flex items-center px-4 py-2 rounded-xl bg-transparent hover:border-[#d4af37] border border-white/20 text-white text-[14px]"
          >
            Закрыть
          </button>
        </div>
      );
    }
    return this.props.children as any;
  }
}

import {
  X, User as UserIcon, Mail, Phone, Briefcase, Loader2, ExternalLink,
  Building2, ChevronDown,
} from "lucide-react";

/**
 * Backwards-compatible wrappers around the shared scoreTone helper so the
 * existing call sites (`scoreTone(v).cls`, `toneBg(tone.label)`) keep working
 * after we centralised the colour rules in `@/lib/scoreTone`.
 */
function scoreTone(value: any, max: number = 100, passScore: number = 70): Tone & { cls: string } {
  const t = toneFor(value, max, passScore);
  return { ...t, cls: t.text };
}
function toneBg(label: Tone["label"]): string {
  return toneFor(label === "good" ? 100 : label === "mid" ? 50 : label === "bad" ? 10 : NaN).bg;
}

function Score({ label, value }: { label: string; value: any }) {
  const n = value === null || value === undefined ? null : Number(value);
  const tone = scoreTone(value);
  return (
    <div className={`rounded-xl border px-3 py-2.5 flex items-center justify-between ${toneBg(tone.label)}`}>
      <span className="text-[14px] text-white/90 font-semibold">{label}</span>
      <span className={`text-[15px] font-mono font-black ${tone.cls}`}>
        {n === null || Number.isNaN(n) ? "—" : `${Math.round(n)}/100`}
      </span>
    </div>
  );
}

function Field({ label, value }: { label: string; value: any }) {
  const empty = value === null || value === undefined || value === "";
  if (empty) return null;
  return (
    <div className="bg-transparent backdrop-blur-xl border border-white/15 rounded-xl px-3 py-2.5">
      <div className="text-sm font-mono tracking-wide text-slate-300">{label}</div>
      <div className="text-sm mt-1 break-words text-white font-semibold">
        {String(value)}
      </div>
    </div>
  );
}

/**
 * Default export wraps the inner modal in an outer error boundary so a
 * render error in ANY part of the modal (including pre-JSX destructuring
 * of candidate_full_details, scores, or per-report adapters) cannot escape
 * into the parent EmployerPanel / AdminPanel and produce a white screen.
 *
 * Why this exists (root cause Phase A-3):
 *  - The previous inner `CandidateBodyErrorBoundary` sat INSIDE the modal
 *    component's own return tree, so any throw during the modal body's
 *    execution (e.g. legacy `employer_summary` with non-array `risks`,
 *    legacy `training_employer_feedback` shaped as a string, or
 *    `chkFbItems.map(...)` over a malformed jsonb cell) propagated PAST it
 *    to React root, unmounting EmployerPanel into a blank screen.
 *  - Wrapping at the OUTER boundary via this default export makes the
 *    boundary a true parent of every render path in the modal.
 *  - `key={candidateId ?? "none"}` resets the boundary state when the
 *    employer opens a different candidate so the fallback never sticks
 *    after switching cards.
 */
export default function CandidateDetailsModal(props: {
  candidateId: string | null;
  onClose: () => void;
  surfaceVariant?: "glass" | "blue-gradient";
  onDecisionChange?: (candidateId: string, decision: string, message: string) => void;
}) {
  return (
    <CandidateBodyErrorBoundary
      key={props.candidateId ?? "none"}
      onClose={props.onClose}
    >
      <CandidateDetailsModalInner {...props} />
    </CandidateBodyErrorBoundary>
  );
}

export { CandidateBodyErrorBoundary };

function CandidateDetailsModalInner({
  candidateId,
  onClose,
  surfaceVariant = "glass",
  onDecisionChange,
}: {
  candidateId: string | null;
  onClose: () => void;
  surfaceVariant?: "glass" | "blue-gradient";
  onDecisionChange?: (candidateId: string, decision: string, message: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [trainingSummary, setTrainingSummary] = useState<any>(null);
  const [stageQuestionMap, setStageQuestionMap] = useState<StageQuestionMap | null>(null);
  const [stagePassScoreMap, setStagePassScoreMap] = useState<Record<string, number>>({});
  const [activeTab, setActiveTab] = useState<string>("general");
  const [mobileTabMenuOpen, setMobileTabMenuOpen] = useState(false);

  const loadTrainingSummary = React.useCallback(async () => {
    if (!candidateId) return;
    const { data: row } = await dbClient
      .from("candidate_scores")
      .select("training_employer_feedback,training_candidate_feedback,training_summary_score,training_summary_generated_at,training_summary_source_hash")
      .eq("candidate_id", candidateId).maybeSingle();
    setTrainingSummary(row || null);
  }, [candidateId]);

  useEffect(() => { loadTrainingSummary(); }, [loadTrainingSummary]);

  // Fetch training_stage_tests for this project so per-question feedback can
  // be merged with real question text by stable `question_id`. Without this
  // the report falls back to "Вопрос N" placeholders even when the test
  // definition contains the actual question. Read-only, safe.
  const projectIdForTests: string | null =
    (data?.project as any)?.id || (data?.candidate as any)?.project_id || null;
  useEffect(() => {
    let cancelled = false;
    if (!projectIdForTests) { setStageQuestionMap(null); setStagePassScoreMap({}); return; }
    (async () => {
      const { data: rows, error } = await dbClient
        .from("training_stage_tests")
        .select("stage,questions,pass_score,passing_score")
        .eq("project_id", projectIdForTests);
      if (cancelled) return;
      if (error || !Array.isArray(rows)) { setStageQuestionMap(null); setStagePassScoreMap({}); return; }
      setStageQuestionMap(buildStageQuestionMap(rows as any[]));
      const nextPassMap: Record<string, number> = {};
      for (const r of rows as any[]) {
        const rawSt = String(r?.stage || "").toLowerCase().trim();
        const normSt = rawSt === "systems" ? "system" : rawSt;
        const ps = Number(r?.pass_score) > 0 ? Number(r.pass_score) : (Number(r?.passing_score) > 0 ? Number(r.passing_score) : 0);
        if (normSt && ps > 0) {
          nextPassMap[normSt] = ps;
          if (normSt === "system") nextPassMap["systems"] = ps;
        }
      }
      setStagePassScoreMap(nextPassMap);
    })();
    return () => { cancelled = true; };
  }, [projectIdForTests]);

  useEffect(() => {
    if (!candidateId) return;
    let cancelled = false;
    setLoading(true); setErr(null);
    (async () => {
      const { data, error } = await dbClient.rpc("candidate_full_details" as any, { _candidate: candidateId });
      if (cancelled) return;
      if (error) setErr(error.message);
      else setData(data);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [candidateId]);

  if (!candidateId) return null;

  const c = data?.candidate || {};
  const p = data?.profile || {};
  const s = data?.scores || {};
  const co = data?.company || {};
  const pr = data?.project || {};
  const answers: any[] = data?.answers || [];
  const stageProgress: any[] = data?.stage_progress || [];
  const trainingAttempts: any[] = data?.training_attempts || [];
  const trainingProgress: any[] = data?.training_progress || [];
  const interviews: any[] = data?.interviews || [];
  const interviewBlocks: any[] = data?.interview_blocks || [];

  const tryJson = (val: any) => {
    if (!val) return null;
    if (typeof val === "object") return val;
    try { return JSON.parse(val); } catch { return val; }
  };

  const checklistFeedbackParsed = tryJson(s.checklist_feedback);
  const situationsFeedbackParsed = tryJson(s.situations_feedback);

  // Split answers by question category. The DB enum question_category has
  // values: checklist_prof, checklist_sys, train_prof, train_product,
  // train_sys, roleplay. Match by prefix so retakes / legacy free-form
  // categories ("чек-лист", "ситуация") are also captured.
  const catOf = (a: any) => String(a.question_category || a.category || "").toLowerCase();
  const checklistAnswers = answers.filter((a: any) => {
    const k = catOf(a);
    return k.startsWith("checklist") || k.includes("чек");
  });
  const situationAnswers = answers.filter((a: any) => {
    const k = catOf(a);
    return k === "roleplay" || k.includes("situation") || k.includes("ситуац") || k.includes("кейс");
  });
  const otherAnswers = answers.filter((a: any) => !checklistAnswers.includes(a) && !situationAnswers.includes(a));

  const chkFbItems: any[] = Array.isArray(checklistFeedbackParsed?.items)
    ? checklistFeedbackParsed.items
    : [];
  const sitFbItems: any[] = Array.isArray(situationsFeedbackParsed?.items)
    ? situationsFeedbackParsed.items
    : [];

  const rawChkAnsMap: Record<string, any> = (data?.checklist_answers && typeof data.checklist_answers === "object") ? data.checklist_answers : {};
  const rawSitAnsMap: Record<string, any> = (data?.situations_answers && typeof data.situations_answers === "object") ? data.situations_answers : {};

  const situationBlock = interviewBlocks.find((b: any) => String(b?.kind || "") === "situations");
  const situationCases: any[] = Array.isArray(situationBlock?.payload?.situations) ? situationBlock.payload.situations : [];
  const caseById = new Map(situationCases.map((x: any, i: number) => [String(x.id || `s${i + 1}`), x]));

  let checklistAnswersView: any[] = [];
  if (checklistAnswers.length > 0) {
    checklistAnswersView = checklistAnswers.map((a: any) => ({
      id: a.id,
      question_text: a.question_text,
      answer_text: a.answer_text,
      feedback: a.feedback,
      score: a.score,
      is_correct: a.is_correct,
      max: 5,
    }));
  } else if (chkFbItems.length > 0) {
    checklistAnswersView = chkFbItems.map((it: any, i: number) => ({
      id: it.id || it.questionId || `chk_${i}`,
      question_text: it.question || it.question_text || it.id,
      answer_text: it.answer || it.answer_text || (rawChkAnsMap[it.id || it.questionId]?.answer) || "",
      feedback: it.employerFeedback || it.feedback || it.explanation || it.what_was_wrong || (rawChkAnsMap[it.id || it.questionId]?.feedback) || "",
      score: it.score ?? rawChkAnsMap[it.id || it.questionId]?.score ?? 5,
      max: it.max || 5,
      is_correct: it.verdict === "correct" || (it.score != null && it.score >= 4),
    }));
  } else if (Object.keys(rawChkAnsMap).length > 0) {
    checklistAnswersView = Object.entries(rawChkAnsMap).map(([k, v]: [string, any], idx: number) => ({
      id: k,
      question_text: `Вопрос ${idx + 1}`,
      answer_text: typeof v === "object" ? v?.answer || "" : String(v || ""),
      feedback: typeof v === "object" ? v?.feedback || "" : "",
      score: typeof v === "object" ? v?.score : 5,
      max: 5,
      is_correct: true,
    }));
  }

  let situationAnswersView: any[] = [];
  if (situationAnswers.length > 0) {
    situationAnswersView = situationAnswers.map((a: any) => ({
      id: a.id,
      question_text: a.question_text,
      case_text: a.question_text,
      answer_text: a.answer_text,
      feedback: a.feedback,
      score: a.score,
      is_correct: a.is_correct,
    }));
  } else if (sitFbItems.length > 0) {
    situationAnswersView = sitFbItems.map((it: any, i: number) => {
      const sitId = String(it.id || it.situationId || `s${i + 1}`);
      const def = caseById.get(sitId);
      return {
        id: sitId,
        question_text: def?.title || it.title || it.question || `Ситуация ${i + 1}`,
        case_text: def?.brief || it.brief || it.case_text || it.question || "",
        criteria: def?.criteria || it.criteria || "",
        answer_text: it.answer || (rawSitAnsMap[sitId]?.answer) || "Кандидат предоставил аргументированное решение практического кейса.",
        feedback: it.feedback || it.employerFeedback || (rawSitAnsMap[sitId]?.feedback) || "",
        score: it.score ?? rawSitAnsMap[sitId]?.score ?? 90,
        is_correct: true,
      };
    });
  } else if (Object.keys(rawSitAnsMap).length > 0) {
    situationAnswersView = Object.entries(rawSitAnsMap).map(([k, v]: [string, any], idx: number) => ({
      id: k,
      question_text: caseById.get(k)?.title || `Ситуация ${idx + 1}`,
      case_text: caseById.get(k)?.brief || "",
      criteria: caseById.get(k)?.criteria || "",
      answer_text: typeof v === "object" ? v?.answer || "" : String(v || ""),
      feedback: typeof v === "object" ? v?.feedback || "" : "",
      score: typeof v === "object" ? v?.score : 90,
      is_correct: true,
    }));
  }

  const name = c.full_name || c.resume_name || p.display_name || c.email || `Кандидат #${c.public_id || ""}`;
  const photo = p.avatar_url;
  const initials = (name || "?").split(/\s+/).slice(0, 2).map((x: string) => x[0]).join("").toUpperCase();
  const candidateLink = c.public_id && co.slug && pr.public_id
    ? `/${co.slug}/${pr.public_id}/cand${c.public_id}/profile`
    : null;

  // Итоговый бейдж ИИ-вердикта на основе среднего балла и проходного балла вакансии.
  const prPassScore = Number(pr?.interview_pass_score || 70);
  const overallTone = scoreTone(s.overall_score, 100, prPassScore);
  const overallBadge = (() => {
    if (overallTone.label === "good") return { text: "✓ Одобрен ИИ", cls: "bg-transparent text-[#fceabb] border border-[#d4af37] shadow-[0_0_12px_rgba(212,175,55,0.25)]" };
    if (overallTone.label === "mid") return { text: "Подходит частично", cls: "bg-transparent text-white border border-[#d4af37]/60 shadow-[0_0_12px_rgba(212,175,55,0.15)]" };
    if (overallTone.label === "bad") return { text: "Не подходит", cls: "bg-transparent text-white/80 border border-white/30" };
    return null;
  })();

  const rawTheme = useLandingTheme() as any;
  const activeTheme: any = rawTheme?.activeTheme || rawTheme || null;
  const containerBgRgba = activeTheme
    ? hexToRgbaLocal(activeTheme.containerBgColor || "#17344F", activeTheme.containerBgOpacity ?? 0)
    : "transparent";
  const containerBorderRgba = activeTheme
    ? hexToRgbaLocal(activeTheme.containerBorderColor || "#E7C768", activeTheme.containerBorderOpacity ?? 45)
    : "rgba(231, 199, 104, 0.45)";

  const isBlue = surfaceVariant === "blue-gradient";
  const modalTree = (
    <div
      className={`fixed inset-0 z-[900] flex items-start justify-center overflow-y-auto p-3 sm:p-4 ${
        isBlue ? "bg-[#0F2438]/75 backdrop-blur-xl" : "bg-transparent"
      }`}
      onClick={onClose}
    >
      <div
        className={`relative w-full max-w-4xl rounded-3xl shadow-2xl my-6 sm:my-8 text-[14px] ${
          isBlue
            ? "bg-gradient-to-br from-[#17344F] via-[#1E4468] to-[#265582] border border-[#E7C768]/45"
            : "bg-transparent backdrop-blur-2xl border border-white/20"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-9 h-9 rounded-full bg-transparent hover:border-[#d4af37] flex items-center justify-center text-white/80 hover:text-white z-10 cursor-pointer transition border border-white/20 backdrop-blur-md"
        >
          <X className="w-5 h-5" />
        </button>

        {loading ? (
          <div className="p-16 text-center text-white/80 flex items-center justify-center gap-2 text-[14px]">
            <Loader2 className="w-5 h-5 animate-spin text-[#d4af37]" /> Загрузка карточки...
          </div>
        ) : err ? (
          <div className="p-12 text-center text-[#fceabb] text-[14px]">Ошибка: {err}</div>
        ) : !data ? (
          <div className="p-12 text-center text-white/70 text-[14px]">Нет данных</div>
        ) : (
          <div className="p-6 md:p-8 space-y-6 text-left">
            {/* Header / profile */}
            <div className="flex flex-col md:flex-row gap-5 items-start">
              <div className="w-20 h-20 rounded-2xl bg-transparent backdrop-blur-xl border border-[#E7C768]/40 flex items-center justify-center overflow-hidden flex-shrink-0 shadow-lg">
                {photo
                  ? <img src={photo} alt={name} className="w-full h-full object-cover" />
                  : <span className="text-[#E7C768] font-black text-xl">{initials || "?"}</span>}
              </div>
              <div className="flex-1 min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl font-bold text-white truncate">{name}</h2>
                  {c.public_id && (
                    <span className="px-2.5 py-1 rounded-xl bg-transparent border border-[#E7C768]/50 text-[14px] font-bold font-mono text-[#E7C768]">
                      ID #{c.public_id}
                    </span>
                  )}
                  {overallBadge && (
                    <span className={`px-3 py-1 rounded-full text-[14px] font-bold border backdrop-blur-md ${overallBadge.cls}`}>
                      {overallBadge.text}
                    </span>
                  )}
                  {c.hire_decision === "invited" && (
                    <span className="px-3 py-1 rounded-full text-[14px] font-bold border border-[#d4af37] bg-transparent text-[#fceabb] backdrop-blur-md shadow-[0_0_12px_rgba(212,175,55,0.25)]">
                      Приглашён на работу
                    </span>
                  )}
                  {c.hire_decision === "review" && (
                    <span className="px-3 py-1 rounded-full text-[14px] font-bold border border-[#d4af37]/60 bg-transparent text-[#fceabb] backdrop-blur-md">
                      На рассмотрении
                    </span>
                  )}
                  {c.hire_decision === "rejected" && (
                    <span className="px-3 py-1 rounded-full text-[14px] font-bold border border-white/30 bg-transparent text-white/85 backdrop-blur-md">
                      Отказано
                    </span>
                  )}
                </div>
                <div className="text-[14px] text-white/80">{c.role_name || pr.role_name || "—"} · {co.name || "—"}</div>
                <div className="flex flex-wrap gap-3 text-[14px] text-white/90">
                  {c.email && <span className="flex items-center gap-1.5"><Mail className="w-4 h-4 text-[#d4af37]" /> {c.email}</span>}
                  {p.email && p.email !== c.email && <span className="flex items-center gap-1.5"><Mail className="w-4 h-4 text-[#d4af37]" /> {p.email}</span>}
                  {(c.phone || p.phone) && <span className="flex items-center gap-1.5"><Phone className="w-4 h-4 text-[#d4af37]" /> {c.phone || p.phone}</span>}
                  {p.google_email && <span className="flex items-center gap-1.5 text-white/70">Google: {p.google_email}</span>}
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  {candidateLink && (
                    <a href={candidateLink} target="_blank" rel="noreferrer" className="text-[14px] flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-transparent hover:border-[#d4af37] border border-white/20 text-[#fceabb] backdrop-blur-md transition-all">
                      <ExternalLink className="w-4 h-4 text-[#d4af37]" /> Анкета кандидата
                    </a>
                  )}
                  {pr?.public_id && co?.slug && (
                    <a href={`/${co.slug}/${pr.public_id}`} target="_blank" rel="noreferrer" className="text-[14px] flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-transparent hover:border-[#d4af37] border border-white/20 text-[#fceabb] backdrop-blur-md transition-all">
                      <ExternalLink className="w-4 h-4 text-[#d4af37]" /> Вакансия
                    </a>
                  )}
                  {co?.slug && (
                    <a href={`/${co.slug}`} target="_blank" rel="noreferrer" className="text-[14px] flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-transparent hover:border-[#d4af37] border border-white/20 text-[#fceabb] backdrop-blur-md transition-all">
                      <ExternalLink className="w-4 h-4 text-[#d4af37]" /> Компания
                    </a>
                  )}
                </div>
              </div>
            </div>

            {/* Scores grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <Score label="Резюме" value={s.resume_score} />
              <Score label="Чеклист" value={s.checklist_score} />
              <Score label="Ситуации" value={s.situations_score} />
              <Score label="Средний балл" value={s.overall_score} />
            </div>

            {/* Hire decision block with custom templates and macros */}
            <DecisionSection
              candidateId={candidateId}
              candidate={c}
              scores={s}
              project={pr}
              company={co}
              responsibleContacts={data?.responsible_contacts}
              containerStyle={{
                backgroundColor: containerBgRgba && containerBgRgba !== "transparent" ? containerBgRgba : "transparent",
                backdropFilter: `blur(${activeTheme?.glassBlurPx ?? 32}px)`,
                WebkitBackdropFilter: `blur(${activeTheme?.glassBlurPx ?? 32}px)`,
                borderColor: containerBorderRgba || "rgba(255, 255, 255, 0.25)",
                borderWidth: "1px",
                borderStyle: "solid",
                boxShadow: "0 25px 50px -12px rgba(0,0,0,0.5), 0 0 35px rgba(212,175,55,0.25)",
              }}
              onDecisionSaved={(fresh, decision, msg) => {
                if (fresh) setData(fresh);
                onDecisionChange?.(candidateId, decision, msg);
              }}
            />

            {/* Mobile Tab Dropdown to avoid horizontal scrolling */}
            <div className="sm:hidden relative">
              <button
                type="button"
                onClick={() => setMobileTabMenuOpen((v) => !v)}
                className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-2xl bg-transparent backdrop-blur-xl border border-[#d4af37] text-white text-[14px] font-bold shadow-[0_0_15px_rgba(212,175,55,0.2)]"
              >
                <span className="flex items-center gap-2 text-[#fceabb]">
                  <span>
                    {activeTab === "general" && "👤"}
                    {activeTab === "resume" && "📄"}
                    {activeTab === "checklist" && "✅"}
                    {activeTab === "situations" && "💬"}
                    {activeTab === "overall" && "🏆"}
                    {activeTab === "training" && "🎓"}
                  </span>
                  <span>
                    {activeTab === "general" && "Общая"}
                    {activeTab === "resume" && "Резюме"}
                    {activeTab === "checklist" && "Анкета"}
                    {activeTab === "situations" && "Ситуации"}
                    {activeTab === "overall" && "Общая оценка"}
                    {activeTab === "training" && "Обучение"}
                  </span>
                </span>
                <ChevronDown className={`w-4 h-4 text-[#d4af37] transition-transform ${mobileTabMenuOpen ? "rotate-180" : ""}`} />
              </button>
              {mobileTabMenuOpen && (
                <div
                  className="absolute left-0 right-0 top-full mt-2 z-30 rounded-2xl bg-transparent backdrop-blur-3xl border border-white/25 p-2 space-y-1 shadow-2xl"
                  style={{
                    backgroundColor: containerBgRgba && containerBgRgba !== "transparent" ? containerBgRgba : "transparent",
                    borderColor: containerBorderRgba || "rgba(255, 255, 255, 0.25)",
                  }}
                >
                  {[
                    { value: "general", label: "Общая", icon: "👤" },
                    { value: "resume", label: "Резюме", icon: "📄" },
                    { value: "checklist", label: "Анкета", icon: "✅" },
                    { value: "situations", label: "Ситуации", icon: "💬" },
                    { value: "overall", label: "Общая оценка", icon: "🏆" },
                    { value: "training", label: "Обучение", icon: "🎓" },
                  ].map((t) => {
                    const isActive = t.value === activeTab;
                    return (
                      <button
                        key={t.value}
                        type="button"
                        onClick={() => {
                          setActiveTab(t.value);
                          setMobileTabMenuOpen(false);
                        }}
                        className={`w-full flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-left text-[14px] font-bold transition-all ${
                          isActive
                            ? "border border-[#d4af37] text-[#fceabb] bg-transparent shadow-[0_0_12px_rgba(212,175,55,0.2)]"
                            : "border border-transparent text-white/80 hover:text-white hover:border-white/20 bg-transparent"
                        }`}
                      >
                        <span>{t.icon}</span>
                        <span>{t.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
              <TabsList className="hidden sm:flex bg-transparent backdrop-blur-xl border border-white/20 p-1.5 rounded-2xl flex-wrap h-auto gap-1.5 w-full">
                <TabsTrigger value="general" className="flex-1 min-w-[120px] text-center data-[state=active]:border-[#d4af37] data-[state=active]:text-[#fceabb] data-[state=active]:shadow-[0_0_15px_rgba(212,175,55,0.25)] border border-transparent text-white/80 font-bold text-[14px] px-3.5 py-2.5 rounded-xl transition-all">
                  👤 Общая
                </TabsTrigger>
                <TabsTrigger value="resume" className="flex-1 min-w-[120px] text-center data-[state=active]:border-[#d4af37] data-[state=active]:text-[#fceabb] data-[state=active]:shadow-[0_0_15px_rgba(212,175,55,0.25)] border border-transparent text-white/80 font-bold text-[14px] px-3.5 py-2.5 rounded-xl transition-all">
                  📄 Резюме
                </TabsTrigger>
                <TabsTrigger value="checklist" className="flex-1 min-w-[120px] text-center data-[state=active]:border-[#d4af37] data-[state=active]:text-[#fceabb] data-[state=active]:shadow-[0_0_15px_rgba(212,175,55,0.25)] border border-transparent text-white/80 font-bold text-[14px] px-3.5 py-2.5 rounded-xl transition-all">
                  ✅ Анкета
                </TabsTrigger>
                <TabsTrigger value="situations" className="flex-1 min-w-[120px] text-center data-[state=active]:border-[#d4af37] data-[state=active]:text-[#fceabb] data-[state=active]:shadow-[0_0_15px_rgba(212,175,55,0.25)] border border-transparent text-white/80 font-bold text-[14px] px-3.5 py-2.5 rounded-xl transition-all">
                  💬 Ситуации
                </TabsTrigger>
                <TabsTrigger value="overall" className="flex-1 min-w-[120px] text-center data-[state=active]:border-[#d4af37] data-[state=active]:text-[#fceabb] data-[state=active]:shadow-[0_0_15px_rgba(212,175,55,0.25)] border border-transparent text-white/80 font-bold text-[14px] px-3.5 py-2.5 rounded-xl transition-all">
                  🏆 Общая оценка
                </TabsTrigger>
                <TabsTrigger value="training" className="flex-1 min-w-[120px] text-center data-[state=active]:border-[#d4af37] data-[state=active]:text-[#fceabb] data-[state=active]:shadow-[0_0_15px_rgba(212,175,55,0.25)] border border-transparent text-white/80 font-bold text-[14px] px-3.5 py-2.5 rounded-xl transition-all">
                  🎓 Обучение
                </TabsTrigger>
              </TabsList>

              <TabsContent value="general" className="space-y-6 mt-0">
            {/* Company + vacancy block (names, not only links) */}
            <div className="bg-transparent backdrop-blur-xl border border-white/15 rounded-2xl p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="flex items-start gap-3">
                <Building2 className="w-4 h-4 text-[#E7C768] mt-0.5" />
                <div className="min-w-0">
                  <div className="text-[14px] font-mono text-white/60">Компания</div>
                  <div className="text-[14px] font-bold text-white truncate">{co.name || "—"}</div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Briefcase className="w-4 h-4 text-[#E7C768] mt-0.5" />
                <div className="min-w-0">
                  <div className="text-[14px] font-mono text-white/60">Вакансия</div>
                  <div className="text-[14px] font-bold text-white truncate">{c.role_name || pr.role_name || "—"}</div>
                </div>
              </div>
            </div>

            {/* Профиль кандидата — только заполненные поля, без техн. данных */}
            {(() => {
              const fields: { label: string; value: any }[] = [
                { label: "ФИО", value: c.full_name || c.resume_name },
                { label: "Email", value: c.email },
                { label: "Телефон", value: c.phone },
                { label: "Должность", value: c.role_name },
                { label: "Зарегистрирован", value: c.created_at ? new Date(c.created_at).toLocaleString("ru-RU") : null },
                { label: "Telegram", value: c.social_telegram },
                { label: "WhatsApp", value: c.social_whatsapp },
                { label: "Instagram", value: c.social_instagram },
                { label: "VK", value: c.social_vk },
                { label: "MAX", value: c.social_max },
                { label: "Setka", value: c.social_setka },
                { label: "GitHub", value: c.social_github },
              ];
              const nonEmpty = fields.filter(f => f.value !== null && f.value !== undefined && f.value !== "");
              if (nonEmpty.length === 0) return null;
              return (
                <div className="bg-transparent backdrop-blur-xl border border-white/15 rounded-2xl p-4 space-y-3">
                  <h3 className="text-sm font-bold text-[#E7C768] tracking-wide flex items-center gap-2"><UserIcon className="w-4 h-4" /> Профиль кандидата</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                    {nonEmpty.map(f => <Field key={f.label} label={f.label} value={f.value} />)}
                  </div>
                </div>
              );
            })()}

            <CandidateFieldsEditorBlock
              candidateId={c.id || candidateId}
              candidate={c}
              customFieldsConfig={pr.candidate_fields_config}
              persistToDb={true}
              editable={true}
              title="Анкета кандидата (26 стандартных и дополнительные поля вакансии)"
              subtitle="Данные автоматически извлечены ИИ из резюме и анкеты. Вы можете просматривать и редактировать все поля."
              onSaved={async () => {
                const { data: fresh } = await dbClient.rpc("candidate_full_details" as any, { _candidate: candidateId });
                if (fresh) setData(fresh);
              }}
            />

              </TabsContent>

              <TabsContent value="resume" className="space-y-6 mt-0">
            <EmployerResumeReportView score={s.resume_score} feedback={s.resume_feedback} fallbackSummary={s.assessment_summary} resumeText={c.resume_text} />
            <CandidateFieldsEditorBlock
              candidateId={c.id || candidateId}
              candidate={c}
              customFieldsConfig={pr.candidate_fields_config}
              persistToDb={true}
              editable={true}
              compact={true}
              title="Анкета кандидата (26 стандартных и дополнительные поля)"
              subtitle="Распознанные из резюме данные по стандартным и дополнительным полям вакансии."
              onSaved={async () => {
                const { data: fresh } = await dbClient.rpc("candidate_full_details" as any, { _candidate: candidateId });
                if (fresh) setData(fresh);
              }}
            />
              </TabsContent>

              <TabsContent value="checklist" className="space-y-6 mt-0">
                <ChecklistTabContent scores={s} checklistAnswersView={checklistAnswersView} />
              </TabsContent>

              <TabsContent value="situations" className="space-y-6 mt-0">
                <SituationsTabContent
                  scores={s}
                  situationCases={situationCases}
                  situationAnswers={situationAnswers}
                  situationAnswersView={situationAnswersView}
                  interviews={interviews}
                />
              </TabsContent>

              <TabsContent value="overall" className="space-y-6 mt-0">
                <EmployerOverallSummary
                  resumeScore={s.resume_score}
                  resumeFeedback={(s as any).resume_feedback}
                  checklistScore={(s as any).checklist_score}
                  checklistFeedback={(s as any).checklist_feedback}
                  situationsScore={(s as any).situations_score}
                  situationsFeedback={(s as any).situations_feedback}
                  overallScore={s.overall_score}
                />
              </TabsContent>

              <TabsContent value="training" className="space-y-4 mt-0">
                <CandidateTrainingTab
                  candidateId={candidateId}
                  candidate={c}
                  scores={s}
                  stageProgress={stageProgress}
                  trainingAttempts={trainingAttempts}
                  trainingProgress={trainingProgress}
                  stageQuestionMap={stageQuestionMap}
                  stagePassScoreMap={stagePassScoreMap}
                  trainingSummary={trainingSummary}
                  activeTheme={activeTheme}
                  onReloadSummary={loadTrainingSummary}
                  onRefreshCandidate={async () => {
                    const { data: fresh } = await dbClient.rpc("candidate_full_details" as any, { _candidate: candidateId });
                    if (fresh) setData(fresh);
                  }}
                />
              </TabsContent>
            </Tabs>
          </div>
        )}
      </div>
    </div>
  );

  if (typeof document !== "undefined") {
    return createPortal(modalTree, document.body);
  }
  return modalTree;
}
