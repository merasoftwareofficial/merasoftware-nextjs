import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { DEFAULT_OFFER, type Offer } from "../src/lib/offers";
import { reservationOpen, reservationPhase, reserveCta, reserveWindowHours } from "../src/lib/offer-reservation-rules";
import type { OfferReservation } from "../src/lib/offer-reservations";

const NOW = Date.parse("2026-10-25T12:00:00Z");
const ends = (hours: number) => new Date(NOW + hours * 3600000).toISOString();
const offer = (patch: Partial<Offer> = {}): Offer => ({ ...DEFAULT_OFFER, endsAt: ends(5), ...patch });
const row = (patch: Partial<OfferReservation> = {}): OfferReservation => ({ id: "r1", offerSlug: "page", title: "Offer", reservedPrice: 699, regularPrice: 4000, terms: [], reservedAt: ends(0), expiresAt: ends(72), deadline: ends(72), extendedUntil: null, status: "reserved", projectId: null, confirmationStatus: "sent", ...patch });

test("reserve window: default 24 hours, per-offer setting, invalid values fall back", () => {
  assert.equal(reserveWindowHours({}), 24);
  assert.equal(reserveWindowHours({ reserveWindowHours: 48 }), 48);
  for (const bad of [0, 721, 2.5]) assert.equal(reserveWindowHours({ reserveWindowHours: bad }), 24, String(bad));
  assert.equal(reservationOpen(offer({ endsAt: ends(23) }), NOW), true);
  assert.equal(reservationOpen(offer({ endsAt: ends(25) }), NOW), false);
  assert.equal(reservationOpen(offer({ endsAt: ends(30), reserveWindowHours: 48 }), NOW), true);
  assert.equal(reservationOpen(offer({ endsAt: ends(5), reserveWindowHours: 2 }), NOW), false);
  assert.equal(reservationOpen(offer({ endsAt: ends(-1) }), NOW), false, "ended");
  assert.equal(reservationOpen(offer({ status: "draft" }), NOW), false);
  assert.equal(reservationOpen(offer({ targets: ["service_plans"] }), NOW), false, "service-plan offers are never reserved");
  assert.equal(reservationOpen(offer({ targets: ["projects", "service_plans"] }), NOW), true);
});

test("one main button per state", () => {
  const open = offer();
  const label = (phase: ReturnType<typeof reservationPhase>, saved: OfferReservation | null = null) => { const cta = reserveCta(phase, saved, NOW); return cta.kind === "enquire" ? "enquire" : cta.label; };
  assert.equal(label(reservationPhase(offer({ endsAt: ends(72) }), null, true, NOW)), "enquire", "outside the window");
  assert.equal(label(reservationPhase(open, null, false, NOW)), "Checking reservation…");
  assert.equal(label(reservationPhase(open, null, true, NOW)), "Reserve price for 72 hours");
  assert.equal(label(reservationPhase(open, row(), true, NOW), row()), "Reserved · 72h 0m left");
  assert.equal(label(reservationPhase(open, row({ status: "under_review" }), true, NOW)), "Payment under review");
  assert.equal(label(reservationPhase(open, row({ status: "confirmed" }), true, NOW)), "Price locked");
  assert.equal(label(reservationPhase(open, row({ status: "expired", deadline: ends(-1), periodEndsAt: open.endsAt }), true, NOW)), "Reservation expired");
  // An unpaid reservation from an earlier offer period may be followed by a new one.
  assert.equal(label(reservationPhase(open, row({ status: "expired", deadline: ends(-1), periodEndsAt: ends(-48) }), true, NOW)), "Reserve price for 72 hours");
  // A running reservation stays visible after the offer itself ends.
  assert.equal(reservationPhase(offer({ endsAt: ends(-1) }), row(), true, NOW), "reserved");
});

// The backend (helpers/offerReservations.js) is the authority; the page copy must agree with it.
const backend = "E:/Allprojects/backend/helpers/offerReservations.js";
test("website rule agrees with the backend reservation check", { skip: !existsSync(backend) && "backend checkout not found" }, () => {
  const { reservationRefusal } = createRequire(import.meta.url)(backend);
  let checked = 0;
  for (const hours of [-1, 0.5, 1, 5, 23.9, 24.1, 30, 47.9, 48.1, 100, 719, 721]) {
    for (const reserveWindowHours of [undefined, 1, 6, 24, 48, 720, 0, 721]) {
      for (const patch of [{}, { targets: ["service_plans"] as Offer["targets"] }, { status: "draft" as const }]) {
        const value = { ...offer({ endsAt: ends(hours), ...patch }), reserveWindowHours } as Offer;
        assert.equal(reservationOpen(value, NOW), reservationRefusal(value, NOW) === null, JSON.stringify({ hours, reserveWindowHours, patch }));
        checked++;
      }
    }
  }
  assert.equal(checked, 288);
});
