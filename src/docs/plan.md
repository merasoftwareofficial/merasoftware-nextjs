# Plans: website shop + portal - working doc

Updated: 30 Oct 2026. This file covers only the work ahead. Earlier work is in git; older versions of this file are in `E:\Allprojects\backup\merasoftware\work48-plan-doc\`, `work49-plan-checkout-portal\` and `work50-checkout-page\`.

## 1. Next action

**Checkout page** (section 4): the portal pay pop-up is replaced by its own checkout page, and the website sends a client straight to it. **Built 30 Oct 2026, all checks pass, uncommitted, awaiting owner review.** The portal-buy, upload-after-approval and My purchases work before it is committed. After review: commit, deploy (section 5), turn the new mail events On in Communication.

Also open (section 5): deployment, and the work46 header decision.

## 2. Goal and owner decisions

**One customer, two places, one backend.**

- **Website = the shop.** Anyone sees plans, customizes them and sees the price without signing in.
- **Portal = where the plan is bought by a client and used.** Pay, plan details, uploads, work status, renewals, invoices, wallet, projects, tickets.
- **Backend = the rules.** Price, purchase, payment split and plan lifecycle. No price or payment logic in the website or portal.
- **The customer must always clearly see** that their plan and work are followed in the client portal.

Decisions:

1. The button says **"Get this plan"**. Never mailto.
2. Customizing needs no sign-in.
3. **Client** (portal account, role `customer`) pays **in the portal** (changed 29 Oct 2026; the website pay box is dropped). The website sends the client to the portal pay page with the choice kept. Login is shared, so no second sign-in.
4. **Not a client** (website member, or visitor without account): nothing is bought. The request becomes a lead and the person sees "Our team will contact you soon".
5. A visitor gets a short form (name, email, mobile) and an "Already a client? Sign in" link. The sign-in page always opens on Sign in.
6. New mail events start **Off**; the admin turns them On in Communication. WhatsApp mirrors every sent mail.
7. One open lead per person: a repeat request is added to the same lead.
8. **One backend.** The Express backend on Render is reused for everything. Website API routes are only pass-throughs to it.
9. The portal guest/demo login is not useful. Removing it is a separate later phase.
10. **Upload only after payment is confirmed.** Wallet-only payment = active at once. Any UPI part (UPI only, or wallet + UPI) = no uploads until the admin approves it. Offer plans keep their own payment rules.
11. **My Account stays tab-based.** Tabs are not merged. A new **My purchases** tab (clients only) lists bought things (plans now, projects and subscriptions later). Reserved offers stay in **My offers**. **Overview is the hub**: one box per tab; a live line only on My purchases and My offers.

Working rule: look, analyse and verify first; code only after the owner explicitly says so.

## 3. What exists now

"Get this plan" by viewer:

| Viewer | Now |
|---|---|
| Client | Link to `<portal>/checkout/<id>?purchase=&months=&files=&updates=&release=&from=website`: the portal checkout with that choice. |
| Member | One click sends the choice. Result: "✓ Request received". |
| Visitor | Form, plus a sign-in link that keeps the choice. Result: "✓ Request received". |

Where it lives:

- **Website:** plan page `app/plans/[plan]/page.tsx`; builder and CTA `components/plans/plan-builder.tsx`; helpers `lib/public-plans.ts`; request route `app/api/plan-request/route.ts`; account tabs `components/account-navigation.tsx` (`accountLinks` also builds the Overview boxes).
- **Portal:** builder page `pages/ServicePlanDetail.js`; checkout + result `pages/PlanCheckout.js`; plan page `pages/PlanDetails.js`; upload popup `components/UpdateRequestModal.js`.
- **Backend:** purchase `controller/order/customerCreateServicePlanOrder.js`; order shape `helpers/servicePlanPurchase.js` (customer orders start `orderVisibility: "pending-approval"`); upload rule `helpers/uploadOrderPolicy.js`; status labels `helpers/orderStatusEngine.js`; approval `controller/user/transactionApprovalController.js` → `helpers/serviceCycleSettlement.js` (approves, mails `plan.started`); plan mails `helpers/servicePlanNotifications.js`.

Facts (verified 29 Oct 2026):

- Wallet-only purchase sets `approved` at once. UPI part keeps `pending-approval`; status engine shows "Approval Pending"; approval → `approved` + `plan.started` mail; rejection → `payment-rejected` + wallet part refunded.
- **Bug:** uploads are refused for `pending-approval` only when the order has an offer `paymentPolicy`. A normal UPI-pending plan can upload, and the portal plan page shows it as "Active".
- The purchase API has no customer-role check. `purchaseKey` (sent by both portal callers) is honoured only on the deferred-offer path.
- No admin mail is sent for a plan purchase. No client mail on UPI submit or on rejection.
- `GET /api/get-order` (authToken) returns the user's orders with `orderState.label` from the status engine; the portal uses it.
- Admin mail goes to `ADMIN_EMAILS` (hard-coded in `emailDefinitions.js`); WhatsApp goes to the phone saved on those accounts. Probably not registered yet.

## 4. Client buys on the portal checkout page; website shows purchases

### 4.1 What the client sees

1. **Website plan page:** customize → **Get this plan** → straight to the portal **checkout page** `<portal>/checkout/<planId>?<choice>&from=website`. The builder is not shown a second time. Login is shared.
2. **Portal plan page** (`/service-plan-detail/<id>`, Explore Services): builder → **Continue to checkout →** → the same checkout page with `from=portal`.
3. **Checkout page:**
   - "Your plan" (name, backend price, what you get, **Change** back to where the choice was made, with the same choice)
   - "Payment" (payment offer, amount due, wallet part, UPI part)
   - **Pay** from wallet, or **Continue to UPI**: QR for the remainder and a 12-digit reference on the same page
   - an agreed offer (pay later / limited uploads) activates without payment
4. **Result page** `/checkout/done/<orderId>?from=…`:
   - the order's real status from the backend on every visit: "Your plan is active" / "Payment submitted" / "Payment not approved" with the reason
   - buttons **View my plan →** and **Back to website** (website origin) or **Back to services** (portal origin)
   - straight after paying, a 10-second automatic return to where the client came from. A website client goes to the website's **My purchases** with the new plan marked (`/account/purchases?new=<orderId>`); a portal client goes to `/plan-details/<orderId>`.
   - **Stay here**, any click or any key stops the countdown. A rejected payment never redirects.
5. **Plan page:** "Approval Pending" badge, "Opens after payment approval" on the updates and uploads closed until approved; "Payment Rejected" with the reason after a rejection.
6. **Messages** (mail + WhatsApp copy; new ones Off until turned On):
   - UPI submitted: `plan.payment.submitted`
   - approved: `plan.started`, already existed
   - rejected: `plan.payment.rejected`
   - admin: `plan.purchase.admin`. This is a provision: it goes to the hard-coded `ADMIN_EMAILS` until admin settings exist.
7. **Website My Account:**
   - **My purchases** tab, clients only: status (same label as the portal), **Open in portal →**
   - **Overview** live lines on My purchases and My offers

### 4.2 Where it lives

Committed (portal-buy, upload after approval, My purchases):

- **Backend:**
  - `helpers/uploadOrderPolicy.js`: no upload while `pending-approval`
  - `controller/order/customerCreateServicePlanOrder.js`: customer role (403), shared `purchaseKey` block, 11000 → 409, purchase mails
  - `transactionApprovalController.js rejectTransaction`: rejection mail
  - `helpers/servicePlanNotifications.js`
  - `emailDefinitions.js` and `emailCatalog.js`: 3 events, customer-type = Off until On
  - test: `tests/planCheckoutPortal.test.js`
- **Portal:**
  - `pages/PlanDetails.js`: badge, `paymentNote`
  - `components/PlanUpdateCards.js`
  - `components/UpdateRequestModal.js`: only approved plans
- **Website:**
  - `lib/my-purchases.ts`, `app/api/my-purchases/route.ts`
  - `app/account/purchases/page.tsx`, `components/my-purchases.tsx`
  - `components/account-navigation.tsx`: async; tab and live lines

Checkout page (30 Oct 2026, uncommitted; backups website `work50-checkout-page`, portal `work29-checkout-page`; no backend change):

- **Portal:**
  - `pages/PlanCheckout.js`: `PlanCheckout` and `PlanCheckoutDone`; routes `checkout/:planId` and `checkout/done/:orderId` in `routes/customerRoutes.js`
  - `helpers/planCheckout.js`: origin, addresses, next steps, split, purchase key per choice+offer in sessionStorage, result words
  - `hooks/usePlanQuote.js`: the quote request, shared with `components/PlanBuilder.js`
  - `helpers/serviceTenure.js planChoiceBody / planChoiceQuery`: one rule for builder and checkout
  - `helpers/planAuthReturn.js`: login keeps `/checkout/...` with the choice and `from`
  - `pages/ServicePlanDetail.js`: pay pop-up and success pop-up removed; button "Continue to checkout →"
  - tests: `tests/customer-plan-flow.test.mjs`, `tests/plan-checkout-browser.cjs`
- **Website:**
  - `components/plans/plan-builder.tsx`: client link → checkout with `from=website`
  - `app/account/purchases/page.tsx` and `components/my-purchases.tsx`: `?new=` marks and scrolls to the new plan
  - test: `tests/account-navigation.browser.mjs`

Kept as it was: `components/AddServiceModal.js` (buying a service inside a project keeps its own pop-up).

Seen, not changed: on a phone the portal plan page's Back button overlaps the plan title (existing header layout).

**Done means:** a website client chooses once and pays on the portal checkout. A portal client goes builder → checkout. There is one order and one charge per attempt, even on a reload or a double click. The result page tells the truth and returns the client to where they came from. There are no uploads before UPI approval. The website shows the purchase with the same status.

### 4.3 Later (separate tasks)

- **Admin settings:** admin registers own email + WhatsApp number; admin messages start going there.
- **Unfinished purchase memory + reminders:** save the choice per client; max 2 reminders (24 h, 3 days) with "stop reminding"; choice expires after 7 days; admin list of unfinished purchases; own on/off switch (prod crons are off).
- **Validity starts at purchase, not approval:** a late approval shortens the client's plan. Decide whether to start the clock at approval.
- Read-only live check of plans already stuck in UPI-pending.
- The 6 portal UPI payee copies → one backend constant/route.
- Guest/demo removal phase (decision 9).
- Old plan.md section numbers in code comments; fix when those files are touched.

## 5. Other open items

- **Deploy order:** backend first, then portal and website. Then turn the new mail events On in Communication and check client, member and visitor on live.
- **work46 header fix** (plan page title centred, Back at the left): keep or revert. Backup: `backup/merasoftware/work46-plan-header`.
- **Member lead in Trash:** a new request returns "Your earlier request is with our team. Please contact us directly." The owner may change it.

## 6. Checks

Run from each repo root:

```powershell
# backend
node --test tests/planCheckoutPortal.test.js tests/planRequest.test.js tests/emailControl.test.js tests/offerReservations.test.js tests/planCatalogue.test.js tests/servicePlanPricing.test.js tests/flexiblePlansPhase1.test.js tests/flexiblePlansAudit.test.js tests/offerPaymentPolicy.test.js tests/uploadFlow.test.js tests/stagedUploads.test.js
# portal (the browser check needs a portal build for its CSS)
node --test tests/customer-plan-flow.test.mjs
node tests/plan-checkout-browser.cjs
# website
node --import tsx --test tests/public-plans.test.ts tests/my-purchases.test.ts
node tests/account-navigation.browser.mjs
```

Browser proof:

- Website: `next dev` with `NEXT_BUILD_DIR=.next-plancheck` and `DATA_DRIVER=json`. Afterwards delete `.data` and `.next-plancheck`, and revert `tsconfig.json`, which `next dev` rewrites.
- Portal: a page can be bundled alone with esbuild + Playwright, as in `frontend/tests/offer-reservations-browser.cjs`.
- Use real backend controllers on an in-memory MongoDB. Never use the website `.env.local` database.

Known: website `npx tsc --noEmit` fails only on the stale ignored `.next-build/types/validator.ts`.

## 7. Safety and backups

- Live sites: `https://www.merasoftware.com` (website), `https://portal.merasoftware.com` (portal), `https://api.merasoftware.com` (backend).
- Live data, real mails/WhatsApp, commit, push and deploy only with the owner's permission. Never print secrets or overwrite env files.
- Payment rules: the wallet is the customer's own money and is debited at once; UPI waits for admin approval; an order is created only together with its payment; no uploads before payment is confirmed.
- Backups go only in `E:\Allprojects\backup\<repo>\workNN`. Next free: website `work51`, portal `work30`, backend `work34`. Verify they are free first.
