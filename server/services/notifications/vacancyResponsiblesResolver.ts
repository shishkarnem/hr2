import type { PgDBWrapper } from "../../db";

export interface ResolvedResponsibleEmployer {
  empRow: any;
  id: string;
  public_id: string;
  name: string;
  email: string;
  phone: string;
  telegram: string;
  avatar_url: string;
  roleLabel: string;
}

export interface VacancyResponsibleContactDTO {
  id: string;
  public_id: string;
  name: string;
  roleLabel: string;
  email: string;
  phone: string;
  telegram: string;
  avatar_url: string;
}

export function normalizeEmployerToken(raw: any): string {
  return String(raw || "").trim().replace(/^emp-?/i, "").trim();
}

export function parseResponsibleIdsList(projRow: any, fallbackEmpId?: string | null): string[] {
  const result: string[] = [];
  const seenNorm = new Set<string>();

  const pushVal = (v: any) => {
    const str = String(v || "").trim();
    if (!str) return;
    const norm = normalizeEmployerToken(str);
    if (!norm || seenNorm.has(norm)) return;
    seenNorm.add(norm);
    result.push(str);
  };

  let dataJson: any = {};
  if (projRow?.data_json) {
    try {
      dataJson = typeof projRow.data_json === "string" ? JSON.parse(projRow.data_json) : projRow.data_json;
    } catch {}
  }

  const rawListSource =
    projRow?.responsible_employer_ids ??
    projRow?.responsibleEmployerIds ??
    dataJson?.responsible_employer_ids ??
    dataJson?.responsibleEmployerIds;

  if (Array.isArray(rawListSource)) {
    for (const item of rawListSource) pushVal(item);
  } else if (typeof rawListSource === "string" && rawListSource.trim()) {
    const trimmed = rawListSource.trim();
    if (trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          for (const item of parsed) pushVal(item);
        }
      } catch {
        for (const item of trimmed.split(/[,\s;]+/)) pushVal(item);
      }
    } else {
      for (const item of trimmed.split(/[,\s;]+/)) pushVal(item);
    }
  }

  pushVal(
    projRow?.responsible_employer_id ||
      projRow?.responsibleEmployerId ||
      dataJson?.responsible_employer_id ||
      dataJson?.responsibleEmployerId
  );

  if (result.length === 0) {
    pushVal(projRow?.employer_id || projRow?.employerId || dataJson?.employer_id || fallbackEmpId);
  }

  return result;
}

export function serializeResponsibleIds(ids: string[]): string {
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const id of ids || []) {
    const str = String(id || "").trim();
    const norm = normalizeEmployerToken(str);
    if (!str || !norm || seen.has(norm)) continue;
    seen.add(norm);
    unique.push(str);
  }
  return JSON.stringify(unique);
}

async function fetchEmployerByAnyId(db: PgDBWrapper, rawId: string): Promise<any | null> {
  const trimmed = String(rawId || "").trim();
  if (!trimmed) return null;
  const clean = normalizeEmployerToken(trimmed);
  return (
    (await db.get(
      `SELECT id, public_id, user_id, name, contact_name, company_name, email, contact_email,
              phone, contact_phone, COALESCE(NULLIF(contact_telegram, ''), COALESCE(telegram_username, '')) AS telegram,
              COALESCE(avatar_url, '') AS avatar_url, telegram_chat_id, notifications_config
       FROM employers
       WHERE id = ? OR CAST(public_id AS TEXT) = ? OR id = ? OR CAST(public_id AS TEXT) = ?
       LIMIT 1`,
      [trimmed, trimmed, `emp-${clean}`, clean]
    )) || null
  );
}

export async function resolveVacancyResponsibleEmployers(
  db: PgDBWrapper,
  projRow: any,
  fallbackEmpId?: string | null
): Promise<ResolvedResponsibleEmployer[]> {
  if (!db) return [];
  const rawIds = parseResponsibleIdsList(projRow, fallbackEmpId);

  let compRow: any = null;
  const compId = projRow?.company_id || projRow?.companyId || null;
  if (compId) {
    const cleanComp = String(compId).replace(/^comp-?/i, "").trim();
    try {
      compRow = await db.get(
        `SELECT id, public_id, name, owner_employer_id, employer_id FROM companies
         WHERE id = ? OR CAST(public_id AS TEXT) = ? OR id = ? OR slug = ? LIMIT 1`,
        [String(compId), String(compId), `comp-${cleanComp}`, String(compId)]
      );
    } catch {}
  }

  const companyOwnerNorm = normalizeEmployerToken(compRow?.owner_employer_id || compRow?.employer_id || "");
  const vacancyCreatorNorm = normalizeEmployerToken(projRow?.employer_id || projRow?.employerId || "");

  // Fetch company members roles & active statuses to filter out revoked members
  const memberRoleMap = new Map<string, { role: string; status: string }>();
  if (compRow?.id) {
    try {
      const mRows =
        (await db.all(
          `SELECT employer_id, role, status FROM company_members WHERE company_id = ?`,
          [String(compRow.id)]
        )) || [];
      for (const mr of mRows) {
        const key = normalizeEmployerToken(mr.employer_id);
        if (key) memberRoleMap.set(key, { role: String(mr.role || "member"), status: String(mr.status || "active") });
      }
    } catch {}
  }

  const resolved: ResolvedResponsibleEmployer[] = [];
  const seenEmpPrimaryIds = new Set<string>();

  const tryPushEmpId = async (candidateRawId: string, allowIfRevoked = false) => {
    const empRow = await fetchEmployerByAnyId(db, candidateRawId);
    if (!empRow) return;
    const empIdStr = String(empRow.id);
    if (seenEmpPrimaryIds.has(empIdStr)) return;

    const normEmpId = normalizeEmployerToken(empRow.id);
    const normPubId = normalizeEmployerToken(empRow.public_id);

    const memberMeta = memberRoleMap.get(normEmpId) || memberRoleMap.get(normPubId);
    if (!allowIfRevoked && memberMeta && ["revoked", "removed", "inactive"].includes(memberMeta.status)) {
      if (
        normEmpId !== companyOwnerNorm &&
        normPubId !== companyOwnerNorm &&
        normEmpId !== vacancyCreatorNorm &&
        normPubId !== vacancyCreatorNorm
      ) {
        return;
      }
    }

    seenEmpPrimaryIds.add(empIdStr);
    let roleLabel = "Ответственный менеджер";
    if (normEmpId === companyOwnerNorm || normPubId === companyOwnerNorm) {
      roleLabel = "Владелец компании";
    } else if (memberMeta) {
      roleLabel = memberMeta.role === "admin" ? "Администратор команды" : "Менеджер команды";
    } else if (normEmpId === vacancyCreatorNorm || normPubId === vacancyCreatorNorm) {
      roleLabel = "Создатель вакансии";
    }

    resolved.push({
      empRow,
      id: empIdStr,
      public_id: String(empRow.public_id || empRow.id),
      name: String(empRow.contact_name || empRow.name || empRow.company_name || "Менеджер компании").trim(),
      email: String(empRow.contact_email || empRow.email || "").trim(),
      phone: String(empRow.contact_phone || empRow.phone || "").trim(),
      telegram: String(empRow.telegram || "").trim().replace(/^@+/, ""),
      avatar_url: String(empRow.avatar_url || "").trim(),
      roleLabel,
    });
  };

  for (const idItem of rawIds) {
    await tryPushEmpId(idItem, false);
  }

  // Fallback to vacancy creator -> company owner -> fallbackEmpId if all selected were missing/revoked
  if (resolved.length === 0 && projRow?.employer_id) {
    await tryPushEmpId(String(projRow.employer_id), true);
  }
  if (resolved.length === 0 && (compRow?.owner_employer_id || compRow?.employer_id)) {
    await tryPushEmpId(String(compRow.owner_employer_id || compRow.employer_id), true);
  }
  if (resolved.length === 0 && fallbackEmpId) {
    await tryPushEmpId(String(fallbackEmpId), true);
  }

  return resolved;
}

export function formatResponsibleContacts(
  resolved: ResolvedResponsibleEmployer[],
  companyName?: string
): {
  primary: VacancyResponsibleContactDTO & { companyName?: string };
  list: VacancyResponsibleContactDTO[];
} {
  const list: VacancyResponsibleContactDTO[] = resolved.map((r) => ({
    id: r.id,
    public_id: r.public_id,
    name: r.name,
    roleLabel: r.roleLabel,
    email: r.email,
    phone: r.phone,
    telegram: r.telegram,
    avatar_url: r.avatar_url,
  }));

  const first = list[0] || {
    id: "",
    public_id: "",
    name: companyName || "Менеджер компании",
    roleLabel: "Ответственный за вакансию",
    email: "",
    phone: "",
    telegram: "",
    avatar_url: "",
  };

  return {
    primary: {
      ...first,
      companyName: companyName || "",
    },
    list,
  };
}

export async function dispatchVacancyBellAndPushToResponsibles(
  db: PgDBWrapper,
  params: {
    projectId?: string | number | null;
    projRow?: any;
    fallbackEmpId?: string | null;
    eventKey: string;
    kind: string;
    title: string;
    body: string;
    linkBuilder?: (empPubId: string) => string;
    defaultLink?: string;
    meta?: Record<string, any>;
  }
) {
  const { dispatchUserNotification } = await import("../push/pushService");
  let projRow = params.projRow || null;
  if (!projRow && params.projectId) {
    const pid = String(params.projectId).trim();
    const cleanPid = pid.replace(/^vac_?/i, "").trim();
    projRow = await db.get(
      `SELECT id, public_id, employer_id, responsible_employer_id, responsible_employer_ids, company_id, role_name
       FROM projects WHERE id = ? OR CAST(public_id AS TEXT) = ? OR id = ? OR CAST(public_id AS TEXT) = ? LIMIT 1`,
      [pid, pid, cleanPid, cleanPid]
    );
  }

  const responsibles = await resolveVacancyResponsibleEmployers(db, projRow, params.fallbackEmpId);
  const results: Array<{
    employer: ResolvedResponsibleEmployer;
    dispatched: Awaited<ReturnType<typeof dispatchUserNotification>>;
  }> = [];

  for (const resp of responsibles) {
    const pubClean = String(resp.public_id || resp.id).replace(/^emp-?/i, "");
    const link = params.linkBuilder
      ? params.linkBuilder(pubClean)
      : params.defaultLink || `/emp${pubClean}/crm`;

    const ownerIds = Array.from(
      new Set([String(resp.id), String(resp.public_id), String(resp.empRow?.user_id || "")].filter(Boolean))
    );

    const dispatched = await dispatchUserNotification(db, {
      ownerType: "employer",
      ownerIds,
      eventKey: params.eventKey,
      kind: params.kind,
      title: params.title,
      body: params.body,
      link,
      meta: params.meta,
    });
    results.push({ employer: resp, dispatched });
  }

  const primaryEmp = responsibles[0];
  const primaryPub = primaryEmp ? String(primaryEmp.public_id || primaryEmp.id).replace(/^emp-?/i, "") : "";
  const primaryLink = params.linkBuilder && primaryPub
    ? params.linkBuilder(primaryPub)
    : params.defaultLink || (primaryPub ? `/emp${primaryPub}/crm` : "/emp");

  return {
    responsibles,
    results,
    primaryLink,
  };
}
