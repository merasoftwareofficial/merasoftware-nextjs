# Public business location

Owner-approved scope: a visible header Location link, reusable Visit Us section on Home and Contact (before FAQs), and footer address/link. Static shared settings now; admin editing later. No Google account credentials or backend changes.

Source of truth: `src/lib/business-location.ts`. Name and address come from the owner-supplied Maps directions URL; CID 15767349786229002623 identifies the same business. Directions preserve the original Google route destination. The mini map opens the same CID in Google's embed view. No guessed review link: reviewsUrl stays null until supplied.

Presentation: `src/components/business-location.tsx` renders the same section on both pages; `share-location.tsx` is the small interactive client component. Native sharing falls back to clipboard, then a selectable link. Cancelling native sharing does nothing. Address and Directions remain available independently of the lazy-loaded iframe. Header links go directly to Directions; the section also links to the Google listing.

Verification: Google embed response contains the business identity; browser iframe visibly shows the named business pin. Production build and targeted lint passed. Final browser checks passed on Home and Contact at 320, 375, 768, 1024, 1100 and 1440px: no horizontal overflow/header overlap, logo and Location visible, lazy Google iframe loads, and header/section/footer directions match. Clipboard and permission-denied manual-copy fallbacks passed; no browser page errors. Named business pin visually confirmed in final screenshot. No commit, push or deployment.

Backup: E:/Allprojects/backup/merasoftware/business-location-20261031. Screenshots stored there.
