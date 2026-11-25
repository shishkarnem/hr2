import React, { useEffect, useState, useMemo } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { dbClient } from "@/lib/dbClient";
import PostReactions from "@/components/PostReactions";
import PostComments from "@/components/PostComments";
import AuthModal from "@/components/AuthModal";
import { useSeo, SITE_URL } from "@/lib/seo";
import SiteHeader from "@/components/SiteHeader";
import UnifiedAIAssistant from "@/components/UnifiedAIAssistant";
import PublicMobileNavbar from "@/components/PublicMobileNavbar";
import Reveal from "@/components/Reveal";
import BlogArticleBody from "@/components/blog/BlogArticleBody";
import { getBlogPostPath, resolvePostCoverImage } from "@/components/blog/blogHelpers";
import { cleanArticleExcerpt } from "@/lib/mdExcerpt";
import { transliterateToSlug } from "@/lib/links";
import {
  ChevronRight,
  Clock,
  FileText,
  Share2,
  List,
  Check,
  Send,
  BookOpen,
  ArrowLeft,
  Calendar,
  ExternalLink,
  Pin,
} from "lucide-react";
import { toast } from "sonner";

function slugifyHeadingText(text: string): string {
  return transliterateToSlug(text) || "section";
}

export default function BlogPostPage() {
  const navigate = useNavigate();
  const { pid: rawPid } = useParams<{ pid: string }>();
  const identifier = rawPid || "";
  const lookupParam = /^post\d+$/i.test(identifier) ? identifier.replace(/^post/i, "") : identifier;

  const [post, setPost] = useState<any>(null);
  const [relatedPosts, setRelatedPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const canonicalPostPath = post ? getBlogPostPath(post) : `/blog/${identifier}`;
  const publicPostUrl = `${SITE_URL}${canonicalPostPath}`;

  // Extract table of contents headings (h2 and h3) from markdown outside fenced blocks
  const tocHeadings = useMemo(() => {
    if (!post?.content_md) return [];
    const cleaned = String(post.content_md).replace(/```[\s\S]*?```/g, "");
    const lines = cleaned.split("\n");
    const headings: { id: string; text: string; level: number }[] = [];
    for (const line of lines) {
      const matchH2 = line.match(/^##\s+(.+)$/);
      const matchH3 = line.match(/^###\s+(.+)$/);
      if (matchH2) {
        const text = matchH2[1].replace(/[*_#`]/g, "").trim();
        headings.push({ id: slugifyHeadingText(text), text, level: 2 });
      } else if (matchH3) {
        const text = matchH3[1].replace(/[*_#`]/g, "").trim();
        headings.push({ id: slugifyHeadingText(text), text, level: 3 });
      }
    }
    return headings;
  }, [post?.content_md]);

  const wordCount = useMemo(() => {
    if (!post?.content_md) return 0;
    const cleanText = String(post.content_md)
      .replace(/```tg-(?:video|gallery|buttons)[\s\S]*?```/g, " ")
      .replace(/<[^>]*>/g, " ")
      .replace(/[#*`>_\-]/g, " ");
    const words = cleanText.trim().split(/\s+/).filter(Boolean);
    return words.length;
  }, [post?.content_md]);

  const readingTime = useMemo(() => {
    if (post?.read_time_minutes && Number(post.read_time_minutes) > 0) {
      return Number(post.read_time_minutes);
    }
    return Math.max(1, Math.ceil(wordCount / 180));
  }, [post?.read_time_minutes, wordCount]);

  const excerpt = useMemo(() => {
    if (!post) return "";
    return cleanArticleExcerpt(post.excerpt || post.content_md || "", 240);
  }, [post]);

  const seoImageUrl = useMemo(() => {
    if (!post) return `${SITE_URL}/icons/pwa/pwa-512x512.png`;
    return resolvePostCoverImage(post);
  }, [post]);

  // Dynamic SEO setup — cover image is ONLY used in SEO meta tags, never rendered at top of article page
  useSeo(
    post
      ? {
          title: `${post.seo_title || post.title} — Блог Робот Рекрутер`,
          description: post.seo_description || excerpt || `${post.title} — экспертная статья в блоге Робот Рекрутер.`,
          keywords:
            post.seo_keywords ||
            `${post.title}, автоматизация найма, ИИ рекрутинг, Робот Рекрутер, подбор персонала`,
          canonical: publicPostUrl,
          ogUrl: publicPostUrl,
          ogTitle: post.seo_title || post.title,
          ogDescription: post.seo_description || excerpt,
          ogImage: seoImageUrl,
          ogType: "article",
          articlePublishedTime: post.created_at,
          articleModifiedTime: post.updated_at || post.created_at,
          jsonLd: [
            {
              "@context": "https://schema.org",
              "@type": "BlogPosting",
              "@id": publicPostUrl,
              headline: post.title,
              description: post.seo_description || excerpt,
              articleBody: post.content_md,
              wordCount,
              inLanguage: "ru-RU",
              image: [seoImageUrl],
              datePublished: post.created_at,
              dateModified: post.updated_at || post.created_at,
              mainEntityOfPage: {
                "@type": "WebPage",
                "@id": publicPostUrl,
              },
              author: {
                "@type": "Organization",
                name: post.author_name || "Робот Рекрутер",
                url: SITE_URL,
              },
              publisher: {
                "@type": "Organization",
                name: "Робот Рекрутер",
                url: SITE_URL,
                logo: {
                  "@type": "ImageObject",
                  url: `${SITE_URL}/icons/pwa/pwa-512x512.png`,
                },
              },
            },
            {
              "@context": "https://schema.org",
              "@type": "BreadcrumbList",
              itemListElement: [
                { "@type": "ListItem", position: 1, name: "Главная", item: SITE_URL },
                { "@type": "ListItem", position: 2, name: "Блог", item: `${SITE_URL}/blog` },
                { "@type": "ListItem", position: 3, name: post.title, item: publicPostUrl },
              ],
            },
          ],
        }
      : {}
  );

  useEffect(() => {
    window.scrollTo(0, 0);
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/posts/${encodeURIComponent(lookupParam)}`);
        if (res.ok) {
          const data = await res.json().catch(() => null);
          setPost(data);
        } else {
          setPost(null);
        }
      } catch (e) {
        console.error("Error fetching post:", e);
        setPost(null);
      } finally {
        setLoading(false);
      }

      try {
        const relRes = await fetch("/api/posts?paginated=1&limit=4&offset=0");
        if (relRes.ok) {
          const relData = await relRes.json().catch(() => null);
          const items = Array.isArray(relData?.items) ? relData.items : [];
          setRelatedPosts(
            items
              .filter((p: any) => String(p.public_id) !== lookupParam && p.slug !== lookupParam && p.id !== lookupParam)
              .slice(0, 3)
          );
        }
      } catch {}

      try {
        const {
          data: { user },
        } = await dbClient.auth.getUser();
        setUserId(user?.id ?? null);
      } catch {}
    })();

    const { data: sub } = dbClient.auth.onAuthStateChange((_e, s) => setUserId(s?.user?.id ?? null));
    return () => sub.subscription.unsubscribe();
  }, [lookupParam]);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(publicPostUrl);
    setCopied(true);
    toast.success("Ссылка на статью скопирована");
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#17344F]/65 via-[#1E4468]/50 to-[#265582]/65 text-white font-sans relative pb-20 md:pb-8">
      <SiteHeader active="blog" />

      <main className="max-w-4xl mx-auto px-4 md:px-8 py-6 md:py-10 space-y-6">
        {/* Breadcrumb Navigation */}
        <nav
          aria-label="Хлебные крошки"
          className="flex items-center flex-wrap gap-2 text-[14px] text-white/80 py-1"
          itemScope
          itemType="https://schema.org/BreadcrumbList"
        >
          <span itemProp="itemListElement" itemScope itemType="https://schema.org/ListItem">
            <Link to="/" itemProp="item" className="hover:text-[#F4EE8E] transition">
              <span itemProp="name">Главная</span>
            </Link>
            <meta itemProp="position" content="1" />
          </span>
          <ChevronRight className="w-4 h-4 text-[#E7C768]" />
          <span itemProp="itemListElement" itemScope itemType="https://schema.org/ListItem">
            <Link to="/blog" itemProp="item" className="hover:text-[#F4EE8E] transition">
              <span itemProp="name">Блог</span>
            </Link>
            <meta itemProp="position" content="2" />
          </span>
          {post && (
            <>
              <ChevronRight className="w-4 h-4 text-[#E7C768]" />
              <span
                itemProp="itemListElement"
                itemScope
                itemType="https://schema.org/ListItem"
                className="text-white font-medium truncate max-w-[220px] sm:max-w-[360px]"
              >
                <span itemProp="name">{post.title}</span>
                <meta itemProp="position" content="3" />
              </span>
            </>
          )}
        </nav>

        {loading ? (
          <div className="text-center text-white/85 py-20 text-[15px]">Загрузка материалов статьи…</div>
        ) : !post ? (
          <div className="text-center bg-transparent backdrop-blur-2xl border border-white/25 rounded-3xl p-8 sm:p-10 space-y-4">
            <BookOpen className="w-12 h-12 text-[#E7C768] mx-auto opacity-80" />
            <h1 className="text-2xl font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">
              Статья не найдена
            </h1>
            <p className="text-white/90 text-[15px] max-w-md mx-auto">
              Запрошенная публикация не найдена или была перемещена. Посмотрите другие статьи в каталоге блога.
            </p>
            <button
              type="button"
              onClick={() => navigate("/blog")}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl border border-[#E7C768] bg-transparent backdrop-blur-xl text-white text-[14px] font-bold hover:brightness-110 transition cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4 text-[#E7C768]" /> Перейти в каталог блога
            </button>
          </div>
        ) : (
          <article itemScope itemType="https://schema.org/BlogPosting" className="space-y-6">
            <meta itemProp="mainEntityOfPage" content={publicPostUrl} />

            {/* Header & Metadata ONLY — cover image/video is intentionally NOT rendered inside the article page */}
            <Reveal
              as="header"
              direction="fade"
              className="space-y-4 bg-transparent border border-[#E7C768]/45 rounded-3xl p-5 sm:p-7 md:p-8 backdrop-blur-2xl shadow-xl"
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[14px] text-white/85">
                {post.is_pinned && (
                  <span className="inline-flex items-center gap-1.5 text-[#F4EE8E] font-semibold">
                    <Pin className="w-4 h-4 text-[#E7C768]" /> Закреплено
                  </span>
                )}
                {post.rss_category && (
                  <span className="text-[#F4EE8E] font-semibold">{post.rss_category}</span>
                )}
                <span className="inline-flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-[#E7C768]" />
                  <time itemProp="datePublished" dateTime={post.created_at}>
                    {new Date(post.created_at).toLocaleDateString("ru-RU", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                  </time>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-[#E7C768]" /> {readingTime} мин. чтения
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-[#E7C768]" /> {wordCount} слов
                </span>
                <span className="text-white/70 tabular-nums">#{post.public_id}</span>
              </div>

              <h1
                itemProp="headline"
                className="text-2xl sm:text-3xl md:text-4xl font-black leading-tight bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent break-words"
              >
                {post.title}
              </h1>

              {excerpt && (
                <p
                  itemProp="description"
                  className="text-white/90 text-base leading-relaxed rounded-2xl border border-white/20 bg-transparent backdrop-blur-md p-4"
                >
                  {excerpt}
                </p>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-white/15">
                <div
                  itemProp="author"
                  itemScope
                  itemType="https://schema.org/Organization"
                  className="flex items-center"
                >
                  <div className="text-[14px]">
                    <span itemProp="name" className="font-bold text-white block">
                      {post.author_name || "Робот Рекрутер"}
                    </span>
                    <span className="text-white/75">
                      {post.author_role || "Платформа автоматизации найма"}
                    </span>
                  </div>
                </div>

                {post.telegram_post_url && (
                  <a
                    href={post.telegram_post_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-white/25 hover:border-[#E7C768] bg-transparent backdrop-blur-md text-[14px] font-semibold text-white transition"
                  >
                    <span>Пост в Telegram</span>
                    <ExternalLink className="w-4 h-4 text-[#E7C768]" />
                  </a>
                )}
              </div>
            </Reveal>

            {/* Table of Contents (TOC) */}
            {tocHeadings.length > 2 && (
              <div className="rounded-3xl border border-white/25 bg-transparent backdrop-blur-xl p-5 md:p-6 space-y-3 shadow-lg">
                <div className="flex items-center gap-2 text-base font-bold text-[#F4EE8E]">
                  <List className="w-4 h-4 text-[#E7C768]" />
                  <span>Содержание статьи</span>
                </div>
                <nav className="space-y-2 text-[14px]">
                  {tocHeadings.map((h, idx) => (
                    <a
                      key={idx}
                      href={`#${h.id}`}
                      className={`block text-white/85 hover:text-[#F4EE8E] transition ${
                        h.level === 3 ? "pl-4" : "font-medium"
                      }`}
                    >
                      • {h.text}
                    </a>
                  ))}
                </nav>
              </div>
            )}

            {/* Main Article Body (Rich Telegram Markdown + Line Break & Code Pre-wrap Preservation) */}
            <div itemProp="articleBody">
              <BlogArticleBody content={post.content_md || ""} buttonsJson={post.buttons_json} />
            </div>

            {/* Social Sharing Bar */}
            <div className="rounded-3xl border border-white/25 bg-transparent backdrop-blur-xl p-5 flex flex-wrap items-center justify-between gap-4 shadow-lg">
              <div className="flex items-center gap-2 text-[14px] font-medium text-white">
                <Share2 className="w-4 h-4 text-[#E7C768]" />
                <span>Поделиться статьей:</span>
              </div>
              <div className="flex items-center flex-wrap gap-2 text-[14px]">
                <a
                  href={`https://t.me/share/url?url=${encodeURIComponent(publicPostUrl)}&text=${encodeURIComponent(post.title)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 rounded-xl bg-transparent hover:border-[#E7C768] text-white border border-white/25 font-semibold inline-flex items-center gap-2 transition"
                >
                  <Send className="w-4 h-4 text-[#E7C768]" /> Telegram
                </a>
                <a
                  href={`https://vk.com/share.php?url=${encodeURIComponent(publicPostUrl)}&title=${encodeURIComponent(post.title)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 rounded-xl bg-transparent hover:border-[#E7C768] text-white border border-white/25 font-semibold inline-flex items-center gap-2 transition"
                >
                  ВКонтакте
                </a>
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="px-4 py-2 rounded-xl bg-transparent hover:border-[#E7C768] text-white border border-white/25 font-semibold inline-flex items-center gap-2 transition cursor-pointer"
                >
                  {copied ? <Check className="w-4 h-4 text-[#E7C768]" /> : <FileText className="w-4 h-4 text-[#E7C768]" />}
                  <span>{copied ? "Скопировано" : "Скопировать ссылку"}</span>
                </button>
              </div>
            </div>

            {/* Post Reactions */}
            <div className="rounded-3xl border border-white/25 bg-transparent backdrop-blur-xl p-5 space-y-3 shadow-lg">
              <div className="text-[14px] text-white font-medium">Понравилась статья? Оставьте реакцию:</div>
              <PostReactions postId={post.id} userId={userId} onRequireLogin={() => setAuthOpen(true)} />
            </div>

            {/* Post Comments */}
            <div className="rounded-3xl border border-white/25 bg-transparent backdrop-blur-xl p-5 shadow-lg">
              <PostComments postId={post.id} userId={userId} onRequireLogin={() => setAuthOpen(true)} />
            </div>

            {/* Related Posts */}
            {relatedPosts.length > 0 && (
              <section className="pt-8 border-t border-white/20 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-xl font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent flex items-center gap-2">
                    <BookOpen className="w-5 h-5 text-[#E7C768]" />
                    <span>Читайте также в блоге</span>
                  </h2>
                  <Link
                    to="/blog"
                    className="text-[14px] text-[#F4EE8E] hover:underline flex items-center gap-1 font-semibold"
                  >
                    Все статьи <ChevronRight className="w-4 h-4" />
                  </Link>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {relatedPosts.map((rp) => (
                    <button
                      key={rp.id}
                      type="button"
                      onClick={() => navigate(getBlogPostPath(rp))}
                      className="text-left group rounded-2xl overflow-hidden border border-white/20 bg-transparent backdrop-blur-xl hover:border-[#E7C768]/70 transition p-4 space-y-2 flex flex-col justify-between cursor-pointer"
                    >
                      <div className="space-y-1.5">
                        <span className="text-[14px] text-white/70 tabular-nums">#{rp.public_id}</span>
                        <h3 className="text-[15px] font-bold text-white leading-snug line-clamp-2 group-hover:text-[#F4EE8E] transition">
                          {rp.title}
                        </h3>
                        <p className="text-[14px] text-white/85 line-clamp-2">
                          {cleanArticleExcerpt(rp.excerpt || rp.content_md || "", 90)}
                        </p>
                      </div>
                      <div className="text-[14px] text-[#F4EE8E] font-semibold flex items-center gap-1 pt-2">
                        <span>Читать статью</span>
                        <ChevronRight className="w-4 h-4 text-[#E7C768]" />
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            )}
          </article>
        )}
      </main>

      {authOpen && <AuthModal isOpen={authOpen} onClose={() => setAuthOpen(false)} />}

      <UnifiedAIAssistant assistantType="landing" />
      <PublicMobileNavbar />
    </div>
  );
}
