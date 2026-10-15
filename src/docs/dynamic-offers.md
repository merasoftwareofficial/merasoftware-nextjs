# Dynamic offers

## Admin

Website Content → Offers has three sections:

- Offer listing: heading and empty-state message.
- Manage offers: New offer, Edit, live card preview, unsaved detail preview, Draft/Published/Archived, ordering, identity/eyebrow/headings, benefits, three prices, deadline, enquiry action and offer terms.
- Common & offer T&C: universal terms. Each offer chooses Universal, Offer-specific or Combined. Validity is generated from expiry, so changing a deadline cannot leave stale T&C dates.

Expiry input is explicitly India time. Contact accepts HTTPS, mailto or tel links. Slugs are unique, safe URL segments and immutable through editing. Price ordering and all writes are validated server-side. Both pages and API require editor/admin access.

## Public

`/offer` lists published offers; `/offer/[slug]` shows their saved content. Draft/Archived/unknown URLs return 404. Published expired offers show an expired state with no promotional prices or countdown. Cards render current content directly; they do not need screenshot refreshes.

The original offer at `/offer/page` is preserved as the fallback for sites without a saved override. Its original expiry is 20 October 2026 at 23:59:59 IST. Saving an override as Draft or Archived hides it without restoring the fallback. Existing `/offers` and campaign aliases remain compatible.

## Persistence

Existing Settings storage is reused: offers map, universal terms and listing configuration. Mongo saves update only one offer's dotted path, with a conditional create to prevent duplicate slugs. JSON saves synchronously merge into existing settings. No production seed writes are required merely to read the existing offer.

## Validation

`node --import tsx --test tests/offers.test.ts` covers validation, migration fallback, hiding states, T&C modes, current validity and JSON persistence.

`node tests/offers-browser.mjs` uses a copied ignored checkout and disposable MongoDB/portal fixtures; it never writes to running site data. It exercises admin creation, preview, save, publishing, archive, public draft privacy, duplicate/unsafe-link rejection, universal T&C and responsive listing.

`node --conditions=react-server --import tsx --test tests/offers-mongo.test.ts` verifies independent Mongo updates, conditional duplicate creates and settings preservation.

`node tests/offers-components.mjs` verifies the actual form and offer components against the real API handler and JSON persistence, using only a fixture identity. Create/save/preview/publish/archive, contact validation, role enforcement, IST expiry, T&C and mobile/desktop checks passed. The full Next.js browser harness was attempted but local compilation timed out; it remains available for an environment with sufficient resources.
