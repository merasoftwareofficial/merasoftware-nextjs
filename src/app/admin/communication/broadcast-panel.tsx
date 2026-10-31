"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { JSONContent } from "@tiptap/core";
import type { TemplateVariable } from "@/lib/email-control-types";
import { EmailEditor, emptyDoc, docHasContent } from "@/app/admin/email-control/email-editor";
import { formatIndiaDate } from "@/lib/date-time";
import s from "./broadcast.module.css";

type Group = { id: string; label: string; count: number; total: number; excluded: { invalidPhone: number; duplicatePhone: number; noName: number; doNotDisturb?: number } };
type Catalog = { groups: Group[]; fields: TemplateVariable[]; jobsEnabled: boolean; stopped: string | null };
type Template = { _id: string; name: string; doc: JSONContent };
type Run = { id: string; audience: string; title: string; state: string; total: number; createdAt: string; counts: Record<string, number> };
async function api<T>(path: string, method = "GET", body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/broadcast/${path}`, { method, signal, cache: "no-store", headers: { "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Broadcast request failed.");
  return result.data;
}
const errorText = (error: unknown) => error instanceof Error ? error.message : "Request failed.";

export function BroadcastPanel({ active = true }: { active?: boolean }) {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [group, setGroup] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [name, setName] = useState("");
  const [doc, setDoc] = useState<JSONContent>(emptyDoc);
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const pending = useRef<{ signature: string; key: string } | null>(null);
  const requestBusy = useRef(false);
  const refresh = useCallback(async (signal?: AbortSignal) => {
    const [nextCatalog, nextTemplates, nextRuns] = await Promise.all([api<Catalog>("audiences", "GET", undefined, signal), api<Template[]>("templates", "GET", undefined, signal), api<Run[]>("history", "GET", undefined, signal)]);
    if (signal?.aborted) return;
    setCatalog(nextCatalog); setTemplates(nextTemplates); setRuns(nextRuns);
  }, []);
  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    const load = () => { if (document.visibilityState === "visible") refresh(controller.signal).catch(error => { if (!controller.signal.aborted) setError(errorText(error)); }); };
    const first = setTimeout(load, 0), timer = setInterval(load, 5000);
    return () => { controller.abort(); clearTimeout(first); clearInterval(timer); };
  }, [active, refresh]);
  const selectedGroup = catalog?.groups.find(row => row.id === group);
  function choose(id: string) {
    const saved = templates.find(row => row._id === id);
    setTemplateId(saved?._id || ""); setName(saved?.name || ""); setDoc(saved?.doc || emptyDoc); setPreview(""); setError(""); setNotice("");
  }
  async function action(work: () => Promise<void>) {
    if (requestBusy.current) return;
    requestBusy.current = true; setBusy(true); setError(""); setNotice("");
    try { await work(); } catch (error) { setError(errorText(error)); }
    finally { requestBusy.current = false; setBusy(false); }
  }
  async function save() {
    const saved = await api<{ _id: string; name: string }>(templateId ? `templates/${templateId}` : "templates", templateId ? "PUT" : "POST", { doc, ...(name.trim() ? { name: name.trim() } : {}) });
    setTemplateId(saved._id); setName(saved.name); setNotice("Saved message updated."); await refresh();
  }
  async function send() {
    const values = { audience: group, doc, origin: templateId ? "template" : "new", ...(templateId ? { templateId } : {}) };
    const signature = JSON.stringify(values);
    if (pending.current?.signature !== signature) pending.current = { signature, key: crypto.randomUUID() };
    await api("send", "POST", { ...values, requestKey: pending.current.key });
    pending.current = null;
    setNotice("Broadcast accepted. Recipients will enter the existing WhatsApp queue one by one.");
    // New composition becomes a saved template; refresh finds it in the dropdown.
    setDoc(emptyDoc); setTemplateId(""); setName(""); setPreview("");
    await refresh();
  }
  return <section className={s.panel} aria-label="Broadcast composer">
    {error && <p role="alert" className={s.error}>{error}</p>}
    {notice && <p role="status" className={s.notice}>{notice}</p>}
    {catalog && !catalog.jobsEnabled && <p className={s.note}>Broadcast sending is turned off on the server. Drafts and previews are available.</p>}
    {catalog?.stopped && <p className={s.note}>WhatsApp: {catalog.stopped.replaceAll("-", " ")}. Accepted broadcasts wait until sending is available.</p>}
    <label className={s.field}>Lead group
      <select aria-label="Lead group" value={group} disabled={busy || !catalog} onChange={event => setGroup(event.target.value)}>
        <option value="">{catalog ? "Choose a group" : "Loading groups…"}</option>
        {catalog?.groups.map(row => <option key={row.id} value={row.id}>{row.label} ({row.count})</option>)}
      </select>
    </label>
    {selectedGroup && <p className={s.note}>{selectedGroup.count} eligible numbers · {selectedGroup.excluded.invalidPhone} unusable phones · {selectedGroup.excluded.duplicatePhone} duplicate numbers.{(selectedGroup.excluded.doNotDisturb ?? 0) > 0 && ` ${selectedGroup.excluded.doNotDisturb} left out because they are Dead, Wrong or in a final message countdown.`}{selectedGroup.excluded.noName > 0 && ` ${selectedGroup.excluded.noName} have no name, so a message using the recipient's name skips them.`} Eligibility is checked again before queueing.</p>}
    <label className={s.field}>Recent / saved messages
      <select aria-label="Recent / saved messages" value={templateId} disabled={busy || !catalog} onChange={event => choose(event.target.value)}>
        <option value="">New message</option>
        {templates.map(row => <option key={row._id} value={row._id}>{row.name}</option>)}
      </select>
    </label>
    {templateId && <div className={s.saved}>
      <label className={s.field}>Message label<input aria-label="Message label" value={name} maxLength={100} disabled={busy} onChange={event => setName(event.target.value)} /></label>
      <button type="button" disabled={busy} onClick={() => void action(async () => {
        if (!window.confirm("Delete this saved message? Sent history will remain.")) return;
        await api(`templates/${templateId}`, "DELETE"); choose(""); await refresh(); setNotice("Saved message deleted.");
      })}>Delete</button>
    </div>}
    <EmailEditor id="broadcast-message" label="Message" channel="whatsapp" value={doc} disabled={busy} variables={catalog?.fields || []} onChange={value => { setDoc(value); setPreview(""); }} />
    <div className={s.actions}>
      <button type="button" disabled={busy || !docHasContent(doc)} onClick={() => void action(save)}>{templateId ? "Update saved message" : "Save Draft"}</button>
      <button type="button" disabled={busy || !docHasContent(doc)} onClick={() => void action(async () => { setPreview((await api<{ html: string }>("preview", "POST", { doc })).html); })}>Preview</button>
      <button type="button" className="admin-button" disabled={busy || !catalog?.jobsEnabled || !selectedGroup?.count || !docHasContent(doc)} onClick={() => void action(send)}>{busy ? "Working…" : "Send"}</button>
    </div>
    {preview && <div className={s.preview}><span>Sample recipient preview</span><div aria-label="Message preview" dangerouslySetInnerHTML={{ __html: preview }} /></div>}
    <details className={s.history} open={runs.length > 0}>
      <summary>Sending progress / history (latest 30)</summary>
      {!runs.length && <p>No broadcasts yet.</p>}
      {runs.map(run => <article key={run.id}>
        <strong>{run.title}</strong><p>{catalog?.groups.find(row => row.id === run.audience)?.label || run.audience} · {formatIndiaDate(run.createdAt)} · {run.state === "finished" ? "Finished" : run.state === "preparing" ? "Preparing" : "In progress"}</p>
        <p>{run.total} recipients · {Object.entries(run.counts).map(([state, count]) => `${count} ${state}`).join(" · ") || "Preparing recipients"}</p>
        <RecipientResults runId={run.id} />
      </article>)}
    </details>
  </section>;
}

type Results = { rows: { _id: string; phone: string; state: string; reason?: string }[]; page: number; pages: number; total: number };
function RecipientResults({ runId }: { runId: string }) {
  const [results, setResults] = useState<Results | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  async function load(page = 1) {
    setLoading(true); setError("");
    try { setResults(await api<Results>(`history/${runId}/recipients?page=${page}`)); }
    catch (error) { setError(errorText(error)); }
    finally { setLoading(false); }
  }
  return <details onToggle={event => { if (event.currentTarget.open) void load(); }}>
    <summary>Recipient results</summary>
    {error && <p role="alert">{error}</p>}
    {loading && <p>Loading…</p>}
    {results?.rows.map(row => <p key={row._id}>+{row.phone} · {row.state}{row.reason ? ` · ${row.reason}` : ""}</p>)}
    {results && results.pages > 1 && <div className={s.actions}>
      <button disabled={loading || results.page <= 1} onClick={() => void load(results.page - 1)}>Previous</button>
      <span>{results.page} / {results.pages}</span>
      <button disabled={loading || results.page >= results.pages} onClick={() => void load(results.page + 1)}>Next</button>
    </div>}
    <button type="button" disabled={loading} onClick={() => void load(results?.page)}>Refresh results</button>
  </details>;
}
