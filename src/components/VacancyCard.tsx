import React, { useEffect } from "react";
import { ArrowRight, Building2, Wallet, Clock, CheckCircle2 } from "lucide-react";
import RRImage from "@/components/RRImage";
import NeuronSphereCanvas from "@/components/NeuronSphereCanvas";
import { ensureGoogleFontLoaded } from "@/components/LandingStyleEditor";

export type VacancyCardData = {
  id: string;
  public_id?: string | null;
  publicId?: string | null;
  slug?: string | null;
  role_slug?: string | null;
  roleName?: string | null;
  companyName?: string | null;
  companyLogo?: string | null;
  industry?: string | null;
  salaryTerms?: string | null;
  scheduleTerms?: string | null;
  vacancyText?: string | null;
  [key: string]: any;
};

function firstLine(text?: string | null): string | undefined {
  if (!text) return undefined;
  const l = String(text)
    .split("\n")
    .map((s) => s.replace(/^[•\-\s*]+/, "").trim())
    .find((s) => s.length > 0);
  return l || undefined;
}

function parseVacancyListItems(text?: string | null, maxItems = 4, maxItemLen = 115): string[] {
  if (!text) return [];
  const normalized = String(text)
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");

  const rawLines = normalized.split("\n");
  const segments: string[] = [];

  for (const line of rawLines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/[•●▪▸]/.test(trimmed)) {
      const parts = trimmed
        .split(/\s*[•●▪▸]\s*/)
        .map((p) => p.trim())
        .filter(Boolean);
      segments.push(...parts);
    } else {
      segments.push(trimmed);
    }
  }

  const items: string[] = [];
  for (const seg of segments) {
    const withoutHeader = seg
      .replace(/^(?:требования|обязанности|условия|задачи|о вакансии|описание)\s*[:\-—]\s*/i, "")
      .trim();
    const clean = withoutHeader
      .replace(/^(?:[•●▪▸\-*—–]|\d+[.)])\s*/, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!clean) continue;
    if (/^(требования|обязанности|условия|задачи|о вакансии|описание)[:.]?$/i.test(clean)) continue;
    const truncated =
      clean.length > maxItemLen ? clean.slice(0, maxItemLen - 1).trimEnd() + "…" : clean;
    items.push(truncated);
    if (items.length >= maxItems) break;
  }

  return items;
}

interface Props {
  vacancy: VacancyCardData;
  onOpen: (v: VacancyCardData) => void;
  active?: boolean;
  showCompany?: boolean;
  className?: string;
  href?: string;
  layout?: "vertical" | "horizontal";
  themeConfig?: any;
}

function hexToRgbaLocal(hex: string, opacityPercent: number = 100): string {
  if (!hex) return `rgba(255, 255, 255, ${opacityPercent / 100})`;
  let cleanHex = hex.replace("#", "").trim();
  if (cleanHex.length === 3) {
    cleanHex = cleanHex.split("").map((c) => c + c).join("");
  }
  if (cleanHex.length !== 6) return hex;
  const num = parseInt(cleanHex, 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  const a = Math.max(0, Math.min(1, opacityPercent / 100));
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/**
 * Карточка вакансии с поддержкой индивидуального стиля компании:
 * - Сплошной непрозрачный фон плитки (без прозрачности)
 * - Анимированная 3D нейросфера на фоне в цветах компании
 * - Фирменные цвета текста, заголовков, иконок, рамок, скруглений
 * - Стандартный стиль с золотым градиентом при отсутствии темы
 */
export const VacancyCard: React.FC<Props> = ({
  vacancy: v,
  onOpen,
  active,
  showCompany = true,
  className = "",
  href,
  layout = "vertical",
  themeConfig,
}) => {
  const salary = firstLine(v.salaryTerms);
  const schedule = firstLine(v.scheduleTerms);
  const parsedDescItems = parseVacancyListItems(v.vacancyText, 4, 115);
  const descItems =
    parsedDescItems.length > 0
      ? parsedDescItems
      : [salary, schedule].filter((x): x is string => Boolean(x));

  // Safe parse themeConfig if string
  const t =
    typeof themeConfig === "string"
      ? (() => {
          try {
            return JSON.parse(themeConfig);
          } catch {
            return null;
          }
        })()
      : themeConfig;

  // Load Google Font if specified in theme
  useEffect(() => {
    if (t?.fontFamily) {
      ensureGoogleFontLoaded(t.fontFamily);
    }
  }, [t?.fontFamily]);

  const hasCustomStyle = Boolean(
    t &&
      (t.fontFamily ||
        t.pageBgColor ||
        t.containerBorderColor ||
        t.containerBgColor ||
        t.headingsSolidColor ||
        t.headingsColorMode ||
        t.iconColor ||
        t.btnActiveBgColor ||
        t.containerBorderRadius !== undefined)
  );

  // 1. Container Styles (Standard theme = transparent Liquid Glass with blur; custom theme = company editor settings)
  const containerOpacity = t?.containerBgOpacity !== undefined ? Number(t.containerBgOpacity) : 0;
  const containerBg = hasCustomStyle
    ? containerOpacity <= 0
      ? "transparent"
      : hexToRgbaLocal(t.containerBgColor || t.pageBgColor || "#0f2438", containerOpacity)
    : "transparent";

  const containerRadius =
    hasCustomStyle && t.containerBorderRadius !== undefined
      ? t.containerBorderRadius === 999
        ? "9999px"
        : `${t.containerBorderRadius}px`
      : "24px";

  const containerBorder = hasCustomStyle
    ? hexToRgbaLocal(t.containerBorderColor || "#FFFFFF", t.containerBorderOpacity ?? 25)
    : "rgba(231, 199, 104, 0.4)";

  const containerBorderWidth =
    hasCustomStyle && t.containerBorderWidth !== undefined
      ? `${t.containerBorderWidth}px`
      : "1px";

  const cardStyle: React.CSSProperties = {
    backgroundColor: containerBg,
    borderRadius: containerRadius,
    borderColor: containerBorder,
    borderWidth: containerBorderWidth,
    borderStyle: "solid",
    fontFamily: hasCustomStyle && t.fontFamily ? t.fontFamily : undefined,
  };

  const cleanText = (val?: string | null) =>
    String(val || "")
      .replace(/Р\uFFFD+нтРОП/gi, "РентРОП")
      .replace(/\uFFFD+тдела/gi, "отдела")
      .replace(/\uFFFD+/g, "")
      .trim();
  const displayRoleName = cleanText(v.roleName) || "Без названия";
  const displayCompanyName = cleanText(v.companyName);
  const displayIndustry = cleanText(v.industry);

  // 2. Animated Neural Sphere Color
  const sphereColor = hasCustomStyle
    ? t.iconColor || t.headingsSolidColor || t.btnActiveBgColor || "#E7C768"
    : "#E7C768";

  // 3. Headings Style (Role Name) - strict match to company theme settings
  let headingStyle: React.CSSProperties = {};
  if (t?.headingsColorMode === "gradient-silver") {
    headingStyle = {
      backgroundImage: "linear-gradient(135deg, #FFFFFF, #E2E8F0, #94A3B8)",
      WebkitBackgroundClip: "text",
      backgroundClip: "text",
      WebkitTextFillColor: "transparent",
      color: "transparent",
      fontFamily: t?.fontFamily || undefined,
    };
  } else if (t?.headingsColorMode === "gradient-gold") {
    headingStyle = {
      backgroundImage: "linear-gradient(135deg, #F4EE8E, #E7C768, #D99E41)",
      WebkitBackgroundClip: "text",
      backgroundClip: "text",
      WebkitTextFillColor: "transparent",
      color: "transparent",
      fontFamily: t?.fontFamily || undefined,
    };
  } else if (t?.headingsColorMode === "gradient") {
    headingStyle = {
      backgroundImage: `linear-gradient(135deg, ${t.headingsGradientFrom || "#F4EE8E"}, ${t.headingsGradientTo || "#D99E41"})`,
      WebkitBackgroundClip: "text",
      backgroundClip: "text",
      WebkitTextFillColor: "transparent",
      color: "transparent",
      fontFamily: t?.fontFamily || undefined,
    };
  } else if (t?.headingsColorMode === "solid" || t?.headingsSolidColor) {
    const col = t?.headingsSolidColor || "#FFFFFF";
    headingStyle = {
      background: "none",
      backgroundImage: "none",
      WebkitBackgroundClip: "border-box",
      backgroundClip: "border-box",
      color: col,
      WebkitTextFillColor: col,
      fontFamily: t?.fontFamily || undefined,
    };
  } else {
    // Default gold gradient
    headingStyle = {
      backgroundImage: "linear-gradient(135deg, #F4EE8E, #E7C768, #D99E41)",
      WebkitBackgroundClip: "text",
      backgroundClip: "text",
      WebkitTextFillColor: "transparent",
      color: "transparent",
    };
  }

  const headingClasses = "text-base md:text-lg font-bold leading-snug break-words transition";

  // 4. Text & Icon Colors
  const textColor = hasCustomStyle ? t.bodyTextColor || "#FFFFFF" : "#FFFFFF";
  const iconColor = hasCustomStyle ? t.iconColor || "#E7C768" : "#E7C768";

  // 5. Logo Style
  const logoRadius =
    hasCustomStyle && t.containerBorderRadius !== undefined
      ? t.containerBorderRadius === 999
        ? "9999px"
        : `${Math.min(t.containerBorderRadius, 16)}px`
      : "14px";

  const logoFilter =
    hasCustomStyle && (t.allMediaMonochrome || t.logoMonochrome)
      ? "grayscale(100%)"
      : "none";

  const logoBg =
    hasCustomStyle && t.logoBgColor
      ? hexToRgbaLocal(t.logoBgColor, t.logoBgOpacity ?? 0)
      : "transparent";

  // 6. Active Badges / Buttons (Salary, Schedule)
  const activeBadgeStyle: React.CSSProperties = hasCustomStyle
    ? {
        backgroundColor: hexToRgbaLocal(t.btnActiveBgColor || "#E7C768", t.btnActiveOpacity ?? 100),
        color: t.btnActiveTextColor || "#17344F",
        WebkitTextFillColor: t.btnActiveTextColor || "#17344F",
        borderColor: hexToRgbaLocal(t.btnBorderColor || "#FFFFFF", t.btnBorderOpacity ?? 20),
        borderRadius: t.btnBorderRadius === 999 ? "9999px" : `${t.btnBorderRadius ?? 10}px`,
        borderWidth: `${t.btnBorderWidth ?? 1}px`,
        borderStyle: "solid",
      }
    : {
        backgroundColor: "rgba(255, 255, 255, 0.06)",
        color: "#FFFFFF",
        WebkitTextFillColor: "#FFFFFF",
        borderColor: "rgba(231, 199, 104, 0.4)",
        borderRadius: "12px",
        borderWidth: "1px",
        borderStyle: "solid",
      };

  const activeBadgeIconColor = hasCustomStyle ? t.btnActiveTextColor || "#17344F" : "#E7C768";

  // 7. Description Box Style (Transparent container in company style)
  const descBoxStyle: React.CSSProperties = hasCustomStyle
    ? {
        backgroundColor: "transparent",
        color: textColor,
        borderColor: hexToRgbaLocal(t.containerBorderColor || "#FFFFFF", t.containerBorderOpacity ?? 25),
        borderRadius:
          t.containerBorderRadius === 999
            ? "24px"
            : `${Math.min(t.containerBorderRadius ?? 16, 20)}px`,
        borderWidth: containerBorderWidth,
        borderStyle: "solid",
        fontFamily: t.fontFamily || undefined,
      }
    : {
        backgroundColor: "transparent",
        color: "#FFFFFF",
        borderColor: "rgba(231, 199, 104, 0.35)",
        borderRadius: "16px",
        borderWidth: "1px",
        borderStyle: "solid",
      };

  if (layout === "horizontal") {
    return (
      <article
        data-href={href}
        onClick={(e) => {
          if (!e.metaKey && !e.ctrlKey && !e.shiftKey) {
            e.preventDefault();
            onOpen(v);
          }
        }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpen(v);
          }
        }}
        style={cardStyle}
        className={[
          "vacancy-card group cursor-pointer w-full p-4 md:p-5 transition-all shadow-lg box-border relative overflow-hidden backdrop-blur-2xl",
          "flex flex-col md:flex-row md:items-stretch gap-4 md:gap-5",
          "min-h-[150px] md:min-h-[160px] h-auto hover:brightness-105",
          active ? "ring-2 ring-[#E7C768]/60" : "",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#E8B84E]/60",
          className,
        ].join(" ")}
      >
        {/* Background Animated Neural Sphere */}
        <div className="absolute -right-6 -bottom-6 pointer-events-none opacity-30 group-hover:opacity-50 transition-opacity z-0 overflow-hidden">
          <NeuronSphereCanvas size={150} speed={0.015} color={sphereColor} />
        </div>

        {/* Logo */}
        <div className="flex-shrink-0 self-start md:self-center relative z-10">
          {v.companyLogo ? (
            <RRImage
              src={v.companyLogo}
              w={80}
              alt={displayCompanyName || ""}
              style={{
                borderRadius: logoRadius,
                filter: logoFilter,
                backgroundColor: logoBg,
              }}
              className="company-logo-img vacancy-card-logo w-16 h-16 md:w-20 md:h-20 object-contain p-0.5 border border-white/10"
              fallback={
                <div
                  style={{ borderRadius: logoRadius }}
                  className="company-logo-fallback w-16 h-16 md:w-20 md:h-20 bg-transparent backdrop-blur-md border border-white/20 flex items-center justify-center"
                >
                  <Building2 className="w-8 h-8" style={{ color: iconColor }} />
                </div>
              }
            />
          ) : (
            <div
              style={{ borderRadius: logoRadius }}
              className="company-logo-fallback w-16 h-16 md:w-20 md:h-20 bg-transparent backdrop-blur-md border border-white/20 flex items-center justify-center"
            >
              <Building2 className="w-8 h-8" style={{ color: iconColor }} />
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 flex flex-col justify-between self-stretch gap-2.5 relative z-10">
          <div className="flex flex-col gap-1.5">
            <h3 style={headingStyle} className={headingClasses}>
              {displayRoleName}
            </h3>
            {showCompany && displayCompanyName && (
              <div
                style={{ color: textColor }}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm opacity-90"
              >
                <span className="inline-flex items-center gap-1.5 font-medium">
                  <Building2 className="w-3.5 h-3.5" style={{ color: iconColor }} /> {displayCompanyName}
                </span>
                {displayIndustry && <span className="opacity-70">• {displayIndustry}</span>}
              </div>
            )}
          </div>
          {descItems.length > 0 && (
            <div
              style={descBoxStyle}
              className="vacancy-desc-badge bg-transparent text-sm p-3.5 break-words flex-1 flex flex-col justify-center min-h-0"
            >
              <ul className="space-y-1.5 list-none m-0 p-0">
                {descItems.map((item, idx) => (
                  <li
                    key={idx}
                    className="flex items-start gap-2.5 text-sm leading-snug"
                    style={{
                      color: textColor,
                      fontFamily: hasCustomStyle && t.fontFamily ? t.fontFamily : undefined,
                    }}
                  >
                    <CheckCircle2
                      className="w-4 h-4 mt-0.5 shrink-0"
                      style={{ color: iconColor }}
                    />
                    <span className="min-w-0 break-words">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Actions / Badges */}
        <div className="flex md:flex-col items-center md:items-end justify-center md:self-stretch gap-2 md:gap-2.5 md:min-w-[180px] md:max-w-[260px] flex-wrap relative z-10">
          {salary && (
            <span
              style={activeBadgeStyle}
              className="vacancy-card-badge inline-flex items-center gap-1.5 text-sm px-3 py-1.5 break-words max-w-full shadow-sm font-medium"
            >
              <Wallet className="w-3.5 h-3.5 shrink-0" style={{ color: activeBadgeIconColor }} />
              <span>{salary}</span>
            </span>
          )}
          {schedule && (
            <span
              style={activeBadgeStyle}
              className="vacancy-card-badge inline-flex items-center gap-1.5 text-sm px-3 py-1.5 break-words max-w-full shadow-sm font-medium"
            >
              <Clock className="w-3.5 h-3.5 shrink-0" style={{ color: activeBadgeIconColor }} />
              <span>{schedule}</span>
            </span>
          )}
          <ArrowRight
            className="hidden md:block w-5 h-5 group-hover:translate-x-1.5 transition-transform shrink-0 mt-1"
            style={{ color: iconColor }}
          />
        </div>
      </article>
    );
  }

  // Vertical layout (default)
  return (
    <article
      data-href={href}
      onClick={(e) => {
        if (!e.metaKey && !e.ctrlKey && !e.shiftKey) {
          e.preventDefault();
          onOpen(v);
        }
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(v);
        }
      }}
      style={cardStyle}
      className={[
        "vacancy-card group cursor-pointer p-4 md:p-5 transition-all shadow-lg box-border flex flex-col h-full relative overflow-hidden backdrop-blur-2xl hover:brightness-105",
        active ? "ring-2 ring-[#E7C768]/60" : "",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#E8B84E]/60",
        className,
      ].join(" ")}
    >
      {/* Background Animated Neural Sphere */}
      <div className="absolute -right-6 -bottom-6 pointer-events-none opacity-30 group-hover:opacity-50 transition-opacity z-0 overflow-hidden">
        <NeuronSphereCanvas size={150} speed={0.015} color={sphereColor} />
      </div>

      <div className="flex items-start gap-3 min-w-0 flex-1 relative z-10">
        {/* Logo */}
        <div className="flex-shrink-0">
          {v.companyLogo ? (
            <RRImage
              src={v.companyLogo}
              w={56}
              alt={displayCompanyName || ""}
              style={{
                borderRadius: logoRadius,
                filter: logoFilter,
                backgroundColor: logoBg,
              }}
              className="company-logo-img vacancy-card-logo w-12 h-12 md:w-14 md:h-14 object-contain p-0.5 border border-white/10"
              fallback={
                <div
                  style={{ borderRadius: logoRadius }}
                  className="company-logo-fallback w-12 h-12 md:w-14 md:h-14 bg-transparent backdrop-blur-md border border-white/20 flex items-center justify-center"
                >
                  <Building2 className="w-6 h-6" style={{ color: iconColor }} />
                </div>
              }
            />
          ) : (
            <div
              style={{ borderRadius: logoRadius }}
              className="company-logo-fallback w-12 h-12 md:w-14 md:h-14 bg-transparent backdrop-blur-md border border-white/20 flex items-center justify-center"
            >
              <Building2 className="w-6 h-6" style={{ color: iconColor }} />
            </div>
          )}
        </div>

        {/* Title, Company & Industry */}
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="flex items-start justify-between gap-2">
            <h3 style={headingStyle} className={headingClasses}>
              {displayRoleName}
            </h3>
            <ArrowRight
              className="w-5 h-5 group-hover:translate-x-1.5 transition-transform shrink-0 mt-0.5"
              style={{ color: iconColor }}
            />
          </div>
          {showCompany && displayCompanyName && (
            <div
              style={{ color: textColor }}
              className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1 text-sm opacity-90"
            >
              <span className="inline-flex items-center gap-1 font-medium">
                <Building2 className="w-3.5 h-3.5" style={{ color: iconColor }} /> {displayCompanyName}
              </span>
              {displayIndustry && <span className="opacity-70">• {displayIndustry}</span>}
            </div>
          )}
          {descItems.length > 0 && (
            <div
              style={descBoxStyle}
              className="vacancy-desc-badge bg-transparent mt-3 text-sm p-3.5 break-words flex-1 leading-relaxed"
            >
              <ul className="space-y-1.5 list-none m-0 p-0">
                {descItems.map((item, idx) => (
                  <li
                    key={idx}
                    className="flex items-start gap-2.5 text-sm leading-snug"
                    style={{
                      color: textColor,
                      fontFamily: hasCustomStyle && t.fontFamily ? t.fontFamily : undefined,
                    }}
                  >
                    <CheckCircle2
                      className="w-4 h-4 mt-0.5 shrink-0"
                      style={{ color: iconColor }}
                    />
                    <span className="min-w-0 break-words">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Badges for salary and schedule */}
          <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-white/10">
            {salary && (
              <span
                style={activeBadgeStyle}
                className="vacancy-card-badge inline-flex items-center gap-1.5 text-sm px-3 py-1.5 break-words max-w-full shadow-sm font-medium"
              >
                <Wallet className="w-3.5 h-3.5 shrink-0" style={{ color: activeBadgeIconColor }} />
                <span>{salary}</span>
              </span>
            )}
            {schedule && (
              <span
                style={activeBadgeStyle}
                className="vacancy-card-badge inline-flex items-center gap-1.5 text-sm px-3 py-1.5 break-words max-w-full shadow-sm font-medium"
              >
                <Clock className="w-3.5 h-3.5 shrink-0" style={{ color: activeBadgeIconColor }} />
                <span>{schedule}</span>
              </span>
            )}
          </div>
        </div>
      </div>
    </article>
  );
};

export default VacancyCard;
