/**
 * Banner shown in candidate cabinet when employer made a hire decision.
 * Reads from `candidates` table via RLS (candidate token).
 */
import React, { useEffect, useState } from "react";
import { dbClient } from "@/lib/dbClient";
import { CheckCircle2, Clock, XCircle } from "lucide-react";

type State = {
  decision: "invited" | "rejected" | "review" | null;
  message: string | null;
  decided_at: string | null;
  company: string | null;
};

export default function HireDecisionBanner({ candidateId }: { candidateId: string | null | undefined }) {
  const [state, setState] = useState<State | null>(null);

  useEffect(() => {
    if (!candidateId) { setState(null); return; }
    let cancelled = false;
    (async () => {
      const { data, error } = await (dbClient as any)
        .from("candidates")
        .select("hire_decision,hire_message,hire_decided_at,company_id,companies(name)")
        .eq("id", candidateId)
        .maybeSingle();
      if (cancelled || error || !data) return;
      setState({
        decision: data.hire_decision ?? null,
        message: data.hire_message ?? null,
        decided_at: data.hire_decided_at ?? null,
        company: data?.companies?.name ?? null,
      });
    })();
    return () => { cancelled = true; };
  }, [candidateId]);

  if (!state || !state.decision) return null;

  const invited = state.decision === "invited";
  const review = state.decision === "review";
  return (
    <div className="section-card liquid-glass-card bg-transparent backdrop-blur-2xl border border-white/20 p-5 rounded-2xl mb-5 text-left shadow-2xl">
      <div className="flex items-start gap-3">
        {invited ? (
          <CheckCircle2 className="w-6 h-6 text-[#D4AF37] flex-shrink-0 mt-0.5" />
        ) : review ? (
          <Clock className="w-6 h-6 text-white/80 flex-shrink-0 mt-0.5" />
        ) : (
          <XCircle className="w-6 h-6 text-white/60 flex-shrink-0 mt-0.5" />
        )}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-transparent bg-clip-text bg-gradient-to-r from-[#F5E296] via-[#D4AF37] to-[#AA771C]">
            {invited
              ? `Вас пригласили на работу${state.company ? ` в «${state.company}»` : ""}!`
              : review
                ? `Ваша кандидатура на рассмотрении${state.company ? ` в «${state.company}»` : ""}`
              : `Решение по вашей кандидатуре${state.company ? ` от «${state.company}»` : ""}`}
          </div>
          {state.message && (
            <div className="mt-2 text-sm text-white/90 whitespace-pre-wrap leading-relaxed">
              {state.message}
            </div>
          )}
          {state.decided_at && (
            <div className="mt-2 text-sm text-white/50 font-mono">
              {new Date(state.decided_at).toLocaleString("ru-RU")}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}