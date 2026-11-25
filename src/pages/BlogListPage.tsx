import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { cleanArticleExcerpt } from "@/lib/mdExcerpt";
import { ArrowRight, Calendar, ChevronDown, Clock, Loader2, Pin, Search, Sparkles } from "lucide-react";
import { MASCOT } from "@/lib/mascotImages";
import { useSeo, SITE_URL } from "@/lib/seo";
import SiteHeader from "@/components/SiteHeader";
import UnifiedAIAssistant from "@/components/UnifiedAIAssistant";
import PublicMobileNavbar from "@/components/PublicMobileNavbar";
import Reveal from "@/components/Reveal";
import BlogCardMedia from "@/components/blog/BlogCardMedia";
import { getBlogPostPath } from "@/components/blog/blogHelpers";

export type BlogListPost = {
  id: string;
  public_id: string | number;
  slug: string;
  title: string;
  cover_url: string | null;
  cover_image_url?: string | null;
  cover_video_url?: string | null;
  excerpt: string;
  content_md: string;
  rss_category?: string | null;
  author_name?: string | null;
  read_time_minutes?: number | null;
  is_pinned?: boolean;
  created_at: string;
};

const INITIAL_LIMIT = 20;
const SCROLL_BATCH_LIMIT = 10;

export default function BlogListPage() {
  const [posts, setPosts] = useState<BlogListPost[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [mobileCatOpen, setMobileCatOpen] = useState(false);

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const loadingMoreRef = useRef(false);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useSeo({
    title: "Блог Робот Рекрутер — статьи о найме, ИИ-интервью и автоматизации HR",
    description:
      "Практические материалы для рекрутеров и руководителей: как нанимать быстрее, проводить 24/7 ИИ-интервью и автоматизировать онбординг сотрудников.",
    keywords:
      "блог hr, автоматизация найма, ИИ рекрутер, ИИ собеседование, скрининг резюме, подбор персонала, подбор сотрудников",
    canonical: `${SITE_URL}/blog`,
    ogUrl: `${SITE_URL}/blog`,
    ogTitle: "Блог Робот Рекрутер — статьи о найме и ИИ-технологиях",
    ogDescription:
      "Практические материалы о том, как ускорить подбор сотрудников и проводить автоматические ИИ-собеседования.",
    ogType: "website",
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "Blog",
        name: "Блог Робот Рекрутер",
        url: `${SITE_URL}/blog`,
        description:
          "Практические материалы для рекрутеров, HR и руководителей компаний о найме и ИИ-интервью.",
        publisher: {
          "@type": "Organization",
          name: "Робот Рекрутер",
          url: SITE_URL,
          logo: {
            "@type": "ImageObject",
            url: `${SITE_URL}/icons/pwa/pwa-512x512.png`,
          },
        },
        blogPost: posts.slice(0, 20).map((p) => ({
          "@type": "BlogPosting",
          headline: p.title,
          url: `${SITE_URL}${getBlogPostPath(p)}`,
          datePublished: p.created_at,
          description: cleanArticleExcerpt(p.excerpt || p.content_md || "", 120),
        })),
      },
      {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Главная", item: SITE_URL },
          { "@type": "ListItem", position: 2, name: "Блог", item: `${SITE_URL}/blog` },
        ],
      },
    ],
  });

  const fetchBatch = useCallback(
    async (offset: number, limit: number, replace: boolean) => {
      if (replace) {
        setLoading(true);
      } else {
        if (loadingMoreRef.current) return;
        loadingMoreRef.current = true;
        setLoadingMore(true);
      }

      try {
        const params = new URLSearchParams({
          paginated: "1",
          limit: String(limit),
          offset: String(offset),
        });
        if (debouncedSearch) params.set("q", debouncedSearch);
        if (selectedCategory && selectedCategory !== "all") {
          params.set("rss_category", selectedCategory);
        }

        const res = await fetch(`/api/posts?${params.toString()}`);
        if (res.ok) {
          const data = await res.json().catch(() => null);
          if (data && Array.isArray(data.items)) {
            setPosts((prev) => {
              if (replace) return data.items;
              const seen = new Set(prev.map((x) => x.id));
              const next = [...prev];
              for (const item of data.items) {
                if (!seen.has(item.id)) next.push(item);
              }
              return next;
            });
            setTotal(Number(data.total || 0));
            setHasMore(Boolean(data.hasMore));
            if (Array.isArray(data.categories)) {
              setCategories(data.categories);
            }
          }
        }
      } catch (e) {
        console.error("Failed to load blog posts:", e);
      } finally {
        setLoading(false);
        setLoadingMore(false);
        loadingMoreRef.current = false;
      }
    },
    [debouncedSearch, selectedCategory]
  );

  // Initial 20 articles load (also refreshes on filter/search change)
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
    fetchBatch(0, INITIAL_LIMIT, true);
  }, [fetchBatch]);

  // Smooth infinite scroll: loads +10 articles at a time
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore || loading) return;

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && !loadingMoreRef.current && hasMore) {
            fetchBatch(posts.length, SCROLL_BATCH_LIMIT, false);
          }
        }
      },
      { rootMargin: "280px 0px" }
    );

    io.observe(sentinel);
    return () => io.disconnect();
  }, [hasMore, loading, posts.length, fetchBatch]);

  const activeCategoryLabel = selectedCategory === "all" ? "Все рубрики" : selectedCategory;

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#17344F]/65 via-[#1E4468]/50 to-[#265582]/65 text-white font-sans relative pb-20 md:pb-8">
      <SiteHeader active="blog" />

      <main className="max-w-6xl mx-auto px-4 md:px-8 py-8 md:py-12 space-y-8">
        {/* Hero Section */}
        <Reveal as="section" direction="fade" className="space-y-4 text-center md:text-left">
          <div className="inline-flex items-center gap-2 text-[14px] text-[#F4EE8E] font-medium">
            <Sparkles className="w-4 h-4 text-[#E7C768]" />
            <span>Практические статьи и кейсы автоматизации</span>
          </div>

          <h1 className="text-3xl md:text-5xl font-black leading-tight bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">
            Блог о найме и технологиях искусственного интеллекта
          </h1>

          <p className="text-white/90 text-base md:text-lg max-w-3xl leading-relaxed">
            Экспертные материалы, готовые кейсы и разборы инструментов для автоматизации рекрутинга и бизнес-процессов.
          </p>

          {/* Search & Filter Bar */}
          <div className="pt-2 flex flex-col md:flex-row items-stretch md:items-center gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="w-5 h-5 text-[#E7C768] absolute left-4 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Поиск по статьям и темам…"
                className="w-full bg-transparent backdrop-blur-md border border-[#E7C768]/50 rounded-2xl pl-12 pr-4 py-3 text-[14px] text-white placeholder-white/60 focus:outline-none focus:border-[#E7C768] transition shadow-lg"
              />
            </div>

            {total > 0 && (
              <div className="text-[14px] text-white/80 md:ml-auto tabular-nums">
                Показано {posts.length} из {total}
              </div>
            )}
          </div>

          {/* Categories Filter — Vertical dropdown button on mobile, wrapped row on desktop (no horizontal scroll) */}
          {categories.length > 0 && (
            <div className="pt-1">
              {/* Mobile dropdown selector */}
              <div className="md:hidden space-y-2">
                <button
                  type="button"
                  onClick={() => setMobileCatOpen((prev) => !prev)}
                  className="w-full flex items-center justify-between gap-2 px-4 py-3 rounded-2xl border border-[#E7C768]/50 bg-transparent backdrop-blur-xl text-[14px] font-semibold text-white cursor-pointer"
                >
                  <span>Рубрика: {activeCategoryLabel}</span>
                  <ChevronDown className={`w-4 h-4 text-[#E7C768] transition-transform ${mobileCatOpen ? "rotate-180" : ""}`} />
                </button>
                {mobileCatOpen && (
                  <div className="flex flex-col gap-1.5 p-2 rounded-2xl border border-white/25 bg-transparent backdrop-blur-2xl">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedCategory("all");
                        setMobileCatOpen(false);
                      }}
                      className={`w-full text-left px-3.5 py-2.5 rounded-xl text-[14px] font-medium transition cursor-pointer ${
                        selectedCategory === "all"
                          ? "border border-[#E7C768] text-[#F4EE8E]"
                          : "border border-transparent text-white/90 hover:border-white/30"
                      }`}
                    >
                      Все рубрики
                    </button>
                    {categories.map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => {
                          setSelectedCategory(cat);
                          setMobileCatOpen(false);
                        }}
                        className={`w-full text-left px-3.5 py-2.5 rounded-xl text-[14px] font-medium transition cursor-pointer break-words ${
                          selectedCategory === cat
                            ? "border border-[#E7C768] text-[#F4EE8E]"
                            : "border border-transparent text-white/90 hover:border-white/30"
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Desktop wrapped category buttons */}
              <div className="hidden md:flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedCategory("all")}
                  className={`px-4 py-2 rounded-2xl text-[14px] font-semibold border transition cursor-pointer backdrop-blur-xl ${
                    selectedCategory === "all"
                      ? "border-[#E7C768] text-[#F4EE8E] bg-transparent shadow-md"
                      : "border-white/25 text-white/90 bg-transparent hover:border-[#E7C768]/60"
                  }`}
                >
                  Все рубрики
                </button>
                {categories.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-4 py-2 rounded-2xl text-[14px] font-semibold border transition cursor-pointer backdrop-blur-xl ${
                      selectedCategory === cat
                        ? "border-[#E7C768] text-[#F4EE8E] bg-transparent shadow-md"
                        : "border-white/25 text-white/90 bg-transparent hover:border-[#E7C768]/60"
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>
          )}
        </Reveal>

        {/* Posts Grid */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-white text-[15px]">
            <Loader2 className="w-7 h-7 text-[#E7C768] animate-spin" />
            <span>Загрузка статей блога…</span>
          </div>
        ) : posts.length === 0 ? (
          <div className="text-center py-16 space-y-4 bg-transparent backdrop-blur-2xl border border-white/25 rounded-3xl p-8">
            <img src={MASCOT.shine} alt="Маскот" className="w-28 h-28 mx-auto object-contain" />
            <p className="text-white text-base font-medium">
              {searchInput ? `По запросу «${searchInput}» ничего не найдено.` : "Пока нет опубликованных статей."}
            </p>
            {(searchInput || selectedCategory !== "all") && (
              <button
                type="button"
                onClick={() => {
                  setSearchInput("");
                  setSelectedCategory("all");
                }}
                className="px-5 py-2.5 rounded-2xl border border-[#E7C768] bg-transparent backdrop-blur-md text-[14px] text-[#F4EE8E] font-semibold cursor-pointer hover:brightness-110 transition"
              >
                Сбросить фильтры
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {posts.map((p, idx) => {
                const postUrl = getBlogPostPath(p);
                const postExcerpt = cleanArticleExcerpt(p.excerpt || p.content_md || "", 120);
                const staggerDelay = (idx % SCROLL_BATCH_LIMIT) * 45;

                return (
                  <Reveal
                    key={p.id}
                    as="article"
                    direction="up"
                    delay={staggerDelay}
                    duration={550}
                    threshold={0.05}
                    itemScope
                    itemType="https://schema.org/BlogPosting"
                    className={`flex flex-col rounded-3xl overflow-hidden border bg-transparent backdrop-blur-2xl hover:-translate-y-1 transition duration-300 shadow-xl ${
                      p.is_pinned ? "border-[#E7C768]" : "border-[#E7C768]/45 hover:border-[#E7C768]"
                    }`}
                  >
                    <Link to={postUrl} className="aspect-[16/9] bg-transparent overflow-hidden block relative group">
                      <BlogCardMedia post={p} />
                      {p.is_pinned && (
                        <span className="absolute top-3 left-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-xl border border-[#E7C768] bg-transparent backdrop-blur-xl text-[14px] font-semibold text-[#F4EE8E] shadow-md">
                          <Pin className="w-3.5 h-3.5 text-[#E7C768]" />
                          <span>Закреплено</span>
                        </span>
                      )}
                    </Link>

                    <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                      <div className="space-y-2.5">
                        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[14px] text-white/80">
                          <span className="inline-flex items-center gap-1.5">
                            <Calendar className="w-4 h-4 text-[#E7C768]" />
                            <time itemProp="datePublished" dateTime={p.created_at}>
                              {new Date(p.created_at).toLocaleDateString("ru-RU", {
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                              })}
                            </time>
                          </span>
                          {p.read_time_minutes ? (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="inline-flex items-center gap-1">
                                <Clock className="w-3.5 h-3.5 text-[#E7C768]" />
                                {p.read_time_minutes} мин.
                              </span>
                            </>
                          ) : null}
                          {p.rss_category ? (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="text-[#F4EE8E]">{p.rss_category}</span>
                            </>
                          ) : null}
                        </div>

                        <h2
                          itemProp="headline"
                          className="text-lg font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent leading-snug line-clamp-2 hover:opacity-90 transition"
                        >
                          <Link to={postUrl}>{p.title}</Link>
                        </h2>

                        <p itemProp="description" className="text-[14px] text-white/90 line-clamp-3 leading-relaxed">
                          {postExcerpt}
                        </p>
                      </div>

                      <div className="pt-3 border-t border-white/15 flex items-center justify-between gap-2">
                        <Link
                          to={postUrl}
                          className="text-[14px] text-[#F4EE8E] font-bold inline-flex items-center gap-1.5 hover:gap-2.5 transition-all"
                        >
                          <span>Читать статью</span>
                          <ArrowRight className="w-4 h-4 text-[#E7C768]" />
                        </Link>
                        <span className="text-[14px] text-white/70 tabular-nums">#{p.public_id}</span>
                      </div>
                    </div>
                  </Reveal>
                );
              })}
            </div>

            {/* Infinite scroll sentinel & graceful manual load-more fallback */}
            <div ref={sentinelRef} className="pt-4 flex flex-col items-center justify-center gap-3">
              {loadingMore && (
                <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl border border-white/25 bg-transparent backdrop-blur-xl text-[14px] text-white">
                  <Loader2 className="w-4 h-4 text-[#E7C768] animate-spin" />
                  <span>Подгружаем ещё 10 статей…</span>
                </div>
              )}
              {hasMore && !loadingMore && (
                <button
                  type="button"
                  onClick={() => fetchBatch(posts.length, SCROLL_BATCH_LIMIT, false)}
                  className="px-6 py-3 rounded-2xl border border-[#E7C768]/60 hover:border-[#E7C768] bg-transparent backdrop-blur-xl text-[14px] font-semibold text-white transition cursor-pointer"
                >
                  Показать ещё 10 статей
                </button>
              )}
            </div>
          </>
        )}
      </main>

      <UnifiedAIAssistant assistantType="landing" />
      <PublicMobileNavbar />
    </div>
  );
}
