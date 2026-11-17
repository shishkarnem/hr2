import { Router, Request, Response } from "express";
import { callProTalkLLM, resolveCandidate6DigitPublicId, resolveEmployerPublicId } from "../../common";
import { getProTalkDB } from "../../db";

export const assistRouter = Router();

assistRouter.post("/candidate-assist", async (req: Request, res: Response) => {
  const { candidateId, userQuestion, contextTab, contextSubTab } = req.body || {};
  const dbInstance = await getProTalkDB();
  const candidate = candidateId
    ? await dbInstance.get(
        "SELECT * FROM candidates WHERE id = ? OR CAST(public_id AS TEXT) = ? LIMIT 1",
        [candidateId, String(candidateId)]
      )
    : await dbInstance.get("SELECT * FROM candidates ORDER BY created_at DESC NULLS LAST LIMIT 1");
  const candProjId = candidate?.project_id || candidate?.projectId;
  const project = candProjId
    ? await dbInstance.get(
        "SELECT * FROM projects WHERE id = ? OR CAST(public_id AS TEXT) = ? LIMIT 1",
        [candProjId, String(candProjId)]
      )
    : await dbInstance.get("SELECT * FROM projects ORDER BY created_at DESC NULLS LAST LIMIT 1");

  const companyName = project?.company_name || project?.companyName || "Работодатель";
  const roleName = project?.role_name || project?.roleName || "Специалист";
  const salaryTerms =
    project?.payouts_text || project?.salary_terms || project?.salaryTerms || "Компенсационный пакет";
  const scheduleTerms =
    project?.schedule_text || project?.schedule_terms || project?.scheduleTerms || "Индивидуальный график";
  const wiki = project?.system_text || project?.custom_wiki || project?.customWiki || "Обучение в компании";

  try {
    const prompt =
      `Ты — Дружелюбный ИИ-Помощник соискателя на платформе "Робот Рекрутер (RR)".\n` +
      `Твоя работа — отвечать соискателю на любые его вопросы по вакансии, помогать проходить собеседование, разъяснять условия, подсказывать ответы на обучение и подбадривать!\n\n` +
      `ТЕКУЩИЙ СОИСКАТЕЛЬ:\n` +
      `- Имя: ${candidate?.full_name || candidate?.name || "Кандидат"}\n` +
      `- Должность: ${roleName}\n` +
      `- Компания: ${companyName}\n` +
      `- Условия оплаты: ${salaryTerms}\n` +
      `- График: ${scheduleTerms}\n` +
      `- Вики-база знаний: ${wiki}\n` +
      `- Уверенность: Общий балл составляет ${candidate?.overall_score ?? "не пройдено еще"}\n\n` +
      `КОНТЕКСТ ЭКРАНА:\n` +
      `- Основной таб: ${contextTab}\n` +
      `- Подтаб (если есть): ${contextSubTab || "нет"}\n\n` +
      `Вопрос соискателя: "${userQuestion}"\n\n` +
      `Сформулируй дружелюбный, воодушевляющий и краткий ответ на русском языке (2-3 предложения).`;

    const candPubId = await resolveCandidate6DigitPublicId(candidate?.id || candidateId, dbInstance);
    const reply = await callProTalkLLM("chat", [{ role: "user", content: prompt }], `${candPubId}_RRchat`);
    return res.json({ reply: reply.trim() });
  } catch (err) {
    console.error("ProTalk Error at Candidate Assist Chat:", err);
  }

  const qLower = (userQuestion || "").toLowerCase();
  let selectedReply = `Привет, ${candidate?.full_name || candidate?.name || "коллега"}! Я твой ИИ-Помощник. Раздел (${contextTab} > ${contextSubTab || ""}) важен — спрашивай о любом вопросе!`;
  if (
    qLower.includes("зарплат") ||
    qLower.includes("оплат") ||
    qLower.includes("деньг") ||
    qLower.includes("рубл")
  ) {
    selectedReply = `По условиям выплаты в ${companyName}: на позиции "${roleName}" оплата составляет ${salaryTerms}.`;
  } else if (qLower.includes("график") || qLower.includes("время") || qLower.includes("когда")) {
    selectedReply = `Установленный график работы на вакансии "${roleName}": ${scheduleTerms}.`;
  }

  return res.json({ reply: selectedReply });
});

assistRouter.post("/employer-assist", async (req: Request, res: Response) => {
  const { userQuestion, messages, employerId, employer_id, employer_public_id, company_id, project_id } = req.body || {};
  const db = await getProTalkDB();
  const cleanEmpId = await resolveEmployerPublicId(db, {
    employerPublicId: employer_public_id || (req as any).user?.public_id,
    employerId: employer_id || employerId || (req as any).user?.id,
    companyId: company_id,
    projectId: project_id,
  });

  let historyText = "";
  if (messages && Array.isArray(messages)) {
    historyText = messages
      .map(
        (m: any) =>
          `${
            m.sender === "user" || m.sender === "employer" || m.role === "user"
              ? "Работодатель"
              : "ИИ-Ассистент"
          }: ${m.text || m.content}`
      )
      .join("\n");
  }

  let faqKnowledgeBase = "";
  try {
    const faqRows = await db.all(
      "SELECT question, answer, category FROM faq_items WHERE COALESCE(is_published::text, '1') IN ('1', 'true', 't') ORDER BY category ASC, sort_order ASC"
    );
    if (faqRows && faqRows.length > 0) {
      faqKnowledgeBase = faqRows
        .map(
          (f: any, i: number) =>
            `FAQ #${i + 1} [Категория: ${f.category || "Общее"}]:\nВопрос: ${f.question}\nОтвет: ${f.answer}`
        )
        .join("\n\n");
    }
  } catch (faqErr) {
    console.error("[/api/employer-assist] Error loading PG faq_items:", faqErr);
  }

  try {
    const prompt =
      `Ты — Дружелюбный ИИ-Ассистент платформы "Робот Рекрутер (RR)".\n` +
      `Твоя задача — рассказывать работодателю про наш продукт RR, его возможности, цены и функционал, используя данные нашей базы знаний (faq_items).\n\n` +
      `ОФИЦИАЛЬНАЯ БАЗА ЗНАНИЙ (faq_items):\n${
        faqKnowledgeBase ||
        "Робот Рекрутер — сервис автоматизации подбора. Цены: ИИ-собеседование 100 RR, ИИ-обучение 100 RR, Лендинг 500 RR. При регистрации 1000 RR на счет!"
      }\n\n` +
      `История переписки:\n${historyText}\n\n` +
      `Вопрос работодателя: "${userQuestion}"\n\n` +
      `Ответь вежливо, убедительно и по существу на русском языке (максимум 4-5 предложений).`;

    const isProMax = Boolean(req.body?.use_promax || req.body?.useProMax);
    const promptKey = isProMax ? "hr_assistant_promax" : "hr_assistant";
    const reply = await callProTalkLLM(
      "chat",
      [{ role: "user", content: prompt }],
      undefined,
      cleanEmpId,
      undefined,
      promptKey,
      isProMax
    );
    return res.json({ reply: reply.trim() });
  } catch (err) {
    console.error("ProTalk Error at Employer Assistant Chat:", err);
  }

  const fallbacks = [
    "Робот Рекрутер автоматизирует первичный найм и обучение: проводит интервью, проверяет резюме, оценивает чек-листы и кейсы, и обучает по вашей Wiki-базе знаний! При регистрации дарим 1000 RR на счет.",
    "При регистрации вы получаете 1000 RR приветственного баланса — этого хватит на создание Лендинга вакансии и запуск первых ИИ-интервью.",
  ];
  let selected = fallbacks[Math.floor(Math.random() * fallbacks.length)];
  const qLower = (userQuestion || "").toLowerCase();
  if (
    qLower.includes("цен") ||
    qLower.includes("скольк") ||
    qLower.includes("рубл") ||
    qLower.includes("плат") ||
    qLower.includes("rr")
  ) {
    selected =
      "Стоимость услуг RR: ИИ-Собеседование — 100 RR, ИИ-Обучение — 100 RR, генерация ИИ структуры — от 200 до 500 RR. 1 RR равен 1 рублю.";
  }
  return res.json({ reply: selected });
});
