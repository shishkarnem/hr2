import { useState, useRef, useEffect, DragEvent } from "react";
import { Upload, Link2, FileText, CheckCircle, Loader2, Sparkles, AlertCircle, RefreshCw, X, ArrowDownToLine } from "lucide-react";
import { toast } from "sonner";
import { getUploadService } from "@/services/FileUploadService";
import { formatFileNameWithUserAndTimestamp, toAbsoluteUrl } from "@/lib/fileNaming";
import { useAIWait } from "@/components/AIWaitProvider";
import { resolveActiveEmployerId, resolveActiveCandidateId } from "@/lib/actorSession";

export interface GetDocProps {
  entity: "company" | "vacancy" | "training" | "interview" | "resume";
  entityId?: string;
  employerId?: string;
  demoUserId?: string;
  pathPrefix?: string;
  rawText?: string;
  onRawTextChange?: (text: string) => void;
  onAppendText?: (text: string) => void;
  onFileUploaded?: (fileInfo: { url: string; filename: string; fileType?: string }) => void;
  onRecognitionComplete?: (text: string, fileInfo?: { url: string; filename: string }) => void;
  title?: string;
  hint?: string;
  maxChars?: number;
  onAudit?: (level: "success" | "warning" | "info", title: string, msg: string) => void;
  alwaysShowTextArea?: boolean;
  showTextArea?: boolean;
  enhanceLabel?: string;
  onEnhance?: () => void;
  compact?: boolean;
  accept?: string;
}

export interface ParsedDocLink {
  type: "gdoc" | "gsheet" | "gslide" | "gfile" | "direct";
  fileType: string;
  directUrl: string;
  label: string;
  iconName: string;
}

export function parseGoogleDriveUrl(url: string): ParsedDocLink {
  const cleanUrl = (url || "").trim();

  // Google Docs
  const docMatch = cleanUrl.match(/\/document\/d\/([a-zA-Z0-9_-]+)/);
  if (docMatch) {
    const id = docMatch[1];
    return {
      type: "gdoc",
      fileType: "docx",
      directUrl: `https://docs.google.com/document/d/${id}/edit`,
      label: "Google Документ (Docs)",
      iconName: "FileText"
    };
  }

  // Google Sheets
  const sheetMatch = cleanUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (sheetMatch) {
    const id = sheetMatch[1];
    return {
      type: "gsheet",
      fileType: "xlsx",
      directUrl: `https://docs.google.com/spreadsheets/d/${id}/edit`,
      label: "Google Таблица (Sheets)",
      iconName: "FileText"
    };
  }

  // Google Slides
  const slideMatch = cleanUrl.match(/\/presentation\/d\/([a-zA-Z0-9_-]+)/);
  if (slideMatch) {
    const id = slideMatch[1];
    return {
      type: "gslide",
      fileType: "pptx",
      directUrl: `https://docs.google.com/presentation/d/${id}/edit`,
      label: "Google Презентация (Slides)",
      iconName: "FileText"
    };
  }

  // Google Drive File
  const fileMatch = cleanUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || cleanUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (fileMatch && (cleanUrl.includes("drive.google.com") || cleanUrl.includes("docs.google.com"))) {
    const id = fileMatch[1];
    return {
      type: "gfile",
      fileType: "pdf",
      directUrl: `https://drive.google.com/uc?export=download&id=${id}`,
      label: "Файл Google Диска",
      iconName: "FileText"
    };
  }

  // Direct file URL
  const cleanPath = cleanUrl.split("?")[0].split("#")[0];
  const ext = (cleanPath.split(".").pop() || "pdf").toLowerCase();
  let label = "Прямая ссылка на файл";
  if (["pdf"].includes(ext)) label = "Документ PDF";
  else if (["doc", "docx"].includes(ext)) label = "Документ Word";
  else if (["xls", "xlsx"].includes(ext)) label = "Таблица Excel";
  else if (["ppt", "pptx"].includes(ext)) label = "Презентация PowerPoint";
  else if (["txt", "md", "csv"].includes(ext)) label = "Текстовый документ";

  return {
    type: "direct",
    fileType: ext,
    directUrl: cleanUrl,
    label,
    iconName: "Link2"
  };
}

export function GetDoc({
  entity,
  entityId,
  employerId,
  demoUserId,
  rawText = "",
  onRawTextChange,
  onAppendText,
  onFileUploaded,
  onRecognitionComplete,
  title,
  hint,
  maxChars = 25000,
  onAudit,
  alwaysShowTextArea = false,
  showTextArea = false,
  enhanceLabel,
  onEnhance,
  compact = false,
  accept = ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.rtf,.odt,.png,.jpg,.jpeg,.webp",
}: GetDocProps) {
  const [activeTab, setActiveTab] = useState<"file" | "url">("file");
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [status, setStatus] = useState<"idle" | "uploading" | "recognizing" | "success" | "error">("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const [currentFile, setCurrentFile] = useState<{ url: string; filename: string; fileType?: string } | null>(null);
  const [inputUrl, setInputUrl] = useState("");
  const [parsedLink, setParsedLink] = useState<ParsedDocLink | null>(null);
  const [recognizedText, setRecognizedText] = useState(rawText);
  const [isEditingText, setIsEditingText] = useState(alwaysShowTextArea || showTextArea);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const aiWait = useAIWait();

  useEffect(() => {
    if (rawText !== recognizedText && rawText) {
      setRecognizedText(rawText);
    }
  }, [rawText]);

  useEffect(() => {
    if (inputUrl.trim().length > 8 && /^https?:\/\//i.test(inputUrl.trim())) {
      setParsedLink(parseGoogleDriveUrl(inputUrl.trim()));
    } else {
      setParsedLink(null);
    }
  }, [inputUrl]);

  // Resolve reliable numeric employer ID (4-15 digits, e.g. 10075510586)
  const effectiveEmployerId = resolveActiveEmployerId({ employer_id: employerId });

  // Direct recognition via ProTalk Function 369 with Mascot Wait Overlay
  const triggerRecognition = async (fileUrl: string, fileName: string, detectedType?: string) => {
    setStatus("recognizing");
    setStatusMessage("Распознавание текста через API функцию 369...");
    const absoluteUrl = toAbsoluteUrl(fileUrl);
    try {
      const cleanText = await aiWait.run({
        title: `Распознавание документа: ${fileName}`,
        task: async () => {
          const response = await fetch("/api/ai-ingest-document", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              entity,
              entity_id: entityId,
              employer_id: effectiveEmployerId,
              employer_public_id: effectiveEmployerId,
              candidate_id: entity === "resume" ? resolveActiveCandidateId() || undefined : undefined,
              demo_user_id: demoUserId,
              file_url: absoluteUrl,
              filename: fileName,
              file_type: detectedType,
              max_chars: maxChars,
            }),
          });

          if (!response.ok) {
            throw new Error(`Ошибка сервера: ${response.status}`);
          }

          const data = await response.json();
          const extracted = data.text || data.result || data.reply || "";

          if (!extracted || extracted.trim().length === 0) {
            throw new Error("Текст не найден или пустой ответ");
          }

          return extracted.trim();
        },
      });

      setRecognizedText(cleanText);
      setIsEditingText(true);
      setStatus("success");
      setStatusMessage(`Текст успешно распознан (${cleanText.length} символов)`);
      toast.success("Документ успешно распознан!");

      if (onRawTextChange) onRawTextChange(cleanText);
      // Note: do not auto-append to subpage / article here.
      // User uses "Вставить текст в подстраницу" button explicitly.
      if (onRecognitionComplete) onRecognitionComplete(cleanText, { url: absoluteUrl, filename: fileName });
      if (onAudit) onAudit("success", "Распознавание документа", `Извлечено ${cleanText.length} символов из ${fileName}`);
    } catch (err: any) {
      console.error("[GetDoc] recognition error:", err);
      setStatus("error");
      setStatusMessage(err.message || "Ошибка распознавания документа");
      toast.error(err.message || "Не удалось распознать документ");
      if (onAudit) onAudit("warning", "Ошибка распознавания", err.message || "Не удалось извлечь текст");
    }
  };

  // AI Enhancement handler with Mascot Wait Overlay
  const handleImproveText = async () => {
    if (!recognizedText.trim()) {
      toast.error("Сначала распознайте текст из документа");
      return;
    }
    try {
      const enhanced = await aiWait.run({
        title: "Улучшение и форматирование учебного материала в Markdown",
        task: async () => {
          const res = await fetch("/api/ai-enhance", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              field: "training_material",
              mode: "training_material",
              value: recognizedText,
              employer_id: effectiveEmployerId,
              employer_public_id: effectiveEmployerId,
            }),
          });
          if (!res.ok) throw new Error(`Ошибка сервера: ${res.status}`);
          const data = await res.json();
          return data.value || data.text || recognizedText;
        },
      });

      if (enhanced && enhanced.trim()) {
        const clean = enhanced.trim();
        setRecognizedText(clean);
        if (onRawTextChange) onRawTextChange(clean);
        toast.success("Текст улучшен и оформлен в Markdown!");
      }
    } catch (err: any) {
      console.error("[GetDoc] improve text error:", err);
      toast.error(err.message || "Ошибка при улучшении текста");
    }
  };

  // Insert recognized / improved text into active subpage at the end
  const handleInsertIntoSubpage = () => {
    if (!recognizedText.trim()) {
      toast.error("Нет текста для добавления");
      return;
    }
    if (onAppendText) {
      onAppendText(recognizedText);
    } else if (onEnhance) {
      onEnhance();
    } else if (onRawTextChange) {
      onRawTextChange(recognizedText);
    }
    toast.success("Текст добавлен в конец подстраницы!");
  };

  // Immediate upload and recognition handler
  const handleUploadAndRecognize = async (file: File) => {
    if (!file) return;
    setStatus("uploading");
    setStatusMessage("Загрузка файла на сервер...");
    setUploadProgress(15);

    try {
      const uploadService = getUploadService();
      const ownerId = effectiveEmployerId || demoUserId || "100007";
      const customName = formatFileNameWithUserAndTimestamp(file.name, ownerId);

      const rawUploadedUrl = await uploadService.uploadFromFile(file, {
        owner_id: ownerId,
        custom_name: customName,
        onProgress: (percent) => setUploadProgress(Math.min(95, Math.max(15, percent))),
      });

      const absoluteUploadedUrl = toAbsoluteUrl(rawUploadedUrl);

      const fileInfo = {
        url: absoluteUploadedUrl,
        filename: file.name,
        fileType: file.name.split(".").pop()?.toLowerCase() || "pdf",
      };

      setCurrentFile(fileInfo);
      if (onFileUploaded) onFileUploaded(fileInfo);

      // Auto-trigger recognition immediately with absolute URL!
      await triggerRecognition(absoluteUploadedUrl, file.name, fileInfo.fileType);
    } catch (err: any) {
      console.error("[GetDoc] Upload error:", err);
      setStatus("error");
      setStatusMessage(err.message || "Ошибка при загрузке файла");
      toast.error(err.message || "Не удалось загрузить файл");
    } finally {
      setUploadProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleUrlRecognize = async () => {
    if (!inputUrl.trim()) {
      toast.error("Вставьте ссылку на файл или документ");
      return;
    }

    const parsed = parseGoogleDriveUrl(inputUrl.trim());
    const syntheticName = `link_${parsed.fileType || "doc"}.${parsed.fileType || "pdf"}`;
    const fileInfo = {
      url: parsed.directUrl,
      filename: syntheticName,
      fileType: parsed.fileType,
    };
    setCurrentFile(fileInfo);
    if (onFileUploaded) onFileUploaded(fileInfo);

    await triggerRecognition(parsed.directUrl, syntheticName, parsed.fileType);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleUploadAndRecognize(e.dataTransfer.files[0]);
    }
  };

  return (
    <div className="w-full rounded-2xl border border-white/20 bg-transparent backdrop-blur-xl p-4 sm:p-5 transition-all">
      {/* Title & Hint */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
        <div>
          <h4 className="text-base font-medium bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">
            {title || "Загрузка и распознавание материалов"}
          </h4>
          <p className="text-xs text-white/70 mt-0.5">
            {hint || "Загрузите файл или укажите ссылку на Google Диск / Документ — распознавание начнется сразу"}
          </p>
        </div>

        {/* Tab switchers in Liquid Glass Apple style */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl border border-white/15 bg-white/5 backdrop-blur-md self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setActiveTab("file")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeTab === "file"
                ? "bg-gradient-to-r from-[#E7C768]/30 to-[#D99E41]/20 border border-[#E7C768]/60 text-white shadow-sm"
                : "text-white/70 hover:text-white hover:bg-white/5"
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Загрузить файл</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("url")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeTab === "url"
                ? "bg-gradient-to-r from-[#E7C768]/30 to-[#D99E41]/20 border border-[#E7C768]/60 text-white shadow-sm"
                : "text-white/70 hover:text-white hover:bg-white/5"
            }`}
          >
            <Link2 className="w-3.5 h-3.5" />
            <span>Вставить ссылку</span>
          </button>
        </div>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files[0]) {
            handleUploadAndRecognize(e.target.files[0]);
          }
        }}
      />

      {/* Mode 1: File Drag & Drop */}
      {activeTab === "file" && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => status !== "uploading" && status !== "recognizing" && fileInputRef.current?.click()}
          className={`relative border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all ${
            isDragging
              ? "border-[#E7C768] bg-[#E7C768]/10"
              : "border-white/20 hover:border-[#E7C768]/50 bg-white/5 hover:bg-white/10"
          }`}
        >
          {status === "uploading" || status === "recognizing" ? (
            <div className="flex flex-col items-center justify-center py-4">
              <Loader2 className="w-7 h-7 text-[#E7C768] animate-spin mb-2" />
              <p className="text-sm text-white font-medium">{statusMessage}</p>
              {status === "uploading" && uploadProgress > 0 && (
                <div className="w-48 h-1.5 bg-white/10 rounded-full mt-3 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-[#F4EE8E] to-[#E7C768] transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-2">
              <div className="w-11 h-11 rounded-full border border-white/20 bg-white/5 flex items-center justify-center mb-2.5 shadow-sm">
                <Upload className="w-5 h-5 text-[#E7C768]" />
              </div>
              <p className="text-sm text-white font-medium">
                Нажмите для выбора файла или перетащите сюда
              </p>
              <p className="text-xs text-white/60 mt-1">
                Поддерживаются PDF, DOCX, XLSX, PPTX, TXT, CSV, RTF, изображения (до 50 МБ)
              </p>
            </div>
          )}
        </div>
      )}

      {/* Mode 2: URL Input (Google Drive, Docs, Sheets, Slides, Direct link) */}
      {activeTab === "url" && (
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <div className="relative flex-1">
              <input
                type="url"
                value={inputUrl}
                onChange={(e) => setInputUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleUrlRecognize();
                  }
                }}
                placeholder="Вставьте ссылку на Google Docs, Sheets, Slides или файл..."
                className="w-full px-3.5 py-2.5 rounded-xl border border-white/20 bg-white/5 backdrop-blur-md text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-[#E7C768]/70 transition-all"
              />
              {inputUrl && (
                <button
                  type="button"
                  onClick={() => setInputUrl("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/50 hover:text-white p-1"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <button
              type="button"
              disabled={!inputUrl.trim() || status === "recognizing"}
              onClick={handleUrlRecognize}
              className="px-4 py-2.5 rounded-xl text-sm font-medium border border-[#E7C768]/60 bg-gradient-to-r from-[#E7C768]/30 via-[#D99E41]/25 to-[#E7C768]/20 hover:from-[#E7C768]/40 hover:to-[#D99E41]/35 text-white transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-sm whitespace-nowrap"
            >
              {status === "recognizing" ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-[#E7C768]" />
                  <span>Распознаем...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-[#F4EE8E]" />
                  <span>Распознать ссылку</span>
                </>
              )}
            </button>
          </div>

          {/* Google Link Auto-Detection Badge */}
          {parsedLink && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-white/15 bg-white/5 backdrop-blur-md text-xs text-white">
              <span className="w-2 h-2 rounded-full bg-[#E7C768] animate-pulse" />
              <span className="text-white/60">Определен тип:</span>
              <span className="font-medium text-[#F4EE8E]">{parsedLink.label}</span>
              <span className="text-white/40 text-[11px] ml-auto truncate max-w-[200px]">
                формат: {parsedLink.fileType}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Recognition Status / Indicator */}
      {status === "success" && (
        <div className="mt-3 flex items-center justify-between px-3.5 py-2 rounded-xl border border-[#E7C768]/30 bg-white/5 backdrop-blur-md text-xs text-white">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-[#E7C768]" />
            <span>{statusMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setIsEditingText(!isEditingText)}
            className="text-xs text-[#F4EE8E] hover:underline ml-2 whitespace-nowrap"
          >
            {isEditingText ? "Скрыть текст" : "Показать распознанный текст"}
          </button>
        </div>
      )}

      {status === "error" && (
        <div className="mt-3 flex items-center justify-between px-3.5 py-2 rounded-xl border border-white/20 bg-white/5 backdrop-blur-md text-xs text-white">
          <div className="flex items-center gap-2 text-white/90">
            <AlertCircle className="w-4 h-4 text-[#E7C768]" />
            <span>{statusMessage}</span>
          </div>
          {currentFile && (
            <button
              type="button"
              onClick={() => triggerRecognition(currentFile.url, currentFile.filename, currentFile.fileType)}
              className="flex items-center gap-1 text-xs text-[#F4EE8E] hover:underline ml-2"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Повторить</span>
            </button>
          )}
        </div>
      )}

      {/* Editable Text Area if expanded or always shown */}
      {isEditingText && (
        <div className="mt-4 space-y-3 pt-3 border-t border-white/10">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <label className="text-sm font-medium text-white/90">
              Распознанный текст материала ({recognizedText.length} симв.):
            </label>

            {/* Two Action Buttons: Improve Text & Insert Text into Subpage */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleImproveText}
                disabled={!recognizedText.trim()}
                className="px-3.5 py-2 rounded-xl text-sm font-medium border border-[#E7C768]/60 bg-transparent hover:bg-white/5 text-white flex items-center gap-2 transition-all shadow-sm disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                <Sparkles className="w-4 h-4 text-[#F4EE8E]" />
                <span className="bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent font-semibold">
                  Улучшить текст
                </span>
              </button>

              <button
                type="button"
                onClick={handleInsertIntoSubpage}
                disabled={!recognizedText.trim()}
                className="px-4 py-2 rounded-xl text-sm font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] hover:brightness-105 text-[#17344F] flex items-center gap-2 transition-all shadow-lg disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                <ArrowDownToLine className="w-4 h-4 text-[#17344F]" />
                <span>Вставить текст в подстраницу</span>
              </button>
            </div>
          </div>

          <textarea
            rows={compact ? 4 : 8}
            value={recognizedText}
            onChange={(e) => {
              setRecognizedText(e.target.value);
              if (onRawTextChange) onRawTextChange(e.target.value);
            }}
            placeholder="Здесь появится распознанный текст документа..."
            className="w-full p-3.5 rounded-2xl border border-white/20 bg-transparent backdrop-blur-md text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-[#E7C768]/70 leading-relaxed font-sans"
          />
        </div>
      )}
    </div>
  );
}

export default GetDoc;
