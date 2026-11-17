import { executeDatabaseBackup } from "./backup";
import { queryRun } from "../db";
import { reconcileAllCandidateCrmStatuses } from "./crmReconciler";

let lastRunDay = -1;
let lastCrmReconcileHour = -1;
let isInitialized = false;

export function initBackupCronJob() {
  if (isInitialized) return;
  isInitialized = true;

  console.log("[Cron] Daily 06:00 MSK Backup & Hourly 10:00-20:00 MSK CRM Status Services initialized");

  // Run initial reconciliation on startup so current DB is immediately accurate
  reconcileAllCandidateCrmStatuses().catch((e) => {
    console.error("[Cron] Initial CRM status reconciliation error:", e);
  });

  // Ensure cron records exist in system_crons table
  try {
    queryRun(
      `INSERT INTO system_crons (id, task_name, schedule, last_run, status, enabled)
       VALUES ('cron-daily-0600-backup', 'Daily 06:00 MSK Telegram Backup', '0 6 * * *', CURRENT_TIMESTAMP, 'active', 1)
       ON CONFLICT(id) DO UPDATE SET enabled = 1, status = 'active'`
    ).catch(() => {});

    queryRun(
      `INSERT INTO system_crons (id, task_name, schedule, last_run, status, enabled)
       VALUES ('cron-crm-stages-reconciliation', 'Hourly 10:00-20:00 MSK Candidate CRM Status Reconciler', '0 10-20 * * *', CURRENT_TIMESTAMP, 'active', 1)
       ON CONFLICT(id) DO UPDATE SET enabled = 1, status = 'active'`
    ).catch(() => {});
  } catch (e) {}

  setInterval(async () => {
    try {
      const now = new Date();
      // UTC+3 is Moscow Time (MSK)
      const mskTime = new Date(now.getTime() + 3 * 3600 * 1000);
      const mskHour = mskTime.getUTCHours();
      const mskMinute = mskTime.getUTCMinutes();
      const currentMskDay = mskTime.getUTCDate();

      // 1. Daily 06:00 MSK Backup
      if (mskHour === 6 && mskMinute === 0 && lastRunDay !== currentMskDay) {
        lastRunDay = currentMskDay;
        console.log("[Cron] 06:00 MSK reached. Starting automated daily backup to Telegram...");

        const result = await executeDatabaseBackup("Ежедневный автобэкап в 06:00 МСК");
        
        try {
          await queryRun(
            `UPDATE system_crons 
             SET last_run = CURRENT_TIMESTAMP, status = ?
             WHERE id = 'cron-daily-0600-backup' OR task_name LIKE '%Backup%'`,
            [result.success ? "completed" : "failed"]
          );
        } catch (dbErr) {}
      }

      // 2. Hourly 10:00 to 20:00 MSK candidate CRM stage reconciliation
      if (mskHour >= 10 && mskHour <= 20 && mskMinute === 0 && lastCrmReconcileHour !== mskHour) {
        lastCrmReconcileHour = mskHour;
        console.log(`[Cron] ${mskHour}:00 MSK reached. Running candidate CRM 10-stage reconciliation...`);
        const recResult = await reconcileAllCandidateCrmStatuses();
        try {
          await queryRun(
            `UPDATE system_crons 
             SET last_run = CURRENT_TIMESTAMP, status = ?
             WHERE id = 'cron-crm-stages-reconciliation'`,
            [recResult.ok ? "completed" : "failed"]
          );
        } catch (dbErr) {}
      }
    } catch (err: any) {
      console.error("[Cron] Error in cron ticker:", err.message);
    }
  }, 60000);
}

