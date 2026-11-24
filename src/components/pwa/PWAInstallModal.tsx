import React from "react";
import { createPortal } from "react-dom";
import {
  Smartphone,
  Share2,
  PlusSquare,
  MoreVertical,
  Download,
  X,
  ExternalLink,
  Copy,
  Check,
  Monitor,
} from "lucide-react";
import { hexToRgba } from "@/components/LandingStyleEditor";
import type { PWAInstallPlatform } from "@/pwa/usePWAInstall";

interface PWAInstallModalProps {
  open: boolean;
  onClose: () => void;
  preferredTab: PWAInstallPlatform;
  onChangeTab: (tab: PWAInstallPlatform) => void;
  hasNativePrompt: boolean;
  isInIframe: boolean;
  onNativeInstall: () => void;
  activeTheme?: any;
}

export default function PWAInstallModal({
  open,
  onClose,
  preferredTab,
  onChangeTab,
  hasNativePrompt,
  isInIframe,
  onNativeInstall,
  activeTheme,
}: PWAInstallModalProps) {
  const [copiedUrl, setCopiedUrl] = React.useState(false);

  if (!open || typeof document === "undefined") return null;

  const headingStyle: React.CSSProperties =
    activeTheme?.headingsColorMode === "gradient-silver"
      ? {
          backgroundImage: "linear-gradient(to right, #FFFFFF, #E2E8F0, #94A3B8)",
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          WebkitTextFillColor: "transparent",
          color: "transparent",
        }
      : activeTheme?.headingsColorMode === "solid" && activeTheme?.headingsSolidColor
      ? { color: activeTheme.headingsSolidColor }
      : {
          backgroundImage: "linear-gradient(to right, #F4EE8E, #E7C768, #D99E41)",
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          WebkitTextFillColor: "transparent",
          color: "transparent",
        };

  const borderColor = activeTheme?.containerBorderColor
    ? hexToRgba(activeTheme.containerBorderColor, activeTheme.containerBorderOpacity ?? 25)
    : "rgba(255, 255, 255, 0.25)";

  const borderRadius =
    activeTheme?.containerBorderRadius != null ? `${activeTheme.containerBorderRadius}px` : "24px";

  const activeBtnStyle: React.CSSProperties = activeTheme?.btnActiveBgColor
    ? {
        backgroundColor: activeTheme.btnActiveBgColor,
        color: activeTheme.btnActiveTextColor || "#17344F",
        borderColor: activeTheme.btnBorderColor || borderColor,
        borderRadius: activeTheme?.btnBorderRadius != null ? `${activeTheme.btnBorderRadius}px` : "12px",
      }
    : {
        borderRadius: "12px",
      };

  const currentUrl = typeof window !== "undefined" ? window.location.href : "https://hr-rr.online/";

  const handleCopyUrl = () => {
    try {
      navigator.clipboard.writeText(currentUrl);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    } catch {}
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center p-4 overflow-y-auto bg-transparent"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-xl bg-transparent backdrop-blur-2xl border p-5 sm:p-7 space-y-5 shadow-2xl text-left text-white my-auto"
        style={{
          borderColor,
          borderRadius,
        }}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-white/15 pb-3.5">
          <div className="flex items-center gap-3 min-w-0">
            <img
              src="/icons/pwa/pwa-192x192.png"
              alt="Робот Рекрутер"
              className="w-11 h-11 rounded-xl border border-white/20 shrink-0 object-contain"
            />
            <div className="min-w-0">
              <h3 className="text-lg font-bold leading-snug" style={headingStyle}>
                Установка приложения на телефон и ПК
              </h3>
              <p className="text-[14px] text-slate-200 mt-0.5">
                Быстрый запуск и системные Push-уведомления на любом устройстве
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="p-2 rounded-xl border border-white/20 text-slate-200 hover:text-white hover:bg-white/10 transition cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Platform Switch (vertical stack on mobile, 3 columns on sm+) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => onChangeTab("android")}
            className={`px-3.5 py-2.5 min-h-[44px] text-[14px] font-bold border transition flex items-center justify-center gap-2 cursor-pointer ${
              preferredTab === "android"
                ? "bg-gradient-to-r from-[#FFE580] via-[#E7C768] to-[#C8A038] text-[#17344F] border-[#E7C768]"
                : "bg-transparent text-white border-white/20 hover:bg-white/10"
            }`}
            style={preferredTab === "android" && activeTheme?.btnActiveBgColor ? activeBtnStyle : { borderRadius: "12px" }}
          >
            <Smartphone className="w-4 h-4 shrink-0" />
            <span>Android</span>
          </button>

          <button
            type="button"
            onClick={() => onChangeTab("ios")}
            className={`px-3.5 py-2.5 min-h-[44px] text-[14px] font-bold border transition flex items-center justify-center gap-2 cursor-pointer ${
              preferredTab === "ios"
                ? "bg-gradient-to-r from-[#FFE580] via-[#E7C768] to-[#C8A038] text-[#17344F] border-[#E7C768]"
                : "bg-transparent text-white border-white/20 hover:bg-white/10"
            }`}
            style={preferredTab === "ios" && activeTheme?.btnActiveBgColor ? activeBtnStyle : { borderRadius: "12px" }}
          >
            <Share2 className="w-4 h-4 shrink-0" />
            <span>iPhone и iPad</span>
          </button>

          <button
            type="button"
            onClick={() => onChangeTab("desktop")}
            className={`px-3.5 py-2.5 min-h-[44px] text-[14px] font-bold border transition flex items-center justify-center gap-2 cursor-pointer ${
              preferredTab === "desktop"
                ? "bg-gradient-to-r from-[#FFE580] via-[#E7C768] to-[#C8A038] text-[#17344F] border-[#E7C768]"
                : "bg-transparent text-white border-white/20 hover:bg-white/10"
            }`}
            style={preferredTab === "desktop" && activeTheme?.btnActiveBgColor ? activeBtnStyle : { borderRadius: "12px" }}
          >
            <Monitor className="w-4 h-4 shrink-0" />
            <span>ПК (Компьютер)</span>
          </button>
        </div>

        {isInIframe && (
          <div className="bg-transparent border border-[#E7C768]/50 rounded-2xl p-4 space-y-2.5 backdrop-blur-md">
            <p className="text-[14px] text-white leading-relaxed">
              Страница сейчас открыта во встроенном окне. Чтобы установить приложение на главный экран или рабочий стол, откройте её в основном браузере (Chrome, Edge, Яндекс или Safari).
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <a
                href={currentUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-[#FFE580] via-[#E7C768] to-[#C8A038] text-[#17344F] font-bold text-[14px] hover:brightness-110 transition"
              >
                <ExternalLink className="w-4 h-4" />
                <span>Открыть в браузере</span>
              </a>
              <button
                type="button"
                onClick={handleCopyUrl}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-white/25 text-white font-semibold text-[14px] hover:bg-white/10 transition cursor-pointer"
              >
                {copiedUrl ? <Check className="w-4 h-4 text-[#E7C768]" /> : <Copy className="w-4 h-4 text-[#E7C768]" />}
                <span>{copiedUrl ? "Ссылка скопирована" : "Скопировать ссылку"}</span>
              </button>
            </div>
          </div>
        )}

        {/* Platform Instructions */}
        {preferredTab === "android" && (
          <div className="space-y-3 text-[14px]">
            {hasNativePrompt && (
              <button
                type="button"
                onClick={onNativeInstall}
                className="w-full py-3 px-5 rounded-xl bg-gradient-to-r from-[#FFE580] via-[#E7C768] to-[#C8A038] text-[#17344F] font-bold text-[14px] flex items-center justify-center gap-2 shadow-lg hover:brightness-110 transition cursor-pointer"
                style={activeTheme?.btnActiveBgColor ? activeBtnStyle : undefined}
              >
                <Download className="w-4 h-4" />
                <span>Установить приложение в один клик</span>
              </button>
            )}
            <div className="bg-transparent border border-white/15 rounded-2xl p-4 space-y-3">
              <div className="flex items-start gap-3">
                <span className="w-7 h-7 rounded-full border border-[#E7C768] text-[#F4EE8E] font-bold text-[14px] flex items-center justify-center shrink-0">
                  1
                </span>
                <p className="text-[14px] text-slate-100 leading-relaxed">
                  Откройте сайт в браузере <strong className="text-white">Google Chrome</strong> или <strong className="text-white">Яндекс Браузер</strong> на Android.
                </p>
              </div>
              <div className="flex items-start gap-3">
                <span className="w-7 h-7 rounded-full border border-[#E7C768] text-[#F4EE8E] font-bold text-[14px] flex items-center justify-center shrink-0">
                  2
                </span>
                <p className="text-[14px] text-slate-100 leading-relaxed">
                  Нажмите на меню браузера <MoreVertical className="w-4 h-4 inline text-[#E7C768]" /> в правом верхнем углу экрана.
                </p>
              </div>
              <div className="flex items-start gap-3">
                <span className="w-7 h-7 rounded-full border border-[#E7C768] text-[#F4EE8E] font-bold text-[14px] flex items-center justify-center shrink-0">
                  3
                </span>
                <p className="text-[14px] text-slate-100 leading-relaxed">
                  Выберите пункт <strong className="text-[#F4EE8E]">«Установить приложение»</strong> или <strong className="text-[#F4EE8E]">«Добавить на главный экран»</strong> и подтвердите установку.
                </p>
              </div>
            </div>
          </div>
        )}

        {preferredTab === "ios" && (
          <div className="space-y-3 text-[14px]">
            <div className="bg-transparent border border-white/15 rounded-2xl p-4 space-y-3">
              <div className="flex items-start gap-3">
                <span className="w-7 h-7 rounded-full border border-[#E7C768] text-[#F4EE8E] font-bold text-[14px] flex items-center justify-center shrink-0">
                  1
                </span>
                <p className="text-[14px] text-slate-100 leading-relaxed">
                  Откройте эту страницу в стандартном браузере <strong className="text-white">Safari</strong> на iPhone или iPad.
                </p>
              </div>
              <div className="flex items-start gap-3">
                <span className="w-7 h-7 rounded-full border border-[#E7C768] text-[#F4EE8E] font-bold text-[14px] flex items-center justify-center shrink-0">
                  2
                </span>
                <p className="text-[14px] text-slate-100 leading-relaxed">
                  Нажмите кнопку <strong className="text-[#F4EE8E]">«Поделиться»</strong> <Share2 className="w-4 h-4 inline text-[#E7C768]" /> на нижней панели Safari.
                </p>
              </div>
              <div className="flex items-start gap-3">
                <span className="w-7 h-7 rounded-full border border-[#E7C768] text-[#F4EE8E] font-bold text-[14px] flex items-center justify-center shrink-0">
                  3
                </span>
                <p className="text-[14px] text-slate-100 leading-relaxed">
                  Прокрутите список вниз, нажмите <PlusSquare className="w-4 h-4 inline text-[#E7C768]" /> <strong className="text-[#F4EE8E]">«На экран Домой»</strong> и выберите <strong className="text-white">«Добавить»</strong>. После этого заработают и iOS Push-уведомления.
                </p>
              </div>
            </div>
          </div>
        )}

        {preferredTab === "desktop" && (
          <div className="space-y-3 text-[14px]">
            {hasNativePrompt && (
              <button
                type="button"
                onClick={onNativeInstall}
                className="w-full py-3 px-5 rounded-xl bg-gradient-to-r from-[#FFE580] via-[#E7C768] to-[#C8A038] text-[#17344F] font-bold text-[14px] flex items-center justify-center gap-2 shadow-lg hover:brightness-110 transition cursor-pointer"
                style={activeTheme?.btnActiveBgColor ? activeBtnStyle : undefined}
              >
                <Download className="w-4 h-4" />
                <span>Установить программу на компьютер в один клик</span>
              </button>
            )}
            <div className="bg-transparent border border-white/15 rounded-2xl p-4 space-y-3">
              <div className="flex items-start gap-3">
                <span className="w-7 h-7 rounded-full border border-[#E7C768] text-[#F4EE8E] font-bold text-[14px] flex items-center justify-center shrink-0">
                  1
                </span>
                <p className="text-[14px] text-slate-100 leading-relaxed">
                  Откройте кабинет в браузере <strong className="text-white">Google Chrome</strong>, <strong className="text-white">Microsoft Edge</strong> или <strong className="text-white">Яндекс Браузер</strong> на Windows или macOS.
                </p>
              </div>
              <div className="flex items-start gap-3">
                <span className="w-7 h-7 rounded-full border border-[#E7C768] text-[#F4EE8E] font-bold text-[14px] flex items-center justify-center shrink-0">
                  2
                </span>
                <p className="text-[14px] text-slate-100 leading-relaxed">
                  Нажмите значок установки <Download className="w-4 h-4 inline text-[#E7C768]" /> в правой части адресной строки браузера или откройте меню браузера → <strong className="text-[#F4EE8E]">«Трансляция, сохранение и отправка» → «Установить приложение...»</strong>.
                </p>
              </div>
              <div className="flex items-start gap-3">
                <span className="w-7 h-7 rounded-full border border-[#E7C768] text-[#F4EE8E] font-bold text-[14px] flex items-center justify-center shrink-0">
                  3
                </span>
                <p className="text-[14px] text-slate-100 leading-relaxed">
                  Ярлык появится на рабочем столе и в меню «Пуск» / Launchpad. Включите Push выше — и системные уведомления будут приходить прямо на компьютер даже при свёрнутом браузере.
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-end pt-2 border-t border-white/10">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl border border-white/25 text-white hover:bg-white/10 text-[14px] font-semibold transition cursor-pointer"
          >
            Понятно
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
