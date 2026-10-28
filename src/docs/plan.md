# Flexible Plans — current plan and handoff

Last verified locally: 28 Oct 2026. This file is the working SSOT for remaining work; code ownership is in §3.

## 0. Resume here

| Item | Current state |
|---|---|
| Completed | Earlier Phases 1, 2a and 2b built; deployment previously confirmed 28 Oct (not rechecked in this verification) |
| Remaining | Stage 1 deploy/owner acceptance -> Stage 2 customer selection -> Stage 3 accepted cutover/cleanup (§2) |
| Approval | Stage 1 implementation approved 28 Oct; Stages 2/3 not started |
| In progress | Stage 1 implemented and locally verified; not committed, pushed or deployed |
| Next action | Owner reviews Stage 1, commits/pushes; deploy backend -> website -> portal, then click-check portal admin Plans. Stage 2 still needs approval |
| Local changes | Stage 1 files listed below; no legacy files deleted, no production writes |
| Validation | Backend 329/329; website 42/42 (plans 9/9 rerun after revision assertion); portal form/backend 3/3; portal build passes; isolated browser checks pass. Website tracked-code types pass; normal tsc blocked by pre-existing generated validator |
| Pending production | Live settings script, environment checks, real click/purchase checks; details in §5 |

**Keep this handoff current:** after each meaningful completed step and before yielding, replace the affected facts here and in the relevant stage. Record stage/task status (not started / in progress / implemented / locally verified / deployed / owner accepted), changed files, actual checks/results, backup path, approval/blocker and exact next action. For partial work state the last completed substep and remaining files. Keep only the latest useful evidence; do not append chat history, abandoned plans, repeated status or secrets. Update relevant code maps after implementation changes their facts. Any next agent starts here, then reads only the active stage and its owners.

## 1. Working rules and final direction

- Website showcases plans/cards/estimator; portal handles admin plan/category management, customer selection/purchase, payments, uploads and work history. Portal is the eventual sole editor. Keep website editor until the portal replacement is deployed and accepted, then replace it with a portal handoff.
- One backend catalogue/database. Shared pricing, purchase, allowance and lifecycle rules stay in backend; interfaces never calculate final prices. Catalogue edits do not change bought snapshots, choices or cycle prices.
- Repos: backend (Express/Render) `E:\Allprojects\backend`; portal (CRA) `E:\Allprojects\frontend`; website (Next.js) `E:\Allprojects\merasoftware`. Verify target path, git status and applicable AGENTS instructions before edits; preserve unrelated work.
- Read only relevant references: backend `docs/QUICK_INDEX.md`; portal `src/DOCS/CODEBASE_MAP.md` §5/5a plans, §7/7a classification/uploads, §11 design, §14a protected dormant systems. Read installed Next guides in `node_modules/next/dist/docs/` before website code.
- Owner writes Hindi/Hinglish; replies/doc content in simple English. Explain -> approval -> code -> review; once a stage is approved, complete it and report once, stopping only for real decisions/gates. Safe proofs/tests/docs need no separate approval. Update this doc continuously, without waiting for 'perfect'.
- Back up each affected file before first change outside repos under `E:\Allprojects\backup\<repo>\workNN-<name>`. Last recorded next numbers: backend work26, frontend work15, merasoftware work36; verify availability before use. Previous phase backups: backend work25, frontend work14, website work35 (`plans-phase2b`).
- Exact deletion list -> owner approval -> backup -> deletion -> checks. Never commit/push/deploy without owner authorization. Production reads/writes need owner approval; no live test purchase or email without an approved action and owner-named client.
- Report actual results, what owner can click after deploy, limitations, backups and exact short `git add` / `git commit -m "Flexible Plans — Part N: ..."` lines. Owner cannot test locally. No claim of live verification from local builds.
- Plans are ongoing services; projects are separate jobs; packages remain marketing-only. No package automation or new checkout in this work.

Stage 1 backups: `backup/backend/work26-plans-stage1`, `backup/frontend/work15-plans-stage1`, `backup/merasoftware/work36-plans-stage1` (absolute base `E:\Allprojects`).

## 2. Remaining plan — three stages

Verified gaps, 28 Oct (code evidence):
- Portal `StartNewProject.js` is a flat service list with a wrong 'No projects found' empty message; website `/plans` uses category sections and `components/plans/plan-card.tsx`. Existing `PlanBuilder.js` runs in `ServicePlanDetail.js` and compact `AddServiceModal.js`; reuse it.
- `getProduct.js` returns on-sale products and `priceRange`, but no category label/description/order collection. Integration catalogue already supplies public category metadata behind a server-only bearer; do not expose that secret to portal browser code.
- Website plan links already target `/service-plan-detail/:planId`, but `ProtectedRoute.js` drops the destination except `/my-offers`; `Login.js` and `postLogin.js` likewise only honor that destination. Plan login return requires a scoped fix in Stage 2, not just testing.
- Stage 1 fixed edit concurrency: `catalogueRevision.js` filters writes/deletes by the read timestamp and produces strictly newer timestamps; plan save retains Mongoose hooks. Plan/category/lifecycle endpoints accept `expectedUpdatedAt`, sent by both active editors. A stale draft/action returns 409 with explicit reload controls. Legacy no-token callers stay compatible; already-open pre-deploy editors require refresh for full protection.
- Stage 1 admin catalogue now includes full project-link choices directly from `listProjectCategories()` and category usage; portal does not call customer-filtered categories or unrelated website sales packages.

### Stage 1 — Portal admin plan management

**Status:** implemented and locally verified 28 Oct; deployment and owner acceptance pending.

Goal: admin can manage the complete catalogue in the portal without switching to the website.
1. Inventory website manager fields/actions and map them to existing APIs; verify a portal-authorized full project-category read for optional linking (`/customer/project-categories` is filtered and is not equivalent to the website admin catalogue). Add only missing API capability proven necessary; no unrelated sales payload or new public access to admin data.
2. Build in existing admin shell/auth/tokens. Keep `/admin-panel/website-management/plans` as the manager URL unless an evidenced routing issue requires an alias; send old `/admin-panel/website-management/services/add` links into the new create flow. Update `AdminLayout.js`, `routes/adminRoutes.js`, `adminReturnNavigation.js` and `SummaryApi` consistently. Do not redesign unrelated admin navigation.
3. Provide category-grouped On sale / Hidden / Retired lists; create/edit/duplicate-as-hidden; show/hide, remove/retire, restore and existing guarded permanent-delete behavior. Category create/edit/archive/restore, usage counts, permanent keys and optional project link stay supported.
4. Match the full fixed/flexible form: descriptions, capability, timing/dependency, files/steps/rates/slabs, updates, one-time validity, supported billing/discounts, max tenure <=12 months, release options, availability. Saved and unsaved price previews come from the existing admin quote API. Remove old local price calculations from the replacement path.
5. Loading/error/retry, dirty-form protection, double-submit prevention and edit-conflict handling must work. Preserve client start-plan, payments, upload statuses and work updates.
6. Verify field round-trips, quote/save compatibility, admin access denial for other roles, lifecycle restrictions, existing orders and concurrent edit behavior. Run relevant helpers/contracts, backend suite and portal build; website tests/type check if website or shared contracts change. Website manager stays live and usable.
**Done when:** complete parity is demonstrated, checks pass, and the deployed portal manager is accepted by the owner. Production hidden test plans/actions only with approval. Report backups and exact commit lines; no automatic commit/push/deploy.

### Stage 2 — Customer plan discovery and selection

**Status:** not started; requires approval.

Goal: customer can understand, compare, choose and buy services inside the portal with the clarity of the website catalogue.
1. Replace the flat Explore Services presentation with category sections/cards based on website `/plans`: category heading/description, plan name and useful description, capability, server price range with its unit, relevant allowance/validity, and a clear choose/customize action. Use portal layout, typography, immersive/dark/light tokens and customer accent; do not paste the website shell or CSS. Keep the existing approved builder's layout/flow where it already works.
2. Reuse `StartNewProject.js` route/navigation unless inspection proves a separate route necessary. Preserve dashboard entry, direct links and Back behavior. Detail screen uses real category labels and consistent information; correct misleading text such as 'No projects found'. Verify admin category names/order reach portal customers. `/get-product` lacks category metadata: extend an appropriate customer/public catalogue response minimally; do not fetch admin catalogue or place an integration secret in browser code.
3. Reuse `PlanBuilder.js` for selection (purchase period, tenure, files, updates, allowed release mode) and the existing compact mode in project add-service. Cards may open the builder/detail; do not add a second independent estimator. Fixed plans show only applicable choices; no-upload plans show work-update benefits without upload quotas. Project-required plans are bought only through an eligible project context; preserve existing dependency/timing checks.
4. Preserve wallet/UPI/payment-offer flow, quote refresh/409 handling and existing purchase API. Never allow payment while quote is loading/invalid. Fix the confirmed login-return gap in `ProtectedRoute.js`, `Login.js`, `postLogin.js` and the required password/profile continuation paths. Allow only validated internal customer destinations, preserve `/my-offers` behavior and reject external redirect targets. Selected plan survives authentication; if carrying customized choices across screens is implemented, treat them as untrusted input and re-quote, never as a guaranteed saved price. No new checkout or renewal-policy change.
5. Website stays showcase: public cards/estimator, SEO/menu/sitemap and accurate portal links remain. Verify comparable inputs produce matching backend quotes across website, portal builder and admin preview. Hidden/retired/unavailable plans cannot be newly bought through direct URLs.
6. Verify mobile/desktop, keyboard controls, three portal themes, empty/loading/failure states, fixed/flexible and upload/no-upload plans, category fallback, login return and unavailable-plan handling. Complete customer journey: discover -> choose -> quote -> authorized purchase -> My Plan -> existing work/history. Keep an in-project add-service regression check.
**Done when:** customer can select and buy through the portal without needing the website, presentation matches the website's catalogue structure, and existing order/work behavior remains correct. Use local fixtures/mocked payments for automatic checks; real production purchases/mail only with an owner-named client and approval.

### Stage 3 — Acceptance, single-editor cutover and legacy cleanup

**Status:** not started; acceptance/deletion/Q5 gates remain.

Goal: prove the completed service workflow, then simplify code without losing customer history.
1. Verify Stage 1 and Stage 2 deployments/owner acceptance, plus portal admin -> client plan start -> customer plan/payment/upload/work-update history. Re-check website public plans and estimator against the same catalogue. Review P2e live category/settings script status (§5); its production apply remains separate approval, not a hidden part of UI migration.
2. Once portal editor is accepted, show the exact duplicate-editor deletion list and obtain approval. Website `/admin/plans` becomes an authenticated handoff link to portal; remove its editor/proxy only after dependency checks. Update website sidebar/`SALES_PAGES` without changing Offers or unrelated admin. Candidate files: manager TSX/CSS, `service-plans-server.ts`, `service-plans.ts`, `tests/service-plans.test.ts`; port relevant mapping coverage before removing it. Keep any shared dependency still used, and all public `public-plans*`, `/plans`, `/api/plan-quote`, integration routes, SEO and shared sales/auth helpers. Do not blindly delete old portal URLs; keep list entry/create redirect.
3. Q5 decision: recommend retaining the eight old monthly bills/model as historical records, with no new legacy writer. Owner must explicitly choose this or migration, and decide whether three overdue bills stay overdue or are cancelled. Until answered, do not alter those records or remove dependent readers/writers/schema. Q5 does not block Stages 1–2.
4. Execute the legacy batches below from proven zero callers, preserving dormant systems in portal `CODEBASE_MAP.md` §14a. Exact delete list -> approval -> external backup -> delete -> relevant checks. Shared feature-product hide/unhide and live service renewal/payment/upload handlers stay.
5. Schema removal last: read-only production inventory with approval, no live readers, explicit field list/approval; preserve all customer uploads, files, invoices, transactions, snapshots and histories. Default-zero fields alone do not prove legacy use. No old-order conversion script unless a fresh audit proves it needed (previous audit found zero legacy candidate orders).
6. Run backend suite, website baseline/public plans checks and type check, portal build and deployed click-check. Verify import resolution after deletion. CRA test runner is currently broken; do not call that a test pass or broaden scope to repair it without a decision. Reuse runnable helper/contract checks. Retain external backups for rollback and keep old UI until replacement acceptance; no DB migration is required for relocating the manager.
**Done when:** portal is the only plan editor, website is showcase/handoff, customer discovery-to-work flow is accepted, approved legacy batches are removed, and any owner-blocked bill/schema items are explicitly listed as remaining rather than called complete.

### Stage execution and boundaries

- Each stage starts with target paths/status, applicable instructions, current baseline and backup verification. Use §6 test commands; recorded counts are previous results, not promises. Do not rerun unaffected expensive checks for every cosmetic edit; run all required baselines at stage completion and deletion-batch gates.
- Compatible backend changes deploy first, then portal manager/customer changes; owner accepts; only then retire website editor / old endpoints. Update this single doc after completed steps and reconcile portal code map when implementation changes its facts.
- B11 cron enabling, B12 wallet pay-later settlement, old order allowance correction, Live Chat placement and spelling rename remain explicit separate owner decisions. Do not silently fix financial policy under a UI migration. If an authorized acceptance check hits one, report the actual blocker and obtain a scope decision.
- Final report per stage: user-visible outcome, what can be clicked after deployment, checks/limitations, backups, remaining decisions and exact `git add` / short commit lines. No claims of production verification from local builds alone.

### Stage 1 handoff / changed files

- Backend: `helpers/catalogueRevision.js` (new), `servicePlanCatalogue.js`, `servicePlanLifecycle.js`, `planCategories.js`, `controller/admin/planCatalogue.js`, `tests/planCatalogue.test.js`.
- Portal: `pages/AdminPlansPage.js`, `components/admin/AdminPlansManager.js` + `.module.css`, `helpers/adminPlanForm.js`, `helpers/adminPlanApi.js`, `common/index.js`, `routes/adminRoutes.js`, `DOCS/CODEBASE_MAP.md`, `tests/admin-plan-form.test.mjs` (paths under `src` except tests). List URL preserved; old add URL redirects to `?create=1`; old page files retained but unrouted. Existing AdminLayout/return-navigation paths already match and needed no edit.
- Website: `src/lib/service-plans.ts`, `src/app/admin/plans/plans-manager.tsx`, `tests/service-plans.test.ts`, this doc. Both editors carry revision tokens; removed stale flexible-visibility disabling from website form (backend already allows flexible sales). Website editor remains available.
- Checks: backend baseline 326/326 before work, final 329/329 (new stale plan/action, concurrent save, category/project-choice checks); website baseline+plans 42/42, plans 9/9 rerun with revision assertion; portal form contract 3/3 against real preview/quote helpers; portal production build passes with existing unrelated lint warnings and none in new files.
- Isolated browser harness uses actual portal manager + real authenticated admin controllers + in-memory MongoDB: fixed save/preview, stale edit conflict/reload, availability change, flexible on-sale create, category create/archive, no-upload hidden duplicate, unsold removal, dirty router navigation, 390px layout; no browser exceptions. This is not full deployed portal acceptance. Harness/screenshot in `backup/frontend/work15-plans-stage1/browser-check.cjs` / `manager-mobile.png`.
- Website standard `tsc` still hits ignored `.next-build/types/validator.ts` missing old campaign page. Tracked source/tests type-check passes using external `backup/merasoftware/work36-plans-stage1/tsconfig.tracked.json` (existing generated route declarations included, stale validator excluded). No source/tsconfig workaround committed.
- After deployment owner can open portal admin -> Services -> Plans, manage categories, create/edit/duplicate a hidden test plan, check prices and lifecycle. Production creation/removal/purchases/mail need approved actions. Confirm website editor still works; existing clients/payments/uploads remain unchanged. No production checks or financial writes performed here.

Commit commands for owner, each from its repo root (do not run automatically):

```powershell
# E:\Allprojects\backend
git add controller/admin/planCatalogue.js helpers/catalogueRevision.js helpers/planCategories.js helpers/servicePlanCatalogue.js helpers/servicePlanLifecycle.js tests/planCatalogue.test.js
git commit -m "Flexible Plans — Part 3.1: portal plan management"
# E:\Allprojects\merasoftware
git add src/app/admin/plans/plans-manager.tsx src/lib/service-plans.ts tests/service-plans.test.ts src/docs/plan.md
git commit -m "Flexible Plans — Part 3.1: safe catalogue editing"
# E:\Allprojects\frontend
git add src/components/admin/AdminPlansManager.js src/components/admin/AdminPlansManager.module.css src/helpers/adminPlanApi.js src/helpers/adminPlanForm.js src/pages/AdminPlansPage.js src/common/index.js src/routes/adminRoutes.js src/DOCS/CODEBASE_MAP.md tests/admin-plan-form.test.mjs
git commit -m "Flexible Plans — Part 3.1: portal plan manager"
```

## 3. SSOT and code entry points

All backend paths are under `E:\Allprojects\backend`.

| Concern | Owner |
|---|---|
| Plan rules (stored) | `productModel.servicePlan` |
| Saving a plan | `helpers/servicePlanCatalogue.js` `savePlan()` — website `PATCH /api/admin/plan-catalogue` and portal `POST /api/admin/services/create` both; `/update-product` refuses service plans |
| Off sale / on sale (retire, restore, purge, hide, unhide; fixed and flexible supported) | `helpers/servicePlanLifecycle.js` — website `PATCH /api/admin/plan-catalogue { action }` and the old portal routes |
| Admin price check | `PATCH /api/admin/plan-catalogue/quote` (`controller/admin/planCatalogue.js`; saved plan incl. hidden → `quoteKey`, or unsaved form settings) |
| Plan categories | `helpers/planCategories.js` over `models/servicePlanCategoryModel.js` (archive, never delete; key permanent) |
| Price + save rules + quote key | `helpers/servicePlanPricing.js` (`quoteServicePlan`, `priceRange`, `assertPricingConfig`, `planQuoteKey`, `canonical`/`planSettings`); UIs never compute a final price |
| Quote routes | `controller/order/servicePlanQuote.js`: `POST /api/customer/service-plan-quote`, `GET /api/integration/plan-catalogue`, `PATCH /api/integration/plan-catalogue/quote` |
| Purchase rule (price, term, choices, stale quote) | `helpers/servicePlanPurchase.js` `resolvePurchase()` — customer `customerCreateServicePlanOrder.js` and admin `controller/admin/servicePlanAdmin.js` |
| Tenure cap | the quote (`MAX_TENURE_MONTHS` 12, plan `maxTenureMonths`); portal `serviceTenure.js` (built) and website `public-plans.ts` only list lengths up to the plan's own `maxTenureMonths` (default 12) |
| Plan choices shown to the customer (no prices) | portal `helpers/serviceTenure.js` (builder) · website `src/lib/public-plans.ts` (estimator) — same rules; the quote re-checks every choice |
| Order creation | `servicePlanPurchase.js` `buildServicePlanOrderData()` (customer, admin, later package) |
| What was bought | `order.servicePlanSnapshot` (incl. `chosenFiles`, `chosenUpdates`, `updatesPerMonth`, `releaseMode`, `priceBreakdown`) + `order.serviceCyclePrice` (frozen) |
| Payment / invoice | existing `transactionService.js`, `paymentRecording.js`; a paid cycle → `serviceCycleSettlement.js` `settleServiceCycle()` |
| Upload allowance ("allowed right now") | `helpers/serviceAllowance.js` `uploadAllowanceNow()` / `reservationExpr()`, used by all 4 limit readers (`uploadOrderPolicy.js`, `uploadSubmission.js`, `submitUpdateRequest.js`, `externalUploadController.js`) and sent to UIs as `order.uploadAllowance` (`orderSummary.js`, `getOrderDetails.js`). Never read `portalAccessCount − used` anywhere else. `offerPaymentPolicy.js` is the offer's own allowance, not this |
| Upload status + notes + reject refund | `helpers/uploadStatus.js` `setUploadStatus()` (plan uploads only; route `POST /api/admin/uploads/:requestId/status`; auto In progress on admin zip download) |
| Upload history | `orderUploadHistory.js` (old and new; includes `statusHistory`) |
| Plan step mails | `helpers/servicePlanNotifications.js` → `emailController.js` `sendSystemMail()`; templates `emailDefinitions.js` `plan.*`; catalogue `emailCatalog.js` |
| Website server key | `helpers/integrationAuth.js` `requireIntegration()` (every `/api/integration/*`) |
| Renewal price | `serviceBillingSchedule.js` `resolveServiceRenewalPrice()` (`serviceCyclePrice`, else snapshot option) |
| Plan vs project on screen | portal `helpers/orderType.js` `isPlanItem()`; backend `order.isServicePlan` |
| Plan offers | `serviceOfferPolicy.js` (key over canonical plan settings); purchase hash includes the choices |
| Website ↔ backend | `merasoftware/src/lib/sales-catalogue-server.ts` `salesBackend()` pattern (admin cookie + `requireSalesAdmin`; public = integration bearer; GET/PATCH only). Admin UI pattern to copy: `src/app/admin/packages/packages-manager.tsx` + `src/app/api/packages/route.ts` |

## 4. Completed behavior to preserve

- Categories, fixed/flexible pricing, validated catalogue save/lifecycle, server quotes, chosen purchase snapshots, <=12-month tenure and monthly allowance release are built. Unused monthly allowance carries within the paid cycle and lapses at cycle end; one-time upload validity defaults to 90 days. Existing sold records retain their terms.
- Customer full/compact builder and wallet/UPI purchase; admin client start-plan (record payment or wallet), release mode, upload status/history and work updates are built. No unpaid admin-start mode. Renewal keeps bought choices/price; changed choices require a new purchase.
- Plan mails cover start/payment/upload progress/completion/rejection/work updates through `servicePlanNotifications.js` -> `sendSystemMail()` and `plan.*` templates/catalogue. No-upload (`send_reminders`) plans use work updates, not upload UI. Reject returns allowance once in the same cycle.
- Admin client Plans tab/details and customer plan history/cards/dashboard link are built. Legacy cleanup must preserve uploads, notes, files, bills, transactions, invoices, snapshots and dormant systems (§7).

## 5. Production facts and pending owner decisions

These are previous audit/deployment results, not freshly checked production facts. Latest recorded phase commits: backend `9623561`, website `5491aa8`, portal `147e401`. Portal URL is `https://portal.merasoftware.com`; backend `https://api.merasoftware.com`; website `https://www.merasoftware.com`.

- **P2e pending:** `backend/scripts/applyLivePlanSettings.js`: owner-authorized dry run, JSON backup, `--apply`, then idempotency check. Expected categories Website Updates/Website Features; Starter fixed 1490/4336/8493/16450 and monthly allowance x cycle months; Single Page Adition fixed one-time/90 days; Live Chat fixed. Until applied use uncategorized fallback. No implicit production write during UI migration.
- **Environment:** verify Render `ADMIN_DASHBOARD_URL=https://portal.merasoftware.com`. `ENABLE_CRONS` was absent in the 27 Oct check despite a contrary code comment; recheck before any current claim. Enabling crons is a separate decision.
- **Q5 (Stage 3 gate):** previous audit found 8 monthly bills on service orders: 5 paid/3 overdue. Recommend retain records/model as history and remove only legacy creation; owner has not selected this or migration into `invoiceModel`. Separately decide whether 3 overdue bills remain overdue or are cancelled. Do not freeze existing bill settlement/payment behavior under the label 'read-only history' without owner agreement. Preserve live payment handlers/readers either way.
- Legacy writer is `cron/autoRenewalCron.js`; service renewals use `servicePlanRenewalCron.js` + regular invoices. `monthlyInvoiceController.js` mixes legacy overdue code and live mark-paid/payment-detail/download/resend/reminder handlers: never delete whole file blindly.
- Audit 27 Oct: 38 orders (30 project/8 service), zero legacy candidate orders/products, 25 uploads; 5 service orders lack `serviceCyclePrice` (keep snapshot fallback). No old-order conversion needed unless new audit proves otherwise. Classify by own `isServicePlan` / `isWebsiteProject` flags; default-zero counters do not prove legacy use.
- Separate decisions, outside these stages unless added: B12 wallet pay-later marks invoice paid without settling cycle; B11 cron enabling; order `6a90417d77eae0db8156833d` allowance correction (1 -> 3); Live Chat placement; 'Adition' rename; per-client price overrides (previous decision: not now).
- Production audit script: `scripts/readOnlyAuditFlexiblePlans.js`, inspect write guard first. DB `merasoftware-db`, URI in backend `.env.portfolio.local`; local `.env` targets empty dev DB. Use production URI only for the approved command; never print secrets or overwrite `.env`. Live DB reads and writes require owner authorization.
- Deployment evidence: website commit status via GitHub commit status endpoint; portal fetch index and inspect referenced `static/js/main.*.js` for changed screen text. Confirm behavior with owner click-check too; bundle text alone is not end-to-end acceptance.

## 6. Verification commands and known traps

Commands run from their respective repo roots. Stage 1 results are recorded above; retain these commands for the next stage.

| Repo | Required checks / previous result |
|---|---|
| Backend | `node --test tests/*.test.js` — Stage 1 329/329 |
| Website baseline | `node --conditions=react-server --import tsx --test tests/package-pages.test.ts tests/offer-packages.test.ts tests/offers.test.ts tests/offer-quote.test.ts tests/session.test.ts tests/page-content.test.ts` — previous 33/33 |
| Website plans | `node --import tsx --test tests/public-plans.test.ts tests/service-plans.test.ts` — previous 9/9; preserve/port mapping coverage before deleting admin tests |
| Website types | `npx tsc --noEmit -p .` — tests are included in Next type checking |
| Portal | `npm run build` — previous pass; CRA tests cannot start due to pre-existing missing `@testing-library/jest-dom`; use runnable helper/contract checks plus deployed browser verification, do not claim test pass |

- Required stage/deletion checks are in §2; add meaningful contract/behavior checks for changes, not tests that mirror cosmetic implementation. Prior 901/901 builder/quote compatibility proof is historical; extend it if choice rules change.
- Portal Tailwind resolves to 3.4.17: use `bg-[rgb(var(--x)/0.1)]`, not `bg-[var(--x)]/10`; preserve portal themes. No `sed -i` on mixed line-ending files.
- Local Next build on E: has a previously observed workStore error; do not change app architecture to mask it. Stale ignored `.next-build/types/validator.ts` can also affect local types; separate generated-file issues from tracked-code errors and report limits. Custom dev build directories can modify tsconfig includes; restore unintended edits. Use relevant installed Next docs and verify deployed build separately.

## 7. Cleanup candidates — Stage 3 only; re-prove before deletion

- **Delete whole.** Backend: the 8 legacy routes listed below + `/invoices/update-overdue` once Q5 is decided + controllers `validateUpdatePlan.js`, `toggleUpdatePlan.js`, `renewMonthlyPlan.js`, `createRenewalOrder.js`, `checkPendingRenewal.js`, `checkRenewalStatus.js`, `getUserUpdatePlans.js`; `autoRenewalCron.js`; legacy scripts (`migrateLegacyPlansToServicePlan.js`, `deleteLegacyPlans.js`, `deleteLegacyOrdersBatch.js`, `deletePlanKeepOrderData.js`, `readOnlyAuditLegacyPlans.js`, `readOnlyAuditLegacyPlanOrphans.js`). Portal: `UserUpdateDashboard.js` + `/my-updates` route + `customerReturnNavigation.js` mock-route entry; `AdminCreateServicePage.js` and old `AdminPlanProductsPage.js` implementation only after Stage 3 acceptance (preserve list URL and redirect old add URL; do not blindly delete routes); dead `SummaryApi` entries.
- **Remove legacy branch only.** Portal: `orderPresentation.js`, `orderType.js`, `productCategory.js`, `PlanDetails.js`, `OrderPage.js`, `OrderDetailPage.js`, `AdminClientWorkspace.js`, `StartNewProject.js`, `ServicePlanDetail.js`, `AddServiceModal.js`, `DraftOrderCard.js`, `OrderListRow.js`, `UploadProduct.js`, `AdminEditProduct.js`, `AdminEditBanner.js`, `UploadBanner.js`, `common/index.js`. Backend: `uploadOrderPolicy.js`, `uploadSubmission.js`, `uploadType.js`, `submitUpdateRequest.js`, `orderStatusEngine.js`, `orderSummary.js`, `orderDeletePlan.js`, `deleteOrder.js`, `getOrderDetails.js`, `getUserOrder.js`, `createOrder.js`, `getAdminClients.js`, `getAdminUserWorkspace.js`, `getMyPaymentWorkspace.js`, `walletPayInstant.js`, `transactionApprovalController.js`, `paymentRecording.js`, `invoiceLifecycle.js`, `projectDuePayment.js`, `invoiceDocumentController.js`, `monthlyInvoiceController.js`, `emailController.js`, `emailDefinitions.js`, `uploadNotifications.js`, `guestCascadeDelete.js`, `projectCategories.js`, `getAdminPlanProducts.js`, `updateProduct.js`, `uploadPoduct.js`, `createServicePlan.js`, `bannerModel.js`.
- **Schema (after Q5; candidates, not blanket approval).** `productModel` legacy fields (`isWebsiteUpdate`, `validityPeriod`, `updateCount`, `isMonthlyRenewablePlan`, `yearlyPlanDuration`, `monthlyRenewalCost`, `isUnlimitedUpdates`, `isMonthlyLimitedPlan`, `monthlyUpdateLimit`, `monthlyRenewalPrice`, the `website_updates` pre-save flag) and `servicePlan.limitScope` / `manualUnit` / `manualCount` (some fixed-plan validation still uses limitScope: retain until a replacement is proven); `orderProductModel` legacy counters; `monthlyInvoiceModel` per Q5.
- **Unused mail templates (after replacement UI acceptance):** `sendDeveloperAssignedNotification`, `sendUpdateCompletedNotification`, `sendDeveloperAssignmentEmail` (no callers; replaced by the `plan.upload.*` mails). Re-prove 0 callers first.
- **Never delete:** `updaterequests`, transactions, invoices.
- **How to prove a portal file is dead** (method used for the 7 Sep 2026 deletion, CODEBASE_MAP §14a): full `src` name search, no barrel `index.js`, no `lazy()`/dynamic `import()`; after deleting, every relative import still resolves and `npm run build` passes. Backend: no route, no `require`, no cron/script start. Re-run the backend + website baselines (§6) after each deletion batch.
- **The eight legacy routes:** `/user-update-plans`, `/validate-update-plan`, `/toggle-update-plan`, `/renew-monthly-plan`, `/create-renewal`, `/check-pending-renewal`, `/user-renewal-status`, `/manual-renewal-check`. Keep `/customer/service-plan/stop-renewal`.
- **Dead SummaryApi candidates:** `adminUpdatePlans`, `updatePlanProgress`, `getUpdatePlans`, `closePlan`. Recheck across all repos before removing old backend APIs; feature-product hide/unhide stay.
- **Safe order:** dead API entries -> mock page -> unused routes/controllers -> legacy cron/overdue logic (Q5 gate) -> old admin implementations (replacement acceptance gate) -> scripts/mail templates -> one legacy branch at a time -> schema last. Removing unused mail catalogue entries also removes their Communication-tab rows; disclose this in the deletion list.
