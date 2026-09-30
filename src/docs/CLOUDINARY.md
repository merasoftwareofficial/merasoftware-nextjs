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

An editor or admin can now visit `/admin/media`, choose a photo up to 4 MB, and see
its preview and HTTPS URL after upload. The route checks the session and role before
accepting the file. This page is for testing the upload path: it does not save an
image reference to MongoDB or list existing assets. Blog/editor upload integration
and deletion workflows are still pending. Adding environment variables does not
redirect other upload flows by itself.

## Verification (30 September 2026)

Using local credentials, the account's Dynamic folder mode was confirmed. The
actual helper uploaded a temporary PNG into `merasoftware`; the Admin API confirmed
its folder and asset ID, and its HTTPS URL returned an image successfully. The
test asset was then deleted. Empty buffers, buffers over 10 MB, missing credentials
and non-image bytes were rejected. TypeScript and this module's ESLint check passed.
Vercel environment configuration and deployment were not verified in this step.
