import React, { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { dbClient, getAuthHeaders } from "@/lib/dbClient";
import { ConfirmBalanceChangeModal } from "@/components/ConfirmBalanceChangeModal";
import { ConfirmLimitChangeModal } from "@/components/ConfirmLimitChangeModal";
import { GLASS_CARD_CLASS, GOLD_BUTTON_CLASS, GOLD_TEXT_CLASS, LIMIT_FIELDS } from "./adminConfig";

export function ClientLimitsEditor({
  row,
  onChanged,
  setToast,
}: {
  row: any;
  onChanged: () => void;
  setToast: (t: any) => void;
}) {
  const [deltas, setDeltas] = useState<Record<string, number>>({});
  const [currentBal, setCurrentBal] = useState<number>(Number(row?.balance || 0));
  const [delta, setDelta] = useState<number>(0);
  const [balanceType, setBalanceType] = useState<string>("admin");
  const [busy, setBusy] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [limitModalOpen, setLimitModalOpen] = useState(false);
  const [limitChanges, setLimitChanges] = useState<
    Array<{
      field: string;
      label: string;
      currentValue: number;
      newValue: number;
    }>
  >([]);

  useEffect(() => {
    setDeltas({});
    const b = Number(row?.balance || 0);
    setCurrentBal(b);
    setDelta(0);
  }, [
    row?.id,
    row?.balance,
    row?.landing_credits,
    row?.interview_setup_credits,
    row?.training_setup_credits,
    row?.interview_credits,
    row?.training_credits,
  ]);

  if (!row) return null;

  const getChangedLimits = () => {
    const changes: Array<{
      field: string;
      label: string;
      currentValue: number;
      newValue: number;
    }> = [];
    for (const f of LIMIT_FIELDS) {
      const cur = Number(row?.[f.key] || 0);
      const d = Number(deltas[f.key] || 0);
      if (d !== 0) {
        const finalVal = Math.max(0, cur + d);
        changes.push({
          field: f.key,
          label: f.label,
          currentValue: cur,
          newValue: finalVal,
        });
      }
    }
    return changes;
  };

  const handleOpenLimitModal = () => {
    const allChanges = getChangedLimits();
    if (allChanges.length === 0) {
      setToast({ kind: "ok", text: "Сначала укажите значения изменений в колонке «Изменение (±)»." });
      return;
    }
    setLimitChanges(allChanges);
    setLimitModalOpen(true);
  };

  const handleConfirmLimitSave = async (comment: string) => {
    if (limitChanges.length === 0) return;
    setBusy(true);
    try {
      const deltasToSend: Record<string, number> = {};
      for (const ch of limitChanges) {
        deltasToSend[ch.field] = ch.newValue - ch.currentValue;
      }

      const { data: resData, error } = await dbClient.rpc("admin_employer_set_limits" as any, {
        _employer: row.id,
        _deltas: deltasToSend,
        _note: comment,
      });

      if (error || resData?.success === false) {
        throw new Error(error?.message || resData?.error || "Ошибка сохранения лимитов");
      }

      setBusy(false);
      setLimitModalOpen(false);
      setDeltas({});
      setToast({
        kind: "ok",
        text: `Успешно сохранено лимитов: ${limitChanges.length}. Транзакции добавлены.`,
      });
      onChanged();
    } catch (err: any) {
      setBusy(false);
      setToast({ kind: "err", text: err.message || "Ошибка сохранения лимитов" });
    }
  };

  const handleConfirmBalanceChange = async (comment: string) => {
    if (!delta) return;
    setBusy(true);
    try {
      const res = await fetch("/api/rpc/admin_wallet_adjust", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          _employer: row.id,
          _delta: delta,
          _note: comment,
          _type: balanceType,
        }),
      });

      const resData = await res.json().catch(() => ({}));
      if (!res.ok || resData.error || resData.success === false) {
        throw new Error(resData?.error || "Ошибка обновления баланса");
      }

      setBusy(false);
      setShowConfirmModal(false);
      setToast({ kind: "ok", text: "Баланс обновлён. Транзакция добавлена в историю." });
      setDelta(0);
      onChanged();
    } catch (err: any) {
      setBusy(false);
      setToast({ kind: "err", text: err.message || "Ошибка обновления баланса" });
    }
  };

  const changedCount = getChangedLimits().length;

  return (
    <div className={`${GLASS_CARD_CLASS} p-4 sm:p-5 space-y-5 text-white`}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="min-w-0">
          <div className={`text-base font-extrabold ${GOLD_TEXT_CLASS}`}>
            Лимиты и баланс клиента
          </div>
          <div className="text-sm text-slate-200 mt-1 break-words">
            Укажите изменения лимитов (±) и сохраните все одновременно
          </div>
        </div>
        <button
          type="button"
          onClick={handleOpenLimitModal}
          disabled={busy}
          className={`w-full sm:w-auto px-5 py-2.5 rounded-xl text-sm disabled:opacity-50 ${GOLD_BUTTON_CLASS}`}
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin inline mr-1.5" /> : null}
          Сохранить лимиты ({changedCount > 0 ? changedCount : LIMIT_FIELDS.length})
        </button>
      </div>

      <div className="space-y-3">
        {LIMIT_FIELDS.map((f) => {
          const curVal = Number(row?.[f.key] || 0);
          const dVal = deltas[f.key];
          const hasDelta = dVal !== undefined && dVal !== 0;
          const finalVal = Math.max(0, curVal + (Number(dVal) || 0));

          return (
            <div
              key={f.key}
              className={`flex flex-col md:flex-row md:items-center justify-between gap-3 bg-transparent border ${
                hasDelta ? "border-[#E7C768]" : "border-white/20"
              } rounded-2xl p-3.5 backdrop-blur-md transition-all`}
            >
              <div className="text-sm font-semibold text-white min-w-0 break-words">
                {f.label}
              </div>

              <div className="grid grid-cols-3 gap-2 sm:gap-3 items-end w-full md:w-auto">
                <div className="flex flex-col items-center min-w-0">
                  <span className="text-sm text-slate-200 mb-1 text-center truncate w-full">В базе</span>
                  <div className="w-full sm:w-24 text-center bg-transparent border border-white/20 rounded-xl px-2 py-2 text-sm font-mono font-bold text-white">
                    {curVal}
                  </div>
                </div>

                <div className="flex flex-col items-center min-w-0">
                  <span className="text-sm text-slate-200 mb-1 text-center truncate w-full">Изм. (±)</span>
                  <input
                    type="number"
                    value={dVal !== undefined && dVal !== 0 ? dVal : ""}
                    placeholder="±0"
                    onChange={(e) => {
                      const val = e.target.value === "" ? 0 : Number(e.target.value);
                      setDeltas((prev) => ({ ...prev, [f.key]: isNaN(val) ? 0 : val }));
                    }}
                    className="w-full sm:w-24 text-center bg-transparent border border-white/30 rounded-xl px-2 py-2 text-sm font-mono font-bold text-[#E7C768] focus:outline-none focus:border-[#E7C768] transition placeholder:text-slate-400"
                  />
                </div>

                <div className="flex flex-col items-center min-w-0">
                  <span className="text-sm text-slate-200 mb-1 text-center truncate w-full">Итог</span>
                  <div
                    className={`w-full sm:w-24 text-center bg-transparent border rounded-xl px-2 py-2 text-sm font-mono font-extrabold ${
                      hasDelta ? "border-[#E7C768] text-[#E7C768]" : "border-white/20 text-white"
                    }`}
                  >
                    {finalVal}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="space-y-4 bg-transparent border border-white/20 rounded-2xl p-4 backdrop-blur-md">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="text-sm text-white">
            Текущий баланс RR:{" "}
            <span className="font-mono font-bold text-[#E7C768] text-base">
              {currentBal.toLocaleString()}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 w-full lg:w-auto items-center">
            <select
              value={balanceType}
              onChange={(e) => setBalanceType(e.target.value)}
              className="w-full bg-transparent border border-white/25 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[#E7C768]"
            >
              <option value="admin" className="bg-[#17344F] text-white">Тип: Админ</option>
              <option value="start" className="bg-[#17344F] text-white">Тип: Старт</option>
              <option value="pay" className="bg-[#17344F] text-white">Тип: Оплаты</option>
              <option value="referral" className="bg-[#17344F] text-white">Тип: Рефералы</option>
              <option value="limits" className="bg-[#17344F] text-white">Тип: Расход лимиты</option>
            </select>

            <input
              type="number"
              value={delta || ""}
              onChange={(e) => setDelta(Number(e.target.value) || 0)}
              placeholder="Изменение ±RR"
              className="w-full bg-transparent border border-white/25 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[#E7C768] placeholder:text-slate-400"
            />

            <button
              type="button"
              disabled={busy || delta === 0}
              onClick={() => setShowConfirmModal(true)}
              className={`w-full px-5 py-2 rounded-xl text-sm disabled:opacity-50 ${GOLD_BUTTON_CLASS}`}
            >
              Применить
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-3 border-t border-white/15">
          <div className="bg-transparent p-3 rounded-xl border border-white/15 text-center">
            <span className="text-slate-200 block text-sm">Старт</span>
            <span className="font-bold text-white text-sm font-mono">{row.balance_start ?? 0}</span>
          </div>
          <div className="bg-transparent p-3 rounded-xl border border-white/15 text-center">
            <span className="text-slate-200 block text-sm">Оплаты</span>
            <span className="font-bold text-[#E7C768] text-sm font-mono">{row.balance_pay ?? 0}</span>
          </div>
          <div className="bg-transparent p-3 rounded-xl border border-white/15 text-center">
            <span className="text-slate-200 block text-sm">Рефералы</span>
            <span className="font-bold text-white text-sm font-mono">{row.balance_referral ?? 0}</span>
          </div>
          <div className="bg-transparent p-3 rounded-xl border border-white/15 text-center">
            <span className="text-slate-200 block text-sm">Админ</span>
            <span className="font-bold text-[#E7C768] text-sm font-mono">{row.balance_admin ?? 0}</span>
          </div>
          <div className="bg-transparent p-3 rounded-xl border border-white/15 text-center col-span-2 sm:col-span-1">
            <span className="text-slate-200 block text-sm">Расход лимиты</span>
            <span className="font-bold text-white text-sm font-mono">{row.balance_limits ?? 0}</span>
          </div>
        </div>
      </div>

      <ConfirmBalanceChangeModal
        open={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        employerName={row.name || row.email || `Клиент #${row.public_id}`}
        employerId={row.id}
        currentBalance={currentBal}
        delta={delta}
        type={balanceType}
        typeLabel={
          balanceType === "start"
            ? "Стартовый бонус"
            : balanceType === "pay"
            ? "Оплата тарифа"
            : balanceType === "referral"
            ? "Реферальное начисление"
            : balanceType === "limits"
            ? "Расход на лимиты"
            : "Административная корректировка"
        }
        onConfirm={handleConfirmBalanceChange}
        busy={busy}
      />

      <ConfirmLimitChangeModal
        open={limitModalOpen}
        onClose={() => setLimitModalOpen(false)}
        employerName={row.name || row.email || `Клиент #${row.public_id}`}
        employerId={row.id}
        changes={limitChanges}
        onConfirm={handleConfirmLimitSave}
        busy={busy}
      />
    </div>
  );
}
