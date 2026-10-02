import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { requireRole } from "@/lib/auth";
import { deleteCloudinaryImage, uploadCloudinaryImage } from "@/lib/cloudinary";
import { MAX_BROWSER_UPLOAD_BYTES } from "@/lib/cloudinary-types";
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
    if (contentLength > MAX_BROWSER_UPLOAD_BYTES + 128 * 1024) {
      return NextResponse.json({ error: "Choose an image up to 4 MB." }, { status: 413 });
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || !file.type.startsWith("image/")) {
      return NextResponse.json({ error: "Choose an image file." }, { status: 400 });
    }
    if (!file.size || file.size > MAX_BROWSER_UPLOAD_BYTES) {
      return NextResponse.json({ error: "Choose an image up to 4 MB." }, { status: 413 });
    }

    const altText = z.string().trim().max(300).catch("").parse(form.get("altText") ?? "");
    const bytes = Buffer.from(await file.arrayBuffer());
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const existing = await mediaRepo.findByChecksum(sha256);
    if (existing) return NextResponse.json({ asset: existing, reused: true });

    const uploaded = await uploadCloudinaryImage(bytes);
    try {
      const asset = await mediaRepo.create({ ...uploaded, sha256, altText });
      return NextResponse.json({ asset, reused: false }, { status: 201 });
    } catch (error) {
      // A second request may have uploaded the same bytes after our first lookup.
      const racedAsset = await mediaRepo.findByChecksum(sha256).catch(() => null);
      try {
        await deleteCloudinaryImage(uploaded.publicId);
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
