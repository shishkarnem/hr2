import React, { useMemo, useState } from "react";
import {
  CheckCircle2,
  Sparkles,
  Calendar,
  Wallet,
  Briefcase,
  Users,
  Cpu,
  GraduationCap,
  BookOpen,
  ListChecks,
  RotateCcw,
  Wand2,
  Eraser,
  ChevronDown,
  Eye,
  EyeOff,
  Layers,
  Plus,
  RefreshCw,
  Settings2,
} from "lucide-react";
import { useAIReady } from "../lib/aiReady";
import { resolveActiveEmployerId } from "../lib/actorSession";
import FieldHelp from "./FieldHelp";
import FieldActionsMenu from "./FieldActionsMenu";
import MiniAudioField from "./MiniAudioField";
import {
  VACANCY_FIELDS,
  VACANCY_FIELDS_BY_KEY,
  VACANCY_FIELD_GROUPS,
  type VacancyField,
  type VacancyFieldKey,
} from "../lib/fieldFormats";
import { CandidateFieldsModal } from "./CandidateFieldsModal";
import {
  STANDARD_CANDIDATE_FIELDS,
  CustomCandidateFieldDef,
  parseVacancyCustomFieldsConfig,
} from "../constants/candidateFields";

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------

export type VacancyFormValues = Partial<Record<VacancyFieldKey, string>> & {
  candidate_fields_config?: any;
};

export interface VacancyEditorProps {
  values: VacancyFormValues;
  onChange: (patch: VacancyFormValues) => void;
  /** Optional per-field AI enhance callback ("magic wand"). */
  onAIEnhance?: (key: VacancyFieldKey) => void | Promise<void>;
  /** Disabled while an AI request is in flight for a specific field. */
  aiLoadingKey?: VacancyFieldKey | null;
  /** create = editor inside the wizard; edit = editor inside the modal. */
  mode?: "create" | "edit";
  /** Optional company name for the page title in preview (visual only). */
  companyName?: string;
  /** Optional role name when role_name is hidden from fields. */
  roleName?: string;
  /** Skip rendering these field keys (e.g. when role_name is shown elsewhere). */
  hideKeys?: VacancyFieldKey[];
  /** Per-role template values (from job_titles.field_templates). */
  roleTemplates?: Partial<Record<VacancyFieldKey, string>>;
  /** Custom fields config and callbacks for candidate profile extraction */
  customFieldsConfig?: any;
  onChangeCustomFieldsConfig?: (nextConfig: { standardFieldsEnabled: boolean; customFields: CustomCandidateFieldDef[] }) => void;
  otherProjects?: any[];
  projectId?: string;
  currentProjectId?: string;
  employerId?: string;
}

// ----------------------------------------------------------------------------
// Per-field preview renderers (mirror the production landing block-by-block)
// ----------------------------------------------------------------------------

const parseBullets = (raw: string): string[] =>
  (raw || "")
    .split("\n")
    .map((l) => l.replace(/^[•\s\-*]+/, "").trim())
    .filter(Boolean);

const parseTagged = (raw: string): { title: string; desc: string }[] =>
  parseBullets(raw).map((l) => {
    const m = l.match(/^\[(.*?)\]\s*(.*)$/);
    return m ? { title: m[1].trim(), desc: m[2].trim() } : { title: "", desc: l };
  });

const PreviewShell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="mt-3 rounded-2xl border border-dashed border-[#E7C768]/35 bg-transparent backdrop-blur-md p-4">
    <div className="mb-2 flex items-center gap-1.5 text-sm font-bold tracking-wider text-[#E7C768]">
      <Sparkles className="h-4 w-4" /> Превью на лендинге
    </div>
    {children}
  </div>
);

const EmptyPreview: React.FC = () => (
  <p className="text-sm italic text-white/60">
    Поле пустое — блок не появится на лендинге.
  </p>
);

export function renderFieldPreview(
  field: VacancyField,
  value: string,
): React.ReactNode {
  const v = (value || "").trim();

  if (!v) return <EmptyPreview />;

  switch (field.preview) {
    case "plain":
      return (
        <p className="whitespace-pre-line text-sm leading-relaxed text-white/90">
          {v}
        </p>
      );

    case "bullets": {
      const items = parseBullets(v);
      if (items.length === 0) return <EmptyPreview />;
      return (
        <ul className="space-y-2">
          {items.map((it, i) => (
            <li
              key={i}
              className="flex items-start gap-2 text-sm leading-relaxed text-white/90"
            >
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#E7C768]" />
              <span>{it}</span>
            </li>
          ))}
        </ul>
      );
    }

    case "bullets-tagged":
    case "stages": {
      const items = parseTagged(v);
      if (items.length === 0) return <EmptyPreview />;
      return (
        <ul className="space-y-2">
          {items.map((it, i) => (
            <li
              key={i}
              className="flex items-start gap-2 text-sm leading-relaxed text-white/90"
            >
              {it.title && (
                <span className="inline-flex shrink-0 items-center rounded-md border border-[#E7C768]/40 bg-transparent px-2 py-0.5 text-sm font-bold text-[#E7C768]">
                  {it.title}
                </span>
              )}
              <span>{it.desc}</span>
            </li>
          ))}
        </ul>
      );
    }

    case "schedule":
      return (
        <div className="flex items-start gap-2 text-sm leading-relaxed text-white/90">
          <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-[#E7C768]" />
          <span className="whitespace-pre-line">{v}</span>
        </div>
      );

    case "payouts":
      return (
        <div className="flex items-start gap-2 rounded-xl border border-[#E7C768]/30 bg-transparent backdrop-blur-md p-3 text-sm leading-relaxed text-white">
          <Wallet className="mt-0.5 h-4 w-4 shrink-0 text-[#E7C768]" />
          <span className="whitespace-pre-line">{v}</span>
        </div>
      );
  }
}

// ----------------------------------------------------------------------------
// Group icon
// ----------------------------------------------------------------------------

const GROUP_ICON: Record<VacancyField["group"], React.ReactNode> = {
  main: <Briefcase className="h-4 w-4" />,
  motivation: <Wallet className="h-4 w-4" />,
  team: <Users className="h-4 w-4" />,
  training: <GraduationCap className="h-4 w-4" />,
};

// ----------------------------------------------------------------------------
// VacancyEditor
// ----------------------------------------------------------------------------

export const VacancyEditor: React.FC<VacancyEditorProps> = ({
  values,
  onChange,
  onAIEnhance,
  aiLoadingKey,
  mode = "edit",
  companyName,
  roleName,
  hideKeys,
  roleTemplates,
  customFieldsConfig,
  onChangeCustomFieldsConfig,
  otherProjects = [],
  projectId,
  currentProjectId,
  employerId,
}) => {
  const groups = useMemo(
    () =>
      VACANCY_FIELD_GROUPS.map((g) => ({
        ...g,
        fields: VACANCY_FIELDS.filter(
          (f) => f.group === g.id && !(hideKeys ?? []).includes(f.key),
        ),
      })).filter((g) => g.fields.length > 0),
    [hideKeys],
  );

  const set = (key: VacancyFieldKey, val: string) => onChange({ [key]: val });

  const applyTemplate = (key: VacancyFieldKey) => {
    const f = VACANCY_FIELDS_BY_KEY[key];
    const tpl = (roleTemplates?.[key] || "").trim();
    set(key, tpl || f.example);
  };

  const clearField = (key: VacancyFieldKey) => set(key, "");

  // По умолчанию открыта первая группа; остальные свёрнуты — меньше шума.
  const [openGroup, setOpenGroup] = useState<string>(groups[0]?.id || "");
  const [isFieldsModalOpen, setIsFieldsModalOpen] = useState(false);
  const [isGeneratingMoreFields, setIsGeneratingMoreFields] = useState(false);

  const resolvedCustomConfig = useMemo(() => {
    return parseVacancyCustomFieldsConfig(
      customFieldsConfig ?? values.candidate_fields_config
    );
  }, [customFieldsConfig, values.candidate_fields_config]);

  const handleUpdateCustomFields = (nextFields: CustomCandidateFieldDef[]) => {
    const nextCfg = {
      standardFieldsEnabled: true,
      customFields: nextFields,
    };
    if (onChangeCustomFieldsConfig) {
      onChangeCustomFieldsConfig(nextCfg);
    }
    onChange({ candidate_fields_config: JSON.stringify(nextCfg) });
  };

  const handleQuickGeneratePlus5 = async () => {
    setIsGeneratingMoreFields(true);
    try {
      const effEmpId = resolveActiveEmployerId({ employer_id: employerId });
      const res = await fetch("/api/ai/generate-custom-fields", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roleName: roleName || values.role_name || "",
          companyName: companyName || "",
          description: values.vacancy_text || "",
          duties: values.tasks_activity_text || "",
          requirements: values.system_text || "",
          conditions: `${values.schedule_text || ""} ${values.motivation_text || ""}`,
          existingCustomFields: resolvedCustomConfig.customFields,
          count: 5,
          mode: "append",
          employerId: effEmpId,
          employer_id: effEmpId,
          employer_public_id: effEmpId,
        }),
      });
      const data = await res.json();
      if (res.ok && Array.isArray(data?.customFields)) {
        handleUpdateCustomFields(data.customFields);
      }
    } catch (e) {
      console.warn("Quick +5 custom fields generation error:", e);
    } finally {
      setIsGeneratingMoreFields(false);
    }
  };

  return (
    <div className="brand-editor space-y-6 rounded-3xl bg-transparent backdrop-blur-xl">
      {mode === "create" && (
        <div className="rounded-2xl border border-[#E7C768]/30 bg-transparent backdrop-blur-md px-4 py-3 text-sm text-white/90">
          <strong className="text-[#E7C768]">15 полей</strong> — заполните то,
          что важно. Пустые блоки на лендинге{companyName ? ` «${companyName}»` : ""} не появятся.
        </div>
      )}

      {/* Секция конструктора стандартных (26) и кастомных полей вакансии для оценки резюме и анкеты кандидата */}
      <section className="overflow-hidden rounded-2xl border border-[#E7C768]/40 bg-transparent backdrop-blur-xl p-4 sm:p-5 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2">
              <Layers className="h-5 w-5 text-[#E7C768] shrink-0" />
              <h3 className="text-base font-bold bg-gradient-to-r from-[#fff3c4] via-[#d4af37] to-[#b8860b] bg-clip-text text-transparent break-words">
                Поля анкеты и резюме кандидата (26 стандартных + {resolvedCustomConfig.customFields.length} кастомных)
              </h3>
            </div>
            <p className="text-sm text-white/80 break-words">
              При скрининге резюме нейросеть автоматически извлекает 26 стандартных полей и кастомные поля этой вакансии в профиль соискателя и в СРМ.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={isGeneratingMoreFields}
              onClick={handleQuickGeneratePlus5}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl border border-[#E7C768] bg-transparent backdrop-blur-md text-[#fceabb] hover:shadow-[0_0_15px_rgba(212,175,55,0.3)] transition-all text-sm font-semibold disabled:opacity-50"
              title="Сгенерировать +5 дополнительных уникальных полей на основании текущих сведений о вакансии"
            >
              {isGeneratingMoreFields ? (
                <RefreshCw className="h-4 w-4 animate-spin text-[#E7C768]" />
              ) : (
                <Sparkles className="h-4 w-4 text-[#E7C768]" />
              )}
              <span>+5 полей ИИ</span>
            </button>
            <button
              type="button"
              onClick={() => setIsFieldsModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl border border-white/25 hover:border-[#E7C768] bg-transparent backdrop-blur-md text-white transition-all text-sm font-semibold"
            >
              <Settings2 className="h-4 w-4 text-[#E7C768]" />
              <span>Конструктор полей ({resolvedCustomConfig.customFields.length})</span>
            </button>
          </div>
        </div>

        {/* Облако тегов: 26 стандартных полей + кастомные поля вакансии для сбора */}
        <div className="flex flex-wrap gap-2 pt-1">
          {STANDARD_CANDIDATE_FIELDS.map((sf) => (
            <span
              key={`std-${sf.key}`}
              onClick={() => setIsFieldsModalOpen(true)}
              className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-white/25 hover:border-[#E7C768] bg-transparent backdrop-blur-md text-[14px] text-white transition-all break-words"
              title={
                sf.type === "multiselect" && sf.options
                  ? `Стандартное поле (мультисписок): ${sf.options.join(", ")}`
                  : "Стандартное текстовое поле"
              }
            >
              <span className="font-medium text-white">{sf.label}</span>
              <span className="text-white/65">
                ({sf.type === "multiselect" ? "мультисписок" : "текст"})
              </span>
            </span>
          ))}
          {resolvedCustomConfig.customFields.map((cf, i) => (
            <span
              key={cf.id || cf.key || `custom-${i}`}
              onClick={() => setIsFieldsModalOpen(true)}
              className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#E7C768] hover:shadow-[0_0_12px_rgba(212,175,55,0.3)] bg-transparent backdrop-blur-md text-[14px] text-white transition-all break-words"
              title={
                cf.type === "multiselect" && cf.options
                  ? `Кастомное поле (мультисписок): ${cf.options.join(", ")}`
                  : "Кастомное текстовое поле"
              }
            >
              <Sparkles className="h-3.5 w-3.5 text-[#E7C768] shrink-0" />
              <span className="font-semibold text-[#fceabb]">{cf.label}</span>
              <span className="text-white/75">
                ({cf.type === "multiselect" ? "мультисписок" : "текст"})
              </span>
            </span>
          ))}
          <button
            type="button"
            onClick={() => setIsFieldsModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-dashed border-[#E7C768]/60 hover:border-[#E7C768] bg-transparent backdrop-blur-md text-[14px] font-medium text-[#fceabb] transition-all"
          >
            <Plus className="h-4 w-4 text-[#E7C768]" />
            <span>Добавить или импортировать поля</span>
          </button>
        </div>
      </section>

      <CandidateFieldsModal
        isOpen={isFieldsModalOpen}
        onClose={() => setIsFieldsModalOpen(false)}
        roleName={roleName || values.role_name || ""}
        companyName={companyName}
        description={values.vacancy_text || ""}
        duties={values.tasks_activity_text || ""}
        requirements={values.system_text || ""}
        conditions={`${values.schedule_text || ""} ${values.motivation_text || ""}`}
        customFields={resolvedCustomConfig.customFields}
        onChangeCustomFields={handleUpdateCustomFields}
        otherProjects={otherProjects}
        currentProjectId={currentProjectId || projectId}
        employerId={employerId}
      />

      <div className="space-y-3">
        {groups.map((g) => {
          const filled = g.fields.filter((f) => (values[f.key] || "").trim().length > 0).length;
          const total = g.fields.length;
          const isOpen = openGroup === g.id;
          return (
            <section
              key={g.id}
              className="overflow-hidden rounded-2xl border border-white/15 bg-transparent backdrop-blur-xl"
            >
              <button
                type="button"
                onClick={() => setOpenGroup(isOpen ? "" : g.id)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:border-[#E7C768]/40"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#E7C768]/30 text-[#E7C768]">
                  {GROUP_ICON[g.id]}
                </span>
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-bold tracking-wide text-[#E7C768]">
                    {g.label}
                  </h3>
                  <p className="text-sm text-white/70">
                    Заполнено {filled} из {total}
                  </p>
                </div>
                <ChevronDown
                  className={`h-5 w-5 text-white/80 transition-transform ${isOpen ? "rotate-180" : ""}`}
                />
              </button>
              {isOpen && (
                <div className="space-y-4 border-t border-white/10 p-4">
                  {g.fields.map((f) => (
                    <FieldRow
                      key={f.key}
                      field={f}
                      value={values[f.key] ?? ""}
                      onChange={(v) => set(f.key, v)}
                      onAIEnhance={onAIEnhance ? () => onAIEnhance(f.key) : undefined}
                      aiLoading={aiLoadingKey === f.key}
                      onApplyTemplate={() => applyTemplate(f.key)}
                      onClear={() => clearField(f.key)}
                      hasRoleTemplate={Boolean((roleTemplates?.[f.key] || "").trim())}
                    />
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
};

// ----------------------------------------------------------------------------
// FieldRow
// ----------------------------------------------------------------------------

interface FieldRowProps {
  field: VacancyField;
  value: string;
  onChange: (v: string) => void;
  onAIEnhance?: () => void;
  aiLoading?: boolean;
  onApplyTemplate: () => void;
  onClear: () => void;
  hasRoleTemplate?: boolean;
}

const FieldRow: React.FC<FieldRowProps> = ({
  field,
  value,
  onChange,
  onAIEnhance,
  aiLoading,
  onApplyTemplate,
  onClear,
  hasRoleTemplate,
}) => {
  const aiReady = useAIReady();
  const [showPreview, setShowPreview] = useState(false);

  return (
    <div className="rounded-2xl border border-white/20 bg-transparent backdrop-blur-md p-4">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0 flex-1">
          <label className="block text-sm font-bold text-white inline-flex items-center">
            {field.label}
            <FieldHelp
              section="vacancies"
              fieldKey={field.key}
              fallbackTitle={field.label}
              fallbackBody={`${field.hint || ""}${field.example ? `\n\n**Пример:**\n\n${field.example}` : ""}`}
            />
          </label>
          <p className="mt-1 text-sm text-white/80 leading-relaxed">{field.hint}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {onAIEnhance && (
            <button
              type="button"
              onClick={onAIEnhance}
              disabled={aiLoading || !aiReady}
              className="cursor-pointer flex items-center gap-1.5 rounded-2xl border border-[#E7C768] px-3 py-1.5 text-sm font-semibold text-white bg-transparent shadow hover:border-white active:scale-95 transition disabled:opacity-50"
              title="ИИ-улучшение этого поля на основе всей вакансии"
            >
              <Wand2 className={`h-4 w-4 text-[#E7C768] ${aiLoading ? "animate-spin" : ""}`} />
              <span>{aiLoading ? "ИИ..." : "AI"}</span>
            </button>
          )}
          <FieldActionsMenu
            ariaLabel="Действия с полем"
            actions={[
              {
                icon: <RotateCcw className="h-4 w-4 text-white" />,
                label: hasRoleTemplate ? "Шаблон должности" : "Подставить шаблон",
                onClick: onApplyTemplate,
              },
              {
                icon: showPreview ? <EyeOff className="h-4 w-4 text-white" /> : <Eye className="h-4 w-4 text-white" />,
                label: showPreview ? "Скрыть превью" : "Показать превью",
                onClick: () => setShowPreview((v) => !v),
              },
              {
                icon: <Eraser className="h-4 w-4 text-white" />,
                label: "Очистить поле",
                onClick: onClear,
                disabled: !value,
                danger: true,
                separatorAbove: true,
              },
            ]}
          />
        </div>
      </div>

      <div className="mt-2">
        <MiniAudioField
          value={value}
          onChange={onChange}
          placeholder={field.example}
          maxLength={field.max}
          minRows={field.multiline ? (field.rows ?? 3) : 1}
          sphereColor="#E7C768"
          borderColor="rgba(231, 199, 104, 0.4)"
        />
      </div>

      {showPreview && <PreviewShell>{renderFieldPreview(field, value)}</PreviewShell>}
    </div>
  );
};

// ----------------------------------------------------------------------------
// Compact landing renderer — pure-data version usable on the public landing
// once VacancySections is migrated to consume only the 15 canonical fields.
// ----------------------------------------------------------------------------

export const VacancyLandingBlocks: React.FC<{ values: VacancyFormValues }> = ({
  values,
}) => {
  const present = VACANCY_FIELDS.filter(
    (f) => f.key !== "role_name" && (values[f.key] || "").trim().length > 0,
  );

  if (present.length === 0) {
    return (
      <p className="text-sm italic text-slate-400">
        Лендинг пока пуст — заполните хотя бы одно поле в редакторе вакансии.
      </p>
    );
  }

  const ICON: Record<VacancyField["group"], React.ReactNode> = {
    main: <ListChecks className="h-4 w-4" />,
    motivation: <Wallet className="h-4 w-4" />,
    team: <Cpu className="h-4 w-4" />,
    training: <BookOpen className="h-4 w-4" />,
  };

  return (
    <div className="space-y-5">
      {present.map((f) => (
        <section
          key={f.key}
          className="rounded-2xl border border-white/10 bg-[#1E4468]/80 p-5"
        >
          <header className="mb-3 flex items-center gap-2 border-b border-white/10 pb-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#E7C768]/10 text-[#E7C768]">
              {ICON[f.group]}
            </span>
            <h3 className="text-sm font-bold uppercase tracking-wider text-[#E7C768]">
              {f.label}
            </h3>
          </header>
          {renderFieldPreview(f, values[f.key] ?? "")}
        </section>
      ))}
    </div>
  );
};

export default VacancyEditor;