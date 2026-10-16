import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { errorResponse } from "@/lib/api";

export async function PATCH() {
  try {
    await requireRole("editor");
    return NextResponse.json({ error: "Homepage image editing has moved to Section visuals.", editor: "/admin/visuals" }, { status: 410 });
  } catch (error) { return errorResponse(error); }
}
