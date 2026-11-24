import type { PgDBWrapper } from "../../db";

export type InterviewStageTitle = "Скрининг резюме" | "Чек-лист" | "Ситуации";

export async function resolveEmployerTargetForProject(
  db: PgDBWrapper,
  projRow: any,
  candidateRow?: any
): Promise<string> {
  const { resolveVacancyResponsibleEmployers } = await import("./vacancyResponsiblesResolver");
  const resList = await resolveVacancyResponsibleEmployers(db, projRow, candidateRow?.employer_id);
  return String(
    resList[0]?.public_id || resList[0]?.id || projRow?.responsible_employer_id || projRow?.employer_id || ""
  ).trim();
}

export async function notifyEmployerInterviewStage(
  db: PgDBWrapper,
  params: {
    projectId: string | number;
    projRow?: any;
    candidate: any;
    stageName: InterviewStageTitle;
    score: number;
  }
) {
  try {
    const { projectId, projRow, candidate, stageName, score } = params;
    const effPid = String(projRow?.id || projectId || candidate?.project_id || "").trim();
    const resolvedProj =
      projRow ||
      (effPid
        ? await db.get(
            `SELECT id, public_id, employer_id, responsible_employer_id, responsible_employer_ids, company_id, role_name
             FROM projects WHERE id = ? OR CAST(public_id AS TEXT) = ? LIMIT 1`,
            [effPid, effPid]
          )
        : null);

    const candPub = String(candidate?.public_id || candidate?.id || "");
    const candName = String(candidate?.full_name || candidate?.email || `Кандидат #${candPub}`);
    const roleName = String(resolvedProj?.role_name || candidate?.role_name || "Вакансия");
    const roundedScore = Math.round(Number(score) || 0);

    const { dispatchVacancyBellAndPushToResponsibles } = await import("./vacancyResponsiblesResolver");
    const { primaryLink } = await dispatchVacancyBellAndPushToResponsibles(db, {
      projectId: resolvedProj?.id || effPid,
      projRow: resolvedProj,
      fallbackEmpId: candidate?.employer_id || null,
      eventKey: "interview_stages",
      kind: "interview_stage",
      title: `${stageName}: ${candName} (${roundedScore}/100)`,
      body: `Вакансия «${roleName}». Этап «${stageName}» оценён на ${roundedScore} из 100 баллов.`,
      linkBuilder: (pub) => `/emp${pub}/crm?candidate=${encodeURIComponent(candPub)}`,
      meta: {
        candidate_id: candPub,
        project_id: resolvedProj?.id || effPid,
        stage_name: stageName,
        score: roundedScore,
      },
    });

    if (resolvedProj?.id || effPid) {
      const { sendVacancyTelegramNotification } = await import("../telegram");
      await sendVacancyTelegramNotification(
        db,
        String(resolvedProj?.id || effPid),
        `📝 <b>Этап интервью: ${stageName}</b>\n👤 ${candName}\n💼 Вакансия: ${roleName}\n📊 Оценка этапа: <b>${roundedScore}/100</b>`,
        {
          eventKey: "interview_stages",
          dedupKey: `stage_${candPub}_${stageName}_${roundedScore}`,
          button: { text: "🎯 Открыть кандидата в CRM", url: primaryLink },
        }
      );
    }
  } catch (err: any) {
    console.warn("[notifyEmployerInterviewStage] Notice:", err?.message || err);
  }
}

export async function notifyEmployerInterviewResult(
  db: PgDBWrapper,
  params: {
    projectId: string | number;
    projRow?: any;
    candidate: any;
    overallScore: number;
    passScore: number;
    passed: boolean;
  }
) {
  try {
    const { projectId, projRow, candidate, overallScore, passScore, passed } = params;
    const effPid = String(projRow?.id || projectId || candidate?.project_id || "").trim();
    const resolvedProj =
      projRow ||
      (effPid
        ? await db.get(
            `SELECT id, public_id, employer_id, responsible_employer_id, responsible_employer_ids, company_id, role_name
             FROM projects WHERE id = ? OR CAST(public_id AS TEXT) = ? LIMIT 1`,
            [effPid, effPid]
          )
        : null);

    const candPub = String(candidate?.public_id || candidate?.id || "");
    const candName = String(candidate?.full_name || candidate?.email || `Кандидат #${candPub}`);
    const roleName = String(resolvedProj?.role_name || candidate?.role_name || "Вакансия");
    const roundedOverall = Math.round(Number(overallScore) || 0);
    const eventKey = passed ? "interview_success" : "interview_reject";

    const { dispatchVacancyBellAndPushToResponsibles } = await import("./vacancyResponsiblesResolver");
    const { primaryLink } = await dispatchVacancyBellAndPushToResponsibles(db, {
      projectId: resolvedProj?.id || effPid,
      projRow: resolvedProj,
      fallbackEmpId: candidate?.employer_id || null,
      eventKey,
      kind: eventKey,
      title: passed
        ? `Интервью Успех: ${candName} (${roundedOverall}/100)`
        : `Интервью Отказ: ${candName} (${roundedOverall}/100)`,
      body: `Вакансия «${roleName}». Итог трёх этапов: ${roundedOverall} из 100 (проходной: ${passScore}). Статус: ${
        passed ? "Рекомендован к обучению" : "Ниже проходного порога"
      }.`,
      linkBuilder: (pub) => `/emp${pub}/crm?candidate=${encodeURIComponent(candPub)}`,
      meta: {
        candidate_id: candPub,
        project_id: resolvedProj?.id || effPid,
        overall_score: roundedOverall,
        pass_score: passScore,
        passed,
      },
    });

    if (resolvedProj?.id || effPid) {
      const { sendVacancyTelegramNotification } = await import("../telegram");
      const headerEmoji = passed ? "🏆" : "📋";
      const statusText = passed ? "Успех — допущен к обучению" : "Отказ — ниже проходного балла";
      await sendVacancyTelegramNotification(
        db,
        String(resolvedProj?.id || effPid),
        `${headerEmoji} <b>${passed ? "Интервью Успех" : "Интервью Отказ"}</b>\n👤 ${candName}\n💼 Вакансия: ${roleName}\n📊 Итог трёх этапов: <b>${roundedOverall}/100</b> (порог: ${passScore})\n📌 Статус: ${statusText}`,
        {
          eventKey,
          dedupKey: `result_${candPub}_${eventKey}_${roundedOverall}`,
          button: { text: "🎯 Открыть результаты в CRM", url: primaryLink },
        }
      );
    }
  } catch (err: any) {
    console.warn("[notifyEmployerInterviewResult] Notice:", err?.message || err);
  }
}
