import React, { useEffect, useState } from "react";
import { Loader2, Minus, Plus } from "lucide-react";
import { dbClient, getAuthHeaders } from "@/lib/dbClient";
import { ConfirmBalanceChangeModal } from "@/components/ConfirmBalanceChangeModal";
import DetailsModal from "@/components/admin/DetailsModal";
import {
  EntityLink,
  GLASS_CARD_CLASS,
  GOLD_TEXT_CLASS,
  OMIT_KEYS,
  RU_LABELS,
  safeArray,
  useEntityNav,
} from "../panel/adminConfig";
import {
  ADMIN_PAGE_SIZE,
  InfiniteScrollTrigger,
  TablePaginationBar,
} from "../panel/PaginationControls";

const ROLE_OPTIONS: Array<{ key: string; label: string }> = [
  { key: "super_admin", label: "Супер-админ" },
  { key: "admin", label: "Админ" },
  { key: "moderator", label: "Модератор" },
  { key: "employer", label: "Работодатель" },
  { key: "candidate", label: "Кандидат" },
];

export function RolesSection({ setToast }: { setToast: (t: any) => void }) {
  const [rows, setRows] = useState<any[]>([]);
  const [mobileRows, setMobileRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [mobileHasMore, setMobileHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(searchInput.trim());
      setPage(0);
    }, 280);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const loadPage = async (pageIdx: number) => {
    setLoading(true);
    const { data, error } = await dbClient.rpc("admin_list_users" as any, {
      _paginated: true,
      _limit: ADMIN_PAGE_SIZE,
      _offset: pageIdx * ADMIN_PAGE_SIZE,
      _search: searchQuery,
    });
    if (error) {
      setToast({ kind: "err", text: error.message });
    } else {
      const items = safeArray((data as any)?.items ?? data);
      const cnt = Number((data as any)?.total ?? items.length);
      const hasMore = Boolean((data as any)?.hasMore);
      setRows(items);
      setTotal(cnt);
      if (pageIdx === 0) {
        setMobileRows(items);
        setMobileHasMore(hasMore);
      }
    }
    setLoading(false);
  };

  const loadMoreMobile = async () => {
    if (loadingMore || !mobileHasMore) return;
    setLoadingMore(true);
    const { data, error } = await dbClient.rpc("admin_list_users" as any, {
      _paginated: true,
      _limit: ADMIN_PAGE_SIZE,
      _offset: mobileRows.length,
      _search: searchQuery,
    });
    if (!error) {
      const items = safeArray((data as any)?.items);
      setMobileRows((prev) => [...prev, ...items]);
      setMobileHasMore(Boolean((data as any)?.hasMore));
    }
    setLoadingMore(false);
  };

  useEffect(() => {
    loadPage(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, searchQuery]);

  const toggle = async (uid: string, role: string, enabled: boolean) => {
    const { error } = await dbClient.rpc("admin_set_role" as any, {
      _user: uid,
      _role: role,
      _enabled: enabled,
    });
    if (error) {
      setToast({ kind: "err", text: error.message });
      return;
    }
    setToast({ kind: "ok", text: "Роль обновлена" });
    const nextRoles = enabled ? [role] : ["employer"];
    setRows((prev) => prev.map((u) => (u.user_id === uid ? { ...u, roles: nextRoles, role: nextRoles[0] } : u)));
    setMobileRows((prev) =>
      prev.map((u) => (u.user_id === uid ? { ...u, roles: nextRoles, role: nextRoles[0] } : u))
    );
    loadPage(page);
  };

  return (
    <div className="space-y-4">
      <div className={`${GLASS_CARD_CLASS} p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3`}>
        <h2 className={`text-base sm:text-lg font-bold ${GOLD_TEXT_CLASS}`}>
          Роли — {total} пользователей
        </h2>
        <input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Поиск пользователя…"
          className="w-full sm:w-72 bg-transparent text-sm text-white px-3.5 py-2 rounded-xl border border-white/20 focus:outline-none focus:border-[#E7C768] placeholder:text-slate-300"
        />
      </div>

      {loading ? (
        <div className="text-center py-12 text-white text-sm flex items-center justify-center gap-2">
          <Loader2 className="w-5 h-5 animate-spin text-[#E7C768]" /> Загрузка...
        </div>
      ) : (
        <>
          <div className="md:hidden space-y-3">
            {mobileRows.map((u) => {
              const userRoles: string[] = u.roles || [];
              return (
                <div key={u.user_id} className={`${GLASS_CARD_CLASS} p-4 space-y-3`}>
                  <div className="min-w-0">
                    <div className="font-bold text-white text-sm break-words">
                      {u.display_name || "—"}
                    </div>
                    <div className="text-sm text-slate-300 break-all">{u.email || "—"}</div>
                  </div>
                  <div className="grid grid-cols-1 gap-2 pt-2 border-t border-white/15">
                    {ROLE_OPTIONS.map((r) => {
                      const has = userRoles.includes(r.key);
                      return (
                        <button
                          key={r.key}
                          type="button"
                          onClick={() => toggle(u.user_id, r.key, !has)}
                          className={`w-full px-3.5 py-2 rounded-xl border text-sm font-semibold flex items-center justify-between transition cursor-pointer ${
                            has
                              ? "border-[#E7C768] text-[#F4EE8E]"
                              : "border-white/20 text-white/85 hover:border-white/45"
                          }`}
                        >
                          <span>{r.label}</span>
                          <span>{has ? "✓" : "Выбрать"}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {mobileRows.length === 0 ? (
              <div className={`${GLASS_CARD_CLASS} p-8 text-center text-sm text-slate-300`}>
                Пользователи не найдены
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
                      <th className="p-3.5">Пользователь</th>
                      {ROLE_OPTIONS.map((r) => (
                        <th key={r.key} className="p-3.5 text-center">
                          {r.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {rows.map((u) => {
                      const userRoles: string[] = u.roles || [];
                      return (
                        <tr key={u.user_id} className="hover:bg-white/5 transition">
                          <td className="p-3.5">
                            <div className="font-bold text-white text-sm">
                              {u.display_name || "—"}
                            </div>
                            <div className="text-sm text-slate-300">{u.email}</div>
                          </td>
                          {ROLE_OPTIONS.map((r) => {
                            const has = userRoles.includes(r.key);
                            return (
                              <td key={r.key} className="p-3.5 text-center">
                                <button
                                  type="button"
                                  onClick={() => toggle(u.user_id, r.key, !has)}
                                  className={`w-8 h-8 rounded-xl border text-sm font-bold transition cursor-pointer ${
                                    has
                                      ? "bg-transparent border-[#E7C768] text-[#F4EE8E]"
                                      : "bg-transparent border-white/25 text-slate-300 hover:border-[#E7C768]"
                                  }`}
                                >
                                  {has ? "✓" : ""}
                                </button>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                    {rows.length === 0 && (
                      <tr>
                        <td colSpan={ROLE_OPTIONS.length + 1} className="p-8 text-center text-slate-300">
                          Пользователи не найдены
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
    </div>
  );
}

export function AccountsTab({ setToast }: { setToast: (t: any) => void }) {
  const { openEntity } = useEntityNav();

  // Balances pagination state (20 per page / +20 scroll)
  const [empRows, setEmpRows] = useState<any[]>([]);
  const [empMobileRows, setEmpMobileRows] = useState<any[]>([]);
  const [empTotal, setEmpTotal] = useState(0);
  const [empPage, setEmpPage] = useState(0);
  const [empMobileHasMore, setEmpMobileHasMore] = useState(false);
  const [empLoading, setEmpLoading] = useState(false);
  const [empLoadingMore, setEmpLoadingMore] = useState(false);
  const [empSearchInput, setEmpSearchInput] = useState("");
  const [empSearchQuery, setEmpSearchQuery] = useState("");

  // Transactions pagination state (20 per page / +20 scroll)
  const [txRows, setTxRows] = useState<any[]>([]);
  const [txMobileRows, setTxMobileRows] = useState<any[]>([]);
  const [txTotal, setTxTotal] = useState(0);
  const [txPage, setTxPage] = useState(0);
  const [txMobileHasMore, setTxMobileHasMore] = useState(false);
  const [txLoading, setTxLoading] = useState(false);
  const [txLoadingMore, setTxLoadingMore] = useState(false);
  const [txSearchInput, setTxSearchInput] = useState("");
  const [txSearchQuery, setTxSearchQuery] = useState("");

  const [selectedTx, setSelectedTx] = useState<any | null>(null);
  const [modalData, setModalData] = useState<{
    open: boolean;
    employer: any;
    delta: number;
  }>({ open: false, employer: null, delta: 0 });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setEmpSearchQuery(empSearchInput.trim());
      setEmpPage(0);
    }, 280);
    return () => clearTimeout(timer);
  }, [empSearchInput]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setTxSearchQuery(txSearchInput.trim());
      setTxPage(0);
    }, 280);
    return () => clearTimeout(timer);
  }, [txSearchInput]);

  const loadEmpPage = async (pageIdx: number) => {
    setEmpLoading(true);
    const { data, error } = await dbClient.rpc("admin_list_employers_page" as any, {
      _limit: ADMIN_PAGE_SIZE,
      _offset: pageIdx * ADMIN_PAGE_SIZE,
      _search: empSearchQuery,
    });
    if (error) {
      setToast({ kind: "err", text: error.message });
    } else {
      const items = safeArray((data as any)?.items);
      const cnt = Number((data as any)?.total ?? items.length);
      const hasMore = Boolean((data as any)?.hasMore);
      setEmpRows(items);
      setEmpTotal(cnt);
      if (pageIdx === 0) {
        setEmpMobileRows(items);
        setEmpMobileHasMore(hasMore);
      }
    }
    setEmpLoading(false);
  };

  const loadMoreEmpMobile = async () => {
    if (empLoadingMore || !empMobileHasMore) return;
    setEmpLoadingMore(true);
    const { data } = await dbClient.rpc("admin_list_employers_page" as any, {
      _limit: ADMIN_PAGE_SIZE,
      _offset: empMobileRows.length,
      _search: empSearchQuery,
    });
    const items = safeArray((data as any)?.items);
    setEmpMobileRows((prev) => [...prev, ...items]);
    setEmpMobileHasMore(Boolean((data as any)?.hasMore));
    setEmpLoadingMore(false);
  };

  const loadTxPage = async (pageIdx: number) => {
    setTxLoading(true);
    const { data, error } = await dbClient.rpc("admin_transactions_page" as any, {
      _limit: ADMIN_PAGE_SIZE,
      _offset: pageIdx * ADMIN_PAGE_SIZE,
      _search: txSearchQuery,
    });
    if (!error) {
      const items = safeArray((data as any)?.items);
      const cnt = Number((data as any)?.total ?? items.length);
      const hasMore = Boolean((data as any)?.hasMore);
      setTxRows(items);
      setTxTotal(cnt);
      if (pageIdx === 0) {
        setTxMobileRows(items);
        setTxMobileHasMore(hasMore);
      }
    }
    setTxLoading(false);
  };

  const loadMoreTxMobile = async () => {
    if (txLoadingMore || !txMobileHasMore) return;
    setTxLoadingMore(true);
    const { data } = await dbClient.rpc("admin_transactions_page" as any, {
      _limit: ADMIN_PAGE_SIZE,
      _offset: txMobileRows.length,
      _search: txSearchQuery,
    });
    const items = safeArray((data as any)?.items);
    setTxMobileRows((prev) => [...prev, ...items]);
    setTxMobileHasMore(Boolean((data as any)?.hasMore));
    setTxLoadingMore(false);
  };

  useEffect(() => {
    loadEmpPage(empPage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empPage, empSearchQuery]);

  useEffect(() => {
    loadTxPage(txPage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txPage, txSearchQuery]);

  useEffect(() => {
    const ch = dbClient
      .channel("admin-accounts-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "wallets" }, () => {
        loadEmpPage(empPage);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "transactions" }, () => {
        loadTxPage(txPage);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "employers" }, () => {
        loadEmpPage(empPage);
      })
      .subscribe();
    return () => {
      dbClient.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empPage, txPage, empSearchQuery, txSearchQuery]);

  const openAdjustModal = (employer: any, delta: number) => {
    setModalData({ open: true, employer, delta });
  };

  const handleConfirmAdjust = async (comment: string, type: string) => {
    if (!modalData.employer || !modalData.delta) return;
    setBusy(true);
    const { error } = await dbClient.rpc("admin_wallet_adjust" as any, {
      _employer: modalData.employer.id,
      _delta: modalData.delta,
      _note: comment,
      _type: type,
    });
    setBusy(false);
    setModalData({ open: false, employer: null, delta: 0 });
    if (error) {
      setToast({ kind: "err", text: error.message });
    } else {
      setToast({ kind: "ok", text: "Баланс успешно обновлен. Транзакция записана." });
      loadEmpPage(empPage);
      loadTxPage(0);
    }
  };

  return (
    <div className="space-y-4">
      <div className={`${GLASS_CARD_CLASS} border-[#E7C768]/30 p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3`}>
        <div className="flex flex-wrap items-center gap-3">
          <h2 className={`text-base sm:text-lg font-bold ${GOLD_TEXT_CLASS}`}>
            Счета и балансы клиентов — {empTotal}
          </h2>
          <span className="text-sm font-medium text-[#E7C768] flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#E7C768] animate-pulse" />
            <span>Реальное время</span>
          </span>
        </div>
        <input
          value={empSearchInput}
          onChange={(e) => setEmpSearchInput(e.target.value)}
          placeholder="Поиск клиента по имени / email / ID…"
          className="w-full lg:w-72 bg-transparent text-sm text-white px-3.5 py-2 rounded-xl border border-white/20 focus:outline-none focus:border-[#E7C768] placeholder:text-slate-300"
        />
      </div>

      {empLoading ? (
        <div className="text-center py-12 text-white text-sm flex items-center justify-center gap-2">
          <Loader2 className="w-5 h-5 animate-spin text-[#E7C768]" /> Загрузка счетов...
        </div>
      ) : (
        <>
          <div className="md:hidden space-y-3">
            {empMobileRows.map((r) => (
              <div key={r.id} className={`${GLASS_CARD_CLASS} p-4 space-y-3`}>
                <div
                  className="flex items-start justify-between gap-2 cursor-pointer"
                  onClick={() => openEntity("employer", r.id)}
                >
                  <div className="min-w-0">
                    <div className="font-bold text-[#E7C768] text-sm break-words">
                      {r.name || r.email || "—"}
                    </div>
                    <div className="text-sm text-slate-300 break-all">{r.email}</div>
                    <div className="text-sm font-mono text-slate-300">#{r.public_id}</div>
                  </div>
                  <div className="font-mono text-[#F4EE8E] font-bold text-sm shrink-0">
                    {r.balance} RR
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-white/15">
                  {[100, 500, 1000].map((d) => (
                    <div key={d} className="space-y-1.5">
                      <button
                        type="button"
                        onClick={() => openAdjustModal(r, d)}
                        className="w-full py-1.5 rounded-xl bg-transparent border border-white/25 hover:border-[#E7C768] text-white text-sm font-bold flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5 text-[#E7C768]" />
                        {d}
                      </button>
                      <button
                        type="button"
                        onClick={() => openAdjustModal(r, -d)}
                        className="w-full py-1.5 rounded-xl bg-transparent border border-white/25 hover:border-[#E7C768] text-white text-sm font-bold flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <Minus className="w-3.5 h-3.5 text-slate-300" />
                        {d}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {empMobileRows.length === 0 ? (
              <div className={`${GLASS_CARD_CLASS} p-8 text-center text-sm text-slate-300`}>
                Клиенты не найдены
              </div>
            ) : (
              <InfiniteScrollTrigger
                hasMore={empMobileHasMore}
                loading={empLoadingMore}
                loadedCount={empMobileRows.length}
                total={empTotal}
                onLoadMore={loadMoreEmpMobile}
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
                      <th className="p-3.5">Клиент</th>
                      <th className="p-3.5">Баланс RR</th>
                      <th className="p-3.5">Корректировка</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {empRows.map((r) => (
                      <tr key={r.id} className="hover:bg-white/5 transition">
                        <td
                          className="p-3.5 font-mono text-slate-300 cursor-pointer"
                          onClick={() => openEntity("employer", r.id)}
                        >
                          {r.public_id}
                        </td>
                        <td
                          className="p-3.5 cursor-pointer"
                          onClick={() => openEntity("employer", r.id)}
                        >
                          <div className="font-bold text-[#E7C768] text-sm">
                            {r.name || r.email || "—"}
                          </div>
                          <div className="text-sm text-slate-300">{r.email}</div>
                        </td>
                        <td
                          className="p-3.5 font-mono text-[#E7C768] font-bold text-sm cursor-pointer"
                          onClick={() => openEntity("employer", r.id)}
                        >
                          {r.balance}
                        </td>
                        <td className="p-3.5 flex flex-wrap items-center gap-1.5">
                          {[100, 500, 1000].map((d) => (
                            <React.Fragment key={d}>
                              <button
                                type="button"
                                onClick={() => openAdjustModal(r, d)}
                                className="px-2.5 py-1 rounded-lg bg-transparent border border-white/25 hover:border-[#E7C768] text-white text-sm font-bold flex items-center gap-1 transition cursor-pointer"
                              >
                                <Plus className="w-3.5 h-3.5 text-[#E7C768]" />
                                {d}
                              </button>
                              <button
                                type="button"
                                onClick={() => openAdjustModal(r, -d)}
                                className="px-2.5 py-1 rounded-lg bg-transparent border border-white/25 hover:border-[#E7C768] text-white text-sm font-bold flex items-center gap-1 transition cursor-pointer"
                              >
                                <Minus className="w-3.5 h-3.5 text-slate-300" />
                                {d}
                              </button>
                            </React.Fragment>
                          ))}
                        </td>
                      </tr>
                    ))}
                    {empRows.length === 0 && (
                      <tr>
                        <td colSpan={4} className="p-8 text-center text-slate-300">
                          Клиенты не найдены
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <TablePaginationBar
              page={empPage}
              total={empTotal}
              loading={empLoading}
              onPageChange={setEmpPage}
            />
          </div>
        </>
      )}

      <div className={`${GLASS_CARD_CLASS} p-4 space-y-3`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h3 className={`text-sm font-bold ${GOLD_TEXT_CLASS}`}>
            Последние транзакции — {txTotal}
          </h3>
          <input
            value={txSearchInput}
            onChange={(e) => setTxSearchInput(e.target.value)}
            placeholder="Поиск по клиенту / email / заметке…"
            className="w-full sm:w-72 bg-transparent text-sm text-white px-3.5 py-2 rounded-xl border border-white/20 focus:outline-none focus:border-[#E7C768] placeholder:text-slate-300"
          />
        </div>

        {txLoading ? (
          <div className="text-center py-8 text-white text-sm flex items-center justify-center gap-2">
            <Loader2 className="w-5 h-5 animate-spin text-[#E7C768]" /> Загрузка транзакций...
          </div>
        ) : (
          <>
            <div className="md:hidden space-y-2">
              {txMobileRows.map((t) => (
                <div
                  key={t.id}
                  onClick={() => setSelectedTx(t)}
                  className="rounded-2xl border border-white/15 bg-transparent p-3 space-y-1 cursor-pointer"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-semibold text-white break-words">
                      {t._emp_name || t._emp_email || "—"}
                    </span>
                    <span className="font-mono font-bold text-[#E7C768] text-sm shrink-0">
                      {t.amount_rr}
                    </span>
                  </div>
                  <div className="text-sm text-slate-300 break-words">{t.note || t.type}</div>
                  <div className="text-sm text-slate-400">
                    {t.created_at ? new Date(t.created_at).toLocaleString() : ""}
                  </div>
                </div>
              ))}
              {txMobileRows.length === 0 ? (
                <div className="p-6 text-center text-sm text-slate-300">Нет транзакций</div>
              ) : (
                <InfiniteScrollTrigger
                  hasMore={txMobileHasMore}
                  loading={txLoadingMore}
                  loadedCount={txMobileRows.length}
                  total={txTotal}
                  onLoadMore={loadMoreTxMobile}
                  compact
                />
              )}
            </div>

            <div className="hidden md:block space-y-3">
              <div className="overflow-x-auto border border-white/15 rounded-2xl">
                <table className="w-full text-left text-sm">
                  <thead className="bg-transparent border-b border-white/15 text-[#E7C768] text-sm font-semibold">
                    <tr>
                      <th className="p-3">Дата</th>
                      <th className="p-3">Клиент</th>
                      <th className="p-3">Email</th>
                      <th className="p-3">Тип</th>
                      <th className="p-3">Сумма</th>
                      <th className="p-3">Заметка</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {txRows.map((t) => (
                      <tr
                        key={t.id}
                        className="hover:bg-white/5 cursor-pointer transition"
                        onClick={() => setSelectedTx(t)}
                      >
                        <td className="p-3 text-slate-300 text-sm whitespace-nowrap">
                          {t.created_at ? new Date(t.created_at).toLocaleString() : ""}
                        </td>
                        <td className="p-3" onClick={(e) => e.stopPropagation()}>
                          {t._emp_id ? (
                            <EntityLink kind="employer" id={t._emp_id}>
                              {t._emp_name || t._emp_email || "—"}
                            </EntityLink>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                        <td className="p-3 text-slate-300 text-sm">{t._emp_email || "—"}</td>
                        <td className="p-3 font-medium text-white">{t.type}</td>
                        <td className="p-3 font-mono font-bold text-[#E7C768]">{t.amount_rr}</td>
                        <td className="p-3 max-w-[320px] truncate text-slate-200" title={t.note || ""}>
                          {t.note}
                        </td>
                      </tr>
                    ))}
                    {txRows.length === 0 && (
                      <tr>
                        <td colSpan={6} className="p-6 text-center text-slate-300">
                          Нет транзакций
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <TablePaginationBar
                page={txPage}
                total={txTotal}
                loading={txLoading}
                onPageChange={setTxPage}
              />
            </div>
          </>
        )}
      </div>

      {modalData.employer && (
        <ConfirmBalanceChangeModal
          open={modalData.open}
          onClose={() => setModalData({ open: false, employer: null, delta: 0 })}
          employerName={
            modalData.employer.name ||
            modalData.employer.email ||
            `Клиент #${modalData.employer.public_id}`
          }
          employerId={modalData.employer.id}
          currentBalance={Number(modalData.employer.balance || 0)}
          delta={modalData.delta}
          onConfirm={handleConfirmAdjust}
          busy={busy}
        />
      )}

      <DetailsModal
        title="Транзакция"
        data={selectedTx}
        table="transactions"
        labels={RU_LABELS.transactions}
        onClose={() => setSelectedTx(null)}
        onSaved={() => loadTxPage(txPage)}
      />
    </div>
  );
}

export function SimpleTable({ table, title }: { table: string; title: string }) {
  const [rows, setRows] = useState<any[]>([]);
  const [mobileRows, setMobileRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [mobileHasMore, setMobileHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selected, setSelected] = useState<any | null>(null);

  useEffect(() => {
    setPage(0);
    setRows([]);
    setMobileRows([]);
    setTotal(0);
    setMobileHasMore(false);
  }, [table]);

  const loadPage = async (pageIdx: number) => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/table/${encodeURIComponent(table)}?limit=${ADMIN_PAGE_SIZE}&offset=${pageIdx * ADMIN_PAGE_SIZE}`,
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
      console.error("SimpleTable load error:", e);
    } finally {
      setLoading(false);
    }
  };

  const loadMoreMobile = async () => {
    if (loadingMore || !mobileHasMore) return;
    setLoadingMore(true);
    try {
      const res = await fetch(
        `/api/admin/table/${encodeURIComponent(table)}?limit=${ADMIN_PAGE_SIZE}&offset=${mobileRows.length}`,
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
  }, [table, page]);

  const sampleRow = rows[0] || mobileRows[0];
  const cols = sampleRow ? Object.keys(sampleRow).slice(0, 8) : [];
  const lbls = RU_LABELS[table] || {};

  return (
    <div className="space-y-4">
      <div className={`${GLASS_CARD_CLASS} p-4 flex items-center justify-between`}>
        <h2 className={`text-base sm:text-lg font-bold ${GOLD_TEXT_CLASS}`}>
          {title} — {total}
        </h2>
      </div>

      {loading ? (
        <div className="text-center py-12 text-white text-sm flex items-center justify-center gap-2">
          <Loader2 className="w-5 h-5 animate-spin text-[#E7C768]" /> Загрузка...
        </div>
      ) : rows.length === 0 && mobileRows.length === 0 ? (
        <div className={`text-center py-12 text-slate-300 text-sm ${GLASS_CARD_CLASS}`}>
          Нет данных
        </div>
      ) : (
        <>
          <div className="md:hidden space-y-2.5">
            {mobileRows.map((r, i) => (
              <div
                key={r.id || i}
                onClick={() => setSelected(r)}
                className={`${GLASS_CARD_CLASS} p-4 space-y-1.5 cursor-pointer hover:border-[#E7C768] transition`}
              >
                {cols.slice(0, 4).map((c) => {
                  const v = r[c];
                  const str =
                    v === null || v === undefined
                      ? "—"
                      : typeof v === "object"
                      ? JSON.stringify(v).slice(0, 60)
                      : String(v).slice(0, 80);
                  return (
                    <div key={c} className="text-sm flex justify-between gap-2">
                      <span className="text-slate-300 shrink-0">{lbls[c] || c}:</span>
                      <span className="text-white font-medium break-all text-right">{str}</span>
                    </div>
                  );
                })}
              </div>
            ))}
            <InfiniteScrollTrigger
              hasMore={mobileHasMore}
              loading={loadingMore}
              loadedCount={mobileRows.length}
              total={total}
              onLoadMore={loadMoreMobile}
            />
          </div>

          <div className="hidden md:block space-y-3">
            <div className={`${GLASS_CARD_CLASS} overflow-hidden`}>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-transparent border-b border-white/15 text-[#E7C768] text-sm font-semibold">
                    <tr>
                      {cols.map((c) => (
                        <th key={c} className="p-3" title={c}>
                          {lbls[c] || c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {rows.map((r, i) => (
                      <tr
                        key={r.id || i}
                        className="hover:bg-white/5 cursor-pointer transition"
                        onClick={() => setSelected(r)}
                      >
                        {cols.map((c) => {
                          const v = r[c];
                          const str =
                            v === null || v === undefined
                              ? "—"
                              : typeof v === "object"
                              ? JSON.stringify(v).slice(0, 60)
                              : String(v).slice(0, 80);
                          return (
                            <td key={c} className="p-3 align-top text-white">
                              {str}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
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
        title={title}
        data={selected}
        table={table}
        labels={RU_LABELS[table]}
        omitKeys={OMIT_KEYS[table]}
        onClose={() => setSelected(null)}
        onSaved={() => {
          setSelected(null);
          loadPage(page);
        }}
      />
    </div>
  );
}
