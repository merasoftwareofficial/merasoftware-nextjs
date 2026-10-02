# Notifications & Newsletter

> Same rules as `BLOG.md`: keep it short, record the owner's decisions as given, remove finished work. Read `BLOG.md` first (working style, safe test recipe, repo rules).

## Goal (owner, 2 Oct 2026)

People get notified by the website according to their own choice: only the blog categories they pick (SEO, Mental Health, Parenting…) and, if they want, offers. One system, one preference record, several delivery channels.

## Owner decisions (2 Oct 2026)

- **One system, single source of truth.** One preference record per person; email, website bell and browser push all read it.
- Channels: **email**, **website bell** (signed-in users only), **browser push** (also without login). Planned together, built in phases.
- **Subscribing needs no login** (email, or push permission).
- Notify only for **official** posts.
- **Instant only** for now; weekly digest is the last phase.
- Topics: **blog categories + Offers**. Nothing else for now.
- **Build the system first, connect the mail service later.** Without a key nothing is sent and the site keeps working.
- **Push notifications first; email can come later** ("mere liye push notification jaruri hain mail ka kaam baad mein bhi ho sakta hai"). Order: Step A pipeline + push, Step B offers via push; email, bell and digest later. The owner left the details to the agent: "apni intelligence se sahi tarike working karo jo meri jarurat ko bhi poora kare aur system bhi sahi rahe".

## How it works

```text
Post's first publish (repo/index.ts onPostChange)
  → NotifyJob per channel (notify-queue.ts)
  → who wants it: Subscriber.categories            (notify-rules.ts)
  → channel: push today (push.ts) · email later · bell later
```

- **Subscriber** (`src/models/Subscriber.ts`): `email?`, `emailStatus` (`none · pending · active · unsubscribed · bounced`), `userId?`, `token` (manage link; also the browser cookie), `categories` (Category `_id`s), `offers`. **PushDevice**: one per browser (`endpoint`, keys), owned by a Subscriber.
- **Who owns a record** (`ownSubscriber`): manage-link token, else the signed-in account, else this browser's `ms_notify` cookie (httpOnly, set when push is allowed without login). A browser's record with no owner is taken over by the account that signs in on it.
- Categories are stored by **id**, because a post stores the category **name** and a rename rewrites it. A merge moves subscribers to the target id; a delete removes the id (`category-actions.ts`). Archived ids are kept but not offered or used.
- **Which posts:** official + public + a category, **first** publish only (edit, unpublish/republish announce nothing), re-checked at send time; nothing older than 48 hours after going live is sent. Scheduled posts notify when they go live.
- **Sending:** right after the publishing response (`after()`); unfinished or waiting jobs continue on later site visits (at most once a minute); daily Vercel Cron `/api/cron/notify` (`vercel.json`, needs `CRON_SECRET`) as backstop, since Hobby allows one cron a day. A `Delivery` key per job and device is claimed before each send, so nothing is sent twice. An expired browser (push service answers 404/410) is deleted.
- **Only configured channels are shown.** No VAPID keys → no box, no footer link, `/subscribe` says "not available", `POST /api/push-devices` answers 503, jobs wait. No mail key → the email part of the box is hidden.
- **Email (built in phase 1, not connected):** double opt-in, at most one confirm mail per address per 10 minutes, a stranger never changes an active or account-linked address's choices (a manage link is mailed instead), account linked only on confirm, one-click unsubscribe. `src/lib/mailer.ts` (Resend REST API) sends nothing without `RESEND_API_KEY` + `FROM_EMAIL`.
- **Push files:** `public/sw.js` (shows the notification, opens the post on click; caches nothing; served no-cache via `next.config.ts`), `src/app/manifest.ts` + `public/icons/` (home-screen install, which iPhone needs before it allows push), `src/components/subscribe/use-push.ts` (permission is asked only from a click).

## Status

| Step | What | Status |
|---|---|---|
| 1 | Subscriber model, subscribe box, email confirm flow, preference page, category sync | built, awaiting owner review (`work56`) |
| A | Queue + publish hook + push (devices, service worker, manifest, cookie owner, cron backstop) | built and tested on the throwaway copy, awaiting owner review (`work57`) |
| B | `/admin/newsletter`: offers via push, subscriber and device counts | next |
| later | Email channel in the queue · bell (list built at read time, `BlogQuery.category` must accept an array) · weekly digest | later (owner) |

## Pending

- **Owner review** of `work56` (step 1) and `work57` (step A).
- **Real-device check** once deployed with keys: push needs HTTPS, so allow notifications on Android/desktop Chrome and on an iPhone home-screen install, publish an official post, click the notification. Tests so far used a fake push service that decrypts every message.
- **Owner action on Vercel:** `VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` (run `npx web-push generate-vapid-keys` once; never paste the private key in chat), optional `VAPID_SUBJECT` (default `mailto:contact@merasoftware.com`), `CRON_SECRET` (any long random string). Later for email: `RESEND_API_KEY`, `FROM_EMAIL` (domain verified in Resend).

## Traps

- **The push button is drawn in the browser** (support and permission can only be read there), so it is absent from server HTML — test it in a real browser, not with fetch.
- **`web-push` only speaks https.** A local fake push service needs a self-signed certificate and `NODE_TLS_REJECT_UNAUTHORIZED=0` on the test server only.
- **The test portal backend's `.env` has a real `RESEND_API_KEY`:** override it with a fake one when running it for tests, or test signups send real mail.
