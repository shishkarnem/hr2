import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Loader2, Search, X } from "lucide-react";
import { getAuthHeaders } from "@/lib/dbClient";
import { GOLD_BUTTON_CLASS, GOLD_TEXT_CLASS, safeArray } from "../panel/adminConfig";
import { ADMIN_PAGE_SIZE, InfiniteScrollTrigger } from "../panel/PaginationControls";

export interface SelectedRecipient {
  kind: "employer" | "candidate";
  id: string;
  name?: string;
  email?: string;
  public_id?: string;
  has_telegram?: boolean;
}

export function RecipientPickerModal({
  open,
  selected,
  onChange,
  onClose,
}: {
  open: boolean;
  selected: SelectedRecipient[];
  onChange: (next: SelectedRecipient[]) => void;
  onClose: () => void;
}) {
  const [kind, setKind] = useState<"all" | "employer" | "candidate">("all");
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [items, setItems] = useState<SelectedRecipient[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(searchInput.trim());
    }, 260);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const loadRecipients = async (append = false, currentLen = 0) => {
    if (append) setLoadingMore(true);
    else setLoading(true);
    try {
      const offset = append ? currentLen : 0;
      const res = await fetch(
        `/api/admin/mailings/recipients?kind=${kind}&q=${encodeURIComponent(
          searchQuery
        )}&limit=${ADMIN_PAGE_SIZE}&offset=${offset}`,
        { headers: getAuthHeaders() }
      );
      if (res.ok) {
        const data = await res.json();
        const nextItems = safeArray(data?.items);
        setItems((prev) => (append ? [...prev, ...nextItems] : nextItems));
        setTotal(Number(data?.total ?? nextItems.length));
        setHasMore(Boolean(data?.hasMore));
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    loadRecipients(false, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, kind, searchQuery]);

  if (!open || typeof document === "undefined") return null;

  const isSelected = (item: SelectedRecipient) =>
    selected.some((s) => s.kind === item.kind && s.id === item.id);

  const toggleItem = (item: SelectedRecipient) => {
    if (isSelected(item)) {
      onChange(selected.filter((s) => !(s.kind === item.kind && s.id === item.id)));
    } else {
      onChange([...selected, item]);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[950] flex items-center justify-center p-3 sm:p-4 bg-[#0D2032]/75 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl max-h-[88vh] flex flex-col bg-gradient-to-br from-[#17344F] via-[#1E4468] to-[#265582] border border-[#E7C768]/50 rounded-3xl shadow-[0_24px_60px_rgba(0,0,0,0.65)] text-white overflow-hidden"
      >
        <div className="p-4 sm:p-5 border-b border-white/15 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className={`text-base sm:text-lg font-bold ${GOLD_TEXT_CLASS}`}>
              Выбор получателей ({selected.length} выбрано)
            </h3>
            <p className="text-sm text-slate-200">
              Всего найдено: {total} пользователей
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl border border-white/25 hover:border-[#E7C768] text-white cursor-pointer shrink-0"
            aria-label="Закрыть"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 border-b border-white/15 space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 text-[#E7C768] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Поиск по имени, email, ID или Telegram…"
              className="w-full bg-transparent border border-white/25 rounded-xl pl-10 pr-3.5 py-2 text-sm text-white focus:outline-none focus:border-[#E7C768] placeholder:text-slate-300"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {[
              { k: "all", label: "Все пользователи" },
              { k: "employer", label: "Работодатели" },
              { k: "candidate", label: "Кандидаты" },
            ].map((tab) => (
              <button
                key={tab.k}
                type="button"
                onClick={() => setKind(tab.k as any)}
                className={`w-full px-3 py-2 rounded-xl border text-sm font-semibold transition cursor-pointer ${
                  kind === tab.k
                    ? "border-[#E7C768] text-[#F4EE8E]"
                    : "border-white/20 text-white/85 hover:border-white/45"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {loading && items.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-200 flex items-center justify-center gap-2">
              <Loader2 className="w-5 h-5 animate-spin text-[#E7C768]" /> Загрузка пользователей…
            </div>
          ) : items.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-300">
              Пользователи не найдены
            </div>
          ) : (
            <>
              {items.map((item) => {
                const active = isSelected(item);
                return (
                  <button
                    key={`${item.kind}:${item.id}`}
                    type="button"
                    onClick={() => toggleItem(item)}
                    className={`w-full text-left p-3 rounded-2xl border transition flex items-start justify-between gap-3 cursor-pointer ${
                      active
                        ? "border-[#E7C768] bg-white/10"
                        : "border-white/20 hover:border-white/45"
                    }`}
                  >
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-bold text-white break-words">
                          {item.name || "—"}
                        </span>
                        <span className="text-sm text-[#E7C768] font-medium">
                          · {item.kind === "employer" ? "Работодатель" : "Кандидат"}
                        </span>
                        {item.public_id && (
                          <span className="text-sm font-mono text-slate-300">
                            #{item.public_id}
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-slate-300 break-all">
                        {item.email || "Email не указан"}
                      </div>
                      <div className="text-sm text-slate-200">
                        {item.has_telegram ? "Telegram подключён" : "Только уведомления на платформе"}
                      </div>
                    </div>
                    <div
                      className={`w-6 h-6 rounded-lg border flex items-center justify-center shrink-0 mt-0.5 ${
                        active ? "border-[#E7C768] text-[#F4EE8E]" : "border-white/30 text-transparent"
                      }`}
                    >
                      <Check className="w-4 h-4" />
                    </div>
                  </button>
                );
              })}

              <InfiniteScrollTrigger
                hasMore={hasMore}
                loading={loadingMore}
                loadedCount={items.length}
                total={total}
                onLoadMore={() => loadRecipients(true, items.length)}
                compact
              />
            </>
          )}
        </div>

        <div className="p-4 border-t border-white/15 flex flex-col sm:flex-row items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => onChange([])}
            className="w-full sm:w-auto px-4 py-2 rounded-xl border border-white/25 hover:border-[#E7C768] text-sm font-semibold text-white cursor-pointer"
          >
            Сбросить выбор
          </button>
          <button
            type="button"
            onClick={onClose}
            className={`w-full sm:w-auto px-5 py-2 rounded-xl text-sm ${GOLD_BUTTON_CLASS}`}
          >
            Готово ({selected.length})
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
