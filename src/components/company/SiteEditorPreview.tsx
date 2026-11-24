import React, { useEffect, useState } from "react";
import { RefreshCw, Upload, X } from "lucide-react";
import SitePreview, { normalizeSiteUrl } from "../SitePreview";
import { getUploadService } from "@/services/FileUploadService";
import { resizeToWebP } from "@/lib/imageResize";

type Props = {
  url: string;
  title?: string;
  customScreenshot?: string;
  heightPx?: number;
  uploaderName?: string;
  onScreenshotChange: (newScreenshot: string) => void;
};

/**
 * Debounced SitePreview wrapper for Company Editor cards with manual refresh
 * and custom screenshot upload in Apple Liquid Glass styling.
 */
export default function SiteEditorPreview({
  url,
  title,
  customScreenshot,
  heightPx = 160,
  uploaderName = "Работодатель",
  onScreenshotChange,
}: Props) {
  const [debouncedUrl, setDebouncedUrl] = useState(url);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  useEffect(() => {
    const trimmed = (url || "").trim();
    if (!trimmed) {
      setDebouncedUrl("");
      return;
    }
    const timer = setTimeout(() => {
      setDebouncedUrl(trimmed);
    }, 450);
    return () => clearTimeout(timer);
  }, [url]);

  const normalized = normalizeSiteUrl(debouncedUrl);
  const isValidDomain = Boolean(
    normalized && (() => {
      try {
        const host = new URL(normalized).hostname;
        return host.includes(".") && host.length >= 4;
      } catch {
        return false;
      }
    })()
  );

  const handleRefresh = () => {
    setIsRefreshing(true);
    setRefreshNonce((n) => n + 1);
    setTimeout(() => setIsRefreshing(false), 1200);
  };

  const handleUploadScreenshot = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadError("");
    setIsUploading(true);
    try {
      const { blob } = await resizeToWebP(file, 1440, 0.88);
      const uploadedUrl = await getUploadService().uploadFromBlob(
        blob,
        `site-preview-${Date.now()}.webp`,
        {
          custom_name: `Превью сайта: ${title || debouncedUrl || "Компания"}`,
          owner_id: uploaderName,
          description: "Пользовательский скриншот сайта компании",
        }
      );
      onScreenshotChange(uploadedUrl);
    } catch (err: any) {
      setUploadError(err?.message || "Не удалось загрузить скриншот");
    } finally {
      setIsUploading(false);
    }
  };

  if (!isValidDomain) {
    return (
      <div className="h-20 rounded-2xl border border-dashed border-white/15 flex items-center justify-center text-sm text-slate-300 px-4 text-center">
        Введите корректный адрес сайта (например: company.ru) для предпросмотра
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      <SitePreview
        url={debouncedUrl}
        title={title}
        customScreenshot={customScreenshot}
        heightPx={heightPx || 160}
        variant="banner"
        refreshNonce={refreshNonce}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="cursor-pointer bg-transparent hover:bg-white/10 border border-white/20 text-white text-sm font-medium px-3 py-1.5 rounded-xl transition inline-flex items-center gap-1.5 backdrop-blur-md disabled:opacity-60"
        >
          <RefreshCw className={`w-4 h-4 text-[#E7C768] ${isRefreshing ? "animate-spin" : ""}`} />
          <span>Обновить превью</span>
        </button>

        <label className="cursor-pointer bg-transparent hover:bg-white/10 border border-white/20 text-white text-sm font-medium px-3 py-1.5 rounded-xl transition inline-flex items-center gap-1.5 backdrop-blur-md">
          <Upload className="w-4 h-4 text-[#E7C768]" />
          <span>{isUploading ? "Загрузка…" : "Свой скриншот"}</span>
          <input
            type="file"
            accept="image/*"
            className="hidden"
            disabled={isUploading}
            onChange={handleUploadScreenshot}
          />
        </label>

        {customScreenshot ? (
          <button
            type="button"
            onClick={() => onScreenshotChange("")}
            className="cursor-pointer bg-transparent hover:bg-white/10 border border-white/20 text-slate-200 text-sm font-medium px-3 py-1.5 rounded-xl transition inline-flex items-center gap-1.5 backdrop-blur-md"
          >
            <X className="w-4 h-4 text-[#E7C768]" />
            <span>Вернуть авто-превью</span>
          </button>
        ) : null}
      </div>

      {uploadError ? (
        <div className="text-sm text-white/90 border border-white/25 rounded-xl px-3 py-2 backdrop-blur-md">
          {uploadError}
        </div>
      ) : null}
    </div>
  );
}
