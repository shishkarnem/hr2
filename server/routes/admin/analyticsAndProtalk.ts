import { Router, Request, Response } from "express";
import { getProTalkDB } from "../../db";

export const adminAnalyticsProtalkRouter = Router();

adminAnalyticsProtalkRouter.get("/protalk-bots", async (_req: Request, res: Response) => {
  try {
    const db = await getProTalkDB();
    const rows = await db.all("SELECT * FROM protalk_bots ORDER BY created_at ASC NULLS LAST");
    return res.json(rows);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

adminAnalyticsProtalkRouter.post("/protalk-bots", async (req: Request, res: Response) => {
  try {
    const { id, system_name, bot_id, bot_name, model_type, model_alias, bot_token, api_url, temperature, is_active, user_prefix } =
      req.body || {};
    const botId = id || `pt-${Date.now()}`;
    const db = await getProTalkDB();
    await db.run(
      `INSERT INTO protalk_bots (id, system_name, bot_id, bot_name, model_type, model_alias, bot_token, api_url, temperature, is_active, user_prefix, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
       ON CONFLICT (id) DO UPDATE SET
         system_name = EXCLUDED.system_name,
         bot_id = EXCLUDED.bot_id,
         bot_name = EXCLUDED.bot_name,
         model_type = EXCLUDED.model_type,
         model_alias = EXCLUDED.model_alias,
         bot_token = EXCLUDED.bot_token,
         api_url = EXCLUDED.api_url,
         temperature = EXCLUDED.temperature,
         is_active = EXCLUDED.is_active,
         user_prefix = EXCLUDED.user_prefix,
         updated_at = NOW()`,
      [
        botId,
        system_name || model_type || "chat",
        Number(bot_id) || 66337,
        bot_name || "ProTalk Bot",
        model_type || "chat",
        model_alias || "hr_rr",
        bot_token || "kEL1nRZp330QvUrG1KenhRQ2JIynkWLs",
        api_url || "https://ai.pro-talk.ru/v1/chat/completions",
        temperature !== undefined ? Number(temperature) : 0.1,
        is_active !== undefined ? Number(is_active) : 1,
        user_prefix || "{id}_RRchat",
      ]
    );
    return res.json({ success: true, id: botId, message: "Бот ProTalk успешно сохранен в базе данных" });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

adminAnalyticsProtalkRouter.get("/protalk-prompts", async (_req: Request, res: Response) => {
  try {
    const db = await getProTalkDB();
    const rows = await db.all(
      `SELECT p.*, b.bot_name, b.bot_id as protalk_bot_num, b.model_alias, b.user_prefix
       FROM protalk_prompts p
       LEFT JOIN protalk_bots b ON p.bot_id = b.id
       ORDER BY p.created_at ASC NULLS LAST`
    );
    return res.json(rows);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

adminAnalyticsProtalkRouter.post("/protalk-prompts", async (req: Request, res: Response) => {
  try {
    const {
      id,
      prompt_key,
      prompt_name,
      bot_id,
      system_prompt,
      user_prompt_template,
      function_id,
      log_url,
      description,
      is_active,
    } = req.body || {};
    if (!prompt_key) {
      return res.status(400).json({ error: "Ключ (prompt_key) обязателен" });
    }
    const db = await getProTalkDB();
    const existing = await db.get(
      `SELECT * FROM protalk_prompts WHERE id = ? OR prompt_key = ? LIMIT 1`,
      [id || "", String(prompt_key).trim()]
    );
    const promptId = existing?.id || id || `p-${Date.now()}`;
    const resolvedLogUrl =
      log_url !== undefined
        ? String(log_url).trim()
        : existing?.log_url !== undefined && existing?.log_url !== null
        ? String(existing.log_url)
        : "https://docs.google.com/spreadsheets/d/1HAhAbwKRIXPFi8KhqLhDW6-Ha2tjQf4pj8rrSGPML8A/edit?usp=sharing";
    const resolvedFunctionId =
      function_id !== undefined
        ? function_id === "" || function_id === null
          ? null
          : Number(function_id)
        : existing?.function_id ?? null;

    await db.run(
      `INSERT INTO protalk_prompts (id, prompt_key, prompt_name, bot_id, system_prompt, user_prompt_template, function_id, log_url, description, is_active, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
       ON CONFLICT (id) DO UPDATE SET
         prompt_key = EXCLUDED.prompt_key,
         prompt_name = EXCLUDED.prompt_name,
         bot_id = EXCLUDED.bot_id,
         system_prompt = EXCLUDED.system_prompt,
         user_prompt_template = EXCLUDED.user_prompt_template,
         function_id = EXCLUDED.function_id,
         log_url = EXCLUDED.log_url,
         description = EXCLUDED.description,
         is_active = EXCLUDED.is_active,
         updated_at = NOW()`,
      [
        promptId,
        String(prompt_key).trim(),
        prompt_name ?? existing?.prompt_name ?? prompt_key,
        bot_id ?? existing?.bot_id ?? "pt-1",
        system_prompt !== undefined ? system_prompt : existing?.system_prompt || "",
        user_prompt_template !== undefined ? user_prompt_template : existing?.user_prompt_template || "",
        resolvedFunctionId,
        resolvedLogUrl,
        description !== undefined ? description : existing?.description || "",
        is_active !== undefined ? Number(is_active) : existing?.is_active ?? 1,
      ]
    );

    return res.json({
      success: true,
      id: promptId,
      log_url: resolvedLogUrl,
      message: "Промпт ProTalk успешно сохранен в базе данных",
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

adminAnalyticsProtalkRouter.get("/ai-analytics", async (_req: Request, res: Response) => {
  try {
    const db = await getProTalkDB();

    const totals =
      (await db.get(`
        SELECT
          COUNT(*)::int as total_requests,
          COALESCE(SUM(CAST(tokens_in_source AS DOUBLE PRECISION)), 0) as tokens_in_sum,
          COALESCE(SUM(CAST(tokens_out_source AS DOUBLE PRECISION)), 0) as tokens_out_sum,
          COALESCE(SUM(CAST(tokens_total AS DOUBLE PRECISION)), 0) as tokens_total_sum,
          COALESCE(SUM(CAST(tokens_user AS DOUBLE PRECISION)), 0) as tokens_user_sum,
          COALESCE(SUM(CAST(cost_rub AS DOUBLE PRECISION)), 0) as cost_rub_sum,
          COALESCE(SUM(CAST(cost_rub AS DOUBLE PRECISION)), 0) / 95.0 as cost_usd_sum
        FROM logs
      `)) || {};

    const byType =
      (await db.all(`
        SELECT
          COALESCE(NULLIF(channel_name, ''), 'other') as channel_name,
          COALESCE(NULLIF(llm, ''), 'unknown') as llm,
          COALESCE(NULLIF(CAST(bot_id AS TEXT), ''), '-') as bot_id,
          COUNT(*)::int as requests_count,
          COALESCE(SUM(CAST(tokens_in_source AS DOUBLE PRECISION)), 0) as tokens_in_sum,
          COALESCE(SUM(CAST(tokens_out_source AS DOUBLE PRECISION)), 0) as tokens_out_sum,
          COALESCE(SUM(CAST(tokens_total AS DOUBLE PRECISION)), 0) as tokens_total_sum,
          COALESCE(SUM(CAST(cost_rub AS DOUBLE PRECISION)), 0) as cost_rub_sum,
          MAX(created_at) as last_used_at
        FROM logs
        GROUP BY channel_name, llm, bot_id
        ORDER BY tokens_total_sum DESC, requests_count DESC
      `)) || [];

    const recentLogs =
      (await db.all(`SELECT * FROM logs ORDER BY id DESC LIMIT 250`)) || [];

    const roboPaid =
      (await db
        .get(
          `SELECT COALESCE(SUM(CAST(amount_rub AS DOUBLE PRECISION)), 0) as sum_rub, COUNT(*)::int as count_paid
           FROM payments_robokassa WHERE CAST(status AS TEXT) IN ('success', 'paid', '1')`
        )
        .catch(() => null)) || { sum_rub: 0, count_paid: 0 };

    const roboAll =
      (await db
        .get(
          `SELECT COALESCE(SUM(CAST(amount_rub AS DOUBLE PRECISION)), 0) as sum_rub, COUNT(*)::int as count_all
           FROM payments_robokassa`
        )
        .catch(() => null)) || { sum_rub: 0, count_all: 0 };

    const txTotals =
      (await db
        .get(
          `SELECT
             COALESCE(SUM(CASE WHEN COALESCE(amount_rr, 0) > 0 THEN amount_rr ELSE 0 END), 0) as deposits_rub,
             COALESCE(SUM(CASE WHEN COALESCE(amount_rr, 0) < 0 THEN ABS(amount_rr) ELSE 0 END), 0) as spends_rub,
             COUNT(*)::int as count_all
           FROM transactions`
        )
        .catch(() => null)) || { deposits_rub: 0, spends_rub: 0, count_all: 0 };

    const recentPayments =
      (await db
        .all(
          `SELECT p.*, e.name as employer_name, e.email as employer_email, e.public_id as employer_public_id
           FROM payments_robokassa p
           LEFT JOIN employers e ON CAST(p.employer_id AS TEXT) = e.id OR CAST(p.employer_id AS TEXT) = CAST(e.public_id AS TEXT)
           ORDER BY p.created_at DESC NULLS LAST
           LIMIT 15`
        )
        .catch(() => [])) || [];

    const recentTransactions =
      (await db
        .all(
          `SELECT t.*, w.employer_id
           FROM transactions t
           LEFT JOIN wallets w ON t.wallet_id = w.id
           ORDER BY t.created_at DESC NULLS LAST
           LIMIT 15`
        )
        .catch(() => [])) || [];

    const totalRevenueRub = Number(roboPaid.sum_rub || 0);
    const totalAiCostRub = Number(totals.cost_rub_sum || 0);
    const netProfitRub = totalRevenueRub - totalAiCostRub;
    const marginPercent =
      totalRevenueRub > 0 ? Math.round(((totalRevenueRub - totalAiCostRub) / totalRevenueRub) * 100) : 0;

    const financial = {
      robokassa_paid_sum: Number(roboPaid.sum_rub || 0),
      robokassa_paid_count: Number(roboPaid.count_paid || 0),
      robokassa_all_sum: Number(roboAll.sum_rub || 0),
      robokassa_all_count: Number(roboAll.count_all || 0),
      transactions_deposits_rub: Number(txTotals.deposits_rub || 0),
      transactions_spends_rub: Number(txTotals.spends_rub || 0),
      transactions_count: Number(txTotals.count_all || 0),
      total_revenue_rub: totalRevenueRub,
      total_ai_cost_rub: totalAiCostRub,
      net_profit_rub: netProfitRub,
      margin_percent: marginPercent,
      recent_payments: recentPayments,
      recent_transactions: recentTransactions,
    };

    const empTotal = Number((await db.get("SELECT COUNT(*)::int as c FROM employers"))?.c || 0);
    const withCompany = Number(
      (
        await db.get(
          "SELECT COUNT(DISTINCT employer_id)::int as c FROM companies WHERE employer_id IS NOT NULL AND trim(employer_id) != ''"
        )
      )?.c || 0
    );
    const withVacancy = Number(
      (
        await db.get(
          "SELECT COUNT(DISTINCT employer_id)::int as c FROM projects WHERE employer_id IS NOT NULL AND trim(employer_id) != ''"
        )
      )?.c || 0
    );
    const withCandidates = Number(
      (
        await db.get(
          `SELECT COUNT(DISTINCT p.employer_id)::int as c
           FROM candidates c
           JOIN projects p ON c.project_id = p.id
           WHERE p.employer_id IS NOT NULL`
        )
      )?.c || 0
    );
    const withPayments = Number(
      (
        await db
          .get(
            `SELECT COUNT(DISTINCT employer_id)::int as c
             FROM payments_robokassa
             WHERE CAST(status AS TEXT) IN ('success', 'paid', '1') AND employer_id IS NOT NULL`
          )
          .catch(() => null)
      )?.c || 0
    );

    const planStats =
      (await db.all(`SELECT plan, COUNT(*)::int as count FROM employers GROUP BY plan ORDER BY count DESC`)) ||
      [];
    const regSourceStats =
      (await db.all(
        `SELECT COALESCE(NULLIF(registered_via, ''), 'direct') as source, COUNT(*)::int as count FROM employers GROUP BY source ORDER BY count DESC`
      )) || [];

    const funnel = {
      total_employers: empTotal,
      with_company: withCompany,
      with_vacancy: withVacancy,
      with_candidates: withCandidates,
      with_payments: withPayments,
      conv_reg_to_company: empTotal > 0 ? Math.round((withCompany / empTotal) * 100) : 0,
      conv_company_to_vacancy: withCompany > 0 ? Math.round((withVacancy / withCompany) * 100) : 0,
      conv_vacancy_to_candidates: withVacancy > 0 ? Math.round((withCandidates / withVacancy) * 100) : 0,
      conv_candidates_to_payment: withCandidates > 0 ? Math.round((withPayments / withCandidates) * 100) : 0,
      conv_overall: empTotal > 0 ? Math.round((withPayments / empTotal) * 100) : 0,
      plans: planStats,
      sources: regSourceStats,
    };

    return res.json({
      success: true,
      totals,
      byType,
      recentLogs,
      financial,
      funnel,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});
