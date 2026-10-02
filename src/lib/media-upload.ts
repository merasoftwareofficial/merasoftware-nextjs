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

export function mediaFileProblem(file: File): string | null {
  if (file.type.startsWith("image/")) return imageFileProblem(file);
  if (!["video/mp4", "video/webm"].includes(file.type)) return "Choose an image or an MP4/WebM video.";
  if (!file.size || file.size > MAX_VIDEO_UPLOAD_BYTES) return "Choose a video up to 50 MB.";
  return null;
}

export async function uploadToLibrary(file: File, altText: string): Promise<{ asset: MediaAsset; reused: boolean }> {
  const problem = mediaFileProblem(file);
  if (problem) throw new Error(problem);
  const form = new FormData();
  form.set("file", file);
  form.set("altText", altText);
  const response = await fetch("/api/media/upload", { method: "POST", body: form });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Upload failed.");
  return result as { asset: MediaAsset; reused: boolean };
}
