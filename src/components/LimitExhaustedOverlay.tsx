import React from "react";
import Mascot from "@/components/Mascot";

export interface LimitExhaustedOverlayProps {
  kind: "interview" | "training";
  employer?: { name?: string | null; email?: string | null; phone?: string | null };
  onClose?: () => void;
}

const TITLES: Record<LimitExhaustedOverlayProps["kind"], string> = {
  interview: "Услуга проведения интервью не подключена",
  training:  "Услуга проведения обучения не подключена",
};

const SUBTITLES: Record<LimitExhaustedOverlayProps["kind"], string> = {
  interview: "Работодатель ещё не оплатил или исчерпал лимиты на интервью по этой вакансии. Свяжитесь с работодателем, чтобы он подключил услугу.",
  training:  "Работодатель ещё не оплатил или исчерпал лимиты на обучение по этой вакансии. Свяжитесь с работодателем, чтобы он подключил услугу.",
};

export const LimitExhaustedOverlay: React.FC<LimitExhaustedOverlayProps> = ({ kind, employer, onClose }) => {
  const name  = employer?.name?.trim() || "Работодатель";
  const email = employer?.email?.trim() || "";
  const phone = employer?.phone?.trim() || "";

  return (
    <div className="fixed inset-0 z-[9999] bg-transparent backdrop-blur-md flex items-center justify-center p-4">
      <div className="relative max-w-lg w-full rounded-3xl border border-[#E7C768]/40 bg-transparent backdrop-blur-2xl p-6 md:p-8 text-center shadow-2xl space-y-4 overflow-hidden">
        <div className="relative z-10 flex justify-center mb-2">
          <Mascot state="serious" size="lg" />
        </div>
        <h2 className="relative z-10 text-xl md:text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41]">
          {TITLES[kind]}
        </h2>
        <p className="relative z-10 text-sm text-white/90 leading-relaxed">
          {SUBTITLES[kind]}
        </p>
        <div className="relative z-10 bg-transparent border border-white/25 rounded-2xl p-4 text-left text-sm space-y-2 backdrop-blur-xl">
          <div className="text-sm font-bold text-[#E7C768]">Контакты работодателя</div>
          <div className="text-white font-bold text-sm">{name}</div>
          {email && (
            <div className="text-white/90 break-all text-sm">
              <span className="text-white/70">Email: </span>
              <a href={`mailto:${email}`} className="underline text-[#E7C768] hover:opacity-90">{email}</a>
            </div>
          )}
          {phone && (
            <div className="text-white/90 text-sm">
              <span className="text-white/70">Телефон: </span>
              <a href={`tel:${phone.replace(/[^\d+]/g, "")}`} className="underline text-[#E7C768] hover:opacity-90">{phone}</a>
            </div>
          )}
          {!email && !phone && (
            <div className="text-white/70 italic text-sm">Контакты не указаны. Уточните у работодателя напрямую.</div>
          )}
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="relative z-10 cursor-pointer mt-2 inline-flex items-center justify-center bg-transparent backdrop-blur-md text-white border border-white/25 hover:border-[#E7C768] text-sm font-bold px-5 py-2.5 rounded-xl transition"
          >
            Закрыть
          </button>
        )}
      </div>
    </div>
  );
};

export default LimitExhaustedOverlay;