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
 *
 * Admin alerts (a new comment, reaction or report) ride the same queue: one
 * job per activity, sent to every admin browser in staffDeviceRepo instead of
 * to subscribers (queueStaffAlert → runStaffJob).
 */

import { after } from "next/server";
import { postNotifiable, STAFF_ALERT_STALE_MS, STAFF_DEVICE_TTL_MS, stillFresh } from "@/lib/notify-rules";
import { pushConfigured, sendPush, type PushMessage } from "@/lib/push";
import {
  blogRepo,
  categoryRepo,
  commentRepo,
  deliveryRepo,
  notifyJobRepo,
  pushDeviceRepo,
  reactionRepo,
  reportRepo,
  staffDeviceRepo,
  subscriberRepo,
  userRepo,
  type Blog,
  type NotifyJob,
  type ReactionKind,
  type StaffAlertKind,
} from "@/lib/repo";

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
    if (open.kind === "post" && open.channel === "push" && !pushConfigured()) {
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
  if (isStaffAlert(job.kind)) return runStaffJob(job, job.kind);
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

/* ---------------------------------------------------------- admin alerts -- */

const STAFF_KINDS: StaffAlertKind[] = ["comment", "reaction", "report"];

function isStaffAlert(kind: NotifyJob["kind"]): kind is StaffAlertKind {
  return (STAFF_KINDS as string[]).includes(kind);
}

/** The reaction job's refId: one per person, post and reaction, so toggling it never alerts twice. */
export function reactionRef(blogId: string, userId: string, reaction: ReactionKind) {
  return `${blogId}:${userId}:${reaction}`;
}

/**
 * Called by the comment, reaction and report routes after a write. Queues one
 * admin alert and starts sending. Never throws: an alert must not fail the
 * comment, reaction or report that set it off.
 */
export async function queueStaffAlert(kind: StaffAlertKind, refId: string) {
  try {
    // Without push nothing could ever go out; no job is kept for later.
    if (!pushConfigured()) return;
    if (await notifyJobRepo.create({ kind, refId, channel: "push" })) later(runJobs);
  } catch (error) {
    console.error("[notify] queueing an admin alert failed", error);
  }
}

const snippet = (text: string, max = 120) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

const REACTION_LABEL: Record<ReactionKind, string> = { helpful: "Helpful", insightful: "Insightful" };

/**
 * What the alert says, read at send time so a comment deleted, a reaction
 * taken back or a report removed in the meantime sends nothing. `actorId` is
 * who did it: their own devices get no alert about their own activity.
 */
async function staffMessage(kind: StaffAlertKind, refId: string): Promise<{ message: PushMessage; actorId: string } | string> {
  if (kind === "comment") {
    const comment = await commentRepo.findById(refId);
    const post = comment && (await blogRepo.findById(comment.blogId));
    if (!comment || !post) return "The comment is gone.";
    const title = comment.status === "pending" ? "Comment awaiting approval" : comment.parentId ? "New reply" : "New comment";
    return {
      actorId: comment.userId,
      message: { title, body: `${comment.userName} on “${post.title}”: ${snippet(comment.body)}`, url: `/blog/${post.slug}#comment-${comment._id}`, tag: `comment-${comment._id}` },
    };
  }

  if (kind === "reaction") {
    const [blogId, reaction] = [refId.slice(0, refId.indexOf(":")), refId.slice(refId.lastIndexOf(":") + 1) as ReactionKind];
    const userId = refId.slice(blogId.length + 1, refId.lastIndexOf(":"));
    const [row, post, user] = await Promise.all([reactionRepo.find(userId, blogId, reaction), blogRepo.findById(blogId), userRepo.findById(userId)]);
    if (!row || !post) return "The reaction was taken back.";
    return {
      actorId: userId,
      // One alert per post on screen: the newest reaction replaces the last and sounds again.
      message: { title: `${REACTION_LABEL[reaction]} reaction`, body: `${user?.displayName ?? "Someone"} marked “${post.title}” ${REACTION_LABEL[reaction]}.`, url: `/blog/${post.slug}`, tag: `reactions-${post._id}`, renotify: true },
    };
  }

  const report = await reportRepo.findById(refId);
  if (!report) return "The report is gone.";
  const comment = report.targetType === "comment" ? await commentRepo.findById(report.targetId) : null;
  const post = await blogRepo.findById(comment ? comment.blogId : report.targetId);
  if (!post) return "The reported content is gone.";
  return {
    actorId: report.userId,
    message: {
      title: comment ? "Comment reported" : "Post reported",
      body: `“${snippet(report.reason, 80)}” — ${comment ? `${comment.userName} on “${post.title}”` : `“${post.title}”`}`,
      url: comment ? `/blog/${post.slug}#comment-${comment._id}` : `/blog/${post.slug}`,
      tag: `report-${report._id}`,
    },
  };
}

async function runStaffJob(job: NotifyJob, kind: StaffAlertKind) {
  const built = !pushConfigured()
    ? "Push is not configured."
    : Date.now() - Date.parse(job.createdAt) > STAFF_ALERT_STALE_MS
      ? "Too late: the activity is more than 24 hours old."
      : await staffMessage(kind, job.refId);
  if (typeof built === "string") {
    await notifyJobRepo.finish(job._id, { status: "skipped", sent: job.sent, failed: job.failed, note: built });
    return { status: "skipped" };
  }

  const since = new Date(Date.now() - STAFF_DEVICE_TTL_MS).toISOString();
  const devices = (await staffDeviceRepo.listActive(since)).filter(device => device.userId !== built.actorId);

  let sent = job.sent;
  let failed = job.failed;
  for (let i = 0; i < devices.length; i += PARALLEL) {
    await Promise.all(devices.slice(i, i + PARALLEL).map(async device => {
      if (!(await deliveryRepo.claim(`${job._id}:${device._id}`))) return;
      const result = await sendPush(device, built.message);
      if (result === "sent") sent++;
      else failed++;
      if (result === "gone") await staffDeviceRepo.removeByEndpoint(device.endpoint);
    }));
  }
  await notifyJobRepo.finish(job._id, { status: "done", sent, failed });
  return { status: "done", sent, failed };
}
