import React, { useState, useRef, useEffect } from "react";
import { Play, Pause, Volume2, Mic } from "lucide-react";

interface CustomAudioPlayerProps {
  audioUrl: string;
  title?: string;
  initialDuration?: number;
}

export default function CustomAudioPlayer({ audioUrl, title = "", initialDuration }: CustomAudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState<number>(initialDuration && initialDuration > 0 ? initialDuration : 0);
  const progressBarRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    setCurrentTime(0);
    setIsPlaying(false);
    if (initialDuration && initialDuration > 0) {
      setDuration(initialDuration);
    } else {
      setDuration(0);
    }

    let isCancelled = false;

    // Decode duration accurately using AudioContext for WebM/Blob/audio files
    if (audioUrl) {
      fetch(audioUrl)
        .then((res) => res.arrayBuffer())
        .then((arrayBuffer) => {
          if (isCancelled) return;
          const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
          if (!AudioContextClass) return;
          const audioCtx = new AudioContextClass();
          return audioCtx.decodeAudioData(arrayBuffer).then((audioBuffer) => {
            if (!isCancelled && audioBuffer && audioBuffer.duration && isFinite(audioBuffer.duration) && audioBuffer.duration > 0) {
              setDuration(audioBuffer.duration);
            }
            audioCtx.close().catch(() => {});
          });
        })
        .catch(() => {
          // ignore decode error
        });
    }

    const updateDuration = () => {
      if (audio.duration && isFinite(audio.duration) && audio.duration > 0) {
        setDuration(audio.duration);
      }
    };

    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      if ((!duration || !isFinite(duration)) && audio.duration && isFinite(audio.duration)) {
        setDuration(audio.duration);
      } else if (!isFinite(duration) || duration === 0) {
        setDuration((prev) => Math.max(prev, audio.currentTime));
      }
    };

    const onEnded = () => setIsPlaying(false);

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", updateDuration);
    audio.addEventListener("durationchange", updateDuration);
    audio.addEventListener("canplay", updateDuration);
    audio.addEventListener("ended", onEnded);

    // Force metadata load
    audio.load();

    return () => {
      isCancelled = true;
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", updateDuration);
      audio.removeEventListener("durationchange", updateDuration);
      audio.removeEventListener("canplay", updateDuration);
      audio.removeEventListener("ended", onEnded);
    };
  }, [audioUrl, initialDuration]);

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
    const targetDuration = duration && isFinite(duration) ? duration : audio.duration;
    if (!targetDuration || !isFinite(targetDuration)) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const width = rect.width;
    const pos = Math.max(0, Math.min(1, clickX / width));
    const newTime = pos * targetDuration;
    audio.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const formatTime = (seconds: number) => {
    if (!seconds || isNaN(seconds) || !isFinite(seconds) || seconds < 0) return "00:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  const validDuration = duration && isFinite(duration) ? duration : 0;
  const progressPercent = validDuration > 0 ? Math.min(100, (currentTime / validDuration) * 100) : 0;

  return (
    <div className="bg-transparent border border-white/20 rounded-2xl p-3 sm:p-4 flex items-center gap-3 sm:gap-4 text-white my-3">
      <audio ref={audioRef} src={audioUrl} preload="auto" />

      {/* Play/Pause button */}
      <button
        onClick={togglePlay}
        type="button"
        className="cursor-pointer bg-[#E7C768] text-[#17344F] hover:bg-[#F4EE8E] p-3 rounded-full shadow-lg transition transform active:scale-95 flex items-center justify-center shrink-0"
        title={isPlaying ? "Пауза" : "Воспроизвести"}
      >
        {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
      </button>

      {/* Track Info & Progress bar */}
      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          {title ? (
            <span className="font-semibold text-slate-200 truncate flex items-center gap-1.5 mr-2">
              <Mic className="w-3.5 h-3.5 text-[#E7C768] shrink-0" />
              {title}
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-xs text-[#E7C768]">
              <Mic className="w-3.5 h-3.5 shrink-0" />
            </span>
          )}
          <span className="text-slate-300 font-mono text-[11px] shrink-0 ml-auto">
            {formatTime(currentTime)} / {formatTime(validDuration)}
          </span>
        </div>

        {/* Custom Interactive Progress Bar */}
        <div
          ref={progressBarRef}
          onClick={handleSeek}
          className="w-full bg-white/15 hover:bg-white/25 h-2.5 rounded-full cursor-pointer relative overflow-hidden transition group"
        >
          <div
            className="bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] h-full rounded-full transition-all duration-75 relative"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Waveform indicator */}
      <div className="hidden sm:flex items-center gap-0.5 text-[#E7C768] opacity-80 px-1 shrink-0">
        <span className={`w-1 bg-[#E7C768] rounded-full transition-all ${isPlaying ? "h-4 animate-pulse" : "h-2"}`} />
        <span className={`w-1 bg-[#E7C768] rounded-full transition-all ${isPlaying ? "h-6 animate-pulse delay-75" : "h-3"}`} />
        <span className={`w-1 bg-[#E7C768] rounded-full transition-all ${isPlaying ? "h-3 animate-pulse delay-150" : "h-1.5"}`} />
        <span className={`w-1 bg-[#E7C768] rounded-full transition-all ${isPlaying ? "h-5 animate-pulse delay-100" : "h-2.5"}`} />
      </div>
    </div>
  );
}
