import React, { useEffect, useRef, useState } from "react";
import { CheckCircle2, UserCheck, ShieldCheck, Zap, Award } from "lucide-react";

interface Ripple {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  alpha: number;
  color: string;
}

interface Node3D {
  x: number;
  y: number;
  z: number;
  baseX: number;
  baseY: number;
  baseZ: number;
  pulse: number;
}

export interface ThemeColorsConfig {
  headingColor?: string;
  bodyTextColor?: string;
  boldTextColor?: string;
  iconColor?: string;
  headingsColorMode?: string;
  isMonochrome?: boolean;
  spherePrimaryColor?: string;
  sphereSecondaryColor?: string;
  sphereAccentColor?: string;
  wavePrimaryColor?: string;
  waveSecondaryColor?: string;
}

interface InteractiveLandingBackgroundProps {
  containerMode?: boolean;
  fixed?: boolean;
  showBadges?: boolean;
  showSphere?: boolean;
  showWaves?: boolean;
  scale?: number;
  themeColors?: ThemeColorsConfig;
  borderRadius?: string | number;
  sphereColor1?: string;
  sphereColor2?: string;
  sphereColor3?: string;
  waveColor1?: string;
  waveColor2?: string;
}

function hexToRgba(hex?: string, alpha: number = 1, fallback: string = "231, 199, 104"): string {
  if (!hex) return `rgba(${fallback}, ${alpha})`;
  let c = hex.replace("#", "").trim();
  if (c.length === 3) c = c.split("").map((x) => x + x).join("");
  if (c.length !== 6) return `rgba(${fallback}, ${alpha})`;
  const num = parseInt(c, 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function InteractiveLandingBackgroundInner({
  containerMode = false,
  showBadges = false,
  showSphere = true,
  showWaves = true,
  scale,
  themeColors,
  borderRadius,
  sphereColor1,
  sphereColor2,
  sphereColor3,
  waveColor1,
  waveColor2,
}: InteractiveLandingBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ripplesRef = useRef<Ripple[]>([]);
  const pointerPos = useRef<{ x: number; y: number; targetX: number; targetY: number }>({
    x: 0,
    y: 0,
    targetX: 0,
    targetY: 0,
  });

  // Keep latest visual props in a ref so the canvas animation loop never restarts on parent re-renders
  const propsRef = useRef({
    showBadges,
    showSphere,
    showWaves,
    scale,
    themeColors,
    sphereColor1,
    sphereColor2,
    sphereColor3,
    waveColor1,
    waveColor2,
  });
  propsRef.current = {
    showBadges,
    showSphere,
    showWaves,
    scale,
    themeColors,
    sphereColor1,
    sphereColor2,
    sphereColor3,
    waveColor1,
    waveColor2,
  };

  // Radar sweep angle
  const radarAngleRef = useRef<number>(0);

  // 3D Globe Rotation Angles
  const globeRotXRef = useRef<number>(0.2);
  const globeRotYRef = useRef<number>(0);

  // Radar active target pins state for HTML overlay
  const [radarHits, setRadarHits] = useState<
    Array<{
      id: number;
      angleOffset: number; // angle around central planet
      radiusFactor: number; // factor of planet radius
      pxX: number;
      pxY: number;
      label: string;
      sub: string;
      active: boolean;
      iconType: string;
    }>
  >([
    { id: 1, angleOffset: -0.4, radiusFactor: 1.55, pxX: 0, pxY: 0, label: "98% Совпадение", sub: "Senior Fullstack", active: false, iconType: "check" },
    { id: 2, angleOffset: 0.85, radiusFactor: 1.6, pxX: 0, pxY: 0, label: "ИИ-Скоринг 95", sub: "Резюме верифицировано", active: false, iconType: "shield" },
    { id: 3, angleOffset: 2.1, radiusFactor: 1.55, pxX: 0, pxY: 0, label: "Кандидат 24/7", sub: "Прошел AI-Интервью", active: false, iconType: "user" },
    { id: 4, angleOffset: 3.35, radiusFactor: 1.6, pxX: 0, pxY: 0, label: "+1000 RR Начислено", sub: "Приветственный бонус", active: false, iconType: "zap" },
    { id: 5, angleOffset: -1.75, radiusFactor: 1.5, pxX: 0, pxY: 0, label: "Онбординг 100%", sub: "ИИ-Обучение пройдено", active: false, iconType: "award" },
  ]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;

    const getParentDimensions = () => {
      const parent = canvas.parentElement;
      if (containerMode && parent) {
        const vh = window.innerHeight || 800;
        return {
          w: parent.clientWidth || 400,
          h: Math.min(parent.clientHeight || vh, vh),
        };
      }
      return {
        w: window.innerWidth,
        h: window.innerHeight,
      };
    };

    let { w: width, h: height } = getParentDimensions();
    canvas.width = width;
    canvas.height = height;
    if (containerMode) {
      canvas.style.height = `${height}px`;
    }

    let drawFrame: (() => void) | null = null;

    const updateContainerScrollOffset = () => {
      if (!containerMode || !canvas || !canvas.parentElement) return;
      const rect = canvas.parentElement.getBoundingClientRect();
      const vh = window.innerHeight || 800;
      const parentH = canvas.parentElement.clientHeight || vh;
      const maxOffset = Math.max(0, parentH - height);
      const offsetY = Math.min(maxOffset, Math.max(0, -rect.top));
      canvas.style.transform = `translate3d(0, ${offsetY}px, 0)`;
    };

    const handleResize = () => {
      if (!canvas) return;
      const dim = getParentDimensions();
      if (dim.w !== width || dim.h !== height) {
        if (dim.w !== width) width = canvas.width = dim.w;
        if (dim.h !== height) {
          height = canvas.height = dim.h;
          if (containerMode) {
            canvas.style.height = `${height}px`;
          }
        }
        if (drawFrame) drawFrame();
      }
      updateContainerScrollOffset();
    };

    window.addEventListener("resize", handleResize);
    if (containerMode) {
      window.addEventListener("scroll", updateContainerScrollOffset, { passive: true, capture: true });
    }

    let resizeObserver: ResizeObserver | null = null;
    if (containerMode && canvas.parentElement && typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(() => handleResize());
      resizeObserver.observe(canvas.parentElement);
    }

    // Initialize 3D Globe Nodes on unit sphere (scaled dynamically, lighter on mobile)
    const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
    const globeNodesCount = isMobile ? 32 : 65;
    const globeNodes: Node3D[] = [];

    for (let i = 0; i < globeNodesCount; i++) {
      const phi = Math.acos(-1 + (2 * i) / globeNodesCount);
      const theta = Math.sqrt(globeNodesCount * Math.PI) * phi;

      const ux = Math.cos(theta) * Math.sin(phi);
      const uy = Math.sin(theta) * Math.sin(phi);
      const uz = Math.cos(phi);

      globeNodes.push({
        x: ux,
        y: uy,
        z: uz,
        baseX: ux,
        baseY: uy,
        baseZ: uz,
        pulse: Math.random() * Math.PI * 2,
      });
    }

    // Handle Pointer / Touch
    const handlePointerMove = (e: MouseEvent | TouchEvent) => {
      const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
      const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;

      pointerPos.current.targetX = (clientX / width - 0.5) * 2;
      pointerPos.current.targetY = (clientY / height - 0.5) * 2;
    };

    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
      const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;

      const curColors = propsRef.current.themeColors;
      // Add interactive shockwave ripple
      const isMonochrome = Boolean(curColors?.isMonochrome) || (curColors?.headingsColorMode === "solid" && curColors?.headingColor === "#FFFFFF" && curColors?.bodyTextColor === "#FFFFFF");
      const isSilver = curColors?.headingsColorMode === "gradient-silver";
      const ripplePrimary = isMonochrome ? "#FFFFFF" : (curColors?.iconColor || (isSilver ? "#FFFFFF" : "#E7C768"));
      const rippleSecondary = isMonochrome ? "#FFFFFF" : (curColors?.headingColor || (isSilver ? "#FFFFFF" : "#F4EE8E"));

      ripplesRef.current.push({
        x: clientX,
        y: clientY,
        radius: 0,
        maxRadius: Math.max(width, height) * 0.4,
        alpha: 0.9,
        color: Math.random() > 0.5 ? ripplePrimary : rippleSecondary,
      });
    };

    window.addEventListener("mousemove", handlePointerMove);
    window.addEventListener("touchstart", handlePointerMove);
    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("touchstart", handlePointerDown);

    let time = 0;

    // Draw single frame without scheduling next RAF
    drawFrame = () => {
      const {
        showBadges: curShowBadges,
        showSphere: curShowSphere,
        showWaves: curShowWaves,
        scale: curScale,
        themeColors: curThemeColors,
      } = propsRef.current;

      ctx.clearRect(0, 0, width, height);

      // Smooth pointer interpolation
      pointerPos.current.x += (pointerPos.current.targetX - pointerPos.current.x) * 0.04;
      pointerPos.current.y += (pointerPos.current.targetY - pointerPos.current.y) * 0.04;

      // -----------------------------------------------------------------
      // UNIFIED CENTER FOR ALL 5 ELEMENTS
      // -----------------------------------------------------------------
      const centerX = width * 0.5;
      const centerY = containerMode ? height * 0.48 : height * (width < 768 ? 0.42 : 0.46);
      const currentPlanetRadius = Math.min(width, height) * (curScale ?? (containerMode ? 0.28 : (width < 768 ? 0.25 : 0.19)));

      // -----------------------------------------------------------------
      // DYNAMIC THEME COLORS CALCULATION
      // -----------------------------------------------------------------
      const isMonochrome = Boolean(curThemeColors?.isMonochrome) || (curThemeColors?.headingsColorMode === "solid" && curThemeColors?.headingColor === "#FFFFFF" && curThemeColors?.bodyTextColor === "#FFFFFF");
      const isSilver = curThemeColors?.headingsColorMode === "gradient-silver";
      
      const primaryAccent = isMonochrome ? "#FFFFFF" : (curThemeColors?.iconColor || (isSilver ? "#FFFFFF" : "#E7C768"));
      const headingColor = isMonochrome ? "#FFFFFF" : (curThemeColors?.headingColor || (isSilver ? "#FFFFFF" : "#F4EE8E"));
      const boldTextColor = curThemeColors?.boldTextColor || "#FFFFFF";
      const bodyTextColor = isMonochrome ? "#E2E8F0" : (curThemeColors?.bodyTextColor || "#E2E8F0");

      // -----------------------------------------------------------------
      // 1. DIAGONAL AURORA WAVE LAYERS
      // -----------------------------------------------------------------
      if (curShowWaves) {
        const waveHeight = height * 0.28;
        const waveBaseY = height * 0.75;

        // Wave Colors derived from theme
        const wave1Top = isMonochrome ? "rgba(255, 255, 255, 0.1)" : (curThemeColors?.bodyTextColor ? hexToRgba(bodyTextColor, 0.4, "16, 58, 94") : "#103A5E");
        const wave1Bottom = isMonochrome ? "rgba(255, 255, 255, 0.03)" : hexToRgba(primaryAccent, 0.25, "38, 85, 130");

        const wave2Top = isMonochrome ? "rgba(255, 255, 255, 0.18)" : primaryAccent;
        const wave2Bottom = isMonochrome ? "rgba(255, 255, 255, 0.05)" : hexToRgba(primaryAccent, 0.18, "231, 199, 104");

        const wave3Top = isMonochrome ? "rgba(255, 255, 255, 0.28)" : headingColor;
        const wave3Bottom = isMonochrome ? "rgba(255, 255, 255, 0.08)" : hexToRgba(headingColor, 0.22, "244, 238, 142");

        // Layer 1 - Deep Wave
        drawDiagonalWave(
          ctx,
          width,
          height,
          waveBaseY - 50,
          waveHeight,
          time * 0.4,
          0.0025,
          wave1Top,
          wave1Bottom,
          0.32
        );

        // Layer 2 - Mid Accent Wave
        drawDiagonalWave(
          ctx,
          width,
          height,
          waveBaseY - 10,
          waveHeight * 0.82,
          time * 0.53 + 2,
          0.0035,
          wave2Top,
          wave2Bottom,
          0.26
        );

        // Layer 3 - Bright Crest Wave
        drawDiagonalWave(
          ctx,
          width,
          height,
          waveBaseY + 30,
          waveHeight * 0.65,
          time * 0.73 + 4,
          0.0045,
          wave3Top,
          wave3Bottom,
          0.22
        );
      }

      // -----------------------------------------------------------------
      // 2. CENTRAL PLANET core atmosphere glow & 3. RECRUITING RADAR NETWORK & 4. 3D SPHERE
      // -----------------------------------------------------------------
      if (curShowSphere) {
        ctx.save();
        const coreGlow = ctx.createRadialGradient(
          centerX,
          centerY,
          currentPlanetRadius * 0.2,
          centerX,
          centerY,
          currentPlanetRadius * 2.2
        );
        coreGlow.addColorStop(0, hexToRgba(primaryAccent, 0.25));
        coreGlow.addColorStop(0.4, hexToRgba(bodyTextColor, 0.18, "38, 85, 130"));
        coreGlow.addColorStop(0.7, hexToRgba(bodyTextColor, 0.08, "16, 58, 94"));
        coreGlow.addColorStop(1, "rgba(0, 0, 0, 0)");

        ctx.fillStyle = coreGlow;
        ctx.beginPath();
        ctx.arc(centerX, centerY, currentPlanetRadius * 2.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // -----------------------------------------------------------------
        // 3. RECRUITING RADAR NETWORK & ORBITAL RINGS (Единый центр и единый диаметр)
        // -----------------------------------------------------------------
        const radarRadius = currentPlanetRadius;

        ctx.save();
        ctx.lineWidth = 1;

        // Concentric Radar Rings around Central Planet
        for (let r = 0.4; r <= 0.85; r += 0.22) {
          ctx.beginPath();
          ctx.arc(centerX, centerY, radarRadius * r, 0, Math.PI * 2);
          ctx.strokeStyle = hexToRgba(primaryAccent, 0.08 + r * 0.06);
          ctx.setLineDash([4, 6]);
          ctx.stroke();
        }
        ctx.setLineDash([]);

        // Radial Axes
        ctx.strokeStyle = hexToRgba(boldTextColor, 0.09, "255, 255, 255");
        ctx.beginPath();
        ctx.moveTo(centerX - radarRadius, centerY);
        ctx.lineTo(centerX + radarRadius, centerY);
        ctx.moveTo(centerX, centerY - radarRadius);
        ctx.lineTo(centerX, centerY + radarRadius);
        ctx.stroke();

        // Rotating Radar Sweep Beam (1.5x slower)
        radarAngleRef.current += 0.010;
        const sweepAngle = radarAngleRef.current;

        const gradientSweep = ctx.createConicGradient(sweepAngle, centerX, centerY);
        gradientSweep.addColorStop(0, hexToRgba(primaryAccent, 0.38));
        gradientSweep.addColorStop(0.12, hexToRgba(primaryAccent, 0.09));
        gradientSweep.addColorStop(0.35, hexToRgba(primaryAccent, 0));
        gradientSweep.addColorStop(1, hexToRgba(primaryAccent, 0));

        ctx.fillStyle = gradientSweep;
        ctx.beginPath();
        ctx.arc(centerX, centerY, radarRadius, 0, Math.PI * 2);
        ctx.fill();

        // Outer Sphere Circle Ring (matches rotating 3D mesh diameter 1:1)
        ctx.strokeStyle = hexToRgba(primaryAccent, 0.35);
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.restore();

        // -----------------------------------------------------------------
        // 4. 3D NEON GLOBE SPHERE IN THE CENTER
        // -----------------------------------------------------------------
        globeRotYRef.current += 0.005 + pointerPos.current.x * 0.004;
        globeRotXRef.current = 0.2 + pointerPos.current.y * 0.15;

        ctx.save();
        ctx.translate(centerX, centerY);

        // Project 3D Nodes around Central Planet with exact currentPlanetRadius so rotating grid diameter == outer circle diameter
        const projectedNodes: Array<{ x: number; y: number; z: number; pulse: number }> = [];

        const cosY = Math.cos(globeRotYRef.current);
        const sinY = Math.sin(globeRotYRef.current);
        const cosX = Math.cos(globeRotXRef.current);
        const sinX = Math.sin(globeRotXRef.current);

        globeNodes.forEach((node) => {
          // Rotate unit vector around Y
          const ux1 = node.baseX * cosY - node.baseZ * sinY;
          const uz1 = node.baseZ * cosY + node.baseX * sinY;
          // Rotate unit vector around X
          const uy1 = node.baseY * cosX - uz1 * sinX;
          const uz2 = uz1 * cosX + node.baseY * sinX;

          projectedNodes.push({
            x: ux1 * currentPlanetRadius,
            y: uy1 * currentPlanetRadius,
            z: uz2 * currentPlanetRadius,
            pulse: node.pulse + time,
          });
        });

        // Draw Globe Connections
        ctx.lineWidth = 0.85;
        const maxConnDist = currentPlanetRadius * 0.62;
        const zCutoff = currentPlanetRadius * 0.25;
        for (let i = 0; i < projectedNodes.length; i++) {
          for (let j = i + 1; j < projectedNodes.length; j++) {
            const p1 = projectedNodes[i];
            const p2 = projectedNodes[j];

            if (p1.z < zCutoff && p2.z < zCutoff) {
              const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
              if (dist < maxConnDist) {
                const alpha = (1 - dist / maxConnDist) * 0.4;
                ctx.strokeStyle = hexToRgba(primaryAccent, alpha);
                ctx.beginPath();
                ctx.moveTo(p1.x, p1.y);
                ctx.lineTo(p2.x, p2.y);
                ctx.stroke();
              }
            }
          }
        }

        // Draw Globe Nodes
        projectedNodes.forEach((p) => {
          const depthRatio = currentPlanetRadius > 0 ? p.z / currentPlanetRadius : 0;
          const opacity = Math.max(0.15, Math.min(1, 0.65 - depthRatio * 0.45));
          const radius = (Math.sin(p.pulse) * 0.8 + 2.3) * (p.z < 0 ? 1.25 : 0.8);

          ctx.fillStyle = p.z < 0 ? headingColor : primaryAccent;
          ctx.globalAlpha = opacity;
          ctx.beginPath();
          ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
          ctx.fill();
        });

        ctx.globalAlpha = 1;
        ctx.restore();
      }

      // -----------------------------------------------------------------
      // 6. INTERACTIVE SHOCKWAVE RIPPLES (Реакция на касания и клики)
      // -----------------------------------------------------------------
      for (let i = ripplesRef.current.length - 1; i >= 0; i--) {
        const r = ripplesRef.current[i];
        r.radius += 3.5; // 1.5x smoother expansion
        r.alpha -= 0.012;

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
        ctx.shadowBlur = 14;
        ctx.stroke();

        // Secondary inner ring wave
        if (r.radius > 20) {
          ctx.beginPath();
          ctx.arc(r.x, r.y, r.radius * 0.65, 0, Math.PI * 2);
          ctx.lineWidth = 1;
          ctx.stroke();
        }

        ctx.restore();
      }
    };

    // Main animation loop
    const render = () => {
      if (containerMode) {
        updateContainerScrollOffset();
      }
      // Speed reduced by 1.5x (from 0.015 to 0.010)
      time += 0.010;
      if (drawFrame) drawFrame();
      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", handleResize);
      if (containerMode) {
        window.removeEventListener("scroll", updateContainerScrollOffset, { capture: true } as any);
      }
      if (resizeObserver) resizeObserver.disconnect();
      window.removeEventListener("mousemove", handlePointerMove);
      window.removeEventListener("touchstart", handlePointerMove);
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("touchstart", handlePointerDown);
    };
  }, [containerMode]);

  const wrapperClass = containerMode
    ? `absolute inset-0 pointer-events-none z-0 overflow-hidden select-none ${borderRadius !== undefined ? "" : "rounded-3xl"}`
    : "fixed inset-0 pointer-events-none z-0 overflow-hidden select-none";

  return (
    <div
      className={wrapperClass}
      style={borderRadius !== undefined ? { borderRadius } : undefined}
    >
      {/* Interactive Background Canvas */}
      <canvas
        ref={canvasRef}
        className={containerMode ? "absolute top-0 left-0 w-full block will-change-transform" : "absolute inset-0 w-full h-full block"}
        style={borderRadius !== undefined ? { borderRadius } : undefined}
      />
    </div>
  );
}

const InteractiveLandingBackground = React.memo(InteractiveLandingBackgroundInner);
export default InteractiveLandingBackground;

// Helper: Diagonal Wave drawer with sinus waves and gradient fill
function drawDiagonalWave(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  offsetY: number,
  amplitude: number,
  time: number,
  frequency: number,
  colorTop: string,
  colorBottom: string,
  alpha: number
) {
  ctx.save();
  ctx.globalAlpha = alpha;

  // Slant canvas diagonally (~ -18 degrees)
  ctx.translate(width * 0.5, height * 0.5);
  ctx.rotate(-0.31);
  ctx.translate(-width * 0.5, -height * 0.5);

  const extendedWidth = width * 1.7;
  const startX = -width * 0.35;

  const grad = ctx.createLinearGradient(0, offsetY - amplitude, 0, height * 1.6);
  grad.addColorStop(0, colorTop);
  grad.addColorStop(1, colorBottom);

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(startX, height * 1.6);
  ctx.lineTo(startX, offsetY);

  for (let x = startX; x <= extendedWidth; x += 15) {
    const sinY =
      Math.sin(x * frequency + time) * amplitude * 0.5 +
      Math.cos(x * frequency * 0.5 + time * 0.8) * amplitude * 0.5;
    ctx.lineTo(x, offsetY + sinY);
  }

  ctx.lineTo(extendedWidth, height * 1.6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
