/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import dns from "dns";
if (dns.setDefaultResultOrder) {
  try {
    dns.setDefaultResultOrder("ipv4first");
  } catch (e) {
    console.warn("DNS result order setup warning:", e);
  }
}

import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";

import { db } from "./server/common";
import { getProTalkDB, loadAllFromProTalkDB, checkpointDatabase } from "./server/db";
import { initBackupCronJob } from "./server/cron";

import { adminRouter } from "./server/routes/admin";
import { authRouter } from "./server/routes/auth";
import { reviewsRouter } from "./server/routes/reviews";
import { employersRouter } from "./server/routes/employers";
import { companiesRouter } from "./server/routes/companies";
import { projectsRouter } from "./server/routes/projects";
import { candidatesRouter } from "./server/routes/candidates";
import { aiRouter } from "./server/routes/ai";
import { blogRouter } from "./server/routes/blog";
import { miscRouter } from "./server/routes/public";
import filesRouter from "./server/routes/files";
import { teamRouter } from "./server/routes/team";
import { pushRouter } from "./server/routes/push/pushRoutes";
import { sitePreviewRouter } from "./server/services/sitePreview/router";
import {
  resolveStaticRoots,
  registerPwaAssetRoutes,
  registerPublicStaticFallback,
  setStaticAssetHeaders,
} from "./server/services/pwa/staticAssets";
import { initSavRssScheduler } from "./server/services/blog/savRssSync";
import { normalizeBlogCoverImageUrl } from "./server/services/blog/blogSchema";

export { db };

dotenv.config();

process.on("unhandledRejection", (reason) => {
  console.error("[Server] Unhandled Promise Rejection:", reason);
});
process.on("uncaughtException", (error) => {
  console.error("[Server] Uncaught Exception:", error);
});

async function startServer() {
  const app = express();
  // In Google AI Studio sandbox: Nginx listens on 8080 and forwards to DEFAULT_APP_PORT (3000).
  // On custom deployment servers (e.g. NodeHost/PM2): app must listen on process.env.PORT.
  const PORT = process.env.APPLET_ID
    ? Number(process.env.DEFAULT_APP_PORT || 3000)
    : Number(process.env.PORT || 3000);
  const HOST = process.env.HOST || "0.0.0.0";

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ extended: true, limit: "50mb" }));

  // API health checks FIRST
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });
  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  // Mount API Express Routers
  app.use("/api/auth", authRouter);
  app.use("/api/admin", adminRouter);
  app.use("/api", authRouter);
  app.use("/api", reviewsRouter);
  app.use("/api", employersRouter);
  app.use("/api", companiesRouter);
  app.use("/api", projectsRouter);
  app.use("/api", candidatesRouter);
  app.use("/api", aiRouter);
  app.use("/api", blogRouter);
  app.use("/api", miscRouter);
  app.use("/api", teamRouter);
  app.use("/api", pushRouter);
  app.use("/api", sitePreviewRouter);
  app.use(filesRouter);

  // ==========================================
  // SEO & AI SEARCH PROTOCOL ENDPOINTS
  // ==========================================

  // 1. Dynamic XML Sitemap (Google, Yandex, Bing)
  app.get("/sitemap.xml", async (_req, res) => {
    try {
      const siteUrl = "https://hr-rr.online";
      const dbInstance = await getProTalkDB();
      const posts = await dbInstance.all(
        "SELECT public_id, slug, updated_at, created_at FROM posts WHERE (is_published = 1 OR CAST(is_published AS TEXT) = '1') AND (category IS NULL OR category = 'blog' OR category = '') ORDER BY COALESCE(is_pinned, 0) DESC, created_at DESC"
      );

      let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
      xml += `<urlset xmlns="http://www.sitemap.org/schemas/sitemap/0.9">\n`;
      xml += `  <url>\n    <loc>${siteUrl}/</loc>\n    <changefreq>daily</changefreq>\n    <priority>1.0</priority>\n  </url>\n`;
      xml += `  <url>\n    <loc>${siteUrl}/blog</loc>\n    <changefreq>daily</changefreq>\n    <priority>0.9</priority>\n  </url>\n`;

      for (const p of posts) {
        const lastmod = (p.updated_at || p.created_at || new Date().toISOString()).split("T")[0];
        const postSeg = p.slug ? encodeURIComponent(p.slug) : `post${p.public_id}`;
        xml += `  <url>\n    <loc>${siteUrl}/blog/${postSeg}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>\n`;
      }

      xml += `  <url>\n    <loc>${siteUrl}/vacancy</loc>\n    <changefreq>daily</changefreq>\n    <priority>0.8</priority>\n  </url>\n`;
      xml += `  <url>\n    <loc>${siteUrl}/faq</loc>\n    <changefreq>weekly</changefreq>\n    <priority>0.7</priority>\n  </url>\n`;
      xml += `  <url>\n    <loc>${siteUrl}/demo</loc>\n    <changefreq>weekly</changefreq>\n    <priority>0.7</priority>\n  </url>\n`;
      xml += `</urlset>`;

      res.setHeader("Content-Type", "application/xml; charset=utf-8");
      res.send(xml);
    } catch (e: any) {
      res.status(500).send("Sitemap generation error: " + e.message);
    }
  });

  // 2. Robots.txt for Search Engines and AI Crawlers (GPTBot, Perplexity, ClaudeBot, YandexBot)
  app.get("/robots.txt", (_req, res) => {
    const robots = [
      "User-agent: *",
      "Disallow: /api/",
      "Disallow: /admin/",
      "Allow: /",
      "Allow: /blog",
      "Allow: /blog/*",
      "",
      "User-agent: Yandex",
      "Disallow: /api/",
      "Disallow: /admin/",
      "Allow: /",
      "Allow: /blog",
      "Allow: /blog/*",
      "Host: hr-rr.online",
      "",
      "User-agent: Googlebot",
      "Disallow: /api/",
      "Disallow: /admin/",
      "Allow: /",
      "Allow: /blog",
      "Allow: /blog/*",
      "",
      "User-agent: GPTBot",
      "Allow: /",
      "Allow: /blog",
      "Allow: /blog/*",
      "Allow: /llms.txt",
      "Allow: /llms-full.txt",
      "",
      "User-agent: PerplexityBot",
      "Allow: /",
      "Allow: /blog",
      "Allow: /blog/*",
      "Allow: /llms.txt",
      "Allow: /llms-full.txt",
      "",
      "User-agent: ClaudeBot",
      "Allow: /",
      "Allow: /blog",
      "Allow: /blog/*",
      "Allow: /llms.txt",
      "Allow: /llms-full.txt",
      "",
      "User-agent: Bytespider",
      "Allow: /",
      "Allow: /blog",
      "Allow: /blog/*",
      "",
      "Sitemap: https://hr-rr.online/sitemap.xml"
    ].join("\n");
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.send(robots);
  });

  // 3. /llms.txt (AI Search Context File for ChatGPT, Perplexity, Claude, Gemini)
  app.get("/llms.txt", async (_req, res) => {
    try {
      const siteUrl = "https://hr-rr.online";
      const dbInstance = await getProTalkDB();
      const posts = await dbInstance.all(
        "SELECT public_id, slug, title, excerpt FROM posts WHERE (is_published = 1 OR CAST(is_published AS TEXT) = '1') AND (category IS NULL OR category = 'blog' OR category = '') ORDER BY COALESCE(is_pinned, 0) DESC, created_at DESC LIMIT 50"
      );
      const faqItems = await dbInstance.all("SELECT question, answer, category FROM faq_items WHERE is_published = 1 ORDER BY sort_order ASC");

      let txt = `# Платформа «Робот Рекрутер» (hr-rr.online)\n\n`;
      txt += `> Робот Рекрутер — ведущая ИИ-платформа для автоматизации найма, подбора персонала, проведения 24/7 интерактивных ИИ-интервью и скрининга резюме.\n\n`;
      txt += `## Ключевые сервисы и разделы:\n`;
      txt += `- [Главная страница](${siteUrl}/): Онлайн-демо ИИ-собеседований, расчёт окупаемости найма, возможности системы.\n`;
      txt += `- [Блог](${siteUrl}/blog): Практические статьи об ИИ-рекрутинге, оценке кандидатов и методологии отбора.\n`;
      txt += `- [Каталог вакансий](${siteUrl}/vacancy): Открытые вакансии прямых работодателей с онлайн ИИ-интервью.\n`;
      txt += `- [Часто задаваемые вопросы](${siteUrl}/faq): База знаний для соискателей и рекрутеров.\n`;
      txt += `- [ИИ-Академия](${siteUrl}/academy): Обучающие материалы, инструкции по автонайму и онбордингу.\n\n`;
      txt += `## Экспертные публикации блога:\n`;
      for (const p of posts) {
        const postSeg = p.slug ? encodeURIComponent(p.slug) : `post${p.public_id}`;
        txt += `- [${p.title}](${siteUrl}/blog/${postSeg}): ${p.excerpt || "Подробное практическое руководство по автоматизации подбора персонала."}\n`;
      }
      if (faqItems && faqItems.length > 0) {
        txt += `\n## База знаний и частые вопросы (FAQ):\n`;
        for (const item of faqItems) {
          txt += `- **Вопрос**: ${item.question}\n  **Ответ**: ${item.answer}\n`;
        }
      }
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.send(txt);
    } catch (e: any) {
      res.status(500).send("Error generating llms.txt");
    }
  });

  // 4. /llms-full.txt (Full AI Markdown Knowledge Base Context for LLM Indexing & RAG)
  app.get("/llms-full.txt", async (_req, res) => {
    try {
      const siteUrl = "https://hr-rr.online";
      const dbInstance = await getProTalkDB();
      const posts = await dbInstance.all(
        "SELECT public_id, slug, title, excerpt, content_md, created_at FROM posts WHERE (is_published = 1 OR CAST(is_published AS TEXT) = '1') AND (category IS NULL OR category = 'blog' OR category = '') ORDER BY COALESCE(is_pinned, 0) DESC, created_at DESC LIMIT 50"
      );
      const faqItems = await dbInstance.all("SELECT question, answer, category FROM faq_items WHERE is_published = 1 ORDER BY sort_order ASC");

      let txt = `# Полный контекст блога и базы знаний «Робот Рекрутер» (hr-rr.online)\n\n`;
      txt += `Файл содержит полный машиночитаемый текст статей и базы знаний для прямого цитирования и ответа нейросетями (Perplexity, SearchGPT, Gemini, ChatGPT, Claude).\n\n`;
      for (const p of posts) {
        const postSeg = p.slug ? encodeURIComponent(p.slug) : `post${p.public_id}`;
        txt += `---\n\n# ${p.title}\nURL: ${siteUrl}/blog/${postSeg}\nДата публикации: ${p.created_at}\n\n${p.content_md}\n\n`;
      }
      if (faqItems && faqItems.length > 0) {
        txt += `---\n\n# Официальная база знаний и ответы на частые вопросы (FAQ)\n\n`;
        for (const item of faqItems) {
          txt += `### ${item.question}\nКатегория: ${item.category}\n\n${item.answer}\n\n`;
        }
      }
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.send(txt);
    } catch (e: any) {
      res.status(500).send("Error generating llms-full.txt");
    }
  });

  // 5. RSS 2.0 Feed (/rss.xml, /feed.xml)
  app.get(["/rss.xml", "/feed.xml"], async (_req, res) => {
    try {
      const siteUrl = "https://hr-rr.online";
      const dbInstance = await getProTalkDB();
      const posts = await dbInstance.all(
        "SELECT public_id, slug, title, excerpt, content_md, created_at FROM posts WHERE (is_published = 1 OR CAST(is_published AS TEXT) = '1') AND (category IS NULL OR category = 'blog' OR category = '') ORDER BY COALESCE(is_pinned, 0) DESC, created_at DESC LIMIT 30"
      );

      let rss = `<?xml version="1.0" encoding="UTF-8" ?>\n`;
      rss += `<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n`;
      rss += `<channel>\n`;
      rss += `  <title>Блог Робот Рекрутер — ИИ-найм и автоматизация HR</title>\n`;
      rss += `  <link>${siteUrl}/blog</link>\n`;
      rss += `  <description>Практические материалы о найме, ИИ-интервью и автоматизации подбора персонала.</description>\n`;
      rss += `  <language>ru-ru</language>\n`;
      rss += `  <atom:link href="${siteUrl}/rss.xml" rel="self" type="application/rss+xml" />\n`;

      for (const p of posts) {
        const postSeg = p.slug ? encodeURIComponent(p.slug) : `post${p.public_id}`;
        const link = `${siteUrl}/blog/${postSeg}`;
        rss += `  <item>\n`;
        rss += `    <title><![CDATA[${p.title}]]></title>\n`;
        rss += `    <link>${link}</link>\n`;
        rss += `    <guid isPermaLink="true">${link}</guid>\n`;
        rss += `    <pubDate>${new Date(p.created_at).toUTCString()}</pubDate>\n`;
        rss += `    <description><![CDATA[${p.excerpt || "Экспертная статья в блоге Робот Рекрутер"}]]></description>\n`;
        rss += `  </item>\n`;
      }

      rss += `</channel>\n</rss>`;
      res.setHeader("Content-Type", "application/xml; charset=utf-8");
      res.send(rss);
    } catch (e: any) {
      res.status(500).send("Error generating RSS feed");
    }
  });

  // Simple Markdown to HTML converter for Server-Side Article Pre-rendering
  function convertMarkdownToHtml(md: string): string {
    if (!md) return "";
    let html = md
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    // Headings
    html = html.replace(/^### (.*$)/gim, '<h3 style="font-size:1.25rem;font-weight:700;margin-top:1.5rem;margin-bottom:0.5rem;color:#F4EE8E;">$1</h3>');
    html = html.replace(/^## (.*$)/gim, '<h2 style="font-size:1.5rem;font-weight:700;margin-top:2rem;margin-bottom:0.75rem;color:#F4EE8E;border-bottom:1px solid rgba(231,199,104,0.3);padding-bottom:0.5rem;">$1</h2>');
    html = html.replace(/^# (.*$)/gim, '<h1 style="font-size:2rem;font-weight:800;margin-top:1.5rem;margin-bottom:1rem;color:#F4EE8E;">$1</h1>');

    // Images & Links
    html = html.replace(/!\[(.*?)\]\((.*?)\)/g, '<img src="$2" alt="$1" style="max-width:100%;height:auto;border-radius:1rem;margin:1rem 0;" />');
    html = html.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" style="color:#E7C768;text-decoration:underline;" target="_blank" rel="noopener">$1</a>');

    // Formatting
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
    html = html.replace(/^>\s+(.*$)/gim, '<blockquote style="border-left:4px solid #E7C768;padding-left:1rem;margin:1rem 0;font-style:italic;background:rgba(231,199,104,0.08);border-radius:0.5rem;padding:0.75rem;">$1</blockquote>');

    // Lists
    html = html.replace(/^\*\s+(.*$)/gim, '<li style="margin-bottom:0.35rem;">$1</li>');
    html = html.replace(/^-\s+(.*$)/gim, '<li style="margin-bottom:0.35rem;">$1</li>');

    // Paragraphs
    const lines = html.split("\n\n");
    html = lines.map(line => {
      const trimmed = line.trim();
      if (!trimmed) return "";
      if (trimmed.startsWith("<h") || trimmed.startsWith("<blockquote") || trimmed.startsWith("<img") || trimmed.startsWith("<li")) {
        return trimmed;
      }
      return `<p style="margin-bottom:1rem;line-height:1.7;color:#e2e8f0;">${trimmed}</p>`;
    }).join("\n");

    return html;
  }

  // Helper for dynamic OpenGraph & Server HTML pre-rendering directly from PostgreSQL BD ProTalk
  async function getPageMeta(urlPath: string, userAgent?: string) {
    const siteUrl = "https://hr-rr.online";
    let title = "Робот Рекрутер — ИИ-платформа автоматизации найма и собеседований";
    let description = "ИИ-платформа для автоматического подбора персонала, скрининга резюме и проведения 24/7 интерактивных собеседований.";
    let keywords = "ИИ рекрутер, автоматизация найма, подбор персонала, hr рекрутинг, скрининг резюме, онлайн собеседование";
    let image = "https://hr-rr.online/icons/social/og-image.jpg";
    let type = "website";
    let jsonLd: any = null;
    let prerenderedHtml: string = "";

    const BOT_UA_REGEX = /Googlebot|YandexBot|YandexImages|bingbot|Baiduspider|facebookexternalhit|Twitterbot|LinkedInBot|Slackbot|TelegramBot|WhatsApp|GPTBot|ChatGPT-User|PerplexityBot|ClaudeBot|Bytespider|Applebot/i;
    const isBot = Boolean(userAgent && BOT_UA_REGEX.test(userAgent));

    try {
      const dbInstance = await getProTalkDB();
      const cleanPath = urlPath.split("?")[0] || "/";

      // 1. Root / Main page (/ or /main)
      if (cleanPath === "/" || cleanPath === "/main") {
        title = "Робот Рекрутер — ИИ-платформа автоматизации найма и собеседований";
        description = "Автоматический подбор персонала, скрининг резюме за секунды, проведение 24/7 интерактивных собеседований и адаптация сотрудников.";
        keywords = "ИИ рекрутер, робот рекрутер, автоматизация найма, собеседование с ИИ, скрининг резюме, подбор персонала";

        jsonLd = {
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: "Робот Рекрутер",
          url: siteUrl,
          description: description,
          inLanguage: "ru",
        };

        if (isBot) {
          prerenderedHtml = `
            <main style="max-width:960px;margin:0 auto;padding:2.5rem 1rem;font-family:system-ui,-apple-system,sans-serif;color:#ffffff;line-height:1.6;">
              <header style="text-align:center;margin-bottom:2.5rem;">
                <h1 style="font-size:2.2rem;font-weight:800;color:#F4EE8E;margin-bottom:1rem;line-height:1.3;">Робот Рекрутер — ИИ-платформа автоматизации найма и собеседований</h1>
                <p style="font-size:1.15rem;color:#e2e8f0;max-width:760px;margin:0 auto 1.5rem;">Комплексная экосистема автоматического подбора персонала, скрининга резюме за секунды, проведения интерактивных голосовых и текстовых интервью 24/7 и корпоративной адаптации сотрудников.</p>
                <div style="display:flex;gap:1rem;justify-content:center;flex-wrap:wrap;margin-top:1.5rem;">
                  <a href="${siteUrl}/demo" style="background:#E7C768;color:#17344F;padding:0.75rem 1.5rem;border-radius:0.75rem;font-weight:700;text-decoration:none;">Попробовать демо-интервью</a>
                  <a href="${siteUrl}/vacancy" style="border:1px solid #E7C768;color:#E7C768;padding:0.75rem 1.5rem;border-radius:0.75rem;font-weight:600;text-decoration:none;">Каталог вакансий</a>
                  <a href="${siteUrl}/faq" style="border:1px solid rgba(255,255,255,0.3);color:#ffffff;padding:0.75rem 1.5rem;border-radius:0.75rem;text-decoration:none;">База знаний (FAQ)</a>
                  <a href="${siteUrl}/blog" style="border:1px solid rgba(255,255,255,0.3);color:#ffffff;padding:0.75rem 1.5rem;border-radius:0.75rem;text-decoration:none;">Блог</a>
                </div>
              </header>
              <section style="margin-bottom:2.5rem;">
                <h2 style="font-size:1.45rem;color:#F4EE8E;margin-bottom:1rem;">Преимущества и ключевые функции</h2>
                <ul style="padding-left:1.25rem;line-height:1.8;color:#cbd5e1;">
                  <li><strong>3 этапа собеседования:</strong> скрининг резюме до 100 баллов, квалификационный чек-лист из 20 вопросов, ролевые ситуации по методике STAR.</li>
                  <li><strong>Голосовой ввод и распознавание речи:</strong> поддержка текстовых и голосовых ответов кандидатов с мгновенной модерацией нейросетью.</li>
                  <li><strong>Корпоративное обучение:</strong> 3 блока адаптации (Профессия, Продукт, Системы) с тестированием и выдачей именного сертификата.</li>
                  <li><strong>Прозрачные тарифы:</strong> 100 RR за проведение ИИ-интервью, 100 RR за тестирование, 500 RR за брендированный лендинг. 1000 RR в подарок каждому работодателю при регистрации.</li>
                  <li><strong>Надежность и безопасность:</strong> соответствие 152-ФЗ, российские серверы, защита от использования сторонних нейросетей кандидатами.</li>
                </ul>
              </section>
            </main>
          `;
        }
      }
      // 2. Blog posts (/blog/:id, /blog/post:id, /blog/:slug, /posts/:id)
      else if (cleanPath.startsWith("/blog") || cleanPath.startsWith("/posts")) {
        const parts = cleanPath.split("/").filter(Boolean);
        const rawSlugOrId = parts[1] || "";
        const cleanId = /^post\d+$/i.test(rawSlugOrId) ? rawSlugOrId.replace(/^post/i, "") : rawSlugOrId;

        if (rawSlugOrId) {
          const post = await dbInstance.get(
            "SELECT title, seo_title, excerpt, seo_description, seo_keywords, content_md, cover_url, cover_image_url, created_at, updated_at, public_id, slug FROM posts WHERE CAST(public_id AS TEXT) = ? OR id = ? OR slug = ? OR CAST(public_id AS TEXT) = ? LIMIT 1",
            [rawSlugOrId, rawSlugOrId, rawSlugOrId, cleanId]
          );

          if (post) {
            title = `${post.seo_title || post.title} — Блог Робот Рекрутер`;
            const cleanExcerpt = post.seo_description || post.excerpt || (post.content_md || "").replace(/[#*`>_\-]/g, " ").replace(/\s+/g, " ").trim().slice(0, 160);
            description = cleanExcerpt || `${post.title} — экспертный гайд в блоге Робот Рекрутер.`;
            keywords = post.seo_keywords || `${post.title}, подбор персонала, ИИ найм, рекрутинг, Робот Рекрутер`;

            const safeMetaImage = normalizeBlogCoverImageUrl(post.cover_image_url || post.cover_url);
            image = safeMetaImage.startsWith("http") ? safeMetaImage : `${siteUrl}${safeMetaImage.startsWith("/") ? "" : "/"}${safeMetaImage}`;
            type = "article";

            const canonicalUrl = post.slug
              ? `${siteUrl}/blog/${post.slug}`
              : `${siteUrl}/blog/post${post.public_id}`;

            // Build Rich Schema.org JSON-LD
            jsonLd = [
              {
                "@context": "https://schema.org",
                "@type": "BlogPosting",
                "@id": canonicalUrl,
                headline: post.title,
                description: description,
                articleBody: post.content_md,
                datePublished: post.created_at,
                dateModified: post.updated_at || post.created_at,
                image: [image],
                inLanguage: "ru-RU",
                mainEntityOfPage: canonicalUrl,
                author: {
                  "@type": "Organization",
                  name: "Робот Рекрутер",
                  url: siteUrl
                },
                publisher: {
                  "@type": "Organization",
                  name: "Робот Рекрутер",
                  url: siteUrl,
                  logo: {
                    "@type": "ImageObject",
                    url: `${siteUrl}/icons/pwa/pwa-512x512.png`
                  }
                }
              },
              {
                "@context": "https://schema.org",
                "@type": "BreadcrumbList",
                itemListElement: [
                  { "@type": "ListItem", position: 1, name: "Главная", item: siteUrl },
                  { "@type": "ListItem", position: 2, name: "Блог", item: `${siteUrl}/blog` },
                  { "@type": "ListItem", position: 3, name: post.title, item: canonicalUrl }
                ]
              }
            ];

            // Generate Pre-rendered HTML content block inside #root for crawlers & bots
            const bodyHtml = convertMarkdownToHtml(post.content_md || "");
            prerenderedHtml = `
              <div style="max-width:800px;margin:0 auto;padding:2rem 1rem;font-family:sans-serif;background:#17344F;color:#ffffff;border-radius:1rem;">
                <nav aria-label="Breadcrumbs" style="font-size:0.85rem;color:#cbd5e1;margin-bottom:1rem;">
                  <a href="${siteUrl}/" style="color:#cbd5e1;">Главная</a> &gt; 
                  <a href="${siteUrl}/blog" style="color:#cbd5e1;">Блог</a> &gt; 
                  <span>${escapeXml(post.title)}</span>
                </nav>
                <article itemscope itemtype="https://schema.org/BlogPosting">
                  <header>
                    <h1 itemprop="headline" style="font-size:2.25rem;font-weight:800;color:#F4EE8E;margin-bottom:0.75rem;line-height:1.2;">${escapeXml(post.title)}</h1>
                    <div style="font-size:0.85rem;color:#94a3b8;margin-bottom:1.5rem;">
                      Дата публикации: <time itemprop="datePublished" datetime="${post.created_at}">${new Date(post.created_at).toLocaleDateString("ru-RU")}</time>
                      · Автор: <span itemprop="author">Робот Рекрутер</span>
                    </div>
                  </header>
                  <div itemprop="articleBody">
                    ${bodyHtml}
                  </div>
                </article>
              </div>
            `;
          }
        } else {
          title = "Блог о найме и ИИ-технологиях | Робот Рекрутер";
          description = "Практические материалы для рекрутеров и руководителей: как нанимать быстрее, проводить 24/7 ИИ-интервью и автоматизировать онбординг.";
        }
      }
      // 3. FAQ (/faq)
      else if (cleanPath.startsWith("/faq")) {
        title = "Часто задаваемые вопросы (FAQ) | Робот Рекрутер";
        description = "Ответы на ключевые вопросы соискателей и работодателей о тарифах, проведении ИИ-интервью, онбординге и автонайме на платформе Робот Рекрутер.";
        keywords = "FAQ робот рекрутер, вопросы по ИИ найму, тарифы робот рекрутер, автонайм вопросы";

        const faqItems = await dbInstance.all("SELECT question, answer, category FROM faq_items WHERE is_published = 1 ORDER BY sort_order ASC");
        if (faqItems && faqItems.length > 0) {
          jsonLd = {
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: faqItems.map((f: any) => ({
              "@type": "Question",
              name: f.question,
              acceptedAnswer: {
                "@type": "Answer",
                text: f.answer,
              },
            })),
          };

          if (isBot) {
            let faqListHtml = "";
            for (const item of faqItems) {
              faqListHtml += `
                <article style="margin-bottom:1.5rem;padding:1.25rem;background:rgba(255,255,255,0.05);border-radius:0.75rem;border:1px solid rgba(255,255,255,0.15);">
                  <h2 style="font-size:1.15rem;font-weight:700;color:#F4EE8E;margin-bottom:0.5rem;">${escapeXml(item.question)}</h2>
                  <p style="color:#e2e8f0;line-height:1.6;margin:0;">${escapeXml(item.answer)}</p>
                </article>
              `;
            }
            prerenderedHtml = `
              <div style="max-width:850px;margin:0 auto;padding:2.5rem 1rem;font-family:system-ui,-apple-system,sans-serif;color:#ffffff;">
                <h1 style="font-size:2rem;font-weight:800;color:#F4EE8E;margin-bottom:1rem;">Часто задаваемые вопросы (FAQ)</h1>
                <p style="font-size:1.05rem;color:#cbd5e1;margin-bottom:2rem;">Официальная база знаний платформы «Робот Рекрутер»: возможности автонайма, тарифы, настройка собеседований и обучение персонала.</p>
                ${faqListHtml}
              </div>
            `;
          }
        }
      }
      // 4. Demo (/demo)
      else if (cleanPath.startsWith("/demo")) {
        title = "Демо-интервью с ИИ-рекрутером онлайн | Робот Рекрутер";
        description = "Пройдите интерактивное демо-собеседование с искусственным интеллектом в браузере без регистрации.";
      }
      // 5. Vacancy pages (/vacancy and /vacancies)
      else if (cleanPath.includes("/vac") || cleanPath.startsWith("/vacancy")) {
        const vacMatch = cleanPath.match(/\/vac([^\/]+)/);
        const vacId = vacMatch ? vacMatch[1] : "";
        if (vacId && vacId !== "ancy" && vacId !== "ancy/" && vacId !== "ancies") {
          const proj = await dbInstance.get("SELECT id, public_id, role_name, company_name, salary_terms, schedule_terms, vacancy_text FROM projects WHERE id = ? OR slug = ? OR public_id = ?", [vacId, vacId, vacId]);
          if (proj) {
            title = `${proj.role_name || "Вакансия"} — ${proj.company_name || "Компания"} | Робот Рекрутер`;
            if (proj.vacancy_text) {
              description = String(proj.vacancy_text).replace(/\s+/g, " ").trim().slice(0, 160);
            }
            const canonicalUrl = `${siteUrl}/vacancy/${proj.public_id || proj.id}`;

            jsonLd = {
              "@context": "https://schema.org",
              "@type": "JobPosting",
              title: proj.role_name || "Вакансия",
              description: proj.vacancy_text || description,
              identifier: {
                "@type": "PropertyValue",
                name: "Робот Рекрутер",
                value: String(proj.public_id || proj.id),
              },
              hiringOrganization: {
                "@type": "Organization",
                name: proj.company_name || "Компания",
              },
              jobLocation: {
                "@type": "Place",
                address: {
                  "@type": "PostalAddress",
                  addressLocality: "Россия",
                  addressCountry: "RU",
                },
              },
            };

            if (isBot) {
              prerenderedHtml = `
                <div style="max-width:850px;margin:0 auto;padding:2.5rem 1rem;font-family:system-ui,-apple-system,sans-serif;color:#ffffff;">
                  <h1 style="font-size:2rem;font-weight:800;color:#F4EE8E;margin-bottom:0.5rem;">${escapeXml(proj.role_name || "Вакансия")}</h1>
                  <h2 style="font-size:1.2rem;color:#cbd5e1;font-weight:600;margin-bottom:1.5rem;">${escapeXml(proj.company_name || "Работодатель")} · ${escapeXml(proj.salary_terms || "Условия по договоренности")}</h2>
                  <div style="background:rgba(255,255,255,0.05);padding:1.5rem;border-radius:1rem;line-height:1.7;color:#e2e8f0;white-space:pre-wrap;">${escapeXml(proj.vacancy_text || "")}</div>
                </div>
              `;
            }
          }
        } else {
          title = "Каталог открытых вакансий прямых работодателей | Робот Рекрутер";
          description = "Актуальные вакансии с интерактивными ИИ-собеседованиями и моментальной оценкой навыков кандидатов.";

          const activeVacancies = await dbInstance.all("SELECT id, public_id, role_name, company_name, salary_terms, schedule_terms FROM projects WHERE is_published = 1 AND status = 'active' AND role_name IS NOT NULL AND TRIM(role_name) != '' ORDER BY created_at DESC LIMIT 30");
          if (isBot && activeVacancies && activeVacancies.length > 0) {
            let vacHtml = "";
            for (const v of activeVacancies) {
              const salaryText = v.salary_terms || "по договоренности";
              vacHtml += `
                <article style="margin-bottom:1rem;padding:1.25rem;background:rgba(255,255,255,0.05);border-radius:0.75rem;border:1px solid rgba(255,255,255,0.15);">
                  <h2 style="font-size:1.2rem;font-weight:700;color:#F4EE8E;margin-bottom:0.25rem;">
                    <a href="${siteUrl}/vacancy/${v.public_id || v.id}" style="color:#F4EE8E;text-decoration:none;">${escapeXml(v.role_name)}</a>
                  </h2>
                  <p style="color:#cbd5e1;font-size:0.95rem;margin:0.25rem 0;">${escapeXml(v.company_name || "Компания")} · ${salaryText}</p>
                </article>
              `;
            }
            prerenderedHtml = `
              <div style="max-width:850px;margin:0 auto;padding:2.5rem 1rem;font-family:system-ui,-apple-system,sans-serif;color:#ffffff;">
                <h1 style="font-size:2rem;font-weight:800;color:#F4EE8E;margin-bottom:0.5rem;">Каталог открытых вакансий</h1>
                <p style="font-size:1.05rem;color:#cbd5e1;margin-bottom:2rem;">Вакансии с возможностью пройти интерактивное онлайн-собеседование с ИИ-рекрутером в любое время.</p>
                ${vacHtml}
              </div>
            `;
          }
        }
      }
      // 6. Academy (/academy)
      else if (cleanPath.startsWith("/academy") || cleanPath.startsWith("/wiki")) {
        title = "ИИ-Академия и база знаний — Робот Рекрутер";
        description = "Инструкции и методические материалы по настройке автонайма, созданию вакансий, скринингу резюме и адаптации сотрудников.";

        if (isBot) {
          prerenderedHtml = `
            <div style="max-width:850px;margin:0 auto;padding:2.5rem 1rem;font-family:system-ui,-apple-system,sans-serif;color:#ffffff;">
              <h1 style="font-size:2rem;font-weight:800;color:#F4EE8E;margin-bottom:0.75rem;">ИИ-Академия «Робот Рекрутер»</h1>
              <p style="font-size:1.05rem;color:#cbd5e1;margin-bottom:1.5rem;">Полное практическое руководство по настройке экосистемы Робот Рекрутер: создание компаний и вакансий, 3 этапа собеседования, корпоративное обучение и управление кандидатами в CRM.</p>
            </div>
          `;
        }
      }
      // 7. Company Landing (/company/:slug)
      else if (cleanPath.startsWith("/company/")) {
        const parts = cleanPath.split("/").filter(Boolean);
        const slug = parts[1] || "";
        if (slug) {
          const comp = await dbInstance.get("SELECT name, description, slug FROM companies WHERE slug = ? OR id = ?", [slug, slug]);
          if (comp) {
            title = `${comp.name} — Вакансии и карьера | Робот Рекрутер`;
            if (comp.description) {
              description = String(comp.description).replace(/\s+/g, " ").trim().slice(0, 160);
            }
            if (isBot) {
              prerenderedHtml = `
                <div style="max-width:850px;margin:0 auto;padding:2.5rem 1rem;font-family:system-ui,-apple-system,sans-serif;color:#ffffff;">
                  <h1 style="font-size:2rem;font-weight:800;color:#F4EE8E;margin-bottom:0.75rem;">${escapeXml(comp.name)}</h1>
                  <p style="font-size:1.05rem;color:#e2e8f0;margin-bottom:1.5rem;line-height:1.7;">${escapeXml(comp.description || "")}</p>
                </div>
              `;
            }
          }
        }
      }
    } catch (err) {
      console.warn("[getPageMeta] Error querying PostgreSQL BD ProTalk for OpenGraph meta:", err);
    }

    const canonicalUrl = `${siteUrl}${urlPath.startsWith("/") ? urlPath : "/" + urlPath}`;
    return { title, description, keywords, image, type, canonicalUrl, jsonLd, prerenderedHtml };
  }

  function escapeXml(unsafe: string): string {
    return (unsafe || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function injectMetaIntoHtml(
    html: string,
    meta: {
      title: string;
      description: string;
      keywords?: string;
      image: string;
      type: string;
      canonicalUrl: string;
      jsonLd?: any;
      prerenderedHtml?: string;
    }
  ) {
    let result = html;
    result = result.replace(/<title>.*?<\/title>/i, `<title>${escapeXml(meta.title)}</title>`);
    result = result.replace(/<meta\s+name="description"\s+content=".*?"\s*\/?>/i, `<meta name="description" content="${escapeXml(meta.description)}">`);
    
    if (meta.keywords) {
      if (result.includes('<meta name="keywords"')) {
        result = result.replace(/<meta\s+name="keywords"\s+content=".*?"\s*\/?>/i, `<meta name="keywords" content="${escapeXml(meta.keywords)}">`);
      } else {
        result = result.replace(/<\/head>/i, `<meta name="keywords" content="${escapeXml(meta.keywords)}">\n</head>`);
      }
    }

    result = result.replace(/<meta\s+property="og:title"\s+content=".*?"\s*\/?>/i, `<meta property="og:title" content="${escapeXml(meta.title)}">`);
    result = result.replace(/<meta\s+name="twitter:title"\s+content=".*?"\s*\/?>/i, `<meta name="twitter:title" content="${escapeXml(meta.title)}">`);
    result = result.replace(/<meta\s+property="og:description"\s+content=".*?"\s*\/?>/i, `<meta property="og:description" content="${escapeXml(meta.description)}">`);
    result = result.replace(/<meta\s+name="twitter:description"\s+content=".*?"\s*\/?>/i, `<meta name="twitter:description" content="${escapeXml(meta.description)}">`);
    result = result.replace(/<meta\s+property="og:image"\s+content=".*?"\s*\/?>/i, `<meta property="og:image" content="${escapeXml(meta.image)}">`);
    result = result.replace(/<meta\s+name="twitter:image"\s+content=".*?"\s*\/?>/i, `<meta name="twitter:image" content="${escapeXml(meta.image)}">`);
    result = result.replace(/<link\s+rel="canonical"\s+href=".*?"\s*\/?>/i, `<link rel="canonical" href="${escapeXml(meta.canonicalUrl)}" />`);
    result = result.replace(/<meta\s+property="og:type"\s+content=".*?"\s*\/?>/i, `<meta property="og:type" content="${escapeXml(meta.type)}">`);

    if (meta.jsonLd) {
      const jsonLdScript = `<script type="application/ld+json">${JSON.stringify(meta.jsonLd)}</script>\n`;
      result = result.replace(/<\/head>/i, `${jsonLdScript}</head>`);
    }

    if (meta.prerenderedHtml) {
      result = result.replace(/<div\s+id=["']root["']>\s*<\/div>/i, `<div id="root">${meta.prerenderedHtml}</div>`);
    }

    return result;
  }

  // Serve static files and handle SPA fallback
  const staticRoots = resolveStaticRoots();
  const distPath = staticRoots.distPath;
  const distIndexExists = staticRoots.distIndexExists;
  // Prefer the optimized production build (dist/) whenever it is present unless FORCE_VITE_DEV=1 is explicitly set.
  const isDev = process.env.FORCE_VITE_DEV === "1" || !distIndexExists;

  // Ensure /sw.js, /push-sw.js, /manifest.webmanifest, /favicon.ico and /icons/* never return 404
  registerPwaAssetRoutes(app, staticRoots);

  if (isDev) {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        ws: false,
        watch: {
          ignored: [
            "**/server/**",
            "**/data/**",
            "**/backups/**",
            "**/*.db*",
            "**/*_seed.json",
          ],
        },
      },
      appType: "custom"
    });
    app.use(vite.middlewares);

    app.use("*", async (req, res, next) => {
      const url = req.originalUrl;
      const pathname = (req.originalUrl || req.url || "").split("?")[0];
      if (pathname.startsWith("/api") || pathname.startsWith("/@") || pathname.startsWith("/node_modules") || pathname.startsWith("/src") || pathname.includes(".")) {
        return next();
      }
      try {
        const indexPath = path.resolve(staticRoots.projectRoot, "index.html");
        let template = fs.readFileSync(indexPath, "utf-8");
        template = await vite.transformIndexHtml(url, template);
        const meta = await getPageMeta(url, req.headers["user-agent"] as string);
        const html = injectMetaIntoHtml(template, meta);
        res.status(200).set({ "Content-Type": "text/html" }).end(html);
      } catch (e: any) {
        vite.ssrFixStacktrace(e);
        next(e);
      }
    });

    app.all("/api/*", (_req, res) => {
      res.status(404).json({ error: "API route not found" });
    });
  } else {
    const distAssetsPath = path.join(distPath, "assets");
    if (fs.existsSync(distAssetsPath)) {
      app.use(
        "/assets",
        express.static(distAssetsPath, {
          maxAge: "365d",
          immutable: true,
          setHeaders: (res, filePath) => setStaticAssetHeaders(res, filePath),
        })
      );
    }
    app.use("/assets/*", (_req, res) => {
      res.status(404).type("text/plain; charset=utf-8").send("Asset not found");
    });
    app.use(
      express.static(distPath, {
        index: false,
        setHeaders: (res, filePath) => setStaticAssetHeaders(res, filePath),
      })
    );
    registerPublicStaticFallback(app, staticRoots);
    app.get("*", async (req, res, next) => {
      const pathname = (req.originalUrl || req.url || "").split("?")[0];
      if (pathname.startsWith("/api") || pathname.includes(".")) {
        return next();
      }
      try {
        const indexPath = path.join(distPath, "index.html");
        if (fs.existsSync(indexPath)) {
          let template = fs.readFileSync(indexPath, "utf-8");
          const meta = await getPageMeta(req.originalUrl, req.headers["user-agent"] as string);
          const html = injectMetaIntoHtml(template, meta);
          return res
            .status(200)
            .set({
              "Content-Type": "text/html; charset=utf-8",
              "Cache-Control": "no-cache, no-store, must-revalidate",
            })
            .end(html);
        }
      } catch (e) {
        console.error("SSR HTML meta injection error:", e);
      }
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.sendFile(path.join(distPath, "index.html"));
    });

    app.all("/api/*", (_req, res) => {
      res.status(404).json({ error: "API route not found" });
    });
  }

  const server = app.listen(PORT, HOST, () => {
    console.log(`RR Recruitment Node Server booting on ${HOST}:${PORT} (mode: ${isDev ? "dev-vite" : "production-dist"})...`);

    void (async () => {
      try {
        const dbInstance = await getProTalkDB();
        const loaded = await loadAllFromProTalkDB(dbInstance, db);
        if (loaded) {
          if (loaded.projects?.length) db.projects = loaded.projects;
          if (loaded.candidates?.length) db.candidates = loaded.candidates;
          if (loaded.payments?.length) db.payments = loaded.payments;
          if (loaded.employers?.length) db.employers = loaded.employers;
          if (loaded.companies?.length) db.companies = loaded.companies;
          console.log(`[Express] Synchronized data with PostgreSQL BD ProTalk: ${db.projects.length} projects, ${db.companies.length} companies, ${db.employers.length} employers`);
        }
      } catch (err) {
        console.error("[Express] Error synchronizing with PostgreSQL BD ProTalk at startup:", err);
      }

      try {
        initBackupCronJob();
      } catch (cronErr) {
        console.error("[Cron] Failed initializing backup cron job:", cronErr);
      }

      try {
        initSavRssScheduler();
      } catch (rssErr) {
        console.error("[SAV RSS] Failed initializing RSS scheduler:", rssErr);
      }
    })();
  });

  server.on("error", (err: any) => {
    console.error(`[Server] Failed to bind to ${HOST}:${PORT}:`, err.message);
    process.exit(1);
  });

  const shutdown = async (signal: string) => {
    console.log(`[Server] Received ${signal}. Gracefully shutting down...`);
    server.close(async () => {
      console.log("[Server] HTTP server closed.");
      try {
        await checkpointDatabase();
        console.log("[BD ProTalk] PostgreSQL session cleanly finalized.");
      } catch {
        // ignore shutdown cleanup errors
      }
      process.exit(0);
    });
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

startServer().catch((err) => {
  console.error("[Server] Fatal startup error:", err);
  process.exit(1);
});
