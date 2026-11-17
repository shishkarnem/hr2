import { useEffect, useMemo, useRef, useState } from "react";
import { GraduationCap, Plus, Pencil, CheckCircle2, AlertCircle, HelpCircle } from "lucide-react";
import { dbClient } from "@/lib/dbClient";
import type { JobProject } from "../types";

type Props = {
  projects: JobProject[];
  onOpen: (projectId: string) => void;
  onCreate: () => void;
  onOpenHelp?: () => void;
};

type SystemSummary = {
  project_id: string;
  stages: Record<string, { material: boolean; test: boolean }>;
};

export default function TrainingList({ projects, onOpen, onCreate, onOpenHelp }: Props) {
  const employerPublicId = (projects[0] as any)?.employerPublicId
    || (typeof window !== "undefined" ? (window.location.pathname.match(/\/emp(\w+)/)?.[1] || "") : "");
  const openTariff = () => {
    if (employerPublicId) window.location.href = `/emp${employerPublicId}/tariff`;
  };
  const [summaries, setSummaries] = useState<Record<string, SystemSummary>>({});
  const [loading, setLoading] = useState(true);
  const normalizeStageKey = (raw: string): string => {
    const s = String(raw || "").toLowerCase().trim();
    if (s === "stage1" || s === "1" || s.startsWith("prof")) return "professional";
    if (s === "stage2" || s === "2" || s.startsWith("prod")) return "product";
    if (s === "stage3" || s === "3" || s.startsWith("sys")) return "system";
    return s;
  };

  // Stable key so we only re-fetch when the actual set of project IDs changes,
  // not on every parent re-render (EmployerPanel refetches every 4s).
  const idsKey = useMemo(() => {
    const all = projects.flatMap(p => [
      p.id,
      p.publicId,
      (p as any).public_id,
      (p as any).slug,
      p.id ? String(p.id).replace(/^vac_?/i, "") : null,
      (p as any).slug ? String((p as any).slug).replace(/^vac_?/i, "") : null,
    ].filter(Boolean).map(String));
    return Array.from(new Set(all)).slice().sort().join(",");
  }, [projects]);
  const firstLoad = useRef(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Only show the loading state on the very first fetch — silent refresh
      // afterwards prevents the list from flashing every few seconds.
      if (firstLoad.current) setLoading(true);
      const ids = idsKey ? idsKey.split(",").filter(Boolean) : [];
      if (!ids.length) { setSummaries({}); setLoading(false); firstLoad.current = false; return; }

      const resolveCanonicalProjectId = (rawPid: string): string => {
        const clean = String(rawPid || "").trim();
        const found = projects.find(p =>
          String(p.id) === clean ||
          String(p.publicId) === clean ||
          String((p as any).public_id) === clean ||
          String((p as any).slug) === clean ||
          String(p.id).replace(/^vac_?/i, "") === clean.replace(/^vac_?/i, "")
        );
        return found ? found.id : clean;
      };

      try {
        const res = await fetch(`/api/training/summary?projectIds=${encodeURIComponent(ids.join(","))}`);
        if (res.ok) {
          const json = await res.json();
          if (Array.isArray(json?.data) && !cancelled) {
            const map: Record<string, SystemSummary> = {};
            json.data.forEach((s: SystemSummary) => {
              if (!s.project_id) return;
              const normPid = resolveCanonicalProjectId(s.project_id);
              const target = (map[normPid] ||= { project_id: normPid, stages: {} });
              Object.entries(s.stages || {}).forEach(([rawStage, cell]) => {
                const stg = normalizeStageKey(rawStage);
                const prev = target.stages[stg] || { material: false, test: false };
                target.stages[stg] = {
                  material: Boolean(prev.material || cell?.material),
                  test: Boolean(prev.test || cell?.test),
                };
              });
            });
            setSummaries(map);
            setLoading(false);
            firstLoad.current = false;
            return;
          }
        }
      } catch (e) {
        // Fallback to direct client
      }

      const [{ data: blocks }, { data: tests }] = await Promise.all([
        dbClient.from("training_blocks").select("project_id,stage,materials_md,subpages_json").in("project_id", ids),
        dbClient.from("training_stage_tests").select("project_id,stage,status,questions,questions_json").in("project_id", ids),
      ]);
      if (cancelled) return;
      const map: Record<string, SystemSummary> = {};

      (blocks || []).forEach((b: any) => {
        const hasMat =
          Boolean(b.materials_md && String(b.materials_md).trim()) ||
          Boolean(Array.isArray(b.subpages_json) ? b.subpages_json.length > 0 : b.subpages_json && String(b.subpages_json).trim() !== "[]");
        if (!hasMat) return;
        const normPid = resolveCanonicalProjectId(b.project_id);
        const normStage = normalizeStageKey(b.stage);
        const s = map[normPid] ||= { project_id: normPid, stages: {} };
        s.stages[normStage] = { ...(s.stages[normStage] || { material: false, test: false }), material: true };
      });
      (tests || []).forEach((t: any) => {
        const rawQ = t.questions ?? t.questions_json;
        let qs: any[] = [];
        if (Array.isArray(rawQ)) qs = rawQ;
        else if (typeof rawQ === "string") {
          try {
            const p = JSON.parse(rawQ);
            if (Array.isArray(p)) qs = p;
            else if (p && Array.isArray((p as any).questions)) qs = (p as any).questions;
          } catch {}
        }
        if (t.status !== "completed" && !qs.length) return;
        const normPid = resolveCanonicalProjectId(t.project_id);
        const normStage = normalizeStageKey(t.stage);
        const s = map[normPid] ||= { project_id: normPid, stages: {} };
        s.stages[normStage] = { ...(s.stages[normStage] || { material: false, test: false }), test: true };
      });
      setSummaries(map);
      setLoading(false);
      firstLoad.current = false;
    })();
    return () => { cancelled = true; };
  }, [idsKey, projects]);

  const existing = projects.filter(p => summaries[p.id]);

  return (
    <div className="space-y-6 text-left">
      <div className="bg-transparent backdrop-blur-2xl border border-white/20 rounded-3xl p-6 shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl border border-[#E7C768]/40 bg-transparent flex items-center justify-center text-[#E7C768] shrink-0">
            <GraduationCap className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent flex items-center gap-2">
              Системы обучения
            </h2>
            <p className="text-sm text-slate-200 mt-1">Одна система на одну вакансию. 3 этапа: профессиональный, продуктовый, системный.</p>
          </div>
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          {onOpenHelp && (
            <button
              type="button"
              onClick={onOpenHelp}
              className="p-3 rounded-2xl border border-white/20 text-slate-300 hover:text-[#F4EE8E] hover:border-[#d4af37] bg-transparent backdrop-blur-xl transition cursor-pointer"
              title="Обучающая инструкция: ИИ-система обучения (ИИ-Академия)"
              aria-label="Инструкция по обучению"
            >
              <HelpCircle className="w-5 h-5 text-[#E7C768]" />
            </button>
          )}
          <button
            type="button"
            onClick={onCreate}
            className="cursor-pointer bg-gradient-to-r from-[#FFE580] via-[#E7C768] to-[#C8A038] hover:brightness-110 active:scale-95 text-[#17344F] font-bold text-sm py-3 px-5 rounded-2xl flex items-center gap-2 transition-all shadow-lg"
          >
            <Plus className="w-4 h-4" /> Создать систему обучения
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center text-sm text-slate-300 py-10">Загрузка систем обучения…</div>
      ) : existing.length === 0 ? (
        <div className="bg-transparent backdrop-blur-xl border border-white/15 rounded-3xl p-10 text-center text-sm text-slate-300">
          Пока не создано ни одной системы обучения. Нажмите «Создать систему обучения», выберите вакансию и сгенерируйте материалы и тест.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {existing.map((p, pIdx) => {
            const s = summaries[p.id];
            const stages = ["professional", "product", "system"] as const;
            const stageLabels: Record<string, string> = {
              professional: "Проф.", product: "Прод.", system: "Сист.",
            };
            const isAllComplete = stages.every(st => {
              const cell = s.stages[st];
              return cell && cell.material && cell.test;
            });
            return (
              <div
                key={`${p.id}-${pIdx}`}
                className="border border-white/20 hover:border-[#E7C768]/60 p-6 rounded-3xl flex flex-col justify-between hover:shadow-2xl transition-all bg-transparent backdrop-blur-2xl space-y-4"
              >
                <div className="space-y-3">
                  <div className="flex justify-between items-center text-sm font-mono text-slate-300">
                    <span className="font-bold text-[#E7C768]">🏢 {p.companyName || "Компания"}</span>
                    <span className="px-3 py-1 rounded-full text-xs font-mono border border-[#E7C768]/50 text-[#E7C768] bg-transparent">
                      {isAllComplete ? "Настроена" : "В процессе"}
                    </span>
                  </div>

                  <h3 className="text-lg font-bold text-white leading-tight">{p.roleName || "Без названия"}</h3>

                  {(() => {
                    const tLim = Number((p as any).trainingLimit || 0);
                    const tUsed = Number((p as any).trainingUsed || 0);
                    const tLeft = Math.max(0, tLim - tUsed);
                    return (
                      <button
                        type="button"
                        onClick={openTariff}
                        title="Перейти к тарифам"
                        className="w-full text-left text-sm px-3.5 py-2.5 rounded-2xl border border-white/15 hover:border-[#E7C768]/50 flex items-center gap-2 transition bg-transparent backdrop-blur-xl text-slate-200 hover:text-white"
                      >
                        <GraduationCap className="w-4 h-4 text-[#E7C768] shrink-0" />
                        <span>Лимит обучений: <strong className="text-white font-bold">{tLeft}</strong> из <strong className="text-white font-bold">{tLim}</strong></span>
                        <span className="ml-auto opacity-70 text-xs font-mono">использовано {tUsed}</span>
                      </button>
                    );
                  })()}

                  <div className="grid grid-cols-3 gap-2">
                    {stages.map(st => {
                      const cell = s.stages[st] || { material: false, test: false };
                      const ok = cell.material && cell.test;
                      return (
                        <div
                          key={st}
                          className={`p-2.5 rounded-2xl border text-center transition bg-transparent backdrop-blur-xl ${
                            ok ? "border-[#E7C768]/60 text-white" : "border-white/15 text-slate-300"
                          }`}
                        >
                          <div className="text-xs font-mono flex items-center justify-center gap-1">
                            {ok ? <CheckCircle2 className="w-3.5 h-3.5 text-[#E7C768]" /> : <AlertCircle className="w-3.5 h-3.5 text-white/50" />}
                            <span className="font-bold">{stageLabels[st]}</span>
                          </div>
                          <div className="text-xs text-slate-300 mt-1">
                            {cell.material ? "Материалы" : "—"} / {cell.test ? "Тест" : "—"}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onOpen(p.id)}
                  className="w-full cursor-pointer bg-transparent hover:bg-white/10 border border-[#E7C768]/60 hover:border-[#E7C768] text-[#E7C768] hover:text-[#F4EE8E] font-bold text-sm py-2.5 px-4 rounded-2xl flex items-center justify-center gap-2 transition shadow-md active:scale-95 backdrop-blur-md"
                >
                  <Pencil className="w-4 h-4 text-[#E7C768]" />
                  <span>Открыть редактор</span>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}