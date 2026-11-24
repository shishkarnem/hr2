import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { getProTalkDB, generateNextCandidatePublicId } from "../../db";
import {
  handleListCandidatesRpc,
  handleCandidateFullDetailsRpc,
  handleCandidateStageAndDecisionRpc,
  handleCandidateFlowStateRpc,
} from "../crm";
import {
  candidateSessions,
  candidateResetTokens,
  transporter,
  genId,
  resolveProjectAndCompany,
  getUserNotifications,
  markNotificationsRead,
} from "./helpers";
import { handleEmployerReferralAndLimitsRpc } from "../../authHelpers/employerLimitsRpc";
import { handleProjectAndCompanyRpc } from "../../authHelpers/projectLimitsRpc";

export const candidateAndRpcRouter = Router();

candidateAndRpcRouter.post(["/candidate/signup", "/auth/candidate/signup"], async (req: Request, res: Response) => {
  try {
    const { _email, _password, _project, _company, _phone, _full_name } = req.body;
    const emailNorm = (_email || "").trim().toLowerCase();
    if (!emailNorm) return res.status(400).json({ ok: false, error: "bad_email", message: "Укажите корректный e-mail" });

    const db = await getProTalkDB();
    const { projectRow, companyRow } = await resolveProjectAndCompany(db, _project, _company);

    const targetProjectId = projectRow?.id || _project || "";
    const targetCompanyId = companyRow?.id || projectRow?.company_id || _company || null;
    const targetProjectPublicId = projectRow?.public_id || (typeof _project === "string" ? _project.replace(/^vac/i, "") : null);
    const targetCompanyPublicId = companyRow?.public_id || (typeof _company === "string" ? _company.replace(/^com/i, "") : null);
    const targetRoleName = projectRow?.role_name || "Специалист";

    const existingOnVac = await db.get(
      `SELECT * FROM candidates WHERE LOWER(email) = ? AND (project_id = ? OR project_id = ?) LIMIT 1`,
      [emailNorm, targetProjectId, _project || ""]
    );
    if (existingOnVac) {
      return res.json({
        ok: false,
        error: "email_taken",
        message: "Вы уже зарегистрированы на эту вакансию — пожалуйста, выполните вход.",
      });
    }

    const existingAny = await db.get(`SELECT * FROM candidates WHERE LOWER(email) = ? ORDER BY created_at DESC LIMIT 1`, [emailNorm]);
    const nextPubId = await generateNextCandidatePublicId(db);
    const candId = crypto.randomUUID();

    let passwordHash = "";
    if (_password && String(_password).length > 0) passwordHash = bcrypt.hashSync(String(_password), 8);
    else if (existingAny?.password_hash) passwordHash = existingAny.password_hash;

    const candidateFullName = (_full_name || "").trim() || existingAny?.full_name || emailNorm.split("@")[0];
    const candidatePhone = (_phone || "").trim() || existingAny?.phone || "";
    const nowIso = new Date().toISOString();

    await db.run(
      `INSERT INTO candidates (
        id, public_id, project_id, company_id, full_name, email, phone,
        password_hash, role_name, current_stage, stage, crm_stage, crm_stage_manual,
        auth_kind, registered_via, created_at, updated_at, last_login_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [candId, nextPubId, targetProjectId, targetCompanyId, candidateFullName, emailNorm, candidatePhone, passwordHash, targetRoleName, "terms", "screening", "registration", 0, "email", "email", nowIso, nowIso, nowIso]
    );

    const token = `cand_token_${genId("session")}`;
    candidateSessions[token] = {
      id: candId,
      public_id: nextPubId,
      project_id: targetProjectId,
      company_id: targetCompanyId,
      full_name: candidateFullName,
      email: emailNorm,
      phone: candidatePhone,
      current_stage: "terms",
      role_name: targetRoleName,
      created_at: nowIso,
    };

    // Notify all vacancy responsibles across Bell, Web Push, and Telegram (per-responsible prefs + per-vacancy dedup)
    try {
      const { dispatchVacancyBellAndPushToResponsibles } = await import(
        "../../services/notifications/vacancyResponsiblesResolver"
      );
      const { primaryLink } = await dispatchVacancyBellAndPushToResponsibles(db, {
        projectId: targetProjectId,
        projRow: projectRow,
        fallbackEmpId: companyRow?.owner_employer_id || companyRow?.employer_id || null,
        eventKey: "new_candidate",
        kind: "new_candidate",
        title: `Новый отклик: ${candidateFullName}`,
        body: `Вакансия «${targetRoleName}». Кандидат зарегистрировался через Email.`,
        linkBuilder: (pub) => `/emp${pub}/crm?candidate=${encodeURIComponent(String(nextPubId))}`,
        meta: { candidate_id: String(nextPubId), project_id: targetProjectId },
      });
      if (targetProjectId) {
        const { sendVacancyTelegramNotification } = await import("../../services/telegram");
        await sendVacancyTelegramNotification(
          db,
          String(targetProjectId),
          `🔔 <b>Новый кандидат!</b>\n👤 ${candidateFullName}\n💼 Вакансия: ${targetRoleName}\n📧 ${emailNorm}`,
          {
            eventKey: "new_candidate",
            dedupKey: `new_cand_${nextPubId}`,
            button: { text: "👤 Открыть кандидата в CRM", url: primaryLink },
          }
        );
      }
    } catch {}

    res.json({
      ok: true,
      token,
      candidate_id: candId,
      public_id: nextPubId,
      project_id: targetProjectId,
      company_id: targetCompanyId,
      company_public_id: targetCompanyPublicId,
      project_public_id: targetProjectPublicId,
      full_name: candidateFullName,
      applications: [],
    });
  } catch (err: any) {
    console.error("[Candidate Signup Error]:", err);
    res.status(500).json({ ok: false, error: err.message || "signup_failed" });
  }
});

candidateAndRpcRouter.post(["/candidate/login", "/auth/candidate/login"], async (req: Request, res: Response) => {
  try {
    const { _email, _password, _project, _company } = req.body;
    const emailNorm = (_email || "").trim().toLowerCase();
    if (!emailNorm) return res.status(400).json({ ok: false, error: "bad_email", message: "Укажите e-mail" });

    const db = await getProTalkDB();
    const { projectRow, companyRow } = await resolveProjectAndCompany(db, _project, _company);
    const targetProjectId = projectRow?.id || _project || "";
    const targetCompanyId = companyRow?.id || projectRow?.company_id || _company || null;
    const targetProjectPublicId = projectRow?.public_id || (typeof _project === "string" ? _project.replace(/^vac/i, "") : null);
    const targetCompanyPublicId = companyRow?.public_id || (typeof _company === "string" ? _company.replace(/^com/i, "") : null);

    let cand = await db.get(`SELECT * FROM candidates WHERE LOWER(email) = ? AND (project_id = ? OR project_id = ?) LIMIT 1`, [
      emailNorm,
      targetProjectId,
      _project || "",
    ]);

    if (!cand) {
      const otherCand = await db.get(`SELECT * FROM candidates WHERE LOWER(email) = ? ORDER BY created_at DESC LIMIT 1`, [emailNorm]);
      if (!otherCand) return res.json({ ok: false, error: "bad_credentials", message: "Неверный e-mail или пароль" });
      if (_password && otherCand.password_hash) {
        const isMatch = otherCand.password_hash.startsWith("$2")
          ? bcrypt.compareSync(String(_password), otherCand.password_hash)
          : otherCand.password_hash === String(_password);
        if (!isMatch) return res.json({ ok: false, error: "bad_credentials", message: "Неверный e-mail или пароль" });
      }
      return res.json({
        ok: false,
        error: "not_applied_yet",
        message: "Вы ещё не откликались на данную вакансию. Пожалуйста, перейдите на вкладку «Регистрация» и отправьте отклик.",
        canApply: true,
      });
    } else if (_password && cand.password_hash) {
      const isMatch = cand.password_hash.startsWith("$2")
        ? bcrypt.compareSync(String(_password), cand.password_hash)
        : cand.password_hash === String(_password);
      if (!isMatch) return res.json({ ok: false, error: "bad_credentials", message: "Неверный e-mail или пароль" });
    }

    try {
      await db.run(`UPDATE candidates SET last_login_at = ? WHERE id = ?`, [new Date().toISOString(), cand.id]);
    } catch {}

    const token = `cand_token_${genId("session")}`;
    candidateSessions[token] = cand;

    res.json({
      ok: true,
      token,
      candidate_id: cand.id,
      public_id: cand.public_id || cand.id,
      project_id: cand.project_id || targetProjectId,
      company_id: cand.company_id || targetCompanyId,
      company_public_id: targetCompanyPublicId,
      project_public_id: targetProjectPublicId,
      full_name: cand.full_name || cand.email,
      applications: [],
    });
  } catch (err: any) {
    console.error("[Candidate Login Error]:", err);
    res.status(500).json({ ok: false, error: err.message || "login_failed" });
  }
});

candidateAndRpcRouter.post(["/candidate/forgot-password", "/auth/candidate/forgot-password"], async (req: Request, res: Response) => {
  try {
    const { email, projectId, companyId } = req.body;
    const emailNorm = (email || "").trim().toLowerCase();
    if (!emailNorm) return res.status(400).json({ ok: false, error: "bad_email", message: "Укажите e-mail" });

    const db = await getProTalkDB();
    const cands = await db.all(`SELECT * FROM candidates WHERE LOWER(email) = ? ORDER BY updated_at DESC, created_at DESC`, [emailNorm]);
    if (!cands || !cands.length) {
      return res.json({
        ok: false,
        error: "not_found",
        message: "Кандидат с указанным e-mail не найден в системе. Пожалуйста, проверьте правильность адреса.",
      });
    }

    const cand = cands[0];
    const { projectRow, companyRow } = await resolveProjectAndCompany(db, projectId || cand.project_id, companyId || cand.company_id);
    const companyName = companyRow?.name || "Компания";
    const roleName = projectRow?.role_name || cand.role_name || "Вакансия";
    const comPub = companyRow?.public_id || (companyRow?.slug ? companyRow.slug : "300047");
    const vacPub = projectRow?.public_id || (projectRow?.slug ? projectRow.slug : "400007");
    const candPub = cand.public_id || cand.id;

    const token = `cand_reset_${crypto.randomUUID().replace(/-/g, "")}`;
    candidateResetTokens[token] = {
      email: emailNorm,
      candidateId: cand.id,
      publicId: String(candPub),
      projectId: projectRow?.id || cand.project_id,
      companyId: companyRow?.id || cand.company_id,
      createdAt: Date.now(),
    };

    const host = req.get("host") || "localhost:3000";
    const protocol = req.protocol || "http";
    const baseUrl = process.env.APP_URL || (host.includes("localhost") ? "https://hr-rr.ru" : `${protocol}://${host}`);
    const resetUrl = `${baseUrl}/reset-password?token=${token}&type=candidate&cand=${candPub}&com=${comPub}&vac=${vacPub}`;

    transporter
      .sendMail({
        from: `"${companyName} · Подбор персонала" <${process.env.SMTP_USER || "info@arenda-ropa.com"}>`,
        to: emailNorm,
        subject: `Восстановление доступа в личный кабинет соискателя · ${companyName}`,
        html: `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;"><h2>Восстановление доступа</h2><p>Запрошен сброс пароля для вакансии <strong>«${roleName}»</strong> (${companyName}).</p><p><a href="${resetUrl}">Задать новый пароль</a></p></div>`,
      })
      .catch((mailErr: any) => console.error("[Candidate SMTP Error] Failed sending reset email:", mailErr?.message));

    res.json({
      ok: true,
      success: true,
      message: "Ссылка для сброса пароля отправлена на ваш e-mail. Проверьте почтовый ящик.",
      resetUrl,
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message || "forgot_password_failed" });
  }
});

candidateAndRpcRouter.post(["/candidate/reset-password", "/auth/candidate/reset-password"], async (req: Request, res: Response) => {
  try {
    const { token, password, email, candidatePub } = req.body;
    if (!password || String(password).length < 6) {
      return res.status(400).json({ ok: false, error: "Пароль должен быть не короче 6 символов" });
    }

    const db = await getProTalkDB();
    const tokenData = token ? candidateResetTokens[token] : null;
    const targetEmail = tokenData?.email || (email || "").trim().toLowerCase();
    const targetPubId = tokenData?.publicId || candidatePub;

    let cand: any = null;
    if (tokenData?.candidateId) cand = await db.get(`SELECT * FROM candidates WHERE id = ?`, [tokenData.candidateId]);
    if (!cand && targetPubId) cand = await db.get(`SELECT * FROM candidates WHERE CAST(public_id AS TEXT) = ?`, [String(targetPubId)]);
    if (!cand && targetEmail) cand = await db.get(`SELECT * FROM candidates WHERE LOWER(email) = ? ORDER BY created_at DESC LIMIT 1`, [targetEmail]);
    if (!cand) return res.status(404).json({ ok: false, error: "Кандидат не найден или ссылка устарела" });

    const newHash = bcrypt.hashSync(String(password), 8);
    await db.run(`UPDATE candidates SET password_hash = ?, updated_at = NOW() WHERE id = ? OR CAST(public_id AS TEXT) = ?`, [
      newHash,
      cand.id,
      String(cand.public_id || ""),
    ]);

    if (token && candidateResetTokens[token]) delete candidateResetTokens[token];

    const { projectRow, companyRow } = await resolveProjectAndCompany(db, cand.project_id, cand.company_id);
    const comPub = companyRow?.public_id || (companyRow?.slug ? companyRow.slug : "300047");
    const vacPub = projectRow?.public_id || (projectRow?.slug ? projectRow.slug : "400007");

    res.json({
      ok: true,
      success: true,
      publicId: cand.public_id,
      companyPublicId: comPub,
      projectPublicId: vacPub,
      message: "Пароль успешно обновлён",
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message || "reset_failed" });
  }
});

candidateAndRpcRouter.post("/rpc/:method", async (req: Request, res: Response) => {
  const { method } = req.params;
  const body = req.body || {};
  const db = await getProTalkDB();

  try {
    if (method === "notifications_list") return res.json({ data: await getUserNotifications(db, req, body), error: null });
    if (method === "notifications_mark_read") return res.json({ data: await markNotificationsRead(db, req, body), error: null });

    if (method === "admin_list_candidates" || method === "employer_list_candidates") {
      return await handleListCandidatesRpc(db, method, body, res);
    }
    if (method === "candidate_full_details") {
      return await handleCandidateFullDetailsRpc(db, body, res);
    }
    if (method === "employer_set_candidate_crm_stage" || method === "candidate_set_stage" || method === "candidate_advance_crm_stage" || method === "candidate_invite_decision") {
      return await handleCandidateStageAndDecisionRpc(db, method, body, res);
    }
    if (method === "candidate_flow_state") {
      return await handleCandidateFlowStateRpc(db, body, res);
    }

    if (method === "public_vacancies_catalog" || method === "get_public_vacancies") {
      const rows = await db.all(`
        SELECT p.id, p.public_id as p_public_id, p.slug as p_slug, p.role_name, p.salary_terms, p.schedule_terms,
               p.vacancy_text, p.company_name, p.company_slug, p.company_id as p_company_id, p.logo_url as p_logo_url,
               p.created_at, c.id as company_id, c.name as c_name, c.slug as c_slug, c.industry as c_industry,
               c.logo_url as c_logo_url
        FROM projects p
        LEFT JOIN companies c ON (p.company_id = c.id OR p.company_slug = c.slug OR p.employer_id = c.employer_id)
        WHERE (p.status IS NULL OR p.status = 'active')
          AND COALESCE(CAST(p.is_published AS TEXT), '1') NOT IN ('0', '0.0', 'false', 'f', 'FALSE')
        ORDER BY p.created_at DESC
      `);
      const DEFAULT_RR_LOGO = "/files/11/rr-logo.png";
      return res.json(
        (rows || []).map((r: any) => ({
          id: r.id,
          public_id: r.p_public_id || r.id,
          slug: r.p_slug || r.company_slug || "vacancy",
          role_name: r.role_name || "Специалист",
          salary_terms: r.salary_terms || "",
          schedule_terms: r.schedule_terms || "",
          vacancy_text: r.vacancy_text || "",
          logo_url: r.p_logo_url || r.c_logo_url || DEFAULT_RR_LOGO,
          created_at: r.created_at,
          company_id: r.p_company_id || r.company_id || null,
          company_name: r.c_name || r.company_name || "Компания",
          company_slug: r.c_slug || r.company_slug || "company",
          company_logo: r.c_logo_url || DEFAULT_RR_LOGO,
          industry: r.c_industry || "Услуги",
        }))
      );
    }

    if (method === "candidate_email_signup") {
      const { _email, _project, _company, _phone, _full_name } = body;
      const emailNorm = (_email || "").trim().toLowerCase();
      const candId = genId("cand");
      const pubId = await generateNextCandidatePublicId(db);
      await db.run(
        `INSERT INTO candidates (id, public_id, project_id, company_id, full_name, email, phone, current_stage) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [candId, pubId, _project || "", _company || null, _full_name || emailNorm.split("@")[0], emailNorm, _phone || "", "new"]
      );
      return res.json({
        ok: true,
        token: `cand_token_${genId("session")}`,
        candidate_id: candId,
        public_id: pubId,
        project_id: _project,
        company_id: _company,
        full_name: _full_name || emailNorm,
        applications: [{ project_id: _project, stage: "new" }],
      });
    }

    if (method === "candidate_email_login") {
      const { _email, _project } = body;
      const emailNorm = (_email || "").trim().toLowerCase();
      const cand = await db.get("SELECT * FROM candidates WHERE LOWER(email) = ? LIMIT 1", [emailNorm]);
      if (!cand) return res.json({ ok: false, error: "bad_credentials" });
      return res.json({
        ok: true,
        token: `cand_token_${genId("session")}`,
        candidate_id: cand.id,
        public_id: cand.public_id || cand.id,
        project_id: cand.project_id || _project,
        company_id: cand.company_id || null,
        full_name: cand.full_name || cand.email,
        applications: [{ project_id: cand.project_id, stage: cand.current_stage }],
      });
    }

    if (method === "candidate_public_cabinet") {
      const { _public_id } = body;
      const cand = await db.get("SELECT * FROM candidates WHERE CAST(public_id AS TEXT) = ? OR id = ? LIMIT 1", [
        String(_public_id),
        _public_id,
      ]);
      if (!cand) return res.json(null);
      return res.json({
        id: cand.id,
        public_id: cand.public_id || cand.id,
        full_name: cand.full_name,
        email: cand.email,
        phone: cand.phone,
        current_stage: cand.current_stage,
        project_id: cand.project_id,
        company_id: cand.company_id,
      });
    }

    if (method === "get_vacancy_employer_contacts") {
      const { _project_id } = body;
      const proj = _project_id
        ? await db.get("SELECT * FROM projects WHERE id = ? OR CAST(public_id AS TEXT) = ? LIMIT 1", [
            _project_id,
            String(_project_id),
          ])
        : null;
      let comp: any = null;
      if (proj?.company_id) {
        comp = await db.get("SELECT * FROM companies WHERE id = ? OR CAST(public_id AS TEXT) = ? LIMIT 1", [
          proj.company_id,
          String(proj.company_id),
        ]);
      }
      const { resolveVacancyResponsibleEmployers, formatResponsibleContacts } = await import(
        "../../services/notifications/vacancyResponsiblesResolver"
      );
      const resolved = await resolveVacancyResponsibleEmployers(
        db,
        proj,
        comp?.owner_employer_id || comp?.employer_id || null
      );
      const { primary, list } = formatResponsibleContacts(
        resolved,
        comp?.name || proj?.company_name || ""
      );
      return res.json({
        ok: true,
        phone: primary.phone || "",
        email: primary.email || "",
        telegram: primary.telegram || "",
        name: primary.name || "",
        companyName: primary.companyName || comp?.name || "",
        company_name: primary.companyName || comp?.name || "",
        contact_name: primary.name || "",
        contact_email: primary.email || "",
        contact_phone: primary.phone || "",
        contact_tg: primary.telegram || "",
        contacts: list,
      });
    }

    if (await handleEmployerReferralAndLimitsRpc(db, method, req, body, res)) return;
    if (await handleProjectAndCompanyRpc(db, method, req, body, res)) return;

    return res.json({ success: true, message: `RPC ${method} executed in PostgreSQL BD ProTalk`, data: [] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
