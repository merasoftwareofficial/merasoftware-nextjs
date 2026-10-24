# Offer reservations, payment revisions and reminders

Review date: 24 October 2026. Status: payment baseline committed ("reservation system part 1"); reservation part 2 (reserve API, lead link, My Offers, confirmation, admin auto-reserve, first-node provision) committed ("reservation system part 2 incomplete work"), not deployed, flag-gated off. Expiry repricing, reservation extension, force-apply and signup phone are not built. No production-data changes or deployments. Hand-over status and the verified remaining plan: see "Status and remaining plan — 24 Oct 2026 (Step 0)" at the end. Unresolved commercial decisions below are not authorization to choose or implement them silently.

## Confirmed owner requirements

- Upgrade the existing offer-selection/pricing system as the single source of truth. Packages remain optional showcase/project-creation references; projects without a package must work.
- Logged-in customers can reserve an offer during its final 24 hours. A successful reservation holds the offer for 72 hours from its save time, independently of public expiry.
- A logged-out Reserve click goes through login/signup, returns to that offer and automatically finishes the intended reservation. Changed price/terms or expired eligibility requires a clear updated result rather than silently accepting changed terms.
- Reservation immediately generates a confirmation event for email and WhatsApp, including the exact deadline and purchase instruction.
- My Offers retains expired reservations as grey Expired cards, rather than removing them.
- Owner clarification: existing users see the same reservation and remaining time in portal My Offers and on the website. A new signup who reserves becomes a linked lead; the team approaches them and an admin explicitly converts them to client. Project creation/reservation alone must not silently grant the customer role. Preserve reservation ownership/history across that conversion.
- Owner requires an admin-only force-apply operation for an offer that this user previously reserved, including expired reservations made as a lead or client. It must require an explicit protocol to prevent accidental application; normal reservation/pricing behavior otherwise stays the same. Owner accepted the recommendation to use the price/terms saved at reservation for force-apply.
- Owner explicitly selected: required first payment received locks the offer price. Later installment lateness does not reprice the remaining agreed scope. The precise qualifying amount/deadline still needs definition.
- Owner explicitly selected normal-price fallback: the saved regular/base price for the same agreed project scope, rather than current catalogue price. Preserve saved extras/adjustments when deriving that fallback.
- On an applicable unpaid reservation expiry, the linked project is repriced using the same offer's current applicable terms if extended, otherwise the defined normal price. Once qualifying first payment has locked the agreed price, automatic expiry repricing is excluded; treatment before that qualification still needs exact amount/deadline rules.
- Support daily payment reminders, advance-payment reminders, stage-triggered pay-later reminders, offer-expiry warnings, payment/login links, manual start/stop and payment-driven stop.
- Latest owner addition: when admin creates a user's project with an offer and no applicable reservation exists, start that offer reservation at successful project creation. Reuse an existing applicable reservation without resetting its original timer/history. For this direct-project flow, the first actual admin node/work update is the future reminder trigger. Reminder implementation/sending is deferred; this phase only provides the event/provision for later integration.
- Node progress updates need communication integration. Existing current-payment, limited-upload and pay-later behaviors must be explicitly represented.
- Ask business questions one at a time. Owner authorized implementation; this turn's requested activity is remaining-plan verification. Deployment/live migration has not been requested.

## Evidence and limits

Repositories: website `E:/Allprojects/merasoftware`, backend `E:/Allprojects/backend`, portal `E:/Allprojects/frontend`.

Source review verified:

| Concern | Evidence | Consequence |
|---|---|---|
| Offer owner | website `src/lib/offers.ts`, `src/app/api/offers/live/route.ts`; backend `helpers/websiteOffers.js` | Keep offer definitions on the website; integration returns current catalogue and quote hashes. |
| Pricing | backend `helpers/salesPackages.js`, `helpers/projectPricing.js` | Reuse the existing benefit calculator. No-offer package pricing currently uses discountedPrice, not necessarily regularPrice. |
| Snapshot | backend `models/orderProductModel.js` | Agreement snapshot exists; paymentPolicy is immutable. Mutable operational revisions need an explicit model, not incidental overwrites. |
| Payment settlement | backend `controller/user/transactionApprovalController.js`, `controller/user/walletPayInstant.js`, `helpers/paymentRecording.js` | Initial paid-state defects were reproduced and corrected in the local baseline change set; see implementation progress. Transactional consistency remains pending. |
| Atomicity | same approval/wallet paths | Approval saves transaction, invoice and order separately. Its catch restores transaction/wallet but does not roll back all already-written invoice/order data. Introduce transactional boundaries before adding concurrent repricing. |
| Due obligations | backend `helpers/projectDuePayment.js`, `helpers/projectInstallments.js`, `helpers/offerProjectInvoices.js` | Current installment/progress thresholds matter. Baseline corrections now include partially_paid and restrict the filter to project payment bills; future installments/final statements remain excluded as applicable. |
| Access | backend `helpers/offerPaymentPolicy.js`, `helpers/projectUploadGate.js`, `helpers/uploadSubmission.js` | Pay-later currently permits uploads even overdue. Upload commit touches the order in a transaction; policy changes must participate in the same concurrency boundary and preserve counters. |
| Service cycles | backend `helpers/serviceCycleSettlement.js`, `helpers/orderPaymentTotals.js` | Service-cycle payment totals have different semantics from project totals. Do not route them through project accounting. |
| Documents | backend `helpers/projectFinalInvoice.js`, `helpers/generateInvoiceDocumentPdf.js` | Current PDFs read the order agreement. Pricing revisions require document-version consistency. Final statement is a summary, not a second debt. |
| Events | backend `controller/order/projectNodeController.js`, `helpers/emailController.js` | Node writes do not enqueue client notifications; background email currently allows only the named scheduled offer-reminder event. |
| Delivery | backend `helpers/whatsappQueue.js`, `whatsapp/src/sender.js` | WhatsApp is queued after accepted email; worker sends stored text without invoice-state validation. |
| Auth | website `src/app/login/login-form.tsx`, `src/lib/portal.ts`; portal `src/helpers/postLogin.js`, `src/components/ProtectedRoute.js` | Website already supports safe next targets. Portal home/reset navigation needs continuation support. Website signup does not collect phone. |
| Onboarding role | backend `controller/user/userSignUp.js`; portal `src/routes/customerRoutes.js` | Public signup creates member, while customer screens require customer. Reservation-to-portal access must not depend on an unstated role grant. |
| Lead conversion | backend `models/leadModel.js`, `controller/lead/convertLead.js`, `helpers/clientAccount.js` | Existing explicit admin conversion upgrades a member in place; phone is required and password is reset. The lead currently has no pre-conversion authenticated member link; convertedToUserId/guestUserId have different meanings. |

Initial isolated run was blocked by the statement index conflict. After the baseline corrections, 83 isolated tests passed across paymentFoundation, offerPaymentPolicy, salesPricing, projectCreateForm and emailControl. This includes the previously blocked policy suite. This turn changed the plan only and did not rerun application tests. Production settings/delivery and future feature behavior have not been verified.

## Design boundaries and invariants

1. Website owns offer configuration. Backend owns reservations, project pricing revisions, payment obligations, settlement and reminder schedules. Portal/website screens render these results.
2. Reservation is a commercial entitlement/history record, not a payment or automatic proof of a project purchase.
3. Offer public end, reservation benefit deadline and invoice due date remain separate named timestamps. Store UTC, display IST; server time decides boundaries. At the deadline the prior validity has ended.
4. Received money comes from existing completed transaction/refund accounting. Pending submissions and wallet deposits do not become project money. No blind paidAmount increments.
5. Installment paid means its own obligation is settled; project paymentComplete means all applicable project debt is settled. Approval/work activation may have separate rules.
6. Future installments, project_final and service_statement never generate extra payment requests.
7. Pricing changes preserve received-money allocations, original scope/extras and agreed admin adjustments unless a distinct authorized scope change exists. All arithmetic reconciles in integer paise.
8. Cancelled/deleted projects cannot be reactivated by reservation expiry, payment callbacks, repricing or reminders. Completed work status does not by itself prove zero outstanding debt.
9. Reminder pause affects messages only. Due-date extension, reservation extension and work/access changes are separate audited actions.
10. Offer extension/repricing never resets upload usage or resurrects an expired reservation's old history. Price changes and access-policy changes are explicit separate transitions.
11. All changes to money/access must validate ownership, current revision and lifecycle on the server. UI visibility is not authorization.
12. External offer-service failures are unavailable results, never evidence that no offer exists. Do not increase price from an outage.

## Proposed shared backend structure

Extend existing helpers rather than adding a second price/payment engine:

- Pricing resolver: existing benefit calculation plus a reservation-entitlement context and expected offer revision. A valid reserved entitlement can survive public expiry; ordinary new-purchase eligibility cannot.
- Pricing revision: immutable before/after commercial history with one active revision reference on the project. Current summary fields remain projections maintained by the shared operation, not competing writers. Historical PDFs reference their own revision.
- Reservation: customer, stable offer identity, accepted quote/version and project context, reservedAt, benefitDeadline, qualification rule, linked project, state and audit events. Package optional. One active reservation per approved commercial context; repeat calls reuse it and never reset its clock.
- Payment due resolver: determines the applicable invoice/installment, settled amount, outstanding, due anchor/date, pending verification and effective access. Existing project/service settlement helpers retain their accounting responsibilities.
- Reminder schedule: references the existing obligation rather than copying its balance; stores rule version, start trigger, next occurrence, manual state and terminal reason.
- Durable communication event: references business event/revision/recipient; channel attempts tracked separately while reusing the existing templates, admin policy and WhatsApp worker. Independent channel dispatch is a proposed change to the current email-first rule, not an already-approved owner rule.

Current phase should implement project reservations/repricing first. Existing service and legacy monthly-plan behavior remains covered by regression tests. Central reminders may later use type-specific adapters; applying project repricing to services requires separate commercial approval.

Scope amendment: central reminder scheduling, daily dispatch, warning sending and manual reminder UI are future work, not current implementation. Current work may preserve a versioned first-node trigger/activation fact and the identifiers/timestamps needed to connect a future engine. Do not enqueue or send a new reminder from that provision. Reservation confirmation and the existing project-created communications are distinct from deferred reminders. Existing reminder features are not globally switched off by this scope change.

## Operations and concurrency

### Reserve after login

Save a short-lived browser-bound intent with offer/context and displayed quote version. Use the existing allowed return-target validation. Preserve intent through signup and any password-reset step; bind the successful reservation to the authenticated active non-guest account. A GET/redirect alone must not mutate reservations: the return page executes an authenticated idempotent POST with origin/CSRF protection.

Backend validates final-24-hour window, current availability, terms, customer and existing reservation. Changed terms require confirmation. Save reservation and confirmation event together, then dispatch asynchronously. Do not reset the 72-hour clock on retry. Define re-reservation eligibility across offer extensions before implementing its uniqueness rule.

Missing phone needs a client-friendly completion step or explicit email-only result; do not claim WhatsApp was sent. A usable phone does not prove a delivery succeeded.

Public signup currently grants member only. Provide a narrow authenticated My Offers surface for reservation owners before client conversion; being a lead does not grant general customer portal privileges. The team handles new reservation leads and admin explicitly converts the same account to client/customer. Preserve the same account ID, validate ownership on every reservation/invoice request, and refresh session/active-role state after admin conversion. A successful reservation must always have an accessible destination. Website and portal display the same backend reservation/status/deadline.

Reuse convertLeadController/upgradeMemberToClient rather than writing a second conversion engine. Link the reservation to authenticated account ID from the start, and add an explicit lead-to-member link for pre-conversion identity; do not misuse convertedToUserId (Won/client conversion) or guestUserId (temporary guest). Reservation retries and additional reservations attach to the appropriate existing linked lead without creating duplicate leads or reverting the team's Contacted/Proposal Sent/Negative state. Existing clients do not become new leads merely by reserving. Do not attach unrelated manually entered leads by editable email alone; reconcile identity explicitly. Conversion must verify its result is the reservation owner's existing account even if the lead's contact email was edited.

Current member conversion requires phone and resets password. Ensure contact completion is available to the team, keep reservation identity/history during conversion, preserve intended destination through required password reset, and refresh roles/session before showing customer-only screens. Do not silently alter the existing conversion/password policy in reservation code.

### Activate payment due — future integration design

Creation, first qualifying stage transition or manual action calls the same activation command. Persist the original due anchor once. A later title edit, hidden node update, reset or reopen does not restart it. Explicit rescheduling records actor, reason, old/new date and schedule revision. Decide how benefitDeadline relates to stage-based payment deadlines before activating this branch.

This is future due-rule design. The current first-node reminder provision records an event only; it must not change existing invoice due dates, create extra invoices or activate a reminder engine.

All paths that create a due invoice (creation, node activation, scheduler, admin recording and on-demand installment settlement) must use one shared find-or-create command and database-enforced obligation identity. A pre-insert existence check alone is insufficient under concurrency. Multiple historical invoice revisions must still represent one payable obligation and one reminder schedule. Inspect existing duplicate data before adding indexes; do not silently merge/delete financial rows.

### Project-created reservation and first-node provision

Two entry paths now converge on the same reservation operation/model: customer self-reservation, and admin project creation with an offer. Self-reservation retains its public final-24-hour eligibility. Admin project creation uses the existing valid offer-selection rules; it is not restricted to that public reservation-button window. An expired historical offer still requires the separate force-apply protocol.

For an admin-created offer project, attach an applicable existing reservation when present. Otherwise save a reservation with origin admin_project and the project/account/offer snapshot, with its start at successful creation and the configured reservation duration (currently 72 hours). Keep it consistent with project creation completion/idempotency; a failed or incomplete create cannot leave a falsely active reservation or send a success confirmation. Retries reuse the original record/time. Qualification payment recorded during creation confirms/locks the entitlement under the approved first-payment rule rather than leaving a paid project eligible for automatic expiry repricing.

Reserve-at-creation and first-node reminder activation are different events. Project creation starts the reservation clock; the first actual admin work/node update records the future reminder trigger without restarting that clock or silently changing the invoice due date. The automatically initialized zero-progress starting node does not activate a reminder. Persist the first trigger's node/run/event identity and timestamp once, with a future-only versioned activation fact; duplicate requests, node title corrections, delete/restore/reset/reopen cannot repeatedly activate it. Precise eligibility/stop behavior belongs to the future reminder engine.

Commit the first-node provision with the successful node/project write (or a recoverable durable event), never before validation or merely on button click. The existing create/edit node paths and automatic initialization all need explicit differentiation. Concurrent node requests cannot create two first-trigger records. A failed node save records no trigger. Confirmation events for project-created reservations reference the same committed business operation so retries do not send duplicate project/reservation confirmations.

For now the trigger fact sends no reminder and creates no daily schedule. The later engine must recheck outstanding money, price lock, current eligibility and manual controls rather than blindly replaying every historical provision as a catch-up burst. If first work happens after reservation expiry, the ordinary expiry/force-apply rules still apply; the first node must not revive the expired benefit.

### Expire/reprice

Scheduled reconciliation finds due reservations and projects with an explicitly enabled benefit deadline. Newly admin-created offer projects now receive/link a reservation at creation under the owner rule above; legacy direct offer projects are not silently backfilled. Reuse the same reconciliation operation at payment preparation when scheduling is delayed; do not mutate billing from arbitrary GETs. Validate lifecycle, qualifying payment and pending verification before deciding expiry.

Read the same offer's current version through the existing integration. Determine eligibility from current published status, target/category and explicitly agreed same-offer linking rules. Preserve the old project's scope, extra items and manual adjustments. Do not accidentally choose another package offer merely because package.offerSlug changed.

Fetch external configuration outside the Mongo transaction, with an explicit source version and decision time. Save that source version; a concurrent later catalogue edit applies to a later revision. Never claim a distributed atomic transaction across website and backend databases.

In a short database transaction, compare expected project/reservation revision; recheck payment state; write pricing revision, affected unpaid obligation revisions, order projections, final summary, reservation event and communication event. Competing settlement/repricing operations conflict and reread. An approved offer-policy transition must touch the same order concurrency boundary used by upload commits.

Do not rewrite settled invoices/allocations. Preserve original issued document data and record a superseding unpaid revision or adjustment with a stable payment target. A revised total below money already received requires a defined credit/refund outcome; do not erase receipts or auto-refund silently.

When the same offer is extended again after the first expiry reconciliation, re-evaluate eligible unresolved projects on offer-change reconciliation and before payment, not only on the original expiry instant. One source version must not repeatedly generate price revisions/messages. An extension does not implicitly grant another personal 72 hours.

### Settle payment

All project payment entry points (wallet, UPI approval, admin recording, installment and combined payment/rejection) must use shared session-aware settlement. Verify invoice belongs to the same customer/order, is a payable type, and matches the payment attempt's pricing revision. Do not trust customer-supplied amount/IDs or pending flag alone to hold a reservation.

Make wallet ledger, transaction state, invoice balance, installment state, order totals, statement and outgoing event commit consistently. Rejection/rollback must undo exactly the affected allocation, preserve other received funds and not reactivate cancelled work.

Pending verification must have amount sufficiency, submission deadline and bounded/admin-reviewed resolution rules. The owner must decide these. Already-submitted external funds cannot be made to disappear because a quote later changed.

### Admin force-apply from reservation history

Owner-approved capability: a current portal admin may force-apply a user's previously reserved offer even if that reservation expired or was created while the account was a lead. Lead/client conversion does not delete or recreate the reservation. This is a distinct audited override command; ordinary eligibility checks and automatic expiry behavior remain in place for normal purchases.

Owner-approved commercial source: the immutable price/terms saved at reservation, not the currently edited offer. Capture enough normalized data at reserve time to reconstruct that quote through the existing calculator: offer identity/source version, pricing rule/benefit, base price, applicable context/scope, resolved terms, original payment policy, and any package-specific price inputs. A hash or offer slug alone is insufficient. Historical force-apply must not require the current offer to remain published or present; validate the saved snapshot instead of silently fetching replacement wording/prices. Separate original public expiry text from the explicitly overridden eligibility/deadline in the preview and resulting agreement, so a forced offer does not carry contradictory validity wording.

Proposed protocol: open that user's actual reservation history, select the target project and reserved offer, show before/after commercial and payment/access impact, require a reason, and explicitly confirm the named client/project/offer. Server verifies current portal-admin role, ownership, historical reservation existence, expected project/payment revisions and single-use operation identity. A stale preview requires refresh. The normal offer-selection field must not silently enable force mode.

Apply through the same pricing revision/settlement boundaries, not direct total edits. Preserve receipts, paid-invoice history and upload counters; cancel obsolete queued reminders after a committed revision. Do not mark the expired historical reservation as never expired, restart 72 hours, convert a lead, reopen cancelled work or send a payment automatically merely because force-apply was clicked. Any requested change to validity, access policy or the locked paid agreement needs an explicit supported transition and preview. Behavior on already-qualified price-locked projects, reuse across multiple projects and cross-scope applicability still require a rule before enabling those cases. Neither historical snapshot selection nor force mode grants arbitrary customer role/account access.

### Send reminders — deferred design only

Use bounded batches, per-item error isolation, leases and retry/backoff. Enforce one normal daily occurrence per obligation/recipient/IST day, independent of rule or pricing revision; retries target the same channel attempt. Store content/rule revisions as metadata, not as a way to bypass that daily uniqueness. Editing a rule, repricing, or pause/resume cannot send a second daily reminder. Replace/cancel an unsent obsolete version; after a daily reminder was sent, only an explicitly distinct business event can create another message. Confirmation/progress/expiry are separate event types. Avoid simultaneous milestone and daily duplicate warnings for one obligation.

Before dispatch, reread current paid/verification/lifecycle/manual state and expected price/schedule revision. Cancel obsolete queued attempts; generate current content as a new version where needed. Recheck in WhatsApp dispatch too, since quiet hours/daily limits can delay it past settlement.

An already in-flight external send can race payment; record this limit honestly. Provider idempotency and durable attempt IDs reduce duplicates, but universal exactly-once delivery cannot be promised. Delivery acceptance and actual customer receipt are separate statuses.

Retain existing per-action Off/review controls. Explicitly register new automatic events rather than globally relaxing the background-mail restriction. Node events carry client visibility and meaningful change identity; repeated edits must not create a storm of messages.

## Regression acceptance matrix

| Scenario | Required result |
|---|---|
| Full and partial UPI/wallet/admin payment | Same balance/paid-state for the same received money; partial amount cannot complete installment/project. |
| Wallet + UPI; UPI rejected | Received and reversed allocations reconcile exactly; no double debit or disappearing remaining debt. |
| Failure after each settlement write | All committed financial records remain consistent; retry does not double-count. |
| Payment and expiry at once | One consistent winning revision; received funds and customer obligation reconcile. |
| Pending submission then price lower/higher | Explicit pending-verification rule; no unexplained approval failure or false paid state. |
| Already-paid installment, total changes | Preserve paid history and distribute revised unpaid balance in paise. |
| New total below received | Recorded credit/refund decision; no loss of actual payment history. |
| Expired/cancelled/free/legacy project | No unintended repricing, debt, reactivation or reminder. |
| Offer extension, same/changed price, later extension | Applicable source revision used once; expired reservation history retained; personal clock not silently reset. |
| Catalogue outage or package relinking | No fallback price increase from outage; no accidental unrelated offer/scope replacement. |
| 24-hour/72-hour boundaries, login crosses expiry | Server-time eligibility; correct customer-facing result; no stale auto-reservation. |
| Login/signup/reset/repeated callback/account switch | Intent bound correctly; one reservation and one confirmation event. |
| New member reservation then portal access | Own reservation visible without accidental privilege grant; approved customer conversion keeps same identity and safe return. |
| Scheduler/node/payment creates same due invoice concurrently | One payable obligation; no duplicate invoice or reminder despite separate entry points. |
| Stage edit/delete/reset/reopen | Due anchor not repeatedly reset; future installments not demanded. |
| Concurrent last allowed upload and policy expiry | Agreed allowance enforced without extra use/reset or false rejection from mixed revisions. |
| Service cycles/old monthly renewals | Cycle dates, used allowance, accounting, pause/resume and final-cycle behavior preserved. |
| Paid while WhatsApp pending/quiet hours | Obsolete pending reminder skipped; unrelated messages continue. |
| Worker crash/duplicate job/provider timeout | Durable attempt history, controlled retry and no automatic replay of ambiguous accepted messages. |
| Admin pause/Off/extension | Correctly scoped effect; deadlines unchanged unless explicitly extended. |
| Rule edit/repricing/pause-resume after today's reminder | No second normal daily reminder; distinct price-change event is identified separately. |
| Force-apply expired lead-era/client-era reservation | Only current portal admin can apply that user's real reserved offer; same pricing pipeline, exact preview/reason/audit, no account/history duplication. |
| Force preview races payment or is replayed | Stale revision refused; one override revision; no erased receipt, duplicate message or implicit deadline reset. |
| Reserved offer edited/archived/deleted before force-apply | Saved price/terms used without depending on current catalogue; original expiry and admin override are separately represented. |
| Existing member converts after reservation | Same user ID and reservation history; password-reset/role refresh returns to the right surface. |
| Reservation retry/multiple offers/existing lead | No duplicate lead, pipeline-state reset or conversion to the wrong edited-email account. |
| Admin creates offer project with no reservation | One same-model reservation at successful creation; original quote and 72-hour deadline visible on website/My Offers; no dependency on public final-24-hour button window. |
| Admin creation retry/failure/existing reservation/upfront payment | No duplicate/reset/false success; existing reservation retained; qualifying paid project locks price. |
| First actual node update versus automatic initial node | Initial node does not trigger; first work update records one future activation fact and sends no new reminder in this phase. |
| Node reset/edit or future engine enabled after long delay | No repeat activation, reservation clock reset, expired benefit revival or blind historical reminder burst. |
| Invoice page/PDF/summary/My Offers | Same active pricing revision; historical documents stable; no statement charged twice. |

## Delivery phases and gates

1. Baseline: reproduce and correct index-name conflict with an explicit existing-index migration plan. Reproduce settlement flag/rollback issues with isolated fixtures; fix the shared paths. Gate: existing suites and payment invariants pass.
2. Resolve commercial decisions below. Gate: no ambiguous financial/default transition remains in the enabled scope.
3. Backend foundation: versioned project commercial state, session-aware due/settlement/access transitions and stable payment target. Gate: concurrency/fault-injection tests pass.
4. Reservation/auth/My Offers and durable confirmation. Gate: return-flow, identity, expiry-boundary and duplicate tests pass; project creation/link flow chosen.
5. Repricing and offer-change reconciliation. Gate: all price/payment/document cases pass; run read-only impact preview against an explicitly authorized dataset before enabling historical conversion.
6. Current provision only: record the first qualifying admin node-update identity/time for later reminder integration. Gate: no reminder send/schedule is introduced, and retries/reset do not duplicate activation. Central reminder engine, daily dispatch, warnings and manual reminder controls are deferred to a later separately enabled phase; their acceptance matrix remains future design.
7. Controlled rollout: backend-compatible additive changes first, then UI; separate activation switches for reservations, repricing and reservation confirmations. New reminder dispatch remains unimplemented/disabled in this scope. Monitor reconciliation errors, creation failures and confirmation delivery. Future reminder activation has its own later rollout.

Use disposable replica-set MongoDB with mocked offer/email/WhatsApp boundaries. Never run verification against the website local env database or send real customer messages. Keep unrelated working-tree edits intact. Back up changed implementation files before the implementation phase under the existing external numbered backup convention.

Rollback disables new starts/repricing/dispatch and preserves already committed financial revisions and receipts. Do not roll back by restoring old totals over new payments. Existing deployed code must understand persisted versions before a feature is enabled; rollback code must remain version-compatible.

## Decisions still required (ask one at a time)

Owner answers on 24 Oct 2026 (Step 0 session) resolve #1, #2, #5, #6, #7 and #8; they are recorded in "Owner decisions — 24 Oct 2026" at the end and override the open wording below.

1. Required first payment: full invoice, first installment or booking amount? Price-lock behavior is now approved: the required first payment received locks the agreed scope price; later overdue installments do not reprice it. The qualifying amount still needs definition.
2. Benefit deadline versus stage/manual invoice due date: is a separate qualification payment due within 72 hours, or does the first-stage rule extend benefit validity? Do not impose both contradictory promises.
3. Lead path resolved: reservation creates/links the lead; the team approaches the user and admin converts to client. Do not auto-convert merely to expose payment. Admin project creation links/starts the reservation as specified. Any later self-service purchase/checkout needs a separate approved route; reservation confirmation must point to My Offers/team next steps rather than a nonexistent Pay Now target.
4. Normal-price source resolved: saved regular/base price for the same agreed scope, with saved extras/adjustments. Persist this explicit fallback, including for package quotes whose current no-offer calculator otherwise uses discountedPrice; do not use a later catalogue price.
5. Verification grace: sufficient submitted amount, evidence, deadline, admin response limit and rejection outcome.
6. Expiry access: pause work/uploads, retain pay-later access or require admin decision; preserve spent allowance.
7. Repeated offer extensions/reservations: which published revision permits another reservation, and which linked eligibility rules govern repricing?
8. Contact/delivery: collect missing phone, and approve or retain current email-first WhatsApp dependency.
9. Deferred reminder-phase decisions: daily time, start/end rules and escalation wording. These do not need to be invented for the current event-only provision. Reservation confirmations still require an exact absolute deadline rather than misleading fresh '72 hours left' text after delayed delivery.
10. Existing-project rollout and service-plan expansion scope; no retroactive migration inferred from this plan.
11. Onboarding rule resolved: new signup remains member, reservation creates a linked lead, and admin explicitly converts that same account to client. Implement narrow own-reservation access before conversion and refresh role/session state afterwards.
12. Direct-project reservation rule resolved by the latest owner instruction: admin creates a project with an offer -> reuse an applicable existing reservation or start one at successful creation. First actual admin node update is the future reminder trigger; only provision is in current scope. No automatic migration or extra timer reset for legacy/existing reservations.
13. Force-apply source resolved: saved reservation price/terms. Still define applicability after qualifying first payment locks a price, reuse across multiple projects and cross-scope eligibility. Do not treat ordinary automatic application of a current extended offer as this historical admin override.

## Final review amendments

Final source cross-check on 24 October 2026 added onboarding-role continuity, a shared due-invoice identity across all creation paths, a revision-independent daily reminder cap, and an explicit decision for directly created offer projects. The previous plan keyed daily occurrence by rule revision; that could send twice after a same-day settings edit and is corrected above.

The initial review copy is retained at `E:/Allprojects/backup/merasoftware/work5-offer-plan-final-review/OFFER_RESERVATION_REMINDER_PLAN.md`. The later baseline change set resolved the index setup blocker and passed 83 tests as recorded below. The latest verification changed this document only; its prior version is backed up at `E:/Allprojects/backup/merasoftware/work8-reserved-offer-plan-verification/`.

## Next concrete step

Superseded on 24 Oct 2026: the current next step is in "Status and remaining plan — 24 Oct 2026 (Step 0)" at the end. Original text kept for history:

Baseline corrections, routed project UPI/wallet transactions and admin creation/manual-approval transactions below are complete locally. Next work is reservation ownership/snapshots/lead linkage and integration; customer self-creation and revision orchestration must also be accounted for before repricing. Resolve qualifying-payment and pending-verification rules before dependent pricing behavior. Reservation/repricing/reminder provision has not yet been built or production-verified.

## Implementation progress — baseline payment state

- Reproduced index creation conflict, partial UPI marking installments paid, full-project partial payments marking paymentComplete, and partially-paid invoices bypassing the project upload gate using real controllers and disposable replica-set MongoDB.
- Preserve the existing project-final index; give service statements a distinct key order/name with the same uniqueness semantics. Verify both statement types coexist and duplicate statements of each type are rejected.
- UPI installment flags now follow the shared settled invoice's status; partial payments do not advance installment or newly approve work. Project completion follows outstanding balance. Wallet order-mode partial payments also no longer mark completion/approval prematurely.
- Due-project filtering includes partially_paid and explicitly excludes summary/service invoice types.
- Corrected one pre-existing offer test fixture missing required installment percentages.
- Validation: 83 tests passed across paymentFoundation, offerPaymentPolicy, salesPricing, projectCreateForm and emailControl. Real production services were not used. `git diff --check` passed.
- Backup originals: `E:/Allprojects/backup/backend/work6-payment-foundation/`; plan backup `E:/Allprojects/backup/merasoftware/work6-payment-foundation-status/`.
- Still pending: transactional settlement/rollback, concurrency and all reservation/pricing/reminder features. These baseline changes alone do not make those features safe to activate. Existing deployment indexes/data require inspection before any rollout; no syncIndexes or live migration was run.

## Implementation progress — project UPI/wallet transaction boundary

- Real-controller failure injection reproduced invoice settlement surviving a failed order save and wallet deduction surviving failure. Both now abort with their associated writes through the same MongoDB transaction.
- Project UPI approval/rejection and wallet handlers share `backend/helpers/projectPaymentSettlement.js`, reusing session-aware existing invoice/wallet/totals/summary helpers. Services and old monthly plans retain their existing accounting.
- Added transactional validation of current installment, stage threshold, same-customer/same-project payable invoice, amount precision and outstanding balance. Wallet order-mode cumulative parts now settle their invoice before advancing.
- Combined-wallet retries reuse the same received payment; combined rejection commits the wallet refund, invoice reconciliation and rejection atomically. Payment/refund history is preserved.
- Validation: 93 tests passed across paymentFoundation, offerPaymentPolicy, salesPricing, projectCreateForm and emailControl, including concurrent double-pay/approval, failure at order/summary save and rejection failure. Syntax and diff checks passed. Only disposable replica-set MongoDB was used.
- Originals and verification output: `E:/Allprojects/backup/backend/work7-transactional-project-payments/`.
- Remaining: admin project creation/record-payment orchestration, reservation features, lead/account linkage, My Offers, forced historical application and first-node event-only provision. Optional session arguments do not make unintegrated callers transactional. No deploy, live index migration, historical repair or new reminder dispatch was performed.

## Implementation progress — admin project creation/manual payment

- `backend/helpers/adminProjectCreation.js` commits project/timeline, first bill, optional recorded payment, derived totals, final summary and completion marker as one transaction. The controller performs external quote validation first and queues the existing project-created review email only after commit.
- Pending-project manual payment and rejection now use the shared transactional project-payment helper, including a transaction-time role/state check. Rejection cannot overwrite a competing committed receipt/approval. No new approve-without-payment behavior was added.
- Tests reproduce rollback after failed final summary/manual approval and exercise keyed retry, simultaneous creation, dual approval and approve/reject races.
- 107 tests passed across seven isolated backend suites; syntax/diff checks passed. Existing creation/category test harnesses use replica sets and preserve database-specific connection parameters.
- Originals/log: `E:/Allprojects/backup/backend/work8-admin-project-transactions/`. No customer records, live databases, running owner servers or deployments were changed.
- Remaining: reservation, login intent, lead linkage, My Offers, automatic project reservation, confirmation delivery, expiry/repricing, admin force-apply and node-event-only provision. Customer self-creation/other writers need revision/transaction review before repricing activation. New reminder sending remains deferred.

## Implementation progress — reservation part 2 (committed, not deployed)

Recorded on 24 Oct 2026 from a source review of the three working trees; the previous agent built this after the section above but did not document it. Everything is gated by `OFFER_RESERVATIONS_ENABLED` and `OFFER_RESERVATION_CONFIRMATIONS_ENABLED` (both default off).

| What | Where (file / function) | Before |
|---|---|---|
| Reservation record: permanent history, one per user+offer (unique index), immutable price/snapshot/`reservedAt`/`expiresAt`, origin `customer` or `admin_project`, confirmation-delivery state | backend `models/offerReservationModel.js` (new) | No reservation model existed |
| Reserve: only last 24h of a published project offer, `quoteKey` must match, replay returns the original record (72h clock never reset), transaction-serialised per user | backend `helpers/offerReservations.js` → `reserveOffer`; `routes/offerReservations.js` (`GET/POST /api/offer-reservations`, admin `GET /user/:userId`) mounted in `routes/index.js` | No reserve operation |
| Member who reserves becomes a linked lead (`lead.reservationUserId`, unique partial index); existing customers do not create leads; no role grant | `reserveOffer`; `models/leadModel.js` | Lead had no pre-conversion account link |
| Admin conversion of a reservation lead upgrades the same account in one transaction and refuses if the lead email was edited away from that account | `controller/lead/convertLead.js`; `helpers/clientAccount.js` → `upgradeMemberToClient` (session arg) | Conversion matched the account by editable email only, not transactional |
| Converted member session refreshes to `customer` | `controller/user/userDetails.js` | Old `member` session stayed until re-login |
| Confirmation email `offer.reserved` (exact IST deadline, My Offers link), durable dedupe, retry; WhatsApp through the existing email mirror | `helpers/emailDefinitions.js`, `emailCatalog.js`, `emailController.js` → `sendReservationConfirmation`; `helpers/offerReservationConfirmation.js` → `drainReservationConfirmations`; 1-minute cron in `index.js` | Background mail allowed only `offer.payment.reminder` |
| Admin project with offer: reuse the customer's saved reservation (saved price/terms, original clock) or start one at successful creation inside the creation transaction | `helpers/adminProjectCreation.js` → `persistAdminProject`; `helpers/offerReservations.js` → `attachProjectReservation`; `helpers/projectPricing.js` → `resolveProjectPricing` (`offerReservationId`) | Offer projects had no reservation |
| Admin form "Customer's reserved offer" dropdown | portal `src/pages/AdminClientWorkspace.js` | Not present |
| First-payment lock (`confirmedAt`) on full invoice or installment 1 | `confirmReservationPayment`, called from `projectPaymentSettlement.js` → `applyReceived` and `persistAdminProject` | Not present |
| First actual admin node update stored once as `order.offerFirstWorkUpdate` (event only, sends nothing) | `helpers/projectNodeService.js` → `appendProjectNode`; `controller/order/projectNodeController.js` → `saveResponse` | Not present |
| Website: Reserve button, login/signup continuation, `/account/offers` with grey Expired cards | website `src/components/offer-reservations.tsx`, `src/app/account/offers/`, `src/app/api/offer-reservations/route.ts`, `src/app/offer/[slug]/page.tsx`, `src/app/login/login-form.tsx` | Not present |
| Portal: My Offers page; password reset keeps the return target | portal `src/pages/MyOffers.js`, `SetNewPassword.js`, `Login.js`, `ProtectedRoute.js`, `postLogin.js` | Not present |

Verification on 24 Oct 2026 (disposable in-memory replica set / fixture servers only): backend `tests/offerReservations.test.js` 23/23; paymentFoundation + adminProjectTransactions + offerPaymentPolicy + salesPricing + projectCreateForm + emailControl 99/99; website `tests/offer-reservations.browser.mjs` 1/1; portal `tests/offer-reservations-browser.cjs` PASS.

Portal browser test fix: it failed with `process is not defined` because its esbuild bundle defined only `NODE_ENV`, while `src/helpers/brand.js` reads `PUBLIC_URL` and `REACT_APP_WEBSITE_URL` (react-scripts inlines these at build time). The test now defines both. Test-only change; app code untouched. Original at `E:/Allprojects/backup/frontend/work6-step0-browser-test/`. Previous agent backups: `backup/backend/work9-offer-reservations`, `backup/frontend/work5-offer-reservations`, `backup/merasoftware/work14-offer-reservations`. This doc's prior version: `backup/merasoftware/work15-step0-doc-sync/`.

## Owner decisions — 24 Oct 2026

1. Price lock (#1): the first installment or the full payment locks the offer price.
2. Lock time (#2, #5): the time the payment is recorded/submitted counts, not approval. Submitted within the reservation deadline and approved later, even after 72h → price locked. While approval is pending, no repricing.
3. The Reserve button exists only in the offer's final 24 hours and gives the user a fresh 72 hours from reservation.
4. After the deadline with no qualifying payment: if the same offer was edited/extended (validity or price), its current terms apply automatically; otherwise the saved normal price applies.
5. Offer extension (#7): while the reservation is still running or the user has paid, the reserved price stays. Price changes only when the reservation has expired without payment.
6. Expiry access (#6): owner accepted the recommendation — the project's frozen payment policy continues unchanged and expiry changes price only (advance = uploads locked until paid, limited_uploads = remaining allowance, pay_later = continues). Counters are never reset.
7. Reservation extension (new): admin-only "Extend reservation" in addition to force-apply; no maximum, the admin chooses the days. Reason and audit required; the original `expiresAt` stays in history; allowed only before repricing has happened (after repricing, force-apply is used).
8. Phone (#8): no lead and no client without a phone number. Phone is mandatory at signup: country code + 10-digit number. WhatsApp OTP at signup is wanted later — keep a provision now (`phoneVerified`/`phoneVerifiedAt`, flag `SIGNUP_PHONE_OTP_ENABLED` off); do not build OTP now.
9. Payment SSOT (owner, 24 Oct): no new payment or amount rule for reservations. The existing project payment system decides what counts — the full project invoice or the installment invoice, as already defined by `helpers/projectPaymentSettlement.js` → `dueInvoice`. A reservation locks when that existing system marks the first project invoice (full, or installment 1) `paid` — the same event that runs `markOrderApproved`. Only the time used for the 72-hour check changes (decision 2).

Owner approved the following recommendations on 24 Oct 2026:

10. Phone: country-code dropdown, default +91; India exactly 10 digits, other countries validated to their own length; stored in one format (`+919876543210`).
11. Re-reservation: once per new offer period, only if the previous reservation expired without payment and is not attached to a project; old rows remain as history.
12. Cron: do not switch on the global `ENABLE_CRONS` for this; reservation jobs get their own flag (`OFFER_RESERVATION_JOBS_ENABLED`), and expiry is also checked at payment, page load and admin action.
13. Payment rejected after the deadline: lock lost and normal repricing applies; admin may use Extend reservation for a genuine mistake.
14. Payment rejected before the deadline: reservation continues; the user may pay again.
15. Existing phoneless users: no forced prompt at login; phone required at Reserve and at admin client creation.
16. Duplicate phones: no restriction now; one verified phone per account is enforced in the later OTP phase.
17. Force-apply is not allowed on a project whose price is already locked.
18. One reservation applies to one project only.
19. Force-apply only within the categories saved in the reservation's offer snapshot.
20. If repricing makes the total lower than money already received, the surplus goes to wallet credit, shown to admin; no automatic refund.
21. Extension message (email/WhatsApp) states the exact new IST deadline, not relative hours.
22. Projects created before the reservation system: no backfill or repricing.
23. Service plans: no repricing in this scope; projects only.
24. WhatsApp keeps following the sent email (current email-first rule).

## Status and remaining plan — 24 Oct 2026 (Step 0)

Verified findings the plan must handle:

- **Lock-time defect (proven).** `confirmReservationPayment` checks the approval/paid time (`invoice.paidDate`). Repro with the real `adminCreateProjectOrder` + `approveProjectPayment` in a disposable replica set: UPI submitted 1h before the deadline and approved 1h after it → `confirmedAt` stays null. The owner rule needs the submission time. Pending UPI transactions already carry `orderId` and `createdAt` (`models/transactionModel.js`, `controller/user/payInstallment.js`), so no new field is needed for the submit time.
- **Signup has no phone.** Website `login-form.tsx` and backend `controller/user/userSignUp.js` take no phone. Portal `AddCustomerModal`, `AddAdminModal`, `AddDeveloperModal` and `AddPartnerModal` create accounts through the same `/api/signup` (`helpers/createAccountWithRole.js`) without phone; they break when phone becomes mandatory and need a phone field. AddCustomerModal currently creates clients without phone, which conflicts with decision 8.
- **Phone format.** No normalisation exists; `helpers/guestIdentityMatch.js` compares raw strings (documented limitation). New phones should be stored in one format (`+91XXXXXXXXXX`). Fixing guest matching is side-work, not in scope. `user.phone` is not unique; live data was not inspected, so no unique index now (revisit with OTP).
- **Crons are off in production** (`ENABLE_CRONS` absent). Confirmation retries and any expiry cron will not run there. Expiry/repricing must also run at payment, page/invoice load and admin action, not only on a cron.
- `expiresAt` is immutable and read on 19 lines across the three repos (backend reservation helpers/route/pricing/email, portal AdminClientWorkspace/MyOffers, website offer-reservations); extension needs a separate current-deadline field and every reader moved to it.

Final deep verification (24 Oct 2026, after the owner's commit), additional findings:

- Every project payment path goes through `helpers/projectPaymentSettlement.js`: UPI/installment approval and rejection (`transactionApprovalController.js` → `approveProjectPayment`/`rejectProjectPayment`; `payInstallment.js` only creates the pending transaction), wallet (`walletPayInstant.js` → `payProjectWallet`) and admin recording (`approveProjectOrder.js` → `recordAdminProjectPayment`). The Step 1 lock fix therefore has one place to change.
- Customers cannot self-create offer projects (`createOrder.js` has no offer/reservation input); only admin creation applies offers.
- Website reserve button and backend catalogue sign quotes with the same `lib/offer-quote.ts` → `offerWithQuote` and the same universal terms, so `quoteKey` matches. The fallback offer `/offer/page` is served by `/offer/[slug]` and gets the button too.
- **Re-reservation is blocked.** `reserveOffer` returns any previous row for user+offer (`Reservation.findOne({ userId, offerSlug })`, unique index). If an offer is extended and enters a new final 24 hours, a user whose earlier reservation expired gets the old expired record back and cannot reserve again. Needs an owner decision.
- **Pending payment shows "Expired".** `reservationView` marks a row expired when the deadline passes without `confirmedAt`, even if a qualifying payment was submitted in time and awaits approval. Step 1 must add a "payment under review" state on website and portal.
- Cron status in production cannot be verified from this machine (local `.env` defines `ENABLE_CRONS`; earlier notes say the production service lacks it). Owner to confirm on Render before rollout.
- Normal-price fallback data exists on the order: `referenceTotal` (regular price + extras) and `salesAgreement` (admin adjustment).

Remaining steps (backup before each, owner review after each, commit/deploy only with permission):

| Step | Work | State |
|---|---|---|
| 0 | Doc sync, browser tests, commit | Done 24 Oct. Part 2 code committed by owner as "reservation system part 2 incomplete work" (backend b0a2a7b, portal 2b837a4, website 6db2dcb); this doc update and the portal browser-test fix are uncommitted |
| 1 | Lock-time fix inside the existing payment system only: keep the existing "first project invoice paid" event in `confirmReservationPayment`; replace the approval time (`invoice.paidDate`) with the submission time of the completed transactions that settled that invoice (`transaction.createdAt`; for combined wallet+UPI the latest part, i.e. when the full amount had been submitted). Add a read-only "payment under review" view state from the existing pending transaction (`status: 'pending'`, `paymentStatus: 'pending-approval'`, same `orderId`). No change to `dueInvoice`, invoice status derivation, `markOrderApproved` or any payment entry point | Not started |
| 2 | Phone mandatory: website signup, backend signup, 4 portal admin forms, Reserve form for old phoneless members; OTP provision only | Not started |
| 3 | Pricing-revision foundation | Not started |
| 4 | Expiry repricing + offer-extension rule, triggered by cron and by payment/page/admin actions | Not started |
| 5 | Admin "Extend reservation" | Not started |
| 6 | Admin force-apply | Not started |
| 7 | Upload-policy proof tests; website My Offers styling (currently inline styles) | Not started |
| 8 | Rollout: live indexes (`offerReservation`, `lead.reservationUserId`), deploy, flags one by one, cron decision | Not started |

Reminders (daily/advance/stage) remain a later separate phase.
