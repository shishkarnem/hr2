import React, { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { MessageSquare, Send, X, Sparkles, ShieldCheck, User } from "lucide-react";
import Mascot from "./Mascot";
import AudioField from "./AudioField";
import CustomAudioPlayer from "./CustomAudioPlayer";
import { useAIWait } from "@/components/AIWaitProvider";

type Review = {
  id: string;
  first_name: string;
  last_name: string;
  content: string;
  audio_url?: string | null;
  ai_reply: string | null;
  admin_reply: string | null;
  created_at: string;
};

const DEFAULT_FALLBACK_REVIEWS: Review[] = [
  {
    id: "rev-default-1",
    first_name: "Алексей",
    last_name: "Громов",
    content: "Робот Рекрутер полностью закрыл нашу потребность в первичном отборе линейного персонала. Раньше тратили по 3-4 часа в день на созвоны, теперь кандидаты сами проходят интервью в чате и приходят уже с готовой объективной оценкой.",
    audio_url: null,
    ai_reply: "Спасибо за обратную связь, Алексей! Рады помогать автоматизировать рутину HR и экономить рабочее время вашей команды.",
    admin_reply: null,
    created_at: new Date().toISOString()
  },
  {
    id: "rev-default-2",
    first_name: "Екатерина",
    last_name: "Смирнова",
    content: "Отличный сервис! Очень порадовали ситуационные кейсы по методике STAR — сразу видно, как человек мыслит в стрессовых рабочих ситуациях. И отдельный плюс за встроенное корпоративное обучение.",
    audio_url: null,
    ai_reply: "Благодарим за высокую оценку, Екатерина! Методология STAR позволяет оценить реальные компетенции кандидата без человеческого фактора.",
    admin_reply: null,
    created_at: new Date().toISOString()
  },
  {
    id: "rev-default-3",
    first_name: "Михаил",
    last_name: "Васильев",
    content: "Удобный интерфейс, стильный дизайн и быстрая настройка вакансии. Запустили лендинг за 10 минут с помощью ИИ-генератора, на следующий день уже были первые прошедшие собеседование соискатели.",
    audio_url: null,
    ai_reply: "Михаил, спасибо за доверие! Рады, что генератор вакансий и умный лендинг помогли быстро запустить автонайм в вашей компании.",
    admin_reply: null,
    created_at: new Date().toISOString()
  }
];

export default function ReviewsSection() {
  const [rows, setRows] = useState<Review[]>(DEFAULT_FALLBACK_REVIEWS);
  const [open, setOpen] = useState(false);

  const load = async () => {
    try {
      const res = await fetch("/api/reviews");
      if (res.ok) {
        const data = await res.json().catch(() => null);
        if (Array.isArray(data) && data.length > 0) {
          setRows(data);
        }
      }
    } catch (e) {
      console.warn("Retrying to load reviews...");
      setTimeout(async () => {
        try {
          const res = await fetch("/api/reviews");
          if (res.ok) {
            const data = await res.json().catch(() => null);
            if (Array.isArray(data) && data.length > 0) setRows(data);
          }
        } catch {}
      }, 1500);
    }
  };
  useEffect(() => { load(); }, []);

  return (
    <section id="reviews" className="px-4 md:px-8 py-16 border-t border-white/10">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="text-center space-y-3">
          <h2 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-[#E7C768] to-[#F2D98A] bg-clip-text text-transparent">
            Отзывы
          </h2>
          <p className="text-slate-200 text-sm md:text-base max-w-2xl mx-auto">
            Что говорят пользователи о Роботе Рекрутере. Оставьте свой отзыв — это анонимно, нужно только указать имя и фамилию.
          </p>
          <button
            onClick={() => setOpen(true)}
            className="btn-brand-gold inline-flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm"
          >
            <MessageSquare className="w-4 h-4" /> Оставить отзыв
          </button>
        </div>

        {rows.length === 0 ? (
          <div className="text-center text-slate-300 py-10 text-sm">Пока нет отзывов — будьте первым.</div>
        ) : (
          <Carousel
            opts={{ loop: true, align: "start" }}
            className="w-full"
          >
            <CarouselContent className="-ml-4">
              {rows.map((r) => (
                <CarouselItem key={r.id} className="pl-4 basis-full md:basis-1/2 lg:basis-1/3">
                  <ReviewCard r={r} />
                </CarouselItem>
              ))}
            </CarouselContent>
            <CarouselPrevious className="left-0 md:-left-10 border-white/20 bg-transparent hover:bg-white/10 text-white hover:text-white" />
            <CarouselNext className="right-0 md:-right-10 border-white/20 bg-transparent hover:bg-white/10 text-white hover:text-white" />
          </Carousel>
        )}
      </div>

      {open && <ReviewModal onClose={() => setOpen(false)} onSaved={() => { setOpen(false); load(); }} />}
    </section>
  );
}

function ReviewCard({ r }: { r: Review }) {
  const date = new Date(r.created_at).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
  const initials = `${(r.first_name[0] || "?").toUpperCase()}${(r.last_name[0] || "").toUpperCase()}`;
  return (
    <article className="bg-transparent backdrop-blur-2xl border border-white/15 rounded-2xl p-5 space-y-3 h-full">
      <header className="flex items-center justify-between">
        <div>
          <div className="font-bold text-white text-base">{r.first_name} {r.last_name}</div>
          <div className="text-sm text-slate-300">{date}</div>
        </div>
        <div className="w-10 h-10 rounded-full bg-transparent border border-[#E7C768]/50 text-[#E7C768] flex items-center justify-center text-sm font-bold shadow-sm">
          {initials}
        </div>
      </header>
      <p className="text-slate-100 text-sm whitespace-pre-wrap">{r.content}</p>

      {r.audio_url && (
        <div className="my-2">
          <CustomAudioPlayer audioUrl={r.audio_url} />
        </div>
      )}

      {r.ai_reply && (
        <div className="mt-2 rounded-xl bg-transparent border border-[#E7C768]/40 p-3 space-y-1">
          <div className="text-sm font-bold inline-flex items-center gap-1 bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">
            <Sparkles className="w-3.5 h-3.5 text-[#E7C768]" /> Ответ ИИ Робота Рекрутера
          </div>
          <p className="text-slate-200 text-sm whitespace-pre-wrap">{r.ai_reply}</p>
        </div>
      )}
      {r.admin_reply && (
        <div className="mt-2 rounded-xl bg-transparent border border-[#E7C768]/40 p-3 space-y-1">
          <div className="text-sm font-bold inline-flex items-center gap-1 bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">
            <ShieldCheck className="w-3.5 h-3.5 text-[#E7C768]" /> Ответ команды HR-RR
          </div>
          <p className="text-sm whitespace-pre-wrap bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent font-medium">{r.admin_reply}</p>
        </div>
      )}
    </article>
  );
}

export function ReviewModal({ onClose, onSaved }: { onClose: () => void; onSaved?: () => void }) {
  const { run: aiWaitRun } = useAIWait();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [content, setContent] = useState("");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // User ID format demo{id}_RRfeed
  const [demoUserId] = useState(() => `demo${Math.floor(100000 + Math.random() * 900000)}`);

  const submit = async () => {
    setErr(null);
    const fn = firstName.trim(), ln = lastName.trim(), c = content.trim();
    if (!fn || !ln || !c) { setErr("Заполните все поля"); return; }
    if (c.length > 500) { setErr("Текст отзыва не должен превышать 500 символов"); return; }

    try {
      const resData = await aiWaitRun({
        title: "Проверка отзыва",
        task: async (attemptCount) => {
          const useProMax = attemptCount > 0;
          const res = await fetch("/api/reviews", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              first_name: fn,
              last_name: ln,
              content: c,
              audio_url: audioUrl,
              demo_user_id: demoUserId,
              use_promax: useProMax
            }),
          });

          if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.error || `Ошибка сервера (${res.status})`);
          }

          return await res.json();
        }
      });

      if (resData) {
        if (resData.approved === false || resData.censored) {
          setErr(resData.rejection_reason || resData.error || "Отзыв отклонен модерацией ИИ.");
          return;
        }

        if (resData.success && resData.approved !== false) {
          if (onSaved) onSaved();
          else onClose();
        }
      }
    } catch (e: any) {
      setErr(e?.message || "Не удалось отправить отзыв");
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-transparent" onClick={onClose}>
      <div className="bg-transparent backdrop-blur-2xl border border-white/20 text-white rounded-3xl max-w-lg w-full max-h-[92vh] overflow-y-auto p-6 sm:p-8 space-y-4 shadow-2xl relative text-left animate-in fade-in zoom-in duration-200" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onClose}
          className="absolute top-4 right-4 hover:bg-white/10 p-2 rounded-full text-slate-300 hover:text-white transition cursor-pointer"
          title="Закрыть"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="text-center flex flex-col items-center gap-1.5 pb-2 border-b border-white/10">
          <Mascot state="greeting" size="sm" />
          <h3 className="text-xl md:text-2xl font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent tracking-tight">
            Оставить отзыв
          </h3>
          <p className="text-sm text-slate-200">
            Поделитесь мнением о работе сервиса «Робот Рекрутер»
          </p>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="block">
              <span className="text-sm text-slate-200 font-bold">Имя</span>
              <div className="mt-1 flex items-center gap-2 bg-transparent border border-white/20 rounded-xl px-3 py-2.5">
                <User className="w-4 h-4 text-slate-300" />
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value.slice(0, 50))}
                  placeholder="Иван"
                  className="bg-transparent outline-none w-full text-sm text-white placeholder:text-slate-400"
                />
              </div>
            </label>
            <label className="block">
              <span className="text-sm text-slate-200 font-bold">Фамилия</span>
              <div className="mt-1 flex items-center gap-2 bg-transparent border border-white/20 rounded-xl px-3 py-2.5">
                <User className="w-4 h-4 text-slate-300" />
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value.slice(0, 50))}
                  placeholder="Иванов"
                  className="bg-transparent outline-none w-full text-sm text-white placeholder:text-slate-400"
                />
              </div>
            </label>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm text-slate-200 font-bold">Текст отзыва</span>
              <span className="text-sm text-slate-300 font-mono">{content.length}/500</span>
            </div>
            <AudioField
              value={content}
              onChange={(val) => setContent(val)}
              onAudioUrlChange={(url) => setAudioUrl(url)}
              placeholder="Поделитесь впечатлениями о работе сервиса или наговорите отзыв голосом..."
              maxLength={500}
            />
          </div>
        </div>

        {err && (
          <div className="bg-transparent border border-[#E7C768] p-3 text-sm text-[#E7C768] rounded-xl font-semibold leading-relaxed">
            {err}
          </div>
        )}

        <button
          type="button"
          onClick={submit}
          className="w-full bg-gradient-to-r from-[#FFE580] via-[#E7C768] to-[#C8A038] hover:brightness-110 active:scale-95 text-[#17344F] font-bold text-sm py-3 rounded-2xl flex items-center justify-center gap-2 transition cursor-pointer shadow-md"
        >
          <Send className="w-4 h-4" />
          Отправить отзыв
        </button>
      </div>
    </div>,
    document.body
  );
}
