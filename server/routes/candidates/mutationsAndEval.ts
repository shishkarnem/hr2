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

    try {
      const { dispatchVacancyBellAndPushToResponsibles } = await import(
        "../../services/notifications/vacancyResponsiblesResolver"
      );
      const { primaryLink } = await dispatchVacancyBellAndPushToResponsibles(db, {
        projectId: targetProjectId,
        projRow: projRow,
        eventKey: "new_candidate",
        kind: "new_candidate",
        title: `Новый отклик: ${candidateFullName}`,
        body: `Вакансия «${targetRoleName}». Новый кандидат в системе.`,
        linkBuilder: (pub) => `/emp${pub}/crm?candidate=${encodeURIComponent(String(nextPubId))}`,
        meta: { candidate_id: String(nextPubId), project_id: targetProjectId },
      });
      if (targetProjectId) {
        const { sendVacancyTelegramNotification } = await import("../../services/telegram");
        await sendVacancyTelegramNotification(
          db,
          String(targetProjectId),
          `🔔 <b>Новый кандидат!</b>\n👤 ${candidateFullName}\n💼 Вакансия: ${targetRoleName}`,
          {
            eventKey: "new_candidate",
            dedupKey: `new_cand_${nextPubId}`,
            button: { text: "👤 Открыть кандидата в CRM", url: primaryLink },
          }
        );
      }
    } catch {}

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

mutationsAndEvalRouter.put("/candidates/:id/fields", async (req: Request, res: Response) => {
  try {
    const db = await getProTalkDB();
    const rawId = String(req.params.id || "").trim();
    const cleanId = rawId.replace(/^candidate/i, "").replace(/^cand/i, "").trim();
    const existingRow = await db.get(
      `SELECT * FROM candidates
       WHERE id = ? OR CAST(public_id AS TEXT) = ? OR id = ? OR CAST(public_id AS TEXT) = ?
          OR CAST(legacy_public_id AS TEXT) = ?
       LIMIT 1`,
      [rawId, cleanId, cleanId, rawId, cleanId]
    );

    if (!existingRow) {
      return res.status(404).json({ ok: false, error: "Кандидат не найден" });
    }

    const curStd = extractStandardFieldsFromCandidateRow(existingRow);
    const curCust = extractCustomFieldsFromCandidateRow(existingRow);
    const bodyStd = req.body?.standardFields || req.body?.standard_fields || {};
    const bodyCust = req.body?.customFields || req.body?.custom_fields || {};

    const nextStd: Record<string, any> = { ...curStd, ...bodyStd };
    for (const def of STANDARD_CANDIDATE_FIELDS) {
      if (req.body?.[def.key] !== undefined) {
        nextStd[def.key] = req.body[def.key];
      }
    }
    if (nextStd.telegram !== undefined && nextStd.social_telegram === undefined) {
      nextStd.social_telegram = nextStd.telegram;
    }
    if (nextStd.telegram_alt !== undefined && !nextStd.social_telegram) {
      nextStd.social_telegram = nextStd.telegram_alt;
    }

    const nextCust: Record<string, any> = { ...curCust, ...bodyCust };
    const toStrVal = (v: any) => (Array.isArray(v) ? v.join(", ") : v !== undefined && v !== null ? String(v) : undefined);

    const mergedCand: Record<string, any> = {
      ...existingRow,
      id: existingRow.id,
      full_name: nextStd.full_name !== undefined ? String(nextStd.full_name || "") : existingRow.full_name,
      phone: nextStd.phone !== undefined ? String(nextStd.phone || "") : existingRow.phone,
      email: nextStd.email !== undefined ? String(nextStd.email || "").trim().toLowerCase() || existingRow.email : existingRow.email,
      resume_url: nextStd.resume_url !== undefined ? String(nextStd.resume_url || "") : existingRow.resume_url,
      social_telegram: nextStd.social_telegram !== undefined ? String(nextStd.social_telegram || "") : existingRow.social_telegram,
      social_whatsapp: nextStd.social_whatsapp !== undefined ? String(nextStd.social_whatsapp || "") : existingRow.social_whatsapp,
      social_instagram: nextStd.social_instagram !== undefined ? String(nextStd.social_instagram || "") : existingRow.social_instagram,
      social_vk: nextStd.social_vk !== undefined ? String(nextStd.social_vk || "") : existingRow.social_vk,
      social_max: nextStd.social_max !== undefined ? String(nextStd.social_max || "") : existingRow.social_max,
      social_setka: nextStd.social_setka !== undefined ? String(nextStd.social_setka || "") : existingRow.social_setka,
      social_github: nextStd.social_github !== undefined ? String(nextStd.social_github || "") : existingRow.social_github,
      gender: toStrVal(nextStd.gender) ?? existingRow.gender,
      country: toStrVal(nextStd.country) ?? existingRow.country,
      region: toStrVal(nextStd.region) ?? existingRow.region,
      city: toStrVal(nextStd.city) ?? existingRow.city,
      citizenship: toStrVal(nextStd.citizenship) ?? existingRow.citizenship,
      work_experience: toStrVal(nextStd.work_experience) ?? existingRow.work_experience,
      employment_type: toStrVal(nextStd.employment_type) ?? existingRow.employment_type,
      specializations: toStrVal(nextStd.specializations) ?? existingRow.specializations,
      work_schedule: toStrVal(nextStd.work_schedule) ?? existingRow.work_schedule,
      desired_commute_time: toStrVal(nextStd.desired_commute_time) ?? existingRow.desired_commute_time,
      desired_salary: toStrVal(nextStd.desired_salary) ?? existingRow.desired_salary,
      education: toStrVal(nextStd.education) ?? existingRow.education,
      languages: toStrVal(nextStd.languages) ?? existingRow.languages,
      skills: toStrVal(nextStd.skills) ?? existingRow.skills,
      driving_experience: toStrVal(nextStd.driving_experience) ?? existingRow.driving_experience,
      standard_fields: nextStd,
      standard_fields_json: nextStd,
      custom_fields: nextCust,
      custom_fields_json: nextCust,
    };

    await saveCandidateToProTalkDB(db, mergedCand);

    // Ensure cleared fields are also reflected in JSON columns explicitly
    await db.run(
      `UPDATE candidates SET standard_fields_json = ?, custom_fields_json = ?, updated_at = NOW() WHERE id = ?`,
      [JSON.stringify(nextStd), JSON.stringify(nextCust), existingRow.id]
    );

    const updatedRow = await db.get(`SELECT * FROM candidates WHERE id = ? LIMIT 1`, [existingRow.id]);

    return res.json({
      ok: true,
      standardFields: nextStd,
      standard_fields: nextStd,
      customFields: nextCust,
      custom_fields: nextCust,
      candidate: updatedRow || mergedCand,
    });
  } catch (err: any) {
    console.error("[PUT /candidates/:id/fields Error]:", err);
    return res.status(500).json({ ok: false, error: err?.message || "Не удалось сохранить поля кандидата" });
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

  const roleName = String(project?.role_name || candidate.role_name || candidate.roleName || "Специалист").trim();
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
