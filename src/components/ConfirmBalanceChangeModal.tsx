import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, CheckCircle2, Wallet } from "lucide-react";

interface ConfirmBalanceChangeModalProps {
  open?: boolean;
  onClose: () => void;
  employerName: string;
  employerId: string;
  currentBalance: number;
  delta: number;
  type?: string;
  typeLabel?: string;
  onConfirm: (comment: string, type?: any) => Promise<void> | void;
  busy: boolean;
}

export function ConfirmBalanceChangeModal({
  open = true,
  onClose,
  employerName,
  employerId,
  currentBalance,
  delta,
  type,
  typeLabel,
  onConfirm,
  busy,
}: ConfirmBalanceChangeModalProps) {
  const [comment, setComment] = useState("Корректировка администратором");

  useEffect(() => {
    if (open) {
      setComment("Корректировка администратором");
    }
  }, [open]);

  if (!open) return null;

  const newBalance = currentBalance + delta;

  return createPortal(
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-[#0F2438]/75 backdrop-blur-xl animate-fade-in"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg bg-gradient-to-br from-[#17344F] via-[#1E4468] to-[#265582] border border-[#E7C768]/45 rounded-3xl p-6 space-y-5 shadow-2xl text-white overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-2">
            <Wallet className="w-5 h-5 text-[#E7C768]" />
            <h3 className="text-lg font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">
              Подтверждение операции с балансом
            </h3>
          </div>
          <button
            onClick={onClose}
            disabled={busy}
            className="text-white hover:text-[#E7C768] transition p-1 rounded-lg hover:bg-white/10 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Client & Operation Info */}
        <div className="space-y-4">
          <div className="text-sm text-white">
            Клиент: <span className="font-bold text-[#E7C768]">{employerName || employerId}</span>
          </div>

          <div
            className="bg-transparent border border-white/20 rounded-2xl p-4 space-y-3"
            style={{ backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" }}
          >
            {(typeLabel || type) && (
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-300">Тип баланса:</span>
                <span className="font-bold text-white">{typeLabel || type}</span>
              </div>
            )}
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-300">Текущий общий баланс:</span>
              <span className="font-bold text-white font-mono">{currentBalance.toLocaleString()} RR</span>
            </div>
            <div className="flex justify-between items-center text-sm border-t border-white/10 pt-2">
              <span className="text-slate-300">Сумма операции:</span>
              <span className="font-extrabold text-sm text-[#E7C768] font-mono">
                {delta > 0 ? `+${delta.toLocaleString()}` : delta.toLocaleString()} RR
              </span>
            </div>
            <div className="flex justify-between items-center text-sm border-t border-white/10 pt-2">
              <span className="font-bold text-white">Итоговый баланс:</span>
              <span className="font-extrabold text-base bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent font-mono">
                {newBalance.toLocaleString()} RR
              </span>
            </div>
          </div>

          {/* Comment Input */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-white">
              Комментарий к операции (сохраняется в историю транзакций)
            </label>
            <textarea
              rows={3}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Укажите причину начисления или списания..."
              className="w-full bg-transparent text-white border border-white/20 rounded-xl p-3.5 text-sm focus:outline-none focus:border-[#E7C768] transition placeholder:text-slate-400"
              style={{ backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)" }}
            />
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-3 border-t border-white/15 pt-4">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="px-5 py-2.5 rounded-xl border border-white/20 text-white font-medium text-sm hover:bg-white/10 transition cursor-pointer"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={() => onConfirm(comment, type)}
            disabled={busy}
            className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-[#FFE580] via-[#E7C768] to-[#C8A038] hover:brightness-110 active:scale-[0.99] text-[#17344F] font-bold text-sm transition shadow-lg cursor-pointer disabled:opacity-50 inline-flex items-center gap-2"
          >
            <CheckCircle2 className="w-4 h-4" />
            {busy ? "Сохранение..." : "Подтвердить операцию"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
