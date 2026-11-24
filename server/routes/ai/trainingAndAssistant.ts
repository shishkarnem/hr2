import { Router, Request, Response } from "express";
import crypto from "crypto";
import {
  formatDemoChatId,
  formatEmployerChatId,
  formatChatIdFromPrefix,
  resolveCandidate6DigitPublicId,
  resolveEmployerPublicId,
  extractUserSocialId,
  callProTalkLLM,
  getProTalkPrompt,
  tryParseLLMJson,
  extractBalancedJsonObjects,
} from "../../common";
import { getProTalkDB, saveAILog } from "../../db";
import { buildLlmMessagesFromPrompt, storeFailedAiJob } from "../../aiHelpers/common";
import {
  stripNonText,
  extractRequestedQuestionCount,
  computeTypeDistribution,
  normalizeDynamicQuestions,
} from "../../aiHelpers/quizAndOptions";
import { extractSmartCompanyResult } from "../../aiHelpers/documentAndVoice";

export const trainingAndAssistantRouter = Router();

export const handleGenerateStageTest = async (req: Request, res: Response) => {
  try {
    const { project_id, stage, wishes, materials_text, employer_id, employer_public_id, company_id, use_promax } = req.body || {};
    if (!project_id || !stage) {
      return res.status(400).json({ error: "Не указан project_id или stage" });
    }

    const isProMax = Boolean(use_promax || req.body?.useProMax);
    const db = await getProTalkDB();
    const pStr = String(project_id);
    const cleanPid = pStr.replace(/^vac/i, "");
    const project = await db.get(
      "SELECT * FROM projects WHERE id = ? OR CAST(public_id AS TEXT) = ? OR CAST(public_id AS TEXT) = ? OR slug = ? LIMIT 1",
      [pStr, pStr, cleanPid, pStr]
    );
    const empId = await resolveEmployerPublicId(db, {
      employerId: employer_id,
      employerPublicId: employer_public_id,
      projectId: project?.id || project_id,
      companyId: project?.company_id || company_id,
    });
    const canonicalPid = project ? project.id : pStr;

    let combined = "";
    if (materials_text && typeof materials_text === "string" && materials_text.trim()) {
      combined = stripNonText(materials_text);
    } else {
      const block = await db.get(
        "SELECT * FROM training_blocks WHERE (project_id = ? OR project_id = ?) AND stage = ? ORDER BY updated_at DESC LIMIT 1",
        [canonicalPid, pStr, String(stage)]
      );
      if (block) {
        if (block.subpages_json) {
          try {
            const parsed = typeof block.subpages_json === "string" ? JSON.parse(block.subpages_json) : block.subpages_json;
            if (Array.isArray(parsed)) {
              combined = parsed.map((p: any) => `## ${p.title || ""}\n${p.content || ""}`).join("\n\n");
            }
          } catch {}
        }
        if (!combined.trim()) {
          combined = block.materials_md || block.content || "";
        }
      }
      combined = stripNonText(combined);
    }

    if (!combined.trim()) {
      return res.status(400).json({ error: "Материалы по этапу не найдены. Сначала заполните текст подстраниц." });
    }

    const chatId = formatEmployerChatId(empId, "RRtraining");
    const promptKey = isProMax ? "training_stage_test_generate_promax" : "training_stage_test_generate";
    const promptData = await getProTalkPrompt(promptKey, undefined, isProMax);

    const wishesStr = (wishes || "").trim().slice(0, 1000);
    const targetCount = extractRequestedQuestionCount(wishesStr, 20);
    const typeDist = computeTypeDistribution(targetCount, wishesStr);
    const pointPerQ = Number((100 / targetCount).toFixed(2));

    const fallbackUser = `На основе текстового материала ниже составь проверочный тест по этапу обучения «${stage}» для должности «${project?.role_name || "Специалист"}» компании «${project?.company_name || "Компания"}».
${wishesStr ? `\nПожелания пользователя:\n${wishesStr}\n` : ""}

Материалы этапа обучения:
${combined.slice(0, 15000)}

Требования к составлению теста:
1. Бери сведения строго из каждой подстраницы обучения для составления вопросов.
2. Верни строго JSON-массив из ${targetCount} объектов без markdown обёрток:
   - ${typeDist.choice} вопросов choice (4 варианта в options, 1 правильный в correct)
   - ${typeDist.multichoice} вопросов multichoice (4 варианта в options, 2-3 правильных в correct)
   - ${typeDist.string} вопросов string (краткий точный ответ в expected_answer)
   - ${typeDist.paragraph} вопросов paragraph (развернутый ответ в expected_answer)
3. Для каждого вопроса укажи: id, kind, question, options, correct, expected_answer, points (${pointPerQ}), explanation.
4. Не используй капслок и запрещены любые шаблонные заглушки.`;

    const llmMessages = buildLlmMessagesFromPrompt(
      promptData,
      {
        stage: String(stage),
        wishes: wishesStr,
        materials: combined.slice(0, 15000),
        role_name: project?.role_name || "Специалист",
        company_name: project?.company_name || "Компания",
        count: targetCount,
      },
      fallbackUser
    );

    let rawReply = "";
    try {
      rawReply = await callProTalkLLM("training", llmMessages, chatId, undefined, undefined, promptKey, isProMax);
    } catch (llmErr: any) {
      const failedJobId = storeFailedAiJob(llmErr, "training_stage_test", req.body);
      return res.status(502).json({
        job_id: failedJobId,
        error: `Ошибка вызова нейросети при генерации аттестации: ${llmErr?.message || "сервис временно недоступен"}`,
        retryable: true,
      });
    }

    let questions: any[] = [];
    const directParsed = tryParseLLMJson<any>(rawReply);
    if (Array.isArray(directParsed)) {
      questions = directParsed;
    } else if (directParsed && typeof directParsed === "object") {
      const candidateList = directParsed.questions || directParsed.test || directParsed.items || directParsed.data || directParsed.quiz;
      if (Array.isArray(candidateList)) questions = candidateList;
    }
    if (questions.length === 0) {
      const recovered = extractBalancedJsonObjects(rawReply).filter((o) => o && (o.question || o.title));
      if (recovered.length > 0) questions = recovered;
    }

    const normalizedQuestions = normalizeDynamicQuestions(questions, String(stage), targetCount, typeDist);
    if (normalizedQuestions.length === 0) {
      const emptyJobId = storeFailedAiJob(new Error("0 valid questions parsed"), "training_stage_test", req.body);
      return res.status(502).json({
        job_id: emptyJobId,
        error: "Нейросеть вернула ответ в некорректном формате (0 вопросов). Повторите генерацию через RR ProMax.",
        retryable: true,
      });
    }

    const existingPgTest = await db.get(
      "SELECT id, pass_score, passing_score FROM training_stage_tests WHERE project_id = ? AND stage = ? LIMIT 1",
      [canonicalPid, String(stage)]
    );
    const existingPgBlock = await db.get(
      "SELECT pass_score FROM training_blocks WHERE project_id = ? AND stage = ? LIMIT 1",
      [canonicalPid, String(stage)]
    );
    const testId = existingPgTest?.id || `tst-${canonicalPid}-${stage}`;
    const questionsJson = JSON.stringify(normalizedQuestions);
    const totalScore = 100;
    const dbTestPass = Number(existingPgTest?.passing_score ?? existingPgTest?.pass_score);
    const dbBlockPass = Number(existingPgBlock?.pass_score);
    const passScore =
      (Number.isFinite(dbTestPass) && dbTestPass > 0 ? dbTestPass : 0) ||
      (Number.isFinite(dbBlockPass) && dbBlockPass > 0 ? dbBlockPass : 0) ||
      70;

    await db.run(
      `INSERT INTO training_stage_tests (id, project_id, stage, questions, questions_json, pass_score, passing_score, total_score, shuffle_questions, status, ai_generated_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 'completed', NOW(), NOW(), NOW())
       ON CONFLICT (project_id, stage) DO UPDATE SET
         questions = EXCLUDED.questions,
         questions_json = EXCLUDED.questions_json,
         pass_score = COALESCE(training_stage_tests.pass_score, EXCLUDED.pass_score),
         passing_score = COALESCE(training_stage_tests.passing_score, EXCLUDED.passing_score),
         total_score = EXCLUDED.total_score,
         shuffle_questions = EXCLUDED.shuffle_questions,
         status = 'completed',
         ai_generated_at = NOW(),
         updated_at = NOW()`,
      [testId, canonicalPid, String(stage), questionsJson, questionsJson, passScore, passScore, totalScore]
    );

    return res.json({
      ok: true,
      id: testId,
      count: normalizedQuestions.length,
      total_score: totalScore,
      pass_score: passScore,
      questions: normalizedQuestions,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Ошибка генерации проверочного теста" });
  }
};

trainingAndAssistantRouter.post(["/generate-stage-test", "/ai-generate-stage-test", "/ai-generate-stage-questions"], handleGenerateStageTest);

const handleListStageQuestions = async (req: Request, res: Response) => {
  try {
    const { project_id, stage = "professional" } = req.body || {};
    if (!project_id) {
      return res.json({ questions: [], pass_score: 70, total_score: 100, shuffle: true });
    }
    const pStr = String(project_id);
    const cleanPid = pStr.replace(/^vac/i, "");
    const db = await getProTalkDB();

    const proj = await db.get(
      "SELECT id, public_id FROM projects WHERE id = ? OR CAST(public_id AS TEXT) = ? OR CAST(public_id AS TEXT) = ? OR slug = ? LIMIT 1",
      [pStr, pStr, cleanPid, pStr]
    );
    const candA = proj ? String(proj.id) : pStr;
    const candB = proj ? String(proj.public_id || proj.id) : cleanPid;

    const existing = await db.get(
      "SELECT * FROM training_stage_tests WHERE (project_id = ? OR project_id = ? OR project_id = ?) AND stage = ? ORDER BY updated_at DESC LIMIT 1",
      [candA, candB, pStr, String(stage)]
    );
    const existingBlock = await db.get(
      "SELECT pass_score FROM training_blocks WHERE (project_id = ? OR project_id = ? OR project_id = ?) AND stage = ? ORDER BY updated_at DESC LIMIT 1",
      [candA, candB, pStr, String(stage)]
    );

    let questions: any[] = [];
    const rawQs = existing?.questions || existing?.questions_json;
    if (rawQs) {
      try {
        questions = typeof rawQs === "string" ? JSON.parse(rawQs) : rawQs;
      } catch {}
    }
    const dbTestPass = Number(existing?.passing_score ?? existing?.pass_score);
    const dbBlockPass = Number(existingBlock?.pass_score);
    const resolvedPass =
      (Number.isFinite(dbTestPass) && dbTestPass > 0 ? dbTestPass : 0) ||
      (Number.isFinite(dbBlockPass) && dbBlockPass > 0 ? dbBlockPass : 0) ||
      70;
    const rawShuf = existing?.shuffle_questions;
    const shuffleBool =
      rawShuf === null || rawShuf === undefined
        ? true
        : !["0", "0.0", "false", "f"].includes(String(rawShuf).trim().toLowerCase());
    return res.json({
      questions: Array.isArray(questions) ? questions : [],
      pass_score: resolvedPass,
      total_score: Number(existing?.total_score || 100),
      shuffle: shuffleBool,
    });
  } catch {
    return res.json({ questions: [], pass_score: 70, total_score: 100, shuffle: true });
  }
};

trainingAndAssistantRouter.post(["/list-stage-questions", "/ai-list-stage-questions"], handleListStageQuestions);

export const handleGenerateStageMaterial = async (req: Request, res: Response) => {
  try {
    const { project_id, stage = "professional", source_text, wishes, employer_id, employer_public_id, company_id, use_promax } = req.body || {};
    const isProMax = Boolean(use_promax || req.body?.useProMax);
    const db = await getProTalkDB();
    let proj: any = null;
    if (project_id) {
      const pStr = String(project_id);
      const cleanPid = pStr.replace(/^vac/i, "");
      proj = await db.get(
        "SELECT id, public_id, company_id, role_name, company_name, employer_id FROM projects WHERE id = ? OR CAST(public_id AS TEXT) = ? OR CAST(public_id AS TEXT) = ? OR slug = ? LIMIT 1",
        [pStr, pStr, cleanPid, pStr]
      );
    }
    const roleName = proj?.role_name || "Специалист";
    const companyName = proj?.company_name || "Компания";
    const empId = await resolveEmployerPublicId(db, {
      employerId: employer_id,
      employerPublicId: employer_public_id,
      projectId: proj?.id || project_id,
      companyId: proj?.company_id || company_id,
    });
    const stageTitle =
      stage === "professional"
        ? "Профессиональное обучение"
        : stage === "product"
        ? "Продуктовое обучение"
        : "Системное обучение";

    const promptKey = isProMax ? "training_stage_material_generate_promax" : "training_stage_material_generate";
    const promptData = await getProTalkPrompt(promptKey, undefined, isProMax);

    const fallbackUser = `Составь или улучши структурированный учебный материал по этапу «${stageTitle}» для должности «${roleName}» в компании «${companyName}».
${source_text ? `Исходный материал:\n${source_text}\n` : ""}
${wishes ? `Пожелания работодателя:\n${wishes}\n` : ""}
Требования: Markdown (##, ###), списки, без капслока, сохрани все существующие медиа-блоки (:::frame, :::carousel, :::button, ссылки и изображения).`;

    const llmMessages = buildLlmMessagesFromPrompt(
      promptData,
      { stage: stageTitle, role: roleName, role_name: roleName, company: companyName, company_name: companyName, source: source_text || "", wishes: wishes || "" },
      fallbackUser
    );
    const chatId = formatEmployerChatId(empId, "RRtraining");

    let aiText = "";
    try {
      aiText = await callProTalkLLM("training", llmMessages, chatId, undefined, undefined, promptKey, isProMax);
    } catch (err: any) {
      const failedJobId = storeFailedAiJob(err, "training_stage_material", req.body);
      return res.status(502).json({
        job_id: failedJobId,
        error: `Ошибка нейросети при генерации учебного материала: ${err?.message || "сервис временно недоступен"}`,
        retryable: true,
      });
    }
    const cleanText = (aiText || "").replace(/^```(?:markdown|text)?\n?/i, "").replace(/\n?```$/i, "").trim();
    if (!cleanText) {
      const emptyJobId = storeFailedAiJob(new Error("Empty training material"), "training_stage_material", req.body);
      return res.status(502).json({
        job_id: emptyJobId,
        error: "Нейросеть вернула пустой учебный материал. Повторите попытку.",
        retryable: true,
      });
    }
    return res.json({ ok: true, text: cleanText, value: cleanText });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Ошибка генерации материала" });
  }
};

trainingAndAssistantRouter.post(["/generate-stage-material", "/ai-generate-stage-material"], handleGenerateStageMaterial);

export const handleGradeTrainingQuiz = async (req: Request, res: Response) => {
  try {
    const {
      project_id,
      stage = "professional",
      answers = [],
      questions: incomingQuestions,
      is_preview,
      employer_id,
      employer_public_id,
      company_id,
      candidate_id,
      demo_user_id,
    } = req.body || {};

    if (!project_id) {
      return res.status(400).json({ error: "project_id is required" });
    }

    const db = await getProTalkDB();
    let questions: any[] = Array.isArray(incomingQuestions) ? incomingQuestions : [];
    const reqPass = Number(req.body?.pass_score);
    let passScore = Number.isFinite(reqPass) && reqPass > 0 ? reqPass : 70;
    let totalScore = Number(req.body?.total_score) || 100;

    const pStr = String(project_id);
    const cleanPid = pStr.replace(/^vac/i, "");
    const proj = await db.get(
      "SELECT id, public_id, company_id, employer_id, employer_public_id FROM projects WHERE id = ? OR CAST(public_id AS TEXT) = ? OR CAST(public_id AS TEXT) = ? OR slug = ? LIMIT 1",
      [pStr, pStr, cleanPid, pStr]
    );
    const candA = proj ? String(proj.id) : pStr;
    const candB = proj ? String(proj.public_id || proj.id) : cleanPid;
    const stageStr = String(stage).toLowerCase().trim();
    const stageAliases = stageStr === "system" || stageStr === "systems" ? ["systems", "system"] : [stageStr];
    const stagePlaceholders = stageAliases.map(() => "?").join(", ");

    const [existing, existingBlock] = await Promise.all([
      db.get(
        `SELECT * FROM training_stage_tests WHERE (project_id = ? OR project_id = ? OR project_id = ?) AND stage IN (${stagePlaceholders}) ORDER BY updated_at DESC LIMIT 1`,
        [candA, candB, pStr, ...stageAliases]
      ),
      db.get(
        `SELECT pass_score FROM training_blocks WHERE (project_id = ? OR project_id = ? OR project_id = ?) AND stage IN (${stagePlaceholders}) ORDER BY updated_at DESC LIMIT 1`,
        [candA, candB, pStr, ...stageAliases]
      ),
    ]);

    const dbTestPass = Number(existing?.passing_score ?? existing?.pass_score);
    const dbBlockPass = Number(existingBlock?.pass_score);
    if (Number.isFinite(dbTestPass) && dbTestPass > 0) {
      passScore = dbTestPass;
    } else if (Number.isFinite(dbBlockPass) && dbBlockPass > 0) {
      passScore = dbBlockPass;
    }

    if (existing) {
      totalScore = Number(existing.total_score || totalScore);
      if (questions.length === 0) {
        const rawQs = existing.questions || existing.questions_json;
        if (rawQs) {
          try {
            questions = typeof rawQs === "string" ? JSON.parse(rawQs) : rawQs;
          } catch {}
        }
      }
    }

    if (!Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({
        error: "Вопросы аттестации для этапа не найдены. Сначала сгенерируйте проверочный тест.",
      });
    }

    const ansMap = new Map<string, string>();
    if (Array.isArray(answers)) {
      for (const a of answers) {
        if (a && a.question_id != null) {
          ansMap.set(String(a.question_id), String(a.value || "").trim());
        }
      }
    }

    const aiBatch = questions.map((q: any, idx: number) => {
      const qId = String(q.id || `q${idx + 1}`);
      const pts = Number(q.points) || 5;
      const val = (ansMap.get(qId) || "").trim();
      const rawKind = String(q.kind || "").toLowerCase().trim();
      const kind =
        rawKind === "multichoice" || rawKind === "multiple_choice" || rawKind === "checkbox"
          ? "multichoice"
          : rawKind === "string" || rawKind === "line" || rawKind === "short_text"
          ? "string"
          : rawKind === "paragraph" || rawKind === "text" || rawKind === "long_text"
          ? "paragraph"
          : "choice";

      let correctInfo: any = "";
      if (kind === "choice") {
        correctInfo = q.correct || (Array.isArray(q.options) ? q.options.find((o: any) => o.is_correct)?.text || "" : "");
      } else if (kind === "multichoice") {
        const correctArr = Array.isArray(q.options) ? q.options.filter((o: any) => o.is_correct).map((o: any) => o.text) : [];
        correctInfo = correctArr.length ? correctArr : Array.isArray(q.correct) ? q.correct : [String(q.correct || "")];
      }

      return {
        id: qId,
        kind,
        question: q.question,
        options: Array.isArray(q.options) ? q.options.map((o: any) => (typeof o === "string" ? o : o.text)) : [],
        correct: correctInfo,
        expected: q.expected_answer || "",
        points: pts,
        answer: val,
      };
    });

    const isProMax = Boolean(req.body?.use_promax || req.body?.useProMax);
    const quizPromptKey = isProMax ? "training_stage_quiz_grade_promax" : "training_stage_quiz_grade";
    const quizPromptData = await getProTalkPrompt(quizPromptKey, undefined, isProMax);

    let chatId = "";
    if (is_preview) {
      const rawEmpId = await resolveEmployerPublicId(db, {
        employerId: employer_id,
        employerPublicId: employer_public_id,
        projectId: proj?.id || project_id,
        companyId: proj?.company_id || company_id,
      });
      chatId = await formatChatIdFromPrefix(quizPromptData.bot?.user_prefix || "{id}_RRschool", rawEmpId, "RRschool");
    } else if (candidate_id) {
      const candPubId = await resolveCandidate6DigitPublicId(candidate_id, db);
      const st = String(stage || req.body?.stage || "").toLowerCase();
      const sfx = st === "product" || st === "prod" ? "prod" : st === "professional" || st === "prof" ? "prof" : "system";
      chatId = `${candPubId}_${sfx}`;
    } else if (demo_user_id) {
      chatId = formatDemoChatId(demo_user_id, "RRschool");
    } else {
      const rawEmpId = await resolveEmployerPublicId(db, {
        employerId: employer_id,
        employerPublicId: employer_public_id,
        projectId: proj?.id || project_id,
        companyId: proj?.company_id || company_id,
      });
      chatId = await formatChatIdFromPrefix(quizPromptData.bot?.user_prefix || "{id}_RRschool", rawEmpId, "RRschool");
    }

    const fallbackUser = `Объективно проверь ответы на проверочный тест аттестации по этапу обучения «${stage}».
Правила: choice (сверяй с correct), multichoice (сверяй все выбранные с correct), string/paragraph (сверяй смысл и полноту с expected).
Вопросы и ответы:\n${JSON.stringify(aiBatch, null, 2)}
Верни строго валидный JSON без markdown и без капслока:
{"items":[{"id":"q1","score":5,"verdict":"correct","explanation":"...","what_was_right":"...","what_was_wrong":""}],"candidate_summary":"..."}`;

    const llmMessages = buildLlmMessagesFromPrompt(
      quizPromptData,
      { stage: String(stage), questions_json: JSON.stringify(aiBatch, null, 2) },
      fallbackUser
    );

    let rawReply = "";
    let parsed: any = null;
    try {
      rawReply = await callProTalkLLM("school", llmMessages, chatId, undefined, undefined, quizPromptKey, isProMax);
      parsed = tryParseLLMJson(rawReply);
    } catch (llmErr: any) {
      console.warn("[grade-training-quiz] ProTalk LLM notice:", llmErr?.message);
    }

    const itemsMap = new Map<string, any>();
    if (parsed && Array.isArray(parsed.items)) {
      for (const it of parsed.items) {
        if (it && it.id != null) itemsMap.set(String(it.id), it);
      }
    }

    const perQuestion = aiBatch.map((b) => {
      const it = itemsMap.get(b.id);
      if (it) {
        const score = Math.max(0, Math.min(b.points, Number(it.score) || 0));
        return {
          id: b.id,
          score,
          max: b.points,
          verdict: it.verdict === "correct" || it.verdict === "partial" ? it.verdict : score > 0 ? "partial" : "wrong",
          comment: String(it.explanation || "Ответ проверен").slice(0, 800),
          what_was_right: String(it.what_was_right || "").slice(0, 500),
          what_was_wrong: String(it.what_was_wrong || "").slice(0, 500),
        };
      }

      let fallbackScore = 0;
      let verdict: "correct" | "partial" | "wrong" = "wrong";
      let rightText = "";
      let wrongText = "";

      if (b.kind === "choice") {
        const isMatch = b.answer && b.correct && String(b.answer).trim().toLowerCase() === String(b.correct).trim().toLowerCase();
        if (isMatch) {
          fallbackScore = b.points;
          verdict = "correct";
          rightText = "Выбран правильный вариант ответа";
        } else {
          wrongText = b.answer ? "Выбран неверный вариант" : "Ответ не был выбран";
        }
      } else if (b.kind === "multichoice") {
        let selectedArr: string[] = [];
        try {
          const p = JSON.parse(b.answer);
          if (Array.isArray(p)) selectedArr = p;
        } catch {
          if (b.answer) selectedArr = b.answer.split(",").map((s: string) => s.trim()).filter(Boolean);
        }
        const correctArr = Array.isArray(b.correct) ? b.correct : [String(b.correct || "")];
        const correctCount = selectedArr.filter((s) => correctArr.some((c: string) => c.toLowerCase() === s.toLowerCase())).length;
        const wrongCount = selectedArr.filter((s) => !correctArr.some((c: string) => c.toLowerCase() === s.toLowerCase())).length;
        if (correctCount === correctArr.length && wrongCount === 0) {
          fallbackScore = b.points;
          verdict = "correct";
          rightText = "Выбраны все верные варианты";
        } else if (correctCount > 0 && wrongCount === 0) {
          fallbackScore = Math.round((b.points * correctCount) / correctArr.length);
          verdict = "partial";
          rightText = "Часть правильных вариантов выбрана";
          wrongText = "Не все верные варианты отмечены";
        } else {
          wrongText = "Выбраны неверные варианты";
        }
      } else if (b.kind === "string") {
        const userTrim = b.answer.trim().toLowerCase();
        const expTrim = String(b.expected || "").trim().toLowerCase();
        if (userTrim && expTrim && (userTrim.includes(expTrim) || expTrim.includes(userTrim))) {
          fallbackScore = b.points;
          verdict = "correct";
          rightText = "Ключевой термин или стандарт указан верно";
        } else if (userTrim.length > 2) {
          fallbackScore = Math.max(1, Math.round(b.points * 0.5));
          verdict = "partial";
          rightText = "Ответ предоставлен по теме";
          wrongText = "Формулировка отличается от стандарта этапа";
        } else {
          wrongText = "Ответ не указан или неполон";
        }
      } else {
        const userTrim = b.answer.trim();
        if (userTrim.length > 50) {
          fallbackScore = b.points;
          verdict = "correct";
          rightText = "Развернутый и содержательный ответ";
        } else if (userTrim.length > 15) {
          fallbackScore = Math.max(1, Math.round(b.points * 0.6));
          verdict = "partial";
          rightText = "Краткий ответ предоставлен";
          wrongText = "Рекомендуется раскрыть мысль более подробно";
        } else {
          wrongText = "Ответ слишком краток или не заполнен";
        }
      }

      return {
        id: b.id,
        score: fallbackScore,
        max: b.points,
        verdict,
        comment: verdict === "correct" ? "Ответ правильный" : verdict === "partial" ? "Ответ частично правильный" : "Требуется доработка ответа",
        what_was_right: rightText,
        what_was_wrong: wrongText,
      };
    });

    const rawEarned = perQuestion.reduce((sum, item) => sum + (Number(item.score) || 0), 0);
    const maxPossible = perQuestion.reduce((sum, item) => sum + (Number(item.max) || 0), 0);
    const totalEarned =
      maxPossible > 0 && Math.abs(maxPossible - totalScore) > 0.5
        ? Math.min(Math.round(totalScore), Math.round((rawEarned / maxPossible) * totalScore))
        : Math.min(Math.round(totalScore), Math.round(rawEarned));
    const passed = totalEarned >= passScore;

    let extractedSummary =
      typeof parsed?.candidate_summary === "string"
        ? parsed.candidate_summary.trim()
        : typeof parsed?.summary === "string"
        ? parsed.summary.trim()
        : "";
    if (!extractedSummary && rawReply) {
      const m = rawReply.match(/"candidate_summary"\s*:\s*"((?:[^"\\]|\\.)*)"/s);
      if (m && m[1]) extractedSummary = m[1].replace(/\\n/g, " ").replace(/\\"/g, '"').trim();
    }

    const candidateSummary =
      extractedSummary ||
      (passed
        ? `Аттестация успешно пройдена с результатом ${totalEarned} из ${totalScore} баллов.`
        : `Аттестация пока не сдана: набрано ${totalEarned} из ${totalScore} баллов при проходном балле ${passScore}.`);

    if (!is_preview && candidate_id) {
      try {
        await db.run(
          `INSERT INTO candidate_stage_progress (candidate_id, stage, last_score, best_score, attempts, last_feedback, last_answers, candidate_summary, passed_at, updated_at)
           VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, NOW())
           ON CONFLICT (candidate_id, stage) DO UPDATE SET
             last_score = EXCLUDED.last_score,
             best_score = GREATEST(COALESCE(candidate_stage_progress.best_score, 0), EXCLUDED.last_score),
             attempts = COALESCE(candidate_stage_progress.attempts, 0) + 1,
             last_feedback = EXCLUDED.last_feedback,
             last_answers = EXCLUDED.last_answers,
             candidate_summary = EXCLUDED.candidate_summary,
             passed_at = CASE WHEN EXCLUDED.last_score >= ? THEN COALESCE(candidate_stage_progress.passed_at, NOW()) ELSE candidate_stage_progress.passed_at END,
             updated_at = NOW()`,
          [
            String(candidate_id),
            String(stage),
            totalEarned,
            totalEarned,
            JSON.stringify(perQuestion),
            JSON.stringify(answers || []),
            candidateSummary,
            passed ? new Date().toISOString() : null,
            Math.round(passScore),
          ]
        );
        const progRow = await db.get(
          `SELECT attempts FROM candidate_stage_progress WHERE candidate_id = ? AND stage = ? LIMIT 1`,
          [String(candidate_id), String(stage)]
        );
        const attemptNo = Number(progRow?.attempts) || 1;
        await db.run(
          `INSERT INTO candidate_training_attempts (id, candidate_id, project_id, stage, attempt_no, score, total_score, pass_score, passed, answers, feedback, protalk_chat_id, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
          [
            crypto.randomUUID(),
            String(candidate_id),
            project_id ? String(project_id) : null,
            String(stage),
            attemptNo,
            totalEarned,
            Math.round(totalScore),
            Math.round(passScore),
            passed ? 1 : 0,
            JSON.stringify(answers || []),
            JSON.stringify({ per_question: perQuestion, candidate_summary: candidateSummary }),
            chatId || null,
          ]
        );

        const cleanCandId = String(candidate_id).replace(/^candidate/i, "").trim();
        const candRow = await db.get(
          "SELECT * FROM candidates WHERE id = ? OR CAST(public_id AS TEXT) = ? OR id = ? OR CAST(public_id AS TEXT) = ? LIMIT 1",
          [String(candidate_id), String(candidate_id), cleanCandId, cleanCandId]
        );
        const effPid = project_id || candRow?.project_id;
        const alreadyChargedTraining = Boolean(candRow?.training_charged_at);

        if (String(stage).toLowerCase() === "professional" && !alreadyChargedTraining && effPid && candRow) {
          await db.run(`UPDATE projects SET training_used = COALESCE(training_used, 0) + 1, updated_at = NOW() WHERE id = ?`, [
            String(effPid),
          ]);
          await db.run(`UPDATE candidates SET training_charged_at = COALESCE(NULLIF(training_charged_at, ''), CAST(NOW() AS TEXT)) WHERE id = ?`, [candRow.id]);
          try {
            const { checkVacancyLowLimits } = await import("../../services/notifications/lowBalanceNotifier");
            await checkVacancyLowLimits(db, String(effPid));
          } catch {}
        }

        if (candRow) {
          const { isStageManual, normalizeCrmStageName, pickMonotonicCrmStage } = await import(
            "../../services/crmReconciler"
          );
          const normStage = normalizeCrmStageName(stage);
          const allStageRows =
            (await db.all(
              `SELECT stage, last_score, best_score, passed_at FROM candidate_stage_progress WHERE candidate_id = ?`,
              [candRow.id]
            )) || [];
          const passedSet = new Set<string>();
          const scoreByMod: Record<string, number> = {};
          for (const r of allStageRows) {
            const stKey = normalizeCrmStageName(r.stage);
            const bestVal = r.best_score != null ? Number(r.best_score) : r.last_score != null ? Number(r.last_score) : null;
            if (bestVal !== null && !Number.isNaN(bestVal)) {
              scoreByMod[stKey] = Math.round(bestVal);
            }
            if (r.passed_at != null || (bestVal !== null && bestVal >= 70)) {
              passedSet.add(stKey);
            }
          }
          if (passed) passedSet.add(normStage);
          scoreByMod[normStage] = Math.max(scoreByMod[normStage] ?? 0, Math.round(totalEarned));

          const all3Passed =
            passedSet.has("professional") && passedSet.has("product") && passedSet.has("systems");

          let finalCrmStage = candRow.crm_stage || candRow.stage || candRow.current_stage || "professional";
          if (!isStageManual(candRow.crm_stage_manual)) {
            let candidateTarget = candRow.crm_stage || "professional";
            if (passed) {
              if (all3Passed) candidateTarget = "certified";
              else if (normStage === "systems") candidateTarget = "systems";
              else if (normStage === "product") candidateTarget = "product";
              else candidateTarget = "professional";
            } else if (normStage === "product" || normStage === "systems" || normStage === "professional") {
              candidateTarget = normStage;
            }
            finalCrmStage = pickMonotonicCrmStage(
              candRow.crm_stage || candRow.stage || candRow.current_stage,
              candidateTarget
            );
            await db.run(
              `UPDATE candidates SET crm_stage = ?, stage = ?, current_stage = ?, updated_at = NOW() WHERE id = ?`,
              [finalCrmStage, finalCrmStage, finalCrmStage, candRow.id]
            );
          }

          try {
            const { dispatchUserNotification, isChannelEnabledForEvent } = await import(
              "../../services/push/pushService"
            );
            const candPub = candRow.public_id || candRow.id;
            const candName = candRow.full_name || candRow.email || `Кандидат #${candPub}`;
            const stageLabel =
              normStage === "product"
                ? "Этап 2: Продукт"
                : normStage === "systems"
                ? "Этап 3: Системы"
                : "Этап 1: Профессия";

            const projForNotif = effPid
              ? await db.get(
                  "SELECT id, employer_id, responsible_employer_id, responsible_employer_ids, company_id, role_name, interview_pass_score FROM projects WHERE id = ? LIMIT 1",
                  [String(effPid)]
                )
              : null;
            const passThreshold = Number(projForNotif?.interview_pass_score ?? 70);
            const hasPassedInterview = Boolean(
              (candRow.overall_score != null && Number(candRow.overall_score) >= passThreshold) ||
                ["interview_success", "professional", "product", "systems", "certified"].includes(
                  String(candRow.crm_stage || "").toLowerCase()
                ) ||
                ["training", "certified"].includes(String(candRow.current_stage || "").toLowerCase()) ||
                finalCrmStage === "certified"
            );
            const isCert = (all3Passed && hasPassedInterview) || finalCrmStage === "certified";

            // Candidate alert
            await dispatchUserNotification(db, {
              ownerType: "candidate",
              ownerIds: [String(candRow.id), String(candPub)],
              eventKey: isCert ? "certificate_issued" : "training_progress",
              kind: isCert ? "certificate" : "training",
              title: isCert
                ? "Электронный сертификат выдан!"
                : passed
                ? `Аттестация пройдена: ${stageLabel}`
                : `Результат теста: ${stageLabel}`,
              body: isCert
                ? "Поздравляем! Вы успешно прошли все 3 этапа обучения и получили электронный сертификат."
                : `Результат теста (${stageLabel}): ${totalEarned} из ${Math.round(totalScore)} баллов.`,
              link: `/cand${candPub}/profile`,
              meta: { candidate_id: String(candPub), stage: normStage, score: totalEarned, passed, certified: isCert },
              candidateId: String(candRow.id),
            });

            // Employer alerts across all selected vacancy responsibles
            const { dispatchVacancyBellAndPushToResponsibles } = await import(
              "../../services/notifications/vacancyResponsiblesResolver"
            );
            const vacName = projForNotif?.role_name || "Вакансия";
            const modSummary = `Профессия: ${scoreByMod.professional ?? "—"} · Продукт: ${
              scoreByMod.product ?? "—"
            } · Системы: ${scoreByMod.systems ?? "—"}`;

            // 1) Training progress notification (attempt & stage scores)
            const { primaryLink: trainLink, responsibles: trainResp } = await dispatchVacancyBellAndPushToResponsibles(
              db,
              {
                projectId: effPid || null,
                projRow: projForNotif,
                fallbackEmpId: candRow.employer_id || null,
                eventKey: "training_progress",
                kind: "training",
                title: `Обучение (${stageLabel}): ${candName}`,
                body: `Вакансия «${vacName}». ${totalEarned}/${Math.round(totalScore)} (${
                  passed ? "Сдан" : "Не сдан"
                }). Баллы: ${modSummary}.`,
                linkBuilder: (pub) => `/emp${pub}/crm?candidate=${encodeURIComponent(String(candPub))}`,
                meta: {
                  candidate_id: String(candPub),
                  stage: normStage,
                  score: totalEarned,
                  passed,
                  scores: scoreByMod,
                },
              }
            );

            if (effPid && trainResp.length > 0) {
              const { sendVacancyTelegramNotification } = await import("../../services/telegram");
              await sendVacancyTelegramNotification(
                db,
                String(effPid),
                `🎓 <b>Прохождение этапа обучения</b>\n👤 ${candName}\n💼 Вакансия: ${vacName}\n📘 ${stageLabel}\n📊 Текущий тест: <b>${totalEarned}/${Math.round(
                  totalScore
                )}</b> (${passed ? "Сдан" : "Не сдан"})\n📈 Модули — ${modSummary}`,
                {
                  eventKey: "training_progress",
                  dedupKey: `train_${candPub}_${normStage}_${attemptNo || totalEarned}`,
                  button: { text: "🎓 Открыть обучение в CRM", url: trainLink },
                }
              );
            }

            // 2) Certificate ready notification (interview + all 3 training stages passed)
            if (isCert) {
              const { primaryLink: certLink, responsibles: certResp } = await dispatchVacancyBellAndPushToResponsibles(
                db,
                {
                  projectId: effPid || null,
                  projRow: projForNotif,
                  fallbackEmpId: candRow.employer_id || null,
                  eventKey: "certificate_ready",
                  kind: "certificate",
                  title: `Сертификат Готов: ${candName}`,
                  body: `Вакансия «${vacName}». Кандидат успешно прошёл ИИ-интервью и все 3 этапа обучения (${modSummary}).`,
                  linkBuilder: (pub) => `/emp${pub}/crm?candidate=${encodeURIComponent(String(candPub))}`,
                  meta: {
                    candidate_id: String(candPub),
                    certified: true,
                    scores: scoreByMod,
                  },
                }
              );

              if (effPid && certResp.length > 0) {
                const { sendVacancyTelegramNotification } = await import("../../services/telegram");
                await sendVacancyTelegramNotification(
                  db,
                  String(effPid),
                  `🏆 <b>Сертификат Готов!</b>\n👤 ${candName}\n💼 Вакансия: ${vacName}\n✅ Интервью и все 3 этапа обучения успешно пройдены.\n📈 Баллы — ${modSummary}`,
                  {
                    eventKey: "certificate_ready",
                    dedupKey: `cert_${candPub}`,
                    button: { text: "🏆 Открыть сертификат в CRM", url: certLink },
                  }
                );
              }
            }
          } catch {}
        }
      } catch (dbErr) {
        console.warn("[grade-training-quiz] Candidate progress write notice:", dbErr);
      }
    }

    return res.json({
      ok: true,
      score: totalEarned,
      total_score: totalScore,
      pass_score: passScore,
      passed,
      per_question: perQuestion,
      candidate_summary: candidateSummary,
      is_preview: Boolean(is_preview),
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Ошибка проверки теста" });
  }
};

trainingAndAssistantRouter.post(["/grade-training-quiz", "/ai-grade-training-quiz"], handleGradeTrainingQuiz);

trainingAndAssistantRouter.post("/voice/stt", async (req: Request, res: Response) => {
  try {
    const {
      audio_base64,
      mime_type,
      employer_id,
      employer_public_id,
      candidate_id,
      demo_user_id,
      company_id,
      project_id,
    } = req.body || {};
    if (!audio_base64) return res.status(400).json({ success: false, error: "no_audio_data" });

    const cleanBase64 = audio_base64.includes(",") ? audio_base64.split(",")[1] : audio_base64.replace(/^data:[^;]+;base64,/, "");
    const buffer = Buffer.from(cleanBase64, "base64");
    const mime = mime_type || "audio/webm";

    const formData = new FormData();
    formData.append("file", new Blob([buffer], { type: mime }), "voice_message.webm");
    const uploadRes = await fetch("https://file.pro-talk.ru/upload_tmp", { method: "POST", headers: { Accept: "application/json" }, body: formData });
    if (!uploadRes.ok) {
      return res.status(502).json({ success: false, error: "upload_failed", details: await uploadRes.text() });
    }
    const uploadData = await uploadRes.json().catch(() => ({}));
    const fileUrl = uploadData?.data?.url || uploadData?.url;
    if (!fileUrl) return res.status(502).json({ success: false, error: "no_file_url_returned" });

    const sttRes = await fetch(`https://api.pro-talk.ru/api/v1.0/stt_from_widget?url=${encodeURIComponent(fileUrl)}`);
    if (!sttRes.ok) return res.status(502).json({ success: false, error: "stt_transcribe_failed", file_url: fileUrl });
    const sttData = await sttRes.json().catch(() => ({}));
    const transcribedText = sttData?.text || "";

    let dbInstance: any = null;
    try {
      dbInstance = await getProTalkDB();
      if (dbInstance) {
        const voiceFolder = await dbInstance.get("SELECT id FROM file_folders WHERE id = 3 OR name = 'Голосовые' LIMIT 1");
        let folderId = voiceFolder ? voiceFolder.id : 3;
        if (!voiceFolder) {
          await dbInstance
            .run("INSERT INTO file_folders (id, name, color) VALUES (3, 'Голосовые', '#E7C768') ON CONFLICT (id) DO NOTHING")
            .catch(() => {});
        }
        const now = new Date();
        const pad = (n: number) => String(n).padStart(2, "0");
        const formattedName = `VoiseSite_${now.getFullYear()}_${pad(now.getMonth() + 1)}_${pad(now.getDate())}_${pad(now.getHours())}_${pad(now.getMinutes())}_${pad(now.getSeconds())}`;
        const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
        let fileKey = "";
        for (let i = 0; i < 8; i++) fileKey += chars.charAt(Math.floor(Math.random() * chars.length));

        await dbInstance.run(
          `INSERT INTO file_storage (file_key, name, filename, url, original_url, mime_type, size_bytes, file_size, folder_id, owner_id, description)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [fileKey, formattedName, `${formattedName}.webm`, fileUrl, fileUrl, mime, buffer.length, buffer.length, folderId, 169262990, "Запись голоса с сайта"]
        );
      }
    } catch (dbErr) {
      console.warn("[Voice Save DB Error]:", dbErr);
    }

    let sttChannelId = "100007_RRaudio";
    let sttSocialId = "100007";
    if (candidate_id) {
      const candPubId = await resolveCandidate6DigitPublicId(candidate_id, dbInstance);
      sttChannelId = `${candPubId}_RRaudio`;
      sttSocialId = candPubId;
    } else if (demo_user_id) {
      sttChannelId = formatDemoChatId(demo_user_id, "RRaudio");
      sttSocialId = extractUserSocialId(sttChannelId);
    } else if (employer_id || employer_public_id || company_id || project_id) {
      const resolvedEmp = await resolveEmployerPublicId(dbInstance, {
        employerId: employer_id,
        employerPublicId: employer_public_id,
        companyId: company_id,
        projectId: project_id,
      });
      sttChannelId = formatEmployerChatId(resolvedEmp, "RRaudio");
      sttSocialId = resolvedEmp;
    }

    await saveAILog({
      channel_id: sttChannelId,
      user_social_id: sttSocialId,
      user_message: `[STT] Распознавание голосового сообщения: ${fileUrl}`,
      bot_reply: transcribedText || "(пусто)",
      channel_name: "voice_stt",
      bot_id: "66337",
      llm: "stt_from_widget",
      tokens_in_source: Math.max(10, Math.ceil(String(fileUrl || "").length / 3)),
      tokens_out_source: Math.ceil(String(transcribedText || "").length / 3),
      server_name: "ProTalk_STT",
    });

    res.json({ success: true, text: transcribedText, file_url: fileUrl });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || "internal_server_error" });
  }
});

trainingAndAssistantRouter.post("/voice-demo/company", async (req: Request, res: Response) => {
  try {
    const { text, demo_id, use_promax } = req.body || {};
    if (!text || !text.trim()) return res.status(400).json({ error: "Введите или наговорите описание компании" });

    const numericPart = String(demo_id || "").replace(/\D/g, "") || "987654";
    const sixDigits = numericPart.length >= 6 ? numericPart.slice(-6) : numericPart.padStart(6, "0");
    const chatId = `demo${sixDigits}_RRaudio`;
    const isProMax = Boolean(use_promax || req.body?.useProMax);
    const promptKey = isProMax ? "voice_company_card_promax" : "voice_company_card";

    const rawResponse = await callProTalkLLM(
      "company",
      [
        {
          role: "user",
          content: `ОПИСАНИЕ КОМПАНИИ ОТ ПОЛЬЗОВАТЕЛЯ:\n"${text.trim()}"\n\nСформируй и верни СТРОГО валидный JSON (company_name, industry, tagline, description, key_advantages, corporate_values, ai_summary).`,
        },
      ],
      chatId,
      undefined,
      undefined,
      promptKey,
      isProMax
    );
    const parsedJson = tryParseLLMJson(rawResponse) || {};
    const cardResult = extractSmartCompanyResult(text, rawResponse, parsedJson);

    res.json({ success: true, chat_id: chatId, social_id: sixDigits, result: cardResult });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Ошибка обработки распознанного текста" });
  }
});

trainingAndAssistantRouter.post("/voice-demo/sales-objection", async (req: Request, res: Response) => {
  try {
    const { text, demo_id, use_promax } = req.body || {};
    if (!text || !text.trim()) return res.status(400).json({ error: "Введите или наговорите ответ кандидату на возражение" });

    const numericPart = String(demo_id || "").replace(/\D/g, "") || "987654";
    const sixDigits = numericPart.length >= 6 ? numericPart.slice(-6) : numericPart.padStart(6, "0");
    const chatId = `demo${sixDigits}_RRaudio`;
    const isProMax = Boolean(use_promax || req.body?.useProMax);
    const promptKey = isProMax ? "voice_sales_objection_promax" : "voice_sales_objection";

    const rawResponse = await callProTalkLLM(
      "school",
      [
        {
          role: "user",
          content: `КОНТЕКСТ: Менеджер по продажам B2B ИИ-системы "Робот Рекрутер" (годовая лицензия 350 000 руб.). Клиент возражает: "У вас слишком дорого, у конкурентов на 30% дешевле!"\nОТВЕТ КАНДИДАТА:\n"${text.trim()}"\nОцени по 100-балльной шкале и верни СТРОГО JSON: score, score_plus_points, score_minus_points, verdict, strengths, gaps, script_recommendation, ai_feedback.`,
        },
      ],
      chatId,
      undefined,
      undefined,
      promptKey,
      isProMax
    );
    const parsedJson = tryParseLLMJson(rawResponse) || {};
    const score = typeof parsedJson.score === "number" ? Math.min(100, Math.max(0, Math.round(parsedJson.score))) : 85;

    const evalResult = {
      score,
      score_plus_points:
        Array.isArray(parsedJson.score_plus_points) && parsedJson.score_plus_points.length > 0
          ? parsedJson.score_plus_points
          : ["+35 баллов: Грамотное присоединение к клиенту без спора", "+30 баллов: Применение абстрактной версии о рынке", "+20 баллов: Вывод диалога на окупаемость продукта"],
      score_minus_points:
        Array.isArray(parsedJson.score_minus_points) && parsedJson.score_minus_points.length > 0
          ? parsedJson.score_minus_points
          : score < 100
          ? ["-15 баллов: Отсутствует вовлекающий фиксирующий вопрос в конце спича"]
          : [],
      verdict: parsedJson.verdict || (score >= 80 ? "Зачет: Грамотная отработка по 3-этапной технике" : "Требует доработки: Отклонение от структуры"),
      strengths:
        Array.isArray(parsedJson.strengths) && parsedJson.strengths.length > 0
          ? parsedJson.strengths
          : ["Уверенное присоединение к позиции клиента", "Аргументация реальной окупаемости продукта"],
      gaps:
        Array.isArray(parsedJson.gaps) && parsedJson.gaps.length > 0
          ? parsedJson.gaps
          : ["Рекомендуется завершать ответ вовлекающим вопросом на согласие"],
      script_recommendation:
        parsedJson.script_recommendation ||
        "«Понимаю вас, вопрос бюджета всегда на первом месте. Действительно, на рынке есть более дешевые решения, но ключевое различие — в точности распознавания и окупаемости. Скажите, если мы рассчитаем, за сколько недель система окупает эту разницу, вам было бы интересно взглянуть на расчет?»",
      ai_feedback: parsedJson.ai_feedback || "Оценка выполнена Роботом Рекрутером по 100-балльной системе.",
    };

    res.json({ success: true, chat_id: chatId, social_id: sixDigits, result: evalResult });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Ошибка оценки ответа нейросетью" });
  }
});

import { handleAiAssistantChat } from "../../aiHelpers/assistantChat";

trainingAndAssistantRouter.post("/ai-assistant-chat", handleAiAssistantChat);

