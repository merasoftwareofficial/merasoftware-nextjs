"use client";
/* eslint @next/next/no-img-element: off -- previews use the existing media library URLs. */
import { useCommunicationRefresh } from "@/lib/communication-live";

import { useCallback, useRef, useState } from "react";
import { ImageChooser } from "@/components/image-chooser";
import type { MediaAsset } from "@/lib/repo/types";
import type { JSONContent } from "@tiptap/core";
import type { TemplateVariable } from "@/lib/email-control-types";
import { EmailEditor, emptyDoc, docHasContent } from "@/app/admin/email-control/email-editor";
import { formatIndiaDate } from "@/lib/date-time";
import s from "./broadcast.module.css";

type Group = { kind?: "leads" | "clients"; blocked?: boolean; whatsappCount?: number; emailCount?: number; id: string; label: string; count: number; total: number; excluded: { invalidPhone: number; duplicatePhone: number; noName: number; doNotDisturb?: number; invalidEmail?: number; duplicateEmail?: number } };
type Catalog = { channel?: string; defaultChannel?: string; groups: Group[]; fields: TemplateVariable[]; jobsEnabled: boolean; stopped: string | null };
type Media = { id: string; url: string; kind: "image" | "video"; bytes: number; format: string; publicId: string; assetId: string };
type Template = { _id: string; name: string; doc: JSONContent; media?: Media | null; caption?: JSONContent | null; subject?: string; position?: "before" | "after" };
type Run = { id: string; audience: string; channel?: string; title: string; state: string; total: number; createdAt: string; counts: Record<string, number>; excluded?: Record<string, number> };
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
  const [audienceKind, setAudienceKind] = useState<"leads" | "clients">("leads");
  const [channel, setChannel] = useState("whatsapp");
  const channelChosen = useRef(false);
  const [media, setMedia] = useState<Media | null>(null);
  const [caption, setCaption] = useState<JSONContent>(emptyDoc);
  const [position, setPosition] = useState<"before" | "after">("after");
  const [subject, setSubject] = useState("");
  const [mediaOpen, setMediaOpen] = useState(false);
  const [group, setGroup] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [name, setName] = useState("");
  const [doc, setDoc] = useState<JSONContent>(emptyDoc);
  const [preview, setPreview] = useState<{ html: string; subject?: string; parts?: { text: string; html: string; media?: Media }[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const pending = useRef<{ signature: string; key: string } | null>(null);
  const requestBusy = useRef(false);
  const refresh = useCallback(async (signal?: AbortSignal) => {
    const [nextCatalog, nextTemplates, nextRuns] = await Promise.all([api<Catalog>(`audiences?channel=${channel}`, "GET", undefined, signal), api<Template[]>("templates", "GET", undefined, signal), api<Run[]>("history", "GET", undefined, signal)]);
    if (signal?.aborted) return;
    if (!channelChosen.current) { channelChosen.current = true; setChannel(nextCatalog.defaultChannel || "whatsapp"); }
    setCatalog(nextCatalog); setTemplates(nextTemplates); setRuns(nextRuns);
  }, [channel]);
  useCommunicationRefresh(signal => refresh(signal).catch(failure => { if (!signal.aborted) setError(errorText(failure)); }), active, 5000, channel, "communication,leads,clients,users");
  const selectedGroup = catalog?.groups.find(row => row.id === group);
  function choose(id: string) {
    const saved = templates.find(row => row._id === id);
    setMedia(saved?.media || null); setCaption(saved?.caption || emptyDoc); setSubject(saved?.subject || ""); setPosition(saved?.position || "after");
    setTemplateId(saved?._id || ""); setName(saved?.name || ""); setDoc(saved?.doc || emptyDoc); setPreview(null); setError(""); setNotice("");
  }
  async function action(work: () => Promise<void>) {
    if (requestBusy.current) return;
    requestBusy.current = true; setBusy(true); setError(""); setNotice("");
    try { await work(); } catch (error) { setError(errorText(error)); }
    finally { requestBusy.current = false; setBusy(false); }
  }
  const composition = { version: 2, doc, media, caption: media ? caption : emptyDoc, position, subject };
  const hasContent = docHasContent(doc) || !!media;
  async function save() {
    const saved = await api<{ _id: string; name: string }>(templateId ? `templates/${templateId}` : "templates", templateId ? "PUT" : "POST", { ...composition, ...(name.trim() ? { name: name.trim() } : {}) });
    setTemplateId(saved._id); setName(saved.name); setNotice("Saved message updated."); await refresh();
  }
  async function send() {
    const values = { audience: group, channel, ...composition, origin: templateId ? "template" : "new", ...(templateId ? { templateId } : {}) };
    const signature = JSON.stringify(values);
    if (pending.current?.signature !== signature) pending.current = { signature, key: crypto.randomUUID() };
    await api("send", "POST", { ...values, requestKey: pending.current.key });
    pending.current = null;
    setNotice("Broadcast accepted. Selected channels will use the existing delivery systems; WhatsApp messages enter its queue one by one.");
    // New composition becomes a saved template; refresh finds it in the dropdown.
    setDoc(emptyDoc); setMedia(null); setCaption(emptyDoc); setSubject(""); setTemplateId(""); setName(""); setPreview(null);
    await refresh();
  }
  return <section className={s.panel} aria-label="Broadcast composer">
    {error && <p role="alert" className={s.error}>{error}</p>}
    {notice && <p role="status" className={s.notice}>{notice}</p>}
    {catalog && !catalog.jobsEnabled && <p className={s.note}>Broadcast sending is turned off on the server. Drafts and previews are available.</p>}
    {channel !== "email" && catalog?.stopped && <p className={s.note}>WhatsApp: {catalog.stopped.replaceAll("-", " ")}. WhatsApp deliveries wait until sending is available.</p>}
    <div className={s.stage}><h3>1. Choose your audience</h3><p>Choose who should receive the broadcast and how it will be sent.</p>
    <label className={s.field}>Audience
      <select aria-label="Audience" value={audienceKind} disabled={busy} onChange={event => { setAudienceKind(event.target.value as "leads" | "clients"); setGroup(""); }}>
        <option value="leads">Leads only</option><option value="clients">Clients only</option>
      </select>
    </label>
    <label className={s.field}>Send via
      <select aria-label="Send via" value={channel} disabled={busy} onChange={event => { channelChosen.current = true; setChannel(event.target.value); setPreview(null); }}>
        <option value="whatsapp">WhatsApp only</option><option value="email">Email only</option><option value="both">Both</option>
      </select>
    </label>
    <label className={s.field}>{audienceKind === "clients" ? "Client behaviour" : "Lead group"}
      <select aria-label={audienceKind === "clients" ? "Client behaviour" : "Lead group"} value={group} disabled={busy || !catalog} onChange={event => setGroup(event.target.value)}>
        <option value="">{catalog ? "Choose a group" : "Loading groups…"}</option>
        {catalog?.groups.filter(row => row.kind === audienceKind).map(row => <option key={row.id} value={row.id}>{row.label} ({row.total} people){row.blocked ? " · marketing blocked" : ""}</option>)}
      </select>
    </label>
    {selectedGroup && <p className={s.note}>{selectedGroup.total} people · {selectedGroup.whatsappCount || 0} eligible WhatsApp numbers · {selectedGroup.emailCount || 0} eligible email addresses. {selectedGroup.excluded.invalidPhone} unusable phones · {selectedGroup.excluded.duplicatePhone} duplicate numbers · {selectedGroup.excluded.doNotDisturb || 0} blocked or unavailable · {selectedGroup.excluded.noName} without a confirmed name. {channel !== "whatsapp" && `${selectedGroup.excluded.invalidEmail || 0} missing or invalid emails · ${selectedGroup.excluded.duplicateEmail || 0} duplicate emails.`} {selectedGroup.blocked ? "Marketing is unavailable for this group." : "Eligibility is checked again before sending. Missing destinations are excluded; Both uses each available channel."}</p>}
    </div>
    <div className={s.stage}><h3>2. Create your message</h3><p>Choose a saved message or create a new one.</p>
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
    {channel !== "whatsapp" && <label className={s.field}>Email subject<input aria-label="Email subject" maxLength={300} value={subject} disabled={busy} onChange={event => { setSubject(event.target.value); setPreview(null); }} /></label>}
    <div className={s.actions}>
      <button type="button" disabled={busy} onClick={() => setMediaOpen(true)}>{media ? "Change media" : "Add media"}</button>
      {media && <button type="button" disabled={busy} onClick={() => { setMedia(null); setCaption(emptyDoc); setPreview(null); }}>Remove media</button>}
    </div>
    <p className={s.note}>Broadcast media: JPG/PNG up to 5 MB or MP4 up to 16 MB. Caption is optional; leave separate text empty to send media alone.</p>
    {media && <div className={s.preview}>{media.kind === "video" ? <video src={media.url} controls preload="metadata" style={{ maxWidth: "100%", maxHeight: 240 }} /> : <img src={media.url} alt="Selected broadcast media" style={{ maxWidth: "100%", maxHeight: 240 }} />}
      <EmailEditor id="broadcast-caption" label="Caption (optional)" channel="whatsapp" value={caption} disabled={busy} variables={catalog?.fields || []} onChange={value => { setCaption(value); setPreview(null); }} />
      <label className={s.field}>Separate text position<select aria-label="Separate text position" value={position} disabled={busy} onChange={event => { setPosition(event.target.value as "before" | "after"); setPreview(null); }}><option value="before">Text before media</option><option value="after">Text after media</option></select></label>
    </div>}
    {mediaOpen && <ImageChooser allowVideo sources={{ upload: true, library: true, url: false }} onClose={() => setMediaOpen(false)} onChoose={choice => {
      if (choice.kind !== "library") return;
      const asset: MediaAsset = choice.asset;
      setMedia({ id: asset._id, url: asset.url, kind: asset.kind || "image", bytes: asset.bytes, format: asset.format, publicId: asset.publicId, assetId: asset.assetId }); setMediaOpen(false); setPreview(null);
    }} />}
    <EmailEditor id="broadcast-message" label="Message" channel="whatsapp" value={doc} disabled={busy} variables={catalog?.fields || []} onChange={value => { setDoc(value); setPreview(null); }} />
    </div>
    <div className={s.stage}><h3>3. Preview and send</h3><p>Check your message and audience before sending.</p>
    <div className={s.actions}>
      <button type="button" disabled={busy || !hasContent} onClick={() => void action(save)}>{templateId ? "Update saved message" : "Save Draft"}</button>
      <button type="button" disabled={busy || !hasContent} onClick={() => void action(async () => { setPreview(await api<{ html: string; subject?: string; parts?: { text: string; html: string; media?: Media }[] }>("preview", "POST", composition)); })}>Preview</button>
      <button type="button" className="admin-button" disabled={busy || !catalog?.jobsEnabled || catalog.channel !== channel || !selectedGroup?.count || selectedGroup.blocked || (channel !== "whatsapp" && !subject.trim()) || !hasContent} onClick={() => void action(send)}>{busy ? "Working…" : "Send"}</button>
    </div>
    {preview && <div className={s.preview} aria-label="Message preview"><span>Sample recipient preview</span>
      {channel !== "email" && <div aria-label="WhatsApp preview"><strong>WhatsApp</strong>{preview.parts?.map((part, index) => <div key={index} style={{ marginTop: 12 }}>
        <small>Message {index + 1}</small>
        {part.media && (part.media.kind === "video" ? <video src={part.media.url} controls preload="metadata" style={{ maxWidth: "100%", maxHeight: 200 }} /> : <img src={part.media.url} alt="Broadcast preview" style={{ maxWidth: "100%", maxHeight: 200 }} />)}
        <div dangerouslySetInnerHTML={{ __html: part.html }} />
      </div>)}</div>}
      {channel !== "whatsapp" && <div aria-label="Email preview"><strong>Email: {preview.subject}</strong><div dangerouslySetInnerHTML={{ __html: preview.html }} /></div>}
    </div>}

    </div>
    <details className={s.history} open={runs.length > 0}>
      <summary>Sending progress / history (latest 30)</summary>
      {!runs.length && <p>No broadcasts yet.</p>}
      {runs.map(run => <article key={run.id}>
        <strong>{run.title}</strong><p>{catalog?.groups.find(row => row.id === run.audience)?.label || run.audience} · {formatIndiaDate(run.createdAt)} · {run.state === "finished" ? "Finished" : run.state === "preparing" ? "Preparing" : "In progress"}</p>
        <p>{run.total} delivery parts · {Object.entries(run.counts).map(([state, count]) => `${count} ${state}`).join(" · ") || "Preparing recipients"}</p>
        {run.excluded && Object.values(run.excluded).some(count => count > 0) && <p>Audience exclusions: {Object.entries(run.excluded).filter(([, count]) => count > 0).map(([reason, count]) => `${count} ${reason.replace(/([A-Z])/g, " $1").toLowerCase()}`).join(" · ")}. Missing destinations do not change the selected channels.</p>}
        {run.channel !== "whatsapp" && (run.counts.failed || 0) > 0 && <button type="button" disabled={busy} onClick={() => void action(async () => { const result = await api<{ message: string }>(`history/${run.id}/retry-email`, "POST", {}); setNotice(result.message); await refresh(); })}>Retry failed email</button>}
        <RecipientResults runId={run.id} />
      </article>)}
    </details>
  </section>;
}

type Results = { rows: { _id: string; phone?: string; email?: string; channel?: string; part?: number; parts?: number; state: string; reason?: string }[]; page: number; pages: number; total: number };
function RecipientResults({ runId }: { runId: string }) {
  const [results, setResults] = useState<Results | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  useCommunicationRefresh(async () => { if (open) { try { setResults(await api<Results>(`history/${runId}/recipients?page=${results?.page || 1}`)); setError(""); } catch (failure) { setError(errorText(failure)); } } }, open);
  async function load(page = 1) {
    setLoading(true); setError("");
    try { setResults(await api<Results>(`history/${runId}/recipients?page=${page}`)); }
    catch (error) { setError(errorText(error)); }
    finally { setLoading(false); }
  }
  return <details onToggle={event => { setOpen(event.currentTarget.open); }}>
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
