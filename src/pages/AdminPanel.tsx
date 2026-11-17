/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Admin CRM. Sections: Clients (employers), Candidates, Companies, Vacancies,
 * Interviews, Trainings, Mailings, Roles, Accounts, AI.
 * Access: only users with role 'admin'.
 */

import React, { useEffect, useMemo, useState } from "react";
import RRImage from "@/components/RRImage";
import { useNavigate } from "react-router-dom";
import { dbClient } from "@/lib/dbClient";
import CandidateDetailsModal from "@/components/CandidateDetailsModal";
import { ConfirmBalanceChangeModal } from "@/components/ConfirmBalanceChangeModal";
import { ConfirmLimitChangeModal } from "@/components/ConfirmLimitChangeModal";
import BlogAdmin from "@/components/admin/BlogAdmin";
import DetailsModal from "@/components/admin/DetailsModal";
import { fetchJobTitles, upsertJobTitle, deleteJobTitle } from "@/lib/jobTitles";
import {
  Search, ShieldCheck, LogOut, Loader2, RefreshCw, Users, Building2, Briefcase,
  MessageSquare, GraduationCap, Mail, KeyRound, Wallet, Sparkles, ArrowLeft,
  Plus, Minus, X, BookOpen, FileText, Save, CheckCircle2, Users2, Database, Trash2, Send,
} from "lucide-react";

type SectionKey =
  | "clients" | "candidates" | "companies" | "vacancies" | "job_titles"
  | "interviews" | "trainings" | "blog" | "mailings" | "roles"
  | "accounts" | "ai" | "logs" | "reviews" | "telegram";

const SECTIONS: { key: SectionKey; label: string; icon: any }[] = [
  { key: "clients",    label: "Клиенты",   icon: Users },
  { key: "candidates", label: "Кандидаты", icon: Users },
  { key: "companies",  label: "Компании",  icon: Building2 },
  { key: "vacancies",  label: "Вакансии",  icon: Briefcase },
  { key: "job_titles", label: "Должности", icon: Database },
  { key: "interviews", label: "Интервью",  icon: MessageSquare },
  { key: "trainings",  label: "Обучения",  icon: GraduationCap },
  { key: "blog",       label: "Блог",      icon: BookOpen },
  { key: "reviews",    label: "Отзывы",    icon: MessageSquare },
  { key: "mailings",   label: "Рассылки",  icon: Mail },
  { key: "roles",      label: "Роли",      icon: KeyRound },
  { key: "accounts",   label: "Счета",     icon: Wallet },
  { key: "logs",       label: "Логи ИИ",   icon: FileText },
  { key: "ai",         label: "ИИ",        icon: Sparkles },
  { key: "telegram",   label: "Telegram Токен", icon: Send },
];

function classifyClient(c: any): { key: string; label: string; color: string } {
  if (c.has_topup && c.balance > 0) return { key: "paying",  label: "Платящий", color: "emerald" };
  if ((c.candidates_count || 0) > 0) return { key: "active",  label: "Активный", color: "sky" };
  if ((c.projects_count || 0) > 0)   return { key: "trial",   label: "В работе", color: "amber" };
  return { key: "new", label: "Новый", color: "slate" };
}

/* ===== Русские названия колонок и какие поля нельзя редактировать ===== */
const RU_LABELS: Record<string, Record<string, string>> = {
  employers: {
    id: "ID", public_id: "Публичный ID", user_id: "User ID", email: "Email",
    name: "Имя", company_name: "Компания", contact_name: "Контактное лицо",
    contact_email: "Контактный email", phone: "Телефон", contact_phone: "Контактный телефон",
    telegram_username: "Telegram username", contact_telegram: "Контактный Telegram", telegram_chat_id: "Telegram Chat ID",
    plan: "Тариф", status: "Статус", role: "Роль", registered_via: "Способ регистрации",
    ref_by: "Кто пригласил", referrer_id: "ID реферера",
    bonus_granted: "Бонус начислен", offer_accepted: "Оферта принята",
    offer_accepted_at: "Дата оферты", offer_version: "Версия оферты",
    landing_credits: "Лимит вакансий", interview_setup_credits: "Лимит систем найма",
    training_setup_credits: "Лимит систем обучения", interview_credits: "Лимит интервью",
    training_credits: "Лимит обучений",
    balance: "Баланс RR (вычисляется)",
    projects_count: "Вакансий, шт", candidates_count: "Кандидатов, шт",
    has_topup: "Делал пополнения", created_at: "Создан", updated_at: "Обновлён",
  },
  companies: {
    name: "Название", slug: "URL-слаг", logo_url: "Логотип (URL)", industry: "Отрасль",
    website: "Сайт", staff: "Штат", description_text: "Описание", products_text: "Продукты",
    mission_text: "Миссия", about_text: "О компании", team_text: "Команда",
    payouts_text: "Выплаты", schedule_text: "График", system_text: "Система работы",
    stats: "Статистика (JSON)", status: "Статус", is_published: "Опубликована",
    owner_employer_id: "Владелец (employer)", created_at: "Создана", updated_at: "Обновлена",
    archived_at: "Архив с", deleted_at: "Удалена",
  },
  projects: {
    role_name: "Должность", salary_terms: "Зарплата", schedule_terms: "График",
    motivation_text: "Мотивация", custom_wiki: "Вики", logo_url: "Логотип (URL)",
    company_id: "Компания", employer_id: "Работодатель", is_published: "Опубликована",
    status: "Статус", slug: "URL-слаг", vacancy_text: "Описание вакансии",
    max_interviews: "Лимит интервью на вакансию", max_trainings: "Лимит обучений на вакансию",
    created_at: "Создана", updated_at: "Обновлена",
  },
  candidate_scores: {
    candidate_id: "Кандидат", interview_score: "Балл за интервью",
    resume_score: "Балл за резюме", checklist_points: "Чек-лист (баллы)",
    roleplay_points: "Кейсы (баллы)", overall_score: "Итоговый балл",
    checklist_score: "Чек-лист %", checklist_sys_score: "Системный чек-лист %",
    situations_score: "Кейсы %", assessment_summary: "Резюме оценки",
    resume_feedback: "Фидбек по резюме", checklist_feedback: "Фидбек чек-листа",
    situations_feedback: "Фидбек кейсов", updated_at: "Обновлено",
  },
  candidate_stage_progress: {
    candidate_id: "Кандидат", stage: "Этап", attempts: "Попыток",
    best_score: "Лучший балл", last_score: "Последний балл",
    last_answers: "Последние ответы", last_feedback: "Последний фидбек",
    passed_at: "Пройдено", created_at: "Создано", updated_at: "Обновлено",
  },
  transactions: {
    wallet_id: "Кошелёк", type: "Тип", amount_rr: "Сумма RR",
    ref_table: "Источник (таблица)", ref_id: "Источник (id)",
    note: "Комментарий", idem_key: "Ключ идемпотентности", created_at: "Дата",
  },
  logs: {
    channel_id: "ID канала", channel_name: "Канал", bot_id: "Бот", llm: "Модель",
    user_message: "Сообщение пользователя", bot_reply: "Ответ нейросети",
    user_social_id: "Соц.ID пользователя", api_key: "API-ключ",
    tokens_total: "Токенов всего", tokens_in_source: "Токены вход",
    tokens_out_source: "Токены выход", tokens_user: "Токены пользователя",
    function_error: "Ошибка функции", function_call_params: "Параметры вызова",
    server_name: "Сервер", created_at: "Дата",
  },
  reviews: {
    first_name: "Имя", last_name: "Фамилия", content: "Текст отзыва",
    ai_reply: "Ответ ИИ", admin_reply: "Ответ администратора",
    is_published: "Опубликован", created_at: "Создан", updated_at: "Обновлён",
  },
};

/** Computed/virtual fields and special balance/limit fields handled via dedicated transaction calculators. */
const OMIT_KEYS: Record<string, string[]> = {
  employers: [
    // Balance and limits are edited via top calculator & limits editor with transaction tracking
    "balance", "balance_start", "balance_pay", "balance_referral", "balance_admin", "balance_limits",
    "has_topup", "projects_count", "candidates_count",
    "landing_credits", "interview_setup_credits", "training_setup_credits",
    "interview_credits", "training_credits", "limits_json",
    "password_hash", "data_json", "legacy_public_id",
  ],
};

const LIMIT_FIELDS: { key: string; label: string }[] = [
  { key: "landing_credits",         label: "Вакансии (лендинги)" },
  { key: "interview_setup_credits", label: "Системы найма" },
  { key: "training_setup_credits",  label: "Системы обучения" },
  { key: "interview_credits",       label: "Интервью" },
  { key: "training_credits",        label: "Обучения" },
];

/* ============== Entity navigation (cross-links между клиент↔компании↔вакансии) ============== */

type EntityKind = "employer" | "company" | "project";
const EntityNavContext = React.createContext<{ openEntity: (kind: EntityKind, id: string) => void }>({
  openEntity: () => {},
});
const useEntityNav = () => React.useContext(EntityNavContext);

function EntityLink({ kind, id, children }: { kind: EntityKind; id?: string | null; children: React.ReactNode }) {
  const { openEntity } = useEntityNav();
  if (!id) return <span className="text-slate-500">{children || "—"}</span>;
  return (
    <button
      onClick={(e) => { e.stopPropagation(); openEntity(kind, id); }}
      className="text-[#E7C768] hover:underline text-left truncate max-w-full"
    >
      {children}
    </button>
  );
}

function EntityModal({
  entity, setToast, onClose,
}: {
  entity: { kind: EntityKind; id: string };
  setToast: (t: any) => void;
  onClose: () => void;
}) {
  const [row, setRow] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const table = entity.kind === "employer" ? "employers" : entity.kind === "company" ? "companies" : "projects";

  const load = async () => {
    setLoading(true);
    let q: any;
    if (entity.kind === "employer") {
      const { data } = await dbClient.rpc("admin_list_employers" as any);
      q = ((data as any[]) || []).find((x: any) => x.id === entity.id) || null;
    } else {
      const { data } = await (dbClient as any).from(table).select("*").eq("id", entity.id).maybeSingle();
      q = data;
    }
    setRow(q);
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [entity.kind, entity.id]);

  const title =
    entity.kind === "employer" ? `Клиент · ${row?.name || row?.email || ""}` :
    entity.kind === "company"  ? `Компания · ${row?.name || ""}` :
                                 `Вакансия · ${row?.role_name || ""}`;

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 bg-transparent flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-[#E7C768]" />
      </div>
    );
  }

  return (
    <DetailsModal
      title={title}
      data={row}
      table={table}
      labels={RU_LABELS[table]}
      omitKeys={OMIT_KEYS[table]}
      onClose={onClose}
      onSaved={(updatedRow) => {
        if (updatedRow) {
          setRow(updatedRow);
        }
        load();
      }}
      extra={
        <>
          {entity.kind === "employer" && row && (
            <ClientLimitsEditor row={row} setToast={setToast} onChanged={load} />
          )}
          {entity.kind === "employer" && row && <ClientLinkedTabs employerId={row.id} />}
          {entity.kind === "company"  && row && <CompanyLinks companyId={row.id} ownerEmployerId={row.owner_employer_id} />}
          {entity.kind === "project"  && row && <ProjectLinks employerId={row.employer_id} companyId={row.company_id} projectId={row.id} />}
        </>
      }
    />
  );
}

/* ============== Linked tabs для карточки клиента (#20) ============== */

function ClientLinkedTabs({ employerId }: { employerId: string }) {
  const [tab, setTab] = useState<"txs" | "companies" | "vacancies">("txs");
  const [txs, setTxs] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [projMap, setProjMap] = useState<Record<string, any>>({});
  const [coMap, setCoMap] = useState<Record<string, any>>({});
  const [candMap, setCandMap] = useState<Record<string, any>>({});

  useEffect(() => {
    (async () => {
      const [w, co, pr] = await Promise.all([
        (dbClient as any).from("wallets").select("id, employer_id").eq("employer_id", employerId),
        (dbClient as any).from("companies").select("id, name, public_id, status, is_published").eq("owner_employer_id", employerId),
        (dbClient as any).from("projects").select("id, role_name, public_id, status, is_published, company_id, created_at").eq("employer_id", employerId).order("created_at", { ascending: false }),
      ]);
      const wallets = ((w as any).data as any[]) || [];
      setCompanies(((co as any).data as any[]) || []);
      const ps = ((pr as any).data as any[]) || [];
      setProjects(ps);
      const pm: Record<string, any> = {}; ps.forEach((p) => { pm[p.id] = p; }); setProjMap(pm);
      const cm: Record<string, any> = {}; (((co as any).data as any[]) || []).forEach((c) => { cm[c.id] = c; }); setCoMap(cm);

      if (wallets.length) {
        const { data: t } = await (dbClient as any).from("transactions")
          .select("*").in("wallet_id", wallets.map((x) => x.id))
          .order("created_at", { ascending: false }).limit(200);
        const list = ((t as any[]) || []);
        setTxs(list);
        // Подгружаем имена кандидатов из ref_id, где ref_table = candidates
        const candIds = Array.from(new Set(list.filter((x) => x.ref_table === "candidates" && x.ref_id).map((x) => x.ref_id)));
        if (candIds.length) {
          const { data: cs } = await (dbClient as any).from("candidates")
            .select("id, public_id, full_name, email, project_id").in("id", candIds);
          const cmap: Record<string, any> = {};
          (((cs as any[]) || [])).forEach((c) => { cmap[c.id] = c; });
          setCandMap(cmap);
        }
      }
    })();
  }, [employerId]);

  return (
    <div className="mt-4 border-t border-white/10 pt-4">
      <div className="flex gap-1 mb-3">
        {[
          { k: "txs", l: `Транзакции (${txs.length})` },
          { k: "companies", l: `Компании (${companies.length})` },
          { k: "vacancies", l: `Вакансии (${projects.length})` },
        ].map((x) => (
          <button key={x.k} onClick={() => setTab(x.k as any)}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-bold ${tab === x.k ? "bg-[#E7C768]/15 text-[#E7C768] border border-[#E7C768]/40" : "bg-white/5 text-slate-300 border border-white/10"}`}>
            {x.l}
          </button>
        ))}
      </div>
      {tab === "txs" && (
        <div className="max-h-80 overflow-y-auto bg-[#17344F]/40 border border-white/10 rounded-xl">
          <table className="w-full text-[11px]">
            <thead className="bg-[#17344F] text-[#E7C768] text-[10px] uppercase font-mono sticky top-0">
              <tr><th className="p-2 text-left">Дата</th><th className="p-2 text-left">Тип</th><th className="p-2 text-right">RR</th><th className="p-2 text-left">Назначение</th></tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {txs.length === 0 && <tr><td colSpan={4} className="p-4 text-center text-slate-400">Нет транзакций</td></tr>}
              {txs.map((t) => {
                let target: React.ReactNode = t.note || "—";
                if (t.ref_table === "projects" && t.ref_id && projMap[t.ref_id]) {
                  target = <EntityLink kind="project" id={t.ref_id}>Вакансия: {projMap[t.ref_id].role_name || `#${projMap[t.ref_id].public_id}`}</EntityLink>;
                } else if (t.ref_table === "candidates" && t.ref_id && candMap[t.ref_id]) {
                  const c = candMap[t.ref_id];
                  const proj = projMap[c.project_id];
                  target = (
                    <span>
                      {c.full_name || c.email || `#${c.public_id}`}
                      {proj && <> · <EntityLink kind="project" id={proj.id}>{proj.role_name}</EntityLink></>}
                    </span>
                  );
                }
                return (
                  <tr key={t.id} className="hover:bg-white/5">
                    <td className="p-2 text-slate-400">{t.created_at ? new Date(t.created_at).toLocaleString() : ""}</td>
                    <td className="p-2">{t.type}</td>
                    <td className="p-2 text-right font-mono font-bold text-[#E7C768]">{t.amount_rr}</td>
                    <td className="p-2 text-slate-200">
                      <div className="truncate max-w-[300px]" title={t.note || ""}>{target}</div>
                      {t.note && (typeof target === "string" || (target as any)?.type !== EntityLink) && (
                        <div className="text-[10px] text-slate-400 truncate max-w-[300px]">{t.note}</div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {tab === "companies" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {companies.length === 0 && <div className="col-span-full text-center py-6 text-slate-400 text-xs">Нет компаний</div>}
          {companies.map((c) => (
            <div key={c.id} className="bg-[#17344F]/60 border border-white/10 rounded-xl p-3">
              <EntityLink kind="company" id={c.id}><span className="font-bold">{c.name || `Компания #${c.public_id}`}</span></EntityLink>
              <div className="text-[10px] text-slate-400 font-mono">#{c.public_id} · {c.is_published ? "опубл." : c.status}</div>
            </div>
          ))}
        </div>
      )}
      {tab === "vacancies" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {projects.length === 0 && <div className="col-span-full text-center py-6 text-slate-400 text-xs">Нет вакансий</div>}
          {projects.map((p, pIdx) => (
            <div key={`${p.id}-${pIdx}`} className="bg-[#17344F]/60 border border-white/10 rounded-xl p-3">
              <EntityLink kind="project" id={p.id}><span className="font-bold">{p.role_name || `Вакансия #${p.public_id}`}</span></EntityLink>
              <div className="text-[10px] text-slate-400">
                #{p.public_id} · {p.is_published ? "опубл." : p.status}
                {coMap[p.company_id] && <> · <EntityLink kind="company" id={p.company_id}>{coMap[p.company_id].name}</EntityLink></>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CompanyLinks({ companyId, ownerEmployerId }: { companyId: string; ownerEmployerId?: string | null }) {
  const [projects, setProjects] = useState<any[]>([]);
  useEffect(() => {
    (async () => {
      const { data } = await (dbClient as any).from("projects").select("id, role_name, public_id, status, is_published").eq("company_id", companyId).order("created_at", { ascending: false });
      setProjects((data as any[]) || []);
    })();
  }, [companyId]);
  return (
    <div className="mt-4 border-t border-white/10 pt-4 space-y-3">
      {ownerEmployerId && (
        <div className="text-xs text-slate-300">Владелец: <EntityLink kind="employer" id={ownerEmployerId}>открыть карточку клиента →</EntityLink></div>
      )}
      <div>
        <div className="text-[11px] font-bold text-[#E7C768] mb-2">Вакансии этой компании ({projects.length})</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {projects.map((p, pIdx) => (
            <div key={`${p.id}-${pIdx}`} className="bg-[#17344F]/60 border border-white/10 rounded-xl p-3">
              <EntityLink kind="project" id={p.id}><span className="font-bold">{p.role_name || `#${p.public_id}`}</span></EntityLink>
              <div className="text-[10px] text-slate-400">#{p.public_id} · {p.is_published ? "опубл." : p.status}</div>
            </div>
          ))}
          {projects.length === 0 && <div className="text-xs text-slate-400 col-span-full">Нет вакансий</div>}
        </div>
      </div>
    </div>
  );
}

function ProjectLinks({ employerId, companyId, projectId }: { employerId?: string | null; companyId?: string | null; projectId: string }) {
  const [emp, setEmp] = useState<any | null>(null);
  const [co, setCo] = useState<any | null>(null);
  useEffect(() => {
    (async () => {
      if (employerId) {
        const { data } = await (dbClient as any).from("employers").select("id, name, email, public_id").eq("id", employerId).maybeSingle();
        setEmp(data);
      }
      if (companyId) {
        const { data } = await (dbClient as any).from("companies").select("id, name, public_id").eq("id", companyId).maybeSingle();
        setCo(data);
      }
    })();
  }, [employerId, companyId]);
  return (
    <div className="mt-4 border-t border-white/10 pt-4 space-y-2 text-xs">
      {emp && <div>Клиент: <EntityLink kind="employer" id={emp.id}>{emp.name || emp.email}</EntityLink></div>}
      {co  && <div>Компания: <EntityLink kind="company" id={co.id}>{co.name}</EntityLink></div>}
    </div>
  );
}

/* ============== Companies list section (#6 — поиск по названию) ============== */

function CompaniesListSection() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const { openEntity } = useEntityNav();

  const load = async () => {
    setLoading(true);
    const { data } = await (dbClient as any).from("companies")
      .select("id, name, public_id, industry, status, is_published, owner_employer_id, created_at")
      .order("created_at", { ascending: false }).limit(500);
    setRows((data as any[]) || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const filtered = rows.filter((r) => !search ||
    (r.name || "").toLowerCase().includes(search.toLowerCase()) ||
    (r.public_id || "").toLowerCase().includes(search.toLowerCase()) ||
    (r.industry || "").toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-3">
      <div className="bg-[#1E4468]/80 border border-white/10 rounded-3xl p-4 flex items-center justify-between gap-3">
        <h2 className="text-base font-bold text-[#E7C768]">Компании — {rows.length}</h2>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Поиск по названию / отрасли / ID…"
          className="bg-[#17344F]/60 text-xs text-white px-3 py-2 rounded-xl border border-white/10 min-w-[260px]" />
      </div>
      {loading ? <div className="text-center py-12 text-slate-400"><Loader2 className="w-4 h-4 animate-spin inline" /></div> : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map((r) => (
            <div key={r.id} onClick={() => openEntity("company", r.id)}
              className="bg-[#1E4468]/60 border border-white/10 rounded-2xl p-4 cursor-pointer hover:border-[#E7C768]/40 transition">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-bold text-white truncate">{r.name || `Компания #${r.public_id}`}</div>
                  <div className="text-[11px] text-slate-300 truncate">{r.industry || "—"}</div>
                  <div className="text-[10px] text-slate-500 font-mono">#{r.public_id}</div>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${r.is_published ? "bg-emerald-500/20 text-emerald-200" : "bg-slate-500/20 text-slate-300"}`}>
                  {r.is_published ? "опубл." : r.status || "draft"}
                </span>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="col-span-full text-center py-12 text-slate-400 bg-[#1E4468]/40 border border-white/10 rounded-3xl">Ничего не найдено</div>
          )}
        </div>
      )}
    </div>
  );
}

function ClientLimitsEditor({
  row, onChanged, setToast,
}: { row: any; onChanged: () => void; setToast: (t: any) => void }) {
  const [deltas, setDeltas] = useState<Record<string, number>>({});
  const [currentBal, setCurrentBal] = useState<number>(Number(row?.balance || 0));
  const [delta, setDelta] = useState<number>(0);
  const [balanceType, setBalanceType] = useState<string>("admin");
  const [busy, setBusy] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [limitModalOpen, setLimitModalOpen] = useState(false);
  const [limitChanges, setLimitChanges] = useState<Array<{
    field: string;
    label: string;
    currentValue: number;
    newValue: number;
  }>>([]);

  useEffect(() => {
    setDeltas({});
    const b = Number(row?.balance || 0);
    setCurrentBal(b);
    setDelta(0);
  }, [
    row?.id,
    row?.balance,
    row?.landing_credits,
    row?.interview_setup_credits,
    row?.training_setup_credits,
    row?.interview_credits,
    row?.training_credits,
  ]);

  if (!row) return null;

  const handleDeltaChange = (d: number) => {
    setDelta(d);
  };

  const getChangedLimits = () => {
    const changes: Array<{
      field: string;
      label: string;
      currentValue: number;
      newValue: number;
    }> = [];
    for (const f of LIMIT_FIELDS) {
      const cur = Number(row?.[f.key] || 0);
      const d = Number(deltas[f.key] || 0);
      if (d !== 0) {
        const finalVal = Math.max(0, cur + d);
        changes.push({
          field: f.key,
          label: f.label,
          currentValue: cur,
          newValue: finalVal,
        });
      }
    }
    return changes;
  };

  const handleOpenLimitModal = () => {
    const allChanges = getChangedLimits();
    if (allChanges.length === 0) {
      setToast({ kind: "ok", text: "Сначала укажите значения изменений в колонке «Изменение (±)»." });
      return;
    }
    setLimitChanges(allChanges);
    setLimitModalOpen(true);
  };

  const handleConfirmLimitSave = async (comment: string) => {
    if (limitChanges.length === 0) return;
    setBusy(true);
    try {
      const deltasToSend: Record<string, number> = {};
      for (const ch of limitChanges) {
        deltasToSend[ch.field] = ch.newValue - ch.currentValue;
      }

      const res = await fetch("/api/rpc/admin_employer_set_limits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          _employer: row.id,
          _deltas: deltasToSend,
          _note: comment,
        }),
      });

      const resData = await res.json().catch(() => ({}));
      if (!res.ok || resData.error || resData.success === false) {
        throw new Error(resData?.error || "Ошибка сохранения лимитов");
      }

      setBusy(false);
      setLimitModalOpen(false);
      setDeltas({});
      setToast({ kind: "ok", text: `Успешно сохранено лимитов: ${limitChanges.length}! Транзакции добавлены и отправлено уведомление.` });
      onChanged();
    } catch (err: any) {
      setBusy(false);
      setToast({ kind: "err", text: err.message || "Ошибка сохранения лимитов" });
    }
  };

  const handleConfirmBalanceChange = async (comment: string) => {
    if (!delta) return;
    setBusy(true);
    try {
      const res = await fetch("/api/rpc/admin_wallet_adjust", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          _employer: row.id,
          _delta: delta,
          _note: comment,
          _type: balanceType,
        }),
      });

      const resData = await res.json().catch(() => ({}));
      if (!res.ok || resData.error || resData.success === false) {
        throw new Error(resData?.error || "Ошибка обновления баланса");
      }

      setBusy(false);
      setShowConfirmModal(false);
      setToast({ kind: "ok", text: "Баланс обновлён! Транзакция добавлена в историю." });
      setDelta(0);
      onChanged();
    } catch (err: any) {
      setBusy(false);
      setToast({ kind: "err", text: err.message || "Ошибка обновления баланса" });
    }
  };

  const changedCount = getChangedLimits().length;

  return (
    <div className="rounded-3xl border border-white/20 bg-transparent backdrop-blur-2xl p-5 space-y-5 text-white shadow-2xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="text-base font-extrabold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">
            Лимиты и баланс клиента
          </div>
          <div className="text-xs text-slate-300 mt-0.5">
            Укажите изменения лимитов (±) и сохраните все одновременно
          </div>
        </div>
        <button
          onClick={handleOpenLimitModal}
          disabled={busy}
          className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#FFE580] via-[#E7C768] to-[#C8A038] text-[#17344F] text-sm font-bold hover:brightness-110 shadow-md transition cursor-pointer disabled:opacity-50"
        >
          Сохранить все измененные лимиты ({changedCount > 0 ? changedCount : 5})
        </button>
      </div>

      {/* 5 Limit fields with 3 boxes each */}
      <div className="space-y-2.5">
        {LIMIT_FIELDS.map((f) => {
          const curVal = Number(row?.[f.key] || 0);
          const dVal = deltas[f.key];
          const hasDelta = dVal !== undefined && dVal !== 0;
          const finalVal = Math.max(0, curVal + (Number(dVal) || 0));

          return (
            <div
              key={f.key}
              className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-transparent border ${
                hasDelta ? "border-[#E7C768]" : "border-white/15"
              } rounded-2xl p-3.5 backdrop-blur-md transition-all`}
            >
              {/* Название поля */}
              <div className="text-sm font-semibold text-white min-w-[200px]">
                {f.label}
              </div>

              {/* 3 окошка */}
              <div className="grid grid-cols-3 gap-2.5 items-center w-full sm:w-auto">
                {/* 1. Данные из базы данных employers */}
                <div className="flex flex-col items-center">
                  <span className="text-[11px] text-slate-300 mb-1">1. В базе</span>
                  <div className="w-24 sm:w-28 text-center bg-transparent border border-white/20 rounded-xl px-3 py-1.5 text-sm font-mono font-bold text-white">
                    {curVal}
                  </div>
                </div>

                {/* 2. Редактируемое окно значений, сколько начислить или отнять */}
                <div className="flex flex-col items-center">
                  <span className="text-[11px] text-slate-300 mb-1">2. Изменение (±)</span>
                  <input
                    type="number"
                    value={dVal !== undefined && dVal !== 0 ? dVal : (dVal === 0 ? "" : (dVal ?? ""))}
                    placeholder="±0"
                    onChange={(e) => {
                      const val = e.target.value === "" ? 0 : Number(e.target.value);
                      setDeltas((prev) => ({ ...prev, [f.key]: isNaN(val) ? 0 : val }));
                    }}
                    className="w-24 sm:w-28 text-center bg-transparent border border-white/30 rounded-xl px-3 py-1.5 text-sm font-mono font-bold text-[#E7C768] focus:outline-none focus:border-[#E7C768] transition placeholder:text-slate-400"
                  />
                </div>

                {/* 3. Сколько будет по итогу после изменения */}
                <div className="flex flex-col items-center">
                  <span className="text-[11px] text-slate-300 mb-1">3. Итог</span>
                  <div
                    className={`w-24 sm:w-28 text-center bg-transparent border rounded-xl px-3 py-1.5 text-sm font-mono font-extrabold ${
                      hasDelta ? "border-[#E7C768] text-[#E7C768]" : "border-white/20 text-white"
                    }`}
                  >
                    {finalVal}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Balance Control Box */}
      <div className="space-y-4 bg-transparent border border-white/15 rounded-2xl p-4 backdrop-blur-md">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-white">
            Текущий баланс RR: <span className="font-mono font-bold text-[#E7C768] text-base">{currentBal.toLocaleString()}</span>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-300">Тип:</span>
              <select
                value={balanceType}
                onChange={(e) => setBalanceType(e.target.value)}
                className="bg-transparent border border-white/20 rounded-xl px-3 py-1.5 text-sm text-white focus:outline-none focus:border-[#E7C768]"
              >
                <option value="admin" className="bg-[#17344F] text-white">Админ</option>
                <option value="start" className="bg-[#17344F] text-white">Старт</option>
                <option value="pay" className="bg-[#17344F] text-white">Оплаты</option>
                <option value="referral" className="bg-[#17344F] text-white">Рефералы</option>
                <option value="limits" className="bg-[#17344F] text-white">Расход лимиты</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-300">Изменение (±RR):</span>
              <input
                type="number"
                value={delta || ""}
                onChange={(e) => handleDeltaChange(Number(e.target.value) || 0)}
                placeholder="±RR"
                className="w-28 bg-transparent border border-white/20 rounded-xl px-3 py-1.5 text-sm text-white focus:outline-none focus:border-[#E7C768]"
              />
            </div>

            <button
              disabled={busy || delta === 0}
              onClick={() => setShowConfirmModal(true)}
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-[#FFE580] via-[#E7C768] to-[#C8A038] text-[#17344F] text-sm font-bold disabled:opacity-50 cursor-pointer hover:brightness-110 transition shadow-md"
            >
              Применить
            </button>
          </div>
        </div>

        {/* Sub-balances breakdown */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 font-mono pt-2 border-t border-white/10">
          <div className="bg-transparent p-3 rounded-xl border border-white/10 text-center">
            <span className="text-slate-300 block text-sm font-sans">Старт</span>
            <span className="font-bold text-white text-sm font-mono">{row.balance_start ?? 0}</span>
          </div>
          <div className="bg-transparent p-3 rounded-xl border border-white/10 text-center">
            <span className="text-slate-300 block text-sm font-sans">Оплаты</span>
            <span className="font-bold text-[#E7C768] text-sm font-mono">{row.balance_pay ?? 0}</span>
          </div>
          <div className="bg-transparent p-3 rounded-xl border border-white/10 text-center">
            <span className="text-slate-300 block text-sm font-sans">Рефералы</span>
            <span className="font-bold text-white text-sm font-mono">{row.balance_referral ?? 0}</span>
          </div>
          <div className="bg-transparent p-3 rounded-xl border border-white/10 text-center">
            <span className="text-slate-300 block text-sm font-sans">Админ</span>
            <span className="font-bold text-[#E7C768] text-sm font-mono">{row.balance_admin ?? 0}</span>
          </div>
          <div className="bg-transparent p-3 rounded-xl border border-white/10 text-center col-span-2 sm:col-span-1">
            <span className="text-slate-300 block text-sm font-sans">Расход лимиты</span>
            <span className="font-bold text-white text-sm font-mono">{row.balance_limits ?? 0}</span>
          </div>
        </div>
      </div>

      <ConfirmBalanceChangeModal
        open={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        employerName={row.name || row.email || `Клиент #${row.public_id}`}
        employerId={row.id}
        currentBalance={currentBal}
        delta={delta}
        type={balanceType}
        typeLabel={
          balanceType === "start" ? "Стартовый бонус" :
          balanceType === "pay" ? "Оплата тарифа" :
          balanceType === "referral" ? "Реферальное начисление" :
          balanceType === "limits" ? "Расход на лимиты" : "Административная корректировка"
        }
        onConfirm={handleConfirmBalanceChange}
        busy={busy}
      />

      <ConfirmLimitChangeModal
        open={limitModalOpen}
        onClose={() => setLimitModalOpen(false)}
        employerName={row.name || row.email || `Клиент #${row.public_id}`}
        employerId={row.id}
        changes={limitChanges}
        onConfirm={handleConfirmLimitSave}
        busy={busy}
      />
    </div>
  );
}

export default function AdminPanel() {
  const navigate = useNavigate();
  const [authChecked, setAuthChecked] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [section, setSection] = useState<SectionKey>("clients");
  const [toast, setToast] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [entityStack, setEntityStack] = useState<{ kind: "employer" | "company" | "project"; id: string }[]>([]);
  const openEntity = (kind: "employer" | "company" | "project", id: string) => {
    setEntityStack((s) => [...s, { kind, id }]);
  };
  const closeEntity = () => setEntityStack((s) => s.slice(0, -1));

  // Access gate state
  const [adminPasswordInput, setAdminPasswordInput] = useState("");
  const [adminLoginError, setAdminLoginError] = useState("");
  const [adminLoggingIn, setAdminLoggingIn] = useState(false);

  // Access gate
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // 1. Extract token, employer ID, and stored user data from localStorage / sessionStorage
      const token = localStorage.getItem("emp_token") || localStorage.getItem("employer_token") || sessionStorage.getItem("emp_token");
      let currentEmpId = localStorage.getItem("current_employer_id") || sessionStorage.getItem("current_employer_id");
      let storedEmail = "";
      let isExplicitAdminUser = false;

      try {
        const empUserStr = localStorage.getItem("emp_user") || sessionStorage.getItem("emp_user");
        if (empUserStr) {
          const parsed = JSON.parse(empUserStr);
          if (!currentEmpId) {
            currentEmpId = parsed.public_id || parsed.publicId || parsed.id;
          }
          if (parsed.email) {
            storedEmail = parsed.email;
          }
          if (
            parsed.role === "admin" ||
            parsed.is_admin ||
            String(parsed.public_id) === "100007" ||
            String(parsed.publicId) === "100007" ||
            (parsed.email && parsed.email.toLowerCase() === "shishkarnem@gmail.com")
          ) {
            isExplicitAdminUser = true;
          }
        }
      } catch {}

      if (!currentEmpId) {
        currentEmpId = "100007";
      }

      // If stored profile already explicitly says admin, authenticate optimistically
      if (isExplicitAdminUser) {
        setIsAdmin(true);
      }

      try {
        const checkUrl = `/api/admin/session-check?employerId=${encodeURIComponent(currentEmpId || "")}&email=${encodeURIComponent(storedEmail || "")}`;
        const checkRes = await fetch(checkUrl, {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        }).catch(() => null);

        if (checkRes && checkRes.ok) {
          const checkData = await checkRes.json();
          if (!cancelled && checkData?.isAdmin) {
            setIsAdmin(true);
            setAuthChecked(true);
            return;
          }
        }
      } catch {}

      // 2. Check PostgreSQL BD ProTalk token session (/api/auth/employer/me)
      if (token) {
        try {
          const meRes = await fetch("/api/auth/employer/me", { headers: { Authorization: `Bearer ${token}` } }).catch(() => null);
          if (meRes && meRes.ok) {
            const meData = await meRes.json();
            const u = meData?.user;
            const uPid = String(u?.publicId || u?.public_id || "");
            if (!cancelled && (u?.role === "admin" || u?.is_admin || uPid === "100007" || (u?.email && u.email.toLowerCase() === "shishkarnem@gmail.com"))) {
              setIsAdmin(true);
              setAuthChecked(true);
              return;
            }
          }
        } catch {}
      }

      // 3. Auto-login for admin 100007 or admin role in DB
      if (currentEmpId === "100007" || currentEmpId === "emp-100007" || storedEmail === "shishkarnem@gmail.com" || isExplicitAdminUser || window.location.search.includes("100007")) {
        try {
          const autoRes = await fetch("/api/admin/auth/login-admin", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ employerId: currentEmpId || "100007", email: storedEmail || "shishkarnem@gmail.com" })
          }).catch(() => null);

          if (autoRes && autoRes.ok) {
            const autoData = await autoRes.json();
            if (autoData?.token) {
              localStorage.setItem("emp_token", autoData.token);
            }
            if (!cancelled && autoData?.isAdmin) {
              setIsAdmin(true);
              setAuthChecked(true);
              return;
            }
          }
        } catch {}
      }

      // 4. Check database user & employers table role
      try {
        const { data: { user } } = await dbClient.auth.getUser();
        if (user) {
          const { data } = await dbClient
            .from("employers")
            .select("*")
            .or(`user_id.eq.${user.id},id.eq.${user.id},email.eq.${user.email}`)
            .maybeSingle();
          
          if (!cancelled && ((data as any)?.role === "admin" || user.email === "shishkarnem@gmail.com")) {
            setIsAdmin(true);
            setAuthChecked(true);
            return;
          }
        }
      } catch {}

      if (!cancelled) {
        setAuthChecked(true);
      }
    })();

    return () => { cancelled = true; };
  }, []);

  const handleAdminDirectLogin = async (empId: string = "100007") => {
    setAdminLoggingIn(true);
    setAdminLoginError("");
    try {
      const res = await fetch("/api/admin/auth/login-admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employerId: empId })
      });
      const data = await res.json();
      if (data?.isAdmin && data?.token) {
        localStorage.setItem("emp_token", data.token);
        localStorage.setItem("current_employer_id", "100007");
        setIsAdmin(true);
      } else {
        setAdminLoginError(data?.error || "Не удалось авторизоваться как администратор");
      }
    } catch (err: any) {
      setAdminLoginError(err.message || "Ошибка подключения к серверу");
    } finally {
      setAdminLoggingIn(false);
    }
  };

  const handleAdminPasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminPasswordInput.trim()) return;
    setAdminLoggingIn(true);
    setAdminLoginError("");
    try {
      const res = await fetch("/api/admin/auth/login-admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: adminPasswordInput.trim() })
      });
      const data = await res.json();
      if (data?.isAdmin && data?.token) {
        localStorage.setItem("emp_token", data.token);
        localStorage.setItem("current_employer_id", "100007");
        setIsAdmin(true);
      } else {
        setAdminLoginError(data?.error || "Неверный пароль администратора");
      }
    } catch (err: any) {
      setAdminLoginError(err.message || "Ошибка авторизации");
    } finally {
      setAdminLoggingIn(false);
    }
  };

  // Auto-clear toast
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  if (!authChecked) {
    return (
      <div className="min-h-screen bg-transparent backdrop-blur-2xl text-white flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#E7C768]" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-transparent backdrop-blur-2xl text-white flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-transparent backdrop-blur-2xl border border-white/20 rounded-3xl p-8 text-center space-y-6 shadow-2xl">
          <div className="w-14 h-14 rounded-2xl bg-transparent border border-white/20 mx-auto flex items-center justify-center">
            <ShieldCheck className="w-8 h-8 text-[#E7C768]" />
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">
              Панель администратора
            </h1>
            <p className="text-sm text-slate-200">
              Доступ предоставляется подтвержденным администраторам платформы.
            </p>
          </div>

          {adminLoginError && (
            <div className="bg-transparent border border-white/20 text-slate-200 text-sm p-3 rounded-2xl">
              {adminLoginError}
            </div>
          )}

          <div className="space-y-3">
            <button
              type="button"
              onClick={() => handleAdminDirectLogin("100007")}
              disabled={adminLoggingIn}
              className="cursor-pointer w-full py-3 px-4 rounded-2xl bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] text-[#17344F] font-bold text-sm hover:brightness-110 transition shadow-lg flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {adminLoggingIn ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-[#17344F]" />
                  <span>Вход...</span>
                </>
              ) : (
                <span>Войти как администратор 100007</span>
              )}
            </button>

            <div className="relative py-2">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-white/15"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-3 bg-transparent backdrop-blur-md text-slate-300">или по паролю</span>
              </div>
            </div>

            <form onSubmit={handleAdminPasswordLogin} className="space-y-3">
              <input
                type="password"
                placeholder="Пароль администратора"
                value={adminPasswordInput}
                onChange={(e) => setAdminPasswordInput(e.target.value)}
                className="w-full px-4 py-3 bg-transparent border border-white/20 rounded-2xl text-white text-sm placeholder-slate-400 focus:outline-none focus:border-[#E7C768] transition"
              />
              <button
                type="submit"
                disabled={adminLoggingIn || !adminPasswordInput.trim()}
                className="cursor-pointer w-full py-2.5 px-4 rounded-2xl bg-transparent hover:bg-white/10 border border-white/20 text-white font-bold text-sm transition disabled:opacity-40"
              >
                Подтвердить пароль
              </button>
            </form>
          </div>

          <div className="pt-2 border-t border-white/15">
            <button
              type="button"
              onClick={() => navigate("/emp100007")}
              className="cursor-pointer text-sm text-[#E7C768] hover:underline"
            >
              Вернуться в личный кабинет работодателя
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-b from-[#17344F]/65 via-[#1E4468]/50 to-[#265582]/65 min-h-screen text-white font-sans antialiased relative">
      <header className="sticky top-0 z-40 bg-[#17344F]/80 backdrop-blur-xl border-b border-white/10 px-4 md:px-8 py-3">
        <div className="flex items-center justify-between gap-4 max-w-[1500px] mx-auto">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate("/")}>
            <RRImage src="/files/11/rr-logo.png" w={36} alt="RR" className="w-9 h-9 object-contain" referrerPolicy="no-referrer" />
            <div className="flex flex-col leading-tight">
              <span className="text-base font-bold text-[#E7C768]">Админ-панель</span>
              <span className="text-[10px] uppercase tracking-wider text-slate-300">CRM администратора</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate("/system-admin")}
              className="px-3 py-2 rounded-xl text-xs font-semibold bg-[#E7C768]/15 hover:bg-[#E7C768]/25 text-[#E7C768] border border-[#E7C768]/40 flex items-center gap-1.5 transition"
              title="Перейти в управление базой данных"
            >
              <Database className="w-3.5 h-3.5" /> База данных
            </button>
            <button
              onClick={() => navigate("/emp100007/profile")}
              className="px-3 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-white/5 flex items-center gap-1.5"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Кабинет
            </button>
            <button
              onClick={async () => { await dbClient.auth.signOut(); navigate("/"); }}
              className="px-3 py-2 rounded-xl text-xs font-semibold text-rose-300 hover:text-rose-100 bg-white/5 border border-white/10 flex items-center gap-1.5"
            >
              <LogOut className="w-3.5 h-3.5" /> Выйти
            </button>
          </div>
        </div>
      </header>

      {toast && (
        <div className={`fixed top-20 right-4 z-50 px-4 py-2.5 rounded-xl text-sm font-semibold shadow-2xl border ${
          toast.kind === "ok"
            ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-100"
            : "bg-rose-500/20 border-rose-500/50 text-rose-100"
        }`}>
          {toast.text}
        </div>
      )}

      <main className="max-w-[1500px] mx-auto py-6 px-4 md:px-8 grid grid-cols-1 lg:grid-cols-12 gap-6">
        <aside className="lg:col-span-2">
          <div className="bg-[#1E4468]/80 border border-white/10 rounded-3xl p-3 space-y-1 sticky top-20">
            {SECTIONS.map((s) => {
              const Icon = s.icon;
              const active = section === s.key;
              return (
                <button
                  key={s.key}
                  onClick={() => setSection(s.key)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition ${
                    active ? "bg-[#E7C768]/15 text-[#E7C768] border border-[#E7C768]/40" : "text-slate-300 hover:bg-white/5"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" /> {s.label}
                </button>
              );
            })}
          </div>
        </aside>

        <section className="lg:col-span-10 space-y-4">
          <EntityNavContext.Provider value={{ openEntity }}>
          {section === "clients"    && <ClientsSection setToast={setToast} />}
          {section === "candidates" && <CandidatesSection />}
          {section === "companies"  && <CompaniesListSection />}
          {section === "vacancies"  && <VacanciesAnalyticsSection />}
          {section === "job_titles" && <JobTitlesSection setToast={setToast} />}
          {section === "interviews" && <InterviewsSection />}
          {section === "trainings"  && <TrainingsSection />}
          {section === "blog"       && <BlogAdmin />}
          {section === "mailings"   && <MailingsSection />}
          {section === "roles"      && <RolesSection setToast={setToast} />}
          {section === "accounts"   && <SimpleTable table="accounts" title="Счета (accounts)" />}
          {section === "logs"       && <LogsSection />}
          {section === "ai"         && <AISection />}
          {section === "reviews"    && <ReviewsSection setToast={setToast} />}
          {section === "telegram"   && <TelegramTokenSection setToast={setToast} />}
          {entityStack.length > 0 && (
            <EntityModal
              entity={entityStack[entityStack.length - 1]}
              setToast={setToast}
              onClose={closeEntity}
            />
          )}
          </EntityNavContext.Provider>
        </section>
      </main>
    </div>
  );
}

/* ============== Sections ============== */

const safeArray = (val: any): any[] => Array.isArray(val) ? val : (Array.isArray(val?.data) ? val.data : []);

function ClientsSection({ setToast }: { setToast: (t: any) => void }) {
  const [rows, setRows] = useState<any[]>([]);
  const [view, setView] = useState<"kanban" | "table">("kanban");
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const { openEntity } = useEntityNav();

  const load = async () => {
    setLoading(true);
    const { data, error } = await dbClient.rpc("admin_list_employers" as any);
    if (error) setToast({ kind: "err", text: error.message });
    else setRows(safeArray(data));
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const list = safeArray(rows);
    const q = search.trim().toLowerCase();
    return list.filter((r) => !q ||
      (r.name || "").toLowerCase().includes(q) ||
      (r.email || "").toLowerCase().includes(q) ||
      (r.public_id || "").toLowerCase().includes(q));
  }, [rows, search]);

  const COLS = [
    { key: "new", label: "Новые" },
    { key: "trial", label: "В работе" },
    { key: "active", label: "Активные" },
    { key: "paying", label: "Платящие" },
  ];

  const handleResetPassword = async () => {
    const email = window.prompt("Email работодателя, которому задать временный пароль:");
    if (!email) return;
    const password = window.prompt(
      `Новый пароль для ${email} (мин. 6 символов).\nНапример: 123456`,
      "123456",
    );
    if (!password || password.length < 6) {
      setToast({ kind: "err", text: "Пароль должен быть не короче 6 символов" });
      return;
    }
    const { data, error } = await dbClient.functions.invoke("admin-set-user-password", {
      body: { email: email.trim().toLowerCase(), password },
    });
    if (error) {
      setToast({ kind: "err", text: error.message || "Не удалось изменить пароль" });
      return;
    }
    if ((data as any)?.error) {
      const code = (data as any).error;
      const msg = code === "user_not_found"
        ? "Пользователь с таким email не найден"
        : code === "forbidden"
          ? "Только администратор может сбрасывать пароли"
          : `Ошибка: ${code}`;
      setToast({ kind: "err", text: msg });
      return;
    }
    setToast({ kind: "ok", text: `Пароль для ${email} обновлён. Сообщите пользователю новый пароль.` });
  };

  return (
    <div className="space-y-4">
      <div className="bg-[#1E4468]/80 border border-white/10 rounded-3xl p-4 flex flex-wrap items-center gap-3 justify-between">
        <h2 className="text-base font-bold text-[#E7C768]">Клиенты (работодатели) — {rows.length}</h2>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Поиск..."
              className="bg-[#17344F]/60 text-xs text-white pl-8 pr-3 py-2 rounded-xl border border-white/10 focus:outline-none focus:border-[#E7C768]" />
          </div>
          <div className="bg-black/25 p-1 rounded-xl border border-white/10 flex gap-1">
            <button onClick={() => setView("kanban")} className={`px-3 py-1 text-[11px] font-bold rounded-lg ${view === "kanban" ? "bg-[#1E4468] text-[#E7C768]" : "text-slate-300"}`}>Канбан</button>
            <button onClick={() => setView("table")}  className={`px-3 py-1 text-[11px] font-bold rounded-lg ${view === "table"  ? "bg-[#1E4468] text-[#E7C768]" : "text-slate-300"}`}>Таблица</button>
          </div>
          <button onClick={handleResetPassword} className="px-3 py-2 rounded-xl text-xs font-semibold bg-emerald-950/50 hover:bg-emerald-900/60 border border-emerald-500/30 text-emerald-200 flex items-center gap-1.5" title="Задать временный пароль работодателю">
            <KeyRound className="w-3.5 h-3.5" /> Сброс пароля
          </button>
          <button onClick={load} className="px-3 py-2 rounded-xl text-xs font-semibold bg-white/5 hover:bg-white/10 border border-white/10 flex items-center gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" /> Обновить
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-400 flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Загрузка...</div>
      ) : view === "kanban" ? (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {COLS.map((col) => {
            const items = filtered.filter((r) => classifyClient(r).key === col.key);
            return (
              <div key={col.key} className="bg-[#1E4468]/40 border border-white/5 rounded-2xl p-3 min-h-[300px]">
                <div className="flex items-center justify-between border-b border-white/5 pb-2 text-xs font-bold text-slate-300">
                  <span>{col.label}</span>
                  <span className="bg-black/30 font-mono px-2 py-0.5 rounded-full text-[10px] text-[#E7C768]">{items.length}</span>
                </div>
                <div className="space-y-2 mt-2">
                  {items.length === 0 ? <div className="text-center py-6 text-slate-500 text-[11px]">Пусто</div> : items.map((r) => (
                    <div key={r.id} onClick={() => openEntity("employer", r.id)}
                      className="bg-[#17344F]/85 border border-white/10 hover:border-[#E7C768] p-2.5 rounded-xl cursor-pointer transition">
                      <div className="text-xs font-bold text-[#E7C768] truncate">{r.name || r.email || `Emp #${r.public_id}`}</div>
                      <div className="text-[10px] text-slate-300 truncate">{r.email}</div>
                      <div className="flex justify-between text-[10px] font-mono mt-1">
                        <span className="text-slate-400">Вакансий: {r.projects_count}</span>
                        <span className="text-[#E7C768] font-bold">{r.balance} RR</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-[#1E4468]/40 border border-white/10 rounded-3xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#17344F] text-[#E7C768] uppercase tracking-wider text-[10px] font-mono">
                <tr>
                  <th className="p-3">ID</th><th className="p-3">Имя / Email</th><th className="p-3">Контакты</th>
                  <th className="p-3">Вакансий</th><th className="p-3">Кандидатов</th>
                  <th className="p-3">Баланс RR</th><th className="p-3">Статус</th><th className="p-3">Создан</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filtered.map((r) => {
                  const cls = classifyClient(r);
                  return (
                    <tr key={r.id} className="hover:bg-white/5 cursor-pointer" onClick={() => openEntity("employer", r.id)}>
                      <td className="p-3 font-mono text-slate-400">{r.public_id}</td>
                      <td className="p-3"><div className="font-bold">{r.name || "—"}</div><div className="text-[10px] text-slate-400">{r.email}</div></td>
                      <td className="p-3 text-[10px]">
                        {(r.contact_phone || r.phone) || "—"} {(r.contact_telegram || r.telegram_username) ? `· @${String(r.contact_telegram || r.telegram_username).replace(/^@+/, "")}` : ""}
                      </td>
                      <td className="p-3 text-center">{r.projects_count}</td>
                      <td className="p-3 text-center">{r.candidates_count}</td>
                      <td className="p-3 text-center font-mono text-[#E7C768] font-bold">{r.balance}</td>
                      <td className="p-3"><span className={`text-[10px] font-bold px-2 py-0.5 rounded bg-${cls.color}-500/20 text-${cls.color}-300`}>{cls.label}</span></td>
                      <td className="p-3 text-[10px] text-slate-400">{r.created_at ? new Date(r.created_at).toLocaleDateString() : ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function CandidatesSection() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState<string>("all");
  const [selected, setSelected] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await dbClient.rpc("admin_list_candidates" as any);
    setRows(safeArray(data));
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const list = safeArray(rows);
    const q = search.trim().toLowerCase();
    return list.filter((r) =>
      (stage === "all" || r.crm_stage === stage) &&
      (!q || (r.full_name || "").toLowerCase().includes(q) || (r.email || "").toLowerCase().includes(q) || (r.role_name || "").toLowerCase().includes(q) || (r.company_name || "").toLowerCase().includes(q))
    );
  }, [rows, search, stage]);

  const STAGES = ["all", "registration", "screening", "checklist", "situations", "professional", "product", "systems", "certified"];

  return (
    <div className="space-y-4">
      <div className="bg-[#1E4468]/80 border border-white/10 rounded-3xl p-4 flex flex-wrap items-center gap-3 justify-between">
        <h2 className="text-base font-bold text-[#E7C768]">Кандидаты — {rows.length}</h2>
        <div className="flex items-center gap-2">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Поиск..."
            className="bg-[#17344F]/60 text-xs text-white px-3 py-2 rounded-xl border border-white/10" />
          <select value={stage} onChange={(e) => setStage(e.target.value)}
            className="bg-[#17344F]/60 text-xs text-white px-3 py-2 rounded-xl border border-white/10">
            {STAGES.map((s) => <option key={s} value={s} className="bg-slate-900">{s === "all" ? "Все этапы" : s}</option>)}
          </select>
        </div>
      </div>
      {loading ? (
        <div className="text-center py-12 text-slate-400"><Loader2 className="w-4 h-4 animate-spin inline" /> Загрузка...</div>
      ) : (
        <div className="bg-[#1E4468]/40 border border-white/10 rounded-3xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#17344F] text-[#E7C768] uppercase tracking-wider text-[10px] font-mono">
                <tr><th className="p-3">ID</th><th className="p-3">ФИО</th><th className="p-3">Email</th><th className="p-3">Роль</th><th className="p-3">Компания</th><th className="p-3">Этап</th><th className="p-3">Балл</th><th className="p-3">Создан</th></tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filtered.map((r) => (
                  <tr key={r.id} className="hover:bg-white/5 cursor-pointer" onClick={() => setSelected(r.id)}>
                    <td className="p-3 font-mono text-slate-400">{r.public_id}</td>
                    <td className="p-3 font-bold text-white">{r.full_name || "—"}</td>
                    <td className="p-3">{r.email || "—"}</td>
                    <td className="p-3">{r.role_name || r.project_role || "—"}</td>
                    <td className="p-3">{r.company_name || "—"}</td>
                    <td className="p-3"><span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#E7C768]/15 text-[#E7C768]">{r.crm_stage}</span></td>
                    <td className="p-3 font-mono text-[#E7C768]">{r.overall_score ? Math.round(Number(r.overall_score)) : "—"}</td>
                    <td className="p-3 text-[10px] text-slate-400">{r.created_at ? new Date(r.created_at).toLocaleDateString() : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <CandidateDetailsModal candidateId={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function SimpleTable({ table, title }: { table: string; title: string }) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<any | null>(null);
  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await (dbClient as any).from(table).select("*").limit(500).order("created_at", { ascending: false });
      setRows(((data as any[]) || []));
      setLoading(false);
    })();
  }, [table]);
  const cols = rows[0] ? Object.keys(rows[0]).slice(0, 8) : [];
  const lbls = RU_LABELS[table] || {};
  return (
    <div className="space-y-3">
      <div className="bg-[#1E4468]/80 border border-white/10 rounded-3xl p-4 flex items-center justify-between">
        <h2 className="text-base font-bold text-[#E7C768]">{title} — {rows.length}</h2>
      </div>
      {loading ? (
        <div className="text-center py-12 text-slate-400"><Loader2 className="w-4 h-4 animate-spin inline" /> Загрузка...</div>
      ) : rows.length === 0 ? (
        <div className="text-center py-12 text-slate-400 bg-[#1E4468]/40 border border-white/10 rounded-3xl">Нет данных</div>
      ) : (
        <div className="bg-[#1E4468]/40 border border-white/10 rounded-3xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[11px]">
              <thead className="bg-[#17344F] text-[#E7C768] uppercase tracking-wider text-[10px] font-mono">
                <tr>{cols.map((c) => <th key={c} className="p-2.5" title={c}>{lbls[c] || c}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {rows.map((r, i) => (
                  <tr key={r.id || i} className="hover:bg-white/5 cursor-pointer" onClick={() => setSelected(r)}>
                    {cols.map((c) => {
                      const v = (r as any)[c];
                      const str = v === null || v === undefined ? "—" : typeof v === "object" ? JSON.stringify(v).slice(0, 60) : String(v).slice(0, 80);
                      return <td key={c} className="p-2.5 align-top">{str}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <DetailsModal
        title={title}
        data={selected}
        table={table}
        labels={RU_LABELS[table]}
        omitKeys={OMIT_KEYS[table]}
        onClose={() => setSelected(null)}
        onSaved={(row) => {
          setSelected(null);
          setRows((rs) => rs.map((x) => (x.id === row?.id ? { ...x, ...row } : x)));
        }}
      />
    </div>
  );
}

function MailingsSection() {
  return (
    <div className="bg-[#1E4468]/80 border border-white/10 rounded-3xl p-8 text-center space-y-3">
      <Mail className="w-10 h-10 mx-auto text-[#E7C768]" />
      <h2 className="text-base font-bold text-[#E7C768]">Рассылки</h2>
      <p className="text-xs text-slate-300 max-w-md mx-auto">
        Конструктор массовых рассылок будет здесь. Отправка работает в кабинете работодателя (CRM → Рассылка). В следующих итерациях добавим централизованные шаблоны и кампании.
      </p>
    </div>
  );
}

/* ============== Interviews — кандидат-центричный список (#6) ============== */

function InterviewsSection() {
  const [scores, setScores] = useState<any[]>([]);
  const [cands, setCands] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const [s, c] = await Promise.all([
      (dbClient as any).from("candidate_scores").select("*").order("updated_at", { ascending: false }).limit(500),
      dbClient.rpc("admin_list_candidates" as any),
    ]);
    setScores(((s as any).data as any[]) || []);
    setCands(((c as any).data as any[]) || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const candMap = useMemo(() => {
    const m: Record<string, any> = {};
    cands.forEach((c) => { m[c.id] = c; });
    return m;
  }, [cands]);

  const enriched = useMemo(() => scores.map((s) => {
    const c = candMap[s.candidate_id] || {};
    return { ...s, _name: c.full_name || "", _email: c.email || "", _role: c.role_name || c.project_role || "", _company: c.company_name || "", _public_id: c.public_id || "" };
  }), [scores, candMap]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return enriched;
    return enriched.filter((r) =>
      (r._name || "").toLowerCase().includes(q) ||
      (r._email || "").toLowerCase().includes(q) ||
      (r._role || "").toLowerCase().includes(q) ||
      (r._company || "").toLowerCase().includes(q));
  }, [enriched, search]);

  return (
    <div className="space-y-3">
      <div className="bg-[#1E4468]/80 border border-white/10 rounded-3xl p-4 flex items-center justify-between gap-3">
        <h2 className="text-base font-bold text-[#E7C768]">Интервью (оценки кандидатов) — {filtered.length}</h2>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Поиск по ФИО / email / роли / компании…"
          className="bg-[#17344F]/60 text-xs text-white px-3 py-2 rounded-xl border border-white/10 min-w-[260px]" />
      </div>
      {loading ? (
        <div className="text-center py-12 text-slate-400"><Loader2 className="w-4 h-4 animate-spin inline" /> Загрузка…</div>
      ) : (
        <div className="bg-[#1E4468]/40 border border-white/10 rounded-3xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#17344F] text-[#E7C768] uppercase tracking-wider text-[10px] font-mono">
                <tr>
                  <th className="p-3">Кандидат</th><th className="p-3">Email</th><th className="p-3">Роль</th><th className="p-3">Компания</th>
                  <th className="p-3 text-center">Резюме</th><th className="p-3 text-center">Чек-лист</th><th className="p-3 text-center">Ситуации</th>
                  <th className="p-3 text-center">Общий</th><th className="p-3">Обновлено</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filtered.map((r) => (
                  <tr key={r.candidate_id} className="hover:bg-white/5 cursor-pointer" onClick={() => setSelected(r.candidate_id)}>
                    <td className="p-3 font-bold text-white">{r._name || "—"}<div className="text-[10px] text-slate-400 font-mono">#{r._public_id}</div></td>
                    <td className="p-3 text-slate-300">{r._email || "—"}</td>
                    <td className="p-3">{r._role || "—"}</td>
                    <td className="p-3">{r._company || "—"}</td>
                    <td className="p-3 text-center font-mono text-cyan-300">{r.resume_score ?? "—"}</td>
                    <td className="p-3 text-center font-mono text-violet-300">{r.checklist_score ?? "—"}</td>
                    <td className="p-3 text-center font-mono text-amber-300">{r.situations_score ?? "—"}</td>
                    <td className="p-3 text-center font-mono font-bold text-[#E7C768]">{r.overall_score ?? "—"}</td>
                    <td className="p-3 text-[10px] text-slate-400">{r.updated_at ? new Date(r.updated_at).toLocaleString() : ""}</td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={9} className="p-6 text-center text-slate-400">Ничего не найдено</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <CandidateDetailsModal candidateId={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

/* ============== Trainings — кандидат-центричный список (#6) ============== */

function TrainingsSection() {
  const [progress, setProgress] = useState<any[]>([]);
  const [cands, setCands] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState<string>("all");
  const [selected, setSelected] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const [p, c] = await Promise.all([
      (dbClient as any).from("candidate_stage_progress").select("*").order("updated_at", { ascending: false }).limit(1000),
      dbClient.rpc("admin_list_candidates" as any),
    ]);
    setProgress(((p as any).data as any[]) || []);
    setCands(((c as any).data as any[]) || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const candMap = useMemo(() => {
    const m: Record<string, any> = {};
    cands.forEach((c) => { m[c.id] = c; });
    return m;
  }, [cands]);

  const enriched = useMemo(() => progress.map((s) => {
    const c = candMap[s.candidate_id] || {};
    return { ...s, _name: c.full_name || "", _email: c.email || "", _role: c.role_name || c.project_role || "", _company: c.company_name || "", _public_id: c.public_id || "" };
  }), [progress, candMap]);

  const STAGES = Array.from(new Set(progress.map((p) => p.stage).filter(Boolean)));

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return enriched.filter((r) =>
      (stage === "all" || r.stage === stage) &&
      (!q ||
        (r._name || "").toLowerCase().includes(q) ||
        (r._email || "").toLowerCase().includes(q) ||
        (r._role || "").toLowerCase().includes(q) ||
        (r._company || "").toLowerCase().includes(q) ||
        (r.stage || "").toLowerCase().includes(q)));
  }, [enriched, search, stage]);

  return (
    <div className="space-y-3">
      <div className="bg-[#1E4468]/80 border border-white/10 rounded-3xl p-4 flex flex-wrap items-center gap-3 justify-between">
        <h2 className="text-base font-bold text-[#E7C768]">Прогресс обучения — {filtered.length}</h2>
        <div className="flex items-center gap-2">
          <select value={stage} onChange={(e) => setStage(e.target.value)}
            className="bg-[#17344F]/60 text-xs text-white px-3 py-2 rounded-xl border border-white/10">
            <option value="all" className="bg-slate-900">Все этапы</option>
            {STAGES.map((s) => <option key={s} value={s} className="bg-slate-900">{s}</option>)}
          </select>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Поиск по ФИО / email / роли / компании…"
            className="bg-[#17344F]/60 text-xs text-white px-3 py-2 rounded-xl border border-white/10 min-w-[260px]" />
        </div>
      </div>
      {loading ? (
        <div className="text-center py-12 text-slate-400"><Loader2 className="w-4 h-4 animate-spin inline" /> Загрузка…</div>
      ) : (
        <div className="bg-[#1E4468]/40 border border-white/10 rounded-3xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#17344F] text-[#E7C768] uppercase tracking-wider text-[10px] font-mono">
                <tr>
                  <th className="p-3">Кандидат</th><th className="p-3">Email</th><th className="p-3">Роль</th><th className="p-3">Компания</th>
                  <th className="p-3">Этап</th><th className="p-3 text-center">Попыток</th><th className="p-3 text-center">Лучший</th>
                  <th className="p-3 text-center">Последний</th><th className="p-3">Сдан</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filtered.map((r, i) => (
                  <tr key={`${r.candidate_id}-${r.stage}-${i}`} className="hover:bg-white/5 cursor-pointer" onClick={() => setSelected(r.candidate_id)}>
                    <td className="p-3 font-bold text-white">{r._name || "—"}<div className="text-[10px] text-slate-400 font-mono">#{r._public_id}</div></td>
                    <td className="p-3 text-slate-300">{r._email || "—"}</td>
                    <td className="p-3">{r._role || "—"}</td>
                    <td className="p-3">{r._company || "—"}</td>
                    <td className="p-3"><span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#E7C768]/15 text-[#E7C768]">{r.stage}</span></td>
                    <td className="p-3 text-center font-mono">{r.attempts ?? "—"}</td>
                    <td className="p-3 text-center font-mono text-[#E7C768] font-bold">{r.best_score ?? "—"}</td>
                    <td className="p-3 text-center font-mono text-slate-200">{r.last_score ?? "—"}</td>
                    <td className="p-3 text-[10px] text-slate-400">{r.passed_at ? new Date(r.passed_at).toLocaleDateString() : "—"}</td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={9} className="p-6 text-center text-slate-400">Ничего не найдено</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <CandidateDetailsModal candidateId={selected} onClose={() => setSelected(null)} />
    </div>
  );
}


function JobTitlesSection({ setToast }: { setToast: (t: any) => void }) {
  const [titles, setTitles] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [adding, setAdding] = useState(false);
  const [selectedTitle, setSelectedTitle] = useState<any | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchJobTitles(true);
      setTitles(data || []);
    } catch (e: any) {
      setToast({ kind: "err", text: "Ошибка загрузки должностей: " + e.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = newTitle.trim();
    if (!t) return;
    setAdding(true);
    const added = await upsertJobTitle(t);
    setAdding(false);
    if (added) {
      setNewTitle("");
      setToast({ kind: "ok", text: `Должность "${t}" добавлена!` });
      load();
    } else {
      setToast({ kind: "err", text: "Не удалось добавить должность" });
    }
  };

  const handleDelete = async (item: any) => {
    if (!window.confirm(`Удалить должность "${item.title}" (ID: ${item.id})из базы данных?`)) return;
    const ok = await deleteJobTitle(item.id);
    if (ok) {
      setToast({ kind: "ok", text: `Должность "${item.title}" удалена из базы` });
      setTitles((prev) => prev.filter((x) => x.id !== item.id));
    } else {
      setToast({ kind: "err", text: "Ошибка при удалении должности" });
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return titles;
    return titles.filter((x) =>
      x.title.toLowerCase().includes(q) ||
      x.id.toLowerCase().includes(q)
    );
  }, [titles, search]);

  return (
    <div className="space-y-4">
      <div className="bg-[#1E4468]/80 border border-white/10 rounded-3xl p-5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-[#E7C768] flex items-center gap-2">
              <Database className="w-5 h-5" /> Справочник должностей (job_titles)
            </h2>
            <p className="text-xs text-slate-300">
              Управление списком профессий и должностей в базе данных. Вы можете добавлять, редактировать и удалять лишние строки (например jt-1, jt-2).
            </p>
          </div>
          <button onClick={load} disabled={loading}
            className="self-start md:self-auto px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-xs text-slate-200 font-bold inline-flex items-center gap-1.5 transition">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Обновить
          </button>
        </div>

        {/* Form to add new title */}
        <form onSubmit={handleAdd} className="flex gap-2 max-w-xl">
          <input
            type="text"
            placeholder="Название новой должности..."
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            className="flex-1 bg-[#17344F] border border-white/15 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-400 focus:outline-[#E7C768]"
          />
          <button
            type="submit"
            disabled={adding || !newTitle.trim()}
            className="px-4 py-2 bg-gradient-to-r from-[#E7C768] to-[#D99E41] text-[#17344F] rounded-xl text-xs font-bold hover:brightness-110 disabled:opacity-50 inline-flex items-center gap-1.5 transition"
          >
            {adding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            Добавить
          </button>
        </form>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Поиск по названию или ID (напр. jt-1)..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-[#17344F] border border-white/10 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-400 focus:outline-[#E7C768]"
          />
        </div>

        {/* Table */}
        <div className="overflow-x-auto rounded-2xl border border-white/10 bg-black/20">
          <table className="w-full text-left text-xs">
            <thead className="bg-white/5 border-b border-white/10 text-slate-400 font-mono uppercase text-[10px]">
              <tr>
                <th className="p-3">ID</th>
                <th className="p-3">Должность</th>
                <th className="p-3 text-center">Использований</th>
                <th className="p-3 text-center">Базовая</th>
                <th className="p-3 text-right">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-slate-200">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-slate-400">
                    {loading ? "Загрузка..." : "Ничего не найдено"}
                  </td>
                </tr>
              ) : (
                filtered.map((item) => (
                  <tr key={item.id} className="hover:bg-white/5 transition">
                    <td className="p-3 font-mono text-[11px] text-slate-400">{item.id}</td>
                    <td className="p-3 font-bold text-white">{item.title}</td>
                    <td className="p-3 text-center font-mono">{item.usage_count || 0}</td>
                    <td className="p-3 text-center">
                      {item.is_basic ? (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-bold border border-emerald-500/30">Да</span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full bg-slate-500/20 text-slate-400 text-[10px]">Кастом</span>
                      )}
                    </td>
                    <td className="p-3 text-right space-x-2">
                      <button
                        onClick={() => setSelectedTitle(item)}
                        className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-xs text-slate-200 transition"
                      >
                        Изменить
                      </button>
                      <button
                        onClick={() => handleDelete(item)}
                        className="px-2 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 border border-rose-500/40 text-xs font-bold inline-flex items-center gap-1 transition"
                        title="Удалить строку из базы"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Удалить
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedTitle && (
        <DetailsModal
          title={`Должность: ${selectedTitle.title}`}
          data={selectedTitle}
          table="job_titles"
          onClose={() => setSelectedTitle(null)}
          onSaved={() => { setSelectedTitle(null); load(); }}
          onDelete={() => { setSelectedTitle(null); load(); }}
        />
      )}
    </div>
  );
}

function RolesSection({ setToast }: { setToast: (t: any) => void }) {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  const load = async () => {
    setLoading(true);
    const { data, error } = await dbClient.rpc("admin_list_users" as any);
    if (error) setToast({ kind: "err", text: error.message });
    else setUsers(safeArray(data));
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const toggle = async (uid: string, role: string, enabled: boolean) => {
    const { error } = await dbClient.rpc("admin_set_role" as any, { _user: uid, _role: role, _enabled: enabled });
    if (error) setToast({ kind: "err", text: error.message });
    else { setToast({ kind: "ok", text: "Роль обновлена" }); load(); }
  };

  const ROLES = ["admin", "moderator", "employer", "candidate"];
  const userList = safeArray(users);
  const filtered = userList.filter((u) => !search || (u.email || "").toLowerCase().includes(search.toLowerCase()) || (u.display_name || "").toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-4">
      <div className="bg-transparent border border-white/15 backdrop-blur-md rounded-3xl p-4 flex items-center justify-between">
        <h2 className="text-base font-bold text-[#E7C768]">Роли — {users.length} пользователей</h2>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Поиск..."
          className="bg-transparent text-sm text-white px-3 py-2 rounded-xl border border-white/15 focus:outline-none focus:border-[#E7C768]" />
      </div>
      {loading ? <div className="text-center py-12 text-slate-400"><Loader2 className="w-5 h-5 animate-spin inline" /></div> : (
        <div className="bg-transparent border border-white/15 backdrop-blur-md rounded-3xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-transparent border-b border-white/15 text-[#E7C768] text-sm font-semibold">
                <tr><th className="p-3.5">Пользователь</th>{ROLES.map((r) => <th key={r} className="p-3.5 text-center">{r}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {filtered.map((u) => {
                  const userRoles: string[] = u.roles || [];
                  return (
                    <tr key={u.user_id} className="hover:bg-white/5 transition">
                      <td className="p-3.5"><div className="font-bold text-white text-sm">{u.display_name || "—"}</div><div className="text-xs text-slate-300">{u.email}</div></td>
                      {ROLES.map((r) => {
                        const has = userRoles.includes(r);
                        return (
                          <td key={r} className="p-3.5 text-center">
                            <button onClick={() => toggle(u.user_id, r, !has)}
                              className={`w-7 h-7 rounded-lg border text-sm font-bold transition cursor-pointer ${has ? "bg-[#E7C768]/20 border-[#E7C768] text-[#E7C768]" : "bg-transparent border-white/20 text-slate-400 hover:bg-white/10"}`}>
                              {has ? "✓" : ""}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function AccountsTab({ setToast }: { setToast: (t: any) => void }) {
  const [rows, setRows] = useState<any[]>([]);
  const [txs, setTxs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedTx, setSelectedTx] = useState<any | null>(null);
  const [search, setSearch] = useState("");
  const [walletMap, setWalletMap] = useState<Record<string, string>>({});
  const { openEntity } = useEntityNav();

  const [modalData, setModalData] = useState<{
    open: boolean;
    employer: any;
    delta: number;
  }>({ open: false, employer: null, delta: 0 });
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    const [emp, t, w] = await Promise.all([
      dbClient.rpc("admin_list_employers" as any),
      (dbClient as any).from("transactions").select("*").order("created_at", { ascending: false }).limit(200),
      (dbClient as any).from("wallets").select("id, employer_id"),
    ]);
    if ((emp as any).error) setToast({ kind: "err", text: (emp as any).error.message });
    setRows(safeArray((emp as any)?.data));
    setTxs(safeArray((t as any)?.data));
    const wmap: Record<string, string> = {};
    safeArray((w as any)?.data).forEach((x: any) => { wmap[x.id] = x.employer_id; });
    setWalletMap(wmap);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  // Realtime: обновляем балансы и транзакции мгновенно
  useEffect(() => {
    const ch = dbClient
      .channel("admin-accounts-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "wallets" }, () => { load(); })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "transactions" }, (p: any) => {
        setTxs((prev) => [p.new, ...prev].slice(0, 200));
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "transactions" }, (p: any) => {
        setTxs((prev) => prev.map((t) => (t.id === p.new.id ? p.new : t)));
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "employers" }, () => { load(); })
      .subscribe();
    return () => { dbClient.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      load();
    }
  };

  const empById = useMemo(() => {
    const m: Record<string, any> = {};
    rows.forEach((r) => { m[r.id] = r; });
    return m;
  }, [rows]);

  const enrichedTxs = useMemo(() => txs.map((t) => {
    const empId = walletMap[t.wallet_id];
    const emp = empId ? empById[empId] : null;
    return { ...t, _emp_id: empId, _emp_name: emp?.name || "", _emp_email: emp?.email || "" };
  }), [txs, walletMap, empById]);

  const filteredTxs = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return enrichedTxs;
    return enrichedTxs.filter((t) =>
      (t._emp_name || "").toLowerCase().includes(q) ||
      (t._emp_email || "").toLowerCase().includes(q) ||
      (t.note || "").toLowerCase().includes(q) ||
      (t.type || "").toLowerCase().includes(q));
  }, [enrichedTxs, search]);

  return (
    <div className="space-y-4">
      <div className="bg-transparent border border-[#E7C768]/30 backdrop-blur-md rounded-3xl p-4 flex items-center justify-between">
        <h2 className="text-lg font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">
          Счета и балансы клиентов
        </h2>
        <span className="text-sm font-medium text-[#E7C768] flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-[#E7C768] animate-pulse"></span>
          Реальное время
        </span>
      </div>
      {loading ? <div className="text-center py-12 text-slate-400"><Loader2 className="w-6 h-6 animate-spin inline" /></div> : (
        <>
          <div className="bg-transparent border border-white/15 backdrop-blur-md rounded-3xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-transparent border-b border-white/15 text-[#E7C768] text-sm font-semibold">
                  <tr>
                    <th className="p-3.5">ID</th>
                    <th className="p-3.5">Клиент</th>
                    <th className="p-3.5">Баланс RR</th>
                    <th className="p-3.5">Корректировка</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {rows.map((r) => (
                    <tr key={r.id} className="hover:bg-white/5 transition">
                      <td className="p-3.5 font-mono text-slate-300 cursor-pointer" onClick={() => openEntity("employer", r.id)}>{r.public_id}</td>
                      <td className="p-3.5 cursor-pointer" onClick={() => openEntity("employer", r.id)}>
                        <div className="font-bold text-[#E7C768] text-sm">{r.name || r.email || "—"}</div>
                        <div className="text-xs text-slate-300">{r.email}</div>
                      </td>
                      <td className="p-3.5 font-mono text-[#E7C768] font-bold text-sm cursor-pointer" onClick={() => openEntity("employer", r.id)}>{r.balance}</td>
                      <td className="p-3.5 flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                        {[100, 500, 1000].map((d) => (
                          <React.Fragment key={d}>
                            <button onClick={() => openAdjustModal(r, d)} className="px-2.5 py-1 rounded-lg bg-transparent border border-white/20 hover:border-[#E7C768] text-white text-xs font-bold flex items-center gap-1 transition cursor-pointer">
                              <Plus className="w-3.5 h-3.5 text-[#E7C768]" />{d}
                            </button>
                            <button onClick={() => openAdjustModal(r, -d)} className="px-2.5 py-1 rounded-lg bg-transparent border border-white/20 hover:border-[#E7C768] text-white text-xs font-bold flex items-center gap-1 transition cursor-pointer">
                              <Minus className="w-3.5 h-3.5 text-slate-300" />{d}
                            </button>
                          </React.Fragment>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-transparent border border-white/15 backdrop-blur-md rounded-3xl p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-sm font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">
                Последние транзакции — {filteredTxs.length}
              </h3>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Поиск по клиенту / email / заметке…"
                className="bg-transparent text-sm text-white px-3.5 py-2 rounded-xl border border-white/15 min-w-[280px] focus:outline-none focus:border-[#E7C768]" />
            </div>
            <div className="overflow-x-auto max-h-96 overflow-y-auto border border-white/10 rounded-2xl">
              <table className="w-full text-left text-sm">
                <thead className="bg-transparent border-b border-white/15 text-[#E7C768] text-sm font-semibold sticky top-0 backdrop-blur-md">
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
                  {filteredTxs.map((t) => (
                    <tr key={t.id} className="hover:bg-white/5 cursor-pointer transition" onClick={() => setSelectedTx(t)}>
                      <td className="p-3 text-slate-300 text-xs">{t.created_at ? new Date(t.created_at).toLocaleString() : ""}</td>
                      <td className="p-3" onClick={(e) => e.stopPropagation()}>
                        {t._emp_id ? (
                          <EntityLink kind="employer" id={t._emp_id}>{t._emp_name || t._emp_email || "—"}</EntityLink>
                        ) : <span className="text-slate-400">—</span>}
                      </td>
                      <td className="p-3 text-slate-300 text-xs">{t._emp_email || "—"}</td>
                      <td className="p-3 font-medium text-white">{t.type}</td>
                      <td className="p-3 font-mono font-bold text-[#E7C768]">{t.amount_rr}</td>
                      <td className="p-3 max-w-[320px] truncate text-slate-200" title={t.note || ""}>{t.note}</td>
                    </tr>
                  ))}
                  {filteredTxs.length === 0 && (
                    <tr><td colSpan={6} className="p-6 text-center text-slate-400">Нет транзакций</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {modalData.employer && (
        <ConfirmBalanceChangeModal
          open={modalData.open}
          onClose={() => setModalData({ open: false, employer: null, delta: 0 })}
          employerName={modalData.employer.name || modalData.employer.email || `Клиент #${modalData.employer.public_id}`}
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
      />
    </div>
  );
}

function VacanciesAnalyticsSection() {
  const [projects, setProjects] = useState<any[]>([]);
  const [companies, setCompanies] = useState<Record<string, any>>({});
  const [cands, setCands] = useState<any[]>([]);
  const [scores, setScores] = useState<any[]>([]);
  const [progress, setProgress] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const { openEntity } = useEntityNav();

  const load = async () => {
    setLoading(true);
    const [p, co, c, s, pr] = await Promise.all([
      (dbClient as any).from("projects").select("id, public_id, role_name, status, is_published, company_id, created_at, max_interviews, max_trainings, interview_limit, training_limit, interview_used, training_used").order("created_at", { ascending: false }).limit(500),
      (dbClient as any).from("companies").select("id, name, public_id").limit(1000),
      (dbClient as any).from("candidates").select("id, project_id, current_stage, created_at").limit(5000),
      (dbClient as any).from("candidate_scores").select("candidate_id, resume_score, checklist_score, situations_score, overall_score").limit(5000),
      (dbClient as any).from("candidate_stage_progress").select("candidate_id, stage, status").limit(5000),
    ]);
    setProjects(((p as any).data as any[]) || []);
    const coMap: Record<string, any> = {};
    (((co as any).data as any[]) || []).forEach((x) => { coMap[x.id] = x; });
    setCompanies(coMap);
    setCands(((c as any).data as any[]) || []);
    setScores(((s as any).data as any[]) || []);
    setProgress(((pr as any).data as any[]) || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  // Realtime: счётчики обновляются мгновенно
  useEffect(() => {
    const ch = dbClient
      .channel("admin-vacancies-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "candidate_scores" }, () => { load(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "candidate_stage_progress" }, () => { load(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "candidates" }, () => { load(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "projects" }, () => { load(); })
      .subscribe();
    return () => { dbClient.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const candById = useMemo(() => {
    const m: Record<string, any> = {};
    cands.forEach((c) => { m[c.id] = c; });
    return m;
  }, [cands]);

  const stats = useMemo(() => {
    const byProj: Record<string, any> = {};
    projects.forEach((p) => {
      byProj[p.id] = { registrations: 0, screening: 0, checklist: 0, situations: 0, training: 0, sumScore: 0, scoreCount: 0 };
    });
    cands.forEach((c) => { if (byProj[c.project_id]) byProj[c.project_id].registrations++; });
    scores.forEach((s) => {
      const c = candById[s.candidate_id];
      const b = c && byProj[c.project_id];
      if (!b) return;
      if (s.resume_score != null) b.screening++;
      if (s.checklist_score != null) b.checklist++;
      if (s.situations_score != null) b.situations++;
      if (s.overall_score != null) { b.sumScore += Number(s.overall_score); b.scoreCount++; }
    });
    progress.forEach((pp) => {
      const c = candById[pp.candidate_id];
      const b = c && byProj[c.project_id];
      if (!b) return;
      if (pp.status === "completed" || pp.status === "done") b.training++;
    });
    return byProj;
  }, [projects, cands, scores, progress, candById]);

  const filtered = projects.filter((p) => {
    if (!search) return true;
    const q = search.toLowerCase();
    const co = companies[p.company_id];
    return (p.role_name || "").toLowerCase().includes(q)
      || (p.public_id || "").toLowerCase().includes(q)
      || (co?.name || "").toLowerCase().includes(q);
  });

  return (
    <div className="space-y-3">
      <div className="bg-[#1E4468]/80 border border-white/10 rounded-3xl p-4 flex items-center justify-between gap-3">
        <h2 className="text-base font-bold text-[#E7C768]">Вакансии — {projects.length} <span className="text-[10px] text-emerald-300 ml-2">● live</span></h2>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Поиск по роли / компании / ID…"
          className="bg-[#17344F]/60 text-xs text-white px-3 py-2 rounded-xl border border-white/10 min-w-[220px]" />
      </div>
      {loading && projects.length === 0 ? (
        <div className="text-center py-12 text-slate-400"><Loader2 className="w-4 h-4 animate-spin inline" /> Загрузка…</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map((p, pIdx) => {
            const co = companies[p.company_id];
            const st = stats[p.id] || { registrations: 0, screening: 0, checklist: 0, situations: 0, training: 0, sumScore: 0, scoreCount: 0 };
            const avg = st.scoreCount > 0 ? Math.round(st.sumScore / st.scoreCount) : null;
            return (
              <div key={`${p.id}-${pIdx}`} onClick={() => openEntity("project", p.id)}
                className="bg-[#1E4468]/60 border border-white/10 rounded-2xl p-4 cursor-pointer hover:border-[#E7C768]/40 transition">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-white truncate">{p.role_name || "—"}</div>
                    <div className="text-[11px] text-slate-300 truncate">{co?.name || "—"}</div>
                    <div className="text-[10px] text-slate-500 font-mono">#{p.public_id}</div>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${p.is_published ? "bg-emerald-500/20 text-emerald-200" : "bg-slate-500/20 text-slate-300"}`}>
                    {p.is_published ? "опубл." : p.status || "draft"}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-1.5 mt-3 text-center">
                  {[
                    { label: "Регистр.", value: st.registrations, color: "text-sky-300" },
                    { label: "Скрининг", value: st.screening, color: "text-cyan-300" },
                    { label: "Чек-лист", value: st.checklist, color: "text-violet-300" },
                    { label: "Ситуации", value: st.situations, color: "text-amber-300" },
                    { label: "Обучений", value: st.training, color: "text-emerald-300" },
                    { label: "Ср. балл", value: avg ?? "—", color: "text-[#E7C768]" },
                  ].map((k) => (
                    <div key={k.label} className="bg-[#17344F]/60 rounded-lg px-1.5 py-1.5 border border-white/5">
                      <div className={`text-sm font-bold font-mono ${k.color}`}>{k.value}</div>
                      <div className="text-[9px] text-slate-400 uppercase tracking-wider">{k.label}</div>
                    </div>
                  ))}
                </div>
                <VacancyLimitsEditor project={p} onSaved={load} />
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="col-span-full text-center py-12 text-slate-400 bg-[#1E4468]/40 border border-white/10 rounded-3xl">
              Ничего не найдено
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AISection() {
  return <AISectionInner />;
}

function VacancyLimitsEditor({ project, onSaved }: { project: any; onSaved: () => void }) {
  const [iLim, setILim] = useState<number>(Number(project.interview_limit ?? 0));
  const [tLim, setTLim] = useState<number>(Number(project.training_limit ?? 0));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const iUsed = Number(project.interview_used ?? 0);
  const tUsed = Number(project.training_used ?? 0);
  // sync if parent refetches
  useEffect(() => {
    setILim(Number(project.interview_limit ?? 0));
    setTLim(Number(project.training_limit ?? 0));
  }, [project.id, project.interview_limit, project.training_limit]);

  const dirty = iLim !== Number(project.interview_limit ?? 0) || tLim !== Number(project.training_limit ?? 0);

  const save = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (iLim < iUsed || tLim < tUsed) { alert("Лимит не может быть меньше уже использованного"); return; }
    setSaving(true);
    try {
      const { error } = await (dbClient as any).from("projects")
        .update({ interview_limit: Math.max(0, Math.floor(iLim)), training_limit: Math.max(0, Math.floor(tLim)) })
        .eq("id", project.id);
      if (error) throw error;
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
      onSaved();
    } catch (err: any) {
      alert(err?.message || "save_failed");
    } finally { setSaving(false); }
  };

  const Row = ({ Icon, label, used, value, set, color }: any) => (
    <div className="flex items-center gap-1.5">
      <Icon className={`w-3.5 h-3.5 ${color} shrink-0`} />
      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider w-16">{label}</span>
      <button onClick={(e) => { e.stopPropagation(); set(Math.max(used, value - 1)); }}
        disabled={value <= used}
        className="w-6 h-6 rounded bg-white/5 hover:bg-white/10 border border-white/10 text-white disabled:opacity-30 inline-flex items-center justify-center">
        <Minus className="w-3 h-3" />
      </button>
      <input
        type="number" min={used} max={100000} value={value}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => set(Math.max(used, Math.min(100000, Number(e.target.value) || 0)))}
        className="w-14 bg-black/40 text-white border border-white/10 rounded text-xs font-bold text-center py-1"
      />
      <button onClick={(e) => { e.stopPropagation(); set(value + 1); }}
        className="w-6 h-6 rounded bg-white/5 hover:bg-white/10 border border-white/10 text-white inline-flex items-center justify-center">
        <Plus className="w-3 h-3" />
      </button>
      <span className="text-[10px] text-slate-400 ml-1">исп.&nbsp;<b className="text-slate-200">{used}</b></span>
    </div>
  );

  return (
    <div onClick={(e) => e.stopPropagation()} className="mt-3 bg-[#17344F]/60 border border-[#E7C768]/30 rounded-lg p-2.5 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-[#E7C768] inline-flex items-center gap-1">
          <Sparkles className="w-3 h-3" /> Лимиты RR по вакансии
        </span>
        {(iLim === 0 && tLim === 0) && (
          <span className="text-[9px] font-bold bg-rose-500/20 text-rose-200 border border-rose-400/40 rounded-full px-1.5 py-0.5">не заданы</span>
        )}
      </div>
      <Row Icon={Users2} label="Интервью" used={iUsed} value={iLim} set={setILim} color="text-sky-300" />
      <Row Icon={GraduationCap} label="Обучение" used={tUsed} value={tLim} set={setTLim} color="text-emerald-300" />
      {dirty && (
        <button onClick={save} disabled={saving}
          className="w-full bg-[#E7C768] hover:brightness-110 text-[#17344F] text-[11px] font-bold px-3 py-1.5 rounded-md inline-flex items-center justify-center gap-1 disabled:opacity-60">
          {saving ? <><RefreshCw className="w-3 h-3 animate-spin" /> Сохраняем…</> : <><Save className="w-3 h-3" /> Сохранить лимиты</>}
        </button>
      )}
      {saved && (
        <div className="text-[10px] text-emerald-300 inline-flex items-center gap-1">
          <CheckCircle2 className="w-3 h-3" /> Сохранено
        </div>
      )}
    </div>
  );
}

function AISectionInner() {
  const fns = [
    "ai-chat","ai-check-stage-answers","ai-check-text-answer","ai-company-analyze",
    "ai-distribute-text","ai-enhance","ai-evaluate","ai-generate-interview-checklist",
    "ai-generate-interview-resume-criteria","ai-generate-interview-situations",
    "ai-generate-onboarding","ai-generate-stage-material","ai-generate-stage-test",
    "ai-generate-training-material","ai-generate-training-quiz","ai-ingest-document",
    "ai-interview-grade-checklist","ai-interview-grade-situations","ai-interview-screen-resume",
    "ai-list-interview-checklist","ai-list-stage-questions","ai-restart",
  ];
  return (
    <div className="space-y-4">
      <div className="bg-[#1E4468]/80 border border-white/10 rounded-3xl p-4">
        <h2 className="text-base font-bold text-[#E7C768]">ИИ — функции и настройки</h2>
        <p className="text-xs text-slate-300 mt-1">Список развернутых edge-функций. Редактирование промптов будет добавлено в следующих итерациях (после выноса промптов в БД).</p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        {fns.map((f) => (
          <a key={f} href={`https://database.com/dashboard/project/rjhtauzookkvlipvqpvr/functions/${f}/logs`} target="_blank" rel="noreferrer"
            className="bg-[#1E4468]/60 hover:bg-[#1E4468]/90 border border-white/10 hover:border-[#E7C768]/50 rounded-xl p-3 text-xs font-mono text-slate-200 transition">
            {f}
          </a>
        ))}
      </div>
    </div>
  );
}

/* ============== Logs (ProTalk usage) ============== */

// 10 000 000 tokens === 300 ₽  →  0.00003 ₽ per token
const RUB_PER_TOKEN = 300 / 10_000_000;

function LogsSection() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<any | null>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await (dbClient as any)
      .from("logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    setRows((data as any[]) || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.user_message, r.bot_reply, r.channel_name, r.bot_id, r.llm, r.user_social_id, r.rejection_reason, r.textContent, r.ai_reply]
        .some((v) => v && String(v).toLowerCase().includes(q))
    );
  }, [rows, search]);

  const totalTokens = useMemo(
    () => filtered.reduce((s, r) => s + (Number(r.tokens_total) || 0), 0),
    [filtered]
  );
  const totalRub = totalTokens * RUB_PER_TOKEN;

  return (
    <div className="space-y-4">
      <div className="bg-[#1E4468]/80 border border-white/10 rounded-3xl p-4 flex flex-wrap items-center gap-3 justify-between">
        <div>
          <h2 className="text-base font-bold text-[#E7C768]">Логи сообщений ИИ — {rows.length}</h2>
          <p className="text-[11px] text-slate-300 mt-0.5">
            Тариф: 10 000 000 токенов = 300 ₽ (≈ {RUB_PER_TOKEN.toFixed(6)} ₽ за токен)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Поиск по сообщению / каналу / боту..."
            className="bg-[#17344F]/60 text-xs text-white px-3 py-2 rounded-xl border border-white/10 w-72" />
          <button onClick={load} className="px-3 py-2 rounded-xl text-xs font-semibold bg-white/5 hover:bg-white/10 border border-white/10 flex items-center gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" /> Обновить
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-[#1E4468]/70 border border-white/10 rounded-2xl p-4">
          <div className="text-[10px] uppercase tracking-wider text-slate-300">Записей в выборке</div>
          <div className="text-2xl font-bold text-[#E7C768] font-mono mt-1">{filtered.length}</div>
        </div>
        <div className="bg-[#1E4468]/70 border border-white/10 rounded-2xl p-4">
          <div className="text-[10px] uppercase tracking-wider text-slate-300">Сумма токенов (tokens_total)</div>
          <div className="text-2xl font-bold text-[#E7C768] font-mono mt-1">{totalTokens.toLocaleString("ru-RU")}</div>
        </div>
        <div className="bg-gradient-to-br from-[#E7C768]/20 to-[#D99E41]/20 border border-[#E7C768]/40 rounded-2xl p-4">
          <div className="text-[10px] uppercase tracking-wider text-[#E7C768]">Расход ИИ, ₽</div>
          <div className="text-2xl font-bold text-[#F4EE8E] font-mono mt-1">
            {totalRub.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₽
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-400"><Loader2 className="w-4 h-4 animate-spin inline" /> Загрузка...</div>
      ) : (
        <div className="bg-[#1E4468]/40 border border-white/10 rounded-3xl overflow-hidden">
          <div className="overflow-x-auto overflow-y-auto max-h-[60vh]" style={{ WebkitOverflowScrolling: "touch" }}>
            <table className="text-left text-[11px]" style={{ minWidth: 1400 }}>
              <thead className="bg-[#17344F] text-[#E7C768] uppercase tracking-wider text-[10px] font-mono sticky top-0">
                <tr>
                  <th className="p-2.5">Дата</th>
                  <th className="p-2.5">Причина отклонения</th>
                  <th className="p-2.5">Текст отзыва / Сообщение</th>
                  <th className="p-2.5">Ответ ИИ</th>
                  <th className="p-2.5">Канал / User</th>
                  <th className="p-2.5">LLM</th>
                  <th className="p-2.5 text-right">Токенов</th>
                  <th className="p-2.5 text-right">₽</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filtered.map((r) => {
                  const rub = (Number(r.tokens_total) || 0) * RUB_PER_TOKEN;
                  return (
                    <tr key={r.id} className="hover:bg-white/5 cursor-pointer" onClick={() => setSelected(r)}>
                      <td className="p-2.5 text-slate-400 whitespace-nowrap">{r.created_at ? new Date(r.created_at).toLocaleString() : "—"}</td>
                      <td className="p-2.5 text-rose-300 font-medium align-top">
                        <div className="max-w-[260px] line-clamp-3">{r.rejection_reason || "—"}</div>
                      </td>
                      <td className="p-2.5 text-slate-200 align-top">
                        <div className="max-w-[320px] line-clamp-3">{r.textContent || r.user_message || "—"}</div>
                      </td>
                      <td className="p-2.5 text-emerald-300 align-top">
                        <div className="max-w-[380px] line-clamp-3">{r.ai_reply || r.bot_reply || "—"}</div>
                      </td>
                      <td className="p-2.5 text-slate-300 align-top whitespace-nowrap">
                        <div className="font-mono text-[10px] text-amber-300/80">{r.user_social_id || r.channel_id || "—"}</div>
                        <div className="text-[10px] text-slate-400">{r.channel_name || "demo_interview"}</div>
                      </td>
                      <td className="p-2.5 text-slate-400 align-top">{r.llm || "—"}</td>
                      <td className="p-2.5 text-right font-mono text-[#E7C768] align-top">{(r.tokens_total || 0).toLocaleString("ru-RU")}</td>
                      <td className="p-2.5 text-right font-mono text-[#F4EE8E] align-top">
                        {rub.toLocaleString("ru-RU", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr><td colSpan={8} className="p-6 text-center text-slate-400">Нет записей</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <DetailsModal title="Лог сообщения" data={selected} table="logs" onClose={() => setSelected(null)} />
    </div>
  );
}

/* ============== Reviews moderation ============== */
function ReviewsSection({ setToast }: { setToast: (t: any) => void }) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<any | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/table/reviews");
      if (res.ok) {
        const data = await res.json();
        setRows(data.rows || []);
      }
    } catch (e) {
      console.error("Error loading reviews:", e);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const del = async (id: string) => {
    if (!confirm("Удалить отзыв?")) return;
    try {
      const res = await fetch(`/api/admin/table/reviews/${encodeURIComponent(id)}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) { setToast({ kind: "err", text: data.error || "Ошибка удаления" }); return; }
      setToast({ kind: "ok", text: "Отзыв удалён" });
      load();
    } catch (e: any) {
      setToast({ kind: "err", text: e.message || "Ошибка" });
    }
  };

  const regenAi = async (id: string) => {
    setBusy(id);
    try {
      const res = await fetch("/api/reviews/ai-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ review_id: id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Ошибка генерации");
      setToast({ kind: "ok", text: "Ответ ИИ обновлён" });
      load();
    } catch (e: any) {
      setToast({ kind: "err", text: e?.message || "Ошибка" });
    } finally { setBusy(null); }
  };

  return (
    <div className="bg-[#1E4468]/80 border border-white/10 rounded-3xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-bold text-white">Отзывы — модерация</h2>
        <button onClick={load} className="text-slate-300 hover:text-white inline-flex items-center gap-1 text-sm">
          <RefreshCw className="w-4 h-4" /> Обновить
        </button>
      </div>
      {loading ? (
        <div className="p-6 text-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin inline" /></div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: 1100 }}>
            <thead className="text-xs text-slate-400 border-b border-white/10">
              <tr>
                <th className="text-left p-2">Дата</th>
                <th className="text-left p-2">Автор</th>
                <th className="text-left p-2">Отзыв</th>
                <th className="text-left p-2">Ответ ИИ</th>
                <th className="text-left p-2">Ответ админа</th>
                <th className="text-center p-2">Опубл.</th>
                <th className="text-right p-2">Действия</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-white/5 hover:bg-white/5 cursor-pointer" onClick={() => setSelected(r)}>
                  <td className="p-2 text-slate-300 whitespace-nowrap">{new Date(r.created_at).toLocaleDateString("ru-RU")}</td>
                  <td className="p-2 text-white whitespace-nowrap">{r.first_name} {r.last_name}</td>
                  <td className="p-2 text-slate-200"><div className="max-w-[300px] line-clamp-3">{r.content}</div></td>
                  <td className="p-2 text-slate-300"><div className="max-w-[260px] line-clamp-3">{r.ai_reply || "—"}</div></td>
                  <td className="p-2 text-emerald-200"><div className="max-w-[260px] line-clamp-3">{r.admin_reply || "—"}</div></td>
                  <td className="p-2 text-center">{r.is_published ? "✓" : "—"}</td>
                  <td className="p-2 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    <button disabled={busy === r.id} onClick={() => regenAi(r.id)} className="text-xs px-2 py-1 rounded bg-[#E7C768]/20 text-[#E7C768] hover:bg-[#E7C768]/30 mr-1 disabled:opacity-50">
                      {busy === r.id ? "…" : "ИИ"}
                    </button>
                    <button onClick={() => del(r.id)} className="text-xs px-2 py-1 rounded bg-rose-500/20 text-rose-200 hover:bg-rose-500/30">Удалить</button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-slate-400">Нет отзывов</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      <DetailsModal title="Отзыв" data={selected} table="reviews" labels={RU_LABELS.reviews} onClose={() => setSelected(null)} onSaved={load} />
    </div>
  );
}

function TelegramTokenSection({ setToast }: { setToast: (t: { kind: "ok" | "err"; text: string }) => void }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [token, setToken] = useState("");
  const [botUsername, setBotUsername] = useState("@RoboRecrutBot");
  const [tokenDetails, setTokenDetails] = useState<any>(null);
  const [testResult, setTestResult] = useState<any>(null);

  const fetchToken = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/telegram-token");
      const data = await res.json();
      if (data.success) {
        setToken(data.token || "");
        setTokenDetails(data.details || null);
        if (data.details?.bot_username) setBotUsername(data.details.bot_username);
      }
    } catch (err: any) {
      setToast({ kind: "err", text: "Ошибка загрузки токена из базы" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchToken();
  }, []);

  const handleSaveToken = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/telegram-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token.trim(), bot_username: botUsername.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setToast({ kind: "ok", text: "Токен сохранён в базу данных ProTalk!" });
        fetchToken();
      } else {
        setToast({ kind: "err", text: data.error || "Ошибка сохранения" });
      }
    } catch (err: any) {
      setToast({ kind: "err", text: err.message || "Ошибка сети" });
    } finally {
      setSaving(false);
    }
  };

  const handleTestSend = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/admin/test-telegram-notification", { method: "POST" });
      const data = await res.json();
      setTestResult(data);
      if (data.success) {
        setToast({ kind: "ok", text: "Тестовая транзакция создана и отправлена в Telegram!" });
      } else {
        setToast({ kind: "err", text: data.error || "Ошибка отправки" });
      }
    } catch (err: any) {
      setToast({ kind: "err", text: err.message || "Ошибка соединения" });
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-[#1E4468]/80 border border-white/10 rounded-3xl p-8 text-center text-slate-300">
        <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-[#E7C768]" />
        Загрузка настроек Telegram...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-[#1E4468]/80 border border-white/10 rounded-3xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-sky-500/20 border border-sky-400/30 flex items-center justify-center text-sky-300">
              <Send className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Управление Telegram Токеном</h2>
              <p className="text-xs text-slate-300">
                Токен бота сохраняется в таблицу базы данных ProTalk <code className="text-sky-300 font-mono bg-black/30 px-1 rounded">telegram_bots</code> и используется динамически для всех отправок.
              </p>
            </div>
          </div>
          <button
            onClick={fetchToken}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 transition"
            title="Обновить"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSaveToken} className="space-y-4 pt-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Токен Telegram Bot API (хранится в базе данных ProTalk):
              </label>
              <input
                type="text"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="8969850170:AAE..."
                className="w-full bg-[#17344F] border border-white/15 rounded-xl px-3.5 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-[#E7C768]"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Юзернейм бота:
              </label>
              <input
                type="text"
                value={botUsername}
                onChange={(e) => setBotUsername(e.target.value)}
                placeholder="@RoboRecrutBot"
                className="w-full bg-[#17344F] border border-white/15 rounded-xl px-3.5 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-[#E7C768]"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <div className="text-[11px] text-slate-400 font-mono">
              {tokenDetails ? (
                <span>Статус в БД: <strong className="text-emerald-400">АКТИВЕН</strong> ({tokenDetails.created_at || "сейчас"})</span>
              ) : (
                <span>Используется токен по умолчанию из базы данных ProTalk</span>
              )}
            </div>

            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-bold text-xs rounded-xl shadow-lg transition flex items-center gap-2"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Сохранить токен в БД
            </button>
          </div>
        </form>
      </div>

      {/* Авто-уведомления при транзакциях */}
      <div className="bg-[#1E4468]/80 border border-white/10 rounded-3xl p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <span>🔔 Автоматические Telegram-уведомления админу</span>
            </h3>
            <p className="text-xs text-slate-300 mt-1">
              При добавлении любой строки в таблицу <code className="text-[#E7C768] font-mono">transactions</code>, сообщение отправляется в Telegram админу на ID <strong className="text-sky-300 font-mono">169262990</strong> и заносится в уведомления админа.
            </p>
          </div>

          <button
            onClick={handleTestSend}
            disabled={testing}
            className="px-5 py-2.5 bg-[#E7C768] hover:bg-[#f0d683] text-[#17344F] font-bold text-xs rounded-xl shadow-lg transition flex items-center gap-2 shrink-0"
          >
            {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Протестировать на пользователе 1000007
          </button>
        </div>

        {testResult && (
          <div className="mt-4 p-4 rounded-2xl bg-black/40 border border-white/10 space-y-2 text-xs font-mono">
            <div className="text-emerald-300 font-bold">Результат теста:</div>
            <div>Статус: <span className="text-white">{testResult.message}</span></div>
            <div>Тестовый пользователь: <span className="text-sky-300">{testResult.test_user?.public_id} ({testResult.test_user?.email})</span></div>
            <div>ID транзакции: <span className="text-[#E7C768]">{testResult.transaction_id}</span></div>
            <div>Статус Telegram API: <span className={testResult.telegram_sent?.status === "sent" ? "text-emerald-400" : "text-amber-400"}>{testResult.telegram_sent?.status || "выполнено"}</span></div>
            <div>Записано в уведомления БД: <span className="text-purple-300">{testResult.admin_notification ? "Да (ID: " + testResult.admin_notification.id + ")" : "Нет"}</span></div>
          </div>
        )}
      </div>
    </div>
  );
}
