import React, { useState, useRef, useEffect } from "react";
import { Mic, MicOff, Sparkles, Building2, Briefcase, Play, Pause, Copy, Check, AlertTriangle, RefreshCw, PlusCircle, MinusCircle, CheckCircle2, User, ChevronRight, Smartphone, Activity, Square, X } from "lucide-react";
import CustomAudioPlayer from "./CustomAudioPlayer";
import MiniatureNeonSphere from "./MiniatureNeonSphere";
import AudioField from "./AudioField";
import { MASCOT } from "@/lib/mascotImages";
import { getDemoUserId } from "@/lib/demoSession";

/** Rotating Mascot Speech Bubble Quotes for AI Evaluation Wait Screen */
function RotatingMascotQuotes({ mode }: { mode: "sales" | "company" }) {
  const salesQuotes = [
    "«ИИ Робот Рекрутер оцифровывает аргументацию спича...»",
    "«Проверяем отсутствие ухода в невыгодные скидки...»",
    "«Оцениваем сопереживание выбору бюджета...»",
    "«Формируем 100-балльную оценку и эталонный скрипт...»"
  ];

  const companyQuotes = [
    "«ИИ Робот Рекрутер извлекает структуру компании...»",
    "«Выделяем ключевые преимущества и ценности...»",
    "«Формируем профиль для публикации в боте...»"
  ];

  const quotes = mode === "sales" ? salesQuotes : companyQuotes;
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setIndex((prev) => (prev + 1) % quotes.length);
    }, 2500);
    return () => clearInterval(timer);
  }, [quotes]);

  return (
    <div className="bg-transparent border border-[#E7C768]/40 rounded-2xl p-3 text-center space-y-1 w-full shadow-md">
      <div className="text-[10px] font-bold text-[#E7C768] uppercase tracking-wider flex items-center justify-center gap-1">
        <Sparkles className="w-3.5 h-3.5 text-[#E7C768] animate-spin" />
        ИИ-Анализ ответа
      </div>
      <p className="text-xs text-white italic font-medium leading-relaxed transition-all">
        {quotes[index]}
      </p>
    </div>
  );
}

/** Interactive Step-by-Step Simulation Component */
function VoiceAiPipelineSimulation({ mode }: { mode: "sales" | "company" }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);

  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      setCurrentStep((prev) => (prev + 1) % 3);
    }, 4200);
    return () => clearInterval(interval);
  }, [isPlaying]);

  const salesSteps = [
    {
      stepNum: "1. RR STT",
      title: "Запись и оцифровка голоса кандидатом",
      user: "Алексей М. (Менеджер по продажам)",
      subtext: "Кандидат наговаривает ответ на клиентское возражение...",
      details: [
        "«Я понимаю, что вопрос бюджета первостепенен при выборе решения...",
        "При этом Робот Рекрутер окупается за первые 1,5 месяца за счет автоскрининга...",
        "Давайте просчитаем экономию под ваши объемы?»"
      ],
      badge: "Оцифровка через RR STT",
      statusColor: "text-[#E7C768] border-[#E7C768]/30 bg-transparent"
    },
    {
      stepNum: "2. ИИ-Анализ RR LLM",
      title: "Оценка ответа по 100-балльной системе",
      user: "Модель Робот Рекрутер (LLM Engine)",
      subtext: "ИИ проверяет технику аргументации, присоединение и отсутствие ухода в скидку...",
      details: [
        "✓ Присоединение к эмоции клиента: 90 / 100",
        "✓ Аргументация ценности без скидки: 85 / 100",
        "✓ Призыв к расчету экономии (закрытие): 80 / 100",
        "✓ Итоговая оценка ответа: 82 / 100"
      ],
      badge: "Метрика 100-pt Scale",
      statusColor: "text-[#E7C768] border-[#E7C768]/30 bg-transparent"
    },
    {
      stepNum: "3. Финальный результат",
      title: "Готовый отчет с эталонным скриптом",
      user: "Автоматический экспорт в CRM кандидата",
      subtext: "Сформирован разбор плюс/минус баллов, вердикт и идеальный скрипт...",
      details: [
        "• Вердикт: Сильная позиция, чёткое удержание ценности",
        "• Начислено: +30pt Присоединение, +25pt Расчет ROI",
        "• Эталон: «Давайте коротко просчитаем экономию под ваши объемы найма?»"
      ],
      badge: "Готово к экспорту в CRM",
      statusColor: "text-[#E7C768] border-[#E7C768]/30 bg-transparent"
    }
  ];

  const companySteps = [
    {
      stepNum: "1. RR STT",
      title: "Голосовой ввод профиля HR-директором",
      user: "Елена В. (HR-Директор ООО «Альфа»)",
      subtext: "Наговариваются условия вакансии, команда и преимущества...",
      details: [
        "«Наша компания ООО Альфа-Инновации занимается автоматизацией HR-процессов...",
        "В команде 50 специалистов, у нас гибкий график, ДМС со стоматологией...",
        "Оплата обучения и гибридный формат работы»"
      ],
      badge: "Оцифровка через RR STT",
      statusColor: "text-[#E7C768] border-[#E7C768]/30 bg-transparent"
    },
    {
      stepNum: "2. ИИ-Анализ RR LLM",
      title: "Структурирование и выделение ценностей",
      user: "Нейросеть Робот Рекрутер",
      subtext: "Извлечение бренда, ключевых льгот и мотивационного описания...",
      details: [
        "• Компания: ООО «Альфа-Инновации» (HR-Tech)",
        "• Команда: 50 человек • Формат: Гибридный",
        "• Бенефиты: ДМС со стоматологией, компенсация обучения",
        "• Фокус: Амбициозные разработчики и менеджеры"
      ],
      badge: "Обработка RR LLM Engine",
      statusColor: "text-[#E7C768] border-[#E7C768]/30 bg-transparent"
    },
    {
      stepNum: "3. Финальная карточка",
      title: "Сформированная карточка с экспортом в CRM",
      user: "CRM Интеграция & Шаблон вакансии",
      subtext: "Готовый структурированный профиль компании с JSON-экспортом...",
      details: [
        "✓ Название: ООО «Альфа-Инновации»",
        "✓ Ценности: Инновации, Гибкость, Забота о команде",
        "✓ Готово к публикациям на hh.ru и в Telegram-боте"
      ],
      badge: "JSON & CRM Ready",
      statusColor: "text-[#E7C768] border-[#E7C768]/30 bg-transparent"
    }
  ];

  const steps = mode === "sales" ? salesSteps : companySteps;
  const activeStepData = steps[currentStep];

  return (
    <div className="bg-transparent border border-[#E7C768]/30 rounded-2xl p-4 my-3 shadow-xl overflow-hidden">
      <div className="flex flex-wrap items-center justify-between border-b border-white/10 pb-3 mb-3 gap-2">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-[#E7C768] animate-ping" />
          <span className="text-xs font-bold text-[#E7C768] uppercase tracking-wider flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 animate-spin text-[#E7C768]" />
            Симуляция прохождения ситуации пользователем:
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            type="button"
            className="cursor-pointer text-[10px] font-mono bg-transparent hover:bg-white/10 border border-[#E7C768]/30 px-2.5 py-1 rounded-lg text-white flex items-center gap-1 transition"
          >
            {isPlaying ? <Pause className="w-3 h-3 text-[#E7C768]" /> : <Play className="w-3 h-3 text-[#E7C768]" />}
            {isPlaying ? "Пауза" : "Авто-показ"}
          </button>

          <button
            onClick={() => setCurrentStep((currentStep + 1) % 3)}
            type="button"
            className="cursor-pointer text-[10px] font-mono bg-transparent hover:bg-white/10 border border-[#E7C768]/30 px-2.5 py-1 rounded-lg text-[#E7C768] flex items-center gap-1 transition"
          >
            <ChevronRight className="w-3 h-3" /> Следующий шаг
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-3">
        {steps.map((step, idx) => (
          <button
            key={idx}
            onClick={() => setCurrentStep(idx)}
            type="button"
            className={`cursor-pointer p-2.5 rounded-xl border text-left transition-all ${
              currentStep === idx
                ? "bg-transparent border-[#E7C768] shadow-md ring-1 ring-[#E7C768]/50"
                : "bg-transparent border-white/10 hover:bg-white/5 opacity-70"
            }`}
          >
            <div className="flex items-center justify-between text-[10px] font-bold text-[#E7C768] mb-1">
              <span>{step.stepNum}</span>
              {currentStep === idx && <span className="w-1.5 h-1.5 rounded-full bg-[#E7C768] animate-ping" />}
            </div>
            <div className="text-[11px] font-semibold text-white truncate">{step.title}</div>
          </button>
        ))}
      </div>

      <div className="bg-transparent border border-white/15 rounded-xl p-3.5 space-y-2.5 transition-all">
        <div className="flex items-center justify-between border-b border-white/10 pb-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
            <User className="w-4 h-4 text-[#E7C768]" />
            <span>{activeStepData.user}</span>
          </div>
          <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${activeStepData.statusColor}`}>
            {activeStepData.badge}
          </span>
        </div>

        <p className="text-xs text-slate-300 italic">{activeStepData.subtext}</p>

        <div className="bg-transparent rounded-lg p-3 space-y-1.5 border border-white/10 text-xs font-mono text-slate-200">
          {activeStepData.details.map((line, i) => (
            <div key={i} className="flex items-start gap-2 leading-relaxed">
              <span className="text-[#E7C768] select-none">›</span>
              <span className={i === 0 ? "text-white font-medium" : "text-slate-300"}>{line}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Reusable Vertical Liquid Glass iPhone 17 Smartphone Frame Container */
function GlassSmartphoneFrame({
  title,
  stepNumbers,
  activeStep,
  onSelectStep,
  children,
  extraTopAction
}: {
  title: string;
  stepNumbers?: number[];
  activeStep?: number;
  onSelectStep?: (step: number) => void;
  children: React.ReactNode;
  extraTopAction?: React.ReactNode;
}) {
  const [currentTime, setCurrentTime] = useState<string>("");

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="relative rounded-[38px] border-2 border-white/40 bg-transparent backdrop-blur-2xl shadow-[inset_0_1px_2px_rgba(255,255,255,0.6),_inset_0_-1px_1px_rgba(255,255,255,0.2),_0_0_25px_rgba(255,255,255,0.1)] p-3 sm:p-4 flex flex-col justify-between overflow-hidden h-[620px] min-h-[540px] lg:h-[680px] lg:min-h-[580px] w-full lg:max-w-[360px] mx-auto transition-all group">
      <div className="absolute top-0 right-0 w-full h-full bg-gradient-to-bl from-white/15 via-transparent to-transparent pointer-events-none rounded-[36px] z-10" />

      <div className="relative z-20 flex items-center justify-between px-3 pt-0.5 pb-1 select-none text-sm text-white font-semibold shrink-0">
        <div className="flex items-center gap-1.5 font-mono text-sm">
          <span className="font-bold text-white text-sm">{currentTime || "10:30"}</span>
          <Smartphone className="w-3.5 h-3.5 text-[#E7C768] opacity-90" />
        </div>

        <div className="w-28 h-4 bg-transparent backdrop-blur-md border border-white/30 rounded-full flex items-center justify-center gap-1.5 shadow-[inset_0_1px_2px_rgba(255,255,255,0.4)]">
          <div className="w-2 h-2 rounded-full bg-white/30 border border-white/40" />
          <div className="w-1.5 h-1.5 rounded-full bg-[#E7C768] animate-pulse" />
        </div>

        <div className="flex items-center gap-1.5 text-sm font-mono">
          <Activity className="w-3.5 h-3.5 text-[#E7C768]" />
          <span className="text-sm font-bold text-white">67%</span>
        </div>
      </div>

      <div className="absolute -left-1 top-24 w-1 h-8 bg-white/40 rounded-l-sm pointer-events-none" />
      <div className="absolute -left-1 top-36 w-1 h-8 bg-white/40 rounded-l-sm pointer-events-none" />
      <div className="absolute -right-1 top-28 w-1 h-12 bg-white/40 rounded-r-sm pointer-events-none" />

      <div className="mt-1 border-b border-white/20 pb-2 z-10 flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-[#E7C768] animate-pulse" />
          <span className="text-sm font-extrabold text-white tracking-wide truncate">{title}</span>
        </div>

        {stepNumbers && stepNumbers.length > 0 ? (
          <div className="flex items-center gap-1 shrink-0">
            {stepNumbers.map((step) => (
              <button
                key={step}
                onClick={() => onSelectStep && onSelectStep(step - 1)}
                type="button"
                title={`Этап ${step}`}
                className={`w-7 h-7 rounded-full text-xs font-extrabold transition flex items-center justify-center cursor-pointer ${
                  activeStep === step - 1
                    ? "bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] text-[#17344F] font-black shadow-md scale-105"
                    : "bg-white/10 text-slate-100 hover:bg-white/20 border border-white/20"
                }`}
              >
                {step}
              </button>
            ))}
          </div>
        ) : (
          extraTopAction && <div className="shrink-0 z-10">{extraTopAction}</div>
        )}
      </div>

      <div className="my-2 flex-1 flex flex-col justify-between overflow-y-auto custom-gold-scrollbar pl-[4px] pr-[2px] z-10 space-y-3 text-sm">
        {children}
      </div>

      <div className="w-28 h-1 bg-white/50 rounded-full mx-auto relative z-20 mt-1 shrink-0" />
    </div>
  );
}

/** Right Smartphone Simulation View (3 Steps: Dictation, Neural Analysis, Score Card or Company Profile) */
function RightSimulationPhoneView({ mode }: { mode: "sales" | "company" }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);

  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      setCurrentStep((prev) => (prev + 1) % 3);
    }, 4500);
    return () => clearInterval(interval);
  }, [isPlaying]);

  return (
    <GlassSmartphoneFrame
      title="Демо-Симуляция"
      stepNumbers={[1, 2, 3]}
      activeStep={currentStep}
      onSelectStep={setCurrentStep}
    >
      <div className="flex items-center justify-between bg-transparent border border-white/20 rounded-xl p-2.5 text-sm">
        <div className="flex items-center gap-1.5 text-[#E7C768] font-bold text-sm">
          <Sparkles className="w-4 h-4 animate-spin shrink-0 text-[#E7C768]" />
          <span>
            {mode === "sales" ? (
              <>
                {currentStep === 0 && "Этап 1: Голосовая диктовка"}
                {currentStep === 1 && "Этап 2: ИИ-Анализ RR LLM"}
                {currentStep === 2 && "Этап 3: Карточка с оценкой"}
              </>
            ) : (
              <>
                {currentStep === 0 && "Этап 1: Голосовое описание"}
                {currentStep === 1 && "Этап 2: Извлечение структурирования"}
                {currentStep === 2 && "Этап 3: Карточка компании"}
              </>
            )}
          </span>
        </div>

        <button
          onClick={() => setIsPlaying(!isPlaying)}
          type="button"
          className="cursor-pointer bg-transparent hover:bg-white/10 border border-white/30 px-2.5 py-1 rounded-lg text-white flex items-center gap-1.5 text-sm font-semibold transition"
        >
          {isPlaying ? <Pause className="w-3.5 h-3.5 text-[#E7C768]" /> : <Play className="w-3.5 h-3.5 text-[#E7C768]" />}
          {isPlaying ? "Пауза" : "Авто"}
        </button>
      </div>

      {currentStep === 0 && (
        <div className="flex-1 flex flex-col justify-between space-y-3.5 animate-fadeIn text-sm">
          <div className="text-center py-2 space-y-2">
            <div className="relative inline-flex items-center justify-center">
              <div className="absolute -inset-3 bg-[#E7C768]/20 rounded-full blur-md animate-pulse" />
              <div className="relative w-16 h-16 rounded-full bg-transparent border border-[#E7C768] flex items-center justify-center shadow-lg">
                <MiniatureNeonSphere isRecording={true} />
                <Mic className="w-8 h-8 text-[#E7C768] absolute z-10 animate-bounce" />
              </div>
            </div>

            <div className="text-sm font-bold text-white">
              {mode === "sales" ? "Кандидат диктует ответ на микрофон:" : "Работодатель диктует описание компании:"}
            </div>

            <div className="flex items-center justify-center gap-1.5 h-8">
              {[40, 70, 30, 90, 60, 100, 50, 80, 40, 90, 60, 30, 70].map((h, i) => (
                <div
                  key={i}
                  className="w-1.5 bg-gradient-to-t from-[#E7C768] to-[#F4EE8E] rounded-full animate-pulse"
                  style={{ height: `${h}%`, animationDelay: `${i * 100}ms` }}
                />
              ))}
            </div>
          </div>

          <div className="bg-transparent border border-[#E7C768]/40 rounded-2xl p-4 text-sm space-y-2">
            <p className="text-slate-200 italic leading-relaxed text-sm">
              {mode === "sales"
                ? "«Я понимаю, что вопрос бюджета первостепенен при выборе решения... При этом Робот Рекрутер окупается за первые 1,5 месяца... Давайте коротко просчитаем экономию под ваши объемы?»"
                : "«Наша компания ООО \"Альфа-Инновации\" занимается разработкой ИИ-решений. В команде 45 человек, ищем сильных инженеров... У нас гибкий график, ДМС и регулярные премии...»"}
            </p>
          </div>

          <div className="bg-transparent border border-[#E7C768]/40 rounded-xl p-3 text-sm text-[#E7C768] font-semibold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-[#E7C768] shrink-0" />
            <span>
              {mode === "sales" ? "Аудиопоток оцифрован и передан нейросети RR" : "Речевой поток обработан и передан в генератор карточки"}
            </span>
          </div>
        </div>
      )}

      {currentStep === 1 && (
        <div className="flex-1 flex flex-col justify-between space-y-3.5 animate-fadeIn text-sm">
          <div className="text-center py-2 space-y-2">
            <div className="relative inline-block">
              <div className="absolute -inset-2 bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] rounded-full blur-lg opacity-40 animate-pulse" />
              <img
                src={MASCOT.shine}
                alt="ИИ Робот Рекрутер"
                loading="lazy"
                decoding="async"
                className="w-20 h-20 mx-auto relative z-10 object-contain drop-shadow-[0_0_15px_rgba(231,199,104,0.5)]"
              />
            </div>
          </div>

          <div className="space-y-2 text-sm">
            {mode === "sales" ? (
              <>
                <div className="bg-transparent border border-white/20 rounded-xl p-3 flex items-center justify-between">
                  <span className="text-slate-200">1. Техника присоединения:</span>
                  <span className="font-bold text-[#E7C768]">30 / 30 pt</span>
                </div>
                <div className="bg-transparent border border-white/20 rounded-xl p-3 flex items-center justify-between">
                  <span className="text-slate-200">2. Аргументация ценности и ROI:</span>
                  <span className="font-bold text-[#E7C768]">30 / 30 pt</span>
                </div>
                <div className="bg-transparent border border-white/20 rounded-xl p-3 flex items-center justify-between">
                  <span className="text-slate-200">3. Вопрос на закрытие шага:</span>
                  <span className="font-bold text-[#E7C768]">29 / 30 pt</span>
                </div>
                <div className="bg-transparent border border-white/20 rounded-xl p-3 flex items-center justify-between">
                  <span className="text-slate-200">4. Проверка дачи скидки:</span>
                  <span className="font-bold text-slate-300">-11 pt (удержание)</span>
                </div>
              </>
            ) : (
              <>
                <div className="bg-transparent border border-white/20 rounded-xl p-3 flex items-center justify-between">
                  <span className="text-slate-200">1. Название и сфера:</span>
                  <span className="font-bold text-[#E7C768]">ООО «Альфа-Инновации»</span>
                </div>
                <div className="bg-transparent border border-white/20 rounded-xl p-3 flex items-center justify-between">
                  <span className="text-slate-200">2. Ценности бренда:</span>
                  <span className="font-bold text-[#E7C768]">Инновации, Гибкость</span>
                </div>
                <div className="bg-transparent border border-white/20 rounded-xl p-3 flex items-center justify-between">
                  <span className="text-slate-200">3. Условия и бонусы:</span>
                  <span className="font-bold text-[#E7C768]">ДМС, Премии, График</span>
                </div>
                <div className="bg-transparent border border-white/20 rounded-xl p-3 flex items-center justify-between">
                  <span className="text-slate-200">4. CRM & Интеграция:</span>
                  <span className="font-bold text-slate-300">Готово к публикации</span>
                </div>
              </>
            )}
          </div>

          <div className="bg-transparent border border-[#E7C768]/50 rounded-xl p-3 text-sm text-[#E7C768] flex items-center gap-2">
            <Sparkles className="w-4 h-4 animate-spin text-[#E7C768] shrink-0" />
            <span>
              {mode === "sales"
                ? "Формируется итоговая оценка спича по 100-балльной системе"
                : "Генерируется презентационная карточка компании"}
            </span>
          </div>
        </div>
      )}

      {currentStep === 2 && (
        <div className="flex-1 flex flex-col justify-between space-y-3.5 animate-fadeIn text-sm">
          {mode === "sales" ? (
            <>
              <div className="bg-transparent border border-[#E7C768]/60 rounded-2xl p-4 text-center space-y-2 shadow-lg">
                <div className="text-[24px] font-black bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">
                  89 / 100
                </div>
                <div className="text-xs text-slate-100 italic leading-relaxed">
                  «Хороший ответ. Клиент не отпущен со скидкой, а переведен к просчету экономии.»
                </div>
              </div>

              <div className="space-y-2 text-sm">
                <div className="text-sm font-bold text-[#E7C768] uppercase tracking-wider">Плюсы и минусы ответа:</div>
                
                <div className="bg-transparent border border-[#E7C768]/40 rounded-xl p-3 space-y-1 text-slate-100">
                  <div className="flex items-center gap-1.5 font-bold text-[#E7C768]">
                    <PlusCircle className="w-4 h-4 text-[#E7C768]" />
                    <span>Плюсы (+ баллы):</span>
                  </div>
                  <div className="text-sm space-y-1 text-slate-200 pl-5">
                    <div>+ Отличное сопереживание выбору бюджета</div>
                    <div>+ Аргументация окупаемости за 1.5 месяца</div>
                    <div>+ Перевод диалога в предметный расчет экономии</div>
                  </div>
                </div>

                <div className="bg-transparent border border-white/20 rounded-xl p-3 space-y-1 text-slate-100">
                  <div className="flex items-center gap-1.5 font-bold text-slate-300">
                    <MinusCircle className="w-4 h-4 text-slate-300" />
                    <span>Зоны роста (- баллы):</span>
                  </div>
                  <div className="text-sm text-slate-300 pl-5">
                    <div>- Прямая скидка не предложена (удержание ценности)</div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="bg-transparent border border-[#E7C768]/60 rounded-2xl p-4 space-y-2 shadow-lg">
                <div className="text-sm font-bold text-[#E7C768] uppercase tracking-wider">Карточка создана:</div>
                <div className="text-2xl font-extrabold text-white">ООО «Альфа-Инновации»</div>
                <p className="text-sm text-slate-200 italic">«Создаем ИИ-сервисы будущего с заботой о команде»</p>
              </div>

              <div className="space-y-2 text-sm">
                <div className="bg-transparent border border-white/20 rounded-xl p-3 space-y-1">
                  <span className="text-sm font-bold text-[#E7C768] block">Преимущества:</span>
                  <div className="text-sm text-slate-200 space-y-0.5">
                    <div>• 45 высококлассных инженеров в штате</div>
                    <div>• Гибкое начало рабочего дня и ДМС</div>
                    <div>• Премии за успешные ИИ-релизы</div>
                  </div>
                </div>

                <div className="bg-transparent border border-white/20 rounded-xl p-3 space-y-1">
                  <span className="text-sm font-bold text-[#E7C768] block">Ценности:</span>
                  <div className="text-sm text-slate-200 font-medium">Инновации • Прозрачность • Забота о людях</div>
                </div>
              </div>

              <div className="bg-transparent border border-white/20 rounded-xl p-3 text-sm text-slate-200 italic">
                «Профиль компании полностью готов к публикации на портале и в боте.»
              </div>
            </>
          )}
        </div>
      )}
    </GlassSmartphoneFrame>
  );
}

/** Animated Gold SVG Prompt Accent Component above Input Box */
function GoldInputPromptAccent() {
  return (
    <div className="flex items-center justify-between gap-1.5 px-1 py-1 text-xs text-[#E7C768] font-bold select-none">
      <div className="flex items-center gap-1.5">
        <Sparkles className="w-4 h-4 text-[#F4EE8E] animate-spin shrink-0" />
        <span className="tracking-tight text-[11px] bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent uppercase font-extrabold">
          Нажмите микрофон или введите текст ниже:
        </span>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <svg className="w-4 h-4 text-[#E7C768] animate-bounce" viewBox="0 0 24 24" fill="none">
          <path
            d="M12 4V18M12 18L6 12M12 18L18 12"
            stroke="url(#goldGrad)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <defs>
            <linearGradient id="goldGrad" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
              <stop stopColor="#F4EE8E" />
              <stop offset="0.5" stopColor="#E7C768" />
              <stop offset="1" stopColor="#D99E41" />
            </linearGradient>
          </defs>
        </svg>
      </div>
    </div>
  );
}



export default function ProTalkVoiceDemo() {
  const [activeTab, setActiveTab] = useState<"sales" | "company">("sales");

  const [companyText, setCompanyText] = useState("");
  const [companyAudioUrl, setCompanyAudioUrl] = useState<string | null>(null);

  const [salesText, setSalesText] = useState("");
  const [salesAudioUrl, setSalesAudioUrl] = useState<string | null>(null);

  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<any>(null);

  const [isProcessing, setIsProcessing] = useState(false);
  const [isSTTProcessing, setIsSTTProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState("");
  const [processingSubtext, setProcessingSubtext] = useState("");
  const [processingSeconds, setProcessingSeconds] = useState(0);
  const [showMicNotice, setShowMicNotice] = useState(false);
  const [micPermissionError, setMicPermissionError] = useState<string | null>(null);
  const [sttError, setSttError] = useState<string | null>(null);

  const [companyResult, setCompanyResult] = useState<any | null>(null);
  const [salesResult, setSalesResult] = useState<any | null>(null);
  const [copiedJson, setCopiedJson] = useState(false);

  useEffect(() => {
    let interval: any = null;
    if (isProcessing || isSTTProcessing) {
      interval = setInterval(() => {
        setProcessingSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      setProcessingSeconds(0);
    }
    return () => clearInterval(interval);
  }, [isProcessing, isSTTProcessing]);

  const handleMicClick = async () => {
    setMicPermissionError(null);
    setSttError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setShowMicNotice(false);

      const options = typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported("audio/webm")
        ? { mimeType: "audio/webm" }
        : undefined;
      const mediaRecorder = options ? new MediaRecorder(stream, options) : new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        const localAudioUrl = URL.createObjectURL(audioBlob);

        if (activeTab === "company") {
          setCompanyAudioUrl(localAudioUrl);
        } else {
          setSalesAudioUrl(localAudioUrl);
        }

        await processAudioSTT(audioBlob);
      };

      mediaRecorder.start(250);
      setIsRecording(true);
      setRecordingTime(0);

      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);

    } catch (err: any) {
      console.warn("[Microphone Access Notice]:", err?.message || err);
      if (!navigator?.mediaDevices?.getUserMedia) {
        setMicPermissionError("Ваш браузер не поддерживает прямое подключение микрофона.");
      } else if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError" || err?.message?.includes("Permission denied")) {
        setMicPermissionError("Доступ к микрофону отклонен в настройках браузера. Вы можете разрешить доступ к микрофону или ввести текст вручную.");
      } else {
        setMicPermissionError("Не удалось получить доступ к микрофону. Разрешите использование микрофона или введите текст вручную.");
      }
      setShowMicNotice(true);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
    }
    setIsRecording(false);
    if (timerRef.current) clearInterval(timerRef.current);
    setRecordingTime(0);
  };

  const processAudioSTT = async (audioBlob: Blob) => {
    setIsSTTProcessing(true);
    setProcessingSeconds(0);
    setProcessingStatus("Слушаю вашу запись...");
    setProcessingSubtext("Распознавание речи через голосовой виджет...");
    setSttError(null);

    try {
      const reader = new FileReader();
      reader.readAsDataURL(audioBlob);
      reader.onloadend = async () => {
        const base64Data = reader.result as string;

        const res = await fetch("/api/voice/stt", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            audio_base64: base64Data,
            mime_type: audioBlob.type || "audio/webm",
            demo_user_id: getDemoUserId(),
          })
        });

        const data = await res.json().catch(() => ({ success: false }));
        setIsSTTProcessing(false);

        if (data && data.success && data.text) {
          const textAppend = data.text.trim();
          if (activeTab === "company") {
            setCompanyText((prev) => (prev ? `${prev} ${textAppend}` : textAppend));
          } else {
            setSalesText((prev) => (prev ? `${prev} ${textAppend}` : textAppend));
          }
          setSttError(null);
        } else {
          setSttError("Ошибка распознавания речи нейросетью. Ошибка могла возникнуть случайно.");
        }
      };
    } catch (err) {
      console.error("STT processing error:", err);
      setIsSTTProcessing(false);
      setSttError("Ошибка сети при отправке аудио. Попробуйте повторить запись.");
    }
  };

  const handleCompanySubmit = async (useProMaxParam = false) => {
    if (!companyText.trim()) {
      alert("Запишите голосом или введите текст с описанием компании");
      return;
    }

    setIsProcessing(true);
    setProcessingSeconds(0);
    setProcessingStatus(useProMaxParam ? "Запуск резервной модели ProMax..." : "Формирование карточки компании...");
    setProcessingSubtext("Нейросеть извлекает ценности и преимущества...");

    try {
      const res = await fetch("/api/voice-demo/company", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: companyText,
          demo_id: getDemoUserId(),
          use_promax: useProMaxParam
        })
      });

      const data = await res.json();
      setIsProcessing(false);

      if (data.success && data.result) {
        setCompanyResult(data.result);
      } else {
        alert(data.error || "Ошибка при генерации карточки компании");
      }
    } catch (err) {
      console.error(err);
      setIsProcessing(false);
      alert("Ошибка сети при отправке запроса");
    }
  };

  const handleSalesSubmit = async (useProMaxParam = false) => {
    if (!salesText.trim()) {
      alert("Запишите голосом или введите ваш вариант ответа на возражение");
      return;
    }

    setIsProcessing(true);
    setProcessingSeconds(0);
    setProcessingStatus(useProMaxParam ? "Запуск резервной модели ProMax..." : "Анализ отработки возражения...");
    setProcessingSubtext("Оценка техники присоединения, ценности и закрывающего вопроса...");

    try {
      const res = await fetch("/api/voice-demo/sales-objection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: salesText,
          demo_id: getDemoUserId(),
          use_promax: useProMaxParam
        })
      });

      const data = await res.json();
      setIsProcessing(false);

      if (data.success && data.result) {
        setSalesResult(data.result);
      } else {
        alert(data.error || "Ошибка при оценке ответа");
      }
    } catch (err) {
      console.error(err);
      setIsProcessing(false);
      alert("Ошибка сети при отправке запроса");
    }
  };

  const handleRetryProMax = async () => {
    setProcessingSeconds(0);
    if (activeTab === "sales") {
      await handleSalesSubmit(true);
    } else {
      await handleCompanySubmit(true);
    }
  };

  const copyCompanyJson = () => {
    if (!companyResult) return;
    navigator.clipboard.writeText(JSON.stringify(companyResult, null, 2));
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 2000);
  };

  return (
    <section className="relative my-12 px-2 sm:px-4 max-w-6xl mx-auto">
      <div className="absolute inset-0 bg-transparent blur-3xl pointer-events-none rounded-3xl" />

      <div className="relative bg-transparent rounded-3xl p-2 sm:p-4 text-white">

        {/* Situations Selector Tabs */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <button
            onClick={() => setActiveTab("sales")}
            type="button"
            className={`cursor-pointer text-left p-5 rounded-2xl border transition-all duration-300 flex items-start gap-4 ${
              activeTab === "sales"
                ? "bg-transparent border-[#E7C768] shadow-lg ring-1 ring-[#E7C768]"
                : "bg-transparent border-white/10 hover:bg-white/5 hover:border-white/20"
            }`}
          >
            <div className={`p-3 rounded-xl shrink-0 ${activeTab === "sales" ? "bg-[#E7C768] text-[#17344F]" : "bg-transparent border border-white/20 text-white"}`}>
              <Briefcase className="w-6 h-6" />
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider font-semibold text-[#E7C768] mb-1">
                Ролевая ситуация: Менеджер по продажам B2B
              </div>
              <h3 className="text-base font-bold text-white mb-1">Оценка отработки возражения «Дорого!»</h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Наговорите ответ клиенту на возражение — RR моментально оценит его по 100-балльной шкале и выпишет скрипт.
              </p>
            </div>
          </button>

          <button
            onClick={() => setActiveTab("company")}
            type="button"
            className={`cursor-pointer text-left p-5 rounded-2xl border transition-all duration-300 flex items-start gap-4 ${
              activeTab === "company"
                ? "bg-transparent border-[#E7C768] shadow-lg ring-1 ring-[#E7C768]"
                : "bg-transparent border-white/10 hover:bg-white/5 hover:border-white/20"
            }`}
          >
            <div className={`p-3 rounded-xl shrink-0 ${activeTab === "company" ? "bg-[#E7C768] text-[#17344F]" : "bg-transparent border border-white/20 text-white"}`}>
              <Building2 className="w-6 h-6" />
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider font-semibold text-[#E7C768] mb-1">
                Создание лендинга вакансии
              </div>
              <h3 className="text-base font-bold text-white mb-1">Создание карточки компании из голоса</h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Наговорите описание вашей компании — RR выделит преимущества, ценности и сформирует структурированную карточку.
              </p>
            </div>
          </button>
        </div>

        {/* TAB 1: SALES OBJECTION EVALUATION */}
        {activeTab === "sales" && (
          <div className="bg-transparent border border-[#E7C768]/30 rounded-3xl p-5 sm:p-7 space-y-6 shadow-2xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-4">
              <div>
                <h4 className="text-xl font-extrabold text-white flex items-center gap-2">
                  <Briefcase className="w-6 h-6 text-[#E7C768]" /> Ролевая ситуация: Менеджер по продажам B2B
                </h4>
              </div>
            </div>

            {/* Description 3 blocks */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div className="bg-transparent border border-[#E7C768]/30 rounded-2xl p-4 space-y-2 flex flex-col justify-between">
                <div>
                  <span className="text-[#E7C768] font-semibold uppercase tracking-wider block text-[10px] mb-1">
                    1. Продукт
                  </span>
                  <p className="text-white font-medium text-xs leading-relaxed">
                    B2B ИИ-платформа «Робот Рекрутер» (автоскрининг + ИИ-обучение)
                  </p>
                </div>
                <div className="pt-2 border-t border-white/10 space-y-1 text-[11px] text-slate-300">
                  <div className="flex justify-between items-center">
                    <span>План найма:</span>
                    <span className="text-white font-bold">5 сотрудников</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Бюджет:</span>
                    <span className="text-[#E7C768] font-mono font-bold">6 000 RR · 107 мин</span>
                  </div>
                </div>
              </div>

              <div className="bg-transparent border border-white/15 rounded-2xl p-4 space-y-2 flex flex-col justify-between">
                <div>
                  <span className="text-[#E7C768] font-semibold uppercase tracking-wider block text-[10px] mb-1">
                    2. Момент диалога
                  </span>
                  <p className="text-white font-medium text-xs leading-relaxed">
                    Завершена презентация решения и расчет экономии под 5 сотрудников.
                  </p>
                </div>
                <p className="text-slate-300 text-[11px] leading-relaxed pt-2 border-t border-white/10">
                  Менеджер озвучил итоговый расчет. ЛПР сравнивает цену с классическими вакансиями.
                </p>
              </div>

              <div className="bg-transparent border border-[#E7C768]/50 rounded-2xl p-4 space-y-2 flex flex-col justify-between shadow-lg">
                <div>
                  <span className="text-[#E7C768] font-bold uppercase tracking-wider block text-[10px] mb-1 flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5 text-[#E7C768]" />
                    3. Эмоциональное возражение
                  </span>
                  <p className="text-[20px] font-black text-white leading-snug">
                    «У вас слишком дорого, у конкурентов аналогичный сервис на 30% дешевле!»
                  </p>
                </div>
                <div className="text-[10px] text-slate-400 border-t border-white/10 pt-1.5">
                  Реакция клиента в живом звонке
                </div>
              </div>
            </div>

            {/* Split into 2 Windows */}
            <div className="-mx-4 sm:mx-0">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6 items-start pt-2">
                <GlassSmartphoneFrame
                  title={
                    isProcessing
                      ? "Оценка нейросетью RR..."
                      : salesResult
                      ? "Результат оценки ответа"
                      : "Ваш ответ на возражение:"
                  }
                >
                  {isProcessing ? (
                    /* FULL-SCREEN OVERLAY INSIDE PHONE MATCHING DEMO INTERVIEW WAITING OVERLAY */
                    <div className="flex-1 flex flex-col justify-between items-center text-center p-2 space-y-4 animate-fadeIn">
                      <div className="pt-2 flex flex-col items-center space-y-3 w-full">
                        <div className="relative inline-block">
                          <div className="absolute -inset-2 bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] rounded-full blur-md opacity-40 animate-pulse" />
                          <img
                            src={MASCOT.shine}
                            alt="ИИ Робот Рекрутер"
                            loading="lazy"
                            decoding="async"
                            className="w-20 h-20 mx-auto relative z-10 object-contain drop-shadow-[0_0_15px_rgba(231,199,104,0.5)]"
                          />
                        </div>

                        {/* Mascot Speech Bubble */}
                        <RotatingMascotQuotes mode="sales" />

                        <div className="text-xs font-bold text-[#E7C768] uppercase tracking-wider">
                          {processingStatus || "Обработка запроса..."}
                        </div>

                        <p className="text-xs text-slate-200">{processingSubtext || "ИИ Робот Рекрутер анализирует структуру..."}</p>

                        {/* Separated Text and Larger Countdown Timer */}
                        <div className="flex flex-col items-center space-y-1.5 pt-2">
                          <span className="text-[11px] uppercase text-slate-300 font-semibold tracking-wider">
                            Время ожидания ответа:
                          </span>
                          <div className="text-2xl font-mono font-extrabold text-[#E7C768] bg-transparent px-6 py-1.5 rounded-full border border-[#E7C768]/50 shadow-xl">
                            {processingSeconds} сек.
                          </div>
                        </div>

                        {processingSeconds >= 120 && (
                          <button
                            onClick={handleRetryProMax}
                            type="button"
                            className="w-full cursor-pointer bg-transparent border border-[#E7C768] text-[#E7C768] font-extrabold text-xs px-3 py-2 rounded-xl shadow-lg transition flex items-center justify-center gap-1.5"
                          >
                            <Sparkles className="w-4 h-4" /> Запустить модель ProMax
                          </button>
                        )}
                      </div>

                      <button
                        onClick={() => setIsProcessing(false)}
                        type="button"
                        className="cursor-pointer text-xs text-slate-300 hover:text-white underline"
                      >
                        Отмена
                      </button>
                    </div>
                  ) : salesResult ? (
                    /* INLINE SALES RESULT SCREEN INSIDE SMARTPHONE */
                    <div className="flex-1 flex flex-col justify-between space-y-3 animate-fadeIn text-xs overflow-y-auto max-h-[500px] pr-1 custom-gold-scrollbar">
                      <div className="bg-transparent border border-[#E7C768]/50 rounded-2xl p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="text-[24px] font-black text-[#E7C768]">{salesResult.score} / 100</div>
                        </div>
                        <div className="text-xs font-semibold text-slate-100 italic leading-relaxed">
                          «Хороший ответ. Клиент не отпущен со скидкой, а переведен к просчету экономии.»
                        </div>
                      </div>

                      <div className="bg-transparent border border-[#E7C768]/30 rounded-xl p-2.5 space-y-1.5 text-slate-200">
                        <div className="font-bold text-[#E7C768]">Плюсы ответа:</div>
                        {salesResult.score_plus_points?.map((pt: string, idx: number) => (
                          <div key={idx} className="flex items-start gap-1">
                            <span className="text-[#E7C768] font-bold">•</span>
                            <span>{pt}</span>
                          </div>
                        ))}
                      </div>

                      {salesResult.score_minus_points?.length > 0 && (
                        <div className="bg-transparent border border-white/20 rounded-xl p-2.5 space-y-1.5 text-slate-200">
                          <div className="font-bold text-slate-300">Зоны роста:</div>
                          {salesResult.score_minus_points.map((pt: string, idx: number) => (
                            <div key={idx} className="flex items-start gap-1">
                              <span className="text-slate-300 font-bold">•</span>
                              <span>{pt}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {salesResult.script_recommendation && (
                        <div className="bg-transparent border border-[#E7C768]/30 rounded-xl p-2.5 space-y-1">
                          <div className="font-bold text-[#E7C768]">Эталонный скрипт:</div>
                          <p className="italic text-white text-[11px]">{salesResult.script_recommendation}</p>
                        </div>
                      )}

                      <button
                        onClick={() => setSalesResult(null)}
                        type="button"
                        className="w-full cursor-pointer bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] text-[#17344F] font-extrabold py-2.5 px-3 rounded-xl transition text-xs flex items-center justify-center gap-1 mt-2"
                      >
                        <RefreshCw className="w-3.5 h-3.5" /> Пройти повторно / Ввести новый ответ
                      </button>
                    </div>
                  ) : (
                    <AudioField
                      label=""
                      value={salesText}
                      onChange={setSalesText}
                      placeholder="Нажмите на иконку микрофона для записи ответа или введите свой вариант ответа на возражение..."
                      isRecording={isRecording && activeTab === "sales"}
                      recordingTime={recordingTime}
                      isTranscribing={isSTTProcessing && activeTab === "sales"}
                      transcribeStatus="Слушаю вашу запись..."
                      transcribeSubtext="Распознавание речи..."
                      transcribeSeconds={processingSeconds}
                      audioUrl={salesAudioUrl}
                      showMicNotice={showMicNotice && activeTab === "sales"}
                      micPermissionError={micPermissionError}
                      sttError={sttError}
                      onStartRecording={handleMicClick}
                      onStopRecording={stopRecording}
                      onCancelRecording={cancelRecording}
                      onCancelMicNotice={() => setShowMicNotice(false)}
                      onClearSttError={() => setSttError(null)}
                      onSubmit={() => handleSalesSubmit(false)}
                      submitButtonText="Оценить ответ нейросетью RR"
                    />
                  )}
                </GlassSmartphoneFrame>

                <div>
                  <RightSimulationPhoneView mode="sales" />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: COMPANY CARD GENERATION */}
        {activeTab === "company" && (
          <div className="bg-transparent border border-[#E7C768]/30 rounded-3xl p-5 sm:p-7 space-y-6 shadow-2xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-4">
              <div>
                <h4 className="text-xl font-extrabold text-white flex items-center gap-2">
                  <Building2 className="w-6 h-6 text-[#E7C768]" /> Голосовой ввод описания компании
                </h4>
                <p className="text-sm text-slate-300 mt-1">
                  Нажмите микрофон и наговорите информацию о коллективе, условиях и преимуществах.
                </p>
              </div>
            </div>

            {/* Split into 2 Windows */}
            <div className="-mx-4 sm:mx-0">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6 items-start pt-2">
                <GlassSmartphoneFrame
                  title={
                    isProcessing
                      ? "Формирование карточки..."
                      : companyResult
                      ? "Карточка компании создана"
                      : "Ввод описания компании"
                  }
                >
                  {isProcessing ? (
                    /* FULL-SCREEN OVERLAY INSIDE PHONE MATCHING DEMO INTERVIEW WAITING OVERLAY */
                    <div className="flex-1 flex flex-col justify-between items-center text-center p-2 space-y-4 animate-fadeIn">
                      <div className="pt-2 flex flex-col items-center space-y-3 w-full">
                        <div className="relative inline-block">
                          <div className="absolute -inset-2 bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] rounded-full blur-md opacity-40 animate-pulse" />
                          <img
                            src={MASCOT.shine}
                            alt="ИИ Робот Рекрутер"
                            loading="lazy"
                            decoding="async"
                            className="w-20 h-20 mx-auto relative z-10 object-contain drop-shadow-[0_0_15px_rgba(231,199,104,0.5)]"
                          />
                        </div>

                        {/* Mascot Speech Bubble */}
                        <RotatingMascotQuotes mode="company" />

                        <div className="text-xs font-bold text-[#E7C768] uppercase tracking-wider">
                          {processingStatus || "Обработка запроса..."}
                        </div>

                        <p className="text-xs text-slate-200">{processingSubtext || "ИИ Робот Рекрутер анализирует структуру..."}</p>

                        {/* Separated Text and Larger Countdown Timer */}
                        <div className="flex flex-col items-center space-y-1.5 pt-2">
                          <span className="text-[11px] uppercase text-slate-300 font-semibold tracking-wider">
                            Время ожидания ответа:
                          </span>
                          <div className="text-2xl font-mono font-extrabold text-[#E7C768] bg-transparent px-6 py-1.5 rounded-full border border-[#E7C768]/50 shadow-xl">
                            {processingSeconds} сек.
                          </div>
                        </div>

                        {processingSeconds >= 120 && (
                          <button
                            onClick={handleRetryProMax}
                            type="button"
                            className="w-full cursor-pointer bg-transparent border border-[#E7C768] text-[#E7C768] font-extrabold text-xs px-3 py-2 rounded-xl shadow-lg transition flex items-center justify-center gap-1.5"
                          >
                            <Sparkles className="w-4 h-4" /> Запустить модель ProMax
                          </button>
                        )}
                      </div>

                      <button
                        onClick={() => setIsProcessing(false)}
                        type="button"
                        className="cursor-pointer text-xs text-slate-300 hover:text-white underline"
                      >
                        Отмена
                      </button>
                    </div>
                  ) : companyResult ? (
                    /* INLINE COMPANY RESULT SCREEN INSIDE SMARTPHONE */
                    <div className="flex-1 flex flex-col justify-between space-y-3 animate-fadeIn text-xs overflow-y-auto max-h-[500px] pr-1 custom-gold-scrollbar">
                      <div className="bg-transparent border border-[#E7C768]/50 rounded-2xl p-3 space-y-1">
                        <div className="text-[11px] font-bold text-[#E7C768] uppercase tracking-wider">Карточка создана:</div>
                        <div className="text-base font-extrabold text-white">{companyResult.company_name}</div>
                        <div className="text-xs text-slate-300 italic">«{companyResult.tagline}»</div>
                      </div>

                      <div className="bg-transparent border border-white/20 rounded-xl p-2.5 space-y-1 text-slate-200">
                        <div className="font-bold text-[#E7C768]">Преимущества:</div>
                        <ul className="list-disc list-inside space-y-0.5 text-[11px]">
                          {companyResult.key_advantages?.map((adv: string, idx: number) => (
                            <li key={idx}>{adv}</li>
                          ))}
                        </ul>
                      </div>

                      <div className="bg-transparent border border-white/20 rounded-xl p-2.5 space-y-1 text-slate-200">
                        <div className="font-bold text-[#E7C768]">Ценности:</div>
                        <div className="flex flex-wrap gap-1 text-[11px]">
                          {companyResult.corporate_values?.map((val: string, idx: number) => (
                            <span key={idx} className="bg-transparent border border-white/20 px-2 py-0.5 rounded text-slate-200">
                              {val}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-2 pt-1">
                        <button
                          onClick={copyCompanyJson}
                          type="button"
                          className="flex-1 cursor-pointer bg-transparent hover:bg-white/10 border border-white/30 text-white font-semibold py-2 px-2 rounded-xl transition text-[11px] flex items-center justify-center gap-1"
                        >
                          {copiedJson ? <Check className="w-3.5 h-3.5 text-[#E7C768]" /> : <Copy className="w-3.5 h-3.5 text-[#E7C768]" />}
                          {copiedJson ? "JSON Скопирован" : "Скопировать JSON"}
                        </button>

                        <button
                          onClick={() => setCompanyResult(null)}
                          type="button"
                          className="flex-1 cursor-pointer bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] text-[#17344F] font-extrabold py-2 px-2 rounded-xl transition text-[11px] flex items-center justify-center gap-1"
                        >
                          <RefreshCw className="w-3.5 h-3.5" /> Создать заново
                        </button>
                      </div>
                    </div>
                  ) : (
                    <AudioField
                      label=""
                      value={companyText}
                      onChange={setCompanyText}
                      placeholder="Нажмите на иконку микрофона для записи ответа или введите описание вашей компании..."
                      isRecording={isRecording && activeTab === "company"}
                      recordingTime={recordingTime}
                      isTranscribing={isSTTProcessing && activeTab === "company"}
                      transcribeStatus="Слушаю вашу запись..."
                      transcribeSubtext="Распознавание речи..."
                      transcribeSeconds={processingSeconds}
                      audioUrl={companyAudioUrl}
                      showMicNotice={showMicNotice && activeTab === "company"}
                      micPermissionError={micPermissionError}
                      sttError={sttError}
                      onStartRecording={handleMicClick}
                      onStopRecording={stopRecording}
                      onCancelRecording={cancelRecording}
                      onCancelMicNotice={() => setShowMicNotice(false)}
                      onClearSttError={() => setSttError(null)}
                      onSubmit={() => handleCompanySubmit(false)}
                      submitButtonText="Сформировать карточку компании через RR"
                    />
                  )}
                </GlassSmartphoneFrame>

                <div>
                  <RightSimulationPhoneView mode="company" />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
