/** Shared shape for the upload response; contains no credentials or server SDK. */
export const MAX_IMAGE_UPLOAD_BYTES = 10 * 1024 * 1024;
// Leave room for multipart overhead below common serverless request limits.
export const MAX_BROWSER_UPLOAD_BYTES = 4 * 1024 * 1024;
export const MAX_VIDEO_UPLOAD_BYTES = 50 * 1024 * 1024;
export const VIDEO_UPLOAD_ACCEPT = "video/mp4";

export interface UploadedImage {
  url: string;
  publicId: string;
  assetId: string;
  assetFolder: string;
  width: number;
  height: number;
  format: string;
  bytes: number;
}

/** The file picker filter for every image upload; matches cloudinary.ts allowed_formats. */
export const IMAGE_UPLOAD_ACCEPT = "image/jpeg,image/png,image/webp,image/gif,image/avif";
