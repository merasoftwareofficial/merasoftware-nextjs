# Code Audit

Code-state snapshot only. Rules, owner decisions and traps live in `BLOG.md` — read that first and do not repeat it here.

Updated 29 Sep 2026.

## Stack

Next.js 16.3.6 (Turbopack) · TypeScript · Tailwind · Tiptap 3.31 · Zod · Mongoose · jose (verifies the portal's login token). Production uses `DATA_DRIVER=mongo`; Firebase Admin and Cloudinary are installed but unused. Local: `http://localhost:3000`.

`npm run build` needs `PORTAL_API_URL` and `PORTAL_URL` set — `/login` fails to prerender without them. Database-backed pages render on request, so build does not need Atlas access. `VIEW_HASH_SECRET` is read at runtime only.

ESLint (29 Sep 2026): 2 errors in `admin/blog/blog-form.tsx` (setState inside an effect) and unused-variable warnings for deliberately ignored `_names` in the drivers and routes.

## Known weak points in the code

- `src/lib/firebase-admin.ts` and Cloudinary are not connected to working product flows.
- Static placeholder pages with no handlers: `/admin/categories`, `faqs`, `homepage`, `leads`, `media`, `portfolio`, `services`, `services/new`, `testimonials`. Working: the overview, `blog/*`, `comments`, `users`, and on `settings` only the Comments and Blog views blocks (the business-details form below them does not save).
- `/admin/users` shows the stored blog role; a client-portal admin is admin by derivation (`src/lib/auth.ts`) whatever that column says.
- `blogRepo.incr()` (reactions and saves) also sets the post's `updatedAt`, so a reaction makes a post look edited. Views avoid it (`viewRepo.record()`).
- Topic pages and `sitemap.ts` scan published posts' categories and tags in memory. Correct at current scale.
- `blogRepo.list()` has no pagination anywhere — every published post of a type is rendered, and blog search filters that full list.
- `sitemap.ts` and `structured-data.ts` hardcode `https://merasoftware.com`; move to an environment variable before a staging deploy.
- `GET /api/saved-posts` and `/account/saved` read saved posts one id at a time.
- Reaction and saved records have MongoDB uniqueness indexes; simultaneous toggles can still race between the route's read and write.
- The header and the page each resolve the session; the portal status cache is per server instance, so on a cold cache one request can ask the portal twice.

## Keep this file current

Update the stack line and the weak-points list when they change, and delete anything your work made untrue. Record facts about the code, not suggestions.
