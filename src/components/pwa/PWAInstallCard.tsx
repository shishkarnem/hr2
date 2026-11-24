import React from "react";
import { Smartphone, Download, Share2, CheckCircle2, Monitor, BellRing, Loader2, Sparkles } from "lucide-react";
import { usePWAInstall } from "@/pwa/usePWAInstall";
import { usePushNotifications } from "@/pwa/usePushNotifications";
import PWAInstallModal from "./PWAInstallModal";
import { hexToRgba } from "@/components/LandingStyleEditor";

interface PWAInstallCardProps {
  role: "employer" | "candidate";
  employerId?: string | number | null;
  candidateId?: string | number | null;
  activeTheme?: any;
  className?: string;
}

export default function PWAInstallCard({
  role,
  employerId,
  candidateId,
  activeTheme,
  className = "",
}: PWAInstallCardProps) {
  const {
    hasNativePrompt,
    isStandalone,
    isInIframe,
    installModalOpen,
    setInstallModalOpen,
    preferredGuideTab,
    setPreferredGuideTab,
    installStatus,
    triggerInstall,
  } = usePWAInstall();

  const {
    supported: pushSupported,
    permission: pushPermission,
    isSubscribedBrowser,
    subscriptionsCount,
    config: pushConfig,
    pushBusy,
    saving: pushSaving,
    statusMessage: pushStatusMessage,
    errorMessage: pushErrorMessage,
    subscribePush,
    unsubscribePush,
    savePreferences,
    sendTestPush,
  } = usePushNotifications({ role, employerId, candidateId });

  const borderColor = activeTheme?.containerBorderColor
    ? hexToRgba(activeTheme.containerBorderColor, activeTheme.containerBorderOpacity ?? 25)
    : "rgba(255, 255, 255, 0.2)";

  const borderRadius =
    activeTheme?.containerBorderRadius != null ? `${activeTheme.containerBorderRadius}px` : "24px";

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

  const activeBtnStyle: React.CSSProperties = activeTheme?.btnActiveBgColor
    ? {
        backgroundColor: activeTheme.btnActiveBgColor,
        color: activeTheme.btnActiveTextColor || "#17344F",
        borderColor: activeTheme.btnBorderColor || borderColor,
        borderRadius: activeTheme?.btnBorderRadius != null ? `${activeTheme.btnBorderRadius}px` : "12px",
      }
    : { borderRadius: "12px" };

  const secondaryBtnStyle: React.CSSProperties = {
    borderColor: activeTheme?.btnBorderColor || "rgba(255, 255, 255, 0.25)",
    color: activeTheme?.btnInactiveTextColor || "#FFFFFF",
    borderRadius: activeTheme?.btnBorderRadius != null ? `${activeTheme.btnBorderRadius}px` : "12px",
  };

  const handleToggleDesktopPush = async () => {
    if (!isSubscribedBrowser) {
      await subscribePush();
      return;
    }
    await savePreferences({
      ...pushConfig,
      channels: {
        ...pushConfig.channels,
        push: !pushConfig.channels.push,
      },
    });
  };

  return (
    <>
      <div
        className={`section-card liquid-glass-card bg-transparent border backdrop-blur-2xl p-5 space-y-5 shadow-xl text-left ${className}`}
        style={{
          borderColor,
          borderRadius,
          borderWidth: activeTheme?.containerBorderWidth != null ? `${activeTheme.containerBorderWidth}px` : "1px",
        }}
      >
        {/* Top Row: Full-width Header & Description (stacked cleanly above buttons on both Desktop & Mobile) */}
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-3.5 min-w-0">
            <img
              src="/icons/pwa/pwa-192x192.png"
              alt="Иконка приложения Робот Рекрутер"
              className="w-12 h-12 rounded-2xl border border-white/20 shrink-0 object-contain"
            />
            <div className="min-w-0 flex-1 space-y-1">
              <h4 className="text-base font-bold leading-snug break-words" style={headingStyle}>
                Приложение на телефон и ПК ({role === "employer" ? "кабинет работодателя" : "кабинет кандидата"})
              </h4>
              <p className="text-[14px] text-slate-200 leading-relaxed break-words">
                {isStandalone
                  ? "Приложение установлено и запущено с главного экрана этого устройства."
                  : "Установите личный кабинет как приложение на Android, iPhone или компьютер (ПК) — без магазина приложений, в один клик."}
              </p>
            </div>
          </div>

          {/* Bottom Row: Wrapped Install Action Buttons */}
          <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-2.5">
            {isStandalone && (
              <div className="inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl border border-[#E7C768]/60 text-[#F4EE8E] text-[14px] font-bold">
                <CheckCircle2 className="w-4 h-4 text-[#E7C768] shrink-0" />
                <span>Установлено на этом устройстве</span>
              </div>
            )}

            <button
              type="button"
              onClick={() => void triggerInstall("android")}
              className="landing-btn-active cursor-pointer bg-gradient-to-r from-[#FFE580] via-[#E7C768] to-[#C8A038] text-[#17344F] hover:brightness-110 active:scale-95 text-[14px] font-bold px-4 py-2.5 min-h-[44px] transition flex items-center justify-center gap-2 shadow-md border border-[#E7C768]/60"
              style={activeTheme?.btnActiveBgColor ? activeBtnStyle : { borderRadius: "12px" }}
            >
              {hasNativePrompt ? <Download className="w-4 h-4 shrink-0" /> : <Smartphone className="w-4 h-4 shrink-0" />}
              <span>Установить на Android</span>
            </button>

            <button
              type="button"
              onClick={() => void triggerInstall("ios")}
              className="landing-btn-inactive cursor-pointer bg-transparent hover:bg-white/10 active:scale-95 text-white text-[14px] font-bold px-4 py-2.5 min-h-[44px] transition flex items-center justify-center gap-2 border"
              style={secondaryBtnStyle}
            >
              <Share2 className="w-4 h-4 shrink-0 text-[#E7C768]" />
              <span>Установить на iPhone</span>
            </button>

            <button
              type="button"
              onClick={() => void triggerInstall("desktop")}
              className="landing-btn-inactive cursor-pointer bg-transparent hover:bg-white/10 active:scale-95 text-white text-[14px] font-bold px-4 py-2.5 min-h-[44px] transition flex items-center justify-center gap-2 border"
              style={secondaryBtnStyle}
            >
              <Monitor className="w-4 h-4 shrink-0 text-[#E7C768]" />
              <span>Установить на ПК</span>
            </button>
          </div>
        </div>

        {installStatus && (
          <div className="border border-[#E7C768]/50 rounded-xl p-3 text-[14px] text-[#F4EE8E] font-medium">
            {installStatus}
          </div>
        )}

        {/* Desktop & Browser Push Notification Setup Sub-block */}
        <div className="border-t border-white/15 pt-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <BellRing className="w-4 h-4 text-[#E7C768] shrink-0" />
              <span className="text-[14px] font-bold text-white">
                Push-уведомления на ПК и в браузере
              </span>
            </div>
            <span className="text-[14px] font-semibold text-[#F4EE8E]">
              {isSubscribedBrowser
                ? pushConfig.channels.push
                  ? `Подключено (устройств: ${Math.max(1, subscriptionsCount)})`
                  : "Подключено, на паузе"
                : subscriptionsCount > 0
                ? `Устройств в профиле: ${subscriptionsCount}`
                : "Не подключены на этом ПК"}
            </span>
          </div>

          <p className="text-[14px] text-slate-300 leading-relaxed">
            {pushPermission === "denied"
              ? "Разрешите уведомления в настройках вашего браузера (значок замка слева от адресной строки), чтобы получать Push-оповещения на рабочий стол ПК."
              : !pushSupported
              ? "Браузер в текущем окне не поддерживает Web Push. Откройте сайт в обычной вкладке Chrome, Edge или Яндекс Браузера."
              : "Получайте мгновенные системные уведомления прямо на экран компьютера (Windows / macOS) или смартфона, даже когда вкладка закрыта."}
          </p>

          <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-2.5">
            {isSubscribedBrowser ? (
              <>
                <button
                  type="button"
                  disabled={pushBusy || pushSaving}
                  onClick={() => void handleToggleDesktopPush()}
                  className={`cursor-pointer text-[14px] font-bold px-4 py-2.5 min-h-[44px] transition flex items-center justify-center gap-2 border ${
                    pushConfig.channels.push
                      ? "bg-gradient-to-r from-[#FFE580] via-[#E7C768] to-[#C8A038] text-[#17344F] border-[#E7C768]"
                      : "bg-transparent text-white border-white/25 hover:bg-white/10"
                  }`}
                  style={pushConfig.channels.push && activeTheme?.btnActiveBgColor ? activeBtnStyle : { borderRadius: "12px" }}
                >
                  {(pushBusy || pushSaving) ? (
                    <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                  )}
                  <span>{pushConfig.channels.push ? "Push на ПК включён" : "Возобновить Push на ПК"}</span>
                </button>

                <button
                  type="button"
                  disabled={pushBusy}
                  onClick={() => void sendTestPush()}
                  className="cursor-pointer bg-transparent hover:bg-white/10 text-white text-[14px] font-semibold px-4 py-2.5 min-h-[44px] transition flex items-center justify-center gap-2 border"
                  style={secondaryBtnStyle}
                >
                  <Sparkles className="w-4 h-4 text-[#E7C768] shrink-0" />
                  <span>Проверить Push</span>
                </button>

                <button
                  type="button"
                  disabled={pushBusy}
                  onClick={() => void unsubscribePush()}
                  className="cursor-pointer bg-transparent hover:bg-white/10 text-slate-200 text-[14px] font-semibold px-4 py-2.5 min-h-[44px] transition flex items-center justify-center gap-2 border"
                  style={secondaryBtnStyle}
                >
                  <span>Отключить на этом ПК</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={pushBusy}
                onClick={() => void subscribePush()}
                className="cursor-pointer bg-gradient-to-r from-[#FFE580] via-[#E7C768] to-[#C8A038] text-[#17344F] hover:brightness-110 active:scale-95 text-[14px] font-bold px-4 py-2.5 min-h-[44px] transition flex items-center justify-center gap-2 shadow-md border border-[#E7C768]/60"
                style={activeTheme?.btnActiveBgColor ? activeBtnStyle : { borderRadius: "12px" }}
              >
                {pushBusy ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> : <BellRing className="w-4 h-4 shrink-0" />}
                <span>Включить Push на ПК</span>
              </button>
            )}
          </div>

          {(pushStatusMessage || pushErrorMessage) && (
            <div className="border border-[#E7C768]/60 rounded-xl px-3.5 py-2.5 text-[14px] text-[#F4EE8E] flex items-center gap-2 backdrop-blur-md">
              <CheckCircle2 className="w-4 h-4 text-[#E7C768] shrink-0" />
              <span className="leading-snug">{pushErrorMessage || pushStatusMessage}</span>
            </div>
          )}
        </div>
      </div>

      <PWAInstallModal
        open={installModalOpen}
        onClose={() => setInstallModalOpen(false)}
        preferredTab={preferredGuideTab}
        onChangeTab={setPreferredGuideTab}
        hasNativePrompt={hasNativePrompt}
        isInIframe={isInIframe}
        onNativeInstall={() => void triggerInstall(preferredGuideTab === "ios" ? "android" : preferredGuideTab)}
        activeTheme={activeTheme}
      />
    </>
  );
}
