import React, { useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import { Check, Copy } from "lucide-react";
import { InteractiveChecklistItem, detectCheckmarkInContent } from "@/lib/markdownPills";
import { transliterateToSlug } from "@/lib/links";
import {
  isSafeBlogUrl,
  NEW_DEFAULT_COVER_URL,
  TgButtonItem,
  tokenizeTelegramMarkdown,
} from "./blogHelpers";
import {
  TgButtonsBlock,
  TgCollapseBlock,
  TgGalleryBlock,
  TgVideoBlock,
} from "./TelegramRichBlocks";

function extractPlainText(children: React.ReactNode): string {
  if (typeof children === "string" || typeof children === "number") return String(children);
  if (Array.isArray(children)) return children.map(extractPlainText).join("");
  if (React.isValidElement(children)) return extractPlainText((children.props as any)?.children);
  return "";
}

function safeMarkdownUrlTransform(url: string): string {
  return isSafeBlogUrl(url) ? url : "#";
}

function CodeBlockCard({ content, language }: { content: string; language?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="not-prose my-4 rounded-2xl border border-white/25 bg-transparent backdrop-blur-xl overflow-hidden shadow-lg w-full max-w-full">
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/15 bg-transparent text-[14px] text-white/90 font-mono">
        <span>{language || "текст"}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl border border-white/25 hover:border-[#E7C768] text-[14px] text-white transition cursor-pointer"
        >
          {copied ? <Check className="w-4 h-4 text-[#E7C768]" /> : <Copy className="w-4 h-4 text-[#E7C768]" />}
          <span>{copied ? "Скопировано" : "Копировать"}</span>
        </button>
      </div>
      <pre className="p-4 text-[14px] font-mono text-white whitespace-pre-wrap break-words overflow-x-auto leading-relaxed">
        <code className="whitespace-pre-wrap break-words font-mono text-[14px] text-white">{content}</code>
      </pre>
    </div>
  );
}

function MarkdownSegment({ markdown }: { markdown: string }) {
  return (
    <Markdown
      remarkPlugins={[remarkGfm, remarkBreaks]}
      urlTransform={safeMarkdownUrlTransform}
      components={{
        h1({ children }) {
          const id = transliterateToSlug(extractPlainText(children)) || undefined;
          return (
            <h1
              id={id}
              className="text-2xl sm:text-3xl font-bold mt-6 mb-3 bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent leading-tight break-words"
            >
              {children}
            </h1>
          );
        },
        h2({ children }) {
          const id = transliterateToSlug(extractPlainText(children)) || undefined;
          return (
            <h2
              id={id}
              className="text-xl sm:text-2xl font-bold mt-6 mb-3 pb-2 border-b border-white/15 bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent leading-snug break-words"
            >
              {children}
            </h2>
          );
        },
        h3({ children }) {
          const id = transliterateToSlug(extractPlainText(children)) || undefined;
          return (
            <h3
              id={id}
              className="text-lg sm:text-xl font-bold mt-5 mb-2 bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent leading-snug break-words"
            >
              {children}
            </h3>
          );
        },
        p({ children }) {
          return (
            <p className="my-3 text-[15px] sm:text-base leading-relaxed text-white break-words">
              {children}
            </p>
          );
        },
        blockquote({ children }) {
          return (
            <blockquote className="my-4 rounded-2xl border border-white/25 bg-transparent backdrop-blur-xl px-4 py-3 text-[14px] sm:text-base text-white/95 leading-relaxed break-words">
              {children}
            </blockquote>
          );
        },
        ul({ children }) {
          return <ul className="my-3 space-y-2 pl-0 list-none text-[15px] sm:text-base text-white">{children}</ul>;
        },
        ol({ children, start = 1 }) {
          const startNum = Number(start) || 1;
          let idx = 0;
          const items = React.Children.map(children, (child) => {
            if (React.isValidElement(child)) {
              const orderNumber = startNum + idx++;
              return React.cloneElement(child as any, { isOrdered: true, orderNumber });
            }
            return child;
          });
          return <ol className="my-3 space-y-2 pl-0 list-none text-[15px] sm:text-base text-white">{items}</ol>;
        },
        input({ type, ...rest }: any) {
          if (type === "checkbox") return null;
          return <input type={type} {...rest} />;
        },
        li(props: any) {
          const { children, className, checked, isOrdered, orderNumber } = props;
          let isTask =
            typeof checked === "boolean" || (typeof className === "string" && className.includes("task-list-item"));
          let isChecked = checked === true;

          const filteredChildren: React.ReactNode[] = [];
          React.Children.forEach(children, (child) => {
            if (React.isValidElement(child) && (child.type === "input" || (child.props as any)?.type === "checkbox")) {
              isTask = true;
              if ((child.props as any)?.checked) isChecked = true;
            } else {
              filteredChildren.push(child);
            }
          });

          const checkDetection = detectCheckmarkInContent(filteredChildren.length > 0 ? filteredChildren : children);
          if (checkDetection.hasCheck || isTask) {
            return (
              <InteractiveChecklistItem initialChecked={checkDetection.hasCheck ? checkDetection.isChecked : isChecked}>
                {checkDetection.hasCheck ? checkDetection.cleanedChildren : filteredChildren}
              </InteractiveChecklistItem>
            );
          }

          if (isOrdered) {
            return (
              <li className="flex items-start gap-2.5 my-1.5 text-[15px] sm:text-base text-white leading-relaxed list-none">
                <span className="font-bold shrink-0 min-w-[1.5rem] text-[#E7C768] tabular-nums">
                  {orderNumber ?? 1}.
                </span>
                <span className="flex-1 min-w-0 break-words">{children}</span>
              </li>
            );
          }

          return (
            <li className="flex items-start gap-2.5 my-1.5 text-[15px] sm:text-base text-white leading-relaxed list-none">
              <span className="mt-2.5 w-2 h-2 rounded-full shrink-0 bg-gradient-to-r from-[#F4EE8E] to-[#D99E41]" />
              <span className="flex-1 min-w-0 break-words">{children}</span>
            </li>
          );
        },
        table({ children }) {
          return (
            <div className="not-prose my-5 overflow-x-auto rounded-2xl border border-white/25 bg-transparent backdrop-blur-xl shadow-lg">
              <table className="w-full text-left border-collapse text-[14px] text-white">{children}</table>
            </div>
          );
        },
        th({ children }) {
          return (
            <th className="px-4 py-3 border-b border-white/20 font-bold text-[#F4EE8E] text-[14px]">
              {children}
            </th>
          );
        },
        td({ children }) {
          return <td className="px-4 py-3 border-b border-white/10 text-[14px] text-white break-words">{children}</td>;
        },
        code({ inline, className, children, ...rest }: any) {
          const isBlock = Boolean(className) || (!inline && String(children || "").includes("\n"));
          if (!isBlock) {
            return (
              <code
                className="px-2 py-0.5 rounded-lg border border-white/25 bg-transparent backdrop-blur-md text-[#F4EE8E] text-[14px] font-mono break-words whitespace-pre-wrap"
                {...rest}
              >
                {children}
              </code>
            );
          }
          const raw = String(children || "").replace(/\n$/, "");
          const langMatch = /language-([\w-]+)/.exec(className || "");
          return <CodeBlockCard content={raw} language={langMatch?.[1]} />;
        },
        pre({ children }: any) {
          return <div className="not-prose my-4">{children}</div>;
        },
        a({ href, children }) {
          const safeHref = href && isSafeBlogUrl(href) ? href : "#";
          return (
            <a
              href={safeHref}
              target={safeHref.startsWith("/") ? undefined : "_blank"}
              rel={safeHref.startsWith("/") ? undefined : "noopener noreferrer"}
              className="text-[#F4EE8E] underline decoration-[#E7C768]/60 underline-offset-4 hover:text-white transition break-words"
            >
              {children}
            </a>
          );
        },
        img({ src, alt }) {
          const safeSrc = src && isSafeBlogUrl(src) ? src : NEW_DEFAULT_COVER_URL;
          return (
            <img
              src={safeSrc}
              alt={alt || "Изображение"}
              loading="lazy"
              referrerPolicy="no-referrer"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).src = NEW_DEFAULT_COVER_URL;
              }}
              className="not-prose my-4 rounded-2xl border border-white/25 max-w-full h-auto shadow-lg"
            />
          );
        },
      }}
    >
      {markdown}
    </Markdown>
  );
}

export default function BlogArticleBody({
  content,
  buttonsJson,
}: {
  content: string;
  buttonsJson?: string | null;
}) {
  const segments = React.useMemo(() => tokenizeTelegramMarkdown(content || ""), [content]);

  const extraButtonsRows = React.useMemo<TgButtonItem[][]>(() => {
    const hasInlineButtons = segments.some((s) => s.kind === "tg-buttons");
    if (hasInlineButtons || !buttonsJson) return [];
    try {
      const parsed = JSON.parse(buttonsJson);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter((r) => Array.isArray(r))
        .map((r) =>
          r
            .filter((b: any) => b && typeof b.text === "string" && typeof b.url === "string" && isSafeBlogUrl(b.url))
            .map((b: any) => ({ text: b.text.trim(), url: b.url.trim() }))
        )
        .filter((r) => r.length > 0);
    } catch {
      return [];
    }
  }, [segments, buttonsJson]);

  const renderNestedMarkdown = React.useCallback(
    (nestedMd: string) => <BlogArticleBody content={nestedMd} />,
    []
  );

  return (
    <div className="rounded-3xl border border-[#E7C768]/40 bg-transparent backdrop-blur-2xl p-5 sm:p-7 md:p-9 shadow-xl space-y-2 w-full max-w-full overflow-hidden">
      {segments.map((seg, idx) => {
        if (seg.kind === "tg-video") {
          return <TgVideoBlock key={`v-${idx}`} item={seg.item} />;
        }
        if (seg.kind === "tg-gallery") {
          return <TgGalleryBlock key={`g-${idx}`} items={seg.items} />;
        }
        if (seg.kind === "tg-buttons") {
          return <TgButtonsBlock key={`b-${idx}`} rows={seg.rows} />;
        }
        if (seg.kind === "tg-collapse") {
          return <TgCollapseBlock key={`c-${idx}`} payload={seg.payload} renderMarkdown={renderNestedMarkdown} />;
        }
        return <MarkdownSegment key={`m-${idx}`} markdown={seg.markdown} />;
      })}

      {extraButtonsRows.length > 0 && <TgButtonsBlock rows={extraButtonsRows} />}
    </div>
  );
}
