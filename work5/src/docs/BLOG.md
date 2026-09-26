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
                                        └── mongo-driver (later, stub)
```

Data lives server-side in `.data/*.json` (gitignored). Field names mirror `src/models/Blog.ts`, so migration is: implement `mongo-driver.ts`, set `DATA_DRIVER=mongo`. Nothing else changes.

Deferred until credentials exist: Cloudinary (image URL + alt field in use), Firebase (development sign-in in use), Vercel.

## Rules

1. **Import from `@/lib/repo`, never a driver file.** Direct imports defeat the one-file migration and no test will catch it.
2. **No LocalStorage as a data store.** Rejected because the blog needs server rendering for SEO, moderation needs one shared store, and every page would need rewriting at migration. Fine for a per-viewer convenience like a remembered filter.
3. **Permission logic lives in `src/lib/blog-rules.ts`.** `canRunAction`, `canEdit`, `canDelete`, `isReadable` — shared by API and UI so they cannot disagree.
4. **Import auth from `@/lib/auth`, never `@/lib/firebase-admin`.** The latter throws on every call; no credentials exist.
5. **Do not rename repo fields.** They match the Mongoose model on purpose.
6. **Verify by running, not by reading.** Every claim in Completed work was checked with a live call. Three code-reading theories were wrong in one session.
7. **Back up to `workN` before changing files,** and add the new folder to `tsconfig.json` `exclude`.

**Do not copy `/api/reactions` or `/api/saved-posts`** — they still import firebase-admin and Mongoose and throw on any call (B4 fixes them). Copy `src/app/api/blogs/[id]/route.ts` instead.

## Traps already hit

- **Tiptap `generateHTML` throws `window is not defined` on the server.** Use `renderToHTMLString` from `@tiptap/static-renderer`, as `rich-content.tsx` does.
- **StarterKit already bundles Link.** Configure it through `StarterKit.configure({ link })`; adding the package separately warns about duplicates.
- **Editor and renderer must share `src/components/editor/extensions.ts`,** or authors and readers see different output.
- **Turbopack serves stale caches.** It has falsely reported "Module not found" for files on disk and served pre-fix pages. `rm -rf .next` and restart before trusting a confusing result.
- **`npm run build` fails here for a reason unrelated to the app** — see Known issue.
- **`blogInputSchema` validates `slug` before the route slugifies it.** A form must send an already-valid slug; sending a raw title returns 400. Both forms slugify client-side.
- **Never `rm -rf .next` while a dev server is running.** It leaves that process serving from a directory that no longer exists, and every authenticated page starts redirecting to `/login` as though the session were broken. Stop the server first.
- **A `.data` write is only visible to other module instances because `read()` checks the file mtime.** Do not "optimise" that check away — see the B3 note in Completed work for what breaks.

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

## Security

Cloudinary secrets stay server-side. Verify token and role on every protected call; never trust a client-supplied role or user id.

**Current gap:** `POST /api/auth` accepts a `role` in the body, so anyone can sign in as admin. Deliberate — it lets one browser test every role — and it dies when Firebase replaces the session read in `src/lib/auth.ts`.

## Status

B1, B2 and B3 are done, B4 is next — see Full plan below for what each step covers.

Working today: `/login`, `/blog`, `/blog/[slug]`, official post CRUD with the Tiptap editor, SEO and visibility controls, `rel="ugc"`/`sponsored` links, metadata and related posts. Members write at `/community/write` and submit for review; moderators decide at `/admin/blog/review`; approved posts list on `/community`, `/discussions`, `/topics/[slug]` and `/members/[username]`.

Still placeholder: `/account/saved` (B4). Most `/admin/*` pages outside `blog/` are static forms.

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

## Full plan — B1 to B5

### B1 — data and session foundation · DONE

Needed because nothing else can be built until there is somewhere to store posts and a way to know who is acting. Delivered: repo layer, cookie session with roles, `/login`, shared error handling. Detail in Completed work below.

### B2 — official blog · DONE

Needed because this is the part the business actually uses — writing and publishing articles that bring search traffic. Delivered: Tiptap editor, blog APIs with a 9-action status route, permission rules, working admin form and list, real public pages. Detail in Completed work below.

### B3 — community and moderation · DONE

Why it is needed: members writing content is what makes this a community rather than a company blog, and the moderation queue is what stops it becoming a spam and backlink site.

Delivered: member submission form, the review queue with the index decision, real community/discussion/topic listings, member profiles. Detail in Completed work below.

### B4 — comments, reactions, saved posts · NEXT

Why it is needed: without these a reader has no reason to return, and the existing engagement routes are currently broken.

**The data layer is already built — do not write it again.** `commentRepo`, `reactionRepo`, `savedRepo` and `reportRepo` are exported from `@/lib/repo` and fully implemented in `json-driver.ts`, with their types in `types.ts`: comment threading via `parentId`, `CommentStatus` of visible/hidden/pending, `ReactionKind` of helpful/insightful, and `helpfulCount`/`insightfulCount`/`saveCount` on `Blog` moved by `blogRepo.incr()`. B4 is routes and UI on top of that. The `models/` file below is the Mongoose shape for the future driver, not a repo interface.

- `models/Comment.ts` (+ report shape) for the future MongoDB driver — `models/Engagement.ts` already holds the Reaction and SavedPost schemas, so only comments and reports are missing
- `api/comments`, `api/comments/[id]` (approve / hide / delete), `api/reports`
- Move `/api/reactions` and `/api/saved-posts` onto the repo layer — they still import firebase-admin and throw today
- `components/blog/comments.tsx` — threads and replies, sign-in required
- `components/blog/reactions.tsx` — Helpful, Insightful, Saved
- `admin/comments/page.tsx` — moderation and reports
- Real saved list on `/account/saved`

### B5 — SEO and finishing

Why it is needed: the whole point of the blog is search traffic, and none of it counts until search engines can read and trust the pages.

- `sitemap.ts` — only published + public + indexable posts
- Article, Breadcrumb and Author JSON-LD on article pages
- Blog search, and related posts beyond the current category match
- Full permission pass across every role and visibility before the Vercel migration

### Deferred until credentials exist

Cloudinary upload (image URL + alt field in use), real Firebase auth, MongoDB driver.

## Completed work

### B1 — data and session foundation

Built `src/lib/repo/` (driver selector + JSON driver + Mongo stub), `src/lib/auth.ts` (cookie session, 5-level role rank), `/login`, and `src/lib/api.ts` for one error convention. Replaced Mongoose models and a `firebase-admin` that threw on every call. Verified: 22 driver tests, 7 HTTP auth tests.

### B2 — official blog

Built the blog APIs (`api/blogs`, `api/blogs/[id]`, its 9-action `status` route, `api/slug-check`), `src/lib/blog-rules.ts`, the Tiptap editor and renderer over a shared `extensions.ts`, the admin form and list, and real `/blog` + `/blog/[slug]`. Replaced hardcoded posts everywhere, including the homepage journal and `site-data.ts`. Verified: 21 HTTP tests.

### B3 — community and moderation

Built, replacing the fake `community-write-demo.tsx` and the placeholder pages:

- `components/community-form.tsx` — Tiptap, topic, tags, summary; save-draft and submit-for-review only. `/community/write` gates on login, takes `?type=discussion`, and `?edit=<slug>` reopens the author's own draft or rejected post with the moderator note.
- `admin/blog/review/page.tsx` + `review-actions.tsx` — the full post in place, approve / reject / request-changes with a note required on the last two, and the index checkbox deciding whether an approved community post may be indexed. Reached from a `/admin/blog` button carrying the pending count.
- `/community` (card grid), `/discussions` (list), `/topics/[slug]` (matches category **or** tag) — each filtered to its own type, excluding unlisted.
- `/members/[username]` — name, bio, role, post count and their live posts; banned or unknown 404s. Article bylines now link here, resolved from `authorId`.

Fixed on the way:

| Defect | Fix |
|---|---|
| **Made B3 impossible.** `json-driver`'s `read()` cached each collection forever, so an API write stayed invisible to every page until a restart — Next.js loads that module once per route handler and once per server component | Revalidated by file mtime. Pre-existing B2 behaviour, isolated because untouched `/admin/blog` failed identically |
| `admin-layout.tsx` showed all 12 nav links to every role, offering members pages that only answer "Not allowed" | Each entry carries its minimum role, passed down from `admin/layout.tsx` |
| `/blog/[slug]` related posts were pinned to `type: "official"`; the eyebrow always read INSIGHTS | Both follow the post's own type |
| `initialState()` returned `staffOfficial ? "draft" : "draft"` — identical branches, computed value unused | Returns the draft state plainly |

Verified: 49 HTTP checks across four roles (30 page, 19 API). Submit lands `pending` + `noIndex` and 404s publicly until approved; a member asking for `official` is forced to community; member `publish`/`approve` 403, signed-out create 401; request-changes writes the note the author sees, resubmit clears it; a published post locks to its author, another member's edit refused; approve with `index` is indexable, without it stays noindex; rejected posts never list; the two listings never leak each other; topics match category and tag; members-only shows a sign-in prompt and stays off visitor listings; queue and count badge follow each decision; nav differs per role. Cache fix proven by warming a page's cache, then creating a post via the API and seeing it without a restart.

## When you finish a step

Mark the step DONE in Full plan, move the NEXT marker, and update Status. Add a Completed work entry naming the exact files built, the defects you fixed, and what you verified with how many checks.

Write the newest step in full — the next person needs the detail while it is fresh. Once the step after it is done, cut it back to a short summary: what was built and what was verified. The before/after of a finished step is a record of problems that no longer exist, and the code says what the code is now. Delete whatever your work made untrue.

## Known issue

`npm run build` fails at prerender: `InvariantError: Expected workStore to be initialized. This is a bug in Next.js.` on `/account/saved`.

Isolated by experiment — the same source builds cleanly on `C:\`, fails on `E:\`, and still fails with all blog work removed and `src` byte-identical to the backup. Not app code. `npm run dev` is unaffected. Resolve before the Vercel migration.

B4 rewrites that page. If the build still fails there afterwards, it is this drive issue, not the new code — check by moving the project to `C:\`, not by rewriting the page.
