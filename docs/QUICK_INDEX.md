# Verified code routes

- Offers admin: `src/app/admin/offers/page.tsx` owns the hub, four sections and page access. `offers-manager.tsx` owns create/edit, previews, listing and common terms.
- Eligibility dependencies: the offer editor uses native disabled fieldsets for project categories/packages and service plans; `offers-manager.module.css` fades disabled groups. Parent toggles retain selections. Backup: `backup/fix4/manifest.json`.
- Navigation: `src/components/admin-layout.tsx` declares the Offers entry; `src/app/admin/layout.tsx` supplies active portal-admin permission.
- Old offer bookmarks: `src/app/admin/content/page.tsx` redirects `page=offers`; `src/lib/admin-offers.ts` maps sections and derives active/expired display status.
- Offer persistence and portal integration: existing `src/app/api/offers/route.ts`, `src/app/api/offers/live/route.ts`, `src/lib/offers.ts` and settings repositories. The admin relocation does not change these APIs or stored data.
- Rollback snapshot for the admin relocation: `backup/fix3/manifest.json`. Browser verification script: `backup/fix3/verify-offers.cjs`; isolated artifacts: `E:/Allprojects/backup/offers-admin-fix3-verification`.

This index covers the verified Offers admin relocation; it does not certify the separate payment-policy implementation.
