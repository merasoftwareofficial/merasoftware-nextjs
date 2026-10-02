import "server-only";

/**
 * The one place browser push leaves the website (src/docs/NOTIFICATIONS.md).
 *
 * Needs VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY (generate once with
 * `npx web-push generate-vapid-keys`). Without them the subscribe box offers
 * no push button and queued push jobs simply wait.
 */

import webpush from "web-push";
import type { PushDevice } from "@/lib/repo";

export function pushPublicKey() {
  return process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY ? process.env.VAPID_PUBLIC_KEY : null;
}

export function pushConfigured() {
  return pushPublicKey() !== null;
}

let ready = false;

function setup() {
  if (ready) return;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:contact@merasoftware.com", process.env.VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
  ready = true;
}

/** What the service worker (public/sw.js) shows. `url` is a path on this site. */
export type PushMessage = { title: string; body: string; url: string; tag: string };

/** "gone": the browser withdrew permission or the subscription expired — delete the device. */
export async function sendPush(device: PushDevice, message: PushMessage): Promise<"sent" | "gone" | "failed"> {
  setup();
  try {
    await webpush.sendNotification(
      { endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } },
      JSON.stringify(message),
      { TTL: 24 * 60 * 60, urgency: "normal" },
    );
    return "sent";
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) return "gone";
    console.error("[push] sending failed", status ?? error);
    return "failed";
  }
}
