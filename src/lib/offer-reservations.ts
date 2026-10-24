export type OfferReservation = {
  id: string; offerSlug: string; title: string; reservedPrice: number; regularPrice: number;
  terms: string[]; reservedAt: string; expiresAt: string;
  status: "reserved" | "expired" | "confirmed"; projectId: string | null;
  confirmationStatus: "pending" | "sent" | "paused" | "failed" | "expired";
};
export type ReservationList = { reservations: OfferReservation[]; serverNow: string };
