"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader } from "@/app/admin/email-control/loader";
import { phoneLabel } from "@/app/admin/whatsapp/whatsapp-panel";
import { formatIndiaDate } from "@/lib/date-time";
import s from "./broadcast.module.css";
import a from "./auto-reply.module.css";

type Row = { _id: string; phone: string | null; text: string; profileName?: string | null; deliveredAs?: "notify" | "append"; sentAt?: string; createdAt: string; status: string; adMarker?: { externalAdReply?: boolean } };
type Status = {
  switches: { recognise: boolean; sendReplies: boolean; addLeads: boolean };
  listening: boolean;
  message: string;
  minMessage: number;
  detected: { rows: Row[]; total: number; needsAttention: number };
};
async function api<T>(path: string, method = "GET", body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/auto-reply/${path}`, { method, signal, cache: "no-store", headers: { "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Auto Reply request failed.");
  return result.data;
}
const errorText = (error: unknown) => error instanceof Error ? error.message : "Request failed.";
const NEXT_STEP = "Not available yet. This comes in a later step.";

export function AutoReplyPanel({ active = true }: { active?: boolean }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [draft, setDraft] = useState<string | null>(null); // null = not being edited
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState(""); // clears on the next good refresh; an action's error stays until the next action
  const refresh = useCallback(async (signal?: AbortSignal) => {
    const next = await api<Status>("status", "GET", undefined, signal);
    if (!signal?.aborted) { setStatus(next); setLoadError(""); }
  }, []);
  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    const load = () => { if (document.visibilityState === "visible") refresh(controller.signal).catch(failure => { if (!controller.signal.aborted) setLoadError(errorText(failure)); }); };
    const first = setTimeout(load, 0), timer = setInterval(load, 5000);
    return () => { controller.abort(); clearTimeout(first); clearInterval(timer); };
  }, [active, refresh]);
  async function action(work: () => Promise<void>) {
    setBusy(true); setError(""); setNotice("");
    try { await work(); await refresh(); } catch (failure) { setError(errorText(failure)); }
    finally { setBusy(false); }
  }
  const message = draft ?? status?.message ?? "";
  const recognise = !!status?.switches.recognise;
  return <section className={s.panel} aria-label="Auto Reply">
    {(error || loadError) && <p role="alert" className={s.error}>{error || loadError}</p>}
    {notice && <p role="status" className={s.notice}>{notice}</p>}
    {status && recognise && !status.listening && <p role="alert" className={s.error}>WhatsApp is not connected, so messages can&apos;t be recognised right now. Check WhatsApp Connection.</p>}

    <div className={a.switches}>
      <label className={a.switch}>
        <input type="checkbox" checked={recognise} disabled={busy || !status} onChange={event => { const on = event.target.checked; void action(async () => { await api("switches", "POST", { recognise: on }); setNotice(on ? "Recognising messages is On." : "Recognising messages is Off."); }); }} />
        <span><strong>Recognise messages</strong><small>Looks for the ad message below in incoming chats. Off stops all of Auto Reply. Other WhatsApp messages are not affected.</small></span>
      </label>
      <label className={a.switch} data-off="true">
        <input type="checkbox" checked={false} disabled />
        <span><strong>Send replies</strong><small>{NEXT_STEP}</small></span>
      </label>
      <label className={a.switch} data-off="true">
        <input type="checkbox" checked={false} disabled />
        <span><strong>Add to leads</strong><small>{NEXT_STEP}</small></span>
      </label>
    </div>

    <label className={s.field}>Ad message
      <textarea className={a.message} aria-label="Ad message" rows={2} maxLength={1000} value={message} disabled={busy || !status} onChange={event => setDraft(event.target.value)} />
    </label>
    <p className={s.note}>Only the whole message is recognised. Capital letters, extra spaces and punctuation don&apos;t matter. Parts of it, or short messages like &quot;Hello&quot;, are not recognised.</p>
    <div className={s.actions}>
      <button type="button" disabled={busy || !status || draft === null || draft.trim() === status.message} onClick={() => void action(async () => {
        await api("message", "POST", { message: draft }); setDraft(null); setNotice("Ad message saved. It applies from the next message.");
      })}>{busy ? "Working…" : "Save ad message"}</button>
    </div>

    <div className={a.detected}>
      <h3>Recognised messages{status ? ` (${status.detected.total.toLocaleString("en-IN")})` : ""}</h3>
      {!status ? <Loader label="Loading…" /> : !status.detected.rows.length ? <p className={s.note}>No messages recognised yet.</p>
        : <ul>{status.detected.rows.map(row => <li key={row._id}>
            <div className={a.who}>
              <strong>{row.phone ? phoneLabel(row.phone) : "Number not found"}</strong>
              {row.profileName && <span>{row.profileName}</span>}
              <time>{formatIndiaDate(row.sentAt || row.createdAt, { year: undefined, hour: "numeric", minute: "2-digit", hour12: true })}</time>
            </div>
            <p>{row.text}</p>
            <div className={a.tags}>
              <span>{row.adMarker?.externalAdReply ? "From an ad" : "Ad not shown by WhatsApp"}</span>
              {row.deliveredAs === "append" && <span>Arrived while the service was restarting</span>}
              {row.status === "needs-attention" && <span data-tone="warn">Needs attention</span>}
            </div>
          </li>)}</ul>}
    </div>
  </section>;
}
