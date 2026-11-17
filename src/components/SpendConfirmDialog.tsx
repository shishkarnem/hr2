import { useState, useMemo, useEffect } from "react";
import { X, Coins, Wallet, AlertTriangle, Users2, GraduationCap, Plus, Minus, Sparkles } from "lucide-react";
import { dbClient } from "@/lib/dbClient";
import { FIXED_PRICES, formatRR } from "@/lib/rr";
import { diagLog } from "@/lib/diagLog";
import type { JobProject } from "../types";

export type SpendKind = "landing" | "interview_setup" | "training_setup";

const LABEL: Record<SpendKind, string> = {
  landing: "ИИ-Лендинг вакансии",
  interview_setup: "ИИ-Система интервью",
  training_setup: "ИИ-Система обучения",
};

const RR_CASHIER = "/files/2/rr11.png";
const RR_EMPTY   = "/files/3/rr10.png";

type Props = {
  open: boolean;
  kind: SpendKind;
  /** Pre-known project (vacancy flow). When omitted, a picker is shown. */
  projectId?: string;
  /** Current employer cabinet public id from /emp{id}; used to verify project ownership in billing RPC. */
  employerPublicId?: string;
  /** Projects to choose from when projectId is not pre-known. */
  pickProjects?: JobProject[];
  /** Optional set of project ids that already have this system. */
  excludeProjectIds?: Set<string>;
  balance: number;
  credits: number;
  /** Company-wide general limit pool (interviewCredits for interview_setup, trainingCredits for training_setup). */
  companyPool?: number;
  /** Optional callback to refresh employer projects & balances after reallocating limits. */
  onLimitsUpdated?: () => void | Promise<void>;
  /** Called after a successful spend (or already-charged idempotent hit). */
  onConfirmed: (projectId: string, result: SpendResult) => void;
  /** Called when user closes or cancels. */
  onClose: () => void;
  /** Open the billing/top-up screen. */
  onGoToBilling: () => void;
};

export type SpendResult = {
  ok: true;
  already?: boolean;
  used_credit?: boolean;
  amount?: number;
  left?: number;
  allocated_limits?: number;
};

export default function SpendConfirmDialog({
  open,
  kind,
  projectId,
  employerPublicId,
  pickProjects,
  excludeProjectIds,
  balance,
  credits,
  companyPool = 0,
  onLimitsUpdated,
  onConfirmed,
  onClose,
  onGoToBilling,
}: Props) {
  const price = FIXED_PRICES[kind];
  const [pickedId, setPickedId] = useState<string>(projectId || "");
  const [busy, setBusy] = useState(false);
  const [allocBusy, setAllocBusy] = useState(false);
  const [err, setErr] = useState<string>("");
  const [infoMsg, setInfoMsg] = useState<string>("");

  const isInterview = kind === "interview_setup";
  const isTraining = kind === "training_setup";
  const supportsVacancyPool = isInterview || isTraining;

  // Always show all active projects of the employer in the dropdown so interview_setup and training_setup
  // have the exact same list length, sorted with vacancies without an existing system first.
  const sortedProjects = useMemo(() => {
    const list = [...(pickProjects || [])];
    list.sort((a, b) => {
      const aHas = excludeProjectIds?.has(a.id) ? 1 : 0;
      const bHas = excludeProjectIds?.has(b.id) ? 1 : 0;
      if (aHas !== bHas) return aHas - bHas;
      return String(a.roleName || "").localeCompare(String(b.roleName || ""), "ru");
    });
    return list;
  }, [pickProjects, excludeProjectIds]);

  useEffect(() => {
    if (projectId) {
      setPickedId(projectId);
    } else if (!pickedId && sortedProjects.length > 0) {
      const firstNew = sortedProjects.find((p) => !excludeProjectIds?.has(p.id));
      setPickedId((firstNew || sortedProjects[0]).id);
    }
  }, [projectId, sortedProjects, excludeProjectIds, pickedId]);

  const effectiveProjectId = projectId || pickedId;

  const selectedProject = useMemo(
    () => (pickProjects || []).find((p) => p.id === effectiveProjectId) || null,
    [pickProjects, effectiveProjectId]
  );

  const vacancyInfo = useMemo(() => {
    if (!selectedProject) {
      return { limit: 0, used: 0, remaining: 0, alreadyHasSystem: false };
    }
    const p: any = selectedProject;
    const limit = Math.max(
      0,
      Number(
        isInterview
          ? p.interviewLimit ?? p.interview_limit ?? p.max_interviews ?? 0
          : p.trainingLimit ?? p.training_limit ?? p.max_trainings ?? 0
      )
    );
    const used = Math.max(
      0,
      Number(isInterview ? p.interviewUsed ?? p.interview_used ?? 0 : p.trainingUsed ?? p.training_used ?? 0)
    );
    const remaining = Math.max(0, limit - used);
    const alreadyHasSystem = Boolean(excludeProjectIds?.has(selectedProject.id));
    return { limit, used, remaining, alreadyHasSystem };
  }, [selectedProject, isInterview, excludeProjectIds]);

  const effectiveCompanyPool = Math.max(0, Math.floor(Number(companyPool || 0)));
  const [allocQty, setAllocQty] = useState<number>(0);

  useEffect(() => {
    if (!supportsVacancyPool) {
      setAllocQty(0);
      return;
    }
    if (vacancyInfo.remaining === 0 && effectiveCompanyPool > 0) {
      setAllocQty(Math.min(10, effectiveCompanyPool));
    } else {
      setAllocQty(0);
    }
    setErr("");
    setInfoMsg("");
  }, [effectiveProjectId, vacancyInfo.remaining, effectiveCompanyPool, supportsVacancyPool]);

  if (!open) return null;

  const clampAlloc = (v: number) => Math.max(0, Math.min(effectiveCompanyPool, Math.floor(Number(v) || 0)));

  const hasCredit = credits > 0;
  const hasPoolOrVacancyLimit = supportsVacancyPool && (effectiveCompanyPool > 0 || vacancyInfo.remaining > 0);
  const canPayRR = balance >= price;
  const insufficient = !hasCredit && !hasPoolOrVacancyLimit && !canPayRR && !vacancyInfo.alreadyHasSystem;

  const handleAllocateOnly = async () => {
    if (!selectedProject || allocQty <= 0) return;
    if (allocQty > effectiveCompanyPool) {
      setErr(`Нельзя превысить общий лимит компании (доступно ${effectiveCompanyPool} шт.)`);
      return;
    }
    setAllocBusy(true);
    setErr("");
    setInfoMsg("");
    try {
      const p: any = selectedProject;
      const curILim = Math.max(0, Number(p.interviewLimit ?? p.interview_limit ?? p.max_interviews ?? 0));
      const curTLim = Math.max(0, Number(p.trainingLimit ?? p.training_limit ?? p.max_trainings ?? 0));
      const newILim = isInterview ? curILim + allocQty : curILim;
      const newTLim = isTraining ? curTLim + allocQty : curTLim;

      const res = await fetch("/api/projects/reallocate-limits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: selectedProject.id,
          new_interview_limit: newILim,
          new_training_limit: newTLim,
          employer_id: employerPublicId,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        throw new Error(data?.message || data?.error || "Ошибка распределения лимитов");
      }
      setInfoMsg(`Выделено +${allocQty} шт. из общего лимита компании для выбранной вакансии.`);
      setAllocQty(0);
      if (onLimitsUpdated) await onLimitsUpdated();
    } catch (e: any) {
      const msg = String(e?.message || "Ошибка распределения лимитов");
      setErr(msg);
      diagLog("spend_dialog_alloc", msg.slice(0, 120), {
        kind,
        project_id: selectedProject.id,
        employer_id: employerPublicId || "",
      });
    } finally {
      setAllocBusy(false);
    }
  };

  const handleSpend = async (prefer: "credit" | "pool" | "balance" = "credit") => {
    if (!effectiveProjectId) {
      setErr("Выберите вакансию из списка");
      return;
    }
    if (allocQty > effectiveCompanyPool) {
      setErr(`Лимит вакансии не может превышать общий лимит компании (${effectiveCompanyPool} шт.)`);
      return;
    }
    setBusy(true);
    setErr("");
    setInfoMsg("");
    try {
      const rpcName = employerPublicId ? "spend_fixed_for_employer" : "spend_fixed";
      const rpcArgs: Record<string, any> = employerPublicId
        ? {
            _employer_public_id: employerPublicId,
            _project: effectiveProjectId,
            _item: kind,
            _prefer: prefer,
            _allocate_qty: allocQty,
          }
        : {
            _project: effectiveProjectId,
            _item: kind,
            _prefer: prefer,
            _allocate_qty: allocQty,
          };
      const { data, error } = await dbClient.rpc(rpcName as any, rpcArgs as any);
      if (error) throw new Error(error.message || "Ошибка списания");
      if (onLimitsUpdated) await onLimitsUpdated();
      onConfirmed(effectiveProjectId, (data as any) || { ok: true });
    } catch (e: any) {
      const msg = String(e?.message || "");
      diagLog("spend_dialog_error", msg.slice(0, 120) || "spend_failed", {
        kind,
        project_id: effectiveProjectId,
        employer_id: employerPublicId || "",
      });
      if (/insufficient_funds/.test(msg)) {
        setErr("Недостаточно средств на балансе. Выделите лимит из общих лимитов компании или пополните счёт.");
      } else if (/insufficient_credits/.test(msg)) {
        setErr("Лимит создания этой услуги исчерпан. Используйте общие лимиты или списание с баланса RR.");
      } else if (/project_employer_mismatch|bad_employer/.test(msg)) {
        setErr("Вакансия не относится к текущему кабинету работодателя. Обновите страницу и попробуйте снова.");
      } else {
        setErr(msg || "Не удалось выполнить операцию");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-transparent backdrop-blur-md flex items-center justify-center p-4">
      <div className="brand-editor bg-transparent backdrop-blur-2xl border border-[#E7C768]/40 rounded-3xl w-full max-w-lg text-white shadow-2xl relative overflow-hidden max-h-[92vh] overflow-y-auto">
        <button
          onClick={() => !busy && !allocBusy && onClose()}
          className="absolute top-3 right-3 text-slate-200 hover:text-white bg-transparent backdrop-blur-xl border border-white/20 w-9 h-9 rounded-full flex items-center justify-center transition z-10 cursor-pointer"
          aria-label="Закрыть"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex flex-col items-center px-6 pt-6 pb-2">
          <img
            src={insufficient ? RR_EMPTY : RR_CASHIER}
            alt="Робот-кассир"
            width={136}
            height={136}
            loading="lazy"
            decoding="async"
            className="w-32 h-32 object-contain drop-shadow-xl"
          />
          <h2 className="mt-2 text-lg font-bold text-transparent bg-clip-text bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] text-center">
            {insufficient
              ? "Пополнение баланса и распределение лимитов"
              : "Выбор вакансии и лимитов для создания системы"}
          </h2>
          <p className="mt-1 text-sm text-white/90 text-center">
            {LABEL[kind]} · стоимость создания без пакетного лимита: {price} RR
          </p>
        </div>

        <div className="px-6 pb-6 space-y-4">
          {!projectId && (
            <div>
              <label className="block text-sm font-bold text-white mb-1.5">
                Для какой вакансии ({sortedProjects.length} шт.):
              </label>
              <select
                value={pickedId}
                onChange={(e) => setPickedId(e.target.value)}
                disabled={busy || allocBusy}
                className="w-full bg-transparent backdrop-blur-xl border border-white/25 rounded-2xl px-3.5 py-2.5 text-sm text-white focus:border-[#E7C768] outline-none"
              >
                <option value="" className="bg-[#17344F] text-white">
                  — выберите вакансию —
                </option>
                {sortedProjects.map((p: any) => {
                  const vLim = Math.max(
                    0,
                    Number(
                      isInterview
                        ? p.interviewLimit ?? p.interview_limit ?? p.max_interviews ?? 0
                        : p.trainingLimit ?? p.training_limit ?? p.max_trainings ?? 0
                    )
                  );
                  const vUsed = Math.max(
                    0,
                    Number(
                      isInterview
                        ? p.interviewUsed ?? p.interview_used ?? 0
                        : p.trainingUsed ?? p.training_used ?? 0
                    )
                  );
                  const vRem = Math.max(0, vLim - vUsed);
                  const hasSys = excludeProjectIds?.has(p.id);
                  return (
                    <option key={p.id} value={p.id} className="bg-[#17344F] text-white">
                      {p.roleName || "(без названия)"} · {p.companyName || "Компания"} — лимит вакансии: {vRem} шт.{" "}
                      {hasSys ? "(система создана)" : "(новая)"}
                    </option>
                  );
                })}
              </select>
            </div>
          )}

          {/* Сводка общих лимитов компании, лимитов под конкретную вакансию и баланса RR */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-sm">
            <div className="bg-transparent backdrop-blur-xl border border-white/20 rounded-2xl px-3.5 py-2.5">
              <div className="text-white/80 text-sm">Лимит создания систем</div>
              <div className="text-white font-bold flex items-center gap-1.5 mt-0.5 text-sm">
                <Coins className="w-4 h-4 text-[#E7C768]" /> {credits} шт.
              </div>
            </div>
            <div className="bg-transparent backdrop-blur-xl border border-white/20 rounded-2xl px-3.5 py-2.5">
              <div className="text-white/80 text-sm">Баланс компании</div>
              <div className="text-white font-bold flex items-center gap-1.5 mt-0.5 text-sm">
                <Wallet className="w-4 h-4 text-[#E7C768]" /> {formatRR(balance)}
              </div>
            </div>
            {supportsVacancyPool && (
              <>
                <div className="bg-transparent backdrop-blur-xl border border-white/20 rounded-2xl px-3.5 py-2.5">
                  <div className="text-white/80 text-sm">
                    Общий лимит {isInterview ? "интервью" : "обучений"}
                  </div>
                  <div className="text-white font-bold flex items-center gap-1.5 mt-0.5 text-sm">
                    {isInterview ? (
                      <Users2 className="w-4 h-4 text-[#E7C768]" />
                    ) : (
                      <GraduationCap className="w-4 h-4 text-[#E7C768]" />
                    )}
                    {effectiveCompanyPool} шт. (для всех вакансий)
                  </div>
                </div>
                <div className="bg-transparent backdrop-blur-xl border border-[#E7C768]/40 rounded-2xl px-3.5 py-2.5">
                  <div className="text-white/80 text-sm">Лимит под выбранную вакансию</div>
                  <div className="text-white font-bold flex items-center gap-1.5 mt-0.5 text-sm">
                    <Sparkles className="w-4 h-4 text-[#E7C768]" />
                    {selectedProject
                      ? `${vacancyInfo.remaining} шт. (выделено ${vacancyInfo.limit}, исп. ${vacancyInfo.used})`
                      : "Выберите вакансию"}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Распределение из общих лимитов компании под конкретную вакансию (чтобы не превышалось) */}
          {supportsVacancyPool && selectedProject && (
            <div className="bg-transparent backdrop-blur-xl border border-white/20 rounded-2xl p-3.5 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">
                  Пополнение лимита вакансии из общих лимитов
                </span>
                <span className="text-sm text-white/80 font-mono">
                  Макс: {effectiveCompanyPool} шт.
                </span>
              </div>
              <p className="text-sm text-white/85 leading-relaxed">
                Вы можете перевести лимиты из общего пакета компании ({effectiveCompanyPool} шт.) на вакансию «
                {selectedProject.roleName}». Сумма по вакансиям не может превышать общий лимит.
              </p>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={busy || allocBusy || allocQty <= 0}
                    onClick={() => setAllocQty((q) => clampAlloc(q - 5))}
                    className="w-9 h-9 rounded-xl border border-white/20 bg-transparent hover:border-[#E7C768] text-white flex items-center justify-center disabled:opacity-40 cursor-pointer"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <input
                    type="number"
                    min={0}
                    max={effectiveCompanyPool}
                    value={allocQty}
                    onChange={(e) => setAllocQty(clampAlloc(Number(e.target.value)))}
                    disabled={busy || allocBusy || effectiveCompanyPool <= 0}
                    className="w-24 text-center bg-transparent border border-white/25 rounded-xl py-1.5 px-2 text-sm font-mono font-bold text-white focus:border-[#E7C768] outline-none"
                  />
                  <button
                    type="button"
                    disabled={busy || allocBusy || allocQty >= effectiveCompanyPool}
                    onClick={() => setAllocQty((q) => clampAlloc(q + 5))}
                    className="w-9 h-9 rounded-xl border border-white/20 bg-transparent hover:border-[#E7C768] text-white flex items-center justify-center disabled:opacity-40 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>

                {allocQty > 0 && effectiveCompanyPool > 0 && (
                  <button
                    type="button"
                    disabled={busy || allocBusy}
                    onClick={handleAllocateOnly}
                    className="px-3.5 py-2 rounded-xl border border-[#E7C768]/50 bg-transparent hover:border-[#E7C768] text-sm font-bold text-white transition cursor-pointer"
                  >
                    {allocBusy
                      ? "Переводим…"
                      : `Перевести +${allocQty} ${kind.startsWith("training") ? "обучений кандидатов" : "интервью кандидатов"} в вакансию`}
                  </button>
                )}
              </div>
            </div>
          )}

          {infoMsg && (
            <div className="bg-transparent backdrop-blur-xl border border-[#E7C768]/50 text-white text-sm px-3.5 py-2.5 rounded-2xl">
              {infoMsg}
            </div>
          )}

          {err && (
            <div className="bg-transparent backdrop-blur-xl border border-[#E7C768] text-white text-sm px-3.5 py-2.5 rounded-2xl flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 mt-0.5 text-[#E7C768] shrink-0" />
              <span>{err}</span>
            </div>
          )}

          {vacancyInfo.alreadyHasSystem ? (
            <div className="space-y-2.5">
              <div className="bg-transparent backdrop-blur-xl border border-white/20 rounded-2xl px-3.5 py-2.5 text-sm text-white/90">
                Для выбранной вакансии система уже создана. Повторная оплата за создание не требуется — вы можете открыть её для редактирования или добавить лимиты из общего пула выше.
              </div>
              <button
                onClick={() => handleSpend("credit")}
                disabled={busy || allocBusy || !effectiveProjectId}
                className="w-full btn-brand-gold py-3 rounded-2xl text-sm font-bold cursor-pointer"
              >
                {busy
                  ? "Открываем…"
                  : allocQty > 0
                  ? `Выделить +${allocQty} ${kind.startsWith("training") ? "обучений кандидатов" : "интервью кандидатов"} и открыть систему вакансии`
                  : "Открыть систему выбранной вакансии"}
              </button>
            </div>
          ) : insufficient ? (
            <div className="space-y-2.5">
              <p className="text-sm text-white/90 leading-relaxed text-center">
                Для создания «{LABEL[kind]}» требуется 1 лимит создания или <b>{price} RR</b>, а сейчас доступно{" "}
                <b>{formatRR(balance)}</b> и <b>{effectiveCompanyPool} шт.</b> в общем лимите. Пополните баланс или пакет лимитов компании.
              </p>
              <button
                onClick={() => {
                  onClose();
                  onGoToBilling();
                }}
                className="w-full btn-brand-gold py-3 rounded-2xl text-sm font-bold cursor-pointer"
              >
                Пополнить баланс и общие лимиты
              </button>
            </div>
          ) : (
            <div className="space-y-2.5">
              {hasCredit && (
                <button
                  onClick={() => handleSpend("credit")}
                  disabled={busy || allocBusy || !effectiveProjectId}
                  className="w-full btn-brand-gold py-3 rounded-2xl text-sm font-bold cursor-pointer"
                >
                  {busy
                    ? "Выполняем…"
                    : `Списать 1 лимит создания (останется ${credits - 1} шт.)${
                        allocQty > 0
                          ? ` + выделить ${allocQty} ${kind.startsWith("training") ? "обучений кандидатов" : "интервью кандидатов"} в вакансию`
                          : ""
                      }`}
                </button>
              )}

              {!hasCredit && hasPoolOrVacancyLimit && (
                <button
                  onClick={() => handleSpend("pool")}
                  disabled={busy || allocBusy || !effectiveProjectId}
                  className="w-full btn-brand-gold py-3 rounded-2xl text-sm font-bold cursor-pointer"
                >
                  {busy
                    ? "Выполняем…"
                    : allocQty > 0
                    ? `Создать систему и выделить +${allocQty} ${kind.startsWith("training") ? "обучений кандидатов" : "интервью кандидатов"} из общего лимита`
                    : `Создать систему по лимиту вакансии (${vacancyInfo.remaining} шт.)`}
                </button>
              )}

              {canPayRR && (
                <button
                  onClick={() => handleSpend("balance")}
                  disabled={busy || allocBusy || !effectiveProjectId}
                  className={`w-full ${
                    hasCredit || hasPoolOrVacancyLimit ? "btn-brand-secondary" : "btn-brand-gold"
                  } py-3 rounded-2xl text-sm font-bold cursor-pointer`}
                >
                  {busy
                    ? "Списываем…"
                    : `Списать ${price} RR с баланса${
                        allocQty > 0
                          ? ` и выделить ${allocQty} ${kind.startsWith("training") ? "обучений кандидатов" : "интервью кандидатов"} в вакансию`
                          : ""
                      }`}
                </button>
              )}

              <button
                onClick={() => {
                  onClose();
                  onGoToBilling();
                }}
                className="w-full bg-transparent backdrop-blur-xl hover:border-[#E7C768] border border-white/20 text-white py-2.5 rounded-2xl text-sm font-bold transition cursor-pointer"
              >
                Пополнить общие лимиты / баланс RR
              </button>
            </div>
          )}

          <button
            onClick={() => !busy && !allocBusy && onClose()}
            className="w-full bg-transparent backdrop-blur-xl hover:border-white/40 border border-white/20 text-white/90 py-2.5 rounded-2xl text-sm font-bold cursor-pointer"
          >
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}