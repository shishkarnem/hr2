import { Router, Request, Response } from "express";
import { getProTalkDB } from "../db";

export const teamRouter = Router();

// Default permissions matrix
export const DEFAULT_MEMBER_PERMISSIONS = {
  company: "view", // 'edit' | 'view'
  vacancies: "edit", // 'edit' | 'view'
  can_create_vacancies: true,
  crm: "edit", // 'edit' | 'view'
  style_editor: "view", // 'edit' | 'view'
  training: "edit", // 'edit' | 'view'
  can_create_trainings: true,
  interview: "edit", // 'edit' | 'view'
  can_create_interviews: true,
};

// Helper to extract authenticated employer ID from session headers
async function getRequesterEmployerId(req: Request, db: any): Promise<string | null> {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim() || (req.headers["x-employer-token"] as string) || "";
  if (!token) return null;

  try {
    const session = await db.get(
      "SELECT employer_id FROM employer_sessions WHERE token = ? AND (expires_at IS NULL OR expires_at > NOW()::text) LIMIT 1",
      [token]
    );
    if (session?.employer_id) return String(session.employer_id);
  } catch {}

  // Fallback to query/body param if token lookup not available
  const param = req.query.employer_id || req.body?.employer_id || req.headers["x-employer-id"];
  return param ? String(param) : null;
}

// Helper to extract candidate search keys from a query (URL, /emp100007, emp100007, ID, email, phone)
function extractEmployerSearchCandidates(input: string): string[] {
  const trimmed = input.trim();
  const candidates = new Set<string>();
  candidates.add(trimmed);

  // If full or relative URL: e.g. https://domain.ru/emp100007 or /emp100007 or /emp-100007 or /employer/100007
  try {
    const urlMatches = trimmed.match(/\/emp-?([a-zA-Z0-9_\-]+)/i) || trimmed.match(/\/employer\/([a-zA-Z0-9_\-]+)/i);
    if (urlMatches && urlMatches[1]) {
      const extracted = urlMatches[1].trim();
      candidates.add(extracted);
      candidates.add(`emp${extracted}`);
      candidates.add(`emp-${extracted}`);
      const cleanNum = extracted.replace(/\D/g, "");
      if (cleanNum) candidates.add(cleanNum);
    }
  } catch {}

  // If starts with emp or emp-
  const matchEmp = trimmed.match(/^emp-?([a-zA-Z0-9_\-]+)$/i);
  if (matchEmp && matchEmp[1]) {
    const extracted = matchEmp[1].trim();
    candidates.add(extracted);
    candidates.add(`emp${extracted}`);
    candidates.add(`emp-${extracted}`);
    const cleanNum = extracted.replace(/\D/g, "");
    if (cleanNum) candidates.add(cleanNum);
  }

  // Pure digits if any
  const digits = trimmed.replace(/\D/g, "");
  if (digits) {
    candidates.add(digits);
    candidates.add(`emp${digits}`);
    candidates.add(`emp-${digits}`);
  }

  return Array.from(candidates).filter(Boolean);
}

// 1. Search employer by UID, public_id, link, email, or phone
teamRouter.get("/employer/find-user", async (req: Request, res: Response) => {
  try {
    const rawQuery = String(req.query.query || "").trim();
    if (!rawQuery || rawQuery.length < 2) {
      return res.status(400).json({ ok: false, error: "Укажите UID, ссылку на личный кабинет, email или номер телефона для поиска" });
    }

    const db = await getProTalkDB();
    const candidateKeys = extractEmployerSearchCandidates(rawQuery);
    const cleanDigits = rawQuery.replace(/[^\d+]/g, "");

    // Build dynamic query matching any of the candidate identifiers
    const placeholders = candidateKeys.map(() => "?").join(",");
    const params: any[] = [
      ...candidateKeys, // for id IN (...)
      ...candidateKeys, // for public_id IN (...)
      ...candidateKeys, // for legacy_public_id IN (...)
      ...candidateKeys, // for user_id IN (...)
      rawQuery,         // for LOWER(email) = LOWER(?)
      rawQuery,         // for phone = ?
    ];

    let phoneClause = "";
    if (cleanDigits.length >= 7) {
      phoneClause = "OR REPLACE(REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '(', ''), ')', '') = ?";
      params.push(cleanDigits);
    }

    const user = await db.get(
      `SELECT id, public_id, name, company_name, email, phone, created_at,
              COALESCE(avatar_url, '') AS avatar_url
       FROM employers
       WHERE id IN (${placeholders})
          OR CAST(public_id AS TEXT) IN (${placeholders})
          OR CAST(legacy_public_id AS TEXT) IN (${placeholders})
          OR user_id IN (${placeholders})
          OR LOWER(email) = LOWER(?)
          OR phone = ?
          ${phoneClause}
       LIMIT 1`,
      params
    );

    if (!user) {
      return res.status(404).json({ ok: false, error: "Пользователь с указанным UID или ссылкой на кабинет не найден в базе данных" });
    }

    res.json({
      ok: true,
      user: {
        id: user.id,
        public_id: user.public_id || user.id,
        name: user.name || user.company_name || "Работодатель",
        company_name: user.company_name || "",
        email: user.email || "",
        phone: user.phone || "",
        avatar_url: user.avatar_url || "",
      },
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 2. Get members of a company
teamRouter.get("/companies/:companyId/members", async (req: Request, res: Response) => {
  try {
    const { companyId } = req.params;
    const db = await getProTalkDB();

    const comp = await db.get(
      "SELECT * FROM companies WHERE id = ? OR CAST(public_id AS TEXT) = ? OR slug = ? LIMIT 1",
      [companyId, companyId, companyId]
    );
    if (!comp) {
      return res.status(404).json({ ok: false, error: "Компания не найдена" });
    }

    const ownerId = comp.owner_employer_id || comp.employer_id || "";
    const owner = ownerId
      ? await db.get(
          `SELECT id, public_id, name, contact_name, company_name, email, contact_email, phone, contact_phone,
                  COALESCE(NULLIF(contact_telegram, ''), COALESCE(telegram_username, '')) AS telegram,
                  COALESCE(avatar_url, '') AS avatar_url
           FROM employers WHERE id = ? OR CAST(public_id AS TEXT) = ? LIMIT 1`,
          [ownerId, String(ownerId)]
        )
      : null;

    const members = (await db.all(
      `SELECT cm.id, cm.company_id, cm.employer_id, cm.owner_employer_id, cm.role, cm.permissions_json, cm.status, cm.created_at, cm.updated_at,
              e.name, e.contact_name, e.company_name, e.email, e.contact_email, e.phone, e.contact_phone,
              COALESCE(NULLIF(e.contact_telegram, ''), COALESCE(e.telegram_username, '')) AS telegram,
              COALESCE(e.avatar_url, '') AS avatar_url, e.public_id as employer_public_id
       FROM company_members cm
       LEFT JOIN employers e ON (cm.employer_id = e.id OR cm.employer_id = CAST(e.public_id AS TEXT))
       WHERE cm.company_id = ? AND cm.status != 'revoked'
       ORDER BY cm.created_at ASC`,
      [comp.id]
    )) || [];

    const parsedMembers = members.map((m: any) => {
      let perms = { ...DEFAULT_MEMBER_PERMISSIONS };
      try {
        if (m.permissions_json) perms = { ...perms, ...JSON.parse(m.permissions_json) };
      } catch {}
      return {
        id: m.id,
        company_id: m.company_id,
        employer_id: m.employer_id,
        employer_public_id: m.employer_public_id || m.employer_id,
        name: m.contact_name || m.name || m.company_name || "Сотрудник",
        email: m.contact_email || m.email || "",
        phone: m.contact_phone || m.phone || "",
        telegram: m.telegram || "",
        avatar_url: m.avatar_url || "",
        role: m.role || "member",
        permissions: perms,
        status: m.status || "active",
        created_at: m.created_at,
      };
    });

    res.json({
      ok: true,
      company: {
        id: comp.id,
        public_id: comp.public_id || comp.id,
        name: comp.name,
        slug: comp.slug,
        owner_employer_id: ownerId,
      },
      owner: owner
        ? {
            id: owner.id,
            public_id: owner.public_id || owner.id,
            name: owner.contact_name || owner.name || owner.company_name || "Владелец",
            email: owner.contact_email || owner.email || "",
            phone: owner.contact_phone || owner.phone || "",
            telegram: owner.telegram || "",
            avatar_url: owner.avatar_url || "",
            role: "owner",
          }
        : null,
      members: parsedMembers,
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 3. Add a member to the company team
teamRouter.post("/companies/:companyId/members", async (req: Request, res: Response) => {
  try {
    const { companyId } = req.params;
    const body = req.body || {};
    const rawTarget = String(body.targetEmployerId || body.target_employer_id || body.query || "").trim();
    const role = body.role || "member";
    const permissions = body.permissions;

    if (!rawTarget) {
      return res.status(400).json({ ok: false, error: "Укажите UID, ссылку на кабинет, email или телефон сотрудника" });
    }

    const db = await getProTalkDB();
    const comp = await db.get(
      "SELECT * FROM companies WHERE id = ? OR CAST(public_id AS TEXT) = ? OR slug = ? LIMIT 1",
      [companyId, companyId, companyId]
    );
    if (!comp) {
      return res.status(404).json({ ok: false, error: "Компания не найдена" });
    }

    const ownerId = String(comp.owner_employer_id || comp.employer_id || "100007");

    // Check requester permission if authenticated
    const requesterId = await getRequesterEmployerId(req, db);
    if (requesterId && requesterId !== ownerId) {
      const requesterMember = await db.get(
        "SELECT role, permissions_json FROM company_members WHERE company_id = ? AND employer_id = ? AND status = 'active' LIMIT 1",
        [comp.id, requesterId]
      );
      if (!requesterMember || requesterMember.role !== "admin") {
        return res.status(403).json({ ok: false, error: "Только владелец компании может добавлять сотрудников в команду" });
      }
    }

    // Find target user by candidates (UID, public_id, link, email, phone)
    const candidateKeys = extractEmployerSearchCandidates(rawTarget);
    const cleanDigits = rawTarget.replace(/[^\d+]/g, "");
    const placeholders = candidateKeys.map(() => "?").join(",");
    const params: any[] = [
      ...candidateKeys,
      ...candidateKeys,
      ...candidateKeys,
      ...candidateKeys,
      rawTarget,
      rawTarget,
    ];

    let phoneClause = "";
    if (cleanDigits.length >= 7) {
      phoneClause = "OR REPLACE(REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '(', ''), ')', '') = ?";
      params.push(cleanDigits);
    }

    const targetUser = await db.get(
      `SELECT id, public_id, name, company_name, email, phone, created_at,
              COALESCE(avatar_url, '') AS avatar_url
       FROM employers
       WHERE id IN (${placeholders})
          OR CAST(public_id AS TEXT) IN (${placeholders})
          OR CAST(legacy_public_id AS TEXT) IN (${placeholders})
          OR user_id IN (${placeholders})
          OR LOWER(email) = LOWER(?)
          OR phone = ?
          ${phoneClause}
       LIMIT 1`,
      params
    );

    if (!targetUser) {
      return res.status(404).json({ ok: false, error: "Пользователь с указанными данными не найден в базе данных" });
    }

    const targetEmpId = String(targetUser.id);
    const targetPublicId = String(targetUser.public_id || targetUser.id);

    // Prevent adding the owner to their own team
    if (targetEmpId === ownerId || targetPublicId === ownerId) {
      return res.status(400).json({ ok: false, error: "Владелец компании уже обладает полным доступом и не может быть добавлен как приглашенный сотрудник" });
    }

    // Check if already in team
    const existing = await db.get(
      "SELECT * FROM company_members WHERE company_id = ? AND (employer_id = ? OR employer_id = ?) LIMIT 1",
      [comp.id, targetEmpId, targetPublicId]
    );

    const mergedPerms = { ...DEFAULT_MEMBER_PERMISSIONS, ...(typeof permissions === "object" ? permissions : {}) };
    const permsJson = JSON.stringify(mergedPerms);
    const now = new Date().toISOString();

    let memberId: string;
    if (existing) {
      if (existing.status === "active") {
        return res.status(400).json({ ok: false, error: "Этот пользователь уже состоит в команде компании" });
      }
      memberId = existing.id;
      await db.run(
        "UPDATE company_members SET role = ?, permissions_json = ?, status = 'active', updated_at = ? WHERE id = ?",
        [role, permsJson, now, memberId]
      );
    } else {
      memberId = `cmem_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      await db.run(
        `INSERT INTO company_members (id, company_id, employer_id, owner_employer_id, role, permissions_json, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
        [memberId, comp.id, targetEmpId, ownerId, role, permsJson, now, now]
      );
    }

    res.json({
      ok: true,
      member: {
        id: memberId,
        company_id: comp.id,
        employer_id: targetEmpId,
        employer_public_id: targetPublicId,
        name: targetUser.name || targetUser.company_name || "Сотрудник",
        email: targetUser.email || "",
        phone: targetUser.phone || "",
        avatar_url: targetUser.avatar_url || "",
        role,
        permissions: mergedPerms,
        status: "active",
        created_at: now,
      },
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 4. Update member permissions or role
teamRouter.patch("/companies/:companyId/members/:memberId", async (req: Request, res: Response) => {
  try {
    const { companyId, memberId } = req.params;
    const { role, permissions } = req.body || {};
    const db = await getProTalkDB();

    const comp = await db.get(
      "SELECT * FROM companies WHERE id = ? OR CAST(public_id AS TEXT) = ? OR slug = ? LIMIT 1",
      [companyId, companyId, companyId]
    );
    if (!comp) {
      return res.status(404).json({ ok: false, error: "Компания не найдена" });
    }

    const member = await db.get(
      "SELECT * FROM company_members WHERE id = ? AND company_id = ? LIMIT 1",
      [memberId, comp.id]
    );
    if (!member) {
      return res.status(404).json({ ok: false, error: "Сотрудник не найден в команде этой компании" });
    }

    let existingPerms = { ...DEFAULT_MEMBER_PERMISSIONS };
    try {
      if (member.permissions_json) existingPerms = { ...existingPerms, ...JSON.parse(member.permissions_json) };
    } catch {}

    const newPerms = permissions ? { ...existingPerms, ...permissions } : existingPerms;
    const newRole = role || member.role || "member";
    const now = new Date().toISOString();

    await db.run(
      "UPDATE company_members SET role = ?, permissions_json = ?, updated_at = ? WHERE id = ?",
      [newRole, JSON.stringify(newPerms), now, memberId]
    );

    res.json({
      ok: true,
      member: {
        ...member,
        role: newRole,
        permissions: newPerms,
        updated_at: now,
      },
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 5. Remove member from team
teamRouter.delete("/companies/:companyId/members/:memberId", async (req: Request, res: Response) => {
  try {
    const { companyId, memberId } = req.params;
    const db = await getProTalkDB();

    const comp = await db.get(
      "SELECT * FROM companies WHERE id = ? OR CAST(public_id AS TEXT) = ? OR slug = ? LIMIT 1",
      [companyId, companyId, companyId]
    );
    if (!comp) {
      return res.status(404).json({ ok: false, error: "Компания не найдена" });
    }

    await db.run(
      "UPDATE company_members SET status = 'revoked', updated_at = NOW() WHERE id = ? AND company_id = ?",
      [memberId, comp.id]
    );

    res.json({ ok: true, message: "Доступ сотрудника успешно отозван" });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 6. Get all companies where an employer is a team member
teamRouter.get("/employer/team-companies", async (req: Request, res: Response) => {
  try {
    const employerId = String(req.query.employer_id || req.headers["x-employer-id"] || "").trim();
    if (!employerId) {
      return res.json({ ok: true, companies: [] });
    }

    const db = await getProTalkDB();
    const rows = (await db.all(
      `SELECT c.*, cm.id as membership_id, cm.role as member_role, cm.permissions_json, cm.created_at as joined_at,
              o.name as owner_name, o.company_name as owner_company_name, o.public_id as owner_public_id, o.email as owner_email
       FROM company_members cm
       JOIN companies c ON (cm.company_id = c.id OR cm.company_id = CAST(c.public_id AS TEXT))
       LEFT JOIN employers o ON (cm.owner_employer_id = o.id OR cm.owner_employer_id = CAST(o.public_id AS TEXT))
       WHERE (cm.employer_id = ? OR cm.employer_id = (SELECT CAST(public_id AS TEXT) FROM employers WHERE id = ?))
         AND cm.status = 'active'
         AND (c.deleted_at IS NULL OR c.deleted_at = '')
       ORDER BY cm.created_at DESC`,
      [employerId, employerId]
    )) || [];

    const parsed = rows.map((r: any) => {
      let perms = { ...DEFAULT_MEMBER_PERMISSIONS };
      try {
        if (r.permissions_json) perms = { ...perms, ...JSON.parse(r.permissions_json) };
      } catch {}
      return {
        id: r.id,
        public_id: r.public_id || r.id,
        name: r.name,
        slug: r.slug,
        industry: r.industry,
        description: r.description,
        logo_url: r.logo_url,
        owner_employer_id: r.owner_employer_id || r.employer_id,
        owner_name: r.owner_name || r.owner_company_name || "Владелец",
        owner_public_id: r.owner_public_id,
        membership_id: r.membership_id,
        member_role: r.member_role,
        permissions: perms,
        joined_at: r.joined_at,
      };
    });

    res.json({ ok: true, companies: parsed });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});
