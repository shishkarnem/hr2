/**
 * Universal image optimizer and cropper. Reads any user-picked image (PNG/JPG/SVG/WebP),
 * resizes or center-crops it into a square canvas, and returns a WebP Blob ~20–40KB.
 * 
 * - fit === "cover": center-crops horizontal or vertical images into a 1:1 square.
 *   If the image is already square, it is drawn as-is with no clipping.
 * - fit === "contain": preserves original aspect ratio, letterboxing inside the canvas.
 */
export async function resizeToWebP(
  file: File,
  size = 256,
  quality = 0.85,
  fit: "contain" | "cover" = "contain",
): Promise<{ blob: Blob; width: number; height: number; bytes: number }> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas_unavailable");
    ctx.clearRect(0, 0, size, size);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    if (fit === "cover") {
      // Center-crop to 1:1 square:
      // If square (img.width === img.height), uses the whole image as-is
      // If vertical, crops top and bottom equally
      // If horizontal, crops left and right equally
      const side = Math.min(img.width, img.height);
      const sx = Math.round((img.width - side) / 2);
      const sy = Math.round((img.height - side) / 2);
      ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
    } else {
      // Contain-fit
      const ratio = Math.min(size / img.width, size / img.height);
      const w = Math.round(img.width * ratio);
      const h = Math.round(img.height * ratio);
      const dx = Math.round((size - w) / 2);
      const dy = Math.round((size - h) / 2);
      ctx.drawImage(img, dx, dy, w, h);
    }

    const blob: Blob = await new Promise((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("toBlob_failed"))),
        "image/webp",
        quality,
      ),
    );
    return { blob, width: size, height: size, bytes: blob.size };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Center-crops any image (vertical or horizontal) into a 1:1 square WebP.
 * For square images, keeps the full image content without clipping.
 */
export async function cropToSquareWebP(
  file: File,
  size = 512,
  quality = 0.9,
): Promise<{ blob: Blob; width: number; height: number; bytes: number }> {
  return resizeToWebP(file, size, quality, "cover");
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image_load_failed"));
    img.src = src;
  });
}