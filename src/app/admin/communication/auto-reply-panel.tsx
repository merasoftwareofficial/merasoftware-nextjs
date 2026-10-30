"use client";

import { useCallback, useEffect, useState } from "react";
import type { JSONContent } from "@tiptap/core";
import { docHasContent, EmailEditor } from "@/app/admin/email-control/email-editor";
import { Loader } from "@/app/admin/email-control/loader";
import { phoneLabel } from "@/app/admin/whatsapp/whatsapp-panel";
import { formatIndiaDate } from "@/lib/date-time";
import s from "./broadcast.module.css";
import a from "./auto-reply.module.css";

type Row = { _id: string; phone: string | null; text: string; profileName?: string | null; deliveredAs?: "notify" | "append"; sentAt?: string; createdAt: string; status: string; outcome?: string; replyStatus?: string; adMarker?: { externalAdReply?: boolean } };
type SwitchKey = "recognise" | "sendReplies" | "addLeads";
type Status = {
  switches: Record<SwitchKey, boolean>;
  listening: boolean;
  message: string;
  minMessage: number;
  reply: JSONContent;
  detected: { rows: Row[]; total: number; needsAttention: number; repliesSent: number; repliesWaiting: number; newLeads: number };
};
async function api<T>(path: string, method = "GET", body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/auto-reply/${path}`, { method, signal, cache: "no-store", headers: { "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Auto Reply request failed.");
  return result.data;
}
const errorText = (error: unknown) => error instanceof Error ? error.message : "Request failed.";
const SWITCHES: { key: SwitchKey; title: string; hint: string }[] = [
  { key: "recognise", title: "Recognise messages", hint: "Looks for the ad message below in incoming chats. Off stops all of Auto Reply. Other WhatsApp messages are not affected." },
  { key: "sendReplies", title: "Send replies", hint: "Puts the reply below into the WhatsApp queue, where it waits its turn. Off also cancels replies still waiting." },
  { key: "addLeads", title: "Add to leads", hint: "Adds a new number to Leads with the status Inquiry. Filling in the name moves it to Contacted." },
];
const OUTCOME: Record<string, string> = {
  "lead-and-reply": "Added to leads · reply queued", "lead-only": "Added to leads", "reply-only": "Reply queued",
  "known-person": "Already known, nothing sent", "detected-only": "Recognised only", "switched-off": "Auto Reply was off",
};
const REPLY: Record<string, string> = { pending: "Reply waiting", sending: "Reply sending", sent: "Reply sent", failed: "Reply not sent", expired: "Reply expired", cancelled: "Reply cancelled", skipped: "Reply skipped" };

export function AutoReplyPanel({ active = true }: { active?: boolean }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [draft, setDraft] = useState<string | null>(null); // null = not being edited
  const [replyDraft, setReplyDraft] = useState<JSONContent | null>(null);
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
  function toggle(key: SwitchKey, title: string, on: boolean) {
    void action(async () => {
      const { cancelled } = await api<{ cancelled: number }>("switches", "POST", { [key]: on });
      setNotice(`${title} is ${on ? "On" : "Off"}.${cancelled ? ` ${cancelled} waiting ${cancelled === 1 ? "reply was" : "replies were"} cancelled.` : ""}`);
    });
  }
  const message = draft ?? status?.message ?? "";
  const reply = replyDraft ?? status?.reply;
  const recognise = !!status?.switches.recognise;
  const counts = status?.detected;
  return <section className={s.panel} aria-label="Auto Reply">
    {(error || loadError) && <p role="alert" className={s.error}>{error || loadError}</p>}
    {notice && <p role="status" className={s.notice}>{notice}</p>}
    {status && recognise && !status.listening && <p role="alert" className={s.error}>WhatsApp is not connected, so messages can&apos;t be recognised right now. Check WhatsApp Connection.</p>}

    <div className={a.switches}>
      {SWITCHES.map(({ key, title, hint }) => {
        const inactive = key !== "recognise" && !recognise;
        return <label key={key} className={a.switch} data-off={inactive || undefined}>
          <input type="checkbox" checked={!!status?.switches[key] && !inactive} disabled={busy || !status || inactive} onChange={event => toggle(key, title, event.target.checked)} />
          <span><strong>{title}</strong><small>{inactive ? "Turn on Recognise messages first." : hint}</small></span>
        </label>;
      })}
    </div>

    <label className={s.field}>Ad message
      <textarea className={a.message} aria-label="Ad message" rows={2} maxLength={1000} value={message} disabled={busy || !status} onChange={event => setDraft(event.target.value)} />
    </label>
    <p className={s.note}>Only the whole message is recognised. Capital letters, extra spaces and punctuation don&apos;t matter. Parts of it, or short messages like &quot;Hello&quot;, are not recognised.</p>
    <div className={s.actions}>
      <button type="button" disabled={busy || !status || draft === null || draft.trim() === status.message} onClick={() => void action(async () => {
        await api("message", "POST", { message: draft }); await refresh(); setDraft(null); setNotice("Ad message saved. It applies from the next message.");
      })}>{busy ? "Working…" : "Save ad message"}</button>
    </div>

    <div className={a.reply}>
      {reply ? <EmailEditor id="auto-reply-message" label="Reply" channel="whatsapp" value={reply} disabled={busy} onChange={setReplyDraft} /> : <Loader label="Loading the reply…" />}
    </div>
    <p className={s.note}>Goes once to each new number, through the WhatsApp queue. A saved change applies to the next person; a reply already waiting keeps its words.</p>
    <div className={s.actions}>
      <button type="button" disabled={busy || !replyDraft || !docHasContent(replyDraft)} onClick={() => void action(async () => {
        await api("reply", "POST", { doc: replyDraft }); await refresh(); setReplyDraft(null); setNotice("Reply saved. It applies from the next person.");
      })}>{busy ? "Working…" : "Save reply"}</button>
    </div>

    <div className={a.detected}>
      <h3>Recognised messages{counts ? ` (${counts.total.toLocaleString("en-IN")})` : ""}</h3>
      {counts && counts.total > 0 && <p className={s.note}>{counts.newLeads.toLocaleString("en-IN")} added to leads · {counts.repliesSent.toLocaleString("en-IN")} {counts.repliesSent === 1 ? "reply" : "replies"} sent · {counts.repliesWaiting.toLocaleString("en-IN")} waiting</p>}
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
              {row.outcome && OUTCOME[row.outcome] && !row.replyStatus && <span>{OUTCOME[row.outcome]}</span>}
              {row.outcome?.startsWith("lead") && row.replyStatus && <span>Added to leads</span>}
              {row.replyStatus && REPLY[row.replyStatus] && <span>{REPLY[row.replyStatus]}</span>}
            </div>
          </li>)}</ul>}
    </div>
  </section>;
}
