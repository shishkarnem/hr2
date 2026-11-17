import React from "react";
import { LandingThemeConfig, hexToRgba } from "./LandingStyleEditor";
import { rrImg, DEFAULT_RR_LOGO_URL } from "@/lib/img";

export interface CompanyLandingLogoProps {
  src?: string | null;
  alt?: string;
  sizeClassName?: string;
  className?: string;
  themeConfig?: LandingThemeConfig | null;
  themeObj?: any;
  fallbackSrc?: string;
}

/**
 * Единый эталонный компонент для логотипа лендинга компании и вакансии.
 * Поддерживает чистую альфа-прозрачность (без фонового осветления),
 * настраиваемую подложку (logoBgColor/logoBgOpacity) и маску цветного фильтра (logoFilterColor/logoFilterOpacity).
 */
export const CompanyLandingLogo: React.FC<CompanyLandingLogoProps> = ({
  src,
  alt = "logo",
  sizeClassName = "w-28 h-28 sm:w-36 sm:h-36 md:w-44 md:h-44",
  className = "",
  themeConfig,
  themeObj,
  fallbackSrc = DEFAULT_RR_LOGO_URL,
}) => {
  const [imgSrc, setImgSrc] = React.useState<string>(rrImg(src || fallbackSrc));

  React.useEffect(() => {
    setImgSrc(rrImg(src || fallbackSrc));
  }, [src, fallbackSrc]);

  const effectiveBgColor = themeConfig?.logoBgColor || themeObj?.logoBgColor || "#FFFFFF";
  const effectiveBgOpacity = (themeConfig?.logoBgOpacity ?? themeObj?.logoBgOpacity) ?? 0;
  const hasBg = effectiveBgOpacity > 0 && Boolean(effectiveBgColor);

  const effectiveFilterColor = themeConfig?.logoFilterColor || themeObj?.logoFilterColor || "#E7C768";
  const effectiveFilterOpacity = (themeConfig?.logoFilterOpacity ?? themeObj?.logoFilterOpacity) ?? 0;
  const hasFilter = effectiveFilterOpacity > 0 && Boolean(effectiveFilterColor);

  const [retryCount, setRetryCount] = React.useState(0);

  return (
    <div
      className={`landing-hero-logo-container relative rounded-2xl overflow-hidden shrink-0 flex items-center justify-center p-1 bg-transparent ${className}`}
      style={{
        backgroundColor: hasBg ? hexToRgba(effectiveBgColor, effectiveBgOpacity) : undefined,
        transform: "translateZ(0)",
      }}
    >
      <img
        src={imgSrc}
        alt={alt}
        referrerPolicy="no-referrer"
        loading="eager"
        decoding="async"
        onError={(e) => {
          if (retryCount < 2) {
            setRetryCount((prev) => prev + 1);
            setTimeout(() => {
              const delim = imgSrc.includes("?") ? "&" : "?";
              setImgSrc(`${imgSrc}${delim}retry=${retryCount + 1}`);
            }, 800);
            return;
          }
          if (imgSrc !== fallbackSrc) {
            setImgSrc(fallbackSrc);
          }
          (e.currentTarget as HTMLImageElement).src = fallbackSrc;
        }}
        className={`landing-hero-logo ${sizeClassName} object-contain bg-transparent border-0 p-0 shadow-none relative z-[1]`}
        style={{ transform: "translateZ(0)" }}
      />
      {hasFilter && (
        <div
          className="landing-hero-logo-filter-overlay absolute inset-0 pointer-events-none z-[2]"
          style={{
            backgroundColor: hexToRgba(effectiveFilterColor, effectiveFilterOpacity),
            WebkitMaskImage: `url("${imgSrc}")`,
            maskImage: `url("${imgSrc}")`,
            WebkitMaskSize: "contain",
            maskSize: "contain",
            WebkitMaskRepeat: "no-repeat",
            maskRepeat: "no-repeat",
            WebkitMaskPosition: "center",
            maskPosition: "center",
            transform: "translateZ(0)",
          }}
        />
      )}
    </div>
  );
};

export default CompanyLandingLogo;
