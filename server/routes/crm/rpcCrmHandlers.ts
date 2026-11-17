import crypto from "crypto";
import { Request, Response } from "express";
import { PgDBWrapper, saveCandidateToProTalkDB } from "../../db";
import {
  isStageManual,
  normalizeCrmStageName,
  pickMonotonicCrmStage,
} from "../../services/crmReconciler";
import {
  extractStandardFieldsFromCandidateRow,
  extractCustomFieldsFromCandidateRow,
  parseVacancyCandidateFieldsConfig,
} from "../../../src/lib/candidateFields";

function tryJson(val: any) {
  if (!val) return null;
  if (typeof val === "object") return val;
  try {
    return JSON.parse(val);
  } catch {
    return val;
  }
}

export async function handleListCandidatesRpc(db: PgDBWrapper, method: string, body: any, res: Response) {
  const filterProjectId = body?._project_id || body?.project_id || null;
  const empRaw = String(body?._employer_id || body?.employer_id || body?._employer || "").trim();
  const cleanEmp = empRaw.replace(/^emp-?/i, "");
  const isFastSuperAdmin = method === "employer_list_candidates" && cleanEmp === "100007" && !filterProjectId;

  const CANDIDATE_LIST_COLS = `id, public_id, project_id, company_id, full_name, email, phone, role_name, avatar_url, resume_url,
    stage, current_stage, crm_stage, crm_stage_manual, score, overall_score, resume_score,
    checklist_score, situations_score, interview_score, notes, hire_decision, hire_message,
    hire_decided_at, training_charged_at, interview_charged_at,
    standard_fields_json, custom_fields_json,
    (CASE WHEN resume_text IS NOT NULL OR resume_ai_feedback IS NOT NULL THEN 1 ELSE 0 END) AS has_resume_flag,
    created_at, updated_at`;

  // Fast parallel path for super-admin 100007 without project filter: run all 5 queries concurrently (no 1780-param IN lists)
  if (isFastSuperAdmin) {
    const [allProjects, allCompanies, rawCandList, allScores, allStageProg] = await Promise.all([
      db.all("SELECT id, public_id, company_id, company_public_id, company_name, employer_id, employer_public_id, role_name FROM projects"),
      db.all("SELECT id, public_id, employer_id, owner_employer_id, name, slug FROM companies"),
      db.all(`SELECT ${CANDIDATE_LIST_COLS} FROM candidates ORDER BY created_at DESC`),
      db.all("SELECT candidate_id, overall_score, interview_score, resume_score, checklist_score, situations_score FROM candidate_scores"),
      db.all("SELECT candidate_id, stage, passed_at, best_score, last_score FROM candidate_stage_progress"),
    ]);

    if (!rawCandList || rawCandList.length === 0) {
      return res.json({ data: [], error: null });
    }

    const projMap = new Map<string, any>();
    for (const p of allProjects || []) {
      projMap.set(String(p.id), p);
      if (p.public_id) projMap.set(String(p.public_id), p);
    }
    const compMap = new Map<string, any>();
    for (const c of allCompanies || []) {
      compMap.set(String(c.id), c);
      if (c.public_id) compMap.set(String(c.public_id), c);
    }
    const scoreMap = new Map<string, any>();
    for (const s of allScores || []) {
      if (s.candidate_id) scoreMap.set(String(s.candidate_id), s);
    }
    const stageProgByCand = new Map<string, any[]>();
    for (const sp of allStageProg || []) {
      const cid = String(sp.candidate_id);
      const list = stageProgByCand.get(cid) || [];
      list.push(sp);
      stageProgByCand.set(cid, list);
    }

    const enriched = buildEnrichedCandidates(rawCandList, projMap, compMap, scoreMap, stageProgByCand);
    return res.json({ data: enriched, error: null });
  }

  const [allProjects, allCompanies, emp] = await Promise.all([
    db.all(
      "SELECT id, public_id, company_id, company_public_id, company_name, employer_id, employer_public_id, role_name FROM projects"
    ),
    db.all("SELECT id, public_id, employer_id, owner_employer_id, name, slug FROM companies"),
    method === "employer_list_candidates" && empRaw
      ? db.get(
          "SELECT id, public_id, user_id, role, email FROM employers WHERE id = ? OR CAST(public_id AS TEXT) = ? OR user_id = ? OR CAST(public_id AS TEXT) = ? LIMIT 1",
          [empRaw, empRaw, empRaw, cleanEmp]
        )
      : Promise.resolve(null),
  ]);

  const projMap = new Map<string, any>();
  for (const p of allProjects || []) {
    projMap.set(String(p.id), p);
    if (p.public_id) projMap.set(String(p.public_id), p);
  }

  const compMap = new Map<string, any>();
  for (const c of allCompanies || []) {
    compMap.set(String(c.id), c);
    if (c.public_id) compMap.set(String(c.public_id), c);
  }

  let scopedProjIds: string[] | null = null;
  let scopedCompIds: string[] | null = null;
  let emptyScope = false;

  if (method === "employer_list_candidates") {
    // Exception strictly for super-admin 100007 (shishkarnem@gmail.com) or explicit admin without non-100007 emp override
    const isAdminAccount = Boolean(
      (emp && (emp.role === "admin" || String(emp.public_id) === "100007" || String(emp.email || "").toLowerCase() === "shishkarnem@gmail.com")) ||
        cleanEmp === "100007" ||
        (!empRaw && Boolean(body?.is_admin || body?.isAdmin))
    );

    if (!isAdminAccount) {
      if (!emp) {
        emptyScope = true;
      } else {
        const empIds = new Set(
          [emp.id, emp.public_id, emp.user_id, empRaw, cleanEmp].filter(Boolean).map((x) => String(x))
        );
        const empProjects = (allProjects || []).filter(
          (p: any) =>
            (p.employer_id && empIds.has(String(p.employer_id))) ||
            (p.employer_public_id && empIds.has(String(p.employer_public_id)))
        );
        const empCompanies = (allCompanies || []).filter(
          (c: any) =>
            (c.employer_id && empIds.has(String(c.employer_id))) ||
            (c.owner_employer_id && empIds.has(String(c.owner_employer_id)))
        );

        try {
          const idArr = Array.from(empIds);
          const memberRows =
            (await db.all(
              `SELECT company_id FROM company_members WHERE employer_id IN (${idArr.map(() => "?").join(",")}) AND status = 'active'`,
              idArr
            )) || [];
          for (const mr of memberRows) {
            const comp = compMap.get(String(mr.company_id));
            if (comp && !empCompanies.some((ec: any) => String(ec.id) === String(comp.id))) {
              empCompanies.push(comp);
            }
          }
        } catch {}

        const allowedProjSet = new Set<string>();
        const addProjId = (idVal: any) => {
          if (!idVal) return;
          const s = String(idVal);
          allowedProjSet.add(s);
          allowedProjSet.add(s.replace(/^vac_?/i, ""));
          if (!s.startsWith("vac_")) allowedProjSet.add(`vac_${s}`);
        };

        for (const p of empProjects) {
          addProjId(p.id);
          addProjId(p.public_id);
          if (p.company_id) {
            const comp = compMap.get(String(p.company_id));
            if (comp && !empCompanies.some((ec: any) => String(ec.id) === String(comp.id))) {
              empCompanies.push(comp);
            }
          }
        }

        const allowedCompSet = new Set<string>();
        for (const c of empCompanies) {
          if (c.id) allowedCompSet.add(String(c.id));
          if (c.public_id) {
            allowedCompSet.add(String(c.public_id));
            allowedCompSet.add(`comp-${c.public_id}`);
            allowedCompSet.add(`comp${c.public_id}`);
          }
        }

        for (const p of allProjects || []) {
          if (
            (p.company_id && allowedCompSet.has(String(p.company_id))) ||
            (p.company_public_id && allowedCompSet.has(String(p.company_public_id)))
          ) {
            addProjId(p.id);
            addProjId(p.public_id);
          }
        }

        scopedProjIds = Array.from(allowedProjSet);
        scopedCompIds = Array.from(allowedCompSet);
        if (scopedProjIds.length === 0 && scopedCompIds.length === 0) {
          emptyScope = true;
        }
      }
    }
  }

  if (emptyScope) {
    return res.json({ data: [], error: null });
  }

  let candWhereSql = "";
  const candParams: any[] = [];
  if (filterProjectId) {
    const cleanP = String(filterProjectId).replace(/^vac_?/i, "");
    if (scopedProjIds !== null && !scopedProjIds.includes(String(filterProjectId)) && !scopedProjIds.includes(cleanP)) {
      return res.json({ data: [], error: null });
    }
    candWhereSql = "WHERE (project_id = ? OR project_id = ?)";
    candParams.push(String(filterProjectId), cleanP);
  } else if (scopedProjIds !== null) {
    const clauses: string[] = [];
    if (scopedProjIds.length > 0) {
      clauses.push(`project_id IN (${scopedProjIds.map(() => "?").join(",")})`);
      candParams.push(...scopedProjIds);
    }
    if (scopedCompIds && scopedCompIds.length > 0) {
      clauses.push(`company_id IN (${scopedCompIds.map(() => "?").join(",")})`);
      candParams.push(...scopedCompIds);
    }
    if (clauses.length === 0) return res.json({ data: [], error: null });
    candWhereSql = `WHERE (${clauses.join(" OR ")})`;
  }

  const rawCandList =
    (await db.all(
      `SELECT ${CANDIDATE_LIST_COLS}
       FROM candidates
       ${candWhereSql}
       ORDER BY created_at DESC`,
      candParams
    )) || [];

  if (rawCandList.length === 0) {
    return res.json({ data: [], error: null });
  }

  const candIdSet = new Set<string>();
  for (const c of rawCandList) {
    if (c.id) candIdSet.add(String(c.id));
    if (c.public_id) candIdSet.add(String(c.public_id));
  }
  const candKeys = Array.from(candIdSet);
  const useInFilter = candKeys.length > 0 && candKeys.length <= 120;
  const candPh = useInFilter ? candKeys.map(() => "?").join(",") : "";

  const [allScores, allStageProg] = await Promise.all([
    useInFilter
      ? db.all(
          `SELECT candidate_id, overall_score, interview_score, resume_score, checklist_score, situations_score FROM candidate_scores WHERE candidate_id IN (${candPh})`,
          candKeys
        )
      : db.all(
          "SELECT candidate_id, overall_score, interview_score, resume_score, checklist_score, situations_score FROM candidate_scores"
        ),
    useInFilter
      ? db.all(
          `SELECT candidate_id, stage, passed_at, best_score, last_score FROM candidate_stage_progress WHERE candidate_id IN (${candPh})`,
          candKeys
        )
      : db.all("SELECT candidate_id, stage, passed_at, best_score, last_score FROM candidate_stage_progress"),
  ]);

  const scoreMap = new Map<string, any>();
  for (const s of allScores || []) {
    if (s.candidate_id) scoreMap.set(String(s.candidate_id), s);
  }

  const stageProgByCand = new Map<string, any[]>();
  for (const sp of allStageProg || []) {
    const cid = String(sp.candidate_id);
    const list = stageProgByCand.get(cid) || [];
    list.push(sp);
    stageProgByCand.set(cid, list);
  }

  const enriched = buildEnrichedCandidates(rawCandList, projMap, compMap, scoreMap, stageProgByCand);
  return res.json({ data: enriched, error: null });
}

function buildEnrichedCandidates(
  rawCandidates: any[],
  projMap: Map<string, any>,
  compMap: Map<string, any>,
  scoreMap: Map<string, any>,
  stageProgByCand: Map<string, any[]>
) {
  return rawCandidates.map((c: any) => {
    const proj = c.project_id ? projMap.get(String(c.project_id)) : null;
    const effectiveCompanyId = proj?.company_id || c.company_id || null;
    const comp = effectiveCompanyId ? compMap.get(String(effectiveCompanyId)) : null;
    const sc = scoreMap.get(String(c.id)) || {};
    const stdFields = extractStandardFieldsFromCandidateRow(c);
    const custFields = extractCustomFieldsFromCandidateRow(c);
    const overallScore = Number(
      sc.overall_score ?? sc.interview_score ?? c.score ?? c.overall_score ?? sc.resume_score ?? 0
    );
    const stageProg = stageProgByCand.get(String(c.id)) || [];
    const passedStages = stageProg
      .filter((sp: any) => sp.passed_at || Number(sp.best_score || sp.last_score || 0) >= 70)
      .map((sp: any) => sp.stage);
    const candStage = normalizeCrmStageName(c.crm_stage || c.stage || "registration");
    const isCertified =
      candStage === "certified" ||
      !!c.certified ||
      passedStages.length >= 3 ||
      stageProg.some((sp: any) => String(sp.stage).includes("cert"));
    const hasResume = Boolean(
      Number(c.has_resume_flag || 0) > 0 || sc.resume_score != null || c.resume_score != null || candStage !== "registration"
    );
    const hasChecklist = Boolean(
      sc.checklist_score != null ||
        c.checklist_score != null ||
        ["situations", "interview_reject", "interview_success", "professional", "product", "systems", "certified"].includes(
          candStage
        )
    );
    const hasSituations = Boolean(
      sc.situations_score != null ||
        c.situations_score != null ||
        ["interview_reject", "interview_success", "professional", "product", "systems", "certified"].includes(candStage)
    );
    const hasOverall = Boolean(
      overallScore > 0 ||
        ["interview_reject", "interview_success", "professional", "product", "systems", "certified"].includes(candStage)
    );
    const hasTraining = Boolean(
      passedStages.length > 0 ||
        ["professional", "product", "systems", "certified"].includes(candStage) ||
        c.training_charged_at
    );
    const pubId = c.public_id || c.id;

    return {
      ...c,
      id: c.id,
      public_id: pubId,
      company_id: effectiveCompanyId,
      company_name: comp?.name || proj?.company_name || "—",
      company_public_id: comp?.public_id || null,
      project_public_id: proj?.public_id || null,
      role_name: c.role_name || proj?.role_name || "—",
      full_name: c.full_name || stdFields.full_name || c.email || `Кандидат #${pubId}`,
      phone: c.phone || stdFields.phone || "",
      email: c.email || stdFields.email || "",
      resume_url: c.resume_url || stdFields.resume_url || "",
      overall_score: overallScore,
      resume_score: sc.resume_score ?? c.resume_score ?? null,
      checklist_score: sc.checklist_score ?? c.checklist_score ?? null,
      situations_score: sc.situations_score ?? c.situations_score ?? null,
      interview_score: sc.interview_score ?? c.interview_score ?? overallScore,
      assessment_summary: sc.assessment_summary || c.notes || "",
      standard_fields: stdFields,
      custom_fields: custFields,
      stage_progress: stageProg,
      training_passed: passedStages,
      trainingPassed: passedStages,
      has_resume: hasResume,
      has_checklist: hasChecklist,
      has_situations: hasSituations,
      has_overall: hasOverall,
      has_training: hasTraining,
      crm_stage: candStage,
      derived_stage: candStage,
      stage: candStage,
      certified: isCertified,
      hire_decision: c.hire_decision || "",
      hire_message: c.hire_message || "",
      hire_decided_at: c.hire_decided_at || null,
    };
  });
}

export async function handleCandidateFullDetailsRpc(db: PgDBWrapper, body: any, res: Response) {
  const { _candidate } = body;
  const cleanCand = String(_candidate || "").replace(/^candidate/i, "").replace(/^cand/i, "").trim();
  const cand = await db.get(
    "SELECT * FROM candidates WHERE id = ? OR CAST(public_id AS TEXT) = ? OR CAST(public_id AS TEXT) = ? OR id = ? LIMIT 1",
    [_candidate, String(_candidate), cleanCand, cleanCand]
  );
  if (!cand) return res.json({ ok: false, error: "not_found" });

  let candData: any = {};
  try {
    if (cand.data_json) candData = typeof cand.data_json === "string" ? JSON.parse(cand.data_json) : cand.data_json;
  } catch {}

  const proj = cand.project_id
    ? await db.get("SELECT * FROM projects WHERE id = ? OR CAST(public_id AS TEXT) = ? LIMIT 1", [
        cand.project_id,
        String(cand.project_id),
      ])
    : null;
  const effectiveCompId = proj?.company_id || cand.company_id;
  const comp = effectiveCompId
    ? await db.get("SELECT * FROM companies WHERE id = ? OR CAST(public_id AS TEXT) = ? LIMIT 1", [
        effectiveCompId,
        String(effectiveCompId),
      ])
    : null;

  const [
    scoreRowRaw,
    rawStageProgress,
    rawTrainingAttempts,
    checklistAnsRow,
    situationsAnsRow,
    candidateAnswers,
    rawInterviews,
    rawInterviewBlocks,
  ] = await Promise.all([
    db.get("SELECT * FROM candidate_scores WHERE candidate_id = ? OR candidate_id = ? LIMIT 1", [cand.id, String(cand.public_id || "")]),
    db.all("SELECT * FROM candidate_stage_progress WHERE candidate_id = ? OR candidate_id = ? ORDER BY updated_at DESC", [cand.id, String(cand.public_id || "")]),
    db.all("SELECT * FROM candidate_training_attempts WHERE candidate_id = ? OR candidate_id = ? ORDER BY attempt_no DESC, created_at DESC", [cand.id, String(cand.public_id || "")]),
    db.get("SELECT * FROM candidate_checklist_answers_v2 WHERE candidate_id = ? OR candidate_id = ? LIMIT 1", [cand.id, String(cand.public_id || "")]),
    db.get("SELECT * FROM candidate_situations_answers_v2 WHERE candidate_id = ? OR candidate_id = ? LIMIT 1", [cand.id, String(cand.public_id || "")]),
    db.all("SELECT * FROM candidate_answers WHERE candidate_id = ? OR candidate_id = ? ORDER BY created_at ASC", [cand.id, String(cand.public_id || "")]),
    db.all("SELECT * FROM interviews WHERE candidate_id = ? OR candidate_id = ? ORDER BY created_at DESC", [cand.id, String(cand.public_id || "")]).catch(() => []),
    cand.project_id
      ? db.all("SELECT * FROM interview_blocks WHERE project_id = ?", [cand.project_id])
      : db.all("SELECT * FROM interview_blocks LIMIT 10"),
  ]);

  const scoreRow = scoreRowRaw || {};
  const stageProgress = (rawStageProgress || []).map((sp: any) => ({
    ...sp,
    last_answers: tryJson(sp.last_answers),
    last_feedback: tryJson(sp.last_feedback),
    employer_summary: tryJson(sp.employer_summary),
  }));
  const trainingAttempts = (rawTrainingAttempts || []).map((ta: any) => ({
    ...ta,
    answers: tryJson(ta.answers),
    feedback: tryJson(ta.feedback),
  }));
  let blocksToUse = rawInterviewBlocks || [];
  if (blocksToUse.length === 0) {
    blocksToUse = (await db.all("SELECT * FROM interview_blocks LIMIT 10")) || [];
  }
  const interviewBlocks = blocksToUse.map((b: any) => ({
    ...b,
    payload: tryJson(b.payload),
  }));

  const stdFields = extractStandardFieldsFromCandidateRow(cand);
  const custFields = extractCustomFieldsFromCandidateRow(cand);
  const vacancyFieldsConfig = proj?.candidate_fields_config
    ? parseVacancyCandidateFieldsConfig(proj.candidate_fields_config)
    : { customFields: [] };

  const candidateObj = {
    ...candData,
    ...cand,
    id: cand.id,
    public_id: cand.public_id || cand.id,
    company_id: effectiveCompId || cand.company_id,
    role_name: cand.role_name || proj?.role_name || "",
    full_name: cand.full_name || stdFields.full_name || cand.resume_name || "",
    phone: cand.phone || stdFields.phone || "",
    email: cand.email || stdFields.email || "",
    resume_url: cand.resume_url || stdFields.resume_url || "",
    hire_decision: cand.hire_decision || "",
    hire_message: cand.hire_message || "",
    hire_decided_at: cand.hire_decided_at || null,
    standard_fields: stdFields,
    custom_fields: custFields,
  };

  const profileObj = {
    full_name: candidateObj.full_name,
    email: candidateObj.email,
    phone: candidateObj.phone,
    avatar_url: cand.avatar_url || "",
    social_telegram: cand.social_telegram || stdFields.social_telegram || "",
    social_whatsapp: cand.social_whatsapp || stdFields.social_whatsapp || "",
    social_instagram: cand.social_instagram || stdFields.social_instagram || "",
    social_vk: cand.social_vk || stdFields.social_vk || "",
    social_max: cand.social_max || stdFields.social_max || "",
    social_setka: cand.social_setka || stdFields.social_setka || "",
    social_github: cand.social_github || stdFields.social_github || "",
    standard_fields: stdFields,
    custom_fields: custFields,
  };

  const overallScore = Number(
    scoreRow.overall_score ?? scoreRow.interview_score ?? candData?.scores?.overallScore ?? cand.score ?? scoreRow.resume_score ?? 0
  );

  const scoresObj = {
    ...scoreRow,
    overall_score: overallScore,
    resume_score: scoreRow.resume_score ?? candData?.scores?.resumeScore ?? cand.resume_score ?? null,
    checklist_score: scoreRow.checklist_score ?? candData?.scores?.checklistPoints ?? cand.checklist_score ?? null,
    situations_score: scoreRow.situations_score ?? candData?.scores?.roleplayPoints ?? cand.situations_score ?? null,
    interview_score: scoreRow.interview_score ?? candData?.scores?.interviewScore ?? cand.interview_score ?? null,
    assessment_summary: scoreRow.assessment_summary || candData?.scores?.assessmentSummary || cand.notes || "",
    resume_feedback: tryJson(scoreRow.resume_feedback) || tryJson(cand.resume_ai_feedback),
    candidate_resume_feedback: tryJson(scoreRow.candidate_resume_feedback) || tryJson(cand.resume_ai_feedback),
    checklist_feedback: tryJson(scoreRow.checklist_feedback) || tryJson(cand.checklist_ai_feedback),
    candidate_checklist_feedback: tryJson(scoreRow.candidate_checklist_feedback) || tryJson(cand.checklist_ai_feedback),
    situations_feedback: tryJson(scoreRow.situations_feedback) || tryJson(cand.situations_ai_feedback),
    candidate_situations_feedback: tryJson(scoreRow.candidate_situations_feedback) || tryJson(cand.situations_ai_feedback),
    candidate_overall_feedback: tryJson(scoreRow.candidate_overall_feedback) || tryJson(cand.ai_overall_summary),
    employer_overall_feedback: tryJson(scoreRow.employer_overall_feedback) || tryJson(cand.ai_overall_summary),
    training_employer_feedback: tryJson(scoreRow.training_employer_feedback),
    training_candidate_feedback: tryJson(scoreRow.training_candidate_feedback),
  };

  const trainingSummaryObj = {
    training_summary_score: scoreRow.training_summary_score != null ? Number(scoreRow.training_summary_score) : null,
    training_summary_generated_at: scoreRow.training_summary_generated_at || null,
    training_employer_feedback: tryJson(scoreRow.training_employer_feedback) || null,
  };

  const cleanProj = proj
    ? (() => {
        const { data_json: _ignored, ...rest } = proj;
        return { ...rest, candidateFieldsConfig: vacancyFieldsConfig };
      })()
    : {};

  return res.json({
    ok: true,
    candidate: candidateObj,
    profile: profileObj,
    scores: scoresObj,
    training_summary: trainingSummaryObj,
    company: comp || {},
    project: cleanProj,
    stage_progress: stageProgress,
    training_attempts: trainingAttempts,
    interviews: rawInterviews || [],
    interview_blocks: interviewBlocks,
    interviewBlocks: interviewBlocks,
    answers: candidateAnswers || [],
    checklist_answers: checklistAnsRow ? tryJson(checklistAnsRow.answers) || {} : {},
    situations_answers: situationsAnsRow ? tryJson(situationsAnsRow.answers) || {} : {},
    candidate_answers: candidateAnswers || [],
  });
}

export async function handleCandidateStageAndDecisionRpc(db: PgDBWrapper, method: string, body: any, res: Response) {
  if (method === "employer_set_candidate_crm_stage") {
    const _candidate = body?._candidate;
    const targetStage = body?._crm_stage || body?._stage;
    const cleanCand = String(_candidate || "").replace(/^candidate/i, "").replace(/^cand/i, "").trim();
    const cand = await db.get(
      "SELECT * FROM candidates WHERE id = ? OR CAST(public_id AS TEXT) = ? OR CAST(public_id AS TEXT) = ? OR id = ? LIMIT 1",
      [_candidate, String(_candidate), cleanCand, cleanCand]
    );
    if (!cand) return res.json({ ok: false, error: "not_found" });

    if (targetStage) {
      await db.run(
        "UPDATE candidates SET crm_stage = ?, stage = ?, current_stage = ?, crm_stage_manual = 1, updated_at = NOW() WHERE id = ?",
        [targetStage, targetStage, targetStage, cand.id]
      );
      const updated = await db.get("SELECT * FROM candidates WHERE id = ?", [cand.id]);
      if (updated) await saveCandidateToProTalkDB(db, updated);
    }
    return res.json({ ok: true, crm_stage: targetStage });
  }

  if (method === "candidate_set_stage" || method === "candidate_advance_crm_stage") {
    const { _candidate, _stage } = body;
    const cleanCand = String(_candidate || "").replace(/^candidate/i, "").replace(/^cand/i, "").trim();
    const cand = await db.get(
      "SELECT * FROM candidates WHERE id = ? OR CAST(public_id AS TEXT) = ? OR CAST(public_id AS TEXT) = ? OR id = ? LIMIT 1",
      [_candidate, String(_candidate), cleanCand, cleanCand]
    );
    if (!cand) return res.json({ ok: false, error: "not_found" });

    const scoreRow = await db.get(
      "SELECT * FROM candidate_scores WHERE candidate_id = ? OR candidate_id = ? LIMIT 1",
      [cand.id, String(cand.public_id || "")]
    );

    const trainingStages = ["professional", "product", "systems", "certified"];
    if (trainingStages.includes(String(_stage))) {
      const resumeScore = cand.resume_score ?? scoreRow?.resume_score;
      const checklistScore = cand.checklist_score ?? scoreRow?.checklist_score;
      const situationsScore = cand.situations_score ?? scoreRow?.situations_score;

      const hasResumeAnswers = Boolean(
        (resumeScore != null && Number(resumeScore) > 0) ||
          cand.resume_ai_feedback ||
          (cand.resume_text && String(cand.resume_text).trim().length >= 20) ||
          (cand.resume_url && String(cand.resume_url).trim().length > 0)
      );
      const hasCheckAnswers = Boolean(
        (checklistScore != null && Number(checklistScore) > 0) ||
          (await db.get("SELECT 1 FROM candidate_checklist_answers_v2 WHERE candidate_id = ? OR candidate_id = ? LIMIT 1", [
            cand.id,
            String(cand.public_id || ""),
          ]))
      );
      const hasSitAnswers = Boolean(
        (situationsScore != null && Number(situationsScore) > 0) ||
          (await db.get("SELECT 1 FROM candidate_situations_answers_v2 WHERE candidate_id = ? OR candidate_id = ? LIMIT 1", [
            cand.id,
            String(cand.public_id || ""),
          ]))
      );

      const allStagesDone = Boolean(hasResumeAnswers && hasCheckAnswers && hasSitAnswers);
      const proj = cand.project_id
        ? await db.get("SELECT interview_pass_score FROM projects WHERE id = ? LIMIT 1", [cand.project_id])
        : null;
      const passScore = Number(proj?.interview_pass_score ?? 70);
      const finalScore = Number(
        cand.overall_score ?? scoreRow?.overall_score ?? cand.interview_score ?? scoreRow?.interview_score ?? cand.score ?? 0
      );

      if (!allStagesDone) {
        return res.json({
          ok: false,
          error: "interview_not_completed",
          message: "Для перехода на этап обучения необходимо завершить все 3 этапа собеседования: резюме, чек-лист и ситуации.",
        });
      }
      if (cand.crm_stage === "interview_reject" || (allStagesDone && finalScore < passScore)) {
        return res.json({
          ok: false,
          error: "interview_reject",
          message: "Кандидат не сдал собеседование (балл ниже проходного). Переход на этап обучения невозможен.",
        });
      }
    }

    if (_stage === "situations") {
      const checklistScore = cand.checklist_score ?? scoreRow?.checklist_score;
      const hasCheckAnswers = Boolean(
        (checklistScore != null && Number(checklistScore) > 0) ||
          (await db.get("SELECT 1 FROM candidate_checklist_answers_v2 WHERE candidate_id = ? OR candidate_id = ? LIMIT 1", [
            cand.id,
            String(cand.public_id || ""),
          ]))
      );
      if (!hasCheckAnswers) {
        return res.json({
          ok: false,
          error: "checklist_not_completed",
          message: "Для перехода к этапу ситуаций необходимо пройти квалификационный чек-лист.",
        });
      }
    }

    if (_stage === "checklist") {
      const resumeScore = cand.resume_score ?? scoreRow?.resume_score;
      const hasResume = Boolean((resumeScore != null && Number(resumeScore) > 0) || cand.resume_ai_feedback);
      if (!hasResume) {
        return res.json({
          ok: false,
          error: "screening_not_completed",
          message: "Для перехода к чек-листу необходимо пройти этап оценки резюме.",
        });
      }
    }

    const normalizedRequestedStage = normalizeCrmStageName(_stage);
    const finalTargetStage = pickMonotonicCrmStage(cand.crm_stage || cand.stage || cand.current_stage, normalizedRequestedStage);

    if (!isStageManual(cand.crm_stage_manual)) {
      await db.run(
        "UPDATE candidates SET crm_stage = ?, stage = ?, current_stage = ?, updated_at = NOW() WHERE id = ?",
        [finalTargetStage, finalTargetStage, finalTargetStage, cand.id]
      );
    }
    return res.json({ ok: true, stage: finalTargetStage });
  }

  if (method === "candidate_invite_decision") {
    const { _candidate, _decision, _reason, _message } = body;
    const cleanCand = String(_candidate || "").replace(/^candidate/i, "").replace(/^cand/i, "").trim();
    const cand = await db.get(
      "SELECT * FROM candidates WHERE id = ? OR CAST(public_id AS TEXT) = ? OR CAST(public_id AS TEXT) = ? OR id = ? LIMIT 1",
      [_candidate, String(_candidate), cleanCand, cleanCand]
    );
    if (!cand) return res.json({ ok: false, error: "not_found" });

    const msg = String(_message || _reason || "").trim();
    let hireDecision = "review";
    let inviteStatus = "review";
    let nextStage = cand.current_stage || "interview";
    let nextCrmStage = cand.crm_stage || "registration";

    if (_decision === "invited" || _decision === "approve" || _decision === "approved") {
      hireDecision = "invited";
      inviteStatus = "approved";
      if (["interview_reject", "screening", "registration", "checklist", "situations"].includes(cand.crm_stage)) {
        nextCrmStage = "interview_success";
      }
      nextStage = "training";
    } else if (_decision === "rejected" || _decision === "reject") {
      hireDecision = "rejected";
      inviteStatus = "rejected";
      nextCrmStage = "interview_reject";
    }

    await db.run(
      `UPDATE candidates SET
        hire_decision = ?,
        hire_decided_at = NOW(),
        hire_message = ?,
        current_stage = ?,
        crm_stage = ?,
        updated_at = NOW()
       WHERE id = ?`,
      [hireDecision, msg || null, nextStage, nextCrmStage, cand.id]
    );

    try {
      const notifId = crypto.randomUUID();
      const title =
        hireDecision === "invited"
          ? "Приглашение на работу!"
          : hireDecision === "review"
          ? "Ваша кандидатура на рассмотрении"
          : "Решение по вашей кандидатуре";
      const bodyTxt =
        msg ||
        (hireDecision === "invited"
          ? "Работодатель рассмотрел вашу анкету и пригласил вас на работу."
          : hireDecision === "review"
          ? "Ваша кандидатура передана на дополнительное рассмотрение руководству."
          : "К сожалению, в настоящий момент мы не готовы сделать предложение.");
      const link = `/cand${cand.public_id || cand.id}/profile`;

      await db.run(
        `INSERT INTO notifications (id, user_id, user_role, kind, title, body, link, meta_json, created_at, recipient_kind, candidate_id)
         VALUES (?, ?, 'candidate', 'hire_decision', ?, ?, ?, ?, NOW(), 'candidate', ?)`,
        [notifId, cand.user_id || null, title, bodyTxt, link, JSON.stringify({ hire_decision: hireDecision, candidate_id: cand.id }), cand.id]
      );
    } catch (e: any) {
      console.warn("Could not insert candidate decision notification:", e?.message);
    }

    const updated = await db.get("SELECT * FROM candidates WHERE id = ?", [cand.id]);
    if (updated) await saveCandidateToProTalkDB(db, updated);
    return res.json({
      ok: true,
      hire_decision: hireDecision,
      hire_message: msg || null,
      invite_status: inviteStatus,
      current_stage: nextStage,
      crm_stage: nextCrmStage,
    });
  }

  return null;
}

export async function handleCandidateFlowStateRpc(db: PgDBWrapper, body: any, res: Response) {
  const { _token, _candidate_id, candidate_id } = body;
  const tok = _candidate_id || candidate_id || _token || "";
  const cleanTok = String(tok || "").replace(/^candidate/i, "").replace(/^cand/i, "").trim();
  let cand = await db.get(
    "SELECT * FROM candidates WHERE id = ? OR CAST(public_id AS TEXT) = ? OR CAST(legacy_public_id AS TEXT) = ? LIMIT 1",
    [tok, cleanTok, cleanTok]
  );
  if (!cand && tok) {
    try {
      cand = await db.get(
        "SELECT c.* FROM candidate_sessions s JOIN candidates c ON s.candidate_id = c.id WHERE s.token = ? OR s.id = ? LIMIT 1",
        [tok, tok]
      );
    } catch {}
  }
  const proj = cand?.project_id
    ? await db.get("SELECT * FROM projects WHERE id = ? OR CAST(public_id AS TEXT) = ? LIMIT 1", [
        cand.project_id,
        String(cand.project_id),
      ])
    : null;
  const sc = cand?.id ? await db.get("SELECT * FROM candidate_scores WHERE candidate_id = ? LIMIT 1", [cand.id]) : null;
  const passScore = Number(proj?.interview_pass_score ?? 70);
  const stage = cand?.current_stage || "terms";
  const avgScore = sc?.overall_score != null ? Number(sc.overall_score) : cand?.score != null ? Number(cand.score) : null;
  const isPassed = Boolean(
    (avgScore !== null && avgScore >= passScore) ||
      ["interview_success", "professional", "product", "systems", "certified"].includes(cand?.crm_stage || "") ||
      ["training", "certified"].includes(cand?.current_stage || "")
  );
  return res.json({
    ok: true,
    data: {
      stage,
      interview_passed: isPassed,
      interview_average: avgScore,
      interview_pass_score: passScore,
    },
    stage,
    interview_passed: isPassed,
    interview_average: avgScore,
    interview_pass_score: passScore,
  });
}
