import React, { useState, useEffect, useRef } from "react";
import {
  FileText,
  ExternalLink,
  Download,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  Copy,
  Check,
  Loader2,
  AlertCircle,
  FileSpreadsheet,
  FileCode,
} from "lucide-react";
import { toast } from "sonner";
import { toAbsoluteUrl } from "@/lib/fileNaming";
import { useAIWait } from "@/components/AIWaitProvider";
import { hexToRgba } from "@/components/LandingStyleEditor";
import { resolveActiveEmployerId } from "@/lib/actorSession";

interface DocumentFrameBlockProps {
  src: string;
  title?: string;
  originalUrl?: string;
  height?: number | string;
  onRecognizeComplete?: (text: string) => void;
  theme?: any;
}

function DocumentFrameBlockComponent({
  src,
  title = "Документ",
  originalUrl,
  height = 1000,
  onRecognizeComplete,
  theme,
}: DocumentFrameBlockProps) {
  const displayUrl = toAbsoluteUrl(originalUrl || src);
  const aiWait = useAIWait();

  // File extension detection
  const cleanUrl = (displayUrl || "").split("?")[0].toLowerCase();
  const isPdf = cleanUrl.endsWith(".pdf") || /\.pdf$/i.test(src);
  const isSheet = /\.(xlsx?|csv)$/i.test(cleanUrl) || /\.(xlsx?|csv)$/i.test(src);
  const isDoc = /\.(docx?|rtf)$/i.test(cleanUrl) || /\.(docx?|rtf)$/i.test(src);
  const isTxt = /\.(txt|md|log)$/i.test(cleanUrl) || /\.(txt|md|log)$/i.test(src);

  // Google Docs / Sheets / Slides / Drive detection
  const gSlideMatch = displayUrl.match(/docs\.google\.com\/presentation\/d\/([\w-]+)/i);
  const gDocMatch = displayUrl.match(/docs\.google\.com\/document\/d\/([\w-]+)/i);
  const gSheetMatch = displayUrl.match(/docs\.google\.com\/spreadsheets\/d\/([\w-]+)/i);
  const gDriveMatch = displayUrl.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?id=)([\w-]+)/i);

  let extLabel = "Документ";
  if (isPdf) extLabel = "PDF";
  else if (gSlideMatch) extLabel = "Google Презентация";
  else if (gDocMatch) extLabel = "Google Документ";
  else if (gSheetMatch) extLabel = "Google Таблица";
  else if (gDriveMatch) extLabel = "Google Диск";
  else if (isSheet) extLabel = "XLSX/CSV";
  else if (isDoc) extLabel = "DOCX";
  else if (isTxt) extLabel = "TXT";

  let iframeSrc = displayUrl;
  if (isPdf) {
    iframeSrc = displayUrl;
  } else if (gSlideMatch) {
    iframeSrc = `https://docs.google.com/presentation/d/${gSlideMatch[1]}/preview`;
  } else if (gDocMatch) {
    iframeSrc = `https://docs.google.com/document/d/${gDocMatch[1]}/preview`;
  } else if (gSheetMatch) {
    iframeSrc = `https://docs.google.com/spreadsheets/d/${gSheetMatch[1]}/preview?widget=true&headers=false`;
  } else if (gDriveMatch) {
    iframeSrc = `https://drive.google.com/file/d/${gDriveMatch[1]}/preview`;
  } else {
    iframeSrc = `https://docs.google.com/viewer?url=${encodeURIComponent(displayUrl)}&embedded=true`;
  }

  // PDF Viewer states
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [scale, setScale] = useState<number>(1.15);
  const [pdfLoading, setPdfLoading] = useState<boolean>(isPdf);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pdfDocRef = useRef<any>(null);

  // General frame states
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [recognizedText, setRecognizedText] = useState<string>("");
  const [showRecognizedText, setShowRecognizedText] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [txtContent, setTxtContent] = useState<string>("");
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Scroll to the very top whenever page, document URL or scale changes
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = 0;
    }
  }, [pageNumber, displayUrl, scale]);

  // Load PDF with pdfjs-dist
  useEffect(() => {
    if (!isPdf || !displayUrl) return;

    let isMounted = true;
    setPdfLoading(true);
    setPdfError(null);

    const loadPdf = async () => {
      try {
        // @ts-ignore - dynamic browser ESM bundle
        const pdfjsLib: any = await import("pdfjs-dist/build/pdf.min.mjs");
        if (pdfjsLib.GlobalWorkerOptions && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
          pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version || "4.10.38"}/pdf.worker.min.mjs`;
        }

        const loadingTask = pdfjsLib.getDocument({
          url: displayUrl,
          withCredentials: false,
        });

        const pdf = await loadingTask.promise;
        if (!isMounted) return;

        pdfDocRef.current = pdf;
        setNumPages(pdf.numPages || 1);
        setPageNumber(1);
        setPdfLoading(false);
      } catch (err: any) {
        if (!isMounted) return;
        console.warn("[DocumentFrameBlock] pdfjs load note, fallback to embed viewer:", err);
        setPdfError("Используется встроенный просмотрщик");
        setPdfLoading(false);
      }
    };

    loadPdf();

    return () => {
      isMounted = false;
    };
  }, [displayUrl, isPdf]);

  // Render current PDF page to canvas
  useEffect(() => {
    if (!pdfDocRef.current || !canvasRef.current || !isPdf) return;

    let renderTask: any = null;
    let cancelled = false;

    const renderPage = async () => {
      try {
        const page = await pdfDocRef.current.getPage(pageNumber);
        if (cancelled || !canvasRef.current) return;

        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        const context = canvas.getContext("2d");
        if (!context) return;

        canvas.height = viewport.height;
        canvas.width = viewport.width;

        const renderContext = {
          canvasContext: context,
          viewport: viewport,
        };

        renderTask = page.render(renderContext);
        await renderTask.promise;
      } catch (err: any) {
        if (!cancelled && err?.name !== "RenderingCancelledException") {
          console.warn("[DocumentFrameBlock] page render note:", err);
        }
      }
    };

    renderPage();

    return () => {
      cancelled = true;
      if (renderTask) {
        renderTask.cancel();
      }
    };
  }, [pageNumber, scale, isPdf, pdfLoading]);

  // Fetch pure text for txt / md / csv
  useEffect(() => {
    if (!isTxt || !displayUrl) return;
    let active = true;
    fetch(displayUrl)
      .then((res) => (res.ok ? res.text() : ""))
      .then((text) => {
        if (active && text) setTxtContent(text);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [displayUrl, isTxt]);

  // Direct Function 369 AI recognition trigger
  const handleRecognize = async () => {
    try {
      await aiWait.run({
        title: `Распознавание документа: ${title}`,
        task: async () => {
          const effEmpId = resolveActiveEmployerId();
          const res = await fetch("/api/ai-ingest-document", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              file_url: displayUrl,
              filename: title,
              entity: "training",
              entity_id: "materials",
              employer_id: effEmpId,
              employer_public_id: effEmpId,
              max_chars: 35000,
            }),
          });

          if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.error || `Ошибка сервера: ${res.status}`);
          }

          const data = await res.json();
          const text = data.text || data.result || data.reply || "";
          if (!text || text.trim().length === 0) {
            throw new Error("Функция 369 не смогла извлечь текст из документа.");
          }

          const clean = text.trim();
          setRecognizedText(clean);
          setShowRecognizedText(true);
          if (onRecognizeComplete) {
            onRecognizeComplete(clean);
          }
          toast.success(`Документ успешно распознан (${clean.length} символов)!`);
          return clean;
        },
      });
    } catch (err: any) {
      toast.error(err.message || "Ошибка распознавания документа через ИИ");
    }
  };

  const handleCopyRecognized = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard && recognizedText) {
      navigator.clipboard.writeText(recognizedText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success("Текст скопирован в буфер обмена");
    }
  };

  const parsedHeight =
    typeof height === "number"
      ? `${height}px`
      : /^\d+$/.test(String(height || "").trim())
      ? `${String(height).trim()}px`
      : String(height || "").trim() || "1000px";

  return (
    <div
      className={`not-prose my-6 rounded-3xl border border-white/20 bg-transparent backdrop-blur-xl shadow-2xl overflow-hidden transition-all duration-300 ${
        isFullscreen ? "fixed inset-4 z-50 bg-[#17344F]/95 backdrop-blur-2xl flex flex-col" : "w-full"
      }`}
    >
      {/* Top Document Header in Liquid Glass style */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-white/5 backdrop-blur-md gap-3 flex-wrap">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-2 rounded-xl bg-white/5 border border-white/15 flex items-center justify-center shrink-0">
            {isSheet ? (
              <FileSpreadsheet className="w-5 h-5 text-[#E7C768]" />
            ) : isTxt ? (
              <FileCode className="w-5 h-5 text-[#E7C768]" />
            ) : (
              <FileText className="w-5 h-5 text-[#E7C768]" />
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-white truncate max-w-[220px] md:max-w-md">
                {title}
              </span>
              <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-[#E7C768]/20 border border-[#E7C768]/40 text-[#F4EE8E]">
                {extLabel}
              </span>
            </div>
            <span className="text-xs text-white/50 truncate block max-w-xs md:max-w-sm">
              {displayUrl}
            </span>
          </div>
        </div>

        {/* Action Buttons Toolbar */}
        <div className="flex items-center gap-2 flex-wrap">
          {(() => {
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

            const aiBtnStyle: React.CSSProperties = {
              backgroundColor: theme?.btnActiveBgColor
                ? hexToRgba(theme.btnActiveBgColor, Math.max(20, (theme.btnActiveOpacity ?? 100) - 25))
                : "var(--landing-btn-active-bg, rgba(255, 255, 255, 0.2))",
              color: activeBtnText,
              borderColor: activeBtnBorder,
              borderWidth: activeBtnBorderWidth,
              borderRadius: activeBtnRadius,
              fontFamily: theme?.fontFamily || undefined,
            };

            return (
              <>
                {/* AI Recognition Button (Direct Function 369 with Mascot Overlay) */}
                <button
                  type="button"
                  onClick={handleRecognize}
                  title="Распознать текст документа через наш ИИ сервис (Функция 369)"
                  className="landing-btn-active px-3.5 py-1.5 text-xs font-bold flex items-center gap-1.5 shadow-sm transition active:scale-95 cursor-pointer hover:brightness-110 shrink-0 break-words whitespace-normal text-wrap"
                  style={aiBtnStyle}
                >
                  <Sparkles className="w-3.5 h-3.5 shrink-0" style={{ color: activeBtnText, stroke: activeBtnText }} />
                  <span className="break-words whitespace-normal text-wrap" style={{ color: activeBtnText, WebkitTextFillColor: activeBtnText }}>Распознать через ИИ</span>
                </button>

                {/* Download / Open Direct Link */}
                <a
                  href={displayUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  download
                  title="Скачать или открыть документ в новой вкладке"
                  className="landing-btn-active px-3.5 py-1.5 text-xs font-bold flex items-center gap-1.5 hover:brightness-105 active:scale-95 transition shadow-md whitespace-normal break-words text-wrap shrink-0"
                  style={activeBtnStyle}
                >
                  <Download className="w-3.5 h-3.5 shrink-0" style={{ color: activeBtnText, stroke: activeBtnText }} />
                  <span className="break-words whitespace-normal text-wrap" style={{ color: activeBtnText, WebkitTextFillColor: activeBtnText }}>Скачать / Открыть</span>
                  <ExternalLink className="w-3 h-3 opacity-70 shrink-0" style={{ color: activeBtnText, stroke: activeBtnText }} />
                </a>
              </>
            );
          })()}

          {/* Fullscreen Toggle */}
          <button
            type="button"
            onClick={() => setIsFullscreen(!isFullscreen)}
            title={isFullscreen ? "Свернуть окно" : "Развернуть на весь экран"}
            className="p-1.5 rounded-xl hover:bg-white/10 text-slate-200 hover:text-white transition flex items-center gap-1 text-xs cursor-pointer"
          >
            {isFullscreen ? (
              <Minimize2 className="w-4 h-4 text-[#E7C768]" />
            ) : (
              <Maximize2 className="w-4 h-4 text-[#E7C768]" />
            )}
          </button>
        </div>
      </div>

      {/* PDF Controls Bar (Page navigation & zoom) */}
      {isPdf && !pdfError && (
        <div className="flex items-center justify-between px-4 py-2 bg-white/5 border-b border-white/10 text-xs text-white/80 gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={pageNumber <= 1 || pdfLoading}
              onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
              className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 disabled:opacity-40 transition cursor-pointer"
              title="Предыдущая страница"
            >
              <ChevronLeft className="w-4 h-4 text-[#E7C768]" />
            </button>
            <span className="text-xs font-medium text-white px-1">
              Стр. {pageNumber} из {numPages || "..."}
            </span>
            <button
              type="button"
              disabled={pageNumber >= numPages || pdfLoading}
              onClick={() => setPageNumber((p) => Math.min(numPages, p + 1))}
              className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 disabled:opacity-40 transition cursor-pointer"
              title="Следующая страница"
            >
              <ChevronRight className="w-4 h-4 text-[#E7C768]" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setScale((s) => Math.max(0.75, s - 0.15))}
              className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 transition cursor-pointer"
              title="Уменьшить масштаб"
            >
              <ZoomOut className="w-3.5 h-3.5 text-[#E7C768]" />
            </button>
            <span className="text-xs text-white/70 font-mono w-12 text-center">
              {Math.round(scale * 100)}%
            </span>
            <button
              type="button"
              onClick={() => setScale((s) => Math.min(2.5, s + 0.15))}
              className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 transition cursor-pointer"
              title="Увеличить масштаб"
            >
              <ZoomIn className="w-3.5 h-3.5 text-[#E7C768]" />
            </button>
          </div>
        </div>
      )}

      {/* Main Preview Container */}
      <div
        ref={containerRef}
        className={`w-full relative overflow-auto bg-transparent backdrop-blur-md flex items-start justify-center custom-company-scrollbar ${
          isFullscreen ? "flex-1 min-h-0" : ""
        }`}
        style={{
          ...(!isFullscreen ? { height: parsedHeight } : {}),
          scrollbarWidth: "thin",
          scrollbarColor: "var(--landing-icon-color, #E7C768) transparent",
        }}
      >
        <style>{`
          .custom-company-scrollbar::-webkit-scrollbar {
            width: 6px;
            height: 6px;
          }
          .custom-company-scrollbar::-webkit-scrollbar-track {
            background: transparent !important;
          }
          .custom-company-scrollbar::-webkit-scrollbar-thumb {
            background: var(--landing-icon-color, #E7C768) !important;
            border-radius: 9999px !important;
          }
          .custom-company-scrollbar::-webkit-scrollbar-thumb:hover {
            background: var(--landing-icon-color, #E7C768) !important;
            filter: brightness(1.2);
          }
        `}</style>
        {isPdf && !pdfError ? (
          pdfLoading ? (
            <div className="flex flex-col items-center justify-center p-8 space-y-3 my-auto">
              <Loader2 className="w-8 h-8 text-[#E7C768] animate-spin" />
              <p className="text-sm text-white/80">Загрузка страниц документа...</p>
            </div>
          ) : (
            <div className="w-full py-4 px-2 flex justify-center items-start min-h-full">
              <canvas
                ref={canvasRef}
                className="max-w-full shadow-2xl rounded-xl border border-white/15 bg-white shrink-0"
              />
            </div>
          )
        ) : isTxt && txtContent ? (
          <div className="w-full h-full p-6 overflow-auto text-left font-sans text-sm text-white/90 leading-relaxed whitespace-pre-wrap">
            {txtContent}
          </div>
        ) : (
          <iframe
            src={iframeSrc}
            className="w-full h-full border-0 bg-transparent"
            title={title}
            allow="autoplay; encrypted-media; fullscreen"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            loading="lazy"
          />
        )}
      </div>

      {/* Collapsible Recognized Text Panel */}
      {showRecognizedText && recognizedText && (
        <div className="p-4 border-t border-white/10 bg-white/5 backdrop-blur-md space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#E7C768]" />
              <span className="text-xs font-bold text-[#F4EE8E]">
                Распознанный текст ({recognizedText.length} симв.):
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopyRecognized}
                className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/15 text-xs text-white flex items-center gap-1 cursor-pointer transition"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-[#E7C768]" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? "Скопировано" : "Копировать текст"}</span>
              </button>
              <button
                type="button"
                onClick={() => setShowRecognizedText(false)}
                className="text-xs text-white/50 hover:text-white px-2 py-1"
              >
                Скрыть
              </button>
            </div>
          </div>
          <div className="max-h-48 overflow-y-auto p-3 rounded-xl border border-white/15 bg-white/5 text-xs text-white/90 whitespace-pre-wrap leading-relaxed">
            {recognizedText}
          </div>
        </div>
      )}
    </div>
  );
}

export const DocumentFrameBlock = React.memo(DocumentFrameBlockComponent);
export default DocumentFrameBlock;
