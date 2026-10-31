"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader } from "@/app/admin/email-control/loader";
import { phoneLabel } from "@/app/admin/whatsapp/whatsapp-panel";
import { formatIndiaDate } from "@/lib/date-time";
import s from "./broadcast.module.css";
import a from "./auto-reply.module.css";

type Reply = { _id: string; phone: string | null; name: string; lastReplyAt?: string; lastReplyText?: string };
type Status = { hours: number; minHours: number; maxHours: number; ignoredReplies: string[]; counts: Record<string, number>; needsDecision: Reply[] };
type Choice = "interested" | "dead" | "keep";
async function api<T>(path: string, method = "GET", body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/auto-reply/${path}`, { method, signal, cache: "no-store", headers: { "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Final Message request failed.");
  return result.data;
}
const errorText = (error: unknown) => error instanceof Error ? error.message : "Request failed.";
const COUNTS: [string[], string][] = [[["review", "queued"], "being sent"], [["waiting"], "waiting for a reply"], [["replied"], "replied"], [["dead"], "moved to Dead"], [["not-sent"], "not sent"], [["email-only"], "by email only"]];
const CHOICES: { id: Choice; label: string; done: string }[] = [
  { id: "interested", label: "Interested", done: "Moved to Neutral." },
  { id: "dead", label: "Mark Dead", done: "Moved to Dead." },
  { id: "keep", label: "Keep Negative", done: "Kept in Negative." },
];

// The wait, what doesn't count as a reply, and the replies waiting for the admin. The message is the "Final message" action in Email Templates, and goes from the portal's review popup.
export function FinalMessagePanel({ active = true }: { active?: boolean }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [draft, setDraft] = useState<string | null>(null); // null = not being edited
  const [ignoredDraft, setIgnoredDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const refresh = useCallback(async (signal?: AbortSignal) => {
    const next = await api<Status>("final-message", "GET", undefined, signal);
    if (!signal?.aborted) { setStatus(next); setLoadError(""); }
  }, []);
  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    const load = () => { if (document.visibilityState === "visible") refresh(controller.signal).catch(failure => { if (!controller.signal.aborted) setLoadError(errorText(failure)); }); };
    const first = setTimeout(load, 0), timer = setInterval(load, 5000);
    return () => { controller.abort(); clearTimeout(first); clearInterval(timer); };
  }, [active, refresh]);
  async function action(work: () => Promise<string>) {
    setBusy(true); setError(""); setNotice("");
    try { const done = await work(); await refresh(); setNotice(done); } catch (failure) { setError(errorText(failure)); }
    finally { setBusy(false); }
  }
  const saveTime = () => action(async () => {
    const { hours } = await api<{ hours: number }>("final-message/time", "POST", { hours: Number(draft) });
    setDraft(null);
    return `Saved. New final messages say ${hours} hours and wait ${hours} hours. Messages already sent keep their own time.`;
  });
  const saveIgnored = () => action(async () => {
    await api("final-message/ignored", "POST", { ignoredReplies: (ignoredDraft ?? "").split("\n") });
    setIgnoredDraft(null);
    return "List saved. It applies from the next message.";
  });
  const decide = (row: Reply, choice: (typeof CHOICES)[number]) => action(async () => {
    await api("final-message/decision", "POST", { id: row._id, choice: choice.id });
    return `${row.name || (row.phone ? phoneLabel(row.phone) : "This lead")}: ${choice.done}`;
  });
  const hours = draft ?? (status ? String(status.hours) : "");
  const savedIgnored = status ? status.ignoredReplies.join("\n") : "";
  const ignored = ignoredDraft ?? savedIgnored;
  const lines = status ? COUNTS.map(([keys, label]) => [keys.reduce((total, key) => total + (status.counts[key] || 0), 0), label] as const).filter(([count]) => count > 0) : [];
  return <section className={s.panel} aria-label="Final Message">
    {(error || loadError) && <p role="alert" className={s.error}>{error || loadError}</p>}
    {notice && <p role="status" className={s.notice}>{notice}</p>}

    <div className={a.detected}>
      <h3>Needs decision{status ? ` (${status.needsDecision.length.toLocaleString("en-IN")})` : ""}</h3>
      {lines.length > 0 && <p className={s.note}>{lines.map(([count, label]) => `${count.toLocaleString("en-IN")} ${label}`).join(" · ")}</p>}
      {!status ? <Loader label="Loading…" /> : !status.needsDecision.length ? <p className={s.note}>No replies waiting for you.</p>
        : <ul>{status.needsDecision.map(row => <li key={row._id}>
            <div className={a.who}>
              <strong>{row.name || (row.phone ? phoneLabel(row.phone) : "No name")}</strong>
              {row.name && row.phone && <span>{phoneLabel(row.phone)}</span>}
              {row.lastReplyAt && <time>{formatIndiaDate(row.lastReplyAt, { year: undefined, hour: "numeric", minute: "2-digit", hour12: true })}</time>}
            </div>
            <p>{row.lastReplyText || "Message"}</p>
            <div className={s.actions}>
              {CHOICES.map(choice => <button key={choice.id} type="button" disabled={busy} onClick={() => void decide(row, choice)}>{choice.label}</button>)}
            </div>
          </li>)}</ul>}
    </div>

    <label className={s.field}>Time limit, in hours
      <input className={a.message} aria-label="Time limit, in hours" type="number" min={status?.minHours ?? 1} max={status?.maxHours ?? 720} step={1} value={hours} disabled={busy || !status} onChange={event => setDraft(event.target.value)} />
    </label>
    <p className={s.note}>This one setting fills the Time limit in the message and sets how long the system waits. No reply in this time moves the lead to Dead.</p>
    <div className={s.actions}>
      <button type="button" disabled={busy || !status || draft === null || draft.trim() === String(status.hours)} onClick={() => void saveTime()}>{busy ? "Working…" : "Save time limit"}</button>
    </div>

    <label className={s.field}>Messages that don&apos;t count as a reply
      <textarea className={a.message} aria-label="Messages that don't count as a reply" rows={8} value={ignored} disabled={busy || !status} onChange={event => setIgnoredDraft(event.target.value)} />
    </label>
    <p className={s.note}>One on each line. The whole message must match; capital letters, punctuation and emojis don&apos;t matter, so &quot;OK 👍&quot; matches ok, but &quot;ok details bhejo&quot; is a real reply. Spelling must match. A message of only emojis and an emoji reaction never count. The wait goes on, and the message shows on the lead&apos;s timeline. Any other message, voice note or photo goes to Needs decision.</p>
    <div className={s.actions}>
      <button type="button" disabled={busy || !status || ignoredDraft === null || ignoredDraft === savedIgnored} onClick={() => void saveIgnored()}>{busy ? "Working…" : "Save list"}</button>
    </div>

    <p className={s.note}>You choose Send or Don&apos;t Send in a popup in the portal, when you mark a lead Negative. For leads already in Negative, use the Final message button on the portal&apos;s Leads page. To change the words, open Email Templates → Portal → Final message. Only WhatsApp and Both are followed: replies to email can&apos;t be read here. Every message goes through the WhatsApp queue.</p>
  </section>;
}
