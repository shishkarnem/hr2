import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BookmarkPlus, Check, ChevronDown, Loader2, Settings2, Sparkles, X } from "lucide-react";
import { aiChat } from "@/lib/aiClient";
import {
  applyDecisionMacros,
  DECISION_MACROS,
  DECISION_TYPE_META,
  DecisionMacroContext,
  DecisionTemplate,
  DecisionType,
  DEFAULT_DECISION_TEMPLATES,
} from "@/lib/decisionTemplateMacros";

interface DecisionMessageModalProps {
  decisionType: DecisionType | null;
  candidate: any;
  project: any;
  company: any;
  scores: any;
  candidateId: string;
  templates: DecisionTemplate[];
  selectedTemplateId: string | null;
  macroContext: DecisionMacroContext;
  containerStyle: React.CSSProperties;
  onClose: () => void;
  onSelectTemplateId: (templateId: string | null, decisionType: DecisionType) => void;
  onOpenTemplateManager: (decisionType: DecisionType) => void;
  onQuickSaveTemplate: (payload: {
    decision_type: DecisionType;
    title: string;
    body: string;
  }) => Promise<DecisionTemplate | null>;
  onSubmitDecision: (message: string, templateId: string | null) => Promise<void>;
}

export const DecisionMessageModal: React.FC<DecisionMessageModalProps> = ({
  decisionType,
  candidate,
  project,
  company,
  scores,
  candidateId,
  templates,
  selectedTemplateId,
  macroContext,
  containerStyle,
  onClose,
  onSelectTemplateId,
  onOpenTemplateManager,
  onQuickSaveTemplate,
  onSubmitDecision,
}) => {
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [tone, setTone] = useState<"warm" | "formal" | "friendly" | "short">("warm");
  const [generating, setGenerating] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [quickSaveOpen, setQuickSaveOpen] = useState(false);
  const [quickSaveTitle, setQuickSaveTitle] = useState("");
  const [quickSaving, setQuickSaving] = useState(false);
  const [showMacros, setShowMacros] = useState(false);
  const [appliedNotice, setAppliedNotice] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const initializedForOpenRef = useRef<string | null>(null);

  const typeTemplates = useMemo(
    () => (decisionType ? templates.filter((t) => t.decision_type === decisionType) : []),
    [templates, decisionType]
  );

  const currentTemplate = useMemo(() => {
    if (!decisionType) return null;
    if (selectedTemplateId) {
      const found = typeTemplates.find((t) => t.id === selectedTemplateId);
      if (found) return found;
    }
    const def = typeTemplates.find((t) => t.is_default) || typeTemplates[0] || DEFAULT_DECISION_TEMPLATES[decisionType];
    return def;
  }, [decisionType, selectedTemplateId, typeTemplates]);

  useEffect(() => {
    if (!decisionType) {
      initializedForOpenRef.current = null;
      return;
    }
    const openKey = `${candidateId}_${decisionType}`;
    if (initializedForOpenRef.current === openKey) return;
    initializedForOpenRef.current = openKey;

    setErrMsg(null);
    setDropdownOpen(false);
    setQuickSaveOpen(false);
    setQuickSaveTitle("");

    const initialTpl =
      (selectedTemplateId ? typeTemplates.find((t) => t.id === selectedTemplateId) : null) ||
      typeTemplates.find((t) => t.is_default) ||
      typeTemplates[0] ||
      DEFAULT_DECISION_TEMPLATES[decisionType];

    setMessage(applyDecisionMacros(initialTpl.body, macroContext));
  }, [decisionType, candidateId, selectedTemplateId, typeTemplates, macroContext]);

  if (!decisionType || typeof document === "undefined") return null;

  const meta = DECISION_TYPE_META[decisionType];

  const handleChooseTemplate = (tpl: DecisionTemplate) => {
    setMessage(applyDecisionMacros(tpl.body, macroContext));
    setDropdownOpen(false);
    const tplIdToRemember = tpl.is_starter ? null : tpl.id;
    onSelectTemplateId(tplIdToRemember, decisionType);
  };

  const handleGenerateAi = async () => {
    setGenerating(true);
    setErrMsg(null);
    try {
      const toneRu = {
        warm: "тёплый",
        formal: "официальный",
        friendly: "дружелюбный",
        short: "краткий",
      }[tone];
      const candName = candidate?.full_name || candidate?.resume_name || "кандидат";
      const role = project?.role_name || "вакансия";
      const companyName = company?.name || project?.company_name || "";
      const scoreLine = scores?.overall_score
        ? `Средний балл интервью: ${Math.round(Number(scores.overall_score))}/100.`
        : "";
      const goal =
        decisionType === "invited"
          ? "Пригласи кандидата на работу. Сообщи, что решение положительное, поздравь и предложи связаться для обсуждения оформления."
          : decisionType === "review"
          ? "Сообщи кандидату, что его кандидатура взята на дополнительное рассмотрение руководством. Поблагодари за терпение."
          : "Вежливо откажи кандидату. Поблагодари за интерес и потраченное время. Не указывай жестких причин.";

      const prompt = `Составь короткое сообщение (3–5 предложений) кандидату в ${toneRu} тоне. Без капслока.
Компания: ${companyName}. Вакансия: ${role}. Имя кандидата: ${candName}. ${scoreLine}
Контакты ответственного: ${macroContext.employer_contacts}.
${goal}
Напиши только текст сообщения без пояснений и без мета-текста.`;

      const reply = await aiChat({
        kind: "employer",
        messages: [{ role: "user", content: prompt }],
        candidate_id: candidateId || undefined,
        project_id: project?.id || undefined,
      });
      if (reply) setMessage(reply.trim());
    } catch (e: any) {
      setErrMsg(e?.message || "Не удалось сгенерировать текст");
    } finally {
      setGenerating(false);
    }
  };

  const handleInsertMacroAtCursor = (tag: string) => {
    const filledVal = applyDecisionMacros(tag, macroContext);
    const el = textareaRef.current;
    if (!el) {
      setMessage((prev) => (prev ? `${prev} ${filledVal}` : filledVal));
      return;
    }
    const start = el.selectionStart ?? message.length;
    const end = el.selectionEnd ?? message.length;
    const next = message.slice(0, start) + filledVal + message.slice(end);
    setMessage(next);
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(start + filledVal.length, start + filledVal.length);
    }, 0);
  };

  const handleQuickSave = async () => {
    if (!quickSaveTitle.trim() || !message.trim()) return;
    setQuickSaving(true);
    setErrMsg(null);
    try {
      const saved = await onQuickSaveTemplate({
        decision_type: decisionType,
        title: quickSaveTitle.trim(),
        body: message.trim(),
      });
      if (saved) {
        onSelectTemplateId(saved.id, decisionType);
        setQuickSaveOpen(false);
        setQuickSaveTitle("");
        setAppliedNotice(`Шаблон «${saved.title}» сохранён и выбран.`);
        setTimeout(() => setAppliedNotice(null), 3500);
      }
    } catch (e: any) {
      setErrMsg(e?.message || "Не удалось сохранить шаблон");
    } finally {
      setQuickSaving(false);
    }
  };

  const handleSubmit = async () => {
    setSaving(true);
    setErrMsg(null);
    try {
      const effectiveTplId = currentTemplate && !currentTemplate.is_starter ? currentTemplate.id : null;
      await onSubmitDecision(message.trim(), effectiveTplId);
    } catch (e: any) {
      setErrMsg(e?.message || "Не удалось сохранить решение");
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[100000] bg-transparent flex items-center justify-center p-3 sm:p-6"
      onClick={() => !saving && onClose()}
    >
      <div
        className="relative rounded-3xl shadow-2xl p-5 sm:p-7 w-full max-w-xl max-h-[92vh] overflow-y-auto text-white space-y-4 bg-transparent backdrop-blur-3xl border border-white/25"
        style={containerStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-white/15 pb-3">
          <h4 className="text-[18px] font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">
            {meta.modalTitle}
          </h4>
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="text-white/75 hover:text-white p-1.5 rounded-xl border border-white/15 hover:border-[#d4af37] cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-[14px] text-white/85">
          Кандидат получит уведомление с этим решением и текстом сообщения в личном кабинете.
        </p>

        {/* Template selector dropdown + template settings button */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-[14px] font-semibold text-[#E7C768]">Шаблон сообщения</span>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => setQuickSaveOpen((v) => !v)}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl border border-white/20 hover:border-[#d4af37] text-[14px] text-white/90 hover:text-[#fceabb] cursor-pointer transition"
              >
                <BookmarkPlus className="w-4 h-4 text-[#d4af37]" />
                <span>Сохранить как шаблон</span>
              </button>
              <button
                type="button"
                onClick={() => onOpenTemplateManager(decisionType)}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl border border-[#d4af37]/60 hover:border-[#d4af37] text-[14px] text-[#fceabb] cursor-pointer transition"
              >
                <Settings2 className="w-4 h-4 text-[#d4af37]" />
                <span>Настроить шаблоны</span>
              </button>
            </div>
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => setDropdownOpen((v) => !v)}
              className="w-full flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl border border-white/25 hover:border-[#d4af37] bg-transparent backdrop-blur-md text-left text-[14px] text-white cursor-pointer transition"
            >
              <span className="truncate">
                {currentTemplate ? currentTemplate.title : "Выберите шаблон сообщения"}
              </span>
              <ChevronDown className={`w-4 h-4 text-[#d4af37] shrink-0 transition-transform ${dropdownOpen ? "rotate-180" : ""}`} />
            </button>

            {dropdownOpen && (
              <div
                className="mt-1.5 rounded-2xl border border-[#d4af37]/40 bg-transparent backdrop-blur-3xl p-1.5 space-y-1 shadow-2xl max-h-56 overflow-y-auto"
                style={containerStyle}
              >
                {typeTemplates.map((tpl) => {
                  const isSel = currentTemplate?.id === tpl.id;
                  return (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() => handleChooseTemplate(tpl)}
                      className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-left text-[14px] transition cursor-pointer ${
                        isSel
                          ? "border border-[#d4af37] text-[#fceabb] bg-transparent"
                          : "border border-transparent text-white/85 hover:text-white hover:border-white/20"
                      }`}
                    >
                      <span className="truncate">{tpl.title}</span>
                      {isSel && <Check className="w-4 h-4 text-[#d4af37] shrink-0" />}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => handleChooseTemplate(DEFAULT_DECISION_TEMPLATES[decisionType])}
                  className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-left text-[14px] transition cursor-pointer ${
                    currentTemplate?.id === DEFAULT_DECISION_TEMPLATES[decisionType].id
                      ? "border border-[#d4af37] text-[#fceabb] bg-transparent"
                      : "border border-transparent text-white/75 hover:text-white hover:border-white/20"
                  }`}
                >
                  <span className="truncate">{DEFAULT_DECISION_TEMPLATES[decisionType].title}</span>
                  {currentTemplate?.id === DEFAULT_DECISION_TEMPLATES[decisionType].id && (
                    <Check className="w-4 h-4 text-[#d4af37] shrink-0" />
                  )}
                </button>
              </div>
            )}
          </div>

          {quickSaveOpen && (
            <div className="p-3 rounded-2xl border border-[#d4af37]/50 bg-transparent backdrop-blur-xl space-y-2.5">
              <div className="text-[14px] font-semibold text-[#fceabb]">
                Сохранить текущий текст как новый шаблон
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={quickSaveTitle}
                  onChange={(e) => setQuickSaveTitle(e.target.value)}
                  placeholder="Название нового шаблона"
                  className="flex-1 px-3 py-2 rounded-xl border border-white/20 bg-transparent text-[14px] text-white placeholder:text-white/45 focus:outline-none focus:border-[#d4af37]"
                />
                <button
                  type="button"
                  disabled={quickSaving || !quickSaveTitle.trim()}
                  onClick={handleQuickSave}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#E7C768] to-[#D99E41] text-[#17344F] text-[14px] font-bold disabled:opacity-50 cursor-pointer"
                >
                  {quickSaving ? "Сохранение..." : "Сохранить"}
                </button>
              </div>
            </div>
          )}

          {appliedNotice && (
            <div className="p-2.5 rounded-xl border border-[#d4af37]/50 text-[#fceabb] text-[14px] flex items-center gap-2">
              <Check className="w-4 h-4 text-[#d4af37] shrink-0" />
              <span>{appliedNotice}</span>
            </div>
          )}
        </div>

        {/* AI Tone generator */}
        <div className="space-y-2">
          <div className="text-[14px] text-white/75">Тон сообщения</div>
          <div className="flex flex-wrap gap-2 items-center">
            {(
              [
                { k: "warm", label: "Тёплый" },
                { k: "formal", label: "Официальный" },
                { k: "friendly", label: "Дружелюбный" },
                { k: "short", label: "Краткий" },
              ] as const
            ).map((t) => (
              <button
                type="button"
                key={t.k}
                onClick={() => setTone(t.k)}
                className={`px-3 py-1.5 rounded-xl text-[14px] font-semibold border transition-all cursor-pointer ${
                  tone === t.k
                    ? "border-[#E7C768] text-[#fceabb] bg-transparent shadow-[0_0_12px_rgba(231,199,104,0.2)]"
                    : "border-white/20 text-white/80 hover:border-white/40 bg-transparent"
                }`}
              >
                {t.label}
              </button>
            ))}
            <button
              type="button"
              disabled={generating}
              onClick={handleGenerateAi}
              className="sm:ml-auto px-3.5 py-1.5 rounded-xl text-[14px] font-bold bg-gradient-to-r from-[#E7C768] to-[#D99E41] text-[#17344F] inline-flex items-center gap-1.5 disabled:opacity-50 shadow cursor-pointer"
            >
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              Сгенерировать ИИ
            </button>
          </div>
        </div>

        {/* Message textarea + inline data insertion */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[14px] text-white/80">Текст сообщения</span>
            <button
              type="button"
              onClick={() => setShowMacros((v) => !v)}
              className="text-[14px] text-[#E7C768] hover:underline cursor-pointer"
            >
              {showMacros ? "Скрыть данные для вставки" : "Вставить данные кандидата / контакты"}
            </button>
          </div>

          {showMacros && (
            <div className="flex flex-wrap gap-1.5 p-2.5 rounded-xl border border-white/15 bg-transparent backdrop-blur-md">
              {DECISION_MACROS.map((m) => (
                <button
                  key={m.tag}
                  type="button"
                  onClick={() => handleInsertMacroAtCursor(m.tag)}
                  className="px-2.5 py-1 rounded-lg border border-white/20 hover:border-[#d4af37] text-[14px] text-white/90 hover:text-[#fceabb] cursor-pointer"
                >
                  + {m.label}
                </button>
              ))}
            </div>
          )}

          <textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Введите сообщение кандидату..."
            rows={6}
            className="w-full bg-transparent border border-white/25 rounded-xl p-3.5 text-[14px] text-white placeholder:text-white/45 focus:outline-none focus:border-[#E7C768] leading-relaxed"
          />
          <div className="text-[14px] text-white/65">
            Сообщение будет отправлено кандидату в личный кабинет и сохранено в истории решений.
          </div>
        </div>

        {errMsg && (
          <div className="text-[14px] text-[#fceabb] border border-[#d4af37]/50 rounded-xl p-3 bg-transparent backdrop-blur-md">
            {errMsg}
          </div>
        )}

        <div className="flex flex-col-reverse sm:flex-row gap-2.5 justify-end pt-2">
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl bg-transparent hover:border-[#d4af37] border border-white/20 text-white text-[14px] font-semibold cursor-pointer"
          >
            Отмена
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={handleSubmit}
            className="px-5 py-2.5 rounded-xl text-[#17344F] font-bold text-[14px] inline-flex items-center justify-center gap-2 bg-gradient-to-r from-[#E7C768] to-[#D99E41] hover:brightness-110 shadow-lg disabled:opacity-50 cursor-pointer"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {meta.submitLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
