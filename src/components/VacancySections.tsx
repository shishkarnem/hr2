import React, { useState } from "react";
import { 
  Briefcase, Sparkles, Building2, Rocket, DollarSign, Calendar, Users, Cpu,
  CheckCircle2, Clock, Award, PhoneCall, Check, UserCheck, Play, ArrowRight,
  TrendingUp, ShieldCheck, HeartHandshake, HelpCircle, Eye, CalendarDays, BarChart2,
  Calculator
} from "lucide-react";
import { JobProject } from "../types";
import { LandingThemeConfig, hexToRgba } from "./LandingStyleEditor";

export interface SectionProps {
  project: JobProject;
  onChangeText?: (field: string, val: string) => void;
  isEditable?: boolean;
  themeConfig?: LandingThemeConfig | null;
}

export const getTabBtnStyle = (isActive: boolean, themeConfig?: LandingThemeConfig | null): React.CSSProperties | undefined => {
  if (!themeConfig) return undefined;
  if (isActive) {
    return {
      backgroundColor: hexToRgba(themeConfig.btnActiveBgColor || "#E7C768", themeConfig.btnActiveOpacity ?? 100),
      color: themeConfig.btnActiveTextColor || "#17344F",
      borderColor: hexToRgba(themeConfig.btnBorderColor || "#E7C768", themeConfig.btnBorderOpacity ?? 100),
      borderRadius: themeConfig.btnBorderRadius === 999 ? "9999px" : (themeConfig.btnBorderRadius !== undefined ? `${themeConfig.btnBorderRadius}px` : undefined),
      borderWidth: themeConfig.btnBorderWidth !== undefined ? `${themeConfig.btnBorderWidth}px` : undefined,
    };
  }
  return {
    backgroundColor: hexToRgba(themeConfig.btnInactiveBgColor || "#000000", themeConfig.btnInactiveOpacity ?? 25),
    color: themeConfig.btnInactiveTextColor || "#CBD5E1",
    borderColor: hexToRgba(themeConfig.btnBorderColor || "#FFFFFF", themeConfig.btnBorderOpacity ?? 20),
    borderRadius: themeConfig.btnBorderRadius === 999 ? "9999px" : (themeConfig.btnBorderRadius !== undefined ? `${themeConfig.btnBorderRadius}px` : undefined),
    borderWidth: themeConfig.btnBorderWidth !== undefined ? `${themeConfig.btnBorderWidth}px` : undefined,
  };
};

export const getHeadingStyle = (themeConfig?: LandingThemeConfig | null): React.CSSProperties => {
  if (themeConfig?.headingsColorMode === "solid") {
    return {
      color: themeConfig.headingsSolidColor || "#FFFFFF",
      WebkitTextFillColor: themeConfig.headingsSolidColor || "#FFFFFF",
    };
  }
  if (themeConfig?.headingsColorMode === "gradient-silver") {
    return {
      backgroundImage: "linear-gradient(to right, #FFFFFF, #E2E8F0, #94A3B8)",
      WebkitBackgroundClip: "text",
      backgroundClip: "text",
      WebkitTextFillColor: "transparent",
      color: "transparent",
    };
  }
  return {
    backgroundImage: "linear-gradient(to right, #F4EE8E, #E7C768, #D99E41)",
    WebkitBackgroundClip: "text",
    backgroundClip: "text",
    WebkitTextFillColor: "transparent",
    color: "transparent",
  };
};

// -------------------------------------------------------------
// 1. 💼 VACANCY VIEW
// -------------------------------------------------------------
export const VacancyView: React.FC<SectionProps> = ({ project, onChangeText, isEditable, themeConfig }) => {
  const [activeTaskIndex, setActiveTaskIndex] = useState(0);
  const text = project.vacancyText || "• Ведение переговоров с клиентами по готовой базе\n• Внесение информации в простую CRM\n• Консультирование по тарифам\n• Быстрый и вежливый отклик\n• Уверенный пользователь ПК\n• Базовые навыки общения";

  // Parse lines
  const lines = text.split("\n").map(l => l.replace(/^[•\s-*]+/, "").trim()).filter(Boolean);
  const tasks = lines.slice(0, Math.ceil(lines.length / 2));
  const requirements = lines.slice(Math.ceil(lines.length / 1.8));

  // Dynamic Activity Tabs parser
  const activityText = project.tasksActivityText || "• [📞 Консультация] Клиент интересуется возможностью автоматизации рекламы. Ваша задача - открыть Wiki и направить ссылку на тариф.\n• [📝 Ведение CRM] Добавить краткую заметку по итогам звонка. Например: 'Интерес подтвержден, ждет ссылку на оплату'.\n• [🤝 Возражения] Если клиент говорит 'Дорого', объяснить ценность окупаемости ИИ-сервисов за первый месяц работы.";
  const activityLines = activityText.split("\n").map(l => l.replace(/^[•\s-*]+/, "").trim()).filter(Boolean);

  const parsedActivities = activityLines.map((l, idx) => {
    const match = l.match(/^\[(.*?)\]\s*(.*)$/);
    if (match) {
      return {
        title: match[1],
        desc: match[2]
      };
    }
    const defaultActivities = [
      { title: "📞 Консультация", desc: l },
      { title: "📝 Ведение CRM", desc: l },
      { title: "🤝 Возражения", desc: l }
    ];
    return defaultActivities[idx % defaultActivities.length] || { title: `Задача ${idx + 1}`, desc: l };
  });

  const activeActivity = parsedActivities[activeTaskIndex] || parsedActivities[0] || { title: "Задача", desc: "Описание настраивается..." };

  const iconColor = themeConfig?.iconColor || "#E7C768";
  const headingStyle = getHeadingStyle(themeConfig);
  const containerRadius = themeConfig?.containerBorderRadius !== undefined ? `${themeConfig.containerBorderRadius}px` : "16px";
  const containerBorder = hexToRgba(themeConfig?.containerBorderColor || "#FFFFFF", themeConfig?.containerBorderOpacity ?? 20);

  const cardStyle: React.CSSProperties = {
    borderColor: containerBorder,
    borderRadius: containerRadius,
  };

  return (
    <div className="space-y-6">
      {isEditable && (
        <div
          className="space-y-3 bg-transparent backdrop-blur-xl border rounded-2xl p-5 text-left"
          style={cardStyle}
        >
          <div className="flex justify-between items-center">
            <label className="text-sm font-bold block" style={headingStyle}>Раздел &quot;Чем вы будете заниматься&quot; (табы и содержание):</label>
            <span className="text-sm text-slate-300">Формат: [Название таба] Описание задачи</span>
          </div>
          <textarea
            className="w-full bg-transparent backdrop-blur-md text-sm p-3 rounded-xl border border-white/20 text-white font-mono"
            rows={5}
            value={activityText}
            onChange={(e) => onChangeText?.("tasksActivityText", e.target.value)}
            placeholder="Каждая вкладка с новой строки в формате: [Вкладка] Описание"
          />
          <div className="text-sm text-slate-200 bg-transparent backdrop-blur-md p-3 rounded-xl border border-white/20 font-sans leading-relaxed">
            💡 Напишите <strong>[📞 Консультация] Описание задачи</strong> для кастомизации табов в режиме превью.
          </div>
        </div>
      )}

      {/* Dynamic Grid Layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        
        {/* Main Responsibilities Block */}
        <div
          className="vacancy-subcard bg-transparent backdrop-blur-xl border rounded-2xl p-5 space-y-4 shadow-md"
          style={cardStyle}
        >
          <div className="flex items-center gap-2 pb-2 border-b border-white/10">
            <div
              className="w-8 h-8 rounded-xl bg-transparent backdrop-blur-md border flex items-center justify-center"
              style={{ color: iconColor, borderColor: containerBorder }}
            >
              <Briefcase className="w-4 h-4" style={{ color: iconColor }} />
            </div>
            <h4 className="text-sm sm:text-base font-bold" style={headingStyle}>Пул ключевых задач</h4>
          </div>

          {isEditable ? (
            <textarea
              className="w-full bg-transparent backdrop-blur-md text-sm p-3 rounded-xl border border-white/20 text-white font-mono"
              rows={5}
              value={text}
              onChange={(e) => onChangeText?.("vacancyText", e.target.value)}
              placeholder="Каждая строка с новой строки"
            />
          ) : (
            <div className="space-y-3 text-left">
              {tasks.map((task, idx) => (
                <div key={idx} className="flex items-start gap-2.5 text-sm text-white">
                  <span
                    className="w-6 h-6 rounded-full bg-transparent border flex items-center justify-center shrink-0 text-sm font-bold"
                    style={{
                      borderColor: hexToRgba(iconColor, 50),
                      color: iconColor,
                    }}
                  >
                    {idx + 1}
                  </span>
                  <span className="leading-relaxed pt-0.5">{task}</span>
                </div>
              ))}
              {tasks.length === 0 && <span className="text-slate-300 italic text-sm">Задачи не указаны</span>}
            </div>
          )}
        </div>

        {/* Requirements Block */}
        <div
          className="vacancy-subcard bg-transparent backdrop-blur-xl border rounded-2xl p-5 space-y-4 shadow-md"
          style={cardStyle}
        >
          <div className="flex items-center gap-2 pb-2 border-b border-white/10">
            <div
              className="w-8 h-8 rounded-xl bg-transparent backdrop-blur-md border flex items-center justify-center"
              style={{ color: iconColor, borderColor: containerBorder }}
            >
              <Award className="w-4 h-4" style={{ color: iconColor }} />
            </div>
            <h4 className="text-sm sm:text-base font-bold" style={headingStyle}>Требования к кандидату</h4>
          </div>

          {isEditable ? (
            <p className="text-sm text-slate-300 italic text-left">Редактируется в поле слева в общей форме, разбивается автоматически по строкам для визуализации требований.</p>
          ) : (
            <div className="space-y-3 text-left">
              {requirements.map((req, idx) => (
                <div key={idx} className="flex items-start gap-2.5 text-sm text-white">
                  <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" style={{ color: iconColor }} />
                  <span className="leading-relaxed">{req}</span>
                </div>
              ))}
              {requirements.length === 0 && (
                <div className="space-y-3">
                  <div className="flex items-start gap-2.5 text-sm text-white"><CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" style={{ color: iconColor }} /> Хорошая дикция и вежливый тон</div>
                  <div className="flex items-start gap-2.5 text-sm text-white"><CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" style={{ color: iconColor }} /> Наличие гарнитуры и ПК</div>
                </div>
              )}
            </div>
          )}
        </div>

      </div>

      {/* Interactive Activity Tab System */}
      {parsedActivities.length > 0 && (
        <div
          className="vacancy-subcard bg-transparent backdrop-blur-xl border rounded-2xl p-4 sm:p-5 text-left shadow-md"
          style={cardStyle}
        >
          <h4 className="text-sm font-bold mb-3 flex items-center gap-1.5" style={headingStyle}>
            <Eye className="w-4 h-4" style={{ color: iconColor }} /> Чем вы будете заниматься: ежедневный процесс
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
            {parsedActivities.map((t, idx) => {
              const isActive = activeTaskIndex === idx;
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setActiveTaskIndex(idx)}
                  style={getTabBtnStyle(isActive, themeConfig)}
                  className={`landing-tab-btn transition text-sm font-bold p-2.5 rounded-xl border text-center cursor-pointer ${
                    isActive 
                      ? "landing-btn-active shadow-md" 
                      : "landing-btn-inactive backdrop-blur-md hover:border-white/40"
                  }`}
                >
                  {t.title}
                </button>
              );
            })}
          </div>
          <div
            className="vacancy-subcard bg-transparent backdrop-blur-md border p-4 rounded-xl block min-h-[50px]"
            style={{ borderColor: containerBorder, borderRadius: containerRadius }}
          >
            <p className="text-sm text-white leading-relaxed font-sans">{activeActivity.desc}</p>
            <div className="mt-3 flex items-center gap-1.5 text-sm font-bold" style={{ color: iconColor }}>
              <CheckCircle2 className="w-4 h-4 inline" style={{ color: iconColor }} /> Все необходимые регламенты и подсказки будут доступны в ИИ-Кабинете!
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// -------------------------------------------------------------
// 2. 🔥 MOTIVATION VIEW
// -------------------------------------------------------------
export const MotivationView: React.FC<SectionProps> = ({ project, onChangeText, isEditable, themeConfig }) => {
  const detailText = project.motivationTextDetail || "• Премии до 30% за высокую скорость заполнения карточек CRM\n• Еженедельные выплаты за успешные звонки\n• Компенсация затрат на интернет\n• Обучение за счет компании и кураторство";
  const bannerText = project.motivationText || "";
  const points = detailText.split("\n").map(l => l.replace(/^[•\s-*]+/, "").trim()).filter(Boolean);

  const headingStyle = getHeadingStyle(themeConfig);

  return (
    <div className="space-y-6">
      {isEditable ? (
        <div className="space-y-3 bg-transparent backdrop-blur-xl border border-white/20 rounded-2xl p-5">
          <label className="text-sm font-bold block" style={headingStyle}>Краткая мотивация (баннер):</label>
          <textarea
            className="w-full bg-transparent backdrop-blur-md text-sm p-3 rounded-xl border border-white/20 text-white font-mono"
            rows={2}
            value={bannerText}
            onChange={(e) => onChangeText?.("motivationText", e.target.value)}
            placeholder="Одно-два предложения для верхнего блока"
          />
          <label className="text-sm font-bold block" style={headingStyle}>Полный текст мотивации и льгот:</label>
          <textarea
            className="w-full bg-transparent backdrop-blur-md text-sm p-3 rounded-xl border border-white/20 text-white font-mono"
            rows={5}
            value={detailText}
            onChange={(e) => onChangeText?.("motivationTextDetail", e.target.value)}
            placeholder="Каждое преимущество пишите с новой строки для генерации анимированных карточек"
          />
        </div>
      ) : (
        (() => {
          const activeBtnColor = themeConfig?.btnActiveTextColor || "#17344F";
          const activeBtnBg = themeConfig ? hexToRgba(themeConfig.btnActiveBgColor || "#E7C768", themeConfig.btnActiveOpacity ?? 100) : undefined;
          const activeBtnBorder = themeConfig ? hexToRgba(themeConfig.btnBorderColor || "#FFFFFF", themeConfig.btnBorderOpacity ?? 20) : undefined;
          const activeBtnRadius = themeConfig?.btnBorderRadius === 999 ? "9999px" : `${themeConfig?.btnBorderRadius ?? 16}px`;
          const activeBtnWidth = `${themeConfig?.btnBorderWidth ?? 1}px`;

          return (
            <div className="space-y-5">
              {bannerText && (
                <div
                  className="landing-bonus-card landing-btn-active p-4 rounded-2xl text-left shadow-md"
                  style={{
                    backgroundColor: activeBtnBg,
                    color: activeBtnColor,
                    borderColor: activeBtnBorder,
                    borderWidth: activeBtnWidth,
                    borderRadius: activeBtnRadius,
                    borderStyle: "solid",
                  }}
                >
                  <span className="text-sm font-bold block mb-1" style={{ color: activeBtnColor }}>Главное о мотивации</span>
                  <p className="text-sm sm:text-base font-medium leading-relaxed opacity-90" style={{ color: activeBtnColor }}>{bannerText}</p>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {points.map((pt, i) => (
                <div
                  key={i}
                  className="landing-bonus-card landing-btn-active p-4 rounded-2xl flex items-start gap-3 transition hover:shadow-lg"
                  style={{
                    backgroundColor: activeBtnBg,
                    color: activeBtnColor,
                    borderColor: activeBtnBorder,
                    borderWidth: activeBtnWidth,
                    borderRadius: activeBtnRadius,
                    borderStyle: "solid",
                  }}
                >
                  <div
                    className="landing-icon-container w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-sm"
                    style={{ color: activeBtnColor }}
                  >
                    {i % 2 === 0 ? <Sparkles className="w-4 h-4" style={{ color: activeBtnColor, stroke: activeBtnColor }} /> : <TrendingUp className="w-4 h-4" style={{ color: activeBtnColor, stroke: activeBtnColor }} />}
                  </div>
                  <div>
                    <span className="text-sm font-bold block" style={{ color: activeBtnColor }}>Бонус {i + 1}</span>
                    <p className="text-sm font-medium leading-relaxed mt-1 opacity-90" style={{ color: activeBtnColor }}>{pt}</p>
                  </div>
                </div>
              ))}
              {points.length === 0 && (
                <span className="text-sm text-slate-300 italic">Специальные льготы пока не описаны. Вы можете отредактировать их в кабинете работодателя.</span>
              )}
              </div>
            </div>
          );
        })()
      )}
    </div>
  );
};

// -------------------------------------------------------------
// 3. 🏢 COMPANY VIEW
// -------------------------------------------------------------
export const CompanyView: React.FC<SectionProps> = ({ project, onChangeText, isEditable, themeConfig }) => {
  const text = project.companyText || "• Мы поставляем автоматизированные скрипты и голосовых помощников на рынке СНГ.\n• Создали более 15 крупных интеграций года.\n• Горизонтальная структура команды - у вас всегда есть прямой доступ к лидерам проекта.";
  const bullets = text.split("\n").map(l => l.replace(/^[•\s-*]+/, "").trim()).filter(Boolean);

  const stats = [
    { label: project.statsLabelClients || "Клиентов в СНГ", value: project.statsValClients || "350+" },
    { label: project.statsLabelDialogs || "ИИ-диалогов в сутки", value: project.statsValDialogs || "15 000+" },
    { label: project.statsLabelFounded || "Год основания", value: project.statsValFounded || "2021" }
  ];

  const mission = project.missionText || "Наша миссия — избавить людей от рутины в холодных звонках, автоматизировав базовую квалификацию лидов. Каждый день мы упрощаем работу сотрудникам отделов продаж по всему миру.";

  const iconColor = themeConfig?.iconColor || "#E7C768";
  const containerRadius = themeConfig?.containerBorderRadius !== undefined ? `${themeConfig.containerBorderRadius}px` : "16px";
  const containerBorder = hexToRgba(themeConfig?.containerBorderColor || "#FFFFFF", themeConfig?.containerBorderOpacity ?? 20);
  const headingStyle = getHeadingStyle(themeConfig);

  const cardStyle: React.CSSProperties = {
    borderColor: containerBorder,
    borderRadius: containerRadius,
  };

  return (
    <div className="space-y-6">
      {isEditable ? (
        <div className="space-y-4 bg-transparent backdrop-blur-xl border border-white/20 rounded-2xl p-5">
          <div className="space-y-2">
            <label className="text-sm font-bold block" style={headingStyle}>Презентация компании на лендинге:</label>
            <textarea
              className="w-full bg-transparent backdrop-blur-md text-sm p-3 rounded-xl border border-white/20 text-white font-mono"
              rows={4}
              value={text}
              onChange={(e) => onChangeText?.("companyText", e.target.value)}
              placeholder="Каждый факт о масштабе пишите с новой строки для красивой верстки"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold block" style={headingStyle}>Цитата / Миссия компании:</label>
            <textarea
              className="w-full bg-transparent backdrop-blur-md text-sm p-3 rounded-xl border border-white/20 text-white"
              rows={2}
              value={mission}
              onChange={(e) => onChangeText?.("missionText", e.target.value)}
              placeholder="Опишите глобальную миссию компании"
            />
          </div>

          <div className="border-t border-white/10 pt-3">
            <span className="text-sm font-bold block mb-2" style={headingStyle}>🔥 Настройка 3-х счетчиков/характеристик</span>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="bg-transparent backdrop-blur-md p-3 border border-white/20 rounded-xl space-y-1.5">
                <span className="text-sm text-slate-300 block font-bold">Счетчик 1 (Клиенты):</span>
                <input
                  type="text"
                  className="w-full bg-transparent text-sm p-2 rounded-lg border border-white/20 text-white font-bold"
                  value={project.statsValClients !== undefined && project.statsValClients !== null ? project.statsValClients : "350+"}
                  onChange={(e) => onChangeText?.("statsValClients", e.target.value)}
                  placeholder="Значение"
                />
                <input
                  type="text"
                  className="w-full bg-transparent text-sm p-2 rounded-lg border border-white/20 text-slate-200"
                  value={project.statsLabelClients !== undefined && project.statsLabelClients !== null ? project.statsLabelClients : "Клиентов в СНГ"}
                  onChange={(e) => onChangeText?.("statsLabelClients", e.target.value)}
                  placeholder="Подпись"
                />
              </div>

              <div className="bg-transparent backdrop-blur-md p-3 border border-white/20 rounded-xl space-y-1.5">
                <span className="text-sm text-slate-300 block font-bold">Счетчик 2 (ИИ диалоги):</span>
                <input
                  type="text"
                  className="w-full bg-transparent text-sm p-2 rounded-lg border border-white/20 text-white font-bold"
                  value={project.statsValDialogs !== undefined && project.statsValDialogs !== null ? project.statsValDialogs : "15 000+"}
                  onChange={(e) => onChangeText?.("statsValDialogs", e.target.value)}
                  placeholder="Значение"
                />
                <input
                  type="text"
                  className="w-full bg-transparent text-sm p-2 rounded-lg border border-white/20 text-slate-200"
                  value={project.statsLabelDialogs !== undefined && project.statsLabelDialogs !== null ? project.statsLabelDialogs : "ИИ-диалогов в сутки"}
                  onChange={(e) => onChangeText?.("statsLabelDialogs", e.target.value)}
                  placeholder="Подпись"
                />
              </div>

              <div className="bg-transparent backdrop-blur-md p-3 border border-white/20 rounded-xl space-y-1.5">
                <span className="text-sm text-slate-300 block font-bold">Счетчик 3 (Основание):</span>
                <input
                  type="text"
                  className="w-full bg-transparent text-sm p-2 rounded-lg border border-white/20 text-white font-bold"
                  value={project.statsValFounded !== undefined && project.statsValFounded !== null ? project.statsValFounded : "2021"}
                  onChange={(e) => onChangeText?.("statsValFounded", e.target.value)}
                  placeholder="Значение"
                />
                <input
                  type="text"
                  className="w-full bg-transparent text-sm p-2 rounded-lg border border-white/20 text-slate-200"
                  value={project.statsLabelFounded !== undefined && project.statsLabelFounded !== null ? project.statsLabelFounded : "Год основания"}
                  onChange={(e) => onChangeText?.("statsLabelFounded", e.target.value)}
                  placeholder="Подпись"
                />
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Quote Block */}
          <div
            className="bg-transparent backdrop-blur-xl border p-4 sm:p-5 text-left shadow-md"
            style={{
              borderColor: hexToRgba(iconColor, 40),
              borderRadius: containerRadius,
            }}
          >
            <span
              className="text-3xl font-serif leading-none select-none block mb-1"
              style={{ color: iconColor }}
            >“</span>
            <p className="text-sm sm:text-base italic text-white font-sans leading-relaxed">
              {mission}
            </p>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-3 gap-3">
            {stats.map((st, i) => (
              <div
                key={i}
                className="bg-transparent backdrop-blur-xl border p-3 sm:p-4 text-center shadow-md"
                style={cardStyle}
              >
                <span
                  className="text-base sm:text-lg font-black block"
                  style={headingStyle}
                >{st.value}</span>
                <span className="text-sm text-slate-300 mt-1 block leading-tight">{st.label}</span>
              </div>
            ))}
          </div>

          {/* Bullet points fact checklist */}
          <div
            className="bg-transparent backdrop-blur-xl border p-4 sm:p-5 space-y-3.5 text-left shadow-md"
            style={cardStyle}
          >
            <h5 className="text-sm font-bold" style={headingStyle}>Факты о компании:</h5>
            <div className="space-y-2.5">
              {bullets.map((b, i) => (
                <div key={i} className="flex items-start gap-2.5 text-sm text-white">
                  <Check className="w-5 h-5 shrink-0 mt-0.5" style={{ color: iconColor }} />
                  <span className="leading-relaxed">{b}</span>
                </div>
              ))}
              {bullets.length === 0 && <span className="text-slate-300 italic text-sm">Сведения отсутствуют</span>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// -------------------------------------------------------------
// 4. 🚀 ONBOARDING VIEW
// -------------------------------------------------------------
export const OnboardingView: React.FC<SectionProps> = ({ project, onChangeText, isEditable, themeConfig }) => {
  const text = project.onboardingText || "• [📝 Экспресс-тест] Быстрое тестирование навыков через ИИ-Режим\n• [📚 Изучение Wiki] Ознакомление с Wiki базой знаний\n• [🤖 ИИ-Разговор] Первые симуляционные звонки с подсказками ИИ\n• [✍️ Оформление] Подписание договора (ГПХ или Самозанятость) за 1 день";
  const steps = text.split("\n").map(l => l.replace(/^[•\s-*]+/, "").trim()).filter(Boolean);

  const [viewStep, setViewStep] = useState(0);

  const parsedSteps = steps.map((l, idx) => {
    const match = l.match(/^\[(.*?)\]\s*(.*)$/);
    if (match) {
      return {
        title: match[1],
        desc: match[2]
      };
    }
    const defaultTitles = [
      "📝 Экспресс-тест",
      "📚 Изучение Wiki",
      "🤖 ИИ-Разговор",
      "✍️ Оформление"
    ];
    return {
      title: defaultTitles[idx] || `Шаг ${idx + 1}`,
      desc: l
    };
  });

  const activeStep = parsedSteps[viewStep] || parsedSteps[0] || { title: "Шаг", desc: "Сведения подгружаются..." };

  const iconColor = themeConfig?.iconColor || "#E7C768";
  const headingStyle = getHeadingStyle(themeConfig);
  const containerRadius = themeConfig?.containerBorderRadius !== undefined ? `${themeConfig.containerBorderRadius}px` : "16px";
  const containerBorder = hexToRgba(themeConfig?.containerBorderColor || "#FFFFFF", themeConfig?.containerBorderOpacity ?? 20);

  return (
    <div className="space-y-6">
      {isEditable ? (
        <div className="space-y-3 bg-transparent backdrop-blur-xl border border-white/20 rounded-2xl p-5">
          <div className="flex justify-between items-center">
            <label className="text-sm font-bold block" style={headingStyle}>Этапы ввода в должность и оформления:</label>
            <span className="text-sm text-slate-300">Формат: [Заголовок] Описание</span>
          </div>
          <textarea
            className="w-full bg-transparent backdrop-blur-md text-sm p-3 rounded-xl border border-white/20 text-white font-mono"
            rows={6}
            value={text}
            onChange={(e) => onChangeText?.("onboardingText", e.target.value)}
            placeholder="Каждый шаг с новой строки для отрисовки красивого интерактивного таймлайна"
          />
          <div className="text-sm text-slate-200 bg-transparent backdrop-blur-md p-3 rounded-xl border border-white/20 font-sans">
            💡 Напишите <strong>[📝 Экспресс-тест] Описание этапа</strong>, чтобы кастомизировать заголовки кнопок и табов.
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold" style={headingStyle}>Этапы адаптации:</span>
          </div>

          {/* Stepper Header Navigation */}
          {parsedSteps.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {parsedSteps.map((s, idx) => {
                const isActive = viewStep === idx;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setViewStep(idx)}
                    style={getTabBtnStyle(isActive, themeConfig)}
                    className={`landing-tab-btn transition p-2.5 rounded-xl text-center border font-bold text-sm cursor-pointer ${
                      isActive
                        ? "landing-btn-active shadow-md"
                        : "landing-btn-inactive backdrop-blur-md hover:border-white/40"
                    }`}
                  >
                    {s.title}
                  </button>
                );
              })}
            </div>
          )}

          {/* Stepper body display */}
          <div
            className="bg-transparent backdrop-blur-xl p-5 sm:p-6 border text-left relative overflow-hidden shadow-md"
            style={{ borderColor: containerBorder, borderRadius: containerRadius }}
          >
            <div className="absolute right-4 top-3 text-[50px] font-serif font-black select-none text-white/5">
              0{viewStep + 1}
            </div>

            <div className="space-y-2 relative z-10">
              <span className="text-sm font-bold block" style={headingStyle}>
                {activeStep.title}
              </span>
              <p className="text-sm sm:text-base text-white leading-relaxed font-sans font-medium">
                {activeStep.desc}
              </p>
              <div className="mt-4 pt-3.5 border-t border-white/10 flex items-center justify-between">
                <span className="text-sm font-bold flex items-center gap-1.5" style={{ color: iconColor }}>
                  <ShieldCheck className="w-4 h-4" style={{ color: iconColor }} /> Вся процедура полностью автоматизирована
                </span>
                <span className="text-sm text-slate-300">Шаг {viewStep + 1} из {parsedSteps.length}</span>
              </div>
            </div>
          </div>

          {/* Interactive Flow visual list */}
          <div
            className="border bg-transparent backdrop-blur-xl p-4 sm:p-5 space-y-3 text-left shadow-md"
            style={{ borderColor: containerBorder, borderRadius: containerRadius }}
          >
            <span className="text-sm font-bold block" style={headingStyle}>Полный путь соискателя:</span>
            <div className="space-y-2.5">
              {parsedSteps.map((st, idx) => (
                <div key={idx} className="flex items-center gap-3 text-sm">
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-sm shrink-0 border ${
                      viewStep === idx
                        ? "landing-btn-active shadow-sm"
                        : "bg-transparent border-white/30 text-white"
                    }`}
                    style={
                      viewStep === idx
                        ? {
                            backgroundColor: themeConfig?.btnActiveBgColor || "#E7C768",
                            color: themeConfig?.btnActiveTextColor || "#17344F",
                            borderColor: themeConfig?.btnBorderColor || "#E7C768",
                          }
                        : undefined
                    }
                  >
                    {idx + 1}
                  </div>
                  <span className={`text-sm leading-relaxed ${viewStep === idx ? "text-white font-bold" : "text-slate-200"}`}>
                    <strong className="font-mono text-sm mr-1" style={{ color: iconColor }}>[{st.title}]</strong> {st.desc}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// -------------------------------------------------------------
// 5. 💵 PAYOUTS VIEW
// -------------------------------------------------------------
export const PayoutsView: React.FC<SectionProps> = ({ project, onChangeText, isEditable, themeConfig }) => {
  const text = project.payoutsText || "• Фиксированная оплата за каждый пройденный качественный звонок (от 120 р).\n• Выплаты дважды в месяц без задержек (10 и 25 числа).\n• Официальные начисления на карту любого банка.\n• Бонус за приглашенных друзей - 5000 рублей.";
  const payoutLines = text.split("\n").map(l => l.replace(/^[•\s-*]+/, "").trim()).filter(Boolean);

  const iconColor = themeConfig?.iconColor || "#E7C768";
  const headingStyle = getHeadingStyle(themeConfig);
  const containerRadius = themeConfig?.containerBorderRadius !== undefined ? `${themeConfig.containerBorderRadius}px` : "16px";
  const containerBorder = hexToRgba(themeConfig?.containerBorderColor || "#FFFFFF", themeConfig?.containerBorderOpacity ?? 20);

  return (
    <div className="space-y-6">
      {isEditable ? (
        <div className="space-y-3 bg-transparent backdrop-blur-xl border border-white/20 rounded-2xl p-5">
          <label className="text-sm font-bold block" style={headingStyle}>Условия выплат и премий:</label>
          <textarea
            className="w-full bg-transparent backdrop-blur-md text-sm p-3 rounded-xl border border-white/20 text-white font-mono"
            rows={5}
            value={text}
            onChange={(e) => onChangeText?.("payoutsText", e.target.value)}
            placeholder="Каждая строка текста с новой строки"
          />
        </div>
      ) : (
        <div className="space-y-5">
          
          {/* Visual Payout parameters from database */}
          <div
            className="bg-transparent backdrop-blur-xl border p-4 sm:p-5 space-y-3.5 text-left shadow-md"
            style={{ borderColor: containerBorder, borderRadius: containerRadius }}
          >
            <span className="text-sm font-bold block" style={headingStyle}>💳 Детали начислений и вознаграждения:</span>
            <div className="space-y-2.5">
              {payoutLines.map((pay, i) => (
                <div key={i} className="flex items-start gap-2.5 text-sm text-white">
                  <span
                    className="w-6 h-6 rounded-lg bg-transparent border flex items-center justify-center shrink-0 text-sm font-bold"
                    style={{
                      borderColor: hexToRgba(iconColor, 50),
                      color: iconColor,
                    }}
                  >
                    {i + 1}
                  </span>
                  <span className="leading-relaxed pt-0.5">{pay}</span>
                </div>
              ))}
              {payoutLines.length === 0 && <span className="text-slate-300 italic text-sm">Сведения пока отсутствуют.</span>}
            </div>
          </div>

        </div>
      )}
    </div>
  );
};

// -------------------------------------------------------------
// 6. 📅 SCHEDULE VIEW
// -------------------------------------------------------------
export const ScheduleView: React.FC<SectionProps> = ({ project, onChangeText, isEditable, themeConfig }) => {
  const text = project.scheduleText || "• Гибкие смены от 4 часов в день во временном интервале с 09:00 до 21:00.\n• Возможность брать выходные в любой день недели.\n• Вы заходите в систему ИИ тогда, когда вам это удобно.";
  const lines = text.split("\n").map(l => l.replace(/^[•\s-*]+/, "").trim()).filter(Boolean);

  const iconColor = themeConfig?.iconColor || "#E7C768";
  const headingStyle = getHeadingStyle(themeConfig);
  const containerRadius = themeConfig?.containerBorderRadius !== undefined ? `${themeConfig.containerBorderRadius}px` : "16px";
  const containerBorder = hexToRgba(themeConfig?.containerBorderColor || "#FFFFFF", themeConfig?.containerBorderOpacity ?? 20);

  return (
    <div className="space-y-6">
      {isEditable ? (
        <div className="space-y-3 bg-transparent backdrop-blur-xl border border-white/20 rounded-2xl p-5">
          <label className="text-sm font-bold block" style={headingStyle}>Разъяснение графика смен:</label>
          <textarea
            className="w-full bg-transparent backdrop-blur-md text-sm p-3 rounded-xl border border-white/20 text-white font-mono"
            rows={5}
            value={text}
            onChange={(e) => onChangeText?.("scheduleText", e.target.value)}
            placeholder="Пишите каждую ключевую деталь о сменах с новой строки"
          />
        </div>
      ) : (
        <div className="space-y-5">
          
          {/* List parameters from DB */}
          <div
            className="bg-transparent backdrop-blur-xl border p-4 sm:p-5 space-y-3 text-left shadow-md"
            style={{ borderColor: containerBorder, borderRadius: containerRadius }}
          >
            <span className="text-sm font-bold block" style={headingStyle}>📅 Параметры гибкости и смен:</span>
            <div className="space-y-2.5">
              {lines.map((l, i) => (
                <div key={i} className="flex items-start gap-2.5 text-sm text-white">
                  <div
                    className="w-3 h-3 rounded-full shrink-0 mt-1.5"
                    style={{ backgroundColor: iconColor }}
                  />
                  <span className="leading-relaxed">{l}</span>
                </div>
              ))}
              {lines.length === 0 && <span className="text-slate-300 italic text-sm">Сведения уточняются при звонке.</span>}
            </div>
          </div>

        </div>
      )}
    </div>
  );
};

// -------------------------------------------------------------
// 7. 👥 TEAM VIEW (MEET THE LECTURERS & MENTORS)
// -------------------------------------------------------------
interface ParsedMember {
  name: string;
  role: string;
  desc: string;
  hasPersonName: boolean;
  initials: string;
  badgeLabel?: string;
}

function isPersonName(text: string): boolean {
  if (!text) return false;
  const trimmed = text.trim();
  if (trimmed.length < 2 || trimmed.length > 30) return false;
  if (/[:;,!?"«»()0-9\/\\]/.test(trimmed)) return false;
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length > 3 || words.length === 0) return false;

  const stopWords = new Set([
    "задаёт", "задает", "управляет", "генерирует", "закрывает", "закрывают", "помогает",
    "следит", "отвечает", "команда", "коллеги", "агентство", "агентства", "полностью",
    "обеспечивает", "контролирует", "развивает", "ведет", "ведёт", "согласование",
    "утверждает", "обучает", "курирует", "сопровождает", "организует", "организовывает",
    "настраивает", "поддерживает", "создает", "создаёт", "делает", "решает", "пишет",
    "продаёт", "продает", "звонит", "принимает", "проводит", "человек", "специалисты",
    "отдел", "группа", "руководит", "готовит", "тестирует", "проверяет", "работает",
    "нанимает", "ищет", "подбирает", "планирует", "консультирует", "выполняет",
    "составляет", "формирует", "реализует", "реализовывает", "аутсорс", "маркетинг",
    "юристы", "бухгалтерия", "ассистент"
  ]);

  const firstLower = words[0].toLowerCase();
  if (stopWords.has(firstLower)) return false;

  if (/(?:ет|ит|ает|яет|ует|ют|ят|ают|яют|уют|лся|лась|лись)$/i.test(firstLower)) {
    return false;
  }

  for (const w of words) {
    if (!/^[A-ZА-ЯЁ]/.test(w)) return false;
  }

  return true;
}

function getInitials(name: string, role: string, hasPersonName: boolean): string {
  if (hasPersonName && name) {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2 && parts[0][0] && parts[1][0]) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.trim().slice(0, 2).toUpperCase();
  }
  if (role) {
    const cleanRole = role.replace(/[^a-zA-Zа-яА-Я0-9\s]/g, "").trim();
    const parts = cleanRole.split(/\s+/).filter(w => !/^(и|в|на|по|для|с|со|от)$/i.test(w) && Boolean(w));
    if (parts.length >= 2 && parts[0][0] && parts[1][0]) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return cleanRole.slice(0, 2).toUpperCase();
  }
  return "HR";
}

function getRoleBadgeLabel(role: string): string {
  const norm = role.toLowerCase();
  if (norm.includes("команд") || norm.includes("штат") || norm.includes("человек")) return "Штат специалистов";
  if (norm.includes("аутсорс") || norm.includes("агентств") || norm.includes("партнер")) return "Внешние партнёры";
  if (norm.includes("коллег")) return "Команда экспертов";
  if (norm.includes("маркетинг") || norm.includes("лидоген") || norm.includes("трафик")) return "Лидогенерация";
  if (norm.includes("юрист") || norm.includes("бухгалтер") || norm.includes("договор") || norm.includes("налог")) return "Правовое сопровождение";
  if (norm.includes("ассистент") || norm.includes("координатор") || norm.includes("help") || norm.includes("забот")) return "Координация и забота";
  if (norm.includes("директор") || norm.includes("роп") || norm.includes("руководител") || norm.includes("тимлид") || norm.includes("лид") || norm.includes("head") || norm.includes("ceo") || norm.includes("cfo") || norm.includes("cto") || norm.includes("coo")) {
    return "Руководство и наставничество";
  }
  if (norm.includes("hr") || norm.includes("кадр") || norm.includes("рекрут") || norm.includes("найм")) return "HR и адаптация";
  if (norm.includes("продаж") || norm.includes("sales") || norm.includes("менеджер")) return "Эксперт продаж";
  if (norm.includes("разработ") || norm.includes("it") || norm.includes("технолог")) return "ИТ и разработка";
  return "Наставник направления";
}

export const TeamView: React.FC<SectionProps> = ({ project, onChangeText, isEditable, themeConfig }) => {
  const text = project.teamText || "• [Отдел] Отдел адаптации и наставничества\n• [CEO] Александр — утверждает стратегию и бюджеты\n• [Head of Sales] Дмитрий — согласование лидогенерации\n• [Директор по развитию] Задаёт стратегию, контролирует качество и растит экспертов\n• [Эксперт РОП] Управляет продажами клиента — ведёт до 2 проектов параллельно\n• [Маркетинг] Генерирует лиды и продвигает проекты, чтобы ты не думал где брать заявки\n• [Юристы и бухгалтерия] Полностью закрывают договоры, налоги и отчётность — никакой бюрократии\n• [Ассистент] Помогает с координацией внутри компании и следит чтобы выплаты приходили вовремя\n• [Коллеги] Команда опытных профи из 16 стран — обмен опытом и поддержка без границ";
  const lines = text.split("\n").map(l => l.replace(/^[•\s-*]+/, "").trim()).filter(Boolean);

  const defaultMentors = [
    { title: "Дмитрий", subtitle: "Тимлид проектов", text: "Составил идеальные Wiki-разборы, проходя по которым легко закрыть любое возражение за секунду." },
    { title: "Ольга", subtitle: "HR куратор", text: "Отвечает за регистрацию договоров в базе, выдачу документов и автоматизированные начисления." },
    { title: "Мария", subtitle: "Обучение кадров", text: "Поможет сдать тестовый разговор в ИИ-режиме с первой попытки без лишнего стресса." }
  ];

  // Parse departments and employee lists
  const parsedGroups: { department: string; members: ParsedMember[] }[] = [];
  let currentDept = "Отдел адаптации соискателей";
  let activeMembers: ParsedMember[] = [];

  lines.forEach((l, idx) => {
    const isDept = l.startsWith("[Отдел]") || l.startsWith("Отдел:") || l.startsWith("[Департамент]") || l.startsWith("Департамент:");
    if (isDept) {
      if (activeMembers.length > 0) {
        parsedGroups.push({ department: currentDept, members: activeMembers });
      }
      currentDept = l.replace(/^(\[Отдел\]|Отдел:|\[Департамент\]|Департамент:)\s*/i, "").trim() || "Отдел адаптации соискателей";
      activeMembers = [];
    } else {
      // 1. Try format with bracket: "[Role/Tag] Rest..."
      const tagMatch = l.match(/^\[([^\]]+)\]\s*(.*)$/);
      if (tagMatch) {
        const tag = tagMatch[1].trim();
        const rest = tagMatch[2].trim();
        const sepMatch = rest.match(/\s*[—–-]\s+/);

        if (sepMatch) {
          const sepIx = rest.indexOf(sepMatch[0]);
          const beforeDash = rest.substring(0, sepIx).trim();
          const afterDash = rest.substring(sepIx + sepMatch[0].length).trim();

          if (isPersonName(beforeDash)) {
            // [CEO] Александр — утверждает стратегию и бюджеты
            activeMembers.push({
              name: beforeDash,
              role: tag,
              desc: afterDash,
              hasPersonName: true,
              initials: getInitials(beforeDash, tag, true),
            });
          } else {
            // [Эксперт РОП] Управляет продажами клиента — ведёт до 2 проектов параллельно
            // [Юристы и бухгалтерия] Полностью закрывают договоры, налоги и отчётность — никакой бюрократии
            const combinedDesc = beforeDash ? `${beforeDash} — ${afterDash}` : afterDash;
            activeMembers.push({
              name: "",
              role: tag,
              desc: combinedDesc,
              hasPersonName: false,
              initials: getInitials("", tag, false),
              badgeLabel: getRoleBadgeLabel(tag),
            });
          }
        } else {
          // No dash inside rest: "[Директор по развитию] Задаёт стратегию, контролирует качество и растит экспертов"
          if (isPersonName(rest) && rest.length < 25 && !rest.includes(":") && !rest.includes(";")) {
            activeMembers.push({
              name: rest,
              role: tag,
              desc: "",
              hasPersonName: true,
              initials: getInitials(rest, tag, true),
            });
          } else {
            activeMembers.push({
              name: "",
              role: tag,
              desc: rest,
              hasPersonName: false,
              initials: getInitials("", tag, false),
              badgeLabel: getRoleBadgeLabel(tag),
            });
          }
        }
      } else {
        // 2. Format without bracket: "Name - Role. Description" or "Role - Description"
        const sepMatch = l.match(/\s+[—–-]\s+/);
        if (sepMatch) {
          const sepIx = l.indexOf(sepMatch[0]);
          const before = l.substring(0, sepIx).trim();
          const after = l.substring(sepIx + sepMatch[0].length).trim();
          const dotIx = after.indexOf(".");

          if (dotIx !== -1) {
            const partRole = after.substring(0, dotIx).trim();
            const partDesc = after.substring(dotIx + 1).trim();
            if (isPersonName(before)) {
              activeMembers.push({
                name: before,
                role: partRole,
                desc: partDesc,
                hasPersonName: true,
                initials: getInitials(before, partRole, true),
              });
            } else {
              activeMembers.push({
                name: "",
                role: before,
                desc: after,
                hasPersonName: false,
                initials: getInitials("", before, false),
                badgeLabel: getRoleBadgeLabel(before),
              });
            }
          } else {
            if (isPersonName(before)) {
              activeMembers.push({
                name: before,
                role: after,
                desc: "",
                hasPersonName: true,
                initials: getInitials(before, after, true),
              });
            } else {
              activeMembers.push({
                name: "",
                role: before,
                desc: after,
                hasPersonName: false,
                initials: getInitials("", before, false),
                badgeLabel: getRoleBadgeLabel(before),
              });
            }
          }
        } else {
          const fallback = defaultMentors[idx % defaultMentors.length] || { title: "Сотрудник", subtitle: "Куратор новичков", text: l };
          activeMembers.push({
            name: fallback.title,
            role: fallback.subtitle,
            desc: l,
            hasPersonName: true,
            initials: getInitials(fallback.title, fallback.subtitle, true),
          });
        }
      }
    }
  });

  if (activeMembers.length > 0 || parsedGroups.length === 0) {
    parsedGroups.push({ department: currentDept, members: activeMembers });
  }

  const containerRadius = themeConfig?.containerBorderRadius !== undefined 
    ? `${themeConfig.containerBorderRadius}px` 
    : undefined;
  const containerBorderWidth = themeConfig?.containerBorderWidth !== undefined 
    ? `${themeConfig.containerBorderWidth}px` 
    : undefined;
  const containerBorderColor = hexToRgba(themeConfig?.containerBorderColor || "#FFFFFF", themeConfig?.containerBorderOpacity ?? 20);
  const containerBg = hexToRgba(themeConfig?.containerBgColor || "#17344F", themeConfig?.containerBgOpacity ?? 0);
  const glassBlur = `${themeConfig?.glassBlurPx ?? 24}px`;
  const iconColor = themeConfig?.iconColor || "#E7C768";
  const fontFamily = themeConfig?.fontFamily;

  const cardStyle: React.CSSProperties = {
    borderRadius: containerRadius,
    borderWidth: containerBorderWidth,
    borderColor: containerBorderColor,
    backgroundColor: containerBg,
    backdropFilter: `blur(${glassBlur})`,
    WebkitBackdropFilter: `blur(${glassBlur})`,
    fontFamily: fontFamily || undefined,
  };

  const avatarStyle: React.CSSProperties = {
    borderRadius: containerRadius,
    borderWidth: containerBorderWidth,
    borderColor: containerBorderColor,
    backgroundColor: containerBg,
    color: iconColor,
    backdropFilter: `blur(${glassBlur})`,
    WebkitBackdropFilter: `blur(${glassBlur})`,
  };

  const isSilver = themeConfig?.headingsColorMode === "gradient-silver";
  const isSolid = themeConfig?.headingsColorMode === "solid";
  const solidHeadingColor = themeConfig?.headingsSolidColor || "#E7C768";
  const headingStyle = getHeadingStyle(themeConfig);

  return (
    <div className="space-y-6 text-left" style={{ fontFamily: fontFamily || undefined }}>
      {isEditable ? (
        <div 
          style={cardStyle}
          className="space-y-3 bg-transparent backdrop-blur-xl border border-white/20 rounded-2xl p-5"
        >
          <div className="flex justify-between items-center">
            <label className="text-sm font-bold block" style={headingStyle}>
              Команда адаптации соискателей по отделам:
            </label>
            <span className="text-sm text-slate-300">Формат: [Роль] Имя — описание ИЛИ [Роль] Описание</span>
          </div>
          <textarea
            className="w-full bg-transparent text-sm p-3 rounded-xl border border-white/20 text-white font-mono backdrop-blur-md"
            rows={8}
            value={text}
            onChange={(e) => onChangeText?.("teamText", e.target.value)}
            placeholder="• [Отдел] Отдел продаж&#10;• [CEO] Александр — утверждает стратегию и бюджеты&#10;• [Директор по развитию] Задаёт стратегию, контролирует качество и растит экспертов&#10;• [Команда] 8 человек: бренд-менеджер, таргетолог, контент-лид"
          />
          <div className="text-sm text-slate-200 bg-transparent p-3 rounded-xl border border-white/20 font-sans backdrop-blur-md leading-relaxed">
            💡 Напишите <strong>[Отдел] Название отдела</strong> для группировки. Для членов команды используйте <strong>[Роль] Имя — описание</strong> или просто <strong>[Роль] Описание задач</strong>.
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <span className="text-sm font-bold block text-left" style={headingStyle}>
            👥 Структура отделов и наставники компании:
          </span>
          
          <div className="space-y-6">
            {parsedGroups.map((group, groupIdx) => (
              <div key={groupIdx} className="space-y-3.5 text-left">
                <div className="flex items-center gap-2 border-b border-white/10 pb-2">
                  <div className="w-2 h-4 rounded-full animate-pulse" style={{ backgroundColor: iconColor }} />
                  <h4 className="text-sm sm:text-base font-extrabold" style={headingStyle}>
                    {group.department}
                  </h4>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {group.members.map((m, i) => (
                    <div 
                      key={i} 
                      style={cardStyle}
                      className="vacancy-subcard team-member-card liquid-glass-card group relative p-4 sm:p-5 text-left flex flex-col justify-between transition-all duration-300 shadow-md min-h-[160px]"
                    >
                      <div className="space-y-3">
                        <div className="flex items-center gap-3">
                          <div 
                            style={avatarStyle}
                            className="team-avatar-box w-11 h-11 rounded-2xl flex items-center justify-center font-bold text-sm select-none shrink-0 shadow-sm border border-white/20"
                          >
                            {m.initials}
                          </div>
                          <div className="min-w-0 flex-1">
                            <h5 className="text-sm sm:text-base font-bold text-white leading-tight break-words">
                              {m.hasPersonName ? m.name : m.role}
                            </h5>
                            <span 
                              style={{ color: iconColor }}
                              className="text-sm font-semibold leading-none mt-1 block break-words"
                            >
                              {m.hasPersonName ? m.role : (m.badgeLabel || "Наставник")}
                            </span>
                          </div>
                        </div>

                        {m.desc && (
                          <p 
                            style={{ color: themeConfig?.bodyTextColor || undefined }}
                            className="text-sm text-slate-200 leading-relaxed font-normal pt-1 break-words"
                          >
                            &ldquo;{m.desc}&rdquo;
                          </p>
                        )}
                      </div>

                      <div className="pt-3 mt-3 border-t border-white/10 flex items-center justify-between text-sm text-slate-300">
                        <span className="flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5 opacity-70" style={{ color: iconColor }} />
                          <span>Консультирует 24/7</span>
                        </span>
                        <span className="inline-flex items-center gap-1.5 font-semibold text-sm" style={{ color: iconColor }}>
                          <span className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: iconColor }} />
                          В сети
                        </span>
                      </div>
                    </div>
                  ))}
                  {group.members.length === 0 && (
                    <span className="text-slate-400 italic text-sm">В данном отделе кураторы не распределены.</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// -------------------------------------------------------------
// 8. ⚙️ SYSTEM VIEW (DAILY WORKFLOW & CRM PLATFORMS DETAIL)
// -------------------------------------------------------------
export const SystemView: React.FC<SectionProps> = ({ project, onChangeText, isEditable, themeConfig }) => {
  const text = project.systemText || "";
  const allLines = text.split("\n").map(l => l.replace(/^[•\s\-*]+/, "").trim()).filter(Boolean);

  // Lines like "[Tag] description | optional tip" become tabs.
  // Lines without [Tag] become a checklist below.
  const taggedLines: { id: string; title: string; desc: string; tip: string }[] = [];
  const plainLines: string[] = [];
  allLines.forEach((l, idx) => {
    const m = l.match(/^\[(.*?)\]\s*(.*)$/);
    if (m) {
      const parts = m[2].split("|");
      taggedLines.push({
        id: `tab_${idx}`,
        title: m[1].trim(),
        desc: (parts[0] || "").trim(),
        tip: (parts[1] || "").trim(),
      });
    } else {
      plainLines.push(l);
    }
  });

  // Optional separate cabinet tabs text (legacy). Only used if explicitly set.
  const rawCabinetText = project.cabinetTabsText || "";
  const cabinetLines = rawCabinetText.split("\n").map(l => l.replace(/^[•\s\-*]+/, "").trim()).filter(Boolean);
  const parsedExtraTabs = cabinetLines.map((l, idx) => {
    const m = l.match(/^\[(.*?)\]\s*(.*)$/);
    const title = m ? m[1].trim() : `Платформа ${idx + 1}`;
    const rest = m ? m[2] : l;
    const parts = rest.split("|");
    return {
      id: `ext_${idx}`,
      title,
      desc: (parts[0] || "").trim(),
      tip: (parts[1] || "").trim(),
    };
  });

  const allTabs = [...parsedExtraTabs, ...taggedLines];
  const [activeSystemIndex, setActiveSystemIndex] = useState(0);
  const activeTab = allTabs[activeSystemIndex] || allTabs[0];

  const iconColor = themeConfig?.iconColor || "#E7C768";
  const headingStyle = getHeadingStyle(themeConfig);
  const containerRadius = themeConfig?.containerBorderRadius !== undefined ? `${themeConfig.containerBorderRadius}px` : "16px";
  const containerBorder = hexToRgba(themeConfig?.containerBorderColor || "#FFFFFF", themeConfig?.containerBorderOpacity ?? 20);

  return (
    <div className="space-y-6 text-left">
      {isEditable ? (
        <div className="space-y-4 bg-transparent backdrop-blur-xl border border-white/20 rounded-2xl p-5">
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label className="text-sm font-bold block" style={headingStyle}>Интерактивный кабинет: вкладки рабочих платформ:</label>
              <span className="text-sm text-slate-300">Формат: [Таб] Описание | Секретный совет</span>
            </div>
            <textarea
              className="w-full bg-transparent backdrop-blur-md text-sm p-3 rounded-xl border border-white/20 text-white font-mono"
              rows={7}
              value={rawCabinetText}
              onChange={(e) => onChangeText?.("cabinetTabsText", e.target.value)}
              placeholder="Каждая вкладка с новой строки"
            />
          </div>

          <div className="pt-2 border-t border-white/10 space-y-2">
            <label className="text-sm font-bold block" style={headingStyle}>Ежедневная система регламентов и чек-лист отчетности (список):</label>
            <textarea
              className="w-full bg-transparent backdrop-blur-md text-sm p-3 rounded-xl border border-white/20 text-white font-mono"
              rows={5}
              value={text}
              onChange={(e) => onChangeText?.("systemText", e.target.value)}
              placeholder="Опишите регламент ежедневной работы по одной строке на пункт"
            />
          </div>
          <div className="text-sm text-slate-200 bg-transparent backdrop-blur-md p-3 rounded-xl border border-white/20 font-sans leading-relaxed">
            💡 Кастомизируйте вкладки разделяя девиз символом <strong>|</strong>, например: <code>[💻 amoCRM] Описание таба | 💡 Подсказка-регламент</code>
          </div>
        </div>
      ) : (
        <div className="space-y-5">

          {/* Interactive Work Tools Dashboard Panel — only if we have tagged tabs */}
          {allTabs.length > 0 && activeTab && (
          <div
            className="bg-transparent backdrop-blur-xl border p-4 sm:p-5 text-left space-y-4 shadow-lg"
            style={{ borderColor: containerBorder, borderRadius: containerRadius }}
          >
            <div className="flex items-center gap-2.5 pb-2.5 border-b border-white/10">
              <Cpu className="w-5 h-5 shrink-0" style={{ color: iconColor }} />
              <div>
                <h4 className="text-sm sm:text-base font-bold" style={headingStyle}>
                  Рабочие платформы и инструменты
                </h4>
                <p className="text-sm text-slate-300 block mt-0.5">Кликните по вкладке, чтобы подробно изучить ежедневные инструменты:</p>
              </div>
            </div>

            {/* Platform selection tabs */}
            <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(allTabs.length, 3)}, minmax(0, 1fr))` }}>
              {allTabs.map((tab, idx) => {
                  const isActive = activeSystemIndex === idx;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveSystemIndex(idx)}
                      style={getTabBtnStyle(isActive, themeConfig)}
                      className={`landing-tab-btn transition text-sm font-bold p-2.5 rounded-xl border text-center cursor-pointer whitespace-nowrap overflow-hidden text-ellipsis ${
                        isActive 
                          ? "landing-btn-active shadow-md" 
                          : "landing-btn-inactive backdrop-blur-md hover:border-white/40"
                      }`}
                    >
                      {tab.title}
                    </button>
                  );
                })}
            </div>

            {/* Platform workflow description block */}
            <div
              className="bg-transparent backdrop-blur-md border p-4 sm:p-5 space-y-3 min-h-[140px] flex flex-col justify-between"
              style={{ borderColor: containerBorder, borderRadius: containerRadius }}
            >
              <div className="space-y-2">
                <span className="text-sm font-mono font-bold block" style={{ color: iconColor }}>
                  {activeTab.title}
                </span>
                <p className="text-sm sm:text-base text-white leading-relaxed font-sans">
                  {activeTab.desc}
                </p>
              </div>
              {activeTab.tip && (
                <div
                  className="text-sm bg-transparent border p-3 rounded-xl text-white font-sans font-medium leading-relaxed mt-2.5 backdrop-blur-md"
                  style={{ borderColor: hexToRgba(iconColor, 40) }}
                >
                  💡 {activeTab.tip}
                </div>
              )}
            </div>
          </div>
          )}

          {/* Core Daily Workflow Criteria Checklist */}
          {plainLines.length > 0 && (
          <div
            className="bg-transparent backdrop-blur-xl border p-4 sm:p-5 space-y-3.5 text-left shadow-lg"
            style={{ borderColor: containerBorder, borderRadius: containerRadius }}
          >
            <span className="text-sm font-bold block" style={headingStyle}>
              Ежедневная система регламентов и отчетности:
            </span>
            <div className="space-y-2.5">
              {plainLines.map((crt, i) => (
                <div key={i} className="flex items-start gap-2.5 text-sm sm:text-base text-white">
                  <Check className="w-4 h-4 shrink-0 mt-1" style={{ color: iconColor }} />
                  <span className="leading-relaxed">{crt}</span>
                </div>
              ))}
            </div>
          </div>
          )}

          {allTabs.length === 0 && plainLines.length === 0 && (
            <div className="bg-transparent backdrop-blur-md border border-white/20 p-4 rounded-2xl text-sm text-slate-300 italic">
              Сведения о системе работы пока не заполнены.
            </div>
          )}

        </div>
      )}
    </div>
  );
};

