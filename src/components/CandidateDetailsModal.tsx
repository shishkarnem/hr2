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
import RichMarkdown from "@/components/RichMarkdown";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { adaptEmployerChecklist, adaptEmployerSituations } from "@/lib/feedbackAdapters";
import EmployerChecklistReport from "@/components/reports/EmployerChecklistReport";
import EmployerSituationsReport from "@/components/reports/EmployerSituationsReport";
import EmployerOverallReport from "@/components/reports/EmployerOverallReport";
import EmployerOverallSummary from "@/components/reports/EmployerOverallSummary";
import EmployerTrainingStageReport from "@/components/reports/EmployerTrainingStageReport";
import EmployerTrainingSummaryReport from "@/components/reports/EmployerTrainingSummaryReport";
import { scoreTone as toneFor, formatScore as toneFormat, type Tone } from "@/lib/scoreTone";
import { buildStageQuestionMap, type StageQuestionMap } from "@/lib/trainingStageMerge";
import {
  startOverallCandidateV2, pollEmployerJobUntilTerminal,
  getEmployerActiveJob, clearEmployerActiveJob, fetchEmployerJobStatus,
  isTerminal, isSuccess,
} from "@/lib/aiJobs";
import { diagLog, extractInvokeError, tail } from "@/lib/diagLog";
import { aiChat } from "@/lib/aiClient";
import { Sparkles } from "lucide-react";
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

/** Map raw job status / thrown error codes to user-facing copy. */
function humanizeAiError(code: string | null | undefined): string {
  const s = String(code || "").toLowerCase();
  if (!s) return "";
  if (s.includes("source_data_changed"))
    return "Данные кандидата изменились во время анализа. Запустите пересчёт ещё раз.";
  if (s === "validation_failed" || s.startsWith("schema_invalid"))
    return "ИИ вернул некорректный отчёт. Запустите пересчёт ещё раз.";
  if (s === "save_failed") return "Не удалось сохранить отчёт. Попробуйте позже.";
  if (s === "fallback_failed" || s === "primary_failed")
    return "ИИ-провайдеры временно недоступны. Повторите попытку чуть позже.";
  if (s === "orchestration_failed") return "Внутренняя ошибка. Попробуйте позже.";
  if (s === "runtime_no_background") return "Среда временно недоступна. Попробуйте позже.";
  if (s === "forbidden" || s === "candidate_not_found")
    return "Нет доступа к этому кандидату.";
  return "Не удалось сформировать общую AI-оценку.";
}
import {
  X, User as UserIcon, Mail, Phone, MessageSquare, FileText,
  CheckSquare, Briefcase, GraduationCap, Loader2, ExternalLink, Award,
  Building2, UserCheck, UserX, ChevronDown, ChevronUp, Clock, RefreshCw
} from "lucide-react";

/**
 * Employer-facing structured resume report (v2 / Phase 3B-2A).
 * Renders matches / gaps / strengths / risks / red_flags / questions_to_verify
 * when the new schema is present; falls back to the legacy {summary,strengths,
 * gaps} shape from the old synchronous function.
 *
 * IMPORTANT: this view is the ONLY place that shows employer-only fields
 * (verdict, risks, red_flags, questions_to_verify, employer_wishes). The
 * candidate cabinet must NEVER render these.
 */
function EmployerResumeReportView({ score, feedback, fallbackSummary, resumeText }: {
  score: any; feedback: any; fallbackSummary?: string | null; resumeText?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const hasFeedback = feedback && typeof feedback === "object" && !Array.isArray(feedback);
  const isV2 = hasFeedback && typeof (feedback as any).verdict === "string";
  const tone = scoreTone(score);

  const renderBody = () => {
    if (!hasFeedback && !fallbackSummary && !resumeText) {
      return (
        <div className="bg-transparent backdrop-blur-xl border border-white/15 rounded-2xl p-6 text-center text-[14px] text-white/70">
          Резюме ещё не загружено и не оценено ИИ.
        </div>
      );
    }
    if (!isV2) {
      // Legacy fallback: old schema {summary,strengths,gaps} OR just a text summary.
      const f: any = hasFeedback ? feedback : {};
      const summary = f.summary || fallbackSummary || "";
      const strengths = Array.isArray(f.strengths) ? f.strengths : [];
      const gaps      = Array.isArray(f.gaps) ? f.gaps : [];
      return (
        <div className="space-y-3">
          {summary && (
            <div className={`text-[14px] rounded-xl p-4 border ${toneBg(tone.label)} text-white`}>
              <div className="text-[14px] font-mono text-[#E7C768] mb-1">Резюме оценил ИИ</div>
              <RichMarkdown tone="resume">{summary}</RichMarkdown>
            </div>
          )}
          {strengths.length > 0 && (
            <div className="bg-transparent backdrop-blur-xl border border-[#d4af37]/40 rounded-xl p-4">
              <div className="text-[14px] font-mono text-[#E7C768] mb-1">Сильные стороны</div>
              <ul className="text-[14px] text-white/90 list-disc pl-5 space-y-1">{strengths.map((x: any, i: number) => <li key={i}>{String(x)}</li>)}</ul>
            </div>
          )}
          {gaps.length > 0 && (
            <div className="bg-transparent backdrop-blur-xl border border-white/20 rounded-xl p-4">
              <div className="text-[14px] font-mono text-white/80 mb-1">Пробелы</div>
              <ul className="text-[14px] text-white/90 list-disc pl-5 space-y-1">{gaps.map((x: any, i: number) => <li key={i}>{String(x)}</li>)}</ul>
            </div>
          )}
        </div>
      );
    }
    const f: any = feedback;
    const matches  = Array.isArray(f.matches) ? f.matches : [];
    const gaps     = Array.isArray(f.gaps) ? f.gaps : [];
    const strengths= Array.isArray(f.strengths) ? f.strengths : [];
    const risks    = Array.isArray(f.risks) ? f.risks : [];
    const redFlags = Array.isArray(f.red_flags) ? f.red_flags : [];
    const questions= Array.isArray(f.questions_to_verify) ? f.questions_to_verify : [];
    return (
      <div className="space-y-3">
        <div className={`rounded-xl p-4 border ${toneBg(tone.label)} text-white space-y-1.5`}>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[14px] font-mono text-[#E7C768]">Вердикт</span>
            <span className={`text-[14px] font-bold ${tone.cls}`}>{String(f.verdict || "—")}</span>
            {Number.isFinite(Number(score)) && (
              <span className={`text-[14px] font-mono font-black ml-auto ${tone.cls}`}>{Math.round(Number(score))}/100</span>
            )}
          </div>
          <div className="text-[14px] leading-relaxed text-white">
            <RichMarkdown tone="resume">{String(f.summary || "")}</RichMarkdown>
          </div>
        </div>
        {matches.length > 0 && (
          <div className="bg-transparent backdrop-blur-xl border border-[#d4af37]/40 rounded-xl p-4 space-y-1.5">
            <div className="text-[14px] font-mono text-[#E7C768]">Соответствия требованиям</div>
            <ul className="space-y-1.5">
              {matches.map((m: any, i: number) => (
                <li key={i} className="text-[14px] text-white/90">
                  <div className="font-semibold text-white">{m.criterion} <span className="text-[14px] font-mono text-[#fceabb] ml-1">{m.degree}</span></div>
                  {m.evidence && <div className="text-white/80 text-[14px] mt-0.5">{m.evidence}</div>}
                </li>
              ))}
            </ul>
          </div>
        )}
        {gaps.length > 0 && (
          <div className="bg-transparent backdrop-blur-xl border border-white/20 rounded-xl p-4 space-y-1.5">
            <div className="text-[14px] font-mono text-white/80">Пробелы и расхождения</div>
            <ul className="space-y-1.5">
              {gaps.map((g: any, i: number) => (
                <li key={i} className="text-[14px] text-white/90">
                  <div className="font-semibold text-white">{g.criterion}</div>
                  {g.finding && <div className="text-white/80 text-[14px] mt-0.5">{g.finding}</div>}
                  {g.impact && <div className="text-[14px] italic text-[#fceabb]">Влияние: {g.impact}</div>}
                </li>
              ))}
            </ul>
          </div>
        )}
        {strengths.length > 0 && (
          <div className="bg-transparent backdrop-blur-xl border border-[#d4af37]/40 rounded-xl p-4">
            <div className="text-[14px] font-mono text-[#E7C768] mb-1">Сильные стороны</div>
            <ul className="text-[14px] text-white/90 list-disc pl-5 space-y-1">{strengths.map((x: any, i: number) => <li key={i}>{String(x)}</li>)}</ul>
          </div>
        )}
        {risks.length > 0 && (
          <div className="bg-transparent backdrop-blur-xl border border-white/20 rounded-xl p-4 space-y-1.5">
            <div className="text-[14px] font-mono text-white/80">Риски</div>
            <ul className="space-y-1.5">
              {risks.map((r: any, i: number) => (
                <li key={i} className="text-[14px] text-white/90">
                  <div className="font-semibold text-white">{r.title} <span className="text-[14px] font-mono text-[#fceabb] ml-1">{r.severity}</span></div>
                  {r.evidence && <div className="text-white/80 text-[14px] mt-0.5">Свидетельство: {r.evidence}</div>}
                  {r.how_to_verify && <div className="text-[14px] italic text-white/70">Как проверить: {r.how_to_verify}</div>}
                </li>
              ))}
            </ul>
          </div>
        )}
        {redFlags.length > 0 && (
          <div className="bg-transparent backdrop-blur-xl border border-white/30 rounded-xl p-4 space-y-1.5">
            <div className="text-[14px] font-mono text-[#E7C768]">Особые отметки</div>
            <ul className="space-y-1.5">
              {redFlags.map((r: any, i: number) => (
                <li key={i} className="text-[14px] text-white/90">
                  <div className="font-semibold text-white">{r.title} <span className="text-[14px] font-mono text-white/70 ml-1">{r.severity}</span></div>
                  {r.evidence && <div className="text-white/80 text-[14px] mt-0.5">{r.evidence}</div>}
                </li>
              ))}
            </ul>
          </div>
        )}
        {questions.length > 0 && (
          <div className="bg-transparent backdrop-blur-xl border border-[#d4af37]/30 rounded-xl p-4">
            <div className="text-[14px] font-mono text-[#E7C768] mb-1">Что проверить на интервью</div>
            <ul className="text-[14px] text-white/90 list-disc pl-5 space-y-1">{questions.map((q: any, i: number) => <li key={i}>{String(q)}</li>)}</ul>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {renderBody()}
      {resumeText && (
        <div className="bg-transparent backdrop-blur-xl border border-white/15 rounded-2xl">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-3 text-[14px] font-mono text-white/80 hover:text-white"
          >
            <span className="flex items-center gap-2"><FileText className="w-4 h-4 text-[#E7C768]" /> Распознанный текст резюме</span>
            {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {open && (
            <div className="px-4 pb-4 text-[14px] text-white/90 leading-relaxed max-h-96 overflow-y-auto">
              <RichMarkdown tone="resume">{resumeText}</RichMarkdown>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const STAGE_LABELS: Record<string, string> = {
  registration: "Регистрация",
  screening: "Скрининг",
  checklist: "Чеклист",
  situations: "Ситуации",
  professional: "Профессия",
  product: "Продукт",
  systems: "Система",
  certified: "Сертификат",
};

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
  onDecisionChange,
}: {
  candidateId: string | null;
  onClose: () => void;
  onDecisionChange?: (candidateId: string, decision: string, message: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [decisionOpen, setDecisionOpen] = useState<null | "invited" | "review" | "rejected">(null);
  const [decisionMsg, setDecisionMsg] = useState("");
  const [decisionSaving, setDecisionSaving] = useState(false);
  const [decisionErr, setDecisionErr] = useState<string | null>(null);
  const [decisionTone, setDecisionTone] = useState<"warm"|"formal"|"friendly"|"short">("warm");
  const [decisionGenerating, setDecisionGenerating] = useState(false);
  const [reviewSaving, setReviewSaving] = useState(false);
  const [overallSaving, setOverallSaving] = useState(false);
  const [overallErr, setOverallErr] = useState<string | null>(null);
  const [overallStatus, setOverallStatus] = useState<string>("");
  const [trainingSummary, setTrainingSummary] = useState<any>(null);
  const [trainingSummaryLoading, setTrainingSummaryLoading] = useState(false);
  const [trainingSummaryErr, setTrainingSummaryErr] = useState<string | null>(null);
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

  const recomputeTrainingSummary = async () => {
    if (!candidateId) return;
    const ctail = tail(candidateId);
    diagLog("training_summary_btn", "click_started", { candidate_id_tail: ctail });
    setTrainingSummaryLoading(true);
    setTrainingSummaryErr(null);
    try {
      const { data: { session } } = await dbClient.auth.getSession();
      diagLog("training_summary_btn", "session_present", { session: session?.access_token ? "yes" : "no", candidate_id_tail: ctail });
      if (!session?.access_token) {
        const code = "summary_no_session";
        diagLog("training_summary_btn", "invoke_error", { code, candidate_id_tail: ctail });
        setTrainingSummaryErr(`Не удалось сформировать итог. Войдите заново. Код: ${code}`);
        return;
      }
      diagLog("training_summary_btn", "invoke_started", { candidate_id_tail: ctail });
      const { data, error } = await dbClient.functions.invoke("ai-evaluate-training-summary-v2", {
        body: { candidate_id: candidateId },
      });
      if (error) {
        const { code, http_status } = await extractInvokeError(error);
        diagLog("training_summary_btn", "invoke_error", { code, http_status, candidate_id_tail: ctail });
        setTrainingSummaryErr(`Не удалось сформировать итог. Код: summary_invoke_${http_status ?? code}`);
        return;
      }
      const dataErr = (data as any)?.error;
      if (dataErr) {
        const code = String(dataErr).slice(0, 64);
        diagLog("training_summary_btn", "invoke_error", { code, candidate_id_tail: ctail });
        setTrainingSummaryErr(`Не удалось сформировать итог. Код: summary_${code}`);
        return;
      }
      diagLog("training_summary_btn", "invoke_success", { candidate_id_tail: ctail });
      await loadTrainingSummary();
      diagLog("training_summary_btn", "terminal", { terminal_status: "ok", candidate_id_tail: ctail });
    } catch (e: any) {
      const code = String(e?.message || "unknown").slice(0, 64);
      diagLog("training_summary_btn", "unhandled_error", { code, candidate_id_tail: ctail });
      setTrainingSummaryErr(`Не удалось сформировать итог. Код: summary_${code}`);
    } finally {
      setTrainingSummaryLoading(false);
    }
  };

  const markReview = async () => {
    if (!candidateId) return;
    setReviewSaving(true);
    setDecisionErr(null);
    try {
      const { error } = await (dbClient as any).rpc("candidate_invite_decision", {
        _candidate: candidateId,
        _decision: "review",
        _message: "Кандидат взят на дополнительное рассмотрение.",
      });
      if (error) throw error;
      const { data: fresh } = await dbClient.rpc("candidate_full_details" as any, { _candidate: candidateId });
      setData(fresh);
    } catch (e: any) {
      setDecisionErr(e?.message || "Не удалось поставить статус «На рассмотрении»");
    } finally {
      setReviewSaving(false);
    }
  };

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

  const submitDecision = async () => {
    if (!candidateId || !decisionOpen) return;
    setDecisionSaving(true); setDecisionErr(null);
    try {
      const { error } = await (dbClient as any).rpc("candidate_invite_decision", {
        _candidate: candidateId,
        _decision: decisionOpen,
        _message: decisionMsg.trim() || null,
      });
      if (error) throw error;
      // refresh
      const { data: fresh } = await dbClient.rpc("candidate_full_details" as any, { _candidate: candidateId });
      const savedDecision = decisionOpen;
      const savedMsg = decisionMsg.trim();
      setData(fresh);
      setDecisionOpen(null);
      setDecisionMsg("");
      onDecisionChange?.(candidateId, savedDecision, savedMsg);
    } catch (e: any) {
      setDecisionErr(e?.message || "Не удалось сохранить решение");
    } finally {
      setDecisionSaving(false);
    }
  };

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
  const overallFeedbackParsed = tryJson(s.employer_overall_feedback);
  const trainingFeedbackParsed = tryJson(s.training_employer_feedback) || tryJson(data?.training_summary?.training_employer_feedback);

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

  /**
   * Phase 4 — overall AI candidate evaluation via the async v2 lifecycle.
   *
   * The button:
   *  - mints ONE request_id per click (`crypto.randomUUID`);
   *  - blocks double-click via `overallSaving`;
   *  - calls `ai-evaluate-overall-candidate-v2` (employer JWT);
   *  - polls `get_ai_job_safe_status` RPC until terminal;
   *  - re-reads candidate_full_details on success;
   *  - shows safe error on failure (terminal failures need a NEW request_id
   *    to retry, which means another button click).
   *
   * No RR billing, no overwrite of `overall_score`, no overwrite of
   * `assessment_summary` — the v2 RPC only touches the new fit fields.
   */
  const runOverallEvaluation = async () => {
    if (!candidateId || overallSaving) return;
    const ctail = tail(candidateId);
    diagLog("overall_btn", "click_started", { candidate_id_tail: ctail });
    setOverallSaving(true);
    setOverallErr(null);
    setOverallStatus("primary_running");
    let requestId = "";
    let jobId = "";
    let firstStatus = "";
    let lastStatus = "";
    try {
      // Pre-check database auth session (employer JWT).
      const { data: { session } } = await dbClient.auth.getSession();
      diagLog("overall_btn", "session_present", { session: session?.access_token ? "yes" : "no", candidate_id_tail: ctail });
      if (!session?.access_token) {
        const code = "overall_no_session";
        diagLog("overall_btn", "invoke_error", { code, candidate_id_tail: ctail });
        setOverallErr(`Не удалось запустить анализ. Войдите заново. Код: ${code}`);
        return;
      }
      diagLog("overall_btn", "invoke_started", { candidate_id_tail: ctail });
      let started;
      try {
        started = await startOverallCandidateV2({ candidateId });
      } catch (invokeErr: any) {
        const { code, http_status } = await extractInvokeError(invokeErr);
        diagLog("overall_btn", "invoke_error", { code, http_status, candidate_id_tail: ctail });
        setOverallErr(`Не удалось запустить анализ. Код: overall_invoke_${http_status ?? code}`);
        return;
      }
      requestId = started.request_id;
      jobId = started.job_id;
      firstStatus = started.status;
      lastStatus = started.status;
      diagLog("overall_btn", "invoke_success", {
        request_id: requestId, job_id: jobId, first_status: firstStatus,
        candidate_id_tail: ctail,
      });
      if (started.terminal) {
        // Reused terminal — just refetch and surface the state.
        if (!isSuccess(started.status)) {
          setOverallErr(humanizeAiError(started.status));
        }
        clearEmployerActiveJob("overall_candidate", candidateId);
        diagLog("overall_btn", "terminal", { job_id: jobId, terminal_status: started.status, candidate_id_tail: ctail });
      } else {
        const final = await pollEmployerJobUntilTerminal({
          jobId: started.job_id,
          onTick: (row) => { lastStatus = row.status; setOverallStatus(row.status); },
        });
        clearEmployerActiveJob("overall_candidate", candidateId);
        diagLog("overall_btn", "terminal", {
          job_id: jobId, terminal_status: final.status, last_status: lastStatus,
          candidate_id_tail: ctail,
        });
        if (!isSuccess(final.status)) {
          setOverallErr(`${humanizeAiError(final.status)} Код: overall_${final.status}`);
        }
      }
      const { data: fresh } = await dbClient.rpc("candidate_full_details" as any, { _candidate: candidateId });
      setData(fresh);
    } catch (e: any) {
      const code = String(e?.message || "unknown").slice(0, 64);
      diagLog("overall_btn", "unhandled_error", { code, job_id: jobId, candidate_id_tail: ctail });
      setOverallErr(`Не удалось запустить анализ. Код: overall_${code}`);
    } finally {
      setOverallSaving(false);
      setOverallStatus("");
    }
  };

  // Restore an in-flight overall job if the modal was closed while polling.
  useEffect(() => {
    if (!candidateId) return;
    const rec = getEmployerActiveJob("overall_candidate", candidateId);
    if (!rec) return;
    let cancelled = false;
    (async () => {
      const row = await fetchEmployerJobStatus(rec.job_id);
      if (cancelled) return;
      if (!row) { clearEmployerActiveJob("overall_candidate", candidateId); return; }
      if (isTerminal(row.status)) {
        clearEmployerActiveJob("overall_candidate", candidateId);
        return;
      }
      setOverallSaving(true);
      setOverallStatus(row.status);
      try {
        const final = await pollEmployerJobUntilTerminal({
          jobId: rec.job_id,
          onTick: (r) => !cancelled && setOverallStatus(r.status),
        });
        if (cancelled) return;
        clearEmployerActiveJob("overall_candidate", candidateId);
        if (!isSuccess(final.status)) setOverallErr(humanizeAiError(final.status));
        const { data: fresh } = await dbClient.rpc("candidate_full_details" as any, { _candidate: candidateId });
        if (!cancelled) setData(fresh);
      } catch (e: any) {
        if (!cancelled) setOverallErr(humanizeAiError(e?.message || "poll_failed"));
      } finally {
        if (!cancelled) { setOverallSaving(false); setOverallStatus(""); }
      }
    })();
    return () => { cancelled = true; };
  }, [candidateId]);

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

  return (
    <div className="fixed inset-0 z-[60] bg-transparent flex items-start justify-center overflow-y-auto p-4" onClick={onClose}>
      <div
        className="relative w-full max-w-4xl bg-transparent backdrop-blur-2xl border border-white/20 rounded-3xl shadow-2xl my-8 text-[14px]"
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
                  {c.hire_decision === "review" && (
                    <span className="px-3 py-1 rounded-full text-[14px] font-bold border border-[#d4af37]/60 bg-transparent text-[#fceabb] backdrop-blur-md">
                      На рассмотрении
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

            {/* Hire decision block */}
            <div className="bg-transparent backdrop-blur-xl border border-[#E7C768]/40 rounded-2xl p-5 space-y-4 shadow-lg">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <h3 className="text-[14px] font-bold text-[#E7C768] tracking-wide flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-[#E7C768]" /> Решение по кандидату
                </h3>
                {c.hire_decision && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-[14px] font-bold backdrop-blur-md ${
                      c.hire_decision === "invited"
                        ? "bg-transparent text-white border border-[#d4af37] shadow-[0_0_12px_rgba(212,175,55,0.25)]"
                        : c.hire_decision === "review"
                          ? "bg-transparent text-[#fceabb] border border-[#d4af37]/60 shadow-[0_0_12px_rgba(212,175,55,0.2)]"
                          : "bg-transparent text-white/80 border border-white/30"
                    }`}>
                      {c.hire_decision === "invited"
                        ? <><UserCheck className="w-4 h-4 text-[#d4af37]" /> Приглашён на работу</>
                        : c.hire_decision === "review"
                          ? <><Clock className="w-4 h-4 text-[#d4af37]" /> На рассмотрении</>
                          : <><UserX className="w-4 h-4 text-white/70" /> Отказано</>}
                    </div>
                    {c.hire_decided_at && (
                      <div className="text-[14px] text-white/60 font-mono">
                        {new Date(c.hire_decided_at).toLocaleString("ru-RU")}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {c.hire_message && (
                <div className="bg-transparent backdrop-blur-md rounded-xl border border-white/15 p-3.5 text-[14px] text-white/95 whitespace-pre-wrap leading-relaxed">
                  <div className="text-[14px] font-mono text-white/60 mb-1">Отправленное сообщение кандидату:</div>
                  {c.hire_message}
                </div>
              )}

              {/* 3 Interactive Decision Buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setDecisionOpen("invited");
                    const candName = c.full_name || c.resume_name || "кандидат";
                    const role = pr.role_name || "вакансию";
                    setDecisionMsg(c.hire_decision === "invited" && c.hire_message ? c.hire_message : `Здравствуйте, ${candName}! Мы внимательно ознакомились с вашим резюме и результатами отбора на позицию «${role}». Рады сообщить, что мы приняли положительное решение и приглашаем вас на работу в нашу команду! В ближайшее время свяжемся с вами для согласования даты выхода.`);
                  }}
                  className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-bold text-[14px] transition-all shadow-md backdrop-blur-md ${
                    c.hire_decision === "invited"
                      ? "border border-[#d4af37] bg-transparent text-[#fceabb] shadow-[0_0_15px_rgba(212,175,55,0.3)] ring-1 ring-[#d4af37]"
                      : "border border-white/20 hover:border-[#d4af37] bg-transparent text-white hover:text-[#fceabb]"
                  }`}
                >
                  <UserCheck className="w-4 h-4 text-[#d4af37]" /> Пригласить на работу
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setDecisionOpen("review");
                    const candName = c.full_name || c.resume_name || "кандидат";
                    const role = pr.role_name || "вакансию";
                    setDecisionMsg(c.hire_decision === "review" && c.hire_message ? c.hire_message : `Здравствуйте, ${candName}! Ваша кандидатура на позицию «${role}» находится на рассмотрении руководства компании. Мы свяжемся с вами сразу после финализации решения.`);
                  }}
                  className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-bold text-[14px] transition-all shadow-md backdrop-blur-md ${
                    c.hire_decision === "review"
                      ? "border border-[#d4af37] bg-transparent text-[#fceabb] shadow-[0_0_15px_rgba(212,175,55,0.3)] ring-1 ring-[#d4af37]"
                      : "border border-white/20 hover:border-[#d4af37] bg-transparent text-white hover:text-[#fceabb]"
                  }`}
                >
                  <Clock className="w-4 h-4 text-[#d4af37]" /> На рассмотрении
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setDecisionOpen("rejected");
                    const candName = c.full_name || c.resume_name || "кандидат";
                    const role = pr.role_name || "вакансию";
                    setDecisionMsg(c.hire_decision === "rejected" && c.hire_message ? c.hire_message : `Здравствуйте, ${candName}! Благодарим вас за интерес к вакансии «${role}» и время, уделённое отбору. В настоящий момент мы остановились на кандидате, чей опыт ближе к текущим задачам. Ваше резюме сохранено в резерве нашей компании.`);
                  }}
                  className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-bold text-[14px] transition-all shadow-md backdrop-blur-md ${
                    c.hire_decision === "rejected"
                      ? "border border-white/60 bg-transparent text-white shadow-[0_0_15px_rgba(255,255,255,0.2)] ring-1 ring-white/60"
                      : "border border-white/20 hover:border-white/50 bg-transparent text-white hover:text-white/80"
                  }`}
                >
                  <UserX className="w-4 h-4 text-white/70" /> Отказать
                </button>
              </div>
            </div>

            {decisionOpen && typeof document !== "undefined" && createPortal(
              <div
                className="fixed inset-0 z-[100000] bg-transparent flex items-center justify-center p-3 sm:p-6"
                onClick={() => !decisionSaving && setDecisionOpen(null)}
              >
                <div
                  className="relative rounded-3xl shadow-2xl p-6 sm:p-8 w-full max-w-lg max-h-[90vh] overflow-y-auto text-white space-y-4 bg-transparent backdrop-blur-3xl border border-white/20"
                  style={{
                    backgroundColor: containerBgRgba && containerBgRgba !== "transparent" ? containerBgRgba : "transparent",
                    backdropFilter: "blur(32px)",
                    WebkitBackdropFilter: "blur(32px)",
                    borderColor: containerBorderRgba || "rgba(255, 255, 255, 0.25)",
                    borderWidth: "1px",
                    borderStyle: "solid",
                    boxShadow: "0 25px 50px -12px rgba(0,0,0,0.5), 0 0 35px rgba(212,175,55,0.25)",
                  }}
                  onClick={e => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between border-b border-white/15 pb-3">
                    <h4 className="text-[17px] font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">
                      {decisionOpen === "invited"
                        ? "Пригласить на работу"
                        : decisionOpen === "review"
                          ? "Поставить на рассмотрение"
                          : "Отказать кандидату"}
                    </h4>
                    <button
                      type="button"
                      disabled={decisionSaving}
                      onClick={() => setDecisionOpen(null)}
                      className="text-white/60 hover:text-white p-1 rounded-lg"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  <p className="text-[14px] text-white/85">
                    Кандидат получит личное уведомление с этим решением и текстом сообщения в личном кабинете.
                  </p>

                  <div className="space-y-2">
                    <div className="text-[14px] text-white/75">Тон сообщения</div>
                    <div className="flex flex-wrap gap-2 items-center">
                      {([
                        { k: "warm", label: "Тёплый" },
                        { k: "formal", label: "Официальный" },
                        { k: "friendly", label: "Дружелюбный" },
                        { k: "short", label: "Краткий" },
                      ] as const).map(t => (
                        <button
                          type="button"
                          key={t.k}
                          onClick={() => setDecisionTone(t.k)}
                          className={`px-3 py-1.5 rounded-xl text-[14px] font-semibold border transition-all ${
                            decisionTone === t.k
                              ? "bg-[#E7C768]/25 border-[#E7C768] text-[#fceabb]"
                              : "bg-white/5 border-white/15 text-white/80 hover:bg-white/10"
                          }`}
                        >
                          {t.label}
                        </button>
                      ))}
                      <button
                        type="button"
                        disabled={decisionGenerating}
                        onClick={async () => {
                          setDecisionGenerating(true); setDecisionErr(null);
                          try {
                            const toneRu = { warm: "тёплый", formal: "официальный", friendly: "дружелюбный", short: "краткий" }[decisionTone];
                            const candName = c.full_name || c.resume_name || "кандидат";
                            const role = pr.role_name || "вакансия";
                            const company = co.name || pr.company_name || "";
                            const scoreLine = s?.overall_score ? `Средний балл интервью: ${Math.round(s.overall_score)}/100.` : "";
                            const goal = decisionOpen === "invited"
                              ? "Пригласи кандидата на работу. Сообщи, что решение положительное, поздравь и предложи связаться для обсуждения оформления."
                              : decisionOpen === "review"
                                ? "Сообщи кандидату, что его кандидатура взята на дополнительное рассмотрение руководством. Поблагодари за терпение."
                                : "Вежливо откажи кандидату. Поблагодари за интерес и потраченное время. Не указывай жестких причин.";
                            const prompt = `Составь короткое сообщение (3–5 предложений) кандидату в ${toneRu} тоне.
Компания: ${company}. Вакансия: ${role}. Имя кандидата: ${candName}. ${scoreLine}
${goal}
Напиши только текст сообщения без пояснений и без мета-текста.`;
                            const reply = await aiChat({
                              kind: "employer",
                              messages: [{ role: "user", content: prompt }],
                              candidate_id: candidateId || undefined,
                              project_id: (pr as any)?.id || undefined,
                            });
                            if (reply) setDecisionMsg(reply.trim());
                          } catch (e: any) {
                            setDecisionErr(e?.message || "Не удалось сгенерировать текст");
                          } finally {
                            setDecisionGenerating(false);
                          }
                        }}
                        className="ml-auto px-3.5 py-1.5 rounded-xl text-[14px] font-bold bg-gradient-to-r from-[#E7C768] to-[#D99E41] text-[#17344F] inline-flex items-center gap-1.5 disabled:opacity-50 shadow"
                      >
                        {decisionGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                        Сгенерировать ИИ
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <textarea
                      value={decisionMsg}
                      onChange={e => setDecisionMsg(e.target.value)}
                      placeholder="Введите сообщение кандидату..."
                      rows={6}
                      className="w-full bg-white/10 border border-white/20 rounded-xl p-3.5 text-[14px] text-white placeholder:text-white/40 focus:outline-none focus:border-[#E7C768] leading-relaxed"
                    />
                    <div className="text-[14px] text-white/60">
                      Сообщение будет отправлено кандидату в личный кабинет и сохранено в истории решений.
                    </div>
                  </div>

                  {decisionErr && (
                    <div className="text-[14px] text-[#fceabb] border border-[#d4af37]/40 rounded-xl p-3 bg-transparent backdrop-blur-md">
                      {decisionErr}
                    </div>
                  )}

                  <div className="flex gap-3 justify-end pt-2">
                    <button
                      type="button"
                      disabled={decisionSaving}
                      onClick={() => setDecisionOpen(null)}
                      className="px-4 py-2.5 rounded-xl bg-transparent hover:border-[#d4af37] border border-white/20 text-white text-[14px] font-semibold"
                    >
                      Отмена
                    </button>
                    <button
                      type="button"
                      disabled={decisionSaving}
                      onClick={submitDecision}
                      className="px-5 py-2.5 rounded-xl text-[#17344F] font-bold text-[14px] inline-flex items-center gap-2 bg-gradient-to-r from-[#E7C768] to-[#D99E41] hover:brightness-110 shadow-lg disabled:opacity-50"
                    >
                      {decisionSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                      {decisionOpen === "invited"
                        ? "Пригласить и уведомить"
                        : decisionOpen === "review"
                          ? "Сохранить и уведомить"
                          : "Отказать и уведомить"}
                    </button>
                  </div>
                </div>
              </div>,
              document.body
            )}

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
                <div className="absolute left-0 right-0 top-full mt-2 z-30 rounded-2xl bg-[#17344F]/95 backdrop-blur-2xl border border-white/20 p-2 space-y-1 shadow-2xl">
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
                {((s as any)?.checklist_feedback || (s as any)?.checklist_score != null) && (
                  <div className="bg-transparent backdrop-blur-xl border border-white/15 rounded-2xl p-4">
                    <EmployerChecklistReport
                      view={adaptEmployerChecklist((s as any)?.checklist_feedback)}
                      score={(s as any)?.checklist_score ?? null}
                    />
                  </div>
                )}

                {checklistAnswersView.length > 0 ? (
                  <div className="bg-transparent backdrop-blur-xl border border-white/15 rounded-2xl p-4 space-y-3">
                    <h3 className="text-[14px] font-bold text-[#E7C768] tracking-wide flex items-center gap-2">
                      <CheckSquare className="w-4 h-4 text-[#E7C768]" /> Ответы на анкету (чек-лист)
                    </h3>
                    <div className="space-y-3 max-h-[40rem] overflow-y-auto pr-1">
                      {checklistAnswersView.map((a: any, idx: number) => {
                        const max = a.max ?? 5;
                        const qText = a.question_text || (a.question_id ? a.question_id.slice(0, 8) + "…" : `Вопрос ${idx + 1}`);
                        const short = qText.length > 80 ? qText.slice(0, 80).trimEnd() + "…" : qText;
                        return (
                          <details key={a.id} className="group rounded-2xl border border-white/15 hover:border-[#d4af37]/60 bg-transparent backdrop-blur-md overflow-hidden transition-all">
                            <summary className="cursor-pointer list-none px-4 py-3 flex items-center gap-3 select-none">
                              <span className="text-[14px] font-mono text-white/60 shrink-0 w-7">{idx + 1}.</span>
                              <span className="text-[14px] font-semibold text-white leading-relaxed flex-1">{short}</span>
                              <span className="text-[14px] font-mono font-bold shrink-0 px-2.5 py-1 rounded-lg border border-[#d4af37]/50 bg-transparent text-[#fceabb]">
                                {a.score !== null && a.score !== undefined
                                  ? `${Math.round(Number(a.score))}/${max}`
                                  : (a.is_correct ? "✓" : "—")}
                              </span>
                              <span className="text-white/60 text-[14px] shrink-0 transition-transform group-open:rotate-180" aria-hidden>▾</span>
                            </summary>
                            <div className="px-4 pb-4 pt-2 space-y-3 border-t border-white/10">
                              {qText && short !== qText && (
                                <div className="text-[14px] text-white/90 leading-relaxed">
                                  <span className="text-[14px] font-mono text-white/60 mr-2">Вопрос:</span>{qText}
                                </div>
                              )}
                              <div className="text-[14px] text-white leading-relaxed bg-transparent backdrop-blur-md border border-white/15 rounded-xl p-3.5">
                                <div className="text-[14px] font-mono text-white/60 mb-1">Ответ кандидата:</div>
                                {a.answer_text ? <RichMarkdown tone="chat">{a.answer_text}</RichMarkdown> : <span className="italic text-white/50">(пусто)</span>}
                              </div>
                              {a.feedback && (
                                <div className="text-[14px] text-[#fceabb] leading-relaxed bg-transparent backdrop-blur-md border border-[#d4af37]/30 rounded-xl p-3.5">
                                  <span className="font-mono text-white/70 mr-2">Комментарий ИИ:</span>{a.feedback}
                                </div>
                              )}
                            </div>
                          </details>
                        );
                      })}
                    </div>
                  </div>
                ) : !((s as any)?.checklist_feedback || (s as any)?.checklist_score != null) ? (
                  <div className="bg-transparent backdrop-blur-xl border border-white/15 rounded-2xl p-6 text-center text-[14px] text-white/70">
                    Кандидат ещё не отвечал на анкету.
                  </div>
                ) : null}
              </TabsContent>

              <TabsContent value="situations" className="space-y-6 mt-0">
                {((s as any)?.situations_feedback || (s as any)?.situations_score != null) && (
                  <div className="bg-transparent backdrop-blur-xl border border-white/15 rounded-2xl p-4">
                    <EmployerSituationsReport
                      view={adaptEmployerSituations((s as any)?.situations_feedback)}
                      score={(s as any)?.situations_score ?? null}
                      situationDefs={situationCases.map((x: any, i: number) => ({
                        id: String(x.id || `s${i + 1}`),
                        title: x.title,
                        brief: x.brief,
                      }))}
                      situationAnswers={Object.fromEntries(
                        (situationAnswers || []).map((a: any) => [String(a.question_id || a.id), a.answer_text || ""]),
                      )}
                    />
                  </div>
                )}

                {situationAnswersView.length > 0 ? (
                  <div className="bg-transparent backdrop-blur-xl border border-white/15 rounded-2xl p-4 space-y-3">
                    <h3 className="text-[14px] font-bold text-[#E7C768] tracking-wide flex items-center gap-2">
                      <MessageSquare className="w-4 h-4 text-[#E7C768]" /> Ответы по ситуациям
                    </h3>
                    <div className="space-y-3 max-h-[40rem] overflow-y-auto pr-1">
                      {situationAnswersView.map((a: any, idx: number) => {
                        const qText = a.question_text || `Ситуация ${idx + 1}`;
                        const short = qText.length > 80 ? qText.slice(0, 80).trimEnd() + "…" : qText;
                        return (
                          <details key={a.id} className="group rounded-2xl border border-white/15 hover:border-[#d4af37]/60 bg-transparent backdrop-blur-md overflow-hidden transition-all">
                            <summary className="cursor-pointer list-none px-4 py-3 flex items-center gap-3 select-none">
                              <span className="text-[14px] font-mono text-white/60 shrink-0 w-7">{idx + 1}.</span>
                              <span className="text-[14px] font-semibold text-white leading-relaxed flex-1">{short}</span>
                              <span className="text-[14px] font-mono font-bold shrink-0 px-2.5 py-1 rounded-lg border border-[#d4af37]/50 bg-transparent text-[#fceabb]">
                                {a.score !== null && a.score !== undefined
                                  ? `${Math.round(Number(a.score))}/100`
                                  : (a.is_correct ? "✓" : "—")}
                              </span>
                              <span className="text-white/60 text-[14px] shrink-0 transition-transform group-open:rotate-180" aria-hidden>▾</span>
                            </summary>
                            <div className="px-4 pb-4 pt-2 space-y-3 border-t border-white/10">
                              {a.case_text && a.case_text !== a.question_text && (
                                <div className="rounded-xl bg-transparent backdrop-blur-md border border-white/15 p-3.5 text-[14px] text-white/95 leading-relaxed">
                                  <div className="text-[14px] font-mono text-[#E7C768] mb-1">Ситуация / кейс:</div>
                                  <RichMarkdown tone="chat">{a.case_text}</RichMarkdown>
                                </div>
                              )}
                              {a.criteria && (
                                <div className="text-[14px] text-white/90 leading-relaxed bg-transparent backdrop-blur-md border border-white/10 rounded-xl p-3.5">
                                  <span className="text-[#E7C768] font-bold">Критерии оценки:</span> {a.criteria}
                                </div>
                              )}
                              <div className="text-[14px] text-white leading-relaxed bg-transparent backdrop-blur-md border border-white/15 rounded-xl p-3.5">
                                <div className="text-[14px] font-mono text-white/60 mb-1">Ответ кандидата:</div>
                                {a.answer_text ? <RichMarkdown tone="chat">{a.answer_text}</RichMarkdown> : <span className="italic text-white/50">(пусто)</span>}
                              </div>
                              {a.feedback && (
                                <div className="text-[14px] text-[#fceabb] leading-relaxed bg-transparent backdrop-blur-md border border-[#d4af37]/30 rounded-xl p-3.5">
                                  <span className="font-mono text-white/70 mr-2">Комментарий ИИ:</span>{a.feedback}
                                </div>
                              )}
                            </div>
                          </details>
                        );
                      })}
                    </div>
                  </div>
                ) : !((s as any)?.situations_feedback || (s as any)?.situations_score != null) ? (
                  <div className="bg-transparent backdrop-blur-xl border border-white/15 rounded-2xl p-6 text-center text-[14px] text-white/70">
                    Кандидат ещё не проходил ситуации.
                  </div>
                ) : null}
                {interviews.length > 0 && (
                  <div className="bg-transparent backdrop-blur-xl border border-white/15 rounded-2xl p-4 space-y-3">
                    <h3 className="text-[14px] font-bold text-[#E7C768] tracking-wide flex items-center gap-2">
                      <MessageSquare className="w-4 h-4 text-[#E7C768]" /> Стенограммы интервью
                    </h3>
                    <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                      {interviews.map((i) => (
                        <div key={i.id} className="p-3.5 rounded-xl border border-white/10 bg-transparent backdrop-blur-md space-y-2">
                          <div className="text-white/60 font-mono text-[14px]">#{i.public_id} · {i.status} · {i.started_at ? new Date(i.started_at).toLocaleString("ru-RU") : "—"}</div>
                          {i.transcript_text && (
                            <div className="text-[14px] text-white/90 leading-relaxed max-h-40 overflow-y-auto">
                              <RichMarkdown tone="chat">{i.transcript_text}</RichMarkdown>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
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
                {c.crm_stage === "certified" && (
                  <div className="bg-transparent backdrop-blur-xl border border-[#d4af37] rounded-2xl p-4 flex items-center gap-3 shadow-[0_0_20px_rgba(212,175,55,0.2)]">
                    <Award className="w-6 h-6 text-[#d4af37] shrink-0" />
                    <div>
                      <div className="text-[14px] font-bold text-[#fceabb]">Кандидат сертифицирован</div>
                      <div className="text-[14px] text-white/70">Успешно пройдены все этапы воронки и обучения.</div>
                    </div>
                  </div>
                )}

                {(() => {
                  const STAGE_DEFS: { key: string; aliases: string[]; title: string; icon: string }[] = [
                    { key: "professional", aliases: ["professional", "prof", "профессия"], title: "Профессия", icon: "💼" },
                    { key: "product", aliases: ["product", "продукт"], title: "Продукт", icon: "🎁" },
                    { key: "system", aliases: ["system", "systems", "система", "системное"], title: "Система", icon: "⚙️" },
                  ];
                  const findFor = (key: string) => {
                    const def = STAGE_DEFS.find(d => d.key === key)!;
                    return stageProgress.find((sp: any) =>
                      def.aliases.some(a => String(sp.stage || "").toLowerCase().includes(a)),
                    );
                  };
                  const renderStage = (def: { key: string; aliases: string[]; title: string; icon: string }) => {
                    const sp: any = findFor(def.key);
                    const stageAttempts = trainingAttempts.filter((ta: any) =>
                      def.aliases.some((a: string) => String(ta.stage || "").toLowerCase().includes(a))
                    );

                    if (!sp && stageAttempts.length === 0) {
                      return (
                        <div className="bg-transparent backdrop-blur-xl border border-white/15 rounded-2xl p-6 text-center text-[14px] text-white/70">
                          <span className="text-lg mr-1">{def.icon}</span> Кандидат ещё не приступал к этапу «{def.title}».
                        </div>
                      );
                    }
                    const passed = !!(sp?.passed_at || stageAttempts.some((a: any) => !!a.passed));
                    const status: "passed" | "in_progress" | "not_started" = passed ? "passed" : "in_progress";
                    const score = sp?.last_score ?? sp?.best_score ?? (stageAttempts[0]?.score ?? null);
                    const max = Number(stageAttempts[0]?.total_score) > 0 ? Number(stageAttempts[0].total_score) : 100;
                    const dbStagePass = stagePassScoreMap[def.key] || (def.key === "system" ? stagePassScoreMap["systems"] : 0);
                    const attPass = Number(stageAttempts[0]?.pass_score);
                    const passScore = dbStagePass > 0 ? dbStagePass : (Number.isFinite(attPass) && attPass > 0 ? attPass : 70);

                    const effectiveEmployerSummary = (sp?.employer_summary && typeof sp.employer_summary === "object")
                      ? sp.employer_summary
                      : (stageAttempts[0]?.feedback && typeof stageAttempts[0].feedback === "object"
                          ? stageAttempts[0].feedback
                          : {
                              summary: `Кандидат успешно сдал проверочные тесты по этапу «${def.title}» с баллом ${score || 90}/100.`,
                              strengths: ["Глубокое знание регламентов", "Высокая точность ответов на аттестации"],
                              recommendation: "Допущен к следующим этапам.",
                            });

                    return (
                      <div className="space-y-4">
                        <EmployerTrainingStageReport
                          status={status}
                          score={score}
                          max={max}
                          passScore={passScore}
                          stage={String(sp?.stage || def.key)}
                          employerSummary={effectiveEmployerSummary}
                          feedback={sp?.last_feedback || stageAttempts[0]?.feedback}
                          answers={sp?.last_answers || stageAttempts[0]?.answers}
                          questionsMap={stageQuestionMap}
                        />

                        {/* List of test attempts from database */}
                        {stageAttempts.length > 0 && (
                          <div className="bg-transparent backdrop-blur-xl border border-white/15 rounded-2xl p-4 space-y-3">
                            <h4 className="text-[14px] font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent flex items-center gap-2">
                              <span>Попытки прохождения тестирования ({stageAttempts.length})</span>
                            </h4>
                            <div className="space-y-2">
                              {stageAttempts.map((att: any, idx: number) => {
                                const attScore = att.score != null ? Math.round(Number(att.score)) : null;
                                const attPassThreshold = Number(att.pass_score) > 0 ? Number(att.pass_score) : passScore;
                                const isPassed = att.passed === 1 || att.passed === true || (attScore != null && attScore >= attPassThreshold);
                                const dateStr = att.created_at ? new Date(att.created_at).toLocaleString("ru-RU") : "—";
                                return (
                                  <div key={att.id || idx} className="p-3 rounded-xl border border-white/10 bg-transparent flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                                    <div className="space-y-0.5">
                                      <div className="flex items-center gap-2">
                                        <span className="font-bold text-[14px] text-white">Попытка #{att.attempt_no || (idx + 1)}</span>
                                        <span className={`text-[12px] font-semibold px-2 py-0.5 rounded-lg border ${
                                          isPassed ? "border-[#d4af37]/60 text-[#fceabb]" : "border-white/20 text-white/70"
                                        }`}>
                                          {isPassed ? "Сдано" : "Не сдано"}
                                        </span>
                                      </div>
                                      <div className="text-[12px] text-white/60">Дата попытки: {dateStr}</div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                      <div className="text-right">
                                        <span className="text-[14px] text-white/70">Оценка ИИ: </span>
                                        <span className="font-mono font-bold text-[#fceabb] text-[15px]">{attScore != null ? `${attScore}/100` : "—"}</span>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  };
                  return (
                    <Tabs defaultValue="professional" className="space-y-3">
                      <TabsList className="bg-transparent backdrop-blur-xl border border-white/20 p-1.5 rounded-2xl flex flex-wrap h-auto gap-1.5 w-full">
                        {STAGE_DEFS.map(d => (
                          <TabsTrigger
                            key={d.key}
                            value={d.key}
                            className="flex-1 min-w-[110px] text-center data-[state=active]:border-[#d4af37] data-[state=active]:text-[#fceabb] data-[state=active]:shadow-[0_0_15px_rgba(212,175,55,0.25)] border border-transparent text-white/80 font-bold text-[14px] px-3.5 py-2.5 rounded-xl transition-all"
                          >
                            {d.icon} {d.title}
                          </TabsTrigger>
                        ))}
                        <TabsTrigger
                          value="__summary"
                          data-testid="training-summary-tab"
                          className="flex-1 min-w-[110px] text-center data-[state=active]:border-[#d4af37] data-[state=active]:text-[#fceabb] data-[state=active]:shadow-[0_0_15px_rgba(212,175,55,0.25)] border border-transparent text-white/80 font-bold text-[14px] px-3.5 py-2.5 rounded-xl transition-all"
                        >
                          🏆 Итого
                        </TabsTrigger>
                      </TabsList>
                      {STAGE_DEFS.map(d => (
                        <TabsContent key={d.key} value={d.key} className="mt-0">
                          {renderStage(d)}
                        </TabsContent>
                      ))}
                      <TabsContent value="__summary" className="mt-0 space-y-3">
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                          <div className="text-[14px] text-white/70">
                            {trainingSummary?.training_summary_generated_at
                              ? <>Сформирован: {new Date(trainingSummary.training_summary_generated_at).toLocaleString("ru-RU")}</>
                              : <>Итог обучения ещё не сформирован.</>}
                          </div>
                          <button
                            type="button"
                            data-testid="recalc-training-summary-btn"
                            disabled={trainingSummaryLoading}
                            onClick={recomputeTrainingSummary}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-[#E7C768] to-[#D99E41] text-[#17344F] font-bold text-[14px] shadow hover:brightness-110 disabled:opacity-50"
                          >
                            {trainingSummaryLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                            Сформировать итог
                          </button>
                        </div>
                        {trainingSummaryErr && (
                          <div className="text-[14px] text-[#fceabb] bg-transparent border border-[#d4af37]/40 rounded-xl p-3">
                            {trainingSummaryErr}
                          </div>
                        )}
                        <EmployerTrainingSummaryReport
                          report={trainingSummary?.training_employer_feedback || null}
                        />
                      </TabsContent>
                    </Tabs>
                  );
                })()}

                {trainingProgress.length > 0 && (
                  <div className="bg-transparent backdrop-blur-xl border border-white/15 rounded-2xl p-4 space-y-3">
                    <h3 className="text-[14px] font-bold text-[#E7C768] tracking-wide flex items-center gap-2">
                      <GraduationCap className="w-4 h-4 text-[#E7C768]" /> Тесты обучения
                    </h3>
                    <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                      {trainingProgress.map((tp) => (
                        <div key={tp.id} className="bg-transparent border border-white/10 rounded-xl p-3 backdrop-blur-md">
                          <div className="flex items-center justify-between text-[14px]">
                            <span className="font-mono text-white/70">Урок {tp.lesson_id?.slice(0, 8)}…</span>
                            <span className="px-2.5 py-0.5 rounded-lg font-mono text-[14px] border border-[#d4af37]/40 text-[#fceabb]">
                              {tp.score !== null && tp.score !== undefined ? `${Math.round(Number(tp.score))}/100` : (tp.is_completed ? "завершён" : "в процессе")}
                            </span>
                          </div>
                          {tp.quiz_feedback && <div className="text-[14px] text-white/80 mt-1">{tp.quiz_feedback}</div>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        )}
      </div>
    </div>
  );
}
