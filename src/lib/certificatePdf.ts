import { jsPDF } from "jspdf";
import { toPng } from "html-to-image";
import html2canvas from "html2canvas";

export interface ExportCertificatePdfOptions {
  certificateElement: HTMLElement;
  companyTheme?: any;
  candidateName?: string | null;
  roleName?: string | null;
  companyName?: string | null;
  candidatePublicId?: string | number | null;
  onProgress?: (pct: number, stageLabel?: string) => void;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  if (!hex || typeof hex !== "string") return null;
  let clean = hex.replace("#", "").trim();
  if (clean.length === 3) {
    clean = clean
      .split("")
      .map((c) => c + c)
      .join("");
  }
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return null;
  const num = parseInt(clean, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

function hexToRgbaSafe(hex: string, opacityPercent: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return `rgba(23, 52, 79, ${Math.max(0, Math.min(1, opacityPercent / 100))})`;
  const a = Math.max(0, Math.min(1, opacityPercent / 100));
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${a})`;
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("FileReader failed"));
    reader.readAsDataURL(blob);
  });
}

async function inlineImagesInTree(root: HTMLElement): Promise<void> {
  const imgs = Array.from(root.querySelectorAll("img"));
  await Promise.all(
    imgs.map(async (img) => {
      const src = img.getAttribute("src") || "";
      if (!src || src.startsWith("data:") || src.startsWith("blob:")) return;
      try {
        const res = await fetch(src, { mode: "cors", credentials: "omit" });
        if (res.ok) {
          const blob = await res.blob();
          const dataUrl = await blobToDataUrl(blob);
          if (dataUrl.startsWith("data:image/")) {
            img.setAttribute("src", dataUrl);
          }
        }
      } catch {
        // Keep original src cleanly; html-to-image will handle if CORS allows
      }
    })
  );
}

async function loadImageDimensions(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth || 1200, height: img.naturalHeight || 850 });
    img.onerror = () => reject(new Error("Failed loading captured PNG"));
    img.src = dataUrl;
  });
}

function resolvePageBackgroundColor(theme?: any): string {
  const raw = String(theme?.pageBgColor || "").trim();
  const op = theme?.pageBgOpacity !== undefined ? Number(theme.pageBgOpacity) : 100;
  if (raw && op > 0) {
    const rgb = hexToRgb(raw);
    if (rgb) return raw;
  }
  if (typeof document !== "undefined") {
    const computed = getComputedStyle(document.body).backgroundColor;
    if (computed && computed !== "rgba(0, 0, 0, 0)" && computed !== "transparent") {
      return computed;
    }
  }
  return "#17344F";
}

function buildPdfFilename(candidateName?: string | null, candidatePublicId?: string | number | null): string {
  const cleanName = String(candidateName || "Кандидат")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "")
    .replace(/\s+/g, "_")
    .slice(0, 48);
  const idPart = candidatePublicId ? `_${String(candidatePublicId).replace(/\D/g, "")}` : "";
  return `Сертификат_${cleanName || "RR"}${idPart}.pdf`;
}

export async function exportCertificateToPdf(opts: ExportCertificatePdfOptions): Promise<string> {
  const {
    certificateElement,
    companyTheme,
    candidateName,
    roleName,
    companyName,
    candidatePublicId,
    onProgress,
  } = opts;

  onProgress?.(14, "Считываем стиль и палитру страницы");
  await sleep(320);

  const pageBgHex = companyTheme?.pageBgColor && hexToRgb(companyTheme.pageBgColor)
    ? companyTheme.pageBgColor
    : "#17344F";
  const pageBgColor = resolvePageBackgroundColor(companyTheme);
  const accentColor = companyTheme?.iconColor || companyTheme?.headingsSolidColor || "#E7C768";
  const isMono = Boolean(companyTheme?.allMediaMonochrome || companyTheme?.pageBgMonochrome);
  const bgMediaUrl = String(companyTheme?.pageBgMediaUrl || companyTheme?.pageBgImageUrl || "").trim();
  const isVideoBg = /\.(mp4|webm|mov|m4v)(\?|$)/i.test(bgMediaUrl);
  const filterColor = companyTheme?.pageBgFilterColor || "#17344F";
  const filterOpacity = companyTheme?.pageBgFilterOpacity ?? 0;

  // Keep the offscreen wrapper fixed at -12000px, while the captured `host` itself sits at (0,0)
  // so SVG <foreignObject> inside html-to-image does not shift `host` out of bounds.
  const offscreenWrap = document.createElement("div");
  offscreenWrap.style.position = "fixed";
  offscreenWrap.style.left = "-12000px";
  offscreenWrap.style.top = "0";
  offscreenWrap.style.width = "820px";
  offscreenWrap.style.pointerEvents = "none";
  offscreenWrap.style.zIndex = "-1";
  offscreenWrap.setAttribute("aria-hidden", "true");

  const host = document.createElement("div");
  host.className = "company-landing-root candidate-flow-root";
  host.style.position = "relative";
  host.style.left = "0";
  host.style.top = "0";
  host.style.width = "820px";
  host.style.padding = "42px";
  host.style.boxSizing = "border-box";
  host.style.overflow = "hidden";
  host.style.backgroundColor = pageBgColor;
  host.style.backgroundImage = [
    `radial-gradient(circle at 50% 34%, ${hexToRgbaSafe(accentColor, isMono ? 6 : 15)} 0%, transparent 62%)`,
  ].join(", ");
  host.style.color = "#FFFFFF";
  host.style.fontFamily =
    companyTheme?.fontFamily || "'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

  if (bgMediaUrl && !isVideoBg) {
    const bgLayer = document.createElement("div");
    bgLayer.style.position = "absolute";
    bgLayer.style.inset = "0";
    bgLayer.style.backgroundImage = `url("${bgMediaUrl}")`;
    bgLayer.style.backgroundSize = "cover";
    bgLayer.style.backgroundPosition = "center";
    if (isMono) bgLayer.style.filter = "grayscale(100%)";
    host.appendChild(bgLayer);
  }

  if (filterOpacity > 0) {
    const filterLayer = document.createElement("div");
    filterLayer.style.position = "absolute";
    filterLayer.style.inset = "0";
    filterLayer.style.backgroundColor = hexToRgbaSafe(filterColor, filterOpacity);
    host.appendChild(filterLayer);
  }

  const cardWrap = document.createElement("div");
  cardWrap.style.position = "relative";
  cardWrap.style.zIndex = "2";
  cardWrap.style.width = "100%";

  const clonedCard = certificateElement.cloneNode(true) as HTMLElement;
  clonedCard.style.margin = "0 auto";
  clonedCard.style.width = "100%";
  // Slight frosted glass reinforcement so transparent layer remains rich on static raster export
  if (!clonedCard.style.backgroundColor || clonedCard.style.backgroundColor === "transparent") {
    const containerOp = companyTheme?.containerBgOpacity !== undefined ? Number(companyTheme.containerBgOpacity) : 0;
    const containerCol = companyTheme?.containerBgColor || "#17344F";
    clonedCard.style.backgroundColor =
      containerOp > 0 ? hexToRgbaSafe(containerCol, containerOp) : "rgba(255, 255, 255, 0.04)";
  }

  // Sync live computed heading metrics (#company-landing-root h1/h2/h3 rules) onto cloned nodes
  const origHeadings = certificateElement.querySelectorAll("h1, h2, h3");
  const clonedHeadings = clonedCard.querySelectorAll("h1, h2, h3");
  origHeadings.forEach((origEl, idx) => {
    const targetEl = clonedHeadings[idx] as HTMLElement | undefined;
    if (!targetEl) return;
    const cs = getComputedStyle(origEl);
    targetEl.style.fontSize = cs.fontSize;
    targetEl.style.lineHeight = cs.lineHeight;
    targetEl.style.fontWeight = cs.fontWeight;
    targetEl.style.letterSpacing = cs.letterSpacing;
  });

  // Ensure cloned images decode synchronously and remove lazy-loading delays
  clonedCard.querySelectorAll("img").forEach((img) => {
    img.setAttribute("loading", "eager");
    img.setAttribute("decoding", "sync");
  });

  cardWrap.appendChild(clonedCard);
  host.appendChild(cardWrap);
  offscreenWrap.appendChild(host);
  document.body.appendChild(offscreenWrap);

  try {
    onProgress?.(38, "Загружаем логотип и элементы защиты");
    await inlineImagesInTree(host);
    await Promise.all(
      Array.from(host.querySelectorAll("img")).map((img) =>
        typeof img.decode === "function" ? img.decode().catch(() => {}) : Promise.resolve()
      )
    );
    if (document.fonts?.ready) {
      await document.fonts.ready.catch(() => {});
    }
    await sleep(360);

    const stageW = Math.max(820, Math.ceil(host.getBoundingClientRect().width || 820));
    const stageH = Math.max(600, Math.ceil(host.getBoundingClientRect().height || host.scrollHeight || 860));

    onProgress?.(68, "Отрисовываем макет сертификата в высоком качестве");
    let dataUrl = "";
    try {
      dataUrl = await toPng(host, {
        cacheBust: false,
        width: stageW,
        height: stageH,
        pixelRatio: 2.25,
        backgroundColor: pageBgHex,
        skipAutoScale: true,
      });
    } catch (pngErr) {
      console.warn("[CertificatePdf] html-to-image fallback to html2canvas:", pngErr);
      const canvas = await html2canvas(host, {
        scale: 2,
        useCORS: true,
        allowTaint: false,
        backgroundColor: pageBgHex,
        logging: false,
      });
      dataUrl = canvas.toDataURL("image/png");
    }

    onProgress?.(88, "Формируем и упаковываем PDF-файл");
    await sleep(340);

    const dims = await loadImageDimensions(dataUrl);
    const isLandscape = dims.width > dims.height;
    const pdf = new jsPDF({
      orientation: isLandscape ? "landscape" : "portrait",
      unit: "mm",
      format: "a4",
      compress: true,
    });

    pdf.setProperties({
      title: `Сертификат — ${candidateName || "Кандидат"}`,
      subject: `${roleName || "Сертификат соответствия"} (${companyName || "Робот Рекрутер"})`,
      author: "Робот Рекрутер",
    });

    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const bgRgb = hexToRgb(pageBgHex) || { r: 23, g: 52, b: 79 };
    pdf.setFillColor(bgRgb.r, bgRgb.g, bgRgb.b);
    pdf.rect(0, 0, pageW, pageH, "F");

    const margin = 8;
    const availW = pageW - margin * 2;
    const availH = pageH - margin * 2;
    const imgRatio = dims.width / dims.height;
    const boxRatio = availW / availH;

    let renderW = availW;
    let renderH = availW / imgRatio;
    if (imgRatio < boxRatio) {
      renderH = availH;
      renderW = availH * imgRatio;
    }

    const offsetX = (pageW - renderW) / 2;
    const offsetY = (pageH - renderH) / 2;
    pdf.addImage(dataUrl, "PNG", offsetX, offsetY, renderW, renderH, undefined, "FAST");

    onProgress?.(100, "Запускаем сохранение PDF на устройство");
    await sleep(350);

    const filename = buildPdfFilename(candidateName, candidatePublicId);
    pdf.save(filename);
    return filename;
  } finally {
    offscreenWrap.remove();
  }
}
