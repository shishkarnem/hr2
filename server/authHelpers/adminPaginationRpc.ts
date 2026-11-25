import { Request, Response } from "express";
import { PgDBWrapper } from "../db";
import { isAuthorizedAdminOrSysAdmin } from "../routes/admin/authAndTelegram";

export type ClientKanbanStage = "new" | "setup" | "active" | "paying";

const CLIENT_STAGE_CASE_SQL = `
  CASE
    WHEN has_topup THEN 'paying'
    WHEN candidates_count > 0 THEN 'active'
    WHEN projects_count > 0 OR companies_count > 0 THEN 'setup'
    ELSE 'new'
  END
`;

const EMPLOYER_ENRICHED_CTE_SQL = `
  SELECT
    e.id,
    e.public_id,
    e.user_id,
    e.name,
    e.contact_name,
    e.email,
    e.contact_email,
    e.company_name,
    e.phone,
    e.contact_phone,
    e.telegram_username,
    e.contact_telegram,
    e.role,
    e.status,
    e.balance,
    e.balance_start,
    e.balance_pay,
    e.balance_referral,
    e.balance_admin,
    e.balance_limits,
    e.landing_credits,
    e.interview_setup_credits,
    e.training_setup_credits,
    e.interview_credits,
    e.training_credits,
    e.created_at,
    e.updated_at,
    (
      COALESCE(e.balance_pay, 0) > 0
      OR EXISTS (
        SELECT 1
        FROM wallets w
        JOIN transactions t ON t.wallet_id = w.id
        WHERE (
          w.employer_id = e.id
          OR (e.public_id IS NOT NULL AND w.employer_id = CAST(e.public_id AS TEXT))
        )
        AND LOWER(COALESCE(t.type, '')) = 'pay'
        AND COALESCE(t.amount_rr, 0) > 0
      )
    ) AS has_topup,
    (
      SELECT COUNT(DISTINCT c.id)::int
      FROM companies c
      WHERE c.owner_employer_id = e.id
         OR c.employer_id = e.id
         OR (e.public_id IS NOT NULL AND (
           c.owner_employer_id = CAST(e.public_id AS TEXT)
           OR c.employer_id = CAST(e.public_id AS TEXT)
         ))
    ) AS companies_count,
    (
      SELECT COUNT(DISTINCT p.id)::int
      FROM projects p
      WHERE p.employer_id = e.id
         OR (e.public_id IS NOT NULL AND (
           p.employer_id = CAST(e.public_id AS TEXT)
           OR CAST(p.employer_public_id AS TEXT) = CAST(e.public_id AS TEXT)
         ))
    ) AS projects_count,
    (
      SELECT COUNT(DISTINCT ca.id)::int
      FROM candidates ca
      JOIN projects p ON (
        ca.project_id = p.id
        OR (p.public_id IS NOT NULL AND ca.project_id = CAST(p.public_id AS TEXT))
      )
      WHERE p.employer_id = e.id
         OR (e.public_id IS NOT NULL AND (
           p.employer_id = CAST(e.public_id AS TEXT)
           OR CAST(p.employer_public_id AS TEXT) = CAST(e.public_id AS TEXT)
         ))
    ) AS candidates_count
  FROM employers e
`;

function clampLimit(val: any, def = 20, max = 100): number {
  const n = Number(val);
  if (!Number.isFinite(n) || n <= 0) return def;
  return Math.min(max, Math.max(1, Math.floor(n)));
}

function clampOffset(val: any): number {
  const n = Number(val);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

function normalizeSearch(val: any): string {
  return String(val || "").trim();
}

export async function handleAdminPaginationRpc(
  db: PgDBWrapper,
  method: string,
  req: Request,
  body: any,
  res: Response
): Promise<boolean> {
  if (method === "admin_list_employers_page") {
    if (!(await isAuthorizedAdminOrSysAdmin(req))) {
      res.status(401).json({ data: null, error: "Требуется авторизация администратора" });
      return true;
    }

    const limit = clampLimit(body?._limit ?? body?.limit, 20);
    const offset = clampOffset(body?._offset ?? body?.offset);
    const search = normalizeSearch(body?._search ?? body?.search);
    const stage = String(body?._stage ?? body?.stage ?? "all").trim().toLowerCase();

    const searchWhereParts: string[] = [];
    const params: any[] = [];
    if (search) {
      const like = `%${search}%`;
      searchWhereParts.push(
        `(
          COALESCE(e.name, '') ILIKE ?
          OR COALESCE(e.contact_name, '') ILIKE ?
          OR COALESCE(e.email, '') ILIKE ?
          OR COALESCE(e.contact_email, '') ILIKE ?
          OR COALESCE(e.company_name, '') ILIKE ?
          OR COALESCE(CAST(e.public_id AS TEXT), '') ILIKE ?
        )`
      );
      params.push(like, like, like, like, like, like);
    }
    const baseWhereSql = searchWhereParts.length > 0 ? `WHERE ${searchWhereParts.join(" AND ")}` : "";
    const stageWhereSql =
      stage && stage !== "all" && ["new", "setup", "active", "paying"].includes(stage)
        ? `WHERE stage_key = ?`
        : "";
    const stageParams = stageWhereSql ? [stage] : [];

    const cteSql = `
      WITH emp_enriched AS (
        ${EMPLOYER_ENRICHED_CTE_SQL}
        ${baseWhereSql}
      ),
      emp_classified AS (
        SELECT *, ${CLIENT_STAGE_CASE_SQL} AS stage_key
        FROM emp_enriched
      )
    `;

    const [countRow, rows] = await Promise.all([
      db.get(
        `${cteSql} SELECT COUNT(*)::int AS cnt FROM emp_classified ${stageWhereSql}`,
        [...params, ...stageParams]
      ),
      db.all(
        `${cteSql} SELECT * FROM emp_classified ${stageWhereSql} ORDER BY created_at DESC NULLS LAST LIMIT ? OFFSET ?`,
        [...params, ...stageParams, limit, offset]
      ),
    ]);

    const total = Number(countRow?.cnt || 0);
    res.json({
      data: {
        items: rows || [],
        total,
        hasMore: offset + (rows?.length || 0) < total,
      },
      error: null,
    });
    return true;
  }

  if (method === "admin_list_employers_kanban") {
    if (!(await isAuthorizedAdminOrSysAdmin(req))) {
      res.status(401).json({ data: null, error: "Требуется авторизация администратора" });
      return true;
    }

    const limit = clampLimit(body?._limit ?? body?.limit, 20);
    const offset = clampOffset(body?._offset ?? body?.offset);
    const search = normalizeSearch(body?._search ?? body?.search);
    const singleStageRaw = String(body?._stage ?? body?.stage ?? "").trim().toLowerCase();
    const singleStage = ["new", "setup", "active", "paying"].includes(singleStageRaw)
      ? (singleStageRaw as ClientKanbanStage)
      : null;

    const searchParts: string[] = [];
    const params: any[] = [];
    if (search) {
      const like = `%${search}%`;
      searchParts.push(
        `(
          COALESCE(e.name, '') ILIKE ?
          OR COALESCE(e.contact_name, '') ILIKE ?
          OR COALESCE(e.email, '') ILIKE ?
          OR COALESCE(e.contact_email, '') ILIKE ?
          OR COALESCE(e.company_name, '') ILIKE ?
          OR COALESCE(CAST(e.public_id AS TEXT), '') ILIKE ?
        )`
      );
      params.push(like, like, like, like, like, like);
    }
    const baseWhereSql = searchParts.length > 0 ? `WHERE ${searchParts.join(" AND ")}` : "";
    const cteSql = `
      WITH emp_enriched AS (
        ${EMPLOYER_ENRICHED_CTE_SQL}
        ${baseWhereSql}
      ),
      emp_classified AS (
        SELECT *, ${CLIENT_STAGE_CASE_SQL} AS stage_key
        FROM emp_enriched
      )
    `;

    if (singleStage) {
      const [cntRow, stageRows] = await Promise.all([
        db.get(`${cteSql} SELECT COUNT(*)::int AS cnt FROM emp_classified WHERE stage_key = ?`, [
          ...params,
          singleStage,
        ]),
        db.all(
          `${cteSql} SELECT * FROM emp_classified WHERE stage_key = ? ORDER BY created_at DESC NULLS LAST LIMIT ? OFFSET ?`,
          [...params, singleStage, limit, offset]
        ),
      ]);
      const total = Number(cntRow?.cnt || 0);
      res.json({
        data: {
          stage: singleStage,
          items: stageRows || [],
          total,
          hasMore: offset + (stageRows?.length || 0) < total,
        },
        error: null,
      });
      return true;
    }

    const countsRows =
      (await db.all(
        `${cteSql} SELECT stage_key, COUNT(*)::int AS cnt FROM emp_classified GROUP BY stage_key`,
        params
      )) || [];
    const stageCounts: Record<ClientKanbanStage, number> = {
      new: 0,
      setup: 0,
      active: 0,
      paying: 0,
    };
    for (const r of countsRows) {
      if (r.stage_key && r.stage_key in stageCounts) {
        stageCounts[r.stage_key as ClientKanbanStage] = Number(r.cnt || 0);
      }
    }

    const stages: ClientKanbanStage[] = ["new", "setup", "active", "paying"];
    const stageResults = await Promise.all(
      stages.map((st) =>
        db.all(
          `${cteSql} SELECT * FROM emp_classified WHERE stage_key = ? ORDER BY created_at DESC NULLS LAST LIMIT ? OFFSET 0`,
          [...params, st, limit]
        )
      )
    );

    const payloadStages: Record<ClientKanbanStage, { items: any[]; total: number; hasMore: boolean }> = {
      new: { items: [], total: stageCounts.new, hasMore: false },
      setup: { items: [], total: stageCounts.setup, hasMore: false },
      active: { items: [], total: stageCounts.active, hasMore: false },
      paying: { items: [], total: stageCounts.paying, hasMore: false },
    };

    stages.forEach((st, idx) => {
      const items = stageResults[idx] || [];
      const total = stageCounts[st];
      payloadStages[st] = {
        items,
        total,
        hasMore: items.length < total,
      };
    });

    const totalAll = stageCounts.new + stageCounts.setup + stageCounts.active + stageCounts.paying;
    res.json({
      data: {
        stages: payloadStages,
        total: totalAll,
      },
      error: null,
    });
    return true;
  }

  if (method === "admin_vacancies_analytics_page") {
    if (!(await isAuthorizedAdminOrSysAdmin(req))) {
      res.status(401).json({ data: null, error: "Требуется авторизация администратора" });
      return true;
    }

    const limit = clampLimit(body?._limit ?? body?.limit, 20);
    const offset = clampOffset(body?._offset ?? body?.offset);
    const search = normalizeSearch(body?._search ?? body?.search);

    const whereParts: string[] = [];
    const params: any[] = [];
    if (search) {
      const like = `%${search}%`;
      whereParts.push(
        `(
          COALESCE(p.role_name, '') ILIKE ?
          OR COALESCE(CAST(p.public_id AS TEXT), '') ILIKE ?
          OR COALESCE(p.company_name, '') ILIKE ?
          OR COALESCE(co.name, '') ILIKE ?
        )`
      );
      params.push(like, like, like, like);
    }
    const whereSql = whereParts.length > 0 ? `WHERE ${whereParts.join(" AND ")}` : "";

    const [cntRow, projectRows] = await Promise.all([
      db.get(
        `SELECT COUNT(*)::int AS cnt
         FROM projects p
         LEFT JOIN companies co ON (p.company_id = co.id OR (co.public_id IS NOT NULL AND p.company_id = CAST(co.public_id AS TEXT)))
         ${whereSql}`,
        params
      ),
      db.all(
        `SELECT
           p.id, p.public_id, p.role_name, p.status, p.is_published, p.company_id,
           p.created_at, p.max_interviews, p.max_trainings,
           p.interview_limit, p.training_limit, p.interview_used, p.training_used,
           co.name AS resolved_company_name,
           co.public_id AS resolved_company_public_id
         FROM projects p
         LEFT JOIN companies co ON (p.company_id = co.id OR (co.public_id IS NOT NULL AND p.company_id = CAST(co.public_id AS TEXT)))
         ${whereSql}
         ORDER BY p.created_at DESC NULLS LAST
         LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      ),
    ]);

    const projects = projectRows || [];
    const total = Number(cntRow?.cnt || 0);

    let items: any[] = projects;
    if (projects.length > 0) {
      const projKeys = Array.from(
        new Set(
          projects.flatMap((p) =>
            [p.id, p.public_id != null ? String(p.public_id) : null].filter(Boolean) as string[]
          )
        )
      );
      const placeholders = projKeys.map(() => "?").join(", ");
      const [candsRows, scoresRows, progressRows] = await Promise.all([
        db.all(
          `SELECT id, project_id FROM candidates WHERE project_id IN (${placeholders})`,
          projKeys
        ),
        db.all(
          `SELECT cs.candidate_id, cs.resume_score, cs.checklist_score, cs.situations_score, cs.overall_score
           FROM candidate_scores cs
           JOIN candidates c ON c.id = cs.candidate_id
           WHERE c.project_id IN (${placeholders})`,
          projKeys
        ),
        db.all(
          `SELECT sp.candidate_id, sp.passed_at
           FROM candidate_stage_progress sp
           JOIN candidates c ON c.id = sp.candidate_id
           WHERE c.project_id IN (${placeholders})`,
          projKeys
        ),
      ]);

      const projKeyToId = new Map<string, string>();
      for (const p of projects) {
        projKeyToId.set(String(p.id), String(p.id));
        if (p.public_id != null) projKeyToId.set(String(p.public_id), String(p.id));
      }

      const candToProj = new Map<string, string>();
      const statsMap = new Map<
        string,
        { registrations: number; screening: number; checklist: number; situations: number; training: number; sumScore: number; scoreCount: number }
      >();
      for (const p of projects) {
        statsMap.set(String(p.id), {
          registrations: 0,
          screening: 0,
          checklist: 0,
          situations: 0,
          training: 0,
          sumScore: 0,
          scoreCount: 0,
        });
      }

      for (const c of candsRows || []) {
        const pid = projKeyToId.get(String(c.project_id));
        if (!pid) continue;
        candToProj.set(String(c.id), pid);
        const st = statsMap.get(pid);
        if (st) st.registrations++;
      }

      for (const s of scoresRows || []) {
        const pid = candToProj.get(String(s.candidate_id));
        const st = pid ? statsMap.get(pid) : null;
        if (!st) continue;
        if (s.resume_score != null) st.screening++;
        if (s.checklist_score != null) st.checklist++;
        if (s.situations_score != null) st.situations++;
        if (s.overall_score != null) {
          st.sumScore += Number(s.overall_score);
          st.scoreCount++;
        }
      }

      for (const pr of progressRows || []) {
        const pid = candToProj.get(String(pr.candidate_id));
        const st = pid ? statsMap.get(pid) : null;
        if (!st) continue;
        if (pr.passed_at != null) st.training++;
      }

      items = projects.map((p) => {
        const st = statsMap.get(String(p.id))!;
        return {
          ...p,
          company_name: p.resolved_company_name || p.company_name || "—",
          stats: st,
        };
      });
    }

    res.json({
      data: {
        items,
        total,
        hasMore: offset + items.length < total,
      },
      error: null,
    });
    return true;
  }

  if (method === "admin_interviews_page") {
    if (!(await isAuthorizedAdminOrSysAdmin(req))) {
      res.status(401).json({ data: null, error: "Требуется авторизация администратора" });
      return true;
    }

    const limit = clampLimit(body?._limit ?? body?.limit, 20);
    const offset = clampOffset(body?._offset ?? body?.offset);
    const search = normalizeSearch(body?._search ?? body?.search);

    const joinSql = `
      FROM candidate_scores cs
      LEFT JOIN candidates c ON c.id = cs.candidate_id
      LEFT JOIN projects p ON (c.project_id = p.id OR (p.public_id IS NOT NULL AND c.project_id = CAST(p.public_id AS TEXT)))
      LEFT JOIN companies co ON (
        p.company_id = co.id
        OR (co.public_id IS NOT NULL AND p.company_id = CAST(co.public_id AS TEXT))
        OR c.company_id = co.id
      )
    `;

    const whereParts: string[] = [];
    const params: any[] = [];
    if (search) {
      const like = `%${search}%`;
      whereParts.push(
        `(
          COALESCE(c.full_name, '') ILIKE ?
          OR COALESCE(c.email, '') ILIKE ?
          OR COALESCE(c.role_name, p.role_name, '') ILIKE ?
          OR COALESCE(co.name, p.company_name, '') ILIKE ?
          OR COALESCE(CAST(c.public_id AS TEXT), '') ILIKE ?
        )`
      );
      params.push(like, like, like, like, like);
    }
    const whereSql = whereParts.length > 0 ? `WHERE ${whereParts.join(" AND ")}` : "";

    const [cntRow, rows] = await Promise.all([
      db.get(`SELECT COUNT(*)::int AS cnt ${joinSql} ${whereSql}`, params),
      db.all(
        `SELECT
           cs.*,
           COALESCE(c.full_name, '') AS _name,
           COALESCE(c.email, '') AS _email,
           COALESCE(c.role_name, p.role_name, '') AS _role,
           COALESCE(co.name, p.company_name, '') AS _company,
           COALESCE(CAST(c.public_id AS TEXT), '') AS _public_id
         ${joinSql}
         ${whereSql}
         ORDER BY cs.updated_at DESC NULLS LAST
         LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      ),
    ]);

    const total = Number(cntRow?.cnt || 0);
    res.json({
      data: {
        items: rows || [],
        total,
        hasMore: offset + (rows?.length || 0) < total,
      },
      error: null,
    });
    return true;
  }

  if (method === "admin_trainings_page") {
    if (!(await isAuthorizedAdminOrSysAdmin(req))) {
      res.status(401).json({ data: null, error: "Требуется авторизация администратора" });
      return true;
    }

    const limit = clampLimit(body?._limit ?? body?.limit, 20);
    const offset = clampOffset(body?._offset ?? body?.offset);
    const search = normalizeSearch(body?._search ?? body?.search);
    const stage = String(body?._stage ?? body?.stage ?? "all").trim();

    const joinSql = `
      FROM candidate_stage_progress sp
      LEFT JOIN candidates c ON c.id = sp.candidate_id
      LEFT JOIN projects p ON (c.project_id = p.id OR (p.public_id IS NOT NULL AND c.project_id = CAST(p.public_id AS TEXT)))
      LEFT JOIN companies co ON (
        p.company_id = co.id
        OR (co.public_id IS NOT NULL AND p.company_id = CAST(co.public_id AS TEXT))
        OR c.company_id = co.id
      )
    `;

    const whereParts: string[] = [];
    const params: any[] = [];
    if (stage && stage !== "all") {
      whereParts.push(`sp.stage = ?`);
      params.push(stage);
    }
    if (search) {
      const like = `%${search}%`;
      whereParts.push(
        `(
          COALESCE(c.full_name, '') ILIKE ?
          OR COALESCE(c.email, '') ILIKE ?
          OR COALESCE(c.role_name, p.role_name, '') ILIKE ?
          OR COALESCE(co.name, p.company_name, '') ILIKE ?
          OR COALESCE(sp.stage, '') ILIKE ?
        )`
      );
      params.push(like, like, like, like, like);
    }
    const whereSql = whereParts.length > 0 ? `WHERE ${whereParts.join(" AND ")}` : "";

    const [cntRow, rows, stagesRows] = await Promise.all([
      db.get(`SELECT COUNT(*)::int AS cnt ${joinSql} ${whereSql}`, params),
      db.all(
        `SELECT
           sp.*,
           COALESCE(c.full_name, '') AS _name,
           COALESCE(c.email, '') AS _email,
           COALESCE(c.role_name, p.role_name, '') AS _role,
           COALESCE(co.name, p.company_name, '') AS _company,
           COALESCE(CAST(c.public_id AS TEXT), '') AS _public_id
         ${joinSql}
         ${whereSql}
         ORDER BY sp.updated_at DESC NULLS LAST
         LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      ),
      db.all(
        `SELECT DISTINCT stage FROM candidate_stage_progress WHERE stage IS NOT NULL AND TRIM(stage) != '' ORDER BY stage ASC`
      ),
    ]);

    const total = Number(cntRow?.cnt || 0);
    res.json({
      data: {
        items: rows || [],
        total,
        hasMore: offset + (rows?.length || 0) < total,
        stages: (stagesRows || []).map((r: any) => r.stage),
      },
      error: null,
    });
    return true;
  }

  if (method === "admin_transactions_page") {
    if (!(await isAuthorizedAdminOrSysAdmin(req))) {
      res.status(401).json({ data: null, error: "Требуется авторизация администратора" });
      return true;
    }

    const limit = clampLimit(body?._limit ?? body?.limit, 20);
    const offset = clampOffset(body?._offset ?? body?.offset);
    const search = normalizeSearch(body?._search ?? body?.search);
    const empFilter = String(body?._employer_id ?? body?.employer_id ?? "").trim();

    const joinSql = `
      FROM transactions t
      LEFT JOIN wallets w ON w.id = t.wallet_id
      LEFT JOIN employers e ON (
        e.id = w.employer_id
        OR (e.public_id IS NOT NULL AND CAST(e.public_id AS TEXT) = w.employer_id)
      )
    `;

    const whereParts: string[] = [];
    const params: any[] = [];
    if (empFilter) {
      whereParts.push(`(e.id = ? OR COALESCE(CAST(e.public_id AS TEXT), '') = ? OR w.employer_id = ?)`);
      params.push(empFilter, empFilter, empFilter);
    }
    if (search) {
      const like = `%${search}%`;
      whereParts.push(
        `(
          COALESCE(e.name, '') ILIKE ?
          OR COALESCE(e.email, '') ILIKE ?
          OR COALESCE(t.note, '') ILIKE ?
          OR COALESCE(t.description, '') ILIKE ?
          OR COALESCE(t.type, '') ILIKE ?
        )`
      );
      params.push(like, like, like, like, like);
    }
    const whereSql = whereParts.length > 0 ? `WHERE ${whereParts.join(" AND ")}` : "";

    const [cntRow, rows] = await Promise.all([
      db.get(`SELECT COUNT(*)::int AS cnt ${joinSql} ${whereSql}`, params),
      db.all(
        `SELECT
           t.*,
           e.id AS _emp_id,
           COALESCE(e.name, e.contact_name, '') AS _emp_name,
           COALESCE(e.email, e.contact_email, '') AS _emp_email
         ${joinSql}
         ${whereSql}
         ORDER BY t.created_at DESC NULLS LAST
         LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      ),
    ]);

    const total = Number(cntRow?.cnt || 0);
    res.json({
      data: {
        items: rows || [],
        total,
        hasMore: offset + (rows?.length || 0) < total,
      },
      error: null,
    });
    return true;
  }

  if (method === "admin_logs_page") {
    if (!(await isAuthorizedAdminOrSysAdmin(req))) {
      res.status(401).json({ data: null, error: "Требуется авторизация администратора" });
      return true;
    }

    const limit = clampLimit(body?._limit ?? body?.limit, 20);
    const offset = clampOffset(body?._offset ?? body?.offset);
    const search = normalizeSearch(body?._search ?? body?.search);

    const whereParts: string[] = [];
    const params: any[] = [];
    if (search) {
      const like = `%${search}%`;
      whereParts.push(
        `(
          COALESCE(user_message, '') ILIKE ?
          OR COALESCE(bot_reply, '') ILIKE ?
          OR COALESCE(channel_name, '') ILIKE ?
          OR COALESCE(CAST(bot_id AS TEXT), '') ILIKE ?
          OR COALESCE(llm, '') ILIKE ?
          OR COALESCE(CAST(user_social_id AS TEXT), '') ILIKE ?
          OR COALESCE(rejection_reason, '') ILIKE ?
          OR COALESCE("textContent", '') ILIKE ?
          OR COALESCE(ai_reply, '') ILIKE ?
        )`
      );
      params.push(like, like, like, like, like, like, like, like, like);
    }
    const whereSql = whereParts.length > 0 ? `WHERE ${whereParts.join(" AND ")}` : "";

    const [aggRow, rows] = await Promise.all([
      db.get(
        `SELECT
           COUNT(*)::int AS cnt,
           COALESCE(SUM(COALESCE(tokens_total, 0)), 0)::bigint AS total_tokens
         FROM logs
         ${whereSql}`,
        params
      ),
      db.all(
        `SELECT * FROM logs ${whereSql} ORDER BY created_at DESC NULLS LAST LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      ),
    ]);

    const total = Number(aggRow?.cnt || 0);
    const totalTokens = Number(aggRow?.total_tokens || 0);
    res.json({
      data: {
        items: rows || [],
        total,
        totalTokens,
        hasMore: offset + (rows?.length || 0) < total,
      },
      error: null,
    });
    return true;
  }

  return false;
}
