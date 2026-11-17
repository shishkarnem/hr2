import React, { useEffect, useState, useMemo } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import {
  Sparkles,
  BookOpen,
  Briefcase,
  Palette,
  GraduationCap,
  Video,
  Columns3,
  UserCheck,
  Search,
  ExternalLink,
  ChevronRight,
  ShieldCheck,
  CheckCircle2,
  HelpCircle,
  ArrowRight,
  Layers,
  FileText,
  AlertCircle,
  Loader2,
} from "lucide-react";
import SiteHeader from "@/components/SiteHeader";
import { useRouter } from "@/components/RouterContext";
import { useSeo, SITE_URL } from "@/lib/seo";
import { ACADEMY_SECTIONS, AcademySection, getAcademySectionBySlug } from "@/lib/academyContent";
import { RichMarkdown } from "@/components/RichMarkdown";
import UnifiedAIAssistant from "@/components/UnifiedAIAssistant";
import PublicMobileNavbar from "@/components/PublicMobileNavbar";

import { fetchAcademyPostsSingleton } from "@/components/AcademyModal";

export default function AcademyPage() {
  const { navigate } = useRouter();
  const [searchParams, setSearchParams] = useSearchParams();
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  const tabParam = searchParams.get("tab") || "company-vacancy";

  const [activeTabSlug, setActiveTabSlug] = useState<string>(tabParam);

  useSeo({
    title: "ИИ-Академия — Робот Рекрутер",
    description: "База знаний и обучающие инструкции по платформе Робот Рекрутер: создание вакансий, редактор стиля, ИИ-интервью, ИИ-обучение, CRM и личные кабинеты.",
    canonical: `${SITE_URL}/academy`,
    ogUrl: `${SITE_URL}/academy`,
    ogType: "website",
  });

  useEffect(() => {
    let cancelled = false;
    fetchAcademyPostsSingleton().then((data) => {
      if (!cancelled) {
        if (Array.isArray(data) && data.length > 0) {
          setPosts(data);
        }
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (tabParam && tabParam !== activeTabSlug) {
      setActiveTabSlug(tabParam);
    }
  }, [tabParam]);

  const handleSelectTab = (slug: string) => {
    setActiveTabSlug(slug);
    setSearchParams({ tab: slug });
  };

  const sectionsList: AcademySection[] = useMemo(() => {
    if (posts && posts.length > 0) {
      return posts.map((p, idx) => {
        const slug = p.slug || `section-${p.public_id}`;
        return {
          id: p.id || `academy-${p.public_id}`,
          slug: slug,
          publicId: String(p.public_id || ""),
          title: p.title || `Статья ${idx + 1}`,
          shortTitle: p.title?.split("—")[0]?.trim() || p.title,
          category: "academy" as const,
          iconName: p.icon || "BookOpen",
          excerpt: p.excerpt || "",
          content_md: p.content_md || "",
        };
      });
    }
    return [];
  }, [posts]);

  const activeSection: AcademySection | null = useMemo(() => {
    if (!sectionsList || sectionsList.length === 0) return null;
    const found = sectionsList.find(
      (s) =>
        s.slug === activeTabSlug ||
        s.publicId === activeTabSlug ||
        s.id === activeTabSlug ||
        s.id === `academy-${activeTabSlug}` ||
        (activeTabSlug === "company-vacancy" && (s.slug === "company-vacancy" || s.publicId === "770001")) ||
        (activeTabSlug === "landing-styles" && (s.slug === "landing-styles" || s.publicId === "770002")) ||
        (activeTabSlug === "ai-training" && (s.slug === "ai-training" || s.publicId === "770003")) ||
        (activeTabSlug === "ai-interview" && (s.slug === "ai-interview" || s.publicId === "770004")) ||
        (activeTabSlug === "crm" && (s.slug === "crm" || s.publicId === "770005")) ||
        (activeTabSlug === "employer-cabinet" && (s.slug === "employer-cabinet" || s.publicId === "770006")) ||
        (activeTabSlug === "candidate" && (s.slug === "candidate" || s.publicId === "770007"))
    );
    return found || sectionsList[0] || null;
  }, [sectionsList, activeTabSlug]);

  const getSectionIcon = (iconName: string) => {
    switch (iconName) {
      case "Briefcase":
        return <Briefcase className="w-5 h-5 text-[#E7C768] shrink-0" />;
      case "Palette":
        return <Palette className="w-5 h-5 text-[#E7C768] shrink-0" />;
      case "GraduationCap":
        return <GraduationCap className="w-5 h-5 text-[#E7C768] shrink-0" />;
      case "Video":
        return <Video className="w-5 h-5 text-[#E7C768] shrink-0" />;
      case "Columns3":
        return <Columns3 className="w-5 h-5 text-[#E7C768] shrink-0" />;
      case "UserCheck":
        return <UserCheck className="w-5 h-5 text-[#E7C768] shrink-0" />;
      default:
        return <BookOpen className="w-5 h-5 text-[#E7C768] shrink-0" />;
    }
  };

  const filteredSections = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return sectionsList;
    return sectionsList.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.shortTitle.toLowerCase().includes(q) ||
        s.excerpt.toLowerCase().includes(q) ||
        s.content_md.toLowerCase().includes(q)
    );
  }, [sectionsList, searchQuery]);

  return (
    <div className="min-h-screen bg-[#17344F] text-white flex flex-col selection:bg-[#E7C768]/30">
      <SiteHeader active="faq" />

      {/* Hero section */}
      <section className="relative pt-10 pb-12 px-4 md:px-8 border-b border-white/10 bg-transparent backdrop-blur-xl overflow-hidden">
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-3 max-w-3xl">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-[#E7C768]/40 bg-transparent backdrop-blur-md shadow-sm">
                <Sparkles className="w-4 h-4 text-[#E7C768]" />
                <span className="text-[14px] font-bold bg-gradient-to-r from-[#F4EE8E] to-[#E7C768] bg-clip-text text-transparent">
                  База знаний и инструкций платформы
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-tight bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent leading-tight">
                ИИ-Академия Робот Рекрутер
              </h1>
              <p className="text-[14px] sm:text-base text-slate-200 leading-relaxed max-w-2xl">
                Исчерпывающие пошаговые инструкции по настройке модулей платформы, работе с нейросетями, управлению воронкой кандидатов и устранению типовых ошибок.
              </p>
            </div>

            {/* Quick action buttons */}
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => navigate("/demo")}
                className="px-5 py-3 rounded-2xl bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#C8A038] text-[#17344F] font-bold text-[14px] shadow-lg hover:brightness-105 active:scale-95 transition cursor-pointer flex items-center gap-2"
              >
                <Video className="w-4 h-4 text-[#17344F]" />
                <span>Демо интервью</span>
              </button>
              <button
                type="button"
                onClick={() => navigate("/employer")}
                className="px-5 py-3 rounded-2xl border border-white/20 bg-transparent backdrop-blur-xl text-white font-bold text-[14px] hover:border-[#E7C768]/60 transition cursor-pointer flex items-center gap-2"
              >
                <Briefcase className="w-4 h-4 text-[#E7C768]" />
                <span>В кабинет работодателя</span>
              </button>
            </div>
          </div>

          {/* Search bar inside academy */}
          <div className="relative max-w-xl">
            <Search className="w-5 h-5 text-white/50 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Поиск по статьям и настройкам полей…"
              className="w-full pl-12 pr-4 py-3 rounded-2xl border border-white/20 bg-transparent backdrop-blur-2xl text-white placeholder-white/50 text-[14px] focus:outline-none focus:border-[#E7C768] transition shadow-inner"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-[14px] text-white/60 hover:text-white"
              >
                Очистить
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Main Content Layout */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 md:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Navigation Sidebar / Vertical Tabs (no horizontal scroll) */}
          <aside className="lg:col-span-4 w-full space-y-3">
            <div className="flex items-center justify-between px-1 mb-2">
              <span className="text-[14px] font-bold text-white/80">
                Разделы обучения ({sectionsList.length})
              </span>
            </div>

            {/* Mobile Dropdown / Selector */}
            <div className="lg:hidden mb-4">
              <label className="block text-[14px] text-white/80 mb-1.5 font-semibold">
                Выберите раздел:
              </label>
              <select
                value={activeTabSlug}
                onChange={(e) => handleSelectTab(e.target.value)}
                className="w-full p-3 rounded-2xl border border-[#E7C768]/60 bg-[#17344F] text-white text-[14px] font-bold focus:outline-none"
              >
                {sectionsList.map((sec, idx) => (
                  <option key={sec.slug} value={sec.slug}>
                    {idx + 1}. {sec.shortTitle}
                  </option>
                ))}
              </select>
            </div>

            {/* Desktop Vertical Tabs List */}
            <div className="hidden lg:flex flex-col gap-2.5">
              {filteredSections.map((sec, idx) => {
                const isActive = sec.slug === activeSection?.slug;
                return (
                  <button
                    key={sec.slug}
                    type="button"
                    onClick={() => handleSelectTab(sec.slug)}
                    className={`w-full text-left p-3.5 rounded-2xl transition-all cursor-pointer flex items-center justify-between gap-3 border ${
                      isActive
                        ? "border-[#E7C768] bg-transparent backdrop-blur-2xl shadow-[0_0_16px_rgba(231,199,104,0.2)] text-[#F4EE8E]"
                        : "border-white/10 hover:border-white/30 text-white/80 hover:text-white bg-transparent backdrop-blur-lg"
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="p-2 rounded-xl border border-white/10 bg-transparent shrink-0">
                        {getSectionIcon(sec.iconName)}
                      </div>
                      <div className="min-w-0">
                        <div className="text-[14px] font-bold truncate">
                          {idx + 1}. {sec.shortTitle}
                        </div>
                        <div className="text-[14px] text-slate-300 truncate">
                          {sec.excerpt.slice(0, 50)}…
                        </div>
                      </div>
                    </div>
                    <ChevronRight className={`w-4 h-4 shrink-0 transition ${isActive ? "text-[#E7C768] translate-x-0.5" : "text-white/40"}`} />
                  </button>
                );
              })}
            </div>

            {/* Quick summary widget */}
            <div className="p-5 rounded-3xl border border-white/15 bg-transparent backdrop-blur-2xl space-y-3 mt-6">
              <div className="flex items-center gap-2 text-[#E7C768] font-bold text-[14px]">
                <HelpCircle className="w-5 h-5" />
                <span>Нужна консультация?</span>
              </div>
              <p className="text-[14px] text-slate-300 leading-relaxed">
                Все разделы Академии также доступны прямо в интерфейсах личного кабинета через иконку «?» в шапке страниц.
              </p>
              <button
                type="button"
                onClick={() => navigate("/demo")}
                className="w-full py-2.5 px-4 rounded-xl border border-[#E7C768]/50 hover:border-[#E7C768] text-[#F4EE8E] font-bold text-[14px] transition text-center"
              >
                Открыть демо-интервью
              </button>
            </div>
          </aside>

          {/* Active Article Article View */}
          <article className="lg:col-span-8 w-full rounded-3xl border border-white/20 bg-transparent backdrop-blur-2xl p-6 sm:p-8 md:p-10 shadow-2xl space-y-6 overflow-hidden">
            {loading ? (
              <div className="py-20 flex flex-col items-center justify-center gap-3 text-slate-300">
                <Loader2 className="w-8 h-8 animate-spin text-[#E7C768]" />
                <span className="text-[14px]">Загрузка базы знаний из базы данных ProTalk...</span>
              </div>
            ) : !activeSection ? (
              <div className="py-20 text-center text-slate-300 text-[14px]">
                Разделы базы знаний загружаются из базы данных ProTalk...
              </div>
            ) : (
              <>
                {/* Header of article */}
                <div className="border-b border-white/10 pb-6 space-y-3">
                  <div className="flex items-center gap-2 text-[14px] text-[#E7C768] font-mono">
                    <span className="px-2.5 py-0.5 rounded-xl border border-[#E7C768]/40 bg-transparent">
                      Раздел #{activeSection.publicId}
                    </span>
                    <span>•</span>
                    <span>Обновлено для версии 2026</span>
                  </div>
                  <h2 className="text-xl sm:text-2xl md:text-3xl font-extrabold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent leading-snug">
                    {activeSection.title}
                  </h2>
                  <p className="text-[14px] sm:text-base text-slate-200 leading-relaxed">
                    {activeSection.excerpt}
                  </p>
                </div>

                {/* Markdown rendered body */}
                <div className="text-[14px] leading-relaxed text-slate-100">
                  <RichMarkdown content={activeSection.content_md} tone="resume" />
                </div>

                {/* Article Footer navigation */}
                <div className="border-t border-white/10 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <span className="text-[14px] text-slate-300">
                    ИИ-Академия платформы «Робот Рекрутер»
                  </span>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        const currentIndex = sectionsList.findIndex(s => s.slug === activeSection.slug);
                        const nextIndex = (currentIndex + 1) % sectionsList.length;
                        handleSelectTab(sectionsList[nextIndex].slug);
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                      className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] text-[#17344F] font-bold text-[14px] hover:brightness-105 transition flex items-center gap-2 cursor-pointer shadow-md"
                    >
                      <span>Следующий раздел</span>
                      <ArrowRight className="w-4 h-4 text-[#17344F]" />
                    </button>
                  </div>
                </div>
              </>
            )}
          </article>
        </div>
      </main>

      <UnifiedAIAssistant assistantType="landing" />
      <PublicMobileNavbar />
    </div>
  );
}
