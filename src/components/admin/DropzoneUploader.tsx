import React, { useState, useRef } from "react";
import { UploadCloud, File, CheckCircle2, AlertCircle, Loader2, Folder, Image as ImageIcon } from "lucide-react";
import { FileUploadService, ProTalkUploadResult } from "../../services/FileUploadService";

interface DropzoneUploaderProps {
  currentFolderId?: number | null;
  folders?: { id: number; name: string; color: string }[];
  onUploadSuccess?: (results: ProTalkUploadResult[]) => void;
}

export const DropzoneUploader: React.FC<DropzoneUploaderProps> = ({
  currentFolderId = null,
  folders = [],
  onUploadSuccess,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ completed: number; total: number; currentFileName?: string }>({
    completed: 0,
    total: 0,
  });
  const [targetFolderId, setTargetFolderId] = useState<number | null>(currentFolderId);
  const [customName, setCustomName] = useState("");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [recentUploads, setRecentUploads] = useState<ProTalkUploadResult[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await processFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      await processFiles(Array.from(e.target.files));
    }
  };

  const processFiles = async (files: File[]) => {
    if (files.length === 0) return;
    setIsUploading(true);
    setUploadError(null);
    setUploadProgress({ completed: 0, total: files.length });

    try {
      const results = await FileUploadService.uploadBatch(
        files,
        {
          folder_id: targetFolderId,
          custom_name: files.length === 1 && customName.trim() ? customName.trim() : undefined,
        },
        (completed, total, currentFile) => {
          setUploadProgress({ completed, total, currentFileName: currentFile?.name });
        }
      );

      setRecentUploads((prev) => [...results, ...prev]);
      if (onUploadSuccess) onUploadSuccess(results);
      setCustomName("");
    } catch (err: any) {
      setUploadError(err.message || "Ошибка загрузки файлов.");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="w-full space-y-4">
      {/* Target Folder & Custom Name Options */}
      <div className="flex flex-wrap items-center gap-3 p-3.5 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md">
        <div className="flex items-center gap-2 text-xs text-slate-300">
          <Folder className="w-4 h-4 text-[#E7C768]" />
          <span>Целевая папка:</span>
          <select
            value={targetFolderId ?? ""}
            onChange={(e) => setTargetFolderId(e.target.value ? Number(e.target.value) : null)}
            className="bg-black/40 border border-white/20 text-white rounded-xl px-3 py-1.5 text-xs focus:outline-none focus:border-[#E7C768]"
          >
            <option value="" className="bg-[#132A40] text-white">Без папки (Корень)</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id} className="bg-[#132A40] text-white">
                📁 {f.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-300 flex-1 min-w-[200px]">
          <input
            type="text"
            placeholder="Свое имя файла (опционально для 1 файла)..."
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            className="w-full bg-black/40 border border-white/20 text-white placeholder-slate-400 rounded-xl px-3 py-1.5 text-xs focus:outline-none focus:border-[#E7C768]"
          />
        </div>
      </div>

      {/* Main Drag & Drop Zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`relative rounded-2xl border-2 border-dashed p-8 text-center cursor-pointer transition-all duration-300 flex flex-col items-center justify-center min-h-[160px] ${
          isDragging
            ? "border-[#E7C768] bg-[#E7C768]/15 scale-[1.01] shadow-xl"
            : "border-white/20 bg-white/5 hover:bg-white/10 hover:border-white/40"
        } backdrop-blur-md`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={handleFileSelect}
          className="hidden"
        />

        {isUploading ? (
          <div className="flex flex-col items-center gap-3 w-full max-w-xs">
            <Loader2 className="w-10 h-10 text-[#E7C768] animate-spin" />
            <div className="w-full space-y-1">
              <div className="flex justify-between text-xs text-slate-300 font-semibold">
                <span>Загрузка файлов...</span>
                <span>
                  {uploadProgress.completed} / {uploadProgress.total}
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-black/40 overflow-hidden border border-white/10">
                <div
                  className="h-full bg-gradient-to-r from-[#E7C768] to-[#C8A748] transition-all duration-300"
                  style={{
                    width: `${
                      uploadProgress.total > 0 ? (uploadProgress.completed / uploadProgress.total) * 100 : 0
                    }%`,
                  }}
                />
              </div>
              {uploadProgress.currentFileName && (
                <p className="text-[11px] text-slate-400 truncate font-mono mt-1">
                  {uploadProgress.currentFileName}
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <div className="w-12 h-12 rounded-2xl bg-[#265582]/60 border border-[#E7C768]/40 flex items-center justify-center text-[#E7C768] shadow-lg">
              <UploadCloud className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-bold text-white">
                Перетащите файлы сюда или <span className="text-[#E7C768] underline">выберите на диске</span>
              </p>
              <p className="text-xs text-slate-300 mt-1">
                Поддержка PNG (с сохранением прозрачности), JPG, WEBP, SVG, MP4, MP3 и документов
              </p>
            </div>
          </div>
        )}
      </div>

      {uploadError && (
        <div className="p-3.5 rounded-xl bg-rose-500/20 border border-rose-500/30 text-rose-200 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
          <span>{uploadError}</span>
        </div>
      )}

      {/* Recent Uploads Pill */}
      {recentUploads.length > 0 && (
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-center justify-between">
          <span className="flex items-center gap-1.5 font-semibold">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            Загружено {recentUploads.length} файл(ов) в эту сессию.
          </span>
          <button
            onClick={() => setRecentUploads([])}
            className="text-[10px] text-slate-400 hover:text-white underline"
          >
            Очистить статус
          </button>
        </div>
      )}
    </div>
  );
};
