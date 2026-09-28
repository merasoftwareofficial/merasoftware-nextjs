# Login — one account for website + portal

> Keep this short. Owner decisions, verified facts and pending work only — delete an item once it is done. **Proposed** = not approved yet.

**Why this exists:** the owner runs two separate products the same client can touch — the public website/blog (A) and the paid client portal (B). Today each has its own login, so a blog reader who becomes a paying client needs a second account, and the two teams (marketing content vs. client work) can't recognise the same person. This doc exists to merge them into one identity without merging the codebases.

**Target:** one login. Sign in on the Next.js site (A); after sign-in the user returns to whatever they signed in for — the page and action they started from (e.g. writing a review), or the portal if they came from a portal link. One account, no second signup.

**Owner's requirement (27 Sep 2026, in the owner's words, translated):** Sign-in happens on the Next.js website. A portal user, after signing in there, can reach their own portal — and the website also shows them as signed in, because that is where they signed in. A user who signed in for the blog gets the blog panel and the website's features according to their role, from the website itself. Both must work through the Next.js website.

## Owner decisions

- A = this Next.js site (website + blog/community). B = `E:\merasoftware-new` (React + Express client portal/CRM). Repos stay separate.
- Login happens on A. B stays the source of truth for the account (`_id`, email, password) and the portal role.
- Roles (27 Sep 2026): one account, a separate role on each side. The portal role lives in B. The blog role (`member`/`moderator`/`editor`/`admin`) lives on A and is changed from A's admin panel, because B has no blog roles. Exception: a B `admin` is always `admin` on A. A new user starts as `member` on A.
- A does not copy B's users (27 Sep 2026). A keeps its own user record (profile, blog role, all posts/comments/reactions) and creates it on the user's first signed-in visit, linked by B's `_id`; an existing A user with the same email is linked instead of duplicated.
- One account across both — a blog reader who buys a service does not get a second account.
- A's own local email/password system is cancelled — replaced by reading B's login.
- No Firebase Auth work for now (27 Sep 2026). B's login is what replaces A's development sign-in.
- After sign-in, return the user to what they signed in for (27 Sep 2026). Header sign-in stays on the page; a portal link goes to the portal; an action such as writing a review resumes that action. The role decides what the user can open (portal, blog panel, features), not where sign-in lands.
- "Create account" on the website is for the blog only, for now (27 Sep 2026). Portal users are not created from the website — the business creates them (admin panel, lead convert).
- For now only the system and structure are being built — no changes to the website's content or UI (27 Sep 2026). A "My Portal" link waits for that UI work.
- B stores a plaintext copy of passwords (`STORE_PLAIN_PASSWORD: true`, `config/accessControlConfig.js`) — owner-accepted risk, not to be changed unless the owner says so.

## The two systems

| | A — website | B — portal |
|---|---|---|
| Live | `merasoftware-nextjs.vercel.app` | Prod: `www.merasoftware.com` → `api.merasoftware.com`. Clone: `clone-merasoftware-*.onrender.com` |
| Database | Atlas `merasoftware` | Atlas `merasoftware-db` (prod). Local uses `merasoftware-dev`; the clone's database (Render env) is not verified |
| Login | Dev sign-in, no password — open on the live site: first visitor becomes admin, caller picks their own role (`api/auth/route.ts`, `lib/auth.ts`). Closed by Step 1 | Email + bcrypt password, JWT cookie `token` |

Production repo/account owner: **unknown** — local B pushes only to the clone.

**Why B's security comes first:** once A trusts B's session, any access hole in B is also a hole in A. Weigh any new B issue by that.

**B facts Step 1 depends on:**
- JWT payload `{ _id, email, role }`, signed with `TOKEN_SECRET_KEY`, 365-day expiry. `role` is one of `admin`/`manager`/`developer`/`partner`/`customer`.
- A user can hold several roles (`userModel.roles` array). Signin puts one in the token by priority admin > manager > developer > partner > customer; `/api/role-switch` reissues the token with any other role the user holds.
- `/api/signup` always creates `customer` and never adds a role to an existing account — a role cannot be self-granted.
- The portal (`E:\merasoftware-new\frontend`) is one app that opens screens by the token's role (`routes/RoleBasedRouter.js`): only `admin` (lands on `/admin-panel/dashboard`) and `customer` (lands on `/dashboard`) have screens. `manager`, `developer` and `partner` get no portal screens today.
- Every `/admin/*` route on B checks the role itself (`req.userRole` or a DB-verified helper) — pattern-match scan of all routes, not a line-by-line read.
- Every path that sets the `token` cookie (`userSignIn.js`, `verifyOtpController.js`, `userRoleSwitch.js`, `guestLogin.js`) uses `httpOnly, secure, sameSite:'None', path:'/'` plus `domain` from `COOKIE_DOMAIN` when set; logout (`GET /api/userLogout`) clears the same shape.
- B's `authToken.js` rejects a token whose user is deleted or `isActive:false`. A verifying the JWT alone would not see a ban. **Proposed:** A checks the same, or asks B.
- Guest demo accounts (`POST /api/guest-login`) get a normal `customer` token; the user is flagged `isGuest` and deleted automatically when it expires (`helpers/purgeExpiredGuests.js`). Step 1's "create the A-side user on first visit" will also fire for guests, leaving A users whose B account later disappears — decide how A treats `isGuest` before building it.

**A facts Step 1 depends on:**
- A's roles: `visitor` (signed out) < `member` < `moderator` < `editor` < `admin` (`RANK` in `src/lib/auth.ts`). Publishing needs `editor`+.
- A's current session is cookie `ms_session` holding a plain user id — no signature, so anyone can forge it. It does not clash with B's `token`. Step 1 replaces it.
- A's `.env.local` has no `TOKEN_SECRET_KEY` yet; Step 1 must add B's value (never commit it).
- Cookies are per domain, not per port: locally A (`localhost:3000`) and B (`localhost:8080`) share B's `token`, so Step 1 can be built and tested locally. On the live sites B's cookie (`api.merasoftware.com`) never reaches A (`merasoftware-nextjs.vercel.app`) — live shared login works only after Step 4 puts both under `.merasoftware.com`.

## Working rules

- Each change: `workN` backup first → verify by running on the throwaway database `merasoftware-fix-test` (never the real dev DB first) → owner review before the next.
- B's local `backend/.env` must stay on `merasoftware-dev` with `ENABLE_CRONS=false`. Crons run only when `ENABLE_CRONS === 'true'`, which must be set on production only.

## Pending work

### Ship B's security fixes — production is still exposed until this is done

All of B's security fixes so far exist only on the local machine: 26 files uncommitted in `E:\merasoftware-new\backend` as of 27 Sep 2026 (signup role, cron gating, permission `await` in 19 controllers, `createOrder.js` server pricing, `authToken.js` ban check + no token logging, OTP/role-switch cookie shape, `toggleUpdatePlan.js`). Next: commit → push to the clone (`origin` = `vastacademy/clone-merasoftware-backend`, push access not yet verified) → verify on the clone → production deploy (needs the production account — see Open question 1). **Before the production deploy, set `ENABLE_CRONS=true` in production's env** — the new code turns every cron off without it (renewals, file cleanup, keep-alive would silently stop).

Rollback copies of the original files, in `E:\merasoftware-new`: `work7` (signup), `work8` (`.env`, `index.js`), `work9` (19 permission controllers), `work10` (`createOrder.js`), `work11` (`authToken.js`, `verifyOtpController.js`, `userRoleSwitch.js`), `work12` (`toggleUpdatePlan.js`). Delete them only after the fixes are committed.

### Integration roadmap — the main plan

Built and tested locally first (A on `localhost:3000`, B backend on `8080`, B frontend moved to `3001`); goes live only in Step 4. Each step: backup → build → verify by running → owner review.

**Step 0 — B blockers (B admin becomes A admin, so these are A's problem too)**
- `/api/addRole` (`controller/user/addRoleToUser.js`) has no admin check. Proven on the test DB: a passwordless guest (`/api/guest-login`) called it on itself and became `admin`. Fix: admin-only, like the other admin routes.
- Regression from the signup fix: the portal's Add Admin / Add Developer / Add Partner modals (`frontend/src/components/Add{Admin,Developer,Partner}Modal.js`) still send `role` to `/api/signup`, which now ignores it — they create customers. Fix: signup (it returns the new user's `_id`), then the (now admin-only) `addRole`; the modals' `fetch` calls have no `credentials: 'include'` and need it.
- `/api/signup` returns the whole saved user, including the password hash and `plainPassword`. Strip them before Step 2 exposes signup on the website.
- Local dev setup: B frontend `PORT=3001` (A needs 3000) and add `http://localhost:3001` to `backend/config/allowedOrigins.js`.

**Step 1 — A reads B's login** (closes A's open login)
- Add `jose`; A's `.env.local` gets `TOKEN_SECRET_KEY` (B's value) and B's API/portal URLs.
- `User` gets `portalUserId` (`src/lib/repo/types.ts`, both drivers, Mongoose model) and `userRepo.findByPortalUserId`.
- `getSessionUser()` in `src/lib/auth.ts` — the one function every page and route already uses — verifies B's `token` cookie instead of `ms_session`, then: find by `portalUserId` → else link the A user with the same email → else create a `member`. A's own `banned` still applies.
- B status comes from the existing `GET /api/user-details` (called server-side with the user's cookie): it returns the `roles` array and `isGuest`, and answers 401 for a banned, deleted or invalid token — no new B endpoint needed. The token alone is not enough: it has no `isGuest`, and its `role` is only the active one (`/api/role-switch` can make an admin's token say `customer`).
- B admin → A admin is decided from that `roles` array, not the token's `role`.
- Email linking must not carry an elevated A role: B signup has no email verification, so anyone could register an existing A user's email. A linked user keeps their content, and their role becomes `member` unless B says admin. A's Mongo (`merasoftware`) had 1 user (`member`) and no posts on 27 Sep 2026, so little is at stake today.
- Remove the development `POST /api/auth` (role picker, first-visitor-admin). Until Step 3, blog staff roles for local testing are set directly on the test data.
- **Approved (27 Sep 2026):** guests (`isGuest`) are treated as signed out on A — no A user is created for a 24-hour demo account.
- **Approved (27 Sep 2026):** cache the B status briefly, so a page view does not call B every time; a ban then reaches A within that window.

**Step 2 — Sign-in, sign-up and sign-out on the website**
- `/login`: email + password → B `/api/signin` from the browser (`credentials: 'include'`) → go to `next`. `next` accepts only a path on A or a portal URL (B also serves `admin.`/`partner.` subdomains — `frontend/src/utils/getSubdomain.js`) — never an arbitrary site. Today's `login-form.tsx` pushes `next` unchecked.
- If signin returns `mustResetPassword` (accounts auto-created from a lead with a shared password), go to the portal's `/set-new-password` instead of `next`, as the portal's own `helpers/postLogin.js` does.
- **Approved (27 Sep 2026):** "Create account" on the same page → B `/api/signup` → sign in. B has no public signup page today, so this is the only way a blog reader gets an account.
- Sign out → B `/api/userLogout`. The portal keeps its user in localStorage and keeps showing it when `user-details` fails (`frontend/src/AppContent.js:110`), so after a website sign-out the portal still looks signed in. Fix on B: drop the cached user on a 401.
- Header menu adds "My Portal". Website sections that point to the portal use `/login?next=<portal URL>`.
- B's own login page redirects to A's `/login?next=<portal>`.

**Step 3 — Users on A's admin panel**
- `/admin/users`: list, change blog role, ban/unban (A-side). Default admin `admin@merasoftware.com` created in B (gets A `admin` through the exception).

**Step 4 — Live** (needs the accounts in Open question 1)
- Ship B's fixes first (section above).
- Domains: `merasoftware.com` → A, `portal.merasoftware.com` → B frontend, `api.merasoftware.com` → B backend; `COOKIE_DOMAIN=.merasoftware.com` on B; A's Vercel env gets the same `TOKEN_SECRET_KEY`.
- `www.merasoftware.com` serves the portal today, so this move changes the portal's address: B's `FORNTEND_URL` (builds client upload links in `helpers/externalUploadToken.js`), `ADMIN_DASHBOARD_URL` / `DEVELOPER_DASHBOARD_URL` (links in `helpers/emailService.js`) and `allowedOrigins.js` must follow it.

### Open issues on B — found, not fixed, need an owner call

| Issue | Where | Effect |
|---|---|---|
| "Retry Payment" creates a second order | `frontend/src/pages/OrderDetailPage.js` (`handleRetryPayment`, shown only for `payment-rejected` orders) → `pages/DirectPayment.js` → `/api/create-order`, which ignores `retryPaymentId` | Each retry leaves a duplicate order. The page also shows a browser-built amount that can differ from the server-priced order |
| Approving a payment marks a non-installment order complete whatever the amount | `backend/controller/user/transactionApprovalController.js:108` (`applyOrderMoneyForTransaction`) | A ₹1 transaction against a ₹50,000 order completes it on approval — only the admin reading the amount prevents it |

### Do together with a future feature

- **Coupons are not wired anywhere yet** — the Apply button in `StartNewWebsiteCustomize.js` is a no-op, `/api/validate-coupon` has no frontend caller, and no order path grants a discount. When coupons are wired: validate server-side (reuse `validateCoupon.js` logic) and increment `usedCount` in the same change — `usageLimit` is currently never enforced.

## Open questions

1. Who owns the domain/Cloudflare and production Vercel+Render accounts — which repo actually deploys production?
2. Who counts as a "portal user"? Every account lives in B as `customer`, including a blog reader who signs up on the website — so either everyone sees "My Portal" (an empty portal for a blog reader), or only some accounts do (e.g. those with an order/project, or a non-customer role).
3. `manager`/`developer`/`partner` have no portal screens — what should "reach their portal" mean for them?
