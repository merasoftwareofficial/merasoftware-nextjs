# Packages and offers: one system (hand-over)

Last updated: 7 November 2026 (Asia/Calcutta). Read this first before touching packages, package offers, `/package/<id>`, `/admin/packages` or the package "Start my project".

Code comments written in this work point to `src/docs/package-offers.md`. That name means this file.

Related docs: [package-pages.md](package-pages.md) (Pricing & Packages menu pages), [dynamic-offers.md](dynamic-offers.md) (offer system and the 25 Oct package ↔ offer sync), [reservation-countdown.md](reservation-countdown.md) (Reserve, hold, offer Start my project).

## 1. Status

| Repo | Commit | State |
| --- | --- | --- |
| Backend (`E:/Allprojects/backend`) | `82cd463` | Pushed to `main`, **live on Render**. Proof: `GET https://api.merasoftware.com/api/package-starts` answers 401, not 404 |
| Website (`E:/Allprojects/merasoftware`) | `252e7ec` | Pushed to `main`, **live on Vercel** |
| Portal (`E:/Allprojects/frontend`) | `12067f0` | Pushed to `main` |

Live check after deploy (7 Nov 2026):
- `/package/all-in-one` shows offer mode (3 prices, 86% OFF, countdown) for the running offer `digital-dhamaka`.
- `/package/starter` shows package mode (one price, no countdown).
- `/offer/digital-dhamaka` answers 307 to `/package/all-in-one`.
- All 6 package cards on `/packages/one-time-packages` link to `/package/<id>`, and all 6 are in the sitemap.

Not done yet:
- `PACKAGE_START_REQUESTS_ENABLED` is **not set** anywhere, so the package "Start my project" button is off and the button reads Enquire. It must be set on **both** Render (backend) and Vercel (website), and only after a real-phone test with the owner's go-ahead.
- The owner has not said "perfect" for this work yet.

Backups of the originals: `E:\Allprojects\backup\backend\work59-package-offer-form`, `backup\merasoftware\work82-package-offer-form` and `backup\frontend\work62-package-offer-form`. Each has a `manifest.sha256` and `HEAD.txt`. `NEW_FILES.txt` lists the files that had no original.

## 2. What the owner asked for (decisions, do not re-litigate)

1. **One system, not two.** Packages and offers were made in two separate admin forms. Now a package is made in the package form, and an offer is added to a package from that same form ("+ Add offer"). Every later change to the offer is made there too.
2. **Opening a package opens an offer-style page.** Before, a customer on a Pricing & Packages page could not open a package. Now every package has its own page, `/package/<id>`, built on the offer page template:
   - **Offer running:** 3 prices (main and normal crossed out, the offer price large), % OFF and the countdown. Buttons as on offers: Reserve, then Start my project.
   - **No offer, or the offer has ended:** 2 prices (main crossed out, the normal price large) and no countdown. The page switches without a reload when the countdown reaches 0.
   - A package without an offer must also be startable, like an offer ("Start my project").
3. **The admin never types the permanent ID.** The system makes it from the package name. The offer link (slug) is made the same way.
4. **Page design moves to the package.** Every field from the offer form that designs the page (eyebrow, heading, highlight, supporting line, benefits subheading, tagline, badge, price description, enquiry button text, contact link) now belongs to the package. The fields that make something an offer stay in a separate Offer section.
5. **Offer fields are optional until an offer is added.** A package alone saves without any offer field. Once "+ Add offer" is pressed, every field the system needs becomes required: offer name, offer price (must be below the normal price), expiry, and the payment rule. If the payment rule is "Limited uploads", the upload allowance is also required, and due days whenever the rule is not "Keep current system rules".
6. The owner approved the exact form layout from a clickable mockup: https://claude.ai/artifact/CYeTmxLpNpJigJYL1nVmtQ (the page on the right is the live customer preview).
7. The owner chose these on 7 Nov 2026:
   - the page URL is `/package/<package-id>`;
   - "Start my project" without an offer is for members and clients;
   - it sits behind a flag until a real-phone test;
   - an offer must cost less than the normal price;
   - an offer runs only on a published package.
8. **Offer management stays as it is** for now (owner, 7 Nov 2026): the Offers tab, Content & Preview, universal Terms & Conditions and Target people. Work goes step by step.

Working rules from the owner for this work:
- verify with real code and live data before proposing;
- explain first, and code only after "code likho", "haan" or "working start karo";
- write docs only after "perfect", or when the owner asks for them, as here.

## 3. What existed before (audit, 7 Nov 2026)

Live data (read-only, 7 Nov 2026):
- Website settings hold 4 offers. `page`, `all-in-one-startup-package` and `social-media-setup` are all archived and have no `packageId`. `digital-dhamaka` is published, on package `all-in-one`, with payment policy `limited_uploads`, and ends on 8 Nov 2026 at 23:59 IST. Its prices are ₹25,000 → ₹20,000 → ₹3,499.
- There are **no service-plan offers** in the data.
- Package pages: only the default "One-Time Packages" page exists (`settings.packagePages` is absent).

Before this work:
- **Two forms.** `/admin/packages` handled name, ID (typed by the admin), category, status, pages, scope, terms, the 2 prices, an old "Linked offer" select and "Extra scope" (₹). `/admin/offers` handled package select, 12 design fields, offer price, expiry, payment policy, reserve window, hold hours and T&C mode.
- **No package page.** The package card had only a `mailto:` "Discuss this package" link. The offer page could not show a package without an offer, because `offerSchema` requires `endsAt`.
- **"Start my project" existed only on a reservation.** `helpers/reservationStart.js` needs a reservation, and a reservation needs `offerSlug` + `offerSnapshot` (`models/offerReservationModel.js`).
- The backend priced a package without an offer at its discounted price. The portal's project form could already select a package (`frontend/src/pages/AdminClientWorkspace.js`).

Problems found in the audit:

| # | Problem | Now |
| --- | --- | --- |
| 1 | A **draft package could have a live offer**: `packageOfferProblem` refused only archived packages. The offer page was live while the package was hidden | **Fixed:** a published offer needs a published package |
| 2 | An offer price **equal to the normal price** was accepted, which is no offer at all | **Fixed:** it must be below the normal price (package offers only; older offers untouched) |
| 3 | The package offer form showed "Plan payment-policy cycles", which only matters for service plans | **Fixed:** not shown in the package form; saved as `first_purchase` |
| 4 | Two ways to link an offer to a package: the old "Linked offer" select in the package form, plus the offer form | **Fixed:** the package form no longer shows "Linked offer" or "Extra scope". Saving a package with an offer sets `offerExtraPrice` to 0 |
| 5 | The package card had no link to a page | **Fixed:** "View package →" opens `/package/<id>` |
| 6 | A project started from a reservation records `agreement.package = null` (`helpers/projectPricing.js` refuses `packageId` together with `offerReservationId`) | **Not changed.** Known gap, not in scope |
| 7 | Offer payment reminders and offer installment invoices run only with `ENABLE_CRONS=true`. Memory notes said Render prod lacks it | **Not changed.** Check Render before relying on reminders |

## 4. How it works now

### Data ownership

| Thing | Owner | Where |
| --- | --- | --- |
| Package: name, ID, category, status, pages, description, scope, terms, main and normal price, **page design** | Backend | `SalesCatalogue` document `packages`, field `packages.<id>`; design in `packages.<id>.design` |
| Offer: name, slug, status, offer price, expiry, payment policy, reserve window, hold hours, plus a synced copy of the package's prices, scope, terms and category | Website | `settings.offers.<slug>` with `packageId` |
| Package start requests | Backend | Collection `packagestartrequests` (model `packageStartRequest`) |

### Rules
- **Package ID:** `helpers/salesPackages.js` `packageIdBase()` turns "Business Starter" into `business-starter`, then `-2`, `-3` while taken. A name without Latin letters gives `package`. The write only creates the ID while it is still free (a conditional `$exists: false`), so two saves at the same moment get different IDs. The ID never changes; renaming keeps the link.
- **Offer link:** `src/lib/offer-packages.ts` `offerSlugFor()`: the same idea, checked against every saved offer including archived ones, so a link is never reused (old reservations point to it). `createPackageOffer()` retries with the next number if the conditional create loses a race.
- **Design:**
  - It is checked on the website (`src/lib/package-design.ts` `packageDesignSchema`) and again in the backend (`validateDesign`), with the same limits as the old offer fields.
  - It is kept **out of the package `quoteKey`**, like `pages`, so a design change never asks an open portal project form to refresh.
  - New offers on a package store **no** design fields, so editing the design never changes an offer's `quoteKey` either.
- **What a page shows** (`offerView` / `packageView` / `inheritedDesign` in `package-design.ts`):
  - the package's own design;
  - else, for a package saved before 7 Nov, the design of its last offer that has one;
  - else the defaults.
  - This keeps `all-in-one` looking like `digital-dhamaka` after that offer ends, **without any production data migration**. The first save in the new form stores the design on the package.
- **Older offers** (no `packageId`) keep all design fields required (`offerSchema` refine) and keep their own form in Offers.
- **One running offer per package**, unchanged from 25 Oct. Drafts do not occupy a package. "End offer" archives it: the package link is released and reservations keep their price.
- **Package start request** (`helpers/packageStart.js`):
  - one open request per person and package (a unique partial index; a second click returns it);
  - a phone is required (HTTP 428 asks an older account for it);
  - a member gets their one lead through `linkPersonLead`, and a client gets their Won lead through `ensureWonLead` after the commit;
  - a follow-up line is added to the lead;
  - team mail `package.start.request.admin` and customer mail `package.start.request.received`, each sent once;
  - the team is reminded once a day, at most 3 times;
  - creating a project on that package for that person closes the request (inside the project transaction, `helpers/adminProjectCreation.js`). The team can also close it by hand in the portal;
  - the jobs run in the existing reservation-jobs cron (`OFFER_RESERVATION_JOBS_ENABLED`) and each call checks `PACKAGE_START_REQUESTS_ENABLED`.

### Save flow (one Save button)
`PATCH /api/packages` with `{ item, creating, offer?: { creating, offer } }`:
1. Same origin and sales admin are checked, and the design is checked.
2. If an offer is included, it is checked against the package **as it will be saved** (`packageOfferProblem`, `offerSchema`, busy package) **before anything is written**. Everything is checked first; nothing is half-written because of a validation error.
3. The running-offer guards from 25 Oct are applied. Ending the running offer in the same save is allowed.
4. The package is saved in the portal. `creating` with no ID makes the ID.
5. Other offers of the package (drafts) are re-synced.
6. The offer is saved on the website through `src/lib/offer-save-server.ts` (`saveOfferRecord` / `createPackageOffer`), the single save path also used by `/api/offers`.
7. The response is `{ package, offer, offerError?, linkError?, unsynced? }`. If only the offer failed, the form says "Package saved, offer not saved: …" and keeps the typed values.

## 5. Changes, with before → after and exact location

### Backend (`E:/Allprojects/backend`, commit `82cd463`)

| File / function | Before | After |
| --- | --- | --- |
| `helpers/salesPackages.js` `validatePackage` | no design; ID always required | optional `design` checked by new `validateDesign()` (same limits and contact-link rule as offers) |
| `helpers/salesPackages.js` `savePackage` | the admin typed the ID; one conditional write | when creating without an ID, it is made with `packageIdBase()` plus the next free number; a lost race retries up to 20 times |
| `helpers/salesPackages.js` `quotePackage` | the key left out `pages` | the key leaves out `pages` **and** `design`; older packages keep identical keys |
| `models/packageStartRequestModel.js` | did not exist | the request (package snapshot with name and price, lead, notices, alerts, closed reason, project) |
| `helpers/packageStart.js` | did not exist | `requestPackageStart`, `listPackageStarts`, `deliverPackageStartNotices`, `alertPendingPackageStarts`, `closeOnProject`, `closeByTeam` |
| `routes/packageStarts.js`, `routes/index.js` | — | `/api/package-starts`: `GET /` (mine), `POST /` (ask), `GET /user/:userId` (admin), `POST /:id/close` (admin) |
| `index.js` | reservation jobs only | the same cron also runs the package start notices and alerts |
| `helpers/adminProjectCreation.js` | — | `closeOnProject` inside the project transaction, keyed by `order.projectSnapshot.salesAgreement.package.id` |
| `helpers/emailDefinitions.js`, `helpers/emailCatalog.js` | — | `package.start.request.admin` (team, Both) and `package.start.request.received` (customer, Both), both **system-triggered** |
| `helpers/reservationClosure.js` `reservationOverview` | reservations only | also `packageStarts` (open requests) for the website Communication panel |
| `tests/packageStart.test.js` (new), `tests/reservationCountdown.test.js` | — | 9 new tests; the catalogue test now expects 13 team actions |

### Website (`E:/Allprojects/merasoftware`, commit `252e7ec`)

| File | Before | After |
| --- | --- | --- |
| `src/lib/package-design.ts` (new) | — | design schema, defaults, `offerView`, `packageView`, `inheritedDesign`, `OFFER_DESIGN_KEYS` |
| `src/lib/offers.ts` `offerSchema` | design fields required on every offer | optional; still required on offers **without** a package (refine) |
| `src/lib/offer-packages.ts` | — | rules: published package needed, price below normal; `offerSlugFor()` |
| `src/lib/offer-save-server.ts` (new) | offer save logic lived inside `api/offers/route.ts` | one shared save (`saveOfferRecord`, `createPackageOffer`) |
| `src/app/api/offers/route.ts` | full save logic | calls `saveOfferRecord` |
| `src/app/api/packages/route.ts` | package proxy with guards | the combined package + offer save described in §4 |
| `src/app/admin/packages/packages-manager.tsx` (+ `.module.css`, `page.tsx`) | package-only form | the approved form: 1. Package (no ID field), 2. Page design, 3. Offer (Add / Running / End offer / Start new offer / past offers), live customer preview on the right, "Preview full page ↗" dialog, `?package=<id>` opens a package. Field errors follow every change after a refused Save. A new package's heading follows its name until edited |
| `src/app/admin/offers/offers-manager.tsx`, `page.tsx` | "New offer +"; package offers edited here | "New offer +" replaced by "Add an offer on a package →" (link to Packages); package offers' Edit and the old `?offer=` / `?new=1` links open the package form; older offers keep their form |
| `src/app/package/[id]/page.tsx` (new) | — | the package page (offer mode or package mode), 404 for draft, archived or unknown packages, Page SEO key `package-<id>` |
| `src/components/campaign/public-interaction/page-content.tsx` | offer page only | `pkg` prop: package mode (2 prices, no countdown), Start my project dialog, back link, package terms; a running reservation of the last offer keeps its own button |
| `src/components/offer-reservations.tsx`, `src/lib/offer-reservations.ts` | — | `usePackageStart()` hook (load, send, sign-in continuation with `pending-package-start`, phone 428) and types |
| `src/app/api/package-starts/route.ts` (new) | — | pass-through to the backend |
| `src/app/offer/[slug]/page.tsx` | showed every published offer | a package offer on a published package redirects to `/package/<id>` (reservation mails and the sign-in return use this link) |
| `src/app/offer/page.tsx`, `src/components/campaign/offer-preview.tsx` | offer fields only | cards use the package design and link to the package page |
| `src/components/campaign/package-card.tsx` | `mailto:` "Discuss this package" | "View package →" `/package/<id>` |
| `src/lib/package-pages-server.ts`, `src/lib/page-seo.ts`, `src/app/sitemap.ts` | — | `readPublicPackagesOrNone()`, `packagePath()`, package pages in Page SEO and the sitemap |
| `src/app/admin/communication/reservation-panel.tsx` | reservations only | "Package start requests" list |
| tests | — | `tests/package-design.test.ts`, `tests/package-offer-save.test.ts` (new); `tests/offer-packages.test.ts` updated for the new price rule; `tests/offers-components.mjs` rewritten for the one form |

### Portal (`E:/Allprojects/frontend`, commit `12067f0`)

| File | Before | After |
| --- | --- | --- |
| `src/common/index.js` | — | `SummaryApi.packageStarts` |
| `src/components/admin/ReservedOffersPanel.js` | reservations only | the client's package start requests, with "Close request" |

## 6. Where this differs from the first plan (and why)

- **Package start mails are system-triggered, so On by default**, not "Off until turned On". A background job may only send system-triggered events (`emailController.js` `prepareMail`); customer-triggered ones are refused from a job. The offer Start messages work the same way. The whole feature is behind `PACKAGE_START_REQUESTS_ENABLED`, and each mail can be switched Off in Communication.
- **The design is stored in the backend package, not in website settings.** One save writes one place, the public page gets design and prices in one read, and the design is kept out of the quote key.
- **No copy script for `digital-dhamaka`.** `inheritedDesign()` gives the same result with no production write.

## 7. Verification (7 Nov 2026)

- Backend: `node --test --test-concurrency=3 tests/*.test.js whatsapp/tests/*.test.js` → **813/813**.
- Website: `node --import tsx --test tests/offers.test.ts tests/admin-offers.test.ts tests/offer-packages.test.ts tests/package-pages.test.ts tests/offer-reservation-rules.test.ts tests/package-design.test.ts tests/package-offer-save.test.ts` → 29/29. `node --conditions=react-server --import tsx --test tests/offer-quote.test.ts` → pass. `node --test tests/offer-reservations.browser.mjs tests/server-time.browser.mjs` → pass.
- Website browser: `node tests/offers-components.mjs` → **PASS**. It runs the real forms and routes with JSON storage; only the identity and the portal catalogue are fixtures. It covers:
  - automatic IDs and offer links;
  - required offer fields;
  - nothing sent while a field is wrong;
  - offer mode and package mode on the page;
  - Start my project dialog;
  - package sync and guards;
  - busy package;
  - End offer;
  - older offers unchanged;
  - no horizontal scroll at 1440, 390 and 320 px.
  Screenshots are in `test-results/offers-component-<time>/`.
- Portal: `node tests/reserved-offers-admin-browser.cjs` → pass.
- TypeScript: `npx tsc --noEmit` is clean in `src/`. The errors it shows come from `backup/fix5` (an old ignored copy inside the repo, not deployed).
- ESLint: clean in the changed files. The remaining findings are in files this work did not touch (`trust-campaign.tsx` and others).
- Not run: `next build`. It fails on the E: drive for an older reason ("workStore InvariantError"); Vercel built it fine.
- Not done: a click-through with a real admin login, and a real-phone test of the package Start.

## 8. Known gaps

- `/account/offers` (My offers) does not list package start requests. The package page itself shows "Start requested · our team will contact you".
- A project started from a reservation still records no package in its agreement (§3, problem 6).
- Offer reminders depend on `ENABLE_CRONS` on Render (§3, problem 7).
- The Offers tab still has "Add an offer on a package →" (a link to Packages), and `/api/offers` still accepts creating a package offer. No screen uses that path any more.

## 9. Next step (proposed on 7 Nov 2026; waits for the owner's "code likho")

The owner asked whether a separate way to create an offer should still exist. The answer given was **no**, done in one small step:
1. remove "Add an offer on a package →" from the Offers tab;
2. make `/api/offers` edit existing offers only, refusing `creating: true`, so new offers are made only in the package form.

Everything else in Offer management stays as it is (owner decision). Earlier ideas that the owner did **not** approve, so do not build them: moving all of Offer management into Packages, removing the Offers tab, and moving service-plan offers.

## 10. Notes for the next agent

- Rollout order is always **backend first**, then website, then portal. The new form needs the backend's automatic ID: an old backend refuses an empty ID.
- `.env.local` on the website points at the **production** database. Never test saves on running local servers; use the fixtures (`tests/offers-components.mjs`). Read-only queries are fine.
- On this PC, long Bash heredocs with quotes get cut off. Write edit scripts to a file (Python with exact string replacement) and run that file.
- Many files use CRLF line endings; keep the ending a file already has.
- zod is v4 here: `.refine()` keeps the object type, and `.partial()`/`.omit()` on refined objects is not allowed. Validate the full object instead.
- `tsconfig.json` includes `backup/` folders inside the repo (git-ignored), so `tsc` reports errors from old copies there. Ignore those.
