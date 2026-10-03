import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { errorResponse } from "@/lib/api";
import { requireSameOrigin } from "@/lib/portfolio/integration-auth";
async function call(method: string) {
  const base = process.env.PORTAL_API_URL?.replace(/\/$/, "");
  const secret = process.env.PORTFOLIO_INTEGRATION_SECRET;
  if (!base || !secret || secret.length < 32) throw new Error("Configure the portal API URL and portfolio integration secret first.");
  const response = await fetch(`${base}/api/portfolio-integration/sync`, { method, cache: "no-store", redirect: "error", headers: { Authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error("Portal sync endpoint is unavailable. Check backend deployment and integration configuration.");
  return NextResponse.json(await response.json(), { headers: { "Cache-Control": "private, no-store" } });
}
export async function GET() { try { await requireRole("editor"); return await call("GET"); } catch (error) { return errorResponse(error); } }
export async function POST(request: Request) { try { await requireRole("editor"); requireSameOrigin(request); return await call("POST"); } catch (error) { return errorResponse(error); } }
