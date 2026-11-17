import React, { useRef, useEffect, useState } from "react";
import { Mic, Square, X, Sparkles, ArrowDown, AlertCircle, RefreshCw } from "lucide-react";
import MiniatureNeonSphere from "./MiniatureNeonSphere";
import CustomAudioPlayer from "./CustomAudioPlayer";
import { MASCOT } from "@/lib/mascotImages";
import { resolveVoiceSttActor } from "@/lib/actorSession";

interface AudioFieldProps {
  label?: string;
  value: string;
  onChange: (val: string) => void;
  onAudioUrlChange?: (url: string | null) => void;
  placeholder?: string;
  maxLength?: number;
  rows?: number;
  theme?: any;

  // Optional controlled overrides (if parent manages audio externally)
  isRecording?: boolean;
  recordingTime?: number;
  isTranscribing?: boolean;
  transcribeStatus?: string;
  transcribeSubtext?: string;
  transcribeSeconds?: number;
  audioUrl?: string | null;
  showMicNotice?: boolean;
  micPermissionError?: string | null;
  sttError?: string | null;
  onStartRecording?: () => void;
  onStopRecording?: () => void;
  onCancelRecording?: () => void;
  onCancelMicNotice?: () => void;
  onClearSttError?: () => void;

  // Optional submit action button
  onSubmit?: () => void;
  submitButtonText?: string;
  isSubmitting?: boolean;
}

function hexToRgba(hex: string, opacityPercent: number = 100): string {
  if (!hex) return `rgba(231, 199, 104, ${opacityPercent / 100})`;
  if (hex.startsWith("rgba")) return hex;
  if (hex.startsWith("rgb")) {
    return hex.replace("rgb", "rgba").replace(")", `, ${opacityPercent / 100})`);
  }
  let c = hex.replace("#", "");
  if (c.length === 3) c = c.split("").map((x) => x + x).join("");
  const num = parseInt(c, 16);
  if (isNaN(num)) return hex;
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, opacityPercent / 100))})`;
}

/** Animated SVG Down Arrow Prompt Accent Component above Input Box */
function GoldInputPromptAccent({ theme }: { theme?: any }) {
  const iconColor = theme?.iconColor || "#E7C768";
  const headingColor = theme?.headingsSolidColor || "#E7C768";
  const fontFamily = theme?.fontFamily || undefined;
  const isSolid = theme?.headingsColorMode === "solid" || Boolean(theme?.headingsSolidColor);
  return (
    <div className="flex items-center justify-between gap-1.5 px-1 py-1 text-sm font-bold select-none animate-fadeIn" style={{ fontFamily }}>
      <div className="flex items-center gap-1.5">
        <Sparkles className="w-4 h-4 animate-spin shrink-0" style={{ color: iconColor }} />
        <span
          className={`tracking-tight text-sm font-extrabold ${
            isSolid ? "" : "bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent"
          }`}
          style={isSolid ? { color: headingColor } : undefined}
        >
          Нажмите микрофон или введите текст ниже:
        </span>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <ArrowDown className="w-4 h-4 animate-bounce" style={{ color: iconColor }} />
      </div>
    </div>
  );
}

export default function AudioField({
  label,
  value,
  onChange,
  onAudioUrlChange,
  placeholder = "Нажмите на микрофон для записи ответа или введите текст...",
  maxLength,
  theme,

  // Controlled props (optional)
  isRecording: controlledIsRecording,
  recordingTime: controlledRecordingTime,
  isTranscribing: controlledIsTranscribing,
  transcribeStatus: controlledTranscribeStatus = "Слушаю вашу запись...",
  transcribeSubtext: controlledTranscribeSubtext = "Распознавание речи через голосовой виджет...",
  transcribeSeconds: controlledTranscribeSeconds,
  audioUrl: controlledAudioUrl,
  showMicNotice: controlledShowMicNotice,
  micPermissionError: controlledMicPermissionError,
  sttError: controlledSttError,
  onStartRecording: controlledOnStartRecording,
  onStopRecording: controlledOnStopRecording,
  onCancelRecording: controlledOnCancelRecording,
  onCancelMicNotice: controlledOnCancelMicNotice,
  onClearSttError: controlledOnClearSttError,

  onSubmit,
  submitButtonText = "Оценить ответ нейросетью RR",
  isSubmitting = false,
}: AudioFieldProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Keep refs up to date to prevent stale closure bugs in async callbacks
  const valueRef = useRef(value);
  valueRef.current = value;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onAudioUrlChangeRef = useRef(onAudioUrlChange);
  onAudioUrlChangeRef.current = onAudioUrlChange;

  // Internal audio recording & STT states when not controlled
  const [internalIsRecording, setInternalIsRecording] = useState(false);
  const [internalRecordingTime, setInternalRecordingTime] = useState(0);
  const [internalIsTranscribing, setInternalIsTranscribing] = useState(false);
  const [internalTranscribeSeconds, setInternalTranscribeSeconds] = useState(0);
  const [internalAudioUrl, setInternalAudioUrl] = useState<string | null>(null);
  const [internalShowMicNotice, setInternalShowMicNotice] = useState(false);
  const [internalMicPermissionError, setInternalMicPermissionError] = useState<string | null>(null);
  const [internalSttError, setInternalSttError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<any>(null);
  const transcribeTimerRef = useRef<any>(null);

  const isControlled = typeof controlledIsRecording === "boolean" && Boolean(controlledOnStartRecording);

  const activeIsRecording = isControlled ? controlledIsRecording! : internalIsRecording;
  const activeRecordingTime = isControlled ? (controlledRecordingTime ?? 0) : internalRecordingTime;
  const activeIsTranscribing = isControlled ? Boolean(controlledIsTranscribing) : internalIsTranscribing;
  const activeTranscribeSeconds = isControlled ? (controlledTranscribeSeconds ?? 0) : internalTranscribeSeconds;
  const activeAudioUrl = isControlled ? controlledAudioUrl : internalAudioUrl;
  const activeShowMicNotice = isControlled ? Boolean(controlledShowMicNotice) : internalShowMicNotice;
  const activeMicPermissionError = isControlled ? controlledMicPermissionError : internalMicPermissionError;
  const activeSttError = isControlled ? (controlledSttError ?? internalSttError) : internalSttError;

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (transcribeTimerRef.current) clearInterval(transcribeTimerRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stream?.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      const scrollH = textareaRef.current.scrollHeight;
      const newH = Math.min(Math.max(scrollH, 120), 280);
      textareaRef.current.style.height = `${newH}px`;
    }
  }, [value]);

  const processInternalAudioSTT = async (audioBlob: Blob) => {
    setInternalIsTranscribing(true);
    setInternalTranscribeSeconds(0);
    setInternalSttError(null);

    if (transcribeTimerRef.current) clearInterval(transcribeTimerRef.current);
    transcribeTimerRef.current = setInterval(() => {
      setInternalTranscribeSeconds((prev) => prev + 1);
    }, 1000);

    try {
      const reader = new FileReader();
      reader.readAsDataURL(audioBlob);
      reader.onloadend = async () => {
        const base64Data = reader.result as string;

        const res = await fetch("/api/voice/stt", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            audio_base64: base64Data,
            mime_type: audioBlob.type || "audio/webm",
            ...resolveVoiceSttActor(),
          })
        });

        const data = await res.json().catch(() => ({ success: false }));
        setInternalIsTranscribing(false);
        if (transcribeTimerRef.current) clearInterval(transcribeTimerRef.current);

        if (data && data.success) {
          if (data.file_url) {
            setInternalAudioUrl(data.file_url);
            if (onAudioUrlChangeRef.current) {
              onAudioUrlChangeRef.current(data.file_url);
            }
          }
          if (data.text) {
            const textAppend = data.text.trim().replace(/\.+$/, "").trim();
            if (textAppend) {
              const currentVal = valueRef.current || "";
              let updatedText = currentVal ? `${currentVal} ${textAppend}` : textAppend;
              if (maxLength && updatedText.length > maxLength) {
                updatedText = updatedText.slice(0, maxLength);
              }
              if (onChangeRef.current) {
                onChangeRef.current(updatedText);
              }
              setInternalSttError(null);
            } else {
              setInternalSttError("Не удалось разобрать речь на записи. Ошибка могла возникнуть случайно.");
            }
          }
        } else {
          setInternalSttError("Ошибка распознавания речи нейросетью. Ошибка могла возникнуть случайно.");
        }
      };
    } catch (err) {
      console.error("STT processing error in AudioField:", err);
      setInternalIsTranscribing(false);
      if (transcribeTimerRef.current) clearInterval(transcribeTimerRef.current);
      setInternalSttError("Ошибка сети при отправке аудио. Попробуйте повторить запись.");
    }
  };

  const handleStartRecording = async () => {
    setInternalSttError(null);
    if (controlledOnClearSttError) controlledOnClearSttError();

    if (controlledOnStartRecording) {
      controlledOnStartRecording();
      return;
    }

    setInternalMicPermissionError(null);
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setInternalMicPermissionError("Запись аудио не поддерживается в вашем браузере.");
      setInternalShowMicNotice(true);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setInternalShowMicNotice(false);
      audioChunksRef.current = [];

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : ""
      });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, {
          type: mediaRecorder.mimeType || "audio/webm"
        });
        const url = URL.createObjectURL(audioBlob);
        setInternalAudioUrl(url);
        processInternalAudioSTT(audioBlob);
      };

      mediaRecorder.start(200);
      setInternalIsRecording(true);
      setInternalRecordingTime(0);

      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        setInternalRecordingTime((prev) => prev + 1);
      }, 1000);
    } catch (err: any) {
      console.warn("Mic access error:", err?.message || err);
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError" || err?.message?.includes("Permission denied")) {
        setInternalMicPermissionError("Доступ к микрофону отклонен в настройках браузера. Вы можете разрешить доступ к микрофону или ввести текст вручную.");
      } else {
        setInternalMicPermissionError("Не удалось получить доступ к микрофону. Разрешите использование микрофона или введите текст вручную.");
      }
      setInternalShowMicNotice(true);
    }
  };

  const handleStopRecording = () => {
    if (controlledOnStopRecording) {
      controlledOnStopRecording();
      return;
    }

    if (mediaRecorderRef.current && internalIsRecording) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
      setInternalIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  const handleCancelRecording = () => {
    if (controlledOnCancelRecording) {
      controlledOnCancelRecording();
      return;
    }

    if (mediaRecorderRef.current && internalIsRecording) {
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
    }
    setInternalIsRecording(false);
    if (timerRef.current) clearInterval(timerRef.current);
    setInternalRecordingTime(0);
  };

  const handleCancelNotice = () => {
    if (controlledOnCancelMicNotice) {
      controlledOnCancelMicNotice();
    } else {
      setInternalShowMicNotice(false);
    }
  };

  const hasContent = (value && value.trim().length > 0) || Boolean(activeAudioUrl);

  return (
    <div className="space-y-1.5 mx-[3px]">
      <style>{`
        .custom-gold-scrollbar::-webkit-scrollbar {
          width: 5px;
        }
        .custom-gold-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-gold-scrollbar::-webkit-scrollbar-thumb {
          background: linear-gradient(180deg, #F4EE8E 0%, #E7C768 50%, #D99E41 100%);
          border-radius: 9999px;
        }
        .custom-gold-scrollbar::-webkit-scrollbar-thumb:hover {
          background: linear-gradient(180deg, #FFFFFF 0%, #F4EE8E 100%);
        }
      `}</style>

      {/* Label - render only if provided and non-empty */}
      {label && label.trim().length > 0 && (
        <div className="flex items-center justify-between text-sm font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">
          <span>{label}</span>
        </div>
      )}

      {/* Gold Prompt Header - hidden if user typed text or audio exists or recording/notice/transcribing */}
      {!hasContent && !activeIsRecording && !activeShowMicNotice && !activeIsTranscribing && (
        <GoldInputPromptAccent theme={theme} />
      )}

      {/* Audio Player if recorded */}
      {activeAudioUrl && !activeIsRecording && !activeIsTranscribing && (
        <div className="animate-fadeIn">
          <CustomAudioPlayer audioUrl={activeAudioUrl} title="" initialDuration={activeRecordingTime} />
        </div>
      )}

      {/* Unified Input Container Box */}
      {(() => {
        const containerRadius = theme?.containerBorderRadius !== undefined
          ? `${theme.containerBorderRadius}px`
          : "1rem";
        const containerBorder = theme?.containerBorderColor
          ? hexToRgba(theme.containerBorderColor, theme.containerBorderOpacity ?? 40)
          : "rgba(231, 199, 104, 0.5)";
        const containerWidth = theme?.containerBorderWidth !== undefined
          ? `${theme.containerBorderWidth}px`
          : "1px";
        const containerBg = theme?.containerBgColor
          ? hexToRgba(theme.containerBgColor, theme.containerBgOpacity ?? 10)
          : "transparent";
        const fontFamily = theme?.fontFamily || undefined;

        const btnRadius = theme?.btnBorderRadius !== undefined
          ? (theme.btnBorderRadius === 999 ? "9999px" : `${theme.btnBorderRadius}px`)
          : "0.75rem";
        const btnWidth = theme?.btnBorderWidth !== undefined
          ? `${theme.btnBorderWidth}px`
          : "1px";

        const stopBtnBorder = theme?.btnBorderColor
          ? hexToRgba(theme.btnBorderColor, theme.btnBorderOpacity ?? 40)
          : (theme?.iconColor || "#E7C768");
        const stopBtnBg = theme?.btnActiveBgColor
          ? hexToRgba(theme.btnActiveBgColor, theme.btnActiveOpacity ?? 100)
          : (theme?.iconColor ? hexToRgba(theme.iconColor, 15) : "#E7C768");
        const stopBtnColor = theme?.btnActiveTextColor || "#17344F";

        const cancelBtnBorder = theme?.btnBorderColor
          ? hexToRgba(theme.btnBorderColor, theme.btnBorderOpacity ?? 25)
          : "rgba(255, 255, 255, 0.25)";
        const cancelBtnBg = theme?.btnInactiveBgColor
          ? hexToRgba(theme.btnInactiveBgColor, theme.btnInactiveOpacity ?? 20)
          : "transparent";
        const cancelBtnColor = theme?.btnInactiveTextColor || "#FFFFFF";

        return (
          <div
            className="relative bg-transparent backdrop-blur-md border overflow-hidden focus-within:border-[#E7C768] transition-all flex flex-col"
            style={{
              borderRadius: containerRadius,
              borderColor: containerBorder,
              borderWidth: containerWidth,
              backgroundColor: containerBg,
              fontFamily,
            }}
          >
            {/* STATE 1: RECOGNITION / STT WAITING MODE */}
            {activeIsTranscribing ? (
              <div className="p-3.5 flex items-center gap-3 min-h-[140px] animate-fadeIn">
                {/* Left side: Mascot */}
                <div className="shrink-0 relative">
                  <div className="absolute -inset-1.5 bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] rounded-full blur-sm opacity-50 animate-pulse" />
                  <img
                    src={MASCOT.shine}
                    alt="ИИ Робот Рекрутер"
                    loading="lazy"
                    decoding="async"
                    className="w-16 h-16 relative z-10 object-contain drop-shadow-[0_0_12px_rgba(231,199,104,0.6)]"
                  />
                </div>

                {/* Right side: Text fields and recognition status */}
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="text-sm font-bold text-[#E7C768] flex items-center gap-1.5" style={{ color: theme?.iconColor || "#E7C768" }}>
                    <Sparkles className="w-3.5 h-3.5 animate-spin shrink-0" style={{ color: theme?.iconColor || "#E7C768" }} />
                    <span>{controlledTranscribeStatus}</span>
                  </div>

                  <p className="text-sm text-slate-200 leading-snug">{controlledTranscribeSubtext}</p>

                  <div className="flex items-center justify-between gap-2 pt-1">
                    <div className="text-sm font-mono font-extrabold text-[#E7C768] bg-transparent px-3 py-0.5 rounded-full border border-[#E7C768]/50 inline-flex items-center gap-1" style={{ borderColor: theme?.iconColor ? hexToRgba(theme.iconColor, 50) : undefined, color: theme?.iconColor }}>
                      <span className="w-1.5 h-1.5 rounded-full bg-[#E7C768] animate-ping" style={{ backgroundColor: theme?.iconColor }} />
                      <span>{activeTranscribeSeconds} сек.</span>
                    </div>

                    <div className="flex items-center gap-0.5 text-[#E7C768]" style={{ color: theme?.iconColor }}>
                      {[30, 80, 50, 100, 60, 40, 90, 70].map((h, i) => (
                        <div
                          key={i}
                          className="w-1 bg-[#E7C768] rounded-full animate-pulse"
                          style={{ height: `${h}%`, animationDelay: `${i * 120}ms`, backgroundColor: theme?.iconColor }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ) : activeSttError ? (
              /* STATE 5: STT ERROR STATE WITH REPEAT AND CANCEL */
              <div className="p-4 flex flex-col items-center justify-center text-center space-y-3 min-h-[150px] animate-fadeIn">
                <div className="shrink-0 p-2 rounded-full bg-transparent text-[#E7C768]" style={{ color: theme?.iconColor }}>
                  <AlertCircle className="w-7 h-7 animate-pulse" style={{ color: theme?.iconColor }} />
                </div>

                <div className="text-sm font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#CBA335] bg-clip-text text-transparent">
                  Ошибка распознавания речи
                </div>

                <p className="text-sm text-slate-200 leading-relaxed max-w-sm">
                  {typeof activeSttError === "string" && activeSttError.length > 0
                    ? activeSttError
                    : "Произошла ошибка при распознавании речи нейросетью. Ошибка могла возникнуть случайно."}
                  <br />
                  Вы можете повторить запись голосом или отменить её для ввода текста.
                </p>

                <div className="flex items-center gap-2 w-full pt-1 max-w-xs">
                  <button
                    onClick={() => {
                      setInternalSttError(null);
                      if (controlledOnClearSttError) controlledOnClearSttError();
                      handleStartRecording();
                    }}
                    type="button"
                    style={{ borderRadius: btnRadius, fontFamily }}
                    className="flex-1 cursor-pointer bg-gradient-to-r from-[#FFE580] via-[#E7C768] to-[#C8A038] hover:brightness-110 text-[#17344F] font-extrabold py-2.5 px-3 flex items-center justify-center gap-1.5 text-sm transition shadow-md"
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> Повторить запись
                  </button>

                  <button
                    onClick={() => {
                      setInternalSttError(null);
                      if (controlledOnClearSttError) controlledOnClearSttError();
                    }}
                    type="button"
                    style={{ borderRadius: btnRadius, fontFamily, borderColor: cancelBtnBorder, color: cancelBtnColor }}
                    className="flex-1 cursor-pointer bg-transparent border text-slate-300 hover:text-white font-semibold py-2.5 px-3 flex items-center justify-center gap-1.5 text-sm transition"
                  >
                    <X className="w-3.5 h-3.5" /> Отмена
                  </button>
                </div>
              </div>
            ) : activeShowMicNotice ? (
              /* STATE 2: MIC DISABLED INSTRUCTIONS */
              <div className="p-4 flex flex-col items-center justify-center text-center space-y-3 min-h-[150px] animate-fadeIn">
                <MiniatureNeonSphere isRecording={false} />

                <div className="text-sm font-bold text-white">
                  Доступ к микрофону
                </div>

                <p className="text-sm text-slate-200 leading-relaxed max-w-xs">
                  {activeMicPermissionError || "Для записи ответа разрешите доступ к микрофону вашего браузера."}
                </p>

                <div className="flex items-center gap-2 w-full pt-1">
                  <button
                    onClick={handleStartRecording}
                    type="button"
                    style={{ borderRadius: btnRadius, borderWidth: btnWidth, borderColor: stopBtnBorder, color: stopBtnColor, fontFamily }}
                    className="flex-1 cursor-pointer bg-transparent border font-bold py-2.5 px-3 flex items-center justify-center gap-1.5 text-sm transition hover:brightness-110"
                  >
                    <Mic className="w-3.5 h-3.5" /> Включить микрофон
                  </button>

                  <button
                    onClick={handleCancelNotice}
                    type="button"
                    style={{ borderRadius: btnRadius, borderWidth: btnWidth, borderColor: cancelBtnBorder, color: cancelBtnColor, fontFamily }}
                    className="flex-1 cursor-pointer bg-transparent border font-semibold py-2.5 px-3 flex items-center justify-center gap-1.5 text-sm transition"
                  >
                    Отмена
                  </button>
                </div>
              </div>
            ) : activeIsRecording ? (
              /* STATE 3: VOICE RECORDING ACTIVE MODE */
              <div className="p-4 flex flex-col items-center justify-center text-center space-y-3 min-h-[150px] animate-fadeIn">
                <MiniatureNeonSphere isRecording={true} />

                <div className="text-sm font-bold text-white flex items-center gap-1.5">
                  <Mic className="w-3.5 h-3.5 animate-pulse" style={{ color: theme?.iconColor || "#E7C768" }} />
                  Идет запись аудио...
                </div>

                <p className="text-sm text-slate-300 italic">Говорите в микрофон, громко и четко</p>

                <div
                  className="text-xl font-mono font-extrabold px-5 py-1.5 border shadow-lg"
                  style={{
                    borderRadius: btnRadius,
                    borderColor: theme?.iconColor ? hexToRgba(theme.iconColor, 50) : "rgba(231,199,104,0.5)",
                    color: theme?.iconColor || "#E7C768",
                    fontFamily,
                  }}
                >
                  {Math.floor(activeRecordingTime / 60).toString().padStart(2, '0')}:{(activeRecordingTime % 60).toString().padStart(2, '0')}
                </div>

                <div className="flex items-center gap-2.5 w-full pt-1">
                  <button
                    onClick={handleStopRecording}
                    type="button"
                    style={{
                      borderRadius: btnRadius,
                      borderWidth: btnWidth,
                      borderColor: stopBtnBorder,
                      backgroundColor: stopBtnBg,
                      color: stopBtnColor,
                      WebkitTextFillColor: stopBtnColor,
                      fontFamily,
                    }}
                    className="flex-1 cursor-pointer border font-bold py-2.5 px-4 flex items-center justify-center gap-1.5 text-sm transition hover:brightness-110 active:scale-95 shadow-md"
                  >
                    <Square className="w-3.5 h-3.5 fill-current shrink-0" style={{ color: stopBtnColor }} /> Стоп
                  </button>

                  <button
                    onClick={handleCancelRecording}
                    type="button"
                    style={{
                      borderRadius: btnRadius,
                      borderWidth: btnWidth,
                      borderColor: cancelBtnBorder,
                      backgroundColor: cancelBtnBg,
                      color: cancelBtnColor,
                      WebkitTextFillColor: cancelBtnColor,
                      fontFamily,
                    }}
                    className="flex-1 cursor-pointer border font-semibold py-2.5 px-4 flex items-center justify-center gap-1.5 text-sm transition hover:brightness-110"
                  >
                    <X className="w-3.5 h-3.5 shrink-0" style={{ color: cancelBtnColor }} /> Отмена
                  </button>
                </div>
              </div>
            ) : (
              /* STATE 4: STANDARD TEXT INPUT WITH MIC BUTTON ON LEFT */
              <div className="flex flex-row items-center">
                <div className="shrink-0 p-1 flex items-center justify-center relative overflow-hidden select-none bg-transparent border-none">
                  <button
                    onClick={handleStartRecording}
                    type="button"
                    title="Записать ответ голосом"
                    className="cursor-pointer relative z-10 w-20 h-20 flex items-center justify-center bg-transparent border-none outline-none transition transform hover:scale-110 active:scale-95 group"
                  >
                    <div className="absolute inset-0 flex items-center justify-center opacity-90 pointer-events-none">
                      <MiniatureNeonSphere isRecording={false} />
                    </div>
                    <Mic
                      className="w-10 h-10 relative z-10"
                      style={{
                        color: theme?.iconColor || "#E7C768",
                        filter: `drop-shadow(0 0 12px ${theme?.iconColor ? hexToRgba(theme.iconColor, 90) : "rgba(231,199,104,0.9)"})`
                      }}
                    />
                  </button>
                </div>

                <textarea
                  ref={textareaRef}
                  value={value}
                  onChange={(e) => {
                    const newVal = maxLength ? e.target.value.slice(0, maxLength) : e.target.value;
                    onChange(newVal);
                  }}
                  placeholder={placeholder}
                  rows={5}
                  style={{
                    minHeight: "120px",
                    maxHeight: "280px",
                    scrollbarColor: `${theme?.iconColor || "#E7C768"} transparent`,
                    fontFamily,
                    color: theme?.bodyTextColor || "#FFFFFF",
                  }}
                  className="w-full bg-transparent p-3 text-sm placeholder-slate-400 focus:outline-none resize-none overflow-y-auto custom-gold-scrollbar transition-all border-none"
                />
              </div>
            )}
          </div>
        );
      })()}

      {/* Submit Action Button */}
      {onSubmit && value.trim().length > 0 && !activeIsRecording && !activeIsTranscribing && !activeShowMicNotice && (
        <div className="flex justify-center pt-2 animate-fadeIn">
          <button
            onClick={onSubmit}
            type="button"
            disabled={isSubmitting}
            className="w-full cursor-pointer bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#CBA335] text-[#17344F] font-extrabold px-5 py-3 rounded-2xl shadow-xl transition transform hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-2 text-sm disabled:opacity-50"
          >
            <Sparkles className="w-4 h-4 fill-current" />
            {submitButtonText}
          </button>
        </div>
      )}
    </div>
  );
}

