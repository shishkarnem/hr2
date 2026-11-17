import React, { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  Bell,
  CheckCheck,
  Loader2,
  X,
  CreditCard,
  Sparkles,
  ArrowRight,
  UserSquare2,
  Receipt,
  Layers,
  Coins,
} from "lucide-react";
import { dbClient } from "@/lib/dbClient";
import { useRouter } from "@/components/RouterContext";
import { useLandingTheme } from "./LandingStyleEditor";

export type NotificationItem = {
  id: string;
  kind: string;
  title: string;
  body: string;
  link: string | null;
  read_at: string | null;
  created_at: string;
  meta?: {
    transaction_id?: string;
    amount_rr?: number;
    amount_limits?: number;
    type?: string;
    type_balance?: string;
    type_limits?: string;
    description?: string;
    note?: string;
    candidate_id?: string;
    decision?: string;
    wallet_id?: string;
    [key: string]: any;
  };
};

function formatTimeAgo(isoString: string): string {
  try {
    const time = new Date(isoString).getTime();
    if (isNaN(time)) return "Недавно";
    const diff = Math.max(0, Date.now() - time);
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Только что";
    if (mins < 60) return `${mins} мин. назад`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} ч. назад`;
    const days = Math.floor(hours / 24);
    return `${days} дн. назад`;
  } catch {
    return "Недавно";
  }
}

function formatFullDate(isoString: string): string {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

type Props = {
  employerId?: string | null;
  candidateId?: string | null;
  className?: string;
  activeTheme?: any;
};

const isTransactionNotification = (item: NotificationItem | null): boolean => {
  if (!item) return false;
  if (
    item.kind === "transaction" ||
    item.kind === "limits" ||
    item.kind === "balance" ||
    item.kind === "billing" ||
    item.kind === "topup" ||
    item.kind === "profile"
  ) {
    return true;
  }
  if (item.id && (item.id.startsWith("tx_") || item.id.startsWith("tr_"))) {
    return true;
  }
  if (
    item.meta &&
    (item.meta.transaction_id ||
      item.meta.amount_rr !== undefined ||
      item.meta.amount_limits !== undefined ||
      item.meta.wallet_id)
  ) {
    return true;
  }
  return false;
};

const extractCandidateId = (item: NotificationItem | null): string | null => {
  if (!item) return null;
  if (item.meta?.candidate_id) return String(item.meta.candidate_id);
  if (item.meta?.candidateId) return String(item.meta.candidateId);
  if ((item as any).candidate_id) return String((item as any).candidate_id);
  if (item.link) {
    const qMatch = item.link.match(/[?&]candidate=([^&]+)/i);
    if (qMatch) return decodeURIComponent(qMatch[1]);
    const cMatch = item.link.match(/\/(?:candidates?|c)\/([a-zA-Z0-9_-]+)/i);
    if (cMatch) return decodeURIComponent(cMatch[1]);
  }
  return null;
};

const isCandidateProgressionNotification = (item: NotificationItem | null): boolean => {
  if (!item) return false;
  if (isTransactionNotification(item)) return false;
  if (extractCandidateId(item)) return true;
  const k = (item.kind || "").toLowerCase();
  if (
    [
      "candidate",
      "interview",
      "training",
      "stage",
      "test",
      "candidate_stage",
      "candidate_interview",
      "candidate_training",
    ].includes(k)
  ) {
    return true;
  }
  const title = (item.title || "").toLowerCase();
  const body = (item.body || "").toLowerCase();
  if (
    title.includes("кандидат") ||
    title.includes("собеседован") ||
    title.includes("интервью") ||
    title.includes("обучен") ||
    title.includes("этап") ||
    body.includes("кандидат") ||
    body.includes("интервью") ||
    body.includes("обучен") ||
    body.includes("этап")
  ) {
    return Boolean(item.link || extractCandidateId(item));
  }
  return false;
};

export default function NotificationsBell({ employerId, candidateId, className = "", activeTheme: propTheme }: Props) {
  const { navigate } = useRouter();
  const { activeTheme: hookTheme } = useLandingTheme(propTheme);
  const theme = propTheme || hookTheme;
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [detail, setDetail] = useState<NotificationItem | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const getEffectiveEmployerId = useCallback((): string => {
    if (employerId) return String(employerId);
    try {
      const uStr = localStorage.getItem("emp_user");
      if (uStr) {
        const u = JSON.parse(uStr);
        if (u?.publicId || u?.public_id || u?.employerId || u?.id) {
          return String(u.publicId || u.public_id || u.employerId || u.id);
        }
      }
    } catch {}
    return "";
  }, [employerId]);

  const getEffectiveCandidateId = useCallback((): string => {
    if (candidateId) return String(candidateId);
    try {
      const cStr = localStorage.getItem("cand_session");
      if (cStr) {
        const c = JSON.parse(cStr);
        if (c?.public_id || c?.candidate_id || c?.publicId || c?.id) {
          return String(c.public_id || c.candidate_id || c.publicId || c.id);
        }
      }
      const rawId = localStorage.getItem("cand_session_id");
      if (rawId) return rawId.replace(/^candidate/i, "").replace(/^cand/i, "");
    } catch {}
    return "";
  }, [candidateId]);

  const loadNotifications = useCallback(async () => {
    try {
      const candId = getEffectiveCandidateId();
      const empId = candId ? "" : getEffectiveEmployerId();
      const empToken = candId
        ? ""
        : (localStorage.getItem("emp_token") || localStorage.getItem("employer_auth_token") || "");
      const candToken = candId
        ? (function() {
            try {
              const raw = localStorage.getItem("cand_session");
              if (raw) return (JSON.parse(raw) as any)?.token || candId;
            } catch {}
            return candId;
          })()
        : "";

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (candId) {
        headers["x-candidate-id"] = candId;
        if (candToken) headers["x-candidate-token"] = candToken;
      } else {
        if (empToken) {
          headers["Authorization"] = `Bearer ${empToken}`;
          headers["x-employer-token"] = empToken;
        }
        if (empId) {
          headers["x-employer-id"] = empId;
        }
      }

      const queryUrl = candId
        ? `/api/notifications?candidate_id=${encodeURIComponent(candId)}&limit=100`
        : `/api/notifications?employer_id=${encodeURIComponent(empId)}&limit=100`;

      // Try local REST first
      const resp = await fetch(queryUrl, { headers }).catch(() => null);

      if (resp && resp.ok) {
        const json = await resp.json();
        if (json && Array.isArray(json.items)) {
          setItems(json.items);
          setUnread(Number(json.unread || 0));
          return;
        }
      }

      // Fallback to database / RPC aggregator
      if (!candId) {
        const { data } = await (dbClient as any).rpc("notifications_list", {
          _limit: 100,
          employer_id: empId,
        });

        if (data && typeof data === "object") {
          const arr = Array.isArray(data.items) ? data.items : [];
          setItems(arr);
          setUnread(Number(data.unread || 0));
        }
      }
    } catch (e) {
      console.warn("[NotificationsBell] Failed to fetch notifications:", e);
    } finally {
      setLoading(false);
    }
  }, [getEffectiveEmployerId, getEffectiveCandidateId]);

  useEffect(() => {
    loadNotifications();

    // Auto reload on custom events and periodically
    const handleRefresh = () => loadNotifications();
    window.addEventListener("refresh-balance", handleRefresh);
    window.addEventListener("balance-updated", handleRefresh);
    window.addEventListener("notifications-refresh", handleRefresh);

    const interval = setInterval(loadNotifications, 30000);

    return () => {
      window.removeEventListener("refresh-balance", handleRefresh);
      window.removeEventListener("balance-updated", handleRefresh);
      window.removeEventListener("notifications-refresh", handleRefresh);
      clearInterval(interval);
    };
  }, [loadNotifications]);

  // Realtime database notifications channel
  useEffect(() => {
    try {
      const channel = dbClient
        .channel("bell-notifications-feed")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "notifications" },
          () => {
            loadNotifications();
          }
        )
        .subscribe();

      return () => {
        dbClient.removeChannel(channel);
      };
    } catch {}
  }, [loadNotifications]);

  // Outside click listener
  useEffect(() => {
    if (!open) return;
    const handleDocClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleDocClick);
    return () => document.removeEventListener("mousedown", handleDocClick);
  }, [open]);

  const handleItemClick = async (item: NotificationItem) => {
    if (!item.read_at) {
      const candId = getEffectiveCandidateId();
      const empId = candId ? "" : getEffectiveEmployerId();
      const empToken = candId
        ? ""
        : (localStorage.getItem("emp_token") || localStorage.getItem("employer_auth_token") || "");
      const candToken = candId
        ? (function() {
            try {
              const raw = localStorage.getItem("cand_session");
              if (raw) return (JSON.parse(raw) as any)?.token || candId;
            } catch {}
            return candId;
          })()
        : "";

      try {
        await fetch("/api/notifications/mark-read", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(empToken ? { Authorization: `Bearer ${empToken}` } : {}),
            ...(empId ? { "x-employer-id": empId } : {}),
            ...(candId ? { "x-candidate-id": candId } : {}),
            ...(candToken ? { "x-candidate-token": candToken } : {}),
          },
          body: JSON.stringify({ ids: [item.id], employer_id: empId, candidate_id: candId }),
        }).catch(() => null);

        if (!candId) {
          await (dbClient as any)
            .rpc("notifications_mark_read", {
              _ids: [item.id],
              employer_id: empId,
            })
            .catch(() => null);
        }
      } catch {}

      setItems((prev) =>
        prev.map((x) =>
          x.id === item.id ? { ...x, read_at: new Date().toISOString() } : x
        )
      );
      setUnread((u) => Math.max(0, u - 1));
    }

    setOpen(false);
    setDetail({ ...item, read_at: item.read_at || new Date().toISOString() });
  };

  const handleMarkAllRead = async () => {
    const candId = getEffectiveCandidateId();
    const empId = candId ? "" : getEffectiveEmployerId();
    const empToken = candId
      ? ""
      : (localStorage.getItem("emp_token") || localStorage.getItem("employer_auth_token") || "");
    const candToken = candId
      ? (function() {
          try {
            const raw = localStorage.getItem("cand_session");
            if (raw) return (JSON.parse(raw) as any)?.token || candId;
          } catch {}
          return candId;
        })()
      : "";

    try {
      await fetch("/api/notifications/mark-read", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(empToken ? { Authorization: `Bearer ${empToken}` } : {}),
          ...(empId ? { "x-employer-id": empId } : {}),
          ...(candId ? { "x-candidate-id": candId } : {}),
          ...(candToken ? { "x-candidate-token": candToken } : {}),
        },
        body: JSON.stringify({ employer_id: empId, candidate_id: candId }),
      }).catch(() => null);

      if (!candId) {
        await (dbClient as any)
          .rpc("notifications_mark_read", {
            _ids: null,
            employer_id: empId,
          })
          .catch(() => null);
      }
    } catch {}

    setItems((prev) =>
      prev.map((x) =>
        x.read_at ? x : { ...x, read_at: new Date().toISOString() }
      )
    );
    setUnread(0);
  };

  const iconColor = theme?.iconColor || "#FFFFFF";
  const btnRadius = theme?.btnBorderRadius != null ? `${theme.btnBorderRadius}px` : "12px";
  const containerRadius = theme?.containerBorderRadius != null ? `${theme.containerBorderRadius}px` : "16px";
  const containerBorder = theme?.containerBorderColor
    ? (theme?.containerBorderOpacity != null && theme.containerBorderColor.startsWith("#")
        ? `${theme.containerBorderColor}${Math.round((theme.containerBorderOpacity / 100) * 255).toString(16).padStart(2, "0")}`
        : theme.containerBorderColor)
    : "rgba(255, 255, 255, 0.25)";
  const isCandidateCabinet = Boolean(candidateId || (typeof window !== "undefined" && window.location.pathname.includes("/cand")));
  const popupBlur = Math.min(12, Math.max(6, theme?.glassBlurPx ?? 10));
  const containerBlur = popupBlur;

  const headingStyle: React.CSSProperties = React.useMemo(() => {
    if (theme?.headingsColorMode === "gradient-gold") {
      return {
        backgroundImage: "linear-gradient(to right, #F4EE8E, #E7C768, #D99E41)",
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

  const activeBtnStyle: React.CSSProperties = {
    backgroundColor: theme?.btnActiveBgColor || "#FFFFFF",
    color: theme?.btnActiveTextColor || "#000000",
    borderColor: theme?.btnBorderColor || "rgba(255, 255, 255, 0.25)",
    borderRadius: btnRadius,
  };

  const inactiveBtnStyle: React.CSSProperties = {
    backgroundColor: "transparent",
    color: theme?.btnInactiveTextColor || "#FFFFFF",
    borderColor: theme?.btnBorderColor || "rgba(255, 255, 255, 0.25)",
    borderRadius: btnRadius,
  };

  return (
    <div className={`relative ${className}`} ref={wrapRef}>
      {/* Company-Themed Liquid Glass Bell Button */}
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          if (!open) loadNotifications();
        }}
        aria-label="Уведомления и транзакции"
        title="Уведомления и транзакции"
        className="relative inline-flex items-center justify-center w-10 h-10 bg-transparent hover:bg-white/10 backdrop-blur-xl transition active:scale-95 shadow-md cursor-pointer border"
        style={{
          borderColor: theme?.btnBorderColor || containerBorder,
          borderRadius: btnRadius,
          color: iconColor,
        }}
      >
        <Bell className="w-5 h-5" style={{ color: iconColor }} />
        {unread > 0 && (
          <span
            className="landing-btn-active absolute -top-1.5 -right-1.5 min-w-[22px] h-[22px] px-1 text-sm font-black flex items-center justify-center shadow-lg leading-none border transition-all z-20"
            style={{
              backgroundColor: theme?.btnActiveBgColor || "#FFFFFF",
              color: theme?.btnActiveTextColor || "#000000",
              WebkitTextFillColor: theme?.btnActiveTextColor || "#000000",
              borderColor: theme?.btnBorderColor || "rgba(255, 255, 255, 0.25)",
              borderRadius: theme?.btnBorderRadius != null ? `${theme.btnBorderRadius}px` : "0px",
            }}
          >
            <span
              style={{
                color: theme?.btnActiveTextColor || "#000000",
                WebkitTextFillColor: theme?.btnActiveTextColor || "#000000",
              }}
            >
              {unread > 99 ? "99+" : unread}
            </span>
          </span>
        )}
      </button>

      {/* Notifications Dropdown Window */}
      {open && (
        <div
          className="absolute right-0 mt-3 w-[390px] max-w-[92vw] bg-transparent shadow-2xl z-[100] overflow-hidden text-left animate-in fade-in zoom-in-95 border"
          style={{
            borderColor: containerBorder,
            borderRadius: containerRadius,
            backdropFilter: `blur(${containerBlur}px)`,
            WebkitBackdropFilter: `blur(${containerBlur}px)`,
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 bg-transparent">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 shrink-0" style={{ color: iconColor }} />
              <h3 className="text-base font-bold" style={headingStyle}>
                Уведомления и транзакции
              </h3>
            </div>
            {unread > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="text-sm text-slate-200 hover:text-white inline-flex items-center gap-1.5 font-semibold transition cursor-pointer"
              >
                <CheckCheck className="w-4 h-4" style={{ color: iconColor }} />
                <span>Прочитать все</span>
              </button>
            )}
          </div>

          {/* List Area */}
          <div className="max-h-[65vh] overflow-y-auto divide-y divide-white/10">
            {loading && items.length === 0 ? (
              <div className="px-5 py-10 text-center text-slate-200 inline-flex items-center justify-center gap-2 w-full text-sm">
                <Loader2 className="w-5 h-5 animate-spin" style={{ color: iconColor }} />
                <span>Загрузка данных...</span>
              </div>
            ) : items.length === 0 ? (
              <div className="px-5 py-12 text-center text-slate-300 text-sm">
                <p className="font-semibold text-white mb-1">Нет новых уведомлений</p>
                <p className="text-slate-300">
                  Здесь отображаются операции по балансу, начисления и системные события.
                </p>
              </div>
            ) : (
              <ul className="list-none m-0 p-0">
                {items.map((n) => {
                  const isUnread = !n.read_at;
                  const isTx = n.kind === "transaction" || n.id.startsWith("tx_");

                  return (
                    <li key={n.id}>
                      <button
                        type="button"
                        onClick={() => handleItemClick(n)}
                        className={`w-full text-left px-5 py-3.5 transition flex items-start gap-3 hover:bg-white/10 cursor-pointer ${
                          isUnread ? "bg-white/5" : "opacity-80"
                        }`}
                      >
                        {/* Icon or Unread Dot */}
                        <div
                          className="mt-0.5 shrink-0 flex items-center justify-center w-8 h-8 bg-transparent border border-white/20"
                          style={{ borderRadius: btnRadius }}
                        >
                          {isTx ? (
                            <CreditCard className="w-4 h-4" style={{ color: iconColor }} />
                          ) : (
                            <Sparkles className="w-4 h-4" style={{ color: iconColor }} />
                          )}
                        </div>

                        {/* Text details */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span
                              className={`text-sm font-bold truncate ${
                                isUnread ? "" : "text-white"
                              }`}
                              style={isUnread ? { color: theme?.boldTextColor || headingStyle.color || "#FFFFFF" } : { color: "#FFFFFF" }}
                            >
                              {n.title}
                            </span>
                            {isUnread && (
                              <span
                                className="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm"
                                style={{ backgroundColor: theme?.btnActiveBgColor || iconColor }}
                              />
                            )}
                          </div>

                          {n.body && (
                            <p className="text-sm text-slate-200 mt-1 line-clamp-2 leading-snug">
                              {n.body}
                            </p>
                          )}

                          <div className="flex items-center justify-between gap-2 mt-2 text-sm text-slate-300">
                            <span>{formatTimeAgo(n.created_at)}</span>
                            {isTx && n.meta?.amount_rr !== undefined && (
                              <span className="font-mono font-bold" style={{ color: theme?.boldTextColor || iconColor }}>
                                {n.meta.amount_rr >= 0 ? "+" : ""}
                                {n.meta.amount_rr} RR
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Footer note */}
          <div className="px-5 py-3 border-t border-white/10 bg-transparent flex items-center justify-between text-sm text-slate-300">
            <span>Всего записей: {items.length}</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-slate-200 hover:text-white font-bold cursor-pointer"
            >
              Свернуть
            </button>
          </div>
        </div>
      )}

      {/* Details Modal */}
      {detail &&
        createPortal(
          <div
            className="fixed inset-0 z-[120] bg-transparent flex items-center justify-center p-4"
            onClick={() => setDetail(null)}
          >
            <div
              className="bg-transparent shadow-2xl p-6 sm:p-7 w-full max-w-lg text-white flex flex-col max-h-[88vh] animate-in fade-in zoom-in-95 text-left border"
              style={{
                borderColor: containerBorder,
                borderRadius: containerRadius,
                backdropFilter: `blur(${containerBlur}px)`,
                WebkitBackdropFilter: `blur(${containerBlur}px)`,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="flex items-start justify-between gap-3 mb-4 flex-shrink-0 border-b border-white/10 pb-3">
                <div>
                  <h3 className="text-xl font-bold" style={headingStyle}>
                    {detail.title}
                  </h3>
                  <p className="text-sm text-slate-300 mt-1">
                    Дата события: {formatFullDate(detail.created_at)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setDetail(null)}
                  className="p-2 text-slate-300 hover:text-white hover:bg-white/10 border border-white/20 transition cursor-pointer shrink-0"
                  style={{ borderRadius: btnRadius }}
                  aria-label="Закрыть"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Content */}
              <div className="space-y-4 overflow-y-auto flex-1 pr-1 text-sm">
                {/* Transaction details card if available */}
                {detail.meta && (detail.meta.amount_rr !== undefined || detail.meta.amount_limits !== undefined || detail.meta.transaction_id) && (
                  <div
                    className="bg-transparent backdrop-blur-xl border border-white/20 p-4 space-y-2.5"
                    style={{ borderRadius: containerRadius }}
                  >
                    <div className="flex items-center gap-2 text-sm font-bold" style={{ color: theme?.boldTextColor || iconColor }}>
                      <Receipt className="w-4 h-4" style={{ color: iconColor }} />
                      <span>Сведения о транзакции</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 font-mono text-sm">
                      {detail.meta.amount_rr !== undefined && detail.meta.amount_rr !== null && (
                        <div className="bg-transparent border border-white/10 p-2.5" style={{ borderRadius: btnRadius }}>
                          <span className="text-slate-300 block text-sm">Изменение баланса</span>
                          <span className="text-base font-bold" style={{ color: theme?.boldTextColor || iconColor }}>
                            {detail.meta.amount_rr >= 0 ? "+" : ""}
                            {detail.meta.amount_rr} RR
                          </span>
                        </div>
                      )}

                      {detail.meta.amount_limits !== undefined && detail.meta.amount_limits !== null && detail.meta.amount_limits !== 0 && (
                        <div className="bg-transparent border border-white/10 p-2.5" style={{ borderRadius: btnRadius }}>
                          <span className="text-slate-300 block text-sm">Изменение лимитов</span>
                          <span className="text-base font-bold text-white">
                            {detail.meta.amount_limits >= 0 ? "+" : ""}
                            {detail.meta.amount_limits} шт.
                          </span>
                        </div>
                      )}

                      {detail.meta.type && (
                        <div className="bg-transparent border border-white/10 p-2.5" style={{ borderRadius: btnRadius }}>
                          <span className="text-slate-300 block text-sm">Тип операции</span>
                          <span className="text-sm font-medium text-white">{detail.meta.type}</span>
                        </div>
                      )}

                      {detail.meta.transaction_id && (
                        <div className="bg-transparent border border-white/10 p-2.5" style={{ borderRadius: btnRadius }}>
                          <span className="text-slate-300 block text-sm">ID транзакции</span>
                          <span className="text-sm font-mono text-slate-300 truncate block">
                            {detail.meta.transaction_id}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Body Text */}
                {detail.body && (
                  <div
                    className="bg-transparent backdrop-blur-xl border border-white/20 p-4 text-sm text-slate-100 whitespace-pre-wrap leading-relaxed"
                    style={{ borderRadius: containerRadius }}
                  >
                    {detail.body}
                  </div>
                )}
              </div>

              {/* Modal Actions */}
              <div className="flex flex-wrap gap-2.5 justify-end mt-5 pt-3 border-t border-white/10 flex-shrink-0 text-sm">
                {(() => {
                  if (isCandidateCabinet) return null;
                  const candidateId = extractCandidateId(detail);
                  const isCandidateNotif = isCandidateProgressionNotification(detail);

                  // Only show navigation button for candidate interview/training stage notifications
                  if (candidateId || (isCandidateNotif && detail.link)) {
                    return (
                      <button
                        type="button"
                        onClick={() => {
                          const id = candidateId;
                          setDetail(null);
                          if (id) {
                            const ev = new CustomEvent("open-candidate-card", {
                              detail: { id },
                            });
                            window.dispatchEvent(ev);
                          }
                          if (detail.link) {
                            const targetLink =
                              id && !detail.link.includes("candidate=")
                                ? `${detail.link}${detail.link.includes("?") ? "&" : "?"}candidate=${encodeURIComponent(id)}`
                                : detail.link;
                            navigate(targetLink);
                          } else if (id) {
                            const empId = getEffectiveEmployerId();
                            if (empId) {
                              navigate(`/emp${empId}/crm?candidate=${encodeURIComponent(id)}`);
                            }
                          }
                        }}
                        className="inline-flex items-center gap-2 px-4 py-2.5 font-bold text-sm transition cursor-pointer shadow-md border"
                        style={activeBtnStyle}
                      >
                        <UserSquare2 className="w-4 h-4" />
                        <span>Перейти к кандидату</span>
                      </button>
                    );
                  }
                  return null;
                })()}

                <button
                  type="button"
                  onClick={() => setDetail(null)}
                  className="px-5 py-2.5 font-semibold text-sm transition cursor-pointer border"
                  style={inactiveBtnStyle}
                >
                  Закрыть
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
