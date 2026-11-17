import React, { useState } from "react";
import { Folder, MoveRight, X, Loader2 } from "lucide-react";

interface BulkMoveModalProps {
  selectedCount: number;
  folders: { id: number; name: string; color: string }[];
  onClose: () => void;
  onConfirm: (targetFolderId: number | null) => Promise<void>;
}

export const BulkMoveModal: React.FC<BulkMoveModalProps> = ({
  selectedCount,
  folders,
  onClose,
  onConfirm,
}) => {
  const [targetFolderId, setTargetFolderId] = useState<number | null>(null);
  const [moving, setMoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    setMoving(true);
    setError(null);
    try {
      await onConfirm(targetFolderId);
      onClose();
    } catch (err: any) {
      setError(err.message || "Ошибка при массовом перемещении");
      setMoving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-fadeIn">
      <div
        className="w-full max-w-md rounded-2xl bg-[#132A40]/95 border border-white/15 p-6 shadow-2xl backdrop-blur-xl text-white space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <h3 className="font-bold text-base text-white flex items-center gap-2">
            <MoveRight className="w-5 h-5 text-[#E7C768]" /> Перемещение файлов ({selectedCount})
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded-xl bg-white/5 hover:bg-white/15 text-slate-300 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs text-slate-300">
          Выберите целевую папку для <span className="font-bold text-white">{selectedCount} выбранных файлов</span>:
        </p>

        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
            <Folder className="w-3.5 h-3.5 text-[#E7C768]" /> Целевая папка
          </label>
          <select
            value={targetFolderId ?? ""}
            onChange={(e) => {
              const val = e.target.value;
              setTargetFolderId(val ? Number(val) : null);
            }}
            className="w-full bg-black/50 border border-white/20 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-[#E7C768]"
          >
            <option value="" className="bg-[#132A40] text-white">Корень (Без папки)</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id} className="bg-[#132A40] text-white">
                📁 {f.name}
              </option>
            ))}
          </select>
        </div>

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
            disabled={moving}
            className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/15 text-slate-300 text-xs font-semibold transition"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={moving}
            className="px-4 py-2 rounded-xl bg-[#E7C768] hover:bg-[#d4b455] text-[#17344F] text-xs font-bold shadow-md hover:brightness-110 transition flex items-center gap-1.5 disabled:opacity-50"
          >
            {moving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Перемещение...</span>
              </>
            ) : (
              <>
                <MoveRight className="w-4 h-4" />
                <span>Переместить файлы</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
