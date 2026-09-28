# Blog & Community

> **Keep this document short.** Every line must earn its place: complete, but never padded. When you learn something that contradicts what is here, correct it and delete what is now wrong — a stale line is worse than no line. Add a fact only if the next person would waste time without it.
>
> **Record what the owner decides, not what you conclude.** When a decision, correction or requirement is given in conversation, write it here as it was given, so it survives the session. Do not add your own opinions, suggestions or findings the owner has not approved — this document is the owner's standing instructions, not a private notebook.

## Goal

A real blog and community that earns SEO traffic and brings useful members together. Never a spam or paid-backlink site.

## Architecture

```text
UI pages → /api/* routes → repo layer → driver
                                        ├── json-driver  (now)
                                        └── mongo-driver (implemented)
```

Local default data lives server-side in `.data/*.json` (gitignored). MongoDB mode stores blogs, users, comments, reactions, saved posts, reports and settings in Mongoose collections. Set `DATA_DRIVER=mongo` and `MONGODB_URI`; database name defaults to `merasoftware` and can be overridden with `MONGODB_DB`. DB-backed pages render per request, so deployment build does not need Atlas access.

Not implemented: Cloudinary uploads (image URL + alt fields are used), real login (development sign-in is used until the portal login in `login.md` replaces it), and Vercel deployment.

## Rules

1. **Import from `@/lib/repo`, never a driver file.** Direct imports defeat the one-file migration and no test will catch it.
2. **No LocalStorage as a data store.** Rejected because the blog needs server rendering for SEO, moderation needs one shared store, and every page would need rewriting at migration. Fine for a per-viewer convenience like a remembered filter.
3. **Permission logic lives in `src/lib/blog-rules.ts`.** `canRunAction`, `canEdit`, `canDelete`, `isReadable` — shared by API and UI so they cannot disagree.
4. **Import auth from `@/lib/auth`, never `@/lib/firebase-admin`.** The latter throws on every call; no credentials exist.
5. **Do not rename repo fields.** They match the Mongoose model on purpose.
6. **Verify by running, not by reading.** Every claim in Completed work was checked with a live call. Three code-reading theories were wrong in one session.
7. **Back up to `workN` before changing files,** and add the new folder to `tsconfig.json` `exclude`.
8. **Emit structured data only where the page is indexable.** `src/lib/structured-data.ts` builds it; the page decides. Describing a noindex, members-only or unpublished post to a crawler contradicts what the page shows.

Copy `src/app/api/blogs/[id]/route.ts` when writing a new route — it carries the error, auth and permission conventions the others follow.

## Traps already hit

- **Tiptap `generateHTML` throws `window is not defined` on the server.** Use `renderToHTMLString` from `@tiptap/static-renderer`, as `rich-content.tsx` does.
- **StarterKit already bundles Link.** Configure it through `StarterKit.configure({ link })`; adding the package separately warns about duplicates.
- **Editor and renderer must share `src/components/editor/extensions.ts`,** or authors and readers see different output.
- **Turbopack can serve stale caches.** Stop the dev server before clearing `.next`; in PowerShell use `Remove-Item -Recurse -Force .next`, then restart before trusting a confusing result.
- **`blogInputSchema` validates `slug` before the route slugifies it.** A form must send an already-valid slug; sending a raw title returns 400. Both forms slugify client-side.
- **Never `rm -rf .next` while a dev server is running.** It leaves that process serving from a directory that no longer exists, and every authenticated page starts redirecting to `/login` as though the session were broken. Stop the server first.
- **A `.data` write is only visible to other module instances because `read()` checks the file mtime.** Do not "optimise" that check away — see the B3 note in Completed work for what breaks.
- **A search term is echoed back into the search input's `value`,** so asserting that a page does not contain a word is not proof the post is hidden. Assert on the post's title or its card link instead. This produced two false failures in the B5 run.
- **`MetadataRoute.Sitemap` entries built through `.map()` widen `changeFrequency` to `string` and stop compiling.** Annotate the array with `satisfies` before mapping, as `sitemap.ts` does.
- **The dev server on this machine can die under memory pressure** — the next request may get `ECONNREFUSED` rather than an error in the log. Restart it and re-run before treating that as a code fault.

## Roles and flow

```text
Visitor   read public content
Member    login, profile, comments, reactions, saves, draft/submit
Moderator review posts, comments, reports
Editor    manage and publish official posts
Admin     full control

Member: Write → Draft → Submit → Approve/Reject/Request changes → Publish
```

Members never publish directly. Enforced in `blog-rules.ts`: `publish` requires `editor`, and `/api/blogs` forces a member's type to community or discussion.

Types: `official` · `community` · `discussion`
Visibility: `public` · `members` (login, noindex) · `private` (author/admin) · `unlisted` (link only, noindex, out of listings)
Status: `draft` · `pending` · `published` · `scheduled` · `rejected` · `archived`

Community posts start `noindex` by design — a moderator makes one indexable via the `index` flag on approve.

Comment status: `visible` · `hidden` (moderator, reversible) · `pending` (waiting for approval)
Comment mode per post: `default` (follow the site setting) · `open` · `moderated` · `closed`

A new comment is `visible` or `pending` depending on `effectiveMode()` in `comment-rules.ts` — the post's own mode, or the site setting when the post says `default`. An admin sets that default at `/admin/settings`; an editor sets a post's own mode in the blog form. A moderator hides and shows; only an admin deletes, and deleting takes the replies with it.

## Security

Cloudinary secrets stay server-side. Verify token and role on every protected call; never trust a client-supplied role or user id.

**Current gap:** `POST /api/auth` accepts a `role` in the body, so anyone can sign in as admin. Deliberate — it lets one browser test every role — and it dies when the portal login (`login.md` Step 1) replaces the session read in `src/lib/auth.ts`.

`GET /api/settings` is public because the article page needs to know whether comments are open; only `PATCH` requires admin. Nothing secret lives in that row.

## Status

B1 to B5 are done and MongoDB persistence is implemented. Remaining integrations are the shared portal login (`login.md`), Cloudinary uploads, and Vercel deployment.

Working today: `/login`, `/blog` (with search), `/blog/[slug]`, official post CRUD with the Tiptap editor, SEO and visibility controls, `rel="ugc"`/`sponsored` links, metadata, JSON-LD and ranked related posts. Members write at `/community/write` and submit for review; moderators decide at `/admin/blog/review`; approved posts list on `/community`, `/discussions`, `/topics/[slug]` and `/members/[username]`. Readers comment, reply, react and save; moderators work at `/admin/comments`; an admin sets the comment defaults at `/admin/settings`.

Most `/admin/*` pages outside `blog/`, `comments/` and the comment block of `settings/` are still static forms with no handlers.

A community or discussion post is read at `/blog/[slug]` — that page never filtered by type, so no separate route was needed.

`.data` is empty on a fresh checkout — an empty `/blog` means no post has been written, not a broken page.

## Owner decisions

Given in conversation on 25 Sep 2026. These override the original plan where they differ.

- **Storage:** repo layer + server-side JSON, not MongoDB first and not LocalStorage. Reason accepted: working functionality now, one-file migration later.
- **Editor:** Tiptap.
- **Auth:** development sign-in with a role picker, shaped like Firebase.
- **Build order:** step by step, not everything at once. B2 was taken as one piece because a half-built blog cannot be tested end to end.
- **Slug stays editable after publish.** Raised as a risk — changing a published slug 404s every existing link — and the owner chose to leave it as is.
- **Docs must stay short and effective,** and must carry the owner's decisions rather than the agent's own conclusions.
- **Backups:** numbered `workN` folder before each step.

Given in conversation on 26 Sep 2026, during B4:

- **The comment default must be controlled from the admin panel,** not fixed in code — asked for when the agent proposed hardcoding it.
- **An editor or admin must also be able to set comments on a post while writing or editing it,** independently of the site default.
- **An admin must be able to remove any comment.**
- **Refinements to those three were deferred:** "isse baad mein behtar kar sakte hain". The agent chose the open questions for now — per-post control is editor-and-above so a member's post follows the site default, and a moderator hides while only an admin deletes. Both are one line each in `comment-rules.ts` if the owner wants them different.

Given in conversation on 27 Sep 2026:

- **No Firebase Auth work for now.** Login comes from the client portal instead — see `login.md`, which holds that plan.

## Full plan — B1 to B5

### B1 — data and session foundation · DONE

Needed because nothing else can be built until there is somewhere to store posts and a way to know who is acting. Delivered: repo layer, cookie session with roles, `/login`, shared error handling. Detail in Completed work below.

### B2 — official blog · DONE

Needed because this is the part the business actually uses — writing and publishing articles that bring search traffic. Delivered: Tiptap editor, blog APIs with a 9-action status route, permission rules, working admin form and list, real public pages. Detail in Completed work below.

### B3 — community and moderation · DONE

Why it is needed: members writing content is what makes this a community rather than a company blog, and the moderation queue is what stops it becoming a spam and backlink site.

Delivered: member submission form, the review queue with the index decision, real community/discussion/topic listings, member profiles. Detail in Completed work below.

### B4 — comments, reactions, saved posts · DONE

Why it is needed: without these a reader has no reason to return, and the engagement routes were broken.

Delivered: comment and report APIs, threaded comments and reaction buttons on the article, the `/admin/comments` moderation queue, a real `/account/saved`, and the two broken engagement routes moved onto the repo layer. Comment defaults became owner-controlled — see Owner decisions. Detail in Completed work below.

### B5 — SEO and finishing · DONE

Why it is needed: the whole point of the blog is search traffic, and none of it counts until search engines can read and trust the pages.

Delivered: a real sitemap, JSON-LD on articles, profiles and the blog listing, search on `/blog` and `/community`, ranked related posts, and the full permission pass. Detail in Completed work below.

### Next — online integrations

Nothing in B1–B5 is outstanding. What remains is the move off local development:

- Shared login with the client portal, replacing the cookie session in `src/lib/auth.ts` and closing the `POST /api/auth` role gap under Security — plan and status in `login.md`
- Cloudinary upload, replacing the image URL + alt fields
- Vercel deploy with `DATA_DRIVER=mongo` and `MONGODB_URI`
- The `/admin/*` pages that are still static forms, if the owner wants them working

## Completed work

### MongoDB persistence — DONE

Implemented every repo operation in `mongo-driver.ts`, added the User model, normalized Mongo ids and dates for existing APIs, and made database-backed pages request-rendered. Verified `npm run build` with `DATA_DRIVER=mongo` and a read-only Atlas ping; no sample records were inserted. Live CRUD against Atlas has not been exercised yet.

### B1 — data and session foundation

Built `src/lib/repo/` (driver selector + JSON driver; Mongo driver implemented later), `src/lib/auth.ts` (cookie session, 5-level role rank), `/login`, and `src/lib/api.ts` for one error convention. Replaced an earlier `firebase-admin` flow that threw on every call. Verified: 22 driver tests, 7 HTTP auth tests.

### B2 — official blog

Built the blog APIs (`api/blogs`, `api/blogs/[id]`, its 9-action `status` route, `api/slug-check`), `src/lib/blog-rules.ts`, the Tiptap editor and renderer over a shared `extensions.ts`, the admin form and list, and real `/blog` + `/blog/[slug]`. Replaced hardcoded posts everywhere, including the homepage journal and `site-data.ts`. Verified: 21 HTTP tests.

### B3 — community and moderation

Built `components/community-form.tsx` and `/community/write` (login-gated, `?edit=<slug>` reopens the author's own draft or rejected post), the `admin/blog/review` queue with the index decision, the `/community`, `/discussions` and `/topics/[slug]` listings, and `/members/[username]`. Replaced the fake `community-write-demo.tsx` and the placeholder pages. Fixed the `json-driver` cache that made an API write invisible until a restart — the mtime check in `read()` is that fix, and the Traps note above says why it must stay. Verified: 49 HTTP checks across four roles.

### B4 — comments, reactions, saved posts

Built on the existing repos, which were left alone:

- `src/lib/comment-rules.ts` — the permission and validation home, matching `blog-rules.ts`. `effectiveMode()` is the one that matters: a post set to `default` follows the site setting, a post an editor set to open / moderated / closed keeps its own choice.
- `api/comments` + `api/comments/[id]`, `api/reports` + `api/reports/[id]`, `api/settings`.
- `/api/reactions` and `/api/saved-posts` rewritten onto the repo layer — they imported firebase-admin and Mongoose and threw on every call. Both now toggle a row and move the counter with `blogRepo.incr()`.
- `components/blog/comments.tsx` (one level of replies, moderation and report buttons in place) and `reactions.tsx`. Both get their initial state as props from the server page, so the thread is in the HTML and no button flashes wrong.
- `admin/comments/page.tsx` + `comment-actions.tsx`, and `admin/settings/comment-settings.tsx` — the only part of that settings page wired to storage.
- `/account/saved` rewritten from a placeholder into the real list.
- New `settingsRepo` through the data layer (`types.ts`, `json-driver.ts`, `index.ts`), plus `Blog.comments` and `models/Comment.ts`. This is the one repo B4 added — the engagement repos already existed.

Fixed on the way: `models/Blog.ts` was missing `reviewNote`, so the Mongoose shape had drifted from the repo type it is supposed to mirror.

Verified: 90 HTTP checks across four roles, run twice. Comment create, reply, and reply-to-a-reply refused; hide / show / approve; **the admin default flips a new comment between visible and pending**; a post's own mode beats the site default; the site switch closes comments everywhere; a member's attempt to set `comments` on their own post is ignored server-side; author and admin delete, moderator and other members cannot; deleting a parent takes its replies; reaction toggle both ways with the counter landing back where it started; two members both counted; save / unsave and list isolation; report to queue to resolve; and every page and nav entry per role.

### B5 — SEO and finishing

- `src/app/sitemap.ts` — was one hardcoded homepage URL. Now static pages, services, every published + public + not-noIndex post, the topic pages that an indexable post actually uses, and the profiles of authors with an indexable post. Everything else — members-only, private, unlisted, draft, and a community post before a moderator ticks index — stays out.
- `src/lib/structured-data.ts` — `articleLd`, `personLd`, `organisationLd`, `breadcrumbLd`, and `jsonLd()` which renders one block and escapes `<` so a title containing markup cannot close the script tag. Mounted on `/blog/[slug]`, `/members/[username]` and `/blog`.
- **Structured data is emitted only where the page is genuinely indexable** — published, public, not noIndex. Describing a noindex or members-only post to a crawler contradicts what that page is allowed to show.
- `components/blog/search-box.tsx` on `/blog` and `/community`. The term lives in the URL, so a search is a real page that can be bookmarked and shared, and the results are server-rendered. It calls the repo's own `search` filter, so the MongoDB driver can answer it with a query.
- Related posts on `/blog/[slug]` are now ranked, not filtered: same category scores 3, each shared tag 1, recency breaks ties. The old category-only filter gave a post with no category nothing at all.

Fixed on the way:

| Defect | Fix |
|---|---|
| **`/admin` had no session check.** Every other admin page redirects, so the overview was the one way for a signed-out visitor to see the admin shell | `getSessionUser()` and a redirect to `/login?next=/admin`, matching the other pages |
| The same page showed hardcoded stats — "PUBLISHED POSTS 03", "OPEN LEADS 00" — on a workspace claiming to be live | Counts read from the repo, and the moderation tiles only render for a moderator |

Verified: 116 HTTP checks, run twice, on top of B4's 90 re-run as a regression. Sitemap includes every indexable post and excludes each of members-only, private, unlisted, draft and noindex by fixture; a community post appears only after approve with `index`. JSON-LD parses, carries an absolute URL, a Person author and the Organization publisher, emits no nulls, and is absent from a members-only or noindex page. Search finds a post by title and by tag, reports an empty result, and never leaks a private post to a visitor or another member. Related posts include a tag-only match and never link to themselves. The permission pass covers four visibilities against signed-out, member, moderator and admin on the page, the listing and the API, every admin page against every role, and the write actions — submit, approve, publish, edit and delete.

## When you finish a step

Mark the step DONE in Full plan, move the NEXT marker, and update Status. Add a Completed work entry naming the exact files built, the defects you fixed, and what you verified with how many checks.

Write the newest step in full — the next person needs the detail while it is fresh. Once the step after it is done, cut it back to a short summary: what was built and what was verified. The before/after of a finished step is a record of problems that no longer exist, and the code says what the code is now. Delete whatever your work made untrue.

## Deployment note

Build succeeds with `DATA_DRIVER=mongo`. Vercel still needs `MONGODB_URI` and `DATA_DRIVER=mongo` set for Production (and Preview if used); keep MongoDB Network Access configured for the deployment source.
