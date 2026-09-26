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
6. **Verify by running, not by reading.** Every BUILT line below was checked with a live call. Three code-reading theories were wrong in one session.
7. **Back up to `workN` before changing files,** and add the new folder to `tsconfig.json` `exclude`.

**Do not copy `/api/reactions` or `/api/saved-posts`** — they still import firebase-admin and Mongoose and throw on any call (step 7 fixes them). Copy `src/app/api/blogs/[id]/route.ts` instead.

## Traps already hit

- **Tiptap `generateHTML` throws `window is not defined` on the server.** Use `renderToHTMLString` from `@tiptap/static-renderer`, as `rich-content.tsx` does.
- **StarterKit already bundles Link.** Configure it through `StarterKit.configure({ link })`; adding the package separately warns about duplicates.
- **Editor and renderer must share `src/components/editor/extensions.ts`,** or authors and readers see different output.
- **Turbopack serves stale caches.** It has falsely reported "Module not found" for files on disk and served pre-fix pages. `rm -rf .next` and restart before trusting a confusing result.
- **`npm run build` fails here for a reason unrelated to the app** — see Known issue.

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

B1 and B2 are done, B3 is next — see Full plan below for what each step covers.

Working today: `/login`, `/blog`, `/blog/[slug]`, official post CRUD with the Tiptap editor, SEO and visibility controls, `rel="ugc"`/`sponsored` links, metadata and related posts.

Still placeholder pages: `/community`, `/discussions`, `/topics/[slug]`, `/account/saved`. `/members/[username]` does not exist yet. Most `/admin/*` pages outside `blog/` are static forms.

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

### B3 — community and moderation · NEXT

Why it is needed: members writing content is what makes this a community rather than a company blog, and the moderation queue is what stops it becoming a spam and backlink site.

- `community-form.tsx` — real member submission through Tiptap; delete `components/community-write-demo.tsx`
- `admin/blog/review/page.tsx` — queue with approve / reject / request changes, and the index toggle that decides whether an approved post may be indexed
- `members/[username]/page.tsx` — member profile and their approved posts (route does not exist yet)
- Real data on `/community`, `/discussions`, `/topics/[slug]`
- Rule to enforce: member submit lands as `pending` + `noIndex`, public only after a moderator approves

### B4 — comments, reactions, saved posts

Why it is needed: without these a reader has no reason to return, and the existing engagement routes are currently broken.

- `models/Comment.ts` (+ report shape) for the future MongoDB driver
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

| Before | After |
|---|---|
| No data layer; routes called Mongoose models that could not connect | `src/lib/repo/` — `types.ts`, `json-driver.ts`, `mongo-driver.ts` stub, `index.ts` driver selector |
| `firebase-admin.requireUser()` threw on every call | `src/lib/auth.ts` — cookie session, 5-level role rank, `getSessionUser` / `requireUser` / `requireRole` / `atLeast` |
| No sign-in page or account state in the header | `/login` + `login-form.tsx`; `session-menu.tsx` in a `<Suspense>` slot in the header |
| No error convention | `src/lib/api.ts` — `errorResponse()` maps AuthError to 401/403, ZodError to a readable 400 |

Verified: 22 driver tests, 7 HTTP auth tests. First account becomes admin, later ones members; invalid email rejected; session survives via cookie; `.data/users.json` written.

### B2 — official blog

| Before | After |
|---|---|
| `api/blogs` — unfiltered GET, POST needing a Firebase token that could never be issued | Filtered GET hiding what the viewer may not see; POST through the repo, 409 on duplicate slug, members forced to community/discussion |
| No edit, delete or status routes | `api/blogs/[id]` (GET/PATCH/DELETE) and `api/blogs/[id]/status` (9 actions); `api/slug-check` for live availability |
| No permission logic anywhere | `src/lib/blog-rules.ts` |
| Admin new/edit pages were static `<Field>` placeholders with dead buttons | `admin/blog/blog-form.tsx` — auto-slug, live slug check, Tiptap, tags, image, SEO, visibility, schedule; draft/publish/schedule/unpublish/delete |
| Admin list showed 3 hardcoded rows all marked "Published" | Real list, status filters, noindex marker; members see only their own |
| No editor or renderer | `editor/tiptap-editor.tsx`, `editor/rich-content.tsx`, shared `editor/extensions.ts` |
| `/blog` and `/blog/[slug]` used 3 hardcoded posts with one fabricated body | Real posts and content, real metadata, noindex for non-public, members-only sign-in prompt, related posts |
| Homepage journal used hardcoded `posts` | 3 most recent published public posts via the repo |
| `site-data.ts` exported hardcoded `posts` | Removed; `services` and `faqs` remain |

Fixed on the way: `auth.ts` imported `Role` without re-exporting it, breaking `blog-rules.ts`; `tsconfig.json` had no `exclude`, so `work*` backups were being type-checked.

Verified: 21 HTTP tests. Draft hidden, publish public, Tiptap renders server-side, members cannot publish or edit others' posts, signed-out cannot create, duplicate slug and short title rejected, members-only hidden and noindexed, admin pages load and redirect when signed out.

## When you finish a step

Update the status table, move the order-of-work marker, and add a before/after row naming the exact file and what it did previously. State what you verified and how many checks. Note any defect you fixed. Delete whatever your work made untrue.

## Known issue

`npm run build` fails at prerender: `InvariantError: Expected workStore to be initialized. This is a bug in Next.js.` on `/account/saved`.

Isolated by experiment — the same source builds cleanly on `C:\`, fails on `E:\`, and still fails with all blog work removed and `src` byte-identical to the backup. Not app code. `npm run dev` is unaffected. Resolve before the Vercel migration.
