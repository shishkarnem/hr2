import React, { useState, useRef, useEffect } from "react";
import {
  Bold,
  Italic,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Code,
  Link2,
  Table as TableIcon,
  Image as ImageIcon,
  Video as VideoIcon,
  FileText,
  Sparkles,
  Maximize2,
  Minimize2,
  Eye,
  Pencil,
  Save,
  Check,
  RefreshCw,
  Upload,
  BookOpen,
  HelpCircle,
  X,
  ExternalLink,
} from "lucide-react";
import { RichTrainingMaterialCard } from "@/components/RichTrainingMarkdown";
import { resolveActiveEmployerId } from "@/lib/actorSession";
import {
  ImageConstructorModal,
  VideoConstructorModal,
  DocumentConstructorModal,
  LinkConstructorModal,
  TableConstructorModal,
} from "@/components/TrainingContentModals";
import { GetDoc } from "@/components/GetDoc";
import { useAIWait } from "@/components/AIWaitProvider";
import { toast } from "sonner";
import { getUploadService } from "@/services/FileUploadService";
import InteractiveLandingBackground from "@/components/InteractiveLandingBackground";
import { buildThemeCss, hexToRgba } from "@/components/LandingStyleEditor";

export interface ArticleConstructorProps {
  /** Post or subpage title */
  title: string;
  onTitleChange?: (title: string) => void;
  /** Markdown content */
  content: string;
  onChange: (content: string) => void;
  /** Optional cover image URL */
  coverUrl?: string;
  onCoverChange?: (coverUrl: string) => void;
  /** Optional publish toggle */
  isPublished?: boolean;
  onPublishedChange?: (published: boolean) => void;
  /** Save button handler */
  onSave?: () => Promise<void> | void;
  saving?: boolean;
  /** Custom UI toggles */
  hideTitle?: boolean;
  hideCover?: boolean;
  hidePublishToggle?: boolean;
  /** Optional ID or context */
  ownerId?: string;
  projectId?: string;
  /** Header & footer extensions */
  extraHeaderActions?: React.ReactNode;
  extraFooterActions?: React.ReactNode;
  /** Placeholder for text editor */
  placeholder?: string;
  /** Optional custom preview handler (e.g. switch to candidate training preview) */
  onPreview?: () => void;
  /** Optional company style theme */
  theme?: any;
}

export default function ArticleConstructor({
  title,
  onTitleChange,
  content,
  onChange,
  coverUrl,
  onCoverChange,
  isPublished = false,
  onPublishedChange,
  onSave,
  saving = false,
  hideTitle = false,
  hideCover = false,
  hidePublishToggle = false,
  ownerId = "100007",
  projectId,
  extraHeaderActions,
  extraFooterActions,
  placeholder = "Введите текст статьи или материала в Markdown…",
  onPreview,
  theme,
}: ArticleConstructorProps) {
  const [activeTab, setActiveTab] = useState<"editor" | "preview">("editor");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showGetDoc, setShowGetDoc] = useState(false);
  const [getDocRawText, setGetDocRawText] = useState("");
  const [uploadingCover, setUploadingCover] = useState(false);
  const [isImprovingAI, setIsImprovingAI] = useState(false);

  // Modals state
  const [modalImageOpen, setModalImageOpen] = useState(false);
  const [modalVideoOpen, setModalVideoOpen] = useState(false);
  const [modalDocOpen, setModalDocOpen] = useState(false);
  const [modalLinkOpen, setModalLinkOpen] = useState(false);
  const [modalTableOpen, setModalTableOpen] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const coverFileInputRef = useRef<HTMLInputElement | null>(null);
  const aiWait = useAIWait();

  // Escape key for fullscreen
  useEffect(() => {
    if (!isFullscreen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setIsFullscreen(false);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isFullscreen]);

  // Insert markdown snippet at current cursor or end
  const insertSnippet = (snippet: string) => {
    const ta = textareaRef.current;
    if (!ta) {
      onChange(content ? `${content}\n\n${snippet}` : snippet);
      return;
    }
    const start = ta.selectionStart ?? content.length;
    const end = ta.selectionEnd ?? content.length;
    const before = content.slice(0, start);
    const after = content.slice(end);
    const next = `${before}${snippet}${after}`;
    onChange(next);
    requestAnimationFrame(() => {
      ta.focus();
      const pos = start + snippet.length;
      ta.setSelectionRange(pos, pos);
    });
  };

  // Wrap selection with markdown tags (e.g. **bold**)
  const wrapSelection = (prefix: string, suffix: string = prefix, placeholderText: string = "") => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart ?? 0;
    const end = ta.selectionEnd ?? 0;
    const before = content.slice(0, start);
    const selected = content.slice(start, end) || placeholderText;
    const after = content.slice(end);
    const next = `${before}${prefix}${selected}${suffix}${after}`;
    onChange(next);
    requestAnimationFrame(() => {
      ta.focus();
      const pos = before.length + prefix.length;
      ta.setSelectionRange(pos, pos + selected.length);
    });
  };

  // Prefix selected lines with list/quote marker
  const applyLinePrefix = (prefix: string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart ?? 0;
    const end = ta.selectionEnd ?? 0;
    const lineStart = content.lastIndexOf("\n", start - 1) + 1;
    const lineEnd = content.indexOf("\n", end);
    const realEnd = lineEnd === -1 ? content.length : lineEnd;
    const segment = content.slice(lineStart, realEnd);
    const modified = segment
      .split("\n")
      .map((l) => (l.startsWith(prefix) ? l : `${prefix}${l}`))
      .join("\n");
    const next = `${content.slice(0, lineStart)}${modified}${content.slice(realEnd)}`;
    onChange(next);
    requestAnimationFrame(() => ta.focus());
  };

  // Upload cover image
  const handleCoverUpload = async (file: File) => {
    if (!file) return;
    setUploadingCover(true);
    try {
      const uploadService = getUploadService();
      const url = await uploadService.uploadFromFile(file, {
        owner_id: ownerId,
      });
      if (onCoverChange && url) {
        onCoverChange(url);
        toast.success("Обложка успешно загружена");
      }
    } catch (err: any) {
      console.error("[ArticleConstructor] Cover upload error:", err);
      toast.error(err?.message || "Ошибка загрузки обложки");
    } finally {
      setUploadingCover(false);
    }
  };

  // AI text improvement
  const handleImproveContent = async () => {
    if (!content.trim()) {
      toast.error("Сначала добавьте текст для улучшения");
      return;
    }
    setIsImprovingAI(true);
    try {
      const result = await aiWait.run({
        title: "ИИ улучшает и структурирует статью по правилам оформления",
        task: async () => {
          const res = await fetch("/api/ai-enhance", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              field: "training_material",
              mode: "training_material",
              value: content,
              employer_id: resolveActiveEmployerId({ employer_id: ownerId }),
              employer_public_id: resolveActiveEmployerId({ employer_id: ownerId }),
              project_id: projectId,
            }),
          });
          if (!res.ok) throw new Error(`Ошибка сервера: ${res.status}`);
          const data = await res.json();
          return data.value || data.text || content;
        },
      });

      if (result && result.trim()) {
        onChange(result.trim());
        toast.success("Текст статьи успешно улучшен и отформатирован ИИ!");
      }
    } catch (err: any) {
      console.error("[ArticleConstructor] AI Enhance error:", err);
      toast.error(err?.message || "Не удалось улучшить текст");
    } finally {
      setIsImprovingAI(false);
    }
  };

  return (
    <div
      className={`rounded-3xl border border-white/20 bg-transparent backdrop-blur-xl transition-all shadow-2xl ${
        isFullscreen
          ? "fixed inset-2 md:inset-4 z-50 flex flex-col p-4 md:p-6 overflow-y-auto"
          : "p-4 md:p-6 space-y-4"
      }`}
    >
      {/* Top Header & Tab Controls */}
      <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-4 flex-wrap">
        <div className="flex items-center gap-2">
          {/* Mode Switcher Tabs */}
          <div className="flex items-center p-1 rounded-2xl border border-white/15 bg-white/5 backdrop-blur-md">
            <button
              type="button"
              onClick={() => setActiveTab("editor")}
              className={`px-3.5 py-1.5 rounded-xl text-sm font-bold flex items-center gap-2 transition cursor-pointer ${
                activeTab === "editor"
                  ? "bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] text-[#17344F] shadow-md"
                  : "text-slate-300 hover:text-white"
              }`}
            >
              <Pencil className="w-4 h-4" />
              <span>Конструктор статьи</span>
            </button>

            <button
              type="button"
              onClick={() => {
                if (onPreview) {
                  onPreview();
                } else {
                  setActiveTab("preview");
                }
              }}
              className={`px-3.5 py-1.5 rounded-xl text-sm font-bold flex items-center gap-2 transition cursor-pointer ${
                activeTab === "preview"
                  ? "bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] text-[#17344F] shadow-md"
                  : "text-slate-300 hover:text-white"
              }`}
            >
              <Eye className="w-4 h-4" />
              <span>Предпросмотр</span>
            </button>
          </div>

          <span className="hidden sm:inline text-xs text-slate-400">
            {content.length} симв. • ~{Math.max(1, Math.ceil(content.split(/\s+/).filter(Boolean).length / 180))} мин. чтения
          </span>
        </div>

        {/* Header Right Actions */}
        <div className="flex items-center gap-2">
          {extraHeaderActions}

          <button
            type="button"
            onClick={() => setIsFullscreen(!isFullscreen)}
            title={isFullscreen ? "Свернуть окно" : "Развернуть во весь экран"}
            className="p-2 rounded-xl border border-white/15 bg-transparent hover:bg-white/10 text-white transition flex items-center gap-1.5 text-sm cursor-pointer"
          >
            {isFullscreen ? (
              <>
                <Minimize2 className="w-4 h-4 text-[#E7C768]" />
                <span className="hidden md:inline">Свернуть</span>
              </>
            ) : (
              <>
                <Maximize2 className="w-4 h-4 text-[#E7C768]" />
                <span className="hidden md:inline">Во весь экран</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Title Field (optional) */}
      {!hideTitle && onTitleChange && (
        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-white/90">
            Заголовок статьи или материала
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            placeholder="Например: Пошаговый алгоритм работы с ключевыми клиентами"
            className="w-full px-4 py-2.5 rounded-2xl border border-white/20 bg-transparent backdrop-blur-md text-white placeholder:text-white/40 focus:outline-none focus:border-[#E7C768] text-base font-semibold leading-normal"
          />
        </div>
      )}

      {/* Cover Image Block (optional) */}
      {!hideCover && (
        <div className="rounded-2xl border border-white/15 bg-white/5 backdrop-blur-md p-3.5 space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <label className="text-sm font-semibold text-white/90 flex items-center gap-2">
              <ImageIcon className="w-4 h-4 text-[#E7C768]" />
              <span>Главная обложка статьи</span>
            </label>
            {coverUrl && onCoverChange && (
              <button
                type="button"
                onClick={() => onCoverChange("")}
                className="text-xs text-slate-300 hover:text-white underline cursor-pointer"
              >
                Удалить обложку
              </button>
            )}
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {coverUrl ? (
              <div className="w-28 h-16 rounded-xl overflow-hidden border border-white/20 bg-black/30 shrink-0">
                <img src={coverUrl} alt="Обложка" className="w-full h-full object-cover" />
              </div>
            ) : (
              <div className="w-28 h-16 rounded-xl border border-dashed border-white/25 flex items-center justify-center text-slate-400 shrink-0">
                <ImageIcon className="w-6 h-6 opacity-40 text-[#E7C768]" />
              </div>
            )}

            <div className="flex-1 min-w-[200px] flex items-center gap-2">
              <input
                type="text"
                value={coverUrl || ""}
                onChange={(e) => onCoverChange && onCoverChange(e.target.value)}
                placeholder="Вставьте ссылку на изображение или загрузите файл"
                className="flex-1 px-3 py-2 rounded-xl border border-white/15 bg-transparent text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-[#E7C768]"
              />

              <input
                ref={coverFileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleCoverUpload(file);
                }}
              />

              <button
                type="button"
                onClick={() => coverFileInputRef.current?.click()}
                disabled={uploadingCover}
                className="px-3.5 py-2 rounded-xl border border-[#E7C768]/60 bg-transparent hover:bg-white/10 text-white text-sm font-semibold flex items-center gap-1.5 transition disabled:opacity-50 cursor-pointer"
              >
                {uploadingCover ? (
                  <RefreshCw className="w-4 h-4 animate-spin text-[#E7C768]" />
                ) : (
                  <Upload className="w-4 h-4 text-[#E7C768]" />
                )}
                <span>Загрузить</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 1: Visual Editor & Toolbar */}
      {activeTab === "editor" && (
        <div className={`space-y-3 ${isFullscreen ? "flex-1 flex flex-col" : ""}`}>
          {/* Main Formatting Toolbar */}
          <div className="flex items-center justify-between gap-2 p-2 rounded-2xl border border-white/15 bg-white/5 backdrop-blur-md flex-wrap">
            {/* Left formatting buttons */}
            <div className="flex items-center gap-1 flex-wrap">
              <button
                type="button"
                onClick={() => wrapSelection("**", "**", "жирный текст")}
                title="Жирный шрифт"
                className="p-2 rounded-xl hover:bg-white/10 text-white transition cursor-pointer"
              >
                <Bold className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => wrapSelection("*", "*", "курсив")}
                title="Курсив"
                className="p-2 rounded-xl hover:bg-white/10 text-white transition cursor-pointer"
              >
                <Italic className="w-4 h-4" />
              </button>

              <span className="w-px h-5 bg-white/15 mx-1" />

              <button
                type="button"
                onClick={() => wrapSelection("## ", "\n", "Заголовок 2")}
                title="Заголовок H2"
                className="p-2 rounded-xl hover:bg-white/10 text-white transition cursor-pointer"
              >
                <Heading1 className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => wrapSelection("### ", "\n", "Подзаголовок 3")}
                title="Подзаголовок H3"
                className="p-2 rounded-xl hover:bg-white/10 text-white transition cursor-pointer"
              >
                <Heading2 className="w-4 h-4" />
              </button>

              <span className="w-px h-5 bg-white/15 mx-1" />

              <button
                type="button"
                onClick={() => applyLinePrefix("- ")}
                title="Маркированный список"
                className="p-2 rounded-xl hover:bg-white/10 text-white transition cursor-pointer"
              >
                <List className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => applyLinePrefix("1. ")}
                title="Нумерованный список"
                className="p-2 rounded-xl hover:bg-white/10 text-white transition cursor-pointer"
              >
                <ListOrdered className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => applyLinePrefix("> ")}
                title="Цитата / Важная мысль"
                className="p-2 rounded-xl hover:bg-white/10 text-white transition cursor-pointer"
              >
                <Quote className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => wrapSelection("`", "`", "код")}
                title="Код / Выделение"
                className="p-2 rounded-xl hover:bg-white/10 text-white transition cursor-pointer"
              >
                <Code className="w-4 h-4" />
              </button>

              <span className="w-px h-5 bg-white/15 mx-1" />

              {/* Rich Modals Buttons */}
              <button
                type="button"
                onClick={() => setModalImageOpen(true)}
                title="Вставить картинку или карусель изображений"
                className="p-2 rounded-xl hover:bg-white/10 text-[#E7C768] hover:text-white transition flex items-center gap-1.5 cursor-pointer text-xs font-semibold"
              >
                <ImageIcon className="w-4 h-4 text-[#E7C768]" />
                <span className="hidden sm:inline">Картинка/Карусель</span>
              </button>

              <button
                type="button"
                onClick={() => setModalVideoOpen(true)}
                title="Вставить видео (YouTube, RuTube, VK, прямое MP4)"
                className="p-2 rounded-xl hover:bg-white/10 text-[#E7C768] hover:text-white transition flex items-center gap-1.5 cursor-pointer text-xs font-semibold"
              >
                <VideoIcon className="w-4 h-4 text-[#E7C768]" />
                <span className="hidden sm:inline">Видео</span>
              </button>

              <button
                type="button"
                onClick={() => setModalDocOpen(true)}
                title="Встроить документ (PDF, DOCX, Google Docs, сайт)"
                className="p-2 rounded-xl hover:bg-white/10 text-[#E7C768] hover:text-white transition flex items-center gap-1.5 cursor-pointer text-xs font-semibold"
              >
                <FileText className="w-4 h-4 text-[#E7C768]" />
                <span className="hidden sm:inline">Документ/Фрейм</span>
              </button>

              <button
                type="button"
                onClick={() => setModalLinkOpen(true)}
                title="Вставить ссылку или кнопку перехода"
                className="p-2 rounded-xl hover:bg-white/10 text-[#E7C768] hover:text-white transition flex items-center gap-1.5 cursor-pointer text-xs font-semibold"
              >
                <Link2 className="w-4 h-4 text-[#E7C768]" />
                <span className="hidden sm:inline">Ссылка/Кнопка</span>
              </button>

              <button
                type="button"
                onClick={() => setModalTableOpen(true)}
                title="Конструктор таблицы"
                className="p-2 rounded-xl hover:bg-white/10 text-[#E7C768] hover:text-white transition flex items-center gap-1.5 cursor-pointer text-xs font-semibold"
              >
                <TableIcon className="w-4 h-4 text-[#E7C768]" />
                <span className="hidden sm:inline">Таблица</span>
              </button>
            </div>

            {/* Right toolbar action: AI Assistant & Document Recognizer */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowGetDoc(!showGetDoc)}
                className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                  showGetDoc
                    ? "border-[#E7C768] bg-[#E7C768]/15 text-[#E7C768]"
                    : "border-white/20 bg-transparent text-white hover:bg-white/5"
                }`}
              >
                <FileText className="w-3.5 h-3.5 text-[#E7C768]" />
                <span>Распознать документ</span>
              </button>

              <button
                type="button"
                onClick={handleImproveContent}
                disabled={isImprovingAI || !content.trim()}
                className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] text-[#17344F] text-xs font-bold flex items-center gap-1.5 shadow-md hover:brightness-105 active:scale-95 transition disabled:opacity-50 cursor-pointer"
              >
                {isImprovingAI ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#17344F]" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5 text-[#17344F]" />
                )}
                <span>Улучшить текст ИИ</span>
              </button>
            </div>
          </div>

          {/* Collapsible GetDoc Document Recognizer */}
          {showGetDoc && (
            <div className="border border-white/20 rounded-2xl p-4 bg-white/5 backdrop-blur-md">
              <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-3">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-[#E7C768]" />
                  <span className="text-sm font-bold text-white">
                    Загрузка и оптическое распознавание документов
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowGetDoc(false)}
                  className="text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <GetDoc
                entity="training"
                demoUserId={ownerId}
                rawText={getDocRawText}
                onRawTextChange={setGetDocRawText}
                onAppendText={(recognized) => insertSnippet(`\n\n${recognized}\n`)}
                compact
              />
            </div>
          )}

          {/* Text Area */}
          <div className={`relative ${isFullscreen ? "flex-1 flex flex-col" : ""}`}>
            <textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => onChange(e.target.value)}
              placeholder={placeholder}
              rows={isFullscreen ? 25 : 18}
              className={`w-full p-4 rounded-2xl border border-white/20 bg-transparent backdrop-blur-md text-white placeholder:text-white/40 focus:outline-none focus:border-[#E7C768] text-sm md:text-base leading-relaxed font-sans resize-y ${
                isFullscreen ? "flex-1" : ""
              }`}
            />
          </div>
        </div>
      )}

      {/* TAB 2: Live Candidate/Reader Preview */}
      {activeTab === "preview" && (
        <div className="space-y-4">
          <div className="p-3.5 sm:p-4 rounded-2xl border border-white/15 bg-white/5 backdrop-blur-md flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h3 className="text-sm sm:text-base font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">
                Интерактивный предпоказ страницы
              </h3>
              <p className="text-xs sm:text-sm text-slate-300">
                Именно так статья или учебный материал отображается для читателей блога и соискателей в корпоративном стиле.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActiveTab("editor")}
              className="px-3.5 py-1.5 rounded-xl border border-white/20 bg-transparent hover:bg-white/5 text-xs sm:text-sm font-bold text-white flex items-center gap-2 transition cursor-pointer"
            >
              <Pencil className="w-3.5 h-3.5 text-[#E7C768]" />
              <span>Вернуться к редактору</span>
            </button>
          </div>

          {/* Full Simulated Candidate Canvas */}
          <div
            id="company-landing-root"
            className="company-landing-root training-preview-root candidate-training-root relative min-h-[500px] px-[2%] py-3.5 sm:px-5 sm:py-5 md:p-8 space-y-4 sm:space-y-6 text-left transition-colors w-full max-w-full overflow-hidden rounded-3xl border border-white/20"
            style={{
              backgroundColor: theme?.pageBgColor || "#000000",
              color: theme?.bodyTextColor || "#FFFFFF",
              fontFamily: theme?.fontFamily || undefined,
            }}
          >
            {theme && <style>{buildThemeCss(theme)}</style>}

            <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
              {theme?.pageBgImageUrl && (
                <div
                  className="absolute inset-0 bg-cover bg-center"
                  style={{
                    backgroundImage: `url(${theme.pageBgImageUrl})`,
                    filter:
                      theme?.allMediaMonochrome || theme?.sitePreviewMonochrome
                        ? "grayscale(100%)"
                        : undefined,
                  }}
                />
              )}
              <InteractiveLandingBackground
                containerMode
                showBadges={false}
                showSphere={Boolean(theme?.showSphereAnimation ?? (theme as any)?.showSphere)}
                showWaves={(theme?.showWaveAnimation ?? (theme as any)?.showWaves) !== false}
                themeColors={{
                  headingColor: theme?.headingsSolidColor || "#FFFFFF",
                  bodyTextColor: theme?.bodyTextColor || "#FFFFFF",
                  boldTextColor: theme?.boldTextColor || "#FFFFFF",
                  iconColor: theme?.iconColor || "#FFFFFF",
                  headingsColorMode: theme?.headingsColorMode || "solid",
                  isMonochrome: Boolean(
                    theme?.allMediaMonochrome ||
                    theme?.sitePreviewMonochrome ||
                    (theme?.headingsSolidColor === "#FFFFFF" && theme?.pageBgColor === "#000000")
                  ),
                }}
              />
              {theme?.pageBgFilterOpacity ? (
                <div
                  className="absolute inset-0"
                  style={{
                    backgroundColor: hexToRgba(
                      theme.pageBgFilterColor || "#000000",
                      theme.pageBgFilterOpacity
                    ),
                  }}
                />
              ) : null}
            </div>

            <div className="relative z-10 w-full space-y-4">
              <RichTrainingMaterialCard title={title || "Статья без названия"} theme={theme}>
                {content || "Текст статьи пока пуст. Вернитесь в конструктор для заполнения."}
              </RichTrainingMaterialCard>
            </div>
          </div>
        </div>
      )}

      {/* Footer Actions */}
      <div className="flex items-center justify-between gap-3 pt-4 border-t border-white/10 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          {!hidePublishToggle && onPublishedChange && (
            <label className="flex items-center gap-2 text-sm text-white select-none cursor-pointer">
              <input
                type="checkbox"
                checked={isPublished}
                onChange={(e) => onPublishedChange(e.target.checked)}
                className="w-4 h-4 rounded accent-[#E7C768] cursor-pointer"
              />
              <span>Опубликовано (доступно читателям в блоге)</span>
            </label>
          )}

          {extraFooterActions}
        </div>

        <div className="flex items-center gap-3">
          {onSave && (
            <button
              type="button"
              onClick={onSave}
              disabled={saving}
              className="px-6 py-2.5 rounded-2xl bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] text-[#17344F] text-sm font-bold flex items-center gap-2 shadow-lg hover:brightness-105 active:scale-95 transition disabled:opacity-50 cursor-pointer"
            >
              {saving ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-[#17344F]" />
                  <span>Сохранение…</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 text-[#17344F]" />
                  <span>Сохранить статью</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Modals */}
      <ImageConstructorModal
        isOpen={modalImageOpen}
        onClose={() => setModalImageOpen(false)}
        onInsert={(md) => insertSnippet(`\n\n${md}\n\n`)}
        ownerId={ownerId}
      />

      <VideoConstructorModal
        isOpen={modalVideoOpen}
        onClose={() => setModalVideoOpen(false)}
        onInsert={(md) => insertSnippet(`\n\n${md}\n\n`)}
        ownerId={ownerId}
      />

      <DocumentConstructorModal
        isOpen={modalDocOpen}
        onClose={() => setModalDocOpen(false)}
        onInsert={(md) => insertSnippet(`\n\n${md}\n\n`)}
        ownerId={ownerId}
      />

      <LinkConstructorModal
        isOpen={modalLinkOpen}
        onClose={() => setModalLinkOpen(false)}
        onInsert={(md) => insertSnippet(`\n\n${md}\n\n`)}
        theme={theme}
      />

      <TableConstructorModal
        isOpen={modalTableOpen}
        onClose={() => setModalTableOpen(false)}
        onInsert={(md) => insertSnippet(`\n\n${md}\n\n`)}
      />
    </div>
  );
}
