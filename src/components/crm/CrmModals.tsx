/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { X, Search, Filter, SlidersHorizontal, Check, RotateCcw, Calendar, Users, ArrowUpDown, Tag, Sparkles } from "lucide-react";
import { STANDARD_CANDIDATE_FIELDS, CandidateStandardFieldDef } from "@/lib/candidateFields";

export interface AvailableCustomField {
  key: string;
  label: string;
  options?: string[];
  type?: string;
  count?: number;
}

export interface CrmFieldFilters {
  // 26 standard candidate fields
  full_name?: string;
  gender?: string;
  resume_url?: string;
  phone?: string;
  email?: string;
  social_telegram?: string;
  social_whatsapp?: string;
  social_instagram?: string;
  social_vk?: string;
  social_max?: string;
  social_setka?: string;
  social_github?: string;
  country?: string;
  region?: string;
  city?: string;
  citizenship?: string;
  work_experience?: string;
  employment_type?: string;
  specializations?: string;
  work_schedule?: string;
  desired_commute_time?: string;
  desired_salary?: string;
  education?: string;
  languages?: string;
  skills?: string;
  driving_experience?: string;

  // Legacy camelCase aliases
  workExperience?: string;
  desiredSalary?: string;

  // Free-form custom pair
  customFieldKey?: string;
  customFieldValue?: string;

  // Dynamic custom fields from vacancies
  [key: string]: string | undefined;
}

interface CrmFilterModalProps {
  isOpen: boolean;
  onClose: () => void;
  crmSearch: string;
  setCrmSearch: (v: string) => void;
  crmFilterCompany: string;
  setCrmFilterCompany: (v: string) => void;
  crmCompanyOptions: string[];
  crmFilterRole: string;
  setCrmFilterRole: (v: string) => void;
  crmRoleOptions: string[];
  crmFilterStage: string;
  setCrmFilterStage: (v: string) => void;
  crmFilterDecision: string;
  setCrmFilterDecision: (v: string) => void;
  crmFilterVerdict: string;
  setCrmFilterVerdict: (v: string) => void;
  crmDatePreset: "all" | "24h" | "custom";
  setCrmDatePreset: (v: "all" | "24h" | "custom") => void;
  crmDateFrom: string;
  setCrmDateFrom: (v: string) => void;
  crmDateTo: string;
  setCrmDateTo: (v: string) => void;
  crmFieldFilters: CrmFieldFilters;
  setCrmFieldFilters: React.Dispatch<React.SetStateAction<CrmFieldFilters>>;
  crmSort: { field: string; dir: "asc" | "desc" };
  setCrmSort: React.Dispatch<React.SetStateAction<{ field: string; dir: "asc" | "desc" }>>;
  verdictCounts: { all: number; good: number; mid: number; low: number; none: number };
  matchedCount: number;
  onResetAll: () => void;
  isAdmin: boolean;
  availableCustomFields?: AvailableCustomField[];
}

export const CrmFilterModal: React.FC<CrmFilterModalProps> = ({
  isOpen,
  onClose,
  crmSearch,
  setCrmSearch,
  crmFilterCompany,
  setCrmFilterCompany,
  crmCompanyOptions,
  crmFilterRole,
  setCrmFilterRole,
  crmRoleOptions,
  crmFilterStage,
  setCrmFilterStage,
  crmFilterDecision,
  setCrmFilterDecision,
  crmFilterVerdict,
  setCrmFilterVerdict,
  crmDatePreset,
  setCrmDatePreset,
  crmDateFrom,
  setCrmDateFrom,
  crmDateTo,
  setCrmDateTo,
  crmFieldFilters,
  setCrmFieldFilters,
  crmSort,
  setCrmSort,
  verdictCounts,
  matchedCount,
  onResetAll,
  isAdmin,
  availableCustomFields = [],
}) => {
  const [fieldGroup, setFieldGroup] = React.useState<"all" | "contacts" | "socials" | "location" | "career" | "skills" | "custom">("all");
  const [fieldSearch, setFieldSearch] = React.useState<string>("");

  if (!isOpen) return null;

  // Active fields counter
  const activeFieldsCount = (() => {
    let count = 0;
    for (const [k, v] of Object.entries(crmFieldFilters)) {
      if (k === "customFieldKey" || k === "customFieldValue") continue;
      if (v && String(v).trim()) count++;
    }
    if (crmFieldFilters.customFieldKey?.trim() && crmFieldFilters.customFieldValue?.trim()) count++;
    return count;
  })();

  const handleFieldChange = (key: string, val: string) => {
    setCrmFieldFilters((prev) => {
      const next = { ...prev };
      if (val) {
        next[key] = val;
        if (key === "work_experience") next.workExperience = val;
        if (key === "desired_salary") next.desiredSalary = val;
      } else {
        delete next[key];
        if (key === "work_experience") delete next.workExperience;
        if (key === "desired_salary") delete next.desiredSalary;
      }
      return next;
    });
  };

  const handleClearAllFieldFilters = () => {
    setCrmFieldFilters((prev) => ({
      ...prev,
      city: undefined,
      citizenship: undefined,
      workExperience: undefined,
      desiredSalary: undefined,
      education: undefined,
      skills: undefined,
      customFieldKey: undefined,
      customFieldValue: undefined,
      ...Object.keys(prev).reduce((acc: any, k) => {
        acc[k] = undefined;
        return acc;
      }, {}),
    }));
  };

  // Group metadata
  const groupsList = [
    { key: "all" as const, label: "Все поля", count: STANDARD_CANDIDATE_FIELDS.length + availableCustomFields.length },
    { key: "contacts" as const, label: "Контакты", count: STANDARD_CANDIDATE_FIELDS.filter((f) => f.group === "contacts").length },
    { key: "socials" as const, label: "Соцсети", count: STANDARD_CANDIDATE_FIELDS.filter((f) => f.group === "socials").length },
    { key: "location" as const, label: "Локация", count: STANDARD_CANDIDATE_FIELDS.filter((f) => f.group === "location").length },
    { key: "career" as const, label: "Карьера", count: STANDARD_CANDIDATE_FIELDS.filter((f) => f.group === "career").length },
    { key: "skills" as const, label: "Навыки", count: STANDARD_CANDIDATE_FIELDS.filter((f) => f.group === "skills").length },
    { key: "custom" as const, label: "Кастомные поля", count: availableCustomFields.length },
  ];

  // Prepare standard fields display list
  const filteredStandardFields = STANDARD_CANDIDATE_FIELDS.filter((f) => {
    if (fieldGroup !== "all" && fieldGroup !== f.group) return false;
    if (fieldSearch.trim()) {
      const q = fieldSearch.toLowerCase().trim();
      return f.label.toLowerCase().includes(q) || f.key.toLowerCase().includes(q);
    }
    return true;
  });

  // Prepare custom fields display list
  const filteredCustomFields = availableCustomFields.filter((cf) => {
    if (fieldGroup !== "all" && fieldGroup !== "custom") return false;
    if (fieldSearch.trim()) {
      const q = fieldSearch.toLowerCase().trim();
      return cf.label.toLowerCase().includes(q) || cf.key.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-transparent overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-3xl bg-transparent backdrop-blur-2xl border border-white/20 rounded-3xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden text-white my-auto">
        {/* Header */}
        <div className="bg-transparent backdrop-blur-md px-5 py-4 border-b border-white/15 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl border border-[#d4af37]/60 flex items-center justify-center text-[#fceabb]">
              <Filter className="w-4 h-4 text-[#fceabb]" />
            </div>
            <div>
              <h3 className="text-[16px] font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">
                Фильтры, поиск и сортировка
              </h3>
              <p className="text-[14px] text-white/70">
                {isAdmin ? "Режим администратора системы: доступ ко всем записям" : "Кандидаты и вакансии текущего работодателя"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onResetAll}
              className="inline-flex items-center gap-1.5 text-[14px] text-white/80 hover:text-white px-3 py-1.5 rounded-xl border border-white/20 hover:border-white/40 transition active:scale-95"
              title="Сбросить все параметры фильтрации"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Сбросить всё</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl border border-white/15 hover:border-white/40 text-white/80 hover:text-white transition active:scale-95"
              aria-label="Закрыть"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6 text-[14px] text-left">
          {/* Global Search */}
          <div className="space-y-1.5">
            <label className="text-[14px] font-semibold text-[#fceabb] flex items-center gap-1.5">
              <Search className="w-4 h-4 text-[#E7C768]" />
              <span>Поиск по кандидатам</span>
            </label>
            <div className="relative flex items-center bg-transparent backdrop-blur-xl border border-white/20 px-3.5 py-2.5 rounded-xl focus-within:border-[#d4af37]">
              <Search className="w-4 h-4 text-white/50 mr-2.5 shrink-0" />
              <input
                type="text"
                className="bg-transparent text-[14px] text-white placeholder-white/45 focus:outline-none w-full"
                placeholder="Поиск по ФИО, email, телефону, навыкам, городу, образованию или кастомным полям..."
                value={crmSearch}
                onChange={(e) => setCrmSearch(e.target.value)}
              />
              {crmSearch && (
                <button
                  type="button"
                  onClick={() => setCrmSearch("")}
                  className="p-1 text-white/50 hover:text-white transition"
                  title="Очистить поиск"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* AI Verdict Filter with accurate real dynamic counts */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[14px] font-semibold text-[#fceabb]">Статус оценки ИИ</span>
              <span className="text-[14px] text-white/60">Учитывает выбранные критерии</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {([
                { key: "all", label: "Всего", count: verdictCounts.all },
                { key: "good", label: "Одобрен", count: verdictCounts.good },
                { key: "mid", label: "Частично", count: verdictCounts.mid },
                { key: "low", label: "Не подходит", count: verdictCounts.low },
                { key: "none", label: "Ожидает оценки", count: verdictCounts.none },
              ] as const).map((item) => {
                const active = crmFilterVerdict === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setCrmFilterVerdict(item.key)}
                    className={`rounded-xl border p-2.5 text-center text-[14px] font-bold transition backdrop-blur-md flex flex-col items-center justify-center gap-0.5 ${
                      active
                        ? "border-[#d4af37] bg-transparent text-[#fceabb] shadow-[0_0_12px_rgba(212,175,55,0.25)]"
                        : "border-white/20 bg-transparent text-white/80 hover:border-[#d4af37]/60 hover:text-white"
                    }`}
                  >
                    <span>{item.label}</span>
                    <span className="text-[14px] font-mono text-[#fceabb]">{item.count}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Core selectors: Company, Role, Stage, Decision */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[14px] font-semibold text-white/90">Компания</label>
              <select
                value={crmFilterCompany}
                onChange={(e) => setCrmFilterCompany(e.target.value)}
                className="w-full bg-transparent backdrop-blur-xl text-white border border-white/20 rounded-xl text-[14px] px-3.5 py-2.5 focus:outline-none focus:border-[#d4af37]"
              >
                <option value="all" className="bg-[#17344F] text-white">Все компании</option>
                {crmCompanyOptions.map((co) => (
                  <option key={co} value={co} className="bg-[#17344F] text-white">{co}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-[14px] font-semibold text-white/90">Вакансия</label>
              <select
                value={crmFilterRole}
                onChange={(e) => setCrmFilterRole(e.target.value)}
                className="w-full bg-transparent backdrop-blur-xl text-white border border-white/20 rounded-xl text-[14px] px-3.5 py-2.5 focus:outline-none focus:border-[#d4af37]"
              >
                <option value="all" className="bg-[#17344F] text-white">Все вакансии</option>
                {crmRoleOptions.map((r) => (
                  <option key={r} value={r} className="bg-[#17344F] text-white">{r}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-[14px] font-semibold text-white/90">Этап воронки</label>
              <select
                value={crmFilterStage}
                onChange={(e) => setCrmFilterStage(e.target.value)}
                className="w-full bg-transparent backdrop-blur-xl text-white border border-white/20 rounded-xl text-[14px] px-3.5 py-2.5 focus:outline-none focus:border-[#d4af37]"
              >
                <option value="all" className="bg-[#17344F] text-white">Все этапы</option>
                <option value="registration" className="bg-[#17344F] text-white">1. Регистрация</option>
                <option value="screening" className="bg-[#17344F] text-white">2. Скрининг</option>
                <option value="checklist" className="bg-[#17344F] text-white">3. Чеклист</option>
                <option value="situations" className="bg-[#17344F] text-white">4. Ситуации</option>
                <option value="interview_reject" className="bg-[#17344F] text-white">5. Интервью отказ</option>
                <option value="interview_success" className="bg-[#17344F] text-white">6. Интервью успех</option>
                <option value="professional" className="bg-[#17344F] text-white">7. Профессия</option>
                <option value="product" className="bg-[#17344F] text-white">8. Продукт</option>
                <option value="systems" className="bg-[#17344F] text-white">9. Система</option>
                <option value="certified" className="bg-[#17344F] text-white">10. Сертификат</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-[14px] font-semibold text-white/90">Решение работодателя</label>
              <select
                value={crmFilterDecision}
                onChange={(e) => setCrmFilterDecision(e.target.value)}
                className="w-full bg-transparent backdrop-blur-xl text-white border border-white/20 rounded-xl text-[14px] px-3.5 py-2.5 focus:outline-none focus:border-[#d4af37]"
              >
                <option value="all" className="bg-[#17344F] text-white">Все решения</option>
                <option value="invited" className="bg-[#17344F] text-white">✓ Приглашён на работу</option>
                <option value="review" className="bg-[#17344F] text-white">◔ На рассмотрении</option>
                <option value="rejected" className="bg-[#17344F] text-white">✗ Отказано</option>
                <option value="none" className="bg-[#17344F] text-white">Без решения</option>
              </select>
            </div>
          </div>

          {/* Date range filter */}
          <div className="space-y-2">
            <label className="text-[14px] font-semibold text-white/90 flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-[#E7C768]" />
              <span>Период изменения</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <select
                value={crmDatePreset}
                onChange={(e) => setCrmDatePreset(e.target.value as any)}
                className="bg-transparent backdrop-blur-xl text-white border border-white/20 rounded-xl text-[14px] px-3.5 py-2.5 focus:outline-none focus:border-[#d4af37]"
              >
                <option value="all" className="bg-[#17344F] text-white">Все даты</option>
                <option value="24h" className="bg-[#17344F] text-white">За последние 24 часа</option>
                <option value="custom" className="bg-[#17344F] text-white">Указать период…</option>
              </select>

              {crmDatePreset === "custom" && (
                <>
                  <input
                    type="date"
                    value={crmDateFrom}
                    onChange={(e) => setCrmDateFrom(e.target.value)}
                    placeholder="С даты"
                    className="bg-transparent backdrop-blur-xl text-white border border-white/20 rounded-xl text-[14px] px-3.5 py-2.5 focus:outline-none focus:border-[#d4af37]"
                  />
                  <input
                    type="date"
                    value={crmDateTo}
                    onChange={(e) => setCrmDateTo(e.target.value)}
                    placeholder="По дату"
                    className="bg-transparent backdrop-blur-xl text-white border border-white/20 rounded-xl text-[14px] px-3.5 py-2.5 focus:outline-none focus:border-[#d4af37]"
                  />
                </>
              )}
            </div>
          </div>

          {/* Standard and Custom Candidate Fields */}
          <div className="space-y-4 pt-2 border-t border-white/10">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h4 className="text-[15px] font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent flex items-center gap-2">
                  <span>Поиск по 26 полям анкеты и кастомным полям вакансий</span>
                  {activeFieldsCount > 0 && (
                    <span className="text-[12px] font-mono px-2 py-0.5 rounded-full border border-[#d4af37] text-[#fceabb] bg-transparent">
                      активно: {activeFieldsCount}
                    </span>
                  )}
                </h4>
                <p className="text-[14px] text-white/70 mt-0.5">
                  Фильтрация по резюме, анкетам соискателей и всем дополнительным полям вакансий
                </p>
              </div>

              {activeFieldsCount > 0 && (
                <button
                  type="button"
                  onClick={handleClearAllFieldFilters}
                  className="self-start sm:self-auto text-[14px] text-white/80 hover:text-white px-3 py-1.5 rounded-xl border border-white/20 hover:border-white/40 transition active:scale-95 inline-flex items-center gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Очистить поля</span>
                </button>
              )}
            </div>

            {/* Field Search & Group Tabs */}
            <div className="space-y-2.5">
              <div className="relative flex items-center bg-transparent backdrop-blur-xl border border-white/20 px-3.5 py-2 rounded-xl focus-within:border-[#d4af37]">
                <Search className="w-4 h-4 text-white/50 mr-2 shrink-0" />
                <input
                  type="text"
                  placeholder="Быстрый поиск нужного поля (например: телефон, зарплата, telegram, права...)"
                  value={fieldSearch}
                  onChange={(e) => setFieldSearch(e.target.value)}
                  className="bg-transparent text-[14px] text-white placeholder-white/45 focus:outline-none w-full"
                />
                {fieldSearch && (
                  <button
                    type="button"
                    onClick={() => setFieldSearch("")}
                    className="p-1 text-white/50 hover:text-white transition"
                    title="Очистить поиск поля"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Group filter pills with wrap - mobile-friendly without horizontal scroll */}
              <div className="flex flex-wrap gap-1.5">
                {groupsList.map((g) => {
                  const active = fieldGroup === g.key;
                  return (
                    <button
                      key={g.key}
                      type="button"
                      onClick={() => setFieldGroup(g.key)}
                      className={`text-[14px] px-3 py-1.5 rounded-xl border transition-all flex items-center gap-1.5 backdrop-blur-md ${
                        active
                          ? "border-[#d4af37] bg-transparent text-[#fceabb] shadow-[0_0_10px_rgba(212,175,55,0.2)]"
                          : "border-white/15 bg-transparent text-white/75 hover:border-white/35 hover:text-white"
                      }`}
                    >
                      <span>{g.label}</span>
                      <span className="font-mono text-[12px] opacity-80">({g.count})</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* List of Fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[460px] overflow-y-auto pr-1">
              {/* 1. Standard candidate fields (all 26) */}
              {filteredStandardFields.map((f) => {
                const curVal =
                  crmFieldFilters[f.key] ||
                  (f.key === "work_experience" ? crmFieldFilters.workExperience : f.key === "desired_salary" ? crmFieldFilters.desiredSalary : "") ||
                  "";
                const isFieldActive = Boolean(curVal && curVal.trim());

                return (
                  <div
                    key={f.key}
                    className={`p-3 rounded-2xl border transition-all space-y-1.5 bg-transparent backdrop-blur-xl ${
                      isFieldActive
                        ? "border-[#d4af37] shadow-[0_0_10px_rgba(212,175,55,0.15)]"
                        : "border-white/15 hover:border-white/30"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1.5">
                      <label className="text-[14px] font-semibold text-white/90 truncate" title={f.label}>
                        {f.label}
                      </label>
                      <span className="text-[12px] text-white/50 shrink-0 font-mono">
                        {f.group === "contacts" && "контакты"}
                        {f.group === "socials" && "соцсети"}
                        {f.group === "location" && "локация"}
                        {f.group === "career" && "карьера"}
                        {f.group === "skills" && "навыки"}
                      </span>
                    </div>

                    <div className="relative flex items-center">
                      <input
                        type="text"
                        placeholder={f.placeholder || `Фильтр по полю: ${f.label}`}
                        value={curVal}
                        onChange={(e) => handleFieldChange(f.key, e.target.value)}
                        className="w-full bg-transparent text-white border border-white/20 rounded-xl text-[14px] px-3 py-2 pr-7 focus:outline-none focus:border-[#d4af37]"
                      />
                      {isFieldActive && (
                        <button
                          type="button"
                          onClick={() => handleFieldChange(f.key, "")}
                          className="absolute right-2 text-white/50 hover:text-white p-1"
                          title="Очистить поле"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {/* Predefined quick option chips */}
                    {f.options && f.options.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-0.5">
                        {f.options.slice(0, 6).map((opt) => {
                          const isSelected = curVal.toLowerCase().includes(opt.toLowerCase());
                          return (
                            <button
                              key={opt}
                              type="button"
                              onClick={() => {
                                if (isSelected) {
                                  const parts = curVal
                                    .split(",")
                                    .map((p) => p.trim())
                                    .filter((p) => p.toLowerCase() !== opt.toLowerCase());
                                  handleFieldChange(f.key, parts.join(", "));
                                } else {
                                  handleFieldChange(f.key, curVal ? `${curVal}, ${opt}` : opt);
                                }
                              }}
                              className={`text-[12px] px-2 py-0.5 rounded-lg border transition-all ${
                                isSelected
                                  ? "bg-[#d4af37]/20 border-[#d4af37] text-[#fceabb]"
                                  : "bg-transparent border-white/15 text-white/70 hover:border-white/35 hover:text-white"
                              }`}
                            >
                              {opt}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* 2. Custom fields across all vacancies */}
              {filteredCustomFields.map((cf) => {
                const curVal = crmFieldFilters[cf.key] || "";
                const isFieldActive = Boolean(curVal && curVal.trim());

                return (
                  <div
                    key={cf.key}
                    className={`p-3 rounded-2xl border transition-all space-y-1.5 bg-transparent backdrop-blur-xl ${
                      isFieldActive
                        ? "border-[#d4af37] shadow-[0_0_10px_rgba(212,175,55,0.15)]"
                        : "border-white/15 hover:border-white/30"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1.5">
                      <label className="text-[14px] font-semibold text-[#fceabb] truncate flex items-center gap-1.5" title={cf.label}>
                        <Sparkles className="w-3 h-3 text-[#E7C768] shrink-0" />
                        <span>{cf.label}</span>
                      </label>
                      <span className="text-[12px] text-[#fceabb]/70 shrink-0 font-mono">
                        кастомное {cf.count ? `(${cf.count})` : ""}
                      </span>
                    </div>

                    <div className="relative flex items-center">
                      <input
                        type="text"
                        placeholder={`Значение кастомного поля: ${cf.label}`}
                        value={curVal}
                        onChange={(e) => handleFieldChange(cf.key, e.target.value)}
                        className="w-full bg-transparent text-white border border-white/20 rounded-xl text-[14px] px-3 py-2 pr-7 focus:outline-none focus:border-[#d4af37]"
                      />
                      {isFieldActive && (
                        <button
                          type="button"
                          onClick={() => handleFieldChange(cf.key, "")}
                          className="absolute right-2 text-white/50 hover:text-white p-1"
                          title="Очистить поле"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {/* Predefined custom option chips if available */}
                    {cf.options && cf.options.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-0.5">
                        {cf.options.slice(0, 6).map((opt) => {
                          const isSelected = curVal.toLowerCase().includes(opt.toLowerCase());
                          return (
                            <button
                              key={opt}
                              type="button"
                              onClick={() => {
                                if (isSelected) {
                                  const parts = curVal
                                    .split(",")
                                    .map((p) => p.trim())
                                    .filter((p) => p.toLowerCase() !== opt.toLowerCase());
                                  handleFieldChange(cf.key, parts.join(", "));
                                } else {
                                  handleFieldChange(cf.key, curVal ? `${curVal}, ${opt}` : opt);
                                }
                              }}
                              className={`text-[12px] px-2 py-0.5 rounded-lg border transition-all ${
                                isSelected
                                  ? "bg-[#d4af37]/20 border-[#d4af37] text-[#fceabb]"
                                  : "bg-transparent border-white/15 text-white/70 hover:border-white/35 hover:text-white"
                              }`}
                            >
                              {opt}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}

              {filteredStandardFields.length === 0 && filteredCustomFields.length === 0 && (
                <div className="col-span-full py-8 text-center text-white/60 text-[14px]">
                  По запросу «{fieldSearch}» полей не найдено
                </div>
              )}
            </div>

            {/* Free-form Custom Field Filter pair */}
            <div className="p-3.5 rounded-2xl border border-white/15 bg-transparent backdrop-blur-md space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[14px] font-semibold text-white/90">
                  Ручной поиск по любому названию поля и значению
                </span>
                <span className="text-[12px] text-white/50">Для нетипичных или скрытых свойств</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <input
                  type="text"
                  placeholder="Точное название поля (например: Наличие авто, Английский)"
                  value={crmFieldFilters.customFieldKey || ""}
                  onChange={(e) => setCrmFieldFilters((prev) => ({ ...prev, customFieldKey: e.target.value }))}
                  className="w-full bg-transparent backdrop-blur-xl text-white border border-white/20 rounded-xl text-[14px] px-3 py-2 focus:outline-none focus:border-[#d4af37]"
                />
                <input
                  type="text"
                  placeholder="Значение поля для поиска"
                  value={crmFieldFilters.customFieldValue || ""}
                  onChange={(e) => setCrmFieldFilters((prev) => ({ ...prev, customFieldValue: e.target.value }))}
                  className="w-full bg-transparent backdrop-blur-xl text-white border border-white/20 rounded-xl text-[14px] px-3 py-2 focus:outline-none focus:border-[#d4af37]"
                />
              </div>
            </div>
          </div>

          {/* Sorting controls */}
          <div className="space-y-2 pt-2 border-t border-white/10">
            <label className="text-[14px] font-semibold text-white/90 flex items-center gap-1.5">
              <ArrowUpDown className="w-4 h-4 text-[#E7C768]" />
              <span>Сортировка списка</span>
            </label>
            <div className="flex flex-wrap items-center gap-2">
              {([
                { field: "name", label: "Имя кандидата" },
                { field: "created", label: "Дата создания" },
                { field: "updated", label: "Дата изменения" },
              ] as const).map((s) => {
                const active = crmSort.field === s.field;
                return (
                  <button
                    key={s.field}
                    type="button"
                    onClick={() =>
                      setCrmSort((prev) =>
                        prev.field === s.field
                          ? { field: s.field, dir: prev.dir === "asc" ? "desc" : "asc" }
                          : { field: s.field, dir: s.field === "name" ? "asc" : "desc" }
                      )
                    }
                    className={`inline-flex items-center gap-2 text-[14px] font-bold px-3.5 py-2 rounded-xl border transition backdrop-blur-md ${
                      active
                        ? "border-[#d4af37] text-[#fceabb] bg-transparent shadow-[0_0_10px_rgba(212,175,55,0.2)]"
                        : "border-white/20 text-white/80 hover:border-white/40 hover:text-white bg-transparent"
                    }`}
                  >
                    <span>{s.label}</span>
                    <span className="font-mono text-[14px] opacity-80">
                      {active ? (crmSort.dir === "asc" ? "↑ по возр." : "↓ по убыв.") : "↕"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-transparent backdrop-blur-md px-5 py-4 border-t border-white/15 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <div className="text-[14px] text-white/70">
            Найдено кандидатов: <span className="font-mono text-[#fceabb] font-bold">{matchedCount}</span>
          </div>
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button
              type="button"
              onClick={onResetAll}
              className="flex-1 sm:flex-none text-[14px] px-4 py-2.5 rounded-xl border border-white/20 text-white/80 hover:text-white hover:border-white/40 transition active:scale-95"
            >
              Сбросить
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 sm:flex-none text-[14px] font-bold px-5 py-2.5 rounded-xl border border-[#d4af37] bg-transparent text-[#fceabb] shadow-[0_0_14px_rgba(212,175,55,0.3)] hover:brightness-110 active:scale-95 transition"
            >
              Применить ({matchedCount})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

interface KanbanColumnModalProps {
  stage: string | null;
  stageTitle: string;
  onClose: () => void;
  colSearch: string;
  setColSearch: (v: string) => void;
  colVerdict: string;
  setColVerdict: (v: string) => void;
  colDecision: string;
  setColDecision: (v: string) => void;
  colSort: { field: "name" | "date" | "score"; dir: "asc" | "desc" } | undefined;
  setColSort: (v: { field: "name" | "date" | "score"; dir: "asc" | "desc" } | undefined) => void;
  totalInColumn: number;
  onResetCol: () => void;
}

export const KanbanColumnModal: React.FC<KanbanColumnModalProps> = ({
  stage,
  stageTitle,
  onClose,
  colSearch,
  setColSearch,
  colVerdict,
  setColVerdict,
  colDecision,
  setColDecision,
  colSort,
  setColSort,
  totalInColumn,
  onResetCol,
}) => {
  if (!stage) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-transparent overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-lg bg-transparent backdrop-blur-2xl border border-white/20 rounded-3xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden text-white my-auto">
        {/* Header */}
        <div className="bg-transparent backdrop-blur-md px-5 py-4 border-b border-white/15 flex items-center justify-between">
          <div>
            <h3 className="text-[16px] font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">
              Колонка: {stageTitle}
            </h3>
            <p className="text-[14px] text-white/70">
              Поиск, фильтрация и сортировка внутри этапа ({totalInColumn} соискателей)
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl border border-white/15 hover:border-white/40 text-white/80 hover:text-white transition active:scale-95"
            aria-label="Закрыть"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 overflow-y-auto text-left text-[14px]">
          {/* Search inside this stage */}
          <div className="space-y-1.5">
            <label className="text-[14px] font-semibold text-white/90">Поиск в колонке</label>
            <div className="relative flex items-center bg-transparent backdrop-blur-xl border border-white/20 px-3 py-2 rounded-xl focus-within:border-[#d4af37]">
              <Search className="w-4 h-4 text-white/50 mr-2 shrink-0" />
              <input
                type="text"
                placeholder="ФИО, контакты, город, навыки..."
                value={colSearch}
                onChange={(e) => setColSearch(e.target.value)}
                className="bg-transparent text-[14px] text-white placeholder-white/45 focus:outline-none w-full"
              />
              {colSearch && (
                <button type="button" onClick={() => setColSearch("")} className="p-1 text-white/50 hover:text-white">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* AI Verdict within column */}
          <div className="space-y-1.5">
            <label className="text-[14px] font-semibold text-white/90">Вердикт ИИ в колонке</label>
            <select
              value={colVerdict}
              onChange={(e) => setColVerdict(e.target.value)}
              className="w-full bg-transparent backdrop-blur-xl text-white border border-white/20 rounded-xl text-[14px] px-3 py-2 focus:outline-none focus:border-[#d4af37]"
            >
              <option value="all" className="bg-[#17344F] text-white">Все вердикты</option>
              <option value="good" className="bg-[#17344F] text-white">Одобрен</option>
              <option value="mid" className="bg-[#17344F] text-white">Частично</option>
              <option value="low" className="bg-[#17344F] text-white">Не подходит</option>
              <option value="none" className="bg-[#17344F] text-white">Ожидает оценки</option>
            </select>
          </div>

          {/* Decision within column */}
          <div className="space-y-1.5">
            <label className="text-[14px] font-semibold text-white/90">Решение работодателя</label>
            <select
              value={colDecision}
              onChange={(e) => setColDecision(e.target.value)}
              className="w-full bg-transparent backdrop-blur-xl text-white border border-white/20 rounded-xl text-[14px] px-3 py-2 focus:outline-none focus:border-[#d4af37]"
            >
              <option value="all" className="bg-[#17344F] text-white">Все решения</option>
              <option value="invited" className="bg-[#17344F] text-white">✓ Приглашён на работу</option>
              <option value="review" className="bg-[#17344F] text-white">◔ На рассмотрении</option>
              <option value="rejected" className="bg-[#17344F] text-white">✗ Отказано</option>
              <option value="none" className="bg-[#17344F] text-white">Без решения</option>
            </select>
          </div>

          {/* Sort candidates in column */}
          <div className="space-y-1.5">
            <label className="text-[14px] font-semibold text-white/90">Сортировка в этой колонке</label>
            <div className="grid grid-cols-3 gap-2">
              {([
                { field: "name" as const, label: "Имя" },
                { field: "score" as const, label: "Балл" },
                { field: "date" as const, label: "Дата" },
              ]).map((s) => {
                const active = colSort?.field === s.field;
                return (
                  <button
                    key={s.field}
                    type="button"
                    onClick={() => {
                      if (!active) {
                        setColSort({ field: s.field, dir: s.field === "name" ? "asc" : "desc" });
                      } else {
                        setColSort({ field: s.field, dir: colSort.dir === "asc" ? "desc" : "asc" });
                      }
                    }}
                    className={`p-2 rounded-xl border text-[14px] font-bold transition flex items-center justify-center gap-1 ${
                      active
                        ? "border-[#d4af37] text-[#fceabb] bg-transparent shadow-[0_0_10px_rgba(212,175,55,0.2)]"
                        : "border-white/20 text-white/80 hover:border-white/40 bg-transparent"
                    }`}
                  >
                    <span>{s.label}</span>
                    <span className="font-mono text-[14px]">
                      {active ? (colSort?.dir === "asc" ? "↑" : "↓") : "↕"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-transparent backdrop-blur-md px-5 py-4 border-t border-white/15 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onResetCol}
            className="text-[14px] px-3.5 py-2 rounded-xl border border-white/20 text-white/80 hover:text-white transition active:scale-95"
          >
            Сбросить для колонки
          </button>
          <button
            type="button"
            onClick={onClose}
            className="text-[14px] font-bold px-5 py-2 rounded-xl border border-[#d4af37] bg-transparent text-[#fceabb] shadow-[0_0_12px_rgba(212,175,55,0.25)] hover:brightness-110 active:scale-95 transition"
          >
            Готово
          </button>
        </div>
      </div>
    </div>
  );
};

interface TableColumnModalProps {
  columnKey: string | null;
  onClose: () => void;
  tableColFilters: any;
  setTableColFilters: React.Dispatch<React.SetStateAction<any>>;
  crmSort: { field: any; dir: "asc" | "desc" };
  setCrmSort: React.Dispatch<React.SetStateAction<{ field: any; dir: "asc" | "desc" }>>;
  crmCompanyOptions: string[];
  crmRoleOptions: string[];
  onResetCol: (key: string) => void;
}

export const TableColumnModal: React.FC<TableColumnModalProps> = ({
  columnKey,
  onClose,
  tableColFilters,
  setTableColFilters,
  crmSort,
  setCrmSort,
  crmCompanyOptions,
  crmRoleOptions,
  onResetCol,
}) => {
  if (!columnKey) return null;

  const columnTitles: Record<string, string> = {
    name: "ФИО кандидата",
    company: "Компания",
    role: "Вакансия",
    stage: "Текущий этап",
    created: "Дата создания",
    updated: "Дата изменения",
    resume: "Оценка резюме",
    checklist: "Оценка чек-листа",
    situations: "Оценка ситуаций",
    overall: "Средний балл",
  };

  const title = columnTitles[columnKey] || columnKey;
  const isCurrentlySorted = crmSort.field === columnKey;

  const currentScoreMin =
    columnKey === "resume"
      ? (tableColFilters.resumeScoreMin ?? tableColFilters.scoreMin ?? 0)
      : columnKey === "checklist"
        ? (tableColFilters.checklistScoreMin ?? tableColFilters.scoreMin ?? 0)
        : columnKey === "situations"
          ? (tableColFilters.situationsScoreMin ?? tableColFilters.scoreMin ?? 0)
          : columnKey === "overall"
            ? (tableColFilters.overallScoreMin ?? tableColFilters.scoreMin ?? 0)
            : 0;

  const setScoreMin = (val: number) => {
    setTableColFilters((prev: any) => ({
      ...prev,
      [`${columnKey}ScoreMin`]: val,
      scoreField:
        columnKey === "resume"
          ? "resumeScore"
          : columnKey === "checklist"
            ? "checklistScore"
            : columnKey === "situations"
              ? "situationsScore"
              : "overallScore",
      scoreMin: val,
    }));
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-transparent overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-lg bg-transparent backdrop-blur-2xl border border-white/20 rounded-3xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden text-white my-auto">
        {/* Header */}
        <div className="bg-transparent backdrop-blur-md px-5 py-4 border-b border-white/15 flex items-center justify-between">
          <div>
            <h3 className="text-[16px] font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">
              Колонка: {title}
            </h3>
            <p className="text-[14px] text-white/70">Параметры фильтрации, поиска и сортировки</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl border border-white/15 hover:border-white/40 text-white/80 hover:text-white transition active:scale-95"
            aria-label="Закрыть"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 overflow-y-auto text-left text-[14px]">
          {/* Specific filter for this column */}
          {columnKey === "name" && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[14px] font-semibold text-white/90">Поиск по ФИО, контактам и резюме</label>
                <div className="relative flex items-center bg-transparent backdrop-blur-xl border border-white/20 px-3 py-2 rounded-xl focus-within:border-[#d4af37]">
                  <Search className="w-4 h-4 text-white/50 mr-2 shrink-0" />
                  <input
                    type="text"
                    placeholder="Введите имя, телефон или email..."
                    value={tableColFilters.name || ""}
                    onChange={(e) => setTableColFilters((prev: any) => ({ ...prev, name: e.target.value }))}
                    className="bg-transparent text-[14px] text-white placeholder-white/45 focus:outline-none w-full"
                  />
                  {tableColFilters.name && (
                    <button
                      type="button"
                      onClick={() => setTableColFilters((prev: any) => ({ ...prev, name: "" }))}
                      className="p-1 text-white/50 hover:text-white"
                      title="Очистить"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[14px] font-semibold text-white/90">Вердикт ИИ</label>
                  <select
                    value={tableColFilters.verdict || "all"}
                    onChange={(e) => setTableColFilters((prev: any) => ({ ...prev, verdict: e.target.value }))}
                    className="w-full bg-transparent backdrop-blur-xl text-white border border-white/20 rounded-xl text-[14px] px-3 py-2 focus:outline-none focus:border-[#d4af37]"
                  >
                    <option value="all" className="bg-[#17344F] text-white">Все вердикты</option>
                    <option value="good" className="bg-[#17344F] text-white">Одобрен</option>
                    <option value="mid" className="bg-[#17344F] text-white">Частично</option>
                    <option value="low" className="bg-[#17344F] text-white">Не подходит</option>
                    <option value="none" className="bg-[#17344F] text-white">Ожидает оценки</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[14px] font-semibold text-white/90">Решение</label>
                  <select
                    value={tableColFilters.decision || "all"}
                    onChange={(e) => setTableColFilters((prev: any) => ({ ...prev, decision: e.target.value }))}
                    className="w-full bg-transparent backdrop-blur-xl text-white border border-white/20 rounded-xl text-[14px] px-3 py-2 focus:outline-none focus:border-[#d4af37]"
                  >
                    <option value="all" className="bg-[#17344F] text-white">Все решения</option>
                    <option value="invited" className="bg-[#17344F] text-white">✓ Приглашён на работу</option>
                    <option value="review" className="bg-[#17344F] text-white">◔ На рассмотрении</option>
                    <option value="rejected" className="bg-[#17344F] text-white">✗ Отказано</option>
                    <option value="none" className="bg-[#17344F] text-white">Без решения</option>
                  </select>
                </div>
              </div>

              {/* Standard Fields in column modal */}
              <div className="pt-2 border-t border-white/10 space-y-2.5">
                <span className="text-[14px] font-semibold text-[#fceabb]">Дополнительные параметры анкеты</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <input
                    type="text"
                    placeholder="Город..."
                    value={tableColFilters.city || ""}
                    onChange={(e) => setTableColFilters((prev: any) => ({ ...prev, city: e.target.value }))}
                    className="bg-transparent backdrop-blur-xl text-white border border-white/20 rounded-xl text-[14px] px-3 py-2 focus:outline-none focus:border-[#d4af37]"
                  />
                  <input
                    type="text"
                    placeholder="Опыт работы..."
                    value={tableColFilters.workExperience || ""}
                    onChange={(e) => setTableColFilters((prev: any) => ({ ...prev, workExperience: e.target.value }))}
                    className="bg-transparent backdrop-blur-xl text-white border border-white/20 rounded-xl text-[14px] px-3 py-2 focus:outline-none focus:border-[#d4af37]"
                  />
                  <input
                    type="text"
                    placeholder="Ключевые навыки..."
                    value={tableColFilters.skills || ""}
                    onChange={(e) => setTableColFilters((prev: any) => ({ ...prev, skills: e.target.value }))}
                    className="bg-transparent backdrop-blur-xl text-white border border-white/20 rounded-xl text-[14px] px-3 py-2 focus:outline-none focus:border-[#d4af37]"
                  />
                  <input
                    type="text"
                    placeholder="Образование..."
                    value={tableColFilters.education || ""}
                    onChange={(e) => setTableColFilters((prev: any) => ({ ...prev, education: e.target.value }))}
                    className="bg-transparent backdrop-blur-xl text-white border border-white/20 rounded-xl text-[14px] px-3 py-2 focus:outline-none focus:border-[#d4af37]"
                  />
                </div>
              </div>
            </div>
          )}

          {columnKey === "company" && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-[14px] font-semibold text-white/90">Поиск по компании</label>
                <div className="relative flex items-center bg-transparent backdrop-blur-xl border border-white/20 px-3 py-2 rounded-xl focus-within:border-[#d4af37]">
                  <Search className="w-4 h-4 text-white/50 mr-2 shrink-0" />
                  <input
                    type="text"
                    placeholder="Введите название компании..."
                    value={tableColFilters.companySearch || ""}
                    onChange={(e) => setTableColFilters((prev: any) => ({ ...prev, companySearch: e.target.value }))}
                    className="bg-transparent text-[14px] text-white placeholder-white/45 focus:outline-none w-full"
                  />
                  {tableColFilters.companySearch && (
                    <button
                      type="button"
                      onClick={() => setTableColFilters((prev: any) => ({ ...prev, companySearch: "" }))}
                      className="p-1 text-white/50 hover:text-white"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[14px] font-semibold text-white/90">Выбор из доступных компаний</label>
                <select
                  value={tableColFilters.company || "all"}
                  onChange={(e) => setTableColFilters((prev: any) => ({ ...prev, company: e.target.value }))}
                  className="w-full bg-transparent backdrop-blur-xl text-white border border-white/20 rounded-xl text-[14px] px-3 py-2 focus:outline-none focus:border-[#d4af37]"
                >
                  <option value="all" className="bg-[#17344F] text-white">Все компании</option>
                  {crmCompanyOptions.map((co) => (
                    <option key={co} value={co} className="bg-[#17344F] text-white">{co}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {columnKey === "role" && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-[14px] font-semibold text-white/90">Поиск по вакансии</label>
                <div className="relative flex items-center bg-transparent backdrop-blur-xl border border-white/20 px-3 py-2 rounded-xl focus-within:border-[#d4af37]">
                  <Search className="w-4 h-4 text-white/50 mr-2 shrink-0" />
                  <input
                    type="text"
                    placeholder="Введите должность или роль..."
                    value={tableColFilters.roleSearch || ""}
                    onChange={(e) => setTableColFilters((prev: any) => ({ ...prev, roleSearch: e.target.value }))}
                    className="bg-transparent text-[14px] text-white placeholder-white/45 focus:outline-none w-full"
                  />
                  {tableColFilters.roleSearch && (
                    <button
                      type="button"
                      onClick={() => setTableColFilters((prev: any) => ({ ...prev, roleSearch: "" }))}
                      className="p-1 text-white/50 hover:text-white"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[14px] font-semibold text-white/90">Выбор из доступных вакансий</label>
                <select
                  value={tableColFilters.role || "all"}
                  onChange={(e) => setTableColFilters((prev: any) => ({ ...prev, role: e.target.value }))}
                  className="w-full bg-transparent backdrop-blur-xl text-white border border-white/20 rounded-xl text-[14px] px-3 py-2 focus:outline-none focus:border-[#d4af37]"
                >
                  <option value="all" className="bg-[#17344F] text-white">Все вакансии</option>
                  {crmRoleOptions.map((r) => (
                    <option key={r} value={r} className="bg-[#17344F] text-white">{r}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {columnKey === "stage" && (
            <div className="space-y-1.5">
              <label className="text-[14px] font-semibold text-white/90">Выбор этапа воронки</label>
              <select
                value={tableColFilters.stage || "all"}
                onChange={(e) => setTableColFilters((prev: any) => ({ ...prev, stage: e.target.value }))}
                className="w-full bg-transparent backdrop-blur-xl text-white border border-white/20 rounded-xl text-[14px] px-3 py-2 focus:outline-none focus:border-[#d4af37]"
              >
                <option value="all" className="bg-[#17344F] text-white">Все этапы</option>
                <option value="registration" className="bg-[#17344F] text-white">1. Регистрация</option>
                <option value="screening" className="bg-[#17344F] text-white">2. Скрининг</option>
                <option value="checklist" className="bg-[#17344F] text-white">3. Чеклист</option>
                <option value="situations" className="bg-[#17344F] text-white">4. Ситуации</option>
                <option value="interview_reject" className="bg-[#17344F] text-white">5. Интервью отказ</option>
                <option value="interview_success" className="bg-[#17344F] text-white">6. Интервью успех</option>
                <option value="professional" className="bg-[#17344F] text-white">7. Профессия</option>
                <option value="product" className="bg-[#17344F] text-white">8. Продукт</option>
                <option value="systems" className="bg-[#17344F] text-white">9. Система</option>
                <option value="certified" className="bg-[#17344F] text-white">10. Сертификат</option>
              </select>
            </div>
          )}

          {(columnKey === "created" || columnKey === "updated") && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-[14px] font-semibold text-white/90">Быстрый период</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {([
                    { key: "all", label: "Все даты" },
                    { key: "24h", label: "24 часа" },
                    { key: "7d", label: "7 дней" },
                    { key: "30d", label: "30 дней" },
                  ] as const).map((p) => {
                    const presetKey = columnKey === "created" ? "createdPreset" : "updatedPreset";
                    const active = (tableColFilters[presetKey] || "all") === p.key;
                    return (
                      <button
                        key={p.key}
                        type="button"
                        onClick={() => {
                          const now = new Date();
                          let from = "";
                          if (p.key === "24h") {
                            from = new Date(now.getTime() - 24 * 3600 * 1000).toISOString().slice(0, 10);
                          } else if (p.key === "7d") {
                            from = new Date(now.getTime() - 7 * 24 * 3600 * 1000).toISOString().slice(0, 10);
                          } else if (p.key === "30d") {
                            from = new Date(now.getTime() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);
                          }
                          const fromKey = columnKey === "created" ? "createdFrom" : "updatedFrom";
                          const toKey = columnKey === "created" ? "createdTo" : "updatedTo";
                          setTableColFilters((prev: any) => ({
                            ...prev,
                            [presetKey]: p.key,
                            [fromKey]: from,
                            [toKey]: p.key === "all" ? "" : now.toISOString().slice(0, 10),
                          }));
                        }}
                        className={`p-2 rounded-xl border text-[14px] font-bold transition ${
                          active
                            ? "border-[#d4af37] text-[#fceabb] bg-transparent shadow-[0_0_10px_rgba(212,175,55,0.2)]"
                            : "border-white/20 text-white/80 hover:border-white/40 bg-transparent"
                        }`}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <label className="text-[14px] text-white/70">С даты</label>
                  <input
                    type="date"
                    value={columnKey === "created" ? (tableColFilters.createdFrom || "") : (tableColFilters.updatedFrom || "")}
                    onChange={(e) => {
                      const fromKey = columnKey === "created" ? "createdFrom" : "updatedFrom";
                      const presetKey = columnKey === "created" ? "createdPreset" : "updatedPreset";
                      setTableColFilters((prev: any) => ({ ...prev, [fromKey]: e.target.value, [presetKey]: "custom" }));
                    }}
                    className="w-full bg-transparent backdrop-blur-xl text-white border border-white/20 rounded-xl text-[14px] px-3 py-2 focus:outline-none focus:border-[#d4af37]"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[14px] text-white/70">По дату</label>
                  <input
                    type="date"
                    value={columnKey === "created" ? (tableColFilters.createdTo || "") : (tableColFilters.updatedTo || "")}
                    onChange={(e) => {
                      const toKey = columnKey === "created" ? "createdTo" : "updatedTo";
                      const presetKey = columnKey === "created" ? "createdPreset" : "updatedPreset";
                      setTableColFilters((prev: any) => ({ ...prev, [toKey]: e.target.value, [presetKey]: "custom" }));
                    }}
                    className="w-full bg-transparent backdrop-blur-xl text-white border border-white/20 rounded-xl text-[14px] px-3 py-2 focus:outline-none focus:border-[#d4af37]"
                  />
                </div>
              </div>
            </div>
          )}

          {["resume", "checklist", "situations", "overall"].includes(columnKey) && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-[14px] font-semibold text-white/90">Минимальный балл (0-100)</label>
                <span className="font-mono text-[#fceabb] text-[14px] font-bold">
                  от {currentScoreMin} баллов
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value={currentScoreMin}
                onChange={(e) => setScoreMin(Number(e.target.value))}
                className="w-full accent-[#d4af37]"
              />
              <div className="grid grid-cols-4 gap-2 pt-1">
                {[0, 50, 70, 85].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setScoreMin(preset)}
                    className={`py-1.5 px-2 rounded-xl border text-[14px] font-mono font-bold transition ${
                      currentScoreMin === preset
                        ? "border-[#d4af37] text-[#fceabb] bg-transparent shadow-[0_0_8px_rgba(212,175,55,0.25)]"
                        : "border-white/20 text-white/80 hover:border-white/40 bg-transparent"
                    }`}
                  >
                    {preset === 0 ? "Все (0+)" : `От ${preset}`}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Column Sort */}
          <div className="space-y-2 pt-2 border-t border-white/10">
            <div className="flex items-center justify-between">
              <label className="text-[14px] font-semibold text-white/90 flex items-center gap-1.5">
                <ArrowUpDown className="w-4 h-4 text-[#E7C768]" />
                <span>Сортировка по этой колонке</span>
              </label>
              {isCurrentlySorted && (
                <button
                  type="button"
                  onClick={() => setCrmSort({ field: "created", dir: "desc" })}
                  className="text-[14px] text-white/60 hover:text-white underline transition"
                >
                  Сбросить сортировку
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCrmSort({ field: columnKey, dir: "asc" })}
                className={`flex-1 p-2.5 rounded-xl border text-[14px] font-bold transition ${
                  isCurrentlySorted && crmSort.dir === "asc"
                    ? "border-[#d4af37] text-[#fceabb] bg-transparent shadow-[0_0_10px_rgba(212,175,55,0.2)]"
                    : "border-white/20 text-white/80 hover:border-white/40 bg-transparent"
                }`}
              >
                По возрастанию (↑)
              </button>
              <button
                type="button"
                onClick={() => setCrmSort({ field: columnKey, dir: "desc" })}
                className={`flex-1 p-2.5 rounded-xl border text-[14px] font-bold transition ${
                  isCurrentlySorted && crmSort.dir === "desc"
                    ? "border-[#d4af37] text-[#fceabb] bg-transparent shadow-[0_0_10px_rgba(212,175,55,0.2)]"
                    : "border-white/20 text-white/80 hover:border-white/40 bg-transparent"
                }`}
              >
                По убыванию (↓)
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-transparent backdrop-blur-md px-5 py-4 border-t border-white/15 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => onResetCol(columnKey)}
            className="text-[14px] px-3.5 py-2 rounded-xl border border-white/20 text-white/80 hover:text-white transition active:scale-95"
          >
            Сбросить фильтр
          </button>
          <button
            type="button"
            onClick={onClose}
            className="text-[14px] font-bold px-5 py-2 rounded-xl border border-[#d4af37] bg-transparent text-[#fceabb] shadow-[0_0_12px_rgba(212,175,55,0.25)] hover:brightness-110 active:scale-95 transition"
          >
            Применить
          </button>
        </div>
      </div>
    </div>
  );
};
