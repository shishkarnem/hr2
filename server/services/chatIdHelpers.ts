import { getProTalkDB, PgDBWrapper } from "../db";
import { queryGetPg } from "../db/protalkDb";

export function extractUserSocialId(val: any): string {
  if (!val) return String(Math.floor(100000 + Math.random() * 900000));
  const s = String(val).trim();
  const match = s.match(/\d{5,15}/);
  if (match) return match[0];
  const digits = s.replace(/\D/g, "");
  if (digits.length >= 5) return digits.slice(0, 15);
  if (digits.length > 0) return digits.padStart(6, "0");
  return String(Math.floor(100000 + Math.random() * 900000));
}

export function extract6DigitUserSocialId(val: any): string {
  return extractUserSocialId(val);
}

export function formatDemoChatId(demoUserId: any, suffix: string): string {
  const raw = String(demoUserId || "").trim();
  const match = raw.match(/\d{6}/);
  let digits = match ? match[0] : raw.replace(/\D/g, "");
  if (digits.length > 6) digits = digits.slice(-6);
  if (digits.length < 6 && digits.length > 0) digits = digits.padStart(6, "0");
  if (!digits || digits === "000000") {
    digits = String(Math.floor(100000 + Math.random() * 900000));
  }
  return `demo${digits}_${suffix}`;
}

export function formatEmployerChatId(empId: any, suffix = "RRvacancy"): string {
  const raw = String(empId || "").trim();
  let digits = raw.replace(/\D/g, "");
  if (digits === "1100007") {
    digits = "100007";
  }
  if (!digits || digits.length < 4 || digits.length > 15) {
    digits = "100007";
  }
  return `${digits}_${suffix}`;
}

async function lookupNumericEmployerPublicId(db: PgDBWrapper, rawVal: any): Promise<string | null> {
  if (rawVal === undefined || rawVal === null) return null;
  const s = String(rawVal).trim();
  if (!s || s === "undefined" || s === "null" || s === "anon") return null;

  const empMatch = s.match(/^(?:emp)?(\d{4,15})(?:_.*)?$/i);
  if (empMatch && empMatch[1]) {
    let digits = empMatch[1];
    if (digits === "1100007") digits = "100007";
    return digits;
  }

  try {
    const row = await db.get(
      `SELECT public_id, id FROM employers WHERE id = ? OR CAST(public_id AS TEXT) = ? OR user_id = ? LIMIT 1`,
      [s, s, s]
    );
    if (row?.public_id) {
      const pDigits = String(row.public_id).replace(/\D/g, "");
      if (pDigits.length >= 4 && pDigits.length <= 15) return pDigits;
    }
  } catch {}
  return null;
}

export async function resolveEmployerPublicId(
  db: PgDBWrapper,
  opts: {
    employerId?: any;
    employerPublicId?: any;
    userId?: any;
    projectId?: any;
    companyId?: any;
  }
): Promise<string> {
  const candidates = [opts.employerPublicId, opts.employerId, opts.userId];
  let explicitFallback100007 = false;

  for (const cand of candidates) {
    const resolved = await lookupNumericEmployerPublicId(db, cand);
    if (resolved) {
      if (resolved === "100007") {
        explicitFallback100007 = true;
      } else {
        return resolved;
      }
    }
  }

  let projectCompanyId = opts.companyId;
  if (opts.projectId) {
    try {
      const pid = String(opts.projectId).trim();
      const pidDigits = pid.replace(/^vac/i, "");
      const proj = await db.get(
        `SELECT company_id, employer_public_id, employer_id FROM projects WHERE id = ? OR CAST(public_id AS TEXT) = ? OR CAST(public_id AS TEXT) = ? OR slug = ? LIMIT 1`,
        [pid, pid, pidDigits, pid]
      );
      if (proj) {
        if (!projectCompanyId && proj.company_id) projectCompanyId = proj.company_id;
        const projPub = await lookupNumericEmployerPublicId(db, proj.employer_public_id);
        if (projPub && projPub !== "100007") return projPub;

        if (projectCompanyId) {
          const comp = await db.get(
            `SELECT owner_employer_id, employer_id FROM companies WHERE id = ? OR CAST(public_id AS TEXT) = ? OR slug = ? LIMIT 1`,
            [String(projectCompanyId), String(projectCompanyId), String(projectCompanyId)]
          );
          if (comp) {
            const compOwner =
              (await lookupNumericEmployerPublicId(db, comp.owner_employer_id)) ||
              (await lookupNumericEmployerPublicId(db, comp.employer_id));
            if (compOwner && compOwner !== "100007") return compOwner;
          }
        }

        const projEmp = await lookupNumericEmployerPublicId(db, proj.employer_id);
        if (projEmp) return projEmp;
      }
    } catch {}
  }

  if (projectCompanyId) {
    try {
      const cid = String(projectCompanyId).trim();
      const comp = await db.get(
        `SELECT owner_employer_id, employer_id FROM companies WHERE id = ? OR CAST(public_id AS TEXT) = ? OR slug = ? LIMIT 1`,
        [cid, cid, cid]
      );
      if (comp) {
        const compOwner =
          (await lookupNumericEmployerPublicId(db, comp.owner_employer_id)) ||
          (await lookupNumericEmployerPublicId(db, comp.employer_id));
        if (compOwner) return compOwner;
      }
    } catch {}
  }

  if (explicitFallback100007) return "100007";
  return "100007";
}

export async function resolveBotChatId(
  candidateId?: string,
  employerId?: string,
  projectId?: string
): Promise<string> {
  try {
    const dbInst = await getProTalkDB();
    if (candidateId) {
      if (candidateId.startsWith("demo") || candidateId.startsWith("ask") || /^\d{5,15}/.test(candidateId)) {
        return candidateId;
      }
      const candidate = await dbInst.get(
        "SELECT id, telegram_chat_id FROM candidates WHERE id = ? OR CAST(public_id AS TEXT) = ? LIMIT 1",
        [candidateId, candidateId]
      );
      if (candidate) {
        if (candidate.telegram_chat_id && String(candidate.telegram_chat_id).trim()) {
          const tg = String(candidate.telegram_chat_id).trim();
          return tg.startsWith("tb") ? tg : `tb${tg}`;
        }
        return candidate.id;
      }
      return candidateId;
    }
    if (employerId) {
      const employer = await dbInst.get(
        "SELECT id, telegram_chat_id FROM employers WHERE id = ? OR CAST(public_id AS TEXT) = ? LIMIT 1",
        [employerId, employerId]
      );
      if (employer) {
        if (employer.telegram_chat_id && String(employer.telegram_chat_id).trim()) {
          const tg = String(employer.telegram_chat_id).trim();
          return tg.startsWith("tb") ? tg : `tb${tg}`;
        }
        return employer.id;
      }
    }
    if (projectId) {
      const project = await dbInst.get(
        "SELECT id, employer_id FROM projects WHERE id = ? OR CAST(public_id AS TEXT) = ? LIMIT 1",
        [projectId, projectId]
      );
      if (project) {
        const empId = project.employer_id;
        const employer = empId
          ? await dbInst.get(
              "SELECT id, telegram_chat_id FROM employers WHERE id = ? OR CAST(public_id AS TEXT) = ? LIMIT 1",
              [empId, String(empId)]
            )
          : null;
        if (employer && employer.telegram_chat_id && String(employer.telegram_chat_id).trim()) {
          const tg = String(employer.telegram_chat_id).trim();
          return tg.startsWith("tb") ? tg : `tb${tg}`;
        }
        return project.id;
      }
    }
  } catch {}
  return "ask_default";
}

export async function findCandidateRow(db: PgDBWrapper, candidateIdentifier: any): Promise<any> {
  if (!db || !candidateIdentifier) return null;
  const s = String(candidateIdentifier).trim();
  const cleanId = s.replace(/^(candidate|cand)/i, "").trim();
  try {
    return (
      (await db.get(
        `SELECT * FROM candidates 
         WHERE id = ? OR CAST(public_id AS TEXT) = ? OR id = ? OR CAST(public_id AS TEXT) = ? OR CAST(legacy_public_id AS TEXT) = ? 
         LIMIT 1`,
        [s, s, cleanId, cleanId, cleanId]
      )) || null
    );
  } catch {
    return null;
  }
}

export async function resolveCandidate6DigitPublicId(
  candidateIdentifier: any,
  _db?: PgDBWrapper
): Promise<string> {
  if (!candidateIdentifier) return "200733";
  const s = String(candidateIdentifier).trim();
  try {
    const clean = s.replace(/^(candidate|cand)/i, "").trim();
    const row = await queryGetPg(
      "SELECT public_id FROM candidates WHERE id = $1 OR CAST(public_id AS TEXT) = $1 OR CAST(public_id AS TEXT) = $2 LIMIT 1",
      [s, clean]
    );
    if (row?.public_id) {
      const p = String(row.public_id).replace(/\D/g, "");
      if (p.length === 6) return p;
      if (p) return p.padStart(6, "0").slice(-6);
    }
  } catch {}

  const digitsMatch = s.match(/\b(2\d{5})\b/) || s.match(/\b(\d{6})\b/);
  if (digitsMatch) return digitsMatch[1];

  const cleanDigits = s.replace(/^(candidate|cand)/i, "").replace(/\D/g, "");
  if (cleanDigits.length === 6) return cleanDigits;
  if (cleanDigits.length > 6) return cleanDigits.slice(-6);
  if (cleanDigits.length > 0) return cleanDigits.padStart(6, "0");
  return "200733";
}

export async function formatChatIdFromPrefix(
  userPrefix: string | undefined | null,
  rawId: any,
  fallbackSuffix = "RRchat"
): Promise<string> {
  const s = String(rawId || "").trim();
  if (/^(?:demo)?\d{5,15}_(?:RR[a-zA-Z0-9_-]+|cheklist|cases|prod|prof|system)$/i.test(s)) {
    return s;
  }

  const isCandidateRef =
    s.startsWith("cand") ||
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
  if (isCandidateRef) {
    const candPid = await resolveCandidate6DigitPublicId(s);
    if (userPrefix && userPrefix.includes("{id}")) {
      return userPrefix.replace("{id}", candPid);
    }
    const effSuffix = fallbackSuffix === "RRresume" || fallbackSuffix === "RRfile" ? "RRresume" : fallbackSuffix;
    return `${candPid}_${effSuffix}`;
  }

  const hasExplicitPrefixTemplate = Boolean(userPrefix && userPrefix.includes("{id}"));
  if (s.includes("_RR") && !hasExplicitPrefixTemplate) {
    const parts = s.split("_");
    const isDemo = parts[0].toLowerCase().startsWith("demo");
    let digits = parts[0].replace(/\D/g, "");
    if (digits === "1100007") digits = "100007";
    if (isDemo) {
      if (digits.length > 6) digits = digits.slice(-6);
      if (digits.length > 0 && digits.length < 6) digits = digits.padStart(6, "0");
    } else if (digits.length > 0 && digits.length < 4) {
      digits = digits.padStart(6, "0");
    }
    if (!digits || digits === "000000" || digits.length > 15) {
      digits = isDemo ? String(Math.floor(100000 + Math.random() * 900000)) : "100007";
    }
    const sfx = parts[1] || fallbackSuffix;
    return isDemo ? `demo${digits}_${sfx}` : `${digits}_${sfx}`;
  }

  const firstPart = s.includes("_") ? s.split("_")[0] : s;
  const isExplicitDemo =
    firstPart.toLowerCase().startsWith("demo") ||
    (userPrefix ? userPrefix.toLowerCase().startsWith("demo") : false);
  let digits = firstPart.replace(/\D/g, "");
  if (digits === "1100007") digits = "100007";
  if (isExplicitDemo) {
    if (digits.length > 6) digits = digits.slice(-6);
    if (digits.length > 0 && digits.length < 6) digits = digits.padStart(6, "0");
  } else if (digits.length > 0 && digits.length < 4) {
    digits = digits.padStart(6, "0");
  }
  if (!digits || digits === "000000" || digits.length > 15) {
    digits = isExplicitDemo ? String(Math.floor(100000 + Math.random() * 900000)) : "100007";
  }

  if (userPrefix && userPrefix.includes("{id}")) {
    const formatted = userPrefix.replace("{id}", digits);
    if (firstPart.toLowerCase().startsWith("demo") && !formatted.startsWith("demo")) {
      return `demo${formatted}`;
    }
    return formatted;
  }

  return isExplicitDemo ? `demo${digits}_${fallbackSuffix}` : `${digits}_${fallbackSuffix}`;
}
