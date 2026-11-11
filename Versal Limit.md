# Vercel limit investigation and implementation handoff

Updated: 11 November 2026 (Asia/Calcutta).

## Project and user intent

- Target: `E:\Allprojects\merasoftware`. This is the user's persistent default website. The shell initially opened in AccountApp; that does not select AccountApp. Do not inspect or modify another repository without task-specific authorization.
- User wants Vercel free allowances consumed less, while keeping fresh data, correct permissions, prices, reservations, publishing and previews.
- User specifically worries that caching could keep showing old data even after refresh. Treat freshness as an acceptance requirement.
- User requested repeated verification before a final plan, then this exact handoff file, `Versal Limit.md`.
- Work so far: read-only source inspection and official documentation review. No application changes, deployment, performance benchmark or production functional tests have been performed. This handoff is the only file added in this turn.
- This is a plan, not proof of a production root cause or a guarantee of staying below free quotas. Do not interpret creation of this file as authorization to deploy or modify another project.

## Screenshot and external evidence

The email says the free team `merasoftwareofficials-projects` has used 75% of its included **Fluid Active CPU (4 hours)**. That is approximately 3 hours used at email time, not proof that the allowance was already exceeded. The email says another notice arrives at 90%, and exceeding included usage can pause projects. This is a team warning; do not assume this repository alone caused all usage. Current usage and reset date were not inspected.

Official reference reviewed: https://vercel.com/docs/functions/usage-and-pricing

- At review time Hobby includes 4 CPU hours, 360 GB-hours provisioned memory, and 1 million invocations.
- Active CPU is actual code execution. Waiting for MongoDB/API I/O is not itself billed as Active CPU; request handling, serialization, rendering and computation still use CPU.
- Memory and invocations are separate resources. Reducing requests can help but request counts alone do not establish CPU savings.

No Vercel-specific callable tool was exposed during tool discovery. No authenticated dashboard, project-level usage, route CPU breakdown, traffic/bot analysis, deployed commit/configuration or production logs were accessed. No credentials were read. Consequently the largest contributor and exact savings remain unknown.

## Corrections to earlier chat conclusions

Earlier answers overstated `force-dynamic` as the confirmed main cause and described a blanket `revalidate = 300/600` change as safe. Those are superseded by this document.

- Many dynamic pages and recurring calls are verified potential contributors, not the proven explanation for the email.
- Removing `force-dynamic` alone does not guarantee static rendering: public headers read cookies and other paths use uncached portal fetches.
- Browser refresh does not inherently bypass a server data cache.
- ISR/time-based revalidation can serve stale results; immediate freshness requires deliberate invalidation semantics and testing.
- `maxDuration = 300` is an execution ceiling, not a fixed 300-second charge. Do not reduce it as an assumed CPU fix.
- Do not promise no regressions or any specific percentage of savings without implementation tests and production measurements.

## Verified architecture and routing

Installed package declares Next.js `16.3.6`, React `19.2.8`, Mongoose `^9.10.2`. Follow root `AGENTS.md`: use this installed Next version's documentation before code changes. `cacheComponents` is not enabled in `next.config.ts`.

Relevant local guides:

- `node_modules/next/dist/docs/01-app/02-guides/caching-without-cache-components.md` (current project's rendering model).
- `node_modules/next/dist/docs/01-app/01-getting-started/08-caching.md` (Cache Components model; do not assume it is already enabled).
- `node_modules/next/dist/docs/01-app/01-getting-started/09-revalidating.md`.
- Function references for `revalidatePath`, `revalidateTag`, and any proposed cache primitive.

`docs/QUICK_INDEX.md` and `docs/CODE_AUDIT.md` were absent when checked. Existing topic documentation lives under `src/docs/`. Do not invent an existing audit index.

### Already implemented

| Area | Source | Verified behavior |
| --- | --- | --- |
| Mongo connection reuse | `src/lib/mongodb.ts` | Global connection/promise reuse; pool size 5; idle timeout 30 seconds; failed connection promise resets. |
| Request deduplication | `src/lib/auth.ts`, `src/lib/package-pages-server.ts`, `src/lib/public-plans-server.ts`, `src/lib/page-seo.ts`, `src/lib/indexable-posts.ts`, blog/work detail pages | React `cache()` shares selected reads within a server render; it is not a durable cross-request cache. |
| Portal account status | `src/lib/portal.ts` | Bounded per-instance map with 60-second TTL; invalid JWT checked locally; transient backend failures are not remembered as invalid sessions. Preserve existing role/ban semantics. |
| Communication live feed | `src/lib/communication-live.tsx`, `src/app/admin/communication/page.tsx` | Shared credentialed EventSource directly to portal `/api/portal-updates`, when configured/authorized; event batching, active subscriptions, visibility handling, reconnect and fallback. |
| Email panels | `src/app/admin/email-control/email-control-panel.tsx`, `email-outbox.tsx`, communication hub | Several calls explicitly set fallback to zero; not every panel polls every 5 seconds. |
| Notification delivery | `src/lib/notify-queue.ts`, `vercel.json`, `src/app/api/cron/notify/route.ts` | Delivery claims, job locks, batches of 10; writes start work using `after()`; read-triggered retries; daily authenticated cron at `30 3 * * *`. No measurement proves cron insignificant. |
| Private preview manifest | `src/lib/website-preview/storage.ts` | Hash-verified immutable manifest cache, bounded to 32 entries per storage instance with 10-minute TTL. Authorization remains per request. |
| Fresh transactional APIs | `src/app/api/*` | Many personal, admin, quote and purchase responses already use `no-store`/private responses. |

### Potential waste or implementation gaps

1. Approximately 42 files declared `force-dynamic` in the inspection (pages, layouts and API routes combined, not 42 public pages). Public examples include homepage, about, contact, services, blog, work, plans, packages and offers. Recount against current working tree before editing.
2. `src/app/page.tsx`: homepage reads blog cards, settings, portfolio and package menu destination; visuals load media. `src/lib/section-visuals.ts` already accepts existing settings and batches asset IDs; Mongo media `findByIds` already skips empty lists. Preserve those optimizations.
3. `src/lib/repo/mongo-driver.ts`: settings reads are plain database reads; shared settings can be requested by multiple helpers. Consider request-scoped deduplication first, verifying mutation/read behavior before central wrapping.
4. No `revalidatePath`, `revalidateTag`, `updateTag` or `unstable_cache` usage was found in the inspected `src`/config search. No complete persistent public-data cache/invalidation pipeline was found.
5. `src/app/admin/communication/communication-hub.tsx`: WhatsApp status polls every 5 seconds while the hub has no panel open, portal-admin access exists and document is visible. This path is independent of SSE fallback.
6. `src/app/admin/whatsapp/whatsapp-panel.tsx`: certain active views poll status every 5 seconds with visibility guard.
7. `src/lib/communication-live.tsx`: default fallback interval is 5 seconds, used only when the feed is not connected; several callers override it to zero. Existing hook serializes reads and coalesces follow-ups. Preserve this; inspect individual direct polling paths for overlap instead of rewriting everything.
8. `src/components/portfolio.tsx` mounts `PortfolioReactions` per card. `src/components/portfolio-reactions.tsx` starts one request per card plus a visible-tab refresh every 45 seconds. With N cards this is approximately 80*N periodic calls/hour while visible, plus initial/action requests. It skips hidden refreshes; it is not an unguarded background poll.
9. `src/components/use-server-time.ts`: all countdowns already share one clock and network lifecycle. Tick is local every second; API synchronization is once a minute, not once a second. Periodic sync lacks a hidden/offline guard, though returning to visibility already syncs.
10. `src/components/offer-reservations.tsx` (`MyOffers`): minute-based refresh timer lacks hidden/offline guard; visibility return also refreshes. Do not confuse this with every reservation action/component.
11. `src/proxy.ts`: private preview hosts rewrite all paths to `/api/website-preview-runtime`; marketing proxy also handles canonical trailing-slash behavior and internal header sanitization. Do not remove proxy indiscriminately.
12. `src/lib/website-preview/service.ts`: private preview runtime verifies session/manifest then streams Blob-backed assets with private/no-store headers. HTML/CSS/JS/image traffic can all invoke functions. This is an additional candidate requiring actual usage evidence, not justification for making assets public.

## Freshness and correctness dependencies

- **Sessions:** `src/components/site-header.tsx` has `SessionSlot` inside Suspense calling `getSession()`, which reads cookies. Suspense alone does not establish static/dynamic isolation in the current config. Keep authentication and permission reads outside shared public caches.
- **Blog visibility/personalization:** `src/app/blog/[slug]/page.tsx` includes members-only access, moderation-visible comments, viewer reactions, saved state and voter cookie handling. Never share this entire result among users.
- **Scheduled posts:** `src/lib/repo/index.ts` calls `ensureDuePublished()` before blog reads, throttled to one minute per server instance. It publishes due records and starts post-change side effects. Caching around these reads can suppress the very operation that makes scheduled content live.
- **Notifications:** blog list/card reads call `drainNotifications()`; `drainSoon()` retries at most once a minute per instance, with daily cron as backstop. A change in read frequency can change delivery retry timing. Do not cache a side-effectful read without addressing that dependency.
- **Settings writes:** updates are not all `settingsRepo.update()`. There are specialized methods such as `updateHomepageSection`, `updatePageSection` and `updateVisual`. See homepage, website-content, visuals, SEO, settings, offers and package-pages API routes. Invalidation must cover every actual writer, including deletion/slug changes, with dependent navigation/SEO pages.
- **Portfolio writes:** admin edits, portal integration sync, URL application, captures and availability changes have separate paths (`src/lib/portfolio/repo.ts`, portfolio APIs). Public cache invalidation must include integration writes, not only admin save.
- **Portal catalogue:** `src/lib/sales-catalogue-server.ts` forwards public integration reads and authenticated admin requests with `cache: 'no-store'`. Plans/packages can change in the portal independently of website API saves. Website-only invalidation is insufficient for this data.
- **Time-sensitive offers:** `offerRunning`, reservation windows, expired offer cards and quote generation depend on current time (`Date.now()`, `endsAt`). Expiry occurs without a save event. Cache stable source data only when justified; keep time decisions/current quote checks fresh.
- **Errors:** some public helper functions deliberately catch portal failures and return empty arrays/null (`readPublicPackagesOrNone`, plan fallback helpers, offers loader). Wrapping those fallbacks in a shared cache could persist a temporary outage as empty content. Error and invalidation failure handling must be specified.
- **Refresh layers:** server cache invalidation and already-open client/router state are separate concerns. A write route invalidating data does not automatically update every open browser. Preserve save-success refresh behavior and define what a second browser should see on its next request/navigation; do not promise unsolicited live updates everywhere.

## Final staged plan

### 1. Establish attribution and baseline

Read team/project Vercel usage for the relevant cycle: project shares, Active CPU by route if available, invocations, memory, traffic spikes, preview hosts/deployments, errors and crawler/bot patterns. Verify deployed source/config matches this repository. Record reset date and remaining allowance.

If access remains unavailable, report that limitation and proceed only with independently justified source improvements; do not label a candidate as the measured root cause. Do not add a new logging platform or broad telemetry framework by default.

### 2. Reduce unnecessary recurring calls first

- Integrate remaining status polling with existing authorized events where those events actually cover the status. Verify event coverage before removing polling.
- Keep a bounded fallback with backoff for unavailable feed, and immediate refresh after relevant user actions, visibility return and reconnect. Do not replace all intervals with an arbitrary 60-second timer; that changes update latency.
- Pause background network reads while hidden/offline and prevent overlaps in paths that currently allow them. Preserve the existing hook's coalescing and cleanup.
- Reuse the shared server clock and resume synchronization on return; keep local countdown ticking separate from network calls.
- If metrics justify portfolio request reduction, batch reactions for visible cards with per-user state preserved, then update the affected card from the write response. Bound batch sizes and retain proper authorization. Review this concrete change separately because it adds an API contract.
- Deduplicate repeated settings reads within a render where safe. This offers savings without cross-request staleness, but verify any write-then-read paths.

### 3. Introduce public caching in one bounded flow

Start with shared editorial settings/content for a limited public page only after mapping all dependencies and writers. Use a cache primitive compatible with the existing Next configuration; do not enable Cache Components globally as an incidental change.

- Keep request-specific header/session, admin reads, transactional reads and viewer state fresh.
- Assign explicit tags/dependencies and invalidate after committed successful writes across every relevant path. Include navigation, visuals, metadata, slug changes and integration writes when applicable.
- Choose invalidation semantics that meet next-read freshness; stale-while-revalidate defaults may not meet that requirement. Consult installed API docs.
- Set a bounded recovery lifetime but do not treat TTL as immediate freshness or a hard freshness guarantee during outages.
- Surface cache invalidation failures appropriately; a successful data write must not silently leave indefinitely stale content.
- Test a single pilot before expanding. Data caching may reduce database/data-processing work while pages still dynamically render; only claim static/ISR benefits when build/runtime evidence demonstrates them.

### 4. Expand only after dependencies are solved

- Portal prices/catalogue: keep fresh initially. Shared caching requires an authenticated invalidation/version contract covering direct portal edits, plus failure recovery. That may require separately scoped portal work; do not enter another repository automatically.
- Blog reads: preserve scheduled publication and notification retry timing before caching them. Do not silently move minute-scale behavior to a daily cron.
- Offer display: compute current eligibility/expiry from fresh time; final quote, reservation and purchase endpoints revalidate authoritative state.
- Preview runtime: inspect only if measurements identify significant usage. Preserve private authorization, token expiry, manifest integrity, canonical URLs and streaming. No blanket public CDN caching of private preview assets.
- Bot mitigation only when traffic evidence supports it; avoid blocking legitimate crawlers/users indiscriminately.

### 5. Acceptance and rollout

Before code edits, define the small change set and back up affected original files in the next numbered `backup/fixN` folder if continuing the fix-mode workflow used in this chat. Use apply_patch for edits. Read current AGENTS instructions and relevant installed Next docs. Preserve unrelated work. Do not run a broad architecture migration as part of this task.

Verification must run in production mode for server-cache behavior; dev mode is insufficient. Existing relevant test entry points include `tests/communication-live.browser.mjs`, `tests/server-time.browser.mjs`, `tests/session.test.ts`, offers/quote/reservation tests, content browser tests and website-preview tests. These were inspected as available tests, not executed in this investigation.

Acceptance scenarios:

1. Edit content/visuals/SEO/menu; save succeeds; subsequent fresh server request and browser refresh show committed content; navigation and metadata agree.
2. Publish, unpublish, delete and rename; old URLs and affected lists behave correctly. Draft/private/member-only content is never leaked.
3. Login/logout, role/ban changes, two users and anonymous requests preserve existing access and personal reaction/saved state.
4. Scheduled publish, notifications, offer expiry and reservation windows preserve documented timing and authoritative final pricing.
5. Hidden/offline periods make no unnecessary periodic calls; returning/reconnecting refreshes promptly; slow responses do not create request overlap/storms; mounted drafts remain intact.
6. Backend failure is not cached as a successful empty catalogue or invalid session; recovery fetches current data. Exercise invalidation failure/retry behavior.
7. If preview code changes, authorization expiry/revocation contract, private asset access and manifest checks still hold.
8. Compare CPU, invocations and memory before/after under comparable traffic. Monitor allowance projection, not just raw totals that grow during the cycle. Roll back a change that breaks acceptance or fails to justify its tradeoff.

## Verification stopping point and next agent's starting point

The investigation traced rendering, cookies/session, portal catalogue reads, shared settings/media, mutation routes, scheduled publication, notification side effects, event transport/fallbacks, timers, proxy and private preview storage. Follow-up searches of these paths stopped revealing additional dependency categories in the last pass. This is convergence of a scoped static review, not an exhaustive runtime audit.

**Start here:** obtain the Vercel usage baseline if available; then prepare the smallest polling/request-reduction change in stage 2 with explicit freshness checks. Do not start by removing every `force-dynamic` declaration. Only expand to the caching pilot after mapping its writers and proving fresh-read behavior.

Open unknowns: actual production CPU distribution, traffic and bot shares, other projects' team usage, production DATA_DRIVER/settings, deployed build behavior, SSE event coverage/reliability in production, and measured savings. No percentage reduction, zero-regression guarantee or guaranteed free-plan headroom has been established.
