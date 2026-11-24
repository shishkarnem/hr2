import { getProTalkDB } from "../db";

export interface ReconcileResult {
  ok: boolean;
  totalCandidates: number;
  updatedCount: number;
  changes: Array<{
    candidateId: string;
    publicId: string | number;
    name: string;
    oldStage: string;
    newStage: string;
  }>;
  timestamp: string;
}

export function isStageManual(val: any): boolean {
  if (val === null || val === undefined || val === false || val === 0) return false;
  const s = String(val).trim().toLowerCase();
  if (s === "" || s === "0" || s === "0.0" || s === "false" || s === "null" || s === "undefined") return false;
  return s === "1" || s === "1.0" || s === "true" || Number(s) >= 1;
}

const CRM_STAGE_RANK: Record<string, number> = {
  registration: 1,
  new: 1,
  terms: 1,
  screening: 2,
  resume: 2,
  interview: 2,
  checklist: 3,
  situations: 4,
  interview_reject: 5,
  rejected: 5,
  interview_success: 6,
  approved: 6,
  scoring: 6,
  professional: 7,
  product: 8,
  systems: 9,
  system: 9,
  certified: 10,
};

export function normalizeCrmStageName(raw: any): string {
  const s = String(raw || "").trim().toLowerCase();
  if (!s || s === "new" || s === "terms") return "registration";
  if (s === "resume" || s === "interview") return "screening";
  if (s === "system") return "systems";
  return s;
}

export function getCrmStageRank(raw: any): number {
  const s = String(raw || "").trim().toLowerCase();
  return CRM_STAGE_RANK[s] ?? 1;
}

export function pickMonotonicCrmStage(currentRaw: any, nextRaw: any): string {
  const curNorm = normalizeCrmStageName(currentRaw);
  const nextNorm = normalizeCrmStageName(nextRaw);
  const curRank = getCrmStageRank(curNorm);
  const nextRank = getCrmStageRank(nextNorm);
  return nextRank >= curRank ? nextNorm : curNorm;
}

export async function reconcileAllCandidateCrmStatuses(): Promise<ReconcileResult> {
  const db = await getProTalkDB();
  const timestamp = new Date().toISOString();

  try {
    const [candidates, scores, stageProg, checkRows, sitRows, projects, trainingBlocks, trainingTests] = await Promise.all([
      db.all(`SELECT * FROM candidates`).catch(() => []),
      db.all(`SELECT * FROM candidate_scores`).catch(() => []),
      db.all(`SELECT * FROM candidate_stage_progress`).catch(() => []),
      db.all(`SELECT DISTINCT candidate_id FROM candidate_checklist_answers_v2`).catch(() => []),
      db.all(`SELECT DISTINCT candidate_id FROM candidate_situations_answers_v2`).catch(() => []),
      db.all(`SELECT id, public_id, interview_pass_score FROM projects`).catch(() => []),
      db.all(`SELECT project_id, stage, pass_score FROM training_blocks`).catch(() => []),
      db.all(`SELECT project_id, stage, pass_score, passing_score FROM training_stage_tests`).catch(() => []),
    ]);

    const scoreMap = new Map<string, any>();
    for (const s of scores || []) {
      if (s.candidate_id) scoreMap.set(String(s.candidate_id), s);
    }

    const progMap = new Map<string, any[]>();
    for (const sp of stageProg || []) {
      const cid = String(sp.candidate_id);
      const list = progMap.get(cid) || [];
      list.push(sp);
      progMap.set(cid, list);
    }

    const checkAnswers = new Set<string>((checkRows || []).map((r: any) => String(r.candidate_id)));
    const sitAnswers = new Set<string>((sitRows || []).map((r: any) => String(r.candidate_id)));

    const projMap = new Map<string, any>();
    for (const p of projects || []) {
      if (p.id) projMap.set(String(p.id), p);
      if (p.public_id) projMap.set(String(p.public_id), p);
    }

    // Prioritize configured stage pass score in DB, defaulting strictly to 70
    const stagePassMap = new Map<string, number>();
    for (const b of trainingBlocks || []) {
      if (b.pass_score != null && Number(b.pass_score) > 0) {
        stagePassMap.set(`${b.project_id}:${String(b.stage).toLowerCase()}`, Number(b.pass_score));
      }
    }
    for (const t of trainingTests || []) {
      const pVal = t.passing_score ?? t.pass_score;
      if (pVal != null && Number(pVal) > 0) {
        stagePassMap.set(`${t.project_id}:${String(t.stage).toLowerCase()}`, Number(pVal));
      }
    }

    const changes: ReconcileResult["changes"] = [];

    for (const c of candidates || []) {
      const cid = String(c.id);
      const cpid = String(c.public_id || "");
      const sc = scoreMap.get(cid) || (cpid ? scoreMap.get(cpid) : null) || {};
      const progs = progMap.get(cid) || (cpid ? progMap.get(cpid) : null) || [];
      const proj = c.project_id ? projMap.get(String(c.project_id)) : null;
      const passScore = Number(proj?.interview_pass_score ?? 70);

      const passedStages = progs
        .filter((p: any) => {
          const stg = String(p.stage || "").toLowerCase();
          const stgThreshold =
            stagePassMap.get(`${proj?.id || c.project_id}:${stg}`) ??
            stagePassMap.get(`${proj?.public_id || ""}:${stg}`) ??
            70;
          return p.passed_at || Number(p.best_score ?? p.last_score ?? 0) >= stgThreshold;
        })
        .map((p: any) => String(p.stage).toLowerCase());
      const allStages = progs.map((p: any) => String(p.stage).toLowerCase());

      let canonicalStage = "registration";

      const hasSitAnswers = sitAnswers.has(cid) || Boolean(cpid && sitAnswers.has(cpid));
      const sitScoreVal =
        c.situations_score != null && c.situations_score !== ""
          ? Number(c.situations_score)
          : sc.situations_score != null && sc.situations_score !== ""
          ? Number(sc.situations_score)
          : null;
      const hasSitScore = sitScoreVal != null && sitScoreVal > 0;

      const checkScoreVal =
        c.checklist_score != null && c.checklist_score !== ""
          ? Number(c.checklist_score)
          : sc.checklist_score != null && sc.checklist_score !== ""
          ? Number(sc.checklist_score)
          : null;
      const hasCheckScore = checkScoreVal != null && checkScoreVal > 0;
      const hasCheckAnswers = checkAnswers.has(cid) || Boolean(cpid && checkAnswers.has(cpid));

      const resumeScoreVal =
        c.resume_score != null && c.resume_score !== ""
          ? Number(c.resume_score)
          : sc.resume_score != null && sc.resume_score !== ""
          ? Number(sc.resume_score)
          : null;
      const hasResumeScore = resumeScoreVal != null && resumeScoreVal > 0;
      const hasResumeUrl = Boolean(c.resume_url && String(c.resume_url).trim().length > 0);
      const hasResumeText = Boolean(c.resume_text && String(c.resume_text).trim().length >= 20);
      let hasResumeInStd = false;
      if (c.standard_fields_json) {
        try {
          const parsed = typeof c.standard_fields_json === "string" ? JSON.parse(c.standard_fields_json) : c.standard_fields_json;
          if (parsed.resume_url || parsed.resume_text || parsed.experience_text || parsed.skills_text) hasResumeInStd = true;
        } catch {}
      }
      const hasResumeData = hasResumeUrl || hasResumeText || hasResumeInStd;

      const allInterviewStagesDone = Boolean(hasResumeScore && (hasCheckScore || hasCheckAnswers) && (hasSitScore || hasSitAnswers));
      const finalScore = Number(c.overall_score ?? sc.overall_score ?? sc.interview_score ?? c.interview_score ?? c.score ?? 0);
      const hasTrainingPassOrCharge = passedStages.length > 0 || c.training_charged_at != null;
      const isInterviewRejected = allInterviewStagesDone && finalScore < passScore && !hasTrainingPassOrCharge;
      const isCertified =
        c.crm_stage === "certified" ||
        c.current_stage === "certified" ||
        c.stage === "certified" ||
        (passedStages.includes("professional") && passedStages.includes("product") && (passedStages.includes("systems") || passedStages.includes("system")));

      if (!allInterviewStagesDone) {
        if (hasCheckScore || (hasCheckAnswers && checkScoreVal != null && checkScoreVal > 0)) canonicalStage = "situations";
        else if (hasResumeScore) canonicalStage = "checklist";
        else if (hasResumeData) canonicalStage = "screening";
        else canonicalStage = "registration";
      } else if (isInterviewRejected) {
        canonicalStage = "interview_reject";
      } else if (isCertified) {
        canonicalStage = "certified";
      } else if (
        allStages.includes("systems") ||
        allStages.includes("system") ||
        (passedStages.includes("professional") && passedStages.includes("product"))
      ) {
        canonicalStage = "systems";
      } else if (allStages.includes("product") || passedStages.includes("professional")) {
        canonicalStage = "product";
      } else if (
        c.training_charged_at != null ||
        allStages.includes("professional") ||
        ["professional", "product", "systems", "certified"].includes(c.crm_stage || "")
      ) {
        canonicalStage = "professional";
      } else {
        canonicalStage = "interview_success";
      }

      const manualLocked = isStageManual(c.crm_stage_manual);
      const needsUpdate =
        !manualLocked &&
        (c.crm_stage !== canonicalStage || c.stage !== canonicalStage || c.current_stage !== canonicalStage || c.crm_stage == null);

      if (needsUpdate) {
        await db.run(
          `UPDATE candidates SET crm_stage = ?, stage = ?, current_stage = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [canonicalStage, canonicalStage, canonicalStage, c.id]
        );
        changes.push({
          candidateId: c.id,
          publicId: c.public_id || "",
          name: c.full_name || `Кандидат #${c.public_id || c.id}`,
          oldStage: c.crm_stage || c.stage || "registration",
          newStage: canonicalStage,
        });
      }

      if (c.crm_stage_manual === "0.0") {
        await db.run(`UPDATE candidates SET crm_stage_manual = 0 WHERE id = ?`, [c.id]);
      }
    }

    try {
      await db.run(
        `INSERT INTO system_crons (id, task_name, schedule, last_run, status, enabled)
         VALUES ('cron-crm-stages-reconciliation', 'Hourly 10:00-20:00 MSK Candidate CRM Status Reconciler', '0 10-20 * * *', CURRENT_TIMESTAMP, 'active', 1)
         ON CONFLICT (id) DO UPDATE SET last_run = CURRENT_TIMESTAMP, status = 'active'`
      );
      await db.run(
        `INSERT INTO system_triggers (id, trigger_name, table_name, event, code_body, enabled)
         VALUES ('trigger-crm-auto-stage-pipeline', 'Candidate 10-Stage Pipeline Auto-Sync', 'candidates', 'AFTER UPDATE/INSERT', 'reconcileAllCandidateCrmStatuses', 1)
         ON CONFLICT (id) DO UPDATE SET enabled = 1`
      );
    } catch {}

    return { ok: true, totalCandidates: (candidates || []).length, updatedCount: changes.length, changes, timestamp };
  } catch (err: any) {
    console.error("[CRM Reconciler] Error reconciling candidate stages:", err);
    return { ok: false, totalCandidates: 0, updatedCount: 0, changes: [], timestamp };
  }
}
