import React, { useState, useEffect } from "react";
import {
  X,
  MessageSquareCode,
  Bot,
  Save,
  RotateCcw,
  Check,
} from "lucide-react";

interface CrmDialogsModalProps {
  isOpen: boolean;
  onClose: () => void;
  employerId: string;
}

interface DialogTemplate {
  id: string;
  stageName: string;
  title: string;
  sender: "bot" | "employer";
  content: string;
}

const DEFAULT_TEMPLATES: DialogTemplate[] = [
  {
    id: "welcome_invite",
    stageName: "1. Регистрация",
    title: "Приветствие и приглашение на интервью",
    sender: "bot",
    content: "Здравствуйте, {candidate_name}! Благодарим за интерес к вакансии «{role_name}» в компании «{company_name}». На первом этапе наш ИИ-рекрутер проведет первичное интервью: вам предстоит загрузить резюме, ответить на несколько профильных вопросов и разобрать рабочие кейсы. Это займет около 10–15 минут.",
  },
  {
    id: "screening_passed",
    stageName: "2. Скрининг резюме",
    title: "Успешный скрининг резюме",
    sender: "bot",
    content: "{candidate_name}, ваше резюме успешно прошло первичный нейросетевой анализ! Оценка соответствия требованиям должности составила {score} из 100 баллов. Приглашаем вас перейти ко второму шагу — квалификационному чек-листу компетенций.",
  },
  {
    id: "checklist_invite",
    stageName: "3. Чек-лист",
    title: "Приглашение на квалификационный опросник",
    sender: "bot",
    content: "Переходим к практической квалификации на должность «{role_name}». Пожалуйста, внимательно ответьте на вопросы чек-листа ниже. Ответы оцениваются по стандартам регламентов компании «{company_name}».",
  },
  {
    id: "situations_invite",
    stageName: "4. Ситуации",
    title: "Приглашение на ситуационные кейсы",
    sender: "bot",
    content: "{candidate_name}, вы вышли на этап ролевых рабочих ситуаций! ИИ смоделирует диалог с клиентом или коллегой. Отвечайте свободно и развернуто своими словами, как поступили бы в реальной рабочей обстановке.",
  },
  {
    id: "interview_success",
    stageName: "6. Интервью Успех",
    title: "Поздравление с успешным интервью и допуск к обучению",
    sender: "bot",
    content: "Поздравляем, {candidate_name}! Вы успешно завершили все 3 этапа собеседования с суммарным результатом {score} баллов (выше порога отбора). Компания «{company_name}» открывает для вас доступ к вводному курсу корпоративного обучения.",
  },
  {
    id: "interview_reject",
    stageName: "5. Интервью Отказ",
    title: "Вежливый отказ и кадровый резерв",
    sender: "bot",
    content: "Здравствуйте, {candidate_name}. Благодарим за время, уделенное прохождению отбора на вакансию «{role_name}». На данный момент конкурсный балл составил {score}. Мы сохранили вашу анкету в кадровом резерве компании «{company_name}» и обязательно свяжемся с вами при открытии подходящих позиций.",
  },
  {
    id: "certified_congrats",
    stageName: "10. Сертификат",
    title: "Успешная аттестация и выдача сертификата",
    sender: "bot",
    content: "Великолепная работа, {candidate_name}! Вы успешно освоили все 3 блока корпоративного обучения (Профессия, Продукт, Системы) и сдали аттестацию. Вам выписан цифровой сертификат готовности к выходу на работу в «{company_name}». Руководитель свяжется с вами для согласования даты выхода!",
  },
  {
    id: "offer_message",
    stageName: "Финал",
    title: "Официальный оффер от руководителя",
    sender: "employer",
    content: "Уважаемый(ая) {candidate_name}! Мы рады сделать вам официальное предложение о работе в компании «{company_name}» на позиции «{role_name}». Ознакомьтесь с условиями в вашем личном кабинете. Будем рады видеть вас частью нашей команды!",
  },
];

export default function CrmDialogsModal({
  isOpen,
  onClose,
  employerId,
}: CrmDialogsModalProps) {
  const effEmpId = employerId || "emp";
  const storageKey = `crm_system_dialogs_${effEmpId}`;
  const [templates, setTemplates] = useState<DialogTemplate[]>(DEFAULT_TEMPLATES);
  const [selectedId, setSelectedId] = useState<string>(DEFAULT_TEMPLATES[0].id);
  const [savedNotice, setSavedNotice] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;

    const loadTemplates = async () => {
      // 1. First attempt to load from server
      try {
        const resp = await fetch(`/api/crm/dialogs/${encodeURIComponent(effEmpId)}`);
        if (resp.ok) {
          const json = await resp.json();
          if (!cancelled && json?.templates && Array.isArray(json.templates) && json.templates.length > 0) {
            setTemplates(json.templates);
            localStorage.setItem(storageKey, JSON.stringify(json.templates));
            return;
          }
        }
      } catch {}

      // 2. Fallback to localStorage
      try {
        const stored = localStorage.getItem(storageKey);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (!cancelled && Array.isArray(parsed) && parsed.length > 0) {
            setTemplates(parsed);
          }
        }
      } catch {}
    };

    loadTemplates();

    return () => {
      cancelled = true;
    };
  }, [isOpen, effEmpId, storageKey]);

  if (!isOpen) return null;

  const currentTemplate = templates.find((t) => t.id === selectedId) || templates[0];

  const handleUpdateText = (val: string) => {
    setTemplates((prev) =>
      prev.map((t) => (t.id === selectedId ? { ...t, content: val } : t))
    );
  };

  const handleSaveAll = async () => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(templates));
      await fetch(`/api/crm/dialogs/${encodeURIComponent(effEmpId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templates }),
      }).catch(() => null);

      setSavedNotice(true);
      setTimeout(() => setSavedNotice(false), 2500);
    } catch {}
  };

  const handleResetToDefault = async () => {
    setTemplates(DEFAULT_TEMPLATES);
    try {
      localStorage.removeItem(storageKey);
      await fetch(`/api/crm/dialogs/${encodeURIComponent(effEmpId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templates: DEFAULT_TEMPLATES }),
      }).catch(() => null);
    } catch {}
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 md:p-8 overflow-y-auto">
      {/* Backdrop: строго прозрачный с размытием без затемнения и осветления фона */}
      <div
        className="fixed inset-0 bg-transparent backdrop-blur-xl transition-opacity"
        onClick={onClose}
      />

      {/* Modal Dialog (Liquid Glass Apple) */}
      <div className="relative w-full max-w-5xl bg-transparent backdrop-blur-2xl border border-white/20 shadow-2xl rounded-3xl overflow-hidden flex flex-col max-h-[90vh] z-10 text-left">
        {/* Header */}
        <div className="px-5 py-4 border-b border-white/15 flex items-center justify-between gap-3 bg-transparent backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-transparent border border-[#E7C768]/60 flex items-center justify-center shrink-0 shadow-[0_0_15px_rgba(231,199,104,0.2)]">
              <MessageSquareCode className="w-5 h-5 text-[#E7C768]" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#C8A038] bg-clip-text text-transparent">
                Системные диалоги и шаблоны автоответов
              </h2>
              <p className="text-[14px] text-slate-300">
                Настройка автоматических диалогов нейросети и руководителя с соискателями по этапам
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-300 hover:text-white hover:border-white/40 border border-white/15 transition cursor-pointer"
            aria-label="Закрыть"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Layout: Sidebar with stages + Editor */}
        <div className="flex-1 overflow-y-auto grid grid-cols-1 md:grid-cols-12 divide-y md:divide-y-0 md:divide-x divide-white/10">
          {/* Templates list */}
          <div className="md:col-span-5 p-4 sm:p-5 space-y-2 overflow-y-auto max-h-[600px]">
            <div className="text-[14px] text-slate-300 font-semibold px-1 mb-2">
              Шаблоны этапов воронки ({templates.length})
            </div>
            {templates.map((tpl) => {
              const isSelected = tpl.id === selectedId;
              return (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => setSelectedId(tpl.id)}
                  className={`w-full text-left p-3.5 rounded-2xl border transition cursor-pointer ${
                    isSelected
                      ? "border-[#E7C768] bg-transparent shadow-[0_0_12px_rgba(231,199,104,0.2)] text-white"
                      : "border-white/10 bg-transparent text-slate-300 hover:border-white/30 hover:text-white"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[14px] font-mono font-bold text-[#E7C768]">
                      {tpl.stageName}
                    </span>
                    <span className="text-[14px] text-slate-300">
                      {tpl.sender === "bot" ? "ИИ-бот" : "Руководитель"}
                    </span>
                  </div>
                  <div className="text-[14px] font-bold text-white mt-1 line-clamp-1">
                    {tpl.title}
                  </div>
                  <div className="text-[14px] text-slate-300 line-clamp-2 mt-1">
                    {tpl.content}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Template editor */}
          <div className="md:col-span-7 p-5 sm:p-6 space-y-5 flex flex-col justify-between">
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[14px] font-mono font-bold text-[#E7C768] border border-[#E7C768]/40 px-2 py-0.5 rounded-lg">
                    {currentTemplate.stageName}
                  </span>
                  <span className="text-[14px] text-slate-300">
                    Отправитель: {currentTemplate.sender === "bot" ? "Робот Рекрутер (нейросеть)" : "Работодатель"}
                  </span>
                </div>
                <h3 className="text-lg font-bold text-white mt-2">
                  {currentTemplate.title}
                </h3>
              </div>

              {/* Tag variables help */}
              <div className="p-3.5 rounded-xl border border-white/15 bg-transparent backdrop-blur-md text-[14px] text-slate-300 space-y-1">
                <div className="font-bold text-[#F4EE8E]">Доступные теги подстановки:</div>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {["{candidate_name}", "{role_name}", "{company_name}", "{score}"].map((tag) => (
                    <span
                      key={tag}
                      className="px-2 py-0.5 rounded-md bg-transparent border border-white/20 text-white font-mono text-[14px]"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              {/* Textarea */}
              <div className="space-y-1.5">
                <label className="text-[14px] font-bold text-slate-200">
                  Текст системного сообщения:
                </label>
                <textarea
                  rows={6}
                  value={currentTemplate.content}
                  onChange={(e) => handleUpdateText(e.target.value)}
                  className="w-full bg-transparent border border-white/20 rounded-2xl p-4 text-[14px] text-white leading-relaxed placeholder-slate-400 focus:outline-none focus:border-[#E7C768] resize-none"
                  placeholder="Введите текст системного сообщения..."
                />
              </div>

              {/* Live Preview Box */}
              <div className="p-4 rounded-2xl border border-[#E7C768]/40 bg-transparent backdrop-blur-md space-y-2">
                <div className="text-[14px] font-bold text-[#F4EE8E] flex items-center gap-1.5">
                  <Bot className="w-4 h-4 text-[#E7C768]" />
                  <span>Предпросмотр сообщения для кандидата:</span>
                </div>
                <div className="text-[14px] text-white leading-relaxed bg-transparent backdrop-blur-md p-3.5 rounded-xl border border-white/15">
                  {currentTemplate.content
                    .replace(/\{candidate_name\}/g, "Александр")
                    .replace(/\{role_name\}/g, "Менеджер проектов")
                    .replace(/\{company_name\}/g, "Технологии Будущего")
                    .replace(/\{score\}/g, "88")}
                </div>
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="flex items-center justify-between gap-3 pt-4 border-t border-white/10">
              <button
                type="button"
                onClick={handleResetToDefault}
                className="inline-flex items-center gap-1.5 text-[14px] text-slate-300 hover:text-white transition cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Сбросить к стандартным</span>
              </button>

              <div className="flex items-center gap-2">
                {savedNotice && (
                  <span className="text-[14px] text-[#F4EE8E] font-semibold flex items-center gap-1">
                    <Check className="w-4 h-4 text-[#F4EE8E]" /> Сохранено
                  </span>
                )}
                <button
                  type="button"
                  onClick={handleSaveAll}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] text-[#17344F] font-bold text-[14px] shadow-lg hover:brightness-105 active:scale-95 transition cursor-pointer"
                >
                  <Save className="w-4 h-4 text-[#17344F]" />
                  <span>Сохранить шаблоны</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
