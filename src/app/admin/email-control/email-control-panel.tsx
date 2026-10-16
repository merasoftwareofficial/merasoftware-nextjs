"use client";

import { formatIndiaDateTime } from "@/lib/date-time";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTask } from "@/components/loading/navigation";
import { useServerTime } from "@/components/use-server-time";
import { emailControlApi as api } from "@/lib/email-control-client";
import { EmailOutbox } from "./email-outbox";
import type { Application, EmailControlData, EmailDraft, EmailTemplate } from "@/lib/email-control-types";
import styles from "./email-control.module.css";

type TemplateEditor = Omit<EmailTemplate, "_id"> & { _id?: string };
const reason = (error: unknown) => error instanceof Error ? error.message : "Email request failed.";
export function EmailControlPanel({ initialApplication, canManagePortal }: { initialApplication: Application; canManagePortal: boolean }) {
  const [application, setApplication] = useState(initialApplication);
  const { track } = useTask();
  const request = useCallback(<T,>(path = "", method = "GET", body?: unknown, signal?: AbortSignal) => track(() => api<T>(application, path, method, body, signal)), [application, track]);
  const [data, setData] = useState<EmailControlData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editor, setEditor] = useState<TemplateEditor | null>(null);
  const [sample, setSample] = useState<{ subject: string; text: string } | null>(null);
  const [draft, setDraft] = useState<EmailDraft | null>(null);
  const [subject, setSubject] = useState("");
  const [text, setText] = useState("");
  const [templateId, setTemplateId] = useState("current");
  const [dialogError, setDialogError] = useState("");
  const [historyFilter, setHistoryFilter] = useState("all");
  const [observedAt, setObservedAt] = useState(0);
  const serverNow = useServerTime();
  const [revision, setRevision] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const generation = useRef(0);
  const load = useCallback(async (signal?: AbortSignal) => {
    const current = ++generation.current;
    try { const result = await request<EmailControlData>("", "GET", undefined, signal); if (current === generation.current) { setData(result); setObservedAt(result.serverNow); setRevision(value => value + 1); setError(""); } }
    catch (err) { if (!signal?.aborted && current === generation.current) setError(reason(err)); }
    finally { if (current === generation.current) setLoading(false); }
  }, [request]);
  useEffect(() => {
    const controller = new AbortController();
    const current = ++generation.current;
    // Initial data follows the fetch lifecycle. Interactive work below uses
    // the shared task loader, whose state changes start from user actions.
    api<EmailControlData>(application, "", "GET", undefined, controller.signal)
      .then(result => { if (current === generation.current) { setData(result); setObservedAt(result.serverNow); setError(""); } })
      .catch(err => { if (!controller.signal.aborted && current === generation.current) setError(reason(err)); })
      .finally(() => { if (!controller.signal.aborted && current === generation.current) setLoading(false); });
    return () => controller.abort();
  }, [application]);
  useEffect(() => {
    if (editor || draft) dialog.current?.showModal();
    else dialog.current?.close();
  }, [editor, draft]);
  function changeTab(next: Application) {
    if (busy || (next === "portal" && !canManagePortal)) return;
    generation.current++; setData(null); setLoading(true); setError(""); setApplication(next); setNotice(""); setHistoryFilter("all");
    const url = new URL(window.location.href); url.searchParams.set("tab", next); window.history.replaceState(null, "", url);
  }
  async function policy(event: string, mode: "review" | "off", defaultTemplate: string | null) {
    setBusy(true); setNotice(""); setError("");
    try { await request( `/policies/${event}`, "PUT", { mode, defaultTemplate }); await load(); setNotice("Email rule saved."); }
    catch (err) { setError(reason(err)); }
    finally { setBusy(false); }
  }
  function editTemplate(value: TemplateEditor) { setSample(null); setDialogError(""); setEditor(value); }
  async function saveTemplate(event: React.FormEvent) {
    event.preventDefault(); if (!editor || busy) return; setBusy(true); setDialogError("");
    try { await request( editor._id ? `/templates/${editor._id}` : "/templates", editor._id ? "PUT" : "POST", editor); setEditor(null); await load(); setNotice("Template saved. Choose it as the default for its action when ready."); }
    catch (err) { setDialogError(reason(err)); }
    finally { setBusy(false); }
  }
  async function previewTemplate() {
    if (!editor) return; setBusy(true); setDialogError("");
    try { setSample(await request( "/templates/preview", "POST", editor)); }
    catch (err) { setDialogError(reason(err)); }
    finally { setBusy(false); }
  }
  async function review(id: string) {
    setBusy(true); setError("");
    try {
      const value = await request<EmailDraft>( `/drafts/${id}`);
      setDraft(value); setSubject(value.subject); setText(value.text); setTemplateId("current"); setDialogError("");
    } catch (err) { setError(reason(err)); }
    finally { setBusy(false); }
  }
  async function chooseTemplate(id: string) {
    if (!draft || id === "current") { if (draft) { setSubject(draft.subject); setText(draft.text); setTemplateId(id); } return; }
    setBusy(true); setDialogError("");
    try {
      const value = await request<{ subject: string; text: string }>( `/drafts/${draft._id}/preview`, "POST", { templateId: id });
      setSubject(value.subject); setText(value.text); setTemplateId(id);
    } catch (err) { setDialogError(reason(err)); }
    finally { setBusy(false); }
  }
  async function decide(choice: "send" | "skip") {
    if (!draft || busy) return; setBusy(true); setDialogError("");
    try {
      await request( `/drafts/${draft._id}/decision`, "POST", { choice, subject, text, templateId });
      setDraft(null); await load(); setNotice(choice === "send" ? "Email sent." : "Email skipped. The original request is saved.");
    } catch (err) {
      setDialogError(reason(err));
      try {
        const current = await request<EmailDraft>(`/drafts/${draft._id}`);
        setDraft(current);
        if (current.status !== "pending") { setSubject(current.subject); setText(current.text); setTemplateId("current"); }
      } catch { /* Keep the reviewed content visible when the service is unavailable. */ }
      await load();
    }
    finally { setBusy(false); }
  }
  const drafts = data?.drafts.filter(row => ["pending", "failed", "sending"].includes(row.status)) || [];
  const status = (row: { status: string; expiresAt: string }) => ["pending", "failed", "sending"].includes(row.status) && Date.parse(row.expiresAt) <= (serverNow ?? observedAt) ? "expired" : row.status;
  const history = data?.history.filter(row => historyFilter === "all" || status(row) === historyFilter) || [];
  const off = draft && data?.policies.find(row => row.event === draft.event)?.mode === "off";
  return <div className={styles.panel}>
    <div className={styles.tabs} role="tablist" aria-label="Email application">
      <button role="tab" aria-selected={application === "website"} disabled={busy} onClick={() => changeTab("website")}>Website</button>
      <button role="tab" aria-selected={application === "portal"} disabled={busy || !canManagePortal} onClick={() => changeTab("portal")}>Portal</button>
    </div>
    {!canManagePortal && <p className={styles.muted}>Portal email management requires portal admin access.</p>}
    <div className={styles.banner}><strong>Every email needs approval.</strong> Automatic sending, email schedules and reminders remain disabled. Public website requests arrive here for review.</div>
    <div className={styles.toolbar}><h2>{application === "website" ? "Website" : "Portal"} email rules</h2><button className="admin-action" disabled={busy || loading} onClick={() => { setLoading(true); void load(); }}>Refresh</button></div>
    {notice && <p className={styles.notice} role="status">{notice}</p>}
    {error && <p className={styles.error} role="alert">{error} <button onClick={() => void load()} disabled={busy}>Retry</button></p>}
    {loading && !data && <p role="status">Loading email settings…</p>}
    {data && <>
      <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Section / action</th><th>Sending rule</th><th>Default template</th><th>Templates</th></tr></thead><tbody>
        {data.events.map(event => {
          const current = data.policies.find(row => row.event === event.key) || { mode: "review" as const, defaultTemplate: null };
          const templates = data.templates.filter(row => row.event === event.key);
          return <tr key={event.key}><td><small>{event.section}</small><strong>{event.label}</strong></td>
            <td><select aria-label={`${event.label} sending rule`} disabled={busy || loading} value={current.mode} onChange={e => void policy(event.key, e.target.value as "off" | "review", current.defaultTemplate)}><option value="review">Ask before sending</option><option value="off">Off</option></select></td>
            <td><select aria-label={`${event.label} default template`} disabled={busy || loading} value={current.defaultTemplate || ""} onChange={e => void policy(event.key, current.mode, e.target.value || null)}><option value="">Built-in action template</option>{templates.map(row => <option value={row._id} key={row._id}>{row.name}</option>)}</select></td>
            <td><div className={styles.actions}><button disabled={busy} onClick={() => editTemplate({ event: event.key, name: "", subject: "{{subject}}", text: "{{message}}" })}>Add template</button>{templates.map(row => <button disabled={busy} key={row._id} onClick={() => editTemplate(row)}>Edit {row.name}</button>)}</div></td>
          </tr>;
        })}
      </tbody></table></div>
      {application === "website" && <p className={styles.muted}>Subscription confirmation and manage-link requests are connected. Contact and callback templates are reserved for their future submission integrations.</p>}
      <section className={styles.section}><h2>Pending email review</h2><p className={styles.muted}>Drafts expire after 23 hours. Delivery failures can be retried without repeating the original action.</p>
        {!drafts.length && <p>No emails awaiting review.</p>}
        {drafts.map(row => <article className={styles.card} key={row._id}><div><strong>{row.subject}</strong><p>{row.to.join(", ")}</p><small>{data.events.find(event => event.key === row.event)?.label} · {row.status}</small>{row.failure && <p className={styles.error}>{row.failure}</p>}</div><button className="admin-action" disabled={busy || row.status === "sending"} onClick={() => void review(row._id)}>{row.status === "failed" ? "Review / retry" : row.status === "sending" ? "Sending…" : "Review email"}</button></article>)}
      </section>
      <EmailOutbox key={application} application={application} revision={revision} />
      <section className={styles.section}><div className={styles.toolbar}><h2>Email history</h2><label>Status <select value={historyFilter} onChange={e => setHistoryFilter(e.target.value)}>{["all", "pending", "sent", "skipped", "failed", "expired"].map(value => <option key={value}>{value}</option>)}</select></label></div><p className={styles.muted}>Decision records remain available after draft content expires. Showing the latest 100 records.</p>
        {!history.length && <p>No matching email records.</p>}
        {history.map(row => <article className={styles.card} key={row._id}><div><strong>{row.subject}</strong><p>{row.to.join(", ")}</p><small>{status(row)} · {row.status === "sent" ? `Sent: ${row.sentAt ? formatIndiaDateTime(row.sentAt) : "Time unavailable"}` : `Updated: ${formatIndiaDateTime(row.updatedAt)}`}</small></div></article>)}
      </section>
    </>}
    <dialog ref={dialog} className={styles.dialog} aria-labelledby="email-dialog-title" onCancel={event => { event.preventDefault(); if (!busy) { if (draft) void decide("skip"); else setEditor(null); } }}>
      {editor && <form onSubmit={saveTemplate}>
        <h2 id="email-dialog-title">{editor._id ? "Edit" : "New"} email template</h2><p>{data?.events.find(event => event.key === editor.event)?.label}</p>
        <p className={styles.muted}>Variables: {"{{subject}}"} and {"{{message}}"}. Lead welcome also supports {"{{name}}"}. Required subscription links are always preserved.</p>
        <label htmlFor="template-name">Template name</label><input id="template-name" required maxLength={100} disabled={busy} value={editor.name} onChange={e => setEditor({ ...editor, name: e.target.value })} />
        <label htmlFor="template-subject">Subject</label><input id="template-subject" required maxLength={300} disabled={busy} value={editor.subject} onChange={e => setEditor({ ...editor, subject: e.target.value })} />
        <label htmlFor="template-message">Message</label><textarea id="template-message" required rows={10} maxLength={100000} disabled={busy} value={editor.text} onChange={e => setEditor({ ...editor, text: e.target.value })} />
        {sample && <div className={styles.sample}><strong>{sample.subject}</strong><pre>{sample.text}</pre></div>}
        {dialogError && <p className={styles.error} role="alert">{dialogError}</p>}
        <div className={styles.actions}><button type="button" disabled={busy} onClick={() => void previewTemplate()}>Preview sample</button><button type="button" disabled={busy} onClick={() => setEditor(null)}>Cancel</button><button className="admin-button" disabled={busy} type="submit">{busy ? "Working…" : "Save template"}</button></div>
      </form>}
      {draft && <div>
        <h2 id="email-dialog-title">Review email</h2><p><strong>To:</strong> {draft.to.join(", ")}</p><p>The request is saved. Choose whether to send this email.</p>
        {!!draft.attachments?.length && <p>Attachments: {draft.attachments.map(row => row.filename).join(", ")}</p>}
        {draft.status === "failed" && <p className={styles.banner}>A retry uses the originally reviewed content and the same delivery key to prevent duplicates.</p>}
        <label htmlFor="review-template">Template</label><select id="review-template" value={templateId} disabled={busy || draft.status !== "pending"} onChange={e => void chooseTemplate(e.target.value)}><option value="current">Current draft</option><option value="">Built-in action template</option>{data?.templates.filter(row => row.event === draft.event).map(row => <option key={row._id} value={row._id}>{row.name}</option>)}</select>
        <label htmlFor="review-subject">Subject</label><input id="review-subject" maxLength={300} value={subject} disabled={busy || draft.status !== "pending"} onChange={e => setSubject(e.target.value)} />
        <label htmlFor="review-message">Message</label><textarea id="review-message" rows={12} maxLength={100000} value={text} disabled={busy || draft.status !== "pending"} onChange={e => setText(e.target.value)} />
        {!!draft.requiredLinks?.length && <details><summary>Required links (preserved when sending)</summary>{draft.requiredLinks.map(link => <p className={styles.link} key={link}>{link}</p>)}</details>}
        <p className={styles.muted}>Edits apply to this email only. Reusable templates are changed separately.</p>
        {off && <p className={styles.error}>Email for this action is Off. You can skip this draft or change its rule.</p>}
        {dialogError && <p className={styles.error} role="alert">{dialogError}</p>}
        <div className={styles.actions}><button disabled={busy} onClick={() => void decide("skip")}>Don’t Send Mail</button><button className="admin-button" disabled={busy || !!off || !subject.trim() || !text.trim()} onClick={() => void decide("send")}>{busy ? "Working…" : "Send Mail"}</button></div>
      </div>}
    </dialog>
  </div>;
}
