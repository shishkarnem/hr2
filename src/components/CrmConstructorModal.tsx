import React, { useState, useMemo } from "react";
import {
  X,
  Sliders,
  Columns3,
  CreditCard,
  LayoutGrid,
  Check,
  RotateCcw,
  Sparkles,
  Rows,
  Search,
  Filter,
} from "lucide-react";
import { STANDARD_CANDIDATE_FIELDS } from "@/constants/candidateFields";

export interface TableColumnDef {
  key: string;
  label: string;
  category?: "crm" | "standard" | "custom";
}

interface CrmConstructorModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeMode: "kanban" | "table";
  kanbanColumns: { stage: string; title: string; short: string }[];
  visibleKanbanCols: Record<string, boolean>;
  onToggleKanbanCol: (stage: string) => void;
  onSetAllKanbanCols: (visible: boolean) => void;
  kanbanCardFields: Record<string, boolean>;
  onToggleKanbanCardField: (key: string) => void;
  tableColumns: TableColumnDef[];
  visibleTableCols: Record<string, boolean>;
  onToggleTableCol: (key: string) => void;
  onSetAllTableCols: (visible: boolean) => void;
  tablePageSize: number | "all";
  onChangePageSize: (size: number | "all") => void;
  customVacancyFields?: Array<{ key: string; label: string }>;
}

export default function CrmConstructorModal({
  isOpen,
  onClose,
  activeMode,
  kanbanColumns,
  visibleKanbanCols,
  onToggleKanbanCol,
  onSetAllKanbanCols,
  kanbanCardFields,
  onToggleKanbanCardField,
  tableColumns,
  visibleTableCols,
  onToggleTableCol,
  onSetAllTableCols,
  tablePageSize,
  onChangePageSize,
  customVacancyFields = [],
}: CrmConstructorModalProps) {
  const [tab, setTab] = useState<"kanban" | "table">(activeMode);
  const [tableColCategory, setTableColCategory] = useState<"all" | "crm" | "standard" | "custom">("all");
  const [cardFieldsCategory, setCardFieldsCategory] = useState<"all" | "crm" | "standard" | "custom">("all");
  const [searchQuery, setSearchQuery] = useState("");

  if (!isOpen) return null;

  const baseCardFieldDefs: { key: string; label: string; desc: string; category: "crm" | "standard" | "custom" }[] = [
    { key: "showRole", label: "Название вакансии", desc: "Показывать должность соискателя", category: "crm" },
    { key: "showCompany", label: "Название компании", desc: "Отображать бренд работодателя", category: "crm" },
    { key: "showEmail", label: "Email кандидата", desc: "Адрес электронной почты для связи", category: "crm" },
    { key: "showPhone", label: "Телефон кандидата", desc: "Номер мобильного телефона", category: "crm" },
    { key: "showCity", label: "Город и локация", desc: "Место проживания кандидата", category: "crm" },
    { key: "showExperience", label: "Опыт работы", desc: "Общий трудовой стаж", category: "crm" },
    { key: "showScores", label: "Оценки этапов", desc: "Баллы за резюме, чек-лист и ситуации", category: "crm" },
    { key: "showOverall", label: "Итоговый балл", desc: "Средний балл за интервью", category: "crm" },
    { key: "showVerdict", label: "Вердикт нейросети", desc: "Рекомендация Робота Рекрутера", category: "crm" },
    { key: "showDecision", label: "Решение работодателя", desc: "Статус рассмотрения (Оффер, Резерв)", category: "crm" },
    { key: "showDate", label: "Дата изменения / создания", desc: "Точное время активности", category: "crm" },
  ];

  // Also include all 26 standard candidate fields for Kanban cards
  const standardCardFieldDefs = STANDARD_CANDIDATE_FIELDS.map((f) => ({
    key: `std_${f.key}`,
    label: f.label,
    desc: `Поле анкеты (${f.type === "multiselect" ? "мультисписок" : "текст"})`,
    category: "standard" as const,
  }));

  // Include custom vacancy fields for Kanban cards
  const customCardFieldDefs = customVacancyFields.map((cf) => ({
    key: cf.key.startsWith("custom_") ? cf.key : `custom_${cf.key}`,
    label: cf.label,
    desc: "Кастомное поле вакансии",
    category: "custom" as const,
  }));

  const allCardFieldDefs = [...baseCardFieldDefs, ...standardCardFieldDefs, ...customCardFieldDefs];

  const filteredCardFieldDefs = allCardFieldDefs.filter((f) => {
    if (cardFieldsCategory !== "all" && f.category !== cardFieldsCategory) return false;
    if (searchQuery.trim() && tab === "kanban") {
      const q = searchQuery.toLowerCase().trim();
      return f.label.toLowerCase().includes(q) || f.desc.toLowerCase().includes(q);
    }
    return true;
  });

  const pageSizeOptions: (number | "all")[] = [10, 25, 100, 500, "all"];

  const filteredTableColumns = tableColumns.filter((col) => {
    if (tableColCategory !== "all" && col.category && col.category !== tableColCategory) {
      return false;
    }
    if (searchQuery.trim() && tab === "table") {
      const q = searchQuery.toLowerCase().trim();
      return col.label.toLowerCase().includes(q) || col.key.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 md:p-8 overflow-y-auto">
      {/* Backdrop: строго прозрачный с размытием без затемнения и осветления фона */}
      <div
        className="fixed inset-0 bg-transparent backdrop-blur-xl transition-opacity"
        onClick={onClose}
      />

      {/* Modal Dialog: Liquid Glass Apple */}
      <div className="relative w-full max-w-5xl bg-transparent backdrop-blur-2xl border border-white/20 shadow-2xl rounded-3xl overflow-hidden flex flex-col max-h-[90vh] z-10 text-left">
        {/* Header */}
        <div className="px-5 py-4 border-b border-white/15 flex items-center justify-between gap-3 bg-transparent backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-transparent border border-[#E7C768]/60 flex items-center justify-center shrink-0 shadow-[0_0_15px_rgba(231,199,104,0.2)]">
              <Sliders className="w-5 h-5 text-[#E7C768]" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#C8A038] bg-clip-text text-transparent">
                Конструктор отображения CRM
              </h2>
              <p className="text-[14px] text-slate-300">
                Настройка показа колонок воронки, наполнения карточек и 26 стандартных и кастомных полей таблицы
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

        {/* Tab switcher: Канбан vs Таблица */}
        <div className="px-5 py-3 border-b border-white/10 bg-transparent flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <button
            onClick={() => setTab("kanban")}
            className={`px-4 py-2 rounded-xl text-[14px] font-bold transition flex items-center justify-center sm:justify-start gap-2 cursor-pointer ${
              tab === "kanban"
                ? "bg-transparent border border-[#E7C768] text-[#F4EE8E] shadow-[0_0_12px_rgba(231,199,104,0.25)]"
                : "border border-white/15 text-slate-300 hover:text-white hover:border-white/30"
            }`}
          >
            <Columns3 className="w-4 h-4 text-[#E7C768]" />
            <span>Конструктор Канбана (колонки и карточки)</span>
          </button>
          <button
            onClick={() => setTab("table")}
            className={`px-4 py-2 rounded-xl text-[14px] font-bold transition flex items-center justify-center sm:justify-start gap-2 cursor-pointer ${
              tab === "table"
                ? "bg-transparent border border-[#E7C768] text-[#F4EE8E] shadow-[0_0_12px_rgba(231,199,104,0.25)]"
                : "border border-white/15 text-slate-300 hover:text-white hover:border-white/30"
            }`}
          >
            <Rows className="w-4 h-4 text-[#E7C768]" />
            <span>Конструктор Таблицы (26 полей, кастомные и воронка)</span>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
          {tab === "kanban" && (
            <div className="space-y-6">
              {/* Section 1: Kanban Columns */}
              <div className="bg-transparent border border-white/15 rounded-2xl p-4 sm:p-5 backdrop-blur-xl space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <h3 className="text-base font-bold text-white flex items-center gap-2">
                      <Columns3 className="w-4 h-4 text-[#E7C768]" />
                      <span>Отображение колонок воронки (10 этапов)</span>
                    </h3>
                    <p className="text-[14px] text-slate-300 mt-0.5">
                      Отметьте стадии найма, которые должны присутствовать на канбан-доске
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onSetAllKanbanCols(true)}
                      className="px-3 py-1 rounded-xl text-[14px] font-semibold text-[#F4EE8E] border border-[#E7C768]/50 hover:border-[#E7C768] transition cursor-pointer"
                    >
                      Показать все
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-2">
                  {kanbanColumns.map((col) => {
                    const isVisible = visibleKanbanCols[col.stage] !== false;
                    return (
                      <button
                        key={col.stage}
                        type="button"
                        onClick={() => onToggleKanbanCol(col.stage)}
                        className={`text-left p-3 rounded-xl border transition flex items-center justify-between gap-3 cursor-pointer ${
                          isVisible
                            ? "border-[#E7C768] bg-transparent text-white shadow-[0_0_12px_rgba(231,199,104,0.2)]"
                            : "border-white/10 bg-transparent text-slate-400 hover:border-white/30 hover:text-slate-200"
                        }`}
                      >
                        <span className="text-[14px] font-semibold">{col.title}</span>
                        <div
                          className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${
                            isVisible
                              ? "border-[#E7C768] bg-[#E7C768] text-[#17344F]"
                              : "border-white/30 bg-transparent text-transparent"
                          }`}
                        >
                          <Check className="w-3.5 h-3.5 stroke-[3]" />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Section 2: Candidate Cards Content */}
              <div className="bg-transparent border border-white/15 rounded-2xl p-4 sm:p-5 backdrop-blur-xl space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-bold text-white flex items-center gap-2">
                      <LayoutGrid className="w-4 h-4 text-[#E7C768]" />
                      <span>Наполнение карточек соискателей в канбане (26 стандартных и кастомные)</span>
                    </h3>
                    <p className="text-[14px] text-slate-300 mt-0.5">
                      Выберите, какие поля и сведения выводить на карточках кандидатов
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {[
                      { id: "all", label: `Все (${allCardFieldDefs.length})` },
                      { id: "crm", label: "Системные" },
                      { id: "standard", label: "26 полей" },
                      { id: "custom", label: "Кастомные" },
                    ].map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setCardFieldsCategory(c.id as any)}
                        className={`px-3 py-1.5 rounded-xl text-[14px] font-semibold transition cursor-pointer ${
                          cardFieldsCategory === c.id
                            ? "bg-transparent border border-[#E7C768] text-[#F4EE8E] shadow-[0_0_10px_rgba(231,199,104,0.2)]"
                            : "border border-white/10 text-slate-300 hover:text-white"
                        }`}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-2">
                  {filteredCardFieldDefs.map((field) => {
                    const isChecked = Boolean(kanbanCardFields[field.key]);
                    return (
                      <button
                        key={field.key}
                        type="button"
                        onClick={() => onToggleKanbanCardField(field.key)}
                        className={`text-left p-3.5 rounded-xl border transition flex items-center justify-between gap-3 cursor-pointer ${
                          isChecked
                            ? "border-[#E7C768] bg-transparent text-white shadow-[0_0_12px_rgba(231,199,104,0.2)]"
                            : "border-white/10 bg-transparent text-slate-400 hover:border-white/30 hover:text-slate-200"
                        }`}
                      >
                        <div className="overflow-hidden pr-1">
                          <div className="text-[14px] font-bold text-white truncate">{field.label}</div>
                          <div className="text-[13px] text-slate-300 mt-0.5 truncate">{field.desc}</div>
                        </div>
                        <div
                          className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${
                            isChecked
                              ? "border-[#E7C768] bg-[#E7C768] text-[#17344F]"
                              : "border-white/30 bg-transparent text-transparent"
                          }`}
                        >
                          <Check className="w-3.5 h-3.5 stroke-[3]" />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {tab === "table" && (
            <div className="space-y-6">
              {/* Section 1: Table Columns Selector */}
              <div className="bg-transparent border border-white/15 rounded-2xl p-4 sm:p-5 backdrop-blur-xl space-y-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-bold text-white flex items-center gap-2">
                      <Columns3 className="w-4 h-4 text-[#E7C768]" />
                      <span>Колонки таблицы кандидатов (все 26 стандартных и кастомные)</span>
                    </h3>
                    <p className="text-[14px] text-slate-300 mt-0.5">
                      Отметьте поля и колонки, которые необходимо отображать в табличном виде CRM
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onSetAllTableCols(true)}
                      className="px-3 py-1.5 rounded-xl text-[14px] font-semibold text-[#F4EE8E] border border-[#E7C768]/50 hover:border-[#E7C768] transition cursor-pointer"
                    >
                      Выбрать все
                    </button>
                    <button
                      type="button"
                      onClick={() => onSetAllTableCols(false)}
                      className="px-3 py-1.5 rounded-xl text-[14px] font-semibold text-slate-300 border border-white/20 hover:border-white/40 transition cursor-pointer"
                    >
                      Сбросить
                    </button>
                  </div>
                </div>

                {/* Filters and search for columns */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {[
                      { id: "all", label: `Все поля (${tableColumns.length})` },
                      { id: "crm", label: "Системные CRM" },
                      { id: "standard", label: "26 Полей анкеты" },
                      { id: "custom", label: "Кастомные поля" },
                    ].map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setTableColCategory(c.id as any)}
                        className={`px-3 py-1.5 rounded-xl text-[14px] font-semibold transition cursor-pointer ${
                          tableColCategory === c.id
                            ? "bg-transparent border border-[#E7C768] text-[#F4EE8E] shadow-[0_0_10px_rgba(231,199,104,0.2)]"
                            : "border border-white/10 text-slate-300 hover:text-white"
                        }`}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>

                  <div className="relative">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Поиск по названию колонки..."
                      className="w-full sm:w-64 bg-transparent border border-white/20 rounded-xl px-3 py-1.5 text-[14px] text-white placeholder:text-slate-400 focus:outline-none focus:border-[#E7C768]"
                    />
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery("")}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-2">
                  {filteredTableColumns.map((col) => {
                    const isVisible = visibleTableCols[col.key] !== false;
                    return (
                      <button
                        key={col.key}
                        type="button"
                        onClick={() => onToggleTableCol(col.key)}
                        className={`text-left p-3 rounded-xl border transition flex items-center justify-between gap-3 cursor-pointer ${
                          isVisible
                            ? "border-[#E7C768] bg-transparent text-white shadow-[0_0_12px_rgba(231,199,104,0.2)]"
                            : "border-white/10 bg-transparent text-slate-400 hover:border-white/30 hover:text-slate-200"
                        }`}
                      >
                        <div className="overflow-hidden pr-1">
                          <span className="text-[14px] font-semibold truncate block">{col.label}</span>
                          <span className="text-[12px] text-slate-400 font-mono block">
                            {col.category === "standard" ? "26 полей" : col.category === "custom" ? "кастомное" : "CRM"}
                          </span>
                        </div>
                        <div
                          className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${
                            isVisible
                              ? "border-[#E7C768] bg-[#E7C768] text-[#17344F]"
                              : "border-white/30 bg-transparent text-transparent"
                          }`}
                        >
                          <Check className="w-3.5 h-3.5 stroke-[3]" />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Section 2: Rows per page selector */}
              <div className="bg-transparent border border-white/15 rounded-2xl p-4 sm:p-5 backdrop-blur-xl space-y-4">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <Rows className="w-4 h-4 text-[#E7C768]" />
                    <span>Количество строк на странице (пагинация)</span>
                  </h3>
                  <p className="text-[14px] text-slate-300 mt-0.5">
                    Выберите, по сколько строк кандидатов показывать в списке таблицы
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-2">
                  {pageSizeOptions.map((opt) => {
                    const isSelected = tablePageSize === opt;
                    const label = opt === "all" ? "Все кандидаты" : `${opt} строк`;
                    return (
                      <button
                        key={String(opt)}
                        type="button"
                        onClick={() => onChangePageSize(opt)}
                        className={`px-4 py-2.5 rounded-xl text-[14px] font-bold transition flex items-center gap-2 cursor-pointer ${
                          isSelected
                            ? "bg-transparent border border-[#E7C768] text-[#F4EE8E] shadow-[0_0_12px_rgba(231,199,104,0.3)]"
                            : "border border-white/15 text-slate-300 hover:text-white hover:border-white/30"
                        }`}
                      >
                        <span>{label}</span>
                        {isSelected && <Check className="w-4 h-4 text-[#E7C768]" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-white/10 bg-transparent backdrop-blur-md flex items-center justify-between">
          <div className="text-[14px] text-slate-300 flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-[#E7C768]" />
            <span>Настройки сохраняются автоматически</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-2xl bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] text-[#17344F] font-bold text-[14px] shadow-lg hover:brightness-105 active:scale-95 transition cursor-pointer"
          >
            Готово
          </button>
        </div>
      </div>
    </div>
  );
}
