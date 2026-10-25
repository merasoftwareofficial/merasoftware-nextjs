# Website audit index

## Reservation/payment integration — 25 October 2026

Read [RESERVATION_AGENT_HANDOVER.md](../src/docs/RESERVATION_AGENT_HANDOVER.md) for the full cross-app context. Backend owns money, eligibility, snapshots and revisions; website owns catalogue content, shared quote generation, authenticated proxy and presentation.

Final local website fixes include new-period re-reservation without erasing expired history. Existing login/signup/reset continuation, phone completion and server-clock countdown remain covered. Website reservation/shared-clock browser tests 2/2 passed; TypeScript and targeted ESLint passed. Together with the portal's two browser checks and 177 distinct backend cases, this is local evidence with fixture transport/disposable databases, not live deployment/provider verification.

Final source snapshot: external `backup/merasoftware/work20-reservation-final`; this docs-only update: `work21-reservation-handover-docs`. Current working changes were not committed/deployed by the agent. Remaining rollout/index/configuration checks are in backend [RESERVATION_ROLLOUT.md](../../backend/docs/RESERVATION_ROLLOUT.md).

## Existing Offers admin ownership

The Offers manager lives at `/admin/offers`, outside Website Content. Its sections are All Offers, Offer Settings, Content & Preview, and Terms & Conditions. Package management remains `/admin/packages` and is linked from the hub.

Eligibility fields follow their parent target: project categories and package selection are disabled and faded unless Projects / showcase packages is checked; the visible service-plan selector is disabled and faded unless Service-plan purchases is checked. Native fieldsets enforce keyboard and mouse disabling. Toggling retains previous selections, and offers without explicit targets keep the existing projects default. No API, billing or eligibility rule changes accompany this UI correction. Isolated Next.js browser checks cover the independent toggles, disabled click/focus behaviour, preserved values, save/reload and mobile layout; scoped TypeScript and lint pass.

The sidebar requires an active portal-admin session. The page also calls `requireStaffPage` and `requireSalesAdmin`; the existing save endpoint independently enforces `requireSalesAdmin`. Website editor access or an admin account switched to customer role does not grant offer-management access.

Old `/admin/content?page=offers&section=details|listing|terms` bookmarks redirect before the generic content-page fallback. Other content pages retain their editors. Offers has no registered Section visuals slot; no visual registry change is needed.

Offer data retains its existing settings keys, slugs, public URLs and APIs. Active/expired list status is derived from the server clock and expiry; draft/published/archived publication values are not rewritten. The existing editor was moved, preserving applicability and payment-policy fields without modifying their underlying billing implementation.

Validation: scoped TypeScript/ESLint checks and seven offer/routing tests; isolated actual Next.js browser checks cover navigation, status filters, legacy redirects, edit/save/reload, previews, listing and common terms, unsaved-change protection, permission denial, and mobile layout. Test accounts and settings belong only to the isolated fixture. No production deployment or live-data mutation is part of this change.
