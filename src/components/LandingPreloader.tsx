import React, { useEffect, useMemo, useRef, useState } from "react";
import { Sparkles, Zap } from "lucide-react";
import { MASCOT } from "@/lib/mascotImages";
import { brandImage } from "@/config";

import { rrImg } from "@/lib/img";

// List of all critical landing images & mascots to cache into memory (all mapped to direct ProTalk CDN URLs)
const ASSETS_TO_PRELOAD = [
  rrImg("/files/11/rr-logo.png"),
  rrImg("/files/13/rr2.png"),
  rrImg("/files/4/rr3.png"),
  rrImg("/files/5/rr4.png"),
  rrImg("/files/6/rr5.png"),
  rrImg("/files/7/rr6.png"),
  rrImg("/files/8/rr7.png"),
  rrImg("/files/9/rr8.png"),
  rrImg("/files/10/rr9.png"),
  rrImg("/files/3/rr10.png"),
  rrImg("/files/2/rr11.png"),
  rrImg("/files/1/rrpromax.png"),
  MASCOT.greeting,
  MASCOT.shine,
  MASCOT.success,
  MASCOT.megaphone,
  MASCOT.serious,
  MASCOT.question,
  MASCOT.clock,
  MASCOT.empty,
  MASCOT.broken,
  MASCOT.cashier,
  MASCOT.logo,
  brandImage("RR-Logo"),
  brandImage("RRproMax"),
];

// Deduplicate URLs
const UNIQUE_ASSETS = Array.from(new Set(ASSETS_TO_PRELOAD.map((u) => rrImg(u)).filter(Boolean)));

const DEFAULT_EMPLOYER_PHRASES = [
  "Вход в кабинет работодателя...",
  "Синхронизация профиля и компаний...",
  "Загрузка базы кандидатов и скорингов...",
  "Инициализация ИИ-куратора и вакансий...",
  "Синхронизация баланса и лимитов...",
  "Кабинет готов к работе!",
];

const DEFAULT_LANDING_PHRASES = [
  "Инициализация нейросети...",
  "Кэширование интерактивных модулей...",
  "Загрузка 3D-маскотов и бренд-графики...",
  "Подготовка симуляторов интервью...",
  "Синхронизация интерфейса платформы...",
  "Готово к работе!",
];

interface UnitNode3D {
  uX: number;
  uY: number;
  uZ: number;
  pulse: number;
}

interface Ripple {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  alpha: number;
  color: string;
}

interface LandingPreloaderProps {
  onComplete?: () => void;
  minDurationMs?: number;
  mode?: "landing" | "employer";
  title?: string;
  subtitle?: string;
  phrases?: string[];
  externalProgress?: number;
  externalStatusText?: string;
  isReady?: boolean;
}

export default function LandingPreloader({
  onComplete,
  minDurationMs = 1200,
  mode = "landing",
  title,
  subtitle,
  phrases,
  externalProgress,
  externalStatusText,
  isReady,
}: LandingPreloaderProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ripplesRef = useRef<Ripple[]>([]);
  const pointerPos = useRef({ x: 0, y: 0, targetX: 0, targetY: 0 });
  const radarAngleRef = useRef<number>(0);
  const globeRotXRef = useRef<number>(0.2);
  const globeRotYRef = useRef<number>(0);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const isReadyRef = useRef(isReady);
  isReadyRef.current = isReady;

  const displayTitle = title ?? (mode === "employer" ? "Кабинет работодателя" : "Робот Рекрутер");
  const displaySubtitle = subtitle ?? (mode === "employer" ? "Инициализация рабочего пространства и данных" : "Автоматизация найма и обучения 24/7");

  const stepPhrases = useMemo(() => {
    if (phrases && phrases.length > 0) return phrases;
    return mode === "employer" ? DEFAULT_EMPLOYER_PHRASES : DEFAULT_LANDING_PHRASES;
  }, [phrases, mode]);

  const [progress, setProgress] = useState(externalProgress ?? 0);
  const [currentStepText, setCurrentStepText] = useState(externalStatusText || stepPhrases[0]);
  const [isFinishing, setIsFinishing] = useState(false);

  useEffect(() => {
    if (typeof externalProgress === "number") {
      setProgress((prev) => Math.max(prev, Math.min(100, externalProgress)));
    }
  }, [externalProgress]);

  useEffect(() => {
    if (externalStatusText) {
      setCurrentStepText(externalStatusText);
    }
  }, [externalStatusText]);

  // Smooth, guaranteed preloading progression
  useEffect(() => {
    let loadedCount = 0;
    const totalAssets = UNIQUE_ASSETS.length;
    const startTime = Date.now();
    let isCancelled = false;
    let finished = false;

    // Track real asset load count
    const onAssetLoaded = () => {
      if (isCancelled) return;
      loadedCount++;
    };

    // Controlled concurrency queue (max 3 at a time) to prevent mobile cellular network starvation
    const queue = [...UNIQUE_ASSETS];
    let active = 0;
    const maxConcurrent = 3;

    function next() {
      if (isCancelled) return;
      while (active < maxConcurrent && queue.length > 0) {
        const src = queue.shift()!;
        active++;
        const img = new Image();
        img.src = src;
        const done = () => {
          active--;
          onAssetLoaded();
          next();
        };
        if (img.complete) {
          done();
        } else {
          img.onload = done;
          img.onerror = done;
        }
      }
    }
    next();

    const interval = setInterval(() => {
      if (isCancelled || finished) return;

      const elapsed = Date.now() - startTime;
      const timeRatio = Math.min(1, elapsed / minDurationMs);
      const assetRatio = totalAssets > 0 ? Math.min(1, loadedCount / totalAssets) : 1;
      const readyState = isReadyRef.current;

      // When isReady is undefined (not passed), we rely on time & assets.
      // When isReady is defined, we DO NOT reach 100% until isReady === true!
      let targetRatio: number;
      if (readyState === undefined) {
        targetRatio = timeRatio >= 1 ? 1 : Math.min(0.99, Math.max(timeRatio, timeRatio * 0.6 + assetRatio * 0.4));
      } else if (!readyState) {
        // Still waiting for DB: cap progression at 92%
        targetRatio = Math.min(0.92, Math.max(timeRatio * 0.7, assetRatio * 0.85));
      } else {
        // Ready! Proceed to 100%
        targetRatio = 1;
      }

      const curPercent = Math.round(targetRatio * 100);
      setProgress((prev) => Math.max(prev, curPercent));

      const phraseIdx = Math.min(
        stepPhrases.length - 1,
        Math.floor(targetRatio * (stepPhrases.length - 1))
      );
      if (!externalStatusText) {
        setCurrentStepText(stepPhrases[phraseIdx]);
      }

      if (targetRatio >= 1 && (readyState === undefined || readyState === true)) {
        finished = true;
        clearInterval(interval);
        setProgress(100);
        setCurrentStepText(stepPhrases[stepPhrases.length - 1]);

        setTimeout(() => {
          if (isCancelled) return;
          setIsFinishing(true);

          setTimeout(() => {
            if (isCancelled) return;
            onCompleteRef.current?.();
          }, 300);
        }, 250);
      }
    }, 25);

    // Hard safety timeout in case DB request or network hangs
    const safetyTimer = setTimeout(() => {
      if (!isCancelled && !finished) {
        finished = true;
        clearInterval(interval);
        setProgress(100);
        setCurrentStepText(stepPhrases[stepPhrases.length - 1]);
        setIsFinishing(true);
        setTimeout(() => {
          if (!isCancelled) onCompleteRef.current?.();
        }, 300);
      }
    }, 12000);

    return () => {
      isCancelled = true;
      clearInterval(interval);
      clearTimeout(safetyTimer);
    };
  }, [minDurationMs, stepPhrases, externalStatusText]);

  // Full opaque 3D interactive sphere canvas effect with matching radar diameter
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };

    window.addEventListener("resize", handleResize);

    // Initialize 3D Globe Nodes on unit sphere (radius = 1)
    const globeNodesCount = 76;
    const globeNodes: UnitNode3D[] = [];

    for (let i = 0; i < globeNodesCount; i++) {
      const phi = Math.acos(-1 + (2 * i) / globeNodesCount);
      const theta = Math.sqrt(globeNodesCount * Math.PI) * phi;

      const uX = Math.cos(theta) * Math.sin(phi);
      const uY = Math.sin(theta) * Math.sin(phi);
      const uZ = Math.cos(phi);

      globeNodes.push({
        uX,
        uY,
        uZ,
        pulse: Math.random() * Math.PI * 2,
      });
    }

    // Pointer events for interactive response
    const handlePointerMove = (e: MouseEvent | TouchEvent) => {
      const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
      const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
      pointerPos.current.targetX = (clientX / width - 0.5) * 2;
      pointerPos.current.targetY = (clientY / height - 0.5) * 2;
    };

    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
      const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
      ripplesRef.current.push({
        x: clientX,
        y: clientY,
        radius: 0,
        maxRadius: Math.max(width, height) * 0.45,
        alpha: 0.95,
        color: Math.random() > 0.5 ? "#F4EE8E" : "#E7C768",
      });
    };

    window.addEventListener("mousemove", handlePointerMove);
    window.addEventListener("touchstart", handlePointerMove);
    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("touchstart", handlePointerDown);

    let time = 0;

    const render = () => {
      time += 0.014;

      // 1. FULL SOLID BACKGROUND
      const bgGrad = ctx.createRadialGradient(
        width * 0.5,
        height * 0.45,
        50,
        width * 0.5,
        height * 0.45,
        Math.max(width, height) * 0.85
      );
      bgGrad.addColorStop(0, "#122B43");
      bgGrad.addColorStop(0.5, "#0D2034");
      bgGrad.addColorStop(1, "#07121E");

      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);

      // Smooth pointer interpolation
      pointerPos.current.x += (pointerPos.current.targetX - pointerPos.current.x) * 0.05;
      pointerPos.current.y += (pointerPos.current.targetY - pointerPos.current.y) * 0.05;

      const isMobile = width < 768;
      const centerX = width * 0.5;
      const centerY = height * (isMobile ? 0.36 : 0.38);

      // Radar and Sphere exact matching radius
      const radarRadius = Math.min(width * (isMobile ? 0.38 : 0.28), height * (isMobile ? 0.23 : 0.24));
      const sphereRadius = radarRadius;

      // 2. CENTRAL PLANET ATMOSPHERE GLOW
      ctx.save();
      const coreGlow = ctx.createRadialGradient(
        centerX,
        centerY,
        radarRadius * 0.15,
        centerX,
        centerY,
        radarRadius * 1.8
      );
      coreGlow.addColorStop(0, "rgba(244, 238, 142, 0.40)");
      coreGlow.addColorStop(0.3, "rgba(231, 199, 104, 0.25)");
      coreGlow.addColorStop(0.65, "rgba(38, 85, 130, 0.15)");
      coreGlow.addColorStop(1, "rgba(0, 0, 0, 0)");

      ctx.fillStyle = coreGlow;
      ctx.beginPath();
      ctx.arc(centerX, centerY, radarRadius * 1.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // 3. RADAR SCANNING GRID & ORBITAL RINGS
      ctx.save();
      ctx.lineWidth = 1;

      // Concentric grid rings
      const ringSteps = [0.33, 0.66, 1.0];
      for (const step of ringSteps) {
        ctx.beginPath();
        ctx.arc(centerX, centerY, radarRadius * step, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(231, 199, 104, ${0.15 + step * 0.18})`;
        ctx.setLineDash([4, 6]);
        ctx.stroke();
      }
      ctx.setLineDash([]);

      // Radial Axes
      ctx.strokeStyle = "rgba(231, 199, 104, 0.22)";
      ctx.beginPath();
      ctx.moveTo(centerX - radarRadius, centerY);
      ctx.lineTo(centerX + radarRadius, centerY);
      ctx.moveTo(centerX, centerY - radarRadius);
      ctx.lineTo(centerX, centerY + radarRadius);
      ctx.stroke();

      // Rotating Radar Beam
      radarAngleRef.current += 0.018;
      const sweepAngle = radarAngleRef.current;
      const gradientSweep = ctx.createConicGradient(sweepAngle, centerX, centerY);
      gradientSweep.addColorStop(0, "rgba(244, 238, 142, 0.50)");
      gradientSweep.addColorStop(0.12, "rgba(231, 199, 104, 0.16)");
      gradientSweep.addColorStop(0.35, "rgba(231, 199, 104, 0)");
      gradientSweep.addColorStop(1, "rgba(231, 199, 104, 0)");

      ctx.fillStyle = gradientSweep;
      ctx.beginPath();
      ctx.arc(centerX, centerY, radarRadius, 0, Math.PI * 2);
      ctx.fill();

      // Outer Radar Ring (matches sphere perimeter exactly)
      ctx.strokeStyle = "rgba(231, 199, 104, 0.65)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(centerX, centerY, radarRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // 4. 3D NEON-GOLD GLOBE SPHERE IN CENTER (Diameter matches radar exactly)
      globeRotYRef.current += 0.008 + pointerPos.current.x * 0.006;
      globeRotXRef.current = 0.2 + pointerPos.current.y * 0.2;

      ctx.save();
      ctx.translate(centerX, centerY);

      const cosY = Math.cos(globeRotYRef.current);
      const sinY = Math.sin(globeRotYRef.current);
      const cosX = Math.cos(globeRotXRef.current);
      const sinX = Math.sin(globeRotXRef.current);

      const projectedNodes: Array<{ x: number; y: number; z: number; pulse: number }> = [];

      globeNodes.forEach((node) => {
        // Rotate unit vector
        const x1 = node.uX * cosY - node.uZ * sinY;
        const z1 = node.uZ * cosY + node.uX * sinY;
        const y1 = node.uY * cosX - z1 * sinX;
        const z2 = z1 * cosX + node.uY * sinX;

        // Orthographic projection scaled by sphereRadius (guarantees x^2 + y^2 <= sphereRadius^2)
        projectedNodes.push({
          x: x1 * sphereRadius,
          y: y1 * sphereRadius,
          z: z2,
          pulse: node.pulse + time,
        });
      });

      // Globe Node Connections
      ctx.lineWidth = 1.0;
      const maxConnectDist = sphereRadius * 0.55;
      for (let i = 0; i < projectedNodes.length; i++) {
        for (let j = i + 1; j < projectedNodes.length; j++) {
          const p1 = projectedNodes[i];
          const p2 = projectedNodes[j];

          // Connect nodes on front and mid hemisphere
          if (p1.z < 0.35 && p2.z < 0.35) {
            const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
            if (dist < maxConnectDist) {
              const alpha = (1 - dist / maxConnectDist) * 0.5;
              ctx.strokeStyle = `rgba(231, 199, 104, ${alpha})`;
              ctx.beginPath();
              ctx.moveTo(p1.x, p1.y);
              ctx.lineTo(p2.x, p2.y);
              ctx.stroke();
            }
          }
        }
      }

      // Globe Nodes Drawing with Bright Glow
      projectedNodes.forEach((p) => {
        // z is in [-1, 1], z < 0 is front
        const isFront = p.z < 0;
        const opacity = isFront ? 0.95 : Math.max(0.25, 0.6 - p.z * 0.35);
        const nodeRadius = (Math.sin(p.pulse) * 0.8 + 2.6) * (isFront ? 1.2 : 0.8);

        ctx.fillStyle = isFront ? "#FFF9C4" : "#E7C768";
        ctx.shadowColor = "#F4EE8E";
        ctx.shadowBlur = isFront ? 8 : 3;
        ctx.globalAlpha = opacity;
        ctx.beginPath();
        ctx.arc(p.x, p.y, nodeRadius, 0, Math.PI * 2);
        ctx.fill();
      });

      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
      ctx.restore();

      // 5. INTERACTIVE RIPPLES
      for (let i = ripplesRef.current.length - 1; i >= 0; i--) {
        const r = ripplesRef.current[i];
        r.radius += 4.5;
        r.alpha -= 0.015;

        if (r.alpha <= 0 || r.radius >= r.maxRadius) {
          ripplesRef.current.splice(i, 1);
          continue;
        }

        ctx.save();
        ctx.beginPath();
        ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
        ctx.strokeStyle = r.color;
        ctx.globalAlpha = r.alpha;
        ctx.lineWidth = 2.5;
        ctx.shadowColor = r.color;
        ctx.shadowBlur = 16;
        ctx.stroke();

        if (r.radius > 25) {
          ctx.beginPath();
          ctx.arc(r.x, r.y, r.radius * 0.65, 0, Math.PI * 2);
          ctx.lineWidth = 1.2;
          ctx.stroke();
        }
        ctx.restore();
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("mousemove", handlePointerMove);
      window.removeEventListener("touchstart", handlePointerMove);
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("touchstart", handlePointerDown);
    };
  }, []);

  return (
    <div
      className={`fixed inset-0 z-[9999] bg-[#07121E] flex flex-col items-center justify-center p-4 sm:p-6 select-none cursor-pointer transition-opacity duration-300 ease-out ${
        isFinishing ? "opacity-0 pointer-events-none" : "opacity-100"
      }`}
      onClick={() => {
        // Allow skipping if already well progressed
        if (progress > 60) {
          setProgress(100);
          setIsFinishing(true);
          setTimeout(() => onCompleteRef.current?.(), 200);
        }
      }}
    >
      {/* 3D Sphere Canvas */}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full block" />

      {/* Progress & Brand Info Container */}
      <div className="relative z-10 w-full max-w-lg bg-transparent backdrop-blur-2xl border border-white/20 rounded-3xl p-6 sm:p-7 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.8)] text-center space-y-4">
        {/* Brand header */}
        <div className="flex items-center justify-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-transparent backdrop-blur-md border border-white/20 flex items-center justify-center shadow-inner">
            <Sparkles className="w-5 h-5 text-[#E7C768] animate-pulse" />
          </div>
          <div className="text-left">
            <h2 className="text-lg sm:text-xl font-bold bg-gradient-to-r from-[#FFF9C4] via-[#F4EE8E] to-[#D99E41] bg-clip-text text-transparent leading-tight">
              {displayTitle}
            </h2>
            <p className="text-sm text-white/80 font-sans">{displaySubtitle}</p>
          </div>
        </div>

        {/* Progress details: What we are waiting for & Percentage */}
        <div className="space-y-2.5 pt-1">
          <div className="flex justify-between items-center text-sm">
            <div className="text-white text-sm font-medium truncate pr-3 flex items-center gap-2 transition-all duration-150">
              <Zap className="w-4 h-4 text-[#E7C768] shrink-0 animate-bounce" />
              <span className="truncate">{currentStepText}</span>
            </div>
            <span className="font-bold text-lg sm:text-xl font-mono bg-gradient-to-r from-[#FFF9C4] via-[#F4EE8E] to-[#D99E41] bg-clip-text text-transparent shrink-0">
              {progress}%
            </span>
          </div>

          <div className="w-full h-3 bg-transparent backdrop-blur-md rounded-full overflow-hidden border border-white/20 p-0.5 relative">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#D99E41] via-[#E7C768] to-[#FFF9C4] transition-all duration-150 relative shadow-[0_0_12px_#E7C768]"
              style={{ width: `${Math.max(6, progress)}%` }}
            >
              <div className="absolute inset-0 bg-white/30 animate-pulse rounded-full" />
            </div>
          </div>

          <p className="text-sm text-white/70 text-center pt-1 font-sans">
            Ожидание ответа сервера и синхронизация данных
          </p>
        </div>
      </div>
    </div>
  );
}
