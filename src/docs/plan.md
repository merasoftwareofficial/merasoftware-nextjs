# plan.md — Flexible Plans (working hand-over)

Single working doc for this work. Keep it current: replace wrong facts, never append correction history. Update after every step.
Last updated: 27 Oct 2026.

## 0. Now / next
- **Delivery (owner 28 Oct):** Phase 1 = all backend (P2 + P5 backend: admin start-plan route, release mode, upload status/note routes, reject gives the update back, step mails) + live-plan settings script. Phase 2a = admin UI (P3 + portal admin). Phase 2b = customer UI (P4, P5 customer, P6). Phase 3 = P7 (Q5) + P8 cleanup. Phase 1 is coded in steps P2a…, each tested + owner-reviewed, deployed together.
- **State:** P0 + P1 done and committed 27 Oct (backend `6d2026b`, portal `1f28e9f`; not deployed). Phase 1 started 28 Oct: **P2a plan categories coded + tested (6/6), awaiting owner review**, uncommitted. Backup for all Phase 1 backend files: `backup\backend\work23-plans-phase1` (original copied before a file's first change).
- **P2a (new files):** `models/servicePlanCategoryModel.js` (`key` permanent, `label`, `description`, `linkedProjectCategory`, `status` active/archived, `sortOrder`), `helpers/planCategories.js` (list, get, `requireActivePlanCategory`, usage, `savePlanCategory`; same rules as `projectCategories.js`), `controller/admin/planCategories.js` (admin checked on token + stored roles), routes `GET`/`PATCH /api/admin/plan-categories` (`routes/index.js`, after category-base-prices), `tests/planCategories.test.js`. Plans store `servicePlan.categoryKey` (field added in P2b).
- **Next:** owner reviews P2a → P2b (new `servicePlan` fields + `servicePlanPricing.js`).
- **Re-run audit:** production DB = `merasoftware-db`, URI in `backend/.env.portfolio.local` (local `.env` = `merasoftware-dev`). Run with `MONGODB_URI` set from that file for one command only; never copy it into `.env`.
- This doc is not committed yet.
- Per phase: owner approval before coding; backup every file you change first in `E:\Allprojects\backup\<repo>\workNN-<name>` (next free number in that repo's folder; never inside a repo); deploy backend → website → portal.

## Start here (next agent)
- **Repos:** backend (Express, Render, `api.merasoftware.com`) `E:\Allprojects\backend`; portal (React CRA) `E:\Allprojects\frontend`; website + admin control panel (Next.js) `E:\Allprojects\merasoftware`. All are git repos.
- **Read first, only what the phase needs:** this doc; portal `frontend/src/DOCS/CODEBASE_MAP.md` §5 (service plans), §5a (legacy), §7 (plan/project classifiers), §7a (upload kinds), §11 (UI design system), §14a (dormant subsystems: never delete what is listed there); backend `docs/QUICK_INDEX.md`; website `AGENTS.md` (the Next.js version has breaking changes: read `node_modules/next/dist/docs/` before website code).
- **Owner working rules:**
  - Reply in simple Hinglish.
  - Explain, then get approval, then code, then ask for review. After the owner says "perfect", update the docs without asking.
  - Evidence, not assumptions; prove a theory with a runnable test or a read-only data check.
  - Before deleting anything, show the list and ask.
  - Never commit, push or deploy without the owner.
  - Small safe work (tests, proofs, docs) needs no permission.
- **Traps:**
  - Portal compiles with Tailwind **3.4.17** (react-scripts nested) although `package.json` says v4. Use `bg-[rgb(var(--x)/0.1)]`, never `bg-[var(--x)]/10`.
  - Do not use `sed -i` on repo files (CRLF/LF mix). Edit by content.
  - Website `next build` on the E: drive throws a pre-existing workStore InvariantError. Not app code; `next dev` works.
  - Production crons are off.
  - Call the server "backend (Express, Render)" to the owner, never "portal backend".
- **Verify commands:** backend tests from `E:\Allprojects\backend` (§3); website tests from `E:\Allprojects\merasoftware` (§3); portal: `npm run build` in `E:\Allprojects\frontend` + browser check.

## 1. Owner requirements (final)
- **Package = marketing only.** It never activates anything. Admin creates manually on its behalf: one-time → **project**, recurring → **plan**. Package automation comes later (§9).
- **Project** = one big job, unlimited uploads. **Plan** = repeat or ongoing work; collects client data through the portal upload system.
- **Per plan the admin sets:** name, description, **plan category**, files per update (min/max, ≤ 100), **cost per file** (+ optional cheaper slabs), updates per month range, purchase options (one-time and/or monthly / quarterly / 6 months / yearly, each with a discount %), **max length ≤ 12 months**.
- **Plan categories:** a list separate from project categories. Create inline ("Online Promotions"). Optional link to a project category. Many plans per category.
- **Quota:** quarterly × 2/month = **6 at once** (default). Monthly release is an admin switch per plan or per order; the customer gets the choice only if the admin allows it.
- **Remove everything that does not work:** the whole legacy update-plan system, the mock `/my-updates`, multi-year options, the portal plan form + list (after the website versions are live). Portal must get lighter.
- **Old customer work stays viewable**: when, what, files, bills, payments. Read-only, no new updates.
- **Placement:** website = marketing (public plans page, cards, range, estimator, no buying). Portal = builder, payment, quota, uploads. Plan catalogue admin (list, form, categories) = **website admin**. "Start plan for client" = **portal client screen** (until that screen moves to the website).
- **Builder UI = the approved prototype** (https://claude.ai/artifact/SwwHvj74Wm1jpJWeruboS9): same layout and flow, portal tokens (immersive/dark/light + customer accent), interactive, server prices. Its auto-renew toggle becomes the length selector.

## 2. SSOT map (every change goes through these owners)
| Concern | Owner |
|---|---|
| Plan rules | `productModel.servicePlan`; edited only via new validated plan routes (never `/update-product`) |
| Plan categories | `helpers/planCategories.js` over `servicePlanCategoryModel` (archive, never delete; key permanent) |
| Price | new `backend/helpers/servicePlanPricing.js`; UIs never compute a final price |
| Quote | new `POST /api/customer/service-plan-quote` (+ public read for the website) |
| Tenure cap | `servicePlanPurchase.js` `resolveCustomerBillingSelection()`; UI reads `servicePlan.maxTenureMonths`; portal `MAX_TENURE_MONTHS` is removed |
| Order creation | `servicePlanPurchase.js` `buildServicePlanOrderData()` (customer, admin, later package) |
| What was bought | `order.servicePlanSnapshot` + `order.serviceCyclePrice` (frozen) |
| Payment / invoice | existing `transactionService.js`, `paymentRecording.js` |
| Upload allowance | Snapshot fields `portalAccessCount` / `filesLimit` + counter `serviceAccessUsedInCycle`. Today the limit is read in **5 places**: `uploadOrderPolicy.js` L25–26 (check), `uploadSubmission.js` L102–103 and `submitUpdateRequest.js` L218–225 (atomic reserve; refund L330), `externalUploadController.js` L162 (remaining count), `offerPaymentPolicy.js` L47 (offer upload limit). Monthly release (P2) adds one shared "allowed now" helper that all 5 use. Never change only one of them |
| Upload history | `orderUploadHistory.js` (old and new) |
| Renewal price | `order.serviceCyclePrice` (as `offerServiceRenewal.js` L26) |
| Plan vs project on screen | portal `helpers/orderType.js` `isPlanItem()` |
| Plan offers | `serviceOfferPolicy.js`; `quoteKey` + purchase hash must include the customer's choices |
| Website ↔ backend | `merasoftware/src/lib/sales-catalogue-server.ts` `salesBackend()` pattern (admin cookie + `requireSalesAdmin`; public = integration bearer). Admin UI pattern to copy: `src/app/admin/packages/packages-manager.tsx` + `src/app/api/packages/route.ts` |

## 3. Verified facts (27 Oct 2026)
**Current flows (reused)**
- Admin create: portal `AdminCreateServicePage.js` → `POST /api/admin/services/create` → `createServicePlan.js`. List: portal `AdminPlanProductsPage.js` → `GET /api/admin/plan-products`.
- Customer: `StartNewProject.js` (`GET /api/get-product`) → `ServicePlanDetail.js`, or in a project `AddServiceModal.js` → `POST /api/customer/service-plan-order` (`customerCreateServicePlanOrder.js`; price re-read server-side; wallet instant, UPI → admin approval). One order per purchase (no bulk route).
- Admin → client: only `POST /api/admin/clients/:customerId/create-project` (`adminCreateProjectOrder.js`; payment = record / free / deferred). No plan route.
- Packages: `backend/docs/sales-packages.md`. Showcase + admin shortcut, no checkout, independent of plans. `linkedPlanIds` is a reference only.

**Live catalogue** (public `GET https://api.merasoftware.com/api/get-product?includeRetired=true`): 7 feature_upgrades + 3 service_plan, **0 legacy products**, no multi-year options.
| Plan | planType | Capability | Purchase | Limits | Price |
|---|---|---|---|---|---|
| Live Chat Feature | website_updates | send_reminders | one_time | — | ₹2,500 |
| Single Page Adition | website_updates | upload_data | one_time | per_plan, 5 attempts, 20 files | ₹1,500 |
| Starter Update Plan | website_updates | upload_data | recurring | per_month, 1 attempt, 20 files | 1490 / 4335.9 / 8493 / 16449.600000000002 (m/q/6m/y) |

**Production audit (P0, 27 Oct 2026, `merasoftware-db`)**
- Totals: 10 products, 38 orders (30 project, 8 service), 25 updaterequests, 8 monthlyinvoices, 101 invoices, 68 transactions.
- **Legacy candidate orders = 0**, legacy products = 0 → the P7 conversion script is not needed.
- Service orders: 8 across 5 customers; status active 4 / paused 2 / expired 2; cycle none 4 / monthly 3 / quarterly 1; 4 linked to a project; 0 with offer terms. Names in orders (snapshots) include plans no longer in the catalogue: "Support Portal - Single Update", "Single Update Plan", "Website Single Section Addition", "Website Update", "Social Media Marketing".
- Tenure > 12 months: 0. Renewal price ≠ order price: 0.
- **Missing `serviceCyclePrice`: 5 orders** → the B3 catalogue fallback is still needed. Fractional `serviceCyclePrice`: 1.
- B6 affects 1 live order: `6a90417d77eae0db8156833d` ("per month" plan on a longer cycle).
- Service order of legacy origin: `692ac68013c56107623619c9`.
- **`monthlyinvoices`: all 8 belong to service orders** (paid 5, overdue 3), not to legacy orders. So `monthlyInvoiceModel` / `/invoices/update-overdue` are not legacy-only. Q5 must decide this before any removal.
- updaterequests: 11 service, 14 project. Invoices: project 62, project_final 34, service_statement 4, plan_renewal 1. Fractional invoices: project 3, service_statement 3. Transactions: payment 43, renewal 5 (all service), deposit 19, refund 1.

**Plan detail page audit (27 Oct 2026, code + production read-only)**
- Admin plan detail = `AdminClientWorkspace.js` `WorkspaceDetailSubpage` with `detailLabel="Plan"`. Payments (L5472) and Progress Nodes (L5525) render only when `isProjectDetail`. A plan gets: a "Timeline" card with the **project** progress bar (`projectProgress`; 3 old service orders read 100%, the rest 0%) and an Info card with "Current Phase". No cycle, allowance, uploads or bills.
- Progress nodes are project-only: `projectNodeController.js` L33 refuses non-`isWebsiteProject` orders. 0 service orders have nodes or runs.
- Customer `PlanDetails.js`: allowance, cycle line, term left, billing statement, stop renewal, "What you have sent" (uploads via `orderUploadHistory.js`). Upload status is not shown.
- **Per-update notes / status do not exist in code today.** `updaterequests` has `status`, `assignedDeveloper`, `completedAt`, `developerNotes`, `developerMessages`, but no live code writes any of them (only `fileCleanupScheduler.js` touches the collection). Production: 25 uploads, completed 7 / pending 18. The 7 completed have `assignedDeveloper` + `completedAt` (written by removed legacy code). 0 have notes/messages. So new uploads stay "pending" for ever and the admin cannot mark one done or note it.
- Production service orders: the data for a detail page exists on the order (`servicePlanSnapshot`, cycle fields, `serviceCycleHistory` (3 orders have 1 entry), counters), plus invoices / monthly bills / transactions. "Single Update Plan" `692ac68013c56107623619c9` (legacy origin) holds 7 uploads (39 files), 5 paid + 3 overdue monthly bills, 5 renewal payments, and `usedTotal 7 > allowance 2`. "Website Update" `6a833dd4ff3d86b1e19e7a1b` is paused on an unpaid `plan_renewal`.

**Problems (fix in phase)**
| # | Problem | Location | Phase |
|---|---|---|---|
| B1 | Client Plans tab always empty (legacy-only classifier `isWebsiteUpdateOrder`). Side effect today: all 8 service orders show in the **Projects** tab, are counted as projects (L1519–1522) and are passed to `ReservedOffersPanel` (L1813). Fix = use `orderType.js` `isPlanItem()`; plan status comes from `orderState.label` (engine L235–253) | portal `AdminClientWorkspace.js` L109, L1451, L1456 | P1 |
| B2 | `activePlans` legacy-only; `plans: []` always empty; `activeOrders` also counts active service orders (`plan_active` is not excluded) | `getAdminUserWorkspace.js` L128–132, L149, L156 | P1 |
| B3 | Renewal price read from the order's snapshot `billingOptions` (catalogue copy at purchase), not `serviceCyclePrice`. 5 live orders lack `serviceCyclePrice` → keep the snapshot option as fallback | `servicePlanRenewalCron.js` L8–11 | P1 |
| B4 | Tenure cap UI-only (`MAX_TENURE_MONTHS = 36`, `serviceTenure.js` L23); backend `resolveCustomerBillingSelection()` L62–78 checks multiple only, no max | `serviceTenure.js`, `servicePlanPurchase.js`, `serviceBillingSchedule.js` L7–13 | P1 |
| B5 | Generic `/update-product` spreads body into `findByIdAndUpdate`. Still used by portal `AdminEditProduct.js` L327 + `AdminFeatureProductsPage.js` L80 (features), so it stays; it must refuse `isServicePlan` products. No service-plan edit route exists today (only create, `retireOrDeletePlan`, reactivate, purge, hide/unhide) | `updateProduct.js` L13–21 | P2 |
| B6 | Allowance resets per billing cycle; `limitScope` is a label. Live Starter Update Plan: yearly buyer gets 1 update/year | `uploadOrderPolicy.js` L25 | P2 |
| B7 | Offer `quoteKey` / purchase hash ignore customer choices | `serviceOfferPolicy.js` L10, `customerCreateServicePlanOrder.js` L182 | P2 |
| B8 | Billing prices not rounded | `createServicePlan.js` L105 | P2 |
| B9 | Customer with 1 plan + 0 projects: dashboard "Request Website Update" → mock `/my-updates` | portal `CustomerDashboard.js` L201–202 | P5 (→ `/plan-details/:orderId`) |
| B10 | Files per upload hard cap 100 | `config/uploadLimits.js` L8 | plan max ≤ 100 |
| B11 | Crons off in production (`ENABLE_CRONS` absent) → no renewals run | Render env | separate owner decision |

**Legacy system**
- Backend routes with **zero portal callers** (no `SummaryApi` use, no direct URL), in `routes/index.js`: L259 `/user-update-plans`, L320 `/validate-update-plan`, L321 `/toggle-update-plan`, L324 `/renew-monthly-plan`, L327 `/create-renewal`, L328 `/check-pending-renewal`, L329 `/user-renewal-status`, L330 `/manual-renewal-check`. **Keep** L319 `/customer/service-plan/stop-renewal` (live, service plans). L331 `/invoices/update-overdue` acts on `monthlyinvoices` only (legacy, in the mixed `monthlyInvoiceController.js`).
- `cron/autoRenewalCron.js` (imported `index.js` L10, started L30) is legacy-only: it renews `isMonthlyLimitedPlan` orders and its overdue step `invoiceLifecycle.js` `updateOverdueInvoicesAndPausePlans()` (L53) reads `monthlyinvoices` only.
- Portal `SummaryApi` entries with no backend route: `adminUpdatePlans`, `updatePlanProgress`, `getUpdatePlans`, `closePlan` (`common/index.js` L260–275).
- Old records: `updaterequests` (`updatePlanId` → order), `monthlyinvoices`, `transactions`, `invoices`. `monthlyInvoiceController.js` also hosts **live** payment-record handlers (mixed file).
- Old scripts **not usable**: `migrateLegacyPlansToServicePlan.js` (finds orders only via live legacy products = 0; resets them to active), `readOnlyAuditLegacyPlanOrphans.js` (treats `updatesUsed`/`currentMonthUpdatesUsed` as legacy, but both default to 0 on **every** order, `orderProductModel.js` L420–475), `readOnlyAuditLegacyPlans.js` (loads models, no write guard).
- Classify orders only by own flags: `isServicePlan` → service, `isWebsiteProject` → project, neither → legacy candidate.

**Baseline tests (before any coding)**
- Backend 14 suites → 175/175 pass (after P1: add `tests/servicePlansP1.test.js` → 181/181): `node --test tests/salesPricing.test.js tests/offerPaymentPolicy.test.js tests/paymentFoundation.test.js tests/uploadFlow.test.js tests/stagedUploads.test.js tests/uploadTiming.test.js tests/projectCategories.test.js tests/cronFirstRunPreview.test.js tests/adminProjectTransactions.test.js tests/projectCreateForm.test.js tests/packagePages.test.js tests/offerReservations.test.js tests/reservationRepricing.test.js tests/flexiblePlansAudit.test.js`
- Website → 33/33 pass: `node --conditions=react-server --import tsx --test tests/package-pages.test.ts tests/offer-packages.test.ts tests/offers.test.ts tests/offer-quote.test.ts tests/session.test.ts tests/page-content.test.ts`
- Portal: `react-scripts test` cannot start (`@testing-library/jest-dom` missing; pre-existing). Verify portal by build + browser until repaired (owner decision).
- Local backend `.env` = `merasoftware-dev` (empty). Production data only via owner-run read-only scripts.

## 4. Design
- **Category model:** `{ key (permanent), label, description, linkedProjectCategory?, status, sortOrder }`. Live plans are mapped by the P2e script (Q4: "Website Updates", "Website Features").
- **New `servicePlan` fields:** `categoryKey`, `pricingMode` (`fixed` | `flexible`), `files {min,max,step}`, `ratePerFile`, `slabs [{fromFile, ratePerFile}]`, `updatesPerMonth {min,max}`, `allowOneTime`, `oneTimeValidityDays`, `billingOptions` (monthly / quarterly / half_yearly / yearly only), `maxTenureMonths` (1–12), `releaseMode` (`all_at_once` | `monthly`), `customerCanChooseRelease`.
- **Price:** one update = files by rate, then slabs; one-time = update × count; cycle = update × updates/month × months × (1 − discount); whole rupees. Card range = one update at min files … max files.
- **Purchase body adds:** `files`, `updatesPerMonth`, `purchase`, `tenureMonths`, `releaseMode?`, `quoteKey`. Server checks limits + tenure ≤ max ≤ 12, prices via the helper, refuses a stale quote. Snapshot: `filesLimit = files`; `portalAccessCount` = updates × cycleMonths (recurring, all at once), updates per month (monthly release), or the number of updates bought (one-time, valid `oneTimeValidityDays` from start); `chosenFiles`, `chosenUpdatesPerMonth`, `releaseMode`, `priceBreakdown`; `serviceCyclePrice` = cycle price.
- **Monthly release:** month index from `serviceCurrentCycleStart` (no cron). Carry-over = Q1.
- **Admin start:** `POST /api/admin/clients/:customerId/service-plans` (same builder; record payment / wallet / unpaid invoice); `PATCH /api/admin/service-plans/:orderId/release-mode`.
- **Old records (P7):** new script from legacy-candidate **orders**. Dry run, JSON backup, owner approval. Writes the service shape with `servicePlanStatus: 'expired'` (`uploadOrderPolicy.js` L17 blocks uploads unless `active`), name from `orderItems`, original dates; links untouched. They show in `PlanDetails.js` service branch + `orderUploadHistory.js` with an "Old plan · Closed" badge. Skipped if P0 finds none.
- **Plans without uploads (owner requirement 28 Oct):** some plans never use the portal upload system (no upload button, no upload UI) — e.g. "we do the work, admin posts what was done". They use everything else: start, payment, messages, timeline. Model: existing `servicePlan.capability` (`upload_data` | `send_reminders`) already separates them; P2 keeps it and allows `pricingMode: fixed` without files. Their own UI (admin posts a work update → client sees it + gets the message) is built in **P5** together with plan communication.
- **Plan communication (P5, owner requirement 28 Oct):** the client must know every step. Each step sends email (WhatsApp mirrors every sent email) and shows on both plan detail pages.
  | Step | To | Today |
  |---|---|---|
  | Plan started | client | no mail for service plans (template exists, no caller) |
  | Payment done / approved | client | no mail for service plans |
  | Client uploaded data | admin + client | sent (`submitUpdateRequest.js` L295, L299) |
  | Admin downloaded data → **In progress** | client | no status writer; template "Developer assigned" unused |
  | Work done → **Done** + note | client | no status writer; template "Update completed" unused |
  | Data problem → **Rejected** + reason | client | does not exist. Rejected upload does **not** consume the update; client uploads again |
  Upload status lives on the existing `updaterequests` fields (`status`, `completedAt`, `developerMessages`); no new collection. Open: does download set In progress automatically or by button; one note per upload or a note history.
- **UI:** portal tokens only; Tailwind v3 trap `bg-[rgb(var(--x)/0.1)]`; no layout shift on focus; structure instant, only prices load; website admin form visual (non-coder).

## 5. Phases
| Phase | Scope | State |
|---|---|---|
| P0 | Read-only audit: `readOnlyAuditFlexiblePlans.js` (write guard, raw collections) + test 6/6 | Done; production run 27 Oct (§3) |
| P1 | B1, B2, B3 (snapshot fallback only when `serviceCyclePrice` is missing), B4 | Coded + tested 27 Oct; owner review pending |
| P2 | Backend: P2a categories · P2b fields + pricing helper + rounding (B8) · P2c validated create/edit + `/update-product` guard (B5) · P2d quote routes, purchase choices, snapshot, "allowed now" helper, offer key (B7) · P2e live-plan settings script | P2a coded + tested 28 Oct |
| P3 | Website admin `src/app/admin/plans`: categories, list (hide/retire/restore), create/edit | Not started |
| P4 | Portal builder: `ServicePlanDetail.js`, compact in `AddServiceModal.js`; remove `MAX_TENURE_MONTHS` | Not started |
| P5 | Portal admin "Start plan for client" + release mode; B9; **plan detail pages (admin + customer)**: plan info (choices, cycle, term, release mode, closed state), allowance per cycle/month, cycle/month timeline from `serviceCycleHistory`, per-update records (files, status, admin note) via `orderUploadHistory.js`, payments ledger | Not started |
| P6 | Website public plans page in "Pricing & Packages" (own page, not packages); SEO + sitemap | Not started |
| P7 | Q5 only (monthly bills of service orders). Old-order conversion not needed: audit found 0 legacy orders | Not started |
| P8 | Cleanup per §6, each item re-proven (callers = 0) and shown to the owner first | Not started |
Order: P1 alone; P2 before P3/P4/P5; P7 before any schema field removal.

## 6. Removal list (P8)
- **Delete whole.** Backend: the 8 legacy routes listed in §3 (not L319) + `/invoices/update-overdue` once Q5 is decided + controllers `validateUpdatePlan.js`, `toggleUpdatePlan.js`, `renewMonthlyPlan.js`, `createRenewalOrder.js`, `checkPendingRenewal.js`, `checkRenewalStatus.js`, `getUserUpdatePlans.js`; `autoRenewalCron.js`; legacy scripts (`migrateLegacyPlansToServicePlan.js`, `deleteLegacyPlans.js`, `deleteLegacyOrdersBatch.js`, `deletePlanKeepOrderData.js`, `readOnlyAuditLegacyPlans.js`, `readOnlyAuditLegacyPlanOrphans.js`, the P7 script after use). Portal: `UserUpdateDashboard.js` + `/my-updates` route + `customerReturnNavigation.js` L27; `AdminCreateServicePage.js` + route and `AdminPlanProductsPage.js` + route (after P3); dead `SummaryApi` entries.
- **Remove legacy branch only.** Portal: `orderPresentation.js`, `orderType.js`, `productCategory.js`, `PlanDetails.js`, `OrderPage.js`, `OrderDetailPage.js`, `AdminClientWorkspace.js`, `StartNewProject.js`, `ServicePlanDetail.js`, `AddServiceModal.js`, `DraftOrderCard.js`, `OrderListRow.js`, `UploadProduct.js`, `AdminEditProduct.js`, `AdminEditBanner.js`, `UploadBanner.js`, `common/index.js`. Backend: `uploadOrderPolicy.js`, `uploadSubmission.js`, `uploadType.js`, `submitUpdateRequest.js`, `orderStatusEngine.js`, `orderSummary.js`, `orderDeletePlan.js`, `deleteOrder.js`, `getOrderDetails.js`, `getUserOrder.js`, `createOrder.js`, `getAdminClients.js`, `getAdminUserWorkspace.js`, `getMyPaymentWorkspace.js`, `walletPayInstant.js`, `transactionApprovalController.js`, `paymentRecording.js`, `invoiceLifecycle.js`, `projectDuePayment.js`, `invoiceDocumentController.js`, `monthlyInvoiceController.js`, `emailController.js`, `emailDefinitions.js`, `uploadNotifications.js`, `guestCascadeDelete.js`, `projectCategories.js`, `getAdminPlanProducts.js`, `updateProduct.js`, `uploadPoduct.js`, `createServicePlan.js`, `bannerModel.js`.
- **Schema (after P7).** `productModel` legacy fields (`isWebsiteUpdate`, `validityPeriod`, `updateCount`, `isMonthlyRenewablePlan`, `yearlyPlanDuration`, `monthlyRenewalCost`, `isUnlimitedUpdates`, `isMonthlyLimitedPlan`, `monthlyUpdateLimit`, `monthlyRenewalPrice`, the `website_updates` pre-save flag) and `servicePlan.limitScope` / `manualUnit` / `manualCount`; `orderProductModel` legacy counters; `monthlyInvoiceModel` per Q5.
- **Never delete:** `updaterequests`, transactions, invoices.
- **How to prove a portal file is dead** (method used for the 7 Sep 2026 deletion, CODEBASE_MAP §14a): full `src` name search, no barrel `index.js`, no `lazy()`/dynamic `import()`; after deleting, every relative import still resolves and `npm run build` passes. Backend: no route, no `require`, no cron/script start. Re-run the backend + website baselines (§3) after each deletion batch.

## 7. Open questions (ask when the phase starts)
- **Decided 28 Oct:** Q1 monthly release: unused updates carry forward inside the paid cycle and lapse at cycle end (allowed now = per month × months started − used; no cron). Q3 `oneTimeValidityDays` default 90, admin can change per plan; already-sold orders keep their own validity. Q4 settings (applied in P2/P3, not before): Starter Update Plan stays fixed, same price, prices rounded (4336 / 8493 / 16450), allowance = updates per month × cycle months; Single Page Adition fixed, one-time, 90 days (rename = owner); categories "Website Updates" (those two) and "Website Features" (Live Chat). Live Chat handling: owner to decide.
- Open: order `6a90417d77eae0db8156833d` (quarterly Starter, got 1 update instead of 3): correct its allowance? Production write, owner approval.
- Q1 Monthly release: unused updates lost at month end or carried forward? (P2) — answered above
- Q2 May the admin change the price for one client? (P5)
- Q3 Default `oneTimeValidityDays`? (P2)
- Q4 After P0: new settings for the 3 live plans; "Live Chat Feature" (reminder-only) category? (P2)
- Q6 Prototype "Next period" card says the customer can change files/updates before renewal. With the fixed length selector, is that wanted (change at renewal = new quote), or not? (P2/P5)
- Q7 Prototype "My Plans" shows one progress card per update ("Update 2 of 2 · 7/20 files"). Build this in `PlanDetails.js`? (P5)
- Q5 Monthly bills (8, all on service orders, 3 overdue): keep `monthlyInvoiceModel` read-only or move into `invoiceModel`? (P7)

## 8. Packages vs plans
Plans get their own website page in the same menu, never inside the package catalogue. Do not build a "Monthly Packages" page for work that plans cover.

## 9. Later (not in scope)
Package setting "runs as Project / Plan (pick plan)"; client screen "Start from package" pre-fills the project or plan form; admin confirms. Card price from the plan quote route. Already prepared by: one plan-start path, one price formula, permanent plan IDs.
