# Start here: offer reservation/payment handover

Updated **25 October 2026, Asia/Kolkata**. This is the cross-repository entry point for the next agent. Read this first, then the current backend audit/rollout guide, then only the files relevant to the next task.

## Current truth

The reservation/payment implementation and final audited corrections are **complete locally and committed as reservation system part 4**. This handover's documentation changes remain in the working trees. **Deployment of the part 4 changes, production index migration, production flags and actual email/WhatsApp delivery have not been verified.** The owner previously reported deploying an earlier version; do not treat that as deployment evidence for the final fixes.

The next task is rollout/live verification when the owner provides that scope, not rebuilding reservations or starting the deferred reminder engine. Do not mark the whole system production-complete from the local tests alone.

| Repository | Local path | Baseline before final corrections | Current verified HEAD |
|---|---|---|---|
| Website / Next.js | `E:/Allprojects/merasoftware` | `2d1cf55` — part 3 | `9776de1` — part 4 |
| Backend / Express + Mongoose | `E:/Allprojects/backend` | `d169db6` — part 3 | `beab9f4` — part 4 |
| Portal / React | `E:/Allprojects/frontend` | `4c1ab35` — part 3 | `c0803ca` — part 4 |

Check `git status` and `git diff` in all three repos on resuming; the table records the last observed commits and may become historical. Part 4 commits are observed in Git, not created by this agent. No push, deployment or live migration was performed by the agent. Preserve existing working changes.

## Read order and authority

1. This handover: current state, decisions, ownership, evidence and next steps.
2. Backend [CODE_AUDIT.md](../../../backend/docs/CODE_AUDIT.md) and [QUICK_INDEX.md](../../../backend/docs/QUICK_INDEX.md): current source routing and validation. Their explicitly historical sections describe older phases.
3. Backend [RESERVATION_ROLLOUT.md](../../../backend/docs/RESERVATION_ROLLOUT.md): concrete migration, deployment and flag sequence.
4. [OFFER_RESERVATION_REMINDER_PLAN.md](OFFER_RESERVATION_REMINDER_PLAN.md): full owner decisions and historical planning. Its current-status section supersedes the old Step 0 “not started” table; unresolved wording in older design sections is not a new business decision.

Owner instructions in the conversation take priority over local skill guidelines. The user prefers short Hinglish updates, one business question at a time, evidence before conclusions, external backups before changes, and root corrections through existing SSOT helpers. Do not repeatedly ask for permission for already authorized local work.

## Product rules already decided

### Identity and onboarding

- Public signup creates a `member`, never automatically a `customer`.
- A member's successful reservation creates/reuses a lead linked by `lead.reservationUserId`. An existing customer does not become a new lead.
- Admin explicitly converts the same member account to customer; `_id`, reservation history and website account links stay intact. Do not relink by an editable lead email or create a duplicate account.
- Conversion uses the existing `clientAccount` password/reset policy. Login/signup/password-reset continuation must preserve the offer action or My Offers destination.
- Phone is required at signup/admin account creation, and at Reserve for an older phoneless member; no forced phone prompt at ordinary login. The backend owns supported country lengths; default is India +91 with 10 national digits. Stored format is one string such as `+919876543210`. Duplicate phones are not prohibited yet.
- `phoneVerified` / `phoneVerifiedAt` and `SIGNUP_PHONE_OTP_ENABLED` are provision only. Do not build or enable signup OTP in this scope.

### Reservation

- Public Reserve is available only during a live **project** offer's **reserve window**. Before 25 Oct 2026 this was a fixed **last 24 hours**. Now each offer sets it on the website: `reserveWindowHours`, 1–720, where missing or invalid means 24. The backend rechecks availability (`helpers/offerReservations.js` `reservationRefusal`, with a clear message per reason) and the accepted quote/terms version. The window is not part of the quote key. Details: [dynamic-offers.md](dynamic-offers.md) "Reserve on the offer card + reserve window".
- The offer card shows Reserve as its one main button and confirms it in a dialog, so the card never grows (website `src/lib/offer-reservation-rules.ts`, `useOfferReservation` in `src/components/offer-reservations.tsx`).
- Successful reservation starts **72 hours from its save time**. Public offer end, personal reservation deadline and invoice due date are different timestamps. Store UTC; display IST and use server time.
- Logged-out Reserve saves a short-lived browser intent → existing login/signup → same offer → authenticated POST automatically. Changed quote/terms require review. GET/redirect alone must not create a reservation.
- Website offer page, website `/account/offers` and portal `/my-offers` render the same backend record. Expired history stays grey; it is never deleted by a TTL.
- One reservation belongs to one project. A later offer period permits a new reservation only if the previous one expired unpaid and is unattached. Old history/timers stay intact.
- Admin-created offer project: reuse an applicable saved reservation without resetting time; otherwise create its reservation inside the successful project-creation transaction. Admin creation is not restricted to the public final-24-hour window.

### Money and expiry

- Keep existing payment qualification: the **first payable project invoice must be paid**—full project bill, or installment 1. Do not invent a separate deposit/minimum amount rule.
- Submission/recording time decides qualification, not later approval time. Combined payments qualify when the complete required amount had been submitted. An on-time pending submission holds the reserved price while it is reviewed; pending money is not received money.
- Once qualified, the reserved price stays locked. Later installment lateness does not reprice the remaining agreed scope.
- Without qualification at the deadline: the same offer's currently applicable extended/edited terms apply; otherwise use the project's **saved regular/base price**, preserving scope, extras and explicit signed adjustments. Do not use a different offer or current catalogue base price.
- Rejected payment before deadline leaves the reservation running; rejection after deadline allows normal repricing. Admin can extend for a genuine mistake before a price revision has happened.
- Repricing changes price, not the frozen access policy: advance/limited-upload/pay-later behavior continues, upload counters do not reset, and cancelled work is not reopened.
- Received money remains derived from existing completed payment/refund transactions. Statements (`project_final`, `service_statement`) are summaries, not extra debts.
- A revised total below money received produces **wallet credit for the whole-project surplus**, with no automatic external refund. Excess on the first installment alone is carried to subsequent invoices, not mistaken for whole-project surplus.
- Original receipt rows remain intact. Paired internal `allocation` payment/refund legs move receipt allocation between invoices without wallet movement. Net these legs; do not treat one leg as new cash income. Stable revision/receipt keys prevent double credits and double refunds.
- Service-plan repricing and legacy-project backfills are excluded.

### Admin overrides and communications

- Extend reservation: current admin only, future deadline, reason/history; retain original `expiresAt`, write `extendedUntil`. No maximum extension length was set. After a price revision use the force protocol instead.
- Force-apply: use that user's **saved reservation price/terms**, including expired lead-era history. Same saved categories only; one project; not on an already locked/settled first bill. No new 72 hours or automatic account conversion.
- Force protocol requires preview, reason and typed offer code. The final fix adds a 15-minute actor-bound, single-use token bound to price, payments, order and reservation state. Any state change requires a fresh preview.
- Confirmation and extension messages use existing Email Control and the existing email-first WhatsApp mirror. Messages state the exact IST deadline. Provider acceptance is not proof of handset delivery.
- Extension plus outbox event commit together. Delivery is outside retryable DB callbacks; leases, retries and dedupe survive failures/restarts. Superseded deadline notices are skipped.

## Completed code ownership

Paths below are relative to the indicated repository.

| Area | First files to open |
|---|---|
| Reservation state, lead link, deadline, qualification, extension | backend `helpers/offerReservations.js`, `models/offerReservationModel.js`, `routes/offerReservations.js` |
| Quote inputs / saved scope terms | backend `helpers/projectPricing.js`, `helpers/salesPackages.js`; website `src/lib/offer-quote.ts`, `src/app/api/offers/live/route.ts` |
| Admin creation commit and auto-reservation | backend `helpers/adminProjectCreation.js`, `controller/order/adminCreateProjectOrder.js` |
| Project financial transaction / deadline guard | backend `helpers/projectPaymentSettlement.js`, `helpers/reservationRepricing.js` (`withCurrentReservationPrice`, `guardReservationPayment`) |
| Money SSOT and invoice settlement | backend `helpers/orderPaymentTotals.js`, `helpers/paymentRecording.js`, `helpers/transactionService.js`, `helpers/projectFinalInvoice.js` |
| Expiry/force revisions, fair batch jobs | backend `helpers/reservationRepricing.js`, `models/projectPricingRevisionModel.js`; jobs registered in `index.js` |
| Receipt carry / wallet surplus / rejection attribution | backend `helpers/projectReceiptReallocation.js`, `helpers/projectPaymentSettlement.js`; `models/transactionModel.js` adds internal method `allocation` |
| Force preview token | backend `models/reservationActionPreviewModel.js`, `forceApplyPreview` / `forceApplyReservation` in `helpers/reservationRepricing.js` |
| Durable extension notices | backend `models/reservationNoticeModel.js`, `helpers/offerReservationConfirmation.js`, `helpers/emailController.js`, `helpers/emailDefinitions.js` |
| Lead conversion / refreshed member session | backend `controller/lead/convertLead.js`, `helpers/clientAccount.js`, `controller/user/userDetails.js` |
| Phone | backend `helpers/phoneNumber.js`, `controller/user/userSignUp.js`; website `src/components/phone-field.tsx`, `src/lib/phone-countries.ts`; portal `src/components/PhoneInput.js`, four Add* account modals |
| Website reserve / My Offers / proxy | website `src/components/offer-reservations.tsx` (`useOfferReservation`, `MyOffers`), `src/lib/offer-reservation-rules.ts` (window, phase, main button), `src/components/campaign/public-interaction/page-content.tsx` (card, dialog, sticky bar), `src/lib/offer-reservations.ts`, `src/app/api/offer-reservations/route.ts`, `src/app/account/offers/page.tsx`, `src/app/offer/[slug]/page.tsx` |
| Portal admin override UI | portal `src/components/admin/ReservedOffersPanel.js`, `src/pages/AdminClientWorkspace.js` |
| Portal My Offers and continuation | portal `src/pages/MyOffers.js`, `src/routes/publicRoutes.js`, `src/components/ProtectedRoute.js`, `src/pages/Login.js`, `src/pages/SetNewPassword.js`, `src/helpers/postLogin.js` |
| Preview-first migration | backend `scripts/migrateReservationIndexes.js` |

## What the final working fixed

The audit reproduced six gaps on part 3. They are now covered by corrections/regressions:

1. Deadline crossing between price precheck and wallet submission could settle an obsolete amount. Settlement now rechecks actual submission timing/state and aborts/reprepares before committing stale money.
2. Force preview stayed valid after a new payment. Tokens now bind the reviewed state and are consumed with the revision.
3. Expiry batches kept selecting the same rows. Lease/next-check scheduling gives later projects a turn while retaining future same-offer checks.
4. Nested offer terms changed but printable agreement terms stayed old. Base terms/current offer terms now stay consistent with the saved revision. Same-offer identity and saved package-extra input survive normal-price fallback.
5. Website showed only an old expired card in a new eligible period. Eligible repeat Reserve now appears while historical records stay.
6. Surplus stopped at `needs_review`. Wallet credit and installment receipt carry are now atomic, with rollback, paise, concurrency and combined-rejection coverage.

Additional completion: durable extension notices, explicit migration/rollout guide, updated indexes/audits. This is not completion of the deferred reminder engine.

## Reminder boundary: do not accidentally expand scope

The owner originally requested daily due/advance/stage reminders, offer-expiry warnings, payment/login links and manual start/stop rules. They later **deferred reminder implementation**.

Current provision only: `order.offerFirstWorkUpdate` stores version/run/node/actor/time once with the first real admin work-node save. The automatic zero-progress starting node and title corrections do not trigger reminders; reset/reopen must not reset the milestone. **This fact sends no reminder and starts no daily schedule.** Existing unrelated reminder features were not globally disabled. Any future engine must recheck current money/lifecycle/manual controls rather than replaying all old milestones as a catch-up burst.

## Exact validation evidence

Last verified local result: **175 main-suite tests plus 2 newly added targeted durability/migration tests = 177 distinct backend cases passed**. Four browser checks passed: two website tests, portal My Offers, portal admin reservation controls. Website TypeScript, targeted website/portal ESLint, syntax checks and `git diff --check` passed. Browser transport/auth/navigation use fixtures; this is not a live deployment end-to-end certificate.

From `E:/Allprojects/backend`:

```powershell
node --test --test-reporter=spec tests/offerReservations.test.js tests/reservationRepricing.test.js tests/adminProjectTransactions.test.js tests/paymentFoundation.test.js tests/offerPaymentPolicy.test.js tests/salesPricing.test.js tests/projectCreateForm.test.js tests/projectCategories.test.js tests/emailControl.test.js tests/sessionToken.test.js
```

From `E:/Allprojects/merasoftware`:

```powershell
node --test tests/offer-reservations.browser.mjs tests/server-time.browser.mjs
npx tsc --noEmit --incremental false
```

From `E:/Allprojects/frontend`:

```powershell
node tests/offer-reservations-browser.cjs
node tests/reserved-offers-admin-browser.cjs
```

Evidence: `E:/Allprojects/backup/backend/work14-reservation-final/validation.txt` (175) and `durability-validation.txt` (2). The original audit/probes at `E:/Allprojects/backup/reservation-audit-2026-10-25/` document **pre-fix defects**; their assertions deliberately reproduce the old behavior and are not the current acceptance suite. Do not run them and interpret an old-behavior assertion failure as a new regression.

## Safety and workspace constraints

- A new unspecified project defaults to `E:/Allprojects/merasoftware`, even when the chat cwd is elsewhere. Check paths before edits.
- Preserve the owner's running servers: website 3000, portal 3001, backend 8080. Do not stop/restart them for verification.
- Treat the source website `.env.local` as production-connected. Use the disposable replica-set/browser fixture commands above. Do not start backend `index.js` or arbitrary source-app servers against existing env files for tests: startup can enable real workers/crons.
- Keep network delivery mocked in regression tests. No real emails, WhatsApp sends, wallet changes or production reads/writes were used to obtain the recorded results.
- Backups live outside repos under `E:/Allprojects/backup/<repo>/workN-*`; preserve originals once per independent working. Do not overwrite backups while fixing that same working. Read relevant installed Next.js docs before Next changes.

## Remaining work: rollout and live confirmation

Follow [the rollout guide](../../../backend/docs/RESERVATION_ROLLOUT.md). Do not guess live flags/indexes from local defaults.

1. Review the matching part 4 commits and any later working changes, then deploy the three apps. Backend first enforces the new preview protocol; old portal force calls fail safely until the portal update.
2. In a controlled maintenance window, inspect/apply the prepared reservation index migration against the explicit target DB. Old unique `(userId, offerSlug)` can block repeat reservations until replaced by `(userId, offerSlug, periodEndsAt)`. The script only backfills missing reservation period timestamps from immutable snapshots; no legacy project repricing or silent duplicate repair.
3. Check flags independently: backend + website `OFFER_RESERVATIONS_ENABLED`; backend `OFFER_RESERVATION_CONFIRMATIONS_ENABLED`, `OFFER_RESERVATION_REPRICING_ENABLED`, `OFFER_RESERVATION_JOBS_ENABLED`. Defaults are off. Reservation jobs do not require global `ENABLE_CRONS`; enabling that global flag can start unrelated wallet-charging renewal/cleanup jobs. Keep signup OTP off.
4. Verify an approved test account's real reserve/lead/convert/history flow, phone format, deadlines, on-time pending approval, expiry/revision, extension, force preview and credit/receipt behavior. Inspect representative existing data before enabling price changes broadly.
5. Verify actual provider/channel delivery and recovery; inspect drafts/outbox/history/leases and index results. Record deployed revisions, actual settings checked and observed results. Do not claim WhatsApp handset delivery from email acceptance.

Live migration needs `RESERVATION_MIGRATION_URI` and `RESERVATION_MIGRATION_DB` explicitly. The script does not load `.env`; default invocation previews only; `--apply` is the explicit write mode. Do not use `syncIndexes` as a migration shortcut.

## Backup map

Application final-working originals: backend `work14-reservation-final`, portal `work10-reservation-final`, website `work20-reservation-final` under their external backup roots. These contain originals, not the final modified files; new files must be considered separately for rollback.

This docs-only handover has its own originals: backend `work15-reservation-handover-docs`, portal `work11-reservation-handover-docs`, website `work21-reservation-handover-docs`. Do not confuse a docs-only snapshot with the application rollback set.
