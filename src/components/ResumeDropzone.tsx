import React, { useRef, useState, useCallback, useMemo } from "react";
import {
  Upload,
  FileText,
  X,
  Loader,
  CheckCircle2,
  Send,
  AlertTriangle,
  Link2,
  Copy,
  Cloud,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { formatFileNameWithUserAndTimestamp } from "../lib/fileNaming";
import { useLandingTheme } from "./LandingStyleEditor";

/**
 * Универсальная область загрузки резюме и распознавания текста.
 * Поддерживает:
 * 1) Загрузку файла на наше облако (PDF, DOCX, DOC, XLSX, PPTX, TXT, RTF, CSV)
 * 2) Вставку ссылки из Google Диска (модальное окно: Google Документы, Таблицы, Слайды, Файл Google Диска)
 * Автоматически определяет file_type по загружаемому файлу или по ссылке для передачи в функцию 369.
 */

const ACCEPT =
  ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.rtf,.csv,.md,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain";

function hexToRgba(hex: string, alphaPercent: number = 100): string {
  if (!hex || typeof hex !== "string") return `rgba(255, 255, 255, ${alphaPercent / 100})`;
  let clean = hex.replace("#", "").trim();
  if (clean.length === 3) {
    clean = clean
      .split("")
      .map((c) => c + c)
      .join("");
  }
  if (clean.length !== 6) return `rgba(255, 255, 255, ${alphaPercent / 100})`;
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  const a = Math.max(0, Math.min(100, alphaPercent)) / 100;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

export interface DetectedResumeSource {
  sourceKind: "gdoc" | "gsheet" | "gslide" | "gfile" | "direct" | "upload";
  label: string;
  fileType: string;
  normalizedUrl: string;
  filename: string;
}

export function detectFileTypeFromNameOrMime(filename?: string, mimeType?: string): string {
  const cleanName = String(filename || "")
    .split("?")[0]
    .split("#")[0]
    .trim()
    .toLowerCase();
  const ext = cleanName.includes(".") ? cleanName.split(".").pop() || "" : "";
  if (
    ["pdf", "docx", "doc", "xlsx", "xls", "pptx", "ppt", "txt", "rtf", "csv", "md", "json", "html"].includes(
      ext
    )
  ) {
    return ext;
  }
  const mime = String(mimeType || "").toLowerCase();
  if (mime.includes("pdf")) return "pdf";
  if (mime.includes("wordprocessingml") || mime.includes("docx")) return "docx";
  if (mime.includes("msword")) return "doc";
  if (mime.includes("spreadsheetml") || mime.includes("excel") || mime.includes("xlsx")) return "xlsx";
  if (mime.includes("presentationml") || mime.includes("powerpoint") || mime.includes("pptx")) return "pptx";
  if (mime.includes("csv")) return "csv";
  if (mime.includes("rtf")) return "rtf";
  if (mime.includes("text/plain")) return "txt";
  return "pdf";
}

export function detectResumeLinkSource(rawUrl: string, overrideDriveFileType?: string): DetectedResumeSource {
  const clean = String(rawUrl || "").trim();

  // 1. Google Docs (документы) -> Function 369 expects /edit URL and file_type: "docx"
  const docMatch = clean.match(/docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)/i);
  if (docMatch) {
    const id = docMatch[1];
    return {
      sourceKind: "gdoc",
      label: "Google Документы (docx)",
      fileType: "docx",
      normalizedUrl: `https://docs.google.com/document/d/${id}/edit`,
      filename: `google_doc_${id.slice(0, 8)}.docx`,
    };
  }

  // 2. Google Sheets (таблицы) -> Function 369 expects /edit URL and file_type: "xlsx"
  const sheetMatch = clean.match(/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/i);
  if (sheetMatch) {
    const id = sheetMatch[1];
    return {
      sourceKind: "gsheet",
      label: "Google Таблица (xlsx)",
      fileType: "xlsx",
      normalizedUrl: `https://docs.google.com/spreadsheets/d/${id}/edit`,
      filename: `google_sheet_${id.slice(0, 8)}.xlsx`,
    };
  }

  // 3. Google Slides (слайды / презентация) -> Function 369 expects /edit URL and file_type: "pptx"
  const slideMatch = clean.match(/docs\.google\.com\/presentation\/d\/([a-zA-Z0-9_-]+)/i);
  if (slideMatch) {
    const id = slideMatch[1];
    return {
      sourceKind: "gslide",
      label: "Google Слайды (pptx)",
      fileType: "pptx",
      normalizedUrl: `https://docs.google.com/presentation/d/${id}/edit`,
      filename: `google_slides_${id.slice(0, 8)}.pptx`,
    };
  }

  // 4. Google Drive file (файл на Google Диске)
  const fileMatch =
    clean.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/i) ||
    (clean.includes("drive.google.com") ? clean.match(/[?&]id=([a-zA-Z0-9_-]+)/i) : null);
  if (fileMatch) {
    const id = fileMatch[1];
    const fType = (overrideDriveFileType || "pdf").toLowerCase();
    return {
      sourceKind: "gfile",
      label: `Файл Google Диска (${fType})`,
      fileType: fType,
      normalizedUrl: `https://drive.google.com/uc?export=download&id=${id}`,
      filename: `google_drive_${id.slice(0, 8)}.${fType}`,
    };
  }

  // 5. Прямая ссылка на файл
  const ext = detectFileTypeFromNameOrMime(clean);
  const urlParts = clean.split("?")[0].split("/");
  const lastSegment = urlParts[urlParts.length - 1] || `resume.${ext}`;
  return {
    sourceKind: "direct",
    label: `Прямая ссылка на файл (${ext})`,
    fileType: ext,
    normalizedUrl: clean,
    filename: lastSegment.includes(".") ? lastSegment : `${lastSegment}.${ext}`,
  };
}

export interface ResumeDropzoneProps {
  uploading: boolean;
  parsing: boolean;
  uploaded: { filename: string; url?: string; fileType?: string } | null;
  /** Признак того, что текст резюме уже распознан */
  hasRecognizedText?: boolean;
  error?: string;
  busy?: boolean;
  onFile: (file: File, detectedFileType?: string) => void;
  onUrl?: (linkInfo: { url: string; filename: string; fileType: string }) => void;
  onSend?: () => void;
  onClear?: () => void;
  sendLabel?: string;
  sendDisabled?: boolean;
  fileMissing?: boolean;
  activeTheme?: any;
}

const DRIVE_FILE_TYPES: { value: string; label: string }[] = [
  { value: "pdf", label: "PDF документ (.pdf)" },
  { value: "docx", label: "Документ Word (.docx)" },
  { value: "doc", label: "Документ Word (.doc)" },
  { value: "rtf", label: "Документ RTF (.rtf)" },
  { value: "txt", label: "Текстовый файл (.txt)" },
  { value: "xlsx", label: "Таблица Excel (.xlsx)" },
  { value: "pptx", label: "Презентация (.pptx)" },
];

export const ResumeDropzone: React.FC<ResumeDropzoneProps> = ({
  uploading,
  parsing,
  uploaded,
  error,
  busy,
  onFile,
  onUrl,
  onSend,
  onClear,
  sendLabel = "Распознать резюме",
  sendDisabled,
  fileMissing,
  activeTheme: propTheme,
}) => {
  const { activeTheme: hookTheme } = useLandingTheme();
  const activeTheme = propTheme || hookTheme;
  const iconColor = activeTheme?.iconColor || "#E7C768";
  const boldTextColor = activeTheme?.boldTextColor || "#FFFFFF";
  const containerRadius =
    activeTheme?.containerBorderRadius != null ? `${activeTheme.containerBorderRadius}px` : "16px";
  const containerBorder = activeTheme?.containerBorderColor
    ? hexToRgba(activeTheme.containerBorderColor, activeTheme.containerBorderOpacity ?? 25)
    : "rgba(255, 255, 255, 0.25)";
  const btnRadius =
    activeTheme?.btnBorderRadius === 999
      ? "9999px"
      : activeTheme?.btnBorderRadius != null
      ? `${activeTheme.btnBorderRadius}px`
      : "14px";
  const fontFamily = activeTheme?.fontFamily || undefined;

  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  // Состояние модального окна вставки ссылки из Google Диска
  const [googleModalOpen, setGoogleModalOpen] = useState(false);
  const [googleLinkInput, setGoogleLinkInput] = useState("");
  const [driveFileFormat, setDriveFileFormat] = useState("pdf");

  const disabled = !fileMissing && (uploading || parsing || !!busy);
  const effectiveUploaded = fileMissing ? null : uploaded;

  const detectedLink = useMemo(() => {
    if (!googleLinkInput.trim() || !/^https?:\/\//i.test(googleLinkInput.trim())) return null;
    return detectResumeLinkSource(googleLinkInput.trim(), driveFileFormat);
  }, [googleLinkInput, driveFileFormat]);

  const openPicker = useCallback(() => {
    if (disabled) return;
    inputRef.current?.click();
  }, [disabled]);

  const validateAndSend = useCallback(
    (file: File | undefined | null) => {
      if (!file) return;
      if (file.size > 20 * 1024 * 1024) {
        toast.error("Файл больше 20 МБ. Сожмите документ или выберите другой.");
        return;
      }
      const detectedType = detectFileTypeFromNameOrMime(file.name, file.type);
      onFile(file, detectedType);
    },
    [onFile]
  );

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (disabled) return;
    const file = e.dataTransfer.files?.[0];
    validateAndSend(file);
  };

  const handleConfirmGoogleLink = () => {
    const raw = googleLinkInput.trim();
    if (!raw || !/^https?:\/\//i.test(raw)) {
      toast.error("Вставьте корректную ссылку на документ или файл Google Диска");
      return;
    }
    const parsed = detectResumeLinkSource(raw, driveFileFormat);
    setGoogleModalOpen(false);
    setGoogleLinkInput("");
    if (onUrl) {
      onUrl({
        url: parsed.normalizedUrl,
        filename: parsed.filename,
        fileType: parsed.fileType,
      });
    } else {
      toast.info("Ссылка принята к обработке");
    }
  };

  return (
    <div className="space-y-3" style={{ fontFamily }}>
      {/* Кнопки разделения: Загрузка на наше облако и Вставка ссылки из Google Диска */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <button
          type="button"
          disabled={disabled}
          onClick={openPicker}
          className="px-4 py-3 rounded-2xl border border-[#E7C768]/60 bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] text-[#17344F] font-bold text-sm flex items-center justify-center gap-2 shadow-md hover:brightness-105 transition cursor-pointer disabled:opacity-50"
          style={{ borderRadius: btnRadius }}
        >
          <Cloud className="w-4 h-4 shrink-0" />
          <span>Загрузить файл на наше облако</span>
        </button>

        <button
          type="button"
          disabled={disabled}
          onClick={() => setGoogleModalOpen(true)}
          className="px-4 py-3 rounded-2xl border border-white/25 bg-transparent backdrop-blur-xl text-white hover:border-[#E7C768] font-bold text-sm flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50"
          style={{ borderRadius: btnRadius }}
        >
          <Link2 className="w-4 h-4 text-[#E7C768] shrink-0" />
          <span>Вставить ссылку из Google Диска</span>
        </button>
      </div>

      {/* Область перетаскивания и загрузки файла в облако */}
      <div
        role="button"
        tabIndex={0}
        aria-label="Перетащите файл резюме или нажмите для выбора"
        aria-disabled={disabled}
        onClick={openPicker}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openPicker();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={[
          "w-full border-2 border-dashed transition-all p-5 md:p-6 text-center cursor-pointer select-none backdrop-blur-xl bg-transparent",
          dragOver ? "scale-[1.01] border-[#E7C768]" : "hover:border-[#E7C768]/60",
          disabled ? "opacity-80 cursor-progress" : "",
        ].join(" ")}
        style={{
          borderRadius: containerRadius,
          borderColor: dragOver ? "#E7C768" : containerBorder,
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onClick={(e) => {
            (e.currentTarget as HTMLInputElement).value = "";
          }}
          onChange={(e) => validateAndSend(e.target.files?.[0] || null)}
        />

        <div className="flex flex-col items-center gap-2">
          {fileMissing ? (
            <>
              <AlertTriangle className="w-7 h-7 text-[#E7C768]" />
              <div className="text-sm font-bold text-white">Файл резюме был удалён</div>
              <div className="text-sm text-white/85 max-w-sm">
                Загрузите резюме заново в облако или укажите ссылку на Google Диск.
              </div>
            </>
          ) : uploading ? (
            <>
              <Loader className="w-6 h-6 animate-spin" style={{ color: iconColor }} />
              <div className="text-sm font-bold" style={{ color: boldTextColor }}>
                Загружаем файл в облако…
              </div>
              <div className="text-sm text-white/80">
                После загрузки распознавание запустится автоматически
              </div>
            </>
          ) : parsing ? (
            <>
              <Loader className="w-6 h-6 animate-spin" style={{ color: iconColor }} />
              <div className="text-sm font-bold" style={{ color: boldTextColor }}>
                ИИ распознаёт текст резюме…
              </div>
              <div className="text-sm text-white/80">Пожалуйста, дождитесь завершения</div>
            </>
          ) : effectiveUploaded ? (
            <>
              <CheckCircle2 className="w-7 h-7" style={{ color: iconColor }} />
              <div className="text-sm font-bold text-white break-all">{effectiveUploaded.filename}</div>
              <div className="text-sm text-white/85">
                Документ загружен и распознан автоматически
                {effectiveUploaded.fileType ? ` (формат: ${effectiveUploaded.fileType})` : ""}
              </div>
            </>
          ) : (
            <>
              <Upload className="w-7 h-7" style={{ color: iconColor }} />
              <div className="text-sm font-bold text-white">
                Перетащите файл резюме сюда или нажмите для загрузки в облако
              </div>
              <div className="text-sm text-white/75 mt-0.5">
                Поддерживаются PDF, DOCX, DOC, XLSX, PPTX, TXT, RTF — распознавание запустится сразу
              </div>
            </>
          )}
        </div>
      </div>

      {error && !fileMissing && (
        <div className="text-sm text-white bg-transparent border border-[#E7C768]/50 backdrop-blur-xl rounded-xl px-3.5 py-2.5">
          {error}
        </div>
      )}

      {effectiveUploaded && !uploading && !parsing && (
        <div className="space-y-2">
          <div
            className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 text-sm text-white bg-transparent border backdrop-blur-xl"
            style={{ borderColor: containerBorder, borderRadius: btnRadius }}
          >
            <span className="flex items-center gap-2 font-bold">
              <FileText className="w-4 h-4" style={{ color: iconColor }} />
              <span className="break-all">{effectiveUploaded.filename}</span>
              {effectiveUploaded.fileType && (
                <span className="text-sm px-2 py-0.5 rounded-lg border border-[#E7C768]/45 text-[#E7C768]">
                  {effectiveUploaded.fileType}
                </span>
              )}
            </span>
            <div className="flex items-center gap-2">
              {onClear && (
                <button
                  type="button"
                  onClick={onClear}
                  className="text-sm text-white/80 hover:text-white inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/25 hover:border-[#E7C768] cursor-pointer"
                >
                  <X className="w-4 h-4" /> Убрать
                </button>
              )}
              {onSend && (
                <button
                  type="button"
                  disabled={sendDisabled || parsing}
                  onClick={onSend}
                  className="landing-btn-active font-bold text-sm px-3.5 py-1.5 flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed border transition shadow-sm cursor-pointer"
                  style={{
                    backgroundColor: activeTheme?.btnActiveBgColor || undefined,
                    color: activeTheme?.btnActiveTextColor || undefined,
                    borderColor: activeTheme?.btnBorderColor || undefined,
                    borderRadius: btnRadius,
                  }}
                >
                  <Send className="w-4 h-4" /> {sendLabel}
                </button>
              )}
            </div>
          </div>

          {effectiveUploaded.url &&
            (() => {
              const isExternalGoogle =
                effectiveUploaded.url.includes("docs.google.com") ||
                effectiveUploaded.url.includes("drive.google.com");
              const formattedName = formatFileNameWithUserAndTimestamp(
                effectiveUploaded.filename || "resume.pdf"
              );
              const shortDisplayUrl = isExternalGoogle
                ? effectiveUploaded.url
                : `${window.location.host}/file/${formattedName}`;
              const downloadUrl = isExternalGoogle
                ? effectiveUploaded.url
                : `/api/resume-download?url=${encodeURIComponent(effectiveUploaded.url)}`;
              return (
                <div
                  className="flex items-center justify-between gap-2 bg-transparent p-3 border backdrop-blur-xl font-mono text-sm"
                  style={{ borderColor: containerBorder, borderRadius: btnRadius }}
                >
                  <div className="flex items-center gap-2 min-w-0 truncate">
                    <Link2 className="w-4 h-4 flex-shrink-0" style={{ color: iconColor }} />
                    <span className="text-white/80 font-sans flex-shrink-0">Ссылка на документ:</span>
                    <a
                      href={downloadUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="underline truncate hover:text-white"
                      style={{ color: boldTextColor }}
                      title={shortDisplayUrl}
                    >
                      {shortDisplayUrl}
                    </a>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const copyUrl = isExternalGoogle
                        ? effectiveUploaded.url!
                        : `${window.location.origin}${downloadUrl}`;
                      navigator.clipboard.writeText(copyUrl);
                      toast.success("Ссылка на резюме скопирована!");
                    }}
                    className="bg-transparent hover:border-[#E7C768] border border-white/25 text-white text-sm px-3 py-1.5 rounded-lg flex items-center gap-1.5 flex-shrink-0 transition cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5" /> Скопировать
                  </button>
                </div>
              );
            })()}
        </div>
      )}

      {/* Модальное окно вставки ссылки из Google Диска в эталонном стиле Liquid Glass ИИ Ассистента */}
      {googleModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-transparent backdrop-blur-md"
          onClick={() => setGoogleModalOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-3xl border border-[#E7C768]/50 bg-transparent backdrop-blur-2xl p-6 space-y-4 shadow-2xl text-white text-left"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-white/15 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl border border-[#E7C768]/50 bg-transparent backdrop-blur-md flex items-center justify-center">
                  <Link2 className="w-5 h-5 text-[#E7C768]" />
                </div>
                <h3 className="text-base font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">
                  Вставка ссылки из Google Диска
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setGoogleModalOpen(false)}
                className="p-1.5 rounded-xl border border-white/20 text-white/80 hover:text-white hover:border-[#E7C768] transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-sm text-white/90 leading-relaxed">
              Поддерживаются ссылки на Google Документы, Google Таблицы, Google Слайды и файлы на Google Диске. Убедитесь, что доступ к документу открыт по ссылке.
            </p>

            <div className="space-y-2">
              <label className="block text-sm font-bold text-white">Ссылка на документ Google</label>
              <input
                type="url"
                value={googleLinkInput}
                onChange={(e) => setGoogleLinkInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleConfirmGoogleLink();
                  }
                }}
                placeholder="https://docs.google.com/document/d/... или https://drive.google.com/file/d/..."
                className="w-full px-4 py-3 rounded-2xl border border-white/25 bg-transparent backdrop-blur-xl text-sm text-white placeholder-white/45 focus:outline-none focus:border-[#E7C768]"
                autoFocus
              />
            </div>

            {/* Автоопределение типа документа и выбор типа для общего файла Google Диска */}
            {detectedLink && (
              <div className="p-3.5 rounded-2xl border border-[#E7C768]/45 bg-transparent backdrop-blur-xl space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="text-white/80">Определённый источник:</span>
                  <span className="font-bold text-[#F4EE8E]">{detectedLink.label}</span>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="text-white/80">Передаваемый тип файла (file_type):</span>
                  <span className="px-2.5 py-0.5 rounded-lg border border-[#E7C768]/50 font-bold text-[#E7C768]">
                    {detectedLink.fileType}
                  </span>
                </div>

                {detectedLink.sourceKind === "gfile" && (
                  <div className="pt-2 border-t border-white/15 space-y-1.5">
                    <label className="block text-sm font-semibold text-white/90">
                      Уточните формат файла на Google Диске:
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                      {DRIVE_FILE_TYPES.map((ft) => (
                        <button
                          key={ft.value}
                          type="button"
                          onClick={() => setDriveFileFormat(ft.value)}
                          className={`px-3 py-2 rounded-xl text-sm font-semibold border transition cursor-pointer ${
                            driveFileFormat === ft.value
                              ? "bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] text-[#17344F] border-[#E7C768] font-bold"
                              : "bg-transparent border-white/25 text-white hover:border-[#E7C768]"
                          }`}
                        >
                          {ft.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setGoogleModalOpen(false)}
                className="px-4 py-2.5 rounded-2xl border border-white/25 bg-transparent text-white text-sm font-bold hover:border-[#E7C768] transition cursor-pointer"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={handleConfirmGoogleLink}
                disabled={!googleLinkInput.trim()}
                className="px-5 py-2.5 rounded-2xl border border-[#E7C768] bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] text-[#17344F] text-sm font-bold flex items-center gap-2 shadow-md hover:brightness-105 transition cursor-pointer disabled:opacity-50"
              >
                <Sparkles className="w-4 h-4" />
                <span>Распознать резюме по ссылке</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ResumeDropzone;
