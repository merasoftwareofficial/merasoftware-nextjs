# Offers admin ownership

The Offers manager lives at `/admin/offers`, outside Website Content. Its sections are All Offers, Offer Settings, Content & Preview, and Terms & Conditions. Package management remains `/admin/packages` and is linked from the hub.

The sidebar requires an active portal-admin session. The page also calls `requireStaffPage` and `requireSalesAdmin`; the existing save endpoint independently enforces `requireSalesAdmin`. Website editor access or an admin account switched to customer role does not grant offer-management access.

Old `/admin/content?page=offers&section=details|listing|terms` bookmarks redirect before the generic content-page fallback. Other content pages retain their editors. Offers has no registered Section visuals slot; no visual registry change is needed.

Offer data retains its existing settings keys, slugs, public URLs and APIs. Active/expired list status is derived from the server clock and expiry; draft/published/archived publication values are not rewritten. The existing editor was moved, preserving applicability and payment-policy fields without modifying their underlying billing implementation.

Validation: scoped TypeScript/ESLint checks and seven offer/routing tests; isolated actual Next.js browser checks cover navigation, status filters, legacy redirects, edit/save/reload, previews, listing and common terms, unsaved-change protection, permission denial, and mobile layout. Test accounts and settings belong only to the isolated fixture. No production deployment or live-data mutation is part of this change.
