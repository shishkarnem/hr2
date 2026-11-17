import React, { useState } from "react";
import { motion } from "motion/react";
import { Maximize2, X, Camera, Paperclip, Loader2 } from "lucide-react";
import MiniAudioField from "../MiniAudioField";
import RichMarkdown from "../RichMarkdown";
import { AssistantType, ChatMessage } from "./types";

interface AssistantCollapsedCardProps {
  assistantType: AssistantType;
  companyName?: string;
  isEmployer: boolean;
  isPublicPageWithBottomNav: boolean;
  lastUserMsg?: ChatMessage;
  lastAssistantMsg?: ChatMessage;
  isTyping: boolean;
  waitingSeconds: number;
  screenshotUploadProgress: number | null;
  screenshotStatusText: string;
  fileUploadProgress: number | null;
  fileStatusText: string;
  screenshotUrl: string | null;
  attachedFile: { url: string; name: string; size?: number; type?: string } | null;
  inputValue: string;
  setInputValue: (val: string) => void;
  sphereColor: string;
  isCapturingScreenshot: boolean;
  onExpand: () => void;
  onClose: () => void;
  onSend: (text: string) => void;
  onTakeScreenshot: () => void;
  onOpenFilePicker: () => void;
  onRemoveScreenshot: () => void;
  onRemoveFile: () => void;
}

export default function AssistantCollapsedCard({
  assistantType,
  companyName,
  isEmployer,
  isPublicPageWithBottomNav,
  lastUserMsg,
  lastAssistantMsg,
  isTyping,
  waitingSeconds,
  screenshotUploadProgress,
  screenshotStatusText,
  fileUploadProgress,
  fileStatusText,
  screenshotUrl,
  attachedFile,
  inputValue,
  setInputValue,
  sphereColor,
  isCapturingScreenshot,
  onExpand,
  onClose,
  onSend,
  onTakeScreenshot,
  onOpenFilePicker,
  onRemoveScreenshot,
  onRemoveFile,
}: AssistantCollapsedCardProps) {
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

  const isImageFile = (url?: string, name?: string, mime?: string) => {
    if (mime?.startsWith("image/")) return true;
    const str = (name || url || "").toLowerCase();
    return /\.(png|jpe?g|webp|svg|gif|bmp)(\?.*)?$/i.test(str) || Boolean(url && url.includes("/tgf/"));
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 16, scale: 0.95 }}
      transition={{ duration: 0.2 }}
      className={`fixed ${
        isEmployer
          ? "bottom-22 right-4 md:right-6"
          : isPublicPageWithBottomNav
          ? "bottom-36 left-4 md:bottom-22 md:left-6"
          : "bottom-22 left-4 md:left-6"
      } z-50 w-[94vw] max-w-[480px] bg-transparent border-0 border-transparent shadow-none p-0 flex flex-col gap-3 text-white text-left`}
    >
      {/* Top controls floating in air */}
      <div className="flex items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[#E7C768] animate-pulse"></span>
          <span className="text-[14px] font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">
            {assistantType === "employer_promax"
              ? "RR ProMax Копилот"
              : assistantType === "vacancy_company"
              ? `Рекрутер «${companyName || "Компания"}»`
              : "ИИ-Ассистент RR"}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onExpand}
            className="p-1.5 rounded-xl border border-white/20 bg-transparent backdrop-blur-md text-slate-300 hover:text-white transition cursor-pointer"
            title="Развернуть"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl border border-white/20 bg-transparent backdrop-blur-md text-slate-300 hover:text-white transition cursor-pointer"
            title="Скрыть"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Latest user message (if any) */}
      {lastUserMsg && (
        <div className="bg-transparent border border-[#E7C768]/50 backdrop-blur-md rounded-2xl p-2.5 text-[14px] text-white">
          <div className="text-[14px] text-[#E7C768] font-bold mb-1">Вы:</div>
          {lastUserMsg.screenshotUrl && (
            <div
              onClick={() => setPreviewImageUrl(lastUserMsg.screenshotUrl!)}
              className="relative group inline-block cursor-pointer overflow-hidden rounded-lg border border-white/20 hover:border-[#E7C768] mb-1.5 transition"
              title="Нажмите для полноразмерного просмотра"
            >
              <img
                src={lastUserMsg.screenshotUrl}
                alt="Скриншот"
                className="w-24 h-16 object-cover"
              />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-[12px] text-white font-medium transition">
                <Maximize2 className="w-3.5 h-3.5 text-[#E7C768] mr-1" /> Смотреть
              </div>
            </div>
          )}
          {lastUserMsg.fileUrl && (
            <div className="mb-1.5">
              {isImageFile(lastUserMsg.fileUrl, lastUserMsg.fileName) ? (
                <div
                  onClick={() => setPreviewImageUrl(lastUserMsg.fileUrl!)}
                  className="relative group inline-flex items-center gap-2 cursor-pointer overflow-hidden rounded-lg border border-white/20 hover:border-[#E7C768] p-1 transition"
                  title="Нажмите для полноразмерного просмотра"
                >
                  <img
                    src={lastUserMsg.fileUrl}
                    alt={lastUserMsg.fileName || "Файл"}
                    className="w-16 h-12 object-cover rounded"
                  />
                  <div className="text-left pr-2">
                    <div className="text-[14px] text-[#F4EE8E] font-mono truncate max-w-[150px]">
                      {lastUserMsg.fileName || "Изображение"}
                    </div>
                    <div className="text-[14px] text-slate-300 flex items-center gap-1 font-mono">
                      <Maximize2 className="w-3 h-3 text-[#E7C768]" /> Увеличить
                    </div>
                  </div>
                </div>
              ) : (
                <a
                  href={lastUserMsg.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-white/20 bg-transparent text-[14px] text-white hover:border-[#E7C768] transition"
                >
                  <Paperclip className="w-3.5 h-3.5 text-[#E7C768]" />
                  <span className="font-mono underline truncate max-w-[200px]">{lastUserMsg.fileName || "Файл"}</span>
                </a>
              )}
            </div>
          )}
          <div className="line-clamp-2">{lastUserMsg.text}</div>
        </div>
      )}

      {/* Latest AI reply */}
      {lastAssistantMsg && (
        <div className="bg-transparent border border-white/20 backdrop-blur-md rounded-2xl p-3 text-[14px] text-white max-h-48 overflow-y-auto">
          <div className="text-[14px] text-slate-300 font-bold mb-1">Ассистент:</div>
          <RichMarkdown tone="chat">{lastAssistantMsg.text}</RichMarkdown>
        </div>
      )}

      {/* Live Waiting Timer in collapsed mode */}
      {isTyping && (
        <div className="p-2.5 rounded-xl border border-white/20 bg-transparent backdrop-blur-xl flex items-center justify-between text-[14px] text-slate-200 shadow-md">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#E7C768] animate-bounce"></span>
            <span className="w-2 h-2 rounded-full bg-[#E7C768] animate-bounce delay-100"></span>
            <span className="w-2 h-2 rounded-full bg-[#E7C768] animate-bounce delay-200"></span>
            <span>Анализирую и формирую ответ</span>
          </div>
          <span className="font-mono text-[#E7C768] font-bold">{waitingSeconds} сек...</span>
        </div>
      )}

      {/* Screenshot upload progress */}
      {screenshotUploadProgress !== null && (
        <div className="p-2.5 rounded-xl border border-[#E7C768]/60 bg-transparent backdrop-blur-md space-y-1.5">
          <div className="flex items-center justify-between text-[14px] font-mono text-white">
            <span className="flex items-center gap-1.5 text-[#F4EE8E]">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-[#E7C768]" />
              <span>{screenshotStatusText || "Загрузка скриншота..."}</span>
            </span>
            <span className="text-[#E7C768] font-bold">{screenshotUploadProgress}%</span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-[#F4EE8E] to-[#E7C768] transition-all duration-200"
              style={{ width: `${screenshotUploadProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* File upload progress */}
      {fileUploadProgress !== null && (
        <div className="p-2.5 rounded-xl border border-[#E7C768]/60 bg-transparent backdrop-blur-md space-y-1.5">
          <div className="flex items-center justify-between text-[14px] font-mono text-white">
            <span className="flex items-center gap-1.5 text-[#F4EE8E]">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-[#E7C768]" />
              <span>{fileStatusText || "Загрузка файла..."}</span>
            </span>
            <span className="text-[#E7C768] font-bold">{fileUploadProgress}%</span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-[#F4EE8E] to-[#E7C768] transition-all duration-200"
              style={{ width: `${fileUploadProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* Screenshot attachment preview */}
      {screenshotUrl && (
        <div className="relative inline-flex items-center gap-2 p-2 rounded-xl border border-[#E7C768] bg-transparent backdrop-blur-md max-w-full">
          <div
            onClick={() => setPreviewImageUrl(screenshotUrl)}
            className="relative group shrink-0 cursor-pointer overflow-hidden rounded-md border border-white/20 hover:border-[#E7C768] transition"
            title="Открыть полный скриншот"
          >
            <img
              src={screenshotUrl}
              alt="Скриншот экрана"
              className="w-14 h-10 object-cover"
            />
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-[12px] text-white">
              <Maximize2 className="w-3.5 h-3.5 text-[#E7C768]" />
            </div>
          </div>
          <div className="text-[14px] text-white overflow-hidden pr-2">
            <div className="font-semibold text-[#F4EE8E]">Скриншот прикреплен</div>
            <div className="text-[14px] text-slate-300 font-mono truncate max-w-[180px]">Кликните для просмотра</div>
          </div>
          <button
            type="button"
            onClick={onRemoveScreenshot}
            className="p-1 hover:text-[#F4EE8E] text-slate-300 transition cursor-pointer shrink-0"
            title="Удалить скриншот"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Attached file chip */}
      {attachedFile && (
        <div className="relative inline-flex items-center gap-2 p-2 rounded-xl border border-[#E7C768] bg-transparent backdrop-blur-md max-w-full">
          {isImageFile(attachedFile.url, attachedFile.name, attachedFile.type) ? (
            <div
              onClick={() => setPreviewImageUrl(attachedFile.url)}
              className="relative group shrink-0 cursor-pointer overflow-hidden rounded-md border border-white/20 hover:border-[#E7C768] transition"
              title="Открыть предпросмотр"
            >
              <img
                src={attachedFile.url}
                alt={attachedFile.name}
                className="w-14 h-10 object-cover"
              />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-[12px] text-white">
                <Maximize2 className="w-3.5 h-3.5 text-[#E7C768]" />
              </div>
            </div>
          ) : (
            <div className="p-2 rounded-lg bg-white/10 text-[#E7C768] shrink-0">
              <Paperclip className="w-4 h-4" />
            </div>
          )}
          <div className="text-[14px] text-white overflow-hidden pr-2">
            <div className="font-semibold text-[#F4EE8E] truncate max-w-[180px]">{attachedFile.name}</div>
            <div className="text-[14px] text-slate-300 font-mono truncate max-w-[180px]">
              {isImageFile(attachedFile.url, attachedFile.name, attachedFile.type) ? "Кликните для просмотра" : "Документ прикреплен"}
            </div>
          </div>
          <button
            type="button"
            onClick={onRemoveFile}
            className="p-1 hover:text-[#F4EE8E] text-slate-300 transition cursor-pointer shrink-0"
            title="Удалить файл"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Input field with MiniAudioField */}
      <div className="relative">
        <MiniAudioField
          value={inputValue}
          onChange={setInputValue}
          placeholder="Задайте вопрос или команду..."
          onSubmit={() => onSend(inputValue)}
          submitButtonText="Отправить"
          isSubmitting={isTyping}
          sphereColor={sphereColor}
          extraAction={
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={onTakeScreenshot}
                disabled={isCapturingScreenshot}
                className="p-2 rounded-xl text-slate-300 hover:text-[#E7C768] border border-white/10 hover:border-[#E7C768]/50 transition cursor-pointer"
                title="Сделать скриншот страницы"
              >
                {isCapturingScreenshot ? (
                  <Loader2 className="w-4 h-4 animate-spin text-[#E7C768]" />
                ) : (
                  <Camera className="w-4 h-4" />
                )}
              </button>
              <button
                type="button"
                onClick={onOpenFilePicker}
                disabled={fileUploadProgress !== null}
                className="p-2 rounded-xl text-slate-300 hover:text-[#E7C768] border border-white/10 hover:border-[#E7C768]/50 transition cursor-pointer"
                title="Прикрепить файл (резюме, документ, фото)"
              >
                {fileUploadProgress !== null ? (
                  <Loader2 className="w-4 h-4 animate-spin text-[#E7C768]" />
                ) : (
                  <Paperclip className="w-4 h-4" />
                )}
              </button>
            </div>
          }
        />
      </div>

      {/* Fullscreen centered preview modal for images and screenshots */}
      {previewImageUrl && (
        <div
          className="fixed inset-0 z-[100] pointer-events-auto flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
          onClick={() => setPreviewImageUrl(null)}
        >
          <div
            className="relative max-w-4xl max-h-[90vh] p-3 rounded-2xl border border-[#E7C768]/60 bg-[#0d1b2a]/95 backdrop-blur-2xl flex flex-col items-center shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setPreviewImageUrl(null)}
              className="absolute top-3 right-3 p-2 rounded-xl bg-black/60 text-white hover:text-[#E7C768] border border-white/20 transition cursor-pointer z-10"
              title="Закрыть просмотр"
            >
              <X className="w-5 h-5" />
            </button>
            <img
              src={previewImageUrl}
              alt="Предпросмотр"
              className="max-w-full max-h-[75vh] object-contain rounded-xl border border-white/10"
            />
            <div className="mt-3 flex items-center justify-between w-full px-2 text-[14px] text-slate-300 font-mono">
              <span className="text-white">Просмотр изображения</span>
              <a
                href={previewImageUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#E7C768] hover:underline"
              >
                Открыть в новой вкладке
              </a>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}
