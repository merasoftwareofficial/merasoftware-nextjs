# plan.md — Flexible Plans (working hand-over)

Single working doc for this work. Keep it current: replace wrong facts, never append correction history. Update after every step.
Last updated: 28 Oct 2026 (end of day: Phase 1 + 2a pushed; next = §0.1 then Phase 2b).

## 0. Now / next
- **Delivery (owner 28 Oct):** 4 phases. **Phase 1** = all backend (P2 + P5 backend + P2e script). **Phase 2a** = admin UI (P3 website admin + P5 portal admin). **Phase 2b** = customer UI (P4 builder, P5 customer plan page, B9, P6 public page). **Phase 3** = P7 (Q5) + P8 cleanup. Build each approved phase in one go and report once (stop only for real owner decisions).
- **State (28 Oct, end of day):** Phase 1 + Phase 2a are **committed and pushed** (backend `e9911c6`, website `b34e0f4`, portal `3ff20b5`, all "Flexible Plans — Phase 2"; earlier: backend `6d2026b` … `ce0c3ea`, portal `1f28e9f`). All three repos clean on `main`. **Backend is live** (checked: `PATCH /api/admin/plan-catalogue/quote` and `GET /api/integration/plan-catalogue` answer 401 = route exists). **Website deploy of `b34e0f4` FAILED on Vercel** (GitHub commit status "failure"; `/admin/plans` → 404). Cause proven by local `next build`: "Failed to type check" in `tests/service-plans.test.ts` (tsconfig includes `**/*.ts`, so tests are type-checked; `planBody()` returns `{ planId } | { creating }`). Fixed 28 Oct, test file only (local `planBody` wrapper casts to a record): `tsc` on tracked files → 0 errors, test 4/4. **Not committed yet** (backup `merasoftware\work34-plans-deploy-fix`). The local build still stops on the stale, git-ignored `.next-build/types/validator.ts` (23 Oct, points to a removed `campaign/packages` page); Vercel does not have that folder. Portal deploy not checked (static hosting).
- **Tests now:** backend `node --test tests/*.test.js` (from `E:\Allprojects\backend`) → 324/324. Website `node --import tsx --test tests/service-plans.test.ts` → 4/4 and the baseline set (§3 Tests) → 33/33. Portal: `npm run build` passes; `react-scripts test` cannot start (pre-existing). No browser check of the Phase 2a screens yet.
- **Next free backup numbers:** backend work25, frontend work14, merasoftware work35 (always `E:\Allprojects\backup\<repo>\workNN-<name>`, never inside a repo).

### 0.1 Owner-gated, do first (ask "haan" for each production write)
1. **Confirm deploys:** owner commits + pushes the test fix (`tests/service-plans.test.ts`, see State); then the Vercel status of that commit must be "success" (`https://api.github.com/repos/merasoftwareofficial/merasoftware-nextjs/commits/<sha>/status`) and `/admin/plans` must give a login redirect, not 404. Portal admin shows the new plan page. Do not debug the local `next build` workStore error (§ Traps).
2. **Run P2e on production** after the owner's "haan": `scripts/applyLivePlanSettings.js` — dry run first (write guard), then `--apply` (JSON backup to `E:\Allprojects\backup\backend\live-plan-settings\`; a second run must say nothing to do). Expected (dry run 28 Oct): create categories `website_updates` "Website Updates" + `website_features` "Website Features"; Starter Update Plan → `website_updates`, fixed, billing 1490 / 4336 / 8493 / 16450, max 12 months; Single Page Adition → `website_updates`, fixed, one-time, 90 days; Live Chat Feature → `website_features`, fixed. Production DB access: see "Re-run audit" below. Re-checked 28 Oct without DB access: `planChanges()` run on the live public `/api/get-product` data gives exactly these changes; afterwards every live plan still quotes (Starter 1490 / 4336 / 8493 / 16450 for 1 / 3 / 6 / 12 updates per cycle; Single Page 1500, 5 updates, 90 days; Live Chat 2500) and the old portal body still buys. The agent's own production run was blocked by the tool safety check, so the owner runs the dry run in PowerShell from `E:\Allprojects\backend` (URI from `.env.portfolio.local`). Until this runs, the website Plans page shows the 3 live plans under "No category yet" and asks for a category on edit.
3. **Render env:** `ADMIN_DASHBOARD_URL` must be the portal address (plan mails link to `<it>/plan-details/:orderId`; empty → link line dropped). Local `.env` has it; Render not checked.
4. **Click-check Phase 2a with the owner** (owner cannot test locally): website admin → Plans (list, categories, create a hidden test plan, price check, remove it); portal admin → a client → Plans tab → open a plan (details, payments, Uploaded Data buttons) and "Start plan for client" (only with a real or test client the owner names — it creates an order + invoice + payment).
5. Open owner questions that block nothing in 2b: order `6a90417d77eae0db8156833d` allowance fix, Live Chat placement, "Adition" rename, B11 crons, B12 (§7).

### 0.2 Next = Phase 2b (customer UI) — get the owner's "haan", then build it all
Ask Q6 and Q7 (§7) at the start; they change what the customer plan page shows.
- **Turn flexible plans on sale (backend):** `helpers/servicePlanLifecycle.js` `FLEXIBLE_PLANS_ON_SALE = true` — only in the same release as the new builder. Update `tests/planCatalogue.test.js` "flexible plans stay hidden…" (it asserts the switch is off) and keep the rest. Deploy order stays backend → website → portal, so ship the switch with or after the portal builder, never before (old pages cannot sell a flexible plan).
- **P4 portal builder** (approved prototype https://claude.ai/artifact/SwwHvj74Wm1jpJWeruboS9 — same layout and flow, portal tokens immersive/dark/light + customer accent; its auto-renew toggle becomes the length selector):
  - `pages/ServicePlanDetail.js` (today: billing-period + tenure selects showing `option.pricePerCycle` L418–419, sends `selectedBillingCycle` + `tenureMonths` L164–165 to `createServicePlanOrder`). Replace with: purchase choice, length (1 … plan `maxTenureMonths`, multiples of the period), files + updates for flexible, release choice when `customerCanChooseRelease`; price only from `POST /api/customer/service-plan-quote` (add a `SummaryApi` entry, none exists); buy with the new body `{ planId, purchase, tenureMonths, files, updates, releaseMode, quoteKey }` (409 = price changed → re-quote and tell the customer).
  - `components/AddServiceModal.js` (compact version inside a project; same quote/purchase; today uses `buildTenureOptions` L527).
  - `helpers/serviceTenure.js` `MAX_TENURE_MONTHS = 12` / `buildTenureOptions` — replace with the plan's own `maxTenureMonths`; remove the constant once both callers are gone.
  - Card prices on `StartNewProject.js` lists: use the plan's `priceRange`, never the stored `pricePerCycle`. **Gap (checked 28 Oct):** the portal loads plans from `GET /api/get-product`, which has no `priceRange`; the only route with it is the website-only `GET /api/integration/plan-catalogue`. Add `priceRange` for service plans to the portal's list (backend, through `servicePlanPricing.js` `priceRange()`) as part of 2b.
  - Show "valid N days" only for upload plans: the quote returns `validityDays: 90` for every one-time plan (Live Chat too), but the order uses it only for `capability: upload_data` (`servicePlanPurchase.js` L107).
- **P5 customer plan page** `pages/PlanDetails.js`: already reads `uploadAllowance` (Phase 2a). Add: `showStatusHistory` on its two `UploadedDataList` uses (L647, L755) so the client sees In progress / Done / Rejected + notes; next-release date (`uploadAllowance.nextReleaseAt`) for monthly release; what was bought (snapshot `chosenFiles`, `updatesPerMonth`, `priceBreakdown`); "Cycle limit used" badge must say "Next updates open on …" when `nextReleaseAt` is set. Q7 decides the per-update progress cards.
- **Plans without uploads (owner requirement §4, not built yet, no backend):** for `capability: send_reminders` plans the admin posts a work update (what was done) → the client sees it on the plan page and gets a mail (WhatsApp mirrors). Needs a small backend first (store the update on the order or a new collection, `plan.work_update` mail through `servicePlanNotifications.js`), an admin box in `PlanOverviewPanel` and a list on `PlanDetails.js`. Confirm with the owner at the start of 2b that it belongs in 2b.
- **B9:** `pages/CustomerDashboard.js` L202 — 1 plan + 0 projects sends "Request Website Update" to the mock `/my-updates`; point it to `/plan-details/:orderId`.
- **P6 website public plans page** (marketing only, no buying; SEO + sitemap by default): data from `salesBackend(false, undefined, "plan-catalogue")` (→ `GET /api/integration/plan-catalogue`: plans on sale + active categories, `publicPlan()` shape in `controller/order/servicePlanQuote.js`); estimator via `salesBackend(false, body, "plan-catalogue/quote")` through a website API route (UIs never price). Own page in the "Pricing & Packages" menu, not inside packages (§8). Pattern: `src/app/packages/[slug]/page.tsx`, `src/lib/package-pages.ts`, menu `src/components/nav-dropdown.tsx` / `mobile-menu.tsx` / `site-header.tsx`, sitemap `src/app/sitemap.ts` (`packagePageEntries`, L114), Page SEO entry.
- **Verify:** backend + website tests (§3), portal `npm run build`, then say plainly what the owner can click after deploy.

### 0.3 Then Phase 3
Q5 (monthly bills of service orders) first, then P8 cleanup per §6 — every item re-proven (callers = 0) and the list shown to the owner before deleting. After P3 is live, the old portal plan form + list (`AdminCreateServicePage.js`, `AdminPlanProductsPage.js`) are on the removal list; the 5 old plan routes they call already use `servicePlanLifecycle.js`.

## 0a. What is built (reference; do not rebuild)
- **P2a categories:** `models/servicePlanCategoryModel.js` (`key` permanent, `label`, `description`, `linkedProjectCategory`, `status` active/archived, `sortOrder`), `helpers/planCategories.js` (same rules as `projectCategories.js`), `controller/admin/planCategories.js` (admin checked on token + stored roles), `GET`/`PATCH /api/admin/plan-categories`. Plans store `servicePlan.categoryKey`.
- **P2b pricing:** `productModel.servicePlan` §4 fields (optional). `helpers/servicePlanPricing.js`: `quoteServicePlan()` (the one quote, throws 400 on anything not allowed), `updatePriceForFiles()` (marginal slabs), `priceRange()`, `assertPricingConfig()`, `cyclePriceFromMonthly()`, `planQuoteKey()`, `canonical()`/`planSettings()`. A plan without `pricingMode` is fixed; fixed `per_month` allowance = count × cycle months (new purchases only). B8 rounding. `serviceOfferPolicy.js` hashes canonical plan settings (offer quotes from before the deploy need one refresh).
- **P2c saving:** `helpers/servicePlanCatalogue.js` `savePlan()` (whitelist, category required unless `requireCategory: false`, fixed + flexible rules, list price = cheapest start, keeps old validity fields; orders untouched), `listPlanCatalogue()` (rows: `priceRange`, `retired`, `canBeOnSale`), `previewPlan()` (unsaved form → plan object, no save). `GET`/`PATCH /api/admin/plan-catalogue`. Portal `POST /api/admin/services/create` uses `savePlan(…, { requireCategory: false })`. B5: `/update-product` refuses service plans.
- **P2d allowance + purchase:** `helpers/serviceAllowance.js` `uploadAllowanceNow()` / `reservationExpr()` (monthly release from `serviceCurrentCycleStart`, carry-forward inside the cycle, no cron) used by the 4 limit readers and sent to UIs as `order.uploadAllowance` (`orderSummary.js`, `getOrderDetails.js` incl. `linkedServices`). `servicePlanPurchase.js` `resolvePurchase()` (customer + admin; flexible needs `quoteKey`, stale → 409; old `selectedBillingCycle` body still accepted) and `buildServicePlanOrderData()` (snapshot: `categoryKey`, `pricingMode`, `chosenFiles`, `chosenUpdates`, `updatesPerMonth`, `releaseMode`, `oneTimeValidityDays`, `priceBreakdown`; one-time upload plan → 90 days). Quote routes in `controller/order/servicePlanQuote.js`: `POST /api/customer/service-plan-quote` (plans on sale only), `GET /api/integration/plan-catalogue`, `PATCH /api/integration/plan-catalogue/quote` (bearer, `helpers/integrationAuth.js`).
- **P5 backend:** `controller/admin/servicePlanAdmin.js`: `POST /api/admin/clients/:customerId/service-plans` (record payment with evidence or wallet; order + invoice + payment in one transaction, then `settleServiceCycle()`; no unpaid mode until B12), `PATCH /api/admin/service-plans/:orderId/release-mode`, `POST /api/admin/uploads/:requestId/status` → `helpers/uploadStatus.js` (plan uploads only, 422 otherwise; pending → in_progress → completed / rejected with reason; `statusHistory[]`; reject gives the update back once, same cycle; admin zip download sets In progress for plan uploads). `orderUploadHistory.js` rows: `isPlanUpload`, `statusHistory`, `completedAt`, `allowanceReturned`.
- **Plan mails:** `helpers/servicePlanNotifications.js` → `emailController.js` `sendSystemMail()`: `plan.started` (once, `serviceStartNotifiedAt`), `plan.payment.received`, `plan.upload.in_progress|completed|rejected` (plans only). Templates `emailDefinitions.js`, catalogue `emailCatalog.js` (SYSTEM_TRIGGERED, section Plans; On/Off policy; WhatsApp mirrors).
- **P2e script:** `scripts/applyLivePlanSettings.js` (see 0.1).
- **Phase 2a backend:** `helpers/servicePlanLifecycle.js` = retire / restore / purge / hide / unhide for the website (`PATCH /api/admin/plan-catalogue { action, planId }`, plans only) and the old portal routes (`controller/product/retireOrDeletePlan.js`, `reactivatePlan.js`, `purgePlan.js`, `hideProduct.js`, `unhideProduct.js` are thin callers; same messages/status codes), plus `FLEXIBLE_PLANS_ON_SALE = false` (savePlan refuses visible flexible, unhide refuses, restore keeps hidden). Admin quote `PATCH /api/admin/plan-catalogue/quote` (`controller/admin/planCatalogue.js` `quotePlanController`): `{ planId, …choice }` → quote + `quoteKey` (hidden plans too, not retired/archived); `{ settings, …choice }` → quote of unsaved form settings, no key.
- **Phase 2a website:** `/admin/plans` (`src/app/admin/plans/page.tsx`, `plans-manager.tsx`, `.module.css` on admin `--pn-*` tokens): plans grouped by category (On sale / Hidden / Retired; Edit, Duplicate, Show/Hide, Remove, Restore, Delete forever), plan categories panel, visual form for fixed + flexible with a live portal price check. `src/app/api/plans/route.ts` (GET; PATCH `{ target: plan | category | quote }`), `src/lib/service-plans.ts` (form ↔ body, labels; no prices; tested by `tests/service-plans.test.ts`), `src/lib/service-plans-server.ts`. Sidebar "Plans" (Business), shown only with the portal admin role (`admin-layout.tsx` `SALES_PAGES`).
- **Phase 2a portal:** `components/admin/AdminPlanPanels.js` — `PlanOverviewPanel` (what was bought, term, "open right now", release-mode switch, periods from `serviceCycleHistory`) and `StartPlanForClient` (plan list incl. hidden, admin quote, record payment or wallet). `AdminClientWorkspace.js` plan detail shows these + the Payments ledger (now projects and plans) instead of the project progress bar; Plans tab has "Start plan for client"; status changes refresh uploads and the plan. `UploadedDataList.js` (shared with customer pages): `showStatusHistory`, admin `onSetStatus` buttons on `isPlanUpload` rows; `ClientSubmissionsPanel.js` passes them. `orderPresentation.js` `getItemSummary` + `PlanDetails.js` read `uploadAllowance`. `SummaryApi`: `adminPlanCatalogue`, `adminPlanQuote`, `adminStartPlanForClient`, `adminPlanReleaseMode`, `adminUploadStatus`.
- **Owner decisions behind Phase 2a (28 Oct):** admin quote covers hidden + unsaved plans; upload status is for plan uploads only (backend-enforced); flexible plans stay hidden until 2b; Q2 (per-client price) not now.
- **Backups of earlier steps:** backend `work22-plans-p1`, `work23-plans-phase1`, `work24-plans-phase2a`; frontend `work12-plans-p1`, `work13-plans-phase2a`; merasoftware `work32-plans-phase2a`, `work33-plans-handover`. Delete only with the owner.

### Working notes
- **Re-run audit / production access:** production DB = `merasoftware-db`, URI in `backend/.env.portfolio.local` (local `.env` = `merasoftware-dev`, empty). Run with `MONGODB_URI` set from that file for one command only; never copy it into `.env`. Every production read or write needs the owner's approval each time.
- Per phase: owner approval before coding; back up every file before its first change; deploy backend → website → portal; the owner commits and pushes.

## Start here (next agent)
- **Repos:** backend (Express, Render, `api.merasoftware.com`) `E:\Allprojects\backend`; portal (React CRA) `E:\Allprojects\frontend`; website + admin control panel (Next.js) `E:\Allprojects\merasoftware`. All are git repos.
- **Read first, only what the phase needs:** this doc; portal `frontend/src/DOCS/CODEBASE_MAP.md` §5 (service plans), §5a (legacy), §7 (plan/project classifiers), §7a (upload kinds), §11 (UI design system), §14a (dormant subsystems: never delete what is listed there); backend `docs/QUICK_INDEX.md`; website `AGENTS.md` (the Next.js version has breaking changes: read `node_modules/next/dist/docs/` before website code).
- **Owner working rules:**
  - The owner writes in Hindi/Hinglish; reply and write all content in simple English (owner, 28 Oct).
  - Explain, then get approval, then code, then ask for review. After the owner says "perfect", update the docs without asking.
  - Evidence, not assumptions; prove a theory with a runnable test or a read-only data check.
  - Before deleting anything, show the list and ask.
  - Never commit, push or deploy without the owner.
  - Small safe work (tests, proofs, docs) needs no permission.
  - Once a phase is approved, build the whole phase and report once, in simple non-technical words, with the exact `git add` / `git commit -m "Flexible Plans — Part N: …"` lines (one short line; the owner commits and pushes).
  - The owner cannot test locally: say plainly what can be clicked after a deploy, and that backend-only work has nothing to click.
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
All backend paths are under `E:\Allprojects\backend`.

| Concern | Owner |
|---|---|
| Plan rules (stored) | `productModel.servicePlan` |
| Saving a plan | `helpers/servicePlanCatalogue.js` `savePlan()` — website `PATCH /api/admin/plan-catalogue` and portal `POST /api/admin/services/create` both; `/update-product` refuses service plans |
| Off sale / on sale (retire, restore, purge, hide, unhide; flexible stays hidden until 2b) | `helpers/servicePlanLifecycle.js` — website `PATCH /api/admin/plan-catalogue { action }` and the old portal routes |
| Admin price check | `PATCH /api/admin/plan-catalogue/quote` (`controller/admin/planCatalogue.js`; saved plan incl. hidden → `quoteKey`, or unsaved form settings) |
| Plan categories | `helpers/planCategories.js` over `models/servicePlanCategoryModel.js` (archive, never delete; key permanent) |
| Price + save rules + quote key | `helpers/servicePlanPricing.js` (`quoteServicePlan`, `priceRange`, `assertPricingConfig`, `planQuoteKey`, `canonical`/`planSettings`); UIs never compute a final price |
| Quote routes | `controller/order/servicePlanQuote.js`: `POST /api/customer/service-plan-quote`, `GET /api/integration/plan-catalogue`, `PATCH /api/integration/plan-catalogue/quote` |
| Purchase rule (price, term, choices, stale quote) | `helpers/servicePlanPurchase.js` `resolvePurchase()` — customer `customerCreateServicePlanOrder.js` and admin `controller/admin/servicePlanAdmin.js` |
| Tenure cap | the quote (`MAX_TENURE_MONTHS` 12, plan `maxTenureMonths`); portal `serviceTenure.js` `MAX_TENURE_MONTHS = 12` only filters the list (P4 replaces it with the plan's value) |
| Order creation | `servicePlanPurchase.js` `buildServicePlanOrderData()` (customer, admin, later package) |
| What was bought | `order.servicePlanSnapshot` (incl. `chosenFiles`, `chosenUpdates`, `updatesPerMonth`, `releaseMode`, `priceBreakdown`) + `order.serviceCyclePrice` (frozen) |
| Payment / invoice | existing `transactionService.js`, `paymentRecording.js`; a paid cycle → `serviceCycleSettlement.js` `settleServiceCycle()` |
| Upload allowance ("allowed right now") | `helpers/serviceAllowance.js` `uploadAllowanceNow()` / `reservationExpr()`, used by all 4 limit readers (`uploadOrderPolicy.js`, `uploadSubmission.js`, `submitUpdateRequest.js`, `externalUploadController.js`) and sent to UIs as `order.uploadAllowance` (`orderSummary.js`, `getOrderDetails.js`). Never read `portalAccessCount − used` anywhere else. `offerPaymentPolicy.js` L47 is the offer's own allowance, not this |
| Upload status + notes + reject refund | `helpers/uploadStatus.js` `setUploadStatus()` (plan uploads only; route `POST /api/admin/uploads/:requestId/status`; auto In progress on admin zip download) |
| Upload history | `orderUploadHistory.js` (old and new; includes `statusHistory`) |
| Plan step mails | `helpers/servicePlanNotifications.js` → `emailController.js` `sendSystemMail()`; templates `emailDefinitions.js` `plan.*`; catalogue `emailCatalog.js` |
| Website server key | `helpers/integrationAuth.js` `requireIntegration()` (every `/api/integration/*`) |
| Renewal price | `serviceBillingSchedule.js` `resolveServiceRenewalPrice()` (`serviceCyclePrice`, else snapshot option) |
| Plan vs project on screen | portal `helpers/orderType.js` `isPlanItem()`; backend `order.isServicePlan` |
| Plan offers | `serviceOfferPolicy.js` (key over canonical plan settings); purchase hash includes the choices |
| Website ↔ backend | `merasoftware/src/lib/sales-catalogue-server.ts` `salesBackend()` pattern (admin cookie + `requireSalesAdmin`; public = integration bearer; GET/PATCH only). Admin UI pattern to copy: `src/app/admin/packages/packages-manager.tsx` + `src/app/api/packages/route.ts` |

## 3. Verified facts (27–28 Oct 2026)
**Current flows (after Phase 1 code)**
- Admin create: portal `AdminCreateServicePage.js` → `POST /api/admin/services/create` → `createServicePlan.js` → `savePlan()` (no category field there). List: portal `AdminPlanProductsPage.js` → `GET /api/admin/plan-products`. Retire/delete: `DELETE /api/admin/plans/:planId` (`retireOrDeletePlan.js`), reactivate, purge; hide: `/hide-product`, `/unhide-product`. New (no UI yet): `GET`/`PATCH /api/admin/plan-catalogue`, `GET`/`PATCH /api/admin/plan-categories`.
- Customer: `StartNewProject.js` (`GET /api/get-product`) → `ServicePlanDetail.js`, or in a project `AddServiceModal.js` → `POST /api/customer/service-plan-order` (`customerCreateServicePlanOrder.js` → `resolvePurchase()`; wallet instant, UPI → admin approval → `transactionApprovalController.js` → `settleServiceCycle()`). One order per purchase. The portal UI still sends the old body and has no quote / builder (P4).
- Admin → client: projects `POST /api/admin/clients/:customerId/create-project`; plans `POST /api/admin/clients/:customerId/service-plans` (record or wallet; no UI yet).
- Upload: customer → `submitUpdateRequest.js` / staged `uploadSubmission.js` (mails admin + client); admin zip `GET /api/uploads/:requestId/download` (sets In progress); status `POST /api/admin/uploads/:requestId/status`; history `GET /api/orders/:orderId/uploads`.
- Packages: `backend/docs/sales-packages.md`. Showcase + admin shortcut, no checkout, independent of plans. `linkedPlanIds` is a reference only.

**Live catalogue 27 Oct** (public `GET https://api.merasoftware.com/api/get-product?includeRetired=true`; before P2e is applied): 7 feature_upgrades + 3 service_plan, **0 legacy products**, no multi-year options.
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

**Problems** (B1–B8: fixed and pushed 28 Oct; line numbers are from before the fix)
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
| B9 | Customer with 1 plan + 0 projects: dashboard "Request Website Update" → mock `/my-updates` | portal `CustomerDashboard.js` L201–202 | open → Phase 2b (→ `/plan-details/:orderId`) |
| B10 | Files per upload hard cap 100 | `config/uploadLimits.js` L8 | plan max ≤ 100 |
| B11 | Crons off in production (`ENABLE_CRONS` absent) → no renewals run | Render env | separate owner decision |
| B12 | Paying a plan invoice later from the wallet marks the invoice paid but never settles the service cycle (`walletPayInstant.js` has no `isServicePlan` branch → no `settleServiceCycle()`), so a paused plan stays paused. Found 28 Oct, not fixed | `walletPayInstant.js` L92–150 | owner decision (needed before an admin "start unpaid" mode) |

**Legacy system**
- Backend routes with **zero portal callers** (no `SummaryApi` use, no direct URL), in `routes/index.js`: L259 `/user-update-plans`, L320 `/validate-update-plan`, L321 `/toggle-update-plan`, L324 `/renew-monthly-plan`, L327 `/create-renewal`, L328 `/check-pending-renewal`, L329 `/user-renewal-status`, L330 `/manual-renewal-check`. **Keep** L319 `/customer/service-plan/stop-renewal` (live, service plans). L331 `/invoices/update-overdue` acts on `monthlyinvoices` only (legacy, in the mixed `monthlyInvoiceController.js`).
- `cron/autoRenewalCron.js` (imported `index.js` L10, started L30) is legacy-only: it renews `isMonthlyLimitedPlan` orders and its overdue step `invoiceLifecycle.js` `updateOverdueInvoicesAndPausePlans()` (L53) reads `monthlyinvoices` only.
- Portal `SummaryApi` entries with no backend route: `adminUpdatePlans`, `updatePlanProgress`, `getUpdatePlans`, `closePlan` (`common/index.js` L260–275).
- Old records: `updaterequests` (`updatePlanId` → order), `monthlyinvoices`, `transactions`, `invoices`. `monthlyInvoiceController.js` also hosts **live** payment-record handlers (mixed file).
- Old scripts **not usable**: `migrateLegacyPlansToServicePlan.js` (finds orders only via live legacy products = 0; resets them to active), `readOnlyAuditLegacyPlanOrphans.js` (treats `updatesUsed`/`currentMonthUpdatesUsed` as legacy, but both default to 0 on **every** order, `orderProductModel.js` L420–475), `readOnlyAuditLegacyPlans.js` (loads models, no write guard).
- Classify orders only by own flags: `isServicePlan` → service, `isWebsiteProject` → project, neither → legacy candidate.

**Tests**
- Backend, all suites: `node --test tests/*.test.js` → **324/324** (28 Oct, after Phase 2a). Flexible Plans suites: `flexiblePlansAudit`, `servicePlansP1`, `planCategories`, `servicePlanPricing`, `planCatalogue`, `serviceAllowance`, `flexiblePlansPhase1` (end to end, incl. Phase 2a admin quote / plan-only status / `uploadAllowance`; mail provider mocked, other network blocked). Run the whole set after every change.
- Website → 33/33 pass (unchanged in Phase 1): `node --conditions=react-server --import tsx --test tests/package-pages.test.ts tests/offer-packages.test.ts tests/offers.test.ts tests/offer-quote.test.ts tests/session.test.ts tests/page-content.test.ts`
- Portal: `react-scripts test` cannot start (`@testing-library/jest-dom` missing; pre-existing). Verify portal by build + browser until repaired (owner decision).
- Local backend `.env` = `merasoftware-dev` (empty). Production data only via owner-run read-only scripts.

## 4. Design
- **Category model:** `{ key (permanent), label, description, linkedProjectCategory?, status, sortOrder }`. Live plans are mapped by the P2e script (Q4: "Website Updates", "Website Features").
- **New `servicePlan` fields:** `categoryKey`, `pricingMode` (`fixed` | `flexible`), `files {min,max,step}`, `ratePerFile`, `slabs [{fromFile, ratePerFile}]`, `updatesPerMonth {min,max}`, `allowOneTime`, `oneTimeValidityDays`, `billingOptions` (monthly / quarterly / half_yearly / yearly only), `maxTenureMonths` (1–12), `releaseMode` (`all_at_once` | `monthly`), `customerCanChooseRelease`.
- **Price (built):** flexible one update = files by `ratePerFile`, marginal cheaper slabs from `fromFile`; one-time = update × number of updates; cycle = update × updates/month × months × (1 − discount). Fixed = the option's stored `pricePerCycle` (formula from `monthlyReferencePrice` only when none is stored) or the one-time price. Whole rupees. Card range = one update at min … max files (fixed: own price).
- **Purchase body (built):** `purchase` ('one_time' | monthly | quarterly | half_yearly | yearly), `tenureMonths`, `files`, `updates`, `releaseMode?`, `quoteKey` (required for flexible; 409 when stale). Old body `selectedBillingCycle` still accepted. Snapshot: `filesLimit` = chosen files (fixed: plan's), `portalAccessCount` = **cycle total** (recurring: updates × cycle months; fixed `per_month`: count × cycle months; one-time: updates bought), `updatesPerMonth`, `chosenFiles`, `chosenUpdates`, `releaseMode`, `priceBreakdown`, `oneTimeValidityDays`; `serviceCyclePrice` = cycle price. One-time upload plan without its own validity: valid `oneTimeValidityDays` (default 90).
- **Monthly release (built):** `serviceAllowance.js` opens `updatesPerMonth` per started month from `serviceCurrentCycleStart`, capped at the cycle total (no cron). Carry-over = Q1.
- **Admin start (built):** `POST /api/admin/clients/:customerId/service-plans` (same `resolvePurchase()`; payment `record` with evidence or `wallet`; no unpaid mode until B12 is fixed); `PATCH /api/admin/service-plans/:orderId/release-mode`.
- **Old records (P7):** new script from legacy-candidate **orders**. Dry run, JSON backup, owner approval. Writes the service shape with `servicePlanStatus: 'expired'` (`uploadOrderPolicy.js` L17 blocks uploads unless `active`), name from `orderItems`, original dates; links untouched. They show in `PlanDetails.js` service branch + `orderUploadHistory.js` with an "Old plan · Closed" badge. Skipped if P0 finds none.
- **Plans without uploads (owner requirement 28 Oct):** some plans never use the portal upload system (no upload button, no upload UI) — e.g. "we do the work, admin posts what was done". They use everything else: start, payment, messages, timeline. Model: existing `servicePlan.capability` (`upload_data` | `send_reminders`) already separates them; P2 keeps it and allows `pricingMode: fixed` without files. Their own UI (admin posts a work update → client sees it + gets the message) is not built yet: Phase 2b item in §0.2.
- **Plan communication (P5, owner requirement 28 Oct):** the client must know every step. Each step sends email (WhatsApp mirrors every sent email) and shows on both plan detail pages.
  | Step | To | Today |
  |---|---|---|
  | Plan started | client | no mail for service plans (template exists, no caller) |
  | Payment done / approved | client | no mail for service plans |
  | Client uploaded data | admin + client | sent (`submitUpdateRequest.js` L295, L299) |
  | Admin downloaded data → **In progress** | client | no status writer; template "Developer assigned" unused |
  | Work done → **Done** + note | client | no status writer; template "Update completed" unused |
  | Data problem → **Rejected** + reason | client | does not exist. Rejected upload does **not** consume the update; client uploads again |
  **Built in Phase 1 (backend):** all six steps now send (plan started / payment received from `settleServiceCycle()`; In progress automatically on admin zip download; Done / Rejected from the status route). Status lives on `updaterequests` (`status`, `completedAt`, new `statusHistory[]` = a note history, new `allowanceReturnedAt`); no new collection. Mails are system mail: no review popup, the Communication tab's On/Off per action applies. Still to build (Phase 2a/2b): the buttons and both plan pages showing the history.
- **UI:** portal tokens only; Tailwind v3 trap `bg-[rgb(var(--x)/0.1)]`; no layout shift on focus; structure instant, only prices load; website admin form visual (non-coder).

## 5. Phases
| Phase | Scope | State |
|---|---|---|
| P0 | Read-only audit: `readOnlyAuditFlexiblePlans.js` (write guard, raw collections) + test 6/6 | Done; production run 27 Oct (§3) |
| P1 | B1, B2, B3 (snapshot fallback only when `serviceCyclePrice` is missing), B4 | Done, pushed (backend live) |
| P2 | Backend: P2a categories · P2b fields + pricing helper + rounding (B8) · P2c validated create/edit + `/update-product` guard (B5) · P2d quote routes, purchase choices, snapshot, "allowed now" helper, offer key (B7) · P2e live-plan settings script | Done, pushed 28 Oct (backend live); P2e dry run done, `--apply` pending owner "haan" (§0.1) |
| P3 | Website admin `src/app/admin/plans`: categories, list (hide/retire/restore), create/edit | Done, pushed 28 Oct (Phase 2a); website deploy to confirm (§0.1) |
| P4 | Portal builder: `ServicePlanDetail.js`, compact in `AddServiceModal.js`; remove `MAX_TENURE_MONTHS` | Not started |
| P5 | Portal admin "Start plan for client" + release mode; B9; **plan detail pages (admin + customer)**: plan info (choices, cycle, term, release mode, closed state), allowance per cycle/month, cycle/month timeline from `serviceCycleHistory`, per-update records (files, status, admin note) via `orderUploadHistory.js`, payments ledger | Backend done 28 Oct (start plan, release mode, upload status, mails); admin UI pushed 28 Oct (Phase 2a); customer UI + B9 = Phase 2b |
| P6 | Website public plans page in "Pricing & Packages" (own page, not packages); SEO + sitemap | Not started |
| P7 | Q5 only (monthly bills of service orders). Old-order conversion not needed: audit found 0 legacy orders | Not started |
| P8 | Cleanup per §6, each item re-proven (callers = 0) and shown to the owner first | Not started |
Order: P1 alone; P2 before P3/P4/P5; P7 before any schema field removal.

## 6. Removal list (P8)
- **Delete whole.** Backend: the 8 legacy routes listed in §3 (not L319) + `/invoices/update-overdue` once Q5 is decided + controllers `validateUpdatePlan.js`, `toggleUpdatePlan.js`, `renewMonthlyPlan.js`, `createRenewalOrder.js`, `checkPendingRenewal.js`, `checkRenewalStatus.js`, `getUserUpdatePlans.js`; `autoRenewalCron.js`; legacy scripts (`migrateLegacyPlansToServicePlan.js`, `deleteLegacyPlans.js`, `deleteLegacyOrdersBatch.js`, `deletePlanKeepOrderData.js`, `readOnlyAuditLegacyPlans.js`, `readOnlyAuditLegacyPlanOrphans.js`, the P7 script after use). Portal: `UserUpdateDashboard.js` + `/my-updates` route + `customerReturnNavigation.js` L27; `AdminCreateServicePage.js` + route and `AdminPlanProductsPage.js` + route (after P3); dead `SummaryApi` entries.
- **Remove legacy branch only.** Portal: `orderPresentation.js`, `orderType.js`, `productCategory.js`, `PlanDetails.js`, `OrderPage.js`, `OrderDetailPage.js`, `AdminClientWorkspace.js`, `StartNewProject.js`, `ServicePlanDetail.js`, `AddServiceModal.js`, `DraftOrderCard.js`, `OrderListRow.js`, `UploadProduct.js`, `AdminEditProduct.js`, `AdminEditBanner.js`, `UploadBanner.js`, `common/index.js`. Backend: `uploadOrderPolicy.js`, `uploadSubmission.js`, `uploadType.js`, `submitUpdateRequest.js`, `orderStatusEngine.js`, `orderSummary.js`, `orderDeletePlan.js`, `deleteOrder.js`, `getOrderDetails.js`, `getUserOrder.js`, `createOrder.js`, `getAdminClients.js`, `getAdminUserWorkspace.js`, `getMyPaymentWorkspace.js`, `walletPayInstant.js`, `transactionApprovalController.js`, `paymentRecording.js`, `invoiceLifecycle.js`, `projectDuePayment.js`, `invoiceDocumentController.js`, `monthlyInvoiceController.js`, `emailController.js`, `emailDefinitions.js`, `uploadNotifications.js`, `guestCascadeDelete.js`, `projectCategories.js`, `getAdminPlanProducts.js`, `updateProduct.js`, `uploadPoduct.js`, `createServicePlan.js`, `bannerModel.js`.
- **Schema (after P7).** `productModel` legacy fields (`isWebsiteUpdate`, `validityPeriod`, `updateCount`, `isMonthlyRenewablePlan`, `yearlyPlanDuration`, `monthlyRenewalCost`, `isUnlimitedUpdates`, `isMonthlyLimitedPlan`, `monthlyUpdateLimit`, `monthlyRenewalPrice`, the `website_updates` pre-save flag) and `servicePlan.limitScope` / `manualUnit` / `manualCount`; `orderProductModel` legacy counters; `monthlyInvoiceModel` per Q5.
- **Unused mail templates (after P5 UI):** `sendDeveloperAssignedNotification`, `sendUpdateCompletedNotification`, `sendDeveloperAssignmentEmail` (no callers; replaced by the `plan.upload.*` mails). Re-prove 0 callers first.
- **Never delete:** `updaterequests`, transactions, invoices.
- **How to prove a portal file is dead** (method used for the 7 Sep 2026 deletion, CODEBASE_MAP §14a): full `src` name search, no barrel `index.js`, no `lazy()`/dynamic `import()`; after deleting, every relative import still resolves and `npm run build` passes. Backend: no route, no `require`, no cron/script start. Re-run the backend + website baselines (§3) after each deletion batch.

## 7. Owner decisions and open questions
**Decided**
- 28 Oct Q1 monthly release: unused updates carry forward inside the paid cycle, lapse at cycle end (built).
- 28 Oct Q3 `oneTimeValidityDays` default 90, admin can change per plan; already-sold orders keep their own validity (built).
- 28 Oct Q4 live plans: Starter Update Plan stays fixed, same price rounded (1490 / 4336 / 8493 / 16450), allowance = updates per month × cycle months; Single Page Adition fixed, one-time, 90 days; categories "Website Updates" (those two) and "Website Features" (Live Chat). Applied by the P2e script (pending `--apply`).
- 28 Oct: upload status + communication built before UI (Phase 1 backend); In progress automatically on admin download; notes kept as a history.
- 28 Oct: plans without uploads (`capability: send_reminders`) keep the same model; their own "work update" feature (admin posts what was done → client sees it + mail) is still to build: listed in §0.2.
- 28 Oct: delivery in 4 phases (§0); whole phase in one go.

**Open (ask when the phase that needs it starts)**
- Live Chat Feature: keep as a plan in "Website Features", or move it to a project add-on later? (owner said they will decide)
- Rename "Single Page Adition" → "Single Page Addition"? (owner's call; P3 form can do it)
- Order `6a90417d77eae0db8156833d` (quarterly Starter bought before Phase 1, got 1 update instead of 3): correct its `servicePlanSnapshot.portalAccessCount` to 3? Production write, owner approval; new purchases are already right.
- B12: settle the service cycle when a plan invoice is paid from the wallet later (needed before any "start unpaid" mode). (separate owner decision; not in 2b)
- Q2 May the admin change the price for one client? Owner 28 Oct: not now (start plan uses the quote price only).
- Q6 Prototype "Next period" card says the customer can change files/updates before renewal. With the fixed length selector, wanted (change at renewal = new quote) or not? (Phase 2b)
- Q7 Prototype "My Plans" shows one progress card per update ("Update 2 of 2 · 7/20 files"). Build this in `PlanDetails.js`? (Phase 2b)
- Q5 Monthly bills (8, all on service orders, 3 overdue): keep `monthlyInvoiceModel` read-only or move into `invoiceModel`? (Phase 3)
- B11 Crons off in production → no automatic renewals; separate owner decision.

## 8. Packages vs plans
Plans get their own website page in the same menu, never inside the package catalogue. Do not build a "Monthly Packages" page for work that plans cover.

## 9. Later (not in scope)
Package setting "runs as Project / Plan (pick plan)"; client screen "Start from package" pre-fills the project or plan form; admin confirms. Card price from the plan quote route. Already prepared by: one plan-start path, one price formula, permanent plan IDs.
