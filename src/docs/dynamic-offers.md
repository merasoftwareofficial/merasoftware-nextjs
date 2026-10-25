# Dynamic offers

## Admin

Website Content → Offers has three sections:

- Offer listing: heading and empty-state message.
- Manage offers: New offer, Edit, live card preview, unsaved detail preview, Draft/Published/Archived, ordering, identity/eyebrow/headings, benefits, three prices, deadline, enquiry action and offer terms.
- Common & offer T&C: universal terms. Each offer chooses Universal, Offer-specific or Combined. Validity is generated from expiry, so changing a deadline cannot leave stale T&C dates.

Expiry input is explicitly India time. Contact accepts HTTPS, mailto or tel links. Slugs are unique, safe URL segments and immutable through editing. Price ordering and all writes are validated server-side. Commercial offer changes require the active portal admin role; website editor permission alone cannot change billing rules.

## Public

`/offer` lists published offers; `/offer/[slug]` shows their saved content. Draft/Archived/unknown URLs return 404. Published expired offers show an expired state with no promotional prices or countdown. Cards render current content directly; they do not need screenshot refreshes.

The original offer at `/offer/page` is preserved as the fallback for sites without a saved override. Its current expiry is 2 November 2026 at 23:59:59 IST, extended by the owner for the connected starter-package flow. Saving an override as Draft or Archived hides it without restoring the fallback. Existing `/offers` and campaign aliases remain compatible.

## Persistence

Existing Settings storage is reused: offers map, universal terms and listing configuration. Mongo saves update only one offer's dotted path, with a conditional create to prevent duplicate slugs. JSON saves synchronously merge into existing settings. No production seed writes are required merely to read the existing offer.

## Validation

`node --import tsx --test tests/offers.test.ts` covers validation, migration fallback, hiding states, T&C modes, current validity and JSON persistence.

`node tests/offers-browser.mjs` uses a copied ignored checkout and disposable MongoDB/portal fixtures; it never writes to running site data. It exercises admin creation, preview, save, publishing, archive, public draft privacy, duplicate/unsafe-link rejection, universal T&C and responsive listing.

`node --conditions=react-server --import tsx --test tests/offers-mongo.test.ts` verifies independent Mongo updates, conditional duplicate creates and settings preservation.

`node tests/offers-components.mjs` runs the actual offer form, package form and offer card against the real `/api/offers`, `/api/packages` and `/api/packages/offer-links` handlers with JSON storage. Only the identity and the portal package catalogue are fixtures. It was rewritten on 25 Oct 2026 for package offers (it previously imported the moved `@/app/admin/content/offers-manager` and no longer ran); see "Package offers" below for what it covers.


## Connected showcase packages — 21 October 2026

Owner-approved scope: packages remain a website showcase. Admin prepares projects and selects a package/offer; there is no package checkout and no automatic service-plan purchase. Existing portal plan checkout remains independent.

The portal backend owns the package catalogue and calculates final project quotes. Existing website offer definitions remain the single source for offer content, validity and pricing rules. Category and optional package restrictions are explicit. Three editable starter examples replace the previous static showcase. The fixed ₹699 starter can have a package-specific extra-scope charge: ₹2,000 for Plus, ₹4,000 for Complete. These amounts are editable through `/admin/packages`.

The website package form proxies authenticated saves to the backend; the public page uses a protected server-to-server catalogue read. Only current portal admins may change commercial configuration. Offer display prices must agree with their explicit pricing rules. Missing commercial rules on legacy saved offers must be configured before those offers can apply to new projects.

New projects freeze their complete agreement. Client project/workspace/invoice pages and the shared final PDF use that snapshot. Stale quote keys require refresh, extra admin discounts carry reasons, and installment amounts sum exactly in paise. Old projects are not repriced or retroactively assigned package benefits.

Backend details and verification commands: `E:/Allprojects/backend/docs/sales-packages.md`. Rollback originals and SHA-256 manifest are retained at `E:/Allprojects/backup/offer-system-20261021-203012` and must not be deleted during review.

## Package offers (package ↔ offer SSOT) — 25 October 2026

Status: committed and deployed by the owner (`168918c` "offer and package sync system"). Live check: the "Digital Dhamaka Offer" page shows its 91% OFF badge.

### Owner decisions (do not re-litigate)

- Every **new** offer is for exactly **one package**. Its two struck prices (main = package `regularPrice`, normal discount = package `discountedPrice`), "What's included" and terms come from that package and stay in sync with it. The admin types only the **offer price** (always a fixed price) and the page design.
- The **% OFF** badge is calculated from the **main** price, rounded down, and shown only on package offers.
- A package has at most **one running offer** (published and not expired). Drafts do not occupy a package. A second running offer is refused with "edit that offer, or let it expire or delete it".
- "Delete offer" = **Archive**, which frees the package at once. A hard delete would let a reused slug pick up old reservations.
- Offer terms are the package's terms (+ automatic validity + universal terms); there is no separate offer-specific terms box on package offers.
- Offers saved before this change are **left untouched by code**; the owner deletes conflicting ones himself. The portal is unchanged.

### Before → after (website only; backend, portal and data unchanged)

| File / function | Before | After |
| --- | --- | --- |
| `src/lib/offer-packages.ts` (new) | — | `syncOfferWithPackage()` (the only writer of the synced copy), `offerOutOfSync()`, `offerRunning()`, `runningOfferForPackage()`, `packageOfferProblem()` (archived package, extra scope > ₹0, offer price above the discounted price), `busyPackageMessage()` |
| `src/lib/offers.ts` `offerSchema` | no package link; included work max 30 × 300 characters | optional `packageId` (backend package-ID rule, `packageIdSchema`); package offers must use `fixed_price`; included work max 50 × 1500, the package limit |
| `src/lib/offers.ts` `offerFinalPrice()` / `offerDiscountPercent()` | the offer price formula was written three times (schema refine, offer form, package form) | one helper, equal to backend `calculateBenefit` (checked on 5,000 random cases); percent from the main price, rounded down |
| `src/app/api/offers/route.ts` `PATCH` | saved the offer as sent; package ticks saved by a second call from the browser | a new offer must name a package; the package is fixed after creation; the server re-applies the package's current values, refuses a busy package, then links (running) or unlinks (draft/archived) it through the existing backend `sales-packages/offer-links`. A failed link returns the saved offer with `X-Package-Link-Error` |
| `src/app/api/packages/route.ts` `PATCH` | plain proxy to the backend | before saving: a package with a running offer cannot be archived, change category or move to another offer, and must still fit its package offer; after saving: every package offer of that package (drafts too) is re-synced; failures are reported in `X-Offer-Sync-Failed` |
| `src/app/api/packages/offer-links/route.ts` | plain proxy; ticking a package moved it from any other offer | refuses to move a package away from a running offer and refuses to link a package offer by ticks |
| `src/app/admin/offers/offers-manager.tsx` | every offer field typed by hand | new offers: package select (busy packages marked), locked struck prices / included work / package terms with "Edit them in Packages →", offer price with % preview, "Package changed…" and "Not linked…" notices, "Delete offer" (= archive). Older offers keep the full form |
| `src/app/admin/packages/packages-manager.tsx` | — | "Running offer" note; category and linked-offer selects locked while it runs; confirm before changing a live package offer; package offers hide the extra-scope field |
| `src/components/campaign/public-interaction/page-content.tsx` | — | `% OFF` badge inside the "OFFER PRICE" line (card height unchanged) |

Verification: `node --import tsx --test tests/offer-packages.test.ts` (sync, percent, one formula, package rules, one running offer, older offers untouched, package IDs and list limits) and `node tests/offers-components.mjs` (forms + real routes: locked fields, badge, busy package, drafts, package sync and guards, link failure and retry, delete = archive, older offer unchanged, desktop/mobile). Backup of the originals: `E:\Allprojects\backup\merasoftware\work22-offer-package-ssot`.

## Reserve on the offer card + reserve window — 25 October 2026

Status: coded locally, **not committed or deployed**. It changes the website and the backend; deploy the **backend first**.

### What was wrong (measured with the real components, 25 Oct 2026)

In an offer's last 24 hours `ReserveOffer` rendered a separate box inside the price card. The card grew from 602 px to 846 px on desktop (567 → 864 px on mobile), to 976/1019 px when a phone was asked for and to 1001/1028 px after reserving (a reservation card inside the box). The box had its own style next to the orange CTA, the sticky bar always said "Enquire" and covered the Reserve button while scrolling, a logged-out click jumped straight to the sign-in page, and a service-plan-only offer showed Reserve and then failed with "Reservation is available only in the final 24 hours…". The 24 hours were hard-coded in the website and the backend.

### Owner decisions

- The card has **one main button** that follows the stage; the card never changes size. Enquiry stays available in the card footer.
- Reserve is confirmed in a **dialog** that explains the 72-hour hold, "no payment now" and, when signed out, that an account is needed ("Continue to sign in").
- Each offer sets **when Reserve opens**: 1–720 hours before the offer ends; empty = 24 hours (the previous behaviour). The **72-hour hold stays fixed**.
- Refusals explain the real reason.
- Settings that only change when or where an offer is shown must not make an open portal project form ask for a refresh.

| Stage | Main button (card and sticky bar) | Card footer |
| --- | --- | --- |
| Before the reserve window | the offer's CTA (Enquire) | "Opens email" |
| Reserve window open | **Reserve price for 72 hours** → dialog | "Have a question? Enquire" |
| Reserved / under review / price locked / expired reservation | **Reserved · 71h 59m left** / Payment under review / Price locked / Reservation expired → `/account/offers` | "Have a question? Enquire" |
| Offer ended (no running reservation) | Ask about current offers | — |

### Before → after

| File / function | Before | After |
| --- | --- | --- |
| `src/lib/offer-reservation-rules.ts` (new) | — | `reserveWindowHours()`, `reservationOpen()`, `reservationPhase()`, `reserveCta()`: the one place that decides whether Reserve is open and what the main button says. Mirrors backend `reservationRefusal` (agreement checked on 288 combinations in `tests/offer-reservation-rules.test.ts`) |
| `src/components/offer-reservations.tsx` | `ReserveOffer` held the logic **and** rendered the box; 24 h hard-coded twice | `useOfferReservation()` hook: the same load / sign-in continuation / stale quote / 428 phone / retry / renewal logic, no UI. `MyOffers` unchanged except its empty-state text no longer says "final 24 hours" |
| `src/components/campaign/public-interaction/page-content.tsx` `PublicInteraction` | `reservation` was a ReactNode box inserted under the CTA | `reservation` is data (`ReservationConfig`); the card's main button, footer link, sticky bar and the reserve dialog all read the hook; `previewReservation` shows Normal / Reserve open / Reserved in the admin preview without any request |
| `src/app/offer/[slug]/page.tsx` | rendered `<ReserveOffer …/>` | passes `{ slug, quoteKey, signedIn, serverNow, countries }`; the card is remounted per account |
| `src/lib/offers.ts` `offerSchema` | — | optional `reserveWindowHours` (integer 1–720) |
| `src/lib/offer-quote.ts` `offerWithQuote()` | signed the whole offer | leaves `DISPLAY_ONLY` fields (`reserveWindowHours`) out of the quote key but still sends them; older offers keep byte-identical keys (`tests/offer-quote.test.ts`). Only add fields older offers never had |
| `src/app/admin/offers/offers-manager.tsx` | — | "Reserve opens (hours before the offer ends)" field (project offers) and a preview state select |
| `variant.module.css` / `globals.css` | `.offer-reserve` box styles | box styles removed; button forms of `.claim` and the sticky action, `.footerLink`, `.reserveError` |
| backend `helpers/offerReservations.js` `reserveOffer` | `remaining > 24 * HOUR` and one message for every refusal | `reservationRefusal()` with `reserveWindowHours()` (invalid → 24): "This offer is not available." / "This offer has ended." / "This offer cannot be reserved. Please enquire about it instead." / "Reservation opens on <IST time>." |
| backend `helpers/salesPackages.js` `quotePackage` | the package version hashed the whole offer object | it hashes the offer's own `quoteKey` (as `serviceOfferPolicy.js` already did); an offer without a key falls back to its full content |

Not changed: the 72-hour hold, deadlines, payment qualification, repricing, force-apply, extension, reservation data, the portal and My Offers.

### Verification (25 Oct 2026)

- Backend (`E:/Allprojects/backend`): the 11-file reservation/pricing suite from `RESERVATION_AGENT_HANDOVER.md` plus `tests/packagePages.test.js` → **184/184**, including the new window/message test and the package-version test.
- Website: `node --import tsx --test tests/offers.test.ts tests/admin-offers.test.ts tests/offer-packages.test.ts tests/package-pages.test.ts tests/offer-reservation-rules.test.ts` → 21/21; `node --conditions=react-server --import tsx --test tests/offer-quote.test.ts` → pass; `node --test tests/offer-reservations.browser.mjs tests/server-time.browser.mjs` → pass (every earlier flow plus dialog, sticky bar, footer link, service-plan offer, custom window and **equal card height in normal / open / phone / reserved on desktop and mobile**); `node tests/offers-components.mjs` → pass (window saved, preview states). TypeScript and ESLint clean.
- Still failing and older than this work: `tests/offers-mongo.test.ts:35` expects the default offer to end on 20 Oct (it ends on 2 Nov).

### Rollout

1. Deploy the backend, then the website. In the other order the website could show Reserve earlier than the old backend accepts.
2. At the backend deploy, portal project forms that are open at that moment ask for one refresh (the package version formula changed). Choose a quiet time.
3. Then reserve once with a test account on a live offer inside its window and check the message for an offer outside it.

Backups of the originals: website `E:\Allprojects\backup\merasoftware\work23-reserve-cta`, backend `E:\Allprojects\backup\backend\work16-reserve-window`.

### Known, by design

- The "is Reserve open" rule exists in the backend (authority) and as a website copy that only shows or hides the button. Different codebases cannot share code; the agreement test guards them.
- Older fields such as the card order are still part of the offer quote key. Removing them would change the keys of offers saved before and of their reservations, so only new display/timing fields are left out.
