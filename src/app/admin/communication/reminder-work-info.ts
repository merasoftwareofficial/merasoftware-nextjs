"use client";
import { useCallback, useState } from "react";
import { useCommunicationRefresh } from "@/lib/communication-live";

// One place for what each reminder work is, which messages it uses and when it goes or stops. The wording
// mirrors the code that really decides this (backend/cron/offerPaymentReminderCron.js,
// helpers/offerPaymentReminderEligibility.js, reservationReminders.js, communicationReminderWorker.js and
// communicationReminderEligibility.js), so keep them in step when those rules change.
export type Work = "monthly_package" | "offer_payment" | "reservation" | "broadcast";
export type Rule = { enabled: boolean; schedulerEnabled?: boolean; scheduledRecipients: number };
export type Legacy = { unavailable?: boolean; schedulerEnabled?: boolean; upcomingCustomers?: number; truncated?: boolean; messagesOn?: boolean; messagesOff?: number };
// Offer and reservation are optional: an older backend does not send them, and each card degrades on its own.
export type Summary = { monthly_package: Rule; broadcast: Rule; offer_payment?: Legacy; reservation?: Legacy; legacyAsOf?: string };

// The reservation messages, used by the work page and by the Reservation panel's own settings list.
export const RESERVATION_MESSAGES = [
  ["offer.reserved", "Reservation confirmation"],
  ["offer.reservation.extended", "Deadline extension"],
  ["offer.reservation.expired", "Reservation expiry"],
  ["offer.start.request.admin", "Start request and team reminder"],
  ["offer.start.request.received", "Start request acknowledgement"],
  ["offer.reservation.dayPassed", "After 24 hours"],
  ["offer.reservation.reminder", "24 hours left"],
  ["offer.reservation.sixHours", "6 hours left"],
  ["offer.reservation.lastHour", "1 hour left"],
] as const;

type Info = {
  title: string; description: string;
  /** Message settings that apply to this work: [action key, label]. */
  messages: readonly (readonly [string, string])[];
  messagesNote?: string;
  timing: string[]; stops: string[];
  /** What the admin can control for one customer. */
  individual: string;
  /** Add Reminder: what happens for this work. */
  addNote: string; canAdd: boolean;
};
export const WORKS: Work[] = ["monthly_package", "offer_payment", "reservation", "broadcast"];
export const WORK_INFO: Record<Work, Info> = {
  monthly_package: {
    title: "Monthly payment", description: "Plan messages and renewal reminders",
    messages: [["plan.started", "Plan started"]],
    messagesNote: "The wording of each renewal reminder is written in its own step below.",
    timing: [
      "Each step is set in days from the payment due date; a negative number means before the due date.",
      "Only billing milestones that come after the rule is activated are scheduled. Earlier ones are not created afterwards.",
      "Reminders go only while both server schedulers are on.",
    ],
    stops: [
      "The renewal invoice is paid or cancelled, or the renewal is stopped.",
      "The client or package is no longer available, or the due date or outstanding amount changed.",
      "The rule is stopped. A message already handed to a provider cannot be recalled.",
      "Orders with saved offer payment terms are not part of this rule; they use Offer payment.",
    ],
    individual: "Individual customers cannot be paused yet. Stopping the rule stops it for everyone.",
    canAdd: true, addNote: "Create a reminder rule: set the days, message and channel. It starts as a draft and sends only after you preview and activate it.",
  },
  offer_payment: {
    title: "Offer payment", description: "Payment messages and saved agreement reminders",
    messages: [["offer.payment.reminder", "Offer payment reminder"]],
    timing: [
      "The days come from each order's saved offer agreement, counted from the invoice due date (negative means before, 0 is the day itself). They are never rewritten from here.",
      "Checked every 15 minutes while the server scheduler is on. After downtime only the latest passed day is sent, never a burst.",
    ],
    stops: [
      "The invoice is paid or cancelled.",
      "Reminders are paused for that invoice.",
      "It is not the current installment, the installment is not due yet, or the offer applies to the first cycle only.",
      "The customer account or email is unavailable, or the Offer payment reminder message is Off.",
    ],
    individual: "Pause or resume payment reminders for one invoice from its card below.",
    canAdd: false, addNote: "Not a new rule: the days come from each offer's saved agreement. Open it to see the timing and control it.",
  },
  reservation: {
    title: "Reservation", description: "Reservation messages and expiry reminders",
    messages: RESERVATION_MESSAGES,
    timing: [
      "Reminders can go after the first 24 hours and with 24, 6 or 1 hours left. A stage is skipped when the countdown started too close to it.",
      "The times are fixed by the reservation system; each offer sets how long its reservation lasts.",
      "When the customer asks to start a project the countdown pauses. The team is then reminded once a day, up to 3 times.",
    ],
    stops: [
      "A project is created on the reservation or the price is confirmed.",
      "The customer asks to start a project (the customer countdown is held).",
      "Reminders are paused for that reservation, or that message is Off.",
      "Only reservations made after these reminders shipped are included.",
    ],
    individual: "Pause or resume customer reminders, and team reminders for a start request, for one reservation from its card below.",
    canAdd: false, addNote: "Not a new rule: the reminder times are fixed by the reservation system. Open it to see the timing and control it.",
  },
  broadcast: {
    title: "Broadcast follow-up", description: "Messages after a broadcast",
    messages: [],
    messagesNote: "Each follow-up has its own wording, written in its step below.",
    timing: [
      "Each step is set in days after the original delivery.",
      "Only broadcasts accepted after the rule is activated are included. Earlier broadcasts are excluded.",
      "Reminders go only while both server schedulers are on.",
    ],
    stops: [
      "The recipient did not receive every original part, or is no longer in the audience.",
      "The email or WhatsApp destination changed.",
      "The rule is stopped. A message already handed to a provider cannot be recalled.",
    ],
    individual: "Individual recipients cannot be paused yet. Stopping the rule stops it for everyone.",
    canAdd: true, addNote: "Create a follow-up rule: set the days, message and channel. It starts as a draft and sends only after you preview and activate it.",
  },
};

/** One line of real state for a work, or "" while nothing is known. */
export function statusLine(work: Work, summary: Summary | null) {
  if (work === "monthly_package" || work === "broadcast") {
    const item = summary?.[work];
    if (!item) return "";
    const status = !item.enabled ? "No active rule" : item.schedulerEnabled === false ? "Rule active, but the server scheduler is off, so nothing will send" : "Rule active";
    return `${status} · ${item.scheduledRecipients} ${work === "broadcast" ? "recipients" : "customers"} with scheduled steps`;
  }
  const item = summary?.[work];
  if (!item || item.unavailable || typeof item.upcomingCustomers !== "number") return "Open for current settings and customer records";
  const off = work === "offer_payment" ? (item.messagesOn === false ? "Payment reminder message is off" : "") : item.messagesOff ? `${item.messagesOff} reminder ${item.messagesOff === 1 ? "message is" : "messages are"} off` : "";
  const status = off || (item.schedulerEnabled === false ? "Server scheduler is off, so nothing will send" : "Reminders on");
  return `${status} · ${item.upcomingCustomers}${item.truncated ? "+" : ""} customers with upcoming reminders`;
}

export function useReminderSummary(active: boolean) {
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
  return { summary, error };
}
