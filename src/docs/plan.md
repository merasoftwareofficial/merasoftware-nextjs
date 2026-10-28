# Flexible Plans - closure and next-agent handoff

Updated: 28 Oct 2026. Current SSOT; completed execution steps are replaced by outcomes and code owners. Full previous document is backed up (section 7).

## 1. Resume here

**State:** admin management, customer discovery and project-category selection are implemented and locally verified. Approved legacy cleanup is applied. Latest category/cleanup changes are uncommitted; deployment and owner acceptance are unverified. The initiative is not fully closed.

**Next action:** fix the reproduced inline category-draft warning gap (section 4.1), then owner review/deployment and UI acceptance before duplicate-editor removal. This closure updates documentation only.

| Repository | Root | Last completed stage commit |
|---|---|---|
| Backend (Express/Render) | `E:\Allprojects\backend` | `eb3219d` |
| Portal (React/CRA) | `E:\Allprojects\frontend` | `fa81e93` |
| Website (Next.js) | `E:\Allprojects\merasoftware` | `6a2d687` |

Verify target path, AGENTS instructions, git status and code before acting. Preserve uncommitted category helper/controller/tests, both managers/pickers, website catalogue-reader simplification, approved route/API/cron/script deletions, cron preview/test and handoff/index docs. Both new picker files need inclusion when committed. Do not repeat completed stages or reset working trees.

## 2. Completed behavior and decisions to preserve

- **Core flow:** fixed/flexible plans, backend quotes, saved purchase choices, wallet/UPI and admin client-start, renewals, upload allowance/status/history and no-upload work updates. Catalogue edits preserve sold snapshots/cycle prices. Tenure is at most the plan limit, capped at 12 months. Allowance carries within a paid cycle and lapses at cycle end; one-time upload validity defaults to 90 days. Rejection restores allowance once within the same cycle.
- **Portal admin:** full catalogue/category manager using backend save/quote/lifecycle APIs and `expectedUpdatedAt` revision checks (stale edits return 409). URL stays `/admin-panel/website-management/plans`; old `/admin-panel/website-management/services/add` redirects into creation. Website editor stays until portal acceptance.
- **Customer UI:** Explore Services category cards use the shared on-sale catalogue and existing PlanBuilder. Quotes are requested for selections, not every card. Unavailable/project-required plans are handled; chosen plan IDs survive normal/guest login and password-reset save/skip. Changed selections invalidate stale quotes. Existing offer-return rules remain; website estimator choices are not transferred, only the plan ID.
- **Category correction:** both editors offer existing plan categories, project categories and independent showcase categories. Explicit confirmation reuses a linked category; multiple matches require a choice and archived matches require explicit revision-checked restore. New project-derived keys are deterministic with unique-key race protection. Opening/selecting the option writes nothing. Independent categories have `linkedProjectCategory: null`. Project and showcase labels remain separate; linkage is classification, not purchase eligibility.
- **Approved A-D/F cleanup:** removed mock `UserUpdateDashboard`/`my-updates`, twelve unused portal API entries, eight legacy routes/seven route-only controllers, old renewal cron/start, obsolete overdue/pause writers and six unused legacy scripts. Cron preview reflects retirement. Review found no remaining runtime callers for deleted items. Exact deleted files remain visible in git diff and external backups.
- **Retained deliberately:** `monthlyInvoiceModel`, old-bill readers/payment/document/mail handlers, current `servicePlanRenewalCron.js`, guarded `readOnlyAuditFlexiblePlans.js`, `applyLivePlanSettings.js`, and all customer uploads/files/notes/snapshots/bills/invoices/transactions. No production data was deleted or migrated by this work.

**Architecture:** website showcases; portal delivers/administers services; backend/database owns catalogue, pricing, purchase, allowance and lifecycle. Portal becomes sole editor only after acceptance. Projects are separate jobs; packages remain marketing-only in this scope. Preserve existing checkout; no frontend final-price engine or second category store.

## 3. Code owners: first files to open

Backend paths are relative to its root; portal paths to `frontend/src`; website paths to `merasoftware/src`.

| Concern | Owner / entry point |
|---|---|
| Stored settings, save and lifecycle | backend `models/productModel.js`, `helpers/servicePlanCatalogue.js`, `catalogueRevision.js`, `servicePlanLifecycle.js`; `controller/admin/planCatalogue.js` |
| Categories/project references | backend `helpers/planCategories.js`, `projectCategories.js`, `models/servicePlanCategoryModel.js`, `controller/admin/planCategories.js` |
| Admin UI/adapters | portal `pages/AdminPlansPage.js`, `components/admin/{AdminPlansManager,PlanCategoryPicker}.js`, `helpers/{adminPlanForm,adminPlanApi}.js`; website `app/admin/plans/{plans-manager,plan-category-picker}.tsx`, `lib/service-plans{,-server}.ts`, `app/api/plans/route.ts` |
| Shared sale catalogue | backend `helpers/servicePlanPublicCatalogue.js`, `controller/order/servicePlanQuote.js`; customer `GET /api/customer/service-plan-catalogue`; admin `GET/PATCH /api/admin/plan-catalogue`, category `PATCH /api/admin/plan-categories` |
| Price/purchase/bought terms | backend `helpers/servicePlanPricing.js`, `servicePlanPurchase.js`; order `servicePlanSnapshot` and frozen `serviceCyclePrice` |
| Cards/builder/auth continuation | portal `pages/{StartNewProject,ServicePlanDetail}.js`, `components/{CustomerPlanCards,PlanBuilder}.js`, `helpers/{customerPlanCatalogue,serviceTenure,planAuthReturn}.js`; website `lib/public-plans.ts` |
| Paid cycle/renewals/old bills | backend `helpers/serviceCycleSettlement.js`, `serviceBillingSchedule.js`, `cron/servicePlanRenewalCron.js`; retained `helpers/invoiceLifecycle.js`, `controller/invoice/monthlyInvoiceController.js` |
| Allowance/upload/history/mail | backend `helpers/serviceAllowance.js` (all limit readers), `uploadStatus.js`, `orderUploadHistory.js`, `servicePlanNotifications.js`; `plan.*` mail definitions |
| Website backend access | website `lib/sales-catalogue-server.ts`: admin cookie/role, public server-only integration bearer; preserve `/plans`, `/api/plan-quote` and integration routes |

Related routing docs: backend `docs/QUICK_INDEX.md` / `docs/CODE_AUDIT.md`; portal `DOCS/CODEBASE_MAP.md`, especially protected dormant systems in section 14a. Before Next code edits, read the relevant installed Next guide.

## 4. Remaining work, in order

1. **Inline category-draft warning: reproduced, not fixed.** Open an unchanged saved plan -> New independent category -> type a name -> All plans. Both editors lose the name without warning. Picker-local `name`/`mode` is outside existing manager dirty/navigation guards; main plan fields are protected. Similar inline state existed before the new picker, so this is an unaddressed UX gap, not a deletion regression. Include meaningful category drafts in the existing guard. Verify stay/discard, router navigation and refresh in both editors; cancel/success clear draft state, failure retains it. Preserve plan inputs; avoid a second navigation mechanism.
2. **Deployment and acceptance.** Owner reviews/commits; compatible backend first, then portal/website. Owner cannot test locally. Check admin create/edit/link/independent category, price/lifecycle; customer cards -> builder -> authorized purchase -> My Plan/payment/upload/work history; website plan -> login/reset -> same plan; project Add a Service; mobile/themes. Build/bundle text alone is not acceptance. Live test purchase/mail needs an approved action and owner-named client.
3. **Single-editor cutover.** Only after portal acceptance, obtain exact deletion-list approval. Website `/admin/plans` becomes an authenticated portal handoff; inspect editor/proxy/sidebar/`SALES_PAGES` dependencies. Preserve public plans/estimator/SEO, quote/integration routes, Offers and shared auth/sales helpers. Old portal `AdminCreateServicePage.js` / `AdminPlanProductsPage.js` are unrouted but retained until acceptance; preserve list URL/create redirect.
4. **Remaining cleanup: evidence first.** Mixed legacy branches, mail templates/catalogue/tests and schema were not blanket-approved. Re-prove callers/data use per removal -> exact approval -> backup -> checks. Three unused portal API entries remain outside approved deletions: `getPendingRenewals`, `approveRenewal`, `rejectRenewal`. Mail candidates: `sendDeveloperAssignedNotification`, `sendUpdateCompletedNotification`, `sendDeveloperAssignmentEmail`; catalogue removal affects Communication-tab rows and tests still reference the last template. Schema is last, after an approved fresh read-only inventory. Current fixed-plan save/pricing uses `servicePlan.limitScope`: keep it. Default-zero counters do not establish legacy usage. Preserve dormant socket/QR/WhatsApp systems in CODEBASE_MAP.

**Completion gate:** owner accepts sole-editor cutover and deployed discovery-to-work flow; approved cleanup passes checks; deferred items remain explicit. Next plan versions should cover unresolved findings/new owner needs, not rebuild completed functionality.

## 5. Production decisions and limits

- **Q5 confirmed:** retain all eight old monthly bills/model/payment handling; leave three overdue statuses unchanged. Only obsolete creation/renewal code was approved for removal and removed locally. No automatic cancellation or migration to regular invoices.
- **Historical inventory (27 Oct, not rechecked):** 30 project + 8 service orders, zero legacy-candidate orders/products; five service orders lack `serviceCyclePrice`, so keep snapshot renewal-price fallback. Classify by own `isServicePlan`/`isWebsiteProject` flags. No conversion script without fresh evidence.
- **Live settings pending:** `scripts/applyLivePlanSettings.js`, owner-authorized dry run -> JSON backup -> apply -> idempotency check. Intended: Website Updates/Website Features categories; Starter fixed 1490/4336/8493/16450 with monthly allowance x cycle months; Single Page Adition fixed one-time/90 days; Live Chat fixed. Keep uncategorized fallback until application confirmed.
- **Separate decisions:** verify Render `ADMIN_DASHBOARD_URL=https://portal.merasoftware.com`; `ENABLE_CRONS` was absent on 27 Oct despite a contrary code comment. B11 cron enabling; B12 wallet pay-later invoice-paid without cycle settlement; order `6a90417d77eae0db8156833d` allowance 1 -> 3; Live Chat placement; Adition rename. Per-client price overrides deferred. Do not change financial policy during UI cleanup.
- Production: `https://portal.merasoftware.com`, `https://api.merasoftware.com`, `https://www.merasoftware.com`. Live reads/writes and commit/push/deploy need owner authorization. Audit entry: `scripts/readOnlyAuditFlexiblePlans.js`, inspect write guard first. Backend `.env` targets development; production credentials were stored in `.env.portfolio.local`. Never print secrets, overwrite env files or run production commands from these notes alone.

## 6. Verification

Latest independent review, 28 Oct: no harmful deletion/broken remaining caller found; fresh backend **336/336**, website **42/42**, both actual category-editor browser proofs pass. Portal helper tests **7/7**, final-tree production build and tracked website types passed before review; no app code changed during review/closure.

Separate old-bill fixture proof: admin read/settlement works, customer mark-paid denied, all eight records retained, other overdue bills/current service unchanged, sequential retry adds no duplicate receipt. This does not prove concurrent payment atomicity, live bill state or real provider delivery.

Run appropriate checks after code changes from each repo root:

```powershell
# backend
node --test tests/*.test.js
# portal
node --test tests/admin-plan-form.test.mjs tests/customer-plan-flow.test.mjs
npm run build
# website: baseline 33 + plans 9
node --conditions=react-server --import tsx --test tests/package-pages.test.ts tests/offer-packages.test.ts tests/offers.test.ts tests/offer-quote.test.ts tests/session.test.ts tests/page-content.test.ts tests/public-plans.test.ts tests/service-plans.test.ts
```

Focused backend tests: `tests/{planCategories,planCatalogue,customerPlanCatalogue,cronFirstRunPreview,flexiblePlansAudit}.test.js`. Browser harnesses use actual UI/controllers with fixture databases; customer purchases/providers are mocked. They do not replace deployed shell/provider acceptance.

Known tooling limits: CRA runner lacks `@testing-library/jest-dom`; do not claim it passes. Portal build has existing unrelated warnings. Website standard `npx tsc --noEmit -p .` can hit stale ignored `.next-build/types/validator.ts` referencing a removed campaign page. Tracked source/tests passed with external `backup/merasoftware/work36-plans-stage1/tsconfig.tracked.json`. A local Next workStore build error was also previously observed. Report tooling limits separately; no source/tsconfig workaround was introduced.

## 7. Backups and maintenance

Absolute base: `E:\Allprojects\backup`; paths below are relative. Rollback copies stay outside repos.

| Purpose | Location |
|---|---|
| Admin/customer implementation | backend `work26-plans-stage1` / `work27-plans-stage2`; frontend `work15-plans-stage1` / `work16-plans-stage2`; merasoftware `work36-plans-stage1` / `work38-plans-stage2` |
| Category correction/mock cleanup | backend `work28-plans-combined`; frontend `work17-plans-combined`; merasoftware `work41-plans-combined` |
| Approved C/D/F deletions | each repo's `work-stage3-cdf-approved` (prior files and verification logs) |
| Latest independent evidence | backend `work29-plans-review/{backend-tests.log,old-bill-proof.cjs,old-bill-proof.log}`; frontend `work18-plans-review/{category-browser.log,category-review.cjs,category-review.log}`; merasoftware `work42-plans-review/website-tests.log` |
| Reusable browser harnesses | frontend `work15-plans-stage1/browser-check.cjs`, `work16-plans-stage2/browser-check.cjs`, `work17-plans-combined/category-browser.cjs`; review harness also reproduces draft-warning gap |
| Full doc before this closure | merasoftware `work43-plan-closure/plan.md` |

Next numbered backup candidates: backend work30, frontend work19, merasoftware work44; verify availability. Back up affected files before first change. Completed deletion approvals do not authorize other candidates. Preserve customer history and unrelated changes.

After meaningful work, replace affected status, next action, owners, checks/evidence and gates here; update code maps when facts change. Distinguish implemented, locally verified, committed, deployed and owner accepted. Keep one current explanation; do not append completed checklists, chat history or a parallel plan. Next agent resumes at section 4, item 1.
