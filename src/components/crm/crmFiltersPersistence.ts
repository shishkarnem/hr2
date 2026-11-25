import type { CrmFieldFilters } from "./CrmModals";

export interface KanbanColSortValue {
  field: "name" | "date" | "score";
  dir: "asc" | "desc";
}

export interface KanbanColFilterValue {
  decision?: string;
  verdict?: string;
}

export interface PersistedCrmFilters {
  crmViewMode: "kanban" | "table";
  crmSearch: string;
  crmFilterCompany: string;
  crmFilterRole: string;
  crmFilterStage: string;
  crmFilterVerdict: string;
  crmFilterDecision: string;
  crmSort: { field: string; dir: "asc" | "desc" };
  crmDatePreset: "all" | "24h" | "custom";
  crmDateFrom: string;
  crmDateTo: string;
  crmFieldFilters: CrmFieldFilters;
  tableColFilters: Record<string, any>;
  kanbanColSearch: Record<string, string>;
  kanbanColSort: Record<string, KanbanColSortValue | undefined>;
  kanbanColFilter: Record<string, KanbanColFilterValue | undefined>;
  updatedAt?: number;
}

export const DEFAULT_PERSISTED_CRM_FILTERS: PersistedCrmFilters = {
  crmViewMode: "kanban",
  crmSearch: "",
  crmFilterCompany: "all",
  crmFilterRole: "all",
  crmFilterStage: "all",
  crmFilterVerdict: "all",
  crmFilterDecision: "all",
  crmSort: { field: "created", dir: "desc" },
  crmDatePreset: "all",
  crmDateFrom: "",
  crmDateTo: "",
  crmFieldFilters: {},
  tableColFilters: {},
  kanbanColSearch: {},
  kanbanColSort: {},
  kanbanColFilter: {},
};

const STORAGE_PREFIX = "crm_filters_v1_";

export function normalizeEmployerFilterKey(employerId?: string | null): string {
  const clean = String(employerId || "")
    .replace(/^emp-?/i, "")
    .trim();
  return clean || "emp";
}

export function getCrmFiltersStorageKey(employerId?: string | null): string {
  return `${STORAGE_PREFIX}${normalizeEmployerFilterKey(employerId)}`;
}

function cleanStringRecord(obj: any): Record<string, string> {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === "string" && v !== "") out[k] = v;
  }
  return out;
}

function cleanAnyRecord(obj: any): Record<string, any> {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return {};
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== null && v !== "") out[k] = v;
  }
  return out;
}

function cleanKanbanSortRecord(obj: any): Record<string, KanbanColSortValue | undefined> {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return {};
  const out: Record<string, KanbanColSortValue | undefined> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (!v || typeof v !== "object") continue;
    const field = (v as any).field;
    const dir = (v as any).dir;
    if (
      (field === "name" || field === "date" || field === "score") &&
      (dir === "asc" || dir === "desc")
    ) {
      out[k] = { field, dir };
    }
  }
  return out;
}

function cleanKanbanFilterRecord(obj: any): Record<string, KanbanColFilterValue | undefined> {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return {};
  const out: Record<string, KanbanColFilterValue | undefined> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (!v || typeof v !== "object") continue;
    const decision = typeof (v as any).decision === "string" ? (v as any).decision : undefined;
    const verdict = typeof (v as any).verdict === "string" ? (v as any).verdict : undefined;
    if ((decision && decision !== "all") || (verdict && verdict !== "all")) {
      out[k] = {
        ...(decision ? { decision } : {}),
        ...(verdict ? { verdict } : {}),
      };
    }
  }
  return out;
}

export function normalizePersistedCrmFilters(raw: any): PersistedCrmFilters {
  if (!raw || typeof raw !== "object") {
    return { ...DEFAULT_PERSISTED_CRM_FILTERS };
  }
  const sortField = typeof raw?.crmSort?.field === "string" && raw.crmSort.field.trim()
    ? raw.crmSort.field.trim()
    : "created";
  const sortDir = raw?.crmSort?.dir === "asc" ? "asc" : "desc";
  const datePreset =
    raw?.crmDatePreset === "24h" || raw?.crmDatePreset === "custom" ? raw.crmDatePreset : "all";

  return {
    crmViewMode: raw?.crmViewMode === "table" ? "table" : "kanban",
    crmSearch: typeof raw?.crmSearch === "string" ? raw.crmSearch : "",
    crmFilterCompany:
      typeof raw?.crmFilterCompany === "string" && raw.crmFilterCompany ? raw.crmFilterCompany : "all",
    crmFilterRole:
      typeof raw?.crmFilterRole === "string" && raw.crmFilterRole ? raw.crmFilterRole : "all",
    crmFilterStage:
      typeof raw?.crmFilterStage === "string" && raw.crmFilterStage ? raw.crmFilterStage : "all",
    crmFilterVerdict:
      typeof raw?.crmFilterVerdict === "string" && raw.crmFilterVerdict ? raw.crmFilterVerdict : "all",
    crmFilterDecision:
      typeof raw?.crmFilterDecision === "string" && raw.crmFilterDecision ? raw.crmFilterDecision : "all",
    crmSort: { field: sortField, dir: sortDir },
    crmDatePreset: datePreset,
    crmDateFrom: typeof raw?.crmDateFrom === "string" ? raw.crmDateFrom : "",
    crmDateTo: typeof raw?.crmDateTo === "string" ? raw.crmDateTo : "",
    crmFieldFilters: cleanStringRecord(raw?.crmFieldFilters) as CrmFieldFilters,
    tableColFilters: cleanAnyRecord(raw?.tableColFilters),
    kanbanColSearch: cleanStringRecord(raw?.kanbanColSearch),
    kanbanColSort: cleanKanbanSortRecord(raw?.kanbanColSort),
    kanbanColFilter: cleanKanbanFilterRecord(raw?.kanbanColFilter),
    updatedAt: typeof raw?.updatedAt === "number" && Number.isFinite(raw.updatedAt) ? raw.updatedAt : undefined,
  };
}

export function compactCrmFiltersForStorage(
  filters: PersistedCrmFilters,
  updatedAt?: number
): Record<string, any> {
  const norm = normalizePersistedCrmFilters(filters);
  const compact: Record<string, any> = {};

  if (norm.crmViewMode !== "kanban") compact.crmViewMode = norm.crmViewMode;
  if (norm.crmSearch) compact.crmSearch = norm.crmSearch;
  if (norm.crmFilterCompany !== "all") compact.crmFilterCompany = norm.crmFilterCompany;
  if (norm.crmFilterRole !== "all") compact.crmFilterRole = norm.crmFilterRole;
  if (norm.crmFilterStage !== "all") compact.crmFilterStage = norm.crmFilterStage;
  if (norm.crmFilterVerdict !== "all") compact.crmFilterVerdict = norm.crmFilterVerdict;
  if (norm.crmFilterDecision !== "all") compact.crmFilterDecision = norm.crmFilterDecision;
  if (norm.crmSort.field !== "created" || norm.crmSort.dir !== "desc") compact.crmSort = norm.crmSort;
  if (norm.crmDatePreset !== "all") compact.crmDatePreset = norm.crmDatePreset;
  if (norm.crmDateFrom) compact.crmDateFrom = norm.crmDateFrom;
  if (norm.crmDateTo) compact.crmDateTo = norm.crmDateTo;
  if (Object.keys(norm.crmFieldFilters).length > 0) compact.crmFieldFilters = norm.crmFieldFilters;
  if (Object.keys(norm.tableColFilters).length > 0) compact.tableColFilters = norm.tableColFilters;
  if (Object.keys(norm.kanbanColSearch).length > 0) compact.kanbanColSearch = norm.kanbanColSearch;
  if (Object.keys(norm.kanbanColSort).length > 0) compact.kanbanColSort = norm.kanbanColSort;
  if (Object.keys(norm.kanbanColFilter).length > 0) compact.kanbanColFilter = norm.kanbanColFilter;

  const ts = updatedAt ?? norm.updatedAt;
  if (typeof ts === "number" && Number.isFinite(ts)) {
    compact.updatedAt = ts;
  }
  return compact;
}

export function serializeCrmFiltersSignature(filters: PersistedCrmFilters): string {
  return JSON.stringify(compactCrmFiltersForStorage(filters, 0));
}

export function readLocalCrmFilters(employerId?: string | null): PersistedCrmFilters | null {
  try {
    const raw = localStorage.getItem(getCrmFiltersStorageKey(employerId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return normalizePersistedCrmFilters(parsed);
  } catch {
    return null;
  }
}

export function writeLocalCrmFilters(
  employerId: string | null | undefined,
  filters: PersistedCrmFilters,
  updatedAt?: number
): void {
  try {
    const compact = compactCrmFiltersForStorage(filters, updatedAt);
    localStorage.setItem(getCrmFiltersStorageKey(employerId), JSON.stringify(compact));
  } catch {
    // ignore storage quota failures
  }
}

export function shouldApplyServerCrmFilters(
  local: PersistedCrmFilters | null,
  serverRaw: any
): boolean {
  if (!serverRaw || typeof serverRaw !== "object") return false;
  const server = normalizePersistedCrmFilters(serverRaw);
  if (!local) return true;
  const serverTs = Number(server.updatedAt || 0);
  const localTs = Number(local.updatedAt || 0);
  if (serverTs === 0 && localTs === 0) {
    return serializeCrmFiltersSignature(server) !== serializeCrmFiltersSignature(DEFAULT_PERSISTED_CRM_FILTERS);
  }
  return serverTs >= localTs;
}
