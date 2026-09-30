/**
 * GET /indexnow-key.txt
 *
 * IndexNow reads this file to confirm a submission really comes from the owner
 * of www.merasoftware.com. The key lives in the INDEXNOW_KEY environment
 * variable, so no key is committed to the repository; without one this is a
 * 404 and src/lib/indexnow.ts sends nothing.
 */

import { indexNowKey } from "@/lib/indexnow";

export const dynamic = "force-dynamic";

export function GET() {
  const key = indexNowKey();
  if (!key) return new Response("Not found", { status: 404 });
  return new Response(key, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
