import { Trophy, Sparkles } from "lucide-react";

export type TrainingSummaryCandidate = {
  summary: string;
  completed_stages: string[];
  missing_stages: string[];
  strengths: string[];
  topics_to_repeat: string[];
  revision_plan: string[];
  next_steps: string[];
};

function S({ title, children }: { title: string; children: any }) {
  return (
    <div className="space-y-2">
      <div className="text-[14px] font-semibold text-[#E7C768]">{title}</div>
      {children}
    </div>
  );
}

export default function CandidateTrainingSummaryReport({ report }: { report: TrainingSummaryCandidate | null }) {
  if (!report) return null;
  return (
    <div className="space-y-4" data-testid="cand-training-summary">
      <div className="flex items-center gap-2.5">
        <Trophy className="w-6 h-6 text-[#E7C768]" />
        <div className="text-base font-bold text-white">Итог обучения</div>
      </div>
      <p className="text-[14px] text-white/95 leading-relaxed">{report.summary}</p>
      {!!report.completed_stages?.length && (
        <S title="Пройденные этапы">
          <ul className="text-[14px] text-white/90 space-y-1 list-disc list-inside">
            {report.completed_stages.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </S>
      )}
      {!!report.strengths?.length && (
        <S title="Сильные стороны">
          <ul className="text-[14px] text-white/90 space-y-1 list-disc list-inside">
            {report.strengths.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </S>
      )}
      {!!report.topics_to_repeat?.length && (
        <S title="Что повторить">
          <ul className="text-[14px] text-white/90 space-y-1 list-disc list-inside">
            {report.topics_to_repeat.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </S>
      )}
      {!!report.revision_plan?.length && (
        <S title="План повторения">
          <ul className="text-[14px] text-white/90 space-y-1 list-disc list-inside">
            {report.revision_plan.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </S>
      )}
      {!!report.next_steps?.length && (
        <S title="Следующие шаги">
          <ul className="text-[14px] text-white/90 space-y-1 list-disc list-inside">
            {report.next_steps.map((s, i) => (
              <li key={i} className="flex items-start gap-2">
                <Sparkles className="w-4 h-4 text-[#E7C768] mt-0.5 shrink-0" />
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </S>
      )}
    </div>
  );
}