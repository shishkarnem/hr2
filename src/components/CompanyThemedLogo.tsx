import React, { useState } from "react";
import { LandingThemeConfig, hexToRgba } from "./LandingStyleEditor";

export interface CompanyThemedLogoProps {
  logoUrl?: string | null;
  companyName?: string;
  theme?: LandingThemeConfig | null;
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
  alt?: string;
  style?: React.CSSProperties;
}

export const CompanyThemedLogo: React.FC<CompanyThemedLogoProps> = ({
  logoUrl,
  companyName = "Компания",
  theme,
  className = "",
  size = "md",
  alt,
  style,
}) => {
  const [hasError, setHasError] = useState(false);

  // Determine sizing
  const sizeConfig = {
    sm: { box: "h-8 max-w-[120px]", img: "max-h-8", text: "text-sm", pad: "p-1" },
    md: { box: "h-14 max-w-[160px]", img: "max-h-14", text: "text-sm", pad: "p-1.5" },
    lg: { box: "h-20 max-w-[220px]", img: "max-h-20", text: "text-base", pad: "p-2" },
    xl: { box: "h-28 max-w-[320px]", img: "max-h-28", text: "text-lg", pad: "p-3" },
  }[size];

  const resolvedLogo = (!hasError && logoUrl && logoUrl.trim().length > 0)
    ? logoUrl.trim()
    : null;

  // Colors & theme styling from DB
  const isMono = theme?.allMediaMonochrome === true || theme?.logoMonochrome === true;
  const filterOpacity = theme?.logoFilterOpacity ?? 0;
  const filterColor = theme?.logoFilterColor || theme?.iconColor || "#E7C768";
  const bgOpacity = theme?.logoBgOpacity ?? 0;
  const bgColor = theme?.logoBgColor || "#FFFFFF";

  const containerBg = bgOpacity > 0 ? hexToRgba(bgColor, bgOpacity) : "transparent";

  if (!resolvedLogo) {
    // Fallback: styled company initials / title badge conforming to Apple Liquid Glass & theme
    const initials = companyName
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() || "")
      .join("") || "RR";

    return (
      <div
        className={`inline-flex items-center justify-center rounded-xl border border-white/20 backdrop-blur-xl ${sizeConfig.pad} ${className}`}
        style={{
          backgroundColor: containerBg,
          borderColor: theme?.containerBorderColor ? hexToRgba(theme.containerBorderColor, theme.containerBorderOpacity ?? 25) : "rgba(255, 255, 255, 0.25)",
          borderRadius: theme?.containerBorderRadius != null ? `${theme.containerBorderRadius}px` : "12px",
          borderWidth: `${theme?.containerBorderWidth ?? 1}px`,
          color: theme?.headingsSolidColor || "#FFFFFF",
          ...style,
        }}
        title={companyName}
      >
        <span
          className={`font-bold tracking-wider ${sizeConfig.text}`}
          style={{
            fontFamily: theme?.fontFamily || undefined,
            color: theme?.headingsSolidColor || "#FFFFFF",
            filter: isMono ? "grayscale(100%)" : undefined,
          }}
        >
          {initials}
        </span>
      </div>
    );
  }

  return (
    <div
      className={`relative inline-flex items-center justify-center overflow-hidden ${sizeConfig.pad} ${className}`}
      style={{
        backgroundColor: containerBg,
        ...style,
      }}
    >
      <img
        src={resolvedLogo}
        alt={alt || companyName}
        onError={() => setHasError(true)}
        className={`object-contain w-auto company-logo-img landing-hero-logo ${sizeConfig.img}`}
        referrerPolicy="no-referrer"
        style={{
          filter: isMono ? "grayscale(100%)" : undefined,
        }}
      />

      {/* Color tint mask overlay if logoFilterOpacity is configured in DB */}
      {filterOpacity > 0 && !isMono && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundColor: hexToRgba(filterColor, filterOpacity),
            WebkitMaskImage: `url("${resolvedLogo}")`,
            maskImage: `url("${resolvedLogo}")`,
            maskSize: "contain",
            maskRepeat: "no-repeat",
            maskPosition: "center",
            WebkitMaskSize: "contain",
            WebkitMaskRepeat: "no-repeat",
            WebkitMaskPosition: "center",
          }}
        />
      )}
    </div>
  );
};
