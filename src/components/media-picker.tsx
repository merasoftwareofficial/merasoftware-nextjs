"use client";
/* eslint @next/next/no-img-element: off -- Cloudinary URLs are not configured for next/image. */

import { useState } from "react";
import type { MediaAsset } from "@/lib/repo/types";

/**
 * Choose an image from the Media Library instead of pasting its address.
 *
 * Returns the whole asset, so the caller can also take its public id and its
 * default alt text. An image saved before the library existed (a pasted URL
 * that is not in it) still shows, and can be replaced or removed.
 */
export function MediaPicker({ url, assets, onChoose, onRemove }: { url: string; assets: MediaAsset[]; onChoose: (asset: MediaAsset) => void; onRemove: () => void }) {
  const [open, setOpen] = useState(false);
  const current = assets.find(asset => asset.url === url);

  return (
    <div className="admin-field media-picker">
      <span>Image</span>
      {url ? (
        <div className="media-picker-current">
          <img src={url} alt="" />
          <small>{current ? `${current.width} × ${current.height} px` : "Not from the Media Library"}</small>
        </div>
      ) : (
        <small>No image chosen.</small>
      )}
      <div className="media-picker-actions">
        <button className="admin-action" type="button" aria-expanded={open} onClick={() => setOpen(value => !value)}>
          {url ? "Change image" : "Choose from Media Library"}
        </button>
        {url ? (
          <button className="admin-action" type="button" onClick={onRemove}>
            Remove
          </button>
        ) : null}
      </div>
      {open ? (
        <div className="homepage-library-picker" aria-label="Choose an image from Media Library">
          {assets.length ? (
            assets.map(asset => (
              <button
                type="button"
                key={asset._id}
                aria-pressed={asset.url === url}
                onClick={() => {
                  onChoose(asset);
                  setOpen(false);
                }}
              >
                <img src={asset.url} alt="" />
                <span>
                  {asset.altText || "No default alt text"}
                  <small>
                    {asset.width} × {asset.height}
                  </small>
                </span>
              </button>
            ))
          ) : (
            <p>The Media Library is empty. Upload images there first.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
