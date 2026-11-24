import { useId, useState } from "react";
import { LandingThemeConfig } from "../LandingStyleEditor";
import LegalDocDialog from "./LegalDocDialog";
import { LegalAudience, LegalDocType, getLegalDocsList } from "./legalDocsData";

interface LegalConsentBlockProps {
  mode: LegalAudience;
  checked?: boolean;
  onChange?: (value: boolean) => void;
  context?: "register" | "pay";
  companyName?: string;
  roleName?: string;
  themeConfig?: LandingThemeConfig | null;
  linksOnly?: boolean;
  className?: string;
}

export default function LegalConsentBlock({
  mode,
  checked = true,
  onChange,
  context = "register",
  companyName,
  roleName,
  themeConfig,
  linksOnly = false,
  className = "",
}: LegalConsentBlockProps) {
  const inputId = useId();
  const [openDoc, setOpenDoc] = useState<LegalDocType | null>(null);

  const accentColor = themeConfig?.btnActiveBgColor || themeConfig?.headingsSolidColor || "#E7C768";
  const bodyColor = themeConfig?.bodyTextColor || "#E2E8F0";

  const verb = context === "pay" ? "Оплачивая" : "Регистрируясь";
  const docs = getLegalDocsList(mode);

  const linkButton = (docType: LegalDocType, label: string) => (
    <button
      key={docType}
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setOpenDoc(docType);
      }}
      className="underline underline-offset-2 hover:opacity-80 cursor-pointer text-left inline font-semibold transition"
      style={{ color: accentColor }}
    >
      {label}
    </button>
  );

  return (
    <div className={`text-[14px] leading-relaxed ${className}`} style={{ color: bodyColor }}>
      {linksOnly ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {docs.map((doc) => linkButton(doc.type, doc.shortLabel))}
        </div>
      ) : (
        <div className="flex items-start gap-2.5 text-left">
          <input
            id={inputId}
            type="checkbox"
            checked={checked}
            onChange={(e) => onChange?.(e.target.checked)}
            className="mt-1 w-4 h-4 accent-[#E7C768] cursor-pointer flex-shrink-0 rounded"
          />
          <label htmlFor={inputId} className="leading-snug cursor-pointer select-none">
            {mode === "employer" ? (
              <>
                {verb}, я подтверждаю, что ознакомлен(а) с{" "}
                {linkButton("offer", "публичной офертой")},{" "}
                {linkButton("privacy", "политикой конфиденциальности")},{" "}
                {linkButton("terms", "пользовательским соглашением")} и даю{" "}
                {linkButton("consent", "согласие на обработку персональных данных")}.
              </>
            ) : (
              <>
                Регистрируясь и откликаясь на вакансию, я ознакомлен(а) и согласен(на) с{" "}
                {linkButton("privacy", "политикой конфиденциальности")},{" "}
                {linkButton("terms", "пользовательским соглашением")} и даю{" "}
                {linkButton("consent", "согласие на обработку персональных данных")}.
              </>
            )}
          </label>
        </div>
      )}

      <LegalDocDialog
        isOpen={openDoc !== null}
        docType={openDoc || (mode === "employer" ? "offer" : "privacy")}
        audience={mode}
        onClose={() => setOpenDoc(null)}
        onAccept={onChange ? () => onChange(true) : undefined}
        companyName={companyName}
        roleName={roleName}
        themeConfig={themeConfig}
      />
    </div>
  );
}
