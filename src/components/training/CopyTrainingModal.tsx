import React, { useState } from "react";
import { Copy, AlertCircle, ArrowRight, CheckCircle2 } from "lucide-react";
import type { JobProject } from "@/types";

interface CopyTrainingModalProps {
  isOpen: boolean;
  mode: "from" | "to";
  currentProjectId: string;
  projects: JobProject[];
  onClose: () => void;
  onSuccess: () => void;
  addAuditEvent?: (type: any, title: string, message: string) => void;
}

export default function CopyTrainingModal({
  isOpen,
  mode,
  currentProjectId,
  projects,
  onClose,
  onSuccess,
  addAuditEvent,
}: CopyTrainingModalProps) {
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const currentProject = projects.find((p) => String(p.id) === String(currentProjectId));
  const currentTitle = currentProject?.roleName || (currentProject as any)?.role_name || "Текущая вакансия";

  // Filter out the current vacancy from the options
  const otherProjects = projects.filter((p) => String(p.id) !== String(currentProjectId));

  const isCopyFrom = mode === "from";
  const modalTitle = isCopyFrom
    ? "Копировать обучение из вакансии"
    : "Копировать обучение в другую вакансию";

  const handleConfirm = async () => {
    if (!selectedProjectId) {
      setErrorMessage("Пожалуйста, выберите вакансию из списка");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    const sourceId = isCopyFrom ? selectedProjectId : currentProjectId;
    const targetId = isCopyFrom ? currentProjectId : selectedProjectId;

    try {
      const res = await fetch("/api/projects/copy-training", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_project_id: sourceId,
          target_project_id: targetId,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Не удалось скопировать материалы обучения");
      }

      if (addAuditEvent) {
        const msg = isCopyFrom
          ? `Материалы обучения скопированы из «${data.sourceTitle || "вакансии"}» в «${currentTitle}» (${data.copiedBlocks} блоков, ${data.copiedTests} тестов).`
          : `Материалы обучения «${currentTitle}» скопированы в «${data.targetTitle || "вакансию"}» (${data.copiedBlocks} блоков, ${data.copiedTests} тестов).`;
        addAuditEvent("success", "Обучение скопировано", msg);
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error("[CopyTrainingModal] Error:", err);
      setErrorMessage(err.message || "Ошибка копирования обучения");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-xl bg-[#17344F]/95 backdrop-blur-2xl border border-[#E7C768]/40 rounded-3xl p-6 sm:p-8 text-white shadow-2xl space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-transparent border border-[#E7C768]/40 flex items-center justify-center text-[#E7C768] shrink-0">
              <Copy className="w-6 h-6 text-[#E7C768]" />
            </div>
            <div>
              <h3 className="text-lg font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">
                {modalTitle}
              </h3>
              <p className="text-sm text-slate-300 font-medium">
                {currentTitle}
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

        {/* Description */}
        <p className="text-sm text-slate-200 leading-relaxed">
          {isCopyFrom
            ? `Все учебные материалы (блоки 3 этапов) и тесты аттестации будут скопированы из выбранной вакансии в текущую вакансию «${currentTitle}». Существующие материалы текущей вакансии будут дополнены.`
            : `Все учебные материалы и тесты текущей вакансии «${currentTitle}» будут продублированы в выбранную целевую вакансию.`}
        </p>

        {/* Selection */}
        <div className="space-y-2">
          <label className="block text-sm text-slate-300 font-medium">
            {isCopyFrom ? "Вакансия-источник (откуда копировать):" : "Целевая вакансия (куда копировать):"}
          </label>
          <select
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            disabled={isSubmitting}
            className="w-full bg-[#17344F] border border-white/20 focus:border-[#E7C768] rounded-2xl p-3 text-sm text-white focus:outline-none transition cursor-pointer"
          >
            <option value="">— Выберите вакансию —</option>
            {otherProjects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.roleName || (p as any).role_name || "Вакансия"} ({p.companyName || (p as any).company_name || "Компания"})
              </option>
            ))}
          </select>
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
            onClick={handleConfirm}
            disabled={isSubmitting || !selectedProjectId}
            className="w-full sm:w-auto px-6 py-2.5 rounded-2xl bg-gradient-to-r from-[#FFE580] via-[#E7C768] to-[#C8A038] text-[#17344F] font-bold text-sm shadow-lg hover:brightness-110 active:scale-95 transition cursor-pointer disabled:opacity-50"
          >
            {isSubmitting ? "Копирование…" : "Скопировать обучение"}
          </button>
        </div>
      </div>
    </div>
  );
}
