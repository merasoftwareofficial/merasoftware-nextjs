# Offers system — conversation handoff

Last updated: 22 October 2026, Asia/Calcutta. This file records the decisions, implementation history, verification boundaries and remaining work from this conversation. Read this before reviewing or changing the offer system.

## 1. Current state at a glance

- The website now has a dedicated **Offers** admin tab at `/admin/offers`.
- Offer management was moved out of Website Content. Its existing data, public URLs and save APIs were reused.
- The latest completed correction disables and fades project categories/package selection unless **Projects / showcase packages** is checked. Service-plan selection independently depends on its own checkbox.
- Those two admin UI changes were verified with isolated actual Next.js browser sessions, TypeScript and scoped lint.
- **The offer-driven payment-policy feature is NOT complete or fully verified.** Partial implementation exists across website/backend/frontend. Do not infer completion from visible form fields or a clean Git status.
- Its new integration tests stopped at a pre-existing invoice index conflict. The user never explicitly approved that separate index correction in this conversation.
- There is still **no package checkout**. Packages are showcase bundles and an admin project-creation shortcut.
- No production deployment was performed by the assistant for the admin relocation or checkbox correction.
- The current user request is only to create this handoff file. It does not authorize resuming the incomplete payment work or deploying anything.

## 2. Repositories and user workflow

| Area | Repository |
| --- | --- |
| Public website and website admin | `E:/Allprojects/merasoftware` |
| Portal backend | `E:/Allprojects/backend` |
| Portal frontend | `E:/Allprojects/frontend` |

The session initially opened in `E:/account-android-app`, but the user's default-project instruction points to `E:/Allprojects/merasoftware`. Verify the target path before edits.

The user communicates in Hinglish using English script and prefers short, practical answers. They explicitly said very long explanations are difficult to follow.

Important working rules:

1. Distinguish requests for explanation/analysis from permission to implement. The user repeatedly says to analyze and propose a verified plan first, then wait for approval.
2. Once a particular implementation is approved, carry out that scope and its necessary checks without repeatedly requesting the same permission.
3. Back up every existing file before changing it. Preserve byte-identical originals and a manifest; never overwrite originals with partially edited versions.
4. Do not use Git reset/revert/checkout to undo the whole workspace. “Revert your work” means undo only the assistant's own changes, preserving other work.
5. Do not delete backups, perform broad cleanup, modify live customer data for tests, or stop the owner's running servers.
6. Use isolated fixture accounts/storage/databases for write tests. Do not forge sessions against real customer accounts.
7. Never disclose integration secrets, JWT secrets, database URIs or credentials in chat or this document.
8. Do not proactively spawn agents. Current instructions prohibit delegation unless explicitly requested by the user or applicable project/skill instructions.
9. `fix-mode` was used: `C:/Users/Sandeep/.codex/skills/fix-mode/SKILL.md`. It requires evidence-first work, numbered backups, narrow scope and stopping/reporting an unexpected problem. Read it if continuing under that workflow.
10. Website `AGENTS.md` requires reading the installed Next.js documentation before code changes. This repository uses Next.js 16.3.6; do not assume older Next.js behavior.

## 3. Business model and terminology

The user reports four project categories and one actual service plan. Do not confuse these with the three example showcase packages.

### Projects

The admin prepares a project for an individual client in the portal. Categories are:

- Standard Website: `standard_websites`
- Dynamic Website: `dynamic_websites`
- Cloud Software: `cloud_software_development`
- App Development: `app_development`

A category is not an already-created project. Selecting offer eligibility never retroactively applies the offer to existing client projects.

### Service plans

Pre-created portal products a customer can purchase themselves, either standalone or as an allowed add-on to a project. Their existing dependency, activation, capability, quota, billing-cycle and validity rules matter.

The partially added service-plan offer connection is **payment timing only**. Do not tell the user that it currently discounts plan prices. It preserves the selected plan billing price.

### Showcase packages

Website bundles of included work, regular price, category and an optional linked offer. They are not portal service plans and do not activate or purchase plans.

Three sample packages were created in the earlier authorized offer/packages implementation:

| Package ID | Display name | Regular price | Offer extras | Linked starter offer result |
| --- | --- | --- | --- | --- |
| `starter` | Business Starter | ₹10,000 | ₹0 | ₹699 |
| `starter-plus` | Business Starter Plus | ₹12,000 | ₹2,000 | ₹2,699 |
| `starter-complete` | Business Starter Complete | ₹14,000 | ₹4,000 | ₹4,699 |

These are example configurations, not three additional plan products. Stored catalogue data can override defaults; do not assume the defaults are the current live DB contents.

Business Starter's sample scope: one-page business website/contact enquiry link, Google Business Profile setup/optimisation, Facebook/Instagram profile setup, WhatsApp Business profile/contact link, and one branded social post design. Plus/Complete add larger website scope and other listed inclusions. Hosting/domain/ad spend and ongoing management are separate unless agreed.

## 4. Original problem and early incident

The user initially asked for deep analysis of disconnected website offers, packages, admin-created projects, client portal displays and invoices. They wanted to know what was wrong before proceeding.

An earlier assistant started implementing before the user intended authorization. The user explicitly requested undoing only that work. They then saw approximately 111+ working files versus a displayed 12,976-line deletion and were concerned other work had been destroyed.

Earlier conversation reports attributed most of that deletion count to removed `.txt` backup copies, rather than deletion of that many source lines. It reported restoring the source state from backups. This historical explanation is not a fresh independent reconstruction of those old diffs. Do not promise that an unavailable old snapshot has been reverified now.

The user explicitly objected to broad Git reversion and repeatedly requested verification that unrelated work was intact. This is why narrow changes, retained backups and candid verification boundaries are essential.

The user later explicitly authorized the offer/package implementation after clarifying that the admin creates projects and packages do not have their own purchase system.

## 5. Earlier completed offer/packages implementation

This is historical completed work, distinct from the later incomplete payment-policy extension:

- Extended the existing starter offer (`slug: page`, title Business Growth Starter) to **2 November 2026, 23:59:59 IST** in the source default.
- Website remains the owner of offer definitions, terms, dates, pricing rules and eligibility.
- Backend owns showcase package configuration and calculates the actual project quote.
- Offer eligibility checks publication, expiry, project category and optional package restriction.
- Backend rechecks quotes and rejects changed/stale quote hashes, tampered prices and category mismatches.
- Project creation freezes its agreed package, offer, scope, terms, extra work and final pricing in `projectSnapshot.salesAgreement`.
- Optional related service-plan IDs are references; package selection never purchases or activates those plans.
- Supports explicit additional admin discounts with a required reason.
- Admin can create a project with payment to be collected later under the original flow; that originally kept the order pending approval and uploads locked.
- New project has its payable invoice plus a `project_final` summary; the summary is not another payment request.
- Invoice/PDF/client views show the frozen agreement and offer benefit.
- Installment calculations preserve exact paise.
- Added creation identifiers to protect against duplicate project submissions.
- Real package management is at `/admin/packages`; public packages at `/campaign/packages`.
  - **25 Oct 2026:** `/campaign/packages` was removed. Public packages are now on admin-made pages `/packages/[slug]` under the header menu "Pricing & Packages"; each package lists its pages (`package.pages`). See `src/docs/package-pages.md`.

Relevant existing owners:

Website:

- `src/lib/offers.ts`: offer schema/defaults/terms.
- `src/components/campaign/public-interaction/offer-content.ts`: starter offer default content/deadline.
- `src/app/api/offers/route.ts`: protected offer/terms/listing save.
- `src/app/api/offers/live/route.ts`: protected integration catalogue, active `offers` plus `catalogueOffers`, resolved terms and quote keys.
- `src/lib/sales-catalogue-server.ts`: server-side portal bridge and active portal-admin guard.
- `src/app/api/packages/route.ts`: package admin proxy.
- `src/app/admin/packages/packages-manager.tsx`: package editor.

Backend:

- `models/salesCatalogueModel.js`, `helpers/salesPackages.js`: package catalogue/defaults/quotes.
- `helpers/websiteOffers.js`: reads the website's protected catalogue.
- `helpers/projectPricing.js`: validates and freezes the project agreement.
- `controller/order/adminCreateProjectOrder.js`: admin project creation.
- `controller/order/salesPackagesController.js`: package admin/integration endpoints.
- `helpers/paymentRecording.js`, `helpers/projectInstallments.js`, `helpers/generateInvoiceDocumentPdf.js`: money, invoice and PDF behavior.
- `docs/sales-packages.md`: earlier architecture notes; it does not certify the later payment-policy extension.

Frontend:

- `src/pages/AdminClientWorkspace.js`: admin project form.
- `src/components/ProjectAgreement.js`: agreed scope/offer display.
- `src/pages/ProjectDetails.js`, `src/pages/InvoiceDetailPage.js`, `src/components/ProjectServiceWorkspace.js`: client displays.

Historical validation reported 21 backend tests including browser checks plus five website offer tests. A stronger isolated full-system run used the real Next admin page, real running portal frontend routed to an isolated backend, a ₹699 project, client project/invoice pages and the generated PDF. No service plan was purchased by package selection.

**Some artifacts from that earlier run are now missing; see the backup section.** Do not claim they still exist or that live production was tested by those isolated runs.

## 6. Live offer-listing failure and configuration discussion

The user's actual screen was the live portal:

`https://portal.merasoftware.com/admin-panel/clients/677772b13be9cb6cd7bbe3dd?tab=projects`

Its create-project form showed: “Website offers are not configured on the server.” Initial local checks succeeded, but that did not establish the live server's configuration.

Verified at the time:

- Local portal `localhost:3001` called local backend `localhost:8080`; local packages/offer integration returned success.
- Live portal JavaScript called `https://api.merasoftware.com`.
- Live integration endpoint returned **503: Sales integration is not configured**. In the backend implementation this means `PORTFOLIO_INTEGRATION_SECRET` is absent or shorter than 32 characters.
- A simulated failed catalogue request in the actual form demonstrated that the old error stays until explicit refresh/remount; changing category did not automatically retry. That was a separate observation, not proof that the live screenshot was only stale UI.
- Final website origin was verified by HTTP redirect: `https://merasoftware.com` → `https://www.merasoftware.com/`, HTTP 200.

The website is hosted on **Vercel**, backend on **Render**. Required server-side integration settings:

| Location | Setting | Meaning |
| --- | --- | --- |
| Vercel website | `PORTFOLIO_INTEGRATION_SECRET` | Same private integration secret as backend |
| Vercel website | `PORTAL_API_URL` | `https://api.merasoftware.com` |
| Render backend | `PORTFOLIO_INTEGRATION_SECRET` | Same exact private secret as website; minimum 32 characters |
| Render backend | `PORTFOLIO_WEBSITE_URL` | `https://www.merasoftware.com` |

The user could not recover the existing hidden Vercel value. They were instructed to generate a fresh 32-byte random hex secret locally with Node, set the same value on both hosts, and redeploy both affected services. The secret itself was not provided to the assistant.

The user reported setting the Render variables and starting a redeploy, with status “building.” This conversation did **not** subsequently establish a final successful live integration test with that new secret. Do not present the old 503 result as a fresh current test either.

Never use localhost URLs for the live backend connection. Do not enable all production crons on a local clone as part of debugging.

## 7. Approved payment-policy design — still incomplete

The user wanted the offer to control payment timing so eligible projects and future/self-service plan purchases could apply the agreed rules automatically, rather than relying on manual exceptions.

After several clarification rounds, the approved intended behavior was:

1. Offer creation/edit selects applicability: project categories, optional specific packages and/or specific service plans.
2. Offer payment policy: **Keep current rules**, **Advance**, **Limited uploads before payment**, or **Pay later**.
3. Advance: required payment must be recorded/approved before uploads become available.
4. Limited uploads: N successful submissions allowed before the required payment; then further uploads lock. N means submissions, not individual files. Failed uploads and retries must not double-count; parallel submissions must not overspend the last allowance.
5. Pay later: payment remains pending, with a due date and automatic reminders. Payment overdue alone should not lock uploads under this mode.
6. Original service quota, file limits, validity/expiry, cancelled/completed status, and after-project activation restrictions must still apply. “Pay later” never means unlimited service entitlement.
7. Full/installment breakup is separate from payment timing. Offer timing must not silently rewrite prices or installment amounts.
8. Service-plan policy explicitly chooses **first purchase only** or **every billing cycle**.
9. Backend validates eligibility, publication, expiry and selected quote again at creation/purchase.
10. Agreed offer/payment terms are frozen on the client order. Later offer edits/expiry must not rewrite old client agreements.
11. Money and work permission remain distinct: granting work access must not mark unpaid money paid or unverified UPI verified.
12. Due-date offsets and reminder milestones are configured in the offer; reminders must be deduplicated and stop once payment is settled.
13. Display agreed conditions in portal and invoice/PDF.
14. No retroactive migration of existing orders and no new package checkout.

### Rules uncovered during analysis

- `helpers/projectUploadGate.js` originally blocked projects awaiting approval or having a currently due unpaid installment/invoice, and always blocked cancelled/completed projects.
- `helpers/uploadType.js` distinguishes project, service and legacy uploads. Project uploads originally had no business quota/counter; service uploads use frozen `servicePlanSnapshot` limits.
- `helpers/uploadOrderPolicy.js` and `helpers/uploadSubmission.js` govern upload checks and final acceptance. Staged and external uploads must follow the same policy as normal portal uploads.
- Original plan self-purchase requires payment details and derives wallet/UPI splits server-side.
- `helpers/serviceCycleSettlement.js` originally resets cycle usage when a bill is paid. Late payment under a deferred offer must not grant the consumed uploads again or rewind a newer cycle.
- `cron/servicePlanRenewalCron.js` originally pauses a service when a renewal bill remains unpaid. Every-cycle deferred policy needs deliberate integration with that behavior.
- `helpers/serviceDependencyRules.js` owns standalone/project-required restrictions; an offer must not bypass those.
- `helpers/serviceLifecycle.js` owns activation of services configured to start after project completion; the payment clock must respect activation.
- Existing email machinery suppresses background/cron mail without a request context. Existing manual reminders target the monthly-invoice flow. Offer automatic reminders therefore need an explicit supported automatic event, not globally turning all mail builders on.
- `project_final` and `service_statement` are summaries, not extra bills to collect or remind against.

Before implementation, 17 upload tests, 20 pricing/project tests, three email reminder/background tests and five website offer tests passed across the analysis rounds (45 relevant existing tests). Focused mocked checks also demonstrated settlement reset, renewal pause, activation and background-mail suppression. **Those are baseline tests, not proof of the new policy feature.**

### Partial code introduced after approval

Website form/schema gained `targets`, `planIds` and `paymentPolicy`. Payment policy includes mode, upload allowance, due days, cycle scope and reminder offsets. API publication validation was extended for selected service plans. Automatic email-event management was partially extended.

Backend files introduced/modified include:

- New `helpers/offerPaymentPolicy.js`: frozen policy, due-date/access calculations and PDF wording.
- New `helpers/serviceOfferPolicy.js` and `controller/order/servicePlanOffers.js`: eligible service-plan payment offers/quote checks.
- New `/api/customer/service-plan-offers/:planId` route.
- New `helpers/offerServiceRenewal.js`: transactional offer-aware cycle advancement.
- New `helpers/offerProjectInvoices.js`: materialization of a currently due project installment bill.
- New `cron/offerPaymentReminderCron.js`: scheduled offer reminders.
- New `tests/offerPaymentPolicy.test.js`: isolated integration scenarios.
- Order fields for frozen `paymentPolicy`, `paymentPolicyUploads`, deferred-purchase identifiers/hashes.
- Invoice `paymentPolicyKey` for deduplication.
- Changes to project creation, service purchase, upload acceptance, settlement, service activation, PDF generation, email catalog/controller/definitions and cron registration.

Frontend partial changes include `OfferPaymentTerms.js`, `ServiceOfferSelector.js`, project/plan access displays, service purchase screens, add-service modal and admin preview of terms.

Some intended safeguards were written (e.g. deferred purchase idempotency, no automatic wallet debit on a deferred purchase, preserved cycle usage on late settlement). These remain **implementation attempts requiring review and successful integration tests**, not established guarantees.

### Why that implementation stopped

The new clean-database integration suite explicitly initialized invoice indexes and failed in setup. `models/invoiceModel.js` declares these two indexes without distinct names:

- `{ orderId: 1, invoiceType: 1 }`, unique, partial filter `invoiceType: project_final`.
- `{ orderId: 1, invoiceType: 1 }`, unique, partial filter `invoiceType: service_statement`.

Both default to the same MongoDB index name, `orderId_1_invoiceType_1`. MongoDB raises `IndexKeySpecsConflict` (code 86). The conflict was present before the payment-policy implementation, as shown in the original backup at that time; the conflicting definitions are still present in the current source checked for this handoff.

All ten new feature tests failed at setup, before exercising the feature. An earlier regression attempt had 36/37 passing and one PDF test fixture rejecting a newly introduced dependency; that call was subsequently guarded, but there was no final complete passing payment-feature run.

The assistant stopped and proposed giving the invoice indexes distinct names, explicitly requesting approval to include that correction. The user changed topic to admin organization instead of approving that index fix. Do not assume the index issue has been repaired, and do not automatically start a production index migration or clear data.

## 8. Completed dedicated Offers admin tab

The user requested an independent main tab so all offer management is in one place, outside Website Content and Section visuals. They first requested analysis and verification, then explicitly approved implementation.

Verified implementation:

- Main entry `/admin/offers` with four sections:
  - `?section=details`: All Offers, active/expired/draft/archived filters.
  - `?section=settings`: Offer Settings; `&offer=<slug>` opens an offer; `&new=1` starts creation.
  - `?section=listing`: Content & Preview, listing heading/empty text and offer card previews.
  - `?section=terms`: common Terms & Conditions; offer-specific terms stay in the selected offer editor.
- Existing editor and CSS were **moved**, not discarded, from `src/app/admin/content/` to `src/app/admin/offers/`.
- Existing pricing, applicability and partial payment-policy fields were preserved. Moving them does not certify the underlying payment feature.
- Sidebar visibility requires an active portal-admin session. The page and existing save API also enforce access.
- Website-only editor access and a portal admin switched to customer role do not grant management permission.
- Old `/admin/content?page=offers&section=details|listing|terms` URLs redirect to their corresponding new sections before the generic content fallback.
- Offers management was removed from `CONTENT_PAGES`.
- Section visuals had no registered offer slot; no visual registry was removed or changed.
- Existing settings keys, API endpoints and public `/offer` and `/offer/<slug>` URLs remain the same.
- Active/expired is derived from server time and expiry; publication status remains draft/published/archived.
- New offer save updates the editor URL so a reload opens the saved offer instead of another new-offer form.
- A shortcut links to existing `/admin/packages`; package management was not merged into a new store.

Current file ownership:

| File | Responsibility |
| --- | --- |
| `src/app/admin/offers/page.tsx` | Hub route, sections, server permission guard and initial settings |
| `src/app/admin/offers/offers-manager.tsx` | Offer create/edit, list, listing, terms and previews |
| `src/app/admin/offers/offers-manager.module.css` | Hub/editor layout and disabled-group styling |
| `src/lib/admin-offers.ts` | Section mapping, legacy destination and expiry-derived state |
| `src/components/admin-layout.tsx` | Main Offers navigation entry |
| `src/app/admin/layout.tsx` | Active portal-admin visibility supplied to the shell |
| `src/app/admin/content/page.tsx` | Legacy offer redirect and remaining website-content editors |
| `src/lib/website-content.ts` | Website content registry, now without an Offers management group |
| `tests/admin-offers.test.ts` | Deadline boundaries and safe legacy-section mapping |

Verification for this change:

- TypeScript and scoped ESLint passed.
- Seven offer/routing unit tests passed.
- Nine isolated actual Next.js browser checks passed: sidebar and filters, redirects, editor preview, cancelled unsaved navigation, PATCH/save/reload, new creation, failed-save retention/retry, listing/common terms, preservation of unrelated settings, role denial, anonymous denial and mobile layout.
- Browser writes used copied source plus isolated JSON settings and a fixture portal, not live clients/settings.
- During test setup, a random-port/origin mismatch caused a 403; fixing the isolated host/port setup resolved it without modifying the production save guard.
- Some cold Next dev runs showed a shared NavigationProgress hydration warning. Final completed browser run passed. Do not silently change the shared loader as part of offer UI work.
- Production deployment was not performed.

## 9. User's form questions and final UX decision

The user needed repeated practical clarification of these controls:

- **Projects / showcase packages** is an applicability target, not a fifth category or an existing project.
- Project categories determine which newly created projects can use the selected offer.
- **Limit to specific packages (optional)** lists the website showcase packages, not service plans. Selecting packages restricts the offer to them within matching categories. With no package restriction, matching custom projects and packages can be eligible.
- Selecting applicability alone never rewrites an existing order. Admin selects the eligible offer during project creation; the relevant new purchase selects its eligible plan offer.
- Fixed price sets the base offer bundle price; explicit extra package scope may add a charge.
- Fixed rupee discount subtracts an amount; percentage discount subtracts a percentage.
- A proposed larger redesign into separate custom-project/package/plan types was discussed but **not implemented or approved as the latest task**.

The final chosen correction was smaller: keep the existing parent target checkboxes, but make their dependency visually and behaviorally obvious.

## 10. Latest completed correction: disabled dependent fields

The user explicitly requested: “karo clean correction.”

Implemented only in the offer editor/CSS, plus focused documentation:

1. Use `selected.targets ?? ['projects']` consistently. Older offers without explicit targets retain the existing project default.
2. Native project fieldset contains the four category checkboxes and package multi-select.
3. When Projects / showcase packages is unchecked, that entire fieldset is disabled and faded (`opacity: .5`). It enables on checking the parent.
4. Native service-plan fieldset is visible but disabled/faded unless Service-plan purchases is checked.
5. Each group works independently. Checking plans does not enable project categories, and vice versa.
6. Short helper text explains which parent checkbox enables each group.
7. Toggling does not erase prior selections. Rechecking restores their usability.
8. Native disabled controls reject mouse clicks and keyboard focus; this is not merely decorative CSS.
9. Pricing rules, payment logic, APIs and saved eligibility semantics were not altered by this correction.

Validation passed:

- TypeScript and scoped lint.
- Six isolated actual Next.js browser checkpoints, including setup: legacy defaults, disabled/faded controls, click/focus refusal, independent toggles, retained selections, real save/reload and mobile layout.
- Test-only package and plan entries were supplied through the isolated fixture. No live client or offer record was edited.
- Final browser run had no browser errors after warming the isolated dev page; earlier runs exposed the unrelated cold NavigationProgress warning described above.
- Backup hashes verified. No live deployment performed.

## 11. Backups and evidence: current presence versus history

Paths were checked while writing this document. Do not equate a path mentioned earlier in chat with a file that still exists.

### Present and verified now

- Website admin relocation originals: `E:/Allprojects/merasoftware/backup/fix3/manifest.json` and its `.txt` originals.
- Relocation browser script: `E:/Allprojects/merasoftware/backup/fix3/verify-offers.cjs`.
- Relocation browser evidence: `E:/Allprojects/backup/offers-admin-fix3-verification/report.json` (passed, nine checkpoints), screenshots and isolated Next log.
- Latest dependent-field correction originals: `E:/Allprojects/merasoftware/backup/fix4/manifest.json` and four `.txt` originals (editor, CSS, QUICK_INDEX and CODE_AUDIT).
- Latest browser evidence: `E:/Allprojects/backup/offer-target-toggle-verification/report.json` (passed, six checkpoints), `verify.cjs`, screenshot and Next log.
- `docs/QUICK_INDEX.md` and `docs/CODE_AUDIT.md` describe the completed admin relocation and dependent-field correction. They explicitly do not certify the payment-policy extension.

The latest backup was initially created in the unused `fix1` directory, then moved with validated paths to `fix4`, so the numbered ordering stays clear. No original backup content was discarded.

### Historical paths currently absent

- `E:/Allprojects/backup/offer-system-20261021-203012/manifest.json`.
- Its historical `verification/recheck/full-system-results.json` and related original full-system evidence.
- `E:/Allprojects/backup/offer-payment-policy-backups.json`.
- Website `backup/fix2/manifest.json` from the incomplete payment-policy implementation.
- Backend `backup/fix1/manifest.json` from that implementation.
- Frontend `backup/fix1/manifest.json` from that implementation.

Those snapshots existed and were reported verified earlier in the conversation. They are not present at these paths now. The assistant did not delete them as part of the later admin/tab/checkbox tasks. Their absence does not establish when or why they became unavailable. Do not attempt an undo against missing snapshots or broadly reset Git to compensate.

## 12. Handoff-time snapshot and next-agent guidance

Immediately before creating `offer.md`, Git status was clean in all three repositories. Website HEAD was `2571b0d` (`offer system small correction`). The assistant did not create that commit in the recorded implementation steps. A clean tree is only a version-control fact, not proof that the incomplete payment feature passed tests or was deployed.

At this snapshot, backend `helpers/offerPaymentPolicy.js` and `tests/offerPaymentPolicy.test.js` exist, as do frontend `OfferPaymentTerms.js` and `ServiceOfferSelector.js`. The invoice index conflict definitions are still present.

For the next requested task:

1. Read this handoff, then the project's instructions and focused audit/index docs.
2. Ask/confirm only genuinely missing scope; do not assume that the user's context-file request authorizes new implementation.
3. Keep the completed admin-tab and disabled-field UX intact unless the user asks to change them.
4. If resuming payment policies, first resolve approval/scope for the known invoice-index issue, inspect current DB/index state safely, then review and run the isolated new feature suite. Do not assert completion from earlier baseline test counts.
5. Check project and service paths, standalone/add-on purchase, first/every cycle, installment eligibility, partial payments, late settlement, original quotas, external/staged uploads, cancellation/activation and automatic reminder deduplication before declaring that feature complete.
6. Live integration configuration and production deployment require fresh verification; the conversation's isolated tests are not live production evidence.
7. Retain backups/evidence. If the user requests rollback, undo only the relevant change set using verified available originals and its new-file/move manifest.

No secret values, real login tokens or customer payment evidence are intentionally included in this handoff.
