/**
 * Публичная страница юридических документов платформы:
 * /offer, /oferta, /privacy, /terms, /agreement, /consent,
 * а также /candidate-privacy, /candidate-terms, /candidate-consent.
 */
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import {
  LegalAudience,
  LegalDocContent,
  LegalDocType,
  getCurrentLegalDomain,
  getLegalDocsList,
} from "@/components/legal/legalDocsData";

interface OfferPageProps {
  docType?: LegalDocType;
  audience?: LegalAudience;
}

export default function OfferPage({ docType = "offer", audience = "employer" }: OfferPageProps) {
  const navigate = useNavigate();
  const currentDomain = getCurrentLegalDomain();
  const docsList = getLegalDocsList(audience);

  return (
    <div className="min-h-screen bg-transparent text-white flex flex-col justify-between">
      <div>
        <header className="border-b border-white/15 bg-transparent backdrop-blur-2xl sticky top-0 z-20">
          <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => navigate("/")}
              className="flex items-center gap-2 text-[14px] font-bold text-slate-200 hover:text-[#E7C768] cursor-pointer transition"
            >
              <ArrowLeft className="w-4 h-4" /> На главную
            </button>
            <span className="text-[14px] text-[#E7C768] font-mono lowercase">
              {currentDomain}
            </span>
          </div>
        </header>

        <nav className="max-w-4xl mx-auto px-4 pt-6 flex flex-wrap gap-2">
          {docsList.map((doc) => {
            const active = doc.type === docType;
            return (
              <button
                key={doc.route}
                type="button"
                onClick={() => navigate(doc.route)}
                className={`px-3.5 py-2 rounded-xl text-[14px] font-semibold border transition cursor-pointer backdrop-blur-md ${
                  active
                    ? "bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] text-[#17344F] border-transparent"
                    : "bg-transparent text-slate-200 border-white/20 hover:border-[#E7C768]/60 hover:text-white"
                }`}
              >
                {doc.shortLabel}
              </button>
            );
          })}
        </nav>

        <main className="max-w-4xl mx-auto px-4 py-8">
          <LegalDocContent docType={docType} audience={audience} />
        </main>
      </div>

      <footer className="border-t border-white/15 bg-transparent backdrop-blur-xl mt-8">
        <div className="max-w-4xl mx-auto px-4 py-6 text-[14px] text-slate-300 leading-relaxed text-center space-y-2">
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
            {docsList.map((doc) => (
              <a key={doc.route} href={doc.route} className="text-[#E7C768] hover:underline">
                {doc.shortLabel}
              </a>
            ))}
          </div>
          <div>
            ООО «РентРоп» · ИНН 7726477438 · ОГРН 1217700234157 ·
            115191, г. Москва, пер. Духовской, д. 17, стр. 15, помещ. 11Н/2 ·
            <a href="mailto:info@arenda-ropa.com" className="text-[#E7C768] hover:underline ml-1">info@arenda-ropa.com</a>
          </div>
        </div>
      </footer>
    </div>
  );
}