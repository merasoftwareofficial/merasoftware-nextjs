"use client";

import { useEffect, useState } from "react";

/**
 * This browser's push state, and turning it on or off (src/docs/NOTIFICATIONS.md).
 * "ios-install": iPhone/iPad Safari, where push works only from the home-screen app.
 */
export type PushState = "loading" | "unsupported" | "ios-install" | "denied" | "off" | "on";

type Reply = { categories?: string[]; offers?: boolean; error?: string };

export function supported() {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export function iosBrowser() {
  const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !standalone;
}

export async function currentSubscription() {
  const registration = await navigator.serviceWorker.getRegistration("/");
  return (await registration?.pushManager.getSubscription()) ?? null;
}

async function detect(): Promise<PushState> {
  if (!supported()) return iosBrowser() ? "ios-install" : "unsupported";
  if (Notification.permission === "denied") return "denied";
  return (await currentSubscription()) ? "on" : "off";
}

/** The VAPID public key (base64url) as the bytes pushManager.subscribe() wants. */
function keyBytes(base64: string) {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(padded), char => char.charCodeAt(0));
}

/**
 * Asks permission (call it only from a click) and returns this browser's push
 * subscription, made on first use. Shared by the reader's topics and the admin
 * alert banner (components/staff-alerts.tsx): one browser has one subscription.
 * Throws with a message to show when permission is not given.
 */
export async function subscribeBrowser(publicKey: string) {
  await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  const registration = await navigator.serviceWorker.ready;
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw Object.assign(
      new Error(permission === "denied" ? "Notifications are blocked for this site in your browser settings." : "Notifications were not allowed."),
      { permission },
    );
  }
  return (
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }))
  );
}

export function usePush(publicKey: string | null) {
  // Without a key there is nothing to detect: "off", so a preview box still draws its button.
  const [state, setState] = useState<PushState>(publicKey ? "loading" : "off");

  useEffect(() => {
    if (!publicKey) return;
    detect().then(setState, () => setState("unsupported"));
  }, [publicKey]);

  /** Asks permission (only ever from a click), subscribes, and saves the topics with this browser. Also used to re-save topics. */
  async function enable(categories: string[], offers: boolean): Promise<Reply> {
    if (!publicKey) throw new Error("Notifications are not available yet.");
    let subscription: PushSubscription;
    try {
      subscription = await subscribeBrowser(publicKey);
    } catch (error) {
      const permission = (error as { permission?: NotificationPermission }).permission;
      if (permission) setState(permission === "denied" ? "denied" : "off");
      throw error;
    }

    const response = await fetch("/api/push-devices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscription: subscription.toJSON(), categories, offers }),
    });
    const reply = (await response.json()) as Reply;
    if (!response.ok) throw new Error(reply.error || "Could not turn on notifications. Try again.");
    setState("on");
    return reply;
  }

  async function disable() {
    const subscription = await currentSubscription();
    if (subscription) {
      await fetch("/api/push-devices", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      });
      await subscription.unsubscribe();
    }
    setState("off");
  }

  return { state, enable, disable };
}
