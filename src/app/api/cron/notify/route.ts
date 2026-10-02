/**
 * GET /api/cron/notify   daily backstop for the notification queue (vercel.json)
 *
 * Vercel Cron calls it with `Authorization: Bearer <CRON_SECRET>`. Jobs
 * normally finish right after a publish; this only picks up what was left.
 */

import { NextResponse } from "next/server";
import { runJobs } from "@/lib/notify-queue";

export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Not allowed." }, { status: 401 });
  }
  try {
    return NextResponse.json({ jobs: await runJobs() });
  } catch (error) {
    console.error("[notify] cron run failed", error);
    return NextResponse.json({ error: "The run failed; see the server log." }, { status: 500 });
  }
}
