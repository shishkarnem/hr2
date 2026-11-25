// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import {
  DEFAULT_PERSISTED_CRM_FILTERS,
  compactCrmFiltersForStorage,
  getCrmFiltersStorageKey,
  normalizePersistedCrmFilters,
  readLocalCrmFilters,
  serializeCrmFiltersSignature,
  shouldApplyServerCrmFilters,
  writeLocalCrmFilters,
} from "../crmFiltersPersistence";

describe("crmFiltersPersistence", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("reads and writes compacted CRM filters per employerId", () => {
    const filters = {
      ...DEFAULT_PERSISTED_CRM_FILTERS,
      crmViewMode: "table" as const,
      crmSearch: "Алексей",
      crmFilterCompany: "РентРОП",
      crmFilterStage: "screening",
      crmFieldFilters: { city: "Москва" },
      tableColFilters: { overallScoreMin: 70 },
      kanbanColSearch: { screening: "Иван" },
    };

    writeLocalCrmFilters("emp100007", filters, 1700000000000);
    expect(getCrmFiltersStorageKey("emp100007")).toBe("crm_filters_v1_100007");

    const restored = readLocalCrmFilters("100007");
    expect(restored).not.toBeNull();
    expect(restored?.crmViewMode).toBe("table");
    expect(restored?.crmSearch).toBe("Алексей");
    expect(restored?.crmFilterCompany).toBe("РентРОП");
    expect(restored?.crmFilterStage).toBe("screening");
    expect(restored?.crmFieldFilters.city).toBe("Москва");
    expect(restored?.tableColFilters.overallScoreMin).toBe(70);
    expect(restored?.kanbanColSearch.screening).toBe("Иван");
    expect(restored?.updatedAt).toBe(1700000000000);
  });

  it("compacts defaults away and produces identical signatures regardless of timestamp", () => {
    const compactDefault = compactCrmFiltersForStorage(DEFAULT_PERSISTED_CRM_FILTERS);
    expect(Object.keys(compactDefault)).toEqual([]);

    const sig1 = serializeCrmFiltersSignature({
      ...DEFAULT_PERSISTED_CRM_FILTERS,
      crmFilterRole: "Менеджер",
      updatedAt: 100,
    });
    const sig2 = serializeCrmFiltersSignature({
      ...DEFAULT_PERSISTED_CRM_FILTERS,
      crmFilterRole: "Менеджер",
      updatedAt: 9999,
    });
    expect(sig1).toBe(sig2);
  });

  it("restores server filters after logout (empty localStorage) and prefers newer timestamp", () => {
    const serverPayload = compactCrmFiltersForStorage(
      {
        ...DEFAULT_PERSISTED_CRM_FILTERS,
        crmFilterVerdict: "good",
        crmDatePreset: "24h",
      },
      2000
    );

    // After logout localStorage is empty -> server filters must apply
    expect(shouldApplyServerCrmFilters(null, serverPayload)).toBe(true);

    // If local cache is newer than server -> keep local
    const newerLocal = normalizePersistedCrmFilters({
      crmFilterVerdict: "mid",
      updatedAt: 3000,
    });
    expect(shouldApplyServerCrmFilters(newerLocal, serverPayload)).toBe(false);

    // If server is newer than local -> apply server
    const olderLocal = normalizePersistedCrmFilters({
      crmFilterVerdict: "low",
      updatedAt: 1000,
    });
    expect(shouldApplyServerCrmFilters(olderLocal, serverPayload)).toBe(true);
  });
});
