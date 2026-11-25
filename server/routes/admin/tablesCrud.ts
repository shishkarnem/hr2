import { Router, Request, Response } from "express";
import {
  getProTalkDB,
  loadAllFromProTalkDB,
  recalculateEmployerBalances,
} from "../../db";
import { notifyProfileChangesToTelegram } from "../../telegram";
import { executeDatabaseBackup } from "../../backup";
import {
  queryAllPg,
  queryGetPg,
  getProTalkTables,
  getAppVersionPg,
} from "../../db/protalkDb";

export const adminTablesCrudRouter = Router();

const RU_FIELD_LABELS: Record<string, string> = {
  name: "Имя",
  email: "Email",
  company_name: "Компания",
  contact_name: "Контактное лицо",
  contact_email: "Контактный email",
  phone: "Телефон",
  contact_phone: "Контактный телефон",
  telegram_username: "Telegram username",
  contact_telegram: "Контактный Telegram",
  telegram_chat_id: "Telegram Chat ID",
  plan: "Тариф",
  status: "Статус",
  role: "Роль",
  registered_via: "Способ регистрации",
  ref_by: "Кто пригласил",
  referrer_id: "ID реферера",
  bonus_granted: "Бонус начислен",
  offer_accepted: "Оферта принята",
  offer_accepted_at: "Дата оферты",
  offer_version: "Версия оферты",
};

async function getPgTableMeta(tableName: string) {
  const [colRows, pkRows] = await Promise.all([
    queryAllPg<{ column_name: string; data_type: string; is_nullable: string }>(
      `SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position;`,
      [tableName]
    ),
    queryAllPg<{ column_name: string }>(
      `SELECT kcu.column_name
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu
         ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
       WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = 'public' AND tc.table_name = $1;`,
      [tableName]
    ),
  ]);
  const pkSet = new Set((pkRows || []).map((r) => r.column_name));
  return colRows.map((c) => ({
    name: c.column_name,
    type: c.data_type,
    pk: pkSet.has(c.column_name) ? 1 : 0,
    notnull: c.is_nullable === "NO" ? 1 : 0,
  }));
}

function coercePgFieldValue(val: any, dataType: string, notNull: boolean): any {
  const dt = (dataType || "").toLowerCase();
  const isNum = ["bigint", "integer", "smallint", "numeric", "double precision", "real"].includes(dt);
  const isDate = ["timestamp with time zone", "timestamp without time zone", "date"].includes(dt);
  const isBool = dt === "boolean";

  if (val === undefined || val === null) {
    if (isNum) return notNull ? 0 : null;
    if (isBool) return false;
    return notNull && !isDate ? "" : null;
  }
  if (isNum) {
    if (val === "" || isNaN(Number(val))) return notNull ? 0 : null;
    return Number(val);
  }
  if (isBool) {
    return val === true || val === 1 || val === "1" || val === "true";
  }
  if (isDate) {
    if (String(val).trim() === "") return null;
    return String(val).trim();
  }
  if (typeof val === "object") return JSON.stringify(val);
  return String(val);
}

adminTablesCrudRouter.get("/status", async (_req: Request, res: Response) => {
  try {
    const [pgTables, crons, triggers, appVersion] = await Promise.all([
      getProTalkTables(),
      queryAllPg("SELECT * FROM system_crons").catch(() => []),
      queryAllPg("SELECT * FROM system_triggers").catch(() => []),
      getAppVersionPg(),
    ]);

    return res.json({
      status: "online",
      engine: "PostgreSQL BD ProTalk (hr3)",
      superAdmin: true,
      appVersion,
      tablesCount: pgTables.length,
      tables: pgTables,
      activeCrons: crons,
      activeTriggers: triggers,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

adminTablesCrudRouter.get("/tables", async (_req: Request, res: Response) => {
  try {
    const [tablesList, colRows, pkRows] = await Promise.all([
      getProTalkTables(),
      queryAllPg<{ table_name: string; column_name: string; data_type: string; is_nullable: string }>(
        `SELECT table_name, column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema = 'public' ORDER BY table_name, ordinal_position;`
      ),
      queryAllPg<{ table_name: string; column_name: string }>(
        `SELECT kcu.table_name, kcu.column_name
         FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage kcu
           ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
         WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = 'public';`
      ),
    ]);

    const pkMap = new Map<string, Set<string>>();
    for (const r of pkRows || []) {
      if (!pkMap.has(r.table_name)) pkMap.set(r.table_name, new Set());
      pkMap.get(r.table_name)!.add(r.column_name);
    }

    const colsByTable = new Map<string, any[]>();
    for (const c of colRows || []) {
      if (!colsByTable.has(c.table_name)) colsByTable.set(c.table_name, []);
      const pks = pkMap.get(c.table_name);
      colsByTable.get(c.table_name)!.push({
        name: c.column_name,
        type: c.data_type,
        pk: pks ? pks.has(c.column_name) : c.column_name === "id",
        notnull: c.is_nullable === "NO",
      });
    }

    const rowCountMap = new Map<string, number>();
    const CHUNK = 15;
    const chunks: string[][] = [];
    for (let i = 0; i < tablesList.length; i += CHUNK) {
      chunks.push(tablesList.slice(i, i + CHUNK));
    }

    await Promise.all(
      chunks.map(async (group) => {
        if (group.length === 0) return;
        const unionSql = group
          .filter((t) => /^[a-zA-Z0-9_]+$/.test(t))
          .map((t) => `SELECT '${t}'::text AS table_name, COUNT(*)::int AS cnt FROM "${t}"`)
          .join(" UNION ALL ");
        try {
          const countRows = await queryAllPg<{ table_name: string; cnt: number }>(unionSql);
          for (const cr of countRows || []) {
            rowCountMap.set(cr.table_name, Number(cr.cnt || 0));
          }
        } catch {
          await Promise.all(
            group.map(async (t) => {
              try {
                const single = await queryGetPg<{ cnt: number }>(`SELECT COUNT(*)::int AS cnt FROM "${t}"`);
                rowCountMap.set(t, Number(single?.cnt || 0));
              } catch {
                rowCountMap.set(t, 0);
              }
            })
          );
        }
      })
    );

    const tablesWithInfo = tablesList.map((name) => ({
      name,
      rowCount: rowCountMap.get(name) ?? 0,
      columns: colsByTable.get(name) || [],
    }));

    return res.json({ tables: tablesWithInfo });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

adminTablesCrudRouter.get("/table/:tableName", async (req: Request, res: Response) => {
  try {
    const { tableName } = req.params;
    if (!/^[a-zA-Z0-9_]+$/.test(tableName)) {
      return res.status(400).json({ error: "Invalid table name" });
    }
    const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 20));
    const offset = Math.max(0, Number(req.query.offset) || 0);

    const schema = await getPgTableMeta(tableName);
    const colNames = new Set((schema || []).map((c) => c.name));
    const orderSql = colNames.has("created_at")
      ? `ORDER BY "created_at" DESC NULLS LAST`
      : colNames.has("updated_at")
      ? `ORDER BY "updated_at" DESC NULLS LAST`
      : "";

    const [rows, totalRes] = await Promise.all([
      queryAllPg(`SELECT * FROM "${tableName}" ${orderSql} LIMIT $1 OFFSET $2`, [limit, offset]),
      queryGetPg<{ cnt: number }>(`SELECT COUNT(*)::int AS cnt FROM "${tableName}"`),
    ]);

    const total = totalRes ? Number(totalRes.cnt || 0) : 0;
    return res.json({
      tableName,
      rows,
      total,
      hasMore: offset + (rows?.length || 0) < total,
      schema,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

adminTablesCrudRouter.post("/table/:tableName", async (req: Request, res: Response) => {
  try {
    const { tableName } = req.params;
    if (!/^[a-zA-Z0-9_]+$/.test(tableName)) {
      return res.status(400).json({ error: "Invalid table name" });
    }
    const data = req.body;
    if (!data || typeof data !== "object") {
      return res.status(400).json({ error: "Body must be an object with column-value pairs" });
    }

    const meta = await getPgTableMeta(tableName);
    const metaMap = new Map(meta.map((m) => [m.name, m]));
    const keys = Object.keys(data).filter((k) => metaMap.has(k));
    if (keys.length === 0) {
      return res.status(400).json({ error: "No valid fields provided" });
    }

    const db = await getProTalkDB();
    const cols = keys.map((k) => `"${k}"`).join(", ");
    const placeholders = keys.map(() => "?").join(", ");
    const values = keys.map((k) => {
      const m = metaMap.get(k)!;
      return coercePgFieldValue(data[k], m.type, m.notnull === 1);
    });

    const query = `INSERT INTO "${tableName}" (${cols}) VALUES (${placeholders})`;
    const result = await db.run(query, values);

    if (req.app.locals.db && ["companies", "projects", "employers"].includes(tableName)) {
      await loadAllFromProTalkDB(db, req.app.locals.db).catch(() => {});
    }

    return res.json({ success: true, lastID: result.lastID, changes: result.changes });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

adminTablesCrudRouter.put("/table/:tableName/:id", async (req: Request, res: Response) => {
  try {
    const { tableName, id } = req.params;
    if (!/^[a-zA-Z0-9_]+$/.test(tableName)) {
      return res.status(400).json({ error: "Invalid table name" });
    }
    const data = { ...req.body };
    if (!data || typeof data !== "object") {
      return res.status(400).json({ error: "Body must be an object with column-value pairs" });
    }

    const db = await getProTalkDB();
    if (tableName === "employers") {
      const balanceFields = [
        "balance",
        "balance_start",
        "balance_pay",
        "balance_referral",
        "balance_admin",
        "balance_limits",
      ];
      for (const bf of balanceFields) delete data[bf];
    }

    const info = await getPgTableMeta(tableName);
    const metaMap = new Map(info.map((c) => [c.name, c]));
    const colNames = info.map((c) => c.name);
    const pkCol = info.find((c) => c.pk === 1)?.name || "id";

    const keys = Object.keys(data).filter((k) => colNames.includes(k) && k !== pkCol);
    if (keys.length === 0) {
      if (tableName === "employers") {
        await recalculateEmployerBalances(db, id);
        return res.json({
          success: true,
          changes: 0,
          message: "Балансы работодателей пересчитаны на основе транзакций.",
        });
      }
      return res.status(400).json({ error: "No valid columns to update" });
    }

    const whereConditions = [`CAST("${pkCol}" AS TEXT) = ?`];
    const whereParams = [String(id)];
    if (colNames.includes("id") && pkCol !== "id") {
      whereConditions.push(`CAST("id" AS TEXT) = ?`);
      whereParams.push(String(id));
    }
    if (colNames.includes("public_id")) {
      whereConditions.push(`CAST("public_id" AS TEXT) = ?`);
      whereParams.push(String(id));
    }

    const existingRow = await db.get(
      `SELECT * FROM "${tableName}" WHERE ${whereConditions.join(" OR ")} LIMIT 1`,
      whereParams
    );

    const setClause = keys.map((k) => `"${k}" = ?`).join(", ");
    const values = keys.map((k) => {
      const m = metaMap.get(k)!;
      return coercePgFieldValue(data[k], m.type, m.notnull === 1);
    });
    const allParams = [...values, ...whereParams];

    const query = `UPDATE "${tableName}" SET ${setClause} WHERE ${whereConditions.join(" OR ")}`;
    const result = await db.run(query, allParams);

    if (tableName === "employers") {
      await recalculateEmployerBalances(db, id);
    }

    if (req.app.locals.db && ["companies", "projects", "employers"].includes(tableName)) {
      await loadAllFromProTalkDB(db, req.app.locals.db).catch(() => {});
    }

    const updatedRow = await db.get(
      `SELECT * FROM "${tableName}" WHERE ${whereConditions.join(" OR ")} LIMIT 1`,
      whereParams
    );

    if (tableName === "employers" && (updatedRow || existingRow)) {
      const changedFields: Array<{ field: string; label?: string; from: any; to: any }> = [];
      for (const k of keys) {
        const oldVal = existingRow ? existingRow[k] : null;
        const newVal = data[k];
        const isBlank = (val: any) =>
          val === null || val === undefined || (typeof val === "string" && val.trim() === "");
        if (isBlank(oldVal) && isBlank(newVal)) continue;
        const isSame =
          oldVal === newVal ||
          (typeof oldVal === "object" &&
            typeof newVal === "object" &&
            JSON.stringify(oldVal) === JSON.stringify(newVal));
        if (!isSame) {
          changedFields.push({ field: k, label: RU_FIELD_LABELS[k] || k, from: oldVal, to: newVal });
        }
      }

      if (changedFields.length > 0) {
        const note = (req.body as any)?._note || "Корректировка администратором";
        await notifyProfileChangesToTelegram(db, updatedRow || existingRow, changedFields, note).catch(
          (e: any) => console.error("[Telegram] Failed to notify profile changes:", e.message)
        );
      }
    }

    return res.json({ success: true, changes: result.changes, data: updatedRow });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

adminTablesCrudRouter.delete("/table/:tableName/:id", async (req: Request, res: Response) => {
  try {
    const { tableName, id } = req.params;
    if (!/^[a-zA-Z0-9_]+$/.test(tableName)) {
      return res.status(400).json({ error: "Invalid table name" });
    }
    const db = await getProTalkDB();
    const info = await getPgTableMeta(tableName);
    const colNames = info.map((c) => c.name);
    const pkCol = info.find((c) => c.pk === 1)?.name || "id";

    const whereConditions = [`CAST("${pkCol}" AS TEXT) = ?`];
    const whereParams = [String(id)];
    if (colNames.includes("id") && pkCol !== "id") {
      whereConditions.push(`CAST("id" AS TEXT) = ?`);
      whereParams.push(String(id));
    }
    if (colNames.includes("public_id")) {
      whereConditions.push(`CAST("public_id" AS TEXT) = ?`);
      whereParams.push(String(id));
    }

    const result = await db.run(
      `DELETE FROM "${tableName}" WHERE ${whereConditions.join(" OR ")}`,
      whereParams
    );
    if (req.app.locals.db && ["companies", "projects", "employers"].includes(tableName)) {
      await loadAllFromProTalkDB(db, req.app.locals.db).catch(() => {});
    }
    return res.json({ success: true, changes: result.changes });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

adminTablesCrudRouter.post("/table/:tableName/delete-batch", async (req: Request, res: Response) => {
  try {
    const { tableName } = req.params;
    if (!/^[a-zA-Z0-9_]+$/.test(tableName)) {
      return res.status(400).json({ error: "Invalid table name" });
    }
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: "Массив ids пуст" });
    }
    const db = await getProTalkDB();
    const info = await getPgTableMeta(tableName);
    const colNames = info.map((c) => c.name);
    const pkCol = info.find((c) => c.pk === 1)?.name || "id";

    let totalDeleted = 0;
    for (const id of ids) {
      const whereConditions = [`CAST("${pkCol}" AS TEXT) = ?`];
      const whereParams = [String(id)];
      if (colNames.includes("id") && pkCol !== "id") {
        whereConditions.push(`CAST("id" AS TEXT) = ?`);
        whereParams.push(String(id));
      }
      if (colNames.includes("public_id")) {
        whereConditions.push(`CAST("public_id" AS TEXT) = ?`);
        whereParams.push(String(id));
      }
      const result = await db.run(
        `DELETE FROM "${tableName}" WHERE ${whereConditions.join(" OR ")}`,
        whereParams
      );
      totalDeleted += result.changes || 0;
    }

    if (req.app.locals.db && ["companies", "projects", "employers"].includes(tableName)) {
      await loadAllFromProTalkDB(db, req.app.locals.db).catch(() => {});
    }
    return res.json({ success: true, deleted: totalDeleted });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

adminTablesCrudRouter.post("/cron/run/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const db = await getProTalkDB();

    let extraInfo = "";
    if (id === "cron-3" || id.toLowerCase().includes("backup")) {
      const backupResult = await executeDatabaseBackup("Запуск cron задачи из админки");
      extraInfo = backupResult.success
        ? ` Резервная копия базы (${backupResult.totalRows} строк) успешно сформирована и отправлена в Telegram!`
        : ` Ошибка отправки бэкапа в Telegram: ${backupResult.error}`;
      await db.run("UPDATE system_crons SET last_run = NOW(), status = ? WHERE id = ?", [
        backupResult.success ? "completed" : "failed",
        id,
      ]);
    } else {
      await db.run("UPDATE system_crons SET last_run = NOW(), status = 'executed' WHERE id = ?", [id]);
    }

    return res.json({ success: true, message: `Cron task ${id} executed successfully.${extraInfo}` });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});
