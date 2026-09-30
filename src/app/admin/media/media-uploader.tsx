"use client";

import { useRef, useState } from "react";
import { useNavigate } from "@/components/loading/navigation";
import { MAX_BROWSER_UPLOAD_BYTES } from "@/lib/cloudinary-types";
import type { MediaAsset } from "@/lib/repo/types";

export function MediaUploader({ initialAssets }: { initialAssets: MediaAsset[] }) {
  const navigation = useNavigate();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [altText, setAltText] = useState("");
  const [uploaded, setUploaded] = useState<{ asset: MediaAsset; reused: boolean } | null>(null);

  async function upload(file: File) {
    setError("");
    setUploaded(null);
    if (!file.type.startsWith("image/")) return setError("Choose an image file.");
    if (!file.size || file.size > MAX_BROWSER_UPLOAD_BYTES) return setError("Choose an image up to 4 MB.");

    setBusy(true);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("altText", altText);
      const response = await fetch("/api/media/upload", { method: "POST", body: form });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Upload failed.");
      setUploaded(result as { asset: MediaAsset; reused: boolean });
      setAltText("");
      navigation.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Upload failed.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

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
          accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
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
        <div className="section-top"><h2 id="media-library-title">Saved images</h2><span>{initialAssets.length} images</span></div>
        {initialAssets.length ? (
          <div className="media-grid">
            {initialAssets.map(asset => (
              <article className="media-card" key={asset._id}>
                {/* Cloudinary host configuration is not needed for these server-managed assets. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={asset.url} alt={asset.altText} loading="lazy" />
                <div><b>{asset.altText || "Alt text not set"}</b><small>{asset.width} × {asset.height} · {asset.format.toUpperCase()}</small></div>
              </article>
            ))}
          </div>
        ) : <div className="admin-empty">No images yet. Upload one above to use it on the homepage.</div>}
      </section>
    </>
  );
}
