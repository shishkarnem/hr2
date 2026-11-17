import React, { useState } from "react";
import { AlertTriangle, Trash2, X, Loader2, FileText } from "lucide-react";
import { FileStorageItem } from "./FilePreviewModal";

interface DeleteConfirmModalProps {
  file: FileStorageItem | null;
  onClose: () => void;
  onConfirm: (fileId: number) => Promise<void>;
}

export const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({
  file,
  onClose,
  onConfirm,
}) => {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!file) return null;

  const handleConfirm = async () => {
    setDeleting(true);
    setError(null);
    try {
      await onConfirm(file.id);
      onClose();
    } catch (err: any) {
      setError(err.message || "Ошибка при удалении файла");
      setDeleting(false);
    }
  };

  const isImage = file.mime_type?.startsWith("image/") || /\.(png|jpe?g|gif|webp|svg)$/i.test(file.name);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-fadeIn">
      <div
        className="w-full max-w-md rounded-2xl bg-[#132A40]/95 border border-rose-500/30 p-6 shadow-2xl backdrop-blur-xl text-white space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <h3 className="font-bold text-base text-rose-300 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-rose-400" /> Подтверждение удаления
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded-xl bg-white/5 hover:bg-white/15 text-slate-300 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* File Card Preview */}
        <div className="flex items-center gap-3 p-3 rounded-xl bg-black/40 border border-white/10">
          <div className="w-12 h-12 rounded-lg bg-black/60 border border-white/15 flex items-center justify-center overflow-hidden shrink-0 text-slate-300">
            {isImage ? (
              <img src={file.original_url} alt={file.name} className="w-full h-full object-contain p-1" />
            ) : (
              <FileText className="w-6 h-6" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-white truncate">{file.name}</p>
            <p className="text-[10px] text-slate-400 font-mono">ID: {file.id} • Key: {file.file_key}</p>
          </div>
        </div>

        <p className="text-xs text-slate-300 leading-relaxed">
          Вы уверены, что хотите удалить этот файл? Запись в базе данных <span className="font-mono text-rose-300">file_storage</span> по ID #{file.id} будет удалена безвозвратно.
        </p>

        {error && (
          <div className="p-3 rounded-xl bg-rose-500/20 border border-rose-500/30 text-rose-200 text-xs">
            {error}
          </div>
        )}

        {/* Buttons */}
        <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-white/10">
          <button
            type="button"
            onClick={onClose}
            disabled={deleting}
            className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/15 text-slate-300 text-xs font-semibold transition"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={deleting}
            className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-md hover:brightness-110 transition flex items-center gap-1.5 disabled:opacity-50"
          >
            {deleting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Удаление...</span>
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4" />
                <span>Удалить файл</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
