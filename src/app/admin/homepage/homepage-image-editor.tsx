"use client";

import Link from "@/components/link";
import { useState } from "react";
import { useTask } from "@/components/loading/navigation";
import { MAX_BROWSER_UPLOAD_BYTES } from "@/lib/cloudinary-types";
import type { HomeImageSlot, HomepageImage, MediaAsset } from "@/lib/repo/types";

type ImageMap = Partial<Record<HomeImageSlot, HomepageImage>>;
const slots: { key: HomeImageSlot; label: string; note: string }[] = [
  { key: "hero", label: "Hero artwork", note: "Adds an image to the current artwork area." },
  { key: "work-northstar", label: "Northstar Advisory", note: "Image for the first selected-work card." },
  { key: "work-oasis", label: "Oasis Living", note: "Image for the second selected-work card." },
];

export function HomepageImageEditor({ initialImages, assets }: { initialImages: ImageMap; assets: MediaAsset[] }) {
  const [images, setImages] = useState<ImageMap>(initialImages);
  const [library, setLibrary] = useState(assets);
  const { busy, track } = useTask();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function update(slot: HomeImageSlot, patch: Partial<HomepageImage>) {
    setImages(current => ({ ...current, [slot]: { assetId: "", alt: "", focalX: 50, focalY: 50, ...current[slot], ...patch } }));
  }

  function choose(slot: HomeImageSlot, assetId: string) {
    if (!assetId) {
      setImages(current => {
        const next = { ...current };
        delete next[slot];
        return next;
      });
      return;
    }
    const asset = assets.find(item => item._id === assetId);
    update(slot, { assetId, alt: asset?.altText ?? "" });
  }

  async function uploadForSlot(slot: HomeImageSlot, file: File) {
    setError("");
    setMessage("");
    if (!file.type.startsWith("image/")) return setError("Choose an image file.");
    if (!file.size || file.size > MAX_BROWSER_UPLOAD_BYTES) return setError("Choose an image up to 4 MB.");

    await track(async () => {
      try {
        const form = new FormData();
        form.set("file", file);
        form.set("altText", images[slot]?.alt ?? "");
        const response = await fetch("/api/media/upload", { method: "POST", body: form });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Upload failed.");
        const { asset, reused } = result as { asset: MediaAsset; reused: boolean };
        setLibrary(current => [asset, ...current.filter(item => item._id !== asset._id)]);
        setImages(current => ({ ...current, [slot]: { assetId: asset._id, alt: asset.altText, focalX: 50, focalY: 50 } }));
        setMessage(reused
          ? "This image was already in the library. The existing image is now attached to this slot."
          : "Uploaded once, saved in the shared library, and attached to this slot.");
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Upload failed.");
      }
    });
  }

  const save = () =>
    track(async () => {
      setMessage("");
      setError("");
      try {
        const response = await fetch("/api/homepage/images", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(Object.fromEntries(slots.map(({ key }) => [key, images[key] ?? null]))),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Could not save homepage images.");
        setImages(result as ImageMap);
        setMessage("Homepage images saved.");
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not save homepage images.");
      }
    });

  return (
    <section className="admin-form">
      <div className="homepage-image-heading">
        <div><h2>Homepage images</h2><p className="field-hint">Text and layout stay the same. Add images only where they fit the existing design.</p></div>
        <Link className="admin-action" href="/admin/media">Open media library ↗</Link>
      </div>
      {slots.map(({ key, label, note }) => {
        const current = images[key];
        const asset = library.find(item => item._id === current?.assetId);
        return (
          <article className="homepage-image-slot" key={key}>
            <div className="homepage-image-slot-head"><div><h3>{label}</h3><p>{note}</p></div>{current ? <button className="admin-action" type="button" onClick={() => choose(key, "")}>Remove</button> : null}</div>
            <label className="admin-field">
              <span>Choose an image</span>
              <select value={current?.assetId ?? ""} onChange={event => choose(key, event.target.value)}>
                <option value="">Keep current design without an image</option>
                {library.map(item => <option value={item._id} key={item._id}>{item.altText || item.publicId.split("/").at(-1) || item.format.toUpperCase()}</option>)}
              </select>
            </label>
            <label className="admin-button homepage-upload-button">
              {busy ? "Uploading…" : "Upload image to this slot"}
              <input type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" disabled={busy} onChange={event => { const file = event.currentTarget.files?.[0]; if (file) void uploadForSlot(key, file); event.currentTarget.value = ""; }} />
            </label>
            {asset && current ? (
              <div className="homepage-image-preview">
                {/* Cloudinary assets are served directly and are not configured for next/image. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={asset.url} alt={current.alt} style={{ objectPosition: `${current.focalX}% ${current.focalY}%` }} />
                <div className="homepage-image-fields">
                  <label className="admin-field"><span>Alt text</span><input value={current.alt} maxLength={300} onChange={event => update(key, { alt: event.target.value })} placeholder="Describe this image" /></label>
                  <div className="form-columns">
                    <label className="admin-field"><span>Horizontal crop</span><input type="range" min="0" max="100" value={current.focalX} onChange={event => update(key, { focalX: Number(event.target.value) })} /></label>
                    <label className="admin-field"><span>Vertical crop</span><input type="range" min="0" max="100" value={current.focalY} onChange={event => update(key, { focalY: Number(event.target.value) })} /></label>
                  </div>
                </div>
              </div>
            ) : <p className="field-hint">{library.length ? "No image selected. The current page design remains unchanged." : "Upload an image here or in the media library."}</p>}
          </article>
        );
      })}
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {message ? <p className="status status-live" role="status">{message}</p> : null}
      <div className="form-actions"><button className="admin-button" type="button" disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : "Save homepage images"}</button></div>
    </section>
  );
}
