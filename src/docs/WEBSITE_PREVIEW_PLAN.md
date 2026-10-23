# Client website preview — implementation plan

Status: implemented locally on 23 October 2026. Isolated backend/service/ZIP tests and the Chrome cross-repository pilot have passed. Real Vercel storage/account, DNS/TLS and production-browser verification remain release gates. See WEBSITE_PREVIEW_SETUP.md.

## Outcome and scope

An admin uploads a static website against an existing client project in the React portal. That client opens the working website inside their existing project workspace without another login. Uploads and preview bytes bypass Render. Existing authentication, billing, project lifecycle and public portfolio behavior remain independent.

Version 1 supports HTML, CSS, JavaScript, images, fonts and directory-index routes. It does not run PHP, WordPress, Node servers, build commands or client-site backends. An application requiring a build must provide its static export.

## Single sources of truth

| Information or behavior | Sole owner |
| --- | --- |
| Accounts, roles, client/project ownership and project availability | Existing portal backend and its MongoDB database |
| Current preview version, client visibility, preview hostname and access revision | One project preview record in the portal database |
| Upload-session/version status and canonical immutable file manifest | Portal database, separate preview upload/version records linked to project ID |
| Actual website files | Private Vercel Blob store |
| Token-scoped direct upload and private file delivery | One preview service in the existing Next.js deployment |
| Admin controls and client preview screen | Shared React portal preview components |

The Next.js app must not write directly to portal database collections or copy preview ownership into its website-user database. It consumes narrow authenticated backend endpoints. UI components never independently decide eligibility. Storage credentials stay server-side.

The existing `projectLink` and `portfolioCaptureAllowed` fields keep their public/live-website meanings. Private preview changes must not enter the public portfolio sync or screenshot capture pipeline.

## Where code belongs

- `E:\Allprojects\frontend`: a dedicated admin preview panel mounted in the existing project workspace, a reusable client/admin preview viewer, and centralized API entries.
- `E:\Allprojects\backend`: preview records, centralized access-policy helpers and limits, and small metadata/authorization endpoints. Reuse `authToken` and existing project ownership rules.
- `E:\Allprojects\merasoftware`: one server-only preview service module with route handlers for upload authorization/finalization and preview delivery. Read the installed Next.js guides before implementation.

Suggested endpoints are a design contract, not implemented routes:

- Backend: project preview state, initialize upload, finalize upload, change visibility, issue preview grant.
- Next.js: direct-upload authorization/callback, verify uploaded manifest, preview-session exchange, and catch-all static delivery on approved preview hosts.

All state changes are authorized on the backend. Next.js service calls use a narrowly scoped server-to-server assertion; browser-supplied project IDs or storage paths alone never grant access.

## Admin and client screens

Admin: Portal Admin → Clients → Client → Project → Website Preview.

Controls: Upload ZIP, Replace Website, View Preview, Show/Hide for Client. Upload status is visible. Client visibility starts hidden, and remains whatever the admin chose when a replacement succeeds. Admins can preview a ready version while client visibility is hidden.

Client: Portal → My Projects → Project → Website Preview. The entry is available only for that client's eligible project and a ready, visible preview. The viewer has expand and desktop/mobile-width controls. Customers cannot upload or change visibility.

There is no new management panel in the marketing website and no second account system.

## Upload and replacement flow

1. The admin selects an existing project and a ZIP in the portal.
2. The browser checks/extracts the archive in a worker, keeping the interface responsive. Normalize a single enclosing folder when appropriate; require a root `index.html` after normalization.
3. Reject traversal/absolute archive paths, duplicate normalized filenames and unsupported server executables. The browser enforces compressed ZIP size and stops extraction at expanded-size/file-count limits. Because the original ZIP never reaches a server, compressed size is explicitly a browser safeguard, not a server-verified claim. Server-side authorization and finalization independently enforce normalized paths, actual uploaded file sizes, total bytes and file count.
4. Backend authorizes the current admin and project, allocates a unique upload/version ID, and returns the exact authorized prefix and limits in a signed upload scope.
5. Files upload directly from the browser to a private Vercel Blob prefix with bounded concurrency and progress. File bytes and the original ZIP do not pass through Render. Next.js authorizes only the allocated paths, file types and sizes; it never accepts an arbitrary destination.
6. Next.js verifies the uploaded inventory against the manifest, required entry point and limits, then sends a scoped finalization assertion to the backend. Listing and verification happen on Vercel.
7. The backend atomically marks the version ready and switches the project's current-version pointer. A failed or incomplete replacement leaves the previous version active.

Use immutable version prefixes and the state-transition contract below. Retain the previous ready version for recovery; a version-history UI is outside MVP scope.

### Fixed MVP limits and upload contract

Declare these once in the backend preview policy. Return a policy version with initialization; the browser and Next.js consume that version rather than maintaining their own limits.

| Limit | MVP value | Enforcement |
| --- | --- | --- |
| Compressed ZIP | 50 MiB | Browser only |
| Total extracted/uploaded content | 200 MiB | Browser; verified Blob inventory before activation |
| Individual file | 10 MiB | Browser, scoped upload token, verified inventory |
| File count | 500 | Manifest authorization and inventory |
| Normalized path length | 240 UTF-8 bytes | Initialization, token issuance and serving |
| Concurrent file uploads | 4 | Portal upload worker |
| Upload session lifetime | 30 minutes | Backend clock |
| Individual Blob upload token validity | At most 10 minutes, never beyond session expiry | Token issuer |

Allowed website files: HTML, CSS, JS/MJS, JSON, TXT, SVG, PNG, JPEG, WebP, AVIF, GIF, ICO, WOFF/WOFF2 and TTF/OTF. Match supported extensions to a server-owned MIME table. ZIP entries with symlink metadata, executable/backend extensions, dot segments, backslashes, absolute/drive paths, control characters or ambiguous encoded separators are rejected. Exclude known packaging metadata (`__MACOSX`, `.DS_Store`) before constructing the final manifest. Resolve safe normalized Unicode paths consistently; reject normalization collisions.

The backend stores one canonical immutable manifest per version: normalized logical path, declared size, content type and deterministic Blob key, plus its hash. Allocation uses an opaque project ID/version ID, never customer names. The backend records the expected active version at initialization. Access revision is a separate permission-invalidation counter; visibility changes must not invalidate an otherwise valid replacement upload. Signed upload capabilities bind that manifest hash, prefix, limits, policy version, admin and expiry.

Next.js verifies the signed capability and manifest locally when issuing exact-file upload tokens. Issue/renew token batches with a bounded backend authorization call; do not query Render separately for each file. Record the latest outstanding token expiry before returning a batch. The selected SDK must prove it can bind the exact key, private store, size, expiry and overwrite policy; this is a pilot acceptance test.

Set `allowOverwrite: false`. No new upload authorizations are issued after the backend freezes a version for verification. Previously issued tokens may remain valid until expiry, but cannot replace verified existing keys. Only manifest-listed objects can ever be served. Extra objects never make a preview eligible and are cleanup candidates. Browser-supplied URLs must match the allocated private store/key; arbitrary remote URLs are never fetched.

For a retry of an existing key, the browser cannot silently overwrite or treat 'already exists' as proof of success. Reconcile the object during finalization; incompatible objects require a new upload version. Verification checks every expected object, actual size, extension/MIME policy, entry point and exact inventory. A checksum may aid retry diagnostics but is not authorization. Upload callbacks report progress; they cannot activate a version.

### Atomic state transitions and cleanup

One version has exactly one state: `uploading → verifying → ready`, or `uploading/verifying → failed/abandoned`. Cleanup claims `failed/abandoned → deleting → deleted`; an inactive ready version older than the retained recovery version may also transition `ready → deleting`. Terminal/cleanup versions cannot return to ready. Verification uses a 10-minute lease; expired leases fail closed and leave the old preview active.

- Initialization and callbacks use idempotency keys tied to the same project/version. Repeating a completed request returns its prior outcome.
- The backend performs compare-and-set `uploading → verifying`, freezes the manifest, and returns a verification lease ID. Only that lease can finalize. Verification runs on Vercel, not Render.
- In a MongoDB transaction, finalization requires the matching live lease, `verifying` status, current admin/project eligibility, and the project's expected active version. It changes `verifying → ready` and switches the project pointer together. A concurrent winner causes 409 for the loser; no stale overwrite or half-committed pointer.
- A client-visibility change increments the access revision and must not be undone by upload completion. Replacement preserves visibility. Recheck current state inside the transaction.
- Expiry/failure changes state atomically. Cleanup claims only an eligible inactive version inside a transaction and checks both current and retained-recovery pointers. Finalization cannot activate a version already claimed for deletion.
- Delete Blob objects only after all issued upload tokens have expired plus a two-minute buffer. This prevents delayed in-flight uploads from recreating a just-cleaned version. Deletion is idempotent, paginated and restricted to that version prefix.
- Keep current and one previous ready recovery version. Abandoned uploads and older unreferenced versions become cleanup-eligible after 24 hours. MVP cleanup is an authenticated Vercel maintenance operation that can be triggered from the admin panel; a paid scheduled-job dependency is not required. Render supplies metadata/claims only; Vercel performs storage deletion.

## Preview access, routing and isolation

1. A credentialed portal API call checks current account status, role, project ownership, project availability, visibility and ready version.
2. The backend issues a signed single-use handoff grant scoped to the user, project, immutable version, allowed preview host, access revision and viewer type. The handoff must be redeemed within 15 seconds. Its absolute permission deadline is issuance time + 60 seconds, set by the backend clock.
3. The portal POSTs the grant into a trusted, initially named bootstrap iframe on the verified preview host. Next.js verifies its signature, audience, issuer, host and deadline, then the backend atomically consumes its `jti` and rechecks eligibility. A replay fails. Issue a distinct preview-only session whose expiry cannot exceed the original absolute permission deadline. Do not put the portal login token into a URL or expose it to uploaded JavaScript. Do not call the marketing website's profile-creation flow.
4. Next.js verifies the preview session locally and serves only its immutable version's manifest-listed private Blob files. No Render request per image or CSS/JS file. Before activation, Next.js writes a private immutable manifest artifact under `website-preview-manifests/<projectId>/<versionId>.json`; the backend-owned manifest hash authenticates this serialization. Delivery reads that artifact with a bounded hash-verified in-process cache, not another ownership database. The portal renews permission at 40 seconds while the viewer is open, using a fresh credentialed backend request and new single-use handoff. A hidden bootstrap iframe updates the host-only preview cookie without navigating/reloading the visible website. The preview session alone cannot renew itself. If the parent closes, sleeps, signs out or loses permission, no new grant is issued and further file access stops by the absolute deadline. Hide/ban/access changes prevent new grants; existing access expires within 60 seconds. Already downloaded content cannot be recalled. Session expiry is not a new 60-second timer on redemption, and no positive expiry grace is added.
5. Opening a direct preview URL without permission must not reveal files. Use `Cache-Control: private, no-store` on bootstrap/session responses and delivered website files; authorization precedes every read or conditional response. Vercel's internal Blob caching may be used behind that check. A missing/expired preview session returns an access-required response and never falls back to portal authentication. Set correct MIME types and `X-Content-Type-Options: nosniff`.

Use a `__Host-WebsitePreview` cookie: Secure, HttpOnly, Path=/, no Domain, SameSite=Strict, expiring at the absolute permission deadline. This assumes the exact same-site HTTPS host contract below. Multiple projects use distinct hosts and cannot overwrite each other's preview session. Viewer role changes need a fresh grant. MVP grant expiry/redeem records live in the portal database; a TTL index performs eventual record cleanup, but application code enforces deadlines independently.

Use separate preview signing/service credentials, never the portal login signing key or portfolio integration secret. Render signs permission capabilities; Next.js uses verification-only key material where possible. Grant redemption/finalization service assertions have a distinct audience, method/body binding, expiry and replay protection. Bind browser mutations to the allowed portal Origin as well as existing authenticated admin checks. Renewal/issuance re-read current role membership, ban status and project state; `authToken` alone does not establish those preview permissions. On logout the portal stops renewal; the existing logout endpoint need not be redesigned for this bounded preview expiry contract.

Use an isolated, project-specific preview origin mapped to the existing Next.js deployment. A project-specific hostname preserves root-relative assets, JS imports, navigation and `/services/` → `/services/index.html` without rewriting user scripts or sharing a mutable 'current project' cookie across tabs. Unknown hosts and missing paths return a real 404; do not fall back to the marketing homepage or expose directory listings.

For the pilot, reserve `deepinteriors-preview.merasoftware.com` as the explicit project host, subject to checking that it is unused before any DNS action. Add that exact host as an alias of the existing Next.js Vercel project with Vercel's returned CNAME/TLS configuration. It is same-site with `portal.merasoftware.com` but a different origin. Store its verified, unique host-to-project binding in the backend preview record. If the candidate is occupied, choose another unused exact sibling hostname and record it before implementation; do not overwrite an existing binding. Additional projects receive their own explicit sibling hosts, without another Vercel project/deployment. Automatic domain provisioning is deferred.

Do not assume wildcard DNS is already available. Vercel wildcard certificates require its nameserver method; the main domain currently uses Cloudflare. Do not migrate the main domain's nameservers, disturb email records or add domain automation as part of the MVP. Verify the explicit hostname, TLS, same-site iframe session behavior and header policy before developing the full upload UI.

Uploaded code must remain off the portal and marketing origins. Use `sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"` on the viewer, with no top-navigation or download capability in MVP. `allow-same-origin` permits normal ES modules on the distinct preview origin; it does not make that origin equal to the portal. Only a trusted bootstrap route accepts a narrowly verified portal POST. Its completion `postMessage` is checked by exact origin, source frame and nonce. Bootstrap and service namespaces are reserved; reject conflicting uploaded paths.

Deliver a Content-Security-Policy restricting `frame-ancestors` to the portal, workers/objects/nested frames to none, connections to self, and native form submissions to none. Local scripts, inline styles/scripts and Google Fonts are supported; JavaScript-prepared WhatsApp popups are supported. This limits embedding and disables uploaded service/web workers. The admin upload-extraction worker belongs to the portal and is unaffected. Prevent marketing `/sw.js`, API, admin and framework-internal routes from falling through on a preview host; host routing happens before normal marketing routing. Explicitly bypass marketing layout/session/profile behavior. All other paths resolve from the authorized manifest or return 404.

The existing shared-domain portal cookie may also arrive on a sibling preview host. HttpOnly prevents JavaScript reads, but the preview service must ignore that cookie for serving and never log or forward it. Existing portal/backend CORS allowlists must not add preview hosts. Uploaded code is not granted portal API access. Test cross-origin requests, bootstrap Origin checks, forbidden marketing routes, JS modules, WhatsApp popups and forms. Features requiring downloads, uploaded workers or unusual external integrations are outside MVP acceptance and need an explicit later capability decision.

Provider prerequisites: verify the selected Vercel plan permits the intended commercial usage, private Blob creation, needed Function duration/streaming and domain aliases. Confirm MongoDB transaction support in production and the isolated test environment. Set a preview-storage spending alert/budget before release. Do not claim a free or zero-compute solution: private file delivery consumes Vercel Function/data-transfer usage. Pilot failure blocks release and must be reported; it must not silently switch previews to public storage, weaken access checks or move file traffic to Render.

## Phases and verification

1. **Infrastructure and routing pilot:** first implement the minimal preview policy/grant contract against isolated records, then verify provider account/SDK support, transaction support, exact preview hostname, TLS, private Blob reads, bounded session grant, iframe behavior and a Deep Interiors sample. Verify `/`, `/services/`, `/gallery/`, root-relative images and JS modules. No production DNS or account changes are authorized by this document. Infrastructure provisioning is a later explicit execution step; this planning task performs none.
2. **Backend SSOT:** add preview state/version records and access policy; test admin, owner, another client, guest, banned account, hidden preview and unavailable project. Keep existing billing, progress and portfolio policies unchanged.
3. **Upload and admin controls:** implement direct uploads and safe finalization. Test missing entry point, nested ZIP root, unsafe paths, excess expansion/file limits, failed upload, retry, concurrent replacement and abandoned-upload cleanup.
4. **Client viewer and release checks:** integrate into the existing workspace. Test mobile/desktop Chrome, Firefox and Safari, two projects in separate tabs, clean routes, all images, form links, expired/replayed grants, Show/Hide, logout, paused/background tabs, renewal without page reload, and previous-preview continuity during replacement. Confirm actual hide-to-expiry is at most 60 seconds with server-clock enforcement. Test cleanup/finalization concurrency and writes attempted with an outstanding old upload token. Confirm browser history and error paths never expose grants or portal credentials.

Use isolated test records/databases and per-repository backups before implementation changes. Preserve owner servers on 3000, 3001 and 8080. Do not edit local or production secrets, deploy, or change infrastructure while preparing the plan.

Before release, inspect the browser request flow: upload bytes go browser → Blob; preview bytes go browser → Vercel; Render sees only metadata and permission requests. Measure function invocations, bandwidth and storage rather than assuming a framework guarantees lower total cost.

## Completion criteria

- Admin operates entirely from the existing portal project workspace.
- A customer can see only their enabled preview and can navigate all five Deep Interiors pages without another login.
- Thirty gallery images and shared header/footer load correctly through the preview routes.
- Upload failure leaves the working preview intact; replacement becomes visible only after finalization.
- No public portfolio publication, Render file transfer or duplicate account/project database is introduced.
- Limits, recovery, revocation delay and Vercel usage are documented before release.

## References checked

- Local portal React project, `src/pages/AdminClientWorkspace.js`, `src/pages/ProjectDetails.js`, `src/components/admin/PortfolioSourceSettings.js`.
- Local backend `models/orderProductModel.js`, `controller/order/getOrderDetails.js`, `controller/order/portfolioSettings.js`.
- Local Next.js `src/lib/portal.ts`, `src/lib/portal-api.ts`, `src/docs/login.md`.
- Private Blob storage: https://vercel.com/docs/vercel-blob/private-storage
- Direct client uploads: https://vercel.com/docs/vercel-blob/client-upload
- Domain setup: https://vercel.com/docs/domains/set-up-custom-domain
- Wildcard/TLS constraints: https://vercel.com/docs/domains/working-with-ssl

## Local verification result

On 23 October 2026 the isolated Chrome pilot uploaded 77 deployable Deep Interiors files (8,208,546 content bytes), activated the version, navigated the real site and checked all 30 gallery images, mobile navigation, WhatsApp popup preparation, renewal without losing form input and Hide stopping the viewer. It used the installed Vercel Blob browser-upload SDK, actual backend controllers, a MongoDB replica set and a test-only in-memory storage adapter. All browser traffic was intercepted; no live provider upload, production API write or external message occurred. Real storage, production host routing, browser compatibility and deployment remain gated separately.
