import React, { useEffect, useState } from "react";
import {
  CheckCircle2,
  GraduationCap,
  Loader2,
  Minus,
  Plus,
  RefreshCw,
  Save,
  Sparkles,
  Users2,
} from "lucide-react";
import { dbClient } from "@/lib/dbClient";
import {
  GLASS_CARD_CLASS,
  GOLD_BUTTON_CLASS,
  GOLD_TEXT_CLASS,
  safeArray,
  useEntityNav,
} from "../panel/adminConfig";
import { ADMIN_PAGE_SIZE, InfiniteScrollTrigger } from "../panel/PaginationControls";

export function CompaniesListSection() {
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const { openEntity } = useEntityNav();

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(searchInput.trim());
    }, 280);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const load = async (offsetVal: number, append: boolean) => {
    if (append) setLoadingMore(true);
    else setLoading(true);

    let q = (dbClient as any)
      .from("companies")
      .select("id, name, public_id, industry, status, is_published, owner_employer_id, created_at", {
        count: "exact",
      })
      .order("created_at", { ascending: false })
      .range(offsetVal, offsetVal + ADMIN_PAGE_SIZE - 1);

    if (searchQuery) {
      const safe = searchQuery.replace(/[,%()]/g, " ").trim();
      if (safe) {
        q = q.or(`name.ilike.%${safe}%,industry.ilike.%${safe}%,public_id.ilike.%${safe}%`);
      }
    }

    const { data, count } = await q;
    const list = (data as any[]) || [];
    const cnt = Number(count ?? (append ? rows.length + list.length : list.length));

    setRows((prev) => (append ? [...prev, ...list] : list));
    setTotal(cnt);
    setHasMore(offsetVal + list.length < cnt);

    if (append) setLoadingMore(false);
    else setLoading(false);
  };

  useEffect(() => {
    load(0, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  return (
    <div className="space-y-4">
      <div className={`${GLASS_CARD_CLASS} p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3`}>
        <h2 className={`text-base sm:text-lg font-bold ${GOLD_TEXT_CLASS}`}>
          Компании — {total}
        </h2>
        <input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Поиск по названию / отрасли / номеру…"
          className="w-full sm:w-72 bg-transparent text-sm text-white px-3.5 py-2 rounded-xl border border-white/20 focus:outline-none focus:border-[#E7C768] placeholder:text-slate-300"
        />
      </div>

      {loading ? (
        <div className="text-center py-12 text-white text-sm flex items-center justify-center gap-2">
          <Loader2 className="w-5 h-5 animate-spin text-[#E7C768]" /> Загрузка...
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {rows.map((r) => (
              <div
                key={r.id}
                onClick={() => openEntity("company", r.id)}
                className="bg-transparent backdrop-blur-xl border border-white/20 rounded-2xl p-4 cursor-pointer hover:border-[#E7C768] transition"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="text-sm font-bold text-white break-words">
                      {r.name || `Компания #${r.public_id}`}
                    </div>
                    <div className="text-sm text-slate-200 break-words">{r.industry || "—"}</div>
                    <div className="text-sm text-slate-300 font-mono">#{r.public_id}</div>
                  </div>
                  <span
                    className={`text-sm px-2.5 py-0.5 rounded-full font-semibold border shrink-0 ${
                      r.is_published
                        ? "border-[#E7C768] text-[#F4EE8E]"
                        : "border-white/25 text-slate-200"
                    }`}
                  >
                    {r.is_published ? "Опубл." : r.status || "Черновик"}
                  </span>
                </div>
              </div>
            ))}
            {rows.length === 0 && (
              <div className={`col-span-full text-center py-12 text-slate-300 text-sm ${GLASS_CARD_CLASS}`}>
                Ничего не найдено
              </div>
            )}
          </div>
          <InfiniteScrollTrigger
            hasMore={hasMore}
            loading={loadingMore}
            loadedCount={rows.length}
            total={total}
            onLoadMore={() => load(rows.length, true)}
          />
        </>
      )}
    </div>
  );
}

export function VacanciesAnalyticsSection() {
  const [projects, setProjects] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const { openEntity } = useEntityNav();

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(searchInput.trim());
    }, 280);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const load = async (offsetVal: number, append: boolean) => {
    if (append) setLoadingMore(true);
    else setLoading(true);

    const { data } = await dbClient.rpc("admin_vacancies_analytics_page" as any, {
      _limit: ADMIN_PAGE_SIZE,
      _offset: offsetVal,
      _search: searchQuery,
    });
    const list = safeArray((data as any)?.items);
    const cnt = Number((data as any)?.total ?? list.length);
    setProjects((prev) => (append ? [...prev, ...list] : list));
    setTotal(cnt);
    setHasMore(Boolean((data as any)?.hasMore));

    if (append) setLoadingMore(false);
    else setLoading(false);
  };

  useEffect(() => {
    load(0, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  return (
    <div className="space-y-4">
      <div className={`${GLASS_CARD_CLASS} p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3`}>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className={`text-base sm:text-lg font-bold ${GOLD_TEXT_CLASS}`}>
            Вакансии — {total}
          </h2>
          <span className="text-sm font-medium text-[#F4EE8E]">В реальном времени</span>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Поиск по роли / компании / номеру…"
            className="w-full sm:w-72 bg-transparent text-sm text-white px-3.5 py-2 rounded-xl border border-white/20 focus:outline-none focus:border-[#E7C768] placeholder:text-slate-300"
          />
          <button
            type="button"
            onClick={() => load(0, false)}
            className="w-full sm:w-auto px-3.5 py-2 rounded-xl border border-white/20 hover:border-[#E7C768] text-sm text-white font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 text-[#E7C768] ${loading ? "animate-spin" : ""}`} />
            <span>Обновить</span>
          </button>
        </div>
      </div>

      {loading && projects.length === 0 ? (
        <div className="text-center py-12 text-white text-sm flex items-center justify-center gap-2">
          <Loader2 className="w-5 h-5 animate-spin text-[#E7C768]" /> Загрузка…
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {projects.map((p, pIdx) => {
              const st = p.stats || {
                registrations: 0,
                screening: 0,
                checklist: 0,
                situations: 0,
                training: 0,
                sumScore: 0,
                scoreCount: 0,
              };
              const avg = st.scoreCount > 0 ? Math.round(st.sumScore / st.scoreCount) : null;
              return (
                <div
                  key={`${p.id}-${pIdx}`}
                  onClick={() => openEntity("project", p.id)}
                  className="bg-transparent backdrop-blur-xl border border-white/20 rounded-2xl p-4 cursor-pointer hover:border-[#E7C768] transition"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="text-sm font-bold text-white break-words">
                        {p.role_name || "—"}
                      </div>
                      <div className="text-sm text-slate-200 break-words">{p.company_name || "—"}</div>
                      <div className="text-sm text-slate-300 font-mono">#{p.public_id}</div>
                    </div>
                    <span
                      className={`text-sm px-2.5 py-0.5 rounded-full font-semibold border shrink-0 ${
                        p.is_published
                          ? "border-[#E7C768] text-[#F4EE8E]"
                          : "border-white/25 text-slate-200"
                      }`}
                    >
                      {p.is_published ? "Опубл." : p.status || "Черновик"}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 mt-3 text-center">
                    {[
                      { label: "Регистр.", value: st.registrations, gold: false },
                      { label: "Скрининг", value: st.screening, gold: false },
                      { label: "Чек-лист", value: st.checklist, gold: false },
                      { label: "Ситуации", value: st.situations, gold: true },
                      { label: "Обучений", value: st.training, gold: false },
                      { label: "Ср. балл", value: avg ?? "—", gold: true },
                    ].map((k) => (
                      <div
                        key={k.label}
                        className="bg-transparent rounded-xl px-2 py-2 border border-white/15"
                      >
                        <div
                          className={`text-sm font-bold font-mono ${
                            k.gold ? "text-[#E7C768]" : "text-white"
                          }`}
                        >
                          {k.value}
                        </div>
                        <div className="text-sm text-slate-300 truncate">{k.label}</div>
                      </div>
                    ))}
                  </div>

                  <VacancyLimitsEditor project={p} onSaved={() => load(0, false)} />
                </div>
              );
            })}
            {projects.length === 0 && (
              <div className={`col-span-full text-center py-12 text-slate-300 text-sm ${GLASS_CARD_CLASS}`}>
                Ничего не найдено
              </div>
            )}
          </div>
          <InfiniteScrollTrigger
            hasMore={hasMore}
            loading={loadingMore}
            loadedCount={projects.length}
            total={total}
            onLoadMore={() => load(projects.length, true)}
          />
        </>
      )}
    </div>
  );
}

function VacancyLimitsEditor({ project, onSaved }: { project: any; onSaved: () => void }) {
  const [iLim, setILim] = useState<number>(Number(project.interview_limit ?? 0));
  const [tLim, setTLim] = useState<number>(Number(project.training_limit ?? 0));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const iUsed = Number(project.interview_used ?? 0);
  const tUsed = Number(project.training_used ?? 0);

  useEffect(() => {
    setILim(Number(project.interview_limit ?? 0));
    setTLim(Number(project.training_limit ?? 0));
  }, [project.id, project.interview_limit, project.training_limit]);

  const dirty =
    iLim !== Number(project.interview_limit ?? 0) ||
    tLim !== Number(project.training_limit ?? 0);

  const save = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setErrorMsg("");
    if (iLim < iUsed || tLim < tUsed) {
      setErrorMsg("Лимит не может быть меньше уже использованного");
      return;
    }
    setSaving(true);
    try {
      const { error } = await (dbClient as any)
        .from("projects")
        .update({
          interview_limit: Math.max(0, Math.floor(iLim)),
          training_limit: Math.max(0, Math.floor(tLim)),
        })
        .eq("id", project.id);
      if (error) throw error;
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
      onSaved();
    } catch (err: any) {
      setErrorMsg(err?.message || "Ошибка сохранения лимитов");
    } finally {
      setSaving(false);
    }
  };

  const Row = ({ Icon, label, used, value, set }: any) => (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-1.5 min-w-0">
        <Icon className="w-4 h-4 text-[#E7C768] shrink-0" />
        <span className="text-sm text-slate-200 font-medium">{label}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            set(Math.max(used, value - 1));
          }}
          disabled={value <= used}
          className="w-8 h-8 rounded-lg bg-transparent border border-white/25 hover:border-[#E7C768] text-white disabled:opacity-30 inline-flex items-center justify-center cursor-pointer"
        >
          <Minus className="w-4 h-4" />
        </button>
        <input
          type="number"
          min={used}
          max={100000}
          value={value}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => set(Math.max(used, Math.min(100000, Number(e.target.value) || 0)))}
          className="w-16 bg-transparent text-white border border-white/25 rounded-lg text-sm font-bold text-center py-1 focus:outline-none focus:border-[#E7C768]"
        />
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            set(value + 1);
          }}
          className="w-8 h-8 rounded-lg bg-transparent border border-white/25 hover:border-[#E7C768] text-white inline-flex items-center justify-center cursor-pointer"
        >
          <Plus className="w-4 h-4" />
        </button>
        <span className="text-sm text-slate-300 ml-1">
          исп. <b className="text-white">{used}</b>
        </span>
      </div>
    </div>
  );

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="mt-3 bg-transparent border border-[#E7C768]/35 rounded-xl p-3 space-y-2.5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-bold text-[#E7C768] inline-flex items-center gap-1.5">
          <Sparkles className="w-4 h-4" /> Лимиты RR по вакансии
        </span>
        {iLim === 0 && tLim === 0 && (
          <span className="text-sm font-semibold border border-white/25 text-slate-200 rounded-full px-2.5 py-0.5">
            не заданы
          </span>
        )}
      </div>
      <Row Icon={Users2} label="Интервью" used={iUsed} value={iLim} set={setILim} />
      <Row Icon={GraduationCap} label="Обучение" used={tUsed} value={tLim} set={setTLim} />
      {errorMsg && <div className="text-sm text-[#F4EE8E]">{errorMsg}</div>}
      {dirty && (
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className={`w-full px-3 py-2 rounded-xl text-sm inline-flex items-center justify-center gap-1.5 disabled:opacity-60 ${GOLD_BUTTON_CLASS}`}
        >
          {saving ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" /> Сохраняем…
            </>
          ) : (
            <>
              <Save className="w-4 h-4" /> Сохранить лимиты
            </>
          )}
        </button>
      )}
      {saved && (
        <div className="text-sm text-[#F4EE8E] inline-flex items-center gap-1.5">
          <CheckCircle2 className="w-4 h-4 text-[#E7C768]" /> Сохранено
        </div>
      )}
    </div>
  );
}
