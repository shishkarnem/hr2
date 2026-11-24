import type { PgDBWrapper } from "../../db";

async function resolveEmployerRow(db: PgDBWrapper, employerOrId: any): Promise<any | null> {
  if (!employerOrId) return null;
  if (typeof employerOrId === "object" && employerOrId.id) {
    const fresh = await db.get(`SELECT * FROM employers WHERE id = ? LIMIT 1`, [String(employerOrId.id)]);
    return fresh || employerOrId;
  }
  const raw = String(employerOrId).trim();
  if (!raw) return null;
  const clean = raw.replace(/^emp-?/i, "").trim();
  return await db.get(
    `SELECT * FROM employers WHERE id = ? OR CAST(public_id AS TEXT) = ? OR id = ? OR CAST(public_id AS TEXT) = ? OR user_id = ? LIMIT 1`,
    [raw, raw, `emp-${clean}`, clean, raw]
  );
}

async function hasRecentThresholdAlert(
  db: PgDBWrapper,
  empId: string,
  kind: string,
  subKey?: string
): Promise<boolean> {
  try {
    const row = subKey
      ? await db.get(
          `SELECT id FROM notifications
           WHERE user_id = ? AND user_role = 'employer' AND kind = ? AND meta_json LIKE ?
             AND created_at >= NOW() - INTERVAL '6 hours'
           LIMIT 1`,
          [empId, kind, `%"${subKey}"%`]
        )
      : await db.get(
          `SELECT id FROM notifications
           WHERE user_id = ? AND user_role = 'employer' AND kind = ?
             AND created_at >= NOW() - INTERVAL '6 hours'
           LIMIT 1`,
          [empId, kind]
        );
    return Boolean(row?.id);
  } catch {
    return false;
  }
}

async function sendDirectEmployerTelegramTargets(
  emp: any,
  cfg: any,
  text: string,
  button: { text: string; url: string }
) {
  const { parseTelegramTargetsList, sendTelegramMessage } = await import("../telegram");
  const targets = Array.from(
    new Set([
      ...parseTelegramTargetsList(
        [emp.telegram_chat_id, cfg.telegram_user_ids, cfg.telegram_group_ids].filter(Boolean).join(","),
        "numeric"
      ),
      ...parseTelegramTargetsList(cfg.telegram_channel_ids, "channel"),
    ])
  );
  for (const chatId of targets) {
    try {
      await sendTelegramMessage({
        chatId,
        text,
        parseMode: "HTML",
        button,
      });
    } catch {}
  }
}

export async function checkEmployerLowBalanceRR(
  db: PgDBWrapper,
  employerOrId: any,
  prevBalance?: number
) {
  try {
    const emp = await resolveEmployerRow(db, employerOrId);
    if (!emp) return;

    const { parseNotificationsConfig, dispatchUserNotification, isChannelEnabledForEvent } = await import(
      "../push/pushService"
    );
    const cfg = parseNotificationsConfig(emp.notifications_config, "employer");
    const threshold = Math.max(0, Number(cfg.thresholds?.low_balance_rr ?? 100));
    if (threshold <= 0) return;

    const currentBal = Number(emp.balance ?? 0);
    if (currentBal >= threshold) return;

    const crossedJustNow = prevBalance !== undefined && prevBalance >= threshold;
    if (!crossedJustNow && (await hasRecentThresholdAlert(db, String(emp.id), "low_balance_rr"))) {
      return;
    }

    const empPub = String(emp.public_id || emp.id || "").replace(/^emp-?/i, "");
    const link = empPub ? `/emp${empPub}/tariff` : "/emp";
    const roundedBal = Math.round(currentBal);

    const dispatched = await dispatchUserNotification(db, {
      ownerType: "employer",
      ownerIds: [String(emp.id), String(emp.public_id || ""), String(emp.user_id || "")].filter(Boolean),
      eventKey: "low_balance_rr",
      kind: "low_balance_rr",
      title: `Низкий баланс RR: ${roundedBal} RR`,
      body: `На вашем балансе осталось ${roundedBal} RR — ниже установленного порога ${threshold} RR.`,
      link,
      meta: { balance: roundedBal, threshold },
    });

    if (isChannelEnabledForEvent(dispatched.config, "low_balance_rr", "telegram")) {
      await sendDirectEmployerTelegramTargets(
        emp,
        dispatched.config,
        `💳 <b>Низкий баланс RR</b>\nОстаток на счёте: <b>${roundedBal} RR</b>\nУстановленный порог: <b>${threshold} RR</b>\n\nПополните баланс, чтобы сервисы ИИ-рекрутинга работали без остановок.`,
        { text: "💳 Пополнить баланс", url: link }
      );
    }
  } catch (err: any) {
    console.warn("[checkEmployerLowBalanceRR] Notice:", err?.message || err);
  }
}

export async function checkEmployerLowGeneralLimits(
  db: PgDBWrapper,
  employerOrId: any,
  prevTotal?: number
) {
  try {
    const emp = await resolveEmployerRow(db, employerOrId);
    if (!emp) return;

    const { parseNotificationsConfig, dispatchUserNotification, isChannelEnabledForEvent } = await import(
      "../push/pushService"
    );
    const cfg = parseNotificationsConfig(emp.notifications_config, "employer");
    const threshold = Math.max(0, Number(cfg.thresholds?.low_general_limits ?? 10));
    if (threshold <= 0) return;

    const intCredits = Math.max(0, Number(emp.interview_credits ?? 0));
    const trainCredits = Math.max(0, Number(emp.training_credits ?? 0));
    const totalCredits = intCredits + trainCredits;
    if (totalCredits >= threshold) return;

    const crossedJustNow = prevTotal !== undefined && prevTotal >= threshold;
    if (!crossedJustNow && (await hasRecentThresholdAlert(db, String(emp.id), "low_general_limits"))) {
      return;
    }

    const empPub = String(emp.public_id || emp.id || "").replace(/^emp-?/i, "");
    const link = empPub ? `/emp${empPub}/tariff` : "/emp";

    const dispatched = await dispatchUserNotification(db, {
      ownerType: "employer",
      ownerIds: [String(emp.id), String(emp.public_id || ""), String(emp.user_id || "")].filter(Boolean),
      eventKey: "low_general_limits",
      kind: "low_general_limits",
      title: `Мало общих лимитов: ${totalCredits} шт.`,
      body: `В общем пуле осталось ${totalCredits} шт. (Интервью: ${intCredits}, Обучения: ${trainCredits}) при пороге ${threshold} шт.`,
      link,
      meta: { interview_credits: intCredits, training_credits: trainCredits, total: totalCredits, threshold },
    });

    if (isChannelEnabledForEvent(dispatched.config, "low_general_limits", "telegram")) {
      await sendDirectEmployerTelegramTargets(
        emp,
        dispatched.config,
        `📉 <b>Заканчиваются общие лимиты кабинета</b>\nОстаток в общем пуле: <b>${totalCredits} шт.</b> (Интервью: ${intCredits}, Обучения: ${trainCredits})\nУстановленный порог: <b>${threshold} шт.</b>`,
        { text: "📊 Пополнить лимиты", url: link }
      );
    }
  } catch (err: any) {
    console.warn("[checkEmployerLowGeneralLimits] Notice:", err?.message || err);
  }
}

export async function checkVacancyLowLimits(
  db: PgDBWrapper,
  projectId: string | number,
  fallbackEmpId?: string,
  prevRem?: number
) {
  try {
    if (!projectId) return;
    const proj = await db.get(
      `SELECT id, public_id, employer_id, responsible_employer_id, responsible_employer_ids, company_id, role_name,
              interview_limit, max_interviews, interview_used, training_limit, max_trainings, training_used
       FROM projects
       WHERE id = ? OR CAST(public_id AS TEXT) = ?
       LIMIT 1`,
      [String(projectId), String(projectId)]
    );
    if (!proj) return;

    const iLimit = Math.max(0, Number(proj.interview_limit ?? proj.max_interviews ?? 0));
    const tLimit = Math.max(0, Number(proj.training_limit ?? proj.max_trainings ?? 0));
    if (iLimit <= 0 && tLimit <= 0) return;

    const iUsed = Math.max(0, Number(proj.interview_used ?? 0));
    const tUsed = Math.max(0, Number(proj.training_used ?? 0));
    const remI = iLimit > 0 ? Math.max(0, iLimit - iUsed) : 0;
    const remT = tLimit > 0 ? Math.max(0, tLimit - tUsed) : 0;
    const totalRem = remI + remT;

    const { resolveVacancyResponsibleEmployers } = await import("./vacancyResponsiblesResolver");
    const responsibles = await resolveVacancyResponsibleEmployers(db, proj, fallbackEmpId);
    if (responsibles.length === 0) return;

    const { parseNotificationsConfig, dispatchUserNotification } = await import("../push/pushService");
    const roleName = String(proj.role_name || "Вакансия");
    let anyTriggeredTelegram = false;
    let firstTriggerThreshold = 10;
    let primaryLink = "/emp";

    for (const resp of responsibles) {
      const emp = resp.empRow;
      const cfg = parseNotificationsConfig(emp?.notifications_config, "employer");
      const threshold = Math.max(0, Number(cfg.thresholds?.low_vacancy_limits ?? 10));
      if (threshold <= 0 || totalRem >= threshold) continue;

      const crossedJustNow = prevRem !== undefined && prevRem >= threshold;
      if (!crossedJustNow && (await hasRecentThresholdAlert(db, String(emp.id), "low_vacancy_limits", String(proj.id)))) {
        continue;
      }

      const empPub = String(emp.public_id || emp.id || "").replace(/^emp-?/i, "");
      const link = empPub ? `/emp${empPub}/projects` : "/emp";
      if (!anyTriggeredTelegram) {
        firstTriggerThreshold = threshold;
        primaryLink = link;
      }

      await dispatchUserNotification(db, {
        ownerType: "employer",
        ownerIds: [String(emp.id), String(emp.public_id || ""), String(emp.user_id || "")].filter(Boolean),
        eventKey: "low_vacancy_limits",
        kind: "low_vacancy_limits",
        title: `Мало лимитов по вакансии «${roleName}»: ${totalRem} шт.`,
        body: `Осталось ${totalRem} шт. (Интервью: ${iLimit > 0 ? remI : "—"}, Обучения: ${tLimit > 0 ? remT : "—"}) при пороге ${threshold} шт.`,
        link,
        meta: { project_id: proj.id, rem_interview: remI, rem_training: remT, total: totalRem, threshold },
      });
      anyTriggeredTelegram = true;
    }

    if (anyTriggeredTelegram) {
      const { sendVacancyTelegramNotification } = await import("../telegram");
      const hourBucket = Math.floor(Date.now() / (3600 * 1000));
      await sendVacancyTelegramNotification(
        db,
        String(proj.id),
        `⚠️ <b>Заканчиваются лимиты по вакансии</b>\n💼 Вакансия: ${roleName}\n📉 Осталось: <b>${totalRem} шт.</b> (Интервью: ${iLimit > 0 ? remI : "без лимита"}, Обучения: ${tLimit > 0 ? remT : "без лимита"})\n🎯 Порог: <b>${firstTriggerThreshold} шт.</b>`,
        {
          eventKey: "low_vacancy_limits",
          dedupKey: `low_vac_${totalRem}_${hourBucket}`,
          button: { text: "📊 Добавить лимиты вакансии", url: primaryLink },
        }
      );
    }
  } catch (err: any) {
    console.warn("[checkVacancyLowLimits] Notice:", err?.message || err);
  }
}
