import React, { useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Bell, ExternalLink, Send } from "lucide-react";

export function stripMarkdownPreview(md: string): string {
  if (!md) return "";
  return String(md)
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/^[-*_]{3,}\s*$/gm, "")
    .replace(/[*_`~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function MailingMarkdownView({
  content,
  linkColor = "#F4EE8E",
}: {
  content: string;
  linkColor?: string;
}) {
  return (
    <div className="space-y-2.5 text-[14px] text-white leading-relaxed break-words">
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="text-lg font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent mt-2">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-base font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent mt-2">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-[15px] font-bold text-[#F4EE8E] mt-1.5">{children}</h3>
          ),
          p: ({ children }) => <p className="text-[14px] text-white/95 leading-relaxed">{children}</p>,
          strong: ({ children }) => <strong className="font-bold text-[#F4EE8E]">{children}</strong>,
          em: ({ children }) => <em className="italic text-white">{children}</em>,
          ul: ({ children }) => <ul className="list-disc pl-5 space-y-1 text-white/95">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-5 space-y-1 text-white/95">{children}</ol>,
          li: ({ children }) => <li className="text-[14px]">{children}</li>,
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-[#E7C768] pl-3 italic text-slate-200 my-2">
              {children}
            </blockquote>
          ),
          code: ({ children }) => (
            <code className="px-1.5 py-0.5 rounded-lg border border-white/20 font-mono text-[14px] text-[#F4EE8E]">
              {children}
            </code>
          ),
          hr: () => <hr className="border-white/20 my-3" />,
          a: ({ href, children }) => {
            const safeHref =
              href && /^(https?:\/\/|\/|mailto:|tel:)/i.test(href.trim()) ? href.trim() : "#";
            return (
              <a
                href={safeHref}
                target={safeHref.startsWith("http") ? "_blank" : undefined}
                rel={safeHref.startsWith("http") ? "noreferrer" : undefined}
                style={{ color: linkColor }}
                className="underline font-semibold hover:opacity-85 break-all"
              >
                {children}
              </a>
            );
          },
          img: ({ src, alt }) =>
            src ? (
              <img
                src={src}
                alt={alt || ""}
                className="max-h-56 w-full object-cover rounded-2xl border border-white/20 my-2"
              />
            ) : null,
        }}
      >
        {content || "_Текст письма пока пустой_"}
      </Markdown>
    </div>
  );
}

export function MailingDualPreview({
  title,
  bodyMd,
  imageUrl,
  buttonText,
  buttonUrl,
}: {
  title: string;
  bodyMd: string;
  imageUrl?: string;
  buttonText?: string;
  buttonUrl?: string;
}) {
  const [channelView, setChannelView] = useState<"bell" | "telegram">("bell");

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setChannelView("bell")}
          className={`w-full px-3.5 py-2.5 rounded-xl border text-sm font-semibold flex items-center justify-center gap-2 transition cursor-pointer ${
            channelView === "bell"
              ? "border-[#E7C768] text-[#F4EE8E]"
              : "border-white/20 text-white/85 hover:border-white/45"
          }`}
        >
          <Bell className="w-4 h-4 text-[#E7C768]" />
          <span>Уведомление на платформе</span>
        </button>
        <button
          type="button"
          onClick={() => setChannelView("telegram")}
          className={`w-full px-3.5 py-2.5 rounded-xl border text-sm font-semibold flex items-center justify-center gap-2 transition cursor-pointer ${
            channelView === "telegram"
              ? "border-[#E7C768] text-[#F4EE8E]"
              : "border-white/20 text-white/85 hover:border-white/45"
          }`}
        >
          <Send className="w-4 h-4 text-[#E7C768]" />
          <span>Сообщение в Telegram</span>
        </button>
      </div>

      <div className="rounded-3xl border border-[#E7C768]/40 bg-transparent backdrop-blur-xl p-5 space-y-4">
        <div className="flex items-center justify-between gap-2 border-b border-white/15 pb-3">
          <div className="min-w-0">
            <h4 className="text-base font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent break-words">
              {title.trim() || "Заголовок письма"}
            </h4>
            <p className="text-sm text-slate-300 mt-0.5">
              {channelView === "bell" ? "Предпросмотр окна уведомлений" : "Предпросмотр Telegram-бота"}
            </p>
          </div>
        </div>

        {imageUrl?.trim() && (
          <div className="overflow-hidden rounded-2xl border border-white/20">
            <img
              src={imageUrl.trim()}
              alt="Изображение рассылки"
              className="w-full max-h-60 object-cover"
            />
          </div>
        )}

        <MailingMarkdownView content={bodyMd} />

        {(buttonText?.trim() || buttonUrl?.trim()) && (
          <div className="pt-2 border-t border-white/15">
            <div className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-[#E7C768]/60 text-sm font-bold text-[#F4EE8E]">
              <ExternalLink className="w-4 h-4 text-[#E7C768]" />
              <span>{buttonText?.trim() || "Открыть платформу"}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
