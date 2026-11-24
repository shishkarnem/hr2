import React from "react";
import { UserCheck, Users } from "lucide-react";

export interface ResponsiblePreviewPerson {
  id: string;
  public_id?: string;
  name?: string;
  email?: string;
  roleLabel?: string;
}

interface VacancyResponsiblesBadgeProps {
  responsibleIds: string[];
  companyMembers?: ResponsiblePreviewPerson[];
  creatorName?: string;
  creatorId?: string;
  onChangeClick: () => void;
  variant?: "card" | "editor";
}

function normId(v?: string | null): string {
  return String(v || "").trim().replace(/^emp-?/i, "").trim();
}

export const VacancyResponsiblesBadge: React.FC<VacancyResponsiblesBadgeProps> = ({
  responsibleIds,
  companyMembers = [],
  creatorName,
  creatorId,
  onChangeClick,
  variant = "card",
}) => {
  const effectiveIds =
    responsibleIds.length > 0 ? responsibleIds : creatorId ? [String(creatorId)] : [];

  const resolvedLabels = effectiveIds.map((rawId) => {
    const k = normId(rawId);
    const found = companyMembers.find(
      (m) => normId(m.public_id || m.id) === k || normId(m.id) === k
    );
    if (found?.name) {
      return {
        key: rawId,
        name: found.name,
        roleLabel: found.roleLabel,
      };
    }
    if (creatorId && normId(creatorId) === k && creatorName) {
      return {
        key: rawId,
        name: creatorName,
        roleLabel: "Создатель вакансии",
      };
    }
    return {
      key: rawId,
      name: creatorName && effectiveIds.length === 1 ? creatorName : `Сотрудник #${k || rawId}`,
      roleLabel: undefined,
    };
  });

  return (
    <div className="bg-transparent backdrop-blur-xl border border-white/20 rounded-2xl p-3.5 sm:p-4 space-y-2.5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <UserCheck className="w-4 h-4 text-[#E7C768] shrink-0" />
          <span className="text-[14px] font-bold text-white">
            {variant === "editor"
              ? "Ответственные за вакансию (контакты и уведомления):"
              : `Ответственные за вакансию (${resolvedLabels.length || 1}):`}
          </span>
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onChangeClick();
          }}
          className="cursor-pointer px-3.5 py-2 rounded-xl border border-[#E7C768]/50 bg-transparent backdrop-blur-md hover:border-[#FFE580] text-[#F4EE8E] hover:text-white text-[14px] font-bold flex items-center justify-center gap-1.5 transition shrink-0 w-full sm:w-auto"
        >
          <Users className="w-4 h-4 text-[#E7C768]" />
          <span>Сменить ответственного</span>
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {resolvedLabels.length > 0 ? (
          resolvedLabels.map((person) => (
            <div
              key={person.key}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border border-white/20 bg-transparent backdrop-blur-md text-[14px] text-white max-w-full"
            >
              <span className="w-6 h-6 rounded-lg border border-[#E7C768]/50 flex items-center justify-center text-[14px] font-bold text-[#F4EE8E] shrink-0">
                {(person.name || "С").charAt(0)}
              </span>
              <span className="font-semibold truncate">{person.name}</span>
              {person.roleLabel && (
                <span className="text-slate-300 text-[14px] hidden sm:inline">· {person.roleLabel}</span>
              )}
            </div>
          ))
        ) : (
          <span className="text-[14px] text-slate-300">По умолчанию — создатель вакансии</span>
        )}
      </div>
    </div>
  );
};
