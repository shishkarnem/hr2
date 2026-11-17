import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Palette,
  Pipette,
  Type,
  Image as ImageIcon,
  Layers,
  Sliders,
  Code,
  Save,
  RotateCcw,
  Sparkles,
  Check,
  Upload,
  X,
  ChevronDown,
  Minimize2,
  Maximize2,
  Trash2,
  Bookmark,
  Bot,
  ExternalLink,
  Building,
  Video,
  Film,
  Smartphone,
  Monitor,
  Repeat,
  Play,
  AlertCircle,
  HelpCircle,
} from "lucide-react";
import { useFileUpload } from "../hooks/useFileUpload";
import MiniAudioField from "./MiniAudioField";
import RRImage from "./RRImage";
import { resolveActiveEmployerId } from "../lib/actorSession";
import { useAIWait } from "./AIWaitProvider";
import AcademyModal from "@/components/AcademyModal";
import { rrImg, DEFAULT_RR_LOGO_URL } from "@/lib/img";

export function isVideoUrl(url?: string): boolean {
  if (!url || typeof url !== "string") return false;
  const clean = url.trim().toLowerCase();
  if (clean.startsWith("data:video/")) return true;
  return (
    /\.(mp4|webm|ogg|mov|m4v|mkv|avi)(\?.*)?$/i.test(clean) ||
    clean.includes("/video/") ||
    clean.includes("blob:video")
  );
}

export interface LandingThemeConfig {
  // Fonts & Typography
  fontFamily?: string;
  headingsColorMode?: "gradient-gold" | "gradient-silver" | "solid";
  headingsSolidColor?: string;
  bodyTextColor?: string;
  boldTextColor?: string;
  iconColor?: string;
  lineHeight?: number; // e.g. 1.6
  fontSizeH1?: number; // in px, e.g. 36
  fontSizeH2?: number; // in px, e.g. 26
  fontSizeH3?: number; // in px, e.g. 20
  fontSizeH4?: number; // in px, e.g. 16
  fontSizeBody?: number; // in px, e.g. 15

  // Background & Images & Media
  pageBgColor?: string;
  pageBgOpacity?: number; // 0 - 100
  pageBgFilterColor?: string; // Overlay tint color
  pageBgFilterOpacity?: number; // 0 - 100
  pageBgImageUrl?: string; // Legacy fallback
  pageBgMediaUrl?: string; // Desktop (16:9) image or video
  pageBgMobileMediaUrl?: string; // Mobile (9:16) image or video
  pageBgVideoAutoplay?: boolean; // Default true
  pageBgVideoLoop?: boolean; // Default true
  pageBgDisplayMode?: "none" | "fixed" | "cover" | "parallax" | "tile";
  pageBgParallaxSpeed?: number; // 0.05 - 1.0, default 0.35

  heroBgImageUrl?: string; // Legacy fallback
  heroBgMediaUrl?: string; // Desktop (16:9) image or video
  heroBgMobileMediaUrl?: string; // Mobile (9:16) image or video
  heroBgFilterColor?: string; // Overlay tint color for hero
  heroBgFilterOpacity?: number; // 0 - 100
  heroBgVideoAutoplay?: boolean; // Default true
  heroBgVideoLoop?: boolean; // Default true
  heroBgDisplayMode?: "none" | "fixed" | "cover" | "parallax" | "tile";
  heroBgParallaxSpeed?: number; // 0.05 - 1.0, default 0.4

  // Company Logo Filter & Background
  logoFilterColor?: string; // Color tint overlay
  logoFilterOpacity?: number; // 0 - 100
  logoBgColor?: string; // Logo backing background
  logoBgOpacity?: number; // 0 - 100 (0 = transparent)

  // Monochrome (Grayscale) Toggles
  allMediaMonochrome?: boolean; // Master monochrome toggle for all media
  logoMonochrome?: boolean; // Monochrome logo
  heroBgMonochrome?: boolean; // Monochrome hero section background
  pageBgMonochrome?: boolean; // Monochrome page background
  sitePreviewMonochrome?: boolean; // Monochrome site previews & screenshots
  siteScreenshotMonochrome?: boolean; // Monochrome site screenshots

  showSphereAnimation?: boolean;
  showWaveAnimation?: boolean;
  sitePreviewHeight?: number; // Height in px for website previews (0 = hidden)
  siteDisplayMode?: "preview" | "buttons"; // Preview card vs simple action button
  sitePreviewFilterColor?: string; // Filter overlay for site preview cards
  sitePreviewFilterOpacity?: number; // 0 - 100
  siteScreenshotFilterColor?: string; // Filter overlay for uploaded site screenshots
  siteScreenshotFilterOpacity?: number; // 0 - 100

  // Containers & Glass
  containerBgColor?: string;
  containerBgOpacity?: number; // 0 - 100
  glassBlurPx?: number; // 0 to 40 px
  containerBorderColor?: string;
  containerBorderOpacity?: number; // 0 - 100
  containerBorderWidth?: number; // 0, 1, 2, 3, 4
  containerBorderRadius?: number; // in px, starting from 0px

  // Header / Topbar
  headerBgColor?: string;
  headerBgOpacity?: number; // 0 - 100
  headerBgFilterColor?: string; // Overlay tint color for header
  headerBgFilterOpacity?: number; // 0 - 100
  headerBorderColor?: string;
  headerBorderOpacity?: number; // 0 - 100
  headerBorderWidth?: number; // 0, 1, 2, 3
  headerBorderRadius?: number; // 0, 8, 14, 20, 28

  // Buttons
  btnActiveBgColor?: string;
  btnActiveTextColor?: string;
  btnActiveOpacity?: number; // 0 - 100
  btnInactiveBgColor?: string;
  btnInactiveTextColor?: string;
  btnInactiveOpacity?: number; // 0 - 100
  btnBorderColor?: string;
  btnBorderOpacity?: number; // 0 - 100
  btnBorderWidth?: number; // 0, 1, 2
  btnBorderRadius?: number; // in px, starting from 0px (0, 8, 14, 18, 24, 999)

  // Custom CSS
  customCss?: string;
}

export const GOOGLE_FONTS_LIST = [
  { name: "Системный (По умолчанию)", value: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", googleFont: null },
  { name: "Manrope (Геометричный гротеск)", value: "'Manrope', sans-serif", googleFont: "Manrope:wght@400;500;600;700;800&subset=cyrillic,cyrillic-ext" },
  { name: "Montserrat (Стильный современный)", value: "'Montserrat', sans-serif", googleFont: "Montserrat:wght@400;500;600;700;800;900&subset=cyrillic,cyrillic-ext" },
  { name: "Inter (Интерфейсный четкий)", value: "'Inter', sans-serif", googleFont: "Inter:wght@400;500;600;700;800;900&subset=cyrillic,cyrillic-ext" },
  { name: "Golos Text (Лаконичный отечественный)", value: "'Golos Text', sans-serif", googleFont: "Golos+Text:wght@400;500;600;700;800&subset=cyrillic,cyrillic-ext" },
  { name: "Roboto (Классический нейтральный)", value: "'Roboto', sans-serif", googleFont: "Roboto:wght@400;500;700;900&subset=cyrillic,cyrillic-ext" },
  { name: "Open Sans (Легко читаемый)", value: "'Open Sans', sans-serif", googleFont: "Open+Sans:wght@400;500;600;700;800&subset=cyrillic,cyrillic-ext" },
  { name: "Rubik (Мягкий скругленный)", value: "'Rubik', sans-serif", googleFont: "Rubik:wght@400;500;600;700;800&subset=cyrillic,cyrillic-ext" },
  { name: "Raleway (Элегантный контрастный)", value: "'Raleway', sans-serif", googleFont: "Raleway:wght@400;500;600;700;800;900&subset=cyrillic,cyrillic-ext" },
  { name: "Playfair Display (Премиум заголовочная антиква)", value: "'Playfair Display', serif", googleFont: "Playfair+Display:wght@500;600;700;800;900&subset=cyrillic,cyrillic-ext" },
  { name: "Unbounded (Футуристичный технологичный)", value: "'Unbounded', sans-serif", googleFont: "Unbounded:wght@400;600;700;800;900&subset=cyrillic,cyrillic-ext" },
  { name: "PT Sans (Деловой строгий)", value: "'PT Sans', sans-serif", googleFont: "PT+Sans:wght@400;700&subset=cyrillic,cyrillic-ext" },
  { name: "PT Serif (Классическая книжная антиква)", value: "'PT Serif', serif", googleFont: "PT+Serif:wght@400;700&subset=cyrillic,cyrillic-ext" },
  { name: "Fira Sans (Технический четкий)", value: "'Fira Sans', sans-serif", googleFont: "Fira+Sans:wght@400;500;600;700;800&subset=cyrillic,cyrillic-ext" },
  { name: "Nunito (Дружелюбный скругленный)", value: "'Nunito', sans-serif", googleFont: "Nunito:wght@400;500;600;700;800;900&subset=cyrillic,cyrillic-ext" },
  { name: "Ubuntu (Динамичный современный)", value: "'Ubuntu', sans-serif", googleFont: "Ubuntu:wght@400;500;700&subset=cyrillic,cyrillic-ext" },
  { name: "Comfortaa (Ультра-округлый мягкий)", value: "'Comfortaa', cursive", googleFont: "Comfortaa:wght@400;600;700&subset=cyrillic,cyrillic-ext" },
  { name: "Cormorant Garamond (Роскошная антиква)", value: "'Cormorant Garamond', serif", googleFont: "Cormorant+Garamond:wght@400;600;700&subset=cyrillic,cyrillic-ext" },
  { name: "Oswald (Плотный узкий заголовочный)", value: "'Oswald', sans-serif", googleFont: "Oswald:wght@400;500;600;700&subset=cyrillic,cyrillic-ext" },
  { name: "Merriweather (Плотная антиква)", value: "'Merriweather', serif", googleFont: "Merriweather:wght@400;700&subset=cyrillic,cyrillic-ext" },
  { name: "Exo 2 (Технологичный футуристичный)", value: "'Exo 2', sans-serif", googleFont: "Exo+2:wght@400;500;600;700;800&subset=cyrillic,cyrillic-ext" },
  { name: "Onest (Современный интерфейсный)", value: "'Onest', sans-serif", googleFont: "Onest:wght@400;500;600;700;800&subset=cyrillic,cyrillic-ext" },
  { name: "Jura (Узкий технологичный)", value: "'Jura', sans-serif", googleFont: "Jura:wght@400;500;600;700&subset=cyrillic,cyrillic-ext" },
  { name: "Yanone Kaffeesatz (Узкий винтажный)", value: "'Yanone Kaffeesatz', sans-serif", googleFont: "Yanone+Kaffeesatz:wght@400;600;700&subset=cyrillic,cyrillic-ext" },
  { name: "Bitter (Контрастная брусковая антиква)", value: "'Bitter', serif", googleFont: "Bitter:wght@400;600;700&subset=cyrillic,cyrillic-ext" },
  { name: "Vollkorn (Оригинальная антиква)", value: "'Vollkorn', serif", googleFont: "Vollkorn:wght@400;600;700&subset=cyrillic,cyrillic-ext" },
  { name: "Cuprum (Узкий деловой)", value: "'Cuprum', sans-serif", googleFont: "Cuprum:wght@400;600;700&subset=cyrillic,cyrillic-ext" },
  { name: "Press Start 2P (Пиксельный 8-bit)", value: "'Press Start 2P', cursive", googleFont: "Press+Start+2P&subset=cyrillic,cyrillic-ext" },
  { name: "Caveat (Живой рукописный)", value: "'Caveat', cursive", googleFont: "Caveat:wght@400;600;700&subset=cyrillic,cyrillic-ext" },
  { name: "Marck Script (Изящный курсивный)", value: "'Marck Script', cursive", googleFont: "Marck+Script&subset=cyrillic,cyrillic-ext" },
  { name: "Bad Script (Непринужденный рукописный)", value: "'Bad Script', cursive", googleFont: "Bad+Script&subset=cyrillic,cyrillic-ext" },
  { name: "Lobster (Жирный ретро акцент)", value: "'Lobster', cursive", googleFont: "Lobster&subset=cyrillic,cyrillic-ext" },
  { name: "Pacifico (Мягкий каллиграфический)", value: "'Pacifico', cursive", googleFont: "Pacifico&subset=cyrillic,cyrillic-ext" },
  { name: "Tenor Sans (Утонченный премиальный)", value: "'Tenor Sans', sans-serif", googleFont: "Tenor+Sans&subset=cyrillic,cyrillic-ext" },
  { name: "Neucha (Теплый печатный)", value: "'Neucha', cursive", googleFont: "Neucha&subset=cyrillic,cyrillic-ext" },
  { name: "Kelly Slab (Угловатый брусковый)", value: "'Kelly Slab', cursive", googleFont: "Kelly+Slab&subset=cyrillic,cyrillic-ext" },
  { name: "Podkova (Широкий брусковый)", value: "'Podkova', serif", googleFont: "Podkova:wght@400;600;700&subset=cyrillic,cyrillic-ext" },
  { name: "Ruslan Display (Славянский стиль)", value: "'Ruslan Display', cursive", googleFont: "Ruslan+Display&subset=cyrillic,cyrillic-ext" },
  { name: "Seymour One (Мощный плакатный)", value: "'Seymour One', sans-serif", googleFont: "Seymour+One&subset=cyrillic,cyrillic-ext" },
  { name: "Ruda (Плотный индустриальный)", value: "'Ruda', sans-serif", googleFont: "Ruda:wght@400;600;700;800;900&subset=cyrillic,cyrillic-ext" },
];

/** Ensures Google Font stylesheet is stably linked in head without triggering CSS re-parse flicker */
export function ensureGoogleFontLoaded(fontFamily?: string) {
  if (typeof document === "undefined" || !fontFamily) return;
  const selectedFont = GOOGLE_FONTS_LIST.find((f) => f.value === fontFamily || f.name === fontFamily);
  if (!selectedFont?.googleFont) return;

  const fontUrl = `https://fonts.googleapis.com/css2?family=${selectedFont.googleFont}&display=swap`;
  let fontLink = document.getElementById("landing-google-font-link") as HTMLLinkElement | null;
  if (!fontLink) {
    fontLink = document.createElement("link");
    fontLink.id = "landing-google-font-link";
    fontLink.rel = "stylesheet";
    fontLink.href = fontUrl;
    document.head.appendChild(fontLink);
  } else if (fontLink.href !== fontUrl) {
    fontLink.href = fontUrl;
  }
}

export const BUILTIN_STYLE_PRESETS: { id: string; name: string; desc: string; previewBg: string; theme: LandingThemeConfig }[] = [
  {
    id: "default",
    name: "Текущий",
    desc: "Фирменный стиль: глубокий синий фон, золотой градиент и стекло Liquid Glass",
    previewBg: "linear-gradient(135deg, #17344F 0%, #0F172A 100%)",
    theme: {
      fontFamily: "'Manrope', sans-serif",
      headingsColorMode: "gradient-gold",
      headingsSolidColor: "#E7C768",
      bodyTextColor: "#E2E8F0",
      boldTextColor: "#FFFFFF",
      iconColor: "#E7C768",
      lineHeight: 1.6,
      fontSizeH1: 36,
      fontSizeH2: 26,
      fontSizeH3: 20,
      fontSizeH4: 16,
      fontSizeBody: 15,
      pageBgColor: "#17344F",
      pageBgOpacity: 100,
      heroBgImageUrl: "",
      heroBgDisplayMode: "cover",
      pageBgImageUrl: "",
      pageBgDisplayMode: "fixed",
      showSphereAnimation: false,
      showWaveAnimation: true,
      sitePreviewHeight: 180,
      siteDisplayMode: "preview",
      containerBgColor: "#17344F",
      containerBgOpacity: 0,
      glassBlurPx: 24,
      containerBorderColor: "#FFFFFF",
      containerBorderOpacity: 20,
      containerBorderWidth: 1,
      containerBorderRadius: 24,
      headerBgColor: "#17344F",
      headerBgOpacity: 0,
      headerBorderColor: "#FFFFFF",
      headerBorderOpacity: 20,
      headerBorderWidth: 1,
      headerBorderRadius: 0,
      btnActiveBgColor: "#E7C768",
      btnActiveTextColor: "#17344F",
      btnActiveOpacity: 100,
      btnInactiveBgColor: "#000000",
      btnInactiveTextColor: "#CBD5E1",
      btnInactiveOpacity: 25,
      btnBorderColor: "#FFFFFF",
      btnBorderOpacity: 20,
      btnBorderWidth: 1,
      btnBorderRadius: 16,
      customCss: "",
    },
  },
  {
    id: "monochrome",
    name: "Черно-белый",
    desc: "Стиль Liquid Glass Apple в монохроме: прозрачные контейнеры, размытие фона и белые акценты",
    previewBg: "linear-gradient(135deg, #000000 0%, #18181B 100%)",
    theme: {
      fontFamily: "'Manrope', sans-serif",
      headingsColorMode: "solid",
      headingsSolidColor: "#FFFFFF",
      bodyTextColor: "#FFFFFF",
      boldTextColor: "#FFFFFF",
      iconColor: "#FFFFFF",
      lineHeight: 1.5,
      fontSizeH1: 34,
      fontSizeH2: 24,
      fontSizeH3: 18,
      fontSizeH4: 15,
      fontSizeBody: 14,
      pageBgColor: "#000000",
      pageBgOpacity: 100,
      heroBgImageUrl: "",
      heroBgDisplayMode: "none",
      pageBgImageUrl: "",
      pageBgDisplayMode: "none",
      showSphereAnimation: false,
      showWaveAnimation: false,
      sitePreviewHeight: 160,
      siteDisplayMode: "buttons",
      containerBgColor: "#000000",
      containerBgOpacity: 0,
      glassBlurPx: 24,
      containerBorderColor: "#FFFFFF",
      containerBorderOpacity: 25,
      containerBorderWidth: 1,
      containerBorderRadius: 20,
      headerBgColor: "#000000",
      headerBgOpacity: 0,
      headerBorderColor: "#FFFFFF",
      headerBorderOpacity: 20,
      headerBorderWidth: 1,
      headerBorderRadius: 0,
      btnActiveBgColor: "#FFFFFF",
      btnActiveTextColor: "#000000",
      btnActiveOpacity: 100,
      btnInactiveBgColor: "#000000",
      btnInactiveTextColor: "#FFFFFF",
      btnInactiveOpacity: 25,
      btnBorderColor: "#FFFFFF",
      btnBorderOpacity: 25,
      btnBorderWidth: 1,
      btnBorderRadius: 14,
      allMediaMonochrome: true,
      logoMonochrome: true,
      heroBgMonochrome: true,
      pageBgMonochrome: true,
      sitePreviewMonochrome: true,
      siteScreenshotMonochrome: true,
      customCss: `/* Monochrome Liquid Glass Apple Style */
#company-landing-root .section-card,
#company-landing-root .liquid-glass-card,
#company-landing-root .vacancy-card,
#company-landing-root .about-card,
#company-landing-root .product-card,
#company-landing-root .vacancy-subcard,
#company-landing-root .landing-card,
#company-landing-root #card-ai-system,
#company-landing-root .card-ai-system {
  background-color: transparent !important;
  background: transparent !important;
  backdrop-filter: blur(24px) !important;
  -webkit-backdrop-filter: blur(24px) !important;
  border-color: rgba(255, 255, 255, 0.25) !important;
  color: #FFFFFF !important;
}

.landing-hero-logo,
#company-landing-root .landing-hero-logo,
.company-logo-img,
#company-landing-root .company-logo-img,
#company-landing-root header img {
  filter: grayscale(100%) !important;
  background: transparent !important;
  background-color: transparent !important;
}

#company-landing-root .site-preview-banner img,
#company-landing-root .site-preview-card img,
#company-landing-root .site-preview-img {
  filter: grayscale(100%) contrast(1.08) !important;
}`,
    },
  },
  {
    id: "light-pastel",
    name: "Светлый",
    desc: "Мягкие пастельные тона, темная контрастная типографика и светлое стекло",
    previewBg: "linear-gradient(135deg, #F8FAFC 0%, #E2E8F0 100%)",
    theme: {
      fontFamily: "'Manrope', sans-serif",
      headingsColorMode: "solid",
      headingsSolidColor: "#0F172A",
      bodyTextColor: "#334155",
      boldTextColor: "#0F172A",
      iconColor: "#475569",
      lineHeight: 1.65,
      fontSizeH1: 36,
      fontSizeH2: 26,
      fontSizeH3: 20,
      fontSizeH4: 16,
      fontSizeBody: 15,
      pageBgColor: "#F8FAFC",
      pageBgOpacity: 100,
      heroBgImageUrl: "",
      heroBgDisplayMode: "cover",
      pageBgImageUrl: "",
      pageBgDisplayMode: "fixed",
      showSphereAnimation: false,
      showWaveAnimation: false,
      sitePreviewHeight: 180,
      siteDisplayMode: "preview",
      containerBgColor: "#FFFFFF",
      containerBgOpacity: 85,
      glassBlurPx: 20,
      containerBorderColor: "#CBD5E1",
      containerBorderOpacity: 70,
      containerBorderWidth: 1,
      containerBorderRadius: 20,
      headerBgColor: "#FFFFFF",
      headerBgOpacity: 90,
      headerBorderColor: "#E2E8F0",
      headerBorderOpacity: 80,
      headerBorderWidth: 1,
      headerBorderRadius: 0,
      btnActiveBgColor: "#0F172A",
      btnActiveTextColor: "#FFFFFF",
      btnActiveOpacity: 100,
      btnInactiveBgColor: "#F1F5F9",
      btnInactiveTextColor: "#334155",
      btnInactiveOpacity: 100,
      btnBorderColor: "#CBD5E1",
      btnBorderOpacity: 60,
      btnBorderWidth: 1,
      btnBorderRadius: 14,
      allMediaMonochrome: false,
      logoMonochrome: false,
      heroBgMonochrome: false,
      pageBgMonochrome: false,
      sitePreviewMonochrome: false,
      siteScreenshotMonochrome: false,
      customCss: "",
    },
  },
  {
    id: "dark-chocolate",
    name: "Темный",
    desc: "Премиальный шоколадный и темно-золотой фон с благородным золотым текстом",
    previewBg: "linear-gradient(135deg, #1A120B 0%, #2B1E16 100%)",
    theme: {
      fontFamily: "'Montserrat', sans-serif",
      headingsColorMode: "solid",
      headingsSolidColor: "#E5A93C",
      bodyTextColor: "#EAD7C3",
      boldTextColor: "#FDF0D5",
      iconColor: "#E5A93C",
      lineHeight: 1.6,
      fontSizeH1: 36,
      fontSizeH2: 26,
      fontSizeH3: 20,
      fontSizeH4: 16,
      fontSizeBody: 15,
      pageBgColor: "#1A120B",
      pageBgOpacity: 100,
      heroBgImageUrl: "",
      heroBgDisplayMode: "cover",
      pageBgImageUrl: "",
      pageBgDisplayMode: "fixed",
      showSphereAnimation: false,
      showWaveAnimation: true,
      sitePreviewHeight: 200,
      siteDisplayMode: "preview",
      containerBgColor: "#2B1E16",
      containerBgOpacity: 70,
      glassBlurPx: 24,
      containerBorderColor: "#D4A373",
      containerBorderOpacity: 35,
      containerBorderWidth: 1,
      containerBorderRadius: 24,
      headerBgColor: "#2B1E16",
      headerBgOpacity: 85,
      headerBorderColor: "#D4A373",
      headerBorderOpacity: 35,
      headerBorderWidth: 1,
      headerBorderRadius: 0,
      btnActiveBgColor: "#D4A373",
      btnActiveTextColor: "#1A120B",
      btnActiveOpacity: 100,
      btnInactiveBgColor: "#3C2A21",
      btnInactiveTextColor: "#D4A373",
      btnInactiveOpacity: 100,
      btnBorderColor: "#D4A373",
      btnBorderOpacity: 30,
      btnBorderWidth: 1,
      btnBorderRadius: 16,
      allMediaMonochrome: false,
      logoMonochrome: false,
      heroBgMonochrome: false,
      pageBgMonochrome: false,
      sitePreviewMonochrome: false,
      siteScreenshotMonochrome: false,
      customCss: "",
    },
  },
];

const SWATCHES = [
  "#E7C768", "#F4EE8E", "#D99E41", "#FFFFFF", "#94A3B8",
  "#38BDF8", "#34D399", "#C084FC", "#F43F5E", "#17344F", "#0F172A", "#000000",
  "#1A120B", "#2B1E16", "#D4A373", "#F8FAFC", "#334155"
];

export function hexToRgba(hex: string, opacityPercent: number = 100): string {
  if (!hex) return `rgba(255, 255, 255, ${opacityPercent / 100})`;
  let cleanHex = hex.replace("#", "").trim();
  if (cleanHex.length === 3) {
    cleanHex = cleanHex.split("").map((c) => c + c).join("");
  }
  if (cleanHex.length !== 6) return hex;
  const num = parseInt(cleanHex, 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  const a = Math.max(0, Math.min(1, opacityPercent / 100));
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/** Color picker item with eyedropper + hex input + quick swatches */
function ColorPickerField({
  label,
  value,
  onChange,
  opacity,
  onOpacityChange,
  accentColor,
}: {
  label: string;
  value: string;
  onChange: (val: string) => void;
  opacity?: number;
  onOpacityChange?: (op: number) => void;
  accentColor?: string;
}) {
  const handleEyeDropper = async () => {
    if (typeof window !== "undefined" && "EyeDropper" in window) {
      try {
        const eyeDropper = new (window as any).EyeDropper();
        const result = await eyeDropper.open();
        if (result?.sRGBHex) {
          onChange(result.sRGBHex);
        }
      } catch {
        // user cancelled
      }
    }
  };

  const hasEyeDropperApi = typeof window !== "undefined" && "EyeDropper" in window;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs font-semibold text-slate-200">
        <span>{label}</span>
        <span className="font-mono text-[11px] text-slate-400 uppercase">
          {value || "#FFFFFF"} {opacity !== undefined ? `(${opacity}%)` : ""}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative w-10 h-10 shrink-0 rounded-xl overflow-hidden border border-white/20 hover:border-[#E7C768] transition">
          <input
            type="color"
            value={value && value.startsWith("#") && value.length === 7 ? value : "#E7C768"}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 w-full h-full cursor-pointer opacity-0 z-10"
            title="Выбрать цвет из палитры"
          />
          <div
            className="w-full h-full rounded-xl flex items-center justify-center shadow-inner"
            style={{ backgroundColor: value || "#E7C768" }}
          >
            <Palette className="w-4 h-4 text-black/50 mix-blend-difference" />
          </div>
        </div>

        {hasEyeDropperApi && (
          <button
            type="button"
            onClick={handleEyeDropper}
            className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-[#E7C768] transition shrink-0"
            title="Пипетка (взять цвет с экрана)"
          >
            <Pipette className="w-4 h-4" />
          </button>
        )}

        <input
          type="text"
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#E7C768"
          className="flex-1 min-w-0 bg-transparent border border-white/20 focus:border-[#E7C768] rounded-xl px-3 py-2 text-white font-mono text-xs focus:outline-none"
        />
      </div>

      {opacity !== undefined && onOpacityChange && (
        <div className="pt-1 flex items-center gap-3">
          <span className="text-[11px] text-slate-400 shrink-0">Прозрачность:</span>
          <input
            type="range"
            min="0"
            max="100"
            value={opacity}
            onChange={(e) => onOpacityChange(parseInt(e.target.value, 10))}
            style={{ accentColor: accentColor || "var(--landing-icon-color, #E7C768)" }}
            className="flex-1 cursor-pointer"
          />
          <span className="text-[11px] font-mono text-slate-300 w-8 text-right">{opacity}%</span>
        </div>
      )}

      {/* Quick Swatches */}
      <div className="flex flex-wrap gap-1.5 pt-1">
        {SWATCHES.map((sw) => (
          <button
            key={sw}
            type="button"
            onClick={() => onChange(sw)}
            style={{ backgroundColor: sw }}
            className={`w-5 h-5 rounded-md border transition-all ${
              value?.toUpperCase() === sw.toUpperCase()
                ? "border-white scale-110 shadow-md ring-1 ring-[#E7C768]"
                : "border-white/20 hover:scale-105"
            }`}
            title={sw}
          />
        ))}
      </div>
    </div>
  );
}

/** Pure helper to generate complete landing CSS rules from a theme config scoped to the landing container */
export function buildThemeCss(parsedTheme: LandingThemeConfig): string {
  ensureGoogleFontLoaded(parsedTheme.fontFamily);

  const pageBgColorRgba = hexToRgba(parsedTheme.pageBgColor || "#17344F", parsedTheme.pageBgOpacity ?? 100);
  const pageBgFilterRgba = hexToRgba(parsedTheme.pageBgFilterColor || "#17344F", parsedTheme.pageBgFilterOpacity ?? 0);
  const heroBgFilterRgba = hexToRgba(parsedTheme.heroBgFilterColor || "#17344F", parsedTheme.heroBgFilterOpacity ?? 0);
  const logoFilterRgba = hexToRgba(parsedTheme.logoFilterColor || "#E7C768", parsedTheme.logoFilterOpacity ?? 0);
  const logoBgRgba = hexToRgba(parsedTheme.logoBgColor || "#FFFFFF", parsedTheme.logoBgOpacity ?? 0);
  const sitePreviewFilterRgba = hexToRgba(parsedTheme.sitePreviewFilterColor || "#17344F", parsedTheme.sitePreviewFilterOpacity ?? 0);
  const siteScreenshotFilterRgba = hexToRgba(parsedTheme.siteScreenshotFilterColor || "#17344F", parsedTheme.siteScreenshotFilterOpacity ?? 0);
  const containerBgColorRgba = hexToRgba(parsedTheme.containerBgColor || "#17344F", parsedTheme.containerBgOpacity ?? 0);
  const containerBorderColorRgba = hexToRgba(parsedTheme.containerBorderColor || "#FFFFFF", parsedTheme.containerBorderOpacity ?? 20);
  const headerBgColorRgba = hexToRgba(parsedTheme.headerBgColor || "#17344F", parsedTheme.headerBgOpacity ?? 0);
  const headerBgFilterRgba = hexToRgba(parsedTheme.headerBgFilterColor || "#17344F", parsedTheme.headerBgFilterOpacity ?? 0);
  const headerBorderColorRgba = hexToRgba(parsedTheme.headerBorderColor || "#FFFFFF", parsedTheme.headerBorderOpacity ?? 20);
  const btnActiveBgColorRgba = hexToRgba(parsedTheme.btnActiveBgColor || "#E7C768", parsedTheme.btnActiveOpacity ?? 100);
  const btnInactiveBgColorRgba = hexToRgba(parsedTheme.btnInactiveBgColor || "#FFFFFF", parsedTheme.btnInactiveOpacity ?? 0);
  const btnBorderColorRgba = hexToRgba(parsedTheme.btnBorderColor || "#FFFFFF", parsedTheme.btnBorderOpacity ?? 20);

  let heroBgCss = "";
  const heroDesktopMedia = parsedTheme.heroBgMediaUrl || parsedTheme.heroBgImageUrl;
  const heroMobileMedia = parsedTheme.heroBgMobileMediaUrl || heroDesktopMedia;
  const hmode = parsedTheme.heroBgDisplayMode || "cover";

  if (hmode === "none") {
    heroBgCss = `
#company-landing-root .landing-hero-bg-layer,
#company-landing-root .landing-hero-filter-layer,
#company-landing-root .landing-hero-media {
  display: none !important;
  background-image: none !important;
}
#company-landing-root .company-landing-hero, #company-landing-root [id="sec-hero"], #company-landing-root .landing-hero-card, #company-landing-root .landing-hero-banner {
  background-image: none !important;
}`;
  } else if (heroDesktopMedia) {
    if (isVideoUrl(heroDesktopMedia)) {
      heroBgCss = `
#company-landing-root .landing-hero-bg-layer {
  display: block !important;
  background-image: none !important;
}
#company-landing-root .company-landing-hero, #company-landing-root [id="sec-hero"], #company-landing-root .landing-hero-card, #company-landing-root .landing-hero-banner {
  background-image: none !important;
}`;
    } else {
      const hattach = hmode === "fixed" ? "fixed" : "scroll";
      const hsize = hmode === "tile" ? "auto" : "cover";
      const hrepeat = hmode === "tile" ? "repeat" : "no-repeat";
      heroBgCss = `
#company-landing-root .company-landing-hero, #company-landing-root [id="sec-hero"], #company-landing-root .landing-hero-card, #company-landing-root .landing-hero-banner {
  background-image: none !important;
}
#company-landing-root .landing-hero-bg-layer {
  display: block !important;
}
#company-landing-root .landing-hero-bg-layer .landing-hero-media {
  background-attachment: ${hattach} !important;
  background-size: ${hsize} !important;
  background-repeat: ${hrepeat} !important;
  background-position: center !important;
}`;
    }
  }

  let headingsColorRule = "";
  if (parsedTheme.headingsColorMode === "gradient-gold") {
    headingsColorRule = `
  background-image: linear-gradient(to right, #F4EE8E, #E7C768, #D99E41) !important;
  -webkit-background-clip: text !important;
  background-clip: text !important;
  -webkit-text-fill-color: transparent !important;
  color: transparent !important;`;
  } else if (parsedTheme.headingsColorMode === "gradient-silver") {
    headingsColorRule = `
  background-image: linear-gradient(to right, #FFFFFF, #E2E8F0, #94A3B8) !important;
  -webkit-background-clip: text !important;
  background-clip: text !important;
  -webkit-text-fill-color: transparent !important;
  color: transparent !important;`;
  } else {
    const solid = parsedTheme.headingsSolidColor || "#E7C768";
    headingsColorRule = `
  background-image: none !important;
  background: none !important;
  -webkit-background-clip: initial !important;
  background-clip: initial !important;
  -webkit-text-fill-color: ${solid} !important;
  color: ${solid} !important;`;
  }

  const h3ColorRule = parsedTheme.headingsColorMode === "solid" && parsedTheme.headingsSolidColor
    ? `background-image: none !important; background: none !important; -webkit-background-clip: initial !important; background-clip: initial !important; -webkit-text-fill-color: ${parsedTheme.headingsSolidColor} !important; color: ${parsedTheme.headingsSolidColor} !important;`
    : headingsColorRule || `color: #E7C768 !important;`;

  const h4ColorRule = parsedTheme.headingsColorMode === "solid" && parsedTheme.headingsSolidColor
    ? `background-image: none !important; background: none !important; -webkit-background-clip: initial !important; background-clip: initial !important; -webkit-text-fill-color: ${parsedTheme.headingsSolidColor} !important; color: ${parsedTheme.headingsSolidColor} !important;`
    : headingsColorRule || `color: #E7C768 !important;`;

  return `
:root {
  --landing-font: ${parsedTheme.fontFamily || "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"};
  --landing-text-color: ${parsedTheme.bodyTextColor || "#E2E8F0"};
  --landing-bold-color: ${parsedTheme.boldTextColor || "#FFFFFF"};
  --landing-icon-color: ${parsedTheme.iconColor || "#E7C768"};
  --landing-line-height: ${parsedTheme.lineHeight ?? 1.6};
  --landing-h1-size: ${parsedTheme.fontSizeH1 ?? 36}px;
  --landing-h2-size: ${parsedTheme.fontSizeH2 ?? 26}px;
  --landing-h3-size: ${parsedTheme.fontSizeH3 ?? 20}px;
  --landing-h4-size: ${parsedTheme.fontSizeH4 ?? 16}px;
  --landing-body-size: ${Math.max(14, parsedTheme.fontSizeBody ?? 15)}px;
  --landing-heading-color: ${parsedTheme.headingsSolidColor || "#E7C768"};

  --landing-page-bg: ${pageBgColorRgba};
  --landing-page-bg-filter: ${pageBgFilterRgba};
  --landing-hero-bg-filter: ${heroBgFilterRgba};
  --landing-logo-filter: ${logoFilterRgba};
  --landing-logo-bg: ${logoBgRgba};
  --landing-site-preview-filter: ${sitePreviewFilterRgba};
  --landing-site-screenshot-filter: ${siteScreenshotFilterRgba};
  --landing-container-bg: ${containerBgColorRgba};
  --landing-container-border: ${containerBorderColorRgba};
  --landing-btn-active-bg: ${btnActiveBgColorRgba};
  --landing-btn-active-text: ${parsedTheme.btnActiveTextColor || "#17344F"};
  --landing-btn-inactive-bg: ${btnInactiveBgColorRgba};
  --landing-btn-inactive-text: ${parsedTheme.btnInactiveTextColor || "#CBD5E1"};
  --landing-btn-border: ${btnBorderColorRgba};
  --landing-radius-btn: ${parsedTheme.btnBorderRadius === 999 ? "9999px" : `${parsedTheme.btnBorderRadius ?? 16}px`};
  --landing-radius-container: ${parsedTheme.containerBorderRadius ?? 24}px;
}

#company-landing-root,
.company-landing-root,
#training-preview-root,
.training-preview-root,
.candidate-training-root {
  --landing-font: ${parsedTheme.fontFamily || "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"};
  --landing-text-color: ${parsedTheme.bodyTextColor || "#E2E8F0"};
  --landing-bold-color: ${parsedTheme.boldTextColor || "#FFFFFF"};
  --landing-icon-color: ${parsedTheme.iconColor || "#E7C768"};
  --landing-line-height: ${parsedTheme.lineHeight ?? 1.6};
  --landing-h1-size: ${parsedTheme.fontSizeH1 ?? 36}px;
  --landing-h2-size: ${parsedTheme.fontSizeH2 ?? 26}px;
  --landing-h3-size: ${parsedTheme.fontSizeH3 ?? 20}px;
  --landing-h4-size: ${parsedTheme.fontSizeH4 ?? 16}px;
  --landing-body-size: ${Math.max(14, parsedTheme.fontSizeBody ?? 15)}px;
  --landing-heading-color: ${parsedTheme.headingsSolidColor || "#E7C768"};

  --landing-page-bg: ${pageBgColorRgba};
  --landing-page-bg-filter: ${pageBgFilterRgba};
  --landing-hero-bg-filter: ${heroBgFilterRgba};
  --landing-logo-filter: ${logoFilterRgba};
  --landing-logo-bg: ${logoBgRgba};
  --landing-site-preview-filter: ${sitePreviewFilterRgba};
  --landing-site-screenshot-filter: ${siteScreenshotFilterRgba};
  --landing-container-bg: ${containerBgColorRgba};
  --landing-container-border: ${containerBorderColorRgba};
  --landing-header-bg: ${headerBgColorRgba};
  --landing-header-bg-filter: ${headerBgFilterRgba};
  --landing-header-border: ${headerBorderColorRgba};
  --landing-btn-active-bg: ${btnActiveBgColorRgba};
  --landing-btn-active-text: ${parsedTheme.btnActiveTextColor || "#17344F"};
  --landing-btn-inactive-bg: ${btnInactiveBgColorRgba};
  --landing-btn-inactive-text: ${parsedTheme.btnInactiveTextColor || "#CBD5E1"};
  --landing-btn-border: ${btnBorderColorRgba};

  --landing-radius-container: ${parsedTheme.containerBorderRadius ?? 24}px;
  --landing-radius-header: ${parsedTheme.headerBorderRadius ?? 0}px;
  --landing-radius-btn: ${parsedTheme.btnBorderRadius === 999 ? "9999px" : `${parsedTheme.btnBorderRadius ?? 16}px`};

  font-family: var(--landing-font) !important;
  color: var(--landing-text-color) !important;
  line-height: var(--landing-line-height) !important;
}

#company-landing-root .landing-page-filter-layer {
  background-color: ${pageBgFilterRgba} !important;
}

#company-landing-root .landing-hero-filter-layer {
  background-color: ${heroBgFilterRgba} !important;
}

#company-landing-root .landing-header-filter-layer {
  background-color: ${headerBgFilterRgba} !important;
}

#company-landing-root .landing-hero-logo-container,
#company-landing-root .landing-header-logo-container,
#company-landing-root .landing-ai-assistant-logo-container,
#company-landing-root .landing-ai-header-logo-container {
  background-color: ${logoBgRgba} !important;
}

#company-landing-root .landing-hero-logo-filter-overlay,
#company-landing-root .landing-header-logo-filter-overlay,
#company-landing-root .landing-ai-assistant-logo-filter-overlay,
#company-landing-root .landing-ai-header-logo-filter-overlay {
  background-color: ${logoFilterRgba} !important;
}

#company-landing-root .site-preview-overlay {
  background-color: ${sitePreviewFilterRgba} !important;
}

#company-landing-root .site-screenshot-overlay {
  background-color: ${siteScreenshotFilterRgba} !important;
}

#company-landing-root h1, #training-preview-root h1, .training-preview-root h1, .candidate-training-root h1 {
  font-size: var(--landing-h1-size) !important;
  ${headingsColorRule}
}

#company-landing-root h2, #training-preview-root h2, .training-preview-root h2, .candidate-training-root h2 {
  font-size: var(--landing-h2-size) !important;
  ${headingsColorRule}
}

#company-landing-root h3, #training-preview-root h3, .training-preview-root h3, .candidate-training-root h3 {
  font-size: var(--landing-h3-size) !important;
  ${h3ColorRule}
}

#company-landing-root h4, #training-preview-root h4, .training-preview-root h4, .candidate-training-root h4 {
  font-size: var(--landing-h4-size) !important;
  ${h4ColorRule}
}

#company-landing-root .landing-heading,
#training-preview-root .landing-heading,
.training-preview-root .landing-heading,
.candidate-training-root .landing-heading,
.landing-heading {
  ${headingsColorRule}
}

#company-landing-root p:not(.landing-btn-active):not(.landing-btn-active *):not(.landing-btn-inactive):not(.landing-btn-inactive *):not([class*="landing-btn-active"]):not([class*="landing-btn-active"] *), 
#company-landing-root li:not(.landing-btn-active):not(.landing-btn-active *):not(.landing-btn-inactive):not(.landing-btn-inactive *):not([class*="landing-btn-active"]):not([class*="landing-btn-active"] *), 
#company-landing-root span:not(.font-bold):not([class*="font-bold"]):not([class*="bg-clip-text"]):not(.landing-btn-active):not(.landing-btn-active *):not(.landing-btn-inactive):not(.landing-btn-inactive *):not([class*="landing-btn-active"]):not([class*="landing-btn-active"] *),
#training-preview-root p:not(.landing-btn-active):not(.landing-btn-active *):not(.landing-btn-inactive):not(.landing-btn-inactive *):not([class*="landing-btn-active"]):not([class*="landing-btn-active"] *), 
#training-preview-root li:not(.landing-btn-active):not(.landing-btn-active *):not(.landing-btn-inactive):not(.landing-btn-inactive *):not([class*="landing-btn-active"]):not([class*="landing-btn-active"] *), 
#training-preview-root span:not(.font-bold):not([class*="font-bold"]):not([class*="bg-clip-text"]):not(.landing-btn-active):not(.landing-btn-active *):not(.landing-btn-inactive):not(.landing-btn-inactive *):not([class*="landing-btn-active"]):not([class*="landing-btn-active"] *),
.training-preview-root p:not(.landing-btn-active):not(.landing-btn-active *):not(.landing-btn-inactive):not(.landing-btn-inactive *):not([class*="landing-btn-active"]):not([class*="landing-btn-active"] *), 
.training-preview-root li:not(.landing-btn-active):not(.landing-btn-active *):not(.landing-btn-inactive):not(.landing-btn-inactive *):not([class*="landing-btn-active"]):not([class*="landing-btn-active"] *), 
.training-preview-root span:not(.font-bold):not([class*="font-bold"]):not([class*="bg-clip-text"]):not(.landing-btn-active):not(.landing-btn-active *):not(.landing-btn-inactive):not(.landing-btn-inactive *):not([class*="landing-btn-active"]):not([class*="landing-btn-active"] *),
.candidate-training-root p:not(.landing-btn-active):not(.landing-btn-active *):not(.landing-btn-inactive):not(.landing-btn-inactive *):not([class*="landing-btn-active"]):not([class*="landing-btn-active"] *), 
.candidate-training-root li:not(.landing-btn-active):not(.landing-btn-active *):not(.landing-btn-inactive):not(.landing-btn-inactive *):not([class*="landing-btn-active"]):not([class*="landing-btn-active"] *), 
.candidate-training-root span:not(.font-bold):not([class*="font-bold"]):not([class*="bg-clip-text"]):not(.landing-btn-active):not(.landing-btn-active *):not(.landing-btn-inactive):not(.landing-btn-inactive *):not([class*="landing-btn-active"]):not([class*="landing-btn-active"] *) {
  font-size: var(--landing-body-size) !important;
  color: var(--landing-text-color);
}

#company-landing-root strong:not(.landing-btn-active):not(.landing-btn-active *):not(.landing-btn-inactive):not(.landing-btn-inactive *):not([class*="landing-btn-active"]):not([class*="landing-btn-active"] *):not(.site-preview-btn):not(.site-preview-btn *):not(button):not(button *), 
#company-landing-root b:not(.landing-btn-active):not(.landing-btn-active *):not(.landing-btn-inactive):not(.landing-btn-inactive *):not([class*="landing-btn-active"]):not([class*="landing-btn-active"] *):not(.site-preview-btn):not(.site-preview-btn *):not(button):not(button *), 
#company-landing-root .font-bold:not(.landing-btn-active):not(.landing-btn-active *):not(.landing-btn-inactive):not(.landing-btn-inactive *):not([class*="landing-btn-active"]):not([class*="landing-btn-active"] *):not(.site-preview-btn):not(.site-preview-btn *):not(button):not(button *), 
#company-landing-root .font-extrabold:not(.landing-btn-active):not(.landing-btn-active *):not(.landing-btn-inactive):not(.landing-btn-inactive *):not([class*="landing-btn-active"]):not([class*="landing-btn-active"] *):not(.site-preview-btn):not(.site-preview-btn *):not(button):not(button *), 
#company-landing-root .font-black:not(.landing-btn-active):not(.landing-btn-active *):not(.landing-btn-inactive):not(.landing-btn-inactive *):not([class*="landing-btn-active"]):not([class*="landing-btn-active"] *):not(.site-preview-btn):not(.site-preview-btn *):not(button):not(button *),
#training-preview-root strong:not(.landing-btn-active):not(.landing-btn-active *):not(.landing-btn-inactive):not(.landing-btn-inactive *):not([class*="landing-btn-active"]):not([class*="landing-btn-active"] *):not(.site-preview-btn):not(.site-preview-btn *):not(button):not(button *), 
#training-preview-root b:not(.landing-btn-active):not(.landing-btn-active *):not(.landing-btn-inactive):not(.landing-btn-inactive *):not([class*="landing-btn-active"]):not([class*="landing-btn-active"] *):not(.site-preview-btn):not(.site-preview-btn *):not(button):not(button *), 
#training-preview-root .font-bold:not(.landing-btn-active):not(.landing-btn-active *):not(.landing-btn-inactive):not(.landing-btn-inactive *):not([class*="landing-btn-active"]):not([class*="landing-btn-active"] *):not(.site-preview-btn):not(.site-preview-btn *):not(button):not(button *), 
#training-preview-root .font-extrabold:not(.landing-btn-active):not(.landing-btn-active *):not(.landing-btn-inactive):not(.landing-btn-inactive *):not([class*="landing-btn-active"]):not([class*="landing-btn-active"] *):not(.site-preview-btn):not(.site-preview-btn *):not(button):not(button *), 
#training-preview-root .font-black:not(.landing-btn-active):not(.landing-btn-active *):not(.landing-btn-inactive):not(.landing-btn-inactive *):not([class*="landing-btn-active"]):not([class*="landing-btn-active"] *):not(.site-preview-btn):not(.site-preview-btn *):not(button):not(button *),
.training-preview-root strong:not(.landing-btn-active):not(.landing-btn-active *):not(.landing-btn-inactive):not(.landing-btn-inactive *):not([class*="landing-btn-active"]):not([class*="landing-btn-active"] *):not(.site-preview-btn):not(.site-preview-btn *):not(button):not(button *), 
.training-preview-root b:not(.landing-btn-active):not(.landing-btn-active *):not(.landing-btn-inactive):not(.landing-btn-inactive *):not([class*="landing-btn-active"]):not([class*="landing-btn-active"] *):not(.site-preview-btn):not(.site-preview-btn *):not(button):not(button *), 
.training-preview-root .font-bold:not(.landing-btn-active):not(.landing-btn-active *):not(.landing-btn-inactive):not(.landing-btn-inactive *):not([class*="landing-btn-active"]):not([class*="landing-btn-active"] *):not(.site-preview-btn):not(.site-preview-btn *):not(button):not(button *), 
.training-preview-root .font-extrabold:not(.landing-btn-active):not(.landing-btn-active *):not(.landing-btn-inactive):not(.landing-btn-inactive *):not([class*="landing-btn-active"]):not([class*="landing-btn-active"] *):not(.site-preview-btn):not(.site-preview-btn *):not(button):not(button *), 
.training-preview-root .font-black:not(.landing-btn-active):not(.landing-btn-active *):not(.landing-btn-inactive):not(.landing-btn-inactive *):not([class*="landing-btn-active"]):not([class*="landing-btn-active"] *):not(.site-preview-btn):not(.site-preview-btn *):not(button):not(button *),
.candidate-training-root strong:not(.landing-btn-active):not(.landing-btn-active *):not(.landing-btn-inactive):not(.landing-btn-inactive *):not([class*="landing-btn-active"]):not([class*="landing-btn-active"] *):not(.site-preview-btn):not(.site-preview-btn *):not(button):not(button *), 
.candidate-training-root b:not(.landing-btn-active):not(.landing-btn-active *):not(.landing-btn-inactive):not(.landing-btn-inactive *):not([class*="landing-btn-active"]):not([class*="landing-btn-active"] *):not(.site-preview-btn):not(.site-preview-btn *):not(button):not(button *), 
.candidate-training-root .font-bold:not(.landing-btn-active):not(.landing-btn-active *):not(.landing-btn-inactive):not(.landing-btn-inactive *):not([class*="landing-btn-active"]):not([class*="landing-btn-active"] *):not(.site-preview-btn):not(.site-preview-btn *):not(button):not(button *), 
.candidate-training-root .font-extrabold:not(.landing-btn-active):not(.landing-btn-active *):not(.landing-btn-inactive):not(.landing-btn-inactive *):not([class*="landing-btn-active"]):not([class*="landing-btn-active"] *):not(.site-preview-btn):not(.site-preview-btn *):not(button):not(button *), 
.candidate-training-root .font-black:not(.landing-btn-active):not(.landing-btn-active *):not(.landing-btn-inactive):not(.landing-btn-inactive *):not([class*="landing-btn-active"]):not([class*="landing-btn-active"] *):not(.site-preview-btn):not(.site-preview-btn *):not(button):not(button *) {
  color: var(--landing-bold-color) !important;
}

#company-landing-root svg:not(.landing-btn-active svg):not(.landing-btn-inactive svg),
#company-landing-root .lucide:not(.landing-btn-active .lucide):not(.landing-btn-inactive .lucide),
#company-landing-root svg:not(.landing-btn-active svg):not(.landing-btn-inactive svg) path,
#company-landing-root svg:not(.landing-btn-active svg):not(.landing-btn-inactive svg) circle,
#company-landing-root svg:not(.landing-btn-active svg):not(.landing-btn-inactive svg) line,
#company-landing-root svg:not(.landing-btn-active svg):not(.landing-btn-inactive svg) polyline,
#training-preview-root svg:not(.landing-btn-active svg):not(.landing-btn-inactive svg),
#training-preview-root .lucide:not(.landing-btn-active .lucide):not(.landing-btn-inactive .lucide),
#training-preview-root svg:not(.landing-btn-active svg):not(.landing-btn-inactive svg) path,
#training-preview-root svg:not(.landing-btn-active svg):not(.landing-btn-inactive svg) circle,
#training-preview-root svg:not(.landing-btn-active svg):not(.landing-btn-inactive svg) line,
#training-preview-root svg:not(.landing-btn-active svg):not(.landing-btn-inactive svg) polyline,
.training-preview-root svg:not(.landing-btn-active svg):not(.landing-btn-inactive svg),
.training-preview-root .lucide:not(.landing-btn-active .lucide):not(.landing-btn-inactive .lucide),
.training-preview-root svg:not(.landing-btn-active svg):not(.landing-btn-inactive svg) path,
.training-preview-root svg:not(.landing-btn-active svg):not(.landing-btn-inactive svg) circle,
.training-preview-root svg:not(.landing-btn-active svg):not(.landing-btn-inactive svg) line,
.training-preview-root svg:not(.landing-btn-active svg):not(.landing-btn-inactive svg) polyline,
.candidate-training-root svg:not(.landing-btn-active svg):not(.landing-btn-inactive svg),
.candidate-training-root .lucide:not(.landing-btn-active .lucide):not(.landing-btn-inactive .lucide),
.candidate-training-root svg:not(.landing-btn-active svg):not(.landing-btn-inactive svg) path,
.candidate-training-root svg:not(.landing-btn-active svg):not(.landing-btn-inactive svg) circle,
.candidate-training-root svg:not(.landing-btn-active svg):not(.landing-btn-inactive svg) line,
.candidate-training-root svg:not(.landing-btn-active svg):not(.landing-btn-inactive svg) polyline,
#company-landing-root [class*="text-[#E7C768]"]:not(.landing-btn-active):not(.landing-btn-inactive),
#company-landing-root [class*="text-[#F5D67A]"]:not(.landing-btn-active):not(.landing-btn-inactive),
#company-landing-root [class*="text-[#F4EE8E]"]:not(.landing-btn-active):not(.landing-btn-inactive),
#company-landing-root [class*="text-[#E8B84E]"]:not(.landing-btn-active):not(.landing-btn-inactive),
#company-landing-root .section-card .w-10,
#company-landing-root .section-card .w-8,
#company-landing-root [id^="sec-"] .w-8,
#company-landing-root .landing-icon,
#company-landing-root .section-icon,
#company-landing-root .company-logo-letter {
  color: var(--landing-icon-color) !important;
  stroke: var(--landing-icon-color) !important;
}

#company-landing-root svg.lucide:not(.landing-btn-active *):not(.landing-btn-inactive *) {
  stroke: var(--landing-icon-color) !important;
  color: var(--landing-icon-color) !important;
}

#company-landing-root .landing-bullet-dot,
#company-landing-root span.bg-\\[\\#E7C768\\],
#company-landing-root .bg-\\[\\#E7C768\\]:not(button):not(a):not(.landing-btn-active) {
  background-color: var(--landing-icon-color) !important;
}

#company-landing-root span.border-\\[\\#E7C768\\],
#company-landing-root div.border-\\[\\#E7C768\\] {
  border-color: var(--landing-icon-color) !important;
}

/* Inverted Cards: Header and Text Color Inversion */
#company-landing-root .inverted-card {
  background-color: #FFFFFF !important;
  color: #000000 !important;
  border-color: rgba(0, 0, 0, 0.2) !important;
}
#company-landing-root .inverted-card h1,
#company-landing-root .inverted-card h2,
#company-landing-root .inverted-card h3,
#company-landing-root .inverted-card h4,
#company-landing-root .inverted-card .section-card-header h2,
#company-landing-root .inverted-card [class*="bg-clip-text"] {
  background: none !important;
  background-image: none !important;
  -webkit-background-clip: initial !important;
  background-clip: initial !important;
  -webkit-text-fill-color: #000000 !important;
  color: #000000 !important;
}
#company-landing-root .inverted-card p,
#company-landing-root .inverted-card span:not(.font-bold),
#company-landing-root .inverted-card li {
  color: #1E293B !important;
}
#company-landing-root .inverted-card strong,
#company-landing-root .inverted-card b,
#company-landing-root .inverted-card .font-bold {
  color: #000000 !important;
}

#company-landing-root .section-card, 
#company-landing-root [id^="sec-"], 
#company-landing-root .liquid-glass-card, 
#company-landing-root .company-landing-card, 
#company-landing-root .vacancy-card, 
#company-landing-root .vacancy-hero-banner,
#company-landing-root .company-landing-hero,
#company-landing-root .landing-hero-card,
#company-landing-root .landing-hero-banner,
#company-landing-root .landing-card,
#company-landing-root .product-card,
#company-landing-root .about-card,
#company-landing-root .landing-ai-dialog,
#company-landing-root .vacancy-subcard,
#company-landing-root .team-member-card,
#company-landing-root .team-avatar-box,
#company-landing-root .vacancy-hero-banner .site-preview-banner,
.product-card,
.about-card,
.landing-ai-dialog,
.vacancy-subcard,
.team-member-card,
.team-avatar-box,
.vacancy-card,
.section-card,
.liquid-glass-card,
.landing-card {
  background-color: ${containerBgColorRgba} !important;
  backdrop-filter: blur(${parsedTheme.glassBlurPx ?? 24}px) !important;
  -webkit-backdrop-filter: blur(${parsedTheme.glassBlurPx ?? 24}px) !important;
  border-color: ${containerBorderColorRgba} !important;
  border-width: ${parsedTheme.containerBorderWidth ?? 1}px !important;
  border-radius: var(--landing-radius-container) !important;
}

/* AI Assistant dialog, message bubbles, inline buttons, input field connected to containerBorderRadius */
.landing-ai-dialog,
#company-landing-root .landing-ai-dialog {
  border-radius: var(--landing-radius-container) !important;
  background-color: ${containerBgColorRgba} !important;
  backdrop-filter: blur(${parsedTheme.glassBlurPx ?? 24}px) !important;
  -webkit-backdrop-filter: blur(${parsedTheme.glassBlurPx ?? 24}px) !important;
  border-color: ${containerBorderColorRgba} !important;
  border-width: ${parsedTheme.containerBorderWidth ?? 1}px !important;
}

.landing-ai-bubble,
#company-landing-root .landing-ai-bubble,
.landing-ai-dialog .landing-ai-bubble,
.landing-ai-dialog [class*="rounded-2xl"],
.landing-ai-dialog .p-3\\.5\\.rounded-2xl {
  border-radius: var(--landing-radius-container) !important;
  backdrop-filter: blur(${parsedTheme.glassBlurPx ?? 24}px) !important;
  -webkit-backdrop-filter: blur(${parsedTheme.glassBlurPx ?? 24}px) !important;
}

.landing-ai-suggestion-btn,
#company-landing-root .landing-ai-suggestion-btn,
.landing-ai-dialog .landing-ai-suggestion-btn,
.landing-ai-dialog .grid-cols-2 button {
  border-radius: var(--landing-radius-container) !important;
  backdrop-filter: blur(${parsedTheme.glassBlurPx ?? 24}px) !important;
  -webkit-backdrop-filter: blur(${parsedTheme.glassBlurPx ?? 24}px) !important;
}

.mini-audio-field-box,
#company-landing-root .mini-audio-field-box,
.landing-ai-dialog .mini-audio-field-box {
  border-radius: var(--landing-radius-container) !important;
  border-color: ${containerBorderColorRgba} !important;
  border-width: ${parsedTheme.containerBorderWidth ?? 1}px !important;
  backdrop-filter: blur(${parsedTheme.glassBlurPx ?? 24}px) !important;
  -webkit-backdrop-filter: blur(${parsedTheme.glassBlurPx ?? 24}px) !important;
}

/* Sliders and range inputs synchronized with icon color */
#company-landing-root input[type="range"],
#landing-style-editor-panel input[type="range"],
.landing-style-editor-drawer input[type="range"],
input[type="range"] {
  accent-color: var(--landing-icon-color, #E7C768) !important;
}

/* Completely transparent logo without lightening */
.landing-hero-logo,
.landing-hero-logo-container,
.vacancy-card-logo,
.company-logo-img,
#company-landing-root .landing-hero-logo,
#company-landing-root .landing-hero-logo-container,
#company-landing-root .vacancy-card-logo,
#company-landing-root .company-logo-img {
  background: transparent !important;
  background-color: transparent !important;
  box-shadow: none !important;
}

#company-landing-root > header, 
#company-landing-root header.landing-header, 
#company-landing-root .landing-header,
#company-landing-root #landing-top-header {
  background: ${headerBgColorRgba} !important;
  background-color: ${headerBgColorRgba} !important;
  backdrop-filter: blur(${parsedTheme.glassBlurPx ?? 24}px) !important;
  -webkit-backdrop-filter: blur(${parsedTheme.glassBlurPx ?? 24}px) !important;
  border-color: ${headerBorderColorRgba} !important;
  border-bottom-color: ${headerBorderColorRgba} !important;
  border-width: ${parsedTheme.headerBorderWidth ?? 1}px !important;
  border-radius: var(--landing-radius-header) !important;
}

/* Base button shapes and borders */
#company-landing-root header button,
#company-landing-root .landing-header button,
#company-landing-root header .landing-header-btn,
#company-landing-root .landing-header .landing-header-btn,
#company-landing-root .landing-badge,
#company-landing-root .landing-chip,
#company-landing-root .landing-tag,
#company-landing-root .landing-pill,
#company-landing-root .site-preview-btn,
#company-landing-root button:not(.no-theme-style),
#company-landing-root a.landing-btn-active,
#company-landing-root a.landing-btn-inactive,
.landing-btn-active,
button.landing-btn-active,
a.landing-btn-active,
.landing-btn-inactive,
button.landing-btn-inactive,
a.landing-btn-inactive {
  border-radius: var(--landing-radius-btn) !important;
  border-width: ${parsedTheme.btnBorderWidth ?? 1}px !important;
}

/* Chips and Badges default border */
#company-landing-root .landing-badge,
#company-landing-root .landing-chip,
#company-landing-root .landing-tag,
#company-landing-root .landing-pill,
#company-landing-root span[class*="rounded-full"],
#company-landing-root div[class*="rounded-full"]:not(.landing-bullet-dot):not([class*="w-1.5"]):not([class*="w-2"]):not([class*="w-3"]) {
  border-radius: var(--landing-radius-btn) !important;
  border-color: ${btnBorderColorRgba} !important;
  border-width: ${parsedTheme.btnBorderWidth ?? 1}px !important;
}

/* Active buttons, active tabs, and active internal blocks */
.landing-btn-active,
button.landing-btn-active,
a.landing-btn-active,
:is(#company-landing-root, #training-preview-root, .training-preview-root, .candidate-training-root, #candidate-training-root) .landing-btn-active, 
:is(#company-landing-root, #training-preview-root, .training-preview-root, .candidate-training-root, #candidate-training-root) a.landing-btn-active, 
:is(#company-landing-root, #training-preview-root, .training-preview-root, .candidate-training-root, #candidate-training-root) button.landing-btn-active, 
:is(#company-landing-root, #training-preview-root, .training-preview-root, .candidate-training-root, #candidate-training-root) .tab-btn-active,
:is(#company-landing-root, #training-preview-root, .training-preview-root, .candidate-training-root, #candidate-training-root) .landing-tab-btn-active,
:is(#company-landing-root, #training-preview-root, .training-preview-root, .candidate-training-root, #candidate-training-root) .active-block,
:is(#company-landing-root, #training-preview-root, .training-preview-root, .candidate-training-root, #candidate-training-root) .active-subcard,
:is(#company-landing-root, #training-preview-root, .training-preview-root, .candidate-training-root, #candidate-training-root) .landing-card-active,
:is(#company-landing-root, #training-preview-root, .training-preview-root, .candidate-training-root, #candidate-training-root) [data-active="true"],
:is(#company-landing-root, #training-preview-root, .training-preview-root, .candidate-training-root, #candidate-training-root) [class*="landing-btn-active"],
:is(#company-landing-root, #training-preview-root, .training-preview-root, .candidate-training-root, #candidate-training-root) .site-preview-btn,
:is(#company-landing-root, #training-preview-root, .training-preview-root, .candidate-training-root, #candidate-training-root) a.site-preview-btn,
.site-preview-btn,
a.site-preview-btn,
:is(#company-landing-root, #training-preview-root, .training-preview-root, .candidate-training-root, #candidate-training-root) .vacancy-hero-banner a.site-preview-btn,
.vacancy-hero-banner a.site-preview-btn,
:is(#company-landing-root, #training-preview-root, .training-preview-root, .candidate-training-root, #candidate-training-root) .landing-recruitment-badge,
.landing-recruitment-badge,
:is(#company-landing-root, #training-preview-root, .training-preview-root, .candidate-training-root, #candidate-training-root) .landing-icon-container,
:is(#company-landing-root, #training-preview-root, .training-preview-root, .candidate-training-root, #candidate-training-root) .about-tag-badge,
:is(#company-landing-root, #training-preview-root, .training-preview-root, .candidate-training-root, #candidate-training-root) .about-icon-badge,
:is(#company-landing-root, #training-preview-root, .training-preview-root, .candidate-training-root, #candidate-training-root) .product-card,
:is(#company-landing-root, #training-preview-root, .training-preview-root, .candidate-training-root, #candidate-training-root) .stat-box,
:is(#company-landing-root, #training-preview-root, .training-preview-root, .candidate-training-root, #candidate-training-root) .landing-bonus-card,
:is(#company-landing-root, #training-preview-root, .training-preview-root, .candidate-training-root, #candidate-training-root) .vacancy-card-badge,
.candidate-auth-modal .landing-btn-active,
:is(#company-landing-root, #training-preview-root, .training-preview-root, .candidate-training-root, #candidate-training-root) button.bg-\\[\\#E7C768\\] {
  background: ${btnActiveBgColorRgba} !important;
  background-color: ${btnActiveBgColorRgba} !important;
  background-image: none !important;
  color: ${parsedTheme.btnActiveTextColor || "#17344F"} !important;
  -webkit-text-fill-color: ${parsedTheme.btnActiveTextColor || "#17344F"} !important;
  border-color: ${btnBorderColorRgba} !important;
  border-width: ${parsedTheme.btnBorderWidth ?? 1}px !important;
  border-radius: var(--landing-radius-btn) !important;
}

.landing-btn-active *,
button.landing-btn-active *,
a.landing-btn-active *,
:is(#company-landing-root, #training-preview-root, .training-preview-root, .candidate-training-root, #candidate-training-root) .landing-btn-active *, 
:is(#company-landing-root, #training-preview-root, .training-preview-root, .candidate-training-root, #candidate-training-root) [class*="landing-btn-active"] *, 
:is(#company-landing-root, #training-preview-root, .training-preview-root, .candidate-training-root, #candidate-training-root) a.landing-btn-active *, 
:is(#company-landing-root, #training-preview-root, .training-preview-root, .candidate-training-root, #candidate-training-root) button.landing-btn-active *, 
:is(#company-landing-root, #training-preview-root, .training-preview-root, .candidate-training-root, #candidate-training-root) .tab-btn-active *,
:is(#company-landing-root, #training-preview-root, .training-preview-root, .candidate-training-root, #candidate-training-root) .landing-tab-btn-active *,
:is(#company-landing-root, #training-preview-root, .training-preview-root, .candidate-training-root, #candidate-training-root) .active-block *,
:is(#company-landing-root, #training-preview-root, .training-preview-root, .candidate-training-root, #candidate-training-root) .active-subcard *,
:is(#company-landing-root, #training-preview-root, .training-preview-root, .candidate-training-root, #candidate-training-root) .landing-card-active *,
:is(#company-landing-root, #training-preview-root, .training-preview-root, .candidate-training-root, #candidate-training-root) [data-active="true"] *,
:is(#company-landing-root, #training-preview-root, .training-preview-root, .candidate-training-root, #candidate-training-root) [class*="landing-btn-active"] *,
:is(#company-landing-root, #training-preview-root, .training-preview-root, .candidate-training-root, #candidate-training-root) .site-preview-btn *,
:is(#company-landing-root, #training-preview-root, .training-preview-root, .candidate-training-root, #candidate-training-root) a.site-preview-btn *,
.site-preview-btn *,
a.site-preview-btn *,
:is(#company-landing-root, #training-preview-root, .training-preview-root, .candidate-training-root, #candidate-training-root) .vacancy-hero-banner a.site-preview-btn *,
.vacancy-hero-banner a.site-preview-btn *,
:is(#company-landing-root, #training-preview-root, .training-preview-root, .candidate-training-root, #candidate-training-root) .landing-recruitment-badge *,
.landing-recruitment-badge *,
:is(#company-landing-root, #training-preview-root, .training-preview-root, .candidate-training-root, #candidate-training-root) .landing-icon-container *,
:is(#company-landing-root, #training-preview-root, .training-preview-root, .candidate-training-root, #candidate-training-root) .about-tag-badge *,
:is(#company-landing-root, #training-preview-root, .training-preview-root, .candidate-training-root, #candidate-training-root) .about-icon-badge *,
:is(#company-landing-root, #training-preview-root, .training-preview-root, .candidate-training-root, #candidate-training-root) .product-card *,
:is(#company-landing-root, #training-preview-root, .training-preview-root, .candidate-training-root, #candidate-training-root) .stat-box *,
:is(#company-landing-root, #training-preview-root, .training-preview-root, .candidate-training-root, #candidate-training-root) .landing-bonus-card *,
:is(#company-landing-root, #training-preview-root, .training-preview-root, .candidate-training-root, #candidate-training-root) .vacancy-card-badge *,
:is(#company-landing-root, #training-preview-root, .training-preview-root, .candidate-training-root, #candidate-training-root) .landing-btn-active,
:is(#company-landing-root, #training-preview-root, .training-preview-root, .candidate-training-root, #candidate-training-root) header button .landing-btn-active,
:is(#company-landing-root, #training-preview-root, .training-preview-root, .candidate-training-root, #candidate-training-root) header button .landing-btn-active *,
.candidate-auth-modal .landing-btn-active * {
  color: ${parsedTheme.btnActiveTextColor || "#17344F"} !important;
  -webkit-text-fill-color: ${parsedTheme.btnActiveTextColor || "#17344F"} !important;
  stroke: ${parsedTheme.btnActiveTextColor || "#17344F"} !important;
}

/* Inactive buttons and tabs */
.landing-btn-inactive,
button.landing-btn-inactive,
a.landing-btn-inactive,
#company-landing-root .landing-btn-inactive, 
#company-landing-root a.landing-btn-inactive, 
#company-landing-root button.landing-btn-inactive, 
#company-landing-root .tab-btn-inactive, 
#company-landing-root .landing-tab-btn-inactive, 
#company-landing-root button.bg-black\\/25,
#company-landing-root header button:not(.landing-btn-active),
#company-landing-root .landing-header button:not(.landing-btn-active),
#company-landing-root header .landing-header-btn:not(.landing-btn-active),
#company-landing-root .landing-header .landing-header-btn:not(.landing-btn-active) {
  background: ${btnInactiveBgColorRgba} !important;
  background-color: ${btnInactiveBgColorRgba} !important;
  color: ${parsedTheme.btnInactiveTextColor || "#CBD5E1"} !important;
  -webkit-text-fill-color: ${parsedTheme.btnInactiveTextColor || "#CBD5E1"} !important;
  border-color: ${btnBorderColorRgba} !important;
  border-width: ${parsedTheme.btnBorderWidth ?? 1}px !important;
  border-radius: var(--landing-radius-btn) !important;
}

.landing-btn-inactive *:not(.landing-btn-active):not(.landing-btn-active *),
button.landing-btn-inactive *:not(.landing-btn-active):not(.landing-btn-active *),
a.landing-btn-inactive *:not(.landing-btn-active):not(.landing-btn-active *),
#company-landing-root .landing-btn-inactive *:not(.landing-btn-active):not(.landing-btn-active *), 
#company-landing-root a.landing-btn-inactive *:not(.landing-btn-active):not(.landing-btn-active *), 
#company-landing-root button.landing-btn-inactive *:not(.landing-btn-active):not(.landing-btn-active *),
#company-landing-root .tab-btn-inactive *:not(.landing-btn-active):not(.landing-btn-active *),
#company-landing-root .landing-tab-btn-inactive *:not(.landing-btn-active):not(.landing-btn-active *),
#company-landing-root header button:not(.landing-btn-active) *:not(.landing-btn-active):not(.landing-btn-active *),
#company-landing-root .landing-header button:not(.landing-btn-active) *:not(.landing-btn-active):not(.landing-btn-active *) {
  color: ${parsedTheme.btnInactiveTextColor || "#CBD5E1"} !important;
  -webkit-text-fill-color: ${parsedTheme.btnInactiveTextColor || "#CBD5E1"} !important;
  stroke: ${parsedTheme.btnInactiveTextColor || "#CBD5E1"} !important;
}

#company-landing-root .vacancy-subcard,
#company-landing-root .about-card,
#company-landing-root .stats-card,
#company-landing-root .step-card,
#company-landing-root .subcard,
#company-landing-root .inner-block,
#company-landing-root .fact-card,
#company-landing-root .condition-card,
#company-landing-root main div[class*="backdrop-blur-xl"]:not(button):not(a):not(header):not(.landing-badge):not(.landing-chip):not(.landing-btn-active):not(.stat-box):not(.product-card):not(.vacancy-card-badge):not(.vacancy-desc-badge),
#company-landing-root main div[class*="backdrop-blur-md"]:not(button):not(a):not(header):not(.landing-badge):not(.landing-chip):not([class*="w-"]):not([class*="h-"]):not(.landing-btn-active):not(.stat-box):not(.product-card):not(.vacancy-card-badge):not(.vacancy-desc-badge) {
  border-radius: var(--landing-radius-container) !important;
  border-color: ${containerBorderColorRgba} !important;
  border-width: ${parsedTheme.containerBorderWidth ?? 1}px !important;
}

#company-landing-root #card-ai-system,
#company-landing-root .card-ai-system,
#company-landing-root #sec-about #card-ai-system,
#company-landing-root #sec-about .card-ai-system,
#card-ai-system,
.card-ai-system {
  grid-column: 1 / -1 !important;
  width: 100% !important;
}

${(() => {
  const isMasterMonochrome = parsedTheme.allMediaMonochrome === true;
  const isLogoMono = isMasterMonochrome || parsedTheme.logoMonochrome === true || (parsedTheme.allMediaMonochrome === undefined && parsedTheme.pageBgColor === "#000000" && parsedTheme.headingsColorMode === "solid");
  const isHeroBgMono = isMasterMonochrome || parsedTheme.heroBgMonochrome === true || (parsedTheme.allMediaMonochrome === undefined && parsedTheme.pageBgColor === "#000000" && parsedTheme.headingsColorMode === "solid");
  const isPageBgMono = isMasterMonochrome || parsedTheme.pageBgMonochrome === true || (parsedTheme.allMediaMonochrome === undefined && parsedTheme.pageBgColor === "#000000" && parsedTheme.headingsColorMode === "solid");
  const isPreviewMono = isMasterMonochrome || parsedTheme.sitePreviewMonochrome === true || parsedTheme.siteScreenshotMonochrome === true || (parsedTheme.allMediaMonochrome === undefined && parsedTheme.pageBgColor === "#000000" && parsedTheme.headingsColorMode === "solid");

  let rules = "";

  if (isLogoMono) {
    rules += `
.landing-hero-logo,
#company-landing-root .landing-hero-logo,
#company-landing-root img.landing-hero-logo,
.landing-logo-png-filter,
#company-landing-root .landing-logo-png-filter,
#company-landing-root img.landing-logo-png-filter,
img.landing-logo-png-filter,
.landing-logo-nofilter,
#company-landing-root .landing-logo-nofilter,
#company-landing-root img.landing-logo-nofilter,
img.landing-logo-nofilter,
#company-landing-root header img,
#company-landing-root .landing-header img,
#company-landing-root .landing-header-logo-container img,
#company-landing-root .landing-hero-logo-container img,
#company-landing-root .company-logo-img,
#company-landing-root .ai-assistant-avatar img,
#company-landing-root [data-testid="ai-assistant-logo"] img,
.landing-ai-assistant-logo,
.landing-ai-dialog-logo,
.landing-ai-assistant-logo-container img,
.landing-ai-header-logo-container img {
  filter: grayscale(100%) !important;
}

.landing-hero-logo-filter-overlay,
.landing-header-logo-filter-overlay,
.landing-ai-assistant-logo-filter-overlay,
.landing-ai-header-logo-filter-overlay {
  display: none !important;
}
`;
  }

  if (isHeroBgMono) {
    rules += `
#company-landing-root .landing-hero-bg-layer,
#company-landing-root .landing-hero-bg-layer img,
#company-landing-root .landing-hero-bg-layer video,
#company-landing-root .landing-hero-media,
#company-landing-root .landing-hero-bg,
#company-landing-root .landing-hero-bg img,
#company-landing-root .landing-hero-bg video,
#company-landing-root [class*="hero-bg"] img,
#company-landing-root [class*="hero-bg"] video {
  filter: grayscale(100%) !important;
}
`;
  }

  if (isPageBgMono) {
    rules += `
#company-landing-root .landing-page-media,
#company-landing-root .landing-page-bg,
#company-landing-root .landing-page-bg img,
#company-landing-root .landing-page-bg video,
#company-landing-root .landing-interactive-bg,
#company-landing-root canvas,
#company-landing-root > .fixed video,
#company-landing-root > .fixed img {
  filter: grayscale(100%) !important;
}
`;
  }

  if (isPreviewMono) {
    rules += `
#company-landing-root .site-preview-banner img,
#company-landing-root .site-preview-card img,
#company-landing-root .site-preview-img,
#company-landing-root .site-screenshot-img,
.site-preview-img {
  filter: grayscale(100%) contrast(1.08) !important;
}
`;
  }

  return rules;
})()}

${heroBgCss}

${(() => {
  const rawCss = parsedTheme.customCss || "";
  const cleaned = rawCss
    .replace(/\/\* Active buttons\/tabs in monochrome[\s\S]*?\/\* Inactive buttons\/tabs in monochrome[\s\S]*?(?=\/\* Logo in monochrome|\/\* AI System|$)/g, "")
    .replace(/\.landing-btn-active[\s\S]*?}/g, "")
    .replace(/\.landing-btn-inactive[\s\S]*?}/g, "")
    .replace(/#company-landing-root\s+[^}]*?\*\s*\{[^}]*?color:\s*#FFFFFF\s*!important[^}]*?\}/g, "");
  return cleaned.replace(/#company-landing-root/g, ":is(#company-landing-root, #training-preview-root, .training-preview-root, .candidate-training-root, #candidate-training-root)");
})()}

/* ============================================================
   ABSOLUTE PRIORITY OVERRIDES FOR ACTIVE BUTTONS & BADGES
   Guarantees that active text/bg colors are NEVER wiped out by cards.
   ============================================================ */
${(() => {
  const activeBtnFallbackText = (parsedTheme.btnActiveBgColor && parsedTheme.btnActiveBgColor.toLowerCase() === "#ffffff") ? "#000000" : "#17344F";
  const btnActiveText = parsedTheme.btnActiveTextColor || activeBtnFallbackText;
  const btnInactiveText = parsedTheme.btnInactiveTextColor || "#FFFFFF";
  return `
:is(#company-landing-root, #training-preview-root, .training-preview-root, .candidate-training-root, #candidate-training-root) [class*="landing-btn-active"],
:is(#company-landing-root, #training-preview-root, .training-preview-root, .candidate-training-root, #candidate-training-root) .landing-btn-active,
:is(#company-landing-root, #training-preview-root, .training-preview-root, .candidate-training-root, #candidate-training-root) button.landing-btn-active,
button.landing-btn-active,
.landing-btn-active,
:is(#company-landing-root, #training-preview-root, .training-preview-root, .candidate-training-root, #candidate-training-root) .site-preview-btn,
:is(#company-landing-root, #training-preview-root, .training-preview-root, .candidate-training-root, #candidate-training-root) a.site-preview-btn,
.site-preview-btn,
a.site-preview-btn,
:is(#company-landing-root, #training-preview-root, .training-preview-root, .candidate-training-root, #candidate-training-root) .vacancy-hero-banner a.site-preview-btn,
.vacancy-hero-banner a.site-preview-btn,
:is(#company-landing-root, #training-preview-root, .training-preview-root, .candidate-training-root, #candidate-training-root) .landing-recruitment-badge,
.landing-recruitment-badge,
:is(#company-landing-root, #training-preview-root, .training-preview-root, .candidate-training-root, #candidate-training-root) .landing-icon-container,
:is(#company-landing-root, #training-preview-root, .training-preview-root, .candidate-training-root, #candidate-training-root) .about-tag-badge,
:is(#company-landing-root, #training-preview-root, .training-preview-root, .candidate-training-root, #candidate-training-root) .about-icon-badge,
:is(#company-landing-root, #training-preview-root, .training-preview-root, .candidate-training-root, #candidate-training-root) .product-card,
:is(#company-landing-root, #training-preview-root, .training-preview-root, .candidate-training-root, #candidate-training-root) .stat-box,
:is(#company-landing-root, #training-preview-root, .training-preview-root, .candidate-training-root, #candidate-training-root) .landing-bonus-card,
:is(#company-landing-root, #training-preview-root, .training-preview-root, .candidate-training-root, #candidate-training-root) .vacancy-card-badge,
.landing-ai-badge,
.candidate-auth-modal .landing-btn-active,
.candidate-auth-modal button.landing-btn-active,
:is(#company-landing-root, #training-preview-root, .training-preview-root, .candidate-training-root, #candidate-training-root) button.bg-\\[\\#E7C768\\] {
  background: ${btnActiveBgColorRgba} !important;
  background-color: ${btnActiveBgColorRgba} !important;
  background-image: none !important;
  color: ${btnActiveText} !important;
  -webkit-text-fill-color: ${btnActiveText} !important;
  border-color: ${btnBorderColorRgba} !important;
  border-width: ${parsedTheme.btnBorderWidth ?? 1}px !important;
  border-radius: var(--landing-radius-btn) !important;
}

:is(#company-landing-root, #training-preview-root, .training-preview-root, .candidate-training-root, #candidate-training-root) .landing-btn-active *,
:is(#company-landing-root, #training-preview-root, .training-preview-root, .candidate-training-root, #candidate-training-root) [class*="landing-btn-active"] *,
button.landing-btn-active *,
.landing-btn-active *,
:is(#company-landing-root, #training-preview-root, .training-preview-root, .candidate-training-root, #candidate-training-root) .section-card .landing-btn-active *,
:is(#company-landing-root, #training-preview-root, .training-preview-root, .candidate-training-root, #candidate-training-root) .liquid-glass-card .landing-btn-active *,
:is(#company-landing-root, #training-preview-root, .training-preview-root, .candidate-training-root, #candidate-training-root) .site-preview-btn *,
:is(#company-landing-root, #training-preview-root, .training-preview-root, .candidate-training-root, #candidate-training-root) a.site-preview-btn *,
.site-preview-btn *,
a.site-preview-btn *,
:is(#company-landing-root, #training-preview-root, .training-preview-root, .candidate-training-root, #candidate-training-root) .vacancy-hero-banner a.site-preview-btn *,
.vacancy-hero-banner a.site-preview-btn *,
:is(#company-landing-root, #training-preview-root, .training-preview-root, .candidate-training-root, #candidate-training-root) .landing-recruitment-badge *,
.landing-recruitment-badge *,
:is(#company-landing-root, #training-preview-root, .training-preview-root, .candidate-training-root, #candidate-training-root) .about-tag-badge *,
:is(#company-landing-root, #training-preview-root, .training-preview-root, .candidate-training-root, #candidate-training-root) .about-icon-badge *,
:is(#company-landing-root, #training-preview-root, .training-preview-root, .candidate-training-root, #candidate-training-root) .product-card *,
:is(#company-landing-root, #training-preview-root, .training-preview-root, .candidate-training-root, #candidate-training-root) .stat-box *,
:is(#company-landing-root, #training-preview-root, .training-preview-root, .candidate-training-root, #candidate-training-root) .landing-bonus-card *,
:is(#company-landing-root, #training-preview-root, .training-preview-root, .candidate-training-root, #candidate-training-root) .vacancy-card-badge *,
.landing-ai-badge *,
.candidate-auth-modal .landing-btn-active *,
.candidate-auth-modal button.landing-btn-active * {
  color: ${btnActiveText} !important;
  -webkit-text-fill-color: ${btnActiveText} !important;
  stroke: ${btnActiveText} !important;
}

:is(#company-landing-root, #training-preview-root, .training-preview-root, .candidate-training-root, #candidate-training-root) .landing-btn-inactive,
:is(#company-landing-root, #training-preview-root, .training-preview-root, .candidate-training-root, #candidate-training-root) [class*="landing-btn-inactive"],
.landing-btn-inactive {
  background: ${btnInactiveBgColorRgba} !important;
  background-color: ${btnInactiveBgColorRgba} !important;
  color: ${btnInactiveText} !important;
  -webkit-text-fill-color: ${btnInactiveText} !important;
  border-color: ${btnBorderColorRgba} !important;
  border-width: ${parsedTheme.btnBorderWidth ?? 1}px !important;
  border-radius: var(--landing-radius-btn) !important;
}

:is(#company-landing-root, #training-preview-root, .training-preview-root, .candidate-training-root, #candidate-training-root) .landing-btn-inactive *,
:is(#company-landing-root, #training-preview-root, .training-preview-root, .candidate-training-root, #candidate-training-root) [class*="landing-btn-inactive"] *,
.landing-btn-inactive * {
  color: ${btnInactiveText} !important;
  -webkit-text-fill-color: ${btnInactiveText} !important;
}
`;
})()}

/* ============================================================
   TYPOGRAPHY ENFORCEMENT
   All sub-tab and section titles strictly respect selected font.
   ============================================================ */
#company-landing-root,
#company-landing-root *,
#company-landing-root h1,
#company-landing-root h2,
#company-landing-root h3,
#company-landing-root h4,
#company-landing-root .subtab-title,
#company-landing-root .vacancy-subtab-title,
#company-landing-root .section-header-title {
  font-family: var(--landing-font) !important;
}

/* ============================================================
   GLOBAL & MOBILE SCROLLBAR ENFORCEMENT
   The right vertical scrollbar matches configured icon color.
   ============================================================ */
:root,
html,
body,
#company-landing-root,
.landing-ai-dialog,
.candidate-auth-modal {
  scrollbar-width: thin !important;
  scrollbar-color: ${parsedTheme.iconColor || "#E7C768"} transparent !important;
}

*::-webkit-scrollbar {
  width: 6px !important;
  height: 6px !important;
}

*::-webkit-scrollbar-track {
  background: transparent !important;
}

*::-webkit-scrollbar-thumb {
  background: ${parsedTheme.iconColor || "#E7C768"} !important;
  border-radius: 9999px !important;
}

*::-webkit-scrollbar-thumb:hover {
  background: ${parsedTheme.iconColor || "#E7C768"} !important;
  filter: brightness(1.15) !important;
}
`;
}

let activeLandingThemeMounts = 0;

// Export hook to apply theme styles strictly while component is mounted and remove on unmount
export function useLandingTheme(themeConfig?: LandingThemeConfig | string | null): { activeTheme: LandingThemeConfig } {
  const parsedTheme: LandingThemeConfig = useMemo(() => {
    if (!themeConfig) {
      if (typeof window !== "undefined" && (window as any).__ACTIVE_LANDING_THEME) {
        return (window as any).__ACTIVE_LANDING_THEME;
      }
      return {};
    }
    if (typeof themeConfig === "string") {
      try {
        return JSON.parse(themeConfig);
      } catch {
        return {};
      }
    }
    return themeConfig;
  }, [themeConfig]);

  useEffect(() => {
    if (typeof window !== "undefined" && Object.keys(parsedTheme).length > 0) {
      (window as any).__ACTIVE_LANDING_THEME = parsedTheme;
    }
  }, [parsedTheme]);

  // Ensure selected Google font is linked in head immediately
  useEffect(() => {
    ensureGoogleFontLoaded(parsedTheme.fontFamily);
  }, [parsedTheme.fontFamily]);

  // Update stylesheet smoothly without tearing it down on every render
  useEffect(() => {
    let styleTag = document.getElementById("landing-custom-theme-styles") as HTMLStyleElement | null;
    if (!styleTag) {
      styleTag = document.createElement("style");
      styleTag.id = "landing-custom-theme-styles";
      document.head.appendChild(styleTag);
    }
    const newCss = buildThemeCss(parsedTheme);
    if (styleTag.textContent !== newCss) {
      styleTag.textContent = newCss;
    }
  }, [parsedTheme]);

  // Only remove when the last mounted useLandingTheme consumer unmounts
  useEffect(() => {
    activeLandingThemeMounts += 1;
    return () => {
      activeLandingThemeMounts = Math.max(0, activeLandingThemeMounts - 1);
      if (activeLandingThemeMounts === 0) {
        const el = document.getElementById("landing-custom-theme-styles");
        if (el) el.remove();
        if (typeof window !== "undefined") {
          delete (window as any).__ACTIVE_LANDING_THEME;
        }
      }
    };
  }, []);

  return { activeTheme: parsedTheme };
}

export interface LandingStyleEditorProps {
  company: any;
  onUpdateTheme?: (newTheme: LandingThemeConfig) => void;
  onSaved?: (savedCompany: any) => void;
  isOpen?: boolean;
  onToggleOpen?: (open: boolean) => void;
}

export default function LandingStyleEditor({ company, onUpdateTheme, onSaved, isOpen: controlledIsOpen, onToggleOpen }: LandingStyleEditorProps) {
  const { run: aiWaitRun } = useAIWait();
  const [isAuthorizedEmployer, setIsAuthorizedEmployer] = useState<boolean>(false);
  const [internalIsOpen, setInternalIsOpen] = useState<boolean>(false);
  const isOpen = controlledIsOpen !== undefined ? controlledIsOpen : internalIsOpen;
  const setIsOpen = (val: boolean) => {
    setInternalIsOpen(val);
    if (onToggleOpen) {
      onToggleOpen(val);
    }
  };
  const [isMinimized, setIsMinimized] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<"presets" | "typography" | "backgrounds" | "containers" | "headerButtons" | "css">("presets");
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);
  const [isAcademyModalOpen, setIsAcademyModalOpen] = useState<boolean>(false);

  // AI Style Generation Prompt
  const [aiPromptText, setAiPromptText] = useState<string>("");

  // Custom User Saved Templates
  const [customPresets, setCustomPresets] = useState<{ id: string; name: string; theme_json: string }[]>([]);
  const [newPresetName, setNewPresetName] = useState<string>("");
  const [isSavingPreset, setIsSavingPreset] = useState<boolean>(false);

  const { upload, uploading: isUploadingFile } = useFileUpload();
  const heroDesktopFileInputRef = useRef<HTMLInputElement>(null);
  const heroMobileFileInputRef = useRef<HTMLInputElement>(null);
  const pageBgDesktopFileInputRef = useRef<HTMLInputElement>(null);
  const pageBgMobileFileInputRef = useRef<HTMLInputElement>(null);
  const logoFileInputRef = useRef<HTMLInputElement>(null);

  // Parse initial theme from company record
  const initialTheme: LandingThemeConfig = useMemo(() => {
    const raw = company?.theme_config || company?.css;
    if (!raw) return {};
    if (typeof raw === "string") {
      try {
        return JSON.parse(raw);
      } catch {
        return {};
      }
    }
    return raw;
  }, [company?.id]);

  const [theme, setTheme] = useState<LandingThemeConfig>({
    fontFamily: initialTheme.fontFamily || "'Manrope', sans-serif",
    headingsColorMode: initialTheme.headingsColorMode || "gradient-gold",
    headingsSolidColor: initialTheme.headingsSolidColor || "#E7C768",
    bodyTextColor: initialTheme.bodyTextColor || "#E2E8F0",
    boldTextColor: initialTheme.boldTextColor || "#FFFFFF",
    iconColor: initialTheme.iconColor || "#E7C768",
    lineHeight: initialTheme.lineHeight ?? 1.6,
    fontSizeH1: initialTheme.fontSizeH1 ?? 36,
    fontSizeH2: initialTheme.fontSizeH2 ?? 26,
    fontSizeH3: initialTheme.fontSizeH3 ?? 20,
    fontSizeH4: initialTheme.fontSizeH4 ?? 16,
    fontSizeBody: initialTheme.fontSizeBody ?? 15,

    pageBgColor: initialTheme.pageBgColor || "#17344F",
    pageBgOpacity: initialTheme.pageBgOpacity ?? 100,
    pageBgFilterColor: initialTheme.pageBgFilterColor || "#17344F",
    pageBgFilterOpacity: initialTheme.pageBgFilterOpacity ?? 0,
    pageBgImageUrl: initialTheme.pageBgImageUrl || "",
    pageBgMediaUrl: initialTheme.pageBgMediaUrl || initialTheme.pageBgImageUrl || "",
    pageBgMobileMediaUrl: initialTheme.pageBgMobileMediaUrl || "",
    pageBgVideoAutoplay: initialTheme.pageBgVideoAutoplay ?? true,
    pageBgVideoLoop: initialTheme.pageBgVideoLoop ?? true,
    pageBgDisplayMode: initialTheme.pageBgDisplayMode || "fixed",
    pageBgParallaxSpeed: initialTheme.pageBgParallaxSpeed ?? 0.35,

    heroBgImageUrl: initialTheme.heroBgImageUrl || "",
    heroBgMediaUrl: initialTheme.heroBgMediaUrl || initialTheme.heroBgImageUrl || "",
    heroBgMobileMediaUrl: initialTheme.heroBgMobileMediaUrl || "",
    heroBgFilterColor: initialTheme.heroBgFilterColor || "#17344F",
    heroBgFilterOpacity: initialTheme.heroBgFilterOpacity ?? 0,
    heroBgVideoAutoplay: initialTheme.heroBgVideoAutoplay ?? true,
    heroBgVideoLoop: initialTheme.heroBgVideoLoop ?? true,
    heroBgDisplayMode: initialTheme.heroBgDisplayMode || "cover",
    heroBgParallaxSpeed: initialTheme.heroBgParallaxSpeed ?? 0.4,

    logoFilterColor: initialTheme.logoFilterColor || "#E7C768",
    logoFilterOpacity: initialTheme.logoFilterOpacity ?? 0,
    logoBgColor: initialTheme.logoBgColor || "#FFFFFF",
    logoBgOpacity: initialTheme.logoBgOpacity ?? 0,

    showSphereAnimation: initialTheme.showSphereAnimation ?? false,
    showWaveAnimation: initialTheme.showWaveAnimation !== false,
    sitePreviewHeight: initialTheme.sitePreviewHeight ?? 180,
    siteDisplayMode: initialTheme.siteDisplayMode || "preview",
    sitePreviewFilterColor: initialTheme.sitePreviewFilterColor || "#17344F",
    sitePreviewFilterOpacity: initialTheme.sitePreviewFilterOpacity ?? 0,
    siteScreenshotFilterColor: initialTheme.siteScreenshotFilterColor || "#17344F",
    siteScreenshotFilterOpacity: initialTheme.siteScreenshotFilterOpacity ?? 0,

    containerBgColor: initialTheme.containerBgColor || "#17344F",
    containerBgOpacity: initialTheme.containerBgOpacity ?? 0,
    glassBlurPx: initialTheme.glassBlurPx ?? 24,
    containerBorderColor: initialTheme.containerBorderColor || "#FFFFFF",
    containerBorderOpacity: initialTheme.containerBorderOpacity ?? 20,
    containerBorderWidth: initialTheme.containerBorderWidth ?? 1,
    containerBorderRadius: initialTheme.containerBorderRadius ?? 24,

    headerBgColor: initialTheme.headerBgColor || "#17344F",
    headerBgOpacity: initialTheme.headerBgOpacity ?? 0,
    headerBgFilterColor: initialTheme.headerBgFilterColor || "#17344F",
    headerBgFilterOpacity: initialTheme.headerBgFilterOpacity ?? 0,
    headerBorderColor: initialTheme.headerBorderColor || "#FFFFFF",
    headerBorderOpacity: initialTheme.headerBorderOpacity ?? 20,
    headerBorderWidth: initialTheme.headerBorderWidth ?? 1,
    headerBorderRadius: initialTheme.headerBorderRadius ?? 0,

    btnActiveBgColor: initialTheme.btnActiveBgColor || "#E7C768",
    btnActiveTextColor: initialTheme.btnActiveTextColor || "#17344F",
    btnActiveOpacity: initialTheme.btnActiveOpacity ?? 100,
    btnInactiveBgColor: initialTheme.btnInactiveBgColor || "#000000",
    btnInactiveTextColor: initialTheme.btnInactiveTextColor || "#CBD5E1",
    btnInactiveOpacity: initialTheme.btnInactiveOpacity ?? 25,
    btnBorderColor: initialTheme.btnBorderColor || "#FFFFFF",
    btnBorderOpacity: initialTheme.btnBorderOpacity ?? 20,
    btnBorderWidth: initialTheme.btnBorderWidth ?? 1,
    btnBorderRadius: initialTheme.btnBorderRadius ?? 16,

    customCss: initialTheme.customCss || "",
  });

  // Sync theme when company ID or theme config changes
  useEffect(() => {
    const raw = company?.theme_config || company?.css;
    if (raw) {
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (parsed && typeof parsed === "object") {
        setTheme((prev) => ({ ...prev, ...parsed }));
      }
    }
  }, [company?.id, company?.theme_config, company?.css]);

  // Load custom saved templates
  const loadCustomPresets = async () => {
    try {
      const empId = company?.owner_employer_id || company?.employer_id || "100007";
      const res = await fetch(`/api/theme-presets?employerId=${empId}`);
      if (res.ok) {
        const data = await res.json();
        setCustomPresets(data?.presets || []);
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    loadCustomPresets();
  }, [company?.id]);

  // Verify employer permission
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = localStorage.getItem("emp_token") || localStorage.getItem("employer_token");
      if (!token) {
        if (!cancelled) setIsAuthorizedEmployer(false);
        return;
      }

      try {
        const meRes = await fetch("/api/auth/employer/me", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (meRes.ok) {
          const data = await meRes.json();
          const u = data?.user;
          const uPid = String(u?.publicId || u?.public_id || u?.id || "");
          const isOwner =
            u?.role === "admin" ||
            u?.is_admin ||
            u?.email === "shishkarnem@gmail.com" ||
            (uPid && (String(company?.owner_employer_id) === uPid || String(company?.employer_id) === uPid));

          if (!cancelled) {
            setIsAuthorizedEmployer(Boolean(isOwner));
          }
        }
      } catch {
        if (!cancelled) setIsAuthorizedEmployer(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [company?.id, company?.owner_employer_id, company?.employer_id]);

  // Generate live CSS and inject into document head
  const generatedCssTemplate = useMemo(() => {
    return buildThemeCss(theme);
  }, [theme]);

  // Live CSS injection to `<style id="landing-custom-theme-styles">` (only for standalone preview)
  useEffect(() => {
    if (onUpdateTheme) {
      // Parent manages style injection smoothly via useLandingTheme
      return;
    }
    ensureGoogleFontLoaded(theme.fontFamily);
    let styleTag = document.getElementById("landing-custom-theme-styles") as HTMLStyleElement | null;
    if (!styleTag) {
      styleTag = document.createElement("style");
      styleTag.id = "landing-custom-theme-styles";
      document.head.appendChild(styleTag);
    }
    if (styleTag.textContent !== generatedCssTemplate) {
      styleTag.textContent = generatedCssTemplate;
    }

    return () => {
      const el = document.getElementById("landing-custom-theme-styles");
      if (el) el.remove();
    };
  }, [generatedCssTemplate, onUpdateTheme, theme.fontFamily]);

  // Immediately broadcast live theme updates to parent
  useEffect(() => {
    if (onUpdateTheme) {
      onUpdateTheme(theme);
    }
  }, [theme, onUpdateTheme]);

  // Auto open when URL has edit_theme=1 or edit=1
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("edit_theme") === "1" || params.get("edit_style") === "1" || params.get("edit") === "1") {
        setIsOpen(true);
      }
    }
  }, []);

  const hasEditParam = typeof window !== "undefined" && (new URLSearchParams(window.location.search).get("edit_theme") === "1" || new URLSearchParams(window.location.search).get("edit") === "1" || new URLSearchParams(window.location.search).get("edit_style") === "1");
  const isComCanonicalPath = typeof window !== "undefined" && (window.location.pathname.startsWith("/com") || window.location.pathname.startsWith("/company/"));

  // The style editor is visible on the mirror (/com...) and when edit param is set, or when authorized employer is viewing.
  // Public candidate vanity URLs (like /rentrop) without edit params remain strictly clean.
  const isEditorAllowed = isAuthorizedEmployer || isComCanonicalPath || hasEditParam;
  if (!isEditorAllowed) {
    return null;
  }

  // Handle uploading background media (images & videos with 10MB max video limit)
  const MAX_VIDEO_SIZE = 10 * 1024 * 1024; // 10MB limit

  const handleUploadMedia = async (
    e: React.ChangeEvent<HTMLInputElement>,
    targetField: "heroBgMediaUrl" | "heroBgMobileMediaUrl" | "pageBgMediaUrl" | "pageBgMobileMediaUrl"
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isVideo = file.type.startsWith("video/") || /\.(mp4|webm|mov|mkv|avi|m4v)$/i.test(file.name);
    if (isVideo && file.size > MAX_VIDEO_SIZE) {
      const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
      alert(`Размер видео (${sizeMb} МБ) превышает ограничение 10 МБ. Пожалуйста, сожмите видео или выберите файл меньше 10 МБ.`);
      e.target.value = "";
      return;
    }

    try {
      const { url } = await upload(file);
      if (url) {
        setTheme((prev) => {
          const next = { ...prev, [targetField]: url };
          if (targetField === "heroBgMediaUrl") {
            next.heroBgImageUrl = url;
          }
          if (targetField === "pageBgMediaUrl") {
            next.pageBgImageUrl = url;
          }
          return next;
        });
      }
    } catch (err: any) {
      console.error("Upload error:", err);
      alert(`Ошибка загрузки: ${err?.message || "Не удалось загрузить файл"}`);
    } finally {
      e.target.value = "";
    }
  };

  // Handle logo update in Backgrounds tab
  const handleUploadLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { url } = await upload(file);
      if (url && company) {
        company.logo_url = url;
        if (onSaved) {
          onSaved({ ...company, logo_url: url });
        }
      }
    } catch (err) {
      console.error("Logo upload error:", err);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSavedSuccess(false);
    try {
      const compIdentifier = company?.public_id || company?.id || company?.slug;
      if (compIdentifier) {
        let savedCompanyData: any = null;

        // 1. Dedicated theme endpoint directly persists to ProTalk PG and cascades to all company vacancies
        const themeRes = await fetch(`/api/companies/${encodeURIComponent(compIdentifier)}/theme`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            company_id: company?.id,
            public_id: company?.public_id,
            slug: company?.slug,
            employer_id: company?.owner_employer_id || company?.employer_id,
            theme,
            theme_config: theme,
            css: theme,
          }),
        });
        if (themeRes.ok) {
          const data = await themeRes.json().catch(() => null);
          if (data?.company) {
            savedCompanyData = data.company;
          }
        }

        // 2. Fallback to POST /api/companies only if dedicated theme endpoint did not return updated company
        if (!savedCompanyData) {
          const {
            is_team_member: _itm,
            member_role: _mr,
            member_permissions: _mp,
            ...cleanCompany
          } = company || {};
          const payload = {
            ...cleanCompany,
            theme_config: theme,
            css: theme,
          };
          const res = await fetch("/api/companies", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          if (res.ok) {
            const data = await res.json().catch(() => null);
            if (data?.company) {
              savedCompanyData = data.company;
            }
          } else {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.message || errData.error || "Ошибка сохранения в базу данных");
          }
        }

        if (savedCompanyData) {
          if (onSaved) {
            onSaved(savedCompanyData);
          }
          if (onUpdateTheme) {
            onUpdateTheme(theme);
          }
          setSavedSuccess(true);
          setTimeout(() => setSavedSuccess(false), 3000);
        }
      }
    } catch (err: any) {
      console.error("Failed to save landing theme:", err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleApplyPreset = (presetTheme: LandingThemeConfig) => {
    setTheme((prev) => {
      const isPresetMono = presetTheme.allMediaMonochrome === true;
      return {
        ...prev,
        allMediaMonochrome: isPresetMono,
        logoMonochrome: isPresetMono || presetTheme.logoMonochrome === true,
        heroBgMonochrome: isPresetMono || presetTheme.heroBgMonochrome === true,
        pageBgMonochrome: isPresetMono || presetTheme.pageBgMonochrome === true,
        sitePreviewMonochrome: isPresetMono || presetTheme.sitePreviewMonochrome === true,
        siteScreenshotMonochrome: isPresetMono || presetTheme.siteScreenshotMonochrome === true,
        customCss: presetTheme.customCss !== undefined ? presetTheme.customCss : "",
        ...presetTheme,
      };
    });
  };

  const handleSaveCustomPreset = async () => {
    if (!newPresetName.trim()) return;
    setIsSavingPreset(true);
    try {
      const empId = resolveActiveEmployerId(company);
      const res = await fetch("/api/theme-presets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employer_id: empId,
          name: newPresetName.trim(),
          theme: theme,
        }),
      });
      if (res.ok) {
        setNewPresetName("");
        await loadCustomPresets();
      }
    } catch (err) {
      console.error("Failed to save preset:", err);
    } finally {
      setIsSavingPreset(false);
    }
  };

  const handleDeletePreset = async (presetId: string) => {
    try {
      const res = await fetch(`/api/theme-presets/${presetId}`, { method: "DELETE" });
      if (res.ok) {
        setCustomPresets((prev) => prev.filter((p) => p.id !== presetId));
      }
    } catch (err) {
      console.error("Failed to delete preset:", err);
    }
  };

  // Run AI Style Generation with Global Mascot Waiting Overlay
  const getCleanUserId = () => resolveActiveEmployerId(company);

  const handleGenerateAIStyle = async () => {
    if (!aiPromptText.trim()) return;
    const prompt = aiPromptText.trim();
    const cleanUid = getCleanUserId();

    try {
      await aiWaitRun({
        title: "Генерация стиля лендинга",
        theme,
        task: async () => {
          const res = await fetch("/api/generate-landing-theme", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              userPrompt: prompt,
              companyName: company?.name || "",
              industry: company?.industry || "",
              currentTheme: theme,
              userId: cleanUid,
              employerId: cleanUid,
              employer_id: cleanUid,
              employer_public_id: cleanUid,
              company_id: company?.id || company?.public_id,
            }),
          });

          if (!res.ok) {
            throw new Error("ai_temporary");
          }
          const data = await res.json();
          if (!data?.success || !data?.theme) {
            throw new Error("ai_temporary");
          }

          handleApplyPreset(data.theme);
          setAiPromptText("");
          return data.theme;
        },
      });
    } catch (err) {
      console.error("AI theme generation error:", err);
    }
  };

  const handleReset = () => {
    handleApplyPreset(BUILTIN_STYLE_PRESETS[0].theme);
  };

  const isManagementUrl = typeof window !== "undefined" && (
    window.location.pathname.startsWith("/com") ||
    window.location.pathname.startsWith("/company/") ||
    window.location.search.includes("edit=1") ||
    window.location.search.includes("preview=1")
  );

  if (!isEditorAllowed) {
    return null;
  }

  return (
    <>
      {/* Floating employer toolbar trigger button */}
      {!isOpen && (
        <div className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-40 max-w-[calc(100vw-2rem)]">
          <button
            onClick={() => setIsOpen(true)}
            className="flex items-center gap-2 sm:gap-2.5 px-4 py-3 rounded-2xl bg-transparent backdrop-blur-2xl border border-white/20 hover:border-[#E7C768] text-white font-semibold text-sm shadow-2xl transition-all duration-300 hover:scale-105 group"
          >
            <Palette className="w-5 h-5 text-[#E7C768] group-hover:rotate-12 transition-transform shrink-0" />
            <span className="bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent font-bold truncate">
              Редактор стилей лендинга
            </span>
            <span className="w-2 h-2 rounded-full bg-[#E7C768] animate-ping shrink-0" />
          </button>
        </div>
      )}

      {/* Floating Editor Panel */}
      {isOpen && (
        <div className="fixed inset-x-2 top-2 bottom-2 sm:inset-x-auto sm:top-4 sm:right-4 sm:bottom-4 z-50 w-auto sm:w-full sm:max-w-md pointer-events-none flex flex-col justify-end">
          <div
            id="landing-style-editor-panel"
            style={{
              backgroundColor: hexToRgba(theme.containerBgColor || "#17344F", Math.max(80, theme.containerBgOpacity ?? 95)),
              borderColor: hexToRgba(theme.containerBorderColor || "#FFFFFF", Math.max(20, theme.containerBorderOpacity ?? 25)),
              borderWidth: `${theme.containerBorderWidth ?? 1}px`,
              borderRadius: `${theme.containerBorderRadius || 24}px`,
              backdropFilter: `blur(${theme.glassBlurPx ?? 24}px)`,
              WebkitBackdropFilter: `blur(${theme.glassBlurPx ?? 24}px)`,
              color: theme.bodyTextColor || "#E2E8F0",
              fontFamily: theme.fontFamily || "inherit",
              accentColor: theme.iconColor || "#E7C768",
              ["--landing-icon-color" as any]: theme.iconColor || "#E7C768",
            } as React.CSSProperties}
            className={[
              "w-full h-full shadow-[0_20px_70px_rgba(0,0,0,0.7)] flex flex-col overflow-hidden pointer-events-auto transition-all duration-300 border",
              isMinimized ? "max-h-[70px]" : "max-h-full",
            ].join(" ")}
          >
            {/* Header */}
            <div className="p-4 border-b border-white/15 flex items-center justify-between gap-3 bg-transparent backdrop-blur-md shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-transparent border border-white/20 flex items-center justify-center text-[#E7C768] shrink-0">
                  <Palette className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h3
                    style={
                      theme.headingsColorMode === "solid" && theme.headingsSolidColor
                        ? { color: theme.headingsSolidColor }
                        : {}
                    }
                    className={`text-sm font-bold truncate ${
                      theme.headingsColorMode === "gradient-silver"
                        ? "bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent"
                        : theme.headingsColorMode === "solid"
                        ? ""
                        : "bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent"
                    }`}
                  >
                    Редактор стилей лендинга
                  </h3>
                  <p style={{ color: theme.bodyTextColor || "#94A3B8" }} className="text-[14px] truncate opacity-80">
                    Реальное время · видно только вам
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsAcademyModalOpen(true)}
                  className="w-7 h-7 rounded-lg flex items-center justify-center border border-white/15 hover:border-[#E7C768] text-slate-300 hover:text-white transition cursor-pointer"
                  title="Обучающая инструкция: Конструктор лендинга и стили (ИИ-Академия)"
                  aria-label="Инструкция по редактору стилей"
                >
                  <HelpCircle className="w-3.5 h-3.5 text-[#E7C768]" />
                </button>
                <button
                  onClick={() => setIsMinimized(!isMinimized)}
                  className="w-7 h-7 rounded-lg flex items-center justify-center border border-white/15 hover:border-white/40 text-slate-300 hover:text-white transition"
                  title={isMinimized ? "Развернуть" : "Свернуть"}
                >
                  {isMinimized ? <Maximize2 className="w-3.5 h-3.5" /> : <Minimize2 className="w-3.5 h-3.5" />}
                </button>
                <button
                  onClick={() => setIsOpen(false)}
                  className="w-7 h-7 rounded-lg flex items-center justify-center border border-white/15 hover:border-[#E7C768] text-slate-300 hover:text-white transition"
                  title="Закрыть"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {!isMinimized && (
              <>
                {/* Tabs bar - Tag Cloud without horizontal scrolling */}
                <div className="flex flex-wrap items-center gap-1.5 p-2.5 border-b border-white/15 bg-transparent shrink-0">
                  {[
                    { id: "presets", label: "Пресеты и ИИ", icon: <Sparkles className="w-4 h-4" /> },
                    { id: "typography", label: "Текст", icon: <Type className="w-4 h-4" /> },
                    { id: "backgrounds", label: "Фон", icon: <ImageIcon className="w-4 h-4" /> },
                    { id: "containers", label: "Стекло", icon: <Layers className="w-4 h-4" /> },
                    { id: "headerButtons", label: "Кнопки", icon: <Sliders className="w-4 h-4" /> },
                    { id: "css", label: "CSS", icon: <Code className="w-4 h-4" /> },
                  ].map((tb) => {
                    const isActive = activeTab === tb.id;
                    return (
                      <button
                        key={tb.id}
                        onClick={() => setActiveTab(tb.id as any)}
                        style={
                          isActive
                            ? {
                                backgroundColor: hexToRgba(theme.btnActiveBgColor || "#E7C768", theme.btnActiveOpacity ?? 100),
                                color: theme.btnActiveTextColor || "#17344F",
                                borderColor: hexToRgba(theme.btnBorderColor || "#FFFFFF", theme.btnBorderOpacity ?? 30),
                                borderRadius: `${Math.min(16, theme.btnBorderRadius || 12)}px`,
                              }
                            : {
                                backgroundColor: hexToRgba(theme.btnInactiveBgColor || "#000000", theme.btnInactiveOpacity ?? 20),
                                color: theme.btnInactiveTextColor || theme.bodyTextColor || "#CBD5E1",
                                borderColor: "transparent",
                                borderRadius: `${Math.min(16, theme.btnBorderRadius || 12)}px`,
                              }
                        }
                        className="flex items-center justify-center gap-1.5 py-1.5 px-3 text-sm font-semibold whitespace-nowrap transition border shadow-sm cursor-pointer"
                      >
                        {tb.icon}
                        <span>{tb.label}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Tab Body */}
                <div className="flex-1 overflow-y-auto p-4 space-y-5 text-sm">
                  {/* 0. PRESETS & AI GENERATOR */}
                  {activeTab === "presets" && (
                    <div className="space-y-6">
                      {/* AI Style Generation Card */}
                      <div className="p-4 rounded-2xl bg-white/5 border border-[#E7C768]/40 space-y-3 shadow-lg relative overflow-hidden">
                        <div className="flex items-center gap-2">
                          <Bot className="w-4 h-4 text-[#E7C768]" />
                          <span className="text-xs font-bold text-white uppercase tracking-wider">
                            Генерация стиля через ИИ
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-300 leading-relaxed">
                          Опишите словами или надиктуйте голосом желаемую эстетику (цвета, атмосферу, настроение), и нейросеть мгновенно настроит все параметры лендинга.
                        </p>

                        <MiniAudioField
                          placeholder="Например: Неоновый киберпанк с изумрудными акцентами и футуристичным шрифтом..."
                          value={aiPromptText}
                          onChange={(val) => setAiPromptText(val)}
                          minRows={2}
                        />

                        <button
                          type="button"
                          onClick={handleGenerateAIStyle}
                          disabled={!aiPromptText.trim()}
                          className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] text-[#17344F] font-bold text-xs shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                        >
                          <Sparkles className="w-4 h-4" />
                          <span>Сгенерировать стиль через ИИ</span>
                        </button>
                      </div>

                      {/* Built-in Presets */}
                      <div className="space-y-3">
                        <span className="text-xs font-bold text-[#E7C768] uppercase tracking-wider block">
                          Готовые темы на выбор
                        </span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          {BUILTIN_STYLE_PRESETS.map((preset) => (
                            <button
                              key={preset.id}
                              type="button"
                              onClick={() => handleApplyPreset(preset.theme)}
                              className="p-3 rounded-2xl border border-white/15 hover:border-[#E7C768] bg-white/5 hover:bg-white/10 text-left transition flex flex-col justify-between gap-2 shadow-sm group cursor-pointer"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-bold text-white group-hover:text-[#E7C768] transition">
                                  {preset.name}
                                </span>
                                <div
                                  className="w-5 h-5 rounded-lg border border-white/30 shrink-0"
                                  style={{ background: preset.previewBg }}
                                />
                              </div>
                              <span className="text-[11px] text-slate-300 line-clamp-2">
                                {preset.desc}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Custom Saved Employer Templates */}
                      <div className="space-y-3 pt-2 border-t border-white/10">
                        <span className="text-xs font-bold text-slate-200 block">
                          Мои сохранённые шаблоны ({customPresets.length})
                        </span>

                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={newPresetName}
                            onChange={(e) => setNewPresetName(e.target.value)}
                            placeholder="Название нового шаблона..."
                            className="flex-1 bg-transparent border border-white/20 rounded-xl px-3 py-2 text-white text-xs font-medium focus:outline-none focus:border-[#E7C768]"
                          />
                          <button
                            type="button"
                            onClick={handleSaveCustomPreset}
                            disabled={!newPresetName.trim() || isSavingPreset}
                            className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-[#E7C768] text-xs font-bold transition flex items-center gap-1.5 shrink-0 disabled:opacity-40"
                          >
                            <Bookmark className="w-3.5 h-3.5" />
                            <span>{isSavingPreset ? "..." : "Сохранить"}</span>
                          </button>
                        </div>

                        {customPresets.length > 0 && (
                          <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                            {customPresets.map((cp) => (
                              <div
                                key={cp.id}
                                className="flex items-center justify-between gap-2 p-2.5 rounded-xl border border-white/15 bg-white/5"
                              >
                                <span className="text-xs font-medium text-white truncate max-w-[200px]">
                                  {cp.name}
                                </span>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      try {
                                        const parsed = JSON.parse(cp.theme_json);
                                        handleApplyPreset(parsed);
                                      } catch {}
                                    }}
                                    className="px-3 py-1 rounded-lg bg-transparent backdrop-blur-md hover:border-white border border-[#E7C768]/50 text-[#E7C768] text-sm font-bold transition"
                                  >
                                    Применить
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeletePreset(cp.id)}
                                    className="p-1 text-slate-300 hover:text-[#E7C768] transition"
                                    title="Удалить шаблон"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* 1. TYPOGRAPHY */}
                  {activeTab === "typography" && (
                    <div className="space-y-4">
                      {/* Google Fonts selector */}
                      <div className="space-y-1.5">
                        <label className="block text-xs font-bold text-slate-200">
                          Шрифт лендинга (Google Fonts)
                        </label>
                        <select
                          value={theme.fontFamily}
                          onChange={(e) => setTheme((p) => ({ ...p, fontFamily: e.target.value }))}
                          className="w-full bg-[#17344F] border border-white/20 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-[#E7C768]"
                        >
                          {GOOGLE_FONTS_LIST.map((f) => (
                            <option key={f.name} value={f.value}>
                              {f.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Headings style mode */}
                      <div className="space-y-1.5">
                        <label className="block text-xs font-bold text-slate-200">
                          Цвет и стиль заголовков (H1, H2)
                        </label>
                        <div className="grid grid-cols-3 gap-1.5">
                          {[
                            { id: "gradient-gold", label: "Золотой градиент" },
                            { id: "gradient-silver", label: "Серебряный" },
                            { id: "solid", label: "Сплошной цвет" },
                          ].map((mode) => (
                            <button
                              key={mode.id}
                              type="button"
                              onClick={() => setTheme((p) => ({ ...p, headingsColorMode: mode.id as any }))}
                              className={`p-2 rounded-xl border text-center text-xs font-semibold transition ${
                                theme.headingsColorMode === mode.id
                                  ? "border-[#E7C768] text-[#E7C768] bg-white/10"
                                  : "border-white/10 text-slate-300 hover:text-white"
                              }`}
                            >
                              {mode.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {theme.headingsColorMode === "solid" && (
                        <ColorPickerField
                          label="Цвет заголовков"
                          value={theme.headingsSolidColor || "#E7C768"}
                          onChange={(v) => setTheme((p) => ({ ...p, headingsSolidColor: v }))}
                        />
                      )}

                      <ColorPickerField
                        label="Основной цвет текста"
                        value={theme.bodyTextColor || "#E2E8F0"}
                        onChange={(v) => setTheme((p) => ({ ...p, bodyTextColor: v }))}
                      />

                      <ColorPickerField
                        label="Цвет жирного текста (strong / bold)"
                        value={theme.boldTextColor || "#FFFFFF"}
                        onChange={(v) => setTheme((p) => ({ ...p, boldTextColor: v }))}
                      />

                      <ColorPickerField
                        label="Цвет иконок (SVG / Lucide)"
                        value={theme.iconColor || "#E7C768"}
                        onChange={(v) => setTheme((p) => ({ ...p, iconColor: v }))}
                      />

                      {/* Line height slider */}
                      <div className="space-y-1 pt-1">
                        <div className="flex items-center justify-between text-xs font-semibold text-slate-200">
                          <span>Межстрочный интервал (Line Height)</span>
                          <span className="font-mono text-slate-400">{theme.lineHeight ?? 1.6}</span>
                        </div>
                        <input
                          type="range"
                          min="1.2"
                          max="2.2"
                          step="0.1"
                          value={theme.lineHeight ?? 1.6}
                          onChange={(e) => setTheme((p) => ({ ...p, lineHeight: parseFloat(e.target.value) }))}
                          style={{ accentColor: theme.iconColor || "#E7C768" }}
                          className="w-full cursor-pointer"
                        />
                      </div>

                      {/* Font sizes sliders */}
                      <div className="space-y-4 pt-3 border-t border-white/10">
                        <span className="block text-xs font-bold text-slate-200">Размеры шрифтов (минимальный 14px)</span>
                        
                        <div className="space-y-1 bg-white/5 p-2.5 rounded-xl border border-white/10">
                          <div className="flex items-center justify-between text-xs text-slate-200">
                            <span className="font-semibold">H1 Главный заголовок</span>
                            <span className="font-mono text-[#E7C768] font-bold">{theme.fontSizeH1 ?? 36}px</span>
                          </div>
                          <input
                            type="range"
                            min="20"
                            max="72"
                            step="1"
                            value={theme.fontSizeH1 ?? 36}
                            onChange={(e) => setTheme((p) => ({ ...p, fontSizeH1: parseInt(e.target.value, 10) || 36 }))}
                            style={{ accentColor: theme.iconColor || "#E7C768" }}
                            className="w-full cursor-pointer"
                          />
                        </div>

                        <div className="space-y-1 bg-white/5 p-2.5 rounded-xl border border-white/10">
                          <div className="flex items-center justify-between text-xs text-slate-200">
                            <span className="font-semibold">H2 Заголовки разделов</span>
                            <span className="font-mono text-[#E7C768] font-bold">{theme.fontSizeH2 ?? 26}px</span>
                          </div>
                          <input
                            type="range"
                            min="18"
                            max="54"
                            step="1"
                            value={theme.fontSizeH2 ?? 26}
                            onChange={(e) => setTheme((p) => ({ ...p, fontSizeH2: parseInt(e.target.value, 10) || 26 }))}
                            style={{ accentColor: theme.iconColor || "#E7C768" }}
                            className="w-full cursor-pointer"
                          />
                        </div>

                        <div className="space-y-1 bg-white/5 p-2.5 rounded-xl border border-white/10">
                          <div className="flex items-center justify-between text-xs text-slate-200">
                            <span className="font-semibold">H3 Подзаголовки</span>
                            <span className="font-mono text-[#E7C768] font-bold">{theme.fontSizeH3 ?? 20}px</span>
                          </div>
                          <input
                            type="range"
                            min="16"
                            max="40"
                            step="1"
                            value={theme.fontSizeH3 ?? 20}
                            onChange={(e) => setTheme((p) => ({ ...p, fontSizeH3: parseInt(e.target.value, 10) || 20 }))}
                            style={{ accentColor: theme.iconColor || "#E7C768" }}
                            className="w-full cursor-pointer"
                          />
                        </div>

                        <div className="space-y-1 bg-white/5 p-2.5 rounded-xl border border-white/10">
                          <div className="flex items-center justify-between text-xs text-slate-200">
                            <span className="font-semibold">Основной текст (абзацы, списки)</span>
                            <span className="font-mono text-[#E7C768] font-bold">{theme.fontSizeBody ?? 15}px</span>
                          </div>
                          <input
                            type="range"
                            min="14"
                            max="28"
                            step="1"
                            value={theme.fontSizeBody ?? 15}
                            onChange={(e) => setTheme((p) => ({ ...p, fontSizeBody: Math.max(14, parseInt(e.target.value, 10) || 15) }))}
                            style={{ accentColor: theme.iconColor || "#E7C768" }}
                            className="w-full cursor-pointer"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 2. BACKGROUNDS, LOGO & IMAGES */}
                  {activeTab === "backgrounds" && (
                    <div className="space-y-5">
                      {/* Master Monochrome and per-element grayscale toggles */}
                      <div className="p-3.5 rounded-2xl bg-white/5 border border-white/15 space-y-3 shadow-md">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-[#E7C768] uppercase tracking-wider flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5" />
                            Обесцвечивание медиа (Монохром)
                          </span>
                          <span className="text-[11px] text-slate-300">
                            {theme.allMediaMonochrome ? "Ч/Б режим" : "Цветной режим"}
                          </span>
                        </div>

                        {/* Quick Action Buttons */}
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setTheme((p) => ({
                                ...p,
                                allMediaMonochrome: true,
                                logoMonochrome: true,
                                heroBgMonochrome: true,
                                pageBgMonochrome: true,
                                sitePreviewMonochrome: true,
                                siteScreenshotMonochrome: true,
                              }));
                            }}
                            className={`py-2 px-3 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                              theme.allMediaMonochrome || (theme.logoMonochrome && theme.heroBgMonochrome && theme.pageBgMonochrome && theme.sitePreviewMonochrome)
                                ? "bg-white text-black border-white shadow-md"
                                : "border-white/15 bg-white/5 text-slate-300 hover:border-white/30 hover:bg-white/10"
                            }`}
                          >
                            <span>Сделать все Ч/Б</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setTheme((p) => ({
                                ...p,
                                allMediaMonochrome: false,
                                logoMonochrome: false,
                                heroBgMonochrome: false,
                                pageBgMonochrome: false,
                                sitePreviewMonochrome: false,
                                siteScreenshotMonochrome: false,
                              }));
                            }}
                            className={`py-2 px-3 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                              !theme.allMediaMonochrome && !theme.logoMonochrome && !theme.heroBgMonochrome && !theme.pageBgMonochrome && !theme.sitePreviewMonochrome
                                ? "bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] text-[#17344F] border-[#E7C768] shadow-md"
                                : "border-white/15 bg-white/5 text-slate-300 hover:border-white/30 hover:bg-white/10"
                            }`}
                          >
                            <span>Обычный цвет</span>
                          </button>
                        </div>

                        {/* Granular Toggles */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t border-white/10">
                          <label className={`p-2.5 rounded-xl border flex items-center justify-between cursor-pointer transition ${theme.logoMonochrome ? "border-[#E7C768]/60 bg-[#E7C768]/10 text-white" : "border-white/10 bg-white/5 text-slate-300 hover:border-white/25"}`}>
                            <span className="text-xs font-semibold">Ч/Б логотип</span>
                            <input
                              type="checkbox"
                              checked={Boolean(theme.logoMonochrome)}
                              onChange={(e) => {
                                const val = e.target.checked;
                                setTheme((p) => ({
                                  ...p,
                                  logoMonochrome: val,
                                  allMediaMonochrome: val && p.heroBgMonochrome && p.pageBgMonochrome && (p.sitePreviewMonochrome || p.siteScreenshotMonochrome),
                                }));
                              }}
                              className="w-4 h-4 rounded accent-[#E7C768] bg-transparent border-white/20"
                            />
                          </label>

                          <label className={`p-2.5 rounded-xl border flex items-center justify-between cursor-pointer transition ${theme.heroBgMonochrome ? "border-[#E7C768]/60 bg-[#E7C768]/10 text-white" : "border-white/10 bg-white/5 text-slate-300 hover:border-white/25"}`}>
                            <span className="text-xs font-semibold">Ч/Б фон первого экрана</span>
                            <input
                              type="checkbox"
                              checked={Boolean(theme.heroBgMonochrome)}
                              onChange={(e) => {
                                const val = e.target.checked;
                                setTheme((p) => ({
                                  ...p,
                                  heroBgMonochrome: val,
                                  allMediaMonochrome: val && p.logoMonochrome && p.pageBgMonochrome && (p.sitePreviewMonochrome || p.siteScreenshotMonochrome),
                                }));
                              }}
                              className="w-4 h-4 rounded accent-[#E7C768] bg-transparent border-white/20"
                            />
                          </label>

                          <label className={`p-2.5 rounded-xl border flex items-center justify-between cursor-pointer transition ${theme.pageBgMonochrome ? "border-[#E7C768]/60 bg-[#E7C768]/10 text-white" : "border-white/10 bg-white/5 text-slate-300 hover:border-white/25"}`}>
                            <span className="text-xs font-semibold">Ч/Б фон всей страницы</span>
                            <input
                              type="checkbox"
                              checked={Boolean(theme.pageBgMonochrome)}
                              onChange={(e) => {
                                const val = e.target.checked;
                                setTheme((p) => ({
                                  ...p,
                                  pageBgMonochrome: val,
                                  allMediaMonochrome: val && p.logoMonochrome && p.heroBgMonochrome && (p.sitePreviewMonochrome || p.siteScreenshotMonochrome),
                                }));
                              }}
                              className="w-4 h-4 rounded accent-[#E7C768] bg-transparent border-white/20"
                            />
                          </label>

                          <label className={`p-2.5 rounded-xl border flex items-center justify-between cursor-pointer transition ${theme.sitePreviewMonochrome || theme.siteScreenshotMonochrome ? "border-[#E7C768]/60 bg-[#E7C768]/10 text-white" : "border-white/10 bg-white/5 text-slate-300 hover:border-white/25"}`}>
                            <span className="text-xs font-semibold">Ч/Б превью и скриншот</span>
                            <input
                              type="checkbox"
                              checked={Boolean(theme.sitePreviewMonochrome || theme.siteScreenshotMonochrome)}
                              onChange={(e) => {
                                const val = e.target.checked;
                                setTheme((p) => ({
                                  ...p,
                                  sitePreviewMonochrome: val,
                                  siteScreenshotMonochrome: val,
                                  allMediaMonochrome: val && p.logoMonochrome && p.heroBgMonochrome && p.pageBgMonochrome,
                                }));
                              }}
                              className="w-4 h-4 rounded accent-[#E7C768] bg-transparent border-white/20"
                            />
                          </label>
                        </div>
                      </div>

                      {/* Company Logo section synced with company profile */}
                      <div className="p-3.5 rounded-2xl bg-white/5 border border-white/15 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-[#E7C768] uppercase tracking-wider">
                            Логотип компании и фильтр
                          </span>
                          <span className="text-[11px] text-slate-300">Синхронизировано с брендом</span>
                        </div>

                        <div className="flex items-center gap-3">
                          <div
                            className="relative w-14 h-14 rounded-xl border border-white/20 p-1 flex items-center justify-center shrink-0 overflow-hidden transition-all duration-300"
                            style={{
                              backgroundColor: hexToRgba(theme.logoBgColor || "#FFFFFF", theme.logoBgOpacity ?? 0),
                            }}
                          >
                            <img 
                              src={rrImg(company?.logo_url) || DEFAULT_RR_LOGO_URL} 
                              alt="Logo" 
                              className="w-full h-full object-contain relative z-[1]" 
                              referrerPolicy="no-referrer" 
                              onError={(e) => {
                                (e.currentTarget as HTMLImageElement).src = DEFAULT_RR_LOGO_URL;
                              }}
                            />
                            {(theme.logoFilterOpacity ?? 0) > 0 && (
                              <div
                                className="absolute inset-0 pointer-events-none z-[2] transition-colors duration-300"
                                style={{
                                  backgroundColor: hexToRgba(theme.logoFilterColor || "#E7C768", theme.logoFilterOpacity ?? 0),
                                  WebkitMaskImage: `url("${rrImg(company?.logo_url) || DEFAULT_RR_LOGO_URL}")`,
                                  maskImage: `url("${rrImg(company?.logo_url) || DEFAULT_RR_LOGO_URL}")`,
                                  WebkitMaskSize: "contain",
                                  maskSize: "contain",
                                  WebkitMaskRepeat: "no-repeat",
                                  maskRepeat: "no-repeat",
                                  WebkitMaskPosition: "center",
                                  maskPosition: "center",
                                }}
                              />
                            )}
                          </div>

                          <div className="flex-1 min-w-0">
                            <input
                              type="text"
                              placeholder="URL логотипа или загрузите файл"
                              value={rrImg(company?.logo_url) || DEFAULT_RR_LOGO_URL}
                              onChange={(e) => {
                                if (company) {
                                  company.logo_url = e.target.value;
                                  if (onSaved) onSaved({ ...company, logo_url: e.target.value });
                                }
                              }}
                              className="w-full bg-transparent border border-white/20 rounded-xl px-3 py-1.5 text-white text-xs font-mono mb-1.5"
                            />
                            <input
                              ref={logoFileInputRef}
                              type="file"
                              accept="image/*"
                              onChange={handleUploadLogo}
                              className="hidden"
                            />
                            <button
                              type="button"
                              disabled={isUploadingFile}
                              onClick={() => logoFileInputRef.current?.click()}
                              className="px-3 py-1 rounded-lg bg-[#E7C768]/15 hover:bg-[#E7C768]/25 border border-[#E7C768]/50 text-[#E7C768] text-[11px] font-bold flex items-center gap-1.5 transition"
                            >
                              <Upload className="w-3 h-3" />
                              <span>{isUploadingFile ? "Загрузка..." : "Загрузить логотип"}</span>
                            </button>
                          </div>
                        </div>

                        {/* Logo Color Filter & Logo Background */}
                        <div className="pt-2 border-t border-white/10 space-y-3">
                          <ColorPickerField
                            label="Цвет фильтра логотипа"
                            value={theme.logoFilterColor || "#E7C768"}
                            onChange={(v) => setTheme((p) => ({ ...p, logoFilterColor: v }))}
                            opacity={theme.logoFilterOpacity ?? 0}
                            onOpacityChange={(op) => setTheme((p) => ({ ...p, logoFilterOpacity: op }))}
                          />

                          <ColorPickerField
                            label="Фон подложки логотипа (0% = прозрачно)"
                            value={theme.logoBgColor || "#FFFFFF"}
                            onChange={(v) => setTheme((p) => ({ ...p, logoBgColor: v }))}
                            opacity={theme.logoBgOpacity ?? 0}
                            onOpacityChange={(op) => setTheme((p) => ({ ...p, logoBgOpacity: op }))}
                          />
                        </div>
                      </div>

                      <div className="p-3.5 rounded-2xl bg-white/5 border border-white/15 space-y-3">
                        <ColorPickerField
                          label="Цвет общего фона страницы"
                          value={theme.pageBgColor || "#17344F"}
                          onChange={(v) => setTheme((p) => ({ ...p, pageBgColor: v }))}
                          opacity={theme.pageBgOpacity ?? 100}
                          onOpacityChange={(op) => setTheme((p) => ({ ...p, pageBgOpacity: op }))}
                        />

                        <ColorPickerField
                          label="Цвет фильтра общего фона (оттенок поверх)"
                          value={theme.pageBgFilterColor || "#17344F"}
                          onChange={(v) => setTheme((p) => ({ ...p, pageBgFilterColor: v }))}
                          opacity={theme.pageBgFilterOpacity ?? 0}
                          onOpacityChange={(op) => setTheme((p) => ({ ...p, pageBgFilterOpacity: op }))}
                        />
                      </div>

                      {/* 1. Page Background Media (Desktop 16:9 & Mobile 9:16, Image/Video) */}
                      <div className="space-y-3 pt-3 border-t border-white/10">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Layers className="w-4 h-4 text-[#E7C768]" />
                            <label className="text-xs font-bold text-white">
                              Фон всей страницы (Лендинг)
                            </label>
                          </div>
                          {(theme.pageBgMediaUrl || theme.pageBgImageUrl || theme.pageBgMobileMediaUrl) && (
                            <button
                              onClick={() =>
                                setTheme((p) => ({
                                  ...p,
                                  pageBgMediaUrl: "",
                                  pageBgImageUrl: "",
                                  pageBgMobileMediaUrl: "",
                                }))
                              }
                              className="text-[11px] text-slate-300 hover:text-white transition"
                            >
                              Очистить всё
                            </button>
                          )}
                        </div>

                        {/* Desktop (16:9) slot */}
                        <div className="p-3 rounded-2xl bg-white/5 border border-white/15 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                              <Monitor className="w-3.5 h-3.5 text-[#E7C768]" />
                              Десктоп (16:9) — фото или видео
                            </span>
                            {(theme.pageBgMediaUrl || theme.pageBgImageUrl) && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full border border-white/20 bg-white/10 text-white font-medium flex items-center gap-1">
                                {isVideoUrl(theme.pageBgMediaUrl || theme.pageBgImageUrl) ? (
                                  <>
                                    <Film className="w-2.5 h-2.5 text-[#E7C768]" />
                                    Видео
                                  </>
                                ) : (
                                  <>
                                    <ImageIcon className="w-2.5 h-2.5 text-[#E7C768]" />
                                    Фото
                                  </>
                                )}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              placeholder="URL фото / видео или загрузите файл"
                              value={theme.pageBgMediaUrl || theme.pageBgImageUrl || ""}
                              onChange={(e) =>
                                setTheme((p) => ({
                                  ...p,
                                  pageBgMediaUrl: e.target.value,
                                  pageBgImageUrl: e.target.value,
                                }))
                              }
                              className="flex-1 bg-transparent border border-white/20 rounded-xl px-3 py-2 text-white text-xs font-mono"
                            />
                            <input
                              ref={pageBgDesktopFileInputRef}
                              type="file"
                              accept="image/*,video/*"
                              onChange={(e) => handleUploadMedia(e, "pageBgMediaUrl")}
                              className="hidden"
                            />
                            <button
                              type="button"
                              disabled={isUploadingFile}
                              onClick={() => pageBgDesktopFileInputRef.current?.click()}
                              className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-xs font-semibold flex items-center gap-1.5 shrink-0 text-white transition"
                              title="Загрузка фото или видео (макс. 10 МБ для видео)"
                            >
                              <Upload className="w-3.5 h-3.5 text-[#E7C768]" />
                              <span>{isUploadingFile ? "..." : "Загрузить"}</span>
                            </button>
                          </div>

                          {/* Desktop Media Preview */}
                          {(theme.pageBgMediaUrl || theme.pageBgImageUrl) && (
                            <div className="relative rounded-xl overflow-hidden border border-white/15 bg-black/40 aspect-video max-h-28 flex items-center justify-center">
                              {isVideoUrl(theme.pageBgMediaUrl || theme.pageBgImageUrl) ? (
                                <video
                                  src={theme.pageBgMediaUrl || theme.pageBgImageUrl}
                                  autoPlay
                                  muted
                                  loop
                                  playsInline
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <img
                                  src={theme.pageBgMediaUrl || theme.pageBgImageUrl}
                                  alt="Page Desktop Preview"
                                  className="w-full h-full object-cover"
                                  referrerPolicy="no-referrer"
                                />
                              )}
                              <button
                                type="button"
                                onClick={() =>
                                  setTheme((p) => ({
                                    ...p,
                                    pageBgMediaUrl: "",
                                    pageBgImageUrl: "",
                                  }))
                                }
                                className="absolute top-1.5 right-1.5 p-1 rounded-lg bg-black/60 hover:bg-black/80 text-white border border-white/20 transition"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Mobile (9:16) slot */}
                        <div className="p-3 rounded-2xl bg-white/5 border border-white/15 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                              <Smartphone className="w-3.5 h-3.5 text-[#E7C768]" />
                              Мобильная версия (9:16)
                            </span>
                            {theme.pageBgMobileMediaUrl ? (
                              <span className="text-[10px] px-2 py-0.5 rounded-full border border-white/20 bg-white/10 text-white font-medium flex items-center gap-1">
                                {isVideoUrl(theme.pageBgMobileMediaUrl) ? (
                                  <>
                                    <Film className="w-2.5 h-2.5 text-[#E7C768]" />
                                    Видео
                                  </>
                                ) : (
                                  <>
                                    <ImageIcon className="w-2.5 h-2.5 text-[#E7C768]" />
                                    Фото
                                  </>
                                )}
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-300">
                                По умолчанию: 16:9
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              placeholder="URL фото / видео (9:16) или загрузите"
                              value={theme.pageBgMobileMediaUrl || ""}
                              onChange={(e) =>
                                setTheme((p) => ({ ...p, pageBgMobileMediaUrl: e.target.value }))
                              }
                              className="flex-1 bg-transparent border border-white/20 rounded-xl px-3 py-2 text-white text-xs font-mono"
                            />
                            <input
                              ref={pageBgMobileFileInputRef}
                              type="file"
                              accept="image/*,video/*"
                              onChange={(e) => handleUploadMedia(e, "pageBgMobileMediaUrl")}
                              className="hidden"
                            />
                            <button
                              type="button"
                              disabled={isUploadingFile}
                              onClick={() => pageBgMobileFileInputRef.current?.click()}
                              className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-xs font-semibold flex items-center gap-1.5 shrink-0 text-white transition"
                              title="Загрузка мобильного фото или видео"
                            >
                              <Upload className="w-3.5 h-3.5 text-[#E7C768]" />
                              <span>{isUploadingFile ? "..." : "Загрузить"}</span>
                            </button>
                          </div>

                          {/* Mobile Media Preview */}
                          {theme.pageBgMobileMediaUrl && (
                            <div className="relative rounded-xl overflow-hidden border border-white/15 bg-black/40 w-24 aspect-[9/16] max-h-36 mx-auto flex items-center justify-center">
                              {isVideoUrl(theme.pageBgMobileMediaUrl) ? (
                                <video
                                  src={theme.pageBgMobileMediaUrl}
                                  autoPlay
                                  muted
                                  loop
                                  playsInline
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <img
                                  src={theme.pageBgMobileMediaUrl}
                                  alt="Page Mobile Preview"
                                  className="w-full h-full object-cover"
                                  referrerPolicy="no-referrer"
                                />
                              )}
                              <button
                                type="button"
                                onClick={() => setTheme((p) => ({ ...p, pageBgMobileMediaUrl: "" }))}
                                className="absolute top-1.5 right-1.5 p-1 rounded-lg bg-black/60 hover:bg-black/80 text-white border border-white/20 transition"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Page Video Settings (If desktop or mobile media is video) */}
                        {(isVideoUrl(theme.pageBgMediaUrl || theme.pageBgImageUrl) ||
                          isVideoUrl(theme.pageBgMobileMediaUrl)) && (
                          <div className="p-3 rounded-2xl bg-white/5 border border-white/15 space-y-2.5 backdrop-blur-md">
                            <div className="text-xs font-bold text-[#E7C768] flex items-center gap-1.5">
                              <Film className="w-3.5 h-3.5" />
                              Настройки видео фона лендинга
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <label className="flex items-center justify-between p-2 rounded-xl bg-white/5 border border-white/10 cursor-pointer">
                                <span className="text-xs text-slate-200">Автовоспроизведение</span>
                                <input
                                  type="checkbox"
                                  checked={theme.pageBgVideoAutoplay !== false}
                                  onChange={(e) =>
                                    setTheme((p) => ({ ...p, pageBgVideoAutoplay: e.target.checked }))
                                  }
                                  className="w-4 h-4 rounded accent-[#E7C768] bg-transparent border-white/20"
                                />
                              </label>
                              <label className="flex items-center justify-between p-2 rounded-xl bg-white/5 border border-white/10 cursor-pointer">
                                <span className="text-xs text-slate-200">Зацикливание</span>
                                <input
                                  type="checkbox"
                                  checked={theme.pageBgVideoLoop !== false}
                                  onChange={(e) =>
                                    setTheme((p) => ({ ...p, pageBgVideoLoop: e.target.checked }))
                                  }
                                  className="w-4 h-4 rounded accent-[#E7C768] bg-transparent border-white/20"
                                />
                              </label>
                            </div>
                          </div>
                        )}

                        {/* Page Background Display Mode */}
                        <div className="space-y-1.5">
                          <label className="text-xs font-semibold text-slate-300 block">
                            Режим отображения фона страницы
                          </label>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                            {[
                              { id: "fixed", label: "Фиксированный" },
                              { id: "cover", label: "Заполнение" },
                              { id: "tile", label: "Мозаика" },
                              { id: "none", label: "Отключить" },
                            ].map((mode) => (
                              <button
                                key={mode.id}
                                type="button"
                                onClick={() =>
                                  setTheme((p) => ({ ...p, pageBgDisplayMode: mode.id as any }))
                                }
                                className={`py-1.5 px-2 rounded-xl border text-xs font-semibold transition ${
                                  (theme.pageBgDisplayMode || "fixed") === mode.id
                                    ? "border-[#E7C768] bg-[#E7C768]/15 text-[#E7C768]"
                                    : "border-white/15 bg-white/5 text-slate-300 hover:border-white/30"
                                }`}
                              >
                                {mode.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* 2. Hero Section Background Media (Desktop 16:9 & Mobile 9:16, Image/Video) */}
                      <div className="space-y-3 pt-3 border-t border-white/10">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Sparkles className="w-4 h-4 text-[#E7C768]" />
                            <label className="text-xs font-bold text-white">
                              Фон Hero-секции (Первый экран)
                            </label>
                          </div>
                          {(theme.heroBgMediaUrl || theme.heroBgImageUrl || theme.heroBgMobileMediaUrl) && (
                            <button
                              onClick={() =>
                                setTheme((p) => ({
                                  ...p,
                                  heroBgMediaUrl: "",
                                  heroBgImageUrl: "",
                                  heroBgMobileMediaUrl: "",
                                }))
                              }
                              className="text-[11px] text-slate-300 hover:text-white transition"
                            >
                              Очистить всё
                            </button>
                          )}
                        </div>

                        {/* Hero Background Filter */}
                        <div className="pt-2">
                          <ColorPickerField
                            label="Цвет фильтра первого экрана (Hero)"
                            value={theme.heroBgFilterColor || "#17344F"}
                            onChange={(v) => setTheme((p) => ({ ...p, heroBgFilterColor: v }))}
                            opacity={theme.heroBgFilterOpacity ?? 0}
                            onOpacityChange={(op) => setTheme((p) => ({ ...p, heroBgFilterOpacity: op }))}
                          />
                        </div>

                        {/* Hero Desktop (16:9) slot */}
                        <div className="p-3 rounded-2xl bg-white/5 border border-white/15 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                              <Monitor className="w-3.5 h-3.5 text-[#E7C768]" />
                              Десктоп (16:9) — фото или видео
                            </span>
                            {(theme.heroBgMediaUrl || theme.heroBgImageUrl) && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full border border-white/20 bg-white/10 text-white font-medium flex items-center gap-1">
                                {isVideoUrl(theme.heroBgMediaUrl || theme.heroBgImageUrl) ? (
                                  <>
                                    <Film className="w-2.5 h-2.5 text-[#E7C768]" />
                                    Видео
                                  </>
                                ) : (
                                  <>
                                    <ImageIcon className="w-2.5 h-2.5 text-[#E7C768]" />
                                    Фото
                                  </>
                                )}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              placeholder="URL фото / видео или загрузите файл"
                              value={theme.heroBgMediaUrl || theme.heroBgImageUrl || ""}
                              onChange={(e) =>
                                setTheme((p) => ({
                                  ...p,
                                  heroBgMediaUrl: e.target.value,
                                  heroBgImageUrl: e.target.value,
                                }))
                              }
                              className="flex-1 bg-transparent border border-white/20 rounded-xl px-3 py-2 text-white text-xs font-mono"
                            />
                            <input
                              ref={heroDesktopFileInputRef}
                              type="file"
                              accept="image/*,video/*"
                              onChange={(e) => handleUploadMedia(e, "heroBgMediaUrl")}
                              className="hidden"
                            />
                            <button
                              type="button"
                              disabled={isUploadingFile}
                              onClick={() => heroDesktopFileInputRef.current?.click()}
                              className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-xs font-semibold flex items-center gap-1.5 shrink-0 text-white transition"
                              title="Загрузка фото или видео (макс. 10 МБ для видео)"
                            >
                              <Upload className="w-3.5 h-3.5 text-[#E7C768]" />
                              <span>{isUploadingFile ? "..." : "Загрузить"}</span>
                            </button>
                          </div>

                          {/* Hero Desktop Media Preview */}
                          {(theme.heroBgMediaUrl || theme.heroBgImageUrl) && (
                            <div className="relative rounded-xl overflow-hidden border border-white/15 bg-black/40 aspect-video max-h-28 flex items-center justify-center">
                              {isVideoUrl(theme.heroBgMediaUrl || theme.heroBgImageUrl) ? (
                                <video
                                  src={theme.heroBgMediaUrl || theme.heroBgImageUrl}
                                  autoPlay
                                  muted
                                  loop
                                  playsInline
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <img
                                  src={theme.heroBgMediaUrl || theme.heroBgImageUrl}
                                  alt="Hero Desktop Preview"
                                  className="w-full h-full object-cover"
                                  referrerPolicy="no-referrer"
                                />
                              )}
                              <button
                                type="button"
                                onClick={() =>
                                  setTheme((p) => ({
                                    ...p,
                                    heroBgMediaUrl: "",
                                    heroBgImageUrl: "",
                                  }))
                                }
                                className="absolute top-1.5 right-1.5 p-1 rounded-lg bg-black/60 hover:bg-black/80 text-white border border-white/20 transition"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Hero Mobile (9:16) slot */}
                        <div className="p-3 rounded-2xl bg-white/5 border border-white/15 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                              <Smartphone className="w-3.5 h-3.5 text-[#E7C768]" />
                              Мобильная версия (9:16)
                            </span>
                            {theme.heroBgMobileMediaUrl ? (
                              <span className="text-[10px] px-2 py-0.5 rounded-full border border-white/20 bg-white/10 text-white font-medium flex items-center gap-1">
                                {isVideoUrl(theme.heroBgMobileMediaUrl) ? (
                                  <>
                                    <Film className="w-2.5 h-2.5 text-[#E7C768]" />
                                    Видео
                                  </>
                                ) : (
                                  <>
                                    <ImageIcon className="w-2.5 h-2.5 text-[#E7C768]" />
                                    Фото
                                  </>
                                )}
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-300">
                                По умолчанию: 16:9
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              placeholder="URL фото / видео (9:16) или загрузите"
                              value={theme.heroBgMobileMediaUrl || ""}
                              onChange={(e) =>
                                setTheme((p) => ({ ...p, heroBgMobileMediaUrl: e.target.value }))
                              }
                              className="flex-1 bg-transparent border border-white/20 rounded-xl px-3 py-2 text-white text-xs font-mono"
                            />
                            <input
                              ref={heroMobileFileInputRef}
                              type="file"
                              accept="image/*,video/*"
                              onChange={(e) => handleUploadMedia(e, "heroBgMobileMediaUrl")}
                              className="hidden"
                            />
                            <button
                              type="button"
                              disabled={isUploadingFile}
                              onClick={() => heroMobileFileInputRef.current?.click()}
                              className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-xs font-semibold flex items-center gap-1.5 shrink-0 text-white transition"
                              title="Загрузка мобильного фото или видео"
                            >
                              <Upload className="w-3.5 h-3.5 text-[#E7C768]" />
                              <span>{isUploadingFile ? "..." : "Загрузить"}</span>
                            </button>
                          </div>

                          {/* Hero Mobile Media Preview */}
                          {theme.heroBgMobileMediaUrl && (
                            <div className="relative rounded-xl overflow-hidden border border-white/15 bg-black/40 w-24 aspect-[9/16] max-h-36 mx-auto flex items-center justify-center">
                              {isVideoUrl(theme.heroBgMobileMediaUrl) ? (
                                <video
                                  src={theme.heroBgMobileMediaUrl}
                                  autoPlay
                                  muted
                                  loop
                                  playsInline
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <img
                                  src={theme.heroBgMobileMediaUrl}
                                  alt="Hero Mobile Preview"
                                  className="w-full h-full object-cover"
                                  referrerPolicy="no-referrer"
                                />
                              )}
                              <button
                                type="button"
                                onClick={() => setTheme((p) => ({ ...p, heroBgMobileMediaUrl: "" }))}
                                className="absolute top-1.5 right-1.5 p-1 rounded-lg bg-black/60 hover:bg-black/80 text-white border border-white/20 transition"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Hero Video Settings (If desktop or mobile media is video) */}
                        {(isVideoUrl(theme.heroBgMediaUrl || theme.heroBgImageUrl) ||
                          isVideoUrl(theme.heroBgMobileMediaUrl)) && (
                          <div className="p-3 rounded-2xl bg-white/5 border border-white/15 space-y-2.5 backdrop-blur-md">
                            <div className="text-xs font-bold text-[#E7C768] flex items-center gap-1.5">
                              <Film className="w-3.5 h-3.5" />
                              Настройки видео Hero-секции
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <label className="flex items-center justify-between p-2 rounded-xl bg-white/5 border border-white/10 cursor-pointer">
                                <span className="text-xs text-slate-200">Автовоспроизведение</span>
                                <input
                                  type="checkbox"
                                  checked={theme.heroBgVideoAutoplay !== false}
                                  onChange={(e) =>
                                    setTheme((p) => ({ ...p, heroBgVideoAutoplay: e.target.checked }))
                                  }
                                  className="w-4 h-4 rounded accent-[#E7C768] bg-transparent border-white/20"
                                />
                              </label>
                              <label className="flex items-center justify-between p-2 rounded-xl bg-white/5 border border-white/10 cursor-pointer">
                                <span className="text-xs text-slate-200">Зацикливание</span>
                                <input
                                  type="checkbox"
                                  checked={theme.heroBgVideoLoop !== false}
                                  onChange={(e) =>
                                    setTheme((p) => ({ ...p, heroBgVideoLoop: e.target.checked }))
                                  }
                                  className="w-4 h-4 rounded accent-[#E7C768] bg-transparent border-white/20"
                                />
                              </label>
                            </div>
                          </div>
                        )}

                        {/* Hero Display Mode */}
                        <div className="space-y-1.5">
                          <label className="text-sm font-semibold text-slate-200 block">
                            Режим отображения фона Hero-секции
                          </label>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                            {[
                              { id: "cover", label: "Заполнение" },
                              { id: "fixed", label: "Фиксированный" },
                              { id: "tile", label: "Мозаика" },
                              { id: "none", label: "Отключить" },
                            ].map((mode) => (
                              <button
                                key={mode.id}
                                type="button"
                                onClick={() =>
                                  setTheme((p) => ({ ...p, heroBgDisplayMode: mode.id as any }))
                                }
                                className={`py-2 px-2 rounded-xl border text-sm font-semibold transition cursor-pointer ${
                                  (theme.heroBgDisplayMode || "cover") === mode.id
                                    ? "border-[#E7C768] bg-transparent text-[#E7C768]"
                                    : "border-white/20 bg-transparent text-slate-200 hover:border-white/40"
                                }`}
                              >
                                {mode.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Background Animations */}
                      <div className="space-y-3 pt-2 border-t border-white/10">
                        <label className="text-xs font-bold text-slate-200 block">
                          Фоновые анимации лендинга
                        </label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <label className={`p-3 rounded-2xl border flex items-center gap-3 cursor-pointer transition ${theme.showSphereAnimation ? "border-[#E7C768] bg-[#E7C768]/10 text-white" : "border-white/15 bg-white/5 text-slate-300 hover:border-white/30"}`}>
                            <input
                              type="checkbox"
                              checked={Boolean(theme.showSphereAnimation)}
                              onChange={(e) => setTheme((p) => ({ ...p, showSphereAnimation: e.target.checked }))}
                              className="w-4 h-4 rounded accent-[#E7C768] bg-transparent border-white/20"
                            />
                            <div className="text-left">
                              <span className="text-xs font-bold block">3D Нейросфера</span>
                              <span className="text-[11px] text-slate-400 block">Интерактивный шар</span>
                            </div>
                          </label>

                          <label className={`p-3 rounded-2xl border flex items-center gap-3 cursor-pointer transition ${theme.showWaveAnimation !== false ? "border-[#E7C768] bg-[#E7C768]/10 text-white" : "border-white/15 bg-white/5 text-slate-300 hover:border-white/30"}`}>
                            <input
                              type="checkbox"
                              checked={theme.showWaveAnimation !== false}
                              onChange={(e) => setTheme((p) => ({ ...p, showWaveAnimation: e.target.checked }))}
                              className="w-4 h-4 rounded accent-[#E7C768] bg-transparent border-white/20"
                            />
                            <div className="text-left">
                              <span className="text-xs font-bold block">Волны фона</span>
                              <span className="text-[11px] text-slate-400 block">Неоновые волны</span>
                            </div>
                          </label>
                        </div>
                      </div>

                      {/* Site Display Mode & Preview Height */}
                      <div className="space-y-3 pt-2 border-t border-white/10">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-bold text-slate-200">
                            Формат отображения сайтов компании
                          </label>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setTheme((p) => ({ ...p, siteDisplayMode: "preview" }))}
                            className={`p-2.5 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-2 ${
                              theme.siteDisplayMode !== "buttons"
                                ? "border-[#E7C768] bg-[#E7C768]/15 text-[#E7C768]"
                                : "border-white/15 bg-white/5 text-slate-300"
                            }`}
                          >
                            <ImageIcon className="w-3.5 h-3.5" />
                            <span>Превью карточки</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setTheme((p) => ({ ...p, siteDisplayMode: "buttons" }))}
                            className={`p-2.5 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-2 ${
                              theme.siteDisplayMode === "buttons"
                                ? "border-[#E7C768] bg-[#E7C768]/15 text-[#E7C768]"
                                : "border-white/15 bg-white/5 text-slate-300"
                            }`}
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            <span>Только кнопки</span>
                          </button>
                        </div>

                        {theme.siteDisplayMode !== "buttons" && (
                          <div className="space-y-2 pt-1">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold text-slate-300">
                                Высота карточки предпросмотра (0-720px):
                              </span>
                              <span className="font-mono text-xs text-[#E7C768]">
                                {theme.sitePreviewHeight === 0
                                  ? "0px (Скрыто)"
                                  : theme.sitePreviewHeight
                                  ? `${theme.sitePreviewHeight}px`
                                  : "Авто"}
                              </span>
                            </div>

                            <input
                              type="range"
                              min="0"
                              max="720"
                              step="10"
                              value={theme.sitePreviewHeight ?? 180}
                              onChange={(e) => {
                                const val = parseInt(e.target.value, 10);
                                setTheme((p) => ({ ...p, sitePreviewHeight: val }));
                              }}
                              style={{ accentColor: theme.iconColor || "#E7C768" }}
                              className="w-full cursor-pointer"
                            />

                            <div className="grid grid-cols-4 sm:grid-cols-7 gap-1">
                              {[
                                { val: 0, label: "0px" },
                                { val: undefined, label: "Авто" },
                                { val: 160, label: "160" },
                                { val: 240, label: "240" },
                                { val: 360, label: "360" },
                                { val: 540, label: "540" },
                                { val: 720, label: "720" },
                              ].map((opt) => (
                                <button
                                  key={String(opt.val)}
                                  type="button"
                                  onClick={() => setTheme((p) => ({ ...p, sitePreviewHeight: opt.val }))}
                                  className={`py-1 px-1.5 rounded-lg border text-center text-[11px] font-semibold transition ${
                                    theme.sitePreviewHeight === opt.val
                                      ? "border-[#E7C768] text-[#E7C768] bg-white/10"
                                      : "border-white/10 text-slate-300"
                                  }`}
                                >
                                  {opt.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Filters for Site Preview & Screenshots */}
                        <div className="pt-3 border-t border-white/10 space-y-3">
                          <ColorPickerField
                            label="Цвет фильтра предпоказа сайта (веб-превью)"
                            value={theme.sitePreviewFilterColor || "#17344F"}
                            onChange={(v) => setTheme((p) => ({ ...p, sitePreviewFilterColor: v }))}
                            opacity={theme.sitePreviewFilterOpacity ?? 0}
                            onOpacityChange={(op) => setTheme((p) => ({ ...p, sitePreviewFilterOpacity: op }))}
                          />

                          <ColorPickerField
                            label="Цвет фильтра скриншота сайта"
                            value={theme.siteScreenshotFilterColor || "#17344F"}
                            onChange={(v) => setTheme((p) => ({ ...p, siteScreenshotFilterColor: v }))}
                            opacity={theme.siteScreenshotFilterOpacity ?? 0}
                            onOpacityChange={(op) => setTheme((p) => ({ ...p, siteScreenshotFilterOpacity: op }))}
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 3. CONTAINERS & GLASS */}
                  {activeTab === "containers" && (
                    <div className="space-y-4">
                      <ColorPickerField
                        label="Цвет фона контейнеров"
                        value={theme.containerBgColor || "#17344F"}
                        onChange={(v) => setTheme((p) => ({ ...p, containerBgColor: v }))}
                        opacity={theme.containerBgOpacity ?? 0}
                        onOpacityChange={(op) => setTheme((p) => ({ ...p, containerBgOpacity: op }))}
                      />

                      <div className="space-y-1.5 pt-1">
                        <div className="flex items-center justify-between text-xs font-semibold text-slate-200">
                          <span>Размытие Liquid Glass (0 - 40px)</span>
                          <span className="font-mono text-[#E7C768] font-bold">{theme.glassBlurPx ?? 24}px</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="40"
                          step="1"
                          value={theme.glassBlurPx ?? 24}
                          onChange={(e) => setTheme((p) => ({ ...p, glassBlurPx: parseInt(e.target.value, 10) }))}
                          style={{ accentColor: theme.iconColor || "#E7C768" }}
                          className="w-full cursor-pointer"
                        />
                        <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                          <span>0px (Без блюра)</span>
                          <span>20px (Мягкое)</span>
                          <span>40px (Глубокое)</span>
                        </div>
                      </div>

                      <ColorPickerField
                        label="Цвет бордюра контейнеров"
                        value={theme.containerBorderColor || "#FFFFFF"}
                        onChange={(v) => setTheme((p) => ({ ...p, containerBorderColor: v }))}
                        opacity={theme.containerBorderOpacity ?? 20}
                        onOpacityChange={(op) => setTheme((p) => ({ ...p, containerBorderOpacity: op }))}
                      />

                      <div className="grid grid-cols-2 gap-3 pt-1 border-t border-white/10">
                        <div>
                          <span className="text-xs font-bold text-slate-200 block mb-1">Толщина бордюра</span>
                          <div className="flex gap-1">
                            {[0, 1, 2, 3, 4].map((w) => (
                              <button
                                key={w}
                                type="button"
                                onClick={() => setTheme((p) => ({ ...p, containerBorderWidth: w }))}
                                className={`flex-1 py-1 rounded-lg border text-center text-xs font-semibold transition ${
                                  (theme.containerBorderWidth ?? 1) === w
                                    ? "border-[#E7C768] text-[#E7C768] bg-white/10"
                                    : "border-white/10 text-slate-300"
                                  }`}
                              >
                                {w}px
                              </button>
                            ))}
                          </div>
                        </div>

                        <div>
                          <span className="text-xs font-bold text-slate-200 block mb-1">Скругление углов (от 0px)</span>
                          <div className="flex gap-1">
                            {[0, 8, 14, 20, 28, 36].map((r) => (
                              <button
                                key={r}
                                type="button"
                                onClick={() => setTheme((p) => ({ ...p, containerBorderRadius: r }))}
                                className={`flex-1 py-1 rounded-lg border text-center text-[11px] font-semibold transition ${
                                  (theme.containerBorderRadius ?? 24) === r
                                    ? "border-[#E7C768] text-[#E7C768] bg-white/10"
                                    : "border-white/10 text-slate-300"
                                  }`}
                              >
                                {r}px
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 4. HEADER & BUTTONS */}
                  {activeTab === "headerButtons" && (
                    <div className="space-y-4">
                      <span className="block text-xs font-bold text-[#E7C768] uppercase tracking-wider">
                        Настройки шапки (Header)
                      </span>
                      <ColorPickerField
                        label="Цвет фона шапки"
                        value={theme.headerBgColor || "#17344F"}
                        onChange={(v) => setTheme((p) => ({ ...p, headerBgColor: v }))}
                        opacity={theme.headerBgOpacity ?? 0}
                        onOpacityChange={(op) => setTheme((p) => ({ ...p, headerBgOpacity: op }))}
                      />
                      <ColorPickerField
                        label="Цвет фильтра шапки (Header)"
                        value={theme.headerBgFilterColor || "#17344F"}
                        onChange={(v) => setTheme((p) => ({ ...p, headerBgFilterColor: v }))}
                        opacity={theme.headerBgFilterOpacity ?? 0}
                        onOpacityChange={(op) => setTheme((p) => ({ ...p, headerBgFilterOpacity: op }))}
                      />
                      <ColorPickerField
                        label="Цвет бордюра шапки"
                        value={theme.headerBorderColor || "#FFFFFF"}
                        onChange={(v) => setTheme((p) => ({ ...p, headerBorderColor: v }))}
                        opacity={theme.headerBorderOpacity ?? 20}
                        onOpacityChange={(op) => setTheme((p) => ({ ...p, headerBorderOpacity: op }))}
                      />

                      <div className="grid grid-cols-2 gap-3 pt-1">
                        <div>
                          <span className="text-xs font-bold text-slate-200 block mb-1">Толщина бордюра шапки</span>
                          <div className="flex gap-1">
                            {[0, 1, 2, 3].map((w) => (
                              <button
                                key={w}
                                type="button"
                                onClick={() => setTheme((p) => ({ ...p, headerBorderWidth: w }))}
                                className={`flex-1 py-1 rounded-lg border text-center text-xs font-semibold transition ${
                                  (theme.headerBorderWidth ?? 1) === w
                                    ? "border-[#E7C768] text-[#E7C768] bg-white/10"
                                    : "border-white/10 text-slate-300"
                                }`}
                              >
                                {w}px
                              </button>
                            ))}
                          </div>
                        </div>

                        <div>
                          <span className="text-xs font-bold text-slate-200 block mb-1">Скругление шапки (от 0px)</span>
                          <div className="flex gap-1">
                            {[0, 8, 14, 20, 28].map((r) => (
                              <button
                                key={r}
                                type="button"
                                onClick={() => setTheme((p) => ({ ...p, headerBorderRadius: r }))}
                                className={`flex-1 py-1 rounded-lg border text-center text-[11px] font-semibold transition ${
                                  (theme.headerBorderRadius ?? 0) === r
                                    ? "border-[#E7C768] text-[#E7C768] bg-white/10"
                                    : "border-white/10 text-slate-300"
                                }`}
                              >
                                {r}px
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      <span className="block text-xs font-bold text-[#E7C768] uppercase tracking-wider pt-2 border-t border-white/10">
                        Настройки кнопок и табов
                      </span>
                      <ColorPickerField
                        label="Активная кнопка: фон"
                        value={theme.btnActiveBgColor || "#E7C768"}
                        onChange={(v) => setTheme((p) => ({ ...p, btnActiveBgColor: v }))}
                        opacity={theme.btnActiveOpacity ?? 100}
                        onOpacityChange={(op) => setTheme((p) => ({ ...p, btnActiveOpacity: op }))}
                      />
                      <ColorPickerField
                        label="Активная кнопка: цвет текста"
                        value={theme.btnActiveTextColor || "#17344F"}
                        onChange={(v) => setTheme((p) => ({ ...p, btnActiveTextColor: v }))}
                      />

                      <ColorPickerField
                        label="Неактивная кнопка: фон"
                        value={theme.btnInactiveBgColor || "#000000"}
                        onChange={(v) => setTheme((p) => ({ ...p, btnInactiveBgColor: v }))}
                        opacity={theme.btnInactiveOpacity ?? 25}
                        onOpacityChange={(op) => setTheme((p) => ({ ...p, btnInactiveOpacity: op }))}
                      />
                      <ColorPickerField
                        label="Неактивная кнопка: цвет текста"
                        value={theme.btnInactiveTextColor || "#CBD5E1"}
                        onChange={(v) => setTheme((p) => ({ ...p, btnInactiveTextColor: v }))}
                      />

                      <ColorPickerField
                        label="Цвет бордюра кнопок"
                        value={theme.btnBorderColor || "#FFFFFF"}
                        onChange={(v) => setTheme((p) => ({ ...p, btnBorderColor: v }))}
                        opacity={theme.btnBorderOpacity ?? 20}
                        onOpacityChange={(op) => setTheme((p) => ({ ...p, btnBorderOpacity: op }))}
                      />

                      <div className="grid grid-cols-2 gap-3 pt-1">
                        <div>
                          <span className="text-xs font-bold text-slate-200 block mb-1">Толщина бордюра кнопок</span>
                          <div className="flex gap-1">
                            {[0, 1, 2].map((w) => (
                              <button
                                key={w}
                                type="button"
                                onClick={() => setTheme((p) => ({ ...p, btnBorderWidth: w }))}
                                className={`flex-1 py-1 rounded-lg border text-center text-xs font-semibold transition ${
                                  (theme.btnBorderWidth ?? 1) === w
                                    ? "border-[#E7C768] text-[#E7C768] bg-white/10"
                                    : "border-white/10 text-slate-300"
                                }`}
                              >
                                {w}px
                              </button>
                            ))}
                          </div>
                        </div>

                        <div>
                          <span className="text-xs font-bold text-slate-200 block mb-1">Скругление кнопок (от 0px)</span>
                          <div className="flex gap-1">
                            {[0, 8, 14, 18, 24, 999].map((r) => (
                              <button
                                key={r}
                                type="button"
                                onClick={() => setTheme((p) => ({ ...p, btnBorderRadius: r }))}
                                className={`flex-1 py-1 rounded-lg border text-center text-[10px] font-semibold transition ${
                                  (theme.btnBorderRadius ?? 16) === r
                                    ? "border-[#E7C768] text-[#E7C768] bg-white/10"
                                    : "border-white/10 text-slate-300"
                                }`}
                              >
                                {r === 999 ? "Pill" : `${r}px`}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 5. CSS CODE & PREFILLED TEMPLATE */}
                  {activeTab === "css" && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-slate-200">
                          Пользовательские CSS правила
                        </label>
                        <span className="text-[11px] text-slate-400">Живое применение</span>
                      </div>
                      <textarea
                        rows={10}
                        value={theme.customCss || ""}
                        onChange={(e) => setTheme((p) => ({ ...p, customCss: e.target.value }))}
                        placeholder="/* Напишите любые дополнительные CSS правила */&#10;.section-card { transform: translateZ(0); }&#10;h1 { letter-spacing: -0.01em; }"
                        className="w-full bg-[#17344F] border border-white/20 rounded-2xl p-3 text-white font-mono text-xs focus:outline-none focus:border-[#E7C768] resize-none leading-relaxed"
                      />

                      <div className="pt-2 border-t border-white/10 space-y-1.5">
                        <span className="text-[11px] font-bold text-slate-300 block">
                          Сгенерированный scoped CSS:
                        </span>
                        <div className="max-h-36 overflow-y-auto bg-black/40 border border-white/10 rounded-xl p-2.5 text-[10px] font-mono text-slate-300 whitespace-pre-wrap select-all">
                          {generatedCssTemplate}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Footer Actions */}
                <div className="p-3 border-t border-white/15 bg-transparent backdrop-blur-md flex items-center justify-between gap-2 shrink-0">
                  <button
                    onClick={handleReset}
                    className="flex items-center gap-1 px-2.5 py-2 rounded-xl border border-white/15 hover:border-white/30 text-slate-300 hover:text-white transition text-[14px] font-semibold cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Сброс</span>
                  </button>

                  <div className="flex items-center gap-2">
                    {savedSuccess && (
                      <span className="text-[14px] text-[#E7C768] font-bold flex items-center gap-1 animate-in fade-in">
                        <Check className="w-3.5 h-3.5" />
                        Сохранено!
                      </span>
                    )}
                    <button
                      onClick={handleSave}
                      disabled={isSaving}
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-white/20 hover:border-[#E7C768] bg-[#E7C768]/15 hover:bg-[#E7C768]/25 text-white font-bold text-[14px] shadow-lg transition-all cursor-pointer"
                    >
                      <Save className="w-3.5 h-3.5 text-[#E7C768]" />
                      <span>{isSaving ? "Сохранение..." : "Сохранить в компанию"}</span>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <AcademyModal
        isOpen={isAcademyModalOpen}
        onClose={() => setIsAcademyModalOpen(false)}
        initialSlug="landing-styles"
      />
    </>
  );
}
