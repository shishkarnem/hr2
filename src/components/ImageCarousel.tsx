import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Image as ImageIcon,
  Maximize2,
  X,
  ExternalLink,
} from "lucide-react";
import { normalizeFileUrl } from "@/lib/fileNaming";
import { hexToRgba } from "@/components/LandingStyleEditor";

export interface CarouselSlide {
  url: string;
  caption?: string;
  alt?: string;
}

interface ImageCarouselProps {
  slides: CarouselSlide[];
  title?: string;
  className?: string;
  theme?: any;
}

export { normalizeFileUrl };

export interface SlideDimension {
  width: number;
  height: number;
  ratio: number;
  orientation: "vertical" | "square" | "horizontal";
}

function getInitialDimension(url: string, caption?: string): SlideDimension {
  const combined = `${url} ${caption || ""}`.toLowerCase();
  if (/shorts|reels|tiktok|vertical|portrait|вертикал|портрет|9x16|9_16|1080x1920|720x1280|4x5|3x4/i.test(combined)) {
    return { width: 9, height: 16, ratio: 9 / 16, orientation: "vertical" };
  }
  if (/square|квадрат|1x1|1_1|1080x1080|720x720/i.test(combined)) {
    return { width: 1, height: 1, ratio: 1, orientation: "square" };
  }
  return { width: 16, height: 9, ratio: 16 / 9, orientation: "horizontal" };
}

export default function ImageCarousel({ slides, title, className = "", theme }: ImageCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [slideDimensions, setSlideDimensions] = useState<Record<number, SlideDimension>>({});

  const total = slides?.length || 0;

  const isMono = Boolean(
    theme?.allMediaMonochrome ||
    theme?.sitePreviewMonochrome ||
    theme?.pageBgMonochrome ||
    (theme?.headingsSolidColor === "#FFFFFF" && (theme?.pageBgColor === "#000000" || !theme?.pageBgColor))
  );
  const imageFilter = isMono ? "grayscale(100%)" : undefined;

  const containerBg = theme?.containerBgColor
    ? hexToRgba(theme.containerBgColor, theme.containerBgOpacity ?? 0)
    : undefined;
  const containerBorder = theme?.containerBorderColor
    ? hexToRgba(theme.containerBorderColor, theme.containerBorderOpacity ?? 25)
    : undefined;
  const containerRadius = theme?.containerBorderRadius != null ? `${theme.containerBorderRadius}px` : undefined;
  const glassBlur = theme?.glassBlurPx != null ? `${theme.glassBlurPx}px` : undefined;

  const updateSlideDimension = useCallback((idx: number, w: number, h: number) => {
    if (!w || !h) return;
    const ratio = w / h;
    let orientation: "vertical" | "square" | "horizontal" = "horizontal";
    if (ratio < 0.85) {
      orientation = "vertical";
    } else if (ratio <= 1.15) {
      orientation = "square";
    } else {
      orientation = "horizontal";
    }
    setSlideDimensions((prev) => {
      if (prev[idx]?.width === w && prev[idx]?.height === h) return prev;
      return {
        ...prev,
        [idx]: { width: w, height: h, ratio, orientation },
      };
    });
  }, []);

  // Preload all slides immediately when carousel appears
  useEffect(() => {
    if (!slides || slides.length === 0) return;
    slides.forEach((slide, idx) => {
      const normalized = normalizeFileUrl(slide.url);
      if (normalized) {
        const img = new Image();
        img.onload = () => {
          if (img.naturalWidth && img.naturalHeight) {
            updateSlideDimension(idx, img.naturalWidth, img.naturalHeight);
          }
        };
        img.src = normalized;
      }
    });
  }, [slides, updateSlideDimension]);

  const goToNext = useCallback(() => {
    if (total <= 1) return;
    setCurrentIndex((prev) => (prev + 1) % total);
  }, [total]);

  const goToPrev = useCallback(() => {
    if (total <= 1) return;
    setCurrentIndex((prev) => (prev - 1 + total) % total);
  }, [total]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") goToNext();
      if (e.key === "ArrowLeft") goToPrev();
      if (e.key === "Escape" && isFullscreen) setIsFullscreen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [goToNext, goToPrev, isFullscreen]);

  // Touch swipe support for mobile
  const touchStartX = useRef<number | null>(null);
  const touchEndX = useRef<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchEndX.current = null;
  };
  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.touches[0].clientX;
  };
  const handleTouchEnd = () => {
    if (touchStartX.current !== null && touchEndX.current !== null) {
      const diff = touchStartX.current - touchEndX.current;
      if (diff > 45) {
        goToNext();
      } else if (diff < -45) {
        goToPrev();
      }
    }
    touchStartX.current = null;
    touchEndX.current = null;
  };

  if (!slides || slides.length === 0) {
    return null;
  }

  const currentSlide = slides[currentIndex] || slides[0];
  const activeDim = slideDimensions[currentIndex] || getInitialDimension(currentSlide?.url || "", currentSlide?.caption);

  const stageStyle: React.CSSProperties = {
    aspectRatio: `${activeDim.width} / ${activeDim.height}`,
    maxHeight:
      activeDim.orientation === "vertical"
        ? "min(82vh, 760px)"
        : activeDim.orientation === "square"
        ? "min(78vh, 620px)"
        : "min(72vh, 580px)",
    maxWidth:
      activeDim.orientation === "vertical"
        ? "min(100%, 460px)"
        : activeDim.orientation === "square"
        ? "min(100%, 600px)"
        : "100%",
    width: "100%",
  };

  const navBtnStyle: React.CSSProperties = {
    backgroundColor: theme?.btnActiveBgColor ? hexToRgba(theme.btnActiveBgColor, 80) : "rgba(0,0,0,0.55)",
    color: theme?.btnActiveTextColor || "#FFFFFF",
    borderColor: theme?.btnBorderColor ? hexToRgba(theme.btnBorderColor, 40) : "rgba(255,255,255,0.25)",
  };

  const filterOverlayColor = theme?.siteScreenshotFilterColor || theme?.sitePreviewFilterColor || "#000000";
  const filterOverlayOpacity = theme?.siteScreenshotFilterOpacity ?? theme?.sitePreviewFilterOpacity ?? 0;

  return (
    <div
      className={`not-prose my-6 border bg-transparent backdrop-blur-xl overflow-hidden shadow-2xl px-[2%] py-3.5 md:p-5 space-y-3 w-full max-w-full ${className}`}
      style={{
        backgroundColor: containerBg,
        borderColor: containerBorder || "rgba(255, 255, 255, 0.2)",
        borderRadius: containerRadius || "20px",
        backdropFilter: glassBlur ? `blur(${glassBlur})` : undefined,
        WebkitBackdropFilter: glassBlur ? `blur(${glassBlur})` : undefined,
      }}
    >
      {/* Header bar */}
      <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <ImageIcon
            className="w-4 h-4 md:w-5 md:h-5 shrink-0"
            style={{ color: theme?.iconColor || "#E7C768" }}
          />
          <span
            className="text-sm md:text-base font-bold truncate"
            style={{
              color: isMono
                ? "#FFFFFF"
                : (theme?.headingsSolidColor || "inherit"),
              fontFamily: theme?.fontFamily || undefined,
            }}
          >
            {title || "Галерея материалов"}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span
            className="text-xs md:text-sm font-semibold px-2.5 py-1 rounded-xl border"
            style={{
              color: theme?.bodyTextColor || "#CBD5E1",
              borderColor: containerBorder || "rgba(255, 255, 255, 0.15)",
            }}
          >
            {currentIndex + 1} из {total}
          </span>
        </div>
      </div>

      {/* Main Slide Stage wrapper: adapts to vertical, square, or horizontal full size */}
      <div className="w-full flex items-center justify-center min-h-[220px]">
        <div
          className="relative mx-auto flex items-center justify-center bg-black/25 rounded-2xl overflow-hidden group transition-all duration-300 shadow-xl border border-white/10"
          style={stageStyle}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {slides.map((slide, idx) => {
            const isCurrent = idx === currentIndex;
            const normalized = normalizeFileUrl(slide.url);
            return (
              <div
                key={idx}
                className={`absolute inset-0 flex items-center justify-center p-1 sm:p-2 transition-opacity duration-300 ease-in-out ${
                  isCurrent ? "opacity-100 z-10 pointer-events-auto" : "opacity-0 z-0 pointer-events-none"
                }`}
              >
                <div className="relative w-full h-full flex items-center justify-center overflow-hidden rounded-xl">
                  <img
                    src={normalized}
                    alt={slide.alt || slide.caption || `Слайд ${idx + 1}`}
                    referrerPolicy="no-referrer"
                    loading="eager"
                    onLoad={(e) => updateSlideDimension(idx, e.currentTarget.naturalWidth, e.currentTarget.naturalHeight)}
                    onClick={() => setIsFullscreen(true)}
                    className="w-full h-full object-contain select-none cursor-pointer transition-transform duration-300 group-hover:scale-[1.01]"
                    title="Нажмите для просмотра в полном размере"
                    style={{
                      filter: imageFilter,
                    }}
                  />
                  {filterOverlayOpacity > 0 && (
                    <div
                      className="absolute inset-0 pointer-events-none rounded-xl"
                      style={{
                        backgroundColor: hexToRgba(filterOverlayColor, filterOverlayOpacity),
                      }}
                    />
                  )}
                </div>
              </div>
            );
          })}

          {/* Fullscreen view trigger */}
          <button
            type="button"
            onClick={() => setIsFullscreen(true)}
            title="Открыть изображение на весь экран"
            className="absolute top-2.5 right-2.5 z-20 p-2 rounded-xl bg-black/60 hover:bg-black/80 border border-white/20 text-white backdrop-blur-md transition cursor-pointer opacity-80 hover:opacity-100 shadow-md"
            aria-label="Открыть изображение на весь экран"
          >
            <Maximize2 className="w-4 h-4" />
          </button>

          {/* Previous Button */}
          {total > 1 && (
            <button
              type="button"
              onClick={goToPrev}
              className="absolute left-2 sm:left-3 top-1/2 -translate-y-1/2 z-20 p-2 sm:p-2.5 rounded-full border shadow-lg cursor-pointer active:scale-95 transition backdrop-blur-md hover:brightness-110"
              style={navBtnStyle}
              aria-label="Предыдущий слайд"
            >
              <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5" style={{ color: "inherit" }} />
            </button>
          )}

          {/* Next Button */}
          {total > 1 && (
            <button
              type="button"
              onClick={goToNext}
              className="absolute right-2 sm:right-3 top-1/2 -translate-y-1/2 z-20 p-2 sm:p-2.5 rounded-full border shadow-lg cursor-pointer active:scale-95 transition backdrop-blur-md hover:brightness-110"
              style={navBtnStyle}
              aria-label="Следующий слайд"
            >
              <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5" style={{ color: "inherit" }} />
            </button>
          )}
        </div>
      </div>

      {/* Slide caption */}
      {currentSlide?.caption && (
        <div
          className="text-center px-3 py-1 text-sm italic break-words whitespace-normal"
          style={{ color: theme?.bodyTextColor || "#E2E8F0" }}
        >
          {currentSlide.caption}
        </div>
      )}

      {/* Thumbnail / Dot indicators */}
      {total > 1 && (
        <div className="flex items-center justify-center gap-1.5 sm:gap-2 pt-1 flex-wrap">
          {slides.map((_, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => setCurrentIndex(idx)}
              className={`h-2 sm:h-2.5 rounded-full transition-all cursor-pointer ${
                idx === currentIndex
                  ? "w-6 sm:w-8 bg-white"
                  : "w-2 sm:w-2.5 bg-white/30 hover:bg-white/50"
              }`}
              style={{
                backgroundColor: idx === currentIndex
                  ? (theme?.btnActiveBgColor || (isMono ? "#FFFFFF" : undefined))
                  : undefined,
              }}
              aria-label={`Перейти к слайду ${idx + 1}`}
            />
          ))}
        </div>
      )}

      {/* Fullscreen Lightbox Modal */}
      {isFullscreen && (
        <div
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-xl flex flex-col items-center justify-between p-4 sm:p-6 animate-in fade-in duration-200"
          onClick={() => setIsFullscreen(false)}
        >
          {/* Top bar */}
          <div
            className="w-full flex items-center justify-between z-10 gap-3 max-w-5xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 text-white">
              <ImageIcon className="w-5 h-5 text-[#E7C768]" />
              <span className="text-sm font-semibold truncate max-w-xs md:max-w-md">
                {currentSlide?.caption || currentSlide?.alt || title || `Слайд ${currentIndex + 1}`}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-white/70 px-2 py-1 rounded-lg border border-white/20">
                {currentIndex + 1} / {total}
              </span>
              <a
                href={normalizeFileUrl(currentSlide.url)}
                target="_blank"
                rel="noreferrer"
                title="Открыть оригинал в новой вкладке"
                className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition cursor-pointer border border-white/20"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
              <button
                type="button"
                onClick={() => setIsFullscreen(false)}
                title="Закрыть полноэкранный режим"
                className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition cursor-pointer border border-white/20"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Full-size image stage */}
          <div
            className="relative flex-1 w-full max-w-6xl flex items-center justify-center overflow-hidden my-3"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={normalizeFileUrl(currentSlide.url)}
              alt={currentSlide.alt || currentSlide.caption || `Слайд ${currentIndex + 1}`}
              className="max-h-[85vh] max-w-full object-contain select-none shadow-2xl rounded-xl"
              style={{ filter: imageFilter }}
            />

            {/* Lightbox Prev */}
            {total > 1 && (
              <button
                type="button"
                onClick={goToPrev}
                className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 p-2.5 sm:p-3 rounded-full bg-black/60 hover:bg-black/80 text-white border border-white/25 shadow-xl transition cursor-pointer active:scale-95"
                aria-label="Предыдущий слайд"
              >
                <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6" />
              </button>
            )}

            {/* Lightbox Next */}
            {total > 1 && (
              <button
                type="button"
                onClick={goToNext}
                className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 p-2.5 sm:p-3 rounded-full bg-black/60 hover:bg-black/80 text-white border border-white/25 shadow-xl transition cursor-pointer active:scale-95"
                aria-label="Следующий слайд"
              >
                <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6" />
              </button>
            )}
          </div>

          {/* Bottom caption */}
          {currentSlide?.caption && (
            <div
              className="text-center text-sm text-white/90 max-w-2xl px-4 py-1.5 bg-black/40 rounded-xl border border-white/10"
              onClick={(e) => e.stopPropagation()}
            >
              {currentSlide.caption}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
