"use client";
import { useCallback, useState } from "react";
import { useCommunicationRefresh } from "@/lib/communication-live";
import { formatIndiaDateTime } from "@/lib/date-time";
import s from "./communication.module.css";

type Work = "monthly_package" | "offer_payment" | "reservation" | "broadcast";
type Rule = { enabled: boolean; schedulerEnabled?: boolean; scheduledRecipients: number };
type Legacy = { unavailable?: boolean; schedulerEnabled?: boolean; upcomingCustomers?: number; truncated?: boolean; messagesOn?: boolean; messagesOff?: number };
// Offer and reservation are optional: an older backend does not send them, and each card degrades on its own.
type Summary = { monthly_package: Rule; broadcast: Rule; offer_payment?: Legacy; reservation?: Legacy; legacyAsOf?: string };
const works: [Work, string, string][] = [
  ["monthly_package", "Monthly payment", "Plan messages and renewal reminders"],
  ["offer_payment", "Offer payment", "Payment messages and saved agreement reminders"],
  ["reservation", "Reservation", "Reservation messages and expiry reminders"],
  ["broadcast", "Broadcast follow-up", "Messages after a broadcast"],
];

function ruleLine(id: "monthly_package" | "broadcast", item: Rule) {
  const status = !item.enabled ? "No active rule" : item.schedulerEnabled === false ? "Rule active, but the server scheduler is off, so nothing will send" : "Rule active";
  return `${status} · ${item.scheduledRecipients} ${id === "broadcast" ? "recipients" : "customers"} with scheduled steps`;
}
function legacyLine(id: "offer_payment" | "reservation", item: Legacy | undefined) {
  if (!item || item.unavailable || typeof item.upcomingCustomers !== "number") return "Open for current settings and customer records";
  const off = id === "offer_payment" ? (item.messagesOn === false ? "Payment reminder message is off" : "") : item.messagesOff ? `${item.messagesOff} reminder ${item.messagesOff === 1 ? "message is" : "messages are"} off` : "";
  const status = off || (item.schedulerEnabled === false ? "Server scheduler is off, so nothing will send" : "Reminders on");
  return `${status} · ${item.upcomingCustomers}${item.truncated ? "+" : ""} customers with upcoming reminders`;
}

export function ReminderWorkList({ active, open }: { active: boolean; open: (work: Work, add?: boolean) => void }) {
  const [adding, setAdding] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState(false);
  const load = useCallback(async (signal: AbortSignal) => {
    try {
      const response = await fetch("/api/auto-reply/reminder-work-summary", { signal, cache: "no-store" });
      const result = await response.json();
      if (!response.ok || !result.data?.monthly_package || !result.data?.broadcast) throw new Error("Unavailable");
      if (!signal.aborted) { setSummary(result.data); setError(false); }
    } catch { if (!signal.aborted) { setSummary(null); setError(true); } }
  }, []);
  useCommunicationRefresh(load, active, 5000);
  return <section aria-label="Reminders by work">
    <h3>Choose a work</h3>
    <button type="button" className="admin-action" onClick={() => setAdding(value => !value)}>Add Reminder</button>
    {adding && <div role="region" aria-label="Choose work for new reminder"><p>Choose a supported work to set up a reminder.</p>
      <button type="button" onClick={() => open("monthly_package", true)}>Monthly payment</button>{" "}
      <button type="button" onClick={() => open("broadcast", true)}>Broadcast follow-up</button>
      <p>Offer payment and reservation use their existing saved agreements and schedules.</p></div>}
    <p>Open a work to manage its messages and reminders. Counts are a snapshot of saved schedules, not a promise that a message will be sent: eligibility is checked again before sending.</p>
    {summary?.legacyAsOf && <p>Offer and reservation counts as of {formatIndiaDateTime(summary.legacyAsOf)} (IST).</p>}
    {error && <p role="status">Reminder summary is unavailable. Open a work to see its current details.</p>}
    {works.map(([id, title, description]) => {
      const line = id === "monthly_package" || id === "broadcast" ? (summary?.[id] ? ruleLine(id, summary[id]) : "") : legacyLine(id, summary?.[id]);
      return <article className={s.quickCard} key={id}><strong>{title}</strong><span>{description}</span>
        {line && <span>{line}</span>}
        <button type="button" onClick={() => open(id)}>Open →</button></article>;
    })}
  </section>;
}
