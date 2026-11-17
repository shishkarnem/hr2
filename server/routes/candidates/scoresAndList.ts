import { Router, Request, Response } from "express";
import { getProTalkDB } from "../../db";
import {
  extractStandardFieldsFromCandidateRow,
  extractCustomFieldsFromCandidateRow,
} from "../../../src/lib/candidateFields";

export const scoresAndListRouter = Router();

scoresAndListRouter.get(["/candidate/scores", "/candidates/scores"], async (req: Request, res: Response) => {
  try {
    const candId = String(req.query.candidate_id || req.query.id || "");
    const cleanId = candId.replace(/^candidate/i, "").replace(/^cand/i, "").trim();

    const db = await getProTalkDB();
    const cand = await db.get(
      `SELECT * FROM candidates WHERE id = ? OR CAST(public_id AS TEXT) = ? OR id = ? OR CAST(public_id AS TEXT) = ? LIMIT 1`,
      [candId, cleanId, `candidate${cleanId}`, candId]
    );

    if (!cand) return res.status(404).json({ ok: false, error: "not_found" });

    const [scoreRow, stageProgress] = await Promise.all([
      db.get(`SELECT * FROM candidate_scores WHERE candidate_id = ? OR candidate_id = ? LIMIT 1`, [
        cand.id,
        cand.public_id ? String(cand.public_id) : cand.id,
      ]),
      db.all(`SELECT stage, best_score, attempts, passed_at FROM candidate_stage_progress WHERE candidate_id = ? OR candidate_id = ?`, [
        cand.id,
        cand.public_id ? String(cand.public_id) : cand.id,
      ]),
    ]);

    const trainingPassed = (stageProgress || []).filter((p: any) => p.passed_at).map((p: any) => p.stage);
    const certified =
      trainingPassed.includes("professional") &&
      trainingPassed.includes("product") &&
      (trainingPassed.includes("system") || trainingPassed.includes("systems"));

    const resumeScore =
      scoreRow?.resume_score != null
        ? Number(scoreRow.resume_score)
        : cand.resume_score != null
        ? Number(cand.resume_score)
        : undefined;
    const checklistScore =
      scoreRow?.checklist_score != null
        ? Number(scoreRow.checklist_score)
        : cand.checklist_score != null
        ? Number(cand.checklist_score)
        : undefined;
    const situationsScore =
      scoreRow?.situations_score != null
        ? Number(scoreRow.situations_score)
        : cand.situations_score != null
        ? Number(cand.situations_score)
        : undefined;
    const interviewScore =
      scoreRow?.interview_score != null
        ? Number(scoreRow.interview_score)
        : cand.interview_score != null
        ? Number(cand.interview_score)
        : undefined;
    const overallScore =
      scoreRow?.overall_score != null
        ? Number(scoreRow.overall_score)
        : cand.score != null
        ? Number(cand.score)
        : undefined;

    const parseFb = (raw: any) => {
      if (!raw) return null;
      if (typeof raw === "object") return raw;
      try {
        return JSON.parse(raw);
      } catch {
        return raw;
      }
    };

    const resumeFeedback = parseFb(
      scoreRow?.candidate_resume_feedback || scoreRow?.resume_feedback || cand.resume_ai_feedback
    );
    const checklistFeedback = parseFb(
      scoreRow?.candidate_checklist_feedback || scoreRow?.checklist_feedback || cand.checklist_ai_feedback
    );
    const situationsFeedback = parseFb(
      scoreRow?.candidate_situations_feedback || scoreRow?.situations_feedback || cand.situations_ai_feedback
    );
    const assessmentSummary = scoreRow?.assessment_summary || "";

    const scoresObj = {
      overallScore: overallScore ?? 0,
      resumeScore,
      checklistScore,
      situationsScore,
      interviewScore,
      assessmentSummary,
      resumeFeedback,
      checklistFeedback,
      situationsFeedback,
      updatedAt: scoreRow?.updated_at || cand.updated_at,
    };

    return res.json({
      ok: true,
      scores: scoresObj,
      resume_score: resumeScore,
      checklist_score: checklistScore,
      situations_score: situationsScore,
      interview_score: interviewScore,
      overall_score: overallScore,
      assessment_summary: assessmentSummary,
      resume_feedback: resumeFeedback,
      checklist_feedback: checklistFeedback,
      situations_feedback: situationsFeedback,
      crm_stage: cand.crm_stage || cand.stage || "registration",
      stage: cand.stage || cand.crm_stage || "registration",
      current_stage: cand.current_stage || cand.stage || "registration",
      training_passed: trainingPassed,
      certified: certified || Boolean(cand.certified),
      training_charged_at: cand.training_charged_at,
      interview_charged_at: cand.interview_charged_at,
      updated_at: scoreRow?.updated_at || cand.updated_at,
    });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err.message || "scores_failed" });
  }
});

scoresAndListRouter.post(["/candidate/scores", "/candidates/scores"], async (req: Request, res: Response) => {
  try {
    const { candidate_id, scores } = req.body;
    const cleanId = String(candidate_id || "").replace(/^candidate/i, "").replace(/^cand/i, "").trim();

    const db = await getProTalkDB();
    const cand = await db.get(
      `SELECT id, score, data_json FROM candidates WHERE id = ? OR CAST(public_id AS TEXT) = ? LIMIT 1`,
      [candidate_id, cleanId]
    );

    if (cand && scores) {
      let dj: any = {};
      try {
        if (cand.data_json) dj = JSON.parse(cand.data_json);
      } catch {}
      dj.scores = scores;

      await db.run(`UPDATE candidates SET score = ?, data_json = ?, updated_at = NOW() WHERE id = ?`, [
        scores.overallScore ?? cand.score ?? 0,
        JSON.stringify(dj),
        cand.id,
      ]);
    }

    return res.json({ ok: true });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err.message || "scores_save_failed" });
  }
});

scoresAndListRouter.get(["/candidates", "/candidate"], async (req: Request, res: Response) => {
  try {
    const db = await getProTalkDB();
    const projectIdFilter = String(req.query.project_id || req.query.projectId || "").trim();
    const employerIdFilter = String(req.query.employer_id || req.query.employerId || "").trim();

    let whereSql = "";
    const whereParams: any[] = [];
    if (projectIdFilter) {
      const cleanPid = projectIdFilter.replace(/^vac_?/i, "").trim();
      whereSql = "WHERE project_id = ? OR project_id = ?";
      whereParams.push(projectIdFilter, cleanPid);
    } else if (employerIdFilter) {
      const cleanEmp = employerIdFilter.replace(/^emp-?/i, "").trim();
      const empProjs =
        (await db.all(`SELECT id, public_id FROM projects WHERE employer_id IN (?, ?, ?)`, [
          employerIdFilter,
          cleanEmp,
          `emp-${cleanEmp}`,
        ])) || [];
      const pids = empProjs.flatMap((p: any) => [String(p.id), String(p.public_id || "")].filter(Boolean));
      if (pids.length === 0) return res.json([]);
      const ph = pids.map(() => "?").join(",");
      whereSql = `WHERE project_id IN (${ph})`;
      whereParams.push(...pids);
    }

    const [projs, comps, scoresRows, rows] = await Promise.all([
      db.all(`SELECT id, public_id, company_id, company_name, role_name FROM projects`),
      db.all(`SELECT id, public_id, name FROM companies`),
      db.all(`SELECT candidate_id, overall_score, interview_score, resume_score, checklist_score, situations_score, assessment_summary, training_summary_score FROM candidate_scores`),
      db.all(
        `SELECT id, public_id, legacy_public_id, project_id, company_id, role_name, full_name, email, phone,
                stage, current_stage, crm_stage, crm_stage_manual, score, overall_score,
                resume_score, checklist_score, situations_score, interview_score,
                registered_via, avatar_url, resume_url,
                social_telegram, social_whatsapp, social_instagram, social_vk, social_max, social_setka, social_github,
                gender, country, region, city, citizenship, work_experience, employment_type,
                specializations, work_schedule, desired_commute_time, desired_salary, education,
                languages, skills, driving_experience,
                standard_fields_json, custom_fields_json, notes,
                interview_charged_at, training_charged_at, created_at, updated_at, last_login_at
         FROM candidates ${whereSql} ORDER BY created_at DESC`,
        whereParams
      ),
    ]);

    const projMap = new Map<string, any>();
    for (const p of projs || []) {
      projMap.set(String(p.id), p);
      if (p.public_id) projMap.set(String(p.public_id), p);
    }
    const compMap = new Map<string, any>();
    for (const c of comps || []) {
      compMap.set(String(c.id), c);
      if (c.public_id) compMap.set(String(c.public_id), c);
    }
    const scoreMap = new Map<string, any>();
    for (const s of scoresRows || []) {
      if (s.candidate_id) scoreMap.set(String(s.candidate_id), s);
    }

    if (!rows || rows.length === 0) return res.json([]);

    const mapped = rows.map((c: any) => {
      const proj = c.project_id ? projMap.get(String(c.project_id)) : null;
      const effectiveCompanyId = proj?.company_id || c.company_id || null;
      const comp = effectiveCompanyId ? compMap.get(String(effectiveCompanyId)) : null;
      const sc = scoreMap.get(String(c.id)) || {};
      const stdFields = extractStandardFieldsFromCandidateRow(c);
      const custFields = extractCustomFieldsFromCandidateRow(c);
      const overallScore = Number(sc.overall_score ?? sc.interview_score ?? c.score ?? 0);
      return {
        ...c,
        company_id: effectiveCompanyId,
        companyId: effectiveCompanyId,
        companyName: comp?.name || proj?.company_name || c.company_name || "",
        projectId: c.project_id,
        roleName: c.role_name || proj?.role_name || "",
        name:
          c.full_name ||
          stdFields.full_name ||
          c.email ||
          (c.public_id ? `Кандидат #${c.public_id}` : "Кандидат"),
        fullName: c.full_name || stdFields.full_name || "",
        publicId: c.public_id,
        currentStage: c.current_stage || "terms",
        crmStage: c.crm_stage || "new",
        registeredVia: c.registered_via || "telegram",
        avatarUrl: c.avatar_url || "",
        resumeUrl: c.resume_url || stdFields.resume_url || "",
        socialTelegram: c.social_telegram || stdFields.social_telegram || "",
        socialWhatsapp: c.social_whatsapp || stdFields.social_whatsapp || "",
        socialInstagram: c.social_instagram || stdFields.social_instagram || "",
        socialVk: c.social_vk || stdFields.social_vk || "",
        socialMax: c.social_max || stdFields.social_max || "",
        socialSetka: c.social_setka || stdFields.social_setka || "",
        socialGithub: c.social_github || stdFields.social_github || "",
        standardFields: stdFields,
        standard_fields: stdFields,
        customFields: custFields,
        custom_fields: custFields,
        score: overallScore,
        trainingSummaryScore: sc.training_summary_score ?? undefined,
        scores: {
          overallScore,
          resumeScore: sc.resume_score ?? c.resume_score ?? undefined,
          checklistScore: sc.checklist_score ?? c.checklist_score ?? undefined,
          situationsScore: sc.situations_score ?? c.situations_score ?? undefined,
          interviewScore: sc.interview_score ?? c.interview_score ?? overallScore,
          assessmentSummary: sc.assessment_summary || c.notes || undefined,
        },
      };
    });

    return res.json(mapped);
  } catch {
    return res.json([]);
  }
});

scoresAndListRouter.get("/candidates/:id", async (req: Request, res: Response) => {
  try {
    const db = await getProTalkDB();
    const rawId = req.params.id;
    const cleanId = String(rawId || "").replace(/^candidate/i, "").replace(/^cand/i, "").trim();
    const c = await db.get(
      `SELECT * FROM candidates WHERE id = ? OR CAST(public_id AS TEXT) = ? OR id = ? LIMIT 1`,
      [rawId, cleanId, cleanId]
    );
    if (!c) return res.status(404).json({ error: "Candidate not found" });

    const [scoreRow, stageProgress, attempts] = await Promise.all([
      db.get(`SELECT * FROM candidate_scores WHERE candidate_id = ? LIMIT 1`, [c.id]),
      db.all(`SELECT * FROM candidate_stage_progress WHERE candidate_id = ?`, [c.id]),
      db.all(`SELECT * FROM candidate_training_attempts WHERE candidate_id = ? ORDER BY created_at DESC`, [c.id]),
    ]);

    return res.json({
      ...c,
      standardFields: extractStandardFieldsFromCandidateRow(c),
      customFields: extractCustomFieldsFromCandidateRow(c),
      scoreDetails: scoreRow || null,
      stageProgress: stageProgress || [],
      trainingAttempts: attempts || [],
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "failed_to_load_candidate" });
  }
});
