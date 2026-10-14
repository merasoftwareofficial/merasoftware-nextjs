# Static campaign pages

- Client route: `/campaign/business-growth`. Public, no login; noindex/nofollow. Legacy detail URL preserved; the homepage now links to `/offers`, whose starter card opens `/offers/business-growth`. Absent from the main menu and sitemap.
- Current public page (8 October 2026): English starter-offer design aimed at Amritsar business owners, "Get your business noticed online." One dominant offer card replaces the service-price grid. The owner's example (₹10,000 → ₹4,000 → ₹699) is explicitly marked as a design preview; the 00:29:59 timer is a fixed, labelled visual sample, not a claimed expiry. Contact messages ask for actual service, price and validity confirmation. `content.offer` remains null until an actual offer is approved; when configured, its fixed deadline drives the real countdown and expired offers hide promotional prices. No unsupported top-agency or ranking claims were added.
- Backup: `backup/public-offer-20261008-003450/`. Scoped lint and TypeScript passed; browser checks cover crossed-out prices, preview labelling, first-screen enquiry CTA at 320x700/360x740/390x844, desktop layout, project switching, noindex and public access. Saved homepage hashes remained unchanged.
- Before this compact redesign, the restored original English design was shown publicly and backed up at `backup/public-compact-20261008-001401/`. Saved homepage variant files remained untouched; SHA-256 comparison verified that in the browser check. Scoped ESLint, TypeScript, desktop/mobile widths, public access, project switching, expandable answers, enquiry links and noindex checks passed.
- 8 October 2026: owner requested the modified English trust design be accessible on this public route. It now renders an independent static copy in `src/components/campaign/public-interaction/`; the saved homepage variant is unchanged. The previous public page, its content/styles and the saved variant were backed up in `backup/public-interaction-replace-20261008-000706/` before replacing the route.
- Current client experience is a trust/contact landing page, not a package quiz: business introduction, labelled illustrative previews, service summaries, starting prices, working process, FAQs and repeated contact actions. Package showcase is unchanged by this revision.
- Static verified business facts live in `src/lib/campaign-trust.ts`. Project/client counts, real work, testimonials, reviews, phone, WhatsApp and address are not supplied yet; their blocks stay hidden until the owner provides verified details. Contact currently falls back to the existing business email.
- Starter offer supports actual regular/offer/contact prices, inclusions, demo scope, terms and a fixed ISO deadline with timezone. An expired offer hides discount prices and uses the regular enquiry action. No offer/countdown is shown until details are confirmed.
- Customer package comparison: `/campaign/packages`. Public, no login; noindex/nofollow, linked from the homepage promotion section. Copyable summaries and staff quotation guidance are available on the editor-protected `/admin/packages` route, accessible from the admin menu.
- Both pages use the existing Mera Software light-background logo and brand palette (white, light blue, navy, teal). They do not use the supplied workshop screenshot's green/lime palette.
- Shared static data and recommendation logic: `src/lib/campaign-packages.ts`.
- The package document supplied by the owner is backed up at `backup/campaign-initial/package-source.txt`. The existing admin navigation was backed up before editing.

## Before using the campaign in ads

Confirm the business WhatsApp number. The current enquiry action uses the existing `contact@merasoftware.com` address; copying an enquiry is also supported. This version does not store leads, take payments or create portal accounts.

Confirm taxes, domain/hosting, website-only payment schedule, shoot coverage/travel, SEO scope, update limits, dynamic functionality and combined-plan commitment/ownership/cancellation terms. Public pages avoid inventing these inclusions; the staff reference includes quotation reminders.

No countdown, scarcity message or promotional discount is active. Configure a real campaign end date and expiry behavior after the owner confirms the offer.

Future panel integration should replace the shared static data source, with package/billing records owned by the portal and campaign presentation owned by the website. Do not expose staff quotation notes through a public package API.

## Validation

TypeScript and scoped ESLint passed. All 12 package recommendation branches and the dynamic-website over-budget case passed runtime assertions. Playwright verified the standalone showcase without login, all four category selectors, desktop/mobile layouts, mobile horizontal overflow, the Professional recommendation, noindex metadata and absence of browser errors. Screenshots are in `backup/campaign-revision/`.

Trust-page revision: scoped ESLint and TypeScript passed. Playwright checked 360/390px mobile and 1440px desktop layouts, absence of the quiz, real starting prices, enquiry links, FAQ interaction, noindex and browser errors. Screenshots and repeatable check are in `backup/campaign-trust/`. The offer and verified-proof blocks still require owner-provided data before activation.

## Packages and offers integration — 14 October 2026

- Homepage has a dedicated promotion section after services, linking to customer packages and the offers directory.
- `/campaign/packages` is the customer comparison page with package enquiry actions; staff quotation guidance is available only through the editor-protected `/admin/packages` page. Admin navigation includes Packages and an Offers directory shortcut. Neither is a content editor.
- `/offers` renders cards from `src/lib/service-offers.ts`; `/offers/[slug]` resolves each registered offer to its detail renderer and returns 404 for unknown slugs. Add the directory entry and corresponding renderer when introducing a new offer.
- The only current entry is the existing Business Growth Starter design preview. No new discounts or validity claims were created. Its legacy `/campaign/business-growth` URL remains available. Both detail URLs link back to the offers directory.
- Campaign pages retain noindex/nofollow until their offer details and publication policy are confirmed.
