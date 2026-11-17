// =============================================================================
// EmployerSituationsReport — отображение результатов ролевых ситуаций для работодателя
// Стиль: Apple Liquid Glass (прозрачные контейнеры, размытие, золотой градиент / белый текст, мин 14px)
// =============================================================================
import { type EmployerSituationsView } from "@/lib/feedbackAdapters";
import { scoreTone, formatScore } from "@/lib/scoreTone";

export type SituationDef = {
  id: string;
  title?: string;
  brief?: string;
};

type Props = {
  view: EmployerSituationsView;
  score?: number | null;
  situationDefs?: SituationDef[];
  situationAnswers?: Record<string, string>;
};

function SituationCard({
  index, title, score, max, prompt, answer, employerFeedback, evidence,
  recommendation, strengths, improvements,
}: {
  index: number; title?: string; score?: number; max?: number;
  prompt?: string; answer?: string; employerFeedback?: string; evidence?: string;
  recommendation?: string; strengths?: string[]; improvements?: string[];
}) {
  const itemMax = typeof max === "number" && max > 0 ? max : 100;
  const tone = scoreTone(score, itemMax);
  const headline = (title || "Ситуация").trim();
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
        {prompt && (
          <div className="text-[14px] text-slate-100 leading-[1.6] bg-transparent border border-white/15 rounded-xl p-3 backdrop-blur-xl">
            <div className="text-[14px] font-semibold text-[#E7C768] mb-1">Ситуация</div>
            <div className="whitespace-pre-wrap">{prompt}</div>
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
            <span className="text-[14px] font-semibold text-[#E7C768] mr-2">Сильные стороны:</span>
            <ul className="list-disc pl-5 space-y-1 mt-1">{strengths.map((s, i) => <li key={i}>{s}</li>)}</ul>
          </div>
        )}
        {improvements && improvements.length > 0 && (
          <div className="text-[14px] text-white/90 leading-[1.6] pl-3 border-l-2 border-white/30">
            <span className="text-[14px] font-semibold text-white mr-2">Недочёты:</span>
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
            <span className="font-semibold text-[#E7C768]">Что проверить: </span>{recommendation}
          </div>
        )}
      </div>
    </details>
  );
}

export default function EmployerSituationsReport({ view, score, situationDefs, situationAnswers }: Props) {
  if (view.kind === "empty") {
    return <div className="text-[14px] text-slate-300 italic">Разбор ситуаций ещё не готов.</div>;
  }

  const topScore = typeof score === "number" ? score : undefined;
  const headTone = scoreTone(topScore, 100);

  const defsById = new Map<string, SituationDef>();
  for (const d of situationDefs || []) {
    if (d && d.id) defsById.set(String(d.id), d);
  }
  const ansById = situationAnswers || {};

  if (view.kind === "legacy") {
    const text = typeof view.legacyRaw === "string"
      ? view.legacyRaw
      : "Результаты сохранены в устаревшем формате — детальный разбор недоступен.";
    return (
      <div className="space-y-3" data-testid="employer-situations-report">
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
    <div className="space-y-4" data-testid="employer-situations-report">
      {typeof topScore === "number" && (
        <div className={`text-3xl font-extrabold ${headTone.text}`}>{formatScore(topScore, 100)}</div>
      )}

      {/* Overall AI conclusion */}
      {view.summary && (
        <div className="bg-transparent border border-white/15 rounded-2xl p-5 text-[14px] leading-[1.6] text-white/95 backdrop-blur-xl shadow-lg">
          <div className="text-[14px] font-semibold text-[#E7C768] mb-1">Общий вывод по ситуациям</div>
          {view.summary}
        </div>
      )}

      {(view.competenciesDemonstrated.length > 0 || view.competenciesWeak.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {view.competenciesDemonstrated.length > 0 && (
            <section className="bg-transparent border border-[#E7C768]/40 rounded-2xl p-5 backdrop-blur-xl shadow-lg">
              <h4 className="text-[14px] font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#CBA335] bg-clip-text text-transparent mb-2">Сильные стороны</h4>
              <ul className="list-disc pl-5 text-[14px] text-white/95 leading-[1.6] space-y-1">
                {view.competenciesDemonstrated.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </section>
          )}
          {view.competenciesWeak.length > 0 && (
            <section className="bg-transparent border border-white/20 rounded-2xl p-5 backdrop-blur-xl shadow-lg">
              <h4 className="text-[14px] font-bold text-white mb-2">Слабые стороны</h4>
              <ul className="list-disc pl-5 text-[14px] text-white/90 leading-[1.6] space-y-1">
                {view.competenciesWeak.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </section>
          )}
        </div>
      )}
      {view.risks.length > 0 && (
        <section className="space-y-2">
          <h4 className="text-[14px] font-bold text-[#E7C768]">Профессиональные риски</h4>
          <div className="space-y-2">
            {view.risks.map((r, i) => (
              <article key={i} className="rounded-2xl border border-white/20 bg-transparent backdrop-blur-xl p-4">
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
          <h4 className="text-base font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#CBA335] bg-clip-text text-transparent">Разбор ситуаций</h4>
          <div className="space-y-3">
            {view.items.map((it, idx) => (
              <SituationCard
                key={it.situationId}
                index={idx}
                title={it.title || defsById.get(it.situationId)?.title}
                score={it.score}
                max={it.max}
                prompt={it.prompt || defsById.get(it.situationId)?.brief}
                answer={it.answer || ansById[it.situationId]}
                employerFeedback={it.employerFeedback}
                evidence={it.evidence}
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
