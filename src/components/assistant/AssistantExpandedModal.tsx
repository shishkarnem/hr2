import React, { useState } from "react";
import { motion } from "motion/react";
import {
  RotateCcw,
  Minimize2,
  Maximize2,
  X,
  Bot,
  ChevronUp,
  ChevronDown,
  Camera,
  Paperclip,
  Loader2
} from "lucide-react";
import NeuronSphereCanvas from "../NeuronSphereCanvas";
import AudioField from "../AudioField";
import MiniAudioField from "../MiniAudioField";
import Mascot from "../Mascot";
import RichMarkdown from "../RichMarkdown";
import { AssistantType, ChatMessage } from "./types";

interface AssistantExpandedModalProps {
  assistantType: AssistantType;
  companyName?: string;
  sphereColor: string;
  messages: ChatMessage[];
  lastUserMsg?: ChatMessage;
  lastAssistantMsg?: ChatMessage;
  previousMessagesCount: number;
  showFullHistory: boolean;
  setShowFullHistory: (val: boolean) => void;
  showVoiceRecorder: boolean;
  setShowVoiceRecorder: (val: boolean) => void;
  inputValue: string;
  setInputValue: (val: string) => void;
  isTyping: boolean;
  waitingSeconds: number;
  screenshotUploadProgress: number | null;
  screenshotStatusText: string;
  fileUploadProgress: number | null;
  fileStatusText: string;
  screenshotUrl: string | null;
  attachedFile: { url: string; name: string; size?: number; type?: string } | null;
  isCapturingScreenshot: boolean;
  onClearHistory: () => void;
  onCollapse: () => void;
  onClose: () => void;
  onSend: (text: string) => void;
  onTakeScreenshot: () => void;
  onOpenFilePicker: () => void;
  onRemoveScreenshot: () => void;
  onRemoveFile: () => void;
}

export default function AssistantExpandedModal({
  assistantType,
  companyName,
  sphereColor,
  messages,
  lastUserMsg,
  lastAssistantMsg,
  previousMessagesCount,
  showFullHistory,
  setShowFullHistory,
  showVoiceRecorder,
  setShowVoiceRecorder,
  inputValue,
  setInputValue,
  isTyping,
  waitingSeconds,
  screenshotUploadProgress,
  screenshotStatusText,
  fileUploadProgress,
  fileStatusText,
  screenshotUrl,
  attachedFile,
  isCapturingScreenshot,
  onClearHistory,
  onCollapse,
  onClose,
  onSend,
  onTakeScreenshot,
  onOpenFilePicker,
  onRemoveScreenshot,
  onRemoveFile,
}: AssistantExpandedModalProps) {
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

  const isImageFile = (url?: string, name?: string, mime?: string) => {
    if (mime?.startsWith("image/")) return true;
    const str = (name || url || "").toLowerCase();
    return /\.(png|jpe?g|webp|svg|gif|bmp)(\?.*)?$/i.test(str) || Boolean(url && url.includes("/tgf/"));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 pointer-events-none">
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.92, y: 20 }}
        transition={{ type: "spring", damping: 25, stiffness: 350 }}
        className="pointer-events-auto relative w-full max-w-2xl bg-transparent border-0 border-transparent shadow-none p-3 sm:p-5 flex flex-col items-center text-center overflow-y-auto max-h-[90vh] text-white space-y-4"
      >
        {/* Floating controls in top corners */}
        <div className="absolute top-2 right-2 flex items-center gap-2 z-20">
          <button
            type="button"
            onClick={onClearHistory}
            title="Очистить диалог"
            className="px-3 py-1.5 text-[14px] text-slate-300 hover:text-white border border-white/20 bg-transparent backdrop-blur-md rounded-xl transition cursor-pointer"
          >
            <RotateCcw className="w-4 h-4 inline mr-1 text-[#E7C768]" /> Сброс
          </button>
          <button
            type="button"
            onClick={onCollapse}
            title="Свернуть"
            className="p-2 text-slate-300 hover:text-white border border-white/20 bg-transparent backdrop-blur-md rounded-xl transition cursor-pointer"
          >
            <Minimize2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onClose}
            title="Закрыть"
            className="p-2 text-slate-300 hover:text-white border border-white/20 bg-transparent backdrop-blur-md rounded-xl transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Central Floating Neural Mesh Sphere with Mascot in Air */}
        <div className="relative my-2 flex items-center justify-center pointer-events-none">
          <div className="relative w-28 h-28 sm:w-32 sm:h-32 flex items-center justify-center">
            <NeuronSphereCanvas
              size={128}
              speed={isTyping ? 0.05 : 0.02}
              color={sphereColor}
            />
            <div className="absolute inset-0 flex items-center justify-center">
              <Mascot
                state="chat"
                size="sm"
                className="drop-shadow-[0_0_15px_rgba(231,199,104,0.7)]"
              />
            </div>
          </div>
        </div>

        {/* Title floating under sphere */}
        <div className="space-y-1">
          <h3 className="text-xl font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">
            {assistantType === "employer_promax"
              ? "RR ProMax Копилот"
              : assistantType === "vacancy_company"
              ? `Рекрутер «${companyName || "Компания"}»`
              : "ИИ-Ассистент Робот Рекрутер"}
          </h3>
        </div>

        {/* AudioField Voice Modal/Section if triggered */}
        {showVoiceRecorder && (
          <div className="w-full bg-transparent border border-[#E7C768]/40 rounded-3xl p-4 backdrop-blur-xl">
            <AudioField
              value={inputValue}
              onChange={setInputValue}
              placeholder="Говорите, нейросеть расшифрует ваш голос..."
              onSubmit={() => {
                if (inputValue.trim()) {
                  onSend(inputValue);
                  setShowVoiceRecorder(false);
                }
              }}
              submitButtonText="Отправить голос"
              isSubmitting={isTyping}
            />
          </div>
        )}

        {/* Messages */}
        <div className="w-full space-y-3 text-left">
          {previousMessagesCount > 0 && (
            <div className="text-center">
              <button
                type="button"
                onClick={() => setShowFullHistory(!showFullHistory)}
                className="text-[14px] text-slate-300 hover:text-white inline-flex items-center gap-1 transition"
              >
                {showFullHistory ? (
                  <>
                    <ChevronUp className="w-4 h-4" /> Скрыть предыдущие ({previousMessagesCount})
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-4 h-4" /> Показать предыдущие ({previousMessagesCount})
                  </>
                )}
              </button>
            </div>
          )}

          {showFullHistory && (
            <div className="space-y-2 border-y border-white/10 py-3 max-h-40 overflow-y-auto">
              {messages.slice(0, -2).map((m) => (
                <div
                  key={m.id}
                  className={`p-2.5 rounded-xl border text-[14px] ${
                    m.sender === "user"
                      ? "border-[#E7C768]/40 bg-transparent text-white ml-auto max-w-[85%]"
                      : "border-white/15 bg-transparent text-slate-200 mr-auto max-w-[85%]"
                  }`}
                >
                  <RichMarkdown tone="chat">{m.text}</RichMarkdown>
                </div>
              ))}
            </div>
          )}

          {/* Last User Message */}
          {lastUserMsg && (
            <div className="bg-transparent border border-[#E7C768]/60 backdrop-blur-md rounded-2xl p-3.5 text-[14px] text-white">
              <div className="flex items-center justify-between text-[14px] text-[#E7C768] font-bold mb-1.5 font-mono">
                <span>Вы:</span>
                <span>{lastUserMsg.timestamp}</span>
              </div>
              {lastUserMsg.screenshotUrl && (
                <div className="mb-2">
                  <div
                    onClick={() => setPreviewImageUrl(lastUserMsg.screenshotUrl!)}
                    className="relative group inline-block cursor-pointer overflow-hidden rounded-xl border border-white/30 hover:border-[#E7C768] transition"
                    title="Нажмите для полноразмерного просмотра"
                  >
                    <img
                      src={lastUserMsg.screenshotUrl}
                      alt="Скриншот экрана"
                      className="w-36 h-24 object-cover"
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-[14px] text-white font-medium transition">
                      <Maximize2 className="w-4 h-4 mr-1 text-[#E7C768]" /> Просмотр
                    </div>
                  </div>
                </div>
              )}
              {lastUserMsg.fileUrl && (
                <div className="mb-2">
                  {isImageFile(lastUserMsg.fileUrl, lastUserMsg.fileName) ? (
                    <div
                      onClick={() => setPreviewImageUrl(lastUserMsg.fileUrl!)}
                      className="relative group inline-flex items-center gap-2 cursor-pointer overflow-hidden rounded-xl border border-white/30 hover:border-[#E7C768] p-1.5 transition"
                      title="Нажмите для полноразмерного просмотра"
                    >
                      <img
                        src={lastUserMsg.fileUrl}
                        alt={lastUserMsg.fileName || "Изображение"}
                        className="w-20 h-14 object-cover rounded-lg"
                      />
                      <div className="text-left pr-2">
                        <div className="text-[14px] text-[#F4EE8E] font-mono truncate max-w-[180px]">
                          {lastUserMsg.fileName || "Изображение"}
                        </div>
                        <div className="text-[14px] text-slate-300 flex items-center gap-1 font-mono">
                          <Maximize2 className="w-3.5 h-3.5 text-[#E7C768]" /> Увеличить
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
                      <span className="font-mono underline truncate max-w-[260px]">{lastUserMsg.fileName || "Файл"}</span>
                    </a>
                  )}
                </div>
              )}
              <div>{lastUserMsg.text}</div>
            </div>
          )}

          {/* Last Assistant Response */}
          {lastAssistantMsg && (
            <div className="bg-transparent border border-white/20 backdrop-blur-md rounded-2xl p-4 text-[14px] text-white">
              <div className="flex items-center justify-between text-[14px] text-slate-300 font-bold mb-2 font-mono">
                <span className="flex items-center gap-1.5 text-[#F4EE8E]">
                  <Bot className="w-4 h-4 text-[#E7C768]" />
                  <span>
                    {assistantType === "employer_promax"
                      ? "RR ProMax Копилот"
                      : assistantType === "vacancy_company"
                      ? `Рекрутер «${companyName || "Компания"}»`
                      : "ИИ-Ассистент RR"}
                  </span>
                </span>
                <span>{lastAssistantMsg.timestamp}</span>
              </div>
              <div className="leading-relaxed">
                <RichMarkdown tone="chat">{lastAssistantMsg.text}</RichMarkdown>
              </div>
            </div>
          )}

          {/* Live Waiting Timer in expanded mode */}
          {isTyping && (
            <div className="p-3 rounded-2xl border border-white/20 bg-transparent backdrop-blur-xl flex items-center justify-between text-[14px] text-slate-200 shadow-lg">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#E7C768] animate-bounce"></span>
                <span className="w-2 h-2 rounded-full bg-[#E7C768] animate-bounce delay-100"></span>
                <span className="w-2 h-2 rounded-full bg-[#E7C768] animate-bounce delay-200"></span>
                <span>Анализирую и формирую ответ</span>
              </div>
              <span className="font-mono text-[#E7C768] font-bold">{waitingSeconds} сек...</span>
            </div>
          )}
        </div>

        {/* Screenshot upload progress */}
        {screenshotUploadProgress !== null && (
          <div className="w-full p-2.5 rounded-xl border border-[#E7C768]/60 bg-transparent backdrop-blur-md space-y-1.5">
            <div className="flex items-center justify-between text-[14px] font-mono text-white">
              <span className="flex items-center gap-1.5 text-[#F4EE8E]">
                <Loader2 className="w-4 h-4 animate-spin text-[#E7C768]" />
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
          <div className="w-full p-2.5 rounded-xl border border-[#E7C768]/60 bg-transparent backdrop-blur-md space-y-1.5">
            <div className="flex items-center justify-between text-[14px] font-mono text-white">
              <span className="flex items-center gap-1.5 text-[#F4EE8E]">
                <Loader2 className="w-4 h-4 animate-spin text-[#E7C768]" />
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

        {/* Screenshot attached indicator */}
        {screenshotUrl && (
          <div className="w-full flex items-center justify-between p-2.5 rounded-xl border border-[#E7C768] bg-transparent backdrop-blur-md">
            <div className="flex items-center gap-3 overflow-hidden">
              <div
                onClick={() => setPreviewImageUrl(screenshotUrl)}
                className="relative group shrink-0 cursor-pointer overflow-hidden rounded-lg border border-white/30 hover:border-[#E7C768] transition"
                title="Посмотреть полноразмерно"
              >
                <img
                  src={screenshotUrl}
                  alt="Скриншот"
                  className="w-16 h-11 object-cover"
                />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-[12px] text-white">
                  <Maximize2 className="w-3.5 h-3.5 text-[#E7C768]" />
                </div>
              </div>
              <div className="overflow-hidden text-left">
                <div className="text-[14px] font-bold text-[#F4EE8E] font-mono">Скриншот прикреплен к запросу</div>
                <div className="text-[14px] text-slate-300 font-mono truncate max-w-[260px]">
                  Кликните на миниатюру для просмотра
                </div>
              </div>
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

        {/* File attached indicator */}
        {attachedFile && (
          <div className="w-full flex items-center justify-between p-2.5 rounded-xl border border-[#E7C768] bg-transparent backdrop-blur-md">
            <div className="flex items-center gap-3 overflow-hidden">
              {isImageFile(attachedFile.url, attachedFile.name, attachedFile.type) ? (
                <div
                  onClick={() => setPreviewImageUrl(attachedFile.url)}
                  className="relative group shrink-0 cursor-pointer overflow-hidden rounded-lg border border-white/30 hover:border-[#E7C768] transition"
                  title="Посмотреть полноразмерно"
                >
                  <img
                    src={attachedFile.url}
                    alt={attachedFile.name}
                    className="w-16 h-11 object-cover"
                  />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-[12px] text-white">
                    <Maximize2 className="w-3.5 h-3.5 text-[#E7C768]" />
                  </div>
                </div>
              ) : (
                <div className="p-2.5 rounded-lg bg-white/10 text-[#E7C768] shrink-0">
                  <Paperclip className="w-5 h-5" />
                </div>
              )}
              <div className="overflow-hidden text-left">
                <div className="text-[14px] font-bold text-[#F4EE8E] font-mono truncate max-w-[260px]">{attachedFile.name}</div>
                <div className="text-[14px] text-slate-300 font-mono truncate max-w-[260px]">
                  {isImageFile(attachedFile.url, attachedFile.name, attachedFile.type) ? "Кликните для предпросмотра" : "Документ прикреплен"}
                </div>
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

        {/* Text input MiniAudioField at the bottom of expanded dialog */}
        <div className="w-full pt-1">
          <MiniAudioField
            value={inputValue}
            onChange={setInputValue}
            placeholder="Введите вопрос или опишите задачу..."
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
                  title="Сделать скриншот экрана для анализа ИИ"
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
      </motion.div>

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
    </div>
  );
}
