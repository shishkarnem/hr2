import JSZip from "jszip";
import { exportProTalkDatabaseJson, exportProTalkDatabaseSql, PROTALK_CONFIG, getAppVersionPg } from "../db/protalkDb";
import { sendTelegramDocument, sendTelegramMessage, getTelegramBotConfig } from "./telegram";

export interface BackupResult {
  success: boolean;
  totalRows: number;
  tablesCount: number;
  filename: string;
  error?: string;
  zipSizeKb?: number;
}

/**
 * Creates multi-format backup (JSON + SQL Dump + Manifest) packed into a reliable ZIP archive
 * and dispatches it to Telegram admin.
 */
export async function executeDatabaseBackup(reason = "Автоматический бэкап ProTalk PG"): Promise<BackupResult> {
  try {
    const now = new Date();
    const mskTime = new Date(now.getTime() + 3 * 3600 * 1000);
    const mskTimeStr = mskTime.toISOString().replace("T", " ").substring(0, 19) + " MSK";
    const fileTimestamp = mskTime.toISOString().replace(/[:.]/g, "-").substring(0, 19);
    const zipFilename = `protalk_pg_backup_${fileTimestamp}.zip`;

    console.log(`[Backup] Generating multi-format cloud backup for database: ${PROTALK_CONFIG.database}...`);

    const appVersion = await getAppVersionPg();

    // 1. Generate JSON dump
    const jsonDump = await exportProTalkDatabaseJson();

    // 2. Generate SQL dump reusing the already fetched tables data
    const sqlDump = await exportProTalkDatabaseSql(jsonDump.tables);

    // 3. Generate Manifest
    const manifestLines = [
      `============================================================`,
      `РЕЗЕРВНАЯ КОПИЯ БАЗЫ ДАННЫХ POSTGRESQL BD PROTALK (${PROTALK_CONFIG.database})`,
      `============================================================`,
      `Версия приложения: ${appVersion}`,
      `Причина создания: ${reason}`,
      `Дата и время (МСК): ${mskTimeStr}`,
      `СУБД: PostgreSQL 16 (ProTalk Cloud Proxy)`,
      `Всего таблиц: ${jsonDump.tablesCount}`,
      `Всего записей: ${jsonDump.totalRows}`,
      ``,
      `СОСТАВ АРХИВА:`,
      `1. database_dump.sql  - Стандартный SQL-дамп PostgreSQL с инструкциями INSERT`,
      `2. database_dump.json - Полный JSON-слепок всех таблиц и связей`,
      `3. MANIFEST.txt       - Данный информационный файл`,
      ``,
      `ТАБЛИЦЫ И СТАТИСТИКА:`,
      ...Object.entries(jsonDump.tables).map(
        ([table, rows]) => `  - ${table.padEnd(35)}: ${rows.length} строк`
      ),
      `============================================================`,
    ];
    const manifestText = manifestLines.join("\n");

    // 4. Pack all formats into high-compression ZIP
    const zip = new JSZip();
    zip.file(`database_dump_${fileTimestamp}.sql`, sqlDump);
    zip.file(`database_dump_${fileTimestamp}.json`, JSON.stringify(jsonDump, null, 2));
    zip.file("MANIFEST.txt", manifestText);

    const zipBuffer = await zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
      compressionOptions: { level: 9 },
    });

    const zipSizeKb = Number((zipBuffer.length / 1024).toFixed(1));

    const caption =
      `📁 <b>Резервная копия PostgreSQL ProTalk (${PROTALK_CONFIG.database})</b>\n\n` +
      `🏷 Версия: <b>${appVersion}</b>\n` +
      `📋 Причина: <i>${reason}</i>\n` +
      `🕒 Время (МСК): <code>${mskTimeStr}</code>\n` +
      `📦 Форматы в архиве: <b>.SQL (PostgreSQL), .JSON, MANIFEST</b>\n` +
      `📊 Таблиц: <b>${jsonDump.tablesCount}</b>\n` +
      `🔢 Всего записей: <b>${jsonDump.totalRows.toLocaleString("ru-RU")}</b>\n` +
      `💾 Размер архива: <b>${zipSizeKb} KB</b> (ZIP Deflate)\n` +
      `☁️ Облако: <code>db.pro-talk.ru</code>`;

    const config = await getTelegramBotConfig();
    const adminId = config.adminTelegramId || "169262990";

    const result = await sendTelegramDocument({
      chatId: adminId,
      fileBuffer: zipBuffer,
      filename: zipFilename,
      caption,
    });

    if (!result.ok) {
      console.error("[Backup] Failed to send backup ZIP to Telegram:", result.error);
      await sendTelegramMessage({
        chatId: adminId,
        text: `⚠️ <b>Ошибка отправки бэкапа в Telegram!</b>\n${result.error || "Неизвестная ошибка"}`,
      });
      return {
        success: false,
        totalRows: jsonDump.totalRows,
        tablesCount: jsonDump.tablesCount,
        filename: zipFilename,
        error: result.error,
        zipSizeKb,
      };
    }

    console.log(`[Backup] Successfully sent ${zipFilename} (${zipSizeKb} KB) to Telegram.`);
    return {
      success: true,
      totalRows: jsonDump.totalRows,
      tablesCount: jsonDump.tablesCount,
      filename: zipFilename,
      zipSizeKb,
    };
  } catch (error: any) {
    console.error("[Backup] Critical error during backup execution:", error.message);
    return {
      success: false,
      totalRows: 0,
      tablesCount: 0,
      filename: "",
      error: error.message,
    };
  }
}
