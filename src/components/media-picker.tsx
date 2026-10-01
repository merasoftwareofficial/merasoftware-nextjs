"use client";
/* eslint @next/next/no-img-element: off -- Cloudinary URLs are not configured for next/image. */

import { useState } from "react";
import { ImageChooser, type ImageChoice, type ImageSources } from "@/components/image-chooser";

/**
 * A form field holding one image: shows the current one and opens the image
 * chooser to upload, pick from the Media Library or (where allowed) paste a URL.
 * `fromLibrary` says whether the current image is a library asset.
 */
export function MediaPicker({ url, fromLibrary, sources, onChoose, onRemove }: { url: string; fromLibrary: boolean; sources: ImageSources; onChoose: (choice: ImageChoice) => void; onRemove: () => void }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="admin-field media-picker">
      <span>Image</span>
      {url ? (
        <div className="media-picker-current">
          <img src={url} alt="" />
          <small>{fromLibrary ? "From the Media Library" : "Outside image URL (not in the Media Library)"}</small>
        </div>
      ) : (
        <small>No image chosen.</small>
      )}
      <div className="media-picker-actions">
        <button className="admin-action" type="button" onClick={() => setOpen(true)}>
          {url ? "Change image" : "Choose image"}
        </button>
        {url ? (
          <button className="admin-action" type="button" onClick={onRemove}>
            Remove
          </button>
        ) : null}
      </div>
      {open ? (
        <ImageChooser
          sources={sources}
          onClose={() => setOpen(false)}
          onChoose={choice => {
            onChoose(choice);
            setOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}
