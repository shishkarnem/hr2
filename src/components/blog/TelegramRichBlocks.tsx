import React, { useState } from "react";
import { ChevronDown, ChevronUp, ExternalLink, Film, Maximize2, X } from "lucide-react";
import {
  isSafeBlogUrl,
  NEW_DEFAULT_COVER_URL,
  TgButtonItem,
  TgCollapsePayload,
  TgMediaItem,
} from "./blogHelpers";

function VideoTooLargeCard({ item }: { item: TgMediaItem }) {
  const poster = item.posterUrl || NEW_DEFAULT_COVER_URL;
  const postUrl = item.postUrl && isSafeBlogUrl(item.postUrl) ? item.postUrl : null;

  return (
    <div className="not-prose my-5 rounded-3xl border border-[#E7C768]/40 bg-transparent backdrop-blur-xl overflow-hidden shadow-xl">
      <div className="relative aspect-video w-full overflow-hidden">
        <img
          src={poster}
          alt="Видео в Telegram"
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).src = NEW_DEFAULT_COVER_URL;
          }}
        />
      </div>
      <div className="p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3 border-t border-white/15 bg-transparent backdrop-blur-md">
        <div className="flex items-center gap-2.5 text-[14px] text-white min-w-0">
          <Film className="w-5 h-5 text-[#E7C768] shrink-0" />
          <span className="break-words">
            Видеофайл большого размера{item.sizeMb ? ` (${item.sizeMb.toFixed(1)} МБ)` : ""} доступен в оригинале
          </span>
        </div>
        {postUrl && (
          <a
            href={postUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-[#E7C768] bg-transparent backdrop-blur-md text-[14px] font-semibold text-white hover:brightness-110 transition shrink-0"
          >
            <span>Смотреть видео в Telegram</span>
            <ExternalLink className="w-4 h-4 text-[#E7C768]" />
          </a>
        )}
      </div>
    </div>
  );
}

export function TgVideoBlock({ item }: { item: TgMediaItem }) {
  const [videoFailed, setVideoFailed] = useState(false);

  if (item.tooLarge || !item.url || !isSafeBlogUrl(item.url) || videoFailed) {
    return <VideoTooLargeCard item={item} />;
  }

  const isVertical = Boolean(item.width && item.height && item.height > item.width * 1.15);

  return (
    <div className="not-prose my-5 rounded-3xl border border-white/25 bg-transparent backdrop-blur-xl overflow-hidden shadow-xl">
      <div className="w-full flex items-center justify-center p-2 sm:p-3 bg-transparent">
        <video
          src={item.url}
          controls
          playsInline
          preload="auto"
          onError={() => setVideoFailed(true)}
          className={`rounded-2xl focus:outline-none ${
            isVertical
              ? "w-full max-w-[380px] max-h-[640px] object-contain"
              : "w-full max-h-[560px] object-contain"
          }`}
        >
          Ваш браузер не поддерживает воспроизведение видео.
        </video>
      </div>
    </div>
  );
}

export function TgGalleryBlock({ items }: { items: TgMediaItem[] }) {
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  if (!items || items.length === 0) return null;

  const gridCols =
    items.length === 1
      ? "grid-cols-1"
      : items.length === 2 || items.length === 4
      ? "grid-cols-1 sm:grid-cols-2"
      : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3";

  return (
    <>
      <div className={`not-prose my-5 grid ${gridCols} gap-3 sm:gap-4`}>
        {items.map((media, idx) => {
          if (media.type === "video") {
            return (
              <div key={idx} className={items.length === 1 ? "col-span-full" : ""}>
                <TgVideoBlock item={media} />
              </div>
            );
          }

          const imgSrc = media.url || media.posterUrl || NEW_DEFAULT_COVER_URL;
          return (
            <button
              key={idx}
              type="button"
              onClick={() => setLightboxUrl(imgSrc)}
              className="group relative rounded-2xl overflow-hidden border border-white/20 hover:border-[#E7C768] bg-transparent backdrop-blur-md transition shadow-lg cursor-pointer aspect-[4/3]"
              title="Открыть изображение"
            >
              <img
                src={imgSrc}
                alt={`Иллюстрация ${idx + 1}`}
                loading="lazy"
                referrerPolicy="no-referrer"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).src = NEW_DEFAULT_COVER_URL;
                }}
                className="w-full h-full object-cover group-hover:scale-[1.02] transition duration-300"
              />
              <span className="absolute bottom-2.5 right-2.5 p-2 rounded-xl border border-white/25 bg-transparent backdrop-blur-xl text-white opacity-80 group-hover:opacity-100 transition">
                <Maximize2 className="w-4 h-4 text-[#E7C768]" />
              </span>
            </button>
          );
        })}
      </div>

      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-2xl bg-transparent"
          role="dialog"
          aria-modal="true"
          onClick={() => setLightboxUrl(null)}
        >
          <div
            className="relative max-w-5xl w-full max-h-[90vh] rounded-3xl border border-[#E7C768]/50 bg-transparent backdrop-blur-2xl p-3 sm:p-5 shadow-2xl flex flex-col items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setLightboxUrl(null)}
              aria-label="Закрыть просмотр"
              className="absolute top-3 right-3 z-10 p-2 rounded-xl border border-white/25 bg-transparent backdrop-blur-xl text-white hover:border-[#E7C768] transition cursor-pointer"
            >
              <X className="w-5 h-5 text-[#E7C768]" />
            </button>
            <img
              src={lightboxUrl}
              alt="Просмотр изображения"
              referrerPolicy="no-referrer"
              className="max-w-full max-h-[82vh] rounded-2xl object-contain"
            />
          </div>
        </div>
      )}
    </>
  );
}

export function TgButtonsBlock({ rows }: { rows: TgButtonItem[][] }) {
  if (!rows || rows.length === 0) return null;

  return (
    <div className="not-prose my-5 space-y-2.5">
      {rows.map((row, rIdx) => (
        <div key={rIdx} className="flex flex-wrap gap-2.5">
          {row.map((btn, bIdx) => {
            if (!isSafeBlogUrl(btn.url)) return null;
            return (
              <a
                key={bIdx}
                href={btn.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 min-w-[180px] inline-flex items-center justify-center gap-2 px-4 py-3 rounded-2xl border border-[#E7C768]/60 hover:border-[#E7C768] bg-transparent backdrop-blur-xl text-[14px] font-semibold text-white transition shadow-md text-center break-words"
              >
                <span className="break-words">{btn.text}</span>
                <ExternalLink className="w-4 h-4 text-[#E7C768] shrink-0" />
              </a>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export function TgCollapseBlock({
  payload,
  renderMarkdown,
}: {
  payload: TgCollapsePayload;
  renderMarkdown: (md: string) => React.ReactNode;
}) {
  const [expanded, setExpanded] = useState<boolean>(Boolean(payload.isOpen));

  if (payload.summary) {
    return (
      <div className="not-prose my-5 rounded-3xl border border-white/25 bg-transparent backdrop-blur-xl overflow-hidden shadow-lg">
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          aria-expanded={expanded}
          className="w-full px-4 sm:px-5 py-3.5 flex items-center justify-between gap-3 text-left text-[15px] font-bold bg-transparent transition cursor-pointer"
        >
          <span className="bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent break-words">
            {payload.summary}
          </span>
          {expanded ? (
            <ChevronUp className="w-5 h-5 text-[#E7C768] shrink-0" />
          ) : (
            <ChevronDown className="w-5 h-5 text-[#E7C768] shrink-0" />
          )}
        </button>

        {expanded && (
          <div className="px-4 sm:px-5 pb-4 pt-2 border-t border-white/15 text-[14px] sm:text-base text-white space-y-2">
            {renderMarkdown(payload.markdown)}
            {payload.credit && (
              <div className="pt-2 text-[14px] text-white/80 font-medium">— {payload.credit}</div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="not-prose my-5 rounded-3xl border border-white/25 bg-transparent backdrop-blur-xl p-4 sm:p-5 shadow-lg space-y-3">
      <div className="relative overflow-hidden">
        <div
          className={`text-[14px] sm:text-base text-white transition-all duration-300 ${
            expanded ? "max-h-none" : "max-h-40 overflow-hidden"
          }`}
        >
          {renderMarkdown(payload.markdown)}
        </div>
        {!expanded && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-12 backdrop-blur-[2px] border-b border-white/10"
          />
        )}
      </div>

      {payload.credit && (
        <div className="text-[14px] text-white/80 font-medium">— {payload.credit}</div>
      )}

      <div className="pt-1 flex items-center">
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          aria-expanded={expanded}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-[#E7C768]/60 hover:border-[#E7C768] bg-transparent backdrop-blur-md text-[14px] font-semibold text-white transition cursor-pointer"
        >
          {expanded ? (
            <>
              <ChevronUp className="w-4 h-4 text-[#E7C768]" />
              <span>Свернуть цитату</span>
            </>
          ) : (
            <>
              <ChevronDown className="w-4 h-4 text-[#E7C768]" />
              <span>Развернуть цитату</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
