# Static campaign pages

- Client route: `/campaign/business-growth`. Public, no login; noindex/nofollow; intentionally absent from site navigation and sitemap.
- Standalone package showcase / sales reference: `/campaign/packages`. Static public webpage, no login; noindex/nofollow and absent from main site navigation and sitemap. Includes comparison, copyable summaries and quotation guidance for the owner/staff. The initial admin route and menu entry were removed at the owner's request.
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
