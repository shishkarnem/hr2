import React, { useEffect, useState } from "react";
import { Bell, Send, Smartphone, CheckCircle2, Loader2, Sparkles, SlidersHorizontal, Check } from "lucide-react";
import { usePushNotifications } from "@/pwa/usePushNotifications";
import {
  CANDIDATE_EVENT_DESCRIPTORS,
  DEFAULT_NOTIFICATION_THRESHOLDS,
  EMPLOYER_EVENT_DESCRIPTORS,
  NotificationChannelKey,
  NotificationOwnerRole,
  NotificationsConfigPayload,
  NotificationThresholds,
} from "@/pwa/notificationConfig";
import { hexToRgba } from "@/components/LandingStyleEditor";

interface NotificationSettingsPanelProps {
  role: NotificationOwnerRole;
  employerId?: string | number | null;
  candidateId?: string | number | null;
  activeTheme?: any;
  onOpenTelegramModal?: () => void;
  onConfigSynced?: (cfg: NotificationsConfigPayload) => void;
  embedded?: boolean;
  className?: string;
}

export default function NotificationSettingsPanel({
  role,
  employerId,
  candidateId,
  activeTheme,
  onOpenTelegramModal,
  onConfigSynced,
  embedded = false,
  className = "",
}: NotificationSettingsPanelProps) {
  const {
    supported,
    permission,
    isSubscribedBrowser,
    subscriptionsCount,
    telegramConnected,
    telegramUsername,
    config,
    setConfig,
    loading,
    saving,
    pushBusy,
    statusMessage,
    errorMessage,
    savePreferences,
    subscribePush,
    unsubscribePush,
    sendTestPush,
  } = usePushNotifications({ role, employerId, candidateId });

  const [thresholdDrafts, setThresholdDrafts] = useState<Record<keyof NotificationThresholds, string>>({
    low_balance_rr: String(config.thresholds?.low_balance_rr ?? DEFAULT_NOTIFICATION_THRESHOLDS.low_balance_rr),
    low_general_limits: String(config.thresholds?.low_general_limits ?? DEFAULT_NOTIFICATION_THRESHOLDS.low_general_limits),
    low_vacancy_limits: String(config.thresholds?.low_vacancy_limits ?? DEFAULT_NOTIFICATION_THRESHOLDS.low_vacancy_limits),
  });

  useEffect(() => {
    setThresholdDrafts({
      low_balance_rr: String(config.thresholds?.low_balance_rr ?? DEFAULT_NOTIFICATION_THRESHOLDS.low_balance_rr),
      low_general_limits: String(config.thresholds?.low_general_limits ?? DEFAULT_NOTIFICATION_THRESHOLDS.low_general_limits),
      low_vacancy_limits: String(config.thresholds?.low_vacancy_limits ?? DEFAULT_NOTIFICATION_THRESHOLDS.low_vacancy_limits),
    });
  }, [
    config.thresholds?.low_balance_rr,
    config.thresholds?.low_general_limits,
    config.thresholds?.low_vacancy_limits,
  ]);

  const eventsList = role === "candidate" ? CANDIDATE_EVENT_DESCRIPTORS : EMPLOYER_EVENT_DESCRIPTORS;

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

  const persistNext = async (next: NotificationsConfigPayload) => {
    setConfig(next);
    if (onConfigSynced) {
      onConfigSynced(next);
    }
    const ok = await savePreferences(next);
    if (ok && onConfigSynced) {
      onConfigSynced(next);
    }
  };

  const toggleChannelGlobal = async (channel: NotificationChannelKey) => {
    const next: NotificationsConfigPayload = {
      ...config,
      channels: {
        ...config.channels,
        [channel]: !config.channels[channel],
      },
    };
    await persistNext(next);
  };

  const toggleEventChannel = async (eventKey: string, channel: NotificationChannelKey) => {
    const curMat = config.event_channels?.[eventKey] || { bell: true, telegram: true, push: true };
    const nextVal = !curMat[channel];
    const nextMat = { ...curMat, [channel]: nextVal };

    const next: NotificationsConfigPayload = {
      ...config,
      events: {
        ...config.events,
        ...(channel === "telegram" ? { [eventKey]: nextVal } : {}),
      },
      event_channels: {
        ...config.event_channels,
        [eventKey]: nextMat,
      },
    };
    await persistNext(next);
  };

  const commitThreshold = async (key: keyof NotificationThresholds, fallback: number) => {
    const raw = thresholdDrafts[key];
    const parsed = Number(raw);
    const cleanVal = Number.isFinite(parsed) && parsed >= 0 && raw !== "" ? Math.floor(parsed) : fallback;
    setThresholdDrafts((prev) => ({ ...prev, [key]: String(cleanVal) }));

    const currentThresholds: NotificationThresholds = {
      ...DEFAULT_NOTIFICATION_THRESHOLDS,
      ...(config.thresholds || {}),
    };
    if (currentThresholds[key] === cleanVal) return;

    await persistNext({
      ...config,
      thresholds: {
        ...currentThresholds,
        [key]: cleanVal,
      },
    });
  };

  return (
    <div
      className={
        embedded
          ? `space-y-4 text-left ${className}`
          : `section-card liquid-glass-card bg-transparent border backdrop-blur-2xl p-5 sm:p-6 space-y-5 shadow-xl text-left ${className}`
      }
      style={
        embedded
          ? undefined
          : {
              borderColor,
              borderRadius,
              borderWidth: activeTheme?.containerBorderWidth != null ? `${activeTheme.containerBorderWidth}px` : "1px",
            }
      }
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-3.5">
        <div className="space-y-1 min-w-0">
          <h4 className="text-base sm:text-lg font-bold flex items-center gap-2" style={headingStyle}>
            <SlidersHorizontal className="w-5 h-5 shrink-0 text-[#E7C768]" />
            <span>Настройка уведомлений (Telegram, Колокольчик, Push)</span>
          </h4>
          <p className="text-[14px] text-slate-200 leading-relaxed">
            Выберите удобные каналы доставки и галочки для каждого события в системе.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void sendTestPush()}
          disabled={pushBusy}
          className="cursor-pointer bg-transparent hover:bg-white/10 border border-white/25 text-white font-semibold text-[14px] px-4 py-2.5 min-h-[44px] rounded-xl transition inline-flex items-center justify-center gap-2 shrink-0 disabled:opacity-60"
        >
          {pushBusy ? <Loader2 className="w-4 h-4 animate-spin text-[#E7C768]" /> : <Sparkles className="w-4 h-4 text-[#E7C768]" />}
          <span>Проверить уведомления</span>
        </button>
      </div>

      {/* 3 Channels Summary Cards */}
      <div className={`grid grid-cols-1 ${embedded ? "sm:grid-cols-3" : "md:grid-cols-3"} gap-3.5`}>
        {/* Channel 1: Bell */}
        <div className="bg-transparent border border-white/20 rounded-2xl p-4 space-y-3 flex flex-col justify-between backdrop-blur-md">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-[14px] font-bold text-white flex items-center gap-2">
                <Bell className="w-4 h-4 text-[#E7C768] shrink-0" />
                <span>Колокольчик</span>
              </span>
              <span className="text-[14px] font-semibold text-[#F4EE8E]">
                {config.channels.bell ? "Включён" : "Выключен"}
              </span>
            </div>
            <p className="text-[14px] text-slate-300 leading-snug">
              Лента событий в шапке личного кабинета и история операций.
            </p>
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={() => void toggleChannelGlobal("bell")}
            className={`w-full py-2.5 px-3 min-h-[44px] rounded-xl text-[14px] font-bold border transition cursor-pointer flex items-center justify-center gap-2 ${
              config.channels.bell
                ? "bg-gradient-to-r from-[#FFE580] via-[#E7C768] to-[#C8A038] text-[#17344F] border-[#E7C768]"
                : "bg-transparent text-white border-white/25 hover:bg-white/10"
            }`}
            style={config.channels.bell && activeTheme?.btnActiveBgColor ? activeBtnStyle : undefined}
          >
            {config.channels.bell && <Check className="w-4 h-4 shrink-0" />}
            <span>{config.channels.bell ? "Активен для кабинета" : "Включить колокольчик"}</span>
          </button>
        </div>

        {/* Channel 2: Web Push */}
        <div className="bg-transparent border border-white/20 rounded-2xl p-4 space-y-3 flex flex-col justify-between backdrop-blur-md">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-[14px] font-bold text-white flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-[#E7C768] shrink-0" />
                <span>Push-уведомления</span>
              </span>
              <span className="text-[14px] font-semibold text-[#F4EE8E]">
                {isSubscribedBrowser || subscriptionsCount > 0 ? `Устройств: ${Math.max(1, subscriptionsCount)}` : "Не подключены"}
              </span>
            </div>
            <p className="text-[14px] text-slate-300 leading-snug">
              {permission === "denied"
                ? "Доступ запрещён в настройках браузера — разрешите показ уведомлений."
                : !supported
                ? "Для iPhone установите сайт на экран «Домой», чтобы получать Push."
                : "Мгновенные оповещения на телефон и компьютер, даже когда сайт закрыт."}
            </p>
          </div>
          <div className="flex flex-col gap-2">
            {isSubscribedBrowser ? (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void toggleChannelGlobal("push")}
                  className={`flex-1 py-2.5 px-3 min-h-[44px] rounded-xl text-[14px] font-bold border transition cursor-pointer flex items-center justify-center gap-1.5 ${
                    config.channels.push
                      ? "bg-gradient-to-r from-[#FFE580] via-[#E7C768] to-[#C8A038] text-[#17344F] border-[#E7C768]"
                      : "bg-transparent text-white border-white/25 hover:bg-white/10"
                  }`}
                  style={config.channels.push && activeTheme?.btnActiveBgColor ? activeBtnStyle : undefined}
                >
                  {config.channels.push && <Check className="w-4 h-4 shrink-0" />}
                  <span>{config.channels.push ? "Push включён" : "На паузе"}</span>
                </button>
                <button
                  type="button"
                  disabled={pushBusy}
                  onClick={() => void unsubscribePush()}
                  className="py-2.5 px-3 min-h-[44px] rounded-xl text-[14px] font-semibold border border-white/25 text-slate-200 hover:bg-white/10 transition cursor-pointer"
                >
                  Отвязать
                </button>
              </div>
            ) : (
              <button
                type="button"
                disabled={pushBusy}
                onClick={() => void subscribePush()}
                className="w-full py-2.5 px-3 min-h-[44px] rounded-xl bg-gradient-to-r from-[#FFE580] via-[#E7C768] to-[#C8A038] text-[#17344F] font-bold text-[14px] border border-[#E7C768] hover:brightness-110 transition cursor-pointer flex items-center justify-center gap-2"
                style={activeTheme?.btnActiveBgColor ? activeBtnStyle : undefined}
              >
                {pushBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Smartphone className="w-4 h-4" />}
                <span>Подключить Push</span>
              </button>
            )}
          </div>
        </div>

        {/* Channel 3: Telegram */}
        <div className="bg-transparent border border-white/20 rounded-2xl p-4 space-y-3 flex flex-col justify-between backdrop-blur-md">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-[14px] font-bold text-white flex items-center gap-2">
                <Send className="w-4 h-4 text-[#E7C768] shrink-0" />
                <span>Telegram</span>
              </span>
              <span className="text-[14px] font-semibold text-[#F4EE8E] truncate max-w-[160px]">
                {telegramConnected ? (telegramUsername ? `@${telegramUsername.replace(/^@/, "")}` : "Подключён") : "Не указан"}
              </span>
            </div>
            <p className="text-[14px] text-slate-300 leading-snug">
              {role === "employer"
                ? "Сообщения через бота @RoboRecrutBot в личный чат, группу или канал."
                : "Дублирование важных обновлений в ваш Telegram-аккаунт."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => void toggleChannelGlobal("telegram")}
              className={`flex-1 py-2.5 px-3 min-h-[44px] rounded-xl text-[14px] font-bold border transition cursor-pointer flex items-center justify-center gap-1.5 ${
                config.channels.telegram
                  ? "bg-gradient-to-r from-[#FFE580] via-[#E7C768] to-[#C8A038] text-[#17344F] border-[#E7C768]"
                  : "bg-transparent text-white border-white/25 hover:bg-white/10"
              }`}
              style={config.channels.telegram && activeTheme?.btnActiveBgColor ? activeBtnStyle : undefined}
            >
              {config.channels.telegram && <Check className="w-4 h-4 shrink-0" />}
              <span>{config.channels.telegram ? "Telegram включён" : "Выключен"}</span>
            </button>
            {onOpenTelegramModal ? (
              <button
                type="button"
                onClick={onOpenTelegramModal}
                className="py-2.5 px-3 min-h-[44px] rounded-xl text-[14px] font-semibold border border-white/25 text-white hover:bg-white/10 transition cursor-pointer"
              >
                Настроить ID
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {/* Feedback Banner (Gold/White only — zero red/green) */}
      {(statusMessage || errorMessage) && (
        <div className="border border-[#E7C768]/60 rounded-2xl px-4 py-3 text-[14px] text-[#F4EE8E] flex items-center gap-2.5 backdrop-blur-md">
          <CheckCircle2 className="w-4 h-4 text-[#E7C768] shrink-0" />
          <span className="leading-snug">{errorMessage || statusMessage}</span>
        </div>
      )}

      {/* Per-Event Checkboxes Matrix (Mobile-friendly stacked cards, no horizontal overflow) */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="text-[14px] font-bold text-[#F4EE8E]">
            Какие уведомления присылать (по умолчанию отмечены все):
          </span>
          {(loading || saving) && (
            <span className="inline-flex items-center gap-1.5 text-[14px] text-slate-300">
              <Loader2 className="w-4 h-4 animate-spin text-[#E7C768]" />
              <span>{saving ? "Сохранение..." : "Загрузка..."}</span>
            </span>
          )}
        </div>

        <div className="space-y-2.5">
          {eventsList.map((ev) => {
            const mat = config.event_channels?.[ev.key] || { bell: true, telegram: true, push: true };
            const channels: Array<{ key: NotificationChannelKey; label: string }> = [
              { key: "bell", label: "Колокольчик" },
              { key: "push", label: "Push" },
              { key: "telegram", label: "Telegram" },
            ];
            const thKey = ev.thresholdKey;
            const thDefault = ev.defaultThreshold ?? 10;

            return (
              <div
                key={ev.key}
                className="bg-transparent border border-white/15 rounded-2xl p-3.5 sm:p-4 flex flex-col gap-3"
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  <div className="min-w-0 space-y-0.5 flex-1">
                    <div className="text-[14px] font-bold text-white break-words">{ev.title}</div>
                    <div className="text-[14px] text-slate-300 break-words">{ev.description}</div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {channels.map((ch) => {
                      const globalOff = !config.channels[ch.key];
                      const active = mat[ch.key] && !globalOff;
                      return (
                        <button
                          key={ch.key}
                          type="button"
                          role="checkbox"
                          aria-checked={active}
                          disabled={saving || globalOff}
                          onClick={() => void toggleEventChannel(ev.key, ch.key)}
                          className={`px-3 py-2 min-h-[44px] rounded-xl text-[14px] font-semibold border transition cursor-pointer inline-flex items-center gap-2 disabled:opacity-45 ${
                            active
                              ? "border-[#E7C768] text-[#17344F] bg-gradient-to-r from-[#FFE580] via-[#E7C768] to-[#C8A038]"
                              : "border-white/25 text-white bg-transparent hover:bg-white/10"
                          }`}
                          style={active && activeTheme?.btnActiveBgColor ? activeBtnStyle : undefined}
                        >
                          <span
                            className={`w-4 h-4 rounded flex items-center justify-center border shrink-0 ${
                              active
                                ? "border-[#17344F]/50 bg-[#17344F]/15 text-[#17344F]"
                                : "border-white/40 bg-transparent text-transparent"
                            }`}
                          >
                            {active && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                          </span>
                          <span>{ch.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {thKey && (
                  <div className="flex flex-wrap items-center gap-2.5 pt-2 border-t border-white/10">
                    <label
                      htmlFor={`threshold-${thKey}`}
                      className="text-[14px] font-semibold text-[#F4EE8E]"
                    >
                      {ev.thresholdLabel || "Порог:"}
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        id={`threshold-${thKey}`}
                        type="number"
                        min={0}
                        step={1}
                        value={thresholdDrafts[thKey] ?? String(thDefault)}
                        onChange={(e) =>
                          setThresholdDrafts((prev) => ({ ...prev, [thKey]: e.target.value }))
                        }
                        onBlur={() => void commitThreshold(thKey, thDefault)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            void commitThreshold(thKey, thDefault);
                          }
                        }}
                        className="w-24 bg-transparent border border-white/25 rounded-xl px-3 py-1.5 text-[14px] font-mono text-white focus:outline-none focus:border-[#E7C768] transition-colors"
                      />
                      <span className="text-[14px] text-slate-300">{ev.thresholdUnit || ""}</span>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => void commitThreshold(thKey, thDefault)}
                        className="px-3 py-1.5 min-h-[38px] rounded-xl border border-[#E7C768]/60 text-[#F4EE8E] hover:bg-white/10 text-[14px] font-semibold transition cursor-pointer"
                      >
                        Применить
                      </button>
                    </div>
                    <span className="text-[14px] text-slate-400">
                      (по умолчанию: {thDefault} {ev.thresholdUnit || ""})
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
