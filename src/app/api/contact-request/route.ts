import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api";
import { requireSameOrigin } from "@/lib/portfolio/integration-auth";
import { salesBackend } from "@/lib/sales-catalogue-server";

export const dynamic = "force-dynamic";

const contactRequestSchema = z.object({
  project: z.string().trim().min(1).max(120),
  name: z.string().trim().min(2, "Please enter your name.").max(100),
  email: z.string().trim().email("Please enter a valid email address.").max(160),
  countryCode: z.string().trim().min(1).max(10).default("+91"),
  phone: z.string().trim().min(5, "Please enter a valid mobile number.").max(20),
  message: z.string().trim().max(1000).optional().default(""),
  website: z.string().optional().default(""),
});

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const parsed = contactRequestSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      const first = parsed.error.issues[0]?.message || "Please check your details and try again.";
      return NextResponse.json({ error: first }, { status: 400 });
    }
    const { website, ...payload } = parsed.data;
    // Honeypot filled: silently succeed without forwarding.
    if (website) return NextResponse.json({ submitted: true });

    await salesBackend(false, payload, "contact-request");
    return NextResponse.json({ submitted: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
