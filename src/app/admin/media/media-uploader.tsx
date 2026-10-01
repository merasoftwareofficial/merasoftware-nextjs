"use client";

import { useRef, useState } from "react";
import Link from "@/components/link";
import { useNavigate, useTask } from "@/components/loading/navigation";
import { IMAGE_UPLOAD_ACCEPT } from "@/lib/cloudinary-types";
import { imageFileProblem, uploadToLibrary } from "@/lib/media-upload";
import type { MediaUse } from "@/lib/media-usage";
import type { MediaAsset } from "@/lib/repo/types";

type Item = { asset: MediaAsset; uses: MediaUse[] };

export function MediaUploader({ items, canDelete }: { items: Item[]; canDelete: boolean }) {
  const navigation = useNavigate();
  const input = useRef<HTMLInputElement>(null);
  const { busy, track } = useTask();
  const [error, setError] = useState("");
  const [altText, setAltText] = useState("");
  const [uploaded, setUploaded] = useState<{ asset: MediaAsset; reused: boolean } | null>(null);
  const [view, setView] = useState<"unused" | "used">("unused");
  const [search, setSearch] = useState("");

  async function upload(file: File) {
    setError("");
    setUploaded(null);
    const problem = imageFileProblem(file);
    if (problem) return setError(problem);

    await track(async () => {
      try {
        setUploaded(await uploadToLibrary(file, altText));
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
        <h2>Upload an image</h2>
        <p>Choose a JPG, PNG, WebP, GIF or AVIF image up to 4 MB. Add a short description for accessibility.</p>
        <label className="admin-field media-alt-field">
          <span>Default alt text</span>
          <input value={altText} maxLength={300} onChange={event => setAltText(event.target.value)} placeholder="Describe what the image shows" />
        </label>
        <input
          ref={input}
          type="file"
          accept={IMAGE_UPLOAD_ACCEPT}
          aria-label="Choose an image"
          style={{ display: "none" }}
          onChange={event => {
            const file = event.currentTarget.files?.[0];
            if (file) void upload(file);
          }}
        />
        <button className="admin-button" type="button" disabled={busy} onClick={() => input.current?.click()}>
          {busy ? "Uploading…" : "Choose image"}
        </button>
        {error ? <p role="alert" style={{ color: "var(--pn-err)", marginTop: 20 }}>{error}</p> : null}
        {uploaded ? <p role="status" style={{ marginTop: 20 }}>{uploaded.reused ? "This image was already in the library. The existing image was reused; no duplicate was uploaded." : "Image uploaded and saved in the media library."}</p> : null}
      </section>
      <section className="media-library" aria-labelledby="media-library-title">
        <div className="section-top"><h2 id="media-library-title">Saved images</h2><span>{items.length} images</span></div>
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
            ? "These images are on the website or in a post. To delete one, first remove it from every place listed under it."
            : canDelete ? "These images are not used anywhere and can be deleted." : "These images are not used anywhere. Only an admin can delete images."}
        </p>
        {shown.length ? (
          <div className="media-grid">
            {shown.map(item => <MediaCard key={item.asset._id} item={item} canDelete={canDelete} />)}
          </div>
        ) : (
          <div className="admin-empty">
            {term ? "No image matches this search." : view === "used" ? "No image is in use yet." : items.length ? "Every image is in use." : "No images yet. Upload one above."}
          </div>
        )}
      </section>
    </>
  );
}

function MediaCard({ item: { asset, uses }, canDelete }: { item: Item; canDelete: boolean }) {
  const navigation = useNavigate();
  const { busy, track } = useTask();
  const [editing, setEditing] = useState(false);
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
    if (!window.confirm("Delete this image from the Media Library and Cloudinary? This cannot be undone.")) return;
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
        if (!response.ok) throw new Error(result.error || "Could not delete the image.");
        if (result.cloudinaryRemoved === false) window.alert("Removed from the library. The Cloudinary file could not be deleted and was left there; it is no longer shown anywhere.");
        navigation.refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not delete the image.");
      }
    });
  }

  return (
    <article className="media-card">
      {/* Cloudinary host configuration is not needed for these server-managed assets. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={asset.url} alt={asset.altText} loading="lazy" />
      <div>
        <b>{asset.altText || "Alt text not set"}</b>
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
              <input value={alt} maxLength={300} onChange={event => setAlt(event.target.value)} />
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
