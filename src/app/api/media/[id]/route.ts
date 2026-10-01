/**
 * PATCH  /api/media/[id]   change the library's default alt text (editor)
 * DELETE /api/media/[id]   remove an unused image from the library and Cloudinary (admin)
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { deleteCloudinaryImage } from "@/lib/cloudinary";
import { findMediaUsage } from "@/lib/media-usage";
import { mediaRepo } from "@/lib/repo";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({ altText: z.string().trim().max(300) }).strict();

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    await requireRole("editor");
    const { altText } = patchSchema.parse(await request.json());
    const asset = await mediaRepo.updateAltText(id, altText);
    if (!asset) return NextResponse.json({ error: "Image not found." }, { status: 404 });
    return NextResponse.json(asset);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    await requireRole("admin");
    const asset = await mediaRepo.findById(id);
    if (!asset) return NextResponse.json({ error: "Image not found." }, { status: 404 });

    // Checked again here, not trusted from the page: it may have been used since the page loaded.
    const uses = (await findMediaUsage([asset])).get(asset._id) ?? [];
    if (uses.length) {
      return NextResponse.json({ error: "This image is in use. Remove it from these places first.", uses }, { status: 409 });
    }

    // Record first: if Cloudinary then fails, only an unused file is left behind, never a broken image on the site.
    if (!(await mediaRepo.remove(asset._id))) return NextResponse.json({ error: "Image not found." }, { status: 404 });
    try {
      await deleteCloudinaryImage(asset.publicId);
    } catch {
      console.error(`[media] Cloudinary file left behind after delete: ${asset.publicId}`);
      return NextResponse.json({ deleted: true, cloudinaryRemoved: false });
    }
    return NextResponse.json({ deleted: true, cloudinaryRemoved: true });
  } catch (error) {
    return errorResponse(error);
  }
}
