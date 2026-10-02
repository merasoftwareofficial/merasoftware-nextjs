/**
 * POST /api/subscribe/unsubscribe?token=   stop mail to one address
 *
 * By the manage-link token (in the address or a JSON body), or else the
 * signed-in user's own record.
 * Also the one-click target of the List-Unsubscribe header (RFC 8058): a mail
 * client posts here with the token in the address and no body.
 */

import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";
import { ownSubscriber, unsubscribe } from "@/lib/subscription-actions";

export async function POST(request: Request) {
  try {
    let token = new URL(request.url).searchParams.get("token");
    if (!token && request.headers.get("content-type")?.includes("application/json")) {
      token = ((await request.json()) as { token?: unknown }).token as string | null;
    }
    const key = typeof token === "string" && token ? token : null;
    const own = await ownSubscriber(key, key ? null : await getSessionUser());
    const subscriber = own ? await unsubscribe(own) : null;
    if (!subscriber) return NextResponse.json({ error: "This link is not valid any more." }, { status: 404 });
    return NextResponse.json({ emailStatus: subscriber.emailStatus });
  } catch (error) {
    return errorResponse(error);
  }
}
