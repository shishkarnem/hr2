import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Database, Loader2, Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import { dbClient } from "@/lib/dbClient";
import CandidateDetailsModal from "@/components/CandidateDetailsModal";
import DetailsModal from "@/components/admin/DetailsModal";
import { upsertJobTitle, deleteJobTitle, invalidateJobTitlesCache } from "@/lib/jobTitles";
import { GLASS_CARD_CLASS, GOLD_BUTTON_CLASS, GOLD_TEXT_CLASS, safeArray } from "../panel/adminConfig";
import {
  ADMIN_PAGE_SIZE,
  InfiniteScrollTrigger,
  TablePaginationBar,
} from "../panel/PaginationControls";

export function InterviewsSection() {
  const [rows, setRows] = useState<any[]>([]);
  const [mobileRows, setMobileRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [mobileHasMore, setMobileHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(searchInput.trim());
      setPage(0);
    }, 280);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const loadPage = async (pageIdx: number) => {
    setLoading(true);
    const { data } = await dbClient.rpc("admin_interviews_page" as any, {
      _limit: ADMIN_PAGE_SIZE,
      _offset: pageIdx * ADMIN_PAGE_SIZE,
      _search: searchQuery,
    });
    const items = safeArray((data as any)?.items);
    const cnt = Number((data as any)?.total ?? items.length);
    const hasMore = Boolean((data as any)?.hasMore);
    setRows(items);
    setTotal(cnt);
    if (pageIdx === 0) {
      setMobileRows(items);
      setMobileHasMore(hasMore);
    }
    setLoading(false);
  };

  const loadMoreMobile = async () => {
    if (loadingMore || !mobileHasMore) return;
    setLoadingMore(true);
    const { data } = await dbClient.rpc("admin_interviews_page" as any, {
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

  return (
    <div className="space-y-4">
      <div className={`${GLASS_CARD_CLASS} p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3`}>
        <h2 className={`text-base sm:text-lg font-bold ${GOLD_TEXT_CLASS}`}>
          Интервью (оценки кандидатов) — {total}
        </h2>
        <input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Поиск по ФИО / email / роли / компании…"
          className="w-full sm:w-72 bg-transparent text-sm text-white px-3.5 py-2 rounded-xl border border-white/20 focus:outline-none focus:border-[#E7C768] placeholder:text-slate-300"
        />
      </div>

      {loading ? (
        <div className="text-center py-12 text-white text-sm flex items-center justify-center gap-2">
          <Loader2 className="w-5 h-5 animate-spin text-[#E7C768]" /> Загрузка…
        </div>
      ) : (
        <>
          <div className="md:hidden space-y-3">
            {mobileRows.map((r) => (
              <div
                key={r.candidate_id}
                onClick={() => setSelected(r.candidate_id)}
                className={`${GLASS_CARD_CLASS} p-4 space-y-2 cursor-pointer hover:border-[#E7C768] transition`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-white break-words">
                      {r._name || "—"}
                    </div>
                    <div className="text-sm text-slate-300 break-all">{r._email || "—"}</div>
                  </div>
                  <div className="text-sm font-mono font-bold text-[#F4EE8E] shrink-0">
                    {r.overall_score ?? "—"}
                  </div>
                </div>
                <div className="text-sm text-slate-200 break-words">
                  {r._role || "—"} · {r._company || "—"}
                </div>
                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-white/15 text-sm text-center">
                  <div>
                    <span className="text-slate-300 block">Резюме</span>
                    <span className="font-mono font-bold text-white">{r.resume_score ?? "—"}</span>
                  </div>
                  <div>
                    <span className="text-slate-300 block">Чек-лист</span>
                    <span className="font-mono font-bold text-white">{r.checklist_score ?? "—"}</span>
                  </div>
                  <div>
                    <span className="text-slate-300 block">Кейсы</span>
                    <span className="font-mono font-bold text-[#E7C768]">{r.situations_score ?? "—"}</span>
                  </div>
                </div>
              </div>
            ))}
            {mobileRows.length === 0 ? (
              <div className={`${GLASS_CARD_CLASS} p-8 text-center text-sm text-slate-300`}>
                Ничего не найдено
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
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-transparent border-b border-white/15 text-[#E7C768] text-sm font-semibold">
                    <tr>
                      <th className="p-3.5">Кандидат</th>
                      <th className="p-3.5">Email</th>
                      <th className="p-3.5">Роль</th>
                      <th className="p-3.5">Компания</th>
                      <th className="p-3.5 text-center">Резюме</th>
                      <th className="p-3.5 text-center">Чек-лист</th>
                      <th className="p-3.5 text-center">Ситуации</th>
                      <th className="p-3.5 text-center">Общий</th>
                      <th className="p-3.5">Обновлено</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {rows.map((r) => (
                      <tr
                        key={r.candidate_id}
                        className="hover:bg-white/5 cursor-pointer transition"
                        onClick={() => setSelected(r.candidate_id)}
                      >
                        <td className="p-3.5 font-bold text-white">
                          {r._name || "—"}
                          <div className="text-sm text-slate-300 font-mono">#{r._public_id}</div>
                        </td>
                        <td className="p-3.5 text-slate-200">{r._email || "—"}</td>
                        <td className="p-3.5 text-slate-200">{r._role || "—"}</td>
                        <td className="p-3.5 text-slate-200">{r._company || "—"}</td>
                        <td className="p-3.5 text-center font-mono text-white">
                          {r.resume_score ?? "—"}
                        </td>
                        <td className="p-3.5 text-center font-mono text-white">
                          {r.checklist_score ?? "—"}
                        </td>
                        <td className="p-3.5 text-center font-mono text-[#E7C768]">
                          {r.situations_score ?? "—"}
                        </td>
                        <td className="p-3.5 text-center font-mono font-bold text-[#F4EE8E]">
                          {r.overall_score ?? "—"}
                        </td>
                        <td className="p-3.5 text-sm text-slate-300">
                          {r.updated_at ? new Date(r.updated_at).toLocaleString() : ""}
                        </td>
                      </tr>
                    ))}
                    {rows.length === 0 && (
                      <tr>
                        <td colSpan={9} className="p-6 text-center text-slate-300">
                          Ничего не найдено
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            <TablePaginationBar page={page} total={total} loading={loading} onPageChange={setPage} />
          </div>
        </>
      )}
      <CandidateDetailsModal
        candidateId={selected}
        surfaceVariant="blue-gradient"
        onClose={() => setSelected(null)}
      />
    </div>
  );
}

export function TrainingsSection() {
  const [rows, setRows] = useState<any[]>([]);
  const [mobileRows, setMobileRows] = useState<any[]>([]);
  const [stages, setStages] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [mobileHasMore, setMobileHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [stage, setStage] = useState<string>("all");
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(searchInput.trim());
      setPage(0);
    }, 280);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const loadPage = async (pageIdx: number) => {
    setLoading(true);
    const { data } = await dbClient.rpc("admin_trainings_page" as any, {
      _limit: ADMIN_PAGE_SIZE,
      _offset: pageIdx * ADMIN_PAGE_SIZE,
      _search: searchQuery,
      _stage: stage,
    });
    const items = safeArray((data as any)?.items);
    const cnt = Number((data as any)?.total ?? items.length);
    const hasMore = Boolean((data as any)?.hasMore);
    if (Array.isArray((data as any)?.stages)) {
      setStages((data as any).stages);
    }
    setRows(items);
    setTotal(cnt);
    if (pageIdx === 0) {
      setMobileRows(items);
      setMobileHasMore(hasMore);
    }
    setLoading(false);
  };

  const loadMoreMobile = async () => {
    if (loadingMore || !mobileHasMore) return;
    setLoadingMore(true);
    const { data } = await dbClient.rpc("admin_trainings_page" as any, {
      _limit: ADMIN_PAGE_SIZE,
      _offset: mobileRows.length,
      _search: searchQuery,
      _stage: stage,
    });
    const items = safeArray((data as any)?.items);
    setMobileRows((prev) => [...prev, ...items]);
    setMobileHasMore(Boolean((data as any)?.hasMore));
    setLoadingMore(false);
  };

  useEffect(() => {
    loadPage(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, searchQuery, stage]);

  return (
    <div className="space-y-4">
      <div className={`${GLASS_CARD_CLASS} p-4 flex flex-col md:flex-row md:items-center gap-3 justify-between`}>
        <h2 className={`text-base sm:text-lg font-bold ${GOLD_TEXT_CLASS}`}>
          Прогресс обучения — {total}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full md:w-auto">
          <select
            value={stage}
            onChange={(e) => {
              setStage(e.target.value);
              setPage(0);
            }}
            className="w-full bg-transparent text-sm text-white px-3.5 py-2 rounded-xl border border-white/20 focus:outline-none focus:border-[#E7C768]"
          >
            <option value="all" className="bg-[#17344F] text-white">
              Все этапы
            </option>
            {stages.map((s) => (
              <option key={s} value={s} className="bg-[#17344F] text-white">
                {s}
              </option>
            ))}
          </select>
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Поиск по ФИО / email / роли…"
            className="w-full bg-transparent text-sm text-white px-3.5 py-2 rounded-xl border border-white/20 focus:outline-none focus:border-[#E7C768] placeholder:text-slate-300"
          />
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-white text-sm flex items-center justify-center gap-2">
          <Loader2 className="w-5 h-5 animate-spin text-[#E7C768]" /> Загрузка…
        </div>
      ) : (
        <>
          <div className="md:hidden space-y-3">
            {mobileRows.map((r, i) => (
              <div
                key={`${r.candidate_id}-${r.stage}-${i}`}
                onClick={() => setSelected(r.candidate_id)}
                className={`${GLASS_CARD_CLASS} p-4 space-y-2 cursor-pointer hover:border-[#E7C768] transition`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-white break-words">
                      {r._name || "—"}
                    </div>
                    <div className="text-sm text-slate-300 break-all">{r._email || "—"}</div>
                  </div>
                  <span className="text-sm font-semibold px-2.5 py-0.5 rounded-full border border-[#E7C768]/50 text-[#F4EE8E] shrink-0">
                    {r.stage}
                  </span>
                </div>
                <div className="text-sm text-slate-200 break-words">
                  {r._role || "—"} · {r._company || "—"}
                </div>
                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-white/15 text-sm text-center">
                  <div>
                    <span className="text-slate-300 block">Попыток</span>
                    <span className="font-mono font-bold text-white">{r.attempts ?? "—"}</span>
                  </div>
                  <div>
                    <span className="text-slate-300 block">Лучший</span>
                    <span className="font-mono font-bold text-[#E7C768]">{r.best_score ?? "—"}</span>
                  </div>
                  <div>
                    <span className="text-slate-300 block">Последний</span>
                    <span className="font-mono font-bold text-white">{r.last_score ?? "—"}</span>
                  </div>
                </div>
              </div>
            ))}
            {mobileRows.length === 0 ? (
              <div className={`${GLASS_CARD_CLASS} p-8 text-center text-sm text-slate-300`}>
                Ничего не найдено
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
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-transparent border-b border-white/15 text-[#E7C768] text-sm font-semibold">
                    <tr>
                      <th className="p-3.5">Кандидат</th>
                      <th className="p-3.5">Email</th>
                      <th className="p-3.5">Роль</th>
                      <th className="p-3.5">Компания</th>
                      <th className="p-3.5">Этап</th>
                      <th className="p-3.5 text-center">Попыток</th>
                      <th className="p-3.5 text-center">Лучший</th>
                      <th className="p-3.5 text-center">Последний</th>
                      <th className="p-3.5">Сдан</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {rows.map((r, i) => (
                      <tr
                        key={`${r.candidate_id}-${r.stage}-${i}`}
                        className="hover:bg-white/5 cursor-pointer transition"
                        onClick={() => setSelected(r.candidate_id)}
                      >
                        <td className="p-3.5 font-bold text-white">
                          {r._name || "—"}
                          <div className="text-sm text-slate-300 font-mono">#{r._public_id}</div>
                        </td>
                        <td className="p-3.5 text-slate-200">{r._email || "—"}</td>
                        <td className="p-3.5 text-slate-200">{r._role || "—"}</td>
                        <td className="p-3.5 text-slate-200">{r._company || "—"}</td>
                        <td className="p-3.5">
                          <span className="text-sm font-semibold px-2.5 py-0.5 rounded-full border border-[#E7C768]/50 text-[#F4EE8E]">
                            {r.stage}
                          </span>
                        </td>
                        <td className="p-3.5 text-center font-mono">{r.attempts ?? "—"}</td>
                        <td className="p-3.5 text-center font-mono text-[#E7C768] font-bold">
                          {r.best_score ?? "—"}
                        </td>
                        <td className="p-3.5 text-center font-mono text-white">
                          {r.last_score ?? "—"}
                        </td>
                        <td className="p-3.5 text-sm text-slate-300">
                          {r.passed_at ? new Date(r.passed_at).toLocaleDateString() : "—"}
                        </td>
                      </tr>
                    ))}
                    {rows.length === 0 && (
                      <tr>
                        <td colSpan={9} className="p-6 text-center text-slate-300">
                          Ничего не найдено
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            <TablePaginationBar page={page} total={total} loading={loading} onPageChange={setPage} />
          </div>
        </>
      )}
      <CandidateDetailsModal
        candidateId={selected}
        surfaceVariant="blue-gradient"
        onClose={() => setSelected(null)}
      />
    </div>
  );
}

export function JobTitlesSection({ setToast }: { setToast: (t: any) => void }) {
  const [titles, setTitles] = useState<any[]>([]);
  const [mobileTitles, setMobileTitles] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [mobileHasMore, setMobileHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [adding, setAdding] = useState(false);
  const [selectedTitle, setSelectedTitle] = useState<any | null>(null);
  const [pendingDelete, setPendingDelete] = useState<any | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(searchInput.trim());
      setPage(0);
    }, 280);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const loadPage = async (pageIdx: number) => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({
        paginated: "1",
        limit: String(ADMIN_PAGE_SIZE),
        offset: String(pageIdx * ADMIN_PAGE_SIZE),
        q: searchQuery,
      });
      const res = await fetch(`/api/job-titles?${qs.toString()}`);
      const data = await res.json();
      const items = safeArray(data?.items);
      const cnt = Number(data?.total ?? items.length);
      const hasMore = Boolean(data?.hasMore);
      setTitles(items);
      setTotal(cnt);
      if (pageIdx === 0) {
        setMobileTitles(items);
        setMobileHasMore(hasMore);
      }
    } catch (e: any) {
      setToast({ kind: "err", text: "Ошибка загрузки должностей: " + e.message });
    } finally {
      setLoading(false);
    }
  };

  const loadMoreMobile = async () => {
    if (loadingMore || !mobileHasMore) return;
    setLoadingMore(true);
    try {
      const qs = new URLSearchParams({
        paginated: "1",
        limit: String(ADMIN_PAGE_SIZE),
        offset: String(mobileTitles.length),
        q: searchQuery,
      });
      const res = await fetch(`/api/job-titles?${qs.toString()}`);
      const data = await res.json();
      const items = safeArray(data?.items);
      setMobileTitles((prev) => [...prev, ...items]);
      setMobileHasMore(Boolean(data?.hasMore));
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    loadPage(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, searchQuery]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = newTitle.trim();
    if (!t) return;
    setAdding(true);
    const added = await upsertJobTitle(t);
    setAdding(false);
    if (added) {
      invalidateJobTitlesCache();
      setNewTitle("");
      setToast({ kind: "ok", text: `Должность "${t}" добавлена.` });
      setPage(0);
      loadPage(0);
    } else {
      setToast({ kind: "err", text: "Не удалось добавить должность" });
    }
  };

  const executeDelete = async (item: any) => {
    setPendingDelete(null);
    const ok = await deleteJobTitle(item.id);
    if (ok) {
      invalidateJobTitlesCache();
      setToast({ kind: "ok", text: `Должность "${item.title}" удалена из базы` });
      loadPage(page);
    } else {
      setToast({ kind: "err", text: "Ошибка при удалении должности" });
    }
  };

  const deleteConfirmModal = pendingDelete ? (
    <div
      className="fixed inset-0 z-[950] flex items-center justify-center p-4 bg-[#0F2438]/75 backdrop-blur-xl"
      onClick={() => setPendingDelete(null)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-gradient-to-br from-[#17344F] via-[#1E4468] to-[#265582] border border-[#E7C768]/50 rounded-3xl p-6 space-y-4 shadow-2xl text-white"
      >
        <h3 className={`text-base font-bold ${GOLD_TEXT_CLASS}`}>Удаление должности</h3>
        <p className="text-sm text-white break-words">
          Удалить должность «{pendingDelete.title}» из базы данных?
        </p>
        <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={() => setPendingDelete(null)}
            className="w-full sm:w-auto px-4 py-2 rounded-xl border border-white/25 text-white text-sm font-semibold hover:border-[#E7C768] cursor-pointer"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={() => executeDelete(pendingDelete)}
            className={`w-full sm:w-auto px-5 py-2 rounded-xl text-sm ${GOLD_BUTTON_CLASS}`}
          >
            Удалить
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <div className="space-y-4">
      <div className={`${GLASS_CARD_CLASS} p-4 sm:p-5 space-y-4`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className={`text-base sm:text-lg font-bold flex items-center gap-2 ${GOLD_TEXT_CLASS}`}>
              <Database className="w-5 h-5 text-[#E7C768] shrink-0" />
              <span>Справочник должностей ({total})</span>
            </h2>
            <p className="text-sm text-slate-200 mt-1 break-words">
              Управление списком профессий и должностей в базе данных.
            </p>
          </div>
          <button
            type="button"
            onClick={() => loadPage(page)}
            disabled={loading}
            className="w-full md:w-auto px-4 py-2 rounded-xl bg-transparent border border-white/20 hover:border-[#E7C768] text-sm text-white font-semibold inline-flex items-center justify-center gap-1.5 transition cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 text-[#E7C768] ${loading ? "animate-spin" : ""}`} />
            <span>Обновить</span>
          </button>
        </div>

        <form onSubmit={handleAdd} className="flex flex-col sm:flex-row gap-2 max-w-xl">
          <input
            type="text"
            placeholder="Название новой должности..."
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            className="flex-1 bg-transparent border border-white/25 rounded-xl px-3.5 py-2 text-sm text-white placeholder-slate-300 focus:outline-none focus:border-[#E7C768]"
          />
          <button
            type="submit"
            disabled={adding || !newTitle.trim()}
            className={`w-full sm:w-auto px-4 py-2 rounded-xl text-sm disabled:opacity-50 inline-flex items-center justify-center gap-1.5 ${GOLD_BUTTON_CLASS}`}
          >
            {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            <span>Добавить</span>
          </button>
        </form>

        <div className="relative max-w-md">
          <Search className="w-4 h-4 text-[#E7C768] absolute left-3 top-3" />
          <input
            type="text"
            placeholder="Поиск по названию или коду..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full bg-transparent border border-white/20 rounded-xl pl-9 pr-3 py-2 text-sm text-white placeholder-slate-300 focus:outline-none focus:border-[#E7C768]"
          />
        </div>

        <div className="md:hidden space-y-2.5">
          {mobileTitles.length === 0 ? (
            <div className="p-6 text-center text-sm text-slate-300">
              {loading ? "Загрузка..." : "Ничего не найдено"}
            </div>
          ) : (
            <>
              {mobileTitles.map((item) => (
                <div
                  key={item.id}
                  className="rounded-2xl border border-white/20 bg-transparent p-3.5 space-y-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-white break-words">{item.title}</div>
                      <div className="text-sm font-mono text-slate-300">{item.id}</div>
                    </div>
                    <span className="px-2.5 py-0.5 rounded-full border border-[#E7C768]/50 text-sm text-[#F4EE8E] shrink-0">
                      {item.is_basic ? "Базовая" : "Кастом"}
                    </span>
                  </div>
                  <div className="text-sm text-slate-200">
                    Использований: <span className="font-mono font-bold">{item.usage_count || 0}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setSelectedTitle(item)}
                      className="w-full py-2 rounded-xl border border-white/25 hover:border-[#E7C768] text-sm text-white font-semibold cursor-pointer"
                    >
                      Изменить
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingDelete(item)}
                      className="w-full py-2 rounded-xl border border-white/25 hover:border-[#E7C768] text-sm text-[#F4EE8E] font-semibold inline-flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4 text-[#E7C768]" />
                      <span>Удалить</span>
                    </button>
                  </div>
                </div>
              ))}
              <InfiniteScrollTrigger
                hasMore={mobileHasMore}
                loading={loadingMore}
                loadedCount={mobileTitles.length}
                total={total}
                onLoadMore={loadMoreMobile}
              />
            </>
          )}
        </div>

        <div className="hidden md:block space-y-3">
          <div className="overflow-x-auto rounded-2xl border border-white/20 bg-transparent">
            <table className="w-full text-left text-sm">
              <thead className="bg-transparent border-b border-white/15 text-[#E7C768] text-sm font-semibold">
                <tr>
                  <th className="p-3.5">Код</th>
                  <th className="p-3.5">Должность</th>
                  <th className="p-3.5 text-center">Использований</th>
                  <th className="p-3.5 text-center">Тип</th>
                  <th className="p-3.5 text-right">Действия</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10 text-white">
                {titles.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-slate-300">
                      {loading ? "Загрузка..." : "Ничего не найдено"}
                    </td>
                  </tr>
                ) : (
                  titles.map((item) => (
                    <tr key={item.id} className="hover:bg-white/5 transition">
                      <td className="p-3.5 font-mono text-sm text-slate-300">{item.id}</td>
                      <td className="p-3.5 font-bold text-white">{item.title}</td>
                      <td className="p-3.5 text-center font-mono">{item.usage_count || 0}</td>
                      <td className="p-3.5 text-center">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-sm font-semibold border ${
                            item.is_basic
                              ? "border-[#E7C768] text-[#F4EE8E]"
                              : "border-white/25 text-slate-200"
                          }`}
                        >
                          {item.is_basic ? "Базовая" : "Кастом"}
                        </span>
                      </td>
                      <td className="p-3.5 text-right space-x-2">
                        <button
                          type="button"
                          onClick={() => setSelectedTitle(item)}
                          className="px-3 py-1.5 rounded-xl bg-transparent border border-white/25 hover:border-[#E7C768] text-sm text-white transition cursor-pointer"
                        >
                          Изменить
                        </button>
                        <button
                          type="button"
                          onClick={() => setPendingDelete(item)}
                          className="px-3 py-1.5 rounded-xl bg-transparent border border-white/25 hover:border-[#E7C768] text-[#F4EE8E] text-sm font-semibold inline-flex items-center gap-1 transition cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4 text-[#E7C768]" />
                          <span>Удалить</span>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <TablePaginationBar page={page} total={total} loading={loading} onPageChange={setPage} />
        </div>
      </div>

      {selectedTitle && (
        <DetailsModal
          title={`Должность: ${selectedTitle.title}`}
          data={selectedTitle}
          table="job_titles"
          onClose={() => setSelectedTitle(null)}
          onSaved={() => {
            setSelectedTitle(null);
            loadPage(page);
          }}
          onDelete={() => {
            setSelectedTitle(null);
            loadPage(page);
          }}
        />
      )}

      {deleteConfirmModal &&
        (typeof document !== "undefined" ? createPortal(deleteConfirmModal, document.body) : deleteConfirmModal)}
    </div>
  );
}
