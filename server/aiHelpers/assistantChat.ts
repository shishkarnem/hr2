import { Request, Response } from "express";
import { callProTalkLLM, getProTalkPrompt } from "../services/protalkAi";
import { resolveEmployerPublicId } from "../services/chatIdHelpers";
import { getProTalkDB, saveAILog } from "../db";
import { storeFailedAiJob } from "./common";

export const handleAiAssistantChat = async (req: Request, res: Response) => {
  try {
    const {
      assistant_type = "landing",
      user_question = "",
      messages = [],
      screenshot_url,
      file_url,
      file_name,
      attached_file_url,
      chat_id,
      employer_id,
      company_id,
      company_slug,
      project_id,
      vacancy_title,
      current_tab,
      current_url,
    } = req.body;

    const db = await getProTalkDB();
    const resolveOriginalUrl = async (rawUrl?: string, fileNameCandidate?: string): Promise<string> => {
      if (!rawUrl || typeof rawUrl !== "string") return "";
      const raw = rawUrl.trim();
      try {
        const mId = raw.match(/\/files\/(\d+)/i);
        const mKey = raw.match(/\/files\/([a-zA-Z0-9_-]{4,})/i);
        const fileId = mId ? mId[1] : null;
        const fileKey = mKey ? mKey[1] : null;
        const fnCandidate = fileNameCandidate || raw.split("/").pop()?.split("?")[0];

        let fileRow: any = null;
        if (fileId) fileRow = await db.get("SELECT original_url FROM file_storage WHERE id = ? LIMIT 1", [fileId]);
        if (!fileRow && fileKey && isNaN(Number(fileKey))) {
          fileRow = await db.get("SELECT original_url FROM file_storage WHERE file_key = ? LIMIT 1", [fileKey]);
        }
        if (!fileRow && fnCandidate) {
          fileRow = await db.get("SELECT original_url FROM file_storage WHERE name = ? ORDER BY id DESC LIMIT 1", [fnCandidate]);
        }
        if (fileRow?.original_url && /^https?:\/\//i.test(fileRow.original_url)) return fileRow.original_url;
      } catch {}
      if (raw.startsWith("/")) {
        const host = req.get("x-forwarded-host") || req.get("host") || "localhost:3000";
        const protocol = req.get("x-forwarded-proto") || req.protocol || "https";
        return `${protocol}://${host}${raw}`;
      }
      return raw;
    };

    const effectiveScreenshotUrl = await resolveOriginalUrl(screenshot_url);
    const effectiveFileUrl = await resolveOriginalUrl(file_url || attached_file_url, file_name);
    const fileAttachmentText = effectiveFileUrl
      ? `\n[ПОЛЬЗОВАТЕЛЬ ПРИКРЕПИЛ ФАЙЛ: ${file_name || "файл"} (Полная ссылка: ${effectiveFileUrl})]. Проанализируй этот файл и учитывай его в ответе.`
      : "";
    const rawQuestion = String(user_question || "").trim();

    const historyText = Array.isArray(messages) && messages.length > 0
      ? messages
          .slice(-8)
          .map((m: any) => `${m.role === "assistant" || m.sender === "assistant" ? "ИИ-Ассистент" : "Пользователь"}: ${m.content || m.text || ""}`)
          .join("\n")
      : "";

    let reply = "";
    const extractedActions: Array<{ type: string; [key: string]: any }> = [];
    let scoreBadge = { score: 98, label: "Анализ запроса: 100%" };
    const userQueriesHistory =
      Array.isArray(req.body.user_messages_history) && req.body.user_messages_history.length > 0
        ? `\nПоследние 5 запросов пользователя по порядку:\n` + req.body.user_messages_history.map((q: string, i: number) => `${i + 1}. ${q}`).join("\n") + "\n"
        : "";

    if (assistant_type === "employer_promax") {
      const cleanEmpId = await resolveEmployerPublicId(db, {
        employerPublicId: req.body?.employer_public_id || (req as any).user?.public_id,
        employerId: employer_id || req.body?.employerId || (req as any).user?.id,
        companyId: company_id,
        projectId: project_id,
      });
      const empRow = await db.get(
        "SELECT id, public_id, name, email, company_name, phone, balance_pay, balance_start FROM employers WHERE id = ? OR CAST(public_id AS TEXT) = ? LIMIT 1",
        [cleanEmpId, cleanEmpId]
      );
      const effEmpKey = empRow?.id || cleanEmpId;
      const walletRow = await db.get("SELECT units_balance FROM wallets WHERE employer_id = ? LIMIT 1", [effEmpKey]);
      const currentBalance = walletRow?.units_balance ?? ((empRow?.balance_pay || 0) + (empRow?.balance_start || 0) || 1000);
      const compCount = Number((await db.get("SELECT COUNT(*) as c FROM companies WHERE owner_employer_id = ? OR employer_id = ?", [effEmpKey, effEmpKey]))?.c || 0);
      const projCount = Number((await db.get("SELECT COUNT(*) as c FROM projects WHERE employer_id = ? OR CAST(employer_public_id AS TEXT) = ?", [effEmpKey, cleanEmpId]))?.c || 0);
      const candCount = Number((await db.get("SELECT COUNT(*) as c FROM candidates WHERE project_id IN (SELECT id FROM projects WHERE employer_id = ? OR CAST(employer_public_id AS TEXT) = ?)", [effEmpKey, cleanEmpId]))?.c || 0);

      const employerOverview = `Данные текущего работодателя #${cleanEmpId}:\n- Имя/Организация: ${empRow?.name || empRow?.company_name || "Работодатель"}\n- Баланс RR: ${currentBalance} RR\n- Компаний создано: ${compCount}\n- Вакансий создано: ${projCount}\n- Кандидатов в базе: ${candCount}\n- Текущая открытая вкладка: ${current_tab || "crm"}`;
      const screenshotContext = effectiveScreenshotUrl
        ? `\n[СКРИНШОТ ЭКРАНА: ${effectiveScreenshotUrl}]. Проанализируй визуальное состояние открытого окна.`
        : "";

      const promptData = await getProTalkPrompt("rr_promax_assistant", undefined, true);
      const fullPrompt = `${promptData.system_prompt}\n\n${employerOverview}${screenshotContext}${fileAttachmentText}\n${userQueriesHistory}\nИстория диалога:\n${historyText}\n\nНовый запрос работодателя: "${rawQuestion}"\n\nСформулируй пошаговый ответ без капслока.`;
      const promaxReply = await callProTalkLLM("other", [{ role: "user", content: fullPrompt }], undefined, cleanEmpId, undefined, "rr_promax_assistant", true);
      reply = promaxReply.trim();

      for (const match of reply.matchAll(/\[\[ACTION:([A-Z_]+)(?::([a-zA-Z0-9_]+))?(?::([^\]]+))?\]\]/g)) {
        const [, actionType, actionParam, actionValue] = match;
        if (actionType === "NAVIGATE" && actionParam) extractedActions.push({ type: "navigate_tab", tab: actionParam });
        else if (actionType === "OPEN" && actionParam) extractedActions.push({ type: "open_modal", modal: actionParam });
        else if (actionType === "FILL" && actionParam) extractedActions.push({ type: "fill_field", field: actionParam, value: actionValue || "" });
        else if (actionType === "TAKE_SCREENSHOT") extractedActions.push({ type: "take_screenshot" });
      }
      reply = reply.replace(/\[\[ACTION:[^\]]+\]\]/g, "").trim();
      scoreBadge = { score: 99, label: "ProMax Копилот" };
    } else if (assistant_type === "vacancy_company") {
      let targetCompSlug = company_slug;
      let targetVacSlug = req.body?.vacancy_slug;
      if ((!targetCompSlug || !targetVacSlug) && current_url) {
        try {
          const pathSegments = new URL(current_url).pathname.split("/").filter(Boolean);
          if (pathSegments.length >= 2 && !["emp", "admin", "blog", "vacancies", "academy", "candidate"].includes(pathSegments[0].slice(0, 3))) {
            if (!targetCompSlug) targetCompSlug = pathSegments[0];
            if (!targetVacSlug) targetVacSlug = pathSegments[1];
          } else if (pathSegments.length === 1 && !["main", "blog", "vacancies", "academy", "demo", "offer"].includes(pathSegments[0])) {
            if (!targetCompSlug) targetCompSlug = pathSegments[0];
          }
        } catch {}
      }

      let comp: any = null;
      if (targetCompSlug) {
        comp = await db.get(
          "SELECT * FROM companies WHERE slug = ? OR id = ? OR CAST(public_id AS TEXT) = ? OR allslug LIKE ? LIMIT 1",
          [targetCompSlug, targetCompSlug, targetCompSlug, `%${targetCompSlug}%`]
        );
      }
      if (!comp && company_id) {
        comp = await db.get("SELECT * FROM companies WHERE id = ? OR CAST(public_id AS TEXT) = ? LIMIT 1", [String(company_id), String(company_id)]);
      }
      if (!comp) comp = await db.get("SELECT * FROM companies ORDER BY id ASC LIMIT 1");

      const effectiveCompanyId = comp?.public_id || comp?.id || "300007";
      let proj: any = null;
      if (targetVacSlug) {
        proj = await db.get(
          "SELECT * FROM projects WHERE slug = ? OR role_slug = ? OR id = ? OR CAST(public_id AS TEXT) = ? LIMIT 1",
          [targetVacSlug, targetVacSlug, targetVacSlug, targetVacSlug]
        );
      }
      if (!proj && project_id) {
        proj = await db.get("SELECT * FROM projects WHERE id = ? OR CAST(public_id AS TEXT) = ? LIMIT 1", [String(project_id), String(project_id)]);
      }
      if (!proj && comp?.id) {
        proj = await db.get("SELECT * FROM projects WHERE company_id = ? ORDER BY id ASC LIMIT 1", [comp.id]);
      }

      const companyParts: string[] = [];
      if (comp) {
        if (comp.name) companyParts.push(`Название компании: «${comp.name}»`);
        if (comp.industry) companyParts.push(`Отрасль: ${comp.industry}`);
        if (comp.staff) companyParts.push(`Штат: ${comp.staff}`);
        if (comp.website) companyParts.push(`Сайт: ${comp.website}`);
        if (comp.description || comp.description_text) companyParts.push(`Описание:\n${comp.description_text || comp.description}`);
        if (comp.about_text) companyParts.push(`О компании:\n${comp.about_text}`);
        if (comp.mission_text) companyParts.push(`Миссия:\n${comp.mission_text}`);
        if (comp.products_text) companyParts.push(`Продукты:\n${comp.products_text}`);
        if (comp.team_text) companyParts.push(`Команда:\n${comp.team_text}`);
        if (comp.payouts_text) companyParts.push(`Выплаты:\n${comp.payouts_text}`);
        if (comp.schedule_text) companyParts.push(`График:\n${comp.schedule_text}`);
        if (comp.system_text) companyParts.push(`Система работы:\n${comp.system_text}`);
        if (comp.stats) companyParts.push(`Достижения: ${comp.stats}`);
      }

      const vacancyParts: string[] = [];
      if (proj) {
        vacancyParts.push(`Вакантная должность: ${proj.role_name || proj.title || vacancy_title || "Специалист"}`);
        if (proj.salary_terms) vacancyParts.push(`Оплата: ${proj.salary_terms}`);
        if (proj.schedule_terms) vacancyParts.push(`График: ${proj.schedule_terms}`);
        if (proj.vacancy_text) vacancyParts.push(`Описание вакансии:\n${proj.vacancy_text}`);
        if (proj.tasks_activity_text) vacancyParts.push(`Задачи:\n${proj.tasks_activity_text}`);
        if (proj.onboarding_text) vacancyParts.push(`Онбординг:\n${proj.onboarding_text}`);
        if (proj.team_text) vacancyParts.push(`Команда:\n${proj.team_text}`);
        if (proj.payouts_text) vacancyParts.push(`Выплаты:\n${proj.payouts_text}`);
        if (proj.system_text) vacancyParts.push(`Инструменты:\n${proj.system_text}`);
        if (proj.motivation_text || proj.motivation_text_detail) vacancyParts.push(`Мотивация:\n${proj.motivation_text_detail || proj.motivation_text}`);
        if (proj.custom_wiki) vacancyParts.push(`База знаний:\n${proj.custom_wiki}`);
      } else if (vacancy_title) {
        vacancyParts.push(`Вакантная должность: ${vacancy_title}`);
      }

      const contextSnippet = req.body?.context_text ? `\nДОПОЛНИТЕЛЬНЫЙ КОНТЕКСТ СТРАНИЦЫ:\n${req.body.context_text}` : "";
      const screenshotContext = effectiveScreenshotUrl ? `\n[Скриншот экрана: ${effectiveScreenshotUrl}].` : "";
      const promptData = await getProTalkPrompt("vacancy_company_assistant", undefined, false);
      const fullPrompt = `${promptData.system_prompt}\n\nСВЕДЕНИЯ О КОМПАНИИ:\n${companyParts.join("\n\n") || "Компания"}\n\nСВЕДЕНИЯ О ВАКАНСИИ:\n${vacancyParts.join("\n\n") || "Вакансия"}${contextSnippet}${screenshotContext}${fileAttachmentText}\n${userQueriesHistory}\nИстория:\n${historyText}\n\nВопрос кандидата: "${rawQuestion}"\nОтвечай ясно, доброжелательно, 2–4 предложения без капслока.`;

      const vacChatActor =
        String(comp?.public_id || proj?.employer_public_id || "").replace(/\D/g, "") ||
        (await resolveEmployerPublicId(db, {
          companyId: comp?.id || company_id,
          projectId: proj?.id || project_id,
          employerId: employer_id,
        }));
      const vacReply = await callProTalkLLM(
        "chat",
        [{ role: "user", content: fullPrompt }],
        undefined,
        vacChatActor,
        proj?.id || project_id,
        "vacancy_company_assistant",
        false
      );
      reply = vacReply.trim();
      scoreBadge = { score: 97, label: "ИИ-Рекрутер | Оценка: 97/100" };
    } else {
      const rawVisitorSeed = (req.body.user_id || req.body.demo_user_id || req.body.chat_id || chat_id || "").toString();
      const existingDigits = rawVisitorSeed.replace(/\D/g, "");
      const visitor11Digits =
        existingDigits.length >= 8
          ? existingDigits.slice(0, 11).padEnd(11, "7")
          : `${Math.floor(1 + Math.random() * 9)}${Math.floor(Math.random() * 10000000000).toString().padStart(10, "0")}`;
      const logChatId = `chat_${visitor11Digits}`;
      const logUrl = "https://docs.google.com/spreadsheets/d/1HAhAbwKRIXPFi8KhqLhDW6-Ha2tjQf4pj8rrSGPML8A/edit?usp=sharing";

      const fnArgs: Record<string, any> = {
        text: `Вопрос пользователя: "${rawQuestion}"${userQueriesHistory}${historyText ? `\nКонтекст: ${historyText}` : ""}`,
        instruction: "Определи статью Академии RR (посты 770001-770007) или выбери faq_choice.",
        options: [
          "post_770001::Создание компании и вакансии",
          "post_770002::Конструктор лендинга компании и вакансии",
          "post_770003::ИИ-система корпоративного обучения",
          "post_770004::ИИ-система интервью",
          "post_770005::CRM система",
          "post_770006::Кабинет работодателя",
          "post_770007::Кабинет соискателя",
          "faq_choice::База знаний FAQ",
        ].join(";;"),
        decision_type: "choice",
        ai_model: "openai/gpt-6-luna-decisions",
        images_urls: effectiveScreenshotUrl || undefined,
        debug: false,
        log_chat_id: logChatId,
        log_url: logUrl,
        sheet_url: logUrl,
        spreadsheet_url: logUrl,
      };

      let selectedSource = "faq_choice";
      const secondarySources: string[] = [];
      let fnTokens = 0;

      try {
        const fnRes = await fetch("https://api.pro-talk.ru/api/v1.0/run_function", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: "Bearer kEL1nRZp330QvUrG1KenhRQ2JIynkWLs" },
          signal: AbortSignal.timeout(12000),
          body: JSON.stringify({
            function_id: 763,
            functions_base_id: "appkq3HrzrxYxoAV8",
            bot_id: 66337,
            bot_token: "kEL1nRZp330QvUrG1KenhRQ2JIynkWLs",
            arguments: fnArgs,
            parameters: fnArgs,
            log_chat_id: logChatId,
            log_url: logUrl,
          }),
        });
        if (fnRes.ok) {
          const fnData = await fnRes.json().catch(() => null);
          if (fnData?.status === "success" && fnData.result) {
            selectedSource = fnData.result.selected || "faq_choice";
            fnTokens = Number(fnData.usage?.total_tokens || 0);
            if (fnData.result.probabilities && typeof fnData.result.probabilities === "object") {
              for (const [optKey, prob] of Object.entries(fnData.result.probabilities)) {
                if (optKey !== selectedSource && Number(prob) >= 0.25) secondarySources.push(optKey);
              }
            }
          } else if (typeof fnData?.selected === "string") {
            selectedSource = fnData.selected;
            fnTokens = Number(fnData.usage?.total_tokens || 0);
          }
        }
      } catch {}

      if (fnTokens <= 0) fnTokens = Math.max(30, Math.ceil((fnArgs.text.length + fnArgs.options.length) / 3));
      await saveAILog(db, {
        channel_id: logChatId,
        user_social_id: visitor11Digits,
        user_message: `[Function 763 / Step 1 Academy] ${rawQuestion}`,
        bot_reply: JSON.stringify({ selected: selectedSource, secondary: secondarySources, tokens: fnTokens }),
        channel_name: "protalk_ai_decision_763",
        bot_id: "66337",
        llm: "openai/gpt-6-luna-decisions",
        api_key: "66337_kEL1nRZp330QvUrG1KenhRQ2JIynkWLs",
        tokens_total: fnTokens,
        tokens_user: fnTokens,
        cost_rub: Number(((fnTokens * 300) / 10000000).toFixed(6)),
        function_call_params: fnArgs,
        server_name: "ProTalk_Function_763",
      });

      const targetedKnowledgeSnippets: string[] = [];
      if (selectedSource === "faq_choice" || !selectedSource.startsWith("post_")) {
        let selectedFaqCategory = "settings";
        const faqArgs: Record<string, any> = {
          text: `Вопрос пользователя: "${rawQuestion}"`,
          instruction: "Определи раздел базы знаний FAQ Робот Рекрутер.",
          options: [
            "faq_settings::Настройки",
            "faq_pricing::Тарифы и баланс",
            "faq_product::О платформе",
            "faq_candidate::Кандидат",
            "faq_integrations::Интеграции",
            "faq_account::Аккаунт и поддержка",
          ].join(";;"),
          decision_type: "choice",
          ai_model: "openai/gpt-6-luna-decisions",
          debug: false,
          log_chat_id: logChatId,
          log_url: logUrl,
        };
        try {
          const faqRes = await fetch("https://api.pro-talk.ru/api/v1.0/run_function", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: "Bearer kEL1nRZp330QvUrG1KenhRQ2JIynkWLs" },
            signal: AbortSignal.timeout(10000),
            body: JSON.stringify({
              function_id: 763,
              functions_base_id: "appkq3HrzrxYxoAV8",
              bot_id: 66337,
              bot_token: "kEL1nRZp330QvUrG1KenhRQ2JIynkWLs",
              arguments: faqArgs,
              parameters: faqArgs,
            }),
          });
          if (faqRes.ok) {
            const faqData = await faqRes.json().catch(() => null);
            const rawCat = faqData?.result?.selected || faqData?.selected;
            if (typeof rawCat === "string") selectedFaqCategory = rawCat.replace(/^faq_/, "");
          }
        } catch {}

        const catFaqs = (await db.all("SELECT question, answer FROM faq_items WHERE is_published = 1 AND category = ? ORDER BY sort_order ASC", [selectedFaqCategory])) || [];
        if (catFaqs.length > 0) {
          targetedKnowledgeSnippets.push(`--- БАЗА ЗНАНИЙ (FAQ: «${selectedFaqCategory}») ---\n` + catFaqs.map((f: any) => `В: ${f.question}\nО: ${f.answer}`).join("\n\n"));
        }
      }

      for (const src of [selectedSource, ...secondarySources]) {
        if (src.startsWith("post_")) {
          const postPubId = src.replace("post_", "").trim();
          const postRow = await db.get(
            "SELECT id, public_id, title, excerpt, content_md FROM posts WHERE CAST(public_id AS TEXT) = ? OR id = ? OR id LIKE ? LIMIT 1",
            [postPubId, postPubId, `%${postPubId}%`]
          );
          if (postRow?.content_md) {
            targetedKnowledgeSnippets.push(`--- СТАТЬЯ ИЗ АКАДЕМИИ RR («${postRow.title}») ---\n${postRow.content_md}`);
          }
        }
      }

      const keywords = rawQuestion.toLowerCase().replace(/[^\wа-яё\s]/gi, " ").split(/\s+/).filter((w: string) => w.length >= 3);
      if (keywords.length > 0) {
        const likeClauses = keywords.map(() => "(LOWER(question) LIKE ? OR LOWER(answer) LIKE ?)").join(" OR ");
        const params: string[] = [];
        keywords.forEach((kw: string) => params.push(`%${kw}%`, `%${kw}%`));
        const matchedFaqs = (await db.all(`SELECT question, answer FROM faq_items WHERE is_published = 1 AND (${likeClauses}) LIMIT 10`, params)) || [];
        if (matchedFaqs.length > 0) {
          targetedKnowledgeSnippets.push(`--- ДОПОЛНИТЕЛЬНЫЕ ОТВЕТЫ ИЗ FAQ ---\n` + matchedFaqs.map((f: any) => `В: ${f.question}\nО: ${f.answer}`).join("\n\n"));
        }
      }

      if (targetedKnowledgeSnippets.length === 0) {
        const topFaqs = (await db.all("SELECT question, answer FROM faq_items WHERE is_published = 1 ORDER BY sort_order ASC LIMIT 8")) || [];
        const topPost = await db.get("SELECT title, content_md FROM posts WHERE CAST(public_id AS TEXT) IN ('770004', '770006', '770001') ORDER BY public_id DESC LIMIT 1");
        targetedKnowledgeSnippets.push(
          `--- БАЗОВЫЕ ЗНАНИЯ RR (FAQ) ---\n${topFaqs.map((f: any) => `В: ${f.question}\nО: ${f.answer}`).join("\n\n")}\n\n` +
            (topPost ? `--- АКАДЕМИЯ RR: ${topPost.title} ---\n${topPost.content_md}` : "")
        );
      }

      const screenshotContext = effectiveScreenshotUrl ? `\n[Скриншот страницы: ${effectiveScreenshotUrl}].` : "";
      const promptData = await getProTalkPrompt("rr_landing_assistant", undefined, false);
      const fullPrompt = `${promptData.system_prompt}\n\nТОЧНЫЕ ЗНАНИЯ ИЗ БАЗЫ ДАННЫХ:\n${targetedKnowledgeSnippets.join("\n\n")}${screenshotContext}${fileAttachmentText}\n${userQueriesHistory}\nИстория:\n${historyText}\n\nВопрос: "${rawQuestion}"\nОтветь вежливо, емко (2–4 предложения) без капслока.`;

      const landingReply = await callProTalkLLM(
        "chat",
        [{ role: "user", content: fullPrompt }],
        undefined,
        visitor11Digits,
        undefined,
        "rr_landing_assistant",
        false
      );
      reply = landingReply.trim();
      scoreBadge = { score: 99, label: "База знаний Академии RR | Точность: 100%" };
    }

    if (!reply) {
      reply = "Платформа «Робот Рекрутер» (RR) автоматизирует отбор и обучение сотрудников 24/7. Базовые цены: 100 RR за интервью, 100 RR за обучение, 500 RR за лендинг вакансии. При регистрации дарим 1000 RR на счет!";
    }

    return res.json({ ok: true, reply, actions: extractedActions, scoreBadge, assistant_type });
  } catch (err: any) {
    const failedJobId = storeFailedAiJob(err, "assistant_chat", req.body);
    return res.status(500).json({
      ok: false,
      job_id: failedJobId,
      retryable: true,
      error: err.message || "Ошибка ИИ-Ассистента",
      reply: "Извините, возникла временная заминка при обработке запроса. Попробуйте повторить вопрос!",
    });
  }
};
