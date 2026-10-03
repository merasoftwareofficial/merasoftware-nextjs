"use client";

/**
 * Asks an admin for notification permission in the panel (src/docs/NOTIFICATIONS.md,
 * "Admin alerts"). Shown on every panel visit until this browser allows
 * alerts; it cannot be closed, because the owner wants every admin asked.
 *
 * The browser's own prompt only opens from a click, so this is a card with a
 * button, not an automatic prompt. Once allowed, every visit re-sends the
 * subscription quietly: that keeps the device's lastSeenAt fresh and repairs
 * it if the reader's "turn off" removed this browser's subscription.
 */

import { useEffect, useState } from "react";
import { iosBrowser, subscribeBrowser, supported } from "@/components/subscribe/use-push";

type State = "loading" | "on" | "off" | "denied" | "unsupported" | "ios-install";

async function register(publicKey: string) {
  const subscription = await subscribeBrowser(publicKey);
  const response = await fetch("/api/staff-push", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subscription: subscription.toJSON() }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error ?? "Could not turn on admin alerts. Try again.");
  }
}

async function initialState(publicKey: string): Promise<State> {
  if (!supported()) return iosBrowser() ? "ios-install" : "unsupported";
  if (Notification.permission === "denied") return "denied";
  if (Notification.permission !== "granted") return "off";
  try {
    await register(publicKey);
    return "on";
  } catch {
    return "off";
  }
}

export function StaffAlerts({ publicKey }: { publicKey: string }) {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    initialState(publicKey).then(setState, () => setState("off"));
  }, [publicKey]);

  async function turnOn() {
    setBusy(true);
    setError("");
    try {
      await register(publicKey);
      setState("on");
    } catch (failure) {
      if ((failure as { permission?: string }).permission === "denied") setState("denied");
      setError(failure instanceof Error ? failure.message : "Could not turn on admin alerts.");
    } finally {
      setBusy(false);
    }
  }

  if (state === "loading" || state === "on") return null;

  return (
    <aside className="staff-alerts" role="status" data-state={state}>
      <p className="staff-alerts-title">🔔 Admin alerts are off on this browser</p>
      {state === "off" ? (
        <>
          <p>Allow notifications to hear about every new comment, reply, reaction and report — even when the panel is closed.</p>
          <button className="admin-button" type="button" onClick={turnOn} disabled={busy}>
            {busy ? "Waiting for the browser…" : "Allow notifications"}
          </button>
        </>
      ) : state === "denied" ? (
        <p>
          Notifications are blocked for this site. Click the lock icon in the address bar → <b>Notifications</b> → <b>Allow</b>,
          then reload this page.
        </p>
      ) : state === "ios-install" ? (
        <p>On iPhone or iPad, alerts work only from the home-screen app: tap Share → <b>Add to Home Screen</b>, open it from there and sign in.</p>
      ) : (
        <p>This browser cannot show notifications. Use Chrome, Edge or Firefox for admin alerts.</p>
      )}
      {error && state === "off" ? <p className="form-error">{error}</p> : null}
    </aside>
  );
}
