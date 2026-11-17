import React from "react";
import { createPortal } from "react-dom";
import { X, CheckCircle2, SlidersHorizontal, ArrowRight, Loader2 } from "lucide-react";

export interface FieldChangeItem {
  key: string;
  label: string;
  oldValue: any;
  newValue: any;
}

interface ConfirmRecordChangeModalProps {
  open?: boolean;
  onClose: () => void;
  title?: string;
  recordName?: string;
  changes: FieldChangeItem[];
  onConfirm: () => Promise<void> | void;
  busy?: boolean;
}

export function ConfirmRecordChangeModal({
  open = true,
  onClose,
  title = "Подтверждение изменения данных",
  recordName,
  changes,
  onConfirm,
  busy = false,
}: ConfirmRecordChangeModalProps) {
  if (!open || !changes || changes.length === 0) return null;

  const formatVal = (val: any) => {
    if (val === null || val === undefined || val === "") {
      return "—";
    }
    if (typeof val === "boolean") {
      return val ? "Да" : "Нет";
    }
    if (typeof val === "object") {
      return JSON.stringify(val);
    }
    return String(val);
  };

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
          <div className="flex items-center gap-2.5">
            <SlidersHorizontal className="w-5 h-5 text-[#E7C768]" />
            <h3 className="text-lg font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">
              {title}
            </h3>
          </div>
          <button
            onClick={onClose}
            disabled={busy}
            className="text-white hover:text-[#E7C768] transition p-1.5 rounded-xl hover:bg-white/10 cursor-pointer disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="space-y-4 text-sm text-white">
          {recordName && (
            <div className="text-sm">
              Объект: <span className="font-bold text-[#E7C768]">{recordName}</span>
            </div>
          )}

          <p className="text-sm text-slate-300">
            Проверьте список изменяемых полей перед фиксацией в базе данных:
          </p>

          {/* List of changes */}
          <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
            {changes.map((ch) => (
              <div
                key={ch.key}
                className="bg-transparent border border-white/20 rounded-2xl p-3.5 space-y-2"
                style={{ backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" }}
              >
                <div className="font-semibold text-sm text-[#E7C768]">
                  {ch.label}
                </div>
                <div className="grid grid-cols-[1fr,auto,1fr] items-center gap-2 text-sm">
                  <div className="bg-transparent border border-white/10 rounded-xl p-2 min-w-0">
                    <span className="block text-sm text-slate-400 mb-0.5">Было</span>
                    <span className="block font-medium text-white truncate" title={formatVal(ch.oldValue)}>
                      {formatVal(ch.oldValue)}
                    </span>
                  </div>
                  <ArrowRight className="w-4 h-4 text-[#E7C768] shrink-0" />
                  <div className="bg-transparent border border-[#E7C768]/40 rounded-xl p-2 min-w-0">
                    <span className="block text-sm text-slate-400 mb-0.5">Станет</span>
                    <span className="block font-bold text-white truncate" title={formatVal(ch.newValue)}>
                      {formatVal(ch.newValue)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-3 border-t border-white/10 pt-4">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="px-5 py-2.5 rounded-xl border border-white/20 text-white font-medium text-sm hover:bg-white/10 transition cursor-pointer disabled:opacity-50"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-[#FFE580] via-[#E7C768] to-[#C8A038] hover:brightness-110 active:scale-[0.99] text-[#17344F] font-bold text-sm transition shadow-lg cursor-pointer disabled:opacity-50 inline-flex items-center gap-2"
          >
            {busy ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Сохранение в базе...
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                Подтвердить сохранение ({changes.length})
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default ConfirmRecordChangeModal;
