import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Clock, Settings2, UserCheck, UserX } from "lucide-react";
import { dbClient, getAuthHeaders } from "@/lib/dbClient";
import { resolveActiveEmployerId } from "@/lib/actorSession";
import {
  buildDecisionMacroContext,
  DecisionTemplate,
  DecisionType,
} from "@/lib/decisionTemplateMacros";
import { DecisionMessageModal } from "./DecisionMessageModal";
import { DecisionTemplatesModal } from "./DecisionTemplatesModal";

interface DecisionSectionProps {
  candidateId: string;
  candidate: any;
  scores: any;
  project: any;
  company: any;
  responsibleContacts?: any[];
  containerStyle: React.CSSProperties;
  onDecisionSaved: (freshData: any, decision: DecisionType, message: string) => void;
}

export const DecisionSection: React.FC<DecisionSectionProps> = ({
  candidateId,
  candidate,
  scores,
  project,
  company,
  responsibleContacts,
  containerStyle,
  onDecisionSaved,
}) => {
  const [decisionOpen, setDecisionOpen] = useState<DecisionType | null>(null);
  const [managerOpen, setManagerOpen] = useState(false);
  const [managerInitialType, setManagerInitialType] = useState<DecisionType>("invited");
  const [templates, setTemplates] = useState<DecisionTemplate[]>([]);
  const [lastSelectedByType, setLastSelectedByType] = useState<Record<DecisionType, string | null>>({
    invited: null,
    review: null,
    rejected: null,
  });

  const employerId = useMemo(
    () => resolveActiveEmployerId(project || company || undefined),
    [project, company]
  );

  const macroContext = useMemo(
    () =>
      buildDecisionMacroContext({
        candidate,
        scores,
        project,
        company,
        responsibleContacts,
      }),
    [candidate, scores, project, company, responsibleContacts]
  );

  const fetchTemplates = useCallback(async () => {
    try {
      const qs = employerId ? `?employer_id=${encodeURIComponent(employerId)}` : "";
      const res = await fetch(`/api/crm/decision-templates${qs}`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) return;
      const json = await res.json().catch(() => null);
      if (json?.ok) {
        if (Array.isArray(json.templates)) setTemplates(json.templates);
        if (json.last_selected) {
          setLastSelectedByType({
            invited: json.last_selected.invited || null,
            review: json.last_selected.review || null,
            rejected: json.last_selected.rejected || null,
          });
        }
      }
    } catch {}
  }, [employerId]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const persistSelectedTemplate = async (templateId: string | null, decisionType: DecisionType) => {
    setLastSelectedByType((prev) => ({ ...prev, [decisionType]: templateId }));
    try {
      await fetch("/api/crm/decision-templates/select", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          employer_id: employerId,
          decision_type: decisionType,
          template_id: templateId,
        }),
      });
    } catch {}
  };

  const handleSaveTemplate = async (payload: {
    id?: string;
    decision_type: DecisionType;
    title: string;
    body: string;
    is_default?: boolean;
  }): Promise<DecisionTemplate | null> => {
    const isEdit = Boolean(payload.id);
    const url = isEdit
      ? `/api/crm/decision-templates/${encodeURIComponent(String(payload.id))}`
      : "/api/crm/decision-templates";
    const res = await fetch(url, {
      method: isEdit ? "PUT" : "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({
        ...payload,
        employer_id: employerId,
        select_after_save: true,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.ok || !json?.template) {
      throw new Error(json?.error || "Не удалось сохранить шаблон");
    }
    await fetchTemplates();
    if (!isEdit) {
      setLastSelectedByType((prev) => ({ ...prev, [payload.decision_type]: json.template.id }));
    }
    return json.template;
  };

  const handleDeleteTemplate = async (id: string): Promise<boolean> => {
    const qs = employerId ? `?employer_id=${encodeURIComponent(employerId)}` : "";
    const res = await fetch(`/api/crm/decision-templates/${encodeURIComponent(id)}${qs}`, {
      method: "DELETE",
      headers: getAuthHeaders(),
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok && json?.ok) {
      await fetchTemplates();
      return true;
    }
    return false;
  };

  const handleSubmitDecision = async (message: string, templateId: string | null) => {
    if (!candidateId || !decisionOpen) return;
    const { error } = await (dbClient as any).rpc("candidate_invite_decision", {
      _candidate: candidateId,
      _decision: decisionOpen,
      _message: message || null,
      _template_id: templateId,
      _employer_id: employerId,
    });
    if (error) throw error;
    if (templateId) {
      setLastSelectedByType((prev) => ({ ...prev, [decisionOpen]: templateId }));
    }
    const { data: fresh } = await dbClient.rpc("candidate_full_details" as any, { _candidate: candidateId });
    const savedDecision = decisionOpen;
    setDecisionOpen(null);
    onDecisionSaved(fresh, savedDecision, message);
  };

  return (
    <div className="bg-transparent backdrop-blur-xl border border-[#E7C768]/40 rounded-2xl p-5 space-y-4 shadow-lg">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="text-[14px] font-bold text-[#E7C768] tracking-wide flex items-center gap-2">
          <UserCheck className="w-4 h-4 text-[#E7C768]" /> Решение по кандидату
        </h3>

        <div className="flex items-center gap-2 flex-wrap">
          {candidate?.hire_decision && (
            <div className="flex items-center gap-2 flex-wrap">
              <div
                className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-[14px] font-bold backdrop-blur-md ${
                  candidate.hire_decision === "invited"
                    ? "bg-transparent text-white border border-[#d4af37] shadow-[0_0_12px_rgba(212,175,55,0.25)]"
                    : candidate.hire_decision === "review"
                    ? "bg-transparent text-[#fceabb] border border-[#d4af37]/60 shadow-[0_0_12px_rgba(212,175,55,0.2)]"
                    : "bg-transparent text-white/80 border border-white/30"
                }`}
              >
                {candidate.hire_decision === "invited" ? (
                  <>
                    <UserCheck className="w-4 h-4 text-[#d4af37]" /> Приглашён на работу
                  </>
                ) : candidate.hire_decision === "review" ? (
                  <>
                    <Clock className="w-4 h-4 text-[#d4af37]" /> На рассмотрении
                  </>
                ) : (
                  <>
                    <UserX className="w-4 h-4 text-white/70" /> Отказано
                  </>
                )}
              </div>
              {candidate.hire_decided_at && (
                <div className="text-[14px] text-white/60 font-mono">
                  {new Date(candidate.hire_decided_at).toLocaleString("ru-RU")}
                </div>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              setManagerInitialType("invited");
              setManagerOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-white/20 hover:border-[#d4af37] text-[14px] text-white/85 hover:text-[#fceabb] transition cursor-pointer"
          >
            <Settings2 className="w-4 h-4 text-[#d4af37]" />
            <span>Шаблоны сообщений</span>
          </button>
        </div>
      </div>

      {candidate?.hire_message && (
        <div className="bg-transparent backdrop-blur-md rounded-xl border border-white/15 p-3.5 text-[14px] text-white/95 whitespace-pre-wrap leading-relaxed">
          <div className="text-[14px] font-mono text-white/60 mb-1">Отправленное сообщение кандидату:</div>
          {candidate.hire_message}
        </div>
      )}

      {/* 3 Interactive Decision Buttons */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
        <button
          type="button"
          onClick={() => setDecisionOpen("invited")}
          className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-bold text-[14px] transition-all shadow-md backdrop-blur-md cursor-pointer ${
            candidate?.hire_decision === "invited"
              ? "border border-[#d4af37] bg-transparent text-[#fceabb] shadow-[0_0_15px_rgba(212,175,55,0.3)] ring-1 ring-[#d4af37]"
              : "border border-white/20 hover:border-[#d4af37] bg-transparent text-white hover:text-[#fceabb]"
          }`}
        >
          <UserCheck className="w-4 h-4 text-[#d4af37]" /> Пригласить на работу
        </button>

        <button
          type="button"
          onClick={() => setDecisionOpen("review")}
          className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-bold text-[14px] transition-all shadow-md backdrop-blur-md cursor-pointer ${
            candidate?.hire_decision === "review"
              ? "border border-[#d4af37] bg-transparent text-[#fceabb] shadow-[0_0_15px_rgba(212,175,55,0.3)] ring-1 ring-[#d4af37]"
              : "border border-white/20 hover:border-[#d4af37] bg-transparent text-white hover:text-[#fceabb]"
          }`}
        >
          <Clock className="w-4 h-4 text-[#d4af37]" /> На рассмотрении
        </button>

        <button
          type="button"
          onClick={() => setDecisionOpen("rejected")}
          className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-bold text-[14px] transition-all shadow-md backdrop-blur-md cursor-pointer ${
            candidate?.hire_decision === "rejected"
              ? "border border-white/60 bg-transparent text-white shadow-[0_0_15px_rgba(255,255,255,0.2)] ring-1 ring-white/60"
              : "border border-white/20 hover:border-white/50 bg-transparent text-white hover:text-white/80"
          }`}
        >
          <UserX className="w-4 h-4 text-white/70" /> Отказать
        </button>
      </div>

      <DecisionMessageModal
        decisionType={decisionOpen}
        candidate={candidate}
        project={project}
        company={company}
        scores={scores}
        candidateId={candidateId}
        templates={templates}
        selectedTemplateId={decisionOpen ? lastSelectedByType[decisionOpen] : null}
        macroContext={macroContext}
        containerStyle={containerStyle}
        onClose={() => setDecisionOpen(null)}
        onSelectTemplateId={persistSelectedTemplate}
        onOpenTemplateManager={(dt) => {
          setManagerInitialType(dt);
          setManagerOpen(true);
        }}
        onQuickSaveTemplate={(p) => handleSaveTemplate({ ...p, is_default: false })}
        onSubmitDecision={handleSubmitDecision}
      />

      <DecisionTemplatesModal
        open={managerOpen}
        initialType={managerInitialType}
        templates={templates}
        macroContext={macroContext}
        containerStyle={containerStyle}
        selectedIdByType={lastSelectedByType}
        onClose={() => setManagerOpen(false)}
        onSaveTemplate={handleSaveTemplate}
        onDeleteTemplate={handleDeleteTemplate}
        onSelectForDecision={(tpl) => {
          persistSelectedTemplate(tpl.id, tpl.decision_type);
          setManagerOpen(false);
          setDecisionOpen(tpl.decision_type);
        }}
      />
    </div>
  );
};
