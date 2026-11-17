import React, { useEffect, useState } from "react";
import SectionCard from "./SectionCard";
import CompanyLandingLogo from "./CompanyLandingLogo";
import { useInView } from "@/hooks/useInView";
import {
  Info,
  Package,
  Sparkles,
  Building,
  Users,
  Wallet,
  CalendarClock,
  Cpu,
  BarChart3,
  Briefcase,
  ExternalLink,
  ChevronRight,
  UserCheck,
  Scale,
  TrendingUp,
  HeartHandshake,
  Target,
  Megaphone,
  GraduationCap,
  Award,
  ShieldCheck,
  CheckCircle2,
  Layers,
  Zap,
  Code,
  Rocket,
} from "lucide-react";
import type { JobProject } from "../types";
import SitePreview from "./SitePreview";
import VacancyCard from "./VacancyCard";
import { isVideoUrl, hexToRgba } from "./LandingStyleEditor";
import { isPngImage } from "@/lib/utils";

type Props = {
  company: any;
  vacancies: JobProject[];
  onOpenVacancy: (v: JobProject) => void;
  /** Path slug used to build vacancy links */
  companySlug: string;
  /** When inside /vac.../company, hint banner with switcher back */
  currentVacancy?: JobProject | null;
  onBackToVacancy?: () => void;
  /** Custom resolver for vacancy URLs (editor vs public) */
  getVacancyUrl?: (v: JobProject) => string;
  /** Hide the in-page sticky tabs (when the parent renders them in the header). */
  hideStickyNav?: boolean;
  /** Height in px for website preview / screenshot */
  sitePreviewHeight?: number;
  /** Display mode for primary website: 'preview' (banner screenshot) vs 'buttons' (compact button) */
  siteDisplayMode?: "preview" | "buttons";
  /** Full real-time theme config */
  themeConfig?: any;
};

interface TaggedAboutItem {
  tag: string;
  description: string;
}

function normalizeTextLines(raw?: string | null): string[] {
  if (!raw) return [];
  const normalized = String(raw)
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");

  const rawLines = normalized.split("\n");
  const result: string[] = [];

  for (const line of rawLines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    // Check if multiple bullets are concatenated into a single line
    if (trimmed.includes("• ") && trimmed.indexOf("• ") !== trimmed.lastIndexOf("• ")) {
      const parts = trimmed.split(/(?=\s*•\s+)/).map((p) => p.trim()).filter(Boolean);
      result.push(...parts);
    } else {
      result.push(trimmed);
    }
  }

  return result;
}

function parseTaggedAbout(raw?: string | null): TaggedAboutItem[] | null {
  if (!raw) return null;
  const lines = normalizeTextLines(raw);
  if (lines.length === 0) return null;

  const items: TaggedAboutItem[] = [];
  let taggedCount = 0;

  for (const line of lines) {
    const bracketMatch = line.match(/^(?:[•\s\-*]|\d+\.)*\s*\[([^\]]+)\]\s*(.*)$/);
    if (bracketMatch) {
      taggedCount++;
      const tag = bracketMatch[1].trim();
      const description = bracketMatch[2].trim();
      items.push({ tag, description });
      continue;
    }

    const colonMatch = line.match(/^(?:[•\s\-*]|\d+\.)*\s*([A-Za-zА-Яа-я0-9\s]{2,25})[:—–]\s+(.+)$/);
    if (colonMatch && !colonMatch[1].includes(".")) {
      taggedCount++;
      const tag = colonMatch[1].trim();
      const description = colonMatch[2].trim();
      items.push({ tag, description });
      continue;
    }

    const cleaned = line.replace(/^(?:[•\s\-*]|\d+\.)+/, "").trim();
    if (cleaned) {
      items.push({ tag: "", description: cleaned });
    }
  }

  // If at least one item has a tag, or if there are 2 or more distinct bullet items, treat as structured cards
  if (taggedCount >= 1 || items.length >= 2) {
    return items.filter((it) => it.tag || it.description);
  }

  return null;
}

function getTagIcon(tag: string, index: number) {
  const normalized = tag.toUpperCase().trim();
  if (
    normalized.includes("CEO") ||
    normalized.includes("FOUNDER") ||
    normalized.includes("РУКОВОДСТВ") ||
    normalized.includes("ДИРЕКТОР")
  ) {
    return <Building className="w-5 h-5 text-[#E7C768]" />;
  }
  if (
    normalized.includes("HR") ||
    normalized.includes("НАЙМ") ||
    normalized.includes("ОБУЧЕНИ") ||
    normalized.includes("КАДР")
  ) {
    return <UserCheck className="w-5 h-5 text-[#E7C768]" />;
  }
  if (
    normalized.includes("LEGAL") ||
    normalized.includes("ЮРИСТ") ||
    normalized.includes("ПРАВ") ||
    normalized.includes("ЗАКОН")
  ) {
    return <Scale className="w-5 h-5 text-[#E7C768]" />;
  }
  if (
    normalized.includes("SALES") ||
    normalized.includes("ПРОДАЖ") ||
    normalized.includes("РОП") ||
    normalized.includes("КОММЕРЦ")
  ) {
    return <TrendingUp className="w-5 h-5 text-[#E7C768]" />;
  }
  if (
    normalized.includes("PARTNER") ||
    normalized.includes("ПАРТНЕР") ||
    normalized.includes("СВЯЗ")
  ) {
    return <HeartHandshake className="w-5 h-5 text-[#E7C768]" />;
  }
  if (
    normalized.includes("PROJECT") ||
    normalized.includes("ПРОЕКТ") ||
    normalized.includes("РАЗВИТ")
  ) {
    return <Target className="w-5 h-5 text-[#E7C768]" />;
  }
  if (
    normalized.includes("TECH") ||
    normalized.includes("IT") ||
    normalized.includes("DEV") ||
    normalized.includes("ТЕХН") ||
    normalized.includes("РАЗРАБОТК")
  ) {
    return <Cpu className="w-5 h-5 text-[#E7C768]" />;
  }
  if (
    normalized.includes("MARKETING") ||
    normalized.includes("МАРКЕТИНГ") ||
    normalized.includes("РЕКЛАМ") ||
    normalized.includes("PR")
  ) {
    return <Megaphone className="w-5 h-5 text-[#E7C768]" />;
  }
  if (
    normalized.includes("MENTOR") ||
    normalized.includes("НАСТАВНИК") ||
    normalized.includes("КУРАТОР") ||
    normalized.includes("СОПРОВОЖД")
  ) {
    return <GraduationCap className="w-5 h-5 text-[#E7C768]" />;
  }

  const fallbackIcons = [
    <Briefcase key="1" className="w-5 h-5 text-[#E7C768]" />,
    <Sparkles key="2" className="w-5 h-5 text-[#E7C768]" />,
    <Layers key="3" className="w-5 h-5 text-[#E7C768]" />,
    <Award key="4" className="w-5 h-5 text-[#E7C768]" />,
    <ShieldCheck key="5" className="w-5 h-5 text-[#E7C768]" />,
    <CheckCircle2 key="6" className="w-5 h-5 text-[#E7C768]" />,
  ];
  return fallbackIcons[index % fallbackIcons.length];
}

interface ProductItem {
  title?: string;
  description: string;
}

function parseProducts(raw?: string | null): ProductItem[] | null {
  if (!raw) return null;
  const lines = normalizeTextLines(raw);
  if (lines.length === 0) return null;

  const items: ProductItem[] = [];
  for (const line of lines) {
    const cleaned = line.replace(/^(?:[•\s\-*]|\d+\.)+/, "").trim();
    if (!cleaned) continue;

    const bracketMatch = cleaned.match(/^\[([^\]]+)\]\s*(.*)$/);
    if (bracketMatch) {
      items.push({ title: bracketMatch[1].trim(), description: bracketMatch[2].trim() });
      continue;
    }

    const colonMatch = cleaned.match(/^([^:—–]{3,50})[:—–]\s+(.+)$/);
    if (colonMatch && !colonMatch[1].includes(".") && colonMatch[1].length < 50) {
      items.push({ title: colonMatch[1].trim(), description: colonMatch[2].trim() });
      continue;
    }

    // Direct standalone service phrase (e.g. "Аренда руководителей отделов продаж")
    items.push({ title: cleaned, description: "" });
  }

  return items.length > 0 ? items : null;
}

function getProductIcon(index: number, text: string) {
  const norm = text.toLowerCase();
  if (
    norm.includes("аренда") ||
    norm.includes("руководител") ||
    norm.includes("роп") ||
    norm.includes("управлен")
  ) {
    return <Users className="w-5 h-5 text-[#E7C768]" />;
  }
  if (
    norm.includes("построение") ||
    norm.includes("под ключ") ||
    norm.includes("внедрение") ||
    norm.includes("систем")
  ) {
    return <Layers className="w-5 h-5 text-[#E7C768]" />;
  }
  if (
    norm.includes("обучение") ||
    norm.includes("подготовк") ||
    norm.includes("академи") ||
    norm.includes("курс")
  ) {
    return <GraduationCap className="w-5 h-5 text-[#E7C768]" />;
  }
  if (
    norm.includes("консалтинг") ||
    norm.includes("аналитик") ||
    norm.includes("воронк") ||
    norm.includes("аудит") ||
    norm.includes("мотиваци")
  ) {
    return <BarChart3 className="w-5 h-5 text-[#E7C768]" />;
  }
  if (
    norm.includes("автоматизац") ||
    norm.includes("ии") ||
    norm.includes("бот") ||
    norm.includes("crm")
  ) {
    return <Cpu className="w-5 h-5 text-[#E7C768]" />;
  }

  const iconPool = [
    <Package key="1" className="w-5 h-5 text-[#E7C768]" />,
    <Sparkles key="2" className="w-5 h-5 text-[#E7C768]" />,
    <Target key="3" className="w-5 h-5 text-[#E7C768]" />,
    <TrendingUp key="4" className="w-5 h-5 text-[#E7C768]" />,
    <Award key="5" className="w-5 h-5 text-[#E7C768]" />,
    <ShieldCheck key="6" className="w-5 h-5 text-[#E7C768]" />,
  ];
  return iconPool[index % iconPool.length];
}

function renderAboutText(raw?: string | null, themeConfig?: any) {
  const taggedItems = parseTaggedAbout(raw);
  if (!taggedItems || taggedItems.length === 0) {
    return renderText(raw);
  }

  const activeBtnColor = themeConfig?.btnActiveTextColor || "#17344F";
  const activeBtnBg = themeConfig ? hexToRgba(themeConfig.btnActiveBgColor || "#E7C768", themeConfig.btnActiveOpacity ?? 100) : undefined;
  const activeBtnBorder = themeConfig ? hexToRgba(themeConfig.btnBorderColor || "#FFFFFF", themeConfig.btnBorderOpacity ?? 20) : undefined;
  const activeBtnRadius = themeConfig?.btnBorderRadius === 999 ? "9999px" : (themeConfig?.btnBorderRadius !== undefined ? `${themeConfig.btnBorderRadius}px` : undefined);
  const activeBtnWidth = themeConfig?.btnBorderWidth !== undefined ? `${themeConfig.btnBorderWidth}px` : undefined;

  const badgeStyle: React.CSSProperties = {
    backgroundColor: activeBtnBg,
    color: activeBtnColor,
    borderColor: activeBtnBorder,
    borderRadius: activeBtnRadius,
    borderWidth: activeBtnWidth,
    borderStyle: "solid",
  };

  return (
    <div className="space-y-4 text-left">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-4">
        {taggedItems.map((item, ix) => {
          const icon = getTagIcon(item.tag, ix);
          return (
            <div
              key={ix}
              className="about-card group relative rounded-2xl bg-transparent backdrop-blur-xl border border-white/20 hover:border-[#E7C768]/60 p-5 md:p-6 flex flex-col justify-between transition-all duration-300 shadow-md text-left space-y-3"
            >
              <div className="flex items-center justify-between gap-3">
                {item.tag ? (
                  <span
                    style={badgeStyle}
                    className="landing-btn-active about-tag-badge inline-flex items-center px-3.5 py-1.5 rounded-xl text-sm font-bold shadow-sm"
                  >
                    <span style={{ color: activeBtnColor }}>{item.tag}</span>
                  </span>
                ) : <span />}
                <div
                  style={badgeStyle}
                  className="landing-btn-active about-icon-badge w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-sm"
                >
                  <span style={{ color: activeBtnColor }}>{icon}</span>
                </div>
              </div>
              <p className="text-sm md:text-base text-white font-medium leading-relaxed">
                {item.description}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function renderProductsText(raw?: string | null, themeConfig?: any) {
  const products = parseProducts(raw);
  if (!products || products.length === 0) {
    return renderText(raw);
  }

  const activeBtnColor = themeConfig?.btnActiveTextColor || "#17344F";
  const activeBtnBg = themeConfig ? hexToRgba(themeConfig.btnActiveBgColor || "#E7C768", themeConfig.btnActiveOpacity ?? 100) : undefined;
  const activeBtnBorder = themeConfig ? hexToRgba(themeConfig.btnBorderColor || "#FFFFFF", themeConfig.btnBorderOpacity ?? 20) : undefined;
  const activeBtnRadius = themeConfig?.btnBorderRadius === 999 ? "9999px" : (themeConfig?.btnBorderRadius !== undefined ? `${themeConfig.btnBorderRadius}px` : undefined);
  const activeBtnWidth = themeConfig?.btnBorderWidth !== undefined ? `${themeConfig.btnBorderWidth}px` : undefined;

  return (
    <div className="space-y-4 text-left">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {products.map((item, ix) => {
          const displayText = item.title || item.description || "";
          const icon = getProductIcon(ix, displayText);
          const hasSeparateDesc = Boolean(item.description && item.title && item.description !== item.title);

          return (
            <div
              key={ix}
              style={{
                backgroundColor: activeBtnBg,
                color: activeBtnColor,
                borderColor: activeBtnBorder,
                borderRadius: activeBtnRadius,
                borderWidth: activeBtnWidth,
                borderStyle: "solid",
              }}
              className="product-card landing-btn-active group relative rounded-2xl p-5 md:p-6 flex flex-col justify-between transition-all duration-300 shadow-md text-left space-y-3"
            >
              <div className="flex items-start gap-3.5">
                <div
                  className="landing-icon-container w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm"
                  style={{ color: activeBtnColor }}
                >
                  {icon}
                </div>
                <div className="min-w-0 flex-1 space-y-1.5 text-left">
                  <h4 className="text-base font-bold leading-snug" style={{ color: activeBtnColor }}>
                    {item.title || item.description}
                  </h4>
                  {hasSeparateDesc && (
                    <p className="text-sm md:text-base font-medium leading-relaxed opacity-90" style={{ color: activeBtnColor }}>
                      {item.description}
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function renderText(raw?: string | null) {
  if (!raw) return null;
  const lines = normalizeTextLines(raw);
  return (
    <div className="space-y-3 text-sm md:text-base text-slate-100 leading-relaxed font-medium text-left">
      {lines.map((line, ix) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={ix} className="h-2" />;
        if (trimmed.startsWith("-") || trimmed.startsWith("*") || trimmed.startsWith("•")) {
          return (
            <div key={ix} className="flex items-start gap-2.5 pl-1">
              <span className="landing-bullet-dot mt-2 w-2 h-2 rounded-full bg-[#E7C768] shrink-0 shadow-sm" />
              <span className="text-sm md:text-base">{trimmed.replace(/^[•\s-*]+/, "").trim()}</span>
            </div>
          );
        }
        if (/^\d+\./.test(trimmed)) {
          const dot = trimmed.indexOf(".");
          return (
            <div key={ix} className="flex items-start gap-2.5 pl-1">
              <span className="landing-bullet-number font-mono font-bold text-[#E7C768] shrink-0 text-sm md:text-base">
                {trimmed.substring(0, dot + 1)}
              </span>
              <span className="text-sm md:text-base">{trimmed.substring(dot + 1).trim()}</span>
            </div>
          );
        }
        return (
          <p key={ix} className="whitespace-pre-line text-sm md:text-base">
            {line}
          </p>
        );
      })}
    </div>
  );
}

/** Stat value can be a plain primitive or `{ value, label }` shape. */
function statValue(v: any): { value: string; label?: string } {
  if (v == null) return { value: "" };
  if (typeof v === "object") {
    return {
      value: String(v.value ?? v.amount ?? v.count ?? ""),
      label: v.label ?? v.title ?? undefined,
    };
  }
  return { value: String(v) };
}

const STAT_KEY_LABEL: Record<string, string> = {
  founded_year: "Год основания",
  employees: "Сотрудники",
  turnover: "Оборот",
  clients: "Клиенты",
  dialogs: "Диалогов",
  cities: "Города",
};

function StickyNav({ items }: { items: { id: string; label: string }[] }) {
  const [active, setActive] = useState<string>(items[0]?.id || "");
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const observers: IntersectionObserver[] = [];
    items.forEach((it) => {
      const el = document.getElementById(it.id);
      if (!el) return;
      const io = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            if (e.isIntersecting) setActive(it.id);
          }
        },
        { rootMargin: "-30% 0px -60% 0px", threshold: 0 },
      );
      io.observe(el);
      observers.push(io);
    });
    return () => observers.forEach((o) => o.disconnect());
  }, [items.map((i) => i.id).join(",")]);

  return (
    <nav className="sticky top-[68px] z-20 -mx-4 md:-mx-0 px-4 md:px-0 py-2.5 mb-4 bg-transparent backdrop-blur-2xl">
      <div className="flex flex-wrap gap-2 py-1">
        {items.map((it) => (
          <a
            key={it.id}
            href={`#${it.id}`}
            onClick={(e) => {
              e.preventDefault();
              document.getElementById(it.id)?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
            className={[
              "px-4 py-2 rounded-2xl text-sm font-semibold border transition-all duration-300 backdrop-blur-xl text-center",
              active === it.id
                ? "landing-btn-active border-[#E7C768] text-[#E7C768] bg-transparent shadow-lg ring-1 ring-[#E7C768]/40"
                : "landing-btn-inactive border-white/20 text-slate-300 hover:text-white hover:border-white/40 bg-transparent",
            ].join(" ")}
          >
            {it.label}
          </a>
        ))}
      </div>
    </nav>
  );
}

export default function CompanySections({
  company,
  vacancies,
  onOpenVacancy,
  companySlug,
  currentVacancy,
  onBackToVacancy,
  getVacancyUrl,
  hideStickyNav,
  sitePreviewHeight,
  siteDisplayMode,
  themeConfig,
}: Props) {
  if (!company) return null;

  // Parse sites for banner preview and additional buttons
  let parsedSites: Array<{ url: string; title?: string; customScreenshot?: string; heightPx?: number }> = [];
  if (Array.isArray(company.sites)) {
    parsedSites = company.sites.filter((s: any) => s && (typeof s === "string" ? s.trim() : s.url && s.url.trim()));
  } else if (typeof company.sites === "string" && company.sites.trim()) {
    try {
      const parsed = JSON.parse(company.sites);
      if (Array.isArray(parsed)) {
        parsedSites = parsed.filter((s: any) => s && (typeof s === "string" ? s.trim() : s.url && s.url.trim()));
      } else if (typeof parsed === "object" && parsed.url) {
        parsedSites = [parsed];
      } else {
        parsedSites = [{ url: company.sites }];
      }
    } catch {
      parsedSites = [{ url: company.sites }];
    }
  } else if (company.website) {
    parsedSites = [{ url: company.website }];
  }

  // Parse theme config for display options
  let themeObj: any = {};
  if (company.theme_config) {
    themeObj = typeof company.theme_config === "string" ? JSON.parse(company.theme_config) : company.theme_config;
  }
  const effectiveMode = siteDisplayMode || themeConfig?.siteDisplayMode || themeObj?.siteDisplayMode || "preview";
  const effectiveHeight = sitePreviewHeight !== undefined ? sitePreviewHeight : (themeConfig?.sitePreviewHeight !== undefined ? themeConfig.sitePreviewHeight : (themeObj?.sitePreviewHeight !== undefined ? themeObj.sitePreviewHeight : 180));
  const isButtonsOnlyMode = effectiveMode === "buttons" || effectiveHeight === 0;

  // 1st site for main header banner, subsequent sites for header buttons
  const primarySite = parsedSites.length > 0 ? parsedSites[0] : null;
  const additionalSites = isButtonsOnlyMode ? parsedSites : parsedSites.length > 1 ? parsedSites.slice(1) : [];

  // Content flags for the sections
  const hasCompanyDesc = Boolean(company.description_text || company.description);
  const hasProducts = Boolean(company.products_text);
  const hasMission = Boolean(company.mission_text || company.missionText);
  const hasSection1Company = hasProducts || hasMission;

  const hasAbout = Boolean(company.about_text);
  const hasTeam = Boolean(company.team_text || company.teamText);
  const hasSystem = Boolean(company.system_text || company.customWiki);
  const hasSection2About = hasAbout || hasTeam || hasSystem;

  const stats = company.stats && typeof company.stats === "object" ? company.stats : null;
  const statEntries = stats ? Object.entries(stats).filter(([k]) => k !== "labels") : [];
  const hasSection3Stats = statEntries.some(([_, v]) => statValue(v).value !== "");

  const hasPayouts = Boolean(company.payouts_text || company.salaryTerms);
  const hasSchedule = Boolean(company.schedule_text || company.scheduleTerms);
  const hasSection4Conditions = hasPayouts || hasSchedule;

  const hasSection5Vacancies = vacancies && vacancies.length > 0;

  // Build the navigation items
  const navItems: { id: string; label: string }[] = [];
  if (hasSection1Company) navItems.push({ id: "sec-company", label: hasProducts ? "Продукты" : "Миссия" });
  if (hasSection2About) navItems.push({ id: "sec-about", label: "О нас" });
  if (hasSection3Stats) navItems.push({ id: "sec-stats", label: "Показатели" });
  if (hasSection4Conditions) navItems.push({ id: "sec-conditions", label: "Условия" });
  if (hasSection5Vacancies) navItems.push({ id: "sec-vacancies", label: "Вакансии" });

  const heroRef = useInView<HTMLDivElement>();

  const heroMeta: string[] = [];
  if (company.industry) heroMeta.push(String(company.industry));
  if (company.staff) heroMeta.push(`${company.staff}`);

  const heroDesktopMedia = themeConfig?.heroBgMediaUrl || themeConfig?.heroBgImageUrl || themeObj?.heroBgMediaUrl || themeObj?.heroBgImageUrl;
  const heroMobileMedia = themeConfig?.heroBgMobileMediaUrl || themeObj?.heroBgMobileMediaUrl;
  const isHeroDesktopVideo = isVideoUrl(heroDesktopMedia);
  const isHeroMobileVideo = isVideoUrl(heroMobileMedia);
  const heroVideoAutoplay = (themeConfig?.heroBgVideoAutoplay ?? themeObj?.heroBgVideoAutoplay) !== false;
  const heroVideoLoop = (themeConfig?.heroBgVideoLoop ?? themeObj?.heroBgVideoLoop) !== false;
  const heroDisplayMode = themeConfig?.heroBgDisplayMode || themeObj?.heroBgDisplayMode || "cover";
  const heroMediaVisible = heroDisplayMode !== "none" && Boolean(heroDesktopMedia || heroMobileMedia);

  const heroImageStyle = (url: string): React.CSSProperties => ({
    backgroundImage: `url('${url}')`,
    backgroundPosition: "center",
    backgroundSize: heroDisplayMode === "tile" ? "auto" : "cover",
    backgroundRepeat: heroDisplayMode === "tile" ? "repeat" : "no-repeat",
    backgroundAttachment: heroDisplayMode === "fixed" ? "fixed" : "scroll",
  });

  return (
    <div className="space-y-6 md:space-y-8">
      {/* HERO SECTION */}
      <div
        ref={heroRef.ref}
        id="sec-hero"
        className={[
          "company-landing-hero landing-hero-card landing-hero-banner relative overflow-hidden rounded-3xl px-[2%] sm:px-6 md:px-10 py-6 md:py-10",
          "bg-transparent backdrop-blur-2xl",
          "border border-white/20 hover:border-[#E7C768]/60",
          "shadow-2xl transition-[opacity,transform,border-color] duration-500",
          heroRef.inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4",
        ].join(" ")}
      >
        {/* Dedicated Hero Background Layer (isolated from logo & site screenshot filters) */}
        {heroMediaVisible && (
          <div className="landing-hero-bg-layer landing-hero-bg absolute inset-0 pointer-events-none overflow-hidden rounded-3xl z-0">
            {/* Desktop Media (hidden on mobile if separate mobile media exists) */}
            {heroDesktopMedia && (
              isHeroDesktopVideo ? (
                <video
                  src={heroDesktopMedia}
                  autoPlay={heroVideoAutoplay}
                  muted
                  loop={heroVideoLoop}
                  playsInline
                  className={`landing-hero-media w-full h-full object-cover ${heroMobileMedia ? "hidden md:block" : "block"}`}
                />
              ) : (
                <div
                  style={heroImageStyle(heroDesktopMedia)}
                  className={`landing-hero-media w-full h-full ${heroMobileMedia ? "hidden md:block" : "block"}`}
                />
              )
            )}
            {/* Mobile Media */}
            {heroMobileMedia && (
              isHeroMobileVideo ? (
                <video
                  src={heroMobileMedia}
                  autoPlay={heroVideoAutoplay}
                  muted
                  loop={heroVideoLoop}
                  playsInline
                  className="landing-hero-media w-full h-full object-cover block md:hidden"
                />
              ) : (
                <div
                  style={heroImageStyle(heroMobileMedia)}
                  className="landing-hero-media w-full h-full block md:hidden"
                />
              )
            )}
          </div>
        )}

        {/* Hero Background Filter Overlay Layer */}
        {heroDisplayMode !== "none" && (
          <div className="landing-hero-filter-layer absolute inset-0 pointer-events-none z-0 rounded-3xl" />
        )}

        {/* Primary site banner preview */}
        {primarySite && !isButtonsOnlyMode && (
          <div className="relative mb-6 z-[1]">
            <SitePreview
              url={typeof primarySite === "string" ? primarySite : primarySite.url}
              title={typeof primarySite === "object" ? primarySite.title : undefined}
              customScreenshot={typeof primarySite === "object" ? primarySite.customScreenshot : undefined}
              heightPx={sitePreviewHeight || (typeof primarySite === "object" ? primarySite.heightPx : undefined)}
              variant="banner"
              filterColor={themeConfig?.sitePreviewFilterColor || themeObj?.sitePreviewFilterColor}
              filterOpacity={themeConfig?.sitePreviewFilterOpacity ?? themeObj?.sitePreviewFilterOpacity}
              screenshotFilterColor={themeConfig?.siteScreenshotFilterColor || themeObj?.siteScreenshotFilterColor}
              screenshotFilterOpacity={themeConfig?.siteScreenshotFilterOpacity ?? themeObj?.siteScreenshotFilterOpacity}
              themeConfig={themeConfig}
            />
          </div>
        )}

        <div className="relative z-[1] flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="flex flex-col sm:flex-row items-center sm:items-start md:items-center text-center sm:text-left gap-4 sm:gap-5 min-w-0 w-full md:w-auto flex-1">
            <CompanyLandingLogo
              src={company.logo_url}
              alt={company.name || "logo"}
              themeConfig={themeConfig}
              themeObj={themeObj}
            />
            <div className="min-w-0 flex-1 w-full">
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent leading-tight break-words">
                {company.name || "Без названия"}
              </h1>
              {heroMeta.length > 0 && (
                <div className="mt-2 flex flex-wrap justify-center sm:justify-start gap-2">
                  {heroMeta.map((m, i) => (
                    <span
                      key={i}
                      className="landing-chip inline-flex items-center gap-1.5 bg-transparent border border-white/20 text-xs sm:text-sm font-medium text-slate-200 px-3 py-1 rounded-full backdrop-blur-md"
                    >
                      {m}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Action buttons on hero positioned above text */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto shrink-0">
            {vacancies.length > 0 && (
              <a
                href="#sec-vacancies"
                onClick={(e) => {
                  e.preventDefault();
                  document.getElementById("sec-vacancies")?.scrollIntoView({ behavior: "smooth" });
                }}
                className="landing-btn-active inline-flex items-center justify-center gap-2 bg-transparent backdrop-blur-xl border text-sm font-bold px-5 py-3 rounded-2xl transition shadow-lg cursor-pointer"
              >
                <span>Смотреть вакансии ({vacancies.length})</span>
                <ChevronRight className="w-4 h-4" />
              </a>
            )}
            {currentVacancy && onBackToVacancy && (
              <button
                onClick={onBackToVacancy}
                className="landing-btn-inactive bg-transparent text-white text-sm font-semibold px-4 py-3 rounded-2xl border border-white/20 transition flex items-center justify-center gap-2 backdrop-blur-md cursor-pointer"
              >
                ← Назад к вакансии
              </button>
            )}
          </div>
        </div>

        {/* Company description directly in Hero across full container width, positioned below buttons */}
        {(company.description_text || company.description) && (
          <div className="relative z-[1] mt-5 pt-4 border-t border-white/15 text-left text-sm sm:text-base leading-relaxed text-slate-200 w-full">
            {renderText(company.description_text || company.description)}
          </div>
        )}

        {/* Additional sites rendered as Apple Liquid Glass buttons */}
        {additionalSites.length > 0 && (
          <div className="mt-6 pt-5 border-t border-white/15 flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium text-slate-300">
              Сайты и ресурсы:
            </span>
            {additionalSites.map((siteItem, sIdx) => {
              const url = typeof siteItem === "string" ? siteItem : siteItem.url;
              const title = typeof siteItem === "object" ? siteItem.title : undefined;
              return (
                <SitePreview
                  key={sIdx}
                  url={url}
                  title={title}
                  variant="compact"
                  themeConfig={themeConfig}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Sticky Navigation */}
      {!hideStickyNav && navItems.length > 1 && <StickyNav items={navItems} />}

      {/* SECTION 1: ПРОДУКТЫ И МИССИЯ */}
      {hasSection1Company && (
        <div id="sec-company" className="space-y-5 scroll-mt-28">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {hasProducts && (
              <SectionCard
                icon={<Package className="w-5 h-5" />}
                title="Продукты и услуги"
                className="col-span-full lg:col-span-2"
              >
                {renderProductsText(company.products_text, themeConfig)}
              </SectionCard>
            )}

            {hasMission && (
              <SectionCard
                icon={<Sparkles className="w-5 h-5" />}
                title="Миссия и ценности"
                className="col-span-full lg:col-span-2"
              >
                {renderText(company.mission_text || company.missionText)}
              </SectionCard>
            )}
          </div>
        </div>
      )}

      {/* SECTION 2: О НАС (О нас, Команда, ИИ-Система) */}
      {hasSection2About && (
        <div id="sec-about" className="space-y-5 scroll-mt-28">
          <div className="flex items-center gap-3">
            <div className="landing-btn-active landing-icon-container w-8 h-8 rounded-xl flex items-center justify-center shrink-0 shadow-sm">
              <Users className="w-4 h-4" />
            </div>
            <h2 className="text-xl md:text-2xl font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">
              О нас
            </h2>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {hasAbout && (
              <SectionCard
                className="col-span-full lg:col-span-2"
              >
                {renderAboutText(company.about_text, themeConfig)}
              </SectionCard>
            )}

            {hasTeam && (
              <SectionCard
                icon={<Users className="w-5 h-5" />}
                title="Команда"
                className={!hasSystem ? "col-span-full lg:col-span-2" : "col-span-full lg:col-span-2"}
              >
                {renderText(company.team_text || company.teamText)}
              </SectionCard>
            )}

            {hasSystem && (
              <SectionCard
                id="card-ai-system"
                icon={<Cpu className="w-5 h-5" />}
                title="ИИ-Система и технологии"
                className="col-span-full lg:col-span-2 card-ai-system"
              >
                {renderText(company.system_text || company.customWiki)}
              </SectionCard>
            )}
          </div>
        </div>
      )}

      {/* SECTION 3: ПОКАЗАТЕЛИ */}
      {hasSection3Stats && (
        <div id="sec-stats" className="space-y-5 scroll-mt-28">
          <SectionCard
            id="card-stats"
            icon={<BarChart3 className="w-5 h-5" />}
            title="Показатели"
            className="col-span-full"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {statEntries.map(([k, v]) => {
                const { value, label } = statValue(v);
                if (!value) return null;
                const lbl =
                  label ||
                  (stats as any)?.labels?.[k] ||
                  STAT_KEY_LABEL[k] ||
                  k;
                return (
                  <div
                    key={k}
                    className="landing-btn-active stat-box rounded-2xl p-5 border transition-all duration-300 shadow-md flex flex-col justify-center"
                  >
                    <div className="landing-stat-value text-3xl font-bold">
                      {value}
                    </div>
                    <div className="landing-stat-label mt-1.5 text-sm font-semibold opacity-90">
                      {lbl}
                    </div>
                  </div>
                );
              })}
            </div>
          </SectionCard>
        </div>
      )}

      {/* SECTION 4: УСЛОВИЯ (Выплаты, График) */}
      {hasSection4Conditions && (
        <div id="sec-conditions" className="space-y-5 scroll-mt-28">
          <div className="flex items-center gap-3">
            <div className="landing-btn-active landing-icon-container w-8 h-8 rounded-xl flex items-center justify-center shrink-0 shadow-sm">
              <Wallet className="w-4 h-4" />
            </div>
            <h2 className="text-xl md:text-2xl font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">
              Условия
            </h2>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {hasPayouts && (
              <SectionCard
                icon={<Wallet className="w-5 h-5" />}
                title="Выплаты и зарплата"
                className={!hasSchedule ? "lg:col-span-2" : ""}
              >
                {renderText(company.payouts_text || company.salaryTerms)}
              </SectionCard>
            )}

            {hasSchedule && (
              <SectionCard
                icon={<CalendarClock className="w-5 h-5" />}
                title="График работы"
                className={!hasPayouts ? "lg:col-span-2" : ""}
              >
                {renderText(company.schedule_text || company.scheduleTerms)}
              </SectionCard>
            )}
          </div>
        </div>
      )}

      {/* SECTION 5: ВАКАНСИИ */}
      {hasSection5Vacancies && (
        <div id="sec-vacancies" className="space-y-5 scroll-mt-28">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="landing-btn-active landing-icon-container w-8 h-8 rounded-xl flex items-center justify-center shrink-0 shadow-sm">
                <Briefcase className="w-4 h-4" />
              </div>
              <h2 className="text-xl md:text-2xl font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">
                Вакансии · {vacancies.length}
              </h2>
            </div>
          </div>

          <SectionCard title="Открытые позиции компании">
            <div className="flex flex-col gap-4">
              {vacancies.map((v) => (
                <VacancyCard
                  key={v.id}
                  layout="horizontal"
                  href={getVacancyUrl ? getVacancyUrl(v) : undefined}
                  vacancy={{
                    ...v,
                    id: v.id,
                    public_id: (v as any).public_id || (v as any).publicId,
                    publicId: (v as any).publicId || (v as any).public_id,
                    slug: (v as any).slug,
                    role_slug: (v as any).role_slug,
                    roleName: v.roleName,
                    companyName: company?.name || null,
                    companyLogo: company?.logo_url || (v as any).logoUrl || null,
                    industry: company?.industry || null,
                    salaryTerms: v.salaryTerms || null,
                    scheduleTerms: v.scheduleTerms || null,
                    vacancyText: (v as any).vacancyText || null,
                  }}
                  active={currentVacancy?.id === v.id}
                  showCompany={false}
                  themeConfig={themeConfig}
                  onOpen={() => onOpenVacancy(v)}
                />
              ))}
            </div>
          </SectionCard>
        </div>
      )}
    </div>
  );
}
