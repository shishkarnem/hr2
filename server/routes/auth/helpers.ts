import crypto from "crypto";
import nodemailer from "nodemailer";
import { Request } from "express";
import { PgDBWrapper } from "../../db";

export const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "mail.hosting.reg.ru",
  port: Number(process.env.SMTP_PORT || 465),
  secure: true,
  auth: {
    user: process.env.SMTP_USER || "info@arenda-ropa.com",
    pass: process.env.SMTP_PASS || "eV5?rW4?fEiP5*mC",
  },
});

export const employerSessions: Record<string, any> = {};
export const revokedEmployerTokens = new Set<string>();
export const candidateSessions: Record<string, any> = {};
export const resetTokens: Record<string, { email: string; createdAt: number }> = {};
export const candidateResetTokens: Record<
  string,
  { email: string; candidateId: string; publicId: string; projectId?: string; companyId?: string; createdAt: number }
> = {};

const SESSION_SECRET =
  process.env.SESSION_SECRET || process.env.PROTALK_USER_ID || "hr-rr-protalk-session-key-v1";

export function createSignedEmployerToken(emp: { id: string; public_id?: any; email?: string }): string {
  const payloadObj = {
    id: String(emp.id),
    pid: emp.public_id ? String(emp.public_id) : "",
    em: emp.email ? String(emp.email).trim().toLowerCase() : "",
    iat: Date.now(),
  };
  const payloadB64 = Buffer.from(JSON.stringify(payloadObj), "utf8").toString("base64url");
  const sig = crypto.createHmac("sha256", SESSION_SECRET).update(payloadB64).digest("base64url");
  const token = `emp_v1.${payloadB64}.${sig}`;
  employerSessions[token] = emp;
  return token;
}

export function verifyEmployerToken(
  token: string
): { id: string; pid: string; em: string; iat: number } | null {
  if (!token || revokedEmployerTokens.has(token)) return null;
  if (!token.startsWith("emp_v1.")) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [, payloadB64, sig] = parts;
  const expectedSig = crypto.createHmac("sha256", SESSION_SECRET).update(payloadB64).digest("base64url");
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expectedSig);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const decoded = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
    if (!decoded || !decoded.id) return null;
    return decoded;
  } catch {
    return null;
  }
}

export async function resolveEmployerByToken(db: PgDBWrapper, token: string): Promise<any | null> {
  if (!token || revokedEmployerTokens.has(token)) return null;
  if (employerSessions[token]) {
    const sess = employerSessions[token];
    if (sess && sess.id) {
      const fresh = await db.get("SELECT * FROM employers WHERE id = ? LIMIT 1", [sess.id]).catch(() => null);
      if (fresh) {
        employerSessions[token] = fresh;
        return fresh;
      }
    }
    return sess;
  }
  const verified = verifyEmployerToken(token);
  if (verified) {
    const emp =
      (await db
        .get(
          "SELECT * FROM employers WHERE id = ? OR (CAST(public_id AS TEXT) = ? AND ? != '') LIMIT 1",
          [verified.id, verified.pid, verified.pid]
        )
        .catch(() => null)) ||
      (verified.em ? await findEmployerInDB(db, verified.em).catch(() => null) : null);
    if (emp) {
      employerSessions[token] = emp;
      return emp;
    }
  }
  return null;
}

export function genId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).substring(2, 10)}${Date.now().toString(36)}`;
}

export function generateEmployerPublicId(): string {
  return "100" + String(Math.floor(10000000 + Math.random() * 90000000));
}

export async function ensureEmployerPublicId(db: PgDBWrapper, emp: any): Promise<string> {
  if (emp && emp.public_id) {
    let pidStr = String(emp.public_id).trim();
    const em = (emp.email || emp.contact_email || "").trim().toLowerCase();
    if (em === "shishkarnem@gmail.com" && (pidStr === "1007" || pidStr === "10000000007")) {
      pidStr = "100007";
      try {
        await db.run("UPDATE employers SET public_id = ? WHERE id = ?", [pidStr, emp.id]);
        emp.public_id = pidStr;
      } catch {}
      return pidStr;
    }
    if (pidStr && pidStr !== "null" && pidStr !== "undefined") {
      return pidStr;
    }
  }

  if (emp && emp.legacy_public_id) {
    const legStr = String(emp.legacy_public_id).trim();
    if (legStr && legStr !== "null") {
      try {
        await db.run("UPDATE employers SET public_id = ? WHERE id = ?", [legStr, emp.id]);
        emp.public_id = legStr;
      } catch {}
      return legStr;
    }
  }

  if (emp && emp.id) {
    const match = String(emp.id).match(/^emp-(100\d+)$/);
    if (match) {
      const restored = match[1];
      try {
        await db.run("UPDATE employers SET public_id = ? WHERE id = ?", [restored, emp.id]);
        emp.public_id = restored;
      } catch {}
      return restored;
    }
  }

  const pubId = generateEmployerPublicId();
  if (emp && emp.id) {
    try {
      await db.run("UPDATE employers SET public_id = ? WHERE id = ?", [pubId, emp.id]);
      emp.public_id = pubId;
    } catch (e: any) {
      console.error("[BD ProTalk Error updating public_id]:", e.message);
    }
  }
  return pubId;
}

export async function findEmployerInDB(db: PgDBWrapper, rawEmail: string) {
  if (!rawEmail) return null;
  const emailNorm = rawEmail.trim().toLowerCase();

  let emp = await db.get(
    `SELECT * FROM employers WHERE LOWER(email) = ? OR LOWER(contact_email) = ?
     ORDER BY
       CASE WHEN password_hash IS NOT NULL AND password_hash != '' THEN 0 ELSE 1 END,
       CASE WHEN company_name IS NOT NULL AND company_name != '' AND company_name != 'Компания' THEN 0 ELSE 1 END,
       created_at ASC
     LIMIT 1`,
    [emailNorm, emailNorm]
  );
  if (emp) return emp;

  try {
    const withData = await db.all(
      `SELECT * FROM employers WHERE data_json IS NOT NULL AND data_json != '' ORDER BY created_at ASC LIMIT 200`
    );
    for (const row of withData || []) {
      try {
        const d = typeof row.data_json === "string" ? JSON.parse(row.data_json) : row.data_json;
        const candidates = [d?.email, d?.contact_email, d?.user_email].map((v) => String(v || "").trim().toLowerCase());
        if (candidates.includes(emailNorm)) return row;
      } catch {}
    }
  } catch {}

  try {
    const u = await db.get("SELECT id FROM profiles WHERE LOWER(email) = ? LIMIT 1", [emailNorm]);
    if (u) {
      emp = await db.get(
        "SELECT * FROM employers WHERE user_id = ? OR id = ? OR LOWER(email) = ? OR LOWER(contact_email) = ? LIMIT 1",
        [u.id, u.id, emailNorm, emailNorm]
      );
      if (emp) return emp;
    }
  } catch {}

  try {
    const comps = await db.all("SELECT id, employer_id, owner_employer_id, data_json FROM companies WHERE data_json IS NOT NULL LIMIT 300");
    for (const comp of comps || []) {
      try {
        const d = typeof comp.data_json === "string" ? JSON.parse(comp.data_json) : comp.data_json;
        const cEmails = [d?.email, d?.contact_email].map((v) => String(v || "").trim().toLowerCase());
        if (cEmails.includes(emailNorm)) {
          emp = await db.get("SELECT * FROM employers WHERE id = ? OR id = ? LIMIT 1", [
            comp.owner_employer_id || comp.employer_id,
            comp.employer_id,
          ]);
          if (emp) return emp;
        }
      } catch {}
    }
  } catch {}

  return null;
}

export async function resolveEmployerCreditsAndBalance(db: PgDBWrapper, emp: any) {
  const wallet = await db.get(
    "SELECT * FROM wallets WHERE employer_id = ? OR employer_id = ? LIMIT 1",
    [emp.id, String(emp.public_id || "")]
  );
  const currentBalance =
    emp.balance !== undefined && emp.balance !== null ? Number(emp.balance) : Number(wallet?.units_balance ?? 1000);

  let limitsObj: any = {};
  if (emp.limits_json) {
    try {
      limitsObj = typeof emp.limits_json === "string" ? JSON.parse(emp.limits_json) : emp.limits_json;
    } catch {}
  }

  const interview_credits =
    emp.interview_credits !== undefined && emp.interview_credits !== null
      ? Number(emp.interview_credits)
      : Number(limitsObj.interviews ?? limitsObj.interview_credits ?? 0);

  const training_credits =
    emp.training_credits !== undefined && emp.training_credits !== null
      ? Number(emp.training_credits)
      : Number(limitsObj.trainings ?? limitsObj.training_credits ?? 0);

  const landing_credits =
    emp.landing_credits !== undefined && emp.landing_credits !== null
      ? Number(emp.landing_credits)
      : Number(limitsObj.landings ?? limitsObj.landing_credits ?? 0);

  const interview_setup_credits =
    emp.interview_setup_credits !== undefined && emp.interview_setup_credits !== null
      ? Number(emp.interview_setup_credits)
      : Number(limitsObj.interviewSystems ?? limitsObj.interview_setup_credits ?? 0);

  const training_setup_credits =
    emp.training_setup_credits !== undefined && emp.training_setup_credits !== null
      ? Number(emp.training_setup_credits)
      : Number(limitsObj.trainingSystems ?? limitsObj.training_setup_credits ?? 0);

  const syncedLimits = JSON.stringify({
    interviews: interview_credits,
    trainings: training_credits,
    landings: landing_credits,
    interviewSystems: interview_setup_credits,
    trainingSystems: training_setup_credits,
  });

  if (emp.limits_json !== syncedLimits) {
    try {
      await db.run("UPDATE employers SET limits_json = ? WHERE id = ?", [syncedLimits, emp.id]);
    } catch {}
  }

  return {
    wallet,
    balance: currentBalance,
    interview_credits,
    training_credits,
    landing_credits,
    interview_setup_credits,
    training_setup_credits,
    limits_json: syncedLimits,
  };
}

export async function resolveProjectAndCompany(db: PgDBWrapper, rawProject: any, rawCompany: any) {
  let projectRow: any = null;
  let companyRow: any = null;

  if (rawProject) {
    const cleanProj = String(rawProject).trim().replace(/^vac/i, "");
    projectRow = await db.get(
      `SELECT * FROM projects WHERE id = ? OR CAST(public_id AS TEXT) = ? OR slug = ? OR legacy_slug = ? OR CAST(legacy_public_id AS TEXT) = ? LIMIT 1`,
      [rawProject, cleanProj, rawProject, rawProject, cleanProj]
    );
    if (!projectRow && cleanProj) {
      projectRow = await db.get(`SELECT * FROM projects WHERE CAST(public_id AS TEXT) = ? OR slug = ? LIMIT 1`, [
        cleanProj,
        cleanProj,
      ]);
    }
  }

  if (rawCompany) {
    const cleanComp = String(rawCompany).trim().replace(/^com/i, "");
    companyRow = await db.get(
      `SELECT * FROM companies WHERE id = ? OR CAST(public_id AS TEXT) = ? OR slug = ? OR legacy_slug = ? OR (',' || COALESCE(allslug, '') || ',') LIKE ? LIMIT 1`,
      [rawCompany, cleanComp, rawCompany, rawCompany, `%,${rawCompany},%`]
    );
    if (!companyRow && cleanComp) {
      companyRow = await db.get(`SELECT * FROM companies WHERE CAST(public_id AS TEXT) = ? OR slug = ? LIMIT 1`, [
        cleanComp,
        cleanComp,
      ]);
    }
  }

  if (!companyRow && projectRow?.company_id) {
    companyRow = await db.get(`SELECT * FROM companies WHERE id = ? OR CAST(public_id AS TEXT) = ? LIMIT 1`, [
      projectRow.company_id,
      String(projectRow.company_id),
    ]);
  }

  if (!projectRow && companyRow) {
    projectRow = await db.get(
      `SELECT * FROM projects WHERE company_id = ? OR company_slug = ? ORDER BY created_at DESC LIMIT 1`,
      [companyRow.id, companyRow.slug]
    );
  }

  return { projectRow, companyRow };
}

export async function getUserNotifications(db: PgDBWrapper, req: Request, body: any) {
  const limit = Math.min(200, Math.max(1, Number(body._limit || req.query.limit) || 50));

  const authHeader = req.headers.authorization || (req.headers["x-employer-token"] as string) || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  const rawEmpId = (body.employer_id || body._employer_id || req.headers["x-employer-id"] || req.query.employer_id || "") as string;
  const candToken = (req.headers["x-candidate-token"] || body.candidate_token || req.query.candidate_token || "") as string;
  const rawCandId = (body.candidate_id || body._candidate_id || req.headers["x-candidate-id"] || req.query.candidate_id || "") as string;

  let cand: any = null;
  if (candToken && candidateSessions[candToken]) {
    const sess = candidateSessions[candToken];
    cand = await db.get("SELECT * FROM candidates WHERE id = ? OR CAST(public_id AS TEXT) = ?", [
      sess.id || sess.candidate_id,
      String(sess.public_id || ""),
    ]);
  }
  if (!cand && (rawCandId || candToken)) {
    const searchVal = (rawCandId || candToken).trim();
    const cleanVal = searchVal.replace(/^cand(idate)?-?/i, "");
    cand = await db.get(
      "SELECT * FROM candidates WHERE id = ? OR CAST(public_id AS TEXT) = ? OR CAST(legacy_public_id AS TEXT) = ?",
      [searchVal, cleanVal, cleanVal]
    );
  }

  let emp: any = null;
  if (!cand) {
    if (token) {
      emp = await resolveEmployerByToken(db, token);
    }
    if (!emp && rawEmpId) {
      const cleanId = String(rawEmpId).replace(/^emp-?/i, "");
      emp = await db.get("SELECT * FROM employers WHERE id = ? OR CAST(public_id AS TEXT) = ? OR user_id = ?", [
        rawEmpId,
        cleanId,
        rawEmpId,
      ]);
    }
    if (!emp && token) {
      emp = await db.get("SELECT * FROM employers WHERE id = ? OR CAST(public_id AS TEXT) = ? OR email = ?", [
        token,
        token,
        token,
      ]);
    }
  }

  const viewerId = emp ? emp.id || emp.public_id : cand ? cand.public_id || cand.id : candToken ? "candidate" : "admin";
  let readItemIds = new Set<string>();
  try {
    const readRows = viewerId ? await db.all(`SELECT item_id FROM notification_reads WHERE user_id = ?`, [String(viewerId)]) : [];
    readItemIds = new Set((readRows || []).map((r: any) => String(r.item_id)));
  } catch {}

  const items: any[] = [];
  const knownTxIds = new Set<string>();
  const notifSignatures = new Set<string>();

  if (cand) {
    const candId = String(cand.id);
    const candPubId = String(cand.public_id || cand.id);
    try {
      const notifRows = await db.all(
        `SELECT * FROM notifications WHERE (user_id = ? OR user_id = ? OR meta_json LIKE ? OR meta_json LIKE ?) ORDER BY created_at DESC LIMIT ?`,
        [candId, candPubId, `%"candidate_id":"${candPubId}"%`, `%"candidate_id":"${candId}"%`, limit]
      );
      for (const r of notifRows || []) {
        let meta: any = {};
        try { if (r.meta_json) meta = JSON.parse(r.meta_json); } catch {}
        const isRead = r.read_at != null || readItemIds.has(String(r.id));
        items.push({
          id: String(r.id),
          kind: r.kind || "candidate",
          title: r.title,
          body: r.body,
          link: r.link || null,
          read_at: isRead ? r.read_at || new Date().toISOString() : null,
          created_at: r.created_at || new Date().toISOString(),
          meta,
        });
      }
    } catch {}

    if (items.length === 0) {
      const welcomeId = `cand_welcome_${candPubId}`;
      items.push({
        id: welcomeId,
        kind: "candidate",
        title: "Добро пожаловать в личный кабинет",
        body: `Вы успешно зарегистрированы на вакансию «${cand.role_name || "Специалист"}». Ознакомьтесь с условиями работы и переходите к собеседованию.`,
        link: null,
        read_at: readItemIds.has(welcomeId) ? new Date().toISOString() : null,
        created_at: cand.created_at || new Date().toISOString(),
        meta: { candidate_id: cand.public_id },
      });
      if (cand.score != null && Number(cand.score) > 0) {
        const scoreId = `cand_score_${candPubId}`;
        items.push({
          id: scoreId,
          kind: "interview",
          title: "Результаты ИИ-собеседования",
          body: `Ваш общий результат: ${Math.round(Number(cand.score))}% баллов.`,
          link: null,
          read_at: readItemIds.has(scoreId) ? new Date().toISOString() : null,
          created_at: cand.updated_at || cand.created_at || new Date().toISOString(),
          meta: { candidate_id: cand.public_id, score: cand.score },
        });
      }
      if (cand.hire_decision) {
        const decId = `cand_decision_${candPubId}`;
        const isOffer = cand.hire_decision === "offer" || cand.hire_decision === "invited";
        items.push({
          id: decId,
          kind: "candidate",
          title: isOffer ? "Приглашение на работу" : "Статус рассмотрения кандидатуры",
          body: cand.hire_message || (isOffer ? "Работодатель утвердил вашу кандидатуру!" : "Ваша заявка рассмотрена работодателем."),
          link: null,
          read_at: readItemIds.has(decId) ? new Date().toISOString() : null,
          created_at: cand.hire_decided_at || cand.updated_at || new Date().toISOString(),
          meta: { candidate_id: cand.public_id, decision: cand.hire_decision },
        });
      }
    }
  } else if (emp) {
    const empId = String(emp.id);
    const empPubId = String(emp.public_id || emp.id);
    try {
      const notifRows = await db.all(
        `SELECT * FROM notifications WHERE (user_id = ? OR user_id = ? OR user_role = 'all' OR (user_role = 'employer' AND (user_id IS NULL OR user_id = ''))) ORDER BY created_at DESC LIMIT ?`,
        [empId, empPubId, limit]
      );
      for (const r of notifRows || []) {
        let meta: any = {};
        try { if (r.meta_json) meta = JSON.parse(r.meta_json); } catch {}
        const isRead = r.read_at != null || readItemIds.has(String(r.id));
        if (meta.transaction_id) knownTxIds.add(String(meta.transaction_id));
        const createdAtTime = new Date(r.created_at || "").getTime();
        const timeBucket = isNaN(createdAtTime) ? "0" : Math.floor(createdAtTime / 60000).toString();
        notifSignatures.add(`${r.kind || "notif"}_${r.title}_${timeBucket}`);
        items.push({
          id: String(r.id),
          kind: r.kind || "notification",
          title: r.title,
          body: r.body,
          link: r.link || null,
          read_at: isRead ? r.read_at || new Date().toISOString() : null,
          created_at: r.created_at || new Date().toISOString(),
          meta,
        });
      }
    } catch (e: any) {
      console.error("[Notifications] Error reading notifications table:", e.message);
    }

    try {
      const txRows = await db.all(
        `SELECT t.* FROM transactions t
         WHERE (t.wallet_id IN (SELECT id FROM wallets WHERE employer_id = ? OR employer_id = ?)
                OR t.ref_id = ? OR t.ref_id = ? OR t.wallet_id = ? OR t.wallet_id = ?)
         ORDER BY t.created_at DESC LIMIT ?`,
        [empId, empPubId, empId, empPubId, empId, empPubId, limit]
      );
      for (const t of txRows || []) {
        if (knownTxIds.has(String(t.id))) continue;
        const amtRR = t.amount_rr != null ? Number(t.amount_rr) : t.amount ? Number(t.amount) : 0;
        const amtLimits = t.amount_limits != null ? Number(t.amount_limits) : 0;
        const tTime = new Date(t.created_at || "").getTime();
        const timeBucket = isNaN(tTime) ? "0" : Math.floor(tTime / 60000).toString();
        if ((t.type === "limit_adjustment" || t.type_limits) && notifSignatures.has(`limits_⚡ Изменение лимитов_${timeBucket}`)) {
          continue;
        }
        let title = "Операция по счету";
        const typeKey = (t.type_balance || t.type || "").toLowerCase();
        const typeLimitsKey = (t.type_limits || "").toLowerCase();
        if (typeKey === "start") title = `Стартовый баланс (+${amtRR} RR)`;
        else if (typeKey === "referral") title = `Реферальный бонус (+${amtRR} RR)`;
        else if (["pay", "topup", "deposit"].includes(typeKey)) title = `Пополнение счета (+${amtRR} RR)`;
        else if (["admin", "admin_adjustment"].includes(typeKey)) title = `Корректировка баланса (${amtRR >= 0 ? "+" : ""}${amtRR} RR)`;
        else if (t.type === "limit_adjustment" || typeLimitsKey || t.amount_limits) title = `Изменение лимитов (${amtLimits >= 0 ? "+" : ""}${amtLimits} шт.)`;
        else if (amtRR < 0) title = `Списание (${amtRR} RR)`;
        else if (amtRR > 0) title = `Начисление (+${amtRR} RR)`;

        let bodyText = t.description || t.note || "Операция по балансу";
        if (t.note && t.description && t.note !== t.description) bodyText = `${t.description} — ${t.note}`;
        const txId = `tx_${t.id}`;
        const isRead = readItemIds.has(txId) || readItemIds.has(String(t.id));
        items.push({
          id: txId,
          kind: "transaction",
          title,
          body: bodyText,
          link: `/emp${empPubId}/tariff`,
          read_at: isRead ? new Date().toISOString() : null,
          created_at: t.created_at || new Date().toISOString(),
          meta: {
            transaction_id: t.id,
            amount_rr: amtRR,
            amount_limits: amtLimits,
            type: t.type,
            type_balance: t.type_balance,
            type_limits: t.type_limits,
            description: t.description,
            note: t.note,
            wallet_id: t.wallet_id,
          },
        });
      }
    } catch (e: any) {
      console.error("[Notifications] Error reading transactions for employer:", e.message);
    }
  } else {
    try {
      const notifRows = await db.all(`SELECT * FROM notifications ORDER BY created_at DESC LIMIT ?`, [limit]);
      for (const r of notifRows || []) {
        let meta: any = {};
        try { if (r.meta_json) meta = JSON.parse(r.meta_json); } catch {}
        if (meta.transaction_id) knownTxIds.add(String(meta.transaction_id));
        const isRead = r.read_at != null || readItemIds.has(String(r.id));
        items.push({
          id: String(r.id),
          kind: r.kind || "notification",
          title: r.title,
          body: r.body,
          link: r.link || null,
          read_at: isRead ? r.read_at || new Date().toISOString() : null,
          created_at: r.created_at || new Date().toISOString(),
          meta,
        });
      }
    } catch {}
    try {
      const txRows = await db.all(`SELECT * FROM transactions ORDER BY created_at DESC LIMIT ?`, [limit]);
      for (const t of txRows || []) {
        if (knownTxIds.has(String(t.id))) continue;
        const amtRR = t.amount_rr != null ? Number(t.amount_rr) : t.amount ? Number(t.amount) : 0;
        const txId = `tx_${t.id}`;
        const isRead = readItemIds.has(txId) || readItemIds.has(String(t.id));
        items.push({
          id: txId,
          kind: "transaction",
          title: `Транзакция: ${t.type || "баланс"} (${amtRR >= 0 ? "+" : ""}${amtRR} RR)`,
          body: t.description || t.note || "Финансовая операция",
          link: "/admin",
          read_at: isRead ? new Date().toISOString() : null,
          created_at: t.created_at || new Date().toISOString(),
          meta: { transaction_id: t.id, amount_rr: amtRR, type: t.type, note: t.note },
        });
      }
    } catch {}
  }

  const seen = new Set<string>();
  const uniqueItems: any[] = [];
  for (const it of items) {
    if (!seen.has(it.id)) {
      seen.add(it.id);
      uniqueItems.push(it);
    }
  }
  uniqueItems.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const finalItems = uniqueItems.slice(0, limit);
  const unreadCount = finalItems.filter((x) => !x.read_at).length;

  return {
    items: finalItems,
    unread: unreadCount,
    viewer: emp ? "employer" : candToken ? "candidate" : "admin",
  };
}

export async function markNotificationsRead(db: PgDBWrapper, req: Request, body: any) {
  const authHeader = req.headers.authorization || (req.headers["x-employer-token"] as string) || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  const rawEmpId = (body.employer_id || body._employer_id || req.headers["x-employer-id"] || "") as string;
  const candToken = (req.headers["x-candidate-token"] || body.candidate_token || req.query.candidate_token || "") as string;
  const rawCandId = (body.candidate_id || body._candidate_id || req.headers["x-candidate-id"] || req.query.candidate_id || "") as string;

  let emp: any = null;
  if (token) {
    emp = await resolveEmployerByToken(db, token);
  }
  if (!emp && rawEmpId) {
    const cleanId = String(rawEmpId).replace(/^emp-?/i, "");
    emp = await db.get("SELECT * FROM employers WHERE id = ? OR CAST(public_id AS TEXT) = ? OR user_id = ?", [
      rawEmpId,
      cleanId,
      rawEmpId,
    ]);
  }

  let cand: any = null;
  if (!emp && (candToken || rawCandId)) {
    const searchVal = String(candToken || rawCandId);
    const cleanVal = searchVal.replace(/^cand(idate)?-?/i, "");
    cand = await db.get("SELECT * FROM candidates WHERE id = ? OR CAST(public_id AS TEXT) = ?", [searchVal, cleanVal]);
  }

  const viewerId = String(emp ? emp.id || emp.public_id : cand ? cand.public_id || cand.id : "admin");
  const ids = body._ids || body.ids;
  if (Array.isArray(ids) && ids.length > 0) {
    for (const id of ids) {
      const strId = String(id);
      if (!strId.startsWith("tx_")) {
        try {
          await db.run(`UPDATE notifications SET read_at = NOW() WHERE id = ?`, [strId]);
        } catch {}
      }
      try {
        await db.run(
          `INSERT INTO notification_reads (id, item_id, user_id, read_at) VALUES (?, ?, ?, NOW())
           ON CONFLICT (item_id, user_id) DO UPDATE SET read_at = NOW()`,
          [genId("nr"), strId, viewerId]
        );
      } catch {}
    }
  } else {
    try {
      await db.run(`UPDATE notifications SET read_at = NOW() WHERE read_at IS NULL`);
    } catch {}
    if (emp) {
      try {
        const txRows = await db.all(
          `SELECT id FROM transactions WHERE (wallet_id IN (SELECT id FROM wallets WHERE employer_id = ? OR employer_id = ?) OR ref_id = ? OR ref_id = ? OR wallet_id = ? OR wallet_id = ?) LIMIT 200`,
          [emp.id, String(emp.public_id || ""), emp.id, String(emp.public_id || ""), emp.id, String(emp.public_id || "")]
        );
        for (const t of txRows || []) {
          await db.run(
            `INSERT INTO notification_reads (id, item_id, user_id, read_at) VALUES (?, ?, ?, NOW())
             ON CONFLICT (item_id, user_id) DO UPDATE SET read_at = NOW()`,
            [genId("nr"), `tx_${t.id}`, viewerId]
          );
        }
      } catch {}
    }
  }
  return { ok: true };
}
