import React, { useState } from "react";
import { Archive, ArrowRight, ShieldCheck, AlertCircle, Loader2 } from "lucide-react";
import type { JobProject } from "@/types";

interface ArchiveVacancyModalProps {
  isOpen: boolean;
  vacancy: JobProject | any | null;
  allVacancies: JobProject[];
  onClose: () => void;
  onSuccess: (archivedId: string, transferredToId?: string) => void;
  addAuditEvent?: (type: any, title: string, message: string) => void;
}

export default function ArchiveVacancyModal({
  isOpen,
  vacancy,
  allVacancies,
  onClose,
  onSuccess,
  addAuditEvent,
}: ArchiveVacancyModalProps) {
  const [targetVacancyId, setTargetVacancyId] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen || !vacancy) return null;

  const roleName = vacancy.roleName || vacancy.role_name || "Вакансия";
  const interviewLimit = Number(vacancy.interview_limit ?? vacancy.interviewLimit ?? 0);
  const interviewUsed = Number(vacancy.interview_used ?? vacancy.interviewUsed ?? 0);
  const trainingLimit = Number(vacancy.training_limit ?? vacancy.trainingLimit ?? 0);
  const trainingUsed = Number(vacancy.training_used ?? vacancy.trainingUsed ?? 0);

  const availInterviews = Math.max(0, interviewLimit - interviewUsed);
  const availTrainings = Math.max(0, trainingLimit - trainingUsed);
  const hasLimitsToTransfer = availInterviews > 0 || availTrainings > 0;

  // Active vacancies available to receive transferred limits
  const candidateTargets = allVacancies.filter(
    (v: any) => v.id !== vacancy.id && (v.status === "active" || !v.status)
  );

  const handleConfirmArchive = async () => {
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      // 1. If a target vacancy is selected and there are available limits, transfer them
      if (targetVacancyId && hasLimitsToTransfer) {
        const transferRes = await fetch("/api/projects/transfer-limits", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            source_project_id: vacancy.id,
            target_project_id: targetVacancyId,
            interview_count: availInterviews,
            training_count: availTrainings,
          }),
        });

        if (!transferRes.ok) {
          const errData = await transferRes.json().catch(() => ({}));
          throw new Error(errData.message || errData.error || "Не удалось перенести лимиты на выбранную вакансию");
        }
      }

      // 2. Update vacancy status to 'archived' directly in PostgreSQL BD ProTalk
      const updateRes = await fetch(`/api/projects/${vacancy.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "archived",
          is_published: false,
        }),
      });

      if (!updateRes.ok) {
        const errData = await updateRes.json().catch(() => ({}));
        throw new Error(errData.message || errData.error || "Не удалось переместить вакансию в архив");
      }

      if (addAuditEvent) {
        const transferNote = targetVacancyId
          ? ` Лимиты (${availInterviews} интервью, ${availTrainings} обучений) перенесены.`
          : "";
        addAuditEvent("success", "Вакансия перемещена в архив", `«${roleName}» скрыта из общего доступа.${transferNote}`);
      }

      onSuccess(vacancy.id, targetVacancyId || undefined);
      onClose();
    } catch (err: any) {
      console.error("[ArchiveVacancyModal] Error:", err);
      setErrorMessage(err?.message || "Произошла ошибка при архивации вакансии");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/50 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-xl bg-transparent backdrop-blur-2xl border border-[#E7C768]/40 rounded-3xl p-6 sm:p-8 text-white shadow-2xl space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-transparent border border-[#E7C768]/40 flex items-center justify-center text-[#E7C768] shrink-0">
              <Archive className="w-6 h-6 text-[#E7C768]" />
            </div>
            <div>
              <h3 className="text-lg font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">
                Архивация вакансии
              </h3>
              <p className="text-sm text-slate-300 font-medium">
                {roleName}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="w-8 h-8 rounded-full border border-white/20 bg-transparent text-slate-300 hover:text-white hover:border-[#E7C768] flex items-center justify-center transition cursor-pointer text-sm"
          >
            ✕
          </button>
        </div>

        {/* Informational Notice */}
        <div className="bg-transparent border border-white/15 rounded-2xl p-4 text-sm text-slate-200 space-y-2">
          <p>
            Вакансия будет скрыта из каталога вакансий и перестанет отображаться на публичных лендингах компании.
          </p>
          <div className="flex items-center gap-2 text-[#E7C768] text-sm pt-1">
            <ShieldCheck className="w-4 h-4 text-[#E7C768] shrink-0" />
            <span>Все данные кандидатов, переписка, отклики и CRM-воронка сохраняются. Вакансию можно восстановить в любой момент.</span>
          </div>
        </div>

        {/* Limit Allocation Section */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="font-bold text-slate-200">Неиспользованные лимиты вакансии:</span>
            <div className="flex items-center gap-3 font-mono">
              <span className="border border-white/20 px-2.5 py-1 rounded-xl text-white text-sm">
                Интервью: <b className="text-[#E7C768]">{availInterviews} шт.</b>
              </span>
              <span className="border border-white/20 px-2.5 py-1 rounded-xl text-white text-sm">
                Обучения: <b className="text-[#E7C768]">{availTrainings} шт.</b>
              </span>
            </div>
          </div>

          {hasLimitsToTransfer ? (
            <div className="space-y-2 pt-1">
              <label className="block text-sm text-slate-300 font-medium">
                Перенести остаток лимитов на другую вакансию:
              </label>
              <select
                value={targetVacancyId}
                onChange={(e) => setTargetVacancyId(e.target.value)}
                disabled={isSubmitting}
                className="w-full bg-transparent backdrop-blur-md border border-white/20 focus:border-[#E7C768] rounded-2xl p-3 text-sm text-white focus:outline-none transition cursor-pointer"
              >
                <option value="" className="bg-slate-900 text-white">— Не переносить лимиты (оставить за вакансией) —</option>
                {candidateTargets.map((t: any) => (
                  <option key={t.id} value={t.id} className="bg-slate-900 text-white">
                    {t.roleName || t.role_name || "Вакансия"} ({t.companyName || t.company_name || "Компания"})
                  </option>
                ))}
              </select>
              {targetVacancyId && (
                <p className="text-sm text-[#E7C768] flex items-center gap-1.5 pt-1">
                  <ArrowRight className="w-4 h-4 shrink-0" />
                  <span>
                    Все неиспользованные лимиты ({availInterviews} интервью, {availTrainings} обучений) будут автоматически зачислены на выбранную вакансию.
                  </span>
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-slate-300">
              По этой вакансии нет неизрасходованных лимитов для переноса.
            </p>
          )}
        </div>

        {errorMessage && (
          <div className="bg-transparent border border-white/30 rounded-2xl p-3 text-sm text-slate-200 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-[#E7C768] shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-col-reverse sm:flex-row items-center justify-end gap-3 pt-4 border-t border-white/10">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="w-full sm:w-auto px-5 py-2.5 rounded-2xl border border-white/20 hover:border-white/40 bg-transparent text-slate-200 font-bold text-sm transition cursor-pointer"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={handleConfirmArchive}
            disabled={isSubmitting}
            className="w-full sm:w-auto px-6 py-2.5 rounded-2xl bg-gradient-to-r from-[#FFE580] via-[#E7C768] to-[#C8A038] text-[#17344F] font-bold text-sm shadow-lg hover:brightness-110 active:scale-95 transition cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-[#17344F]" />
                <span>Архивация...</span>
              </>
            ) : targetVacancyId && hasLimitsToTransfer ? (
              "Архивировать с переносом"
            ) : (
              "Переместить в архив"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
