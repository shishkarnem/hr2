import { AlertTriangle, ShieldAlert, Check, ListChecks } from "lucide-react";
import { toStrArr, toObjArr } from "@/lib/normalizeArrays";
import { scoreTone, formatScore } from "@/lib/scoreTone";
import { mergeStageItems, deriveStageSummary, type StageQuestionMap } from "@/lib/trainingStageMerge";

type Item = { question_id: string; score: number; feedback?: string; evidence?: string };
type Risk = { title: string; evidence: string; severity?: string; how_to_verify?: string };

export type EmployerStageSummary = {
  summary?: string;
  strengths?: string[];
  gaps?: string[];
  risks?: Risk[];
  red_flags?: Risk[];
  items?: Item[];
  recommendation?: string;
};

function Section({ title, children }: { title: string; children: any }) {
  return (
    <div className="space-y-2">
      <div className="text-[14px] font-semibold text-[#E7C768]">{title}</div>
      {children}
    </div>
  );
}

type LegacyProps = {
  status: "passed" | "in_progress" | "not_started";
  score: number | null;
  max: number;
  passScore: number;
  /** Back-compat: pre-built per-question list. New code passes feedback+answers instead. */
  summary?: EmployerStageSummary | null;
  perQuestionLegacy?: any[];
  lastAnswers?: any[];
};

type MergeProps = {
  status: "passed" | "in_progress" | "not_started";
  score: number | null;
  max: number;
  passScore: number;
  /** Stage key (`professional` | `product` | `system` | aliases). */
  stage: string;
  /** Raw `candidate_stage_progress.employer_summary` jsonb, or null. */
  employerSummary?: unknown;
  /** Raw `candidate_stage_progress.last_feedback` jsonb (array of items). */
  feedback?: unknown;
  /** Raw `candidate_stage_progress.last_answers` jsonb (array of items). */
  answers?: unknown;
  /** Map produced by buildStageQuestionMap (training_stage_tests rows). */
  questionsMap?: StageQuestionMap | null;
};

export default function EmployerTrainingStageReport(props: LegacyProps | MergeProps) {
  const { status, score, max, passScore } = props;
  const isMerge = "stage" in props;

  const merged = isMerge
    ? mergeStageItems({
        stage: (props as MergeProps).stage,
        feedback: (props as MergeProps).feedback,
        answers: (props as MergeProps).answers,
        questionsMap: (props as MergeProps).questionsMap || null,
      })
    : [];

  const perQuestionLegacy = isMerge
    ? merged.map(it => ({
        id: it.id,
        question: it.question,
        score: it.score,
        max: it.max,
        comment: it.comment,
        recommendation: it.recommendation,
      }))
    : ((props as LegacyProps).perQuestionLegacy || []);

  const lastAnswers = isMerge
    ? merged.map(it => ({ question_id: it.id, value: it.answer }))
    : ((props as LegacyProps).lastAnswers || []);

  const rawSummary = isMerge
    ? (props as MergeProps).employerSummary
    : (props as LegacyProps).summary;
  const hasStructuredSummary =
    rawSummary && typeof rawSummary === "object" && !Array.isArray(rawSummary) &&
    (
      typeof (rawSummary as any).summary === "string" ||
      Array.isArray((rawSummary as any).strengths) ||
      Array.isArray((rawSummary as any).gaps) ||
      Array.isArray((rawSummary as any).risks) ||
      Array.isArray((rawSummary as any).red_flags)
    );

  const summary: EmployerStageSummary | null = hasStructuredSummary
    ? (rawSummary as EmployerStageSummary)
    : (isMerge ? deriveStageSummary(merged) : null);

  const statusBadge = status === "passed"
    ? "border border-[#E7C768]/60 text-[#E7C768] font-bold"
    : status === "in_progress" ? "border border-[#E7C768]/30 text-white font-medium" : "border border-white/20 text-slate-300";
  const statusText = status === "passed" ? "Сдан" : status === "in_progress" ? "В процессе" : "Не начат";

  const summaryText =
    summary && typeof summary === "object" && typeof (summary as any).summary === "string"
      ? (summary as any).summary
      : "";
  const strengths = toStrArr(summary?.strengths);
  const gaps = toStrArr(summary?.gaps);
  const risks = toObjArr<Risk>(summary?.risks, (s) => ({ title: s, evidence: "" }));
  const redFlags = toObjArr<Risk>(summary?.red_flags, (s) => ({ title: s, evidence: "" }));
  const recommendation =
    summary && typeof (summary as any).recommendation === "string"
      ? (summary as any).recommendation
      : "";

  return (
    <div className="bg-transparent backdrop-blur-xl border border-white/15 rounded-2xl p-5 space-y-4 shadow-lg" data-testid="emp-training-stage">
      <div className="flex items-center justify-between gap-3">
        <span className={`text-[14px] px-3 py-1 rounded-xl bg-transparent ${statusBadge}`}>{statusText}</span>
        <div className="text-base font-mono font-black text-white">
          {score != null ? `${Math.round(Number(score))}/${max}` : "—"}
          <span className="text-[14px] text-slate-300 ml-2 font-normal">проходной {passScore}</span>
        </div>
      </div>

      {summaryText && (
        <Section title="Общий вывод">
          <p className="text-[14px] text-white/95 leading-relaxed">{summaryText}</p>
        </Section>
      )}

      {strengths.length > 0 && (
        <Section title="Сильные стороны">
          <ul className="text-[14px] text-white/90 space-y-1 list-disc list-inside">
            {strengths.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </Section>
      )}

      {gaps.length > 0 && (
        <Section title="Пробелы в знаниях">
          <ul className="text-[14px] text-white/90 space-y-1 list-disc list-inside">
            {gaps.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </Section>
      )}

      {risks.length > 0 && (
        <Section title="Профессиональные риски">
          <div className="space-y-2">
            {risks.map((r, i) => (
              <div key={i} className="text-[14px] bg-transparent border border-white/20 rounded-xl p-3 backdrop-blur-xl">
                <div className="flex items-center gap-1.5 text-white font-semibold">
                  <AlertTriangle className="w-4 h-4 text-[#E7C768]" />{r.title}
                  {r.severity && <span className="ml-auto text-[14px] text-white/70 font-mono">{r.severity}</span>}
                </div>
                {r.evidence && <div className="text-slate-300 mt-1">{r.evidence}</div>}
                {r.how_to_verify && <div className="text-slate-400 mt-1 italic">Как проверить: {r.how_to_verify}</div>}
              </div>
            ))}
          </div>
        </Section>
      )}

      {redFlags.length > 0 && (
        <Section title="Красные флаги">
          <div className="space-y-2">
            {redFlags.map((r, i) => (
              <div key={i} className="text-[14px] bg-transparent border border-white/30 rounded-xl p-3 backdrop-blur-xl">
                <div className="flex items-center gap-1.5 text-white font-semibold">
                  <ShieldAlert className="w-4 h-4 text-white" />{r.title}
                </div>
                {r.evidence && <div className="text-slate-300 mt-1">{r.evidence}</div>}
              </div>
            ))}
          </div>
        </Section>
      )}

      {recommendation && (
        <Section title="Рекомендация">
          <div className="text-[14px] text-white/95 bg-transparent border border-white/20 rounded-xl p-3 flex items-start gap-2 backdrop-blur-xl">
            <Check className="w-4 h-4 mt-0.5 text-[#E7C768]" /><span>{recommendation}</span>
          </div>
        </Section>
      )}

      {Array.isArray(perQuestionLegacy) && perQuestionLegacy.length > 0 && (
        <Section title="Детальный разбор вопросов">
          <div className="space-y-2 max-h-[28rem] overflow-y-auto pr-1">
            {perQuestionLegacy.map((pq: any, idx: number) => {
              const ans = Array.isArray(lastAnswers)
                ? lastAnswers.find((a: any) => a.question_id === pq.id) : null;
              const itemMax = Number(pq.max) || 1;
              const tone = scoreTone(pq.score, itemMax);
              const qText = typeof pq.question === "string" ? pq.question : "";
              const short = qText && qText.length > 80 ? qText.slice(0, 80).trimEnd() + "…" : qText;
              const answerText = typeof ans?.value === "string"
                ? ans.value
                : (ans?.value != null ? String(ans.value) : "");
              return (
                <details
                  key={pq.id || idx}
                  className={`group rounded-xl border border-l-4 bg-transparent backdrop-blur-xl ${tone.bg} ${tone.border} overflow-hidden`}
                >
                  <summary className="cursor-pointer list-none px-3.5 py-2.5 flex items-center gap-2.5 select-none">
                    <span className="text-[14px] font-mono text-[#E7C768] shrink-0">
                      <ListChecks className="w-4 h-4 inline mr-1" />{idx + 1}.
                    </span>
                    <span className="text-[14px] font-semibold text-white leading-[1.4] flex-1 truncate">
                      {short || `Вопрос ${idx + 1}`}
                    </span>
                    <span className={`text-[14px] font-mono font-bold shrink-0 px-2 py-0.5 rounded-lg ${tone.badge}`}>
                      {pq.score != null ? formatScore(pq.score, itemMax) : "—"}
                    </span>
                    <span className="text-white/60 text-xs shrink-0 transition-transform group-open:rotate-180" aria-hidden>▾</span>
                  </summary>
                  <div className="px-3.5 pb-3.5 pt-2 space-y-2 border-t border-white/10 text-[14px]">
                    {qText && (
                      <div className="text-white leading-[1.5]">
                        <span className="text-[14px] font-semibold text-[#E7C768] mr-2">Вопрос:</span>
                        {qText}
                      </div>
                    )}
                    {answerText && (
                      <div className="text-slate-100 leading-[1.5] bg-transparent rounded-xl p-2.5 border border-white/10 backdrop-blur-xl">
                        <span className="text-[14px] font-semibold text-white mr-2">Ответ:</span>
                        <span className="whitespace-pre-wrap">{answerText}</span>
                      </div>
                    )}
                    {pq.comment && (
                      <div className={`italic ${tone.text} leading-[1.5]`}>
                        <span className="not-italic text-[14px] font-semibold text-[#E7C768] mr-2">Оценка ИИ:</span>
                        {pq.comment}
                      </div>
                    )}
                    {pq.recommendation && (
                      <div className="text-white bg-transparent border border-white/15 rounded-xl p-2.5 leading-[1.5] backdrop-blur-xl">
                        <span className="font-semibold text-[#E7C768]">Рекомендация: </span>{pq.recommendation}
                      </div>
                    )}
                  </div>
                </details>
              );
            })}
          </div>
        </Section>
      )}
    </div>
  );
}