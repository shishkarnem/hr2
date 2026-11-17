import crypto from "crypto";
import { PgDBWrapper, pgWrapper } from "./pgClient";
import { transliterateToSlug } from "./helpers";
import {
  STANDARD_CANDIDATE_FIELDS,
  extractFieldsFromResumeText,
  parseVacancyCandidateFieldsConfig,
} from "../../src/lib/candidateFields";

export function generateId(prefix: string = "id"): string {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

export async function normalizeAllSlugsInProTalkDB(db: PgDBWrapper): Promise<void> {
  try {
    if (!db) return;

    const companies =
      (await db.all(
        `SELECT id, name, slug, legacy_slug, allslug, public_id, owner_employer_id, employer_id
         FROM companies
         ORDER BY
           CASE
             WHEN public_id = 300047 OR id = '526df7fb-228b-4661-9156-d5e23c4bfbab' THEN 0
             WHEN (name = 'РентРОП' OR slug = 'rentrop')
              AND (owner_employer_id = '100007' OR employer_id = '100007' OR employer_id = 'b5396cf9-9cd0-4614-a60d-ff77bae24ed5') THEN 1
             ELSE 2
           END ASC,
           created_at ASC`
      )) || [];

    const compSlugSet = new Set<string>();
    const compIdToComp = new Map<string, any>();
    const compPidToComp = new Map<string, any>();
    const compNameToComp = new Map<string, any>();
    const compSlugToComp = new Map<string, any>();
    const empIdToComps = new Map<string, any[]>();

    for (const comp of companies) {
      const name = (comp.name || "").trim();
      const pid = comp.public_id ? String(comp.public_id).replace(/\D/g, "") : "";
      let baseSlug = transliterateToSlug(name);
      const isCanonicalRentrop =
        name.toLowerCase() === "рентроп" &&
        (comp.owner_employer_id === "100007" ||
          comp.employer_id === "100007" ||
          comp.employer_id === "b5396cf9-9cd0-4614-a60d-ff77bae24ed5");

      if (isCanonicalRentrop) {
        baseSlug = "rentrop";
      } else if (String(comp.public_id) === "300025") {
        baseSlug = "rentrop-corp";
      } else if (!baseSlug || /^\d{6}$/.test(baseSlug) || /^com\d+$/i.test(baseSlug) || baseSlug === "kompaniya" || baseSlug === "company") {
        baseSlug = pid ? `com${pid}` : `com${comp.id}`;
      }

      let finalSlug = baseSlug;
      let counter = 1;
      while (compSlugSet.has(finalSlug)) {
        counter++;
        finalSlug = `${baseSlug}-${counter}`;
      }
      compSlugSet.add(finalSlug);

      const legacySlug = isCanonicalRentrop ? "rentrop" : transliterateToSlug(name) || (pid ? `com${pid}` : `com${comp.id}`);
      const historicSet = new Set<string>();
      if (comp.allslug) {
        String(comp.allslug).split(",").map((s) => s.trim().toLowerCase()).filter(Boolean).forEach((s) => historicSet.add(s));
      }
      if (comp.slug) historicSet.add(String(comp.slug).trim().toLowerCase());
      if (comp.legacy_slug) historicSet.add(String(comp.legacy_slug).trim().toLowerCase());
      if (legacySlug) historicSet.add(legacySlug.toLowerCase());
      if (finalSlug) historicSet.add(finalSlug.toLowerCase());

      const allslug = Array.from(historicSet).join(",");
      if (comp.slug !== finalSlug || comp.legacy_slug !== legacySlug || comp.allslug !== allslug) {
        await db.run(`UPDATE companies SET slug = ?, legacy_slug = ?, allslug = ? WHERE id = ?`, [
          finalSlug,
          legacySlug,
          allslug,
          comp.id,
        ]);
      }

      const updatedComp = { ...comp, slug: finalSlug, legacy_slug: legacySlug, allslug };
      compIdToComp.set(String(comp.id), updatedComp);
      if (pid) {
        compPidToComp.set(pid, updatedComp);
        compPidToComp.set(`comp-${pid}`, updatedComp);
        compPidToComp.set(`comp${pid}`, updatedComp);
      }
      if (name) compNameToComp.set(name.toLowerCase(), updatedComp);
      compSlugToComp.set(finalSlug, updatedComp);

      const ownerEmp = comp.owner_employer_id || comp.employer_id;
      if (ownerEmp) {
        const key = String(ownerEmp).toLowerCase();
        const cleanEmpKey = key.replace(/^emp-?/, "");
        if (!empIdToComps.has(key)) empIdToComps.set(key, []);
        empIdToComps.get(key)!.push(updatedComp);
        if (!empIdToComps.has(cleanEmpKey)) empIdToComps.set(cleanEmpKey, []);
        empIdToComps.get(cleanEmpKey)!.push(updatedComp);
      }
    }

    for (const comp of companies) {
      const uComp = compIdToComp.get(String(comp.id));
      if (!uComp) continue;
      const currentFinalSlug = uComp.slug;
      const cleanAllslugList = String(uComp.allslug || "")
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
        .filter((s) => {
          if (s === currentFinalSlug) return true;
          const otherComp = compSlugToComp.get(s);
          return !(otherComp && String(otherComp.id) !== String(comp.id));
        });
      const cleanAllslug = Array.from(new Set(cleanAllslugList)).join(",");
      if (cleanAllslug !== uComp.allslug) {
        uComp.allslug = cleanAllslug;
        await db.run(`UPDATE companies SET allslug = ? WHERE id = ?`, [cleanAllslug, comp.id]);
      }
    }

    const projects =
      (await db.all(
        `SELECT id, company_id, company_name, company_slug, role_name, slug, legacy_slug, public_id, employer_id, status
         FROM projects ORDER BY created_at ASC`
      )) || [];

    const projSlugMapByComp = new Map<string, Set<string>>();
    for (const proj of projects) {
      const cId = String(proj.company_id || "").trim();
      const cleanCompId = cId.replace(/^comp-?/, "");
      const empId = String(proj.employer_id || "").trim();
      const cleanEmpId = empId.replace(/^emp-?/, "");
      const compName = (proj.company_name || "").trim().toLowerCase();

      let matchedComp: any = null;
      const isRentropProj =
        compName === "рентроп" ||
        cId === "526df7fb-228b-4661-9156-d5e23c4bfbab" ||
        cId === "300047" ||
        cId === "4faceb17-e21d-48b6-a37d-4762f480a6f7" ||
        cId === "56ad5e73-5095-4d09-9c61-893fb629d67e" ||
        String(proj.company_slug || "").startsWith("rentrop");

      if (isRentropProj) {
        matchedComp = compPidToComp.get("300047") || compIdToComp.get("526df7fb-228b-4661-9156-d5e23c4bfbab");
      }
      if (!matchedComp && cId) {
        matchedComp = compIdToComp.get(cId) || compPidToComp.get(cId) || compPidToComp.get(cleanCompId) || compSlugToComp.get(cId);
      }
      if (!matchedComp && compName) matchedComp = compNameToComp.get(compName);
      if (!matchedComp && (empId || cleanEmpId)) {
        const empComps = empIdToComps.get(empId) || empIdToComps.get(cleanEmpId);
        if (empComps && empComps.length > 0) matchedComp = empComps[0];
      }

      const finalCompId = matchedComp ? matchedComp.id : proj.company_id || null;
      const finalCompName = matchedComp ? matchedComp.name : proj.company_name || null;
      const finalCompSlug =
        matchedComp?.slug ||
        (isRentropProj ? "rentrop" : proj.company_slug || (finalCompName ? transliterateToSlug(finalCompName) : "company"));

      let finalEmployerId = proj.employer_id;
      if (isRentropProj) finalEmployerId = "100007";
      else if (!finalEmployerId && matchedComp) finalEmployerId = matchedComp.owner_employer_id || matchedComp.employer_id || null;

      const compKey = finalCompSlug || String(finalCompId) || "company";
      if (!projSlugMapByComp.has(compKey)) projSlugMapByComp.set(compKey, new Set<string>());
      const existingSlugSet = projSlugMapByComp.get(compKey)!;

      const roleName = (proj.role_name || "").trim();
      let baseSlug = transliterateToSlug(roleName);
      if (!baseSlug || /^\d{6}$/.test(baseSlug) || /^vac\d+$/i.test(baseSlug) || baseSlug === "vakansiya" || baseSlug === "vacancy") {
        baseSlug = `vac${proj.public_id || proj.id}`;
      }

      let finalSlug = baseSlug;
      let counter = 1;
      while (existingSlugSet.has(finalSlug)) {
        counter++;
        finalSlug = `${baseSlug}-${counter}`;
      }
      existingSlugSet.add(finalSlug);

      const legacySlug = transliterateToSlug(roleName) || `vac${proj.public_id || proj.id}`;
      if (
        proj.slug !== finalSlug ||
        proj.legacy_slug !== legacySlug ||
        proj.company_slug !== finalCompSlug ||
        proj.company_name !== finalCompName
      ) {
        await db.run(
          `UPDATE projects
           SET slug = ?, legacy_slug = ?, company_slug = ?, company_name = COALESCE(?, company_name), company_id = COALESCE(?, company_id), employer_id = COALESCE(?, employer_id)
           WHERE id = ?`,
          [finalSlug, legacySlug, finalCompSlug, finalCompName, finalCompId, finalEmployerId, proj.id]
        );
      }
    }

    console.log("[BD ProTalk DB] All company & project slugs normalized in PG.");
  } catch (err: any) {
    console.warn("[BD ProTalk DB] normalizeAllSlugs warning:", err?.message);
  }
}

export async function recalculateEmployerBalances(db: PgDBWrapper, employerId?: string): Promise<void> {
  try {
    let empQuery = `SELECT id, public_id FROM employers`;
    let params: any[] = [];
    if (employerId) {
      empQuery += ` WHERE id = ? OR public_id::text = ?`;
      params = [employerId, String(employerId)];
    }
    const employers = (await db.all(empQuery, params)) || [];

    for (const emp of employers) {
      const wallet = await db.get(`SELECT id FROM wallets WHERE employer_id = ?`, [emp.id]);
      const walletId = wallet ? wallet.id : "";
      const empPidStr = emp.public_id ? String(emp.public_id) : "";

      const txs =
        (await db.all(`SELECT * FROM transactions WHERE wallet_id = ? OR ref_id = ? OR ref_id = ?`, [
          walletId,
          emp.id,
          empPidStr,
        ])) || [];

      let b_start = 0;
      let b_pay = 0;
      let b_referral = 0;
      let b_admin = 0;
      let b_limits = 0;

      for (const t of txs) {
        const typeBal = String(t.type_balance || t.type || "").toLowerCase();
        const amt = Math.abs(Number(t.amount_rr || 0));

        if (["start", "welcome", "welcome_bonus"].includes(typeBal)) b_start += amt;
        else if (["pay", "topup", "payment", "robokassa"].includes(typeBal)) b_pay += amt;
        else if (["referral", "ref_bonus", "referrer_bonus"].includes(typeBal)) b_referral += amt;
        else if (["admin", "admin_adjust", "test_bonus"].includes(typeBal)) {
          if (Number(t.amount_rr || 0) < 0) b_admin -= amt;
          else b_admin += amt;
        } else if (["limits", "purchase", "usage", "spend"].includes(typeBal)) b_limits += amt;
      }

      const totalBalance = Math.round(b_start + b_pay + b_referral + b_admin - b_limits);
      await db.run(
        `UPDATE employers
         SET balance = ?, balance_start = ?, balance_pay = ?, balance_referral = ?, balance_admin = ?, balance_limits = ?
         WHERE id = ?`,
        [
          totalBalance,
          Math.round(b_start),
          Math.round(b_pay),
          Math.round(b_referral),
          Math.round(b_admin),
          Math.round(b_limits),
          emp.id,
        ]
      );

      if (walletId) {
        await db.run(`UPDATE wallets SET units_balance = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [
          totalBalance,
          walletId,
        ]);
      }
    }
  } catch (err: any) {
    console.error("[BD ProTalk DB] Error recalculating employer balances:", err.message);
  }
}

export async function recalculateEmployerBalancesFromTransactions(dbWrapper: PgDBWrapper, employerId: string): Promise<number> {
  try {
    const emp = await dbWrapper.get(`SELECT id, public_id FROM employers WHERE id = ? OR public_id::text = ?`, [
      employerId,
      String(employerId),
    ]);
    if (!emp) return 0;

    const wallet = await dbWrapper.get(`SELECT id FROM wallets WHERE employer_id = ?`, [emp.id]);
    const walletId = wallet?.id || emp.id;
    const row = await dbWrapper.get(
      `SELECT COALESCE(SUM(amount_rr), 0) as total FROM transactions WHERE wallet_id = ? OR ref_id = ?`,
      [walletId, emp.id]
    );

    const calculatedBalance = Math.round(Number(row?.total || 0));
    await dbWrapper.run(`UPDATE employers SET balance = ? WHERE id = ?`, [calculatedBalance, emp.id]);
    return calculatedBalance;
  } catch (err: any) {
    console.error(`[Balance Audit Engine Error] Employer ${employerId}:`, err.message);
    return 0;
  }
}

export async function syncLimitsAndReferrals(db: PgDBWrapper): Promise<void> {
  try {
    const emps =
      (await db.all(
        `SELECT id, public_id, interview_credits, training_credits, landing_credits, interview_setup_credits, training_setup_credits, limits_json FROM employers`
      )) || [];
    for (const e of emps) {
      const syncedLimits = JSON.stringify({
        interviews: Number(e.interview_credits || 0),
        trainings: Number(e.training_credits || 0),
        landings: Number(e.landing_credits || 0),
        interviewSystems: Number(e.interview_setup_credits || 0),
        trainingSystems: Number(e.training_setup_credits || 0),
      });
      if (e.limits_json !== syncedLimits) {
        await db.run(`UPDATE employers SET limits_json = ? WHERE id = ?`, [syncedLimits, e.id]);
      }
    }

    const refRows = (await db.all(`SELECT * FROM referrals_emp`)) || [];
    for (const r of refRows) {
      let referrer = null;
      if (r.referrer_employer_id) {
        referrer = await db.get(`SELECT id, public_id FROM employers WHERE id = ? OR public_id::text = ?`, [
          r.referrer_employer_id,
          String(r.referrer_employer_id),
        ]);
      }
      if (!referrer && r.referrer_public_id) {
        referrer = await db.get(`SELECT id, public_id FROM employers WHERE public_id = ? OR id = ?`, [
          Number(r.referrer_public_id),
          String(r.referrer_public_id),
        ]);
      }

      let referred = null;
      if (r.referred_employer_id) {
        referred = await db.get(`SELECT id, public_id FROM employers WHERE id = ? OR public_id::text = ?`, [
          r.referred_employer_id,
          String(r.referred_employer_id),
        ]);
      }
      if (!referred && r.referred_public_id) {
        referred = await db.get(`SELECT id, public_id FROM employers WHERE public_id = ? OR id = ?`, [
          Number(r.referred_public_id),
          String(r.referred_public_id),
        ]);
      }

      const refId = referrer ? referrer.id : r.referrer_employer_id;
      const refPublicId = referrer ? Number(referrer.public_id) || null : r.referrer_public_id;
      const targetId = referred ? referred.id : r.referred_employer_id;
      const targetPublicId = referred ? Number(referred.public_id) || null : r.referred_public_id;

      if (
        r.referrer_employer_id !== refId ||
        Number(r.referrer_public_id) !== Number(refPublicId) ||
        r.referred_employer_id !== targetId ||
        Number(r.referred_public_id) !== Number(targetPublicId)
      ) {
        await db.run(
          `UPDATE referrals_emp SET referrer_employer_id = ?, referrer_public_id = ?, referred_employer_id = ?, referred_public_id = ? WHERE id = ?`,
          [refId, refPublicId, targetId, targetPublicId, r.id]
        );
      }

      if (referred && refPublicId) {
        await db.run(`UPDATE employers SET referrer_id = ? WHERE id = ? AND referrer_id IS NULL`, [
          refPublicId,
          referred.id,
        ]);
      }
    }
  } catch (err: any) {
    console.error("[BD ProTalk] Error in syncLimitsAndReferrals:", err.message);
  }
}

export function extractReviewTextFromUserMessage(uMsg: string): string | null {
  if (!uMsg) return null;
  const quoteMatch = uMsg.match(/ОТЗЫВ ДЛЯ ПРОВЕРКИ:\s*[\r\n]*["'«]([^"'»]+)["'»]/i);
  if (quoteMatch && quoteMatch[1] && quoteMatch[1].trim() !== "{{textContent}}") {
    return quoteMatch[1].trim();
  }
  const blockMatch = uMsg.match(/ОТЗЫВ ДЛЯ ПРОВЕРКИ:\s*[\r\n]*([\s\S]+?)(?=\n\s*(?:СТРОГИЕ|СБОР|СХЕМА|1\.|2\.|Верни|$))/i);
  if (blockMatch && blockMatch[1]) {
    const clean = blockMatch[1].trim().replace(/^["'«]|["'»]$/g, "").trim();
    if (clean && clean !== "{{textContent}}") return clean;
  }
  return null;
}

export interface AILogData {
  channel_id?: string;
  user_social_id?: string;
  user_message?: string;
  bot_reply?: string;
  channel_name?: string;
  bot_id?: string | number;
  llm?: string;
  api_key?: string;
  tokens_total?: number;
  tokens_in_source?: number;
  tokens_out_source?: number;
  function_error?: string;
  function_call_params?: any;
  server_name?: string;
  tokens_user?: number;
  tokens_used_usd?: number;
  cost_rub?: number;
  rejection_reason?: string;
  textContent?: string;
  ai_reply?: string;
}

export async function saveAILog(dbOrData: PgDBWrapper | AILogData | null | undefined, maybeData?: AILogData): Promise<void> {
  try {
    const isFirstArgDb = Boolean(dbOrData && typeof (dbOrData as any).run === "function");
    const db: PgDBWrapper = isFirstArgDb ? (dbOrData as PgDBWrapper) : pgWrapper;
    const data: AILogData = (isFirstArgDb ? maybeData : (dbOrData as AILogData)) || {};

    const userMsg = String(data.user_message || "");
    const botRep = String(data.bot_reply || "");
    const tokensIn = Number(data.tokens_in_source) || (userMsg ? Math.ceil(userMsg.length / 3) : 0);
    const tokensOut = Number(data.tokens_out_source) || (botRep ? Math.ceil(botRep.length / 3) : 0);
    const tokensTotal = Number(data.tokens_total) || tokensIn + tokensOut;
    const tokensUser = Number(data.tokens_user) || tokensTotal;

    const costRub =
      data.cost_rub !== undefined && data.cost_rub !== null
        ? Number(data.cost_rub)
        : Number((tokensTotal * 0.00003).toFixed(6));
    const tokensUsedUsd =
      data.tokens_used_usd !== undefined && data.tokens_used_usd !== null
        ? Number(data.tokens_used_usd)
        : Number((costRub / 95).toFixed(6));

    const paramsStr =
      typeof data.function_call_params === "object"
        ? JSON.stringify(data.function_call_params)
        : String(data.function_call_params || "");

    let textContent = data.textContent || null;
    let rejection_reason = data.rejection_reason || null;
    let ai_reply = data.ai_reply || null;

    if ((!textContent || textContent === "{{textContent}}") && userMsg) {
      const extracted = extractReviewTextFromUserMessage(userMsg);
      if (extracted) textContent = extracted;
    }

    if ((!rejection_reason || !ai_reply) && botRep) {
      try {
        let clean = botRep.trim();
        if (clean.startsWith("```")) {
          clean = clean.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
        }
        const parsed = JSON.parse(clean);
        if (!rejection_reason && parsed.rejection_reason) rejection_reason = String(parsed.rejection_reason);
        if (!ai_reply && parsed.ai_reply) ai_reply = String(parsed.ai_reply);
      } catch {}
    }

    let userSocialNum: number | null = null;
    const rawUid = data.user_social_id || data.channel_id || "";
    const uidMatch = String(rawUid).match(/\d{5,15}/);
    if (uidMatch) userSocialNum = Number(uidMatch[0]) || null;

    const botIdNum = data.bot_id != null && /^\d+$/.test(String(data.bot_id)) ? Number(data.bot_id) : null;

    await db.run(
      `INSERT INTO logs (
        channel_id, user_social_id, user_message, bot_reply, channel_name,
        bot_id, llm, api_key, tokens_total, tokens_in_source,
        tokens_out_source, function_error, function_call_params, server_name,
        tokens_user, tokens_used_usd, cost_rub, rejection_reason, "textContent", ai_reply, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [
        data.channel_id || null,
        userSocialNum,
        userMsg || null,
        botRep || null,
        data.channel_name || "demo_interview",
        botIdNum,
        data.llm || null,
        data.api_key ? data.api_key.slice(0, 8) + "..." : null,
        tokensTotal,
        tokensIn,
        tokensOut,
        data.function_error || null,
        paramsStr || null,
        data.server_name || "CloudRun_Express_ProTalkPG",
        tokensUser,
        tokensUsedUsd,
        costRub,
        rejection_reason,
        textContent,
        ai_reply,
      ]
    );
  } catch (err) {
    console.warn("[saveAILog Error]:", err);
  }
}

export async function checkMailingIdempotency(
  dbWrapper: PgDBWrapper,
  recipientId: string,
  type: string,
  withinMs: number = 24 * 60 * 60 * 1000
): Promise<boolean> {
  try {
    const cutoff = Date.now() - withinMs;
    const row = await dbWrapper.get(
      `SELECT COUNT(*)::bigint as count FROM mailing_logs WHERE recipient_id = ? AND type = ? AND timestamp > ?`,
      [recipientId, type, cutoff]
    );
    return Number(row?.count || 0) > 0;
  } catch {
    return false;
  }
}

export async function logMailingEvent(
  dbWrapper: PgDBWrapper,
  recipientId: string,
  type: string,
  status: string = "sent",
  meta: any = {}
): Promise<void> {
  try {
    const id = generateId("mail");
    await dbWrapper.run(
      `INSERT INTO mailing_logs (id, recipient_id, type, status, meta_json, timestamp) VALUES (?, ?, ?, ?, ?, ?)`,
      [id, recipientId, type, status, JSON.stringify(meta), Date.now()]
    );
  } catch (err: any) {
    console.error("[logMailingEvent Error]:", err.message);
  }
}

export async function getLandingPresets(employerId?: string) {
  if (employerId) {
    return pgWrapper.all(
      `SELECT * FROM landing_theme_presets WHERE employer_id = ? OR employer_id = 'system' OR employer_id = 'default' ORDER BY created_at DESC`,
      [employerId]
    );
  }
  return pgWrapper.all(`SELECT * FROM landing_theme_presets ORDER BY created_at DESC`);
}

export async function saveLandingPreset(preset: {
  id?: string;
  employer_id?: string;
  name: string;
  theme_json: string;
}) {
  const id = preset.id || generateId("preset");
  const employerId = preset.employer_id || "100007";
  await pgWrapper.run(
    `INSERT INTO landing_theme_presets (id, employer_id, name, theme_json, updated_at)
     VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       theme_json = EXCLUDED.theme_json,
       updated_at = CURRENT_TIMESTAMP`,
    [id, employerId, preset.name, preset.theme_json]
  );
  return pgWrapper.get(`SELECT * FROM landing_theme_presets WHERE id = ?`, [id]);
}

export async function deleteLandingPreset(id: string) {
  return pgWrapper.run(`DELETE FROM landing_theme_presets WHERE id = ?`, [id]);
}

export async function syncTrainingTestsPaymentsAndCabinetStatus(db: PgDBWrapper): Promise<void> {
  if (!db) return;
  try {
    // Sync training_stage_tests status cleanly (using existing questions only, never overwriting with template stubs)
    await db.exec(`
      UPDATE training_stage_tests
      SET status = CASE
        WHEN questions_json IS NOT NULL AND TRIM(questions_json) != '' AND TRIM(questions_json) != '[]' AND TRIM(questions_json) != 'null'
        THEN 'completed'
        WHEN questions IS NOT NULL AND TRIM(questions) != '' AND TRIM(questions) != '[]' AND TRIM(questions) != 'null'
        THEN 'completed'
        ELSE 'draft'
      END
      WHERE status IS NULL OR status = '' OR status NOT IN ('completed', 'draft');
    `);

    // Backfill candidate standard fields from resume_text & sync candidate_scores
    const allProjs = (await db.all(`SELECT id, public_id, company_id, role_name, candidate_fields_config FROM projects`)) || [];
    const projMap = new Map<string, any>();
    for (const p of allProjs) {
      projMap.set(String(p.id), p);
      if (p.public_id) projMap.set(String(p.public_id), p);
    }

    const allCands = (await db.all(`SELECT * FROM candidates`)) || [];
    for (const cand of allCands) {
      const proj = cand.project_id ? projMap.get(String(cand.project_id)) : null;
      const cfg = proj?.candidate_fields_config ? parseVacancyCandidateFieldsConfig(proj.candidate_fields_config) : { customFields: [] };
      let stdObj: Record<string, any> = {};
      if (cand.standard_fields_json) {
        try { stdObj = JSON.parse(cand.standard_fields_json); } catch {}
      }
      let customObj: Record<string, any> = {};
      if (cand.custom_fields_json) {
        try { customObj = JSON.parse(cand.custom_fields_json); } catch {}
      }

      const hasStdPopulated = Object.keys(stdObj).length >= 5 && (stdObj.city || stdObj.work_experience || stdObj.skills);
      if (cand.resume_text && !hasStdPopulated) {
        const parsed = extractFieldsFromResumeText(cand.resume_text, cfg.customFields);
        for (const def of STANDARD_CANDIDATE_FIELDS) {
          const k = def.key;
          const curVal = cand[k] ?? stdObj[k];
          const parsedVal = parsed.standard_fields[k];
          if (def.type === "multiselect") {
            const curArr = Array.isArray(curVal)
              ? curVal
              : typeof curVal === "string" && curVal.trim().startsWith("[")
              ? (() => { try { return JSON.parse(curVal); } catch { return []; } })()
              : [];
            stdObj[k] = curArr.length > 0 ? curArr : parsedVal || [];
          } else {
            stdObj[k] = curVal !== null && curVal !== undefined && String(curVal).trim() !== "" ? String(curVal).trim() : parsedVal || "";
          }
        }
        for (const [ck, cv] of Object.entries(parsed.custom_fields)) {
          if (!customObj[ck] && cv) customObj[ck] = cv;
        }
        await db.run(
          `UPDATE candidates SET company_id = COALESCE(NULLIF(company_id, ''), ?), role_name = COALESCE(NULLIF(role_name, ''), ?), standard_fields_json = ?, custom_fields_json = ? WHERE id = ?`,
          [proj?.company_id || cand.company_id || null, proj?.role_name || null, JSON.stringify(stdObj), JSON.stringify(customObj), cand.id]
        );
      }

      const existingScore = await db.get(`SELECT id FROM candidate_scores WHERE candidate_id = ? LIMIT 1`, [cand.id]);
      const numScore = Number(cand.score || cand.overall_score || 0);
      if (!existingScore && (numScore > 0 || cand.resume_text)) {
        const rScore = cand.resume_score != null ? Number(cand.resume_score) : numScore > 0 ? numScore : null;
        const cScore = cand.checklist_score != null ? Number(cand.checklist_score) : null;
        const sScore = cand.situations_score != null ? Number(cand.situations_score) : null;
        const oScore = numScore > 0 ? numScore : rScore;
        await db.run(
          `INSERT INTO candidate_scores (
            candidate_id, resume_score, checklist_score, situations_score, interview_score, overall_score, assessment_summary, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT (candidate_id) DO NOTHING`,
          [
            cand.id,
            rScore,
            cScore,
            sScore,
            oScore,
            oScore,
            cand.notes || (cand.resume_text ? "Резюме загружено и обработано системой скрининга." : null),
            cand.updated_at || cand.created_at || new Date().toISOString(),
          ]
        );
      }
    }
  } catch (err: any) {
    console.warn("[BD ProTalk DB] Warning in syncTrainingTestsPaymentsAndCabinetStatus:", err?.message);
  }
}

export async function checkRateLimit(
  key: string,
  maxRequests: number = 60,
  windowSeconds: number = 60
): Promise<{ allowed: boolean; count: number; remaining: number; retryAfterSeconds: number }> {
  try {
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const existing = await pgWrapper.get(`SELECT * FROM rate_limits WHERE key = ? LIMIT 1`, [key]);
    if (!existing) {
      await pgWrapper.run(
        `INSERT INTO rate_limits (key, window_start, window_started_at, count) VALUES (?, ?, ?, 1)
         ON CONFLICT (key) DO UPDATE SET window_start = EXCLUDED.window_start, window_started_at = EXCLUDED.window_started_at, count = 1`,
        [key, nowIso, nowIso]
      );
      return { allowed: true, count: 1, remaining: Math.max(0, maxRequests - 1), retryAfterSeconds: 0 };
    }
    const startStr = existing.window_started_at || existing.window_start || nowIso;
    const startMs = Date.parse(startStr) || 0;
    const elapsedSec = (nowMs - startMs) / 1000;
    if (elapsedSec >= windowSeconds) {
      await pgWrapper.run(`UPDATE rate_limits SET window_start = ?, window_started_at = ?, count = 1 WHERE key = ?`, [
        nowIso,
        nowIso,
        key,
      ]);
      return { allowed: true, count: 1, remaining: Math.max(0, maxRequests - 1), retryAfterSeconds: 0 };
    }
    const nextCount = (Number(existing.count) || 0) + 1;
    await pgWrapper.run(`UPDATE rate_limits SET count = ? WHERE key = ?`, [nextCount, key]);
    const allowed = nextCount <= maxRequests;
    return {
      allowed,
      count: nextCount,
      remaining: Math.max(0, maxRequests - nextCount),
      retryAfterSeconds: allowed ? 0 : Math.max(1, Math.ceil(windowSeconds - elapsedSec)),
    };
  } catch {
    return { allowed: true, count: 1, remaining: maxRequests - 1, retryAfterSeconds: 0 };
  }
}

export async function recordClientError(payload: {
  id?: string;
  source?: string;
  route?: string;
  message: string;
  stack?: string;
  user_id?: string;
  user_agent?: string;
  meta?: any;
}): Promise<void> {
  try {
    const id = payload.id || crypto.randomUUID();
    const metaStr = typeof payload.meta === "string" ? payload.meta : JSON.stringify(payload.meta || {});
    await pgWrapper.run(
      `INSERT INTO client_errors (id, created_at, source, route, message, stack, user_id, user_agent, meta)
       VALUES (?, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO NOTHING`,
      [
        id,
        String(payload.source || "client").slice(0, 100),
        String(payload.route || "").slice(0, 250),
        String(payload.message || "unknown").slice(0, 500),
        payload.stack ? String(payload.stack).slice(0, 2000) : null,
        payload.user_id ? String(payload.user_id) : null,
        payload.user_agent ? String(payload.user_agent).slice(0, 300) : null,
        metaStr,
      ]
    );
  } catch {}
}
