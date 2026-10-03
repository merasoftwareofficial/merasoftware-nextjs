# Client portfolio integration

The portal backend owns purchased projects/plans. Next.js owns public case studies,
visibility, images and reactions. Every source order has one portfolio record keyed by
its stable order ID. Catalogue templates and renewal cycles never create extra cards.
Linked purchased services appear in the project editor for inclusion in its public
services list; their own entries cannot be published as duplicate cards.

## Deployment

1. Deploy the updated portal frontend and backend, and this Next.js website.
2. On Next.js use `DATA_DRIVER=mongo` with its existing `MONGODB_URI`/`MONGODB_DB`.
   JSON storage is for a single local development process, not serverless production.
3. Set `PORTFOLIO_INTEGRATION_SECRET` to the same random value (at least 32 characters)
   on Next.js and the backend/worker. Keep it separate from the login token secret.
4. Next.js needs its existing `PORTAL_API_URL` (backend origin), `PORTAL_URL` and
   `TOKEN_SECRET_KEY` for shared login. It also needs existing Cloudinary credentials
   and `CLOUDINARY_ASSET_FOLDER` for manual uploads and captured images.
5. On the worker set its existing portal `MONGODB_URI`, `PORTFOLIO_WEBSITE_URL` to
   the Next.js origin, and `PORTFOLIO_CAPTURE_ENABLED=true`.
6. In the backend directory run `npm ci`, then `npx playwright install --with-deps chromium`.
   Run `npm run portfolio:worker` as a persistent background service (Node 20.19+).
   This is independent of `ENABLE_CRONS`; it does not enable payments/renewal/file-cleanup jobs.
   Configure the service manager to restart it after a crash. One Mongo lease coordinates
   multiple worker instances. A supported Chromium host and outbound public web access
   are required; allow enough memory for a headless browser.
7. Open `/admin/portfolio`: imports start as drafts. Add public content, review images,
   set visibility, and save. No existing project is published automatically.

For a one-time import/retry, `npm run portfolio:sync` runs one worker cycle (up to 1,000
source deliveries and one capture). The persistent worker repeats every 30 seconds
after a completed cycle and imports the remainder. The admin Sync/retry button requeues
existing outbox entries; a running worker is still needed to reconcile new records.
Check sync status reports pending/retrying deliveries and the last successful delivery.

Do not run the worker locally with production database/website settings for a preview.
Use separate development settings. The implementation's automated tests use disposable
MongoDB and temporary JSON files; they never connect to the configured production database.

## Screenshot workflow

Portal admin project details include “Portfolio website & screenshots.” This edits
the existing `projectLink` and the new `portfolioCaptureAllowed` preference. Website
project URLs queue captures on import, URL change, or re-enabling automatic capture.
The Next.js editor can also explicitly queue a capture of a public URL. Private and
login-required work should use the existing media picker/manual uploads.

The worker claims one job, creates isolated desktop (1440×1000) and mobile (390×844)
browser contexts, captures the first viewport as optimized JPEGs and sends them to the
Next.js media library. It never uses portal/customer cookies. POST traffic, WebSockets,
downloads and service workers are disabled. A local proxy checks every target, including
redirects/subresources, rejects private/reserved IP ranges and dials the validated IP
to prevent a second DNS lookup. Only standard web ports are allowed.

Captures are review candidates. Choose one as cover or add it to the gallery, then
save. A refresh does not replace the published cover. Cover focal positions control
the visible crop. Gallery descriptions and order are editable. Media usage tracking
protects covers, gallery images and current candidates from library deletion.
Old, replaced candidates remain ordinary unused library assets for manual cleanup.

Jobs have a four-minute lease and a fresh token per claim. A callback from an expired,
replaced or cancelled claim cannot overwrite a new job. Reported failures retry up to
three times, then show a failed status; manual refresh resets attempts. Worker crashes
are recovered after lease expiry. Capture failure does not fail the source import.

## Sync and publication rules

The backend scans source records using the existing status engine, projects an explicit
allowlist and persists changed projections in `PortfolioOutbox`. Unchanged source facts
do not produce deliveries. Failed deliveries retry with bounded backoff. Only a successful
full scan emits tombstones for deleted orders, deleted customers or guest records.
Pending events survive process restarts. Delivery acknowledgements match the revision,
so acknowledging an older delivery cannot mark a newer update delivered.

Next.js compares revisions before applying events; duplicates and old revisions are safe.
Source updates never overwrite editorial title, description, images, public URL, featured
flag or manual show/hide choices. Deleted sources are hidden while content/reactions remain.
An expired service does not hide its completed linked project. Restoring a source does
not automatically republish a previously hidden case study.

Publishing requires an available standalone source, category, summary and library cover.
Public DTOs exclude customer/source metadata. Every staff page and mutation checks its
own authorization; integration routes require the shared service secret. Browser writes
validate Origin when provided. Public pages read fresh data (`force-dynamic`), so hidden
entries disappear on the next request without a stale static page. Already-open pages
refresh reaction counts every 45 seconds; this is polling, not a live socket subscription.
Only published pages join the sitemap; preview pages are staff-only and noindex.

Reactions use explicit desired state and a unique user/project/reaction key. Counts are
aggregated from records, not independently incremented counters. Visitors can see counts;
existing shared-login members can react. Portfolio reactions do not alter blog reactions.

## Checks

- Backend: `npm run test:portfolio`
- Next.js: `npm run test:portfolio`, `npx tsc --noEmit`, `npm run build`
- React frontend: `npm run build`
- Browser flow (after Next.js build): `npm run test:portfolio:browser`
  Uses disposable MongoDB and a local portal fixture; screenshots are written to
  gitignored `test-results/`. Requires `npx playwright install chromium` locally.

The tests cover source privacy, snapshot names, duplicate/out-of-order imports, editorial
preservation, deletion tombstones, durable retries, capture leases/stale callbacks,
manual-cover preservation, network-address rejection and concurrent reaction requests.
