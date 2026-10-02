"use client";
/* eslint @next/next/no-img-element: off -- Cloudinary and outside URLs are not configured for next/image. */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IMAGE_UPLOAD_ACCEPT, VIDEO_UPLOAD_ACCEPT } from "@/lib/cloudinary-types";
import { imageFileProblem, uploadToLibrary, uploadVideoToLibrary } from "@/lib/media-upload";
import { atLeast } from "@/lib/roles";
import type { MediaAsset, Role } from "@/lib/repo/types";

/** Which ways of choosing an image this place offers. */
export interface ImageSources {
  upload: boolean;
  library: boolean;
  url: boolean;
}

export type ImageChoice =
  | { kind: "library"; asset: MediaAsset; uploaded: boolean; reused: boolean }
  | { kind: "url"; url: string; alt: string };

/**
 * The one rule for who may use which source. Website sections pass
 * allowUrl: false (library images only); posts and articles pass true.
 * Members never see the library or upload to our Cloudinary.
 */
export function imageSourcesFor(role: Role, { allowUrl }: { allowUrl: boolean }): ImageSources {
  return { upload: atLeast(role, "editor"), library: atLeast(role, "moderator"), url: allowUrl };
}

type Tab = keyof ImageSources;
const TAB_LABELS: Record<Tab, string> = { upload: "Upload", library: "Media Library", url: "Image URL" };

/**
 * Modal for choosing an image: upload a new one, pick from the Media Library,
 * or (where allowed) paste an outside URL. Render it only while open.
 * `minSize`, when given, warns before uploading an image smaller than that.
 */
export function ImageChooser({
  sources,
  minSize,
  allowVideo = false,
  onChoose,
  onClose,
}: {
  sources: ImageSources;
  minSize?: { width: number; height: number; recommended: string };
  allowVideo?: boolean;
  onChoose: (choice: ImageChoice) => void;
  onClose: () => void;
}) {
  const tabs = (["library", "upload", "url"] as Tab[]).filter(tab => sources[tab]);
  const [tab, setTab] = useState<Tab | undefined>(tabs[0]);
  const dialog = useRef<HTMLDivElement>(null);
  // Latest onClose without re-running the effect: a parent re-render must not move focus.
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; });

  useEffect(() => {
    dialog.current?.focus();
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") closeRef.current(); };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, []);

  // Portalled to <body> so a sticky or transformed ancestor (editor toolbar, form) cannot clip it.
  return createPortal(
    <div className="image-chooser-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="image-chooser" role="dialog" aria-modal="true" aria-labelledby="image-chooser-title" tabIndex={-1} ref={dialog}>
        <div className="image-chooser-head">
          <h2 id="image-chooser-title">Choose {allowVideo ? "image, GIF or video" : "image"}</h2>
          <button className="admin-action" type="button" onClick={onClose}>Close</button>
        </div>
        {tabs.length > 1 ? (
          <div className="homepage-editor-tabs" role="tablist">
            {tabs.map(item => (
              <button key={item} type="button" role="tab" aria-selected={tab === item} onClick={() => setTab(item)}>{TAB_LABELS[item]}</button>
            ))}
          </div>
        ) : null}
        {tab === "library" ? <LibraryTab allowVideo={allowVideo} onChoose={asset => onChoose({ kind: "library", asset, uploaded: false, reused: false })} /> : null}
        {tab === "upload" ? <UploadTab allowVideo={allowVideo} minSize={minSize} onChoose={onChoose} /> : null}
        {tab === "url" ? <UrlTab onChoose={onChoose} /> : null}
        {!tab ? <p className="field-hint">You cannot add images here.</p> : null}
      </div>
    </div>,
    document.body,
  );
}

function LibraryTab({ onChoose, allowVideo }: { onChoose: (asset: MediaAsset) => void; allowVideo: boolean }) {
  const [assets, setAssets] = useState<MediaAsset[] | null>(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    let live = true;
    // Fetched on open so an image uploaded a moment ago elsewhere is listed.
    fetch("/api/media")
      .then(async response => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Could not load the Media Library.");
        if (live) setAssets(result as MediaAsset[]);
      })
      .catch(cause => { if (live) setError(cause instanceof Error ? cause.message : "Could not load the Media Library."); });
    return () => { live = false; };
  }, []);

  if (error) return <p className="form-error" role="alert">{error}</p>;
  if (!assets) return <p className="field-hint">Loading the Media Library…</p>;

  const term = search.trim().toLowerCase();
  const available = assets.filter(asset => allowVideo || asset.kind !== "video");
  const shown = term ? available.filter(asset => `${asset.altText} ${asset.publicId} ${asset.format}`.toLowerCase().includes(term)) : available;

  return (
    <>
      <label className="admin-field">
        <span>Search</span>
        <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Alt text, file name or format" />
      </label>
      {shown.length ? (
        <div className="homepage-library-picker image-chooser-grid" aria-label="Media Library images">
          {shown.map(asset => (
            <button type="button" key={asset._id} onClick={() => onChoose(asset)}>
              {asset.kind === "video" ? <video src={asset.url} muted playsInline preload="metadata" /> : <img src={asset.url} alt="" loading="lazy" />}
              <span>
                {asset.altText || asset.publicId.split("/").at(-1) || "Image"}
                <small>{asset.width} × {asset.height} px</small>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <p className="field-hint">{available.length ? "No media matches this search." : "The Media Library is empty. Upload a file first."}</p>
      )}
    </>
  );
}

function UploadTab({ minSize, onChoose, allowVideo }: { minSize?: { width: number; height: number; recommended: string }; onChoose: (choice: ImageChoice) => void; allowVideo: boolean }) {
  const [altText, setAltText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [lowResolution, setLowResolution] = useState<{ file: File; width: number; height: number } | null>(null);

  async function upload(file: File) {
    setBusy(true);
    try {
      const { asset, reused } = file.type === "video/mp4" ? await uploadVideoToLibrary(file, altText) : await uploadToLibrary(file, altText);
      onChoose({ kind: "library", asset, uploaded: !reused, reused });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  async function pick(file: File) {
    setError("");
    setLowResolution(null);
    const problem = file.type === "video/mp4" && allowVideo ? null : imageFileProblem(file);
    if (problem) return setError(problem);
    if (minSize && file.type.startsWith("image/")) {
      try {
        const bitmap = await createImageBitmap(file);
        const { width, height } = bitmap;
        bitmap.close();
        if (width < minSize.width || height < minSize.height) return setLowResolution({ file, width, height });
      } catch {
        return setError("Could not read the image size. Choose a JPG, PNG, WebP, GIF or AVIF image.");
      }
    }
    await upload(file);
  }

  return (
    <>
      <p className="field-hint">
        JPG, PNG, WebP, GIF or AVIF up to 4 MB{minSize ? `. Recommended: ${minSize.recommended}` : ""}.{allowVideo ? " MP4 videos up to 50 MB upload directly to Cloudinary." : ""} An image already in the library is reused.
      </p>
      <label className="admin-field">
        <span>Default alt text</span>
        <input value={altText} maxLength={300} onChange={event => setAltText(event.target.value)} placeholder="Describe what the image shows" />
      </label>
      <label className="admin-button image-chooser-file">
        {busy ? "Uploading…" : "Choose file"}
        <input type="file" accept={allowVideo ? `${IMAGE_UPLOAD_ACCEPT},${VIDEO_UPLOAD_ACCEPT}` : IMAGE_UPLOAD_ACCEPT} disabled={busy} onChange={event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; if (file) void pick(file); }} />
      </label>
      {lowResolution && minSize ? (
        <div className="homepage-low-resolution-confirm" role="alert">
          <p>The selected image is {lowResolution.width} × {lowResolution.height} px. The recommended size is {minSize.recommended}; it may look blurry on desktop.</p>
          <div>
            <button className="admin-button" type="button" disabled={busy} onClick={() => { const file = lowResolution.file; setLowResolution(null); void upload(file); }}>Upload anyway</button>
            <button className="admin-action" type="button" onClick={() => setLowResolution(null)}>Cancel</button>
          </div>
        </div>
      ) : null}
      {error ? <p className="form-error" role="alert">{error}</p> : null}
    </>
  );
}

function UrlTab({ onChoose }: { onChoose: (choice: ImageChoice) => void }) {
  const [url, setUrl] = useState("");
  const [alt, setAlt] = useState("");
  const [error, setError] = useState("");
  const address = url.trim();

  function submit() {
    try {
      const parsed = new URL(address);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error();
    } catch {
      return setError("Enter a full image address starting with https://");
    }
    onChoose({ kind: "url", url: address, alt: alt.trim() });
  }

  return (
    <>
      <p className="field-hint">An outside image is not stored in the Media Library. If its site removes it, it stops showing here too.</p>
      <label className="admin-field">
        <span>Image URL</span>
        <input value={url} onChange={event => { setUrl(event.target.value); setError(""); }} placeholder="https://example.com/photo.jpg" />
      </label>
      <label className="admin-field">
        <span>Alt text</span>
        <input value={alt} maxLength={300} onChange={event => setAlt(event.target.value)} placeholder="Describe the image (important for SEO)" />
      </label>
      {address.startsWith("http") ? <img className="image-chooser-preview" src={address} alt="" /> : null}
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <button className="admin-button" type="button" disabled={!address} onClick={submit}>Use this image</button>
    </>
  );
}
