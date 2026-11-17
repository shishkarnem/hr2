import { Router, Request, Response } from "express";
import { getProTalkDB } from "../db";
import { getProTalkPrompt, callProTalkLLM, formatDemoChatId } from "../common";

export const reviewsRouter = Router();

reviewsRouter.get("/reviews", async (req: Request, res: Response) => {
  try {
    const db = await getProTalkDB();
    const rows = await db.all(
      `SELECT * FROM reviews WHERE is_published = 1 ORDER BY created_at DESC LIMIT 50`
    );
    const formatted = rows.map((r: any) => ({
      id: r.id,
      first_name: r.first_name || (r.author_name ? r.author_name.split(" ")[0] : "Пользователь"),
      last_name: r.last_name || (r.author_name ? r.author_name.split(" ").slice(1).join(" ") : ""),
      content: r.content || r.comment || "",
      audio_url: r.audio_url || null,
      ai_reply: r.ai_reply || null,
      admin_reply: r.admin_reply || null,
      is_published: Boolean(r.is_published),
      created_at: r.created_at || new Date().toISOString()
    }));
    res.json(formatted);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

reviewsRouter.post("/reviews", async (req: Request, res: Response) => {
  try {
    const { first_name, last_name, content, comment, audio_url, demo_user_id, user_id, use_promax } = req.body || {};
    const fn = (first_name || "").trim();
    const ln = (last_name || "").trim();
    const textContent = (content || comment || "").trim();
    const audioUrl = (audio_url || "").trim() || null;
    const rawCandidateId = (demo_user_id || user_id || "").toString().trim();
    const useProMax = Boolean(use_promax);
    const promptKey = useProMax ? "review_moderation_promax" : "review_moderation";

    if (!fn || !textContent) {
      return res.status(400).json({ error: "Пожалуйста, заполните имя и текст отзыва" });
    }

    const demoChatId = await formatDemoChatId(rawCandidateId, "RRfeed");

    let approved = true;
    let rejection_reason: string | null = null;
    let ai_reply: string | null = null;

    // Call ProTalk AI for moderation & answer generation using prompt from database
    try {
      const promptData = await getProTalkPrompt(
        promptKey,
        `Ты — модератор и ИИ-ассистент ProTalk платформы «Робот Рекрутер» (автоматизация найма, голосовые/текстовые ИИ-интервью, чек-листы и онбординг).
Твоя задача — проверить отзыв от пользователя (ID: {{demoId}}, Имя: {{fn}} {{ln}}) на предмет цензуры и сформулировать ответ.

СПРАВКА О ПРОДУКТЕ «РОБОТ РЕКРУТЕР» (RR):
- «Робот Рекрутер» — ИИ-платформа для автонайма и объективной оценки кандидатов 24/7 (hr-rr.ru).
- Ключевые возможности: голосовые и текстовые ИИ-интервью (ProTalk/ProMax), чек-листы из 20 вопросов по компетенциям, ролевые ситуационные кейсы по методологии STAR, онлайн-обучение, база знаний и онбординг.
- Главная ценность: берет на себя до 80% рутины HR, обеспечивает 100% объективную оценку без человеческого фактора.
- Бесплатное демо: соискатели могут проверить свои силы на hr-rr.ru/demo без регистрации и стыда за ошибки.

ОТЗЫВ ДЛЯ ПРОВЕРКИ:
"{{textContent}}"

СТРОГИЕ ПРАВИЛА ЦЕНЗУРЫ:
1. ЦЕНЗУРА И ОТКЛОНЕНИЕ (approved: false):
   - Любые оскорбления, ненормативная лексика, брань, хамство, унижение сервиса, компании «Робот Рекрутер» или её сотрудников.
   - Если отзыв содержит оскорбления или унижение компании, верни approved: false и напиши в rejection_reason понятную причину на русском языке (например: "Отзыв отклонен, так как содержит оскорбления или недопустимые выражения в адрес компании.").

2. ОДОБРЕНИЕ И ПУБЛИКАЦИЯ (approved: true):
   - Любые отзывы, включая ЖЕСТКУЮ И КОНСТРУКТИВНУЮ КРИТИКУ, ОТРИЦАТЕЛЬНЫЕ или НЕДОВОЛЬНЫЕ отзывы, если в них НЕТ прямых оскорблений, мата и унижений.
   - Позитивные и нейтральные отзывы.
   - Для одобренного отзыва сгенерируй вежливый, конструктивный ответ от ИИ ProTalk в поле ai_reply (1-3 предложения), обращаясь к {{fn}} и опираясь на знания о «Роботе Рекрутере».

Верни результат СТРОГО в формате JSON:
{
  "approved": boolean,
  "rejection_reason": string или null,
  "ai_reply": string или null
}`,
        useProMax
      );

      const systemPrompt = promptData.system_prompt
        .replace(/\{\{demoId\}\}/g, demoChatId)
        .replace(/\{\{fn\}\}/g, fn)
        .replace(/\{\{ln\}\}/g, ln)
        .replace(/\{\{textContent\}\}/g, textContent);

      // Call ProTalk LLM via database bot config
      const aiResponseText = await callProTalkLLM(
        "review",
        [{ role: "user", content: systemPrompt }],
        demoChatId,
        undefined,
        undefined,
        promptKey,
        useProMax
      );

      if (aiResponseText) {
        let cleanJson = aiResponseText.trim();
        if (cleanJson.startsWith("```")) {
          cleanJson = cleanJson.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
        }
        try {
          const parsed = JSON.parse(cleanJson);
          if (typeof parsed.approved === "boolean") {
            approved = parsed.approved;
          }
          if (parsed.rejection_reason) {
            rejection_reason = String(parsed.rejection_reason);
          }
          if (parsed.ai_reply) {
            ai_reply = String(parsed.ai_reply);
          }
        } catch (pErr) {
          console.warn("[ProTalk Review Moderation] Non-JSON output, attempting string check:", aiResponseText);
          if (cleanJson.toLowerCase().includes('"approved": false') || cleanJson.toLowerCase().includes('approved: false')) {
            approved = false;
            rejection_reason = "Отзыв отклонен модерацией ИИ ProTalk из-за некорректных или оскорбительных выражений.";
          } else {
            ai_reply = cleanJson;
          }
        }
      }
    } catch (aiErr: any) {
      console.error("[ProTalk Review Moderation] Error calling ProTalk:", aiErr?.message || aiErr);
    }

    // If review was censored / rejected by ProTalk AI
    if (!approved) {
      return res.status(200).json({
        success: true,
        approved: false,
        censored: true,
        rejection_reason: rejection_reason || "Отзыв отклонен модерацией ИИ ProTalk из-за некорректных или оскорбительных выражений.",
        demo_user_id: demoChatId
      });
    }

    if (!ai_reply) {
      ai_reply = `Спасибо за отзыв, ${fn}! Наша команда ценит обратную связь и ежедневно совершенствует сервис «Робот Рекрутер».`;
    }

    const id = `rev-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const author_name = `${fn} ${ln}`.trim();

    const db = await getProTalkDB();
    await db.run(
      `INSERT INTO reviews (id, author_name, first_name, last_name, rating, comment, content, audio_url, is_published, ai_reply, created_at)
       VALUES (?, ?, ?, ?, 5, ?, ?, ?, 1, ?, NOW())`,
      [id, author_name, fn, ln, textContent, textContent, audioUrl, ai_reply]
    );

    if (audioUrl) {
      try {
        await db.run(
          `UPDATE file_storage 
           SET description = ? 
           WHERE original_url = ? OR original_url LIKE ?`,
          [`Голосовой отзыв к отзыву ID: ${id} (${fn} ${ln})`, audioUrl, `%${audioUrl.split('/').pop()}%`]
        );
        console.log(`[Review Voice Link] Linked file_storage audio ${audioUrl} to review ID ${id}`);
      } catch (fErr) {
        console.warn("[Review Voice Link Error]:", fErr);
      }
    }

    res.json({
      success: true,
      approved: true,
      id,
      ai_reply,
      demo_user_id: demoChatId,
      message: "Отзыв успешно проверен ИИ ProTalk и опубликован"
    });
  } catch (err: any) {
    console.error("[Reviews Router Error]:", err);
    res.status(500).json({ error: err?.message || "Ошибка при сохранении отзыва" });
  }
});

reviewsRouter.post("/reviews/ai-reply", async (req: Request, res: Response) => {
  try {
    const { review_id } = req.body || {};
    if (!review_id) return res.status(400).json({ error: "review_id required" });

    const db = await getProTalkDB();
    const review = await db.get(`SELECT * FROM reviews WHERE id = ?`, [review_id]);
    if (!review) return res.status(404).json({ error: "Review not found" });

    const fn = review.first_name || (review.author_name ? review.author_name.split(" ")[0] : "Пользователь");
    const textContent = review.content || review.comment || "";

    const userPrompt = `Напиши вежливый, позитивный и краткий (1-2 предложения) ответ от лица ИИ Робота Рекрутера пользователю ${fn} на следующий отзыв: "${textContent}".`;
    const demoChatId = formatDemoChatId(req.body?.demo_user_id || review?.id, "RRfeed");
    let aiReply = await callProTalkLLM(
      "chat",
      [{ role: "user", content: userPrompt }],
      demoChatId,
      undefined,
      undefined,
      "review_moderation"
    );

    if (!aiReply) {
      aiReply = `Спасибо за отзыв, ${fn}! Рады помогать в автоматизации подбора.`;
    }

    await db.run(`UPDATE reviews SET ai_reply = ? WHERE id = ?`, [aiReply, review_id]);
    res.json({ success: true, ai_reply: aiReply });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
