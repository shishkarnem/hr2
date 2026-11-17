import React, { useEffect, useState, useMemo } from "react";
import { useNavigate, Link } from "react-router-dom";
import { mdExcerpt, cleanArticleExcerpt } from "@/lib/mdExcerpt";
import { BookOpen, Search, Sparkles, ArrowRight, Calendar, Tag } from "lucide-react";
import { MASCOT } from "@/lib/mascotImages";
import { rrImg } from "@/lib/img";
import { useSeo, SITE_URL } from "@/lib/seo";
import SiteHeader from "@/components/SiteHeader";
import UnifiedAIAssistant from "@/components/UnifiedAIAssistant";
import PublicMobileNavbar from "@/components/PublicMobileNavbar";

type Post = {
  id: string;
  public_id: string;
  slug: string;
  title: string;
  cover_url: string | null;
  excerpt: string;
  content_md: string;
  created_at: string;
};

export default function BlogListPage() {
  const navigate = useNavigate();
  const [posts, setPosts] = useState<Post[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);

  const filteredPosts = useMemo(() => {
    if (!searchQuery.trim()) return posts;
    const q = searchQuery.toLowerCase().trim();
    return posts.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        (p.excerpt && p.excerpt.toLowerCase().includes(q)) ||
        (p.content_md && p.content_md.toLowerCase().includes(q))
    );
  }, [posts, searchQuery]);

  useSeo({
    title: "Блог Робот Рекрутер — статьи о найме, ИИ-интервью и автоматизации HR",
    description: "Практические материалы для рекрутеров и руководителей: как нанимать быстрее, проводить 24/7 ИИ-интервью и автоматизировать онбординг сотрудников.",
    keywords: "блог hr, автоматизация найма, ИИ рекрутер, ИИ собеседование, скрининг резюме, подбор персонала, подбор сотрудников",
    canonical: `${SITE_URL}/blog`,
    ogUrl: `${SITE_URL}/blog`,
    ogTitle: "Блог Робот Рекрутер — статьи о найме и ИИ-технологиях",
    ogDescription: "Практические материалы о том, как ускорить подбор сотрудников и проводить автоматические ИИ-собеседования.",
    ogType: "website",
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "Blog",
        name: "Блог Робот Рекрутер",
        url: `${SITE_URL}/blog`,
        description: "Практические материалы для рекрутеров, HR и руководителей компаний о найме и ИИ-интервью.",
        publisher: {
          "@type": "Organization",
          name: "Робот Рекрутер",
          url: SITE_URL,
          logo: {
            "@type": "ImageObject",
            url: `${SITE_URL}/logos/RR-Logo.png`,
          },
        },
        blogPost: posts.map((p) => ({
          "@type": "BlogPosting",
          headline: p.title,
          url: `${SITE_URL}/blog/post${p.public_id}`,
          datePublished: p.created_at,
          description: cleanArticleExcerpt(p.excerpt || p.content_md || "", 120),
        })),
      },
      {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "Главная",
            item: SITE_URL,
          },
          {
            "@type": "ListItem",
            position: 2,
            name: "Блог",
            item: `${SITE_URL}/blog`,
          },
        ],
      },
    ],
  });

  useEffect(() => {
    window.scrollTo(0, 0);
    (async () => {
      try {
        const res = await fetch("/api/posts");
        if (res.ok) {
          const data = await res.json().catch(() => null);
          setPosts(Array.isArray(data) ? data : []);
        }
      } catch (e) {
        console.error("Failed to load blog posts from PostgreSQL BD ProTalk", e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#17344F]/65 via-[#1E4468]/50 to-[#265582]/65 text-white font-sans relative">
      <SiteHeader active="blog" />

      <main className="max-w-6xl mx-auto px-4 md:px-8 py-8 md:py-12 space-y-8">
        {/* Hero Section */}
        <section className="space-y-4 text-center md:text-left">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#E7C768]/10 border border-[#E7C768]/30 text-[#F4EE8E] text-xs font-semibold">
            <Sparkles className="w-4 h-4 text-[#E7C768]" /> Практические статьи & Руководства
          </div>
          <h1
            className="text-3xl md:text-5xl font-black leading-tight"
            style={{
              backgroundImage: "linear-gradient(135deg,#F4EE8E,#D99E41)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
            }}
          >
            Блог о найме и ИИ-технологиях
          </h1>
          <p className="text-slate-200 text-base md:text-lg max-w-2xl leading-relaxed">
            Узнайте, как нанимать сильных кандидатов в 5 раз быстрее, автоматизировать собеседования и исключить предвзятость в рекрутинге.
          </p>

          {/* Search Input */}
          <div className="pt-2 max-w-md">
            <div className="relative">
              <Search className="w-5 h-5 text-[#E7C768] absolute left-4 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Поиск по статьям и темам…"
                className="w-full bg-transparent backdrop-blur-md border border-[#E7C768]/40 rounded-2xl pl-12 pr-4 py-3.5 text-sm text-white placeholder-white/60 focus:outline-none focus:border-[#E7C768] transition shadow-lg"
              />
            </div>
          </div>
        </section>

        {/* Posts Grid */}
        {loading ? (
          <div className="text-center text-white/80 py-20 text-sm">Загрузка каталога статей…</div>
        ) : filteredPosts.length === 0 ? (
          <div className="text-center py-16 space-y-4 bg-transparent backdrop-blur-2xl border border-white/20 rounded-3xl p-8">
            <img src={MASCOT.shine} alt="" className="w-28 h-28 mx-auto object-contain" />
            <p className="text-white text-base font-medium">
              {searchQuery ? `По запросу «${searchQuery}» ничего не найдено.` : "Пока нет опубликованных статей."}
            </p>
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="text-sm text-[#E7C768] underline font-semibold cursor-pointer"
              >
                Сбросить поиск
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredPosts.map((p) => {
              const postUrl = `/blog/post${p.public_id}`;
              const postExcerpt = cleanArticleExcerpt(p.excerpt || p.content_md || "", 110);
              return (
                <article
                  key={p.id}
                  itemScope
                  itemType="https://schema.org/BlogPosting"
                  className="flex flex-col rounded-3xl overflow-hidden border border-[#E7C768]/40 bg-transparent backdrop-blur-2xl hover:border-[#E7C768] hover:-translate-y-1 transition duration-300 shadow-xl"
                >
                  <Link to={postUrl} className="aspect-[16/9] bg-transparent overflow-hidden block relative group">
                    {p.cover_url ? (
                      <img
                        src={rrImg(p.cover_url)}
                        alt={p.title}
                        itemProp="image"
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-white/60">
                        <BookOpen className="w-10 h-10 text-[#E7C768]" />
                      </div>
                    )}
                    <span className="absolute top-3 left-3 px-3 py-1.5 rounded-xl bg-transparent backdrop-blur-md text-sm text-[#F4EE8E] font-bold border border-[#E7C768]/40">
                      #{p.public_id}
                    </span>
                  </Link>
                  <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm text-white/70">
                        <Calendar className="w-4 h-4 text-[#E7C768]" />
                        <time itemProp="datePublished" dateTime={p.created_at}>
                          {new Date(p.created_at).toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" })}
                        </time>
                      </div>
                      <h2 itemProp="headline" className="text-base md:text-lg font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent leading-snug line-clamp-2 hover:opacity-90 transition">
                        <Link to={postUrl}>{p.title}</Link>
                      </h2>
                      <p itemProp="description" className="text-sm text-white/90 line-clamp-3 leading-relaxed">
                        {postExcerpt}
                      </p>
                    </div>
                    <div className="pt-2 border-t border-white/10 flex items-center justify-between">
                      <Link
                        to={postUrl}
                        className="text-sm text-[#E7C768] font-bold inline-flex items-center gap-1.5 hover:gap-2.5 transition-all"
                      >
                        Читать статью <ArrowRight className="w-4 h-4 text-[#E7C768]" />
                      </Link>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>

      <UnifiedAIAssistant assistantType="landing" />
      <PublicMobileNavbar />
    </div>
  );
}
