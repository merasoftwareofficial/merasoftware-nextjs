"use client";

import { useRef, useState } from "react";
import { MAX_BROWSER_UPLOAD_BYTES, type UploadedImage } from "@/lib/cloudinary-types";

export function MediaUploader() {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [uploaded, setUploaded] = useState<UploadedImage | null>(null);

  async function upload(file: File) {
    setError("");
    setUploaded(null);
    if (!file.type.startsWith("image/")) {
      setError("Choose an image file.");
      return;
    }
    if (!file.size || file.size > MAX_BROWSER_UPLOAD_BYTES) {
      setError("Choose an image up to 4 MB.");
      return;
    }

    setBusy(true);
    try {
      const form = new FormData();
      form.set("file", file);
      const response = await fetch("/api/media/upload", { method: "POST", body: form });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Upload failed.");
      setUploaded(result as UploadedImage);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Upload failed.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <section className="media-drop">
      <span aria-hidden="true">↑</span>
      <h2>Upload a photo</h2>
      <p>Choose a JPG, PNG, WebP, GIF or AVIF image up to 4 MB. The result will appear below.</p>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
        aria-label="Choose a photo to upload"
        style={{ display: "none" }}
        onChange={event => {
          const file = event.currentTarget.files?.[0];
          if (file) void upload(file);
        }}
      />
      <button className="admin-button" type="button" disabled={busy} onClick={() => input.current?.click()}>
        {busy ? "Uploading…" : "Choose photo"}
      </button>
      {error ? <p role="alert" style={{ color: "var(--pn-err)", marginTop: 20 }}>{error}</p> : null}
      {uploaded ? (
        <div style={{ margin: "28px auto 0", maxWidth: 480, overflowWrap: "anywhere" }}>
          {/* Cloudinary hosts are not configured for next/image; this is a single admin preview. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={uploaded.url} alt="Photo uploaded to Cloudinary" style={{ maxWidth: "100%", maxHeight: 320 }} />
          <p role="status">Upload complete. Folder: {uploaded.assetFolder}</p>
          <p><a href={uploaded.url} target="_blank" rel="noopener noreferrer">Open photo URL ↗</a></p>
          <p><button className="admin-button secondary" type="button" onClick={() => void navigator.clipboard.writeText(uploaded.url)}>Copy image URL</button></p>
        </div>
      ) : null}
    </section>
  );
}
