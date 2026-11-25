import { Request, Response } from "express";
import { PgDBWrapper, recalculateEmployerBalances } from "../db";
import { notifyLimitChangesToTelegram } from "../telegram";
import { employerSessions, genId } from "../routes/auth/helpers";
import { isAuthorizedAdminOrSysAdmin, isAuthorizedSuperAdmin } from "../routes/admin/authAndTelegram";
import { handleAdminPaginationRpc } from "./adminPaginationRpc";

export const ALLOWED_LIMIT_COLS = new Set([
  "interview_credits",
  "training_credits",
  "landing_credits",
  "interview_setup_credits",
  "training_setup_credits",
]);

export const LIMIT_KEY_MAP: Record<string, { col: string; label: string }> = {
  interviews: { col: "interview_credits", label: "Интервью" },
  interview_credits: { col: "interview_credits", label: "Интервью" },
  trainings: { col: "training_credits", label: "Обучения" },
  training_credits: { col: "training_credits", label: "Обучения" },
  landings: { col: "landing_credits", label: "Вакансии (лендинги)" },
  landing_credits: { col: "landing_credits", label: "Вакансии (лендинги)" },
  vacancies: { col: "landing_credits", label: "Вакансии (лендинги)" },
  interviewSystems: { col: "interview_setup_credits", label: "Системы найма" },
  interview_setup_credits: { col: "interview_setup_credits", label: "Системы найма" },
  interview_systems: { col: "interview_setup_credits", label: "Системы найма" },
  trainingSystems: { col: "training_setup_credits", label: "Системы обучения" },
  training_setup_credits: { col: "training_setup_credits", label: "Системы обучения" },
  training_systems: { col: "training_setup_credits", label: "Системы обучения" },
};

export async function handleEmployerReferralAndLimitsRpc(
  db: PgDBWrapper,
  method: string,
  req: Request,
  body: any,
  res: Response
): Promise<boolean> {
  if (method === "get_my_referrer") {
    const authHeader = req.headers.authorization || (req.headers["x-employer-token"] as string);
    const token = authHeader ? authHeader.replace("Bearer ", "").trim() : "";
    const currentEmp = token ? employerSessions[token] : null;
    const requestedId =
      body?._public_id || body?._employer_id || body?.public_id || body?.employer_id || currentEmp?.id || currentEmp?.public_id;
    if (!requestedId) {
      res.json(null);
      return true;
    }

    const cleanPublic = String(requestedId).replace(/^emp/, "");
    const targetEmp = await db.get(
      "SELECT * FROM employers WHERE id = ? OR CAST(public_id AS TEXT) = ? OR CAST(public_id AS TEXT) = ? OR id = ?",
      [requestedId, String(requestedId), cleanPublic, `emp${cleanPublic}`]
    );
    const empId = targetEmp?.id || requestedId;
    const empPub = String(targetEmp?.public_id || cleanPublic);
    const refRow = await db.get(
      "SELECT * FROM referrals_emp WHERE referred_employer_id = ? OR referred_employer_id = ? OR CAST(referred_public_id AS TEXT) = ? OR CAST(referred_public_id AS TEXT) = ?",
      [empId, empPub, cleanPublic, `emp${cleanPublic}`]
    );
    const referrerId = refRow?.referrer_employer_id || refRow?.referrer_public_id || targetEmp?.referrer_id;
    if (referrerId) {
      const cleanRef = String(referrerId).replace(/^emp/, "");
      const refEmp = await db.get(
        "SELECT * FROM employers WHERE id = ? OR CAST(public_id AS TEXT) = ? OR CAST(public_id AS TEXT) = ? OR id = ?",
        [String(referrerId), String(referrerId), cleanRef, `emp${cleanRef}`]
      );
      if (refEmp) {
        res.json({
          public_id: refEmp.public_id || refEmp.id,
          name: refEmp.name || refEmp.contact_name || "—",
          email: refEmp.email || refEmp.contact_email || "—",
          contact_phone: refEmp.phone || refEmp.contact_phone || null,
          contact_telegram: refEmp.contact_telegram || refEmp.telegram_username || null,
        });
        return true;
      }
    }
    res.json(null);
    return true;
  }

  if (method === "get_my_referees") {
    const authHeader = req.headers.authorization || (req.headers["x-employer-token"] as string);
    const token = authHeader ? authHeader.replace("Bearer ", "").trim() : "";
    const currentEmp = token ? employerSessions[token] : null;
    const requestedId =
      body?._public_id || body?._employer_id || body?.public_id || body?.employer_id || currentEmp?.id || currentEmp?.public_id;
    if (!requestedId) {
      res.json([]);
      return true;
    }

    const cleanPublic = String(requestedId).replace(/^emp/, "");
    const targetEmp = await db.get(
      "SELECT * FROM employers WHERE id = ? OR CAST(public_id AS TEXT) = ? OR CAST(public_id AS TEXT) = ? OR id = ?",
      [requestedId, String(requestedId), cleanPublic, `emp${cleanPublic}`]
    );
    const empId = targetEmp?.id || requestedId;
    const empPub = String(targetEmp?.public_id || cleanPublic);
    const refereeRows = await db.all(
      `SELECT DISTINCT e.public_id, e.id, e.name, e.contact_name, e.email, e.contact_email, COALESCE(r.created_at, e.created_at) as created_at, COALESCE(r.bonus_units, 1000) as bonus_rr
       FROM employers e
       LEFT JOIN referrals_emp r ON (r.referred_employer_id = e.id OR r.referred_employer_id = CAST(e.public_id AS TEXT) OR CAST(r.referred_public_id AS TEXT) = CAST(e.public_id AS TEXT) OR CAST(r.referred_public_id AS TEXT) = e.id)
       WHERE r.referrer_employer_id = ? OR r.referrer_employer_id = ? OR CAST(r.referrer_public_id AS TEXT) = ? OR CAST(r.referrer_public_id AS TEXT) = ? OR CAST(e.referrer_id AS TEXT) = ? OR CAST(e.referrer_id AS TEXT) = ? OR CAST(e.referrer_id AS TEXT) = ? OR CAST(e.referrer_id AS TEXT) = ?
       ORDER BY created_at DESC`,
      [empId, empPub, cleanPublic, `emp${cleanPublic}`, empId, empPub, cleanPublic, `emp${cleanPublic}`]
    );
    res.json(
      (refereeRows || []).map((r: any) => ({
        public_id: r.public_id || r.id,
        name: r.name || r.contact_name || "—",
        email: r.email || r.contact_email || "—",
        created_at: r.created_at,
        bonus_rr: Number(r.bonus_rr || 1000),
      }))
    );
    return true;
  }

  if (method === "admin_list_employers") {
    if (!(await isAuthorizedAdminOrSysAdmin(req))) {
      res.status(401).json({ data: null, error: "Требуется авторизация администратора" });
      return true;
    }
    const targetEmpId = String(body?._id ?? body?.id ?? "").trim();
    if (targetEmpId) {
      const cleanPid = targetEmpId.replace(/^emp-?/i, "");
      const empRow = await db.get(
        `SELECT e.id, e.public_id, e.user_id, e.name, e.contact_name, e.email, e.contact_email, e.company_name,
                e.phone, e.contact_phone, e.telegram_username, e.contact_telegram, e.role, e.status, e.balance,
                e.balance_start, e.balance_pay, e.balance_referral, e.balance_admin, e.balance_limits,
                e.landing_credits, e.interview_setup_credits, e.training_setup_credits, e.interview_credits, e.training_credits,
                e.created_at, e.updated_at,
                (
                  COALESCE(e.balance_pay, 0) > 0
                  OR EXISTS (
                    SELECT 1 FROM wallets w JOIN transactions t ON t.wallet_id = w.id
                    WHERE (w.employer_id = e.id OR (e.public_id IS NOT NULL AND w.employer_id = CAST(e.public_id AS TEXT)))
                      AND LOWER(COALESCE(t.type, '')) = 'pay' AND COALESCE(t.amount_rr, 0) > 0
                  )
                ) AS has_topup,
                (SELECT COUNT(DISTINCT c.id)::int FROM companies c WHERE c.owner_employer_id = e.id OR c.employer_id = e.id OR (e.public_id IS NOT NULL AND (c.owner_employer_id = CAST(e.public_id AS TEXT) OR c.employer_id = CAST(e.public_id AS TEXT)))) AS companies_count,
                (SELECT COUNT(DISTINCT p.id)::int FROM projects p WHERE p.employer_id = e.id OR (e.public_id IS NOT NULL AND (p.employer_id = CAST(e.public_id AS TEXT) OR CAST(p.employer_public_id AS TEXT) = CAST(e.public_id AS TEXT)))) AS projects_count,
                (SELECT COUNT(DISTINCT ca.id)::int FROM candidates ca JOIN projects p ON (ca.project_id = p.id OR (p.public_id IS NOT NULL AND ca.project_id = CAST(p.public_id AS TEXT))) WHERE p.employer_id = e.id OR (e.public_id IS NOT NULL AND (p.employer_id = CAST(e.public_id AS TEXT) OR CAST(p.employer_public_id AS TEXT) = CAST(e.public_id AS TEXT)))) AS candidates_count
         FROM employers e
         WHERE e.id = ? OR CAST(e.public_id AS TEXT) = ? OR e.id = ? OR CAST(e.public_id AS TEXT) = ?
         LIMIT 1`,
        [targetEmpId, targetEmpId, `emp-${cleanPid}`, cleanPid]
      );
      res.json({ data: empRow ? [empRow] : [], error: null });
      return true;
    }

    if (body?._paginated) {
      return await handleAdminPaginationRpc(db, "admin_list_employers_page", req, body, res);
    }

    const employers = await db.all(
      `SELECT id, public_id, user_id, name, contact_name, email, contact_email, company_name, phone, contact_phone,
              telegram_username, contact_telegram, role, status, balance, balance_start, balance_pay,
              balance_referral, balance_admin, balance_limits, landing_credits, interview_setup_credits,
              training_setup_credits, interview_credits, training_credits, created_at, updated_at
       FROM employers ORDER BY created_at DESC NULLS LAST`
    );
    res.json({ data: employers || [], error: null });
    return true;
  }

  if (method === "admin_list_users") {
    if (!(await isAuthorizedAdminOrSysAdmin(req))) {
      res.status(401).json({ data: null, error: "Требуется авторизация администратора" });
      return true;
    }
    if (!(await isAuthorizedSuperAdmin(req))) {
      res.status(403).json({ data: null, error: "Управление ролями доступно только супер-администраторам" });
      return true;
    }

    if (body?._paginated) {
      const rawLimit = Number(body?._limit ?? body?.limit ?? 20);
      const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(100, Math.floor(rawLimit)) : 20;
      const rawOffset = Number(body?._offset ?? body?.offset ?? 0);
      const offset = Number.isFinite(rawOffset) && rawOffset >= 0 ? Math.floor(rawOffset) : 0;
      const search = String(body?._search ?? body?.search ?? "").trim();

      const whereParts: string[] = [];
      const params: any[] = [];
      if (search) {
        const like = `%${search}%`;
        whereParts.push(
          `(COALESCE(email, '') ILIKE ? OR COALESCE(contact_email, '') ILIKE ? OR COALESCE(name, '') ILIKE ? OR COALESCE(contact_name, '') ILIKE ? OR COALESCE(company_name, '') ILIKE ? OR COALESCE(CAST(public_id AS TEXT), '') ILIKE ?)`
        );
        params.push(like, like, like, like, like, like);
      }
      const whereSql = whereParts.length > 0 ? `WHERE ${whereParts.join(" AND ")}` : "";

      const [cntRow, employers] = await Promise.all([
        db.get(`SELECT COUNT(*)::int AS cnt FROM employers ${whereSql}`, params),
        db.all(
          `SELECT id, public_id, name, contact_name, company_name, email, contact_email, role, created_at
           FROM employers ${whereSql} ORDER BY created_at DESC NULLS LAST LIMIT ? OFFSET ?`,
          [...params, limit, offset]
        ),
      ]);

      const total = Number(cntRow?.cnt || 0);
      const formatted = (employers || []).map((e: any) => {
        const r = String(e.role || "employer").trim().toLowerCase() || "employer";
        return {
          user_id: e.id,
          id: e.id,
          public_id: e.public_id,
          display_name: e.name || e.contact_name || e.company_name || "—",
          email: e.email || e.contact_email || "",
          role: r,
          roles: [r],
          created_at: e.created_at,
        };
      });
      res.json({
        data: {
          items: formatted,
          total,
          hasMore: offset + formatted.length < total,
        },
        error: null,
      });
      return true;
    }

    const employers = await db.all(
      `SELECT id, public_id, name, contact_name, company_name, email, contact_email, role, created_at
       FROM employers ORDER BY created_at DESC`
    );
    const formatted = (employers || []).map((e: any) => {
      const r = String(e.role || "employer").trim().toLowerCase() || "employer";
      return {
        user_id: e.id,
        id: e.id,
        public_id: e.public_id,
        display_name: e.name || e.contact_name || e.company_name || "—",
        email: e.email || e.contact_email || "",
        role: r,
        roles: [r],
        created_at: e.created_at,
      };
    });
    res.json({ data: formatted, error: null });
    return true;
  }

  if (method === "admin_set_role") {
    if (!(await isAuthorizedAdminOrSysAdmin(req))) {
      res.status(401).json({ data: null, error: "Требуется авторизация администратора" });
      return true;
    }
    if (!(await isAuthorizedSuperAdmin(req))) {
      res.status(403).json({ data: null, error: "Изменение ролей доступно только супер-администраторам" });
      return true;
    }
    const { _user, _role, _enabled } = body;
    const targetId = String(_user || "").trim();
    const roleNorm = String(_role || "").trim().toLowerCase();
    const ALLOWED_ROLES = new Set(["super_admin", "admin", "moderator", "employer", "candidate"]);
    if (!targetId || !ALLOWED_ROLES.has(roleNorm)) {
      res.status(400).json({ data: null, error: "Некорректный пользователь или роль" });
      return true;
    }
    const nextRole = _enabled === false ? "employer" : roleNorm;
    await db.run(
      "UPDATE employers SET role = ?, updated_at = NOW() WHERE id = ? OR CAST(public_id AS TEXT) = ?",
      [nextRole, targetId, targetId]
    );
    res.json({ data: { ok: true, user_id: targetId, role: nextRole }, error: null });
    return true;
  }

  if (method === "admin_employer_set_limit") {
    if (!(await isAuthorizedAdminOrSysAdmin(req))) {
      res.status(401).json({ success: false, data: null, error: "Требуется авторизация администратора" });
      return true;
    }
    const { _employer, _key, _field, field, key, _value, value, _note, note } = body;
    const empIdRaw = String(_employer || body?.employer_id || body?.id || "").trim();
    const cleanPid = empIdRaw.replace(/^emp-?/, "");
    const emp = await db.get(
      "SELECT * FROM employers WHERE id = ? OR CAST(public_id AS TEXT) = ? OR id = ? OR CAST(public_id AS TEXT) = ? OR email = ?",
      [empIdRaw, empIdRaw, `emp-${cleanPid}`, cleanPid, empIdRaw]
    );
    if (!emp) {
      res.json({ success: false, data: null, error: "Работодатель не найден" });
      return true;
    }

    let limits: Record<string, any> = {};
    try { limits = JSON.parse(emp.limits_json || "{}"); } catch {}
    const rawKey = String(_field || _key || field || key || "");
    const target = LIMIT_KEY_MAP[rawKey];
    if (!target || !ALLOWED_LIMIT_COLS.has(target.col)) {
      res.status(400).json({ success: false, data: null, error: `Неизвестное поле лимита: ${rawKey}` });
      return true;
    }
    const valNum = Math.max(0, Math.floor(Number(_value ?? value ?? 0)));
    const oldVal = Number((emp as any)[target.col] ?? limits[rawKey] ?? 0);
    limits[rawKey] = valNum;
    limits[target.col] = valNum;

    await db.run(`UPDATE employers SET ${target.col} = ?, limits_json = ?, updated_at = NOW() WHERE id = ?`, [
      valNum,
      JSON.stringify(limits),
      emp.id,
    ]);

    let wallet = await db.get("SELECT * FROM wallets WHERE employer_id = ?", [emp.id]);
    if (!wallet) {
      const walletId = genId("wall");
      await db.run("INSERT INTO wallets (id, employer_id, units_balance) VALUES (?, ?, ?)", [walletId, emp.id, Number(emp.balance || 0)]);
      wallet = { id: walletId };
    }

    const noteStr = _note || note || "Корректировка лимита администратором";
    const delta = valNum - oldVal;
    const desc = `Корректировка лимита «${target.label}»: ${oldVal} → ${valNum} (${delta >= 0 ? "+" : ""}${delta})`;
    await db.run(
      `INSERT INTO transactions (id, wallet_id, amount_rr, amount_limits, type_limits, type, type_balance, description, note, ref_table, ref_id, created_at)
       VALUES (?, ?, 0, ?, ?, 'limit_adjustment', 'limits', ?, ?, 'employers', ?, NOW())`,
      [genId("tx"), wallet.id, delta, target.col, desc, noteStr, emp.id]
    );

    const updatedEmp = await db.get("SELECT * FROM employers WHERE id = ?", [emp.id]);
    const changes = [{ field: target.col, label: target.label, from: oldVal, to: valNum, delta }];
    await notifyLimitChangesToTelegram(db, updatedEmp, changes, noteStr);
    try {
      const { checkEmployerLowGeneralLimits } = await import("../services/notifications/lowBalanceNotifier");
      await checkEmployerLowGeneralLimits(db, emp.id);
    } catch {}
    res.json({ success: true, data: { ok: true, oldVal, newVal: valNum, employer: updatedEmp, changes }, error: null });
    return true;
  }

  if (method === "admin_employer_set_limits") {
    if (!(await isAuthorizedAdminOrSysAdmin(req))) {
      res.status(401).json({ success: false, data: null, error: "Требуется авторизация администратора" });
      return true;
    }
    const { _employer, _limits, _deltas, _note, note } = body;
    const empIdRaw = String(_employer || body?.employer_id || body?.id || "").trim();
    const cleanPid = empIdRaw.replace(/^emp-?/, "");
    const emp = await db.get(
      "SELECT * FROM employers WHERE id = ? OR CAST(public_id AS TEXT) = ? OR id = ? OR CAST(public_id AS TEXT) = ? OR email = ?",
      [empIdRaw, empIdRaw, `emp-${cleanPid}`, cleanPid, empIdRaw]
    );
    if (!emp) {
      res.json({ success: false, data: null, error: "Работодатель не найден" });
      return true;
    }

    let wallet = await db.get("SELECT * FROM wallets WHERE employer_id = ?", [emp.id]);
    if (!wallet) {
      const walletId = genId("wall");
      await db.run("INSERT INTO wallets (id, employer_id, units_balance) VALUES (?, ?, ?)", [walletId, emp.id, Number(emp.balance || 0)]);
      wallet = { id: walletId };
    }

    let limits: Record<string, any> = {};
    try { limits = JSON.parse(emp.limits_json || "{}"); } catch {}
    const changes: Array<{ field: string; label: string; from: number; to: number; delta: number }> = [];
    const fieldsToProcess: Record<string, { finalVal: number; delta: number }> = {};

    if (_deltas && typeof _deltas === "object") {
      for (const [f, d] of Object.entries(_deltas)) {
        const deltaNum = Number(d) || 0;
        const target = LIMIT_KEY_MAP[f];
        if (deltaNum !== 0 && target && ALLOWED_LIMIT_COLS.has(target.col)) {
          const curVal = Number((emp as any)[target.col] ?? limits[f] ?? 0);
          const finalVal = Math.max(0, curVal + deltaNum);
          fieldsToProcess[target.col] = { finalVal, delta: finalVal - curVal };
        }
      }
    } else if (_limits && typeof _limits === "object") {
      for (const [f, v] of Object.entries(_limits)) {
        const target = LIMIT_KEY_MAP[f];
        if (target && ALLOWED_LIMIT_COLS.has(target.col)) {
          const curVal = Number((emp as any)[target.col] ?? limits[f] ?? 0);
          const finalVal = Math.max(0, Math.floor(Number(v) || 0));
          if (finalVal !== curVal) fieldsToProcess[target.col] = { finalVal, delta: finalVal - curVal };
        }
      }
    }

    const noteStr = _note || note || "Пакетная корректировка лимитов администратором";
    for (const [col, info] of Object.entries(fieldsToProcess)) {
      if (!ALLOWED_LIMIT_COLS.has(col)) continue;
      const curVal = Number((emp as any)[col] ?? 0);
      const target = LIMIT_KEY_MAP[col] || { col, label: col };
      limits[col] = info.finalVal;
      await db.run(`UPDATE employers SET ${col} = ?, limits_json = ?, updated_at = NOW() WHERE id = ?`, [
        info.finalVal,
        JSON.stringify(limits),
        emp.id,
      ]);
      const desc = `Корректировка лимита «${target.label}»: ${curVal} → ${info.finalVal} (${info.delta >= 0 ? "+" : ""}${info.delta})`;
      await db.run(
        `INSERT INTO transactions (id, wallet_id, amount_rr, amount_limits, type_limits, type, type_balance, description, note, ref_table, ref_id, created_at)
         VALUES (?, ?, 0, ?, ?, 'limit_adjustment', 'limits', ?, ?, 'employers', ?, NOW())`,
        [genId("tx"), wallet.id, info.delta, target.col, desc, noteStr, emp.id]
      );
      changes.push({ field: target.col, label: target.label, from: curVal, to: info.finalVal, delta: info.delta });
    }

    const updatedEmp = await db.get("SELECT * FROM employers WHERE id = ?", [emp.id]);
    if (changes.length > 0) await notifyLimitChangesToTelegram(db, updatedEmp, changes, noteStr);
    try {
      const { checkEmployerLowGeneralLimits } = await import("../services/notifications/lowBalanceNotifier");
      await checkEmployerLowGeneralLimits(db, emp.id);
    } catch {}
    res.json({ success: true, data: { ok: true, employer: updatedEmp, changes }, error: null });
    return true;
  }

  if (method === "admin_wallet_adjust") {
    if (!(await isAuthorizedAdminOrSysAdmin(req))) {
      res.status(401).json({ success: false, data: null, error: "Требуется авторизация администратора" });
      return true;
    }
    const { _employer, _delta, delta, note, _note, type, _type } = body;
    const empIdRaw = String(_employer || body?.employer_id || body?.id || "").trim();
    const cleanPid = empIdRaw.replace(/^emp-?/, "");
    const emp = await db.get(
      "SELECT * FROM employers WHERE id = ? OR CAST(public_id AS TEXT) = ? OR id = ? OR CAST(public_id AS TEXT) = ?",
      [empIdRaw, empIdRaw, `emp-${cleanPid}`, cleanPid]
    );
    if (!emp) {
      res.json({ success: false, data: null, error: "Работодатель не найден" });
      return true;
    }

    const noteStr = _note || note || "Корректировка администратором";
    const deltaNum = Number(_delta ?? delta ?? 0);
    const balanceType = (_type || type || "admin").toLowerCase();

    let wallet = await db.get("SELECT * FROM wallets WHERE employer_id = ?", [emp.id]);
    if (!wallet) {
      const walletId = genId("wall");
      await db.run("INSERT INTO wallets (id, employer_id, units_balance) VALUES (?, ?, ?)", [walletId, emp.id, Number(emp.balance || 0)]);
      wallet = { id: walletId };
    }

    await db.run(
      `INSERT INTO transactions (id, wallet_id, amount_rr, type, type_balance, description, note, ref_table, ref_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'employers', ?, NOW())`,
      [genId("tx"), wallet.id, deltaNum, balanceType, balanceType, noteStr, noteStr, emp.id]
    );
    await recalculateEmployerBalances(db, emp.id);
    const updatedEmp = await db.get("SELECT * FROM employers WHERE id = ?", [emp.id]);
    if (deltaNum < 0) {
      try {
        const { checkEmployerLowBalanceRR } = await import("../services/notifications/lowBalanceNotifier");
        await checkEmployerLowBalanceRR(db, emp.id, Number(emp.balance || 0));
      } catch {}
    }
    res.json({ success: true, data: { ok: true, balance: updatedEmp?.balance, employer: updatedEmp }, error: null, new_balance: updatedEmp?.balance });
    return true;
  }

  if (method === "purchase_fixed") {
    const { _item, _qty = 1, _public_id, _employer_id } = body;
    const authHeader = req.headers.authorization || (req.headers["x-employer-token"] as string);
    const token = authHeader ? authHeader.replace("Bearer ", "").trim() : "";
    const currentEmp = token ? employerSessions[token] : null;
    const requestedId = _public_id || _employer_id || body?.public_id || body?.employer_id || currentEmp?.id || currentEmp?.public_id;
    const cleanPublic = String(requestedId || "").replace(/^emp/, "");
    const emp = await db.get("SELECT * FROM employers WHERE id = ? OR CAST(public_id AS TEXT) = ? OR CAST(public_id AS TEXT) = ? OR id = ?", [
      requestedId,
      String(requestedId),
      cleanPublic,
      `emp${cleanPublic}`,
    ]);
    if (!emp) {
      res.json({ data: null, error: "no_employer" });
      return true;
    }

    const qty = Math.max(1, Math.floor(Number(_qty) || 1));
    const prices: Record<string, { price: number; col: string; name: string }> = {
      landing: { price: 500, col: "landing_credits", name: "ИИ-Лендинг вакансии" },
      landings: { price: 500, col: "landing_credits", name: "ИИ-Лендинг вакансии" },
      interview_setup: { price: 200, col: "interview_setup_credits", name: "ИИ-Система интервью" },
      interviewSystems: { price: 200, col: "interview_setup_credits", name: "ИИ-Система интервью" },
      training_setup: { price: 300, col: "training_setup_credits", name: "ИИ-Система обучения" },
      trainingSystems: { price: 300, col: "training_setup_credits", name: "ИИ-Система обучения" },
    };
    const itemInfo = prices[_item];
    if (!itemInfo || !ALLOWED_LIMIT_COLS.has(itemInfo.col)) {
      res.json({ data: null, error: "bad_item" });
      return true;
    }

    const totalCost = itemInfo.price * qty;
    const currentBal = Number(emp.balance || 0);
    if (currentBal < totalCost) {
      res.json({ data: null, error: "insufficient_funds" });
      return true;
    }

    const newBal = currentBal - totalCost;
    const newCredits = Number(emp[itemInfo.col] || 0) + qty;
    let limits: Record<string, any> = {};
    try { limits = JSON.parse(emp.limits_json || "{}"); } catch {}
    limits[itemInfo.col] = newCredits;

    await db.run(`UPDATE employers SET balance = ?, ${itemInfo.col} = ?, limits_json = ? WHERE id = ?`, [
      newBal,
      newCredits,
      JSON.stringify(limits),
      emp.id,
    ]);

    let wallet = await db.get("SELECT * FROM wallets WHERE employer_id = ?", [emp.id]);
    if (wallet) await db.run("UPDATE wallets SET units_balance = ?, updated_at = NOW() WHERE id = ?", [newBal, wallet.id]);
    else {
      const walletId = genId("wall");
      await db.run("INSERT INTO wallets (id, employer_id, units_balance) VALUES (?, ?, ?)", [walletId, emp.id, newBal]);
      wallet = { id: walletId };
    }

    const note = `Покупка впрок: ${itemInfo.name} ×${qty}`;
    await db.run(
      `INSERT INTO transactions (id, wallet_id, amount_rr, type, type_balance, description, note, ref_table, ref_id, created_at)
       VALUES (?, ?, ?, 'limits', 'limits', ?, ?, 'employers', ?, NOW())`,
      [genId("tx"), wallet.id, totalCost, note, note, emp.id]
    );
    await recalculateEmployerBalances(db, emp.id);
    const updatedEmp = await db.get("SELECT balance FROM employers WHERE id = ?", [emp.id]);
    try {
      const { checkEmployerLowBalanceRR } = await import("../services/notifications/lowBalanceNotifier");
      await checkEmployerLowBalanceRR(db, emp.id, currentBal);
    } catch {}
    res.json({ data: { ok: true, balance: updatedEmp?.balance ?? newBal, limits }, error: null });
    return true;
  }

  if (method === "purchase_pack" || method === "purchase_pack_mixed") {
    const { _kind, _qty = 1, _qty_int = 0, _qty_train = 0, _public_id, _employer_id } = body;
    const authHeader = req.headers.authorization || (req.headers["x-employer-token"] as string);
    const token = authHeader ? authHeader.replace("Bearer ", "").trim() : "";
    const currentEmp = token ? employerSessions[token] : null;
    const requestedId = _public_id || _employer_id || body?.public_id || body?.employer_id || currentEmp?.id || currentEmp?.public_id;
    const cleanPublic = String(requestedId || "").replace(/^emp/, "");
    const emp = await db.get("SELECT * FROM employers WHERE id = ? OR CAST(public_id AS TEXT) = ? OR CAST(public_id AS TEXT) = ? OR id = ?", [
      requestedId,
      String(requestedId),
      cleanPublic,
      `emp${cleanPublic}`,
    ]);
    if (!emp) {
      res.json({ data: null, error: "no_employer" });
      return true;
    }

    let addInt = 0;
    let addTrain = 0;
    if (method === "purchase_pack_mixed") {
      addInt = Math.max(0, Math.floor(Number(_qty_int) || 0));
      addTrain = Math.max(0, Math.floor(Number(_qty_train) || 0));
    } else if (_kind === "interviews") addInt = Math.max(1, Math.floor(Number(_qty) || 1));
    else if (_kind === "trainings") addTrain = Math.max(1, Math.floor(Number(_qty) || 1));

    const totalQty = addInt + addTrain;
    if (totalQty <= 0) {
      res.json({ data: null, error: "bad_qty" });
      return true;
    }
    const totalCost = totalQty * 150;
    const currentBal = Number(emp.balance || 0);
    if (currentBal < totalCost) {
      res.json({ data: null, error: "insufficient_funds" });
      return true;
    }

    const newBal = currentBal - totalCost;
    const newInt = Number(emp.interview_credits || 0) + addInt;
    const newTrain = Number(emp.training_credits || 0) + addTrain;
    let limits: Record<string, any> = {};
    try { limits = JSON.parse(emp.limits_json || "{}"); } catch {}
    limits.interview_credits = newInt;
    limits.training_credits = newTrain;

    await db.run("UPDATE employers SET balance = ?, interview_credits = ?, training_credits = ?, limits_json = ? WHERE id = ?", [
      newBal,
      newInt,
      newTrain,
      JSON.stringify(limits),
      emp.id,
    ]);

    let wallet = await db.get("SELECT * FROM wallets WHERE employer_id = ?", [emp.id]);
    if (wallet) await db.run("UPDATE wallets SET units_balance = ?, updated_at = NOW() WHERE id = ?", [newBal, wallet.id]);
    else {
      const walletId = genId("wall");
      await db.run("INSERT INTO wallets (id, employer_id, units_balance) VALUES (?, ?, ?)", [walletId, emp.id, newBal]);
      wallet = { id: walletId };
    }

    const note = `Пакет: ${addInt} инт + ${addTrain} обуч × 150 RR/шт`;
    await db.run(
      `INSERT INTO transactions (id, wallet_id, amount_rr, type, type_balance, description, note, ref_table, ref_id, created_at)
       VALUES (?, ?, ?, 'limits', 'limits', ?, ?, 'employers', ?, NOW())`,
      [genId("tx"), wallet.id, totalCost, note, note, emp.id]
    );
    await recalculateEmployerBalances(db, emp.id);
    const updatedEmp = await db.get("SELECT balance FROM employers WHERE id = ?", [emp.id]);
    try {
      const { checkEmployerLowBalanceRR } = await import("../services/notifications/lowBalanceNotifier");
      await checkEmployerLowBalanceRR(db, emp.id, currentBal);
    } catch {}
    res.json({ data: { ok: true, balance: updatedEmp?.balance ?? newBal, limits }, error: null });
    return true;
  }

  if (method === "topup_rr" || method === "robokassa_create_invoice" || method === "robokassa-create") {
    const { _amount_rub, amount_rub, _public_id, _employer_id } = body;
    const amt = Number(_amount_rub || amount_rub || 0);
    const authHeader = req.headers.authorization || (req.headers["x-employer-token"] as string);
    const token = authHeader ? authHeader.replace("Bearer ", "").trim() : "";
    const currentEmp = token ? employerSessions[token] : null;
    const requestedId = _public_id || _employer_id || body?.public_id || body?.employer_id || currentEmp?.id || currentEmp?.public_id;
    const cleanPublic = String(requestedId || "").replace(/^emp/, "");
    const emp = await db.get("SELECT * FROM employers WHERE id = ? OR CAST(public_id AS TEXT) = ? OR CAST(public_id AS TEXT) = ? OR id = ?", [
      requestedId,
      String(requestedId),
      cleanPublic,
      `emp${cleanPublic}`,
    ]);
    if (!emp) {
      res.json({ data: null, error: "no_employer" });
      return true;
    }
    if (amt < 100) {
      res.json({ data: null, error: "min_100" });
      return true;
    }

    const newBal = Number(emp.balance || 0) + amt;
    await db.run("UPDATE employers SET balance = ? WHERE id = ?", [newBal, emp.id]);

    let wallet = await db.get("SELECT * FROM wallets WHERE employer_id = ?", [emp.id]);
    if (wallet) await db.run("UPDATE wallets SET units_balance = ?, updated_at = NOW() WHERE id = ?", [newBal, wallet.id]);
    else {
      const walletId = genId("wall");
      await db.run("INSERT INTO wallets (id, employer_id, units_balance) VALUES (?, ?, ?)", [walletId, emp.id, newBal]);
      wallet = { id: walletId };
    }

    const note = `Пополнение счета: ${amt} RR`;
    await db.run(
      `INSERT INTO transactions (id, wallet_id, amount_rr, type, type_balance, description, note, ref_table, ref_id, created_at)
       VALUES (?, ?, ?, 'pay', 'pay', 'Пополнение баланса (оплата)', ?, 'employers', ?, NOW())`,
      [genId("tx"), wallet.id, amt, note, emp.id]
    );
    await recalculateEmployerBalances(db, emp.id);
    const updatedEmp = await db.get("SELECT balance FROM employers WHERE id = ?", [emp.id]);
    res.json({ data: { ok: true, balance: updatedEmp?.balance ?? newBal }, error: null });
    return true;
  }

  return false;
}
