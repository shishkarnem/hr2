import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, CheckCircle2, Sliders } from "lucide-react";

export interface LimitChangeItem {
  field: string;
  label: string;
  currentValue: number;
  newValue: number;
}

interface ConfirmLimitChangeModalProps {
  open?: boolean;
  onClose: () => void;
  employerName: string;
  employerId: string;
  changes?: LimitChangeItem[];
  limitKey?: string;
  limitLabel?: string;
  currentValue?: number;
  newValue?: number;
  onConfirm: (comment: string, type?: any) => Promise<void> | void;
  busy: boolean;
}

export function ConfirmLimitChangeModal({
  open = true,
  onClose,
  employerName,
  employerId,
  changes,
  limitKey,
  limitLabel,
  currentValue,
  newValue,
  onConfirm,
  busy,
}: ConfirmLimitChangeModalProps) {
  const [comment, setComment] = useState("Корректировка администратором");

  const effectiveChanges: LimitChangeItem[] = React.useMemo(() => {
    if (changes && changes.length > 0) return changes;
    if (limitKey && limitLabel !== undefined && currentValue !== undefined && newValue !== undefined) {
      return [{
        field: limitKey,
        label: limitLabel,
        currentValue,
        newValue,
      }];
    }
    return [];
  }, [changes, limitKey, limitLabel, currentValue, newValue]);

  useEffect(() => {
    if (open) {
      setComment("Корректировка администратором");
    }
  }, [open]);

  if (!open || effectiveChanges.length === 0) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-transparent animate-fade-in"
      style={{ backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)" }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-xl bg-transparent border border-white/20 rounded-3xl p-6 space-y-5 shadow-2xl text-white overflow-hidden"
        style={{ backdropFilter: "blur(40px)", WebkitBackdropFilter: "blur(40px)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-2">
            <Sliders className="w-5 h-5 text-[#E7C768]" />
            <h3 className="text-lg font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">
              Подтверждение смены лимитов
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

        {/* Client & Limit Info */}
        <div className="space-y-4">
          <div className="text-sm text-white">
            Клиент: <span className="font-bold text-[#E7C768]">{employerName || employerId}</span>
          </div>

          {/* List of all changed limits */}
          <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
            {effectiveChanges.map((ch) => {
              const delta = ch.newValue - ch.currentValue;
              return (
                <div
                  key={ch.field}
                  className="bg-transparent border border-white/20 rounded-2xl p-3.5 flex items-center justify-between gap-3"
                  style={{ backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" }}
                >
                  <div className="min-w-0">
                    <span className="text-sm font-semibold text-white block truncate">{ch.label}</span>
                    <span className="text-sm text-slate-300">
                      Текущий: <strong className="text-white">{ch.currentValue}</strong>
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-right shrink-0">
                    <span className="text-sm font-bold text-[#E7C768]">
                      {delta > 0 ? `+${delta}` : delta === 0 ? "0" : delta}
                    </span>
                    <span className="text-base font-extrabold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">
                      → {ch.newValue}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Comment Input */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-white">
              Комментарий к изменению (сохраняется в историю транзакций)
            </label>
            <textarea
              rows={3}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Укажите причину изменения лимитов..."
              className="w-full bg-transparent text-white border border-white/20 rounded-xl p-3.5 text-sm focus:outline-none focus:border-[#E7C768] transition placeholder:text-slate-400"
              style={{ backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)" }}
            />
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-3 border-t border-white/10 pt-4">
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
            onClick={() => onConfirm(comment)}
            disabled={busy}
            className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-[#FFE580] via-[#E7C768] to-[#C8A038] hover:brightness-110 active:scale-[0.99] text-[#17344F] font-bold text-sm transition shadow-lg cursor-pointer disabled:opacity-50 inline-flex items-center gap-2"
          >
            <CheckCircle2 className="w-4 h-4" />
            {busy ? "Сохранение..." : `Подтвердить изменение (${effectiveChanges.length})`}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
