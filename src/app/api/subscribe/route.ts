/**
 * POST /api/subscribe   start an email subscription (double opt-in)
 *
 * No login needed. The answer is the same whether or not the address was
 * already subscribed (src/lib/subscription-actions.ts).
 */

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";
import { linkBase, NOTIFY_COOKIE, subscribeSchema } from "@/lib/notify-rules";
import { subscribe } from "@/lib/subscription-actions";

export async function POST(request: Request) {
  try {
    const input = subscribeSchema.parse(await request.json());
    const cookie = (await cookies()).get(NOTIFY_COOKIE)?.value ?? null;
    const result = await subscribe(input, await getSessionUser(), linkBase(request.url), cookie);
    return NextResponse.json({ result });
  } catch (error) {
    return errorResponse(error);
  }
}
