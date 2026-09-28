# Code Audit

Code-state snapshot only. Rules, traps and what is built live in `BLOG.md` — read that first and do not repeat it here.

Updated 28 Sep 2026, after the client-portal login (`login.md`).

## Stack

Next.js 16.3.6 (Turbopack) · TypeScript · Tailwind · Tiptap 3.31 · Zod · Mongoose · jose (verifies the portal's login token). MongoDB works when `DATA_DRIVER=mongo`; Firebase Admin and Cloudinary are installed but unused. Local: `http://localhost:3000`.

`npm run build` passes with `DATA_DRIVER=mongo`; database-backed pages render on request, so build does not need Atlas access. It does need `PORTAL_API_URL` and `PORTAL_URL` set — `/login` fails to prerender without them.

Last recorded ESLint run reported 7 issues before the MongoDB driver work: 2 errors in `admin/blog/blog-form.tsx` and 5 unused-variable warnings. Lint has not been rerun after MongoDB changes.

## Known weak points in the code

- `src/lib/firebase-admin.ts` and Cloudinary are not connected to working product flows yet.
- Most `/admin/*` pages outside `blog/`, `comments/` and `users/` are still static placeholder forms with no handlers. `/admin/settings` is half-wired: the comment block saves, the business-details form below it does not. The nav hides each page from roles that cannot use it.
- `/admin/users` lists the stored blog role; a client-portal admin shows the stored role there but is admin by derivation (`src/lib/auth.ts`).
- Topic pages and `sitemap.ts` scan published posts' categories and tags in memory. Correct at current scale; consider query-backed aggregation if the blog grows substantially.
- `blogRepo.list()` has no pagination in any listing page — every published post of that type is rendered, and blog search filters that same full list. Revisit when a listing grows long.
- `sitemap.ts` and `structured-data.ts` hardcode `https://merasoftware.com`. One constant each; move both to an environment variable before a staging deploy, or staging will advertise production URLs.
- `GET /api/saved-posts` and `/account/saved` read each saved post one id at a time. Fine for a personal list; a batch read belongs in the repo if it grows.
- Reaction and saved records have MongoDB uniqueness indexes; simultaneous toggles can still race between the route's read and write.

## Keep this file current

Update the stack line and the weak-points list when they change, and delete anything your work made untrue. Do not restate `BLOG.md`. Record facts about the code and decisions the owner gave — not your own conclusions or suggestions.
