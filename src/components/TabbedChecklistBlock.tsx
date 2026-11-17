import React, { useState } from "react";
import { Sparkles, Check } from "lucide-react";
import { useLandingTheme } from "./LandingStyleEditor";

/**
 * Brand-styled tabbed block that parses lines in the format:
 *   [Tag] description | optional tip
 * Lines without [Tag] are rendered as a checklist below the tabs.
 * Reused on the public vacancy landing and inside the candidate cabinet
 * (terms/vacancy, terms/onboarding, terms/team, terms/system).
 */
export interface TabbedChecklistBlockProps {
  text: string;
  /** Header above the tabbed block. */
  tabsHeader?: string;
  /** Header above the checklist block. */
  checklistHeader?: string;
  /** Shown when both lists are empty. */
  emptyHint?: string;
  /** Explicit theme config override */
  activeTheme?: any;
}

function hexToRgba(hex: string, alphaPercent: number): string {
  if (!hex) return `rgba(255, 255, 255, ${alphaPercent / 100})`;
  let clean = hex.replace("#", "").trim();
  if (clean.length === 3) {
    clean = clean.split("").map((c) => c + c).join("");
  }
  if (clean.length !== 6) {
    return `rgba(255, 255, 255, ${alphaPercent / 100})`;
  }
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  const a = Math.max(0, Math.min(100, alphaPercent)) / 100;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

export const TabbedChecklistBlock: React.FC<TabbedChecklistBlockProps> = ({
  text,
  tabsHeader = "Интерактивный кабинет: ключевые блоки",
  checklistHeader = "Чек-лист по разделу",
  emptyHint = "Сведения по этому разделу пока не заполнены.",
  activeTheme: propTheme,
}) => {
  const { activeTheme: contextTheme } = useLandingTheme();
  const theme = propTheme || contextTheme;
  const allLines = (text || "")
    .split("\n")
    .map((l) => l.replace(/^[•\s\-*]+/, "").trim())
    .filter(Boolean);

  const tabs: { id: string; title: string; desc: string; tip: string }[] = [];
  const plain: string[] = [];
  allLines.forEach((l, idx) => {
    const m = l.match(/^\[(.*?)\]\s*(.*)$/);
    if (m) {
      const parts = m[2].split("|");
      tabs.push({
        id: `tab_${idx}`,
        title: m[1].trim(),
        desc: (parts[0] || "").trim(),
        tip: (parts[1] || "").trim(),
      });
    } else {
      plain.push(l);
    }
  });

  const [active, setActive] = useState(0);
  const activeTab = tabs[active] || tabs[0];

  if (tabs.length === 0 && plain.length === 0) {
    return (
      <div className="bg-transparent backdrop-blur-xl border border-white/20 p-4 rounded-xl text-sm text-slate-200 italic">
        {emptyHint}
      </div>
    );
  }

  const btnRadius = theme?.btnBorderRadius === 999
    ? "9999px"
    : theme?.btnBorderRadius != null
    ? `${theme.btnBorderRadius}px`
    : "12px";
  const iconColor = theme?.iconColor || (theme?.headingsColorMode === "solid" ? theme?.headingsSolidColor || "#FFFFFF" : "#FFFFFF");

  const headingStyle: React.CSSProperties = React.useMemo(() => {
    if (theme?.headingsColorMode === "gradient-gold") {
      return {
        backgroundImage: "linear-gradient(to right, #F5E296, #D4AF37, #AA771C)",
        WebkitBackgroundClip: "text",
        backgroundClip: "text",
        WebkitTextFillColor: "transparent",
        color: "transparent",
      };
    }
    if (theme?.headingsColorMode === "gradient-silver") {
      return {
        backgroundImage: "linear-gradient(to right, #FFFFFF, #E2E8F0, #94A3B8)",
        WebkitBackgroundClip: "text",
        backgroundClip: "text",
        WebkitTextFillColor: "transparent",
        color: "transparent",
      };
    }
    const solid = theme?.headingsSolidColor || "#FFFFFF";
    return {
      color: solid,
      WebkitTextFillColor: solid,
    };
  }, [theme]);

  const cardStyle: React.CSSProperties = {
    backgroundColor: "transparent",
    backdropFilter: `blur(${theme?.glassBlurPx ?? 24}px)`,
    WebkitBackdropFilter: `blur(${theme?.glassBlurPx ?? 24}px)`,
    borderColor: theme ? hexToRgba(theme.containerBorderColor || "#FFFFFF", theme.containerBorderOpacity ?? 20) : "rgba(255, 255, 255, 0.25)",
    borderWidth: `${theme?.containerBorderWidth ?? 1}px`,
    borderRadius: theme?.containerBorderRadius != null ? `${theme.containerBorderRadius}px` : "16px",
  };

  const activeBtnStyle: React.CSSProperties = {
    borderRadius: btnRadius,
    backgroundColor: theme ? hexToRgba(theme.btnActiveBgColor || "#E7C768", theme.btnActiveOpacity ?? 100) : "#FFFFFF",
    color: theme?.btnActiveTextColor || "#000000",
    borderColor: theme ? hexToRgba(theme.btnBorderColor || "#FFFFFF", theme.btnBorderOpacity ?? 20) : "rgba(255, 255, 255, 0.25)",
    borderWidth: `${theme?.btnBorderWidth ?? 1}px`,
  };

  const inactiveBtnStyle: React.CSSProperties = {
    borderRadius: btnRadius,
    backgroundColor: "transparent",
    color: theme?.btnInactiveTextColor || "#FFFFFF",
    borderColor: theme ? hexToRgba(theme.btnBorderColor || "#FFFFFF", theme.btnBorderOpacity ?? 20) : "rgba(255, 255, 255, 0.25)",
    borderWidth: `${theme?.btnBorderWidth ?? 1}px`,
    backdropFilter: `blur(${theme?.glassBlurPx ?? 24}px)`,
    WebkitBackdropFilter: `blur(${theme?.glassBlurPx ?? 24}px)`,
  };

  return (
    <div className="space-y-5 text-left">
      {tabs.length > 0 && activeTab && (
        <div
          className="section-card liquid-glass-card bg-transparent backdrop-blur-2xl border border-white/20 p-5 space-y-4 shadow-xl"
          style={cardStyle}
        >
          <div className="flex items-center gap-2.5 pb-3 border-b border-white/10">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center border border-white/20 shrink-0"
              style={{
                borderRadius: theme?.containerBorderRadius != null ? `${Math.max(0, theme.containerBorderRadius - 4)}px` : "8px",
                borderColor: theme?.containerBorderColor || "rgba(255,255,255,0.25)",
              }}
            >
              <Sparkles className="w-4 h-4" style={{ color: iconColor }} />
            </div>
            <div>
              <h4 className="text-sm font-bold" style={headingStyle}>
                {tabsHeader}
              </h4>
              <p className="text-sm text-slate-300 block mt-0.5">
                Выберите пункт, чтобы изучить подробнее.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {tabs.map((tab, idx) => {
              const isActive = active === idx;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActive(idx)}
                  className={`transition text-sm font-bold px-3.5 py-2 border text-center cursor-pointer whitespace-nowrap ${
                    isActive
                      ? "landing-btn-active shadow-md"
                      : "landing-btn-inactive hover:bg-white/10"
                  }`}
                  style={isActive ? activeBtnStyle : inactiveBtnStyle}
                >
                  {tab.title}
                </button>
              );
            })}
          </div>

          <div className="pt-2 border-t border-white/10 space-y-2.5">
            <div className="space-y-1.5">
              <span className="text-sm font-bold block" style={headingStyle}>
                {activeTab.title}
              </span>
              <p className="text-sm text-white font-medium leading-relaxed whitespace-pre-wrap">
                {activeTab.desc}
              </p>
            </div>
            {activeTab.tip && (
              <div className="text-sm text-white/80 font-normal leading-normal pt-2 border-t border-white/10">
                {activeTab.tip}
              </div>
            )}
          </div>
        </div>
      )}

      {plain.length > 0 && (
        <div
          className="section-card liquid-glass-card bg-transparent backdrop-blur-2xl border border-white/20 p-5 space-y-3.5 shadow-xl"
          style={cardStyle}
        >
          <span className="text-sm font-bold block" style={headingStyle}>
            {checklistHeader}
          </span>
          <div className="space-y-2.5">
            {plain.map((row, i) => {
              const numMatch = row.match(/^(\d+)[\.\)]\s*(.*)$/);
              if (numMatch) {
                return (
                  <div key={i} className="flex items-start gap-2.5 text-sm text-white">
                    <span
                      className="w-5 h-5 rounded-full bg-transparent border flex items-center justify-center shrink-0 text-xs font-bold font-mono"
                      style={{ borderColor: hexToRgba(iconColor, 50), color: iconColor }}
                    >
                      {numMatch[1]}
                    </span>
                    <span className="whitespace-pre-wrap">{numMatch[2]}</span>
                  </div>
                );
              }
              return (
                <div key={i} className="flex items-start gap-2.5 text-sm text-white">
                  <Check className="w-5 h-5 shrink-0 mt-0.5" style={{ color: iconColor }} />
                  <span className="whitespace-pre-wrap">{row}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default TabbedChecklistBlock;