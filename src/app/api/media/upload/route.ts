import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { uploadCloudinaryImage } from "@/lib/cloudinary";
import { MAX_BROWSER_UPLOAD_BYTES } from "@/lib/cloudinary-types";
import { errorResponse } from "@/lib/api";

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

    const uploaded = await uploadCloudinaryImage(Buffer.from(await file.arrayBuffer()));
    return NextResponse.json(uploaded, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
