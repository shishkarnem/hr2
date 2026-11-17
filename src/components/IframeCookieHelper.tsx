import React, { useEffect, useState } from "react";
import { ShieldAlert, ExternalLink, X, Check } from "lucide-react";

export default function IframeCookieHelper() {
  const [inIframe, setInIframe] = useState(false);
  const [hasStorageAccess, setHasStorageAccess] = useState<boolean | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Check if running inside an iframe
    const isIframe = window.self !== window.top;
    setInIframe(isIframe);

    if (isIframe && typeof document !== "undefined" && document.hasStorageAccess) {
      document
        .hasStorageAccess()
        .then((access) => {
          setHasStorageAccess(access);
        })
        .catch(() => {
          setHasStorageAccess(false);
        });
    } else {
      setHasStorageAccess(true);
    }
  }, []);

  const requestAccess = async () => {
    if (typeof document !== "undefined" && document.requestStorageAccess) {
      try {
        await document.requestStorageAccess();
        setHasStorageAccess(true);
        window.location.reload();
      } catch (err) {
        console.warn("Storage access request denied:", err);
      }
    }
  };

  const openNewTab = () => {
    window.open(window.location.href, "_blank");
  };

  if (!inIframe || hasStorageAccess === true || hasStorageAccess === null || dismissed) {
    return null;
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] bg-gradient-to-r from-amber-950 via-amber-900 to-amber-950 text-amber-100 px-4 py-2 text-xs md:text-sm border-b border-amber-500/30 shadow-xl flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 animate-pulse" />
        <span>
          <strong>Safari/iOS/Chrome:</strong> Ограничение сторонних cookie в iframe. Разрешите доступ для стабильной работы:
        </span>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={requestAccess}
          className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold px-3 py-1 rounded transition-colors flex items-center gap-1 shadow cursor-pointer"
        >
          <Check className="w-3.5 h-3.5" />
          Разрешить Cookie
        </button>
        <button
          onClick={openNewTab}
          className="bg-slate-800 hover:bg-slate-700 text-amber-200 border border-amber-500/30 px-3 py-1 rounded transition-colors flex items-center gap-1 cursor-pointer"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          Открыть в новой вкладке
        </button>
        <button
          onClick={() => setDismissed(true)}
          className="p-1 text-amber-400/70 hover:text-amber-200 transition-colors cursor-pointer"
          title="Скрыть"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
