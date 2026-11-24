import { Router, Request, Response } from "express";
import { saveProjectToProTalkDB, getProTalkDB, recalculateEmployerBalances } from "../../db";

async function handleReallocateLimits(req: Request, res: Response) {
  try {
    const db = await getProTalkDB();
    const projectId = req.params.id || req.body.project_id || req.body.projectId || req.body._project;
    const newInterviewLimit = Number(
      req.body.new_interview_limit ?? req.body.newInterviewLimit ?? req.body._new_interview_limit
    );
    const newTrainingLimit = Number(
      req.body.new_training_limit ?? req.body.newTrainingLimit ?? req.body._new_training_limit
    );
    const employerIdParam = req.body.employer_id || req.body.employerId;

    if (!projectId) {
      return res.status(400).json({ ok: false, success: false, error: "project_id is required" });
    }

    const proj = await db.get(
      "SELECT * FROM projects WHERE id = ? OR CAST(public_id AS TEXT) = ? LIMIT 1",
      [projectId, String(projectId)]
    );
    if (!proj) {
      return res.status(404).json({ ok: false, success: false, error: "Vacancy not found" });
    }

    const curInterviewLimit = Number(proj.interview_limit ?? proj.max_interviews ?? 0);
    const curTrainingLimit = Number(proj.training_limit ?? proj.max_trainings ?? 0);
    const interviewUsed = Number(proj.interview_used ?? 0);
    const trainingUsed = Number(proj.training_used ?? 0);

    if (newInterviewLimit < interviewUsed) {
      return res.status(400).json({
        ok: false,
        success: false,
        error: "interview_limit_below_used",
        message: `Лимит интервью (${newInterviewLimit}) нельзя опустить ниже уже использованных (${interviewUsed})`,
      });
    }
    if (newTrainingLimit < trainingUsed) {
      return res.status(400).json({
        ok: false,
        success: false,
        error: "training_limit_below_used",
        message: `Лимит обучений (${newTrainingLimit}) нельзя опустить ниже уже использованных (${trainingUsed})`,
      });
    }

    let emp: any = null;
    if (employerIdParam) {
      const cleanTarget = String(employerIdParam).replace(/^emp-?/i, "").trim();
      emp = await db.get(
        "SELECT * FROM employers WHERE id = ? OR CAST(public_id AS TEXT) = ? OR id = ? OR CAST(public_id AS TEXT) = ? LIMIT 1",
        [employerIdParam, String(employerIdParam), cleanTarget, `emp-${cleanTarget}`]
      );
    }
    if (!emp && proj.company_id) {
      const comp = await db.get(
        "SELECT owner_employer_id, employer_id FROM companies WHERE id = ? OR CAST(public_id AS TEXT) = ? LIMIT 1",
        [proj.company_id, String(proj.company_id)]
      );
      const ownerTarget = comp?.owner_employer_id || comp?.employer_id;
      if (ownerTarget) {
        const cleanOwner = String(ownerTarget).replace(/^emp-?/i, "").trim();
        emp = await db.get(
          "SELECT * FROM employers WHERE id = ? OR CAST(public_id AS TEXT) = ? OR id = ? OR CAST(public_id AS TEXT) = ? LIMIT 1",
          [ownerTarget, String(ownerTarget), cleanOwner, `emp-${cleanOwner}`]
        );
      }
    }
    if (!emp && proj.employer_id) {
      const cleanTarget = String(proj.employer_id).replace(/^emp-?/i, "").trim();
      emp = await db.get(
        "SELECT * FROM employers WHERE id = ? OR CAST(public_id AS TEXT) = ? OR id = ? OR CAST(public_id AS TEXT) = ? LIMIT 1",
        [proj.employer_id, String(proj.employer_id), cleanTarget, `emp-${cleanTarget}`]
      );
    }
    if (!emp) {
      emp = await db.get("SELECT * FROM employers LIMIT 1");
    }
    if (!emp) {
      return res.status(404).json({ ok: false, success: false, error: "Employer not found" });
    }

    let limitsJson: any = {};
    try {
      if (emp.limits_json) limitsJson = JSON.parse(emp.limits_json);
    } catch {}

    const empInterviewCredits = Number(
      emp.interview_credits ?? limitsJson.interviews ?? limitsJson.interviewCredits ?? 0
    );
    const empTrainingCredits = Number(
      emp.training_credits ?? limitsJson.trainings ?? limitsJson.trainingCredits ?? 0
    );

    const deltaInterview = newInterviewLimit - curInterviewLimit;
    const deltaTraining = newTrainingLimit - curTrainingLimit;

    if (deltaInterview > 0 && empInterviewCredits < deltaInterview) {
      return res.status(400).json({
        ok: false,
        success: false,
        error: "not_enough_interview_pool",
        message: `На общем балансе не хватает интервью (нужно ${deltaInterview}, доступно ${empInterviewCredits})`,
      });
    }
    if (deltaTraining > 0 && empTrainingCredits < deltaTraining) {
      return res.status(400).json({
        ok: false,
        success: false,
        error: "not_enough_training_pool",
        message: `На общем балансе не хватает обучений (нужно ${deltaTraining}, доступно ${empTrainingCredits})`,
      });
    }

    const updatedEmpInterviews = Math.max(0, empInterviewCredits - deltaInterview);
    const updatedEmpTrainings = Math.max(0, empTrainingCredits - deltaTraining);
    limitsJson.interviews = updatedEmpInterviews;
    limitsJson.trainings = updatedEmpTrainings;

    await db.run(
      "UPDATE employers SET interview_credits = ?, training_credits = ?, limits_json = ?, updated_at = NOW() WHERE id = ?",
      [updatedEmpInterviews, updatedEmpTrainings, JSON.stringify(limitsJson), emp.id]
    );

    await db.run(
      "UPDATE projects SET interview_limit = ?, max_interviews = ?, training_limit = ?, max_trainings = ?, updated_at = NOW() WHERE id = ?",
      [newInterviewLimit, newInterviewLimit, newTrainingLimit, newTrainingLimit, proj.id]
    );

    const updatedProj = await db.get("SELECT * FROM projects WHERE id = ?", [proj.id]);

    try {
      const { checkEmployerLowGeneralLimits, checkVacancyLowLimits } = await import(
        "../../services/notifications/lowBalanceNotifier"
      );
      const prevPoolTotal = empInterviewCredits + empTrainingCredits;
      const prevVacRem =
        (curInterviewLimit > 0 ? Math.max(0, curInterviewLimit - interviewUsed) : 0) +
        (curTrainingLimit > 0 ? Math.max(0, curTrainingLimit - trainingUsed) : 0);
      await checkEmployerLowGeneralLimits(db, emp.id, prevPoolTotal);
      await checkVacancyLowLimits(db, proj.id, emp.id, prevVacRem);
    } catch {}

    return res.json({
      ok: true,
      success: true,
      message: "Лимиты вакансии успешно обновлены",
      project: updatedProj,
      employerPool: {
        interviewCredits: updatedEmpInterviews,
        trainingCredits: updatedEmpTrainings,
      },
    });
  } catch (err: any) {
    console.error("Error reallocating limits:", err);
    return res.status(500).json({ ok: false, success: false, error: err.message });
  }
}

async function handleBuyLimits(req: Request, res: Response) {
  try {
    const db = await getProTalkDB();
    const projectId = req.params.id || req.body.project_id || req.body.projectId;
    const interviewQty = Math.max(0, Math.floor(Number(req.body.interview_qty || req.body.interviewQty || 0)));
    const trainingQty = Math.max(0, Math.floor(Number(req.body.training_qty || req.body.trainingQty || 0)));
    const employerIdParam = req.body.employer_id || req.body.employerId;

    const totalQty = interviewQty + trainingQty;
    if (totalQty <= 0) {
      return res.status(400).json({ ok: false, success: false, error: "Укажите количество покупаемых лимитов" });
    }
    if (!projectId) {
      return res.status(400).json({ ok: false, success: false, error: "project_id is required" });
    }

    const proj = await db.get(
      "SELECT * FROM projects WHERE id = ? OR CAST(public_id AS TEXT) = ? LIMIT 1",
      [projectId, String(projectId)]
    );
    if (!proj) {
      return res.status(404).json({ ok: false, success: false, error: "Вакансия не найдена" });
    }

    let emp: any = null;
    const empTarget = employerIdParam || proj.employer_id;
    if (empTarget) {
      const cleanTarget = String(empTarget).replace(/^emp-?/i, "").trim();
      emp = await db.get(
        "SELECT * FROM employers WHERE id = ? OR CAST(public_id AS TEXT) = ? OR id = ? OR CAST(public_id AS TEXT) = ? LIMIT 1",
        [empTarget, String(empTarget), cleanTarget, `emp-${cleanTarget}`]
      );
    }
    if (!emp) {
      emp = await db.get("SELECT * FROM employers LIMIT 1");
    }
    if (!emp) {
      return res.status(404).json({ ok: false, success: false, error: "Работодатель не найден" });
    }

    let unitPrice = 200;
    if (totalQty >= 200) unitPrice = 50;
    else if (totalQty >= 50) unitPrice = 100;
    else if (totalQty >= 10) unitPrice = 150;

    const totalCostRR = totalQty * unitPrice;
    const currentBalance = Number(emp.balance || 0);

    if (currentBalance < totalCostRR) {
      return res.status(400).json({
        ok: false,
        success: false,
        error: `Недостаточно RR на балансе. Требуется: ${totalCostRR} RR, на балансе: ${currentBalance} RR.`,
      });
    }

    const newBalance = currentBalance - totalCostRR;
    const curInterviewLimit = Number(proj.interview_limit ?? proj.max_interviews ?? 0);
    const curTrainingLimit = Number(proj.training_limit ?? proj.max_trainings ?? 0);
    const newInterviewLimit = curInterviewLimit + interviewQty;
    const newTrainingLimit = curTrainingLimit + trainingQty;

    await db.run("UPDATE employers SET balance = ?, updated_at = NOW() WHERE id = ?", [newBalance, emp.id]);

    await db.run(
      "UPDATE projects SET interview_limit = ?, max_interviews = ?, training_limit = ?, max_trainings = ?, updated_at = NOW() WHERE id = ?",
      [newInterviewLimit, newInterviewLimit, newTrainingLimit, newTrainingLimit, proj.id]
    );

    const txId = `tx-buy-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const roleName = proj.role_name || "Вакансия";
    const note = `Покупка лимитов для вакансии «${roleName}» (+${interviewQty} интервью, +${trainingQty} обучений) по ${unitPrice} RR/шт`;

    try {
      await db.run(
        "INSERT INTO payments (id, employer_id, company_name, amount, item_type, item_name, status, data_json, created_at) VALUES (?, ?, ?, ?, 'limit_purchase', ?, 'completed', ?, ?)",
        [txId, emp.id, proj.company_name || "", totalCostRR, note, JSON.stringify({ project_id: proj.id }), new Date().toISOString()]
      );
    } catch {}

    try {
      const wallet = await db.get("SELECT id FROM wallets WHERE employer_id = ? LIMIT 1", [emp.id]);
      if (wallet) {
        await db.run(
          "INSERT INTO transactions (id, wallet_id, amount_rr, type, type_balance, description, note, ref_table, ref_id, created_at) VALUES (?, ?, ?, 'expense', 'limits', ?, ?, 'projects', ?, NOW())",
          [txId, wallet.id, -totalCostRR, note, note, proj.id]
        );
      }
    } catch {}

    await recalculateEmployerBalances(db, emp.id);
    const updatedProj = await db.get("SELECT * FROM projects WHERE id = ?", [proj.id]);

    try {
      const { checkEmployerLowBalanceRR } = await import("../../services/notifications/lowBalanceNotifier");
      await checkEmployerLowBalanceRR(db, emp.id, currentBalance);
    } catch {}

    return res.json({
      ok: true,
      success: true,
      message: `Лимиты для вакансии успешно оплачены и начислены (+${interviewQty} интервью, +${trainingQty} обучений)`,
      totalCostRR,
      unitPrice,
      newBalance,
      project: updatedProj,
    });
  } catch (err: any) {
    console.error("Error buying vacancy limits:", err);
    return res.status(500).json({ ok: false, success: false, error: err.message });
  }
}

async function handleTransferLimits(req: Request, res: Response) {
  try {
    const db = await getProTalkDB();
    const sourceId = req.body.source_project_id || req.body.sourceProjectId;
    const targetId = req.body.target_project_id || req.body.targetProjectId;
    const interviewCount = Math.max(0, Number(req.body.interview_count ?? req.body.interviewCount ?? 0));
    const trainingCount = Math.max(0, Number(req.body.training_count ?? req.body.trainingCount ?? 0));

    if (!sourceId || !targetId) {
      return res.status(400).json({ ok: false, error: "source_project_id and target_project_id are required" });
    }

    const source = await db.get(
      "SELECT * FROM projects WHERE id = ? OR CAST(public_id AS TEXT) = ? LIMIT 1",
      [sourceId, String(sourceId)]
    );
    const target = await db.get(
      "SELECT * FROM projects WHERE id = ? OR CAST(public_id AS TEXT) = ? LIMIT 1",
      [targetId, String(targetId)]
    );
    if (!source || !target) {
      return res.status(404).json({ ok: false, error: "Source or target vacancy not found" });
    }

    const sInterviewLimit = Number(source.interview_limit ?? 0);
    const sInterviewUsed = Number(source.interview_used ?? 0);
    const sTrainingLimit = Number(source.training_limit ?? 0);
    const sTrainingUsed = Number(source.training_used ?? 0);

    const availInterview = Math.max(0, sInterviewLimit - sInterviewUsed);
    const availTraining = Math.max(0, sTrainingLimit - sTrainingUsed);

    const actualInterviewTransfer = Math.min(availInterview, interviewCount);
    const actualTrainingTransfer = Math.min(availTraining, trainingCount);

    const newSourceInterview = Math.max(sInterviewUsed, sInterviewLimit - actualInterviewTransfer);
    const newSourceTraining = Math.max(sTrainingUsed, sTrainingLimit - actualTrainingTransfer);

    const newTargetInterview = Number(target.interview_limit ?? 0) + actualInterviewTransfer;
    const newTargetTraining = Number(target.training_limit ?? 0) + actualTrainingTransfer;

    await saveProjectToProTalkDB(db, {
      ...source,
      interview_limit: newSourceInterview,
      training_limit: newSourceTraining,
    });
    await saveProjectToProTalkDB(db, {
      ...target,
      interview_limit: newTargetInterview,
      training_limit: newTargetTraining,
    });

    return res.json({
      ok: true,
      transferredInterviews: actualInterviewTransfer,
      transferredTrainings: actualTrainingTransfer,
      sourceInterviewLimit: newSourceInterview,
      sourceTrainingLimit: newSourceTraining,
      targetInterviewLimit: newTargetInterview,
      targetTrainingLimit: newTargetTraining,
    });
  } catch (err: any) {
    console.error("Error transferring vacancy limits:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}

async function handleCopyTraining(req: Request, res: Response) {
  try {
    const db = await getProTalkDB();
    const sourceId = req.body.source_project_id || req.body.sourceProjectId;
    const targetId = req.body.target_project_id || req.body.targetProjectId;

    if (!sourceId || !targetId) {
      return res.status(400).json({ ok: false, error: "source_project_id and target_project_id are required" });
    }

    const source = await db.get(
      "SELECT * FROM projects WHERE id = ? OR CAST(public_id AS TEXT) = ? LIMIT 1",
      [sourceId, String(sourceId)]
    );
    const target = await db.get(
      "SELECT * FROM projects WHERE id = ? OR CAST(public_id AS TEXT) = ? LIMIT 1",
      [targetId, String(targetId)]
    );
    if (!source || !target) {
      return res.status(404).json({ ok: false, error: "Source or target vacancy not found" });
    }

    const sActualId = source.id;
    const tActualId = target.id;

    await saveProjectToProTalkDB(db, {
      ...target,
      training_intro_text: source.training_intro_text || target.training_intro_text,
      training_prof_text: source.training_prof_text || target.training_prof_text,
      training_professional_text: source.training_professional_text || target.training_professional_text,
      training_product_text: source.training_product_text || target.training_product_text,
      training_system_text: source.training_system_text || target.training_system_text,
      training_systems_text: source.training_systems_text || target.training_systems_text,
      training_wiki_text: source.training_wiki_text || target.training_wiki_text,
      training_regulations_text: source.training_regulations_text || target.training_regulations_text,
      training_published:
        source.training_published !== undefined ? source.training_published : target.training_published,
    });

    const sourceBlocks =
      (await db.all("SELECT * FROM training_blocks WHERE project_id = ? ORDER BY order_index ASC, id ASC", [
        sActualId,
      ])) || [];
    let copiedBlocksCount = 0;
    for (const b of sourceBlocks) {
      const newBlockId = "tblk_" + Math.random().toString(36).substring(2, 9) + "_" + Date.now().toString(36);
      await db.run(
        `INSERT INTO training_blocks (
          id, project_id, stage, title, block_key, materials_md, content, subpages_json, pass_score, order_index, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
        ON CONFLICT (project_id, stage) DO UPDATE SET
          title = EXCLUDED.title,
          block_key = EXCLUDED.block_key,
          materials_md = EXCLUDED.materials_md,
          content = EXCLUDED.content,
          subpages_json = EXCLUDED.subpages_json,
          pass_score = EXCLUDED.pass_score,
          order_index = EXCLUDED.order_index,
          updated_at = NOW()`,
        [
          newBlockId,
          tActualId,
          b.stage,
          b.title || "",
          b.block_key || b.stage || null,
          b.materials_md || b.content || "",
          b.content || b.materials_md || "",
          b.subpages_json || null,
          Number(b.pass_score ?? 70),
          Number(b.order_index ?? 0),
        ]
      );
      copiedBlocksCount++;
    }

    const sourceTests =
      (await db.all("SELECT * FROM training_stage_tests WHERE project_id = ? ORDER BY stage ASC, id ASC", [
        sActualId,
      ])) || [];
    let copiedTestsCount = 0;
    for (const t of sourceTests) {
      const newTestId = "tst_" + Math.random().toString(36).substring(2, 9) + "_" + Date.now().toString(36);
      const qJson = t.questions_json || t.questions || "[]";
      const pass = Number(t.pass_score ?? t.passing_score ?? 70);
      await db.run(
        `INSERT INTO training_stage_tests (
          id, project_id, stage, questions, questions_json, pass_score, passing_score, total_score, shuffle_questions, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
        ON CONFLICT (project_id, stage) DO UPDATE SET
          questions = EXCLUDED.questions,
          questions_json = EXCLUDED.questions_json,
          pass_score = EXCLUDED.pass_score,
          passing_score = EXCLUDED.passing_score,
          total_score = EXCLUDED.total_score,
          shuffle_questions = EXCLUDED.shuffle_questions,
          status = EXCLUDED.status,
          updated_at = NOW()`,
        [
          newTestId,
          tActualId,
          t.stage,
          qJson,
          qJson,
          pass,
          pass,
          Number(t.total_score ?? 100),
          Number(t.shuffle_questions ?? 1),
          t.status || "completed",
        ]
      );
      copiedTestsCount++;
    }

    return res.json({
      ok: true,
      success: true,
      copiedBlocks: copiedBlocksCount,
      copiedTests: copiedTestsCount,
      sourceTitle: source.role_name,
      targetTitle: target.role_name,
    });
  } catch (err: any) {
    console.error("Error copying training:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}

export function registerProjectLimitRoutes(projectsRouter: Router) {
  projectsRouter.post("/projects/reallocate-limits", handleReallocateLimits);
  projectsRouter.post("/projects/:id/reallocate-limits", handleReallocateLimits);
  projectsRouter.post("/reallocate-limits", handleReallocateLimits);

  projectsRouter.post("/projects/buy-limits", handleBuyLimits);
  projectsRouter.post("/projects/:id/buy-limits", handleBuyLimits);
  projectsRouter.post("/buy-limits", handleBuyLimits);

  projectsRouter.post("/projects/transfer-limits", handleTransferLimits);
  projectsRouter.post("/transfer-limits", handleTransferLimits);

  projectsRouter.post("/projects/copy-training", handleCopyTraining);
  projectsRouter.post("/copy-training", handleCopyTraining);
}
