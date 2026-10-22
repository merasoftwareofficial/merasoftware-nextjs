# Project Categories SSOT — hand-over

Last updated: 22 October 2026 (Asia/Calcutta). Read this before touching project categories, the portal "Project Categories" page, project creation, features, packages or website offer categories. Companion file: `offer.md` (offer system history) in this same folder.

## 1. Status at a glance

| Phase | What | State |
| --- | --- | --- |
| 0 | Read-only production audit | Done |
| 1 | Backend SSOT (model, helper, APIs, validation, tests) | Done, **committed and live** (`da7a6a6`, verified: `/api/customer/project-categories` answers 401, not 404) |
| 2 | Portal frontend (Project Categories page, hook, forms, labels) | Done and tested, **not committed** |
| 3 | Website (offer/package editors, publish check, public cards) + small backend change | Done and tested, **not committed** |
| — | Production label backfill | **Not run.** Waiting for the owner to recreate the prod URI file (see §10) |
| 4 | Docs (QUICK_INDEX / CODE_AUDIT / backend docs) | Not started — only after the owner says "perfect" |

Nothing from Phase 2/3 is deployed. The owner pushes; the assistant does not commit or push unless asked.

## 2. Why this work exists

The owner could not add a new project category in the portal, and could not properly edit existing ones (only base price, description and starting node title; no name, no archive, no order). The old "Add Category" button only opened whichever of the four fixed categories was still empty.

Analysis showed the four category keys were hardcoded in roughly 20+ places across three repos, with inconsistent names ("Standard Website" vs "Static Website", "App Development" vs "Mobile App"). A new category therefore could not be created, used in a project, offered to customers or selected on a website offer.

The owner chose a **single source of truth (SSOT)** so that a category created in the portal automatically appears everywhere: admin project form, customer customize page, features, packages and website offers.

## 3. Owner decisions (do not re-litigate)

- SSOT, not more hardcoded lists.
- Labels: **"Standard Website"** and **"App Development"** (the admin names). Customer-created projects were previously named "Static Website" / "Mobile App"; new ones now use the admin names. Old orders are not changed.
- A new category is **admin-only by default**; the admin can open it to customers (`customerSelectable`).
- The category's starting node title **prefills** the admin project form; the admin can still type another.
- The label backfill on production runs **dry-run first**, then `--apply` only with explicit owner approval.
- Categories are **archived, never deleted** (key is permanent).

## 4. Repositories and working rules

| Area | Repository |
| --- | --- |
| Public website + website admin (Next.js 16.3.6) | `E:/Allprojects/merasoftware` |
| Portal backend (Express, Render) | `E:/Allprojects/backend` |
| Portal frontend (CRA, Tailwind v3 via react-scripts) | `E:/Allprojects/frontend` |

Working rules the owner enforces:
1. Explain/plan first, get approval, then code. "analyze/batao" = no code. "code likho/start working/haan" = code.
2. Back up every file before changing it, **outside the repos**: `E:\Allprojects\backup\<repo>\workNN`, with a `manifest.sha256`.
3. Evidence first; verify against real code/data, never assume. Before removing any backend field/system, ask.
4. Never put production credentials in `.env`. Local backend `.env` points at `merasoftware-dev` (empty).
5. Do not use `sed -i` on frontend files (mixed CRLF/LF). Use the Edit tool or a node script that matches content.
6. Owner writes Hinglish (English script) and prefers short, practical answers.
7. Website `AGENTS.md`: read `node_modules/next/dist/docs/` before using Next.js APIs (this version has breaking changes).

## 5. Production audit (Phase 0, read-only, 22 Oct 2026)

Script: `backend/scripts/readOnlyAuditProjectCategories.js` (counts only, no customer data). Run against `merasoftware-db`:

- 34 orders: **26 project orders** (`standard_websites` 16, `dynamic_websites` 9, `cloud_software_development` 1) + 8 service plans.
- Orders with a project snapshot but no `isWebsiteProject` flag: **0**. Both creation paths set `isWebsiteProject: true`, so a project in any new category is already recognised as a project — `orderStatusEngine.js` / `orderType.js` rules were deliberately **not** changed.
- Legacy catalogue products with website categories: **0** (only `feature_upgrades` 7, `service_plan` 3).
- Replacing the inline active-project lists with `isProjectItem()` changes **0** orders.
- All four categories configured: 2,500 / 15,000 / 25,000 / 60,000.
- Projects without a frozen category label: all 26 (→ backfill needed).

## 6. Design

**Store:** existing collection `categorybaseprices` (model `backend/models/categoryBasePriceModel.js`), so live prices stay where they are. Fields: `category` (key, permanent, `^[a-z][a-z0-9_]{2,39}$`), `label`, `basePrice` (null = not configured), `description`, `startingNodeTitle`, `status` (`active` | `archived`), `sortOrder`, `customerSelectable`, `updatedBy`, timestamps.

**Helper (the SSOT):** `backend/helpers/projectCategories.js`
- `BUILT_IN` — the four original categories with default label/sortOrder; rows saved before the SSOT get these defaults at read time (no migration needed).
- `locked` — `standard_websites` and `dynamic_websites` cannot be archived, hidden from customers or left without a price, because the customer questionnaire `frontend/src/pages/StartNewWebsiteBuild.js:206` sends customers straight to them.
- `RESERVED_KEYS` — legacy catalogue/plan/banner keys (`service_plan`, `website_updates`, `feature_upgrades`, `web_applications`, `mobile_apps`, `static_websites`, `app_update`, `home`, `home_second_banner`) can never be category keys.
- `requireCategoryForNewProject(key, { customer })` — admin: category must be active. Customer: also `customerSelectable` and configured (priced).
- `saveProjectCategory` — create (plain insert, duplicate → 409) or **partial** update (only fields sent), so the pre-SSOT page still works.
- `categoryUsage` — projects / features / packages per key.

**Label freezing:** every new project stores `projectSnapshot.categoryLabel`, so renaming a category never relabels old work. Displays read only this frozen label.

## 7. Phase 1 — backend (committed, live)

| File | Before | After |
| --- | --- | --- |
| `models/categoryBasePriceModel.js` | enum of 4 keys; `basePrice` required | key regex; new fields (§6); `basePrice` default null |
| `helpers/projectCategories.js` | — (new) | SSOT helper (§6) |
| `controller/admin/getCategoryBasePrices.js` | returned the 4 hardcoded keys | all categories (archived too) + `usage` |
| `controller/admin/updateCategoryBasePrice.js` | upsert of 4 keys only | create (`creating: true`) or partial update via helper |
| `controller/order/getCustomerCategoryBasePrice.js` | any of 4 keys, ₹0 if unsaved | customer rule via helper (400 if not orderable) |
| `controller/order/getCustomerProjectCategories.js` | — (new) | `GET /api/customer/project-categories` (active + customerSelectable + priced) |
| `controller/order/adminCreateProjectOrder.js` | own `PROJECT_CATEGORIES`/`CATEGORY_LABELS`; node title = typed or "Project Started" | helper validation; label from SSOT; freezes `categoryLabel`; node title = typed → category's → "Project Started" |
| `controller/order/customerCreateCustomProjectOrder.js` | own lists, labels "Static Website"/"Mobile App" | helper customer rule; SSOT label; freezes `categoryLabel` |
| `helpers/salesPackages.js` | `CATEGORIES` const | key format check + active category on save (archived package may stay in archived category) |
| `controller/order/salesPackagesController.js` | — | admin catalogue includes `categories` (all, with status) |
| `helpers/emailDefinitions.js:43` | email showed key text ("standard websites") | frozen `categoryLabel`, key text fallback for plans |
| `models/orderProductModel.js` (projectSnapshot) | — | `categoryLabel` field (schema is strict; without it the value is dropped) |
| `routes/index.js` | — | customer categories route |
| `scripts/backfillProjectCategoryLabels.js` | — (new) | dry-run default; `--apply` sets only missing labels, `timestamps:false` keeps `updatedAt` |
| `scripts/readOnlyAuditProjectCategories.js` | — (new) | Phase 0 audit |
| `tests/projectCategories.test.js` | — (new) | 8 API/helper tests + opt-in browser test of the page |

Untouched on purpose: `orderStatusEngine.js`, `createOrder.js` (legacy catalogue flow), legacy catalogue UI.

## 8. Phase 2 — portal frontend (not committed)

| File | Before | After |
| --- | --- | --- |
| `src/hooks/useProjectCategories.js` | — (new) | loads categories: scope `admin` (all + usage) or `customer` |
| `src/common/index.js` | — | `customerProjectCategories` endpoint |
| `src/pages/AdminCategoryBasePricePage.js` | "Category Base Price": 4 fixed rows, fake Add | **Project Categories**: add (key auto-filled from name, permanent), edit name/price (empty = not configured)/description/node title/order/customer toggle/status, locked explanation, archived hidden behind "Show archived", usage counts, badges |
| `src/components/AdminLayout.js:41` | "Category Base Price" | "Project Categories" (same route `/admin-panel/project-setup/base-price`) |
| `src/pages/AdminClientWorkspace.js` (create form) | hardcoded dropdown; refetched the whole list on each category change | hook; active categories only; "not configured" warning; node title prefill; row labels from frozen label, raw key/N/A fallback for plans |
| `src/pages/StartNewWebsiteCustomize.js` | hardcoded 4 options; base price via `SummaryApi.customerCategoryBasePrice` | customer hook supplies options and base price |
| `src/pages/AdminFeatureProductsPage.js` | static options | hook; archived shown only if already tagged |
| `src/helpers/orderPresentation.js` | label from static list | `projectSnapshot.categoryLabel` only |
| `src/helpers/projectCategoryOptions.js` | static list + label helper | only `isFeatureForCategory` remains |
| `src/AppContent.js`, `src/pages/OrderPage.js`, `src/pages/WalletDetails.js` | own inline key lists for "active project" | shared `isProjectItem()` |

**Pre-existing money bug fixed as a side effect:** commit `7f64129` ("project catalogue system removed") deleted `SummaryApi.customerCategoryBasePrice`, but the customize page still used it. The thrown error was swallowed, base price became ₹0, so the customer's estimate and first payment covered **features only**, while the backend charges base + features. The customize page now gets the base price from the customer categories API. Past customer orders affected by this were **not** investigated (owner may ask for a read-only check).

## 9. Phase 3 — website (not committed)

| File | Before | After |
| --- | --- | --- |
| `src/lib/sales-packages.ts` | `PROJECT_CATEGORIES` const; `category` typed to 4 keys | `ProjectCategory` type, `categories` on catalogue, `categoryLabel()`, `categoryChoices()` (active + already-selected) |
| `src/lib/offers.ts:42` | enum of 4 keys, max 4 | key regex, no duplicates, max 100 |
| `src/app/api/offers/route.ts` | only plans checked against portal | when publishing to projects: each category must exist in the portal; a newly added archived one is refused, one already on the saved offer may stay; drafts unchecked |
| `src/app/admin/offers/offers-manager.tsx` | static category checkboxes | portal list; "(archived)" suffix; loading / failure message |
| `src/app/admin/packages/packages-manager.tsx` | static select/labels | portal list and labels |
| `src/components/campaign/staff-packages.tsx`, `src/app/campaign/packages/page.tsx` | static labels | labels from public catalogue `categories` |
| `tests/offers.test.ts` | expected `"social"` to fail (enum) | format/duplicate rules |
| backend `controller/order/salesPackagesController.js` (integrationRead) | packages only | also active `categories` (key + label) for public cards |

## 10. What remains — in this order

1. **Backend push** (integration endpoint now sends `categories`). Owner pushes.
2. **Production backfill** — required before the portal goes live, otherwise customers see a blank category on the 26 old projects (displays read only the frozen label).
   - Owner creates `C:\Users\Sandeep\AppData\Local\Temp\claude\e--account-android-app\40bc554f-9644-4a19-b0ca-0c546af70f5a\scratchpad\prod-readonly.env` containing the Render `MONGODB_URI` (last time the file held the bare URI without `MONGODB_URI=` and was named `scratchpadprod-readonly.env`; handle both).
   - Check the database name only (must be `merasoftware-db`), never print the URI.
   - Run with the URI in the environment, e.g. `MONGODB_URI="$(tr -d '\r\n' < FILE)" node scripts/backfillProjectCategoryLabels.js` (dry run), show the result, then `--apply` after the owner's yes. Claude Code's safety classifier blocked the first prod run; the owner then granted permission.
   - Delete the URI file immediately afterwards and confirm.
   - Expected dry run: 26 orders (standard 16, dynamic 9, cloud 1).
3. **Portal push** (only after the backfill).
4. **Website push.**
5. Live smoke test by the owner (admin login needed): create a test category, archive it, check the project form and a website offer.
6. **Phase 4 docs** after "perfect": backend `docs/sales-packages.md`, website `docs/QUICK_INDEX.md` and `docs/CODE_AUDIT.md`, `offer.md`. Every doc entry must state what changed, the exact file/function, and the previous behaviour.

## 11. Verification evidence and how to re-run

- Backend suite: `cd E:/Allprojects/backend && ls tests/*.test.js | grep -v offerPaymentPolicy | xargs node --test` → **142/142**. (`offerPaymentPolicy.test.js` is excluded: it is blocked by the known invoice index conflict, see `offer.md` §7.)
- Browser tests (opt-in): `TEST_SALES_BROWSER=1 node --test --test-name-pattern="browser" tests/projectCreateForm.test.js tests/projectCategories.test.js` → 2/2. The first exercises the real admin project form with the real hook (category prefill, price adjustment); the second the real Project Categories page with compiled portal Tailwind (screenshots in a temp folder printed by the test).
- Portal production build: `react-scripts build` into a temp `BUILD_PATH` succeeded; no new lint warnings in changed files.
- Website: `npx tsc --noEmit` clean; scoped eslint clean; `node --conditions=react-server --import tsx --test tests/admin-offers.test.ts tests/offers.test.ts` → 7/7.
- Website isolated browser verifier: `node E:/Allprojects/backup/category-ssot-website-verification/verify.cjs` → 9/9 checks, 3 consecutive passes. It copies the source, runs Next dev on an in-memory MongoDB with a fixture portal, never touches live data. **Must use `DATA_DRIVER=mongo`:** the JSON driver writes `.data/` inside the watched checkout, Next dev then reloads pages mid-test and results become flaky. Delete `report.json` before each run (a stale report once caused a wrong conclusion).
- Known pre-existing failure, not related: website `tests/offers-mongo.test.ts` expects the old offer deadline (20 Oct) while the default is now 2 Nov.
- Known pre-existing: every page in the isolated Next dev server loads twice (seen on untouched `/about` too).

## 12. Out of scope / known issues (do not fix without approval)

- Dead code: `UploadProduct.js`, `AdminEditProduct.js`, `AdminProductCard.js`, `UploadBanner.js`, `AdminEditBanner.js`, `AdminBannerCard.js`, `productCategory.js`, `compatibleWithOptions.js`, `defaultFields.js`, `sampleStartNewProjects.js`; backend `validateUpdatePlan.js` (route exists, frontend never calls it).
- `createOrder.js:40` legacy catalogue flow omits `app_development` (no live products use it).
- `ProjectDetailView.js` / `DraftOrderCard.js` keep their own labels/styles — they read legacy catalogue products, not project categories.
- Website portfolio `category` is free text seeded from the order key; not part of this work.
- Offer payment-policy feature is incomplete and blocked by the invoice index conflict (`offer.md`). The offer reminder cron is left untouched; it does not run in production because `ENABLE_CRONS` is not set — enabling it would start an untested reminder job.

## 13. Backups (outside repos)

| Path | Contents |
| --- | --- |
| `E:\Allprojects\backup\backend\work1` | offer selling-price change originals |
| `E:\Allprojects\backup\backend\work2` | Phase 1 originals |
| `E:\Allprojects\backup\backend\work3` | `salesPackagesController.js` before Phase 3 |
| `E:\Allprojects\backup\frontend\work1` | offer selling-price change originals |
| `E:\Allprojects\backup\frontend\work2` | Phase 2 originals (incl. `AdminLayout.js`) |
| `E:\Allprojects\backup\merasoftware\work1` | Phase 3 originals (incl. `tests/offers.test.ts` from git HEAD) |
| `E:\Allprojects\backup\category-ssot-website-verification\` | website verifier, report, screenshots, logs |

Each `workNN` has a `manifest.sha256`. For a rollback, restore only that change set from its backup; never reset the whole repository.

## 14. Related work done in the same session (context only)

**Offer no longer locks the project selling price** (backend + portal, committed in `6dd6a99`): selling price = offer/package price + features + signed `priceAdjustment` with a client-facing `adjustmentLabel` (required when non-zero). Agreement `salesAgreement.version: 2` stores the adjustment; version 1 `adminDiscount` still renders for old orders. Backend still returns 409 when `sellingPrice ≠ quote + adjustment` (stale-quote guard). Files: `backend/helpers/projectPricing.js`, `helpers/paymentRecording.js`, `helpers/generateInvoiceDocumentPdf.js`, `frontend/src/pages/AdminClientWorkspace.js`, `frontend/src/components/ProjectAgreement.js`. `offer.md` does not record this yet (docs pending "perfect").

**Pending owner approval, not started:** offer editor pricing UI — the discount amount/percentage field renders after the whole Payment timing section (`offers-manager.tsx`), far from "Pricing rule"; proposed to group pricing rule, discount field and prices in one section and make the auto-calculated Offer price read-only for discount rules.
