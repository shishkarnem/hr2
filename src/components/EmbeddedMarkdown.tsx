import React, { useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ExternalLink, Maximize2, Minimize2, Video, Globe, FileSpreadsheet, FileText, Copy, Check } from "lucide-react";
import { toAbsoluteUrl, normalizeFileUrl } from "@/lib/fileNaming";
import { hexToRgba } from "@/components/LandingStyleEditor";
import { DocumentFrameBlock } from "./DocumentFrameBlock";
import {
  formatBracketedText,
  InteractiveChecklistItem,
  InteractiveOrderedChecklistItem,
  OrderedListItem,
  detectCheckmarkInContent,
  renderParagraphOrList,
  TemplateCard,
} from "@/lib/markdownPills";

export type EmbedKind =
  | "video"
  | "image"
  | "youtube"
  | "rutube"
  | "vk"
  | "vimeo"
  | "document"
  | "gdoc"
  | "gsheet"
  | "gslide"
  | "gdrive"
  | "frame"
  | "button";

export interface DetectedEmbed {
  kind: EmbedKind;
  src: string;
  originalUrl: string;
  title?: string;
  height?: number | string;
  target?: "_blank" | "_self";
}

/** Detects video, document, frame, and media URLs and returns embed metadata. */
export function detectEmbed(rawUrlOrText: string): DetectedEmbed | null {
  if (!rawUrlOrText) return null;
  const str = String(rawUrlOrText).trim();
  if (!str) return null;

  try {
    // 1. Check for custom :::frame directive format if passed directly
    const frameMatch = str.match(/:::frame\s+url="([^"]+)"(?:\s+height="([^"]+)")?(?:\s+title="([^"]+)")?(?:\s+target="([^"]+)")?/i);
    if (frameMatch) {
      const url = frameMatch[1];
      const h = frameMatch[2] || "500";
      const title = frameMatch[3] || "Встроенное окно";
      const target = (frameMatch[4] === "_self" ? "_self" : "_blank") as "_blank" | "_self";
      const embed = detectEmbed(url);
      if (embed) {
        return { ...embed, height: h, title: title || embed.title, target };
      }
      return {
        kind: "frame",
        src: toAbsoluteUrl(url),
        originalUrl: url,
        title,
        height: h,
        target,
      };
    }

    // 2. Check for custom :::button directive format
    const buttonMatch = str.match(/:::button\s+url="([^"]+)"(?:\s+title="([^"]+)")?(?:\s+target="([^"]+)")?/i);
    if (buttonMatch) {
      return {
        kind: "button",
        src: toAbsoluteUrl(buttonMatch[1]),
        originalUrl: buttonMatch[1],
        title: buttonMatch[2] || "Перейти по ссылке",
        target: (buttonMatch[3] === "_self" ? "_self" : "_blank") as "_blank" | "_self",
      };
    }

    // 3. Direct video files (.mp4, .webm, .ogg, .mov or /files/...mp4)
    if (
      /\.(mp4|webm|ogg|mov)(?:[?#].*)?$/i.test(str) ||
      (/\/files\/\d+\/[^/\s]+\.(mp4|webm|ogg|mov)/i.test(str)) ||
      (/\/(?:file|files)\/[^/\s]+(?:video|mp4)/i.test(str))
    ) {
      const absUrl = toAbsoluteUrl(str);
      return {
        kind: "video",
        src: absUrl,
        originalUrl: str,
      };
    }

    // 4. Direct document files (PDF, DOCX, XLSX, PPTX, TXT, CSV)
    const docFileMatch = str.match(/\.(pdf|docx?|xlsx?|pptx?|csv|txt)(?:[?#].*)?$/i) ||
                         str.match(/\/files\/\d+\/[^/\s]+\.(pdf|docx?|xlsx?|pptx?|csv|txt)/i);
    if (docFileMatch) {
      const ext = docFileMatch[1].toLowerCase();
      const absUrl = toAbsoluteUrl(str);
      const filename = str.split("/").pop()?.split("?")[0] || `Документ.${ext}`;
      const decodedName = decodeURIComponent(filename);

      return {
        kind: "document",
        src: absUrl,
        originalUrl: str,
        title: decodedName,
        height: 1000,
      };
    }

    // 4b. Direct image files (PNG, JPG, JPEG, WEBP, GIF, SVG)
    const imgFileMatch = str.match(/\.(png|jpe?g|gif|webp|svg)(?:[?#].*)?$/i) ||
                         str.match(/\/files\/\d+\/[^/\s]+\.(png|jpe?g|gif|webp|svg)/i) ||
                         str.match(/\/file\/[^/\s]+\.(png|jpe?g|gif|webp|svg)/i);
    if (imgFileMatch) {
      const absUrl = toAbsoluteUrl(str);
      const filename = str.split("/").pop()?.split("?")[0] || "Изображение";
      return {
        kind: "image",
        src: absUrl,
        originalUrl: str,
        title: decodeURIComponent(filename),
      };
    }

    // 5. YouTube (clean embed avoiding Error 153)
    const yt = str.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/))([\w-]{6,})/i);
    if (yt) {
      return {
        kind: "youtube",
        src: `https://www.youtube-nocookie.com/embed/${yt[1]}?rel=0&enablejsapi=1`,
        originalUrl: str,
        title: "YouTube Видео",
      };
    }

    // 5. RuTube
    const ru = str.match(/rutube\.ru\/(?:video|play\/embed)\/([\w]+)/i);
    if (ru) {
      return {
        kind: "rutube",
        src: `https://rutube.ru/play/embed/${ru[1]}`,
        originalUrl: str,
        title: "RuTube Видео",
      };
    }

    // 6. VK Video
    const vk = str.match(/vk(?:video)?\.(?:com|ru)\/video(-?\d+)_(\d+)/i);
    if (vk) {
      return {
        kind: "vk",
        src: `https://vk.com/video_ext.php?oid=${vk[1]}&id=${vk[2]}&hd=2`,
        originalUrl: str,
        title: "VK Видео",
      };
    }

    // 7. Vimeo
    const vimeo = str.match(/vimeo\.com\/(?:video\/)?(\d+)/i);
    if (vimeo) {
      return {
        kind: "vimeo",
        src: `https://player.vimeo.com/video/${vimeo[1]}`,
        originalUrl: str,
        title: "Vimeo Видео",
      };
    }

    // 8. Google Docs / Sheets / Slides / Drive
    const gSheet = str.match(/docs\.google\.com\/spreadsheets\/d\/([\w-]+)/i);
    if (gSheet) {
      return {
        kind: "gsheet",
        src: `https://docs.google.com/spreadsheets/d/${gSheet[1]}/preview?widget=true&headers=false`,
        originalUrl: str,
        title: "Google Таблица",
        height: 1000,
      };
    }

    const gDoc = str.match(/docs\.google\.com\/document\/d\/([\w-]+)/i);
    if (gDoc) {
      return {
        kind: "gdoc",
        src: `https://docs.google.com/document/d/${gDoc[1]}/preview`,
        originalUrl: str,
        title: "Google Документ",
        height: 1000,
      };
    }

    const gSlide = str.match(/docs\.google\.com\/presentation\/d\/([\w-]+)/i);
    if (gSlide) {
      return {
        kind: "gslide",
        src: `https://docs.google.com/presentation/d/${gSlide[1]}/preview`,
        originalUrl: str,
        title: "Google Презентация",
        height: 1000,
      };
    }

    // Google Drive file (matches /file/d/ID/..., /open?id=ID, /uc?id=ID, /view, etc.)
    const gDrive = str.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?id=)([\w-]+)/i);
    if (gDrive) {
      return {
        kind: "gdrive",
        src: `https://drive.google.com/file/d/${gDrive[1]}/preview`,
        originalUrl: str,
        title: "Google Диск (документ)",
        height: 1000,
      };
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * ResponsiveVideoEmbed: Memoized iframe for YouTube, RuTube, VK, Vimeo video embeds.
 * Prevents iframe tearing and reload loops on parent re-renders.
 */
export const ResponsiveVideoEmbed = React.memo(function ResponsiveVideoEmbed({
  src,
  title,
  kind,
}: {
  src: string;
  title?: string;
  kind?: string;
}) {
  return (
    <div className="not-prose my-5 aspect-video w-full overflow-hidden rounded-3xl border border-white/20 bg-black/40 backdrop-blur-xl shadow-2xl">
      <iframe
        src={src}
        className="w-full h-full border-0"
        title={title || `embed-${kind || "video"}`}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        referrerPolicy="no-referrer"
        loading="lazy"
      />
    </div>
  );
});

/**
 * MiniBrowserFrame: High-fidelity Apple Liquid Glass embedded frame.
 * Wrapped in React.memo to prevent unnecessary unmounting/re-loading of embedded iframes.
 */
function MiniBrowserFrameComponent({
  src,
  title = "Встроенное окно",
  originalUrl,
  height = 1000,
  target = "_blank",
  theme,
}: {
  src: string;
  title?: string;
  originalUrl?: string;
  height?: number | string;
  target?: "_blank" | "_self";
  theme?: any;
}) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [copied, setCopied] = useState(false);

  const displayUrl = originalUrl || src;
  const detected = detectEmbed(displayUrl) || detectEmbed(src);
  const effectiveSrc = detected?.src || src;
  let domain = "";
  try {
    domain = new URL(displayUrl.startsWith("http") ? displayUrl : "https://" + displayUrl).hostname;
  } catch {
    domain = "Встроенный ресурс";
  }

  const handleCopy = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(displayUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const parsedHeight = typeof height === "number"
    ? `${height}px`
    : (/^\d+$/.test(String(height || "").trim())
      ? `${String(height).trim()}px`
      : (String(height || "").trim() || "1000px"));

  const isDirectVideo =
    /\.(mp4|webm|ogg|mov)(?:[?#].*)?$/i.test(displayUrl) ||
    /\/files\/\d+\/[^/\s]+\.(mp4|webm|ogg|mov)/i.test(displayUrl);
  const isVideoService = /youtube\.com|youtu\.be|rutube\.ru|vk\.com|vkvideo\.ru|vimeo\.com/i.test(displayUrl);
  const isGoogle = /google\.com/i.test(displayUrl);

  const isMono = Boolean(
    theme?.allMediaMonochrome ||
    theme?.sitePreviewMonochrome ||
    theme?.pageBgMonochrome ||
    (theme?.headingsSolidColor === "#FFFFFF" && (theme?.pageBgColor === "#000000" || !theme?.pageBgColor))
  );

  const sitePreviewFilterRgba =
    theme?.sitePreviewFilterOpacity && theme.sitePreviewFilterOpacity > 0
      ? hexToRgba(theme.sitePreviewFilterColor || "#17344F", theme.sitePreviewFilterOpacity)
      : undefined;

  const activeBtnBg = theme?.btnActiveBgColor
    ? hexToRgba(theme.btnActiveBgColor, theme.btnActiveOpacity ?? 100)
    : "var(--landing-btn-active-bg, #FFFFFF)";
  const activeBtnText = theme?.btnActiveTextColor || "var(--landing-btn-active-text, #000000)";
  const activeBtnBorder = theme?.btnBorderColor
    ? hexToRgba(theme.btnBorderColor, theme.btnBorderOpacity ?? 25)
    : "var(--landing-btn-border, rgba(255, 255, 255, 0.25))";
  const activeBtnRadius =
    theme?.btnBorderRadius === 999
      ? "9999px"
      : theme?.btnBorderRadius != null
      ? `${theme.btnBorderRadius}px`
      : "var(--landing-radius-btn, 14px)";
  const activeBtnBorderWidth = theme?.btnBorderWidth != null ? `${theme.btnBorderWidth}px` : "1px";

  const activeBtnStyle: React.CSSProperties = {
    backgroundColor: activeBtnBg,
    color: activeBtnText,
    borderColor: activeBtnBorder,
    borderWidth: activeBtnBorderWidth,
    borderRadius: activeBtnRadius,
    fontFamily: theme?.fontFamily || undefined,
  };

  return (
    <div
      className={`not-prose my-6 rounded-3xl border border-white/20 bg-transparent backdrop-blur-xl shadow-2xl overflow-hidden transition-all duration-300 w-full max-w-full ${
        isFullscreen ? "fixed inset-4 z-50 bg-[#17344F]/95 backdrop-blur-2xl flex flex-col" : "w-full"
      }`}
    >
      {/* Mini-browser Window Header */}
      <div className="flex items-center justify-between px-3.5 sm:px-4 py-2.5 sm:py-3 border-b border-white/10 bg-white/5 backdrop-blur-md gap-2 sm:gap-3 flex-wrap">
        {/* macOS style control dots */}
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-2.5 sm:w-3 h-2.5 sm:h-3 rounded-full bg-white/20 border border-white/30 inline-block" />
          <span className="w-2.5 sm:w-3 h-2.5 sm:h-3 rounded-full bg-[#E7C768]/60 border border-[#E7C768]/80 inline-block" />
          <span className="w-2.5 sm:w-3 h-2.5 sm:h-3 rounded-full bg-white/30 border border-white/40 inline-block" />
          <div className="flex items-center gap-1.5 sm:gap-2 ml-1 sm:ml-2 min-w-0">
            {isDirectVideo || isVideoService ? (
              <Video className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" style={{ color: theme?.iconColor || "#E7C768" }} />
            ) : isGoogle ? (
              <FileText className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" style={{ color: theme?.iconColor || "#E7C768" }} />
            ) : (
              <Globe className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" style={{ color: theme?.iconColor || "#E7C768" }} />
            )}
            <span className="text-xs sm:text-sm font-semibold text-white truncate max-w-[150px] sm:max-w-[220px] md:max-w-xs">
              {title}
            </span>
          </div>
        </div>

        {/* Address bar pill */}
        <div
          onClick={handleCopy}
          title="Нажмите, чтобы скопировать ссылку"
          className="hidden md:flex items-center gap-1.5 px-3 py-1 rounded-xl bg-white/5 border border-white/10 text-xs text-slate-300 hover:text-white hover:bg-white/10 cursor-pointer transition max-w-sm truncate"
        >
          <span className="truncate">{displayUrl}</span>
          {copied ? <Check className="w-3.5 h-3.5 text-[#E7C768]" /> : <Copy className="w-3.5 h-3.5 opacity-60" />}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setIsFullscreen(!isFullscreen)}
            title={isFullscreen ? "Свернуть окно" : "Развернуть на весь экран"}
            className="p-1.5 rounded-xl hover:bg-white/10 text-slate-200 hover:text-white transition flex items-center gap-1 text-xs cursor-pointer"
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#E7C768]" /> : <Maximize2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#E7C768]" />}
            <span className="hidden md:inline">{isFullscreen ? "Свернуть" : "Во весь экран"}</span>
          </button>

          <a
            href={displayUrl}
            target={target}
            rel="noopener noreferrer"
            title="Открыть в новой вкладке"
            className="landing-btn-active px-3 sm:px-4 py-1.5 sm:py-2 text-[11px] sm:text-xs font-bold flex items-center gap-1.5 hover:brightness-105 active:scale-95 transition shadow-md shrink-0 break-words whitespace-normal text-wrap"
            style={activeBtnStyle}
          >
            <span className="break-words whitespace-normal text-wrap" style={{ color: activeBtnText, WebkitTextFillColor: activeBtnText }}>
              {isDirectVideo
                ? "Открыть видео"
                : isVideoService
                ? "Смотреть"
                : isGoogle
                ? "Открыть в Google"
                : "Открыть сайт"}
            </span>
            <ExternalLink className="w-3.5 h-3.5 shrink-0" style={{ color: activeBtnText, stroke: activeBtnText }} />
          </a>
        </div>
      </div>

      {/* Frame body */}
      <div
        className={`w-full relative flex items-center justify-center bg-transparent backdrop-blur-md overflow-hidden ${
          isFullscreen ? "flex-1" : ""
        }`}
        style={!isFullscreen ? { height: parsedHeight } : undefined}
      >
        {isDirectVideo ? (
          <video
            src={toAbsoluteUrl(displayUrl)}
            controls
            playsInline
            preload="metadata"
            className="w-full h-full max-h-full object-contain focus:outline-none bg-transparent"
            style={{ filter: isMono ? "grayscale(100%)" : undefined }}
          >
            Ваш браузер не поддерживает воспроизведение этого видео.
          </video>
        ) : (
          <>
            <iframe
              src={effectiveSrc}
              className="w-full h-full border-0 bg-transparent"
              title={title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
              loading="lazy"
              style={{
                filter: isMono ? "grayscale(100%)" : undefined,
              }}
            />
            {/* Site preview filter overlay as configured in company style */}
            {sitePreviewFilterRgba && (
              <div
                className="absolute inset-0 pointer-events-none z-10 transition-colors"
                style={{
                  backgroundColor: sitePreviewFilterRgba,
                }}
              />
            )}
          </>
        )}
      </div>

      {/* Fallback footer note */}
      <div className="px-3.5 sm:px-4 py-2 bg-white/5 border-t border-white/10 text-[11px] sm:text-xs text-slate-300 flex items-center justify-between gap-2 flex-wrap">
        <span className="break-words">Если ресурс не отображается во фрейме браузера, используйте прямую кнопку «Открыть»:</span>
        <a
          href={displayUrl}
          target={target}
          rel="noopener noreferrer"
          className="hover:underline font-semibold flex items-center gap-1 shrink-0"
          style={{ color: theme?.iconColor || "#E7C768" }}
        >
          <span>{domain}</span>
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    </div>
  );
}

export const MiniBrowserFrame = React.memo(MiniBrowserFrameComponent);

/**
 * VideoPlayer: High-quality HTML5 video player in Liquid Glass frame
 * Handles dynamic aspect ratios: vertical (9:16), square (1:1), and horizontal (16:9).
 */
function VideoPlayerComponent({
  src,
  title,
  originalUrl,
  theme,
}: {
  src: string;
  title?: string;
  originalUrl?: string;
  theme?: any;
}) {
  const displayUrl = toAbsoluteUrl(originalUrl || src);
  const [loadError, setLoadError] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<"vertical" | "square" | "horizontal">(() => {
    const u = (originalUrl || src || "").toLowerCase();
    if (/shorts|reels|tiktok|vertical|portrait|9x16|1080x1920|720x1280/i.test(u)) return "vertical";
    if (/square|1x1|1080x1080|720x720/i.test(u)) return "square";
    return "horizontal";
  });

  const isMono = Boolean(
    theme?.allMediaMonochrome ||
    theme?.sitePreviewMonochrome ||
    theme?.pageBgMonochrome ||
    (theme?.headingsSolidColor === "#FFFFFF" && (theme?.pageBgColor === "#000000" || !theme?.pageBgColor))
  );

  const activeBtnBg = theme?.btnActiveBgColor
    ? hexToRgba(theme.btnActiveBgColor, theme.btnActiveOpacity ?? 100)
    : "var(--landing-btn-active-bg, #FFFFFF)";
  const activeBtnText = theme?.btnActiveTextColor || "var(--landing-btn-active-text, #000000)";
  const activeBtnBorder = theme?.btnBorderColor
    ? hexToRgba(theme.btnBorderColor, theme.btnBorderOpacity ?? 25)
    : "var(--landing-btn-border, rgba(255, 255, 255, 0.25))";
  const activeBtnRadius =
    theme?.btnBorderRadius === 999
      ? "9999px"
      : theme?.btnBorderRadius != null
      ? `${theme.btnBorderRadius}px`
      : "var(--landing-radius-btn, 14px)";
  const activeBtnBorderWidth = theme?.btnBorderWidth != null ? `${theme.btnBorderWidth}px` : "1px";

  const activeBtnStyle: React.CSSProperties = {
    backgroundColor: activeBtnBg,
    color: activeBtnText,
    borderColor: activeBtnBorder,
    borderWidth: activeBtnBorderWidth,
    borderRadius: activeBtnRadius,
    fontFamily: theme?.fontFamily || undefined,
  };

  const handleLoadedMetadata = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const v = e.currentTarget;
    if (v.videoWidth && v.videoHeight) {
      const ratio = v.videoHeight / v.videoWidth;
      if (ratio >= 1.2) {
        setAspectRatio("vertical");
      } else if (ratio >= 0.85 && ratio < 1.2) {
        setAspectRatio("square");
      } else {
        setAspectRatio("horizontal");
      }
    }
  };

  // Only show top header bar if user explicitly gave a human title (not raw filename / file url)
  const isRawFilename = Boolean(
    title &&
    (/\.(mp4|webm|ogg|mov)$/i.test(title) ||
      /_\d{5,}_/.test(title) ||
      title === "Видео" ||
      title === decodeURIComponent(displayUrl.split("/").pop() || ""))
  );
  const showHeader = Boolean(title && !isRawFilename);

  return (
    <div className="not-prose my-6 rounded-3xl border border-white/20 bg-transparent backdrop-blur-xl shadow-2xl overflow-hidden transition-all duration-300 w-full max-w-full">
      {showHeader && (
        <div className="px-3.5 sm:px-4 py-2.5 bg-white/5 border-b border-white/10 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <Video className="w-4 h-4 shrink-0" style={{ color: theme?.iconColor || "#E7C768" }} />
            <span className="text-xs sm:text-sm font-semibold text-white truncate">{title}</span>
          </div>
          <a
            href={displayUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="landing-btn-active px-3 py-1 text-xs font-bold flex items-center gap-1 cursor-pointer transition hover:brightness-105 shrink-0"
            style={activeBtnStyle}
          >
            <span style={{ color: activeBtnText, WebkitTextFillColor: activeBtnText }}>Скачать / Открыть</span>
            <ExternalLink className="w-3 h-3" style={{ color: activeBtnText, stroke: activeBtnText }} />
          </a>
        </div>
      )}
      <div className="w-full bg-black/85 flex items-center justify-center p-2 min-h-[200px]">
        {loadError ? (
          <div className="py-12 px-4 sm:px-6 text-center space-y-3">
            <Video className="w-8 h-8 mx-auto opacity-70" style={{ color: theme?.iconColor || "#E7C768" }} />
            <p className="text-xs sm:text-sm text-slate-200">
              Не удалось воспроизвести видеофайл напрямую в браузере.
            </p>
            <a
              href={displayUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="landing-btn-active inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold shadow-md hover:brightness-105"
              style={activeBtnStyle}
            >
              <span style={{ color: activeBtnText, WebkitTextFillColor: activeBtnText }}>Открыть видео напрямую</span>
              <ExternalLink className="w-3.5 h-3.5" style={{ color: activeBtnText, stroke: activeBtnText }} />
            </a>
          </div>
        ) : (
          <div
            className={`flex items-center justify-center w-full transition-all duration-300 ${
              aspectRatio === "vertical"
                ? "max-w-[340px] sm:max-w-[360px] aspect-[9/16] max-h-[640px]"
                : aspectRatio === "square"
                ? "max-w-[460px] aspect-square max-h-[500px]"
                : "w-full aspect-video max-h-[560px]"
            }`}
          >
            <video
              src={displayUrl}
              controls
              playsInline
              preload="metadata"
              onLoadedMetadata={handleLoadedMetadata}
              onError={(e) => {
                if (e.currentTarget.error && e.currentTarget.error.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) {
                  setLoadError(true);
                }
              }}
              className="w-full h-full object-contain rounded-2xl focus:outline-none"
              style={{ filter: isMono ? "grayscale(100%)" : undefined }}
            >
              Ваш браузер не поддерживает воспроизведение этого видео.
            </video>
          </div>
        )}
      </div>
    </div>
  );
}

export const VideoPlayer = React.memo(VideoPlayerComponent);

/**
 * LiquidGlassButton: Styled interactive button linking to URL
 */
export function LiquidGlassButton({
  url,
  title,
  target = "_blank",
  theme,
}: {
  url: string;
  title: string;
  target?: "_blank" | "_self";
  theme?: any;
}) {
  const activeBtnBg = theme?.btnActiveBgColor
    ? hexToRgba(theme.btnActiveBgColor, theme.btnActiveOpacity ?? 100)
    : "var(--landing-btn-active-bg, #FFFFFF)";
  const activeBtnText = theme?.btnActiveTextColor || "var(--landing-btn-active-text, #000000)";
  const activeBtnBorder = theme?.btnBorderColor
    ? hexToRgba(theme.btnBorderColor, theme.btnBorderOpacity ?? 25)
    : "var(--landing-btn-border, rgba(255, 255, 255, 0.25))";
  const activeBtnRadius =
    theme?.btnBorderRadius === 999
      ? "9999px"
      : theme?.btnBorderRadius != null
      ? `${theme.btnBorderRadius}px`
      : "var(--landing-radius-btn, 14px)";
  const activeBtnBorderWidth = theme?.btnBorderWidth != null ? `${theme.btnBorderWidth}px` : "1px";

  const activeBtnStyle: React.CSSProperties = {
    backgroundColor: activeBtnBg,
    color: activeBtnText,
    borderColor: activeBtnBorder,
    borderWidth: activeBtnBorderWidth,
    borderRadius: activeBtnRadius,
    fontFamily: theme?.fontFamily || undefined,
  };

  return (
    <div className="not-prose my-4 w-full max-w-full">
      <a
        href={url}
        target={target}
        rel="noopener noreferrer"
        className="landing-btn-active inline-flex items-center gap-2 px-5 py-2.5 font-bold text-xs sm:text-sm shadow-xl hover:brightness-105 active:scale-95 transition cursor-pointer break-words whitespace-normal text-wrap"
        style={activeBtnStyle}
      >
        <span className="break-words whitespace-normal text-wrap" style={{ color: activeBtnText, WebkitTextFillColor: activeBtnText }}>{title}</span>
        <ExternalLink className="w-4 h-4 shrink-0" style={{ color: activeBtnText, stroke: activeBtnText }} />
      </a>
    </div>
  );
}

/**
 * Markdown renderer that auto-embeds videos, YouTube/VK/Rutube/Google Docs,
 * buttons, and mini-browser frames.
 */
export default function EmbeddedMarkdown({ children, theme }: { children: string; theme?: any }) {
  return (
    <Markdown
      remarkPlugins={[remarkGfm]}
      components={{
        p({ node, children, ...rest }: any) {
          const arr = node?.children || [];

          // 1. Check if single <a> child
          if (arr.length === 1 && arr[0]?.tagName === "a") {
            const href: string = arr[0]?.properties?.href || "";
            const e = detectEmbed(href);
            if (e) {
              if (e.kind === "video") {
                return <VideoPlayer src={e.src} title={e.title} originalUrl={e.originalUrl} theme={theme} />;
              }
              if (e.kind === "image") {
                return (
                  <img
                    src={normalizeFileUrl(e.src)}
                    alt={e.title || "Изображение"}
                    referrerPolicy="no-referrer"
                    loading="eager"
                    className="not-prose my-4 rounded-2xl border border-white/20 max-w-full h-auto shadow-xl select-none"
                  />
                );
              }
              if (e.kind === "document") {
                return <DocumentFrameBlock src={e.src} title={e.title} originalUrl={e.originalUrl} height={e.height} theme={theme} />;
              }
              if (e.kind === "youtube" || e.kind === "rutube" || e.kind === "vk" || e.kind === "vimeo") {
                return (
                  <div className="my-5 aspect-video w-full overflow-hidden rounded-3xl border border-white/20 bg-transparent backdrop-blur-xl shadow-2xl not-prose">
                    <iframe
                      src={e.src}
                      className="w-full h-full border-0"
                      title={e.title || `embed-${e.kind}`}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen
                      referrerPolicy="no-referrer-when-downgrade"
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
                    height={e.height || 500}
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

          // 2. Check if paragraph is a lone raw URL / video line (e.g. /files/40/steamcity.mp4 or https://...)
          if (arr.length === 1 && arr[0]?.type === "text") {
            const rawText = (arr[0]?.value || "").trim();
            const e = detectEmbed(rawText);
            if (e) {
              if (e.kind === "video") {
                return <VideoPlayer src={e.src} title={e.title} originalUrl={e.originalUrl} theme={theme} />;
              }
              if (e.kind === "image") {
                return (
                  <img
                    src={normalizeFileUrl(e.src)}
                    alt={e.title || "Изображение"}
                    referrerPolicy="no-referrer"
                    loading="eager"
                    className="not-prose my-4 rounded-2xl border border-white/20 max-w-full h-auto shadow-xl select-none"
                  />
                );
              }
              if (e.kind === "document") {
                return <DocumentFrameBlock src={e.src} title={e.title} originalUrl={e.originalUrl} height={e.height} theme={theme} />;
              }
              if (e.kind === "youtube" || e.kind === "rutube" || e.kind === "vk" || e.kind === "vimeo") {
                return (
                  <div className="my-5 aspect-video w-full overflow-hidden rounded-3xl border border-white/20 bg-transparent backdrop-blur-xl shadow-2xl not-prose">
                    <iframe
                      src={e.src}
                      className="w-full h-full border-0"
                      title={e.title || `embed-${e.kind}`}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen
                      referrerPolicy="no-referrer-when-downgrade"
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
                    height={e.height || 500}
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
            <div className="my-3 text-sm md:text-base leading-relaxed text-slate-100" {...rest}>
              {renderParagraphOrList(children, theme)}
            </div>
          );
        },
        code({ inline, className, children, ...rest }: any) {
          if (inline) {
            return (
              <code
                className="px-2 py-0.5 rounded-lg bg-transparent backdrop-blur-md border border-white/20 text-[#F4EE8E] text-sm font-mono"
                {...rest}
              >
                {children}
              </code>
            );
          }
          const raw = String(children || "").replace(/\n$/, "");
          const match = /language-(\w+)/.exec(className || "");
          const isCode = match && match[1] !== "text" && match[1] !== "txt" && match[1] !== "markdown";
          return <TemplateCard content={raw} isCode={!!isCode} language={match?.[1]} />;
        },
        pre({ children }: any) {
          return <div className="not-prose my-4">{children}</div>;
        },
        ul({ children, ...rest }: any) {
          return <ul className="not-prose my-3 space-y-2 pl-0 list-none text-slate-100 text-sm md:text-base" {...rest}>{children}</ul>;
        },
        ol({ children, start = 1, ...rest }: any) {
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
            <ol className="not-prose my-3 space-y-2.5 pl-0 text-slate-100 text-sm md:text-base list-none" {...rest}>
              {items}
            </ol>
          );
        },
        input({ type, ...rest }: any) {
          if (type === "checkbox") return null;
          return <input type={type} {...rest} />;
        },
        li(props: any) {
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

          const checkDetection = detectCheckmarkInContent(filteredChildren.length > 0 ? filteredChildren : children);

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
            <li className="flex items-start gap-2.5 my-1.5 text-sm md:text-base text-slate-100 leading-normal list-none">
              <span className="mt-2 w-2 h-2 rounded-full shrink-0 bg-gradient-to-r from-[#F4EE8E] to-[#D99E41]" />
              <span className="flex-1 min-w-0 break-words">{children}</span>
            </li>
          );
        },
        a({ href, children, ...rest }: any) {
          const textContent = Array.isArray(children) ? children.join("") : String(children || "");
          if (textContent.startsWith("👉 ") || textContent.includes("BUTTON:")) {
            return (
              <LiquidGlassButton
                url={href}
                title={textContent.replace(/^[👉\s*]+/, "").replace(/[*_]+/g, "").trim()}
                target="_blank"
              />
            );
          }
          return (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#E7C768] underline decoration-[#E7C768]/40 underline-offset-2 hover:text-[#F4EE8E] transition"
              {...rest}
            >
              {children}
            </a>
          );
        },
        img({ src, alt, ...rest }: any) {
          return (
            <img
              src={normalizeFileUrl(src)}
              alt={alt || ""}
              referrerPolicy="no-referrer"
              loading="eager"
              className="not-prose my-4 rounded-2xl border border-white/20 max-w-full h-auto shadow-xl select-none"
              {...rest}
            />
          );
        },
      }}
    >
      {children}
    </Markdown>
  );
}
