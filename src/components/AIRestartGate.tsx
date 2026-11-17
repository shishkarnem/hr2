import React, { useMemo } from "react";
import { X } from "lucide-react";
import { useAIRestartOverlayVisible, dismissAIRestartOverlay } from "@/lib/aiReady";
import { rrImg } from "@/lib/img";
import { useTypewriter } from "@/hooks/useTypewriter";
import { getActiveCompanyTheme } from "@/components/AIWaitProvider";
import { hexToRgba } from "@/components/LandingStyleEditor";
import InteractiveLandingBackground from "@/components/InteractiveLandingBackground";

const IMG = "https://file.pro-talk.ru/tgf/GgMpJwQ9JCkYKglyGHQMDl0WOR0fETccDCUtbFUtHwVPfz9jLBt_GzIXJBcZEyJTNAssKy0_NkEKRzAWAwkpCiA-KD84NRQmEV9uZlUAaA11VQJrCjgDAzkkAVczLRouDiMXfQxTNBdFGT8aIyw2ZyIcIQsIKjIuHhtsBXZSBGZ5T3FP.png";

const PHRASES = [
  "Готовим ИИ к работе…",
  "Сбрасываю контекст…",
  "Подключаюсь к RR…",
  "Прогреваю модель…",
  "Минутку, почти готов…",
];

/**
 * Global overlay shown while /restart is in flight. The user can dismiss it —
 * the background /restart request keeps going, and AI-dependent buttons stay
 * gated via useAIReady() until it finishes.
 */
export const AIRestartGate: React.FC = () => {
  const visible = useAIRestartOverlayVisible();
  const [phraseIndex, setPhraseIndex] = React.useState(0);
  React.useEffect(() => {
    if (!visible) return;
    setPhraseIndex(0);
    const id = window.setInterval(() => {
      setPhraseIndex((i) => (i + 1) % PHRASES.length);
    }, 4200);
    return () => window.clearInterval(id);
  }, [visible]);
  const phrase = PHRASES[phraseIndex] || PHRASES[0];
  const typed = useTypewriter(visible ? phrase : "", 40);

  const theme = visible ? getActiveCompanyTheme() : null;
  const hasCompanyTheme = Boolean(theme && typeof theme === "object" && Object.keys(theme).length > 0);
  const isMonochrome = Boolean(
    theme?.allMediaMonochrome ||
    theme?.logoMonochrome ||
    theme?.pageBgMonochrome ||
    (theme?.headingsSolidColor === "#FFFFFF" && (theme?.pageBgColor === "#000000" || theme?.btnActiveBgColor === "#FFFFFF"))
  );

  const containerRadius = theme?.containerBorderRadius !== undefined
    ? (theme.containerBorderRadius === 999 ? "9999px" : `${theme.containerBorderRadius}px`)
    : "24px";
  const containerBorder = theme?.containerBorderColor
    ? hexToRgba(theme.containerBorderColor, theme.containerBorderOpacity ?? 25)
    : "rgba(231, 199, 104, 0.35)";
  const containerWidth = theme?.containerBorderWidth !== undefined
    ? `${theme.containerBorderWidth}px`
    : "1px";
  const containerBlurPx = theme?.glassBlurPx ?? 24;
  const containerBg = useMemo(() => {
    if (!hasCompanyTheme) return "transparent";
    const pageOp = theme?.pageBgOpacity !== undefined ? Number(theme.pageBgOpacity) : 100;
    const contOp = theme?.containerBgOpacity !== undefined ? Number(theme.containerBgOpacity) : 0;
    if (isMonochrome && contOp === 0 && pageOp === 100) return "transparent";
    if (pageOp <= 0 && contOp <= 0) return "transparent";
    const bgHex = theme?.pageBgColor || theme?.containerBgColor || "#17344F";
    if (pageOp < 100) {
      return pageOp <= 0 ? "transparent" : hexToRgba(bgHex, pageOp);
    }
    if (contOp > 0) {
      return hexToRgba(theme?.pageBgColor || theme?.containerBgColor || "#17344F", contOp);
    }
    return "transparent";
  }, [hasCompanyTheme, isMonochrome, theme?.pageBgColor, theme?.pageBgOpacity, theme?.containerBgColor, theme?.containerBgOpacity]);

  const showWaves = hasCompanyTheme ? theme?.showWaveAnimation !== false : false;
  const showSphere = hasCompanyTheme ? Boolean(theme?.showSphereAnimation) : false;

  const bgThemeColors = useMemo(() => {
    if (!hasCompanyTheme) return undefined;
    return {
      headingColor: theme?.headingsSolidColor || "#E7C768",
      bodyTextColor: theme?.bodyTextColor || "#FFFFFF",
      boldTextColor: theme?.boldTextColor || "#FFFFFF",
      iconColor: theme?.iconColor || theme?.headingsSolidColor || "#E7C768",
      headingsColorMode: theme?.headingsColorMode || "solid",
      isMonochrome,
    };
  }, [
    hasCompanyTheme,
    theme?.headingsSolidColor,
    theme?.bodyTextColor,
    theme?.boldTextColor,
    theme?.iconColor,
    theme?.headingsColorMode,
    isMonochrome,
  ]);

  if (!visible) return null;

  const fontFamily = theme?.fontFamily || undefined;
  const bodyTextColor = theme?.bodyTextColor || "#FFFFFF";
  const accentColor = isMonochrome ? "#FFFFFF" : (theme?.iconColor || theme?.headingsSolidColor || "#E7C768");
  const btnRadius = theme?.btnBorderRadius !== undefined
    ? (theme.btnBorderRadius === 999 ? "9999px" : `${theme.btnBorderRadius}px`)
    : "16px";
  const bubbleBg = theme && (theme.containerBgOpacity ?? 0) > 0 && theme.containerBgColor
    ? hexToRgba(theme.containerBgColor, Math.min(55, theme.containerBgOpacity))
    : "transparent";

  return (
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center bg-transparent backdrop-blur-md p-4"
      style={{ fontFamily }}
    >
      <div
        className="relative w-full max-w-md border bg-transparent backdrop-blur-2xl p-6 shadow-2xl overflow-hidden"
        style={{
          borderRadius: containerRadius,
          borderColor: containerBorder,
          borderWidth: containerWidth,
          borderStyle: "solid",
          backgroundColor: containerBg,
          backdropFilter: `blur(${containerBlurPx}px)`,
          WebkitBackdropFilter: `blur(${containerBlurPx}px)`,
          color: bodyTextColor,
          fontFamily,
        }}
      >
        {hasCompanyTheme && (showWaves || showSphere) && (
          <InteractiveLandingBackground
            containerMode
            showBadges={false}
            showWaves={showWaves}
            showSphere={showSphere}
            scale={0.7}
            borderRadius={containerRadius}
            themeColors={bgThemeColors}
          />
        )}
        <button
          type="button"
          onClick={dismissAIRestartOverlay}
          aria-label="Закрыть"
          className="absolute top-3 right-3 z-20 w-8 h-8 rounded-full bg-transparent border border-white/25 text-white flex items-center justify-center transition cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        <div
          className="relative z-10 mb-4 text-center text-sm font-bold"
          style={
            theme?.headingsSolidColor
              ? { color: theme.headingsSolidColor, fontFamily }
              : {
                  backgroundImage: "linear-gradient(to right, #F4EE8E, #E7C768, #D99E41)",
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  color: "transparent",
                  fontFamily,
                }
          }
        >
          Подготовка ИИ
        </div>

        <div className="relative z-10 flex items-end gap-3 min-h-[120px]">
          <div className="flex-1 relative">
            <div
              className="px-4 py-3 text-sm font-medium shadow-lg border min-h-[72px] flex items-center backdrop-blur-md"
              style={{
                borderRadius: btnRadius,
                borderWidth: containerWidth,
                borderStyle: "solid",
                backgroundColor: bubbleBg,
                borderColor: containerBorder,
                color: bodyTextColor,
                fontFamily,
              }}
            >
              <div className="relative w-full">
                <span className="invisible block select-none whitespace-pre-wrap break-words" aria-hidden="true">
                  {phrase}
                </span>
                <span className="absolute inset-0 flex items-center whitespace-pre-wrap break-words" style={{ color: bodyTextColor }}>
                  {typed}
                </span>
              </div>
            </div>
            <div
              className="absolute -right-1.5 bottom-4 w-3 h-3 rotate-45 border-t border-r"
              style={{
                backgroundColor: bubbleBg === "transparent" ? (containerBg !== "transparent" ? containerBg : "transparent") : bubbleBg,
                borderColor: containerBorder,
              }}
            />
          </div>
          <img
            src={rrImg(IMG, 112)}
            alt="Робот Рекрутер"
            loading="eager"
            referrerPolicy="no-referrer"
            className="w-28 h-28 object-contain drop-shadow-xl shrink-0 self-end relative z-10"
            onError={(e) => { (e.currentTarget as HTMLImageElement).src = rrImg(IMG); }}
            style={
              isMonochrome
                ? { filter: "grayscale(100%) drop-shadow(0 0 16px rgba(255, 255, 255, 0.35))" }
                : undefined
            }
          />
        </div>

        <div className="relative z-10 mt-4 text-center text-sm opacity-90" style={{ color: bodyTextColor }}>
          Можно закрыть это окно — ИИ продолжит готовиться в фоне.
        </div>

        <div className="relative z-10 mt-3 flex justify-center gap-1.5" aria-hidden="true">
          {PHRASES.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${i === phraseIndex ? "w-6" : "w-1.5 opacity-35"}`}
              style={{ backgroundColor: i === phraseIndex ? accentColor : bodyTextColor }}
            />
          ))}
        </div>

        <div className="relative z-10 mt-3 flex justify-center">
          <button
            type="button"
            onClick={dismissAIRestartOverlay}
            className="border bg-transparent backdrop-blur-md px-4 py-2 text-sm font-bold transition cursor-pointer"
            style={{
              borderRadius: btnRadius,
              borderColor: containerBorder,
              color: bodyTextColor,
              fontFamily,
            }}
          >
            Закрыть и продолжить в фоне
          </button>
        </div>
      </div>
    </div>
  );
};

export default AIRestartGate;