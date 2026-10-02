import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { requireRole } from "@/lib/auth";
import { deleteCloudinaryImage, uploadCloudinaryImage, uploadCloudinaryVideo } from "@/lib/cloudinary";
import { MAX_BROWSER_UPLOAD_BYTES, MAX_VIDEO_UPLOAD_BYTES } from "@/lib/cloudinary-types";
import { errorResponse } from "@/lib/api";
import { mediaRepo } from "@/lib/repo";
import { z } from "zod";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    await requireRole("editor");

    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) {
      return NextResponse.json({ error: "Invalid upload origin." }, { status: 403 });
    }

    const contentLength = Number(request.headers.get("content-length"));
    if (contentLength > MAX_VIDEO_UPLOAD_BYTES + 128 * 1024) {
      return NextResponse.json({ error: "Choose a video up to 50 MB." }, { status: 413 });
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || !(file.type.startsWith("image/") || ["video/mp4", "video/webm"].includes(file.type))) {
      return NextResponse.json({ error: "Choose a JPG, PNG, WebP, GIF, AVIF, MP4 or WebM file." }, { status: 400 });
    }
    const kind = file.type.startsWith("video/") ? "video" : "image";
    const limit = kind === "video" ? MAX_VIDEO_UPLOAD_BYTES : MAX_BROWSER_UPLOAD_BYTES;
    if (!file.size || file.size > limit) {
      return NextResponse.json({ error: kind === "video" ? "Choose a video up to 50 MB." : "Choose an image up to 4 MB." }, { status: 413 });
    }

    const altText = z.string().trim().max(300).catch("").parse(form.get("altText") ?? "");
    const bytes = Buffer.from(await file.arrayBuffer());
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const existing = await mediaRepo.findByChecksum(sha256);
    if (existing) return NextResponse.json({ asset: existing, reused: true });

    const uploaded = kind === "video" ? await uploadCloudinaryVideo(bytes) : await uploadCloudinaryImage(bytes);
    try {
      const asset = await mediaRepo.create({ ...uploaded, sha256, altText, kind });
      return NextResponse.json({ asset, reused: false }, { status: 201 });
    } catch (error) {
      // A second request may have uploaded the same bytes after our first lookup.
      const racedAsset = await mediaRepo.findByChecksum(sha256).catch(() => null);
      try {
        await deleteCloudinaryImage(uploaded.publicId, kind);
      } catch {
        console.error("[media] duplicate upload cleanup failed");
      }
      if (racedAsset) return NextResponse.json({ asset: racedAsset, reused: true });
      throw error;
    }
  } catch (error) {
    return errorResponse(error);
  }
}
