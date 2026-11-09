# Project from package: working doc

Created: 9 Nov 2026. Fresh start: all older .md docs were deleted on 9 Nov 2026 (archive: `E:\md-archive\allprojects-md-9nov2026.tar`, only for looking up an old decision). Code comments that name old docs are dead pointers.

**Status (9 Nov 2026):** the plan below is verified twice with real tests. The owner approved the scope of steps 1 and 2. **Nothing is coded yet; wait for "code likho".** Repos at the time of writing: backend `ba1a9d3`, website `5a7fb46`, portal `7022490`; working trees clean except the deleted `.md` files (uncommitted; the owner decides when to commit).

**Next agent, start here:**
1. Read this whole file. Do not redo what section 3 already proved; reuse the repro tests in `E:/md-archive/verification/` (`plan-verify.test.js`, `plan-verify2.test.js`; they run with `node --test` from `E:/Allprojects/backend`, in-memory database, nothing live). `package-form-preview.html` there is the dummy of the target form (also published at https://claude.ai/artifact/WNgXUUA13bYwAhzHP8dxBZ). The dummy shows the finished form including the combo part, which is **later**; for now only the Project part (name, category, powers, offer) and Website display are built.
2. Run the baselines in section 4 before changing anything.
3. Tell the owner in Hinglish what you understood and which files you will change. Wait for "code likho".

## 1. Owner's goal

Make the admin's daily work easier and remove duplicate work. Today every client project is made by hand, and the same kind of project for the same client is made again and again. Two ways must exist side by side:
- **Custom**: a project made from nothing.
- **Catalogue**: a ready-made package. It behaves exactly like a custom project; it only saves typing it again.

Later a client will start a package project by paying, through the same path. The backend owns every rule (price, payment, project); the website and the portal only show screens.

## 2. Owner decisions (9 Nov 2026)

1. **The plan system is not touched.** It works well. Per-file pricing stays in plans and services.
2. **A project gets its powers when it is created:** uploads (unlimited, or a chosen number of files), payment options, payment rule and due days, and what the client gets in the portal. A package carries these powers, so they are chosen once. A custom project gets the same powers by hand.
3. **Offer stays in custom.** An offer does two jobs: lowers the price, and limits uploads before payment. So the custom form keeps an offer option (the offers of the chosen category). Choosing an offer fills price, payment rule, due days and upload limit. With no offer chosen, the admin fills the same powers by hand. A package's running offer still applies by itself.
4. **Category works the same for a package as for a custom project.** The project's starting step and description come from the category when the project is created, so the package form only needs the category (with "+ New category", and none preselected).
5. **Per-file pricing leaves packages only.** In its place: one option, uploads unlimited or up to N files. A monthly package may stay as a fixed-price package. A combo is never monthly.
6. **Related portal services leave the package form.** The field did nothing (a reference only; no invoice, no purchase). The backend field stays untouched, because old packages hold data. A "suggest a plan after the project is complete" feature may come later; it is not part of this work.
7. **A combo package is one project: one price, one progress, one-time things only.** (Built later, step 3; not part of the current scope.)
   - It holds add-ons (features) and other one-time packages. No monthly, no per-file, no plan inside a combo. Plans and monthly services are sold separately by their own system.
   - The included parts are only for showing and billing the price in one system. They are not separate orders. The project is 100% when its work is done.
   - **Main price = the sum of all included parts**, shown automatically. The admin sets a **discounted price** on it. A running offer sets an **offer price** on it. The customer sees "separately this costs X; in this combo you pay Y".
   - **The invoice** lists every included part with its price, then one combined discount or offer line, then the total.
   - An included package is **copied** into the combo (its work and price at that moment), not live-linked. Later changes to that package do not change the combo.

8. **The combo's own powers override everything.** Uploads, ways to pay, offer rule and due days are chosen once on the combo. A part never brings its own powers; it gives only its name, its included work and its price, for the page, the invoice and the total. One project, one progress, one payment rule, one invoice. The combo counts as complete only at 100%.
9. **Provision for later (not built now): a monthly service inside a combo.** It is kept out of this work on purpose. When built later it will work like this:
   - The service shows in the price, the invoice and every total, like any other part.
   - It starts only after the project ends, and runs on its own service limits (uploads, validity), not on the project's portal limits.
   - With several services in one combo, the next one starts when the previous one expires.
   - Today a combo accepts one-time parts only, so a monthly service stays out of "Included parts" (shown disabled). Keep the part record open to a future `service` kind, with its length in months, so adding it later changes no saved combo.


## 3. Verified facts (9 Nov 2026)

- Packages are made on the website (`/admin/packages`); the Express backend on Render keeps rules and data. A package is sold as a **project**, never as a plan.
- Built and pushed 9 Nov: package settings (one-time/monthly, uploads Yes/No, Full / 2 / 3 installments, per-file monthly pricing), `/package/<id>/customize`, the package start request (`PACKAGE_START_REQUESTS_ENABLED` is **off**, so not live), the admin create form with package and "Customer's package request".
- Project creation: portal `pages/AdminClientWorkspace.js CreateProjectForClientForm` → `POST /api/admin/clients/:customerId/create-project` → `controller/order/adminCreateProjectOrder.js` → `helpers/projectPricing.js resolveProjectPricing` → `helpers/adminProjectCreation.js persistAdminProject` (project, timeline, invoice, payment, in one transaction).
- Package form: the category list is real (read from the backend). Gaps: no "+ New category" button (the website already has `components/project-category-dialog.tsx`, used in the plan form, and it saves through the backend's `saveProjectCategory`); a new package starts with `standard_websites` preselected; if the list does not load, raw keys show instead of names.
- What a package field does to a project: name, category, description, included work, terms, billing, uploads, ways to pay, prices, and an offer's price, expiry, payment rule, upload allowance, due days and reminders all go into the project's agreement. Pages, page design, display order, link and the offer's "Reserve opens" / "Reservation lasts" do not affect a project.
- A custom project has no way to set an upload limit or a payment rule today; both come only from a package's offer.
- Add-ons for a project already exist as "Additional Features / Upgrades" (filtered by category, own invoice lines, price adjustment). A plan bought inside a project already exists as "Add a Service" (its own order).
- Category effect on a custom project: description and starting step prefill, base price, the feature list, the package and offer lists. After creation the category key and name are frozen on the project (emails, labels, portfolio). Category does not change payment, installments, uploads or portal behaviour.
- One payment settles one order. This is why plans and monthly parts stay out of a combo.

- **Proven by running tests (9 Nov 2026, in-memory database, nothing live):**
  - A one-time package project has no total upload limit (limits object is null; only the 100 files per upload cap applies). `config/uploadLimits.js` says this is by design. So step 2 needs a new backend rule.
  - A custom project ignores `uploadLimit`, `portalUploads` and `paymentPolicy` sent in the body: it has no agreement and no payment policy. There is no door for powers.
  - A custom project with a package-owned offer (offer slug only, no package) is created with the offer's price, frozen `limited_uploads` policy and a working pre-payment upload gate. So the custom offer option needs **no backend change**.
  - An invoice already prints many lines and a negative "Combo discount" line, and the lines add up to the total. The package itself is one line today. Parts need changes in `helpers/paymentRecording.js buildLineItemsFromOrder` and in the agreement block of `helpers/generateInvoiceDocumentPdf.js`.
  - New category end to end works with no backend change: saved through `savePlanCategoryController` (`save_project_category`), listed by the package catalogue read, accepted by `savePackage`.
  - The category dropdown reads the real list. It can look dummy for two reasons: a new package starts preselected on `standard_websites` (`blank` in `packages-manager.tsx`), and when the list is missing the raw key shows. The existing browser test uses a fixture with one category only, so step 1 must add a multi-category and new-category check.
  - Baselines before any change: backend package/category 52/52, plan and upload suites 77/77; website package tests 20/20 and `offers-components.mjs` PASS; portal installments 3/3, `project-detail-browser.cjs` 65/65, `portal-workspace-ui.browser.cjs` PASS.

- **Offers** are owned by the website; the backend reads them from the website (`helpers/websiteOffers.js`, `/api/offers/live`). An offer applies to a project when it is published, not expired, targets projects, and lists the project's category (`helpers/salesPackages.js offerEligible`). A `fixed_price` offer cannot cost more than the regular package price (`calculateBenefit`).
- **Two invoice PDFs exist:** the modern one, `GET /invoices/:invoiceId/download` (`helpers/generateInvoiceDocumentPdf.js`, prints the invoice's `lineItems`, which the portal uses), and an older one, `GET /download-invoice/:orderId` (`controller/user/downloadInvoice.js`, prints `orderItems`). Step 3 must check whether the older one is still used.
- **Categories are hard-coded in two places that only classify an order as a project** (`helpers/orderStatusEngine.js`, `frontend/src/helpers/orderType.js`). A project made by the admin is flagged `isWebsiteProject: true`, so a new category still counts as a project. Any new creation path (the client path) must set that flag too.
- **For the later provision (read from code, 9 Nov 2026):** the plan system already starts a service after its linked project completes: a service bought with timing `after` while the project is in progress is created `pending_activation` (`helpers/servicePlanPurchase.js`, `waitsForProjectCompletion`), and project completion activates it (`helpers/serviceLifecycle.js activateAfterProjectServices`, called from `controller/order/projectNodeController.js`). Not built: creating that linked service order from a combo payment, and chaining (completion activates all pending services at once, not one after another).

## 4. Final plan (9 Nov 2026)

**Order: package system first, custom form second, client self-start third.** Package changes live in the Render backend (the one SSOT). The website package form stays the only place packages are made; it is frontend only and passes through to the backend. The portal changes only where a package change would otherwise break it. Each step changes the backend and the website together and ends with the owner's review.

### Now: the package system, with its powers (steps 1 and 2 only; owner decision 9 Nov 2026)

The **Page design section and the combo system are not touched now.** Only package creation with its powers is built: category, uploads, ways to pay, offer rule, and the per-file removal.

**Step 1. Package form cleanup (website only, no backend).**
- Two parts: "Project" (what is delivered) and "Website display" (pages, display order, link). The Page design section stays as it is.
- "+ New category" button (reuse `components/project-category-dialog.tsx`, saved by the backend's `saveProjectCategory`); no category preselected; a clear error when the category list does not load.
- Remove "Related portal services" from the form only. The backend requires `linkedPlanIds` as a list (a save without it is refused, proven by test), so the form keeps sending it: empty for a new package, the stored list for an old one.
- The category dialog needs a small `send` to `/api/plans` with `target: "category"`, as the plan form does (same admin check as the package form).
- Move the offer's "Reserve opens" and "Reservation lasts" into their own "Reservation (optional)" part.
- The Page design section is left exactly as it is. Only the small showcase fields (pages, display order, link) get a "Website display" heading.
- Order: name, category, powers, price, included work and terms, offer, website display.
- Test: the existing `tests/offers-components.mjs` fixture has one category only; add a multi-category and a new-category check (the new category appears and is selected).

**Step 2. Upload limit and per-file removal (backend + website + the portal parts it would break).**
- Backend: a one-time project can carry the plan system's own upload rule, in the plan's words (`portalAccessCount` = uploads, `filesLimit` = files in each upload; here a total, not per month).
  - **Keep the `portalUploads` Yes/No flag.** Existing projects are frozen with it. Map the form's three choices to it: unlimited = `portalUploads: true` and no limit; limited = `portalUploads: true` and a new `uploadLimit` `{ uploads, filesPerUpload }`; none = `portalUploads: false`. Add `uploadLimit` only when set (like `validatePurchase`, so old packages keep their quote key; proven by test).
  - Freeze it with the other package settings in `helpers/projectPricing.js` (`salesAgreement.package`). Enforce it in `helpers/projectUploadGate.js` (`projectUploadLimits` returns null for a one-time project today) and `helpers/uploadOrderPolicy.js` (files per upload).
  - Count like the monthly package does: update requests of this project that were not rejected (`updatePlanId` = the order), inside the upload transaction (`helpers/uploadSubmission.js`); a rejected upload gives its place back by itself.
  - Known limit (from the earlier build): an upload sent through the older non-staged path is counted without a transaction, so two uploads at the same moment could pass one over the limit.
  - `controller/order/getOrderDetails.js` sends the limit (as it sends `portalUploads` and `packageTerm`), and the portal `pages/ProjectDetails.js` shows what is left and locks the button.
  - Built as one shared rule so the custom form can use it later.
- Per-file pricing leaves **packages** only (plans and services keep it). First a read-only look at live data for packages that use it. There is no login-free route (the integration read needs the shared secret), so ask the owner: they can look in `/admin/packages` (a monthly per-file package shows "per file" on its card), or give permission for another way. Never write. No old package is changed or migrated. Only new per-file saves are refused in `helpers/salesPackages.js`; `projectUploadGate.js`, `uploadOrderPolicy.js` and `servicePlanPricing.js` stay as they are, so projects already made keep working. If live data holds a per-file package, a later save of it must be handled first.
- Website: the uploads option in the package form. Per-file controls leave package files only: `packages-manager.tsx`, `components/packages/package-builder.tsx`, `lib/package-choice.ts`, `lib/sales-packages.ts`, `lib/package-per-file.ts` and its test (committed 9 Nov in `5a7fb46`). `lib/public-plans.ts`, `lib/service-plans.ts`, `plans-manager.tsx` and every plan file stay.
- Backend per-file code to change (package only): `helpers/salesPackages.js`. Plan code that must stay: `helpers/servicePlanPricing.js`, `helpers/servicePlanCatalogue.js`, `controller/order/servicePlanQuote.js`, `models/productModel.js`.
- Portal: the project page shows the limit; per-file controls leave the package parts only: `src/pages/AdminClientWorkspace.js`, `src/helpers/packageChoice.js`. Plan files stay: `src/components/PlanBuilder.js`, `src/helpers/adminPlanForm.js`, `src/components/admin/AdminPlansManager.js`.

**Step 3 (LATER, not now). Combo package (backend + website + portal view).**
- Backend: a package holds parts (add-ons and other one-time packages, copied at that moment, not live-linked); one-time only; main price is the backend's sum of the parts; discounted price and offer price sit on that sum; the agreement freezes the parts; invoice and PDF list every part, then one combined discount or offer line, then the total. A test proves the invoice total always equals the price. Check the older `downloadInvoice.js` PDF too (see section 3).
- Website: "Included parts" in the package form, the sum shown automatically; the customer page shows "separately X, in this combo Y".
- **Proposed, not yet confirmed by the owner:** parts must be of the combo's own category (the extras category filter already works that way). Ask before building step 3.
- Included work must stay 1 to 50 lines (the backend refuses 0 and 51): fill it from the parts. The extras list must not repeat a part. New package fields enter the saved item only when present, so old quote keys do not change (proven by test).
- Portal: the create form shows the parts read-only.

### Later, not now

- **Custom form:** "From a package" or "Custom" as the first choice; offer option; hand-set powers (same shared rule). Must show the same options, order and words as the package form; a parity test in each repo guards this.
- **Client starts a package project by paying:** the client's own creation path (`controller/order/customerCreateCustomProjectOrder.js`, category base price only; wallet is debited at once, UPI waits for admin approval, installments, invoice) gets package pricing, offer and powers, and the two creation paths become one. It must set `isWebsiteProject: true`.
- **Website payment screens (the owner's first goal):** today the package customize page says "No payment now" and "Get this package" only sends a request to the team. Later the client pays there, with the screens on the website and every rule in the backend. The plan checkout (`frontend/src/pages/PlanCheckout.js`, `purchase` by wallet or UPI) moves onto the same checkout afterwards, without changing the plan system. UPI payee details are copied in 6 portal files; the website needs them from the backend, so make one backend source first.

### Baselines to run first (all passed on 9 Nov 2026)
- Backend (from `E:/Allprojects/backend`): `node --test --test-concurrency=3 tests/*.test.js` = 820/820.
- Website (from `E:/Allprojects/merasoftware`): `node --import tsx --test tests/package-*.test.ts tests/offer-packages.test.ts` = 20/20; `node tests/offers-components.mjs` = PASS; `npx tsc --noEmit` = clean.
- Portal (from `E:/Allprojects/frontend`): `node --test tests/project-installments.test.mjs` = 3/3; `node tests/project-detail-browser.cjs` = 65/65; `node tests/portal-workspace-ui.browser.cjs` = PASS.

### Checks and safety for every step
- Backup first in `E:/Allprojects/backup/<repo>/workNN` (verify the next free number). No live writes. No commit, push or deploy without the owner. Deploy: backend, website, portal.
- Backend full suite, website package tests and browser checks (no sideways scroll at 1440, 390 and 320 px), portal tests.

## 5. Gotchas found while testing

- A repro that mocks the website's offers must return them in `catalogueOffers`; the backend reads that field before `offers` (`websiteOffers.js`). An empty `catalogueOffers` hides every offer.
- `jsdom` is installed only in `E:/Allprojects/frontend/node_modules`. In jsdom, use `element.click()` for checkboxes; a plain dispatched `click` event does not toggle them.
- A project is refused uploads while its first invoice is unpaid or the order is `pending-approval`; a repro that tests only the upload rules must mark the invoice paid and the order approved first.

## 6. Rules for the next agent

- Reply to the owner in Hinglish; code, UI text and docs in English.
- Explain and verify first. Code only after "code likho", "fix karo", "haan" or "proceed".
- Back up every file before changing it, in `E:\Allprojects\backup\<repo>\workNN`, never inside a repo. Check the next free number first.
- Never write to live data; the website `.env.local` points at the production database. Never commit, push or deploy without the owner's permission. Deploy order: backend, website, portal.
- Do not use `sed -i` on Windows (it changes CRLF endings). Do not widen the scope of an approved step.
- Before removing any backend field or system, check where it is used and ask the owner. Removing a form field does not mean removing the backend field.
- Keep this file short and forward-only: owner decisions and done work, no open questions.

## 7. Second-agent code check and open questions (9 Nov 2026)

A second agent re-read the code against this file (read-only; no tests were run by it). **Previous agent: answer each item below in this section, with real command output where asked, then the second agent updates sections 3 and 4.** Once all are answered, fold the results into sections 3 and 4 and delete this section.

### 7.1 Corrections found in code (previous agent: confirm or dispute each)
1. **Website paths:** the files named in section 4 live under `src/`: `src/components/project-category-dialog.tsx`, `src/components/packages/package-builder.tsx`, `src/lib/package-choice.ts`, `src/lib/sales-packages.ts`, `src/lib/package-per-file.ts`, `src/app/admin/packages/packages-manager.tsx`. Tests are in `tests/`.
2. **Step 2 backend file list is probably too long.** `helpers/uploadOrderPolicy.js`, `controller/user/externalUploadController.js` and `controller/order/getOrderDetails.js` already read `maxFiles`, `allowance` and `packageTerm` from `projectUploadLimits()` (`helpers/projectUploadGate.js`). `helpers/uploadSubmission.js` already re-runs `assertProjectAcceptsUpload` inside its transaction with the session. So the one-time limit likely needs only `projectUploadLimits` (+ `projectPricing.js` freeze, `salesPackages.js` validation). Do you agree, or is there a reason the other files must change?
3. **Portal `pages/ProjectDetails.js` lines ~1024-1027** read `packageTerm.cycle.number`, `packageTerm.cycle.of` and `packageTerm.endsAt` and print "Monthly package". A one-time limit has no cycle and no end date, so reusing `packageTerm` as it is would crash or mislabel. The portal needs its own display for a one-time limit. Is this already planned?
4. **Non-staged upload path** (`controller/user/submitUpdateRequest.js`, when `req.uploadAttempt` is absent) saves the update request with no transaction and no allowance reservation for a project. Confirmed by reading. Was it the only known gap, and is it acceptable for a one-time limit?
5. **Allowance maths:** `helpers/serviceAllowance.js uploadAllowanceNow` can give a plain total when `releaseMode` is not `monthly` (`limit = portalAccessCount`). Did you test that a one-time total works this way, with `limitScope` and cycle fields absent? If yes, give the output.
6. **Backup numbers:** the next free website backup is `work96` (`E:\Allprojects\backup\merasoftware`); this file's pre-edit copy is saved as `work96-project-md-questions`, so the next one is `work97`. Check backend and portal numbers before each step.

### 7.2 Please paste real output (not a summary)
1. Baselines from section 4, each command with its pass/fail count: backend `node --test --test-concurrency=3 tests/*.test.js` (820/820); website `node --import tsx --test tests/package-*.test.ts tests/offer-packages.test.ts` (20/20), `node tests/offers-components.mjs`, `npx tsc --noEmit`; portal `tests/project-installments.test.mjs` (3/3), `tests/project-detail-browser.cjs` (65/65), `tests/portal-workspace-ui.browser.cjs`.
2. Output of `E:/md-archive/verification/plan-verify.test.js` and `plan-verify2.test.js` (run from `E:/Allprojects/backend`), covering: one-time project has no total upload limit; custom project ignores `uploadLimit`, `portalUploads`, `paymentPolicy`; `linkedPlanIds` missing is refused; `uploadLimit` added only when set keeps old quote keys unchanged.
3. Any test already written for the one-time upload limit, or a note that none exists.

### 7.3 Questions only the owner can answer (previous agent: ask the owner, write the answer here)
1. **Monthly packages:** per-file pricing is what gives a monthly package its updates-per-month limit today. After per-file leaves packages, a fixed monthly package is unlimited. Should the new uploads option (unlimited / limited) also apply to monthly packages, or one-time only?
   - Owner answer: _pending_
2. **What "up to N files" means:** the plan rule has two numbers: total uploads (`portalAccessCount`) and files per upload (`filesLimit`). Should the package form ask for both, or one number (total files)?
   - Owner answer: _pending_
3. **Offer limit with package limit:** an offer already limits uploads before payment (`paymentPolicyUploads`). When a package also has an upload limit, should the stricter one win, or should they count separately?
   - Owner answer: _pending_
4. **Live per-file packages:** does any live package use per-file pricing? The owner can check `/admin/packages` (a monthly per-file package shows "per file" on its card). The answer decides how the per-file removal is done and is needed before Step 2 coding.
   - Owner answer: _pending_

## 7.4 Previous agent's answers (9 Nov 2026)

The owner said: give only what you know; the next agent verifies the rest. Everything marked "run" was run today; everything marked "read" is from reading code only.

### Answers to 7.1
1. **Confirmed.** All six website files live under `src/` (`src/components/project-category-dialog.tsx`, `src/components/packages/package-builder.tsx`, `src/lib/package-choice.ts`, `src/lib/sales-packages.ts`, `src/lib/package-per-file.ts`, `src/app/admin/packages/packages-manager.tsx`); tests are in `tests/`. Portal and backend paths in section 4 are as written (checked that each file exists).
2. **Agreed: the Step 2 backend list was too long.** (read) `helpers/uploadOrderPolicy.js` and `controller/user/externalUploadController.js` take `maxFiles` from `projectUploadLimits()`; `controller/order/getOrderDetails.js` calls it; `helpers/uploadSubmission.js` (line ~94) calls `assertProjectAcceptsUpload(current, { session })` inside its transaction; the gate (`helpers/projectUploadGate.js`) refuses when `limits.allowance.remaining <= 0`. So the limit needs: `projectUploadLimits` (+ `helpers/projectPricing.js` freeze, `helpers/salesPackages.js` validation). One more change: the gate's refusal text is monthly wording ("This billing cycle's updates are used."); a one-time limit needs its own message.
3. **Not planned before; you are right.** Do not reuse `packageTerm` for a one-time limit (the portal prints "Monthly package · cycle n of m" from `cycle` and `endsAt`). Keep `packageTerm` monthly-only and send a separate key (for example `uploadLimit`: `{ uploads, used, remaining, filesPerUpload }`); the portal gets its own line for it.
4. **Yes, it was the only known gap.** New (read): for a project with a `paymentPolicy`, `controller/user/submitUpdateRequest.js` (line ~104) already refuses a request without an upload identifier ("An upload identifier is required for this offer"). The cheap fix is to extend that condition to a project that has an upload limit, so the non-transactional path never counts. The staged path (read, not tested): the transaction also writes the same order (`uploadRevision` `$inc`), so two uploads at the same moment conflict and one is retried and re-counted.
5. **Run.** `uploadAllowanceNow` works for a plain total, with no `limitScope`, no cycle fields and no `releaseMode`:
   ```
   A total, releaseMode absent, used 3 of 10: {"unlimited":false,"limit":10,"used":3,"remaining":7,"cycleLimit":10,"nextReleaseAt":null}
   B releaseMode total, used 10 of 10:       {"unlimited":false,"limit":10,"used":10,"remaining":0,"cycleLimit":10,"nextReleaseAt":null}
   C releaseMode monthly (monthly package):  {"unlimited":false,"limit":4,"used":0,"remaining":4,"cycleLimit":12,"nextReleaseAt":"2026-12-09T14:13:46.402Z"}
   D no servicePlanSnapshot (a project):     {"unlimited":false,"limit":0,"used":0,"remaining":0,"cycleLimit":0,"nextReleaseAt":null}
   ```
   Case D matters: a project has no snapshot, so the one-time limit must pass `servicePlanSnapshot: { portalAccessCount: N }`, as the monthly path does. Not tested: counting real update requests for a one-time project (no test exists).
6. **Backup numbers (run):** highest existing: backend `work65`, website `work96`, portal `work66`. Next: backend `work66`, website `work97`, portal `work67`. Check again before each step.

### Output for 7.2 (all run today, 9 Nov 2026)
```
$ node --test --test-concurrency=3 tests/*.test.js          (backend)
ℹ tests 820   ℹ suites 0   ℹ pass 820   ℹ fail 0   ℹ cancelled 0   ℹ skipped 0   ℹ todo 0
$ node --import tsx --test tests/package-*.test.ts tests/offer-packages.test.ts   (website)
ℹ tests 20   ℹ pass 20   ℹ fail 0   ℹ cancelled 0
$ node tests/offers-components.mjs
PASS: one package form — drafts (...), page design, optional offer with required fields, ... desktop/mobile layout.
$ npx tsc --noEmit
(no output = clean)
$ node --test tests/project-installments.test.mjs            (portal)
ℹ tests 3   ℹ pass 3   ℹ fail 0
$ node tests/project-detail-browser.cjs
65 passed, 0 failed
$ node tests/portal-workspace-ui.browser.cjs
PASS real portal layout, visual baseline and offer structure.
$ node --test E:/md-archive/verification/plan-verify.test.js E:/md-archive/verification/plan-verify2.test.js   (from E:/Allprojects/backend)
T1 OK: limits=null, uploads accepted, 100 files ok, 101 refused (system cap only)
T2 OK: paymentPolicy=null, no agreement; uploadLimit/portalUploads/paymentPolicy in the body were ignored
T3 result: 201 ... "mode":"limited_uploads" ... "uploadAllowance":2 ; gate after 2 uploads: "allowed":false,"uploadsRemaining":0
T4 lines: ["Business Starter: 9999","Logo: 2000","SEO setup: 3000","Combo discount: -1500"] sum 13499 total 13499
T5 OK: category created, listed by adminRead, accepted by savePackage
T6 baseline: per_file package saved -> per_file
P1 OK: linkedPlanIds is REQUIRED (array); the form must keep sending [] / the stored list
P2 OK: absent field keeps the key, a set field changes it
P3 OK: 0 lines and 51 lines both refused
P4 OK: offer above main price refused
ℹ tests 10   ℹ pass 10   ℹ fail 0
```
3. **No test exists for a one-time upload limit.** T1 only proves the absence of a limit today.

### 7.3 owner questions: still pending, ask the owner in Hinglish (the previous agent could not get answers)
Previous agent's recommendation for each, so the owner can simply say yes or no:
1. Monthly packages: apply the uploads option to **one-time only for now**.
2. "Up to N": ask for **both numbers**, uploads allowed and files in each upload (max 100), the plan system's words, as in the dummy form.
3. Offer limit and package limit: **both apply; whichever is reached first stops uploads** (the offer's limit only until payment, the package's over the whole project).
4. Live per-file packages: only the owner can check `/admin/packages`. Do not start Step 2 coding until this is answered.
