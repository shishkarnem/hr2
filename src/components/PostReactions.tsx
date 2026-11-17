import React, { useEffect, useState } from "react";

const REACTIONS: { kind: string; emoji: string; label: string }[] = [
  { kind: "like",  emoji: "👍", label: "Нравится" },
  { kind: "heart", emoji: "❤️", label: "Любовь" },
  { kind: "fire",  emoji: "🔥", label: "Огонь" },
  { kind: "clap",  emoji: "👏", label: "Аплодисменты" },
  { kind: "wow",   emoji: "😮", label: "Удивление" },
];

type Target = { postId?: string; commentId?: string };

export default function PostReactions({ postId, commentId, userId, onRequireLogin }:
  Target & { userId: string | null; onRequireLogin?: () => void }) {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [mine, setMine] = useState<Set<string>>(new Set());

  const load = async () => {
    const targetId = postId || commentId;
    if (!targetId) return;
    try {
      const res = await fetch(`/api/posts/${targetId}/reactions`);
      const data = await res.json();
      const c: Record<string, number> = {};
      const m = new Set<string>();
      for (const r of (Array.isArray(data) ? data : [])) {
        if (commentId && r.comment_id !== commentId) continue;
        if (postId && !commentId && r.comment_id) continue;
        c[r.kind] = (c[r.kind] || 0) + 1;
        if (userId && r.user_id === userId) m.add(r.kind);
      }
      setCounts(c); setMine(m);
    } catch (e) {
      console.error("Failed to load reactions", e);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [postId, commentId, userId]);

  const toggle = async (kind: string) => {
    if (!userId) { onRequireLogin?.(); return; }
    const targetId = postId || commentId;
    if (!targetId) return;
    try {
      await fetch(`/api/posts/${targetId}/reactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, user_id: userId, comment_id: commentId || null }),
      });
      load();
    } catch (e) {
      console.error("Failed to toggle reaction", e);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {REACTIONS.map(r => {
        const active = mine.has(r.kind);
        const n = counts[r.kind] || 0;
        return (
          <button key={r.kind} type="button" title={r.label} onClick={() => toggle(r.kind)}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border transition ${
              active
                ? "bg-[#E7C768]/20 border-[#E7C768]/60 text-[#F4EE8E]"
                : "bg-white/5 border-white/10 text-slate-200 hover:bg-white/10"
            }`}>
            <span className="text-base leading-none">{r.emoji}</span>
            {n > 0 && <span className="tabular-nums">{n}</span>}
          </button>
        );
      })}
    </div>
  );
}