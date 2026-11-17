import { Request, Response } from "express";
import {
  callProTalkLLM,
  getProTalkPrompt,
} from "../services/protalkAi";
import { tryParseLLMJson } from "../services/utils";
import { formatChatIdFromPrefix, resolveCandidate6DigitPublicId } from "../services/chatIdHelpers";
import { getProTalkDB } from "../db";
import {
  candidateAiJobStore,
  isStageManual,
  buildLlmMessagesFromPrompt,
  storeFailedAiJob,
} from "./common";

export const handleEvaluateOverallCandidate = async (req: Request, res: Response) => {
  try {
    const { candidate_id, use_promax } = req.body || {};
    const isProMax = Boolean(use_promax || req.body?.useProMax);
    const db = await getProTalkDB();
    const cand = candidate_id ? await db.get("SELECT * FROM candidates WHERE id = ? LIMIT 1", [String(candidate_id)]) : null;
    const proj = cand?.project_id
      ? await db.get("SELECT * FROM projects WHERE id = ? OR CAST(public_id AS TEXT) = ? LIMIT 1", [String(cand.project_id), String(cand.project_id)])
      : null;
    const stageProgress = candidate_id
      ? await db.all("SELECT * FROM candidate_stage_progress WHERE candidate_id = ?", [String(candidate_id)])
      : [];

    const promptKey = isProMax ? "overall_candidate_evaluation_promax" : "overall_candidate_evaluation";
    const promptData = await getProTalkPrompt(promptKey, undefined, isProMax);
    const userPrefix = promptData.bot?.user_prefix || "{id}_RRresume";
    const candPubId = await resolveCandidate6DigitPublicId(cand?.id || candidate_id, db);
    const chatId = await formatChatIdFromPrefix(userPrefix, candPubId, "RRresume");

    const resumeScore = Number(cand?.resume_score) || 0;
    const checklistScore = Number(cand?.checklist_score) || 0;
    const situationsScore = Number(cand?.situations_score) || 0;

    const fallbackMsg = `Кандидат: ${cand?.full_name || cand?.name || "Соискатель"}
Должность: ${proj?.role_name || cand?.role_name || "Специалист"}
Компания: ${proj?.company_name || "Компания"}
Балл по резюме: ${resumeScore}/100
Балл по чек-листу: ${checklistScore}/100
Балл по ролевым ситуациям: ${situationsScore}/100
Этапы обучения: ${JSON.stringify(stageProgress)}

Сформируй итоговую оценку кандидата и верни строго валидный JSON без капслока:
{
  "overall_score": 0..100,
  "verdict": "strong_yes" | "yes" | "maybe" | "no",
  "summary": "Развернутое аналитическое заключение (3-5 предложений)",
  "strengths": ["Сильная сторона 1", "Сильная сторона 2"],
  "gaps": ["Зона роста 1"],
  "recommendation": "Рекомендация для руководителя"
}`;

    const llmMessages = buildLlmMessagesFromPrompt(
      promptData,
      {
        candidate_name: cand?.full_name || cand?.name || "Соискатель",
        role_name: proj?.role_name || cand?.role_name || "Специалист",
        company_name: proj?.company_name || "Компания",
        resume_score: resumeScore,
        checklist_score: checklistScore,
        situations_score: situationsScore,
        stage_progress: JSON.stringify(stageProgress),
      },
      fallbackMsg
    );

    let aiText = "";
    try {
      aiText = await callProTalkLLM("resume", llmMessages, chatId, undefined, undefined, promptKey, isProMax);
    } catch (err: any) {
      const failedJobId = storeFailedAiJob(err, "overall_eval", req.body, candidate_id);
      return res.status(502).json({
        ok: false,
        job_id: failedJobId,
        retryable: true,
        error: `Ошибка вызова нейросети: ${err?.message || "Не удалось сформировать заключение"}. Попробуйте повторить с RR ProMax.`,
      });
    }

    const parsed = tryParseLLMJson<any>(aiText) || {};
    const computedAvg = Math.round(((resumeScore || 75) + (checklistScore || 75) + (situationsScore || 75)) / 3);
    const overallScore =
      parsed.overall_score !== undefined ? Math.max(0, Math.min(100, Number(parsed.overall_score) || computedAvg)) : computedAvg;
    const verdict = parsed.verdict || (overallScore >= 80 ? "strong_yes" : overallScore >= 65 ? "yes" : overallScore >= 50 ? "maybe" : "no");
    const summary = String(parsed.summary || aiText || "Кандидат успешно прошел этапы оценки.").slice(0, 2000);
    const strengths = Array.isArray(parsed.strengths) ? parsed.strengths.map((s: any) => String(s)) : ["Успешное прохождение этапов отбора"];
    const gaps = Array.isArray(parsed.gaps) ? parsed.gaps.map((s: any) => String(s)) : [];
    const recommendation = String(parsed.recommendation || summary).slice(0, 1000);

    const resultPayload = { overall_score: overallScore, verdict, summary, strengths, gaps, recommendation };

    if (candidate_id && db) {
      try {
        let dataObj: any = {};
        if (cand?.data_json) {
          try {
            dataObj = typeof cand.data_json === "string" ? JSON.parse(cand.data_json) : cand.data_json;
          } catch {}
        }
        dataObj.overall_score = overallScore;
        dataObj.ai_overall_summary = summary;
        dataObj.ai_overall_verdict = verdict;
        dataObj.ai_overall_strengths = strengths;
        dataObj.ai_overall_gaps = gaps;
        await db.run(
          `UPDATE candidates SET score = ?, overall_score = ?, ai_overall_summary = ?, data_json = ?, updated_at = NOW() WHERE id = ?`,
          [overallScore, overallScore, summary, JSON.stringify(dataObj), String(candidate_id)]
        );
        await db.run(
          `INSERT INTO candidate_scores (candidate_id, overall_score, interview_score, assessment_summary, candidate_overall_feedback, employer_overall_feedback, overall_generated_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())
           ON CONFLICT (candidate_id) DO UPDATE SET
             overall_score = EXCLUDED.overall_score,
             interview_score = EXCLUDED.interview_score,
             assessment_summary = EXCLUDED.assessment_summary,
             candidate_overall_feedback = EXCLUDED.candidate_overall_feedback,
             employer_overall_feedback = EXCLUDED.employer_overall_feedback,
             overall_generated_at = NOW(),
             updated_at = NOW()`,
          [String(candidate_id), overallScore, overallScore, summary, summary, recommendation]
        );
      } catch {}
    }

    const jobId = `job-ovr-${Date.now()}`;
    const status = isProMax ? "fallback_succeeded" : "primary_succeeded";
    candidateAiJobStore.set(jobId, {
      id: jobId,
      candidate_id,
      task_type: "overall_eval",
      status,
      result: resultPayload,
      payload: req.body,
    });

    return res.json({
      ok: true,
      job_id: jobId,
      status,
      terminal: true,
      ...resultPayload,
      result: resultPayload,
    });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || "Failed to evaluate overall candidate" });
  }
};

export const handleCandidateStageAdvanceV2 = async (req: Request, res: Response) => {
  try {
    const { job_id, candidate_id } = req.body || {};
    const db = await getProTalkDB();
    if (!db) {
      return res.status(500).json({ ok: false, error: "Database not available" });
    }
    let candId = candidate_id;
    if (!candId && job_id) {
      const job = candidateAiJobStore.get(job_id);
      if (job?.candidate_id) candId = job.candidate_id;
    }
    if (!candId) {
      const candToken = req.headers["x-candidate-token"] || req.body?.candidate_token;
      if (candToken) {
        const session = await db.get("SELECT candidate_id FROM candidate_sessions WHERE token = ? LIMIT 1", [String(candToken)]);
        if (session?.candidate_id) candId = session.candidate_id;
      }
    }
    if (!candId) {
      return res.json({ ok: true, advanced: false, reason: "no_candidate" });
    }
    const cleanCandId = String(candId).replace(/^candidate/i, "").trim();
    const cand = await db.get(
      "SELECT * FROM candidates WHERE id = ? OR CAST(public_id AS TEXT) = ? OR id = ? OR CAST(public_id AS TEXT) = ? LIMIT 1",
      [String(candId), String(candId), cleanCandId, cleanCandId]
    );
    if (!cand) {
      return res.json({ ok: true, advanced: false, reason: "candidate_not_found" });
    }
    const proj = await db.get(
      "SELECT * FROM projects WHERE id = ? OR CAST(public_id AS TEXT) = ? LIMIT 1",
      [String(cand.project_id), String(cand.project_id)]
    );
    const passScore = Number(proj?.interview_pass_score ?? 70);

    const scores = await db.get("SELECT * FROM candidate_scores WHERE candidate_id = ? LIMIT 1", [cand.id]);
    const resScore = Number(scores?.resume_score ?? cand.resume_score ?? 0);
    const checkScore = Number(scores?.checklist_score ?? cand.checklist_score ?? 0);
    const sitScore = Number(scores?.situations_score ?? cand.situations_score ?? 0);
    const overallScore = Math.round((resScore + checkScore + sitScore) / 3);
    const isSuccess = overallScore >= passScore;
    const isManualStage = isStageManual(cand?.crm_stage_manual);
    const { pickMonotonicCrmStage } = await import("../services/crmReconciler");
    const desiredStage = isSuccess ? "interview_success" : "interview_reject";
    const targetStage = isManualStage
      ? (cand?.crm_stage || desiredStage)
      : pickMonotonicCrmStage(cand?.crm_stage || cand?.stage, desiredStage);

    await db.run(
      `UPDATE candidates SET overall_score = ?, score = ?, crm_stage = ?, stage = ?, current_stage = ?, updated_at = NOW() WHERE id = ?`,
      [overallScore, overallScore, targetStage, targetStage, targetStage, cand.id]
    );
    await db.run(
      `UPDATE candidate_scores SET overall_score = ?, updated_at = NOW() WHERE candidate_id = ?`,
      [overallScore, cand.id]
    );

    return res.json({
      ok: true,
      advanced: isSuccess,
      already: cand.crm_stage === targetStage,
      stage: targetStage,
      overall_score: overallScore,
      pass_score: passScore,
      passed: isSuccess,
    });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || String(err) });
  }
};
