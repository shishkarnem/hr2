import { useState, useEffect, useCallback } from "react";
import {
  buildClientDefaultConfig,
  DEFAULT_NOTIFICATION_THRESHOLDS,
  NotificationOwnerRole,
  NotificationsConfigPayload,
} from "./notificationConfig";

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export interface UsePushOptions {
  role: NotificationOwnerRole;
  employerId?: string | number | null;
  candidateId?: string | number | null;
}

function normalizeClientConfig(
  incoming: Partial<NotificationsConfigPayload> | null | undefined,
  role: NotificationOwnerRole
): NotificationsConfigPayload {
  const def = buildClientDefaultConfig(role);
  if (!incoming) return def;
  return {
    telegram_user_ids: String(incoming.telegram_user_ids ?? def.telegram_user_ids),
    telegram_group_ids: String(incoming.telegram_group_ids ?? def.telegram_group_ids),
    telegram_channel_ids: String(incoming.telegram_channel_ids ?? def.telegram_channel_ids),
    channels: {
      ...def.channels,
      ...(incoming.channels || {}),
    },
    events: {
      ...def.events,
      ...(incoming.events || {}),
    },
    event_channels: {
      ...def.event_channels,
      ...(incoming.event_channels || {}),
    },
    thresholds: {
      ...DEFAULT_NOTIFICATION_THRESHOLDS,
      ...(incoming.thresholds || {}),
    },
  };
}

export function usePushNotifications({ role, employerId, candidateId }: UsePushOptions) {
  const [supported, setSupported] = useState<boolean>(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [isSubscribedBrowser, setIsSubscribedBrowser] = useState<boolean>(false);
  const [subscriptionsCount, setSubscriptionsCount] = useState<number>(0);
  const [telegramConnected, setTelegramConnected] = useState<boolean>(false);
  const [telegramUsername, setTelegramUsername] = useState<string>("");
  const [config, setConfig] = useState<NotificationsConfigPayload>(() => buildClientDefaultConfig(role));
  const [loading, setLoading] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [pushBusy, setPushBusy] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string>("");

  const buildAuthHeaders = useCallback((): Record<string, string> => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (role === "candidate") {
      let cId = candidateId ? String(candidateId) : "";
      let cToken = "";
      try {
        const raw = localStorage.getItem("cand_session");
        if (raw) {
          const parsed = JSON.parse(raw);
          cId = cId || String(parsed?.public_id || parsed?.candidate_id || parsed?.id || "");
          cToken = String(parsed?.token || cId || "");
        }
        if (!cId) {
          const rawId = localStorage.getItem("cand_session_id");
          if (rawId) cId = rawId.replace(/^candidate/i, "").replace(/^cand/i, "");
        }
        if (!cId && typeof window !== "undefined") {
          const m = window.location.pathname.match(/\/cand(?:idate)?(\d+)/i);
          if (m?.[1]) cId = m[1];
        }
      } catch {}
      if (cId) headers["x-candidate-id"] = cId;
      if (cToken) headers["x-candidate-token"] = cToken;
    } else {
      let eId = employerId ? String(employerId) : "";
      const eToken =
        localStorage.getItem("emp_token") ||
        localStorage.getItem("employer_token") ||
        localStorage.getItem("employer_auth_token") ||
        "";
      if (!eId) {
        try {
          const u = JSON.parse(localStorage.getItem("emp_user") || "{}");
          eId = String(u?.publicId || u?.public_id || u?.employerId || u?.id || "");
        } catch {}
      }
      if (!eId) {
        eId = localStorage.getItem("current_employer_id") || "";
      }
      if (!eId && typeof window !== "undefined") {
        const m = window.location.pathname.match(/\/emp(?:loyer)?(\d+)/i);
        if (m?.[1]) eId = m[1];
      }
      if (eToken) {
        headers["Authorization"] = `Bearer ${eToken}`;
        headers["x-employer-token"] = eToken;
      }
      if (eId) headers["x-employer-id"] = eId;
    }
    return headers;
  }, [role, employerId, candidateId]);

  const checkEnvironment = useCallback(async () => {
    if (typeof window === "undefined") return;
    const isSup =
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window;
    setSupported(isSup);
    if ("Notification" in window) {
      setPermission(Notification.permission);
    }
    if (isSup) {
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) {
          const sub = await reg.pushManager.getSubscription();
          setIsSubscribedBrowser(Boolean(sub));
        }
      } catch {}
    }
  }, []);

  const loadPreferences = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/notifications/preferences", {
        headers: buildAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.ok && data?.config) {
          setConfig(normalizeClientConfig(data.config, role));
          setSubscriptionsCount(Number(data.subscriptionsCount || 0));
          setTelegramConnected(Boolean(data.telegramConnected));
          setTelegramUsername(String(data.telegramUsername || ""));
        }
      }
    } catch {
      // Ignore network hiccup on initial load
    } finally {
      setLoading(false);
    }
  }, [buildAuthHeaders, role]);

  useEffect(() => {
    void checkEnvironment();
    void loadPreferences();
    const onRefresh = () => {
      void checkEnvironment();
      void loadPreferences();
    };
    window.addEventListener("notifications-refresh", onRefresh);
    return () => window.removeEventListener("notifications-refresh", onRefresh);
  }, [checkEnvironment, loadPreferences]);

  const savePreferences = useCallback(
    async (nextConfig: NotificationsConfigPayload, options?: { includeTargets?: boolean }) => {
      setSaving(true);
      setErrorMessage("");
      setStatusMessage("");
      const normalizedNext = normalizeClientConfig(nextConfig, role);
      setConfig(normalizedNext);

      const payloadConfig: Record<string, any> = {
        channels: normalizedNext.channels,
        events: normalizedNext.events,
        event_channels: normalizedNext.event_channels,
        thresholds: normalizedNext.thresholds,
      };
      if (options?.includeTargets) {
        payloadConfig.telegram_user_ids = normalizedNext.telegram_user_ids;
        payloadConfig.telegram_group_ids = normalizedNext.telegram_group_ids;
        payloadConfig.telegram_channel_ids = normalizedNext.telegram_channel_ids;
      }

      const bodyStr = JSON.stringify({ config: payloadConfig });
      const headers = buildAuthHeaders();

      try {
        let res = await fetch("/api/notifications/preferences", {
          method: "PUT",
          headers,
          body: bodyStr,
        });
        if (res.status === 403 || res.status === 404 || res.status === 405) {
          res = await fetch("/api/notifications/preferences/save", {
            method: "POST",
            headers,
            body: bodyStr,
          });
        }
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.ok) {
          setErrorMessage(data?.message || data?.error || "Не удалось сохранить настройки уведомлений");
          return false;
        }
        if (data.config) setConfig(normalizeClientConfig(data.config, role));
        setStatusMessage("Настройки уведомлений сохранены");
        window.dispatchEvent(new CustomEvent("notifications-refresh"));
        return true;
      } catch (err: any) {
        try {
          const fallbackRes = await fetch("/api/notifications/preferences/save", {
            method: "POST",
            headers,
            body: bodyStr,
          });
          const fallbackData = await fallbackRes.json().catch(() => ({}));
          if (fallbackRes.ok && fallbackData?.ok) {
            if (fallbackData.config) setConfig(normalizeClientConfig(fallbackData.config, role));
            setStatusMessage("Настройки уведомлений сохранены");
            window.dispatchEvent(new CustomEvent("notifications-refresh"));
            return true;
          }
        } catch {}
        setErrorMessage(err?.message || "Ошибка сети при сохранении настроек");
        return false;
      } finally {
        setSaving(false);
      }
    },
    [buildAuthHeaders, role]
  );

  const subscribePush = useCallback(async () => {
    setPushBusy(true);
    setErrorMessage("");
    setStatusMessage("");
    try {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        setErrorMessage(
          "На этом устройстве или в этом окне браузер не поддерживает Web Push. На iPhone сначала установите сайт на экран «Домой»."
        );
        return false;
      }

      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") {
        setErrorMessage("Доступ к уведомлениям запрещён в настройках браузера.");
        return false;
      }

      const reg =
        (await navigator.serviceWorker.getRegistration()) ||
        (await navigator.serviceWorker.register("/sw.js", { scope: "/" }));
      await navigator.serviceWorker.ready;

      const keyRes = await fetch("/api/push/vapid-public-key");
      const keyData = await keyRes.json();
      if (!keyData?.publicKey) {
        setErrorMessage("Сервер не вернул ключ Web Push (VAPID).");
        return false;
      }

      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(keyData.publicKey),
        });
      }

      const saveRes = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: buildAuthHeaders(),
        body: JSON.stringify({ subscription: sub.toJSON() }),
      });
      const saveData = await saveRes.json().catch(() => ({}));
      if (!saveRes.ok || !saveData?.ok) {
        setErrorMessage(saveData?.message || "Не удалось зарегистрировать Push-подписку на сервере.");
        return false;
      }

      setIsSubscribedBrowser(true);
      setSubscriptionsCount(Number(saveData.subscriptionsCount || 1));
      setConfig((prev) => ({
        ...prev,
        channels: { ...prev.channels, push: true },
      }));
      setStatusMessage("Push-уведомления успешно подключены для этого устройства!");
      window.dispatchEvent(new CustomEvent("notifications-refresh"));
      return true;
    } catch (err: any) {
      setErrorMessage(err?.message || "Не удалось подключить Push-уведомления.");
      return false;
    } finally {
      setPushBusy(false);
    }
  }, [buildAuthHeaders]);

  const unsubscribePush = useCallback(async () => {
    setPushBusy(true);
    setErrorMessage("");
    setStatusMessage("");
    try {
      const reg = await navigator.serviceWorker?.getRegistration();
      const sub = await reg?.pushManager?.getSubscription();
      const endpoint = sub?.endpoint || "";
      if (sub) {
        await sub.unsubscribe().catch(() => {});
      }
      if (endpoint) {
        const res = await fetch("/api/push/unsubscribe", {
          method: "POST",
          headers: buildAuthHeaders(),
          body: JSON.stringify({ endpoint }),
        });
        const data = await res.json().catch(() => ({}));
        setSubscriptionsCount(Number(data?.subscriptionsCount || 0));
      }
      setIsSubscribedBrowser(false);
      setStatusMessage("Push-подписка на этом устройстве отключена.");
      window.dispatchEvent(new CustomEvent("notifications-refresh"));
      return true;
    } catch (err: any) {
      setErrorMessage(err?.message || "Ошибка при отключении Push-подписки.");
      return false;
    } finally {
      setPushBusy(false);
    }
  }, [buildAuthHeaders]);

  const sendTestPush = useCallback(async () => {
    setPushBusy(true);
    setErrorMessage("");
    setStatusMessage("");
    try {
      const res = await fetch("/api/push/test", {
        method: "POST",
        headers: buildAuthHeaders(),
        body: JSON.stringify({ includeBell: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        setErrorMessage(data?.message || "Не удалось отправить тестовое уведомление.");
        return false;
      }
      window.dispatchEvent(new CustomEvent("notifications-refresh"));
      if (data.sent > 0) {
        setStatusMessage(`Тестовое Push-уведомление отправлено (устройств: ${data.sent}) и добавлено в колокольчик.`);
      } else {
        setStatusMessage("Тестовое уведомление добавлено в колокольчик. Подключите Push на устройстве для системных оповещений.");
      }
      return true;
    } catch (err: any) {
      setErrorMessage(err?.message || "Ошибка отправки тестового уведомления.");
      return false;
    } finally {
      setPushBusy(false);
    }
  }, [buildAuthHeaders]);

  return {
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
    loadPreferences,
    savePreferences,
    subscribePush,
    unsubscribePush,
    sendTestPush,
  };
}
