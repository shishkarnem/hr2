import https from "https";

export const PROTALK_CONFIG = {
  proxyUrl: process.env.PROTALK_DB_PROXY_URL || "https://db.pro-talk.ru/api/proxy/query",
  userId: process.env.PROTALK_USER_ID || "recTWyxN1GrSPlSxc",
  database: process.env.PROTALK_DATABASE || "hr3",
  mcpUrl: "https://db.pro-talk.ru/api/databases/hr3/mcp",
};

export interface QueryResult<T = any> {
  rows: T[];
  rowCount: number;
}

export async function executeProTalkQuery<T = any>(
  sql: string,
  params: any[] = [],
  retryCount = 2
): Promise<QueryResult<T>> {
  let transformedSql = sql;
  let transformedParams = [...params];

  if (transformedSql.includes("?")) {
    let paramIndex = 1;
    transformedSql = transformedSql.replace(/\?/g, () => `$${paramIndex++}`);
  }

  transformedSql = transformedSql
    .replace(/datetime\('now',\s*'\+3 hours'\)/gi, "(NOW() + INTERVAL '3 hours')")
    .replace(/datetime\('now'\)/gi, "NOW()")
    .replace(/date\('now'\)/gi, "CURRENT_DATE");

  transformedParams = transformedParams.map((val) => {
    if (val === undefined) return null;
    if (val !== null && typeof val === "object" && !(val instanceof Date)) {
      return JSON.stringify(val);
    }
    return val;
  });

  const payload = JSON.stringify({
    database: PROTALK_CONFIG.database,
    query: transformedSql,
    params: transformedParams,
    safeMode: false,
  });

  return new Promise((resolve, reject) => {
    const doRequest = (attemptsLeft: number) => {
      const req = https.request(
        PROTALK_CONFIG.proxyUrl,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-User-Id": PROTALK_CONFIG.userId,
          },
          timeout: 30000,
        },
        (res) => {
          let body = "";
          res.on("data", (chunk) => (body += chunk));
          res.on("end", () => {
            try {
              const data = JSON.parse(body);
              if (data.error) {
                if (attemptsLeft > 0 && (res.statusCode || 0) >= 500) {
                  setTimeout(() => doRequest(attemptsLeft - 1), 300);
                  return;
                }
                const err = new Error(`[ProTalk PG Error] ${data.error}${data.message ? ": " + data.message : ""}`);
                (err as any).code = data.code;
                reject(err);
              } else {
                resolve({
                  rows: data.rows || [],
                  rowCount: data.rowCount !== undefined ? data.rowCount : (data.rows || []).length,
                });
              }
            } catch {
              if (attemptsLeft > 0) {
                setTimeout(() => doRequest(attemptsLeft - 1), 300);
                return;
              }
              reject(new Error(`Failed to parse ProTalk response: ${body.substring(0, 200)}`));
            }
          });
        }
      );

      req.on("error", (err) => {
        if (attemptsLeft > 0) {
          setTimeout(() => doRequest(attemptsLeft - 1), 500);
          return;
        }
        reject(err);
      });

      req.on("timeout", () => {
        req.destroy();
        if (attemptsLeft > 0) {
          setTimeout(() => doRequest(attemptsLeft - 1), 500);
          return;
        }
        reject(new Error("ProTalk query timeout (30s)"));
      });

      req.write(payload);
      req.end();
    };

    doRequest(retryCount);
  });
}

export async function queryAllPg<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  const result = await executeProTalkQuery<T>(sql, params);
  return result.rows;
}

export async function queryGetPg<T = any>(sql: string, params: any[] = []): Promise<T | null> {
  const result = await executeProTalkQuery<T>(sql, params);
  return result.rows.length > 0 ? result.rows[0] : null;
}

export async function queryRunPg(
  sql: string,
  params: any[] = []
): Promise<{ lastID: number; changes: number }> {
  let finalSql = sql;
  const isInsert = /^\s*insert\s+into/i.test(finalSql);
  if (isInsert && !/returning/i.test(finalSql)) {
    finalSql += " RETURNING id";
  }

  const result = await executeProTalkQuery(finalSql, params);
  let lastID = 0;
  if (result.rows.length > 0 && result.rows[0].id !== undefined) {
    lastID = Number(result.rows[0].id) || 0;
  }
  return {
    lastID,
    changes: result.rowCount,
  };
}

export async function getProTalkTables(): Promise<string[]> {
  const res = await queryAllPg<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;`
  );
  return res.map((r) => r.table_name);
}

export async function exportProTalkDatabaseJson(): Promise<{
  meta: any;
  tables: Record<string, any[]>;
  totalRows: number;
  tablesCount: number;
}> {
  const tables = await getProTalkTables();
  const tablesData: Record<string, any[]> = {};
  let totalRows = 0;

  const CHUNK_SIZE = 10;
  for (let i = 0; i < tables.length; i += CHUNK_SIZE) {
    const chunk = tables.slice(i, i + CHUNK_SIZE);
    await Promise.all(
      chunk.map(async (table) => {
        try {
          const rows = await queryAllPg(`SELECT * FROM "${table}"`);
          tablesData[table] = rows || [];
        } catch {
          tablesData[table] = [];
        }
      })
    );
  }

  for (const t of tables) {
    totalRows += (tablesData[t] || []).length;
  }

  const now = new Date();
  const mskTime = new Date(now.getTime() + 3 * 3600 * 1000);
  const mskTimeStr = mskTime.toISOString().replace("T", " ").substring(0, 19) + " MSK";

  return {
    meta: {
      app: "Робот Рекрутер (HR-RR)",
      database: PROTALK_CONFIG.database,
      engine: "PostgreSQL ProTalk Cloud",
      version: await getAppVersionPg().catch(() => "v.2.30"),
      exportedAt: now.getTime(),
      exportedAtMSK: mskTimeStr,
      totalRows,
      tablesCount: tables.length,
    },
    tables: tablesData,
    totalRows,
    tablesCount: tables.length,
  };
}

export async function exportProTalkDatabaseSql(existingTablesData?: Record<string, any[]>): Promise<string> {
  let tablesData = existingTablesData;
  if (!tablesData) {
    const jsonDump = await exportProTalkDatabaseJson();
    tablesData = jsonDump.tables;
  }

  const now = new Date();
  const mskTime = new Date(now.getTime() + 3 * 3600 * 1000);
  const mskTimeStr = mskTime.toISOString().replace("T", " ").substring(0, 19) + " MSK";

  const lines: string[] = [
    `-- ========================================================`,
    `-- PostgreSQL BD ProTalk Database Dump: ${PROTALK_CONFIG.database}`,
    `-- Exported At (MSK): ${mskTimeStr}`,
    `-- Engine: PostgreSQL 16 (ProTalk Cloud)`,
    `-- ========================================================`,
    `SET client_encoding = 'UTF8';`,
    `SET standard_conforming_strings = on;`,
    ``,
  ];

  for (const [table, rows] of Object.entries(tablesData)) {
    if (!rows || rows.length === 0) continue;

    lines.push(`-- Table: ${table} (${rows.length} rows)`);
    lines.push(`DELETE FROM "${table}";`);

    const cols = Object.keys(rows[0]);
    const quotedCols = cols.map((c) => `"${c}"`).join(", ");

    const BATCH = 50;
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH);
      const valRows = batch.map((row) => {
        const vals = cols.map((c) => {
          const v = row[c];
          if (v === null || v === undefined) return "NULL";
          if (typeof v === "number") return String(v);
          if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
          const str = typeof v === "object" ? JSON.stringify(v) : String(v);
          return `'${str.replace(/'/g, "''")}'`;
        });
        return `(${vals.join(", ")})`;
      });

      lines.push(`INSERT INTO "${table}" (${quotedCols}) VALUES \n  ${valRows.join(",\n  ")};`);
    }
    lines.push(``);
  }

  return lines.join("\n");
}

export async function ensureSystemSettingsPg(): Promise<void> {
  try {
    await executeProTalkQuery(`
      CREATE TABLE IF NOT EXISTS system_settings (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
  } catch (err: any) {
    console.warn("[BD ProTalk] ensureSystemSettingsPg notice:", err?.message);
  }
}

let cachedAppVersion = "";
let cachedAppVersionTs = 0;

export async function getAppVersionPg(force = false): Promise<string> {
  const now = Date.now();
  if (!force && now - cachedAppVersionTs < 15000 && cachedAppVersion) {
    return cachedAppVersion;
  }
  try {
    await ensureSystemSettingsPg();
    const row = await queryGetPg<{ value: string }>(
      `SELECT value FROM system_settings WHERE key = 'app_version' LIMIT 1`
    );
    if (row && row.value && String(row.value).trim()) {
      cachedAppVersion = String(row.value).trim();
      cachedAppVersionTs = now;
      return cachedAppVersion;
    }
  } catch {}
  return cachedAppVersion || "v.2.30";
}

export async function setAppVersionPg(newVersion: string): Promise<string> {
  const clean = String(newVersion || "").trim();
  if (!clean) throw new Error("App version cannot be empty");
  await ensureSystemSettingsPg();
  await executeProTalkQuery(
    `INSERT INTO system_settings (key, value, updated_at) VALUES ($1, $2, NOW()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();`,
    ["app_version", clean]
  );
  cachedAppVersion = clean;
  cachedAppVersionTs = Date.now();
  return clean;
}

const IDENTITY_SEQ_TABLES = new Set([
  "candidate_checklist_answers_v2",
  "candidate_scores",
  "candidate_situations_answers_v2",
  "candidate_stage_progress",
  "crm_constructor_settings",
  "file_folders",
  "file_storage",
  "logs",
  "notification_reads",
  "rate_limits",
  "transaction_telegram_notifications",
]);

function getConflictTargetForTable(tableName: string, cols: string[]): string | null {
  if (tableName === "system_settings" && cols.includes("key")) return `"key"`;
  if (tableName === "protalk_prompts" && cols.includes("prompt_key")) return `"prompt_key"`;
  if (tableName === "rate_limits" && cols.includes("key")) return `"key"`;
  if (tableName === "notification_reads" && cols.includes("item_id") && cols.includes("user_id")) {
    return `"item_id", "user_id"`;
  }
  if (tableName === "transaction_telegram_notifications" && cols.includes("transaction_id")) {
    return `"transaction_id"`;
  }
  if (tableName === "candidate_stage_progress" && cols.includes("candidate_id") && cols.includes("stage")) {
    return `"candidate_id", "stage"`;
  }
  if (tableName === "candidate_checklist_answers_v2" && cols.includes("candidate_id") && cols.includes("project_id")) {
    return `"candidate_id", "project_id"`;
  }
  if (tableName === "candidate_situations_answers_v2" && cols.includes("candidate_id") && cols.includes("project_id")) {
    return `"candidate_id", "project_id"`;
  }
  if (tableName === "candidate_scores" && cols.includes("candidate_id")) {
    return `"candidate_id"`;
  }
  if (cols.includes("id")) return `"id"`;
  return null;
}

function getConflictClauseForTable(tableName: string, cols: string[], upsert = false): string {
  const target = getConflictTargetForTable(tableName, cols);
  if (!target) return `ON CONFLICT DO NOTHING`;
  if (!upsert) return `ON CONFLICT (${target}) DO NOTHING`;
  const targetCols = new Set(target.replace(/"/g, "").split(",").map((s) => s.trim()));
  const updateCols = cols.filter((c) => !targetCols.has(c));
  if (updateCols.length === 0) return `ON CONFLICT (${target}) DO NOTHING`;
  const sets = updateCols.map((c) => `"${c}" = EXCLUDED."${c}"`).join(", ");
  return `ON CONFLICT (${target}) DO UPDATE SET ${sets}`;
}

function stripNestedDataJson(val: any): any {
  if (val === null || val === undefined) return val;
  if (typeof val === "string") {
    const trimmed = val.trim();
    if (!trimmed.startsWith("{")) return val;
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && "data_json" in parsed) {
        const cleaned = { ...parsed };
        delete cleaned.data_json;
        return JSON.stringify(cleaned);
      }
    } catch {}
    return val;
  }
  if (typeof val === "object" && !Array.isArray(val) && "data_json" in val) {
    const cleaned = { ...val };
    delete cleaned.data_json;
    return JSON.stringify(cleaned);
  }
  return val;
}

const TABLE_COLUMN_SYNONYMS: Record<string, Array<[string, string]>> = {
  projects: [
    ["training_prof_text", "training_professional_text"],
    ["training_system_text", "training_systems_text"],
    ["max_interviews", "interview_limit"],
    ["max_trainings", "training_limit"],
    ["slug", "role_slug"],
  ],
  training_blocks: [
    ["materials_md", "content"],
    ["stage", "block_key"],
  ],
  training_stage_tests: [
    ["questions_json", "questions"],
    ["pass_score", "passing_score"],
  ],
  file_storage: [
    ["name", "filename"],
    ["original_url", "url"],
    ["file_size", "size_bytes"],
  ],
  employers: [
    ["name", "contact_name"],
    ["email", "contact_email"],
    ["phone", "contact_phone"],
    ["telegram_username", "contact_telegram"],
  ],
  companies: [
    ["employer_id", "owner_employer_id"],
  ],
};

function normalizeRowForRestore(tableName: string, rawRow: Record<string, any>): Record<string, any> {
  const row: Record<string, any> = { ...rawRow };
  if ("data_json" in row && row.data_json != null) {
    row.data_json = stripNestedDataJson(row.data_json);
  }
  const pairs = TABLE_COLUMN_SYNONYMS[tableName] || [];
  for (const [a, b] of pairs) {
    const hasA = row[a] !== undefined && row[a] !== null && String(row[a]).trim() !== "";
    const hasB = row[b] !== undefined && row[b] !== null && String(row[b]).trim() !== "";
    if (hasA && !hasB) row[b] = row[a];
    else if (hasB && !hasA) row[a] = row[b];
  }
  if (tableName === "file_storage") {
    if (row.filename === undefined || row.filename === null || String(row.filename).trim() === "") {
      row.filename = row.name || row.file_key || "file.png";
    }
    if (row.name === undefined || row.name === null || String(row.name).trim() === "") {
      row.name = row.filename;
    }
    if (row.url === undefined || row.url === null || String(row.url).trim() === "") {
      row.url = row.original_url || `/files/${row.id || 1}/file.png`;
    }
    if (row.original_url === undefined || row.original_url === null || String(row.original_url).trim() === "") {
      row.original_url = row.url;
    }
    if (row.mime_type === undefined || row.mime_type === null || String(row.mime_type).trim() === "") {
      row.mime_type = "application/octet-stream";
    }
    if (row.size_bytes === undefined || row.size_bytes === null || row.size_bytes === "") {
      row.size_bytes = Number(row.file_size || 0);
    }
    if (row.file_size === undefined || row.file_size === null || row.file_size === "") {
      row.file_size = Number(row.size_bytes || 0);
    }
    if (row.preserve_alpha === undefined || row.preserve_alpha === null) {
      row.preserve_alpha = false;
    }
  }
  return row;
}

function formatPgDateLiteral(val: any, notNull: boolean): string {
  if (val === null || val === undefined || String(val).trim() === "") {
    return notNull ? "NOW()" : "NULL";
  }
  if (typeof val === "number" && Number.isFinite(val)) {
    const ms = val < 1e11 ? val * 1000 : val;
    const d = new Date(ms);
    if (!isNaN(d.getTime())) return `'${d.toISOString()}'`;
  }
  const trimmed = typeof val === "object" ? JSON.stringify(val) : String(val).trim();
  if (/^\d{10,13}$/.test(trimmed)) {
    const num = Number(trimmed);
    const ms = num < 1e11 ? num * 1000 : num;
    const d = new Date(ms);
    if (!isNaN(d.getTime())) return `'${d.toISOString()}'`;
  }
  const parsedMs = Date.parse(trimmed);
  if (!isNaN(parsedMs)) {
    return `'${new Date(parsedMs).toISOString()}'`;
  }
  return notNull ? "NOW()" : "NULL";
}

function buildValueTupleSql(
  row: Record<string, any>,
  validCols: string[],
  pgCols: Map<string, { isNum: boolean; isInt: boolean; isDate: boolean; isBool: boolean; notNull: boolean }>
): string {
  const colVals: string[] = [];
  for (const col of validCols) {
    const val = row[col];
    const meta = pgCols.get(col);

    if (meta?.isNum) {
      const num = Number(val);
      if (val === "" || val === null || val === undefined || isNaN(num) || !Number.isFinite(num)) {
        colVals.push(meta.notNull ? "0" : "NULL");
      } else {
        colVals.push(String(meta.isInt ? Math.round(num) : num));
      }
    } else if (meta?.isBool) {
      const s = String(val ?? "").trim().toLowerCase();
      const bVal = val === 1 || val === true || ["1", "1.0", "true", "t", "yes"].includes(s);
      colVals.push(bVal ? "TRUE" : "FALSE");
    } else if (meta?.isDate) {
      colVals.push(formatPgDateLiteral(val, meta.notNull));
    } else if (val === null || val === undefined) {
      colVals.push(meta?.notNull ? "''" : "NULL");
    } else {
      const strVal = typeof val === "object" ? JSON.stringify(val) : String(val);
      colVals.push(`'${strVal.replace(/'/g, "''")}'`);
    }
  }
  return `(${colVals.join(", ")})`;
}

export async function restoreProTalkDatabaseJson(
  tables: Record<string, any[]>,
  options: { clearBeforeInsert?: boolean; upsertOnConflict?: boolean } = {}
): Promise<Record<string, number>> {
  const summary: Record<string, number> = {};
  const clearBeforeInsert = options.clearBeforeInsert !== false;
  const upsertOnConflict = options.upsertOnConflict ?? !clearBeforeInsert;

  const allPgColsMap: Record<
    string,
    Map<string, { isNum: boolean; isInt: boolean; isDate: boolean; isBool: boolean; notNull: boolean }>
  > = {};
  const colRes = await executeProTalkQuery(
    `SELECT table_name, column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema = 'public';`,
    []
  );
  for (const r of colRes.rows || []) {
    if (!allPgColsMap[r.table_name]) allPgColsMap[r.table_name] = new Map();
    const dt = (r.data_type || "").toLowerCase();
    const isInt = ["bigint", "integer", "smallint"].includes(dt);
    const isNum = isInt || ["numeric", "double precision", "real"].includes(dt);
    const isDate = ["timestamp with time zone", "timestamp without time zone", "date"].includes(dt);
    const isBool = ["boolean"].includes(dt);
    const notNull = r.is_nullable === "NO";
    allPgColsMap[r.table_name].set(r.column_name, { isNum, isInt, isDate, isBool, notNull });
  }

  const entries = Object.entries(tables).filter(([, rows]) => Array.isArray(rows) && rows.length > 0);
  const CONCURRENCY = 3;

  const restoreSingleTable = async (tableName: string, rawRows: any[]) => {
    if (!/^[a-zA-Z0-9_]+$/.test(tableName)) return;
    const pgCols = allPgColsMap[tableName];
    if (!pgCols || pgCols.size === 0) return;

    let normalizedRows = rawRows
      .filter((r) => r && typeof r === "object")
      .map((r) => normalizeRowForRestore(tableName, r));

    if (tableName === "transaction_telegram_notifications") {
      const seenTx = new Set<string>();
      const dedupedRows: any[] = [];
      for (const r of normalizedRows) {
        const txKey = r.transaction_id != null ? String(r.transaction_id).trim() : "";
        if (!txKey) continue;
        if (seenTx.has(txKey)) continue;
        seenTx.add(txKey);
        dedupedRows.push(r);
      }
      normalizedRows = dedupedRows;
    }

    if (normalizedRows.length === 0) {
      summary[tableName] = 0;
      return;
    }

    // Union keys across ALL rows in the batch and add any missing legacy columns safely as TEXT
    const keySet = new Set<string>();
    for (const r of normalizedRows) {
      for (const k of Object.keys(r)) {
        if (/^[a-z][a-z0-9_]{0,62}$/i.test(k)) keySet.add(k);
      }
    }

    const missingCols = Array.from(keySet).filter((k) => !pgCols.has(k));
    if (missingCols.length > 0) {
      for (const mc of missingCols) {
        try {
          await executeProTalkQuery(`ALTER TABLE "${tableName}" ADD COLUMN IF NOT EXISTS "${mc}" TEXT;`);
          pgCols.set(mc, { isNum: false, isInt: false, isDate: false, isBool: false, notNull: false });
        } catch {}
      }
    }

    const validCols = Array.from(keySet).filter((k) => pgCols.has(k));
    if (validCols.length === 0) return;

    // Take rollback snapshot before clearing if table currently has modest size (<= 5000 rows)
    let previousSnapshot: any[] | null = null;
    if (clearBeforeInsert) {
      try {
        const cntRow = await queryGetPg<{ c: string | number }>(`SELECT COUNT(*) AS c FROM "${tableName}";`);
        const curCnt = Number(cntRow?.c || 0);
        if (curCnt > 0 && curCnt <= 5000) {
          previousSnapshot = await queryAllPg(`SELECT * FROM "${tableName}";`);
        }
      } catch {}
      await executeProTalkQuery(`DELETE FROM "${tableName}";`);
    }

    const isIdentity = IDENTITY_SEQ_TABLES.has(tableName);
    const conflictClause = getConflictClauseForTable(tableName, validCols, upsertOnConflict);
    const quotedCols = validCols.map((c) => `"${c}"`).join(", ");
    const overridingSql = isIdentity && validCols.includes("id") ? `OVERRIDING SYSTEM VALUE ` : "";

    const insertRowList = async (batch: Record<string, any>[]): Promise<number> => {
      const tuples = batch.map((r) => buildValueTupleSql(r, validCols, pgCols));
      const sql = `INSERT INTO "${tableName}" (${quotedCols}) ${overridingSql}VALUES \n  ${tuples.join(",\n  ")} ${conflictClause};`;
      await executeProTalkQuery(sql, []);
      return batch.length;
    };

    let importedCount = 0;
    let currentBatch: Record<string, any>[] = [];
    let currentBytes = 0;
    const MAX_BATCH_BYTES = 85000;
    const MAX_BATCH_ROWS = 25;

    const flushBatch = async (batch: Record<string, any>[]) => {
      if (batch.length === 0) return;
      try {
        importedCount += await insertRowList(batch);
      } catch (batchErr: any) {
        if (batch.length === 1) {
          console.warn(`[Restore ${tableName}] Skipping malformed row:`, batchErr?.message);
          return;
        }
        // Row-by-row fallback so 1 incompatible row never fails the rest of the table
        for (const singleRow of batch) {
          try {
            importedCount += await insertRowList([singleRow]);
          } catch (rowErr: any) {
            console.warn(`[Restore ${tableName}] Row fallback error:`, rowErr?.message);
          }
        }
      }
    };

    try {
      for (const row of normalizedRows) {
        const estBytes = JSON.stringify(row).length;
        if (
          currentBatch.length > 0 &&
          (currentBatch.length >= MAX_BATCH_ROWS || currentBytes + estBytes > MAX_BATCH_BYTES)
        ) {
          await flushBatch(currentBatch);
          currentBatch = [];
          currentBytes = 0;
        }
        currentBatch.push(row);
        currentBytes += estBytes;
      }
      if (currentBatch.length > 0) {
        await flushBatch(currentBatch);
      }
    } catch (fatalErr) {
      // Restore previous snapshot if clearing wiped the table and fatal error prevented progress
      if (clearBeforeInsert && previousSnapshot && previousSnapshot.length > 0 && importedCount === 0) {
        console.warn(`[Restore ${tableName}] Restoring previous snapshot due to fatal error.`);
        const snapCols = Object.keys(previousSnapshot[0]).filter((c) => pgCols.has(c));
        const snapQuoted = snapCols.map((c) => `"${c}"`).join(", ");
        const snapOverride = isIdentity && snapCols.includes("id") ? `OVERRIDING SYSTEM VALUE ` : "";
        for (let i = 0; i < previousSnapshot.length; i += 25) {
          const ch = previousSnapshot.slice(i, i + 25);
          const tups = ch.map((r) => buildValueTupleSql(r, snapCols, pgCols));
          await executeProTalkQuery(
            `INSERT INTO "${tableName}" (${snapQuoted}) ${snapOverride}VALUES ${tups.join(",")} ON CONFLICT DO NOTHING;`
          ).catch(() => {});
        }
      }
      throw fatalErr;
    }

    if (isIdentity) {
      const minVal = tableName === "file_storage" ? 158 : 1;
      await syncTableSequencePg(tableName, minVal);
    }

    summary[tableName] = importedCount;
  };

  for (let i = 0; i < entries.length; i += CONCURRENCY) {
    const chunk = entries.slice(i, i + CONCURRENCY);
    await Promise.all(chunk.map(([tbl, rows]) => restoreSingleTable(tbl, rows)));
  }

  return summary;
}

export async function syncCloudStateFromProTalkPg(): Promise<number> {
  // No local SQLite mirror to hydrate anymore — PG is queried directly.
  return 0;
}

export function cleanMojibakeText(input: any): string {
  if (input === null || input === undefined) return "";
  return String(input)
    .replace(/Дирек\uFFFD+ор по марк\uFFFD+тингу/gi, "Директор по маркетингу")
    .replace(/Р\uFFFD+нтРОП/gi, "РентРОП")
    .replace(/РнтРОП/g, "РентРОП")
    .replace(/\uFFFD+тдела/gi, "отдела")
    .replace(/отд\uFFFD+ла/gi, "отдела")
    .replace(/\uFFFD+/g, "")
    .trim();
}

export function cleanMojibakeDeep<T>(value: T): T {
  if (typeof value === "string") {
    return (value.includes("\uFFFD") || value.includes("РнтРОП")
      ? cleanMojibakeText(value)
      : value) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => cleanMojibakeDeep(item)) as unknown as T;
  }
  if (value && typeof value === "object") {
    const out: any = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = cleanMojibakeDeep(v);
    }
    return out;
  }
  return value;
}

let publicVacanciesCacheData: any[] | null = null;
let publicVacanciesCacheTs = 0;

export function getCachedPublicVacancies(ttlMs = 15000): any[] | null {
  if (publicVacanciesCacheData && Date.now() - publicVacanciesCacheTs < ttlMs) {
    return publicVacanciesCacheData;
  }
  return null;
}

export function setCachedPublicVacancies(rows: any[]): void {
  publicVacanciesCacheData = rows;
  publicVacanciesCacheTs = Date.now();
}

export function invalidatePublicVacanciesCache(): void {
  publicVacanciesCacheData = null;
  publicVacanciesCacheTs = 0;
}

export async function syncTableSequencePg(tableName: string, minVal = 1): Promise<void> {
  if (!/^[a-zA-Z0-9_]+$/.test(tableName)) return;
  const seqRes = await queryGetPg<{ seq: string | null }>(
    `SELECT pg_get_serial_sequence('"${tableName}"', 'id') AS seq;`
  ).catch(() => null);
  const seqName = seqRes?.seq || `${tableName}_id_seq`;
  await executeProTalkQuery(
    `SELECT setval('${seqName}', GREATEST(COALESCE((SELECT MAX(id) FROM "${tableName}"), 0), ${Number(minVal) || 1}), true);`
  ).catch(() => {});
}
