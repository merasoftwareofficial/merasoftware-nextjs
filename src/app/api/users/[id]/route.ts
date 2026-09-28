/**
 * PATCH /api/users/[id]   change a user's blog role or ban them — admin only
 *
 * Only the website profile changes. The account itself (email, password,
 * portal role) belongs to the client portal; a portal admin stays admin here
 * whatever role is stored (src/lib/auth.ts).
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { userRepo } from "@/lib/repo";

type Params = { params: Promise<{ id: string }> };

const userPatchSchema = z
  .object({
    role: z.enum(["member", "moderator", "editor", "admin"]).optional(),
    banned: z.boolean().optional(),
  })
  .refine(patch => patch.role !== undefined || patch.banned !== undefined, "send a role or a ban change");

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const admin = await requireRole("admin");

    if (id === admin._id) {
      return NextResponse.json({ error: "You cannot change your own account here." }, { status: 400 });
    }

    const target = await userRepo.findById(id);
    if (!target) return NextResponse.json({ error: "User not found." }, { status: 404 });

    const patch = userPatchSchema.parse(await request.json());
    const updated = await userRepo.update(id, patch);
    return NextResponse.json(updated);
  } catch (error) {
    return errorResponse(error);
  }
}
