import React, { useRef, useEffect, useState } from "react";
import { Mic, Square, X, Sparkles, Play, Pause, Send, AlertCircle, RefreshCw, Maximize2, Minimize2 } from "lucide-react";
import { MASCOT } from "@/lib/mascotImages";
import { resolveVoiceSttActor } from "@/lib/actorSession";

interface MiniAudioFieldProps {
  label?: string;
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  maxLength?: number;
  minRows?: number;
  allowFullscreen?: boolean;
  className?: string;
  extraAction?: React.ReactNode;
  sphereColor?: string;
  borderColor?: string;
  borderWidth?: number;
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

/** Dedicated Mini Wireframe Sphere + 150% Mic Icon Component */
function MiniMicSphere({ isRecording, onClick, color = "#E7C768" }: { isRecording?: boolean; onClick?: () => void; color?: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let angle = 0;

    const numPoints = 28;
    const points: { x: number; y: number; z: number }[] = [];
    for (let i = 0; i < numPoints; i++) {
      const phi = Math.acos(-1 + (2 * i) / numPoints);
      const theta = Math.sqrt(numPoints * Math.PI) * phi;
      points.push({
        x: Math.cos(theta) * Math.sin(phi),
        y: Math.sin(theta) * Math.sin(phi),
        z: Math.cos(phi)
      });
    }

    const render = () => {
      canvas.width = 56;
      canvas.height = 56;
      ctx.clearRect(0, 0, 56, 56);
      const cx = 28;
      const cy = 28;
      const radius = 22; // ~80% scale of original 32px radius

      angle += isRecording ? 0.05 : 0.02;

      const projected: { x: number; y: number; z: number }[] = [];
      points.forEach((p) => {
        const x1 = p.x * Math.cos(angle) - p.z * Math.sin(angle);
        const z1 = p.x * Math.sin(angle) + p.z * Math.cos(angle);
        const y2 = p.y * Math.cos(angle * 0.7) - z1 * Math.sin(angle * 0.7);
        const z2 = p.y * Math.sin(angle * 0.7) + z1 * Math.cos(angle * 0.7);

        projected.push({
          x: cx + x1 * radius,
          y: cy + y2 * radius,
          z: z2
        });
      });

      ctx.lineWidth = 1.0;
      for (let i = 0; i < projected.length; i++) {
        for (let j = i + 1; j < projected.length; j++) {
          const dx = projected[i].x - projected[j].x;
          const dy = projected[i].y - projected[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 18) {
            const alpha = (1 - dist / 18) * 0.7;
            ctx.strokeStyle = color === "#FFFFFF" 
              ? `rgba(255, 255, 255, ${alpha})` 
              : `rgba(231, 199, 104, ${alpha})`;
            ctx.beginPath();
            ctx.moveTo(projected[i].x, projected[i].y);
            ctx.lineTo(projected[j].x, projected[j].y);
            ctx.stroke();
          }
        }
      }

      projected.forEach((p) => {
        const scale = (p.z + 1.5) / 2.5;
        const nodeRadius = Math.max(1.2, 2.5 * scale);
        ctx.fillStyle = p.z > 0 ? color : "#FFFFFF";
        ctx.beginPath();
        ctx.arc(p.x, p.y, nodeRadius, 0, Math.PI * 2);
        ctx.fill();
      });

      ctx.strokeStyle = isRecording 
        ? (color === "#FFFFFF" ? "rgba(255, 255, 255, 0.9)" : "rgba(231, 199, 104, 0.9)")
        : (color === "#FFFFFF" ? "rgba(255, 255, 255, 0.5)" : "rgba(231, 199, 104, 0.5)");
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, radius + 1.5, 0, Math.PI * 2);
      ctx.stroke();

      animId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animId);
  }, [isRecording, color]);

  return (
    <button
      onClick={onClick}
      type="button"
      disabled={!onClick}
      title="Записать ответ голосом"
      className="mini-mic-sphere-btn relative shrink-0 w-11 h-11 self-center flex items-center justify-center bg-transparent border border-white/20 hover:border-white/40 rounded-full transition transform hover:scale-105 active:scale-95 group overflow-hidden cursor-pointer backdrop-blur-md"
    >
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />
      {/* 150% size Mic Icon (24px) */}
      <Mic className="mini-mic-icon w-6 h-6 text-[#E7C768] relative z-10 drop-shadow-[0_0_8px_rgba(231,199,104,0.9)] transition-transform group-hover:scale-110" />
    </button>
  );
}

/** 1-line Minimalist Audio Player */
function CompactAudioPlayer({ audioUrl, duration }: { audioUrl: string; duration?: number }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(duration || 0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    setCurrentTime(0);
    setIsPlaying(false);
    if (duration && duration > 0) setTotalDuration(duration);

    let isCancelled = false;
    if (audioUrl) {
      fetch(audioUrl)
        .then((res) => res.arrayBuffer())
        .then((arrayBuffer) => {
          if (isCancelled) return;
          const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
          if (!AudioContextClass) return;
          const audioCtx = new AudioContextClass();
          return audioCtx.decodeAudioData(arrayBuffer).then((buf) => {
            if (!isCancelled && buf && buf.duration && isFinite(buf.duration) && buf.duration > 0) {
              setTotalDuration(buf.duration);
            }
            audioCtx.close().catch(() => {});
          });
        })
        .catch(() => {});
    }

    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      if (audio.duration && isFinite(audio.duration)) {
        setTotalDuration(audio.duration);
      }
    };
    const onEnded = () => setIsPlaying(false);

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("ended", onEnded);
    audio.load();

    return () => {
      isCancelled = true;
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("ended", onEnded);
    };
  }, [audioUrl, duration]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play().then(() => setIsPlaying(true)).catch(() => {});
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio) return;
    const dur = totalDuration || audio.duration;
    if (!dur || !isFinite(dur)) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const newTime = pos * dur;
    audio.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const formatTime = (sec: number) => {
    if (!sec || isNaN(sec) || !isFinite(sec) || sec < 0) return "00:00";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  const pct = totalDuration > 0 ? Math.min(100, (currentTime / totalDuration) * 100) : 0;

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-transparent backdrop-blur-md border border-white/25 rounded-xl my-1 text-white text-sm w-full">
      <audio ref={audioRef} src={audioUrl} preload="auto" />
      <button
        onClick={togglePlay}
        type="button"
        className="cursor-pointer bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] text-[#17344F] hover:brightness-105 p-1.5 rounded-full shrink-0 transition active:scale-95"
        title={isPlaying ? "Пауза" : "Воспроизвести"}
      >
        {isPlaying ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current ml-0.5" />}
      </button>

      <div className="flex-1 min-w-0 flex items-center gap-2">
        <div
          onClick={handleSeek}
          className="flex-1 bg-white/20 hover:bg-white/30 h-1.5 rounded-full cursor-pointer relative overflow-hidden"
        >
          <div
            className="bg-gradient-to-r from-[#F4EE8E] to-[#E7C768] h-full rounded-full transition-all duration-75"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-sm font-mono text-white shrink-0">
          {formatTime(currentTime)} / {formatTime(totalDuration)}
        </span>
      </div>
    </div>
  );
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

export default function MiniAudioField({
  label,
  value,
  onChange,
  placeholder = "Нажмите на микрофон для записи или введите текст...",
  maxLength,
  minRows = 2,
  allowFullscreen = false,
  className = "",
  extraAction,
  sphereColor,
  borderColor,
  borderWidth,
  theme,

  // Controlled props
  isRecording: controlledIsRecording,
  recordingTime: controlledRecordingTime,
  isTranscribing: controlledIsTranscribing,
  transcribeStatus: controlledTranscribeStatus = "Слушаю вашу запись...",
  transcribeSubtext: controlledTranscribeSubtext = "Распознавание речи...",
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
  submitButtonText = "Оценить ответ",
  isSubmitting = false,
}: MiniAudioFieldProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Prevent stale closures
  const valueRef = useRef(value);
  valueRef.current = value;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Internal state
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

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (transcribeTimerRef.current) clearInterval(transcribeTimerRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stream?.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  const [isFullscreen, setIsFullscreen] = useState(false);

  // Auto-resize textarea: respects minRows up to max height
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      const scrollH = textareaRef.current.scrollHeight;
      const minH = minRows === 1 ? 36 : Math.max(44, minRows * 22);
      const maxH = Math.max(activeAudioUrl ? 140 : 220, minRows * 28);
      const newH = Math.min(Math.max(scrollH, minH), maxH);
      textareaRef.current.style.height = `${newH}px`;
    }
  }, [value, activeAudioUrl, minRows]);

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

        if (data && data.success && data.text) {
          // Strip trailing dots at the very end of speech-to-text transcription, keeping dots in the middle
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
        } else {
          setInternalSttError("Ошибка распознавания речи нейросетью. Ошибка могла возникнуть случайно.");
        }
      };
    } catch (err) {
      console.error("STT error in MiniAudioField:", err);
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
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError" || err?.message?.includes("Permission denied")) {
        setInternalMicPermissionError("Доступ к микрофону отклонен. Разрешите доступ или введите текст.");
      } else {
        setInternalMicPermissionError("Ошибка микрофона. Введите текст вручную.");
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
      mediaRecorderRef.current.stream.getTracks().forEach((t) => t.stop());
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
      mediaRecorderRef.current.stream.getTracks().forEach((t) => t.stop());
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

  const containerRadius = theme?.containerBorderRadius !== undefined
    ? `${theme.containerBorderRadius}px`
    : "1rem";
  const containerBorder = theme?.containerBorderColor
    ? hexToRgba(theme.containerBorderColor, theme.containerBorderOpacity ?? 40)
    : (borderColor || "rgba(255, 255, 255, 0.2)");
  const containerWidth = theme?.containerBorderWidth !== undefined
    ? `${theme.containerBorderWidth}px`
    : (borderWidth !== undefined ? `${borderWidth}px` : "1px");
  const containerBg = theme?.containerBgColor
    ? hexToRgba(theme.containerBgColor, theme.containerBgOpacity ?? 10)
    : "transparent";
  const fontFamily = theme?.fontFamily || undefined;
  const accentColor = theme?.iconColor || sphereColor || "#E7C768";

  const btnRadius = theme?.btnBorderRadius !== undefined
    ? (theme.btnBorderRadius === 999 ? "9999px" : `${theme.btnBorderRadius}px`)
    : "0.5rem";
  const btnWidth = theme?.btnBorderWidth !== undefined
    ? `${theme.btnBorderWidth}px`
    : "1px";

  const stopBtnBorder = theme?.btnBorderColor
    ? hexToRgba(theme.btnBorderColor, theme.btnBorderOpacity ?? 40)
    : (theme?.iconColor || "#E7C768");
  const stopBtnBg = theme?.btnActiveBgColor
    ? hexToRgba(theme.btnActiveBgColor, theme.btnActiveOpacity ?? 100)
    : (theme?.iconColor ? hexToRgba(theme.iconColor, 15) : "#E7C768");
  const stopBtnColor = theme?.btnActiveTextColor || "#000000";

  const cancelBtnBorder = theme?.btnBorderColor
    ? hexToRgba(theme.btnBorderColor, theme.btnBorderOpacity ?? 25)
    : "rgba(255, 255, 255, 0.2)";
  const cancelBtnBg = theme?.btnInactiveBgColor
    ? hexToRgba(theme.btnInactiveBgColor, theme.btnInactiveOpacity ?? 20)
    : "transparent";
  const cancelBtnColor = theme?.btnInactiveTextColor || "rgb(203, 213, 225)";

  return (
    <div className={`space-y-1.5 w-full ${className}`} style={{ fontFamily }}>
      <style>{`
        .mini-gold-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .mini-gold-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .mini-gold-scrollbar::-webkit-scrollbar-thumb {
          background: linear-gradient(180deg, #F4EE8E 0%, #E7C768 50%, #D99E41 100%);
          border-radius: 9999px;
        }
      `}</style>

      {label && label.trim().length > 0 && (
        <div
          className="text-sm font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent"
          style={theme?.headingsSolidColor ? { fontFamily, color: theme.headingsSolidColor, WebkitTextFillColor: theme.headingsSolidColor } : { fontFamily }}
        >
          {label}
        </div>
      )}

      {/* Main Glass Container Box - Strictly bounded overflow-hidden with company theme */}
      <div 
        style={{
          borderRadius: containerRadius,
          borderColor: containerBorder,
          borderWidth: containerWidth,
          backgroundColor: containerBg,
          fontFamily,
        }}
        className="mini-audio-field-box relative bg-transparent backdrop-blur-md border p-2.5 focus-within:border-[#E7C768] transition-all flex flex-col justify-center overflow-hidden"
      >

        {/* STATE 1: RECOGNITION / STT (Mascot 2x larger on left, text right) */}
        {activeIsTranscribing ? (
          <div className="flex items-center gap-3 p-1 animate-fadeIn min-h-[56px] w-full">
            {/* Mascot 2x size (~48px) */}
            <img
              src={MASCOT.shine}
              alt="ИИ"
              className="w-12 h-12 object-contain shrink-0 drop-shadow-[0_0_12px_rgba(231,199,104,0.7)]"
            />

            {/* Text & Timer info right of mascot */}
            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-bold truncate flex items-center gap-1.5" style={{ color: accentColor }}>
                  <Sparkles className="w-3.5 h-3.5 animate-spin shrink-0" style={{ color: accentColor }} />
                  {controlledTranscribeStatus}
                </span>
                <div className="text-sm font-mono font-bold shrink-0 flex items-center gap-1 bg-transparent backdrop-blur-md px-2 py-0.5 rounded-full border" style={{ borderColor: hexToRgba(accentColor, 40), color: accentColor }}>
                  <span className="w-1.5 h-1.5 rounded-full animate-ping" style={{ backgroundColor: accentColor }} />
                  {activeTranscribeSeconds} сек.
                </div>
              </div>

              <div className="flex items-center justify-between text-sm text-white">
                <span className="truncate">{controlledTranscribeSubtext}</span>
                <div className="flex items-center gap-0.5 shrink-0" style={{ color: accentColor }}>
                  {[30, 80, 50, 90, 60].map((h, i) => (
                    <div
                      key={i}
                      className="w-0.5 h-3 rounded-full animate-pulse"
                      style={{ animationDelay: `${i * 100}ms`, backgroundColor: accentColor }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : activeSttError ? (
          /* STATE 5: STT ERROR STATE WITH REPEAT AND CANCEL */
          <div className="flex flex-col justify-between p-2 space-y-2 animate-fadeIn min-h-[56px] w-full">
            <div className="flex items-center gap-2 text-sm font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#CBA335] bg-clip-text text-transparent">
              <AlertCircle className="w-4 h-4 text-[#E7C768] shrink-0 animate-pulse" style={{ color: accentColor }} />
              <span>Ошибка распознавания речи</span>
            </div>

            <p className="text-sm text-white leading-snug">
              {typeof activeSttError === "string" && activeSttError.length > 0
                ? activeSttError
                : "Произошла ошибка при распознавании речи. Это случайный сбой."}
            </p>

            <div className="flex items-center justify-end gap-2 pt-0.5">
              <button
                onClick={() => {
                  setInternalSttError(null);
                  if (controlledOnClearSttError) controlledOnClearSttError();
                  handleStartRecording();
                }}
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
                className="cursor-pointer border font-bold py-1 px-3 flex items-center gap-1.5 text-sm transition active:scale-95 shadow shrink-0"
              >
                <RefreshCw className="w-3 h-3" /> Повторить запись
              </button>

              <button
                onClick={() => {
                  setInternalSttError(null);
                  if (controlledOnClearSttError) controlledOnClearSttError();
                }}
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
                className="cursor-pointer border py-1 px-2.5 text-sm transition flex items-center gap-1 shrink-0"
              >
                <X className="w-3.5 h-3.5" /> Отмена
              </button>
            </div>
          </div>
        ) : activeShowMicNotice ? (
          /* STATE 2: MIC NOTICE */
          <div className="flex flex-col justify-between p-1 space-y-2 animate-fadeIn min-h-[52px]">
            <div className="text-sm text-white font-medium truncate">
              ⚠️ {activeMicPermissionError || "Разрешите доступ к микрофону в браузере."}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleStartRecording}
                type="button"
                style={{
                  borderRadius: btnRadius,
                  borderWidth: btnWidth,
                  borderColor: stopBtnBorder,
                  color: accentColor,
                  fontFamily,
                }}
                className="flex-1 cursor-pointer bg-transparent border hover:border-[#E7C768] font-bold py-1 px-2 flex items-center justify-center gap-1 text-sm transition"
              >
                <Mic className="w-3.5 h-3.5" /> Включить микрофон
              </button>
              <button
                onClick={handleCancelNotice}
                type="button"
                style={{
                  borderRadius: btnRadius,
                  borderWidth: btnWidth,
                  borderColor: cancelBtnBorder,
                  color: cancelBtnColor,
                  fontFamily,
                }}
                className="cursor-pointer bg-transparent border py-1 px-2 text-sm transition"
              >
                Отмена
              </button>
            </div>
          </div>
        ) : activeIsRecording ? (
          /* STATE 3: VOICE RECORDING (Compact side-by-side stop button) */
          <div className="flex flex-col justify-between p-1 space-y-2 animate-fadeIn min-h-[52px]">
            {/* Line 1: Sphere + Recording status + Timer */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="shrink-0 self-center">
                  <MiniMicSphere isRecording={true} color={accentColor} />
                </div>
                <span className="text-sm font-bold text-white flex items-center gap-1.5 truncate">
                  Запись голоса...
                </span>
              </div>
              <div
                className="text-sm font-mono font-extrabold bg-transparent backdrop-blur-md px-2.5 py-1 border shrink-0"
                style={{
                  borderRadius: btnRadius,
                  borderColor: hexToRgba(accentColor, 40),
                  color: accentColor,
                  fontFamily,
                }}
              >
                {Math.floor(activeRecordingTime / 60).toString().padStart(2, '0')}:{(activeRecordingTime % 60).toString().padStart(2, '0')}
              </div>
            </div>

            {/* Line 2: Compact Stop & Cancel buttons aligned right with company style */}
            <div className="flex items-center justify-end gap-2">
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
                className="cursor-pointer border font-bold py-1 px-3 flex items-center gap-1.5 text-sm transition active:scale-95 shadow shrink-0"
              >
                <Square className="w-3 h-3 fill-current shrink-0" style={{ color: stopBtnColor }} /> Завершить
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
                className="cursor-pointer border py-1 px-2.5 text-sm transition flex items-center gap-1 shrink-0"
              >
                <X className="w-3.5 h-3.5" style={{ color: cancelBtnColor }} /> Отмена
              </button>
            </div>
          </div>
        ) : (
          /* STATE 4: TEXT INPUT + OPTIONAL AUDIO PLAYER */
          <div className="flex flex-col gap-2 w-full">
            {/* Compact Audio Player if audio recorded (placed full width on top) */}
            {activeAudioUrl && (
              <CompactAudioPlayer audioUrl={activeAudioUrl} duration={activeRecordingTime} />
            )}

            {/* Input Row: MiniMicSphere left (vertically centered), Textarea middle, ExtraAction + Send button right */}
            <div className="flex items-center gap-2.5 min-w-0 w-full">
              {/* Dedicated Mic Sphere Container on Left */}
              <MiniMicSphere
                isRecording={false}
                onClick={handleStartRecording}
                color={accentColor}
              />

              {/* Textarea: Enter creates newline, expands from minRows */}
              <textarea
                ref={textareaRef}
                value={value}
                onChange={(e) => {
                  const newVal = maxLength ? e.target.value.slice(0, maxLength) : e.target.value;
                  onChange(newVal);
                }}
                placeholder={placeholder}
                rows={minRows}
                style={{
                  minHeight: minRows === 1 ? "36px" : `${Math.max(44, minRows * 22)}px`,
                  maxHeight: `${Math.max(activeAudioUrl ? 140 : 220, minRows * 28)}px`,
                  scrollbarColor: `${accentColor} transparent`,
                  fontFamily,
                  color: theme?.bodyTextColor || "#FFFFFF",
                }}
                className="flex-1 min-w-0 bg-transparent py-1.5 px-1 text-sm placeholder-white/50 focus:outline-none resize-none overflow-y-auto mini-gold-scrollbar transition-all border-none leading-relaxed"
              />

              {/* Optional Fullscreen Button */}
              {allowFullscreen && (
                <button
                  type="button"
                  onClick={() => setIsFullscreen(true)}
                  title="Развернуть на весь экран"
                  className="p-2 rounded-xl bg-transparent backdrop-blur-md border border-[#E7C768]/50 text-[#E7C768] hover:border-[#E7C768] transition cursor-pointer self-start shrink-0"
                >
                  <Maximize2 className="w-4 h-4" />
                </button>
              )}

              {/* Extra action right inside input box (e.g. AI enhancement icon) */}
              {extraAction}

              {/* Quick Send Button right inside input box */}
              {onSubmit && (
                <button
                  type="button"
                  onClick={onSubmit}
                  disabled={!value.trim() || isSubmitting}
                  title="Отправить сообщение"
                  style={{
                    borderRadius: btnRadius,
                    backgroundColor: stopBtnBg,
                    color: stopBtnColor,
                    fontFamily,
                  }}
                  className="landing-btn-active cursor-pointer shrink-0 w-9 h-9 self-center flex items-center justify-center hover:opacity-90 rounded-xl transition active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed shadow-md"
                >
                  <Send className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Fullscreen Modal if allowFullscreen is enabled */}
      {allowFullscreen && isFullscreen && (
        <div className="fixed inset-0 z-[9990] bg-gradient-to-br from-[#17344F] to-[#265582] p-4 sm:p-6 overflow-auto flex flex-col gap-3">
          <div className="max-w-5xl w-full mx-auto flex-1 flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-sm font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">
                {label || "Полноэкранный режим редактирования"}
              </span>
              <button
                type="button"
                onClick={() => setIsFullscreen(false)}
                className="px-4 py-2 rounded-xl text-sm font-bold inline-flex items-center gap-1.5 bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] text-[#17344F] shadow-md cursor-pointer"
              >
                <Minimize2 className="w-4 h-4" /> Закрыть полноэкранный режим
              </button>
            </div>
            <div className="flex-1 flex items-start gap-3 bg-transparent backdrop-blur-xl border border-[#E7C768]/50 rounded-3xl p-4">
              <MiniMicSphere
                isRecording={activeIsRecording}
                onClick={activeIsRecording ? handleStopRecording : handleStartRecording}
                color={accentColor}
              />
              <textarea
                value={value}
                onChange={(e) => {
                  const newVal = maxLength ? e.target.value.slice(0, maxLength) : e.target.value;
                  onChange(newVal);
                }}
                placeholder={placeholder}
                className="flex-1 h-full min-h-[65vh] bg-transparent text-white text-sm leading-relaxed focus:outline-none resize-none mini-gold-scrollbar"
              />
            </div>
          </div>
        </div>
      )}

      {/* Action Submit Button (if needed below field with custom text) */}
      {onSubmit && value.trim().length > 0 && !activeIsRecording && !activeIsTranscribing && !activeShowMicNotice && submitButtonText && submitButtonText !== "Отправить" && (
        <div className="flex justify-center pt-1 animate-fadeIn">
          <button
            onClick={onSubmit}
            type="button"
            disabled={isSubmitting}
            className="landing-btn-active w-full cursor-pointer bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#CBA335] text-[#17344F] font-extrabold px-4 py-2.5 rounded-xl shadow-lg transition transform hover:scale-[1.01] active:scale-95 flex items-center justify-center gap-1.5 text-sm disabled:opacity-50"
          >
            <Sparkles className="w-4 h-4 fill-current" />
            {submitButtonText}
          </button>
        </div>
      )}
    </div>
  );
}

