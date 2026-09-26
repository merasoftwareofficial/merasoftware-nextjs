# Code Audit

Code-state snapshot only. Rules, traps and what is built live in `BLOG.md` — read that first and do not repeat it here.

Updated 26 Sep 2026, after blog steps B1 to B5.

## Stack

Next.js 16.3.6 (Turbopack) · TypeScript · Tailwind · Tiptap 3.31 · Zod. Mongoose, Firebase Admin and Cloudinary are installed but unused. Local: `http://localhost:3000`.

`npx tsc --noEmit` passes clean. `npm run build` does not complete on this machine — see Known issue in `BLOG.md`.

ESLint reports 7 problems, all pre-existing and none from B4 or B5: 2 errors in `admin/blog/blog-form.tsx` (`react-hooks/set-state-in-effect` on the slug effect, from B2) and 5 unused-variable warnings on deliberately underscore-prefixed names.

## Known weak points in the code

- `src/lib/mongodb.ts` and `src/lib/firebase-admin.ts` are unreferenced by working code; they remain as the shape for the future implementation. So are `src/models/*` — the Mongoose schemas are the migration target, not a live interface.
- Most `/admin/*` pages outside `blog/` and `comments/` are still static placeholder forms with no handlers. `/admin/settings` is half-wired: the comment block saves, the business-details form below it does not. The nav hides each page from roles that cannot use it.
- `POST /api/auth` accepts a client-supplied role. Intentional for local testing; see Security in `BLOG.md`.
- The topic pages, and `sitemap.ts` when collecting topics, scan every published post's category and tags in memory. Correct, and fine at this size; the MongoDB driver should answer it with a query.
- `blogRepo.list()` has no pagination in any listing page — every published post of that type is rendered, and blog search filters that same full list. Revisit when a listing grows long.
- `sitemap.ts` and `structured-data.ts` hardcode `https://merasoftware.com`. One constant each; move both to an environment variable before a staging deploy, or staging will advertise production URLs.
- `GET /api/saved-posts` and `/account/saved` read each saved post one id at a time. Fine for a personal list; a batch read belongs in the repo if it grows.
- Reaction and saved rows have no uniqueness constraint in the JSON driver — the routes check first, so a double-click cannot double-count, but two truly concurrent writes could. `models/Engagement.ts` carries the unique index the MongoDB driver will enforce properly.

## Keep this file current

Update the stack line and the weak-points list when they change, and delete anything your work made untrue. Do not restate `BLOG.md`. Record facts about the code and decisions the owner gave — not your own conclusions or suggestions.
