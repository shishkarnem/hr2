/**
 * URL/link helpers and DB-backed loaders that bind every dynamic segment
 * (`/{companySlug}/{projectSlug}/{candidate-public-id}/...`, `/employer{public_id}/...`,
 * `/candidate{public_id}/...`) to real records in database. No hardcoded slugs.
 */
import { dbClient } from "@/lib/dbClient";

export const EMPLOYER_SESSION_ID_KEY = "employer_session_id";
export const EMPLOYER_SESSION_USER_ID_KEY = "employer_session_user_id";

const RESERVED_EMPLOYER_IDS = new Set([
  "loyer", // legacy `/employer/...` parser bug: `emp` + `loyer`
  "profile",
  "companies",
  "vacancies",
  "training",
  "interviews",
  "crm",
  "tariff",
  "billing",
  "invoice",
  "payment",
  "accounts",
]);

export function isEmployerPublicIdCandidate(publicId: string | null | undefined): publicId is string {
  const pid = (publicId || "").trim();
  return /^[A-Za-z0-9_-]{3,64}$/.test(pid) && !RESERVED_EMPLOYER_IDS.has(pid.toLowerCase());
}

export function parseEmployerPublicIdFromPath(pathname: string): string | null {
  const firstSegment = (pathname || "").split("/").filter(Boolean)[0] || "";
  const lower = firstSegment.toLowerCase();

  // Canonical URL: /emp100003/profile. Check the full first segment instead
  // of a loose regexp so `/employer/profile` can never become id `loyer`.
  if (lower.startsWith("emp") && !lower.startsWith("employer")) {
    const pid = firstSegment.slice(3);
    if (isEmployerPublicIdCandidate(pid)) return pid;
  }

  // Legacy concatenated URL only: /employer100003/profile.
  // Plain `/employer/profile` is a route prefix, not an employer id.
  if (lower.startsWith("employer") && lower.length > "employer".length) {
    const pid = firstSegment.slice("employer".length);
    if (isEmployerPublicIdCandidate(pid)) return pid;
  }

  return null;
}

export function clearCachedEmployerPublicId() {
  try {
    localStorage.removeItem(EMPLOYER_SESSION_ID_KEY);
    localStorage.removeItem(EMPLOYER_SESSION_USER_ID_KEY);
  } catch { /* ignore */ }
}

export function cacheEmployerPublicId(publicId: string, userId?: string | null) {
  if (!isEmployerPublicIdCandidate(publicId)) {
    clearCachedEmployerPublicId();
    return;
  }
  try {
    localStorage.setItem(EMPLOYER_SESSION_ID_KEY, publicId);
    if (userId) localStorage.setItem(EMPLOYER_SESSION_USER_ID_KEY, userId);
  } catch { /* ignore */ }
}

export function readCachedEmployerPublicIdForUser(userId: string): string | null {
  try {
    const cachedPid = localStorage.getItem(EMPLOYER_SESSION_ID_KEY);
    const cachedUser = localStorage.getItem(EMPLOYER_SESSION_USER_ID_KEY);
    if (!isEmployerPublicIdCandidate(cachedPid)) {
      clearCachedEmployerPublicId();
      return null;
    }
    return cachedUser === userId ? cachedPid : null;
  } catch {
    return null;
  }
}

export type DBCompany = {
  id: string;
  slug: string | null;
  name: string | null;
  owner_employer_id?: string | null;
  logo_url?: string | null;
};

export type DBProject = {
  id: string;
  slug: string | null;
  role_name: string | null;
  employer_id: string;
  company_id: string | null;
  is_published?: boolean;
};

export type DBCandidate = {
  id: string;
  public_id: string | null;
  project_id: string | null;
  user_id: string | null;
};

export type DBEmployer = {
  id: string;
  public_id: string | null;
  user_id: string | null;
  company_name?: string | null;
};

/* ----------------------------- URL builders ----------------------------- */

export function buildCompanyUrl(company: { slug: string | null } | null | undefined): string {
  return company?.slug ? `/com${company.slug}` : `/`;
}

export function buildVacancyUrl(
  company: { slug: string | null } | null | undefined,
  project: { slug: string | null } | null | undefined,
): string {
  if (!company?.slug || !project?.slug) return `/`;
  return `/com${company.slug}/vac${project.slug}`;
}

export function buildCandidateUrl(
  company: { slug: string | null } | null | undefined,
  project: { slug: string | null } | null | undefined,
  candidate: { public_id: string | null } | null | undefined,
  tab: string = "profile",
  sub?: string,
): string {
  const candId = candidate?.public_id ? `cand${candidate.public_id}` : `cand`;
  const tail = sub ? `${tab}/${sub}` : tab;
  if (company?.slug && project?.slug) {
    return `/com${company.slug}/vac${project.slug}/${candId}/${tail}`;
  }
  return `/${candId}/${tail}`;
}

export function buildEmployerUrl(
  employer: { public_id: string | null } | null | undefined,
  tab: string = "profile",
): string {
  const pid = employer?.public_id ?? "";
  return pid ? `/emp${pid}/${tab}` : `/employer/${tab}`;
}

/* ---------------------------- DB Resolvers ----------------------------- */

export async function resolveEmployerByPublicId(publicId: string): Promise<DBEmployer | null> {
  const { data } = await dbClient
    .from("employers")
    .select("id, public_id, user_id, company_name")
    .eq("public_id", publicId)
    .maybeSingle();
  return (data as DBEmployer) || null;
}

export async function resolveEmployerByUser(userId: string): Promise<DBEmployer | null> {
  const { data } = await dbClient
    .from("employers")
    .select("id, public_id, user_id, company_name")
    .eq("user_id", userId)
    .maybeSingle();
  return (data as DBEmployer) || null;
}

export async function resolveCandidateByPublicId(publicId: string): Promise<DBCandidate | null> {
  const { data } = await dbClient
    .from("candidates")
    .select("id, public_id, project_id, user_id")
    .eq("public_id", publicId)
    .maybeSingle();
  return (data as DBCandidate) || null;
}

export async function resolveCandidateByUser(userId: string): Promise<DBCandidate | null> {
  const { data } = await dbClient
    .from("candidates")
    .select("id, public_id, project_id, user_id")
    .eq("user_id", userId)
    .maybeSingle();
  return (data as DBCandidate) || null;
}

export async function resolveCompanyBySlug(slug: string): Promise<DBCompany | null> {
  const { data } = await dbClient
    .from("companies")
    .select("id, slug, name, owner_employer_id, logo_url")
    .eq("slug", slug)
    .maybeSingle();
  return (data as DBCompany) || null;
}

export async function resolveProjectBySlug(slug: string): Promise<DBProject | null> {
  const { data } = await dbClient
    .from("projects")
    .select("id, slug, role_name, employer_id, company_id, is_published")
    .eq("slug", slug)
    .maybeSingle();
  return (data as DBProject) || null;
}

export async function resolveProjectById(id: string): Promise<DBProject | null> {
  const { data } = await dbClient
    .from("projects")
    .select("id, slug, role_name, employer_id, company_id, is_published")
    .eq("id", id)
    .maybeSingle();
  return (data as DBProject) || null;
}

/**
 * Best-effort: given any user, find their public profile path.
 * Tries employer first (public_id), then candidate (public_id).
 */
export async function resolveProfilePathForUser(userId: string): Promise<string> {
  const emp = await resolveEmployerByUser(userId);
  if (emp?.public_id) return buildEmployerUrl(emp, "profile");
  const cand = await resolveCandidateByUser(userId);
  if (cand?.public_id) return `/cand${cand.public_id}/profile`;
  return "/";
}

/**
 * Transliterates Russian Cyrillic characters to clean URL-safe Latin slug.
 * Replaces spaces with hyphens, removes all special characters.
 * Example: 'РентРОП' -> 'rentrop', 'Новая Компания 2' -> 'novaya-kompaniya-2'
 */
export function transliterateToSlug(str: string): string {
  if (!str) return "";
  const ruMap: Record<string, string> = {
    "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "yo", "ж": "zh",
    "з": "z", "и": "i", "й": "y", "к": "k", "л": "l", "м": "m", "н": "n", "о": "o",
    "п": "p", "р": "r", "с": "s", "т": "t", "у": "u", "ф": "f", "х": "kh", "ц": "ts",
    "ч": "ch", "ш": "sh", "щ": "shch", "ъ": "", "ы": "y", "ь": "", "э": "e", "ю": "yu",
    "я": "ya"
  };

  return str
    .toLowerCase()
    .replace(/[\s\u00A0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+/g, "-")
    .split("")
    .map((c) => (ruMap[c] !== undefined ? ruMap[c] : c))
    .join("")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "";
}

/**
 * Generates a unique role slug scoped to a company.
 * If the slug already exists among other vacancies of the same company,
 * appends -2, -3, etc.
 */
export function generateUniqueRoleSlug(
  roleName: string,
  existingSlugsForCompany: (string | null | undefined)[],
  fallbackPublicId?: string
): string {
  let baseSlug = transliterateToSlug(roleName);
  if (!baseSlug) {
    baseSlug = fallbackPublicId ? `vac${fallbackPublicId}` : "vacancy";
  }

  const existingSet = new Set(
    existingSlugsForCompany
      .filter((s): s is string => Boolean(s))
      .map((s) => String(s).toLowerCase().trim())
  );

  if (!existingSet.has(baseSlug)) {
    return baseSlug;
  }

  let counter = 2;
  while (existingSet.has(`${baseSlug}-${counter}`)) {
    counter++;
  }
  return `${baseSlug}-${counter}`;
}

