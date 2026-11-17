/**
 * Лендинг работодателя — Google-only регистрация, бонус 1000 RR (10 ед.),
 * три карточки услуг и калькулятор Робот vs HR.
 */
import React, { useState, useEffect } from "react";
import RRImage from "@/components/RRImage";
import { DEFAULT_RR_LOGO_URL } from "@/lib/img";
import SiteHeader from "@/components/SiteHeader";
import { useRouter } from "../components/RouterContext";
import Mascot from "../components/Mascot";
import AuthModal from "../components/AuthModal";
import HiringCalculator from "../components/HiringCalculator";
import EmployerAIAssistant from "../components/EmployerAIAssistant";
import PublicMobileNavbar from "@/components/PublicMobileNavbar";
import ReviewsSection from "../components/ReviewsSection";
import ProTalkVoiceDemo from "../components/ProTalkVoiceDemo";
import Reveal from "../components/Reveal";
import LandingPreloader from "../components/LandingPreloader";
import { dbClient } from "@/lib/dbClient";
import { resolveProfilePathForUser } from "@/lib/links";
import { resetEmployerSessionAndCache } from "@/lib/cacheReset";
import { MASCOT } from "@/lib/mascotImages";
import {
  LogIn,
  ArrowRight,
  Sparkles,
  Globe,
  MessageSquare,
  GraduationCap,
  Menu,
  X,
  Gift,
  LogOut,
  LayoutDashboard,
  Play,
  Briefcase,
  Search,
  Building2,
  Rocket,
  CheckCircle2,
  Zap,
  BookOpen,
} from "lucide-react";

export default function LandingPage() {
  const { navigate, path } = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(path === "/auth");
  const [authedUserId, setAuthedUserId] = useState<string | null>(null);
  const [profilePath, setProfilePath] = useState<string>("/");
  const [appVersion, setAppVersion] = useState<string>("v.2.30");
  const [isPreloading, setIsPreloading] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem("landing_cached") !== "1";
    } catch {
      return true;
    }
  });

  useEffect(() => {
    // Clear employer login session, tokens, and cache on visiting the root landing page /
    resetEmployerSessionAndCache();
    sessionStorage.removeItem("sysadmin_password");
    try {
      localStorage.removeItem("emp_token");
      localStorage.removeItem("emp_user");
      localStorage.removeItem("cand_session");
    } catch {}
    dbClient.auth.signOut().catch(() => {});
    setAuthedUserId(null);
    setProfilePath("/");

    fetch("/api/app-version")
      .then((r) => r.json())
      .then((d) => {
        if (d?.version) setAppVersion(String(d.version));
      })
      .catch(() => {});
  }, []);

  const handleLogout = async () => {
    await dbClient.auth.signOut();
    setAuthedUserId(null);
    setProfilePath("/");
  };
  const isAuthed = !!authedUserId;

  const handleOpenCabinet = async () => {
    try {
      const { data: { user } } = await dbClient.auth.getUser();
      if (user) {
        const target = await resolveProfilePathForUser(user.id);
        if (target && target !== "/") {
          try { sessionStorage.setItem("show_employer_entry_loader", "1"); } catch {}
          navigate(target);
          return;
        }
      }
    } catch { /* ignore */ }
    setIsAuthModalOpen(true);
  };

  return (
    <div className="bg-gradient-to-b from-[#17344F]/65 via-[#1E4468]/50 to-[#265582]/65 min-h-screen text-white font-sans antialiased flex flex-col overflow-x-hidden relative">
      {isPreloading && (
        <LandingPreloader
          onComplete={() => {
            try {
              sessionStorage.setItem("landing_cached", "1");
            } catch {}
            setIsPreloading(false);
          }}
        />
      )}
      <SiteHeader active="home" />

      {/* Hero */}
      <Reveal as="section" direction="fade" className="px-4 md:px-8 pt-3 md:pt-4 pb-12 md:pb-16 max-w-7xl mx-auto w-full">
        <div className="grid lg:grid-cols-12 gap-10 items-center">
          <Reveal direction="left" className="lg:col-span-7 space-y-6">
            <div className="inline-flex items-center gap-2 bg-[#E7C768]/15 border border-[#E7C768]/30 rounded-full px-4 py-2 backdrop-blur-md">
              <Sparkles className="w-4 h-4 text-[#E7C768]" />
              <span className="text-xs font-semibold text-[#E7C768] uppercase tracking-wider">Сервис ИИ-Найма</span>
            </div>

            <h1 className="text-4xl md:text-6xl font-bold tracking-tight leading-tight">
              Робот Рекрутер заменяет{" "}
              <span className="bg-gradient-to-r from-[#F4EE8E] to-[#D99E41] bg-clip-text text-transparent">весь функционал HR</span>
            </h1>

            <p className="text-gray-200 text-base md:text-lg leading-relaxed max-w-2xl">
              Подключите кандидатов, проведите ИИ-собеседование, оцените и обучите — в пару кликов и без HR-отдела.
            </p>

            <div className="bg-transparent border border-[#E7C768]/40 rounded-2xl p-5 space-y-3 max-w-2xl shadow-xl">
              <div className="flex items-center gap-2 font-bold">
                <Gift className="w-5 h-5 text-[#E7C768]" />
                <span className="bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">+1000 RR в подарок при регистрации</span>
              </div>
              <p className="text-sm text-slate-200 leading-relaxed">
                Этого хватит на полный AI-цикл найма в пару кликов:
              </p>
              <ul className="text-sm text-slate-200 space-y-1.5 pl-2">
                <li>🌐 <strong>ИИ-Лендинг вакансии</strong> — 500 RR (готовый сайт-визитка с умным чат-консультантом)</li>
                <li>⚙️ <strong>ИИ-Система Интервью</strong> — 200 RR (сценарии, скоринг, ситуативные тесты)</li>
                <li>🎓 <strong>ИИ-Система Обучения</strong> — 300 RR (индивидуальный симулятор онбординга)</li>
              </ul>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              {isAuthed ? (
                <button
                  onClick={() => navigate(profilePath)}
                  className="cursor-pointer bg-[#E7C768] text-[#17344F] font-bold text-base px-6 py-4 rounded-xl shadow-xl hover:-translate-y-0.5 transition flex items-center justify-center gap-2"
                >
                  <LayoutDashboard className="w-5 h-5" /> Перейти в кабинет
                </button>
              ) : (
                <button
                  onClick={() => setIsAuthModalOpen(true)}
                  className="cursor-pointer bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#CBA335] text-[#17344F] font-extrabold text-base px-6 py-4 rounded-xl shadow-xl hover:-translate-y-0.5 transition flex items-center justify-center gap-2"
                >
                  <LogIn className="w-5 h-5 text-[#17344F]" /> Войти · +1000 RR
                </button>
              )}
              <button
                onClick={() => navigate("/demo")}
                className="cursor-pointer flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/20 text-white font-semibold text-sm px-6 py-4 rounded-xl transition"
              >
                <Play className="w-4 h-4 text-[#E7C768]" /> Пройти демо-интервью бесплатно
              </button>
            </div>
          </Reveal>

          <Reveal direction="right" delay={150} className="lg:col-span-5 flex justify-center">
            <div className="bg-[#1E4468]/60 backdrop-blur-xl rounded-3xl p-8 border border-white/20 w-full max-w-md shadow-2xl flex flex-col items-center">
              <Mascot state="greeting" size="lg" speechBubble="Привет! Я — Робот Рекрутер. Помогу нанять и обучить персонал за минуты!" />
              <div className="w-full h-px bg-white/10 my-6" />
              <div className="grid grid-cols-2 gap-4 w-full">
                <div className="bg-white/5 backdrop-blur-md p-3 rounded-xl border border-white/10 text-center">
                  <div className="text-[#E7C768] font-bold text-xl">×{4} дешевле</div>
                  <div className="text-xs text-slate-300">чем живой HR</div>
                </div>
                <div className="bg-white/5 backdrop-blur-md p-3 rounded-xl border border-white/10 text-center">
                  <div className="bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent font-bold text-xl">×27 быстрее</div>
                  <div className="text-xs text-slate-300">по времени</div>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </Reveal>

      {/* DEMO PROMO — главный CTA для всех посетителей */}
      <Reveal as="section" direction="up" className="px-4 md:px-8 py-16 border-y border-white/10 bg-transparent">
        <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-10 items-center">
          <Reveal direction="left" className="space-y-5">
            <div className="inline-flex items-center gap-2 bg-transparent border border-[#E7C768]/30 rounded-full px-3 py-1.5 backdrop-blur-md">
              <Play className="w-4 h-4 text-[#E7C768]" />
              <span className="text-[11px] font-bold text-[#E7C768] uppercase tracking-wider">Без регистрации · бесплатно</span>
            </div>
            <h2 className="text-3xl md:text-5xl font-bold leading-tight">
              Оцените в действии — <span className="bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">пройдите ИИ-интервью</span>
            </h2>
            <p className="text-base text-slate-200">
              Выберите любую должность из каталога — ИИ за минуту сгенерирует под неё ролевую ситуацию, чек-лист и оценит ваше резюме.
              Так вы увидите, как Робот Рекрутер работает с вашими будущими кандидатами.
            </p>
            <div className="grid grid-cols-3 gap-3">
              <DemoStepCard mascot={MASCOT.serious}  step="1" label="Ситуация"  hint="Ролевая сцена" />
              <DemoStepCard mascot={MASCOT.question} step="2" label="Чек-лист"  hint="Проверка знаний" />
              <DemoStepCard mascot={MASCOT.clock}    step="3" label="Резюме"    hint="Скрининг ИИ" />
            </div>
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                onClick={() => navigate("/demo")}
                className="cursor-pointer bg-gradient-to-r from-[#E7C768] to-[#D99E41] text-[#17344F] font-bold text-base px-6 py-4 rounded-xl shadow-xl hover:-translate-y-0.5 transition flex items-center justify-center gap-2"
              >
                <Play className="w-5 h-5" /> Запустить демо-интервью
              </button>
              <button
                onClick={() => document.getElementById("tariffs")?.scrollIntoView({ behavior: "smooth" })}
                className="bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/20 text-white font-semibold text-sm px-5 py-4 rounded-xl flex items-center justify-center gap-2"
              >
                Я работодатель — посмотреть сравнение <ArrowRight className="w-4 h-4 text-[#E7C768]" />
              </button>
            </div>
          </Reveal>
          <Reveal direction="right" delay={120} className="bg-transparent border border-white/20 rounded-3xl p-6 space-y-3">
            <div className="text-xs uppercase font-mono font-bold text-white">Как это выглядит</div>
            <div className="bg-transparent border border-white/15 rounded-xl p-4 text-sm text-white italic">
              «Клиент говорит: «У вас слишком дорого, у конкурентов дешевле на 15%». Что вы ответите?»
            </div>
            <div className="bg-transparent border border-white/15 rounded-xl p-4 text-sm text-white">
              <div className="text-[10px] font-bold text-white uppercase">Оценка ИИ</div>
              <div className="text-2xl font-extrabold text-white mt-1">82/100</div>
              <div className="text-xs text-white mt-1">Чётко выстроен аргумент через ценность, не уходишь в скидку, удерживаешь позицию.</div>
            </div>
            <button onClick={() => navigate("/demo")} className="w-full bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] text-[#17344F] font-extrabold text-sm py-3 rounded-xl shadow inline-flex items-center justify-center gap-2 cursor-pointer">
              <Play className="w-4 h-4 text-[#17344F]" /> Попробовать с моей должностью
            </button>
          </Reveal>
        </div>
      </Reveal>

      {/* VACANCIES SHOWCASE — для соискателей и работодателей */}
      <Reveal
        as="section"
        direction="up"
        id="vacancies"
        aria-labelledby="vacancies-title"
        className="px-4 md:px-8 py-20 border-t border-white/10 bg-gradient-to-b from-[#17344F]/50 to-[#1E4468]/40 backdrop-blur-sm"
      >
        <div className="max-w-7xl mx-auto">
          <Reveal as="header" direction="down" className="text-center max-w-3xl mx-auto mb-12 space-y-4">
            <div className="inline-flex items-center gap-2 bg-transparent border border-[#E7C768]/30 rounded-full px-3 py-1.5 backdrop-blur-md">
              <Sparkles className="w-4 h-4 text-[#E7C768]" />
              <span className="text-[11px] font-bold text-[#E7C768] uppercase tracking-wider">Новое · Каталог вакансий открыт всем</span>
            </div>
            <h2 id="vacancies-title" className="text-3xl md:text-5xl font-bold leading-tight">
              Найти работу через ИИ —{" "}
              <span className="bg-gradient-to-r from-[#F4EE8E] to-[#D99E41] bg-clip-text text-transparent">бесплатно и без HR</span>
            </h2>
            <p className="text-slate-200 text-base md:text-lg">
              Каталог всех активных вакансий со всех компаний платформы. Откликайтесь и проходите ИИ-собеседование напрямую — без рекрутёров,
              без анкет «расскажите о себе» и без многонедельных ожиданий. А работодатели видят, как должна выглядеть современная система найма,
              на живых примерах — и собирают такую же за 5 минут вместе с нейросетью.
            </p>
          </Reveal>

          <div className="grid lg:grid-cols-2 gap-6">
            {/* Соискателю */}
            <Reveal as="article" direction="left" className="relative overflow-hidden rounded-3xl bg-transparent backdrop-blur-xl border border-[#E7C768]/40 p-7 md:p-9 flex flex-col gap-5 shadow-2xl">
              <div className="flex items-start gap-5">
                <img
                  src={MASCOT.shine}
                  alt="Робот Рекрутер радуется — кандидат нашёл работу через ИИ"
                  width={120}
                  height={120}
                  loading="lazy"
                  decoding="async"
                  className="w-24 h-24 md:w-32 md:h-32 object-contain drop-shadow-2xl flex-shrink-0"
                />
                <div className="space-y-2">
                  <div className="inline-flex items-center gap-2 bg-transparent border border-[#E7C768]/30 rounded-full px-3 py-1 backdrop-blur-md">
                    <Search className="w-3.5 h-3.5 text-[#E7C768]" />
                    <span className="text-[10px] font-bold text-[#E7C768] uppercase tracking-wider">Для соискателей</span>
                  </div>
                  <h3 className="text-2xl md:text-3xl font-bold text-white leading-tight">
                    Откликайся за минуту и проходи интервью с ИИ
                  </h3>
                </div>
              </div>
              <ul className="space-y-2.5 text-sm md:text-base text-slate-100">
                <li className="flex items-start gap-2"><CheckCircle2 className="w-5 h-5 text-[#E7C768] flex-shrink-0 mt-0.5" /> Все активные вакансии всех компаний в одном каталоге</li>
                <li className="flex items-start gap-2"><CheckCircle2 className="w-5 h-5 text-[#E7C768] flex-shrink-0 mt-0.5" /> Умный поиск по должности, отрасли, окладу и графику</li>
                <li className="flex items-start gap-2"><CheckCircle2 className="w-5 h-5 text-[#E7C768] flex-shrink-0 mt-0.5" /> ИИ оценивает резюме, диалог и ситуативные кейсы — без живого HR</li>
                <li className="flex items-start gap-2"><CheckCircle2 className="w-5 h-5 text-[#E7C768] flex-shrink-0 mt-0.5" /> Ответ от работодателя — в тот же день, не через две недели</li>
              </ul>
              <div className="flex flex-col sm:flex-row gap-3 mt-auto pt-2">
                <button
                  onClick={() => navigate("/vacancy")}
                  className="cursor-pointer inline-flex items-center justify-center gap-2 bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] text-[#17344F] font-extrabold text-base px-6 py-4 rounded-xl shadow-xl hover:-translate-y-0.5 transition"
                >
                  <Briefcase className="w-5 h-5 text-[#17344F]" /> Каталог вакансий
                </button>
                <button
                  onClick={() => navigate("/demo")}
                  className="inline-flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/20 text-white font-semibold text-sm px-5 py-4 rounded-xl transition cursor-pointer"
                >
                  <Play className="w-4 h-4 text-[#E7C768]" /> Сначала демо-интервью
                </button>
              </div>
            </Reveal>

            {/* Работодателю */}
            <Reveal as="article" direction="right" delay={120} className="relative overflow-hidden rounded-3xl bg-transparent backdrop-blur-xl border border-[#E7C768]/40 p-7 md:p-9 flex flex-col gap-5 shadow-2xl">
              <div className="flex items-start gap-5">
                <img
                  src={MASCOT.success}
                  alt="Робот Рекрутер показывает готовую систему найма для работодателя"
                  width={120}
                  height={120}
                  loading="lazy"
                  decoding="async"
                  className="w-24 h-24 md:w-32 md:h-32 object-contain drop-shadow-2xl flex-shrink-0"
                />
                <div className="space-y-2">
                  <div className="inline-flex items-center gap-2 bg-[#E7C768]/20 border border-[#E7C768]/40 rounded-full px-3 py-1 backdrop-blur-md">
                    <Building2 className="w-3.5 h-3.5 text-[#E7C768]" />
                    <span className="text-[10px] font-bold text-[#E7C768] uppercase tracking-wider">Для работодателей</span>
                  </div>
                  <h3 className="text-2xl md:text-3xl font-bold text-white leading-tight">
                    Посмотри живые примеры — и собери такую же за 5 минут
                  </h3>
                </div>
              </div>
              <ul className="space-y-2.5 text-sm md:text-base text-slate-100">
                <li className="flex items-start gap-2"><CheckCircle2 className="w-5 h-5 text-[#E7C768] flex-shrink-0 mt-0.5" /> Готовые лендинги вакансий: дизайн, чат-консультант, описания, условия</li>
                <li className="flex items-start gap-2"><CheckCircle2 className="w-5 h-5 text-[#E7C768] flex-shrink-0 mt-0.5" /> Сценарии ИИ-интервью со скорингом и ситуативными кейсами под отрасль</li>
                <li className="flex items-start gap-2"><CheckCircle2 className="w-5 h-5 text-[#E7C768] flex-shrink-0 mt-0.5" /> Системы онбординга и обучения с тестами и тренажёрами</li>
                <li className="flex items-start gap-2"><CheckCircle2 className="w-5 h-5 text-[#E7C768] flex-shrink-0 mt-0.5" /> Нет своей вакансии и материалов? RR соберёт всё с нуля — нужна только должность</li>
              </ul>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl py-2">
                  <div className="text-[#E7C768] font-extrabold text-lg">5 мин</div>
                  <div className="text-[10px] text-slate-300 uppercase tracking-wider">на запуск</div>
                </div>
                <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl py-2">
                  <div className="bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent font-extrabold text-lg">0 ₽</div>
                  <div className="text-[10px] text-slate-300 uppercase tracking-wider">на старт</div>
                </div>
                <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl py-2">
                  <div className="bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent font-extrabold text-lg">+1000 RR</div>
                  <div className="text-[10px] text-slate-300 uppercase tracking-wider">бонус</div>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 mt-auto pt-2">
                <button
                  onClick={() => navigate("/vacancy")}
                  className="inline-flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/20 text-white font-semibold text-sm px-5 py-4 rounded-xl transition cursor-pointer"
                >
                  <Briefcase className="w-4 h-4 text-[#E7C768]" /> Смотреть примеры
                </button>
                <button
                  onClick={isAuthed ? () => navigate(profilePath) : handleOpenCabinet}
                  className="cursor-pointer inline-flex items-center justify-center gap-2 bg-gradient-to-r from-[#E7C768] to-[#D99E41] text-[#17344F] font-bold text-base px-6 py-4 rounded-xl shadow-xl hover:-translate-y-0.5 transition"
                >
                  <Rocket className="w-5 h-5" /> Создать свою за 5 минут
                </button>
              </div>
              <p className="text-[11px] text-slate-300/80 flex items-center gap-1.5">
                <Zap className="w-3 h-3 text-[#E7C768]" /> Нейросеть сама напишет вакансию, чек-листы и материалы обучения
              </p>
            </Reveal>
          </div>
        </div>
      </Reveal>

      {/* 3 product cards */}
      <Reveal as="section" direction="up" className="px-4 md:px-8 py-16 max-w-7xl mx-auto w-full border-t border-white/10">
        <div className="text-center mb-12 space-y-2">
          <h2 className="text-3xl md:text-4xl font-extrabold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">Полный AI-цикл найма</h2>
          <p className="text-slate-300 text-sm md:text-base">Три блока — настраиваются в пару кликов под вашу вакансию</p>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {[
            { icon: Globe, title: "ИИ-Лендинг вакансии", price: "500 RR", desc: "Готовый сайт-визитка с умным чат-консультантом по вашей базе знаний. Поможет соискателю узнать всё о компании и принять решение." },
            { icon: MessageSquare, title: "ИИ-Система Интервью", price: "200 RR", desc: "Сценарии диалога с кандидатом, детальный скоринг и ситуативные тесты под вашу сферу." },
            { icon: GraduationCap, title: "ИИ-Система Обучения", price: "300 RR", desc: "Индивидуальный симулятор онбординга: профессиональное дообучение, обучение продукту и процессам." },
          ].map(({ icon: Icon, title, price, desc }, i) => (
            <Reveal key={title} direction="up" delay={i * 120} className="bg-transparent backdrop-blur-xl rounded-2xl p-6 border border-white/15 hover:border-[#E7C768] transition flex flex-col gap-4 shadow-xl">
              <div className="flex items-start justify-between">
                <div className="w-12 h-12 rounded-xl bg-[#E7C768]/15 flex items-center justify-center text-[#E7C768]">
                  <Icon className="w-6 h-6" />
                </div>
                <span className="bg-transparent border border-[#E7C768]/40 text-[#E7C768] text-xs font-mono font-extrabold px-2.5 py-1 rounded-full bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">{price}</span>
              </div>
              <h3 className="text-lg font-bold text-[#E7C768]">{title}</h3>
              <p className="text-sm text-slate-200 leading-relaxed">{desc}</p>
            </Reveal>
          ))}
        </div>
      </Reveal>

      {/* Calculator */}
      <Reveal as="section" direction="scale" id="tariffs" className="px-4 md:px-8 py-16 bg-[#1E4468]/30 backdrop-blur-md border-t border-b border-white/10">
        <div className="max-w-5xl mx-auto space-y-8">
          <div className="text-center space-y-3">
            <p className="text-gray-300 text-sm md:text-base max-w-2xl mx-auto">
              Выберите количество готовых сотрудников — мы покажем стоимость и время для двух сценариев.
            </p>
          </div>
          <HiringCalculator />
        </div>
      </Reveal>

      {/* Interactive ProTalk Voice STT & AI Demo */}
      <Reveal direction="up">
        <ProTalkVoiceDemo />
      </Reveal>

      {/* Reviews */}
      <Reveal direction="up"><ReviewsSection /></Reveal>

      {/* CTA */}
      <Reveal as="section" direction="up" className="px-4 md:px-8 py-16 max-w-4xl mx-auto text-center space-y-6">
        <img
          src={MASCOT.megaphone} alt="Робот Рекрутер с рупором"
          width={160} height={160} loading="lazy" decoding="async"
          className="w-32 h-32 md:w-40 md:h-40 object-contain mx-auto drop-shadow-2xl"
        />
        <h2 className="text-3xl md:text-4xl font-bold">Готовы автоматизировать найм?</h2>
        {isAuthed ? (
          <>
            <p className="text-slate-300">Ваш кабинет открыт и готов к работе.</p>
            <button
              onClick={() => navigate(profilePath)}
              className="cursor-pointer inline-flex items-center gap-2 bg-[#E7C768] text-[#17344F] font-bold text-base px-8 py-4 rounded-xl shadow-xl hover:-translate-y-0.5 transition"
            >
              <LayoutDashboard className="w-5 h-5" /> Перейти в кабинет
            </button>
          </>
        ) : (
          <>
            <p className="text-slate-300">Регистрация — 1 клик. Бонус +1000 RR уже на счёте.</p>
            <button
              onClick={() => setIsAuthModalOpen(true)}
              className="cursor-pointer inline-flex items-center gap-2 bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#CBA335] text-[#17344F] font-extrabold text-base px-8 py-4 rounded-xl shadow-xl hover:-translate-y-0.5 transition"
            >
              <LogIn className="w-5 h-5 text-[#17344F]" /> Войти
            </button>
          </>
        )}
      </Reveal>

      {/* Footer */}
      <footer className="bg-transparent text-white py-12 px-4 md:px-8 border-t border-[#E7C768]/40 text-sm">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-8 text-left">
          {/* Бренд */}
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <RRImage src={DEFAULT_RR_LOGO_URL} w={40} alt="Логотип Робот Рекрутер" className="w-10 h-10 object-contain" referrerPolicy="no-referrer" />
              <div className="font-bold text-sm text-[#E7C768]">
                © 2026 Робот Рекрутер {appVersion}
                <span className="text-sm text-slate-300 block font-normal mt-0.5">Полная автоматизация интервью и обучения</span>
              </div>
            </div>
          </div>

          {/* Реквизиты */}
          <div className="space-y-2 text-sm text-slate-300 leading-relaxed md:col-span-2">
            <h3 className="text-sm tracking-widest text-[#E7C768] font-mono font-bold">Реквизиты</h3>
            <p className="font-bold text-white">ООО «РентРоп»</p>
            <p>Юридический адрес: 115191, г. Москва, пер. Духовской, д. 17, стр. 15, помещ. 11Н/2</p>
            <p>ОГРН: 1217700234157 · ИНН: 7726477438</p>
            <p>
              E-mail: <a href="mailto:info@arenda-ropa.com" className="text-[#E7C768] hover:underline">info@arenda-ropa.com</a> ·{" "}
              <a href="/offer" className="text-[#E7C768] hover:underline">Публичная оферта</a>
            </p>
            <p className="text-sm text-slate-400 pt-1">Принимаем к оплате: МИР · Visa · Mastercard</p>
          </div>

          {/* Кнопки продукта без заголовка "Продукт компании" */}
          <div className="space-y-3 flex flex-col justify-center">
            <div className="flex flex-col gap-3">
              <a
                href="https://rent-rop.com"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 bg-gradient-to-r from-[#F4EE8E] to-[#D99E41] text-[#1A1A1A] font-bold text-sm px-5 py-3 rounded-xl shadow transition hover:-translate-y-0.5"
              >
                Продукт компании РентРОП
              </a>
              <a
                href="https://t.me/+Qr9hu55w7tEwNjZi"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 bg-gradient-to-r from-[#F4EE8E] to-[#D99E41] text-[#1A1A1A] font-bold text-sm px-5 py-3 rounded-xl shadow transition hover:-translate-y-0.5"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0Zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.062 3.345-.479.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.831-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635Z" />
                </svg>
                Чат техподдержки
              </a>
            </div>
          </div>
        </div>
      </footer>

      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} intent="employer" />
      <EmployerAIAssistant />
      <PublicMobileNavbar />
    </div>
  );
}

function DemoStepCard({ mascot, step, label, hint }: { mascot: string; step: string; label: string; hint?: string }) {
  return (
    <div className="bg-transparent backdrop-blur-md border border-white/15 rounded-xl p-3 text-center flex flex-col items-center gap-1">
      <img
        src={mascot} alt={label}
        width={80} height={80} loading="lazy" decoding="async"
        className="w-16 h-16 md:w-20 md:h-20 object-contain drop-shadow"
      />
      <div className="text-[14px] font-bold text-slate-300 mt-1">Шаг {step}</div>
      <div className="text-[14px] font-bold text-white">{label}</div>
      {hint && <div className="text-[14px] text-slate-300">{hint}</div>}
    </div>
  );
}
