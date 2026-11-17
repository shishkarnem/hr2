import { Router, Request, Response } from "express";
import {
  saveCompanyToProTalkDB,
  getProTalkDB,
  generateNextCompanyPublicId,
  transliterateToSlug,
} from "../../db";
import { cleanMojibakeText, cleanMojibakeDeep } from "../../db/protalkDb";

export const companyCrudRouter = Router();

companyCrudRouter.get("/companies", async (req: Request, res: Response) => {
  try {
    const db = await getProTalkDB();
    const rawEmpParam = (req.query.employerId as string | undefined) || "";
    const cleanEmpParam = rawEmpParam.replace(/^emp-?/i, "").trim();

    let rows: any[] = [];
    if (rawEmpParam) {
      const empRecord = await db.get(
        "SELECT id, public_id, user_id FROM employers WHERE id = ? OR CAST(public_id AS TEXT) = ? OR id = ? OR CAST(public_id AS TEXT) = ? OR user_id = ?",
        [rawEmpParam, rawEmpParam, cleanEmpParam, cleanEmpParam, rawEmpParam]
      );

      const candidateIds = new Set<string>();
      if (rawEmpParam) candidateIds.add(rawEmpParam);
      if (cleanEmpParam) {
        candidateIds.add(cleanEmpParam);
        candidateIds.add(`emp-${cleanEmpParam}`);
        candidateIds.add(`emp${cleanEmpParam}`);
      }
      if (empRecord) {
        if (empRecord.id) candidateIds.add(String(empRecord.id));
        if (empRecord.public_id) candidateIds.add(String(empRecord.public_id));
        if (empRecord.user_id) candidateIds.add(String(empRecord.user_id));
      }

      const idsArray = Array.from(candidateIds);
      const placeholders = idsArray.map(() => "?").join(",");
      const params = [...idsArray, ...idsArray];

      rows =
        (await db.all(
          `SELECT * FROM companies WHERE employer_id IN (${placeholders}) OR owner_employer_id IN (${placeholders}) ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST`,
          params
        )) || [];

      try {
        const memberRows =
          (await db.all(
            `SELECT c.*, cm.role AS member_role, cm.permissions_json AS member_permissions, 1 AS is_team_member
             FROM company_members cm
             JOIN companies c ON c.id = cm.company_id
             WHERE cm.employer_id IN (${placeholders}) AND cm.status = 'active'`,
            idsArray
          )) || [];

        const existingIds = new Set(rows.map((r: any) => String(r.id)));
        for (const mRow of memberRows) {
          if (!existingIds.has(String(mRow.id))) {
            rows.push(mRow);
            existingIds.add(String(mRow.id));
          }
        }
      } catch (memberErr) {
        console.warn("Could not query company_members for companies list:", memberErr);
      }

      return res.json(cleanMojibakeDeep(rows));
    }

    rows =
      (await db.all(
        "SELECT * FROM companies ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST"
      )) || [];
    return res.json(cleanMojibakeDeep(rows));
  } catch (err: any) {
    console.error("Error reading companies from PostgreSQL BD ProTalk:", err);
    return res.status(500).json({ error: err.message || "Failed to fetch companies" });
  }
});

companyCrudRouter.post("/companies", async (req: Request, res: Response) => {
  try {
    const db = await getProTalkDB();
    const body = cleanMojibakeDeep(req.body || {});
    const {
      id,
      name,
      slug,
      industry,
      staff,
      description,
      description_text,
      products_text,
      about_text,
      sites,
      website,
      logoUrl,
      logo_url,
      employerId,
      owner_employer_id,
      files,
      missionText,
      mission_text,
      customWiki,
      system_text,
      salaryTerms,
      payouts_text,
      scheduleTerms,
      schedule_text,
      stats,
      statsValClients,
      statsLabelClients,
      statsValDialogs,
      statsLabelDialogs,
      statsValFounded,
      statsLabelFounded,
      public_id,
      publicId,
      status,
    } = body;

    const rawPubId = public_id || publicId;
    const finalPublicId = rawPubId || (await generateNextCompanyPublicId(db));
    const companyName = cleanMojibakeText((name && String(name).trim()) || "");
    const isUnnamed = !companyName || companyName === "Компания" || companyName === "Без названия";
    const defaultFallbackSlug = `com${finalPublicId || "300046"}`;

    const transliteratedName = transliterateToSlug(companyName);
    const rawSlug =
      slug || (isUnnamed ? defaultFallbackSlug : transliteratedName || defaultFallbackSlug);

    let existingDbComp: any = null;
    if (id) {
      existingDbComp = await db.get(
        "SELECT * FROM companies WHERE id = ? OR CAST(public_id AS TEXT) = ? OR slug = ? OR legacy_slug = ? LIMIT 1",
        [id, String(id), id, id]
      );
    }
    if (!existingDbComp && rawPubId) {
      existingDbComp = await db.get(
        "SELECT * FROM companies WHERE CAST(public_id AS TEXT) = ? OR CAST(legacy_public_id AS TEXT) = ? OR id = ? OR slug = ? LIMIT 1",
        [String(rawPubId), String(rawPubId), String(rawPubId), String(rawPubId)]
      );
    }
    if (!existingDbComp && slug) {
      existingDbComp = await db.get(
        "SELECT * FROM companies WHERE slug = ? OR legacy_slug = ? LIMIT 1",
        [slug, slug]
      );
    }
    if (!existingDbComp && companyName && companyName !== "Компания" && companyName !== "Без названия") {
      existingDbComp = await db.get(
        "SELECT * FROM companies WHERE LOWER(name) = LOWER(?) LIMIT 1",
        [companyName]
      );
    }

    let finalSlug = rawSlug;
    if (finalSlug && !finalSlug.startsWith("draft-")) {
      const currentOwnSlug = existingDbComp?.slug || "";
      const currentOwnLegacy = existingDbComp?.legacy_slug || "";
      const isSlugUnchanged =
        (currentOwnSlug && currentOwnSlug.toLowerCase() === finalSlug.toLowerCase()) ||
        (currentOwnLegacy && currentOwnLegacy.toLowerCase() === finalSlug.toLowerCase());

      if (!isSlugUnchanged) {
        const excludeId = existingDbComp?.id || id || "";
        const excludePubId = String(existingDbComp?.public_id || finalPublicId || "");
        const collision = await db.get(
          "SELECT id, public_id, name, slug FROM companies WHERE slug = ? AND id != ? AND CAST(public_id AS TEXT) != ? AND (status IS NULL OR status != 'deleted') LIMIT 1",
          [finalSlug, excludeId, excludePubId]
        );
        if (collision) {
          return res.status(400).json({
            error: "duplicate_company_slug",
            message: `Компания с адресом /${finalSlug} уже зарегистрирована («${collision.name || finalSlug}», ID: ${collision.public_id || collision.id}). Пожалуйста, укажите другой адрес компании.`,
          });
        }
      }
    }

    const requestedLogo =
      logo_url !== undefined && logo_url !== null
        ? String(logo_url).trim()
        : logoUrl !== undefined && logoUrl !== null
        ? String(logoUrl).trim()
        : "";
    const finalLogo = requestedLogo || "/files/11/rr-logo.png";

    let finalSites = "";
    if (sites !== undefined && sites !== null && sites !== "") {
      finalSites = typeof sites === "object" ? JSON.stringify(sites) : String(sites);
    } else if (website) {
      finalSites = String(website);
    }
    const finalWebsite = website || (finalSites && !finalSites.trim().startsWith("[") ? finalSites : "");
    const finalDesc = description || description_text || about_text || "";
    const finalDescText = description_text || description || "";
    const finalProducts = products_text || "";
    const finalAbout = about_text || description || "";
    const finalMission = mission_text || missionText || "";
    const finalWiki = system_text || customWiki || "";
    const finalSalary = payouts_text || salaryTerms || "";
    const finalSchedule = schedule_text || scheduleTerms || "";
    const finalOwnerId = owner_employer_id || employerId || "100007";
    const finalStatus = status || "published";
    const isPub = finalStatus === "published" ? 1 : 0;
    const finalStats = typeof stats === "object" ? JSON.stringify(stats) : stats || "";

    const finalThemeConfig =
      body.theme_config && body.theme_config !== "null"
        ? body.theme_config
        : body.themeConfig && body.themeConfig !== "null"
        ? body.themeConfig
        : body.css && body.css !== "null"
        ? body.css
        : existingDbComp?.theme_config || existingDbComp?.css || null;
    const finalCss = body.css && body.css !== "null" ? body.css : finalThemeConfig;

    const comp =
      existingDbComp ||
      (id ? await db.get("SELECT * FROM companies WHERE id = ? OR CAST(public_id AS TEXT) = ? LIMIT 1", [id, String(id)]) : null);

    if (comp) {
      comp.name = companyName;
      comp.industry = industry || comp.industry;
      comp.staff = staff || comp.staff;
      comp.description = finalDesc || comp.description;
      comp.description_text = finalDescText || comp.description_text;
      comp.products_text = finalProducts || comp.products_text;
      comp.about_text = finalAbout || comp.about_text;
      comp.sites = finalSites || comp.sites;
      comp.website = finalWebsite || comp.website;
      comp.logoUrl = finalLogo;
      comp.logo_url = finalLogo;
      comp.files = files || comp.files;
      comp.missionText = finalMission || comp.missionText;
      comp.mission_text = finalMission || comp.mission_text;
      comp.customWiki = finalWiki || comp.customWiki;
      comp.system_text = finalWiki || comp.system_text;
      comp.salaryTerms = finalSalary || comp.salaryTerms;
      comp.payouts_text = finalSalary || comp.payouts_text;
      comp.scheduleTerms = finalSchedule || comp.scheduleTerms;
      comp.schedule_text = finalSchedule || comp.schedule_text;
      comp.stats = finalStats;
      comp.statsValClients = statsValClients || comp.statsValClients;
      comp.statsLabelClients = statsLabelClients || comp.statsLabelClients;
      comp.statsValDialogs = statsValDialogs || comp.statsValDialogs;
      comp.statsLabelDialogs = statsLabelDialogs || comp.statsLabelDialogs;
      comp.statsValFounded = statsValFounded || comp.statsValFounded;
      comp.statsLabelFounded = statsLabelFounded || comp.statsLabelFounded;
      comp.status = finalStatus;
      comp.is_published = isPub;
      comp.owner_employer_id = finalOwnerId;
      comp.employer_id = finalOwnerId;
      comp.public_id = comp.public_id || finalPublicId;
      if (finalThemeConfig) comp.theme_config = finalThemeConfig;
      if (finalCss) comp.css = finalCss;
      if (finalSlug && !finalSlug.startsWith("draft-")) {
        comp.slug = finalSlug;
      }

      const saved = await saveCompanyToProTalkDB(db, comp);
      if (saved?.slug) comp.slug = saved.slug;
      if (saved?.public_id) comp.public_id = saved.public_id;

      if (finalStatus === "published") {
        try {
          await db.run(
            "DELETE FROM companies WHERE (owner_employer_id = ? OR employer_id = ?) AND (name IS NULL OR trim(name) = '') AND id != ?",
            [finalOwnerId, finalOwnerId, comp.id]
          );
        } catch (e) {
          console.warn("Ghost draft cleanup note:", e);
        }
      }
      return res.json({ success: true, company: cleanMojibakeDeep(comp) });
    }

    const newCompany: any = {
      id: id || "comp-" + Math.random().toString(36).substring(2, 8),
      public_id: finalPublicId,
      name: companyName,
      slug: finalSlug,
      industry: industry || "Производство",
      staff: staff || "10-25 человек",
      description: finalDesc,
      description_text: finalDescText,
      products_text: finalProducts,
      about_text: finalAbout,
      sites: finalSites,
      website: finalWebsite,
      logoUrl: finalLogo,
      logo_url: finalLogo,
      files: files || "",
      employerId: finalOwnerId,
      employer_id: finalOwnerId,
      owner_employer_id: finalOwnerId,
      activeVacancies: 0,
      missionText: finalMission,
      mission_text: finalMission,
      customWiki: finalWiki,
      system_text: finalWiki,
      salaryTerms: finalSalary,
      payouts_text: finalSalary,
      scheduleTerms: finalSchedule,
      schedule_text: finalSchedule,
      stats: finalStats,
      statsValClients: statsValClients || "",
      statsLabelClients: statsLabelClients || "",
      statsValDialogs: statsValDialogs || "",
      statsLabelDialogs: statsLabelDialogs || "",
      statsValFounded: statsValFounded || "",
      statsLabelFounded: statsLabelFounded || "",
      status: finalStatus,
      is_published: isPub,
      theme_config: finalThemeConfig || undefined,
      css: finalCss || undefined,
    };

    const saved = await saveCompanyToProTalkDB(db, newCompany);
    if (saved?.slug) newCompany.slug = saved.slug;
    if (saved?.public_id) newCompany.public_id = saved.public_id;

    if (finalStatus === "published") {
      try {
        await db.run(
          "DELETE FROM companies WHERE (owner_employer_id = ? OR employer_id = ?) AND (name IS NULL OR trim(name) = '') AND id != ?",
          [finalOwnerId, finalOwnerId, newCompany.id]
        );
      } catch (e) {
        console.warn("Ghost draft cleanup note:", e);
      }
    }

    return res.status(200).json({ success: true, company: cleanMojibakeDeep(newCompany) });
  } catch (err: any) {
    console.error("Error creating company:", err);
    return res.status(500).json({ success: false, error: err.message || "Failed to save company" });
  }
});

companyCrudRouter.post("/companies/draft", async (req: Request, res: Response) => {
  try {
    const db = await getProTalkDB();
    const employerId = (req.body && (req.body.employerId || req.body.owner_employer_id)) || "100007";

    const existingDraft = await db.get(
      "SELECT * FROM companies WHERE (owner_employer_id = ? OR employer_id = ?) AND (status = 'draft' OR is_published = 0) AND (name IS NULL OR trim(name) = '') ORDER BY created_at DESC NULLS LAST LIMIT 1",
      [employerId, employerId]
    );
    if (existingDraft) {
      return res.json({ success: true, company: existingDraft });
    }

    const draftId = `comp-${Math.random().toString(36).substring(2, 8)}`;
    const draftPublicId = await generateNextCompanyPublicId(db);
    const draftSlug = `draft-${draftId}`;

    const draftCompany = {
      id: draftId,
      public_id: draftPublicId,
      name: "",
      slug: draftSlug,
      legacy_slug: draftSlug,
      industry: "",
      staff: "",
      description: "",
      description_text: "",
      products_text: "",
      about_text: "",
      sites: "",
      website: "",
      logo_url: "/files/11/rr-logo.png",
      logoUrl: "/files/11/rr-logo.png",
      mission_text: "",
      system_text: "",
      payouts_text: "",
      schedule_text: "",
      status: "draft",
      is_published: 0,
      employerId,
      employer_id: employerId,
      owner_employer_id: employerId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await saveCompanyToProTalkDB(db, draftCompany);
    return res.json({ success: true, company: draftCompany });
  } catch (err: any) {
    console.error("Error creating company draft:", err);
    return res.status(500).json({ success: false, error: err.message || "Failed to create company draft" });
  }
});

companyCrudRouter.get("/companies/by-slug/:slug", async (req: Request, res: Response) => {
  try {
    const db = await getProTalkDB();
    const rawSlug = req.params.slug;
    const cleanSlug = rawSlug.replace(/^com/i, "").trim();

    const comp = await db.get(
      `SELECT * FROM companies 
       WHERE slug = ? OR CAST(public_id AS TEXT) = ? OR id = ?
          OR slug = ? OR CAST(public_id AS TEXT) = ? OR id = ?
          OR legacy_slug = ? OR legacy_slug = ?
          OR (',' || COALESCE(allslug, '') || ',') LIKE ?
          OR (',' || COALESCE(allslug, '') || ',') LIKE ?
       ORDER BY 
         CASE 
           WHEN slug = ? THEN 1
           WHEN slug = ? THEN 2
           WHEN CAST(public_id AS TEXT) = ? THEN 3
           WHEN CAST(public_id AS TEXT) = ? THEN 4
           WHEN id = ? THEN 5
           WHEN id = ? THEN 6
           WHEN legacy_slug = ? THEN 7
           WHEN legacy_slug = ? THEN 8
           ELSE 9
         END ASC,
         created_at ASC NULLS LAST
       LIMIT 1`,
      [
        rawSlug,
        rawSlug,
        rawSlug,
        cleanSlug,
        cleanSlug,
        cleanSlug,
        rawSlug,
        cleanSlug,
        `%,${rawSlug.toLowerCase()},%`,
        `%,${cleanSlug.toLowerCase()},%`,
        rawSlug,
        cleanSlug,
        rawSlug,
        cleanSlug,
        rawSlug,
        cleanSlug,
        rawSlug,
        cleanSlug,
      ]
    );

    if (comp) {
      const canonicalSlug = comp.slug || rawSlug;
      const isRedirect = Boolean(canonicalSlug && canonicalSlug !== rawSlug && canonicalSlug !== cleanSlug);
      return res.json({ success: true, company: cleanMojibakeDeep(comp), canonicalSlug, isRedirect });
    }
    return res.status(404).json({ success: false, error: "Company not found" });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

companyCrudRouter.post("/companies/:id/archive", async (req: Request, res: Response) => {
  try {
    const db = await getProTalkDB();
    const companyId = req.params.id;
    const comp = await db.get(
      "SELECT * FROM companies WHERE id = ? OR CAST(public_id AS TEXT) = ? OR slug = ? LIMIT 1",
      [companyId, companyId, companyId]
    );
    if (comp) {
      const isArchived = Boolean(comp.archived_at);
      const newArchivedAt = isArchived ? null : new Date().toISOString();
      const newStatus = isArchived ? (comp.is_published ? "published" : "draft") : "archive";
      await db.run(
        "UPDATE companies SET archived_at = ?, status = ?, updated_at = NOW() WHERE id = ?",
        [newArchivedAt, newStatus, comp.id]
      );
      return res.json({ success: true, archived: !isArchived });
    }
    return res.json({ success: true });
  } catch (err: any) {
    console.error("Error archiving company:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

companyCrudRouter.delete("/companies/:id", async (req: Request, res: Response) => {
  try {
    const db = await getProTalkDB();
    const companyId = req.params.id;
    await db.run(
      "UPDATE companies SET deleted_at = NOW(), status = 'deleted', updated_at = NOW() WHERE id = ? OR CAST(public_id AS TEXT) = ? OR slug = ?",
      [companyId, companyId, companyId]
    );
    return res.json({ success: true });
  } catch (err: any) {
    console.error("Error deleting company:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

companyCrudRouter.post("/companies/:id/restore", async (req: Request, res: Response) => {
  try {
    const db = await getProTalkDB();
    const companyId = req.params.id;
    await db.run(
      "UPDATE companies SET deleted_at = NULL, archived_at = NULL, status = 'published', is_published = 1, updated_at = NOW() WHERE id = ? OR CAST(public_id AS TEXT) = ? OR slug = ?",
      [companyId, companyId, companyId]
    );
    return res.json({ success: true });
  } catch (err: any) {
    console.error("Error restoring company:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});
