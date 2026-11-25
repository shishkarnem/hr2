// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import http from "http";
import { parseSavRssXml } from "../savRssParser";
import { fetchSavRssFeedWithFailover } from "../savRssSync";
import { NEW_DEFAULT_COVER_URL, OLD_DEFAULT_COVER_URL, MAX_PINNED_POSTS } from "../blogSchema";

const mockedState = vi.hoisted(() => ({
  queryAll: vi.fn(),
  queryGet: vi.fn(),
  executeQuery: vi.fn(),
  pinnedCount: 0,
  dbGet: vi.fn(),
  dbAll: vi.fn(),
  dbRun: vi.fn(),
}));

vi.mock("../../../db/protalkDb", () => ({
  executeProTalkQuery: (...args: any[]) => mockedState.executeQuery(...args),
  queryAllPg: (...args: any[]) => mockedState.queryAll(...args),
  queryGetPg: (...args: any[]) => mockedState.queryGet(...args),
}));

vi.mock("../../../db", () => ({
  getProTalkDB: vi.fn(async () => ({
    get: (...args: any[]) => mockedState.dbGet(...args),
    all: (...args: any[]) => mockedState.dbAll(...args),
    run: (...args: any[]) => mockedState.dbRun(...args),
  })),
}));

vi.mock("../blogSchema", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../blogSchema")>();
  return {
    ...actual,
    ensureBlogSchemaPg: vi.fn(async () => {}),
    getPinnedBlogPostsCountPg: vi.fn(async () => mockedState.pinnedCount),
  };
});

async function invokeApp(
  app: express.Express,
  method: "GET" | "POST" | "PUT" | "DELETE",
  urlPath: string,
  options?: { headers?: Record<string, string>; body?: any }
): Promise<{ status: number; json: any }> {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, "127.0.0.1", async () => {
      try {
        const addr = server.address() as any;
        const res = await fetch(`http://127.0.0.1:${addr.port}${urlPath}`, {
          method,
          headers: {
            "Content-Type": "application/json",
            ...(options?.headers || {}),
          },
          body: options?.body !== undefined ? JSON.stringify(options.body) : undefined,
        });
        const text = await res.text();
        let json: any = null;
        try {
          json = JSON.parse(text);
        } catch {
          json = text;
        }
        resolve({ status: res.status, json });
      } catch (err) {
        reject(err);
      } finally {
        server.close();
      }
    });
  });
}

describe("parseSavRssXml", () => {
  it("parses SAV AI RSS items, replaces OLD_DEFAULT_COVER_URL, separates video from coverImage, and blocks unsafe URLs", () => {
    const sampleXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:sav="https://savbot.ru/ns/blog" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>SAV AI Blog</title>
    <item>
      <guid isPermaLink="false">sav-msg-101</guid>
      <title><![CDATA[Поставка ИИ-агентов в отдел продаж]]></title>
      <link>https://savbot.ru/blog/postavka-ii</link>
      <pubDate>Tue, 10 Feb 2026 10:00:00 GMT</pubDate>
      <sav:id>sav-msg-101</sav:id>
      <sav:slug>postavka-ii</sav:slug>
      <sav:category>Кейсы</sav:category>
      <sav:coverImage>${OLD_DEFAULT_COVER_URL}</sav:coverImage>
      <sav:coverVideo>https://cdn.example.com/demo.mp4</sav:coverVideo>
      <sav:telegramPostUrl>https://t.me/SAV_AI/101</sav:telegramPostUrl>
      <sav:authorName>SAV AI</sav:authorName>
      <sav:authorRole>Эксперт</sav:authorRole>
      <sav:readTimeMinutes>4</sav:readTimeMinutes>
      <sav:mediaJson><![CDATA[[{"type":"video","url":"https://cdn.example.com/demo.mp4","posterUrl":"${OLD_DEFAULT_COVER_URL}"},{"type":"photo","url":"javascript:alert(1)"}]]]></sav:mediaJson>
      <sav:buttonsJson><![CDATA[[{"text":"Открыть","url":"https://savbot.ru/app"},{"text":"XSS","url":"javascript:alert(2)"}]]]></sav:buttonsJson>
      <sav:contentMarkdown><![CDATA[Первая строка
Вторая строка с [безопасной](https://savbot.ru) и [плохой](javascript:alert(1)) ссылкой.
\`\`\`tg-video{"url":"https://cdn.example.com/demo.mp4"}\`\`\`\`\`\`tg-collapse{"markdown":"Скрытый текст"}\`\`\`]]></sav:contentMarkdown>
    </item>
    <item>
      <guid>sav-msg-102</guid>
      <title>Видео без картинки</title>
      <link>https://savbot.ru/blog/video-only</link>
      <sav:coverImage>https://cdn.example.com/clip.mp4</sav:coverImage>
      <sav:coverVideo>https://cdn.example.com/clip.mp4</sav:coverVideo>
      <sav:contentMarkdown><![CDATA[Видео пост]]></sav:contentMarkdown>
    </item>
  </channel>
</rss>`;

    const items = parseSavRssXml(sampleXml);
    expect(items).toHaveLength(2);

    const first = items[0];
    expect(first.externalId).toBe("sav-msg-101");
    expect(first.slug).toBe("postavka-ii");
    expect(first.coverImageUrl).toBe(NEW_DEFAULT_COVER_URL);
    expect(first.coverVideoUrl).toBe("https://cdn.example.com/demo.mp4");
    expect(first.telegramPostUrl).toBe("https://t.me/SAV_AI/101");
    expect(first.rssCategory).toBe("Кейсы");
    expect(first.readTimeMinutes).toBe(4);
    expect(first.mediaItems).toHaveLength(1);
    expect(first.mediaItems[0].posterUrl).toBe(NEW_DEFAULT_COVER_URL);
    expect(first.contentMd).toContain("Первая строка\nВторая строка");

    // Verify coverImageUrl is NEVER an .mp4
    const second = items[1];
    expect(second.coverImageUrl).toBe(NEW_DEFAULT_COVER_URL);
    expect(second.coverVideoUrl).toBe("https://cdn.example.com/clip.mp4");
  });

  it("supports custom XML namespace prefixes and row-wrapped buttonsJson", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:b="https://sav-ai.ru/ns/blog">
  <channel>
    <item>
      <guid>ext-999</guid>
      <title>Custom Prefix Post</title>
      <b:id>ext-999</b:id>
      <b:coverImage>https://cdn.example.com/custom.jpg</b:coverImage>
      <b:buttonsJson><![CDATA[[[{"text":"Go","url":"https://t.me/SAV_AI"},{"text":"Bad","url":"data:text/html,hi"}]]]]></b:buttonsJson>
      <b:contentMarkdown><![CDATA[Body text]]></b:contentMarkdown>
    </item>
  </channel>
</rss>`;
    const items = parseSavRssXml(xml);
    expect(items).toHaveLength(1);
    expect(items[0].coverImageUrl).toBe("https://cdn.example.com/custom.jpg");
    expect(items[0].buttonsRows).toEqual([[{ text: "Go", url: "https://t.me/SAV_AI" }]]);
  });
});

describe("fetchSavRssFeedWithFailover", () => {
  it("fails over across /rss.xml, /feed.xml, and backup domains on HTTP 500 or network error", async () => {
    const calledUrls: string[] = [];
    const mockFetch = vi.fn(async (url: any) => {
      const target = String(url);
      calledUrls.push(target);

      // First domain /rss.xml -> network error
      if (target.startsWith("https://savbot.ru/rss.xml")) {
        throw new Error("ECONNREFUSED");
      }
      // First domain /feed.xml -> HTTP 502
      if (target.startsWith("https://savbot.ru/feed.xml")) {
        return new Response("Bad Gateway", { status: 502 });
      }
      // Second domain /rss.xml -> valid RSS XML
      if (target.startsWith("https://sav-ai.ru/rss.xml")) {
        return new Response("<rss version=\"2.0\"><channel><title>OK</title></channel></rss>", { status: 200 });
      }
      return new Response("Not Found", { status: 404 });
    });

    const res = await fetchSavRssFeedWithFailover({
      limit: 50,
      category: "Кейсы",
      fetchImpl: mockFetch as any,
    });

    expect(res.sourceDomain).toBe("sav-ai.ru");
    expect(res.sourceUrl).toContain("https://sav-ai.ru/rss.xml?limit=50");
    expect(res.sourceUrl).toContain("category=%D0%9A%D0%B5%D0%B9%D1%81%D1%8B");
    expect(calledUrls).toHaveLength(3);
  });
});

describe("blogRouter API endpoints", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedState.pinnedCount = 0;
  });

  it("GET /api/posts?paginated=1 returns paginated payload with total, hasMore, categories, and normalizes legacy cover", async () => {
    const { blogRouter } = await import("../../../routes/blog");
    const app = express();
    app.use(express.json());
    app.use("/api", blogRouter);

    mockedState.queryGet.mockResolvedValueOnce({ cnt: 25 });
    mockedState.queryAll
      .mockResolvedValueOnce([
        {
          id: "p1",
          public_id: 700001,
          slug: "postavka-ii",
          title: "Pinned Post",
          cover_url: OLD_DEFAULT_COVER_URL,
          cover_image_url: OLD_DEFAULT_COVER_URL,
          cover_video_url: "https://cdn.example.com/v.mp4",
          is_published: 1,
          is_pinned: 1,
          created_at: "2026-02-01T00:00:00Z",
        },
      ])
      .mockResolvedValueOnce([{ rss_category: "Кейсы" }, { rss_category: "Промпты" }]);
    mockedState.pinnedCount = 1;

    const res = await invokeApp(app, "GET", "/api/posts?paginated=1&limit=20&offset=0");
    expect(res.status).toBe(200);
    expect(res.json.total).toBe(25);
    expect(res.json.hasMore).toBe(true);
    expect(res.json.pinnedCount).toBe(1);
    expect(res.json.categories).toEqual(["Кейсы", "Промпты"]);
    expect(res.json.items[0].cover_image_url).toBe(NEW_DEFAULT_COVER_URL);
    expect(res.json.items[0].is_pinned).toBe(true);
  });

  it("GET /api/posts/:identifier preserves slugs starting with post (like postavka-ii) and resolves post<digits>", async () => {
    const { blogRouter } = await import("../../../routes/blog");
    const app = express();
    app.use(express.json());
    app.use("/api", blogRouter);

    mockedState.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          id: "post-1",
          public_id: 700123,
          slug: "postavka-ii",
          title: "Поставка ИИ",
          cover_url: NEW_DEFAULT_COVER_URL,
          is_published: 1,
          is_pinned: 0,
        },
      ],
    });

    const slugRes = await invokeApp(app, "GET", "/api/posts/postavka-ii");
    expect(slugRes.status).toBe(200);
    expect(slugRes.json.slug).toBe("postavka-ii");
    expect(mockedState.executeQuery).toHaveBeenCalledWith(
      expect.any(String),
      ["postavka-ii", "postavka-ii"]
    );

    mockedState.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          id: "post-1",
          public_id: 700123,
          slug: "postavka-ii",
          title: "Поставка ИИ",
          cover_url: NEW_DEFAULT_COVER_URL,
          is_published: 1,
          is_pinned: 0,
        },
      ],
    });

    const idRes = await invokeApp(app, "GET", "/api/posts/post700123");
    expect(idRes.status).toBe(200);
    expect(mockedState.executeQuery).toHaveBeenLastCalledWith(
      expect.any(String),
      ["post700123", "700123"]
    );
  });

  it("POST /api/posts/:id/pin enforces admin auth and MAX_PINNED_POSTS = 10 limit", async () => {
    const { blogRouter } = await import("../../../routes/blog");
    const { employerSessions } = await import("../../../routes/auth/helpers");
    const app = express();
    app.use(express.json());
    app.use("/api", blogRouter);

    // 1. Unauthenticated -> 401
    const unauth = await invokeApp(app, "POST", "/api/posts/p1/pin", { body: { pinned: true } });
    expect(unauth.status).toBe(401);

    // 2. Non-admin -> 403
    employerSessions["recruiter-tok"] = { id: "emp-999", role: "employer", public_id: "100999" };
    const forbidden = await invokeApp(app, "POST", "/api/posts/p1/pin", {
      headers: { Authorization: "Bearer recruiter-tok" },
      body: { pinned: true },
    });
    expect(forbidden.status).toBe(403);

    // 3. Admin when 10 already pinned -> 400
    employerSessions["admin-tok"] = { id: "emp-100007", role: "admin", public_id: "100007" };
    mockedState.pinnedCount = MAX_PINNED_POSTS;
    mockedState.queryGet.mockResolvedValueOnce({ id: "p11", category: "blog", is_pinned: 0, public_id: 700011 });

    const limitRes = await invokeApp(app, "POST", "/api/posts/p11/pin", {
      headers: { Authorization: "Bearer admin-tok" },
      body: { pinned: true },
    });
    expect(limitRes.status).toBe(400);
    expect(limitRes.json.error).toContain("10");

    // 4. Admin when < 10 -> 200 & updates DB
    mockedState.pinnedCount = 4;
    mockedState.queryGet
      .mockResolvedValueOnce({ id: "p11", category: "blog", is_pinned: 0, public_id: 700011 })
      .mockResolvedValueOnce({ id: "p11", category: "blog", is_pinned: 1, public_id: 700011, cover_url: NEW_DEFAULT_COVER_URL });
    mockedState.executeQuery.mockResolvedValueOnce({ rows: [] });

    const okRes = await invokeApp(app, "POST", "/api/posts/p11/pin", {
      headers: { Authorization: "Bearer admin-tok" },
      body: { pinned: true },
    });
    expect(okRes.status).toBe(200);
    expect(okRes.json.success).toBe(true);
    expect(okRes.json.post.is_pinned).toBe(true);

    delete employerSessions["recruiter-tok"];
    delete employerSessions["admin-tok"];
  });
});
