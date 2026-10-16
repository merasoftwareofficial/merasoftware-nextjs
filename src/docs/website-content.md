# Website Content management

`/admin/content` groups public website content by page and section, following the Section visuals navigation pattern. Access requires editor or admin.

Homepage sections reuse the existing HomepageImageEditor and `/api/homepage/section` saving route without storage changes. Embedded mode starts at the selected section, keeps unsaved-change protection and provides Save/Discard actions. Existing `/admin/homepage` and other direct admin URLs remain available.

Static content is listed with Not yet editable status. Non-working FAQ, testimonial and new-service forms are not presented as working editing actions. Offers now has dynamic Listing, Manage offers and universal T&C controls. Packages remains a reference group pending its own editor. Portfolio and Blog content uses the existing collection editors.

About and the Services listing now use section editors in the same navigation. About includes Hero, Purpose, Approach, Leadership, Working with us, Selected work and Closing CTA. Services includes Hero/preview, Service groups/entries and Packages/contact. Current approved copy remains the fallback in `src/lib/page-content-defaults.json`; reads do not seed or change existing settings.

`/api/website-content` validates editor access, origin, the selected section, safe links and media-library references, then saves text and visuals together. `pageContent.about` and `pageContent.services` hold section data. JSON saves merge synchronously; Mongo saves update only the selected section and merge literal visual IDs atomically. Homepage, offers and SEO data are preserved. Service detail pages keep their existing editors/content and are outside this listing-page change.

List entries can be added, removed and reordered. Their stable hidden IDs keep media attached to the right person/project/service. Section visuals reuse the existing media chooser, pattern controls, fit/focal position, alt text and square/original-proportion options. Embedded visuals stage changes until Save changes; standalone Section visuals remains available. Default external project preview URLs are editable fallback fields; selecting a visual replaces that fallback.

Checks: `node --conditions=react-server --import tsx --test tests/page-content.test.ts` verifies both storage drivers, validation and stable media mapping. `node tests/page-content-browser.mjs` runs a focused React/browser harness against the actual editor, public-page and save-route source with isolated JSON persistence and local media. The Next shell/auth are fixtures, so this checks the guard/error paths rather than live portal login. It verifies save/reload, add/remove/reorder, dynamic service visuals and responsive layout without changing production data.

Sidebar content entries are consolidated into Website Content. Section visuals, saved Homepage variants, Blog, Portfolio, SEO, Media and operational settings remain available. Approved default public copy, layouts and publishing status are preserved; About and Services now read section data saved through Website Content.
