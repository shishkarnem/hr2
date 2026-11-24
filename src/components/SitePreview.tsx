import React from "react";
import { ExternalLink, Globe } from "lucide-react";

/** Normalises a user-entered site value into a full https URL. */
export function normalizeSiteUrl(raw?: string | null): string | null {
  if (!raw) return null;
  const v = String(raw).trim();
  if (!v) return null;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(v) && !/^https?:\/\//i.test(v)) return null;
  if (/^https?:\/\//i.test(v)) return v;
  return `https://${v.replace(/^\/+/, "")}`;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

type Props = {
  url?: string | null;
  /** "card" — 16:9 preview tile. "banner" — wide preview. "compact" / "button" — small inline chip. */
  variant?: "card" | "banner" | "compact" | "button";
  displayMode?: "preview" | "buttons";
  className?: string;
  customScreenshot?: string | null;
  title?: string;
  heightPx?: number | null;
  filterColor?: string | null;
  filterOpacity?: number | null;
  screenshotFilterColor?: string | null;
  screenshotFilterOpacity?: number | null;
  themeConfig?: any;
  refreshNonce?: number;
};

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
 * Visual preview of an external company site or social network:
 * - custom uploaded screenshot or proxied server screenshot (/api/site-preview)
 * - cached server favicon (/api/site-favicon) with crisp vector icon fallback
 * - Apple Liquid Glass styling, fully synced with LandingStyleEditor themeConfig
 */
export default function SitePreview({
  url,
  variant = "card",
  displayMode,
  className = "",
  customScreenshot,
  title,
  heightPx,
  filterColor,
  filterOpacity,
  screenshotFilterColor,
  screenshotFilterOpacity,
  themeConfig,
  refreshNonce = 0,
}: Props) {
  const href = normalizeSiteUrl(url);
  const cleanCustomShot = customScreenshot ? String(customScreenshot).trim() : "";

  const [shotStage, setShotStage] = React.useState<"custom" | "proxy" | "fallback">(
    cleanCustomShot ? "custom" : "proxy"
  );
  const [faviconOk, setFaviconOk] = React.useState(true);

  React.useEffect(() => {
    setShotStage(cleanCustomShot ? "custom" : "proxy");
  }, [href, cleanCustomShot, refreshNonce]);

  React.useEffect(() => {
    setFaviconOk(true);
  }, [href]);

  const resolvedTheme: any = React.useMemo(() => {
    if (!themeConfig) return null;
    if (typeof themeConfig === "string") {
      try {
        return JSON.parse(themeConfig);
      } catch {
        return null;
      }
    }
    return themeConfig;
  }, [themeConfig]);

  if (!href) return null;

  const host = hostOf(href);
  const faviconUrl = `/api/site-favicon?url=${encodeURIComponent(href)}`;
  const proxyShotUrl = `/api/site-preview?url=${encodeURIComponent(href)}${
    refreshNonce ? `&refresh=1&v=${refreshNonce}` : ""
  }`;

  const usingCustomImg = Boolean(cleanCustomShot) && shotStage === "custom";
  const finalImage = usingCustomImg ? cleanCustomShot : proxyShotUrl;

  const effFilterColor = usingCustomImg
    ? (screenshotFilterColor || resolvedTheme?.siteScreenshotFilterColor || filterColor || resolvedTheme?.sitePreviewFilterColor)
    : (filterColor || resolvedTheme?.sitePreviewFilterColor);
  const effFilterOpacity = usingCustomImg
    ? (screenshotFilterOpacity ?? resolvedTheme?.siteScreenshotFilterOpacity ?? filterOpacity ?? resolvedTheme?.sitePreviewFilterOpacity ?? 0)
    : (filterOpacity ?? resolvedTheme?.sitePreviewFilterOpacity ?? 0);

  const overlayRgba = effFilterColor && Number(effFilterOpacity) > 0
    ? hexToRgbaLocal(effFilterColor, Number(effFilterOpacity))
    : "transparent";

  const isMasterMono = Boolean(resolvedTheme?.allMediaMonochrome);
  const isImgMono = isMasterMono || (usingCustomImg
    ? Boolean(resolvedTheme?.siteScreenshotMonochrome)
    : Boolean(resolvedTheme?.sitePreviewMonochrome || resolvedTheme?.siteScreenshotMonochrome));

  // Container & typography tokens synchronized with Style Editor
  const containerBg = resolvedTheme?.containerBgColor
    ? hexToRgbaLocal(resolvedTheme.containerBgColor, resolvedTheme.containerBgOpacity ?? 0)
    : "var(--landing-container-bg, transparent)";
  const containerBorder = resolvedTheme?.containerBorderColor
    ? hexToRgbaLocal(resolvedTheme.containerBorderColor, resolvedTheme.containerBorderOpacity ?? 20)
    : "var(--landing-container-border, rgba(255, 255, 255, 0.2))";
  const containerBorderWidth =
    resolvedTheme?.containerBorderWidth !== undefined ? `${resolvedTheme.containerBorderWidth}px` : "1px";
  const containerRadius =
    resolvedTheme?.containerBorderRadius !== undefined
      ? resolvedTheme.containerBorderRadius === 999
        ? "9999px"
        : `${resolvedTheme.containerBorderRadius}px`
      : "var(--landing-radius-container, 16px)";
  const glassBlurPx = resolvedTheme?.glassBlurPx ?? 24;

  const bodyTextColor = resolvedTheme?.bodyTextColor || "var(--landing-text-color, #FFFFFF)";
  const iconColor = resolvedTheme?.iconColor || "var(--landing-icon-color, #E7C768)";

  let titleStyle: React.CSSProperties = {};
  if (resolvedTheme?.headingsColorMode === "gradient-silver") {
    titleStyle = {
      backgroundImage: "linear-gradient(to right, #FFFFFF, #E2E8F0, #94A3B8)",
      WebkitBackgroundClip: "text",
      backgroundClip: "text",
      WebkitTextFillColor: "transparent",
      color: "transparent",
    };
  } else if (resolvedTheme?.headingsColorMode === "solid" && resolvedTheme?.headingsSolidColor) {
    titleStyle = {
      backgroundImage: "none",
      WebkitTextFillColor: resolvedTheme.headingsSolidColor,
      color: resolvedTheme.headingsSolidColor,
    };
  } else {
    titleStyle = {
      backgroundImage: "linear-gradient(to right, #F4EE8E, #E7C768, #D99E41)",
      WebkitBackgroundClip: "text",
      backgroundClip: "text",
      WebkitTextFillColor: "transparent",
      color: "transparent",
    };
  }

  const activeBtnColor = resolvedTheme?.btnActiveTextColor || "var(--landing-btn-active-text, #17344F)";
  const activeBtnBg = resolvedTheme?.btnActiveBgColor
    ? hexToRgbaLocal(resolvedTheme.btnActiveBgColor, resolvedTheme.btnActiveOpacity ?? 100)
    : "var(--landing-btn-active-bg, #E7C768)";
  const activeBtnBorder = resolvedTheme?.btnBorderColor
    ? hexToRgbaLocal(resolvedTheme.btnBorderColor, resolvedTheme.btnBorderOpacity ?? 25)
    : "var(--landing-btn-border, rgba(255, 255, 255, 0.25))";
  const activeBtnRadius =
    resolvedTheme?.btnBorderRadius === 999
      ? "9999px"
      : resolvedTheme?.btnBorderRadius !== undefined
      ? `${resolvedTheme.btnBorderRadius}px`
      : "var(--landing-radius-btn, 14px)";
  const activeBtnWidth =
    resolvedTheme?.btnBorderWidth !== undefined ? `${resolvedTheme.btnBorderWidth}px` : "1px";

  const handleImageError = () => {
    if (shotStage === "custom") {
      setShotStage("proxy");
    } else {
      setShotStage("fallback");
    }
  };

  if (variant === "compact" || variant === "button" || displayMode === "buttons" || heightPx === 0) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: activeBtnBg,
          color: activeBtnColor,
          WebkitTextFillColor: activeBtnColor,
          borderColor: activeBtnBorder,
          borderRadius: activeBtnRadius,
          borderWidth: activeBtnWidth,
          borderStyle: "solid",
        }}
        className={`site-preview-btn landing-btn-active inline-flex items-center gap-2 px-3.5 py-2 transition group shadow-md max-w-full ${className}`}
      >
        {faviconOk ? (
          <img
            src={faviconUrl}
            alt=""
            className="w-4 h-4 rounded-sm shrink-0"
            onError={() => setFaviconOk(false)}
          />
        ) : (
          <Globe className="w-4 h-4 shrink-0" style={{ color: activeBtnColor, stroke: activeBtnColor }} />
        )}
        <span
          className="text-sm font-semibold truncate max-w-[220px]"
          style={{ color: activeBtnColor, WebkitTextFillColor: activeBtnColor }}
        >
          {title || host}
        </span>
        <ExternalLink className="w-3.5 h-3.5 shrink-0" style={{ color: activeBtnColor, stroke: activeBtnColor }} />
      </a>
    );
  }

  const numericHeight = typeof heightPx === "number" && heightPx > 0 ? heightPx : undefined;
  const isBanner = variant === "banner";
  const previewContainerClass = isBanner
    ? `site-preview-banner group relative block w-full bg-transparent hover:border-[#E7C768]/60 transition overflow-hidden shadow-xl ${className}`
    : `site-preview-card group block w-full bg-transparent hover:border-[#E7C768]/60 transition overflow-hidden shadow-xl ${className}`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => e.stopPropagation()}
      style={{
        backgroundColor: containerBg,
        borderColor: containerBorder,
        borderWidth: containerBorderWidth,
        borderStyle: "solid",
        borderRadius: containerRadius,
        backdropFilter: `blur(${glassBlurPx}px)`,
        WebkitBackdropFilter: `blur(${glassBlurPx}px)`,
      }}
      className={previewContainerClass}
    >
      <div
        className="relative w-full overflow-hidden bg-transparent"
        style={{
          height: numericHeight ? `${numericHeight}px` : undefined,
          aspectRatio: numericHeight ? undefined : isBanner ? "16/6" : "16/9",
        }}
      >
        {shotStage !== "fallback" ? (
          <img
            src={finalImage}
            alt={`Превью ${title || host}`}
            loading="lazy"
            onError={handleImageError}
            style={isImgMono ? { filter: "grayscale(100%) contrast(1.08)" } : undefined}
            className={`site-preview-img ${usingCustomImg ? "site-screenshot-img" : ""} w-full h-full object-cover object-top block`}
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2 px-4 py-6 text-center bg-transparent">
            <div
              className="w-12 h-12 rounded-2xl border flex items-center justify-center backdrop-blur-md"
              style={{ borderColor: containerBorder, color: iconColor }}
            >
              <Globe className="w-6 h-6" style={{ color: iconColor, stroke: iconColor }} />
            </div>
            <div className="text-sm font-bold truncate max-w-full" style={titleStyle}>
              {title || "Официальный сайт"}
            </div>
            <div className="text-sm font-medium truncate max-w-full" style={{ color: bodyTextColor }}>
              {host}
            </div>
          </div>
        )}
        <div
          className={`absolute inset-0 pointer-events-none z-10 transition-colors duration-300 ${
            usingCustomImg ? "site-screenshot-overlay" : "site-preview-overlay"
          }`}
          style={{ backgroundColor: overlayRgba }}
        />
      </div>

      <div
        className="site-preview-footer p-3 bg-transparent backdrop-blur-xl border-t flex items-center justify-between gap-3"
        style={{ borderTopColor: containerBorder }}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          {faviconOk ? (
            <img
              src={faviconUrl}
              alt=""
              className="w-5 h-5 rounded-md shrink-0 border border-white/15 p-0.5"
              onError={() => setFaviconOk(false)}
            />
          ) : (
            <Globe className="w-5 h-5 shrink-0" style={{ color: iconColor, stroke: iconColor }} />
          )}
          <div className="min-w-0">
            <div
              className="site-preview-title text-sm font-bold truncate"
              style={titleStyle}
            >
              {title || "Официальный сайт"}
            </div>
            <div
              className="site-preview-host text-sm font-semibold truncate"
              style={{ color: bodyTextColor }}
            >
              {host}
            </div>
          </div>
        </div>
        <div
          className="site-preview-action-btn landing-btn-active flex items-center gap-1.5 text-sm font-bold shrink-0 px-3 py-1.5 border shadow-sm transition"
          style={{
            backgroundColor: activeBtnBg,
            color: activeBtnColor,
            WebkitTextFillColor: activeBtnColor,
            borderColor: activeBtnBorder,
            borderRadius: activeBtnRadius,
            borderWidth: activeBtnWidth,
            borderStyle: "solid",
          }}
        >
          <span style={{ color: activeBtnColor, WebkitTextFillColor: activeBtnColor }}>Открыть</span>
          <ExternalLink className="w-4 h-4 shrink-0" style={{ color: activeBtnColor, stroke: activeBtnColor }} />
        </div>
      </div>
    </a>
  );
}