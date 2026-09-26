# Code Audit

- Stack: Next.js 16, TypeScript, Tailwind, Mongoose, Firebase/Firebase Admin, Cloudinary, Zod.
- Local URL: `http://localhost:3000`; Vercel is the production target.
- Public pages and admin UI routes exist; lint/build passed before this doc update.
- Real API foundation exists: `/api/blogs`, `/api/reactions`, `/api/saved-posts`.
- Real models exist: `Blog`, `Reaction`, `SavedPost`.

## Not complete

- `src/lib/site-data.ts` is still placeholder content for public blogs.
- Admin forms do not yet submit to APIs.
- Firebase client login/roles and Cloudinary upload route are not built.
- MongoDB/Docker is not installed locally; `.env.local` credentials are missing.

## Next action

Start local MongoDB, add `.env.local`, then replace placeholder blog reads with real MongoDB CRUD before adding more UI.
