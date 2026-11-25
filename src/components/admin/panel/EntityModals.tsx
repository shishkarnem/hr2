import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2 } from "lucide-react";
import { dbClient } from "@/lib/dbClient";
import DetailsModal from "@/components/admin/DetailsModal";
import { ClientLimitsEditor } from "./ClientLimitsEditor";
import { EntityKind, EntityLink, OMIT_KEYS, RU_LABELS } from "./adminConfig";
import { ADMIN_PAGE_SIZE, InfiniteScrollTrigger } from "./PaginationControls";

export function EntityModal({
  entity,
  setToast,
  onClose,
}: {
  entity: { kind: EntityKind; id: string };
  setToast: (t: any) => void;
  onClose: () => void;
}) {
  const [row, setRow] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const table =
    entity.kind === "employer" ? "employers" : entity.kind === "company" ? "companies" : "projects";

  const load = async () => {
    setLoading(true);
    let q: any;
    if (entity.kind === "employer") {
      const { data } = await dbClient.rpc("admin_list_employers" as any, { _id: entity.id });
      q = ((data as any[]) || [])[0] || null;
    } else {
      const { data } = await (dbClient as any)
        .from(table)
        .select("*")
        .eq("id", entity.id)
        .maybeSingle();
      q = data;
    }
    setRow(q);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity.kind, entity.id]);

  const title =
    entity.kind === "employer"
      ? `Клиент · ${row?.name || row?.email || ""}`
      : entity.kind === "company"
      ? `Компания · ${row?.name || ""}`
      : `Вакансия · ${row?.role_name || ""}`;

  if (loading) {
    const loader = (
      <div className="fixed inset-0 z-[900] bg-[#0F2438]/75 backdrop-blur-xl flex items-center justify-center">
        <Loader2 className="w-7 h-7 animate-spin text-[#E7C768]" />
      </div>
    );
    return typeof document !== "undefined" ? createPortal(loader, document.body) : loader;
  }

  return (
    <DetailsModal
      title={title}
      data={row}
      table={table}
      labels={RU_LABELS[table]}
      omitKeys={OMIT_KEYS[table]}
      onClose={onClose}
      onSaved={(updatedRow) => {
        if (updatedRow) setRow(updatedRow);
        load();
      }}
      extra={
        <>
          {entity.kind === "employer" && row && (
            <ClientLimitsEditor row={row} setToast={setToast} onChanged={load} />
          )}
          {entity.kind === "employer" && row && <ClientLinkedTabs employerId={row.id} />}
          {entity.kind === "company" && row && (
            <CompanyLinks companyId={row.id} ownerEmployerId={row.owner_employer_id} />
          )}
          {entity.kind === "project" && row && (
            <ProjectLinks employerId={row.employer_id} companyId={row.company_id} />
          )}
        </>
      }
    />
  );
}

function ClientLinkedTabs({ employerId }: { employerId: string }) {
  const [tab, setTab] = useState<"txs" | "companies" | "vacancies">("txs");
  const [txs, setTxs] = useState<any[]>([]);
  const [txTotal, setTxTotal] = useState(0);
  const [txHasMore, setTxHasMore] = useState(false);
  const [txLoadingMore, setTxLoadingMore] = useState(false);
  const [companies, setCompanies] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [projMap, setProjMap] = useState<Record<string, any>>({});
  const [coMap, setCoMap] = useState<Record<string, any>>({});
  const [candMap, setCandMap] = useState<Record<string, any>>({});

  const loadTxPage = async (offsetVal: number, append: boolean) => {
    if (append) setTxLoadingMore(true);
    const { data } = await dbClient.rpc("admin_transactions_page" as any, {
      _employer_id: employerId,
      _limit: ADMIN_PAGE_SIZE,
      _offset: offsetVal,
    });
    const list = Array.isArray((data as any)?.items) ? (data as any).items : [];
    const total = Number((data as any)?.total ?? list.length);
    const hasMore = Boolean((data as any)?.hasMore);
    setTxs((prev) => (append ? [...prev, ...list] : list));
    setTxTotal(total);
    setTxHasMore(hasMore);

    const candIds = Array.from(
      new Set(list.filter((x: any) => x.ref_table === "candidates" && x.ref_id).map((x: any) => x.ref_id))
    );
    if (candIds.length) {
      const { data: cs } = await (dbClient as any)
        .from("candidates")
        .select("id, public_id, full_name, email, project_id")
        .in("id", candIds);
      setCandMap((prev) => {
        const next = { ...prev };
        ((cs as any[]) || []).forEach((c) => {
          next[c.id] = c;
        });
        return next;
      });
    }
    setTxLoadingMore(false);
  };

  useEffect(() => {
    (async () => {
      const [co, pr] = await Promise.all([
        (dbClient as any)
          .from("companies")
          .select("id, name, public_id, status, is_published")
          .eq("owner_employer_id", employerId)
          .limit(50),
        (dbClient as any)
          .from("projects")
          .select("id, role_name, public_id, status, is_published, company_id, created_at")
          .eq("employer_id", employerId)
          .order("created_at", { ascending: false })
          .limit(50),
      ]);
      setCompanies(((co as any).data as any[]) || []);
      const ps = ((pr as any).data as any[]) || [];
      setProjects(ps);
      const pm: Record<string, any> = {};
      ps.forEach((p) => {
        pm[p.id] = p;
      });
      setProjMap(pm);
      const cm: Record<string, any> = {};
      (((co as any).data as any[]) || []).forEach((c) => {
        cm[c.id] = c;
      });
      setCoMap(cm);

      await loadTxPage(0, false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employerId]);

  return (
    <div className="mt-4 border-t border-white/15 pt-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
        {[
          { k: "txs", l: `Транзакции (${txTotal || txs.length})` },
          { k: "companies", l: `Компании (${companies.length})` },
          { k: "vacancies", l: `Вакансии (${projects.length})` },
        ].map((x) => (
          <button
            key={x.k}
            type="button"
            onClick={() => setTab(x.k as any)}
            className={`w-full px-3 py-2 rounded-xl text-sm font-bold transition cursor-pointer ${
              tab === x.k
                ? "bg-transparent text-[#F4EE8E] border border-[#E7C768]"
                : "bg-transparent text-white/85 border border-white/20 hover:border-white/45"
            }`}
          >
            {x.l}
          </button>
        ))}
      </div>

      {tab === "txs" && (
        <div className="max-h-80 overflow-y-auto bg-transparent backdrop-blur-md border border-white/20 rounded-2xl p-2 space-y-2">
          {txs.length === 0 ? (
            <div className="p-4 text-center text-sm text-slate-300">Нет транзакций</div>
          ) : (
            <>
              {txs.map((t) => {
                let target: React.ReactNode = t.note || "—";
                if (t.ref_table === "projects" && t.ref_id && projMap[t.ref_id]) {
                  target = (
                    <EntityLink kind="project" id={t.ref_id}>
                      Вакансия: {projMap[t.ref_id].role_name || `#${projMap[t.ref_id].public_id}`}
                    </EntityLink>
                  );
                } else if (t.ref_table === "candidates" && t.ref_id && candMap[t.ref_id]) {
                  const c = candMap[t.ref_id];
                  const proj = projMap[c.project_id];
                  target = (
                    <span className="break-words">
                      {c.full_name || c.email || `#${c.public_id}`}
                      {proj && (
                        <>
                          {" · "}
                          <EntityLink kind="project" id={proj.id}>
                            {proj.role_name}
                          </EntityLink>
                        </>
                      )}
                    </span>
                  );
                }
                return (
                  <div
                    key={t.id}
                    className="rounded-xl border border-white/15 bg-transparent p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-sm"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="text-white font-medium break-words">{target}</div>
                      <div className="text-sm text-slate-300">
                        {t.created_at ? new Date(t.created_at).toLocaleString() : ""} · {t.type}
                      </div>
                    </div>
                    <div className="font-mono font-bold text-[#E7C768] text-sm shrink-0">
                      {t.amount_rr} RR
                    </div>
                  </div>
                );
              })}
              <InfiniteScrollTrigger
                hasMore={txHasMore}
                loading={txLoadingMore}
                loadedCount={txs.length}
                total={txTotal}
                onLoadMore={() => loadTxPage(txs.length, true)}
                compact
              />
            </>
          )}
        </div>
      )}

      {tab === "companies" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {companies.length === 0 && (
            <div className="col-span-full text-center py-6 text-slate-300 text-sm">Нет компаний</div>
          )}
          {companies.map((c) => (
            <div key={c.id} className="bg-transparent border border-white/20 rounded-xl p-3">
              <EntityLink kind="company" id={c.id}>
                <span className="font-bold">{c.name || `Компания #${c.public_id}`}</span>
              </EntityLink>
              <div className="text-sm text-slate-300 font-mono mt-1">
                #{c.public_id} · {c.is_published ? "опубл." : c.status}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "vacancies" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {projects.length === 0 && (
            <div className="col-span-full text-center py-6 text-slate-300 text-sm">Нет вакансий</div>
          )}
          {projects.map((p, pIdx) => (
            <div key={`${p.id}-${pIdx}`} className="bg-transparent border border-white/20 rounded-xl p-3">
              <EntityLink kind="project" id={p.id}>
                <span className="font-bold">{p.role_name || `Вакансия #${p.public_id}`}</span>
              </EntityLink>
              <div className="text-sm text-slate-300 mt-1 break-words">
                #{p.public_id} · {p.is_published ? "опубл." : p.status}
                {coMap[p.company_id] && (
                  <>
                    {" · "}
                    <EntityLink kind="company" id={p.company_id}>
                      {coMap[p.company_id].name}
                    </EntityLink>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CompanyLinks({
  companyId,
  ownerEmployerId,
}: {
  companyId: string;
  ownerEmployerId?: string | null;
}) {
  const [projects, setProjects] = useState<any[]>([]);
  useEffect(() => {
    (async () => {
      const { data } = await (dbClient as any)
        .from("projects")
        .select("id, role_name, public_id, status, is_published")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });
      setProjects((data as any[]) || []);
    })();
  }, [companyId]);

  return (
    <div className="mt-4 border-t border-white/15 pt-4 space-y-3">
      {ownerEmployerId && (
        <div className="text-sm text-slate-200 break-words">
          Владелец:{" "}
          <EntityLink kind="employer" id={ownerEmployerId}>
            открыть карточку клиента →
          </EntityLink>
        </div>
      )}
      <div>
        <div className="text-sm font-bold text-[#E7C768] mb-2">
          Вакансии этой компании ({projects.length})
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {projects.map((p, pIdx) => (
            <div key={`${p.id}-${pIdx}`} className="bg-transparent border border-white/20 rounded-xl p-3">
              <EntityLink kind="project" id={p.id}>
                <span className="font-bold">{p.role_name || `#${p.public_id}`}</span>
              </EntityLink>
              <div className="text-sm text-slate-300 mt-1">
                #{p.public_id} · {p.is_published ? "опубл." : p.status}
              </div>
            </div>
          ))}
          {projects.length === 0 && (
            <div className="text-sm text-slate-300 col-span-full">Нет вакансий</div>
          )}
        </div>
      </div>
    </div>
  );
}

function ProjectLinks({
  employerId,
  companyId,
}: {
  employerId?: string | null;
  companyId?: string | null;
}) {
  const [emp, setEmp] = useState<any | null>(null);
  const [co, setCo] = useState<any | null>(null);
  useEffect(() => {
    (async () => {
      if (employerId) {
        const { data } = await (dbClient as any)
          .from("employers")
          .select("id, name, email, public_id")
          .eq("id", employerId)
          .maybeSingle();
        setEmp(data);
      }
      if (companyId) {
        const { data } = await (dbClient as any)
          .from("companies")
          .select("id, name, public_id")
          .eq("id", companyId)
          .maybeSingle();
        setCo(data);
      }
    })();
  }, [employerId, companyId]);

  return (
    <div className="mt-4 border-t border-white/15 pt-4 space-y-2 text-sm">
      {emp && (
        <div className="break-words">
          Клиент: <EntityLink kind="employer" id={emp.id}>{emp.name || emp.email}</EntityLink>
        </div>
      )}
      {co && (
        <div className="break-words">
          Компания: <EntityLink kind="company" id={co.id}>{co.name}</EntityLink>
        </div>
      )}
    </div>
  );
}
