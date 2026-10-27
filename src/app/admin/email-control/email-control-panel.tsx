"use client";

import { formatIndiaDateTime } from "@/lib/date-time";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTask } from "@/components/loading/navigation";
import { useServerTime } from "@/components/use-server-time";
import { emailControlApi as api } from "@/lib/email-control-client";
import { EmailOutbox } from "./email-outbox";
import type { JSONContent } from "@tiptap/core";
import { chipDoc, docHasContent, EmailEditor, EmailPreview, plainDoc } from "./email-editor";
import type { Application, EmailControlData, EmailDraft, EmailPolicyMode, EmailTemplate, TemplateOption } from "@/lib/email-control-types";
import styles from "./email-control.module.css";
import { WhatsappText } from "../whatsapp/whatsapp-text";

type TemplateEditor = { _id?: string; event: string; name: string; system?: boolean; doc: JSONContent; subjectDoc: JSONContent };
const toEditor = (row: EmailTemplate): TemplateEditor => ({ _id: row._id, event: row.event, name: row.name, system: row.system, doc: row.doc ?? plainDoc(row.text), subjectDoc: row.subjectDoc ?? plainDoc(row.subject) });
const templateBody = (value: TemplateEditor) => ({ event: value.event, name: value.name, doc: value.doc, subjectDoc: value.subjectDoc });
const reason = (error: unknown) => error instanceof Error ? error.message : "Email request failed.";
const optionLabel = (option: { name: string; system?: boolean; id?: string; _id?: string }) => option.system && (option.id || option._id) ? `${option.name} (built-in)` : option.name;
const MODE_LABEL: Record<EmailPolicyMode, string> = { review: "Asks before sending", auto: "Sends automatically", off: "Off" };
type CatalogEvent = EmailControlData["events"][number];
// Customer-started and server-sent mail is On/Off; every other action asks the admin first.
const isAutomatic = (event: CatalogEvent) => event.trigger === "customer" || event.trigger === "system";
const groupOf = (event: CatalogEvent) => event.group || event.label;
const matches = (event: CatalogEvent, query: string) => !query || [event.label, groupOf(event), event.section].some(text => text.toLowerCase().includes(query));
/** Communication shows each half on its own page: "actions" = rules and templates, "activity" = review, Outbox and history. */
export type EmailView = "all" | "actions" | "activity";
/** `query` filters the actions by name; `onReviewCount` reports how many mails wait for review (Communication's status bar). */
export function EmailControlPanel({ initialApplication, canManagePortal, view = "all", showTabs = true, query = "", onReviewCount }: { initialApplication: Application; canManagePortal: boolean; view?: EmailView; showTabs?: boolean; query?: string; onReviewCount?: (count: number) => void }) {
  const [application, setApplication] = useState(initialApplication);
  const { track } = useTask();
  const request = useCallback(<T,>(path = "", method = "GET", body?: unknown, signal?: AbortSignal) => track(() => api<T>(application, path, method, body, signal)), [application, track]);
  const [data, setData] = useState<EmailControlData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editor, setEditor] = useState<TemplateEditor | null>(null);
  const [sample, setSample] = useState<{ subject: string; html: string; whatsapp?: string } | null>(null);
  const [previewHtml, setPreviewHtml] = useState("");
  const [draft, setDraft] = useState<EmailDraft | null>(null);
  const [subject, setSubject] = useState("");
  const [reviewDoc, setReviewDoc] = useState<JSONContent | undefined>(undefined);
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
    // The open tab again: nothing to change (clearing the data here would never reload it).
    if (busy || next === application || (next === "portal" && !canManagePortal)) return;
    generation.current++; setData(null); setLoading(true); setError(""); setApplication(next); setNotice(""); setHistoryFilter("all");
    const url = new URL(window.location.href); url.searchParams.set("tab", next); window.history.replaceState(null, "", url);
  }
  async function policy(event: string, mode: EmailPolicyMode, defaultTemplate: string | null) {
    setBusy(true); setNotice(""); setError("");
    try { await request( `/policies/${event}`, "PUT", { mode, defaultTemplate }); await load(); setNotice("Email rule saved."); }
    catch (err) { setError(reason(err)); }
    finally { setBusy(false); }
  }
  function editTemplate(value: TemplateEditor) { setSample(null); setDialogError(""); setEditor(value); }
  // A new template starts from the action's built-in wording when it has one.
  function newTemplate(event: string) {
    const system = data?.templates.find(row => row.event === event && row.system);
    editTemplate(system ? { ...toEditor(system), _id: undefined, system: false, name: "" } : { event, name: "", subjectDoc: chipDoc("subject"), doc: chipDoc("message") });
  }
  // Review choices for the table, matching the server's draft templateOptions.
  function templateChoices(event: string): TemplateOption[] {
    const options = (data?.templates || []).filter(row => row.event === event).map(row => ({ id: row._id, name: row.name, system: !!row.system }));
    return data?.catalog?.[event]?.system ? options : [{ id: "", name: "Built-in action template", system: true }, ...options];
  }
  async function saveTemplate(event: React.FormEvent) {
    event.preventDefault(); if (!editor || busy) return; setBusy(true); setDialogError("");
    try { await request( editor._id ? `/templates/${editor._id}` : "/templates", editor._id ? "PUT" : "POST", templateBody(editor)); setEditor(null); await load(); setNotice("Template saved. Choose it as the default for its action when ready."); }
    catch (err) { setDialogError(reason(err)); }
    finally { setBusy(false); }
  }
  async function previewTemplate() {
    if (!editor) return; setBusy(true); setDialogError("");
    try { setSample(await request( "/templates/preview", "POST", templateBody(editor))); }
    catch (err) { setDialogError(reason(err)); }
    finally { setBusy(false); }
  }
  async function resetTemplate() {
    if (!editor?._id || busy || !window.confirm("Replace this built-in template with its original wording?")) return;
    setBusy(true); setDialogError("");
    try { setEditor(toEditor(await request<EmailTemplate>(`/templates/${editor._id}/reset`, "POST", {}))); setSample(null); await load(); setNotice("Built-in template restored to its original wording."); }
    catch (err) { setDialogError(reason(err)); }
    finally { setBusy(false); }
  }
  async function review(id: string) {
    setBusy(true); setError("");
    try {
      const value = await request<EmailDraft>( `/drafts/${id}`);
      setDraft(value); setSubject(value.subject); setReviewDoc(value.doc ?? plainDoc(value.text)); setTemplateId("current"); setPreviewHtml(value.html || ""); setDialogError("");
    } catch (err) { setError(reason(err)); }
    finally { setBusy(false); }
  }
  async function chooseTemplate(id: string) {
    if (!draft || id === "current") { if (draft) { setSubject(draft.subject); setReviewDoc(draft.doc ?? plainDoc(draft.text)); setTemplateId(id); setPreviewHtml(draft.html || ""); } return; }
    setBusy(true); setDialogError("");
    try {
      const value = await request<{ subject: string; text: string; doc?: JSONContent; html: string }>( `/drafts/${draft._id}/preview`, "POST", { templateId: id });
      setSubject(value.subject); setReviewDoc(value.doc ?? plainDoc(value.text)); setTemplateId(id); setPreviewHtml(value.html);
    } catch (err) { setDialogError(reason(err)); }
    finally { setBusy(false); }
  }
  async function previewEdits() {
    if (!draft || busy) return; setBusy(true); setDialogError("");
    try { setPreviewHtml((await request<{ html: string }>(`/drafts/${draft._id}/preview`, "POST", { subject, doc: reviewDoc })).html); }
    catch (err) { setDialogError(reason(err)); }
    finally { setBusy(false); }
  }
  async function decide(choice: "send" | "skip") {
    if (!draft || busy) return; setBusy(true); setDialogError("");
    try {
      await request( `/drafts/${draft._id}/decision`, "POST", { choice, subject, doc: reviewDoc, templateId });
      setDraft(null); await load(); setNotice(choice === "send" ? "Email sent." : "Email skipped. The original request is saved.");
    } catch (err) {
      setDialogError(reason(err));
      try {
        const current = await request<EmailDraft>(`/drafts/${draft._id}`);
        setDraft(current);
        if (current.status !== "pending") { setSubject(current.subject); setReviewDoc(current.doc ?? plainDoc(current.text)); setTemplateId("current"); }
      } catch { /* Keep the reviewed content visible when the service is unavailable. */ }
      await load();
    }
    finally { setBusy(false); }
  }
  const drafts = data?.drafts.filter(row => ["pending", "failed", "sending"].includes(row.status)) || [];
  const status = (row: { status: string; expiresAt: string }) => ["pending", "failed", "sending"].includes(row.status) && Date.parse(row.expiresAt) <= (serverNow ?? observedAt) ? "expired" : row.status;
  const history = data?.history.filter(row => historyFilter === "all" || status(row) === historyFilter) || [];
  const off = draft && data?.policies.find(row => row.event === draft.event)?.mode === "off";
  const reviewCount = data ? drafts.length : null;
  useEffect(() => { if (reviewCount !== null) onReviewCount?.(reviewCount); }, [reviewCount, onReviewCount]);
  // No saved rule: server-sent mail is On, customer-started mail Off until an admin turns it on, admin actions ask.
  function policyFor(event: CatalogEvent) {
    return data?.policies.find(row => row.event === event.key) || { mode: event.trigger === "system" ? "auto" as const : isAutomatic(event) ? "off" as const : "review" as const, defaultTemplate: null };
  }
  function rulesTable(events: CatalogEvent[]) {
    if (!data) return null;
    return <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Mail</th><th>Sending rule</th><th>Default template</th><th>Templates</th></tr></thead><tbody>
      {events.map(event => {
        const customer = isAutomatic(event);
        const current = policyFor(event);
        const templates = data.templates.filter(row => row.event === event.key);
        const system = templates.find(row => row.system);
        return <tr key={event.key}><td><small>{customer ? "Automatic" : "After an admin action"}</small><strong>{event.label}</strong></td>
          <td>{customer
            ? <select aria-label={`${event.label} mail`} disabled={busy || loading} value={current.mode === "auto" ? "auto" : "off"} onChange={e => void policy(event.key, e.target.value as EmailPolicyMode, current.defaultTemplate)}><option value="auto">On — send automatically</option><option value="off">Off</option></select>
            : <select aria-label={`${event.label} sending rule`} disabled={busy || loading} value={current.mode} onChange={e => void policy(event.key, e.target.value as EmailPolicyMode, current.defaultTemplate)}><option value="review">Ask before sending</option><option value="off">Off</option></select>}</td>
          <td><select aria-label={`${event.label} default template`} disabled={busy || loading} value={current.defaultTemplate || system?._id || ""} onChange={e => void policy(event.key, current.mode, e.target.value || null)}>{templateChoices(event.key).map(row => <option value={row.id} key={row.id || "built-in"}>{optionLabel(row)}</option>)}</select></td>
          <td><div className={styles.actions}><button disabled={busy} onClick={() => newTemplate(event.key)}>Add template</button>{templates.map(row => <button disabled={busy} key={row._id} onClick={() => editTemplate(toEditor(row))}>Edit {optionLabel(row)}</button>)}</div></td>
        </tr>;
      })}
    </tbody></table></div>;
  }
  // One box per job (its customer and admin mails together), under the job's section.
  const search = query.trim().toLowerCase();
  const sections = new Map<string, Map<string, CatalogEvent[]>>();
  for (const event of data?.events.filter(row => matches(row, search)) || []) {
    const groups = sections.get(event.section) ?? new Map<string, CatalogEvent[]>();
    sections.set(event.section, groups.set(groupOf(event), [...(groups.get(groupOf(event)) ?? []), event]));
  }
  function groupSummary(events: CatalogEvent[]) {
    const modes = [...new Set(events.map(event => policyFor(event).mode))];
    return { rule: modes.length === 1 ? MODE_LABEL[modes[0]] : "Mixed rules", sends: modes.some(mode => mode !== "off") };
  }
  const editorCatalog = editor ? data?.catalog?.[editor.event] : undefined;
  const actions = view !== "activity", activity = view !== "actions";
  const appName = application === "website" ? "Website" : "Portal";
  return <div className={styles.panel}>
    {showTabs && <div className={styles.tabs} role="tablist" aria-label="Email application">
      <button role="tab" aria-selected={application === "website"} disabled={busy} onClick={() => changeTab("website")}>Website</button>
      <button role="tab" aria-selected={application === "portal"} disabled={busy || !canManagePortal} onClick={() => changeTab("portal")}>Portal</button>
    </div>}
    {showTabs && !canManagePortal && <p className={styles.muted}>Portal email management requires portal admin access.</p>}
    <div className={styles.toolbar}><h2>{appName} {view === "activity" ? "email review and history" : "email rules"}</h2><button className="admin-action" disabled={busy || loading} onClick={() => { setLoading(true); void load(); }}>Refresh</button></div>
    {notice && <p className={styles.notice} role="status">{notice}</p>}
    {error && <p className={styles.error} role="alert">{error} <button onClick={() => void load()} disabled={busy}>Retry</button></p>}
    {loading && !data && <p role="status">Loading email settings…</p>}
    {data && actions && <>
      {!sections.size && <p className={styles.muted}>{search ? `No ${appName.toLowerCase()} mail matches “${query.trim()}”.` : "No actions."}</p>}
      {[...sections].map(([section, groups]) => <section className={styles.mailSection} key={section} aria-label={`${appName} · ${section}`}>
        {sections.size > 1 && <h3>{section}</h3>}
        {[...groups].map(([group, events]) => {
          const summary = groupSummary(events);
          return <details className={styles.group} key={group} open={search ? true : undefined}>
            <summary><strong>{group}</strong><span className={styles.groupMeta}>{events.length} {events.length === 1 ? "mail" : "mails"} · {summary.rule}</span>
              <span className={summary.sends ? styles.channelOn : styles.channelOff}>{summary.sends ? "Email + WhatsApp" : "Nothing sent"}</span></summary>
            {rulesTable(events)}
          </details>;
        })}
      </section>)}
      {application === "website" && !search && <p className={styles.muted}>Contact and callback mails are ready for when those forms start sending.</p>}
      {application === "portal" && !search && <p className={styles.muted}>Offer payment reminders run only for saved agreements with reminder days set; their switch here can turn them off for everyone.</p>}
    </>}
    {data && activity && <>
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
        <h2 id="email-dialog-title">{editor._id ? "Edit" : "New"} email template</h2><p>{data?.events.find(event => event.key === editor.event)?.label}{editor.system ? " · built-in template" : ""}</p>
        <p className={styles.muted}>{editor.system ? "Changes apply to every new email of this action. Reset to original restores the wording it shipped with." : "Every email uses the Mera Software layout. Required links, such as subscription confirmation, are always preserved."}</p>
        <label htmlFor="template-name">Template name</label><input id="template-name" required maxLength={100} disabled={busy} value={editor.name} onChange={e => setEditor({ ...editor, name: e.target.value })} />
        <EmailEditor id="template-subject" label="Subject" singleLine disabled={busy} value={editor.subjectDoc} onChange={value => setEditor(current => current && { ...current, subjectDoc: value })} variables={editorCatalog?.variables} />
        <EmailEditor id="template-message" label="Message" disabled={busy} value={editor.doc} onChange={value => setEditor(current => current && { ...current, doc: value })} variables={editorCatalog?.variables} blocks={editorCatalog?.blocks} />
        {sample && <div className={styles.sample} role="region" aria-label="Sample email"><strong>{sample.subject}</strong><EmailPreview html={sample.html} /></div>}
        {sample?.whatsapp && <div className={styles.sample} role="region" aria-label="Sample WhatsApp message"><strong>WhatsApp message</strong><p className={styles.muted}>Sent after the email, with this same text.</p><WhatsappText text={sample.whatsapp} /></div>}
        {dialogError && <p className={styles.error} role="alert">{dialogError}</p>}
        <div className={styles.actions}><button type="button" disabled={busy} onClick={() => void previewTemplate()}>Preview sample</button>{editor.system && editor._id && <button type="button" disabled={busy} onClick={() => void resetTemplate()}>Reset to original</button>}<button type="button" disabled={busy} onClick={() => setEditor(null)}>Cancel</button><button className="admin-button" disabled={busy} type="submit">{busy ? "Working…" : "Save template"}</button></div>
      </form>}
      {draft && <div>
        <h2 id="email-dialog-title">Review email</h2><p><strong>To:</strong> {draft.to.join(", ")}</p><p>The request is saved. Choose whether to send this email.</p>
        {!!draft.attachments?.length && <p>Attachments: {draft.attachments.map(row => row.filename).join(", ")}</p>}
        {draft.status === "failed" && <p className={styles.banner}>A retry uses the originally reviewed content and the same delivery key to prevent duplicates.</p>}
        <label htmlFor="review-template">Template</label><select id="review-template" value={templateId} disabled={busy || draft.status !== "pending"} onChange={e => void chooseTemplate(e.target.value)}><option value="current">Current draft</option>{(draft.templateOptions || []).map(row => <option key={row.id || "built-in"} value={row.id}>{optionLabel(row)}</option>)}</select>
        <label htmlFor="review-subject">Subject</label><input id="review-subject" maxLength={300} value={subject} disabled={busy || draft.status !== "pending"} onChange={e => setSubject(e.target.value)} />
        <EmailEditor id="review-message" label="Message" value={reviewDoc} disabled={busy || draft.status !== "pending"} onChange={setReviewDoc} variables={draft.editorFields?.variables} blocks={draft.editorFields?.blocks} />
        {draft.status === "pending" && <div className={styles.actions}><button type="button" disabled={busy} onClick={() => void previewEdits()}>Update preview</button></div>}
        {previewHtml && <EmailPreview html={previewHtml} />}
        {!!draft.requiredLinks?.length && <details><summary>Required links (preserved when sending)</summary>{draft.requiredLinks.map(link => <p className={styles.link} key={link}>{link}</p>)}</details>}
        <p className={styles.muted}>Edits apply to this email only. Reusable templates are changed separately.</p>
        {off && <p className={styles.error}>Email for this action is Off. You can skip this draft or change its rule.</p>}
        {dialogError && <p className={styles.error} role="alert">{dialogError}</p>}
        <div className={styles.actions}><button disabled={busy} onClick={() => void decide("skip")}>Don’t Send Mail</button><button className="admin-button" disabled={busy || !!off || !subject.trim() || !docHasContent(reviewDoc)} onClick={() => void decide("send")}>{busy ? "Working…" : "Send Mail"}</button></div>
      </div>}
    </dialog>
  </div>;
}
