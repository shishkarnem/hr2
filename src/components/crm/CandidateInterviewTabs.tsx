import React, { useState } from "react";
import RichMarkdown from "@/components/RichMarkdown";
import { adaptEmployerChecklist, adaptEmployerSituations } from "@/lib/feedbackAdapters";
import EmployerChecklistReport from "@/components/reports/EmployerChecklistReport";
import EmployerSituationsReport from "@/components/reports/EmployerSituationsReport";
import { scoreTone as toneFor, type Tone } from "@/lib/scoreTone";
import { FileText, CheckSquare, MessageSquare, ChevronDown, ChevronUp } from "lucide-react";

function scoreTone(value: any, max: number = 100, passScore: number = 70): Tone & { cls: string } {
  const t = toneFor(value, max, passScore);
  return { ...t, cls: t.text };
}

function toneBg(label: Tone["label"]): string {
  return toneFor(label === "good" ? 100 : label === "mid" ? 50 : label === "bad" ? 10 : NaN).bg;
}

export function EmployerResumeReportView({
  score,
  feedback,
  fallbackSummary,
  resumeText,
}: {
  score: any;
  feedback: any;
  fallbackSummary?: string | null;
  resumeText?: string | null;
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
      const f: any = hasFeedback ? feedback : {};
      const summary = f.summary || fallbackSummary || "";
      const strengths = Array.isArray(f.strengths) ? f.strengths : [];
      const gaps = Array.isArray(f.gaps) ? f.gaps : [];
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
              <ul className="text-[14px] text-white/90 list-disc pl-5 space-y-1">
                {strengths.map((x: any, i: number) => <li key={i}>{String(x)}</li>)}
              </ul>
            </div>
          )}
          {gaps.length > 0 && (
            <div className="bg-transparent backdrop-blur-xl border border-white/20 rounded-xl p-4">
              <div className="text-[14px] font-mono text-white/80 mb-1">Пробелы</div>
              <ul className="text-[14px] text-white/90 list-disc pl-5 space-y-1">
                {gaps.map((x: any, i: number) => <li key={i}>{String(x)}</li>)}
              </ul>
            </div>
          )}
        </div>
      );
    }

    const f: any = feedback;
    const matches = Array.isArray(f.matches) ? f.matches : [];
    const gaps = Array.isArray(f.gaps) ? f.gaps : [];
    const strengths = Array.isArray(f.strengths) ? f.strengths : [];
    const risks = Array.isArray(f.risks) ? f.risks : [];
    const redFlags = Array.isArray(f.red_flags) ? f.red_flags : [];
    const questions = Array.isArray(f.questions_to_verify) ? f.questions_to_verify : [];

    return (
      <div className="space-y-3">
        <div className={`rounded-xl p-4 border ${toneBg(tone.label)} text-white space-y-1.5`}>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[14px] font-mono text-[#E7C768]">Вердикт</span>
            <span className={`text-[14px] font-bold ${tone.cls}`}>{String(f.verdict || "—")}</span>
            {Number.isFinite(Number(score)) && (
              <span className={`text-[14px] font-mono font-black ml-auto ${tone.cls}`}>
                {Math.round(Number(score))}/100
              </span>
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
                  <div className="font-semibold text-white">
                    {m.criterion}{" "}
                    <span className="text-[14px] font-mono text-[#fceabb] ml-1">{m.degree}</span>
                  </div>
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
            <ul className="text-[14px] text-white/90 list-disc pl-5 space-y-1">
              {strengths.map((x: any, i: number) => <li key={i}>{String(x)}</li>)}
            </ul>
          </div>
        )}

        {risks.length > 0 && (
          <div className="bg-transparent backdrop-blur-xl border border-white/20 rounded-xl p-4 space-y-1.5">
            <div className="text-[14px] font-mono text-white/80">Риски</div>
            <ul className="space-y-1.5">
              {risks.map((r: any, i: number) => (
                <li key={i} className="text-[14px] text-white/90">
                  <div className="font-semibold text-white">
                    {r.title}{" "}
                    <span className="text-[14px] font-mono text-[#fceabb] ml-1">{r.severity}</span>
                  </div>
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
                  <div className="font-semibold text-white">
                    {r.title}{" "}
                    <span className="text-[14px] font-mono text-white/70 ml-1">{r.severity}</span>
                  </div>
                  {r.evidence && <div className="text-white/80 text-[14px] mt-0.5">{r.evidence}</div>}
                </li>
              ))}
            </ul>
          </div>
        )}

        {questions.length > 0 && (
          <div className="bg-transparent backdrop-blur-xl border border-[#d4af37]/30 rounded-xl p-4">
            <div className="text-[14px] font-mono text-[#E7C768] mb-1">Что проверить на интервью</div>
            <ul className="text-[14px] text-white/90 list-disc pl-5 space-y-1">
              {questions.map((q: any, i: number) => <li key={i}>{String(q)}</li>)}
            </ul>
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
            <span className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-[#E7C768]" /> Распознанный текст резюме
            </span>
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

export function ChecklistTabContent({
  scores,
  checklistAnswersView,
}: {
  scores: any;
  checklistAnswersView: any[];
}) {
  return (
    <div className="space-y-6">
      {(scores?.checklist_feedback || scores?.checklist_score != null) && (
        <div className="bg-transparent backdrop-blur-xl border border-white/15 rounded-2xl p-4">
          <EmployerChecklistReport
            view={adaptEmployerChecklist(scores?.checklist_feedback)}
            score={scores?.checklist_score ?? null}
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
              const qText =
                a.question_text || (a.question_id ? a.question_id.slice(0, 8) + "…" : `Вопрос ${idx + 1}`);
              const short = qText.length > 80 ? qText.slice(0, 80).trimEnd() + "…" : qText;
              return (
                <details
                  key={a.id}
                  className="group rounded-2xl border border-white/15 hover:border-[#d4af37]/60 bg-transparent backdrop-blur-md overflow-hidden transition-all"
                >
                  <summary className="cursor-pointer list-none px-4 py-3 flex items-center gap-3 select-none">
                    <span className="text-[14px] font-mono text-white/60 shrink-0 w-7">{idx + 1}.</span>
                    <span className="text-[14px] font-semibold text-white leading-relaxed flex-1">{short}</span>
                    <span className="text-[14px] font-mono font-bold shrink-0 px-2.5 py-1 rounded-lg border border-[#d4af37]/50 bg-transparent text-[#fceabb]">
                      {a.score !== null && a.score !== undefined
                        ? `${Math.round(Number(a.score))}/${max}`
                        : a.is_correct
                          ? "✓"
                          : "—"}
                    </span>
                    <span className="text-white/60 text-[14px] shrink-0 transition-transform group-open:rotate-180" aria-hidden>
                      ▾
                    </span>
                  </summary>
                  <div className="px-4 pb-4 pt-2 space-y-3 border-t border-white/10">
                    {qText && short !== qText && (
                      <div className="text-[14px] text-white/90 leading-relaxed">
                        <span className="text-[14px] font-mono text-white/60 mr-2">Вопрос:</span>
                        {qText}
                      </div>
                    )}
                    <div className="text-[14px] text-white leading-relaxed bg-transparent backdrop-blur-md border border-white/15 rounded-xl p-3.5">
                      <div className="text-[14px] font-mono text-white/60 mb-1">Ответ кандидата:</div>
                      {a.answer_text ? (
                        <RichMarkdown tone="chat">{a.answer_text}</RichMarkdown>
                      ) : (
                        <span className="italic text-white/50">(пусто)</span>
                      )}
                    </div>
                    {a.feedback && (
                      <div className="text-[14px] text-[#fceabb] leading-relaxed bg-transparent backdrop-blur-md border border-[#d4af37]/30 rounded-xl p-3.5">
                        <span className="font-mono text-white/70 mr-2">Комментарий ИИ:</span>
                        {a.feedback}
                      </div>
                    )}
                  </div>
                </details>
              );
            })}
          </div>
        </div>
      ) : !(scores?.checklist_feedback || scores?.checklist_score != null) ? (
        <div className="bg-transparent backdrop-blur-xl border border-white/15 rounded-2xl p-6 text-center text-[14px] text-white/70">
          Кандидат ещё не отвечал на анкету.
        </div>
      ) : null}
    </div>
  );
}

export function SituationsTabContent({
  scores,
  situationCases,
  situationAnswers,
  situationAnswersView,
  interviews,
}: {
  scores: any;
  situationCases: any[];
  situationAnswers: any[];
  situationAnswersView: any[];
  interviews: any[];
}) {
  return (
    <div className="space-y-6">
      {(scores?.situations_feedback || scores?.situations_score != null) && (
        <div className="bg-transparent backdrop-blur-xl border border-white/15 rounded-2xl p-4">
          <EmployerSituationsReport
            view={adaptEmployerSituations(scores?.situations_feedback)}
            score={scores?.situations_score ?? null}
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
                <details
                  key={a.id}
                  className="group rounded-2xl border border-white/15 hover:border-[#d4af37]/60 bg-transparent backdrop-blur-md overflow-hidden transition-all"
                >
                  <summary className="cursor-pointer list-none px-4 py-3 flex items-center gap-3 select-none">
                    <span className="text-[14px] font-mono text-white/60 shrink-0 w-7">{idx + 1}.</span>
                    <span className="text-[14px] font-semibold text-white leading-relaxed flex-1">{short}</span>
                    <span className="text-[14px] font-mono font-bold shrink-0 px-2.5 py-1 rounded-lg border border-[#d4af37]/50 bg-transparent text-[#fceabb]">
                      {a.score !== null && a.score !== undefined
                        ? `${Math.round(Number(a.score))}/100`
                        : a.is_correct
                          ? "✓"
                          : "—"}
                    </span>
                    <span className="text-white/60 text-[14px] shrink-0 transition-transform group-open:rotate-180" aria-hidden>
                      ▾
                    </span>
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
                      {a.answer_text ? (
                        <RichMarkdown tone="chat">{a.answer_text}</RichMarkdown>
                      ) : (
                        <span className="italic text-white/50">(пусто)</span>
                      )}
                    </div>
                    {a.feedback && (
                      <div className="text-[14px] text-[#fceabb] leading-relaxed bg-transparent backdrop-blur-md border border-[#d4af37]/30 rounded-xl p-3.5">
                        <span className="font-mono text-white/70 mr-2">Комментарий ИИ:</span>
                        {a.feedback}
                      </div>
                    )}
                  </div>
                </details>
              );
            })}
          </div>
        </div>
      ) : !(scores?.situations_feedback || scores?.situations_score != null) ? (
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
              <div
                key={i.id}
                className="p-3.5 rounded-xl border border-white/10 bg-transparent backdrop-blur-md space-y-2"
              >
                <div className="text-white/60 font-mono text-[14px]">
                  #{i.public_id} · {i.status} ·{" "}
                  {i.started_at ? new Date(i.started_at).toLocaleString("ru-RU") : "—"}
                </div>
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
    </div>
  );
}
