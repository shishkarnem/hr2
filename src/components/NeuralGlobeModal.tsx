import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import Mascot from "@/components/Mascot";
import { Sparkles, Mic, Loader2 } from "lucide-react";

interface NeuralGlobeModalProps {
  isOpen: boolean;
  statusText: string;
  subText?: string;
  chatId?: string;
  isRecording?: boolean;
  recordingTime?: number;
  processingSeconds?: number;
  onCancel?: () => void;
  onRunProMax?: () => void;
}

export default function NeuralGlobeModal({
  isOpen,
  statusText,
  subText,
  chatId,
  isRecording,
  recordingTime = 0,
  processingSeconds = 0,
  onCancel,
  onRunProMax
}: NeuralGlobeModalProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;
    let angle = 0;

    const resize = () => {
      canvas.width = canvas.parentElement?.clientWidth || 360;
      canvas.height = canvas.parentElement?.clientHeight || 280;
    };
    resize();
    window.addEventListener("resize", resize);

    // Render animated 3D Neural Network Sphere Canvas
    const numPoints = 60;
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
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const cx = canvas.width / 2;
      const cy = canvas.height / 2;
      const radius = Math.min(cx, cy) * 0.75;

      angle += 0.015;

      const projected: { x: number; y: number; z: number }[] = [];

      // Rotate and project points
      points.forEach((p) => {
        // Rotate around Y
        const x1 = p.x * Math.cos(angle) - p.z * Math.sin(angle);
        const z1 = p.x * Math.sin(angle) + p.z * Math.cos(angle);

        // Rotate around X
        const y2 = p.y * Math.cos(angle * 0.7) - z1 * Math.sin(angle * 0.7);
        const z2 = p.y * Math.sin(angle * 0.7) + z1 * Math.cos(angle * 0.7);

        const screenX = cx + x1 * radius;
        const screenY = cy + y2 * radius;

        projected.push({ x: screenX, y: screenY, z: z2 });
      });

      // Draw connections
      ctx.lineWidth = 0.8;
      for (let i = 0; i < projected.length; i++) {
        for (let j = i + 1; j < projected.length; j++) {
          const dx = projected[i].x - projected[j].x;
          const dy = projected[i].y - projected[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < radius * 0.55) {
            const alpha = (1 - dist / (radius * 0.55)) * 0.4;
            ctx.strokeStyle = `rgba(231, 199, 104, ${alpha})`;
            ctx.beginPath();
            ctx.moveTo(projected[i].x, projected[i].y);
            ctx.lineTo(projected[j].x, projected[j].y);
            ctx.stroke();
          }
        }
      }

      // Draw nodes
      projected.forEach((p) => {
        const scale = (p.z + 1.5) / 2.5;
        const nodeRadius = Math.max(1.5, 3 * scale);
        ctx.fillStyle = p.z > 0 ? "#E7C768" : "#22D3EE";
        ctx.beginPath();
        ctx.arc(p.x, p.y, nodeRadius, 0, Math.PI * 2);
        ctx.fill();
      });

      // Outer glowing ring matching rotating sphere grid diameter 1:1
      ctx.strokeStyle = "rgba(231, 199, 104, 0.25)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.stroke();

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", resize);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const formatTimer = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const secs = sec % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md transition-all animate-fadeIn">
      <div className="relative w-full max-w-md bg-[#17344F] border border-[#E7C768]/30 rounded-3xl p-6 shadow-2xl overflow-hidden flex flex-col items-center text-center max-h-[90vh] overflow-y-auto">
        
        {/* Top Header */}
        <div className="w-full flex items-center justify-between border-b border-white/10 pb-3 mb-4 text-xs font-mono text-slate-300">
          <span className="flex items-center gap-1.5 text-[#E7C768] font-semibold">
            <Sparkles className="w-4 h-4 animate-spin" /> RR Voice Engine
          </span>
        </div>

        {/* Neural Canvas & Mascot Container - Completely Transparent */}
        <div className="relative w-full h-56 my-2 flex items-center justify-center rounded-2xl overflow-hidden bg-transparent border-none">
          {/* Animated 3D Globe Canvas */}
          <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />

          {/* Mascot in center */}
          <div className="relative z-10 scale-90">
            <Mascot
              state={isRecording ? "chat" : "narrator"}
              size="md"
              speechBubble={statusText}
            />
          </div>
        </div>

        {/* Recording status & Live pulse - Golden Accent instead of red */}
        {isRecording && (
          <div className="mt-4 flex items-center gap-2 bg-[#E7C768]/20 text-[#E7C768] px-4 py-2 rounded-full border border-[#E7C768]/40 animate-pulse text-sm font-semibold">
            <span className="w-2.5 h-2.5 bg-[#E7C768] rounded-full animate-ping" />
            <Mic className="w-4 h-4" /> Идет запись голоса: <span className="font-mono">{formatTimer(recordingTime)}</span>
          </div>
        )}

        {!isRecording && (
          <div className="mt-4 flex flex-col items-center gap-2 text-slate-300 text-sm">
            <div className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 text-[#E7C768] animate-spin" />
              <span>{subText || "Обработка и распознавание речи..."}</span>
            </div>
            {processingSeconds > 0 && (
              <span className="text-xs font-mono text-[#E7C768] bg-black/30 px-3 py-1 rounded-full border border-white/10">
                Время обработки нейросетью: <strong className="font-bold">{processingSeconds} сек.</strong>
              </span>
            )}

            {/* 120s Timeout & ProMax Backup Trigger */}
            {processingSeconds >= 120 && (
              <div className="mt-3 bg-transparent backdrop-blur-xl border border-[#E7C768]/50 rounded-2xl p-4 text-center space-y-2.5 animate-fade-in max-w-sm">
                <p className="text-sm font-bold text-[#E7C768]">
                  Основная нейросеть не ответила за 120 секунд.
                </p>
                <p className="text-sm text-white/90">
                  Запустите резервную сверхбыструю модель RR ProMax для моментального получения оценки.
                </p>
                {onRunProMax && (
                  <button
                    onClick={onRunProMax}
                    type="button"
                    className="cursor-pointer w-full bg-gradient-to-r from-[#E7C768] to-[#C29A3A] text-[#17344F] font-extrabold text-sm px-4 py-2.5 rounded-xl shadow-lg transition flex items-center justify-center gap-1.5"
                  >
                    <Sparkles className="w-4 h-4" /> Повторить с RR ProMax
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Action / Cancel Button */}
        {onCancel && (
          <button
            onClick={onCancel}
            type="button"
            className={`mt-5 cursor-pointer transition ${
              isRecording
                ? "bg-red-500 hover:bg-red-600 text-white font-extrabold px-8 py-3 rounded-2xl shadow-xl ring-2 ring-red-400 animate-pulse text-sm"
                : "text-xs text-slate-400 hover:text-white underline underline-offset-4"
            }`}
          >
            {isRecording ? "Остановить запись" : "Отмена"}
          </button>
        )}
      </div>
    </div>,
    document.body
  );
}
