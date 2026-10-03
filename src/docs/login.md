# Login — one account for website + portal

> Keep this short. Owner decisions, verified facts and pending work only — delete an item once it is done. **Proposed** = not approved yet.

**Why this exists:** the owner runs two separate products the same client can touch — the public website/blog (A) and the paid client portal (B). Each had its own login, so a blog reader who becomes a paying client needed a second account, and the two teams (marketing content vs. client work) couldn't recognise the same person. This doc merges them into one identity without merging the codebases.

**Target:** one login. Sign in on the Next.js site (A); after sign-in the user returns to whatever they signed in for — the page and action they started from (e.g. writing a review), or the portal if they came from a portal link. One account, no second signup.

**Owner's requirement (27 Sep 2026, in the owner's words, translated):** Sign-in happens on the Next.js website. A portal user, after signing in there, can reach their own portal — and the website also shows them as signed in, because that is where they signed in. A user who signed in for the blog gets the blog panel and the website's features according to their role, from the website itself. Both must work through the Next.js website.

## Owner decisions

- A = this Next.js site (website + blog/community). B = the client portal: React frontend `E:\Allprojects\frontend` + Express backend `E:\Allprojects\backend`. Repos stay separate.
- Login happens on A. B stays the source of truth for the account (`_id`, email, password) and the portal role.
- Roles (27 Sep 2026): one account, a separate role on each side. The portal role lives in B. The blog role (`member`/`moderator`/`editor`/`admin`) lives on A and is changed from A's admin panel, because B has no blog roles. Exception: a B `admin` is always `admin` on A. A new user starts as `member` on A.
- A does not copy B's users (27 Sep 2026). A keeps its own user record (profile, blog role, all posts/comments/reactions) and creates it on the user's first signed-in visit, linked by B's `_id`; an existing A user with the same email is linked instead of duplicated.
- One account across both — a blog reader who buys a service does not get a second account.
- A's own local email/password system is cancelled — replaced by reading B's login.
- No Firebase Auth work for now (27 Sep 2026). B's login is what replaces A's development sign-in.
- After sign-in, return the user to what they signed in for (27 Sep 2026). Header sign-in stays on the page; a portal link goes to the portal; an action such as writing a review resumes that action. The role decides what the user can open (portal, blog panel, features), not where sign-in lands.
- "Create account" on the website is for the blog only, for now (27 Sep 2026). Portal users are not created from the website — the business creates them (admin panel, lead convert).
- For now only the system and structure are being built — no changes to the website's content or UI (27 Sep 2026). Exception approved on 28 Sep 2026: the header account menu shows the portal link and the portal role (details in `BLOG.md`).
- Guests (portal demo accounts) are signed out on the website, and the portal status check is cached briefly (27 Sep 2026).
- B stores a plaintext copy of passwords (`STORE_PLAIN_PASSWORD: true`, `config/accessControlConfig.js`) — owner-accepted risk, not to be changed unless the owner says so.

## Where everything runs (verified 28 Sep 2026)

| Part | Local folder · port | GitHub repo | Hosted on | Address |
|---|---|---|---|---|
| Website (A) | `E:\Allprojects\merasoftware` · 3000 | `merasoftwareofficial/merasoftware-nextjs` | Vercel `merasoftware-nextjs` (team `merasoftwareofficials-projects`) | `www.merasoftware.com` (`merasoftware.com` redirects there) |
| Portal frontend | `E:\Allprojects\frontend` · 3001 | `merasoftwareofficial/merasoftware-frontend-portal` | Vercel `merasoftware-frontend-portal` (same team) | `merasoftware-frontend-portal.vercel.app`; `portal.merasoftware.com` not yet moved here |
| Portal backend | `E:\Allprojects\backend` · 8080 | `merasoftwareofficial/merasoftware-backend` | Render web service `srv-dat13cfpn0mc73afkppg` ("M" workspace) | `api.merasoftware.com` — live on commit `a51bea2` |
| Old portal backend | — | `jasmeetkaur9346/merasoftware-backend` | Render `srv-d0ta6uidbo4c739fb86g` (another workspace) | no longer on `api`, but still running |

- DNS is on Cloudflare (domain registered at Namecheap). MX (Zoho), `send.*`, `_dmarc` and the domainkey records are email — never touch them.
- Databases (Atlas): production portal data `merasoftware-db`; website data `merasoftware`; local backend uses `merasoftware-dev`, which is empty (no users).

## How the login works now

- Website `/login` (`src/app/login/login-form.tsx`) posts from the browser to the portal's `/api/signin` or `/api/signup`; the portal sets the `token` cookie (`COOKIE_DOMAIN=.merasoftware.com` live, host-only on localhost).
- Website `getSession()` / `getSessionUser()` (`src/lib/auth.ts` → `src/lib/portal.ts`) verifies that JWT with `TOKEN_SECRET_KEY`, asks the portal `GET /api/user-details` for roles, guest flag and ban (cached 60 s), then finds, links or creates the website user by `portalUserId`. A portal admin is website admin by derivation, never stored.
- Portal sign-up creates a blog-only `member` (no portal screens). Portal roles are granted only by an admin through `/api/addRole`; the portal's Add Customer/Admin/Developer/Partner buttons use `frontend/src/helpers/createAccountWithRole.js`.
- Sign-out calls the portal's `/api/userLogout`; the portal drops its cached user on a 401 (`frontend/src/AppContent.js`). Startup verifies the current cookie before guards use a user or role; localStorage cannot establish a session. Network/server failures show retry on protected entry routes, and reconnect rechecks the session. Concurrent checks share one request, and login/logout invalidate older responses (`frontend/src/utils/sessionClient.js`). The router stays mounted when identity changes.
- Blog roles and bans: website `/admin/users` → `PATCH /api/users/[id]`.
- The website header shows the portal link by the cookie's active portal role (admin → portal admin panel, customer → My Portal), matching portal guards. Full account roles still determine website permissions. Temporary portal HTTP failures are not cached as signed out for 60 seconds. See `src/lib/auth.ts` and `src/lib/portal.ts`.
- Settings the website needs (Vercel and `.env.local`): `TOKEN_SECRET_KEY` (exactly the backend's value), `PORTAL_API_URL`, `PORTAL_URL`, `MONGODB_URI`, `DATA_DRIVER`. Without them the build fails on `/login` (this happened on 28 Sep 2026).
- Settings the backend needs on Render: `MONGODB_URI`, `TOKEN_SECRET_KEY`, `RESEND_API_KEY`, `FROM_EMAIL`, `FROM_NAME`, `ADMIN_EMAIL`, `ADMIN_DASHBOARD_URL`, `FORNTEND_URL` (spelled as in the code), `KEEP_ALIVE_URL`, `COOKIE_DOMAIN`, `EXTERNAL_UPLOAD_TOKEN_SECRET`, `GOOGLE_DRIVE_CREDENTIALS_PATH` + secret file `google-drive-credentials.json`, and `ENABLE_CRONS=true` on production only.

## Working rules

- Each change: `workN` backup first → verify by running on the throwaway database `merasoftware-fix-test` → owner review before the next.
- The local backend `.env` stays on `merasoftware-dev` with `ENABLE_CRONS=false`.
- Production secrets are copied by the owner, never pasted into chat.

## Pending work

### Finish going live

1. **Render settings.** On 28 Sep the new backend was missing `COOKIE_DOMAIN`, `ADMIN_DASHBOARD_URL` and `KEEP_ALIVE_URL`; confirm they are added. `MONGODB_URI` must point at `merasoftware-db`.
2. **Crons.** Suspend the old Render backend first, then set `ENABLE_CRONS=true` on the new one. The old one runs crons with no switch, so both on means renewals run twice.
3. **`portal.merasoftware.com` → new portal.** Add the Cloudflare TXT record `_vercel` shown in the portal project's Vercel Domains page, verify, then point the `portal` CNAME at the target Vercel gives. Until then `portal.*` serves the old portal frontend from another Vercel account, whose Add Customer/Admin buttons now create blog-only members against the new backend.
4. **Decide the portal's own login page.** It holds "Forgot password?" (a dead `href="#"` link — no reset exists anywhere) and "Login as Guest" (demo). Redirecting it to the website login would remove both — owner's call.
5. **Local testing** needs an account in `merasoftware-dev` (it has no users, so live accounts get "User not found" locally): create one at `localhost:3000/login`, then make it admin in that database.
6. The rollback folders `E:\merasoftware-new\work7`–`work14` are from before the fixes, which are now committed and deployed — delete when the owner wants.

### Waits for the UI work

- Website sections that send users to the portal with `/login?next=<portal URL>`.

### Found, not fixed

- **Signin is case-sensitive on email.** Signup stores the email lowercased; `backend/controller/user/userSignIn.js` looks it up as typed, so `Name@Gmail.com` gets "User not found". One-line fix, awaiting the owner.

### Open issues on B — found, not fixed, need an owner call

| Issue | Where | Effect |
|---|---|---|
| "Retry Payment" creates a second order | `frontend/src/pages/OrderDetailPage.js` (`handleRetryPayment`, shown only for `payment-rejected` orders) → `pages/DirectPayment.js` → `/api/create-order`, which ignores `retryPaymentId` | Each retry leaves a duplicate order. The page also shows a browser-built amount that can differ from the server-priced order |
| Approving a payment marks a non-installment order complete whatever the amount | `backend/controller/user/transactionApprovalController.js:108` (`applyOrderMoneyForTransaction`) | A ₹1 transaction against a ₹50,000 order completes it on approval — only the admin reading the amount prevents it |

### Do together with a future feature

- **Coupons are not wired anywhere yet** — the Apply button in `StartNewWebsiteCustomize.js` is a no-op, `/api/validate-coupon` has no frontend caller, and no order path grants a discount. When coupons are wired: validate server-side (reuse `validateCoupon.js` logic) and increment `usedCount` in the same change — `usageLimit` is currently never enforced.

## Open questions

1. Who owns the old Vercel account behind the `portal.`, `admin.`, `partner.`, `accounts.` and `savingo.` CNAMEs, and the old Render workspace?
2. `manager`/`developer`/`partner` have no portal screens — what should "reach their portal" mean for them?
