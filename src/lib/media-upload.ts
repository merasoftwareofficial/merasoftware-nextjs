import { MAX_BROWSER_UPLOAD_BYTES, MAX_VIDEO_UPLOAD_BYTES } from "@/lib/cloudinary-types";
import type { MediaAsset } from "@/lib/repo/types";

/**
 * The one browser-side way to add an image to the Media Library. Every upload
 * (Media page, image chooser) goes through /api/media/upload, so the
 * duplicate check there (same bytes → existing asset, `reused: true`) applies
 * everywhere.
 */

/** A message for a file the server would refuse anyway, or null when it may be sent. */
export function imageFileProblem(file: File): string | null {
  if (!file.type.startsWith("image/")) return "Choose an image file.";
  if (!file.size || file.size > MAX_BROWSER_UPLOAD_BYTES) return "Choose an image up to 4 MB.";
  return null;
}

export async function uploadToLibrary(file: File, altText: string): Promise<{ asset: MediaAsset; reused: boolean }> {
  const problem = imageFileProblem(file);
  if (problem) throw new Error(problem);
  const form = new FormData();
  form.set("file", file);
  form.set("altText", altText);
  const response = await fetch("/api/media/upload", { method: "POST", body: form });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Upload failed.");
  return result as { asset: MediaAsset; reused: boolean };
}

/** Signed direct upload keeps video bytes away from the 4 MB app request limit. */
export async function uploadVideoToLibrary(file: File, altText: string): Promise<{ asset: MediaAsset; reused: boolean }> {
  if (file.type !== "video/mp4" || !file.size || file.size > MAX_VIDEO_UPLOAD_BYTES) throw new Error("Choose an MP4 video up to 50 MB.");
  const signedResponse = await fetch("/api/media/video/sign", { method: "POST" });
  const signed = await signedResponse.json();
  if (!signedResponse.ok) throw new Error(signed.error || "Could not authorize the video upload.");
  const form = new FormData();
  form.set("file", file);
  form.set("api_key", signed.apiKey);
  form.set("timestamp", String(signed.timestamp));
  form.set("public_id", signed.publicId);
  form.set("asset_folder", signed.assetFolder);
  form.set("signature", signed.signature);
  const uploadedResponse = await fetch(signed.uploadUrl, { method: "POST", body: form });
  const uploaded = await uploadedResponse.json();
  if (!uploadedResponse.ok) throw new Error(uploaded.error?.message || "Cloudinary video upload failed.");
  const completeResponse = await fetch("/api/media/video/complete", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ publicId: signed.publicId, altText }),
  });
  const result = await completeResponse.json();
  if (!completeResponse.ok) throw new Error(result.error || "Video uploaded but could not be saved to the media library.");
  return result as { asset: MediaAsset; reused: boolean };
}
