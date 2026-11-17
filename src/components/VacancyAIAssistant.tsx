import React from "react";
import UnifiedAIAssistant from "./UnifiedAIAssistant";
import type { LandingThemeConfig } from "./LandingStyleEditor";

export default function VacancyAIAssistant({
  logoUrl,
  companyName,
  companySlug,
  companyId,
  roleName,
  vacancySlug,
  context,
  projectId,
  themeColors,
  containerBorderRadius,
  logoFilterColor,
  logoFilterOpacity,
  logoBgColor,
  logoBgOpacity,
  themeConfig,
}: {
  logoUrl?: string | null;
  companyName?: string | null;
  companySlug?: string;
  companyId?: string | number;
  roleName?: string | null;
  vacancySlug?: string;
  context?: string;
  projectId?: string;
  themeColors?: {
    headingColor?: string;
    bodyTextColor?: string;
    boldTextColor?: string;
    iconColor?: string;
    headingsColorMode?: string;
  };
  containerBorderRadius?: number | null;
  logoFilterColor?: string | null;
  logoFilterOpacity?: number | null;
  logoBgColor?: string | null;
  logoBgOpacity?: number | null;
  themeConfig?: LandingThemeConfig | null;
}) {
  return (
    <UnifiedAIAssistant
      assistantType="vacancy_company"
      logoUrl={logoUrl || undefined}
      companyName={companyName || undefined}
      companySlug={companySlug}
      companyId={companyId}
      roleName={roleName || undefined}
      vacancySlug={vacancySlug}
      contextText={context}
      projectId={projectId}
      themeConfig={themeConfig}
      themeColors={themeColors}
    />
  );
}
