import { useState, useEffect, useCallback } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

export type PWAInstallPlatform = "android" | "ios" | "desktop";

let globalDeferredPrompt: BeforeInstallPromptEvent | null = null;
const promptListeners = new Set<() => void>();

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e: Event) => {
    e.preventDefault();
    globalDeferredPrompt = e as BeforeInstallPromptEvent;
    promptListeners.forEach((fn) => fn());
  });
  window.addEventListener("appinstalled", () => {
    globalDeferredPrompt = null;
    promptListeners.forEach((fn) => fn());
  });
}

export function usePWAInstall() {
  const [hasNativePrompt, setHasNativePrompt] = useState<boolean>(Boolean(globalDeferredPrompt));
  const [isStandalone, setIsStandalone] = useState<boolean>(false);
  const [installModalOpen, setInstallModalOpen] = useState<boolean>(false);
  const [preferredGuideTab, setPreferredGuideTab] = useState<PWAInstallPlatform>("android");
  const [installStatus, setInstallStatus] = useState<string>("");

  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const isIOS = /iPad|iPhone|iPod/i.test(ua) || (typeof navigator !== "undefined" && navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/i.test(ua);
  const isDesktop = !isIOS && !isAndroid;
  const isInIframe = typeof window !== "undefined" && window.self !== window.top;

  useEffect(() => {
    if (typeof window === "undefined") return;

    const checkStandalone = () => {
      const mql = window.matchMedia?.("(display-mode: standalone)").matches;
      const navStandalone = Boolean((window.navigator as any).standalone);
      setIsStandalone(Boolean(mql || navStandalone));
    };

    checkStandalone();
    const syncPrompt = () => setHasNativePrompt(Boolean(globalDeferredPrompt));
    promptListeners.add(syncPrompt);

    const media = window.matchMedia?.("(display-mode: standalone)");
    const onMediaChange = () => checkStandalone();
    media?.addEventListener?.("change", onMediaChange);

    if (isIOS) setPreferredGuideTab("ios");
    else if (isAndroid) setPreferredGuideTab("android");
    else setPreferredGuideTab("desktop");

    return () => {
      promptListeners.delete(syncPrompt);
      media?.removeEventListener?.("change", onMediaChange);
    };
  }, [isIOS, isAndroid]);

  const triggerInstall = useCallback(
    async (targetPlatform?: PWAInstallPlatform) => {
      if (targetPlatform) setPreferredGuideTab(targetPlatform);

      if (targetPlatform !== "ios" && globalDeferredPrompt) {
        try {
          await globalDeferredPrompt.prompt();
          const choice = await globalDeferredPrompt.userChoice;
          if (choice?.outcome === "accepted") {
            globalDeferredPrompt = null;
            setHasNativePrompt(false);
            setIsStandalone(true);
            setInstallStatus("Приложение успешно установлено на ваше устройство!");
            return { ok: true, method: "native" as const };
          }
        } catch {
          // Fall through to instruction modal
        }
      }

      setInstallModalOpen(true);
      return { ok: false, method: "guide" as const };
    },
    []
  );

  return {
    hasNativePrompt,
    isStandalone,
    isIOS,
    isAndroid,
    isDesktop,
    isInIframe,
    installModalOpen,
    setInstallModalOpen,
    preferredGuideTab,
    setPreferredGuideTab,
    installStatus,
    triggerInstall,
  };
}
