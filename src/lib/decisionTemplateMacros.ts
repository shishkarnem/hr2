export type DecisionType = "invited" | "review" | "rejected";

export interface DecisionTemplate {
  id: string;
  employer_id: string;
  decision_type: DecisionType;
  title: string;
  body: string;
  is_default?: boolean;
  is_starter?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface MacroDefinition {
  tag: string;
  label: string;
  description: string;
  example: string;
}

export const DECISION_TYPE_META: Record<
  DecisionType,
  { title: string; shortTitle: string; modalTitle: string; submitLabel: string }
> = {
  invited: {
    title: "Пригласить на работу",
    shortTitle: "Приглашение",
    modalTitle: "Пригласить на работу",
    submitLabel: "Пригласить и уведомить",
  },
  review: {
    title: "На рассмотрении",
    shortTitle: "На рассмотрении",
    modalTitle: "Поставить на рассмотрение",
    submitLabel: "Сохранить и уведомить",
  },
  rejected: {
    title: "Отказать",
    shortTitle: "Отказ",
    modalTitle: "Отказать кандидату",
    submitLabel: "Отказать и уведомить",
  },
};

export const DECISION_MACROS: MacroDefinition[] = [
  { tag: "{{candidate_name}}", label: "ФИО кандидата", description: "Полное имя соискателя", example: "Иванов Иван" },
  { tag: "{{candidate_first_name}}", label: "Имя кандидата", description: "Первое имя для обращения", example: "Иван" },
  { tag: "{{vacancy_title}}", label: "Вакансия", description: "Название должности/вакансии", example: "Менеджер по продажам" },
  { tag: "{{company_name}}", label: "Компания", description: "Название компании-работодателя", example: "РентРОП" },
  { tag: "{{candidate_score}}", label: "Средний балл", description: "Итоговый балл кандидата (из 100)", example: "84/100" },
  { tag: "{{employer_name}}", label: "Имя ответственного", description: "ФИО ответственного работодателя", example: "Анна Петрова" },
  { tag: "{{employer_contacts}}", label: "Контакты работодателя", description: "Телефон, Telegram и Email ответственных", example: "+7 999 000-00-00 · @hr" },
  { tag: "{{employer_phone}}", label: "Телефон работодателя", description: "Контактный телефон", example: "+7 999 000-00-00" },
  { tag: "{{employer_telegram}}", label: "Telegram работодателя", description: "Ник или ссылка в Telegram", example: "@hr_manager" },
  { tag: "{{employer_email}}", label: "Email работодателя", description: "Почта для связи", example: "hr@company.ru" },
  { tag: "{{salary_terms}}", label: "Условия оплаты", description: "Зарплатная вилка из вакансии", example: "от 120 000 руб." },
  { tag: "{{schedule_terms}}", label: "График работы", description: "График из вакансии", example: "5/2, 09:00-18:00" },
  { tag: "{{decision_date}}", label: "Текущая дата", description: "Сегодняшняя дата", example: "23.11.2026" },
];

export interface DecisionMacroContext {
  candidate_name: string;
  candidate_first_name: string;
  candidate_email: string;
  candidate_phone: string;
  candidate_score: string;
  vacancy_title: string;
  company_name: string;
  salary_terms: string;
  schedule_terms: string;
  employer_name: string;
  employer_contacts: string;
  employer_phone: string;
  employer_telegram: string;
  employer_email: string;
  decision_date: string;
}

export const DEFAULT_DECISION_TEMPLATES: Record<DecisionType, DecisionTemplate> = {
  invited: {
    id: "__starter_invited",
    employer_id: "default",
    decision_type: "invited",
    title: "Стандартный шаблон приглашения",
    body:
      "Здравствуйте, {{candidate_name}}! Мы внимательно ознакомились с вашим резюме и результатами отбора на позицию «{{vacancy_title}}» в компании «{{company_name}}». Рады сообщить, что приняли положительное решение и приглашаем вас в команду! Для согласования даты выхода свяжитесь с нами: {{employer_contacts}}.",
    is_default: true,
    is_starter: true,
  },
  review: {
    id: "__starter_review",
    employer_id: "default",
    decision_type: "review",
    title: "Стандартный шаблон: на рассмотрении",
    body:
      "Здравствуйте, {{candidate_name}}! Ваша кандидатура на позицию «{{vacancy_title}}» в компании «{{company_name}}» (результат отбора: {{candidate_score}}) передана на рассмотрение руководителю. Мы свяжемся с вами сразу после финализации решения. Контакты для связи: {{employer_contacts}}.",
    is_default: true,
    is_starter: true,
  },
  rejected: {
    id: "__starter_rejected",
    employer_id: "default",
    decision_type: "rejected",
    title: "Стандартный шаблон отказа",
    body:
      "Здравствуйте, {{candidate_name}}! Благодарим вас за интерес к вакансии «{{vacancy_title}}» в компании «{{company_name}}» и время, уделённое отбору. В настоящий момент мы остановились на кандидате, чей опыт ближе к текущим задачам. Ваше резюме сохранено в кадровом резерве. С уважением, {{employer_name}}.",
    is_default: true,
    is_starter: true,
  },
};

function readCurrentEmployerFromStorage(): any {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem("emp_user") : null;
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

export function buildDecisionMacroContext(params: {
  candidate?: any;
  scores?: any;
  project?: any;
  company?: any;
  responsibleContacts?: any[];
}): DecisionMacroContext {
  const c = params.candidate || {};
  const s = params.scores || {};
  const pr = params.project || {};
  const co = params.company || {};
  const respList = Array.isArray(params.responsibleContacts) ? params.responsibleContacts : [];
  const empStorage = readCurrentEmployerFromStorage();

  const candFullName = String(c.full_name || c.resume_name || "Кандидат").trim();
  const candFirstName = candFullName.split(/\s+/)[0] || candFullName;
  const ovr = s?.overall_score ?? c?.overall_score ?? c?.score;
  const scoreFormatted =
    ovr !== null && ovr !== undefined && Number.isFinite(Number(ovr))
      ? `${Math.round(Number(ovr))}/100`
      : "—";

  const primaryResp = respList[0] || empStorage || {};
  const empName = String(
    primaryResp.name ||
      primaryResp.contact_name ||
      co.contact_name ||
      co.name ||
      "Команда подбора"
  ).trim();

  const contactEntries: string[] = [];
  if (respList.length > 0) {
    for (const r of respList) {
      const chunks: string[] = [];
      if (r.name) chunks.push(String(r.name).trim());
      if (r.phone) chunks.push(String(r.phone).trim());
      if (r.telegram) {
        const tg = String(r.telegram).trim();
        chunks.push(tg.startsWith("@") || tg.startsWith("http") ? tg : `@${tg}`);
      }
      if (r.email) chunks.push(String(r.email).trim());
      if (chunks.length > 0) contactEntries.push(chunks.join(", "));
    }
  } else if (empStorage) {
    const chunks: string[] = [];
    if (empStorage.contact_phone || empStorage.phone) chunks.push(empStorage.contact_phone || empStorage.phone);
    if (empStorage.contact_telegram || empStorage.telegram_username) {
      const tg = String(empStorage.contact_telegram || empStorage.telegram_username).trim();
      chunks.push(tg.startsWith("@") || tg.startsWith("http") ? tg : `@${tg}`);
    }
    if (empStorage.contact_email || empStorage.email) chunks.push(empStorage.contact_email || empStorage.email);
    if (chunks.length > 0) contactEntries.push(chunks.join(", "));
  }

  const empPhone = String(primaryResp.phone || primaryResp.contact_phone || "").trim();
  const rawTg = String(primaryResp.telegram || primaryResp.contact_telegram || primaryResp.telegram_username || "").trim();
  const empTg = rawTg ? (rawTg.startsWith("@") || rawTg.startsWith("http") ? rawTg : `@${rawTg}`) : "";
  const empEmail = String(primaryResp.email || primaryResp.contact_email || "").trim();

  return {
    candidate_name: candFullName,
    candidate_first_name: candFirstName,
    candidate_email: String(c.email || "").trim(),
    candidate_phone: String(c.phone || "").trim(),
    candidate_score: scoreFormatted,
    vacancy_title: String(pr.role_name || c.role_name || "Вакансия").trim(),
    company_name: String(co.name || pr.company_name || "Наша компания").trim(),
    salary_terms: String(pr.salary_terms || "по условиям вакансии").trim(),
    schedule_terms: String(pr.schedule_terms || "согласно графику").trim(),
    employer_name: empName,
    employer_contacts: contactEntries.join(" | ") || empPhone || empTg || empEmail || "ответственный менеджер",
    employer_phone: empPhone || "по контактам компании",
    employer_telegram: empTg || "по контактам компании",
    employer_email: empEmail || "по контактам компании",
    decision_date: new Date().toLocaleDateString("ru-RU"),
  };
}

export function applyDecisionMacros(templateText: string, ctx: DecisionMacroContext): string {
  if (!templateText) return "";
  let out = String(templateText);
  const replacements: Record<string, string> = {
    "{{candidate_name}}": ctx.candidate_name,
    "{{candidate_first_name}}": ctx.candidate_first_name,
    "{{candidate_email}}": ctx.candidate_email,
    "{{candidate_phone}}": ctx.candidate_phone,
    "{{candidate_score}}": ctx.candidate_score,
    "{{vacancy_title}}": ctx.vacancy_title,
    "{{company_name}}": ctx.company_name,
    "{{salary_terms}}": ctx.salary_terms,
    "{{schedule_terms}}": ctx.schedule_terms,
    "{{employer_name}}": ctx.employer_name,
    "{{employer_contacts}}": ctx.employer_contacts,
    "{{employer_phone}}": ctx.employer_phone,
    "{{employer_telegram}}": ctx.employer_telegram,
    "{{employer_email}}": ctx.employer_email,
    "{{decision_date}}": ctx.decision_date,
  };
  for (const [token, val] of Object.entries(replacements)) {
    out = out.split(token).join(val);
  }
  return out;
}
