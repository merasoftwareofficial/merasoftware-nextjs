# Code Audit

Code-state snapshot only. Rules, owner decisions and traps live in `BLOG.md` — read that first and do not repeat it here.

Updated 29 Sep 2026; Email section 17 Oct 2026.

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

## Email (Email Control)

How it works and what comes next: `email-control.md`. Code facts as of 17 Oct 2026:

- Only 2 of the 11 live mails are migrated to `backend/helpers/emailTemplates.js` (Project created, Project cancelled). The other legacy builders in `backend/helpers/emailService.js` interpolate values into HTML **unescaped** — e.g. `sendUpdateRequestNotification` (`instr.text`, `userId.name`) — and `emailService.js` has no escaping at all. Migrated mails escape every value.
- `sendUpdateRequestNotification` and `sendUserConfirmation` read `updatePlanId.productId.serviceName` unguarded and throw for a project upload; `submitUpdateRequest.js` swallows it, so no draft is made.
- 18 builders have no caller and `auth.otp` is always suppressed (list in `email-control.md`); they still appear as rows in the panel.
- Legacy builders set `from` with stale fallbacks (`'VA Computers'`, `'Your Company'`, `'Website Update Service'`); it is ignored — the sender comes from `FROM_NAME`/`FROM_EMAIL` in `decide()`.
- Customer-started mail that is On is sent in-process after the response (`res.once('finish')` → `sendAutomatic`). If the server stops in between, the draft stays `pending` until it expires (23 h) and shows under Pending email review for a manual send.
- The two editors repeat the chip node definitions: `src/app/admin/email-control/email-editor.tsx` (Tiptap 3) and `frontend/src/components/EmailEditor.js` (Tiptap 2). Node names and attributes are a contract with `backend/helpers/emailDoc.js`; change all three together.
- `src/app/api/email-control/[[...path]]/route.ts` forwards only allow-listed paths; a new backend route answers 404 through the panel until it is added there.
- The website's email browser tests load the panel's CSS module but not `globals.css`, so they do not check the shared `tiptap-*` toolbar styling.

## Keep this file current

Update the stack line and the weak-points list when they change, and delete anything your work made untrue. Record facts about the code, not suggestions.
