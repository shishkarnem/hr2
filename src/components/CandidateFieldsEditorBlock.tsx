import React, { useState, useEffect, useMemo } from "react";
import {
  STANDARD_CANDIDATE_FIELDS,
  STANDARD_FIELD_CATEGORIES,
  CustomCandidateFieldDef,
  normalizeStandardFieldsFromCandidate,
  normalizeCustomFieldsFromCandidate,
  parseVacancyCustomFieldsConfig,
  parseMultiselectArray,
  formatCandidateFieldValueForDisplay,
} from "../constants/candidateFields";
import {
  Edit3,
  Check,
  X,
  Plus,
  Sparkles,
  Layers,
  Save,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

interface CandidateFieldsEditorBlockProps {
  candidate?: any;
  initialStandardFields?: Record<string, any>;
  initialCustomFields?: Record<string, any>;
  customFieldsConfig?: CustomCandidateFieldDef[] | any;
  candidateId?: string | null;
  persistToDb?: boolean;
  isEditable?: boolean;
  editable?: boolean;
  activeTheme?: any;
  defaultEditing?: boolean;
  allowAddCustomFieldDef?: boolean;
  title?: string;
  subtitle?: string;
  compact?: boolean;
  onSaved?: (data: {
    standardFields: Record<string, any>;
    customFields: Record<string, any>;
    customFieldsDefs?: CustomCandidateFieldDef[];
    candidate?: any;
  }) => void;
}

export const CandidateFieldsEditorBlock: React.FC<CandidateFieldsEditorBlockProps> = ({
  candidate,
  initialStandardFields,
  initialCustomFields,
  customFieldsConfig,
  candidateId,
  persistToDb = false,
  isEditable: isEditableProp = true,
  editable,
  activeTheme,
  defaultEditing = false,
  allowAddCustomFieldDef = false,
  title = "Данные анкеты и резюме по полям вакансии",
  subtitle,
  compact = false,
  onSaved,
}) => {
  const isEditable = editable !== undefined ? editable : isEditableProp;
  const computedInitialStd = useMemo(() => {
    if (initialStandardFields && Object.keys(initialStandardFields).length > 0) {
      return normalizeStandardFieldsFromCandidate({
        ...(candidate || {}),
        standard_fields_json: initialStandardFields,
      });
    }
    return normalizeStandardFieldsFromCandidate(candidate || {});
  }, [candidate, initialStandardFields]);

  const computedInitialCustom = useMemo(() => {
    if (initialCustomFields && Object.keys(initialCustomFields).length > 0) {
      return {
        ...normalizeCustomFieldsFromCandidate(candidate || {}),
        ...initialCustomFields,
      };
    }
    return normalizeCustomFieldsFromCandidate(candidate || {});
  }, [candidate, initialCustomFields]);

  const parsedConfigDefs = useMemo(() => {
    const raw =
      customFieldsConfig ??
      candidate?.candidate_fields_config ??
      candidate?.candidateFieldsConfig ??
      null;
    const cfg = parseVacancyCustomFieldsConfig(raw);
    const defs = [...(cfg.customFields || [])];
    // Also include any extra keys present in computedInitialCustom so no custom field is hidden
    const existingKeys = new Set(defs.map((d) => d.key));
    for (const [k, v] of Object.entries(computedInitialCustom)) {
      if (!existingKeys.has(k)) {
        defs.push({
          id: `cf_dyn_${k}`,
          key: k,
          label: k,
          type: Array.isArray(v) ? "multiselect" : "text",
          options: Array.isArray(v) ? v.map(String) : undefined,
        });
      }
    }
    return defs;
  }, [customFieldsConfig, candidate, computedInitialCustom]);

  const [standardFields, setStandardFields] = useState<Record<string, any>>(computedInitialStd);
  const [customFields, setCustomFields] = useState<Record<string, any>>(computedInitialCustom);
  const [customFieldDefs, setCustomFieldDefs] = useState<CustomCandidateFieldDef[]>(parsedConfigDefs);
  const [isEditing, setIsEditing] = useState<boolean>(defaultEditing);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<"all" | "filled" | "custom">("all");
  const [newOptionInputs, setNewOptionInputs] = useState<Record<string, string>>({});
  const [showAddCustomFieldForm, setShowAddCustomFieldForm] = useState(false);
  const [newCustomLabel, setNewCustomLabel] = useState("");
  const [newCustomType, setNewCustomType] = useState<"text" | "multiselect">("text");
  const [newCustomOptions, setNewCustomOptions] = useState("");
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    setStandardFields(computedInitialStd);
  }, [computedInitialStd]);

  useEffect(() => {
    setCustomFields(computedInitialCustom);
  }, [computedInitialCustom]);

  useEffect(() => {
    setCustomFieldDefs(parsedConfigDefs);
  }, [parsedConfigDefs]);

  const handleStdTextChange = (key: string, val: string) => {
    setStandardFields((prev) => ({
      ...prev,
      [key]: val,
      ...(key === "telegram" ? { telegram_alt: val } : key === "telegram_alt" ? { telegram: val } : {}),
    }));
  };

  const handleToggleMultiselect = (
    target: "standard" | "custom",
    key: string,
    option: string
  ) => {
    if (target === "standard") {
      const current = parseMultiselectArray(standardFields[key]);
      const exists = current.some((x) => x.toLowerCase() === option.toLowerCase());
      const next = exists
        ? current.filter((x) => x.toLowerCase() !== option.toLowerCase())
        : [...current, option];
      setStandardFields((prev) => ({ ...prev, [key]: next }));
    } else {
      const current = parseMultiselectArray(customFields[key]);
      const exists = current.some((x) => x.toLowerCase() === option.toLowerCase());
      const next = exists
        ? current.filter((x) => x.toLowerCase() !== option.toLowerCase())
        : [...current, option];
      setCustomFields((prev) => ({ ...prev, [key]: next }));
    }
  };

  const handleAddCustomMultiselectTag = (target: "standard" | "custom", key: string) => {
    const inputKey = `${target}_${key}`;
    const rawVal = (newOptionInputs[inputKey] || "").trim();
    if (!rawVal) return;
    const items = parseMultiselectArray(rawVal);
    if (target === "standard") {
      const current = parseMultiselectArray(standardFields[key]);
      const merged = Array.from(new Set([...current, ...items]));
      setStandardFields((prev) => ({ ...prev, [key]: merged }));
    } else {
      const current = parseMultiselectArray(customFields[key]);
      const merged = Array.from(new Set([...current, ...items]));
      setCustomFields((prev) => ({ ...prev, [key]: merged }));
    }
    setNewOptionInputs((prev) => ({ ...prev, [inputKey]: "" }));
  };

  const handleAddCustomFieldInline = () => {
    const label = newCustomLabel.trim();
    if (!label) return;
    const key = label
      .toLowerCase()
      .replace(/[^a-zа-яё0-9]+/gi, "_")
      .replace(/^_+|_+$/g, "") || `custom_${Date.now()}`;
    const opts =
      newCustomType === "multiselect"
        ? parseMultiselectArray(newCustomOptions).length > 0
          ? parseMultiselectArray(newCustomOptions)
          : ["Да", "Нет"]
        : undefined;
    const def: CustomCandidateFieldDef = {
      id: `cf_${Date.now()}`,
      key,
      label,
      type: newCustomType,
      options: opts,
    };
    setCustomFieldDefs((prev) => [...prev, def]);
    setCustomFields((prev) => ({
      ...prev,
      [key]: newCustomType === "multiselect" ? [] : "",
    }));
    setNewCustomLabel("");
    setNewCustomOptions("");
    setShowAddCustomFieldForm(false);
    setIsEditing(true);
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveMessage(null);
    try {
      const targetId = candidateId || candidate?.id || candidate?.public_id;
      if (persistToDb && targetId) {
        const res = await fetch(`/api/candidates/${encodeURIComponent(String(targetId))}/fields`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            standardFields,
            customFields,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data?.error || "Не удалось сохранить поля кандидата");
        }
        setSaveMessage("Данные профиля успешно сохранены в базе данных.");
        setIsEditing(false);
        if (onSaved) {
          onSaved({
            standardFields: data.standardFields || standardFields,
            customFields: data.customFields || customFields,
            customFieldsDefs: customFieldDefs,
            candidate: data.candidate,
          });
        }
      } else {
        setSaveMessage("Изменения применены.");
        setIsEditing(false);
        if (onSaved) {
          onSaved({
            standardFields,
            customFields,
            customFieldsDefs: customFieldDefs,
          });
        }
      }
    } catch (err: any) {
      setSaveMessage(err?.message || "Ошибка при сохранении");
    } finally {
      setIsSaving(false);
      setTimeout(() => setSaveMessage(null), 4000);
    }
  };

  const filledStdCount = useMemo(() => {
    return STANDARD_CANDIDATE_FIELDS.filter((f) => {
      const v = standardFields[f.key];
      if (Array.isArray(v)) return v.length > 0;
      return Boolean(v && String(v).trim());
    }).length;
  }, [standardFields]);

  const filledCustomCount = useMemo(() => {
    return customFieldDefs.filter((f) => {
      const v = customFields[f.key] ?? customFields[f.label];
      if (Array.isArray(v)) return v.length > 0;
      return Boolean(v && String(v).trim());
    }).length;
  }, [customFieldDefs, customFields]);

  return (
    <div className="rounded-2xl border border-white/15 backdrop-blur-2xl p-4 sm:p-5 space-y-4 text-white text-[14px]">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/15 pb-3.5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="text-base sm:text-lg font-bold bg-gradient-to-r from-[#fff3c4] via-[#d4af37] to-[#b8860b] bg-clip-text text-transparent break-words">
              {title}
            </h4>
            <button
              type="button"
              onClick={() => setIsCollapsed((p) => !p)}
              className="p-1.5 rounded-lg border border-white/15 text-white/80 hover:text-white hover:border-[#d4af37] transition-all"
              title={isCollapsed ? "Развернуть поля" : "Свернуть поля"}
            >
              {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
            </button>
          </div>
          <p className="text-[14px] text-white/75 mt-0.5 break-words">
            {subtitle ||
              `Заполнено стандартных полей: ${filledStdCount} из 26 • Кастомных полей вакансии: ${filledCustomCount} из ${customFieldDefs.length}`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {isEditable && !isEditing && (
            <button
              type="button"
              onClick={() => {
                setIsCollapsed(false);
                setIsEditing(true);
              }}
              className="flex items-center gap-2 px-4 py-2 rounded-xl border border-[#d4af37] backdrop-blur-xl text-[#fceabb] hover:shadow-[0_0_15px_rgba(212,175,55,0.3)] transition-all text-[14px] font-semibold"
            >
              <Edit3 className="w-4 h-4 text-[#d4af37]" />
              <span>Редактировать поля</span>
            </button>
          )}
          {isEditable && isEditing && (
            <>
              <button
                type="button"
                disabled={isSaving}
                onClick={handleSave}
                className="flex items-center gap-2 px-4 py-2 rounded-xl border border-[#d4af37] backdrop-blur-xl text-[#fceabb] hover:shadow-[0_0_15px_rgba(212,175,55,0.35)] transition-all text-[14px] font-semibold disabled:opacity-50"
              >
                <Save className="w-4 h-4 text-[#d4af37]" />
                <span>{isSaving ? "Сохранение..." : "Сохранить изменения"}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setStandardFields(computedInitialStd);
                  setCustomFields(computedInitialCustom);
                  setIsEditing(false);
                }}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-white/20 backdrop-blur-md text-white/85 hover:border-white/40 transition-all text-[14px]"
              >
                <X className="w-4 h-4" />
                <span>Отмена</span>
              </button>
            </>
          )}
        </div>
      </div>

      {saveMessage && (
        <div className="p-3 rounded-xl border border-[#d4af37] backdrop-blur-xl text-[#fceabb] text-[14px] flex items-center gap-2">
          <Check className="w-4 h-4 shrink-0 text-[#d4af37]" />
          <span className="break-words">{saveMessage}</span>
        </div>
      )}

      {!isCollapsed && (
        <>
          {/* Filter Tabs (responsive grid on mobile, no horizontal scroll) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setActiveSection("all")}
              className={`px-3.5 py-2 rounded-xl border text-[14px] font-medium transition-all ${
                activeSection === "all"
                  ? "border-[#d4af37] text-[#fceabb] backdrop-blur-xl"
                  : "border-white/15 text-white/80 hover:border-white/35 backdrop-blur-md"
              }`}
            >
              Все поля ({26 + customFieldDefs.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveSection("filled")}
              className={`px-3.5 py-2 rounded-xl border text-[14px] font-medium transition-all ${
                activeSection === "filled"
                  ? "border-[#d4af37] text-[#fceabb] backdrop-blur-xl"
                  : "border-white/15 text-white/80 hover:border-white/35 backdrop-blur-md"
              }`}
            >
              Только заполненные ({filledStdCount + filledCustomCount})
            </button>
            <button
              type="button"
              onClick={() => setActiveSection("custom")}
              className={`px-3.5 py-2 rounded-xl border text-[14px] font-medium transition-all ${
                activeSection === "custom"
                  ? "border-[#d4af37] text-[#fceabb] backdrop-blur-xl"
                  : "border-white/15 text-white/80 hover:border-white/35 backdrop-blur-md"
              }`}
            >
              Кастомные поля вакансии ({customFieldDefs.length})
            </button>
          </div>

          {/* Custom Fields Section */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#d4af37] shrink-0" />
                <h5 className="text-[15px] font-bold bg-gradient-to-r from-[#fff3c4] via-[#d4af37] to-[#b8860b] bg-clip-text text-transparent">
                  Кастомные поля вакансии ({customFieldDefs.length})
                </h5>
              </div>
              {allowAddCustomFieldDef && (
                <button
                  type="button"
                  onClick={() => setShowAddCustomFieldForm((p) => !p)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#d4af37]/50 text-[#fceabb] hover:border-[#d4af37] text-[14px] transition-all self-start sm:self-auto"
                >
                  <Plus className="w-4 h-4" />
                  <span>Добавить кастомное поле</span>
                </button>
              )}
            </div>

            {showAddCustomFieldForm && (
              <div className="p-3.5 rounded-2xl border border-[#d4af37]/40 backdrop-blur-xl space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <input
                    type="text"
                    value={newCustomLabel}
                    onChange={(e) => setNewCustomLabel(e.target.value)}
                    placeholder="Название поля (например: Портфолио)"
                    className="px-3 py-2 rounded-xl border border-white/20 backdrop-blur-md text-white placeholder-white/45 text-[14px] focus:outline-none focus:border-[#d4af37]"
                  />
                  <select
                    value={newCustomType}
                    onChange={(e) => setNewCustomType(e.target.value as "text" | "multiselect")}
                    className="px-3 py-2 rounded-xl border border-white/20 backdrop-blur-md text-white bg-transparent text-[14px] focus:outline-none focus:border-[#d4af37]"
                  >
                    <option value="text" className="bg-[#14161d] text-white">Тип: Текст</option>
                    <option value="multiselect" className="bg-[#14161d] text-white">Тип: Мультисписок</option>
                  </select>
                  {newCustomType === "multiselect" ? (
                    <input
                      type="text"
                      value={newCustomOptions}
                      onChange={(e) => setNewCustomOptions(e.target.value)}
                      placeholder="Варианты через запятую..."
                      className="px-3 py-2 rounded-xl border border-white/20 backdrop-blur-md text-white placeholder-white/45 text-[14px] focus:outline-none focus:border-[#d4af37]"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={handleAddCustomFieldInline}
                      className="px-4 py-2 rounded-xl border border-[#d4af37] text-[#fceabb] font-semibold text-[14px]"
                    >
                      Создать поле
                    </button>
                  )}
                </div>
                {newCustomType === "multiselect" && (
                  <button
                    type="button"
                    onClick={handleAddCustomFieldInline}
                    className="px-4 py-2 rounded-xl border border-[#d4af37] text-[#fceabb] font-semibold text-[14px]"
                  >
                    Создать мультисписок
                  </button>
                )}
              </div>
            )}

            <div className={`grid grid-cols-1 ${compact ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-3"} gap-3`}>
              {customFieldDefs
                .filter((field) => {
                  if (activeSection !== "filled") return true;
                  const val = customFields[field.key] ?? customFields[field.label];
                  return Array.isArray(val) ? val.length > 0 : Boolean(val && String(val).trim());
                })
                .map((field) => {
                  const rawVal = customFields[field.key] ?? customFields[field.label];
                  const selectedArr = field.type === "multiselect" ? parseMultiselectArray(rawVal) : [];
                  const allOptions = Array.from(
                    new Set([...(field.options || []), ...selectedArr])
                  );

                  return (
                    <div
                      key={field.id || field.key}
                      className="p-3.5 rounded-xl border border-[#d4af37]/30 backdrop-blur-xl flex flex-col justify-between gap-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-[#fceabb] text-[14px] break-words">
                          {field.label}
                        </span>
                        <span className="text-[14px] text-white/60 shrink-0">
                          {field.type === "multiselect" ? "Мультисписок" : "Текст"}
                        </span>
                      </div>

                      {!isEditing ? (
                        field.type === "multiselect" ? (
                          selectedArr.length > 0 ? (
                            <div className="flex flex-wrap gap-1.5">
                              {selectedArr.map((tag, idx) => (
                                <span
                                  key={idx}
                                  className="px-2.5 py-1 rounded-lg border border-[#d4af37]/50 text-white text-[14px] break-words"
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <div className="text-white/55 text-[14px]">Не указано</div>
                          )
                        ) : (
                          <div className="text-white text-[14px] break-words">
                            {formatCandidateFieldValueForDisplay(rawVal)}
                          </div>
                        )
                      ) : field.type === "multiselect" ? (
                        <div className="space-y-2">
                          <div className="flex flex-wrap gap-1.5">
                            {allOptions.map((opt) => {
                              const active = selectedArr.some(
                                (x) => x.toLowerCase() === opt.toLowerCase()
                              );
                              return (
                                <button
                                  key={opt}
                                  type="button"
                                  onClick={() => handleToggleMultiselect("custom", field.key, opt)}
                                  className={`px-2.5 py-1 rounded-lg border text-[14px] transition-all break-words ${
                                    active
                                      ? "border-[#d4af37] text-[#fceabb] font-semibold shadow-[0_0_10px_rgba(212,175,55,0.25)]"
                                      : "border-white/20 text-white/75 hover:border-white/40"
                                  }`}
                                >
                                  {opt}
                                </button>
                              );
                            })}
                          </div>
                          <div className="flex items-center gap-1.5">
                            <input
                              type="text"
                              value={newOptionInputs[`custom_${field.key}`] || ""}
                              onChange={(e) =>
                                setNewOptionInputs((prev) => ({
                                  ...prev,
                                  [`custom_${field.key}`]: e.target.value,
                                }))
                              }
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  handleAddCustomMultiselectTag("custom", field.key);
                                }
                              }}
                              placeholder="Добавить своё значение..."
                              className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg border border-white/20 backdrop-blur-md text-white placeholder-white/45 text-[14px] focus:outline-none focus:border-[#d4af37]"
                            />
                            <button
                              type="button"
                              onClick={() => handleAddCustomMultiselectTag("custom", field.key)}
                              className="px-2.5 py-1.5 rounded-lg border border-[#d4af37]/60 text-[#fceabb] text-[14px] shrink-0"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      ) : (
                        <input
                          type="text"
                          value={rawVal !== undefined && rawVal !== null ? String(rawVal) : ""}
                          onChange={(e) =>
                            setCustomFields((prev) => ({
                              ...prev,
                              [field.key]: e.target.value,
                            }))
                          }
                          placeholder={field.placeholder || `Укажите ${field.label.toLowerCase()}...`}
                          className="w-full px-3 py-2 rounded-xl border border-white/25 backdrop-blur-md text-white placeholder-white/45 text-[14px] focus:outline-none focus:border-[#d4af37]"
                        />
                      )}
                    </div>
                  );
                })}
            </div>
          </div>

          {/* Standard 26 Fields grouped by Category */}
          {activeSection !== "custom" && (
            <div className="space-y-4 pt-2">
              {(Object.keys(STANDARD_FIELD_CATEGORIES) as Array<keyof typeof STANDARD_FIELD_CATEGORIES>).map(
                (catKey) => {
                  const fieldsInCat = STANDARD_CANDIDATE_FIELDS.filter((f) => {
                    if (f.category !== catKey) return false;
                    if (activeSection === "filled") {
                      const val = standardFields[f.key];
                      return Array.isArray(val) ? val.length > 0 : Boolean(val && String(val).trim());
                    }
                    return true;
                  });

                  if (fieldsInCat.length === 0) return null;

                  return (
                    <div key={catKey} className="space-y-2.5">
                      <div className="flex items-center gap-2">
                        <Layers className="w-4 h-4 text-[#d4af37] shrink-0" />
                        <h5 className="text-[15px] font-bold bg-gradient-to-r from-[#fff3c4] via-[#d4af37] to-[#b8860b] bg-clip-text text-transparent">
                          {STANDARD_FIELD_CATEGORIES[catKey]}
                        </h5>
                      </div>

                      <div
                        className={`grid grid-cols-1 ${
                          compact ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-3"
                        } gap-3`}
                      >
                        {fieldsInCat.map((field) => {
                          const rawVal = standardFields[field.key];
                          const selectedArr =
                            field.type === "multiselect" ? parseMultiselectArray(rawVal) : [];
                          const allOptions = Array.from(
                            new Set([...(field.options || []), ...selectedArr])
                          );

                          return (
                            <div
                              key={field.key}
                              className="p-3.5 rounded-xl border border-white/15 backdrop-blur-xl flex flex-col justify-between gap-2"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-semibold text-white/95 text-[14px] break-words">
                                  {field.label}
                                </span>
                                <span className="text-[14px] text-white/55 shrink-0">
                                  {field.type === "multiselect" ? "Мультисписок" : "Текст"}
                                </span>
                              </div>

                              {!isEditing ? (
                                field.type === "multiselect" ? (
                                  selectedArr.length > 0 ? (
                                    <div className="flex flex-wrap gap-1.5">
                                      {selectedArr.map((tag, idx) => (
                                        <span
                                          key={idx}
                                          className="px-2.5 py-1 rounded-lg border border-white/25 text-white text-[14px] break-words"
                                        >
                                          {tag}
                                        </span>
                                      ))}
                                    </div>
                                  ) : (
                                    <div className="text-white/50 text-[14px]">Не указано</div>
                                  )
                                ) : (
                                  <div className="text-white text-[14px] break-words">
                                    {formatCandidateFieldValueForDisplay(rawVal)}
                                  </div>
                                )
                              ) : field.type === "multiselect" ? (
                                <div className="space-y-2">
                                  <div className="flex flex-wrap gap-1.5">
                                    {allOptions.map((opt) => {
                                      const active = selectedArr.some(
                                        (x) => x.toLowerCase() === opt.toLowerCase()
                                      );
                                      return (
                                        <button
                                          key={opt}
                                          type="button"
                                          onClick={() =>
                                            handleToggleMultiselect("standard", field.key, opt)
                                          }
                                          className={`px-2.5 py-1 rounded-lg border text-[14px] transition-all break-words ${
                                            active
                                              ? "border-[#d4af37] text-[#fceabb] font-semibold shadow-[0_0_10px_rgba(212,175,55,0.25)]"
                                              : "border-white/20 text-white/75 hover:border-white/40"
                                          }`}
                                        >
                                          {opt}
                                        </button>
                                      );
                                    })}
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    <input
                                      type="text"
                                      value={newOptionInputs[`standard_${field.key}`] || ""}
                                      onChange={(e) =>
                                        setNewOptionInputs((prev) => ({
                                          ...prev,
                                          [`standard_${field.key}`]: e.target.value,
                                        }))
                                      }
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                          e.preventDefault();
                                          handleAddCustomMultiselectTag("standard", field.key);
                                        }
                                      }}
                                      placeholder="Добавить своё значение..."
                                      className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg border border-white/20 backdrop-blur-md text-white placeholder-white/45 text-[14px] focus:outline-none focus:border-[#d4af37]"
                                    />
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleAddCustomMultiselectTag("standard", field.key)
                                      }
                                      className="px-2.5 py-1.5 rounded-lg border border-[#d4af37]/60 text-[#fceabb] text-[14px] shrink-0"
                                    >
                                      +
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <input
                                  type="text"
                                  value={
                                    rawVal !== undefined && rawVal !== null ? String(rawVal) : ""
                                  }
                                  onChange={(e) => handleStdTextChange(field.key, e.target.value)}
                                  placeholder={field.placeholder || `Укажите ${field.label.toLowerCase()}...`}
                                  className="w-full px-3 py-2 rounded-xl border border-white/25 backdrop-blur-md text-white placeholder-white/45 text-[14px] focus:outline-none focus:border-[#d4af37]"
                                />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                }
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};
