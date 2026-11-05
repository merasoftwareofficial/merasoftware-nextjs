import type { Offer } from "@/lib/offers";
import type { OfferReservation } from "@/lib/offer-reservations";

// When public Reserve is open, and what the offer card's main button says (owner decisions,
// 25 October 2026; src/docs/dynamic-offers.md). The backend (helpers/offerReservations.js
// reservationRefusal) is the authority and refuses anything else; this copy only decides what the
// page shows, so the two must agree (tests/offer-reservation-rules.test.ts).

const HOUR = 3600000;
export const DEFAULT_RESERVE_WINDOW_HOURS = 24;
export const DEFAULT_HOLD_HOURS = 72;

type Reservable = Pick<Offer, "status" | "endsAt" | "targets" | "reserveWindowHours">;

/**
 * Hours a reservation of this offer lasts: the offer's own setting (1–720), else 72. The backend
 * (helpers/offerReservations.js holdHours) saves the deadline from it at reserve time.
 */
export function reservationHoldHours(offer: Pick<Offer, "reservationHoldHours">) {
  const value = offer.reservationHoldHours;
  return Number.isInteger(value) && value! >= 1 && value! <= 720 ? value! : DEFAULT_HOLD_HOURS;
}

/** Hours before the offer ends that Reserve opens: the offer's own setting (1–720), else 24. */
export function reserveWindowHours(offer: Pick<Offer, "reserveWindowHours">) {
  const value = offer.reserveWindowHours;
  return Number.isInteger(value) && value! >= 1 && value! <= 720 ? value! : DEFAULT_RESERVE_WINDOW_HOURS;
}
export const reservationOpensAt = (offer: Reservable) => Date.parse(offer.endsAt) - reserveWindowHours(offer) * HOUR;
/** Only a live project offer can be reserved. */
export const reservableOffer = (offer: Reservable) => offer.status === "published" && (!offer.targets || offer.targets.includes("projects"));
/** Reserve is open right now: a live project offer inside its reserve window. */
export function reservationOpen(offer: Reservable, now: number) {
  const endsAt = Date.parse(offer.endsAt);
  return reservableOffer(offer) && Number.isFinite(endsAt) && now < endsAt && now >= reservationOpensAt(offer);
}

export type ReservationPhase = "none" | "checking" | "open" | "reserved" | "review" | "confirmed" | "expired";

/**
 * The customer's state for one offer. A saved reservation wins, unless it expired unpaid and a
 * later offer period may be reserved again (owner decision 11, backend `renewable`).
 */
export function reservationPhase(offer: Reservable, row: OfferReservation | null, loaded: boolean, now: number): ReservationPhase {
  const open = reservationOpen(offer, now);
  if (row) {
    const due = Date.parse(row.deadline ?? row.expiresAt);
    const renewable = row.status === "expired" && !row.projectId && !!row.periodEndsAt && Date.parse(row.periodEndsAt) < Date.parse(offer.endsAt);
    if (!(renewable && open)) {
      if (row.status === "confirmed") return "confirmed";
      if (row.status === "under_review") return "review";
      return row.status === "reserved" && due > now ? "reserved" : "expired";
    }
  }
  if (!open) return "none";
  return loaded ? "open" : "checking";
}

export type ReserveCta =
  | { kind: "enquire" }
  | { kind: "reserve"; label: string; disabled: boolean }
  | { kind: "status"; label: string };

function timeLeft(until: number, now: number) {
  const seconds = Math.max(0, Math.ceil((until - now) / 1000));
  return `${Math.floor(seconds / 3600)}h ${Math.floor(seconds % 3600 / 60)}m ${seconds % 60}s left`;
}
/** The one main button on the card and in the sticky bar. holdHours: reservationHoldHours(offer). */
export function reserveCta(phase: ReservationPhase, row: OfferReservation | null, now: number, holdHours = DEFAULT_HOLD_HOURS): ReserveCta {
  switch (phase) {
    case "open": return { kind: "reserve", label: `Reserve price for ${holdHours} hours`, disabled: false };
    case "checking": return { kind: "reserve", label: "Checking reservation…", disabled: true };
    case "reserved": return { kind: "status", label: `Reserved · ${timeLeft(Date.parse(row!.deadline ?? row!.expiresAt), now)}` };
    case "review": return { kind: "status", label: "Payment under review" };
    case "confirmed": return { kind: "status", label: "Price locked" };
    case "expired": return { kind: "status", label: "Reservation expired" };
    default: return { kind: "enquire" };
  }
}
