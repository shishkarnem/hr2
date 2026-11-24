import { AlertTriangle, ShieldAlert, Sparkles, Trophy, BookOpen } from "lucide-react";
import { toStrArr, toObjArr } from "@/lib/normalizeArrays";

export type TrainingSummaryEmployer = {
  score: number;
  data_completeness: number;
  verdict: string;
  summary: string;
  completed_stages: string[];
  missing_stages: string[];
  mastered_topics: string[];
  weak_topics: string[];
  risks?: { title: string; evidence: string; severity?: string }[];
  red_flags?: { title: string; evidence: string; severity?: string }[];
  revision_plan?: string[];
  readiness?: string;
  recommendation?: string;
};

function S({ title, children }: { title: string; children: any }) {
  return (
    <div className="space-y-2">
      <div className="text-[14px] font-semibold text-[#E7C768]">{title}</div>
      {children}
    </div>
  );
}

export default function EmployerTrainingSummaryReport({ report }: { report: TrainingSummaryEmployer | null }) {
  if (!report || typeof report !== "object") {
    return (
      <div className="bg-transparent backdrop-blur-xl border border-white/15 rounded-2xl p-6 text-center text-[14px] text-slate-300">
        Итоговый отчёт по обучению ещё не сформирован. Нажмите «Сформировать итог», когда будут готовы результаты этапов.
      </div>
    );
  }
  const r = report as any;
  const verdict = typeof r.verdict === "string" ? r.verdict : "—";
  const summaryText = typeof r.summary === "string" ? r.summary : "";
  const readiness = typeof r.readiness === "string" ? r.readiness : "";
  const recommendation = typeof r.recommendation === "string" ? r.recommendation : "";
  const scoreNum = Number.isFinite(Number(r.score)) ? Math.round(Number(r.score)) : null;
  const completenessNum = Number.isFinite(Number(r.data_completeness))
    ? Math.round(Number(r.data_completeness))
    : null;
  const completedStages = toStrArr(r.completed_stages);
  const missingStages = toStrArr(r.missing_stages);
  const masteredTopics = toStrArr(r.mastered_topics);
  const weakTopics = toStrArr(r.weak_topics);
  const revisionPlan = toStrArr(r.revision_plan);
  type RR = { title: string; evidence: string; severity?: string };
  const risks = toObjArr<RR>(r.risks, (s) => ({ title: s, evidence: "" }));
  const redFlags = toObjArr<RR>(r.red_flags, (s) => ({ title: s, evidence: "" }));
  return (
    <div className="bg-transparent backdrop-blur-xl border border-white/15 rounded-2xl p-5 space-y-4 shadow-lg" data-testid="emp-training-summary">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Trophy className="w-6 h-6 text-[#E7C768]" />
          <div>
            <div className="text-base font-bold text-white">Итог обучения</div>
            <div className="text-[14px] text-slate-300">Вердикт: <span className="font-mono text-[#E7C768] font-bold">{verdict}</span></div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-3xl font-mono font-black bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#CBA335] bg-clip-text text-transparent">
            {scoreNum != null ? `${scoreNum}/100` : "—"}
          </div>
          <div className="text-[14px] text-slate-300">Полнота данных: {completenessNum != null ? `${completenessNum}%` : "—"}</div>
        </div>
      </div>

      {summaryText && (
        <S title="Общий вывод">
          <p className="text-[14px] text-white/95 leading-relaxed">{summaryText}</p>
        </S>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {completedStages.length > 0 && (
          <S title="Завершено">
            <ul className="text-[14px] text-white/90 space-y-1 list-disc list-inside">
              {completedStages.map((s, i) => <li key={i}>{s}</li>)}
            </ul>
          </S>
        )}
        {missingStages.length > 0 && (
          <S title="Не пройдено">
            <ul className="text-[14px] text-slate-300 space-y-1 list-disc list-inside">
              {missingStages.map((s, i) => <li key={i}>{s}</li>)}
            </ul>
          </S>
        )}
      </div>

      {masteredTopics.length > 0 && (
        <S title="Усвоенные темы">
          <ul className="text-[14px] text-white/90 space-y-1 list-disc list-inside">
            {masteredTopics.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </S>
      )}
      {weakTopics.length > 0 && (
        <S title="Слабые темы">
          <ul className="text-[14px] text-slate-300 space-y-1 list-disc list-inside">
            {weakTopics.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </S>
      )}

      {risks.length > 0 && (
        <S title="Риски">
          <div className="space-y-2">
            {risks.map((r, i) => (
              <div key={i} className="text-[14px] bg-transparent border border-white/20 rounded-xl p-3 backdrop-blur-xl">
                <div className="flex items-center gap-1.5 text-white font-semibold"><AlertTriangle className="w-4 h-4 text-[#E7C768]" />{r.title}</div>
                {r.evidence && <div className="text-slate-300 mt-1">{r.evidence}</div>}
              </div>
            ))}
          </div>
        </S>
      )}
      {redFlags.length > 0 && (
        <S title="Особые отметки">
          <div className="space-y-2">
            {redFlags.map((r, i) => (
              <div key={i} className="text-[14px] bg-transparent border border-white/30 rounded-xl p-3 backdrop-blur-xl">
                <div className="flex items-center gap-1.5 text-white font-semibold"><ShieldAlert className="w-4 h-4 text-white" />{r.title}</div>
                {r.evidence && <div className="text-slate-300 mt-1">{r.evidence}</div>}
              </div>
            ))}
          </div>
        </S>
      )}

      {revisionPlan.length > 0 && (
        <S title="План повторения">
          <ul className="text-[14px] text-white/90 space-y-1 list-disc list-inside">
            {revisionPlan.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </S>
      )}

      {readiness && (
        <S title="Готовность к практике">
          <div className="text-[14px] text-white/95 flex items-start gap-2">
            <BookOpen className="w-4 h-4 mt-0.5 text-[#E7C768]" />{readiness}
          </div>
        </S>
      )}

      {recommendation && (
        <S title="Итоговая рекомендация">
          <div className="text-[14px] text-white/95 bg-transparent border border-white/20 rounded-xl p-3 flex items-start gap-2 backdrop-blur-xl">
            <Sparkles className="w-4 h-4 mt-0.5 text-[#E7C768]" /><span>{recommendation}</span>
          </div>
        </S>
      )}
    </div>
  );
}