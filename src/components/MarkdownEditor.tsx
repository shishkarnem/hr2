import React, { useEffect, useRef, useState } from "react";
import {
  Heading1, Heading2, Bold, Italic, Code, List, ListOrdered,
  Link2, Youtube, Video, FileText, Eye, Pencil, X, Check, Maximize2, Minimize2,
  ImageIcon, Loader2, Upload, Copy, Plus, Trash2, Film, AlertTriangle
} from "lucide-react";
import { RichTrainingMaterialCard } from "@/components/RichTrainingMarkdown";
import { getUploadService } from "@/services/FileUploadService";

type Props = {
  value: string;
  onChange: (v: string) => void;
  previewTitle?: string;
  rows?: number;
  placeholder?: string;
  maxLength?: number;
};

type UploadedMediaItem = {
  id: string;
  name: string;
  url: string;
  status: "uploading" | "done" | "error";
  error?: string;
};

/**
 * Reusable Markdown editor with brand-styled toolbar + live preview toggle.
 * Behavior mirrors TrainingWizard's material editor.
 */
export default function MarkdownEditor({
  value, onChange, previewTitle, rows = 18,
  placeholder = "Markdown статьи…", maxLength,
}: Props) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const [preview, setPreview] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [mediaList, setMediaList] = useState<UploadedMediaItem[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  // Inline brand-styled URL prompt (replaces native window.prompt).
  const [embedPrompt, setEmbedPrompt] = useState<null | { kind: string; placeholder: string; value: string }>(null);

  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); setFullscreen(false); }
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [fullscreen]);

  const clamp = (s: string) => maxLength ? s.slice(0, maxLength) : s;

  const applyMd = (prefix: string, suffix = "", placeholder = "") => {
    const ta = ref.current; if (!ta) return;
    const start = ta.selectionStart ?? 0;
    const end = ta.selectionEnd ?? 0;
    const before = value.slice(0, start);
    const sel = value.slice(start, end) || placeholder;
    const after = value.slice(end);
    const next = clamp(`${before}${prefix}${sel}${suffix}${after}`);
    onChange(next);
    requestAnimationFrame(() => {
      ta.focus();
      const pos = before.length + prefix.length;
      ta.setSelectionRange(pos, pos + sel.length);
    });
  };

  const insertMediaAtCursor = (item: UploadedMediaItem) => {
    const ta = ref.current;
    if (!ta) return;
    const start = ta.selectionStart ?? value.length;
    const end = ta.selectionEnd ?? value.length;
    const cleanName = item.name.replace(/\.[^/.]+$/, "");
    const isImage = /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(item.name) || /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(item.url);
    const mdSnippet = isImage ? `\n![${cleanName}](${item.url})\n` : `\n[${cleanName}](${item.url})\n`;
    const next = clamp(value.slice(0, start) + mdSnippet + value.slice(end));
    onChange(next);
    requestAnimationFrame(() => ta.focus());
  };

  const applyLinePrefix = (prefix: string) => {
    const ta = ref.current; if (!ta) return;
    const start = ta.selectionStart ?? 0;
    const end = ta.selectionEnd ?? 0;
    const lineStart = value.lastIndexOf("\n", start - 1) + 1;
    const lineEnd = value.indexOf("\n", end);
    const realEnd = lineEnd === -1 ? value.length : lineEnd;
    const seg = value.slice(lineStart, realEnd);
    const replaced = seg.split("\n").map(l => l.startsWith(prefix) ? l : `${prefix}${l}`).join("\n");
    onChange(clamp(value.slice(0, lineStart) + replaced + value.slice(realEnd)));
    requestAnimationFrame(() => ta.focus());
  };

  const EMBED_PLACEHOLDERS: Record<string, string> = {
    youtube: "https://www.youtube.com/watch?v=ID",
    vk: "https://vk.com/video-1234567_456239021",
    rutube: "https://rutube.ru/video/abc123def456/",
    gdoc: "https://docs.google.com/document/d/DOC_ID/edit",
  };
  const openEmbed = (kind: "youtube" | "vk" | "rutube" | "gdoc") => {
    setEmbedPrompt({ kind, placeholder: EMBED_PLACEHOLDERS[kind], value: "" });
  };
  const confirmEmbed = () => {
    const ta = ref.current;
    const url = (embedPrompt?.value || "").trim();
    if (!ta || !url) { setEmbedPrompt(null); return; }
    const start = ta.selectionStart ?? value.length;
    const before = value.slice(0, start);
    const after = value.slice(start);
    const sep1 = before.endsWith("\n\n") || before.length === 0 ? "" : (before.endsWith("\n") ? "\n" : "\n\n");
    const sep2 = after.startsWith("\n\n") || after.length === 0 ? "" : (after.startsWith("\n") ? "\n" : "\n\n");
    onChange(clamp(before + sep1 + url + sep2 + after));
    setEmbedPrompt(null);
    requestAnimationFrame(() => ta.focus());
  };

  const handleMultipleFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploadError(null);

    const newItems: UploadedMediaItem[] = files.map(f => ({
      id: "media-" + Math.random().toString(36).substring(2, 9),
      name: f.name,
      url: "",
      status: "uploading"
    }));

    setMediaList(prev => [...newItems, ...prev]);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const item = newItems[i];
      try {
        let uploadedUrl = "";
        try {
          // Direct client upload to ProTalk
          uploadedUrl = await getUploadService().uploadFromFile(file);
        } catch (serviceErr) {
          // Fallback to server proxy
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });

          const res = await fetch("/api/posts/upload-cover", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ dataUrl, fileName: file.name }),
          });
          const data = await res.json();
          if (res.ok && data.url) {
            uploadedUrl = data.url;
          } else {
            throw new Error(data.error || "Ошибка загрузки файла");
          }
        }

        if (uploadedUrl) {
          getUploadService().addFile(item.id, uploadedUrl);
          setMediaList(prev => prev.map(m => m.id === item.id ? { ...m, status: "done", url: uploadedUrl } : m));
        }
      } catch (err: any) {
        setMediaList(prev => prev.map(m => m.id === item.id ? { ...m, status: "error", error: err.message || "Ошибка загрузки" } : m));
      }
    }

    if (imageInputRef.current) {
      imageInputRef.current.value = "";
    }
  };

  return (
    <div className={fullscreen ? "fixed inset-0 z-[9990] bg-gradient-to-br from-[#17344F] to-[#265582] p-4 sm:p-6 overflow-auto" : "space-y-2"}>
      <div className={fullscreen ? "max-w-5xl mx-auto space-y-2 h-full flex flex-col" : "contents"}>
      <div className="flex items-center gap-2">
        {fullscreen && (
          <span className="text-[12px] font-bold text-[#E7C768] uppercase tracking-wider mr-auto">
            Полноэкранный режим · Esc для выхода
          </span>
        )}
        <div className="ml-auto flex items-center gap-1 bg-[#17344F]/60 border border-white/10 rounded-lg p-1">
          <button type="button" onClick={() => setPreview(false)}
            className={`px-2.5 py-1 rounded-md text-[11px] font-bold inline-flex items-center gap-1 ${!preview ? "bg-[#E7C768] text-[#17344F]" : "text-slate-200 hover:bg-white/10"}`}>
            <Pencil className="w-3 h-3" /> Редактор
          </button>
          <button type="button" onClick={() => setPreview(true)}
            className={`px-2.5 py-1 rounded-md text-[11px] font-bold inline-flex items-center gap-1 ${preview ? "bg-[#E7C768] text-[#17344F]" : "text-slate-200 hover:bg-white/10"}`}>
            <Eye className="w-3 h-3" /> Превью
          </button>
          <button type="button" onClick={() => setFullscreen(f => !f)}
            title={fullscreen ? "Закрыть полноэкранный режим (Esc)" : "Развернуть на весь экран"}
            className="px-2.5 py-1 rounded-md text-[11px] font-bold inline-flex items-center gap-1 text-slate-200 hover:bg-white/10">
            {fullscreen ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
            {fullscreen ? "Свернуть" : "Развернуть"}
          </button>
        </div>
      </div>

      {preview ? (
        <div className={fullscreen ? "flex-1 overflow-auto bg-[#17344F]/40 rounded-2xl p-4" : "min-h-[200px]"}>
          <RichTrainingMaterialCard title={previewTitle}>
            {value || "_Пусто_"}
          </RichTrainingMaterialCard>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-1 bg-[#17344F]/60 border border-white/10 rounded-lg p-1.5">
            <button type="button" title="Заголовок H1" onClick={() => applyLinePrefix("# ")}
              className="p-1.5 rounded hover:bg-white/10 text-slate-200"><Heading1 className="w-3.5 h-3.5" /></button>
            <button type="button" title="Заголовок H2" onClick={() => applyLinePrefix("## ")}
              className="p-1.5 rounded hover:bg-white/10 text-slate-200"><Heading2 className="w-3.5 h-3.5" /></button>
            <span className="w-px bg-white/10 mx-1" />
            <button type="button" title="Жирный" onClick={() => applyMd("**", "**", "текст")}
              className="p-1.5 rounded hover:bg-white/10 text-slate-200"><Bold className="w-3.5 h-3.5" /></button>
            <button type="button" title="Курсив" onClick={() => applyMd("_", "_", "текст")}
              className="p-1.5 rounded hover:bg-white/10 text-slate-200"><Italic className="w-3.5 h-3.5" /></button>
            <button type="button" title="Код" onClick={() => applyMd("`", "`", "код")}
              className="p-1.5 rounded hover:bg-white/10 text-slate-200"><Code className="w-3.5 h-3.5" /></button>
            <span className="w-px bg-white/10 mx-1" />
            <button type="button" title="Маркированный список" onClick={() => applyLinePrefix("- ")}
              className="p-1.5 rounded hover:bg-white/10 text-slate-200"><List className="w-3.5 h-3.5" /></button>
            <button type="button" title="Нумерованный список" onClick={() => applyLinePrefix("1. ")}
              className="p-1.5 rounded hover:bg-white/10 text-slate-200"><ListOrdered className="w-3.5 h-3.5" /></button>
            <button type="button" title="Ссылка" onClick={() => applyMd("[", "](https://)", "текст")}
              className="p-1.5 rounded hover:bg-white/10 text-slate-200"><Link2 className="w-3.5 h-3.5" /></button>
            <span className="w-px bg-white/10 mx-1" />
            <button type="button" title="Видео YouTube" onClick={() => openEmbed("youtube")}
              className="p-1.5 rounded hover:bg-white/10 text-rose-300"><Youtube className="w-3.5 h-3.5" /></button>
            <button type="button" title="Видео VK" onClick={() => openEmbed("vk")}
              className="p-1.5 rounded hover:bg-white/10 text-sky-300"><Video className="w-3.5 h-3.5" /></button>
            <button type="button" title="Видео Rutube" onClick={() => openEmbed("rutube")}
              className="p-1.5 rounded hover:bg-white/10 text-orange-300"><Video className="w-3.5 h-3.5" /></button>
            <button type="button" title="Google Docs / Sheets / Slides" onClick={() => openEmbed("gdoc")}
              className="p-1.5 rounded hover:bg-white/10 text-emerald-300"><FileText className="w-3.5 h-3.5" /></button>
            <span className="w-px bg-white/10 mx-1" />
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*,video/*,audio/*"
              multiple
              className="hidden"
              onChange={handleMultipleFilesSelected}
            />
            <button
              type="button"
              title="Загрузить фото и медиафайлы (можно выбрать несколько)"
              onClick={() => imageInputRef.current?.click()}
              className="px-2.5 py-1 rounded hover:bg-[#E7C768]/20 bg-[#E7C768]/10 border border-[#E7C768]/30 text-[#E7C768] font-bold text-[11px] inline-flex items-center gap-1.5 transition-colors"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Загрузить медиа</span>
            </button>
          </div>

          {mediaList.length > 0 && (
            <div className="bg-[#17344F]/80 border border-white/15 rounded-2xl p-3 space-y-2.5">
              <div className="flex items-center justify-between border-b border-white/10 pb-2">
                <span className="text-xs font-bold text-[#F4EE8E] flex items-center gap-1.5">
                  <ImageIcon className="w-4 h-4 text-[#E7C768]" />
                  Загруженные медиафайлы ({mediaList.length})
                </span>
                <button
                  type="button"
                  onClick={() => setMediaList([])}
                  className="text-[11px] text-slate-400 hover:text-white underline"
                >
                  Очистить список
                </button>
              </div>

              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {mediaList.map((item) => (
                  <div key={item.id} className="bg-[#102438] border border-white/10 rounded-xl p-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2 min-w-0 max-w-[200px] truncate">
                      {item.status === "uploading" ? (
                        <Loader2 className="w-4 h-4 text-[#E7C768] animate-spin shrink-0" />
                      ) : item.status === "error" ? (
                        <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                      ) : (
                        <ImageIcon className="w-4 h-4 text-emerald-400 shrink-0" />
                      )}
                      <span className="text-slate-200 font-medium truncate" title={item.name}>{item.name}</span>
                    </div>

                    {item.status === "uploading" && (
                      <span className="text-xs text-[#E7C768] font-semibold animate-pulse flex items-center gap-1">
                        Загрузка...
                      </span>
                    )}

                    {item.status === "error" && (
                      <span className="text-xs text-rose-300 font-semibold">
                        {item.error || "Ошибка"}
                      </span>
                    )}

                    {item.status === "done" && (
                      <div className="flex-1 flex items-center gap-2 min-w-[240px]">
                        <input
                          type="text"
                          readOnly
                          value={item.url}
                          className="flex-1 bg-[#17344F] border border-white/10 rounded-lg px-2.5 py-1 text-[11px] text-white select-all font-mono focus:outline-[#E7C768]"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(item.url);
                            setCopiedId(item.id);
                            setTimeout(() => setCopiedId(null), 2000);
                          }}
                          className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 border border-white/15 text-[11px] text-slate-200 font-bold inline-flex items-center gap-1 shrink-0 transition"
                          title="Скопировать ссылку на файл"
                        >
                          {copiedId === item.id ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                          {copiedId === item.id ? "Скопировано!" : "Скопировать"}
                        </button>
                        <button
                          type="button"
                          onClick={() => insertMediaAtCursor(item)}
                          className="px-2.5 py-1 rounded-lg bg-[#E7C768]/20 hover:bg-[#E7C768]/30 border border-[#E7C768]/40 text-[11px] text-[#E7C768] font-bold inline-flex items-center gap-1 shrink-0 transition"
                          title="Вставить ссылку в текст Markdown на текущую позицию курсора"
                        >
                          <Plus className="w-3 h-3" />
                          Вставить
                        </button>
                        <button
                          type="button"
                          onClick={() => setMediaList(prev => prev.filter(m => m.id !== item.id))}
                          className="p-1 text-slate-400 hover:text-rose-300 transition"
                          title="Удалить из списка"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {embedPrompt && (
            <div className="bg-[#17344F]/80 border border-[#E7C768]/40 rounded-xl p-3 space-y-2 animate-in fade-in">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-[#E7C768] uppercase tracking-wider">
                  Ссылка ({embedPrompt.kind.toUpperCase()})
                </span>
                <button type="button" onClick={() => setEmbedPrompt(null)}
                  className="p-1 rounded hover:bg-white/10 text-slate-300" title="Отмена">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="flex items-center gap-2">
                <input
                  autoFocus
                  type="url"
                  value={embedPrompt.value}
                  onChange={(e) => setEmbedPrompt({ ...embedPrompt, value: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); confirmEmbed(); }
                    if (e.key === "Escape") { e.preventDefault(); setEmbedPrompt(null); }
                  }}
                  placeholder={embedPrompt.placeholder}
                  className="flex-1 bg-[#17344F]/60 text-xs px-3 py-2 rounded-lg border border-white/10 text-white placeholder:text-slate-500 focus:outline-[#E7C768]"
                />
                <button type="button" onClick={confirmEmbed}
                  disabled={!embedPrompt.value.trim()}
                  className="px-3 py-2 rounded-lg bg-[#E7C768] text-[#17344F] font-bold text-xs inline-flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed">
                  <Check className="w-3.5 h-3.5" /> Вставить
                </button>
              </div>
            </div>
          )}
          {uploadError && (
            <div className="bg-rose-500/20 border border-rose-500/40 rounded-xl p-2.5 text-xs text-rose-200 flex items-center justify-between">
              <span>{uploadError}</span>
              <button type="button" onClick={() => setUploadError(null)} className="text-rose-300 hover:text-white text-xs underline font-bold">
                Закрыть
              </button>
            </div>
          )}
          <p className="text-[10px] text-slate-400 -mt-1">
            Совет: вставьте отдельной строкой ссылку YouTube / VK Video / Rutube или Google Docs — в превью и на странице статьи она автоматически станет встроенным проигрывателем/документом.
          </p>
          <textarea
            ref={ref}
            rows={fullscreen ? undefined : rows}
            maxLength={maxLength}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className={`w-full bg-[#17344F]/60 ${fullscreen ? "flex-1 min-h-[60vh] text-sm leading-relaxed" : "text-xs"} p-3 rounded-xl border border-white/10 font-mono text-slate-100 focus:outline-[#E7C768] break-words whitespace-pre-wrap`}
            style={fullscreen ? { resize: "none" } : { resize: "vertical" }}
          />
          {maxLength ? (
            <div className="text-[10px] text-slate-400 text-right">{value.length}/{maxLength}</div>
          ) : null}
        </>
      )}
      </div>
    </div>
  );
}