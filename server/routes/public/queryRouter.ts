import { Router, Request, Response } from "express";
import crypto from "crypto";
import {
  getProTalkDB,
  syncTrainingTestsPaymentsAndCabinetStatus,
} from "../../db";
import { queryAllPg } from "../../db/protalkDb";

export const queryRouter = Router();

const JSON_COLUMNS_BY_TABLE: Record<string, string[]> = {
  interview_blocks: ["payload", "settings_json"],
  training_stage_tests: ["questions", "questions_json"],
  training_blocks: ["materials_links", "materials_files", "subpages_json"],
  projects: ["checklist_questions", "roleplay_questions", "theme_config", "candidate_fields_config"],
  companies: ["theme_config"],
  candidates: ["standard_fields_json", "custom_fields_json", "DrivingExperience", "data_json"],
  candidate_training_attempts: ["answers", "breakdown"],
  candidate_stage_progress: ["details_json"],
  candidate_situations_answers_v2: ["breakdown"],
  candidate_scores: [
    "resume_pros",
    "resume_cons",
    "resume_risks",
    "checklist_breakdown",
    "situations_breakdown",
    "resume_feedback",
    "candidate_resume_feedback",
    "checklist_feedback",
    "candidate_checklist_feedback",
    "situations_feedback",
    "candidate_situations_feedback",
    "candidate_overall_feedback",
  ],
  candidate_checklist_answers_v2: ["selected_options", "breakdown"],
  candidate_answers: ["answer_json"],
  notifications: ["meta"],
  client_errors: ["meta"],
};

const tableSchemaCache = new Map<string, { ts: number; cols: Array<{ name: string; type: string }> }>();

async function getPgTableSchemaCached(table: string): Promise<Array<{ name: string; type: string }>> {
  const cached = tableSchemaCache.get(table);
  if (cached && Date.now() - cached.ts < 60000) {
    return cached.cols;
  }
  const rows = await queryAllPg<{ column_name: string; data_type: string }>(
    `SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`,
    [table]
  );
  const cols = (rows || []).map((r) => ({ name: r.column_name, type: r.data_type }));
  if (cols.length > 0) {
    tableSchemaCache.set(table, { ts: Date.now(), cols });
  }
  return cols;
}

function parseRowJsonFields(table: string, row: any) {
  if (!row || typeof row !== "object") return row;
  const out = { ...row };
  const cols = JSON_COLUMNS_BY_TABLE[table] || ["payload", "questions", "questions_json", "meta"];
  for (const col of cols) {
    if (typeof out[col] === "string") {
      const trimmed = out[col].trim();
      if (
        (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
        (trimmed.startsWith("[") && trimmed.endsWith("]"))
      ) {
        try {
          out[col] = JSON.parse(trimmed);
        } catch {}
      }
    }
  }

  if (table === "training_stage_tests") {
    const raw = out.questions || out.questions_json || [];
    let list: any[] = [];
    if (typeof raw === "string") {
      try {
        list = JSON.parse(raw);
      } catch {}
    } else if (Array.isArray(raw)) {
      list = raw;
    }
    const normalized = list.map((item: any, idx: number) => {
      if (!item || typeof item !== "object") {
        return { id: `q${idx + 1}`, kind: "text", question: String(item || ""), points: 5, options: [] };
      }
      const qText = item.question || item.q || item.title || "";
      let options: Array<{ text: string; is_correct?: boolean }> = [];
      if (Array.isArray(item.options)) {
        options = item.options.map((opt: any, optIdx: number) => {
          if (typeof opt === "string") {
            const isCorrect =
              item.correctIndex !== undefined ? optIdx === Number(item.correctIndex) : optIdx === 0;
            return { text: opt, is_correct: isCorrect };
          }
          return {
            text: opt?.text || opt?.title || "",
            is_correct: Boolean(opt?.is_correct ?? opt?.correct),
          };
        });
      }
      let kind = item.kind || "choice";
      if (kind === "choice" && (!options || options.length === 0)) {
        kind = item.expected_answer ? "paragraph" : "choice";
      }
      return {
        id: item.id || `q${idx + 1}`,
        kind,
        question: qText,
        points: Number(item.points) || 5,
        options: options.length > 0 ? options : null,
        correct: item.correct ?? (options.find((o) => o.is_correct)?.text || null),
        expected_answer: item.expected_answer || null,
        explanation: item.explanation || "",
      };
    });
    out.questions = normalized;
    out.questions_json = normalized;
  }

  return out;
}

function serializePgValue(v: any, pgType: string): any {
  const dt = (pgType || "").toLowerCase();
  const isNum = ["bigint", "integer", "smallint", "numeric", "double precision", "real"].includes(dt);
  const isBool = dt === "boolean";
  const isDate = ["timestamp with time zone", "timestamp without time zone", "date"].includes(dt);

  if (v === undefined || v === null) return null;
  if (isBool) return v === true || v === 1 || v === "1" || v === "true";
  if (isNum) {
    if (v === "" || isNaN(Number(v))) return null;
    return Number(v);
  }
  if (isDate) {
    return String(v).trim() === "" ? null : String(v).trim();
  }
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "object") return JSON.stringify(v);
  return v;
}

queryRouter.post("/query", async (req: Request, res: Response) => {
  try {
    const {
      table,
      action = "select",
      select = "*",
      filters = [],
      orFilters = [],
      order = [],
      limit = null,
      offset = null,
      single = false,
      maybeSingle = false,
      countMode = null,
      head = false,
      payload = null,
      onConflict = null,
    } = req.body || {};

    if (!table || !/^[a-zA-Z0-9_]+$/.test(String(table))) {
      return res.status(400).json({ data: null, error: { message: "Invalid table name" } });
    }

    const dbInstance = await getProTalkDB();
    const schemaCols = await getPgTableSchemaCached(table);
    if (!schemaCols.length) {
      return res.json({ data: single || maybeSingle ? null : [], count: 0, error: null });
    }
    const validCols = new Set(schemaCols.map((c) => c.name));
    const colTypeMap = new Map(schemaCols.map((c) => [c.name, c.type]));

    const buildWhere = () => {
      const clauses: string[] = [];
      const params: any[] = [];

      for (const f of Array.isArray(filters) ? filters : []) {
        if (!f || !f.col || !validCols.has(String(f.col))) continue;
        const col = `"${f.col}"`;
        const op = String(f.op || "eq");
        const val = f.val;

        if (op === "eq") {
          if (val === null) {
            clauses.push(`${col} IS NULL`);
          } else if (typeof val === "boolean") {
            if (val) clauses.push(`(LOWER(CAST(${col} AS TEXT)) IN ('1', 'true', 't'))`);
            else clauses.push(`(LOWER(CAST(${col} AS TEXT)) IN ('0', 'false', 'f') OR ${col} IS NULL)`);
          } else if (f.col === "id" && (table === "candidates" || table === "projects" || table === "companies")) {
            clauses.push(
              `(CAST(${col} AS TEXT) = CAST(? AS TEXT) OR ("public_id" IS NOT NULL AND CAST("public_id" AS TEXT) = CAST(? AS TEXT)))`
            );
            params.push(String(val), String(val));
          } else if (f.col === "candidate_id" && (table === "candidate_scores" || table === "training_attempts")) {
            clauses.push(
              `(CAST(${col} AS TEXT) = CAST(? AS TEXT) OR CAST(${col} AS TEXT) IN (SELECT CAST(id AS TEXT) FROM candidates WHERE CAST(public_id AS TEXT) = ? OR CAST(id AS TEXT) = ?))`
            );
            params.push(String(val), String(val), String(val));
          } else if (
            f.col === "project_id" &&
            (table === "interview_blocks" ||
              table === "training_blocks" ||
              table === "training_stage_tests" ||
              table === "candidates")
          ) {
            clauses.push(
              `(CAST(${col} AS TEXT) = CAST(? AS TEXT) OR CAST(${col} AS TEXT) IN (SELECT CAST(id AS TEXT) FROM projects WHERE CAST(public_id AS TEXT) = ? OR CAST(id AS TEXT) = ?))`
            );
            params.push(String(val), String(val), String(val));
          } else if (
            f.col === "stage" &&
            (table === "training_stage_tests" ||
              table === "training_blocks" ||
              table === "candidate_training_attempts")
          ) {
            const STAGE_ALIASES: Record<string, string[]> = {
              professional: ["professional", "stage1", "1"],
              stage1: ["professional", "stage1", "1"],
              "1": ["professional", "stage1", "1"],
              product: ["product", "stage2", "2"],
              stage2: ["product", "stage2", "2"],
              "2": ["product", "stage2", "2"],
              system: ["system", "stage3", "3", "systems"],
              stage3: ["system", "stage3", "3", "systems"],
              systems: ["system", "stage3", "3", "systems"],
              "3": ["system", "stage3", "3", "systems"],
            };
            const sKey = String(val).toLowerCase().trim();
            const aliases = STAGE_ALIASES[sKey] || [String(val)];
            const ph = aliases.map(() => "CAST(? AS TEXT)").join(", ");
            clauses.push(`CAST(${col} AS TEXT) IN (${ph})`);
            aliases.forEach((a) => params.push(a));
          } else {
            clauses.push(`CAST(${col} AS TEXT) = CAST(? AS TEXT)`);
            params.push(String(val));
          }
        } else if (op === "neq") {
          if (val === null) {
            clauses.push(`${col} IS NOT NULL`);
          } else {
            clauses.push(`(CAST(${col} AS TEXT) != CAST(? AS TEXT) OR ${col} IS NULL)`);
            params.push(String(val));
          }
        } else if (op === "in") {
          const arr = Array.isArray(val) ? val : [];
          if (arr.length === 0) {
            clauses.push("1 = 0");
          } else {
            const ph = arr.map(() => "CAST(? AS TEXT)").join(", ");
            clauses.push(`CAST(${col} AS TEXT) IN (${ph})`);
            arr.forEach((v) => params.push(String(v)));
          }
        } else if (op === "is") {
          if (val === null || val === "null") {
            clauses.push(`${col} IS NULL`);
          } else if (val === true || val === "true") {
            clauses.push(`(LOWER(CAST(${col} AS TEXT)) IN ('1', 'true', 't'))`);
          } else if (val === false || val === "false") {
            clauses.push(`(LOWER(CAST(${col} AS TEXT)) IN ('0', 'false', 'f'))`);
          }
        } else if (op === "gt") {
          clauses.push(`${col} > ?`);
          params.push(val);
        } else if (op === "gte") {
          clauses.push(`${col} >= ?`);
          params.push(val);
        } else if (op === "lt") {
          clauses.push(`${col} < ?`);
          params.push(val);
        } else if (op === "lte") {
          clauses.push(`${col} <= ?`);
          params.push(val);
        } else if (op === "like" || op === "ilike") {
          clauses.push(`LOWER(CAST(${col} AS TEXT)) LIKE LOWER(?)`);
          params.push(String(val));
        }
      }

      for (const rawOr of Array.isArray(orFilters) ? orFilters : []) {
        if (!rawOr || typeof rawOr !== "string") continue;
        const parts = rawOr
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        const subClauses: string[] = [];
        for (const p of parts) {
          const m = p.match(/^([a-zA-Z0-9_]+)\.(eq|neq|is|ilike|like)\.(.+)$/);
          if (!m) continue;
          const [, cName, opName, rawVal] = m;
          if (!validCols.has(cName)) continue;
          if (opName === "eq") {
            subClauses.push(`CAST("${cName}" AS TEXT) = CAST(? AS TEXT)`);
            params.push(rawVal);
          } else if (opName === "neq") {
            subClauses.push(`CAST("${cName}" AS TEXT) != CAST(? AS TEXT)`);
            params.push(rawVal);
          } else if (opName === "is" && rawVal === "null") {
            subClauses.push(`"${cName}" IS NULL`);
          } else if (opName === "ilike" || opName === "like") {
            subClauses.push(`LOWER(CAST("${cName}" AS TEXT)) LIKE LOWER(?)`);
            params.push(rawVal);
          }
        }
        if (subClauses.length > 0) {
          clauses.push(`(${subClauses.join(" OR ")})`);
        }
      }

      return {
        whereSql: clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "",
        params,
      };
    };

    const syncStatusIfNeeded = async () => {
      if (
        [
          "training_blocks",
          "training_stage_tests",
          "interview_systems",
          "interview_blocks",
          "projects",
          "companies",
        ].includes(table)
      ) {
        void syncTrainingTestsPaymentsAndCabinetStatus(dbInstance).catch(() => {});
      }
    };

    if (action === "select") {
      const { whereSql, params } = buildWhere();

      let totalCount: number | undefined = undefined;
      if (countMode) {
        const cntRow = await dbInstance.get(
          `SELECT COUNT(*)::int as c FROM "${table}" ${whereSql}`,
          params
        );
        totalCount = Number(cntRow?.c || 0);
        if (head) {
          return res.json({ data: null, count: totalCount, error: null });
        }
      }

      let orderSql = "";
      if (Array.isArray(order) && order.length > 0) {
        const ordParts = order
          .filter((o: any) => o && o.col && validCols.has(String(o.col)))
          .map((o: any) => `"${o.col}" ${o.ascending === false ? "DESC" : "ASC"}`);
        if (ordParts.length > 0) orderSql = `ORDER BY ${ordParts.join(", ")}`;
      }

      let limitSql = "";
      if (single || maybeSingle) {
        limitSql = "LIMIT 1";
      } else if (limit != null && Number.isFinite(Number(limit))) {
        limitSql = `LIMIT ${Math.max(0, Number(limit))}`;
        if (offset != null && Number.isFinite(Number(offset))) {
          limitSql += ` OFFSET ${Math.max(0, Number(offset))}`;
        }
      }

      const selectStr = String(select || "*");
      const wantsCompanies = table === "projects" && /companies\s*\(/.test(selectStr);
      const wantsWallets = table === "employers" && /wallets\s*\(/.test(selectStr);

      let selectColsSql = "*";
      if (selectStr !== "*" && !selectStr.includes("(") && !selectStr.includes(")")) {
        const parts = selectStr
          .split(",")
          .map((c) => c.trim())
          .filter((c) => validCols.has(c));
        if (parts.length > 0) {
          if (validCols.has("id") && !parts.includes("id")) parts.unshift("id");
          selectColsSql = parts.map((c) => `"${c}"`).join(", ");
        }
      } else if (table === "projects" && (selectStr === "*" || !select)) {
        const safe = Array.from(validCols).filter((c) => c !== "data_json");
        selectColsSql = safe.map((c) => `"${c}"`).join(", ");
      }

      let rawRows: any[] = [];
      try {
        rawRows =
          (await dbInstance.all(
            `SELECT ${selectColsSql} FROM "${table}" ${whereSql} ${orderSql} ${limitSql}`,
            params
          )) || [];
      } catch (err: any) {
        console.warn(`[POST /api/query read error in ${table}]:`, err?.message);
        rawRows = [];
      }

      const enriched = await Promise.all(
        rawRows.map(async (r: any) => {
          const parsed = parseRowJsonFields(table, r);
          if (wantsCompanies) {
            const comp =
              (r.company_id &&
                (await dbInstance.get(
                  "SELECT * FROM companies WHERE id = ? OR CAST(public_id AS TEXT) = ? LIMIT 1",
                  [r.company_id, String(r.company_id)]
                ))) ||
              (r.company_slug &&
                (await dbInstance.get(
                  "SELECT * FROM companies WHERE slug = ? OR legacy_slug = ? LIMIT 1",
                  [r.company_slug, r.company_slug]
                ))) ||
              (r.company_name &&
                (await dbInstance.get(
                  "SELECT * FROM companies WHERE LOWER(name) = LOWER(?) LIMIT 1",
                  [r.company_name]
                ))) ||
              null;
            parsed.companies = comp ? parseRowJsonFields("companies", comp) : null;
          }
          if (wantsWallets) {
            const wallets =
              (await dbInstance.all("SELECT * FROM wallets WHERE employer_id = ?", [r.id])) || [];
            parsed.wallets =
              wallets.length > 0
                ? wallets
                : [{ id: r.id, employer_id: r.id, units_balance: Number(r.balance || 0) }];
          }
          return parsed;
        })
      );

      if (single) {
        if (enriched.length === 0) {
          return res.json({ data: null, error: { message: "Row not found", code: "PGRST116" } });
        }
        return res.json({ data: enriched[0], count: totalCount, error: null });
      }
      if (maybeSingle) {
        return res.json({ data: enriched[0] || null, count: totalCount, error: null });
      }
      return res.json({ data: enriched, count: totalCount, error: null });
    }

    if (action === "insert" || action === "upsert") {
      const items = Array.isArray(payload) ? payload : payload ? [payload] : [];
      const insertedRows: any[] = [];

      for (const item of items) {
        if (!item || typeof item !== "object") continue;
        const rowObj: Record<string, any> = { ...item };
        if (table === "training_stage_tests") {
          if (rowObj.questions !== undefined && rowObj.questions_json === undefined) {
            rowObj.questions_json = rowObj.questions;
          }
          if (rowObj.status === undefined) {
            const qArr = Array.isArray(rowObj.questions_json) ? rowObj.questions_json : [];
            rowObj.status = qArr.length > 0 ? "completed" : "draft";
          }
        }
        if (validCols.has("id") && !rowObj.id) {
          const idType = (colTypeMap.get("id") || "").toLowerCase();
          if (!["bigint", "integer", "smallint"].includes(idType)) {
            rowObj.id = crypto.randomUUID();
          }
        }
        if (validCols.has("updated_at") && !rowObj.updated_at) {
          rowObj.updated_at = new Date().toISOString();
        }
        if (validCols.has("created_at") && !rowObj.created_at) {
          rowObj.created_at = new Date().toISOString();
        }

        let existingRow: any = null;
        if (
          action === "upsert" ||
          [
            "interview_blocks",
            "interview_systems",
            "training_stage_tests",
            "training_blocks",
            "employer_tour_state",
            "candidate_scores",
            "candidate_stage_progress",
            "candidate_checklist_answers_v2",
            "candidate_situations_answers_v2",
          ].includes(table)
        ) {
          const conflictCols = onConflict
            ? String(onConflict)
                .split(",")
                .map((s) => s.trim())
                .filter((c) => validCols.has(c))
            : table === "interview_blocks"
            ? ["project_id", "kind"]
            : table === "interview_systems"
            ? ["project_id"]
            : table === "training_stage_tests" || table === "training_blocks"
            ? ["project_id", "stage"]
            : table === "employer_tour_state"
            ? ["user_id", "section"]
            : table === "candidate_scores"
            ? ["candidate_id"]
            : table === "candidate_stage_progress"
            ? ["candidate_id", "stage"]
            : table === "candidate_checklist_answers_v2" || table === "candidate_situations_answers_v2"
            ? ["candidate_id", "project_id"]
            : ["id"];

          if (
            conflictCols.length > 0 &&
            conflictCols.every((c) => rowObj[c] !== undefined && rowObj[c] !== null)
          ) {
            const wClause = conflictCols.map((c) => `CAST("${c}" AS TEXT) = CAST(? AS TEXT)`).join(" AND ");
            const wParams = conflictCols.map((c) => String(rowObj[c]));
            existingRow = await dbInstance.get(`SELECT * FROM "${table}" WHERE ${wClause} LIMIT 1`, wParams);
          }
          if (!existingRow && rowObj.id && validCols.has("id")) {
            existingRow = await dbInstance.get(`SELECT * FROM "${table}" WHERE CAST(id AS TEXT) = ? LIMIT 1`, [
              String(rowObj.id),
            ]);
          }
        }

        if (existingRow) {
          const updateKeys = Object.keys(rowObj).filter(
            (k) => validCols.has(k) && k !== "id" && k !== "created_at"
          );
          if (updateKeys.length > 0) {
            const setSql = updateKeys.map((k) => `"${k}" = ?`).join(", ");
            const setVals = updateKeys.map((k) =>
              serializePgValue(rowObj[k], colTypeMap.get(k) || "text")
            );
            await dbInstance.run(`UPDATE "${table}" SET ${setSql} WHERE id = ?`, [
              ...setVals,
              existingRow.id,
            ]);
          }
          const updated = await dbInstance.get(`SELECT * FROM "${table}" WHERE id = ? LIMIT 1`, [
            existingRow.id,
          ]);
          if (updated) insertedRows.push(parseRowJsonFields(table, updated));
        } else {
          const insertKeys = Object.keys(rowObj).filter((k) => validCols.has(k));
          if (insertKeys.length > 0) {
            const colsSql = insertKeys.map((k) => `"${k}"`).join(", ");
            const phSql = insertKeys.map(() => "?").join(", ");
            const insertVals = insertKeys.map((k) =>
              serializePgValue(rowObj[k], colTypeMap.get(k) || "text")
            );
            const runRes = await dbInstance.run(
              `INSERT INTO "${table}" (${colsSql}) VALUES (${phSql})`,
              insertVals
            );
            const lookupId = rowObj.id || runRes.lastID;
            const fetched =
              lookupId && validCols.has("id")
                ? await dbInstance.get(`SELECT * FROM "${table}" WHERE CAST(id AS TEXT) = ? LIMIT 1`, [
                    String(lookupId),
                  ])
                : rowObj;
            if (fetched) insertedRows.push(parseRowJsonFields(table, fetched));
          }
        }
      }

      await syncStatusIfNeeded();
      if (single || maybeSingle) {
        return res.json({ data: insertedRows[0] || null, error: null });
      }
      return res.json({ data: insertedRows, error: null });
    }

    if (action === "update") {
      if (!payload || typeof payload !== "object") {
        return res.json({ data: [], error: null });
      }
      const { whereSql, params } = buildWhere();
      if (!whereSql) {
        return res.status(400).json({ data: null, error: { message: "Update requires at least one filter" } });
      }

      const patchObj: Record<string, any> = { ...payload };
      if (validCols.has("updated_at") && !patchObj.updated_at) {
        patchObj.updated_at = new Date().toISOString();
      }
      const updateKeys = Object.keys(patchObj).filter((k) => validCols.has(k));
      if (updateKeys.length > 0) {
        const setSql = updateKeys.map((k) => `"${k}" = ?`).join(", ");
        const setVals = updateKeys.map((k) => serializePgValue(patchObj[k], colTypeMap.get(k) || "text"));
        await dbInstance.run(`UPDATE "${table}" SET ${setSql} ${whereSql}`, [...setVals, ...params]);
      }

      if (table === "interview_blocks") {
        const updatedBlocks =
          (await dbInstance.all(`SELECT * FROM "${table}" ${whereSql}`, params)) || [];
        for (const blk of updatedBlocks) {
          try {
            const pl = typeof blk.payload === "string" ? JSON.parse(blk.payload) : blk.payload;
            if (blk.kind === "checklist" && Array.isArray(pl?.questions)) {
              await dbInstance.run(
                "UPDATE projects SET checklist_questions = ?, updated_at = NOW() WHERE id = ?",
                [JSON.stringify(pl.questions), blk.project_id]
              );
            } else if (blk.kind === "situations" && Array.isArray(pl?.situations)) {
              await dbInstance.run(
                "UPDATE projects SET roleplay_questions = ?, updated_at = NOW() WHERE id = ?",
                [JSON.stringify(pl.situations), blk.project_id]
              );
            }
          } catch {}
        }
      }

      await syncStatusIfNeeded();
      const updatedRows = ((await dbInstance.all(`SELECT * FROM "${table}" ${whereSql}`, params)) || []).map(
        (r: any) => parseRowJsonFields(table, r)
      );
      if (single || maybeSingle) {
        return res.json({ data: updatedRows[0] || null, error: null });
      }
      return res.json({ data: updatedRows, error: null });
    }

    if (action === "delete") {
      const { whereSql, params } = buildWhere();
      if (!whereSql) {
        return res.status(400).json({ data: null, error: { message: "Delete requires at least one filter" } });
      }
      await dbInstance.run(`DELETE FROM "${table}" ${whereSql}`, params);
      await syncStatusIfNeeded();
      return res.json({ data: [], error: null });
    }

    return res.status(400).json({ data: null, error: { message: `Unsupported action: ${action}` } });
  } catch (err: any) {
    console.error("[/api/query] Error:", err);
    return res.status(500).json({ data: null, error: { message: err?.message || "Query failed" } });
  }
});
