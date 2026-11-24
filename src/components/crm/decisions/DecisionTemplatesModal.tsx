import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Copy, Edit3, Eye, Loader2, Plus, Sparkles, Trash2, X } from "lucide-react";
import {
  applyDecisionMacros,
  DECISION_MACROS,
  DECISION_TYPE_META,
  DecisionMacroContext,
  DecisionTemplate,
  DecisionType,
  DEFAULT_DECISION_TEMPLATES,
} from "@/lib/decisionTemplateMacros";

interface DecisionTemplatesModalProps {
  open: boolean;
  initialType: DecisionType;
  templates: DecisionTemplate[];
  macroContext: DecisionMacroContext;
  containerStyle: React.CSSProperties;
  selectedIdByType: Record<DecisionType, string | null>;
  onClose: () => void;
  onSaveTemplate: (payload: {
    id?: string;
    decision_type: DecisionType;
    title: string;
    body: string;
    is_default?: boolean;
  }) => Promise<DecisionTemplate | null>;
  onDeleteTemplate: (id: string) => Promise<boolean>;
  onSelectForDecision: (tpl: DecisionTemplate) => void;
}

export const DecisionTemplatesModal: React.FC<DecisionTemplatesModalProps> = ({
  open,
  initialType,
  templates,
  macroContext,
  containerStyle,
  selectedIdByType,
  onClose,
  onSaveTemplate,
  onDeleteTemplate,
  onSelectForDecision,
}) => {
  const [activeType, setActiveType] = useState<DecisionType>(initialType);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(true);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (open) {
      setActiveType(initialType);
      setFormOpen(false);
      setEditingId(null);
      setConfirmDeleteId(null);
      setErrorMsg(null);
    }
  }, [open, initialType]);

  const typeTemplates = useMemo(
    () => templates.filter((t) => t.decision_type === activeType),
    [templates, activeType]
  );

  const previewText = useMemo(
    () => applyDecisionMacros(body || "", macroContext),
    [body, macroContext]
  );

  if (!open || typeof document === "undefined") return null;

  const startCreate = (prefillFrom?: DecisionTemplate) => {
    setEditingId(null);
    setTitle(prefillFrom ? `${prefillFrom.title} (копия)` : "");
    setBody(prefillFrom ? prefillFrom.body : DEFAULT_DECISION_TEMPLATES[activeType].body);
    setIsDefault(false);
    setErrorMsg(null);
    setFormOpen(true);
  };

  const startEdit = (tpl: DecisionTemplate) => {
    setEditingId(tpl.id);
    setTitle(tpl.title);
    setBody(tpl.body);
    setIsDefault(Boolean(tpl.is_default));
    setErrorMsg(null);
    setFormOpen(true);
  };

  const insertMacro = (tag: string) => {
    const el = textareaRef.current;
    if (!el) {
      setBody((prev) => (prev ? `${prev} ${tag}` : tag));
      return;
    }
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    const next = body.slice(0, start) + tag + body.slice(end);
    setBody(next);
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(start + tag.length, start + tag.length);
    }, 0);
  };

  const handleSaveForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setErrorMsg("Укажите название шаблона.");
      return;
    }
    if (!body.trim()) {
      setErrorMsg("Введите текст шаблона.");
      return;
    }
    setSaving(true);
    setErrorMsg(null);
    try {
      const saved = await onSaveTemplate({
        id: editingId || undefined,
        decision_type: activeType,
        title: title.trim(),
        body: body.trim(),
        is_default: isDefault,
      });
      if (!saved) {
        setErrorMsg("Не удалось сохранить шаблон.");
        return;
      }
      setFormOpen(false);
      setEditingId(null);
    } catch (err: any) {
      setErrorMsg(err?.message || "Ошибка сохранения шаблона");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    setErrorMsg(null);
    try {
      const ok = await onDeleteTemplate(id);
      if (!ok) setErrorMsg("Не удалось удалить шаблон.");
      setConfirmDeleteId(null);
    } finally {
      setDeletingId(null);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[100010] bg-transparent flex items-center justify-center p-3 sm:p-6"
      onClick={onClose}
    >
      <div
        className="relative rounded-3xl shadow-2xl p-5 sm:p-7 w-full max-w-3xl max-h-[92vh] overflow-y-auto text-white space-y-5 bg-transparent backdrop-blur-3xl border border-white/25"
        style={containerStyle}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-white/15 pb-3.5">
          <div className="min-w-0">
            <h3 className="text-[18px] font-bold bg-gradient-to-r from-[#fff3c4] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent break-words">
              Шаблоны решений по кандидатам
            </h3>
            <p className="text-[14px] text-white/75 mt-0.5 break-words">
              Настройте персональные сообщения с автоподстановкой данных кандидата и контактов.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl border border-white/20 bg-transparent text-white/80 hover:text-white hover:border-[#d4af37] transition cursor-pointer shrink-0"
            aria-label="Закрыть"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Decision type selector: vertical stack on mobile, 3-column grid on sm+ (zero horizontal scroll) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {(["invited", "review", "rejected"] as DecisionType[]).map((dt) => {
            const isActive = activeType === dt;
            const count = templates.filter((t) => t.decision_type === dt).length;
            return (
              <button
                key={dt}
                type="button"
                onClick={() => {
                  setActiveType(dt);
                  setFormOpen(false);
                  setEditingId(null);
                  setConfirmDeleteId(null);
                  setErrorMsg(null);
                }}
                className={`px-3.5 py-2.5 rounded-xl border text-[14px] font-bold transition-all text-left sm:text-center cursor-pointer ${
                  isActive
                    ? "border-[#d4af37] text-[#fceabb] bg-transparent shadow-[0_0_15px_rgba(212,175,55,0.25)]"
                    : "border-white/20 text-white/80 hover:border-white/40 hover:text-white bg-transparent"
                }`}
              >
                {DECISION_TYPE_META[dt].title} ({count})
              </button>
            );
          })}
        </div>

        {errorMsg && (
          <div className="p-3 rounded-xl border border-[#d4af37]/60 bg-transparent backdrop-blur-md text-[14px] text-[#fceabb]">
            {errorMsg}
          </div>
        )}

        {formOpen ? (
          <form onSubmit={handleSaveForm} className="space-y-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h4 className="text-[16px] font-bold bg-gradient-to-r from-[#fff3c4] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">
                {editingId ? "Редактирование шаблона" : "Новый шаблон"} · {DECISION_TYPE_META[activeType].shortTitle}
              </h4>
              <button
                type="button"
                onClick={() => {
                  setFormOpen(false);
                  setEditingId(null);
                }}
                className="px-3 py-1.5 rounded-xl border border-white/20 text-[14px] text-white/80 hover:text-white cursor-pointer"
              >
                К списку шаблонов
              </button>
            </div>

            <div className="space-y-1.5">
              <label className="block text-[14px] font-semibold text-white/90">Название шаблона</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Например: Приглашение в отдел продаж + контакты"
                className="w-full px-3.5 py-2.5 rounded-xl border border-white/20 bg-transparent backdrop-blur-md text-[14px] text-white placeholder:text-white/45 focus:outline-none focus:border-[#d4af37]"
              />
            </div>

            {/* Macro insertion chips */}
            <div className="space-y-2">
              <div className="text-[14px] font-semibold text-[#E7C768]">
                Вставить переменную (макрос) в текст:
              </div>
              <div className="flex flex-wrap gap-1.5">
                {DECISION_MACROS.map((m) => (
                  <button
                    key={m.tag}
                    type="button"
                    onClick={() => insertMacro(m.tag)}
                    title={`${m.description} (${m.example})`}
                    className="px-2.5 py-1 rounded-lg border border-white/20 hover:border-[#d4af37] bg-transparent backdrop-blur-md text-[14px] text-white/90 hover:text-[#fceabb] transition cursor-pointer"
                  >
                    + {m.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-[14px] font-semibold text-white/90">Текст сообщения</label>
              <textarea
                ref={textareaRef}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={5}
                placeholder="Напишите текст шаблона. Используйте кнопки выше для вставки имени кандидата, вакансии и контактов."
                className="w-full px-3.5 py-3 rounded-xl border border-white/20 bg-transparent backdrop-blur-md text-[14px] text-white placeholder:text-white/45 focus:outline-none focus:border-[#d4af37] leading-relaxed"
              />
            </div>

            <label className="flex items-center gap-2.5 text-[14px] text-white/90 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isDefault}
                onChange={(e) => setIsDefault(e.target.checked)}
                className="w-4 h-4 accent-[#d4af37]"
              />
              <span>Использовать как шаблон по умолчанию для раздела «{DECISION_TYPE_META[activeType].shortTitle}»</span>
            </label>

            {/* Live Preview */}
            <div className="rounded-2xl border border-white/15 bg-transparent backdrop-blur-md p-3.5 space-y-2">
              <button
                type="button"
                onClick={() => setShowPreview((p) => !p)}
                className="flex items-center gap-2 text-[14px] font-semibold text-[#E7C768] cursor-pointer"
              >
                <Eye className="w-4 h-4" />
                <span>{showPreview ? "Скрыть предпросмотр подстановки" : "Показать предпросмотр подстановки"}</span>
              </button>
              {showPreview && (
                <div className="text-[14px] text-white/90 whitespace-pre-wrap leading-relaxed pt-1 border-t border-white/10">
                  {previewText || "Текст предпросмотра появится после ввода сообщения."}
                </div>
              )}
            </div>

            <div className="flex flex-col-reverse sm:flex-row justify-end gap-2.5 pt-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => {
                  setFormOpen(false);
                  setEditingId(null);
                }}
                className="px-4 py-2.5 rounded-xl border border-white/20 bg-transparent text-[14px] font-semibold text-white hover:border-[#d4af37] cursor-pointer"
              >
                Отмена
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#E7C768] to-[#D99E41] text-[#17344F] text-[14px] font-bold inline-flex items-center justify-center gap-2 hover:brightness-110 disabled:opacity-50 cursor-pointer"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>{editingId ? "Сохранить изменения" : "Создать шаблон"}</span>
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-3.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="text-[14px] text-white/80">
                Доступные шаблоны для «{DECISION_TYPE_META[activeType].title}»
              </div>
              <button
                type="button"
                onClick={() => startCreate()}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-[#E7C768] to-[#D99E41] text-[#17344F] font-bold text-[14px] hover:brightness-110 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Создать новый шаблон</span>
              </button>
            </div>

            {typeTemplates.length === 0 ? (
              <div className="rounded-2xl border border-white/15 bg-transparent backdrop-blur-md p-5 space-y-3 text-center">
                <div className="text-[14px] text-white/85">
                  Собственных шаблонов для этого типа решения пока нет. Сейчас используется стандартный шаблон.
                </div>
                <div className="text-[14px] text-white/70 bg-transparent border border-white/10 rounded-xl p-3 text-left whitespace-pre-wrap">
                  {applyDecisionMacros(DEFAULT_DECISION_TEMPLATES[activeType].body, macroContext)}
                </div>
                <button
                  type="button"
                  onClick={() => startCreate(DEFAULT_DECISION_TEMPLATES[activeType])}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-[#d4af37] text-[#fceabb] text-[14px] font-semibold hover:shadow-[0_0_15px_rgba(212,175,55,0.25)] cursor-pointer"
                >
                  <Sparkles className="w-4 h-4 text-[#d4af37]" />
                  <span>Создать свой шаблон на основе стандартного</span>
                </button>
              </div>
            ) : (
              <div className="space-y-2.5">
                {typeTemplates.map((tpl) => {
                  const isCurrentSelected = selectedIdByType[activeType] === tpl.id;
                  return (
                    <div
                      key={tpl.id}
                      className={`rounded-2xl border bg-transparent backdrop-blur-md p-4 space-y-2.5 transition-all ${
                        isCurrentSelected ? "border-[#d4af37]" : "border-white/15 hover:border-white/35"
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-[15px] font-bold text-white break-words">
                            {tpl.title}
                          </div>
                          <div className="text-[14px] text-white/65">
                            {tpl.is_default ? "По умолчанию" : "Индивидуальный шаблон"}
                            {isCurrentSelected ? " · Выбран последним" : ""}
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => onSelectForDecision(tpl)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#d4af37] text-[#fceabb] text-[14px] font-semibold hover:shadow-[0_0_12px_rgba(212,175,55,0.25)] cursor-pointer"
                          >
                            <Check className="w-4 h-4 text-[#d4af37]" />
                            <span>Подставить</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => startEdit(tpl)}
                            title="Редактировать"
                            className="p-2 rounded-xl border border-white/20 text-white/85 hover:border-[#d4af37] hover:text-white cursor-pointer"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => startCreate(tpl)}
                            title="Дублировать"
                            className="p-2 rounded-xl border border-white/20 text-white/85 hover:border-[#d4af37] hover:text-white cursor-pointer"
                          >
                            <Copy className="w-4 h-4" />
                          </button>
                          {confirmDeleteId === tpl.id ? (
                            <button
                              type="button"
                              disabled={deletingId === tpl.id}
                              onClick={() => handleDelete(tpl.id)}
                              className="px-3 py-1.5 rounded-xl border border-white/50 text-white text-[14px] font-semibold cursor-pointer"
                            >
                              {deletingId === tpl.id ? "Удаление..." : "Удалить?"}
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(tpl.id)}
                              title="Удалить"
                              className="p-2 rounded-xl border border-white/20 text-white/75 hover:border-white/50 hover:text-white cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="text-[14px] text-white/80 whitespace-pre-wrap leading-relaxed border-t border-white/10 pt-2">
                        {tpl.body}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};
