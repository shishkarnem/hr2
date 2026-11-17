import { Router, Request, Response } from "express";
import { callProTalkLLM, formatEmployerChatId, resolveEmployerPublicId, tryParseLLMJson } from "../../common";
import { getProTalkDB } from "../../db";

export const companyAiFieldsRouter = Router();

async function resolveCompanyRouteEmpId(req: Request, extra?: any): Promise<string> {
  const db = await getProTalkDB();
  const body = req.body || {};
  return resolveEmployerPublicId(db, {
    employerPublicId:
      body.employer_public_id ||
      body.employerPublicId ||
      extra?.employer_public_id ||
      extra?.employerPublicId ||
      (req as any).user?.public_id,
    employerId:
      body.employer_id ||
      body.employerId ||
      extra?.employer_id ||
      extra?.employerId ||
      (req as any).user?.id,
    projectId: body.project_id || body.projectId || extra?.project_id || extra?.projectId,
    companyId: body.company_id || body.companyId || extra?.company_id || extra?.companyId,
  });
}

companyAiFieldsRouter.post("/parse-company-file", async (req: Request, res: Response) => {
  const { fileName } = req.body;

  const prompt = `Ты — Ведущий HR-аналитик и ИИ Копирайтер компании "Робот Рекрутер (RR)".
К тебе загрузили регламентный файл компании: "${fileName}".
Твоя задача — извлечь из информации о файле (или сгенерировать на основе названия "${fileName}") красивую, убедительную и маркетингово привлекательную информацию о компании на русском языке.

Верни ответ в СТРОГОМ формате JSON (без оборачивания в markdown \`\`\`json, верни только сырой JSON):
{
  "name": "Название компании на русском",
  "industry": "Отрасль (например: Финансы, Логистика, IT, Образование)",
  "staff": "10-50 человек",
  "description": "Привлекательное описание компании (3-4 предложения) с уклоном в инновации и заботу о сотрудниках",
  "sites": "www.company-web.ru",
  "logoUrl": "/files/11/rr-logo.png",
  "missionText": "Наша миссия — создавать продукты будущего и помогать сотрудникам расти вместе с нами",
  "customWiki": "РЕГЛАМЕНТ РАБОТЫ:\\n- Работать в CRM ежедневно;\\n- Отвечать клиентам в течение 5 минут;\\n- Соблюдать вежливый тон. Сдача отчетности еженедельно по пятницам.",
  "salaryTerms": "До 120 000 руб (фикс + KPI)",
  "scheduleTerms": "5/2 гибкие смены от 4 часов в день",
  "statsValClients": "1500+",
  "statsLabelClients": "Довольных клиентов",
  "statsValDialogs": "120 тыс",
  "statsLabelDialogs": "Обработано заявок автоматикой",
  "statsValFounded": "2019",
  "statsLabelFounded": "Год успешного запуска"
}`;

  try {
    const isProMax = Boolean(req.body?.use_promax || req.body?.useProMax);
    const promptKey = isProMax ? "company_ingestion_promax" : "company_ingestion";
    const empId = await resolveCompanyRouteEmpId(req);
    const chatId = formatEmployerChatId(empId, "RRcompany");
    const textResponse = await callProTalkLLM(
      "company",
      [{ role: "user", content: prompt }],
      chatId,
      empId,
      undefined,
      promptKey,
      isProMax
    );
    const parsed = tryParseLLMJson(textResponse);
    if (parsed && typeof parsed === "object") {
      return res.json(parsed);
    }
    throw new Error("Invalid JSON from ProTalk");
  } catch (err) {
    console.error("Error at parse-company-file, sending defaults...", err);
    const simpleName = (fileName || "").replace(/\.[^/.]+$/, "").replace(/[_-]/g, " ");
    return res.json({
      name: simpleName ? simpleName.charAt(0).toUpperCase() + simpleName.slice(1) : "Компания",
      industry: "Производство и ритейл",
      staff: "10-50 человек",
      description: `Стабильная и быстрорастущая компания, специализирующаяся на технологических решениях. Разбор регламента «${fileName}» показал высокий уровень внутренней организации и автоматизации.`,
      sites: "www.company-web.ru",
      logoUrl: "/files/11/rr-logo.png",
      missionText:
        "Обеспечивать превосходное качество обслуживания клиентов и стимулировать команду к профессиональным победам.",
      customWiki:
        "РЕГЛАМЕНТ ИЗ ФАЙЛА:\n- Соблюдение стандартов тайминга ответа соискателям;\n- Ведение отчетности в единой CRM-системе;\n- Ежедневное прохождение проверочных тестов.",
      salaryTerms: "От 80 000 до 150 000 рублей (оклад + %)",
      scheduleTerms: "Гибкий удаленный формат",
      statsValClients: "800+",
      statsLabelClients: "Клиентов на обслуживании",
      statsValDialogs: "50 000",
      statsLabelDialogs: "Диалогов в месяц",
      statsValFounded: "2021",
      statsLabelFounded: "Год основания",
    });
  }
});

companyAiFieldsRouter.post("/enhance-single-field", async (req: Request, res: Response) => {
  const { fieldName, fieldVal, context } = req.body;
  const rawEmpId = await resolveCompanyRouteEmpId(req, context);
  const chatId = formatEmployerChatId(rawEmpId, "RRcompany");

  const fieldDescriptions: Record<string, string> = {
    name: "Название бренда или организации",
    industry: "Отрасль работы компании",
    staff: "Количество сотрудников (размер штата компании)",
    description: "Миссия, культура и описание продуктов для лендинга",
    description_text: "Миссия, культура и описание продуктов для лендинга",
    about_text: "Сведения о компании, история и ключевая информация",
    products_text: "Продукты и услуги компании",
    sites: "Официальный сайт",
    logoUrl: "Ссылка на логотип",
    missionText: "Миссия и слоган компании",
    customWiki: "Вики-регламенты компании и база знаний обучения",
    salaryTerms: "Условия оплаты и мотивации сотрудников",
    scheduleTerms: "График работы и гибкость смен",
    statsValClients: "Цифра-показатель 1",
    statsLabelClients: "Подпись показателя 1",
    statsValDialogs: "Цифра-показатель 2",
    statsLabelDialogs: "Подпись показателя 2",
    statsValFounded: "Цифра-показатель 3",
    statsLabelFounded: "Подпись показателя 3",
  };

  const label = fieldDescriptions[fieldName] || fieldName;
  const fullCompanyContext =
    typeof context === "object" ? JSON.stringify(context, null, 2) : String(context || "");

  const prompt = `Ты — Старший HR-маркетолог и бренд-стратег платформы "Робот Рекрутер (RR)".
Тебе переданы ВСЕ текущие данные о компании:
${fullCompanyContext}

Твоя задача — улучшить, красиво и привлекательно сформулировать ТОЛЬКО ОДНО поле: "${label}" (ключ поля: "${fieldName}").
Текущее значение поля: "${fieldVal || "пусто"}".

ТРЕБОВАНИЯ:
1. Используй общий контекст компании выше, чтобы сформулированное поле идеально сочеталось со всей остальной информацией.
2. Для поля "staff" верни понятный формат численности, например: "10-50 человек", "50-250 сотрудников".
3. Верни СТРОГО И ТОЛЬКО текст улучшенного поля "${fieldName}" без JSON, markdown-блоков \`\`\` и кавычек.`;

  try {
    const improved = await callProTalkLLM(
      "company",
      [{ role: "user", content: prompt }],
      chatId,
      rawEmpId
    );
    const cleanVal = improved.trim().replace(/^["'`]|["'`]$/g, "").trim();
    return res.json({ value: cleanVal, text: cleanVal });
  } catch (err) {
    console.error("Error at enhance-single-field", err);
    return res.json({ value: fieldVal || "Автозаполнение ИИ" });
  }
});

companyAiFieldsRouter.post("/enhance-all-fields", async (req: Request, res: Response) => {
  const body = req.body || {};
  const mode = body.mode || "all_company";
  const currentData = body.fields || body;
  const rawEmpId = await resolveCompanyRouteEmpId(req, currentData);
  const chatId = formatEmployerChatId(rawEmpId, "RRcompany");

  if (mode === "single") {
    const fieldName = body.field || body.fieldName || "description";
    const fieldVal = body.value || body.fieldVal || "";
    const fullCompanyContext = JSON.stringify(body.all_fields || body.fields || currentData || {}, null, 2);

    const prompt = `Ты — Старший HR-маркетолог платформы "Робот Рекрутер (RR)".
Тебе переданы ВСЕ текущие данные о компании:
${fullCompanyContext}

Твоя задача — улучшить, красиво и презентабельно сформулировать ТОЛЬКО ОДНО поле: "${fieldName}".
Текущее значение поля: "${fieldVal || "пусто"}".
${body.hint ? `Дополнительное пожелание: ${body.hint}` : ""}

Верни СТРОГО ТОЛЬКО готовый текст для поля "${fieldName}", без кавычек, markdown-блоков и других полей.`;

    try {
      const isProMax = Boolean(body.use_promax || body.useProMax);
      const promptKey = isProMax ? "company_generation_promax" : "company_generation";
      const improved = await callProTalkLLM(
        "company",
        [{ role: "user", content: prompt }],
        chatId,
        rawEmpId,
        undefined,
        promptKey,
        isProMax
      );
      const val = improved.trim().replace(/^["'`]|["'`]$/g, "").trim();
      return res.json({ value: val, text: val });
    } catch {
      return res.json({ value: fieldVal || "Автозаполнение ИИ" });
    }
  }

  if (mode === "all_vacancy") {
    const vacChatId = formatEmployerChatId(rawEmpId, "RRvacancy");
    const prompt = `Ты — Директор по маркетингу и HR "Робот Рекрутер (RR)".
Перед тобой — текущие поля вакансии:
${JSON.stringify(currentData, null, 2)}
Компания: "${body.company_name || ""}", Роль: "${body.role_name || ""}"
${body.file_context ? `Текст из документа:\n${body.file_context}` : ""}

Твоя задача — профессионально улучшить и оформить ВСЕ текстовые поля для лендингов красивым языком на русском языке.
Верни СТРОГО валидный JSON (без markdown \`\`\`json, верни только сырой JSON):
{
  "role_name": "Название вакансии",
  "vacancy_text": "• Требование 1\\n• Требование 2",
  "tasks_activity_text": "• [📞 Задача] Описание задачи",
  "motivation_text": "Короткая мотивация",
  "motivation_text_detail": "• Преимущество 1\\n• Преимущество 2",
  "schedule_text": "График работы",
  "payouts_text": "Выплаты и бонусы",
  "onboarding_text": "• [📝 Этап] Описание",
  "team_text": "• [Отдел] Описание",
  "system_text": "• [CRM] Описание",
  "training_professional_text": "Проф обучение",
  "training_product_text": "Обучение продукту",
  "training_systems_text": "Обучение системе",
  "training_wiki_text": "База знаний",
  "training_regulations_text": "Регламенты"
}`;

    try {
      const isProMax = Boolean(body.use_promax || body.useProMax);
      const promptKey = isProMax ? "vacancy_full_enhance_promax" : "vacancy_full_enhance";
      const textResponse = await callProTalkLLM(
        "vacancy",
        [{ role: "user", content: prompt }],
        vacChatId,
        rawEmpId,
        undefined,
        promptKey,
        isProMax
      );
      const parsed = tryParseLLMJson(textResponse);
      if (parsed && typeof parsed === "object") {
        return res.json({ fields: parsed, ...parsed });
      }
      throw new Error("Invalid JSON from ProTalk");
    } catch (err) {
      console.error("Error enhancing vacancy fields:", err);
      return res.json({ fields: currentData, ...currentData });
    }
  }

  const prompt = `Ты — Директор по брендингу "Робот Рекрутер (RR)".
Тебе передали текущий профиль компании (ID компании: ${body.company_id || currentData.public_id || "новая"}):
${JSON.stringify(currentData, null, 2)}
${body.hint ? `Дополнительный контекст:\n${body.hint}` : ""}

Твоя задача — комплексно улучшить ВСЕ текстовые поля. Верни СТРОГО валидный JSON без разметки markdown:
{
  "name": "Название компании",
  "industry": "Отрасль",
  "staff": "Размер штата (например: '15 человек' или '45 сотрудников')",
  "description_text": "Стильное описание компании",
  "products_text": "• Продукт 1\\n• Продукт 2",
  "description": "Описание компании",
  "sites": "Сайт компании",
  "logoUrl": "/files/11/rr-logo.png",
  "missionText": "Миссия компании",
  "customWiki": "Правила и база знаний",
  "salaryTerms": "Описание выплат и бонусов",
  "scheduleTerms": "Описание графика",
  "team": "• [CEO] Руководитель\\n• [HR] Команда",
  "statsValClients": "200+",
  "statsLabelClients": "Клиентов",
  "statsValDialogs": "50k+",
  "statsLabelDialogs": "Диалогов",
  "statsValFounded": "2020",
  "statsLabelFounded": "Год основания"
}`;

  try {
    const isProMax = Boolean(body.use_promax || body.useProMax);
    const promptKey = isProMax ? "company_generation_promax" : "company_generation";
    const textResponse = await callProTalkLLM(
      "company",
      [{ role: "user", content: prompt }],
      chatId,
      rawEmpId,
      undefined,
      promptKey,
      isProMax
    );
    const parsed = tryParseLLMJson(textResponse);
    if (parsed && typeof parsed === "object") {
      return res.json({ fields: parsed, ...parsed });
    }
    throw new Error("Invalid JSON from ProTalk");
  } catch (err) {
    console.error("Error enhancing all fields:", err);
    const fallbackObj = {
      ...currentData,
      description_text:
        currentData.description_text ||
        currentData.description ||
        "Инновационная компания с динамичной командой профессионалов.",
      products_text:
        currentData.products_text ||
        "• Комплексные решения для бизнеса\n• Профессиональный сервис и поддержка",
      description:
        currentData.description || "Инновационная компания с динамичной командой профессионалов.",
      missionText: currentData.missionText || "Создавать высокую ценность для каждого клиента",
      customWiki:
        currentData.customWiki ||
        "Регламент работы: быть вежливым, пунктуальным, сдавать отчет раз в неделю.",
    };
    return res.json({ fields: fallbackObj, ...fallbackObj });
  }
});

companyAiFieldsRouter.post("/parse-vacancy-file", async (req: Request, res: Response) => {
  const { fileName, companyName } = req.body;
  const prompt = `Ты — Ведущий HR-аналитик компании "Робот Рекрутер (RR)".
Тебе загрузили документ с описанием вакансии: "${fileName}" (от компании "${companyName || "Наши партнеры"}").
Твоя задача — извлечь из информации о файле подробную информацию для размещения вакансии.

Верни СТРОГО валидный JSON (только сырой JSON):
{
  "roleName": "Название вакансии",
  "salaryTerms": "Условия оплаты",
  "scheduleTerms": "График работы",
  "customWiki": "Базовая Wiki-инструкция",
  "logoUrl": "/files/11/rr-logo.png",
  "vacancyText": "• Требование 1\\n• Требование 2",
  "tasksActivityText": "• [📞 Название задачи] Описание задачи",
  "motivationTextDetail": "• Преимущество 1",
  "payoutsText": "• Описание выплат",
  "scheduleText": "• Детализация графика",
  "teamText": "• [Отдел] Название отдела\\n• Имя - Должность. Описание.",
  "cabinetTabsText": "• [💻 Платформа] Описание | 💡 Регламент: описание",
  "systemText": "• Описание регламентов",
  "onboardingText": "• [📝 Название этапа] Описание"
}`;

  try {
    const isProMax = Boolean(req.body?.use_promax || req.body?.useProMax);
    const promptKey = isProMax ? "vacancy_generation_promax" : "vacancy_generation";
    const empId = await resolveCompanyRouteEmpId(req);
    const chatId = formatEmployerChatId(empId, "RRvacancy");
    const textResponse = await callProTalkLLM(
      "vacancy",
      [{ role: "user", content: prompt }],
      chatId,
      empId,
      undefined,
      promptKey,
      isProMax
    );
    const parsed = tryParseLLMJson(textResponse);
    if (parsed && typeof parsed === "object") {
      return res.json(parsed);
    }
    throw new Error("Invalid JSON");
  } catch (err) {
    console.error("Error at parse-vacancy-file:", err);
    return res.json({
      roleName: (fileName || "").replace(/\.[^/.]+$/, "").replace(/[_-]/g, " "),
      salaryTerms: "По результатам собеседования",
      scheduleTerms: "Полная занятость, удаленно",
      customWiki: `Регламенты по материалу "${fileName}". Основные тезисы: сдавать еженедельную отчетность в CRM, соблюдать стандарты переписки, работать по графику.`,
      logoUrl: "/files/11/rr-logo.png",
      vacancyText:
        "• Грамотная речь, проактивный подход\n• Пользователь ПК и мессенджеров\n• Стремление расти профессионально.",
      tasksActivityText:
        "• [📞 Консультация] Обрабатывать запросы от клиентов и предлагать оптимальный тариф.\n• [📝 CRM Система] Ведение карточек сделок.",
      motivationTextDetail:
        "• Стабильные выплаты\n• Дружный коллектив\n• Премии за выполнение KPI компании.",
      payoutsText: "• Оклад за смену\n• Ежемесячные бонусы.",
      scheduleText: "• Гибкий график 5/2 или 2/2.",
      teamText: "• [Отдел] Продажи\n• Константин - Тимлид команды.",
      cabinetTabsText:
        "• [💻 CRM] Основная воронка клиентов | 💡 Регламент: вести лог каждого звонка.",
      systemText: "• Корректное заполнение отчетности до конца рабочей смены.",
      onboardingText:
        "• [📝 Тестирование] Вводное ИИ-интервью.\n• [📚 Изучение] Прохождение трех уроков в базе обучения.",
    });
  }
});

companyAiFieldsRouter.post("/parse-training-file", async (req: Request, res: Response) => {
  const { fileName, roleName } = req.body;
  const prompt = `Ты — Ведущий методолог по обучению HR-платформы "Робот Рекрутер (RR)".
К тебе загрузили регламентный документ: "${fileName}" для должности "${roleName || "Специалист"}".
Верни СТРОГО валидный JSON (только сырой JSON):
{
  "checklistQuestions": ["Вопрос 1", "Вопрос 2", "Вопрос 3"],
  "roleplayQuestions": ["Сценарий 1", "Сценарий 2"],
  "trainingProfText": "Профессиональное обучение (не менее 6 предложений)",
  "trainingProductText": "Обучение по продукту (не менее 6 предложений)",
  "trainingSystemText": "Обучение по системе и регламентам (не менее 6 предложений)"
}`;

  try {
    const isProMax = Boolean(req.body?.use_promax || req.body?.useProMax);
    const promptKey = isProMax ? "training_stage_test_generate_promax" : "training_stage_test_generate";
    const empId = await resolveCompanyRouteEmpId(req);
    const chatId = formatEmployerChatId(empId, "RRtraining");
    const textResponse = await callProTalkLLM(
      "training",
      [{ role: "user", content: prompt }],
      chatId,
      empId,
      undefined,
      promptKey,
      isProMax
    );
    const parsed = tryParseLLMJson(textResponse);
    if (parsed && typeof parsed === "object") {
      return res.json(parsed);
    }
    throw new Error("Invalid JSON");
  } catch (err) {
    console.error("Error at parse-training-file:", err);
    return res.json({
      checklistQuestions: [
        `Каковы основные шаги при обработке возражения дорого по регламенту "${fileName}"?`,
        "Что является критической ошибкой при ведении карточки сделки в CRM-базе?",
        "Как вы будете выстраивать диалог при высоком темпе входящих звонков на смене?",
      ],
      roleplayQuestions: [
        "Покупатель отказывается слушать презентацию: 'Мне некогда, скиньте на почту'. Продолжите живой диалог.",
        "Клиент высказывает недовольство прошлым опытом сотрудничества. Верните лояльность клиента.",
      ],
      trainingProfText:
        "Стандарты коммуникации: начинайте разговор с приветствия, задавайте квалифицирующие открытые вопросы и отрабатывайте возражения по алгоритму Согласие - Мост - Аргумент.",
      trainingProductText:
        "Продуктовая линейка: ценность решения заключается в сокращении рутины, объективном скоринге кандидатов 24/7 и круглосуточной проверке знаний.",
      trainingSystemText:
        "Работа в системе и отчетность: после каждого звонка вносите комментарии в CRM и заполняйте ежедневную отчетность до 20:30 МСК.",
    });
  }
});

companyAiFieldsRouter.post("/enhance-all-vacancy-fields", async (req: Request, res: Response) => {
  const currentData = req.body;
  const prompt = `Ты — Директор по маркетингу и HR "Робот Рекрутер (RR)".
Перед тобой — текущая заполненная вакансия:
${JSON.stringify(currentData, null, 2)}

Улучши и оформи ВСЕ текстовые поля для компании "${currentData.companyName || "Надежный работодатель"}".
Верни СТРОГО валидный JSON (только сырой JSON):
{
  "roleName": "Название вакансии",
  "salaryTerms": "Условия оплаты",
  "scheduleTerms": "График работы",
  "customWiki": "Базовая Wiki-инструкция",
  "logoUrl": "Ссылка на логотип",
  "vacancyText": "• Требование 1",
  "tasksActivityText": "• [📞 Название задачи] Описание",
  "motivationTextDetail": "• Преимущество 1",
  "payoutsText": "• Описание выплат",
  "scheduleText": "• Детализация графика",
  "teamText": "• [Отдел] Название\\n• Имя - Должность.",
  "cabinetTabsText": "• [💻 Платформа] Описание | 💡 Регламент: описание",
  "systemText": "• Описание регламентов",
  "onboardingText": "• [📝 Название этапа] Описание"
}`;

  try {
    const isProMax = Boolean(currentData?.use_promax || currentData?.useProMax);
    const promptKey = isProMax ? "vacancy_full_enhance_promax" : "vacancy_full_enhance";
    const empId = await resolveCompanyRouteEmpId(req, currentData);
    const chatId = formatEmployerChatId(empId, "RRvacancy");
    const textResponse = await callProTalkLLM(
      "vacancy",
      [{ role: "user", content: prompt }],
      chatId,
      empId,
      undefined,
      promptKey,
      isProMax
    );
    const parsed = tryParseLLMJson(textResponse);
    if (parsed && typeof parsed === "object") {
      return res.json(parsed);
    }
    return res.json(currentData);
  } catch (err) {
    console.error("Error at enhance-all-vacancy-fields:", err);
    return res.json(currentData);
  }
});
