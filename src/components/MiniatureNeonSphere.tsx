import React, { useEffect, useRef } from "react";

/** Reusable 3D Wireframe Neon Sphere / Animated Microphone Component */
export default function MiniatureNeonSphere({ isRecording }: { isRecording?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let angle = 0;

    const numPoints = 32;
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
      canvas.width = 80;
      canvas.height = 80;
      ctx.clearRect(0, 0, 80, 80);
      const cx = 40;
      const cy = 40;
      const radius = 32;

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

      ctx.lineWidth = 1.2;
      for (let i = 0; i < projected.length; i++) {
        for (let j = i + 1; j < projected.length; j++) {
          const dx = projected[i].x - projected[j].x;
          const dy = projected[i].y - projected[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 24) {
            const alpha = (1 - dist / 24) * 0.7;
            ctx.strokeStyle = `rgba(231, 199, 104, ${alpha})`;
            ctx.beginPath();
            ctx.moveTo(projected[i].x, projected[i].y);
            ctx.lineTo(projected[j].x, projected[j].y);
            ctx.stroke();
          }
        }
      }

      projected.forEach((p) => {
        const scale = (p.z + 1.5) / 2.5;
        const nodeRadius = Math.max(1.5, 3 * scale);
        ctx.fillStyle = p.z > 0 ? "#E7C768" : "#FFFFFF";
        ctx.beginPath();
        ctx.arc(p.x, p.y, nodeRadius, 0, Math.PI * 2);
        ctx.fill();
      });

      ctx.strokeStyle = isRecording ? "rgba(231, 199, 104, 0.9)" : "rgba(231, 199, 104, 0.5)";
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(cx, cy, radius + 2, 0, Math.PI * 2);
      ctx.stroke();

      animId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animId);
  }, [isRecording]);

  return <canvas ref={canvasRef} className="w-20 h-20 pointer-events-none" />;
}
