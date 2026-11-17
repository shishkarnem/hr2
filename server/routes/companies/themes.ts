import { Router, Request, Response } from "express";
import { callProTalkLLM, resolveEmployerPublicId } from "../../common";
import { getLandingPresets, saveLandingPreset, deleteLandingPreset, getProTalkDB } from "../../db";
import { executeProTalkQuery, queryGetPg, invalidatePublicVacanciesCache } from "../../db/protalkDb";

export const companyThemesRouter = Router();

companyThemesRouter.get("/theme-presets", async (req: Request, res: Response) => {
  try {
    const employerId = (req.query.employerId as string) || (req.query.employer_id as string) || "";
    const presets = await getLandingPresets(employerId || undefined);
    return res.json({ success: true, presets: presets || [] });
  } catch (err: any) {
    console.error("Error fetching theme presets:", err);
    return res.status(500).json({ error: err.message || "Failed to fetch theme presets" });
  }
});

companyThemesRouter.post("/theme-presets", async (req: Request, res: Response) => {
  try {
    const { id, employer_id, employerId, name, theme, theme_json } = req.body || {};
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: "Preset name is required" });
    }
    const finalThemeJson = typeof theme === "object" ? JSON.stringify(theme) : theme_json || "{}";
    const empId = employer_id || employerId || "100007";
    const saved = await saveLandingPreset({
      id: id || undefined,
      employer_id: empId,
      name: String(name).trim(),
      theme_json: finalThemeJson,
    });
    return res.json({ success: true, preset: saved });
  } catch (err: any) {
    console.error("Error saving theme preset:", err);
    return res.status(500).json({ error: err.message || "Failed to save theme preset" });
  }
});

companyThemesRouter.delete("/theme-presets/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: "ID required" });
    await deleteLandingPreset(id);
    return res.json({ success: true });
  } catch (err: any) {
    console.error("Error deleting theme preset:", err);
    return res.status(500).json({ error: err.message || "Failed to delete theme preset" });
  }
});

companyThemesRouter.post(
  ["/companies/theme", "/companies/:identifier/theme"],
  async (req: Request, res: Response) => {
    try {
      const rawIdentifier =
        req.params.identifier ||
        req.body.company_id ||
        req.body.id ||
        req.body.public_id ||
        req.body.slug ||
        "";
      const cleanId = String(rawIdentifier).replace(/^com/i, "").trim();
      const theme = req.body.theme || req.body.theme_config || req.body.css || {};
      const themeStr =
        typeof theme === "object" && theme !== null ? JSON.stringify(theme) : String(theme || "{}");

      let comp: any = null;
      if (rawIdentifier) {
        comp = await queryGetPg(
          `SELECT * FROM companies
           WHERE id = $1 OR CAST(public_id AS TEXT) = $2 OR slug = $3
              OR id = $4 OR CAST(public_id AS TEXT) = $5 OR slug = $6
              OR legacy_slug = $7 OR legacy_slug = $8
              OR (',' || COALESCE(allslug, '') || ',') LIKE $9
           ORDER BY CASE WHEN id = $1 THEN 1 WHEN CAST(public_id AS TEXT) = $5 THEN 2 WHEN slug = $6 THEN 3 ELSE 4 END ASC
           LIMIT 1`,
          [
            rawIdentifier,
            rawIdentifier,
            rawIdentifier,
            cleanId,
            cleanId,
            cleanId,
            rawIdentifier,
            cleanId,
            `%,${cleanId.toLowerCase()},%`,
          ]
        );
      }

      if (!comp && req.body.employer_id) {
        comp = await queryGetPg(
          "SELECT * FROM companies WHERE owner_employer_id = $1 OR employer_id = $1 ORDER BY created_at DESC NULLS LAST LIMIT 1",
          [req.body.employer_id]
        );
      }

      if (comp) {
        const cleanCompId = String(comp.id);
        const cleanCompPubId = String(comp.public_id || "");
        const cleanCompSlug = String(comp.slug || "");

        await executeProTalkQuery(
          "UPDATE companies SET theme_config = $1, css = $1, updated_at = NOW() WHERE id = $2",
          [themeStr, cleanCompId]
        );
        await executeProTalkQuery(
          `UPDATE projects 
           SET theme_config = $1, css = $1, updated_at = NOW() 
           WHERE company_id = $2 
              OR ($3 != '' AND (company_id = $3 OR company_id = $4 OR CAST(company_public_id AS TEXT) = $3))
              OR ($5 != '' AND company_slug = $5)`,
          [themeStr, cleanCompId, cleanCompPubId, `comp-${cleanCompPubId}`, cleanCompSlug]
        );

        comp.theme_config = themeStr;
        comp.css = themeStr;
      }

      invalidatePublicVacanciesCache();
      return res.json({ success: true, company: comp, theme });
    } catch (err: any) {
      console.error("Error saving company theme:", err);
      return res.status(500).json({ error: err.message || "Failed to save theme" });
    }
  }
);

const DEFAULT_FALLBACK_THEME = {
  fontFamily: "'Manrope', sans-serif",
  headingsColorMode: "gradient-gold",
  headingsSolidColor: "#E7C768",
  bodyTextColor: "#E2E8F0",
  boldTextColor: "#FFFFFF",
  iconColor: "#E7C768",
  lineHeight: 1.6,
  fontSizeH1: 36,
  fontSizeH2: 26,
  fontSizeH3: 20,
  fontSizeH4: 16,
  fontSizeBody: 15,
  pageBgColor: "#17344F",
  pageBgOpacity: 100,
  heroBgImageUrl: "",
  heroBgDisplayMode: "cover",
  heroBgParallaxSpeed: 0.4,
  pageBgImageUrl: "",
  pageBgDisplayMode: "fixed",
  pageBgParallaxSpeed: 0.35,
  showSphereAnimation: false,
  showWaveAnimation: true,
  sitePreviewHeight: 180,
  siteDisplayMode: "preview",
  containerBgColor: "#17344F",
  containerBgOpacity: 0,
  glassBlurPx: 24,
  containerBorderColor: "#FFFFFF",
  containerBorderOpacity: 20,
  containerBorderWidth: 1,
  containerBorderRadius: 24,
  headerBgColor: "#17344F",
  headerBgOpacity: 0,
  headerBorderColor: "#FFFFFF",
  headerBorderOpacity: 20,
  headerBorderWidth: 1,
  headerBorderRadius: 0,
  btnActiveBgColor: "#E7C768",
  btnActiveTextColor: "#17344F",
  btnActiveOpacity: 100,
  btnInactiveBgColor: "#000000",
  btnInactiveTextColor: "#CBD5E1",
  btnInactiveOpacity: 25,
  btnBorderColor: "#FFFFFF",
  btnBorderOpacity: 20,
  btnBorderWidth: 1,
  btnBorderRadius: 16,
  customCss: "",
};

companyThemesRouter.post("/generate-landing-theme", async (req: Request, res: Response) => {
  try {
    const {
      userPrompt,
      companyName,
      industry,
      currentTheme,
      userId,
      employerId,
      employer_id,
      employer_public_id,
      employerPublicId,
      company_id,
      companyId,
      project_id,
      projectId,
    } = req.body || {};
    const db = await getProTalkDB();
    const cleanUid = await resolveEmployerPublicId(db, {
      employerPublicId: employer_public_id || employerPublicId || (req as any).user?.public_id,
      employerId: employerId || employer_id || (req as any).user?.id,
      userId,
      companyId: company_id || companyId,
      projectId: project_id || projectId,
    });
    const editorChatId = `${cleanUid}_RReditor`;
    const effectiveBase = {
      ...DEFAULT_FALLBACK_THEME,
      ...(typeof currentTheme === "object" && currentTheme !== null ? currentTheme : {}),
    };

    const systemPrompt = `Ты — Ведущий арт-директор и UI/UX дизайнер элитных веб-интерфейсов компании "Робот Рекрутер (RR)".
Компания: "${companyName || "Компания"}" (${industry || "Бизнес"}).

Текущие настройки визуального стиля лендинга:
${JSON.stringify(effectiveBase, null, 2)}

Пожелания пользователя к обновлению визуального стиля:
"${userPrompt || "Создай гармоничную премиальную палитру в стиле Apple Liquid Glass"}"

Правила дизайна и генерации:
1. Обязательно сгенерируй и заполни ВСЕ поля JSON конфигурации без пропусков.
2. Стиль Apple Liquid Glass: в контейнерах ("containerBgOpacity") и шапке ("headerBgOpacity") фон прозрачный (0% или легкое стекло до 15%), glassBlurPx: 20-32.
3. Высокая контрастность: текст ("bodyTextColor": "#E2E8F0" или "#FFFFFF", "boldTextColor": "#FFFFFF") должен идеально считываться на фоне страницы ("pageBgColor").
4. Заголовки ("headingsColorMode"): "gradient-gold", "gradient-silver", или "solid".
5. Шрифты ("fontFamily"): ИСКЛЮЧИТЕЛЬНО шрифты Google Fonts с кириллицей ('Manrope', 'Montserrat', 'Inter', 'Roboto', 'Open Sans', 'Rubik', 'Raleway', 'Golos Text', 'Playfair Display', 'Unbounded', 'PT Sans', 'PT Serif', 'Fira Sans', 'Nunito', 'Ubuntu', 'Comfortaa', 'Cormorant Garamond', 'Oswald', 'Merriweather', 'Exo 2', 'Onest', 'Jura'). Plus Jakarta Sans запрещен.

Верни СТРОГО валидный JSON конфигурации темы лендинга (только сырой JSON объект).`;

    const messages = [{ role: "user", content: systemPrompt }];
    let textResponse = await callProTalkLLM(
      "other",
      messages,
      editorChatId,
      cleanUid,
      undefined,
      "landing_theme_generation"
    );
    textResponse = textResponse.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();

    let parsed: any = {};
    try {
      parsed = JSON.parse(textResponse);
    } catch {
      const match = textResponse.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          parsed = JSON.parse(match[0]);
        } catch {}
      }
    }

    const completeTheme = {
      ...effectiveBase,
      ...parsed,
      lineHeight: typeof parsed.lineHeight === "number" ? parsed.lineHeight : effectiveBase.lineHeight,
      fontSizeH1: Number(parsed.fontSizeH1) || effectiveBase.fontSizeH1,
      fontSizeH2: Number(parsed.fontSizeH2) || effectiveBase.fontSizeH2,
      fontSizeH3: Number(parsed.fontSizeH3) || effectiveBase.fontSizeH3,
      fontSizeH4: Number(parsed.fontSizeH4) || effectiveBase.fontSizeH4,
      fontSizeBody: Number(parsed.fontSizeBody) || effectiveBase.fontSizeBody,
      pageBgOpacity: typeof parsed.pageBgOpacity === "number" ? parsed.pageBgOpacity : 100,
      containerBgOpacity:
        typeof parsed.containerBgOpacity === "number"
          ? parsed.containerBgOpacity
          : effectiveBase.containerBgOpacity,
      glassBlurPx: typeof parsed.glassBlurPx === "number" ? parsed.glassBlurPx : effectiveBase.glassBlurPx,
      containerBorderOpacity:
        typeof parsed.containerBorderOpacity === "number"
          ? parsed.containerBorderOpacity
          : effectiveBase.containerBorderOpacity,
      containerBorderWidth:
        typeof parsed.containerBorderWidth === "number"
          ? parsed.containerBorderWidth
          : effectiveBase.containerBorderWidth,
      containerBorderRadius:
        typeof parsed.containerBorderRadius === "number"
          ? parsed.containerBorderRadius
          : effectiveBase.containerBorderRadius,
      headerBgOpacity:
        typeof parsed.headerBgOpacity === "number" ? parsed.headerBgOpacity : effectiveBase.headerBgOpacity,
      headerBorderOpacity:
        typeof parsed.headerBorderOpacity === "number"
          ? parsed.headerBorderOpacity
          : effectiveBase.headerBorderOpacity,
      headerBorderWidth:
        typeof parsed.headerBorderWidth === "number"
          ? parsed.headerBorderWidth
          : effectiveBase.headerBorderWidth,
      headerBorderRadius:
        typeof parsed.headerBorderRadius === "number"
          ? parsed.headerBorderRadius
          : effectiveBase.headerBorderRadius,
      btnActiveOpacity:
        typeof parsed.btnActiveOpacity === "number" ? parsed.btnActiveOpacity : effectiveBase.btnActiveOpacity,
      btnInactiveOpacity:
        typeof parsed.btnInactiveOpacity === "number"
          ? parsed.btnInactiveOpacity
          : effectiveBase.btnInactiveOpacity,
      btnBorderOpacity:
        typeof parsed.btnBorderOpacity === "number" ? parsed.btnBorderOpacity : effectiveBase.btnBorderOpacity,
      btnBorderWidth:
        typeof parsed.btnBorderWidth === "number" ? parsed.btnBorderWidth : effectiveBase.btnBorderWidth,
      btnBorderRadius:
        typeof parsed.btnBorderRadius === "number" ? parsed.btnBorderRadius : effectiveBase.btnBorderRadius,
      showSphereAnimation:
        typeof parsed.showSphereAnimation === "boolean"
          ? parsed.showSphereAnimation
          : Boolean(effectiveBase.showSphereAnimation),
      showWaveAnimation:
        typeof parsed.showWaveAnimation === "boolean"
          ? parsed.showWaveAnimation
          : effectiveBase.showWaveAnimation !== false,
      sitePreviewHeight:
        typeof parsed.sitePreviewHeight === "number"
          ? parsed.sitePreviewHeight
          : effectiveBase.sitePreviewHeight,
      siteDisplayMode: parsed.siteDisplayMode === "buttons" ? "buttons" : "preview",
      customCss: typeof parsed.customCss === "string" ? parsed.customCss : effectiveBase.customCss || "",
    };

    return res.json({ success: true, theme: completeTheme });
  } catch (err: any) {
    console.error("Error generating landing theme:", err);
    return res.json({ success: true, theme: DEFAULT_FALLBACK_THEME });
  }
});
