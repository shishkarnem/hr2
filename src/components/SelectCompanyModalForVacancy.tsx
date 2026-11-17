/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Building2, Plus, X, Check, Sparkles, ArrowRight } from "lucide-react";

interface CompanyItem {
  id: string;
  public_id?: string;
  publicId?: string;
  slug?: string;
  name: string;
  industry?: string;
  description_text?: string;
  about_text?: string;
  description?: string;
  logo_url?: string;
  logoUrl?: string;
  mission_text?: string;
  team_text?: string;
  payouts_text?: string;
  schedule_text?: string;
  system_text?: string;
  stats?: any;
  status?: string;
  deleted_at?: string;
}

interface Props {
  isOpen: boolean;
  companies: CompanyItem[];
  onClose: () => void;
  onSelectCompany: (company: CompanyItem) => void;
  onCreateCompany: () => void;
}

export const SelectCompanyModalForVacancy: React.FC<Props> = ({
  isOpen,
  companies,
  onClose,
  onSelectCompany,
  onCreateCompany,
}) => {
  const activeCompanies = (companies || []).filter(
    (c) => !c.deleted_at && c.status !== "deleted" && (c.name || "").trim().length > 0
  );

  const [selectedId, setSelectedId] = useState<string>(
    activeCompanies.length > 0 ? activeCompanies[0].id : ""
  );

  // Sync selected ID when active companies change
  React.useEffect(() => {
    if (activeCompanies.length > 0 && (!selectedId || !activeCompanies.some((c) => c.id === selectedId))) {
      setSelectedId(activeCompanies[0].id);
    }
  }, [activeCompanies, selectedId]);

  if (!isOpen) return null;

  const handleConfirm = () => {
    const chosen = activeCompanies.find((c) => c.id === selectedId) || activeCompanies[0];
    if (chosen) {
      onSelectCompany(chosen);
    }
  };

  return (
    <AnimatePresence>
      <div
        id="select-company-modal-overlay"
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-transparent"
        onClick={onClose}
      >
        <motion.div
          id="select-company-modal-container"
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ duration: 0.2 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-xl rounded-3xl border border-white/20 bg-transparent backdrop-blur-2xl shadow-2xl p-6 md:p-8 space-y-6 text-left"
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-[#E7C768]" />
                <h3 className="text-base font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent leading-tight">
                  Выбор компании для вакансии
                </h3>
              </div>
              <p className="text-sm text-white/90 leading-relaxed">
                Тексты описания, условия выплат, график, логотип и ценности будут автоматически перенесены в черновик новой вакансии.
              </p>
            </div>
            <button
              id="select-company-modal-close-btn"
              type="button"
              onClick={onClose}
              className="p-2 rounded-2xl border border-white/20 text-white/80 hover:text-white hover:border-white/40 transition active:scale-95 bg-transparent"
            >
              <X className="w-4 h-4 text-white" />
            </button>
          </div>

          {/* Body */}
          {activeCompanies.length === 0 ? (
            <div className="p-6 rounded-2xl border border-dashed border-white/20 bg-transparent backdrop-blur-sm text-center space-y-4">
              <div className="w-12 h-12 rounded-2xl border border-[#E7C768]/50 flex items-center justify-center mx-auto bg-transparent">
                <Building2 className="w-6 h-6 text-[#E7C768]" />
              </div>
              <div className="space-y-1">
                <h4 className="text-base font-bold text-white">У вас пока нет созданных компаний</h4>
                <p className="text-sm text-white/90 max-w-md mx-auto leading-relaxed">
                  Перед созданием вакансии необходимо добавить хотя бы одну компанию. Все вакансии и ИИ-онбординги привязываются к профилю работодателя.
                </p>
              </div>
              <button
                id="select-company-modal-create-btn"
                type="button"
                onClick={() => {
                  onClose();
                  onCreateCompany();
                }}
                className="cursor-pointer inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl border border-[#E7C768] text-white text-sm font-semibold hover:border-white transition active:scale-95 shadow-lg bg-transparent"
              >
                <Plus className="w-4 h-4 text-[#E7C768]" />
                <span>Создать компанию</span>
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="max-h-72 overflow-y-auto space-y-2.5 pr-1 scrollbar-thin">
                {activeCompanies.map((comp) => {
                  const isSelected = comp.id === selectedId;
                  const logo = comp.logo_url || comp.logoUrl;
                  const publicId = comp.public_id || comp.publicId;

                  return (
                    <div
                      key={comp.id}
                      id={`select-company-item-${comp.id}`}
                      onClick={() => setSelectedId(comp.id)}
                      className={`cursor-pointer p-4 rounded-2xl border transition backdrop-blur-sm flex items-center justify-between gap-3 ${
                        isSelected
                          ? "border-[#E7C768] bg-transparent shadow-md"
                          : "border-white/20 hover:border-white/40 bg-transparent"
                      }`}
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        {logo ? (
                          <img
                            src={logo}
                            alt={comp.name}
                            className="w-11 h-11 rounded-xl object-contain border border-white/20 shrink-0"
                          />
                        ) : (
                          <div className="w-11 h-11 rounded-xl border border-white/20 flex items-center justify-center shrink-0 text-sm font-bold text-white bg-transparent">
                            {comp.name.slice(0, 2)}
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-bold text-white truncate">
                              {comp.name}
                            </span>
                            {publicId && (
                              <span className="text-sm text-white/90 font-mono border border-white/20 px-2 py-0.5 rounded-lg bg-transparent">
                                ID: {publicId}
                              </span>
                            )}
                            {comp.slug && (
                              <span className="text-sm text-[#E7C768] font-mono border border-[#E7C768]/30 px-2 py-0.5 rounded-lg bg-transparent">
                                /{comp.slug}
                              </span>
                            )}
                          </div>
                          {comp.industry && (
                            <p className="text-sm text-white/80 truncate mt-1">
                              {comp.industry}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="shrink-0">
                        {isSelected ? (
                          <div className="w-6 h-6 rounded-full border border-[#E7C768] flex items-center justify-center text-[#E7C768]">
                            <Check className="w-3.5 h-3.5" />
                          </div>
                        ) : (
                          <div className="w-6 h-6 rounded-full border border-white/20" />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col-reverse sm:flex-row items-center justify-end gap-3 pt-2 border-t border-white/10">
                <button
                  id="select-company-modal-cancel-btn"
                  type="button"
                  onClick={onClose}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-2xl border border-white/20 text-white hover:border-white/40 text-sm font-medium transition active:scale-95 bg-transparent"
                >
                  Отмена
                </button>
                <button
                  id="select-company-modal-continue-btn"
                  type="button"
                  disabled={!selectedId}
                  onClick={handleConfirm}
                  className="w-full sm:w-auto cursor-pointer inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-2xl border border-[#E7C768] text-white text-sm font-semibold hover:border-white transition active:scale-95 shadow-lg bg-transparent disabled:opacity-50"
                >
                  <span>Создать вакансию</span>
                  <ArrowRight className="w-4 h-4 text-[#E7C768]" />
                </button>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default SelectCompanyModalForVacancy;
