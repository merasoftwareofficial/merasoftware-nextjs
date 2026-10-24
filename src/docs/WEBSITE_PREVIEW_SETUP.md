# Website Preview — implementation and release setup

## Current workflow supersedes the Vercel instructions below

As agreed on 23 October 2026, use **manual Cloudflare Pages ZIP upload + a public preview URL in the portal** for now. Read [WEBSITE_PREVIEW_HANDOFF.md](./WEBSITE_PREVIEW_HANDOFF.md) for the active procedure and next-agent requirements. No paid plan, Vercel Blob store, preview credentials or dedicated preview hostname is required for this temporary approach.

The remaining sections preserve the earlier private Vercel implementation's setup reference. They do not describe a completed live deployment and must not be followed as prerequisites for the current manual approach. The portal's external-URL integration is still pending; this documentation update does not implement it.

The existing React portal owns the controls and viewer. The existing Next.js Vercel project owns preview APIs and its private Blob store. The existing backend/MongoDB owns every project binding, version, visibility setting and permission decision. There is no new client account or second project database.

## UI location

Admin: Portal Admin → Clients → Client → Projects → open project → **Website Preview** section. This is a section in the existing detail workspace, not a separate top-level admin panel.

Client: My Projects → project → project details → **Website Preview** → View Website Preview. Projects with linked services first use their existing Open Project action. A hidden/unavailable preview does not render a customer preview section.

Admin controls: save the project's dedicated preview hostname; Upload/Replace Website ZIP; View Website Preview; Show/Hide to Client; Clean expired uploads. Changing DNS is not a function of the hostname input. Replacing an upload does not change client visibility.

## Website ZIP format

Include `index.html` and deployed assets/page folders at the ZIP root, or inside one enclosing folder. Exclude developer files such as README/Markdown, Python tools, node_modules, Git metadata, `.env`, server configuration and previous ZIPs. Unsupported files are rejected explicitly instead of being served accidentally. Folder-index pages preserve clean URLs.

An upload-ready pilot package is prepared at `E:\Deepinteriors\DeepInteriors-preview-20261023.zip`: 77 deployable files, including the five pages and their original assets. It excludes the source-folder README, Python tools and QA screenshots. This package is not uploaded to a live account by the local pilot.

## Storage and traffic

- Portal MongoDB collections: `websitepreviews`, `websitepreviewversions`, `websitepreviewreceipts`. The project ID is the preview record ID; no duplicate customer record is created.
- Private Blob website keys: `website-previews/<projectId>/<versionId>/<logicalPath>`.
- Service-only artifact: `website-preview-manifests/<projectId>/<versionId>.json`. This is a hash-verified immutable serialization of the backend-owned manifest, written before activation. It is not another mutable state authority and has no public delivery route. Delivery reads it from Blob, with a bounded in-process cache; no Render lookup is needed for image/CSS/JS requests.
- ZIP extraction runs in an admin-browser worker. The original ZIP is not retained. File bytes upload directly to Blob using exact-key, size-bounded, expiry-bounded tokens with overwrites disabled.
- Render receives manifest metadata, bounded permission/activation calls and cleanup claims. Next.js performs inventory checks, private file streaming and object deletion.

## Required configuration — do not paste secrets into chat or commit them

Use the exact Vercel project associated with `E:\Allprojects\merasoftware`, not the React frontend's Vercel project, when creating the **private** Blob store. Verify intended commercial use, storage/bandwidth budget and Function limits in that account before enabling access.

Generate separate credentials locally if needed:

```powershell
node scripts/website-preview-keygen.mjs E:\private-config\website-preview-keys
```

The directory must not already exist. The helper writes files with new key values; it prints only their directory and does not edit any app environment. Keep these files private. Both PEM formats are supported in environment values: actual newlines or literal `\n` sequences.

Render backend environment:

- `WEBSITE_PREVIEW_PRIVATE_KEY`: EC P-256 PKCS#8 private PEM, used only to sign preview capabilities.
- `WEBSITE_PREVIEW_PUBLIC_KEY`: matching SPKI public PEM.
- `WEBSITE_PREVIEW_SERVICE_SECRET`: separate random value of at least 32 characters, shared only with the Next.js service.
- `WEBSITE_PREVIEW_SERVICE_URL`: `https://www.merasoftware.com` (or the actual verified Next.js management origin).
- Existing login/database settings stay unchanged. MongoDB must support transactions; tests use an isolated replica set.

Next.js Vercel environment:

- `BLOB_READ_WRITE_TOKEN`: token for its private Blob store. Never expose as `NEXT_PUBLIC_*`.
- `WEBSITE_PREVIEW_PUBLIC_KEY`: backend capability verification key; do not place the private capability key here.
- `WEBSITE_PREVIEW_SERVICE_SECRET`: same dedicated integration value as backend.
- `WEBSITE_PREVIEW_SESSION_SECRET`: a different random value of at least 32 characters, for host-only preview sessions.
- Existing `PORTAL_URL` and `PORTAL_API_URL` must identify the correct portal and backend.

React portal: no new secret or preview-service URL environment variable. It uses the existing backend URL and receives service configuration from the backend.

Missing backend configuration disables upload controls. A missing Next.js/storage configuration fails closed; never substitute a public store or send file traffic through Render.

## Domain setup and isolation

First check that `deepinteriors-preview.merasoftware.com` is unused. Add this exact hostname to the **same Next.js Vercel project**, then configure only its returned DNS record and verify HTTPS. Save that hostname against Deep Interiors' project in the portal. Each later project needs its own verified sibling hostname. There is no per-client Vercel project or app deployment.

The implementation intentionally accepts only project-specific `*-preview.merasoftware.com` hosts. This keeps iframe sessions same-site with the portal while using a distinct origin. It does not assume wildcard DNS, buy a domain, alter nameservers or modify email records. Vercel domain-account access and DNS changes remain release actions, not completed implementation steps.

`src/proxy.ts` routes preview hosts to a dedicated route handler before marketing pages. Marketing static assets retain their normal CDN path. Preview routes do not use the marketing layout, portal-token authentication or marketing service worker. Reserved uploaded paths include `api`, `admin`, `_next`, `__website-preview`, `sw.js`, and `service-worker.js`.

The trusted bootstrap sets `__Host-WebsitePreview` (Secure, HttpOnly, SameSite=Strict, no Domain). A handoff can be used once within 15 seconds; the permission deadline is fixed at issuance + 60 seconds. Parent-portal renewal runs at 40 seconds and updates the cookie through a named hidden iframe, preserving the visible page/form. Missing/expired permissions deny new file requests; previously downloaded content cannot be recalled.

Only the configured portal Origin may frame/bootstrap the preview. The viewer permits scripts, same-origin modules, forms and popups in its distinct-origin sandbox. No top navigation, downloads or uploaded workers are permitted. Preview CSP restricts connections to self, supports Google Fonts, and blocks native form submission. JavaScript-prepared WhatsApp popups (as used by Deep Interiors) remain supported. New external integrations require a deliberate later policy change. Cookies shared with the parent domain are ignored and never logged/forwarded by preview serving.

## Verification commands

Backend:

```powershell
node --test tests/websitePreview.test.js
```

Next.js:

```powershell
node --conditions=react-server --import tsx --test tests/website-preview.test.ts
npx tsc --noEmit --incremental false
$env:NEXT_BUILD_DIR='.next-build'; npm run build
```

Production routing smoke (use an unused port and canonical `localhost` binding; Next.js normalizes loopback URLs):

```powershell
$env:NEXT_BUILD_DIR='.next-build'; npx next start --port 3305 --hostname localhost
# In a second terminal:
node tests/website-preview-routing.mjs 3305
```

The smoke checks preview isolation, static-asset routing, reserved-route denial, forged routing-header rejection, the existing marketing redirect and static manifest. Stop only this test server after checking; leave owner servers on 3000/3001/8080 running.

React portal:

```powershell
node --test tests/website-preview-archive.test.mjs
$env:CI='false'; $env:BUILD_PATH='build-website-preview'; npm run build
```

Cross-repository Chrome pilot from the Next.js checkout:

```powershell
node --conditions=react-server --import tsx tests/website-preview-browser.mjs E:\Deepinteriors
```

The pilot bundles the actual portal preview components/worker, uses real backend controllers and an isolated MongoDB replica set, and exercises the installed Blob browser-upload SDK against an in-memory storage adapter. Every browser request is intercepted. It does not use production APIs, actual Blob storage, live DNS or real WhatsApp messaging. Temporary screenshots are written under the system temp directory. The pilot prepares only deployable files from the external client website, excluding developer docs/tools.

Unit/integration checks cover permissions, current roles, path/ZIP validation, failed replacement, transactional concurrent activation, single-use grants, private delivery, expired leases, retained recovery versions and cleanup. The browser pilot additionally covers the real five-page site, 30-image gallery, mobile navigation, WhatsApp popup preparation, renewal without losing form input, and Show/Hide.

## Release gates still required

1. Actual Vercel private store and credentials configured in the correct projects/services; no secret values need to be shared in chat.
2. Exact pilot hostname/DNS/TLS verified and connected to the Next.js deployment.
3. Deploy backend first, then Next.js preview APIs, then portal frontend. Until services are configured, portal UI remains disabled/unavailable.
4. Test real direct uploads, private reads, token constraints, host routing, streaming limits and spending alerts on the selected Vercel account.
5. Test current Chrome, Firefox and Safari against real HTTPS origins, including cookies, renewal, WhatsApp actions, logout/ban/Hide expiry and two projects in separate tabs.

The implementation must not be described as live or provider-verified until these gates pass. See `WEBSITE_PREVIEW_PLAN.md` for the agreed ownership and state-transition contracts.
