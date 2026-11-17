import React, { useMemo } from "react";
import { X, AlertTriangle, Loader2, CheckCircle2 } from "lucide-react";
import {
  useAIFallbackGate, closeAIFallback, _runFallbackForGate,
  SUPPORT_TELEGRAM_URL,
} from "@/lib/aiFallback";

import { rrImg } from "@/lib/img";
import { getActiveCompanyTheme } from "@/components/AIWaitProvider";
import { hexToRgba } from "@/components/LandingStyleEditor";
import InteractiveLandingBackground from "@/components/InteractiveLandingBackground";

const MASCOT_URL = "https://file.pro-talk.ru/tgf/GgMpJwQ9JCkYKglyGHQMDl0WOR0fETccDCUtbFUtHwVPfz9jLBt_GzIXJBcZEyJTNAssKy0_NkEKRzAWAwkpCiA-KD84NRQmEV9uZlUAaA11VQJrCjgDAzkkAVczLRouDiMXfQxTNBdFGT8aIyw2ZyIcIQsIKjIuHhtsBXZSBGZ5T3FP.png";

export const AIFallbackGate: React.FC = () => {
  const s = useAIFallbackGate();
  const theme = s.open ? getActiveCompanyTheme() : null;
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
    if (pageOp > 0 && theme?.pageBgColor) {
      return hexToRgba(theme.pageBgColor, pageOp);
    }
    if (contOp > 0 && theme?.containerBgColor) {
      return hexToRgba(theme.containerBgColor, contOp);
    }
    return "transparent";
  }, [hasCompanyTheme, theme?.pageBgColor, theme?.pageBgOpacity, theme?.containerBgColor, theme?.containerBgOpacity]);

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

  if (!s.open) return null;

  const fontFamily = theme?.fontFamily || undefined;
  const bodyTextColor = theme?.bodyTextColor || "#FFFFFF";

  return (
    <div
      className="fixed inset-0 z-[9997] flex items-center justify-center bg-transparent backdrop-blur-md p-4"
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
          onClick={() => closeAIFallback("dismiss")}
          aria-label="Закрыть"
          className="absolute top-3 right-3 z-20 w-8 h-8 rounded-full bg-transparent border border-white/25 text-white flex items-center justify-center transition cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="relative z-10 flex justify-center mb-3">
          <img
            src={rrImg(MASCOT_URL, 120)}
            alt="Робот Рекрутер"
            width={120}
            height={120}
            loading="eager"
            decoding="async"
            className="w-28 h-28 object-contain drop-shadow-2xl"
          />
        </div>

        <div className="relative z-10 text-center text-sm font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent mb-2">
          Резервная модель Робота Рекрутера
        </div>

        {s.phase === "offer" && (
          <div className="relative z-10">
            <h2 className="text-center text-lg font-bold text-white mb-2">
              Основная нейросеть не ответила
            </h2>
            <p className="text-center text-sm text-white/90 mb-4">
              Попробуйте резервную модель Робота Рекрутера — она использует тот же запрос
              и не списывает лимиты повторно.
            </p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => { void _runFallbackForGate(); }}
                className="w-full rounded-xl bg-gradient-to-r from-[#E7C768] to-[#C29A3A] px-4 py-3 text-sm font-bold text-[#17344F] shadow-lg hover:brightness-110 active:scale-[0.99] transition cursor-pointer"
              >
                Повторить с RR ProMax
              </button>
              <button
                type="button"
                onClick={() => closeAIFallback("dismiss")}
                className="w-full rounded-xl border border-white/25 bg-transparent backdrop-blur-md text-white px-4 py-2 text-sm font-bold transition cursor-pointer"
              >
                Не сейчас
              </button>
            </div>
          </div>
        )}

        {s.phase === "running" && (
          <div className="relative z-10">
            <h2 className="text-center text-lg font-bold text-white mb-2">
              Робот Рекрутер обрабатывает запрос
            </h2>
            <div className="flex items-center justify-center gap-2 text-sm text-white/90 my-4">
              <Loader2 className="w-4 h-4 animate-spin text-[#E7C768]" />
              <span>Это может занять дополнительно до 120-180 секунд…</span>
            </div>
            <p className="text-center text-sm text-white/80">
              Окно можно закрыть — результат сохранится автоматически.
            </p>
          </div>
        )}

        {s.phase === "succeeded" && (
          <div className="relative z-10">
            <h2 className="text-center text-lg font-bold text-white mb-2">
              Готово
            </h2>
            <div className="flex items-center justify-center gap-2 text-sm text-[#E7C768] my-3">
              <CheckCircle2 className="w-5 h-5" />
              <span>Робот Рекрутер вернул результат</span>
            </div>
          </div>
        )}

        {s.phase === "failed" && (
          <div className="relative z-10">
            <h2 className="text-center text-lg font-bold text-white mb-2">
              Не удалось получить ответ
            </h2>
            <div className="flex items-center justify-center gap-2 text-sm text-[#E7C768] my-3">
              <AlertTriangle className="w-5 h-5" />
              <span>Резервная модель тоже не ответила</span>
            </div>
            <p className="text-center text-sm text-white/90 mb-4">
              Напишите нам в поддержку — поможем разобраться вручную и не
              спишем лимиты за неудачную попытку.
            </p>
            <div className="flex flex-col gap-2">
              <a
                href={SUPPORT_TELEGRAM_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full rounded-xl bg-gradient-to-r from-[#E7C768] to-[#C29A3A] px-4 py-3 text-center text-sm font-bold text-[#17344F] shadow-lg hover:brightness-110 transition"
              >
                Написать в поддержку
              </a>
              <button
                type="button"
                onClick={() => closeAIFallback("dismiss")}
                className="w-full rounded-xl border border-white/25 bg-transparent backdrop-blur-md text-white px-4 py-2 text-sm font-bold transition cursor-pointer"
              >
                Закрыть
              </button>
            </div>
            {s.errorCode && (
              <div className="mt-3 text-center text-sm font-mono text-white/70">
                код: {s.errorCode}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AIFallbackGate;