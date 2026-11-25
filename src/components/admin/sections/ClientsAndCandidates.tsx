import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { KeyRound, Loader2, RefreshCw, Search, X } from "lucide-react";
import { dbClient } from "@/lib/dbClient";
import CandidateDetailsModal from "@/components/CandidateDetailsModal";
import {
  classifyClient,
  GLASS_CARD_CLASS,
  GOLD_BUTTON_CLASS,
  GOLD_TEXT_CLASS,
  safeArray,
  useEntityNav,
} from "../panel/adminConfig";
import {
  ADMIN_PAGE_SIZE,
  InfiniteScrollTrigger,
  TablePaginationBar,
} from "../panel/PaginationControls";

type KanbanStageKey = "new" | "setup" | "active" | "paying";

const KANBAN_COLS: Array<{ key: KanbanStageKey; label: string; hint: string }> = [
  { key: "new", label: "Новые", hint: "Без компаний и вакансий" },
  { key: "setup", label: "Настройка", hint: "Создана компания или вакансия" },
  { key: "active", label: "С откликами", hint: "Есть кандидаты в воронке" },
  { key: "paying", label: "Платящие", hint: "Пополняли баланс RR" },
];

type KanbanBucket = {
  items: any[];
  total: number;
  hasMore: boolean;
  loadingMore: boolean;
};

const EMPTY_KANBAN: Record<KanbanStageKey, KanbanBucket> = {
  new: { items: [], total: 0, hasMore: false, loadingMore: false },
  setup: { items: [], total: 0, hasMore: false, loadingMore: false },
  active: { items: [], total: 0, hasMore: false, loadingMore: false },
  paying: { items: [], total: 0, hasMore: false, loadingMore: false },
};

export function ClientsSection({ setToast }: { setToast: (t: any) => void }) {
  const [view, setView] = useState<"kanban" | "table">("kanban");
  const [mobileStage, setMobileStage] = useState<KanbanStageKey>("new");
  const [stageFilter, setStageFilter] = useState<"all" | KanbanStageKey>("all");
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const [kanban, setKanban] = useState<Record<KanbanStageKey, KanbanBucket>>(EMPTY_KANBAN);
  const [kanbanTotal, setKanbanTotal] = useState(0);
  const [kanbanLoading, setKanbanLoading] = useState(false);

  const [tableRows, setTableRows] = useState<any[]>([]);
  const [tableTotal, setTableTotal] = useState(0);
  const [tablePage, setTablePage] = useState(0);
  const [mobileTableRows, setMobileTableRows] = useState<any[]>([]);
  const [mobileTableHasMore, setMobileTableHasMore] = useState(false);
  const [tableLoading, setTableLoading] = useState(false);
  const [tableLoadingMore, setTableLoadingMore] = useState(false);

  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [resetBusy, setResetBusy] = useState(false);
  const { openEntity } = useEntityNav();

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(searchInput.trim());
      setTablePage(0);
    }, 280);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const loadKanban = async () => {
    setKanbanLoading(true);
    const { data, error } = await dbClient.rpc("admin_list_employers_kanban" as any, {
      _limit: ADMIN_PAGE_SIZE,
      _search: searchQuery,
    });
    if (error) {
      setToast({ kind: "err", text: error.message });
      setKanbanLoading(false);
      return;
    }
    const stagesObj = (data as any)?.stages || {};
    const next: Record<KanbanStageKey, KanbanBucket> = {
      new: {
        items: safeArray(stagesObj.new?.items),
        total: Number(stagesObj.new?.total || 0),
        hasMore: Boolean(stagesObj.new?.hasMore),
        loadingMore: false,
      },
      setup: {
        items: safeArray(stagesObj.setup?.items),
        total: Number(stagesObj.setup?.total || 0),
        hasMore: Boolean(stagesObj.setup?.hasMore),
        loadingMore: false,
      },
      active: {
        items: safeArray(stagesObj.active?.items),
        total: Number(stagesObj.active?.total || 0),
        hasMore: Boolean(stagesObj.active?.hasMore),
        loadingMore: false,
      },
      paying: {
        items: safeArray(stagesObj.paying?.items),
        total: Number(stagesObj.paying?.total || 0),
        hasMore: Boolean(stagesObj.paying?.hasMore),
        loadingMore: false,
      },
    };
    setKanban(next);
    setKanbanTotal(Number((data as any)?.total || 0));
    setKanbanLoading(false);
  };

  const loadMoreKanbanStage = async (stageKey: KanbanStageKey) => {
    const current = kanban[stageKey];
    if (!current || current.loadingMore || !current.hasMore) return;

    setKanban((prev) => ({
      ...prev,
      [stageKey]: { ...prev[stageKey], loadingMore: true },
    }));

    const { data, error } = await dbClient.rpc("admin_list_employers_kanban" as any, {
      _stage: stageKey,
      _limit: ADMIN_PAGE_SIZE,
      _offset: current.items.length,
      _search: searchQuery,
    });

    if (error) {
      setToast({ kind: "err", text: error.message });
      setKanban((prev) => ({
        ...prev,
        [stageKey]: { ...prev[stageKey], loadingMore: false },
      }));
      return;
    }

    const newItems = safeArray((data as any)?.items);
    const total = Number((data as any)?.total ?? current.total);
    const hasMore = Boolean((data as any)?.hasMore);

    setKanban((prev) => {
      const merged = [...prev[stageKey].items, ...newItems];
      return {
        ...prev,
        [stageKey]: {
          items: merged,
          total,
          hasMore,
          loadingMore: false,
        },
      };
    });
  };

  const loadTablePage = async (pageIdx: number) => {
    setTableLoading(true);
    const { data, error } = await dbClient.rpc("admin_list_employers_page" as any, {
      _limit: ADMIN_PAGE_SIZE,
      _offset: pageIdx * ADMIN_PAGE_SIZE,
      _search: searchQuery,
      _stage: stageFilter,
    });
    if (error) {
      setToast({ kind: "err", text: error.message });
      setTableLoading(false);
      return;
    }
    const items = safeArray((data as any)?.items);
    const total = Number((data as any)?.total || 0);
    const hasMore = Boolean((data as any)?.hasMore);
    setTableRows(items);
    setTableTotal(total);
    if (pageIdx === 0) {
      setMobileTableRows(items);
      setMobileTableHasMore(hasMore);
    }
    setTableLoading(false);
  };

  const loadMoreMobileTable = async () => {
    if (tableLoadingMore || !mobileTableHasMore) return;
    setTableLoadingMore(true);
    const { data, error } = await dbClient.rpc("admin_list_employers_page" as any, {
      _limit: ADMIN_PAGE_SIZE,
      _offset: mobileTableRows.length,
      _search: searchQuery,
      _stage: stageFilter,
    });
    if (!error) {
      const items = safeArray((data as any)?.items);
      setMobileTableRows((prev) => [...prev, ...items]);
      setMobileTableHasMore(Boolean((data as any)?.hasMore));
    }
    setTableLoadingMore(false);
  };

  useEffect(() => {
    if (view === "kanban") {
      loadKanban();
    } else {
      loadTablePage(tablePage);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, searchQuery, stageFilter, tablePage]);

  const handleRefresh = () => {
    if (view === "kanban") loadKanban();
    else loadTablePage(tablePage);
  };

  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = resetEmail.trim().toLowerCase();
    if (!email) {
      setToast({ kind: "err", text: "Введите email работодателя" });
      return;
    }
    if (!resetPassword || resetPassword.length < 6) {
      setToast({ kind: "err", text: "Пароль должен быть не короче 6 символов" });
      return;
    }
    setResetBusy(true);
    const { data, error } = await dbClient.functions.invoke("admin-set-user-password", {
      body: { email, password: resetPassword },
    });
    setResetBusy(false);
    if (error) {
      setToast({ kind: "err", text: error.message || "Не удалось изменить пароль" });
      return;
    }
    if ((data as any)?.error) {
      const code = (data as any).error;
      const msg =
        code === "user_not_found"
          ? "Пользователь с таким email не найден"
          : code === "forbidden"
          ? "Только администратор может сбрасывать пароли"
          : `Ошибка: ${code}`;
      setToast({ kind: "err", text: msg });
      return;
    }
    setResetModalOpen(false);
    setResetEmail("");
    setResetPassword("");
    setToast({ kind: "ok", text: `Пароль для ${email} обновлён.` });
  };

  const activeTotalCount = view === "kanban" ? kanbanTotal : tableTotal;
  const isInitialLoading = view === "kanban" ? kanbanLoading : tableLoading;

  const renderClientCard = (r: any) => (
    <div
      key={r.id}
      onClick={() => openEntity("employer", r.id)}
      className="bg-transparent backdrop-blur-md border border-white/20 hover:border-[#E7C768] p-3 rounded-xl cursor-pointer transition space-y-1.5"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="text-sm font-bold text-[#E7C768] break-words min-w-0">
          {r.name || r.email || `Клиент #${r.public_id}`}
        </div>
        <span className="text-sm font-mono text-slate-300 shrink-0">#{r.public_id}</span>
      </div>
      <div className="text-sm text-slate-200 break-all">{r.email || "—"}</div>
      <div className="flex flex-wrap items-center justify-between gap-1.5 text-sm font-mono pt-1 border-t border-white/10">
        <span className="text-slate-300">
          Комп: {r.companies_count ?? 0} · Вак: {r.projects_count ?? 0} · Откл: {r.candidates_count ?? 0}
        </span>
        <span className="text-[#F4EE8E] font-bold">{r.balance ?? 0} RR</span>
      </div>
    </div>
  );

  const resetModalNode = resetModalOpen ? (
    <div
      className="fixed inset-0 z-[950] flex items-center justify-center p-4 bg-[#0F2438]/75 backdrop-blur-xl"
      onClick={() => setResetModalOpen(false)}
    >
      <form
        onSubmit={handleResetPasswordSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-gradient-to-br from-[#17344F] via-[#1E4468] to-[#265582] border border-[#E7C768]/45 rounded-3xl p-6 space-y-4 shadow-2xl text-white"
      >
        <div className="flex items-center justify-between border-b border-white/15 pb-3">
          <h3 className={`text-base font-bold ${GOLD_TEXT_CLASS}`}>
            Смена пароля работодателя
          </h3>
          <button
            type="button"
            onClick={() => setResetModalOpen(false)}
            className="p-1.5 rounded-xl border border-white/20 hover:border-[#E7C768] text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-sm text-slate-200 mb-1">Email работодателя</label>
            <input
              type="email"
              required
              value={resetEmail}
              onChange={(e) => setResetEmail(e.target.value)}
              placeholder="employer@company.ru"
              className="w-full bg-transparent border border-white/25 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-[#E7C768]"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-200 mb-1">Новый пароль (мин. 6 символов)</label>
            <input
              type="password"
              required
              minLength={6}
              value={resetPassword}
              onChange={(e) => setResetPassword(e.target.value)}
              placeholder="Введите новый пароль"
              className="w-full bg-transparent border border-white/25 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-[#E7C768]"
            />
          </div>
        </div>
        <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={() => setResetModalOpen(false)}
            className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-white/25 text-white text-sm font-semibold hover:border-[#E7C768] cursor-pointer"
          >
            Отмена
          </button>
          <button
            type="submit"
            disabled={resetBusy}
            className={`w-full sm:w-auto px-5 py-2.5 rounded-xl text-sm disabled:opacity-50 ${GOLD_BUTTON_CLASS}`}
          >
            {resetBusy ? "Сохранение..." : "Обновить пароль"}
          </button>
        </div>
      </form>
    </div>
  ) : null;

  return (
    <div className="space-y-4">
      <div className={`${GLASS_CARD_CLASS} p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3`}>
        <h2 className={`text-base sm:text-lg font-bold ${GOLD_TEXT_CLASS}`}>
          Клиенты (работодатели) — {activeTotalCount}
        </h2>
        <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-2 w-full lg:w-auto">
          <div className="relative w-full sm:w-56">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#E7C768]" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Поиск клиента..."
              className="w-full bg-transparent text-sm text-white pl-9 pr-3 py-2 rounded-xl border border-white/20 focus:outline-none focus:border-[#E7C768] placeholder:text-slate-300"
            />
          </div>

          {view === "table" && (
            <select
              value={stageFilter}
              onChange={(e) => {
                setStageFilter(e.target.value as any);
                setTablePage(0);
              }}
              className="w-full sm:w-auto bg-transparent text-sm text-white px-3 py-2 rounded-xl border border-white/20 focus:outline-none focus:border-[#E7C768]"
            >
              <option value="all" className="bg-[#17344F] text-white">Все этапы</option>
              {KANBAN_COLS.map((c) => (
                <option key={c.key} value={c.key} className="bg-[#17344F] text-white">
                  {c.label}
                </option>
              ))}
            </select>
          )}

          <div className="grid grid-cols-2 p-1 rounded-xl border border-white/20 bg-transparent gap-1">
            <button
              type="button"
              onClick={() => setView("kanban")}
              className={`px-3 py-1.5 text-sm font-bold rounded-lg transition cursor-pointer ${
                view === "kanban"
                  ? "border border-[#E7C768] text-[#F4EE8E]"
                  : "border border-transparent text-white/80 hover:text-white"
              }`}
            >
              Канбан
            </button>
            <button
              type="button"
              onClick={() => setView("table")}
              className={`px-3 py-1.5 text-sm font-bold rounded-lg transition cursor-pointer ${
                view === "table"
                  ? "border border-[#E7C768] text-[#F4EE8E]"
                  : "border border-transparent text-white/80 hover:text-white"
              }`}
            >
              Таблица
            </button>
          </div>

          <button
            type="button"
            onClick={() => setResetModalOpen(true)}
            className="w-full sm:w-auto px-3.5 py-2 rounded-xl text-sm font-semibold bg-transparent border border-[#E7C768]/50 hover:border-[#E7C768] text-[#F4EE8E] flex items-center justify-center gap-1.5 transition cursor-pointer"
          >
            <KeyRound className="w-4 h-4 text-[#E7C768]" />
            <span>Сброс пароля</span>
          </button>

          <button
            type="button"
            onClick={handleRefresh}
            className="w-full sm:w-auto px-3.5 py-2 rounded-xl text-sm font-semibold bg-transparent border border-white/20 hover:border-[#E7C768] text-white flex items-center justify-center gap-1.5 transition cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 text-[#E7C768] ${isInitialLoading ? "animate-spin" : ""}`} />
            <span>Обновить</span>
          </button>
        </div>
      </div>

      {isInitialLoading ? (
        <div className="text-center py-12 text-white text-sm flex items-center justify-center gap-2">
          <Loader2 className="w-5 h-5 animate-spin text-[#E7C768]" /> Загрузка...
        </div>
      ) : view === "kanban" ? (
        <>
          {/* Mobile vertical Kanban selector (zero horizontal scrolling) */}
          <div className="md:hidden space-y-3">
            <div className={`${GLASS_CARD_CLASS} p-3 space-y-2`}>
              <div className="text-sm font-semibold text-[#F4EE8E]">Стадия клиента</div>
              <div className="grid grid-cols-1 gap-2">
                {KANBAN_COLS.map((col) => {
                  const bucket = kanban[col.key];
                  const isActive = mobileStage === col.key;
                  return (
                    <button
                      key={col.key}
                      type="button"
                      onClick={() => setMobileStage(col.key)}
                      className={`w-full px-3.5 py-2.5 rounded-xl border text-left transition flex items-center justify-between gap-2 cursor-pointer ${
                        isActive
                          ? "border-[#E7C768] text-[#F4EE8E]"
                          : "border-white/20 text-white hover:border-white/45"
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-bold">{col.label}</div>
                        <div className="text-sm text-slate-300">{col.hint}</div>
                      </div>
                      <span className="border border-[#E7C768]/50 font-mono px-2.5 py-0.5 rounded-full text-sm text-[#E7C768] shrink-0">
                        {bucket.total}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {(() => {
              const bucket = kanban[mobileStage];
              const colInfo = KANBAN_COLS.find((c) => c.key === mobileStage)!;
              return (
                <div className={`${GLASS_CARD_CLASS} p-3.5 space-y-2.5`}>
                  <div className="flex items-center justify-between border-b border-white/15 pb-2.5 text-sm font-bold text-[#F4EE8E]">
                    <span>{colInfo.label}</span>
                    <span className="font-mono text-[#E7C768]">
                      {bucket.items.length} из {bucket.total}
                    </span>
                  </div>
                  {bucket.items.length === 0 ? (
                    <div className="text-center py-6 text-slate-300 text-sm">Пусто</div>
                  ) : (
                    <>
                      <div className="space-y-2.5">{bucket.items.map(renderClientCard)}</div>
                      <InfiniteScrollTrigger
                        hasMore={bucket.hasMore}
                        loading={bucket.loadingMore}
                        loadedCount={bucket.items.length}
                        total={bucket.total}
                        onLoadMore={() => loadMoreKanbanStage(mobileStage)}
                        compact
                      />
                    </>
                  )}
                </div>
              );
            })()}
          </div>

          {/* Desktop 4-column Kanban with independent per-column +20 scroll loading */}
          <div className="hidden md:grid md:grid-cols-2 xl:grid-cols-4 gap-3">
            {KANBAN_COLS.map((col) => {
              const bucket = kanban[col.key];
              return (
                <div
                  key={col.key}
                  className="bg-transparent backdrop-blur-md border border-white/20 rounded-2xl p-3.5 flex flex-col max-h-[68vh]"
                >
                  <div className="flex items-start justify-between gap-2 border-b border-white/15 pb-2.5 shrink-0">
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-[#F4EE8E]">{col.label}</div>
                      <div className="text-sm text-slate-300">{col.hint}</div>
                    </div>
                    <span className="border border-[#E7C768]/40 font-mono px-2.5 py-0.5 rounded-full text-sm text-[#E7C768] shrink-0">
                      {bucket.total}
                    </span>
                  </div>
                  <div className="space-y-2.5 mt-3 overflow-y-auto pr-1 flex-1">
                    {bucket.items.length === 0 ? (
                      <div className="text-center py-6 text-slate-300 text-sm">Пусто</div>
                    ) : (
                      <>
                        {bucket.items.map(renderClientCard)}
                        <InfiniteScrollTrigger
                          hasMore={bucket.hasMore}
                          loading={bucket.loadingMore}
                          loadedCount={bucket.items.length}
                          total={bucket.total}
                          onLoadMore={() => loadMoreKanbanStage(col.key)}
                          compact
                        />
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <>
          <div className="md:hidden space-y-3">
            {mobileTableRows.map((r) => {
              const cls = classifyClient(r);
              return (
                <div
                  key={r.id}
                  onClick={() => openEntity("employer", r.id)}
                  className={`${GLASS_CARD_CLASS} p-4 space-y-2 cursor-pointer hover:border-[#E7C768] transition`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-[#F4EE8E] break-words">
                        {r.name || "—"}
                      </div>
                      <div className="text-sm text-slate-200 break-all">{r.email || "—"}</div>
                      <div className="text-sm text-slate-300 font-mono">#{r.public_id}</div>
                    </div>
                    <span
                      className={`text-sm font-semibold px-2.5 py-0.5 rounded-full border shrink-0 ${
                        cls.isPriority
                          ? "border-[#E7C768] text-[#F4EE8E]"
                          : "border-white/25 text-white"
                      }`}
                    >
                      {cls.label}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-white/15 text-sm">
                    <div>
                      <span className="text-slate-300 block">Вакансий</span>
                      <span className="font-bold text-white">{r.projects_count ?? 0}</span>
                    </div>
                    <div>
                      <span className="text-slate-300 block">Кандид.</span>
                      <span className="font-bold text-white">{r.candidates_count ?? 0}</span>
                    </div>
                    <div>
                      <span className="text-slate-300 block">Баланс</span>
                      <span className="font-bold text-[#E7C768] font-mono">{r.balance ?? 0} RR</span>
                    </div>
                  </div>
                </div>
              );
            })}
            {mobileTableRows.length === 0 ? (
              <div className={`${GLASS_CARD_CLASS} p-8 text-center text-sm text-slate-300`}>
                Ничего не найдено
              </div>
            ) : (
              <InfiniteScrollTrigger
                hasMore={mobileTableHasMore}
                loading={tableLoadingMore}
                loadedCount={mobileTableRows.length}
                total={tableTotal}
                onLoadMore={loadMoreMobileTable}
              />
            )}
          </div>

          <div className="hidden md:block space-y-3">
            <div className={`${GLASS_CARD_CLASS} overflow-hidden`}>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-transparent border-b border-white/15 text-[#E7C768] text-sm font-semibold">
                    <tr>
                      <th className="p-3.5">Номер</th>
                      <th className="p-3.5">Имя / Email</th>
                      <th className="p-3.5">Контакты</th>
                      <th className="p-3.5 text-center">Компаний</th>
                      <th className="p-3.5 text-center">Вакансий</th>
                      <th className="p-3.5 text-center">Кандидатов</th>
                      <th className="p-3.5 text-center">Баланс RR</th>
                      <th className="p-3.5">Статус</th>
                      <th className="p-3.5">Создан</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {tableRows.map((r) => {
                      const cls = classifyClient(r);
                      return (
                        <tr
                          key={r.id}
                          className="hover:bg-white/5 cursor-pointer transition"
                          onClick={() => openEntity("employer", r.id)}
                        >
                          <td className="p-3.5 font-mono text-slate-300">{r.public_id}</td>
                          <td className="p-3.5">
                            <div className="font-bold text-white">{r.name || "—"}</div>
                            <div className="text-sm text-slate-300">{r.email}</div>
                          </td>
                          <td className="p-3.5 text-sm text-slate-200">
                            {r.contact_phone || r.phone || "—"}{" "}
                            {r.contact_telegram || r.telegram_username
                              ? `· @${String(r.contact_telegram || r.telegram_username).replace(/^@+/, "")}`
                              : ""}
                          </td>
                          <td className="p-3.5 text-center">{r.companies_count ?? 0}</td>
                          <td className="p-3.5 text-center">{r.projects_count ?? 0}</td>
                          <td className="p-3.5 text-center">{r.candidates_count ?? 0}</td>
                          <td className="p-3.5 text-center font-mono text-[#E7C768] font-bold">
                            {r.balance ?? 0}
                          </td>
                          <td className="p-3.5">
                            <span
                              className={`text-sm font-semibold px-2.5 py-0.5 rounded-full border ${
                                cls.isPriority
                                  ? "border-[#E7C768] text-[#F4EE8E]"
                                  : "border-white/25 text-white"
                              }`}
                            >
                              {cls.label}
                            </span>
                          </td>
                          <td className="p-3.5 text-sm text-slate-300">
                            {r.created_at ? new Date(r.created_at).toLocaleDateString() : ""}
                          </td>
                        </tr>
                      );
                    })}
                    {tableRows.length === 0 && (
                      <tr>
                        <td colSpan={9} className="p-8 text-center text-slate-300">
                          Ничего не найдено
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            <TablePaginationBar
              page={tablePage}
              total={tableTotal}
              loading={tableLoading}
              onPageChange={setTablePage}
            />
          </div>
        </>
      )}

      {resetModalNode &&
        (typeof document !== "undefined" ? createPortal(resetModalNode, document.body) : resetModalNode)}
    </div>
  );
}

export function CandidatesSection() {
  const [rows, setRows] = useState<any[]>([]);
  const [mobileRows, setMobileRows] = useState<any[]>([]);
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
    const { data } = await dbClient.rpc("admin_list_candidates" as any, {
      _paginated: true,
      _limit: ADMIN_PAGE_SIZE,
      _offset: pageIdx * ADMIN_PAGE_SIZE,
      _search: searchQuery,
      _stage: stage,
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
    const { data } = await dbClient.rpc("admin_list_candidates" as any, {
      _paginated: true,
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

  const STAGES = [
    "all",
    "registration",
    "screening",
    "checklist",
    "situations",
    "professional",
    "product",
    "systems",
    "certified",
  ];

  return (
    <div className="space-y-4">
      <div className={`${GLASS_CARD_CLASS} p-4 flex flex-col md:flex-row md:items-center justify-between gap-3`}>
        <h2 className={`text-base sm:text-lg font-bold ${GOLD_TEXT_CLASS}`}>
          Кандидаты — {total}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full md:w-auto">
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Поиск кандидата..."
            className="w-full bg-transparent text-sm text-white px-3.5 py-2 rounded-xl border border-white/20 focus:outline-none focus:border-[#E7C768] placeholder:text-slate-300"
          />
          <select
            value={stage}
            onChange={(e) => {
              setStage(e.target.value);
              setPage(0);
            }}
            className="w-full bg-transparent text-sm text-white px-3.5 py-2 rounded-xl border border-white/20 focus:outline-none focus:border-[#E7C768]"
          >
            {STAGES.map((s) => (
              <option key={s} value={s} className="bg-[#17344F] text-white">
                {s === "all" ? "Все этапы" : s}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-white text-sm flex items-center justify-center gap-2">
          <Loader2 className="w-5 h-5 animate-spin text-[#E7C768]" /> Загрузка...
        </div>
      ) : (
        <>
          <div className="md:hidden space-y-3">
            {mobileRows.map((r) => (
              <div
                key={r.id}
                onClick={() => setSelected(r.id)}
                className={`${GLASS_CARD_CLASS} p-4 space-y-2 cursor-pointer hover:border-[#E7C768] transition`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-white break-words">
                      {r.full_name || "—"}
                    </div>
                    <div className="text-sm text-slate-300 break-all">{r.email || "—"}</div>
                  </div>
                  <span className="text-sm font-mono font-bold text-[#E7C768] shrink-0">
                    {r.overall_score ? Math.round(Number(r.overall_score)) : "—"}
                  </span>
                </div>
                <div className="text-sm text-slate-200 break-words">
                  {r.role_name || r.project_role || "—"} · {r.company_name || "—"}
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-white/15 text-sm">
                  <span className="px-2.5 py-0.5 rounded-full border border-[#E7C768]/50 text-[#F4EE8E]">
                    {r.crm_stage || "—"}
                  </span>
                  <span className="text-slate-300 font-mono">#{r.public_id}</span>
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
                      <th className="p-3.5">Номер</th>
                      <th className="p-3.5">ФИО</th>
                      <th className="p-3.5">Email</th>
                      <th className="p-3.5">Роль</th>
                      <th className="p-3.5">Компания</th>
                      <th className="p-3.5">Этап</th>
                      <th className="p-3.5">Балл</th>
                      <th className="p-3.5">Создан</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {rows.map((r) => (
                      <tr
                        key={r.id}
                        className="hover:bg-white/5 cursor-pointer transition"
                        onClick={() => setSelected(r.id)}
                      >
                        <td className="p-3.5 font-mono text-slate-300">{r.public_id}</td>
                        <td className="p-3.5 font-bold text-white">{r.full_name || "—"}</td>
                        <td className="p-3.5 text-slate-200">{r.email || "—"}</td>
                        <td className="p-3.5 text-slate-200">{r.role_name || r.project_role || "—"}</td>
                        <td className="p-3.5 text-slate-200">{r.company_name || "—"}</td>
                        <td className="p-3.5">
                          <span className="text-sm font-semibold px-2.5 py-0.5 rounded-full border border-[#E7C768]/50 text-[#F4EE8E]">
                            {r.crm_stage}
                          </span>
                        </td>
                        <td className="p-3.5 font-mono text-[#E7C768] font-bold">
                          {r.overall_score ? Math.round(Number(r.overall_score)) : "—"}
                        </td>
                        <td className="p-3.5 text-sm text-slate-300">
                          {r.created_at ? new Date(r.created_at).toLocaleDateString() : ""}
                        </td>
                      </tr>
                    ))}
                    {rows.length === 0 && (
                      <tr>
                        <td colSpan={8} className="p-8 text-center text-slate-300">
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
