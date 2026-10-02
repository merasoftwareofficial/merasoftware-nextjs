import "server-only";

/**
 * The notification queue (src/docs/NOTIFICATIONS.md).
 *
 * A post's first publish queues one job per channel (repo/index.ts →
 * queuePostNotifications). Jobs are worked through:
 *   1. right after the response that published the post (after()),
 *   2. on later site visits, at most once a minute (drainSoon), for a job cut
 *      short or a channel configured later,
 *   3. once a day by Vercel Cron (/api/cron/notify) as a backstop — Hobby
 *      allows no more often than that.
 * A Delivery key is claimed before every message, so a job run twice, or by
 * two runners at once, never sends anything twice.
 *
 * Only push is a channel today; email joins here later (owner decision, 2 Oct 2026).
 */

import { after } from "next/server";
import { postNotifiable, stillFresh } from "@/lib/notify-rules";
import { pushConfigured, sendPush } from "@/lib/push";
import { blogRepo, categoryRepo, deliveryRepo, notifyJobRepo, pushDeviceRepo, subscriberRepo, type Blog, type NotifyJob } from "@/lib/repo";

/** A run may take this long before another runner can take the job over. */
const LOCK_MS = 5 * 60 * 1000;
/** Pushes sent at the same time. */
const PARALLEL = 10;

/** Runs `task` after the current response, or straight away outside a request. */
function later(task: () => Promise<unknown>) {
  const run = () => task().catch(error => console.error("[notify] queue run failed", error));
  try {
    after(run);
  } catch {
    void run();
  }
}

/** Called for every post write. Queues the announcement of a post's first publish and starts sending. */
export async function queuePostNotifications(before: Blog | null, now: Blog | null) {
  if (!postNotifiable(before, now)) return;
  await notifyJobRepo.create({ kind: "post", refId: now!._id, channel: "push" });
  later(runJobs);
}

let lastDrain = 0;

/** Called on site reads: works through open jobs at most once a minute per server instance. */
export function drainSoon() {
  if (Date.now() - lastDrain < 60_000) return;
  lastDrain = Date.now();
  later(runJobs);
}

/** Works through every open job. Returns what each finished as, for the cron route. */
export async function runJobs() {
  const results: Array<{ job: string; status: string; sent?: number; failed?: number }> = [];
  for (const open of await notifyJobRepo.listOpen(20)) {
    // Left for later without taking it: nothing could be sent now.
    if (open.channel === "push" && !pushConfigured()) {
      const post = await blogRepo.findById(open.refId);
      if (post && stillFresh(post)) continue;
    }
    const job = await notifyJobRepo.claim(open._id, new Date(Date.now() + LOCK_MS).toISOString());
    if (!job) continue;
    results.push({ job: job._id, ...(await runJob(job)) });
  }
  return results;
}

async function runJob(job: NotifyJob) {
  const post = await blogRepo.findById(job.refId);
  // Re-checked at send time: a post unpublished, made private or moved since it was queued is not announced.
  const skip = !post || post.status !== "published" || post.visibility !== "public" || post.type !== "official"
    ? "The post is no longer public."
    : !stillFresh(post)
      ? "Too late: the post went live more than 48 hours ago."
      : job.channel !== "push"
        ? "This channel is not built yet."
        : !pushConfigured()
          ? "Push is not configured."
          : null;
  if (skip) {
    await notifyJobRepo.finish(job._id, { status: "skipped", sent: job.sent, failed: job.failed, note: skip });
    return { status: "skipped" };
  }

  const category = (await categoryRepo.list()).find(item => item.name === post!.category && !item.archived);
  const subscribers = category ? await subscriberRepo.listByCategory(category._id) : [];
  const devices = await pushDeviceRepo.listBySubscribers(subscribers.map(subscriber => subscriber._id));
  const message = { title: post!.title, body: post!.excerpt, url: `/blog/${post!.slug}`, tag: `post-${post!._id}` };

  let sent = job.sent;
  let failed = job.failed;
  for (let i = 0; i < devices.length; i += PARALLEL) {
    await Promise.all(devices.slice(i, i + PARALLEL).map(async device => {
      if (!(await deliveryRepo.claim(`${job._id}:${device._id}`))) return;
      const result = await sendPush(device, message);
      if (result === "sent") sent++;
      else failed++;
      if (result === "gone") await pushDeviceRepo.removeByEndpoint(device.endpoint);
    }));
  }
  await notifyJobRepo.finish(job._id, { status: "done", sent, failed });
  return { status: "done", sent, failed };
}
