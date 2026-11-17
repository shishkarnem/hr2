import { useState, useRef } from "react";
import { createPortal } from "react-dom";
import {
  Image as ImageIcon,
  Images,
  Video,
  FileText,
  Link2,
  Table,
  Upload,
  Plus,
  Trash2,
  ExternalLink,
  Loader2,
  X,
  Sparkles,
  Check,
  Globe,
  SquareCheck,
  Maximize2,
  AlignLeft,
  AlignCenter,
  AlignRight,
  RefreshCw,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import { getUploadService } from "@/services/FileUploadService";
import { formatFileNameWithUserAndTimestamp, toAbsoluteUrl } from "@/lib/fileNaming";
import { hexToRgba } from "@/components/LandingStyleEditor";
import { DocumentFrameBlock } from "./DocumentFrameBlock";
import { MiniBrowserFrame } from "./EmbeddedMarkdown";

// Modal A: Image / Carousel Constructor Modal
export function ImageConstructorModal({
  isOpen,
  onClose,
  onInsert,
  ownerId = "100007",
}: {
  isOpen: boolean;
  onClose: () => void;
  onInsert: (markdown: string) => void;
  ownerId?: string;
}) {
  const [mode, setMode] = useState<"single" | "carousel">("single");
  const [singleUrl, setSingleUrl] = useState("");
  const [singleAlt, setSingleAlt] = useState("");
  const [carouselItems, setCarouselItems] = useState<Array<{ url: string; caption: string }>>([
    { url: "", caption: "" },
  ]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const carouselFileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleSingleUpload = async (file: File) => {
    if (!file) return;
    setUploading(true);
    try {
      const uploadService = getUploadService();
      const customName = formatFileNameWithUserAndTimestamp(file.name, ownerId);
      const url = await uploadService.uploadFromFile(file, {
        owner_id: ownerId,
        custom_name: customName,
      });
      const absUrl = toAbsoluteUrl(url);
      setSingleUrl(absUrl);
      if (!singleAlt) setSingleAlt(file.name.replace(/\.[^/.]+$/, ""));
      toast.success("Изображение загружено!");
    } catch (err: any) {
      toast.error(err.message || "Ошибка загрузки изображения");
    } finally {
      setUploading(false);
    }
  };

  const handleCarouselMultiUpload = async (files: FileList) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const uploadService = getUploadService();
      const newItems: Array<{ url: string; caption: string }> = [];
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const customName = formatFileNameWithUserAndTimestamp(f.name, ownerId);
        const url = await uploadService.uploadFromFile(f, {
          owner_id: ownerId,
          custom_name: customName,
        });
        newItems.push({ url: toAbsoluteUrl(url), caption: f.name.replace(/\.[^/.]+$/, "") });
      }
      setCarouselItems((prev) => [...prev.filter((p) => p.url.trim()), ...newItems]);
      toast.success(`Загружено изображений: ${newItems.length}`);
    } catch (err: any) {
      toast.error(err.message || "Ошибка загрузки изображений");
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = () => {
    if (mode === "single") {
      if (!singleUrl.trim()) {
        toast.error("Укажите ссылку или загрузите изображение");
        return;
      }
      const alt = singleAlt.trim() || "Изображение";
      onInsert(`\n![${alt}](${singleUrl.trim()})\n`);
      onClose();
    } else {
      const validItems = carouselItems.filter((item) => item.url.trim());
      if (validItems.length === 0) {
        toast.error("Добавьте хотя бы одно изображение для карусели");
        return;
      }
      const carouselLines = validItems
        .map((it) => `![${it.caption.trim() || "Слайд"}](${it.url.trim()})`)
        .join("\n");
      const block = `\n:::carousel\n${carouselLines}\n:::\n`;
      onInsert(block);
      onClose();
    }
  };

  const modalContent = (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-5 bg-transparent backdrop-blur-md overflow-y-auto" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-lg rounded-3xl border border-[#E7C768]/40 bg-[#17344F]/95 backdrop-blur-2xl p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto text-white my-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <ImageIcon className="w-5 h-5 text-[#E7C768]" />
            <h3 className="text-base font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">
              Конструктор изображений
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-xl hover:bg-white/10 text-white/70 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode selector: Single vs Carousel */}
        <div className="flex rounded-2xl border border-white/15 p-1 bg-white/5 backdrop-blur-md">
          <button
            type="button"
            onClick={() => setMode("single")}
            className={`flex-1 py-2 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition ${
              mode === "single"
                ? "bg-gradient-to-r from-[#E7C768]/30 to-[#D99E41]/20 border border-[#E7C768]/60 text-white shadow-sm"
                : "text-white/70 hover:text-white"
            }`}
          >
            <ImageIcon className="w-4 h-4 text-[#E7C768]" />
            <span>Одиночное фото</span>
          </button>
          <button
            type="button"
            onClick={() => setMode("carousel")}
            className={`flex-1 py-2 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition ${
              mode === "carousel"
                ? "bg-gradient-to-r from-[#E7C768]/30 to-[#D99E41]/20 border border-[#E7C768]/60 text-white shadow-sm"
                : "text-white/70 hover:text-white"
            }`}
          >
            <Images className="w-4 h-4 text-[#E7C768]" />
            <span>Карусель фото</span>
          </button>
        </div>

        {mode === "single" ? (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-white/80 mb-1.5">
                Загрузить файл с устройства
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleSingleUpload(e.target.files[0]);
                  }
                }}
              />
              <button
                type="button"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-3 rounded-2xl border border-dashed border-white/30 hover:border-[#E7C768]/60 bg-white/5 hover:bg-white/10 flex items-center justify-center gap-2 text-sm text-white transition disabled:opacity-50"
              >
                {uploading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-[#E7C768]" />
                    <span>Загружаем на сервер...</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4 text-[#E7C768]" />
                    <span>Выбрать изображение из галереи</span>
                  </>
                )}
              </button>
            </div>

            <div>
              <label className="block text-xs font-medium text-white/80 mb-1.5">
                Или вставить прямую ссылку на фото
              </label>
              <input
                type="url"
                value={singleUrl}
                onChange={(e) => setSingleUrl(e.target.value)}
                placeholder="https://example.com/image.png"
                className="w-full px-3.5 py-2.5 rounded-xl border border-white/20 bg-white/5 backdrop-blur-md text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-[#E7C768]/70"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-white/80 mb-1.5">
                Подпись / Альтернативный текст (необязательно)
              </label>
              <input
                type="text"
                value={singleAlt}
                onChange={(e) => setSingleAlt(e.target.value)}
                placeholder="Например: Схема бизнес-процесса"
                className="w-full px-3.5 py-2.5 rounded-xl border border-white/20 bg-white/5 backdrop-blur-md text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-[#E7C768]/70"
              />
            </div>

            {singleUrl && (
              <div className="rounded-2xl border border-white/15 p-2 bg-white/5">
                <p className="text-xs text-white/60 mb-1">Предпросмотр:</p>
                <img
                  src={singleUrl}
                  alt={singleAlt || "Предпросмотр"}
                  referrerPolicy="no-referrer"
                  className="max-h-40 rounded-xl object-contain mx-auto"
                />
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-white/80 mb-1.5">
                Загрузить несколько фото для карусели
              </label>
              <input
                ref={carouselFileInputRef}
                type="file"
                multiple
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) handleCarouselMultiUpload(e.target.files);
                }}
              />
              <button
                type="button"
                disabled={uploading}
                onClick={() => carouselFileInputRef.current?.click()}
                className="w-full py-3 rounded-2xl border border-dashed border-white/30 hover:border-[#E7C768]/60 bg-white/5 hover:bg-white/10 flex items-center justify-center gap-2 text-sm text-white transition disabled:opacity-50"
              >
                {uploading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-[#E7C768]" />
                    <span>Загрузка выбранных фото...</span>
                  </>
                ) : (
                  <>
                    <Images className="w-4 h-4 text-[#E7C768]" />
                    <span>Выбрать сразу несколько фото</span>
                  </>
                )}
              </button>
            </div>

            <div className="space-y-2.5">
              <label className="block text-xs font-medium text-white/80">
                Слайды карусели ({carouselItems.length}):
              </label>
              {carouselItems.map((item, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-2xl border border-white/15 bg-white/5 space-y-2 relative"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[#F4EE8E]">
                      Слайд #{idx + 1}
                    </span>
                    {carouselItems.length > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          setCarouselItems((prev) => prev.filter((_, i) => i !== idx))
                        }
                        className="p-1 text-white/50 hover:text-[#E7C768]"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <input
                    type="url"
                    value={item.url}
                    onChange={(e) => {
                      const val = e.target.value;
                      setCarouselItems((prev) =>
                        prev.map((it, i) => (i === idx ? { ...it, url: val } : it))
                      );
                    }}
                    placeholder="URL ссылки на слайд..."
                    className="w-full px-3 py-1.5 rounded-xl border border-white/20 bg-white/5 text-xs text-white placeholder:text-white/40 focus:outline-none focus:border-[#E7C768]/70"
                  />
                  <input
                    type="text"
                    value={item.caption}
                    onChange={(e) => {
                      const val = e.target.value;
                      setCarouselItems((prev) =>
                        prev.map((it, i) => (i === idx ? { ...it, caption: val } : it))
                      );
                    }}
                    placeholder="Подпись к слайду..."
                    className="w-full px-3 py-1.5 rounded-xl border border-white/20 bg-white/5 text-xs text-white placeholder:text-white/40 focus:outline-none focus:border-[#E7C768]/70"
                  />
                </div>
              ))}

              <button
                type="button"
                onClick={() =>
                  setCarouselItems((prev) => [...prev, { url: "", caption: "" }])
                }
                className="w-full py-2 rounded-xl border border-white/20 bg-white/5 hover:bg-white/10 text-xs text-[#F4EE8E] flex items-center justify-center gap-1.5 font-medium transition"
              >
                <Plus className="w-3.5 h-3.5" /> Добавить еще слайд
              </button>
            </div>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-white/10">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-medium text-white/80 hover:text-white hover:bg-white/5 transition"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="px-5 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] text-[#17344F] shadow-lg hover:brightness-105 transition"
          >
            Вставить в материал
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(modalContent, document.body) : modalContent;
}

// Modal B: Video Constructor Modal
export function VideoConstructorModal({
  isOpen,
  onClose,
  onInsert,
  ownerId = "100007",
}: {
  isOpen: boolean;
  onClose: () => void;
  onInsert: (markdown: string) => void;
  ownerId?: string;
}) {
  const [videoUrl, setVideoUrl] = useState("");
  const [videoTitle, setVideoTitle] = useState("");
  const [aspectRatio, setAspectRatio] = useState<"vertical" | "square" | "horizontal">("horizontal");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleVideoUpload = async (file: File) => {
    if (!file) return;
    setUploading(true);
    try {
      const uploadService = getUploadService();
      const customName = formatFileNameWithUserAndTimestamp(file.name, ownerId);
      const url = await uploadService.uploadFromFile(file, {
        owner_id: ownerId,
        custom_name: customName,
      });
      const absUrl = toAbsoluteUrl(url);
      setVideoUrl(absUrl);
      if (!videoTitle) setVideoTitle(file.name.replace(/\.[^/.]+$/, ""));

      // Initial aspect detection from filename
      if (/shorts|reels|tiktok|vertical|portrait|9x16/i.test(file.name)) {
        setAspectRatio("vertical");
      } else if (/square|1x1|1080x1080/i.test(file.name)) {
        setAspectRatio("square");
      }

      toast.success("Видео загружено!");
    } catch (err: any) {
      toast.error(err.message || "Ошибка загрузки видео");
    } finally {
      setUploading(false);
    }
  };

  const handleLoadedMetadata = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const v = e.currentTarget;
    if (v.videoWidth && v.videoHeight) {
      const ratio = v.videoHeight / v.videoWidth;
      if (ratio >= 1.2) {
        setAspectRatio("vertical");
      } else if (ratio >= 0.85 && ratio < 1.2) {
        setAspectRatio("square");
      } else {
        setAspectRatio("horizontal");
      }
    }
  };

  const handleInsert = () => {
    if (!videoUrl.trim()) {
      toast.error("Укажите ссылку или загрузите видеофайл");
      return;
    }
    const cleanUrl = toAbsoluteUrl(videoUrl.trim());
    const label = videoTitle.trim() || "Видео";
    const calculatedHeight = aspectRatio === "vertical" ? 640 : aspectRatio === "square" ? 500 : 480;
    onInsert(`\n\n:::frame url="${cleanUrl}" height="${calculatedHeight}" title="${label}" target="_blank":::\n\n`);
    onClose();
  };

  if (!isOpen) return null;

  const modalContent = (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-5 bg-transparent backdrop-blur-md overflow-y-auto" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-lg rounded-3xl border border-[#E7C768]/40 bg-[#17344F]/95 backdrop-blur-2xl p-6 shadow-2xl space-y-4 text-white my-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <Video className="w-5 h-5 text-[#E7C768]" />
            <h3 className="text-base font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">
              Конструктор видео
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-xl hover:bg-white/10 text-white/70 hover:text-white cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-white/80 mb-1.5">
              Загрузить видеофайл (MP4, WEBM, MOV)
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  handleVideoUpload(e.target.files[0]);
                }
              }}
            />
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-3 rounded-2xl border border-dashed border-white/30 hover:border-[#E7C768]/60 bg-white/5 hover:bg-white/10 flex items-center justify-center gap-2 text-sm text-white transition disabled:opacity-50 cursor-pointer"
            >
              {uploading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-[#E7C768]" />
                  <span>Загружаем видеофайл...</span>
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 text-[#E7C768]" />
                  <span>Выбрать видео с устройства</span>
                </>
              )}
            </button>
          </div>

          <div>
            <label className="block text-xs font-medium text-white/80 mb-1.5">
              Или вставить ссылку (YouTube, RuTube, VK Видео, Google / Яндекс Диск, MP4)
            </label>
            <input
              type="url"
              value={videoUrl}
              onChange={(e) => {
                const val = e.target.value;
                setVideoUrl(val);
                if (/shorts|reels|tiktok|vertical|portrait|9x16/i.test(val)) {
                  setAspectRatio("vertical");
                } else if (/square|1x1|1080x1080/i.test(val)) {
                  setAspectRatio("square");
                }
              }}
              placeholder="https://youtube.com/watch?v=... или https://example.com/video.mp4"
              className="w-full px-3.5 py-2.5 rounded-xl border border-white/20 bg-white/5 backdrop-blur-md text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-[#E7C768]/70"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-white/80 mb-1.5">
              Название видео (необязательно)
            </label>
            <input
              type="text"
              value={videoTitle}
              onChange={(e) => setVideoTitle(e.target.value)}
              placeholder="Например: Видеоинструкция по работе в CRM"
              className="w-full px-3.5 py-2.5 rounded-xl border border-white/20 bg-white/5 backdrop-blur-md text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-[#E7C768]/70"
            />
          </div>

          {/* Aspect Ratio Selector & Indicator */}
          <div className="flex items-center justify-between p-2.5 rounded-2xl border border-white/15 bg-white/5">
            <span className="text-xs text-white/70">Пропорции плеера:</span>
            <div className="flex items-center gap-1.5">
              {[
                { type: "horizontal" as const, label: "16:9" },
                { type: "square" as const, label: "1:1" },
                { type: "vertical" as const, label: "9:16 (вертикаль)" },
              ].map((p) => (
                <button
                  key={p.type}
                  type="button"
                  onClick={() => setAspectRatio(p.type)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition cursor-pointer ${
                    aspectRatio === p.type
                      ? "border border-[#E7C768]/70 bg-[#E7C768]/20 text-white font-semibold"
                      : "border border-white/10 bg-transparent text-white/60 hover:text-white"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Video Live Preview */}
          {videoUrl.trim() && (
            <div className="p-3 rounded-2xl border border-white/20 bg-black/40 space-y-2">
              <div className="flex items-center justify-between text-xs text-white/80">
                <span className="font-medium text-[#E7C768]">Предпросмотр воспроизведения:</span>
                <span className="text-[11px] text-slate-400 truncate max-w-[200px]">{videoUrl}</span>
              </div>
              <div className="w-full rounded-xl overflow-hidden bg-black/90 flex items-center justify-center p-2 min-h-[160px]">
                {/(?:youtube\.com|youtu\.be)/i.test(videoUrl) ? (
                  <div className={`w-full ${aspectRatio === "vertical" ? "max-w-[240px] aspect-[9/16]" : "aspect-video"}`}>
                    <iframe
                      src={`https://www.youtube.com/embed/${(videoUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{6,})/i) || [])[1]}?rel=0`}
                      className="w-full h-full rounded-xl border-0"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen
                      referrerPolicy="no-referrer-when-downgrade"
                    />
                  </div>
                ) : /rutube\.ru/i.test(videoUrl) ? (
                  <div className="w-full aspect-video">
                    <iframe
                      src={`https://rutube.ru/play/embed/${(videoUrl.match(/rutube\.ru\/(?:video|play\/embed)\/([\w]+)/i) || [])[1]}`}
                      className="w-full h-full rounded-xl border-0"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen
                      referrerPolicy="no-referrer-when-downgrade"
                    />
                  </div>
                ) : (
                  <div
                    className={`flex items-center justify-center ${
                      aspectRatio === "vertical"
                        ? "max-w-[220px] w-full aspect-[9/16]"
                        : aspectRatio === "square"
                        ? "max-w-[260px] w-full aspect-square"
                        : "w-full aspect-video"
                    }`}
                  >
                    <video
                      src={toAbsoluteUrl(videoUrl)}
                      controls
                      playsInline
                      preload="metadata"
                      onLoadedMetadata={handleLoadedMetadata}
                      className="w-full h-full object-contain rounded-xl"
                    >
                      Ваш браузер не поддерживает предпросмотр видео.
                    </video>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-white/10">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-medium text-white/80 hover:text-white hover:bg-white/5 transition cursor-pointer"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={handleInsert}
            className="px-5 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] text-[#17344F] shadow-lg hover:brightness-105 transition cursor-pointer"
          >
            Вставить видео
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(modalContent, document.body) : modalContent;
}

// Modal C: Documents Constructor Modal
export function DocumentConstructorModal({
  isOpen,
  onClose,
  onInsert,
  ownerId = "100007",
  theme,
}: {
  isOpen: boolean;
  onClose: () => void;
  onInsert: (markdown: string) => void;
  ownerId?: string;
  theme?: any;
}) {
  const [docUrl, setDocUrl] = useState("");
  const [docName, setDocName] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeBtnBg = theme?.btnActiveBgColor
    ? hexToRgba(theme.btnActiveBgColor, theme.btnActiveOpacity ?? 100)
    : "var(--landing-btn-active-bg, #FFFFFF)";
  const activeBtnText = theme?.btnActiveTextColor || "var(--landing-btn-active-text, #000000)";
  const activeBtnBorder = theme?.btnBorderColor
    ? hexToRgba(theme.btnBorderColor, theme.btnBorderOpacity ?? 25)
    : "var(--landing-btn-border, rgba(255, 255, 255, 0.25))";
  const activeBtnRadius =
    theme?.btnBorderRadius === 999
      ? "9999px"
      : theme?.btnBorderRadius != null
      ? `${theme.btnBorderRadius}px`
      : "var(--landing-radius-btn, 14px)";
  const activeBtnBorderWidth = theme?.btnBorderWidth != null ? `${theme.btnBorderWidth}px` : "1px";

  const activeBtnStyle: React.CSSProperties = {
    backgroundColor: activeBtnBg,
    color: activeBtnText,
    borderColor: activeBtnBorder,
    borderWidth: activeBtnBorderWidth,
    borderRadius: activeBtnRadius,
    fontFamily: theme?.fontFamily || undefined,
  };

  if (!isOpen) return null;

  const handleDocUpload = async (file: File) => {
    if (!file) return;
    setUploading(true);
    try {
      const uploadService = getUploadService();
      const customName = formatFileNameWithUserAndTimestamp(file.name, ownerId);
      const url = await uploadService.uploadFromFile(file, {
        owner_id: ownerId,
        custom_name: customName,
      });
      const absUrl = toAbsoluteUrl(url);
      setDocUrl(absUrl);
      if (!docName) setDocName(file.name);
      toast.success("Документ загружен!");
    } catch (err: any) {
      toast.error(err.message || "Ошибка загрузки документа");
    } finally {
      setUploading(false);
    }
  };

  const handleClearDoc = () => {
    setDocUrl("");
    setDocName("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleInsert = () => {
    if (!docUrl.trim()) {
      toast.error("Укажите ссылку или загрузите файл документа");
      return;
    }
    const cleanUrl = toAbsoluteUrl(docUrl.trim());
    const label = docName.trim() || "Документ";
    // 1000px is strictly used for markdown embedding in content
    onInsert(`\n\n:::frame url="${cleanUrl}" height="1000" title="${label}" target="_blank":::\n\n`);
    onClose();
  };

  if (!isOpen) return null;

  const modalContent = (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 md:p-6 bg-transparent backdrop-blur-md overflow-y-auto" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-4xl max-h-[92vh] flex flex-col rounded-3xl border border-[#E7C768]/40 bg-[#17344F]/95 backdrop-blur-2xl shadow-2xl overflow-hidden my-auto text-white" onClick={(e) => e.stopPropagation()}>
        {/* Fixed Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-5 md:px-6 py-3.5 bg-transparent backdrop-blur-md shrink-0">
          <div className="flex items-center gap-2.5">
            <FileText className="w-5 h-5 text-[#E7C768]" />
            <h3 className="text-base font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">
              Конструктор документов
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-white/10 text-white/70 hover:text-white cursor-pointer transition"
            title="Закрыть"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body with visible scrollbar */}
        <div className="flex-1 overflow-y-auto p-5 md:p-6 space-y-4 custom-scrollbar">
          {/* Document selection card or inputs */}
          {docUrl.trim() ? (
            <div className="p-4 rounded-2xl border border-[#E7C768]/40 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-xl space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-[#E7C768]/20 border border-[#E7C768]/40 flex items-center justify-center shrink-0">
                    <FileText className="w-4 h-4 text-[#E7C768]" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-white truncate max-w-md">
                      {docName.trim() || "Выбранный документ"}
                    </div>
                    <div className="text-xs text-slate-300 truncate max-w-md">
                      {docUrl}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="px-3 py-1.5 rounded-xl border border-[#E7C768]/60 bg-[#E7C768]/20 hover:bg-[#E7C768]/30 text-white text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 text-[#E7C768] ${uploading ? "animate-spin" : ""}`} />
                    <span>Сменить документ</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleClearDoc}
                    className="px-3 py-1.5 rounded-xl border border-white/20 bg-white/5 hover:bg-white/10 text-slate-200 hover:text-white text-xs transition cursor-pointer"
                  >
                    Очистить
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-white/80 mb-1">
                  Название документа (можно изменить):
                </label>
                <input
                  type="text"
                  value={docName}
                  onChange={(e) => setDocName(e.target.value)}
                  placeholder="Например: Регламент работы отдела продаж (PDF)"
                  className="w-full px-3.5 py-2 rounded-xl border border-white/20 bg-black/20 text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-[#E7C768]/70"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-white/80 mb-1.5">
                  Загрузить файл документа (PDF, DOCX, XLSX, PPTX, TXT)
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.rtf"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      handleDocUpload(e.target.files[0]);
                    }
                  }}
                />
                <button
                  type="button"
                  disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-4 rounded-2xl border border-dashed border-white/30 hover:border-[#E7C768]/60 bg-white/5 hover:bg-white/10 flex items-center justify-center gap-2.5 text-sm text-white transition disabled:opacity-50 cursor-pointer"
                >
                  {uploading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-[#E7C768]" />
                      <span>Загружаем документ...</span>
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4 text-[#E7C768]" />
                      <span className="font-medium">Выбрать документ с устройства</span>
                    </>
                  )}
                </button>
              </div>

              <div>
                <label className="block text-xs font-medium text-white/80 mb-1.5">
                  Или вставить ссылку на документ (Google Docs, Drive, веб-документ)
                </label>
                <input
                  type="url"
                  value={docUrl}
                  onChange={(e) => setDocUrl(e.target.value)}
                  placeholder="https://docs.google.com/document/d/... или прямая ссылка на PDF"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-white/20 bg-white/5 backdrop-blur-md text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-[#E7C768]/70"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-white/80 mb-1.5">
                  Отображаемое название документа
                </label>
                <input
                  type="text"
                  value={docName}
                  onChange={(e) => setDocName(e.target.value)}
                  placeholder="Например: Регламент работы отдела продаж (PDF)"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-white/20 bg-white/5 backdrop-blur-md text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-[#E7C768]/70"
                />
              </div>
            </div>
          )}

          {/* Invisible file input for changing doc when card is visible */}
          {docUrl.trim() && (
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.rtf"
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  handleDocUpload(e.target.files[0]);
                }
              }}
            />
          )}

          {/* Standard Height Badge */}
          <div className="p-3 rounded-2xl border border-white/15 bg-white/5 flex items-center justify-between text-xs text-white/80">
            <span>Высота фрейма при вставке в текст:</span>
            <span className="font-semibold text-[#F4EE8E] px-2.5 py-1 rounded-lg border border-[#E7C768]/40 bg-[#E7C768]/10">
              1000px (полный размер без обрезания)
            </span>
          </div>

          {/* Document Live Preview (Height 600px for modal preview so top is fully visible and scrollable) */}
          {docUrl.trim() && (
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between text-xs text-white/80">
                <span className="font-medium text-[#E7C768]">
                  Предпросмотр документа в окне (высота 600px, верх документа виден полностью):
                </span>
                <span className="text-[11px] text-slate-300">Высота: 600px</span>
              </div>
              <DocumentFrameBlock
                src={toAbsoluteUrl(docUrl)}
                title={docName.trim() || "Документ"}
                originalUrl={docUrl}
                height={600}
                theme={theme}
                onRecognizeComplete={() => {
                  toast.success("Текст распознан! Вы можете вставить его или оставить фрейм-блок.");
                }}
              />
            </div>
          )}
        </div>

        {/* Fixed Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-3.5 border-t border-white/10 bg-white/5 backdrop-blur-md shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-medium text-white/80 hover:text-white hover:bg-white/5 transition cursor-pointer"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={handleInsert}
            disabled={!docUrl.trim()}
            className="px-5 py-2.5 text-xs font-bold shadow-lg hover:brightness-105 disabled:opacity-50 transition cursor-pointer"
            style={activeBtnStyle}
          >
            Вставить фрейм-блок документа
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(modalContent, document.body) : modalContent;
}

// Modal D: Link Constructor Modal (Text link, Button, Mini-Browser Frame, target selection, window size)
export function LinkConstructorModal({
  isOpen,
  onClose,
  onInsert,
  theme,
}: {
  isOpen: boolean;
  onClose: () => void;
  onInsert: (markdown: string) => void;
  theme?: any;
}) {
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [format, setFormat] = useState<"link" | "button" | "frame">("link");
  const [target, setTarget] = useState<"_blank" | "_self">("_blank");
  const [frameHeight, setFrameHeight] = useState("500");

  if (!isOpen) return null;

  const activeBtnBg = theme?.btnActiveBgColor
    ? hexToRgba(theme.btnActiveBgColor, theme.btnActiveOpacity ?? 100)
    : "var(--landing-btn-active-bg, #FFFFFF)";
  const activeBtnText = theme?.btnActiveTextColor || "var(--landing-btn-active-text, #000000)";
  const activeBtnBorder = theme?.btnBorderColor
    ? hexToRgba(theme.btnBorderColor, theme.btnBorderOpacity ?? 25)
    : "var(--landing-btn-border, rgba(255, 255, 255, 0.25))";
  const activeBtnRadius =
    theme?.btnBorderRadius === 999
      ? "9999px"
      : theme?.btnBorderRadius != null
      ? `${theme.btnBorderRadius}px`
      : "var(--landing-radius-btn, 14px)";
  const activeBtnBorderWidth = theme?.btnBorderWidth != null ? `${theme.btnBorderWidth}px` : "1px";

  const activeBtnStyle: React.CSSProperties = {
    backgroundColor: activeBtnBg,
    color: activeBtnText,
    borderColor: activeBtnBorder,
    borderWidth: activeBtnBorderWidth,
    borderRadius: activeBtnRadius,
    fontFamily: theme?.fontFamily || undefined,
  };

  const handleInsert = () => {
    if (!url.trim()) {
      toast.error("Укажите адрес ссылки");
      return;
    }
    const cleanUrl = toAbsoluteUrl(url.trim());
    const label = text.trim() || cleanUrl;

    if (format === "link") {
      onInsert(`[${label}](${cleanUrl})`);
    } else if (format === "button") {
      onInsert(`\n\n:::button url="${cleanUrl}" title="${label}" target="${target}":::\n\n`);
    } else {
      // Mini-browser frame directive
      const h = frameHeight.trim() || "500";
      onInsert(`\n\n:::frame url="${cleanUrl}" height="${h}" title="${label}" target="${target}":::\n\n`);
    }
    onClose();
  };

  const modalContent = (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 md:p-6 bg-transparent backdrop-blur-md overflow-y-auto" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-3xl max-h-[92vh] flex flex-col rounded-3xl border border-[#E7C768]/40 bg-[#17344F]/95 backdrop-blur-2xl shadow-2xl overflow-hidden my-auto text-white" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-white/10 px-5 md:px-6 py-3.5 bg-transparent backdrop-blur-md shrink-0">
          <div className="flex items-center gap-2.5">
            <Link2 className="w-5 h-5 text-[#E7C768]" />
            <h3 className="text-base font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">
              Конструктор ссылок
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-white/10 text-white/70 hover:text-white cursor-pointer transition"
            title="Закрыть"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 md:p-6 space-y-4 text-sm custom-scrollbar">
          <div>
            <label className="block text-xs font-medium text-white/80 mb-1.5">
              URL ссылки
            </label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com или https://docs.google.com/..."
              className="w-full px-3.5 py-2.5 rounded-xl border border-white/20 bg-white/5 backdrop-blur-md text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-[#E7C768]/70"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-white/80 mb-1.5">
              Текст ссылки / кнопки / заголовок окна
            </label>
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Например: Открыть рабочий регламент"
              className="w-full px-3.5 py-2.5 rounded-xl border border-white/20 bg-white/5 backdrop-blur-md text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-[#E7C768]/70"
            />
          </div>

          {/* Format selection */}
          <div>
            <label className="block text-xs font-medium text-white/80 mb-1.5">
              Формат отображения:
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setFormat("link")}
                className={`p-2.5 rounded-xl text-xs font-medium border text-center transition cursor-pointer ${
                  format === "link"
                    ? "bg-gradient-to-r from-[#E7C768]/30 to-[#D99E41]/20 border-[#E7C768] text-white shadow-sm"
                    : "border-white/15 bg-white/5 text-white/70 hover:text-white"
                }`}
              >
                Ссылка в тексте
              </button>
              <button
                type="button"
                onClick={() => setFormat("button")}
                className={`p-2.5 rounded-xl text-xs font-medium border text-center transition cursor-pointer ${
                  format === "button"
                    ? "bg-gradient-to-r from-[#E7C768]/30 to-[#D99E41]/20 border-[#E7C768] text-white shadow-sm"
                    : "border-white/15 bg-white/5 text-white/70 hover:text-white"
                }`}
              >
                Кнопка
              </button>
              <button
                type="button"
                onClick={() => setFormat("frame")}
                className={`p-2.5 rounded-xl text-xs font-medium border text-center transition cursor-pointer ${
                  format === "frame"
                    ? "bg-gradient-to-r from-[#E7C768]/30 to-[#D99E41]/20 border-[#E7C768] text-white shadow-sm"
                    : "border-white/15 bg-white/5 text-white/70 hover:text-white"
                }`}
              >
                Мини-браузер (Фрейм)
              </button>
            </div>
          </div>

          {/* Frame-specific settings */}
          {format === "frame" && (
            <div className="p-3.5 rounded-2xl border border-white/15 bg-white/5 backdrop-blur-md space-y-3">
              <label className="block text-xs font-medium text-white/80">
                Размер окна фрейма (высота):
              </label>
              <div className="flex gap-2 flex-wrap">
                {[
                  { label: "Компактный (350px)", val: "350" },
                  { label: "Стандартный (500px)", val: "500" },
                  { label: "Высокий (700px)", val: "700" },
                ].map((preset) => (
                  <button
                    key={preset.val}
                    type="button"
                    onClick={() => setFrameHeight(preset.val)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition cursor-pointer ${
                      frameHeight === preset.val
                        ? "border-[#E7C768] bg-[#E7C768]/20 text-white"
                        : "border-white/15 bg-white/5 text-white/70 hover:text-white"
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 pt-1">
                <span className="text-xs text-slate-300">Точная высота (px):</span>
                <input
                  type="number"
                  min="200"
                  max="1200"
                  step="50"
                  value={frameHeight}
                  onChange={(e) => setFrameHeight(e.target.value)}
                  className="w-24 px-2 py-1 rounded-lg border border-white/20 bg-black/20 text-white text-xs text-center focus:outline-none focus:border-[#E7C768]"
                />
              </div>
            </div>
          )}

          {/* Target window selection */}
          <div>
            <label className="block text-xs font-medium text-white/80 mb-1.5">
              Где открывать ссылку:
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setTarget("_blank")}
                className={`flex-1 p-2 rounded-xl text-xs font-medium border flex items-center justify-center gap-1.5 transition cursor-pointer ${
                  target === "_blank"
                    ? "bg-gradient-to-r from-[#E7C768]/30 to-[#D99E41]/20 border-[#E7C768] text-white shadow-sm"
                    : "border-white/15 bg-white/5 text-white/70 hover:text-white"
                }`}
              >
                <ExternalLink className="w-3.5 h-3.5 text-[#E7C768]" />
                <span>В новом окне</span>
              </button>
              <button
                type="button"
                onClick={() => setTarget("_self")}
                className={`flex-1 p-2 rounded-xl text-xs font-medium border flex items-center justify-center gap-1.5 transition cursor-pointer ${
                  target === "_self"
                    ? "bg-gradient-to-r from-[#E7C768]/30 to-[#D99E41]/20 border-[#E7C768] text-white shadow-sm"
                    : "border-white/15 bg-white/5 text-white/70 hover:text-white"
                }`}
              >
                <Globe className="w-3.5 h-3.5 text-[#E7C768]" />
                <span>В текущем окне</span>
              </button>
            </div>
          </div>

          {/* Visual Preview */}
          <div className="pt-2">
            <div className="text-xs font-medium text-white/70 mb-1.5">Предпросмотр компонента:</div>
            <div className="p-3 rounded-2xl border border-white/15 bg-white/5 backdrop-blur-md flex items-center justify-center overflow-hidden min-h-[70px]">
              {format === "link" && (
                <span className="text-[#E7C768] underline decoration-[#E7C768]/40 underline-offset-2">
                  {text.trim() || url.trim() || "Пример текстовой ссылки"}
                </span>
              )}
              {format === "button" && (
                <div
                  className="inline-flex items-center gap-2 px-5 py-2.5 font-bold text-xs shadow-lg break-words whitespace-normal text-wrap"
                  style={activeBtnStyle}
                >
                  <span className="break-words whitespace-normal text-wrap" style={{ color: "inherit" }}>{text.trim() || "Перейти по ссылке"}</span>
                  <ExternalLink className="w-3.5 h-3.5 shrink-0" style={{ color: "inherit" }} />
                </div>
              )}
              {format === "frame" && (
                <div className="w-full">
                  {url.trim() ? (
                    <MiniBrowserFrame
                      src={toAbsoluteUrl(url.trim())}
                      title={text.trim() || "Встроенное окно"}
                      originalUrl={url.trim()}
                      height={Math.min(parseInt(frameHeight) || 400, 420)}
                      target={target}
                      theme={theme}
                    />
                  ) : (
                    <div className="w-full py-8 rounded-2xl border border-dashed border-white/20 bg-white/5 text-center text-xs text-slate-300">
                      Введите URL выше для интерактивного предпросмотра фрейма мини-браузера
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-3.5 border-t border-white/10 bg-white/5 backdrop-blur-md shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-medium text-white/80 hover:text-white hover:bg-white/5 transition cursor-pointer"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={handleInsert}
            disabled={!url.trim()}
            className="px-5 py-2.5 text-xs font-bold shadow-lg hover:brightness-105 disabled:opacity-50 transition cursor-pointer"
            style={activeBtnStyle}
          >
            Вставить ссылку
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(modalContent, document.body) : modalContent;
}

// Modal E: Table Constructor Modal
export function TableConstructorModal({
  isOpen,
  onClose,
  onInsert,
}: {
  isOpen: boolean;
  onClose: () => void;
  onInsert: (markdown: string) => void;
}) {
  const [colCount, setColCount] = useState(3);
  const [rowCount, setRowCount] = useState(3);
  const [align, setAlign] = useState<"left" | "center" | "right">("left");

  const [headers, setHeaders] = useState<string[]>([
    "Колонка 1",
    "Колонка 2",
    "Колонка 3",
  ]);

  const [rows, setRows] = useState<string[][]>([
    ["Значение 1", "Значение 2", "Значение 3"],
    ["Значение 4", "Значение 5", "Значение 6"],
    ["Значение 7", "Значение 8", "Значение 9"],
  ]);

  if (!isOpen) return null;

  const handleAddCol = () => {
    if (colCount >= 6) {
      toast.info("Максимум 6 колонок для удобства чтения");
      return;
    }
    const nextCol = colCount + 1;
    setColCount(nextCol);
    setHeaders((prev) => [...prev, `Колонка ${nextCol}`]);
    setRows((prev) => prev.map((r) => [...r, ""]));
  };

  const handleRemoveCol = () => {
    if (colCount <= 2) {
      toast.info("Минимум 2 колонки");
      return;
    }
    setColCount((c) => c - 1);
    setHeaders((prev) => prev.slice(0, -1));
    setRows((prev) => prev.map((r) => r.slice(0, -1)));
  };

  const handleAddRow = () => {
    if (rowCount >= 12) {
      toast.info("Максимум 12 строк в конструкторе");
      return;
    }
    setRowCount((r) => r + 1);
    setRows((prev) => [...prev, Array(colCount).fill("")]);
  };

  const handleRemoveRow = () => {
    if (rowCount <= 1) {
      toast.info("Минимум 1 строка");
      return;
    }
    setRowCount((r) => r - 1);
    setRows((prev) => prev.slice(0, -1));
  };

  const updateHeader = (cIdx: number, val: string) => {
    setHeaders((prev) => {
      const copy = [...prev];
      copy[cIdx] = val;
      return copy;
    });
  };

  const updateCell = (rIdx: number, cIdx: number, val: string) => {
    setRows((prev) => {
      const copy = prev.map((row) => [...row]);
      copy[rIdx][cIdx] = val;
      return copy;
    });
  };

  const handleInsert = () => {
    const alignMarker =
      align === "center" ? ":---:" : align === "right" ? "---:" : ":---";

    let md = "\n";
    // Header row
    md += `| ${headers.map((h) => h.trim() || "—").join(" | ")} |\n`;
    // Separator row
    md += `| ${Array(colCount).fill(alignMarker).join(" | ")} |\n`;
    // Data rows
    for (const r of rows) {
      md += `| ${r.map((c) => c.trim() || "—").join(" | ")} |\n`;
    }
    md += "\n";

    onInsert(md);
    toast.success("Таблица вставлена в материал!");
    onClose();
  };

  const modalContent = (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-5 bg-transparent backdrop-blur-md overflow-y-auto" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-2xl rounded-3xl border border-[#E7C768]/40 bg-[#17344F]/95 backdrop-blur-2xl p-6 shadow-2xl space-y-4 my-auto text-white" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <Table className="w-5 h-5 text-[#E7C768]" />
            <h3 className="text-base font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">
              Конструктор таблиц
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-xl hover:bg-white/10 text-white/70 hover:text-white cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Matrix size controls */}
        <div className="flex items-center justify-between gap-3 flex-wrap p-3 rounded-2xl border border-white/15 bg-white/5 backdrop-blur-md text-xs">
          <div className="flex items-center gap-2">
            <span className="text-white/80 font-medium">Колонки ({colCount}):</span>
            <button
              type="button"
              onClick={handleRemoveCol}
              disabled={colCount <= 2}
              className="px-2.5 py-1 rounded-lg border border-white/20 bg-white/5 hover:bg-white/10 text-white disabled:opacity-40 cursor-pointer"
            >
              - Столбец
            </button>
            <button
              type="button"
              onClick={handleAddCol}
              disabled={colCount >= 6}
              className="px-2.5 py-1 rounded-lg border border-white/20 bg-white/5 hover:bg-white/10 text-white disabled:opacity-40 cursor-pointer"
            >
              + Столбец
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-white/80 font-medium">Строки ({rowCount}):</span>
            <button
              type="button"
              onClick={handleRemoveRow}
              disabled={rowCount <= 1}
              className="px-2.5 py-1 rounded-lg border border-white/20 bg-white/5 hover:bg-white/10 text-white disabled:opacity-40 cursor-pointer"
            >
              - Строка
            </button>
            <button
              type="button"
              onClick={handleAddRow}
              disabled={rowCount >= 12}
              className="px-2.5 py-1 rounded-lg border border-white/20 bg-white/5 hover:bg-white/10 text-white disabled:opacity-40 cursor-pointer"
            >
              + Строка
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-white/80 font-medium mr-1">Выравнивание:</span>
            <button
              type="button"
              title="По левому краю"
              onClick={() => setAlign("left")}
              className={`p-1.5 rounded-lg border transition cursor-pointer ${
                align === "left"
                  ? "border-[#E7C768] bg-[#E7C768]/20 text-[#F4EE8E]"
                  : "border-white/15 bg-white/5 text-white/70 hover:text-white"
              }`}
            >
              <AlignLeft className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              title="По центру"
              onClick={() => setAlign("center")}
              className={`p-1.5 rounded-lg border transition cursor-pointer ${
                align === "center"
                  ? "border-[#E7C768] bg-[#E7C768]/20 text-[#F4EE8E]"
                  : "border-white/15 bg-white/5 text-white/70 hover:text-white"
              }`}
            >
              <AlignCenter className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              title="По правому краю"
              onClick={() => setAlign("right")}
              className={`p-1.5 rounded-lg border transition cursor-pointer ${
                align === "right"
                  ? "border-[#E7C768] bg-[#E7C768]/20 text-[#F4EE8E]"
                  : "border-white/15 bg-white/5 text-white/70 hover:text-white"
              }`}
            >
              <AlignRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Matrix Grid Inputs */}
        <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
          <div className="text-xs font-semibold text-white/80">Заголовки и ячейки таблицы:</div>
          <div className="overflow-x-auto rounded-2xl border border-white/20 bg-transparent backdrop-blur-md p-3">
            <table className="w-full text-xs text-white border-collapse">
              <thead>
                <tr>
                  <th className="p-1 text-slate-400 font-normal w-8 text-center">№</th>
                  {headers.map((h, cIdx) => (
                    <th key={`head-${cIdx}`} className="p-1 min-w-[120px]">
                      <input
                        type="text"
                        value={h}
                        onChange={(e) => updateHeader(cIdx, e.target.value)}
                        placeholder={`Заголовок ${cIdx + 1}`}
                        className="w-full px-2.5 py-1.5 rounded-xl border border-[#E7C768]/40 bg-white/10 text-white font-bold text-xs focus:outline-none focus:border-[#E7C768]"
                      />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((rowCells, rIdx) => (
                  <tr key={`row-${rIdx}`} className="border-t border-white/10">
                    <td className="p-1 text-slate-400 text-center text-[11px]">{rIdx + 1}</td>
                    {rowCells.map((val, cIdx) => (
                      <td key={`cell-${rIdx}-${cIdx}`} className="p-1 min-w-[120px]">
                        <input
                          type="text"
                          value={val}
                          onChange={(e) => updateCell(rIdx, cIdx, e.target.value)}
                          placeholder="Данные..."
                          className="w-full px-2.5 py-1.5 rounded-xl border border-white/15 bg-white/5 text-white text-xs focus:outline-none focus:border-[#E7C768]/70"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Live Preview */}
        <div className="space-y-1.5">
          <div className="text-xs font-medium text-white/70">Предпросмотр таблицы:</div>
          <div className="overflow-x-auto rounded-2xl border border-white/20 bg-white/5 backdrop-blur-md p-3 max-h-40 overflow-y-auto">
            <table className="w-full text-xs text-slate-100">
              <thead className="border-b border-white/20">
                <tr>
                  {headers.map((h, i) => (
                    <th
                      key={i}
                      className={`px-3 py-2 font-bold text-[#F4EE8E] ${
                        align === "center"
                          ? "text-center"
                          : align === "right"
                          ? "text-right"
                          : "text-left"
                      }`}
                    >
                      {h || "—"}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((rowCells, rIdx) => (
                  <tr key={rIdx} className="border-b border-white/10 hover:bg-white/5">
                    {rowCells.map((val, cIdx) => (
                      <td
                        key={cIdx}
                        className={`px-3 py-2 ${
                          align === "center"
                            ? "text-center"
                            : align === "right"
                            ? "text-right"
                            : "text-left"
                        }`}
                      >
                        {val || "—"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-2 pt-3 border-t border-white/10">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-medium text-white/80 hover:text-white hover:bg-white/5 transition cursor-pointer"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={handleInsert}
            className="px-5 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] text-[#17344F] shadow-lg hover:brightness-105 transition cursor-pointer"
          >
            Вставить таблицу в материал
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(modalContent, document.body) : modalContent;
}

