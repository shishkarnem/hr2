export type CandidateFieldType = "text" | "multiselect";

export interface CandidateCustomFieldDef {
  id: string;
  key: string;
  label: string;
  type: CandidateFieldType;
  options?: string[];
  required?: boolean;
  placeholder?: string;
  hint?: string;
}

export interface CandidateStandardFieldDef {
  key: string;
  label: string;
  type: CandidateFieldType;
  group: "contacts" | "socials" | "location" | "career" | "skills";
  options?: string[];
  placeholder?: string;
}

export interface VacancyCandidateFieldsConfig {
  enabledStandardFields?: string[];
  customFields: CandidateCustomFieldDef[];
}

export const STANDARD_CANDIDATE_FIELDS: CandidateStandardFieldDef[] = [
  {
    key: "full_name",
    label: "ФИО",
    type: "text",
    group: "contacts",
    placeholder: "Иванов Иван Иванович",
  },
  {
    key: "gender",
    label: "Пол",
    type: "multiselect",
    group: "contacts",
    options: ["Мужской", "Женский"],
    placeholder: "Выберите пол",
  },
  {
    key: "resume_url",
    label: "Ссылка на резюме (URL)",
    type: "text",
    group: "contacts",
    placeholder: "https://hh.ru/resume/...",
  },
  {
    key: "phone",
    label: "Телефон",
    type: "text",
    group: "contacts",
    placeholder: "+7 (999) 000-00-00",
  },
  {
    key: "email",
    label: "Email",
    type: "text",
    group: "contacts",
    placeholder: "name@example.com",
  },
  {
    key: "social_telegram",
    label: "Телеграм (Telegram)",
    type: "text",
    group: "socials",
    placeholder: "@username или https://t.me/...",
  },
  {
    key: "social_whatsapp",
    label: "WhatsApp",
    type: "text",
    group: "socials",
    placeholder: "+79990000000 или wa.me/...",
  },
  {
    key: "social_instagram",
    label: "Instagram",
    type: "text",
    group: "socials",
    placeholder: "@username",
  },
  {
    key: "social_vk",
    label: "ВКонтакте",
    type: "text",
    group: "socials",
    placeholder: "https://vk.com/...",
  },
  {
    key: "social_max",
    label: "MAX",
    type: "text",
    group: "socials",
    placeholder: "Профиль в мессенджере MAX",
  },
  {
    key: "social_setka",
    label: "Сетка",
    type: "text",
    group: "socials",
    placeholder: "Профиль в соцсети Сетка",
  },
  {
    key: "social_github",
    label: "GitHub",
    type: "text",
    group: "socials",
    placeholder: "https://github.com/...",
  },
  {
    key: "country",
    label: "Страна",
    type: "text",
    group: "location",
    placeholder: "Россия",
  },
  {
    key: "region",
    label: "Регион",
    type: "text",
    group: "location",
    placeholder: "Московская область",
  },
  {
    key: "city",
    label: "Город (населенный пункт)",
    type: "text",
    group: "location",
    placeholder: "Москва",
  },
  {
    key: "citizenship",
    label: "Гражданство",
    type: "text",
    group: "location",
    placeholder: "РФ",
  },
  {
    key: "work_experience",
    label: "Опыт работы",
    type: "text",
    group: "career",
    options: ["Без опыта", "До 1 года", "От 1 года до 3 лет", "От 3 до 6 лет", "Более 6 лет"],
    placeholder: "Например: 5 лет 4 месяца (руководитель отдела продаж)",
  },
  {
    key: "employment_type",
    label: "Занятость",
    type: "multiselect",
    group: "career",
    options: [
      "Полная занятость",
      "Частичная занятость",
      "Проектная работа",
      "Стажировка",
      "ГПХ / Самозанятость",
    ],
    placeholder: "Выберите тип занятости",
  },
  {
    key: "specializations",
    label: "Специализации",
    type: "multiselect",
    group: "career",
    options: [
      "Продажи B2B",
      "Продажи B2C",
      "Управление продажами (РОП)",
      "Маркетинг и PR",
      "HR и рекрутинг",
      "IT и разработка",
      "Финансы и бухгалтерия",
      "Управление проектами",
      "Клиентский сервис",
      "Административный персонал",
    ],
    placeholder: "Укажите специализации",
  },
  {
    key: "work_schedule",
    label: "График работы",
    type: "multiselect",
    group: "career",
    options: [
      "Полный день",
      "Удаленная работа",
      "Гибридный график",
      "Гибкий график",
      "Сменный график",
      "Вахтовый метод",
    ],
    placeholder: "Выберите график работы",
  },
  {
    key: "desired_commute_time",
    label: "Желательное время в пути до работы",
    type: "text",
    group: "career",
    options: ["Не имеет значения", "Не более часа", "Не более полутора часов"],
    placeholder: "Не имеет значения / до 1 часа",
  },
  {
    key: "desired_salary",
    label: "Желаемая зарплата",
    type: "text",
    group: "career",
    placeholder: "Например: от 150 000 ₽ на руки",
  },
  {
    key: "education",
    label: "Образование",
    type: "text",
    group: "career",
    options: ["Высшее", "Неоконченное высшее", "Среднее специальное", "Среднее"],
    placeholder: "Высшее, название ВУЗа, специальность",
  },
  {
    key: "languages",
    label: "Знание языков",
    type: "multiselect",
    group: "skills",
    options: [
      "Русский — Родной",
      "Английский — A1/A2 (Базовый)",
      "Английский — B1/B2 (Средний / Продвинутый)",
      "Английский — C1/C2 (Свободный)",
      "Немецкий",
      "Китайский",
      "Испанский",
      "Французский",
    ],
    placeholder: "Выберите или добавьте языки",
  },
  {
    key: "skills",
    label: "Навыки",
    type: "multiselect",
    group: "skills",
    options: [
      "B2B продажи",
      "Ведение переговоров",
      "amoCRM",
      "Битрикс24",
      "1С",
      "Холодные звонки",
      "Управление командой",
      "Аналитика продаж",
      "Работа с возражениями",
      "Деловая переписка",
    ],
    placeholder: "Добавьте ключевые навыки",
  },
  {
    key: "driving_experience",
    label: "Опыт вождения",
    type: "multiselect",
    group: "skills",
    options: [
      "Права категории B",
      "Права категории A",
      "Права категории C",
      "Права категории D",
      "Права категории E",
      "Есть личный автомобиль",
      "Нет водительских прав",
    ],
    placeholder: "Категории прав и наличие авто",
  },
];

export const CUSTOM_FIELD_PRESET_SUGGESTIONS: CandidateCustomFieldDef[] = [
  {
    id: "preset_linkedin",
    key: "linkedin",
    label: "Профиль LinkedIn",
    type: "text",
    placeholder: "https://linkedin.com/in/...",
  },
  {
    id: "preset_youtube",
    key: "youtube",
    label: "YouTube / Видеовизитка",
    type: "text",
    placeholder: "Ссылка на YouTube или видеопрезентацию",
  },
  {
    id: "preset_portfolio",
    key: "portfolio",
    label: "Портфолио / Кейсы",
    type: "text",
    placeholder: "Ссылка на портфолио, Behance, Google Drive или сайт",
  },
  {
    id: "preset_former_employers",
    key: "former_employers_contacts",
    label: "Контакты бывших работодателей (рекомендации)",
    type: "text",
    placeholder: "ФИО, должность, телефон или Telegram рекомендателя",
  },
  {
    id: "preset_relatives_contacts",
    key: "relatives_contacts",
    label: "Контакты близких (экстренный контакт)",
    type: "text",
    placeholder: "ФИО, кем приходится, телефон",
  },
  {
    id: "preset_other_links",
    key: "other_links",
    label: "Прочие ссылки",
    type: "text",
    placeholder: "Ссылки на публикации, блоги, проекты",
  },
];

export function slugifyFieldKey(label: string, fallbackIdx: number = 1): string {
  const ru: Record<string, string> = {
    а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "zh",
    з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o",
    п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts",
    ч: "ch", ш: "sh", щ: "shch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
  };
  const slug = String(label || "")
    .toLowerCase()
    .split("")
    .map((c) => (ru[c] !== undefined ? ru[c] : c))
    .join("")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return slug || `custom_field_${fallbackIdx}`;
}

export function normalizeMultiselectValue(val: any): string[] {
  if (!val) return [];
  if (Array.isArray(val)) {
    return Array.from(
      new Set(
        val
          .map((v) => String(v ?? "").trim())
          .filter(Boolean)
      )
    );
  }
  if (typeof val === "string") {
    const trimmed = val.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return Array.from(new Set(parsed.map((v) => String(v ?? "").trim()).filter(Boolean)));
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
  return [String(val).trim()].filter(Boolean);
}

export function formatFieldValueForDisplay(val: any): string {
  if (val === null || val === undefined) return "";
  if (Array.isArray(val)) return val.filter(Boolean).join(", ");
  if (typeof val === "string") {
    const trimmed = val.trim();
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return parsed.filter(Boolean).join(", ");
      } catch {}
    }
    return trimmed;
  }
  return String(val);
}

export function parseVacancyCandidateFieldsConfig(raw: any): VacancyCandidateFieldsConfig {
  const defaultEnabled = STANDARD_CANDIDATE_FIELDS.map((f) => f.key);
  if (!raw) {
    return {
      enabledStandardFields: defaultEnabled,
      customFields: [],
    };
  }
  let obj: any = raw;
  if (typeof raw === "string") {
    const t = raw.trim();
    if (!t) return { enabledStandardFields: defaultEnabled, customFields: [] };
    try {
      obj = JSON.parse(t);
    } catch {
      return { enabledStandardFields: defaultEnabled, customFields: [] };
    }
  }
  if (!obj || typeof obj !== "object") {
    return { enabledStandardFields: defaultEnabled, customFields: [] };
  }
  const rawCustom = Array.isArray(obj.customFields)
    ? obj.customFields
    : Array.isArray(obj.custom_fields)
    ? obj.custom_fields
    : Array.isArray(obj)
    ? obj
    : [];

  const seenKeys = new Set<string>();
  const customFields: CandidateCustomFieldDef[] = [];
  rawCustom.forEach((item: any, idx: number) => {
    if (!item || typeof item !== "object") return;
    const label = String(item.label || item.name || item.title || "").trim();
    if (!label) return;
    let key = String(item.key || slugifyFieldKey(label, idx + 1)).trim();
    if (!key) key = `custom_${idx + 1}`;
    if (seenKeys.has(key)) key = `${key}_${idx + 1}`;
    seenKeys.add(key);

    const type: CandidateFieldType =
      item.type === "multiselect" || item.type === "multichoice" || item.type === "select" || Array.isArray(item.options) && item.options.length > 0 && item.type !== "text"
        ? "multiselect"
        : "text";

    const options =
      type === "multiselect"
        ? normalizeMultiselectValue(item.options || item.choices || [])
        : undefined;

    customFields.push({
      id: String(item.id || `cf_${key}_${idx}`),
      key,
      label,
      type,
      options: options && options.length > 0 ? options : type === "multiselect" ? ["Да", "Нет", "Частично"] : undefined,
      required: Boolean(item.required),
      placeholder: item.placeholder ? String(item.placeholder) : undefined,
      hint: item.hint || item.description ? String(item.hint || item.description) : undefined,
    });
  });

  const enabledStandardFields = Array.isArray(obj.enabledStandardFields || obj.standard_fields)
    ? (obj.enabledStandardFields || obj.standard_fields).map(String)
    : defaultEnabled;

  return {
    enabledStandardFields,
    customFields,
  };
}

export function extractStandardFieldsFromCandidateRow(cand: any): Record<string, any> {
  if (!cand) return {};
  let stdJson: Record<string, any> = {};
  if (cand.standard_fields_json) {
    try {
      stdJson = typeof cand.standard_fields_json === "string"
        ? JSON.parse(cand.standard_fields_json)
        : cand.standard_fields_json;
    } catch {}
  }
  let dataJson: Record<string, any> = {};
  if (cand.data_json) {
    try {
      dataJson = typeof cand.data_json === "string" ? JSON.parse(cand.data_json) : cand.data_json;
    } catch {}
  }
  const fromDataStd = dataJson?.standard_fields || dataJson?.extracted_standard_fields || {};

  const result: Record<string, any> = {};
  for (const def of STANDARD_CANDIDATE_FIELDS) {
    const k = def.key;
    let rawVal =
      cand[k] !== undefined && cand[k] !== null && String(cand[k]).trim() !== ""
        ? cand[k]
        : stdJson?.[k] !== undefined && stdJson?.[k] !== null && String(stdJson[k]).trim() !== ""
        ? stdJson[k]
        : fromDataStd?.[k];

    // Legacy camelCase fallbacks
    if ((rawVal === undefined || rawVal === null || rawVal === "") && k === "full_name") {
      rawVal = cand.fullName || cand.name || "";
    }
    if ((rawVal === undefined || rawVal === null || rawVal === "") && k === "resume_url") {
      rawVal = cand.resumeUrl || "";
    }
    if ((rawVal === undefined || rawVal === null || rawVal === "") && k === "social_telegram") {
      rawVal = cand.socialTelegram || stdJson?.telegram || fromDataStd?.telegram || "";
    }
    if ((rawVal === undefined || rawVal === null || rawVal === "") && k === "social_whatsapp") {
      rawVal = cand.socialWhatsapp || stdJson?.whatsapp || fromDataStd?.whatsapp || "";
    }
    if ((rawVal === undefined || rawVal === null || rawVal === "") && k === "social_instagram") {
      rawVal = cand.socialInstagram || stdJson?.instagram || fromDataStd?.instagram || "";
    }
    if ((rawVal === undefined || rawVal === null || rawVal === "") && k === "social_vk") {
      rawVal = cand.socialVk || stdJson?.vk || fromDataStd?.vk || "";
    }
    if ((rawVal === undefined || rawVal === null || rawVal === "") && k === "social_max") {
      rawVal = cand.socialMax || stdJson?.max || fromDataStd?.max || "";
    }
    if ((rawVal === undefined || rawVal === null || rawVal === "") && k === "social_setka") {
      rawVal = cand.socialSetka || stdJson?.setka || fromDataStd?.setka || "";
    }
    if ((rawVal === undefined || rawVal === null || rawVal === "") && k === "social_github") {
      rawVal = cand.socialGithub || stdJson?.github || fromDataStd?.github || "";
    }

    if (def.type === "multiselect") {
      result[k] = normalizeMultiselectValue(rawVal);
    } else {
      result[k] = rawVal !== undefined && rawVal !== null ? formatFieldValueForDisplay(rawVal) : "";
    }
  }
  return result;
}

export function extractCustomFieldsFromCandidateRow(cand: any): Record<string, any> {
  if (!cand) return {};
  let customJson: Record<string, any> = {};
  if (cand.custom_fields_json) {
    try {
      customJson = typeof cand.custom_fields_json === "string"
        ? JSON.parse(cand.custom_fields_json)
        : cand.custom_fields_json;
    } catch {}
  }
  if (Object.keys(customJson).length > 0) return customJson;

  if (cand.data_json) {
    try {
      const dj = typeof cand.data_json === "string" ? JSON.parse(cand.data_json) : cand.data_json;
      if (dj?.custom_fields && typeof dj.custom_fields === "object") return dj.custom_fields;
      if (dj?.extracted_custom_fields && typeof dj.extracted_custom_fields === "object") return dj.extracted_custom_fields;
    } catch {}
  }
  if (cand.customFields && typeof cand.customFields === "object") {
    return cand.customFields;
  }
  return {};
}

export function extractFieldsFromResumeText(
  resumeText: string,
  customDefs: CandidateCustomFieldDef[] = [],
  options?: { uploadedFileUrl?: string }
): {
  standard_fields: Record<string, any>;
  custom_fields: Record<string, any>;
} {
  const std: Record<string, any> = {};
  const custom: Record<string, any> = {};
  if (options?.uploadedFileUrl && String(options.uploadedFileUrl).trim()) {
    std.resume_url = String(options.uploadedFileUrl).trim();
  }
  const text = String(resumeText || "").trim();
  if (!text) {
    return { standard_fields: std, custom_fields: custom };
  }

  // 1. Full name
  const fioBlock = text.match(/##\s*ФИО\s*[\r\n]+\*\*([^\n*]+)\*\*/i);
  const h1Match = text.match(/^#\s+([^\r\n#]+)/m);
  const h2NameMatch = text.match(/^#\s*Резюме\s*[\r\n]+##\s*([^\r\n#*]+)/im);
  if (fioBlock?.[1]) {
    std.full_name = fioBlock[1].trim();
  } else if (h2NameMatch?.[1] && !/^(контакты|фио|цель|опыт)/i.test(h2NameMatch[1].trim())) {
    std.full_name = h2NameMatch[1].trim();
  } else if (h1Match?.[1] && !/^резюме$/i.test(h1Match[1].trim())) {
    std.full_name = h1Match[1].replace(/\*\*/g, "").trim();
  }

  // 2. Gender
  if (/\b(женщина|женский|родилась|готова к переезду|не готова к переезду)\b/i.test(text)) {
    std.gender = ["Женский"];
  } else if (/\b(мужчина|мужской|родился|готов к переезду|не готов к переезду)\b/i.test(text)) {
    std.gender = ["Мужской"];
  }

  // 3. Phone
  const phoneLine = text.match(/(?:телефон|phone|моб)[^:\n]*:\s*([+\d][\d\s()\-]{8,22})/i);
  const anyPhone = text.match(/(\+7[\s()\-\d]{10,18})/);
  if (phoneLine?.[1]) {
    std.phone = phoneLine[1].trim();
  } else if (anyPhone?.[1]) {
    std.phone = anyPhone[1].trim();
  }

  // 4. Email
  const emailMatch = text.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
  if (emailMatch?.[1]) {
    std.email = emailMatch[1].trim().toLowerCase();
  }

  // 5. Socials & Links
  const tgMatch =
    text.match(/(?:telegram|телеграм)[^:\n]*:\s*(@[a-zA-Z0-9_]+|https?:\/\/t\.me\/[a-zA-Z0-9_]+|[a-zA-Z0-9_]{4,})/i) ||
    text.match(/(https?:\/\/t\.me\/[a-zA-Z0-9_]+)/i);
  if (tgMatch?.[1]) std.social_telegram = tgMatch[1].trim();

  const waMatch =
    text.match(/(?:whatsapp|ватсап)[^:\n]*:\s*([^\r\n]+)/i) ||
    text.match(/(https?:\/\/wa\.me\/[^\s)]+)/i);
  if (waMatch?.[1]) std.social_whatsapp = waMatch[1].trim();

  const vkMatch = text.match(/(https?:\/\/(?:www\.)?vk\.com\/[^\s)\]]+)/i);
  if (vkMatch?.[1]) std.social_vk = vkMatch[1].trim();

  const ghMatch = text.match(/(https?:\/\/(?:www\.)?github\.com\/[^\s)\]]+)/i);
  if (ghMatch?.[1]) std.social_github = ghMatch[1].trim();

  const igMatch = text.match(/(?:instagram|инстаграм)[^:\n]*:\s*([^\r\n]+)/i);
  if (igMatch?.[1]) std.social_instagram = igMatch[1].trim();

  const hhUrlMatch = text.match(/(https?:\/\/[^\s)\]]*hh\.ru\/resume\/[^\s)\]]+)/i);
  const siteLineMatch = text.match(/(?:сайт|ссылка на резюме|резюме url)[^:\n]*:\s*(?:\[[^\]]*\]\s*)?(https?:\/\/[^\s)\]]+)/i);
  if (!std.resume_url) {
    if (hhUrlMatch?.[1]) {
      std.resume_url = hhUrlMatch[1].trim();
    } else if (siteLineMatch?.[1]) {
      std.resume_url = siteLineMatch[1].trim();
    }
  }

  // 6. Location & Citizenship
  const cityMatch = text.match(/\*\*Проживание:\*\*\s*([^\r\n*]+)/i) || text.match(/Проживание:\s*([^\r\n*]+)/i);
  if (cityMatch?.[1]) {
    const rawLoc = cityMatch[1].replace(/,\s*м\..*$/i, "").trim();
    std.city = rawLoc.split(",")[0].trim();
  }

  const citMatch = text.match(/\*\*Гражданство:\*\*\s*([^\r\n*]+)/i) || text.match(/Гражданство:\s*([^\r\n*]+)/i);
  if (citMatch?.[1]) {
    const rawCit = citMatch[1].split(",")[0].replace(/есть разрешение.*$/i, "").trim();
    std.citizenship = rawCit;
    if (!std.country && rawCit) {
      std.country = rawCit;
    }
  }

  if (std.city && !std.region) {
    const cityLower = String(std.city).toLowerCase();
    if (cityLower.includes("москва")) std.region = "Москва и Московская область";
    else if (cityLower.includes("санкт-петербург") || cityLower.includes("петербург")) std.region = "Санкт-Петербург и Ленинградская область";
    else if (cityLower.includes("краснодар")) std.region = "Краснодарский край";
    else if (cityLower.includes("екатеринбург")) std.region = "Свердловская область";
    else if (cityLower.includes("новосибирск")) std.region = "Новосибирская область";
    else if (cityLower.includes("казань")) std.region = "Республика Татарстан";
    else if (cityLower.includes("нижний новгород")) std.region = "Нижегородская область";
    else if (cityLower.includes("самара")) std.region = "Самарская область";
    else if (cityLower.includes("ростов")) std.region = "Ростовская область";
    else if (cityLower.includes("саратов")) std.region = "Саратовская область";
    else if (cityLower.includes("воронеж")) std.region = "Воронежская область";
    else if (cityLower.includes("пермь")) std.region = "Пермский край";
    else if (cityLower.includes("челябинск")) std.region = "Челябинская область";
    else if (cityLower.includes("уфа")) std.region = "Республика Башкортостан";
    else if (cityLower.includes("волгоград")) std.region = "Волгоградская область";
    else if (cityLower.includes("тюмень")) std.region = "Тюменская область";
    else std.region = std.city;
  }

  if (!std.country && std.city) {
    std.country = "Россия";
  }

  // 7. Work Experience
  const expHeaderMatch = text.match(/##\s*Опыт работы\s*[—\-:]\s*([^\r\n]+)/i);
  if (expHeaderMatch?.[1]) {
    std.work_experience = expHeaderMatch[1].replace(/\*/g, "").trim();
  }

  // 8. Employment type (multiselect)
  const empMatch = text.match(/(?:\*\*Тип занятости:\*\*|Тип занятости:|Занятость:)\s*([^\r\n]+)/i);
  if (empMatch?.[1]) {
    const items = empMatch[1]
      .split(/[,;]+/)
      .map((s) => s.replace(/\*/g, "").trim())
      .filter(Boolean)
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1));
    if (items.length > 0) std.employment_type = Array.from(new Set(items));
  }

  // 9. Work schedule (multiselect)
  const schedMatch = text.match(/(?:\*\*Формат работы:\*\*|\*\*График работы:\*\*|Формат работы:|График работы:)\s*([^\r\n]+)/i);
  if (schedMatch?.[1]) {
    const items = schedMatch[1]
      .split(/[,;]+/)
      .map((s) => s.replace(/\*/g, "").trim())
      .filter(Boolean)
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1));
    if (items.length > 0) std.work_schedule = Array.from(new Set(items));
  }

  // 10. Specializations (multiselect)
  const specBlockMatch = text.match(/\*\*Специализации:\*\*\s*([\s\S]*?)(?=\n\s*\*\*|\n\s*##|\n\s*---|$)/i);
  if (specBlockMatch?.[1]) {
    const rawSpec = specBlockMatch[1]
      .split(/[\r\n,;•\-]+/)
      .map((s) => s.replace(/\*/g, "").trim())
      .filter((s) => s.length > 2 && !/^(тип занятости|зарплата|формат|график)/i.test(s));
    if (rawSpec.length > 0) std.specializations = Array.from(new Set(rawSpec)).slice(0, 10);
  }

  // 11. Commute time
  const commuteMatch = text.match(/(?:\*\*Желательное время в пути до работы:\*\*|Желательное время в пути до работы:)\s*([^\r\n]+)/i);
  if (commuteMatch?.[1]) {
    const c = commuteMatch[1].replace(/\*/g, "").trim();
    std.desired_commute_time = c.charAt(0).toUpperCase() + c.slice(1);
  }

  // 12. Desired salary
  const salaryMatch = text.match(/(?:\*\*Желаемая зарплата:\*\*|\*\*Зарплата:\*\*|Желаемая зарплата:|Зарплата:)\s*([^\r\n]+)/i);
  if (salaryMatch?.[1]) {
    std.desired_salary = salaryMatch[1].replace(/\*/g, "").trim();
  }

  // 13. Education
  const eduSectionMatch = text.match(/##\s*Образование\s*[\r\n]+([\s\S]*?)(?=\n\s*##|\n\s*---|$)/i);
  if (eduSectionMatch?.[1]) {
    const cleanEdu = eduSectionMatch[1]
      .replace(/\*\*/g, "")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, 4)
      .join("; ");
    if (cleanEdu) std.education = cleanEdu.slice(0, 300);
  }

  // 14. Languages (multiselect)
  const langMatch = text.match(/\*\*Знание языков:\*\*\s*[\r\n]*([\s\S]*?)(?=\n\s*\*\*|\n\s*##|\n\s*---|$)/i);
  if (langMatch?.[1]) {
    const langs = langMatch[1]
      .split(/\r?\n/)
      .map((l) => l.replace(/^[-•*]\s*/, "").replace(/\*\*/g, "").trim())
      .filter(Boolean);
    if (langs.length > 0) std.languages = Array.from(new Set(langs));
  }

  // 15. Skills (multiselect)
  const skillsMatch =
    text.match(/\*\*(?:Профессиональные навыки|Ключевые навыки|Навыки):\*\*\s*[\r\n]*([\s\S]*?)(?=\n\s*\*\*|\n\s*##|\n\s*---|$)/i) ||
    text.match(/##\s*Ключевые навыки\s*[\r\n]+([\s\S]*?)(?=\n\s*##|\n\s*---|$)/i);
  if (skillsMatch?.[1]) {
    const sk = skillsMatch[1]
      .split(/[,;\r\n•]+/)
      .map((s) => s.replace(/^[-*]\s*/, "").replace(/\*\*/g, "").trim())
      .filter((s) => s.length > 1 && s.length < 70);
    if (sk.length > 0) std.skills = Array.from(new Set(sk)).slice(0, 25);
  }

  // 16. Driving experience (multiselect)
  const driveMatch = text.match(/##\s*Опыт вождения\s*[\r\n]+([\s\S]*?)(?=\n\s*##|\n\s*---|$)/i);
  if (driveMatch?.[1]) {
    const dr = driveMatch[1]
      .split(/[,;\r\n•]+/)
      .map((s) => s.replace(/^[-*]\s*/, "").replace(/\*\*/g, "").trim())
      .filter(Boolean);
    if (dr.length > 0) std.driving_experience = Array.from(new Set(dr));
  }

  // 17. Custom fields heuristic extraction if present in text
  for (const cf of customDefs || []) {
    const k = cf.key;
    const lbl = cf.label.toLowerCase();
    if (k.includes("linkedin") || lbl.includes("linkedin")) {
      const m = text.match(/(https?:\/\/(?:www\.)?linkedin\.com\/[^\s)\]]+)/i);
      if (m?.[1]) custom[k] = m[1].trim();
    } else if (k.includes("youtube") || lbl.includes("youtube") || lbl.includes("ютуб")) {
      const m = text.match(/(https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)\/[^\s)\]]+)/i);
      if (m?.[1]) custom[k] = m[1].trim();
    } else if (k.includes("portfolio") || lbl.includes("портфолио") || lbl.includes("сайт")) {
      const m = text.match(/(?:Сайт|Портфолио|Portfolio)[^:\n]*:\s*(?:\[[^\]]*\]\s*)?(https?:\/\/[^\s)\]]+)/i);
      if (m?.[1]) custom[k] = m[1].trim();
    }
  }

  return { standard_fields: std, custom_fields: custom };
}

export function mergeExtractedCandidateFields(
  baseStd: Record<string, any>,
  aiStd: Record<string, any> | null | undefined,
  baseCustom: Record<string, any>,
  aiCustom: Record<string, any> | null | undefined,
  customDefs: CandidateCustomFieldDef[] = []
): {
  standard_fields: Record<string, any>;
  custom_fields: Record<string, any>;
} {
  const finalStd: Record<string, any> = {};
  for (const def of STANDARD_CANDIDATE_FIELDS) {
    const k = def.key;
    const vAi = aiStd?.[k];
    const vBase = baseStd?.[k];
    if (def.type === "multiselect") {
      const arrAi = normalizeMultiselectValue(vAi);
      const arrBase = normalizeMultiselectValue(vBase);
      finalStd[k] = arrAi.length > 0 ? arrAi : arrBase;
    } else {
      const strAi = formatFieldValueForDisplay(vAi).trim();
      const strBase = formatFieldValueForDisplay(vBase).trim();
      finalStd[k] = strAi || strBase || "";
    }
  }

  const finalCustom: Record<string, any> = { ...(baseCustom || {}) };
  if (aiCustom && typeof aiCustom === "object") {
    for (const [k, v] of Object.entries(aiCustom)) {
      const def = customDefs.find((d) => d.key === k);
      if (def?.type === "multiselect") {
        const arr = normalizeMultiselectValue(v);
        if (arr.length > 0) finalCustom[k] = arr;
      } else {
        const str = formatFieldValueForDisplay(v).trim();
        if (str) finalCustom[k] = str;
      }
    }
  }
  for (const def of customDefs) {
    if (finalCustom[def.key] === undefined) {
      finalCustom[def.key] = def.type === "multiselect" ? [] : "";
    }
  }

  return { standard_fields: finalStd, custom_fields: finalCustom };
}

export const mergeCandidateFields = mergeExtractedCandidateFields;

export function buildDefaultVacancyCustomFields(roleName: string = ""): CandidateCustomFieldDef[] {
  const roleLower = String(roleName || "").toLowerCase();
  if (roleLower.includes("продаж") || roleLower.includes("менеджер") || roleLower.includes("роп") || roleLower.includes("аккаунт")) {
    return [
      {
        id: "cf_crm_systems",
        key: "crm_systems",
        label: "Опыт работы в CRM-системах",
        type: "multiselect",
        options: ["amoCRM", "Битрикс24", "RetailCRM", "1С:CRM", "HubSpot", "Мегаплан"],
        placeholder: "Выберите CRM",
      },
      {
        id: "cf_sales_segment",
        key: "sales_segment",
        label: "Сегмент продаж и средний чек",
        type: "multiselect",
        options: ["B2B", "B2C", "B2G", "Enterprise", "SMB (малый и средний бизнес)"],
        placeholder: "Сегмент продаж",
      },
      {
        id: "cf_cold_calls_exp",
        key: "cold_calls_exp",
        label: "Опыт холодных звонков и лидогенерации",
        type: "multiselect",
        options: ["Холодные звонки", "Тёплая база", "Входящие заявки", "Личные встречи", "Тендеры"],
        placeholder: "Форматы работы с базой",
      },
      {
        id: "cf_best_achievement",
        key: "best_achievement",
        label: "Ключевое достижение в цифрах (выполнение плана / выручка)",
        type: "text",
        placeholder: "Например: выполнение плана 135% 6 месяцев подряд",
      },
      {
        id: "cf_former_employers_contacts",
        key: "former_employers_contacts",
        label: "Контакты бывших работодателей (рекомендации)",
        type: "text",
        placeholder: "ФИО, должность и контакт для рекомендаций",
      },
    ];
  }
  if (roleLower.includes("разработ") || roleLower.includes("it") || roleLower.includes("програм") || roleLower.includes("тестир") || roleLower.includes("аналитик")) {
    return [
      {
        id: "cf_tech_stack",
        key: "tech_stack",
        label: "Основной стек технологий и фреймворков",
        type: "multiselect",
        options: ["TypeScript", "JavaScript", "React", "Node.js", "Python", "SQL / PostgreSQL", "Docker", "Git"],
        placeholder: "Выберите технологии",
      },
      {
        id: "cf_portfolio",
        key: "portfolio",
        label: "Портфолио / Ссылки на проекты и репозитории",
        type: "text",
        placeholder: "Ссылки на GitHub, Pet-проекты или продакшн-кейсы",
      },
      {
        id: "cf_linkedin",
        key: "linkedin",
        label: "Профиль LinkedIn / Habr Career",
        type: "text",
        placeholder: "https://linkedin.com/in/...",
      },
      {
        id: "cf_team_methodology",
        key: "team_methodology",
        label: "Методологии командной работы и трекеры",
        type: "multiselect",
        options: ["Scrum", "Kanban", "Jira", "YouTrack", "GitLab CI/CD", "Code Review"],
        placeholder: "Методологии и инструменты",
      },
      {
        id: "cf_architecture_exp",
        key: "architecture_exp",
        label: "Самый сложный технический проект в опыте",
        type: "text",
        placeholder: "Краткое описание архитектуры и вашей роли",
      },
    ];
  }
  return [
    {
      id: "cf_portfolio",
      key: "portfolio",
      label: "Портфолио / Примеры работ и кейсы",
      type: "text",
      placeholder: "Ссылка на портфолио или описание ключевых проектов",
    },
    {
      id: "cf_prof_tools",
      key: "prof_tools",
      label: "Профессиональные программы и сервисы",
      type: "multiselect",
      options: ["Excel / Google Таблицы", "1С", "Битрикс24", "amoCRM", "Figma", "Notion", "Telegram"],
      placeholder: "Рабочие инструменты",
    },
    {
      id: "cf_key_achievements",
      key: "key_achievements",
      label: "Главные профессиональные достижения",
      type: "text",
      placeholder: "Опишите измеримые результаты на прошлых местах работы",
    },
    {
      id: "cf_former_employers_contacts",
      key: "former_employers_contacts",
      label: "Контакты бывших работодателей (рекомендации)",
      type: "text",
      placeholder: "ФИО, компания, должность и телефон рекомендателя",
    },
    {
      id: "cf_other_links",
      key: "other_links",
      label: "Дополнительные ссылки (LinkedIn, YouTube, блог)",
      type: "text",
      placeholder: "https://...",
    },
  ];
}

export function buildResumeExtractionPromptSegment(customDefs: CandidateCustomFieldDef[] = []): string {
  const stdLines = STANDARD_CANDIDATE_FIELDS.map(
    (f) => `- "${f.key}" (${f.label}): тип "${f.type}"${f.type === "multiselect" ? " (массив строк string[])" : " (строка string)"}`
  ).join("\n");

  const customLines =
    customDefs.length > 0
      ? customDefs
          .map(
            (c) =>
              `- "${c.key}" (${c.label}): тип "${c.type}"${
                c.type === "multiselect"
                  ? ` (массив строк string[]; возможные варианты: ${(c.options || []).join(", ")})`
                  : " (строка string)"
              }`
          )
          .join("\n")
      : "- (нет дополнительных полей)";

  return `Дополнительная обязательная задача — извлечение структурированных полей кандидата из текста резюме:
Извлеки все найденные в резюме значения для 26 стандартных полей в объект "standard_fields" и для дополнительных полей вакансии в объект "custom_fields".
Если точных данных для какого-то поля в резюме нет, верни пустую строку "" (для типа "text") или пустой массив [] (для типа "multiselect"). Не выдумывай несуществующие контакты.

Список 26 стандартных полей ("standard_fields"):
${stdLines}

Список дополнительных полей вакансии ("custom_fields"):
${customLines}`;
}

export function buildVacancyCustomFieldsGenerationPromptSegment(): string {
  const stdLabels = STANDARD_CANDIDATE_FIELDS.map((f) => `${f.label} (${f.key})`).join(", ");
  return `Дополнительно сгенерируй поле "candidate_fields_config": объект вида {"customFields": [{"key": string, "label": string, "type": "text" | "multiselect", "options": string[], "placeholder": string}]}, содержащий ровно 5 дополнительных кастомных полей анкеты кандидата, специфичных именно для этой должности и компании (например: владение профильным ПО, ссылки на портфолио/GitHub/LinkedIn, контакты рекомендателей, отраслевая специализация, профильные сертификаты и т.д.).
Важно: дополнительные поля НЕ должны дублировать 26 стандартных полей (${stdLabels}). Для полей с типом "multiselect" обязательно укажи массив "options" из 4-7 релевантных вариантов выбора.`;
}

export function buildGenerateMoreCustomFieldsPromptSegment(
  roleName: string,
  companyName: string,
  vacancyContext: string,
  existingCustomFields: CandidateCustomFieldDef[] = [],
  count: number = 5
): string {
  const stdLabels = STANDARD_CANDIDATE_FIELDS.map((f) => `${f.label} (${f.key})`).join(", ");
  const existingLabels =
    existingCustomFields.length > 0
      ? existingCustomFields.map((f) => `${f.label} (${f.key})`).join(", ")
      : "нет";

  return `Ты — эксперт по HR-автоматизации и подбору персонала.
Твоя задача — сгенерировать ровно ${count} НОВЫХ дополнительных полей анкеты кандидата для вакансии «${roleName || "Специалист"}»${companyName ? ` в компании «${companyName}»` : ""}.

Контекст вакансии:
${String(vacancyContext || "").slice(0, 3500)}

26 стандартных полей (их запрещено повторять или перефразировать):
${stdLabels}

Уже существующие дополнительные поля в этой вакансии (их тоже запрещено повторять):
${existingLabels}

Требования:
1. Каждое новое поле должно быть максимально полезным для оценки резюме и квалификации кандидата на должность «${roleName || "Специалист"}» (например: профильные инструменты, специфический опыт, портфолио, ссылки на проекты, рекомендации бывших руководителей, отраслевые стандарты и т.д.).
2. Поддерживаются 2 типа полей:
   - "text" — текстовое поле (строка)
   - "multiselect" — поле с мультивыбором тегов (для него обязательно укажи массив "options" из 4–8 подходящих вариантов).
3. Не используй капслок в названиях полей и вариантах ответа.
4. Верни строго JSON без markdown-обертки:
{"customFields": [{"key": "snake_case_key", "label": "Название поля", "type": "text" | "multiselect", "options": ["Вариант 1", "Вариант 2"], "placeholder": "Подсказка для заполнения"}]}`;
}


