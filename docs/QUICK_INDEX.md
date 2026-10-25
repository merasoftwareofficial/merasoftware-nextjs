# Verified code routes

## Reservation/payment work — 25 October 2026

- **Start here:** [cross-repo agent handover](../src/docs/RESERVATION_AGENT_HANDOVER.md). Current decisions, exact test commands/evidence, backups and pending rollout are centralized there.
- Website Reserve/My Offers: `src/components/offer-reservations.tsx`, `src/app/account/offers/page.tsx`, `src/app/offer/[slug]/page.tsx`, `src/app/api/offer-reservations/route.ts`.
- Shared quote source: `src/lib/offer-quote.ts` and `/api/offers/live`; backend owns reservation/payment/repricing rules, not the browser.
- Login/phone: `src/app/login/login-form.tsx`, `src/components/phone-field.tsx`, `src/lib/phone-countries.ts`; auth remains in `src/lib/auth.ts` / `src/lib/portal.ts`.
- Full owner decisions/history: [reservation plan](../src/docs/OFFER_RESERVATION_REMINDER_PLAN.md). Current status supersedes its historical Step 0 table.
- Backend [audit](../../backend/docs/CODE_AUDIT.md) / [rollout guide](../../backend/docs/RESERVATION_ROLLOUT.md). Local fixes verified; no final production rollout/delivery verification. Reminder engine/OTP deferred.

## Existing Offers admin routing

- Offers admin: `src/app/admin/offers/page.tsx` owns the hub, four sections and page access. `offers-manager.tsx` owns create/edit, previews, listing and common terms.
- Eligibility dependencies: the offer editor uses native disabled fieldsets for project categories/packages and service plans; `offers-manager.module.css` fades disabled groups. Parent toggles retain selections. Backup: `backup/fix4/manifest.json`.
- Navigation: `src/components/admin-layout.tsx` declares the Offers entry; `src/app/admin/layout.tsx` supplies active portal-admin permission.
- Old offer bookmarks: `src/app/admin/content/page.tsx` redirects `page=offers`; `src/lib/admin-offers.ts` maps sections and derives active/expired display status.
- Offer persistence and portal integration: existing `src/app/api/offers/route.ts`, `src/app/api/offers/live/route.ts`, `src/lib/offers.ts` and settings repositories. The admin relocation does not change these APIs or stored data.
- Rollback snapshot for the admin relocation: `backup/fix3/manifest.json`. Browser verification script: `backup/fix3/verify-offers.cjs`; isolated artifacts: `E:/Allprojects/backup/offers-admin-fix3-verification`.

The routing notes in this section cover the Offers admin relocation. Reservation/payment evidence is recorded separately in the handover above.
