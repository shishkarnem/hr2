import { parseVacancyCandidateFieldsConfig } from "../../src/lib/candidateFields";
import { PgDBWrapper } from "./pgClient";
import { cleanMojibakeText, invalidatePublicVacanciesCache } from "./protalkDb";
import {
  generateNextCandidatePublicId,
  generateNextCompanyPublicId,
  generateNextProjectPublicId,
  generateUniqueCompanySlug,
  generateUniqueRoleSlugServer,
  toBigInt,
  toBigIntOrNull,
  transliterateToSlug,
} from "./helpers";

export async function saveEmployerToProTalkDB(db: PgDBWrapper, emp: any) {
  try {
    const emailLower = (emp.email || emp.contact_email || "").toLowerCase();
    const empPub = emp.publicId || emp.public_id || "";
    const existing = await db.get(
      "SELECT * FROM employers WHERE id = ? OR (email IS NOT NULL AND email != '' AND LOWER(email) = ?) OR (public_id IS NOT NULL AND CAST(public_id AS TEXT) = ?)",
      [emp.id || "", emailLower, String(empPub || "")]
    );

    let finalId = emp.id || existing?.id || "emp-" + Math.random().toString(36).substring(2, 9);
    const finalPid =
      toBigIntOrNull(emp.publicId || emp.public_id || existing?.public_id) ||
      Number("100" + Math.floor(10000000 + Math.random() * 90000000));
    const finalUserId = emp.userId || emp.user_id || existing?.user_id || finalId;
    const finalName = emp.name || emp.contact_name || existing?.name || existing?.contact_name || "";
    const finalEmail = (emp.email || emp.contact_email || existing?.email || existing?.contact_email || "").toLowerCase();
    if (String(finalPid) === "100007" || finalEmail === "shishkarnem@gmail.com") {
      finalId = "b5396cf9-9cd0-4614-a60d-ff77bae24ed5";
    }
    const finalCompany = cleanMojibakeText(emp.companyName || emp.company_name || existing?.company_name || "");
    const finalPhone = emp.phone || emp.contact_phone || existing?.phone || existing?.contact_phone || "";
    const finalTg =
      emp.telegramUsername || emp.telegram_username || emp.contact_telegram || existing?.telegram_username || existing?.contact_telegram || "";
    const finalBalance = toBigInt(emp.balance ?? existing?.balance ?? 1000, 1000);
    const finalLimits = JSON.stringify(emp.limits || (existing?.limits_json ? JSON.parse(existing.limits_json) : {}));
    const finalRole =
      emp.role || existing?.role || (String(finalPid) === "100007" || finalEmail === "shishkarnem@gmail.com" ? "admin" : "employer");

    if (existing) {
      await db.run(
        `UPDATE employers SET
           id = ?, public_id = ?, user_id = ?, name = ?, contact_name = ?, email = ?, contact_email = ?,
           company_name = ?, phone = ?, contact_phone = ?, telegram_username = ?, contact_telegram = ?,
           balance = ?, limits_json = ?, role = ?, updated_at = ?
         WHERE id = ? OR CAST(public_id AS TEXT) = ?`,
        [
          finalId, finalPid, finalUserId, finalName, finalName, finalEmail, finalEmail,
          finalCompany, finalPhone, finalPhone, finalTg, finalTg,
          finalBalance, finalLimits, finalRole, new Date().toISOString(), existing.id, String(finalPid)
        ]
      );
    } else {
      await db.run(
        `INSERT INTO employers (
           id, public_id, user_id, name, contact_name, email, contact_email, company_name,
           phone, contact_phone, telegram_username, contact_telegram, balance, limits_json,
           registered_via, role, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          finalId, finalPid, finalUserId, finalName, finalName, finalEmail, finalEmail, finalCompany,
          finalPhone, finalPhone, finalTg, finalTg, finalBalance, finalLimits,
          emp.registeredVia || "direct", finalRole, new Date().toISOString()
        ]
      );
    }
  } catch (err: any) {
    console.error("[BD ProTalk] saveEmployer error:", err.message);
  }
}

export async function saveCompanyToProTalkDB(db: PgDBWrapper, comp: any) {
  try {
    const id = comp.id || "comp-" + Math.random().toString(36).substring(2, 8);
    const rawEmployerId = comp.employerId || comp.owner_employer_id || comp.employer_id || "emp-demo";
    let employerId = rawEmployerId;
    let ownerEmployerId = rawEmployerId;

    if (db && rawEmployerId) {
      const cleanEmp = String(rawEmployerId).replace(/^emp/i, "").trim();
      const empRow = await db.get(
        "SELECT id, public_id FROM employers WHERE id = ? OR CAST(public_id AS TEXT) = ? OR id = ? OR CAST(public_id AS TEXT) = ?",
        [rawEmployerId, String(rawEmployerId), cleanEmp, cleanEmp]
      );
      if (empRow) {
        employerId = empRow.id || rawEmployerId;
        ownerEmployerId = String(empRow.public_id || empRow.id || rawEmployerId);
      }
    }

    const name = cleanMojibakeText(comp.name || "");

    const existingComp = db
      ? await db.get(
          "SELECT public_id, slug, legacy_slug, allslug, theme_config, css FROM companies WHERE id = ? OR CAST(public_id AS TEXT) = ? OR (public_id IS NOT NULL AND CAST(public_id AS TEXT) = ?)",
          [id, String(id), String(comp.public_id || comp.publicId || "")]
        )
      : null;

    let publicId = comp.public_id || comp.publicId;
    if (!publicId || !/^\d{6}$/.test(String(publicId))) {
      if (existingComp && existingComp.public_id && /^\d{6}$/.test(String(existingComp.public_id))) {
        publicId = String(existingComp.public_id);
      } else {
        publicId = await generateNextCompanyPublicId(db);
      }
    }

    const nameSlug = transliterateToSlug(name);
    let desiredBase = nameSlug;
    if (!desiredBase) {
      if (comp.slug && !/^\d{6}$/.test(comp.slug) && !/^com\d+$/i.test(comp.slug) && !comp.slug.startsWith("draft-")) {
        desiredBase = comp.slug;
      } else {
        desiredBase = `com${publicId}`;
      }
    }
    const legacySlug = nameSlug || `com${publicId}`;
    const slug = await generateUniqueCompanySlug(db, desiredBase, id);

    const allSlugsSet = new Set<string>();
    if (existingComp?.allslug) {
      String(existingComp.allslug).split(",").map((s: string) => s.trim().toLowerCase()).filter(Boolean).forEach((s: string) => allSlugsSet.add(s));
    }
    if (existingComp?.slug) allSlugsSet.add(String(existingComp.slug).trim().toLowerCase());
    if (existingComp?.legacy_slug) allSlugsSet.add(String(existingComp.legacy_slug).trim().toLowerCase());
    if (comp.allslug || comp.all_slugs) {
      String(comp.allslug || comp.all_slugs).split(",").map((s: string) => s.trim().toLowerCase()).filter(Boolean).forEach((s: string) => allSlugsSet.add(s));
    }
    if (nameSlug) allSlugsSet.add(nameSlug.toLowerCase());
    if (legacySlug) allSlugsSet.add(legacySlug.toLowerCase());
    if (slug) allSlugsSet.add(slug.toLowerCase());
    const allslug = Array.from(allSlugsSet).join(",");

    const industry = comp.industry || "";
    const staff = comp.staff || "";
    const description = cleanMojibakeText(comp.description || comp.description_text || comp.about_text || "");
    const activeVacancies = toBigInt(comp.activeVacancies ?? 1, 1);
    let sites = "";
    if (comp.sites !== undefined && comp.sites !== null && comp.sites !== "") {
      sites = typeof comp.sites === "object" ? JSON.stringify(comp.sites) : String(comp.sites);
    } else if (comp.website) {
      sites = String(comp.website);
    }
    const website = comp.website || (sites && !sites.trim().startsWith("[") ? sites : "");
    const logoUrl = comp.logoUrl || comp.logo_url || "";
    const missionText = comp.missionText || comp.mission_text || "";
    const aboutText = comp.about_text || comp.aboutText || "";
    const descriptionText = comp.description_text || comp.descriptionText || description;
    const productsText = comp.products_text || comp.productsText || "";
    const teamText = comp.team_text || comp.teamText || null;
    const payoutsText = comp.payouts_text || comp.payoutsText || comp.salaryTerms || "";
    const scheduleText = comp.schedule_text || comp.scheduleText || comp.scheduleTerms || "";
    const systemText = comp.system_text || comp.systemText || comp.customWiki || "";
    const statsObj = comp.stats || {
      founded_year: comp.statsValFounded || null,
      employees: comp.statsValClients || null,
      turnover: comp.statsValDialogs || null,
      labels: {
        founded: comp.statsLabelFounded || null,
        employees: comp.statsLabelClients || null,
        turnover: comp.statsLabelDialogs || null,
      },
    };
    const statsStr = typeof statsObj === "object" ? JSON.stringify(statsObj) : statsObj || "{}";
    const legacyPublicId = toBigIntOrNull(comp.legacy_public_id || comp.legacyPublicId || publicId);
    const status = comp.status || (comp.is_published === 0 ? "draft" : "published");
    const isPublished = comp.is_published !== undefined ? Number(comp.is_published) : status === "draft" ? 0 : 1;
    const archivedAt = comp.archived_at || comp.archivedAt || (status === "archive" ? new Date().toISOString() : null);
    const deletedAt = comp.deleted_at || comp.deletedAt || (status === "deleted" ? new Date().toISOString() : null);

    const themeConfigRaw = comp.theme_config || comp.themeConfig || comp.css || existingComp?.theme_config || existingComp?.css || null;
    const cssRaw = comp.css !== undefined && comp.css !== null ? comp.css : themeConfigRaw || existingComp?.css || existingComp?.theme_config || null;
    const cssStr = typeof cssRaw === "object" && cssRaw !== null ? JSON.stringify(cssRaw) : cssRaw ? String(cssRaw) : null;
    const themeConfigStr = typeof themeConfigRaw === "object" && themeConfigRaw !== null ? JSON.stringify(themeConfigRaw) : themeConfigRaw ? String(themeConfigRaw) : null;

    await db.run(
      `INSERT INTO companies (
        id, employer_id, owner_employer_id, name, slug, legacy_slug, allslug, industry, staff,
        description, active_vacancies, sites, website, logo_url, mission_text,
        about_text, description_text, products_text, team_text, payouts_text, schedule_text,
        system_text, stats, public_id, legacy_public_id, status, is_published,
        archived_at, deleted_at, css, theme_config, data_json, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
      ON CONFLICT (id) DO UPDATE SET
        employer_id = EXCLUDED.employer_id,
        owner_employer_id = EXCLUDED.owner_employer_id,
        name = EXCLUDED.name,
        slug = EXCLUDED.slug,
        legacy_slug = EXCLUDED.legacy_slug,
        allslug = EXCLUDED.allslug,
        industry = EXCLUDED.industry,
        staff = EXCLUDED.staff,
        description = EXCLUDED.description,
        active_vacancies = EXCLUDED.active_vacancies,
        sites = EXCLUDED.sites,
        website = EXCLUDED.website,
        logo_url = EXCLUDED.logo_url,
        mission_text = EXCLUDED.mission_text,
        about_text = EXCLUDED.about_text,
        description_text = EXCLUDED.description_text,
        products_text = EXCLUDED.products_text,
        team_text = EXCLUDED.team_text,
        payouts_text = EXCLUDED.payouts_text,
        schedule_text = EXCLUDED.schedule_text,
        system_text = EXCLUDED.system_text,
        stats = EXCLUDED.stats,
        public_id = EXCLUDED.public_id,
        legacy_public_id = EXCLUDED.legacy_public_id,
        status = EXCLUDED.status,
        is_published = EXCLUDED.is_published,
        archived_at = EXCLUDED.archived_at,
        deleted_at = EXCLUDED.deleted_at,
        css = EXCLUDED.css,
        theme_config = EXCLUDED.theme_config,
        data_json = EXCLUDED.data_json,
        updated_at = NOW()`,
      [
        id, employerId, ownerEmployerId, name, slug, legacySlug, allslug, industry, staff,
        description, activeVacancies, sites, website, logoUrl, missionText,
        aboutText, descriptionText, productsText, teamText, payoutsText, scheduleText,
        systemText, statsStr, toBigIntOrNull(publicId), legacyPublicId, status, isPublished,
        archivedAt, deletedAt, cssStr, themeConfigStr,
        (() => {
          const { data_json: _dj1, dataJson: _dj2, ...cleanComp } = comp || {};
          return JSON.stringify({ ...cleanComp, id, name, public_id: publicId, slug, legacy_slug: legacySlug, allslug, status, is_published: isPublished, css: cssRaw, theme_config: themeConfigRaw });
        })(),
      ]
    );

    try {
      await db.run(
        `UPDATE projects
         SET company_name = ?,
             company_slug = ?,
             company_public_id = ?,
             logo_url = COALESCE(NULLIF(?, ''), logo_url),
             theme_config = ?,
             css = ?,
             updated_at = NOW()
         WHERE company_id = ?
            OR company_id = ?
            OR company_id = ?
            OR company_id = ?
            OR company_slug = ?`,
        [
          name, slug, toBigIntOrNull(publicId), logoUrl || "", themeConfigStr, cssStr,
          id, String(publicId), `comp-${publicId}`, `comp${publicId}`, slug,
        ]
      );
    } catch (e: any) {
      console.warn("[BD ProTalk] Failed to cascade company changes to projects:", e.message);
    }

    invalidatePublicVacanciesCache();
    return { id, public_id: publicId, slug, legacy_slug: legacySlug, status, is_published: isPublished };
  } catch (err: any) {
    console.error("[BD ProTalk] saveCompany error:", err.message);
    return null;
  }
}

export async function saveProjectToProTalkDB(db: PgDBWrapper, proj: any) {
  try {
    const id = proj.id || "vac_" + Math.random().toString(36).substring(2, 9) + "_" + Date.now().toString(36);
    const existingProj = db ? await db.get("SELECT * FROM projects WHERE id = ?", [id]) : null;

    let employerId = proj.employer_id || proj.employerId || existingProj?.employer_id || null;
    let companyId = proj.company_id || proj.companyId || existingProj?.company_id || null;
    let companyName = cleanMojibakeText(proj.company_name || proj.companyName || existingProj?.company_name || "");
    let companySlug = proj.company_slug || proj.companySlug || existingProj?.company_slug || "";
    let companyLogo = proj.logo_url || proj.logoUrl || existingProj?.logo_url || "";

    if (db && companyId) {
      const cleanCompId = String(companyId).replace(/^comp-?/, "");
      const compRow = await db.get(
        "SELECT * FROM companies WHERE id = ? OR CAST(public_id AS TEXT) = ? OR id = ? OR CAST(public_id AS TEXT) = ?",
        [companyId, String(companyId), `comp-${cleanCompId}`, cleanCompId]
      );
      if (compRow) {
        companyId = compRow.id;
        if (!companyName) companyName = cleanMojibakeText(compRow.name || "");
        if (compRow.slug) companySlug = compRow.slug;
        else if (compRow.name && String(compRow.name).trim()) companySlug = transliterateToSlug(String(compRow.name).trim());
        if (!companyLogo && compRow.logo_url) companyLogo = compRow.logo_url;
        if (!employerId) employerId = compRow.owner_employer_id || compRow.employer_id || null;
      }
    } else if (db && employerId) {
      const cleanEmpId = String(employerId).replace(/^emp-?/, "");
      const firstComp = await db.get(
        "SELECT * FROM companies WHERE owner_employer_id = ? OR employer_id = ? OR owner_employer_id = ? OR employer_id = ? ORDER BY id ASC LIMIT 1",
        [employerId, employerId, cleanEmpId, cleanEmpId]
      );
      if (firstComp) {
        companyId = firstComp.id;
        if (!companyName) companyName = cleanMojibakeText(firstComp.name || "");
        if (firstComp.slug) companySlug = firstComp.slug;
        else if (firstComp.name && String(firstComp.name).trim()) companySlug = transliterateToSlug(String(firstComp.name).trim());
        if (!companyLogo && firstComp.logo_url) companyLogo = firstComp.logo_url;
      }
    }

    if (!companySlug && companyName && String(companyName).trim()) {
      const expectedCompSlug = transliterateToSlug(String(companyName).trim());
      if (expectedCompSlug && expectedCompSlug !== "company") companySlug = expectedCompSlug;
    }

    let publicId = proj.public_id || proj.publicId;
    if (!publicId || !/^\d{6}$/.test(String(publicId))) {
      if (existingProj && existingProj.public_id && /^\d{6}$/.test(String(existingProj.public_id))) {
        publicId = String(existingProj.public_id);
      } else {
        publicId = await generateNextProjectPublicId(db);
      }
    }

    const legacyPublicId = proj.legacy_public_id || proj.legacyPublicId || null;
    const roleName = cleanMojibakeText(proj.role_name || proj.roleName || "").trim();
    const roleSlug = transliterateToSlug(roleName);
    let desiredRoleBase = roleSlug;
    if (!desiredRoleBase) {
      if (proj.slug && !/^\d{6}$/.test(proj.slug) && !/^vac\d+$/i.test(proj.slug) && !proj.slug.startsWith("draft-")) {
        desiredRoleBase = proj.slug;
      } else {
        desiredRoleBase = `vac${publicId}`;
      }
    }
    const legacySlug = roleSlug || `vac${publicId}`;
    const slug = await generateUniqueRoleSlugServer(db, desiredRoleBase, companyId, id, publicId);
    const roleSlugFinal = proj.role_slug || slug || legacySlug;
    const themeConfigStr =
      proj.theme_config !== undefined
        ? typeof proj.theme_config === "object" && proj.theme_config !== null
          ? JSON.stringify(proj.theme_config)
          : String(proj.theme_config || "")
        : existingProj?.theme_config || null;
    const cssStr = proj.css !== undefined ? String(proj.css || "") : existingProj?.css || null;
    const companyPublicId = toBigIntOrNull(proj.company_public_id || existingProj?.company_public_id);
    const employerPublicId = proj.employer_public_id || existingProj?.employer_public_id || null;
    const { parseResponsibleIdsList, serializeResponsibleIds } = await import(
      "../services/notifications/vacancyResponsiblesResolver"
    );
    const resolvedRespIds = parseResponsibleIdsList(
      {
        ...existingProj,
        ...proj,
        responsible_employer_id:
          proj.responsible_employer_id ?? proj.responsibleEmployerId ?? existingProj?.responsible_employer_id,
        responsible_employer_ids:
          proj.responsible_employer_ids ?? proj.responsibleEmployerIds ?? existingProj?.responsible_employer_ids,
        employer_id: employerId,
      },
      employerId
    );
    const responsibleEmployerId = resolvedRespIds[0] || employerId || null;
    const responsibleEmployerIdsStr = serializeResponsibleIds(resolvedRespIds);

    const salaryTerms = proj.salary_terms || proj.salaryTerms || "";
    const scheduleTerms = proj.schedule_terms || proj.scheduleTerms || "";
    const motivationText = proj.motivation_text || proj.motivationText || "";
    const motivationTextDetail = proj.motivation_text_detail || proj.motivationTextDetail || "";
    const customWiki = proj.custom_wiki || proj.customWiki || "";
    const vacancyText = proj.vacancy_text || proj.vacancyText || "";
    const tasksActivityText = proj.tasks_activity_text || proj.tasksActivityText || "";
    const scheduleText = proj.schedule_text || proj.scheduleText || "";
    const payoutsText = proj.payouts_text || proj.payoutsText || "";
    const onboardingText = proj.onboarding_text || proj.onboardingText || "";
    const companyText = proj.company_text || proj.companyText || "";
    const missionText = proj.mission_text || proj.missionText || "";
    const teamText = proj.team_text || proj.teamText || "";
    const systemText = proj.system_text || proj.systemText || "";

    const trainingIntroText = proj.training_intro_text || proj.trainingIntroText || "";
    const trainingProfText =
      proj.training_prof_text || proj.trainingProfText || proj.training_professional_text || proj.trainingProfessionalText || "";
    const trainingProductText = proj.training_product_text || proj.trainingProductText || "";
    const trainingSystemText =
      proj.training_system_text || proj.trainingSystemText || proj.training_systems_text || proj.trainingSystemsText || "";
    const trainingWikiText = proj.training_wiki_text || proj.trainingWikiText || "";
    const trainingRegulationsText = proj.training_regulations_text || proj.trainingRegulationsText || "";
    const trainingPublished = proj.training_published === true || proj.training_published === 1 ? 1 : 0;

    const status = proj.status || "active";
    const isPublished = proj.is_published === false || proj.is_published === 0 || status === "draft" ? 0 : 1;
    const interviewLimit = Number(proj.interview_limit ?? proj.max_interviews ?? 0);
    const interviewUsed = Number(proj.interview_used ?? 0);
    const interviewPassScore = Number(proj.interview_pass_score ?? 70);
    const notifyScoreThreshold = Number(proj.notify_score_threshold ?? 70);
    const trainingLimit = Number(proj.training_limit ?? proj.max_trainings ?? 0);
    const trainingUsed = Number(proj.training_used ?? 0);
    const createdTasks = proj.created_tasks === true || proj.created_tasks === 1 ? 1 : 0;

    const hhPostText = proj.hh_post_text || proj.hhPostText || "";
    const hhInviteText = proj.hh_invite_text || proj.hhInviteText || "";
    const hhAutoresumeText = proj.hh_autoresume_text || proj.hhAutoresumeText || "";

    const logoUrl = proj.logo_url || proj.logoUrl || companyLogo || "";
    const statsStr = typeof proj.stats === "object" ? JSON.stringify(proj.stats) : proj.stats || "{}";
    const cabinetTabsText = proj.cabinet_tabs_text || proj.cabinetTabsText || "";
    const checklistStr = JSON.stringify(proj.checklistQuestions || proj.checklist_questions || []);
    const roleplayStr = JSON.stringify(proj.roleplayQuestions || proj.roleplay_questions || []);
    const archivedAt = proj.archived_at || proj.archivedAt || null;
    const deletedAt = proj.deleted_at || proj.deletedAt || null;

    const rawCandFieldsCfg = proj.candidate_fields_config ?? proj.candidateFieldsConfig ?? existingProj?.candidate_fields_config ?? null;
    const candidateFieldsConfigStr =
      rawCandFieldsCfg !== null && rawCandFieldsCfg !== undefined
        ? typeof rawCandFieldsCfg === "object"
          ? JSON.stringify(rawCandFieldsCfg)
          : String(rawCandFieldsCfg)
        : null;

    const rawNotifCfg = proj.notifications_config ?? proj.notificationsConfig ?? existingProj?.notifications_config ?? null;
    const notifCfgObj = rawNotifCfg
      ? typeof rawNotifCfg === "string"
        ? (() => { try { return JSON.parse(rawNotifCfg); } catch { return rawNotifCfg; } })()
        : rawNotifCfg
      : null;
    const notifCfgStr = rawNotifCfg
      ? typeof rawNotifCfg === "object"
        ? JSON.stringify(rawNotifCfg)
        : String(rawNotifCfg)
      : null;

    const { data_json: _ignoredDataJson, dataJson: _ignoredDataJson2, ...cleanProjSource } = proj || {};
    const fullSnapshot = {
      ...cleanProjSource,
      notifications_config: notifCfgObj,
      notificationsConfig: notifCfgObj,
      id, public_id: publicId, publicId, legacy_public_id: legacyPublicId,
      employer_id: employerId,
      employerId,
      responsible_employer_id: responsibleEmployerId,
      responsibleEmployerId,
      responsible_employer_ids: resolvedRespIds,
      responsibleEmployerIds: resolvedRespIds,
      company_id: companyId, companyId,
      company_name: companyName, companyName, company_slug: companySlug, companySlug,
      slug, role_slug: roleSlugFinal, legacy_slug: legacySlug,
      role_name: roleName, roleName, salary_terms: salaryTerms, salaryTerms,
      schedule_terms: scheduleTerms, scheduleTerms, motivation_text: motivationText, motivationText,
      motivation_text_detail: motivationTextDetail, motivationTextDetail,
      custom_wiki: customWiki, customWiki, vacancy_text: vacancyText, vacancyText,
      tasks_activity_text: tasksActivityText, tasksActivityText,
      schedule_text: scheduleText, scheduleText, payouts_text: payoutsText, payoutsText,
      onboarding_text: onboardingText, onboardingText, company_text: companyText, companyText,
      mission_text: missionText, missionText, team_text: teamText, teamText,
      system_text: systemText, systemText,
      training_intro_text: trainingIntroText, training_prof_text: trainingProfText,
      training_professional_text: trainingProfText, training_product_text: trainingProductText,
      training_system_text: trainingSystemText, training_systems_text: trainingSystemText,
      training_wiki_text: trainingWikiText, training_regulations_text: trainingRegulationsText,
      training_published: trainingPublished, status, is_published: isPublished,
      interview_limit: interviewLimit, max_interviews: interviewLimit, interview_used: interviewUsed,
      interview_pass_score: interviewPassScore, notify_score_threshold: notifyScoreThreshold,
      training_limit: trainingLimit, max_trainings: trainingLimit, training_used: trainingUsed,
      created_tasks: createdTasks, hh_post_text: hhPostText, hh_invite_text: hhInviteText,
      hh_autoresume_text: hhAutoresumeText, logo_url: logoUrl, logoUrl,
      stats: typeof proj.stats === "object" ? proj.stats : {},
      cabinet_tabs_text: cabinetTabsText,
      checklistQuestions: proj.checklistQuestions || proj.checklist_questions || [],
      roleplayQuestions: proj.roleplayQuestions || proj.roleplay_questions || [],
      candidate_fields_config: candidateFieldsConfigStr ? parseVacancyCandidateFieldsConfig(candidateFieldsConfigStr) : undefined,
      candidateFieldsConfig: candidateFieldsConfigStr ? parseVacancyCandidateFieldsConfig(candidateFieldsConfigStr) : undefined,
      updated_at: new Date().toISOString(),
    };

    await db.run(
      `INSERT INTO projects (
        id, public_id, legacy_public_id, employer_id, responsible_employer_id, responsible_employer_ids, company_id, company_name, company_slug,
        slug, role_slug, legacy_slug, role_name, salary_terms, schedule_terms, motivation_text,
        motivation_text_detail, custom_wiki, vacancy_text, tasks_activity_text, schedule_text,
        payouts_text, onboarding_text, company_text, mission_text, team_text, system_text,
        training_intro_text, training_prof_text, training_professional_text, training_product_text,
        training_system_text, training_systems_text, training_wiki_text, training_regulations_text,
        training_published, status, is_published, interview_limit, max_interviews, interview_used,
        interview_pass_score, notify_score_threshold, training_limit, max_trainings, training_used,
        created_tasks, hh_post_text, hh_invite_text, hh_autoresume_text, logo_url, stats,
        cabinet_tabs_text, checklist_questions, roleplay_questions, archived_at, deleted_at,
        theme_config, css, company_public_id, employer_public_id, candidate_fields_config,
        notifications_config, data_json, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        public_id = EXCLUDED.public_id,
        legacy_public_id = EXCLUDED.legacy_public_id,
        employer_id = EXCLUDED.employer_id,
        responsible_employer_id = EXCLUDED.responsible_employer_id,
        responsible_employer_ids = EXCLUDED.responsible_employer_ids,
        company_id = EXCLUDED.company_id,
        company_name = EXCLUDED.company_name,
        company_slug = EXCLUDED.company_slug,
        slug = EXCLUDED.slug,
        role_slug = EXCLUDED.role_slug,
        legacy_slug = EXCLUDED.legacy_slug,
        role_name = EXCLUDED.role_name,
        salary_terms = EXCLUDED.salary_terms,
        schedule_terms = EXCLUDED.schedule_terms,
        motivation_text = EXCLUDED.motivation_text,
        motivation_text_detail = EXCLUDED.motivation_text_detail,
        custom_wiki = EXCLUDED.custom_wiki,
        vacancy_text = EXCLUDED.vacancy_text,
        tasks_activity_text = EXCLUDED.tasks_activity_text,
        schedule_text = EXCLUDED.schedule_text,
        payouts_text = EXCLUDED.payouts_text,
        onboarding_text = EXCLUDED.onboarding_text,
        company_text = EXCLUDED.company_text,
        mission_text = EXCLUDED.mission_text,
        team_text = EXCLUDED.team_text,
        system_text = EXCLUDED.system_text,
        training_intro_text = EXCLUDED.training_intro_text,
        training_prof_text = EXCLUDED.training_prof_text,
        training_professional_text = EXCLUDED.training_professional_text,
        training_product_text = EXCLUDED.training_product_text,
        training_system_text = EXCLUDED.training_system_text,
        training_systems_text = EXCLUDED.training_systems_text,
        training_wiki_text = EXCLUDED.training_wiki_text,
        training_regulations_text = EXCLUDED.training_regulations_text,
        training_published = EXCLUDED.training_published,
        status = EXCLUDED.status,
        is_published = EXCLUDED.is_published,
        interview_limit = EXCLUDED.interview_limit,
        max_interviews = EXCLUDED.max_interviews,
        interview_used = EXCLUDED.interview_used,
        interview_pass_score = EXCLUDED.interview_pass_score,
        notify_score_threshold = EXCLUDED.notify_score_threshold,
        training_limit = EXCLUDED.training_limit,
        max_trainings = EXCLUDED.max_trainings,
        training_used = EXCLUDED.training_used,
        created_tasks = EXCLUDED.created_tasks,
        hh_post_text = EXCLUDED.hh_post_text,
        hh_invite_text = EXCLUDED.hh_invite_text,
        hh_autoresume_text = EXCLUDED.hh_autoresume_text,
        logo_url = EXCLUDED.logo_url,
        stats = EXCLUDED.stats,
        cabinet_tabs_text = EXCLUDED.cabinet_tabs_text,
        checklist_questions = EXCLUDED.checklist_questions,
        roleplay_questions = EXCLUDED.roleplay_questions,
        archived_at = EXCLUDED.archived_at,
        deleted_at = EXCLUDED.deleted_at,
        theme_config = EXCLUDED.theme_config,
        css = EXCLUDED.css,
        company_public_id = EXCLUDED.company_public_id,
        employer_public_id = EXCLUDED.employer_public_id,
        candidate_fields_config = EXCLUDED.candidate_fields_config,
        notifications_config = EXCLUDED.notifications_config,
        data_json = EXCLUDED.data_json,
        updated_at = NOW()`,
      [
        id, toBigIntOrNull(publicId), legacyPublicId, employerId, responsibleEmployerId, responsibleEmployerIdsStr, companyId, companyName, companySlug,
        slug, roleSlugFinal, legacySlug, roleName, salaryTerms, scheduleTerms, motivationText,
        motivationTextDetail, customWiki, vacancyText, tasksActivityText, scheduleText,
        payoutsText, onboardingText, companyText, missionText, teamText, systemText,
        trainingIntroText, trainingProfText, trainingProfText, trainingProductText,
        trainingSystemText, trainingSystemText, trainingWikiText, trainingRegulationsText,
        trainingPublished, status, isPublished, interviewLimit, interviewLimit, interviewUsed,
        interviewPassScore, notifyScoreThreshold, trainingLimit, trainingLimit, trainingUsed,
        createdTasks, hhPostText, hhInviteText, hhAutoresumeText, logoUrl, statsStr,
        cabinetTabsText, checklistStr, roleplayStr, archivedAt, deletedAt,
        themeConfigStr, cssStr, companyPublicId, employerPublicId, candidateFieldsConfigStr,
        notifCfgStr, JSON.stringify(fullSnapshot),
      ]
    );

    if (db && roleName) {
      try {
        await db.run(
          `UPDATE candidates
           SET role_name = ?,
               company_id = COALESCE(NULLIF(?, ''), company_id),
               updated_at = NOW()
           WHERE (project_id = ? OR project_id = ?)
             AND COALESCE(role_name, '') != ?`,
          [roleName, companyId ? String(companyId) : "", id, String(publicId), roleName]
        );
      } catch (cascadeErr: any) {
        console.warn("[BD ProTalk] Failed to cascade role_name to candidates:", cascadeErr?.message);
      }
    }

    invalidatePublicVacanciesCache();
    return fullSnapshot;
  } catch (err: any) {
    console.error("[BD ProTalk] saveProject error:", err.message);
    return null;
  }
}

export async function saveCandidateToProTalkDB(db: PgDBWrapper, cand: any) {
  try {
    const candId = cand.id || cand.candidate_id;
    const pubId = cand.public_id || cand.publicId;
    const existing =
      candId || pubId
        ? await db.get("SELECT * FROM candidates WHERE id = ? OR CAST(public_id AS TEXT) = ? LIMIT 1", [
            candId || "",
            String(pubId || ""),
          ])
        : null;

    const stdJson = cand.standard_fields || cand.standard_fields_json || existing?.standard_fields_json || null;
    const stdStr = stdJson ? (typeof stdJson === "object" ? JSON.stringify(stdJson) : String(stdJson)) : null;
    const stdObj: Record<string, any> =
      typeof stdJson === "string"
        ? (() => { try { return JSON.parse(stdJson); } catch { return {}; } })()
        : stdJson || {};

    const custJson = cand.custom_fields || cand.custom_fields_json || existing?.custom_fields_json || null;
    const custStr = custJson ? (typeof custJson === "object" ? JSON.stringify(custJson) : String(custJson)) : null;
    const { data_json: _cdj1, dataJson: _cdj2, ...cleanCand } = cand || {};
    const rawDataJson =
      typeof cand.data_json === "string" ? cand.data_json : cand.data_json ? JSON.stringify(cand.data_json) : JSON.stringify(cleanCand);

    const rawOverall = cand.scores?.overallScore ?? cand.overall_score ?? cand.score ?? null;
    const intScore = rawOverall !== null && rawOverall !== undefined && rawOverall !== "" ? toBigIntOrNull(rawOverall) : null;

    if (existing) {
      await db.run(
        `UPDATE candidates SET
          project_id = COALESCE(NULLIF(?, ''), project_id),
          full_name = COALESCE(NULLIF(?, ''), full_name),
          email = COALESCE(NULLIF(?, ''), email),
          phone = COALESCE(NULLIF(?, ''), phone),
          stage = COALESCE(NULLIF(?, ''), stage),
          current_stage = COALESCE(NULLIF(?, ''), current_stage),
          crm_stage = COALESCE(NULLIF(?, ''), crm_stage),
          score = COALESCE(?, score),
          overall_score = COALESCE(?, overall_score),
          resume_score = COALESCE(?, resume_score),
          checklist_score = COALESCE(?, checklist_score),
          situations_score = COALESCE(?, situations_score),
          resume_text = COALESCE(NULLIF(?, ''), resume_text),
          resume_ai_feedback = COALESCE(NULLIF(?, ''), resume_ai_feedback),
          checklist_ai_feedback = COALESCE(NULLIF(?, ''), checklist_ai_feedback),
          situations_ai_feedback = COALESCE(NULLIF(?, ''), situations_ai_feedback),
          notes = COALESCE(?, notes),
          company_id = COALESCE(NULLIF(?, ''), company_id),
          avatar_url = COALESCE(NULLIF(?, ''), avatar_url),
          resume_url = COALESCE(NULLIF(?, ''), resume_url),
          social_telegram = COALESCE(NULLIF(?, ''), social_telegram),
          social_whatsapp = COALESCE(NULLIF(?, ''), social_whatsapp),
          social_instagram = COALESCE(NULLIF(?, ''), social_instagram),
          social_vk = COALESCE(NULLIF(?, ''), social_vk),
          social_max = COALESCE(NULLIF(?, ''), social_max),
          social_setka = COALESCE(NULLIF(?, ''), social_setka),
          social_github = COALESCE(NULLIF(?, ''), social_github),
          gender = COALESCE(NULLIF(?, ''), gender),
          country = COALESCE(NULLIF(?, ''), country),
          region = COALESCE(NULLIF(?, ''), region),
          city = COALESCE(NULLIF(?, ''), city),
          citizenship = COALESCE(NULLIF(?, ''), citizenship),
          work_experience = COALESCE(NULLIF(?, ''), work_experience),
          employment_type = COALESCE(NULLIF(?, ''), employment_type),
          specializations = COALESCE(NULLIF(?, ''), specializations),
          work_schedule = COALESCE(NULLIF(?, ''), work_schedule),
          desired_commute_time = COALESCE(NULLIF(?, ''), desired_commute_time),
          desired_salary = COALESCE(NULLIF(?, ''), desired_salary),
          education = COALESCE(NULLIF(?, ''), education),
          languages = COALESCE(NULLIF(?, ''), languages),
          skills = COALESCE(NULLIF(?, ''), skills),
          driving_experience = COALESCE(NULLIF(?, ''), driving_experience),
          standard_fields_json = COALESCE(?, standard_fields_json),
          custom_fields_json = COALESCE(?, custom_fields_json),
          data_json = ?,
          updated_at = NOW()
        WHERE id = ?`,
        [
          cand.projectId || cand.project_id || "",
          cand.name || cand.full_name || cand.fullName || "",
          cand.email || "",
          cand.phone || "",
          cand.currentStage || cand.stage || "",
          cand.currentStage || cand.stage || "",
          cand.crmStage || cand.crm_stage || "",
          intScore,
          rawOverall !== null && rawOverall !== undefined ? String(rawOverall) : null,
          cand.scores?.resumeScore ?? cand.resume_score ?? null,
          cand.scores?.checklistScore ?? cand.checklist_score ?? null,
          cand.scores?.situationsScore ?? cand.situations_score ?? null,
          cand.resumeText || cand.resume_text || "",
          typeof cand.resume_ai_feedback === "object" ? JSON.stringify(cand.resume_ai_feedback) : cand.resume_ai_feedback || "",
          typeof cand.checklist_ai_feedback === "object" ? JSON.stringify(cand.checklist_ai_feedback) : cand.checklist_ai_feedback || "",
          typeof cand.situations_ai_feedback === "object" ? JSON.stringify(cand.situations_ai_feedback) : cand.situations_ai_feedback || "",
          cand.notes ?? null,
          cand.companyId || cand.company_id || "",
          cand.avatarUrl || cand.avatar_url || "",
          cand.resumeUrl || cand.resume_url || "",
          cand.socialTelegram || cand.social_telegram || "",
          cand.socialWhatsapp || cand.social_whatsapp || "",
          cand.socialInstagram || cand.social_instagram || "",
          cand.socialVk || cand.social_vk || "",
          cand.socialMax || cand.social_max || "",
          cand.socialSetka || cand.social_setka || "",
          cand.socialGithub || cand.social_github || "",
          Array.isArray(stdObj.gender) ? stdObj.gender.join(", ") : stdObj.gender || "",
          stdObj.country || "",
          stdObj.region || "",
          stdObj.city || "",
          Array.isArray(stdObj.citizenship) ? stdObj.citizenship.join(", ") : stdObj.citizenship || "",
          stdObj.work_experience || stdObj.experience_summary || "",
          Array.isArray(stdObj.employment_type) ? stdObj.employment_type.join(", ") : stdObj.employment_type || "",
          Array.isArray(stdObj.specializations) ? stdObj.specializations.join(", ") : stdObj.specializations || "",
          Array.isArray(stdObj.work_schedule) ? stdObj.work_schedule.join(", ") : stdObj.work_schedule || "",
          Array.isArray(stdObj.desired_commute_time || stdObj.travel_time)
            ? (stdObj.desired_commute_time || stdObj.travel_time).join(", ")
            : stdObj.desired_commute_time || stdObj.travel_time || "",
          stdObj.desired_salary || "",
          Array.isArray(stdObj.education) ? stdObj.education.join(", ") : stdObj.education || "",
          Array.isArray(stdObj.languages) ? stdObj.languages.join(", ") : stdObj.languages || "",
          Array.isArray(stdObj.skills) ? stdObj.skills.join(", ") : stdObj.skills || "",
          Array.isArray(stdObj.driving_experience) ? stdObj.driving_experience.join(", ") : stdObj.driving_experience || "",
          stdStr,
          custStr,
          rawDataJson,
          existing.id,
        ]
      );
      return;
    }

    const nextPid = toBigIntOrNull(cand.public_id || cand.publicId) || Number(await generateNextCandidatePublicId(db));
    await db.run(
      `INSERT INTO candidates (
        id, public_id, project_id, company_id, full_name, email, phone, stage, current_stage, crm_stage,
        score, overall_score, resume_score, checklist_score, situations_score, resume_text,
        resume_ai_feedback, checklist_ai_feedback, situations_ai_feedback, notes,
        standard_fields_json, custom_fields_json, data_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        cand.id || `cand_${Date.now()}`,
        nextPid,
        cand.projectId || cand.project_id || "",
        cand.companyId || cand.company_id || "",
        cand.name || cand.full_name || cand.fullName || "",
        cand.email || "",
        cand.phone || "",
        cand.currentStage || cand.stage || "screening",
        cand.currentStage || cand.stage || "screening",
        cand.crmStage || cand.crm_stage || "new",
        intScore ?? 0,
        rawOverall !== null && rawOverall !== undefined ? String(rawOverall) : "0",
        cand.scores?.resumeScore ?? cand.resume_score ?? null,
        cand.scores?.checklistScore ?? cand.checklist_score ?? null,
        cand.scores?.situationsScore ?? cand.situations_score ?? null,
        cand.resumeText || cand.resume_text || "",
        typeof cand.resume_ai_feedback === "object" ? JSON.stringify(cand.resume_ai_feedback) : cand.resume_ai_feedback || "",
        typeof cand.checklist_ai_feedback === "object" ? JSON.stringify(cand.checklist_ai_feedback) : cand.checklist_ai_feedback || "",
        typeof cand.situations_ai_feedback === "object" ? JSON.stringify(cand.situations_ai_feedback) : cand.situations_ai_feedback || "",
        cand.notes || "",
        stdStr,
        custStr,
        rawDataJson,
      ]
    );
  } catch (err: any) {
    console.error("[BD ProTalk] saveCandidate error:", err.message);
  }
}

export async function savePaymentToProTalkDB(db: PgDBWrapper, pay: any) {
  try {
    await db.run(
      `INSERT INTO payments (id, employer_id, company_name, amount, item_type, item_name, status, data_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET
         employer_id = EXCLUDED.employer_id,
         company_name = EXCLUDED.company_name,
         amount = EXCLUDED.amount,
         item_type = EXCLUDED.item_type,
         item_name = EXCLUDED.item_name,
         status = EXCLUDED.status,
         data_json = EXCLUDED.data_json`,
      [
        pay.id,
        pay.employerId || "emp-demo",
        pay.companyName || "",
        pay.amount ?? 0,
        pay.itemType || "interview",
        pay.itemName || "",
        pay.status || "completed",
        JSON.stringify(pay),
      ]
    );
  } catch (err: any) {
    console.error("[BD ProTalk] savePayment error:", err.message);
  }
}

export async function deleteCandidateFromProTalkDB(db: PgDBWrapper, id: string) {
  try {
    await db.run(`DELETE FROM candidates WHERE id = ?`, [id]);
  } catch (err: any) {
    console.error("[BD ProTalk] deleteCandidate error:", err.message);
  }
}

export async function deleteProjectFromProTalkDB(db: PgDBWrapper, id: string) {
  try {
    await db.run(`DELETE FROM candidates WHERE project_id = ?`, [id]);
    await db.run(`DELETE FROM projects WHERE id = ?`, [id]);
    invalidatePublicVacanciesCache();
  } catch (err: any) {
    console.error("[BD ProTalk] deleteProject error:", err.message);
  }
}

export async function loadAllFromProTalkDB(dbWrapper: PgDBWrapper, targetDb: any = {}) {
  try {
    const [empRows, compRows, projRows, candRows, payRows] = await Promise.all([
      dbWrapper.all("SELECT id, public_id, user_id, name, email, company_name, phone, telegram_username, balance, limits_json, registered_via, created_at FROM employers"),
      dbWrapper.all("SELECT id, public_id, employer_id, name, slug, industry, staff, description, active_vacancies, sites, logo_url, status, is_published FROM companies"),
      dbWrapper.all("SELECT id, public_id, employer_id, company_id, company_name, company_slug, role_name, slug, salary_terms, schedule_terms, motivation_text, status, is_published, checklist_questions, roleplay_questions FROM projects"),
      dbWrapper.all("SELECT id, public_id, project_id, company_id, full_name, email, phone, stage, crm_stage, current_stage, score, overall_score, resume_score, checklist_score, situations_score, created_at FROM candidates ORDER BY created_at DESC LIMIT 300"),
      dbWrapper.all("SELECT id, employer_id, company_name, amount, item_type, item_name, status, created_at FROM payments"),
    ]);

    if (empRows.length > 0) {
      targetDb.employers = empRows.map((r: any) => ({
        id: r.id,
        publicId: r.public_id,
        userId: r.user_id,
        name: r.name,
        email: r.email,
        companyName: r.company_name,
        phone: r.phone,
        telegramUsername: r.telegram_username,
        balance: Number(r.balance || 0),
        limits: r.limits_json ? (() => { try { return JSON.parse(r.limits_json); } catch { return {}; } })() : {},
        registeredVia: r.registered_via,
        createdAt: r.created_at,
      }));
    }

    if (compRows.length > 0) {
      targetDb.companies = compRows.map((r: any) => ({
        id: r.id,
        publicId: r.public_id,
        employerId: r.employer_id,
        name: cleanMojibakeText(r.name),
        slug: r.slug,
        industry: r.industry,
        staff: r.staff,
        description: r.description,
        activeVacancies: r.active_vacancies,
        sites: r.sites,
        logoUrl: r.logo_url,
        status: r.status,
      }));
    }

    if (projRows.length > 0) {
      targetDb.projects = projRows.map((r: any) => ({
        id: r.id,
        publicId: r.public_id,
        employerId: r.employer_id,
        companyId: r.company_id,
        companyName: cleanMojibakeText(r.company_name),
        companySlug: r.company_slug,
        roleName: r.role_name,
        slug: r.slug,
        salaryTerms: r.salary_terms,
        scheduleTerms: r.schedule_terms,
        motivationText: r.motivation_text,
        status: r.status,
        checklistQuestions: r.checklist_questions ? (() => { try { return JSON.parse(r.checklist_questions); } catch { return []; } })() : [],
        roleplayQuestions: r.roleplay_questions ? (() => { try { return JSON.parse(r.roleplay_questions); } catch { return []; } })() : [],
      }));
    }

    if (candRows.length > 0) {
      targetDb.candidates = candRows.map((r: any) => ({
        id: r.id,
        publicId: r.public_id,
        projectId: r.project_id,
        companyId: r.company_id,
        name: r.full_name,
        email: r.email,
        phone: r.phone,
        currentStage: r.crm_stage || r.stage,
        score: Number(r.score || 0),
        createdAt: r.created_at,
      }));
    }

    if (payRows.length > 0) {
      targetDb.payments = payRows.map((r: any) => ({
        id: r.id,
        employerId: r.employer_id,
        companyName: r.company_name,
        amount: r.amount,
        itemType: r.item_type,
        itemName: r.item_name,
        status: r.status,
        createdAt: r.created_at,
      }));
    }
  } catch (err: any) {
    console.error("[BD ProTalk] Error loading state into memory:", err.message);
  }
  return targetDb;
}
