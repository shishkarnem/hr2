// =============================================================================
// Shared score → color tone helper. Applies the agreed thresholds:
//   max=100: 0–39 red, 40–69 amber, 70–100 emerald
//   max=5:   0–1 red, 2–3 amber, 4–5 emerald
//   any other max: same percentage rule as max=100 (<40 / <70 / ≥70)
// Returns ready-to-use Tailwind class fragments so renderers stay consistent.
// =============================================================================

export type ToneLabel = "good" | "mid" | "bad" | "none";

export type Tone = {
  label: ToneLabel;
  text: string;       // colored text (badge / number)
  bg: string;         // colored background+border for the row/badge
  border: string;     // left-border accent for accordion summaries
  badge: string;      // small inline badge (bg + text + border)
};

const TONES: Record<ToneLabel, Omit<Tone, "label">> = {
  good: {
    text: "bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent font-extrabold",
    bg: "bg-transparent border border-[#E7C768]/40",
    border: "border-l-[#E7C768]",
    badge: "bg-transparent text-[#E7C768] border border-[#E7C768]/50 font-bold",
  },
  mid: {
    text: "bg-gradient-to-r from-[#F4EE8E] via-[#E7C768] to-[#D99E41] bg-clip-text text-transparent font-extrabold",
    bg: "bg-transparent border border-[#E7C768]/30",
    border: "border-l-[#E7C768]/60",
    badge: "bg-transparent text-[#F4EE8E] border border-[#E7C768]/40 font-bold",
  },
  bad: {
    text: "text-white font-bold",
    bg: "bg-transparent border border-white/20",
    border: "border-l-white/30",
    badge: "bg-transparent text-white border border-white/20 font-bold",
  },
  none: {
    text: "text-slate-300",
    bg: "bg-transparent border border-white/10",
    border: "border-l-white/15",
    badge: "bg-transparent text-slate-300 border border-white/15",
  },
};

export function scoreTone(value: unknown, max: number = 100, passScore: number = 70): Tone {
  const n = value === null || value === undefined ? NaN : Number(value);
  if (!Number.isFinite(n)) return { label: "none", ...TONES.none };

  // Hand-coded 0–5 buckets so 3/5 stays amber instead of green.
  if (max === 5) {
    const r = Math.max(0, Math.min(5, n));
    const label: ToneLabel = r <= 1 ? "bad" : r <= 3 ? "mid" : "good";
    return { label, ...TONES[label] };
  }

  const pct = max === 100 ? n : (n / max) * 100;
  const goodThreshold = passScore;
  const midThreshold = Math.round(passScore * 0.7);
  const label: ToneLabel = pct >= goodThreshold ? "good" : pct >= midThreshold ? "mid" : "bad";
  return { label, ...TONES[label] };
}

/** Format the score for a small badge. Returns "—" when value is missing. */
export function formatScore(value: unknown, max: number = 100): string {
  const n = value === null || value === undefined ? NaN : Number(value);
  if (!Number.isFinite(n)) return "—";
  return `${Math.round(n)}/${max}`;
}
