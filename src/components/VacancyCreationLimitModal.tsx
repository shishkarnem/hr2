/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Briefcase, Coins, Wallet, X, ArrowRight, Check, AlertCircle } from "lucide-react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  landingCredits: number;
  balance: number;
  employerId?: string | number;
  isProcessing?: boolean;
  onConfirmCreate: (paymentMethod: "credit" | "balance") => void;
  onGoToTariffPay: () => void;
}

export const VacancyCreationLimitModal: React.FC<Props> = ({
  isOpen,
  onClose,
  landingCredits,
  balance,
  employerId = "100007",
  isProcessing = false,
  onConfirmCreate,
  onGoToTariffPay,
}) => {
  const hasCredits = landingCredits > 0;
  const hasBalance = balance >= 500;
  const isInsufficient = !hasCredits && !hasBalance;

  const [selectedMethod, setSelectedMethod] = useState<"credit" | "balance">(
    hasCredits ? "credit" : "balance"
  );

  // Sync default selection if credits or balance change
  React.useEffect(() => {
    if (hasCredits) {
      setSelectedMethod("credit");
    } else if (hasBalance) {
      setSelectedMethod("balance");
    }
  }, [hasCredits, hasBalance]);

  if (!isOpen) return null;

  const handleConfirm = () => {
    if (isInsufficient) {
      onGoToTariffPay();
      return;
    }
    onConfirmCreate(selectedMethod);
  };

  return (
    <AnimatePresence>
      <div
        id="vacancy-limit-modal-overlay"
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-transparent"
        onClick={() => !isProcessing && onClose()}
      >
        <motion.div
          id="vacancy-limit-modal-container"
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ duration: 0.2 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-lg rounded-3xl border border-white/20 bg-transparent backdrop-blur-2xl shadow-2xl p-6 md:p-8 space-y-6 text-left"
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Briefcase className="w-5 h-5 text-[#E7C768]" />
                <h3 className="text-base font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent leading-tight">
                  Создание новой вакансии
                </h3>
              </div>
              <p className="text-sm text-white/90 leading-relaxed">
                Проверка доступных лимитов ИИ-вакансий и баланса перед созданием.
              </p>
            </div>
            <button
              id="vacancy-limit-modal-close-btn"
              type="button"
              onClick={onClose}
              disabled={isProcessing}
              className="p-2 rounded-2xl border border-white/20 text-white/80 hover:text-white hover:border-white/40 transition active:scale-95 bg-transparent disabled:opacity-50"
            >
              <X className="w-4 h-4 text-white" />
            </button>
          </div>

          {/* Balance & Limits Info Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-4 rounded-2xl bg-transparent border border-white/20 backdrop-blur-md space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-sm text-white/80">Лимиты вакансий</span>
                <Coins className="w-4 h-4 text-[#E7C768]" />
              </div>
              <div className="text-base font-bold text-white">
                {landingCredits} шт
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-transparent border border-white/20 backdrop-blur-md space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-sm text-white/80">Баланс RR</span>
                <Wallet className="w-4 h-4 text-[#E7C768]" />
              </div>
              <div className="text-base font-bold text-white">
                {balance.toLocaleString("ru-RU")} RR
              </div>
            </div>
          </div>

          {/* Pricing Info */}
          <div className="p-4 rounded-2xl bg-transparent border border-white/15 backdrop-blur-md space-y-1">
            <div className="text-sm font-semibold text-white">
              Стоимость создания вакансии:
            </div>
            <div className="text-sm text-white/90 leading-relaxed">
              1 купленный лимит ИИ-вакансии или 500 RR с баланса.
            </div>
          </div>

          {/* Options / Scenarios */}
          {isInsufficient ? (
            /* Scenario: Insufficient limits and balance */
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-transparent border border-white/20 backdrop-blur-md space-y-2">
                <div className="flex items-center gap-2 text-white">
                  <AlertCircle className="w-5 h-5 text-[#E7C768] shrink-0" />
                  <span className="text-sm font-bold">
                    Недостаточно средств и лимитов
                  </span>
                </div>
                <p className="text-sm text-white/90 leading-relaxed">
                  У вас закончились купленные лимиты ИИ-вакансий (0 шт), а на балансе сейчас {balance.toLocaleString("ru-RU")} RR из требуемых 500 RR (не хватает {(500 - balance).toLocaleString("ru-RU")} RR).
                </p>
                <p className="text-sm text-white/80 leading-relaxed">
                  Пополните баланс RR или приобретите пакет лимитов для продолжения создания вакансий.
                </p>
              </div>

              <div className="flex flex-col-reverse sm:flex-row items-center justify-end gap-3 pt-2 border-t border-white/10">
                <button
                  id="vacancy-limit-cancel-btn"
                  type="button"
                  onClick={onClose}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-2xl border border-white/20 text-white hover:border-white/40 text-sm font-medium transition active:scale-95 bg-transparent"
                >
                  Отмена
                </button>
                <button
                  id="vacancy-limit-topup-btn"
                  type="button"
                  onClick={onGoToTariffPay}
                  className="w-full sm:w-auto cursor-pointer inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-2xl border border-[#E7C768] text-white text-sm font-semibold hover:border-white transition active:scale-95 shadow-lg bg-transparent"
                >
                  <span>Пополнить баланс RR</span>
                  <ArrowRight className="w-4 h-4 text-[#E7C768]" />
                </button>
              </div>
            </div>
          ) : (
            /* Scenario: Has limits or sufficient balance */
            <div className="space-y-4">
              <div className="space-y-2.5">
                <div className="text-sm font-semibold text-white">
                  Выберите способ списания:
                </div>

                {/* Option 1: Use bought limit */}
                <div
                  id="vacancy-payment-method-credit"
                  onClick={() => hasCredits && setSelectedMethod("credit")}
                  className={`p-4 rounded-2xl border transition backdrop-blur-sm flex items-center justify-between gap-3 ${
                    !hasCredits
                      ? "opacity-50 border-white/10 cursor-not-allowed bg-transparent"
                      : selectedMethod === "credit"
                      ? "border-[#E7C768] bg-transparent shadow-md cursor-pointer"
                      : "border-white/20 hover:border-white/40 bg-transparent cursor-pointer"
                  }`}
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-white">
                        Использовать 1 купленный лимит
                      </span>
                      {hasCredits && (
                        <span className="text-sm text-[#E7C768] border border-[#E7C768]/30 px-2 py-0.5 rounded-lg bg-transparent">
                          Доступно: {landingCredits} шт
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-white/80">
                      {hasCredits
                        ? `После создания останется: ${landingCredits - 1} шт`
                        : "Лимиты исчерпаны (0 шт)"}
                    </p>
                  </div>
                  <div className="shrink-0">
                    {selectedMethod === "credit" && hasCredits ? (
                      <div className="w-6 h-6 rounded-full border border-[#E7C768] flex items-center justify-center text-[#E7C768]">
                        <Check className="w-3.5 h-3.5" />
                      </div>
                    ) : (
                      <div className="w-6 h-6 rounded-full border border-white/20" />
                    )}
                  </div>
                </div>

                {/* Option 2: Pay with RR balance */}
                <div
                  id="vacancy-payment-method-balance"
                  onClick={() => hasBalance && setSelectedMethod("balance")}
                  className={`p-4 rounded-2xl border transition backdrop-blur-sm flex items-center justify-between gap-3 ${
                    !hasBalance
                      ? "opacity-50 border-white/10 cursor-not-allowed bg-transparent"
                      : selectedMethod === "balance"
                      ? "border-[#E7C768] bg-transparent shadow-md cursor-pointer"
                      : "border-white/20 hover:border-white/40 bg-transparent cursor-pointer"
                  }`}
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-white">
                        Списать 500 RR с баланса
                      </span>
                      <span className="text-sm text-white/90 border border-white/20 px-2 py-0.5 rounded-lg bg-transparent">
                        Баланс: {balance.toLocaleString("ru-RU")} RR
                      </span>
                    </div>
                    <p className="text-sm text-white/80">
                      {hasBalance
                        ? `После создания останется: ${(balance - 500).toLocaleString("ru-RU")} RR`
                        : `Недостаточно RR (не хватает ${500 - balance} RR)`}
                    </p>
                  </div>
                  <div className="shrink-0">
                    {selectedMethod === "balance" && hasBalance ? (
                      <div className="w-6 h-6 rounded-full border border-[#E7C768] flex items-center justify-center text-[#E7C768]">
                        <Check className="w-3.5 h-3.5" />
                      </div>
                    ) : (
                      <div className="w-6 h-6 rounded-full border border-white/20" />
                    )}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col-reverse sm:flex-row items-center justify-end gap-3 pt-2 border-t border-white/10">
                <button
                  id="vacancy-limit-cancel-btn"
                  type="button"
                  onClick={onClose}
                  disabled={isProcessing}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-2xl border border-white/20 text-white hover:border-white/40 text-sm font-medium transition active:scale-95 bg-transparent disabled:opacity-50"
                >
                  Отмена
                </button>
                <button
                  id="vacancy-limit-confirm-btn"
                  type="button"
                  onClick={handleConfirm}
                  disabled={isProcessing || (selectedMethod === "credit" && !hasCredits) || (selectedMethod === "balance" && !hasBalance)}
                  className="w-full sm:w-auto cursor-pointer inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-2xl border border-[#E7C768] text-white text-sm font-semibold hover:border-white transition active:scale-95 shadow-lg bg-transparent disabled:opacity-50"
                >
                  <span>
                    {isProcessing
                      ? "Создание..."
                      : selectedMethod === "credit"
                      ? "Создать за 1 лимит"
                      : "Создать за 500 RR"}
                  </span>
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

export default VacancyCreationLimitModal;
