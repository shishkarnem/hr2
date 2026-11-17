import React, { useMemo } from "react";
import { Wallet, CreditCard, TrendingUp, Calendar, ShieldCheck, Banknote } from "lucide-react";

export interface CandidatePayoutsBlockProps {
  payoutsText?: string;
  salaryTerms?: string;
  activeTheme?: any;
}

interface PayoutItem {
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

export const CandidatePayoutsBlock: React.FC<CandidatePayoutsBlockProps> = ({
  payoutsText,
  salaryTerms,
  activeTheme,
}) => {
  const rawText = (payoutsText || salaryTerms || "").trim();

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

  // Parse text into structured payout components
  const items = useMemo<PayoutItem[]>(() => {
    if (!rawText) {
      return [
        {
          id: "fix",
          title: "Фиксированная часть",
          value: "Условия оклада уточняются",
          desc: "Базовая гарантированная ставка за расчетный период",
          icon: Wallet,
        },
        {
          id: "kpi",
          title: "Премиальная часть (KPI)",
          value: "Бонусы по результатам",
          desc: "Дополнительные начисления за перевыполнение показателей",
          icon: TrendingUp,
        },
        {
          id: "dates",
          title: "Регламент выплат",
          value: "Регулярные перечисления",
          desc: "Выплаты производятся дважды в месяц в установленные дни",
          icon: Calendar,
        },
      ];
    }

    const lines = rawText
      .split(/\n+/)
      .map((l) => l.replace(/^[•\s\-*]+/, "").trim())
      .filter(Boolean);

    const parsed: PayoutItem[] = [];

    lines.forEach((line, idx) => {
      const lower = line.toLowerCase();
      let icon = Banknote;
      let title = "Условие дохода";

      if (lower.includes("оклад") || lower.includes("фикс") || lower.includes("база")) {
        icon = Wallet;
        title = "Окладная часть и доход";
      } else if (lower.includes("kpi") || lower.includes("преми") || lower.includes("бонус") || lower.includes("процент")) {
        icon = TrendingUp;
        title = "Премии и KPI";
      } else if (lower.includes("выплат") || lower.includes("числа") || lower.includes("карт") || lower.includes("срок")) {
        icon = Calendar;
        title = "Сроки и порядок выплат";
      } else if (lower.includes("тк") || lower.includes("ип") || lower.includes("самозан") || lower.includes("оформлен") || lower.includes("договор")) {
        icon = ShieldCheck;
        title = "Формат оформления";
      } else {
        icon = CreditCard;
        title = `Пункт ${idx + 1}`;
      }

      parsed.push({
        id: `payout_item_${idx}`,
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
        <ShieldCheck className="w-5 h-5 shrink-0" style={{ color: iconColor }} />
        <span>
          Все начисления и финансовые условия фиксируются в трудовом договоре или соглашении при оформлении в компанию.
        </span>
      </div>
    </div>
  );
};

export default CandidatePayoutsBlock;
