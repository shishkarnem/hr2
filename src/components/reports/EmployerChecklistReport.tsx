// =============================================================================
// EmployerChecklistReport — отображение результатов чек-листа для работодателя
// Стиль: Apple Liquid Glass (прозрачные контейнеры, размытие, золотой градиент / белый текст, мин 14px)
// =============================================================================
import { type EmployerChecklistView } from "@/lib/feedbackAdapters";
import { scoreTone, formatScore } from "@/lib/scoreTone";

type Props = {
  view: EmployerChecklistView;
  score?: number | null;
};

function severityCls(sev?: string): string {
  const s = (sev || "").toLowerCase();
  if (s === "high" || s.includes("выс")) return "bg-transparent border border-[#E7C768]/60 text-white";
  return "bg-transparent border border-white/20 text-white";
}

/**
 * Разбор по каждому вопросу чек-листа в виде аккордеона.
 */
function QuestionCard({
  index, question, score, max, employerFeedback, evidence, answer,
  recommendation, strengths, improvements,
}: {
  index: number; question?: string; score?: number; max?: number;
  employerFeedback?: string; evidence?: string; answer?: string;
  recommendation?: string; strengths?: string[]; improvements?: string[];
}) {
  const itemMax = typeof max === "number" && max > 0 ? max : 5;
  const tone = scoreTone(score, itemMax);
  const headline = (question || "Вопрос").trim();
  const short = headline.length > 80 ? headline.slice(0, 80).trimEnd() + "…" : headline;

  return (
    <details className={`group rounded-2xl border border-l-4 ${tone.bg} ${tone.border} bg-transparent backdrop-blur-xl overflow-hidden`}>
      <summary className="cursor-pointer list-none px-4 py-3 flex items-center gap-3 select-none">
        <span className="text-[14px] font-mono text-[#E7C768] shrink-0 w-6">{index + 1}.</span>
        <span className="text-[14px] font-semibold text-white leading-[1.4] flex-1">{short}</span>
        {typeof score === "number" && (
          <span className={`text-[14px] font-mono font-bold shrink-0 px-2.5 py-0.5 rounded-lg ${tone.badge}`}>
            {formatScore(score, itemMax)}
          </span>
        )}
        <span className="text-white/60 text-sm shrink-0 transition-transform group-open:rotate-180" aria-hidden>▾</span>
      </summary>
      <div className="px-4 pb-4 pt-2 space-y-3 border-t border-white/10">
        {question && short !== headline && (
          <div className="text-[14px] text-white/90 leading-[1.6]">
            <span className="text-[14px] font-semibold text-[#E7C768] mr-2">Вопрос:</span>
            {question}
          </div>
        )}
        {answer && (
          <div className="text-[14px] text-slate-100 leading-[1.6] bg-transparent border border-white/15 rounded-xl p-3 backdrop-blur-xl">
            <div className="text-[14px] font-semibold text-white mb-1">Ответ кандидата</div>
            <div className="whitespace-pre-wrap">{answer}</div>
          </div>
        )}
        {employerFeedback && (
          <div className="text-[14px] text-white/90 leading-[1.6]">
            <span className="text-[14px] font-semibold text-[#E7C768] mr-2">Комментарий ИИ:</span>
            {employerFeedback}
          </div>
        )}
        {strengths && strengths.length > 0 && (
          <div className="text-[14px] text-white leading-[1.6] pl-3 border-l-2 border-[#E7C768]/60">
            <span className="text-[14px] font-semibold text-[#E7C768] mr-2">Сильные ответы:</span>
            <ul className="list-disc pl-5 space-y-1 mt-1">{strengths.map((s, i) => <li key={i}>{s}</li>)}</ul>
          </div>
        )}
        {improvements && improvements.length > 0 && (
          <div className="text-[14px] text-white/90 leading-[1.6] pl-3 border-l-2 border-white/30">
            <span className="text-[14px] font-semibold text-white mr-2">Что улучшить:</span>
            <ul className="list-disc pl-5 space-y-1 mt-1">{improvements.map((s, i) => <li key={i}>{s}</li>)}</ul>
          </div>
        )}
        {evidence && (
          <div className="text-[14px] text-slate-200 leading-[1.6]">
            <span className="font-semibold text-white">Свидетельство: </span>{evidence}
          </div>
        )}
        {recommendation && (
          <div className="text-[14px] text-white leading-[1.6] bg-transparent border border-white/15 rounded-xl p-3 backdrop-blur-xl">
            <span className="font-semibold text-[#E7C768]">Рекомендация: </span>{recommendation}
          </div>
        )}
      </div>
    </details>
  );
}

export default function EmployerChecklistReport({ view, score }: Props) {
  if (view.kind === "empty") {
    return <div className="text-[14px] text-slate-300 italic">Разбор анкеты ещё не готов.</div>;
  }

  let derived: number | undefined = typeof score === "number" ? score : undefined;
  if (view.kind === "structured" && view.items.length > 0) {
    let sum = 0; let maxSum = 0;
    for (const it of view.items) {
      if (typeof it.score !== "number") continue;
      const m = it.max && it.max > 0 ? it.max : 5;
      sum += it.score; maxSum += m;
    }
    if (maxSum > 0) derived = Math.round((sum / maxSum) * 100);
  }
  const headTone = scoreTone(derived, 100);

  if (view.kind === "legacy") {
    const text = typeof view.legacyRaw === "string"
      ? view.legacyRaw
      : "Результаты сохранены в устаревшем формате — детальный разбор недоступен.";
    return (
      <div className="space-y-3" data-testid="employer-checklist-report">
        {typeof score === "number" && (
          <div className={`text-3xl font-extrabold ${headTone.text}`}>{formatScore(score, 100)}</div>
        )}
        <div className="bg-transparent border border-white/15 rounded-2xl p-5 text-[14px] leading-[1.6] text-white/90 whitespace-pre-wrap backdrop-blur-xl">
          {text}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="employer-checklist-report">
      {typeof derived === "number" && (
        <div className={`text-3xl font-extrabold ${headTone.text}`}>{formatScore(derived, 100)}</div>
      )}
      {view.summary && (
        <div className="bg-transparent border border-white/15 rounded-2xl p-5 text-[14px] leading-[1.6] text-white/95 backdrop-blur-xl shadow-lg">
          {view.summary}
        </div>
      )}
      {view.strengths.length > 0 && (
        <section className="bg-transparent border border-[#E7C768]/40 rounded-2xl p-5 backdrop-blur-xl shadow-lg">
          <h4 className="text-[14px] font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#CBA335] bg-clip-text text-transparent mb-2">Сильные стороны</h4>
          <ul className="list-disc pl-5 text-[14px] text-white/95 leading-[1.6] space-y-1">
            {view.strengths.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </section>
      )}
      {view.gaps.length > 0 && (
        <section className="bg-transparent border border-white/20 rounded-2xl p-5 backdrop-blur-xl shadow-lg">
          <h4 className="text-[14px] font-bold text-white mb-2">Пробелы и расхождения</h4>
          <ul className="space-y-2 text-[14px] text-white/90 leading-[1.6]">
            {view.gaps.map((g, i) => (
              <li key={i}>
                <span className="font-bold text-[#E7C768]">{g.criterion}: </span>{g.finding}
                {g.impact && <span className="text-white/70"> · {g.impact}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
      {view.risks.length > 0 && (
        <section className="space-y-2">
          <h4 className="text-[14px] font-bold text-[#E7C768]">Риски</h4>
          <div className="space-y-2">
            {view.risks.map((r, i) => (
              <article key={i} className={`rounded-2xl border p-4 backdrop-blur-xl ${severityCls(r.severity)}`}>
                <div className="text-[14px] font-bold text-white">{r.title}</div>
                <div className="text-[14px] mt-1.5 leading-[1.6] text-white/90"><span className="font-semibold text-[#E7C768]">Подтверждение: </span>{r.evidence}</div>
                {r.severity && <div className="text-[14px] mt-1 text-white/70">Серьёзность: {r.severity}</div>}
                {r.howToVerify && <div className="text-[14px] mt-1 leading-[1.6] text-white/90"><span className="font-semibold text-white">Как проверить: </span>{r.howToVerify}</div>}
              </article>
            ))}
          </div>
        </section>
      )}
      {view.redFlags.length > 0 && (
        <section className="space-y-2">
          <h4 className="text-[14px] font-bold text-white">Красные флаги</h4>
          <div className="space-y-2">
            {view.redFlags.map((r, i) => (
              <article key={i} className="rounded-2xl border border-white/30 bg-transparent backdrop-blur-xl p-4">
                <div className="text-[14px] font-bold text-white">{r.title}</div>
                <div className="text-[14px] mt-1.5 leading-[1.6] text-white/90"><span className="font-semibold text-[#E7C768]">Подтверждение: </span>{r.evidence}</div>
                {r.severity && <div className="text-[14px] mt-1 text-white/70">Серьёзность: {r.severity}</div>}
              </article>
            ))}
          </div>
        </section>
      )}
      {view.items.length > 0 && (
        <section className="space-y-3 pt-1">
          <h4 className="text-base font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#CBA335] bg-clip-text text-transparent">Разбор по вопросам</h4>
          <div className="space-y-3">
            {view.items.map((it, idx) => (
              <QuestionCard
                key={it.questionId}
                index={idx}
                question={it.question}
                score={it.score}
                max={it.max}
                employerFeedback={it.employerFeedback}
                evidence={it.evidence}
                answer={it.answer}
                recommendation={it.recommendation}
                strengths={it.strengths}
                improvements={it.improvements}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
