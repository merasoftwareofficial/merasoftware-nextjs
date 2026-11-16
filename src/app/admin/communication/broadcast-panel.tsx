"use client";
/* eslint @next/next/no-img-element: off -- previews use the existing media library URLs. */
import { useCommunicationRefresh } from "@/lib/communication-live";

import { useCallback, useMemo, useRef, useState } from "react";
import { ImageChooser } from "@/components/image-chooser";
import type { MediaAsset } from "@/lib/repo/types";
import type { JSONContent } from "@tiptap/core";
import type { TemplateVariable } from "@/lib/email-control-types";
import { EmailEditor, emptyDoc, docHasContent } from "@/app/admin/email-control/email-editor";
import { formatIndiaDate } from "@/lib/date-time";
import c from "./actions-panel.module.css";
import s from "./broadcast.module.css";

type ExcludedCounts = { invalidPhone: number; duplicatePhone: number; noName: number; doNotDisturb?: number; invalidEmail?: number; duplicateEmail?: number };
type AudienceSummary = { count: number; total: number; whatsappCount?: number; emailCount?: number; excluded: ExcludedCounts };
type Group = AudienceSummary & { kind?: "leads" | "clients"; blocked?: boolean; id: string; label: string };
type Catalog = { channel?: string; defaultChannel?: string; selected?: AudienceSummary | null; groups: Group[]; fields: TemplateVariable[]; jobsEnabled: boolean; stopped: string | null };
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
  const [groups, setGroups] = useState<string[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [templateQuery, setTemplateQuery] = useState("");
  const [name, setName] = useState("");
  const [doc, setDoc] = useState<JSONContent>(emptyDoc);
  const [preview, setPreview] = useState<{ html: string; subject?: string; parts?: { text: string; html: string; media?: Media }[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const pending = useRef<{ signature: string; key: string } | null>(null);
  const requestBusy = useRef(false);

  const selectedKey = groups.join(",");
  const refresh = useCallback(async (signal?: AbortSignal) => {
    const query = `audiences?channel=${channel}${selectedKey ? `&selected=${encodeURIComponent(selectedKey)}` : ""}`;
    const [nextCatalog, nextTemplates, nextRuns] = await Promise.all([api<Catalog>(query, "GET", undefined, signal), api<Template[]>("templates", "GET", undefined, signal), api<Run[]>("history", "GET", undefined, signal)]);
    if (signal?.aborted) return;
    if (!channelChosen.current) { channelChosen.current = true; setChannel(nextCatalog.defaultChannel || "whatsapp"); }
    setCatalog(nextCatalog); setTemplates(nextTemplates); setRuns(nextRuns);
  }, [channel, selectedKey]);

  useCommunicationRefresh(signal => refresh(signal).catch(failure => { if (!signal.aborted) setError(errorText(failure)); }), active, 5000, `${channel}:${selectedKey}`, "communication,leads,clients,users");

  const selectedGroupRows = useMemo(
    () => groups.map(id => catalog?.groups.find(row => row.id === id)).filter((row): row is Group => Boolean(row)),
    [groups, catalog],
  );
  const summary: AudienceSummary | null = groups.length === 1
    ? (selectedGroupRows[0] || catalog?.selected || null)
    : (catalog?.selected || null);
  const hasBlockedGroup = selectedGroupRows.some(row => row.blocked);

  function addGroup(id: string) {
    if (!id || groups.includes(id)) return;
    const found = catalog?.groups.find(row => row.id === id);
    if (found?.blocked) return;
    setGroups(prev => [...prev, id]);
  }

  function removeGroup(id: string) {
    setGroups(prev => prev.filter(item => item !== id));
  }

  function choose(id: string) {
    const saved = templates.find(row => row._id === id);
    setMedia(saved?.media || null); setCaption(saved?.caption || emptyDoc); setSubject(saved?.subject || ""); setPosition(saved?.position || "after");
    setTemplateId(saved?._id || ""); setName(saved?.name || ""); setDoc(saved?.doc || emptyDoc); setPreview(null); setError(""); setNotice("");
  }

  async function removeTemplate(row: Template) {
    await action(async () => {
      if (!window.confirm(`Delete "${row.name}"? Sent history will remain.`)) return;
      await api(`templates/${row._id}`, "DELETE");
      if (templateId === row._id) choose("");
      await refresh();
      setNotice("Saved message deleted.");
    });
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
    const audience = groups.join(",");
    const values = { audience, channel, ...composition, origin: templateId ? "template" : "new", ...(templateId ? { templateId } : {}) };
    const signature = JSON.stringify(values);
    if (pending.current?.signature !== signature) pending.current = { signature, key: crypto.randomUUID() };
    await api("send", "POST", { ...values, requestKey: pending.current.key });
    pending.current = null;
    setNotice("Broadcast accepted. Selected channels will use the existing delivery systems; WhatsApp messages enter its queue one by one.");
    // New composition becomes a saved template; refresh finds it in the list.
    setDoc(emptyDoc); setMedia(null); setCaption(emptyDoc); setSubject(""); setTemplateId(""); setName(""); setPreview(null);
    await refresh();
  }

  const filteredTemplates = useMemo(() => {
    const needle = templateQuery.trim().toLowerCase();
    return needle ? templates.filter(row => row.name.toLowerCase().includes(needle) || (row.subject || "").toLowerCase().includes(needle)) : templates;
  }, [templates, templateQuery]);

  const audienceLabel = (raw: string) => raw.split(",").map(id => catalog?.groups.find(row => row.id === id.trim())?.label || id.trim()).join(", ");

  return <section className={s.panel} aria-label="Broadcast composer">
    {error && <p role="alert" className={s.error}>{error}</p>}
    {notice && <p role="status" className={s.notice}>{notice}</p>}
    {catalog && !catalog.jobsEnabled && <p className={s.note}>Broadcast sending is turned off on the server. Drafts and previews are available.</p>}
    {channel !== "email" && catalog?.stopped && <p className={s.note}>WhatsApp: {catalog.stopped.replaceAll("-", " ")}. WhatsApp deliveries wait until sending is available.</p>}

    <div className={s.stage}><h3>1. Choose your audience</h3><p>Add one or more lead or client groups and choose how the broadcast will be sent.</p>
      <label className={s.field}>Audience
        <select aria-label="Audience" value={audienceKind} disabled={busy} onChange={event => setAudienceKind(event.target.value as "leads" | "clients")}>
          <option value="leads">Leads only</option><option value="clients">Clients only</option>
        </select>
      </label>
      <label className={s.field}>Send via
        <select aria-label="Send via" value={channel} disabled={busy} onChange={event => { channelChosen.current = true; setChannel(event.target.value); setPreview(null); }}>
          <option value="whatsapp">WhatsApp only</option><option value="email">Email only</option><option value="both">Both</option>
        </select>
      </label>
      <label className={s.field}>{audienceKind === "clients" ? "Client behaviour" : "Lead group"}
        <select aria-label={audienceKind === "clients" ? "Client behaviour" : "Lead group"} value="" disabled={busy || !catalog} onChange={event => addGroup(event.target.value)}>
          <option value="">{!catalog ? "Loading groups…" : groups.length ? "Add another group…" : "Choose a group"}</option>
          {catalog?.groups.filter(row => row.kind === audienceKind).map(row => (
            <option key={row.id} value={row.id} disabled={row.blocked || groups.includes(row.id)}>
              {row.label} ({row.total} people){row.blocked ? " · marketing blocked" : groups.includes(row.id) ? " · added" : ""}
            </option>
          ))}
        </select>
      </label>
      {groups.length > 0 && <div className={s.chips} aria-label="Selected groups">
        {groups.map(id => {
          const item = catalog?.groups.find(row => row.id === id);
          const prefix = item?.kind === "clients" ? "Clients" : "Leads";
          const label = item ? `${prefix}: ${item.label}` : id;
          return <span key={id} className={s.chip}>
            {label}
            <button type="button" className={s.chipRemove} aria-label={`Remove ${item?.label || id}`} disabled={busy} onClick={() => removeGroup(id)}>×</button>
          </span>;
        })}
        {groups.length > 1 && <button type="button" className={c.smallBtn} disabled={busy} onClick={() => setGroups([])}>Clear all</button>}
      </div>}
      {summary && <p className={s.note}>{summary.total} people · {summary.whatsappCount || 0} eligible WhatsApp numbers · {summary.emailCount || 0} eligible email addresses. {summary.excluded.invalidPhone} unusable phones · {summary.excluded.duplicatePhone} duplicate numbers · {summary.excluded.doNotDisturb || 0} blocked or unavailable · {summary.excluded.noName} without a confirmed name. {channel !== "whatsapp" && `${summary.excluded.invalidEmail || 0} missing or invalid emails · ${summary.excluded.duplicateEmail || 0} duplicate emails.`} {hasBlockedGroup ? "Marketing is unavailable for a selected group." : "Duplicate contacts across selected groups are sent once. Missing destinations are excluded."}</p>}
    </div>

    <div className={s.stage}><h3>2. Create your message</h3><p>Pick a saved message from the list below or write a new one.</p>
      <label className={s.field}>Recent / saved messages
        <select aria-label="Recent / saved messages" value={templateId} disabled={busy || !catalog} onChange={event => choose(event.target.value)}>
          <option value="">New message</option>
          {templates.map(row => <option key={row._id} value={row._id}>{row.name}</option>)}
        </select>
      </label>

      {templates.length > 0 && <div className={s.savedBox}>
        {templates.length > 3 && <input className={s.savedSearch} type="search" aria-label="Search saved messages" placeholder="Search saved messages…" value={templateQuery} onChange={event => setTemplateQuery(event.target.value)} />}
        <div className={c.tableWrap}>
          <table className={c.table}>
            <thead><tr><th>Saved message</th><th>Details</th><th>Actions</th></tr></thead>
            <tbody>
              {!filteredTemplates.length ? <tr><td colSpan={3} className={s.subMeta}>No matching saved messages.</td></tr> : filteredTemplates.map(row => {
                const selected = templateId === row._id;
                const tags = [row.media ? (row.media.kind === "video" ? "Video" : "Image") : "", row.subject ? `Email: ${row.subject}` : ""].filter(Boolean).join(" · ") || "Text";
                return <tr key={row._id}>
                  <td><strong>{row.name}</strong></td>
                  <td className={s.subMeta}>{tags}</td>
                  <td>
                    <div className={c.rowActions}>
                      <button type="button" className={c.smallBtn} disabled={busy} onClick={() => choose(selected ? "" : row._id)}>{selected ? "Clear" : "Use"}</button>
                      <button type="button" className={`${c.smallBtn} ${c.dangerBtn}`} aria-label={`Delete ${row.name}`} disabled={busy} onClick={() => void removeTemplate(row)}>Delete</button>
                    </div>
                  </td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>
      </div>}

      {templateId && <div className={s.saved}>
        <label className={s.field}>Message label<input aria-label="Message label" value={name} maxLength={100} disabled={busy} onChange={event => setName(event.target.value)} /></label>
        <button type="button" disabled={busy} onClick={() => { const row = templates.find(item => item._id === templateId); if (row) void removeTemplate(row); }}>Delete</button>
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
        <button type="button" className="admin-button" disabled={busy || !catalog?.jobsEnabled || catalog.channel !== channel || !groups.length || !summary?.count || hasBlockedGroup || (channel !== "whatsapp" && !subject.trim()) || !hasContent} onClick={() => void action(send)}>{busy ? "Working…" : "Send"}</button>
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
      {!runs.length ? <p className={s.note}>No broadcasts yet.</p> : <div className={c.tableWrap} style={{ marginTop: 10 }}>
        <table className={c.table}>
          <thead><tr><th>Message</th><th>Audience</th><th>Status</th><th>Counts</th><th>Recipients</th></tr></thead>
          <tbody>
            {runs.map(run => {
              const exclusions = run.excluded ? Object.entries(run.excluded).filter(([, count]) => count > 0).map(([reason, count]) => `${count} ${reason.replace(/([A-Z])/g, " $1").toLowerCase()}`).join(" · ") : "";
              return <tr key={run.id}>
                <td><strong>{run.title}</strong><div className={s.subMeta}>{formatIndiaDate(run.createdAt)}</div></td>
                <td>{audienceLabel(run.audience)}<div className={s.subMeta}>{run.channel || "whatsapp"}</div></td>
                <td>{run.state === "finished" ? "Finished" : run.state === "preparing" ? "Preparing" : "In progress"}</td>
                <td>
                  <div>{run.total} parts · {Object.entries(run.counts).map(([state, count]) => `${count} ${state}`).join(" · ") || "Preparing"}</div>
                  {exclusions && <div className={s.subMeta}>Excluded: {exclusions}</div>}
                  {run.channel !== "whatsapp" && (run.counts.failed || 0) > 0 && <button type="button" className={c.smallBtn} style={{ marginTop: 4 }} disabled={busy} onClick={() => void action(async () => { const result = await api<{ message: string }>(`history/${run.id}/retry-email`, "POST", {}); setNotice(result.message); await refresh(); })}>Retry failed email</button>}
                </td>
                <td><RecipientResults runId={run.id} /></td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>}
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
    {results && results.rows.length > 0 && <div className={c.tableWrap} style={{ marginTop: 6 }}>
      <table className={c.table}>
        <thead><tr><th>Destination</th><th>Status</th><th>Reason</th></tr></thead>
        <tbody>
          {results.rows.map(row => <tr key={row._id}>
            <td>{row.phone ? `+${row.phone}` : row.email || "—"}</td>
            <td>{row.state}</td>
            <td className={s.subMeta}>{row.reason || "—"}</td>
          </tr>)}
        </tbody>
      </table>
    </div>}
    {results && results.pages > 1 && <div className={s.actions} style={{ marginTop: 6 }}>
      <button disabled={loading || results.page <= 1} onClick={() => void load(results.page - 1)}>Previous</button>
      <span>{results.page} / {results.pages}</span>
      <button disabled={loading || results.page >= results.pages} onClick={() => void load(results.page + 1)}>Next</button>
    </div>}
    <button type="button" className={c.smallBtn} style={{ marginTop: 6 }} disabled={loading} onClick={() => void load(results?.page)}>Refresh results</button>
  </details>;
}
