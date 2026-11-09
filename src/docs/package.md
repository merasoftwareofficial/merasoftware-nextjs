# Package customize page + package projects: final plan

Updated: 9 Nov 2026 (Asia/Calcutta).

**Status:**
- **Phases 1, 2 and 3 are built, all their checks pass, and they were pushed on 9 Nov 2026 on the owner's instruction** (backend, then website, then portal). The owner's review is pending (§7, "Phase 1 result" and "Phases 2 and 3 result").
- `PACKAGE_START_REQUESTS_ENABLED` is still off on Render and Vercel, so the customize page and the request are not live. Turn it on only after a real-phone test and the owner's go-ahead.

Read with: [package-and-offer.md](package-and-offer.md) (package form, package + offer, `/package/<id>`, package start request), [plan.md](plan.md) (plan builder and checkout, the pattern this page follows), [reservation.md](reservation.md) (Reserve / Start my project).

## 0. Next agent: start here

**The owner's working rules:**
- Reply to the owner in Hinglish. Write code, UI text and docs in English.
- Explain and verify first. Write code only after the owner says "code likho", "haan" or "proceed".
- Build **one phase per session** (§7), then report and wait for review. Update this doc after the step.
- Before changing any file, back up the originals in `E:\Allprojects\backup\<repo>\workNN-<name>`, never inside a repo. Add `manifest.sha256` and `HEAD.txt`.
  - Next free numbers: backend `work66`, website `work92`, portal `work67`. Check that they are still free.
- Never write to live data. Never commit, push or deploy without the owner's permission.
  - The website `.env.local` points at the production database.
  - Deploy order: backend, then website, then portal.
- Do not use `sed -i` on Windows; it changes CRLF line endings. Many files are CRLF: keep the ending the file already has (Python exact string replacement works).

**Before you build, verify (do not trust this doc blindly):**
1. `git -C E:/Allprojects/<repo> status --short` and `git log -1` for backend, merasoftware and frontend. Ask the owner whether Phase 1 has been reviewed, committed or deployed.
2. Run the baseline tests and note any failure **before** you change anything:
   - backend `node --test --test-concurrency=3 tests/*.test.js` (`broadcast.test.js` may fail only under parallel load);
   - website `node --import tsx --test tests/package-*.test.ts tests/offer-packages.test.ts` and `node tests/offers-components.mjs`;
   - portal `node --test tests/project-installments.test.mjs` and `node tests/project-detail-browser.cjs`.
3. Re-read every file your phase touches (§6 and §7), and check that the facts in §5 still hold, with a grep or a small repro. Where the code differs from this doc, the code wins: tell the owner and update this doc.
4. Write a short plan for your phase in the chat (what you understood, which files you will change, open questions). Wait for "code likho".

**Owner's needs, in the owner's words (8 Nov 2026), and why the decisions are what they are:**
- "Pehle ye sistem portal mein tha, maine delete karwa diya." Packages are now made and operated only on the website (`/admin/packages`). The backend on Render keeps the rules and data.
- "Package koi plan nahi hai." A package is always sold as a **project**, through the same functions the admin uses to create a project for a client. "Naya system nahi banana, existing ko reuse karna hai."
- "Jo package mein chuna gaya hai, portal mein wahi cheezein milengi, tabhi is kaam ko justify kiya jayega. Dummy to nahi karna." So the portal enforces exactly what the customer bought: uploads Yes / No, and in per-file mode the files per update and updates per month.
- "Package kisi bhi cheez ka ho sakta hai", for example a notification-only service with no uploads. So "portal uploads Yes / No" is chosen when the package is made.
- Monthly: the customer chooses the cycle and the length "jaise plan mein hota hai". In per-file mode "monthly price apne aap file ke hisaab se ban jayega", so the admin does not type a monthly price separately. Discounts sit "main source", the per-file rate, which keeps it simple.
- "Offer har renewal pe lagegi", so customers buy on the offer. It is capped by "limit 1 saal tak".
- "Payment gateway abhi nahi juda", so there is no website payment yet. The request goes to the team, and the admin creates the project. Self-checkout comes later.
- "Bahut overworking ho gayi": no extend for now. The client buys again at the live price, so nobody keeps an offer price for years.
- On the due-rule gap (§5 item 11): "is kaam ka hissa nahi, lekin judega isi ke saath", because one-time packages paid in installments go through the same path. Hence decision 17.

**Rejected; do not propose again:**
- A hidden service plan behind a monthly package. The owner said a package is a project, never a plan.
- Turning a project into a plan (`isServicePlan`, used in 43 backend files).
- Payment or checkout on the website now, or a website "Pay" button.
- Extend or renew in this work (it is a later task, §9).
- Migrating or back-filling existing packages.
- Cheaper slabs in per-file mode, or a separate monthly price plus per-file extra.
- A setup fee bundled with a monthly package. One payment settles one order (`customerCreateServicePlanOrder.js`).
- A "Decide payment later" option for packages. Pay later exists only through an offer's `pay_later` rule.
- A separate "Category offer" choice in the admin form. Only the package decides the offer.

**Points a reader asked about (8 Nov 2026), answered from the existing system (9 Nov 2026):**
1. **Does the request hold a price? Known.** Decision 5 and Phase 2 agree:
   - The request's `packageSnapshot` stores the price the customer **saw** (the quote, offer included), only as a record. It never holds or locks that price.
   - The project is always priced from the live package when the admin creates it. The model comment in `packageStartRequestModel.js` says the same.
   - Only **Reserve** holds a price.
2. **Installment splits. Known.** They are fixed: 2 = 50 / 50, 3 = 30 / 30 / 40, due by progress (`helpers/projectInstallments.js buildInstallments`). Per package, the admin only chooses **which** options the customer sees (`paymentOptions`). There is no per-package split.
3. **While an offer runs:** the existing Reserve flow stays (Reserve, then Start my project). The customize link shows only without a running offer, and the customize page sends a visitor back to the package page while an offer runs. The admin chooses the payment option in the create form.
4. **Create project from a request:** the existing pattern, as for reservations. The create form lists the customer's open package requests ("Customer's package request"); picking one fills the package and the choice. The website request list (Communication → Reservations) has a **Create project ↗** link that opens the client's portal page with `?startRequest=<id>`, so the form opens already filled. No new button or screen in the portal panel.
5. **The Start flow hold** is lifted: the owner told the agent to build both phases (9 Nov 2026).
6. **Monthly discounts:** the offer price is the monthly price or rate per file, and the cycle discount applies on top of it, as the plan engine's `cyclePriceFromMonthly` does.

## 1. Goal

A package gets a customizable page like a plan. The customer chooses how to buy it, sees the price, and clicks **Get this package**. The team is told, and the package becomes a **project** made by the same functions the admin already uses. Nothing new is built where something already exists.

## 2. Owner decisions (8 Nov 2026, do not re-litigate)

1. **A package is always a project, never a plan.** The website menu page (One-Time Packages, or any page the owner adds) only decides where a package is shown.
2. **A package is a catalogue entry, a template for creating a project.** Offer limitations (offer price, uploads before payment, due days, pay later) stay the offer's own rules and are frozen onto the project when it is created. They are not copied into the package.
3. **Flow:** `/package/<id>` (offer-style page, unchanged) → **Get this package** → `/package/<id>/customize`. Left: details, description, included work, terms and the choices. Right: a "Your package" price card. Same pattern as the plan builder.
4. **No payment on the website for now** (no payment gateway yet). Get this package sends the existing **package start request** with the customer's choice and price. The team is notified, and the admin creates the project with the existing form, filled in from the request. Payment works as it already does: the client pays the invoice in the portal, or the admin records the payment.
5. **Offer running:** the price is kept by the existing **Reserve** flow. The package request itself holds no price (decision of 7 Nov).
6. **Admin project form:** the admin picks only the package; its offer applies by itself. The separate **Category offer** dropdown is removed from the form (the backend keeps supporting it for older projects). A reservation also works together with its package after the offer has ended.
7. **Decided when the package is made:**
   - billing: **One-time** or **Monthly**;
   - portal uploads: **Yes**, or **No** (progress notifications only);
   - payment options shown to the customer (one-time): **Full / 2 installments / 3 installments**;
   - monthly pricing (point 9).
8. **Uploads:**
   - a one-time project with uploads Yes: unlimited uploads during development, up to the system limit of files per upload (100);
   - uploads No: no upload button and no upload accepted;
   - an offer with "limited uploads" limits uploads before payment, as today.
9. **Monthly package:**
   - The customer chooses the billing cycle (Monthly / Quarterly / 6 months / Yearly, each with its own discount %) and the length (up to 12 months). This works like the plan builder.
   - Pricing is one of two kinds:
     - **fixed monthly price**;
     - **per file**: the customer picks files per update and updates per month, and the monthly price is worked out from them (files × rate × updates per month). One rate per package, no cheaper slabs.
10. **Three prices** (main, struck through / discounted, charged / offer) work as today. In per-file mode the three prices are per-file rates.
11. **An offer price bought applies to every cycle of that purchase** (max 12 months).
12. **The portal gives exactly what was chosen.**
    - Per-file: the chosen files per update, and updates per month.
    - Fixed monthly: unlimited updates, up to the system limit of files per upload.
13. **A monthly project stops when a due payment is unpaid** (uploads closed until paid) **and ends at the end of the chosen length** (uploads closed).
14. **No extend for now.** To continue after the end, the client buys the package again at the live price. Extend is a later, separate task (§9).
15. **Existing packages are not migrated.** Until the owner edits a package and saves the new options, it works exactly as today, and it gets no customize page. New packages must have the options before they are published.
16. **Website = frontend + pass-through API routes; the Render backend owns rules and data.** Offers and the package page list stay in website settings, as today.
17. **One due rule for every installment, progress-based and date-based** (8 Nov 2026). A one-time package paid in 2 or 3 installments uses the progress installments. So when an installment is due and unpaid, uploads close and the project shows Payment Pending, even when no invoice exists yet (§5 item 11). This also applies to existing progress-installment projects.

## 3. How it works

```
/package/<id>  →  Get this package  →  /package/<id>/customize
   one-time: Full / 2 / 3 installments              monthly: cycle + length (+ files and updates in per-file mode)
   right card: total, due now, what follows          right card: per month, per cycle, number of payments
        │  Get this package (signed in; a visitor signs in first and the request continues)
        │  (offer running: Reserve → Start my project, existing)
        ▼
Package start request  (+ choice + quoted price)  → lead + team mail/WhatsApp + customer mail (existing)
        ▼
Portal admin: request → "Create project" (form filled from the request) → existing creation
        ▼
Project: agreement frozen (package, offer, uploads setting, installments, end date, upload limits)
Client: pays in the portal (wallet instant, UPI after approval) or admin records the payment (existing)
```

## 4. The existing system this reuses (verified 8 Nov 2026)

| Step | Where | What it does now |
| --- | --- | --- |
| Package save | Website `src/app/admin/packages/packages-manager.tsx` → `src/app/api/packages/route.ts` → backend `PATCH /api/admin/sales-packages` → `helpers/salesPackages.js savePackage / validatePackage` | Package + offer in one save; automatic ID; `quoteKey` leaves out `pages` and `design` |
| Package read | `GET /api/admin/sales-packages` (`adminRead`: packages with quotes, offers, plans, categories, drafts); `GET /api/integration/sales-packages` (public) | The portal reads only this; the old portal package editor is gone |
| Price | `salesPackages.js quotePackage` → `offerEligible` + `calculateBenefit` | A running offer is applied by itself |
| Project creation | Portal `pages/AdminClientWorkspace.js CreateProjectForClientForm` → `POST /api/admin/clients/:customerId/create-project` → `controller/order/adminCreateProjectOrder.js` | Category, features, `resolveProjectPricing`, `startsApproved`, `buildInstallments`, `persistAdminProject` |
| Agreement | `helpers/projectPricing.js resolveProjectPricing` | Live package, quote key check (409 when changed), reservation, `freezePaymentPolicy`, agreement v2 |
| Writing | `helpers/adminProjectCreation.js persistAdminProject` (one transaction) | Reservation attach (`attachProjectReservation` finds the client's reservation for the package's running offer by itself), `packageStart.closeOnProject`, timeline, due-now invoice, payment |
| Request | `helpers/packageStart.js requestPackageStart`, model `packageStartRequestModel`, route `routes/packageStarts.js` | One open request per person and package; lead; mails; up to 3 daily team reminders; closed when the project is created |
| Uploads | `helpers/projectUploadGate.js assertProjectAcceptsUpload`; every server path (portal, staged, external, submit) passes through it | Refuses when cancelled, complete, pending approval, payment due, or by the offer rule |
| Upload counting (plans) | `helpers/serviceAllowance.js uploadAllowanceNow` | Per-cycle allowance, month-by-month release, carry forward inside the cycle |
| Price history | `models/projectPricingRevisionModel.js` | Immutable before/after records (used by reservation repricing) |

Tests run on 8 Nov 2026, all passing:
- backend package/project tests: 25/25;
- plan allowance tests: 37/37;
- renewal and offer-cycle tests: 16/16;
- website package tests: 17/17.

## 5. Facts found in verification that the work must handle

1. **"Is an installment due?" is decided in 8 places**, not one:
   - backend: `projectDuePayment.js`, `offerProjectInvoices.js`, `projectNodeService.js`, `projectPaymentSettlement.js`, `getOrderDetails.js`, `getUserOrder.js`, `cron/offerPaymentReminderCron.js`;
   - portal: `pages/ProjectDetails.js`.

   All of them use only `progressThreshold`. A date-based installment must use **one shared helper** in all of them, or the screens will disagree.

   **After Phase 1:** six of them ask `projectDuePayment.js`: the upload gate, order details, the order list, offer invoices, the reminder cron and the portal (which uses the server's `hasUnpaidInvoice`). Two were left on `progressThreshold` on purpose, because they do not answer "is it due":
   - `projectNodeService.js getBlockingInstallmentThreshold` caps how far the timeline may advance. It is a no-op without a threshold, so date-based installments never cap it.
   - `projectPaymentSettlement.js dueInvoice` decides whether a payment may be **accepted**. Without a threshold it accepts at any time, so paying a cycle early stays allowed.

   Phase 3 must keep both as they are, and add the date rule only inside `isInstallmentDue`.
2. Project installments become due by project progress only. Without a threshold they are due **at once**. Monthly installments need a due date.
3. Projects have **no end date and no upload counting**. Both exist only for plans (`isServicePlan`, used in 43 backend files). **Do not turn a project into a plan.** Bring the tested rules into the project path instead.
4. The package request saves `discountedPrice` as the price, even while an offer runs (`packageStart.js`, line 49). The request API accepts only `packageId`, `countryCode` and `phone`.
5. The portal request list (`components/admin/ReservedOffersPanel.js`) has only **Close request**. The create form accepts no starting values.
6. The portal upload button (`ProjectDetails.js` line 767) works out its own lock rule from order details. It does not ask the server gate.
7. `resolveProjectPricing` refuses `packageId` together with `offerReservationId` (line 12). The reservation's `offerSnapshot.packageId` links it to its package.
8. A package offer is `fixed_price` against the package's one price (`calculateBenefit`). For a monthly package, the offer price is a monthly price or a per-file rate.
9. The portal installment preview (`buildInstallmentPreview`) must stay byte-aligned with the backend `buildInstallments`.
10. `PACKAGE_START_REQUESTS_ENABLED` is off everywhere, so the package request is not live yet.
11. **The project upload gate counts invoices only.** A later installment's invoice is created only when it is paid (`installmentSettlement.js`, `projectPaymentSettlement.js`). So a due, unpaid installment with no invoice does **not** close uploads.
    - Proven with a repro on 8 Nov 2026: installment #2 unpaid, its due date passed, no invoice → `assertProjectAcceptsUpload` returned `null` (upload allowed).
    - For monthly installments, the due rule must read the installment itself (paid flag and due date), as `offerPaymentPolicy.getPaymentAccess` already does for offer projects. It must not wait for an invoice, and no cron is needed.
12. The portal falls back to a fixed 40% / 75% progress rule for installments #2 and #3 that have no threshold (`ProjectDetails.js`, about lines 356–366). A date-based installment also has no threshold, so it must be marked as date-based, or the portal would pause the project by progress.
13. **Progress 100% marks the project Completed and closes uploads** (`projectNodeService.js`, `orderStatusEngine.js`, `projectUploadGate.js`). For a monthly project, 100% must not be allowed before its end date. Otherwise the client loses the paid months. Add, edit and restore of a node can all reach 100%; they all pass through `syncActiveProjectProgress`, which is where the rule sits.
14. Payment reminders (`cron/offerPaymentReminderCron.js`) go through unpaid **invoices** only, and run only with `ENABLE_CRONS=true`. A due installment that has no invoice gets no reminder. The client sees it as Payment Pending in the portal. Reminders for due installments are a later task (§9).
15. The website `/api/package-starts` route forwards only `packageId`, `countryCode` and `phone`, so the choice must be added there too. The portal request list sits inside the client workspace page (`AdminClientWorkspace.js`, next to the create form), so opening the form from a request needs no new page.
16. The offer price rule (`offer-packages.ts packageOfferProblem`: the offer price must be below the normal price) already fits a monthly price or a per-file rate. Only the wording of the price changes.
17. **Installment names in the portal are hard-coded for 30 / 30 / 40.**
    - `pages/InstallmentPayment.js` (`getInstallmentName`, `getProgressText`) and `components/PaymentAlert.js` say "Second Installment (30%)" and "from 50% to 90%". This is already wrong for 50 / 50 projects, and would be wrong for monthly cycles.
    - The names must come from the installment itself: percentage, due date, date-based or progress.
    - `percentage` is required in the installment schema (`orderProductModel.js`), so cycle installments must store it.
    - Already generic, verified: the payment eligibility check (`helpers/installmentPaymentEligibility.js`: paid, pending, current), the backend settlement (`projectPaymentSettlement.js`: early payment allowed without a threshold; the invoice is made when paid), the timeline cap (`projectNodeService.js`: no cap without a threshold) and the invoice PDF list (number, percentage, amount, due date).
18. The 2 / 3 installment splits are hard-coded in the backend `buildInstallments` and in its portal copy `frontend/src/helpers/projectInstallments.js`. The cycle-installment builder must be added to both, with the same output. Moving to the next installment is already generic: the next unpaid one, any number of installments.

## 6. What changes (planned; before → after)

These tables cover the whole work. What Phase 1 has already built is listed in §7, "Phase 1 result". The rest belongs to Phase 2 (customer flow, request, admin one-step) or Phase 3 (everything monthly).

### Backend (`E:/Allprojects/backend`)

| File / function | Before | After |
| --- | --- | --- |
| `helpers/salesPackages.js validatePackage` | name, category, status, pages, description, inclusions, terms, 2 prices, design | Optional new settings: `billing`, `portalUploads`, `paymentOptions`, monthly pricing (`monthly`: billing options with discount %, max length, fixed monthly price or per-file mode with files and updates ranges). The prices act as the monthly price or the per-file rate. Missing settings are **not** filled in, so old packages keep their `quoteKey` |
| `salesPackages.js quotePackage` + new monthly quote | one price | the same function also quotes a monthly choice (cycle, length, files, updates). This is the **one** function used by the customize page, the request and the project creation |
| `helpers/projectInstallments.js` (+ the portal copy `frontend/src/helpers/projectInstallments.js`) | `buildInstallments`: 50/50 or 30/30/40 by progress | also builds one installment per billing cycle, each with a due date and marked as date-based; both copies give the same result |
| new shared helper `isInstallmentDue` | the due rule is repeated in 8 places and depends on an invoice existing, so a due installment without an invoice shows no Payment Pending (`getOrderDetails.js`, `getUserOrder.js`) and keeps uploads open | one rule used in all 8. It reads the installment itself: progress threshold for progress installments, due date for date-based ones. Due and unpaid means Payment Pending and uploads closed, with or without an invoice (decision 17). The invoice is still created when paid, as today |
| `helpers/projectNodeService.js` | any project may reach 100% | a monthly project cannot reach 100% before its end date |
| `helpers/projectPricing.js resolveProjectPricing` | package + reservation refused together; agreement without these settings | reservation allowed with its own package (reserved price); the agreement also freezes uploads Yes/No, the monthly choice, the end date and the upload limits |
| `helpers/projectUploadGate.js` | 5 refusals; payment due only when an unpaid invoice exists | also: uploads No; end date passed; a date-based installment is due and unpaid (no invoice needed); per-file limit used. The limit uses the counting rule of `serviceAllowance.js`, counted per billing cycle on the project; the cycle comes from the installment dates, so no reset job is needed |
| `controller/order/getOrderDetails.js` | sends `paymentAccess` | also sends the upload setting, the limit and the end date, so the portal button follows the server |
| `helpers/packageStart.js requestPackageStart` + model | snapshot = name + `discountedPrice` | snapshot also holds the choice and the quoted price (offer included) |

### Website (`E:/Allprojects/merasoftware`)

| File | Before | After |
| --- | --- | --- |
| `src/app/admin/packages/packages-manager.tsx`, `src/lib/sales-packages.ts`, `src/lib/offer-packages.ts` | no billing or upload settings | the new settings in section 1 (Package); an old package shows "Choose these options to turn on the customize page"; offer price checked against the monthly price or rate |
| `src/app/package/[id]/customize/page.tsx` (new) + a package builder component | — | the customize page, built like `components/plans/plan-builder.tsx`; prices from the backend quote only; Page SEO and sitemap |
| `src/components/campaign/public-interaction/page-content.tsx` | Start my project / Enquire | **Get this package →** for a package with the new settings; Reserve stays while an offer runs |
| `src/components/offer-reservations.tsx usePackageStart`, `src/app/api/package-starts/route.ts` | sends `packageId` | also sends the choice (still a pass-through) |

### Portal (`E:/Allprojects/frontend`)

| File | Before | After |
| --- | --- | --- |
| `components/admin/ReservedOffersPanel.js` | Close request | also **Create project**, which opens the form filled from the request |
| `pages/AdminClientWorkspace.js CreateProjectForClientForm` | no starting values; Category offer dropdown; reservation and package are exclusive | starting values (package, payment option, monthly choice); no Category offer dropdown; reservation together with its package; monthly installments preview |
| `pages/InstallmentPayment.js`, `components/PaymentAlert.js` | installment names and texts fixed for 30 / 30 / 40 | names from the installment itself: "Installment 2 of 2 (50%)", or "Cycle 3 of 4 · due 8 Feb 2027" for monthly |
| `pages/ProjectDetails.js` | own upload lock rule; 40% / 75% fallback for installments without a threshold | follows the upload setting, the limit, the end date and the due state from order details; the 40% / 75% fallback never applies to date-based installments |

## 7. Build in 3 phases

Each phase is a working checkpoint: everything built so far works and can be deployed on its own. Within a phase, build backend first, then website, then portal, and deploy in the same order.

### Phase 1: project rules and package settings (foundation)

- **Backend:**
  - `isInstallmentDue` used in every due check (§5 items 1, 11). Payment Pending and closed uploads when an installment is due and unpaid, with or without an invoice.
  - Package settings `billing` (`one_time` only in this phase), `portalUploads` and `paymentOptions`, without changing old packages' `quoteKey`.
  - The agreement freezes `portalUploads`; the upload gate refuses when it is No; order details send it.
  - A reservation is accepted together with its own package.
- **Website:** the three settings in the package form; old packages show the note.
- **Portal:**
  - the create form loses the Category offer dropdown and allows a reservation with its package;
  - the project page hides uploads when they are No;
  - installment names come from the installment itself.

**Checkpoint:** the admin creates package projects as before; the uploads setting and the due rule work everywhere.

#### Phase 1 result (8 Nov 2026: built, uncommitted, not deployed, awaiting review)

Backups of the originals, each with `manifest.sha256` and `HEAD.txt`:
- `E:\Allprojects\backup\backend\work63-package-phase1`
- `E:\Allprojects\backup\merasoftware\work90-package-phase1`
- `E:\Allprojects\backup\frontend\work65-package-phase1`

| Where | Before | After |
| --- | --- | --- |
| Backend `helpers/projectDuePayment.js` | only `getDueUnpaidInvoiceFilter`; a later installment with no threshold counted as due at once; a due installment counted only once its invoice existed | `isInstallmentDue` (own threshold; 40% / 75% for older installments without one), `dueInstallment` and `isProjectPaymentDue` (a due, unpaid installment counts with or without an invoice). The filter uses the same rule |
| Backend `helpers/projectUploadGate.js` | counted unpaid invoices only | refuses when the package was sold without uploads (`projectAllowsUploads`) and when `isProjectPaymentDue` is true |
| Backend `controller/order/getOrderDetails.js`, `getUserOrder.js` | Payment Pending only from an unpaid invoice | Payment Pending also for a due installment without an invoice; the order details send `portalUploads` |
| Backend `helpers/offerProjectInvoices.js`, `cron/offerPaymentReminderCron.js` | each had its own threshold check | use `dueInstallment` / `isInstallmentDue` |
| Backend `helpers/salesPackages.js` | no purchase settings | `validatePurchase`: `billing` (`one_time`), `portalUploads` and `paymentOptions` (`full`, `installments_2`, `installments_3`), all three or none, part of the quote key only when present. `savePackage` refuses a new published package without them, and refuses dropping them once chosen |
| Backend `helpers/projectPricing.js` | refused a reservation together with a package; the agreement had no purchase settings | a reservation is accepted with its own package (`offerSnapshot.packageId`) and is quoted with its frozen offer, even after the offer ended (its `offerQuoteKey` is the check); `salesAgreement.package` freezes `billing`, `portalUploads` and `paymentOptions` |
| Website `src/lib/sales-packages.ts`, `src/app/admin/packages/packages-manager.tsx` (+ `.module.css`) | no purchase settings | "How customers buy this package" in section 1: Billing, Portal uploads (Yes / No), Ways to pay. A new package starts One-time + Full payment, and Portal uploads must be chosen. An older package shows "Older settings" and may stay as it is. A draft holds only the settings it was saved with |
| Portal `src/pages/AdminClientWorkspace.js` | a Category offer dropdown; a reservation cleared the package | no Category offer dropdown (the package's running offer applies by itself); a reservation picks its own package; the price comes from the reservation |
| Portal `src/pages/ProjectDetails.js` | upload buttons always shown; own 40% / 75% pause rule | no upload button for a package without uploads (a note instead); the pause follows the server's `hasUnpaidInvoice` |
| Portal `src/helpers/projectInstallments.js`, `pages/InstallmentPayment.js`, `components/PaymentAlert.js` | names fixed as "Second Installment (30%)" and "from 50% to 90%" | `installmentName` / `installmentPurpose` from the installment itself, e.g. "Installment 2 of 2 (50%)" |

Checks run on 8 Nov 2026:
- **Backend:** new `tests/packagePhase1.test.js` 6/6 (includes the no-invoice repro). The full suite has 860 tests; the one package failure is fixed (the fixtures in `packageDrafts`, `packagePages`, `packageStart`, `projectCategories` and `projectCreateForm` now pick the purchase settings). `broadcast.test.js` fails only under parallel load; alone it passes 28/28.
- **Website:** package tests 17/17. `node tests/offers-components.mjs` PASS: the new section is checked, it refuses publishing without uploads chosen, and it saves `one_time` / `true` / `["full", "installments_2"]`. `tsc` and ESLint are clean in `src/`.
- **Portal:**
  - new `tests/project-installments.test.mjs` 2/2;
  - `project-detail-browser.cjs` 65/65;
  - `portal-workspace-ui.browser.cjs` PASS;
  - `upload-links-speed-browser.cjs` PASS;
  - ESLint clean.
  - `offer-reservations-browser.cjs` fails the same way on the original code, so it is not caused by this work.

Not done in Phase 1 (by design): no live data was touched, nothing was committed or deployed, and no browser click-through of the create form was made with a reservation. Deploy order: backend first, then website, then portal.

### Phase 2: customer flow for one-time packages

- **Backend:** the request takes the choice; its snapshot uses the quoted price, offer included.
- **Website:**
  - `/package/<id>/customize`, with Page SEO and sitemap;
  - **Get this package** on the package page;
  - the choice passed through `/api/package-starts`.
- **Portal:** the request list gets **Create project**, which opens the form filled from the request.

**Checkpoint:** a customer chooses a one-time package and sends the request, and the admin creates the project from it in one step. `PACKAGE_START_REQUESTS_ENABLED` is still off until the real-phone test.

**How to build it with what exists (verified 8 Nov 2026):**
- **The page pattern:** `src/app/plans/[plan]/page.tsx` + `src/components/plans/plan-builder.tsx` + `plans.module.css`.
  - Copy the structure: the `Step` and `InfoBubble` components, the right "Your plan" card (`QuoteBill`), the phone price bar (`mobileBar`), and the heading with Back.
  - The plan page decides the viewer (visitor, member or client) from `getSession()`.
  - Only packages with the purchase settings (`billing` present) get a customize page. Others return 404, and their package page keeps today's button.
- **Viewer behaviour differs from plans:** a package start request needs a signed-in person.
  - The existing hook `usePackageStart` (`src/components/offer-reservations.tsx`) already does that:
    - it loads the person's open request;
    - it sends one;
    - after sign-in it continues through the session key `pending-package-start`;
    - it asks an older account for a phone (HTTP 428).
  - Reuse it, and add the choice to what it stores and sends. A visitor is asked to sign in; there is no visitor form like plans have.
- **The package page button:** `src/app/package/[id]/page.tsx` passes `pkg.start` only when `PACKAGE_START_REQUESTS_ENABLED === "true"`. `page-content.tsx` picks the main button.
  - While an offer runs: Reserve, then Start my project (`lib/offer-reservation-rules.ts reserveCta`). This stays.
  - Without an offer: "Get this package →" links to the customize page.
- **Prices come only from the backend.**
  - Public packages already arrive with `quote.finalPrice` (`GET /api/integration/sales-packages`, `catalogueWithQuotes`).
  - The installment split (50 / 50 or 30 / 30 / 40, `helpers/projectInstallments.js buildInstallments`) has **no public route yet**. Add one pass-through, the same way plans do it: website `src/app/api/plans/route.ts` → backend `PATCH /api/integration/plan-catalogue/quote`. Do not work out amounts on the website.
- **The request:**
  - Backend `helpers/packageStart.js requestPackageStart` takes `{ userId, packageId, countryCode, phone }`, and route `routes/packageStarts.js` forwards only those. The website `src/app/api/package-starts/route.ts` also forwards only `packageId`, `countryCode` and `phone`.
  - Add the choice: payment option, checked against `item.paymentOptions`.
  - The snapshot (`packageSnapshot`, Mixed and immutable) should hold the choice and the price from `quotePackage(item, offers)`, so the offer is included. Today it saves `discountedPrice`.
- **Admin, one step:**
  - The request list is `components/admin/ReservedOffersPanel.js`. It is rendered inside `pages/AdminClientWorkspace.js` (`<ReservedOffersPanel customerId projects onChanged>`).
  - The create form `CreateProjectForClientForm({ clientName, customerId, onCancel, onCreated })` opens from `showCreateProjectForm` in the same page.
  - Add an `initial` prop: category, `packageId`, `paymentType` (`full` / `partial`) and `installmentCount` (2 / 3) from the request. Open it from a **Create project** button on the request.
  - Creating the project closes the request by itself (`packageStart.closeOnProject` inside `persistAdminProject`).
- **SEO:** the customize page is public, so it gets Page SEO, a sitemap entry and is indexable (owner rule). Follow `src/lib/page-seo.ts packagePath()` and `src/app/sitemap.ts`.

### Phase 3: monthly packages

- **Backend:**
  - `billing: monthly` with a fixed monthly price or a per-file rate;
  - the monthly quote;
  - cycle installments with due dates (backend and portal copy);
  - end date, the per-file upload limit per cycle, and no 100% before the end date.
- **Website:** the monthly settings in the package form; monthly choices on the customize page.
- **Portal:** monthly preview in the create form; the end date and the limit on the project page.

**Checkpoint:** a monthly package goes from the customize page to a running project that stops on an unpaid cycle and ends on its end date. Turn `PACKAGE_START_REQUESTS_ENABLED` on (Render and Vercel) only after a real-phone test and the owner's go-ahead.

**How to build it with what exists (verified 8 Nov 2026):**
- **Use the plan engine's tested rules as functions, not plans.** `backend/helpers/servicePlanPricing.js`:
  - `CYCLE_MONTHS` (monthly 1, quarterly 3, half_yearly 6, yearly 12);
  - `MAX_TENURE_MONTHS = 12`;
  - `cyclePriceFromMonthly(monthlyPrice, cycleMonths, discountPercent)`;
  - `updatePriceForFiles` (with no slabs it is files × rate);
  - `assertPricingConfig` (billing option and discount checks).

  `quoteServicePlan` shows the full quote shape: per month, cycle price, number of cycles, total. Call these from the package quote; do not copy the maths. The website builder helpers to mirror are `src/lib/public-plans.ts`: `purchaseChoices`, `lengthChoices`, `tenureLabel` and `PERIOD_WORDS`.
- **Package fields:**
  - `billing: "monthly"` (add it to `PACKAGE_BILLING` in `salesPackages.js` and to `PackageBilling` in `src/lib/sales-packages.ts`);
  - billing options with discount %;
  - the maximum length;
  - the pricing mode: fixed monthly, or per file with the files range and the updates-per-month range.

  `regularPrice` / `discountedPrice` and the offer price then mean a **monthly price** (fixed mode) or a **per-file rate** (per-file mode). `offer-packages.ts packageOfferProblem` (offer below the normal price) already fits; change only the wording.
- **Installments:**
  - Add a cycle builder next to `buildInstallments`, in the backend and its portal copy (`frontend/src/helpers/projectInstallments.js`), with the same output. One installment per cycle, last one absorbing the paise.
  - Each needs `percentage` (required by `installmentSchema` in `models/orderProductModel.js`) and `dueDate` (already in the schema), plus a new marker that it is date-based. `progressThreshold` stays null.
  - Then add the date branch to `projectDuePayment.js isInstallmentDue`: due when `dueDate <= now`. Nothing else changes in the 8 places (§5 item 1).
  - The first cycle is due at creation, like installment #1 today.
- **The project agreement** (`projectPricing.js`, `salesAgreement.package`) must freeze:
  - the monthly choice (cycle, length, files, updates);
  - the end date;
  - the upload limits.
- **The upload limit** goes in `projectUploadGate.js`:
  - count the uploads per cycle on the project, following `serviceAllowance.js uploadAllowanceNow` (counter, month-by-month release, carry forward inside the cycle);
  - take the cycle from the installment dates, so no reset job is needed;
  - also close uploads after the end date.

  Uploads come in through `uploadSubmission.js` and `uploadOrderPolicy.js`, which already call the gate. Count where they record an accepted upload.
- **No 100% before the end date:** `projectNodeService.js appendProjectNode` (it refuses at line ~102 when progress is already 100). Refuse a node reaching 100% while a monthly project's end date is in the future.
- **Portal:**
  - names for cycles (`installmentName` / `installmentPurpose` in `frontend/src/helpers/projectInstallments.js`, e.g. "Cycle 3 of 4 · due 8 Feb 2027");
  - the end date and the remaining uploads on `ProjectDetails.js`, sent by `getOrderDetails.js` the way `portalUploads` is sent;
  - the monthly preview in the create form.
- **No cron is needed** for a monthly package: every cycle's amount and due date are fixed at creation. Do not depend on `ENABLE_CRONS`.

#### Phases 2 and 3 result (9 Nov 2026: built, all checks pass, pushed; owner's review pending)

Backups of the originals, each with `manifest.sha256` and `HEAD.txt`:
- backend `E:\Allprojects\backup\backend\work64-package-phase2` and `work65-package-phase3`
- website `E:\Allprojects\backup\merasoftware\work91-package-phase2-3`
- portal `E:\Allprojects\backup\frontend\work66-package-phase2-3`

| Where | Before | After |
| --- | --- | --- |
| Backend `helpers/salesPackages.js` | `billing` was `one_time` only; one price per package | `billing: monthly` with `monthly` (`fixed` or `per_file`, billing cycles with discount %, longest length, files and updates ranges), checked by the plan rules (`assertPricingConfig`). A monthly package has no payment options and no offer extras price. `quoteChoice` / `quotePackageChoice` is the one choice quote: one-time = payment option + installments (`buildInstallments`); monthly = `quoteServicePlan` on a package-shaped plan, at the charged price and at the regular price |
| Backend `controller/order/salesPackagesController.js`, `routes/index.js` | no choice quote | `PATCH /api/integration/sales-packages/quote` (website, integration key) and `PATCH /api/admin/sales-packages/quote` (portal create form; with a reservation, at the offer it froze) |
| Backend `helpers/packageStart.js`, `routes/packageStarts.js`, `helpers/reservationClosure.js` | request took `packageId` only; snapshot price = `discountedPrice` | a package with purchase settings needs a `choice`; the snapshot stores `billing`, `choice` and the quote (price the customer saw, offer included). Lists show the choice. Older packages unchanged |
| Backend `helpers/projectInstallments.js`, `models/orderProductModel.js` | 50 / 50 and 30 / 30 / 40 only | `buildCycleInstallments`: one same-amount installment per cycle, `dueBy: 'date'`, `dueDate` = start + k × cycle months |
| Backend `helpers/projectDuePayment.js` | due by threshold, else the 40% / 75% rule | a `dueBy: 'date'` installment is due on its date, checked before the legacy rule |
| Backend `helpers/offerPaymentPolicy.js modeForCycle` | the "cycle 2 onwards is advance unless every-cycle" rule applied to plans only | it applies to monthly package projects too (cycle = `currentInstallment`) |
| Backend `helpers/projectPricing.js`, `controller/order/adminCreateProjectOrder.js` | no monthly path | `paymentType: 'monthly'` only for a monthly package (and only it); no extras or adjustment; the totals of all cycles stand in for the price (agreement, invoices, PDFs stay whole); `salesAgreement.package.monthly` freezes the choice, prices, `startsAt` and `endsAt`. `quotePackageForProject` is shared with the admin quote |
| Backend `helpers/projectUploadGate.js`, `uploadOrderPolicy.js`, `uploadSubmission.js`, `controller/user/externalUploadController.js` | no end date, no counting for projects | `projectUploadLimits`: the cycle comes from the term's start (not from installment 1, whose date an offer's due days may move); after `endsAt` uploads close; per file: files per update, and updates per month by the plan rule (`uploadAllowanceNow`, month by month, carry forward in the cycle), counted from this cycle's uploads that were not rejected, inside the upload transaction |
| Backend `helpers/projectNodeService.js syncActiveProjectProgress` | any project could reach 100% | a monthly package project reaches 100% only after `endsAt` |
| Backend `helpers/reservationRepricing.js` | could rebuild installments as 50 / 50 | never reprices a monthly package project (force-apply refused, expiry → needs review) |
| Backend `controller/order/getOrderDetails.js` | — | sends `packageTerm` (end date, cycle n of m, allowance, files per update) |
| Website `src/lib/sales-packages.ts`, `src/lib/package-choice.ts` (new) | — | monthly and choice types, `priceUnit`, `billingLabel`; choice lists, the address query and the request schema |
| Website `src/app/package/[id]/customize/page.tsx` (new), `src/components/packages/package-builder.tsx` (new), `src/app/api/package-quote/route.ts` (new) | — | the customize page in the plan page's layout (steps left, "Your package" right, phone price bar); prices only from the backend quote; signed in: Get this package sends the request; a visitor signs in and comes back to the same choice. 404 without purchase settings or while requests are off; while an offer runs it sends back to the package page |
| Website `page-content.tsx`, `src/app/package/[id]/page.tsx` | Start my project | **Get this package →** links to the customize page for a package with settings (requests on, no running offer) |
| Website `offer-reservations.tsx usePackageStart`, `src/app/api/package-starts/route.ts` | sent `packageId`; sign-in returned to `/package/<id>` | also send the choice; sign-in returns to the customize page with the choice in the address |
| Website `page-seo.ts`, `sitemap.ts`, `package-pages-server.ts` | — | customize pages have Page SEO and sitemap entries while requests are on |
| Website `packages-manager.tsx` (+ css) | one-time only | Billing: Monthly, with pricing kind, billing cycles + discount %, longest length, files and updates ranges; prices and offer price labelled per month / per file |
| Website `package-card.tsx` | "One-time" fixed | "Monthly" and "/ month" or "per file" for monthly packages |
| Website `reservation-panel.tsx`, `communication-hub.tsx`, `communication/page.tsx` | request list without choice | shows the choice and a **Create project ↗** link to the portal form |
| Portal `src/pages/AdminClientWorkspace.js` | no request, no monthly | "Customer's package request" dropdown fills package and choice; `?startRequest=<id>` opens the form filled; monthly: cycle, length, files, updates, the backend quote and the cycle list; paid per cycle |
| Portal `src/helpers/projectInstallments.js`, `src/helpers/packageChoice.js` (new), `ReservedOffersPanel.js`, `src/common/index.js` | — | `buildCycleInstallmentPreview` (same output as the backend, tested), "Cycle 2 of 4 · due 8 Feb 2027"; the request's choice in words |
| Portal `src/pages/ProjectDetails.js` | — | monthly term line (cycle, end date, updates left, files each); uploads locked when ended or used up |

Checks run on 9 Nov 2026:
- **Backend:** full suite 820/820, including the new `tests/packageChoice.test.js` (12 tests).
- **Website:** `tsc` clean; package tests 34/34; `offers-components.mjs` PASS; `package-cards.browser.mjs` PASS; new `tests/package-builder.browser.mjs` PASS (also no sideways scroll at 1440, 390 and 320 px). ESLint: one error in `src/components/campaign/trust-campaign.tsx`, a file this work did not touch.
- **Portal:** production build made; `project-installments.test.mjs` 3/3; `project-detail-browser.cjs` 65/65; `portal-workspace-ui.browser.cjs`, `reserved-offers-admin-browser.cjs`, `upload-links-speed-browser.cjs`, `upload-flow-browser.cjs` PASS; ESLint clean. `offer-reservations-browser.cjs` waits for "Loading your offers…" on the customer offers page, which this work did not touch; it failed the same way before Phase 1.

Not done: no live data touched; no browser click-through of the portal create form with a real request; no real-phone test. Known limit: an upload sent through the older non-staged path is counted without a transaction, so two uploads at the same moment could pass one over a per-file limit (the same precision as an offer's limited uploads).

## 8. Checks to run after the build

- Backend: `node --test --test-concurrency=3 tests/*.test.js` (the full suite, plus new tests for the quote, installments, the due helper, the upload gate and the request choice).
- Website: package tests in `tests/` and `node tests/offers-components.mjs`, extended for the customize page; no horizontal scroll at 1440, 390 and 320 px.
- Portal: browser check of the create form and the project page.
- Never test saves against the website `.env.local` database, which is production.

## 9. Later (separate tasks, not in this work)

- **Extend a monthly project** (recharge-style): same project, live price at the time of extending. New installments are added and the end date moves forward: from the old end date while active, or from today after expiry. Each extension is recorded in `projectPricingRevision` (new reason `extension`). The client pays through the existing installment payment page, and uploads stay closed until paid. This work keeps it possible: one quote → installments function, the end date on the project, and the agreement snapshot.
- **Self-checkout** when a payment gateway is connected: the customize page stays; only the button's action changes (plan checkout pattern).
- Offer payment reminders depend on `ENABLE_CRONS` on Render. Check it before relying on them.
- Reminders for a due installment that has no invoice yet (§5 item 14).
