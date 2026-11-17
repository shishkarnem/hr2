import React from "react";
import { CheckCircle2, AlertCircle, Sparkles } from "lucide-react";
import { hexToRgba } from "@/components/LandingStyleEditor";

type Item = { question_id: string; score: number; feedback?: string; recommendation?: string };

export type CandidateStageSummary = {
  summary?: string;
  candidate_summary?: string;
  strengths?: string[];
  areas_to_improve?: string[];
  items?: Item[];
  next_steps?: string[];
};

function normalizeCandidateSummary(raw: CandidateStageSummary | string | null | undefined): CandidateStageSummary {
  if (!raw) return {};
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return {};
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed && typeof parsed === "object") {
          return {
            summary: parsed.summary || parsed.candidate_summary || "",
            strengths: Array.isArray(parsed.strengths) ? parsed.strengths : undefined,
            areas_to_improve: Array.isArray(parsed.areas_to_improve) ? parsed.areas_to_improve : undefined,
            items: Array.isArray(parsed.items) ? parsed.items : undefined,
            next_steps: Array.isArray(parsed.next_steps) ? parsed.next_steps : undefined,
          };
        }
      } catch {
        // treat as plain text below
      }
    }
    const cleaned = trimmed
      .replace(/^"?candidate_summary"?\s*:\s*"?/i, "")
      .replace(/"$/, "")
      .trim();
    return { summary: cleaned };
  }
  if (typeof raw === "object") {
    return {
      ...raw,
      summary: raw.summary || raw.candidate_summary || "",
    };
  }
  return {};
}

function Section({
  title,
  children,
  iconColor,
  fontFamily,
}: {
  title: string;
  children: React.ReactNode;
  iconColor?: string;
  fontFamily?: string;
}) {
  return (
    <div className="space-y-2" style={{ fontFamily }}>
      <div
        className="text-sm font-bold"
        style={{ color: iconColor || "#E7C768", fontFamily }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

export default function CandidateTrainingStageReport({
  passed,
  score,
  max,
  passScore,
  summary,
  perQuestionLegacy,
  theme,
}: {
  passed: boolean;
  score: number;
  max: number;
  passScore: number;
  summary: CandidateStageSummary | string | null | undefined;
  perQuestionLegacy?: any[];
  theme?: any;
}) {
  const normalized = normalizeCandidateSummary(summary);
  const summaryText = normalized.summary?.trim() || "";

  const containerRadius =
    theme?.containerBorderRadius === 999
      ? "9999px"
      : theme?.containerBorderRadius != null
        ? `${theme.containerBorderRadius}px`
        : "16px";
  const itemRadius =
    theme?.containerBorderRadius === 999
      ? "24px"
      : theme?.containerBorderRadius != null
        ? `${Math.min(theme.containerBorderRadius, 20)}px`
        : "14px";
  const containerBorder = theme?.containerBorderColor
    ? hexToRgba(theme.containerBorderColor, theme.containerBorderOpacity ?? 25)
    : "rgba(231, 199, 104, 0.35)";
  const containerBorderWidth =
    theme?.containerBorderWidth != null ? `${theme.containerBorderWidth}px` : "1px";
  const iconColor = theme?.iconColor || "#E7C768";
  const boldColor = theme?.boldTextColor || "#FFFFFF";
  const bodyColor = theme?.bodyTextColor || "#FFFFFF";
  const fontFamily = theme?.fontFamily || undefined;

  const displayScore = Number.isFinite(Number(score))
    ? Math.round(Number(score) * 100) / 100
    : 0;

  return (
    <div className="space-y-4" data-testid="cand-training-stage" style={{ fontFamily }}>
      <div
        className="p-4 flex items-center gap-3 border bg-transparent backdrop-blur-md transition-colors shadow-lg"
        style={{
          borderRadius: containerRadius,
          borderColor: passed ? iconColor : containerBorder,
          borderWidth: containerBorderWidth,
        }}
      >
        {passed ? (
          <CheckCircle2 className="w-8 h-8 shrink-0" style={{ color: iconColor }} />
        ) : (
          <AlertCircle className="w-8 h-8 shrink-0" style={{ color: iconColor }} />
        )}
        <div className="flex-1 min-w-0">
          <div className="text-base font-bold" style={{ color: boldColor, fontFamily }}>
            {passed ? "Этап сдан!" : "Не сдан — попробуйте ещё раз"}
          </div>
          <div className="text-sm opacity-90" style={{ color: bodyColor, fontFamily }}>
            Ваш балл: {displayScore} / {max} (проходной {passScore})
          </div>
        </div>
      </div>

      {summaryText && (
        <div
          className="p-4 border bg-transparent backdrop-blur-md space-y-1.5"
          style={{
            borderRadius: itemRadius,
            borderColor: containerBorder,
            borderWidth: containerBorderWidth,
          }}
        >
          <Section title="Общий вывод" iconColor={iconColor} fontFamily={fontFamily}>
            <p className="text-sm leading-relaxed break-words" style={{ color: bodyColor, fontFamily }}>
              {summaryText}
            </p>
          </Section>
        </div>
      )}

      {!!normalized.strengths?.length && (
        <Section title="Что получилось" iconColor={iconColor} fontFamily={fontFamily}>
          <ul className="text-sm space-y-1 list-disc list-inside" style={{ color: bodyColor, fontFamily }}>
            {normalized.strengths.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </Section>
      )}

      {!!normalized.areas_to_improve?.length && (
        <Section title="Что стоит повторить" iconColor={iconColor} fontFamily={fontFamily}>
          <ul className="text-sm space-y-1 list-disc list-inside" style={{ color: bodyColor, fontFamily }}>
            {normalized.areas_to_improve.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </Section>
      )}

      {!!normalized.next_steps?.length && (
        <Section title="Следующие шаги" iconColor={iconColor} fontFamily={fontFamily}>
          <ul className="text-sm space-y-1.5 list-none" style={{ color: bodyColor, fontFamily }}>
            {normalized.next_steps.map((s, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <Sparkles className="w-4 h-4 mt-0.5 shrink-0" style={{ color: iconColor, stroke: iconColor }} />
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {Array.isArray(perQuestionLegacy) && perQuestionLegacy.length > 0 && (
        <Section title="Разбор вопросов" iconColor={iconColor} fontFamily={fontFamily}>
          <div className="space-y-2.5 max-h-[28rem] overflow-y-auto pr-1">
            {perQuestionLegacy.map((pq: any, idx: number) => {
              const qScore = Number.isFinite(Number(pq.score))
                ? Math.round(Number(pq.score) * 100) / 100
                : 0;
              return (
                <div
                  key={pq.id || idx}
                  className="bg-transparent border p-3.5 text-sm space-y-1.5 backdrop-blur-md"
                  style={{
                    borderRadius: itemRadius,
                    borderColor: containerBorder,
                    borderWidth: containerBorderWidth,
                    fontFamily,
                  }}
                >
                  <div className="flex items-start justify-between gap-2 text-sm">
                    <span className="font-semibold break-words" style={{ color: boldColor }}>
                      {pq.question ? pq.question : `Вопрос ${idx + 1}`}
                    </span>
                    <span
                      className="font-mono font-bold shrink-0 ml-2"
                      style={{ color: qScore === pq.max ? iconColor : bodyColor }}
                    >
                      {qScore}/{pq.max} б.
                    </span>
                  </div>
                  {pq.what_was_right && qScore > 0 && (
                    <div className="text-sm mt-1 opacity-95" style={{ color: bodyColor }}>
                      <span className="font-semibold" style={{ color: iconColor }}>Что зачтено: </span>
                      {pq.what_was_right}
                    </div>
                  )}
                  {pq.what_was_wrong && (
                    <div className="text-sm mt-1 opacity-90" style={{ color: bodyColor }}>
                      <span className="font-semibold" style={{ color: iconColor }}>Что улучшить: </span>
                      {pq.what_was_wrong}
                    </div>
                  )}
                  {pq.comment && !pq.what_was_wrong && !pq.what_was_right && (
                    <div className="text-sm mt-1 opacity-85" style={{ color: bodyColor }}>
                      {pq.comment}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Section>
      )}
    </div>
  );
}