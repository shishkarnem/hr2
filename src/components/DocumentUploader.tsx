import { useId, useRef, useState } from "react";
import { FileText, Sparkles, RefreshCw, Upload, Link2, Copy, AlertCircle, Check } from "lucide-react";
import { dbClient } from "@/lib/dbClient";
import { useAIWait } from "@/components/AIWaitProvider";
import { useAIReady, waitForAIReady, requestAIRestartOverlay } from "@/lib/aiReady";
import { toast } from "sonner";
import { getUploadService } from "@/services/FileUploadService";
import AudioField from "./AudioField";
import { resolveActiveEmployerId, resolveActiveCandidateId } from "@/lib/actorSession";

type Entity = "company" | "vacancy" | "training" | "interview" | "resume";

const BUCKETS: Record<Entity, string> = {
  company: "company-uploads",
  vacancy: "vacancy-uploads",
  training: "training-uploads",
  interview: "interview-uploads",
  resume: "candidate-resumes",
};

export interface DocumentUploaderProps {
  entity: Entity;
  entityId: string | null | undefined;
  pathPrefix: string;
  rawText: string;
  onRawTextChange: (text: string) => void;
  rawTextLabel?: string;
  maxChars?: number;
  title?: string;
  hint?: string;
  onEnhance?: () => void | Promise<void>;
  enhanceBusy?: boolean;
  canEnhance?: boolean;
  enhanceHint?: string;
  enhanceLabel?: string;
  accept?: string;
  onAudit?: (level: "info" | "success" | "warning", title: string, detail: string) => void;
  disabled?: boolean;
  alwaysShowTextArea?: boolean;
  /** Optional callback to append recognized text instead of replacing */
  onAppendText?: (text: string) => void;
}

const DEFAULT_ACCEPT = ".pdf,.doc,.docx,.txt,.rtf,.odt,.png,.jpg,.jpeg,.webp,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,image/*";

export function DocumentUploader({
  entity,
  entityId,
  pathPrefix,
  rawText,
  onRawTextChange,
  rawTextLabel,
  maxChars = 25000,
  title = "Распознавание материалов из файла",
  hint = "Загрузите файл (PDF, DOCX, TXT, фото/скан). ИИ распознает и структурирует учебный материал.",
  onEnhance,
  enhanceBusy = false,
  canEnhance = true,
  enhanceHint,
  enhanceLabel = "Оформить красиво с помощью ИИ",
  accept = DEFAULT_ACCEPT,
  onAudit,
  disabled = false,
  alwaysShowTextArea = false,
  onAppendText,
}: DocumentUploaderProps) {
  const { run: aiWaitRun } = useAIWait();
  const aiReady = useAIReady();
  const inputId = useId();
  const fileRef = useRef<HTMLInputElement>(null);

  const [uploading, setUploading] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [filePath, setFilePath] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [copiedLink, setCopiedLink] = useState(false);

  const busy = uploading || parsing || disabled;

  async function handleFile(file: File) {
    setUploadError("");
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) {
      const msg = "Размер файла превышает 25 МБ.";
      setUploadError(msg);
      toast.error(msg);
      return;
    }
    setUploading(true);
    onAudit?.("info", "Загрузка файла", `Загружаем «${file.name}»…`);
    try {
      const fileUrl = await getUploadService().uploadFromFile(file);
      setFilePath(fileUrl);
      setFileName(file.name);
      onAudit?.("success", "Файл загружен", `${file.name}`);
      toast.success(`Файл «${file.name}» успешно загружен`);
    } catch (err: any) {
      const msg = err?.message || "Не удалось загрузить файл.";
      setUploadError(msg);
      toast.error(msg);
      onAudit?.("warning", "Ошибка загрузки", msg);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function recognize() {
    if (!filePath) return;
    if (!aiReady) {
      requestAIRestartOverlay();
      toast.message("ИИ готовится к работе, пожалуйста подождите пару секунд…");
      await waitForAIReady();
    }
    setParsing(true);
    onAudit?.("info", "ИИ распознавание", `ИИ считывает «${fileName}»…`);
    try {
      const fullFileUrl = filePath.startsWith("/") ? `${window.location.origin}${filePath}` : filePath;
      const res = await aiWaitRun<any>({
        title: `ИИ распознает файл ${fileName}`,
        task: async (attempt: number) => {
          const usePromax = attempt > 0;
          const effEmpId = resolveActiveEmployerId();
          const effCandId = entity === "resume" ? resolveActiveCandidateId() || undefined : undefined;
          try {
            const apiRes = await fetch("/api/ai-ingest-document", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                entity,
                entity_id: entityId || undefined,
                employer_id: effEmpId,
                employer_public_id: effEmpId,
                candidate_id: effCandId,
                file_url: fullFileUrl,
                filename: fileName,
                max_chars: maxChars,
                use_promax: usePromax,
              }),
            });
            if (apiRes.ok) {
              const data = await apiRes.json();
              return data;
            }
          } catch (e) {
            console.warn("Direct API call failed, falling back to function invoke:", e);
          }

          const { data, error } = await dbClient.functions.invoke("ai-ingest-document", {
            body: {
              entity,
              entity_id: entityId || undefined,
              employer_id: effEmpId,
              employer_public_id: effEmpId,
              candidate_id: effCandId,
              file_url: fullFileUrl,
              filename: fileName,
              max_chars: maxChars,
              use_promax: usePromax,
            },
          });
          if (error) {
            console.error("[DocumentUploader] ai-ingest-document error", { error, entity, entityId });
            throw new Error(error.message);
          }
          return data;
        },
      });

      const text = String(res?.text || "").slice(0, maxChars);
      if (text) {
        // Only insert into "Распознанный текст материала" field; do not auto-append to article constructor
        onRawTextChange(text);
        onAudit?.("success", "Материал распознан", `Распознано ${text.length} символов`);
        toast.success("Документ успешно распознан!");
      } else {
        onAudit?.("warning", "Пустой ответ", "ИИ не смог извлечь текст из документа.");
        toast.error("Не удалось извлечь текст из документа.");
      }
    } catch (err: any) {
      const msg = err?.message || "Ошибка при распознавании файла.";
      toast.error(msg);
      onAudit?.("warning", "Ошибка распознавания", msg);
    } finally {
      setParsing(false);
    }
  }

  return (
    <div className="rounded-2xl md:rounded-3xl p-4 md:p-5 space-y-4 border border-white/20 bg-transparent backdrop-blur-xl shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm md:text-base font-bold flex items-center gap-2 bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">
          <FileText className="w-5 h-5 text-[#E7C768]" /> {title}
        </span>
      </div>
      {hint && (
        <p className="text-sm text-slate-200 leading-relaxed">
          {hint}
        </p>
      )}

      {/* Dropzone */}
      <div
        onClick={() => !busy && fileRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (busy) return;
          const f = e.dataTransfer.files?.[0];
          if (f) void handleFile(f);
        }}
        className={`cursor-pointer border-2 border-dashed border-[#E7C768]/40 hover:border-[#E7C768] bg-transparent hover:bg-white/5 rounded-2xl p-5 text-center space-y-2 transition-all ${
          busy ? "animate-pulse opacity-80" : ""
        }`}
      >
        <input
          id={inputId}
          ref={fileRef}
          type="file"
          accept={accept}
          className="hidden"
          onClick={(e) => {
            (e.currentTarget as HTMLInputElement).value = "";
            setFilePath(null);
            setFileName("");
            setUploadError("");
          }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
          }}
        />
        <div className="text-sm font-semibold text-white flex items-center justify-center gap-2 flex-wrap">
          {uploading ? (
            <span className="text-[#E7C768] flex items-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin text-[#E7C768]" />
              Загрузка «{fileName || "файла"}» в облако…
            </span>
          ) : parsing ? (
            <span className="text-[#E7C768] flex items-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin text-[#E7C768]" />
              ИИ распознает структуру и текст материала…
            </span>
          ) : filePath ? (
            <span className="text-[#E7C768] flex items-center gap-2">
              <FileText className="w-4 h-4 text-[#E7C768]" /> Файл загружен: {fileName}
            </span>
          ) : (
            <span className="flex items-center gap-2 text-slate-100">
              <Upload className="w-5 h-5 text-[#E7C768]" />
              Нажмите или перетащите файл для распознавания
            </span>
          )}
        </div>
        <span className="text-sm text-slate-300 block">
          Форматы: PDF, Word (DOC/DOCX), TXT, изображения и сканы (до 25 МБ)
        </span>
        {uploadError && (
          <div className="text-sm text-white bg-transparent border border-white/20 rounded-xl p-2 mt-1">
            {uploadError}
          </div>
        )}
      </div>

      {/* Recognition trigger & file link */}
      {filePath && !parsing && !uploading && (
        <div className="space-y-3 pt-1">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-sm bg-transparent backdrop-blur-md p-3 rounded-2xl border border-white/20">
            <div className="flex items-center gap-2 min-w-0 text-[#E7C768] text-sm truncate w-full sm:w-auto">
              <Link2 className="w-4 h-4 shrink-0 text-[#E7C768]" />
              <span className="text-slate-300 font-sans shrink-0">Файл:</span>
              <a
                href={filePath}
                target="_blank"
                rel="noreferrer"
                className="underline truncate text-[#E7C768] hover:text-white"
                title={filePath}
              >
                {fileName || "Документ"}
              </a>
            </div>
            <button
              type="button"
              onClick={() => {
                const copyUrl = filePath.startsWith("/") ? `${window.location.origin}${filePath}` : filePath;
                navigator.clipboard.writeText(copyUrl);
                setCopiedLink(true);
                setTimeout(() => setCopiedLink(false), 2000);
                toast.success("Ссылка на файл скопирована");
              }}
              className="bg-transparent hover:bg-white/10 text-white text-sm px-3 py-1.5 rounded-xl border border-white/20 flex items-center gap-1.5 shrink-0 transition cursor-pointer"
            >
              {copiedLink ? <Check className="w-4 h-4 text-[#E7C768]" /> : <Copy className="w-4 h-4 text-[#E7C768]" />}
              {copiedLink ? "Скопировано" : "Скопировать ссылку"}
            </button>
          </div>

          <div className="flex justify-center pt-1">
            <button
              type="button"
              onClick={recognize}
              disabled={!aiReady}
              title={aiReady ? undefined : "ИИ готовится, кнопка станет активной через пару секунд"}
              className="px-6 py-3 text-sm flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] text-[#17344F] font-bold shadow-xl hover:brightness-105 active:scale-95 transition disabled:opacity-50 cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-[#17344F]" />
              {aiReady ? "Распознать документ через ИИ" : "ИИ готовится…"}
            </button>
          </div>
        </div>
      )}

      {/* Editable raw text area */}
      {(alwaysShowTextArea || rawText || parsing) && (
        <div className="space-y-2 pt-1">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">
              {rawTextLabel || `Распознанный текст материала (редактируется)`}
            </span>
            <span className="text-sm text-slate-300 font-mono">
              {rawText.length} / {maxChars}
            </span>
          </div>
          <textarea
            value={rawText}
            onChange={(e) => onRawTextChange(e.target.value.slice(0, maxChars))}
            placeholder="Здесь отобразится распознанный текст документа. Вы можете дополнить или отредактировать его..."
            className="w-full bg-transparent backdrop-blur-xl text-sm p-4 rounded-2xl border border-white/20 text-white placeholder:text-slate-400 focus:outline-none focus:border-[#E7C768] min-h-[160px] leading-relaxed"
            maxLength={maxChars}
          />
        </div>
      )}

      {/* Optional AI Enhance button */}
      {onEnhance && (
        <div className="flex justify-center pt-2">
          <button
            type="button"
            onClick={() => void onEnhance()}
            disabled={!canEnhance || enhanceBusy || busy}
            title={
              enhanceHint ||
              (canEnhance
                ? "Оформить материал красиво через ИИ"
                : "Введите или распознайте текст материала для обработки")
            }
            className="px-6 py-3 text-sm flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] text-[#17344F] font-bold shadow-xl hover:brightness-105 active:scale-95 transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            <Sparkles className={`w-4 h-4 ${enhanceBusy ? "animate-spin" : ""}`} />
            {enhanceBusy ? "Обработка материала ИИ..." : enhanceLabel}
          </button>
        </div>
      )}
    </div>
  );
}

export default DocumentUploader;
