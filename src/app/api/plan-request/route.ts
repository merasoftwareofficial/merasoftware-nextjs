import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { PORTAL_COOKIE } from "@/lib/portal";
import { PortalApiError } from "@/lib/portal-api";
import { requireSameOrigin } from "@/lib/portfolio/integration-auth";
import { planRequestSchema } from "@/lib/public-plans";
import { requestPlanAsMember, requestPlanAsVisitor } from "@/lib/public-plans-server";
export const dynamic = "force-dynamic";

// "Get this plan" on a plan page (/plans/<name>-<id>) by someone who is not a portal client: the team
// calls them back. Clients never come here; they buy in their portal. A signed-in member is sent with
// their own session, a visitor with the website's integration key. The portal backend re-quotes the
// choice and saves the lead (controller/lead/planRequest.js). Nothing is bought here.
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const parsed = planRequestSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Please check your details and try again." }, { status: 400 });
    const { website, name, email, ...rest } = parsed.data;
    // The hidden trap was filled: a bot. Answer as if it worked; nothing is sent.
    if (website) return NextResponse.json({ repeated: false });

    const session = await getSession();
    const token = (await cookies()).get(PORTAL_COOKIE)?.value;
    if (session && token) {
      if (session.portalRoles.includes("customer")) return NextResponse.json({ error: "You are already a client. Open this plan in your client portal to buy it." }, { status: 409 });
      const result = await requestPlanAsMember(token, rest);
      return NextResponse.json({ repeated: result.repeated }, { headers: { "Cache-Control": "no-store" } });
    }
    if (!name || !email || !rest.phone) return NextResponse.json({ error: "Please enter your name, email and mobile number." }, { status: 400 });
    const result = await requestPlanAsVisitor({ ...rest, name, email });
    return NextResponse.json({ repeated: result.repeated }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof PortalApiError) return NextResponse.json({ error: error.message }, { status: error.status });
    return errorResponse(error);
  }
}
