import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { errorResponse } from "@/lib/api";
import { getCloudinary, deleteCloudinaryImage } from "@/lib/cloudinary";
import { MAX_VIDEO_UPLOAD_BYTES } from "@/lib/cloudinary-types";
import { mediaRepo } from "@/lib/repo";

export const runtime = "nodejs";
const bodySchema = z.object({ publicId: z.string().uuid(), altText: z.string().trim().max(300) }).strict();

export async function POST(request: Request) {
  try {
    await requireRole("editor");
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: "Invalid upload origin." }, { status: 403 });
    const { publicId, altText } = bodySchema.parse(await request.json());
    const existing = (await mediaRepo.list()).find(asset => asset.kind === "video" && asset.publicId === publicId);
    if (existing) return NextResponse.json({ asset: existing, reused: true });
    const uploaded = await getCloudinary().api.resource(publicId, { resource_type: "video" });
    if (uploaded.asset_folder !== process.env.CLOUDINARY_ASSET_FOLDER?.trim() || uploaded.format !== "mp4" || uploaded.resource_type !== "video") {
      return NextResponse.json({ error: "The uploaded video is not in the approved media folder." }, { status: 400 });
    }
    if (!uploaded.bytes || uploaded.bytes > MAX_VIDEO_UPLOAD_BYTES) {
      await deleteCloudinaryImage(publicId, "video");
      return NextResponse.json({ error: "Choose an MP4 video up to 50 MB." }, { status: 413 });
    }
    if (!uploaded.secure_url || !uploaded.width || !uploaded.height || !uploaded.asset_id) {
      return NextResponse.json({ error: "Cloudinary did not return a usable video." }, { status: 400 });
    }
    const asset = await mediaRepo.create({
      url: uploaded.secure_url, publicId: uploaded.public_id, assetId: uploaded.asset_id,
      assetFolder: uploaded.asset_folder, width: uploaded.width, height: uploaded.height,
      format: uploaded.format, bytes: uploaded.bytes, altText, kind: "video",
    });
    return NextResponse.json({ asset, reused: false }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}
