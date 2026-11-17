/**
 * Employer-facing OVERALL evaluation — compact one-screen management summary.
 * Стиль: Apple Liquid Glass (прозрачные контейнеры, размытие, золотой градиент / белый текст, мин 14px)
 */
import React, { useMemo } from "react";

type AnyObj = Record<string, any>;

const STAGE_LABEL: Record<string, string> = {
  resume: "Резюме",
  checklist: "Анкета",
  situations: "Ситуации",
  training: "Обучение",
};
const stageRu = (s: unknown): string => {
  const key = String(s ?? "").trim().toLowerCase();
  return STAGE_LABEL[key] || (key ? key[0].toUpperCase() + key.slice(1) : "—");
};

function tone(score: number | null | undefined): { cls: string; bg: string } {
  if (score == null || !Number.isFinite(Number(score))) {
    return { cls: "text-slate-200", bg: "bg-transparent border border-white/10" };
  }
  const n = Number(score);
  if (n >= 80) return { cls: "bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#CBA335] bg-clip-text text-transparent font-extrabold", bg: "bg-transparent border border-[#E7C768]/40" };
  if (n >= 60) return { cls: "text-white font-bold", bg: "bg-transparent border border-[#E7C768]/30" };
  return { cls: "text-white font-bold", bg: "bg-transparent border border-white/20" };
}

function asArr(v: unknown): any[] { return Array.isArray(v) ? v : []; }
function asStr(v: unknown): string { return typeof v === "string" ? v : (v == null ? "" : String(v)); }

/** Sentence-aware shortener. Returns a fully formed sentence (or set of
 *  sentences) whose total length is ≤ max. Never appends ellipsis and never
 *  cuts mid-word. The full text remains available inside the collapsed
 *  «Подробный AI-разбор» accordion. */
function shortenToSentence(s: string, max: number): string {
  const t = (s || "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  if (t.length <= max) return t;

  const sentences = t.match(/[^.!?]+[.!?]+/g);
  if (sentences && sentences.length > 0) {
    let out = "";
    for (const raw of sentences) {
      const sent = raw.trim();
      const next = out ? out + " " + sent : sent;
      if (next.length > max) break;
      out = next;
    }
    if (out) return out;
  }
  const words = t.split(" ");
  let acc = "";
  for (const w of words) {
    const next = acc ? acc + " " + w : w;
    if (next.length > max - 1) break;
    acc = next;
  }
  if (!acc) acc = words[0].slice(0, Math.max(1, max - 1));
  return acc.replace(/[ ,;:\-–—]+$/, "") + ".";
}

/** Short single-line shaper for list items (strengths / risks). */
function shortLine(s: string, max: number): string {
  const t = asStr(s).replace(/\s+/g, " ").trim();
  if (!t) return "";
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const stop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  if (stop > max * 0.4) return cut.slice(0, stop + 1).trim();
  const words = cut.split(" ");
  words.pop();
  return words.join(" ").replace(/[ ,;:\-–—]+$/, "") + ".";
}

const FORBIDDEN_INTAKE_RE =
  /(финальн\w*\s+интервью|повторн\w*\s+интервью|дополнительн\w*\s+интервью|перепровер|повторн\w*\s+оценк|ролев\w*\s+игр|холодн\w*\s+звон|кейс-?интервью|тест(овое)?\s+задани|проверк\w*\s+компетенц|переоцен)/i;
const ORG_INTAKE_RE =
  /(мотивац|выход|оффер|оклад|зарплат|финанс|вознагражд|компенсац|график|формат|удал[её]н|гибрид|офис|переезд|релокац|услови|контракт|оформл|испытательн|бенефит|соц-?пакет)/i;

function isOrgIntake(s: unknown): boolean {
  const t = asStr(s).trim();
  if (!t) return false;
  if (FORBIDDEN_INTAKE_RE.test(t)) return false;
  return ORG_INTAKE_RE.test(t);
}

const PRACTICAL_DEFAULT = [
  "Мотивация перехода и ожидания от роли.",
  "Дата возможного выхода и финансовые ожидания.",
  "График, формат работы и организационные условия.",
];

const SubTitle = ({ children, color = "text-[#E7C768]" }: { children: React.ReactNode; color?: string }) => (
  <div className={`text-[14px] font-semibold ${color} mb-1.5`}>{children}</div>
);

const MetricChip = ({ label, value, toneCls = "text-white", testId }: {
  label: string; value: React.ReactNode; toneCls?: string; testId?: string;
}) => (
  <div data-testid={testId} className="rounded-2xl px-4 py-3 bg-transparent backdrop-blur-xl border border-white/15 min-w-0">
    <div className="text-[14px] font-medium text-slate-300">{label}</div>
    <div className={`text-base font-mono font-black ${toneCls}`}>{value}</div>
  </div>
);

function verdictTone(v: string): string {
  const s = v.toLowerCase();
  if (s.includes("высок") || s.includes("частичн")) return "bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#CBA335] bg-clip-text text-transparent font-extrabold";
  return "text-white font-extrabold";
}

function pickMainReason(f: AnyObj): string | null {
  const risks = asArr(f.risks);
  const gaps = asArr(f.gaps);
  const strengths = asArr(f.strengths);
  const matches = asArr(f.matches).filter((m) => m && m.degree === "полностью");
  const high = risks.find((r) => asStr(r?.severity).toLowerCase().includes("высок"));
  if (high?.title) return `Критический риск: ${asStr(high.title)}`;
  if (risks[0]?.title) return `Ключевой риск: ${asStr(risks[0].title)}`;
  if (gaps[0]?.criterion) return `Не подтверждено: ${asStr(gaps[0].criterion)}`;
  if (matches[0]?.criterion) return `Сильное соответствие: ${asStr(matches[0].criterion)}`;
  if (typeof strengths[0] === "string" && strengths[0]) return `Сильная сторона: ${strengths[0]}`;
  return null;
}

export default function EmployerOverallReport({
  fitScore, overallScore, employerFeedback,
}: {
  fitScore: number | null | undefined;
  overallScore: number | null | undefined;
  employerFeedback: AnyObj | null | undefined;
}) {
  if (!employerFeedback || typeof employerFeedback !== "object" || Array.isArray(employerFeedback)) {
    return (
      <div
        data-testid="overall-employer-empty"
        className="bg-transparent backdrop-blur-xl border border-white/15 rounded-2xl p-6 text-center text-[14px] text-slate-300 space-y-1 shadow-lg"
      >
        <div>Общая AI-оценка ещё не сформирована.</div>
        <div className="text-[14px] text-slate-400">
          Нажмите «Пересчитать AI-оценку», чтобы запустить совокупный анализ кандидата.
        </div>
      </div>
    );
  }

  const f = employerFeedback;

  const view = useMemo(() => {
    const stageSummary = asArr(f.stage_summary);
    const matches = asArr(f.matches);
    const gaps = asArr(f.gaps);
    const risks = asArr(f.risks);
    const redFlags = asArr(f.red_flags);
    const strengths = asArr(f.strengths).map(asStr).filter(Boolean);
    const interviewFocus = asArr(f.interview_focus).map(asStr).filter(Boolean);
    const fullMatches = matches.filter((m) => m && m.degree === "полностью");
    const partial = matches.filter((m) => m && m.degree === "частично");
    const recRaw = asStr(f.recommendation) || asStr(f.executive_summary);
    const intakeOrg = interviewFocus.filter(isOrgIntake);
    const topIntake = (intakeOrg.length > 0 ? intakeOrg : PRACTICAL_DEFAULT).slice(0, 3);
    return {
      stageSummary, fullMatches, partial, gaps, risks, redFlags, strengths,
      interviewFocus, intakeOrg,
      recommendationShort: shortenToSentence(recRaw, 280),
      executiveSummary: asStr(f.executive_summary),
      recommendationFull: asStr(f.recommendation),
      verdict: asStr(f.verdict).trim(),
      mainReason: pickMainReason(f),
      topStrengths: strengths.slice(0, 3).map((s) => shortLine(s, 140)),
      topRisks: risks.slice(0, 3),
      topIntake: topIntake.map((s) => shortLine(s, 140)),
      topFull: fullMatches.slice(0, 3),
      topPartial: partial.slice(0, 3),
      topGaps: gaps.slice(0, 3),
      countFull: fullMatches.length,
      countPartial: partial.length,
      countGaps: gaps.length,
      wishes: asArr(f.employer_wishes_alignment),
    };
  }, [f]);

  const fitTone = tone(fitScore ?? null);
  const avgTone = tone(overallScore ?? null);
  const fitNum = fitScore != null && Number.isFinite(Number(fitScore)) ? Math.round(Number(fitScore)) : null;
  const avgNum = overallScore != null && Number.isFinite(Number(overallScore)) ? Math.round(Number(overallScore)) : null;

  const hasReqStats = view.countFull + view.countPartial + view.countGaps > 0;

  return (
    <div data-testid="overall-employer-report" className="space-y-4">
      {/* 1. Top row — exactly 3 metric chips: fit, avg, verdict. */}
      <div data-testid="overall-metrics-row" className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <MetricChip
          testId="ai-fit-score-card"
          label="AI-оценка"
          value={fitNum != null ? `${fitNum}/100` : "—"}
          toneCls={fitTone.cls}
        />
        <MetricChip
          testId="avg-stage-score-card"
          label="Средний балл этапов"
          value={avgNum != null ? `${avgNum}/100` : "—"}
          toneCls={avgTone.cls}
        />
        <MetricChip
          testId="verdict-card"
          label="Вердикт"
          value={view.verdict || "—"}
          toneCls={verdictTone(view.verdict)}
        />
      </div>

      {/* 2. Вывод по кандидату — verdict + ≤280-char sentence + 1-line main reason. */}
      <div data-testid="overall-verdict-card" className="bg-transparent border border-[#E7C768]/30 rounded-2xl p-5 backdrop-blur-xl shadow-lg">
        <SubTitle>Вывод по кандидату</SubTitle>
        <div className="mb-2">
          <span className={`text-[14px] font-extrabold ${verdictTone(view.verdict)}`}>
            {view.verdict || "Вердикт не сформулирован"}
          </span>
        </div>
        {view.recommendationShort && (
          <p data-testid="overall-verdict-text" className="text-[14px] text-white/95 leading-relaxed">
            {view.recommendationShort}
          </p>
        )}
        {view.mainReason && (
          <div className="text-[14px] text-slate-300 mt-2">
            <span className="text-[#E7C768]">Главная причина: </span>{view.mainReason}
          </div>
        )}
      </div>

      {/* 3. Главное — 2 columns: strengths + risks. */}
      {(view.topStrengths.length > 0 || view.topRisks.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {view.topStrengths.length > 0 && (
            <div data-testid="block-strengths" className="bg-transparent border border-[#E7C768]/40 rounded-2xl p-4 backdrop-blur-xl shadow-md">
              <SubTitle color="text-[#E7C768]">Сильные стороны</SubTitle>
              <ul className="text-[14px] text-white list-disc pl-5 space-y-1">
                {view.topStrengths.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </div>
          )}
          {view.topRisks.length > 0 && (
            <div data-testid="block-risks" className="bg-transparent border border-white/20 rounded-2xl p-4 backdrop-blur-xl shadow-md">
              <SubTitle color="text-white">Основные риски</SubTitle>
              <ul className="text-[14px] text-white list-disc pl-5 space-y-1">
                {view.topRisks.map((r, i) => (
                  <li key={i}>{shortLine(asStr(r?.title) || "Риск", 140)}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* 4. «Что уточнить при знакомстве» — compact card BELOW, not a 3rd column. */}
      <div data-testid="block-intake" className="bg-transparent border border-white/15 rounded-2xl p-4 backdrop-blur-xl shadow-md">
        <SubTitle>Что уточнить при знакомстве</SubTitle>
        <ul className="text-[14px] text-white list-disc pl-5 space-y-1">
          {view.topIntake.map((s, i) => <li key={i}>{s}</li>)}
        </ul>
      </div>

      {/* 5. Соответствие требованиям — single compact stats line (numbers only). */}
      {hasReqStats && (
        <div data-testid="match-stats" className="bg-transparent border border-white/15 rounded-2xl p-4 backdrop-blur-xl shadow-md">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
            <SubTitle>Соответствие требованиям</SubTitle>
            <span data-testid="match-stats-full" className="inline-flex items-center gap-1.5 text-[14px]">
              <span className="w-2.5 h-2.5 rounded-full bg-[#E7C768]" aria-hidden />
              <span className="text-slate-300">подтверждено:</span>
              <b className="text-[#E7C768] font-mono">{view.countFull}</b>
            </span>
            <span data-testid="match-stats-partial" className="inline-flex items-center gap-1.5 text-[14px]">
              <span className="w-2.5 h-2.5 rounded-full bg-white/60" aria-hidden />
              <span className="text-slate-300">частично:</span>
              <b className="text-white font-mono">{view.countPartial}</b>
            </span>
            <span data-testid="match-stats-gaps" className="inline-flex items-center gap-1.5 text-[14px]">
              <span className="w-2.5 h-2.5 rounded-full bg-white/30" aria-hidden />
              <span className="text-slate-300">не подтверждено:</span>
              <b className="text-white font-mono">{view.countGaps}</b>
            </span>
          </div>
        </div>
      )}

      {/* 6. Single collapsed accordion with the full saved payload. */}
      <details data-testid="overall-details" className="group bg-transparent border border-white/15 rounded-2xl backdrop-blur-xl shadow-md">
        <summary className="cursor-pointer select-none px-5 py-3.5 text-[14px] font-bold text-[#E7C768] flex items-center justify-between">
          <span>Подробный AI-разбор</span>
          <span className="text-[14px] text-slate-300 group-open:hidden">раскрыть</span>
          <span className="text-[14px] text-slate-300 hidden group-open:inline">свернуть</span>
        </summary>
        <div className="px-5 pb-5 pt-1 space-y-3">
          {view.stageSummary.length > 0 && (
            <details className="bg-transparent border border-white/15 rounded-xl backdrop-blur-xl">
              <summary className="cursor-pointer px-4 py-2.5 text-[14px] font-bold text-slate-200">
                Результаты по этапам
              </summary>
              <div className="px-4 pb-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                {view.stageSummary.map((st: any, i: number) => {
                  const t = tone(st?.score);
                  return (
                    <div key={i} className={`rounded-xl p-3.5 border ${t.bg}`}>
                      <div className="flex justify-between items-baseline gap-2">
                        <div className="text-[14px] font-bold text-slate-200">{stageRu(st?.stage)}</div>
                        <div className={`text-[14px] font-mono font-black ${t.cls}`}>
                          {st?.score != null ? `${Math.round(Number(st.score))}/100` : "—"}
                        </div>
                      </div>
                      {st?.conclusion && <div className="text-[14px] text-white/95 mt-1">{asStr(st.conclusion)}</div>}
                      {Array.isArray(st?.key_evidence) && st.key_evidence.length > 0 && (
                        <ul className="text-[14px] text-slate-300 list-disc pl-5 mt-1 space-y-0.5">
                          {st.key_evidence.map((e: string, j: number) => <li key={j}>{asStr(e)}</li>)}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            </details>
          )}

          {view.fullMatches.length > 0 && (
            <details className="bg-transparent border border-[#E7C768]/30 rounded-xl backdrop-blur-xl">
              <summary className="cursor-pointer px-4 py-2.5 text-[14px] font-bold text-[#E7C768]">
                Полное соответствие требованиям
              </summary>
              <ul className="px-4 pb-4 text-[14px] text-white space-y-1.5">
                {view.fullMatches.map((m, i) => (
                  <li key={i}>
                    <b>{asStr(m?.criterion)}</b>{m?.evidence ? <> — <span className="text-slate-200">{asStr(m.evidence)}</span></> : null}
                    {m?.source && <div className="text-[14px] text-slate-400">Источник: {stageRu(m.source)}</div>}
                  </li>
                ))}
              </ul>
            </details>
          )}

          {view.partial.length > 0 && (
            <details className="bg-transparent border border-white/20 rounded-xl backdrop-blur-xl">
              <summary className="cursor-pointer px-4 py-2.5 text-[14px] font-bold text-white">
                Частичное соответствие
              </summary>
              <ul className="px-4 pb-4 text-[14px] text-white space-y-1.5">
                {view.partial.map((m, i) => (
                  <li key={i}>
                    <b>{asStr(m?.criterion)}</b>{m?.evidence ? <> — <span className="text-slate-200">{asStr(m.evidence)}</span></> : null}
                    {m?.source && <div className="text-[14px] text-slate-400">Источник: {stageRu(m.source)}</div>}
                  </li>
                ))}
              </ul>
            </details>
          )}

          {view.gaps.length > 0 && (
            <details className="bg-transparent border border-white/20 rounded-xl backdrop-blur-xl">
              <summary className="cursor-pointer px-4 py-2.5 text-[14px] font-bold text-white">
                Несоответствия
              </summary>
              <ul className="px-4 pb-4 text-[14px] text-white space-y-1.5">
                {view.gaps.map((g, i) => (
                  <li key={i}>
                    <b>{asStr(g?.criterion)}</b>{g?.finding ? <> — {asStr(g.finding)}</> : null}
                    {g?.impact && <div className="text-[14px] text-slate-300">Влияние: {asStr(g.impact)}</div>}
                    {g?.source && <div className="text-[14px] text-slate-400">Источник: {stageRu(g.source)}</div>}
                  </li>
                ))}
              </ul>
            </details>
          )}

          {view.strengths.length > 0 && (
            <details className="bg-transparent border border-[#E7C768]/30 rounded-xl backdrop-blur-xl">
              <summary className="cursor-pointer px-4 py-2.5 text-[14px] font-bold text-[#E7C768]">
                Все сильные стороны
              </summary>
              <ul className="px-4 pb-4 text-[14px] text-white list-disc pl-5 space-y-1">
                {view.strengths.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </details>
          )}

          {view.risks.length > 0 && (
            <details className="bg-transparent border border-white/20 rounded-xl backdrop-blur-xl">
              <summary className="cursor-pointer px-4 py-2.5 text-[14px] font-bold text-white">
                Все риски
              </summary>
              <ul className="px-4 pb-4 text-[14px] text-white space-y-2">
                {view.risks.map((r: any, i: number) => (
                  <li key={i}>
                    <div><b>{asStr(r?.title)}</b>{r?.severity ? <> · <span className="text-white/80">{asStr(r.severity)}</span></> : null}</div>
                    {r?.evidence && <div className="text-slate-200">{asStr(r.evidence)}</div>}
                    {r?.impact && <div className="text-[14px] text-slate-300">Влияние: {asStr(r.impact)}</div>}
                  </li>
                ))}
              </ul>
            </details>
          )}

          {view.redFlags.length > 0 && (
            <details className="bg-transparent border border-white/30 rounded-xl backdrop-blur-xl">
              <summary className="cursor-pointer px-4 py-2.5 text-[14px] font-bold text-white">
                Красные флаги
              </summary>
              <ul className="px-4 pb-4 text-[14px] text-white space-y-2">
                {view.redFlags.map((r: any, i: number) => (
                  <li key={i}>
                    <div><b>{asStr(r?.title)}</b>{r?.severity ? <> · <span className="text-white/80">{asStr(r.severity)}</span></> : null}</div>
                    {r?.evidence && <div className="text-slate-200">{asStr(r.evidence)}</div>}
                    {r?.source && <div className="text-[14px] text-slate-400">Источник: {stageRu(r.source)}</div>}
                  </li>
                ))}
              </ul>
            </details>
          )}

          {view.intakeOrg.length > 0 && (
            <details className="bg-transparent border border-white/15 rounded-xl backdrop-blur-xl">
              <summary className="cursor-pointer px-4 py-2.5 text-[14px] font-bold text-slate-200">
                Что уточнить при знакомстве
              </summary>
              <ul className="px-4 pb-4 text-[14px] text-white list-disc pl-5 space-y-1">
                {view.intakeOrg.map((s: string, i: number) => <li key={i}>{s}</li>)}
              </ul>
            </details>
          )}

          {view.wishes.length > 0 && (
            <details className="bg-transparent border border-white/15 rounded-xl backdrop-blur-xl">
              <summary className="cursor-pointer px-4 py-2.5 text-[14px] font-bold text-slate-200">
                Соответствие пожеланиям работодателя
              </summary>
              <ul className="px-4 pb-4 text-[14px] text-white space-y-1.5">
                {view.wishes.map((w: any, i: number) => (
                  <li key={i}>
                    <b>{asStr(w?.wish)}</b> — <span className="text-slate-200">{asStr(w?.status)}</span>
                    {w?.evidence && <div className="text-[14px] text-slate-300">{asStr(w.evidence)}</div>}
                  </li>
                ))}
              </ul>
            </details>
          )}

          {(view.executiveSummary || view.recommendationFull) && (
            <details data-testid="full-exec-summary" className="bg-transparent border border-[#E7C768]/30 rounded-xl backdrop-blur-xl">
              <summary className="cursor-pointer px-4 py-2.5 text-[14px] font-bold text-[#E7C768]">
                Полный управленческий вывод
              </summary>
              <div className="px-4 pb-4 space-y-2">
                {view.executiveSummary && (
                  <div className="text-[14px] text-white/95 leading-relaxed whitespace-pre-wrap">
                    {view.executiveSummary}
                  </div>
                )}
                {view.recommendationFull && (
                  <div className="text-[14px] text-white/95 leading-relaxed whitespace-pre-wrap border-t border-white/10 pt-2">
                    <span className="text-[14px] font-semibold text-[#E7C768] mr-2">Рекомендация:</span>
                    {view.recommendationFull}
                  </div>
                )}
              </div>
            </details>
          )}
        </div>
      </details>
    </div>
  );
}