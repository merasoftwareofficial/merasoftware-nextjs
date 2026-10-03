import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { errorResponse } from "@/lib/api";
import { requireSameOrigin } from "@/lib/portfolio/integration-auth";
import { editorialSchema, webUrl } from "@/lib/portfolio/rules";
import { portfolioRepo } from "@/lib/portfolio/repo";
import { mediaRepo } from "@/lib/repo";
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireRole("editor");
    const entry = await portfolioRepo.find((await context.params).id);
    return NextResponse.json(entry ? { entry } : { error: "Project not found." }, { status: entry ? 200 : 404, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return errorResponse(error); }
}
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireRole("editor"); requireSameOrigin(request);
    const { id } = await context.params;
    const data = editorialSchema.parse(await request.json());
    const before = await portfolioRepo.find(id);
    if (!before) return NextResponse.json({ error: "Project not found." }, { status: 404 });
    const duplicate = await portfolioRepo.findBySlug(data.slug);
    if (duplicate && duplicate._id !== id) return NextResponse.json({ error: "That URL slug is already used." }, { status: 409 });
    for (const image of [...(data.cover ? [data.cover] : []), ...data.gallery]) {
      const asset = await mediaRepo.findById(image.assetId);
      if (!asset || asset.kind === "video" || asset.url !== image.url) throw new Error("Choose an image from the Media Library.");
    }
    if (data.status === "published" && (!data.summary || !data.cover || !data.category)) throw new Error("Add a summary, category and cover image before publishing.");
    const entry = await portfolioRepo.update(id, data);
    if (!entry) return NextResponse.json({ error: "Source is unavailable or this service belongs to another project." }, { status: 409 });
    return NextResponse.json({ entry });
  } catch (error) { return errorResponse(error); }
}
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireRole("editor"); requireSameOrigin(request);
    const { id } = await context.params;
    const url = webUrl.refine(Boolean, "Enter a website URL first.").parse((await request.json()).url);
    const entry = await portfolioRepo.queueCapture(id, url);
    return NextResponse.json({ entry });
  } catch (error) { return errorResponse(error); }
}
