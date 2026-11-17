import React, { useState, useEffect } from "react";
import { X, Edit3, Folder, Save, Loader2, Image as ImageIcon, FileText, Check } from "lucide-react";
import { FileStorageItem } from "./FilePreviewModal";
import { getFormattedFileUrl, slugifyFilename } from "../../services/FileUploadService";

interface EditFileModalProps {
  file: FileStorageItem | null;
  folders: { id: number; name: string; color: string }[];
  onClose: () => void;
  onSave: (fileId: number, newName: string, folderId: number | null, description?: string) => Promise<void>;
}

export const EditFileModal: React.FC<EditFileModalProps> = ({
  file,
  folders,
  onClose,
  onSave,
}) => {
  const [name, setName] = useState("");
  const [folderId, setFolderId] = useState<number | null>(null);
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (file) {
      setName(file.name || "");
      setFolderId(file.folder_id ?? null);
      setDescription(file.description || "");
    }
  }, [file]);

  if (!file) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setSaving(true);
    setError(null);
    try {
      await onSave(file.id, name.trim(), folderId, description.trim());
      onClose();
    } catch (err: any) {
      setError(err.message || "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  };

  const isImage = file.mime_type?.startsWith("image/") || /\.(png|jpe?g|gif|webp|svg)$/i.test(file.name);
  const formattedUrl = getFormattedFileUrl(file.id, name);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-fadeIn">
      <div
        className="w-full max-w-lg rounded-2xl bg-[#132A40]/95 border border-white/15 p-6 shadow-2xl backdrop-blur-xl text-white space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <h3 className="font-bold text-base text-white flex items-center gap-2">
            <Edit3 className="w-5 h-5 text-[#E7C768]" /> Редактирование файла #{file.id}
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl bg-white/5 hover:bg-white/15 text-slate-300 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Thumbnail and Current File Info */}
        <div className="flex items-center gap-3 p-3 rounded-xl bg-black/40 border border-white/10">
          <div className="w-14 h-14 rounded-lg bg-black/60 border border-white/15 flex items-center justify-center overflow-hidden shrink-0 text-[#E7C768]">
            {isImage ? (
              <img
                src={file.original_url}
                alt={file.name}
                className="w-full h-full object-contain p-1"
              />
            ) : (
              <FileText className="w-6 h-6" />
            )}
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-xs font-mono text-[#E7C768] truncate">ID: {file.id} • Key: {file.file_key}</p>
            <p className="text-xs text-slate-300 truncate">Текущее название: <span className="text-white font-semibold">{file.name}</span></p>
          </div>
        </div>

        {/* Form Fields */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Название файла в галерее
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Введите название файла"
              className="w-full bg-black/50 border border-white/20 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-[#E7C768] transition"
            />
          </div>

          {/* Generated URL Live Preview */}
          <div className="p-3 rounded-xl bg-white/5 border border-white/10 space-y-1">
            <span className="text-[10px] uppercase font-bold text-[#E7C768] tracking-wider block">
              Автоматический ЧПУ URL файла:
            </span>
            <p className="text-xs font-mono text-emerald-400 break-all select-all">
              {window.location.origin}{formattedUrl}
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Описание изображения (где и как использовать)
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Введите описание файла..."
              className="w-full bg-black/50 border border-white/20 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-[#E7C768] transition"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
              <Folder className="w-3.5 h-3.5 text-[#E7C768]" /> Папка назначения
            </label>
            <select
              value={folderId ?? ""}
              onChange={(e) => {
                const val = e.target.value;
                setFolderId(val ? Number(val) : null);
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

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-white/10">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/15 text-slate-300 text-xs font-semibold transition"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="px-5 py-2 rounded-xl bg-[#E7C768] hover:bg-[#d4b455] text-[#17344F] text-xs font-bold shadow-md hover:brightness-110 transition flex items-center gap-1.5 disabled:opacity-50"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Сохранение...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>Сохранить изменения</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
