export type OfferReservation = {
  periodEndsAt?: string;
  id: string; offerSlug: string; title: string; reservedPrice: number; regularPrice: number;
  // expiresAt: original 72 hours (history). deadline: the one in force, after any admin extension.
  terms: string[]; reservedAt: string; expiresAt: string; deadline: string; extendedUntil: string | null;
  // under_review: a payment submitted before the deadline awaits approval; the price stays held.
  status: "reserved" | "expired" | "confirmed" | "under_review"; projectId: string | null;
  confirmationStatus: "pending" | "sent" | "paused" | "failed" | "expired";
};
export type ReservationList = { reservations: OfferReservation[]; serverNow: string };
