import React, { useEffect, useMemo, useState } from "react";
import { Save, RefreshCw, CheckCircle2, Minus, Plus, Users2, GraduationCap, ShoppingCart, Sparkles } from "lucide-react";
import { dbClient } from "@/lib/dbClient";
import type { JobProject } from "../types";

type Props = {
  projects: JobProject[];
  interviewPool: number;
  trainingPool: number;
  employerBalance?: number;
  employerId?: string;
  onSaved: () => void | Promise<void>;
};

type Row = {
  id: string;
  label: string;
  companyName: string;
  interview: number;
  training: number;
  interviewSaved: number;
  trainingSaved: number;
  interviewUsed: number;
  trainingUsed: number;
  saving: boolean;
  savedFlash: boolean;
  error: string | null;
  // Buy direct state
  showBuyModal?: boolean;
  buyInterviewQty?: number;
  buyTrainingQty?: number;
  buying?: boolean;
};

function buildRows(projects: JobProject[]): Row[] {
  return (projects || []).map((p: any) => ({
    id: p.id,
    label: p.roleName || p.role_name || "(без названия)",
    companyName: p.companyName || p.company_name || "—",
    interview: Math.max(0, Number(p.interviewLimit || p.interview_limit || p.max_interviews || 0) - Number(p.interviewUsed || p.interview_used || 0)),
    training: Math.max(0, Number(p.trainingLimit || p.training_limit || p.max_trainings || 0) - Number(p.trainingUsed || p.training_used || 0)),
    interviewSaved: Math.max(0, Number(p.interviewLimit || p.interview_limit || p.max_interviews || 0) - Number(p.interviewUsed || p.interview_used || 0)),
    trainingSaved: Math.max(0, Number(p.trainingLimit || p.training_limit || p.max_trainings || 0) - Number(p.trainingUsed || p.training_used || 0)),
    interviewUsed: Number(p.interviewUsed || p.interview_used || 0),
    trainingUsed: Number(p.trainingUsed || p.training_used || 0),
    saving: false,
    savedFlash: false,
    error: null,
    showBuyModal: false,
    buyInterviewQty: 10,
    buyTrainingQty: 0,
    buying: false,
  }));
}

export function getPricePerLimitUnit(qty: number): number {
  if (qty >= 200) return 50;
  if (qty >= 50) return 100;
  if (qty >= 10) return 150;
  return 200;
}

export default function VacancyLimitAllocator({
  projects,
  interviewPool,
  trainingPool,
  employerBalance = 0,
  employerId,
  onSaved,
}: Props) {
  const [rows, setRows] = useState<Row[]>(() => buildRows(projects));

  useEffect(() => {
    setRows((prev) => {
      const map = new Map(prev.map((r) => [r.id, r] as const));
      return buildRows(projects).map((r) => {
        const old = map.get(r.id);
        if (!old) return r;
        return {
          ...r,
          interview: old.interview === old.interviewSaved ? r.interview : old.interview,
          training: old.training === old.trainingSaved ? r.training : old.training,
          savedFlash: old.savedFlash,
          error: old.error,
          showBuyModal: old.showBuyModal,
          buyInterviewQty: old.buyInterviewQty ?? 10,
          buyTrainingQty: old.buyTrainingQty ?? 0,
        };
      });
    });
  }, [projects]);

  const { previewInterview, previewTraining } = useMemo(() => {
    let dI = 0,
      dT = 0;
    for (const r of rows) {
      dI += r.interview - r.interviewSaved;
      dT += r.training - r.trainingSaved;
    }
    return {
      previewInterview: Math.max(0, interviewPool - dI),
      previewTraining: Math.max(0, trainingPool - dT),
    };
  }, [rows, interviewPool, trainingPool]);

  const overdrawI = interviewPool - rows.reduce((a, r) => a + (r.interview - r.interviewSaved), 0) < 0;
  const overdrawT = trainingPool - rows.reduce((a, r) => a + (r.training - r.trainingSaved), 0) < 0;

  const setRow = (id: string, patch: Partial<Row>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const clampI = (_r: Row, v: number) => Math.max(0, Math.min(100000, Math.floor(v)));
  const clampT = (_r: Row, v: number) => Math.max(0, Math.min(100000, Math.floor(v)));

  const saveAllocation = async (r: Row) => {
    if (r.interview === r.interviewSaved && r.training === r.trainingSaved) return;
    setRow(r.id, { saving: true, error: null });
    try {
      // 1. Try local API first
      const apiRes = await fetch("/api/projects/reallocate-limits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: r.id,
          new_interview_limit: r.interview + r.interviewUsed,
          new_training_limit: r.training + r.trainingUsed,
          employer_id: employerId,
        }),
      }).catch(() => null);

      if (apiRes && apiRes.ok) {
        setRow(r.id, {
          interviewSaved: r.interview,
          trainingSaved: r.training,
          saving: false,
          savedFlash: true,
        });
        setTimeout(() => setRow(r.id, { savedFlash: false }), 2500);
        await onSaved();
        return;
      }

      // 2. Fallback to database RPC
      const { data, error } = await (dbClient as any).rpc("reallocate_project_limits", {
        _project: r.id,
        _new_interview_limit: r.interview + r.interviewUsed,
        _new_training_limit: r.training + r.trainingUsed,
      });
      if (error) throw error;
      const res = (data || {}) as { ok?: boolean };
      if (!res.ok) throw new Error("save_failed");

      setRow(r.id, {
        interviewSaved: r.interview,
        trainingSaved: r.training,
        saving: false,
        savedFlash: true,
      });
      setTimeout(() => setRow(r.id, { savedFlash: false }), 2500);
      await onSaved();
    } catch (e: any) {
      const msg = String(e?.message || e || "save_failed");
      let human = msg;
      if (/interview_limit_below_used/.test(msg)) human = "Лимит интервью нельзя опустить ниже использованного";
      else if (/training_limit_below_used/.test(msg)) human = "Лимит обучений нельзя опустить ниже использованного";
      else if (/not_enough_interview_pool/.test(msg)) human = "На общем балансе не хватает интервью";
      else if (/not_enough_training_pool/.test(msg)) human = "На общем балансе не хватает обучений";
      else if (/forbidden/.test(msg)) human = "Нет доступа к редактированию лимитов";
      setRow(r.id, { saving: false, error: human });
    }
  };

  const buyLimitsForVacancy = async (r: Row) => {
    const iQty = Math.max(0, Number(r.buyInterviewQty || 0));
    const tQty = Math.max(0, Number(r.buyTrainingQty || 0));
    const totalQty = iQty + tQty;
    if (totalQty <= 0) return;

    const unitPrice = getPricePerLimitUnit(totalQty);
    const totalCost = totalQty * unitPrice;

    if (employerBalance < totalCost) {
      setRow(r.id, {
        error: `Недостаточно RR на балансе (требуется ${totalCost} RR, доступно ${employerBalance} RR)`,
      });
      return;
    }

    setRow(r.id, { buying: true, error: null });
    try {
      const res = await fetch("/api/projects/buy-limits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: r.id,
          interview_qty: iQty,
          training_qty: tQty,
          employer_id: employerId,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Ошибка при покупке лимитов");
      }

      setRow(r.id, {
        buying: false,
        showBuyModal: false,
        savedFlash: true,
      });
      setTimeout(() => setRow(r.id, { savedFlash: false }), 2500);
      await onSaved();
    } catch (err: any) {
      setRow(r.id, { buying: false, error: err.message || "Не удалось совершить покупку" });
    }
  };

  return (
    <div className="bg-transparent backdrop-blur-2xl border border-white/20 rounded-3xl p-6 shadow-xl space-y-6 text-left">
      <div className="space-y-1.5 border-b border-white/15 pb-4">
        <h3 className="font-bold text-lg bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-[#E7C768]" /> Распределение и покупка лимитов по вакансиям
        </h3>
        <p className="text-sm text-slate-200 leading-relaxed">
          Вы можете распределять лимиты из общего пакета работодателя, либо докупать лимиты напрямую для конкретной вакансии за внутреннюю валюту RR с оптовыми скидками по количественным грейдам.
        </p>
      </div>

      {/* Common pool preview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-transparent backdrop-blur-xl rounded-2xl border border-white/20 p-4 space-y-2">
          <div className="flex items-center gap-2 text-slate-200">
            <Users2 className="w-5 h-5 text-[#E7C768]" />
            <span className="font-bold text-sm">Общий пакет интервью (осталось)</span>
          </div>
          <div className="text-2xl font-mono font-bold text-white">
            {previewInterview} <span className="text-sm font-normal text-slate-300">/ {interviewPool} шт.</span>
          </div>
          {overdrawI && (
            <div className="text-sm text-slate-300 bg-transparent border border-white/20 p-2 rounded-xl">
              Не хватает в общем пакете: уменьшите лимит или пополните пакет
            </div>
          )}
        </div>

        <div className="bg-transparent backdrop-blur-xl rounded-2xl border border-white/20 p-4 space-y-2">
          <div className="flex items-center gap-2 text-slate-200">
            <GraduationCap className="w-5 h-5 text-[#E7C768]" />
            <span className="font-bold text-sm">Общий пакет обучений (осталось)</span>
          </div>
          <div className="text-2xl font-mono font-bold text-white">
            {previewTraining} <span className="text-sm font-normal text-slate-300">/ {trainingPool} шт.</span>
          </div>
          {overdrawT && (
            <div className="text-sm text-slate-300 bg-transparent border border-white/20 p-2 rounded-xl">
              Не хватает в общем пакете: уменьшите лимит или пополните пакет
            </div>
          )}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="text-center text-sm text-slate-300 py-10 bg-transparent backdrop-blur-xl rounded-2xl border border-white/15">
          Вакансий пока не создано
        </div>
      ) : (
        <div className="space-y-4">
          {rows.map((r) => {
            const dirty = r.interview !== r.interviewSaved || r.training !== r.trainingSaved;
            const buyTotalQty = Math.max(0, Number(r.buyInterviewQty || 0)) + Math.max(0, Number(r.buyTrainingQty || 0));
            const buyUnitPrice = getPricePerLimitUnit(buyTotalQty);
            const buyTotalCost = buyTotalQty * buyUnitPrice;

            return (
              <div
                key={r.id}
                className="bg-transparent backdrop-blur-xl border border-white/20 rounded-3xl p-5 space-y-4 shadow-lg transition hover:border-white/30"
              >
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <h4 className="text-base font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">
                      {r.label}
                    </h4>
                    <span className="text-sm text-slate-300 block">Компания: {r.companyName}</span>
                  </div>

                  <button
                    type="button"
                    onClick={() => setRow(r.id, { showBuyModal: !r.showBuyModal })}
                    className="cursor-pointer px-4 py-2 rounded-xl bg-transparent hover:bg-white/10 border border-[#E7C768]/50 text-[#E7C768] hover:text-white font-bold text-sm transition flex items-center gap-2"
                  >
                    <ShoppingCart className="w-4 h-4 text-[#E7C768]" />
                    <span>Докупить за RR для вакансии</span>
                  </button>
                </div>

                {/* Limits fields */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <LimitField
                    label="Лимит интервью"
                    icon={<Users2 className="w-5 h-5 text-[#E7C768]" />}
                    value={r.interview}
                    used={r.interviewUsed}
                    onChange={(v) => setRow(r.id, { interview: clampI(r, v) })}
                  />
                  <LimitField
                    label="Лимит обучений"
                    icon={<GraduationCap className="w-5 h-5 text-[#E7C768]" />}
                    value={r.training}
                    used={r.trainingUsed}
                    onChange={(v) => setRow(r.id, { training: clampT(r, v) })}
                  />
                </div>

                {/* Direct RR Buy block inside card */}
                {r.showBuyModal && (
                  <div className="bg-transparent backdrop-blur-2xl border border-white/25 rounded-2xl p-4 space-y-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <span className="text-sm font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">
                        Покупка лимитов за валюту RR для этой вакансии
                      </span>
                      <span className="text-sm text-slate-300 font-mono">
                        Баланс: <b className="text-white">{employerBalance} RR</b>
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label className="text-sm text-slate-300 block font-medium">Интервью (+ шт.):</label>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            min={0}
                            value={r.buyInterviewQty ?? 10}
                            onChange={(e) => setRow(r.id, { buyInterviewQty: Math.max(0, Number(e.target.value) || 0) })}
                            className="w-full bg-transparent border border-white/20 rounded-xl px-3 py-2 text-white font-mono text-sm text-center focus:outline-none focus:border-[#E7C768]"
                          />
                          {[5, 10, 25].map((n) => (
                            <button
                              key={n}
                              type="button"
                              onClick={() => setRow(r.id, { buyInterviewQty: (r.buyInterviewQty ?? 0) + n })}
                              className="cursor-pointer text-sm font-bold px-2.5 py-2 rounded-xl bg-transparent hover:bg-white/10 border border-white/20 text-[#E7C768]"
                            >
                              +{n}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-sm text-slate-300 block font-medium">Обучения (+ шт.):</label>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            min={0}
                            value={r.buyTrainingQty ?? 0}
                            onChange={(e) => setRow(r.id, { buyTrainingQty: Math.max(0, Number(e.target.value) || 0) })}
                            className="w-full bg-transparent border border-white/20 rounded-xl px-3 py-2 text-white font-mono text-sm text-center focus:outline-none focus:border-[#E7C768]"
                          />
                          {[5, 10, 25].map((n) => (
                            <button
                              key={n}
                              type="button"
                              onClick={() => setRow(r.id, { buyTrainingQty: (r.buyTrainingQty ?? 0) + n })}
                              className="cursor-pointer text-sm font-bold px-2.5 py-2 rounded-xl bg-transparent hover:bg-white/10 border border-white/20 text-[#E7C768]"
                            >
                              +{n}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Pricing summary */}
                    <div className="flex items-center justify-between flex-wrap gap-2 pt-2 border-t border-white/15">
                      <div className="text-sm text-slate-200">
                        Грейд: <span className="font-bold text-white">{buyUnitPrice} RR/шт</span> (всего {buyTotalQty} шт ={" "}
                        <span className="font-bold text-[#E7C768]">{buyTotalCost} RR</span>)
                      </div>

                      <button
                        type="button"
                        onClick={() => buyLimitsForVacancy(r)}
                        disabled={r.buying || buyTotalQty <= 0 || employerBalance < buyTotalCost}
                        className="cursor-pointer px-4 py-2 rounded-xl bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] text-[#17344F] font-bold text-sm hover:brightness-110 transition disabled:opacity-40 flex items-center gap-1.5"
                      >
                        {r.buying ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin text-[#17344F]" />
                            <span>Оплата...</span>
                          </>
                        ) : (
                          <span>Оплатить {buyTotalCost} RR</span>
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {r.error && (
                  <div className="text-sm bg-transparent border border-white/20 text-slate-200 rounded-2xl p-3">
                    {r.error}
                  </div>
                )}

                <div className="flex items-center gap-3 flex-wrap pt-2 border-t border-white/10">
                  <button
                    type="button"
                    onClick={() => saveAllocation(r)}
                    disabled={!dirty || r.saving || overdrawI || overdrawT}
                    className="cursor-pointer bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] hover:brightness-110 text-[#17344F] font-bold text-sm px-4 py-2.5 rounded-xl flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed shadow transition"
                  >
                    {r.saving ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin text-[#17344F]" /> Сохраняем…
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4 text-[#17344F]" /> Сохранить распределение
                      </>
                    )}
                  </button>

                  {r.savedFlash && (
                    <span className="flex items-center gap-1.5 text-sm text-[#E7C768] font-bold">
                      <CheckCircle2 className="w-4 h-4 text-[#E7C768]" /> Сохранено в базе данных
                    </span>
                  )}

                  <div className="ml-auto text-sm text-slate-300">
                    Сдало: интервью <b className="text-white font-mono">{r.interviewUsed}</b>, обучений{" "}
                    <b className="text-white font-mono">{r.trainingUsed}</b>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function LimitField({
  label,
  icon,
  value,
  used,
  onChange,
}: {
  label: string;
  icon: React.ReactNode;
  value: number;
  used: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="bg-transparent backdrop-blur-xl border border-white/15 rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {icon}
          <div className="text-sm font-bold text-white">
            {label} <span className="text-sm text-slate-300 font-normal">(осталось)</span>
          </div>
        </div>
        <div className="text-sm text-slate-300">
          Сдало: <b className="text-white font-mono">{used}</b>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onChange(value - 1)}
          disabled={value <= 0}
          className="cursor-pointer w-10 h-10 rounded-xl bg-transparent hover:bg-white/10 border border-white/20 text-white disabled:opacity-30 inline-flex items-center justify-center transition"
        >
          <Minus className="w-4 h-4" />
        </button>
        <input
          type="number"
          min={0}
          max={100000}
          value={value}
          onChange={(e) => onChange(Number(e.target.value) || 0)}
          className="flex-1 bg-transparent text-white border border-white/20 rounded-xl px-3 py-2 text-base font-bold text-center focus:outline-none focus:border-[#E7C768] transition font-mono"
        />
        <button
          type="button"
          onClick={() => onChange(value + 1)}
          className="cursor-pointer w-10 h-10 rounded-xl bg-transparent hover:bg-white/10 border border-white/20 text-white inline-flex items-center justify-center transition"
        >
          <Plus className="w-4 h-4" />
        </button>
        {[5, 10, 25].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(value + n)}
            className="cursor-pointer text-sm font-bold px-3 py-2 rounded-xl bg-transparent hover:bg-white/10 border border-white/20 text-[#E7C768] transition"
          >
            +{n}
          </button>
        ))}
      </div>
    </div>
  );
}

// Minimalist vacancy limits widget for vacancy cards on /emp:id/vacancies
export function MinimalVacancyLimits({
  project,
  employerId,
  employerBalance = 0,
  interviewPool = 0,
  trainingPool = 0,
  onOpenDetailed,
  onUpdated,
}: {
  project: any;
  employerId?: string;
  employerBalance?: number;
  interviewPool?: number;
  trainingPool?: number;
  onOpenDetailed?: () => void;
  onUpdated?: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const interviewLimit = Math.round(Number(project.interview_limit ?? project.interviewLimit ?? project.max_interviews ?? 0));
  const interviewUsed = Math.round(Number(project.interview_used ?? project.interviewUsed ?? project.interviewed_count ?? project.interviewedCount ?? 0));
  const interviewRemain = Math.max(0, interviewLimit - interviewUsed);

  const trainingLimit = Math.round(Number(project.training_limit ?? project.trainingLimit ?? project.max_trainings ?? 0));
  const trainingUsed = Math.round(Number(project.training_used ?? project.trainingUsed ?? project.training_count ?? project.trainingCount ?? 0));
  const trainingRemain = Math.max(0, trainingLimit - trainingUsed);

  const quickAdd = async (type: "interview" | "training", amount: number) => {
    setSaving(true);
    setMsg("");
    try {
      const newILimit = type === "interview" ? interviewLimit + amount : interviewLimit;
      const newTLimit = type === "training" ? trainingLimit + amount : trainingLimit;

      const res = await fetch("/api/projects/reallocate-limits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: project.id,
          new_interview_limit: newILimit,
          new_training_limit: newTLimit,
          employer_id: employerId,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || data.error || "Не удалось выделить лимит из пула");
      }

      setMsg(`+${amount} добавлено из пула`);
      setTimeout(() => setMsg(""), 2000);
      onUpdated?.();
    } catch (err: any) {
      setMsg(err.message || "Ошибка");
      setTimeout(() => setMsg(""), 3500);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-transparent backdrop-blur-xl border border-white/15 rounded-2xl p-3.5 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent flex items-center gap-1.5">
          <Sparkles className="w-4 h-4 text-[#E7C768]" /> Лимиты вакансии
        </span>
        {onOpenDetailed && (
          <button
            type="button"
            onClick={onOpenDetailed}
            className="cursor-pointer text-sm text-[#E7C768] hover:underline"
          >
            Настроить / купить →
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="bg-transparent border border-white/15 p-2.5 rounded-xl space-y-1">
          <div className="text-sm text-slate-300">Интервью:</div>
          <div className="font-mono font-bold text-white text-base">
            {interviewRemain} <span className="text-sm font-normal text-slate-300">осталось</span>
          </div>
          <div className="text-sm text-slate-300">Пройдено: {interviewUsed} из {interviewLimit}</div>
          <div className="flex items-center gap-1 pt-1">
            {[1, 5].map((n) => (
              <button
                key={n}
                type="button"
                disabled={saving}
                onClick={() => quickAdd("interview", n)}
                className="cursor-pointer text-sm font-bold px-2 py-0.5 rounded-lg bg-transparent hover:bg-white/10 border border-white/20 text-[#E7C768] transition"
                title={`Добавить +${n} из общего пула интервью`}
              >
                +{n}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-transparent border border-white/15 p-2.5 rounded-xl space-y-1">
          <div className="text-sm text-slate-300">Обучение:</div>
          <div className="font-mono font-bold text-white text-base">
            {trainingRemain} <span className="text-sm font-normal text-slate-300">осталось</span>
          </div>
          <div className="text-sm text-slate-300">Пройдено: {trainingUsed} из {trainingLimit}</div>
          <div className="flex items-center gap-1 pt-1">
            {[1, 5].map((n) => (
              <button
                key={n}
                type="button"
                disabled={saving}
                onClick={() => quickAdd("training", n)}
                className="cursor-pointer text-sm font-bold px-2 py-0.5 rounded-lg bg-transparent hover:bg-white/10 border border-white/20 text-[#E7C768] transition"
                title={`Добавить +${n} из общего пула обучений`}
              >
                +{n}
              </button>
            ))}
          </div>
        </div>
      </div>

      {msg && (
        <div className="text-sm text-center text-[#E7C768] border border-white/20 p-1.5 rounded-xl">
          {msg}
        </div>
      )}
    </div>
  );
}
