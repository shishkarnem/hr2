import crypto from "crypto";
import { getProTalkDB, PgDBWrapper, saveCandidateToProTalkDB } from "../db";
import {
  extractCustomFieldsFromCandidateRow,
  extractStandardFieldsFromCandidateRow,
  mergeCandidateFields,
} from "../../src/lib/candidateFields";

export const candidateAiJobStore = new Map<string, any>();

export function isStageManual(val: any): boolean {
  if (val === null || val === undefined || val === false || val === 0) return false;
  const s = String(val).trim().toLowerCase();
  if (s === "" || s === "0" || s === "0.0" || s === "false" || s === "null" || s === "undefined") return false;
  return s === "1" || s === "1.0" || s === "true" || Number(s) >= 1;
}

export function detectAiTextHeuristic(text: string): boolean {
  const t = String(text || "").trim();
  if (t.length < 40) return false;
  const lower = t.toLowerCase();
  if (
    lower.includes("как языковая модель") ||
    lower.includes("в качестве ии") ||
    lower.includes("сгенерировано нейросетью") ||
    lower.includes("ответ нейросети") ||
    lower.includes("конечно! вот ") ||
    lower.includes("конечно, вот ") ||
    lower.includes("ниже представлен структурированный") ||
    lower.includes("комплексный подход к решению данной задачи включает") ||
    lower.includes("таким образом, резюмируя вышесказанное, можно")
  ) {
    return true;
  }
  return false;
}

export function renderTemplateVars(template: string, vars: Record<string, string | number | undefined | null>): string {
  if (!template) return "";
  let out = String(template);
  for (const [k, v] of Object.entries(vars)) {
    const val = v !== undefined && v !== null ? String(v) : "";
    const safeKey = k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(`\\{\\{\\s*${safeKey}\\s*\\}\\}`, "g"), val);
  }
  return out;
}

export function buildLlmMessagesFromPrompt(
  promptData: { system_prompt?: string; user_prompt_template?: string },
  vars: Record<string, string | number | undefined | null>,
  fallbackUserMessage: string
): Array<{ role: string; content: string }> {
  const messages: Array<{ role: string; content: string }> = [];
  const sys = renderTemplateVars(promptData.system_prompt || "", vars).trim();
  const tplRaw = promptData.user_prompt_template || "";
  const hasDistinctTpl = Boolean(tplRaw.trim() && tplRaw.trim() !== (promptData.system_prompt || "").trim());

  if (sys) {
    messages.push({ role: "system", content: sys });
  }

  if (hasDistinctTpl) {
    const renderedUser = renderTemplateVars(tplRaw, vars).trim();
    const firstNonEmptyVar = Object.values(vars).find((v) => v && String(v).trim().length > 15);
    const snippet = firstNonEmptyVar ? String(firstNonEmptyVar).trim().slice(0, 24) : "";
    const userContent = snippet && !renderedUser.includes(snippet)
      ? `${renderedUser}\n\n${fallbackUserMessage}`
      : renderedUser;
    messages.push({ role: "user", content: userContent });
  } else {
    const renderedFallback = renderTemplateVars(fallbackUserMessage, vars).trim();
    messages.push({ role: "user", content: renderedFallback });
  }

  return messages;
}

export function storeFailedAiJob(
  err: any,
  taskType: string,
  payload: any,
  candidateId?: any
): string {
  const jobId = String(err?.job_id || err?.jobId || `job-err-${Date.now()}`);
  candidateAiJobStore.set(jobId, {
    id: jobId,
    candidate_id: candidateId || payload?.candidate_id || null,
    task_type: taskType,
    status: "failed",
    error: err?.message || String(err || "Unknown AI error"),
    payload,
  });
  return jobId;
}

export async function persistCandidateAfterSituations(params: {
  db: PgDBWrapper;
  candidate_id: string;
  projRow: any;
  pid: any;
  avgScore: number;
  resultPayload: any;
  ansObj: any;
}) {
  const { db, candidate_id, projRow, pid, avgScore, resultPayload, ansObj } = params;
  const cleanId = String(candidate_id).replace(/^candidate/i, "").trim();
  const curCand = await db.get(
    "SELECT * FROM candidates WHERE id = ? OR CAST(public_id AS TEXT) = ? OR CAST(public_id AS TEXT) = ? OR id = ? LIMIT 1",
    [String(candidate_id), String(candidate_id), cleanId, cleanId]
  );
  const targetId = curCand ? curCand.id : String(candidate_id);
  const rawResScore = curCand?.resume_score != null && curCand.resume_score !== "" ? Number(curCand.resume_score) : null;
  const rawCheckScore = curCand?.checklist_score != null && curCand.checklist_score !== "" ? Number(curCand.checklist_score) : null;
  const allScores = [rawResScore, rawCheckScore, avgScore].filter((x): x is number => typeof x === "number" && !isNaN(x) && x >= 0);
  const overallScore = allScores.length ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length) : avgScore;
  const passScore = Number(projRow?.interview_pass_score ?? 70);
  const isManualStage = isStageManual(curCand?.crm_stage_manual);
  const interviewFinalStage = overallScore >= passScore ? "interview_success" : "interview_reject";
  const nextCrmStage = isManualStage ? (curCand?.crm_stage || interviewFinalStage) : interviewFinalStage;

  await db.run(
    `UPDATE candidates SET situations_score = ?, situations_ai_feedback = ?, overall_score = ?, score = ?, crm_stage = ?, stage = ?, current_stage = ?, updated_at = NOW() WHERE id = ?`,
    [avgScore, JSON.stringify(resultPayload), overallScore, overallScore, nextCrmStage, nextCrmStage, nextCrmStage, targetId]
  );
  const effPid = projRow?.id || String(pid || curCand?.project_id || "default");
  const ansStr = JSON.stringify(ansObj || {});
  const ansHash = crypto.createHash("md5").update(ansStr).digest("hex");
  await db.run(
    `INSERT INTO candidate_situations_answers_v2 (candidate_id, project_id, answers, answers_hash, updated_at)
     VALUES (?, ?, ?, ?, NOW())
     ON CONFLICT (candidate_id, project_id) DO UPDATE SET
       answers = EXCLUDED.answers,
       answers_hash = EXCLUDED.answers_hash,
       updated_at = NOW()`,
    [targetId, effPid, ansStr, ansHash]
  );
  await db.run(
    `INSERT INTO candidate_scores (candidate_id, situations_score, roleplay_points, overall_score, situations_feedback, candidate_situations_feedback, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, NOW())
     ON CONFLICT (candidate_id) DO UPDATE SET
       situations_score = EXCLUDED.situations_score,
       roleplay_points = EXCLUDED.roleplay_points,
       overall_score = EXCLUDED.overall_score,
       situations_feedback = EXCLUDED.situations_feedback,
       candidate_situations_feedback = EXCLUDED.candidate_situations_feedback,
       updated_at = NOW()`,
    [targetId, avgScore, Math.round(avgScore / 10), overallScore, JSON.stringify(resultPayload), JSON.stringify(resultPayload)]
  );

  try {
    const { dispatchUserNotification } = await import("../services/push/pushService");
    const { notifyEmployerInterviewStage, notifyEmployerInterviewResult } = await import(
      "../services/notifications/interviewStageNotifier"
    );
    const candPub = curCand?.public_id || curCand?.id || targetId;
    const passed = overallScore >= passScore;

    // Candidate notification (interview_result)
    await dispatchUserNotification(db, {
      ownerType: "candidate",
      ownerIds: [String(targetId), String(candPub)],
      eventKey: "interview_result",
      kind: "interview",
      title: passed ? "ИИ-собеседование пройдено!" : "Итоги ИИ-собеседования",
      body: passed
        ? `Поздравляем! Ваш результат: ${overallScore} из 100 баллов. Вам открыто корпоративное обучение.`
        : `Ваш итоговый результат: ${overallScore} из 100 баллов (проходной: ${passScore}).`,
      link: `/cand${candPub}/profile`,
      meta: { candidate_id: String(candPub), overall_score: overallScore, passed },
      candidateId: String(targetId),
    });

    // Employer stage alert: Ситуации
    await notifyEmployerInterviewStage(db, {
      projectId: effPid,
      projRow,
      candidate: { ...curCand, id: targetId, public_id: candPub },
      stageName: "Ситуации",
      score: avgScore,
    });

    // Employer final interview result alert: interview_success or interview_reject
    await notifyEmployerInterviewResult(db, {
      projectId: effPid,
      projRow,
      candidate: { ...curCand, id: targetId, public_id: candPub },
      overallScore,
      passScore,
      passed,
    });
  } catch (notifErr: any) {
    console.warn("[persistCandidateAfterSituations] Notification notice:", notifErr?.message);
  }
}

export async function persistCandidateAfterChecklist(params: {
  db: PgDBWrapper;
  candidate_id: string;
  projRow: any;
  pid: any;
  score100: number;
  totalPoints: number;
  feedbackPayload: any;
  ansObj: any;
  items: any[];
}) {
  const { db, candidate_id, projRow, pid, score100, totalPoints, feedbackPayload, ansObj, items } = params;
  const cleanId = String(candidate_id).replace(/^candidate/i, "").trim();
  const curCand = await db.get(
    "SELECT * FROM candidates WHERE id = ? OR CAST(public_id AS TEXT) = ? OR CAST(public_id AS TEXT) = ? OR id = ? LIMIT 1",
    [String(candidate_id), String(candidate_id), cleanId, cleanId]
  );
  const targetId = curCand ? curCand.id : String(candidate_id);
  const existingResScore = curCand?.resume_score != null && curCand.resume_score !== "" ? Number(curCand.resume_score) : null;
  const existingSitScore = curCand?.situations_score != null && curCand.situations_score !== "" ? Number(curCand.situations_score) : null;
  const allScores = [existingResScore, score100, existingSitScore].filter((x): x is number => typeof x === "number" && !isNaN(x) && x >= 0);
  const effOverall = allScores.length ? Math.round((allScores.reduce((a, b) => a + b, 0) / allScores.length) * 10) / 10 : score100;

  const isManualStage = isStageManual(curCand?.crm_stage_manual);
  const nextCrmStage = isManualStage ? (curCand?.crm_stage || "situations") : (score100 > 0 ? "situations" : "checklist");
  await db.run(
    `UPDATE candidates SET checklist_score = ?, overall_score = ?, score = ?, checklist_ai_feedback = ?, crm_stage = ?, stage = ?, current_stage = ?, updated_at = NOW() WHERE id = ?`,
    [score100, effOverall, Math.round(effOverall), JSON.stringify(feedbackPayload), nextCrmStage, nextCrmStage, nextCrmStage, targetId]
  );
  const effPid = projRow?.id || String(pid || curCand?.project_id || "default");
  const ansStr = JSON.stringify(ansObj || {});
  const ansHash = crypto.createHash("md5").update(ansStr).digest("hex");
  await db.run(
    `INSERT INTO candidate_checklist_answers_v2 (candidate_id, project_id, answers, answers_hash, updated_at)
     VALUES (?, ?, ?, ?, NOW())
     ON CONFLICT (candidate_id, project_id) DO UPDATE SET
       answers = EXCLUDED.answers,
       answers_hash = EXCLUDED.answers_hash,
       updated_at = NOW()`,
    [targetId, effPid, ansStr, ansHash]
  );
  await db.run(
    `INSERT INTO candidate_scores (candidate_id, checklist_score, overall_score, checklist_points, checklist_sys_score, checklist_feedback, candidate_checklist_feedback, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
     ON CONFLICT (candidate_id) DO UPDATE SET
       checklist_score = EXCLUDED.checklist_score,
       overall_score = EXCLUDED.overall_score,
       checklist_points = EXCLUDED.checklist_points,
       checklist_sys_score = EXCLUDED.checklist_sys_score,
       checklist_feedback = EXCLUDED.checklist_feedback,
       candidate_checklist_feedback = EXCLUDED.candidate_checklist_feedback,
       updated_at = NOW()`,
    [targetId, score100, effOverall, totalPoints, score100, JSON.stringify(feedbackPayload), JSON.stringify(feedbackPayload)]
  );
  for (const it of items) {
    const ansRowId = `${targetId}_${it.id}`;
    await db.run(
      `INSERT INTO candidate_answers (id, candidate_id, question_id, question_text, question_category, answer_text, feedback, score, is_correct, created_at)
       VALUES (?, ?, ?, ?, 'checklist', ?, ?, ?, ?, NOW())
       ON CONFLICT (id) DO UPDATE SET
         answer_text = EXCLUDED.answer_text,
         feedback = EXCLUDED.feedback,
         score = EXCLUDED.score,
         is_correct = EXCLUDED.is_correct`,
      [
        ansRowId,
        targetId,
        String(it.id),
        String(it.question || ""),
        String(it.answer || ""),
        String(it.explanation || ""),
        Number(it.score) || 0,
        it.verdict === "correct" ? 1 : 0,
      ]
    );
  }

  try {
    const { notifyEmployerInterviewStage } = await import("../services/notifications/interviewStageNotifier");
    await notifyEmployerInterviewStage(db, {
      projectId: effPid,
      projRow,
      candidate: { ...curCand, id: targetId },
      stageName: "Чек-лист",
      score: score100,
    });
  } catch {}
}

export async function persistCandidateAfterResume(params: {
  db: PgDBWrapper;
  existingCand: any;
  projRow: any;
  pid: any;
  text: string;
  score: number;
  summary: string;
  resultPayload: any;
  mergedFields: { standard_fields: Record<string, any>; custom_fields: Record<string, any> };
  customDefs: any[];
  incomingResumeUrl: string;
}) {
  const { db, existingCand, projRow, pid, text, score, summary, resultPayload, mergedFields, customDefs, incomingResumeUrl } = params;
  const curStd = extractStandardFieldsFromCandidateRow(existingCand);
  const curCust = extractCustomFieldsFromCandidateRow(existingCand);
  const finalMerged = mergeCandidateFields(
    curStd,
    mergedFields.standard_fields,
    curCust,
    mergedFields.custom_fields,
    customDefs
  );

  const resolvedResumeUrl = incomingResumeUrl || existingCand.resume_url || finalMerged.standard_fields.resume_url || "";
  if (resolvedResumeUrl) {
    finalMerged.standard_fields.resume_url = resolvedResumeUrl;
  }

  const effProjId = existingCand.project_id || projRow?.id || pid;
  const alreadyChargedInterview = Boolean(existingCand.interview_charged_at);
  if (!alreadyChargedInterview && effProjId) {
    await db.run(
      `UPDATE projects SET interview_used = COALESCE(interview_used, 0) + 1, updated_at = NOW() WHERE id = ?`,
      [String(effProjId)]
    );
  }

  const existingChkScore = existingCand.checklist_score != null && existingCand.checklist_score !== "" ? Number(existingCand.checklist_score) : null;
  const existingSitScore = existingCand.situations_score != null && existingCand.situations_score !== "" ? Number(existingCand.situations_score) : null;
  const allScores = [score, existingChkScore, existingSitScore].filter((x): x is number => typeof x === "number" && !isNaN(x) && x >= 0);
  const effOverall = allScores.length ? Math.round((allScores.reduce((a, b) => a + b, 0) / allScores.length) * 10) / 10 : score;

  const isManualStage = isStageManual(existingCand?.crm_stage_manual);
  const nextCrmStage = isManualStage ? (existingCand?.crm_stage || "checklist") : (score > 0 ? "checklist" : "screening");

  const updatedCand = {
    ...existingCand,
    resume_text: text || existingCand.resume_text,
    resume_url: resolvedResumeUrl || existingCand.resume_url,
    resume_score: score,
    overall_score: effOverall,
    score: effOverall,
    resume_ai_feedback: JSON.stringify(resultPayload),
    standard_fields: finalMerged.standard_fields,
    standard_fields_json: finalMerged.standard_fields,
    custom_fields: finalMerged.custom_fields,
    custom_fields_json: finalMerged.custom_fields,
    interview_charged_at: existingCand.interview_charged_at || new Date().toISOString(),
    crm_stage: nextCrmStage,
    stage: nextCrmStage,
    current_stage: nextCrmStage,
  };
  await saveCandidateToProTalkDB(db, updatedCand);
  await db.run(
    `UPDATE candidates SET resume_score = ?, overall_score = ?, score = ?, resume_ai_feedback = ?, resume_url = ?, standard_fields_json = ?, custom_fields_json = ?, interview_charged_at = COALESCE(NULLIF(interview_charged_at, ''), CAST(NOW() AS TEXT)), crm_stage = ?, stage = ?, current_stage = ?, updated_at = NOW() WHERE id = ?`,
    [
      score,
      effOverall,
      Math.round(effOverall),
      JSON.stringify(resultPayload),
      resolvedResumeUrl || existingCand.resume_url || "",
      JSON.stringify(finalMerged.standard_fields),
      JSON.stringify(finalMerged.custom_fields),
      nextCrmStage,
      nextCrmStage,
      nextCrmStage,
      existingCand.id,
    ]
  );
  await db.run(
    `INSERT INTO candidate_scores (candidate_id, resume_score, overall_score, resume_feedback, candidate_resume_feedback, assessment_summary, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, NOW())
     ON CONFLICT (candidate_id) DO UPDATE SET
       resume_score = EXCLUDED.resume_score,
       overall_score = EXCLUDED.overall_score,
       resume_feedback = EXCLUDED.resume_feedback,
       candidate_resume_feedback = EXCLUDED.candidate_resume_feedback,
       assessment_summary = COALESCE(candidate_scores.assessment_summary, EXCLUDED.assessment_summary),
       updated_at = NOW()`,
    [existingCand.id, score, effOverall, JSON.stringify(resultPayload), JSON.stringify(resultPayload), summary.slice(0, 1500)]
  );

  try {
    const { notifyEmployerInterviewStage } = await import("../services/notifications/interviewStageNotifier");
    await notifyEmployerInterviewStage(db, {
      projectId: String(effProjId || pid || ""),
      projRow,
      candidate: updatedCand,
      stageName: "Скрининг резюме",
      score,
    });
    if (!alreadyChargedInterview && effProjId) {
      const { checkVacancyLowLimits } = await import("../services/notifications/lowBalanceNotifier");
      await checkVacancyLowLimits(db, String(effProjId));
    }
  } catch {}

  return { finalMerged };
}

export async function getDefaultDb() {
  return await getProTalkDB();
}
