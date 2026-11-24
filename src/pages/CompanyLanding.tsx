/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo } from "react";
import { Loader2 } from "lucide-react";
import RRImage from "@/components/RRImage";
import { DEFAULT_RR_LOGO_URL } from "@/lib/img";
import { useRouter } from "../components/RouterContext";
import Mascot from "../components/Mascot";
import Markdown from "react-markdown";
import { JobProject, Message } from "../types";
import { dbClient } from "@/lib/dbClient";
import { buildCandidateUrl, transliterateToSlug } from "@/lib/links";
import CandidateAuthModal from "../components/CandidateAuthModal";
import AuthModal from "../components/AuthModal";
import CompanySections from "../components/CompanySections";
import CompanyLandingLogo from "@/components/CompanyLandingLogo";
import SitePreview from "../components/SitePreview";
import VacancyAIAssistant from "@/components/VacancyAIAssistant";
import VacancyCard from "@/components/VacancyCard";
import Reveal from "@/components/Reveal";
import LandingStyleEditor, { useLandingTheme, LandingThemeConfig, isVideoUrl, hexToRgba } from "@/components/LandingStyleEditor";
import InteractiveLandingBackground from "@/components/InteractiveLandingBackground";
import NeuronSphereCanvas from "@/components/NeuronSphereCanvas";
import { useSeo, SITE_URL } from "@/lib/seo";
import { isPngImage } from "@/lib/utils";

/** Map a database `projects` row + parent company into the UI's JobProject shape. */
function mapDbProjectToUi(company: any) {
  return (p: any): JobProject => {
    // Auto-derive short summary lines from detailed text fields when the
    // employer filled in only the long-form description. This keeps the
    // landing's header pills and vacancy cards populated even if the
    // employer never typed a separate "salary_terms"/"schedule_terms".
    const firstNonEmptyLine = (s?: string | null) => {
      if (!s) return undefined;
      const line = String(s)
        .split("\n")
        .map((l) => l.replace(/^[•\s\-*]+/, "").trim())
        .find((l) => l.length > 0);
      return line || undefined;
    };
    const salaryFallback =
      p.salary_terms || firstNonEmptyLine(p.payouts_text) || undefined;
    const scheduleFallback =
      p.schedule_terms || firstNonEmptyLine(p.schedule_text) || undefined;
    return ({
      id: p.id,
      public_id: p.public_id || p.publicId ? String(p.public_id || p.publicId) : undefined,
      publicId: p.publicId || p.public_id ? String(p.publicId || p.public_id) : undefined,
      companyName: company?.name || p.company_name || p.companyName || "",
      companySlug: company?.slug || p.company_slug || p.companySlug || undefined,
      employerId: p.employer_id,
      roleName: p.role_name || p.roleName,
      slug: p.slug || undefined,
      role_slug: p.role_slug || undefined,
      company_public_id: p.company_public_id || company?.public_id || undefined,
      salaryTerms: salaryFallback,
      scheduleTerms: scheduleFallback,
      motivationText: p.motivation_text || undefined,
      customWiki: p.custom_wiki || undefined,
      checklistQuestions: [],
      roleplayQuestions: [],
      vacancyText: p.vacancy_text || undefined,
      tasksActivityText: p.tasks_activity_text || undefined,
      motivationTextDetail: p.motivation_text_detail || undefined,
      companyText: p.company_text || undefined,
      onboardingText: p.onboarding_text || undefined,
      payoutsText: p.payouts_text || undefined,
      scheduleText: p.schedule_text || undefined,
      teamText: p.team_text || undefined,
      systemText: p.system_text || undefined,
      logoUrl: p.logo_url || company?.logo_url || undefined,
      missionText: p.mission_text || undefined,
      theme_config: p.theme_config || company?.theme_config || undefined,
      css: p.css || company?.css || undefined,
    });
  };
}
import {
  Briefcase,
  DollarSign,
  Clock,
  BookOpen,
  MessageSquare,
  ArrowRight,
  Send,
  Loader,
  X,
  User,
  Mail,
  HelpCircle,
  Menu,
  ChevronRight,
  ChevronLeft,
  Globe,
  Users,
  Building,
  CheckCircle,
  AlertCircle,
  Sparkles,
  Palette
} from "lucide-react";
import {
  VacancyView,
  MotivationView,
  CompanyView,
  OnboardingView,
  PayoutsView,
  ScheduleView,
  TeamView,
  SystemView
} from "../components/VacancySections";

export default function CompanyLanding() {
  const { path, navigate, query } = useRouter();
  
  // Parse companySlug and vacancyId from path segments. Empty when route is "/".
  // New URLs: /com{publicId}/vac{publicId}/...  Legacy: /{slug}/{slug}/...
  const segments = path.split("/").filter(Boolean);
  const rawCompany = segments[0] || "";
  const rawVacancy = segments[1] || "";
  const companySlug = rawCompany.replace(/^com/i, "");
  const vacancyId = rawVacancy.replace(/^vac/i, "");
  const subTab = segments[2] || (vacancyId ? "vacancy" : "company");

  // States
  const [company, setCompany] = useState<any>(null);
  const [vacancies, setVacancies] = useState<JobProject[]>([]);
  const [selectedVacancy, setSelectedVacancy] = useState<JobProject | null>(null);
  const [selectedRaw, setSelectedRaw] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [isEmployer, setIsEmployer] = useState(false);
  const [employerId, setEmployerId] = useState<string | null>(null);

  const isCanonicalCompanyPath = rawCompany.toLowerCase().startsWith("com") && /^\d+$/.test(rawCompany.replace(/^com/i, ""));
  const hasExplicitEditParam = Boolean(query?.edit_theme === "1" || query?.edit === "1" || query?.edit_style === "1");
  const isCompanyMirror = isCanonicalCompanyPath || hasExplicitEditParam || (typeof window !== "undefined" && window.location.pathname.startsWith("/com")) || isEmployer;
  const [isStyleEditorOpen, setIsStyleEditorOpen] = useState<boolean>(() => hasExplicitEditParam);
  const [isEmployerAuthModalOpen, setIsEmployerAuthModalOpen] = useState(false);

  const handleGoToCabinet = () => {
    const token = localStorage.getItem("emp_token") || localStorage.getItem("employer_token");
    if (!token && !isEmployer) {
      setIsEmployerAuthModalOpen(true);
      return;
    }
    try {
      sessionStorage.removeItem("employer_preloaded");
      sessionStorage.setItem("show_employer_entry_loader", "1");
    } catch {}
    const targetEmpId = localStorage.getItem("employer_public_id") || localStorage.getItem("emp_public_id") || employerId || company?.owner_employer_id || company?.employer_id || "100007";
    navigate(`/emp${targetEmpId}`);
  };

  useEffect(() => {
    if (hasExplicitEditParam) {
      setIsStyleEditorOpen(true);
    }
  }, [hasExplicitEditParam]);

  const resolveVacPid = (vac: any): string => {
    if (vac?.public_id && /^\d+$/.test(String(vac.public_id))) return String(vac.public_id);
    if (vac?.publicId && /^\d+$/.test(String(vac.publicId))) return String(vac.publicId);
    if (vac?.id && /^\d{4,8}$/.test(String(vac.id))) return String(vac.id);
    const found = vacancies.find(
      (v) =>
        (vac?.id && v.id === vac.id) ||
        (vac?.public_id && (v.public_id === vac.public_id || (v as any).publicId === vac.public_id)) ||
        (vac?.publicId && (v.public_id === vac.publicId || (v as any).publicId === vac.publicId)) ||
        (vac?.roleName && v.roleName === vac.roleName) ||
        (vac?.role_name && (v.roleName === vac.role_name || (v as any).role_name === vac.role_name)) ||
        (vac?.slug && (v.slug === vac.slug || (v as any).role_slug === vac.slug))
    );
    if (found?.public_id && /^\d+$/.test(String(found.public_id))) return String(found.public_id);
    if ((found as any)?.publicId && /^\d+$/.test(String((found as any).publicId))) return String((found as any).publicId);
    if (found?.id && /^\d{4,8}$/.test(String(found.id))) return String(found.id);
    if (selectedVacancy && (vac?.id === selectedVacancy.id || !vac)) {
      if (selectedVacancy.public_id && /^\d+$/.test(String(selectedVacancy.public_id))) {
        return String(selectedVacancy.public_id);
      }
      if ((selectedVacancy as any)?.publicId && /^\d+$/.test(String((selectedVacancy as any).publicId))) {
        return String((selectedVacancy as any).publicId);
      }
    }
    if (selectedRaw && (vac?.id === selectedRaw.id || !vac)) {
      if (selectedRaw.public_id && /^\d+$/.test(String(selectedRaw.public_id))) {
        return String(selectedRaw.public_id);
      }
      if (selectedRaw.publicId && /^\d+$/.test(String(selectedRaw.publicId))) {
        return String(selectedRaw.publicId);
      }
    }
    if (vacancyId && /^\d{4,8}$/.test(String(vacancyId).replace(/^vac/i, ""))) {
      return String(vacancyId).replace(/^vac/i, "");
    }
    return String(vac?.public_id || (vac as any)?.publicId || "");
  };

  const resolveVacSlug = (vac: any): string => {
    if (vac?.slug && !/^\d+$/.test(String(vac.slug)) && !/^vac\d+$/i.test(String(vac.slug))) {
      return String(vac.slug);
    }
    if (vac?.role_slug && !/^\d+$/.test(String(vac.role_slug))) {
      return String(vac.role_slug);
    }
    const found = vacancies.find(
      (v) =>
        (vac?.id && v.id === vac.id) ||
        (vac?.public_id && (v.public_id === vac.public_id || (v as any).publicId === vac.public_id)) ||
        (vac?.publicId && (v.public_id === vac.publicId || (v as any).publicId === vac.publicId)) ||
        (vac?.roleName && v.roleName === vac.roleName) ||
        (vac?.slug && v.slug === vac.slug)
    );
    if (found?.slug && !/^\d+$/.test(String(found.slug)) && !/^vac\d+$/i.test(String(found.slug))) {
      return String(found.slug);
    }
    if ((found as any)?.role_slug && !/^\d+$/.test(String((found as any).role_slug))) {
      return String((found as any).role_slug);
    }
    const rName = vac?.roleName || vac?.role_name || found?.roleName || selectedVacancy?.roleName;
    if (rName) {
      const trans = transliterateToSlug(rName);
      if (trans) return trans;
    }
    const pid = resolveVacPid(vac);
    return pid ? `vac${pid}` : (vac?.id || vacancyId);
  };

  const getCompanyUrl = () => {
    const isEditorMode = isCanonicalCompanyPath || hasExplicitEditParam || isStyleEditorOpen;
    if (isEditorMode) {
      const compPid = company?.public_id || company?.publicId || (rawCompany.toLowerCase().startsWith("com") ? rawCompany.replace(/^com/i, "") : "300047");
      return `/com${compPid}${hasExplicitEditParam ? "?edit_theme=1" : ""}`;
    }
    const effSlug = company?.slug || (rawCompany.toLowerCase().startsWith("com") ? company?.public_id || rawCompany : rawCompany) || companySlug;
    return `/${effSlug}`;
  };

  const getVacancyUrl = (vac: any): string => {
    const isEditorMode = isCanonicalCompanyPath || hasExplicitEditParam || isStyleEditorOpen;
    if (isEditorMode) {
      const compPid = company?.public_id || company?.publicId || (rawCompany.toLowerCase().startsWith("com") ? rawCompany.replace(/^com/i, "") : "300047");
      const vacPid = resolveVacPid(vac);
      return `/com${compPid}/vac${vacPid}?edit_theme=1`;
    }
    const effSlug = company?.slug || (rawCompany.toLowerCase().startsWith("com") ? company?.public_id || rawCompany : rawCompany) || companySlug;
    const vacSlug = resolveVacSlug(vac);
    return `/${effSlug}/${vacSlug}`;
  };

  const getVacancyTabUrl = (vac: any, tabKey?: string): string => {
    if (!tabKey) return getVacancyUrl(vac);
    const isEditorMode = isCanonicalCompanyPath || hasExplicitEditParam || isStyleEditorOpen;
    if (isEditorMode) {
      const compPid = company?.public_id || company?.publicId || (rawCompany.toLowerCase().startsWith("com") ? rawCompany.replace(/^com/i, "") : "300047");
      const vacPid = resolveVacPid(vac);
      const suffix = hasExplicitEditParam ? "?edit_theme=1" : "";
      return `/com${compPid}/vac${vacPid}/${tabKey}${suffix}`;
    }
    const effSlug = company?.slug || (rawCompany.toLowerCase().startsWith("com") ? company?.public_id || rawCompany : rawCompany) || companySlug;
    const vacSlug = resolveVacSlug(vac);
    return `/${effSlug}/${vacSlug}/${tabKey}`;
  };

  // Strict session check: only show employer controls if valid employer token is authenticated
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = localStorage.getItem("emp_token") || localStorage.getItem("employer_token");
      if (!token) {
        if (!cancelled) {
          setIsEmployer(false);
          setEmployerId(null);
        }
        return;
      }

      try {
        const res = await fetch("/api/auth/employer/me", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          const u = data?.user;
          const uPid = String(u?.publicId || u?.public_id || u?.id || "");
          if (!cancelled && uPid) {
            setEmployerId(uPid);
          }
          const isOwner =
            u?.role === "admin" ||
            u?.is_admin ||
            u?.email === "shishkarnem@gmail.com" ||
            (uPid && (String(company?.owner_employer_id) === uPid || String(company?.employer_id) === uPid));
          if (!cancelled) {
            setIsEmployer(Boolean(isOwner));
          }
        } else {
          if (!cancelled) {
            setIsEmployer(false);
            setEmployerId(null);
          }
        }
      } catch {
        if (!cancelled) {
          setIsEmployer(false);
          setEmployerId(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [company?.id, company?.owner_employer_id, company?.employer_id]);

  // Parse custom landing theme from company record or vacancy record
  const activeTheme: LandingThemeConfig = useMemo(() => {
    const raw = company?.theme_config || company?.css || (selectedRaw as any)?.theme_config || (selectedRaw as any)?.css;
    if (!raw) return {};
    if (typeof raw === "string") {
      try {
        return JSON.parse(raw);
      } catch {
        return {};
      }
    }
    return raw;
  }, [company?.theme_config, company?.css, (selectedRaw as any)?.theme_config, (selectedRaw as any)?.css]);

  const [liveTheme, setLiveTheme] = useState<LandingThemeConfig | null>(null);
  const effectiveTheme: LandingThemeConfig = useMemo(() => {
    return { ...activeTheme, ...(liveTheme || {}) };
  }, [activeTheme, liveTheme]);

  // Apply custom landing theme automatically for all visitors
  useLandingTheme(effectiveTheme);

  const companySeoDesc = [
    company?.description_text || company?.description,
    company?.products_text ? `Продукты и услуги: ${company.products_text}` : "",
    company?.about_text ? `О нас: ${company.about_text}` : "",
  ].filter(Boolean).join(". ").replace(/\s+/g, " ").trim();

  const _pageTitle = selectedVacancy?.roleName
    ? `${selectedVacancy.roleName} — ${company?.name || "Вакансия"} | Робот Рекрутер`
    : company?.name
      ? `${company.name} — карьера и вакансии | Робот Рекрутер`
      : "Компания — Робот Рекрутер";
  const _pageDesc = selectedVacancy?.vacancyText
    ? String(selectedVacancy.vacancyText).replace(/\s+/g, " ").trim().slice(0, 220)
    : companySeoDesc
      ? companySeoDesc.slice(0, 240)
      : `${company?.name || "Компания"}: открытые вакансии, условия и информация о работодателе на платформе Робот Рекрутер.`;
  useSeo({
    title: _pageTitle,
    description: _pageDesc,
    canonical: `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`,
    ogUrl: `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`,
    ogType: selectedVacancy ? "article" : "website",
  });

  // Company-level fallbacks let the landing render meaningful sections
  // even when no vacancy is published yet (or fields are blank on a vacancy).
  const companyAbout = [company?.description_text, company?.products_text, company?.about_text]
    .filter((v) => v && String(v).trim() !== "")
    .join("\n\n");
  const allTabs = [
    { key: "vacancy",     label: "💼 Вакансия",   textVal: selectedVacancy?.vacancyText || "vacancy" },
    { key: "company",     label: "🏢 Компания",   textVal: selectedVacancy?.companyText || companyAbout || "company" },
    { key: "schedule",    label: "📅 График",     textVal: selectedVacancy?.scheduleText || selectedVacancy?.scheduleTerms || company?.schedule_text },
    { key: "motivation",  label: "🔥 Мотивация",  textVal: selectedVacancy?.motivationTextDetail || selectedVacancy?.motivationText || company?.mission_text },
    { key: "payouts",     label: "💵 Выплаты",    textVal: selectedVacancy?.payoutsText || company?.payouts_text },
    { key: "onboarding",  label: "🚀 Оформление", textVal: selectedVacancy?.onboardingText },
    { key: "team",        label: "👥 Команда",    textVal: selectedVacancy?.teamText || company?.team_text },
    { key: "system",      label: "⚙️ ИИ-Система", textVal: selectedVacancy?.systemText || company?.system_text },
  ];

  const visibleTabs = isCompanyMirror
    ? allTabs
    : allTabs.filter(t => t.key === "vacancy" || t.key === "company" || (t.textVal && String(t.textVal).trim() !== ""));

  // 5-Tab navigation for the company landing view (when no vacancy is open).
  const companyNavItems = React.useMemo(() => {
    if (!company) return [] as { id: string; label: string }[];
    const items: { id: string; label: string }[] = [];
    
    const hasSection1 = Boolean(company.description_text || company.description || company.products_text || company.mission_text || company.missionText);
    const hasSection2 = Boolean(company.about_text || company.team_text || company.teamText || company.system_text || company.customWiki);
    const stats = company.stats && typeof company.stats === "object" ? company.stats : null;
    const statEntries = stats ? Object.entries(stats).filter(([k]) => k !== "labels") : [];
    const hasSection3 = statEntries.length > 0;
    const hasSection4 = Boolean(company.payouts_text || company.salaryTerms || company.schedule_text || company.scheduleTerms);
    const hasSection5 = vacancies.length > 0;

    if (hasSection1) items.push({ id: "sec-company", label: "Компания" });
    if (hasSection2) items.push({ id: "sec-about", label: "О нас" });
    if (hasSection3) items.push({ id: "sec-stats", label: "Показатели" });
    if (hasSection4) items.push({ id: "sec-conditions", label: "Условия" });
    if (hasSection5) items.push({ id: "sec-vacancies", label: "Вакансии" });

    return items;
  }, [company, vacancies.length]);

  const showCompanyTabs = (!vacancyId || subTab === "company") && companyNavItems.length > 1;
  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  useEffect(() => {
    if (selectedVacancy && visibleTabs.length > 0 && segments[2]) {
      const isCurrentTabVisible = visibleTabs.some(t => t.key === subTab);
      if (!isCurrentTabVisible) {
        navigate(getVacancyTabUrl(selectedVacancy, visibleTabs[0].key));
      }
    }
  }, [subTab, selectedVacancy?.id, visibleTabs.length, companySlug, segments[2]]);

  // Consultant chatbot conversation state
  const [messages, setMessages] = useState<Message[]>([]);
  const [userQuestion, setUserQuestion] = useState("");
  const [isAiTyping, setIsAiTyping] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Candidate signup modal
  const [showApplyModal, setShowApplyModal] = useState(false);

  // Parallax scroll listener
  const [scrollY, setScrollY] = useState(0);
  useEffect(() => {
    const handleScroll = () => {
      setScrollY(window.scrollY);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Fetch company & projects from server
  const loadData = async () => {
    setLoading(true);
    try {
      let activeCompany: any = null;
      const targetIdentifier = companySlug || rawCompany;

      // 1. Try PostgreSQL BD ProTalk / backend endpoint by slug / public_id
      if (targetIdentifier) {
        try {
          const res = await fetch(`/api/companies/by-slug/${encodeURIComponent(targetIdentifier)}`);
          if (res.ok) {
            const data = await res.json();
            if (data?.company) {
              activeCompany = data.company;
              if (!isCanonicalCompanyPath && data.isRedirect && data.canonicalSlug && targetIdentifier.toLowerCase() !== data.canonicalSlug.toLowerCase()) {
                const rest = segments.slice(1).join("/");
                const targetUrl = rest ? `/${data.canonicalSlug}/${rest}` : `/${data.canonicalSlug}`;
                window.history.replaceState(null, "", targetUrl);
              }
            }
          }
        } catch (e) {
          console.warn("Backend by-slug fetch warning:", e);
        }
      }

      // 2. Query database if not found yet
      if (!activeCompany) {
        if (targetIdentifier) {
          const { data: compRows } = await dbClient
            .from("companies")
            .select("*")
            .or(`slug.eq.${targetIdentifier},public_id.eq.${targetIdentifier},legacy_slug.eq.${targetIdentifier},id.eq.${targetIdentifier}`)
            .limit(1);
          activeCompany = (compRows && compRows[0]) || null;
        } else {
          const { data: compRows } = await dbClient
            .from("companies")
            .select("*")
            .eq("is_published", true)
            .order("created_at", { ascending: false })
            .limit(1);
          activeCompany = (compRows && compRows[0]) || null;
        }
      }

      if (activeCompany) {
        setCompany({
          ...activeCompany,
          slug: activeCompany.slug,
          stats: typeof activeCompany.stats === "string" ? JSON.parse(activeCompany.stats) : (activeCompany.stats || {})
        });
      }

      // 3. Fetch projects (vacancies) for this company
      if (activeCompany?.id) {
        let projRows: any[] = [];

        // 3a. Primary authoritative source: PostgreSQL BD ProTalk server /api/projects
        try {
          const pRes = await fetch("/api/projects");
          if (pRes.ok) {
            const allProjects = await pRes.json();
            if (Array.isArray(allProjects)) {
              const cId = String(activeCompany.id || "");
              const cPubId = String(activeCompany.public_id || activeCompany.publicId || "");
              const cSlug = String(activeCompany.slug || "").toLowerCase();
              const cName = String(activeCompany.name || "").trim().toLowerCase();
              projRows = allProjects.filter((p: any) => {
                const pCompId = String(p.company_id || p.companyId || "");
                const pCompSlug = String(p.company_slug || p.companySlug || "").toLowerCase();
                const pCompName = String(p.company_name || p.companyName || "").trim().toLowerCase();
                return (
                  pCompId === cId || 
                  (cPubId && (pCompId === cPubId || pCompId === `comp-${cPubId}` || pCompId === `comp${cPubId}`)) ||
                  (cSlug && pCompSlug === cSlug) ||
                  (cName && pCompName === cName)
                );
              });
            }
          }
        } catch (e) {
          console.warn("Local projects fetch warning:", e);
        }

        // 3b. Fallback to database client if server returned no rows for this company
        if (projRows.length === 0) {
          try {
            const { data } = await dbClient
              .from("projects")
              .select("*")
              .eq("company_id", activeCompany.id)
              .eq("is_published", true)
              .neq("status", "deleted");
            if (data && Array.isArray(data)) projRows = data;
          } catch (e) {
            console.warn("database projects fetch warning:", e);
          }
        }

        const mapped: JobProject[] = (projRows || []).map(mapDbProjectToUi(activeCompany));
        // In editor mirror mode, show all vacancies; in public view, show only active, published vacancies
        const publicList = isCompanyMirror
          ? mapped
          : mapped.filter((_, i) => {
              const row = projRows![i] as any;
              const isDraft = row?.status === "draft" || row?.is_published === 0 || row?.is_published === false || row?.is_published === "0";
              const isArchived = row?.status === "archived" || row?.status === "deleted";
              return !isDraft && !isArchived && (row?.status === "active" || !row?.status);
            });
        setVacancies(publicList);

        // Only pick an "active" vacancy when the URL points to one
        if (vacancyId) {
          const targetSlug = vacancyId.toLowerCase();
          const targetRaw = rawVacancy.toLowerCase();
          const cleanVacDigits = vacancyId.replace(/^vac/i, "");
          const exact = projRows.find((p: any) => {
            const pPubId = String(p.public_id || p.publicId || "");
            const pSlug = String(p.slug || "").toLowerCase();
            const pRoleSlug = String(p.role_slug || "").toLowerCase();
            const rNameTrans = p.role_name ? transliterateToSlug(p.role_name).toLowerCase() : "";
            const rNameTrans2 = p.roleName ? transliterateToSlug(p.roleName).toLowerCase() : "";

            return (
              (pPubId && (pPubId === vacancyId || pPubId === cleanVacDigits)) ||
              (pSlug && (pSlug === targetSlug || pSlug === targetRaw)) ||
              (pRoleSlug && (pRoleSlug === targetSlug || pRoleSlug === targetRaw)) ||
              p.id === vacancyId ||
              (rNameTrans && (rNameTrans === targetSlug || rNameTrans === targetRaw)) ||
              (rNameTrans2 && (rNameTrans2 === targetSlug || rNameTrans2 === targetRaw))
            );
          }) || null;
          setSelectedRaw(exact);
          setSelectedVacancy(exact ? mapDbProjectToUi(activeCompany)(exact) : null);
        } else {
          setSelectedVacancy(null);
          setSelectedRaw(null);
        }
      } else {
        setVacancies([]);
        setSelectedVacancy(null);
        setSelectedRaw(null);
      }
    } catch (err) {
      console.error("Error loading company landing details:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [path, companySlug, vacancyId]);

  // Initiate chatbot message when active vacancy loads
  useEffect(() => {
    if (selectedVacancy) {
      setMessages([
        {
          sender: "recruiter",
          text: `Привет! Я — твой интерактивный карьерный ИИ-консультант в компании "${company?.name || selectedVacancy.companyName}". 🤖 Я досконально знаю всё о вакансии "${selectedVacancy.roleName}". Оплата составляет: ${selectedVacancy.salaryTerms || "договорная"}. Спроси меня о графике, задачах или возможностях роста, и я тотчас отвечу! После беседы жми "Пройти собеседование", чтобы начать интерактивный блиц-тест.`,
          timestamp: new Date().toLocaleTimeString()
        }
      ]);
    }
  }, [selectedVacancy, company]);

  // Scroll chatbot down
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSendMessage = async (customText?: string) => {
    const questionText = customText || userQuestion;
    if (!questionText.trim() || !selectedVacancy) return;

    // Add user message
    const userMsg: Message = {
      sender: "candidate",
      text: questionText,
      timestamp: new Date().toLocaleTimeString()
    };

    setMessages(prev => [...prev, userMsg]);
    if (!customText) setUserQuestion("");
    setIsAiTyping(true);

    try {
      const { aiChat } = await import("@/lib/aiClient");
      const history = messages.map(m => ({
        role: (m.sender === "candidate" ? "user" : "assistant") as "user" | "assistant",
        content: m.text,
      }));
      const context = `Вакансия: ${selectedVacancy.roleName}; Компания: ${selectedVacancy.companyName}; Условия: ${selectedVacancy.salaryTerms || ""} / ${selectedVacancy.scheduleTerms || ""}; База: ${selectedVacancy.customWiki || ""}`;
      const reply = await aiChat({
        kind: "vacancy_consultant",
        project_id: selectedVacancy.id,
        context,
        messages: [...history, { role: "user", content: questionText }],
      });
      const aiMsg: Message = {
        sender: "recruiter",
        text: reply || "Извините, ИИ-консультант временно недоступен.",
        timestamp: new Date().toLocaleTimeString()
      };
      setMessages(prev => [...prev, aiMsg]);
    } catch (err) {
      console.error("Failed to fetch response:", err);
    } finally {
      setIsAiTyping(false);
    }
  };

  // Candidate auth success → navigate to candidate profile bound to this vacancy.
  const handleCandidateAuthSuccess = (
    publicId: string,
    info?: { candidatePub?: string; projectPub?: string; companyPub?: string },
  ) => {
    const activeProject = selectedVacancy || vacancies[0];
    setShowApplyModal(false);

    const rawCompanyPub = info?.companyPub
      || (company as any)?.public_id
      || (company as any)?.publicId
      || (activeProject as any)?.company_public_id
      || (activeProject as any)?.companyPublicId
      || (activeProject as any)?.companySlug
      || companySlug
      || null;
    const rawProjectPub = info?.projectPub
      || (activeProject as any)?.public_id
      || (activeProject as any)?.publicId
      || (activeProject as any)?.slug
      || null;
    const rawCandPub = info?.candidatePub || publicId;

    const cleanComp = rawCompanyPub ? String(rawCompanyPub).replace(/^com/i, "").trim() : "";
    const cleanProj = rawProjectPub ? String(rawProjectPub).replace(/^vac/i, "").trim() : "";
    const cleanCand = rawCandPub ? String(rawCandPub).replace(/^candidate/i, "").replace(/^cand/i, "").trim() : "";

    if (cleanComp && cleanProj && cleanCand) {
      navigate(`/com${cleanComp}/vac${cleanProj}/cand${cleanCand}/profile`);
      return;
    }
    if (cleanCand) {
      navigate(`/cand${cleanCand}/profile`);
      return;
    }
  };

  const handleApplyOnboarding = async (e: React.FormEvent) => {
    e.preventDefault();
  };

  // Format dynamic raw content helper
  const renderFormattedText = (rawText: string) => {
    if (!rawText) return null;
    const normalized = String(rawText)
      .replace(/\\r\\n/g, "\n")
      .replace(/\\n/g, "\n")
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n");
    const rawLines = normalized.split("\n");
    const lines: string[] = [];
    for (const l of rawLines) {
      const trimmed = l.trim();
      if (!trimmed) continue;
      if (trimmed.includes("• ") && trimmed.indexOf("• ") !== trimmed.lastIndexOf("• ")) {
        const parts = trimmed.split(/(?=\s*•\s+)/).map((p) => p.trim()).filter(Boolean);
        lines.push(...parts);
      } else {
        lines.push(trimmed);
      }
    }
    return (
      <div className="space-y-3.5 text-sm md:text-base text-slate-100 leading-relaxed text-left font-sans">
        {lines.map((line, ix) => {
          const trimmed = line.trim();
          if (!trimmed) return <div key={ix} className="h-2.5" />;
          
          if (trimmed.startsWith("-") || trimmed.startsWith("*") || trimmed.startsWith("•")) {
            const content = trimmed.replace(/^[•\s-*]+/, "").trim();
            return (
              <div key={ix} className="flex items-start gap-2.5 pl-2">
                <span
                  className="landing-bullet-dot mt-2 w-2 h-2 rounded-full shrink-0 select-none shadow-sm"
                  style={{ backgroundColor: effectiveTheme?.iconColor || "#E7C768" }}
                />
                <span className="text-sm md:text-base">{content}</span>
              </div>
            );
          }
          
          if (/^\d+\./.test(trimmed)) {
            const firstDot = trimmed.indexOf(".");
            const num = trimmed.substring(0, firstDot + 1);
            const content = trimmed.substring(firstDot + 1).trim();
            return (
              <div key={ix} className="flex items-start gap-2.5 pl-2">
                <span
                  className="font-bold font-mono select-none text-sm md:text-base"
                  style={{ color: effectiveTheme?.iconColor || "#E7C768" }}
                >
                  {num}
                </span>
                <span className="text-sm md:text-base">{content}</span>
              </div>
            );
          }
          
          return <p key={ix} className="whitespace-pre-line text-sm md:text-base">{line}</p>;
        })}
      </div>
    );
  };

  if (loading) {
    const pageDesktopMedia = effectiveTheme.pageBgMediaUrl || effectiveTheme.pageBgImageUrl;
    const pageMobileMedia = effectiveTheme.pageBgMobileMediaUrl;
    const isPageDesktopVideo = isVideoUrl(pageDesktopMedia);
    const isPageMobileVideo = isVideoUrl(pageMobileMedia);
    const pageVideoAutoplay = effectiveTheme.pageBgVideoAutoplay !== false;
    const pageVideoLoop = effectiveTheme.pageBgVideoLoop !== false;
    const pageDisplayMode = effectiveTheme.pageBgDisplayMode || "fixed";

    return (
      <div
        id="company-landing-root"
        className="company-landing-root bg-[#17344F] min-h-screen text-white font-sans antialiased flex flex-col justify-center items-center relative overflow-hidden p-4"
      >
        {/* 1. Base Static Background / Color Layer */}
        <div
          className={`landing-page-bg landing-page-media fixed inset-0 pointer-events-none z-0 ${(effectiveTheme.allMediaMonochrome || effectiveTheme.pageBgMonochrome) ? "grayscale" : ""}`}
          style={{
            backgroundColor: effectiveTheme.pageBgColor || "#17344F",
            opacity: (effectiveTheme.pageBgOpacity ?? 100) / 100,
            backgroundImage:
              pageDesktopMedia && !isPageDesktopVideo && pageDisplayMode !== "parallax" && pageDisplayMode !== "none"
                ? `url('${pageDesktopMedia}')`
                : undefined,
            backgroundSize: pageDisplayMode === "tile" ? "auto" : "cover",
            backgroundRepeat: pageDisplayMode === "tile" ? "repeat" : "no-repeat",
            backgroundPosition: "center top",
            backgroundAttachment: pageDisplayMode === "fixed" ? "fixed" : "scroll",
          }}
        />

        {/* 1b. Mobile image override if not video */}
        {pageMobileMedia && !isPageMobileVideo && pageDisplayMode !== "none" && (
          <div
            className={`landing-page-bg landing-page-media fixed inset-0 pointer-events-none z-0 block md:hidden ${(effectiveTheme.allMediaMonochrome || effectiveTheme.pageBgMonochrome) ? "grayscale" : ""}`}
            style={{
              backgroundImage: `url('${pageMobileMedia}')`,
              backgroundSize: pageDisplayMode === "tile" ? "auto" : "cover",
              backgroundRepeat: pageDisplayMode === "tile" ? "repeat" : "no-repeat",
              backgroundPosition: "center top",
              backgroundAttachment: pageDisplayMode === "fixed" ? "fixed" : "scroll",
            }}
          />
        )}

        {/* 1c. Background Video Layer */}
        {(isPageDesktopVideo || isPageMobileVideo) && pageDisplayMode !== "none" && (
          <div className={`landing-page-bg landing-page-media fixed inset-0 pointer-events-none z-0 overflow-hidden ${(effectiveTheme.allMediaMonochrome || effectiveTheme.pageBgMonochrome) ? "grayscale" : ""}`}>
            {isPageDesktopVideo && (
              <video
                src={pageDesktopMedia}
                autoPlay={pageVideoAutoplay}
                muted
                loop={pageVideoLoop}
                playsInline
                className={`w-full h-full object-cover ${(effectiveTheme.allMediaMonochrome || effectiveTheme.pageBgMonochrome) ? "grayscale" : ""} ${pageMobileMedia ? "hidden md:block" : "block"}`}
              />
            )}
            {pageMobileMedia && (
              isPageMobileVideo ? (
                <video
                  src={pageMobileMedia}
                  autoPlay={pageVideoAutoplay}
                  muted
                  loop={pageVideoLoop}
                  playsInline
                  className={`w-full h-full object-cover block md:hidden ${(effectiveTheme.allMediaMonochrome || effectiveTheme.pageBgMonochrome) ? "grayscale" : ""}`}
                />
              ) : (
                <img
                  src={pageMobileMedia}
                  alt="Mobile Page Background"
                  referrerPolicy="no-referrer"
                  className={`w-full h-full object-cover block md:hidden ${(effectiveTheme.allMediaMonochrome || effectiveTheme.pageBgMonochrome) ? "grayscale" : ""}`}
                />
              )
            )}
          </div>
        )}

        {/* 2. Dynamic Background Waves and/or 3D Neuron Sphere & Radar Animation */}
        {(effectiveTheme.showWaveAnimation !== false || Boolean(effectiveTheme.showSphereAnimation)) && (
          <div className={`landing-interactive-bg fixed inset-0 pointer-events-none z-0 overflow-hidden ${(effectiveTheme.allMediaMonochrome || effectiveTheme.pageBgMonochrome) ? "grayscale" : ""}`}>
            <InteractiveLandingBackground
              showBadges={false}
              showWaves={effectiveTheme.showWaveAnimation !== false}
              showSphere={Boolean(effectiveTheme.showSphereAnimation)}
              themeColors={{
                headingColor: effectiveTheme.headingsSolidColor,
                bodyTextColor: effectiveTheme.bodyTextColor,
                boldTextColor: effectiveTheme.boldTextColor,
                iconColor: effectiveTheme.iconColor,
                headingsColorMode: effectiveTheme.headingsColorMode,
                isMonochrome: Boolean(effectiveTheme.allMediaMonochrome || effectiveTheme.pageBgMonochrome),
              }}
            />
          </div>
        )}

        {/* Liquid Glass Apple Center Loading Card */}
        <div className="liquid-glass-card section-card relative z-10 w-full max-w-md p-8 rounded-2xl border border-white/20 backdrop-blur-2xl bg-transparent shadow-2xl flex flex-col items-center text-center gap-4">
          <div className="relative flex items-center justify-center w-14 h-14">
            <div className="absolute inset-0 rounded-full bg-[#E7C768]/15 animate-ping pointer-events-none" />
            <Loader2 className="w-9 h-9 animate-spin text-[#E7C768]" />
          </div>
          
          <div className="space-y-1.5">
            <h3 className="text-lg font-semibold tracking-tight text-white bg-gradient-to-r from-amber-200 via-yellow-400 to-amber-200 bg-clip-text text-transparent">
              Загрузка сайта вакансии
            </h3>
            <p className="text-sm text-slate-300">
              Подготовка актуальных вакансий и персонализированного контента...
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Fallback default company if not loaded
  const displayCompany = company || {
    name: 'ООО "Рога и Копыта"',
    industry: "Торговля и дистрибьюция",
    staff: "15-50 человек",
    description: "Ведущее предприятие в сфере поставок сырья и заготовок.",
    sites: "https://hr-rr.online",
    logoUrl: ""
  };

  const pageDesktopMedia = effectiveTheme.pageBgMediaUrl || effectiveTheme.pageBgImageUrl;
  const pageMobileMedia = effectiveTheme.pageBgMobileMediaUrl;
  const isPageDesktopVideo = isVideoUrl(pageDesktopMedia);
  const isPageMobileVideo = isVideoUrl(pageMobileMedia);
  const pageVideoAutoplay = effectiveTheme.pageBgVideoAutoplay !== false;
  const pageVideoLoop = effectiveTheme.pageBgVideoLoop !== false;
  const pageDisplayMode = effectiveTheme.pageBgDisplayMode || "fixed";

  return (
    <div
      id="company-landing-root"
      className="company-landing-root bg-[#17344F] min-h-screen text-white font-sans antialiased flex flex-col justify-between relative overflow-x-hidden"
    >
      {/* 1. Base Static Background / Color Layer (z-0) */}
      <div
        className={`landing-page-bg landing-page-media fixed inset-0 pointer-events-none z-0 ${(effectiveTheme.allMediaMonochrome || effectiveTheme.pageBgMonochrome) ? "grayscale" : ""}`}
        style={{
          backgroundColor: effectiveTheme.pageBgColor || "#17344F",
          opacity: (effectiveTheme.pageBgOpacity ?? 100) / 100,
          backgroundImage:
            pageDesktopMedia && !isPageDesktopVideo && pageDisplayMode !== "parallax" && pageDisplayMode !== "none"
              ? `url('${pageDesktopMedia}')`
              : undefined,
          backgroundSize: pageDisplayMode === "tile" ? "auto" : "cover",
          backgroundRepeat: pageDisplayMode === "tile" ? "repeat" : "no-repeat",
          backgroundPosition: "center top",
          backgroundAttachment: pageDisplayMode === "fixed" ? "fixed" : "scroll",
        }}
      />

      {/* 1b. Mobile image override if not video (z-0) */}
      {pageMobileMedia && !isPageMobileVideo && pageDisplayMode !== "none" && (
        <div
          className={`landing-page-bg landing-page-media fixed inset-0 pointer-events-none z-0 block md:hidden ${(effectiveTheme.allMediaMonochrome || effectiveTheme.pageBgMonochrome) ? "grayscale" : ""}`}
          style={{
            backgroundImage: `url('${pageMobileMedia}')`,
            backgroundSize: pageDisplayMode === "tile" ? "auto" : "cover",
            backgroundRepeat: pageDisplayMode === "tile" ? "repeat" : "no-repeat",
            backgroundPosition: "center top",
            backgroundAttachment: pageDisplayMode === "fixed" ? "fixed" : "scroll",
          }}
        />
      )}

      {/* 1c. Background Video Layer (Desktop & Mobile) (z-0) */}
      {(isPageDesktopVideo || isPageMobileVideo) && pageDisplayMode !== "none" && (
        <div className={`landing-page-bg landing-page-media fixed inset-0 pointer-events-none z-0 overflow-hidden ${(effectiveTheme.allMediaMonochrome || effectiveTheme.pageBgMonochrome) ? "grayscale" : ""}`}>
          {/* Desktop Video */}
          {isPageDesktopVideo && (
            <video
              src={pageDesktopMedia}
              autoPlay={pageVideoAutoplay}
              muted
              loop={pageVideoLoop}
              playsInline
              className={`w-full h-full object-cover ${(effectiveTheme.allMediaMonochrome || effectiveTheme.pageBgMonochrome) ? "grayscale" : ""} ${pageMobileMedia ? "hidden md:block" : "block"}`}
            />
          )}
          {/* Mobile Video / Image */}
          {pageMobileMedia && (
            isPageMobileVideo ? (
              <video
                src={pageMobileMedia}
                autoPlay={pageVideoAutoplay}
                muted
                loop={pageVideoLoop}
                playsInline
                className={`w-full h-full object-cover block md:hidden ${(effectiveTheme.allMediaMonochrome || effectiveTheme.pageBgMonochrome) ? "grayscale" : ""}`}
              />
            ) : (
              <img
                src={pageMobileMedia}
                alt="Mobile Page Background"
                referrerPolicy="no-referrer"
                className={`w-full h-full object-cover block md:hidden ${(effectiveTheme.allMediaMonochrome || effectiveTheme.pageBgMonochrome) ? "grayscale" : ""}`}
              />
            )
          )}
        </div>
      )}

      {/* 2. Parallax background image layer (z-[1]) */}
      {pageDesktopMedia && !isPageDesktopVideo && pageDisplayMode === "parallax" && (
        <div className={`landing-page-bg landing-page-media fixed inset-0 pointer-events-none z-[1] overflow-hidden ${(effectiveTheme.allMediaMonochrome || effectiveTheme.pageBgMonochrome) ? "grayscale" : ""}`}>
          <div
            style={{
              backgroundImage: `url('${pageDesktopMedia}')`,
              backgroundSize: "cover",
              backgroundPosition: "center top",
              transform: `translate3d(0, ${-scrollY * (effectiveTheme.pageBgParallaxSpeed ?? 0.35)}px, 0)`,
              willChange: "transform",
            }}
            className={`absolute inset-x-0 -top-[35vh] -bottom-[35vh] w-full ${(effectiveTheme.allMediaMonochrome || effectiveTheme.pageBgMonochrome) ? "grayscale" : ""} ${pageMobileMedia ? "hidden md:block" : "block"}`}
          />
          {pageMobileMedia && !isPageMobileVideo && (
            <div
              style={{
                backgroundImage: `url('${pageMobileMedia}')`,
                backgroundSize: "cover",
                backgroundPosition: "center top",
                transform: `translate3d(0, ${-scrollY * (effectiveTheme.pageBgParallaxSpeed ?? 0.35)}px, 0)`,
                willChange: "transform",
              }}
              className={`absolute inset-x-0 -top-[35vh] -bottom-[35vh] w-full block md:hidden ${(effectiveTheme.allMediaMonochrome || effectiveTheme.pageBgMonochrome) ? "grayscale" : ""}`}
            />
          )}
        </div>
      )}

      {/* 3. Dynamic Background Waves and/or 3D Neuron Sphere & Radar Animation (z-[2]) */}
      {(effectiveTheme.showWaveAnimation !== false || Boolean(effectiveTheme.showSphereAnimation)) && (
        <div className={`landing-interactive-bg fixed inset-0 pointer-events-none z-[2] overflow-hidden ${(effectiveTheme.allMediaMonochrome || effectiveTheme.pageBgMonochrome) ? "grayscale" : ""}`}>
          <InteractiveLandingBackground
            showBadges={false}
            showWaves={effectiveTheme.showWaveAnimation !== false}
            showSphere={Boolean(effectiveTheme.showSphereAnimation)}
            themeColors={{
              headingColor: effectiveTheme.headingsSolidColor,
              bodyTextColor: effectiveTheme.bodyTextColor,
              boldTextColor: effectiveTheme.boldTextColor,
              iconColor: effectiveTheme.iconColor,
              headingsColorMode: effectiveTheme.headingsColorMode,
              isMonochrome: Boolean(effectiveTheme.allMediaMonochrome || effectiveTheme.pageBgMonochrome),
            }}
          />
        </div>
      )}

      {/* 3b. Page Background Color Filter Overlay Layer (z-[3]) */}
      <div className="landing-page-filter-layer fixed inset-0 pointer-events-none z-[3]" />

      <h1 className="sr-only">
        {selectedVacancy?.roleName
          ? `${selectedVacancy.roleName} — ${displayCompany.name}`
          : displayCompany.name}
      </h1>

      {/* Dynamic Header */}
      <header className="sticky top-0 z-40 bg-[#17344F]/95 backdrop-blur-md border-b border-[#265582]/40 py-2 landing-header relative overflow-hidden">
        {/* Header Background Filter Layer */}
        <div className="landing-header-filter-layer absolute inset-0 pointer-events-none z-0" />

        <div className="max-w-7xl mx-auto w-full px-4 md:px-8 relative z-[1]">
          <div className="flex items-center justify-between gap-4 py-2">
            {/* Logo field */}
            <div
              className="flex items-center gap-3 cursor-pointer shrink-0"
              onClick={() => navigate(getCompanyUrl())}
              title="На страницу компании"
            >
              <div
                className="landing-header-logo-container relative rounded-xl overflow-hidden flex items-center justify-center p-0.5"
                style={{
                  backgroundColor: (effectiveTheme.logoBgOpacity ?? 0) > 0 && effectiveTheme.logoBgColor
                    ? hexToRgba(effectiveTheme.logoBgColor, effectiveTheme.logoBgOpacity ?? 0)
                    : undefined,
                }}
              >
                <RRImage
                  src={company?.logo_url || selectedVacancy?.logoUrl || DEFAULT_RR_LOGO_URL}
                  w={48}
                  alt={company?.name || "Logo"}
                  className={`w-12 h-12 object-contain bg-transparent border-0 p-0 shadow-none relative z-[1] ${isPngImage(company?.logo_url || selectedVacancy?.logoUrl || DEFAULT_RR_LOGO_URL) ? "landing-logo-png-filter" : "landing-logo-nofilter"}`}
                  referrerPolicy="no-referrer"
                  fallback={
                    <div className="w-12 h-12 flex items-center justify-center bg-transparent border-0">
                      <Building className="w-6 h-6 text-[#F5D67A]" />
                    </div>
                  }
                />
                {(effectiveTheme.logoFilterOpacity ?? 0) > 0 && effectiveTheme.logoFilterColor && (
                  <div
                    className="landing-header-logo-filter-overlay absolute inset-0 pointer-events-none z-[2]"
                    style={{
                      backgroundColor: hexToRgba(effectiveTheme.logoFilterColor, effectiveTheme.logoFilterOpacity ?? 0),
                      WebkitMaskImage: `url("${company?.logo_url || selectedVacancy?.logoUrl || DEFAULT_RR_LOGO_URL}")`,
                      maskImage: `url("${company?.logo_url || selectedVacancy?.logoUrl || DEFAULT_RR_LOGO_URL}")`,
                      WebkitMaskSize: "contain",
                      maskSize: "contain",
                      WebkitMaskRepeat: "no-repeat",
                      maskRepeat: "no-repeat",
                      WebkitMaskPosition: "center",
                      maskPosition: "center",
                    }}
                  />
                )}
              </div>
              {company?.name && (
                <span className="hidden sm:block text-sm font-extrabold text-white truncate max-w-[220px]">{company.name}</span>
              )}
            </div>

            {/* Desktop Tabs menu centered */}
            {selectedVacancy && (
              <div className="hidden md:flex items-center gap-2 overflow-x-auto select-none py-1">
                {visibleTabs.map((tb) => {
                  const isActive = subTab === tb.key;
                  return (
                    <button
                      key={tb.key}
                      onClick={() => navigate(getVacancyTabUrl(selectedVacancy, tb.key))}
                      className={`transition px-3.5 py-1.5 text-sm font-bold border cursor-pointer whitespace-nowrap backdrop-blur-md ${
                        isActive
                          ? "landing-btn-active shadow"
                          : "landing-btn-inactive hover:border-white/50"
                      }`}
                    >
                      {tb.label}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Desktop Tabs for company landing (no vacancy selected) */}
            {!selectedVacancy && showCompanyTabs && (
              <div className="hidden md:flex items-center gap-2 overflow-x-auto select-none py-1">
                {companyNavItems.map((it) => (
                  <button
                    key={it.id}
                    onClick={() => scrollToSection(it.id)}
                    className="landing-btn-inactive transition px-3.5 py-1.5 text-sm font-bold border hover:border-white/50 backdrop-blur-md cursor-pointer whitespace-nowrap"
                  >
                    {it.label}
                  </button>
                ))}
              </div>
            )}

            {/* Right block: Employer Cabinet Return & Style Editor (only on company mirror /com... or with edit_theme param, hidden on public vanity mirrors) & Mobile Hamburger */}
            <div className="flex items-center gap-2 shrink-0">
              {isCompanyMirror && (
                <>
                  <button
                    onClick={() => setIsStyleEditorOpen((prev) => !prev)}
                    className="landing-header-btn landing-btn-inactive flex items-center gap-1.5 px-3 py-1.5 border hover:border-[#E7C768] text-sm font-bold transition shadow-sm cursor-pointer whitespace-nowrap"
                    title="Открыть редактор стилей лендинга"
                  >
                    <Palette className="w-4 h-4 text-[#E7C768]" />
                    <span className="hidden sm:inline">Редактор</span>
                  </button>

                  <button
                    onClick={handleGoToCabinet}
                    className="landing-header-btn landing-btn-inactive flex items-center gap-1.5 px-3 py-1.5 border hover:border-white/40 text-sm font-bold transition shadow-sm cursor-pointer whitespace-nowrap"
                    title="Вернуться в кабинет работодателя"
                  >
                    <ChevronLeft className="w-4 h-4 text-[#E7C768]" />
                    <span>В кабинет</span>
                  </button>
                </>
              )}

              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className={`landing-header-btn landing-btn-inactive ${(selectedVacancy || showCompanyTabs) ? "md:hidden" : "hidden"} text-slate-300 hover:text-white p-2 border focus:outline-none transition shrink-0`}
              >
                {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5 animate-pulse" />}
              </button>
            </div>
          </div>

          {/* Mobile expandable hamburger menu drawer */}
          {menuOpen && (
            <div className="md:hidden py-3 border-t border-white/5 space-y-3 animate-fadeIn">
              {isCompanyMirror && (
                <div className="pb-2 border-b border-white/5 flex flex-col gap-2">
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      setIsStyleEditorOpen(true);
                    }}
                    className="landing-header-btn landing-btn-inactive w-full flex items-center justify-center gap-2 px-3.5 py-2.5 border text-[#E7C768] text-sm font-bold shadow transition"
                  >
                    <Palette className="w-4 h-4 text-[#E7C768]" />
                    <span>Редактор стилей</span>
                  </button>
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      handleGoToCabinet();
                    }}
                    className="landing-header-btn landing-btn-inactive w-full flex items-center justify-center gap-2 px-3.5 py-2.5 border text-white text-sm font-bold shadow transition"
                  >
                    <ChevronLeft className="w-4 h-4 text-[#E7C768]" />
                    <span>Вернуться в кабинет работодателя</span>
                  </button>
                </div>
              )}

              {selectedVacancy && (
                <div className="flex flex-col gap-1.5">
                  <span className="text-sm text-white/80 font-bold px-2 block mb-1">Разделы страницы:</span>
                  {visibleTabs.map((tb) => {
                    const isActive = subTab === tb.key;
                    return (
                      <button
                        key={tb.key}
                        onClick={() => {
                          setMenuOpen(false);
                          navigate(getVacancyTabUrl(selectedVacancy, tb.key));
                        }}
                        className={`w-full text-left transition px-3.5 py-2.5 text-sm font-bold border flex items-center justify-between backdrop-blur-md ${
                          isActive
                            ? "landing-btn-active shadow"
                            : "landing-btn-inactive hover:border-white/50"
                        }`}
                      >
                        <span>{tb.label}</span>
                        {isActive && <span className="w-2 h-2 rounded-full bg-current" />}
                      </button>
                    );
                  })}
                </div>
              )}

              {selectedVacancy && (
                <div className="pt-2 border-t border-white/10 font-sans">
                  <button
                    onClick={() => { setMenuOpen(false); setShowApplyModal(true); }}
                    className="w-full cursor-pointer border border-[#E7C768] text-white hover:border-white text-sm font-bold py-2.5 rounded-xl transition shadow-md text-center block bg-transparent backdrop-blur-md"
                  >
                    Войти / Регистрация 🔑
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Mobile expandable hamburger menu drawer — company landing view */}
          {menuOpen && !selectedVacancy && showCompanyTabs && (
            <div className="md:hidden py-3 border-t border-white/10 space-y-2 animate-fadeIn">
              <span className="text-sm text-white/80 font-bold px-2 block mb-1">Разделы страницы:</span>
              {companyNavItems.map((it) => (
                <button
                  key={it.id}
                  onClick={() => { setMenuOpen(false); scrollToSection(it.id); }}
                  className="w-full text-left transition px-3.5 py-2.5 text-sm font-bold rounded-xl border border-white/20 text-white/90 hover:border-white/50 bg-transparent backdrop-blur-md"
                >
                  {it.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-6xl mx-auto py-6 md:py-10 px-[2%] w-full flex-1 space-y-8 text-left overflow-x-hidden">
        
        {/* Centered Content Area */}
        <section className="space-y-6 text-left">
          
          {/* Unified company sections: shown on /com{slug} (no vacancy),
              and also on /com{slug}/vac{slug}/company so both routes look identical. */}
          {(!vacancyId || subTab === "company") && company && (
            <CompanySections
              company={company}
              vacancies={vacancies}
              companySlug={companySlug}
              hideStickyNav
              sitePreviewHeight={effectiveTheme.sitePreviewHeight}
              siteDisplayMode={effectiveTheme.siteDisplayMode}
              themeConfig={effectiveTheme}
              currentVacancy={vacancyId ? selectedVacancy : null}
              getVacancyUrl={(v) => getVacancyUrl(v)}
              onOpenVacancy={(v) =>
                navigate(getVacancyUrl(v))
              }
              onBackToVacancy={
                vacancyId && selectedVacancy
                  ? () =>
                      navigate(getVacancyTabUrl(selectedVacancy, "vacancy"))
                  : undefined
              }
            />
          )}

          {/* Active Job Vacancy presentation banner — only when a vacancy is in the URL
              AND we are NOT on the /company sub-tab (company view is handled above). */}
          {vacancyId && subTab !== "company" && selectedVacancy && (isCompanyMirror || (selectedRaw?.is_published && (selectedRaw?.status ?? "active") === "active")) ? (
            <div className="company-landing-hero landing-hero-card landing-hero-banner vacancy-hero-banner relative rounded-3xl overflow-hidden border border-white/20 shadow-2xl bg-transparent backdrop-blur-2xl">
              {(() => {
                const heroDesktopMedia = effectiveTheme?.heroBgMediaUrl || effectiveTheme?.heroBgImageUrl;
                const heroMobileMedia = effectiveTheme?.heroBgMobileMediaUrl;
                const heroMode = effectiveTheme?.heroBgDisplayMode || "cover";
                if (heroMode === "none" || (!heroDesktopMedia && !heroMobileMedia)) return null;
                const isDeskVideo = /\.(mp4|webm|mov|m4v)(\?|$)/i.test(String(heroDesktopMedia || ""));
                const isMobVideo = /\.(mp4|webm|mov|m4v)(\?|$)/i.test(String(heroMobileMedia || ""));
                const imgCss = (url: string): React.CSSProperties => ({
                  backgroundImage: `url('${url}')`,
                  backgroundPosition: "center",
                  backgroundSize: heroMode === "tile" ? "auto" : "cover",
                  backgroundRepeat: heroMode === "tile" ? "repeat" : "no-repeat",
                  backgroundAttachment: heroMode === "fixed" ? "fixed" : "scroll",
                });
                return (
                  <div className="landing-hero-bg-layer landing-hero-bg absolute inset-0 pointer-events-none overflow-hidden rounded-3xl z-0">
                    {heroDesktopMedia && (
                      isDeskVideo ? (
                        <video
                          src={heroDesktopMedia}
                          autoPlay={effectiveTheme?.heroBgVideoAutoplay !== false}
                          muted
                          loop={effectiveTheme?.heroBgVideoLoop !== false}
                          playsInline
                          className={`landing-hero-media w-full h-full object-cover ${heroMobileMedia ? "hidden md:block" : "block"}`}
                        />
                      ) : (
                        <div style={imgCss(heroDesktopMedia)} className={`landing-hero-media w-full h-full ${heroMobileMedia ? "hidden md:block" : "block"}`} />
                      )
                    )}
                    {heroMobileMedia && (
                      isMobVideo ? (
                        <video
                          src={heroMobileMedia}
                          autoPlay={effectiveTheme?.heroBgVideoAutoplay !== false}
                          muted
                          loop={effectiveTheme?.heroBgVideoLoop !== false}
                          playsInline
                          className="landing-hero-media w-full h-full object-cover block md:hidden"
                        />
                      ) : (
                        <div style={imgCss(heroMobileMedia)} className="landing-hero-media w-full h-full block md:hidden" />
                      )
                    )}
                  </div>
                );
              })()}
              {(effectiveTheme?.heroBgDisplayMode || "cover") !== "none" && (
                <div className="landing-hero-filter-layer absolute inset-0 pointer-events-none z-0 rounded-3xl" />
              )}
              {/* Hero — фирменный Apple Liquid Glass */}
              <div className="relative z-[2] px-[2%] sm:px-6 md:px-10 pt-6 md:pt-10 pb-6 md:pb-8 overflow-hidden">
                <div className="relative flex flex-col sm:flex-row items-center sm:items-start text-center sm:text-left gap-4 md:gap-6">
                  <CompanyLandingLogo
                    src={company?.logo_url || selectedVacancy.logoUrl}
                    alt={company?.name || selectedVacancy.companyName || "Логотип"}
                    sizeClassName="w-28 h-28 sm:w-32 sm:h-32 md:w-40 md:h-40"
                    themeConfig={effectiveTheme}
                  />
                  <div className="min-w-0 flex-1 w-full">
                    <div className="flex items-center justify-center sm:justify-start gap-2 flex-wrap mb-2">
                      <span
                        className="landing-recruitment-badge landing-btn-active inline-flex items-center gap-1.5 text-sm font-bold px-3.5 py-1.5 shadow-sm transition"
                        style={{
                          backgroundColor: hexToRgba(effectiveTheme.btnActiveBgColor || "#E7C768", effectiveTheme.btnActiveOpacity ?? 100),
                          color: effectiveTheme.btnActiveTextColor || "#17344F",
                          WebkitTextFillColor: effectiveTheme.btnActiveTextColor || "#17344F",
                          borderColor: hexToRgba(effectiveTheme.btnBorderColor || "#FFFFFF", effectiveTheme.btnBorderOpacity ?? 20),
                          borderRadius: effectiveTheme.btnBorderRadius === 999 ? "9999px" : `${effectiveTheme.btnBorderRadius ?? 12}px`,
                          borderWidth: `${effectiveTheme.btnBorderWidth ?? 1}px`,
                          borderStyle: "solid",
                        }}
                      >
                        <span
                          className="w-1.5 h-1.5 rounded-full shrink-0 animate-pulse"
                          style={{ backgroundColor: effectiveTheme.btnActiveTextColor || "#17344F" }}
                        />
                        Идет ИИ-набор
                      </span>
                      {company?.name && (
                        <span className="text-sm text-white/80 font-semibold truncate max-w-[260px]">{company.name}</span>
                      )}
                    </div>
                    <h2 className="vacancy-role-title text-2xl md:text-4xl font-black leading-tight tracking-tight break-words">
                      {selectedVacancy.roleName}
                    </h2>
                  </div>
                </div>

                {/* Terms */}
                <div className="relative z-[1] grid grid-cols-1 sm:grid-cols-2 gap-3 mt-6">
                  {selectedVacancy.salaryTerms && (
                    <div className="vacancy-subcard flex items-center gap-3 bg-transparent backdrop-blur-xl p-3.5 rounded-2xl border border-white/20 min-w-0">
                      <div
                        className="w-9 h-9 rounded-xl bg-transparent backdrop-blur-md border border-white/20 flex items-center justify-center shrink-0"
                        style={{ color: effectiveTheme?.iconColor || "#E7C768" }}
                      >
                        <DollarSign className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm text-white/70 font-bold">Оплата</div>
                        <div className="text-sm font-bold text-white break-words">{selectedVacancy.salaryTerms}</div>
                      </div>
                    </div>
                  )}
                  {selectedVacancy.scheduleTerms && (
                    <div className="vacancy-subcard flex items-center gap-3 bg-transparent backdrop-blur-xl p-3.5 rounded-2xl border border-white/20 min-w-0">
                      <div
                        className="w-9 h-9 rounded-xl bg-transparent backdrop-blur-md border border-white/20 flex items-center justify-center shrink-0"
                        style={{ color: effectiveTheme?.iconColor || "#E7C768" }}
                      >
                        <Clock className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm text-white/70 font-bold">График</div>
                        <div className="text-sm font-bold text-white break-words">{selectedVacancy.scheduleTerms}</div>
                      </div>
                    </div>
                  )}
                </div>

                {(() => {
                  let vacSiteUrl = displayCompany?.website || "";
                  let vacSiteTitle: string | undefined;
                  if (!vacSiteUrl && displayCompany?.sites) {
                    try {
                      const arr = typeof displayCompany.sites === "string" ? JSON.parse(displayCompany.sites) : displayCompany.sites;
                      if (Array.isArray(arr) && arr.length > 0) {
                        const first = arr.find((s: any) => s && (typeof s === "string" ? s.trim() : s.url?.trim()));
                        if (first) {
                          vacSiteUrl = typeof first === "string" ? first : first.url;
                          vacSiteTitle = typeof first === "object" ? first.title : undefined;
                        }
                      } else if (typeof displayCompany.sites === "string") {
                        vacSiteUrl = displayCompany.sites;
                      }
                    } catch {
                      if (typeof displayCompany.sites === "string") vacSiteUrl = displayCompany.sites;
                    }
                  }
                  if (!vacSiteUrl) return null;
                  return (
                    <div className="relative z-[1] mt-4">
                      <SitePreview url={vacSiteUrl} title={vacSiteTitle} variant="compact" themeConfig={effectiveTheme} />
                    </div>
                  );
                })()}
              </div>

              <div className="px-[2%] sm:px-6 md:px-10 py-6 md:py-8 bg-transparent backdrop-blur-xl border-t border-white/20 space-y-5">

              {/* Tab render details */}
              <div className="space-y-3.5 text-left">
                <div className="flex items-center justify-between">
                  <span
                    className="text-xs font-bold tracking-wide flex items-center gap-1.5 font-mono"
                    style={{ color: effectiveTheme?.iconColor || "#E7C768" }}
                  >
                    {(() => {
                      switch (subTab) {
                        case "motivation": return "🔥 Раздел: Мотивация и преимущества";
                        case "company": return "🏢 Раздел: О компании";
                        case "onboarding": return "🚀 Раздел: Оформление и адаптация";
                        case "payouts": return "💵 Раздел: Схема выплат";
                        case "schedule": return "📅 Раздел: График и тайм-слоты";
                        case "team": return "👥 Раздел: Наша Команда";
                        case "system": return "⚙️ Раздел: ИИ-Система РобоРекрут";
                        case "vacancy":
                        default: return "💼 Раздел: Детали вакансии и требования";
                      }
                    })()}
                  </span>
                </div>

                <Reveal key={subTab} direction="up" className="vacancy-subcard bg-transparent backdrop-blur-xl p-[2%] sm:p-4 md:p-6 rounded-2xl border border-white/20 shadow-inner">
                  {(() => {
                    switch (subTab) {
                      case "motivation":
                        return <MotivationView project={selectedVacancy} themeConfig={effectiveTheme} />;
                      case "company":
                        return <CompanyView project={{ ...selectedVacancy, companyText: selectedVacancy.companyText || displayCompany.description }} themeConfig={effectiveTheme} />;
                      case "onboarding":
                        return <OnboardingView project={selectedVacancy} themeConfig={effectiveTheme} />;
                      case "payouts":
                        return <PayoutsView project={selectedVacancy} themeConfig={effectiveTheme} />;
                      case "schedule":
                        return <ScheduleView project={{ ...selectedVacancy, scheduleText: selectedVacancy.scheduleText || selectedVacancy.scheduleTerms }} themeConfig={effectiveTheme} />;
                      case "team":
                        return <TeamView project={selectedVacancy} themeConfig={effectiveTheme} />;
                      case "system":
                        return <SystemView project={selectedVacancy} themeConfig={effectiveTheme} />;
                      case "vacancy":
                      default:
                        return <VacancyView project={selectedVacancy} themeConfig={effectiveTheme} />;
                    }
                  })()}
                </Reveal>
              </div>

              <button
                onClick={() => {
                  setShowApplyModal(true);
                }}
                className="w-full landing-btn-active font-extrabold text-sm md:text-base py-4 transition shadow-xl flex items-center justify-center gap-2 cursor-pointer"
              >
                Начать отбор в компанию <ChevronRight className="w-4 h-4" />
              </button>
              </div>

            </div>
          ) : vacancyId && subTab !== "company" && selectedRaw ? (
            <div className="section-card bg-transparent backdrop-blur-2xl border border-[#E7C768]/40 p-8 rounded-3xl text-center space-y-3">
              <AlertCircle className="w-10 h-10 mx-auto text-[#E7C768]" />
              <h3 className="font-bold text-white text-lg">
                {(selectedRaw?.status === "deleted")
                  ? "Эта вакансия закрыта"
                  : "Эта вакансия больше не активна"}
              </h3>
              <p className="text-sm text-white/90">
                Компания временно приостановила набор по этой позиции. Откликнуться на неё нельзя.
              </p>
              <button
                onClick={() => navigate(getCompanyUrl())}
                className="landing-btn-active inline-flex items-center gap-2 bg-[#E7C768] text-[#17344F] font-bold text-sm px-5 py-2.5 rounded-xl hover:brightness-105 transition cursor-pointer"
              >
                Смотреть другие вакансии компании <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          ) : vacancyId && subTab !== "company" ? (
            <div className="section-card bg-transparent backdrop-blur-2xl border border-white/25 p-8 rounded-3xl text-center space-y-2">
              <AlertCircle className="w-8 h-8 mx-auto text-[#E7C768]" />
              <h3 className="font-bold text-white text-base">Список вакансий пуст</h3>
              <p className="text-sm text-white/80">Наш робот подбирает новые должности. Пожалуйста, загляните позже.</p>
            </div>
          ) : null}

          {/* Другие активные вакансии этой компании — исключаем текущую и не показываем на подстраницах вакансии. */}
          {(() => {
            const isVacancySubpage = ["schedule", "motivation", "payouts", "onboarding", "team", "system"].includes(subTab);
            if (!vacancyId || subTab === "company" || isVacancySubpage) return null;
            const others = vacancies.filter((v) => v.id !== selectedVacancy?.id);
            if (others.length === 0) return null;
            return (
              <div className="space-y-5 pt-8 border-t border-white/20 mt-10">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm">🎯</span>
                  <h3 className="text-base font-bold text-white/90">
                    Другие открытые вакансии компании ({others.length})
                  </h3>
                </div>
                <div className="flex flex-col gap-4 md:gap-5">
                  {others.map((v, vIdx) => (
                    <VacancyCard
                      key={`${v.id}-${vIdx}`}
                      layout="horizontal"
                      href={getVacancyUrl(v)}
                      vacancy={{
                        ...v,
                        id: v.id,
                        public_id: (v as any).public_id || (v as any).publicId,
                        publicId: (v as any).publicId || (v as any).public_id,
                        slug: (v as any).slug,
                        role_slug: (v as any).role_slug,
                        roleName: v.roleName,
                        companyName: company?.name || null,
                        companyLogo: company?.logo_url || v.logoUrl || null,
                        industry: (company as any)?.industry || null,
                        salaryTerms: v.salaryTerms || null,
                        scheduleTerms: v.scheduleTerms || null,
                        vacancyText: v.vacancyText || null,
                      }}
                      showCompany={false}
                      themeConfig={effectiveTheme}
                      onOpen={() => navigate(getVacancyUrl(v))}
                    />
                  ))}
                </div>
              </div>
            );
          })()}

        </section>

      </main>

      {/* Candidate email auth modal — only meaningful when a vacancy is selected */}
      {selectedVacancy && selectedRaw?.is_published && (selectedRaw?.status ?? "active") === "active" && (
        <CandidateAuthModal
          isOpen={showApplyModal}
          onClose={() => setShowApplyModal(false)}
          projectId={selectedVacancy.id}
          companyId={company?.id || null}
          roleName={selectedVacancy.roleName}
          companyName={company?.name || selectedVacancy.companyName}
          onSuccess={handleCandidateAuthSuccess}
          themeConfig={effectiveTheme}
        />
      )}

      {/* Employer registration & login modal */}
      <AuthModal
        isOpen={isEmployerAuthModalOpen}
        onClose={() => setIsEmployerAuthModalOpen(false)}
        intent="employer"
        initialMode="login"
      />

      {/* Floating AI Assistant — company-wide knowledge base */}
      {company && (
        <VacancyAIAssistant
          projectId={selectedVacancy?.id}
          roleName={selectedVacancy?.roleName || null}
          companyName={company?.name || null}
          companySlug={company?.slug || company?.allslug || undefined}
          companyId={company?.id || company?.public_id || undefined}
          vacancySlug={selectedVacancy?.slug || (selectedVacancy as any)?.roleSlug || undefined}
          logoUrl={company?.logo_url || null}
          themeConfig={effectiveTheme}
          containerBorderRadius={effectiveTheme.containerBorderRadius}
          logoFilterColor={effectiveTheme.logoFilterColor}
          logoFilterOpacity={effectiveTheme.logoFilterOpacity}
          logoBgColor={effectiveTheme.logoBgColor}
          logoBgOpacity={effectiveTheme.logoBgOpacity}
          themeColors={{
            headingColor: effectiveTheme.headingsSolidColor,
            bodyTextColor: effectiveTheme.bodyTextColor,
            boldTextColor: effectiveTheme.boldTextColor,
            iconColor: effectiveTheme.iconColor,
            headingsColorMode: effectiveTheme.headingsColorMode,
          }}
          context={(() => {
            const c: any = company || {};
            const parts: string[] = [`Компания: ${c.name || ""}`];
            if (c.industry) parts.push(`Отрасль: ${c.industry}`);
            if (c.website) parts.push(`Сайт: ${c.website}`);
            if (c.staff) parts.push(`Штат: ${c.staff}`);
            if (c.description_text) parts.push(`О компании:\n${c.description_text}`);
            if (c.mission_text) parts.push(`Миссия:\n${c.mission_text}`);
            if (c.products_text) parts.push(`Продукты:\n${c.products_text}`);
            if (c.about_text) parts.push(`Подробнее:\n${c.about_text}`);
            if (c.team_text) parts.push(`Команда:\n${c.team_text}`);
            if (c.payouts_text) parts.push(`Выплаты:\n${c.payouts_text}`);
            if (c.schedule_text) parts.push(`График:\n${c.schedule_text}`);
            if (c.system_text) parts.push(`Система работы:\n${c.system_text}`);
            if (vacancies.length) {
              parts.push(`Открытые вакансии (${vacancies.length}):\n` +
                vacancies.map((v: any) => `• ${v.roleName}${v.salaryTerms ? ` — ${v.salaryTerms}` : ""}${v.scheduleTerms ? `, ${v.scheduleTerms}` : ""}`).join("\n"));
            }
            return `Отвечай ТОЛЬКО на основе этих данных о компании и её вакансиях. Если в данных нет ответа — честно скажи, что уточнишь у работодателя.\n\n${parts.join("\n\n")}`;
          })()}
        />
      )}

      {/* Floating employer-only Visual Style & CSS Editor */}
      {company && (
        <LandingStyleEditor
          company={company}
          isOpen={isStyleEditorOpen}
          onToggleOpen={setIsStyleEditorOpen}
          onUpdateTheme={(newTheme: any) => {
            setLiveTheme(newTheme);
          }}
          onSaved={(savedCompany: any) => {
            setCompany(savedCompany);
            setLiveTheme(null);
          }}
        />
      )}

    </div>
  );
}
