import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import html2canvas from "html2canvas";
import NeuronSphereCanvas from "./NeuronSphereCanvas";
import { FileUploadService } from "@/services/FileUploadService";
import { AssistantType, AssistantMode, ChatMessage, UnifiedAIAssistantProps } from "./assistant/types";
import AssistantCollapsedCard from "./assistant/AssistantCollapsedCard";
import AssistantExpandedModal from "./assistant/AssistantExpandedModal";

import { DEFAULT_RR_LOGO_URL } from "@/lib/img";
import { resolveActiveEmployerId, resolveLandingVisitorChatId } from "@/lib/actorSession";

export type { AssistantType, AssistantMode, ChatMessage, UnifiedAIAssistantProps };

const FALLBACK_LOGO = DEFAULT_RR_LOGO_URL;

export default function UnifiedAIAssistant({
  assistantType = "landing",
  employerId,
  onNavigateTab,
  onOpenModal,
  onFillField,
  currentTab,
  companyId,
  companySlug,
  companyName,
  logoUrl,
  projectId,
  roleName,
  vacancySlug,
  contextText,
  themeConfig,
  themeColors,
  className = "",
}: UnifiedAIAssistantProps) {
  // Mode: "inactive" (sphere in corner), "collapsed" (compact chat), "expanded" (full modal)
  const [mode, setMode] = useState<AssistantMode>("inactive");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [waitingSeconds, setWaitingSeconds] = useState(0);

  // Attachments
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
  const [isCapturingScreenshot, setIsCapturingScreenshot] = useState(false);
  const [screenshotUploadProgress, setScreenshotUploadProgress] = useState<number | null>(null);
  const [screenshotStatusText, setScreenshotStatusText] = useState<string>("");

  const [attachedFile, setAttachedFile] = useState<{ url: string; name: string; size?: number; type?: string } | null>(null);
  const [fileUploadProgress, setFileUploadProgress] = useState<number | null>(null);
  const [fileStatusText, setFileStatusText] = useState<string>("");

  const [showVoiceRecorder, setShowVoiceRecorder] = useState(false);
  const [showFullHistory, setShowFullHistory] = useState(false);

  // Live waiting timer in seconds
  useEffect(() => {
    let interval: any = null;
    if (isTyping) {
      setWaitingSeconds(0);
      interval = setInterval(() => {
        setWaitingSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      setWaitingSeconds(0);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isTyping]);

  const assistantRootRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const autoCollapseTimerRef = useRef<any>(null);
  const autoInactiveTimerRef = useRef<any>(null);

  // Storage key based on assistant type & ID
  const storageKey = `rr_unified_assistant_${assistantType}_${employerId || companyId || companySlug || "global"}`;

  // Local Chat ID for persistent ProTalk session
  const getChatId = (): string => {
    if (assistantType === "employer_promax") {
      const cleanEmpId = resolveActiveEmployerId({ employer_id: employerId });
      return `${cleanEmpId}_promax`;
    }
    if (assistantType === "vacancy_company") {
      const cleanComId = String(companyId || "300007").replace(/\D/g, "") || "300007";
      return `_chat_com${cleanComId}`;
    }
    return `chat_${resolveLandingVisitorChatId()}`;
  };

  const sphereColor = themeColors?.iconColor || themeConfig?.iconColor || "#E7C768";
  const effectiveLogoUrl = logoUrl || FALLBACK_LOGO;

  // Initialize initial greeting message
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMessages(parsed);
          return;
        }
      }
    } catch {}

    let initialGreeting = "";
    if (assistantType === "employer_promax") {
      initialGreeting = `Здравствуйте! Я персональный HR-копилот RR ProMax. 🚀\n\nЯ помогу вам в пару фраз настроить личный кабинет, создать вакансии, компании, настроить CRM и автоответы. Просто напишите, какую задачу решить, или прикрепите файл/скриншот!`;
    } else if (assistantType === "vacancy_company") {
      const cName = companyName || "нашей компании";
      const rName = roleName ? `на вакансию «${roleName}»` : "на работу";
      initialGreeting = `Здравствуйте! Я виртуальный рекрутер компании «${cName}». 🤝\n\nС удовольствием расскажу про условия работы ${rName}, требования, а также подскажу, как успешно пройти все 3 этапа собеседования и обучение в ИИ Академии. Задавайте любые вопросы!`;
    } else {
      initialGreeting = `Здравствуйте! Я официальный ИИ-Ассистент платформы «Робот Рекрутер» (RR). 🤖\n\nРасскажу про возможности автонайма 24/7, цены (собеседование 100 RR, обучение 100 RR, лендинг 500 RR), подарок 1000 RR при регистрации и правила ИИ Академии. Чем могу помочь?`;
    }

    const defaultMsg: ChatMessage = {
      id: "init",
      sender: "assistant",
      text: initialGreeting,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };
    setMessages([defaultMsg]);
  }, [assistantType, companyName, roleName, storageKey]);

  // Save messages to local storage
  useEffect(() => {
    if (messages.length > 0) {
      try {
        localStorage.setItem(storageKey, JSON.stringify(messages.slice(-12)));
      } catch {}
    }
  }, [messages, storageKey]);

  // Inactivity management
  const resetInactivityTimer = () => {
    if (autoInactiveTimerRef.current) clearTimeout(autoInactiveTimerRef.current);
    autoInactiveTimerRef.current = setTimeout(() => {
      setMode("inactive");
      setShowVoiceRecorder(false);
    }, 60000);
  };

  useEffect(() => {
    if (mode !== "inactive") {
      resetInactivityTimer();
    } else {
      if (autoInactiveTimerRef.current) clearTimeout(autoInactiveTimerRef.current);
    }
    return () => {
      if (autoInactiveTimerRef.current) clearTimeout(autoInactiveTimerRef.current);
    };
  }, [mode, messages]);

  const scheduleAutoCollapse = () => {
    if (autoCollapseTimerRef.current) clearTimeout(autoCollapseTimerRef.current);
    autoCollapseTimerRef.current = setTimeout(() => {
      setMode("collapsed");
      setShowVoiceRecorder(false);
    }, 12000);
  };

  const handleCycleMode = () => {
    if (autoCollapseTimerRef.current) clearTimeout(autoCollapseTimerRef.current);
    if (mode === "inactive") {
      setMode("collapsed");
    } else if (mode === "collapsed") {
      setMode("expanded");
    } else {
      setMode("inactive");
      setShowVoiceRecorder(false);
    }
  };

  // --------------------------------------------------------------------------
  // SCREENSHOT CAPTURE (Auto-hide assistant root, screen/canvas capture, gallery upload)
  // --------------------------------------------------------------------------
  const handleTakeScreenshot = async (autoSendFollowup: boolean = false) => {
    if (isCapturingScreenshot) return;
    setIsCapturingScreenshot(true);
    setScreenshotUploadProgress(15);
    setScreenshotStatusText("Подготовка снимка экрана...");

    if (mode === "inactive") setMode("collapsed");

    try {
      // 1. Temporarily hide assistant root dialog so it does NOT capture itself
      if (assistantRootRef.current) {
        assistantRootRef.current.style.visibility = "hidden";
      }

      await new Promise((r) => setTimeout(r, 180));

      let dataUrl: string | null = null;

      // Primary: Native Display Media capture (triggers browser prompt on click)
      if (navigator.mediaDevices && typeof navigator.mediaDevices.getDisplayMedia === "function") {
        try {
          setScreenshotStatusText("Выбор экрана для снимка...");
          const stream = await navigator.mediaDevices.getDisplayMedia({
            video: { displaySurface: "browser" } as any,
            audio: false,
          });

          const video = document.createElement("video");
          video.srcObject = stream;
          video.muted = true;
          video.playsInline = true;
          await new Promise<void>((resolve, reject) => {
            video.onloadedmetadata = () => {
              video.play().then(() => resolve()).catch(reject);
            };
            video.onerror = reject;
          });

          const canvas = document.createElement("canvas");
          canvas.width = video.videoWidth || window.innerWidth;
          canvas.height = video.videoHeight || window.innerHeight;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            dataUrl = canvas.toDataURL("image/png");
          }
          stream.getTracks().forEach((track) => track.stop());
        } catch (dispErr) {
          console.warn("[UnifiedAIAssistant] getDisplayMedia was cancelled or not allowed, falling back to html2canvas:", dispErr);
        }
      }

      // Secondary fallback: html2canvas DOM rendering
      if (!dataUrl) {
        try {
          setScreenshotStatusText("Снятие снимка экрана...");
          const vWidth = Math.min(window.innerWidth || 1280, 1920);
          const vHeight = Math.min(window.innerHeight || 800, 1080);
          const sX = window.scrollX || window.pageXOffset || 0;
          const sY = window.scrollY || window.pageYOffset || 0;

          const targetEl = document.getElementById("root") || document.body;

          const canvas = await html2canvas(targetEl, {
            useCORS: true,
            allowTaint: false,
            logging: false,
            scale: 1,
            x: sX,
            y: sY,
            width: vWidth,
            height: vHeight,
            windowWidth: window.innerWidth,
            windowHeight: window.innerHeight,
            backgroundColor: "#0d1b2a",
            ignoreElements: (element) => {
              if (!element) return false;
              const tag = (element.tagName || "").toLowerCase();
              if (tag === "video" || tag === "iframe" || tag === "audio") return true;
              if (element.id === "rr-unified-assistant-root" || element.closest?.("#rr-unified-assistant-root")) return true;
              if (element.classList?.contains("ai-assistant-ignore") || element.classList?.contains("ai-assistant-root")) return true;
              return false;
            },
          });

          dataUrl = canvas.toDataURL("image/png");
        } catch (h2cErr) {
          console.warn("[UnifiedAIAssistant] html2canvas viewport capture error:", h2cErr);
        }
      }

      // Restore assistant modal window visibility immediately after capture
      if (assistantRootRef.current) {
        assistantRootRef.current.style.visibility = "visible";
      }

      if (!dataUrl) {
        throw new Error("Не удалось получить изображение экрана");
      }

      setScreenshotUploadProgress(45);
      setScreenshotStatusText("Загрузка скриншота в галерею...");

      let finalUrl = "";

      // 1. Upload to ProTalk cloud gallery via FileUploadService
      try {
        const res = await fetch(dataUrl);
        const blob = await res.blob();
        const file = new File([blob], `screenshot_${Date.now()}.png`, { type: "image/png" });
        const upResult = await FileUploadService.uploadFileResult(file, {
          custom_name: `Скриншот экрана ${new Date().toLocaleTimeString()}`,
          description: `Скриншот интерфейса [${assistantType}]`,
          onProgress: (pct) => {
            setScreenshotUploadProgress(Math.max(45, Math.min(95, pct)));
          },
        });
        if (upResult?.original_url || upResult?.url) {
          finalUrl = upResult.original_url || upResult.url;
        }
      } catch (galleryErr) {
        console.warn("[UnifiedAIAssistant] Gallery upload error, trying local server fallback:", galleryErr);
      }

      // 2. Server upload fallback (/api/files/upload-base64)
      if (!finalUrl && dataUrl) {
        try {
          setScreenshotUploadProgress(70);
          setScreenshotStatusText("Сохранение в хранилище...");
          const res = await fetch("/api/files/upload-base64", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              dataUrl,
              name: `screenshot_${Date.now()}`,
              description: `Скриншот экрана [${assistantType}]`,
            }),
          });
          if (res.ok) {
            const resJson = await res.json();
            if (resJson?.url) {
              finalUrl = resJson.url.startsWith("http")
                ? resJson.url
                : `${window.location.origin}${resJson.url.startsWith("/") ? "" : "/"}${resJson.url}`;
            }
          }
        } catch (localUpErr) {
          console.warn("[UnifiedAIAssistant] Local upload-base64 fallback:", localUpErr);
        }
      }

      if (!finalUrl && dataUrl) {
        finalUrl = dataUrl;
      }

      if (finalUrl) {
        setScreenshotUrl(finalUrl);
        setScreenshotUploadProgress(100);
        setScreenshotStatusText("Скриншот успешно загружен!");
        setTimeout(() => setScreenshotUploadProgress(null), 2500);

        if (autoSendFollowup) {
          setTimeout(() => {
            handleSend(
              "Я сделал актуальный скриншот открытого окна. Проанализируй его и помоги с настройкой.",
              finalUrl
            );
          }, 400);
        }
      } else {
        setScreenshotStatusText("Ошибка создания скриншота");
        setTimeout(() => setScreenshotUploadProgress(null), 3000);
      }
    } catch (err: any) {
      console.error("[UnifiedAIAssistant] Error taking screenshot:", err);
      setScreenshotStatusText("Ошибка создания скриншота");
      setTimeout(() => setScreenshotUploadProgress(null), 3000);
    } finally {
      if (assistantRootRef.current) {
        assistantRootRef.current.style.visibility = "visible";
      }
      setIsCapturingScreenshot(false);
    }
  };

  // --------------------------------------------------------------------------
  // FILE ATTACHMENT UPLOAD
  // --------------------------------------------------------------------------
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileUploadProgress(15);
    setFileStatusText("Подготовка файла...");

    try {
      const upResult = await FileUploadService.uploadFileResult(file, {
        custom_name: file.name,
        description: `Вложение для ИИ-Ассистента [${assistantType}]`,
        onProgress: (pct) => {
          setFileUploadProgress(Math.max(20, pct));
        },
      });

      if (upResult?.url) {
        setAttachedFile({
          url: upResult.url,
          name: file.name,
          size: file.size,
          type: file.type,
        });
        setFileUploadProgress(100);
        setFileStatusText("Файл прикреплен!");
        setTimeout(() => setFileUploadProgress(null), 2500);
        return;
      }
    } catch (err) {
      console.warn("[UnifiedAIAssistant] Primary upload failed, trying local server fallback...", err);
      try {
        setFileUploadProgress(50);
        setFileStatusText("Сохранение в галерею...");
        const reader = new FileReader();
        reader.onload = async () => {
          try {
            const res = await fetch("/api/files/upload-base64", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                dataUrl: reader.result,
                name: file.name,
                description: `Вложение [${assistantType}]`,
              }),
            });
            if (res.ok) {
              const resJson = await res.json();
              if (resJson?.url) {
                setAttachedFile({
                  url: resJson.url,
                  name: file.name,
                  size: file.size,
                  type: file.type,
                });
                setFileUploadProgress(100);
                setFileStatusText("Файл прикреплен!");
                setTimeout(() => setFileUploadProgress(null), 2500);
                return;
              }
            }
            throw new Error("Local upload failed");
          } catch (innerErr) {
            console.error("Local file upload error:", innerErr);
            setFileStatusText("Ошибка загрузки файла");
            setTimeout(() => setFileUploadProgress(null), 3000);
          }
        };
        reader.readAsDataURL(file);
      } catch (fallbackErr) {
        console.error("Fallback error:", fallbackErr);
        setFileStatusText("Ошибка загрузки файла");
        setTimeout(() => setFileUploadProgress(null), 3000);
      }
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // --------------------------------------------------------------------------
  // SEND MESSAGE
  // --------------------------------------------------------------------------
  const handleSend = async (textToSend: string, directScreenshotUrl?: string) => {
    const cleanText = textToSend.trim();
    const effectiveScreenshot = directScreenshotUrl || screenshotUrl;
    const effectiveFile = attachedFile;
    if (!cleanText && !effectiveScreenshot && !effectiveFile) return;

    if (autoCollapseTimerRef.current) clearTimeout(autoCollapseTimerRef.current);
    resetInactivityTimer();

    let fullFileUrl = "";
    if (effectiveFile) {
      const rawUrl = effectiveFile.url || "";
      fullFileUrl = rawUrl.startsWith("http")
        ? rawUrl
        : `${window.location.origin}${rawUrl.startsWith("/") ? "" : "/"}${rawUrl}`;
    }

    const userDisplayText = cleanText || (effectiveFile ? `Прикреплен файл: ${effectiveFile.name}` : effectiveScreenshot ? "Скриншот экрана" : "");

    const userMsg: ChatMessage = {
      id: `usr_${Date.now()}`,
      sender: "user",
      text: userDisplayText || "Пожалуйста, проанализируйте этот скриншот и помогите мне.",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      screenshotUrl: effectiveScreenshot || undefined,
      fileUrl: fullFileUrl || effectiveFile?.url,
      fileName: effectiveFile?.name,
      fileSize: effectiveFile?.size,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputValue("");
    setScreenshotUrl(null);
    setAttachedFile(null);
    setIsTyping(true);

    try {
      const userQueries = messages
        .filter((m) => m.sender === "user")
        .slice(-4)
        .map((m) => m.text)
        .concat(userMsg.text);

      const resp = await fetch("/api/ai-assistant-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assistant_type: assistantType,
          user_question: cleanText || userDisplayText,
          user_messages_history: userQueries,
          screenshot_url: effectiveScreenshot,
          file_url: fullFileUrl || effectiveFile?.url,
          file_name: effectiveFile?.name,
          attached_file_url: fullFileUrl || effectiveFile?.url,
          messages: messages.concat(userMsg).slice(-10),
          chat_id: getChatId(),
          employer_id: assistantType === "employer_promax" ? resolveActiveEmployerId({ employer_id: employerId }) : employerId,
          employer_public_id: assistantType === "employer_promax" ? resolveActiveEmployerId({ employer_id: employerId }) : undefined,
          demo_user_id: assistantType === "landing" ? resolveLandingVisitorChatId() : undefined,
          company_id: companyId,
          company_slug: companySlug,
          project_id: projectId,
          vacancy_slug: vacancySlug,
          vacancy_title: roleName,
          context_text: contextText,
          current_tab: currentTab,
          current_url: window.location.pathname,
        }),
      });

      const data = await resp.json();
      const replyText = data?.reply || "Спасибо за обращение! Я готов помочь вам с любыми настройками.";

      const assistantMsg: ChatMessage = {
        id: `ast_${Date.now()}`,
        sender: "assistant",
        text: replyText,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };

      setMessages((prev) => [...prev, assistantMsg]);

      if (Array.isArray(data?.actions) && data.actions.length > 0) {
        let shouldTakeScreenshot = false;
        for (const act of data.actions) {
          if (act.type === "navigate_tab" && onNavigateTab && act.tab) {
            onNavigateTab(act.tab);
          } else if (act.type === "open_modal" && onOpenModal && act.modal) {
            onOpenModal(act.modal);
          } else if (act.type === "fill_field" && onFillField && act.field) {
            onFillField(act.field, act.value);
          } else if (act.type === "take_screenshot") {
            shouldTakeScreenshot = true;
          }
        }
        if (shouldTakeScreenshot) {
          setTimeout(() => handleTakeScreenshot(true), 800);
        }
        setMode("collapsed");
      } else {
        if (mode === "expanded") {
          scheduleAutoCollapse();
        }
      }
    } catch (err: any) {
      console.error("[UnifiedAIAssistant] Error sending:", err);
      const errMsg: ChatMessage = {
        id: `err_${Date.now()}`,
        sender: "assistant",
        text: "Произошла ошибка при обращении к ИИ. Попробуйте повторить запрос!",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleClearHistory = () => {
    if (window.confirm("Очистить историю диалога с ассистентом?")) {
      const resetMsg: ChatMessage = {
        id: `init_${Date.now()}`,
        sender: "assistant",
        text: "История сброшена. Чем я могу помочь вам сейчас?",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      setMessages([resetMsg]);
      try {
        localStorage.removeItem(storageKey);
      } catch {}
    }
  };

  const lastUserMsg = [...messages].reverse().find((m) => m.sender === "user");
  const lastAssistantMsg = [...messages].reverse().find((m) => m.sender === "assistant");
  const previousMessagesCount = Math.max(0, messages.length - (lastUserMsg ? 2 : 1));

  const isEmployer =
    assistantType === "employer_promax" ||
    (typeof window !== "undefined" &&
      (window.location.pathname.startsWith("/emp") || window.location.pathname.startsWith("/employer")));

  const isPublicPageWithBottomNav =
    !isEmployer &&
    typeof window !== "undefined" &&
    (window.location.pathname === "/" ||
      window.location.pathname === "/main" ||
      window.location.pathname.startsWith("/vacancies") ||
      window.location.pathname.startsWith("/blog") ||
      window.location.pathname.startsWith("/academy") ||
      window.location.pathname.startsWith("/demo"));

  return (
    <div id="rr-unified-assistant-root" ref={assistantRootRef} className={`select-none ${className}`}>
      {/* Hidden file input for attachment upload */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        className="hidden"
        accept="*/*"
      />

      {/* 1. Permanent corner sphere button */}
      <div
        className={`fixed z-50 flex items-center gap-2 ${
          isEmployer
            ? "bottom-4 right-4 md:bottom-6 md:right-6 flex-row-reverse"
            : isPublicPageWithBottomNav
            ? "bottom-20 left-4 md:bottom-6 md:left-6"
            : "bottom-4 left-4 md:bottom-6 md:left-6"
        }`}
      >
        <motion.button
          type="button"
          onClick={handleCycleMode}
          aria-label="ИИ-Ассистент Робот Рекрутер"
          title={
            mode === "inactive"
              ? "Открыть ИИ-Ассистента (свернутый вид)"
              : mode === "collapsed"
              ? "Развернуть ИИ-Ассистента на весь экран"
              : "Перевести в фоновый режим"
          }
          className="relative w-14 h-14 md:w-16 md:h-16 rounded-full flex items-center justify-center cursor-pointer bg-transparent border-none p-0 overflow-visible transition hover:scale-110 active:scale-95"
          whileHover={{ y: -2 }}
        >
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <NeuronSphereCanvas
              size={64}
              speed={mode === "expanded" ? 0.04 : mode === "collapsed" ? 0.025 : 0.015}
              color={sphereColor}
            />
          </div>

          <div className="relative z-10 w-9 h-9 md:w-10 md:h-10 rounded-full overflow-hidden flex items-center justify-center bg-transparent pointer-events-none">
            <img
              src={effectiveLogoUrl}
              alt="RR"
              className="w-full h-full object-contain filter drop-shadow-[0_0_8px_rgba(231,199,104,0.6)]"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).src = FALLBACK_LOGO;
              }}
            />
          </div>

          <span className="absolute top-1 right-1 w-3 h-3 rounded-full bg-[#E7C768] ring-2 ring-black animate-ping" />
          <span className="absolute top-1 right-1 w-3 h-3 rounded-full bg-[#E7C768] ring-2 ring-black" />
        </motion.button>
      </div>

      {/* 2. Collapsed mode overlay */}
      <AnimatePresence>
        {mode === "collapsed" && (
          <AssistantCollapsedCard
            assistantType={assistantType}
            companyName={companyName}
            isEmployer={isEmployer}
            isPublicPageWithBottomNav={isPublicPageWithBottomNav}
            lastUserMsg={lastUserMsg}
            lastAssistantMsg={lastAssistantMsg}
            isTyping={isTyping}
            waitingSeconds={waitingSeconds}
            screenshotUploadProgress={screenshotUploadProgress}
            screenshotStatusText={screenshotStatusText}
            fileUploadProgress={fileUploadProgress}
            fileStatusText={fileStatusText}
            screenshotUrl={screenshotUrl}
            attachedFile={attachedFile}
            inputValue={inputValue}
            setInputValue={setInputValue}
            sphereColor={sphereColor}
            isCapturingScreenshot={isCapturingScreenshot}
            onExpand={() => setMode("expanded")}
            onClose={() => setMode("inactive")}
            onSend={(text) => handleSend(text)}
            onTakeScreenshot={() => void handleTakeScreenshot()}
            onOpenFilePicker={() => fileInputRef.current?.click()}
            onRemoveScreenshot={() => setScreenshotUrl(null)}
            onRemoveFile={() => setAttachedFile(null)}
          />
        )}
      </AnimatePresence>

      {/* 3. Expanded mode full glass dialog */}
      <AnimatePresence>
        {mode === "expanded" && (
          <AssistantExpandedModal
            assistantType={assistantType}
            companyName={companyName}
            sphereColor={sphereColor}
            messages={messages}
            lastUserMsg={lastUserMsg}
            lastAssistantMsg={lastAssistantMsg}
            previousMessagesCount={previousMessagesCount}
            showFullHistory={showFullHistory}
            setShowFullHistory={setShowFullHistory}
            showVoiceRecorder={showVoiceRecorder}
            setShowVoiceRecorder={setShowVoiceRecorder}
            inputValue={inputValue}
            setInputValue={setInputValue}
            isTyping={isTyping}
            waitingSeconds={waitingSeconds}
            screenshotUploadProgress={screenshotUploadProgress}
            screenshotStatusText={screenshotStatusText}
            fileUploadProgress={fileUploadProgress}
            fileStatusText={fileStatusText}
            screenshotUrl={screenshotUrl}
            attachedFile={attachedFile}
            isCapturingScreenshot={isCapturingScreenshot}
            onClearHistory={handleClearHistory}
            onCollapse={() => setMode("collapsed")}
            onClose={() => setMode("inactive")}
            onSend={(text) => handleSend(text)}
            onTakeScreenshot={() => void handleTakeScreenshot()}
            onOpenFilePicker={() => fileInputRef.current?.click()}
            onRemoveScreenshot={() => setScreenshotUrl(null)}
            onRemoveFile={() => setAttachedFile(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
