import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { mediaRepo } from "@/lib/repo";

/** Read-only list for the image chooser; moderators may pick, only editors upload. */
export async function GET() {
  try {
    await requireRole("moderator");
    return NextResponse.json(await mediaRepo.list());
  } catch (error) {
    return errorResponse(error);
  }
}
