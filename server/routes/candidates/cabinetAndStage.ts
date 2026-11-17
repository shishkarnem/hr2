import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import { saveCandidateToProTalkDB, getProTalkDB } from "../../db";
import { candidateSessions } from "../auth/helpers";
import {
  STANDARD_CANDIDATE_FIELDS,
  extractStandardFieldsFromCandidateRow,
  extractCustomFieldsFromCandidateRow,
  parseVacancyCandidateFieldsConfig,
} from "../../../src/lib/candidateFields";
import { isStageManual, pickMonotonicCrmStage } from "../../services/crmReconciler";

export const cabinetAndStageRouter = Router();

cabinetAndStageRouter.get(["/candidate/cabinet", "/candidates/cabinet"], async (req: Request, res: Response) => {
  try {
    const rawPubId =
      (req.query.public_id || req.query.id || req.query._public_id || req.headers["x-candidate-id"] || "") as string;
    let cleanPubId = rawPubId.replace(/^candidate/i, "").replace(/^cand/i, "").trim();

    const candToken = (req.headers["x-candidate-token"] || "") as string;
    let candEmailFromSession = "";
    if (candToken && (candidateSessions as any)[candToken]) {
      const sessCand = (candidateSessions as any)[candToken];
      cleanPubId = cleanPubId || sessCand.public_id || sessCand.id || "";
      candEmailFromSession = sessCand.email || "";
    }

    if (!cleanPubId && !candEmailFromSession) {
      return res.status(400).json({ ok: false, error: "no_id_provided" });
    }

    const db = await getProTalkDB();
    const cand = cleanPubId
      ? await db.get(
          `SELECT * FROM candidates WHERE CAST(public_id AS TEXT) = ? OR id = ? OR CAST(legacy_public_id AS TEXT) = ? LIMIT 1`,
          [cleanPubId, rawPubId, cleanPubId]
        )
      : candEmailFromSession
      ? await db.get(
          `SELECT * FROM candidates WHERE LOWER(email) = LOWER(?) ORDER BY created_at DESC LIMIT 1`,
          [candEmailFromSession]
        )
      : null;

    if (!cand) {
      return res.status(404).json({ ok: false, error: "candidate_not_found" });
    }

    const requestedProjId = ((req.query.project_id || req.query.vacancy_id || req.query.vac || "") as string)
      .replace(/^vac/i, "")
      .trim();
    const targetProjKey = requestedProjId || cand.project_id || "";
    const project = targetProjKey
      ? await db.get(
          `SELECT * FROM projects WHERE id = ? OR CAST(public_id AS TEXT) = ? OR slug = ? LIMIT 1`,
          [targetProjKey, String(targetProjKey), targetProjKey]
        )
      : cand.project_id
      ? await db.get(
          `SELECT * FROM projects WHERE id = ? OR CAST(public_id AS TEXT) = ? OR slug = ? LIMIT 1`,
          [cand.project_id, String(cand.project_id), cand.project_id]
        )
      : null;

    const [interviewBlocks, trainingBlocks, projCands] = project?.id
      ? await Promise.all([
          db.all(`SELECT * FROM interview_blocks WHERE project_id = ?`, [project.id]),
          db.all(`SELECT * FROM training_blocks WHERE project_id = ? ORDER BY order_index ASC`, [project.id]),
          db.all(
            `SELECT score, overall_score, interview_score, interview_charged_at, training_charged_at, crm_stage, stage FROM candidates WHERE project_id = ?`,
            [project.id]
          ),
        ])
      : [[], [], []];

    const effInterviewUsed = Math.max(
      Math.round(Number(project?.interview_used ?? 0)),
      (projCands || []).filter(
        (c: any) =>
          (c.score && Number(c.score) > 0) ||
          (c.overall_score && Number(c.overall_score) > 0) ||
          (c.interview_score && Number(c.interview_score) > 0) ||
          c.interview_charged_at != null
      ).length
    );
    const effTrainingUsed = Math.max(
      Math.round(Number(project?.training_used ?? 0)),
      (projCands || []).filter(
        (c: any) =>
          c.training_charged_at != null ||
          ["professional", "product", "systems", "certified"].includes(c.crm_stage || c.stage || "")
      ).length
    );

    let parsedChecklist: any[] = [];
    if (project?.checklist_questions) {
      try {
        const parsed = JSON.parse(project.checklist_questions);
        if (Array.isArray(parsed) && parsed.length > 0) parsedChecklist = parsed;
      } catch {}
    }
    if (parsedChecklist.length === 0) {
      const chkBlk = (interviewBlocks || []).find((b: any) => b.kind === "checklist");
      if (chkBlk?.payload) {
        try {
          const pl = typeof chkBlk.payload === "string" ? JSON.parse(chkBlk.payload) : chkBlk.payload;
          if (Array.isArray(pl.questions) && pl.questions.length > 0) parsedChecklist = pl.questions;
        } catch {}
      }
    }

    let parsedRoleplay: any[] = [];
    if (project?.roleplay_questions) {
      try {
        const parsed = JSON.parse(project.roleplay_questions);
        if (Array.isArray(parsed) && parsed.length > 0) parsedRoleplay = parsed;
      } catch {}
    }
    if (parsedRoleplay.length === 0) {
      const sitBlk = (interviewBlocks || []).find((b: any) => b.kind === "situations");
      if (sitBlk?.payload) {
        try {
          const pl = typeof sitBlk.payload === "string" ? JSON.parse(sitBlk.payload) : sitBlk.payload;
          if (Array.isArray(pl.situations) && pl.situations.length > 0) parsedRoleplay = pl.situations;
        } catch {}
      }
    }

    const compId = cand.company_id || project?.company_id;
    const empId = project?.employer_id || cand.employer_id;

    const [company, employerContactsRaw, scoreRow, stageProgress, trainingAttempts] = await Promise.all([
      compId
        ? db.get(
            `SELECT * FROM companies WHERE id = ? OR CAST(public_id AS TEXT) = ? OR slug = ? LIMIT 1`,
            [compId, String(compId), compId]
          )
        : Promise.resolve(null),
      empId
        ? db.get(
            `SELECT contact_email as email, contact_phone as phone, contact_telegram as telegram,
                    name as employer_name, contact_name,
                    interview_credits, interview_setup_credits, balance_limits, limits_json
             FROM employers WHERE id = ? OR CAST(public_id AS TEXT) = ? LIMIT 1`,
            [empId, String(empId)]
          )
        : Promise.resolve(null),
      db.get(`SELECT * FROM candidate_scores WHERE candidate_id = ? LIMIT 1`, [cand.id]),
      db.all(`SELECT * FROM candidate_stage_progress WHERE candidate_id = ? ORDER BY updated_at DESC`, [cand.id]),
      db.all(`SELECT * FROM candidate_training_attempts WHERE candidate_id = ? ORDER BY attempt_no DESC, created_at DESC`, [
        cand.id,
      ]),
    ]);

    const employerContacts = employerContactsRaw ? { ...employerContactsRaw } : null;
    if (employerContacts) {
      employerContacts.name =
        employerContacts.employer_name || employerContacts.contact_name || employerContacts.name || null;
    }

    let scores: any = null;
    if (scoreRow) {
      scores = {
        overallScore: Number(scoreRow.overall_score ?? scoreRow.interview_score ?? cand.score ?? 0),
        resumeScore: scoreRow.resume_score != null ? Number(scoreRow.resume_score) : undefined,
        checklistScore: scoreRow.checklist_score != null ? Number(scoreRow.checklist_score) : undefined,
        checklistPoints: scoreRow.checklist_points != null ? Number(scoreRow.checklist_points) : undefined,
        situationsScore: scoreRow.situations_score != null ? Number(scoreRow.situations_score) : undefined,
        roleplayPoints: scoreRow.roleplay_points != null ? Number(scoreRow.roleplay_points) : undefined,
        interviewScore: scoreRow.interview_score != null ? Number(scoreRow.interview_score) : undefined,
        assessmentSummary: scoreRow.assessment_summary || cand.notes || undefined,
        resumeFeedback: scoreRow.candidate_resume_feedback || scoreRow.resume_feedback || undefined,
        checklistFeedback: scoreRow.candidate_checklist_feedback || scoreRow.checklist_feedback || undefined,
        situationsFeedback: scoreRow.candidate_situations_feedback || scoreRow.situations_feedback || undefined,
        overallFeedback: scoreRow.candidate_overall_feedback || undefined,
      };
    } else if (cand.data_json) {
      try {
        const dj = JSON.parse(cand.data_json);
        if (dj.scores) scores = dj.scores;
      } catch {}
    }
    if (!scores && cand.score != null) {
      scores = {
        overallScore: Number(cand.score) || 0,
        resumeScore: cand.resume_score != null ? Number(cand.resume_score) : undefined,
        checklistScore: cand.checklist_score != null ? Number(cand.checklist_score) : undefined,
        situationsScore: cand.situations_score != null ? Number(cand.situations_score) : undefined,
        interviewScore: cand.interview_score != null ? Number(cand.interview_score) : undefined,
        assessmentSummary: cand.notes || undefined,
      };
    }

    const stdFields = extractStandardFieldsFromCandidateRow(cand);
    const custFields = extractCustomFieldsFromCandidateRow(cand);
    const candidateFieldsConfig = project?.candidate_fields_config
      ? parseVacancyCandidateFieldsConfig(project.candidate_fields_config)
      : { customFields: [] };

    return res.json({
      ok: true,
      candidate: {
        id: cand.id,
        public_id: cand.public_id,
        publicId: cand.public_id,
        name:
          cand.full_name ||
          stdFields.full_name ||
          cand.resume_name ||
          cand.email ||
          (cand.public_id ? `Кандидат #${cand.public_id}` : "Кандидат"),
        fullName: cand.full_name || stdFields.full_name || "",
        email: cand.email || stdFields.email || "",
        phone: cand.phone || stdFields.phone || "",
        projectId: cand.project_id,
        project_id: cand.project_id,
        companyId: project?.company_id || cand.company_id,
        company_id: project?.company_id || cand.company_id,
        roleName: cand.role_name || project?.role_name || "",
        currentStage: cand.current_stage || "terms",
        stage: cand.stage || "screening",
        crmStage: cand.crm_stage || "new",
        registeredVia: cand.registered_via || "email",
        avatarUrl: cand.avatar_url || "",
        avatar_url: cand.avatar_url || "",
        resumeUrl: cand.resume_url || stdFields.resume_url || "",
        resume_url: cand.resume_url || stdFields.resume_url || "",
        resumeText: cand.resume_text || "",
        socialTelegram: cand.social_telegram || stdFields.social_telegram || "",
        socialWhatsapp: cand.social_whatsapp || stdFields.social_whatsapp || "",
        socialInstagram: cand.social_instagram || stdFields.social_instagram || "",
        socialVk: cand.social_vk || stdFields.social_vk || "",
        socialMax: cand.social_max || stdFields.social_max || "",
        socialSetka: cand.social_setka || stdFields.social_setka || "",
        socialGithub: cand.social_github || stdFields.social_github || "",
        standardFields: stdFields,
        standard_fields: stdFields,
        customFields: custFields,
        custom_fields: custFields,
        scores: scores || undefined,
        stageProgress: stageProgress || [],
        trainingAttempts: trainingAttempts || [],
      },
      project: project
        ? {
            ...project,
            id: project.id,
            companyName: company?.name || project.company_name || "",
            companySlug: company?.slug || project.company_slug || undefined,
            companyPublicId: company?.public_id || undefined,
            publicId: project.public_id || undefined,
            employerId: project.employer_id,
            roleName: project.role_name,
            salaryTerms: project.salary_terms || project.payouts_text || undefined,
            scheduleTerms: project.schedule_terms || project.schedule_text || undefined,
            motivationText: project.motivation_text || undefined,
            customWiki: project.custom_wiki || project.system_text || undefined,
            checklistQuestions: parsedChecklist,
            roleplayQuestions: parsedRoleplay,
            has_interview_blocks: (interviewBlocks || []).length > 0,
            hasInterviewBlocks: (interviewBlocks || []).length > 0,
            has_training_blocks: (trainingBlocks || []).length > 0,
            hasTrainingBlocks: (trainingBlocks || []).length > 0,
            interviewLimit: Math.round(Number(project.interview_limit ?? project.max_interviews ?? 0)),
            interview_limit: Math.round(Number(project.interview_limit ?? project.max_interviews ?? 0)),
            interviewUsed: effInterviewUsed,
            interview_used: effInterviewUsed,
            trainingLimit: Math.round(Number(project.training_limit ?? project.max_trainings ?? 0)),
            training_limit: Math.round(Number(project.training_limit ?? project.max_trainings ?? 0)),
            trainingUsed: effTrainingUsed,
            training_used: effTrainingUsed,
            interview_blocks: interviewBlocks || [],
            training_blocks: trainingBlocks || [],
            candidateFieldsConfig,
            candidate_fields_config: candidateFieldsConfig,
            logoUrl: project.logo_url || company?.logo_url || undefined,
            slug: project.slug,
            status: project.status || "active",
            isPublished: Boolean(project.is_published),
          }
        : null,
      company: company
        ? {
            ...company,
            id: company.id,
            name: company.name,
            slug: company.slug,
            publicId: company.public_id,
            logoUrl: company.logo_url,
          }
        : null,
      employer_contacts: employerContacts,
      applications: [],
    });
  } catch (err: any) {
    console.error("[Candidate Cabinet Error]:", err);
    return res.status(500).json({ ok: false, error: err.message || "cabinet_failed" });
  }
});

cabinetAndStageRouter.get(["/candidate/flow-state", "/candidates/flow-state"], async (req: Request, res: Response) => {
  try {
    const candToken = (req.headers["x-candidate-token"] || req.query.token || req.query.candidate_id || "") as string;
    const cleanCandId = candToken.replace(/^candidate/i, "").replace(/^cand/i, "").trim();

    let cand: any = null;
    if (candToken && candidateSessions[candToken]) {
      cand = candidateSessions[candToken];
    }

    if (!cand && cleanCandId) {
      const db = await getProTalkDB();
      cand = await db.get(
        `SELECT * FROM candidates WHERE CAST(public_id AS TEXT) = ? OR id = ? LIMIT 1`,
        [cleanCandId, candToken]
      );
    }

    const stage = cand?.current_stage || "terms";
    return res.json({ ok: true, stage, data: { stage } });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err.message || "flow_state_failed", stage: "terms" });
  }
});

cabinetAndStageRouter.post(["/candidate/stage", "/candidates/stage"], async (req: Request, res: Response) => {
  try {
    const { _stage, candidate_id } = req.body;
    const candToken = (req.headers["x-candidate-token"] || candidate_id || "") as string;
    const cleanCandId = candToken.replace(/^candidate/i, "").replace(/^cand/i, "").trim();

    if (_stage && cleanCandId) {
      const db = await getProTalkDB();
      const st = String(_stage).toLowerCase();

      const candRow = await db.get(
        "SELECT * FROM candidates WHERE CAST(public_id AS TEXT) = ? OR id = ? LIMIT 1",
        [cleanCandId, candToken]
      );

      let crmSt = st;
      if (st === "registration" || st === "terms") {
        crmSt = "registration";
      } else if (st === "interview" || st === "resume") {
        crmSt = "screening";
      } else if (st === "checklist") {
        crmSt = "checklist";
      } else if (st === "situations") {
        crmSt = "situations";
      } else if (st === "scoring") {
        const [scoreRow, projRow] = await Promise.all([
          candRow
            ? db.get("SELECT overall_score, resume_score FROM candidate_scores WHERE candidate_id = ? LIMIT 1", [
                candRow.id,
              ])
            : Promise.resolve(null),
          candRow?.project_id
            ? db.get("SELECT interview_pass_score FROM projects WHERE id = ? LIMIT 1", [candRow.project_id])
            : Promise.resolve(null),
        ]);
        const passScore = Number(projRow?.interview_pass_score ?? 70);
        const candScore = Number(scoreRow?.overall_score ?? candRow?.score ?? 0);
        crmSt = candScore >= passScore ? "interview_success" : "interview_reject";
      } else if (st === "training") {
        if (candRow) {
          const passedRows =
            (await db.all("SELECT stage FROM candidate_stage_progress WHERE candidate_id = ? AND passed_at IS NOT NULL", [
              candRow.id,
            ])) || [];
          const passedSet = new Set(passedRows.map((r: any) => String(r.stage).toLowerCase()));
          if (
            passedSet.has("professional") &&
            passedSet.has("product") &&
            (passedSet.has("systems") || passedSet.has("system"))
          ) {
            crmSt = "certified";
          } else if (passedSet.has("professional") && passedSet.has("product")) {
            crmSt = "systems";
          } else if (passedSet.has("professional")) {
            crmSt = "product";
          } else {
            crmSt = "professional";
          }
        } else {
          crmSt = "professional";
        }
      } else if (st === "certified") {
        crmSt = "certified";
      }

      const curCrmStage = candRow?.crm_stage || candRow?.stage || candRow?.current_stage || "registration";
      const monotonicCrm = pickMonotonicCrmStage(curCrmStage, crmSt);
      const manualLocked = candRow ? isStageManual(candRow.crm_stage_manual) : false;

      if (!manualLocked) {
        await db.run(
          `UPDATE candidates
           SET current_stage = ?, stage = ?, crm_stage = ?, updated_at = NOW()
           WHERE CAST(public_id AS TEXT) = ? OR id = ?`,
          [monotonicCrm, monotonicCrm, monotonicCrm, cleanCandId, candToken]
        );
      } else {
        await db.run(
          `UPDATE candidates SET updated_at = NOW() WHERE CAST(public_id AS TEXT) = ? OR id = ?`,
          [cleanCandId, candToken]
        );
      }
    }

    return res.json({ ok: true, stage: _stage, data: _stage });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err.message || "stage_failed" });
  }
});

cabinetAndStageRouter.post(["/candidate/profile", "/candidates/profile"], async (req: Request, res: Response) => {
  try {
    const { _token, _patch, _new_email, _new_password, _current_password, candidate_id } = req.body;
    const token = (_token || req.headers["x-candidate-token"] || "") as string;
    const candId = (candidate_id || "") as string;
    const cleanCandId = candId.replace(/^candidate/i, "").replace(/^cand/i, "").trim();

    const db = await getProTalkDB();
    let cand: any = null;

    if (candId) {
      cand = await db.get(`SELECT * FROM candidates WHERE id = ? OR CAST(public_id AS TEXT) = ? LIMIT 1`, [
        candId,
        cleanCandId,
      ]);
    }
    if (!cand && token) {
      const cleanTok = token.replace(/^candidate/i, "").replace(/^cand/i, "").trim();
      cand = await db.get(`SELECT * FROM candidates WHERE id = ? OR CAST(public_id AS TEXT) = ? LIMIT 1`, [
        token,
        cleanTok,
      ]);
      if (!cand) {
        try {
          cand = await db.get(
            `SELECT c.* FROM candidate_sessions s JOIN candidates c ON s.candidate_id = c.id WHERE s.token = ? OR s.id = ? LIMIT 1`,
            [token, token]
          );
        } catch {}
      }
    }

    if (!cand) {
      return res.json({ ok: false, error: "bad_token" });
    }

    if (_new_password) {
      if (String(_new_password).length < 8) {
        return res.json({ ok: false, error: "bad_password" });
      }
      if (cand.password_hash) {
        const isMatch = cand.password_hash.startsWith("$2")
          ? bcrypt.compareSync(String(_current_password || ""), cand.password_hash)
          : cand.password_hash === String(_current_password || "");
        if (!isMatch) {
          return res.json({ ok: false, error: "wrong_current_password" });
        }
      }
    }

    if (_new_email) {
      const nextEmail = String(_new_email).trim().toLowerCase();
      const existing = await db.get(
        `SELECT id FROM candidates WHERE LOWER(email) = ? AND id != ? AND project_id = ? LIMIT 1`,
        [nextEmail, cand.id, cand.project_id]
      );
      if (existing) {
        return res.json({ ok: false, error: "email_taken" });
      }
    }

    const p = _patch || req.body || {};
    const curStd = extractStandardFieldsFromCandidateRow(cand);
    const curCust = extractCustomFieldsFromCandidateRow(cand);
    const incomingStd = p.standard_fields || p.standardFields || {};
    const incomingCust = p.custom_fields || p.customFields || {};

    const nextStd: Record<string, any> = { ...curStd, ...incomingStd };
    for (const def of STANDARD_CANDIDATE_FIELDS) {
      if (p[def.key] !== undefined) {
        nextStd[def.key] = p[def.key];
      }
    }
    if (p.name || p.full_name) nextStd.full_name = p.name || p.full_name;
    if (_new_email) nextStd.email = String(_new_email).trim().toLowerCase();

    const nextCust: Record<string, any> = { ...curCust, ...incomingCust };

    const updatedHash = _new_password ? bcrypt.hashSync(String(_new_password), 8) : cand.password_hash;

    const updatedCandObj = {
      ...cand,
      full_name: nextStd.full_name || cand.full_name,
      phone: nextStd.phone !== undefined ? nextStd.phone : cand.phone,
      avatar_url:
        p.avatar_url !== undefined ? p.avatar_url : p.avatarUrl !== undefined ? p.avatarUrl : cand.avatar_url,
      resume_url:
        nextStd.resume_url !== undefined
          ? nextStd.resume_url
          : p.resumeUrl !== undefined
          ? p.resumeUrl
          : cand.resume_url,
      social_telegram: nextStd.social_telegram !== undefined ? nextStd.social_telegram : cand.social_telegram,
      social_whatsapp: nextStd.social_whatsapp !== undefined ? nextStd.social_whatsapp : cand.social_whatsapp,
      social_instagram: nextStd.social_instagram !== undefined ? nextStd.social_instagram : cand.social_instagram,
      social_vk: nextStd.social_vk !== undefined ? nextStd.social_vk : cand.social_vk,
      social_max: nextStd.social_max !== undefined ? nextStd.social_max : cand.social_max,
      social_setka: nextStd.social_setka !== undefined ? nextStd.social_setka : cand.social_setka,
      social_github: nextStd.social_github !== undefined ? nextStd.social_github : cand.social_github,
      email: _new_email ? String(_new_email).trim().toLowerCase() : nextStd.email || cand.email,
      password_hash: updatedHash,
      standard_fields: nextStd,
      custom_fields: nextCust,
    };
    await saveCandidateToProTalkDB(db, updatedCandObj);
    if (updatedHash && updatedHash !== cand.password_hash) {
      await db.run(`UPDATE candidates SET password_hash = ? WHERE id = ?`, [updatedHash, cand.id]);
    }

    return res.json({ ok: true, standard_fields: nextStd, custom_fields: nextCust });
  } catch (err: any) {
    console.error("[Candidate Profile Update Error]:", err);
    return res.status(500).json({ ok: false, error: err.message || "profile_update_failed" });
  }
});

cabinetAndStageRouter.get(["/candidate/applications", "/candidates/applications"], async (req: Request, res: Response) => {
  try {
    const email = (req.query.email || "") as string;
    if (!email) return res.json({ ok: true, applications: [] });

    const db = await getProTalkDB();
    const apps =
      (await db.all(
        `SELECT c.id as candidate_id, c.public_id, c.project_id, c.company_id, c.role_name, c.current_stage,
                comp.name as company_name, comp.slug as company_slug, comp.public_id as company_public_id,
                proj.slug as project_slug, proj.public_id as project_public_id
         FROM candidates c
         LEFT JOIN companies comp ON c.company_id = comp.id
         LEFT JOIN projects proj ON c.project_id = proj.id
         WHERE LOWER(c.email) = LOWER(?)
         ORDER BY c.created_at DESC`,
        [email]
      )) || [];

    return res.json({ ok: true, applications: apps });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err.message || "applications_failed" });
  }
});
