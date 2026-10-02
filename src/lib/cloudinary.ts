import "server-only";

import { v2 as cloudinary } from "cloudinary";
import { randomUUID } from "node:crypto";
import { MAX_IMAGE_UPLOAD_BYTES, type UploadedImage } from "./cloudinary-types";

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing Cloudinary configuration: ${name}`);
  return value;
}

/** Configure only when called, so builds do not require live credentials. */
export function getCloudinary() {
  cloudinary.config({
    cloud_name: requiredEnv("CLOUDINARY_CLOUD_NAME"),
    api_key: requiredEnv("CLOUDINARY_API_KEY"),
    api_secret: requiredEnv("CLOUDINARY_API_SECRET"),
    secure: true,
  });
  return cloudinary;
}

/**
 * Upload image bytes to the configured Dynamic folder using the Node.js runtime.
 * Callers must authorize the user before calling this function and save the
 * returned URL/publicId themselves. Accept bytes only, never a user-provided URL.
 */
export async function uploadCloudinaryImage(bytes: Buffer): Promise<UploadedImage> {
  if (!Buffer.isBuffer(bytes) || bytes.length === 0) {
    throw new Error("Choose a non-empty image file.");
  }
  if (bytes.length > MAX_IMAGE_UPLOAD_BYTES) {
    throw new Error("Images must be 10 MB or smaller.");
  }

  const client = getCloudinary();
  const assetFolder = requiredEnv("CLOUDINARY_ASSET_FOLDER");

  return new Promise((resolve, reject) => {
    const stream = client.uploader.upload_stream(
      {
        resource_type: "image",
        type: "upload",
        asset_folder: assetFolder,
        allowed_formats: ["jpg", "jpeg", "png", "webp", "gif", "avif"],
        overwrite: false,
        timeout: 60_000,
      },
      (error, result) => {
        if (error) {
          // Do not propagate provider details or credentials to a future API response.
          reject(new Error("Cloudinary image upload failed. Please try again."));
          return;
        }
        if (!result) {
          reject(new Error("Cloudinary returned no upload result."));
          return;
        }
        resolve({
          url: result.secure_url,
          publicId: result.public_id,
          assetId: result.asset_id,
          assetFolder: result.asset_folder,
          width: result.width,
          height: result.height,
          format: result.format,
          bytes: result.bytes,
        });
      },
    );
    stream.on("error", () => reject(new Error("Cloudinary image upload failed. Please try again.")));
    stream.end(bytes);
  });
}

/** The browser sends video bytes to Cloudinary directly; the API secret stays here. */
export function signVideoUpload() {
  const client = getCloudinary();
  const timestamp = Math.floor(Date.now() / 1000);
  const publicId = randomUUID();
  const assetFolder = requiredEnv("CLOUDINARY_ASSET_FOLDER");
  const params = { timestamp, public_id: publicId, asset_folder: assetFolder };
  const signature = client.utils.api_sign_request(params, requiredEnv("CLOUDINARY_API_SECRET"));
  return {
    uploadUrl: `https://api.cloudinary.com/v1_1/${requiredEnv("CLOUDINARY_CLOUD_NAME")}/video/upload`,
    apiKey: requiredEnv("CLOUDINARY_API_KEY"), timestamp, publicId, assetFolder, signature,
  };
}

/**
 * Remove an image from Cloudinary: a library delete (api/media/[id]), or a
 * just-uploaded copy when a concurrent request already stored the same file.
 */
export async function deleteCloudinaryImage(publicId: string, kind: "image" | "video" = "image"): Promise<void> {
  try {
    const result = await getCloudinary().uploader.destroy(publicId, { resource_type: kind, type: "upload", invalidate: true });
    if (result.result !== "ok" && result.result !== "not found") {
      throw new Error("Cloudinary cleanup did not complete.");
    }
  } catch {
    throw new Error("Cloudinary cleanup failed.");
  }
}
