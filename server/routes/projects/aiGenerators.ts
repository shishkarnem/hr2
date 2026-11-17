import { Router, Request, Response } from "express";
import { callProTalkLLM, formatEmployerChatId, resolveEmployerPublicId, tryParseLLMJson } from "../../common";
import { saveProjectToProTalkDB, getProTalkDB, transliterateToSlug } from "../../db";
import {
  buildDefaultVacancyCustomFields,
  buildVacancyCustomFieldsGenerationPromptSegment,
  parseVacancyCandidateFieldsConfig,
} from "../../../src/lib/candidateFields";

async function handleGenerateHHTemplates(req: Request, res: Response) {
  try {
    const {
      project_id,
      projectId,
      role_name,
      roleName,
      company_name,
      companyName,
      company_id,
      companyId,
      vacancy_text,
      vacancyText,
      tasks_activity_text,
      tasksActivityText,
      payouts_text,
      payoutsText,
      salary_terms,
      salaryTerms,
      schedule_text,
      scheduleText,
      schedule_terms,
      scheduleTerms,
      company_text,
      companyText,
      interview_link,
      interviewLink,
      client_interview_link,
      origin,
      slug,
      company_slug,
      companySlug,
      public_id,
      publicId,
      employer_id,
      employerId,
      use_promax,
      useProMax,
    } = req.body || {};
    const clientInterviewLink = client_interview_link || interview_link || interviewLink;
    const pid = project_id || projectId;
    const db = await getProTalkDB();

    let proj: any = null;
    if (pid) {
      proj = await db.get(
        "SELECT * FROM projects WHERE id = ? OR CAST(public_id AS TEXT) = ? LIMIT 1",
        [pid, String(pid)]
      );
    }

    const effectiveEmpId = await resolveEmployerPublicId(db, {
      employerPublicId: (req.body as any)?.employer_public_id || (req.body as any)?.employerPublicId || (req as any).user?.public_id,
      employerId: employer_id || employerId || (req as any).user?.id,
      projectId: pid,
      companyId: company_id || companyId,
    });
    const role = role_name || roleName || proj?.role_name || proj?.roleName || "Специалист";
    const company = company_name || companyName || proj?.company_name || proj?.companyName || "Компания";
    const effectiveVacancyText = vacancy_text || vacancyText || proj?.vacancy_text || proj?.vacancyText || "";
    const effectiveTasks =
      tasks_activity_text || tasksActivityText || proj?.tasks_activity_text || proj?.tasksActivityText || "";
    const effectivePayouts =
      payouts_text ||
      payoutsText ||
      salary_terms ||
      salaryTerms ||
      proj?.payouts_text ||
      proj?.payoutsText ||
      proj?.salary_terms ||
      "";
    const effectiveSchedule =
      schedule_text ||
      scheduleText ||
      schedule_terms ||
      scheduleTerms ||
      proj?.schedule_text ||
      proj?.scheduleText ||
      proj?.schedule_terms ||
      "";
    const effectiveCompanyText = company_text || companyText || proj?.company_text || proj?.companyText || "";

    let compSlug = "";
    let compRow: any = null;
    const cId = company_id || companyId || proj?.company_id;
    if (cId) {
      compRow = await db.get(
        "SELECT * FROM companies WHERE id = ? OR CAST(public_id AS TEXT) = ? LIMIT 1",
        [cId, String(cId)]
      );
    }
    if (!compRow && company) {
      compRow = await db.get(
        "SELECT * FROM companies WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) OR slug = ? OR (',' || COALESCE(allslug, '') || ',') LIKE ? LIMIT 1",
        [company.trim(), company.trim(), `%,${company.trim().toLowerCase()},%`]
      );
    }
    if (compRow?.slug) compSlug = compRow.slug;
    if (!compSlug) {
      compSlug = company_slug || companySlug || proj?.company_slug || transliterateToSlug(company) || "company";
    }

    const roleSlug = transliterateToSlug(role);
    let vacSlug = "";
    if (roleSlug && roleSlug !== "vakansiya" && roleSlug !== "vacancy" && !/^vac\d+$/.test(roleSlug)) {
      vacSlug = roleSlug;
    } else if (slug && !/^vac\d+$/.test(slug) && !slug.startsWith("draft-")) {
      vacSlug = slug;
    } else if (proj?.slug && !/^vac\d+$/.test(proj.slug) && !proj.slug.startsWith("draft-")) {
      vacSlug = proj.slug;
    } else {
      const publicVacId = public_id || publicId || proj?.public_id || proj?.publicId || pid || "400001";
      vacSlug = `vac${publicVacId}`;
    }

    const hostHeader = (req.headers["x-forwarded-host"] || req.headers.host || "").toString().split(",")[0].trim();
    const protoHeader = (req.headers["x-forwarded-proto"] || "https").toString().split(",")[0].trim();
    const reqOrigin = origin || (hostHeader ? `${protoHeader}://${hostHeader}` : "https://hr-rr.ru");
    let computedLink = `${reqOrigin}/${compSlug}/${vacSlug}`;

    if (clientInterviewLink && !clientInterviewLink.includes("/vac") && !clientInterviewLink.includes("/com")) {
      computedLink = clientInterviewLink;
    }

    if (pid) {
      try {
        await db.run(
          "UPDATE projects SET slug = COALESCE(NULLIF(?, ''), slug), company_slug = COALESCE(NULLIF(?, ''), company_slug), updated_at = NOW() WHERE id = ? OR CAST(public_id AS TEXT) = ?",
          [vacSlug, compSlug, pid, String(pid)]
        );
      } catch (errSync) {
        console.warn("[BD ProTalk] Realtime draft slug sync note:", errSync);
      }
    }

    const isPromax = Boolean(use_promax || useProMax);
    const promptKey = isPromax ? "hh_templates_generation_promax" : "hh_templates_generation";

    const prompt = `Ты — ведущий HR-маркетолог и эксперт по автоматизации рекрутинга платформы "Робот Рекрутер (RR)".
Сгенерируй профессиональные, продающие шаблоны текстов для hh.ru (HeadHunter) для вакансии:
Компания: "${company}"
Должность / Вакансия: "${role}"
Требования: "${effectiveVacancyText || "Стандартные требования"}"
Обязанности и задачи: "${effectiveTasks || "Стандартные задачи"}"
Условия и выплаты: "${effectivePayouts || "Достойная оплата"}"
График работы: "${effectiveSchedule || "Гибкий график"}"
О компании: "${effectiveCompanyText || ""}"
Ссылка на ИИ-собеседование: "${computedLink}"

Сформируй ровно 3 текста:
1. "hh_post_text": Полный продающий текст вакансии для размещения на hh.ru.
2. "hh_invite_text": Текст персонального приглашения соискателя на hh.ru со ссылкой на собеседование.
3. "hh_autoresume_text": Пошаговая подробная инструкция для работодателя по настройке авторазбора откликов на hh.ru (${computedLink}).

Верни СТРОГО валидный JSON без markdown:
{
  "hh_post_text": "...",
  "hh_invite_text": "...",
  "hh_autoresume_text": "..."
}`;

    const chatId = await formatEmployerChatId(effectiveEmpId, "RRvacancy");
    const text = await callProTalkLLM(
      "vacancy",
      [{ role: "user", content: prompt }],
      chatId,
      String(effectiveEmpId),
      pid ? String(pid) : undefined,
      promptKey,
      isPromax
    );
    let parsedFields = tryParseLLMJson<any>(text) || {};
    if (!parsedFields.hh_post_text && !parsedFields.hh_invite_text && !parsedFields.hh_autoresume_text) {
      parsedFields = {
        hh_post_text: `Вакансия: ${role} в ${company}\n\nО компании:\n${effectiveCompanyText}\n\nОбязанности:\n${effectiveTasks}\n\nТребования:\n${effectiveVacancyText}\n\nУсловия и выплаты:\n${effectivePayouts}\nГрафик работы: ${effectiveSchedule}`,
        hh_invite_text: `Здравствуйте! Мы ознакомились с вашим резюме и считаем, что ваш опыт отлично подходит на позицию «${role}» в «${company}».\n\nПройдите короткое онлайн-интервью с нашим ИИ-ассистентом: ${computedLink}\nЭто займет 5 минут, после чего мы сразу свяжемся с вами!`,
        hh_autoresume_text: `ИНСТРУКЦИЯ ПО НАСТРОЙКЕ АВТОРАЗБОРА НА HH.RU ДЛЯ ВАКАНСИИ «${role}»:\n\n1. Перейдите в личный кабинет работодателя на hh.ru в раздел «Мои вакансии».\n2. Откройте вакансию «${role}» и нажмите «Настройки» -> «Автоответы на отклики».\n3. Включите опцию «Отправлять автоответ всем новым соискателям».\n4. В поле текста автоответа вставьте ссылку на ИИ-собеседование: ${computedLink}\n5. Укажите проходной балл (рекомендуется от 70 баллов).`,
      };
    }

    const fields = {
      hh_post_text: parsedFields.hh_post_text || "",
      hh_invite_text: parsedFields.hh_invite_text || "",
      hh_autoresume_text: parsedFields.hh_autoresume_text || "",
    };

    if (pid) {
      try {
        await db.run(
          "UPDATE projects SET hh_post_text = ?, hh_invite_text = ?, hh_autoresume_text = ?, updated_at = NOW() WHERE id = ? OR CAST(public_id AS TEXT) = ?",
          [fields.hh_post_text, fields.hh_invite_text, fields.hh_autoresume_text, pid, String(pid)]
        );
      } catch (e) {
        console.warn("Error updating project with HH templates:", e);
      }
    }

    return res.json({ success: true, fields, ...fields });
  } catch (err: any) {
    console.error("Error generating HH templates:", err);
    return res.status(500).json({ success: false, error: err.message, job_id: err.job_id || err.jobId });
  }
}

async function handleDistributeText(req: Request, res: Response) {
  try {
    const { text, raw_text, entity_id } = req.body || {};
    const inputContent = String(text || raw_text || "").trim();
    if (!inputContent) {
      return res.status(400).json({ success: false, error: "Empty text provided" });
    }

    const customPrompt = buildVacancyCustomFieldsGenerationPromptSegment();
    const prompt = `Ты — ведущий аналитик и HR-архитектор платформы "Робот Рекрутер (RR)".
Перед тобой неструктурированный текст вакансии, регламента или документа:
"""
${inputContent.slice(0, 10000)}
"""

Твоя задача — внимательно проанализировать текст и разнести данные по всем соответствующим полям вакансии + сгенерировать 5 кастомных полей анкеты соискателя.
${customPrompt}
Верни СТРОГО валидный JSON с ключами: role_name, vacancy_text, tasks_activity_text, schedule_text, salary_terms, payouts_text, motivation_text, motivation_text_detail, onboarding_text, company_text, team_text, system_text, custom_wiki, training_professional_text, training_product_text, training_systems_text, training_wiki_text, training_regulations_text, custom_fields.`;

    const isPromax = Boolean(req.body?.use_promax || req.body?.useProMax);
    const promptKey = isPromax ? "vacancy_distribute_text_promax" : "vacancy_distribute_text";
    const db = await getProTalkDB();
    const empId = await resolveEmployerPublicId(db, {
      employerPublicId: req.body?.employer_public_id || req.body?.employerPublicId || (req as any).user?.public_id,
      employerId: req.body?.employer_id || req.body?.employerId || (req as any).user?.id,
      projectId: req.body?.project_id || req.body?.projectId || entity_id,
      companyId: req.body?.company_id || req.body?.companyId,
    });
    const vacChatId = await formatEmployerChatId(empId, "RRvacancy");
    const rawResult = await callProTalkLLM(
      "vacancy",
      [{ role: "user", content: prompt }],
      vacChatId,
      empId,
      entity_id ? String(entity_id) : undefined,
      promptKey,
      isPromax
    );
    let fields = tryParseLLMJson<any>(rawResult) || {};
    if (!fields.role_name && !fields.vacancy_text) {
      fields = {
        role_name: "Специалист",
        vacancy_text: inputContent.slice(0, 1000),
        tasks_activity_text: "• [🎯 Основные задачи] Выполнение функциональных обязанностей",
        schedule_text: "• Полный рабочий день\n• Гибкий график",
        payouts_text: "• Выплаты 2 раза в месяц\n• Бонусы за результат",
        motivation_text: "Присоединяйтесь к нашей команде профессионалов!",
      };
    }

    let customDefs = parseVacancyCandidateFieldsConfig({
      customFields: fields.custom_fields || [],
    }).customFields;
    if (customDefs.length === 0) {
      customDefs = buildDefaultVacancyCustomFields(fields.role_name || "Специалист");
    }
    fields.candidate_fields_config = { customFields: customDefs };
    fields.custom_fields = customDefs;

    return res.json({ success: true, fields, ...fields });
  } catch (err: any) {
    console.error("Error distributing text:", err);
    return res.status(500).json({ success: false, error: err.message, job_id: err.job_id || err.jobId });
  }
}

export function registerProjectAiRoutes(projectsRouter: Router) {
  projectsRouter.post("/ai-generate-hh-templates", handleGenerateHHTemplates);
  projectsRouter.post("/ai/generate-hh-templates", handleGenerateHHTemplates);

  projectsRouter.post("/ai-distribute-text", handleDistributeText);
  projectsRouter.post("/ai/distribute-text", handleDistributeText);

  projectsRouter.post("/generate-project-onboarding", async (req: Request, res: Response) => {
    const { companyName, roleName, customWiki, salaryTerms, scheduleTerms } = req.body;
    const db = await getProTalkDB();

    let checklistQuestions = [
      "Опишите ваши ключевые навыки, связанные с данной вакансией.",
      "Расскажите об аналогичных проектах, над которыми вы успешно трудились.",
      "С какими вызовами вы обычно сталкиваетесь в этой роли и как их решаете?",
    ];
    let roleplayQuestions = [
      "Смоделируйте ситуацию: Конфликтный клиент требует срочно сдать отчет в нерабочее время. Ваши действия?",
      "Продемонстрируйте ваш подход в планировании задач на неделю при высокой степени неопределенности.",
    ];
    let motivationText = `Мы ищем ответственного специалиста в нашу команду на позицию ${roleName}. Предлагаем гибкий график, наставничество и огромные возможности роста.`;
    let vacancyText = `Мы рады предложить вакансию на ключевую роль: ${roleName} в компании ${companyName}.\n\nТребования:\n- Грамотная речь, обучаемость\n- Ответственность и нацеленность на результат`;
    let tasksActivityText = `• [📞 Консультации] Прием и обработка входящих запросов.\n• [📝 Учет в CRM] Ведение истории взаимодействия с клиентами.\n• [🤝 Помощь клиентам] Отработка возражений и решение вопросов.`;
    let motivationTextDetail = `В компании ${companyName} вы раскроете свой потенциал на роли "${roleName}".`;
    let companyText = `${companyName} — динамично развивающаяся прогрессивная компания.`;
    let onboardingText = `• [📝 Экспресс-тест] Входное ИИ-тестирование.\n• [📚 Изучение Wiki] Ознакомление со стандартами.\n• [🤖 ИИ-Разговор] Симуляция.\n• [✍️ Оформление] Быстрое оформление.`;
    let payoutsText = `• Фиксированная ставка.\n• Бонусы и премии по KPI.\n• Выплаты 2 раза в месяц.`;
    let scheduleText = `• Гибкое начало дня.\n• Удаленка или гибридный офис.`;
    let teamText = `• [Отдел] Отдел продаж и развития\n• Тимлид - Руководитель группы.\n• Куратор - HR специалист.`;
    let cabinetTabsText = `• [💻 Панель CRM] Инструмент для работы с клиентами. | 💡 Регламент: Карта заполняется сразу.`;
    let systemText = `• Своевременное ведение учета в CRM.\n• Соблюдение регламентов Wiki.\n• Ежедневная отчетность.`;

    const prompt = `Мы создаем систему подбора и онбординга персонала "Робот Рекрутер (RR)".
Компания: "${companyName}"
Должность: "${roleName}"
Описание / Документы / Вики: "${customWiki || "Нет дополнительных сведений"}"

Верни ТОЛЬКО валидный JSON-объект с ключами: motivationText, checklistQuestions (3), roleplayQuestions (2), vacancyText, tasksActivityText, motivationTextDetail, companyText, onboardingText, payoutsText, scheduleText, teamText, cabinetTabsText, systemText.`;

    try {
      const isPromax = Boolean(req.body?.use_promax || req.body?.useProMax);
      const promptKey = isPromax ? "vacancy_generation_promax" : "vacancy_generation";
      const employerId = await resolveEmployerPublicId(db, {
        employerPublicId: req.body?.employer_public_id || req.body?.employerPublicId || (req as any).user?.public_id,
        employerId: req.body?.employerId || req.body?.employer_id || (req as any).user?.id,
        companyId: req.body?.company_id || req.body?.companyId,
      });
      const vacChatId = await formatEmployerChatId(employerId, "RRvacancy");
      const text = await callProTalkLLM(
        "vacancy",
        [{ role: "user", content: prompt }],
        vacChatId,
        employerId,
        undefined,
        promptKey,
        isPromax
      );
      const parsed = tryParseLLMJson<any>(text) || {};
      if (parsed.motivationText) motivationText = parsed.motivationText;
      if (parsed.checklistQuestions) checklistQuestions = parsed.checklistQuestions;
      if (parsed.roleplayQuestions) roleplayQuestions = parsed.roleplayQuestions;
      if (parsed.vacancyText) vacancyText = parsed.vacancyText;
      if (parsed.tasksActivityText) tasksActivityText = parsed.tasksActivityText;
      if (parsed.motivationTextDetail) motivationTextDetail = parsed.motivationTextDetail;
      if (parsed.companyText) companyText = parsed.companyText;
      if (parsed.onboardingText) onboardingText = parsed.onboardingText;
      if (parsed.payoutsText) payoutsText = parsed.payoutsText;
      if (parsed.scheduleText) scheduleText = parsed.scheduleText;
      if (parsed.teamText) teamText = parsed.teamText;
      if (parsed.cabinetTabsText) cabinetTabsText = parsed.cabinetTabsText;
      if (parsed.systemText) systemText = parsed.systemText;
    } catch (err) {
      console.error("ProTalk failed during project onboarding generation, using quality fallbacks:", err);
    }

    const comp = await db.get(
      "SELECT * FROM companies WHERE LOWER(name) = LOWER(?) OR (slug IS NOT NULL AND slug = ?) LIMIT 1",
      [companyName || "", req.body.companySlug || ""]
    );

    const defaultCustomFields = buildDefaultVacancyCustomFields(roleName || "Специалист");
    const newProj = {
      id: "proj-" + Math.random().toString(36).substr(2, 9),
      companyName,
      companySlug: req.body.companySlug || (comp ? comp.slug : ""),
      employerId: req.body.employerId || "",
      roleName,
      salaryTerms: salaryTerms || (comp && comp.salaryTerms) || "Конкурентные условия (по результатам интервью)",
      scheduleTerms: scheduleTerms || (comp && comp.scheduleTerms) || "Обсуждается индивидуально",
      motivationText,
      checklistQuestions,
      roleplayQuestions,
      candidate_fields_config: { customFields: defaultCustomFields },
      candidateFieldsConfig: { customFields: defaultCustomFields },
      customWiki: customWiki || (comp && comp.customWiki) || "",
      vacancyText,
      tasksActivityText,
      motivationTextDetail,
      companyText: comp && comp.description ? comp.description : companyText,
      onboardingText,
      payoutsText,
      scheduleText,
      teamText,
      cabinetTabsText,
      systemText,
      logoUrl: req.body.logoUrl || (comp && comp.logoUrl) || "/files/11/rr-logo.png",
      missionText: (comp && comp.missionText) || "Создавать лучшие инновации",
      statsValClients: (comp && comp.statsValClients) || "1200+",
      statsLabelClients: (comp && comp.statsLabelClients) || "Активных клиентов",
      statsValDialogs: (comp && comp.statsValDialogs) || "250 тыс",
      statsLabelDialogs: (comp && comp.statsLabelDialogs) || "Диалогов проведено",
      statsValFounded: (comp && comp.statsValFounded) || "2018",
      statsLabelFounded: (comp && comp.statsLabelFounded) || "Год основания",
    };

    await saveProjectToProTalkDB(db, newProj);
    return res.json(newProj);
  });
}
