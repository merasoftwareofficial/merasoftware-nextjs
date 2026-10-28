# Flexible Plans - closure and next-agent handoff

Updated: 28 Oct 2026. Current SSOT; completed execution steps are replaced by outcomes and code owners. Full previous document is backed up (section 7).

## 1. Resume here

**State:** admin management, customer discovery and project-category selection are implemented and locally verified. Approved legacy cleanup is applied. Latest category/cleanup changes are uncommitted; deployment and owner acceptance are unverified. The initiative is not fully closed.

**Next action:** implement the owner-requested customer plan draft/checkpoint communication initiative in section 8. This update creates its working plan and proposed English templates only; no application behavior or sending is enabled. The inline category-draft warning, deployment/acceptance and duplicate-editor cutover remain open in section 4.

| Repository | Root | Last completed stage commit |
|---|---|---|
| Backend (Express/Render) | `E:\Allprojects\backend` | `eb3219d` |
| Portal (React/CRA) | `E:\Allprojects\frontend` | `fa81e93` |
| Website (Next.js) | `E:\Allprojects\merasoftware` | `6a2d687` |

Verify target path, AGENTS instructions, git status and code before acting. Preserve uncommitted category helper/controller/tests, both managers/pickers, website catalogue-reader simplification, approved route/API/cron/script deletions, cron preview/test and handoff/index docs. Both new picker files need inclusion when committed. Do not repeat completed stages or reset working trees.

## 2. Completed behavior and decisions to preserve

- **Core flow:** fixed/flexible plans, backend quotes, saved purchase choices, wallet/UPI and admin client-start, renewals, upload allowance/status/history and no-upload work updates. Catalogue edits preserve sold snapshots/cycle prices. Tenure is at most the plan limit, capped at 12 months. Allowance carries within a paid cycle and lapses at cycle end; one-time upload validity defaults to 90 days. Rejection restores allowance once within the same cycle.
- **Portal admin:** full catalogue/category manager using backend save/quote/lifecycle APIs and `expectedUpdatedAt` revision checks (stale edits return 409). URL stays `/admin-panel/website-management/plans`; old `/admin-panel/website-management/services/add` redirects into creation. Website editor stays until portal acceptance.
- **Customer UI:** Explore Services category cards use the shared on-sale catalogue and existing PlanBuilder. Quotes are requested for selections, not every card. Unavailable/project-required plans are handled; chosen plan IDs survive normal/guest login and password-reset save/skip. Changed selections invalidate stale quotes. Existing offer-return rules remain; website estimator choices are not transferred, only the plan ID.
- **Category correction:** both editors offer existing plan categories, project categories and independent showcase categories. Explicit confirmation reuses a linked category; multiple matches require a choice and archived matches require explicit revision-checked restore. New project-derived keys are deterministic with unique-key race protection. Opening/selecting the option writes nothing. Independent categories have `linkedProjectCategory: null`. Project and showcase labels remain separate; linkage is classification, not purchase eligibility.
- **Approved A-D/F cleanup:** removed mock `UserUpdateDashboard`/`my-updates`, twelve unused portal API entries, eight legacy routes/seven route-only controllers, old renewal cron/start, obsolete overdue/pause writers and six unused legacy scripts. Cron preview reflects retirement. Review found no remaining runtime callers for deleted items. Exact deleted files remain visible in git diff and external backups.
- **Retained deliberately:** `monthlyInvoiceModel`, old-bill readers/payment/document/mail handlers, current `servicePlanRenewalCron.js`, guarded `readOnlyAuditFlexiblePlans.js`, `applyLivePlanSettings.js`, and all customer uploads/files/notes/snapshots/bills/invoices/transactions. No production data was deleted or migrated by this work.

**Architecture:** website showcases; portal delivers/administers services; backend/database owns catalogue, pricing, purchase, allowance and lifecycle. Portal becomes sole editor only after acceptance. Projects are separate jobs; packages remain marketing-only in this scope. Preserve existing checkout; no frontend final-price engine or second category store.

## 3. Code owners: first files to open

Backend paths are relative to its root; portal paths to `frontend/src`; website paths to `merasoftware/src`.

| Concern | Owner / entry point |
|---|---|
| Stored settings, save and lifecycle | backend `models/productModel.js`, `helpers/servicePlanCatalogue.js`, `catalogueRevision.js`, `servicePlanLifecycle.js`; `controller/admin/planCatalogue.js` |
| Categories/project references | backend `helpers/planCategories.js`, `projectCategories.js`, `models/servicePlanCategoryModel.js`, `controller/admin/planCategories.js` |
| Admin UI/adapters | portal `pages/AdminPlansPage.js`, `components/admin/{AdminPlansManager,PlanCategoryPicker}.js`, `helpers/{adminPlanForm,adminPlanApi}.js`; website `app/admin/plans/{plans-manager,plan-category-picker}.tsx`, `lib/service-plans{,-server}.ts`, `app/api/plans/route.ts` |
| Shared sale catalogue | backend `helpers/servicePlanPublicCatalogue.js`, `controller/order/servicePlanQuote.js`; customer `GET /api/customer/service-plan-catalogue`; admin `GET/PATCH /api/admin/plan-catalogue`, category `PATCH /api/admin/plan-categories` |
| Price/purchase/bought terms | backend `helpers/servicePlanPricing.js`, `servicePlanPurchase.js`; order `servicePlanSnapshot` and frozen `serviceCyclePrice` |
| Cards/builder/auth continuation | portal `pages/{StartNewProject,ServicePlanDetail}.js`, `components/{CustomerPlanCards,PlanBuilder}.js`, `helpers/{customerPlanCatalogue,serviceTenure,planAuthReturn}.js`; website `lib/public-plans.ts` |
| Paid cycle/renewals/old bills | backend `helpers/serviceCycleSettlement.js`, `serviceBillingSchedule.js`, `cron/servicePlanRenewalCron.js`; retained `helpers/invoiceLifecycle.js`, `controller/invoice/monthlyInvoiceController.js` |
| Allowance/upload/history/mail | backend `helpers/serviceAllowance.js` (all limit readers), `uploadStatus.js`, `orderUploadHistory.js`, `servicePlanNotifications.js`; `plan.*` mail definitions |
| Website backend access | website `lib/sales-catalogue-server.ts`: admin cookie/role, public server-only integration bearer; preserve `/plans`, `/api/plan-quote` and integration routes |

Related routing docs: backend `docs/QUICK_INDEX.md` / `docs/CODE_AUDIT.md`; portal `DOCS/CODEBASE_MAP.md`, especially protected dormant systems in section 14a. Before Next code edits, read the relevant installed Next guide.

## 4. Remaining work, in order

1. **Inline category-draft warning: reproduced, not fixed.** Open an unchanged saved plan -> New independent category -> type a name -> All plans. Both editors lose the name without warning. Picker-local `name`/`mode` is outside existing manager dirty/navigation guards; main plan fields are protected. Similar inline state existed before the new picker, so this is an unaddressed UX gap, not a deletion regression. Include meaningful category drafts in the existing guard. Verify stay/discard, router navigation and refresh in both editors; cancel/success clear draft state, failure retains it. Preserve plan inputs; avoid a second navigation mechanism.
2. **Deployment and acceptance.** Owner reviews/commits; compatible backend first, then portal/website. Owner cannot test locally. Check admin create/edit/link/independent category, price/lifecycle; customer cards -> builder -> authorized purchase -> My Plan/payment/upload/work history; website plan -> login/reset -> same plan; project Add a Service; mobile/themes. Build/bundle text alone is not acceptance. Live test purchase/mail needs an approved action and owner-named client.
3. **Single-editor cutover.** Only after portal acceptance, obtain exact deletion-list approval. Website `/admin/plans` becomes an authenticated portal handoff; inspect editor/proxy/sidebar/`SALES_PAGES` dependencies. Preserve public plans/estimator/SEO, quote/integration routes, Offers and shared auth/sales helpers. Old portal `AdminCreateServicePage.js` / `AdminPlanProductsPage.js` are unrouted but retained until acceptance; preserve list URL/create redirect.
4. **Remaining cleanup: evidence first.** Mixed legacy branches, mail templates/catalogue/tests and schema were not blanket-approved. Re-prove callers/data use per removal -> exact approval -> backup -> checks. Three unused portal API entries remain outside approved deletions: `getPendingRenewals`, `approveRenewal`, `rejectRenewal`. Mail candidates: `sendDeveloperAssignedNotification`, `sendUpdateCompletedNotification`, `sendDeveloperAssignmentEmail`; catalogue removal affects Communication-tab rows and tests still reference the last template. Schema is last, after an approved fresh read-only inventory. Current fixed-plan save/pricing uses `servicePlan.limitScope`: keep it. Default-zero counters do not establish legacy usage. Preserve dormant socket/QR/WhatsApp systems in CODEBASE_MAP.

**Completion gate:** owner accepts sole-editor cutover and deployed discovery-to-work flow; approved cleanup passes checks; deferred items remain explicit. Next plan versions should cover unresolved findings/new owner needs, not rebuild completed functionality.

## 5. Production decisions and limits

- **Q5 confirmed:** retain all eight old monthly bills/model/payment handling; leave three overdue statuses unchanged. Only obsolete creation/renewal code was approved for removal and removed locally. No automatic cancellation or migration to regular invoices.
- **Historical inventory (27 Oct, not rechecked):** 30 project + 8 service orders, zero legacy-candidate orders/products; five service orders lack `serviceCyclePrice`, so keep snapshot renewal-price fallback. Classify by own `isServicePlan`/`isWebsiteProject` flags. No conversion script without fresh evidence.
- **Live settings pending:** `scripts/applyLivePlanSettings.js`, owner-authorized dry run -> JSON backup -> apply -> idempotency check. Intended: Website Updates/Website Features categories; Starter fixed 1490/4336/8493/16450 with monthly allowance x cycle months; Single Page Adition fixed one-time/90 days; Live Chat fixed. Keep uncategorized fallback until application confirmed.
- **Separate decisions:** verify Render `ADMIN_DASHBOARD_URL=https://portal.merasoftware.com`; `ENABLE_CRONS` was absent on 27 Oct despite a contrary code comment. B11 cron enabling; B12 wallet pay-later invoice-paid without cycle settlement; order `6a90417d77eae0db8156833d` allowance 1 -> 3; Live Chat placement; Adition rename. Per-client price overrides deferred. Do not change financial policy during UI cleanup.
- Production: `https://portal.merasoftware.com`, `https://api.merasoftware.com`, `https://www.merasoftware.com`. Live reads/writes and commit/push/deploy need owner authorization. Audit entry: `scripts/readOnlyAuditFlexiblePlans.js`, inspect write guard first. Backend `.env` targets development; production credentials were stored in `.env.portfolio.local`. Never print secrets, overwrite env files or run production commands from these notes alone.

## 6. Verification

Latest independent review, 28 Oct: no harmful deletion/broken remaining caller found; fresh backend **336/336**, website **42/42**, both actual category-editor browser proofs pass. Portal helper tests **7/7**, final-tree production build and tracked website types passed before review; no app code changed during review/closure.

Separate old-bill fixture proof: admin read/settlement works, customer mark-paid denied, all eight records retained, other overdue bills/current service unchanged, sequential retry adds no duplicate receipt. This does not prove concurrent payment atomicity, live bill state or real provider delivery.

Run appropriate checks after code changes from each repo root:

```powershell
# backend
node --test tests/*.test.js
# portal
node --test tests/admin-plan-form.test.mjs tests/customer-plan-flow.test.mjs
npm run build
# website: baseline 33 + plans 9
node --conditions=react-server --import tsx --test tests/package-pages.test.ts tests/offer-packages.test.ts tests/offers.test.ts tests/offer-quote.test.ts tests/session.test.ts tests/page-content.test.ts tests/public-plans.test.ts tests/service-plans.test.ts
```

Focused backend tests: `tests/{planCategories,planCatalogue,customerPlanCatalogue,cronFirstRunPreview,flexiblePlansAudit}.test.js`. Browser harnesses use actual UI/controllers with fixture databases; customer purchases/providers are mocked. They do not replace deployed shell/provider acceptance.

Known tooling limits: CRA runner lacks `@testing-library/jest-dom`; do not claim it passes. Portal build has existing unrelated warnings. Website standard `npx tsc --noEmit -p .` can hit stale ignored `.next-build/types/validator.ts` referencing a removed campaign page. Tracked source/tests passed with external `backup/merasoftware/work36-plans-stage1/tsconfig.tracked.json`. A local Next workStore build error was also previously observed. Report tooling limits separately; no source/tsconfig workaround was introduced.

## 7. Backups and maintenance

Absolute base: `E:\Allprojects\backup`; paths below are relative. Rollback copies stay outside repos.

| Purpose | Location |
|---|---|
| Admin/customer implementation | backend `work26-plans-stage1` / `work27-plans-stage2`; frontend `work15-plans-stage1` / `work16-plans-stage2`; merasoftware `work36-plans-stage1` / `work38-plans-stage2` |
| Category correction/mock cleanup | backend `work28-plans-combined`; frontend `work17-plans-combined`; merasoftware `work41-plans-combined` |
| Approved C/D/F deletions | each repo's `work-stage3-cdf-approved` (prior files and verification logs) |
| Latest independent evidence | backend `work29-plans-review/{backend-tests.log,old-bill-proof.cjs,old-bill-proof.log}`; frontend `work18-plans-review/{category-browser.log,category-review.cjs,category-review.log}`; merasoftware `work42-plans-review/website-tests.log` |
| Reusable browser harnesses | frontend `work15-plans-stage1/browser-check.cjs`, `work16-plans-stage2/browser-check.cjs`, `work17-plans-combined/category-browser.cjs`; review harness also reproduces draft-warning gap |
| Full doc before this closure | merasoftware `work43-plan-closure/plan.md` |

Next numbered backup candidates: backend work30, frontend work19, merasoftware work44; verify availability. Back up affected files before first change. Completed deletion approvals do not authorize other candidates. Preserve customer history and unrelated changes.

After meaningful work, replace affected status, next action, owners, checks/evidence and gates here; update code maps when facts change. Distinguish implemented, locally verified, committed, deployed and owner accepted. Keep one current explanation; do not append completed checklists, chat history or a parallel plan. Next agent resumes at section 4, item 1.

## 8. Working plan: saved customer plans and checkpoint communication

Status: requested by owner on 28 Oct 2026; planned, not implemented or deployed. This section is the current entry point for this initiative; section 4 remains the backlog for the earlier catalogue initiative. Scope is documentation now; implementation follows this plan. Backup before this update: `E:\Allprojects\backup\merasoftware\work44-plan-communication\plan.md`.

### 8.1 Required customer behavior

- Browsing a card or merely opening a builder creates no unfinished job and sends no reminder. An explicit Continue/Choose action after a valid customization saves an authenticated customer's draft on the backend, including plan ID, purchase type, tenure, files, updates, release mode and linked project/offer context where relevant.
- Save before opening payment. Subsequent meaningful edits update that draft. An authenticated customer has one open customer-plan draft across standalone and project Add-a-Service surfaces; unrelated project/service orders are not blocked. Enforce this server-side, including concurrent tabs, and allow idempotent retries.
- On return, show the saved pending plan with its configuration and current checkpoint. On attempting a new customization, require Resume, Close or Delete for the old draft. Resume restores inputs; Close archives the draft and stops reminders; Delete removes the resumable draft and stops reminders without deleting any order, invoice or payment history. Deletion after financial submission is not a draft action.
- Guests may retain local choices through login; create the account-owned server draft only after authentication. No anonymous WhatsApp reminder or identity inferred from browsing. Never trust a URL or browser storage to identify another customer's draft.
- Requote on resume and before purchase through existing backend pricing. A saved estimate is not a frozen purchase price. If the catalogue, offer, eligibility or price changed, show the difference and require acceptance before payment. Unavailable plans remain understandable and closable, with no payment CTA.
- Once an order/payment submission exists, return the customer to that record rather than creating another purchase. Draft resolution must not force deletion of an order or conceal a pending verification.

### 8.2 State and checkpoint ownership

Backend owns durable draft/checkpoint state; React owns presentation. Proposed draft lifecycle: `configured -> payment_pending -> converted`; `closed` and `deleted` are terminal alternatives before conversion. Payment-submitted/approved/rejected and plan activation/use come from existing transactions, invoices, orders and upload history, not duplicate payment fields in a draft.

| Checkpoint | Durable trigger | Message/action |
|---|---|---|
| Configured, not continued | Explicit choice saved; inactivity threshold elapsed | Unfinished-plan reminder; resume draft |
| Payment opened, not submitted | Checkout successfully opened; no submitted/paid payment; inactivity threshold elapsed | Payment-pending reminder; return to checkout |
| UPI reference submitted | Payment verification request persisted successfully | Details received, verification pending; stop checkout reminders |
| Payment rejected | Existing admin rejection committed | Reason and correction/retry action; no false activation |
| Payment approved / wallet paid | Financial settlement committed | Activation only if plan is actually active; otherwise accurate waiting status |
| Plan active | Existing activation transition | Plan-started confirmation once; do not duplicate approval confirmation |
| Upload submitted / in progress / done / rejected | Existing upload and status-history transitions | Reuse current event path; shorten templates and expose actual work status |
| No-upload work update | Existing work-update record | Short client-facing note and plan link |
| Next cycle due / paused | Renewal invoice and lifecycle transition | Amount, due date and payment link; no automatic-debit claim |
| Renewal paid and settled | Invoice paid plus service cycle settlement | Payment received, actual cycle dates and plan link |

Payment submission is not proof of received money. Never send an active-plan message while verification, project completion or cycle settlement is pending. Wallet purchase should skip verification-pending messaging. For project-dependent plans, say payment approved and activation awaits project completion. Preserve existing offer payment/access policies.

### 8.3 Communication tab and delivery

Reuse backend `helpers/emailCatalog.js`, `emailDefinitions.js`, `emailTemplates.js`, `emailController.js`, `servicePlanNotifications.js` and `models/emailControlModel.js`; reuse portal Communication UI after tracing its actual route/components. Existing system events use `sendSystemMail()` and WhatsApp mirroring. Inspect channel behavior before implementation: a WhatsApp send must have observable delivery/failure, not be assumed successful because email succeeded. Do not introduce a second template/policy/history system.

Each event must appear in Communication with its checkpoint/trigger notes, editable short English template, variable descriptions, realistic dynamic preview, On/Off setting and delivery history. New event policies start Off; admin reviews and enables them. Existing policies remain unchanged. Off must be checked at dispatch, including queued retries. The owner requested per-event template verification and On/Off, not manual approval of every automatic message. Record verified template revision; editing an enabled template requires a new review before its changed copy sends.

Use customer-specific authenticated portal links from configured portal origin; links never grant access by themselves. WhatsApp is required for these checkpoints through the existing channel integration. Surface missing recipient/channel setup and delivery failure in admin history. Do not change provider settings or send real messages during implementation checks.

### 8.4 Proposed concise English template copy

These are reviewable starting templates, not installed templates. Subject/label is the event label below. Omit inapplicable lines and unresolved variables; do not show blank labels or invented data.

| Event / proposed key | Proposed message body |
|---|---|
| Saved plan reminder / `plan.draft.reminder` | Hi {{name}}, your {{plan}} setup is saved. {{selectionSummary}}. {{remainingSteps}} to finish. Continue: {{resumeLink}} |
| Payment pending / `plan.checkout.reminder` | Hi {{name}}, complete your {{plan}} purchase. {{selectionSummary}}. Due now: {{amount}}. Pay: {{paymentLink}} |
| Verification pending / `plan.payment.submitted` | Hi {{name}}, payment details submitted for {{plan}}. {{selectionSummary}}. Amount: {{amount}}. Reference: {{reference}}. Admin verification is pending. Status: {{planLink}} |
| Active / existing `plan.started` | Hi {{name}}, {{plan}} is active. {{selectionSummary}}. Paid: {{amount}}. Current cycle: {{cyclePeriod}}. Open plan: {{planLink}} |
| Approved, waiting activation / proposed `plan.activation.pending` | Hi {{name}}, payment approved for {{plan}}: {{amount}}. {{selectionSummary}}. Your plan starts after project completion. Status: {{planLink}} |
| Payment rejected / map existing event first | Hi {{name}}, payment verification for {{plan}} was unsuccessful. {{reason}}. Review and retry: {{paymentLink}} |
| Upload received / map existing event first | Hi {{name}}, update {{updateReference}} received for {{plan}}. Track: {{planLink}} |
| In progress / existing `plan.upload.in_progress` | Hi {{name}}, update {{updateReference}} for {{plan}} is in progress. Track: {{planLink}} |
| Done / existing `plan.upload.completed` | Hi {{name}}, update {{updateReference}} for {{plan}} is complete. {{note}} View: {{planLink}} |
| Rejected / existing `plan.upload.rejected` | Hi {{name}}, update {{updateReference}} for {{plan}} needs changes. {{reason}} Review: {{planLink}} |
| Work update / existing `plan.work_update` | Hi {{name}}, an update on {{plan}}: {{note}} View: {{planLink}} |
| Cycle payment due / proposed `plan.cycle.payment_due` | Hi {{name}}, {{amount}} is due for {{plan}} on {{dueDate}}. {{cyclePeriod}}. Pay: {{paymentLink}} |
| Paused / proposed `plan.cycle.paused` | Hi {{name}}, {{plan}} is paused pending payment of {{amount}}. Unused updates from the previous cycle have expired. Pay: {{paymentLink}} |
| Renewal paid / existing `plan.payment.received` | Hi {{name}}, payment received for {{plan}}: {{amount}}. {{selectionSummary}}. Current cycle: {{cyclePeriod}}. Open plan: {{planLink}} |

`selectionSummary` is a compact human-readable summary of actual chosen benefits, file/update limits, release mode, billing interval and total tenure; e.g. "6 updates per quarter, 20 files per update; quarterly billing for 12 months". Monthly-release plans must state monthly release rather than imply all quarterly updates are available immediately. One-time/non-upload/unlimited plans need appropriate wording. Draft messages use saved choices plus current quote; purchase/payment messages use bought snapshots and matching invoice/transaction values. All relevant specifications must be represented without dumping internal fields. `amount` is the amount for that checkpoint, not the full contract total. `remainingSteps` is derived from the real resumable flow, including verification where applicable; never hard-code a misleading step count. Customer-facing dates use IST and unambiguous formatting. Rejected-upload copy must not promise restored allowance unless restoration actually occurred in the same eligible cycle.

### 8.5 Scheduling and duplicate prevention

- Draft and checkout reminders require configurable inactivity delay, repeat spacing, maximum sends and retention. Exact defaults remain an owner policy decision; no invented timetable or enabled sending in this documentation change. Billing reminder offsets likewise require configuration and review.
- Keep one eligible current checkpoint. Progress, submit, payment, conversion, close or delete immediately invalidates earlier scheduled reminders. Recheck state immediately before dispatch, not only when a job is enqueued.
- Use a durable outbox/checkpoint schedule integrated with existing delivery history, with unique event/entity/revision/milestone keys, atomic claim, bounded retries and failure reconciliation. Existing comments claim once-only sending; explicitly verify concurrent behavior. A page refresh, parallel tabs, cron overlap, request retry or wallet/UPI alternative must not create duplicate drafts, payments or notifications.
- Never replay an old backlog when a policy is enabled or a worker restarts. For outstanding reminders send at most the latest eligible milestone, subject to configured age/cap. Transactional events retain an audit trail; pending deliveries must be revalidated so stale activation or status messages do not send after cancellation.
- Existing offer reminders already have invoice/offset dedupe and `cycleScope`. Establish one reminder owner per invoice; prevent offer and ordinary-plan jobs from sending overlapping payment reminders. Successful payment reminders stop even if cycle activation fails; flag the settlement failure separately.

### 8.6 Implementation order and acceptance

1. **Trace and design:** inspect backend/frontend AGENTS and current trees; map checkout/purchase/verification/rejection/activation/upload paths and Communication controls. Confirm exact draft-save CTA, existing event reuse, WhatsApp provider behavior and proposed reminder timing settings. Preserve unrelated edits; back up changed files outside repositories.
2. **Draft backend:** add minimal durable draft schema/API and one-open-draft constraint, revision checks, authenticated ownership, archive/delete semantics and conversion linkage. Reuse catalogue quote/purchase logic. Verify concurrent creation, refresh recovery, stale quote, cancelled/deleted draft, guest login and cross-user access.
3. **Portal resume UX:** wire PlanBuilder, standalone purchase and project Add-a-Service to save/restore. Add pending-plan card and Resume/Close/Delete choice before new customization. Preserve authentication/offer return flows and distinguish drafts from purchased plans. Verify on mobile and desktop.
4. **Transactional templates and admin controls:** reuse existing events; add only missing ones, dynamic value resolvers, trigger notes, preview/verification and Off defaults. Connect committed business transitions through reliable delivery scheduling. Verify initial/renewal wallet and UPI, rejected payment, delayed activation and each upload/work transition without duplicate confirmations.
5. **Reminder scheduler:** implement configured draft/checkout/billing milestones, cancellation/revalidation and retries. Wire to existing cron switch and Communication policies. Test time boundaries, payment racing a reminder, overlapping jobs, Off during retry, channel failure and no backlog burst.
6. **Billing correctness dependency:** fix renewal wallet payment so a paid invoice also settles the service cycle; verify due-date enforcement independently of scheduler timing. Current `walletPayInstant.js` invoice branch lacks `settleServiceCycle()`, and ordinary upload eligibility currently relies on active status rather than a direct current-cycle end check. Ensure expired quota cannot be consumed with cron disabled/delayed. Preserve original contracted cycle dates, lapse unused allowance, and leave historical uploads intact. Do not extend tenure from a late payment date or alter financial policy silently.
7. **Local acceptance and handoff:** focused backend lifecycle/draft/communication/concurrency tests, portal helper/build checks and browser proofs with mocked providers. Demonstrate quarterly 12-month flow: 4 of 6 consumed -> 2 lapse -> uploads blocked -> payment 7 days late -> correct next-cycle 6 updates on original dates -> fourth cycle ends without fifth invoice. Verify wallet settlement and no stale reminders. Update this document with implemented/tested/deployed distinctions.
8. **Deployment gate:** review concrete templates/settings and owner-selected timing; deploy compatible backend then portal, verify `ENABLE_CRONS` and configured portal origin. Enable messages only after admin template verification and owner-authorized live recipient/provider checks. No production writes, messages, commit/push or deployment are authorized merely by this planning request.

Completion means saved draft/resume works end to end, checkpoints render accurate customer-specific copy, admin On/Off is respected at actual send, WhatsApp delivery is observable, stale/duplicate messages are prevented, and paid renewals correctly restore dated access. Existing category/editor acceptance work remains open and must not be described as completed by this initiative.
