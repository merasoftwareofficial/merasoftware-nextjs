"use client";

import { useEffect, useRef, useState } from "react";
import Link from "@/components/link";
import { SeoHint, focusSeoField } from "@/components/seo-checks";
import { useNavigate, useTask } from "@/components/loading/navigation";
import { IMAGE_UPLOAD_ACCEPT, VIDEO_UPLOAD_ACCEPT } from "@/lib/cloudinary-types";
import { imageFileProblem, uploadToLibrary, uploadVideoToLibrary } from "@/lib/media-upload";
import type { MediaUse } from "@/lib/media-usage";
import type { MediaAsset } from "@/lib/repo/types";
import { mediaSeoChecks } from "@/lib/seo-rules";

type Item = { asset: MediaAsset; uses: MediaUse[] };

export function MediaUploader({ items, canDelete, focusId }: { items: Item[]; canDelete: boolean; focusId?: string }) {
  const navigation = useNavigate();
  const input = useRef<HTMLInputElement>(null);
  const { busy, track } = useTask();
  const [error, setError] = useState("");
  const [altText, setAltText] = useState("");
  const [uploaded, setUploaded] = useState<{ asset: MediaAsset; reused: boolean } | null>(null);
  // Opens on the tab holding the media a "Fix →" link points at.
  const [view, setView] = useState<"unused" | "used">(() => (items.find(item => item.asset._id === focusId)?.uses.length ? "used" : "unused"));
  const [search, setSearch] = useState("");

  async function upload(file: File) {
    setError("");
    setUploaded(null);
    const problem = file.type === "video/mp4" ? null : imageFileProblem(file);
    if (problem) return setError(problem);

    await track(async () => {
      try {
        setUploaded(file.type === "video/mp4" ? await uploadVideoToLibrary(file, altText) : await uploadToLibrary(file, altText));
        setAltText("");
        navigation.refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Upload failed.");
      } finally {
        if (input.current) input.current.value = "";
      }
    });
  }

  const used = items.filter(item => item.uses.length);
  const unused = items.filter(item => !item.uses.length);
  const term = search.trim().toLowerCase();
  const shown = (view === "used" ? used : unused).filter(({ asset }) => !term || `${asset.altText} ${asset.publicId} ${asset.format}`.toLowerCase().includes(term));

  return (
    <>
      <section className="media-drop">
        <span aria-hidden="true">↑</span>
        <h2>Upload media</h2>
        <p>Choose a JPG, PNG, WebP, GIF or AVIF image up to 4 MB, or an MP4 video up to 50 MB. Add an accessible description.</p>
        <label className="admin-field media-alt-field">
          <span>Default accessible description</span>
          <input value={altText} maxLength={300} onChange={event => setAltText(event.target.value)} placeholder="Describe what the media shows" />
        </label>
        <input
          ref={input}
          type="file"
          accept={`${IMAGE_UPLOAD_ACCEPT},${VIDEO_UPLOAD_ACCEPT}`}
          aria-label="Choose an image, GIF or MP4 video"
          style={{ display: "none" }}
          onChange={event => {
            const file = event.currentTarget.files?.[0];
            if (file) void upload(file);
          }}
        />
        <button className="admin-button" type="button" disabled={busy} onClick={() => input.current?.click()}>
          {busy ? "Uploading…" : "Choose media"}
        </button>
        {error ? <p role="alert" style={{ color: "var(--pn-err)", marginTop: 20 }}>{error}</p> : null}
        {uploaded ? <p role="status" style={{ marginTop: 20 }}>{uploaded.reused ? "This file was already in the library." : "Media uploaded and saved in the library."}</p> : null}
      </section>
      <section className="media-library" aria-labelledby="media-library-title">
        <div className="section-top"><h2 id="media-library-title">Saved media</h2><span>{items.length} files</span></div>
        <div className="media-library-bar">
          <div className="homepage-editor-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={view === "unused"} onClick={() => setView("unused")}>Unused ({unused.length})</button>
            <button type="button" role="tab" aria-selected={view === "used"} onClick={() => setView("used")}>Used ({used.length})</button>
          </div>
          <label className="admin-field">
            <span>Search</span>
            <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Alt text, file name or format" />
          </label>
        </div>
        <p className="field-hint">
          {view === "used"
            ? "These files are on the website or in a post. To delete one, first remove it from every place listed under it."
            : canDelete ? "These files are not used anywhere and can be deleted." : "These files are not used anywhere. Only an admin can delete files."}
        </p>
        {shown.length ? (
          <div className="media-grid">
            {shown.map(item => <MediaCard key={item.asset._id} item={item} canDelete={canDelete} focused={item.asset._id === focusId} />)}
          </div>
        ) : (
          <div className="admin-empty">
            {term ? "No media matches this search." : view === "used" ? "No media is in use yet." : items.length ? "Every file is in use." : "No media yet. Upload a file above."}
          </div>
        )}
      </section>
    </>
  );
}

function MediaCard({ item: { asset, uses }, canDelete, focused = false }: { item: Item; canDelete: boolean; focused?: boolean }) {
  const navigation = useNavigate();
  const { busy, track } = useTask();
  const [editing, setEditing] = useState(focused);
  const altId = `media-alt-${asset._id}`;

  useEffect(() => {
    if (focused) focusSeoField(altId);
  }, [focused, altId]);
  const [alt, setAlt] = useState(asset.altText);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [blockedBy, setBlockedBy] = useState<MediaUse[]>([]);
  const places = blockedBy.length ? blockedBy : uses;

  async function copyUrl() {
    setError("");
    try {
      await navigator.clipboard.writeText(asset.url);
      setNote("URL copied.");
    } catch {
      setError("Could not copy. Select the address in the browser instead.");
    }
  }

  function saveAlt() {
    setError("");
    return track(async () => {
      try {
        const response = await fetch(`/api/media/${asset._id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ altText: alt }) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Could not save the alt text.");
        setEditing(false);
        setNote("Alt text saved.");
        navigation.refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not save the alt text.");
      }
    });
  }

  function remove() {
    if (!window.confirm("Delete this file from the Media Library and Cloudinary? This cannot be undone.")) return;
    setError("");
    return track(async () => {
      try {
        const response = await fetch(`/api/media/${asset._id}`, { method: "DELETE" });
        const result = await response.json();
        if (response.status === 409 && Array.isArray(result.uses)) {
          // It came into use after this page loaded; show where.
          setBlockedBy(result.uses as MediaUse[]);
          throw new Error(result.error);
        }
        if (!response.ok) throw new Error(result.error || "Could not delete the file.");
        if (result.cloudinaryRemoved === false) window.alert("Removed from the library. The Cloudinary file could not be deleted and was left there; it is no longer shown anywhere.");
        navigation.refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not delete the file.");
      }
    });
  }

  return (
    <article className="media-card">
      {/* Cloudinary host configuration is not needed for these server-managed assets. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {asset.kind === "video" ? <video src={asset.url} muted playsInline preload="metadata" /> : <img src={asset.url} alt={asset.altText} loading="lazy" />}
      <div>
        <b>{asset.altText || "Alt text not set"}</b>
        {editing || asset.kind === "video" ? null : <SeoHint checks={mediaSeoChecks(asset).filter(check => check.level !== "ok")} field="image-alt" />}
        <small>{asset.width} × {asset.height} · {asset.format.toUpperCase()} · {Math.round(asset.bytes / 1024)} KB</small>
        <small>Uploaded {new Date(asset.createdAt).toLocaleDateString()}</small>
        {places.length ? (
          <div className="media-uses">
            <span>Used in:</span>
            <ul>{places.map(use => <li key={`${use.href}|${use.label}`}><Link href={use.href}>{use.label}</Link></li>)}</ul>
          </div>
        ) : null}
        {editing ? (
          <div className="media-alt-edit">
            <label className="admin-field">
              <span>Default alt text</span>
              <input id={altId} value={alt} maxLength={300} onChange={event => setAlt(event.target.value)} />
              <SeoHint checks={mediaSeoChecks({ altText: alt })} field="image-alt" />
            </label>
            <p className="field-hint">Changes the library default only. Places that already saved their own alt text keep it.</p>
            <div className="media-card-actions">
              <button className="admin-button" type="button" disabled={busy} onClick={() => void saveAlt()}>{busy ? "Saving…" : "Save"}</button>
              <button className="admin-action" type="button" disabled={busy} onClick={() => { setEditing(false); setAlt(asset.altText); }}>Cancel</button>
            </div>
          </div>
        ) : (
          <div className="media-card-actions">
            <button className="admin-action" type="button" onClick={() => void copyUrl()}>Copy URL</button>
            <button className="admin-action" type="button" onClick={() => { setEditing(true); setNote(""); }}>Edit alt</button>
            {canDelete ? (
              <button className="admin-action is-danger" type="button" disabled={busy || places.length > 0} title={places.length ? "Remove it from the places listed first" : undefined} onClick={() => void remove()}>
                {busy ? "Deleting…" : "Delete"}
              </button>
            ) : null}
          </div>
        )}
        {note ? <p className="field-hint" role="status">{note}</p> : null}
        {error ? <p className="form-error" role="alert">{error}</p> : null}
      </div>
    </article>
  );
}
