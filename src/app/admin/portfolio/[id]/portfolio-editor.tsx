"use client";
/* eslint @next/next/no-img-element: off -- Library assets use Cloudinary delivery URLs. */
import { useEffect, useState } from "react";
import Link from "@/components/link";
import { MediaPicker } from "@/components/media-picker";
import { ImageChooser } from "@/components/image-chooser";
import type { PortfolioEntry, PortfolioImage } from "@/lib/portfolio/types";
const sources = { upload: true, library: true, url: false };
export function PortfolioEditor({ entry, linkedServices }: { entry: PortfolioEntry; linkedServices: string[] }) {
  const [draft, setDraft] = useState(entry);
  const [capture, setCapture] = useState(entry.capture);
  const [captureUrl, setCaptureUrl] = useState(entry.source.url || entry.liveUrl);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [error, setError] = useState("");
  const [source, setSource] = useState(entry.source);
  useEffect(() => {
    if (!["queued", "running"].includes(capture.status)) return;
    const controller = new AbortController();
    const timer = setInterval(async () => {
      try { const response = await fetch(`/api/portfolio/${entry._id}`, { cache: "no-store", signal: controller.signal }); if (response.ok) { const result = await response.json(); setCapture(result.entry.capture); setSource(result.entry.source); } } catch { /* Retry on the next interval. */ }
    }, 8000);
    return () => { clearInterval(timer); controller.abort(); };
  }, [capture.status, entry._id]);
  function change<K extends keyof PortfolioEntry>(key: K, value: PortfolioEntry[K]) { setDraft(previous => ({ ...previous, [key]: value })); setMessage(""); }
  async function save() {
    setBusy(true); setMessage(""); setError("");
    try {
      const response = await fetch(`/api/portfolio/${entry._id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...draft, services: [...new Set(draft.services.map(service => service.trim()).filter(Boolean))] }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || "Save failed.");
      setDraft(result.entry); setSource(result.entry.source); setCapture(result.entry.capture); setMessage("Saved. The preview and public visibility now reflect these changes.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Save failed."); } finally { setBusy(false); }
  }
  async function requestCapture() {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/portfolio/${entry._id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: captureUrl }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || "Capture failed.");
      setCapture(result.entry.capture); setMessage("Screenshots queued. Keep editing while the worker captures the website.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Capture failed."); } finally { setBusy(false); }
  }
  const textFields = [["title", "Public title"], ["slug", "URL slug"], ["brand", "Public client / brand name"], ["category", "Category"], ["liveUrl", "Public live website URL"]] as const;
  const largeFields = [["summary", "Short description"], ["problem", "The challenge"], ["solution", "What we built"], ["result", "The result"]] as const;
  const updateImage = (index: number, patch: Partial<PortfolioImage>) => change("gallery", draft.gallery.map((image, n) => n === index ? { ...image, ...patch } : image));
  return <><div className="portfolio-editor-heading"><div><p className="eyebrow">PORTFOLIO</p><h1>{entry.title}</h1></div><Link href="/admin/portfolio">← All projects</Link></div>
    <section className="portfolio-source"><strong>Source: {source.name}</strong><p>{source.customerName} · {source.available ? source.state.replaceAll("_", " ") : "Source unavailable"} · Last synced {new Date(entry.syncedAt).toLocaleString()}</p>{source.linkedProjectId ? <p>This service belongs to a project. <Link href={`/admin/portfolio/${source.linkedProjectId}`}>Manage its project presentation →</Link></p> : null}</section>
    <form className="portfolio-editor" onSubmit={event => { event.preventDefault(); void save(); }}>
      <div className="portfolio-editor-fields">{textFields.map(([key, label]) => <label className="admin-field" key={key}>{label}<input value={draft[key]} onChange={event => change(key, event.target.value)} required={key === "title" || key === "slug"} maxLength={key === "liveUrl" ? 2000 : key === "category" ? 100 : 180} /></label>)}
        {largeFields.map(([key, label]) => <label className="admin-field" key={key}>{label}<textarea rows={key === "summary" ? 3 : 6} maxLength={key === "summary" ? 400 : 12000} value={draft[key]} onChange={event => change(key, event.target.value)} /></label>)}
        <label className="admin-field">Services provided (one per line)<textarea rows={4} value={draft.services.join("\n")} onChange={event => change("services", event.target.value.split("\n"))} /></label>
        {linkedServices.length ? <div className="portfolio-source"><p>Linked purchased services: {linkedServices.join(" · ")}</p><button className="admin-action" type="button" onClick={() => change("services", [...new Set([...draft.services.filter(Boolean), ...linkedServices])])}>Add to services provided</button></div> : null}
      </div>
      <aside className="portfolio-editor-sidebar"><section><h2>Publishing</h2><label className="admin-field">Visibility<select value={draft.status} onChange={event => change("status", event.target.value as PortfolioEntry["status"])}><option value="draft">Draft</option><option value="published" disabled={!source.available || Boolean(source.linkedProjectId)}>Published</option><option value="hidden">Hidden</option></select></label><label className="portfolio-checkbox"><input type="checkbox" checked={draft.featured} onChange={event => change("featured", event.target.checked)} />Featured on homepage</label><label className="admin-field">Display order (lower first)<input type="number" min={-10000} max={10000} value={draft.sortOrder} onChange={event => change("sortOrder", Number(event.target.value))} /></label><button className="admin-button" type="submit" disabled={busy}>{busy ? "Working…" : "Save changes"}</button><p><Link href={`/admin/portfolio/${entry._id}/preview`} target="_blank">Preview saved version ↗</Link></p>{draft.status === "published" ? <Link href={`/work/${draft.slug}`} target="_blank">Open public page ↗</Link> : null}</section>
      <section><h2>Cover image</h2><MediaPicker url={draft.cover?.url ?? ""} fromLibrary sources={sources} onChoose={choice => { if (choice.kind === "library") change("cover", { assetId: choice.asset._id, url: choice.asset.url, alt: choice.asset.altText || draft.title, focalX: 50, focalY: 0 }); }} onRemove={() => change("cover", null)} />
        {draft.cover ? <><label className="admin-field">Image description<input maxLength={300} value={draft.cover.alt} onChange={e => change("cover", { ...draft.cover!, alt: e.target.value })} /></label>{(["focalX", "focalY"] as const).map(axis => <label className="admin-field" key={axis}>{axis === "focalX" ? "Horizontal crop position" : "Vertical crop position"}<input type="range" min="0" max="100" value={draft.cover![axis]} onChange={e => change("cover", { ...draft.cover!, [axis]: Number(e.target.value) })} /></label>)}</> : null}
      </section></aside>
    </form>
    <section className="portfolio-admin-section"><h2>Automatic screenshots</h2><p>Capture status: <strong>{capture.status}</strong>{capture.completedAt ? ` · ${new Date(capture.completedAt).toLocaleString()}` : ""}</p>{capture.error ? <p role="alert">{capture.error}</p> : null}<div className="portfolio-capture-controls"><label className="admin-field">Public website URL<input type="url" value={captureUrl} onChange={e => setCaptureUrl(e.target.value)} placeholder="https://client-website.com" /></label><button className="admin-action" type="button" disabled={busy || !source.available} onClick={() => void requestCapture()}>Capture / refresh screenshots</button></div><p>Choose a candidate below, then save. Capturing again keeps your current published cover.</p>
      <div className="portfolio-candidates">{capture.candidates.map((image, index) => <div key={`${image.assetId}-${index}`}><img src={image.url} alt={image.alt} /><p>{index === 0 ? "Desktop" : "Mobile"}</p><button type="button" className="admin-action" onClick={() => change("cover", image)}>Use as cover</button><button type="button" className="admin-action" onClick={() => { if (!draft.gallery.some(row => row.assetId === image.assetId)) change("gallery", [...draft.gallery, image]); }}>Add to gallery</button></div>)}</div>
    </section>
    <section className="portfolio-admin-section"><h2>Gallery</h2><button className="admin-action" type="button" onClick={() => setGalleryOpen(true)}>Upload / choose image</button><div className="portfolio-candidates">{draft.gallery.map((image, index) => <div key={`${image.assetId}-${index}`}><img src={image.url} alt={image.alt} /><label className="admin-field">Description<input value={image.alt} maxLength={300} onChange={e => updateImage(index, { alt: e.target.value })} /></label><button className="admin-action" type="button" disabled={!index} onClick={() => { const gallery = [...draft.gallery]; [gallery[index - 1], gallery[index]] = [gallery[index], gallery[index - 1]]; change("gallery", gallery); }}>Move earlier</button><button className="admin-action" type="button" onClick={() => change("gallery", draft.gallery.filter((_, n) => n !== index))}>Remove</button></div>)}</div></section>
    {galleryOpen ? <ImageChooser sources={sources} onClose={() => setGalleryOpen(false)} onChoose={choice => { if (choice.kind === "library") change("gallery", [...draft.gallery, { assetId: choice.asset._id, url: choice.asset.url, alt: choice.asset.altText || draft.title, focalX: 50, focalY: 0 }]); setGalleryOpen(false); }} /> : null}
    <div className="portfolio-editor-save"><button className="admin-button" type="button" disabled={busy} onClick={() => void save()}>Save changes</button>{message ? <p role="status">{message}</p> : null}{error ? <p role="alert">{error}</p> : null}</div>
  </>;
}
