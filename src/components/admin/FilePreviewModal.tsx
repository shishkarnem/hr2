import React, { useState, useRef, useEffect } from "react";
import { X, Copy, Check, ExternalLink, Trash2, FileText, Image as ImageIcon, Video, Music, Info, Calendar, HardDrive, Hash, MoveRight, RefreshCw, Loader2, AlertTriangle } from "lucide-react";
import { getFormattedFileUrl, FileUploadService } from "../../services/FileUploadService";

export interface FileStorageItem {
  id: number;
  file_key: string;
  name: string;
  original_url: string;
  mime_type: string;
  file_size: number;
  folder_id: number | null;
  owner_id?: string;
  description?: string;
  created_at: string;
}

interface FilePreviewModalProps {
  file: FileStorageItem | null;
  onClose: () => void;
  onDelete?: (file: FileStorageItem) => void;
  onFileUpdated?: (updatedFile: FileStorageItem) => void;
  folders?: { id: number; name: string; color: string }[];
  onMoveToFolder?: (fileId: number, folderId: number | null) => void;
}

export const FilePreviewModal: React.FC<FilePreviewModalProps> = ({
  file: initialFile,
  onClose,
  onDelete,
  onFileUpdated,
  folders = [],
  onMoveToFolder,
}) => {
  const [file, setFile] = useState<FileStorageItem | null>(initialFile);
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedProxy, setCopiedProxy] = useState(false);
  const [copiedOriginal, setCopiedOriginal] = useState(false);
  const [checkTransparency, setCheckTransparency] = useState(true);

  // File replacement states
  const [replacing, setReplacing] = useState(false);
  const [replaceError, setReplaceError] = useState<string | null>(null);
  const [replaceSuccess, setReplaceSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setFile(initialFile);
    setReplaceError(null);
    setReplaceSuccess(null);
  }, [initialFile]);

  if (!file) return null;

  const handleFilePicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected || !file) return;

    setReplaceError(null);
    setReplaceSuccess(null);

    // Rule: New file must have the same name as the existing file
    if (selected.name.trim().toLowerCase() !== file.name.trim().toLowerCase()) {
      setReplaceError(`Имя нового файла («${selected.name}») должно в точности совпадать с текущим («${file.name}»).`);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setReplacing(true);
    try {
      const uploadResult = await FileUploadService.uploadFileResult(selected, {
        custom_name: file.name,
        folder_id: file.folder_id ?? undefined,
      });

      const newUrl = uploadResult.original_url || uploadResult.url;
      const pwd = sessionStorage.getItem("sysadmin_password") || "";

      const res = await fetch(`/api/admin/files/${file.id}/replace`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-password": pwd,
        },
        body: JSON.stringify({
          original_url: newUrl,
          file_size: selected.size,
          mime_type: selected.type || file.mime_type,
          name: file.name,
        }),
      });

      if (!res.ok) {
        const errObj = await res.json().catch(() => null);
        throw new Error(errObj?.error || `Ошибка сервера: HTTP ${res.status}`);
      }

      const updatedRecord: FileStorageItem = await res.json();
      setFile(updatedRecord);
      setReplaceSuccess(`Файл «${file.name}» успешно обновлен на новую версию!`);
      onFileUpdated?.(updatedRecord);
    } catch (err: any) {
      console.error("[FilePreviewModal] Replace error:", err);
      setReplaceError(err.message || "Не удалось заменить файл.");
    } finally {
      setReplacing(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const isImage = file.mime_type?.startsWith("image/") || /\.(png|jpe?g|gif|webp|svg)$/i.test(file.name);
  const isVideo = file.mime_type?.startsWith("video/") || /\.(mp4|webm|ogg)$/i.test(file.name);
  const isAudio = file.mime_type?.startsWith("audio/") || /\.(mp3|wav|ogg)$/i.test(file.name);

  const formattedPath = getFormattedFileUrl(file.id, file.name);
  const proxyUrl = `${window.location.origin}${formattedPath}`;

  const formatSize = (bytes: number) => {
    if (!bytes) return "0 Б";
    const k = 1024;
    const sizes = ["Б", "КБ", "МБ", "ГБ"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const copyToClipboard = (text: string, type: "key" | "proxy" | "original") => {
    navigator.clipboard.writeText(text);
    if (type === "key") {
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    } else if (type === "proxy") {
      setCopiedProxy(true);
      setTimeout(() => setCopiedProxy(false), 2000);
    } else {
      setCopiedOriginal(true);
      setTimeout(() => setCopiedOriginal(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-fadeIn">
      <div
        className="relative w-full max-w-3xl rounded-2xl bg-[#132A40]/80 border border-white/15 p-6 shadow-2xl backdrop-blur-xl text-slate-100 flex flex-col max-h-[90vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="w-10 h-10 rounded-xl bg-white/10 border border-white/15 flex items-center justify-center shrink-0 text-[#E7C768]">
              {isImage ? (
                <ImageIcon className="w-5 h-5" />
              ) : isVideo ? (
                <Video className="w-5 h-5" />
              ) : isAudio ? (
                <Music className="w-5 h-5" />
              ) : (
                <FileText className="w-5 h-5" />
              )}
            </div>
            <div className="truncate">
              <h3 className="font-bold text-base text-white truncate">{file.name}</h3>
              <p className="text-xs text-slate-300 font-mono">ID: {file.id} • Key: {file.file_key}</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/15 text-slate-300 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content / Preview Container */}
        <div className="flex-1 overflow-y-auto py-4 space-y-5 custom-scrollbar">
          {/* Main Media Visualizer */}
          <div className="relative rounded-xl border border-white/10 overflow-hidden flex items-center justify-center min-h-[220px] max-h-[420px] bg-black/40">
            {isImage ? (
              <div
                className={`w-full h-full p-4 flex items-center justify-center ${
                  checkTransparency
                    ? "bg-[linear-gradient(45deg,#1e293b_25%,transparent_25%),linear-gradient(-45deg,#1e293b_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#1e293b_75%),linear-gradient(-45deg,transparent_75%,#1e293b_75%)] [background-size:20px_20px] [background-position:0_0,0_10px,10px_-10px,-10px_0px]"
                    : "bg-slate-900/60"
                }`}
              >
                <img
                  src={file.original_url}
                  alt={file.name}
                  className="max-h-[360px] w-auto max-w-full object-contain rounded-lg shadow-lg"
                />
              </div>
            ) : isVideo ? (
              <video src={file.original_url} controls className="max-h-[360px] w-full rounded-lg" />
            ) : isAudio ? (
              <div className="p-8 w-full flex flex-col items-center gap-4">
                <Music className="w-16 h-16 text-[#E7C768] animate-pulse" />
                <audio src={file.original_url} controls className="w-full max-w-md" />
              </div>
            ) : (
              <div className="p-8 text-center text-slate-400 flex flex-col items-center gap-2">
                <FileText className="w-16 h-16 text-slate-500" />
                <p className="text-sm">Предпросмотр недоступен для данного формата файлов</p>
              </div>
            )}

            {/* Toggle Checkerboard for images */}
            {isImage && (
              <button
                onClick={() => setCheckTransparency(!checkTransparency)}
                className="absolute bottom-3 right-3 px-3 py-1.5 rounded-lg bg-black/70 hover:bg-black/90 border border-white/20 text-xs font-semibold text-white shadow-lg backdrop-blur-md transition"
              >
                {checkTransparency ? "Скрыть сетку прозрачности" : "Показать сетку прозрачности PNG"}
              </button>
            )}
          </div>

          {/* Links and Actions */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Short Proxy Link */}
            <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 space-y-1.5">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
                <span className="flex items-center gap-1 text-[#E7C768]">
                  <Hash className="w-3.5 h-3.5" /> Ссылка файла (/files/:id/...)
                </span>
                <span className="text-[10px] text-slate-400">Прокси с кешем</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={proxyUrl}
                  className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-xs font-mono text-white truncate focus:outline-none"
                />
                <button
                  onClick={() => copyToClipboard(proxyUrl, "proxy")}
                  className="px-3 py-1.5 rounded-lg bg-[#E7C768] hover:bg-[#d4b455] text-[#17344F] text-xs font-bold transition shrink-0 flex items-center gap-1"
                >
                  {copiedProxy ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedProxy ? "Скопировано!" : "Копировать"}</span>
                </button>
              </div>
            </div>

            {/* Original URL */}
            <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 space-y-1.5">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
                <span className="flex items-center gap-1 text-slate-300">
                  <ExternalLink className="w-3.5 h-3.5 text-[#E7C768]" /> Прямая ссылка на файл
                </span>
                <a
                  href={file.original_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[10px] text-[#E7C768] hover:underline flex items-center gap-0.5"
                >
                  Открыть <ExternalLink className="w-2.5 h-2.5" />
                </a>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={file.original_url}
                  className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-300 truncate focus:outline-none"
                />
                <button
                  onClick={() => copyToClipboard(file.original_url, "original")}
                  className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-medium transition shrink-0 flex items-center gap-1"
                >
                  {copiedOriginal ? <Check className="w-3.5 h-3.5 text-[#E7C768]" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedOriginal ? "Скопировано!" : "Копировать"}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Description Section */}
          {file.description && (
            <div className="p-3.5 rounded-xl bg-[#0F2338]/80 border border-[#E7C768]/30 space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#E7C768] block">
                Описание и область применения:
              </span>
              <p className="text-xs text-slate-200 leading-relaxed whitespace-pre-wrap">
                {file.description}
              </p>
            </div>
          )}

          {/* Details & Metadata Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 rounded-xl bg-white/5 border border-white/10 text-xs">
            <div>
              <span className="text-slate-400 block text-[10px] uppercase tracking-wider font-semibold">Размер</span>
              <span className="font-semibold text-white flex items-center gap-1 mt-0.5">
                <HardDrive className="w-3.5 h-3.5 text-[#E7C768]" /> {formatSize(file.file_size)}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px] uppercase tracking-wider font-semibold">MIME Формат</span>
              <span className="font-semibold text-white flex items-center gap-1 mt-0.5 truncate">
                <Info className="w-3.5 h-3.5 text-sky-400" /> {file.mime_type || "PNG"}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px] uppercase tracking-wider font-semibold">Дата создания</span>
              <span className="font-semibold text-white flex items-center gap-1 mt-0.5">
                <Calendar className="w-3.5 h-3.5 text-purple-400" />{" "}
                {file.created_at ? new Date(file.created_at).toLocaleDateString("ru-RU") : "—"}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px] uppercase tracking-wider font-semibold">Загрузил</span>
              <span className="font-semibold text-white flex items-center gap-1 mt-0.5 truncate" title={file.owner_id || "Система"}>
                <span className="text-[#E7C768]">👤</span> {file.owner_id || "Система"}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px] uppercase tracking-wider font-semibold">Ключ доступа</span>
              <span
                onClick={() => copyToClipboard(file.file_key, "key")}
                className="font-mono text-white flex items-center gap-1 mt-0.5 cursor-pointer hover:text-[#E7C768] transition"
                title="Нажмите чтобы скопировать ключ"
              >
                <Hash className="w-3.5 h-3.5 text-[#E7C768]" /> {file.file_key || "—"}
                {copiedKey && <Check className="w-3 h-3 text-emerald-400" />}
              </span>
            </div>
          </div>

          {/* Move to folder option */}
          {folders.length > 0 && onMoveToFolder && (
            <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between gap-3 text-xs">
              <span className="text-slate-300 font-medium flex items-center gap-1.5">
                <MoveRight className="w-4 h-4 text-[#E7C768]" /> Папка назначения:
              </span>
              <select
                value={file.folder_id ?? ""}
                onChange={(e) => {
                  const val = e.target.value;
                  onMoveToFolder(file.id, val ? Number(val) : null);
                }}
                className="bg-black/40 border border-white/20 text-white rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-[#E7C768]"
              >
                <option value="" className="bg-[#132A40] text-white">Без папки (Корень)</option>
                {folders.map((f) => (
                  <option key={f.id} value={f.id} className="bg-[#132A40] text-white">
                    📁 {f.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Replacement feedback banners */}
          {replaceError && (
            <div className="p-3.5 rounded-xl bg-transparent border border-white/20 backdrop-blur-md text-white text-sm flex items-center gap-2 shadow-lg">
              <AlertTriangle className="w-4 h-4 shrink-0 text-white" />
              <span>{replaceError}</span>
            </div>
          )}
          {replaceSuccess && (
            <div className="p-3.5 rounded-xl bg-transparent border border-[#E7C768]/60 backdrop-blur-md text-white text-sm flex items-center gap-2 shadow-lg">
              <Check className="w-4 h-4 shrink-0 text-[#E7C768]" />
              <span>{replaceSuccess}</span>
            </div>
          )}
        </div>

        {/* Hidden file input for replacement */}
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={handleFilePicked}
        />

        {/* Modal Footer */}
        <div className="flex items-center justify-between pt-4 border-t border-white/10 shrink-0 gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={replacing}
              title={`Заменить текущий файл на новый (файл должен называться «${file.name}»)`}
              className="px-4 py-2.5 rounded-xl bg-transparent hover:bg-white/10 text-white border border-[#E7C768] text-sm font-bold transition flex items-center gap-2 disabled:opacity-50 shadow-md backdrop-blur-md"
            >
              {replacing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-[#E7C768]" />
                  Замена файла...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4 text-[#E7C768]" />
                  Заменить
                </>
              )}
            </button>

            {onDelete && (
              <button
                onClick={() => onDelete(file)}
                disabled={replacing}
                className="px-4 py-2.5 rounded-xl bg-transparent hover:bg-white/10 text-white border border-white/25 text-sm font-bold transition flex items-center gap-2 disabled:opacity-50 shadow-md backdrop-blur-md"
              >
                <Trash2 className="w-4 h-4 text-white/80" /> Удалить файл
              </button>
            )}
          </div>

          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-transparent hover:bg-white/10 text-white border border-white/20 text-sm font-bold transition shadow-md backdrop-blur-md"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
};
