/** Uncached server clock for expiry displays; authorization stays in business APIs. */
export async function GET() {
  return Response.json({ now: Date.now() }, { headers: { "Cache-Control": "no-store" } });
}
