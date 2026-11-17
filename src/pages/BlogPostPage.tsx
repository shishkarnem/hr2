import React, { useEffect, useState, useMemo } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { dbClient } from "@/lib/dbClient";
import { RichTrainingMaterialCard } from "@/components/RichTrainingMarkdown";
import PostReactions from "@/components/PostReactions";
import PostComments from "@/components/PostComments";
import AuthModal from "@/components/AuthModal";
import { useSeo, SITE_URL } from "@/lib/seo";
import SiteHeader from "@/components/SiteHeader";
import UnifiedAIAssistant from "@/components/UnifiedAIAssistant";
import PublicMobileNavbar from "@/components/PublicMobileNavbar";
import { mdExcerpt, cleanArticleExcerpt } from "@/lib/mdExcerpt";
import { transliterateToSlug } from "@/lib/links";
import { rrImg } from "@/lib/img";
import {
  ChevronRight,
  Clock,
  FileText,
  Share2,
  List,
  Sparkles,
  Check,
  Send,
  BookOpen,
  ArrowLeft,
  Calendar,
  UserCheck
} from "lucide-react";
import { toast } from "sonner";

function slugifyHeadingText(text: string): string {
  return transliterateToSlug(text) || "section";
}

export default function BlogPostPage() {
  const navigate = useNavigate();
  const { pid: rawPid } = useParams<{ pid: string }>();
  const pid = (rawPid || "").replace(/^post/, "");
  const publicPostUrl = `${SITE_URL}/blog/post${pid || rawPid}`;

  const [post, setPost] = useState<any>(null);
  const [relatedPosts, setRelatedPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  // Extract table of contents headings (h2 and h3) from markdown
  const tocHeadings = useMemo(() => {
    if (!post?.content_md) return [];
    const lines = post.content_md.split("\n");
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

  // Extract FAQ items for JSON-LD FAQPage schema
  const faqItems = useMemo(() => {
    if (!post?.content_md) return [];
    const faqs: { question: string; answer: string }[] = [];
    const faqSection = post.content_md.split(/##\s+(?:Часто задаваемые вопросы|FAQ)/i)[1];
    if (faqSection) {
      const qBlocks = faqSection.split(/###\s+/);
      for (const block of qBlocks) {
        const lines = block.trim().split("\n");
        if (lines.length >= 2) {
          const question = lines[0].replace(/[*_#`]/g, "").trim();
          const answer = lines.slice(1).join(" ").replace(/[*_#`]/g, "").trim();
          if (question && answer) {
            faqs.push({ question, answer });
          }
        }
      }
    }
    return faqs;
  }, [post?.content_md]);

  // Calculate word count & estimated reading time
  const wordCount = useMemo(() => {
    if (!post?.content_md) return 0;
    const cleanText = post.content_md.replace(/<[^>]*>/g, " ").replace(/[#*`>_\-]/g, " ");
    const words = cleanText.trim().split(/\s+/).filter(Boolean);
    return words.length;
  }, [post?.content_md]);

  const readingTime = useMemo(() => {
    return Math.max(1, Math.ceil(wordCount / 180));
  }, [wordCount]);

  const excerpt = useMemo(() => {
    if (!post) return "";
    return cleanArticleExcerpt(post.excerpt || post.content_md || "", 240);
  }, [post]);

  // Dynamic SEO setup for Google, Yandex, and AI Search Crawlers
  useSeo(
    post
      ? {
          title: `${post.title} — Блог Робот Рекрутер`,
          description: excerpt || `${post.title} — экспертная статья в блоге Робот Рекрутер.`,
          keywords: `${post.title}, автоматизация найма, ИИ рекрутинг, Робот Рекрутер, ИИ скрининг, подбор персонала, hr`,
          canonical: publicPostUrl,
          ogUrl: publicPostUrl,
          ogTitle: post.title,
          ogDescription: excerpt,
          ogImage: post.cover_url || `${SITE_URL}/logos/RR-Logo.png`,
          ogType: "article",
          articlePublishedTime: post.created_at,
          articleModifiedTime: post.updated_at || post.created_at,
          jsonLd: [
            {
              "@context": "https://schema.org",
              "@type": "BlogPosting",
              "@id": publicPostUrl,
              headline: post.title,
              description: excerpt,
              articleBody: post.content_md,
              wordCount: wordCount,
              inLanguage: "ru-RU",
              image: post.cover_url ? [post.cover_url] : [`${SITE_URL}/logos/RR-Logo.png`],
              datePublished: post.created_at,
              dateModified: post.updated_at || post.created_at,
              mainEntityOfPage: {
                "@type": "WebPage",
                "@id": publicPostUrl,
              },
              author: {
                "@type": "Organization",
                name: "Робот Рекрутер",
                url: SITE_URL,
              },
              publisher: {
                "@type": "Organization",
                name: "Робот Рекрутер",
                url: SITE_URL,
                logo: {
                  "@type": "ImageObject",
                  url: `${SITE_URL}/logos/RR-Logo.png`,
                },
              },
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
                {
                  "@type": "ListItem",
                  position: 3,
                  name: post.title,
                  item: publicPostUrl,
                },
              ],
            },
            ...(faqItems.length > 0
              ? [
                  {
                    "@context": "https://schema.org",
                    "@type": "FAQPage",
                    mainEntity: faqItems.map((f) => ({
                      "@type": "Question",
                      name: f.question,
                      acceptedAnswer: {
                        "@type": "Answer",
                        text: f.answer,
                      },
                    })),
                  },
                ]
              : []),
          ],
        }
      : {}
  );

  useEffect(() => {
    window.scrollTo(0, 0);
    (async () => {
      try {
        const res = await fetch(`/api/posts/${pid}`);
        if (res.ok) {
          const data = await res.json().catch(() => null);
          setPost(data);
        } else {
          setPost(null);
        }
      } catch (e) {
        console.error("Error fetching post from /api/posts/", e);
        setPost(null);
      } finally {
        setLoading(false);
      }

      // Fetch related posts for internal linking
      try {
        const allRes = await fetch("/api/posts");
        if (allRes.ok) {
          const allData = await allRes.json().catch(() => null);
          if (Array.isArray(allData)) {
            const others = allData.filter((p: any) => p.public_id !== pid && p.id !== pid).slice(0, 3);
            setRelatedPosts(others);
          }
        }
      } catch (e) {}

      try {
        const {
          data: { user },
        } = await dbClient.auth.getUser();
        setUserId(user?.id ?? null);
      } catch (e) {}
    })();
    const { data: sub } = dbClient.auth.onAuthStateChange((_e, s) => setUserId(s?.user?.id ?? null));
    return () => sub.subscription.unsubscribe();
  }, [pid]);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(publicPostUrl);
    setCopied(true);
    toast.success("Ссылка на статью скопирована!");
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#17344F]/65 via-[#1E4468]/50 to-[#265582]/65 text-white font-sans relative">
      <SiteHeader active="blog" />

      <main className="max-w-4xl mx-auto px-4 md:px-8 py-6 md:py-10 space-y-6">
        {/* Breadcrumb Navigation (Visual + Schema.org Microdata) */}
        <nav
          aria-label="Хлебные крошки"
          className="flex items-center flex-wrap gap-2 text-xs text-slate-300 py-1"
          itemScope
          itemType="https://schema.org/BreadcrumbList"
        >
          <span itemProp="itemListElement" itemScope itemType="https://schema.org/ListItem">
            <Link to="/" itemProp="item" className="hover:text-[#E7C768] transition">
              <span itemProp="name">Главная</span>
            </Link>
            <meta itemProp="position" content="1" />
          </span>
          <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
          <span itemProp="itemListElement" itemScope itemType="https://schema.org/ListItem">
            <Link to="/blog" itemProp="item" className="hover:text-[#E7C768] transition">
              <span itemProp="name">Блог</span>
            </Link>
            <meta itemProp="position" content="2" />
          </span>
          {post && (
            <>
              <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
              <span itemProp="itemListElement" itemScope itemType="https://schema.org/ListItem" className="text-slate-200 font-medium truncate max-w-[200px] sm:max-w-[320px]">
                <span itemProp="name">{post.title}</span>
                <meta itemProp="position" content="3" />
              </span>
            </>
          )}
        </nav>

        {loading ? (
          <div className="text-center text-slate-300 py-20">Загрузка материалов статьи...</div>
        ) : !post ? (
          <div className="text-center bg-[#1E4468]/60 border border-white/10 rounded-3xl p-10 space-y-4">
            <BookOpen className="w-12 h-12 text-[#E7C768] mx-auto opacity-70" />
            <h1 className="text-2xl font-bold text-white">Статья не найдена</h1>
            <p className="text-slate-300 max-w-md mx-auto">
              Запрошенная статья #{pid} не найдена или была перемещена. Вы можете просмотреть наш актуальный блог с практической информацией.
            </p>
            <button
              onClick={() => navigate("/blog")}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-gradient-to-r from-[#F4EE8E] to-[#D99E41] text-[#17344F] font-bold shadow-lg hover:opacity-95 transition"
            >
              <ArrowLeft className="w-4 h-4" /> Перейти в каталог блога
            </button>
          </div>
        ) : (
          <article itemScope itemType="https://schema.org/BlogPosting" className="space-y-6">
            <meta itemProp="mainEntityOfPage" content={publicPostUrl} />

            {/* Cover Image */}
            {post.cover_url && (
              <div className="aspect-[16/9] rounded-3xl overflow-hidden border border-[#E7C768]/40 bg-transparent backdrop-blur-2xl shadow-2xl">
                <img
                  src={rrImg(post.cover_url)}
                  alt={post.title}
                  itemProp="image"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              </div>
            )}

            {/* Header & Meta Block */}
            <header className="space-y-4 bg-transparent border border-[#E7C768]/40 rounded-3xl p-6 md:p-8 backdrop-blur-2xl">
              <div className="flex flex-wrap items-center gap-3 text-sm text-white/90">
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-transparent text-[#F4EE8E] border border-[#E7C768]/40 font-semibold text-sm backdrop-blur-md">
                  <UserCheck className="w-4 h-4 text-[#E7C768]" /> Экспертный гайд
                </span>
                <span className="flex items-center gap-1.5 text-white/80 text-sm">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  <time itemProp="datePublished" dateTime={post.created_at}>
                    {new Date(post.created_at).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })}
                  </time>
                </span>
                <span className="flex items-center gap-1 text-slate-400">
                  <Clock className="w-3.5 h-3.5 text-slate-400" /> {readingTime} мин. чтения
                </span>
                <span className="flex items-center gap-1 text-slate-400">
                  <FileText className="w-3.5 h-3.5 text-slate-400" /> {wordCount} слов
                </span>
                <span className="text-slate-500">· ID: #{post.public_id}</span>
              </div>

              <h1
                itemProp="headline"
                className="text-2xl sm:text-3xl md:text-4xl font-black leading-tight"
                style={{
                  backgroundImage: "linear-gradient(135deg,#F4EE8E,#D99E41)",
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  color: "transparent",
                }}
              >
                {post.title}
              </h1>

              {excerpt && (
                <p itemProp="description" className="text-slate-200 text-base md:text-lg leading-relaxed border-l-2 border-[#E7C768] pl-4 italic">
                  {excerpt}
                </p>
              )}

              {/* Author badge */}
              <div itemProp="author" itemScope itemType="https://schema.org/Organization" className="flex items-center gap-3 pt-2 border-t border-white/10">
                <img src="/logos/RR-Logo.png" alt="Робот Рекрутер" className="w-8 h-8 rounded-full border border-white/20 bg-[#17344F]" />
                <div className="text-xs">
                  <span itemProp="name" className="font-bold text-white block">Робот Рекрутер</span>
                  <span className="text-slate-400">Платформа автоматизации найма & ИИ-рекрутинга</span>
                </div>
              </div>
            </header>

            {/* AI Summary / Executive Key Takeaways Callout Box (Optimized for Readers & AI Search Models) */}
            <div className="rounded-3xl border border-[#E7C768]/40 bg-gradient-to-r from-[#E7C768]/15 via-white/5 to-[#D99E41]/10 backdrop-blur-xl p-5 md:p-6 space-y-3 shadow-xl">
              <div className="flex items-center gap-2.5 text-sm font-bold text-[#F4EE8E]">
                <Sparkles className="w-5 h-5 text-[#E7C768] shrink-0" />
                <span>Ключевые тезисы статьи (AI Summary)</span>
              </div>
              <ul className="space-y-2 text-sm text-slate-100">
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-[#E7C768] shrink-0 mt-0.5" />
                  <span><strong>Высокая скорость отбора:</strong> ИИ сокращает первичный скрининг откликов с нескольких часов до 2–3 минут.</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-[#E7C768] shrink-0 mt-0.5" />
                  <span><strong>Объективная оценка:</strong> Проведение 24/7 интерактивных ИИ-интервью без предвзятости и усталости.</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-[#E7C768] shrink-0 mt-0.5" />
                  <span><strong>Снижение текучести:</strong> Автоматический онбординг и тестирование кандидатов до и в первые дни работы.</span>
                </li>
              </ul>
            </div>

            {/* Table of Contents (TOC) */}
            {tocHeadings.length > 2 && (
              <div className="rounded-3xl border border-white/20 bg-transparent backdrop-blur-xl p-5 md:p-6 space-y-3 shadow-lg">
                <div className="flex items-center gap-2 text-sm font-bold text-[#F4EE8E]">
                  <List className="w-4 h-4 text-[#E7C768]" />
                  <span>Содержание статьи</span>
                </div>
                <nav className="space-y-2 text-sm">
                  {tocHeadings.map((h, idx) => (
                    <a
                      key={idx}
                      href={`#${h.id}`}
                      className={`block text-slate-300 hover:text-[#F4EE8E] transition ${
                        h.level === 3 ? "pl-4 text-xs text-slate-400" : "font-medium"
                      }`}
                    >
                      • {h.text}
                    </a>
                  ))}
                </nav>
              </div>
            )}

            {/* Main Article Content */}
            <div itemProp="articleBody">
              <RichTrainingMaterialCard>{post.content_md || ""}</RichTrainingMaterialCard>
            </div>

            {/* Social Sharing Bar */}
            <div className="rounded-3xl border border-white/20 bg-transparent backdrop-blur-xl p-5 flex flex-wrap items-center justify-between gap-4 shadow-lg">
              <div className="flex items-center gap-2 text-sm font-medium text-white">
                <Share2 className="w-4 h-4 text-[#E7C768]" /> Поделиться статьей:
              </div>
              <div className="flex items-center flex-wrap gap-2 text-sm">
                <a
                  href={`https://t.me/share/url?url=${encodeURIComponent(publicPostUrl)}&text=${encodeURIComponent(post.title)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 rounded-xl bg-transparent hover:bg-white/10 text-white border border-white/20 font-semibold flex items-center gap-2 transition"
                >
                  <Send className="w-4 h-4 text-[#E7C768]" /> Telegram
                </a>
                <a
                  href={`https://vk.com/share.php?url=${encodeURIComponent(publicPostUrl)}&title=${encodeURIComponent(post.title)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 rounded-xl bg-transparent hover:bg-white/10 text-white border border-white/20 font-semibold flex items-center gap-2 transition"
                >
                  VKontakte
                </a>
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="px-4 py-2 rounded-xl bg-transparent hover:bg-white/10 text-white border border-white/20 font-semibold flex items-center gap-2 transition cursor-pointer"
                >
                  {copied ? <Check className="w-4 h-4 text-[#E7C768]" /> : <FileText className="w-4 h-4 text-[#E7C768]" />}
                  <span>{copied ? "Скопировано!" : "Скопировать ссылку"}</span>
                </button>
              </div>
            </div>

            {/* Post Reactions */}
            <div className="rounded-3xl border border-white/20 bg-transparent backdrop-blur-xl p-5 space-y-3 shadow-lg">
              <div className="text-sm text-slate-200 font-medium">Понравилась статья? Оставьте реакцию:</div>
              <PostReactions postId={post.id} userId={userId} onRequireLogin={() => setAuthOpen(true)} />
            </div>

            {/* Post Comments */}
            <div className="rounded-3xl border border-white/20 bg-transparent backdrop-blur-xl p-5 shadow-lg">
              <PostComments postId={post.id} userId={userId} onRequireLogin={() => setAuthOpen(true)} />
            </div>

            {/* Related Posts Section for Internal Linking */}
            {relatedPosts.length > 0 && (
              <section className="pt-8 border-t border-white/20 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent flex items-center gap-2">
                    <BookOpen className="w-5 h-5 text-[#E7C768]" /> Читайте также в блоге
                  </h2>
                  <Link to="/blog" className="text-sm text-[#E7C768] hover:underline flex items-center gap-1 font-semibold">
                    Все статьи <ChevronRight className="w-4 h-4" />
                  </Link>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {relatedPosts.map((rp) => (
                    <button
                      key={rp.id}
                      type="button"
                      onClick={() => navigate(`/blog/post${rp.public_id}`)}
                      className="text-left group rounded-2xl overflow-hidden border border-white/15 bg-transparent backdrop-blur-xl hover:border-[#E7C768]/60 transition p-4 space-y-2 flex flex-col justify-between cursor-pointer"
                    >
                      <div className="space-y-1.5">
                        <span className="text-xs text-slate-400">#{rp.public_id}</span>
                        <h3 className="text-sm font-bold text-white leading-snug line-clamp-2 group-hover:text-[#F4EE8E] transition">
                          {rp.title}
                        </h3>
                        <p className="text-sm text-slate-300 line-clamp-2">{cleanArticleExcerpt(rp.excerpt || rp.content_md || "", 90)}</p>
                      </div>
                      <div className="text-xs text-[#E7C768] font-semibold flex items-center gap-1 pt-2">
                        Читать статью <ChevronRight className="w-3.5 h-3.5" />
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
