import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, FileText } from "lucide-react";
import { LandingThemeConfig, hexToRgba } from "../LandingStyleEditor";
import {
  LegalAudience,
  LegalDocContent,
  LegalDocType,
  getLegalDocMeta,
  getLegalDocsList,
} from "./legalDocsData";

interface LegalDocDialogProps {
  isOpen: boolean;
  docType: LegalDocType;
  audience?: LegalAudience;
  onClose: () => void;
  onAccept?: () => void;
  companyName?: string;
  roleName?: string;
  themeConfig?: LandingThemeConfig | null;
}

export default function LegalDocDialog({
  isOpen,
  docType,
  audience = "employer",
  onClose,
  onAccept,
  companyName,
  roleName,
  themeConfig,
}: LegalDocDialogProps) {
  const [activeDoc, setActiveDoc] = useState<LegalDocType>(docType);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setActiveDoc(docType);
  }, [docType, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen]);

  if (!isOpen || !mounted) return null;

  const docsList = getLegalDocsList(audience);
  const meta = getLegalDocMeta(activeDoc, audience);

  const borderColor = themeConfig?.containerBorderColor || "#ffffff";
  const borderOpacity = themeConfig?.containerBorderOpacity ?? 20;
  const bodyTextColor = themeConfig?.bodyTextColor || "#FFFFFF";
  const fontFamily = themeConfig?.fontFamily;
  const headingsSolidColor = themeConfig?.headingsSolidColor || "#E7C768";
  const headingsColorMode = themeConfig?.headingsColorMode || "gradient-gold";
  const accentColor = themeConfig?.btnActiveBgColor || themeConfig?.headingsSolidColor || "#E7C768";

  const modalContent = (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-5 md:p-8">
      <div
        className="fixed inset-0 bg-transparent backdrop-blur-xl transition-opacity"
        onClick={onClose}
        aria-label="Закрыть документ"
      />

      <div
        className="relative w-full max-w-4xl bg-transparent backdrop-blur-3xl rounded-3xl max-h-[90vh] flex flex-col shadow-2xl z-10 text-left overflow-hidden"
        style={{
          borderColor: hexToRgba(borderColor, Math.max(20, borderOpacity)),
          borderWidth: "1px",
          borderStyle: "solid",
          color: bodyTextColor,
          fontFamily: fontFamily || undefined,
        }}
      >
        <div
          className="flex items-center justify-between gap-3 px-5 sm:px-6 py-4 border-b bg-transparent backdrop-blur-md"
          style={{ borderColor: hexToRgba(borderColor, 15) }}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <FileText className="w-5 h-5 shrink-0" style={{ color: accentColor }} />
            <h2
              className={`text-base sm:text-lg font-bold truncate ${
                headingsColorMode === "solid"
                  ? ""
                  : "bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent"
              }`}
              style={headingsColorMode === "solid" ? { color: headingsSolidColor } : undefined}
            >
              {meta.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-200 hover:text-white hover:bg-white/10 border border-white/20 transition cursor-pointer shrink-0"
            title="Закрыть"
            aria-label="Закрыть"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div
          className="px-5 sm:px-6 py-2.5 border-b flex flex-wrap gap-2 bg-transparent backdrop-blur-md"
          style={{ borderColor: hexToRgba(borderColor, 12) }}
        >
          {docsList.map((doc) => {
            const isActive = doc.type === meta.type;
            return (
              <button
                key={doc.type}
                type="button"
                onClick={() => setActiveDoc(doc.type)}
                className={`px-3 py-1.5 rounded-xl text-[14px] font-semibold border transition cursor-pointer ${
                  isActive
                    ? "bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] text-[#17344F] border-transparent"
                    : "bg-transparent text-slate-200 border-white/20 hover:border-[#E7C768]/60 hover:text-white"
                }`}
              >
                {doc.shortLabel}
              </button>
            );
          })}
        </div>

        <div className="overflow-y-auto px-5 sm:px-6 py-5 flex-1 space-y-4 text-[14px]">
          <LegalDocContent
            docType={meta.type}
            audience={audience}
            companyName={companyName}
            roleName={roleName}
          />
        </div>

        <div
          className="px-5 sm:px-6 py-4 border-t flex flex-wrap items-center justify-between gap-3 bg-transparent backdrop-blur-md"
          style={{ borderColor: hexToRgba(borderColor, 15) }}
        >
          <p className="text-[14px] text-slate-200">
            Документ действует в актуальной редакции на {meta.versionDate}.
          </p>
          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-[14px] font-bold text-slate-100 hover:text-white bg-transparent hover:bg-white/10 border border-white/20 cursor-pointer transition"
            >
              Закрыть
            </button>
            {onAccept && (
              <button
                type="button"
                onClick={() => {
                  onAccept();
                  onClose();
                }}
                className="px-5 py-2 rounded-xl text-[14px] font-bold bg-gradient-to-r from-[#FFE580] via-[#E7C768] to-[#C8A038] text-[#17344F] cursor-pointer shadow-md transition hover:brightness-110 active:scale-95"
              >
                Принимаю условия
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(modalContent, document.body) : modalContent;
}
