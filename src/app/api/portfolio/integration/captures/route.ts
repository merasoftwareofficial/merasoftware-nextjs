import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { z } from "zod";
import { errorResponse } from "@/lib/api";
import { requirePortfolioIntegration } from "@/lib/portfolio/integration-auth";
import { portfolioRepo } from "@/lib/portfolio/repo";
import { deleteCloudinaryImage, uploadCloudinaryImage } from "@/lib/cloudinary";
import { mediaRepo } from "@/lib/repo";
import type { PortfolioImage } from "@/lib/portfolio/types";
export const runtime = "nodejs";
export const maxDuration = 120;
export async function POST(request: Request) {
  try {
    requirePortfolioIntegration(request);
    const row = await portfolioRepo.claimCapture();
    return NextResponse.json({ job: row ? { id: row._id, token: row.capture.token, url: row.capture.url } : null });
  } catch (error) { return errorResponse(error); }
}
export async function PUT(request: Request) {
  try {
    requirePortfolioIntegration(request);
    if (request.headers.get("content-type")?.includes("application/json")) {
      const body = z.object({ id: z.string(), token: z.string(), error: z.string().min(1).max(300) }).parse(await request.json());
      const accepted = await portfolioRepo.finishCapture(body.id, body.token, [], body.error);
      return NextResponse.json({ accepted }, { status: accepted ? 200 : 409 });
    }
    if (Number(request.headers.get("content-length")) > 4_000_000) return NextResponse.json({ error: "Capture too large." }, { status: 413 });
    const form = await request.formData();
    const id = z.string().min(1).parse(form.get("id"));
    const token = z.string().min(1).parse(form.get("token"));
    const row = await portfolioRepo.find(id);
    if (!row || row.capture.token !== token || row.capture.status !== "running" || row.capture.leaseUntil < Date.now()) return NextResponse.json({ accepted: false }, { status: 409 });
    const candidates: PortfolioImage[] = [];
    for (const mode of ["desktop", "mobile"]) {
      const file = form.get(mode);
      if (!(file instanceof File) || file.type !== "image/jpeg" || !file.size || file.size > 1_800_000) throw new Error("Expected desktop and mobile JPEG captures under 1.8 MB each.");
      const bytes = Buffer.from(await file.arrayBuffer());
      if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error("Invalid capture image.");
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      let asset = await mediaRepo.findByChecksum(sha256);
      if (!asset) {
        const uploaded = await uploadCloudinaryImage(bytes);
        try { asset = await mediaRepo.create({ ...uploaded, sha256, altText: `${row.title} — ${mode} screenshot` }); }
        catch (error) {
          const existing = await mediaRepo.findByChecksum(sha256);
          await deleteCloudinaryImage(uploaded.publicId).catch(() => undefined);
          if (!existing) throw error;
          asset = existing;
        }
      }
      candidates.push({ assetId: asset._id, url: asset.url, alt: `${row.title} — ${mode} screenshot`, focalX: 50, focalY: 0 });
    }
    const accepted = await portfolioRepo.finishCapture(id, token, candidates);
    return NextResponse.json({ accepted }, { status: accepted ? 200 : 409 });
  } catch (error) { return errorResponse(error); }
}
