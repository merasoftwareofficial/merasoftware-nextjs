# Website preview — active decision and next-agent handoff

Updated: 23 October 2026. This document is the single source of truth for the current temporary preview workflow. WEBSITE_PREVIEW_PLAN.md and WEBSITE_PREVIEW_SETUP.md retain the previous private Vercel architecture as historical implementation references.

## User decision and authorization

The user does not want to purchase hosting now. They accepted manually uploading the website ZIP to Cloudflare Pages and making the resulting public preview URL accessible from the existing client portal. Their latest request authorizes updating documentation for a next agent; no application code, provider setup or deployment is performed by this handoff.

This is an intentional temporary change from automatic private ZIP previews. The preview website will be public: anyone with its URL can open it outside the portal. Portal Show/Hide only controls whether the portal presents the link; it cannot revoke access to the public website. Do not describe this as portal-only private hosting. Noindex, obscure URLs or an iframe are not access control.

Moving preview files off Vercel does not resolve the separate commercial-use eligibility of existing business apps on Vercel Hobby. Do not claim that it does. No account-switching workaround or paid upgrade is authorized.

## Repositories and current state

| Repository | Responsibility |
| --- | --- |
| `E:\Allprojects\frontend` | React portal: admin project controls and client project viewer |
| `E:\Allprojects\backend` | Express backend + existing MongoDB: project ownership, roles and preview metadata |
| `E:\Allprojects\merasoftware` | Next.js marketing website; contains this documentation and the earlier private Vercel service |
| `E:\Deepinteriors` | Five-page English static pilot website and upload-ready ZIP |

Check each repository's AGENTS.md and working tree before editing. Do not revert unrelated or earlier work. The chat's shell working directory may point to an unrelated project.

Earlier private-preview code exists locally across all three repositories. It includes archive validation, versioning, direct Blob upload, private delivery, viewer renewal and access checks. Previous local verification reported 21 tests, 10 routing checks, production builds and an isolated Chrome pilot passing. These results concern the earlier implementation; they do not verify the new external-URL workflow or any live provider deployment. Reinspect current code rather than assuming those results still apply after changes.

The screenshot's yellow credentials warning and disabled Upload Website ZIP belong to the earlier Vercel-backed mode. The new manual workflow must not depend on those credentials. No live Cloudflare project, public preview URL, account connection or upload has been confirmed in this conversation.

## Manual upload procedure for the owner

1. Sign in to Cloudflare and open **Workers & Pages**. Choose creation of a **Pages** project using **Direct Upload / drag and drop** (dashboard wording can change).
2. Use a recognizable project name such as `deepinteriors-preview`; availability is not yet checked.
3. Upload `E:\Deepinteriors\DeepInteriors-preview-20261023.zip`. It currently exists, contains 77 deployable files and is 8,123,657 bytes compressed. It excludes developer tools, docs and QA screenshots.
4. Confirm `index.html` and website assets are at the deployment root. If the upload tool leaves a wrapper folder, extract the ZIP locally and upload the actual site folder contents instead.
5. Deploy, then copy the actual HTTPS `*.pages.dev` URL from Cloudflare. Do not assume a proposed project name is an existing address. A custom domain is not required.
6. Verify all five pages, clean URLs, images, gallery filters/dialog, mobile menu and WhatsApp action on that real URL.
7. After the next agent implements the portal fields described below, open **React Admin Portal → Clients → Client → Projects → Project → Website Preview**. Save that URL, verify View, then Show to Client.
8. The client opens **My Projects → Project → Website Preview → View Website**. Updates are uploaded manually to the same Cloudflare project; reusing its production URL avoids changing portal metadata each time.

This is a Pages static deployment, not R2 storage and not a Workers/Next.js migration. No Cloudflare API token, automation, new database or DNS migration is needed for this manual phase. Website files and traffic go to Cloudflare; Render receives only existing authentication/metadata traffic. The portal does not receive or retain the ZIP in this workflow.

Official references checked during planning:

- Direct Upload (ZIP/folder supported): https://developers.cloudflare.com/pages/get-started/direct-upload/
- Pages limits: https://developers.cloudflare.com/pages/platform/limits/
- Static delivery pricing: https://developers.cloudflare.com/pages/functions/pricing/

Dashboard drag-and-drop currently allows 1,000 files and a maximum 25 MiB per individual file; the pilot is comfortably below these limits. Recheck current provider limits before uploading other projects. Never upload `.env`, private client data or server secrets to a public static deployment.

## Next agent: implementation still required

The existing private-mode panel does not yet provide this external-URL workflow. Do not instruct the owner to use nonexistent external-URL fields. First inspect the code and present a short, concrete implementation plan; implement once the user authorizes continuation.

### SSOT and backend

- Reuse the existing project preview record and project ownership checks in `backend/helpers/websitePreviewService.js`, `helpers/websitePreviewPolicy.js`, `models/websitePreviewModel.js`, `controller/order/websitePreview.js` and `routes/index.js`.
- Add an explicit preview mode (suggestion: `external-url`) and one canonical external preview URL field to that record. Exact names should follow current code conventions. Mode and URL support are proposed, not already implemented.
- Store URL, client visibility and mode in MongoDB, associated with the existing project ID. Default client visibility to hidden; changing the URL should not silently publish it. One authoritative backend eligibility rule should control what admins/clients receive.
- Reuse the existing authenticated project preview GET/PATCH endpoints where practical. External mode must work while Vercel Blob/service configuration is absent. Avoid a global configuration guard accidentally disabling external mode.
- Only authorized admins may save/change the URL or visibility. Clients may read previews only for their own available projects and only when the active mode is ready/visible. Reuse existing authentication, role and project rules.
- Validate an absolute HTTPS URL; reject credentials, malformed URLs and unsafe schemes. For this manual phase, allowing exact `pages.dev` hosts and their subdomains is a reasonable narrow policy. Define validation once server-side and return useful errors. Do not fetch or proxy arbitrary submitted URLs through Render.
- Keep prior private upload/version state intact; changing modes must not delete stored files or versions. Older records need a backward-compatible interpretation.
- Do not reuse the order's `projectLink` or `portfolioCaptureAllowed`: those drive the separate public portfolio/screenshot workflow. Saving a preview must not trigger public portfolio capture or publication.

### React UI

- Relevant files: `frontend/src/components/WebsitePreviewPanel.js`, `WebsitePreviewViewer.js`, `src/helpers/websitePreviewApi.js`, `src/pages/AdminClientWorkspace.js` and `src/pages/ProjectDetails.js`.
- In external mode, show an English **Preview website URL** input, Save, View Website and Show/Hide controls. Explain briefly that the URL is publicly accessible and ZIP upload happens manually in Cloudflare Pages.
- Do not require the old dedicated-hostname field, Vercel setup warning, automatic ZIP upload or expired-upload cleanup for external mode. Preserve the earlier private implementation rather than deleting it as a side effect.
- A simple **View Website** button opening a new tab is sufficient for this phase. Use `noopener noreferrer` for new-tab links. Embedding can be an optional enhancement only after verifying frame headers and browser behavior; do not promise an embedded view without testing.
- The external viewer must not run private-mode grant redemption, session renewal or Blob calls. Client Show/Hide should update the portal UI consistently while clearly not claiming to disable the public URL.
- Keep UI labels/content English; communicate with the owner in concise Hinglish.

### Next.js and scope boundaries

No Next.js runtime change should be necessary for a normal external link. Do not create a Blob store, generate credentials, migrate all apps, purchase hosting, change DNS, automate Cloudflare deployment or delete the earlier service as part of this task. The earlier service can remain dormant. If Next.js code becomes necessary, read the installed Next.js guides required by that repository's AGENTS.md first.

## Acceptance checks for the new workflow

1. An authorized admin can save a valid Pages URL and read it back after refresh with Blob credentials missing.
2. Invalid URLs and unauthorized/admin-only mutations are rejected server-side. Another client's preview metadata cannot be accessed.
3. The client sees a View Website entry only for their own available project when enabled; hiding removes it from the portal.
4. The link opens the saved HTTPS website; the external workflow makes no private-grant, Blob or ZIP-upload requests.
5. Saving/replacing a preview URL does not change public portfolio fields or trigger screenshot capture.
6. Existing private records remain readable and no file/version deletion is triggered by the new mode.
7. Test the real deployed five-page website separately from portal metadata checks. Public direct access remains expected even when hidden in the portal.
8. Run focused backend/frontend checks and relevant builds; report local vs live results separately. Do not deploy or claim success without checking the actual deployment and user-authorized release scope.

## Suggested next-agent starting prompt

Read `E:\Allprojects\merasoftware\src\docs\WEBSITE_PREVIEW_HANDOFF.md` first. I want the temporary manual Cloudflare Pages upload workflow. Inspect the existing frontend/backend preview implementation, then give me a concise plan for a dedicated external preview URL and Show/Hide in the existing project panel. Keep MongoDB as SSOT, keep public portfolio fields separate, do not require Vercel Blob credentials and do not buy hosting or migrate my apps. Clearly distinguish work already implemented from work still pending.
