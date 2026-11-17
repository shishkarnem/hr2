/**
 * Маленький значок «?» рядом с полем/кнопкой. По клику открывает
 * поповер с подробным описанием из таблицы onboarding_content.
 * Использование: <FieldHelp section="profile" fieldKey="email" />
 */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import Markdown from "react-markdown";
import { getFieldHelp, type OnboardingItem, type OnboardingSection } from "@/lib/onboarding";

interface Props {
  section: OnboardingSection;
  fieldKey: string;
  /** Заголовок-фолбэк, если в БД ещё нет статьи для этого ключа. */
  fallbackTitle?: string;
  /** Описание-фолбэк, если в БД ещё нет статьи для этого ключа. */
  fallbackBody?: string;
  className?: string;
}

export default function FieldHelp({
  section,
  fieldKey,
  fallbackTitle,
  fallbackBody,
  className = "",
}: Props) {
  const [open, setOpen] = useState(false);
  const [item, setItem] = useState<OnboardingItem | null>(null);
  const [loaded, setLoaded] = useState(false);
  const btnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (open && !loaded) {
      getFieldHelp(section, fieldKey).then((it) => {
        if (!cancelled) { setItem(it); setLoaded(true); }
      });
    }
    return () => { cancelled = true; };
  }, [open, loaded, section, fieldKey]);

  const title = item?.title || fallbackTitle || "Подсказка";
  const body = item?.body_md || fallbackBody || "_Подсказка для этого поля скоро появится._";

  // Позиционируем поповер относительно самой иконки «?», а не события мыши.
  const rect = btnRef.current?.getBoundingClientRect();
  const top = rect ? Math.min(rect.bottom + 10, window.innerHeight - 280) : 100;
  const left = rect ? Math.min(Math.max(rect.left - 140, 16), window.innerWidth - 360) : 100;

  return (
    <span className={`relative inline-flex items-center normal-case font-normal ${className}`}>
      <button
        ref={btnRef}
        type="button"
        aria-label="Подсказка"
        title="Показать подсказку"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((v) => !v); }}
        className="w-6 h-6 inline-flex items-center justify-center rounded-full bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] text-[#17344F] hover:brightness-110 border border-[#E7C768] shadow-[0_2px_8px_rgba(231,199,104,0.45)] transition cursor-pointer ml-1.5 align-middle shrink-0 font-bold text-sm leading-none normal-case"
        style={{ fontFamily: "system-ui, -apple-system, sans-serif", textTransform: "none" }}
      >
        ?
      </button>
      {open && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-[9998] normal-case font-normal"
          style={{ textTransform: "none" }}
          onClick={() => setOpen(false)}
        >
          <div
            className="fixed z-[9999] max-w-sm w-[340px] bg-transparent backdrop-blur-2xl border border-[#E7C768]/60 rounded-3xl shadow-2xl p-5 text-left text-white normal-case font-normal"
            style={{
              top,
              left,
              textTransform: "none",
              backdropFilter: "blur(28px)",
              WebkitBackdropFilter: "blur(28px)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 mb-2.5">
              <h4
                className="text-base font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent leading-snug normal-case"
                style={{ textTransform: "none" }}
              >
                {loaded ? title : "Загружаем…"}
              </h4>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="w-7 h-7 rounded-full border border-white/25 bg-transparent text-white hover:border-[#E7C768] hover:text-[#E7C768] flex items-center justify-center transition cursor-pointer shrink-0"
                aria-label="Закрыть"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div
              className="text-sm font-normal text-white leading-relaxed normal-case markdown-body max-h-[60vh] overflow-y-auto"
              style={{ textTransform: "none" }}
            >
              {loaded ? <Markdown>{body}</Markdown> : <div className="opacity-75 text-sm">…</div>}
            </div>
          </div>
        </div>,
        document.body
      )}
    </span>
  );
}