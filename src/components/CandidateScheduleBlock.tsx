import React, { useMemo } from "react";
import { Calendar, Clock, Laptop, Building2, Coffee, CheckCircle } from "lucide-react";

export interface CandidateScheduleBlockProps {
  scheduleText?: string;
  scheduleTerms?: string;
  activeTheme?: any;
}

interface ScheduleItem {
  id: string;
  title: string;
  value: string;
  desc?: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
}

function hexToRgba(hex: string, alphaPercent: number = 100): string {
  if (!hex || typeof hex !== "string") return `rgba(255, 255, 255, ${alphaPercent / 100})`;
  let clean = hex.replace("#", "").trim();
  if (clean.length === 3) {
    clean = clean.split("").map((c) => c + c).join("");
  }
  if (clean.length !== 6) return `rgba(255, 255, 255, ${alphaPercent / 100})`;
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  const a = Math.max(0, Math.min(100, alphaPercent)) / 100;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

export const CandidateScheduleBlock: React.FC<CandidateScheduleBlockProps> = ({
  scheduleText,
  scheduleTerms,
  activeTheme,
}) => {
  const rawText = (scheduleText || scheduleTerms || "").trim();

  const iconColor = activeTheme?.iconColor || (activeTheme?.headingsColorMode === "solid" ? activeTheme?.headingsSolidColor || "#FFFFFF" : "#FFFFFF");
  const boldColor = activeTheme?.boldTextColor || (activeTheme?.headingsColorMode === "solid" ? activeTheme?.headingsSolidColor || "#FFFFFF" : "#FFFFFF");
  const fontFamily = activeTheme?.fontFamily || undefined;

  const headingStyle = useMemo<React.CSSProperties>(() => {
    if (activeTheme?.headingsColorMode === "gradient-silver") {
      return {
        fontFamily,
        backgroundImage: "linear-gradient(to right, #FFFFFF, #E2E8F0, #94A3B8)",
        WebkitBackgroundClip: "text",
        backgroundClip: "text",
        WebkitTextFillColor: "transparent",
        color: "transparent",
      };
    }
    if (activeTheme?.headingsColorMode === "solid") {
      const color = activeTheme?.headingsSolidColor || "#FFFFFF";
      return {
        fontFamily,
        color,
        WebkitTextFillColor: color,
      };
    }
    return {
      fontFamily,
      backgroundImage: "linear-gradient(to right, #F5E296, #D4AF37, #AA771C)",
      WebkitBackgroundClip: "text",
      backgroundClip: "text",
      WebkitTextFillColor: "transparent",
      color: "transparent",
    };
  }, [activeTheme, fontFamily]);

  const cardStyle = useMemo<React.CSSProperties>(() => {
    return {
      backgroundColor: "transparent",
      backdropFilter: `blur(${activeTheme?.glassBlurPx ?? 24}px)`,
      WebkitBackdropFilter: `blur(${activeTheme?.glassBlurPx ?? 24}px)`,
      borderColor: activeTheme?.containerBorderColor
        ? hexToRgba(activeTheme.containerBorderColor, activeTheme.containerBorderOpacity ?? 20)
        : "rgba(255, 255, 255, 0.25)",
      borderWidth: `${activeTheme?.containerBorderWidth ?? 1}px`,
      borderRadius: activeTheme?.containerBorderRadius != null ? `${activeTheme.containerBorderRadius}px` : "16px",
      fontFamily,
    };
  }, [activeTheme, fontFamily]);

  const items = useMemo<ScheduleItem[]>(() => {
    if (!rawText) {
      return [
        {
          id: "format",
          title: "График работы",
          value: "Формат согласовывается на собеседовании",
          desc: "Стандартная рабочая неделя с возможностью гибкого начала дня",
          icon: Calendar,
        },
        {
          id: "hours",
          title: "Режим смены",
          value: "Рабочее время",
          desc: "Продолжительность смены и регламентированные перерывы",
          icon: Clock,
        },
      ];
    }

    const lines = rawText
      .split(/\n+/)
      .map((l) => l.replace(/^[•\s\-*]+/, "").trim())
      .filter(Boolean);

    const parsed: ScheduleItem[] = [];

    lines.forEach((line, idx) => {
      const lower = line.toLowerCase();
      let icon = Calendar;
      let title = "Параметр графика";

      if (lower.includes("гибрид") || lower.includes("удал") || lower.includes("офис") || lower.includes("дистанцион")) {
        icon = Laptop;
        title = "Формат и локация работы";
      } else if (lower.includes("5/2") || lower.includes("2/2") || lower.includes("смен") || lower.includes("график") || lower.includes("режим")) {
        icon = Calendar;
        title = "Рабочие дни и график";
      } else if (lower.includes("встреч") || lower.includes("комитет") || lower.includes("синхрон") || lower.includes("планерк") || lower.includes("митинг")) {
        icon = Building2;
        title = "Командные синхронизации";
      } else if (lower.includes("час") || lower.includes("время") || lower.includes("00") || lower.includes("утро") || lower.includes("вечер")) {
        icon = Clock;
        title = "Часы работы и смены";
      } else if (lower.includes("перерыв") || lower.includes("обед") || lower.includes("отдых")) {
        icon = Coffee;
        title = "Перерывы и отдых";
      } else {
        icon = CheckCircle;
        title = `Условие ${idx + 1}`;
      }

      parsed.push({
        id: `schedule_item_${idx}`,
        title,
        value: line,
        icon,
      });
    });

    return parsed;
  }, [rawText]);

  return (
    <div className="space-y-4 text-left">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        {items.map((item) => {
          const IconComp = item.icon;
          return (
            <div
              key={item.id}
              className="section-card liquid-glass-card p-5 border flex flex-col justify-between transition hover:border-white/40 shadow-lg"
              style={cardStyle}
            >
              <div>
                <div className="flex items-center gap-2.5 pb-2.5 border-b border-white/10 mb-3">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center border border-white/20 shrink-0"
                    style={{
                      borderRadius: activeTheme?.containerBorderRadius != null ? `${Math.max(0, activeTheme.containerBorderRadius - 4)}px` : "8px",
                      borderColor: activeTheme?.containerBorderColor || "rgba(255,255,255,0.25)",
                    }}
                  >
                    <IconComp className="w-4 h-4" style={{ color: iconColor }} />
                  </div>
                  <span className="text-sm font-bold" style={headingStyle}>
                    {item.title}
                  </span>
                </div>
                <p className="text-sm text-white font-medium leading-relaxed whitespace-pre-wrap">
                  {item.value}
                </p>
              </div>
              {item.desc && (
                <div className="mt-3 pt-2 text-sm text-white/70 border-t border-white/10">
                  {item.desc}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div
        className="section-card liquid-glass-card p-4 border flex items-center gap-3 text-sm text-white/90 shadow-md"
        style={cardStyle}
      >
        <Clock className="w-5 h-5 shrink-0" style={{ color: iconColor }} />
        <span>
          Точное распределение рабочего времени и дни присутствия при необходимости согласуются с руководителем.
        </span>
      </div>
    </div>
  );
};

export default CandidateScheduleBlock;
