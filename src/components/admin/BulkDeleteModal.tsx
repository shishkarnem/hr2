import React, { useState } from "react";
import { AlertTriangle, Trash2, X, Loader2 } from "lucide-react";

interface BulkDeleteModalProps {
  selectedCount: number;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

export const BulkDeleteModal: React.FC<BulkDeleteModalProps> = ({
  selectedCount,
  onClose,
  onConfirm,
}) => {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    setDeleting(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (err: any) {
      setError(err.message || "Ошибка при массовом удалении файлов");
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-fadeIn">
      <div
        className="w-full max-w-md rounded-2xl bg-[#132A40]/95 border border-rose-500/30 p-6 shadow-2xl backdrop-blur-xl text-white space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <h3 className="font-bold text-base text-rose-300 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-rose-400" /> Массовое удаление файлов ({selectedCount})
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded-xl bg-white/5 hover:bg-white/15 text-slate-300 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs text-slate-300 leading-relaxed">
          Вы уверены, что хотите удалить выбранные <span className="font-bold text-white">{selectedCount} ф.</span>? Все их записи в базе данных <span className="font-mono text-rose-300">file_storage</span> будут удалены.
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
                <span>Удалить {selectedCount} ф.</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
