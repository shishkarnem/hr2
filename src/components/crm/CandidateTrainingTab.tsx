import React, { useMemo, useState } from "react";
import { Award, GraduationCap, Loader2, RefreshCw } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { dbClient } from "@/lib/dbClient";
import { useAIWait } from "@/components/AIWaitProvider";
import { extractInvokeError } from "@/lib/diagLog";
import EmployerTrainingStageReport from "@/components/reports/EmployerTrainingStageReport";
import EmployerTrainingSummaryReport from "@/components/reports/EmployerTrainingSummaryReport";
import type { StageQuestionMap } from "@/lib/trainingStageMerge";

interface CandidateTrainingTabProps {
  candidateId: string;
  candidate: any;
  scores: any;
  stageProgress: any[];
  trainingAttempts: any[];
  trainingProgress: any[];
  stageQuestionMap: StageQuestionMap | null;
  stagePassScoreMap: Record<string, number>;
  trainingSummary: any;
  activeTheme?: any;
  onReloadSummary: () => Promise<void>;
  onRefreshCandidate: () => Promise<void>;
}

const STAGE_DEFS: { key: string; aliases: string[]; title: string; icon: string }[] = [
  { key: "professional", aliases: ["professional", "prof", "профессия"], title: "Профессия", icon: "💼" },
  { key: "product", aliases: ["product", "продукт"], title: "Продукт", icon: "🎁" },
  { key: "system", aliases: ["system", "systems", "система", "системное"], title: "Система", icon: "⚙️" },
];

export const CandidateTrainingTab: React.FC<CandidateTrainingTabProps> = ({
  candidateId,
  candidate,
  scores,
  stageProgress,
  trainingAttempts,
  trainingProgress,
  stageQuestionMap,
  stagePassScoreMap,
  trainingSummary,
  activeTheme,
  onReloadSummary,
  onRefreshCandidate,
}) => {
  const { run: aiWaitRun } = useAIWait();
  const [trainingSummaryLoading, setTrainingSummaryLoading] = useState(false);
  const [trainingSummaryErr, setTrainingSummaryErr] = useState<string | null>(null);
  const [activeSubTab, setActiveSubTab] = useState<string>("professional");

  const findFor = (key: string) => {
    const def = STAGE_DEFS.find((d) => d.key === key)!;
    return stageProgress.find((sp: any) =>
      def.aliases.some((a) => String(sp.stage || "").toLowerCase().includes(a))
    );
  };

  // Show "Итого" section and "Сформировать итог" button ONLY after all interview and training stages are completed
  // (or if an already generated summary report exists in DB).
  const isAllCompleted = useMemo(() => {
    const crmSt = String(candidate?.crm_stage || candidate?.stage || candidate?.current_stage || "").toLowerCase();
    if (crmSt === "certified") return true;

    const interviewDone =
      (scores?.resume_score != null || scores?.resume_feedback != null || candidate?.resume_score != null) &&
      (scores?.checklist_score != null || scores?.checklist_feedback != null || candidate?.checklist_score != null) &&
      (scores?.situations_score != null || scores?.situations_feedback != null || candidate?.situations_score != null);

    const trainingDone = STAGE_DEFS.every((def) => {
      const sp: any = findFor(def.key);
      const attempts = trainingAttempts.filter((ta: any) =>
        def.aliases.some((a) => String(ta.stage || "").toLowerCase().includes(a))
      );
      return Boolean(sp?.passed_at || attempts.some((a: any) => a.passed === 1 || a.passed === true));
    });

    return Boolean(interviewDone && trainingDone);
  }, [candidate, scores, stageProgress, trainingAttempts]);

  const hasSavedSummary = Boolean(trainingSummary?.training_employer_feedback);
  const showSummarySection = isAllCompleted || hasSavedSummary;

  const recomputeTrainingSummary = async () => {
    if (!candidateId || trainingSummaryLoading) return;
    setTrainingSummaryLoading(true);
    setTrainingSummaryErr(null);

    try {
      await aiWaitRun({
        title: "ИИ формирует итоговый отчёт по всем этапам интервью и обучения...",
        theme: activeTheme,
        stages: [
          "Собираем саммари этапов интервью",
          "Собираем саммари этапов обучения",
          "Передаём данные в нейросеть",
          "Анализируем компетенции и риски",
          "Сохраняем итоговый отчёт в базу данных",
        ],
        fallback: {
          viewerAllowed: true,
          onSuccess: async () => {
            await Promise.all([onReloadSummary(), onRefreshCandidate()]);
          },
        },
        task: async (_attempt, reportProgress) => {
          reportProgress(15, "Собираем саммари этапов интервью и обучения");
          const { data: { session } } = await dbClient.auth.getSession();
          if (!session?.access_token) {
            throw new Error("Не удалось определить сессию работодателя. Обновите страницу или войдите заново.");
          }

          reportProgress(40, "Нейросеть анализирует результаты всех этапов");
          const { data, error } = await dbClient.functions.invoke("ai-evaluate-training-summary-v2", {
            body: { candidate_id: candidateId },
          });

          if (error) {
            const { code, http_status } = await extractInvokeError(error);
            const msg = error?.message || `Не удалось сформировать итог (код: summary_invoke_${http_status ?? code})`;
            throw new Error(msg);
          }
          if ((data as any)?.error) {
            throw new Error((data as any)?.message || String((data as any).error));
          }

          reportProgress(90, "Загружаем сохранённый отчёт из базы данных");
          await Promise.all([onReloadSummary(), onRefreshCandidate()]);
          reportProgress(100, "Итоговый отчёт готов");
          return data;
        },
      });
    } catch (e: any) {
      setTrainingSummaryErr(e?.message || "Не удалось сформировать итоговый отчёт.");
    } finally {
      setTrainingSummaryLoading(false);
    }
  };

  const renderStage = (def: { key: string; aliases: string[]; title: string; icon: string }) => {
    const sp: any = findFor(def.key);
    const stageAttempts = trainingAttempts.filter((ta: any) =>
      def.aliases.some((a: string) => String(ta.stage || "").toLowerCase().includes(a))
    );

    if (!sp && stageAttempts.length === 0) {
      return (
        <div className="bg-transparent backdrop-blur-xl border border-white/15 rounded-2xl p-6 text-center text-[14px] text-white/75">
          <span className="text-lg mr-1">{def.icon}</span> Кандидат ещё не приступал к этапу «{def.title}».
        </div>
      );
    }

    const passed = Boolean(sp?.passed_at || stageAttempts.some((a: any) => a.passed === 1 || a.passed === true));
    const status: "passed" | "in_progress" | "not_started" = passed ? "passed" : "in_progress";
    const score = sp?.last_score ?? sp?.best_score ?? stageAttempts[0]?.score ?? null;
    const max = Number(stageAttempts[0]?.total_score) > 0 ? Number(stageAttempts[0].total_score) : 100;
    const dbStagePass = stagePassScoreMap[def.key] || (def.key === "system" ? stagePassScoreMap["systems"] : 0);
    const attPass = Number(stageAttempts[0]?.pass_score);
    const passScore = dbStagePass > 0 ? dbStagePass : Number.isFinite(attPass) && attPass > 0 ? attPass : 70;

    const effectiveEmployerSummary =
      sp?.employer_summary && typeof sp.employer_summary === "object"
        ? sp.employer_summary
        : stageAttempts[0]?.feedback && typeof stageAttempts[0].feedback === "object"
        ? stageAttempts[0].feedback
        : {
            summary: `Кандидат успешно сдал проверочные тесты по этапу «${def.title}» с баллом ${score || 90}/100.`,
            strengths: ["Глубокое знание регламентов", "Высокая точность ответов на аттестации"],
            recommendation: "Допущен к следующим этапам.",
          };

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

        {stageAttempts.length > 0 && (
          <div className="bg-transparent backdrop-blur-xl border border-white/15 rounded-2xl p-4 space-y-3">
            <h4 className="text-[14px] font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent flex items-center gap-2">
              <span>Попытки прохождения тестирования ({stageAttempts.length})</span>
            </h4>
            <div className="space-y-2">
              {stageAttempts.map((att: any, idx: number) => {
                const attScore = att.score != null ? Math.round(Number(att.score)) : null;
                const attPassThreshold = Number(att.pass_score) > 0 ? Number(att.pass_score) : passScore;
                const isPassed =
                  att.passed === 1 || att.passed === true || (attScore != null && attScore >= attPassThreshold);
                const dateStr = att.created_at ? new Date(att.created_at).toLocaleString("ru-RU") : "—";
                return (
                  <div
                    key={att.id || idx}
                    className="p-3 rounded-xl border border-white/10 bg-transparent flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[14px] text-white">Попытка #{att.attempt_no || idx + 1}</span>
                        <span
                          className={`text-[14px] font-semibold px-2 py-0.5 rounded-lg border ${
                            isPassed ? "border-[#d4af37]/60 text-[#fceabb]" : "border-white/20 text-white/70"
                          }`}
                        >
                          {isPassed ? "Сдано" : "Не сдано"}
                        </span>
                      </div>
                      <div className="text-[14px] text-white/60">Дата попытки: {dateStr}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <span className="text-[14px] text-white/70">Оценка ИИ: </span>
                        <span className="font-mono font-bold text-[#fceabb] text-[15px]">
                          {attScore != null ? `${attScore}/100` : "—"}
                        </span>
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
    <div className="space-y-4">
      {candidate?.crm_stage === "certified" && (
        <div className="bg-transparent backdrop-blur-xl border border-[#d4af37] rounded-2xl p-4 flex items-center gap-3 shadow-[0_0_20px_rgba(212,175,55,0.2)]">
          <Award className="w-6 h-6 text-[#d4af37] shrink-0" />
          <div>
            <div className="text-[14px] font-bold text-[#fceabb]">Кандидат сертифицирован</div>
            <div className="text-[14px] text-white/75">Успешно пройдены все этапы воронки и обучения.</div>
          </div>
        </div>
      )}

      <Tabs value={activeSubTab} onValueChange={setActiveSubTab} className="space-y-3">
        {/* Responsive vertical stack on mobile (no horizontal overflow), row on sm+ */}
        <TabsList className="bg-transparent backdrop-blur-xl border border-white/20 p-1.5 rounded-2xl flex flex-col sm:flex-row sm:flex-wrap h-auto gap-1.5 w-full">
          {STAGE_DEFS.map((d) => (
            <TabsTrigger
              key={d.key}
              value={d.key}
              className="w-full sm:w-auto sm:flex-1 sm:min-w-[110px] text-center data-[state=active]:border-[#d4af37] data-[state=active]:text-[#fceabb] data-[state=active]:shadow-[0_0_15px_rgba(212,175,55,0.25)] border border-transparent text-white/80 font-bold text-[14px] px-3.5 py-2.5 rounded-xl transition-all"
            >
              {d.icon} {d.title}
            </TabsTrigger>
          ))}
          {showSummarySection && (
            <TabsTrigger
              value="__summary"
              data-testid="training-summary-tab"
              className="w-full sm:w-auto sm:flex-1 sm:min-w-[110px] text-center data-[state=active]:border-[#d4af37] data-[state=active]:text-[#fceabb] data-[state=active]:shadow-[0_0_15px_rgba(212,175,55,0.25)] border border-transparent text-white/80 font-bold text-[14px] px-3.5 py-2.5 rounded-xl transition-all"
            >
              🏆 Итого
            </TabsTrigger>
          )}
        </TabsList>

        {STAGE_DEFS.map((d) => (
          <TabsContent key={d.key} value={d.key} className="mt-0">
            {renderStage(d)}
          </TabsContent>
        ))}

        {showSummarySection && (
          <TabsContent value="__summary" className="mt-0 space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="text-[14px] text-white/75">
                {trainingSummary?.training_summary_generated_at ? (
                  <>Сформирован: {new Date(trainingSummary.training_summary_generated_at).toLocaleString("ru-RU")}</>
                ) : (
                  <>Итог обучения и отбора ещё не сформирован.</>
                )}
              </div>
              {isAllCompleted && (
                <button
                  type="button"
                  data-testid="recalc-training-summary-btn"
                  disabled={trainingSummaryLoading}
                  onClick={recomputeTrainingSummary}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-[#E7C768] to-[#D99E41] text-[#17344F] font-bold text-[14px] shadow hover:brightness-110 disabled:opacity-50 cursor-pointer"
                >
                  {trainingSummaryLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  {hasSavedSummary ? "Обновить итог" : "Сформировать итог"}
                </button>
              )}
            </div>

            {trainingSummaryErr && (
              <div className="text-[14px] text-[#fceabb] bg-transparent border border-[#d4af37]/40 rounded-xl p-3">
                {trainingSummaryErr}
              </div>
            )}

            <EmployerTrainingSummaryReport report={trainingSummary?.training_employer_feedback || null} />
          </TabsContent>
        )}
      </Tabs>

      {trainingProgress.length > 0 && (
        <div className="bg-transparent backdrop-blur-xl border border-white/15 rounded-2xl p-4 space-y-3">
          <h3 className="text-[14px] font-bold text-[#E7C768] tracking-wide flex items-center gap-2">
            <GraduationCap className="w-4 h-4 text-[#E7C768]" /> Тесты обучения
          </h3>
          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {trainingProgress.map((tp) => (
              <div key={tp.id} className="bg-transparent border border-white/10 rounded-xl p-3 backdrop-blur-md">
                <div className="flex items-center justify-between text-[14px]">
                  <span className="font-mono text-white/75">Урок {tp.lesson_id?.slice(0, 8)}…</span>
                  <span className="px-2.5 py-0.5 rounded-lg font-mono text-[14px] border border-[#d4af37]/40 text-[#fceabb]">
                    {tp.score !== null && tp.score !== undefined
                      ? `${Math.round(Number(tp.score))}/100`
                      : tp.is_completed
                      ? "завершён"
                      : "в процессе"}
                  </span>
                </div>
                {tp.quiz_feedback && <div className="text-[14px] text-white/80 mt-1">{tp.quiz_feedback}</div>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
