"use client";

import { useRef, useState } from "react";
import styles from "../email-control/email-control.module.css";

export type ReminderControlSource = "reservation" | "reservation_team" | "package_request" | "offer_payment";
export function ReminderPauseControl({ source, entityId, paused, label, onChanged }: { source: ReminderControlSource; entityId: string; paused: boolean; label: string; onChanged: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  async function change() {
    if (pending.current) return;
    if (!window.confirm(paused ? `Resume ${label} for this record? Only eligible milestones will send; previously handled messages are not replayed.` : `Pause ${label} for this record? Messages already being sent cannot be recalled.`)) return;
    pending.current = true; setBusy(true); setError("");
    try {
      const response = await fetch("/api/auto-reply/reminder-controls", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source, entityId, paused: !paused, expectedPaused: paused }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not update reminders.");
      await onChanged();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Could not update reminders."); }
    finally { pending.current = false; setBusy(false); }
  }
  return <div>
    <div className={styles.actions}><span>{label.charAt(0).toUpperCase() + label.slice(1)}: {paused ? "Paused" : "On"}</span><button type="button" disabled={busy} onClick={() => void change()}>{busy ? "Saving…" : `${paused ? "Resume" : "Pause"} ${label}`}</button></div>
    {error && <p className={styles.error} role="alert">{error} <button type="button" disabled={busy} onClick={() => void onChanged().catch(() => {})}>Refresh state</button></p>}
  </div>;
}
