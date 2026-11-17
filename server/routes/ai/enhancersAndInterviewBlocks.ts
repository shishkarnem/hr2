import { Router, Request, Response } from "express";
import crypto from "crypto";
import {
  formatEmployerChatId,
  resolveEmployerPublicId,
  callProTalkLLM,
  getProTalkPrompt,
  tryParseLLMJson,
  extractBalancedJsonObjects,
} from "../../common";
import { getProTalkDB } from "../../db";
import {
  STANDARD_CANDIDATE_FIELDS,
  CandidateCustomFieldDef,
  buildDefaultVacancyCustomFields,
  buildVacancyCustomFieldsGenerationPromptSegment,
  buildGenerateMoreCustomFieldsPromptSegment,
  parseVacancyCandidateFieldsConfig,
} from "../../../src/lib/candidateFields";
import { buildLlmMessagesFromPrompt, storeFailedAiJob } from "../../aiHelpers/common";
import {
  computeTypeDistribution,
  extractRequestedQuestionCount,
  normalizeOptions,
} from "../../aiHelpers/quizAndOptions";

export const enhancersRouter = Router();

export const handleAIEnhance = async (req: Request, res: Response) => {
  try {
    const {
      mode,
      field,
      value,
      role_name,
      company_name,
      employer_id,
      employer_public_id,
      user_id,
      project_id,
      company_id,
      all_fields,
      hint,
      template,
      fields,
      use_promax,
    } = req.body || {};

    const db = await getProTalkDB();
    const resolvedEmpId = await resolveEmployerPublicId(db, {
      employerId: employer_id,
      employerPublicId: employer_public_id,
      userId: user_id,
      projectId: project_id || all_fields?.project_id || fields?.project_id,
      companyId: company_id || all_fields?.company_id || fields?.company_id,
    });
    const isProMax = Boolean(use_promax || req.body?.useProMax);
    const isSingle = mode === "single" || !!field;
    const role = role_name || all_fields?.role_name || "Специалист";
    const company = company_name || all_fields?.company_name || "Компания";

    if (field === "training_material" || mode === "training_material") {
      const rawText = value || (all_fields && all_fields.training_material) || "";
      const promptKey = isProMax ? "training_material_enhance_promax" : "training_material_enhance";
      const promptData = await getProTalkPrompt(promptKey, undefined, isProMax);
      const fallbackUser = `Ты — ведущий методолог образовательных программ платформы «Робот Рекрутер».
Улучши, отредактируй и структурируй учебный материал для роли «${role}» в компании «${company}».

ИСХОДНЫЙ ТЕКСТ МАТЕРИАЛА:
${rawText}`;
      const llmMessages = buildLlmMessagesFromPrompt(
        promptData,
        { raw_text: rawText, source: rawText, value: rawText, role, role_name: role, company, company_name: company },
        fallbackUser
      );
      const chatId = formatEmployerChatId(resolvedEmpId, "RRtraining");

      let aiText = "";
      try {
        aiText = await callProTalkLLM("training", llmMessages, chatId, undefined, undefined, promptKey, isProMax);
      } catch (err: any) {
        const failedJobId = storeFailedAiJob(err, "enhance_training_material", req.body);
        return res.status(502).json({
          ok: false,
          job_id: failedJobId,
          error: `Ошибка нейросети при обработке материала: ${err?.message || "сервис временно недоступен"}`,
          retryable: true,
        });
      }

      const cleanText = (aiText || "").replace(/^```(?:markdown|text)?\n?/i, "").replace(/\n?```$/i, "").trim();
      if (!cleanText) {
        const emptyJobId = storeFailedAiJob(new Error("Empty LLM response"), "enhance_training_material", req.body);
        return res.status(502).json({
          ok: false,
          job_id: emptyJobId,
          error: "Нейросеть вернула пустой ответ. Повторите попытку через RR ProMax.",
          retryable: true,
        });
      }

      return res.json({ ok: true, value: cleanText, text: cleanText, field: "training_material" });
    }

    if (isSingle) {
      const fieldKey = field || "vacancy_text";
      const currentValue = value || (all_fields && all_fields[fieldKey]) || "";
      let contextStr = "";
      if (all_fields && typeof all_fields === "object") {
        contextStr = Object.entries(all_fields)
          .filter(([k, v]) => k !== fieldKey && typeof v === "string" && v.trim().length > 0)
          .map(([k, v]) => `• [${k}]: ${String(v).trim().slice(0, 500)}`)
          .join("\n");
      }

      const promptKey = isProMax ? "vacancy_field_enhance_promax" : "vacancy_field_enhance";
      const promptData = await getProTalkPrompt(promptKey, undefined, isProMax);
      const fallbackUser = `Составь или улучши содержание раздела «${fieldKey}» для вакансии на должность «${role}» в компании «${company}».
ДРУГИЕ ЗАПОЛНЕННЫЕ РАЗДЕЛЫ ВАКАНСИИ:\n${contextStr || "Пока не заполнены"}
ТЕКУЩЕЕ ЗНАЧЕНИЕ ПОЛЯ:\n${currentValue || "Пусто"}
${template ? `ЭТАЛОННЫЙ ШАБЛОН:\n${template}\n` : ""}
${hint ? `ДОПОЛНИТЕЛЬНАЯ ИНСТРУКЦИЯ:\n${hint}\n` : ""}
Требования: заполни строго раздел «${fieldKey}», не используй капслок, верни готовый текст без markdown-обёрток.`;

      const llmMessages = buildLlmMessagesFromPrompt(
        promptData,
        {
          field: fieldKey,
          field_key: fieldKey,
          role,
          role_name: role,
          company,
          company_name: company,
          value: currentValue,
          context: contextStr,
          hint: hint || "",
          template: template || "",
        },
        fallbackUser
      );
      const chatId = formatEmployerChatId(resolvedEmpId, "RRvacancy");

      let aiText = "";
      try {
        aiText = await callProTalkLLM("vacancy", llmMessages, chatId, undefined, undefined, promptKey, isProMax);
      } catch (err: any) {
        const failedJobId = storeFailedAiJob(err, "enhance_single_field", req.body);
        return res.status(502).json({
          ok: false,
          job_id: failedJobId,
          error: `Ошибка нейросети при генерации поля: ${err?.message || "сервис временно недоступен"}`,
          retryable: true,
        });
      }

      const cleanText = (aiText || "").replace(/^```(?:markdown|text)?\n?/i, "").replace(/\n?```$/i, "").trim();
      if (!cleanText) {
        const emptyJobId = storeFailedAiJob(new Error("Empty LLM response"), "enhance_single_field", req.body);
        return res.status(502).json({
          ok: false,
          job_id: emptyJobId,
          error: "Нейросеть вернула пустой ответ для поля. Повторите попытку.",
          retryable: true,
        });
      }

      return res.json({ ok: true, value: cleanText, text: cleanText, field: fieldKey });
    }

    const currentFields = fields || all_fields || {};
    const customFieldsPrompt = buildVacancyCustomFieldsGenerationPromptSegment();
    const promptKey = isProMax ? "vacancy_full_enhance_promax" : "vacancy_full_enhance";
    const promptData = await getProTalkPrompt(promptKey, undefined, isProMax);

    const fallbackUser = `Сгенерируй полное и привлекательное описание вакансии по ключевым разделам и 5 кастомным полям анкеты соискателя для должности «${role}» в компании «${company}».
ИСХОДНЫЕ ДАННЫЕ:\n${JSON.stringify(currentFields, null, 2)}
${customFieldsPrompt}
Верни СТРОГО валидный JSON со всеми полями вакансии (role_name, vacancy_text, tasks_activity_text, schedule_text, motivation_text, motivation_text_detail, payouts_text, onboarding_text, team_text, system_text, training_professional_text, training_product_text, training_systems_text, training_wiki_text, training_regulations_text, custom_fields).`;

    const llmMessages = buildLlmMessagesFromPrompt(
      promptData,
      { role, role_name: role, company, company_name: company, fields: JSON.stringify(currentFields, null, 2) },
      fallbackUser
    );
    const chatId = formatEmployerChatId(resolvedEmpId, "RRvacancy");

    let aiText = "";
    try {
      aiText = await callProTalkLLM("vacancy", llmMessages, chatId, undefined, undefined, promptKey, isProMax);
    } catch (err: any) {
      const failedJobId = storeFailedAiJob(err, "enhance_all_fields", req.body);
      return res.status(502).json({
        ok: false,
        job_id: failedJobId,
        error: `Ошибка нейросети при полном заполнении вакансии: ${err?.message || "сервис временно недоступен"}`,
        retryable: true,
      });
    }

    const parsedJson = tryParseLLMJson<any>(aiText);
    if (!parsedJson || typeof parsedJson !== "object" || Object.keys(parsedJson).length === 0) {
      const emptyJobId = storeFailedAiJob(new Error("Invalid JSON returned"), "enhance_all_fields", req.body);
      return res.status(502).json({
        ok: false,
        job_id: emptyJobId,
        error: "Нейросеть вернула ответ в некорректном формате при заполнении вакансии. Повторите попытку.",
        retryable: true,
      });
    }

    let generatedCustomFields: CandidateCustomFieldDef[] = [];
    if (Array.isArray(parsedJson.custom_fields) && parsedJson.custom_fields.length > 0) {
      generatedCustomFields = parseVacancyCandidateFieldsConfig({ customFields: parsedJson.custom_fields }).customFields;
    }
    if (generatedCustomFields.length === 0) {
      generatedCustomFields = buildDefaultVacancyCustomFields(role);
    }
    const candidate_fields_config = { customFields: generatedCustomFields };

    return res.json({
      ok: true,
      candidate_fields_config,
      custom_fields: generatedCustomFields,
      fields: { ...currentFields, ...parsedJson, candidate_fields_config },
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message || "Internal server error" });
  }
};

enhancersRouter.post("/enhance-all-fields", handleAIEnhance);
enhancersRouter.post("/ai-enhance", handleAIEnhance);

const handleGenerateMoreCustomFields = async (req: Request, res: Response) => {
  try {
    const {
      role_name,
      roleName,
      company_name,
      companyName,
      vacancy_text,
      vacancyText,
      tasks_activity_text,
      tasksActivityText,
      schedule_text,
      scheduleText,
      system_text,
      systemText,
      existing_custom_fields,
      existingCustomFields,
      employer_id,
      employerId,
      employer_public_id,
      company_id,
      project_id,
      use_promax,
    } = req.body || {};

    const role = String(role_name || roleName || "Специалист").trim();
    const company = String(company_name || companyName || "Компания").trim();
    const vacContext = [
      vacancy_text || vacancyText ? `Требования и описание: ${String(vacancy_text || vacancyText).slice(0, 1200)}` : "",
      tasks_activity_text || tasksActivityText ? `Задачи: ${String(tasks_activity_text || tasksActivityText).slice(0, 1000)}` : "",
      schedule_text || scheduleText ? `График: ${String(schedule_text || scheduleText).slice(0, 600)}` : "",
      system_text || systemText ? `Системы и инструменты: ${String(system_text || systemText).slice(0, 600)}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const rawExisting = existing_custom_fields || existingCustomFields || [];
    const parsedExisting = parseVacancyCandidateFieldsConfig({
      customFields: Array.isArray(rawExisting) ? rawExisting : rawExisting?.customFields || [],
    }).customFields;

    const existingLabelsLower = new Set<string>([
      ...STANDARD_CANDIDATE_FIELDS.map((f) => f.label.toLowerCase()),
      ...parsedExisting.map((f) => f.label.toLowerCase()),
    ]);
    const existingKeysLower = new Set<string>([
      ...STANDARD_CANDIDATE_FIELDS.map((f) => f.key.toLowerCase()),
      ...parsedExisting.map((f) => f.key.toLowerCase()),
    ]);

    const prompt = buildGenerateMoreCustomFieldsPromptSegment(role, company, vacContext, parsedExisting);
    const isProMax = Boolean(use_promax || req.body?.useProMax);
    const promptKey = isProMax ? "vacancy_custom_fields_generate_promax" : "vacancy_custom_fields_generate";
    const db = await getProTalkDB();
    const resolvedEmpId = await resolveEmployerPublicId(db, {
      employerId: employer_id || employerId,
      employerPublicId: employer_public_id,
      projectId: project_id,
      companyId: company_id,
    });
    const chatId = formatEmployerChatId(resolvedEmpId, "RRvacancy");

    const aiFields: CandidateCustomFieldDef[] = [];
    try {
      const aiText = await callProTalkLLM(
        "vacancy",
        [{ role: "user", content: prompt }],
        chatId,
        resolvedEmpId,
        project_id ? String(project_id) : undefined,
        promptKey,
        isProMax
      );
      const parsed = tryParseLLMJson<any>(aiText);
      const rawArr = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.custom_fields)
        ? parsed.custom_fields
        : Array.isArray(parsed?.fields)
        ? parsed.fields
        : [];
      if (rawArr.length > 0) {
        const normalized = parseVacancyCandidateFieldsConfig({ customFields: rawArr }).customFields;
        for (const f of normalized) {
          if (!existingLabelsLower.has(f.label.toLowerCase()) && !existingKeysLower.has(f.key.toLowerCase())) {
            aiFields.push(f);
            existingLabelsLower.add(f.label.toLowerCase());
            existingKeysLower.add(f.key.toLowerCase());
          }
        }
      }
    } catch (e) {
      console.warn("[/api/ai-generate-custom-fields] LLM notice:", e);
    }

    const fallbackPool: CandidateCustomFieldDef[] = [
      { id: "cf_linkedin", key: "custom_linkedin", label: "LinkedIn", type: "text", placeholder: "https://linkedin.com/in/..." },
      { id: "cf_youtube", key: "custom_youtube", label: "YouTube", type: "text", placeholder: "https://youtube.com/@..." },
      { id: "cf_portfolio", key: "custom_portfolio", label: "Портфолио", type: "text", placeholder: "Ссылка на портфолио или кейсы" },
      { id: "cf_former_employers", key: "custom_former_employers", label: "Контакты бывших работодателей", type: "text", placeholder: "ФИО, должность, телефон" },
      { id: "cf_emergency_contacts", key: "custom_emergency_contacts", label: "Контакты близких", type: "text", placeholder: "ФИО и телефон для экстренной связи" },
      { id: "cf_other_links", key: "custom_other_links", label: "Прочие ссылки", type: "text", placeholder: "Behance, Dribbble, Habr, VC, личный сайт" },
      {
        id: "cf_crm_systems",
        key: "custom_crm_systems",
        label: `Опыт работы в профильных системах (${role})`,
        type: "multiselect",
        options: ["amoCRM", "Bitrix24", "1С:Предприятие", "МойСклад", "Jira / Confluence", "Notion / Yonote", "Google Таблицы / Excel", "RetailCRM"],
      },
      {
        id: "cf_contract_type",
        key: "custom_contract_type",
        label: "Предпочтительный формат оформления",
        type: "multiselect",
        options: ["Трудовой договор (ТК РФ)", "Договор ГПХ", "Самозанятость (НПД)", "ИП"],
      },
      {
        id: "cf_start_readiness",
        key: "custom_start_readiness",
        label: "Срок готовности выйти на работу",
        type: "multiselect",
        options: ["Готов выйти завтра", "В течение 3–5 дней", "Отработка 2 недели", "В течение 1 месяца"],
      },
      {
        id: "cf_preferred_messenger",
        key: "custom_preferred_messenger",
        label: "Предпочитаемый способ оперативной связи",
        type: "multiselect",
        options: ["Telegram", "WhatsApp", "Телефонный звонок", "Email", "MAX"],
      },
    ];

    for (const item of fallbackPool) {
      if (aiFields.length >= 5) break;
      if (!existingLabelsLower.has(item.label.toLowerCase()) && !existingKeysLower.has(item.key.toLowerCase())) {
        aiFields.push(item);
        existingLabelsLower.add(item.label.toLowerCase());
        existingKeysLower.add(item.key.toLowerCase());
      }
    }

    const addedFields = aiFields.slice(0, 5);
    const allCustomFields = [...parsedExisting, ...addedFields];

    return res.json({
      ok: true,
      added_fields: addedFields,
      custom_fields: allCustomFields,
      candidate_fields_config: { customFields: allCustomFields },
    });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err.message || "Failed to generate custom fields" });
  }
};

enhancersRouter.post(["/ai-generate-custom-fields", "/ai/generate-custom-fields"], handleGenerateMoreCustomFields);

export const handleGenerateInterviewResumeCriteria = async (req: Request, res: Response) => {
  try {
    const { project_id, wishes, anti_ai_enabled, employer_public_id, employer_id, use_promax } = req.body || {};
    if (!project_id) return res.status(400).json({ error: "project_id is required" });

    const pStr = String(project_id);
    const cleanPid = pStr.replace(/^vac/i, "");
    const db = await getProTalkDB();
    const proj = await db.get(
      "SELECT * FROM projects WHERE id = ? OR CAST(public_id AS TEXT) = ? OR CAST(public_id AS TEXT) = ? OR slug = ? LIMIT 1",
      [pStr, pStr, cleanPid, pStr]
    );
    if (!proj) return res.status(404).json({ error: "Project not found" });

    const comp = proj.company_id
      ? await db.get("SELECT * FROM companies WHERE id = ? OR CAST(public_id AS TEXT) = ? LIMIT 1", [String(proj.company_id), String(proj.company_id)])
      : null;

    const roleName = proj.role_name || "Специалист";
    const companyName = proj.company_name || comp?.name || "Компания";
    const existingBlk = await db.get("SELECT * FROM interview_blocks WHERE project_id = ? AND kind = 'resume' LIMIT 1", [String(proj.id)]);
    let existingPl: any = {};
    try {
      if (existingBlk?.payload) existingPl = typeof existingBlk.payload === "string" ? JSON.parse(existingBlk.payload) : existingBlk.payload;
    } catch {}
    const effectiveWishes = String(wishes ?? existingPl.employer_wishes ?? "").trim();
    const effectiveAntiAi = anti_ai_enabled !== undefined ? Boolean(anti_ai_enabled) : Boolean(existingBlk?.anti_ai_enabled || existingPl.anti_ai_enabled);

    const isProMax = Boolean(use_promax || req.body?.useProMax);
    const promptKey = isProMax ? "interview_resume_criteria_generate_promax" : "interview_resume_criteria_generate";
    const promptData = await getProTalkPrompt(promptKey, undefined, isProMax);

    const fallbackUser = `Сформируй развёрнутые, структурированные критерии оценки резюме кандидата на позицию «${roleName}» в компании «${companyName}».

Данные вакансии и компании:
- Требования и описание вакансии: ${proj.vacancy_text || ""}
- Ключевые задачи и обязанности: ${proj.tasks_activity_text || ""}
- Системы и программы: ${proj.system_text || comp?.system_text || ""}
- График и условия: ${proj.schedule_terms || proj.schedule_text || ""} / ${proj.salary_terms || proj.payouts_text || ""}
${effectiveWishes ? `- Особые пожелания руководителя: ${effectiveWishes}` : ""}
${effectiveAntiAi ? `- Включена защита от нейросетей: учитывай проверку резюме на признаки генерации ИИ (снижение балла в 2 раза).` : ""}

Оформи ответ в чистом Markdown с разделами (## Обязательные требования, ## Желательные навыки, ## Ключевые задачи, ## Стоп-факторы при отборе) без использования капслока.`;

    const llmMessages = buildLlmMessagesFromPrompt(
      promptData,
      { role: roleName, role_name: roleName, company: companyName, company_name: companyName, wishes: effectiveWishes, vacancy_text: proj.vacancy_text || "" },
      fallbackUser
    );
    const resolvedEmpId = await resolveEmployerPublicId(db, {
      employerId: employer_id,
      employerPublicId: employer_public_id,
      projectId: proj.id,
      companyId: proj.company_id,
    });
    const chatId = formatEmployerChatId(resolvedEmpId, "RRresume");

    let aiText = "";
    try {
      aiText = await callProTalkLLM("resume", llmMessages, chatId, undefined, undefined, promptKey, isProMax);
    } catch (llmErr: any) {
      const failedJobId = storeFailedAiJob(llmErr, "interview_resume_criteria", req.body);
      return res.status(502).json({
        job_id: failedJobId,
        error: `Ошибка вызова нейросети при генерации критериев резюме: ${llmErr?.message || "сервис временно недоступен"}`,
        retryable: true,
      });
    }

    const cleanMd = (aiText || "").replace(/^```(?:markdown|text)?\n?/i, "").replace(/\n?```$/i, "").trim();
    if (cleanMd.length <= 40) {
      const emptyJobId = storeFailedAiJob(new Error("Too short response"), "interview_resume_criteria", req.body);
      return res.status(502).json({
        job_id: emptyJobId,
        error: "Нейросеть вернула слишком короткий ответ при генерации критериев резюме. Повторите через RR ProMax.",
        retryable: true,
      });
    }

    const newPayload = { ...existingPl, criteria_md: cleanMd, employer_wishes: effectiveWishes, anti_ai_enabled: effectiveAntiAi };
    const blkId = existingBlk?.id || crypto.randomUUID();
    const payloadJson = JSON.stringify(newPayload);
    const settingsJson = JSON.stringify({ anti_ai_enabled: effectiveAntiAi });

    await db.run(
      `INSERT INTO interview_blocks (id, project_id, kind, payload, prompt_override, anti_ai_enabled, settings_json, ai_generated_at, created_at, updated_at)
       VALUES (?, ?, 'resume', ?, ?, ?, ?, NOW(), NOW(), NOW())
       ON CONFLICT (project_id, kind) DO UPDATE SET
         payload = EXCLUDED.payload,
         prompt_override = EXCLUDED.prompt_override,
         anti_ai_enabled = EXCLUDED.anti_ai_enabled,
         settings_json = EXCLUDED.settings_json,
         ai_generated_at = NOW(),
         updated_at = NOW()`,
      [blkId, String(proj.id), payloadJson, effectiveWishes, effectiveAntiAi ? 1 : 0, settingsJson]
    );

    return res.json({
      ok: true,
      status: isProMax ? "fallback_succeeded" : "primary_succeeded",
      terminal: true,
      criteria_md: cleanMd,
      anti_ai_enabled: effectiveAntiAi,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "Failed to generate resume criteria" });
  }
};

enhancersRouter.post("/ai-generate-interview-resume-criteria", handleGenerateInterviewResumeCriteria);

enhancersRouter.post(["/ai-list-interview-checklist", "/list-interview-checklist"], async (req: Request, res: Response) => {
  try {
    const { project_id } = req.body || {};
    if (!project_id) return res.status(400).json({ error: "project_id is required" });
    const pStr = String(project_id);
    const cleanPid = pStr.replace(/^vac/i, "");

    const db = await getProTalkDB();
    const proj = await db.get(
      "SELECT * FROM projects WHERE id = ? OR CAST(public_id AS TEXT) = ? OR CAST(public_id AS TEXT) = ? OR slug = ? LIMIT 1",
      [pStr, pStr, cleanPid, pStr]
    );
    const pid = proj?.id || pStr;
    const blocks = (await db.all("SELECT * FROM interview_blocks WHERE project_id = ? OR project_id = ?", [String(pid), pStr])) || [];

    const blkMap: Record<string, any> = {};
    const rowMap: Record<string, any> = {};
    for (const b of blocks) {
      let pl: any = b.payload || {};
      if (typeof pl === "string") {
        try {
          pl = JSON.parse(pl);
        } catch {
          pl = {};
        }
      }
      blkMap[b.kind] = pl;
      rowMap[b.kind] = b;
    }

    const shuffleLocal = <T,>(arr: T[]): T[] => {
      const copy = [...arr];
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      return copy;
    };

    const resumeCriteriaMd = String(blkMap.resume?.criteria_md || proj?.vacancy_text || "");
    let questions: any[] = Array.isArray(blkMap.checklist?.questions) ? blkMap.checklist.questions : [];
    if (questions.length === 0 && proj?.checklist_questions) {
      try {
        const pQs = typeof proj.checklist_questions === "string" ? JSON.parse(proj.checklist_questions) : proj.checklist_questions;
        if (Array.isArray(pQs)) questions = pQs;
      } catch {}
    }
    const doShuffle = blkMap.checklist?.shuffle !== false;
    if (doShuffle && questions.length > 0) {
      questions = shuffleLocal(questions).map((q: any) => {
        const k = String(q.kind || "").toLowerCase();
        if ((k === "choice" || k === "multichoice") && Array.isArray(q.options) && q.options.length > 1) {
          return { ...q, options: shuffleLocal(q.options) };
        }
        return q;
      });
    }

    let situations: any[] = Array.isArray(blkMap.situations?.situations) ? blkMap.situations.situations : [];
    if (situations.length === 0 && proj?.roleplay_questions) {
      try {
        const pSits = typeof proj.roleplay_questions === "string" ? JSON.parse(proj.roleplay_questions) : proj.roleplay_questions;
        if (Array.isArray(pSits)) situations = pSits;
      } catch {}
    }

    return res.json({
      ok: true,
      resume_criteria_md: resumeCriteriaMd,
      questions,
      shuffle: doShuffle,
      situations,
      anti_ai_resume: Boolean(rowMap.resume?.anti_ai_enabled || blkMap.resume?.anti_ai_enabled),
      anti_ai_checklist: Boolean(rowMap.checklist?.anti_ai_enabled || blkMap.checklist?.anti_ai_enabled),
      anti_ai_situations: Boolean(rowMap.situations?.anti_ai_enabled || blkMap.situations?.anti_ai_enabled),
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "Failed to list interview checklist" });
  }
});

export const handleGenerateInterviewChecklist = async (req: Request, res: Response) => {
  try {
    const { project_id, wishes, anti_ai_enabled, employer_public_id, employer_id, use_promax } = req.body || {};
    if (!project_id) return res.status(400).json({ error: "project_id is required" });

    const isProMax = Boolean(use_promax || req.body?.useProMax);
    const db = await getProTalkDB();
    const pStr = String(project_id);
    const cleanPid = pStr.replace(/^vac/i, "");
    const proj = await db.get(
      "SELECT * FROM projects WHERE id = ? OR CAST(public_id AS TEXT) = ? OR CAST(public_id AS TEXT) = ? LIMIT 1",
      [pStr, pStr, cleanPid]
    );
    if (!proj) return res.status(404).json({ error: "Project not found" });

    const existingBlk = await db.get("SELECT * FROM interview_blocks WHERE project_id = ? AND kind = 'checklist' LIMIT 1", [proj.id]);
    let existingPl: any = {};
    try {
      if (existingBlk?.payload) existingPl = typeof existingBlk.payload === "string" ? JSON.parse(existingBlk.payload) : existingBlk.payload;
    } catch {}
    const effectiveWishes = String(wishes ?? existingPl.employer_wishes ?? "").trim();
    const effectiveAntiAi = anti_ai_enabled !== undefined ? Boolean(anti_ai_enabled) : Boolean(existingBlk?.anti_ai_enabled || existingPl.anti_ai_enabled);

    const shuffleArrayLocal = <T,>(arr: T[]): T[] => {
      const copy = [...arr];
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      return copy;
    };

    const roleName = proj.role_name || "Специалист";
    const companyName = proj.company_name || "Компания";
    const targetCount = extractRequestedQuestionCount(effectiveWishes, 20);
    const typeDist = computeTypeDistribution(targetCount, effectiveWishes);

    const fallbackUser = `Сформируй проверочный чек-лист из ${targetCount} вопросов для собеседования на должность «${roleName}» в компании «${companyName}», используя все 4 типа ввода данных:
1. kind="choice" (${typeDist.choice} вопросов): 4 уникальных осмысленных варианта в массиве options и 1 правильный вариант в поле correct.
2. kind="multichoice" (${typeDist.multichoice} вопросов): 4 варианта в options и 2–3 правильных варианта в массиве correct_options.
3. kind="text" (${typeDist.string} вопросов): вопрос и краткий эталонный ответ в expected_answer.
4. kind="paragraph" (${typeDist.paragraph} вопросов): вопрос и развёрнутый эталонный ответ в expected_answer.

Контекст задач: ${proj.tasks_activity_text || ""}
Требования: ${proj.vacancy_text || ""}
Системы: ${proj.system_text || ""}
${effectiveWishes ? `Пожелания руководителя: ${effectiveWishes}` : ""}
${effectiveAntiAi ? `Включена защита от нейросетей: формулируй открытые вопросы на проверку практического опыта.` : ""}
Верни строго JSON без капслока:
{"questions":[{"id":"q1","kind":"choice|multichoice|text|paragraph","question":"...","options":["...","...","...","..."],"correct":"...","correct_options":["...","..."],"expected_answer":"..."}]}`;

    const promptKey = isProMax ? "interview_checklist_generate_promax" : "interview_checklist_generate";
    const promptData = await getProTalkPrompt(promptKey, undefined, isProMax);
    const resolvedEmpId = await resolveEmployerPublicId(db, {
      employerId: employer_id,
      employerPublicId: employer_public_id,
      projectId: proj.id,
      companyId: proj.company_id,
    });
    const chatId = formatEmployerChatId(resolvedEmpId, "RRchecklist");
    const checklistMessages = buildLlmMessagesFromPrompt(
      promptData,
      {
        role_name: roleName,
        company_name: companyName,
        count: targetCount,
        vacancy_text: proj.vacancy_text || "",
        tasks_activity_text: proj.tasks_activity_text || "",
        system_text: proj.system_text || "",
        wishes: effectiveWishes,
      },
      fallbackUser
    );

    let aiText = "";
    try {
      aiText = await callProTalkLLM("checklist", checklistMessages, chatId, undefined, undefined, promptKey, isProMax);
    } catch (llmErr: any) {
      const failedJobId = storeFailedAiJob(llmErr, "interview_checklist", req.body);
      return res.status(502).json({
        job_id: failedJobId,
        error: `Ошибка генерации чек-листа нейросетью: ${llmErr?.message || "попробуйте повторить через RR ProMax"}`,
        retryable: true,
      });
    }

    const parsed = tryParseLLMJson<any>(aiText);
    let arr = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.questions) ? parsed.questions : [];
    if (arr.length < 4) {
      const recovered = extractBalancedJsonObjects(aiText).filter((o) => o && (o.question || o.title));
      if (recovered.length >= 4) arr = recovered;
    }

    const mapped: any[] = [];
    for (let idx = 0; idx < arr.length; idx++) {
      const q = arr[idx];
      const qText = String(q?.question || q?.title || "").trim();
      if (!qText || qText.length < 8) continue;
      const rawK = String(q.kind || "").toLowerCase().trim();
      const k: "choice" | "multichoice" | "text" | "paragraph" =
        rawK === "multichoice" || rawK === "multiple_choice" || rawK === "checkbox"
          ? "multichoice"
          : rawK === "paragraph" || rawK === "long_text"
          ? "paragraph"
          : rawK === "text" || rawK === "string" || rawK === "short_text"
          ? "text"
          : "choice";

      if (k === "choice") {
        const normOpts = normalizeOptions(q.options, q.correct ?? q.correct_answer, false);
        if (!normOpts) {
          const exp = String(q.expected_answer || q.expected || q.correct || "").trim();
          if (exp) mapped.push({ id: q.id || `q${mapped.length + 1}`, kind: "text", question: qText, expected_answer: exp });
          continue;
        }
        const corr = normOpts.find((o) => o.is_correct)?.text || normOpts[0].text;
        const shuffledOpts = shuffleArrayLocal(normOpts.map((o) => o.text));
        mapped.push({ id: q.id || `q${mapped.length + 1}`, kind: "choice", question: qText, options: shuffledOpts, correct: corr });
      } else if (k === "multichoice") {
        const rawCorr = Array.isArray(q.correct_options) && q.correct_options.length > 0
          ? q.correct_options
          : typeof q.correct === "string" && q.correct.includes("||")
          ? q.correct.split("||").map((s: string) => s.trim())
          : q.correct;
        const normOpts = normalizeOptions(q.options, rawCorr, true);
        if (!normOpts) {
          const exp = String(q.expected_answer || q.expected || "").trim();
          if (exp) mapped.push({ id: q.id || `q${mapped.length + 1}`, kind: "paragraph", question: qText, expected_answer: exp });
          continue;
        }
        const corrArr = normOpts.filter((o) => o.is_correct).map((o) => o.text);
        const shuffledOpts = shuffleArrayLocal(normOpts.map((o) => o.text));
        mapped.push({
          id: q.id || `q${mapped.length + 1}`,
          kind: "multichoice",
          question: qText,
          options: shuffledOpts,
          correct_options: corrArr,
          correct: corrArr.join(" || "),
        });
      } else {
        const exp = String(q.expected_answer || q.expected || q.correct || "").trim();
        if (!exp) continue;
        mapped.push({ id: q.id || `q${mapped.length + 1}`, kind: k, question: qText, expected_answer: exp });
      }
    }

    if (mapped.length < 4) {
      const emptyJobId = storeFailedAiJob(new Error("Too few valid checklist questions parsed"), "interview_checklist", req.body);
      return res.status(502).json({
        job_id: emptyJobId,
        error: "Нейросеть вернула недостаточно корректных вопросов для чек-листа. Повторите через RR ProMax.",
        retryable: true,
      });
    }

    const pointPerQ = Number((100 / mapped.length).toFixed(2));
    const questions = shuffleArrayLocal(mapped.map((item) => ({ ...item, points: pointPerQ })));
    const newPayload = {
      ...existingPl,
      questions,
      shuffle: existingPl.shuffle !== false,
      employer_wishes: effectiveWishes,
      anti_ai_enabled: effectiveAntiAi,
    };

    await db.run(
      `INSERT INTO interview_blocks (id, project_id, kind, payload, prompt_override, anti_ai_enabled, settings_json, ai_generated_at, created_at, updated_at)
       VALUES (?, ?, 'checklist', ?, ?, ?, ?, NOW(), NOW(), NOW())
       ON CONFLICT (project_id, kind) DO UPDATE SET
         payload = EXCLUDED.payload,
         prompt_override = EXCLUDED.prompt_override,
         anti_ai_enabled = EXCLUDED.anti_ai_enabled,
         settings_json = EXCLUDED.settings_json,
         ai_generated_at = NOW(),
         updated_at = NOW()`,
      [
        existingBlk?.id || crypto.randomUUID(),
        proj.id,
        JSON.stringify(newPayload),
        effectiveWishes,
        effectiveAntiAi ? 1 : 0,
        JSON.stringify({ anti_ai_enabled: effectiveAntiAi }),
      ]
    );
    await db.run("UPDATE projects SET checklist_questions = ?, updated_at = NOW() WHERE id = ?", [JSON.stringify(questions), proj.id]);

    return res.json({
      ok: true,
      status: isProMax ? "fallback_succeeded" : "primary_succeeded",
      terminal: true,
      questions,
      anti_ai_enabled: effectiveAntiAi,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "Failed to generate checklist" });
  }
};

enhancersRouter.post("/ai-generate-interview-checklist", handleGenerateInterviewChecklist);

export const handleGenerateInterviewSituations = async (req: Request, res: Response) => {
  try {
    const { project_id, wishes, anti_ai_enabled, employer_public_id, employer_id, use_promax } = req.body || {};
    if (!project_id) return res.status(400).json({ error: "project_id is required" });

    const isProMax = Boolean(use_promax || req.body?.useProMax);
    const db = await getProTalkDB();
    const pStr = String(project_id);
    const cleanPid = pStr.replace(/^vac/i, "");
    const proj = await db.get(
      "SELECT * FROM projects WHERE id = ? OR CAST(public_id AS TEXT) = ? OR CAST(public_id AS TEXT) = ? LIMIT 1",
      [pStr, pStr, cleanPid]
    );
    if (!proj) return res.status(404).json({ error: "Project not found" });

    const existingBlk = await db.get("SELECT * FROM interview_blocks WHERE project_id = ? AND kind = 'situations' LIMIT 1", [proj.id]);
    let existingPl: any = {};
    try {
      if (existingBlk?.payload) existingPl = typeof existingBlk.payload === "string" ? JSON.parse(existingBlk.payload) : existingBlk.payload;
    } catch {}
    const effectiveWishes = String(wishes ?? existingPl.employer_wishes ?? "").trim();
    const effectiveAntiAi = anti_ai_enabled !== undefined ? Boolean(anti_ai_enabled) : Boolean(existingBlk?.anti_ai_enabled || existingPl.anti_ai_enabled);

    const roleName = proj.role_name || "Специалист";
    const companyName = proj.company_name || "Компания";
    const fallbackUser = `Сформируй 3 практические ролевые ситуации (кейса) для проверки кандидата на должность «${roleName}» в компании «${companyName}».
Задачи: ${proj.tasks_activity_text || ""}
Команда: ${proj.team_text || ""}
${effectiveWishes ? `Пожелания руководителя: ${effectiveWishes}` : ""}
Верни строго JSON без капслока: {"situations":[{"id":"s1","title":"...","brief":"...","criteria":"..."}]}`;

    const promptKey = isProMax ? "interview_situations_generate_promax" : "interview_situations_generate";
    const promptData = await getProTalkPrompt(promptKey, undefined, isProMax);
    const resolvedEmpId = await resolveEmployerPublicId(db, {
      employerId: employer_id,
      employerPublicId: employer_public_id,
      projectId: proj.id,
      companyId: proj.company_id,
    });
    const chatId = formatEmployerChatId(resolvedEmpId, "RRsituations");
    const sitMessages = buildLlmMessagesFromPrompt(
      promptData,
      { role_name: roleName, company_name: companyName, tasks_activity_text: proj.tasks_activity_text || "", team_text: proj.team_text || "", wishes: effectiveWishes },
      fallbackUser
    );

    let aiText = "";
    try {
      aiText = await callProTalkLLM("situations", sitMessages, chatId, undefined, undefined, promptKey, isProMax);
    } catch (llmErr: any) {
      const failedJobId = storeFailedAiJob(llmErr, "interview_situations", req.body);
      return res.status(502).json({
        job_id: failedJobId,
        error: `Ошибка генерации ролевых ситуаций: ${llmErr?.message || "попробуйте повторить через RR ProMax"}`,
        retryable: true,
      });
    }

    const parsed = tryParseLLMJson<any>(aiText);
    let arr = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.situations) ? parsed.situations : [];
    if (arr.length === 0) {
      const recovered = extractBalancedJsonObjects(aiText).filter((o) => o && (o.title || o.brief));
      if (recovered.length > 0) arr = recovered;
    }
    if (arr.length === 0) {
      const emptyJobId = storeFailedAiJob(new Error("No situations returned"), "interview_situations", req.body);
      return res.status(502).json({
        job_id: emptyJobId,
        error: "Нейросеть не вернула ролевые ситуации в нужном формате. Повторите через RR ProMax.",
        retryable: true,
      });
    }

    const situations = arr.slice(0, 3).map((s: any, idx: number) => ({
      id: s.id || `s${idx + 1}`,
      title: String(s.title || `Ситуация #${idx + 1}`),
      brief: String(s.brief || ""),
      criteria: String(s.criteria || ""),
    }));

    const newPayload = { ...existingPl, situations, employer_wishes: effectiveWishes, anti_ai_enabled: effectiveAntiAi };
    await db.run(
      `INSERT INTO interview_blocks (id, project_id, kind, payload, prompt_override, anti_ai_enabled, settings_json, ai_generated_at, created_at, updated_at)
       VALUES (?, ?, 'situations', ?, ?, ?, ?, NOW(), NOW(), NOW())
       ON CONFLICT (project_id, kind) DO UPDATE SET
         payload = EXCLUDED.payload,
         prompt_override = EXCLUDED.prompt_override,
         anti_ai_enabled = EXCLUDED.anti_ai_enabled,
         settings_json = EXCLUDED.settings_json,
         ai_generated_at = NOW(),
         updated_at = NOW()`,
      [
        existingBlk?.id || crypto.randomUUID(),
        proj.id,
        JSON.stringify(newPayload),
        effectiveWishes,
        effectiveAntiAi ? 1 : 0,
        JSON.stringify({ anti_ai_enabled: effectiveAntiAi }),
      ]
    );
    await db.run("UPDATE projects SET roleplay_questions = ?, updated_at = NOW() WHERE id = ?", [JSON.stringify(situations), proj.id]);

    return res.json({
      ok: true,
      status: isProMax ? "fallback_succeeded" : "primary_succeeded",
      terminal: true,
      situations,
      anti_ai_enabled: effectiveAntiAi,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "Failed to generate situations" });
  }
};

enhancersRouter.post("/ai-generate-interview-situations", handleGenerateInterviewSituations);
