/**
 * ProTalk PostgreSQL Cloud Client for "hr3" database.
 * Single source of truth: all backend queries run directly against ProTalk PostgreSQL.
 */

const PROTALK_PROXY_URL = process.env.PROTALK_DB_PROXY_URL || "https://db.pro-talk.ru/api/proxy/query";
const PROTALK_USER_ID = process.env.PROTALK_USER_ID || "recTWyxN1GrSPlSxc";
const DATABASE_NAME = process.env.PROTALK_DATABASE || "hr3";

let columnTypesCache: Record<string, Record<string, string>> | null = null;
let columnTypesLoadingPromise: Promise<Record<string, Record<string, string>>> | null = null;

export async function getPgColumnTypes(forceRefresh = false): Promise<Record<string, Record<string, string>>> {
  if (columnTypesCache && !forceRefresh) return columnTypesCache;
  if (columnTypesLoadingPromise && !forceRefresh) return columnTypesLoadingPromise;
  columnTypesLoadingPromise = (async () => {
    try {
      const res = await queryPgRaw(
        "SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema = 'public';"
      );
      const map: Record<string, Record<string, string>> = {};
      for (const r of res.rows || []) {
        if (!map[r.table_name]) map[r.table_name] = {};
        map[r.table_name][r.column_name] = r.data_type;
      }
      columnTypesCache = map;
      return map;
    } catch (err) {
      console.warn("[PgClient] Failed loading column types cache:", err);
      return columnTypesCache || {};
    } finally {
      columnTypesLoadingPromise = null;
    }
  })();
  return columnTypesLoadingPromise;
}

export function getCachedPgColumnTypes(): Record<string, Record<string, string>> {
  return columnTypesCache || {};
}

export interface PgTableColumnMeta {
  name: string;
  type: string;
  notnull: number;
}

export async function getPgTableMeta(tableName: string): Promise<{
  columns: PgTableColumnMeta[];
  colTypes: Record<string, string>;
}> {
  if (!/^[a-zA-Z0-9_]+$/.test(tableName)) {
    return { columns: [], colTypes: {} };
  }
  const res = await queryPgRaw(
    `SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position;`,
    [tableName]
  );
  const columns: PgTableColumnMeta[] = (res.rows || []).map((r: any) => ({
    name: String(r.column_name),
    type: String(r.data_type || "text"),
    notnull: r.is_nullable === "NO" ? 1 : 0,
  }));
  const colTypes: Record<string, string> = {};
  for (const c of columns) {
    colTypes[c.name] = c.type;
  }
  return { columns, colTypes };
}

export async function queryPgRaw(sql: string, params: any[] = []): Promise<{ rows: any[]; rowCount: number }> {
  let attempts = 0;
  const maxAttempts = 2;

  while (attempts < maxAttempts) {
    attempts++;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      const res = await fetch(PROTALK_PROXY_URL, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "X-User-Id": PROTALK_USER_ID,
        },
        body: JSON.stringify({
          database: DATABASE_NAME,
          query: sql,
          params,
          safeMode: false,
        }),
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`[PgClient] HTTP ${res.status}: ${text.slice(0, 300)}`);
      }

      const json = await res.json();
      if (json.error) {
        throw new Error(`[PgClient] Error in query "${sql.substring(0, 90)}...": ${json.error}`);
      }

      return {
        rows: json.rows || [],
        rowCount: json.rowCount != null ? json.rowCount : (json.rows ? json.rows.length : 0),
      };
    } catch (err: any) {
      if (attempts >= maxAttempts) {
        throw err;
      }
      await new Promise((r) => setTimeout(r, 250));
    }
  }

  return { rows: [], rowCount: 0 };
}

function inferConflictColumn(tableName: string, cols: string[]): string | null {
  if (tableName === "system_settings" && cols.includes("key")) return "key";
  if (tableName === "protalk_prompts" && cols.includes("prompt_key")) return "prompt_key";
  if (tableName === "rate_limits" && cols.includes("key")) return "key";
  if (tableName === "transaction_telegram_notifications" && cols.includes("transaction_id")) return "transaction_id";
  if (tableName === "notification_reads" && cols.includes("item_id") && cols.includes("user_id")) {
    return "item_id, user_id";
  }
  if (tableName === "candidate_stage_progress" && cols.includes("candidate_id") && cols.includes("stage")) {
    return "candidate_id, stage";
  }
  if (
    (tableName === "candidate_situations_answers_v2" || tableName === "candidate_checklist_answers_v2") &&
    cols.includes("candidate_id") &&
    cols.includes("project_id")
  ) {
    return "candidate_id, project_id";
  }
  if (tableName === "candidate_scores" && cols.includes("candidate_id")) return "candidate_id";
  if (tableName === "employer_tour_state" && cols.includes("user_id") && cols.includes("section")) {
    return "user_id, section";
  }
  if (tableName === "crm_constructor_settings" && cols.includes("employer_id")) return "employer_id";
  if (tableName === "crm_dialog_templates" && cols.includes("employer_id")) return "employer_id";
  if (tableName === "interview_systems" && cols.includes("project_id")) return "project_id";
  if (tableName === "interview_blocks" && cols.includes("project_id") && cols.includes("kind")) {
    return "project_id, kind";
  }
  if (tableName === "training_blocks" && cols.includes("project_id") && cols.includes("stage")) {
    return "project_id, stage";
  }
  if (tableName === "training_stage_tests" && cols.includes("project_id") && cols.includes("stage")) {
    return "project_id, stage";
  }
  if (tableName === "wallets" && cols.includes("employer_id")) return "employer_id";
  if (tableName === "file_storage") {
    if (cols.includes("id")) return "id";
    if (cols.includes("file_key")) return "file_key";
  }
  if (tableName === "system_crons") {
    if (cols.includes("id")) return "id";
    if (cols.includes("task_name")) return "task_name";
  }
  if (cols.includes("id")) return "id";
  if (cols.includes("key")) return "key";
  if (cols.includes("prompt_key")) return "prompt_key";
  return null;
}

const BIGINT_FILTER_COLS = new Set([
  "public_id",
  "company_public_id",
  "employer_public_id",
  "referrer_public_id",
  "referred_public_id",
  "referrer_id",
  "ref_by",
  "telegram_chat_id",
  "legacy_public_id",
]);

function rewriteWhereBigintEquality(sql: string): string {
  const whereIdx = sql.search(/\bWHERE\b/i);
  if (whereIdx === -1) return sql;
  const head = sql.slice(0, whereIdx);
  let tail = sql.slice(whereIdx);
  const colPattern = Array.from(BIGINT_FILTER_COLS).join("|");
  const re = new RegExp(`(?<![a-zA-Z0-9_."])((?:[a-zA-Z0-9_]+\\.)?(?:${colPattern}))\\s*=\\s*(\\$\\d+)`, "gi");
  tail = tail.replace(re, (_m, colExpr, paramExpr) => {
    return `CAST(${colExpr} AS TEXT) = CAST(${paramExpr} AS TEXT)`;
  });
  return head + tail;
}

export function translateQueryToPg(sql: string, rawParams: any[] = []): { sql: string; params: any[] } {
  let s = sql.trim();

  // 1. Emulate PRAGMA table_info("table")
  const pragmaMatch = s.match(/^PRAGMA\s+table_info\s*\(\s*["']?(\w+)["']?\s*\)/i);
  if (pragmaMatch) {
    const tbl = pragmaMatch[1];
    return {
      sql: `SELECT column_name as name, data_type as type, (CASE WHEN is_nullable = 'NO' THEN 1 ELSE 0 END) as notnull FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`,
      params: [tbl],
    };
  }

  // 2. Emulate PRAGMA table_list
  if (/^PRAGMA\s+table_list/i.test(s)) {
    return {
      sql: `SELECT table_name as name, 'table' as type FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`,
      params: [],
    };
  }

  // 3. Translate table catalog queries if needed
  if (/FROM\s+table_list/i.test(s)) {
    s = s.replace(/FROM\s+table_list/gi, "FROM information_schema.tables WHERE table_schema = 'public'");
  }

  // 4. Strip COLLATE NOCASE (SQLite-specific)
  s = s.replace(/\s+COLLATE\s+NOCASE\b/gi, "");

  // 5. Translate datetime('now') and date('now')
  s = s
    .replace(/datetime\('now',\s*'\+3 hours'\)/gi, "(NOW() + INTERVAL '3 hours')")
    .replace(/datetime\('now'\)/gi, "NOW()")
    .replace(/date\('now'\)/gi, "CURRENT_DATE");

  // 6. Translate SQLite 2-argument scalar MAX(a, b) -> GREATEST(a, b)
  s = s.replace(/\bMAX\s*\(([^,()]+),\s*([^()]+)\)/gi, "GREATEST($1, $2)");

  // 7. Translate INSERT OR IGNORE INTO
  if (/INSERT\s+OR\s+IGNORE\s+INTO/i.test(s)) {
    s = s.replace(/INSERT\s+OR\s+IGNORE\s+INTO/gi, "INSERT INTO");
    if (!/ON\s+CONFLICT/i.test(s)) {
      s = s.replace(/;?\s*$/, "") + " ON CONFLICT DO NOTHING";
    }
  }

  // 8. Translate INSERT OR REPLACE INTO -> INSERT INTO ... ON CONFLICT (...) DO UPDATE SET ...
  const replaceMatch = s.match(/^INSERT\s+OR\s+REPLACE\s+INTO\s+["']?([a-zA-Z0-9_]+)["']?\s*\(([^)]+)\)\s*VALUES/is);
  if (/INSERT\s+OR\s+REPLACE\s+INTO/i.test(s)) {
    s = s.replace(/INSERT\s+OR\s+REPLACE\s+INTO/gi, "INSERT INTO");
    if (!/ON\s+CONFLICT/i.test(s) && replaceMatch) {
      const tableName = replaceMatch[1];
      const cols = replaceMatch[2]
        .split(",")
        .map((c) => c.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean);
      const conflictCol = inferConflictColumn(tableName, cols);
      if (conflictCol) {
        const conflictSet = new Set(conflictCol.split(",").map((c) => c.trim()));
        const updateCols = cols.filter((c) => !conflictSet.has(c));
        const quotedConflict = conflictCol
          .split(",")
          .map((c) => `"${c.trim()}"`)
          .join(", ");
        if (updateCols.length > 0) {
          const setClause = updateCols.map((c) => `"${c}" = EXCLUDED."${c}"`).join(", ");
          s = s.replace(/;?\s*$/, "") + ` ON CONFLICT (${quotedConflict}) DO UPDATE SET ${setClause}`;
        } else {
          s = s.replace(/;?\s*$/, "") + ` ON CONFLICT (${quotedConflict}) DO NOTHING`;
        }
      } else {
        s = s.replace(/;?\s*$/, "") + " ON CONFLICT DO NOTHING";
      }
    }
  }

  // 9. Replace ? with $1, $2, ... (skipping single-quoted SQL string literals)
  const params: any[] = [];
  let pIdx = 1;
  let convertedSql = s.replace(/'(?:''|[^'])*'|\?/g, (match) => {
    if (match !== "?") return match;
    const rawVal = rawParams[pIdx - 1];
    let finalVal = rawVal;
    if (finalVal !== undefined && finalVal !== null && typeof finalVal === "object" && !(finalVal instanceof Date)) {
      finalVal = JSON.stringify(finalVal);
    }
    params.push(finalVal === undefined ? null : finalVal);
    return `$${pIdx++}`;
  });

  while (pIdx <= rawParams.length) {
    const rawVal = rawParams[pIdx - 1];
    let finalVal = rawVal;
    if (finalVal !== undefined && finalVal !== null && typeof finalVal === "object" && !(finalVal instanceof Date)) {
      finalVal = JSON.stringify(finalVal);
    }
    params.push(finalVal === undefined ? null : finalVal);
    pIdx++;
  }

  // 10. Make bigint equality filters safe when string UUID/slug values are passed
  convertedSql = rewriteWhereBigintEquality(convertedSql);

  return { sql: convertedSql, params };
}

export class PgDBWrapper {
  async getTableNames(): Promise<{ name: string }[]> {
    const rows = await this.all(
      "SELECT table_name as name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name"
    );
    return (rows || []).map((r: any) => ({ name: r.name }));
  }

  async tableExists(tableName: string): Promise<boolean> {
    const row = await this.get(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ? LIMIT 1",
      [tableName]
    );
    return Boolean(row);
  }

  async all(sql: string, params: any[] = []): Promise<any[]> {
    const { sql: pgSql, params: pgParams } = translateQueryToPg(sql, params);
    const res = await queryPgRaw(pgSql, pgParams);
    return res.rows;
  }

  async get(sql: string, params: any[] = []): Promise<any> {
    const { sql: pgSql, params: pgParams } = translateQueryToPg(sql, params);
    let queryWithLimit = pgSql.replace(/;+\s*$/, "");
    if (/^\s*SELECT/i.test(queryWithLimit) && !/LIMIT\s+\d+/i.test(queryWithLimit)) {
      queryWithLimit += " LIMIT 1";
    }
    const res = await queryPgRaw(queryWithLimit, pgParams);
    return res.rows[0] || null;
  }

  async run(sql: string, params: any[] = []): Promise<{ lastID: any; changes: number }> {
    const { sql: pgSql, params: pgParams } = translateQueryToPg(sql, params);
    let finalSql = pgSql;
    const insertMatch = finalSql.match(/^\s*INSERT\s+INTO\s+["']?([a-zA-Z0-9_]+)["']?/i);
    if (insertMatch && !/\bRETURNING\b/i.test(finalSql)) {
      const tbl = insertMatch[1];
      const types = getCachedPgColumnTypes();
      if (types[tbl]?.id) {
        finalSql = finalSql.replace(/;?\s*$/, "") + " RETURNING id";
      }
    }
    const res = await queryPgRaw(finalSql, pgParams);
    return {
      lastID: res.rows[0]?.id ?? 0,
      changes: res.rowCount,
    };
  }

  async exec(sql: string): Promise<void> {
    const clean = (sql || "").trim();
    if (!clean) return;
    if (/^(PRAGMA|BEGIN|COMMIT|ROLLBACK)\b/i.test(clean)) return;
    await queryPgRaw(clean, []);
  }

  getNativeDb(): null {
    return null;
  }

  save(): void {
    // ProTalk PostgreSQL persists automatically in cloud
  }
}

export type ProTalkDbWrapper = PgDBWrapper;
export const ProTalkDbWrapper = PgDBWrapper;

export async function syncWriteToPostgres(sql: string, params: any[] = []): Promise<void> {
  if (!sql) return;
  if (/^\s*(SELECT|PRAGMA|EXPLAIN|BEGIN|COMMIT|ROLLBACK|CREATE\s+TABLE|CREATE\s+INDEX|DROP\s+TABLE|ALTER\s+TABLE)/i.test(sql)) {
    return;
  }
  const { sql: pgSql, params: pgParams } = translateQueryToPg(sql, params);
  await queryPgRaw(pgSql, pgParams);
}

export const pgWrapper = new PgDBWrapper();

export async function getAll(sql: string, params: any[] = []): Promise<any[]> {
  return pgWrapper.all(sql, params);
}

export async function getOne(sql: string, params: any[] = []): Promise<any> {
  return pgWrapper.get(sql, params);
}

export async function runSql(sql: string, params: any[] = []): Promise<{ lastID: any; changes: number }> {
  return pgWrapper.run(sql, params);
}
