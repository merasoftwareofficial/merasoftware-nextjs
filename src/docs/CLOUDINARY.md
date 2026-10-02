# Cloudinary storage connection

`src/lib/cloudinary.ts` provides the server-only connection and shared
`uploadCloudinaryImage(Buffer)` function. Cloudinary's existing Node.js SDK is used.

Set these variables in `.env.local` and the Vercel project's environment settings:

```env
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
CLOUDINARY_ASSET_FOLDER=merasoftware
```

Keep actual credentials out of source control and browser code. Restart local
development after environment changes; redeploy Vercel for production changes.
The configured account uses Dynamic folders: uploads set `asset_folder`, which
organizes images in the Media Library independently of the delivery URL.

## Using the shared function later

From an authorized Node.js Route Handler or Server Action:

```ts
import { uploadCloudinaryImage } from "@/lib/cloudinary";

// First authorize the user and validate the incoming request/file size.
const uploaded = await uploadCloudinaryImage(Buffer.from(await file.arrayBuffer()));
// Save uploaded.url and uploaded.publicId with the appropriate database record.
// Image alt text belongs to the content form/database, not this storage helper.
```

The helper accepts non-empty buffers up to 10 MB. Cloudinary checks the actual
image format against JPEG, PNG, WebP, GIF and AVIF. It returns HTTPS URL, public ID,
asset ID, folder, dimensions, format and size. Uploads get generated IDs and do
not overwrite existing images. These are public images; private media needs a
separate access-control design. Route/body limits on the hosting platform still
apply, so a future upload endpoint must choose limits appropriate to that host.

Uploads are saved as `MediaAsset` records (`src/models/Media.ts`) and listed in the
Media Library at `/admin/media`. Management, usage tracking, deletion and the shared
image chooser are described in **Media Library management** below.

## Verification (30 September 2026)

Using local credentials, the account's Dynamic folder mode was confirmed. The
actual helper uploaded a temporary PNG into `merasoftware`; the Admin API confirmed
its folder and asset ID, and its HTTPS URL returned an image successfully. The
test asset was then deleted. Empty buffers, buffers over 10 MB, missing credentials
and non-image bytes were rejected. TypeScript and this module's ESLint check passed.
Vercel environment configuration and deployment were not verified in this step.

## Media Library management (2 October 2026)

Backup of every changed file: `work51/`.

### Rules (owner decisions)

- Only images uploaded through this app to our Cloudinary are managed. Outside
  image URLs are never tracked, listed or blocked.
- Website sections (homepage now; Portfolio/Services/Testimonials later) take
  **Upload + Media Library** only — no URL option.
- Content (blog featured image, images inside an article, any future post type)
  takes **Upload + Media Library + Image URL**.
- An image in use cannot be deleted; the page lists where it is used.

### Who can do what

| Action | Member | Moderator | Editor | Admin |
|---|:-:|:-:|:-:|:-:|
| Image by outside URL in a post | ✅ | ✅ | ✅ | ✅ |
| Choose from Media Library | ❌ | ✅ | ✅ | ✅ |
| Upload to Cloudinary | ❌ | ❌ | ✅ | ✅ |
| Media page, Used/Unused, Copy URL, Edit alt | ❌ | ❌ | ✅ | ✅ |
| Delete | ❌ | ❌ | ❌ | ✅ |

The rule lives in one place: `imageSourcesFor(role, { allowUrl })` in
`src/components/image-chooser.tsx`, using `atLeast()` from `src/lib/roles.ts`.

### What changed (before → after, with location)

| Area | Before | After | Where |
|---|---|---|---|
| Media page | Upload + read-only grid; no delete, no alt edit | Unused/Used tabs, search, size/KB/date, Copy URL, Edit alt, Delete (admin, unused only); used images list "Used in" with edit links | `src/app/admin/media/page.tsx`, `media-uploader.tsx` (`MediaUploader`, `MediaCard`) |
| Usage tracking | None | `findMediaUsage(assets)` — computed fresh on every call, never stored. Checks homepage slots (by asset `_id`), every blog in every status: featured image (by `publicId` or URL) and images inside the Tiptap content (Cloudinary URL containing the `publicId`, transformations included) | `src/lib/media-usage.ts` |
| Delete | Not possible (`deleteCloudinaryImage` only cleaned up duplicate races) | `DELETE /api/media/[id]` (admin): re-checks usage on the server → 409 with the places if used; removes the DB record first, then the Cloudinary file. If Cloudinary fails, only an unused file is left (logged, admin alerted) | `src/app/api/media/[id]/route.ts` |
| Alt text edit | Not possible | `PATCH /api/media/[id]` (editor) changes the library default only; places that saved their own alt keep it | same file |
| Repo | `list`, `findByIds`, `findByChecksum`, `create` | + `findById`, `updateAltText`, `remove` (Mongo and JSON drivers) | `src/lib/repo/types.ts`, `mongo-driver.ts`, `json-driver.ts` |
| Media list API | `GET /api/media` editor only | Moderator and above (read-only, for the chooser) | `src/app/api/media/route.ts` |
| Image chooser | Library-only `MediaPicker` (blog) and a separate inline picker + upload in the homepage editor | One modal, `ImageChooser`, with Library / Upload / Image URL tabs shown per `sources`; fetches `/api/media` on open; optional `minSize` low-resolution warning before upload; portalled to `<body>` | `src/components/image-chooser.tsx` |
| Blog featured image | Library only | Library + Upload + URL. URL images save an empty `publicId` and show "Outside image URL" | `src/components/media-picker.tsx`, `src/app/admin/blog/blog-form.tsx` |
| Image inside an article | `window.prompt("Image URL")` | Image button opens the chooser. Admin blog form passes role-based sources; the members' community form keeps URL only (default `URL_ONLY`) | `src/components/editor/tiptap-editor.tsx` |
| Homepage images | Inline library list + own upload + own low-res confirm (`uploadForSlot`, `chooseUpload`, `pendingUpload`) | "Choose image" opens the chooser with `allowUrl: false` and the slot's `minSize`; crop, alt and resolution note unchanged. Homepage API still accepts library assets only | `src/app/admin/homepage/homepage-image-editor.tsx`, `page.tsx` (passes `role`) |
| Upload path | Upload code repeated in the Media page and homepage editor | One browser helper `uploadToLibrary()` / `imageFileProblem()`; every upload still goes through `/api/media/upload` | `src/lib/media-upload.ts` |
| Role ranking | `RANK`/`atLeast` inside server-only `auth.ts` | Moved to `src/lib/roles.ts` so client code can use it; `auth.ts` re-exports `atLeast` (server behaviour unchanged) | `src/lib/roles.ts`, `src/lib/auth.ts` |
| CSS | `.homepage-upload-button` rules | Removed (unused); added `.image-chooser*`, `.media-library-bar`, `.media-uses`, `.media-card-actions`, `.media-alt-edit` | `src/app/globals.css` |

### Duplicate protection (unchanged, now applies everywhere)

`/api/media/upload` hashes the bytes (sha256); the same bytes return the existing
asset with `reused: true` and nothing is uploaded. Every upload — Media page and
chooser (blog, homepage) — goes through this route, so the check applies to all.
After a delete the checksum is gone, so the same file can be uploaded again.

**Open:** records saved before checksums existed (no `sha256`) are not covered by
the duplicate check. Whether any exist in production was not checked (read-only
access to production data was not granted in that session).

### Verification (1–2 October 2026)

- `tsc --noEmit` clean; ESLint: no new warnings.
- `findMediaUsage` run against mock data: homepage slot, featured image and a
  transformed Cloudinary URL inside a draft were found; an outside URL with the
  same file name was not matched; an unused asset returned no uses.
- Without a session: `GET/PATCH/DELETE /api/media…` → 401; `/admin/media` and
  `/admin/homepage` → login redirect.
- Owner tested the signed-in flow in the browser and confirmed it working.

