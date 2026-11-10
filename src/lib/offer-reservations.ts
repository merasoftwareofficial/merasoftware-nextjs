export type OfferReservation = {
  periodEndsAt?: string;
  id: string; offerSlug: string; title: string; reservedPrice: number; regularPrice: number;
  // expiresAt: original 72 hours (history). deadline: the one in force, after any admin extension.
  terms: string[]; reservedAt: string; expiresAt: string; deadline: string; extendedUntil: string | null;
  // under_review: a payment submitted before the deadline awaits approval; the price stays held.
  // start_requested: the customer pressed Start my project; the clock is paused until the team acts.
  status: "reserved" | "expired" | "confirmed" | "under_review" | "start_requested"; projectId: string | null;
  startRequestedAt?: string | null; pausedRemainingMs?: number;
  confirmationStatus: "pending" | "sent" | "paused" | "failed" | "expired";
};
export type ReservationList = { reservations: OfferReservation[]; serverNow: string };
/** What a customer asked of the team on a package page (backend helpers/packageStart.js): No price is held.
 * buy = "Proceed to pay" on the customize page (on to payment); callback = "Arrange a callback". */
export type PackageStartKind = "buy" | "callback";
export type PackageStartRequest = { id: string; packageId: string; kind: PackageStartKind; title: string; price: number | null; requestedAt: string;
  choice?: import("./sales-packages").PackageChoice | null;
  closedAt: string | null; closedReason: "project_created" | "closed_by_team" | "callback_requested" | null; projectId: string | null; status: "requested" | "closed" };
export type PackageStartList = { requests: PackageStartRequest[]; enabled: boolean };
