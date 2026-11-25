import React from "react";
import {
  Users,
  Building2,
  Briefcase,
  MessageSquare,
  GraduationCap,
  Mail,
  KeyRound,
  Wallet,
  BookOpen,
  FileText,
  Database,
} from "lucide-react";

export type SectionKey =
  | "clients"
  | "candidates"
  | "companies"
  | "vacancies"
  | "job_titles"
  | "interviews"
  | "trainings"
  | "blog"
  | "mailings"
  | "roles"
  | "accounts"
  | "logs"
  | "reviews";

export interface AdminSectionItem {
  key: SectionKey;
  label: string;
  icon: any;
}

export const SECTIONS: AdminSectionItem[] = [
  { key: "clients", label: "Клиенты", icon: Users },
  { key: "candidates", label: "Кандидаты", icon: Users },
  { key: "companies", label: "Компании", icon: Building2 },
  { key: "vacancies", label: "Вакансии", icon: Briefcase },
  { key: "job_titles", label: "Должности", icon: Database },
  { key: "interviews", label: "Интервью", icon: MessageSquare },
  { key: "trainings", label: "Обучения", icon: GraduationCap },
  { key: "blog", label: "Блог", icon: BookOpen },
  { key: "reviews", label: "Отзывы", icon: MessageSquare },
  { key: "mailings", label: "Рассылки", icon: Mail },
  { key: "roles", label: "Роли", icon: KeyRound },
  { key: "accounts", label: "Счета", icon: Wallet },
  { key: "logs", label: "Логи ИИ", icon: FileText },
];

export const GOLD_TEXT_CLASS =
  "bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent";

export const GOLD_BUTTON_CLASS =
  "bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] text-[#17344F] border border-[#E7C768] font-bold hover:brightness-105 active:scale-[0.99] transition shadow-lg cursor-pointer";

export const GLASS_CARD_CLASS =
  "bg-transparent backdrop-blur-xl border border-white/20 rounded-3xl shadow-xl";

export const SUPER_ADMIN_ROLE_SET = new Set([
  "super_admin",
  "super-admin",
  "superadmin",
  "супер-админ",
  "суперадмин",
]);

export const ADMIN_ROLE_SET = new Set([
  "admin",
  "админ",
  ...SUPER_ADMIN_ROLE_SET,
]);

export function isAdminOrSuperAdminRole(role: unknown): boolean {
  if (!role || typeof role !== "string") return false;
  return ADMIN_ROLE_SET.has(role.trim().toLowerCase());
}

export function isSuperAdminRole(role: unknown): boolean {
  if (!role || typeof role !== "string") return false;
  return SUPER_ADMIN_ROLE_SET.has(role.trim().toLowerCase());
}

export function isSuperAdminUser(
  user?: { role?: unknown; id?: unknown; publicId?: unknown; public_id?: unknown } | null
): boolean {
  if (!user) return false;
  if (isSuperAdminRole(user.role)) return true;
  const pid = String(user.publicId ?? user.public_id ?? "").replace(/^emp-?/i, "").trim();
  const id = String(user.id ?? "").trim();
  return pid === "100007" || id === "b5396cf9-9cd0-4614-a60d-ff77bae24ed5";
}

export function classifyClient(c: any): {
  key: "new" | "setup" | "active" | "paying";
  label: string;
  isPriority: boolean;
} {
  const hasTopup = Boolean(c?.has_topup) || Number(c?.balance_pay || 0) > 0;
  const candidatesCount = Number(c?.candidates_count || 0);
  const projectsCount = Number(c?.projects_count || 0);
  const companiesCount = Number(c?.companies_count || 0);

  if (hasTopup) {
    return { key: "paying", label: "Платящие", isPriority: true };
  }
  if (candidatesCount > 0) {
    return { key: "active", label: "С откликами", isPriority: true };
  }
  if (projectsCount > 0 || companiesCount > 0) {
    return { key: "setup", label: "Настройка", isPriority: false };
  }
  return { key: "new", label: "Новые", isPriority: false };
}

export const RU_LABELS: Record<string, Record<string, string>> = {
  employers: {
    id: "Идентификатор",
    public_id: "Публичный номер",
    user_id: "Номер пользователя",
    email: "Email",
    name: "Имя",
    company_name: "Компания",
    contact_name: "Контактное лицо",
    contact_email: "Контактный email",
    phone: "Телефон",
    contact_phone: "Контактный телефон",
    telegram_username: "Telegram username",
    contact_telegram: "Контактный Telegram",
    telegram_chat_id: "Telegram Chat ID",
    plan: "Тариф",
    status: "Статус",
    role: "Роль",
    registered_via: "Способ регистрации",
    ref_by: "Кто пригласил",
    referrer_id: "Номер реферера",
    bonus_granted: "Бонус начислен",
    offer_accepted: "Оферта принята",
    offer_accepted_at: "Дата оферты",
    offer_version: "Версия оферты",
    landing_credits: "Лимит вакансий",
    interview_setup_credits: "Лимит систем найма",
    training_setup_credits: "Лимит систем обучения",
    interview_credits: "Лимит интервью",
    training_credits: "Лимит обучений",
    balance: "Баланс RR (вычисляется)",
    companies_count: "Компаний, шт",
    projects_count: "Вакансий, шт",
    candidates_count: "Кандидатов, шт",
    has_topup: "Делал пополнения",
    created_at: "Создан",
    updated_at: "Обновлён",
  },
  companies: {
    name: "Название",
    slug: "Слаг адреса",
    logo_url: "Логотип",
    industry: "Отрасль",
    website: "Сайт",
    staff: "Штат",
    description_text: "Описание",
    products_text: "Продукты",
    mission_text: "Миссия",
    about_text: "О компании",
    team_text: "Команда",
    payouts_text: "Выплаты",
    schedule_text: "График",
    system_text: "Система работы",
    stats: "Статистика",
    status: "Статус",
    is_published: "Опубликована",
    owner_employer_id: "Владелец",
    created_at: "Создана",
    updated_at: "Обновлена",
    archived_at: "Архив с",
    deleted_at: "Удалена",
  },
  projects: {
    role_name: "Должность",
    salary_terms: "Зарплата",
    schedule_terms: "График",
    motivation_text: "Мотивация",
    custom_wiki: "Вики",
    logo_url: "Логотип",
    company_id: "Компания",
    employer_id: "Работодатель",
    is_published: "Опубликована",
    status: "Статус",
    slug: "Слаг адреса",
    vacancy_text: "Описание вакансии",
    max_interviews: "Лимит интервью на вакансию",
    max_trainings: "Лимит обучений на вакансию",
    created_at: "Создана",
    updated_at: "Обновлена",
  },
  candidate_scores: {
    candidate_id: "Кандидат",
    interview_score: "Балл за интервью",
    resume_score: "Балл за резюме",
    checklist_points: "Чек-лист (баллы)",
    roleplay_points: "Кейсы (баллы)",
    overall_score: "Итоговый балл",
    checklist_score: "Чек-лист %",
    checklist_sys_score: "Системный чек-лист %",
    situations_score: "Кейсы %",
    assessment_summary: "Резюме оценки",
    resume_feedback: "Фидбек по резюме",
    checklist_feedback: "Фидбек чек-листа",
    situations_feedback: "Фидбек кейсов",
    updated_at: "Обновлено",
  },
  candidate_stage_progress: {
    candidate_id: "Кандидат",
    stage: "Этап",
    attempts: "Попыток",
    best_score: "Лучший балл",
    last_score: "Последний балл",
    last_answers: "Последние ответы",
    last_feedback: "Последний фидбек",
    passed_at: "Пройдено",
    created_at: "Создано",
    updated_at: "Обновлено",
  },
  transactions: {
    wallet_id: "Кошелёк",
    type: "Тип",
    amount_rr: "Сумма RR",
    ref_table: "Источник (таблица)",
    ref_id: "Источник (запись)",
    note: "Комментарий",
    idem_key: "Ключ идемпотентности",
    created_at: "Дата",
  },
  logs: {
    channel_id: "Номер канала",
    channel_name: "Канал",
    bot_id: "Бот",
    llm: "Модель",
    user_message: "Сообщение пользователя",
    bot_reply: "Ответ нейросети",
    user_social_id: "Соц. профиль пользователя",
    api_key: "Ключ доступа",
    tokens_total: "Токенов всего",
    tokens_in_source: "Токены вход",
    tokens_out_source: "Токены выход",
    tokens_user: "Токены пользователя",
    function_error: "Ошибка функции",
    function_call_params: "Параметры вызова",
    server_name: "Сервер",
    created_at: "Дата",
  },
  reviews: {
    first_name: "Имя",
    last_name: "Фамилия",
    content: "Текст отзыва",
    ai_reply: "Ответ ИИ",
    admin_reply: "Ответ администратора",
    is_published: "Опубликован",
    created_at: "Создан",
    updated_at: "Обновлён",
  },
};

export const OMIT_KEYS: Record<string, string[]> = {
  employers: [
    "balance",
    "balance_start",
    "balance_pay",
    "balance_referral",
    "balance_admin",
    "balance_limits",
    "has_topup",
    "companies_count",
    "projects_count",
    "candidates_count",
    "stage_key",
    "landing_credits",
    "interview_setup_credits",
    "training_setup_credits",
    "interview_credits",
    "training_credits",
    "limits_json",
    "password_hash",
    "data_json",
    "legacy_public_id",
  ],
};

export const LIMIT_FIELDS: { key: string; label: string }[] = [
  { key: "landing_credits", label: "Вакансии (лендинги)" },
  { key: "interview_setup_credits", label: "Системы найма" },
  { key: "training_setup_credits", label: "Системы обучения" },
  { key: "interview_credits", label: "Интервью" },
  { key: "training_credits", label: "Обучения" },
];

export type EntityKind = "employer" | "company" | "project";

export const EntityNavContext = React.createContext<{
  openEntity: (kind: EntityKind, id: string) => void;
}>({
  openEntity: () => {},
});

export const useEntityNav = () => React.useContext(EntityNavContext);

export function EntityLink({
  kind,
  id,
  children,
}: {
  kind: EntityKind;
  id?: string | null;
  children: React.ReactNode;
}) {
  const { openEntity } = useEntityNav();
  if (!id) return <span className="text-slate-300 text-sm">{children || "—"}</span>;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        openEntity(kind, id);
      }}
      className="text-[#E7C768] hover:underline text-left text-sm break-words max-w-full cursor-pointer"
    >
      {children}
    </button>
  );
}

export const safeArray = (val: any): any[] =>
  Array.isArray(val) ? val : Array.isArray(val?.data) ? val.data : [];

export function safeAuthToken(): string {
  try {
    return (
      localStorage.getItem("emp_token") ||
      localStorage.getItem("employer_token") ||
      localStorage.getItem("admin_token") ||
      sessionStorage.getItem("emp_token") ||
      ""
    );
  } catch {
    return "";
  }
}
