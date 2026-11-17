import React, { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  X,
  GraduationCap,
  Briefcase,
  Palette,
  MessageSquare,
  Users,
  Building2,
  UserCheck,
  Search,
  ExternalLink,
  BookOpen,
  Sparkles,
} from "lucide-react";
import { Loader2 } from "lucide-react";
import { AcademySection } from "@/lib/academyContent";
import { RichMarkdown } from "@/components/RichMarkdown";
import { useRouter } from "@/components/RouterContext";

// Module-level persistent in-memory cache for database academy posts
let globalAcademyPostsCache: any[] | null = null;
let globalAcademyFetchPromise: Promise<any[]> | null = null;

export async function fetchAcademyPostsSingleton(): Promise<any[]> {
  if (globalAcademyPostsCache && globalAcademyPostsCache.length > 0) {
    return globalAcademyPostsCache;
  }
  if (!globalAcademyFetchPromise) {
    globalAcademyFetchPromise = fetch("/api/posts?category=academy&all=true")
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          globalAcademyPostsCache = data;
        }
        return globalAcademyPostsCache || [];
      })
      .catch((err) => {
        console.error("Failed to load academy posts from db:", err);
        return [];
      })
      .finally(() => {
        globalAcademyFetchPromise = null;
      });
  }
  return globalAcademyFetchPromise;
}

interface AcademyModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialSlug?: string;
}

export default function AcademyModal({
  isOpen,
  onClose,
  initialSlug = "company-vacancy",
}: AcademyModalProps) {
  const { navigate } = useRouter();
  const [activeSlug, setActiveSlug] = useState<string>(initialSlug);
  const [searchQuery, setSearchQuery] = useState("");
  const [posts, setPosts] = useState<any[]>(() => globalAcademyPostsCache || []);
  const [isLoading, setIsLoading] = useState<boolean>(() => !globalAcademyPostsCache || globalAcademyPostsCache.length === 0);

  useEffect(() => {
    if (initialSlug) {
      setActiveSlug(initialSlug);
    }
  }, [initialSlug, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    if (globalAcademyPostsCache && globalAcademyPostsCache.length > 0) {
      setPosts(globalAcademyPostsCache);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    fetchAcademyPostsSingleton().then((data) => {
      if (!cancelled) {
        if (Array.isArray(data) && data.length > 0) {
          setPosts(data);
        }
        setIsLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  // Exclusively map from database posts table (no static dual-content collision)
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
    const found =
      sectionsList.find(
        (s) =>
          s.slug === activeSlug ||
          s.id === activeSlug ||
          s.publicId === activeSlug ||
          s.id === `academy-${activeSlug}` ||
          (activeSlug === "company-vacancy" && (s.slug === "company-vacancy" || s.publicId === "770001")) ||
          (activeSlug === "landing-styles" && (s.slug === "landing-styles" || s.publicId === "770002")) ||
          (activeSlug === "ai-training" && (s.slug === "ai-training" || s.publicId === "770003")) ||
          (activeSlug === "ai-interview" && (s.slug === "ai-interview" || s.publicId === "770004")) ||
          (activeSlug === "crm" && (s.slug === "crm" || s.publicId === "770005")) ||
          (activeSlug === "employer-cabinet" && (s.slug === "employer-cabinet" || s.publicId === "770006")) ||
          (activeSlug === "candidate" && (s.slug === "candidate" || s.publicId === "770007"))
      ) || sectionsList[0];
    return found;
  }, [sectionsList, activeSlug]);

  const getSectionIcon = (iconName: string) => {
    switch (iconName) {
      case "Briefcase":
        return <Briefcase className="w-4 h-4 text-[#E7C768] shrink-0" />;
      case "Palette":
        return <Palette className="w-4 h-4 text-[#E7C768] shrink-0" />;
      case "GraduationCap":
        return <GraduationCap className="w-4 h-4 text-[#E7C768] shrink-0" />;
      case "MessageSquare":
        return <MessageSquare className="w-4 h-4 text-[#E7C768] shrink-0" />;
      case "Users":
        return <Users className="w-4 h-4 text-[#E7C768] shrink-0" />;
      case "Building2":
        return <Building2 className="w-4 h-4 text-[#E7C768] shrink-0" />;
      case "UserCheck":
        return <UserCheck className="w-4 h-4 text-[#E7C768] shrink-0" />;
      default:
        return <BookOpen className="w-4 h-4 text-[#E7C768] shrink-0" />;
    }
  };

  if (!isOpen) return null;

  const modalElement = (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-5 md:p-8 overflow-y-auto">
      {/* Backdrop: Completely transparent background without color darkening */}
      <div
        className="fixed inset-0 bg-transparent transition-opacity"
        onClick={onClose}
        aria-label="Закрыть модальное окно Академии"
      />

      {/* Modal Dialog (Liquid Glass Apple Style) */}
      <div className="relative w-full max-w-5xl bg-transparent backdrop-blur-3xl border border-white/20 shadow-2xl rounded-3xl overflow-hidden flex flex-col max-h-[90vh] z-10 text-left">
        {/* Header bar */}
        <div className="px-5 py-4 border-b border-white/15 flex items-center justify-between gap-3 bg-transparent backdrop-blur-md">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-transparent border border-[#E7C768]/60 flex items-center justify-center shrink-0 shadow-[0_0_15px_rgba(231,199,104,0.2)]">
              <GraduationCap className="w-5 h-5 text-[#E7C768]" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#C8A038] bg-clip-text text-transparent truncate">
                ИИ-Академия — Обучающие инструкции
              </h2>
              <p className="text-[14px] text-slate-300 truncate">
                Интерактивная база знаний платформы Робот Рекрутер
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {activeSection && (
              <button
                onClick={() => {
                  onClose();
                  navigate(`/academy?tab=${activeSection.slug}`);
                }}
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-white/20 hover:border-[#E7C768] text-white hover:text-[#F4EE8E] text-[14px] font-semibold transition cursor-pointer"
                title="Открыть в полноэкранном режиме Академии"
              >
                <ExternalLink className="w-3.5 h-3.5 text-[#E7C768]" />
                <span>На страницу</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-300 hover:text-white hover:border-white/40 border border-white/15 transition cursor-pointer"
              aria-label="Закрыть"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Section Tabs navigation */}
        {sectionsList.length > 0 && activeSection && (
          <div className="px-5 py-3 border-b border-white/10 bg-transparent">
            {/* Mobile Select */}
            <div className="sm:hidden">
              <select
                value={activeSection.slug}
                onChange={(e) => setActiveSlug(e.target.value)}
                className="w-full bg-slate-900/95 text-white text-[14px] font-semibold border border-[#E7C768]/50 rounded-xl px-3 py-2.5 focus:outline-none"
              >
                {sectionsList.map((sec, idx) => (
                  <option key={sec.slug} value={sec.slug} className="bg-slate-900 text-white">
                    {idx + 1}. {sec.shortTitle || sec.title}
                  </option>
                ))}
              </select>
            </div>

            {/* Desktop tabs */}
            <div className="hidden sm:flex flex-wrap items-center gap-1.5">
              {sectionsList.map((sec, idx) => {
                const isCurrent = activeSection.slug === sec.slug;
                return (
                  <button
                    key={sec.slug}
                    onClick={() => setActiveSlug(sec.slug)}
                    className={`px-3 py-1.5 rounded-xl text-[14px] font-bold transition flex items-center gap-1.5 cursor-pointer ${
                      isCurrent
                        ? "bg-transparent border border-[#E7C768] text-[#F4EE8E] shadow-[0_0_12px_rgba(231,199,104,0.25)]"
                        : "border border-white/15 text-slate-300 hover:text-white hover:border-white/30"
                    }`}
                  >
                    {getSectionIcon(sec.iconName)}
                    <span>
                      {idx + 1}. {sec.shortTitle || sec.title}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Article content scroll area */}
        {isLoading || !activeSection ? (
          <div className="flex-1 flex flex-col items-center justify-center p-16 space-y-4 text-center">
            <div className="w-12 h-12 rounded-2xl border border-[#E7C768]/60 flex items-center justify-center shadow-[0_0_20px_rgba(231,199,104,0.2)]">
              <Loader2 className="w-6 h-6 animate-spin text-[#E7C768]" />
            </div>
            <p className="text-[14px] text-[#F4EE8E] font-mono">Загрузка базы знаний из базы данных…</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-5 sm:p-7 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-white/10">
              <div>
                <h1 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#C8A038] bg-clip-text text-transparent">
                  {activeSection.title}
                </h1>
                {activeSection.excerpt && (
                  <p className="text-[14px] text-slate-300 mt-1 max-w-3xl leading-relaxed">
                    {activeSection.excerpt}
                  </p>
                )}
              </div>

              {/* Quick search input within article */}
              <div className="relative min-w-[220px]">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Поиск по статье…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-transparent border border-white/20 rounded-xl pl-9 pr-3 py-1.5 text-[14px] text-white placeholder-slate-400 focus:outline-none focus:border-[#E7C768]"
                />
              </div>
            </div>

            {/* Render article markdown content */}
            <div className="prose prose-invert max-w-none text-[14px] sm:text-base leading-relaxed text-slate-200">
              <RichMarkdown
                content={
                  searchQuery.trim()
                    ? activeSection.content_md
                        .split("\n")
                        .filter((line) =>
                          line.toLowerCase().includes(searchQuery.toLowerCase())
                        )
                        .join("\n\n") || "По вашему запросу ничего не найдено в этой статье."
                    : activeSection.content_md
                }
              />
            </div>
          </div>
        )}

        {/* Modal Footer */}
        <div className="px-5 py-3 border-t border-white/10 bg-transparent backdrop-blur-md flex items-center justify-between text-[14px] text-slate-300">
          <span className="flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-[#E7C768]" />
            {activeSection ? (
              <span>Раздел {sectionsList.findIndex((s) => s.slug === activeSection.slug) + 1} из {sectionsList.length}</span>
            ) : (
              <span>База знаний</span>
            )}
          </span>
          {activeSection && (
            <button
              onClick={() => {
                onClose();
                navigate(`/academy?tab=${activeSection.slug}`);
              }}
              className="text-[#E7C768] hover:text-white font-bold transition flex items-center gap-1 cursor-pointer"
            >
              <span>Перейти в полную Академию</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(modalElement, document.body) : modalElement;
}
