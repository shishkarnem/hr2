import React from "react";
import { ExternalLink } from "lucide-react";

/** Normalises a user-entered site value into a full https URL. */
export function normalizeSiteUrl(raw?: string | null): string | null {
  if (!raw) return null;
  const v = String(raw).trim();
  if (!v) return null;
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
  heightPx?: number;
  filterColor?: string | null;
  filterOpacity?: number | null;
  screenshotFilterColor?: string | null;
  screenshotFilterOpacity?: number | null;
  themeConfig?: any;
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
 * - custom uploaded screenshot or automatic preview via image.thum.io
 * - favicon via Google s2
 * - Apple Liquid Glass styling, proportional full filling
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
}: Props) {
  const href = normalizeSiteUrl(url);
  const [imgOk, setImgOk] = React.useState(true);
  if (!href) return null;
  const host = hostOf(href);
  const favicon = `https://www.google.com/s2/favicons?domain=${host}&sz=64`;
  const autoShotWide = `https://image.thum.io/get/width/1280/crop/360/noanimate/${href}`;
  const autoShot = `https://image.thum.io/get/width/720/crop/420/noanimate/${href}`;
  const finalImage = customScreenshot || (variant === "banner" ? autoShotWide : autoShot);

  const isCustom = Boolean(customScreenshot);
  const activeFilterColor = isCustom
    ? (screenshotFilterColor || filterColor)
    : filterColor;
  const activeFilterOpacity = isCustom
    ? (screenshotFilterOpacity !== undefined && screenshotFilterOpacity !== null ? screenshotFilterOpacity : (filterOpacity ?? 0))
    : (filterOpacity ?? 0);

  const overlayRgba = (activeFilterColor && activeFilterOpacity > 0)
    ? hexToRgbaLocal(activeFilterColor, activeFilterOpacity)
    : null;

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

  const activeBtnColor = resolvedTheme?.btnActiveTextColor || "var(--landing-btn-active-text, #17344F)";
  const activeBtnBg = resolvedTheme?.btnActiveBgColor
    ? hexToRgbaLocal(resolvedTheme.btnActiveBgColor, resolvedTheme.btnActiveOpacity ?? 100)
    : "var(--landing-btn-active-bg, #FFFFFF)";
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
    resolvedTheme?.btnBorderWidth !== undefined
      ? `${resolvedTheme.btnBorderWidth}px`
      : "1px";

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
        className={`site-preview-btn landing-btn-active inline-flex items-center gap-2 px-3.5 py-2 transition group shadow-md ${className}`}
      >
        <img src={favicon} alt="" className="w-4 h-4 rounded-sm shrink-0" referrerPolicy="no-referrer" />
        <span className="text-sm font-semibold truncate max-w-[200px]" style={{ color: activeBtnColor, WebkitTextFillColor: activeBtnColor }}>
          {title || host}
        </span>
        <ExternalLink className="w-3.5 h-3.5 shrink-0" style={{ color: activeBtnColor, stroke: activeBtnColor }} />
      </a>
    );
  }

  if (variant === "banner") {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        onClick={(e) => e.stopPropagation()}
        className={`site-preview-banner group relative block w-full rounded-2xl border border-white/20 bg-transparent backdrop-blur-2xl hover:border-[#E7C768]/60 transition overflow-hidden shadow-xl ${className}`}
      >
        {imgOk ? (
          <div
            className="relative w-full overflow-hidden bg-transparent"
            style={{
              height: heightPx ? `${heightPx}px` : undefined,
              aspectRatio: heightPx ? undefined : "16/6",
            }}
          >
            <img
              src={finalImage}
              alt={`Превью ${title || host}`}
              loading="lazy"
              referrerPolicy="no-referrer"
              onError={() => setImgOk(false)}
              className="site-preview-img w-full h-full object-cover object-center block"
            />
            {overlayRgba && (
              <div
                className={`absolute inset-0 pointer-events-none z-10 transition-colors duration-300 ${isCustom ? "site-screenshot-overlay" : "site-preview-overlay"}`}
                style={{ backgroundColor: overlayRgba }}
              />
            )}
          </div>
        ) : (
          <div className="aspect-[16/6] w-full bg-transparent" />
        )}
        <div className="p-3 bg-transparent backdrop-blur-xl border-t border-white/15 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <img src={favicon} alt="" className="w-5 h-5 rounded-md shrink-0 border border-white/15 p-0.5" referrerPolicy="no-referrer" />
            <div className="min-w-0">
              <div className="text-sm font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">{title || "Официальный сайт"}</div>
              <div className="text-sm text-white font-semibold truncate">{host}</div>
            </div>
          </div>
          <div
            className="landing-btn-active flex items-center gap-1.5 text-xs sm:text-sm font-bold shrink-0 px-3 py-1.5 rounded-xl border shadow-sm transition"
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

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => e.stopPropagation()}
      className={`site-preview-card group block w-full rounded-2xl border border-white/20 bg-transparent backdrop-blur-2xl hover:border-[#E7C768]/60 transition overflow-hidden shadow-xl ${className}`}
    >
      {imgOk ? (
        <div
          className="relative w-full bg-transparent overflow-hidden"
          style={{
            height: heightPx ? `${heightPx}px` : undefined,
            aspectRatio: heightPx ? undefined : "16/9",
          }}
        >
          <img
            src={finalImage}
            alt={`Превью ${title || host}`}
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setImgOk(false)}
            className="site-preview-img w-full h-full object-cover object-center block"
          />
          {overlayRgba && (
            <div
              className={`absolute inset-0 pointer-events-none z-10 transition-colors duration-300 ${isCustom ? "site-screenshot-overlay" : "site-preview-overlay"}`}
              style={{ backgroundColor: overlayRgba }}
            />
          )}
        </div>
      ) : null}
      <div className="flex items-center justify-between gap-3 p-3 bg-transparent backdrop-blur-xl border-t border-white/15">
        <div className="flex items-center gap-2.5 min-w-0">
          <img src={favicon} alt="" className="w-5 h-5 rounded-sm shrink-0 border border-white/15 p-0.5" referrerPolicy="no-referrer" />
          <div className="min-w-0">
            <div className="text-sm font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">
              {title || "Официальный сайт"}
            </div>
            <div className="text-sm text-white font-semibold truncate">{host}</div>
          </div>
        </div>
        <ExternalLink className="w-4 h-4 text-slate-300 group-hover:text-[#E7C768] shrink-0" />
      </div>
    </a>
  );
}