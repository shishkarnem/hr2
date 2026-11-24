import crypto from "crypto";
import { Request, Response } from "express";
import {
  PgDBWrapper,
  saveCompanyToProTalkDB,
  saveProjectToProTalkDB,
  recalculateEmployerBalances,
  generateNextCompanyPublicId,
  generateNextProjectPublicId,
  checkRateLimit,
  syncTrainingTestsPaymentsAndCabinetStatus,
} from "../db";
import { employerSessions, genId } from "../routes/auth/helpers";
import { ALLOWED_LIMIT_COLS } from "./employerLimitsRpc";

async function ensureInterviewSystemAndBlocks(db: PgDBWrapper, emp: any, projObj: any, sourceName: string) {
  if (!projObj || !projObj.id) return;
  const pId = projObj.id;
  const comp = projObj.company_id
    ? await db.get("SELECT * FROM companies WHERE id = ? OR CAST(public_id AS TEXT) = ? LIMIT 1", [projObj.company_id, String(projObj.company_id)])
    : projObj.company_name
    ? await db.get("SELECT * FROM companies WHERE LOWER(name) = LOWER(?) LIMIT 1", [projObj.company_name])
    : null;

  const ownerCandidates = Array.from(
    new Set(
      [projObj.employer_id, projObj.employer_public_id]
        .map((v) => String(v ?? "").trim())
        .filter(Boolean)
    )
  );
  let projOwner: any = null;
  if (ownerCandidates.length > 0) {
    const conds = ownerCandidates
      .map(() => `(id = ? OR CAST(public_id AS TEXT) = ?)`)
      .join(" OR ");
    const ownerParams = ownerCandidates.flatMap((v) => [v, v]);
    projOwner = await db.get(`SELECT id FROM employers WHERE ${conds} LIMIT 1`, ownerParams);
  }
  const forcedCreatedBy = projOwner?.id || emp.id;

  const existingSys = await db.get("SELECT * FROM interview_systems WHERE project_id = ? LIMIT 1", [pId]);
  if (!existingSys) {
    await db.run(
      `INSERT INTO interview_systems (id, project_id, created_by, status, source, created_at, updated_at)
       VALUES (?, ?, ?, 'draft', ?, NOW(), NOW()) ON CONFLICT (project_id) DO NOTHING`,
      [crypto.randomUUID(), pId, forcedCreatedBy, sourceName]
    );
  } else if (!existingSys.created_by || existingSys.created_by !== forcedCreatedBy) {
    await db.run("UPDATE interview_systems SET created_by = ?, updated_at = NOW() WHERE id = ?", [forcedCreatedBy, existingSys.id]);
  }

  const role = projObj.role_name || "Специалист";
  const cName = projObj.company_name || comp?.name || "Компания";
  const vac = String(projObj.vacancy_text || "").replace(/\s+/g, " ").trim().slice(0, 350);
  const tasks = String(projObj.tasks_activity_text || "").replace(/\s+/g, " ").trim().slice(0, 350);
  const sysText = String(projObj.system_text || comp?.system_text || "").replace(/\s+/g, " ").trim().slice(0, 250);
  const team = String(projObj.team_text || comp?.team_text || "").replace(/\s+/g, " ").trim().slice(0, 250);
  const sched = String(projObj.schedule_terms || projObj.schedule_text || comp?.schedule_text || "").replace(/\s+/g, " ").trim().slice(0, 200);
  const sal = String(projObj.salary_terms || projObj.payouts_text || comp?.payouts_text || "").replace(/\s+/g, " ").trim().slice(0, 200);

  const defaultWishes = {
    resume: [`Вакансия: ${role} (${cName}).`, vac ? `Ключевые требования к опыту и навыкам: ${vac}` : "", sched ? `График и формат работы: ${sched}` : "", sal ? `Условия мотивации: ${sal}` : ""].filter(Boolean).join(" ").slice(0, 950),
    checklist: [`Проверка профессиональных знаний на позицию «${role}» в компании «${cName}».`, tasks ? `Основные рабочие задачи: ${tasks}` : "", sysText ? `Используемые программы и системы: ${sysText}` : ""].filter(Boolean).join(" ").slice(0, 950),
    situations: [`Практические рабочие ситуации и кейсы для должности «${role}» (${cName}).`, tasks ? `Контекст обязанностей: ${tasks}` : "", team ? `Взаимодействие в команде: ${team}` : ""].filter(Boolean).join(" ").slice(0, 950),
  };

  const defaultCriteriaMd = [
    `## Критерии оценки резюме на позицию «${role}» (${cName})`,
    projObj.vacancy_text ? `### 1. Обязательные требования и профильный опыт\n${projObj.vacancy_text}` : "",
    projObj.tasks_activity_text ? `### 2. Ключевые задачи и функции\n${projObj.tasks_activity_text}` : "",
    projObj.system_text || comp?.system_text ? `### 3. Программы, инструменты и рабочая среда\n${projObj.system_text || comp?.system_text}` : "",
    projObj.schedule_terms || projObj.salary_terms || projObj.motivation_text
      ? `### 4. Соответствие условиям и формату работы\n${[projObj.salary_terms, projObj.schedule_terms, projObj.motivation_text].filter(Boolean).join("\n\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  let parsedChecklist: any[] = [];
  try {
    const rawC = JSON.parse(projObj.checklist_questions || "[]");
    if (Array.isArray(rawC)) parsedChecklist = rawC;
  } catch {}
  let parsedSituations: any[] = [];
  try {
    const rawS = JSON.parse(projObj.roleplay_questions || "[]");
    if (Array.isArray(rawS)) parsedSituations = rawS;
  } catch {}

  const initialPayloads: Record<string, any> = {
    resume: { criteria_md: defaultCriteriaMd, employer_wishes: defaultWishes.resume },
    checklist: { questions: parsedChecklist, shuffle: false, employer_wishes: defaultWishes.checklist },
    situations: { situations: parsedSituations, employer_wishes: defaultWishes.situations },
  };

  for (const kind of ["resume", "checklist", "situations"] as const) {
    const existingBlk = await db.get("SELECT * FROM interview_blocks WHERE project_id = ? AND kind = ? LIMIT 1", [pId, kind]);
    if (!existingBlk) {
      await db.run(
        `INSERT INTO interview_blocks (id, project_id, kind, payload, created_at, updated_at)
         VALUES (?, ?, ?, ?, NOW(), NOW()) ON CONFLICT (project_id, kind) DO NOTHING`,
        [crypto.randomUUID(), pId, kind, JSON.stringify(initialPayloads[kind])]
      );
    } else {
      let curPl: any = {};
      try { curPl = JSON.parse(existingBlk.payload || "{}"); } catch {}
      let changed = false;
      if (kind === "resume") {
        if (!curPl.criteria_md) { curPl.criteria_md = initialPayloads.resume.criteria_md; changed = true; }
        if (!curPl.employer_wishes) { curPl.employer_wishes = initialPayloads.resume.employer_wishes; changed = true; }
      } else if (kind === "checklist") {
        if (!Array.isArray(curPl.questions)) { curPl.questions = initialPayloads.checklist.questions; changed = true; }
        if (typeof curPl.shuffle !== "boolean") { curPl.shuffle = false; changed = true; }
        if (!curPl.employer_wishes) { curPl.employer_wishes = initialPayloads.checklist.employer_wishes; changed = true; }
      } else if (kind === "situations") {
        if (!Array.isArray(curPl.situations)) { curPl.situations = initialPayloads.situations.situations; changed = true; }
        if (!curPl.employer_wishes) { curPl.employer_wishes = initialPayloads.situations.employer_wishes; changed = true; }
      }
      if (changed) {
        await db.run("UPDATE interview_blocks SET payload = ?, updated_at = NOW() WHERE id = ?", [JSON.stringify(curPl), existingBlk.id]);
      }
    }
  }
  void syncTrainingTestsPaymentsAndCabinetStatus(db).catch(() => {});
}

async function ensureTrainingBlocksAndTests(db: PgDBWrapper, projObj: any) {
  if (!projObj || !projObj.id) return;
  const pId = projObj.id;
  const comp = projObj.company_id
    ? await db.get("SELECT * FROM companies WHERE id = ? OR CAST(public_id AS TEXT) = ? LIMIT 1", [projObj.company_id, String(projObj.company_id)])
    : projObj.company_name
    ? await db.get("SELECT * FROM companies WHERE LOWER(name) = LOWER(?) LIMIT 1", [projObj.company_name])
    : null;

  const role = projObj.role_name || "Специалист";
  const cName = projObj.company_name || comp?.name || "Компания";
  const stageTitles: Record<string, string> = {
    professional: "1. Профессиональное обучение",
    product: "2. Продуктовое обучение",
    system: "3. Системное обучение",
  };
  const stageMaterials: Record<string, string> = {
    professional: projObj.training_professional_text || comp?.training_professional_text || projObj.onboarding_text || comp?.onboarding_text || projObj.tasks_activity_text || `# Профессиональное обучение: ${role}\n\nСтандарты работы, ключевые обязанности и регламенты выполнения задач в компании «${cName}».`,
    product: projObj.training_product_text || comp?.training_product_text || projObj.vacancy_text || comp?.description || `# Продуктовое обучение: ${cName}\n\nЛинейка продуктов и услуг компании «${cName}», ключевые преимущества и ценность для клиентов.`,
    system: projObj.training_systems_text || comp?.training_systems_text || projObj.system_text || comp?.system_text || `# Системное обучение: ${role}\n\nПравила работы во внутренних ИТ-системах, CRM, порядок отчетности и коммуникации в команде «${cName}».`,
  };
  const stageOrder: Record<string, number> = { professional: 1, product: 2, system: 3 };

  for (const stg of ["professional", "product", "system"] as const) {
    const existingBlk = await db.get("SELECT id FROM training_blocks WHERE project_id = ? AND stage = ? LIMIT 1", [pId, stg]);
    if (!existingBlk) {
      await db.run(
        `INSERT INTO training_blocks (id, project_id, stage, title, block_key, materials_md, subpages_json, order_index, pass_score, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'main', ?, '[]', ?, 70, NOW(), NOW())
         ON CONFLICT (project_id, stage) DO NOTHING`,
        [crypto.randomUUID(), pId, stg, stageTitles[stg], stageMaterials[stg], stageOrder[stg]]
      );
    }
  }
  void syncTrainingTestsPaymentsAndCabinetStatus(db).catch(() => {});
}

const spendInFlightLocks = new Map<string, Promise<void>>();
const spendRequestCache = new Map<string, { ts: number; status: number; body: any }>();

async function withSpendLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = spendInFlightLocks.get(key) || Promise.resolve();
  let release!: () => void;
  const next = new Promise<void>((resolve) => {
    release = resolve;
  });
  const chained = prev.then(() => next);
  spendInFlightLocks.set(key, chained);
  await prev;
  try {
    return await fn();
  } finally {
    release();
    if (spendInFlightLocks.get(key) === chained) {
      spendInFlightLocks.delete(key);
    }
  }
}

export async function handleProjectAndCompanyRpc(
  db: PgDBWrapper,
  method: string,
  req: Request,
  body: any,
  res: Response
): Promise<boolean> {
  if (method === "project_create_draft") {
    const authHeader = req.headers.authorization || (req.headers["x-employer-token"] as string);
    const token = authHeader ? authHeader.replace("Bearer ", "").trim() : "";
    const currentEmp = token ? employerSessions[token] : null;
    const employerId = body?._employer || body?.employerId || body?.employer_id || currentEmp?.id || currentEmp?.public_id || "100007";
    const companyId = body?._company || body?.companyId || body?.company_id || null;

    const cleanEmp = String(employerId).replace(/^emp-?/, "");
    const existing = await db.get(
      `SELECT * FROM projects
       WHERE (employer_id = ? OR employer_id = ? OR employer_id = ?)
         AND (status = 'draft' OR COALESCE(CAST(is_published AS TEXT), '0') IN ('0', '0.0', 'false', 'f', 'FALSE'))
         AND (role_name IS NULL OR trim(role_name) = '')
       ORDER BY created_at DESC LIMIT 1`,
      [employerId, `emp-${cleanEmp}`, cleanEmp]
    );
    if (existing) {
      res.json({ id: existing.id, public_id: existing.public_id || existing.id, reused: true });
      return true;
    }

    const newId = `proj-${Math.random().toString(36).substring(2, 9)}`;
    const newPubId = await generateNextProjectPublicId(db);
    await saveProjectToProTalkDB(db, {
      id: newId,
      public_id: newPubId,
      employer_id: employerId,
      company_id: companyId,
      role_name: "",
      status: "draft",
      is_published: 0,
      checklist_questions: "[]",
      roleplay_questions: "[]",
    });
    res.json({ id: newId, public_id: newPubId, reused: false });
    return true;
  }

  if (method === "company_create_draft") {
    const authHeader = req.headers.authorization || (req.headers["x-employer-token"] as string);
    const token = authHeader ? authHeader.replace("Bearer ", "").trim() : "";
    const currentEmp = token ? employerSessions[token] : null;
    const employerId = body?._employer || body?.employerId || body?.employer_id || currentEmp?.id || currentEmp?.public_id || "100007";

    const cleanEmp = String(employerId).replace(/^emp-?/, "");
    const existing = await db.get(
      `SELECT * FROM companies
       WHERE (owner_employer_id = ? OR employer_id = ? OR owner_employer_id = ? OR employer_id = ?)
         AND (status = 'draft' OR COALESCE(CAST(is_published AS TEXT), '0') IN ('0', '0.0', 'false', 'f', 'FALSE'))
         AND (name IS NULL OR trim(name) = '')
       ORDER BY created_at DESC LIMIT 1`,
      [employerId, employerId, cleanEmp, `emp-${cleanEmp}`]
    );
    if (existing) {
      res.json({ id: existing.id, public_id: existing.public_id || existing.id, reused: true });
      return true;
    }

    const newId = `comp-${Math.random().toString(36).substring(2, 8)}`;
    const newPubId = await generateNextCompanyPublicId(db);
    await saveCompanyToProTalkDB(db, {
      id: newId,
      public_id: newPubId,
      name: "",
      slug: `draft-${newId}`,
      status: "draft",
      is_published: 0,
      employer_id: employerId,
      owner_employer_id: employerId,
    });
    res.json({ id: newId, public_id: newPubId, reused: false });
    return true;
  }

  if (method === "company_update") {
    const { _id, _patch } = body;
    if (_id && _patch) {
      const patchObj = typeof _patch === "string" ? JSON.parse(_patch) : _patch;
      await saveCompanyToProTalkDB(db, { id: _id, ...patchObj });
    }
    res.json({ ok: true });
    return true;
  }

  if (method === "company_finalize") {
    const { _id } = body;
    if (_id) await db.run("UPDATE companies SET status = 'active', is_published = 1, updated_at = NOW() WHERE id = ?", [_id]);
    res.json({ ok: true });
    return true;
  }

  if (method === "spend_fixed" || method === "spend_fixed_for_employer") {
    const { _project, _item = "landing", _prefer = "credit", _employer_public_id, _employer_id, _allocate_qty, _request_id } = body;
    const clientIp = (req.headers["x-forwarded-for"] as string) || req.ip || "local";
    await checkRateLimit(`rpc:${method}:${clientIp}`, 60, 60);
    const authHeader = req.headers.authorization || (req.headers["x-employer-token"] as string);
    const token = authHeader ? authHeader.replace("Bearer ", "").trim() : "";
    const currentEmp = token ? employerSessions[token] : null;
    const requestedId = _employer_public_id || _employer_id || body?.public_id || body?.employer_id || currentEmp?.id || currentEmp?.public_id || "100007";
    const cleanPublic = String(requestedId || "").replace(/^emp-?/i, "").trim();

    const lockKey = `${cleanPublic || requestedId}:${_item}:${String(_project || "")}`;
    const result = await withSpendLock(lockKey, async () => {
      if (_request_id) {
        const now = Date.now();
        for (const [k, v] of spendRequestCache.entries()) {
          if (now - v.ts > 5 * 60 * 1000) spendRequestCache.delete(k);
        }
        const cached = spendRequestCache.get(`${lockKey}:${String(_request_id)}`);
        if (cached) return cached;
      }

      let emp =
        (await db.get(
          "SELECT * FROM employers WHERE id = ? OR CAST(public_id AS TEXT) = ? OR CAST(public_id AS TEXT) = ? OR id = ? OR id = ?",
          [String(requestedId), String(requestedId), cleanPublic, `emp${cleanPublic}`, `emp-${cleanPublic}`]
        )) || (await db.get("SELECT * FROM employers LIMIT 1"));
      if (!emp) {
        return { status: 200, body: { data: null, error: "no_employer" } };
      }

      const prices: Record<string, { price: number; col: string; jsonKey: string; name: string }> = {
        landing: { price: 500, col: "landing_credits", jsonKey: "landings", name: "ИИ-Лендинг вакансии" },
        landings: { price: 500, col: "landing_credits", jsonKey: "landings", name: "ИИ-Лендинг вакансии" },
        interview_setup: { price: 200, col: "interview_setup_credits", jsonKey: "interviewSystems", name: "ИИ-Система интервью" },
        interviewSystems: { price: 200, col: "interview_setup_credits", jsonKey: "interviewSystems", name: "ИИ-Система интервью" },
        training_setup: { price: 300, col: "training_setup_credits", jsonKey: "trainingSystems", name: "ИИ-Система обучения" },
        trainingSystems: { price: 300, col: "training_setup_credits", jsonKey: "trainingSystems", name: "ИИ-Система обучения" },
      };
      const itemInfo = prices[_item] || prices.landing;
      const isInterviewSetup = _item === "interview_setup" || _item === "interviewSystems";
      const isTrainingSetup = _item === "training_setup" || _item === "trainingSystems";

      const targetProj = _project
        ? await db.get("SELECT * FROM projects WHERE id = ? OR CAST(public_id AS TEXT) = ? OR slug = ? LIMIT 1", [_project, String(_project), _project])
        : null;
      const canonicalProjectId = targetProj ? targetProj.id : _project || "";

      const poolCol = isInterviewSetup ? "interview_credits" : isTrainingSetup ? "training_credits" : "";
      const poolJsonKey = isInterviewSetup ? "interviews" : isTrainingSetup ? "trainings" : "";
      const projLimitCol = isInterviewSetup ? "interview_limit" : "training_limit";
      const projMaxCol = isInterviewSetup ? "max_interviews" : "max_trainings";
      const projUsedCol = isInterviewSetup ? "interview_used" : "training_used";

      let limitsJson: Record<string, any> = {};
      try { limitsJson = JSON.parse(emp.limits_json || "{}"); } catch {}

      const empPool = poolCol ? Math.max(0, Number(emp[poolCol] ?? limitsJson[poolJsonKey] ?? 0)) : 0;
      const curVacLimit = targetProj ? Math.max(0, Number(targetProj[projLimitCol] ?? targetProj[projMaxCol] ?? 0)) : 0;
      const curVacUsed = targetProj ? Math.max(0, Number(targetProj[projUsedCol] ?? 0)) : 0;
      const curVacRemaining = Math.max(0, curVacLimit - curVacUsed);
      const requestedAlloc =
        targetProj && (isInterviewSetup || isTrainingSetup)
          ? _allocate_qty !== undefined
            ? Math.max(0, Math.floor(Number(_allocate_qty) || 0))
            : curVacRemaining === 0 && empPool > 0
            ? Math.min(10, empPool)
            : 0
          : 0;

      if (requestedAlloc > empPool) {
        return {
          status: 400,
          body: {
            error: "not_enough_pool",
            message: `На общем балансе компании недостаточно лимитов (запрошено ${requestedAlloc}, доступно ${empPool})`,
          },
        };
      }

      const applyPoolAndSetupUpdate = async (nextSetupCredits?: number, nextBalance?: number) => {
        const nextPool = Math.max(0, empPool - requestedAlloc);
        if (requestedAlloc > 0 && targetProj && poolCol) {
          const nextVacLimit = curVacLimit + requestedAlloc;
          limitsJson[poolJsonKey] = nextPool;
          await db.run(`UPDATE projects SET ${projLimitCol} = ?, ${projMaxCol} = ?, updated_at = NOW() WHERE id = ?`, [
            nextVacLimit,
            nextVacLimit,
            targetProj.id,
          ]);
          targetProj[projLimitCol] = nextVacLimit;
        }
        const setParts: string[] = ["updated_at = NOW()"];
        const setParams: any[] = [];
        if (requestedAlloc > 0 && poolCol) {
          setParts.push(`${poolCol} = ?`);
          setParams.push(nextPool);
          limitsJson[poolJsonKey] = nextPool;
        }
        if (nextSetupCredits !== undefined && ALLOWED_LIMIT_COLS.has(itemInfo.col)) {
          setParts.push(`${itemInfo.col} = ?`);
          setParams.push(nextSetupCredits);
          limitsJson[itemInfo.jsonKey] = nextSetupCredits;
          delete limitsJson[itemInfo.col];
        }
        if (nextBalance !== undefined) {
          setParts.push("balance = ?");
          setParams.push(nextBalance);
        }
        if (setParts.length > 1) {
          setParts.push("limits_json = ?");
          setParams.push(JSON.stringify(limitsJson));
          setParams.push(emp.id);
          await db.run(`UPDATE employers SET ${setParts.join(", ")} WHERE id = ?`, setParams);
        }
        return requestedAlloc;
      };

      const idemKey = canonicalProjectId ? `fixed:${isInterviewSetup ? "interview_setup" : isTrainingSetup ? "training_setup" : _item}:${canonicalProjectId}` : "";
      const existingTx = idemKey
        ? await db.get("SELECT id FROM transactions WHERE idem_key = ? LIMIT 1", [idemKey])
        : null;

      if (isInterviewSetup && canonicalProjectId) {
        const alreadySys = await db.get("SELECT * FROM interview_systems WHERE project_id = ? LIMIT 1", [canonicalProjectId]);
        if (alreadySys || existingTx) {
          const allocated = await applyPoolAndSetupUpdate();
          if (targetProj) await ensureInterviewSystemAndBlocks(db, emp, targetProj, "spend_fixed_already");
          const resp = { status: 200, body: { ok: true, already: true, allocated_limits: allocated, project_id: canonicalProjectId } };
          if (_request_id) spendRequestCache.set(`${lockKey}:${String(_request_id)}`, { ts: Date.now(), ...resp });
          return resp;
        }
      }
      if (isTrainingSetup && canonicalProjectId) {
        const existingTBlocks = await db.all(
          "SELECT id FROM training_blocks WHERE project_id = ? AND stage IN ('professional', 'product', 'system')",
          [canonicalProjectId]
        );
        if ((existingTBlocks || []).length >= 3 || existingTx) {
          const allocated = await applyPoolAndSetupUpdate();
          if (targetProj) await ensureTrainingBlocksAndTests(db, targetProj);
          const resp = { status: 200, body: { ok: true, already: true, allocated_limits: allocated, project_id: canonicalProjectId } };
          if (_request_id) spendRequestCache.set(`${lockKey}:${String(_request_id)}`, { ts: Date.now(), ...resp });
          return resp;
        }
      }

      const userCredits = Number(emp[itemInfo.col] || 0);
      const currentBal = Number(emp.balance || 0);

      if (_prefer !== "balance" && userCredits > 0 && ALLOWED_LIMIT_COLS.has(itemInfo.col)) {
        const newCredits = userCredits - 1;
        const allocated = await applyPoolAndSetupUpdate(newCredits, undefined);

        if (isInterviewSetup && targetProj) await ensureInterviewSystemAndBlocks(db, emp, targetProj, "spend_fixed_credit");
        else if (isTrainingSetup && targetProj) await ensureTrainingBlocksAndTests(db, targetProj);

        let wallet = await db.get("SELECT * FROM wallets WHERE employer_id = ?", [emp.id]);
        if (!wallet) {
          const walletId = genId("wall");
          await db.run("INSERT INTO wallets (id, employer_id, units_balance) VALUES (?, ?, ?)", [walletId, emp.id, currentBal]);
          wallet = { id: walletId };
        }
        const note = `Списание 1 лимита: «${itemInfo.name}»`;
        await db.run(
          `INSERT INTO transactions (id, wallet_id, amount_rr, amount_limits, type_limits, type, type_balance, description, note, ref_table, ref_id, idem_key, created_at)
           VALUES (?, ?, 0, -1, ?, 'spend_fixed_credit', 'limits', ?, ?, 'projects', ?, ?, NOW())`,
          [genId("tx"), wallet.id, itemInfo.col, note, note, canonicalProjectId, idemKey || `fixed:${_item}:${canonicalProjectId}`]
        );
        const resp = {
          status: 200,
          body: { ok: true, used_credit: true, left: newCredits, allocated_limits: allocated, project_id: canonicalProjectId },
        };
        if (_request_id) spendRequestCache.set(`${lockKey}:${String(_request_id)}`, { ts: Date.now(), ...resp });
        return resp;
      }

      if (_prefer === "pool" && (empPool > 0 || curVacRemaining > 0)) {
        const allocated = await applyPoolAndSetupUpdate();
        if (isInterviewSetup && targetProj) await ensureInterviewSystemAndBlocks(db, emp, targetProj, "spend_fixed_pool");
        else if (isTrainingSetup && targetProj) await ensureTrainingBlocksAndTests(db, targetProj);
        const resp = {
          status: 200,
          body: { ok: true, used_credit: true, allocated_limits: allocated, project_id: canonicalProjectId },
        };
        if (_request_id) spendRequestCache.set(`${lockKey}:${String(_request_id)}`, { ts: Date.now(), ...resp });
        return resp;
      }

      if (currentBal < itemInfo.price) {
        return { status: 400, body: { error: "insufficient_funds", message: "Недостаточно RR на балансе" } };
      }

      const newBal = currentBal - itemInfo.price;
      const allocated = await applyPoolAndSetupUpdate(undefined, newBal);

      if (isInterviewSetup && targetProj) await ensureInterviewSystemAndBlocks(db, emp, targetProj, "spend_fixed_balance");
      else if (isTrainingSetup && targetProj) await ensureTrainingBlocksAndTests(db, targetProj);

      let wallet = await db.get("SELECT * FROM wallets WHERE employer_id = ?", [emp.id]);
      if (wallet) await db.run("UPDATE wallets SET units_balance = ?, updated_at = NOW() WHERE id = ?", [newBal, wallet.id]);
      else {
        const walletId = genId("wall");
        await db.run("INSERT INTO wallets (id, employer_id, units_balance) VALUES (?, ?, ?)", [walletId, emp.id, newBal]);
        wallet = { id: walletId };
      }

      const note = `Оплата услуги: «${itemInfo.name}» (${itemInfo.price} RR)`;
      await db.run(
        `INSERT INTO transactions (id, wallet_id, amount_rr, type, type_balance, description, note, ref_table, ref_id, idem_key, created_at)
         VALUES (?, ?, ?, 'spend_fixed_balance', 'limits', ?, ?, 'projects', ?, ?, NOW())`,
        [genId("tx"), wallet.id, itemInfo.price, note, note, canonicalProjectId, idemKey || `fixed:${_item}:${canonicalProjectId}`]
      );
      await recalculateEmployerBalances(db, emp.id);

      try {
        const { checkEmployerLowBalanceRR, checkEmployerLowGeneralLimits } = await import(
          "../services/notifications/lowBalanceNotifier"
        );
        await checkEmployerLowBalanceRR(db, emp.id, currentBal);
        if (allocated > 0) {
          await checkEmployerLowGeneralLimits(db, emp.id);
        }
      } catch {}

      const resp = {
        status: 200,
        body: { ok: true, amount: itemInfo.price, used_credit: false, allocated_limits: allocated, project_id: canonicalProjectId },
      };
      if (_request_id) spendRequestCache.set(`${lockKey}:${String(_request_id)}`, { ts: Date.now(), ...resp });
      return resp;
    });

    res.status(result.status).json(result.body);
    return true;
  }

  if (method === "reallocate_project_limits") {
    const { _project, _new_interview_limit, _new_training_limit, _employer_id } = body;
    const proj = await db.get("SELECT * FROM projects WHERE id = ? OR CAST(public_id AS TEXT) = ? LIMIT 1", [_project, String(_project)]);
    if (!proj) {
      res.status(404).json({ ok: false, error: "project_not_found" });
      return true;
    }

    let emp: any = null;
    if (_employer_id) {
      const cleanReq = String(_employer_id).replace(/^emp-?/i, "").trim();
      emp = await db.get(
        "SELECT * FROM employers WHERE id = ? OR CAST(public_id AS TEXT) = ? OR id = ? OR CAST(public_id AS TEXT) = ? LIMIT 1",
        [_employer_id, String(_employer_id), `emp-${cleanReq}`, cleanReq]
      );
    }
    if (!emp && proj.company_id) {
      const comp = await db.get(
        "SELECT owner_employer_id, employer_id FROM companies WHERE id = ? OR CAST(public_id AS TEXT) = ? LIMIT 1",
        [proj.company_id, String(proj.company_id)]
      );
      const ownerTarget = comp?.owner_employer_id || comp?.employer_id;
      if (ownerTarget) {
        const cleanOwner = String(ownerTarget).replace(/^emp-?/i, "").trim();
        emp = await db.get(
          "SELECT * FROM employers WHERE id = ? OR CAST(public_id AS TEXT) = ? OR id = ? OR CAST(public_id AS TEXT) = ? LIMIT 1",
          [ownerTarget, String(ownerTarget), `emp-${cleanOwner}`, cleanOwner]
        );
      }
    }
    if (!emp) {
      emp =
        (await db.get("SELECT * FROM employers WHERE id = ? OR CAST(public_id AS TEXT) = ? OR CAST(public_id AS TEXT) = ? LIMIT 1", [
          proj.employer_id,
          String(proj.employer_id || ""),
          String(proj.employer_public_id || ""),
        ])) || (await db.get("SELECT * FROM employers LIMIT 1"));
    }
    if (!emp) {
      res.status(404).json({ ok: false, error: "employer_not_found" });
      return true;
    }

    const curILim = Math.max(0, Number(proj.interview_limit ?? proj.max_interviews ?? 0));
    const curTLim = Math.max(0, Number(proj.training_limit ?? proj.max_trainings ?? 0));
    const usedI = Math.max(0, Number(proj.interview_used ?? 0));
    const usedT = Math.max(0, Number(proj.training_used ?? 0));
    const nextILim = _new_interview_limit !== undefined ? Math.floor(Number(_new_interview_limit)) : curILim;
    const nextTLim = _new_training_limit !== undefined ? Math.floor(Number(_new_training_limit)) : curTLim;

    if (nextILim < usedI) { res.status(400).json({ ok: false, error: "interview_limit_below_used" }); return true; }
    if (nextTLim < usedT) { res.status(400).json({ ok: false, error: "training_limit_below_used" }); return true; }

    let limitsJson: any = {};
    try { limitsJson = JSON.parse(emp.limits_json || "{}"); } catch {}
    const poolI = Math.max(0, Number(emp.interview_credits ?? limitsJson.interviews ?? 0));
    const poolT = Math.max(0, Number(emp.training_credits ?? limitsJson.trainings ?? 0));
    const dI = nextILim - curILim;
    const dT = nextTLim - curTLim;

    if (dI > 0 && dI > poolI) { res.status(400).json({ ok: false, error: "not_enough_interview_pool" }); return true; }
    if (dT > 0 && dT > poolT) { res.status(400).json({ ok: false, error: "not_enough_training_pool" }); return true; }

    const updatedPoolI = Math.max(0, poolI - dI);
    const updatedPoolT = Math.max(0, poolT - dT);
    limitsJson.interviews = updatedPoolI;
    limitsJson.trainings = updatedPoolT;

    await db.run("UPDATE employers SET interview_credits = ?, training_credits = ?, limits_json = ?, updated_at = NOW() WHERE id = ?", [
      updatedPoolI,
      updatedPoolT,
      JSON.stringify(limitsJson),
      emp.id,
    ]);
    await db.run("UPDATE projects SET interview_limit = ?, max_interviews = ?, training_limit = ?, max_trainings = ?, updated_at = NOW() WHERE id = ?", [
      nextILim,
      nextILim,
      nextTLim,
      nextTLim,
      proj.id,
    ]);
    try {
      const { checkEmployerLowGeneralLimits, checkVacancyLowLimits } = await import(
        "../services/notifications/lowBalanceNotifier"
      );
      await checkEmployerLowGeneralLimits(db, emp.id, poolI + poolT);
      await checkVacancyLowLimits(db, proj.id, emp.id);
    } catch {}
    res.json({ ok: true, interviewPool: updatedPoolI, trainingPool: updatedPoolT });
    return true;
  }

  if (method === "job_title_get_interview_template" || method === "job_title_get_templates") {
    const { _title } = body;
    const targetTitle = String(_title || "").trim().toLowerCase();
    let row = await db.get("SELECT * FROM job_titles WHERE title = ? LIMIT 1", [String(_title || "").trim()]);
    if (!row && targetTitle) {
      const allRows = await db.all("SELECT * FROM job_titles");
      row = (allRows || []).find((r: any) => String(r.title || "").trim().toLowerCase() === targetTitle);
    }
    let tpl: any = {};
    try {
      const rawTpl = row?.interview_template || row?.interview_template_json;
      if (rawTpl && String(rawTpl).trim().startsWith("{")) tpl = JSON.parse(rawTpl);
    } catch {}
    res.json({ ok: true, template: tpl, data: tpl });
    return true;
  }

  if (method === "job_title_save_templates" || method === "accept_offer") {
    res.json({ ok: true });
    return true;
  }

  if (method === "project_limit_status" || method === "can_start_interview") {
    const { _project, _candidate, _kind = "interview" } = body;
    const cleanCandId = String(_candidate || "").replace(/^candidate_?/i, "").replace(/^cand_?/i, "").trim();
    const cand = _candidate
      ? await db.get("SELECT * FROM candidates WHERE id = ? OR CAST(public_id AS TEXT) = ? OR id = ? OR CAST(public_id AS TEXT) = ? LIMIT 1", [
          _candidate,
          String(_candidate),
          cleanCandId,
          cleanCandId,
        ])
      : null;
    const targetProjKey = _project || cand?.project_id;
    const proj = targetProjKey
      ? await db.get("SELECT * FROM projects WHERE id = ? OR CAST(public_id AS TEXT) = ? OR slug = ? LIMIT 1", [
          targetProjKey,
          String(targetProjKey),
          targetProjKey,
        ])
      : null;
    const { resolveVacancyResponsibleEmployers, formatResponsibleContacts } = await import(
      "../services/notifications/vacancyResponsiblesResolver"
    );
    const resolvedResponsibles = proj ? await resolveVacancyResponsibleEmployers(db, proj) : [];
    const emp = resolvedResponsibles[0]?.empRow || (await db.get("SELECT * FROM employers LIMIT 1"));
    const { primary, list: contactsList } = formatResponsibleContacts(
      resolvedResponsibles,
      proj?.company_name || emp?.company_name || "Компания"
    );

    const hasPassedScreening = Boolean(
      cand?.interview_charged_at ||
        (cand?.resume_score != null && Number(cand?.resume_score) > 0) ||
        (cand?.score != null && Number(cand?.score) > 0) ||
        cand?.resume_ai_feedback ||
        cand?.checklist_score != null ||
        cand?.situations_score != null ||
        ["screening", "checklist", "situations", "interview_success", "interview_reject", "professional", "product", "systems", "certified"].includes(cand?.crm_stage || "") ||
        ["checklist", "situations", "interview_success", "interview_reject", "training", "certified"].includes(cand?.stage || "") ||
        ["checklist", "situations", "interview_success", "interview_reject", "training", "certified"].includes(cand?.current_stage || "")
    );
    const alreadyCharged = Boolean(_kind === "training" ? cand?.training_charged_at : hasPassedScreening);
    let hasCapacity = true;
    if (proj && !alreadyCharged) {
      if (_kind === "training") {
        const tLimit = Number(proj.training_limit ?? proj.max_trainings ?? 0);
        if (tLimit > 0 && Number(proj.training_used ?? 0) >= tLimit) hasCapacity = false;
      } else {
        const iLimit = Number(proj.interview_limit ?? proj.max_interviews ?? 0);
        if (iLimit > 0 && Number(proj.interview_used ?? 0) >= iLimit) hasCapacity = false;
      }
    }

    const empContacts = {
      name: primary.name || emp?.name || emp?.contact_name || "Работодатель",
      companyName: emp?.company_name || proj?.company_name || "Компания",
      phone: primary.phone || emp?.phone || emp?.contact_phone || "",
      email: primary.email || emp?.email || emp?.contact_email || "",
      telegram: primary.telegram || "",
      contacts: contactsList,
    };

    if (method === "can_start_interview") {
      const ok = alreadyCharged || hasCapacity;
      res.json({ data: { ok, reason: ok ? "ok" : "no_funds", employer_contacts: empContacts }, error: null });
      return true;
    }
    res.json({ data: { has_capacity: alreadyCharged || hasCapacity, already_charged: alreadyCharged, employer: empContacts }, error: null });
    return true;
  }

  if (method === "charge_project_limit") {
    const { _project, _candidate, _kind = "interview" } = body;
    const cand = _candidate
      ? await db.get("SELECT * FROM candidates WHERE id = ? OR CAST(public_id AS TEXT) = ? LIMIT 1", [_candidate, String(_candidate)])
      : null;
    const pId = _project || cand?.project_id;
    const proj = pId ? await db.get("SELECT * FROM projects WHERE id = ? OR CAST(public_id AS TEXT) = ? LIMIT 1", [pId, String(pId)]) : null;

    if (_kind === "training" && cand && !cand.training_charged_at && proj) {
      await db.run("UPDATE projects SET training_used = COALESCE(training_used, 0) + 1, updated_at = NOW() WHERE id = ?", [proj.id]);
      await db.run("UPDATE candidates SET training_charged_at = NOW() WHERE id = ?", [cand.id]);
      try {
        const { checkVacancyLowLimits } = await import("../services/notifications/lowBalanceNotifier");
        await checkVacancyLowLimits(db, proj.id);
      } catch {}
      res.json({ data: { ok: true, charged: true }, error: null });
      return true;
    } else if (_kind !== "training" && cand && !cand.interview_charged_at && proj) {
      await db.run("UPDATE projects SET interview_used = COALESCE(interview_used, 0) + 1, updated_at = NOW() WHERE id = ?", [proj.id]);
      await db.run("UPDATE candidates SET interview_charged_at = NOW() WHERE id = ?", [cand.id]);
      try {
        const { checkVacancyLowLimits } = await import("../services/notifications/lowBalanceNotifier");
        await checkVacancyLowLimits(db, proj.id);
      } catch {}
      res.json({ data: { ok: true, charged: true }, error: null });
      return true;
    }
    res.json({ data: { ok: true, charged: false, already_charged: true }, error: null });
    return true;
  }

  return false;
}
