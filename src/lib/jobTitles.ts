export type JobTitle = {
  id: string;
  title: string;
  usage_count: number;
  is_basic: boolean;
  company_name?: string;
  created_by?: string;
};

let cache: JobTitle[] | null = null;

/**
 * Load the shared job titles catalog.
 * Deduplicates titles keeping the latest created entry.
 * Falls back to the hard-coded BASIC_SPECIALTIES list on network failure.
 */
export async function fetchJobTitles(force = false): Promise<JobTitle[]> {
  if (cache && !force) return cache;
  try {
    const res = await fetch("/api/job-titles");
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json().catch(() => null);
    if (Array.isArray(data) && data.length > 0) {
      const map = new Map<string, JobTitle>();
      for (const item of data) {
        const key = (item.title || "").trim().toLowerCase();
        if (key) map.set(key, item);
      }
      cache = Array.from(map.values());
      return cache;
    }
  } catch (err) {
    console.warn("Failed to fetch job titles from /api/job-titles:", err);
  }

  return cache || [];
}

/**
 * Upsert a title (or bump its usage_count if it already exists). Returns the
 * canonical row. Drops the local cache so the next read shows the updated list.
 */
export async function upsertJobTitle(title: string, companyName?: string, createdBy?: string): Promise<JobTitle | null> {
  const t = (title || "").trim();
  if (!t) return null;
  try {
    const res = await fetch("/api/job-titles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: t, company_name: companyName, created_by: createdBy }),
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    cache = null;
    return data as JobTitle;
  } catch (err) {
    console.warn("upsertJobTitle failed", err);
    return null;
  }
}

export function invalidateJobTitlesCache() {
  cache = null;
}

/**
  * Delete a job title by ID from the database catalog.
  */
export async function deleteJobTitle(id: string): Promise<boolean> {
  if (!id) return false;
  try {
    const res = await fetch(`/api/job-titles/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    cache = null;
    return true;
  } catch (err) {
    console.warn("deleteJobTitle failed", err);
    return false;
  }
}