"use client";

import type { PushState } from "@/components/subscribe/use-push";

/** What to tell a browser that cannot turn push on; shared with the follow button. */
export const NOTE: Partial<Record<PushState, string>> = {
  unsupported: "This browser cannot show notifications.",
  denied: "Notifications are blocked for this site. Allow them in your browser's site settings, then reload.",
  "ios-install": "On iPhone or iPad: tap Share, choose “Add to Home Screen”, open the site from your home screen, then turn on notifications there.",
};

/** The push button and its state line for this browser. */
export function PushControl({
  state,
  busy,
  onEnable,
  onDisable,
}: {
  state: PushState;
  busy: boolean;
  onEnable: () => void;
  onDisable: () => void;
}) {
  if (state === "loading") return null;
  if (NOTE[state]) return <p className="subscribe-note">{NOTE[state]}</p>;
  if (state === "on") {
    return (
      <div className="subscribe-row push-row">
        <p className="subscribe-note">🔔 Notifications are on in this browser.</p>
        <button className="button button-dark" type="button" disabled={busy} onClick={onEnable}>
          {busy ? "Saving…" : "Save topics"}
        </button>
        <button className="admin-action" type="button" disabled={busy} onClick={onDisable}>
          Turn off in this browser
        </button>
      </div>
    );
  }
  return (
    <div className="subscribe-row push-row">
      <button className="button button-dark" type="button" disabled={busy} onClick={onEnable}>
        {busy ? "Turning on…" : "🔔 Allow notifications"}
      </button>
    </div>
  );
}
