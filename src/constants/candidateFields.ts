export type CandidateFieldType = "text" | "multiselect";

export interface StandardCandidateFieldDef {
  key: string;
  dbColumn: string;
  label: string;
  type: CandidateFieldType;
  category: "main" | "contacts" | "location" | "work" | "qualifications";
  options?: string[];
  placeholder?: string;
}

export interface CustomCandidateFieldDef {
  id: string;
  key: string;
  label: string;
  type: CandidateFieldType;
  options?: string[];
  placeholder?: string;
  description?: string;
}

export interface VacancyCandidateFieldsConfig {
  standardFieldsEnabled?: boolean;
  customFields: CustomCandidateFieldDef[];
}

export const STANDARD_CANDIDATE_FIELDS: StandardCandidateFieldDef[] = [
  { key: "full_name", dbColumn: "full_name", label: "ФИО", type: "text", category: "main", placeholder: "Иванов Иван Иванович" },
  {
    key: "gender",
    dbColumn: "gender",
    label: "Пол",
    type: "multiselect",
    category: "main",
    options: ["Мужской", "Женский", "Не указан"],
  },
  { key: "resume_url", dbColumn: "resume_url", label: "Ссылка на резюме (URL)", type: "text", category: "main", placeholder: "https://..." },
  { key: "phone", dbColumn: "phone", label: "Телефон", type: "text", category: "contacts", placeholder: "+7 (999) 000-00-00" },
  { key: "email", dbColumn: "email", label: "Email", type: "text", category: "contacts", placeholder: "name@example.com" },
  { key: "telegram", dbColumn: "telegram", label: "Телеграм", type: "text", category: "contacts", placeholder: "@username" },
  { key: "whatsapp", dbColumn: "whatsapp", label: "WhatsApp", type: "text", category: "contacts", placeholder: "+7..." },
  { key: "telegram_alt", dbColumn: "telegram_alt", label: "Telegram", type: "text", category: "contacts", placeholder: "@username или ссылка" },
  { key: "instagram", dbColumn: "instagram", label: "Instagram", type: "text", category: "contacts", placeholder: "@username или ссылка" },
  { key: "vk", dbColumn: "vk", label: "ВКонтакте", type: "text", category: "contacts", placeholder: "https://vk.com/..." },
  { key: "max_messenger", dbColumn: "max_messenger", label: "MAX", type: "text", category: "contacts", placeholder: "Профиль или контакт MAX" },
  { key: "setka", dbColumn: "setka", label: "Сетка", type: "text", category: "contacts", placeholder: "Профиль в Сетке" },
  { key: "github", dbColumn: "github", label: "GitHub", type: "text", category: "contacts", placeholder: "https://github.com/..." },
  { key: "country", dbColumn: "country", label: "Страна", type: "text", category: "location", placeholder: "Россия" },
  { key: "region", dbColumn: "region", label: "Регион", type: "text", category: "location", placeholder: "Московская область" },
  { key: "city", dbColumn: "city", label: "Город (населенный пункт)", type: "text", category: "location", placeholder: "Москва" },
  {
    key: "citizenship",
    dbColumn: "citizenship",
    label: "Гражданство",
    type: "multiselect",
    category: "location",
    options: ["РФ", "Беларусь", "Казахстан", "Узбекистан", "Кыргызстан", "Армения", "Другое"],
  },
  {
    key: "experience_summary",
    dbColumn: "experience_summary",
    label: "Опыт работы",
    type: "text",
    category: "work",
    placeholder: "Стаж и ключевые места работы",
  },
  {
    key: "employment_type",
    dbColumn: "employment_type",
    label: "Занятость",
    type: "multiselect",
    category: "work",
    options: ["Полная занятость", "Частичная занятость", "Проектная работа", "Стажировка", "Волонтерство"],
  },
  {
    key: "specializations",
    dbColumn: "specializations",
    label: "Специализации",
    type: "multiselect",
    category: "work",
    options: ["Продажи", "Маркетинг", "IT / Разработка", "Дизайн", "HR / Кадры", "Финансы / Бухгалтерия", "Логистика", "Администрирование", "Управление", "Консультирование"],
  },
  {
    key: "work_schedule",
    dbColumn: "work_schedule",
    label: "График работы",
    type: "multiselect",
    category: "work",
    options: ["Полный день", "Удаленная работа", "Гибридный график", "Сменный график", "Гибкий график", "Вахтовый метод"],
  },
  {
    key: "travel_time",
    dbColumn: "travel_time",
    label: "Желательное время в пути до работы",
    type: "multiselect",
    category: "work",
    options: ["Не имеет значения", "Не более 1 часа", "Не более 1,5 часов", "Только удаленно"],
  },
  {
    key: "salary_expectation",
    dbColumn: "salary_expectation",
    label: "Желаемая зарплата",
    type: "text",
    category: "work",
    placeholder: "Например: 120 000 руб.",
  },
  {
    key: "education",
    dbColumn: "education",
    label: "Образование",
    type: "multiselect",
    category: "qualifications",
    options: ["Высшее", "Неоконченное высшее", "Среднее специальное", "Среднее", "Магистратура / MBA", "Кандидат / Доктор наук"],
  },
  {
    key: "languages",
    dbColumn: "languages",
    label: "Знание языков",
    type: "multiselect",
    category: "qualifications",
    options: ["Русский", "Английский (A1-A2)", "Английский (B1-B2)", "Английский (C1-C2)", "Немецкий", "Китайский", "Испанский", "Французский"],
  },
  {
    key: "skills",
    dbColumn: "skills",
    label: "Навыки",
    type: "multiselect",
    category: "qualifications",
    options: ["Переговоры", "CRM", "B2B продажи", "B2C продажи", "Работа с возражениями", "Аналитика", "Управление командой", "1С", "Excel", "Презентации"],
  },
  {
    key: "driving_experience",
    dbColumn: "DrivingExperience",
    label: "Опыт вождения",
    type: "multiselect",
    category: "qualifications",
    options: ["Нет", "Категория A", "Категория B", "Категория C", "Категория D", "Категория E", "Личный автомобиль"],
  },
];

export const STANDARD_FIELD_CATEGORIES: Record<StandardCandidateFieldDef["category"], string> = {
  main: "Основные данные",
  contacts: "Контакты и соцсети",
  location: "Локация и гражданство",
  work: "Опыт и условия работы",
  qualifications: "Образование, навыки и вождение",
};

export function parseMultiselectArray(raw: any): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return Array.from(new Set(raw.map((x) => String(x ?? "").trim()).filter(Boolean)));
  }
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return Array.from(new Set(parsed.map((x) => String(x ?? "").trim()).filter(Boolean)));
        }
      } catch {}
    }
    return Array.from(
      new Set(
        trimmed
          .split(/[,;\n]+/)
          .map((s) => s.trim())
          .filter(Boolean)
      )
    );
  }
  return [];
}

export function normalizeStandardFieldsFromCandidate(cand: any): Record<string, any> {
  const result: Record<string, any> = {};
  if (!cand || typeof cand !== "object") {
    for (const f of STANDARD_CANDIDATE_FIELDS) {
      result[f.key] = f.type === "multiselect" ? [] : "";
    }
    return result;
  }

  let parsedStd: Record<string, any> = {};
  const rawStd = cand.standard_fields_json ?? cand.standardFields;
  if (rawStd) {
    if (typeof rawStd === "string") {
      try {
        parsedStd = JSON.parse(rawStd);
      } catch {}
    } else if (typeof rawStd === "object") {
      parsedStd = rawStd;
    }
  }

  for (const field of STANDARD_CANDIDATE_FIELDS) {
    const rawVal =
      parsedStd[field.key] !== undefined && parsedStd[field.key] !== null && parsedStd[field.key] !== ""
        ? parsedStd[field.key]
        : cand[field.key] !== undefined && cand[field.key] !== null && cand[field.key] !== ""
        ? cand[field.key]
        : cand[field.dbColumn] !== undefined && cand[field.dbColumn] !== null && cand[field.dbColumn] !== ""
        ? cand[field.dbColumn]
        : field.key === "full_name"
        ? cand.name || cand.full_name || ""
        : field.key === "telegram" || field.key === "telegram_alt"
        ? cand.telegram || cand.telegram_alt || ""
        : field.key === "driving_experience"
        ? cand.DrivingExperience || cand.driving_experience || []
        : undefined;

    if (field.type === "multiselect") {
      result[field.key] = parseMultiselectArray(rawVal);
    } else {
      if (Array.isArray(rawVal)) {
        result[field.key] = rawVal.filter(Boolean).join(", ");
      } else if (rawVal === null || rawVal === undefined) {
        result[field.key] = "";
      } else {
        result[field.key] = String(rawVal).trim();
      }
    }
  }

  if (!result.telegram_alt && result.telegram) result.telegram_alt = result.telegram;
  if (!result.telegram && result.telegram_alt) result.telegram = result.telegram_alt;

  return result;
}

export function normalizeCustomFieldsFromCandidate(cand: any): Record<string, any> {
  if (!cand || typeof cand !== "object") return {};
  const rawCustom = cand.custom_fields_json ?? cand.customFields;
  if (!rawCustom) return {};
  let parsed: Record<string, any> = {};
  if (typeof rawCustom === "string") {
    try {
      parsed = JSON.parse(rawCustom);
    } catch {
      return {};
    }
  } else if (typeof rawCustom === "object") {
    parsed = { ...rawCustom };
  }
  return parsed || {};
}

export function parseVacancyCustomFieldsConfig(rawConfig: any): VacancyCandidateFieldsConfig {
  const defaultFields: CustomCandidateFieldDef[] = [
    { id: "cf_linkedin", key: "linkedin", label: "LinkedIn", type: "text", placeholder: "Ссылка на профиль LinkedIn" },
    { id: "cf_youtube", key: "youtube", label: "Ютуб", type: "text", placeholder: "Ссылка на YouTube" },
    { id: "cf_portfolio", key: "portfolio", label: "Портфолио", type: "text", placeholder: "Ссылка на портфолио или кейсы" },
    {
      id: "cf_former_employers_contacts",
      key: "former_employers_contacts",
      label: "Контакты бывших работодателей",
      type: "text",
      placeholder: "Рекомендации и контакты руководителей",
    },
    {
      id: "cf_other_links",
      key: "other_links",
      label: "Прочие ссылки",
      type: "multiselect",
      options: ["Behance", "Dribbble", "Habr Career", "VC.ru", "Личный сайт", "Сертификаты"],
      placeholder: "Дополнительные ссылки",
    },
  ];

  if (!rawConfig) {
    return { standardFieldsEnabled: true, customFields: defaultFields };
  }
  let obj = rawConfig;
  if (typeof rawConfig === "string") {
    try {
      obj = JSON.parse(rawConfig);
    } catch {
      return { standardFieldsEnabled: true, customFields: defaultFields };
    }
  }
  if (Array.isArray(obj)) {
    return {
      standardFieldsEnabled: true,
      customFields: obj.filter((f) => f && f.key && f.label),
    };
  }
  if (obj && typeof obj === "object" && Array.isArray(obj.customFields)) {
    return {
      standardFieldsEnabled: true,
      customFields: obj.customFields.filter((f: any) => f && f.key && f.label),
    };
  }
  return { standardFieldsEnabled: true, customFields: defaultFields };
}

export function formatCandidateFieldValueForDisplay(val: any): string {
  if (val === null || val === undefined) return "—";
  if (Array.isArray(val)) {
    const clean = val.map((x) => String(x ?? "").trim()).filter(Boolean);
    return clean.length > 0 ? clean.join(", ") : "—";
  }
  const str = String(val).trim();
  if (!str) return "—";
  if (str.startsWith("[") && str.endsWith("]")) {
    const arr = parseMultiselectArray(str);
    return arr.length > 0 ? arr.join(", ") : "—";
  }
  return str;
}
