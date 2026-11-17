/**
 * Публичная страница с офертой по адресу /offer и /oferta.
 * Динамически подставляет текущий домен (hr-rr.ru или hr-rr.online).
 */
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import OfferContent from "@/components/OfferContent";

export default function OfferPage() {
  const navigate = useNavigate();

  // Dynamic host detection (hr-rr.ru, hr-rr.online, localhost)
  let currentDomain = "hr-rr.online";
  if (typeof window !== "undefined") {
    const host = window.location.hostname.toLowerCase();
    if (host.includes("hr-rr.ru")) {
      currentDomain = "hr-rr.ru";
    } else if (host.includes("hr-rr.online")) {
      currentDomain = "hr-rr.online";
    } else if (host) {
      currentDomain = host;
    }
  }

  return (
    <div className="min-h-screen bg-[#17344F] text-white">
      <header className="border-b border-white/10 bg-[#17344F]">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <button 
            type="button"
            onClick={() => navigate("/")} 
            className="flex items-center gap-2 text-[14px] font-bold text-slate-200 hover:text-[#E7C768] cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" /> На главную
          </button>
          <span className="text-[14px] text-[#E7C768] font-mono lowercase">
            {currentDomain}
          </span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-10">
        <OfferContent />
      </main>

      <footer className="border-t border-white/10 bg-[#17344F] mt-8">
        <div className="max-w-4xl mx-auto px-4 py-6 text-[14px] text-slate-400 leading-relaxed text-center">
          ООО «РентРоп» · ИНН 7726477438 · ОГРН 1217700234157 ·
          115191, г. Москва, пер. Духовской, д. 17, стр. 15, помещ. 11Н/2 ·
          <a href="mailto:info@arenda-ropa.com" className="text-[#E7C768] hover:underline ml-1">info@arenda-ropa.com</a>
        </div>
      </footer>
    </div>
  );
}