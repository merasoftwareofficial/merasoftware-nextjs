# Pricing & Packages menu — package pages

Last updated: 25 October 2026 (Asia/Calcutta). Read this before touching the header menu, `/packages/[slug]`, the package editor's "Show on pages" section or `package.pages`.

## 1. Status

| Step | State |
| --- | --- |
| Backend (`pages` field, page check, unlink route, backfill script, tests) | Done, committed `cf02c8f`, **live**. Proof: `PATCH https://api.merasoftware.com/api/admin/sales-packages/page-unlink` answers 401, while a route that does not exist answers 404 |
| Website (settings, admin editor, page, menu, SEO, links, tests) | Done, committed `3422bc7`, **live**. Proof: `/packages/one-time-packages` answers 200 and is in the sitemap; `/campaign/packages` answers 404 |
| Production backfill (existing packages → One-Time page) | **Done 25 Oct 2026.** Dry run on `merasoftware-db` listed 7 packages; the owner applied it. A read-only check shows all 7 with `pages: ["one-time-packages"]` (5 published, 2 archived). The live page shows the 5 published cards. The temporary `BACKFILL_PROD_MONGODB_URI` line was removed from backend `.env`; the file matches its backup (sha256) |

## 2. What the owner asked for (decisions, do not re-litigate)

- Header menu **"Pricing & Packages"** with sub-pages. Each sub-page is a dynamic page showing its own packages.
- A package can be shown on **one or many** pages, chosen while creating or editing the package.
- The admin **creates and deletes pages from the package editor**. A new page appears in the submenu at once.
- **Deleting a page** removes it from the menu and from every package. The packages stay, with a **"No page assigned"** badge, and are re-assigned by editing.
- Only **one page is pre-made**: "One-Time Packages". The owner creates Monthly, Business Solutions and any others in the admin panel.
- The old `/campaign/packages` page is **removed**.
- Every package page is **indexable** (sitemap, canonical, Page SEO editor). Public pages are always SEO pages; do not ask.
- Pricing, monthly prices and the "one-time" price label on cards are **out of scope**. The owner builds those.

## 3. How it works

- **Page list (website owns it):** `settings.packagePages` in the website's Mongo settings document, keyed by slug: `{ slug, title, intro, order }`. When the field is **absent**, the default list in `src/lib/package-pages.ts` (`DEFAULT_PACKAGE_PAGES` = One-Time Packages) applies and nothing is written on read. The first create or delete saves that default list first (`savedPackagePages()` in the Mongo driver). So deleting every page leaves the menu empty and the default never returns.
- **Slug is permanent.** It is made from the page name (`packagePageSlug`). Pages are created and deleted, never renamed.
- **Package side (backend owns it):** `package.pages: string[]` in the `SalesCatalogue` document `packages`. Packages saved before this work have no field and are treated as `[]`.
- **Save check:** the backend accepts only pages that the website lists. It reads them from the existing `/api/offers/live` response (`packagePages`), the same call it already makes for offers.
- **Delete order:** website `DELETE /api/package-pages?slug=` → backend `PATCH /api/admin/sales-packages/page-unlink` removes the slug from every package → only then is the page deleted from settings. If the first step fails, nothing is deleted.
- **Quote versions:** `pages` is excluded from the package `quoteKey` hash. Moving a package between pages never causes a "Package changed" 409 in the portal project form.
- **Header:** the menu reads the page list from website settings (never the Render backend), once per request via React `cache()`, in a Suspense slot. The fallback shows "Pricing & Packages" without sub-pages, so the header does not shift. If the read fails, the sub-pages are hidden and the page still renders. With zero pages, the menu entry is hidden.

## 4. Changes, with before → after and exact location

### Backend (`E:/Allprojects/backend`)

| File / function | Before | After |
| --- | --- | --- |
| `helpers/salesPackages.js` `validatePackage` | no page field | accepts optional `pages` (max 30 safe slugs, de-duplicated); missing = `[]` |
| `helpers/salesPackages.js` `quotePackage` | `quoteKey` hashed the whole package | hashes the package **without** `pages` |
| `helpers/salesPackages.js` `savePackage(raw, creating, offers, packagePages)` | — | rejects a page that the website does not list ("A selected website page no longer exists") |
| `helpers/salesPackages.js` `unlinkPackagePage(slug)` | did not exist | removes the slug from every package; returns how many changed |
| `helpers/websiteOffers.js` `fetchWebsiteCatalogue` | returned `{ offers }` | returns `{ offers, packagePages }` |
| `controller/order/salesPackagesController.js` `adminSave` / `adminUnlinkPage` | save without pages | passes website pages to save; new admin-only unlink handler |
| `routes/index.js` | — | `PATCH /admin/sales-packages/page-unlink` (authToken + admin role) |
| `scripts/backfillPackagePages.js` | did not exist | one-time backfill, dry run by default (§6) |
| `tests/packagePages.test.js` | did not exist | 5 tests: validation, quote key, page check, unlink, backfill dry-run/apply |

### Website (`E:/Allprojects/merasoftware`)

| File / function | Before | After |
| --- | --- | --- |
| `src/lib/package-pages.ts` | did not exist | type, default list, sort, slug rules, create schema, `packagePagePath()` |
| `src/lib/package-pages-server.ts` | did not exist | `readPackagePages()` (cached per request), `packagesHref()` (first page, else `/contact`) |
| `src/models/Comment.ts` `SettingsSchema` | no field (a strict schema would drop it) | `packagePages: Mixed`, no default |
| `src/lib/repo/types.ts`, `mongo-driver.ts`, `json-driver.ts` | — | `savePackagePage()` (false if the slug is taken), `deletePackagePage()` |
| `src/app/api/package-pages/route.ts` | did not exist | `POST` create / `DELETE` delete; `requireSalesAdmin` + same-origin; 401 when signed out |
| `src/app/api/offers/live/route.ts` | offers only | also `packagePages: [{ slug, title }]` for the backend |
| `src/lib/sales-packages.ts` `SalesPackage` | — | optional `pages?: string[]` |
| `src/app/admin/packages/packages-manager.tsx` (+ `.module.css`) | category/price/offer only | "Show on pages" checkboxes, "+ New page" (name + intro), "Delete page" with a confirm that shows the package count, "No page assigned" badge in list and editor, page chips in the list |
| `src/app/admin/packages/page.tsx` | "Open customer page" → `/campaign/packages` | → first package page; hidden when there are none |
| `src/app/packages/[slug]/page.tsx` | did not exist | public page; 404 for unknown/deleted slug; metadata via `pageMetadata("packages-<slug>")` |
| `src/app/campaign/packages/page.tsx` | all published packages, noindex | **deleted** |
| `src/components/campaign/staff-packages.tsx` | fixed "BUSINESS STARTER PACKAGES / Your business, ready to go online" + "One-time setup" pill | kicker "PRICING & PACKAGES", heading = page title, text = page intro; package-count pill only |
| `src/components/site-header.tsx` | flat hardcoded `NAV_LINKS` | `navEntries()` inserts the "Pricing & Packages" group after Services; `NavSlot` / `MobileMenuSlot` in Suspense |
| `src/components/nav-dropdown.tsx` | did not exist | desktop dropdown: hover/click, Escape, outside click and route change close it |
| `src/components/mobile-menu.tsx` | links only | `MenuEntry` type; a group shows its name and indented sub-pages |
| `src/app/globals.css` (last 3 lines) | — | dropdown and mobile-group styles |
| `src/lib/page-seo.ts` | static `PAGE_SEO_PAGES`, sync `pageSeoPage()` | adds `allPageSeoPages()` (fixed + package pages); `pageSeoPage()` is async |
| `src/app/admin/page-seo/page.tsx`, `src/app/api/page-seo/route.ts` (`parseAsync`), `src/lib/seo-audit.ts`, `src/lib/media-usage.ts` | read `PAGE_SEO_PAGES` | read `allPageSeoPages()` |
| `src/app/sitemap.ts` | no package pages | every package page, weekly, priority 0.8 |
| `src/lib/link-options.ts` `linkGroups()` | no package pages | "Pricing & Packages" group, so content links can point at them (and pass `unknownSitePaths`) |
| `src/app/page.tsx`, `src/app/services/[slug]/page.tsx` | link `/campaign/packages` | `packagesHref()` |
| `src/components/campaign/trust-campaign.tsx` (not used by any route), `src/lib/website-content.ts`, `tests/page-content-browser.mjs` | `/campaign/packages` | `/packages/one-time-packages` |
| `tests/package-pages.test.ts`, `package.json` `test:package-pages` | — | 4 tests: default/sort, slugs, JSON driver, Mongo driver (incl. concurrent duplicate create) |

## 5. Verification (25 October 2026)

- Backend: `node --test tests/packagePages.test.js tests/salesPricing.test.js tests/projectCategories.test.js` → 19/19 pass.
- Website: `npm run test:package-pages` → 4/4 pass. `tests/offers.test.ts`, `offers-mongo.test.ts` and `page-content.test.ts` → 16/17 pass. The 1 failure is **older than this work**: `offers-mongo.test.ts:35` expects `DEFAULT_OFFER.endsAt` `2026-10-20…`, while the code has `2026-11-02…`.
- TypeScript: no errors in source; only stale `.next*/types/validator.ts` referenced the deleted route (regenerated on build). ESLint: 0 errors.
- Local dev server: page 200, unknown slug 404, old route 404, correct title/canonical/sitemap, home link → new page, `/api/offers/live` returns `packagePages`, create/delete API 401 when signed out.
- Production: see §1.
- Not browser-tested: admin create/delete clicks (needs an admin login). The logic is covered by the tests above.

## 6. Production backfill (done 25 Oct 2026; kept for reference)

`scripts/backfillPackagePages.js` adds `pages: ['one-time-packages']` **only** to packages that have no `pages` field. It never changes price, scope or offer, and keeps a package the admin already saved (even with no page ticked). Optional: the owner can tick pages by hand instead.

```powershell
cd E:\Allprojects\backend
$env:MONGODB_URI = "<production URI>"      # this terminal only; never in .env
node scripts/backfillPackagePages.js          # dry run: check the database name is merasoftware-db, not merasoftware-dev, and check the list
node scripts/backfillPackagePages.js --apply  # only after the owner approves the dry-run list
Remove-Item Env:MONGODB_URI
```

Backups (taken from HEAD after the owner's reservation commits): `E:\Allprojects\backup\merasoftware\work12-package-pages`, `E:\Allprojects\backup\backend\work8-package-pages` (both with `manifest.sha256` and `HEAD.txt`).
