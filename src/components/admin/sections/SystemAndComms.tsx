import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, RefreshCw } from "lucide-react";
import { dbClient, getAuthHeaders } from "@/lib/dbClient";
import DetailsModal from "@/components/admin/DetailsModal";
import MailingsAdmin from "@/components/admin/mailings/MailingsAdmin";
import {
  GLASS_CARD_CLASS,
  GOLD_BUTTON_CLASS,
  GOLD_TEXT_CLASS,
  RU_LABELS,
  safeArray,
} from "../panel/adminConfig";
import {
  ADMIN_PAGE_SIZE,
  InfiniteScrollTrigger,
  TablePaginationBar,
} from "../panel/PaginationControls";

export function MailingsSection({ setToast }: { setToast?: (t: any) => void }) {
  return <MailingsAdmin setToast={setToast} />;
}

const RUB_PER_TOKEN = 300 / 10_000_000;

export function LogsSection() {
  const [rows, setRows] = useState<any[]>([]);
  const [mobileRows, setMobileRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [totalTokens, setTotalTokens] = useState(0);
  const [page, setPage] = useState(0);
  const [mobileHasMore, setMobileHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selected, setSelected] = useState<any | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(searchInput.trim());
      setPage(0);
    }, 280);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const loadPage = async (pageIdx: number) => {
    setLoading(true);
    const { data } = await dbClient.rpc("admin_logs_page" as any, {
      _limit: ADMIN_PAGE_SIZE,
      _offset: pageIdx * ADMIN_PAGE_SIZE,
      _search: searchQuery,
    });
    const items = safeArray((data as any)?.items);
    const cnt = Number((data as any)?.total ?? items.length);
    const tokens = Number((data as any)?.totalTokens ?? 0);
    const hasMore = Boolean((data as any)?.hasMore);
    setRows(items);
    setTotal(cnt);
    setTotalTokens(tokens);
    if (pageIdx === 0) {
      setMobileRows(items);
      setMobileHasMore(hasMore);
    }
    setLoading(false);
  };

  const loadMoreMobile = async () => {
    if (loadingMore || !mobileHasMore) return;
    setLoadingMore(true);
    const { data } = await dbClient.rpc("admin_logs_page" as any, {
      _limit: ADMIN_PAGE_SIZE,
      _offset: mobileRows.length,
      _search: searchQuery,
    });
    const items = safeArray((data as any)?.items);
    setMobileRows((prev) => [...prev, ...items]);
    setMobileHasMore(Boolean((data as any)?.hasMore));
    setLoadingMore(false);
  };

  useEffect(() => {
    loadPage(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, searchQuery]);

  const totalRub = totalTokens * RUB_PER_TOKEN;

  return (
    <div className="space-y-4">
      <div className={`${GLASS_CARD_CLASS} p-4 flex flex-col lg:flex-row lg:items-center gap-3 justify-between`}>
        <div className="min-w-0">
          <h2 className={`text-base sm:text-lg font-bold ${GOLD_TEXT_CLASS}`}>
            Логи сообщений ИИ — {total}
          </h2>
          <p className="text-sm text-slate-200 mt-0.5 break-words">
            Тариф: 10 000 000 токенов = 300 ₽ (≈ {RUB_PER_TOKEN.toFixed(6)} ₽ за токен)
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full lg:w-auto">
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Поиск по сообщению / каналу / боту..."
            className="w-full sm:w-72 bg-transparent text-sm text-white px-3.5 py-2 rounded-xl border border-white/20 focus:outline-none focus:border-[#E7C768] placeholder:text-slate-300"
          />
          <button
            type="button"
            onClick={() => loadPage(page)}
            className="w-full sm:w-auto px-3.5 py-2 rounded-xl text-sm font-semibold bg-transparent border border-white/20 hover:border-[#E7C768] text-white flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 text-[#E7C768] ${loading ? "animate-spin" : ""}`} />
            <span>Обновить</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className={`${GLASS_CARD_CLASS} p-4`}>
          <div className="text-sm text-slate-200">Записей в выборке</div>
          <div className="text-2xl font-bold text-[#E7C768] font-mono mt-1">{total}</div>
        </div>
        <div className={`${GLASS_CARD_CLASS} p-4`}>
          <div className="text-sm text-slate-200">Сумма токенов</div>
          <div className="text-2xl font-bold text-[#E7C768] font-mono mt-1">
            {totalTokens.toLocaleString("ru-RU")}
          </div>
        </div>
        <div className={`${GLASS_CARD_CLASS} border-[#E7C768]/50 p-4`}>
          <div className="text-sm text-[#E7C768]">Расход ИИ, ₽</div>
          <div className="text-2xl font-bold text-[#F4EE8E] font-mono mt-1">
            {totalRub.toLocaleString("ru-RU", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}{" "}
            ₽
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-white text-sm flex items-center justify-center gap-2">
          <Loader2 className="w-5 h-5 animate-spin text-[#E7C768]" /> Загрузка...
        </div>
      ) : (
        <>
          <div className="md:hidden space-y-3">
            {mobileRows.map((r) => {
              const rub = (Number(r.tokens_total) || 0) * RUB_PER_TOKEN;
              return (
                <div
                  key={r.id}
                  onClick={() => setSelected(r)}
                  className={`${GLASS_CARD_CLASS} p-4 space-y-2 cursor-pointer hover:border-[#E7C768] transition`}
                >
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-slate-300">
                      {r.created_at ? new Date(r.created_at).toLocaleString() : "—"}
                    </span>
                    <span className="font-mono font-bold text-[#E7C768]">
                      {(r.tokens_total || 0).toLocaleString("ru-RU")} т.
                    </span>
                  </div>
                  <div className="text-sm text-white break-words">
                    {r.textContent || r.user_message || "—"}
                  </div>
                  {(r.ai_reply || r.bot_reply) && (
                    <div className="text-sm text-[#F4EE8E] break-words">
                      Ответ: {r.ai_reply || r.bot_reply}
                    </div>
                  )}
                  <div className="flex items-center justify-between text-sm text-slate-300 pt-1 border-t border-white/15">
                    <span>{r.llm || r.channel_name || "—"}</span>
                    <span className="font-mono">
                      {rub.toLocaleString("ru-RU", {
                        minimumFractionDigits: 4,
                        maximumFractionDigits: 4,
                      })}{" "}
                      ₽
                    </span>
                  </div>
                </div>
              );
            })}
            {mobileRows.length === 0 ? (
              <div className={`${GLASS_CARD_CLASS} p-8 text-center text-sm text-slate-300`}>
                Нет записей
              </div>
            ) : (
              <InfiniteScrollTrigger
                hasMore={mobileHasMore}
                loading={loadingMore}
                loadedCount={mobileRows.length}
                total={total}
                onLoadMore={loadMoreMobile}
              />
            )}
          </div>

          <div className="hidden md:block space-y-3">
            <div className={`${GLASS_CARD_CLASS} overflow-hidden`}>
              <div className="overflow-x-auto overflow-y-auto max-h-[60vh]">
                <table className="w-full text-left text-sm" style={{ minWidth: 1100 }}>
                  <thead className="bg-transparent border-b border-white/15 text-[#E7C768] text-sm font-semibold sticky top-0 backdrop-blur-md">
                    <tr>
                      <th className="p-3">Дата</th>
                      <th className="p-3">Причина отклонения</th>
                      <th className="p-3">Сообщение</th>
                      <th className="p-3">Ответ ИИ</th>
                      <th className="p-3">Канал</th>
                      <th className="p-3">Модель</th>
                      <th className="p-3 text-right">Токенов</th>
                      <th className="p-3 text-right">₽</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {rows.map((r) => {
                      const rub = (Number(r.tokens_total) || 0) * RUB_PER_TOKEN;
                      return (
                        <tr
                          key={r.id}
                          className="hover:bg-white/5 cursor-pointer transition"
                          onClick={() => setSelected(r)}
                        >
                          <td className="p-3 text-slate-300 whitespace-nowrap">
                            {r.created_at ? new Date(r.created_at).toLocaleString() : "—"}
                          </td>
                          <td className="p-3 text-[#E7C768] font-medium align-top">
                            <div className="max-w-[240px] line-clamp-3">
                              {r.rejection_reason || "—"}
                            </div>
                          </td>
                          <td className="p-3 text-white align-top">
                            <div className="max-w-[280px] line-clamp-3">
                              {r.textContent || r.user_message || "—"}
                            </div>
                          </td>
                          <td className="p-3 text-[#F4EE8E] align-top">
                            <div className="max-w-[320px] line-clamp-3">
                              {r.ai_reply || r.bot_reply || "—"}
                            </div>
                          </td>
                          <td className="p-3 text-slate-200 align-top whitespace-nowrap">
                            <div className="font-mono text-sm text-[#E7C768]">
                              {r.user_social_id || r.channel_id || "—"}
                            </div>
                            <div className="text-sm text-slate-300">
                              {r.channel_name || "demo_interview"}
                            </div>
                          </td>
                          <td className="p-3 text-slate-200 align-top">{r.llm || "—"}</td>
                          <td className="p-3 text-right font-mono text-[#E7C768] align-top">
                            {(r.tokens_total || 0).toLocaleString("ru-RU")}
                          </td>
                          <td className="p-3 text-right font-mono text-[#F4EE8E] align-top">
                            {rub.toLocaleString("ru-RU", {
                              minimumFractionDigits: 4,
                              maximumFractionDigits: 4,
                            })}
                          </td>
                        </tr>
                      );
                    })}
                    {rows.length === 0 && (
                      <tr>
                        <td colSpan={8} className="p-6 text-center text-slate-300">
                          Нет записей
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <TablePaginationBar
              page={page}
              total={total}
              loading={loading}
              onPageChange={setPage}
            />
          </div>
        </>
      )}

      <DetailsModal
        title="Лог сообщения"
        data={selected}
        table="logs"
        onClose={() => setSelected(null)}
        onSaved={() => loadPage(page)}
      />
    </div>
  );
}

export function ReviewsSection({ setToast }: { setToast: (t: any) => void }) {
  const [rows, setRows] = useState<any[]>([]);
  const [mobileRows, setMobileRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [mobileHasMore, setMobileHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selected, setSelected] = useState<any | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const loadPage = async (pageIdx: number) => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/table/reviews?limit=${ADMIN_PAGE_SIZE}&offset=${pageIdx * ADMIN_PAGE_SIZE}`,
        { headers: getAuthHeaders() }
      );
      if (res.ok) {
        const data = await res.json();
        const items = safeArray(data?.rows);
        const cnt = Number(data?.total ?? items.length);
        const hasMore = Boolean(data?.hasMore);
        setRows(items);
        setTotal(cnt);
        if (pageIdx === 0) {
          setMobileRows(items);
          setMobileHasMore(hasMore);
        }
      }
    } catch (e) {
      console.error("Error loading reviews:", e);
    } finally {
      setLoading(false);
    }
  };

  const loadMoreMobile = async () => {
    if (loadingMore || !mobileHasMore) return;
    setLoadingMore(true);
    try {
      const res = await fetch(
        `/api/admin/table/reviews?limit=${ADMIN_PAGE_SIZE}&offset=${mobileRows.length}`,
        { headers: getAuthHeaders() }
      );
      if (res.ok) {
        const data = await res.json();
        const items = safeArray(data?.rows);
        setMobileRows((prev) => [...prev, ...items]);
        setMobileHasMore(Boolean(data?.hasMore));
      }
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    loadPage(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const executeDelete = async (id: string) => {
    setPendingDeleteId(null);
    try {
      const res = await fetch(`/api/admin/table/reviews/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      if (!res.ok) {
        setToast({ kind: "err", text: data.error || "Ошибка удаления" });
        return;
      }
      setToast({ kind: "ok", text: "Отзыв удалён" });
      loadPage(page);
    } catch (e: any) {
      setToast({ kind: "err", text: e.message || "Ошибка" });
    }
  };

  const regenAi = async (id: string) => {
    setBusy(id);
    try {
      const res = await fetch("/api/reviews/ai-reply", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ review_id: id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Ошибка генерации");
      setToast({ kind: "ok", text: "Ответ ИИ обновлён" });
      loadPage(page);
    } catch (e: any) {
      setToast({ kind: "err", text: e?.message || "Ошибка" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={`${GLASS_CARD_CLASS} p-4 sm:p-5 space-y-4`}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <h2 className={`text-base sm:text-lg font-bold ${GOLD_TEXT_CLASS}`}>
          Отзывы — модерация ({total})
        </h2>
        <button
          type="button"
          onClick={() => loadPage(page)}
          className="w-full sm:w-auto px-3.5 py-2 rounded-xl border border-white/20 hover:border-[#E7C768] text-white inline-flex items-center justify-center gap-1.5 text-sm font-semibold cursor-pointer"
        >
          <RefreshCw className={`w-4 h-4 text-[#E7C768] ${loading ? "animate-spin" : ""}`} />
          <span>Обновить</span>
        </button>
      </div>

      {loading ? (
        <div className="p-6 text-center text-white text-sm flex items-center justify-center gap-2">
          <Loader2 className="w-5 h-5 animate-spin text-[#E7C768]" /> Загрузка...
        </div>
      ) : (
        <>
          <div className="md:hidden space-y-3">
            {mobileRows.map((r) => (
              <div
                key={r.id}
                onClick={() => setSelected(r)}
                className="rounded-2xl border border-white/20 bg-transparent p-4 space-y-2.5 cursor-pointer hover:border-[#E7C768] transition"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="text-sm font-bold text-white break-words">
                    {r.first_name} {r.last_name}
                  </div>
                  <span className="text-sm text-[#E7C768] shrink-0">
                    {r.is_published ? "Опубл." : "Скрыт"}
                  </span>
                </div>
                <div className="text-sm text-slate-200 break-words">{r.content}</div>
                {r.ai_reply && (
                  <div className="text-sm text-slate-300 break-words">Ответ ИИ: {r.ai_reply}</div>
                )}
                <div
                  className="grid grid-cols-2 gap-2 pt-2 border-t border-white/15"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    disabled={busy === r.id}
                    onClick={() => regenAi(r.id)}
                    className="w-full text-sm py-2 rounded-xl border border-[#E7C768] text-[#F4EE8E] font-semibold disabled:opacity-50 cursor-pointer"
                  >
                    {busy === r.id ? "…" : "Обновить ИИ"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingDeleteId(r.id)}
                    className="w-full text-sm py-2 rounded-xl border border-white/25 hover:border-[#E7C768] text-white font-semibold cursor-pointer"
                  >
                    Удалить
                  </button>
                </div>
              </div>
            ))}
            {mobileRows.length === 0 ? (
              <div className="p-6 text-center text-sm text-slate-300">Нет отзывов</div>
            ) : (
              <InfiniteScrollTrigger
                hasMore={mobileHasMore}
                loading={loadingMore}
                loadedCount={mobileRows.length}
                total={total}
                onLoadMore={loadMoreMobile}
                compact
              />
            )}
          </div>

          <div className="hidden md:block space-y-3">
            <div className="overflow-x-auto">
              <table className="w-full text-sm" style={{ minWidth: 960 }}>
                <thead className="text-sm text-[#E7C768] border-b border-white/15">
                  <tr>
                    <th className="text-left p-2.5">Дата</th>
                    <th className="text-left p-2.5">Автор</th>
                    <th className="text-left p-2.5">Отзыв</th>
                    <th className="text-left p-2.5">Ответ ИИ</th>
                    <th className="text-left p-2.5">Ответ админа</th>
                    <th className="text-center p-2.5">Опубл.</th>
                    <th className="text-right p-2.5">Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={r.id}
                      className="border-b border-white/10 hover:bg-white/5 cursor-pointer"
                      onClick={() => setSelected(r)}
                    >
                      <td className="p-2.5 text-slate-300 whitespace-nowrap">
                        {new Date(r.created_at).toLocaleDateString("ru-RU")}
                      </td>
                      <td className="p-2.5 text-white whitespace-nowrap">
                        {r.first_name} {r.last_name}
                      </td>
                      <td className="p-2.5 text-slate-200">
                        <div className="max-w-[280px] line-clamp-3">{r.content}</div>
                      </td>
                      <td className="p-2.5 text-slate-300">
                        <div className="max-w-[240px] line-clamp-3">{r.ai_reply || "—"}</div>
                      </td>
                      <td className="p-2.5 text-[#F4EE8E]">
                        <div className="max-w-[240px] line-clamp-3">{r.admin_reply || "—"}</div>
                      </td>
                      <td className="p-2.5 text-center">{r.is_published ? "✓" : "—"}</td>
                      <td
                        className="p-2.5 text-right whitespace-nowrap space-x-1.5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          disabled={busy === r.id}
                          onClick={() => regenAi(r.id)}
                          className="text-sm px-3 py-1 rounded-xl border border-[#E7C768] text-[#F4EE8E] hover:brightness-110 disabled:opacity-50 cursor-pointer"
                        >
                          {busy === r.id ? "…" : "ИИ"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setPendingDeleteId(r.id)}
                          className="text-sm px-3 py-1 rounded-xl border border-white/25 hover:border-[#E7C768] text-white cursor-pointer"
                        >
                          Удалить
                        </button>
                      </td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={7} className="p-6 text-center text-slate-300">
                        Нет отзывов
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <TablePaginationBar
              page={page}
              total={total}
              loading={loading}
              onPageChange={setPage}
            />
          </div>
        </>
      )}

      {pendingDeleteId &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[950] flex items-center justify-center p-4 bg-[#0D2032]/75 backdrop-blur-md"
            onClick={() => setPendingDeleteId(null)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md bg-gradient-to-br from-[#17344F] via-[#1E4468] to-[#265582] border border-[#E7C768]/50 rounded-3xl p-6 space-y-4 shadow-[0_24px_60px_rgba(0,0,0,0.65)] text-white"
            >
              <h3 className={`text-base font-bold ${GOLD_TEXT_CLASS}`}>Удаление отзыва</h3>
              <p className="text-sm text-white">Вы действительно хотите удалить выбранный отзыв?</p>
              <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPendingDeleteId(null)}
                  className="w-full sm:w-auto px-4 py-2 rounded-xl border border-white/25 text-white text-sm font-semibold hover:border-[#E7C768] cursor-pointer"
                >
                  Отмена
                </button>
                <button
                  type="button"
                  onClick={() => executeDelete(pendingDeleteId)}
                  className={`w-full sm:w-auto px-5 py-2 rounded-xl text-sm ${GOLD_BUTTON_CLASS}`}
                >
                  Удалить
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      <DetailsModal
        title="Отзыв"
        data={selected}
        table="reviews"
        labels={RU_LABELS.reviews}
        onClose={() => setSelected(null)}
        onSaved={() => loadPage(page)}
      />
    </div>
  );
}
