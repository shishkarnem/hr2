import React, { useMemo } from "react";
import { rrImg } from "@/lib/img";
import { useTypewriter } from "@/hooks/useTypewriter";
import { brandImage } from "@/config";
import { ensureGoogleFontLoaded, hexToRgba } from "@/components/LandingStyleEditor";
import InteractiveLandingBackground from "@/components/InteractiveLandingBackground";

export const IMG_LOADING = "/files/8/rr7.png";
export const IMG_SUCCESS = "/files/7/rr6.png";
export const IMG_ERROR = "/files/5/rr4.png";

export const STAGES: string[] = [
  "Подготавливаем данные",
  "Изучаем контекст",
  "Анализируем ответы",
  "Проверяем результат",
  "Формируем вывод",
  "Сохраняем результат",
];

export function getActiveCompanyTheme(explicitTheme?: any): any {
  if (explicitTheme && typeof explicitTheme === "object" && Object.keys(explicitTheme).length > 0) {
    return explicitTheme;
  }
  if (typeof window !== "undefined") {
    const win = window as any;
    if (win.__ACTIVE_COMPANY_THEME && typeof win.__ACTIVE_COMPANY_THEME === "object" && Object.keys(win.__ACTIVE_COMPANY_THEME).length > 0) {
      return win.__ACTIVE_COMPANY_THEME;
    }
    if (
      typeof document !== "undefined" &&
      document.getElementById("landing-custom-theme-styles") &&
      win.__ACTIVE_LANDING_THEME &&
      typeof win.__ACTIVE_LANDING_THEME === "object" &&
      Object.keys(win.__ACTIVE_LANDING_THEME).length > 0
    ) {
      return win.__ACTIVE_LANDING_THEME;
    }
  }
  return null;
}

export interface OverlayProps {
  status: "loading" | "success" | "error";
  title: string;
  phrase: string;
  phraseSeq?: number;
  elapsed: number;
  error: string;
  autoCloseOnSuccess: boolean;
  showFallback: boolean;
  fallbackBusy: boolean;
  onFallback: () => void;
  onRetry: () => void;
  onCancel: () => void;
  onNext: () => void;
  theme?: any;
}

export const StageProgress: React.FC<{ elapsed: number; accentColor?: string; bodyTextColor?: string }> = ({
  elapsed,
  accentColor = "#E7C768",
  bodyTextColor = "#FFFFFF",
}) => {
  const stageIdx = Math.min(STAGES.length - 1, Math.floor(elapsed / 4));
  const widthPct = Math.min(90, Math.round(90 * (1 - Math.exp(-elapsed / 18))));
  return (
    <div className="relative z-10 mt-4 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div
          className="text-sm font-semibold truncate"
          style={{ color: bodyTextColor }}
          aria-live="polite"
        >
          {STAGES[stageIdx]}…
        </div>
        <div
          className="text-sm font-mono tabular-nums shrink-0 opacity-85"
          style={{ color: bodyTextColor }}
        >
          {elapsed}s
        </div>
      </div>
      <div
        className="relative h-1.5 w-full overflow-hidden rounded-full bg-white/15"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Идёт обработка"
      >
        <div
          className="h-full rounded-full transition-[width] duration-700 ease-out"
          style={{
            width: `${widthPct}%`,
            background: `linear-gradient(to right, ${accentColor}, #FFFFFF, ${accentColor})`,
          }}
        />
        <div className="pointer-events-none absolute inset-0 -translate-x-full animate-[aiwait-shimmer_2.4s_linear_infinite] bg-gradient-to-r from-transparent via-white/30 to-transparent" />
      </div>
      <div className="flex items-center justify-between gap-1.5">
        {STAGES.map((_, i) => (
          <span
            key={i}
            aria-hidden
            className="h-1 flex-1 rounded-full transition-colors"
            style={
              i <= stageIdx
                ? { backgroundColor: accentColor, opacity: i < stageIdx ? 0.65 : 1 }
                : { backgroundColor: "rgba(255, 255, 255, 0.2)" }
            }
          />
        ))}
      </div>
      <div className="text-sm text-center opacity-85" style={{ color: bodyTextColor }}>
        Не закрывайте окно — идёт обработка
      </div>
    </div>
  );
};

export const Overlay: React.FC<OverlayProps> = ({
  status,
  title,
  phrase,
  elapsed,
  error,
  autoCloseOnSuccess,
  showFallback,
  fallbackBusy,
  onFallback,
  onRetry,
  onCancel,
  onNext,
  theme: propTheme,
}) => {
  const theme = getActiveCompanyTheme(propTheme);
  const hasCompanyTheme = Boolean(theme && typeof theme === "object" && Object.keys(theme).length > 0);
  const img = status === "loading" ? IMG_LOADING : status === "success" ? IMG_SUCCESS : IMG_ERROR;

  const bubbleText =
    status === "loading"
      ? phrase
      : status === "success"
      ? "Готово! Ответ получен"
      : "Не удалось завершить проверку…";
  const typed = useTypewriter(bubbleText, 90);

  const isMonochrome = Boolean(
    theme?.allMediaMonochrome ||
    theme?.logoMonochrome ||
    theme?.pageBgMonochrome ||
    (theme?.headingsSolidColor === "#FFFFFF" &&
      (theme?.pageBgColor === "#000000" || theme?.btnActiveBgColor === "#FFFFFF"))
  );

  const containerRadius =
    theme?.containerBorderRadius !== undefined
      ? theme.containerBorderRadius === 999
        ? "9999px"
        : `${theme.containerBorderRadius}px`
      : "24px";
  const containerBorder = theme?.containerBorderColor
    ? hexToRgba(theme.containerBorderColor, theme.containerBorderOpacity ?? 25)
    : "rgba(231, 199, 104, 0.35)";
  const containerWidth =
    theme?.containerBorderWidth !== undefined ? `${theme.containerBorderWidth}px` : "1px";
  const containerBlurPx = theme?.glassBlurPx ?? 24;

  const containerBg = useMemo(() => {
    if (!hasCompanyTheme) return "transparent";
    const pageOp = theme?.pageBgOpacity !== undefined ? Number(theme.pageBgOpacity) : 100;
    const contOp = theme?.containerBgOpacity !== undefined ? Number(theme.containerBgOpacity) : 0;
    if (pageOp > 0 && theme?.pageBgColor) {
      return hexToRgba(theme.pageBgColor, pageOp);
    }
    if (contOp > 0 && theme?.containerBgColor) {
      return hexToRgba(theme.containerBgColor, contOp);
    }
    return "transparent";
  }, [hasCompanyTheme, theme?.pageBgColor, theme?.pageBgOpacity, theme?.containerBgColor, theme?.containerBgOpacity]);

  const backdropBg = useMemo(() => {
    if (!hasCompanyTheme || !theme?.pageBgColor) return "transparent";
    const pageOp = theme?.pageBgOpacity !== undefined ? Number(theme.pageBgOpacity) : 100;
    if (pageOp <= 0) return "transparent";
    return hexToRgba(theme.pageBgColor, Math.min(65, Math.round(pageOp * 0.65)));
  }, [hasCompanyTheme, theme?.pageBgColor, theme?.pageBgOpacity]);

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
  }, [hasCompanyTheme, theme?.headingsSolidColor, theme?.bodyTextColor, theme?.boldTextColor, theme?.iconColor, theme?.headingsColorMode, isMonochrome]);

  const fontFamily = theme?.fontFamily || undefined;
  const bodyTextColor = theme?.bodyTextColor || "#FFFFFF";
  const accentColor = isMonochrome
    ? "#FFFFFF"
    : theme?.iconColor || theme?.headingsSolidColor || "#E7C768";

  let titleStyle: React.CSSProperties = { fontFamily, color: accentColor };
  if (!isMonochrome && theme?.headingsColorMode === "gradient-silver") {
    titleStyle = {
      fontFamily,
      backgroundImage: "linear-gradient(135deg, #FFFFFF, #E2E8F0, #94A3B8)",
      WebkitBackgroundClip: "text",
      backgroundClip: "text",
      color: "transparent",
    };
  }

  const blockBg = useMemo(() => {
    if (!hasCompanyTheme || !(theme?.containerBgOpacity > 0) || !theme?.containerBgColor) return "transparent";
    return hexToRgba(theme.containerBgColor, Number(theme.containerBgOpacity));
  }, [hasCompanyTheme, theme?.containerBgColor, theme?.containerBgOpacity]);

  const mascotSrc = rrImg(img, 128);
  const mascotFilter = isMonochrome
    ? "grayscale(100%) drop-shadow(0 0 16px rgba(255, 255, 255, 0.35))"
    : `drop-shadow(0 0 16px ${hexToRgba(accentColor, 55)})`;

  const btnRadius =
    theme?.btnBorderRadius !== undefined
      ? theme.btnBorderRadius === 999
        ? "9999px"
        : `${theme.btnBorderRadius}px`
      : "14px";
  const btnBorder = theme?.btnBorderColor
    ? hexToRgba(theme.btnBorderColor, theme?.btnBorderOpacity ?? 40)
    : "rgba(231, 199, 104, 0.4)";
  const btnWidth = theme?.btnBorderWidth !== undefined ? `${theme.btnBorderWidth}px` : "1px";

  const activeBtnBg = theme?.btnActiveBgColor
    ? hexToRgba(theme.btnActiveBgColor, theme?.btnActiveBgOpacity ?? 100)
    : "linear-gradient(135deg, #E7C768, #C29B38)";
  const activeBtnColor = theme?.btnActiveTextColor || "#17344F";

  const inactiveBtnBg = theme?.btnInactiveBgColor
    ? hexToRgba(theme.btnInactiveBgColor, theme?.btnInactiveBgOpacity ?? 15)
    : "rgba(255, 255, 255, 0.08)";
  const inactiveBtnColor = theme?.btnInactiveTextColor || "#FFFFFF";

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-transparent backdrop-blur-md p-4 animate-fade-in"
      style={{ fontFamily, backgroundColor: backdropBg }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="relative w-full max-w-md p-6 shadow-2xl overflow-hidden border bg-transparent backdrop-blur-2xl"
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

        <div className="relative z-10 mb-3 flex items-center justify-between gap-3">
          <div className="text-base font-bold truncate tracking-wide" style={titleStyle}>
            {title}
          </div>
          {status === "loading" && (
            <div className="flex items-center gap-2 shrink-0">
              <span className="w-2.5 h-2.5 rounded-full animate-ping" style={{ backgroundColor: accentColor }} />
              <span className="text-sm font-mono tabular-nums opacity-90" style={{ color: bodyTextColor }}>
                {elapsed}s
              </span>
            </div>
          )}
        </div>

        <div className="relative z-10 flex items-end gap-3 min-h-[140px]">
          <div className="flex-1">
            <div
              className="px-4 py-3 text-sm font-medium shadow-lg border backdrop-blur-md leading-relaxed"
              style={{
                borderRadius: btnRadius,
                borderWidth: containerWidth,
                borderStyle: "solid",
                backgroundColor: blockBg,
                borderColor: containerBorder,
                color: bodyTextColor,
                fontFamily,
              }}
            >
              {typed}
              {status === "loading" && (
                <span className="inline-block w-1.5 h-4 ml-1 align-middle animate-pulse" style={{ backgroundColor: accentColor }} />
              )}
            </div>

            {status === "error" && error && (
              <div
                className="mt-3 border px-3 py-2 text-sm backdrop-blur-md leading-snug"
                style={{
                  borderRadius: btnRadius,
                  borderColor: "rgba(255, 255, 255, 0.25)",
                  color: "#FFFFFF",
                  backgroundColor: blockBg,
                }}
              >
                {error}
              </div>
            )}
          </div>

          <img
            src={mascotSrc}
            alt="Робот Рекрутер"
            loading="eager"
            referrerPolicy="no-referrer"
            className="w-32 h-32 object-contain drop-shadow-2xl shrink-0 self-end"
            style={{
              filter: mascotFilter,
              animation: status === "loading" ? "aiwait-float 4s ease-in-out infinite" : undefined,
            }}
          />
        </div>

        {status === "loading" && (
          <StageProgress elapsed={elapsed} accentColor={accentColor} bodyTextColor={bodyTextColor} />
        )}

        {status === "success" && !autoCloseOnSuccess && (
          <div className="relative z-10 mt-5 flex justify-end">
            <button
              type="button"
              onClick={onNext}
              style={{
                borderRadius: btnRadius,
                borderWidth: btnWidth,
                borderStyle: "solid",
                borderColor: btnBorder,
                background: activeBtnBg,
                color: activeBtnColor,
                WebkitTextFillColor: activeBtnColor,
                fontFamily,
              }}
              className="hover:brightness-105 font-bold px-6 py-2.5 text-sm shadow transition cursor-pointer"
            >
              <span style={{ color: activeBtnColor, WebkitTextFillColor: activeBtnColor }}>Далее</span>
            </button>
          </div>
        )}

        {status === "error" && (
          <div className="relative z-10 mt-5 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onCancel}
              style={{
                borderRadius: btnRadius,
                borderWidth: btnWidth,
                borderStyle: "solid",
                borderColor: btnBorder,
                backgroundColor: inactiveBtnBg,
                color: inactiveBtnColor,
                WebkitTextFillColor: inactiveBtnColor,
                fontFamily,
              }}
              className="px-4 py-2 text-sm font-bold transition cursor-pointer hover:brightness-105 backdrop-blur-sm"
            >
              <span style={{ color: inactiveBtnColor, WebkitTextFillColor: inactiveBtnColor }}>Отмена</span>
            </button>
            <button
              type="button"
              onClick={showFallback ? onFallback : onRetry}
              disabled={fallbackBusy}
              style={{
                borderRadius: btnRadius,
                borderWidth: btnWidth,
                borderStyle: "solid",
                borderColor: btnBorder,
                background: activeBtnBg,
                color: activeBtnColor,
                WebkitTextFillColor: activeBtnColor,
                fontFamily,
              }}
              className="hover:brightness-105 font-bold px-4 py-2 text-sm shadow transition disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
            >
              <span style={{ color: activeBtnColor, WebkitTextFillColor: activeBtnColor }}>Повторить с RR ProMax</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export const FallbackOverlay: React.FC<{
  phase: "connecting" | "running";
  elapsed: number;
  theme?: any;
}> = ({ phase, elapsed, theme: propTheme }) => {
  const theme = getActiveCompanyTheme(propTheme);
  const hasCompanyTheme = Boolean(theme && typeof theme === "object" && Object.keys(theme).length > 0);
  const isMonochrome = Boolean(
    theme?.allMediaMonochrome ||
    theme?.logoMonochrome ||
    theme?.pageBgMonochrome ||
    (theme?.headingsSolidColor === "#FFFFFF" &&
      (theme?.pageBgColor === "#000000" || theme?.btnActiveBgColor === "#FFFFFF"))
  );

  const containerRadius =
    theme?.containerBorderRadius !== undefined
      ? theme.containerBorderRadius === 999
        ? "9999px"
        : `${theme.containerBorderRadius}px`
      : "24px";
  const containerBorder = theme?.containerBorderColor
    ? hexToRgba(theme.containerBorderColor, theme.containerBorderOpacity ?? 25)
    : "rgba(231, 199, 104, 0.35)";
  const containerWidth =
    theme?.containerBorderWidth !== undefined ? `${theme.containerBorderWidth}px` : "1px";
  const containerBlurPx = theme?.glassBlurPx ?? 24;
  const containerBg = useMemo(() => {
    if (!hasCompanyTheme) return "transparent";
    const pageOp = theme?.pageBgOpacity !== undefined ? Number(theme.pageBgOpacity) : 100;
    const contOp = theme?.containerBgOpacity !== undefined ? Number(theme.containerBgOpacity) : 0;
    if (pageOp > 0 && theme?.pageBgColor) {
      return hexToRgba(theme.pageBgColor, pageOp);
    }
    if (contOp > 0 && theme?.containerBgColor) {
      return hexToRgba(theme.containerBgColor, contOp);
    }
    return "transparent";
  }, [hasCompanyTheme, theme?.pageBgColor, theme?.pageBgOpacity, theme?.containerBgColor, theme?.containerBgOpacity]);

  const blockBg = useMemo(() => {
    if (!hasCompanyTheme || !(theme?.containerBgOpacity > 0) || !theme?.containerBgColor) return "transparent";
    return hexToRgba(theme.containerBgColor, Number(theme.containerBgOpacity));
  }, [hasCompanyTheme, theme?.containerBgColor, theme?.containerBgOpacity]);

  const backdropBg = useMemo(() => {
    if (!hasCompanyTheme || !theme?.pageBgColor) return "transparent";
    const pageOp = theme?.pageBgOpacity !== undefined ? Number(theme.pageBgOpacity) : 100;
    if (pageOp <= 0) return "transparent";
    return hexToRgba(theme.pageBgColor, Math.min(65, Math.round(pageOp * 0.65)));
  }, [hasCompanyTheme, theme?.pageBgColor, theme?.pageBgOpacity]);

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
  }, [hasCompanyTheme, theme?.headingsSolidColor, theme?.bodyTextColor, theme?.boldTextColor, theme?.iconColor, theme?.headingsColorMode, isMonochrome]);

  const bodyTextColor = theme?.bodyTextColor || "#FFFFFF";
  const accentColor = isMonochrome
    ? "#FFFFFF"
    : theme?.iconColor || theme?.headingsSolidColor || "#E7C768";
  const fontFamily = theme?.fontFamily || undefined;
  const btnRadius =
    theme?.btnBorderRadius !== undefined
      ? theme.btnBorderRadius === 999
        ? "9999px"
        : `${theme.btnBorderRadius}px`
      : "14px";

  const mascotSrc = rrImg(IMG_LOADING, 128);
  const mascotFilter = isMonochrome
    ? "grayscale(100%) drop-shadow(0 0 16px rgba(255, 255, 255, 0.35))"
    : `drop-shadow(0 0 16px ${hexToRgba(accentColor, 55)})`;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-transparent backdrop-blur-md p-4"
      style={{ fontFamily, backgroundColor: backdropBg }}
    >
      <div
        className="relative w-full max-w-md p-6 shadow-2xl overflow-hidden border bg-transparent backdrop-blur-2xl"
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
        <div className="relative z-10 mb-3 text-center text-sm font-bold" style={{ color: accentColor, fontFamily }}>
          Робот Рекрутер подключается к задаче
        </div>
        <div className="relative z-10 flex items-end gap-3 min-h-[140px]">
          <div className="flex-1">
            <div
              className="px-4 py-3 text-sm font-medium shadow-lg border backdrop-blur-md"
              style={{
                borderRadius: btnRadius,
                borderWidth: containerWidth,
                borderStyle: "solid",
                backgroundColor: blockBg,
                borderColor: containerBorder,
                color: bodyTextColor,
                fontFamily,
              }}
            >
              Робот Рекрутер продолжает проверку и формирует результат.
            </div>
            <div
              className="mt-3 border px-3 py-2 text-sm font-mono backdrop-blur-md"
              style={{
                borderRadius: btnRadius,
                borderColor: containerBorder,
                color: bodyTextColor,
                backgroundColor: blockBg,
              }}
            >
              {phase === "connecting" ? "Подключаем Робота Рекрутера…" : "Выполняем проверку…"}
            </div>
          </div>
          <img
            src={mascotSrc}
            alt="Робот Рекрутер"
            loading="eager"
            referrerPolicy="no-referrer"
            className="w-32 h-32 object-contain drop-shadow-2xl shrink-0 self-end"
            style={{
              filter: mascotFilter,
              animation: "aiwait-float 4s ease-in-out infinite",
            }}
          />
        </div>
        <div className="relative z-10 mt-4 text-center space-y-1">
          <div className="text-sm opacity-90" style={{ color: bodyTextColor }}>
            Не закрывайте окно — Робот Рекрутер работает над задачей
          </div>
          <div className="text-2xl font-mono font-bold tabular-nums" style={{ color: accentColor }}>
            {elapsed}s
          </div>
        </div>
      </div>
    </div>
  );
};
