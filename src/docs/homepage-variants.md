# Saved homepage variants

Admin entry: `/admin/homepage-variants` (editor/admin), also linked from Homepage management.

## Variant 01 — Digital Presence

- Full preview: `/preview/homepage-variants/digital-presence`, guarded with the same editor/admin permission. No public menu link or sitemap entry; noindex/nofollow.
- Independent saved copy: `src/components/homepage-variants/digital-presence/variant.tsx`, `variant.module.css`, `content.ts`.
- Saved from the trust/contact campaign design at the owner's request, with all visible copy, FAQs, conditional offer copy and enquiry messages translated to English.
- Layout and colours preserved. The root homepage and campaign page are unchanged by this save.
- Restored on 8 October 2026 at the owner's request to the original saved English design ("Focus on your business. Your online presence is in good hands."). Component, styles and content exactly match `backup/homepage-variant-02/` via hash verification.
- The later trust refinement was backed up in `backup/homepage-variant-restore-20261008-001022/` before restoration. The independently copied public interaction page was not changed during this restore.
- Static starting prices are frozen in this variant so future campaign package changes do not change the saved design.
- Verified business facts remain empty until confirmed. No fabricated project counts, testimonials, reviews, address or discounts.
- Preview only: there is no activation button or homepage replacement in this change.

Backups and reproducible visual/auth checks: `backup/homepage-variant-01/`.

Validation: scoped ESLint and TypeScript passed. An isolated browser render verified English visible copy and enquiry messages, FAQ interaction, 360px/390px/1440px layouts without horizontal overflow, and no runtime errors. Live browser checks verified both new routes redirect anonymous visitors to login and preserve the correct return path. Authenticated admin rendering was not exercised because no staff browser session was provided.

Trust refinement backup and checks: `backup/homepage-variant-02/`. Browser checks additionally cover three real project cards, loaded portfolio screenshots and the hero's "See our work" anchor.
