# Blog, Community & Panel

> **Keep this document short.** Every line must earn its place. When something here becomes untrue, correct it and delete the stale line. Owner's rule: **remove finished work** — keep only how the system works, the owner's decisions and what is still pending.
>
> **Record what the owner decides, not what you conclude.** Owner instructions given in conversation go here as given. Your own suggestions go under "Proposed" until the owner approves them.

Read with: `INSTRUCTIONS.md` (project rules), `login.md` (one login with the client portal — SSOT for login and hosting), `CODE_AUDIT.md` (code weak points).

## Goal

A real blog and community that earns SEO traffic and brings useful members together — never a spam or paid-backlink site. The management panel (`/admin`) runs the website for staff.

## How the owner wants you to work

- **Understand → short review → owner's "yes" → code → owner review → docs.** Before any coding, say in short Hinglish what you understood and what you will change, and wait. "analyze / batao / explain" means read-only; "haan / yes / proceed / start working" means code. Update docs only after the owner is happy, and never reword an owner decision.
- **Evidence first.** Verify by running, not by reading. Several code-reading theories were wrong; running found the real causes (see Traps).
- **Backup** every file you change into the next numbered `workN/` folder (same relative path) and add that folder to `tsconfig.json` `exclude`. Last used: `work26`.
- **One step at a time;** each step is reviewed by the owner before the next.
- **Only what was asked.** Speed work is deferred by the owner ("abhi sirf working aur functionality") unless a feature needs it.
- **Never touch the owner's running servers** (website `:3000`, portal frontend `:3001`, portal backend `:8080`).

### How to test without touching real data

- The local `.env.local` points at the **production website database** (`merasoftware`, `DATA_DRIVER=mongo`). Never test against it.
- Test in a throwaway copy: copy `src public package.json next.config.ts tsconfig.json postcss.config.mjs next-env.d.ts .env.local` to `E:\Allprojects\merasoftware-verify-tmp`, junction its `node_modules` to the real one (must be on E: — a C: copy fails to resolve Next's client files), and run `next dev --webpack -p 3010` with env overrides `MONGODB_DB=merasoftware-fix-test`, `PORTAL_API_URL=http://localhost:8090`, `PORTAL_URL=http://localhost:3001`, `TOKEN_SECRET_KEY` (same value as the backend's), `VIEW_HASH_SECRET=<any test string>`. For a JSON-driver run set `DATA_DRIVER=json` (data goes to the copy's `.data/`).
- Run the portal backend a second time on port 8090 with `MONGODB_URI` retargeted from `merasoftware-dev` to `merasoftware-fix-test` and `ENABLE_CRONS=false`, passed as env — never edit its `.env`.
- The website and portal databases are on **different Atlas clusters**, so both can be called `merasoftware-fix-test` without sharing a `users` collection.
- Sign test accounts up through the backend (`/api/signup`, lowercase emails — see Traps), sign in to get the `token` cookie, and send it to the site. Make a portal admin by setting `roles: ["admin"]` on the fix-test backend DB.
- Headless Chrome counts as a bot for views; override the user agent. In Git Bash set `MSYS_NO_PATHCONV=1`, or arguments like `/admin` turn into Windows paths.
- Stop your test servers and delete the temp folder (remove the junction first, never its target) when done.

## Architecture

```text
UI pages → /api/* routes → repo layer (src/lib/repo) → json-driver (.data/*.json) | mongo-driver (Atlas)
```

Production runs `DATA_DRIVER=mongo` (database `merasoftware`). Login comes from the client portal (`login.md`). Cloudinary uploads are not built; images are URL + alt fields.

## Rules

1. **Import from `@/lib/repo`, never a driver file.** Both drivers implement `src/lib/repo/types.ts`; a new repo method goes in types + both drivers.
2. **No LocalStorage as a data store** (SSR/SEO, one shared moderation store). Fine for per-viewer conveniences like the theme choice.
3. **Rules live in one file per area** and are shared by API and UI: `blog-rules.ts` (posts), `comment-rules.ts` (comments), `view-rules.ts` (views).
4. **Auth only through `@/lib/auth`.** Never `@/lib/firebase-admin` (throws on every call).
5. **Do not rename repo fields;** they mirror the Mongoose models. New fields need the model, the type and both drivers.
6. **Every `/admin/*` page calls `requireStaffPage(path, minimum)` itself.** Not the layout: a Next 16 layout does not re-run on client navigation (`node_modules/next/dist/docs/01-app/02-guides/authentication.md`, "Layouts and auth checks").
7. **Emit structured data only where the page is indexable.**
8. **Copy `src/app/api/blogs/[id]/route.ts`** when writing a new route — it carries the error, auth and permission conventions.
9. **Security:** check session and role on every protected call; never trust a role or user id sent by the client; secrets stay server-side and are never pasted into chat. `GET /api/settings` is public on purpose (nothing secret in it); only `PATCH` needs admin.

## Earlier owner decisions (25–27 Sep 2026)

- Editor: Tiptap. Build step by step.
- **A slug stays editable after publish.** The risk (changing it breaks every old link) was raised; the owner chose to keep it.
- Comment defaults are controlled from the admin panel, not code; an editor/admin can set comments per post; an admin can remove any comment. Refinements were deferred ("isse baad mein behtar kar sakte hain").
- No Firebase Auth for now — login comes from the client portal (`login.md`).
- Docs stay short and carry the owner's decisions, not the agent's conclusions.

## Roles and access (owner decisions, 28–29 Sep 2026)

| Role | What they get |
|---|---|
| Visitor | Reads public posts. No login. Any action (comment, save, write) sends them to `/login` and back. |
| Member | A signed-in reader who can also write. Reads members-only posts, comments, reacts, saves, reports, writes community/discussion posts that **always need approval**. **No management panel** — their area is the account menu: My profile, My posts (`/account/posts`), Saved posts, Write a post. |
| Moderator | Panel: overview, blog posts, review queue, comments. Approves/rejects member posts. Cannot write official posts. |
| Editor ("publisher") | Everything content: writes and publishes official posts directly, review queue, comments, site-content pages. Not Settings or Users. |
| Admin | Everything, including Settings and Users. |

- **Signup makes a member instantly, no approval** — owner agreed ("aise hi sahi, signup par member ban jaye"). Control is post review, not signup review.
- **Publisher = editor, granted manually** by an admin at `/admin/users` (role dropdown). Owner: "manual hi sahi" — no automatic promotion rules for now. The user must have signed in to the website once to appear in the list.
- **Two separate roles per person:** portal role (customer/admin/…) lives in the portal; blog role lives on the website. A portal admin is always website admin (derived, never stored). Portal access is never granted by website signup. A blog helper must never be made a portal admin — portal admins see payments and client passwords.
- **Header menu:** label shows Admin / Customer / blog role. Dropdown has a PORTAL section (portal admin → "Portal admin panel" `PORTAL_URL/admin-panel/dashboard`; customer → "My Portal" `PORTAL_URL/dashboard`) and a WEBSITE section. Built from `getSession()` in `src/lib/auth.ts`, which returns portal roles alongside the user (never stored).

## Content flow

```text
Member: Write → Draft → Submit → Pending → (moderator) Approve → Published | Reject / Request changes → back to the author with a note
Editor/Admin: write official → Publish directly
```

Types `official · community · discussion`. Visibility `public · members (login, noindex) · private · unlisted (link only)`. Status `draft · pending · published · scheduled · rejected · archived`. A community post starts `noindex`; the moderator decides indexing on approve. Comment mode per post `default · open · moderated · closed`; site defaults at `/admin/settings`; moderators hide, only admins delete.

## Views and stats (owner decisions, 29 Sep 2026)

Owner: every post's readership must be known; at least the admin sees views per post in the panel, and the admin can choose to show views under posts.

- **One view per visitor per post per 24 hours** (owner chose this). Visitor = HMAC of IP + user agent + post with `VIEW_HASH_SECRET`, stored 24 h only (`viewseens`, TTL index). No raw IP is stored.
- Not counted: the author, staff (moderator and up), bots/headless/empty user agents, unpublished or unreadable posts, prefetches (the count is sent by `ViewBeacon` after the page opens).
- Daily totals kept in `viewdays` for future graphs. A view never changes the post's `updatedAt`.
- Panel blog list: Views · 7 days · Helpful · Insightful · Saves, plus "Most viewed" order.
- Public count: site switch at `/admin/settings` (default **off**) + per-post Default/Show/Hide (editor and up).
- `/blog` shows "Popular this week" (top 3, no counts). Related reading breaks score ties by views.
- Without `VIEW_HASH_SECRET` nothing is counted and the server logs one warning; the site still works.

## Management panel theme (owner decision, 29 Sep 2026)

The panel follows the website's light/dark Theme switch (one saved choice for both; button in the panel nav). Panel colours are `--pn-*` tokens in `globals.css`: their `:root` defaults are the old dark values so panel classes reused on website pages (`admin-empty`, `status`, `form-error`…) look unchanged; inside `.admin-shell` they switch with the theme.

## Pending

- **Owner review** of the changes in `work21`–`work24` (roll back from those folders if the owner rejects one).
- **Owner action:** add `VIEW_HASH_SECRET` (any long random string) on Vercel; until then no views are counted.

## Next work (planned with the owner)

1. **Signin email case bug** (portal backend, one line) — see `login.md` "Found, not fixed". Awaiting the owner's go.
2. **`/admin/users` improvements:** confirm before a role change, portal-role column, a record of who changed which role and when, search/filter.
3. **Account safety (needs portal backend work):** password reset (the portal's "Forgot password?" is a dead `href="#"`), email verification (the backend's unused OTP routes need review first), rate limit / captcha on signup and login.
4. **Language versions** — agreed design: each language version is its own post (own slug, SEO, views, status) linked by `language` + `translationGroup`; "Add translation" in the blog form copies the original; "Read in: English | हिन्दी" switch; `hreflang` tags; group total in the panel. **Blocked on owner decisions:** which languages, URL shape (`/hi/blog/slug` or other), blog content only or the whole site.

## Open owner decisions

1. Remove Leads from editors? (Leads are customer contact data, not content.)
2. May a moderator approve their own post? (Code allows it today.)
3. Reactions and saves change a post's `updatedAt` through `blogRepo.incr()` — fix?
4. Point local `.env.local` at a separate dev database instead of production?

## Later, when the site grows

Speed (live responses carry `x-vercel-id: bom1::iad1`, so pages are built in the US, while both Atlas clusters answer the owner's PC in about 32 ms, i.e. they are in India — moving Vercel functions to `bom1` is the likely main fix, not yet measured; also parallel queries on `/admin` and one session lookup per request) · rules and an "apply" flow for becoming publisher/moderator · "trusted writer" · recommendations from reading history · AI content matching.

## Traps already hit

- **Local `.env.local` is production data** (see testing).
- **MongoDB rejects one path in both `$set` and `$setOnInsert`** ("would create a conflict"); `settings.update` leaves patched keys out of the insert defaults. Test on the Mongo driver, not only JSON — JSON hides this.
- **`blogRepo.incr()` sets `updatedAt`.** Views use `viewRepo.record()` (Mongo `timestamps: false`) so reading a post never marks it updated.
- **Signin is case-sensitive on email** (`login.md`) — use lowercase emails in tests.
- **A user id scraped from page HTML/RSC data is unreliable** — twice it returned one id for every row. Read ids from the store.
- **Turbopack can serve stale caches.** Stop the dev server, then `Remove-Item -Recurse -Force .next`, then restart. Never delete `.next` while a server runs.
- **First open of a page in `next dev` compiles it** (2–21 s, `/admin` slowest). Not a production problem.
- **Tiptap:** use `renderToHTMLString` from `@tiptap/static-renderer` on the server; StarterKit already bundles Link; editor and renderer share `src/components/editor/extensions.ts`.
- **`blogInputSchema` validates `slug` before the route slugifies it** — forms must send a valid slug.
- **A `.data` write is seen by other module instances only because `read()` checks the file mtime** — keep that check.
- **A search term is echoed into the search input** — assert on titles or links, not on absence of a word.
- **`MetadataRoute.Sitemap` via `.map()` needs `satisfies`** or `changeFrequency` widens to `string`.
- **`src/app/admin/blog/blog-form.tsx` has 2 old ESLint errors** (setState in effect) — not from recent work.
