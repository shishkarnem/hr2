import { Router, Request, Response } from "express";
import { callProTalkLLM, formatChatIdFromPrefix, getProTalkPrompt, tryParseLLMJson } from "../../common";
import { candidateAiJobStore } from "../../aiHelpers/common";
import {
  situationsAndChecklistRouter,
  handleGradeSituations,
  handleGradeChecklist,
} from "./situationsAndChecklist";
import {
  handleEvaluateOverallCandidate,
  handleCandidateStageAdvanceV2,
} from "../../aiHelpers/overallEval";
import { resumeAndIngestionRouter, handleScreenResume } from "./resumeAndIngestion";
import {
  enhancersRouter,
  handleAIEnhance,
  handleGenerateInterviewResumeCriteria,
  handleGenerateInterviewChecklist,
  handleGenerateInterviewSituations,
} from "./enhancersAndInterviewBlocks";
import {
  trainingAndAssistantRouter,
  handleGenerateStageTest,
  handleGenerateStageMaterial,
} from "./trainingAndAssistant";

export const aiRouter = Router();

aiRouter.use("/", situationsAndChecklistRouter);
aiRouter.post(["/ai-evaluate-overall-candidate", "/ai-evaluate-overall-candidate-v2"], handleEvaluateOverallCandidate);
aiRouter.post("/candidate-stage-advance-v2", handleCandidateStageAdvanceV2);
aiRouter.use("/", resumeAndIngestionRouter);
aiRouter.use("/", enhancersRouter);
aiRouter.use("/", trainingAndAssistantRouter);

aiRouter.post("/ai-job-status-candidate-v2", async (req: Request, res: Response) => {
  const { job_id } = req.body || {};
  const job = job_id ? candidateAiJobStore.get(String(job_id)) : null;
  return res.json({
    ok: true,
    job: job || {
      id: job_id || `job-${Date.now()}`,
      status: "primary_succeeded",
      result: {},
    },
  });
});

aiRouter.post("/ai-fallback-rr-pro-max", async (req: Request, res: Response) => {
  try {
    const { job_id, prompt_key, user_message, response_format, entity_id, demo_user_id } = req.body || {};
    if (job_id && candidateAiJobStore.has(String(job_id))) {
      const stored = candidateAiJobStore.get(String(job_id));
      req.body = { ...(stored.payload || {}), use_promax: true };
      if (stored.task_type === "resume_screen") return handleScreenResume(req, res);
      if (stored.task_type === "checklist_grade") return handleGradeChecklist(req, res);
      if (stored.task_type === "situations_grade") return handleGradeSituations(req, res);
      if (stored.task_type === "overall_eval") return handleEvaluateOverallCandidate(req, res);
      if (stored.task_type === "training_stage_test") return handleGenerateStageTest(req, res);
      if (stored.task_type === "training_stage_material") return handleGenerateStageMaterial(req, res);
      if (stored.task_type === "interview_resume_criteria") return handleGenerateInterviewResumeCriteria(req, res);
      if (stored.task_type === "interview_checklist") return handleGenerateInterviewChecklist(req, res);
      if (stored.task_type === "interview_situations") return handleGenerateInterviewSituations(req, res);
      if (
        stored.task_type === "enhance_training_material" ||
        stored.task_type === "enhance_single_field" ||
        stored.task_type === "enhance_all_fields"
      ) {
        return handleAIEnhance(req, res);
      }
    }

    const rawKey = prompt_key ? String(prompt_key) : "seeker_assistant_promax";
    const effectiveKey = rawKey.endsWith("_promax") ? rawKey : `${rawKey}_promax`;
    const promptData = await getProTalkPrompt(effectiveKey, undefined, true);
    const userPrefix = promptData.bot?.user_prefix || (demo_user_id ? "demo{id}_RRaudio" : "{id}_RRresume");
    const chatId = await formatChatIdFromPrefix(userPrefix, demo_user_id || entity_id || "100007", "RRresume");
    const msg = String(user_message || promptData.system_prompt || "Выполни задачу на русском языке.");

    const aiText = await callProTalkLLM("other", [{ role: "user", content: msg }], chatId, undefined, undefined, effectiveKey, true);
    const parsed =
      response_format === "json" || effectiveKey.includes("voice_") || effectiveKey.includes("evaluation")
        ? tryParseLLMJson<any>(aiText)
        : null;
    return res.json({
      ok: true,
      status: "fallback_succeeded",
      terminal: true,
      bot_id: promptData.bot?.bot_id || 67370,
      text: aiText,
      reply: aiText,
      data: parsed ?? aiText,
      result: parsed ?? aiText,
    });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || "RR ProMax fallback failed" });
  }
});
