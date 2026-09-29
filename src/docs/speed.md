# Website Speed Audit

> Read-only handoff audit for the website in `E:\Allprojects\merasoftware`. This file records inspected code and measured HTTP responses; suggested work is labelled **Proposed**. No application files have been changed. Audit began 29 Sep 2026.

## Scope

- In scope: this Next.js website, its public pages, administration and account routes, data access, authentication, cache behavior, and navigation.
- The separate React portal was checked only to explain the user's comparison. It is not the target of this audit or a source of implementation changes.
- Read-only for this audit: no app code or configuration changed; no database queries/writes, builds, test servers, or new requests to the protected ports 3000/3001/8080. The owner's `src/docs/BLOG.md` prohibits touching those servers. Earlier in the conversation, before this read-only audit was requested, local page timing requests were made to ports 3000/3001; the website GET path can publish posts that have reached their scheduled time. Existing evidence cannot establish whether one was due then, so do not treat those earlier local requests as proven database-read-only.
- Audit status: route/source review complete. Vercel/Atlas timing traces, authenticated-user browser performance, and historical production DB changes from earlier pre-audit local page requests could not be verified read-only.

## Current architectural evidence

- The site is Next.js 16.3.6 with React 19, App Router, and MongoDB through `src/lib/repo/` in production. `AGENTS.md` directs agents to read the version-matched Next documentation before editing.
- Internal site navigation predominantly uses `next/link`, so clicks already use Next.js client-side transitions. The marketing/content pages each render their own `SiteHeader`/`SiteFooter`; only the root `<html>/<body>` is shared, so the public header/footer do not persist as a single shell across those route changes. `/admin/layout.tsx` does keep a shared admin sidebar. No case has been made to replace the website with a client-only React SPA.
- Production pages inspected return `Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate`; public responses had `x-vercel-cache: MISS`. These headers mean the observed public HTML is not being served as a shared Vercel CDN cache hit.
- Current `next.config.ts` has no cache settings. The app has no `loading.tsx` files. The inspected public database/session routes are marked `force-dynamic`; confirm their precise prefetch behavior in a browser trace. They have no route-level visual loading fallback.
- `src/app/page.tsx` explicitly exports `dynamic = "force-dynamic"` and waits for MongoDB-backed `blogRepo.list(...)` before returning the homepage HTML. Its other marketing sections are code-defined.
- The comment in `SiteHeader` claims its Suspense-wrapped session slot lets the rest of each page be prerendered. That claim is not confirmed: deployed HTML was no-store, and the local `.next/prerender-manifest.json` inspected was dated 28 Sep and had no public page routes. This file may be stale, so it is not production proof. Verify with an isolated production build before deciding on a shell/cache approach.
- `<Suspense>` around the session lookup can stream an account-menu fallback; it does not make the page-level headers/footers persist because they sit within each page. `ThemeToggle` lives in the recreating header and reads localStorage in `useEffect`.
- Public work so far confirms that dynamic server rendering, slow uncached data access, navigation feedback and network placement all require separate evidence; a cache change alone is not yet established as the sole fix.

## Initial read-only response measurements

Earlier in this conversation, read-only `curl.exe` requests were made to deployed pages from the owner's current network on 29 Sep 2026. Approximate TTFB (first byte) in seconds:

| URL | Observations |
|---|---|
| `https://www.merasoftware.com/` | HTML 25,374 bytes. First request timed out after 20 seconds; another took 11.32 seconds; subsequent requests took about 0.69–0.87 seconds. |
| `https://www.merasoftware.com/services` | HTML 16,433 bytes; about 0.45–0.49 seconds on three requests. |
| `https://www.merasoftware.com/blog` | HTML 18,736 bytes; about 0.85–0.92 seconds on three requests. |
| `https://portal.merasoftware.com/` | HTML shell 1,054 bytes; about 0.29–0.99 seconds on these requests. This is a different comparison unit from the fully rendered website HTML and does not measure a logged-in portal screen or API. |
| `https://merasoftware-frontend-portal.vercel.app/` | HTML shell 1,054 bytes; about 0.16–0.47 seconds on these requests. This is not a complete portal screen measurement. |
| `https://api.merasoftware.com/api/user-details` (without a login cookie) | A 401 response took about 1.95 seconds. This does not measure a successful authenticated account request. |

These are individual requests, not a controlled browser, user-session, Lighthouse, percentile, or multi-region comparison. Do not present them as conclusive diagnosis of a portal page versus a website page. The homepage spike needs Vercel function and database spans before assigning its cause.

## Deployment geography (strong lead; finish validating before action)

- Earlier same-day responses from `www.merasoftware.com` carried Vercel IDs of the form `bom1::iad1::...`. Per Vercel's official [request-header documentation](https://vercel.com/docs/headers/request-headers), `x-vercel-id` records the Vercel regions a request hit, including the region where the function ran. The request came through `bom1` (Mumbai) and executed at `iad1` (Washington, D.C.).
- The user-provided Atlas Clusters screenshot (29 Sep 2026) shows project `MeraSoftware-DB`, cluster `MeraSoftwareDB`, `AWS / Mumbai (ap-south-1)`, replica set with 3 nodes, and Free tier. This confirms the Atlas region shown for this cluster at screenshot time; it does not establish that the live website's production connection string targets this exact cluster/project or reveal measured query latency. Match the website's configured deployment to this cluster using authorized settings without exposing credentials.
- A local read-only check of this repository's ignored `.env.local` found `MONGODB_URI` hostname `merasoftwaredb.w9q6gor.mongodb.net`; credentials were not read out or recorded here. Its cluster name is consistent with the Atlas screenshot, but local `.env.local` does not prove Vercel Production has the same URI. The Vercel dashboard shows the variable is a Secret and hides its value; production-to-cluster linkage remains unverified unless an authorized deployment configuration view or matching non-secret hostname is available.
- Vercel documents `iad1` as the default Functions region and recommends running functions in the same or a nearby region as their data source ([region configuration](https://vercel.com/docs/functions/configuring-functions/region)). The installed repo contains no `vercel.json` region setting; `next.config.ts` is empty. Combined with the user screenshot, the likely topology is Mumbai Atlas (`ap-south-1`) and Washington compute (`iad1`), entered through Mumbai edge (`bom1`). Live website-to-cluster linkage and trace timings still need confirmation.
- If the production website uses this Atlas cluster, the India-visitor → Virginia-function → Mumbai-Atlas path can add transoceanic latency to each sequential query. This is a strong explanation for slower uncached Mongo-backed responses, but alone does not prove the 11-second first-homepage spike; cold starts, MongoDB connection/selection, query duration, function queuing, or an error/retry also need tracing.
- The same responses carried `Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate`, `x-vercel-cache: MISS`, and `cf-cache-status: DYNAMIC`. Thus those measured public pages are not being delivered as CDN-cached HTML. Their exact deployment build and the reason static-looking `/services` also has no-store must be confirmed before changing route rendering or headers.
- Do not set a Vercel region based only on the screenshot. Confirm the production deployment's database target, account/plan limits, per-region cold/warm timings, and a database-connected route trace; then compare placing the function near Mumbai against its impact on other users and upstream services. Region placement is a code/deployment proposal only after that comparison.

## Cache and freshness findings

- Code search found no use of Next.js `use cache`, `cacheTag`, `revalidateTag`, `revalidatePath`, `updateTag`, or `unstable_cache` in `src/` at audit start.
- Existing article create, edit, publication and status transitions are REST Route Handlers under `src/app/api/blogs/`.
- In the inspected editor, save reports success and calls `router.refresh()`; publish navigates to the admin blog list and refreshes. Those calls do not themselves provide a cache invalidation scheme for cached MongoDB reads or other visitors already holding open pages.
- React-style immediate feedback and shared-browser state are separate from the server cache. A successful mutation can return the updated record to its editor immediately. Other page reads require fresh reads or explicit invalidation. Other already-open visitors require a deliberate live update mechanism such as SSE/WebSocket if updates must appear without their navigation or refresh.
- After choosing and tagging cached reads, existing REST handlers should call `revalidateTag()` or `revalidatePath()` only after a successful database write. Use immediate expiry for data that must be fresh on the next read; use stale-while-revalidate only where brief staleness is acceptable. `updateTag()` provides read-your-own-writes behavior in Server Actions and is not available to these REST handlers. Already-open visitors still need a new request or an explicit push channel to see changes.

## Route and request-path findings (source inventory complete; runtime checks pending)

- Public, code-defined pages include `/services`, `/services/[slug]`, `/about`, `/work`, `/contact`, and `/privacy`. The service catalogue/details import `src/lib/site-data.ts` and do not query MongoDB. `/contact` email is a `mailto:` link (external protocol, full site routing does not apply).
- The homepage also renders code-defined marketing sections, but fetches the latest three public official posts from MongoDB in its server page before it can return HTML. Moving or streaming that post section can keep a slow blog query from blocking the whole homepage; any decision to cache the full homepage must account for independently edited article visibility and freshness.
- `/blog`, `/community`, and `/discussions` are public lists, all marked `force-dynamic` and each calls `getSessionUser()` before applying visibility/readability rules to its post query. The signed-in session can determine whether members-only articles may appear. A shared public cache must never contain one user's personalized/private result for another visitor.
- `/blog/[slug]` is dynamic and session-aware. Its page and `generateMetadata` independently query the post; then it resolves the viewer, post, author, related-post pool, settings, comments and—when signed in—reactions/saved status. In the page body, author → related posts → settings → comments are sequential `await`s; viewer's reaction and saved reads are also sequential. These are candidates for shared reads where safe and parallel reads where dependencies permit.
- `/topics/[slug]` and `/members/[username]` each query all published posts before filtering/sorting relevant rows in application code. The member page also queries the user and session. Topic filtering and all-post lists may grow with content volume; inspect repository query/pagination support before recommending changes.
- `/account/posts`, `/account/saved`, `/community/write`, and `/admin/*` are user/session-specific; these must not use a shared public-page cache. `/account/saved` currently fetches every saved post separately in a serial loop. Authentication reads the portal's `user-details` endpoint when its per-instance 60-second token cache misses. Existing page layout access checks should remain in place.
- `/admin` makes several independent counts/list queries sequentially. `/admin/blog` queries post lists and views sequentially. `/admin/comments` fetches individual referenced posts and reporters in loops. These affect staff interactions, not anonymous public-page TTFB, and should be prioritized only if admin experience is included in the speed goal.
- The MongoDB driver implements `settings.get()` using `findOneAndUpdate(..., { upsert: true })` with `$setOnInsert` defaults. That makes each apparent settings read a database write-capable upsert. Article pages and blog APIs call this reader; quantify its cost before changing it, then consider a non-mutating read with safe initialization/migration.
- The blog repository checks/publishes scheduled posts before list/count/find reads. In each Node instance it scans for all scheduled posts at first use and at least once every 60 seconds. This contributes a DB trip to the first blog-backed read per instance; inspect how often due posts exist and how many server instances run before optimizing scheduling.
- On signed-in website requests, `getSession()` verifies the `token` cookie and calls the separate portal `/api/user-details` service when its in-memory 60-second cache misses. That cache is per Node instance; a request can land on an instance without a warm entry. This remote check may add latency for signed-in users. The earlier 1.95-second unauthenticated probe returned 401 and does not measure a successful account request.
- Public pages with the account menu and `getSessionUser()` (for example articles/lists) resolve session in both the `SiteHeader` slot and page. `src/docs/CODE_AUDIT.md` records that a cold cache can cause duplicate portal status checks in a request. Confirm using a signed-in trace, then deduplicate the request-scoped session lookup if it is still occurring.
- Mongo blog listing builds `$match → $addFields → $sort → $skip → $limit`; sort date is computed from publication/update dates. The query has a slug uniqueness constraint and status/author field indexes (see `src/models/Blog.ts`), but no declared compound index for listing filters/order. Check actual Atlas explain plans and collection volume; do not add speculative indexes.
- `/account/saved` resolves each saved post by id sequentially rather than fetching the set in one repo query. `/topics/[slug]` and `/members/[username]` load all published posts then filter in memory. `blogRepo.list` has no automatic default page size; check owner product requirements before adding public pagination.
- The sitemap loads published indexable posts, then looks up each unique author sequentially (`userRepo.findById`). It is marked force-dynamic. The initial canonical page/site and feeds should be considered separately from article TTFB, since crawler requests are not the visitor navigation path.
- `src/app/globals.css` is a single 37.9 KB stylesheet with dense, compressed rules, but the public asset inventory contains only default scaffold SVG files; no evidence from inspection that static image payload is the main response-time cause. Article cover images are external URLs rendered with `<img>` (intentional code comment: remote hosts are not configured for `next/image`). Browser transfer and Largest Contentful Paint still need independent measurement before a change is proposed.
- Blog/community/topic/member card grids can render every matching post (`blogRepo.list` has no default page limit), and their featured-image `<img>` elements do not set `loading="lazy"`. Article featured images also use `<img>`. This can slow visual completion/transfer even after HTML arrives, especially as post/image counts grow; it is separate from measured server TTFB. Measure browser LCP/network before deciding how to paginate or defer images.
- The root layout declares and preloads two Geist fonts with `next/font/google`, but `globals.css` sets the body font to Arial/Helvetica. Confirm whether those preloaded font files are actually used before keeping them; this affects browser bytes/LCP, not Mongo query latency.
- Article visits fire `ViewBeacon` after mount; the POST records/updates the visitor marker, daily total, and post counter. This is not on the HTML response path but is background database write load. Keep that distinction in future TTFB measurements.
- In inspected content handlers, reactions and saves already update button state from the mutation response; comments re-fetch the thread after a mutation. The blog editor refreshes the admin server view after save/publish. Freshness gaps mainly concern uncached database render cost and other visitors' already-open pages; those distinct cases need not share the same solution.

### Content mutation and freshness map (source inspection)

At audit start, the project has **14 API route files**, none calling a Next.js cache invalidation function:

| Mutation | Route | Views that may need updated data |
|---|---|---|
| Create post; edit fields/slug; delete post | `/api/blogs`, `/api/blogs/[id]` | Article by current/old slug; homepage, blog/community/discussions lists; member, topic, sitemap; related-article cards. Create only enters public views when published/readable. |
| Publish, approve, archive, unpublish, schedule or change post status | `/api/blogs/[id]/status` | Same affected lists and article; sitemap/topic/member views additionally depend on public/noindex status. Scheduled posts become visible through the per-instance periodic check. |
| Toggle reaction/save | `/api/reactions`, `/api/saved-posts` | The current article's aggregate counter and each viewer's private button/account state. Page server props are a snapshot when HTML was rendered. |
| Create, moderate or delete comments | `/api/comments`, `/api/comments/[id]` | Article thread and moderation queue. The client comments component already reloads its own thread after the API mutation. |
| Update global comment/view settings | `PATCH /api/settings` | Article comment/view controls, and potentially settings APIs. |
| Change user role/ban | `/api/users/[id]` | Admin user list; member profile/auth visibility; shared pages must still check current auth. |
| Create/resolve reports | `/api/reports`, `/api/reports/[id]` | Moderation reports/overview. |

This table describes code dependencies to confirm, not an instruction to cache every row or invalidate every listed view on every mutation. Keep private-account responses private; avoid full-path invalidation fan-out until cache boundaries are defined.
- The admin layout keeps its sidebar in a shared `/admin` layout. Next.js layouts persist through client navigation; project instructions correctly warn that every protected page must still perform its own authorization because the layout alone does not re-run on navigation.
- `next/link` is present in the main desktop and mobile navigation, service cards, blog lists, article-related links, account and admin panels. The existing React Router portal is only a comparison; its SPA navigation does not by itself imply every requested API response is quick.

## Evidence-based conclusion

The website already uses React and Next.js client-side links. The inspected code does not support an apples-to-apples claim that “the portal React page” is faster: its sampled root returns a 1 KB client-app HTML shell, while the website sends 16–25 KB of rendered HTML; a logged-in portal/browser-load comparison was not available.

Highest-priority leads for this website, with their limits:

1. **Function/data geography:** website responses identify Mumbai edge `bom1` and Washington compute `iad1`; the user screenshot shows the `MeraSoftwareDB` Atlas cluster in Mumbai (`ap-south-1`). Confirm that production connects to this exact cluster and inspect query spans. This is a strong latency lead, not yet the proven explanation for an 11-second spike.
2. **No shared CDN HTML cache on sampled public URLs:** responses were `private, no-store`, and the home/blog pages explicitly render dynamically while hitting MongoDB. The cause for code-only `/services` requires investigation; do not change headers blindly.
3. **Database work on a single page:** home waits for blog data; an article performs several dependent reads; blog reads include a scheduled-post scan. Settings “reads” are upserts. Account saved/member and sitemap flows have serial reads.
4. **Slow-feeling navigation and visual loading:** public header/footer are page-level and remount; no route `loading.tsx` exists; dynamic routes may not prefetch fully; unbounded featured-image lists do not lazy-load images. These affect transition/LCP separately from server TTFB.
5. **Signed-in requests only:** the portal status endpoint can be checked on a cold per-instance cache, with a known code audit noting duplicate session lookups. Authenticated performance remains unmeasured.

## Proposed direction (not implemented or owner-approved)

1. Obtain authorized read-only Vercel function/region and Atlas query traces, including cold/warm and authenticated/anonymous requests. Compare equivalent browser page loads and user sessions for the website and portal before claiming or changing a root cause. No rebuild, test-server run, or app/config change is part of this read-only audit.
2. Preserve Next.js App Router and `next/link`. Evaluate a persistent public layout for the header/footer while keeping the admin shell separate. Add route-appropriate loading feedback and verify prefetch behavior in a browser.
3. Keep session and authorization results private. Cache only public MongoDB reads with explicit tags. The current `cacheComponents: false` setup uses Mongoose rather than `fetch`; installed Next.js 16.3.6 docs recommend `unstable_cache` for database functions plus tag invalidation via `revalidateTag`/`revalidatePath`. Existing REST Route Handlers can invalidate tags after successful writes; `updateTag` is Server-Action-only. Choose stale-while-revalidate or immediate expiry to match each page's freshness requirement. Never share member-only, unlisted, or private content across users.
4. Connect successful article create/edit/publish/unpublish/delete/moderation and scheduled-publish transitions to only the affected article/list/homepage/topic tags. Return saved records and update/refresh the editing UI. Add SSE/WebSocket only if an already-open visitor must see another user's change without a new request.
5. Validate function/Atlas geography and request timing before changing deployment regions. Then verify with the throwaway-database procedure in `src/docs/BLOG.md`; never write through production `.env.local`. Compare hit/miss, HTML, metadata, visibility, authorization, and speed.

## Audit checklist

- [x] Confirm project, production data driver, relevant local instructions, and no pre-existing working-tree changes at audit start.
- [x] Inspect homepage, site and admin shared layouts, header links, mobile navigation, blog listing, article, editor save/publish interactions, MongoDB repository, login/session boundary, and cache configuration.
- [x] Record earlier live response/header observations with measurement limitations.
- [x] Inventory all 34 App Router `page.tsx` files and review public, account, community, article and admin route dependencies; record unverified runtime behavior separately.
- [x] Inventory all 14 API route files and trace content mutations plus affected public views.
- [x] Inspect community, discussions, member, topic, and account pages for query volume, sequential waits and authentication requirements.
- [x] Record what the available TTFB/HTML measurements include and what requires protected browser, function, Atlas and authenticated-user traces; those runtime traces remain outstanding.
- [x] Inspect schemas/index declarations and source query shapes; explain plans, collection volume and deployment logs require authorized read-only Atlas/Vercel observability.
- [x] Add prioritized findings and a proposed next-step handoff without editing application code.
