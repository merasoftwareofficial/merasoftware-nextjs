# Monthly Package — working doc

Hand-over doc for any agent. Read this first, then verify every file/line from code (code is the truth).
Status: **STAGE 5 — built in 3 repos (§6d), tests + builds pass, uncommitted. Waiting for owner review.**
Last update: 11 Nov 2026.

---

## 1. Owner instructions (11 Nov 2026)

- One-time packages are done. Monthly packages are still half-manual. Finish them.
- The monthly **engine** must work like the **Website Update Plan** (service plan) engine, and the portal already has
  the UI for it (invoice added every cycle, monthly / quarterly payments, plan running N months).
- **No per-file system** in monthly packages — too complex, not compatible. Remove or hide it.
- Package name, description, everything else stays the same as one-time. Only billing changes to Monthly.
- When Monthly is chosen, ask (as today): *client sends files in the portal* OR *progress updates only*.
- Price = **fixed monthly price** only.
- Billing cycles + discount (monthly / quarterly / 6 months, % off each) — keep exactly as today.
- Longest length: max **12** months.
- Price method **Automatic or Manual**, same as one-time:
  - Manual: as today (typed main price + normal price).
  - Automatic: category + add-ons picked, price built from them (same as one-time).
- The price repeats on every billing cycle (renewal-like). The discount / offer bought stays for the whole length the
  client bought.
- Main job: bring the monthly engine **under SSOT**. Owner expects few changes.

## 2. What exists today (code audit, 11 Nov)

Repos: website = `E:/Allprojects/merasoftware`, backend = `E:/Allprojects/backend`.

### Admin form (website)
- `src/app/admin/packages/packages-manager.tsx`
  - Billing select One-time / Monthly (~L642). Portal uploads radio Yes / "No: progress updates only" (~L645).
  - Monthly pricing radio `fixed` / `per_file` (~L650, labels `MONTHLY_PRICING_LABELS` in `src/lib/sales-packages.ts`).
  - Per-file fields: files min/max/step, price per file, updates a month (~L653–658); per-file price checker `PerFilePrice` (L64).
  - Billing cycles + discount % checkboxes (~L660), longest length 1–12 (~L666). Default `blankMonthly` L53.
  - Monthly is **always typed price**: `chooseBilling` blocks monthly on an auto-priced package (L337), note "A monthly package uses typed prices" (L673).
- `src/lib/package-per-file.ts` — per-file quote helpers (website side only).

### Backend package rules
- `helpers/salesPackages.js`
  - `MONTHLY_PRICING = ['fixed','per_file']` (L51), `validateMonthly` (L59), `monthlyPlanShape` (L52) maps a package to a
    service-plan shape, `assertPricingConfig` from `servicePlanPricing.js` validates it (L77).
  - `monthlyQuote` (L180) prices with `quoteServicePlan` → **pricing math is already SSOT with the plan engine.**
  - Auto price (category base + add-ons, frozen in `pricing`) is one-time only: L291–306 rejects it for monthly.
- `helpers/projectPricing.js` L42–91 — monthly term (cycle, length, prices, startsAt/endsAt) frozen on
  `projectSnapshot.salesAgreement.package.monthly`.

### Purchase / running (the real gap)
- `helpers/packagePurchase.js` — a monthly package becomes a **project order** (not a service-plan order) with
  `buildCycleInstallments` (`helpers/projectInstallments.js` L13): one installment per cycle, `dueBy:'date'`, on project invoices.
- Cycle logic is a **second copy**, separate from the plan engine:
  - `helpers/projectUploadGate.js` (`monthlyTermOf`, `currentCycle`, `projectUploadLimits`; per-file allowance borrows `serviceAllowance.js`).
  - `helpers/projectDuePayment.js` L24 (due by date), `helpers/offerPaymentPolicy.js` L23 (`isCycleProject`),
    `helpers/projectNodeService.js` L37, `helpers/reservationRepricing.js` (monthly is fixed, no repricing).
- Website Update Plan engine (the one owner wants): `helpers/servicePlanPurchase.js`, `servicePlanPricing.js`,
  `servicePlanCatalogue.js`, `serviceAllowance.js`, `serviceBillingSchedule.js`, `invoiceLifecycle.js`,
  `models/monthlyInvoiceModel.js`, controller `invoice/monthlyInvoiceController.js` + renewal crons.
- Portal "Start a Project" list: `packagePurchase.js catalogueForCustomer` filters `billing === 'one_time'` → monthly not sold there.

### Summary
| Part | Today | Owner wants |
|---|---|---|
| Price math (cycles, discount, length) | plan engine (`quoteServicePlan`) ✅ | same |
| Per file | built (admin + backend + upload gate) | remove / hide |
| Price method | monthly = manual only | Auto or Manual |
| Running engine (invoices, cycles, renewal) | project order + date installments (own copy) | plan engine + portal plan UI |
| Portal Start a Project | one-time only | (to confirm) monthly too |

## 3. Proposed changes (draft, not approved)

1. **Hide per file**: admin form shows only fixed monthly price; backend rejects new `per_file`; keep reading old rows
   until checked (see Q2). Remove `PerFilePrice` / `package-per-file.ts` only after Q2.
2. **Auto price for monthly**: allow `services` + frozen `pricing` on monthly; main price = category base + add-ons
   (meaning per month — see Q1); manual stays as today. Remove the L291–306 / L337 / L673 blocks.
3. **Engine SSOT** (main job) — two ways, owner picks (Q3):
   - **A. Plan engine**: monthly package purchase creates a service-plan-style order (monthlyInvoiceModel, cycle dates,
     renewal invoices, portal plan UI). Remove `buildCycleInstallments` path + per-cycle copies in projectUploadGate etc.
   - **B. Keep project order**, move the duplicated cycle code into one shared helper used by both.
   - Recommendation: **A** (matches owner instruction + reuses portal UI). Needs a portal check that the plan UI can show
     a package-made plan with "progress updates only" / uploads.
4. Offer / discount frozen for the whole bought length — already true (`reservationRepricing.js` MONTHLY_FIXED; term frozen
   in `projectPricing.js`). Keep it in path A.

## 4. Open questions (owner)
- Q1. Auto price: is category base + add-ons the **per-month** price? (Category base is today a one-time project price.)
- Q2. Any live package saved with `per_file`? (one read-only DB query needed — approval)
- Q3. Engine path A or B?
- Q4. Show monthly packages in portal "Start a Project" + website checkout too?
- Q5. Existing monthly package projects (if any) — migrate or leave as they are?

## 5. Owner decision 2 (11 Nov) — use the existing plan system
- The old plan system already works: separate portal plan page, upload-limit bar per month with reset, invoices added
  each cycle, work updates for plans without uploads, Orders list. Nothing new to build — only **connect the monthly
  package to it under SSOT**. Portal limit + renewal of the package drive it. → Q3 answered: **path A**.

### Verified (portal + backend)
- Portal plan page `frontend/src/pages/PlanDetails.js` (route `plan-details/:orderId`), chosen by `helpers/orderType.js isPlanItem`
  = `order.isServicePlan` (order's own flag, no catalogue product needed).
  - `capability: 'upload_data'` → upload allowance bar (`order.uploadAllowance`, backend `serviceAllowance.js`), `PlanUpdateCards`.
  - `capability: 'send_reminders'` → "What we did" work updates (`serviceWorkUpdates`, admin POST `/api/admin/service-plans/:orderId/work-updates`, mailed).
  - Bills from `serviceInvoices` (monthlyInvoiceModel); bought facts from `servicePlanSnapshot`.
- Backend order builder `helpers/servicePlanPurchase.js buildServicePlanOrderData(plan, billingSelection, quote…)` — takes a
  plan-shaped object; `productId` is optional (`orderProductModel.js` L330 default null). Renewal: `cron/servicePlanRenewalCron.js`.
- `salesPackages.js monthlyPlanShape` already turns a package into a plan shape → it is the bridge.

## 6. Plan (draft, waiting for "code likho")
1. Package form (monthly): remove per file; keep fixed price, cycles+discount, length ≤12, uploads yes/no;
   if uploads yes → "Updates a month" (number) or Unlimited (maps to plan `limitScope per_month / unlimited`).
2. Price method Auto/Manual for monthly too (same category + add-ons builder as one-time; frozen on save).
3. `monthlyPlanShape` = the one mapping: uploads yes → `capability upload_data`, no → `send_reminders` (work updates).
4. Purchase (`packagePurchase.js` + admin create): monthly package → `buildServicePlanOrderData` (isServicePlan order +
   first cycle invoice), same wallet/UPI payment path as plans; package id/name/offer frozen in the snapshot.
5. Remove the old copy: `buildCycleInstallments` path, monthly branches in `projectUploadGate.js`, `projectNodeService.js`,
   `offerPaymentPolicy.js isCycleProject`, `reservationRepricing.js`, `package-per-file.ts`, `PerFilePrice` — only after Q2/Q5 checks.
6. Portal Start a Project + website checkout list monthly packages (Q4).
7. Tests: package → plan order, renewal invoice, allowance reset, updates-only page.

## 6b. Owner decisions 3 (11 Nov) — answers Q1, Q2, Q4, Q5
- Q1: Auto price = category base + add-ons = the **monthly** price. Cycle discount applies every cycle.
- Offer: bought while an offer runs → every cycle of the bought length (e.g. 6 months) is billed at that offer price.
  After the length ends, buying again / extending charges the package's **price at that time**.
- **Stop anytime** (like an AI subscription): client can stop the package; no billing from the next cycle on
  (current paid cycle runs to its end). Verified: plan system has no client stop today — `servicePlanStatus` enum
  (`orderProductModel.js` ~L862) has `cancelled` only via `cancelProjectOrder.js`; renewal skips non-active orders
  (`offerServiceRenewal.js` L13). → New: a "stop at cycle end" flag on the order + portal button; renewal skips it.
- Message checkpoints (messaging system): **provision only now** (a hook/flag), wired after this work is complete.
- Q2/Q5: no monthly package is live, none per-file. Per-file belongs to the **plan system — do not touch it**
  (remove per-file only from packages).
- Q4: sell monthly packages in **both** portal Start a Project and website checkout.

- No project progress (0–100% checkpoints / nodes) for a monthly package. It shows only the existing plan page
  (`PlanDetails.js`). Every piece already exists — connect, do not build new (except stop-at-cycle-end).

## 6c. Verify passes (11 Nov) — facts found, plan corrected
Passes 1–5 found new facts; passes 6–7 clean.
- Plan bills are `invoiceModel` invoices via `paymentRecording.createProjectInvoice` with `serviceCycleNumber`
  (not the legacy monthlyInvoiceModel). Renewal: `cron/servicePlanRenewalCron.js` → `invoiceType:'plan_renewal'`;
  unpaid renewal → `servicePlanStatus:'paused'`; last contracted cycle → `expired`.
- Renewal price = frozen `serviceCyclePrice` (`serviceBillingSchedule.js resolveServiceRenewalPrice`) → offer price stays for
  the whole bought length automatically. ✅
- Offer payment terms already work on plan orders (`offerPaymentPolicy.js` L24–27, cron → `offerServiceRenewal.js`). ✅
- **Stop**: backend already has `serviceLifecycle.js stopServiceRenewal` + route `POST /api/customer/service-plan/stop-renewal`
  (`routes/index.js` L358) + portal api entry (`common/index.js` L213) — **but no portal button uses it**, and the cron ignores
  `serviceAutoRenew` for fixed-tenure plans (always bills every contracted cycle). → fix: cron honours
  `serviceAutoRenewalStoppedAt` (expire at cycle end) + button on `PlanDetails.js`.
- **Payment**: `projectPaymentSettlement.js` L25 refuses plan orders, and `persistAdminProject` builds a project timeline +
  installment invoice → cannot be reused for plans. Plan payment lives inside `customerCreateServicePlanOrder.js`
  (needs a catalogue `productModel` plan, not atomic). → extract plan "create order + cycle-1 invoice + wallet/UPI" into one
  helper used by both the plan controller and `packagePurchase.js` (SSOT; plan behaviour unchanged).
- Uploads on plan orders read only the snapshot (`uploadType.js` by `isServicePlan`; `uploadSubmission.js` L98–108):
  needs `capability:'upload_data'`, `filesLimit` > 0, `limitScope`, `portalAccessCount`. → package snapshot sets
  filesLimit = system max per upload, limitScope `per_month` (+count) or `unlimited`.
- Display name falls back to `servicePlanSnapshot.serviceName` (`orderPresentation.js`) → set to package name. ✅
- Repeat-purchase check reads `projectSnapshot.salesAgreement.package.id` (`packagePurchase.js` ACTIVE_PACKAGE_PROJECT) →
  add package id to the plan snapshot and check both.
- Admin "create from package" (`adminCreateProjectOrder.js` ~L160, paymentType monthly) also makes a project → must
  make a plan order too.
- Portal `StartProjectPackage.js` has no monthly choice UI and links to `/project-details` → needs cycle/length pick
  + link `/plan-details` for monthly. Website `package-builder.tsx` has per_file branches to remove.
- ⚠ Crons run only with `ENABLE_CRONS=true` (`index.js` L26). Memory says it is absent on Render → no renewal invoices
  in prod. Must confirm before go-live (affects existing plans too).

### Final step list
1. Website form: remove per file (monthly), Auto/Manual price for monthly, uploads → updates a month / unlimited.
2. Backend `salesPackages.js`: monthly = fixed only; allow frozen auto pricing on monthly; `monthlyPlanShape` = the one
   package→plan mapping (capability, limitScope, portalAccessCount, filesLimit, package id/name).
3. Backend: shared plan-order helper (extracted from `customerCreateServicePlanOrder.js`); `packagePurchase.js` +
   `adminCreateProjectOrder.js` use it for monthly; repeat check covers plan orders.
4. Cron honours stop; portal Stop button on plan page.
5. Portal + website checkout sell monthly (choice UI, `/plan-details` link); `catalogueForCustomer` lists monthly.
6. Remove old monthly-project copies (`buildCycleInstallments`, monthly branches in projectUploadGate / projectNodeService /
   reservationRepricing / isCycleProject, `package-per-file.ts`). Plan-system per-file untouched.
7. Message checkpoints: provision only.
8. Tests + builds (backend tests, website build, portal build).

## 6d. Built (Stage 5, 11 Nov 2026) — uncommitted, awaiting owner review
Backups: `E:\Allprojects\backup\merasoftware\work113-monthly-package`, `backend\work78-monthly-package`, `frontend\work80-monthly-package`.

**Backend** (`E:/Allprojects/backend`)
- `helpers/salesPackages.js` — monthly = `{ billingOptions, maxTenureMonths, uploadsPerMonth (null = unlimited) }`; per file refused
  (before: `pricing: fixed|per_file` + files/updates). `monthlyPlanShape(item, unitPrice)` = the one package → plan mapping
  (capability, limitScope, portalAccessCount, filesLimit, releaseMode). Auto price (category + add-ons) allowed for monthly =
  price of one month (before: one-time only).
- `helpers/packagePlanOrder.js` (new) — builds the plan order with `servicePlanPurchase.js buildServicePlanOrderData` and saves
  order + cycle-1 bill + payment in one transaction; `startPaidPackagePlan` → `settleServiceCycle`. Used by customer purchase
  and admin create. Agreement frozen in new order field `salesPackage` (`models/orderProductModel.js`).
- `helpers/servicePlanPurchase.js` — `productId: plan._id ?? null`, item id fallback (package has no catalogue plan). Plans unchanged.
- `helpers/packagePurchase.js` — monthly → plan order (`purchaseMonthlyPackage`), plan mails; repeat check covers plan orders;
  portal catalogue lists monthly. `controller/order/adminCreateProjectOrder.js` — monthly → plan order.
- `cron/servicePlanRenewalCron.js` — `serviceAutoRenewalStoppedAt` set → plan `expired` at cycle end, no bill (before: fixed-length
  plans ignored stop). `helpers/serviceLifecycle.js` — refuses a second stop.
- Removed old monthly-project copy: `buildCycleInstallments`, `dueBy:'date'` rule (`projectDuePayment.js`), `isCycleProject`
  (`offerPaymentPolicy.js`), `projectUploadLimits` (`projectUploadGate.js` + callers), 100%-lock (`projectNodeService.js`);
  `reservationRepricing.js` guards now read `order.isServicePlan`.
- Tests: `packageChoice`, `packagePurchase`, `packageServicesPricing` rewritten for plan behaviour. Full suite 863: 845 pass,
  18 fail = the same 18 that fail on the untouched committed code (pre-existing, not from this work).

**Website** (`E:/Allprojects/merasoftware`) — admin form: no per file, "Updates a month" (unlimited / number), price method for
monthly too, note "runs as a plan"; `lib/sales-packages.ts`, `lib/package-choice.ts` (no files/updates), customize page shows
what the month gives + "Stop any time"; purchase result/dialogs link to portal `/plan-details/<id>` for a plan.
Deleted `src/lib/package-per-file.ts`, `tests/package-per-file.test.ts`. tsc + eslint clean; package tests 31/31; browser tests
`package-builder.browser.mjs` + `offers-components.mjs` PASS; `next build` OK.

**Portal** (`E:/Allprojects/frontend`) — `StartProjectPackage.js` monthly: billing period + length, monthly bill, done → `/plan-details`;
list card "/ month"; `PlanDetails.js` "Stop plan" (package plans only) + description from `salesPackage`; `servicePlanCycle.js`
stopped = finished; admin workspace: no per-file inputs, toast "started as a plan (Plans tab)". 119/119 tests, eslint clean, build OK.

**Not done / open**
- Message checkpoints: not wired; hook point = after `startPaidPackagePlan` / plan notifications (`servicePlanNotifications.js`).
- `ENABLE_CRONS` on Render prod unconfirmed → without it no renewal bills (all plans).
- Admin Plans tab label still "Service Plan" for package plans (owner did not decide).
- Offer reservation on a monthly package: attached + confirmed for wallet payment; a UPI-approved first bill does not confirm it
  (plan approval path has no reservation step).

## 7. Log
- 11 Nov 2026 — Stage 1: audit written. No code changed.
- 11 Nov 2026 — Stage 2: owner chose existing plan system; portal/backend plan engine verified; plan §6 drafted. No code changed.
- 11 Nov 2026 — Stage 3: all questions answered (§6b). Plan final = §6 + stop-at-cycle-end + checkpoint provision. Waiting for "code likho".
- 11 Nov 2026 — Stage 4: 7 verify passes (last two clean); facts + final step list in §6c. Open: ENABLE_CRONS on prod.
- 11 Nov 2026 — Stage 5: built per §6c (details §6d). Uncommitted. Waiting for owner review.
