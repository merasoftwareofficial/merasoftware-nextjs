import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { mediaRepo } from "@/lib/repo";

export async function GET() {
  try {
    await requireRole("editor");
    return NextResponse.json(await mediaRepo.list());
  } catch (error) {
    return errorResponse(error);
  }
}
