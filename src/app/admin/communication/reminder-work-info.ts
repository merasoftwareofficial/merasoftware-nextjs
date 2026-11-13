"use client";
import { useCallback, useState } from "react";
import { useCommunicationRefresh } from "@/lib/communication-live";

// What each reminder work is, its short facts, and the detail shown in an (i) popup. The wording mirrors the code
// that decides this (backend/cron/offerPaymentReminderCron.js, helpers/offerPaymentReminderEligibility.js,
// reservationReminders.js, communicationReminderWorker.js, communicationReminderEligibility.js). Keep them in step.
export type Work = "monthly_package" | "offer_payment" | "reservation" | "broadcast";
export type Rule = { enabled: boolean; schedulerEnabled?: boolean; scheduledRecipients: number };
export type Legacy = { unavailable?: boolean; schedulerEnabled?: boolean; upcomingCustomers?: number; truncated?: boolean; messagesOn?: boolean; messagesOff?: number };
// Offer and reservation are optional: an older backend does not send them, and each row degrades on its own.
export type Summary = { monthly_package: Rule; broadcast: Rule; offer_payment?: Legacy; reservation?: Legacy; legacyAsOf?: string };

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
  title: string;
  /** Popup on the title: what this work is. */
  about: string;
  /** Message settings opened from the work page. */
  messages: readonly (readonly [string, string])[];
  timing: { short: string; info: string[] };
  stops: { short: string; info: string[] };
  control: { short: string; info: string };
  /** Whether Add Reminder can create a new rule for this work. */
  canAdd: boolean;
};

export const WORKS: Work[] = ["monthly_package", "offer_payment", "reservation", "broadcast"];
export const ADD_INFO = "Monthly payment and broadcast follow-up can get a new rule: set the days, message and channel. It starts as a draft and sends only after preview and activation. Offer payment and reservation use their saved agreement and the reservation system, so there is nothing to add.";

export const WORK_INFO: Record<Work, Info> = {
  monthly_package: {
    title: "Monthly payment",
    about: "Renewal reminders for monthly packages. Each reminder has its own wording, written in its step below.",
    messages: [["plan.started", "Plan started message"]],
    timing: {
      short: "Days from the payment due date",
      info: [
        "Each step is set in days from the payment due date. A negative number means before the due date.",
        "Only billing milestones after the rule is activated are scheduled.",
        "Messages go only while both server schedulers are on.",
      ],
    },
    stops: {
      short: "Paid, cancelled or rule stopped",
      info: [
        "The renewal invoice is paid or cancelled, or the renewal is stopped.",
        "The client or package is gone, or the due date or amount changed.",
        "Orders with saved offer payment terms are not part of this. They use Offer payment.",
        "Stopping the rule does not recall a message already handed to a provider.",
      ],
    },
    control: { short: "Whole rule only", info: "Individual customers cannot be paused yet. Stopping the rule stops it for everyone." },
    canAdd: true,
  },
  offer_payment: {
    title: "Offer payment",
    about: "Payment reminders from each offer's saved agreement. Nothing here is a new rule.",
    messages: [["offer.payment.reminder", "Offer payment reminder message"]],
    timing: {
      short: "From each offer's saved agreement",
      info: [
        "The days come from the order's saved agreement, counted from the invoice due date. 0 is the due day. They are never rewritten from here.",
        "Checked every 15 minutes. After downtime only the latest passed day is sent, not a burst.",
      ],
    },
    stops: {
      short: "Paid, paused or not due yet",
      info: [
        "The invoice is paid or cancelled, or reminders are paused for it.",
        "It is not the current installment, or that installment is not due yet.",
        "The offer applies to the first cycle only, or the customer account or email is unavailable.",
        "The message is set to Off.",
      ],
    },
    control: { short: "Per invoice", info: "Pause or resume an invoice from its row below." },
    canAdd: false,
  },
  reservation: {
    title: "Reservation",
    about: "Reminders while a reservation runs. The times are fixed by the reservation system.",
    messages: RESERVATION_MESSAGES,
    timing: {
      short: "After 24 hours, and 24, 6 or 1 hours left",
      info: [
        "Each offer sets how long its reservation lasts.",
        "A stage is skipped when the countdown started too close to it.",
        "When the customer asks to start a project, the countdown pauses. The team is then reminded once a day, up to 3 times.",
      ],
    },
    stops: {
      short: "Project created or start requested",
      info: [
        "A project is created on the reservation, or the price is confirmed.",
        "The customer asks to start a project. The customer countdown is held.",
        "Reminders are paused for that reservation, or the message is Off.",
        "Only reservations made after these reminders shipped are included.",
      ],
    },
    control: { short: "Per reservation", info: "Pause customer reminders, or team reminders for a start request, from each reservation row below." },
    canAdd: false,
  },
  broadcast: {
    title: "Broadcast follow-up",
    about: "Messages after a broadcast. Each follow-up has its own wording, written in its step below.",
    messages: [],
    timing: {
      short: "Days after the original delivery",
      info: [
        "Each step is set in days after the original delivery.",
        "Only broadcasts accepted after the rule is activated are included.",
        "Messages go only while both server schedulers are on.",
      ],
    },
    stops: {
      short: "Recipient missing or destination changed",
      info: [
        "The recipient did not get every original part, or is no longer in the audience.",
        "The email or WhatsApp destination changed.",
        "Stopping the rule does not recall a message already handed to a provider.",
      ],
    },
    control: { short: "Whole rule only", info: "Individual recipients cannot be paused yet. Stopping the rule stops it for everyone." },
    canAdd: true,
  },
};

/** One short line of real state for a work, or "" while nothing is known. */
export function statusLine(work: Work, summary: Summary | null) {
  if (work === "monthly_package" || work === "broadcast") {
    const item = summary?.[work];
    if (!item) return "";
    if (!item.enabled) return "No active rule";
    const people = `${item.scheduledRecipients} ${work === "broadcast" ? "recipients" : "customers"}`;
    return item.schedulerEnabled === false ? `Active, scheduler off · ${people}` : `Active · ${people}`;
  }
  const item = summary?.[work];
  if (!item || item.unavailable || typeof item.upcomingCustomers !== "number") return "";
  const count = `${item.upcomingCustomers}${item.truncated ? "+" : ""} customers`;
  if (work === "offer_payment" && item.messagesOn === false) return `Message off · ${count}`;
  if (work === "reservation" && item.messagesOff) return `${item.messagesOff} ${item.messagesOff === 1 ? "message" : "messages"} off · ${count}`;
  return item.schedulerEnabled === false ? `Scheduler off · ${count}` : count;
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
