import React, { useMemo } from "react";
import { Layers, Database, BookOpen, MessageSquare, BarChart3, Kanban, Megaphone, CheckSquare, FileText } from "lucide-react";

export interface CandidateSystemBlockProps {
  systemText?: string;
  customWiki?: string;
  activeTheme?: any;
}

interface SystemPlatformItem {
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

export const CandidateSystemBlock: React.FC<CandidateSystemBlockProps> = ({
  systemText,
  customWiki,
  activeTheme,
}) => {
  const rawText = (systemText || customWiki || "").trim();

  const iconColor = activeTheme?.iconColor || (activeTheme?.headingsColorMode === "solid" ? activeTheme?.headingsSolidColor || "#FFFFFF" : "#FFFFFF");
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

  const items = useMemo<SystemPlatformItem[]>(() => {
    if (!rawText) {
      return [
        {
          id: "sys_default",
          title: "Рабочие инструменты",
          value: "Корпоративные сервисы, CRM и регламенты настраиваются в процессе онбординга.",
          icon: Layers,
        },
      ];
    }

    const lines = rawText
      .split(/\n+/)
      .map((l) => l.replace(/^[•\s\-*]+/, "").trim())
      .filter(Boolean);

    const parsed: SystemPlatformItem[] = [];

    lines.forEach((line, idx) => {
      const tagMatch = line.match(/^\[(.*?)\]\s*(.*)$/);
      let title = `Платформа ${idx + 1}`;
      let value = line;
      let desc: string | undefined;

      if (tagMatch) {
        title = tagMatch[1].trim();
        const parts = tagMatch[2].split("|");
        value = (parts[0] || "").trim();
        if (parts[1]) desc = parts[1].trim();
      }

      const lowerTitle = title.toLowerCase();
      const lowerVal = value.toLowerCase();
      let icon = Layers;

      if (lowerTitle.includes("crm") || lowerVal.includes("amocrm") || lowerVal.includes("bitrix")) {
        icon = Database;
      } else if (lowerTitle.includes("аналитик") || lowerVal.includes("power bi") || lowerVal.includes("метрика")) {
        icon = BarChart3;
      } else if (lowerTitle.includes("управлен") || lowerTitle.includes("проджект") || lowerVal.includes("jira") || lowerVal.includes("asana")) {
        icon = Kanban;
      } else if (lowerTitle.includes("маркетинг") || lowerVal.includes("sendpulse")) {
        icon = Megaphone;
      } else if (lowerTitle.includes("связь") || lowerTitle.includes("чат") || lowerVal.includes("telegram") || lowerVal.includes("slack") || lowerVal.includes("zoom")) {
        icon = MessageSquare;
      } else if (lowerTitle.includes("знаний") || lowerTitle.includes("wiki") || lowerTitle.includes("notion")) {
        icon = BookOpen;
      } else if (lowerTitle.includes("отчет") || lowerTitle.includes("регламент")) {
        icon = FileText;
      } else if (lowerTitle.includes("задач") || lowerVal.includes("план")) {
        icon = CheckSquare;
      }

      parsed.push({
        id: `sys_item_${idx}`,
        title,
        value: value || "Инструмент и регламент работы",
        desc,
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
        <Layers className="w-5 h-5 shrink-0" style={{ color: iconColor }} />
        <span>
          Доступы ко всем рабочим сервисам, корпоративным базам знаний и регламентам предоставляются в первый день.
        </span>
      </div>
    </div>
  );
};

export default CandidateSystemBlock;
