import React, { useMemo } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  detectEmbed,
  MiniBrowserFrame,
  VideoPlayer,
  LiquidGlassButton,
} from "@/components/EmbeddedMarkdown";
import { DocumentFrameBlock } from "@/components/DocumentFrameBlock";
import { Check, Copy, Tag, CheckCircle2, Circle, GraduationCap, Quote, Sparkles } from "lucide-react";
import { CompanyThemedLogo } from "@/components/CompanyThemedLogo";
import ImageCarousel, { CarouselSlide } from "@/components/ImageCarousel";
import { ensureGoogleFontLoaded } from "@/components/LandingStyleEditor";
import { transliterateToSlug } from "@/lib/links";
import { normalizeFileUrl } from "@/lib/fileNaming";
import {
  formatBracketedText,
  InteractiveChecklistItem,
  InteractiveOrderedChecklistItem,
  OrderedListItem,
  detectCheckmarkInContent,
  renderParagraphOrList,
  TemplateCard,
} from "@/lib/markdownPills";

function slugifyHeading(children: any): string {
  const text =
    typeof children === "string"
      ? children
      : Array.isArray(children)
      ? children.map((c) => (typeof c === "string" ? c : "")).join("")
      : "";
  return transliterateToSlug(text) || "section";
}

interface Segment {
  type: "markdown" | "carousel" | "frame" | "button";
  markdown?: string;
  slides?: CarouselSlide[];
  title?: string;
  url?: string;
  height?: string | number;
  target?: "_blank" | "_self";
}

/**
 * Parses markdown into segments, extracting :::carousel, :::frame, and :::button blocks
 */
function parseSegments(rawText: string): Segment[] {
  if (!rawText) return [];
  // Strip subpage comment tags from view
  const cleaned = rawText
    .replace(/<!--\s*SUBPAGE_START[\s\S]*?-->/gi, "")
    .replace(/<!--\s*SUBPAGE_END\s*-->/gi, "");

  // Match :::carousel, :::frame, and :::button
  const blockRegex = /(?::::carousel(?:\s+title="([^"]*)")?|<!--\s*CAROUSEL(?:_START)?(?:\s+title="([^"]*)")?\s*-->)([\s\S]*?)(?::::|<!--\s*(?:\/CAROUSEL|CAROUSEL_END)\s*-->)|(?::::frame\s+([\s\S]*?):::)|(?::::button\s+([\s\S]*?):::)/gi;

  const segments: Segment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = blockRegex.exec(cleaned)) !== null) {
    const startIdx = match.index;
    const endIdx = blockRegex.lastIndex;

    if (startIdx > lastIndex) {
      const textBefore = cleaned.slice(lastIndex, startIdx).trim();
      if (textBefore) {
        segments.push({ type: "markdown", markdown: textBefore });
      }
    }

    if (match[3] !== undefined) {
      // It's a carousel!
      const title = match[1] || match[2] || "Галерея материалов";
      const blockContent = match[3] || "";
      const imgRegex = /!\[(.*?)\]\((.*?)\)/g;
      const slides: CarouselSlide[] = [];
      let imgMatch: RegExpExecArray | null;
      while ((imgMatch = imgRegex.exec(blockContent)) !== null) {
        const caption = imgMatch[1]?.trim();
        const url = imgMatch[2]?.trim();
        if (url) {
          slides.push({
            url: normalizeFileUrl(url),
            caption: caption || undefined,
            alt: caption || undefined,
          });
        }
      }

      if (slides.length === 0) {
        const lines = blockContent.split("\n");
        for (const l of lines) {
          const trimmed = l.trim();
          if (/^(?:https?:\/\/[^\s]+|\/files\/[^\s]+)/i.test(trimmed)) {
            slides.push({ url: normalizeFileUrl(trimmed) });
          }
        }
      }

      if (slides.length > 0) {
        segments.push({ type: "carousel", slides, title });
      } else {
        segments.push({ type: "markdown", markdown: blockContent });
      }
    } else if (match[4] !== undefined) {
      // It's a frame! Parse attributes flexibly
      const attrsStr = match[4];
      const urlMatch = attrsStr.match(/url="([^"]+)"/i);
      const heightMatch = attrsStr.match(/height="([^"]+)"/i);
      const titleMatch = attrsStr.match(/title="([^"]+)"/i);
      const targetMatch = attrsStr.match(/target="([^"]+)"/i);

      const frameUrl = urlMatch ? urlMatch[1] : "";
      const frameHeight = heightMatch ? heightMatch[1] : "500";
      const frameTitle = titleMatch ? titleMatch[1] : "Встроенное окно";
      const frameTarget = (targetMatch && targetMatch[1] === "_self" ? "_self" : "_blank") as "_blank" | "_self";

      if (frameUrl) {
        segments.push({
          type: "frame",
          url: frameUrl,
          height: frameHeight,
          title: frameTitle,
          target: frameTarget,
        });
      }
    } else if (match[5] !== undefined) {
      // It's a button! Parse attributes flexibly
      const attrsStr = match[5];
      const urlMatch = attrsStr.match(/url="([^"]+)"/i);
      const titleMatch = attrsStr.match(/title="([^"]+)"/i);
      const targetMatch = attrsStr.match(/target="([^"]+)"/i);

      const btnUrl = urlMatch ? urlMatch[1] : "";
      const btnTitle = titleMatch ? titleMatch[1] : "Перейти по ссылке";
      const btnTarget = (targetMatch && targetMatch[1] === "_self" ? "_self" : "_blank") as "_blank" | "_self";

      if (btnUrl) {
        segments.push({
          type: "button",
          url: btnUrl,
          title: btnTitle,
          target: btnTarget,
        });
      }
    }

    lastIndex = endIdx;
  }

  if (lastIndex < cleaned.length) {
    const textAfter = cleaned.slice(lastIndex).trim();
    if (textAfter) {
      segments.push({ type: "markdown", markdown: textAfter });
    }
  }

  if (segments.length === 0 && cleaned.trim()) {
    segments.push({ type: "markdown", markdown: cleaned.trim() });
  }

  // Split out standalone media / video / document URLs from markdown blocks
  // so that videos and iframes are rendered as clean top-level segments, NEVER wrapped in <p>!
  const finalSegments: Segment[] = [];
  for (const seg of segments) {
    if (seg.type !== "markdown" || !seg.markdown) {
      finalSegments.push(seg);
      continue;
    }

    const lines = seg.markdown.split("\n");
    let currentLines: string[] = [];

    for (let li = 0; li < lines.length; li++) {
      const line = lines[li].trim();
      const detected = line ? detectEmbed(line) : null;
      const mdLinkMatch = line.match(/^\[(.*?)\]\((https?:\/\/[^\s)]+|\/files\/[^\s)]+)\)$/i);
      const mdDetected = mdLinkMatch ? detectEmbed(mdLinkMatch[2]) : null;

      const activeEmbed = detected || mdDetected;

      if (activeEmbed && (
        activeEmbed.kind === "video" ||
        activeEmbed.kind === "youtube" ||
        activeEmbed.kind === "rutube" ||
        activeEmbed.kind === "vk" ||
        activeEmbed.kind === "vimeo" ||
        activeEmbed.kind === "gslide" ||
        activeEmbed.kind === "gdoc" ||
        activeEmbed.kind === "gsheet" ||
        activeEmbed.kind === "gdrive" ||
        activeEmbed.kind === "document"
      )) {
        if (currentLines.length > 0) {
          const textBefore = currentLines.join("\n").trim();
          if (textBefore) {
            finalSegments.push({ type: "markdown", markdown: textBefore });
          }
          currentLines = [];
        }

        finalSegments.push({
          type: "frame",
          url: activeEmbed.originalUrl || (mdLinkMatch ? mdLinkMatch[2] : line),
          title: (mdLinkMatch ? mdLinkMatch[1] : activeEmbed.title) || "Медиа",
          height: activeEmbed.height || (activeEmbed.kind === "video" ? 480 : 500),
          target: "_blank",
        });
      } else {
        currentLines.push(lines[li]);
      }
    }

    if (currentLines.length > 0) {
      const remainingText = currentLines.join("\n").trim();
      if (remainingText) {
        finalSegments.push({ type: "markdown", markdown: remainingText });
      }
    }
  }

  return finalSegments;
}

function hexToRgba(hex: string, alphaPercent: number): string {
  if (!hex || typeof hex !== "string") return "transparent";
  const cleanHex = hex.replace("#", "").trim();
  let r = 0, g = 0, b = 0;
  if (cleanHex.length === 3) {
    r = parseInt(cleanHex[0] + cleanHex[0], 16);
    g = parseInt(cleanHex[1] + cleanHex[1], 16);
    b = parseInt(cleanHex[2] + cleanHex[2], 16);
  } else if (cleanHex.length === 6) {
    r = parseInt(cleanHex.substring(0, 2), 16);
    g = parseInt(cleanHex.substring(2, 4), 16);
    b = parseInt(cleanHex.substring(4, 6), 16);
  }
  const alpha = Math.max(0, Math.min(1, alphaPercent / 100));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export default function RichTrainingMarkdown({ children, theme }: { children: string; theme?: any }) {
  const segments = useMemo(() => parseSegments(children || ""), [children]);

  // Ensure custom font is loaded
  React.useEffect(() => {
    if (theme?.fontFamily) {
      ensureGoogleFontLoaded(theme.fontFamily);
    }
  }, [theme?.fontFamily]);

  const activeIconColor = theme?.iconColor || "var(--landing-icon-color, #E7C768)";
  const activeTextColor = theme?.bodyTextColor || "var(--landing-text-color, #F1F5F9)";
  const activeBoldColor = theme?.boldTextColor || "var(--landing-bold-color, #FFFFFF)";
  const isMono = Boolean(
    theme?.allMediaMonochrome ||
    theme?.sitePreviewMonochrome ||
    (theme?.headingsSolidColor === "#FFFFFF" && theme?.pageBgColor === "#000000")
  );

  const containerBg = theme?.containerBgColor
    ? hexToRgba(theme.containerBgColor, theme.containerBgOpacity ?? 0)
    : "rgba(0, 0, 0, 0)";
  const containerBorder = theme?.containerBorderColor
    ? hexToRgba(theme.containerBorderColor, theme.containerBorderOpacity ?? 25)
    : "rgba(255, 255, 255, 0.2)";
  const containerRadius = theme?.containerBorderRadius != null ? `${theme.containerBorderRadius}px` : undefined;
  const containerBorderWidth = theme?.containerBorderWidth != null ? `${theme.containerBorderWidth}px` : "1px";
  const glassBlur = theme?.glassBlurPx != null ? `${theme.glassBlurPx}px` : "20px";

  const cardBoxStyle: React.CSSProperties = {
    backgroundColor: containerBg,
    borderColor: containerBorder,
    borderWidth: containerBorderWidth,
    borderRadius: containerRadius,
    backdropFilter: `blur(${glassBlur})`,
    WebkitBackdropFilter: `blur(${glassBlur})`,
    fontFamily: theme?.fontFamily || undefined,
  };

  const isSolidHeadings = theme?.headingsColorMode === "solid" && theme?.headingsSolidColor;
  const isSilverHeadings = theme?.headingsColorMode === "gradient-silver";

  const getHeadingStyle = (maxPx: number, minPx: number): React.CSSProperties => {
    const base: React.CSSProperties = {
      fontFamily: theme?.fontFamily || undefined,
      fontSize: `clamp(${minPx}px, 3.8vw, ${maxPx}px)`,
      lineHeight: theme?.lineHeight ?? 1.35,
    };
    if (isSolidHeadings) {
      return {
        ...base,
        color: theme.headingsSolidColor,
        WebkitTextFillColor: theme.headingsSolidColor,
        background: "none",
        backgroundImage: "none",
        WebkitBackgroundClip: "initial",
      };
    }
    if (isSilverHeadings) {
      return {
        ...base,
        backgroundImage: "linear-gradient(to right, #FFFFFF, #E2E8F0, #94A3B8)",
        WebkitBackgroundClip: "text",
        WebkitTextFillColor: "transparent",
      };
    }
    return {
      ...base,
      backgroundImage: "linear-gradient(to right, #F4EE8E, #E7C768, #D99E41)",
      WebkitBackgroundClip: "text",
      WebkitTextFillColor: "transparent",
    };
  };

  const h1Style = getHeadingStyle(theme?.fontSizeH1 ? Math.min(theme.fontSizeH1, 24) : 22, 17);
  const h2Style = getHeadingStyle(theme?.fontSizeH2 ? Math.min(theme.fontSizeH2, 20) : 18, 15);
  const h3Style = getHeadingStyle(theme?.fontSizeH3 ? Math.min(theme.fontSizeH3, 17) : 16, 13);
  const h4Style = getHeadingStyle(theme?.fontSizeH4 ? Math.min(theme.fontSizeH4, 15) : 14, 12);

  const bodyStyle: React.CSSProperties = {
    fontFamily: theme?.fontFamily || undefined,
    color: activeTextColor,
    fontSize: theme?.fontSizeBody ? `${theme.fontSizeBody}px` : undefined,
    lineHeight: theme?.lineHeight ?? 1.6,
  };

  return (
    <div
      className="rich-training space-y-4"
      style={{
        ["--landing-icon-color" as any]: activeIconColor,
        ["--landing-text-color" as any]: activeTextColor,
        ["--landing-bold-color" as any]: activeBoldColor,
        fontFamily: theme?.fontFamily || undefined,
      }}
    >
      {segments.map((segment, sIdx) => {
        if (segment.type === "carousel" && segment.slides) {
          return (
            <ImageCarousel
              key={`carousel-${sIdx}`}
              slides={segment.slides}
              title={segment.title}
              theme={theme}
            />
          );
        }

        if (segment.type === "frame" && segment.url) {
          const detected = detectEmbed(segment.url);
          const isDoc =
            detected?.kind === "document" ||
            /\.(pdf|docx?|xlsx?|pptx?|csv|txt)(?:[?#].*)?$/i.test(segment.url) ||
            /\/files\/\d+\/[^/\s]+\.(pdf|docx?|xlsx?|pptx?|csv|txt)/i.test(segment.url);

          if (isDoc) {
            return (
              <DocumentFrameBlock
                key={`frame-doc-${sIdx}`}
                src={detected?.src || segment.url}
                title={segment.title || detected?.title || "Документ"}
                originalUrl={segment.url}
                height={segment.height || 550}
                theme={theme}
              />
            );
          }

          const src = detected ? detected.src : segment.url;
          return (
            <MiniBrowserFrame
              key={`frame-${sIdx}`}
              src={src}
              title={segment.title || detected?.title || "Встроенное окно"}
              originalUrl={segment.url}
              height={segment.height || 500}
              target={segment.target || "_blank"}
              theme={theme}
            />
          );
        }

        if (segment.type === "button" && segment.url) {
          return (
            <LiquidGlassButton
              key={`btn-${sIdx}`}
              url={segment.url}
              title={segment.title || "Перейти"}
              target={segment.target || "_blank"}
              theme={theme}
            />
          );
        }

        return (
          <Markdown
            key={`md-${sIdx}`}
            remarkPlugins={[remarkGfm]}
            components={{
              h1: ({ children }: any) => (
                <div className="not-prose my-6 first:mt-0">
                  <div
                    className="relative rounded-2xl md:rounded-3xl overflow-hidden p-5 md:p-6 border bg-transparent backdrop-blur-xl shadow-xl"
                    style={cardBoxStyle}
                  >
                    <div className="relative flex items-start gap-3.5">
                      <div
                        className="shrink-0 w-11 h-11 rounded-2xl flex items-center justify-center border bg-transparent backdrop-blur-md"
                        style={{
                          borderColor: containerBorder,
                          borderRadius: containerRadius,
                        }}
                      >
                        <GraduationCap className="w-6 h-6" style={{ color: activeIconColor }} />
                      </div>
                      <h1 className="m-0 font-bold leading-snug" style={h1Style}>
                        {children}
                      </h1>
                    </div>
                  </div>
                </div>
              ),
              h2: ({ children }: any) => {
                const headingId = slugifyHeading(children);
                return (
                  <div id={headingId} className="not-prose mt-8 mb-4 scroll-mt-24">
                    <div className="flex items-center gap-2.5">
                      <span
                        className="inline-block w-1.5 h-7 rounded-full"
                        style={{
                          backgroundColor: activeIconColor,
                        }}
                      />
                      <h2 className="m-0 font-bold" style={h2Style}>
                        {children}
                      </h2>
                    </div>
                    <div
                      className="mt-2 h-px w-full"
                      style={{
                        background: `linear-gradient(to right, ${activeIconColor}, rgba(255,255,255,0.15), transparent)`,
                      }}
                    />
                  </div>
                );
              },
              h3: ({ children }: any) => {
                const headingId = slugifyHeading(children);
                return (
                  <h3
                    id={headingId}
                    className="not-prose mt-6 mb-3 font-bold flex items-center gap-2 scroll-mt-24"
                    style={h3Style}
                  >
                    <Sparkles className="w-4 h-4 shrink-0" style={{ color: activeIconColor }} /> {children}
                  </h3>
                );
              },
              h4: ({ children }: any) => (
                <h4 className="not-prose mt-4 mb-2 font-bold" style={h4Style}>
                  {children}
                </h4>
              ),
              p({ node, children, ...rest }: any) {
                const arr = node?.children || [];

                // 1. Lone <a> tag in paragraph (ignoring empty whitespace nodes)
                const nonWhitespaceChildren = arr.filter(
                  (c: any) => !(c?.type === "text" && !c?.value?.trim())
                );

                if (nonWhitespaceChildren.length === 1 && nonWhitespaceChildren[0]?.tagName === "a") {
                  const href: string = nonWhitespaceChildren[0]?.properties?.href || "";
                  const e = detectEmbed(href);
                  if (e) {
                    if (e.kind === "video") {
                      return <VideoPlayer src={e.src} title={e.title} originalUrl={e.originalUrl} theme={theme} />;
                    }
                    if (e.kind === "image") {
                      const filterOverlayColor = theme?.siteScreenshotFilterColor || theme?.sitePreviewFilterColor || "#000000";
                      const filterOverlayOpacity = theme?.siteScreenshotFilterOpacity ?? theme?.sitePreviewFilterOpacity ?? 0;
                      return (
                        <div className="relative not-prose my-4 inline-block max-w-full overflow-hidden" style={{ borderRadius: containerRadius }}>
                          <img
                            src={normalizeFileUrl(e.src)}
                            alt={e.title || "Изображение"}
                            referrerPolicy="no-referrer"
                            loading="eager"
                            className="rounded-2xl border border-white/20 max-w-full h-auto shadow-xl select-none block"
                            style={{
                              borderRadius: containerRadius,
                              filter: isMono ? "grayscale(100%)" : undefined,
                            }}
                          />
                          {filterOverlayOpacity > 0 && (
                            <div
                              className="absolute inset-0 pointer-events-none rounded-2xl"
                              style={{
                                backgroundColor: hexToRgba(filterOverlayColor, filterOverlayOpacity),
                              }}
                            />
                          )}
                        </div>
                      );
                    }
                    if (e.kind === "document") {
                      return <DocumentFrameBlock src={e.src} title={e.title} originalUrl={e.originalUrl} height={e.height || 1000} theme={theme} />;
                    }
                    if (e.kind === "youtube" || e.kind === "rutube" || e.kind === "vk" || e.kind === "vimeo") {
                      return (
                        <div
                          className="not-prose my-5 aspect-video w-full overflow-hidden border bg-transparent shadow-2xl"
                          style={cardBoxStyle}
                        >
                          <iframe
                            src={e.src}
                            className="w-full h-full border-0 bg-transparent"
                            title={e.title || `embed-${e.kind}`}
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                            allowFullScreen
                            referrerPolicy="strict-origin-when-cross-origin"
                            style={{ filter: isMono ? "grayscale(100%)" : undefined }}
                          />
                        </div>
                      );
                    }
                    if (e.kind === "gdoc" || e.kind === "gsheet" || e.kind === "gslide" || e.kind === "gdrive" || e.kind === "frame") {
                      return (
                        <MiniBrowserFrame
                          src={e.src}
                          title={e.title}
                          originalUrl={e.originalUrl}
                          height={e.height || 1000}
                          target={e.target || "_blank"}
                          theme={theme}
                        />
                      );
                    }
                    if (e.kind === "button") {
                      return <LiquidGlassButton url={e.src} title={e.title || "Перейти"} target={e.target} theme={theme} />;
                    }
                  }
                }

                // 2. Lone text child in paragraph (e.g. pasted /files/40/video.mp4 or https://youtube...)
                if (nonWhitespaceChildren.length === 1 && nonWhitespaceChildren[0]?.type === "text") {
                  const rawText = (nonWhitespaceChildren[0]?.value || "").trim();
                  const e = detectEmbed(rawText);
                  if (e) {
                    if (e.kind === "video") {
                      return <VideoPlayer src={e.src} title={e.title} originalUrl={e.originalUrl} theme={theme} />;
                    }
                    if (e.kind === "image") {
                      const filterOverlayColor = theme?.siteScreenshotFilterColor || theme?.sitePreviewFilterColor || "#000000";
                      const filterOverlayOpacity = theme?.siteScreenshotFilterOpacity ?? theme?.sitePreviewFilterOpacity ?? 0;
                      return (
                        <div className="relative not-prose my-4 inline-block max-w-full overflow-hidden" style={{ borderRadius: containerRadius }}>
                          <img
                            src={normalizeFileUrl(e.src)}
                            alt={e.title || "Изображение"}
                            referrerPolicy="no-referrer"
                            loading="eager"
                            className="rounded-2xl border border-white/20 max-w-full h-auto shadow-xl select-none block"
                            style={{
                              borderRadius: containerRadius,
                              filter: isMono ? "grayscale(100%)" : undefined,
                            }}
                          />
                          {filterOverlayOpacity > 0 && (
                            <div
                              className="absolute inset-0 pointer-events-none rounded-2xl"
                              style={{
                                backgroundColor: hexToRgba(filterOverlayColor, filterOverlayOpacity),
                              }}
                            />
                          )}
                        </div>
                      );
                    }
                    if (e.kind === "document") {
                      return <DocumentFrameBlock src={e.src} title={e.title} originalUrl={e.originalUrl} height={e.height || 1000} theme={theme} />;
                    }
                    if (e.kind === "youtube" || e.kind === "rutube" || e.kind === "vk" || e.kind === "vimeo") {
                      return (
                        <div
                          className="not-prose my-5 aspect-video w-full overflow-hidden border bg-transparent shadow-2xl"
                          style={cardBoxStyle}
                        >
                          <iframe
                            src={e.src}
                            className="w-full h-full border-0 bg-transparent"
                            title={e.title || `embed-${e.kind}`}
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                            allowFullScreen
                            referrerPolicy="strict-origin-when-cross-origin"
                            style={{ filter: isMono ? "grayscale(100%)" : undefined }}
                          />
                        </div>
                      );
                    }
                    if (e.kind === "gdoc" || e.kind === "gsheet" || e.kind === "gslide" || e.kind === "gdrive" || e.kind === "frame") {
                      return (
                        <MiniBrowserFrame
                          src={e.src}
                          title={e.title}
                          originalUrl={e.originalUrl}
                          height={e.height || 1000}
                          target={e.target || "_blank"}
                          theme={theme}
                        />
                      );
                    }
                    if (e.kind === "button") {
                      return <LiquidGlassButton url={e.src} title={e.title || "Перейти"} target={e.target} theme={theme} />;
                    }
                  }
                }

                return (
                  <div className="my-3 leading-relaxed break-words whitespace-normal text-wrap" style={bodyStyle} {...rest}>
                    {renderParagraphOrList(children, theme)}
                  </div>
                );
              },
              a: ({ href, children }: any) => {
                const textContent = Array.isArray(children) ? children.join("") : String(children || "");
                if (textContent.startsWith("👉 ") || textContent.includes("BUTTON:")) {
                  return (
                    <LiquidGlassButton
                      url={href}
                      title={textContent.replace(/^[👉\s*]+/, "").replace(/[*_]+/g, "").trim()}
                      target="_blank"
                      theme={theme}
                    />
                  );
                }
                return (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-2 transition"
                    style={{
                      color: activeIconColor,
                      textDecorationColor: activeIconColor,
                    }}
                  >
                    {children}
                  </a>
                );
              },
              strong: ({ children }: any) => (
                <strong className="font-bold" style={{ color: activeBoldColor }}>
                  {children}
                </strong>
              ),
              em: ({ children }: any) => (
                <em className="italic" style={{ color: activeTextColor }}>
                  {children}
                </em>
              ),
              code: ({ inline, className, children, ...rest }: any) => {
                if (inline) {
                  return (
                    <code
                      className="px-2 py-0.5 rounded-lg bg-transparent backdrop-blur-md border text-sm font-mono"
                      style={{
                        borderColor: containerBorder,
                        color: activeIconColor,
                      }}
                      {...rest}
                    >
                      {children}
                    </code>
                  );
                }
                const raw = String(children || "").replace(/\n$/, "");
                const match = /language-(\w+)/.exec(className || "");
                const isCode = match && match[1] !== "text" && match[1] !== "txt" && match[1] !== "markdown";
                return <TemplateCard content={raw} isCode={!!isCode} language={match?.[1]} theme={theme} />;
              },
              pre: ({ children }: any) => <div className="not-prose my-4">{children}</div>,
              blockquote: ({ children }: any) => (
                <div
                  className="not-prose my-4 rounded-2xl border p-4 flex gap-3 shadow-lg"
                  style={cardBoxStyle}
                >
                  <Quote className="w-5 h-5 shrink-0 mt-0.5" style={{ color: activeIconColor }} />
                  <div className="text-sm md:text-base italic leading-relaxed" style={{ color: activeTextColor }}>
                    {children}
                  </div>
                </div>
              ),
              ul: ({ children, ...rest }: any) => (
                <ul className="not-prose my-3 space-y-2 pl-0 list-none" style={bodyStyle} {...rest}>
                  {children}
                </ul>
              ),
              ol: ({ children, start = 1, ...rest }: any) => {
                const startNum = Number(start) || 1;
                let elementIndex = 0;
                const items = React.Children.map(children, (child) => {
                  if (React.isValidElement(child)) {
                    const currentNumber = startNum + elementIndex;
                    elementIndex++;
                    return React.cloneElement(child as any, {
                      isOrdered: true,
                      orderNumber: currentNumber,
                    });
                  }
                  return child;
                });
                return (
                  <ol className="not-prose my-3 space-y-2.5 pl-0 list-none" style={bodyStyle} {...rest}>
                    {items}
                  </ol>
                );
              },
              input: ({ type, ...rest }: any) => {
                if (type === "checkbox") return null;
                return <input type={type} {...rest} />;
              },
              li: (props: any) => {
                const { children, className, checked, isOrdered, orderNumber, ordered, index } = props;
                const isOrderedList = Boolean(isOrdered || ordered);
                const num = orderNumber ?? (typeof index === "number" ? index + 1 : undefined);

                let isTask = typeof checked === "boolean" || (typeof className === "string" && className.includes("task-list-item"));
                let isChecked = checked === true;

                const filteredChildren: React.ReactNode[] = [];
                React.Children.forEach(children, (child) => {
                  if (React.isValidElement(child) && (child.type === "input" || (child.props as any)?.type === "checkbox")) {
                    isTask = true;
                    if ((child.props as any)?.checked) {
                      isChecked = true;
                    }
                  } else {
                    filteredChildren.push(child);
                  }
                });

                const checkDetection = detectCheckmarkInContent(filteredChildren.length > 0 ? filteredChildren : children, theme);

                if (isOrderedList) {
                  if (checkDetection.hasCheck || isTask) {
                    return (
                      <InteractiveOrderedChecklistItem
                        orderNumber={num}
                        initialChecked={checkDetection.hasCheck ? checkDetection.isChecked : isChecked}
                      >
                        {checkDetection.hasCheck ? checkDetection.cleanedChildren : filteredChildren}
                      </InteractiveOrderedChecklistItem>
                    );
                  }
                  return (
                    <OrderedListItem orderNumber={num}>
                      {checkDetection.cleanedChildren}
                    </OrderedListItem>
                  );
                }

                if (checkDetection.hasCheck || isTask) {
                  return (
                    <InteractiveChecklistItem
                      initialChecked={checkDetection.hasCheck ? checkDetection.isChecked : isChecked}
                    >
                      {checkDetection.hasCheck ? checkDetection.cleanedChildren : filteredChildren}
                    </InteractiveChecklistItem>
                  );
                }

                return (
                  <li className="flex items-start gap-2.5 my-1.5 leading-normal list-none" style={bodyStyle}>
                    <span
                      className="mt-2 w-2 h-2 rounded-full shrink-0"
                      style={{
                        backgroundColor: activeIconColor,
                      }}
                    />
                    <span className="flex-1 min-w-0 break-words">{renderParagraphOrList(children, theme)}</span>
                  </li>
                );
              },
              hr: () => (
                <hr
                  className="not-prose my-6 border-0 h-px"
                  style={{
                    background: `linear-gradient(to right, transparent, ${activeIconColor}, transparent)`,
                  }}
                />
              ),
              table: ({ children }: any) => (
                <div
                  className="not-prose my-4 overflow-x-auto border shadow-xl"
                  style={cardBoxStyle}
                >
                  <table className="w-full text-sm" style={{ color: activeTextColor }}>{children}</table>
                </div>
              ),
              thead: ({ children }: any) => (
                <thead
                  className="border-b"
                  style={{
                    borderColor: containerBorder,
                  }}
                >
                  {children}
                </thead>
              ),
              th: ({ children }: any) => (
                <th
                  className="text-left px-4 py-3 font-bold border-b"
                  style={{
                    color: activeBoldColor,
                    borderColor: containerBorder,
                  }}
                >
                  {children}
                </th>
              ),
              td: ({ children }: any) => (
                <td
                  className="px-4 py-3 border-b align-top"
                  style={{
                    borderColor: containerBorder,
                  }}
                >
                  {children}
                </td>
              ),
              tr: ({ children }: any) => (
                <tr className="hover:bg-white/5 transition-colors">{children}</tr>
              ),
              img: ({ src, alt }: any) => (
                <img
                  src={normalizeFileUrl(src)}
                  alt={alt || ""}
                  referrerPolicy="no-referrer"
                  loading="eager"
                  className="not-prose my-4 border max-w-full h-auto shadow-xl select-none"
                  style={{
                    borderColor: containerBorder,
                    borderRadius: containerRadius,
                    filter: isMono ? "grayscale(100%)" : undefined,
                  }}
                />
              ),
            }}
          >
            {segment.markdown || ""}
          </Markdown>
        );
      })}
    </div>
  );
}

export function RichTrainingMaterialCard({
  title,
  content,
  children,
  subpagesCount,
  onOpenWizard,
  companyName,
  logoUrl,
  accentColor,
  theme,
  landingConfig,
}: {
  title?: string;
  content?: string;
  children?: React.ReactNode;
  subpagesCount?: number;
  onOpenWizard?: () => void;
  companyName?: string;
  logoUrl?: string;
  accentColor?: string;
  theme?: any;
  landingConfig?: any;
}) {
  const effectiveTheme = theme || landingConfig;

  React.useEffect(() => {
    if (effectiveTheme?.fontFamily || effectiveTheme?.font_family) {
      ensureGoogleFontLoaded(effectiveTheme.fontFamily || effectiveTheme.font_family);
    }
  }, [effectiveTheme?.fontFamily, effectiveTheme?.font_family]);

  const rawMarkdown =
    content ||
    (typeof children === "string" ? children : "") ||
    "";

  const containerBg = effectiveTheme?.containerBgColor
    ? hexToRgba(effectiveTheme.containerBgColor, effectiveTheme.containerBgOpacity ?? 0)
    : "rgba(0, 0, 0, 0)";
  const containerBorder = effectiveTheme?.containerBorderColor
    ? hexToRgba(effectiveTheme.containerBorderColor, effectiveTheme.containerBorderOpacity ?? 25)
    : "rgba(255, 255, 255, 0.2)";
  const containerRadius = effectiveTheme?.containerBorderRadius != null ? `${effectiveTheme.containerBorderRadius}px` : "24px";
  const containerBorderWidth = effectiveTheme?.containerBorderWidth != null ? `${effectiveTheme.containerBorderWidth}px` : "1px";
  const glassBlur = effectiveTheme?.glassBlurPx != null ? `${effectiveTheme.glassBlurPx}px` : "24px";

  const cardStyle: React.CSSProperties = {
    backgroundColor: containerBg,
    borderColor: containerBorder,
    borderWidth: containerBorderWidth,
    borderRadius: containerRadius,
    backdropFilter: `blur(${glassBlur})`,
    WebkitBackdropFilter: `blur(${glassBlur})`,
    fontFamily: effectiveTheme?.fontFamily || undefined,
  };

  const isSolidHeadings = effectiveTheme?.headingsColorMode === "solid" && effectiveTheme?.headingsSolidColor;
  const isSilverHeadings = effectiveTheme?.headingsColorMode === "gradient-silver";

  const titleHeadingStyle: React.CSSProperties = {
    fontFamily: effectiveTheme?.fontFamily || undefined,
    ...(isSolidHeadings
      ? {
          color: effectiveTheme.headingsSolidColor,
          WebkitTextFillColor: effectiveTheme.headingsSolidColor,
          background: "none",
        }
      : isSilverHeadings
      ? {
          backgroundImage: "linear-gradient(to right, #FFFFFF, #E2E8F0, #94A3B8)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
        }
      : {
          backgroundImage: "linear-gradient(to right, #F4EE8E, #E7C768, #D99E41)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
        }),
  };

  return (
    <div
      className="section-card liquid-glass-card shadow-2xl relative overflow-hidden px-[2%] py-4 sm:px-6 sm:py-6 md:p-8 w-full max-w-full"
      style={cardStyle}
    >
      {(title || logoUrl || companyName || onOpenWizard) && (
        <div
          className="flex items-center justify-between gap-3 mb-4 sm:mb-6 pb-3 sm:pb-4 flex-wrap border-b w-full"
          style={{ borderColor: containerBorder }}
        >
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <CompanyThemedLogo
              logoUrl={logoUrl}
              companyName={companyName || "Робот Рекрутер"}
              theme={effectiveTheme}
              className="w-8 h-8 sm:w-10 sm:h-10 rounded-2xl border p-1 shadow-md object-contain shrink-0"
              style={{
                borderColor: containerBorder,
                borderRadius: containerRadius,
                filter:
                  effectiveTheme?.logoMonochrome || effectiveTheme?.allMediaMonochrome
                    ? "grayscale(100%)"
                    : undefined,
              }}
            />
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg md:text-xl font-bold flex items-center gap-2 break-words whitespace-normal text-wrap">
                <span className="break-words whitespace-normal text-wrap" style={titleHeadingStyle}>
                  {title || "Учебные материалы"}
                </span>
              </h2>
              {companyName && (
                <p
                  className="text-xs break-words"
                  style={{
                    color: effectiveTheme?.bodyTextColor || "#94A3B8",
                    fontFamily: effectiveTheme?.fontFamily || undefined,
                  }}
                >
                  Корпоративный портал обучения «{companyName}»
                </p>
              )}
            </div>
          </div>

          {onOpenWizard && (
            <button
              type="button"
              onClick={onOpenWizard}
              className="landing-btn-active px-3.5 sm:px-4 py-1.5 sm:py-2 text-xs font-bold shadow-lg hover:brightness-105 active:scale-95 transition cursor-pointer shrink-0 break-words whitespace-normal text-wrap"
              style={{
                backgroundColor: effectiveTheme?.btnActiveBgColor || "#FFFFFF",
                color: effectiveTheme?.btnActiveTextColor || "#000000",
                WebkitTextFillColor: effectiveTheme?.btnActiveTextColor || "#000000",
                borderRadius: effectiveTheme?.btnBorderRadius != null ? `${effectiveTheme.btnBorderRadius}px` : "16px",
                borderColor: effectiveTheme?.btnBorderColor || "rgba(255,255,255,0.3)",
              }}
            >
              Редактировать
            </button>
          )}
        </div>
      )}

      {rawMarkdown ? (
        <RichTrainingMarkdown theme={effectiveTheme}>{rawMarkdown}</RichTrainingMarkdown>
      ) : (
        children
      )}
    </div>
  );
}
