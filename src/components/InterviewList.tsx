import { useEffect, useMemo, useRef, useState } from "react";
import { MessageSquare, Plus, Pencil, CheckCircle2, AlertCircle, Users2, HelpCircle } from "lucide-react";
import { dbClient } from "@/lib/dbClient";
import type { JobProject } from "../types";

type Props = {
  projects: JobProject[];
  onOpen: (projectId: string) => void;
  onCreate: () => void;
  reloadKey?: number;
  onOpenHelp?: () => void;
};

type Summary = { project_id: string; blocks: { resume: boolean; checklist: boolean; situations: boolean } };

export default function InterviewList({ projects, onOpen, onCreate, reloadKey = 0, onOpenHelp }: Props) {
  // employerPublicId для перехода на страницу тарифов при клике на плашку лимитов.
  const employerPublicId = (projects[0] as any)?.employerPublicId
    || (typeof window !== "undefined" ? (window.location.pathname.match(/\/emp(\w+)/)?.[1] || "") : "");
  const openTariff = () => {
    if (employerPublicId) window.location.href = `/emp${employerPublicId}/tariff`;
  };
  const [summaries, setSummaries] = useState<Record<string, Summary>>({});
  const [loading, setLoading] = useState(true);
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
        const res = await fetch(`/api/interviews/summary?projectIds=${encodeURIComponent(ids.join(","))}`);
        if (res.ok) {
          const json = await res.json();
          if (Array.isArray(json?.data) && !cancelled) {
            const map: Record<string, Summary> = {};
            json.data.forEach((s: Summary) => {
              if (!s.project_id) return;
              const normPid = resolveCanonicalProjectId(s.project_id);
              const target = (map[normPid] ||= {
                project_id: normPid,
                blocks: { resume: false, checklist: false, situations: false },
              });
              target.blocks.resume = Boolean(target.blocks.resume || s.blocks?.resume);
              target.blocks.checklist = Boolean(target.blocks.checklist || s.blocks?.checklist);
              target.blocks.situations = Boolean(target.blocks.situations || s.blocks?.situations);
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

      const [{ data: systems }, { data: blocks }] = await Promise.all([
        (dbClient as any).from("interview_systems").select("project_id").in("project_id", ids),
        (dbClient as any).from("interview_blocks").select("project_id,kind,payload").in("project_id", ids),
      ]);
      if (cancelled) return;
      const map: Record<string, Summary> = {};
      (systems || []).forEach((s: any) => {
        if (!s.project_id) return;
        const normPid = resolveCanonicalProjectId(s.project_id);
        map[normPid] ||= { project_id: normPid, blocks: { resume: false, checklist: false, situations: false } };
      });
      (blocks || []).forEach((b: any) => {
        const normPid = resolveCanonicalProjectId(b.project_id);
        const s = map[normPid] ||= { project_id: normPid, blocks: { resume: false, checklist: false, situations: false } };
        const p = b.payload || {};
        if (b.kind === "resume" && String(p.criteria_md || "").trim()) s.blocks.resume = true;
        if (b.kind === "checklist" && Array.isArray(p.questions) && p.questions.length) s.blocks.checklist = true;
        if (b.kind === "situations" && Array.isArray(p.situations) && p.situations.length) s.blocks.situations = true;
      });
      setSummaries(map);
      setLoading(false);
      firstLoad.current = false;
    })();
    return () => { cancelled = true; };
  }, [idsKey, reloadKey, projects]);

  const existing = projects.filter(p => summaries[p.id]);

  return (
    <div className="space-y-6 text-left">
      <div className="bg-transparent backdrop-blur-2xl border border-white/25 rounded-3xl p-6 shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl border border-[#E7C768]/50 bg-transparent flex items-center justify-center text-[#E7C768] shrink-0">
            <MessageSquare className="w-6 h-6 text-[#E7C768]" />
          </div>
          <div>
            <h2 className="text-lg font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent flex items-center gap-2">
              Системы интервью
            </h2>
            <p className="text-sm text-white/90 mt-1">Одна система на одну вакансию. 3 блока: критерии резюме, чек-лист, ролевые ситуации.</p>
          </div>
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          {onOpenHelp && (
            <button
              type="button"
              onClick={onOpenHelp}
              className="p-3 rounded-2xl border border-white/20 text-slate-300 hover:text-[#F4EE8E] hover:border-[#d4af37] bg-transparent backdrop-blur-xl transition cursor-pointer"
              title="Обучающая инструкция: ИИ-система интервью (ИИ-Академия)"
              aria-label="Инструкция по интервью"
            >
              <HelpCircle className="w-5 h-5 text-[#E7C768]" />
            </button>
          )}
          <button
            type="button"
            onClick={onCreate}
            className="cursor-pointer bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] hover:brightness-105 active:scale-95 text-[#17344F] font-bold text-sm py-3 px-5 rounded-2xl flex items-center gap-2 transition-all shadow-lg"
          >
            <Plus className="w-4 h-4 text-[#17344F]" /> Создать систему интервью
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center text-sm text-white/90 py-10">Загрузка систем интервью…</div>
      ) : existing.length === 0 ? (
        <div className="bg-transparent backdrop-blur-xl border border-white/25 rounded-3xl p-10 text-center text-sm text-white/90">
          Пока не создано ни одной системы интервью. Нажмите «Создать систему интервью» и выберите вакансию.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {existing.map((p, pIdx) => {
            const s = summaries[p.id];
            const cells: { key: "resume" | "checklist" | "situations"; label: string; icon: string }[] = [
              { key: "resume", label: "Резюме", icon: "📄" },
              { key: "checklist", label: "Чек-лист", icon: "✅" },
              { key: "situations", label: "Ситуации", icon: "🎭" },
            ];
            const isAllComplete = cells.every(c => s.blocks[c.key]);
            return (
              <div
                key={`${p.id}-${pIdx}`}
                className="border border-white/25 hover:border-[#E7C768]/60 p-6 rounded-3xl flex flex-col justify-between hover:shadow-2xl transition-all bg-transparent backdrop-blur-2xl space-y-4"
              >
                <div className="space-y-3">
                  <div className="flex flex-wrap justify-between items-center gap-2 text-sm text-white">
                    <span className="font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">
                      🏢 {p.companyName || "Компания"}
                    </span>
                    <span className="px-3 py-1 rounded-full text-sm font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] text-[#17344F] shadow-sm">
                      {isAllComplete ? "Настроена" : "В процессе"}
                    </span>
                  </div>

                  <h3 className="text-lg font-bold text-white leading-tight">{p.roleName || "Без названия"}</h3>

                  {(() => {
                    const iLim = Number((p as any).interviewLimit || 0);
                    const iUsed = Number((p as any).interviewUsed || 0);
                    const iLeft = Math.max(0, iLim - iUsed);
                    return (
                      <button
                        type="button"
                        onClick={openTariff}
                        title="Перейти к тарифам"
                        className="w-full text-left text-sm px-3.5 py-2.5 rounded-2xl border border-white/25 hover:border-[#E7C768]/60 flex flex-wrap items-center gap-2 transition bg-transparent backdrop-blur-xl text-white cursor-pointer"
                      >
                        <Users2 className="w-4 h-4 text-[#E7C768] shrink-0" />
                        <span>Лимит интервью: <strong className="text-white font-bold">{iLeft}</strong> из <strong className="text-white font-bold">{iLim}</strong></span>
                        <span className="ml-auto text-white/85 text-sm">использовано {iUsed}</span>
                      </button>
                    );
                  })()}

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {cells.map(c => {
                      const ok = s.blocks[c.key];
                      return (
                        <div
                          key={c.key}
                          className={`p-2.5 rounded-2xl border text-center transition bg-transparent backdrop-blur-xl ${
                            ok ? "border-[#E7C768]/60 text-white" : "border-white/25 text-white/85"
                          }`}
                        >
                          <div className="text-sm flex items-center justify-center gap-1.5">
                            {ok ? <CheckCircle2 className="w-4 h-4 text-[#E7C768] shrink-0" /> : <AlertCircle className="w-4 h-4 text-white/60 shrink-0" />}
                            <span className="font-bold bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent">{c.label}</span>
                          </div>
                          <div className="text-sm text-white mt-1">
                            {ok ? "Готово" : "Не заполнено"}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onOpen(p.id)}
                  className="w-full cursor-pointer bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] hover:brightness-105 text-[#17344F] font-bold text-sm py-2.5 px-4 rounded-2xl flex items-center justify-center gap-2 transition shadow-lg active:scale-95"
                >
                  <Pencil className="w-4 h-4 text-[#17344F]" />
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