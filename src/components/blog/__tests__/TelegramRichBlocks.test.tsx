import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import BlogArticleBody from "../BlogArticleBody";
import BlogCardMedia from "../BlogCardMedia";
import {
  getBlogPostPath,
  NEW_DEFAULT_COVER_URL,
  OLD_DEFAULT_COVER_URL,
  tokenizeTelegramMarkdown,
} from "../blogHelpers";

describe("blogHelpers tokenization & routing", () => {
  it("tokenizes glued inline tg-video, tg-gallery, and tg-collapse fences accurately", () => {
    const raw =
      'Вступление\n```tg-video{"type":"video","url":"https://cdn.example.com/clip.mp4","posterUrl":"https://cdn.example.com/p.jpg"}``````tg-gallery[{"type":"photo","url":"https://cdn.example.com/a.jpg"},{"type":"photo","url":"https://cdn.example.com/b.jpg"}]``````tg-collapse{"markdown":"Вложенный **текст**","summary":"Раскрыть детали"}```♦️♦️♦️> [Читать оригинал](https://t.me/SAV_AI/55)';

    const segments = tokenizeTelegramMarkdown(raw);
    expect(segments.map((s) => s.kind)).toEqual([
      "markdown",
      "tg-video",
      "tg-gallery",
      "tg-collapse",
      "markdown",
    ]);
  });

  it("builds canonical post paths preserving slugs like postavka-ii", () => {
    expect(getBlogPostPath({ public_id: 700111, slug: "postavka-ii" })).toBe("/blog/postavka-ii");
    expect(getBlogPostPath({ public_id: 700111, slug: "" })).toBe("/blog/post700111");
  });
});

describe("BlogArticleBody & TelegramRichBlocks", () => {
  it("renders playable tg-video WITHOUT poster attribute and tooLarge tg-video WITH poster + Telegram CTA", () => {
    const md = [
      '```tg-video{"type":"video","url":"https://cdn.example.com/play.mp4","posterUrl":"https://cdn.example.com/ignored-poster.jpg"}```',
      '```tg-video{"type":"video","tooLarge":true,"sizeMb":28.4,"posterUrl":"https://cdn.example.com/big-poster.jpg","postUrl":"https://t.me/SAV_AI/202"}```',
    ].join("\n");

    const { container } = render(<BlogArticleBody content={md} />);
    const videoEl = container.querySelector("video");
    expect(videoEl).not.toBeNull();
    expect(videoEl?.getAttribute("src")).toBe("https://cdn.example.com/play.mp4");
    expect(videoEl?.hasAttribute("poster")).toBe(false);

    const posterImg = container.querySelector('img[src="https://cdn.example.com/big-poster.jpg"]');
    expect(posterImg).not.toBeNull();
    const tgLink = screen.getByRole("link", { name: /Смотреть видео в Telegram/i });
    expect(tgLink).toHaveAttribute("href", "https://t.me/SAV_AI/202");
  });

  it("renders tg-gallery and opens lightbox on click", () => {
    const md =
      '```tg-gallery[{"type":"photo","url":"https://cdn.example.com/photo1.jpg"},{"type":"photo","url":"https://cdn.example.com/photo2.jpg"}]```';
    render(<BlogArticleBody content={md} />);

    const triggers = screen.getAllByTitle("Открыть изображение");
    expect(triggers).toHaveLength(2);
    fireEvent.click(triggers[0]);

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    const fullImg = screen.getByAltText("Просмотр изображения");
    expect(fullImg).toHaveAttribute("src", "https://cdn.example.com/photo1.jpg");

    fireEvent.click(screen.getByLabelText("Закрыть просмотр"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders tg-buttons safely and blocks javascript: URLs", () => {
    const md =
      '```tg-buttons[[{"text":"Перейти в канал","url":"https://t.me/SAV_AI"},{"text":"Плохая кнопка","url":"javascript:alert(1)"}]]```';
    render(<BlogArticleBody content={md} />);

    expect(screen.getByRole("link", { name: /Перейти в канал/i })).toHaveAttribute(
      "href",
      "https://t.me/SAV_AI"
    );
    expect(screen.queryByText("Плохая кнопка")).not.toBeInTheDocument();
  });

  it("renders tg-collapse with summary accordion and quote toggle, preserving single line breaks and preformatted code", () => {
    const md = [
      "Строка 1\nСтрока 2",
      "```python\ndef hello():\n    return 42\n```",
      '```tg-collapse{"summary":"Показать промпт","markdown":"Внутренний текст промпта"}```',
      '```tg-collapse{"markdown":"Длинная цитата без заголовка"}```',
    ].join("\n\n");

    const { container } = render(<BlogArticleBody content={md} />);

    // remark-breaks creates <br> between Строка 1 and Строка 2
    expect(container.querySelector("p br")).not.toBeNull();

    // Preformatted multiline code keeps whitespace-pre-wrap
    const preEl = container.querySelector("pre");
    expect(preEl).not.toBeNull();
    expect(preEl?.className).toContain("whitespace-pre-wrap");
    expect(preEl?.textContent).toContain("def hello():");

    // Accordion closed by default until clicked
    expect(screen.queryByText("Внутренний текст промпта")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Показать промпт/i }));
    expect(screen.getByText("Внутренний текст промпта")).toBeInTheDocument();

    // Quote expand/collapse toggle
    const expandQuoteBtn = screen.getByRole("button", { name: /Развернуть цитату/i });
    fireEvent.click(expandQuoteBtn);
    expect(screen.getByRole("button", { name: /Свернуть цитату/i })).toBeInTheDocument();
  });
});

describe("BlogCardMedia", () => {
  it("renders autoplay muted loop video WITHOUT poster when cover_video_url is present", () => {
    const { container } = render(
      <BlogCardMedia
        post={{
          title: "Видео карточка",
          cover_image_url: OLD_DEFAULT_COVER_URL,
          cover_video_url: "https://cdn.example.com/card.mp4",
        }}
      />
    );
    const video = container.querySelector("video") as HTMLVideoElement | null;
    expect(video).not.toBeNull();
    expect(video?.getAttribute("src")).toBe("https://cdn.example.com/card.mp4");
    expect(video?.hasAttribute("poster")).toBe(false);
    expect(video?.autoplay).toBe(true);
    expect(video?.muted).toBe(true);
    expect(video?.loop).toBe(true);
  });

  it("replaces OLD_DEFAULT_COVER_URL with NEW_DEFAULT_COVER_URL when no video exists", () => {
    render(
      <BlogCardMedia
        post={{
          title: "Карточка с дефолтной обложкой",
          cover_url: OLD_DEFAULT_COVER_URL,
        }}
      />
    );
    const img = screen.getByAltText("Карточка с дефолтной обложкой");
    expect(img).toHaveAttribute("src", NEW_DEFAULT_COVER_URL);
  });
});
