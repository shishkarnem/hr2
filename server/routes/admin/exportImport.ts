import { Router, Request, Response } from "express";
import JSZip from "jszip";
import {
  getProTalkDB,
  loadAllFromProTalkDB,
  normalizeAllSlugsInProTalkDB,
} from "../../db";
import {
  exportProTalkDatabaseJson,
  exportProTalkDatabaseSql,
  executeProTalkQuery,
  getProTalkTables,
  restoreProTalkDatabaseJson,
  getAppVersionPg,
  setAppVersionPg,
  invalidatePublicVacanciesCache,
} from "../../db/protalkDb";

export const adminExportImportRouter = Router();

function rowsToCSV(rows: any[]): string {
  if (!rows || rows.length === 0) return "";
  const keysSet = new Set<string>();
  for (const row of rows) {
    if (row && typeof row === "object") {
      Object.keys(row).forEach((k) => keysSet.add(k));
    }
  }
  const headers = Array.from(keysSet);
  const escapeCell = (val: any): string => {
    if (val === null || val === undefined) return "";
    let str = typeof val === "object" ? JSON.stringify(val) : String(val);
    if (str.includes('"') || str.includes(",") || str.includes("\n") || str.includes("\r")) {
      str = '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  };
  return [headers.map(escapeCell).join(","), ...rows.map((r) => headers.map((h) => escapeCell(r[h])).join(","))].join("\n");
}

function detectCsvDelimiter(firstLine: string): "," | ";" {
  let inQ = false;
  let commas = 0;
  let semis = 0;
  for (let i = 0; i < firstLine.length; i++) {
    const ch = firstLine[i];
    if (ch === '"') inQ = !inQ;
    else if (!inQ) {
      if (ch === ",") commas++;
      else if (ch === ";") semis++;
    }
  }
  return semis > commas ? ";" : ",";
}

function parseCSV(csvText: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines: string[][] = [];
  let currentField = "";
  let inQuotes = false;
  let currentRecord: string[] = [];
  const text = csvText.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const firstNewline = text.indexOf("\n");
  const delimiter = detectCsvDelimiter(firstNewline >= 0 ? text.slice(0, firstNewline) : text);

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];
    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          currentField += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        currentField += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      currentRecord.push(currentField);
      currentField = "";
    } else if (char === "\n") {
      currentRecord.push(currentField);
      currentField = "";
      if (currentRecord.some((f) => f.length > 0)) lines.push(currentRecord);
      currentRecord = [];
    } else {
      currentField += char;
    }
  }

  if (currentField.length > 0 || currentRecord.length > 0) {
    currentRecord.push(currentField);
    if (currentRecord.some((f) => f.length > 0)) lines.push(currentRecord);
  }
  if (lines.length === 0) return { headers: [], rows: [] };

  const headers = lines[0].map((h) => h.trim());
  const dataRows: Record<string, string>[] = [];
  for (let r = 1; r < lines.length; r++) {
    const rowCells = lines[r];
    const rowObj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      rowObj[h] = rowCells[idx] !== undefined ? rowCells[idx] : "";
    });
    dataRows.push(rowObj);
  }
  return { headers, rows: dataRows };
}

adminExportImportRouter.get("/export-csv/:tableName", async (req: Request, res: Response) => {
  try {
    const { tableName } = req.params;
    if (!/^[a-zA-Z0-9_]+$/.test(tableName)) {
      return res.status(400).json({ error: "Invalid table name" });
    }
    const db = await getProTalkDB();
    const rows = await db.all(`SELECT * FROM "${tableName}"`);
    const csvData = rowsToCSV(rows);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${tableName}.csv"`);
    return res.status(200).send(csvData);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

adminExportImportRouter.get("/export-all-csv-zip", async (_req: Request, res: Response) => {
  try {
    const db = await getProTalkDB();
    const tableNames = await getProTalkTables();
    const zip = new JSZip();

    for (const tName of tableNames) {
      const rows = await db.all(`SELECT * FROM "${tName}"`);
      zip.file(`${tName}.csv`, rowsToCSV(rows) || "");
    }

    const content = await zip.generateAsync({ type: "nodebuffer" });
    const timestamp = Date.now();
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="all_tables_csv_${timestamp}.zip"`);
    return res.status(200).send(content);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

adminExportImportRouter.get("/export-all-csv-json", async (_req: Request, res: Response) => {
  try {
    const db = await getProTalkDB();
    const tableNames = await getProTalkTables();
    const csvDump: Record<string, string> = {};

    for (const tName of tableNames) {
      const rows = await db.all(`SELECT * FROM "${tName}"`);
      csvDump[tName] = rowsToCSV(rows);
    }

    return res.json({
      exportedAt: new Date().toISOString(),
      tablesCount: Object.keys(csvDump).length,
      csvTables: csvDump,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

adminExportImportRouter.get("/export-all-dump", async (_req: Request, res: Response) => {
  try {
    const jsonDump = await exportProTalkDatabaseJson();
    const filename = `database_full_dump_${Date.now()}.json`;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.status(200).json(jsonDump);
  } catch (err: any) {
    console.error("[Export JSON Error]:", err);
    return res.status(500).json({ error: err.message });
  }
});

adminExportImportRouter.get("/export-sql-dump", async (_req: Request, res: Response) => {
  try {
    const sqlDump = await exportProTalkDatabaseSql();
    const filename = `database_dump_pg_${Date.now()}.sql`;
    res.setHeader("Content-Type", "application/sql; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.status(200).send(sqlDump);
  } catch (err: any) {
    console.error("[Export SQL Error]:", err);
    return res.status(500).json({ error: err.message });
  }
});

adminExportImportRouter.get("/export-all-zip", async (_req: Request, res: Response) => {
  try {
    const jsonDump = await exportProTalkDatabaseJson();
    const sqlDump = await exportProTalkDatabaseSql(jsonDump.tables);
    const timestamp = Date.now();

    const manifestText = [
      `PostgreSQL BD ProTalk Full Database Archive`,
      `Database: hr3`,
      `Exported: ${new Date().toISOString()}`,
      `Total Tables: ${jsonDump.tablesCount}`,
      `Total Rows: ${jsonDump.totalRows}`,
      ``,
      `Files included:`,
      `1. database_dump.sql  - PostgreSQL DDL & Data`,
      `2. database_dump.json - Complete structured JSON snapshot`,
      `3. MANIFEST.txt       - This summary file`,
    ].join("\n");

    const zip = new JSZip();
    zip.file(`database_dump_${timestamp}.sql`, sqlDump);
    zip.file(`database_dump_${timestamp}.json`, JSON.stringify(jsonDump, null, 2));
    zip.file("MANIFEST.txt", manifestText);

    const buffer = await zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
      compressionOptions: { level: 9 },
    });

    const filename = `protalk_full_backup_${timestamp}.zip`;
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.status(200).send(buffer);
  } catch (err: any) {
    console.error("[Export ZIP Error]:", err);
    return res.status(500).json({ error: err.message });
  }
});

adminExportImportRouter.post("/import-csv", async (req: Request, res: Response) => {
  try {
    const { tableName, csvText, clearBeforeInsert } = req.body || {};
    if (!tableName || !/^[a-zA-Z0-9_]+$/.test(String(tableName)) || !csvText) {
      return res.status(400).json({ error: "Valid tableName and csvText are required" });
    }

    const { headers, rows } = parseCSV(csvText);
    if (headers.length === 0 || rows.length === 0) {
      return res.status(400).json({ error: "CSV file is empty or missing valid headers/rows." });
    }

    const db = await getProTalkDB();
    const existingTables = await getProTalkTables();
    if (!existingTables.includes(tableName)) {
      const colDefs = headers
        .filter((k) => /^[a-zA-Z0-9_]+$/.test(k))
        .map((k) => `"${k}" TEXT${k === "id" ? " PRIMARY KEY" : ""}`)
        .join(", ");
      await executeProTalkQuery(`CREATE TABLE IF NOT EXISTS "${tableName}" (${colDefs});`);
    }

    const shouldClear = Boolean(clearBeforeInsert);
    const summary = await restoreProTalkDatabaseJson(
      { [tableName]: rows },
      { clearBeforeInsert: shouldClear, upsertOnConflict: !shouldClear }
    );
    invalidatePublicVacanciesCache();

    if (["projects", "companies", "employers", "all"].includes(tableName)) {
      await normalizeAllSlugsInProTalkDB(db).catch(() => {});
    }

    if (tableName === "notifications") {
      await db
        .run(`UPDATE notifications SET read_at = COALESCE(read_at, created_at, NOW()) WHERE read_at IS NULL`)
        .catch(() => {});
    }

    if (tableName === "notifications" || tableName === "transactions") {
      await db
        .run(
          `INSERT INTO transaction_telegram_notifications (transaction_id, chat_id, status, response_data, sent_at)
           SELECT id, 'imported', 'sent', '{"imported": true}', COALESCE(created_at, NOW()) FROM transactions
           ON CONFLICT (transaction_id) DO NOTHING`
        )
        .catch(() => {});
    }

    if (req.app.locals.db) {
      await loadAllFromProTalkDB(db, req.app.locals.db).catch(() => {});
    }

    return res.json({
      success: true,
      tableName,
      imported: summary[tableName] || 0,
      total: rows.length,
      headers,
      errors: [],
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

adminExportImportRouter.get("/app-version", async (_req: Request, res: Response) => {
  try {
    const version = await getAppVersionPg(true);
    return res.json({ success: true, version });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

adminExportImportRouter.post("/app-version", async (req: Request, res: Response) => {
  try {
    const rawVersion = req.body?.version;
    if (!rawVersion || typeof rawVersion !== "string" || !rawVersion.trim()) {
      return res.status(400).json({ error: "Укажите версию приложения" });
    }
    const saved = await setAppVersionPg(rawVersion.trim());
    return res.json({ success: true, version: saved });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

adminExportImportRouter.post("/import-all-dump", async (req: Request, res: Response) => {
  try {
    let tables: Record<string, any[]> | null = null;
    if (req.body?.tableName && Array.isArray(req.body?.rows)) {
      tables = { [String(req.body.tableName)]: req.body.rows };
    } else {
      tables = req.body?.tables || req.body?.data?.tables;
      if (!tables && req.body && typeof req.body === "object") {
        const keys = Object.keys(req.body).filter(
          (k) =>
            ![
              "meta",
              "exportedAt",
              "tablesCount",
              "reason",
              "version",
              "app",
              "totalRows",
              "clearBeforeInsert",
              "chunkIndex",
              "finalizeRestore",
            ].includes(k)
        );
        if (keys.length > 0 && Array.isArray(req.body[keys[0]])) {
          tables = {};
          for (const k of keys) {
            if (Array.isArray(req.body[k])) {
              tables[k] = req.body[k];
            }
          }
        }
      }
    }

    if (!tables || typeof tables !== "object" || Object.keys(tables).length === 0) {
      return res
        .status(400)
        .json({ error: "Неверный формат дампа. Ожидался объект 'tables' или JSON с массивами таблиц." });
    }

    const clearBeforeInsert =
      req.body?.clearBeforeInsert !== undefined
        ? Boolean(req.body.clearBeforeInsert)
        : req.body?.chunkIndex !== undefined
        ? Number(req.body.chunkIndex) === 0
        : true;
    const finalizeRestore =
      req.body?.finalizeRestore !== undefined ? Boolean(req.body.finalizeRestore) : true;

    const upsertOnConflict =
      req.body?.upsertOnConflict !== undefined ? Boolean(req.body.upsertOnConflict) : !clearBeforeInsert;
    const pgSummary = await restoreProTalkDatabaseJson(tables, { clearBeforeInsert, upsertOnConflict });
    invalidatePublicVacanciesCache();

    const db = await getProTalkDB();
    if (finalizeRestore) {
      await normalizeAllSlugsInProTalkDB(db).catch(() => {});
    }
    if (req.app.locals.db && (finalizeRestore || tables.companies || tables.projects || tables.employers)) {
      await loadAllFromProTalkDB(db, req.app.locals.db).catch(() => {});
    }

    return res.json({
      success: true,
      summary: pgSummary,
      totalTables: Object.keys(pgSummary).length,
      engine: "PostgreSQL ProTalk Cloud (hr3)",
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

adminExportImportRouter.post("/import-sql-dump", async (req: Request, res: Response) => {
  try {
    const { sqlText } = req.body || {};
    if (!sqlText || typeof sqlText !== "string" || !sqlText.trim()) {
      return res.status(400).json({ error: "Параметр sqlText обязателен." });
    }

    await executeProTalkQuery(sqlText);
    invalidatePublicVacanciesCache();
    return res.json({
      success: true,
      message: "SQL-скрипт успешно выполнен в облачной базе PostgreSQL ProTalk",
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});
