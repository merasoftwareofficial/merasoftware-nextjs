# Notifications & Newsletter

> Hand-over doc for the next agent. Same rules as `BLOG.md`: keep it true and short, record the owner's decisions as given, put your own ideas under "Proposed" until the owner approves, remove finished work once the owner has approved it.

## Start here

1. Read `BLOG.md` first: the owner's working style (understand → short Hinglish review → owner's "yes" → code → owner review → docs), the backup rule (`workN/`), the safe test recipe (never the local `.env.local` database — it is production) and the repo rules.
2. Read this file to the end. "Status" says what is built; "Next work" says what to build and how.
3. Check `git status`: steps 1 and A were **not committed** when this was written (owner review pending).
4. Backups so far: `work56` (before step 1), `work57` (before step A). `work53`–`work55` belong to other work. Take the next free number.

## Goal (owner, 2 Oct 2026)

The owner asked for notifications and a newsletter where a person is **free to subscribe only to the blog categories they want** (example: SEO, Mental Health, Parenting — whatever categories the site has) **and to offers**, and the website notifies each person **according to their own choice**.

## Owner decisions (2 Oct 2026)

- **One system, single source of truth.** One preference record per person; every channel reads it.
- Channels: **email**, **website bell** (signed-in users only), **browser push** (also without login). Planned together, built in phases.
- **Subscribing needs no login** (email, or push permission).
- Notify only for **official** posts.
- **Instant only** for now; weekly digest is the last phase.
- Topics: **blog categories + Offers**. Nothing else for now.
- **Build the system first, connect the mail service later.** Without a key nothing is sent and the site keeps working.
- **Push notifications first; email can come later** ("mere liye push notification jaruri hain mail ka kaam baad mein bhi ho sakta hai"). Not every phase now: Step A (pipeline + push), then Step B (offers via push); email, bell and digest later.
- The owner left the details to the agent: "apni intelligence se sahi tarike working karo jo meri jarurat ko bhi poora kare aur system bhi sahi rahe". The owner worried about leaving the plan midway; the answer agreed with them: only the **order** changed, the design did not.

## How it works

```text
Post's first publish ── repo/index.ts onPostChange()  (Publish, Approve, schedule coming due, direct create)
   └─ notify-queue.ts queuePostNotifications() → NotifyJob { kind: "post", channel: "push" }
         └─ runJobs(): after() right away · drainSoon() on site visits (≤ 1/min) · daily cron
               └─ audience: Subscriber.categories ∋ the post's category id     (notify-rules.ts)
                     └─ channel: push.ts sendPush() per PushDevice   (email: later · bell: later)
```

**Data** (each model mirrors a type in `src/lib/repo/types.ts`; both drivers implement every repo):

| Model | Holds |
|---|---|
| `Subscriber` | `email?`, `emailStatus` (`none · pending · active · unsubscribed · bounced`), `emailConfirmedAt?`, `confirmSentAt?`, `userId?`, `pendingUserId?`, `token`, `categories` (Category `_id`s), `offers`. `email`/`userId` are left out, never null (partial unique indexes). |
| `PushDevice` | One per browser: `subscriberId`, `endpoint` (unique), `p256dh`, `auth`, `userAgent?`. |
| `NotifyJob` | `kind: "post"`, `refId` (post id), `channel` (`push · email`), `status` (`queued · running · done · skipped`), `lockedUntil?`, `sent`, `failed`, `note?`. Unique on kind + refId + channel. |
| `Delivery` | `_id = "<job id>:<device id>"`, claimed before each send; TTL 90 days. |

**Rules** (`notify-rules.ts`, `subscription-actions.ts`, `notify-queue.ts`):

- **Owner of a record** (`ownSubscriber`): the manage-link `token`, else the signed-in account, else this browser's `ms_notify` cookie (httpOnly, 400 days, set when push is allowed without login). A browser's record without owner, email or account is taken over by the account that signs in on it.
- **Categories by id**: a post stores the category **name** and a rename rewrites it; the id stays. A merge moves subscribers to the target id, a delete removes the id (`category-actions.ts`). Archived ids are kept on the record (restore brings them back) but not offered or used. Unknown ids sent by a form are dropped.
- **Which posts**: official + public + has a category, **first** publish only (`before` had no `publishedAt`) — edit, unpublish/republish announce nothing. Re-checked at send time (still published, public, official). Nothing goes out more than **48 hours** after the post went live (`stillFresh`), so a channel configured later does not send old news.
- **Sending**: a job is claimed atomically (`lockedUntil` 5 min), devices are sent 10 at a time, a `Delivery` key is claimed before each message, so a job run twice or by two runners never sends twice. Push service 404/410 → device deleted. Push not configured → fresh jobs stay `queued`; stale ones are `skipped` with a note.
- **Only configured channels are shown** (`SubscribeBox` returns null when none is): no VAPID keys → no box, no footer link, `/subscribe` says "Notifications are not available yet", `POST /api/push-devices` answers 503. No mail key → the email part of the form is hidden.
- **Email (built in step 1, not connected)**: double opt-in; one confirm/manage mail per address per 10 minutes (`canMail`); a request that is not the address's own never changes an active or account-linked record (it mails a manage link instead; the reply is always "check-inbox"); an account is linked only when the confirm link is clicked (the portal does not verify emails), taking over the account's email-less record and moving its push devices; an old confirm link never undoes an unsubscribe; one-click unsubscribe route. `mailer.ts` (Resend REST API, no package) sends nothing without `RESEND_API_KEY` + `FROM_EMAIL`: outside production it prints the mail to the server log, and `confirmSentAt` stays empty so the confirm mail can go once mail is configured.
- **Permission is asked only from a click** (`use-push.ts`). iPhone/iPad Safari outside a home-screen install gets an "Add to Home Screen" hint instead of a button.

## Files

| Area | Files |
|---|---|
| Rules & writes | `src/lib/notify-rules.ts`, `src/lib/subscription-actions.ts`, `src/lib/notify-queue.ts` |
| Channels | `src/lib/push.ts` (web-push), `src/lib/mailer.ts`, `src/lib/notify-emails.ts` |
| Data | `src/models/Subscriber.ts`, `PushDevice.ts`, `NotifyJob.ts` (+ Delivery); repo types + `json-driver.ts` + `mongo-driver.ts`; exports `subscriberRepo`, `pushDeviceRepo`, `notifyJobRepo`, `deliveryRepo` |
| Hook | `src/lib/repo/index.ts`: `onPostChange()` (IndexNow + queue; the queue is imported lazily because it imports the repo) and `drainNotifications()` in `list`/`listCards` |
| UI | `src/components/subscribe/`: `subscribe-box.tsx` (server), `subscribe-form.tsx`, `preferences-form.tsx`, `push-control.tsx`, `topic-chips.tsx`, `use-push.ts`; styles at the end of `globals.css` |
| Pages | `/subscribe`, `/subscribe/manage` (noindex); box at the end of `/blog` and under each post (its category pre-ticked for someone with no settings); footer "Get notified" (only when a channel is configured); account menu "Notifications" |
| Push app files | `public/sw.js` (shows the notification, opens the post on click, caches nothing; no-cache headers in `next.config.ts`), `src/app/manifest.ts`, `public/icons/` (192, 512, apple-touch, badge), apple icon + `appleWebApp` in `src/app/layout.tsx` |
| Cron | `vercel.json` (daily 03:30 UTC) → `/api/cron/notify` (needs `Authorization: Bearer $CRON_SECRET`) |

**Routes**: `POST /api/subscribe` · `GET /api/subscribe/confirm?token=` (redirects to the manage page) · `POST /api/subscribe/unsubscribe` (token in address or body, or session; also the one-click target) · `GET|PATCH /api/subscriptions/me` · `POST|DELETE /api/push-devices` · `GET /api/cron/notify`.

**Environment**: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (optional, default `mailto:contact@merasoftware.com`), `CRON_SECRET`; later `RESEND_API_KEY`, `FROM_EMAIL`, `FROM_NAME` (optional).

## Status

| Step | What | Status |
|---|---|---|
| 1 | Subscriber model, subscribe box, email confirm flow, preference page, category sync | built + tested (JSON 34/34, Mongo 32/32, signed-in + category sync 22/23 — the one failure was the test's text match); **awaiting owner review** |
| A | Queue + publish hook + push (devices, service worker, manifest, cookie owner, cron backstop) | built + tested (unconfigured 6/6; configured 33/34 — the one failure: the push button is drawn in the browser, confirmed by screenshot); **awaiting owner review** |
| B | Offers via push from the admin panel | next — see below |
| later | Email channel · bell · weekly digest | later (owner) — see below |

## Pending

- **Owner review** of step 1 and step A, then commit.
- **Owner action on Vercel**: VAPID keys (run `npx web-push generate-vapid-keys` once; never paste the private key in chat) and `CRON_SECRET` (any long random string). Until then production shows nothing new.
- **Real-device check** after deploy (push needs HTTPS): allow notifications on Android Chrome, desktop Chrome and an iPhone home-screen install; publish an official post in a followed category; the notification arrives and opens the post. So far only a fake push service was used (it decrypted every message).

## Next work

### Step B — offers via push (next)

Without it, the "Offers" choice is saved but nothing ever uses it.

- **Campaign model** (+ type, both drivers): `title`, `body`, `url` (a path on this site, default `/`), `target` (`offers: true` and/or `categoryIds`), `status` (`draft · sent`), `createdBy`, `sentAt`.
- **Queue**: allow `NotifyJob.kind: "campaign"` (enum in model + type) with `refId` = campaign id; in `runJob`, audience = subscribers with `offers` (and/or the chosen categories), message from the campaign, `tag: "campaign-<id>"`. Same Delivery keys, so no double send. The 48-hour rule counts from `sentAt`.
- **Repo**: `subscriberRepo.listForOffers()`; counts for the panel (subscribers per category, with offers, devices).
- **Page `/admin/newsletter`**: `requireStaffPage("/admin/newsletter", "admin")` in the page itself (BLOG.md rule 6); link in `src/components/admin-layout.tsx`. Write a campaign → "Send to my devices first" (the admin's own subscriber record) → confirm with the audience count → send. Below: counts and the job history (`notifyjobs`: status, sent, failed, note) so the owner sees what went out. Shows "Push is not configured" while keys are missing.
- **Ask the owner before building**: only admins may send, or editors too? Any limit on how often offers may be sent?

### Later — email channel

- In `queuePostNotifications`, also create a `channel: "email"` job; in `runJob`, an email branch: active-email subscribers following the category, Delivery key `job:subscriber`.
- Post mail template in `notify-emails.ts` with `List-Unsubscribe: <https://…/api/subscribe/unsubscribe?token=…>` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click` (Gmail/Yahoo bulk rules); Resend batch sending.
- Send the pending confirm mails once mail is configured (`emailStatus: "pending"` without `confirmSentAt`).
- Resend bounce/complaint webhook (verify its signature) → `emailStatus: "bounced"`.
- The email part of the box appears by itself once `mailConfigured()` is true. Check the Resend plan's daily limit against the subscriber count.

### Later — bell (signed-in users)

- Bell with unread count in `src/components/site-header.tsx` (the header reads the session on the server, so the count needs no extra request).
- The list is **built at read time** (published official posts in the record's categories since the record was made, later campaigns too); only a `bellSeenAt` time is stored on the Subscriber — no row per user per post.
- `BlogQuery.category` must accept an array (types + mongo `$in` + json `includes`).

### Later — weekly digest

`frequency: "instant" | "weekly"` on the Subscriber, a choice on the preference page, and a weekly run (the daily cron can act on one weekday).

## Known limits (accepted for now)

- A push that fails for another reason than 404/410 is not retried (its Delivery key is already claimed).
- `sent`/`failed` are written when a run finishes; a run cut short loses its counts (not its deliveries).
- The account menu shows "Notifications" even while no channel is configured; the page then says "not available".
- On a browser whose record an account took over, the same browser can still change that record while signed out (the cookie stays).
- The 10-minute mail limit is only testable once mail is configured.
- The post-page box sits below the article reader; seen in HTML, not in a screenshot (the reader fills the screen).

## How to test (as done for step A)

Use BLOG.md's throwaway copy and second portal backend on 8090 — **override its `RESEND_API_KEY` with a fake value**: its `.env` has a real key and test signups would send real mail. Then:

- Generate throwaway VAPID keys (`require("web-push").generateVAPIDKeys()`), never the production ones.
- Fake push service: a Node HTTPS server on 9443 with a self-signed certificate (`openssl req -x509 …`); it logs each request and answers 410 on `/gone/*`. Run the site with `NODE_TLS_REJECT_UNAUTHORIZED=0` (test server only) and `CRON_SECRET=<test value>`.
- Fake browsers: `crypto.createECDH("prime256v1")` + 16 random auth bytes as the subscription keys; decrypt the logged bodies with `http_ece` (`version: "aes128gcm"`) to check the exact message.
- Make a test admin by setting `roles: ["admin"]` on the fix-test portal DB; the portal caches roles up to 60 s, so retry the first admin call.
- Run once **without** VAPID keys (nothing offered, job waits) and once **with** them (the waiting job goes out on a site visit).

## Traps

- **The push button is drawn in the browser** (support and permission are only readable there), so it is absent from server HTML — check it in a real browser or screenshot.
- **`web-push` only speaks https**; see the test recipe.
- **Headless Chrome has a minimum window width** (about 500 px): a 390 px screenshot looks cut off on every page. Render the page in a 390 px iframe instead.
- **React splits text with `<!-- -->`** in server HTML: match a fragment, not a whole sentence with a variable in it.
- **Proposed text must not become a decision**: an option the agent suggested (like the step order) goes in "Owner decisions" only after the owner says yes.
