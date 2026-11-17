import React, { useCallback, useEffect, useRef, useState } from "react";
import { FileText, Trash2, Upload, ExternalLink, Loader } from "lucide-react";
import { getCandidateSession } from "@/lib/candidateSession";
import { getUploadService } from "@/services/FileUploadService";

interface DocItem {
  name: string;
  path: string;
  size: number;
  signedUrl: string | null;
}

export const CandidateDocsDossier: React.FC<{ candidateId: string }> = ({ candidateId }) => {
  const [items, setItems] = useState<DocItem[]>(() => {
    try {
      const saved = localStorage.getItem(`cand_docs_${candidateId}`);
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(`cand_docs_${candidateId}`, JSON.stringify(items));
    } catch { /* ignore */ }
  }, [candidateId, items]);

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy(true);
    setErr(null);
    try {
      const newItems: DocItem[] = [];
      for (const file of Array.from(files)) {
        const url = await getUploadService().uploadFromFile(file);
        newItems.push({
          name: file.name,
          path: url,
          size: file.size,
          signedUrl: url,
        });
      }
      setItems((prev) => [...prev, ...newItems]);
    } catch (e: any) {
      setErr(e?.message || "Ошибка загрузки");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleDelete = async (path: string) => {
    if (!confirm("Удалить документ из списка?")) return;
    setItems((prev) => prev.filter((it) => it.path !== path));
  };

  return (
    <div className="mt-5 pt-4 border-t border-white/10 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h4 className="font-bold text-[11px] text-[#E7C768] uppercase tracking-wide">
          📎 Дополнительные документы (диплом, сертификаты, портфолио)
        </h4>
        <label className="cursor-pointer inline-flex items-center gap-1.5 bg-[#E7C768]/15 hover:bg-[#E7C768]/25 border border-[#E7C768]/40 text-[#E7C768] text-[11px] font-bold px-3 py-1.5 rounded-lg transition">
          <Upload className="w-3.5 h-3.5" />
          {busy ? "Загрузка…" : "Загрузить файлы"}
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp,.txt,.md"
            className="hidden"
            disabled={busy}
            onClick={(e) => { (e.currentTarget as HTMLInputElement).value = ""; }}
            onChange={(e) => handleUpload(e.target.files)}
          />
        </label>
      </div>

      {err && (
        <div className="text-[11px] text-red-300 bg-red-500/10 border border-red-500/30 p-2 rounded-lg">
          {err}
        </div>
      )}

      {busy && items.length === 0 ? (
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <Loader className="w-4 h-4 animate-spin" /> Загружаем список…
        </div>
      ) : items.length === 0 ? (
        <div className="text-[11px] text-slate-400 italic bg-white/5 border border-white/10 p-3 rounded-lg">
          Документы ещё не загружены. Это могут быть PDF, фото диплома, портфолио и т.п.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {items.map((it) => (
            <div
              key={it.path}
              className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg p-2.5 text-xs text-white"
            >
              <FileText className="w-4 h-4 text-[#E7C768] shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium" title={it.name}>{it.name.replace(/^\d+_/, "")}</div>
                <div className="text-[10px] text-slate-400">{(it.size / 1024).toFixed(1)} КБ</div>
              </div>
              {it.signedUrl && (
                <a
                  href={it.signedUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[#E7C768] hover:text-amber-300"
                  title="Открыть"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              )}
              <button
                type="button"
                onClick={() => handleDelete(it.path)}
                className="text-red-300 hover:text-red-200"
                title="Удалить"
                disabled={busy}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default CandidateDocsDossier;