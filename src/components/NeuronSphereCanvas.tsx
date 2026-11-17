import React, { useEffect, useRef } from "react";

function hexToRgba(hex: string, alpha: number): string {
  if (!hex) return `rgba(231, 199, 104, ${alpha})`;
  let c = hex.replace("#", "").trim();
  if (c.length === 3) c = c.split("").map((x) => x + x).join("");
  if (c.length !== 6) return `rgba(231, 199, 104, ${alpha})`;
  const num = parseInt(c, 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * 3D Neural Wireframe Rotating Sphere for AI Assistant button and modal badges
 * Uses completely transparent canvas with dynamic theme neuron grid animation
 */
export default function NeuronSphereCanvas({
  size = 64,
  speed = 0.02,
  numPoints = 32,
  connectionDistance = 24,
  color = "#E7C768",
  lineColor,
  nodeColor,
}: {
  size?: number;
  speed?: number;
  numPoints?: number;
  connectionDistance?: number;
  color?: string;
  lineColor?: string;
  nodeColor?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const effectiveLineColor = lineColor || color;
  const effectiveNodeColor = nodeColor || color;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let ctx: CanvasRenderingContext2D | null = null;
    try {
      ctx = canvas.getContext("2d");
    } catch {
      return;
    }
    if (!ctx) return;

    let animId: number;
    let angle = 0;

    const points: { x: number; y: number; z: number }[] = [];
    for (let i = 0; i < numPoints; i++) {
      const phi = Math.acos(-1 + (2 * i) / numPoints);
      const theta = Math.sqrt(numPoints * Math.PI) * phi;
      points.push({
        x: Math.cos(theta) * Math.sin(phi),
        y: Math.sin(theta) * Math.sin(phi),
        z: Math.cos(phi),
      });
    }

    const render = () => {
      canvas.width = size;
      canvas.height = size;
      ctx.clearRect(0, 0, size, size);

      const cx = size / 2;
      const cy = size / 2;
      const radius = (size / 2) * 0.85;

      angle += speed;

      const projected: { x: number; y: number; z: number }[] = [];
      points.forEach((p) => {
        const x1 = p.x * Math.cos(angle) - p.z * Math.sin(angle);
        const z1 = p.x * Math.sin(angle) + p.z * Math.cos(angle);
        const y2 = p.y * Math.cos(angle * 0.7) - z1 * Math.sin(angle * 0.7);
        const z2 = p.y * Math.sin(angle * 0.7) + z1 * Math.cos(angle * 0.7);

        projected.push({
          x: cx + x1 * radius,
          y: cy + y2 * radius,
          z: z2,
        });
      });

      // Neural connection lines
      ctx.lineWidth = 1.0;
      for (let i = 0; i < projected.length; i++) {
        for (let j = i + 1; j < projected.length; j++) {
          const dx = projected[i].x - projected[j].x;
          const dy = projected[i].y - projected[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < connectionDistance) {
            const alpha = (1 - dist / connectionDistance) * 0.65;
            ctx.strokeStyle = hexToRgba(effectiveLineColor, alpha);
            ctx.beginPath();
            ctx.moveTo(projected[i].x, projected[i].y);
            ctx.lineTo(projected[j].x, projected[j].y);
            ctx.stroke();
          }
        }
      }

      // Neuron nodes
      projected.forEach((p) => {
        const scale = (p.z + 1.5) / 2.5;
        const nodeRadius = Math.max(1.2, 2.5 * scale);
        ctx.fillStyle = p.z > 0 ? effectiveNodeColor : "#FFFFFF";
        ctx.beginPath();
        ctx.arc(p.x, p.y, nodeRadius, 0, Math.PI * 2);
        ctx.fill();
      });

      // Outer delicate halo ring
      ctx.strokeStyle = hexToRgba(effectiveLineColor, 0.4);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.stroke();

      animId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animId);
  }, [size, speed, numPoints, connectionDistance, effectiveLineColor, effectiveNodeColor]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: size, height: size }}
      className="pointer-events-none block"
    />
  );
}
