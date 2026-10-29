# Plans: website shop + portal - working doc

Updated: 29 Oct 2026. This file covers only the work ahead. Earlier work is in git; older versions of this file are in `E:\Allprojects\backup\merasoftware\work48-plan-doc\` and `work49-plan-checkout-portal\`.

## 1. Next action

**Client buys in the portal; website shows the purchases** (section 4): **built 30 Oct 2026, all checks pass, uncommitted, awaiting owner review.** After review: commit, deploy (section 5), turn the three new mail events On in Communication.

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
| Client | Link to `<portal>/service-plan-detail/<id>?purchase=&months=&files=&updates=&release=`. The portal builder starts on that choice; the client pays there. |
| Member | One click sends the choice. Result: "✓ Request received". |
| Visitor | Form, plus a sign-in link that keeps the choice. Result: "✓ Request received". |

Where it lives:

- **Website:** plan page `app/plans/[plan]/page.tsx`; builder and CTA `components/plans/plan-builder.tsx`; helpers `lib/public-plans.ts`; request route `app/api/plan-request/route.ts`; account tabs `components/account-navigation.tsx` (`accountLinks` also builds the Overview boxes).
- **Portal:** buy page `pages/ServicePlanDetail.js` (wallet/UPI/QR, offers, "needs a project", success popup); plan page `pages/PlanDetails.js`; upload popup `components/UpdateRequestModal.js`.
- **Backend:** purchase `controller/order/customerCreateServicePlanOrder.js`; order shape `helpers/servicePlanPurchase.js` (customer orders start `orderVisibility: "pending-approval"`); upload rule `helpers/uploadOrderPolicy.js`; status labels `helpers/orderStatusEngine.js`; approval `controller/user/transactionApprovalController.js` → `helpers/serviceCycleSettlement.js` (approves, mails `plan.started`); plan mails `helpers/servicePlanNotifications.js`.

Facts (verified 29 Oct 2026):

- Wallet-only purchase sets `approved` at once. UPI part keeps `pending-approval`; status engine shows "Approval Pending"; approval → `approved` + `plan.started` mail; rejection → `payment-rejected` + wallet part refunded.
- **Bug:** uploads are refused for `pending-approval` only when the order has an offer `paymentPolicy`. A normal UPI-pending plan can upload, and the portal plan page shows it as "Active".
- The purchase API has no customer-role check. `purchaseKey` (sent by both portal callers) is honoured only on the deferred-offer path.
- No admin mail is sent for a plan purchase. No client mail on UPI submit or on rejection.
- `GET /api/get-order` (authToken) returns the user's orders with `orderState.label` from the status engine; the portal uses it.
- Admin mail goes to `ADMIN_EMAILS` (hard-coded in `emailDefinitions.js`); WhatsApp goes to the phone saved on those accounts. Probably not registered yet.

## 4. Client buys in the portal; website shows purchases (built, awaiting review)

### 4.1 What the client sees

1. Website plan page: customize → **Get this plan** → note "You pay in your client portal, where your plan lives: send files, follow the work, see bills." → portal pay page, choice filled, already signed in.
2. Portal: wallet / UPI / both → submit → popup:
   - wallet only: "✓ Your plan is active"
   - UPI part: "✓ Payment submitted. We will tell you on WhatsApp when it is approved."
   - main button **View my plan →** (`/plan-details/<orderId>`), second button **Back to website** (website home).
3. Plan page: "Approval Pending" badge and uploads closed until approved; "Payment Rejected" after rejection.
4. Messages (mail + WhatsApp copy, all new ones Off until turned On): UPI submitted (new), approved (exists, `plan.started`), rejected (new). Admin: "plan bought / UPI to approve" (new, Off; provision until admin settings exist).
5. Website **My Account → My purchases** (clients only): one card per bought plan: name, status (same label as portal), date, **Open in portal →**. **Overview** shows a live line on My purchases ("1 active · 1 approval pending") and My offers ("1 reserved · pay by …").

### 4.2 Build steps

Backups: website `work49-plan-checkout-portal`, portal `work28-plan-checkout-portal`, backend `work33-plan-checkout-portal`.

1. **Backend**
   - `uploadOrderPolicy.js`: refuse `pending-approval` for every service upload, not only offers.
   - Purchase controller: 403 "Switch to your customer role to buy a plan." when `req.userRole !== 'customer'`; `purchaseKey` guard shared by the normal and deferred paths (same key + same choice → earlier order, no new charge; different choice → refused; no bill → "needs review"); a parallel duplicate hitting the unique index answers 409.
   - Mail events (Plans section, customer-type so they start Off): `plan.payment.submitted`, `plan.payment.rejected`, `plan.purchase.admin`.
   - Tests for all of the above; existing suites pass.
2. **Portal:** success popup with two buttons; plan page "Approval Pending" / "Payment Rejected" badge with uploads closed; upload popup lists only approved plans.
3. **Website:** client note; `app/api/my-purchases` pass-through to `GET /api/get-order` (trimmed to name, kind, status, date, link); `/account/purchases` page; tab + Overview live lines.
4. **Proof:** backend tests on in-memory MongoDB; website unit tests; browser check of popup, plan page and My purchases including phone width.

Built where (30 Oct 2026):

- Backend: `helpers/uploadOrderPolicy.js` (pending-approval refused for every service upload); `controller/order/customerCreateServicePlanOrder.js` (role 403, shared `purchaseKey` block, 11000 → 409, purchase mails); `controller/user/transactionApprovalController.js rejectTransaction` (rejection mail); `helpers/servicePlanNotifications.js preparePurchaseMails / preparePaymentRejected`; `helpers/emailDefinitions.js` + `emailCatalog.js` (3 events, customer-type = Off until On; admin copy to `ADMIN_EMAILS`); `scripts/verifyNonBatchPaymentRegression.js` sends `userRole: "customer"`. Test: `tests/planCheckoutPortal.test.js`.
- Portal: `pages/ServicePlanDetail.js` (popup from the backend answer, `purchased` state, two buttons); `pages/PlanDetails.js` ("Approval Pending" / "Payment Rejected" badge, uploads closed, `paymentNote` in desktop and phone layout); `components/PlanUpdateCards.js` ("Opens after payment approval"); `components/UpdateRequestModal.js` (only approved plans). Test: `tests/plan-checkout-browser.cjs` (real backend controllers + in-memory MongoDB + real session cookie).
- Website: `lib/my-purchases.ts`, `app/api/my-purchases/route.ts`, `app/account/purchases/page.tsx`, `components/my-purchases.tsx` (+ `.module.css`), `components/account-navigation.tsx` (async, reads the session; My purchases tab for clients; live lines), `components/plans/plan-builder.tsx` (client note). Tests: `tests/my-purchases.test.ts`, `tests/account-navigation.browser.mjs` (client tab, live lines, cards, phone width).
- Seen, not changed: on a phone the portal plan page's Back button overlaps the plan title (existing header layout).

**Done means:** a client buys in the portal with wallet, UPI or both; one order and one charge per attempt; no uploads before UPI approval; the client is told at submit, approval and rejection; the website shows the purchase with the same status.

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
- Backups go only in `E:\Allprojects\backup\<repo>\workNN`. Next free: website `work50`, portal `work29`, backend `work34`. Verify they are free first.
