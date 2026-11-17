import React, { useState, useMemo, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Plus,
  Trash2,
  Sparkles,
  Copy,
  Check,
  Edit3,
  ListChecks,
  Type,
  Layers,
  RefreshCw,
  ChevronDown,
  Search,
} from "lucide-react";
import {
  STANDARD_CANDIDATE_FIELDS,
  STANDARD_FIELD_CATEGORIES,
  CustomCandidateFieldDef,
  CandidateFieldType,
  parseVacancyCustomFieldsConfig,
  parseMultiselectArray,
} from "../constants/candidateFields";
import { useLandingTheme, type LandingThemeConfig } from "./LandingStyleEditor";
import { resolveActiveEmployerId } from "../lib/actorSession";

interface CandidateFieldsModalProps {
  isOpen: boolean;
  onClose: () => void;
  roleName: string;
  companyName?: string;
  description?: string;
  duties?: string;
  requirements?: string;
  conditions?: string;
  customFields: CustomCandidateFieldDef[];
  onChangeCustomFields: (nextFields: CustomCandidateFieldDef[]) => void;
  otherProjects?: Array<{
    id: string;
    roleName?: string;
    role_name?: string;
    companyName?: string;
    company_name?: string;
    candidate_fields_config?: any;
    candidateFieldsConfig?: any;
  }>;
  currentProjectId?: string;
  employerId?: string;
  themeConfig?: LandingThemeConfig | null;
}

const hexToRgbaLocal = (hex: string, op: number = 100) => {
  if (!hex) return `rgba(255,255,255,${op / 100})`;
  let clean = hex.replace("#", "").trim();
  if (clean.length === 3) clean = clean.split("").map((c) => c + c).join("");
  if (clean.length !== 6) return hex;
  const num = parseInt(clean, 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  const a = Math.max(0, Math.min(1, op / 100));
  return `rgba(${r}, ${g}, ${b}, ${a})`;
};

export const CandidateFieldsModal: React.FC<CandidateFieldsModalProps> = ({
  isOpen,
  onClose,
  roleName,
  companyName,
  description,
  duties,
  requirements,
  conditions,
  customFields,
  onChangeCustomFields,
  otherProjects = [],
  currentProjectId,
  employerId,
  themeConfig: propThemeConfig,
}) => {
  const contextTheme = useLandingTheme();
  const rawTheme = (propThemeConfig || contextTheme) as any;
  const activeTheme: any = rawTheme?.activeTheme || rawTheme || null;

  const [activeTab, setActiveTab] = useState<"custom" | "standard" | "import">("custom");
  const [isGenerating, setIsGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [genSuccess, setGenSuccess] = useState<string | null>(null);

  // Manual field creation / editing state
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [fieldLabel, setFieldLabel] = useState("");
  const [fieldType, setFieldType] = useState<CandidateFieldType>("text");
  const [fieldOptionsInput, setFieldOptionsInput] = useState("");
  const [fieldDescription, setFieldDescription] = useState("");

  // Import from another vacancy
  const [selectedImportProjectId, setSelectedImportProjectId] = useState<string>("");
  const [isImportDropdownOpen, setIsImportDropdownOpen] = useState(false);
  const [importSearch, setImportSearch] = useState("");
  const importDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isImportDropdownOpen) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (importDropdownRef.current && !importDropdownRef.current.contains(e.target as Node)) {
        setIsImportDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [isImportDropdownOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const availableProjectsForImport = useMemo(() => {
    return (otherProjects || []).filter((p) => p && String(p.id) !== String(currentProjectId || ""));
  }, [otherProjects, currentProjectId]);

  const selectedImportProjectFields = useMemo(() => {
    if (!selectedImportProjectId) return [];
    const found = availableProjectsForImport.find((p) => String(p.id) === String(selectedImportProjectId));
    if (!found) return [];
    const cfg = parseVacancyCustomFieldsConfig(found.candidate_fields_config ?? found.candidateFieldsConfig);
    return cfg.customFields || [];
  }, [selectedImportProjectId, availableProjectsForImport]);

  if (!isOpen) return null;

  const containerBgRgba = activeTheme
    ? hexToRgbaLocal(activeTheme.containerBgColor || "#17344F", activeTheme.containerBgOpacity ?? 0)
    : "transparent";
  const containerBorderRgba = activeTheme
    ? hexToRgbaLocal(activeTheme.containerBorderColor || "#E7C768", activeTheme.containerBorderOpacity ?? 45)
    : "rgba(231, 199, 104, 0.45)";
  const containerBlurPx = Math.max(24, activeTheme?.glassBlurPx ?? 28);
  const effectiveContainerRadius = activeTheme?.containerBorderRadius ?? 24;
  const containerBorderWidthVal = activeTheme?.containerBorderWidth ?? 1;
  const iconColor = activeTheme?.iconColor || "#E7C768";

  const slugifyKey = (label: string) => {
    const ru: Record<string, string> = {
      а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "zh",
      з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o",
      п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts",
      ч: "ch", ш: "sh", щ: "shch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
    };
    const base = label
      .toLowerCase()
      .split("")
      .map((c) => (ru[c] !== undefined ? ru[c] : c))
      .join("")
      .replace(/[^a-z0-9_]+/g, "_")
      .replace(/^_+|_+$/g, "");
    return base || `custom_${Date.now()}`;
  };

  const resetForm = () => {
    setEditingIndex(null);
    setFieldLabel("");
    setFieldType("text");
    setFieldOptionsInput("");
    setFieldDescription("");
  };

  const handleSaveManualField = () => {
    const cleanLabel = fieldLabel.trim();
    if (!cleanLabel) return;

    const stdLabels = new Set(STANDARD_CANDIDATE_FIELDS.map((f) => f.label.toLowerCase()));
    if (stdLabels.has(cleanLabel.toLowerCase())) {
      setGenError("Это поле уже входит в список 26 стандартных полей анкеты.");
      return;
    }

    const key =
      editingIndex !== null && customFields[editingIndex]
        ? customFields[editingIndex].key
        : slugifyKey(cleanLabel);

    const parsedOpts =
      fieldType === "multiselect"
        ? parseMultiselectArray(fieldOptionsInput).length > 0
          ? parseMultiselectArray(fieldOptionsInput)
          : ["Да", "Нет", "Частично"]
        : undefined;

    const newDef: CustomCandidateFieldDef = {
      id:
        editingIndex !== null && customFields[editingIndex]
          ? customFields[editingIndex].id
          : `cf_${key}_${Date.now().toString(36)}`,
      key,
      label: cleanLabel,
      type: fieldType,
      options: parsedOpts,
      description: fieldDescription.trim() || undefined,
      placeholder: fieldDescription.trim() || cleanLabel,
    };

    if (editingIndex !== null) {
      const next = [...customFields];
      next[editingIndex] = newDef;
      onChangeCustomFields(next);
      setGenSuccess(`Поле «${cleanLabel}» обновлено.`);
    } else {
      if (customFields.some((f) => f.label.toLowerCase() === cleanLabel.toLowerCase() || f.key === key)) {
        setGenError("Поле с таким названием уже добавлено в вакансию.");
        return;
      }
      onChangeCustomFields([...customFields, newDef]);
      setGenSuccess(`Поле «${cleanLabel}» добавлено.`);
    }
    setGenError(null);
    resetForm();
  };

  const handleStartEdit = (idx: number) => {
    const f = customFields[idx];
    if (!f) return;
    setEditingIndex(idx);
    setFieldLabel(f.label);
    setFieldType(f.type);
    setFieldOptionsInput(Array.isArray(f.options) ? f.options.join(", ") : "");
    setFieldDescription(f.description || "");
    setGenError(null);
  };

  const handleDeleteField = (idx: number) => {
    const next = customFields.filter((_, i) => i !== idx);
    onChangeCustomFields(next);
    if (editingIndex === idx) resetForm();
  };

  const handleGenerateAIFields = async (mode: "append" | "replace") => {
    setIsGenerating(true);
    setGenError(null);
    setGenSuccess(null);
    try {
      const effEmpId = resolveActiveEmployerId({ employer_id: employerId });
      const res = await fetch("/api/ai/generate-custom-fields", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roleName,
          companyName,
          description,
          duties,
          requirements,
          conditions,
          existingCustomFields: mode === "append" ? customFields : [],
          count: 5,
          mode,
          employerId: effEmpId,
          employer_id: effEmpId,
          employer_public_id: effEmpId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Не удалось сгенерировать поля");
      }
      if (Array.isArray(data?.customFields)) {
        onChangeCustomFields(data.customFields);
        const addedCount = Array.isArray(data.generatedFields) ? data.generatedFields.length : 5;
        setGenSuccess(
          mode === "append"
            ? `ИИ успешно добавил +${addedCount} новых уникальных полей под вакансию.`
            : `ИИ сформировал ${addedCount} профильных полей под вакансию.`
        );
      }
    } catch (err: any) {
      setGenError(err?.message || "Ошибка при генерации полей нейросетью");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleImportFromVacancy = (mode: "append" | "replace") => {
    if (selectedImportProjectFields.length === 0) return;
    if (mode === "replace") {
      onChangeCustomFields(
        selectedImportProjectFields.map((f) => ({
          ...f,
          id: `cf_${f.key}_${Math.random().toString(36).slice(2, 6)}`,
        }))
      );
      setGenSuccess(`Заменено на ${selectedImportProjectFields.length} полей из выбранной вакансии.`);
    } else {
      const existingKeys = new Set(customFields.map((f) => f.key.toLowerCase()));
      const existingLabels = new Set(customFields.map((f) => f.label.toLowerCase()));
      const toAdd = selectedImportProjectFields.filter(
        (f) => !existingKeys.has(f.key.toLowerCase()) && !existingLabels.has(f.label.toLowerCase())
      );
      onChangeCustomFields([
        ...customFields,
        ...toAdd.map((f) => ({
          ...f,
          id: `cf_${f.key}_${Math.random().toString(36).slice(2, 6)}`,
        })),
      ]);
      setGenSuccess(`Добавлено ${toAdd.length} новых полей из выбранной вакансии.`);
    }
    setActiveTab("custom");
  };

  const modalContent = (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-6">
      <div
        className="fixed inset-0 bg-transparent backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className="landing-ai-dialog relative z-10 w-full max-w-4xl max-h-[90vh] flex flex-col rounded-3xl border border-[#d4af37]/50 bg-transparent backdrop-blur-2xl shadow-2xl overflow-hidden text-white text-[14px]"
        style={{
          backgroundColor: containerBgRgba,
          backdropFilter: `blur(${containerBlurPx}px)`,
          WebkitBackdropFilter: `blur(${containerBlurPx}px)`,
          borderColor: containerBorderRgba,
          borderWidth: `${containerBorderWidthVal}px`,
          borderRadius: `${effectiveContainerRadius}px`,
          borderStyle: "solid",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-4 px-5 py-4 border-b border-white/15 bg-transparent backdrop-blur-xl">
          <div className="min-w-0">
            <h3 className="text-lg sm:text-xl font-bold bg-gradient-to-r from-[#fff3c4] via-[#d4af37] to-[#b8860b] bg-clip-text text-transparent break-words">
              Конструктор полей анкеты и резюме кандидата
            </h3>
            <p className="text-[14px] text-white/80 mt-0.5 break-words">
              Вакансия: <span className="font-semibold text-white">{roleName || "Новая вакансия"}</span> • 26 стандартных полей + {customFields.length} кастомных
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl border border-white/20 backdrop-blur-md text-white hover:border-[#d4af37] transition-all shrink-0"
            title="Закрыть"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs (responsive vertical/grid on mobile, no horizontal scroll) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 px-5 py-3 border-b border-white/15 backdrop-blur-xl">
          <button
            type="button"
            onClick={() => setActiveTab("custom")}
            className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border text-[14px] font-medium transition-all ${
              activeTab === "custom"
                ? "border-[#d4af37] text-[#fceabb] shadow-[0_0_15px_rgba(212,175,55,0.25)] backdrop-blur-xl"
                : "border-white/15 text-white/80 hover:border-white/35 backdrop-blur-md"
            }`}
          >
            <Sparkles className="w-4 h-4 shrink-0 text-[#d4af37]" />
            <span>Кастомные поля ({customFields.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("standard")}
            className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border text-[14px] font-medium transition-all ${
              activeTab === "standard"
                ? "border-[#d4af37] text-[#fceabb] shadow-[0_0_15px_rgba(212,175,55,0.25)] backdrop-blur-xl"
                : "border-white/15 text-white/80 hover:border-white/35 backdrop-blur-md"
            }`}
          >
            <Layers className="w-4 h-4 shrink-0 text-[#d4af37]" />
            <span>Стандартные поля (26)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("import")}
            className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border text-[14px] font-medium transition-all ${
              activeTab === "import"
                ? "border-[#d4af37] text-[#fceabb] shadow-[0_0_15px_rgba(212,175,55,0.25)] backdrop-blur-xl"
                : "border-white/15 text-white/80 hover:border-white/35 backdrop-blur-md"
            }`}
          >
            <Copy className="w-4 h-4 shrink-0 text-[#d4af37]" />
            <span>Взять из другой вакансии</span>
          </button>
        </div>

        {/* Body */}
        <div
          className="landing-ai-dialog-scroll flex-1 overflow-y-auto p-5 space-y-5 bg-transparent backdrop-blur-md"
          style={{
            scrollbarWidth: "thin",
            scrollbarColor: `${iconColor} transparent`,
          }}
        >
          {genError && (
            <div className="p-3.5 rounded-2xl border border-[#d4af37]/60 backdrop-blur-xl text-white text-[14px] flex items-center justify-between gap-3">
              <span className="break-words">{genError}</span>
              <button
                type="button"
                onClick={() => setGenError(null)}
                className="text-white/70 hover:text-white shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {genSuccess && (
            <div className="p-3.5 rounded-2xl border border-[#d4af37] backdrop-blur-xl text-[#fceabb] text-[14px] flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <Check className="w-4 h-4 shrink-0 text-[#d4af37]" />
                <span className="break-words">{genSuccess}</span>
              </div>
              <button
                type="button"
                onClick={() => setGenSuccess(null)}
                className="text-white/70 hover:text-white shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {activeTab === "custom" && (
            <div className="space-y-5">
              {/* Two AI Generators Panel */}
              <div className="p-4 rounded-2xl border border-[#d4af37]/40 backdrop-blur-xl space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h4 className="text-[15px] font-bold bg-gradient-to-r from-[#fff3c4] via-[#d4af37] to-[#b8860b] bg-clip-text text-transparent">
                      Нейросетевые генераторы кастомных полей
                    </h4>
                    <p className="text-[14px] text-white/80 mt-0.5 break-words">
                      ИИ анализирует название, обязанности, требования и уже созданные поля, чтобы не повторяться со стандартными и существующими полями.
                    </p>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2 shrink-0">
                    <button
                      type="button"
                      disabled={isGenerating}
                      onClick={() => handleGenerateAIFields("append")}
                      className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-[#d4af37] backdrop-blur-xl text-[#fceabb] hover:shadow-[0_0_20px_rgba(212,175,55,0.35)] transition-all text-[14px] font-semibold disabled:opacity-50"
                    >
                      {isGenerating ? (
                        <RefreshCw className="w-4 h-4 animate-spin text-[#d4af37]" />
                      ) : (
                        <Sparkles className="w-4 h-4 text-[#d4af37]" />
                      )}
                      <span>+5 дополнительных полей ИИ</span>
                    </button>
                    <button
                      type="button"
                      disabled={isGenerating}
                      onClick={() => handleGenerateAIFields("replace")}
                      className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-white/25 backdrop-blur-xl text-white hover:border-[#d4af37] transition-all text-[14px] font-medium disabled:opacity-50"
                    >
                      <RefreshCw className={`w-4 h-4 ${isGenerating ? "animate-spin" : ""}`} />
                      <span>Пересоздать 5 полей с нуля</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Manual Field Constructor Form */}
              <div className="p-4 rounded-2xl border border-white/20 backdrop-blur-xl space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-[15px] font-bold bg-gradient-to-r from-[#fff3c4] via-[#d4af37] to-[#b8860b] bg-clip-text text-transparent">
                    {editingIndex !== null ? "Редактирование кастомного поля" : "Добавить кастомное поле вручную"}
                  </h4>
                  {editingIndex !== null && (
                    <button
                      type="button"
                      onClick={resetForm}
                      className="text-[14px] text-white/80 hover:text-white underline"
                    >
                      Отменить редактирование
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[14px] text-white/90 mb-1.5 font-medium">
                      Название поля (например: Портфолио, LinkedIn, Контакты бывших работодателей)
                    </label>
                    <input
                      type="text"
                      value={fieldLabel}
                      onChange={(e) => setFieldLabel(e.target.value)}
                      placeholder="Введите название поля..."
                      className="w-full px-3.5 py-2.5 rounded-xl border border-white/20 bg-transparent backdrop-blur-md text-white placeholder-white/45 text-[14px] focus:outline-none focus:border-[#d4af37]"
                    />
                  </div>

                  <div>
                    <label className="block text-[14px] text-white/90 mb-1.5 font-medium">
                      Тип поля
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setFieldType("text")}
                        className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border text-[14px] transition-all ${
                          fieldType === "text"
                            ? "border-[#d4af37] text-[#fceabb] font-semibold backdrop-blur-xl"
                            : "border-white/15 text-white/80 hover:border-white/35 backdrop-blur-md"
                        }`}
                      >
                        <Type className="w-4 h-4 shrink-0" />
                        <span>Текст</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setFieldType("multiselect")}
                        className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border text-[14px] transition-all ${
                          fieldType === "multiselect"
                            ? "border-[#d4af37] text-[#fceabb] font-semibold backdrop-blur-xl"
                            : "border-white/15 text-white/80 hover:border-white/35 backdrop-blur-md"
                        }`}
                      >
                        <ListChecks className="w-4 h-4 shrink-0" />
                        <span>Мультисписок</span>
                      </button>
                    </div>
                  </div>
                </div>

                {fieldType === "multiselect" && (
                  <div>
                    <label className="block text-[14px] text-white/90 mb-1.5 font-medium">
                      Варианты для мультивыбора и фильтрации (через запятую)
                    </label>
                    <input
                      type="text"
                      value={fieldOptionsInput}
                      onChange={(e) => setFieldOptionsInput(e.target.value)}
                      placeholder="Например: amoCRM, Bitrix24, RetailCRM, HubSpot, МойСклад"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-white/20 bg-transparent backdrop-blur-md text-white placeholder-white/45 text-[14px] focus:outline-none focus:border-[#d4af37]"
                    />
                  </div>
                )}

                <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-end">
                  <div className="flex-1">
                    <label className="block text-[14px] text-white/90 mb-1.5 font-medium">
                      Подсказка для нейросети (что именно искать в резюме)
                    </label>
                    <input
                      type="text"
                      value={fieldDescription}
                      onChange={(e) => setFieldDescription(e.target.value)}
                      placeholder="Например: Ссылки на кейсы, Behance, GitHub или примеры работ"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-white/20 bg-transparent backdrop-blur-md text-white placeholder-white/45 text-[14px] focus:outline-none focus:border-[#d4af37]"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleSaveManualField}
                    disabled={!fieldLabel.trim()}
                    className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl border border-[#d4af37] backdrop-blur-xl text-[#fceabb] hover:shadow-[0_0_15px_rgba(212,175,55,0.3)] transition-all text-[14px] font-semibold disabled:opacity-40 shrink-0"
                  >
                    <Plus className="w-4 h-4" />
                    <span>{editingIndex !== null ? "Сохранить изменения" : "Добавить поле"}</span>
                  </button>
                </div>
              </div>

              {/* Current Custom Fields List */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-[15px] font-bold bg-gradient-to-r from-[#fff3c4] via-[#d4af37] to-[#b8860b] bg-clip-text text-transparent">
                    Активные кастомные поля вакансии ({customFields.length})
                  </h4>
                </div>

                {customFields.length === 0 ? (
                  <div className="p-6 rounded-2xl border border-white/15 backdrop-blur-md text-center text-white/75 text-[14px]">
                    У этой вакансии пока нет кастомных полей. Добавьте их вручную выше или нажмите «+5 дополнительных полей ИИ».
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-2.5">
                    {customFields.map((field, idx) => (
                      <div
                        key={field.id || field.key || idx}
                        className="p-3.5 rounded-2xl border border-white/15 hover:border-[#d4af37]/50 backdrop-blur-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all"
                      >
                        <div className="space-y-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-white text-[15px] break-words">
                              {field.label}
                            </span>
                            <span className="px-2.5 py-0.5 rounded-lg border border-[#d4af37]/40 text-[#fceabb] text-[14px]">
                              {field.type === "multiselect" ? "Мультисписок" : "Текст"}
                            </span>
                            <span className="text-white/55 text-[14px]">
                              ключ: {field.key}
                            </span>
                          </div>
                          {field.description && (
                            <p className="text-[14px] text-white/75 break-words">
                              {field.description}
                            </p>
                          )}
                          {field.type === "multiselect" && Array.isArray(field.options) && field.options.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 pt-1">
                              {field.options.map((opt, oIdx) => (
                                <span
                                  key={oIdx}
                                  className="px-2.5 py-0.5 rounded-lg border border-white/20 text-white/90 text-[14px] break-words"
                                >
                                  {opt}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                          <button
                            type="button"
                            onClick={() => handleStartEdit(idx)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-white/20 hover:border-[#d4af37] text-white text-[14px] transition-all"
                          >
                            <Edit3 className="w-4 h-4" />
                            <span>Изменить</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteField(idx)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-white/20 hover:border-[#d4af37] text-white/80 hover:text-white text-[14px] transition-all"
                          >
                            <Trash2 className="w-4 h-4" />
                            <span>Удалить</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === "standard" && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl border border-[#d4af37]/35 backdrop-blur-xl">
                <p className="text-[14px] text-white/90 break-words">
                  Эти 26 стандартных полей включены во все вакансии по умолчанию. При скрининге резюме нейросеть автоматически извлекает значения в профиль кандидата, а в СРМ и админке по каждому полю доступны поиск, сортировка и фильтрация.
                </p>
              </div>

              {(Object.keys(STANDARD_FIELD_CATEGORIES) as Array<keyof typeof STANDARD_FIELD_CATEGORIES>).map((catKey) => {
                const catFields = STANDARD_CANDIDATE_FIELDS.filter((f) => f.category === catKey);
                return (
                  <div key={catKey} className="p-4 rounded-2xl border border-white/15 backdrop-blur-xl space-y-3">
                    <h4 className="text-[15px] font-bold bg-gradient-to-r from-[#fff3c4] via-[#d4af37] to-[#b8860b] bg-clip-text text-transparent">
                      {STANDARD_FIELD_CATEGORIES[catKey]} ({catFields.length})
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {catFields.map((f) => (
                        <div
                          key={f.key}
                          className="p-3 rounded-xl border border-white/15 backdrop-blur-md flex flex-col justify-between gap-1.5"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-white text-[14px] break-words">{f.label}</span>
                            <span className="px-2 py-0.5 rounded-lg border border-[#d4af37]/40 text-[#fceabb] text-[14px] shrink-0">
                              {f.type === "multiselect" ? "Мультисписок" : "Текст"}
                            </span>
                          </div>
                          {f.type === "multiselect" && f.options && (
                            <p className="text-[14px] text-white/70 break-words">
                              Варианты: {f.options.join(", ")}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {activeTab === "import" && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl border border-white/20 backdrop-blur-xl space-y-4">
                <h4 className="text-[15px] font-bold bg-gradient-to-r from-[#fff3c4] via-[#d4af37] to-[#b8860b] bg-clip-text text-transparent">
                  Скопировать кастомные поля из другой вакансии
                </h4>
                <p className="text-[14px] text-white/80 break-words">
                  Выберите существующую вакансию, чтобы перенести её кастомные поля в текущую вакансию (добавить к текущим или полностью заменить).
                </p>

                {availableProjectsForImport.length === 0 ? (
                  <div className="p-4 rounded-xl border border-white/15 text-white/75 text-[14px]">
                    Других вакансий для импорта пока не найдено.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Custom Liquid Glass Dropdown */}
                    <div className="relative" ref={importDropdownRef}>
                      {(() => {
                        const selectedProj = availableProjectsForImport.find(
                          (p) => String(p.id) === String(selectedImportProjectId)
                        );
                        const selectedLabel = selectedProj
                          ? `${selectedProj.roleName || selectedProj.role_name || "Вакансия"}${
                              selectedProj.companyName || selectedProj.company_name
                                ? ` (${selectedProj.companyName || selectedProj.company_name})`
                                : ""
                            }`
                          : "— Выберите вакансию —";

                        const filteredProjects = availableProjectsForImport.filter((p) => {
                          if (!importSearch.trim()) return true;
                          const term = importSearch.toLowerCase();
                          const rName = (p.roleName || p.role_name || "").toLowerCase();
                          const cName = (p.companyName || p.company_name || "").toLowerCase();
                          return rName.includes(term) || cName.includes(term);
                        });

                        return (
                          <>
                            <button
                              type="button"
                              onClick={() => setIsImportDropdownOpen((v) => !v)}
                              className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-white/25 hover:border-[#d4af37] bg-transparent backdrop-blur-xl text-white text-[14px] transition-all text-left shadow-lg"
                            >
                              <span className={selectedImportProjectId ? "text-[#fceabb] font-semibold truncate" : "text-white/60 truncate"}>
                                {selectedLabel}
                              </span>
                              <ChevronDown
                                className={`w-4 h-4 text-[#d4af37] shrink-0 transition-transform ${
                                  isImportDropdownOpen ? "rotate-180" : ""
                                }`}
                              />
                            </button>

                            {isImportDropdownOpen && (
                              <div
                                className="absolute left-0 right-0 top-full mt-2 z-50 rounded-2xl shadow-2xl overflow-hidden p-3 space-y-2.5 animate-in fade-in slide-in-from-top-2 duration-150 text-[14px]"
                                style={{
                                  backgroundColor: containerBgRgba,
                                  backdropFilter: `blur(${Math.max(28, containerBlurPx)}px)`,
                                  WebkitBackdropFilter: `blur(${Math.max(28, containerBlurPx)}px)`,
                                  borderColor: containerBorderRgba,
                                  borderWidth: `${containerBorderWidthVal}px`,
                                  borderStyle: "solid",
                                  boxShadow: "0 20px 50px -10px rgba(0,0,0,0.5), 0 0 25px rgba(212,175,55,0.25)",
                                }}
                              >
                                {availableProjectsForImport.length > 4 && (
                                  <div className="relative">
                                    <Search className="w-4 h-4 text-white/70 absolute left-3.5 top-1/2 -translate-y-1/2" />
                                    <input
                                      type="text"
                                      value={importSearch}
                                      onChange={(e) => setImportSearch(e.target.value)}
                                      placeholder="Поиск по названию или компании..."
                                      className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-white/25 bg-transparent backdrop-blur-md text-white placeholder-white/60 text-[14px] focus:outline-none focus:border-[#d4af37]"
                                      autoFocus
                                    />
                                  </div>
                                )}
                                <div className="max-h-64 overflow-y-auto space-y-2 pr-1 scrollbar-thin">
                                  {filteredProjects.length === 0 ? (
                                    <div className="p-4 text-center text-white/70 text-[14px]">
                                      Ничего не найдено
                                    </div>
                                  ) : (
                                    filteredProjects.map((p) => {
                                      const isSelected = String(p.id) === String(selectedImportProjectId);
                                      const rName = p.roleName || p.role_name || "Вакансия";
                                      const cName = p.companyName || p.company_name || "";
                                      const cfg = parseVacancyCustomFieldsConfig(
                                        p.candidate_fields_config ?? p.candidateFieldsConfig
                                      );
                                      return (
                                        <button
                                          key={p.id}
                                          type="button"
                                          onClick={() => {
                                            setSelectedImportProjectId(String(p.id));
                                            setIsImportDropdownOpen(false);
                                            setImportSearch("");
                                          }}
                                          className={`w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl border text-left text-[14px] transition-all backdrop-blur-md ${
                                            isSelected
                                              ? "border-[#d4af37] bg-transparent text-[#fceabb] font-semibold shadow-[0_0_15px_rgba(212,175,55,0.3)]"
                                              : "border-white/20 hover:border-[#d4af37] hover:bg-transparent hover:text-white bg-transparent text-white/95"
                                          }`}
                                        >
                                          <div className="min-w-0">
                                            <div className="font-semibold truncate text-white text-[14px]">{rName}</div>
                                            {cName && <div className="text-[14px] text-white/70 truncate mt-0.5">{cName}</div>}
                                          </div>
                                          <span className="shrink-0 px-3 py-1 rounded-xl border border-[#d4af37]/60 bg-transparent text-[#fceabb] text-[14px] font-medium backdrop-blur-sm">
                                            {cfg.customFields.length} полей
                                          </span>
                                        </button>
                                      );
                                    })
                                  )}
                                </div>
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </div>

                    {selectedImportProjectId && (
                      <div className="space-y-3">
                        <div className="text-[14px] font-semibold text-[#fceabb]">
                          Поля в выбранной вакансии ({selectedImportProjectFields.length}):
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {selectedImportProjectFields.map((f, i) => (
                            <div
                              key={f.id || f.key || i}
                              className="p-3 rounded-xl border border-white/15 backdrop-blur-md space-y-1"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-semibold text-white text-[14px] break-words">{f.label}</span>
                                <span className="px-2 py-0.5 rounded-lg border border-[#d4af37]/40 text-[#fceabb] text-[14px]">
                                  {f.type === "multiselect" ? "Мультисписок" : "Текст"}
                                </span>
                              </div>
                              {f.options && f.options.length > 0 && (
                                <p className="text-[14px] text-white/70 break-words">
                                  {f.options.join(", ")}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>

                        <div className="flex flex-col sm:flex-row gap-3 pt-2">
                          <button
                            type="button"
                            onClick={() => handleImportFromVacancy("append")}
                            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-[#d4af37] backdrop-blur-xl text-[#fceabb] font-semibold text-[14px] hover:shadow-[0_0_15px_rgba(212,175,55,0.3)] transition-all"
                          >
                            <Plus className="w-4 h-4" />
                            <span>Добавить к текущим полям</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleImportFromVacancy("replace")}
                            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-white/25 hover:border-[#d4af37] backdrop-blur-xl text-white font-medium text-[14px] transition-all"
                          >
                            <Copy className="w-4 h-4" />
                            <span>Заменить текущие поля</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-white/15 bg-transparent backdrop-blur-xl">
          <div className="text-[14px] text-white/80 break-words">
            Всего полей для извлечения из резюме: <span className="font-bold text-[#fceabb]">{26 + customFields.length}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2.5 rounded-xl border border-[#d4af37] bg-transparent backdrop-blur-xl text-[#fceabb] font-semibold text-[14px] hover:shadow-[0_0_20px_rgba(212,175,55,0.35)] transition-all"
          >
            Готово
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(modalContent, document.body) : modalContent;
};
