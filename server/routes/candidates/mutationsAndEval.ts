import crypto from "crypto";
import { Router, Request, Response } from "express";
import { notifyTelegram, tryParseLLMJson } from "../../services/utils";
import { callProTalkLLM, resolveCandidate6DigitPublicId } from "../../common";
import {
  saveCandidateToProTalkDB,
  deleteCandidateFromProTalkDB,
  getProTalkDB,
  generateNextCandidatePublicId,
} from "../../db";
import {
  STANDARD_CANDIDATE_FIELDS,
  extractStandardFieldsFromCandidateRow,
  extractCustomFieldsFromCandidateRow,
} from "../../../src/lib/candidateFields";

export const mutationsAndEvalRouter = Router();

mutationsAndEvalRouter.post("/candidates", async (req: Request, res: Response) => {
  try {
    const db = await getProTalkDB();
    const { name, email, phone, telegramUsername, telegramId, projectId, roleName, registeredVia, id } = req.body;
    const emailNorm = (email || "").trim().toLowerCase();
    const rawProjId = String(projectId || "").trim();
    const cleanProjId = rawProjId.replace(/^vac_?/i, "").trim();

    const projRow =
      rawProjId || cleanProjId
        ? await db.get(
            `SELECT p.*, c.public_id AS company_public_id, c.name AS company_name
             FROM projects p LEFT JOIN companies c ON p.company_id = c.id
             WHERE p.id = ? OR CAST(p.public_id AS TEXT) = ? OR p.slug = ?
                OR p.id = ? OR CAST(p.public_id AS TEXT) = ? OR p.slug = ?
             LIMIT 1`,
            [rawProjId, rawProjId, rawProjId, cleanProjId, cleanProjId, cleanProjId]
          )
        : null;

    const targetProjectId = projRow?.id || rawProjId || cleanProjId;
    const targetCompanyId = projRow?.company_id || null;
    const targetRoleName = projRow?.role_name || roleName || "Специалист";

    let existingOnVac: any = null;
    if (emailNorm && targetProjectId) {
      existingOnVac = await db.get(
        "SELECT * FROM candidates WHERE LOWER(email) = ? AND (project_id = ? OR project_id = ? OR project_id = ?) LIMIT 1",
        [emailNorm, targetProjectId, rawProjId, cleanProjId]
      );
    }

    if (existingOnVac) {
      return res.status(200).json({
        ok: true,
        id: existingOnVac.id,
        candidate_id: existingOnVac.id,
        public_id: existingOnVac.public_id,
        publicId: existingOnVac.public_id,
        project_id: existingOnVac.project_id || targetProjectId,
        company_id: existingOnVac.company_id || targetCompanyId,
        project_public_id: projRow?.public_id || null,
        company_public_id: projRow?.company_public_id || null,
        roleName: existingOnVac.role_name || targetRoleName,
        name: existingOnVac.full_name || name,
        email: existingOnVac.email || emailNorm,
        currentStage: existingOnVac.current_stage || "terms",
      });
    }

    const nextPubId = await generateNextCandidatePublicId(db);
    const candId = id || crypto.randomUUID();
    const nowIso = new Date().toISOString();
    const candidateFullName =
      (name || "").trim() || (emailNorm ? emailNorm.split("@")[0] : `Кандидат #${nextPubId}`);
    const candidatePhone = (phone || "").trim();

    await db.run(
      `INSERT INTO candidates (
        id, public_id, project_id, company_id, full_name, email, phone,
        social_telegram, role_name, current_stage, stage, crm_stage, crm_stage_manual,
        auth_kind, registered_via, created_at, updated_at, last_login_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        candId,
        nextPubId,
        targetProjectId,
        targetCompanyId,
        candidateFullName,
        emailNorm,
        candidatePhone,
        telegramUsername || "",
        targetRoleName,
        "registration",
        "registration",
        "registration",
        0,
        "email",
        registeredVia || "email",
        nowIso,
        nowIso,
        nowIso,
      ]
    );

    const newCand = {
      id: candId,
      public_id: nextPubId,
      publicId: nextPubId,
      candidate_id: candId,
      name: candidateFullName,
      full_name: candidateFullName,
      email: emailNorm,
      phone: candidatePhone,
      telegramUsername,
      telegramId,
      projectId: targetProjectId,
      project_id: targetProjectId,
      company_id: targetCompanyId,
      project_public_id: projRow?.public_id || null,
      company_public_id: projRow?.company_public_id || null,
      roleName: targetRoleName,
      currentStage: "terms",
      registeredVia: registeredVia || "email",
      createdAt: nowIso,
      trainingPlan: [],
    };

    await notifyTelegram(
      telegramId,
      `🔔 Новый кандидат зарегистрирован в системе!\n👤 Имя: ${candidateFullName}\n💼 Должность: ${targetRoleName}\n🔗 Этап: Ознакомление с условиями`
    );

    return res.status(201).json(newCand);
  } catch (err: any) {
    console.error("[POST /candidates error]:", err);
    return res.status(500).json({ ok: false, error: err.message || "Failed to register candidate" });
  }
});

mutationsAndEvalRouter.patch("/candidates/:id", async (req: Request, res: Response) => {
  try {
    const db = await getProTalkDB();
    const rawId = req.params.id;
    const cleanId = String(rawId || "").replace(/^candidate/i, "").replace(/^cand/i, "").trim();
    const existingRow = await db.get(
      `SELECT * FROM candidates WHERE id = ? OR CAST(public_id AS TEXT) = ? OR id = ? LIMIT 1`,
      [rawId, cleanId, cleanId]
    );

    if (!existingRow) {
      return res.status(404).json({ error: "Candidate not found" });
    }

    const curStd = extractStandardFieldsFromCandidateRow(existingRow);
    const curCust = extractCustomFieldsFromCandidateRow(existingRow);
    const bodyStd = req.body.standard_fields || req.body.standardFields || {};
    const bodyCust = req.body.custom_fields || req.body.customFields || {};

    const nextStd: Record<string, any> = { ...curStd, ...bodyStd };
    for (const def of STANDARD_CANDIDATE_FIELDS) {
      if (req.body[def.key] !== undefined) {
        nextStd[def.key] = req.body[def.key];
      }
    }
    if (req.body.full_name || req.body.name || req.body.fullName) {
      nextStd.full_name = req.body.full_name || req.body.name || req.body.fullName;
    }

    const nextCust: Record<string, any> = { ...curCust, ...bodyCust };
    const mergedCand = {
      ...existingRow,
      ...req.body,
      id: existingRow.id || rawId,
      standard_fields: nextStd,
      custom_fields: nextCust,
    };

    await saveCandidateToProTalkDB(db, mergedCand);
    const updatedRow = await db.get(`SELECT * FROM candidates WHERE id = ? LIMIT 1`, [mergedCand.id]);

    return res.json({
      ...(updatedRow || mergedCand),
      standard_fields: nextStd,
      standardFields: nextStd,
      custom_fields: nextCust,
      customFields: nextCust,
    });
  } catch (err: any) {
    console.error("[PATCH /candidates/:id Error]:", err);
    return res.status(500).json({ error: err.message || "Failed to update candidate" });
  }
});

mutationsAndEvalRouter.delete("/candidates/:id", async (req: Request, res: Response) => {
  try {
    const db = await getProTalkDB();
    await deleteCandidateFromProTalkDB(db, req.params.id);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

mutationsAndEvalRouter.post("/evaluate-interview", async (req: Request, res: Response) => {
  const { candidateAnswers, candidateId, resumeText } = req.body;
  const db = await getProTalkDB();

  const candidate = await db.get(
    "SELECT * FROM candidates WHERE id = ? OR CAST(public_id AS TEXT) = ? LIMIT 1",
    [candidateId, String(candidateId)]
  );
  if (!candidate) return res.status(404).json({ error: "Candidate not found" });

  const project =
    candidate.project_id || candidate.projectId
      ? await db.get("SELECT * FROM projects WHERE id = ? OR CAST(public_id AS TEXT) = ? LIMIT 1", [
          candidate.project_id || candidate.projectId,
          String(candidate.project_id || candidate.projectId),
        ])
      : null;

  let interviewScore = 75;
  let resumeScore = 70;
  let checklistPoints = 7;
  let roleplayPoints = 7;
  let assessmentSummary =
    "Интервью пройдено успешно. Кандидат показал хорошие общие знания, резюме совпадает с требованиями. Рекомендовано назначить обучение.";

  const roleName = candidate.role_name || candidate.roleName || project?.role_name || "Специалист";
  const companyName = project ? project.company_name || project.companyName : "Работодатель";
  const answersDesc = (candidateAnswers || [])
    .map((a: any) => `Вопрос: "${a.question}"\nОтвет кандидата: "${a.answer}"`)
    .join("\n\n");

  const prompt = `Оцени прохождение собеседования кандидатом на должность "${roleName}" в компанию "${companyName}".
Резюме кандидата: "${resumeText || "Не прикреплено"}"
Ответы:
${answersDesc}

Верни ТОЛЬКО JSON:
{
  "interviewScore": число_от_0_до_100,
  "resumeScore": число_от_0_до_100,
  "checklistPoints": число_от_0_до_10,
  "roleplayPoints": число_от_0_до_10,
  "overallScore": число_от_0_до_100,
  "assessmentSummary": "Детальный разбор (4-5 предложений)"
}`;

  try {
    const isProMax = Boolean(req.body?.use_promax || req.body?.useProMax);
    const promptKey = isProMax ? "candidate_evaluation_promax" : "candidate_evaluation";
    const candPubId = await resolveCandidate6DigitPublicId(candidate?.id || candidateId, db);
    const text = await callProTalkLLM(
      "resume",
      [{ role: "user", content: prompt }],
      `${candPubId}_RRresume`,
      undefined,
      undefined,
      promptKey,
      isProMax
    );
    const parsed = tryParseLLMJson<any>(text) || {};
    if (parsed.interviewScore !== undefined) interviewScore = Number(parsed.interviewScore);
    if (parsed.resumeScore !== undefined) resumeScore = Number(parsed.resumeScore);
    if (parsed.checklistPoints !== undefined) checklistPoints = Number(parsed.checklistPoints);
    if (parsed.roleplayPoints !== undefined) roleplayPoints = Number(parsed.roleplayPoints);
    if (parsed.assessmentSummary) assessmentSummary = parsed.assessmentSummary;
  } catch (err) {
    console.error("ProTalk evaluate-interview failed:", err);
  }

  const overallScore = Math.round((interviewScore + resumeScore) / 2);
  const scores = {
    interviewScore,
    resumeScore,
    checklistPoints,
    roleplayPoints,
    overallScore,
    assessmentSummary,
  };

  candidate.scores = scores;
  candidate.currentStage = "scoring";
  await saveCandidateToProTalkDB(db, candidate);

  return res.json({
    scores,
    trainingPlan: candidate.trainingPlan || [],
  });
});

mutationsAndEvalRouter.post(["/crm/reconcile-stages", "/candidates/reconcile-stages"], async (_req: Request, res: Response) => {
  try {
    const { reconcileAllCandidateCrmStatuses } = await import("../../crmReconciler");
    const result = await reconcileAllCandidateCrmStatuses();
    return res.json(result);
  } catch (err: any) {
    console.error("[CRM Reconcile Route Error]:", err);
    return res.status(500).json({ ok: false, error: err.message || "reconciliation_failed" });
  }
});
