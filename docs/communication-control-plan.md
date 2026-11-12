# Communication control: audited implementation plan

Date: 12 November 2026. Status: implementation approved and **partially implemented; not ready to call complete**. This is an active handoff document: update it after each successful implementation step.

## Start here — current handoff

This section is the current status. The dated audit and step entries below are a historical work log; where they say a feature was not wired yet, later entries may supersede them. Inspect the current working trees before editing; do not reset, clean, commit or assume that the Git index contains all changes.

- **Repositories:** website `E:/Allprojects/merasoftware`; backend `E:/Allprojects/backend`; customer/admin portal `E:/Allprojects/frontend` only if a remaining integration requires it. The website document itself and several website components are untracked. The backend contains both staged and unstaged changes, including partially staged files. Preserve all of them. Read applicable AGENTS.md files and relevant local Next.js docs before changes.
- **Owner's goal:** one understandable admin-controlled system for Broadcast, action templates and optional reminders, with action discovery and client-level upcoming/sent activity. Reuse existing email/WhatsApp templates, policies, queues and senders as SSOT; keep Auto Reply and existing reminder workflows working. Customer-origin actions remain automatic according to existing policy; admin-origin actions should offer review where applicable. Do not send production messages, change production configuration or deploy during verification.
- **Implemented locally:** central navigation, searchable action-first template creation and existing action settings; a limited business-activity view; existing reservation/offer reminder visibility; configurable monthly-package and Broadcast reminder rules with preview, activation, stop, delivery history, per-channel state and selected retry; actual monthly payment checks and Broadcast recipient/audience rechecks at handoff; immediately started admin monthly packages use the existing Send/Don't Send review; a sent-today filter for new reminders. Steps 6a–6i below contain specifics and limitations.
- **Status after steps 7a–7e (12 November 2026, same day):** the website draft-edit bug is fixed (7a); an admin-made package that starts later on payment approval now gets the Send/Don't Send review (7b, new `serviceStartReview` order field); a quiet-hours-dependent test was made deterministic (7c); business activity now also shows plan starts and offer reservations (7d); the Broadcast follow-up planner was made about 10x faster and measured (7e). Item (4) was assessed and needs no change; items (1) and (5, targeting) are product-scope decisions left open on purpose, see 7f. The list below is the earlier list; read 7a–7f at the end of this file for what changed.
- **Still required (earlier list, superseded in part by the status line above):** (1) support reminder configuration for more actions/templates without claiming an action is supported before its real lifecycle, data, eligibility and stop conditions are wired and tested; current providers are monthly-package renewals and global Broadcast only; (2) provide reliable, understandable action discovery/activity beyond the two currently shown record types, including actions with no message, without treating delivery history as a complete business-action log; (3) handle admin-origin package starts that occur later after payment approval while preserving customer-origin automatic flows; (4) review how existing offer-policy reminders are centrally visible/controlled without changing frozen agreements or duplicating sends; (5) assess per-broadcast targeting/multiple rules (currently one active rule per source and Broadcast applies to all future accepted broadcasts) and large-broadcast scalability; (6) complete remaining regression, browser and release-readiness checks. General retries of uncertain provider handoffs must not duplicate delivery.
- **Safety:** the two scheduler flags `ENABLE_CRONS=true` and `COMMUNICATION_REMINDER_JOBS_ENABLED=true` are required for new automatic reminders; neither was changed here. Rule activation is prospective. These checks used isolated databases/fake providers, not production. Existing offer-policy orders are excluded from new monthly rules to avoid overlapping the legacy scheduler. Do not claim every action, legacy reminder, or live deployment is covered.
- **Verification recorded:** a broad backend run passed 281 tests before the later sent-today/retry changes; focused reminder suites passed 8/8, Broadcast 3/3, and admin start review/Don't Send 1/1 after relevant follow-ups. Website communication/browser tests passed 45/45 before the later UI changes; focused navigation and reminder browser checks passed, and the production build passed after the sent-today UI change. Re-run appropriate full suites after further edits. Website builds and browser tests share `.next`; run those sequentially, not concurrently.
- **First actions for the next agent:** inspect both `git status --short` outputs and this current handoff; trace the real producers and persisted lifecycle for the next action before implementing it; update this document after each successful step; verify both the changed behavior and existing SSOT flows. Do not overwrite the owner's edited templates or silently enable a rule. The owner has already approved implementation and asked to complete it without repeatedly stopping for permission.

### Verified code map for the next agent

All backend paths below are under `E:/Allprojects/backend`; website paths are under `E:/Allprojects/merasoftware`. Both repositories were on `main` when this handoff was checked. The portal repository was also on `main` and had a clean working tree, but it is not the default project and should be inspected again if used.

1. **Control/UI and authorization.** Website `src/app/admin/communication/communication-hub.tsx` hosts Broadcast, templates, reminders, activity, delivery and separate Auto Reply. New controls are in `reminder-drafts.tsx`, `reminder-history.tsx`, `offer-payment-reminders.tsx`, and `business-activity.tsx`. `src/app/admin/email-control/email-control-panel.tsx` owns action/template search and editing. Website `src/app/api/auto-reply/[[...path]]/route.ts` explicitly allow-lists control requests and requires both website-admin and portal-admin roles; backend `routes/autoReply.js` also uses `middleware/communicationAdmin.js`. A new endpoint must be added and authorized on both sides. Context links use stable event keys; refresh uses `src/lib/communication-live.tsx` and must not overwrite unsaved drafts.
2. **Rules and execution.** `models/communicationReminderRuleModel.js` stores disabled-by-default rule drafts with a revision and a partial unique index allowing only one enabled rule per source. `helpers/communicationReminderRules.js` validates 1–10 discrete steps, source-specific placeholders, unique offsets and channels, and performs revision-checked activation/deactivation. The UI requires a preview before activation, but **the backend activation endpoint itself does not require proof of preview**. `helpers/communicationReminderPreview.js` gives an estimate for at most 5,000 monthly orders; Broadcast preview explains that future recipients are unknown. The per-minute registration is in `index.js`, gated by `COMMUNICATION_REMINDER_JOBS_ENABLED`; `helpers/communicationReminderWorker.js` also requires `ENABLE_CRONS` before processing rules. A disabled global job does not itself delete existing rows.
3. **Monthly source.** `helpers/packageReminderEligibility.js` and `packageReminderSchedule.js` distinguish a projected next cycle from an actual `invoiceModel` `plan_renewal` invoice using the same order/cycle occurrence identity. `communicationReminderWorker.js` performs planning, catch-up and due dispatch. It excludes every order with a `paymentPolicy` because the legacy offer engine owns those reminders. It checks outstanding balance, stop-renewal, final cycle, order/client status, invoice state and due-date changes. The dispatcher freezes `expectedAmount`; an intervening partial payment blocks stale wording at handoff. **Current behavior to assess:** if that specific run is canceled for a changed amount, its unique identity prevents it being automatically recreated for the same step; a later step may still be scheduled. Do not imply that an automatic refreshed message is already implemented.
4. **Broadcast source.** `helpers/broadcastReminderCandidates.js`, `broadcastReminderSchedule.js`, and `broadcastReminderWorker.js` use the accepted original `Broadcast`/`BroadcastRecipient` snapshot, require all parts/destinations for a lead to have succeeded, anchor to the last successful part and recheck `broadcastAudience.eligible`. The rule applies globally to broadcasts both created and accepted after activation, not to a selected campaign. Worker scans rotate over 20 broadcasts per pass, but one broadcast's complete recipients and its existing runs are read into memory; load/retention testing and per-broadcast targeting remain open. Do not infer a reply-based stop condition or select a fresh audience.
5. **Handoff, history and retry.** `models/communicationReminderRunModel.js` holds source, revision, occurrence, step, frozen message, channel, amount, outcome and lease fields; unique `(ruleId, ruleRevision, occurrenceKey, step)` prevents repeat planning. `communicationReminderDispatch.js` calls the existing `sendSystemMail` internal event `reminder.automated`; `communicationReminderEligibility.js` rechecks live state for tagged runs. `helpers/emailController.js` checks before the email provider; `helpers/reviewDelivery.js` checks before WhatsApp queueing; `whatsapp/src/sender.js` checks before resolution and again in the transport's `beforeSend`. Untagged legacy sends retain their own paths. `communicationReminderReconcile.js` distinguishes queued, sent, partial and unknown and does not invent a delivery after a queue record disappears. `communicationReminderRetry.js` covers only the known case where email succeeded and WhatsApp queue creation failed, for monthly and Broadcast; uncertain handoffs must not be automatically replayed. `communicationReminderHistory.js` paginates/filter new runs, including fully sent today in IST only if actual completion timestamps exist; it is not legacy reminder history. Runs persist frozen content with no run TTL specified: assess retention/access before extending data collection.
6. **Monthly start review.** An immediately active monthly package started by admin through `controller/order/adminCreateProjectOrder.js` and `helpers/packagePlanOrder.js` uses `emailController.hasActiveRequestScope`, `serviceCycleSettlement.js` and `servicePlanNotifications.prepareAdminStartReview` to prepare the existing `plan.started` review after the order commits; `serviceStartNotifiedAt` prevents the corresponding automatic duplicate. `emailDefinitions.js` supplies package price and tenure and updates only the exact untouched Standard template; custom/edited templates are preserved. Test `tests/projectCreateForm.test.js` covers price, tenure and Don't Send. Later approvals use `controller/user/transactionApprovalController.js` / `settleServiceCycle` and require an evidence-based origin-aware design; do not accidentally change customer-initiated automatic notifications or resend an already claimed start. The portal's existing review interception is `E:/Allprojects/frontend/src/helpers/emailReview.js` and `src/components/EmailReviewDialog.js`.
7. **Activity/legacy.** `helpers/communicationActivity.js` is a bounded read of monthly package **order creation** and accepted Broadcasts, not a durable all-action log and not proof a plan started. `helpers/offerReminderOverview.js`, `reservationReminders.js` and `reservationClosure.js` read or forecast existing families; source-of-truth execution is in `cron/offerPaymentReminderCron.js` and existing reservation/start workflows. Preserve frozen offer offsets and their existing ownership; do not run a sending job just to populate a dashboard.

**Revision clarification:** the historical architecture section below proposes preserving previously enrolled sequences across edits. The implementation currently forbids editing an enabled rule. Stopping increments its revision, cancels scheduled runs, and makes tagged queued runs fail the enabled/revision handoff check; reactivation creates a new prospective watermark and revision. It does not continue the previous revision's future sequence. Treat this as current behavior to review against the owner’s needs, not as proof that the earlier proposed edit semantics are implemented.

### Website reminder-draft edit failure — FIXED (12 November 2026, step 7a below)

Historical description of the defect follows; it is resolved. **Confirmed: website reminder-draft edit failed.** `reminder-drafts.tsx` sends an edit as `PUT` with JSON, and the website proxy allow-lists `PUT`, but `src/app/api/auto-reply/[[...path]]/route.ts` only reads a JSON body when `request.method === 'POST'`. `src/lib/portal-api.ts` only forwards a body when one is supplied, while backend `communicationReminderRules.updateDraft` requires `expectedRevision`. The backend-only edit test therefore does not exercise the website proxy. An isolated temporary test using the existing real website-proxy/backend/Mongo fixture created a draft successfully and then sent a valid PUT with `expectedRevision`; it failed with **HTTP 400: `Reload this rule before saving.`** instead of 200. The probe file was removed after the run; no production request was made. A first attempt to run the probe from the OS temp directory failed to resolve `esbuild`; relocating the temporary probe under the website `tests` directory resolved the fixture setup and exposed the real defect. First add a permanent isolated website proxy/browser test for create → edit → persist and stale-revision rejection, then fix body forwarding while preserving role checks and POST behavior.

### Reproducible verification commands

Run from the specified directory in PowerShell; use the existing isolated MongoDB and mocked provider tests. These are check commands, not permission to run production jobs. Website browser tests and the Next build both use `.next`; run them **sequentially**.

```powershell
# E:\Allprojects\backend: focused new functionality and live-state guards
node --test --test-concurrency=1 tests/broadcastReminderCandidates.test.js tests/communicationReminderEligibility.test.js tests/communicationReminderHistory.test.js tests/communicationReminderRules.test.js tests/packageReminderEligibility.test.js tests/communicationReminderWorker.test.js tests/autoReply.test.js

# E:\Allprojects\backend: existing communication and package regression
node --test --test-concurrency=1 tests/emailControl.test.js tests/reviewDelivery.test.js tests/reservationReminders.test.js tests/packageStart.test.js tests/broadcast.test.js tests/whatsappQueue.test.js whatsapp/tests/sender.test.js tests/packageStartMessage.test.js tests/projectCreateForm.test.js tests/packageChoice.test.js tests/packagePurchase.test.js

# E:\Allprojects\merasoftware: run after the backend checks; do not run the build in parallel
node --test --test-concurrency=1 tests/auto-reply.test.mjs tests/email-control.test.mjs tests/broadcast.test.mjs tests/whatsapp.test.mjs
npm run build
```

The prior broad run's **281/281** result predates the final sent-today and Broadcast retry edits; focused later checks and their exact boundaries are in steps 6h–6i. Do not present the old total as a fresh full-suite result. `npm test` in the backend is a placeholder that intentionally fails; use the named suites above. Some flexible-plan tests previously printed asynchronous teardown warnings even when their test assertions passed; investigate any new failures instead of assuming they are harmless.

**Handoff verification, 12 November 2026:** the four focused backend Broadcast/eligibility/history/worker test files were rerun against the current working tree: **8/8 passed**. The existing website proxy authorization test was rerun: **1/1 passed**. These passing tests do not cover the confirmed PUT-body defect above. A separate temporary isolated proxy test reproduced that defect and was removed. Documentation verification did not change application code, production settings or data.

**Suggested order:** first fix and permanently test the confirmed website edit failure; then trace and implement remaining core action discovery/reminder providers and the delayed admin-start path; then address legacy visibility, targeting, scalability and the revision/partial-payment limitations as needed for the owner's stated scope. Repeat the relevant backend and website regression checks and update this document after each completed step. These priorities do not make a new action safe automatically: verify its actual producer, identity, saved data and stop condition before connecting it.

## Owner requirement

Provide an understandable central control system for Broadcast, action templates and reminders. Preserve current sending, WhatsApp queue, channel selection, admin reviews, Auto Reply and existing reminder behavior. Templates are action responses, not inherently reminders. Allow discovery by category/search, recent activity and contextual shortcuts. Reminder steps need their own wording and timing, client visibility, and supported stop conditions. No live messages or production changes during verification.

## Evidence from current code

Paths below are relative to `E:/Allprojects/backend` unless prefixed `website:` (E:/Allprojects/merasoftware).

| Area | Verified implementation | Implication |
|---|---|---|
| Action catalog | `helpers/emailCatalog.js`: 64 message events, 58 portal and 6 website, grouped into 12 sections | Reuse this registry; these are messaging events, not every business action in the product. A registry entry alone does not prove an active producer. |
| Templates | `helpers/emailTemplates.js`, `helpers/emailDefinitions.js`, `routes/emailControl.js` | Existing CRUD, per-event variables, sample rendering, Standard template, defaults and validation must remain authoritative. |
| Sending policy | `EmailPolicy` in `models/emailControlModel.js`; policy route in `routes/emailControl.js` | Admin actions accept review/off; automatic actions accept auto/off. Channel is a separate action-level policy, not a new per-template routing database. |
| Channels | `helpers/reviewDelivery.js`, `helpers/emailController.js` | Email, WhatsApp and Both; available contacts checked; first attempt freezes content/channels; retries complete only missing parts. Preserve email-only exceptions and automatic fallback rules. |
| Review UI | `website:src/app/admin/email-control/email-control-panel.tsx` | Existing review already supports selecting, creating, editing, renaming and deleting templates. Reuse this editor instead of making another. |
| Broadcast | `helpers/broadcastAudience.js`, `broadcastService.js`, `broadcastJobs.js`; `website:src/app/admin/communication/broadcast-panel.tsx` | Keep audiences, blocked contacts, destinations, saved composition/media, preview, recipient results and retry semantics. Follow-up scheduling is an addition, not an existing control. |
| WhatsApp delivery | `helpers/whatsappQueue.js`, `whatsapp/src/sender.js`, `whatsapp/src/schedule.js` | One queue/sender, spacing, quiet hours, expiry, lease and duplicate prevention. Queue ETA is not a future reminder schedule. |
| Offer payment reminders | `cron/offerPaymentReminderCron.js`, `helpers/offerPaymentPolicy.js` | Offsets are frozen on each order's agreement. Job checks due installments, unpaid status, cancellation, cycle scope and latest eligible milestone. Do not rewrite historical agreement offsets from a global setting. |
| Reservation reminders | `helpers/reservationReminders.js` | Four conditional stages, countdown extension/pause rules and catch-up behavior. Keep timing and dedupe identity. |
| Team follow-ups | `helpers/reservationStart.js`, `helpers/packageStart.js` | Pending start requests notify the team daily, at most three times. Include these in the inventory, not only payment reminders. |
| Existing overview | `helpers/reservationClosure.js`, `website:src/app/admin/communication/reservation-panel.tsx` | Running reservations and package requests already have read APIs. Reuse where possible. |
| History | `models/emailControlModel.js`, `routes/emailControl.js` | Email history is a message/decision log. Suppressed messages and arbitrary business actions are not a complete recent-actions feed. Draft content expires. |
| Client activity | `helpers/clientActivity.js` | Aggregates latest activity per client from several models; not a durable action-by-action communication journal. |
| Monthly billing | `cron/servicePlanRenewalCron.js` | Ordinary renewal invoice is generated at the billing boundary. Three-days-before notification cannot depend on that future invoice existing. |

Local code and isolated tests were examined. Live policy values, deployment environment switches and production data were not queried. Source comments about production switches are not deployment verification.

## Architecture decision

Build a control layer over existing owners. Do not replace existing schedulers with a generic engine as the first step. Separate action discovery, message configuration, reminder eligibility and delivery. New capabilities are explicit and opt-in.

### User interface

Keep `/admin/communication` and existing deep links; organize its content into primary tabs:

1. **Overview**: actionable counts and shortcuts, distinguish business activity from delivery history.
2. **Action templates**: category/search, action identity, audience, current policy, default template and channel. Create flow starts with action, then message and channel/policy. Saving a new template and applying it to the action must have an explicit result; do not silently change routing on other templates. Reuse existing template and policy APIs; handle partial save failures honestly or add a bounded transaction endpoint.
3. **Reminders**: existing reminder families, their actual rules, running client records, next eligible milestones and sent/failed/skipped results. Supported controls only; fixed timings labeled as fixed until a validated configuration is introduced.
4. **Broadcast**: reuse the existing composer and recipient history. New follow-ups live here and in the shared reminder view.
5. **Activity & delivery**: filters by action, client, date, channel and state; open the same action configuration from a row. Keep Email/WhatsApp results distinct.

Connection/sending rules remain accessible as supporting settings. Auto Reply and Final Message retain separate controls and their current behavior.

### Implementation increments

1. **Baseline and event inventory.** Resolve test fixture/selector drift without changing runtime behavior. Map each catalog event to producers, recipients, variables and supported lifecycle references. Label unconnected business actions explicitly. Preserve existing event keys.
2. **Action control UI.** Reorganize navigation, make event search/deep linking precise, integrate Create Template with existing channel/policy controls and the current editor. Add contextual navigation only where a known event is available; no catch-all HTTP-request-to-message mapping.
3. **Existing-reminder visibility.** Add read adapters for offer invoices, reservations and pending start requests. Expose server-derived client/action/deadline/eligibility, policy status, worker gates and history. Forecasts must use the same rules as execution; do not maintain a second approximate scheduling implementation. If extracting pure scheduling helpers is required, prove unchanged behavior with characterization tests. Never run a sending cron to produce a dashboard read.
4. **Recent business activity.** Add durable, bounded action records only at verified committed business events. Capture client/entity/action/time/source; honor access permissions and retention. The log should include configured actions even when messaging is off. Historical delivery records cannot reconstruct unrecorded business actions. Use post-commit reconciliation or a transactional outbox where reliability requires it; an audit failure must not make a completed payment appear failed. Add shortcuts from those records to the same configuration.
5. **New reminder sequences.** Add rule/step/run records scoped to supported entity types. Each step has a template, timing anchor and existing-channel-compatible policy; each run has an entity/cycle identity, rule revision and outcome. Existing reminders retain their owners and keys. Reject overlapping legacy/custom ownership by default to prevent duplicate reminders. New rules begin disabled and apply prospectively; no silent retroactive enrollment.
6. **Monthly package integration.** Use the saved plan billing schedule for pre-due notices without moving invoice generation or cycle activation. Label a pre-invoice notice as an upcoming charge; do not invent an invoice number/link. Once an invoice exists, use its actual outstanding balance and status. Check final cycle, renewal stop, cancellation, partial payments, offer policy and payment approval state. Add a narrowly scoped send-time eligibility guard for new reminder messages so a queued message is cancelled after payment; legacy messages keep current behavior. Add broadcast follow-ups only with supported eligibility conditions; no inferred 'no reply' rule.

### New-rule semantics to expose explicitly

- Stop current-cycle debt reminders when that balance is settled, not merely when any payment is recorded.
- A stop-renewal flag prevents future-cycle reminders; it does not silently erase existing debt.
- Scheduling references business dates, not when the first message happened to leave a busy queue.
- An initial action message remains optional and follows its existing policy; whether reminders may run without it is visible in the rule.
- Future rule/template edits have defined revision behavior; already attempted messages retain frozen content and channel selection.
- Off/paused/unavailable/expired/skipped/queued/sent are separate states. Never label queued WhatsApp as delivered.
- Missing entity context or unsupported stop conditions disable creation with an explanation; do not promise arbitrary automation for all 64 events.

## Baseline checks run (before application edits)

All runs used existing isolated Mongo memory databases and test providers/transports. No production server or real sender was started.

1. Backend: `node --test --test-concurrency=2 tests/emailControl.test.js tests/reviewDelivery.test.js tests/reservationReminders.test.js tests/broadcast.test.js tests/autoReply.test.js tests/whatsappQueue.test.js whatsapp/tests/sender.test.js`
   - 191 tests: 187 pass, 4 fail.
   - Chosen channel delivery, Broadcast, Auto Reply, WhatsApp queue/sender suites passed.
   - Failures: `emailControl.test.js:562` and `reservationReminders.test.js:124,167,187` expect team mail without saved admin contacts. Their fixtures/assertions still expect the old fallback address; `helpers/teamContacts.js` explicitly has no fallback, and `emailController.prepareMail` suppresses recipients when none are configured.
2. Serial follow-up: `node --test --test-concurrency=1 tests/emailControl.test.js tests/reservationReminders.test.js tests/offerPaymentPolicy.test.js`
   - 67 tests: 63 pass, same 4 fail. Offer payment policy suite: 10/10 pass, including dedupe, stop-after-payment and global Off.
3. Website: `node --test --test-concurrency=2 tests/email-control.test.mjs tests/whatsapp.test.mjs tests/broadcast.test.mjs tests/auto-reply.test.mjs`
   - 42 tests: 39 pass, 3 fail.
   - Three failures are strict-locator ambiguity: `hasText: 'Project created'` matches both the original project event and package-project-created event (`email-control.test.mjs:261,380,498`). No application edit preceded these failures.
   - Website Broadcast, Auto Reply and WhatsApp selected tests passed. Compact review template CRUD and WhatsApp-only sending test passed.

Baseline is not fully green. Correct stale fixtures/selectors against documented current behavior before using these suites as the release gate; never restore fallback recipients just to make old tests pass.

## Completion checks

Verify same action policy/data across central screen and contextual shortcuts; template field compatibility and application isolation; no sends from previews/configuration reads; exact legacy reminder behavior; unchanged channel retry/queue behavior; no backdated mass enrollment; no duplicate overlapping rule execution; payment/stop/partial-payment handling; live-state checks on delayed queue sends for new rules; mobile navigation, deep links, keyboard interaction and real backend data. Run relevant existing suites plus meaningful new tests for added control and scheduling behavior. Build/type checks follow implementation.

No application code or production settings changed during this audit. The earlier HTML prototype remains a concept, not proof of available backend capabilities.

## Re-verification and handoff (12 November 2026)

### Historical approval boundary and resumption — superseded

Historical note: at this verification checkpoint the owner required approval before implementation. **That boundary was subsequently satisfied:** the owner approved implementation and repeatedly directed that the remaining work proceed. Do not ask for implementation approval again based on this superseded paragraph. Deployment or production changes were not authorized. The file already exists as `docs/communication-control-plan.md` (the owner's `Communication-Control-Plan.md` refers to this same file on Windows); retain one document, not a second case-variant copy.

During future approved work, update this file after each meaningful step with exact changed files, tests/results, remaining issues, next action and approval/deployment status. Never mark a planned feature as implemented. No deployment authorization is implied.

### Verification cycle 1 — integration and persistence boundaries (new findings)

1. **New system events are not safely Off by absence of a policy.** `emailCatalog.js` and `emailController.applyDefault` make customer events opt-in but system events normally On. New reminder rules therefore need an independent enabled check defaulting false in their execution path; adding a system catalog event is not sufficient. Preserve all old defaults.
2. **Template ownership is action-specific.** Existing APIs reject a template from another event and only accept fields defined for that event. Custom step templates must use a compatible provider/field schema; do not invent dynamic event keys absent from `byKey`. Add a bounded new reminder event/provider contract, with explicit step selection and rule-scoped settings, while keeping existing action templates untouched. No unregistered field passthrough.
3. **Retention affects history claims.** `EmailDraft` expires after 23 hours; finished WhatsApp queue rows expire after 30 days (`whatsapp/src/models.js`). General email history does not constitute durable WhatsApp completion history. New run records need terminal per-channel outcomes before queue expiry; old missing results must display unavailable, not inferred sent. Retention/pagination of new business activity must be explicit; retain compact identity/outcome records rather than unlimited message bodies.
4. **Read routes are not all read-only.** `GET /email-control` calls template initialization and sent-state reconciliation. Reuse it for existing management behavior, but new overview/activity endpoints must use bounded read queries without invoking message preparation, template creation, lifecycle jobs or reconciliation writes. `reservationOverview` is read-oriented but capped at 100; full central lists need real server pagination/counts.
5. **Portal compatibility is in scope.** `E:/Allprojects/frontend/src/components/EmailReviewDialog.js` already manages original templates through the same backend. Central website edits must be visible there without changing its request contract or single-message override behavior. Contextual links can be added there only after verifying portal permissions and the configured website origin. A website-only implementation cannot claim all contextual shortcuts are complete.
6. **Control transport is explicit.** Website proxy routes have allow-lists; new control APIs require intentional proxy paths, application ownership and admin checks on both sides. Existing subscription decisions have protected recipient/token checks that must remain intact. Keep old URL aliases and Back behavior; use exact event IDs for new action links, not display labels.
7. **Refresh must preserve editor state.** `website:src/lib/communication-live.tsx` uses a shared authorized SSE feed, coalesced refreshes and hidden-panel gating. New tabs must follow this mechanism and must not replace an unsaved draft on incoming activity. Pagination and separate detail reads should avoid loading every message body into the dashboard.

### Verification cycle 2 — lifecycle, scheduling and race cases (new findings)

1. **Do not use notification delivery as the business-action log.** `servicePlanNotifications.claimStart` sets its marker before preparing/sending; a suppressed or failed notification is not evidence that the plan failed to start. Log committed business transitions independently, with entity IDs and stable occurrence IDs, without replaying the notification.
2. **Due date is not always next billing date.** `offerServiceRenewal.js` uses cycle start for advance mode, otherwise cycle start plus saved due days. `serviceBillingSchedule.js` uses existing month/date behavior; non-offer cron uses execution time for invoice/due dates. Pre-invoice dates must be labeled projected; once generated, invoice dates override projections. Do not introduce new calendar arithmetic or silently 'fix' month-end behavior.
3. **Two invoice families exist.** `invoiceLifecycle.js` and `monthlyInvoiceController.js` operate on legacy `monthlyInvoiceModel`; monthly package service cycles use `invoiceModel` and `serviceCycleSettlement`. New reminder eligibility must carry entity type/collection plus ID and cycle, not only a generic invoice ID. No new payment-recording path is needed.
4. **Pause and disable are not send recall.** Existing action Off blocks preparation/decisions but is not a generic cancellation hook for an already queued message. New rules must enforce enabled, paused and entity-state checks immediately before BOTH email provider handoff and WhatsApp handoff, and on manual retry. Use tagged new-rule messages so legacy sends remain unchanged. A provider handoff already in progress cannot be unsent; UI must say that rather than promise absolute cancellation.
5. **Broadcast runs have multiple delivery parts.** `broadcastJobs.js` builds channel/recipient/media parts; Both may have different channel completion times. Proposed follow-up enrollment is per original recipient, not a fresh query of a changing audience. Use a recipient-completion anchor after required original parts reach successful terminal status, then current eligibility again at send. Failed/skipped originals do not receive a follow-up automatically. Deduplicate per run/recipient/step/channel; retain existing broadcast sender/media validation. Show this anchor in the builder rather than an ambiguous 'after broadcast'.
6. **No automatic duplicate ownership.** Frozen offer reminders may already own payment reminders. For the first version, refuse overlapping custom payment rules for those enrolled cycles and link to their existing controls; do not transfer ownership or mutate agreement offsets automatically. This is an explicit UI constraint, not a hidden omission.
7. **Application remains additive, but not UI-only.** Existing reminder visibility and template controls are mostly a control-layer change. Reliable recent business activity and genuinely new custom reminders require new data/providers plus narrow guarded integration points. The no-regression requirement means old behavior remains unchanged, not that zero backend files can change.

### Concrete implementation decisions replacing earlier open options

- Create Template remains action-first. Use existing template creation followed by explicit 'Apply to action' policy save; if the second operation fails, retain the created template and report that it is not applied. Do not create a second copy on retry. The channel remains owned by the action; changing it affects future messages using that action and must be labeled accordingly.
- New reminders are disabled on creation, limited to supported providers (monthly package cycles/invoices and broadcast recipients initially), and apply prospectively. Give each activation a watermark; no automatic enrollment of old rows. Preview affected clients before enabling.
- Existing reminder families remain managed by their own current engines; central UI exposes supported controls and fixed/snapshot rules honestly. A universal editable schedule for every legacy reminder is not part of a no-behavior-change control release.
- New rule edits affect new enrollments by default. Existing enrolled sequences keep their rule revision; pause/stop takes effect for pending steps. Do not offer retroactive rescheduling in the first version. Once a message is attempted, existing frozen-content/channel retry rules apply.
- Monthly recurring rule identity is order + cycle; a pre-invoice forecast and its later actual invoice are one enrollment, not two. Reconcile payment/stop/expiry state before scheduling and handoff. The initial action message's delivery is independent of reminder eligibility; state this in the UI instead of treating its Send/Don't Send decision as permission for an entire sequence.
- Exact overdue cadence is admin-configured; do not assume daily/unlimited repeats. Discrete, bounded step offsets and stop conditions are visible before activation. No arbitrary code or database-query builder.

### Additional execution evidence

`node --test --test-concurrency=2 tests/servicePlansP1.test.js tests/packageDates.test.js tests/offerPaymentPolicy.test.js tests/reviewDelivery.test.js` in backend: **35/35 pass**. Isolated memory databases and test providers; no production use. Covers frozen renewal pricing, tenure, renewal creation, package date identity, payment-policy lifecycle, dedupe/Off and channel-specific retry behavior. Prior 4 backend fixture failures and 3 browser selector failures remain recorded above; this narrower passing run does not erase them.

### Verification cycle 3 — executable contract cross-check (no further plan changes)

Ran an inline Node diagnostic against existing exports/schema metadata, without opening a database or a provider. **13 contract groups passed**:

- 64 unique catalog events, all with definitions; application split remains 6/58.
- Broadcast delivery event remains outside the action-template list.
- Email-only restrictions and action channel override remain explicit.
- System/customer trigger classification is distinct.
- Unknown template fields are rejected; a plan-start template does not expose an invoice number field.
- Temporary draft/queue TTLs and durable action identifiers match the updated plan.
- Reservation stage precedence, expired-stage suppression, extension behavior.
- Frozen reminder offsets are sorted/unique and independent of later source edits.
- Offer due-date anchor, first-only policy scope, frozen cycle price and final-cycle gate.
- Next cycle follows the saved cycle boundary.

The first inline diagnostic expected `undefined` rather than the actual `null` for an expired reservation stage and stopped at that assertion. Corrected that diagnostic expectation (no source/test file changed), reran the complete grouped checks and obtained the result above. This was a verification-script mistake, not an application defect or a plan change.

### Verification cycle 4 — preservation and end-to-end trace (no further plan changes)

Traced action catalog → policy/template → review/automatic dispatch → channel coordinator → queue/provider → history, and the portal's fetch/review interception. Confirmed new controls must never replay the original business request. Rechecked legacy reservation timing/offer snapshots, exact event-key navigation, forecast-vs-actual invoice mapping and new-rule-only handoff guards against the updated decisions above.

Ran `node --test --test-concurrency=2 tests/broadcast.test.js tests/autoReply.test.js tests/whatsappQueue.test.js whatsapp/tests/sender.test.js`: **120/120 pass** (6 suites), including audience/media behavior, retries, duplicate prevention, quiet hours, multi-worker sending leases and queue estimates. No further plan-level change identified. These tests exercise existing behavior, not the unimplemented new controls.

### Verification stopping point and remaining limits

Stop condition: two consecutive cross-check cycles after integrating new findings required no further architecture/plan change. This is scoped verification, not a mathematical proof that no future issue can exist. The original baseline's four stale-contact-fixture failures and three ambiguous-browser-selector failures remain open until implementation approval permits fixing tests. No production configuration, real send, new UI browser test or full new reminder workflow was exercised. Those remain implementation/release gates, not reasons to claim this plan already ships.

Inspected revisions: website `417ef0a`, backend `fdec557`, portal `dde3c12`. Backend and portal worktrees were clean; website had only the prior prototype and this untracked plan. Recheck status/revisions before approved work resumes.

### Next agent: exact starting point after approval

1. Obtain/confirm explicit approval in the conversation; currently **not granted** for implementation after this verification.
2. Re-read applicable project instructions, this complete document and current worktree changes. Read relevant installed Next.js guides before website code edits. Do not overwrite the existing prototype.
3. Correct the already identified stale test fixtures/selectors only, then rerun the baseline to establish a green reference. If a failure persists for a different reason, diagnose it and update this document; do not change delivery behavior to satisfy an outdated test.
4. Implement increment 2 (action control UI) against existing APIs, then increment 3 (legacy-reminder visibility). Validate and record each before adding activity/new-rule providers. Complete all increments before claiming the whole requested control system is finished.
5. For every subsequent increment, append a dated record: status, changed files, tests with results, any newly discovered constraint, next step and deployment status. Preserve this verification record as historical evidence.

Implementation progress at end of verification: all implementation increments were NOT STARTED.

## Implementation log — 12 November 2026

Owner approved implementation and asked that this document record their requirements, completed work and next actions after each successful step. Their requirements are in the opening section and the architecture/semantics above: central control for action messages, optional reminders and Broadcast; accessible discovery and client activity; existing WhatsApp, reminder and Auto Reply behavior preserved.

### Step 1: baseline corrections — complete

- `backend/tests/emailControl.test.js`: the customer-update test now explicitly saves a test admin contact and asserts delivery to that contact, rather than expecting the removed hard-coded fallback.
- `backend/tests/reservationReminders.test.js`: each isolated fixture now provides a saved admin contact; the expected team recipient reflects that fixture. Runtime delivery is unchanged.
- `website/tests/email-control.test.mjs`: three ambiguous `Project created` row selectors now target the action's exact labeled default-template field, distinguishing it from `Package project created`.
- Backend baseline command from above: **191/191 passed** after these fixture/selector corrections. The website run after the initial selector correction exposed one incorrectly scoped Playwright `has` locator; corrected it, and the website suite subsequently passed **43/43** including one new action-creation test. No runtime delivery code was changed. Old verification-turn approval note above is historical and was superseded by the user's approval.

### Step 2a: action-first template creation — complete

- `website/src/app/admin/email-control/email-control-panel.tsx`: adds a searchable, section-grouped action selector to the existing Action Templates panel. Choosing an action opens the existing template editor, with channel and sending rule controls. Creating a template alone changes no policy; an explicit checkbox applies it as default with the chosen rule/channel. The UI explains that those settings affect future messages for the whole action.
- Existing action event keys, template/preview APIs, channel choices, automatic vs review modes, email-only constraints, action review UI, delivery engine and old links are preserved. The action selection clears when switching Website/Portal. If template creation succeeds but policy application fails, the saved template is kept and the user is told that it was not applied; no duplicate retry occurs.
- `website/tests/email-control.test.mjs`: added a real-browser isolated-backend test proving action search, default apply, channel/rule persistence, configuration without sending, and that saving without Apply leaves the previous default/channel unchanged. The three pre-existing ambiguous locators were also corrected as recorded in step 1.
- Verification: `npx tsc --noEmit` clean; complete website communication suite **43/43 passed** before the final search-field addition; after the addition, focused action creation, navigation and search browser tests **3/3 passed**. `backend` baseline **191/191 passed**. Test databases/providers are isolated; no production data/messages.
- Additional verification after search: focused browser tests **2/2 passed** for action creation and simulated policy-application failure. The latter proves the template remains saved exactly once and the failed action policy is not applied. Targeted ESLint on the modified panel passed. The full suite has not been rerun since these last search/test additions.
- Remaining: reorganized central navigation, exact-event deep links/context shortcuts, legacy reminder visibility, business-action activity, new reminder engine and monthly-package/broadcast integration are NOT implemented. Current screen still calls the section Email Templates. Do not claim overall task complete.
- Next: implement exact event-key navigation and a clear central navigation without breaking old links or unsaved-draft/live refresh behavior; then implement read-only legacy reminder visibility. Re-run relevant browser and type tests after each increment. Continue this log after each success.

### Step 2b: exact action links — complete (12 November 2026)

- `website/src/app/admin/communication/page.tsx`, `communication-hub.tsx` and `email-control-panel.tsx` now support `?panel=email-templates&tab=portal&event=<event-key>` (or Website). The registered event is selected by its exact ID, not a similarly named label. Show all removes the filter; browser Back restores it. Switching application clears the selected event, and unsupported/mismatched keys show an unavailable message. Existing links still work.
- `website/tests/email-control.test.mjs`: added an isolated browser check of precise event selection, show-all and Back. One test locator initially matched a hidden option; changed the locator to a visible summary and reran it.
- Verified: `npx tsc --noEmit` clean; targeted existing navigation and new exact-action browser tests **2/2 pass**. No message delivery or reminder runtime changed.
- Follow-up: exact-event selection now takes precedence over a previously entered text/category filter, so a contextual link cannot hide its own action due to stale filtering. Clearing the exact selection restores the ordinary search/filter controls.
- Next: expose genuine legacy reminder visibility, then business activity and new rules. These are still not implemented; do not claim the entire task complete.

### Step 3a: existing reservation shortcut — complete, NOT full reminder dashboard (12 November 2026)

- `website/src/app/admin/communication/communication-hub.tsx`: added a portal-admin-only Reminders entry. It reuses the existing authorized read-only Reservation panel and links directly to the existing offer-payment and reservation reminder template actions, plus WhatsApp history. The screen explicitly states that it is not the complete upcoming schedule. Existing Reservation entry/deep link remains available; no new backend endpoint, scheduler or delivery behavior was introduced.
- `website/src/app/admin/communication/reservation-panel.tsx`: corrected stale description to include the existing conditional 24-hours-passed and 24/6/1-hours-left reminder stages. No schedule was changed.
- `website/tests/auto-reply.test.mjs`: extended the real isolated reservation test to open Reminders, display the real running client and follow the existing payment template link. Initial locator accidentally matched a hidden retained panel; scoped it to the visible Reminders region and reran successfully.
- Verification: `npx tsc --noEmit` clean; focused reservation browser test **1/1 passed**. Existing exact-action and navigation tests **2/2 passed** in step 2b. No real messages or production data used.
- Still required: paginated client-level upcoming and historical reminder data for all legacy families (including invoices), business activity, central navigation redesign and genuinely configurable reminder rules with payment and broadcast integrations. The new Reminders entry is a navigation/read-only bridge, not the requested finished reminder engine or full dashboard.

### Step 3b: read-only reservation milestone forecast — complete (12 November 2026)

- `backend/helpers/reservationReminders.js`: added `upcomingStage`, a read-only forecast using the existing `dueStage` and `dayPassedDue` rules and the same stage/deadline dedupe keys. It returns no forecast for disabled, paused, used or expired reservations. It does not run, mutate or change the sender.
- `backend/helpers/reservationClosure.js`: the existing authorized reservation overview selects the needed already-saved fields and includes the next *future* possible milestone. This is not a delivery promise: an already-due catch-up, policy switch, changed reservation or downtime may alter actual sending. Overview retains its existing 100-row limit; it is not yet full pagination.
- `website/src/app/admin/communication/reservation-panel.tsx`: displays the server forecast with an eligibility/settings caveat; older backend responses without the new field still render.
- Tests: backend reservation and offer-payment suites **28/28 pass**, including new pure forecast checks; isolated website reservation browser test **1/1 pass** against the actual overview response. Legacy reminder jobs, queue and payment behavior unchanged.
- Next: remaining legacy payment/team reminder visibility, exact activity records and new configurable monthly/broadcast reminder sequences. No part of these is complete yet.

### Step 2c: central navigation grouping — complete (12 November 2026)

- `website/src/app/admin/communication/communication-hub.tsx` and `communication.module.css`: reorganized the existing boxes into Messages and reminders, Delivery and activity, and Separate workflows. Existing box names, roles, URLs and panels remain intact; Auto Reply remains independent.
- Verification: `npx tsc --noEmit` clean; targeted navigation/activity/exact-action browser checks **3/3 pass**; reservation and Auto Reply browser checks **2/2 pass** including the mobile reservation layout.
- A full website communication run after the exact-action/reminders entry and before the forecast/grouping changes passed **45/45**; the subsequent focused tests cover the newly changed areas. Backend reservation/offer-policy tests passed **28/28** after the read-only forecast change.
- Remaining: legacy offer-payment/team reminder details, paginated complete schedule/history, action activity records and custom reminders including monthly/broadcast. None has been implemented by the navigation or forecast work.

### Step 3c: offer payment reminder invoice visibility — complete (12 November 2026)

- `backend/helpers/offerReminderOverview.js` and `routes/autoReply.js`: added a paginated, admin-authorized read view of unpaid invoices whose orders have saved offer payment terms. Shows customer, due date, outstanding balance, frozen offsets, ineligibility reason, and the next future offset as a conditional milestone. Returns the existing scheduler/action enabled flags. This does not run the cron, create invoices, update overdue status or send messages. Pagination is by invoice, not by reminder milestone; historical sends and already-due catch-up are not represented as future milestones.
- `website/src/app/api/auto-reply/[[...path]]/route.ts`: allow-listed the read-only path and explicitly passes its page parameter, preserving dual-admin access checks.
- `website/src/app/admin/communication/offer-payment-reminders.tsx` and `communication-hub.tsx`: display this existing data and scheduler/action warnings under Reminders, with Previous/Next; wording distinguishes a forecast from delivery. Existing reservation view remains below it.
- Verification: isolated backend offer-payment suite **11/11 passed**, including an assertion that the overview does not mutate invoices or send mail and excludes paid invoices. Website isolated reservation/reminders browser test **1/1 passed**, including a partially paid invoice's correct ₹2,000 balance and a 403 for a non-admin. TypeScript clean. No legacy scheduler/WhatsApp sender changes.
- Still required: complete reminder history and team-request visibility, durable business-action activity, and safe configurable reminder rules for monthly packages/broadcast. No claim that the full system is complete.

### Step 3d: team reminder eligibility visibility — complete (12 November 2026)

- `backend/helpers/reservationClosure.js`: the existing read-only overview derives the next team reminder's eligibility time and sequence number for open package requests and paused offer-start requests, using their saved start time and alert count. It stops displaying after three alerts. No reminder job or stored agreement is changed.
- `website/src/app/admin/communication/reservation-panel.tsx`: displays the conditional team reminder milestone on each relevant request. It does not claim a reminder was sent or promise delivery.
- Verification: reservation and package-start backend suites **36/36 pass**. The first run exposed a pre-existing package-start test fixture with no saved team contacts; supplying the test admin's email and WhatsApp number made the suite match the existing no-fallback contact policy. Before this change, the combined suite had 8 failures, all involving team message assertions; an intermediate run with email only had one missing WhatsApp assertion, resolved by providing the fixture's phone. No production recipient or delivery behavior was changed.
- Additional checks: website communication suite **45/45** and backend offer-payment/reservation/Auto Reply suites **76/76** passed before this last team-forecast display change; reservation/package-start tests above include it. The monthly/broadcast configurable engine and general action activity remain unimplemented.
- After the team-forecast change, `npx tsc --noEmit` and the isolated website reservation/reminders browser test **1/1 passed**. The page continues to identify these as eligibility times, not delivered messages.

### Step 4a: limited business-record activity view — complete, not a complete action log (12 November 2026)

- `backend/helpers/communicationActivity.js` and `routes/autoReply.js`: an admin-only bounded read of existing monthly package order creation records and accepted broadcasts. It does not instrument, mutate or replay business actions. An order being created is explicitly not equated with a plan being active. These records only cover two types and are NOT a durable general-purpose action event journal.
- `website/src/app/admin/communication/business-activity.tsx`, `communication-hub.tsx` and the auto-reply proxy: Business Activity panel displays the actual records with customer/actor and links package orders to the related plan-start template settings. An admin is required at both proxy and backend. The UI explicitly states its limited coverage.
- Verified: isolated browser test **1/1 passed**, including sample package order, name, exact-event link and member 403; `npx tsc --noEmit` clean. No message send or order mutation occurs from this view.
- Remaining: verified durable logging/integration for further business actions, full reminder history, and new configurable reminder execution for monthly package and Broadcast. This view must not be described as the complete requested action log.

### Step 5a: monthly reminder eligibility foundation — complete, not an active reminder (12 November 2026)

- `backend/helpers/packageReminderEligibility.js`: pure, currently unconnected candidate logic for monthly package renewal cycles. It distinguishes the projected future bill from an actual unpaid/partially-paid `invoiceModel` renewal, uses outstanding balance once an invoice exists, suppresses a future bill after stop/final cycle, and keeps existing debt eligible after stopping renewal. Existing offer-policy orders are excluded from this new candidate path to avoid overlap with the established offer reminder job.
- `backend/tests/packageReminderEligibility.test.js`: **4/4 pass** for projection-to-invoice identity, partial/full payment, cancellation, wrong order, final cycle, stopped renewal and legacy-offer exclusion. No scheduler calls this helper yet, no messages are sent, and it is not a complete reminder system.
- Remaining: rule persistence and editing, prospective activation, durable per-cycle/per-step execution, action-specific templates, scheduler, email and WhatsApp handoff eligibility checks, delivery/audit views, and broadcast provider. Verify each before enabling any automatic send.

### Step 5b: disabled reminder-rule data foundation — complete, not exposed or active (12 November 2026)

- `backend/models/communicationReminderRuleModel.js` and `helpers/communicationReminderRules.js` define bounded monthly-package/broadcast reminder draft steps, action-specific allowed fields and channel validation. Creating a draft explicitly rejects `enabled: true`; no route, UI or scheduler consumes the new model yet. Broadcast offsets cannot precede the broadcast anchor. Existing message models and jobs are untouched.
- `tests/communicationReminderRules.test.js` and `tests/packageReminderEligibility.test.js`: **6/6 pass** for sorted steps, disabled default, rejection of activation, duplicate offsets, invalid channels/fields and monthly-cycle eligibility.
- This is only a persistence/validation foundation. It does not implement editing, prospective activation, immutable revisions, execution, provider handoff, or reporting, and must not be represented to the admin as a working rule. These tasks remain open.
- Regression check during this increment: backend offer-payment, reservation, package-start, eligibility and Auto Reply suites **98/98 pass**; website email, WhatsApp, Broadcast and Auto Reply suites **45/45 pass**. Targeted website ESLint passed. These results do not test an unimplemented scheduler.

### Step 5c: durable reminder occurrence identity — complete, no dispatch (12 November 2026)

- `backend/models/communicationReminderRunModel.js` defines a future reminder occurrence's rule/revision, business occurrence, step, client, schedule, frozen content/channel and delivery status. A unique index on rule/revision/occurrence/step prevents duplicate run records when workers compete. No scheduler creates or sends these rows yet.
- `backend/tests/communicationReminderRules.test.js` uses an isolated MongoDB to race two inserts of the same occurrence; exactly one succeeds. With the eligibility tests **7/7 passed**. This confirms database identity only, not end-to-end delivery or cancellation.
- Next: implement rule CRUD and safe activation with immutable revisions/prospective watermark, due-run generation, provider-specific live eligibility at each handoff, durable delivery reconciliation, and admin controls; Broadcast integration and comprehensive tests remain. Do not turn on a scheduler or expose activation before these are complete.

### Step 5d: disabled draft APIs — complete, activation not implemented (12 November 2026)

- `backend/helpers/communicationReminderRules.js` and `routes/autoReply.js`: admin-only list/create/update of disabled reminder drafts. Updates require the saved timestamp and reject stale or active rules; create and update reject activation. List is currently limited to 100. Existing sending logic is untouched.
- `website/src/app/api/auto-reply/[[...path]]/route.ts`: explicitly proxies only the new allowed GET/POST/PUT draft routes, retaining both admin checks. No admin screen exposes these draft APIs yet.
- `backend/tests/autoReply.test.js`: isolated route test passes for role isolation, disabled drafts, rejection of attempted activation, stale-edit conflict and zero queued WhatsApp messages. `npx tsc --noEmit` clean. No scheduled jobs or real sends.
- Next: immutable revisions/prospective activation, scheduling, both provider handoff guards, reconciliation, editor and history. The requested reminder system is not ready and activation must remain disabled.

### Step 5e: disabled draft editor — complete; no sending (12 November 2026)

- `website/src/app/admin/communication/reminder-drafts.tsx` and `communication-hub.tsx`: admin can create and edit named monthly-package or broadcast rule drafts, set bounded reminder offsets, text, subject and channel. The page clearly says drafts cannot be activated or send messages. It uses only the authenticated draft APIs and retains form edits during background refresh.
- `tests/auto-reply.test.mjs`: isolated real-browser test creates a draft through the website and real backend and verifies `enabled: false`; **1/1 pass**. TypeScript clean. No delivery path runs from the editor.
- This is not the completed reminder feature. Activation, revision snapshots, due-run generation, send-time eligibility, durable delivery status, history and broadcast execution are still NOT implemented. Do not activate drafts by setting database fields directly.

### Step 5f: prospective monthly run planning — foundation only (12 November 2026)

- `backend/helpers/packageReminderSchedule.js` builds, in memory only, step records for an enabled monthly rule using the verified eligibility helper. Dates before the rule's activation watermark are not backfilled; projected and actual renewal invoices share an order/cycle occurrence key. The new optional cycle/anchor and rule revision/activation fields are stored in the previously unused models. No caller enables a rule, persists these generated plans, starts a job or sends a message.
- `tests/packageReminderEligibility.test.js` now covers prospective planning and matching projected/actual identities. The isolated rule/run and eligibility suites **8/8 pass**. Future dispatcher must still reconcile actual dates/balances and rule/eligibility at each handoff; this planner is not a scheduler.
- Remaining: safe admin activation, immutable revisions, persistent run generation/leases, delivery adapter, provider and WhatsApp handoff checks, cancellation/retry reconciliation, Broadcast and full history. Do not turn on automatic sends until end-to-end isolated tests pass.
- Follow-up: `persistPackageRuns` now idempotently upserts planned records, swallowing only duplicate-key races; the isolated concurrency test verifies repeated planning leaves one occurrence/step. No caller invokes it in production and it never sends. Rule activation and all delivery guards remain unimplemented.

### Step 5g: live eligibility building block — complete, not wired to providers (12 November 2026)

- `backend/helpers/communicationReminderEligibility.js` re-reads an enabled rule/revision, live client, package order and actual invoice, and fails closed when the balance is settled, due date changed, rule disabled/revised, client inactive or source unsupported. It checks for an invoice even if paid, so it cannot fall back to a projected unpaid cycle. Broadcast is intentionally not supported by this helper yet.
- `backend/tests/communicationReminderEligibility.test.js` tests the live-state conditions in an isolated database. Combined rule/run/eligibility suites **9/9 pass**. No existing sender calls this helper and no rule can currently be activated through an API.
- Critical remaining work: actually invoke the guard immediately at email and WhatsApp handoffs and safe retries; implement activation, schedule loop, stale due-date reconciliation, rendering, delivery status, broadcast and end-to-end tests. Do not treat existence of this helper as an active safety guarantee.

### Step 5i: draft conflict control correction — complete (12 November 2026)

- `communicationReminderRules.updateDraft` now uses and increments an integer revision instead of comparing timestamps. `reminder-drafts.tsx` sends that revision. This prevents two edits within the same timestamp resolution from silently overwriting each other; the isolated API stale-edit test passes. The earlier step 5d description of timestamp checking is superseded by this revision check.
- This change does not activate rules or implement immutable published snapshots; dispatch, broadcast and end-to-end safety remain open.

### Step 5h: new-reminder-only handoff guards — implemented; scheduler still disabled (12 November 2026)

- `backend/models/emailControlModel.js`, `whatsapp/src/models.js`, `helpers/emailController.js`, `helpers/whatsappQueue.js`: an optional `reminderRunId` travels from new reminder mail to its WhatsApp queue row. Existing drafts and queue rows omit it and retain their old behavior.
- `helpers/emailController.js` rechecks the tagged run immediately before the email provider call; `helpers/reviewDelivery.js` checks before adding its WhatsApp copy. `whatsapp/src/sender.js` checks tagged reminders both before resolving the number and in the transport's before-send callback. A paid invoice, disabled/revised rule, inactive client or changed due date fails closed. A handoff already accepted by a provider cannot be recalled.
- Tests: `communicationReminderEligibility.test.js` uses the real sender and an isolated database to show payment while queued cancels the message and payment between number resolution and handoff is checked again; no fake transport send occurred. Targeted email/channel and sender tests **2/2 pass** for nonexistent run IDs; legacy rows have no run ID and bypass the new guard. `communicationReminderEligibility.test.js` **1/1 pass**.
- Follow-up: the same isolated integration test now also prepares a tagged email after payment is recorded and proves the email provider is never contacted; its draft follows the existing failed-delivery path.
- No active rule, scheduler or production reminder is wired yet. Reminder email failures currently follow the existing failed-draft path, and durable run/channel reconciliation is NOT implemented. Broadcast remains unsupported by `maySendReminder`; it fails closed. End-to-end and full regression tests are still required before enabling.

### Step 5j: internal delivery adapter — foundation only (12 November 2026)

- `backend/helpers/emailCatalog.js`: registered `reminder.automated` as an internal system delivery event, outside the administrator's action-template list. Its content must be supplied as an already-rendered rule-step message; it does not reuse or alter another action's default template.
- `backend/helpers/emailController.js`: `sendSystemMail` accepts an optional channel for a rule step. Both follows existing automatic delivery availability fallback; calls without this option retain their original behavior. Tagged reminder runs still pass the handoff checks from step 5h.
- Isolated test in `communicationReminderEligibility.test.js`: a partially paid invoice permits a tagged email through the existing mocked provider once; replaying its dedupe key does not send twice, and the draft retains its run ID. The same test verifies paid email/WhatsApp reminders are blocked. **1/1 passed**.
- No dispatcher calls this adapter, no rules can be activated, and no production job is running. Actual run planning/lease/dispatch, status reconciliation, broadcast eligibility, opt-in activation and UI history remain to be implemented and tested. Existing event/policy defaults for other messages are unchanged.
- Follow-up: for this new explicit-channel path, a history row showing email sent no longer hides a failed WhatsApp half of Both. An isolated forced queue failure/retry test proves email is not duplicated and the WhatsApp copy is queued once. The no-option legacy `sendSystemMail` path retains its old short-circuit.

### Step 5k: single monthly run dispatcher — isolated foundation, not scheduled (12 November 2026)

- `backend/helpers/communicationReminderDispatch.js`: atomically claims one due run, rechecks live eligibility, renders client/package/due/balance, and calls the existing internal delivery adapter with a stable dedupe key. A paid or changed order cancels before delivery. It does not run automatically or activate any rule. Recovery, long-running lease renewal, stale invoice-date rescheduling, multi-channel delivery reconciliation and complete end-to-end behavior still require work.
- Added `expectedAmount` to tagged run state: after text is prepared, a partial payment changing the balance makes later email/WhatsApp handoff fail closed instead of sending stale amount wording. Due-date changes already fail closed. Only tagged new reminders are affected.
- Isolated integration test verifies a partially paid ₹3,000 invoice renders the ₹2,000 outstanding amount, provider receives it once, a second dispatch does not duplicate, a paid invoice cancels a later run, and a changed partial balance is rejected. **1/1 test passed**. Email and WhatsApp cancellation checks from step 5h remain in the same isolated integration test.
- No background process invokes `dispatchReminder` and no activation endpoint is exposed. A successful individual test does not make the requested complete reminder system operational.
- Follow-up: scheduler-lease metadata has been added but is not yet used by a job. `persistPackageRuns` can now move an unattempted scheduled run when an actual invoice supplies a different due date; attempted/queued/sent runs remain frozen. Isolated rule/eligibility tests **9/9 pass**, including the date-change and no-move-after-send cases. A scheduler, delivery reconciliation and activation are still missing.

### Step 5l: monthly worker building block — tested but not scheduled or activatable (12 November 2026)

- `backend/helpers/communicationReminderWorker.js` scans eligible monthly package orders for a directly supplied enabled rule, persists prospective runs, obtains a per-rule lease, skips older missed stages to avoid catch-up bursts, and dispatches due runs. Paid/cancelled invoices and stopped renewals cancel unattempted future runs. The tagged preparing-run guard checks its worker lease before handoff. This function is **not registered in any cron** and no admin endpoint can enable a rule.
- `tests/communicationReminderWorker.test.js`: isolated MongoDB and fake email provider exercise concurrent leases, latest-stage catch-up, repeated scanning without duplicate delivery, and cancellation of a future step after invoice payment. **1/1 passed**. The single-run dispatcher and handoff safety tests from earlier steps remain separate.
- Remaining before any activation: durable per-channel WhatsApp reconciliation, safely recovering failures and leases under interruptions, actual date-change and late-payment edge cases, scheduler deployment flag/observability, owner-facing enable/disable and run history, Broadcast support, and broader end-to-end/regression tests. A direct enabled test fixture is not authorization to activate production rules.

### Step 5m: queued delivery reconciliation — foundation only (12 November 2026)

- `backend/helpers/communicationReminderReconcile.js` combines the existing durable email history with tagged WhatsApp queue copies and stores distinct channel outcomes. A run becomes `sent` only when every selected channel has actually sent; queued WhatsApp is not treated as delivered. Missing expired queue records become `unknown`, never invented as sent. It can rotate a bounded batch without missing-history rows starving other runs.
- `communicationReminderRunModel.js` now admits partial/expired/unknown aggregate statuses and channel outcomes; the eligibility guard allows a partial run to be safely rechecked on a future retry. The isolated delivery test verifies Both stays queued until the WhatsApp copy is sent, then becomes sent.
- Nothing schedules reconciliation in production yet; pause/disable behavior, crash recovery, manual retry, Broadcast and UI history remain unimplemented. The system must not be activated based on this helper alone.
- Follow-up safety review: the monthly worker now treats any later already-processed stage, including failed/partial/unknown, as superseding an older one; expired preparing leases can be skipped without being left stuck. A unique partial index prevents two enabled rules for the same source until audience targeting exists. Isolated worker/eligibility/rule suites **10/10 pass**, including rejection of a second enabled rule. No rule activation endpoint or production scheduler was added.

### Step 5n: new-rule run history — complete view, execution still not enabled (12 November 2026)

- `backend/helpers/communicationReminderHistory.js` and `routes/autoReply.js`: an admin-only, paginated read of new reminder runs, resolving rule/client names without changing run state. `website/src/app/api/auto-reply/[[...path]]/route.ts` explicitly allows the read and forwards the page parameter.
- `website/src/app/admin/communication/reminder-history.tsx` and `communication-hub.tsx`: show new rule steps with customer, time, overall status and separate email/WhatsApp outcomes. It explicitly distinguishes queued from delivered and explains legacy reminders are separate.
- Isolated real-browser test creates a synthetic queued run and verifies the correct customer, rule and `Email: sent · WhatsApp: queued`; non-admin access returns 403. **1/1 passed**; TypeScript clean. This does not prove a real new reminder has been scheduled or delivered.
- Still open: periodic reconciliation, activation and scheduler, Broadcast provider, general action event history, recovery and comprehensive tests. Rule drafts remain disabled.

### Step 5o: monthly activation and gated worker — implemented locally; broader release verification open (12 November 2026)

- `communicationReminderRules.setEnabled`, `routes/autoReply.js` and website proxy: an admin may activate one monthly-package rule after preview, or stop it. Activation requires BOTH `COMMUNICATION_REMINDER_JOBS_ENABLED=true` and the existing `ENABLE_CRONS=true`, validates saved steps, checks the unique active-source index, increments revision and sets a prospective activation watermark. Broadcast activation remains explicitly unavailable. Stopping disables the rule and cancels unattempted scheduled runs; tagged queued messages are rechecked at handoff.
- `communicationReminderPreview.js`: read-only, bounded estimate of future eligible package cycles and sample clients; existing offer-policy orders are excluded to prevent overlap. It creates no runs. Preview is an estimate, not a guarantee.
- `communicationReminderWorker.processCommunicationReminders` is registered once per minute in `backend/index.js` only when the new explicit flag is true. It reconciles queued runs and processes enabled monthly rules only when the existing billing crons are also enabled. Existing cron switches/jobs are not changed. No environment or deployment setting has been changed in this workspace.
- `reminder-drafts.tsx`: monthly drafts must be previewed before the UI enables Activate; Stop explains that a provider handoff already made cannot be recalled. Broadcast is clearly draft-only. The rule API itself validates permissions and scheduler switches; direct API clients are responsible for previewing before activation.
- Isolated `communicationReminderWorker.test.js`: **2/2 passed** for exclusive worker leases, catch-up without bursts, prospective activation, Email+WhatsApp dedupe, payment after queueing preventing WhatsApp handoff, and `partial` reporting when email went but WhatsApp was cancelled. Activation route tests **2/2 passed** for role, disabled-by-default flags, one active rule and stopping scheduled runs. No production messages sent.
- Remaining: Broadcast activation/provider, complete business-action log, delivery recovery/retry and robustness review, admin-facing filtering/history completeness, full regression and builds, production readiness checks. Monthly code is local and gated, not a claim that the whole user request is complete or deployed.

### Step 5p: delayed invoice safety (12 November 2026)

- The monthly worker now leaves a due or overdue projected occurrence scheduled until the billing system actually creates its renewal invoice. Waiting occurrences are filtered before the worker batch limit so they cannot block other customers. Live eligibility still checks the invoice again at delivery.
- The isolated worker suite passes **3/3**, including a delayed invoice that subsequently produces exactly one email. No production setting was enabled.
- Next: finish delivery recovery and Broadcast support, audit the action coverage, then run the full regression/build. Earlier foundation-only status statements are historical; step 5o describes the current gated monthly implementation.

### Step 5q: partial delivery visibility (12 November 2026)

- If email succeeds but WhatsApp queueing fails, the new reminder dispatcher now retains the draft ID and each channel outcome and shows `partial` instead of incorrectly reporting a complete failure. A queued WhatsApp copy remains eligible for reconciliation. It does not automatically replay uncertain deliveries.
- The isolated handoff test forces a WhatsApp queue failure after accepted email and verifies the saved channel states; **1/1 passed**. An admin retry workflow and recovery from uncertain provider outcomes are still open.
- Successful dispatch also records the selected channel outcomes immediately, including the existing Both fallback, so the new history need not wait for reconciliation to show an email result.

### Verification checkpoint (12 November 2026)

- Communication-focused backend regression: **226/226 passed**; website communication/browser regression: **45/45 passed**. The focused handoff and worker suites were rerun after the latest dispatch changes: **4/4 passed**. Website TypeScript and production build passed.
- These tests use isolated data and fake providers; they do not establish production delivery. The full requested plan is **not complete**: Broadcast reminder execution, broader action capture, safe retry/recovery and a package-start message containing the requested pricing/term still require implementation and testing. Do not enable the new scheduler or describe the system as complete merely because these checks pass.

### Step 6a: package-start template details (12 November 2026)

- The existing `plan.started` template now has package cycle price and tenure variables sourced from the frozen order. For non-package plans the new values are empty; existing billing, start/end dates, policy, trigger, channel and deduplication remain the same. Missing tenure is omitted rather than guessed.
- An untouched Standard template is updated only if both its subject and text match the old default. Edited Standard and custom templates are preserved; their owners can add the new variables themselves. This remains the existing automatic system action; an admin Send/Don't Send popup for admin-origin starts is **not implemented** and needs separate origin-aware work without changing client-origin behavior.
- `packageStartMessage.test.js` checks frozen package details, non-package omission and preservation of edits including subject-only edits. It and the existing email control suite passed (**41/41** before the additional subject-only assertion; the updated focused test **1/1** passed). Remaining: Broadcast reminder execution, comprehensive action coverage, recovery/retry, origin-aware admin review and final verification.
- Follow-up: a package that does not accept uploads now gets appropriate next-step wording instead of an upload instruction. Other plans keep the former wording. The old Standard is matched on both subject and text before migration. Focused template, existing email and flexible-plan suites passed **55/55**; the flexible-plan suite logged asynchronous teardown warnings after tests despite passing.

### Step 6b: narrowly scoped admin retry (12 November 2026)

- New admin-only retry in reminder activity covers exactly one known case: email was accepted and the WhatsApp copy failed during queue creation. It checks the rule, invoice, amount, expiration and absence of any existing queue copy before atomically requesting retry. Existing deduplication prevents resending the accepted email; channel handoff checks run again. It rejects payment changes and repeat requests. Other failures and uncertain provider outcomes still need manual review; this is not general recovery.
- The isolated handoff test forces a queue failure, verifies a paid invoice blocks retry, then restores the unpaid balance and verifies one queued copy and no second email. **1/1 passed**; website TypeScript passed. Browser and role-proxy regression remain to be rerun.
- Follow-up verification: combined backend reminder/Auto Reply/package tests **54/54** and website Auto Reply/browser tests **4/4** passed. New retry endpoint authorization was separately checked at both the backend and website proxy (**1/1 each**), including rejection of non-admin roles. No production messages sent.

### Step 6c: filter reminder activity (12 November 2026)

- The new-rule activity view now filters all steps, upcoming scheduled steps, steps due today in India time, sent, and needs-attention. Filtering and counts happen before pagination; upcoming shows nearest first. Today is the scheduled date, not a claim that the message was sent today. Existing legacy reminder views remain separate.
- `communicationReminderHistory.test.js` passes **1/1**, including an India-midnight boundary; website TypeScript passes. Broadcast reminder execution, activity coverage and origin-aware admin review remain incomplete. No production flags were changed.

### Step 6d: Broadcast recipient completion building block (12 November 2026)

- `backend/helpers/broadcastReminderCandidates.js` reads a broadcast's original accepted recipient snapshot, groups parts and destinations by lead, and only identifies a prospective candidate when every recorded original part has a sent timestamp and the part sequence is complete. It uses the latest successful part as the follow-up anchor and excludes broadcasts accepted before activation. It does not query a fresh audience, schedule or send anything.
- Isolated test **1/1 passed** for pending and missing parts, Both channel completion, correct final anchor and pre-activation exclusion. This is only a read-only foundation: destination eligibility, rule activation, durable enrollment, send-time rechecks, preview and worker execution are not yet implemented. Broadcast reminder drafts must remain disabled.
- Follow-up: candidates are rejected while the original broadcast is still preparing, because acceptance can precede completion of its recipient snapshot. The isolated test covers this race. Related reminder suites **6/6 passed** before this extra assertion; the updated candidate test passed independently.

### Step 6e: Broadcast live eligibility and enrollment foundation (12 November 2026)

- Broadcast candidate checks now reuse `broadcastAudience.eligible` for every original destination and reject leads that leave the selected group, become blocked or change a contact. `broadcastReminderSchedule.js` can persist prospective identities by original broadcast, lead and step; concurrent planning is idempotent. This code is not connected to a production scheduler or sender.
- The isolated test **1/1 passed**, covering original multipart/Both completion, prospective anchor, changed audience/phone and concurrent planning. Broadcast activation remains disabled until destination selection, sender handoff checks, UI preview and end-to-end tests are completed. Original Broadcast and Auto Reply working is unchanged.
- Regression checkpoint: Broadcast, new candidate/enrollment, reminder history and monthly worker suites **35/35 passed**. No production settings or data were changed. The candidate implementation currently rereads the broadcast for each lead/step; optimize and bound this scan before enabling it for real audiences.

### Step 6f: isolated Broadcast dispatch and handoff checks (12 November 2026)

- New tagged Broadcast reminders can now use the existing email and WhatsApp delivery paths in isolated tests. Eligibility rechecks the original broadcast snapshot, audience, block state and original destination at each handoff; recipient selection uses only original successful destinations. The worker uses a per-rule lease and the existing reminder job flag. Candidate lookups are restricted to the lead rather than rereading the whole broadcast for each lead.
- Isolated tests exercise concurrent worker claims, a single email and queue copy, and a lead leaving the audience before WhatsApp handoff; combined Broadcast/monthly handoff and worker tests **6/6 pass**. Activation is still blocked and no production flags changed. Required next: preview and activation UI, end-to-end role tests, display lead names in history, bounded worker scans and full regression.

### Step 6g: Broadcast preview and activation (12 November 2026)

- Broadcast rules can now be previewed and activated through the admin control when the existing billing and new reminder job flags are enabled. The preview explains that only broadcasts accepted after activation are eligible; future recipients cannot yet be enumerated. Only original successful destinations can be used and the original audience is checked at handoff. Stopping cancels scheduled runs; delivery already handed to a provider cannot be recalled.
- History resolves Broadcast recipients from the existing Lead records. Isolated authorization, worker, handoff and monthly tests **57/57 passed**, and website TypeScript passed. No production flags or messages changed. Further release work: bound/scale worker scans, browser and full regression, and review remaining core gaps before claiming completion.
- Follow-up: workers rotate over at most 20 broadcasts per pass and reset their cursor when the pass ends; an older broadcast that finishes preparing later is picked up on the next pass. A prospective broadcast must have both its creation and completed acceptance after activation. An individual broadcast's recipient processing still scales with its number of recipients. The browser test now creates a Broadcast rule, previews, activates and stops it (**1/1 passed**); the backend Broadcast, Auto Reply, template and WhatsApp sender regression passed **175/175**. The first browser run failed on a test selector; its corrected focused rerun passed.
- The planner now checks each original destination once per lead instead of once per message part and per reminder step; delivery still rechecks the current audience and destination. Broad backend communication regression passed **230/230** before this planner-only optimization, whose focused tests passed **2/2**. An initial website build and browser run collided over `.next`; rerun them sequentially before claiming verification.
- Follow-up: already planned lead/step identities are skipped in subsequent scans, and reminder cards link directly to their corresponding plan-start settings or Broadcast composer. Sequential website communication/browser tests **45/45 passed**, the updated reminder browser test **1/1 passed**, the website production build passed, and the latest focused Broadcast/monthly worker tests **5/5 passed**. The earlier `.next` collision was a test orchestration error and was resolved by running the website checks sequentially.

### Current handoff and remaining core scope (12 November 2026)

- Broadcast and monthly-package reminder rules can be drafted, previewed, activated and stopped locally; automatic execution requires both `ENABLE_CRONS=true` and `COMMUNICATION_REMINDER_JOBS_ENABLED=true` in the backend deployment. These flags were not changed here. Existing provider, queue, template and Auto Reply flows are reused. Broadcast rule activation applies to future broadcasts globally; the UI states this explicitly.
- Do not describe the complete original request as finished: configurable reminder providers exist only for monthly-package renewals and Broadcast, not every action/template; business activity is a limited read of two existing record types, not a comprehensive action log; existing offer-policy orders remain on their old reminder flow; and admin-origin monthly start still uses the old automatic plan-start action rather than a new Send/Don't Send popup. These are product-scope gaps, not merely optional Auto Reply work. Large individual broadcasts are processed in memory and must be load-tested before broad rollout.
- Additional focused regression: Broadcast eligibility, real tagged send/queue, audience change and bounded scan rotation **3/3 passed**. Only one rule per source can be active at a time; this prevents duplicate global enrollment but does not provide per-broadcast targeting. Backend has both staged and unstaged modifications, and the website has modified and untracked files; a future commit must deliberately include the complete intended changes in both repositories.

### Step 6h: immediate admin package-start review (12 November 2026)

- For an admin-created monthly package that starts immediately inside the existing request review scope, the existing `plan.started` template is now staged for Send/Don't Send instead of being sent automatically. Its existing start-notification claim prevents the automatic duplicate. The customer purchase path and unscoped legacy callers retain their old behavior. The review includes the frozen package price and tenure. Orders that start later through payment approval still use the existing automatic path and need separate origin-aware coverage.
- The actual create-project middleware test checks the review response, action key, price and tenure. The full project-form, package-choice, customer package-purchase and flexible-plan suites passed **63/63**. Flexible-plan tests logged their existing asynchronous teardown warnings despite passing. This supersedes the statement above that every admin-origin start uses the automatic path; the later-approval case remains open.
- Broad final backend communication, package and sender regression passed **281/281**. A portal action-template view now links to the supported monthly reminder rules, and reminder cards link back to the relevant plan-start or Broadcast screen; focused browser navigation passed **1/1**. This link does not imply that arbitrary action types are configurable as reminders.

### Step 6i: fully sent today (12 November 2026)

- New reminder activity can filter deliveries fully sent today in India time. The recorded completion time comes from the actual email/WhatsApp delivery timestamps; Both is only dated after every selected channel has a timestamp. Older records lacking timestamps are not invented or counted.
- Isolated completion, India-day filtering, Broadcast and monthly worker suites **8/8 passed**; website TypeScript passed. The new field covers configurable reminders only, not older legacy reminder histories.
- Broadcast reminders now also support the same narrowly scoped admin retry when email was accepted but WhatsApp queue creation failed. The real tagged Broadcast integration test forces that failure and verifies the retry queues one copy without repeating email; Broadcast suite **3/3 passed**. General retries of uncertain provider handoffs remain intentionally unavailable.
- The updated reminder browser test verifies the sent-today filter; **1/1 passed**, and the website production build passed after the change. The admin package-start integration test also verifies Don't Send finalizes the review without sending (**1/1 passed**).

### Step 7a: website reminder-draft edit (PUT) fixed (12 November 2026)

- **Before:** `src/app/api/auto-reply/[[...path]]/route.ts` (`handle`) read the JSON body only when `request.method === "POST"`. An edit sent as `PUT` reached the backend with no body, so `communicationReminderRules.updateDraft` rejected it with HTTP 400 "Reload this rule before saving." (no `expectedRevision`).
- **After:** the body is read for `POST` and `PUT`. The allow-list, the website-admin plus portal-admin check, the token check and POST behaviour are unchanged. No backend change.
- **Tests (`tests/auto-reply.test.mjs`):** new proxy test "proxy forwards a reminder draft edit (PUT body)…" covers create → PUT edit → persisted name/steps/revision+1, 403 for a non-admin and for a non-website-admin, 409 for a stale revision (stored data not overwritten) and 400 when `expectedRevision` is missing. It failed before the fix (400 instead of 200) and passes after. The existing reminder browser test now also clicks Edit draft, changes the subject, saves and checks the stored subject, revision 2 and `enabled: false`.
- **Results:** `tests/auto-reply.test.mjs` 5/5; `email-control`, `broadcast`, `whatsapp` 41/41; backend focused reminder suites 66/66 (run before the change; backend untouched); `npx tsc --noEmit` and ESLint on the route clean. Isolated databases only; no production message or setting.
- Backup: `E:\Allprojects\backup\merasoftware\work116-reminder-put-body`.
- **Next:** remaining items (1)–(6) of "Still required". Nothing in this step changes their status.

### Step 7b: admin-made monthly package that starts later, on payment approval (12 November 2026)

- **Before:** an admin adds a monthly package and lets the client pay the bill. When the admin then approved the client's UPI payment (`controller/user/transactionApprovalController.js`, `applyApprovedOrderPayment`), `settleServiceCycle` started the plan and `notifyCyclePaid` sent `plan.started` automatically, with no Send/Don't Send. Plan orders stored no creator/origin, so admin-made and customer-made orders could not be told apart.
- **After:** `models/orderProductModel.js` has a new `serviceStartReview` Boolean (default false), set to true only in `controller/order/adminCreateProjectOrder.js` for an admin-made monthly package. New `helpers/packagePlanOrder.js settleCycleReviewingStart` is called by the approval controller instead of `settleServiceCycle`: when the invoice is fully paid, an admin request is active, the order has `serviceStartReview` and no start message has been claimed, it settles with `skipNotification` and stages the existing `plan.started` template through `servicePlanNotifications.prepareAdminStartReview` (same once-only `serviceStartNotifiedAt` claim, price and tenure variables). The portal needs no change: its global fetch review already handles any `/api` response carrying `emailDraftIds`.
- **Unchanged:** customer purchases, wallet payments, renewals, partially paid invoices, orders created before this change (field absent = false) and any call without an admin request keep the automatic path. If the `plan.started` action is Off nothing is staged, as for the immediate admin start. Linked add-on plans (`serviceLifecycle.activateAfterProjectServices`) and `servicePlanAdmin.js` were not touched.
- **Tests:** `tests/projectCreateForm.test.js` new test: pay-later admin package stages nothing; admin approval of the UPI payment returns one `plan.started` review with ₹1,000, order active and start claimed once; Don't Send sends nothing and nothing automatic follows; an order without the flag still gets the automatic path with no review. It fails when the controller change is reverted. `projectCreateForm`, `planCheckoutPortal`, `paymentFoundation`, `packageStartMessage` 51/51. Also fixed one stale fixture in `tests/planCheckoutPortal.test.js` (expected the removed `syncvap@gmail.com` fallback; it now saves an admin contact, same fix as step 1; no runtime change).
- **Open issue found, not from this step:** `tests/communicationReminderEligibility.test.js` "handoff eligibility rechecks rule, client, actual invoice and due date" (assertion "payment recorded while queued cancels WhatsApp") passes in an earlier run and now fails every time, also with this step's files reverted to their backups. Files in the reminder/email area (`emailController.js`, `communicationReminderDispatch.js`, that test file) were modified by something other than this step around 21:31–21:35 IST. Not investigated or changed here; needs a decision on who owns those edits.
- Backup: `E:\Allprojects\backup\backend\work82-admin-start-review`. Not deployed.

### Step 7c: quiet-hours-dependent test fixed (12 November 2026)

- **Cause of the failure found after 7b:** `backend/tests/communicationReminderEligibility.test.js` ran the real WhatsApp sender with the real clock and default sending rules. The sender holds every message from 22:00 to 08:00 IST, so after 22:00 `step()` did nothing and the assertion "payment recorded while queued cancels WhatsApp" failed. It was a time-of-day test bug, not a product bug and not caused by 7b (the same failure appeared with 7b reverted).
- **Fix (test only):** the test now opens sending (`quietHours: false, typing: false` in the sender state, the same pattern as the other WhatsApp tests) before each `step()`. No runtime code changed. It passes at 22:15 IST.
- Also fixed in this pass: nothing else in the broad suite depends on the hour (335/335 ran after 22:00 IST).

### Step 7d: business activity shows plan starts and offer reservations (12 November 2026)

- **Before:** `backend/helpers/communicationActivity.js` read only monthly package orders and accepted broadcasts.
- **After:** it also reads (a) `Plan started` from `serviceStartNotifiedAt` (claimed only while the plan was active, so a suppressed or failed start message does not change it) and (b) `Offer reserved` from the reservation's `reservedAt`. Each row links to its exact action settings (`plan.started`, `offer.reserved`). Still bounded to 50 per type, admin only, read-only; no new log, no write, no message. It remains a read of existing records, not a complete action log; other actions are not covered and the screen says so.
- Website: `business-activity.tsx` shows the matching button label per event; `communication-hub.tsx` description/tile text updated. `tests/auto-reply.test.mjs` browser test checks the new rows and both links.
- Backup: `E:\Allprojects\backup\merasoftware\work117-business-activity`.

### Step 7e: Broadcast follow-up planner speed (12 November 2026)

- **Measured** (isolated in-memory MongoDB, 2 destinations per lead, 2 steps): 2,000 leads planned in 15 s (7.5 ms per lead), 10,000 leads in 211 s (21 ms per lead, growing). Cause: `broadcastAudience.eligible` called `contactBlocks()` (reads all customers, blocked leads and Final Message rows) once per destination, so planning cost grew with leads x blocked records.
- **Fix:** `eligible(..., { blocks })` accepts an already-read map; `checkBroadcastCandidate` passes it through and `planBroadcastReminders` reads the blocks once per pass (`helpers/broadcastAudience.js`, `broadcastReminderCandidates.js`, `broadcastReminderSchedule.js`). Delivery is unchanged: `eligibleBroadcastReminder` and every handoff still read the current blocks themselves.
- **After:** 10,000 leads (20,000 recipient rows, 20,000 runs) plan in 21.5 s (about 2 ms per lead); process memory 116 to 232 MB; a repeat pass over an already planned broadcast takes 0.2 s. New test `planning reads the blocked numbers once and still skips a blocked lead` in `tests/broadcastReminderCandidates.test.js`.
- **Known limits, unchanged:** one broadcast's recipients and runs are still read into memory per pass (about 100 MB at 10,000 leads); planning and dispatch share one worker pass, so a very large first pass delays due reminders of that rule by its duration; a lead who is not eligible is re-checked each time its broadcast is scanned. Measured numbers are from an in-memory database; a hosted database adds latency per query. Not tested above 10,000 leads.
- Backups: `E:\Allprojects\backup\backend\work82-admin-start-review` (`*.before` files).

### Step 7f: assessed, no code change (12 November 2026)

- **Item 4, offer-policy reminders:** the Reminders screen already lists unpaid offer invoices with their frozen reminder days, next future milestone, ineligibility reason, a banner when the scheduler or the action is Off, and a link to the action settings; reservation and team reminders are shown the same way. New monthly rules exclude every order with a payment policy, so nothing is duplicated and frozen agreements are never edited. Nothing further needed for the stated scope.
- **Item 1, more reminder providers:** only monthly-package renewals and Broadcast are supported, deliberately. Another action may be added only after its real producer, saved data, identity and stop condition are traced; none was added to avoid claiming unverified support.
- **Item 5, per-broadcast targeting:** today one rule is active per source and the Broadcast rule applies to every broadcast accepted after activation (the screen says this). Targeting selected broadcasts or several rules needs a product decision (selection UI, uniqueness change); not built.
- **Revision/partial-payment limits, unchanged:** editing is allowed only while a rule is disabled; stopping and reactivating starts a new prospective revision and does not continue the old one. A run cancelled because a partial payment changed the balance is not recreated for the same step; later steps are planned normally. The backend activation endpoint does not itself require a preview (the screen does).

### Verification at the end of 12 November 2026 work

- Backend (23 suites: reminder, Auto Reply, email control, review delivery, reservation, package, payment, WhatsApp queue/sender, alt phone, broadcast): **335/335 passed**, run after 22:00 IST.
- Website (`auto-reply`, `email-control`, `broadcast`, `whatsapp`): **46/46 passed**; `npx tsc --noEmit`, ESLint on the changed folders and `npm run build` clean (run sequentially).
- Isolated databases and fake providers only. No production message, flag, deployment or git command. Nothing is committed: both repositories have many uncommitted changes from several steps; commit them deliberately and together.
- Not done and not claimed: deployment, a real WhatsApp/email send, enabling `ENABLE_CRONS` / `COMMUNICATION_REMINDER_JOBS_ENABLED`, tests above 10,000 leads, portal changes (none were needed).

### Step 7g: Email Templates open no longer rewrites every template (12 November 2026)

- **Problem (measured):** `GET /api/email-control` (backend `routes/emailControl.js`) called `ensureSystemTemplates` on every open and refresh. It issued about 70 write commands (one upsert per portal action plus wording upgrades) before the page could draw, and each one moved that template's `updatedAt`, so a template revision an admin had loaded (`expectedUpdatedAt` conflict check) went stale after any refresh. The dev database was also empty, so the first open there created all 58 templates.
- **Change (`backend/helpers/emailTemplates.js`):** the wording upgrades are one shared list (`wordingUpgrades`) used by `systemTemplate` and `ensureSystemTemplates`; `ensureSystemTemplates` now runs the upgrades in one batched write, runs the project-update migration, reads which actions already have a Standard copy and creates only the missing ones (one batched write, duplicate-key races ignored). An existing copy is never rewritten. Behaviour of `systemTemplate` (used when sending) is unchanged.
- **Cost per open:** 70 writes before; 1 write + 2 reads after (steady state), measured in an isolated database.
- **Equivalence verified:** same templates as the old function for empty, partial and old-wording databases, owner-edited and custom templates preserved, six simultaneous first opens, `updatedAt` stays valid after a refresh.
- **Tests:** new `backend/tests/ensureSystemTemplates.test.js` (3 tests; its repeat-open test fails on the old function). Backend 446/446 (26 suites) and website `auto-reply`/`email-control`/`broadcast`/`whatsapp` 46/46 passed.
- **Not proven:** this does not explain a loader that never ends. Observed separately: the website dev server's first request to a route takes seconds (compile: 11.4 s for `/api/email-control`, 4.6 s for the page); with the backend stopped the site treats the admin as signed out (`PORTAL_API_URL=http://localhost:8080`, nothing listening). Remaining cause needs the browser Network result (status/time of the `email-control` request).
- Backup: `E:\Allprojects\backup\backend\work82-admin-start-review\emailTemplates.js.before`. Not deployed.
