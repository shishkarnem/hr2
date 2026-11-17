/**
 * Страницы возврата с платёжки Робокассы.
 * /payment/success и /payment/fail.
 */
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import RRImage from "@/components/RRImage";
import { dbClient } from "@/lib/dbClient";

const IMG_SUCCESS = "/files/6/rr5.png";
const IMG_FAIL = "/files/10/rr9.png";

function Requisites() {
  return (
    <div className="text-[14px] text-slate-300 leading-relaxed text-center mt-8 max-w-2xl mx-auto">
      ООО «РентРоп» · ИНН 7726477438 · ОГРН 1217700234157 · Система налогообложения ОСН (НДС 5%) ·
      115191, г. Москва, пер. Духовской, д. 17, стр. 15, помещ. 11Н/2 ·{" "}
      <a href="mailto:info@arenda-ropa.com" className="text-[#E7C768] hover:underline">info@arenda-ropa.com</a>
    </div>
  );
}

export function PaymentSuccessPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const invId = Number(params.get("InvId") || params.get("inv_id") || 0);
  const [status, setStatus] = useState<"pending" | "paid" | "unknown">(invId ? "pending" : "unknown");
  const [amount, setAmount] = useState<number | null>(null);

  useEffect(() => {
    if (!invId) return;
    let cancelled = false;
    let tries = 0;
    const poll = async () => {
      tries += 1;
      const { data } = await dbClient
        .from("payments_robokassa")
        .select("status, amount_rub")
        .eq("inv_id", invId)
        .maybeSingle();
      if (cancelled) return;
      if (data?.amount_rub != null) setAmount(data.amount_rub);
      if (data?.status === "paid" || data?.status === "completed" || data?.status === "success") { setStatus("paid"); return; }
      if (tries < 20) setTimeout(poll, 3000);
    };
    poll();
    return () => { cancelled = true; };
  }, [invId]);

  const isPaid = status === "paid";

  return (
    <div className="min-h-screen bg-transparent text-white flex flex-col items-center justify-center px-4 py-10">
      <div className="bg-transparent backdrop-blur-2xl border border-[#d4af37]/60 rounded-3xl p-8 md:p-10 max-w-md w-full text-center shadow-2xl space-y-5">
        <RRImage src={IMG_SUCCESS} w={192} alt="Оплата прошла" className="w-48 h-48 object-contain mx-auto" />
        {isPaid ? (
          <>
            <div className="flex items-center justify-center gap-2 text-[#fceabb]">
              <CheckCircle2 className="w-6 h-6 text-[#E7C768]" />
              <h1 className="text-2xl font-black bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">Оплата прошла, RR зачислены</h1>
            </div>
            <p className="text-[14px] text-white/90">
              {amount ? `На ваш баланс зачислено ${amount} RR.` : "Цифровые единицы RR зачислены на ваш баланс."}{" "}
              Если в течение нескольких минут баланс не обновился, обновите страницу личного кабинета.
            </p>
          </>
        ) : (
          <>
            <div className="flex items-center justify-center gap-2 text-[#fceabb]">
              <Loader2 className="w-6 h-6 animate-spin text-[#E7C768]" />
              <h1 className="text-2xl font-black bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">Платёж получен, зачисление обрабатывается</h1>
            </div>
            <p className="text-[14px] text-white/80">
              Банк подтверждает оплату. Обычно это занимает несколько секунд.
              Страница обновится автоматически, как только RR появятся на балансе.
            </p>
          </>
        )}
        <button
          onClick={() => navigate("/employer")}
          className="w-full bg-gradient-to-r from-[#FFE580] via-[#E7C768] to-[#C8A038] text-[#17344F] font-bold text-[14px] py-3.5 rounded-2xl hover:brightness-110 transition shadow-lg"
        >
          Вернуться в личный кабинет
        </button>
      </div>
      <Requisites />
    </div>
  );
}

export function PaymentFailPage() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-transparent text-white flex flex-col items-center justify-center px-4 py-10">
      <div className="bg-transparent backdrop-blur-2xl border border-white/20 rounded-3xl p-8 md:p-10 max-w-md w-full text-center shadow-2xl space-y-5">
        <RRImage src={IMG_FAIL} w={192} alt="Оплата не прошла" className="w-48 h-48 object-contain mx-auto" />
        <div className="flex items-center justify-center gap-2 text-white">
          <XCircle className="w-6 h-6 text-white/70" />
          <h1 className="text-2xl font-black bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">Оплата не завершена</h1>
        </div>
        <p className="text-[14px] text-white/80">
          К сожалению, платёж не был завершён. Денежные средства не списаны.
          Вы можете попробовать оплатить ещё раз в личном кабинете.
        </p>
        <button
          onClick={() => navigate("/employer")}
          className="w-full bg-transparent hover:border-[#d4af37] border border-white/30 text-white font-bold text-[14px] py-3.5 rounded-2xl transition shadow-lg backdrop-blur-md"
        >
          Вернуться в счета
        </button>
      </div>
      <Requisites />
    </div>
  );
}