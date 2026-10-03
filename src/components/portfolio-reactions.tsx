"use client";
import { useEffect, useState } from "react";
import type { PortfolioReaction } from "@/lib/portfolio/types";
type State = { counts: Record<PortfolioReaction, number>; mine: PortfolioReaction[] };
export function PortfolioReactions({ id, slug, compact = false }: { id: string; slug: string; compact?: boolean }) {
  const [state, setState] = useState<State>({ counts: { like: 0, impressive: 0 }, mine: [] });
  const [ready, setReady] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(""), [login, setLogin] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    async function refresh() {
      if (document.hidden) return;
      try { const response = await fetch(`/api/portfolio/${id}/reactions`, { cache: "no-store", signal: controller.signal }); if (response.ok) { setState(await response.json()); setReady(true); } } catch { /* Keep the last successful counts. */ }
    }
    void refresh(); const timer = setInterval(refresh, 45_000);
    return () => { clearInterval(timer); controller.abort(); };
  }, [id]);
  async function react(reaction: PortfolioReaction) {
    if (busy) return; setBusy(true); setError(""); setLogin(false);
    try {
      const response = await fetch(`/api/portfolio/${id}/reactions`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reaction, active: !state.mine.includes(reaction) }) });
      const result = await response.json();
      if (response.status === 401) { setLogin(true); return; }
      if (!response.ok) throw new Error(result.error || "Reaction could not be saved."); setState(result);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Please try again."); } finally { setBusy(false); }
  }
  return <div className={`portfolio-reactions${compact ? " compact" : ""}`}><div>{([['like', '♡ Like'], ['impressive', '✦ Impressive']] as const).map(([reaction, label]) => <button key={reaction} type="button" disabled={busy || !ready} aria-pressed={state.mine.includes(reaction)} onClick={() => void react(reaction)}>{label} <span>{ready ? state.counts[reaction] : "—"}</span></button>)}</div>{login ? <p><a href={`/login?next=${encodeURIComponent(`/work/${slug}`)}`}>Sign in to react</a></p> : null}{error ? <p role="alert">{error}</p> : null}</div>;
}
