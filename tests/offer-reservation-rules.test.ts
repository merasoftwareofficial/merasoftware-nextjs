import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { DEFAULT_OFFER, type Offer } from "../src/lib/offers";
import { heldPrice, reservationHoldHours, reservationOpen, reservationPhase, reserveCta, reserveWindowHours } from "../src/lib/offer-reservation-rules";
import { offerSchema } from "../src/lib/offers";
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
  // Owner decision 7 Nov 2026: a running reservation without a project offers Start my project.
  assert.equal(label(reservationPhase(open, row(), true, NOW), row()), "Start my project · 72h 0m 0s left");
  assert.equal(reserveCta("reserved", row(), NOW).kind, "start");
  assert.equal(label(reservationPhase(open, row({ projectId: "p1" }), true, NOW), row({ projectId: "p1" })), "Reserved · 72h 0m 0s left");
  // Pressed: paused, never expired, whatever the old deadline says.
  const paused = row({ status: "start_requested", deadline: ends(-5), startRequestedAt: ends(-10) });
  assert.equal(reservationPhase(open, paused, true, NOW), "requested");
  assert.equal(label("requested", paused), "Start requested · our team will contact you");
  assert.equal(label(reservationPhase(open, row({ status: "under_review" }), true, NOW)), "Payment under review");
  assert.equal(label(reservationPhase(open, row({ status: "confirmed" }), true, NOW)), "Price locked");
  assert.equal(label(reservationPhase(open, row({ status: "expired", deadline: ends(-1), periodEndsAt: open.endsAt }), true, NOW)), "Reservation expired");
  // An unpaid reservation from an earlier offer period may be followed by a new one.
  assert.equal(label(reservationPhase(open, row({ status: "expired", deadline: ends(-1), periodEndsAt: ends(-48) }), true, NOW)), "Reserve price for 72 hours");
  // A running reservation stays visible after the offer itself ends.
  assert.equal(reservationPhase(offer({ endsAt: ends(-1) }), row(), true, NOW), "reserved");
});

test("held price: the reservation keeps its saved price while it holds, the offer's price otherwise", () => {
  // The admin raised the offer after the reserve: the reservation still holds its own 699.
  const raised = offer({ offerPrice: 3499 });
  assert.equal(heldPrice(reservationPhase(raised, row(), true, NOW), row()), 699);
  for (const phase of ["reserved", "requested", "review", "confirmed"] as const) assert.equal(heldPrice(phase, row()), 699, phase);
  for (const phase of ["expired", "none", "open", "checking"] as const) assert.equal(heldPrice(phase, row()), null, phase);
  assert.equal(heldPrice(reservationPhase(raised, row({ deadline: ends(-1) }), true, NOW), row({ deadline: ends(-1) })), null, "expired unpaid");
  assert.equal(heldPrice("reserved", null), null);
});

test("reservation hours: default 72, per-offer setting shown on the Reserve button, saved by the offer form", () => {
  assert.equal(reservationHoldHours({}), 72);
  assert.equal(reservationHoldHours({ reservationHoldHours: 48 }), 48);
  for (const bad of [0, 721, 2.5]) assert.equal(reservationHoldHours({ reservationHoldHours: bad }), 72, String(bad));
  const cta = reserveCta("open", null, NOW, reservationHoldHours({ reservationHoldHours: 48 }));
  assert.equal(cta.kind === "reserve" && cta.label, "Reserve price for 48 hours");
  assert.equal(offerSchema.safeParse({ ...DEFAULT_OFFER, reservationHoldHours: 48 }).success, true);
  for (const bad of [0, 721, 1.5]) assert.equal(offerSchema.safeParse({ ...DEFAULT_OFFER, reservationHoldHours: bad }).success, false, String(bad));
});

// The backend (helpers/offerReservations.js) is the authority; the page copy must agree with it.
const backend = "E:/Allprojects/backend/helpers/offerReservations.js";
test("website hours agree with the backend's", { skip: !existsSync(backend) && "backend checkout not found" }, () => {
  const { holdHours } = createRequire(import.meta.url)(backend);
  for (const value of [undefined, 1, 6, 48, 72, 720, 0, 721, 2.5]) assert.equal(reservationHoldHours({ reservationHoldHours: value }), holdHours({ reservationHoldHours: value }), String(value));
});
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
