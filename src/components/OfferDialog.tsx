import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import OfferContent from "./OfferContent";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onAccept?: () => void;
}

export default function OfferDialog({ isOpen, onClose, onAccept }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [reachedEnd, setReachedEnd] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setReachedEnd(false);
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prevOverflow;
      };
    }
  }, [isOpen]);

  if (!isOpen || !mounted) return null;

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 24) setReachedEnd(true);
  };

  const modalContent = (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-5 md:p-8">
      {/* Backdrop: completely transparent with click to close */}
      <div
        className="fixed inset-0 bg-transparent transition-opacity"
        onClick={onClose}
        aria-label="Закрыть оферту"
      />

      {/* Modal Window: Liquid Glass Apple style with strong backdrop blur and transparent background */}
      <div className="relative w-full max-w-4xl bg-transparent backdrop-blur-3xl border border-white/20 text-white rounded-3xl max-h-[90vh] flex flex-col shadow-2xl z-10 text-left overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/15 bg-transparent backdrop-blur-md">
          <h2 className="text-base sm:text-lg font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">
            Публичная оферта
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-300 hover:text-white hover:bg-white/10 border border-white/15 transition cursor-pointer"
            title="Закрыть"
            aria-label="Закрыть"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div ref={scrollRef} onScroll={onScroll} className="overflow-y-auto px-6 py-5 flex-1 space-y-4 text-[14px]">
          <OfferContent />
          <div className="h-4" />
        </div>

        <div className="px-6 py-4 border-t border-white/15 flex flex-wrap items-center justify-between gap-3 bg-transparent backdrop-blur-md">
          <p className="text-[14px] text-slate-200">
            {reachedEnd ? "Вы ознакомились с офертой полностью." : "Прокрутите до конца, чтобы подтвердить ознакомление."}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-[14px] font-bold text-slate-200 hover:text-white bg-transparent hover:bg-white/10 border border-white/20 cursor-pointer transition"
            >
              Закрыть
            </button>
            {onAccept && (
              <button
                type="button"
                disabled={!reachedEnd}
                onClick={() => { onAccept(); onClose(); }}
                className="px-5 py-2 rounded-xl text-[14px] font-bold bg-gradient-to-r from-[#FFE580] via-[#E7C768] to-[#C8A038] text-[#17344F] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-md transition hover:brightness-110 active:scale-95"
              >
                Принимаю
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(modalContent, document.body) : modalContent;
}