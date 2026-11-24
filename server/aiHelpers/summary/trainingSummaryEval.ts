import crypto from "crypto";
import { Request, Response } from "express";
import { callProTalkLLM, getProTalkPrompt } from "../../services/protalkAi";
import { tryParseLLMJson } from "../../services/utils";
import { formatChatIdFromPrefix, resolveCandidate6DigitPublicId } from "../../services/chatIdHelpers";
import { getProTalkDB } from "../../db";
import { candidateAiJobStore, buildLlmMessagesFromPrompt, storeFailedAiJob } from "../common";

function safeParseJson(val: any): any {
  if (!val) return null;
  if (typeof val === "object") return val;
  try {
    return JSON.parse(String(val));
  } catch {
    return null;
  }
}

function normalizeStageKey(raw: string): "professional" | "product" | "system" | null {
  const s = String(raw || "").toLowerCase();
  if (s.includes("prof") || s.includes("профес")) return "professional";
  if (s.includes("prod") || s.includes("продукт")) return "product";
  if (s.includes("sys") || s.includes("систем")) return "system";
  return null;
}

function extractSummaryText(feedback: any, fallbackText = ""): string {
  if (!feedback) return fallbackText;
  if (typeof feedback === "string") return feedback.trim() || fallbackText;
  if (typeof feedback === "object") {
    const parts: string[] = [];
    if (feedback.summary) parts.push(String(feedback.summary));
    if (feedback.verdict) parts.push(`Вердикт: ${feedback.verdict}`);
    if (feedback.recommendation) parts.push(`Рекомендация: ${feedback.recommendation}`);
    if (Array.isArray(feedback.strengths) && feedback.strengths.length > 0) {
      parts.push(`Сильные стороны: ${feedback.strengths.slice(0, 4).join("; ")}`);
    }
    if (Array.isArray(feedback.gaps) && feedback.gaps.length > 0) {
      parts.push(`Зоны роста: ${feedback.gaps.slice(0, 3).map((g: any) => (typeof g === "string" ? g : g?.criterion || g?.finding || "")).filter(Boolean).join("; ")}`);
    }
    return parts.join(" | ") || fallbackText;
  }
  return fallbackText;
}

export const handleEvaluateTrainingSummaryV2 = async (req: Request, res: Response) => {
  try {
    const body = req.body || {};
    const candidate_id = body.candidate_id || body.candidateId || body.id;
    const isProMax = Boolean(body.use_promax || body.useProMax);
    if (!candidate_id) {
      return res.status(400).json({ ok: false, error: "missing_candidate_id" });
    }

    const db = await getProTalkDB();
    const rawId = String(candidate_id).trim();
    const cleanId = rawId.replace(/^candidate/i, "").replace(/^cand/i, "").trim();
    const cand = await db.get(
      `SELECT * FROM candidates
       WHERE id = ? OR CAST(public_id AS TEXT) = ? OR id = ? OR CAST(public_id AS TEXT) = ?
       LIMIT 1`,
      [rawId, cleanId, cleanId, rawId]
    );
    if (!cand) {
      return res.status(404).json({ ok: false, error: "candidate_not_found" });
    }

    const [proj, scoreRow, stageProgressRows, attemptRows] = await Promise.all([
      cand.project_id
        ? db.get(
            `SELECT p.*, c.name AS company_real_name
             FROM projects p LEFT JOIN companies c ON p.company_id = c.id
             WHERE p.id = ? OR CAST(p.public_id AS TEXT) = ?
             LIMIT 1`,
            [String(cand.project_id), String(cand.project_id)]
          )
        : Promise.resolve(null),
      db.get(`SELECT * FROM candidate_scores WHERE candidate_id = ? OR candidate_id = ? LIMIT 1`, [
        cand.id,
        String(cand.public_id || ""),
      ]),
      db.all(`SELECT * FROM candidate_stage_progress WHERE candidate_id = ? OR candidate_id = ?`, [
        cand.id,
        String(cand.public_id || ""),
      ]),
      db.all(
        `SELECT stage, score, total_score, passed, feedback, created_at
         FROM candidate_training_attempts
         WHERE candidate_id = ? OR candidate_id = ?
         ORDER BY created_at DESC`,
        [cand.id, String(cand.public_id || "")]
      ),
    ]);

    const sc = scoreRow || {};
    const resScore = sc.resume_score ?? cand.resume_score ?? null;
    const chkScore = sc.checklist_score ?? cand.checklist_score ?? null;
    const sitScore = sc.situations_score ?? cand.situations_score ?? null;
    const ovrScore = sc.overall_score ?? cand.overall_score ?? cand.score ?? null;

    const stageMap: Record<"professional" | "product" | "system", {
      label: string;
      passed: boolean;
      score: number | null;
      summary: string;
    }> = {
      professional: { label: "Профессия", passed: false, score: null, summary: "" },
      product: { label: "Продукт", passed: false, score: null, summary: "" },
      system: { label: "Система", passed: false, score: null, summary: "" },
    };

    for (const sp of stageProgressRows || []) {
      const k = normalizeStageKey(sp.stage);
      if (!k) continue;
      const empSum = safeParseJson(sp.employer_summary) || safeParseJson(sp.last_feedback);
      const passed = Boolean(sp.passed_at) || String(sp.status || "").toLowerCase() === "passed";
      const stScore = sp.best_score ?? sp.last_score ?? null;
      stageMap[k] = {
        label: stageMap[k].label,
        passed: stageMap[k].passed || passed,
        score: stScore != null ? Number(stScore) : stageMap[k].score,
        summary: extractSummaryText(empSum) || stageMap[k].summary,
      };
    }

    for (const att of attemptRows || []) {
      const k = normalizeStageKey(att.stage);
      if (!k) continue;
      const attFb = safeParseJson(att.feedback);
      const attScore = att.score != null ? Number(att.score) : null;
      const passed = Boolean(att.passed === 1 || att.passed === true);
      if (passed) stageMap[k].passed = true;
      if (stageMap[k].score === null && attScore !== null) stageMap[k].score = attScore;
      if (!stageMap[k].summary && attFb) stageMap[k].summary = extractSummaryText(attFb);
    }

    const isCertified = String(cand.crm_stage || cand.stage || cand.current_stage || "").toLowerCase() === "certified";
    const allTrainingPassed =
      isCertified || (stageMap.professional.passed && stageMap.product.passed && stageMap.system.passed);
    const hasInterviewData =
      resScore != null || chkScore != null || sitScore != null || ovrScore != null || isCertified;

    if (!hasInterviewData || !allTrainingPassed) {
      return res.status(400).json({
        ok: false,
        error: "stages_not_completed",
        message: "Итог формируется только после прохождения всех этапов интервью и всех этапов обучения.",
      });
    }

    const resumeSummary = extractSummaryText(
      safeParseJson(sc.resume_feedback) || safeParseJson(cand.resume_ai_feedback),
      String(sc.assessment_summary || cand.notes || "")
    );
    const checklistSummary = extractSummaryText(
      safeParseJson(sc.checklist_feedback) || safeParseJson(cand.checklist_ai_feedback)
    );
    const situationsSummary = extractSummaryText(
      safeParseJson(sc.situations_feedback) || safeParseJson(cand.situations_ai_feedback)
    );
    const overallSummary = extractSummaryText(
      safeParseJson(sc.employer_overall_feedback) || safeParseJson(cand.ai_overall_summary)
    );

    const interviewSummariesText = [
      `1. Скрининг резюме: балл ${resScore ?? "—"}/100. Саммари: ${resumeSummary || "Этап пройден."}`,
      `2. Чек-лист / Анкета: балл ${chkScore ?? "—"}/100. Саммари: ${checklistSummary || "Этап пройден."}`,
      `3. Ролевые ситуации: балл ${sitScore ?? "—"}/100. Саммари: ${situationsSummary || "Этап пройден."}`,
      `4. Общая оценка интервью: средний балл ${ovrScore ?? "—"}/100. Заключение: ${overallSummary || "Успешно."}`,
    ].join("\n");

    const trainingSummariesText = (["professional", "product", "system"] as const)
      .map((k, idx) => {
        const st = stageMap[k];
        return `${idx + 1}. Этап обучения «${st.label}»: статус ${st.passed ? "пройден" : "в процессе"}, балл ${st.score ?? "—"}/100. Саммари этапа: ${st.summary || "Тестирование и материал освоены."}`;
      })
      .join("\n");

    const candName = cand.full_name || cand.resume_name || cand.name || "Соискатель";
    const roleName = proj?.role_name || cand.role_name || "Специалист";
    const companyName = proj?.company_real_name || proj?.company_name || "Компания";

    const promptKey = isProMax ? "training_summary_evaluation_promax" : "training_summary_evaluation";
    const promptData = await getProTalkPrompt(promptKey, undefined, isProMax);
    const userPrefix = promptData.bot?.user_prefix || "{id}_RRschool";
    const candPubId = await resolveCandidate6DigitPublicId(cand.id, db);
    const chatId = await formatChatIdFromPrefix(userPrefix, candPubId, "RRschool");

    const fallbackUserPrompt = `Кандидат: ${candName}
Должность: ${roleName}
Компания: ${companyName}

Саммари этапов интервью:
${interviewSummariesText}

Саммари этапов обучения:
${trainingSummariesText}

На основании только этих саммари сформируй итоговый отчет по обучению и отбору строго в JSON-формате (без капслока):
{
  "score": 0..100,
  "data_completeness": 100,
  "verdict": "Краткий вердикт",
  "summary": "Связный итоговый вывод по интервью и обучению (4-6 предложений)",
  "completed_stages": ["Резюме", "Чек-лист", "Ситуации", "Профессия", "Продукт", "Система"],
  "missing_stages": [],
  "mastered_topics": ["Ключевая сильная компетенция 1", "Ключевая сильная компетенция 2"],
  "weak_topics": ["Зона для внимания на адаптации"],
  "risks": [{"title": "Риск при наличии", "evidence": "Основание из саммари", "severity": "low"}],
  "red_flags": [],
  "revision_plan": ["Рекомендация на первую неделю работы"],
  "readiness": "Оценка готовности к самостоятельной работе",
  "recommendation": "Итоговая рекомендация для руководителя"
}`;

    const llmMessages = buildLlmMessagesFromPrompt(
      promptData,
      {
        candidate_name: candName,
        role_name: roleName,
        company_name: companyName,
        interview_summaries: interviewSummariesText,
        training_summaries: trainingSummariesText,
      },
      fallbackUserPrompt
    );

    let aiText = "";
    try {
      aiText = await callProTalkLLM("school", llmMessages, chatId, undefined, undefined, promptKey, isProMax);
    } catch (err: any) {
      const failedJobId = storeFailedAiJob(err, "training_summary", req.body, cand.id);
      return res.status(502).json({
        ok: false,
        job_id: failedJobId,
        retryable: true,
        error: `Ошибка вызова нейросети: ${err?.message || "ИИ временно недоступен"}. Попробуйте повторить с RR ProMax.`,
      });
    }

    const parsedRaw = tryParseLLMJson<any>(aiText);
    const parsed = parsedRaw && typeof parsedRaw === "object" ? parsedRaw : {};
    const stageScores = [stageMap.professional.score, stageMap.product.score, stageMap.system.score].filter(
      (n): n is number => n !== null && Number.isFinite(n)
    );
    const avgTrainingScore =
      stageScores.length > 0 ? Math.round(stageScores.reduce((a, b) => a + b, 0) / stageScores.length) : 85;

    const rawScore =
      parsed.score ??
      parsed["балл"] ??
      parsed["итоговый балл"] ??
      parsed["оценка"];
    const finalScore =
      rawScore !== undefined && Number.isFinite(Number(rawScore))
        ? Math.max(0, Math.min(100, Math.round(Number(rawScore))))
        : avgTrainingScore;

    const toStrList = (v: any): string[] =>
      Array.isArray(v) ? v.map((x) => String(x || "").trim()).filter(Boolean) : [];

    const masteredTopics = toStrList(
      parsed.mastered_topics || parsed["сильные стороны"] || parsed["усвоенные темы"] || parsed["сильные_стороны"]
    );
    const weakTopics = toStrList(
      parsed.weak_topics || parsed["зоны внимания"] || parsed["слабые темы"] || parsed["зоны_внимания"]
    );
    const revisionPlan = toStrList(
      parsed.revision_plan || parsed["план адаптации"] || parsed["план повторения"] || parsed["рекомендации по адаптации"]
    );
    const recText = String(
      parsed.recommendation || parsed["рекомендация"] || parsed["итоговая рекомендация"] || ""
    ).trim();
    const verdictText = String(
      parsed.verdict ||
        parsed["вердикт"] ||
        (finalScore >= 85
          ? "Рекомендован к выходу на работу"
          : finalScore >= 70
          ? "Успешно прошёл отбор и обучение"
          : "Требует дополнительного внимания")
    ).trim();

    let summaryProse = String(
      parsed.summary || parsed["общий вывод"] || parsed["резюме"] || parsed["вывод"] || ""
    ).trim();
    if (!summaryProse || summaryProse.startsWith("{")) {
      const cleanRaw = !parsedRaw && aiText && !String(aiText).trim().startsWith("{") ? String(aiText).trim() : "";
      if (cleanRaw) {
        summaryProse = cleanRaw;
      } else {
        const parts: string[] = [
          `Кандидат ${candName} успешно завершил этапы собеседования (средний балл интервью: ${ovrScore ?? "—"}/100) и корпоративного обучения (Профессия: ${stageMap.professional.score ?? "—"}/100, Продукт: ${stageMap.product.score ?? "—"}/100, Система: ${stageMap.system.score ?? "—"}/100).`,
        ];
        if (masteredTopics.length > 0) {
          parts.push(`Подтверждённые сильные стороны: ${masteredTopics.slice(0, 3).join("; ")}.`);
        }
        if (weakTopics.length > 0) {
          parts.push(`Зоны внимания при адаптации: ${weakTopics.slice(0, 2).join("; ")}.`);
        }
        if (recText) {
          parts.push(recText);
        }
        summaryProse = parts.join(" ");
      }
    }

    const structuredReport = {
      score: finalScore,
      data_completeness: Number.isFinite(Number(parsed.data_completeness)) ? Math.round(Number(parsed.data_completeness)) : 100,
      verdict: verdictText,
      summary: summaryProse,
      completed_stages: toStrList(parsed.completed_stages).length > 0
        ? toStrList(parsed.completed_stages)
        : ["Резюме", "Чек-лист", "Ситуации", "Профессия", "Продукт", "Система"],
      missing_stages: toStrList(parsed.missing_stages),
      mastered_topics: masteredTopics,
      weak_topics: weakTopics,
      risks: Array.isArray(parsed.risks) ? parsed.risks : [],
      red_flags: Array.isArray(parsed.red_flags) ? parsed.red_flags : [],
      revision_plan: revisionPlan,
      readiness: String(
        parsed.readiness || parsed["готовность"] || "Кандидат готов к выполнению рабочих задач по стандартам компании."
      ).trim(),
      recommendation:
        recText || "Рекомендуется согласовать дату выхода и план адаптации на первую неделю.",
    };

    const sourceHash = crypto
      .createHash("sha1")
      .update(`${interviewSummariesText}\n${trainingSummariesText}`)
      .digest("hex")
      .slice(0, 16);

    const feedbackJsonStr = JSON.stringify(structuredReport);
    const candFeedbackStr = JSON.stringify({
      score: structuredReport.score,
      verdict: structuredReport.verdict,
      summary: structuredReport.summary,
      mastered_topics: structuredReport.mastered_topics,
      recommendation: structuredReport.recommendation,
    });

    await db.run(
      `INSERT INTO candidate_scores (
        candidate_id, training_employer_feedback, training_candidate_feedback,
        training_summary_score, training_summary_generated_at, training_summary_source_hash, updated_at
      ) VALUES (?, ?, ?, ?, NOW(), ?, NOW())
      ON CONFLICT (candidate_id) DO UPDATE SET
        training_employer_feedback = EXCLUDED.training_employer_feedback,
        training_candidate_feedback = EXCLUDED.training_candidate_feedback,
        training_summary_score = EXCLUDED.training_summary_score,
        training_summary_generated_at = NOW(),
        training_summary_source_hash = EXCLUDED.training_summary_source_hash,
        updated_at = NOW()`,
      [cand.id, feedbackJsonStr, candFeedbackStr, String(finalScore), sourceHash]
    );

    const jobId = `job-tsum-${Date.now()}`;
    candidateAiJobStore.set(jobId, {
      id: jobId,
      candidate_id: cand.id,
      task_type: "training_summary",
      status: isProMax ? "fallback_succeeded" : "primary_succeeded",
      result: structuredReport,
      payload: req.body,
    });

    return res.json({
      ok: true,
      job_id: jobId,
      status: isProMax ? "fallback_succeeded" : "primary_succeeded",
      terminal: true,
      score: finalScore,
      training_employer_feedback: structuredReport,
      report: structuredReport,
    });
  } catch (err: any) {
    console.error("[evaluate-training-summary-v2 Error]:", err);
    return res.status(500).json({ ok: false, error: err?.message || "summary_failed" });
  }
};
