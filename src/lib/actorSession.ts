import { getDemoUserId } from "./demoSession";

export function extractNumericEmployerId(val: unknown): string | null {
  if (val === undefined || val === null) return null;
  const s = String(val).trim();
  if (!s || s === "undefined" || s === "null" || s === "anon") return null;
  const m = s.match(/^(?:emp)?(\d{4,15})(?:_.*)?$/i);
  if (!m || !m[1]) return null;
  return m[1] === "1100007" ? "100007" : m[1];
}

export function resolveActiveEmployerId(fallbackEntity?: Record<string, any> | null): string {
  let saw100007 = false;

  if (typeof window !== "undefined") {
    const pathMatch = window.location.pathname.match(/\/emp(\d{4,15})/i);
    if (pathMatch?.[1]) {
      const fromUrl = pathMatch[1] === "1100007" ? "100007" : pathMatch[1];
      if (fromUrl !== "100007") return fromUrl;
      saw100007 = true;
    }

    try {
      const empUserRaw = localStorage.getItem("emp_user");
      if (empUserRaw) {
        const empUser = JSON.parse(empUserRaw);
        const candidates = [
          empUser?.public_id,
          empUser?.publicId,
          empUser?.employer_public_id,
          empUser?.employerPublicId,
          empUser?.employerId,
          empUser?.employer_id,
          empUser?.id,
        ];
        for (const c of candidates) {
          const parsed = extractNumericEmployerId(c);
          if (parsed) {
            if (parsed !== "100007") return parsed;
            saw100007 = true;
          }
        }
      }
    } catch {}
  }

  if (fallbackEntity && typeof fallbackEntity === "object") {
    const entityCandidates = [
      fallbackEntity.employer_public_id,
      fallbackEntity.employerPublicId,
      fallbackEntity.owner_employer_id,
      fallbackEntity.ownerEmployerId,
      fallbackEntity.employer_id,
      fallbackEntity.employerId,
    ];
    for (const c of entityCandidates) {
      const parsed = extractNumericEmployerId(c);
      if (parsed) {
        if (parsed !== "100007") return parsed;
        saw100007 = true;
      }
    }
  }

  if (typeof window !== "undefined") {
    try {
      const storageKeys = [
        "current_employer_id",
        "employer_public_id",
        "emp_public_id",
        "employer_id",
        "emp_id",
        "last_employer_id",
      ];
      for (const k of storageKeys) {
        const parsed = extractNumericEmployerId(localStorage.getItem(k));
        if (parsed) {
          if (parsed !== "100007") return parsed;
          saw100007 = true;
        }
      }
    } catch {}
  }

  return saw100007 ? "100007" : "100007";
}

export function resolveActiveCandidateId(): string | null {
  if (typeof window === "undefined") return null;
  const pathMatch = window.location.pathname.match(/\/candidate(\d{5,10})/i);
  if (pathMatch?.[1]) return pathMatch[1];

  try {
    const rawSess = localStorage.getItem("cand_session");
    if (rawSess) {
      const parsed = JSON.parse(rawSess);
      const cid = parsed?.public_id || parsed?.publicId || parsed?.candidate_id || parsed?.id;
      if (cid) return String(cid).trim();
    }
  } catch {}

  try {
    const sid = localStorage.getItem("cand_session_id");
    if (sid && sid.trim()) return sid.trim();
  } catch {}

  return null;
}

export function resolveVoiceSttActor(): Record<string, string> {
  if (typeof window !== "undefined") {
    const path = window.location.pathname.toLowerCase();
    if (path.startsWith("/demo") || path.startsWith("/preview")) {
      return { demo_user_id: getDemoUserId() };
    }
    if (path.startsWith("/candidate") && !path.startsWith("/emp")) {
      const cid = resolveActiveCandidateId();
      if (cid) return { candidate_id: cid };
    }
    if (path.startsWith("/emp")) {
      const empId = resolveActiveEmployerId();
      return { employer_id: empId, employer_public_id: empId };
    }
    try {
      if (localStorage.getItem("emp_user")) {
        const empId = resolveActiveEmployerId();
        return { employer_id: empId, employer_public_id: empId };
      }
    } catch {}
    const cid = resolveActiveCandidateId();
    if (cid) return { candidate_id: cid };
  }
  return { demo_user_id: getDemoUserId() };
}

export function resolveLandingVisitorChatId(): string {
  if (typeof window === "undefined") return "70000100001";
  try {
    const existing = (localStorage.getItem("rr_landing_chat_user_id") || "").trim();
    const digits = existing.replace(/\D/g, "");
    if (digits.length >= 8) {
      return digits.slice(0, 11).padEnd(11, "7");
    }
    const fresh = `${Math.floor(1 + Math.random() * 9)}${Math.floor(Math.random() * 10000000000).toString().padStart(10, "0")}`;
    localStorage.setItem("rr_landing_chat_user_id", fresh);
    return fresh;
  } catch {
    return `${Math.floor(1 + Math.random() * 9)}${Math.floor(Math.random() * 10000000000).toString().padStart(10, "0")}`;
  }
}
