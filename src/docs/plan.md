# Plans: website shop + portal - working doc

Updated: 29 Oct 2026. This file covers only the work ahead. Earlier work is in git; older versions of this file are in `E:\Allprojects\backup\merasoftware\work48-plan-doc\`.

## 1. Next action

Build **website checkout for portal clients** (section 4). It is planned, every decision is made (4.3), and every fact was verified against the code on 29 Oct 2026. Not built. Start only when the owner explicitly says to code; then build steps 4.4 in order without stopping per step.

Also open (section 5): owner review of the uncommitted "Get this plan" work, deployment, and the work46 header decision.

## 2. Goal and owner decisions

**One customer, two places, one backend.**

- **Website = the shop.** Anyone sees plans, customizes them and sees the price without signing in. A portal client buys here.
- **Portal = where the plan is used.** Plan details, uploads, work status, renewals, invoices, wallet, projects, tickets. The portal keeps its own buying screens: Explore Services, Add a Service, payment offers.
- **Backend = the rules.** Price, purchase, payment split and plan lifecycle. No price or payment logic in the website or portal.
- **The customer must always clearly see** that their plan and work are followed in the client portal, with more detail there.

Decisions (29 Oct 2026):

1. The button says **"Get this plan"**. Never mailto.
2. Customizing needs no sign-in.
3. **Client** (portal account, role `customer`) buys the plan. Target: pays on the website, then gets a clear button to the plan in the portal (section 4).
4. **Not a client** (website member, or visitor without account): nothing is bought. The request becomes a lead and the person sees "Our team will contact you soon".
5. A visitor gets a short form (name, email, mobile) and an "Already a client? Sign in" link. The sign-in page always opens on Sign in; Sign up is reached from there.
6. New mail events start **Off**; the admin turns them On in Communication.
7. One open lead per person: a repeat request is added to the same lead.
8. **One backend.** The shared Express backend on Render is reused for everything. No backend logic is built in Next.js. Website API routes are only pass-throughs that forward the request (with the customer's cookie or the integration key) to Render, as `app/api/plan-request` and offer reservations already do. Two frontends (React portal, Next.js website) may show the same step differently; the rules, money and data live once, in the backend.
9. The portal guest/demo login is not useful. Removing it is a **separate later phase**: read-only live audit (with permission), exact deletion list, approval, backup, tests.

Working rule: look, analyse and verify first; code only after the owner explicitly says so (code likho / fix karo / haan / proceed).

## 3. What exists now (the base for the next step)

"Get this plan" by viewer:

| Viewer | Now |
|---|---|
| Client | Link to `<portal>/service-plan-detail/<id>?purchase=&months=&files=&updates=&release=`. The portal builder starts on that same choice; the client presses Pay there. |
| Member | One click sends the choice. An account without a phone is asked once. Result: "✓ Request received". |
| Visitor | Form, plus a sign-in link that keeps the choice. Result: "✓ Request received". |

Where it lives:

- **Website:**
  - plan page `app/plans/[plan]/page.tsx` (decides the viewer)
  - builder and CTA `components/plans/plan-builder.tsx`
  - helpers `lib/public-plans.ts` (`initialChoice`, `choiceQuery`, `quoteRequest`, `planRequestSchema`)
  - server calls `lib/public-plans-server.ts`
  - request route `app/api/plan-request/route.ts`
  - price route `app/api/plan-quote/route.ts`
- **Portal:**
  - `pages/ServicePlanDetail.js` (the buy page)
  - `components/PlanBuilder.js` (`initial` prop)
  - `helpers/serviceTenure.js initialPlanChoice`
  - `helpers/planAuthReturn.js` (login return may keep the five choice keys)
- **Backend:**
  - `controller/lead/planRequest.js`
    - `POST /api/plan-request` is for a member (cookie)
    - `PATCH /api/integration/plan-request` is for a visitor (website integration key)
  - mail events `plan.request.admin` / `plan.request.received` (Off)
  - quote: `controller/order/servicePlanQuote.js`
  - purchase: `controller/order/customerCreateServicePlanOrder.js`

Facts to rely on:

- A member's lead is found by `leadModel.reservationUserId`, which is unique. That is the same lead offer reservations use.
- The portal opens customer pages only in the **active** role `customer`. A staff + client account signs in under the staff role. The website then says "switch to your client role in the portal".

## 4. Website checkout for clients (planned, not built)

### 4.1 What the client sees

1. On the plan page the client customizes and presses **Get this plan**.
2. The "Your plan" box becomes **Confirm and pay**:
   - the choice
   - amount due now
   - paid from wallet
   - to pay by UPI
   - one line: *"After buying, you use this plan in your client portal: send files, follow the work, see bills."*
3. **Pay.**
   - If the wallet covers all of it, it is debited at once and the plan is active.
   - Otherwise a UPI QR for the remainder only appears. The client pays, enters the 12-digit UPI reference and sends it for checking.
4. **Success**, still on the website:
   - wallet: "✓ Your plan is active"
   - UPI: "✓ Payment sent for checking. We will tell you when it is confirmed."
   - "Send your first update from your client portal."
   - main button **Open my plan in the portal →** to `<portal>/plan-details/<orderId>`
   - second button: back to plans
5. Already in place: the website header shows **My Portal** for a signed-in client, and plan mails link to the portal plan page.

Stays in the portal. The website shows "Continue in your client portal" with a link that keeps the choice (`<portal>/service-plan-detail/<id>?<choiceQuery>`), which works today:

- **Plans that need a project** (`dependency: project_required`). The backend refuses them on the standalone surface. The portal sells them through Add a Service inside a project.
  - Dependency values (backend `helpers/serviceDependencyRules.js`):
    - `project_required`: project only
    - `standalone_or_project`: both
    - `standalone_only`: standalone only
    - no value: allowed (older plans)
- **Payment offers** (pay later / limited uploads). The offer chooser exists only in the portal (`components/ServiceOfferSelector.js`). The website buys with standard payment and shows a small line: "Have a payment offer? Continue in your client portal."
- **A client signed in under another role** (`session.portalActiveRole !== "customer"`): the link plus "switch to your client role".

Not a client: no change (section 3).

### 4.2 Verified facts (29 Oct 2026)

**Purchase API**, backend `controller/order/customerCreateServicePlanOrder.js`, `POST /api/customer/service-plan-order` (authToken):

- It re-reads and re-prices the plan (`helpers/servicePlanPurchase.js resolvePurchase`) and enforces the dependency rule.
- It decides the wallet/UPI split from the real `walletBalance`:
  - the wallet part is debited at once (`deductWalletInstant`) and settles the invoice
  - the UPI part becomes a pending transaction for admin approval
  - fully wallet-paid means the order is approved and `settleServiceCycle` runs
- Body:
  - `planId`, `purchase`, `tenureMonths`, `files`, `updates`, `releaseMode`, `quoteKey`, `purchaseKey`
  - `paymentDetails: { transactionId, upiTransactionId }`
  - `upiTransactionId` is required when the wallet does not cover the price.
- A flexible plan needs `quoteKey`; a changed price gives **409** and nothing is bought.
- Reply: `{ orderId, finalPrice, walletPaid, upiPending, invoiceId, servicePlanStartDate, servicePlanEndDate }`.
- Callers today:
  - portal `pages/ServicePlanDetail.js`
  - portal `components/AddServiceModal.js` (with `linkedProjectOrderId`)
  - backend tests `flexiblePlansPhase1.test.js` and `offerPaymentPolicy.test.js`; both set `req.userRole = 'customer'`
  - script `scripts/verifyNonBatchPaymentRegression.js`
- Admin "start plan for client" is a **different** controller (`servicePlanAdmin.startPlanForClient`, `POST /api/admin/clients/:customerId/service-plans`). It is not affected by changes here.

**Role:**

- The purchase API has **no** customer-role check today.
- The existing pattern to copy is `controller/order/servicePlanQuote.js customerCatalogue`: `if (req.userRole !== 'customer')` → 403 "Switch to your customer role…".
- `req.userRole` comes from the token (`middleware/authToken.js`).
- Sign-in sets `customer` for a client. It sets `member` only for an account with `member` and without `customer` (`controller/user/userSignIn.js`).

**Double payment:**

- Both portal callers **already send** `purchaseKey` (`crypto.randomUUID()`).
  - `ServicePlanDetail.js` makes one key per page.
  - `AddServiceModal.js` renews it with `setPurchaseKey`.
- The backend uses the key only on the deferred-offer path:
  - `serviceOfferPurchaseKey = "<userId>:<key>"`, with `serviceOfferPurchaseHash` over plan, offer, project and choice
  - a repeat returns the earlier order; a different choice with the same key is refused
- `models/orderProductModel.js` already has `serviceOfferPurchaseKey: { unique: true, sparse: true }`.
- The normal (wallet/UPI) path has no guard. The portal only disables the button.
- Note: the normal path saves the order before taking the wallet money. That ordering already exists and is not changed here.

**Quote with key:** `POST /api/customer/service-plan-quote` (authToken) returns `{ planId, quote, quoteKey }`. The website's public quote (`/api/integration/plan-catalogue/quote`) has no key.

**Wallet balance:** `GET /api/user-details` returns `data.walletBalance`. The website already calls this route for the session (`lib/portal.ts fetchAccount`), but it does not keep the balance.

**UPI payee:**

- `vacomputers.com@okhdfcbank`, name "VA Computer".
- Hard-coded in 6 portal files:
  - `pages/ServicePlanDetail.js`, `DirectPayment.js`, `InstallmentPayment.js`, `InvoiceDetailPage.js`, `StartNewWebsiteCustomize.js`, `WalletDetails.js`
  - `components/AddServiceModal.js`
- In backend mail text: `helpers/emailDefinitions.js` lines ~322 and ~706. Those are the original texts of editable templates; the live wording is stored in the database.
- In backend invoice PDF text: `helpers/emailService.js` ~383.
- No backend route serves it.
- The route to copy is `routes/index.js`: `GET /api/phone-countries`, which returns the list from `helpers/phoneNumber.js`.

**QR:**

- The website has no QR library.
- The portal uses `qrcode.react` 4.2.0 (`QRCodeSVG`). Its peer React range includes 19; the website is on React 19.2.8.
- UPI link format, from the portal: `upi://pay?pa=<id>&pn=<name>&am=<amount>&cu=INR&tn=<note>&tr=<txnId>`.

**Website plan data:**

- The backend `publicPlan()` already sends `dependency`.
- The website `PublicPlan` type in `lib/public-plans.ts` does **not** declare it, and the website never reads it today. `project_required` plans are shown and customizable now. The client link opens the portal, which then says "This plan needs a project".

**Other existing pieces:**

- After purchase: portal route `plan-details/:orderId` exists (`routes/customerRoutes.js`).
- The website header already shows **My Portal** for a client (`lib/portal.ts portalEntryFor`).
- The website forwards cookie calls with `lib/portal-api.ts portalApiRequest`, as `app/api/offer-reservations/route.ts` does.

### 4.3 Decisions (owner, 29 Oct 2026)

1. **UPI payee lives once, in the backend.**
   - A new constant in a backend helper.
   - A public read route `GET /api/payment-upi` returning `{ upiId, payeeName }`, built like `GET /api/phone-countries`.
   - The website reads it from there. The invoice PDF text (`emailService.js`) uses the same constant.
   - Mail templates are not changed: their live text is editable in Communication.
   - The 6 portal copies move to this route later, as a separate small task.
2. **QR in the website with `qrcode.react`** (same library as the portal), added to `merasoftware/package.json`. No QR in the backend.
3. **Backend role check:**
   - `customerCreateServicePlanOrder` refuses `req.userRole !== 'customer'` with 403 "Switch to your customer role to buy a plan.", copied from `customerCatalogue`.
   - Real clients are unaffected (the portal page already requires the customer role). The admin start-for-client path is separate.
4. **Backend double-payment guard, reusing the existing key:**
   - The normal path also honours `purchaseKey`, with the same `"<userId>:<key>"` + hash logic and the same unique index as the deferred path.
   - A repeat with the same key and same choice returns the earlier order's result and takes no money. The same key with a different choice is refused.
   - If an earlier order with that key has no payment record, answer "Previous purchase needs review; no duplicate purchase was created", as the deferred path does.
   - The key stays optional, so older callers keep working. The website always sends it, and both portal callers already do.
   - Move the existing deferred-path code into one shared block. Do not write a second copy.

### 4.4 Build steps

Back up before each step (website `work49`, backend `work33`). After permission, build all steps, then report once.

1. **Backend** (`E:\Allprojects\backend`):
   - Purchase controller:
     - customer-role check (decision 3)
     - `purchaseKey` guard for normal purchases (decision 4)
   - Payee constant and `GET /api/payment-upi` (decision 1).
   - Tests:
     - non-customer gets 403
     - same key twice charges the wallet once and returns the same order
     - same key with another choice is refused
     - no key still works
     - existing `flexiblePlansPhase1`, `offerPaymentPolicy`, `emailControl` and `planRequest` suites pass
2. **Website server route** `app/api/plan-checkout/route.ts`. This is a pass-through only; no business logic.
   - `PATCH` (prepare):
     - same-origin check
     - signed-in client with active role `customer`
     - `portalApiRequest` POST `/api/customer/service-plan-quote` with the cookie, for quote + quoteKey
     - GET `/api/user-details` for `walletBalance`
     - GET `/api/payment-upi`
     - returns `{ quote, quoteKey, walletBalance, walletPart, upiPart, upi }`. The split is display only; the backend decides again.
   - `POST` (pay):
     - forwards `{ ...choice, quoteKey, purchaseKey, paymentDetails }` to `/api/customer/service-plan-order` with the cookie
     - returns `{ orderId, walletPaid, upiPending }`
     - 409 becomes "The price changed. Check the new price and pay again."
3. **Website data:** add `dependency?: "project_required" | "standalone_or_project" | "standalone_only" | null` to `PublicPlan`, and a helper `buyableOnWebsite(plan)`, which is false for `project_required`.
4. **Website UI** (`components/plans/plan-builder.tsx`, `plans.module.css`):
   - Client "Get this plan" opens **Confirm and pay** in the "Your plan" box. It shows the amount, wallet part, UPI part and the portal line from 4.1.
   - **Pay** and **Continue to UPI**:
     - The QR uses `QRCodeSVG` with the backend payee on a white background, plus a 12-digit reference input (`/^\d{12,}$/`).
     - `transactionId` is `SVC<time><random>` as in the portal, made once per attempt.
     - `purchaseKey` is a `crypto.randomUUID()` per confirm, renewed when the choice changes or after success.
   - The button is disabled while sending.
   - The success panel shows the 4.1 texts and **Open my plan in the portal →** to `<portal>/plan-details/<orderId>`.
   - Project-required, offer and other-role cases show the portal link (4.1).
   - Phone bar: the button opens the same panel and scrolls to it.
   - Members and visitors are unchanged.
5. **Tests and proof.** Website unit tests:
   - `buyableOnWebsite`
   - the checkout request shape
   - 12-digit reference rule

   Browser proof uses real backend controllers on an in-memory MongoDB (copy the pattern in section 6), with the mail provider mocked. Cover:
   - wallet only: the success panel shows "active", and the order is approved
   - wallet + UPI: the QR shows the remainder only; reference sent; a pending transaction
   - UPI only
   - a price change between prepare and pay gives 409 and the new price
   - double click / repeat makes one order and one wallet debit
   - a member or visitor never sees the pay panel
   - a project-required plan gets the portal link
   - a staff + client account gets the switch-role note
   - phone layout with no sideways scroll
   - the portal `plan-details/<orderId>` link

**Done means:** a client can buy on the website with wallet, UPI or both, and gets one order and one payment. The backend refuses non-clients and repeats. The success panel sends the client to the plan in the portal. Every check above passes, and nothing changed for portal buyers.

## 5. Other open items from today

- **Uncommitted, awaiting owner review:**
  - portal: `PlanBuilder.js`, `ProtectedRoute.js`, `planAuthReturn.js`, `serviceTenure.js`, `ServicePlanDetail.js`, `tests/customer-plan-flow.test.mjs`
  - website: the plan page, `plan-builder.tsx`, `plans.module.css`, `public-plans{,-server}.ts`, `tests/public-plans.test.ts`, `app/api/plan-request/`
  - Backend part is committed (`62d4759`).
- **Deploy order:** backend first, then portal and website. Then turn "Plan request (admin)" mail On in Communication and check visitor, member and client on live.
- **work46 header fix** (plan page title centred, Back at the left): keep or revert. Backup: `backup/merasoftware/work46-plan-header`.
- **Member lead in Trash:** a new request returns "Your earlier request is with our team. Please contact us directly." This is the same rule as offer reservations; the owner may change it.
- **Later, separate tasks:**
  - a "My plans" box on the website `/account` page, linking each plan to the portal
  - the 6 portal UPI copies read `GET /api/payment-upi` (after section 4)
  - the guest/demo removal phase (decision 9)
  - many code comments cite old plan.md section numbers (e.g. "§0.2 P4", "§4 Price"); fix them when those files are next touched

## 6. Checks

Run from each repo root:

```powershell
# backend
node --test tests/planRequest.test.js tests/emailControl.test.js tests/offerReservations.test.js tests/planCatalogue.test.js tests/servicePlanPricing.test.js
# portal
node --test tests/customer-plan-flow.test.mjs
# website
node --import tsx --test tests/public-plans.test.ts
```

Browser proof:

- Website: run `next dev` with `NEXT_BUILD_DIR=.next-plancheck` and `DATA_DRIVER=json`. Afterwards delete `.data` and `.next-plancheck`, and revert `tsconfig.json`, which `next dev` rewrites.
- Portal: a page can be bundled alone with esbuild + Playwright, as in `frontend/tests/offer-reservations-browser.cjs`.
- Use real backend controllers on an in-memory MongoDB. Never use the website `.env.local` database.

Known: website `npx tsc --noEmit` fails only on the stale ignored `.next-build/types/validator.ts`.

## 7. Safety and backups

- Live sites:
  - `https://www.merasoftware.com` (website)
  - `https://portal.merasoftware.com` (portal)
  - `https://api.merasoftware.com` (backend)
- Live data, real mails/WhatsApp, commit, push and deploy only with the owner's permission. Never print secrets or overwrite env files.
- Payment rules stay: the wallet is the customer's own money and is debited at once; UPI waits for admin approval; an order is created only together with its payment.
- Backups go only in `E:\Allprojects\backup\<repo>\workNN`. Next free: website `work49`, portal `work28`, backend `work33`. Verify they are free first.
