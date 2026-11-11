# Monthly Package — working doc

Hand-over doc for any agent. Read this first, then verify every file/line from code (code is the truth).
Status: **STAGE 2 — plan (§6) drafted, no code changed. Waiting for owner answers (Q1, Q2, Q4, Q5) + "code likho".**
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

## 7. Log
- 11 Nov 2026 — Stage 1: audit written. No code changed.
- 11 Nov 2026 — Stage 2: owner chose existing plan system; portal/backend plan engine verified; plan §6 drafted. No code changed.
