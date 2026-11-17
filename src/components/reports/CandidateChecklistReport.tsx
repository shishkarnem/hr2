// =============================================================================
// CandidateChecklistReport — безопасное отображение результатов чек-листа
// 4 блока: Результат с описанием, Плюсы, Минусы, Результаты по каждому вопросу
// Стиль: Apple Liquid Glass (прозрачный фон, размытие, золотой градиент / белый текст, мин 14px)
// =============================================================================
import { type CandidateChecklistView } from "@/lib/feedbackAdapters";

type Props = {
  view: CandidateChecklistView;
  score?: number | null;
};

export default function CandidateChecklistReport({ view, score }: Props) {
  if (view.kind === "empty") {
    return (
      <div className="text-[14px] text-white/70 italic p-4 bg-transparent border border-white/15 rounded-2xl backdrop-blur-xl">
        Подробный разбор чек-листа ещё не сформирован.
      </div>
    );
  }

  if (view.kind === "legacy_text") {
    return (
      <div className="space-y-4">
        {typeof score === "number" && (
          <div className="text-3xl font-extrabold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#CBA335] bg-clip-text text-transparent">
            {score}/100
          </div>
        )}
        <div className="bg-transparent border border-white/15 rounded-2xl p-5 text-[14px] leading-[1.6] text-white/90 whitespace-pre-wrap backdrop-blur-xl">
          {view.legacyText}
        </div>
      </div>
    );
  }

  // Derive score from items if not provided
  let derived: number | undefined = typeof score === "number" ? score : undefined;
  if (view.items.length > 0) {
    let sum = 0;
    let maxSum = 0;
    for (const it of view.items) {
      if (typeof it.score !== "number") continue;
      const m = it.max && it.max > 0 ? it.max : 5;
      sum += it.score;
      maxSum += m;
    }
    if (maxSum > 0) derived = Math.round((sum / maxSum) * 100);
  }

  return (
    <div className="space-y-4" data-testid="candidate-checklist-report">
      {/* Блок 1: Результат с описанием */}
      <section className="bg-transparent border border-white/15 rounded-2xl p-5 space-y-3 backdrop-blur-xl shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-base font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#CBA335] bg-clip-text text-transparent">
            Результат по чек-листу
          </span>
          {typeof derived === "number" && (
            <span className="text-2xl font-extrabold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#CBA335] bg-clip-text text-transparent">
              {derived}/100
            </span>
          )}
        </div>
        {view.summary && (
          <p className="text-[14px] leading-[1.6] text-white/90">
            {view.summary}
          </p>
        )}
      </section>

      {/* Блоки 2 и 3: Плюсы и Минусы */}
      {(view.strengths.length > 0 || view.areasToImprove.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Блок 2: Плюсы */}
          {view.strengths.length > 0 && (
            <section className="bg-transparent border border-[#E7C768]/40 rounded-2xl p-5 space-y-2.5 backdrop-blur-xl shadow-lg">
              <h4 className="text-[14px] font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#CBA335] bg-clip-text text-transparent">
                Плюсы (сильные стороны)
              </h4>
              <ul className="list-disc pl-5 text-[14px] text-white/95 leading-[1.6] space-y-1.5">
                {view.strengths.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </section>
          )}

          {/* Блок 3: Минусы */}
          {view.areasToImprove.length > 0 && (
            <section className="bg-transparent border border-white/20 rounded-2xl p-5 space-y-2.5 backdrop-blur-xl shadow-lg">
              <h4 className="text-[14px] font-bold text-white">
                Минусы (зоны роста)
              </h4>
              <ul className="list-disc pl-5 text-[14px] text-white/90 leading-[1.6] space-y-1.5">
                {view.areasToImprove.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      {/* Блок 4: Результаты по каждому пункту чек-листа */}
      {view.items.length > 0 && (
        <section className="space-y-3 pt-1">
          <h4 className="text-base font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#CBA335] bg-clip-text text-transparent">
            Результаты по каждому вопросу чек-листа ({view.items.length})
          </h4>
          <div className="space-y-3">
            {view.items.map((it, idx) => {
              const maxScore = it.max && it.max > 0 ? it.max : 5;
              const hasScore = typeof it.score === "number";
              const verdictLabel =
                it.verdict === "correct"
                  ? "Верно"
                  : it.verdict === "partial"
                  ? "Частично верно"
                  : it.verdict === "wrong"
                  ? "Требует улучшения"
                  : null;

              return (
                <article
                  key={it.questionId || idx}
                  className="bg-transparent border border-white/15 rounded-2xl p-5 space-y-2.5 backdrop-blur-xl shadow-md"
                >
                  <header className="flex items-start justify-between gap-3">
                    <div className="text-[14px] font-semibold text-white leading-[1.5]">
                      <span className="text-[#E7C768] font-bold mr-1.5">{idx + 1}.</span>
                      {it.question || `Вопрос #${idx + 1}`}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {verdictLabel && (
                        <span className="text-[14px] px-2.5 py-0.5 rounded-lg border border-white/20 text-white/90 font-medium">
                          {verdictLabel}
                        </span>
                      )}
                      {hasScore && (
                        <span className="text-[14px] font-bold px-2.5 py-0.5 rounded-lg border border-[#E7C768]/50 bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#CBA335] bg-clip-text text-transparent">
                          {it.score} / {maxScore}
                        </span>
                      )}
                    </div>
                  </header>

                  {it.feedback && (
                    <div className="text-[14px] text-white/90 leading-[1.6]">
                      <span className="text-[#E7C768] font-semibold">Оценка ИИ: </span>
                      {it.feedback}
                    </div>
                  )}

                  {it.what_was_right && (
                    <div className="text-[14px] text-white/95 leading-[1.6] pl-3 border-l-2 border-[#E7C768]/60">
                      <span className="font-semibold text-[#E7C768]">Что было верно: </span>
                      {it.what_was_right}
                    </div>
                  )}

                  {it.what_was_wrong && (
                    <div className="text-[14px] text-white/85 leading-[1.6] pl-3 border-l-2 border-white/30">
                      <span className="font-semibold text-white">Что улучшить: </span>
                      {it.what_was_wrong}
                    </div>
                  )}

                  {it.recommendation && !it.what_was_wrong && (
                    <div className="text-[14px] text-white/85 leading-[1.6] pl-3 border-l-2 border-white/30">
                      <span className="font-semibold text-white">Рекомендация: </span>
                      {it.recommendation}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}