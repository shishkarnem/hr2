import { Router, Request, Response } from "express";
import { transliterateToSlug } from "../../common";
import {
  saveProjectToProTalkDB,
  getProTalkDB,
  generateNextProjectPublicId,
  generateUniqueRoleSlugServer,
} from "../../db";
import { invalidatePublicVacanciesCache, cleanMojibakeDeep } from "../../db/protalkDb";
import { parseVacancyCandidateFieldsConfig } from "../../../src/lib/candidateFields";

function mapProjectRow(
  r: any,
  candsByProj: Map<string, any[]>,
  iBlocksByProj: Map<string, any[]>,
  tBlocksByProj: Map<string, any[]>
) {
  let dataJson: any = {};
  try {
    if (r.data_json) dataJson = JSON.parse(r.data_json);
  } catch {}
  let checklist: any = [];
  try {
    if (r.checklist_questions) checklist = JSON.parse(r.checklist_questions);
  } catch {}
  let roleplay: any = [];
  try {
    if (r.roleplay_questions) roleplay = JSON.parse(r.roleplay_questions);
  } catch {}
  let stats: any = {};
  try {
    if (r.stats) stats = typeof r.stats === "object" ? r.stats : JSON.parse(r.stats);
  } catch {}

  const resolvedRoleName = r.role_name || dataJson.role_name || dataJson.roleName || "";
  const resolvedCompanyName =
    r.company_name || r.linked_company_name || dataJson.company_name || dataJson.companyName || "";
  const resolvedCompanySlug =
    r.company_slug || r.linked_company_slug || dataJson.company_slug || dataJson.companySlug || "company";
  const resolvedCompanyPublicId = r.company_public_id || r.linked_company_public_id || r.company_id || "300001";
  const resolvedCompanyId = r.company_id || r.linked_company_id || dataJson.company_id || "";
  const resolvedPublicId = r.public_id || dataJson.public_id || r.id;
  const resolvedSlug =
    r.slug || dataJson.slug || transliterateToSlug(resolvedRoleName) || `vac${resolvedPublicId}`;
  const resolvedEmployerId = r.employer_id || dataJson.employer_id || dataJson.employerId || "";

  const candidateFieldsConfig = parseVacancyCandidateFieldsConfig(
    r.candidate_fields_config || dataJson.candidate_fields_config || dataJson.candidateFieldsConfig
  );

  const candAgg = candsByProj.get(String(r.id))?.[0] || candsByProj.get(String(r.public_id))?.[0] || null;
  const pCands = candAgg ? [] : [];
  const totalCandsCount = candAgg ? Number(candAgg.total_cnt || 0) : 0;
  const interviewedCount = candAgg ? Number(candAgg.interviewed_cnt || 0) : 0;
  const trainingCount = candAgg ? Number(candAgg.training_cnt || 0) : 0;
  const certifiedCount = candAgg ? Number(candAgg.certified_cnt || 0) : 0;

  const effInterviewUsed = Math.max(Number(r.interview_used || 0), interviewedCount);
  const effTrainingUsed = Math.max(Number(r.training_used || 0), trainingCount);
  const iBlocks = iBlocksByProj.get(String(r.id)) || iBlocksByProj.get(String(r.public_id)) || [];
  const tBlocks = tBlocksByProj.get(String(r.id)) || tBlocksByProj.get(String(r.public_id)) || [];
  const iLimit = Math.round(Number(r.interview_limit ?? r.max_interviews ?? 0));
  const tLimit = Math.round(Number(r.training_limit ?? r.max_trainings ?? 0));

  let finalChecklist =
    Array.isArray(checklist) && checklist.length > 0 ? checklist : dataJson.checklistQuestions || [];
  if (finalChecklist.length === 0) {
    const chkBlk = iBlocks.find((b: any) => b.kind === "checklist");
    if (chkBlk?.payload) {
      try {
        const pl = typeof chkBlk.payload === "string" ? JSON.parse(chkBlk.payload) : chkBlk.payload;
        if (Array.isArray(pl.questions) && pl.questions.length > 0) finalChecklist = pl.questions;
      } catch {}
    }
  }

  let finalRoleplay =
    Array.isArray(roleplay) && roleplay.length > 0 ? roleplay : dataJson.roleplayQuestions || [];
  if (finalRoleplay.length === 0) {
    const sitBlk = iBlocks.find((b: any) => b.kind === "situations");
    if (sitBlk?.payload) {
      try {
        const pl = typeof sitBlk.payload === "string" ? JSON.parse(sitBlk.payload) : sitBlk.payload;
        if (Array.isArray(pl.situations) && pl.situations.length > 0) finalRoleplay = pl.situations;
      } catch {}
    }
  }
  void pCands;

  const { data_json: _dj1, dataJson: _dj1b, ...cleanDataJson } = dataJson;
  const { data_json: _dj2, dataJson: _dj2b, search_tsv: _tsv, ...cleanR } = r;

  return {
    ...cleanDataJson,
    ...cleanR,
    id: r.id,
    stats,
    public_id: resolvedPublicId,
    publicId: resolvedPublicId,
    role_name: resolvedRoleName,
    roleName: resolvedRoleName,
    slug: resolvedSlug,
    company_id: resolvedCompanyId,
    companyId: resolvedCompanyId,
    company_name: resolvedCompanyName,
    companyName: resolvedCompanyName,
    company_slug: resolvedCompanySlug,
    companySlug: resolvedCompanySlug,
    company_public_id: resolvedCompanyPublicId,
    companyPublicId: resolvedCompanyPublicId,
    employer_id: resolvedEmployerId,
    employerId: resolvedEmployerId,
    interview_limit: iLimit,
    interviewLimit: iLimit,
    training_limit: tLimit,
    trainingLimit: tLimit,
    interview_used: effInterviewUsed,
    interviewUsed: effInterviewUsed,
    training_used: effTrainingUsed,
    trainingUsed: effTrainingUsed,
    candidates_count: totalCandsCount,
    candidatesCount: totalCandsCount,
    interviewed_count: interviewedCount,
    interviewedCount: interviewedCount,
    training_count: trainingCount,
    trainingCount: trainingCount,
    certified_count: certifiedCount,
    certifiedCount: certifiedCount,
    has_interview_blocks: iBlocks.length > 0,
    hasInterviewBlocks: iBlocks.length > 0,
    has_training_blocks: tBlocks.length > 0,
    hasTrainingBlocks: tBlocks.length > 0,
    interview_blocks: iBlocks,
    training_blocks: tBlocks,
    publicVacUrl: `/${resolvedCompanySlug}/${resolvedSlug}`,
    editVacUrl: `/com${String(resolvedCompanyPublicId).replace(/^com/i, "")}/vac${String(resolvedPublicId).replace(/^vac/i, "")}`,
    checklistQuestions: finalChecklist,
    checklist_questions: finalChecklist,
    roleplayQuestions: finalRoleplay,
    roleplay_questions: finalRoleplay,
    candidate_fields_config: candidateFieldsConfig,
    candidateFieldsConfig,
    theme_config: r.theme_config || r.linked_company_theme_config || undefined,
    css: r.css || r.linked_company_css || undefined,
    companyLogoUrl: r.logo_url || r.linked_company_logo || undefined,
  };
}

export function registerProjectCrudRoutes(projectsRouter: Router) {
  projectsRouter.get("/projects", async (req: Request, res: Response) => {
    try {
      const db = await getProTalkDB();
      const rawEmpParam =
        (req.query.employerId as string | undefined) || (req.query.employer_id as string | undefined) || "";
      const cleanEmpParam = rawEmpParam.replace(/^emp/i, "").trim();
      const rawCompParam =
        (req.query.companyId as string | undefined) || (req.query.company_id as string | undefined) || "";
      const cleanCompParam = rawCompParam.replace(/^comp-?/i, "").trim();

      let query = `
        SELECT p.id, p.public_id, p.legacy_public_id, p.employer_id, p.employer_public_id,
               p.company_id, p.company_public_id, p.company_name, p.company_slug,
               p.slug, p.role_slug, p.legacy_slug, p.role_name,
               p.salary_terms, p.schedule_terms, p.motivation_text, p.motivation_text_detail,
               p.custom_wiki, p.vacancy_text, p.tasks_activity_text, p.schedule_text,
               p.payouts_text, p.onboarding_text, p.company_text, p.mission_text,
               p.team_text, p.system_text, p.cabinet_tabs_text, p.stats,
               p.training_intro_text, p.training_prof_text, p.training_professional_text,
               p.training_product_text, p.training_system_text, p.training_systems_text,
               p.training_wiki_text, p.training_regulations_text, p.training_published,
               p.status, p.is_published, p.checklist_questions, p.roleplay_questions,
               p.interview_limit, p.max_interviews, p.interview_used,
               p.interview_pass_score, p.notify_score_threshold,
               p.training_limit, p.max_trainings, p.training_used, p.created_tasks,
               p.hh_post_text, p.hh_invite_text, p.hh_autoresume_text, p.logo_url,
               p.archived_at, p.deleted_at, p.theme_config, p.css,
               p.candidate_fields_config, p.notifications_config, p.created_at, p.updated_at,
               CASE WHEN (p.role_name IS NULL OR p.role_name = '') AND length(COALESCE(p.data_json, '')) <= 100000 THEN p.data_json ELSE NULL END AS data_json,
               c.name AS linked_company_name, c.slug AS linked_company_slug,
               c.public_id AS linked_company_public_id, c.id AS linked_company_id,
               c.theme_config AS linked_company_theme_config, c.css AS linked_company_css,
               c.logo_url AS linked_company_logo
        FROM projects p
        LEFT JOIN companies c ON (
          p.company_id = c.id
          OR p.company_id = CAST(c.public_id AS TEXT)
          OR p.company_id = ('comp-' || CAST(c.public_id AS TEXT))
          OR p.company_id = c.slug
        )
      `;
      const whereClauses: string[] = [];
      const queryParams: any[] = [];

      if (rawCompParam) {
        whereClauses.push("(p.company_id = ? OR p.company_id = ? OR p.company_id = ? OR p.company_id = ?)");
        queryParams.push(rawCompParam, cleanCompParam, `comp-${cleanCompParam}`, `comp${cleanCompParam}`);
      } else if (rawEmpParam) {
        const candidateEmpIds = new Set<string>([rawEmpParam]);
        if (cleanEmpParam) {
          candidateEmpIds.add(cleanEmpParam);
          candidateEmpIds.add(`emp-${cleanEmpParam}`);
          candidateEmpIds.add(`emp${cleanEmpParam}`);
        }

        const empRecord = await db.get(
          "SELECT id, public_id, user_id FROM employers WHERE id = ? OR CAST(public_id AS TEXT) = ? OR id = ? OR CAST(public_id AS TEXT) = ? OR user_id = ? LIMIT 1",
          [rawEmpParam, rawEmpParam, cleanEmpParam, cleanEmpParam, rawEmpParam]
        );
        if (empRecord) {
          if (empRecord.id) candidateEmpIds.add(String(empRecord.id));
          if (empRecord.public_id) candidateEmpIds.add(String(empRecord.public_id));
          if (empRecord.user_id) candidateEmpIds.add(String(empRecord.user_id));
        }

        const empIdsArray = Array.from(candidateEmpIds);
        const empPlaceholders = empIdsArray.map(() => "?").join(",");

        const [empComps, memberComps] = await Promise.all([
          db.all(
            `SELECT id, public_id FROM companies WHERE employer_id IN (${empPlaceholders}) OR owner_employer_id IN (${empPlaceholders})`,
            [...empIdsArray, ...empIdsArray]
          ),
          db
            .all(
              `SELECT c.id, c.public_id
               FROM company_members cm
               JOIN companies c ON (c.id = cm.company_id OR CAST(c.public_id AS TEXT) = CAST(cm.company_id AS TEXT))
               WHERE cm.employer_id IN (${empPlaceholders}) AND cm.status = 'active'`,
              empIdsArray
            )
            .catch(() => []),
        ]);

        const candidateCompIds = new Set<string>();
        for (const c of [...(empComps || []), ...(memberComps || [])]) {
          if (c.id) candidateCompIds.add(String(c.id));
          if (c.public_id) {
            candidateCompIds.add(String(c.public_id));
            candidateCompIds.add(`comp-${c.public_id}`);
            candidateCompIds.add(`comp${c.public_id}`);
          }
        }

        const compIdsArray = Array.from(candidateCompIds);
        if (compIdsArray.length > 0) {
          const compPlaceholders = compIdsArray.map(() => "?").join(",");
          whereClauses.push(`(p.employer_id IN (${empPlaceholders}) OR p.company_id IN (${compPlaceholders}))`);
          queryParams.push(...empIdsArray, ...compIdsArray);
        } else {
          whereClauses.push(`p.employer_id IN (${empPlaceholders})`);
          queryParams.push(...empIdsArray);
        }
      } else {
        whereClauses.push(
          "(p.status IS NULL OR p.status = 'active') AND p.status != 'archived' AND p.status != 'paused' AND p.status != 'deleted' AND (p.is_published IS NULL OR CAST(p.is_published AS TEXT) IN ('1', 'true', 't', 'TRUE'))"
        );
      }

      if (rawCompParam && req.query.include_all !== "true") {
        whereClauses.push(
          "(p.status IS NULL OR p.status = 'active') AND p.status != 'archived' AND p.status != 'paused' AND p.status != 'deleted' AND (p.is_published IS NULL OR CAST(p.is_published AS TEXT) IN ('1', 'true', 't', 'TRUE'))"
        );
      }

      if (whereClauses.length > 0) {
        query += " WHERE " + whereClauses.join(" AND ");
      }
      query += " ORDER BY p.created_at DESC";

      const rows = await db.all(query, queryParams);
      if (!rows || rows.length === 0) return res.json([]);

      const matchedProjKeys = new Set<string>();
      for (const r of rows) {
        if (r.id) matchedProjKeys.add(String(r.id));
        if (r.public_id) matchedProjKeys.add(String(r.public_id));
      }
      const projKeysArr = Array.from(matchedProjKeys);
      const projPh = projKeysArr.map(() => "?").join(",");

      const [allCands, allInterviewBlocks, allTrainingBlocks] = await Promise.all([
        db.all(
          `SELECT project_id,
                  COUNT(*)::int AS total_cnt,
                  SUM(CASE WHEN COALESCE(score, 0) > 0
                             OR COALESCE(TRIM(interview_score), '') NOT IN ('', '0', '0.0', '0.00', 'null')
                             OR NULLIF(TRIM(COALESCE(interview_charged_at, '')), '') IS NOT NULL
                             OR COALESCE(TRIM(overall_score), '') NOT IN ('', '0', '0.0', '0.00', 'null')
                           THEN 1 ELSE 0 END)::int AS interviewed_cnt,
                  SUM(CASE WHEN NULLIF(TRIM(COALESCE(training_charged_at, '')), '') IS NOT NULL
                             OR COALESCE(NULLIF(crm_stage, ''), NULLIF(stage, ''), '') IN ('professional', 'product', 'systems', 'certified')
                           THEN 1 ELSE 0 END)::int AS training_cnt,
                  SUM(CASE WHEN COALESCE(NULLIF(crm_stage, ''), NULLIF(stage, ''), NULLIF(current_stage, ''), '') = 'certified'
                           THEN 1 ELSE 0 END)::int AS certified_cnt
           FROM candidates
           WHERE project_id IN (${projPh})
           GROUP BY project_id`,
          projKeysArr
        ),
        db.all(
          `SELECT id, project_id, kind,
                  CASE WHEN kind IN ('checklist', 'situations') AND length(COALESCE(payload, '')) <= 50000 THEN payload ELSE NULL END AS payload
           FROM interview_blocks
           WHERE project_id IN (${projPh})`,
          projKeysArr
        ),
        db.all(
          `SELECT id, project_id, stage, title, block_key, pass_score FROM training_blocks WHERE project_id IN (${projPh})`,
          projKeysArr
        ),
      ]);

      const candsByProj = new Map<string, any[]>();
      for (const c of allCands || []) {
        if (!c.project_id) continue;
        const key = String(c.project_id);
        const list = candsByProj.get(key) || [];
        list.push(c);
        candsByProj.set(key, list);
      }

      const iBlocksByProj = new Map<string, any[]>();
      for (const b of allInterviewBlocks || []) {
        if (!b.project_id) continue;
        const key = String(b.project_id);
        const list = iBlocksByProj.get(key) || [];
        list.push(b);
        iBlocksByProj.set(key, list);
      }

      const tBlocksByProj = new Map<string, any[]>();
      for (const b of allTrainingBlocks || []) {
        if (!b.project_id) continue;
        const key = String(b.project_id);
        const list = tBlocksByProj.get(key) || [];
        list.push(b);
        tBlocksByProj.set(key, list);
      }

      const parsed = rows.map((r: any) => mapProjectRow(r, candsByProj, iBlocksByProj, tBlocksByProj));
      return res.json(cleanMojibakeDeep(parsed));
    } catch (e: any) {
      console.warn("GET /projects PostgreSQL BD ProTalk read error:", e?.message || e);
      return res.json([]);
    }
  });

  projectsRouter.post("/projects/generate-slug", async (req: Request, res: Response) => {
    try {
      const { roleName, companyId, excludeProjectId, fallbackPublicId } = req.body || {};
      const db = await getProTalkDB();
      const slug = await generateUniqueRoleSlugServer(
        db,
        roleName || "",
        companyId,
        excludeProjectId,
        fallbackPublicId
      );
      return res.json({ success: true, slug });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  projectsRouter.post("/projects/sync-draft", async (req: Request, res: Response) => {
    try {
      const db = await getProTalkDB();
      const {
        id,
        public_id,
        publicId,
        role_name,
        roleName,
        company_id,
        companyId,
        company_name,
        companyName,
      } = req.body || {};
      const pid = id || (public_id || publicId ? `vac_${public_id || publicId}` : null);
      if (!pid) {
        return res.status(400).json({ success: false, error: "Missing project id" });
      }

      const effRole = String(role_name || roleName || "").trim();
      const effCompName = String(company_name || companyName || "").trim();
      const effCompId = company_id || companyId || null;

      let compRow: any = null;
      if (effCompId) {
        compRow = await db.get(
          "SELECT * FROM companies WHERE id = ? OR CAST(public_id AS TEXT) = ? LIMIT 1",
          [effCompId, String(effCompId)]
        );
      }
      if (!compRow && effCompName) {
        compRow = await db.get(
          "SELECT * FROM companies WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) OR slug = ? OR (',' || COALESCE(allslug, '') || ',') LIKE ? LIMIT 1",
          [effCompName, effCompName, `%,${effCompName.toLowerCase()},%`]
        );
      }
      const resolvedCompSlug =
        compRow?.slug || (effCompName ? transliterateToSlug(effCompName) : "company");

      let resolvedRoleSlug = "";
      if (effRole) {
        resolvedRoleSlug = await generateUniqueRoleSlugServer(
          db,
          effRole,
          compRow?.id || effCompId,
          pid,
          String(public_id || publicId || "")
        );
      }
      if (!resolvedRoleSlug || /^vac\d+$/.test(resolvedRoleSlug) || resolvedRoleSlug === "vakansiya") {
        resolvedRoleSlug = effRole ? transliterateToSlug(effRole) : `vac${public_id || publicId || pid}`;
      }

      const existing = await db.get(
        "SELECT id, public_id FROM projects WHERE id = ? OR CAST(public_id AS TEXT) = ? LIMIT 1",
        [pid, String(public_id || publicId || pid)]
      );
      if (existing) {
        await db.run(
          `UPDATE projects
           SET role_name = COALESCE(NULLIF(?, ''), role_name),
               slug = COALESCE(NULLIF(?, ''), slug),
               company_slug = COALESCE(NULLIF(?, ''), company_slug),
               company_name = COALESCE(NULLIF(?, ''), company_name),
               company_id = COALESCE(NULLIF(?, ''), company_id),
               updated_at = NOW()
           WHERE id = ? OR CAST(public_id AS TEXT) = ?`,
          [
            effRole,
            resolvedRoleSlug,
            resolvedCompSlug,
            compRow?.name || effCompName,
            compRow?.id || effCompId,
            pid,
            String(pid),
          ]
        );
      }

      return res.json({
        success: true,
        roleSlug: resolvedRoleSlug,
        companySlug: resolvedCompSlug,
        publicVacUrl: `/${resolvedCompSlug}/${resolvedRoleSlug}`,
      });
    } catch (err: any) {
      console.warn("sync-draft error:", err?.message);
      return res.json({ success: false, error: err?.message });
    }
  });

  projectsRouter.post("/projects/draft", async (req: Request, res: Response) => {
    try {
      const db = await getProTalkDB();
      const requestedEmp =
        (req.body && (req.body.employerId || req.body.employer_id || req.body.owner_employer_id)) || "100007";
      const companyId = req.body?.companyId || req.body?.company_id || req.body?._company || null;
      const requestedCompanyName = req.body?.companyName || req.body?.company_name || "";
      const cleanPublic = String(requestedEmp || "").replace(/^emp-?/, "");

      let employer: any = await db.get(
        "SELECT * FROM employers WHERE id = ? OR CAST(public_id AS TEXT) = ? OR id = ? OR CAST(public_id AS TEXT) = ? LIMIT 1",
        [requestedEmp, String(requestedEmp), `emp-${cleanPublic}`, cleanPublic]
      );
      if (!employer) {
        employer = await db.get(
          "SELECT * FROM employers WHERE id = 'emp-100007' OR CAST(public_id AS TEXT) = '100007' LIMIT 1"
        );
      }

      let linkedCompany: any = null;
      if (companyId) {
        const cleanCompId = String(companyId).replace(/^comp-?/i, "");
        linkedCompany = await db.get(
          "SELECT * FROM companies WHERE id = ? OR CAST(public_id AS TEXT) = ? OR CAST(public_id AS TEXT) = ? OR slug = ? OR legacy_slug = ? LIMIT 1",
          [companyId, String(companyId), cleanCompId, companyId, companyId]
        );
      }
      if (!linkedCompany && requestedCompanyName) {
        linkedCompany = await db.get("SELECT * FROM companies WHERE LOWER(name) = LOWER(?) LIMIT 1", [
          requestedCompanyName.trim(),
        ]);
      }

      let usedCredit = false;
      let spentAmount = 0;
      let finalCredits = 0;
      let finalBalance = 0;
      const prefer = String(req.body?.prefer || req.body?.paymentMethod || "credit").toLowerCase();

      if (employer) {
        const userCredits = Number(employer.landing_credits || 0);
        const userBalance = Number(employer.balance || 0);
        finalCredits = userCredits;
        finalBalance = userBalance;

        const shouldSpendBalance =
          (prefer === "balance" && userBalance >= 500) || (userCredits <= 0 && userBalance >= 500);

        if (!shouldSpendBalance && userCredits > 0) {
          const newCredits = userCredits - 1;
          finalCredits = newCredits;
          let limits: Record<string, any> = {};
          try {
            limits = JSON.parse(employer.limits_json || "{}");
          } catch {}
          limits.landings = newCredits;
          limits.landing_credits = newCredits;

          await db.run("UPDATE employers SET landing_credits = ?, limits_json = ? WHERE id = ?", [
            newCredits,
            JSON.stringify(limits),
            employer.id,
          ]);

          let wallet = await db.get("SELECT * FROM wallets WHERE employer_id = ? LIMIT 1", [employer.id]);
          if (!wallet) {
            const wallId = `wall-${Math.random().toString(36).substring(2, 9)}`;
            await db.run("INSERT INTO wallets (id, employer_id, units_balance) VALUES (?, ?, ?)", [
              wallId,
              employer.id,
              userBalance,
            ]);
            wallet = { id: wallId };
          }

          const txId = `tx-${Math.random().toString(36).substring(2, 9)}`;
          const note = "Списание 1 лимита: «ИИ-Лендинг вакансии» (создание черновика)";
          try {
            await db.run(
              `INSERT INTO transactions (id, wallet_id, amount_rr, amount_limits, type_limits, type, type_balance, description, note, ref_table, ref_id, created_at)
               VALUES (?, ?, 0, -1, 'landing_credits', 'spend_fixed_credit', 'limits', ?, ?, 'projects', '', NOW())`,
              [txId, wallet.id, note, note]
            );
          } catch {}

          usedCredit = true;
        } else if (userBalance >= 500) {
          const newBal = userBalance - 500;
          finalBalance = newBal;
          await db.run("UPDATE employers SET balance = ? WHERE id = ?", [newBal, employer.id]);

          let wallet = await db.get("SELECT * FROM wallets WHERE employer_id = ? LIMIT 1", [employer.id]);
          if (wallet) {
            await db.run("UPDATE wallets SET units_balance = ?, updated_at = NOW() WHERE id = ?", [
              newBal,
              wallet.id,
            ]);
          } else {
            const wallId = `wall-${Math.random().toString(36).substring(2, 9)}`;
            await db.run("INSERT INTO wallets (id, employer_id, units_balance) VALUES (?, ?, ?)", [
              wallId,
              employer.id,
              newBal,
            ]);
            wallet = { id: wallId };
          }

          const txId = `tx-${Math.random().toString(36).substring(2, 9)}`;
          const note = "Оплата услуги: «ИИ-Лендинг вакансии» (500 RR при создании черновика)";
          try {
            await db.run(
              `INSERT INTO transactions (id, wallet_id, amount_rr, type, type_balance, description, note, ref_table, ref_id, created_at)
               VALUES (?, ?, 500, 'spend_fixed_balance', 'pay', ?, ?, 'projects', '', NOW())`,
              [txId, wallet.id, note, note]
            );
          } catch {}

          spentAmount = 500;
        } else {
          return res.status(400).json({
            success: false,
            error: "insufficient_limits",
            message:
              "Недостаточно лимитов на создание вакансии. Требуется 1 лимит вакансии (лендинга) или 500 RR на балансе.",
            availableCredits: userCredits,
            availableBalance: userBalance,
          });
        }
      }

      const draftId = `vac_${Math.random().toString(36).substring(2, 9)}_${Date.now().toString(36)}`;
      const draftPublicId = await generateNextProjectPublicId(db);
      const draftSlug = `draft-${draftId}`;

      const resolvedCompanyName = linkedCompany?.name || requestedCompanyName || "";
      const resolvedCompanySlug = linkedCompany?.slug || "";
      const resolvedCompanyLogo = linkedCompany?.logo_url || linkedCompany?.logoUrl || "";

      const draftProject: any = {
        id: draftId,
        public_id: draftPublicId,
        publicId: draftPublicId,
        legacy_public_id: null,
        employerId: employer ? employer.id : requestedEmp,
        employer_id: employer ? employer.id : requestedEmp,
        company_id: linkedCompany ? linkedCompany.id : companyId,
        companyId: linkedCompany ? linkedCompany.id : companyId,
        company_name: resolvedCompanyName,
        companyName: resolvedCompanyName,
        company_slug: resolvedCompanySlug,
        companySlug: resolvedCompanySlug,
        role_name: "",
        roleName: "",
        slug: draftSlug,
        salary_terms: "",
        salaryTerms: "",
        schedule_terms: "",
        scheduleTerms: "",
        motivation_text: "",
        motivationText: "",
        motivation_text_detail: "",
        custom_wiki: "",
        customWiki: "",
        vacancy_text: "",
        vacancyText: "",
        tasks_activity_text: "",
        tasksActivityText: "",
        schedule_text: "",
        scheduleText: "",
        payouts_text: "",
        payoutsText: "",
        onboarding_text: "",
        onboardingText: "",
        company_text: "",
        companyText: "",
        mission_text: "",
        missionText: "",
        team_text: "",
        teamText: "",
        system_text: "",
        systemText: "",
        training_professional_text: "",
        training_product_text: "",
        training_systems_text: "",
        training_wiki_text: "",
        training_regulations_text: "",
        logo_url: resolvedCompanyLogo,
        logoUrl: resolvedCompanyLogo,
        stats: {},
        status: "draft",
        is_published: 0,
        checklistQuestions: [],
        roleplayQuestions: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      await saveProjectToProTalkDB(db, draftProject);

      return res.json({
        success: true,
        project: draftProject,
        id: draftProject.id,
        public_id: draftProject.public_id,
        used_credit: usedCredit,
        spent_amount: spentAmount,
        new_credits: finalCredits,
        new_balance: finalBalance,
        reused: false,
      });
    } catch (err: any) {
      console.error("Error creating project draft:", err);
      return res.status(500).json({ success: false, error: err.message || "Failed to create project draft" });
    }
  });

  projectsRouter.delete("/projects/:id", async (req: Request, res: Response) => {
    try {
      const id = req.params.id;
      const db = await getProTalkDB();
      await db.run("DELETE FROM projects WHERE id = ? OR CAST(public_id AS TEXT) = ?", [id, String(id)]);
      invalidatePublicVacanciesCache();
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  projectsRouter.get("/projects/:id", async (req: Request, res: Response) => {
    const id = req.params.id;
    try {
      const db = await getProTalkDB();
      const row = await db.get(
        `SELECT p.*, c.name AS linked_company_name, c.slug AS linked_company_slug,
                c.public_id AS linked_company_public_id, c.logo_url AS linked_company_logo,
                c.theme_config AS linked_company_theme_config, c.css AS linked_company_css
         FROM projects p
         LEFT JOIN companies c ON (
           p.company_id = c.id
           OR p.company_id = CAST(c.public_id AS TEXT)
           OR p.company_id = ('comp-' || CAST(c.public_id AS TEXT))
           OR p.company_id = c.slug
         )
         WHERE p.id = ? OR CAST(p.public_id AS TEXT) = ? OR p.slug = ? OR p.legacy_slug = ? OR CAST(p.legacy_public_id AS TEXT) = ?
         LIMIT 1`,
        [id, String(id), id, id, String(id)]
      );
      if (!row) return res.status(404).json({ error: "Project not found" });

      const [interviewBlocks, trainingBlocks, projCands] = await Promise.all([
        db.all("SELECT id, project_id, kind, payload FROM interview_blocks WHERE project_id = ?", [row.id]),
        db.all("SELECT id, project_id, stage, title, block_key, pass_score FROM training_blocks WHERE project_id = ?", [
          row.id,
        ]),
        db.all(
          "SELECT id, score, overall_score, interview_score, interview_charged_at, training_charged_at, crm_stage, stage FROM candidates WHERE project_id = ? OR project_id = ?",
          [row.id, String(row.public_id || "")]
        ),
      ]);

      const candsByProj = new Map<string, any[]>([[String(row.id), projCands || []]]);
      const iBlocksByProj = new Map<string, any[]>([[String(row.id), interviewBlocks || []]]);
      const tBlocksByProj = new Map<string, any[]>([[String(row.id), trainingBlocks || []]]);
      const parsed: any = mapProjectRow(row, candsByProj, iBlocksByProj, tBlocksByProj);

      const compId = parsed.company_id || row.company_id;
      if (compId) {
        const compRow = await db.get(
          `SELECT * FROM companies WHERE id = ? OR CAST(public_id AS TEXT) = ? OR slug = ? LIMIT 1`,
          [compId, String(compId), compId]
        );
        if (compRow) {
          parsed.company = compRow;
          parsed.theme_config = parsed.theme_config || compRow.theme_config || row.linked_company_theme_config;
          parsed.css = parsed.css || compRow.css || row.linked_company_css;
        }
      }
      return res.json(cleanMojibakeDeep(parsed));
    } catch (e: any) {
      console.warn("GET /projects/:id PostgreSQL BD ProTalk error:", e?.message || e);
      return res.status(404).json({ error: "Project not found" });
    }
  });

  projectsRouter.post("/projects", async (req: Request, res: Response) => {
    try {
      const db = await getProTalkDB();
      const bodyData = req.body || {};
      const id = bodyData.id || `proj_${Date.now()}`;
      const roleName = String(bodyData.role_name || bodyData.roleName || "").trim();
      const companyId = bodyData.company_id || bodyData.companyId;

      if (roleName && companyId) {
        const compIds = new Set<string>([String(companyId)]);
        const cleanCo = String(companyId).replace(/^comp-?/i, "");
        compIds.add(cleanCo);
        compIds.add(`comp-${cleanCo}`);

        const matchedCo = await db.get(
          "SELECT id, public_id, slug FROM companies WHERE id = ? OR CAST(public_id AS TEXT) = ? OR id = ? OR CAST(public_id AS TEXT) = ? LIMIT 1",
          [companyId, String(companyId), cleanCo, cleanCo]
        );
        if (matchedCo) {
          if (matchedCo.id) compIds.add(String(matchedCo.id));
          if (matchedCo.public_id) compIds.add(String(matchedCo.public_id));
        }

        const candSlug = transliterateToSlug(roleName);
        const requestedSlug = bodyData.slug ? transliterateToSlug(bodyData.slug) : "";
        const placeholders = Array.from(compIds).map(() => "?").join(",");

        const duplicate = await db.get(
          `SELECT id, public_id, role_name, slug FROM projects
           WHERE (
             LOWER(TRIM(role_name)) = LOWER(TRIM(?))
             OR slug = ? OR role_slug = ?
             ${requestedSlug ? "OR slug = ? OR role_slug = ?" : ""}
           )
           AND company_id IN (${placeholders})
           AND id != ? AND CAST(public_id AS TEXT) != ?
           AND (status IS NULL OR status != 'deleted')
           LIMIT 1`,
          [
            roleName,
            candSlug,
            candSlug,
            ...(requestedSlug ? [requestedSlug, requestedSlug] : []),
            ...Array.from(compIds),
            id,
            String(id),
          ]
        );

        if (duplicate) {
          return res.status(400).json({
            error: "duplicate_role_name",
            message: `В этой компании уже есть вакансия «${duplicate.role_name || roleName}» (ID: ${duplicate.public_id || duplicate.id}, /${duplicate.slug || candSlug}). В рамках одной компании названия и ссылки вакансий должны быть уникальными.`,
          });
        }
      }

      const merged = { ...bodyData, id };
      const savedResult = await saveProjectToProTalkDB(db, merged);
      return res.json({ success: true, project: savedResult || { id, ...bodyData } });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  projectsRouter.put("/projects/:id", async (req: Request, res: Response) => {
    try {
      const id = req.params.id;
      const db = await getProTalkDB();

      const bodyData = { ...req.body };
      const roleName = String(bodyData.role_name || bodyData.roleName || "").trim();
      const companyId = bodyData.company_id || bodyData.companyId;
      const bodyKeys = Object.keys(bodyData);
      const isStatusOnlyUpdate =
        bodyKeys.length > 0 &&
        bodyKeys.every((k) => ["status", "is_published", "isPublished", "archived_at", "archivedAt"].includes(k));

      if (isStatusOnlyUpdate) {
        const nextStatus =
          bodyData.status ||
          (bodyData.is_published === false || bodyData.is_published === 0 ? "paused" : "active");
        const nextPubInt =
          bodyData.is_published === false ||
          bodyData.is_published === 0 ||
          bodyData.isPublished === false ||
          nextStatus !== "active"
            ? 0
            : 1;
        const nextArchivedAt =
          nextStatus === "archived" ? bodyData.archived_at || bodyData.archivedAt || new Date().toISOString() : null;

        await db.run(
          `UPDATE projects SET status = ?, is_published = ?, archived_at = ?, updated_at = NOW() WHERE id = ? OR CAST(public_id AS TEXT) = ?`,
          [nextStatus, nextPubInt, nextArchivedAt, String(id), String(id)]
        );

        invalidatePublicVacanciesCache();
        return res.json({
          success: true,
          id,
          status: nextStatus,
          is_published: nextPubInt,
          archived_at: nextArchivedAt,
        });
      }

      if (roleName && companyId) {
        const rawCompId = String(companyId).replace(/^comp-?/i, "").trim();
        const candSlug = transliterateToSlug(roleName);
        const requestedSlug = bodyData.slug ? String(bodyData.slug).trim().toLowerCase() : "";

        const compRow = await db.get(
          "SELECT id, public_id FROM companies WHERE id = ? OR CAST(public_id AS TEXT) = ? OR id = ? OR CAST(public_id AS TEXT) = ? LIMIT 1",
          [companyId, String(companyId), `comp-${rawCompId}`, rawCompId]
        );
        const compIds = new Set<string>([String(companyId), rawCompId, `comp-${rawCompId}`, `comp${rawCompId}`]);
        if (compRow) {
          if (compRow.id) compIds.add(String(compRow.id));
          if (compRow.public_id) {
            compIds.add(String(compRow.public_id));
            compIds.add(`comp-${compRow.public_id}`);
          }
        }
        const placeholders = Array.from(compIds).map(() => "?").join(",");

        const duplicate = await db.get(
          `SELECT id, public_id, role_name, slug FROM projects
           WHERE (
             LOWER(TRIM(role_name)) = LOWER(TRIM(?))
             OR slug = ?
             OR role_slug = ?
             ${requestedSlug ? "OR slug = ? OR role_slug = ?" : ""}
           )
           AND company_id IN (${placeholders})
           AND id != ? AND CAST(public_id AS TEXT) != ?
           AND (status IS NULL OR status != 'deleted')
           LIMIT 1`,
          [
            roleName,
            candSlug,
            candSlug,
            ...(requestedSlug ? [requestedSlug, requestedSlug] : []),
            ...Array.from(compIds),
            id,
            String(id),
          ]
        );

        if (duplicate) {
          return res.status(400).json({
            error: "duplicate_role_name",
            message: `В этой компании уже есть вакансия «${duplicate.role_name || roleName}» (ID: ${duplicate.public_id || duplicate.id}, /${duplicate.slug || candSlug}). В рамках одной компании названия и ссылки вакансий должны быть уникальными.`,
          });
        }
      }

      if (roleName && companyId) {
        const baseSlug = transliterateToSlug(roleName);
        if (!bodyData.slug || bodyData.slug.startsWith("draft-") || bodyData.slug.startsWith("vac_")) {
          bodyData.slug = baseSlug;
          bodyData.role_slug = baseSlug;
        }
      }

      const existing = await db.get(
        "SELECT * FROM projects WHERE id = ? OR CAST(public_id AS TEXT) = ? LIMIT 1",
        [id, String(id)]
      );
      let baseObj: any = { id };
      if (existing) {
        let dataJson: any = {};
        try {
          if (existing.data_json) dataJson = JSON.parse(existing.data_json);
        } catch {}
        baseObj = { ...dataJson, ...existing };
      }
      const merged = { ...baseObj, ...bodyData, id: existing?.id || id };
      const savedResult = await saveProjectToProTalkDB(db, merged);

      invalidatePublicVacanciesCache();
      return res.json(savedResult || { id: existing?.id || id, ...bodyData });
    } catch (err: any) {
      console.error("[PUT /projects/:id] Error:", err);
      return res.status(500).json({ error: err?.message || "Ошибка обновления вакансии" });
    }
  });
}
