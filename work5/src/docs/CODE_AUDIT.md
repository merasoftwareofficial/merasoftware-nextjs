# Code Audit

Code-state snapshot only. Rules, traps and what is built live in `BLOG.md` — read that first and do not repeat it here.

Updated 26 Sep 2026, after blog steps B1, B2 and B3.

## Stack

Next.js 16.3.6 (Turbopack) · TypeScript · Tailwind · Tiptap 3.31 · Zod. Mongoose, Firebase Admin and Cloudinary are installed but unused. Local: `http://localhost:3000`.

`npx tsc --noEmit` passes clean. `npm run build` does not — see Known issue in `BLOG.md`.

## Known weak points in the code

- `src/app/api/reactions/route.ts` and `src/app/api/saved-posts/route.ts` import firebase-admin and Mongoose directly and throw on any call. B4 moves them to the repo layer.
- `src/app/sitemap.ts` returns one static homepage URL.
- `src/lib/mongodb.ts` and `src/lib/firebase-admin.ts` are unreferenced by working code; they remain as the shape for the future implementation.
- Most `/admin/*` pages outside `blog/` are still static placeholder forms with no handlers. The nav now hides each one from roles that cannot use it, so a member sees only Overview and Blog posts.
- `POST /api/auth` accepts a client-supplied role. Intentional for local testing; see Security in `BLOG.md`.
- The topic pages match a slug by scanning every published post's category and tags in memory. Correct, and fine at this size; the MongoDB driver should answer it with a query.
- `blogRepo.list()` has no pagination in any listing page — every published post of that type is rendered. Revisit when a listing grows long.

## Keep this file current

Update the stack line and the weak-points list when they change, and delete anything your work made untrue. Do not restate `BLOG.md`. Record facts about the code and decisions the owner gave — not your own conclusions or suggestions.
