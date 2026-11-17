import { Router, Request, Response } from "express";
import {
  formatDemoChatId,
  formatChatIdFromPrefix,
  resolveCandidate6DigitPublicId,
  resolveEmployerPublicId,
  findCandidateRow,
  extractUserSocialId,
  callProTalkLLM,
  getProTalkPrompt,
  tryParseLLMJson,
} from "../../common";
import { getProTalkDB, saveAILog } from "../../db";
import {
  candidateAiJobStore,
  isStageManual,
  detectAiTextHeuristic,
  buildLlmMessagesFromPrompt,
  storeFailedAiJob,
  persistCandidateAfterSituations,
  persistCandidateAfterChecklist,
} from "../../aiHelpers/common";
import { normalizeKind, parseMultiList, calcMultiChoiceScore } from "../../aiHelpers/quizAndOptions";

export const situationsAndChecklistRouter = Router();

situationsAndChecklistRouter.post("/ai-restart", async (req: Request, res: Response) => {
  try {
    const { employer_public_id, demo_user_id, candidate_id, use_promax } = req.body || {};
    const db = await getProTalkDB();
    const botRow = await db.get(
      `SELECT * FROM protalk_bots WHERE system_name = ? AND is_active = 1 LIMIT 1`,
      [use_promax ? "chat_promax" : "chat"]
    );
    const bot_id = Number(botRow?.bot_id) || (use_promax ? 67370 : 66337);
    const bot_token = String(
      botRow?.bot_token || (use_promax ? "XQD2bU7dIwQu9T4TpygQEpZYZrIx81hY" : "kEL1nRZp330QvUrG1KenhRQ2JIynkWLs")
    )
      .replace(new RegExp(`^${bot_id}_`), "")
      .trim();
    const userPrefix = botRow?.user_prefix || "{id}_RRchat";

    let chatId = "ask_default";
    let socialId = "ask_default";

    if (demo_user_id) {
      chatId = formatDemoChatId(demo_user_id, "RRstart");
      socialId = extractUserSocialId(chatId);
    } else if (employer_public_id) {
      chatId = await formatChatIdFromPrefix(userPrefix, employer_public_id, "RRchat");
      socialId = extractUserSocialId(chatId);
    } else if (candidate_id) {
      const candPubId = await resolveCandidate6DigitPublicId(candidate_id, db);
      chatId = `${candPubId}_RRchat`;
      socialId = extractUserSocialId(chatId);
    } else {
      chatId = formatDemoChatId("", "RRstart");
      socialId = extractUserSocialId(chatId);
    }

    let replyText = "Перезапуск диалога выполнен.";
    let functionErr = "";
    try {
      const rawToken = bot_token.replace(new RegExp(`^${bot_id}_`), "").trim();
      const ptRes = await fetch("https://ai.pro-talk.ru/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${bot_id}_${rawToken}`,
        },
        signal: AbortSignal.timeout(4000),
        body: JSON.stringify({
          model: chatId,
          messages: [{ role: "user", content: "/restart" }],
          temperature: 0.1,
          stream: false,
          bot_id,
          bot_token: rawToken,
          bot_chat_id: chatId,
          chat_id: chatId,
          user_social_id: socialId,
          social_id: socialId,
          channel_id: chatId,
        }),
      });

      if (ptRes.ok) {
        const ptData = await ptRes.json().catch(() => ({}));
        replyText = ptData?.done || ptData?.text || ptData?.message || replyText;
      } else {
        functionErr = `HTTP ${ptRes.status}`;
      }
    } catch (ptErr: any) {
      functionErr = ptErr.message || String(ptErr);
    }

    try {
      const dbInstance = await getProTalkDB();
      await dbInstance.run(
        `INSERT INTO interview_messages (id, interview_id, sender, message, created_at) VALUES (?, ?, ?, ?, NOW())`,
        [`msg-${Date.now()}`, chatId, "system", `/restart: ${replyText}`]
      );
      await saveAILog(dbInstance, {
        channel_id: chatId,
        user_social_id: socialId,
        user_message: "/restart",
        bot_reply: replyText,
        channel_name: "demo_interview",
        bot_id: String(bot_id),
        llm: "ProTalk /ask",
        api_key: bot_token,
        function_error: functionErr || undefined,
        function_call_params: { bot_id, chat_id: chatId, user_social_id: socialId, message: "/restart" },
      });
    } catch {}

    res.json({ ok: true, reply: replyText });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

situationsAndChecklistRouter.get("/resume-download", (req: Request, res: Response) => {
  const rawUrl = String(req.query.url || req.query.file || "").trim();
  if (!rawUrl) return res.status(400).send("No file URL specified");
  return res.redirect(rawUrl);
});

export const handleGradeSituations = async (req: Request, res: Response) => {
  try {
    const {
      candidate_id,
      project_id,
      title: rawTitle,
      situations: rawSituations,
      answers: rawAnswers,
      demo_user_id,
      employer_id,
      employer_public_id,
      is_preview,
      anti_ai_enabled: reqAntiAi,
      employer_wishes: reqWishes,
      prompt_override: reqPromptOverride,
      use_promax,
    } = req.body || {};
    const isProMax = Boolean(use_promax || req.body?.useProMax);
    const db = await getProTalkDB();

    let title = rawTitle;
    let situations = Array.isArray(rawSituations) ? rawSituations : [];
    let ansObj = rawAnswers && typeof rawAnswers === "object" ? rawAnswers : {};
    let blkRow: any = null;
    let parsedBlk: any = {};
    let projRow: any = null;

    const cand = candidate_id && db ? await findCandidateRow(db, candidate_id) : null;
    let pid = project_id || cand?.project_id;
    if (!pid && candidate_id && db) {
      const cProj = await db.get(
        "SELECT project_id FROM candidates WHERE id = ? OR CAST(public_id AS TEXT) = ? LIMIT 1",
        [String(candidate_id), String(candidate_id)]
      );
      pid = cProj?.project_id || null;
    }
    if (pid && db) {
      projRow = await db.get(
        "SELECT * FROM projects WHERE id = ? OR CAST(public_id AS TEXT) = ? LIMIT 1",
        [String(pid), String(pid)]
      );
      if (projRow && !title) title = projRow.role_name || projRow.title;
      blkRow = await db.get(
        "SELECT * FROM interview_blocks WHERE project_id = ? AND kind = 'situations' LIMIT 1",
        [projRow?.id || String(pid)]
      );
      if (blkRow?.payload) {
        try {
          parsedBlk = typeof blkRow.payload === "string" ? JSON.parse(blkRow.payload) : blkRow.payload;
          if (situations.length === 0 && Array.isArray(parsedBlk?.situations)) {
            situations = parsedBlk.situations;
          }
        } catch {}
      }
    }

    if (cand && Object.keys(ansObj).length === 0 && cand?.situations_answers) {
      try {
        ansObj = typeof cand.situations_answers === "string" ? JSON.parse(cand.situations_answers) : cand.situations_answers;
      } catch {}
    }

    const employerWishes = String(
      reqWishes ?? reqPromptOverride ?? parsedBlk?.employer_wishes ?? blkRow?.prompt_override ?? ""
    ).trim();

    let parsedSettings: any = {};
    try {
      if (blkRow?.settings_json) {
        parsedSettings = typeof blkRow.settings_json === "string" ? JSON.parse(blkRow.settings_json) : blkRow.settings_json;
      }
    } catch {}

    const antiAiEnabled =
      reqAntiAi !== undefined
        ? Boolean(reqAntiAi)
        : Boolean(
            blkRow?.anti_ai_enabled ||
              parsedBlk?.anti_ai_enabled ||
              parsedSettings?.anti_ai_enabled ||
              /Защита от нейросетей/i.test(employerWishes)
          );

    const items = situations.map((s: any, idx: number) => ({
      id: s.id || `s${idx + 1}`,
      title: s.title || `Ситуация #${idx + 1}`,
      brief: s.brief || s.question || "",
      criteria: s.criteria || "",
      answer: String(ansObj[s.id] ?? ansObj[`s${idx + 1}`] ?? "").slice(0, 3000),
    }));

    const isDemo = Boolean(demo_user_id && !candidate_id && !is_preview);
    const baseKey = isDemo ? "demo_situations_evaluation" : "situation_analysis";
    const promptKey = isProMax ? `${baseKey}_promax` : baseKey;
    const promptData = await getProTalkPrompt(
      promptKey,
      `Ты — эксперт по ролевым интервью и оценке практических кейсов на собеседовании. Должность: "{{title}}".
По каждой ситуации оцени ответ кандидата от 0 до 100 баллов с учётом критериев и дай развёрнутый комментарий (2-3 предложения).

Ситуации и ответы:
{{situations_json}}

Верни строго JSON: {"items":[{"id":string,"score":0..100,"raw_score":0..100,"ai_detected":boolean,"feedback":string}],"advice":string}`,
      isProMax
    );

    const fallbackMsg = `Должность: "${title || "Специалист"}"
Ситуации и ответы:
${JSON.stringify(items)}

Верни строго JSON: {"items":[{"id":string,"score":0..100,"raw_score":0..100,"ai_detected":boolean,"feedback":string}],"advice":string}`;

    const llmMessages = buildLlmMessagesFromPrompt(
      promptData,
      {
        title: title || "Специалист",
        role_name: title || "Специалист",
        situations_json: JSON.stringify(items),
        wishes: employerWishes,
      },
      fallbackMsg
    );

    const lastMsg = llmMessages[llmMessages.length - 1];
    if (employerWishes) {
      lastMsg.content += `\n\nДополнительные указания работодателя:\n${employerWishes}`;
    }
    if (antiAiEnabled) {
      lastMsg.content += `\n\nПравило защиты от нейросетей (включено работодателем):
Проверь ответ кандидата по каждой ситуации на признаки генерации нейросетью.
Для каждой ситуации в массиве items верни поля "ai_detected": boolean и "raw_score": 0..100.
Если обнаружено использование нейросети ("ai_detected": true), снизь score ровно в 2 раза (score = Math.round(raw_score / 2)) и укажи это в feedback.`;
    }

    let chatId = "";
    if (is_preview) {
      const rawEmpId = await resolveEmployerPublicId(db, {
        employerId: employer_id,
        employerPublicId: employer_public_id,
        projectId: projRow?.id || pid,
        companyId: projRow?.company_id,
      });
      chatId = await formatChatIdFromPrefix(promptData.bot?.user_prefix || "{id}_RRsituations", rawEmpId, "RRsituations");
    } else if (candidate_id) {
      const candPubId = await resolveCandidate6DigitPublicId(candidate_id, db);
      chatId = `${candPubId}_cases`;
    } else if (demo_user_id) {
      chatId = formatDemoChatId(demo_user_id, "cases");
    } else {
      const rawEmpId = await resolveEmployerPublicId(db, {
        employerId: employer_id,
        employerPublicId: employer_public_id,
        projectId: projRow?.id || pid,
        companyId: projRow?.company_id,
      });
      chatId = await formatChatIdFromPrefix(promptData.bot?.user_prefix || "{id}_RRsituations", rawEmpId, "RRsituations");
    }

    let aiText = "";
    try {
      aiText = await callProTalkLLM(
        isDemo ? "demo_situations" : "situations",
        llmMessages,
        chatId,
        undefined,
        undefined,
        promptKey,
        isProMax
      );
    } catch (err: any) {
      const failedJobId = storeFailedAiJob(err, "situations_grade", req.body, candidate_id);
      return res.status(502).json({
        ok: false,
        job_id: failedJobId,
        retryable: true,
        error: `Ошибка вызова нейросети: ${err?.message || "Не удалось получить ответ"}. Попробуйте повторить с RR ProMax.`,
      });
    }

    const obj = tryParseLLMJson<any>(aiText) || {};
    let results = (Array.isArray(obj.items) ? obj.items : []).map((it: any, idx: number) => {
      const sItem = items.find((x: any) => String(x.id) === String(it.id)) || items[idx];
      const userAns = String(sItem?.answer || "").trim();
      const rawParsed = Math.max(0, Math.min(100, Number(it.raw_score ?? it.score) || 0));
      const aiDetected = Boolean(antiAiEnabled && (it.ai_detected === true || detectAiTextHeuristic(userAns)));
      let finalScore = Math.max(0, Math.min(100, Number(it.score) || 0));
      let feedback = String(it.feedback || "").slice(0, 800);

      if (aiDetected) {
        const baseScore = it.raw_score !== undefined ? rawParsed : (finalScore > 0 ? finalScore : rawParsed);
        finalScore = Math.round(baseScore / 2);
        if (!/нейросет|ии|ai/i.test(feedback)) {
          feedback = `${feedback ? feedback + " " : ""}Защита от нейросетей: обнаружены признаки генерации ответа ИИ — балл за вопрос снижен в 2 раза (${baseScore} → ${finalScore}).`;
        }
      }

      return {
        id: String(it.id || sItem?.id || `s${idx + 1}`),
        title: String(sItem?.title || it.title || `Ситуация #${idx + 1}`),
        recommendation: String(it.recommendation || it.advice || sItem?.brief || ""),
        score: finalScore,
        raw_score: aiDetected ? (it.raw_score !== undefined ? rawParsed : finalScore * 2) : rawParsed,
        ai_detected: aiDetected,
        feedback: feedback.slice(0, 800),
      };
    });

    if (results.length === 0 && items.length > 0) {
      results = items.map((s: any, idx: number) => {
        const userAns = String(s.answer || "").trim();
        const baseSc = userAns.length > 30 ? 78 : userAns.length > 10 ? 55 : 30;
        const aiDetected = Boolean(antiAiEnabled && detectAiTextHeuristic(userAns));
        const sc = aiDetected ? Math.round(baseSc / 2) : baseSc;
        return {
          id: s.id,
          title: String(s.title || `Ситуация #${idx + 1}`),
          recommendation: String(s.brief || ""),
          score: sc,
          raw_score: baseSc,
          ai_detected: aiDetected,
          feedback: aiDetected
            ? `Ответ проанализирован. Защита от нейросетей: обнаружены признаки генерации ответа ИИ — балл снижен в 2 раза (${baseSc} → ${sc}).`
            : (userAns ? "Ответ кандидата проанализирован по критериям ролевого кейса." : "Ответ не предоставлен."),
        };
      });
    }

    const avgScore = results.length ? Math.round(results.reduce((s: number, x: any) => s + x.score, 0) / results.length) : 50;
    const anyAiDetected = results.some((r: any) => r.ai_detected);
    let advice = String(obj.advice || "Оценка сформирована по критериям ролевых ситуаций.").slice(0, 800);
    if (antiAiEnabled && anyAiDetected && !/нейросет|ии/i.test(advice)) {
      advice += " Внимание: в ответах обнаружены признаки использования нейросети, баллы по соответствующим вопросам снижены в 2 раза.";
    }
    const jobId = `job-sit-${Date.now()}`;
    const status = isProMax ? "fallback_succeeded" : "primary_succeeded";

    const sitStrengths = Array.isArray(obj.strengths) && obj.strengths.length > 0
      ? obj.strengths.map((s: any) => String(s).slice(0, 300))
      : results.filter((x: any) => x.score >= 70).map((x: any) => `Уверенное решение ситуации: ${x.title || x.id}`).slice(0, 3);
    const sitGaps = Array.isArray(obj.gaps) && obj.gaps.length > 0
      ? obj.gaps.map((s: any) => String(s).slice(0, 300))
      : results.filter((x: any) => x.score < 70).map((x: any) => x.feedback || `Рекомендуется развить подход к ситуации ${x.title || x.id}`).slice(0, 3);

    const resultPayload = {
      score: avgScore,
      total: avgScore,
      items: results,
      advice,
      summary: advice,
      strengths: sitStrengths,
      gaps: sitGaps,
      areas_to_improve: sitGaps,
      anti_ai_enabled: antiAiEnabled,
      ai_detected: anyAiDetected,
    };

    if (!is_preview && !isDemo && candidate_id && db) {
      try {
        await persistCandidateAfterSituations({ db, candidate_id, projRow, pid, avgScore, resultPayload, ansObj });
      } catch (err: any) {
        console.error("[handleGradeSituations] Candidate persistence error:", err);
      }
    }

    candidateAiJobStore.set(jobId, {
      id: jobId,
      candidate_id,
      task_type: "situations_grade",
      status,
      result: resultPayload,
      payload: req.body,
    });

    return res.json({
      ok: true,
      job_id: jobId,
      status,
      terminal: true,
      score: avgScore,
      items: results,
      advice,
      anti_ai_enabled: antiAiEnabled,
      ai_detected: anyAiDetected,
      is_preview: Boolean(is_preview),
      result: resultPayload,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

situationsAndChecklistRouter.post(
  ["/ai-demo-grade-situations", "/ai-interview-grade-situations", "/ai-interview-grade-situations-v2"],
  handleGradeSituations
);

export const handleGradeChecklist = async (req: Request, res: Response) => {
  try {
    const {
      candidate_id,
      project_id,
      title: rawTitle,
      checklist,
      questions: reqQuestions,
      answers: rawAnswers,
      demo_user_id,
      employer_id,
      employer_public_id,
      is_preview,
      anti_ai_enabled: reqAntiAi,
      employer_wishes: reqWishes,
      prompt_override: reqPromptOverride,
      use_promax,
    } = req.body || {};
    const isProMax = Boolean(use_promax || req.body?.useProMax);
    const db = await getProTalkDB();

    let title = rawTitle;
    let questions = Array.isArray(checklist) ? checklist : Array.isArray(reqQuestions) ? reqQuestions : [];
    let ansObj = rawAnswers && typeof rawAnswers === "object" ? rawAnswers : {};
    let blkRow: any = null;
    let parsedBlk: any = {};
    let projRow: any = null;

    const cand = candidate_id && db ? await findCandidateRow(db, candidate_id) : null;
    let pid = project_id || cand?.project_id;
    if (!pid && candidate_id && db) {
      const cProj = await db.get(
        "SELECT project_id FROM candidates WHERE id = ? OR CAST(public_id AS TEXT) = ? LIMIT 1",
        [String(candidate_id), String(candidate_id)]
      );
      pid = cProj?.project_id || null;
    }
    if (pid && db) {
      projRow = await db.get(
        "SELECT * FROM projects WHERE id = ? OR CAST(public_id AS TEXT) = ? LIMIT 1",
        [String(pid), String(pid)]
      );
      if (projRow && !title) title = projRow.role_name || projRow.title;
      blkRow = await db.get(
        "SELECT * FROM interview_blocks WHERE project_id = ? AND kind = 'checklist' LIMIT 1",
        [projRow?.id || String(pid)]
      );
      if (blkRow?.payload) {
        try {
          parsedBlk = typeof blkRow.payload === "string" ? JSON.parse(blkRow.payload) : blkRow.payload;
          if (questions.length === 0 && Array.isArray(parsedBlk?.questions)) {
            questions = parsedBlk.questions;
          }
        } catch {}
      }
    }

    if (cand && Object.keys(ansObj).length === 0 && cand?.checklist_answers) {
      try {
        ansObj = typeof cand.checklist_answers === "string" ? JSON.parse(cand.checklist_answers) : cand.checklist_answers;
      } catch {}
    }

    const employerWishes = String(
      reqWishes ?? reqPromptOverride ?? parsedBlk?.employer_wishes ?? blkRow?.prompt_override ?? ""
    ).trim();

    let parsedSettings: any = {};
    try {
      if (blkRow?.settings_json) {
        parsedSettings = typeof blkRow.settings_json === "string" ? JSON.parse(blkRow.settings_json) : blkRow.settings_json;
      }
    } catch {}

    const antiAiEnabled =
      reqAntiAi !== undefined
        ? Boolean(reqAntiAi)
        : Boolean(
            blkRow?.anti_ai_enabled ||
              parsedBlk?.anti_ai_enabled ||
              parsedSettings?.anti_ai_enabled ||
              /Защита от нейросетей/i.test(employerWishes)
          );

    const fullBatch = questions.map((q: any, idx: number) => {
      const kind = normalizeKind(q.kind);
      const qId = q.id || `q${idx + 1}`;
      const rawAns = ansObj[qId] ?? ansObj[`q${idx + 1}`] ?? "";
      const selectedMulti = kind === "multichoice" ? parseMultiList(rawAns) : [];
      const answerStr =
        kind === "multichoice"
          ? selectedMulti.join(" || ")
          : Array.isArray(rawAns)
          ? rawAns.join(" || ")
          : String(rawAns || "").slice(0, 3000);
      const correctOpts =
        kind === "multichoice"
          ? parseMultiList(Array.isArray(q.correct_options) && q.correct_options.length > 0 ? q.correct_options : q.correct)
          : q.correct
          ? [String(q.correct)]
          : [];
      const multiCalc =
        kind === "multichoice"
          ? calcMultiChoiceScore(selectedMulti, correctOpts, Array.isArray(q.options) ? q.options.length : 4)
          : null;
      const qPoints = Number(q.points) > 0 ? Number(q.points) : Number((100 / (questions.length || 1)).toFixed(2));
      return {
        id: qId,
        kind,
        question: q.question,
        options: Array.isArray(q.options) ? q.options : null,
        correct: kind === "multichoice" ? correctOpts : q.correct || null,
        correct_options: kind === "multichoice" ? correctOpts : undefined,
        selected_options: kind === "multichoice" ? selectedMulti : undefined,
        points: qPoints,
        max: qPoints,
        calculated_multichoice_score: multiCalc ? multiCalc.score5 : undefined,
        matched_correct_count: multiCalc ? multiCalc.matched : undefined,
        wrong_selected_count: multiCalc ? multiCalc.wrong : undefined,
        total_correct_count: multiCalc ? multiCalc.totalCorrect : undefined,
        expected: q.expected_answer || null,
        answer: answerStr,
      };
    });

    const isDemo = Boolean(demo_user_id && !candidate_id && !is_preview);
    const baseKey = isDemo ? "demo_checklist_evaluation" : "checklist_evaluation";
    const promptKey = isProMax ? `${baseKey}_promax` : baseKey;
    const promptData = await getProTalkPrompt(
      promptKey,
      `Ты — строгий проверяющий ответы кандидата на чек-лист собеседования. Должность: "{{title}}".
Всего вопросов {{questions_count}}. Максимальная сумма за все вопросы равна 100 баллов.
Вопросы и ответы:
{{questions_json}}

Верни строго JSON без markdown:
{"items":[{"id":string,"score":number,"raw_score":number,"ai_detected":boolean,"max":number,"verdict":"correct|partial|wrong","explanation":string,"what_was_right":string,"what_was_wrong":string}],"total":0..100,"summary":string,"strengths":[string],"gaps":[string]}`,
      isProMax
    );

    const fallbackMsg = `Должность: "${title || "Специалист"}"\nВсего вопросов: ${questions.length}\nВопросы и ответы:\n${JSON.stringify(fullBatch)}\n\nВерни строго JSON без markdown:\n{"items":[{"id":string,"score":0..5,"raw_score":0..5,"ai_detected":boolean,"max":5,"verdict":"correct|partial|wrong","explanation":string,"what_was_right":string,"what_was_wrong":string}],"total":0..100,"summary":string,"strengths":[string],"gaps":[string]}`;
    const llmMessages = buildLlmMessagesFromPrompt(
      promptData,
      {
        title: title || "Специалист",
        role_name: title || "Специалист",
        questions_count: questions.length,
        questions_json: JSON.stringify(fullBatch),
        wishes: employerWishes,
      },
      fallbackMsg
    );

    const lastMsg = llmMessages[llmMessages.length - 1];
    if (employerWishes) {
      lastMsg.content += `\n\nДополнительные указания работодателя:\n${employerWishes}`;
    }
    if (antiAiEnabled) {
      lastMsg.content += `\n\nПравило защиты от нейросетей (включено работодателем):
Для открытых вопросов (kind="text" или kind="paragraph") проверяй ответ на признаки генерации нейросетью.
Верни "ai_detected": boolean и "raw_score". Если "ai_detected": true, снизь score ровно в 2 раза и укажи это в explanation.`;
    }

    let chatId = "";
    if (is_preview) {
      const rawEmpId = await resolveEmployerPublicId(db, {
        employerId: employer_id,
        employerPublicId: employer_public_id,
        projectId: projRow?.id || pid,
        companyId: projRow?.company_id,
      });
      chatId = await formatChatIdFromPrefix(promptData.bot?.user_prefix || "{id}_RRchecklist", rawEmpId, "RRchecklist");
    } else if (candidate_id) {
      const candPubId = await resolveCandidate6DigitPublicId(candidate_id, db);
      chatId = `${candPubId}_cheklist`;
    } else if (demo_user_id) {
      chatId = formatDemoChatId(demo_user_id, "cheklist");
    } else {
      const rawEmpId = await resolveEmployerPublicId(db, {
        employerId: employer_id,
        employerPublicId: employer_public_id,
        projectId: projRow?.id || pid,
        companyId: projRow?.company_id,
      });
      chatId = await formatChatIdFromPrefix(promptData.bot?.user_prefix || "{id}_RRchecklist", rawEmpId, "RRchecklist");
    }

    let aiText = "";
    try {
      aiText = await callProTalkLLM(
        isDemo ? "demo_checklist" : "checklist",
        llmMessages,
        chatId,
        undefined,
        undefined,
        promptKey,
        isProMax
      );
    } catch (err: any) {
      const failedJobId = storeFailedAiJob(err, "checklist_grade", req.body, candidate_id);
      return res.status(502).json({
        ok: false,
        job_id: failedJobId,
        retryable: true,
        error: `Ошибка вызова нейросети: ${err?.message || "Не удалось получить ответ"}. Попробуйте повторить с RR ProMax.`,
      });
    }

    const aiObj = tryParseLLMJson<any>(aiText);
    const items: any[] = [];
    for (let idx = 0; idx < questions.length; idx++) {
      const q = questions[idx];
      const qKind = normalizeKind(q.kind);
      const qId = q.id || `q${idx + 1}`;
      const rawAns = ansObj[qId] ?? ansObj[`q${idx + 1}`] ?? "";
      const selectedMulti = qKind === "multichoice" ? parseMultiList(rawAns) : [];
      const ans = (
        qKind === "multichoice"
          ? selectedMulti.join(" || ")
          : Array.isArray(rawAns)
          ? rawAns.join(" || ")
          : String(rawAns || "")
      ).trim();
      const correctOpts: string[] =
        qKind === "multichoice"
          ? parseMultiList(Array.isArray(q.correct_options) && q.correct_options.length > 0 ? q.correct_options : q.correct)
          : q.correct
          ? [String(q.correct)]
          : [];
      const multiCalc =
        qKind === "multichoice"
          ? calcMultiChoiceScore(selectedMulti, correctOpts, Array.isArray(q.options) ? q.options.length : 4)
          : null;
      const correctDisplay =
        qKind === "multichoice" ? correctOpts.join(", ") : qKind === "choice" ? String(q.correct || "") : String(q.expected_answer || "");
      const isTextKind = qKind === "text" || qKind === "paragraph";
      const qPoints = Number(q.points) > 0 ? Number(q.points) : Number((100 / (questions.length || 1)).toFixed(2));
      const aiItem = aiObj && Array.isArray(aiObj.items) ? aiObj.items.find((x: any) => String(x.id) === String(qId)) : null;

      if (aiItem) {
        let rawScoreVal = Number(aiItem.raw_score ?? aiItem.score) || 0;
        let scoreVal = Number(aiItem.score ?? aiItem.raw_score) || 0;
        if (aiItem.max === 5 && Math.abs(qPoints - 5) > 0.05) {
          rawScoreVal = (rawScoreVal / 5) * qPoints;
          scoreVal = (scoreVal / 5) * qPoints;
        } else if (rawScoreVal <= 5 && qPoints > 5.5 && (!aiItem.max || aiItem.max === 5)) {
          rawScoreVal = (rawScoreVal / 5) * qPoints;
          scoreVal = (scoreVal / 5) * qPoints;
        }

        const multiCalcScore = multiCalc ? Math.round((multiCalc.score5 / 5) * qPoints * 100) / 100 : null;
        const rawParsed =
          qKind === "multichoice" && multiCalcScore != null
            ? multiCalcScore
            : Math.max(0, Math.min(qPoints, Math.round(rawScoreVal * 100) / 100));
        const aiDetected = Boolean(antiAiEnabled && isTextKind && (aiItem.ai_detected === true || detectAiTextHeuristic(ans)));
        let finalItemScore =
          qKind === "multichoice" && multiCalcScore != null
            ? multiCalcScore
            : Math.max(0, Math.min(qPoints, Math.round(scoreVal * 100) / 100));
        let explanation = String(aiItem.explanation || "").slice(0, 800);
        let whatWrong = String(aiItem.what_was_wrong || "").slice(0, 500);

        if (aiDetected) {
          const baseScore = aiItem.raw_score !== undefined ? rawParsed : (finalItemScore > 0 ? finalItemScore : rawParsed);
          finalItemScore = Math.round((baseScore / 2) * 100) / 100;
          if (!/нейросет|ии|ai/i.test(explanation)) {
            explanation = `${explanation ? explanation + " " : ""}Защита от нейросетей: обнаружены признаки ответа от ИИ — балл за вопрос снижен в 2 раза (${baseScore} → ${finalItemScore}).`;
          }
          if (!whatWrong) {
            whatWrong = "Обнаружены признаки использования нейросети при подготовке ответа (балл снижен в 2 раза).";
          }
        }

        items.push({
          id: qId,
          kind: qKind,
          question: q.question,
          answer: ans.replace(/\s*\|\|\s*/g, ", "),
          correct: correctDisplay,
          score: finalItemScore,
          raw_score: rawParsed,
          ai_detected: aiDetected,
          max: qPoints,
          verdict: String(
            qKind === "multichoice" && multiCalc
              ? multiCalc.verdict
              : aiItem.verdict || (finalItemScore >= qPoints * 0.8 ? "correct" : finalItemScore > 0 ? "partial" : "wrong")
          ),
          explanation: explanation.slice(0, 800),
          what_was_right: String(aiItem.what_was_right || "").slice(0, 500),
          what_was_wrong: whatWrong.slice(0, 500),
        });
      } else {
        let fallbackRaw = 0;
        let verdict: "correct" | "partial" | "wrong" = "wrong";
        let explanation = "";
        if (qKind === "choice") {
          const isMatch = ans && q.correct && ans.toLowerCase() === String(q.correct).trim().toLowerCase();
          fallbackRaw = isMatch ? qPoints : 0;
          verdict = isMatch ? "correct" : "wrong";
          explanation = isMatch ? "Выбран верный вариант ответа из списка." : "Выбран неверный вариант или ответ не указан.";
        } else if (qKind === "multichoice" && multiCalc) {
          fallbackRaw = Math.round((multiCalc.score5 / 5) * qPoints * 100) / 100;
          verdict = multiCalc.verdict;
          explanation =
            multiCalc.verdict === "correct"
              ? `Выбраны все правильные варианты ответа (${multiCalc.matched} из ${multiCalc.totalCorrect}).`
              : multiCalc.verdict === "partial"
              ? `Частично верный выбор: совпало ${multiCalc.matched} из ${multiCalc.totalCorrect} правильных ответов.`
              : selectedMulti.length > 0
              ? "Выбраны неверные варианты ответа."
              : "Варианты ответа не выбраны.";
        } else {
          const minFull = qKind === "paragraph" ? 60 : 25;
          fallbackRaw = ans.length >= minFull ? Number((qPoints * 0.9).toFixed(2)) : ans.length > 8 ? Number((qPoints * 0.6).toFixed(2)) : 0;
          verdict = fallbackRaw >= qPoints * 0.8 ? "correct" : fallbackRaw > 0 ? "partial" : "wrong";
          explanation = ans ? "Ответ проверен по смыслу эталона." : "Ответ не предоставлен.";
        }
        const aiDetected = Boolean(antiAiEnabled && isTextKind && detectAiTextHeuristic(ans));
        const finalItemScore = aiDetected ? Math.round((fallbackRaw / 2) * 100) / 100 : fallbackRaw;
        if (aiDetected) {
          explanation += ` Защита от нейросетей: обнаружены признаки генерации ИИ — балл за вопрос снижен в 2 раза (${fallbackRaw} → ${finalItemScore}).`;
        }
        items.push({
          id: qId,
          kind: qKind,
          question: q.question,
          answer: ans.replace(/\s*\|\|\s*/g, ", "),
          correct: correctDisplay,
          score: finalItemScore,
          raw_score: fallbackRaw,
          ai_detected: aiDetected,
          max: qPoints,
          verdict,
          explanation,
          what_was_right: fallbackRaw > 0 ? "Присутствует содержательный ответ по вопросу" : "",
          what_was_wrong: aiDetected ? "Обнаружены признаки генерации ответа нейросетью (балл снижен в 2 раза)" : fallbackRaw === 0 ? "Требуется точный ответ" : "",
        });
      }
    }

    const totalPoints = Math.round(items.reduce((s, x) => s + x.score, 0) * 100) / 100;
    const maxPoints = Math.round(items.reduce((s, x) => s + x.max, 0) * 100) / 100 || 100;
    const score100 = Math.min(100, Math.round((totalPoints / maxPoints) * 100));
    const anyAiDetected = items.some((x) => x.ai_detected);

    let summary = String(aiObj?.summary || `Анкета чек-листа проверена: итоговый результат ${score100} из 100 баллов.`).slice(0, 1500);
    if (aiObj?.total != null && Math.round(Number(aiObj.total)) !== score100) {
      const rawTotal = String(aiObj.total);
      summary = summary.replace(new RegExp(`${rawTotal}\\s*(из|\\/)\\s*100`, "gi"), `${score100} $1 100`);
    }
    if (antiAiEnabled && anyAiDetected && !/нейросет|ии/i.test(summary)) {
      summary += " Внимание: в части ответов обнаружены признаки использования нейросети — баллы за эти вопросы снижены в 2 раза.";
    }

    const chkStrengths =
      Array.isArray(aiObj?.strengths) && aiObj.strengths.length > 0
        ? aiObj.strengths.map((s: any) => String(s).slice(0, 300))
        : items.filter((it) => it.verdict === "correct" || it.score >= 4).map((it) => it.what_was_right || it.question).filter(Boolean).slice(0, 4);
    const chkGaps =
      Array.isArray(aiObj?.gaps) && aiObj.gaps.length > 0
        ? aiObj.gaps.map((s: any) => String(s).slice(0, 300))
        : items.filter((it) => it.verdict === "wrong" || it.score < 3).map((it) => it.what_was_wrong || it.question).filter(Boolean).slice(0, 4);

    const feedbackPayload = {
      items,
      total: score100,
      score: score100,
      summary,
      anti_ai_enabled: antiAiEnabled,
      ai_detected: anyAiDetected,
      strengths: chkStrengths,
      gaps: chkGaps,
      areas_to_improve: chkGaps,
    };
    const jobId = `job-chk-${Date.now()}`;
    const status = isProMax ? "fallback_succeeded" : "primary_succeeded";

    if (!is_preview && !isDemo && candidate_id && db) {
      try {
        await persistCandidateAfterChecklist({
          db,
          candidate_id,
          projRow,
          pid,
          score100,
          totalPoints,
          feedbackPayload,
          ansObj,
          items,
        });
      } catch (err: any) {
        console.error("[handleGradeChecklist] Candidate persistence error:", err);
      }
    }

    candidateAiJobStore.set(jobId, {
      id: jobId,
      candidate_id,
      task_type: "checklist_grade",
      status,
      result: { score: score100, feedback: feedbackPayload },
      payload: req.body,
    });

    return res.json({
      ok: true,
      job_id: jobId,
      status,
      terminal: true,
      score: score100,
      anti_ai_enabled: antiAiEnabled,
      ai_detected: anyAiDetected,
      is_preview: Boolean(is_preview),
      feedback: feedbackPayload,
      result: { score: score100, feedback: feedbackPayload },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

situationsAndChecklistRouter.post(
  ["/ai-demo-grade-checklist", "/ai-interview-grade-checklist", "/ai-interview-grade-checklist-v2"],
  handleGradeChecklist
);

