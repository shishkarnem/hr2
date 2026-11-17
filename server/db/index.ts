import path from "path";
import { PgDBWrapper, pgWrapper, getPgColumnTypes, getAll, getOne, runSql, queryPgRaw, translateQueryToPg, syncWriteToPostgres } from "./pgClient";
import { exportProTalkDatabaseJson } from "./protalkDb";

let initialized = false;
let initPromise: Promise<PgDBWrapper> | null = null;

export async function getProTalkDB(): Promise<PgDBWrapper> {
  if (initialized) return pgWrapper;
  if (!initPromise) {
    initPromise = (async () => {
      await getPgColumnTypes().catch(() => {});
      initialized = true;
      return pgWrapper;
    })();
  }
  return initPromise;
}

export function getProTalkDBSync(): PgDBWrapper {
  return pgWrapper;
}

export function checkpointDatabase(): void {
  // Cloud PostgreSQL persists writes synchronously per query — no local WAL checkpoint needed.
}

export function getBackupsDirectory(): string {
  return path.resolve(process.cwd(), "backups");
}

export async function createDatabaseBackup(): Promise<string> {
  await exportProTalkDatabaseJson();
  return "protalk-pg-cloud";
}

export async function getDatabaseTableNames(db?: PgDBWrapper): Promise<{ name: string }[]> {
  const inst = db || (await getProTalkDB());
  return inst.getTableNames();
}

export async function checkDatabaseTableExists(db: PgDBWrapper, tableName: string): Promise<boolean> {
  const inst = db || (await getProTalkDB());
  return inst.tableExists(tableName);
}

export async function queryGet<T = any>(sql: string, params: any[] = []): Promise<T | undefined> {
  const db = await getProTalkDB();
  return (await db.get(sql, params)) as T;
}

export async function queryAll<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  const db = await getProTalkDB();
  return (await db.all(sql, params)) as T[];
}

export async function queryRun(sql: string, params: any[] = []): Promise<{ lastID: any; changes: number }> {
  const db = await getProTalkDB();
  return db.run(sql, params);
}

export { pgWrapper, PgDBWrapper, getPgColumnTypes, getAll, getOne, runSql, queryPgRaw, translateQueryToPg, syncWriteToPostgres };
export { ProTalkDbWrapper } from "./pgClient";
export * from "./protalkDb";
export * from "./helpers";
export * from "./repositories";
