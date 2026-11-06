# Reservation countdown + message channel — hand-over

**Doc rule:** this file is the single entry point for this work. Update it after every step with the owner's decisions and the work actually done. Replace stale lines instead of appending history. Open questions stay in chat.

**Repos,** under `E:\Allprojects`: `backend` (Express, email control, WhatsApp worker; Render), `merasoftware` (website and its admin; Vercel), `frontend` (customer portal and its admin). Paths below are inside these.

## Status (7 Nov 2026)

- **Part C (reminders + Start my project, below) is committed by the owner** in all three repos ("offer page ton cleint vallo project start karan wala system", 6 Nov). The team-recipients fix (in "Before deploy") is pushed to backend `main` (`4857186`, 7 Nov). First live run, 7 Nov: a Start request queued the team WhatsApp to the number in the admin's settings, with the admin's settings email (`merasoftwareofficial@gmail.com`, not the fallback). The WhatsApp messages waited for the Sending rules hours; whether they went after 8 am is not checked yet. Docs with before/after follow the owner's "perfect".
  - Tests: the backend suite passes 793 of 793 with `node --test --test-concurrency=3 tests/*.test.js whatsapp/tests/*.test.js`. Without the concurrency limit, files fail on this PC from load, not from the code. The new `npm run test:reservation-reminders` passes 10 of 10.
  - Website: `npx tsc --noEmit`, `offer-reservation-rules` + `offer-quote`, `offer-reservations.browser` (with the Start flow), `communication-live.browser`, `test:email` and `test:auto-reply` pass.
  - Portal: `reserved-offers-admin-browser` and `portal-workspace-ui.browser` pass. `offer-reservations-browser` still fails at "Loading your offers…", as it did on HEAD before this work.
  - Rollback: originals are in `E:\Allprojects\backup\backend\work56-reservation-reminders`, `backup\merasoftware\work79-reservation-reminders` and `backup\frontend\work61-reservation-reminders`. New files have no original: backend `helpers/reservationReminders.js`, `helpers/reservationStart.js`, `tests/reservationReminders.test.js`; website `src/app/api/offer-reservations/[id]/start/route.ts`.
- **Parts A and B are committed** (git log: "reservation system dynamic countdown and clossure"). Their deployment is not verified. Docs with before/after follow the owner's "perfect".
- **Tests on 5 Nov:**
  - Backend: the whole suite, `node --test tests/*.test.js whatsapp/tests/*.test.js`, passes 734 of 734. The new file `npm run test:reservation-countdown` passes 19 of 19.
  - Website: `npx tsc --noEmit` passes. `test:email` 23/23, `test:auto-reply` 4/4 (including the new Reservation box test), `test:whatsapp` 10/10, `test:broadcast` 2/2, offer unit tests 21/21, `offer-reservations.browser` and `communication-live.browser` all pass.
  - Portal: `email-control-browser`, `reserved-offers-admin-browser`, `portal-workspace-ui.browser`, `email-review.test` and `lead-proposals-browser` pass.
- **Already failing on HEAD without these changes** (checked by running them on the original files): portal `offer-reservations-browser.cjs` ("Loading your offers…"), `lead-message-browser.cjs` (`To: … Details` summary) and `inquiry-lead-browser.cjs` ("Ravi WA" name guess). They are not part of this work.
- **Rollback.** Originals are in `E:\Allprojects\backup\backend\work51-reservation-countdown`, `backup\merasoftware\work74-reservation-countdown` and `backup\frontend\work57-reservation-countdown`. New files have no original: backend `helpers/reservationClosure.js` and `tests/reservationCountdown.test.js`, website `src/app/admin/communication/reservation-panel.tsx`. Files restored with `git show HEAD:` differ from the working copy only in CRLF line endings.
- **Plan verification probes** (9 backend, 3 website) are in `backup\merasoftware\work73-reservation-countdown-docs\probes\`.
- **Real-phone test after deploy** needs the owner's go-ahead. Check these flags on Render first: `OFFER_RESERVATIONS_ENABLED`, `OFFER_RESERVATION_CONFIRMATIONS_ENABLED`, `OFFER_RESERVATION_JOBS_ENABLED`, `ENABLE_WHATSAPP`. Deploy the backend before the website and the portal.

### Rules found while building (now in the code)

- **Both, on automatic mail, sends each part that can go.** Team addresses have no phone, so the email goes and the WhatsApp part is skipped, as the old email-plus-copy did. A single route (WhatsApp only or Email only) that can't reach the person is marked Not sent and never sent the other way (`emailController.js` `decideChannels`).
- **A retry repeats the channels its first attempt locked** when it doesn't name one. Before this, retrying a subscription mail failed with "requires email".
- **`sendSystemMail` throws when a channel send fails**, so the job retries the same draft with the same provider key. A WhatsApp-only send that reached the queue (`queued`) counts as delivered.
- **After the provider accepted an email, a failed result write is logged, not thrown** (`reviewDelivery.js`). `emailOutbox.reconcileSent` repairs the audit row for channel drafts that included email. The Email Review summary counts a channel draft still `sending` whose audit row is delivered as done.
- **Drafts whose first email attempt started before Send via existed** (status `failed` or `sending`, `attemptCount` > 0, no channels) keep the old email-plus-copy path on retry.
- **WhatsApp falls back to the lead's phone.** `savedPhoneFor` uses the account's phone, else the lead's.
- **Test suites that read email text set those actions to Email** in their setup, because the customer default is WhatsApp only.
- Read first for background: [RESERVATION_AGENT_HANDOVER.md](RESERVATION_AGENT_HANDOVER.md) (reservation money rules, already built), [auto-reply.md](auto-reply.md) (WhatsApp queue rules), [FINAL_MESSAGE_EXPIRY.md](FINAL_MESSAGE_EXPIRY.md) (the closure pattern this copies).

## What the owner wants

1. Every offer sets how many hours its reservation lasts. The countdown of each reservation comes from that number.
2. When a customer reserves: a WhatsApp message says the reservation started, how long it lasts and the exact deadline, and to get the project started before then, or the offer expires.
3. When a project is started on the reservation: the normal project-started message, and no expiry message.
4. When the time ends with no project: an automatic closing message ("your offer has expired", a link to the offers page, "better luck next time").
5. Every template that goes to customers must be able to go by WhatsApp only, Email only or Both. This is one setting for all templates (SSOT), not one made only for reservations.
6. **For now every customer template is WhatsApp only.** This is a testing stage: a wrong WhatsApp can be deleted for everyone, a wrong email can't. The owner will switch actions to Both by hand later.
7. Invoice messages carry a link to the invoice in the portal instead of the PDF, so the client has to use the portal.

## Owner decisions

- **Hours per offer:** a new offer field, "Reservation lasts (hours)", 1–720, empty = 72. It is separate from "Reserve opens (hours before the offer ends)", which only decides when the Reserve button appears.
- **Frozen at reserve time:** changing the offer's hours later never changes a reservation already running. Existing offers have no value, so they keep 72.
- **Countdown starts the moment the customer reserves,** not when the message is delivered. Unlike Final Message, the deadline is already shown on the website at that moment.
- **"Used" means a project was created on the reservation.** A project with no first payment by the deadline is not a reservation matter: the existing price rule and the payment-due system handle it. No new message for that case.
- **Extending one customer's time** uses the existing portal control: client page → Reserved offers → Extend deadline (`frontend/src/components/admin/ReservedOffersPanel.js`). The extension message and the closing message follow the new deadline.
- **Channel:** one "Send via" setting per action in Email Templates. The review popup opens with it and can change it for that one message only.
- **Defaults:** customer actions → WhatsApp only. The 11 team actions (below) keep today's behaviour, Email + WhatsApp. A message that can't go by its chosen route is marked **Not sent** with the reason. It never falls back to email.
- **Invoice:** a link to `/invoice-detail/<invoiceId>` in the portal instead of the PDF. Email still attaches the PDF.
- The lead's status is not changed by any of this.

## How it will work

1. The admin sets the hours on the offer (or leaves it empty for 72).
2. The customer presses Reserve. The deadline is the reserve time plus the offer's hours, saved on the reservation. WhatsApp message "Start": the hours, the exact deadline in IST, and "get your project started before then or the offer expires".
   - If the admin created the project (the reservation is made at that moment), the same message instead says the project has started and asks for the first payment before the deadline.
3. A project is created on the reservation before the deadline → the existing project-created message goes. The reservation counts as used, so no closing message.
4. The admin extends the deadline → the existing extension message goes, and the closing message waits for the new deadline.
5. The deadline passes and no project is attached → WhatsApp message "Expired" with the offers page link (`<website>/offers`). It goes once.
6. The Communication tab gets a **Reservation** box: counts (running / used / expired), the running reservations with their deadline and time left, and links to the three templates.

## Part A — "Send via" for every template (SSOT)

### Verified facts

- **Every send converges on one point.** All sends call `decide()` → `decideChannels()` (`backend/helpers/emailController.js:295-304`), and `decideEmail` is the only provider call. Automatic sends reach it too: `sendAutomatic` (`:213`) for customer-started mail, and `sendSystemMail` (`:352`) for system mail, which covers reservations, plan steps and offer reminders.
- **Channel delivery already exists, but only for the review popup.** `helpers/reviewDelivery.js` `deliver()` and `availability()` (`:6-24`) do Email, WhatsApp or Both. Automatic callers pass no `channels`, so they fall to the old path: email first, then a WhatsApp copy of every sent email (`emailController.js:278`, `whatsappQueue.js` `enqueueWhatsAppForEmail`).
- **Probe P8:** an automatic draft with no admin sent with `channels: 'whatsapp'` → WhatsApp queued, zero email provider calls.
- **Probe P9:** WhatsApp-only with no phone is refused with "A valid saved phone number is missing.", with no email fallback. **But the draft stays `pending`**, so it would show in Email Review as waiting, and system mail would retry every 5 minutes.
- **The setting the owner sees today is per admin, not per action.** `EmailReviewPreference.channel` (`models/emailControlModel.js:87`) is remembered per admin per action, through `GET/PUT /preferences/:event` (`routes/emailControl.js:145-165`). Two places read it: the website popup (`merasoftware/src/app/admin/email-control/email-control-panel.tsx:128-155`) and the portal popup (`frontend/src/components/EmailReviewDialog.js:44-51, 104`). The Email Templates list shows only "Email + WhatsApp" or "Nothing sent" per action (`email-control-panel.tsx:290`).
- **The policy save is safe for a new field.** `PUT /policies/:event` uses `$set` on `mode` and `defaultTemplate` only (`routes/emailControl.js:132-137`), so a new field is not wiped.
- **Every account has an email.** `userModel.js:76-79` makes email required and unique, and signup and guest login both require it. WhatsApp finds the phone from that email with `savedPhoneFor` (`whatsappQueue.js:26`), so the 24 builders that return null without an email need no change. Only leads have no email, and their messages already carry a phone.
- **Many builders load the user as `'name email'` only** (13 populates, e.g. `helpers/servicePlanNotifications.js:26`). That is fine, because the phone is looked up by email at send time.
- **Subscription confirmation is email-only by rule.** `reviewDelivery.js:12, 34` refuses WhatsApp for `website.subscription.*`.
- **The WhatsApp sender is text only.** `whatsapp/src/sender.js:101` sends text, with no documents.
- **Status `skipped` exists already.** Email Review lists only `pending/failed/sending` (`routes/emailControl.js:109`). The Communication hub labels `skipped` as "Not sent" (`communication-hub.tsx:77`). The Email History list shows the status but not the reason (`email-control-panel.tsx:308`), although `failure` is stored and returned (`recordHistory`, `emailController.js:35-46`).
- **Trap:** `sendSystemMail` reports a `skipped` draft as `'expired'` (`emailController.js:361`).
- **Dead actions, with no caller:** `sendPurchaseConfirmationEmail`, `sendMonthlyLimitedPlanActivationEmail`, `sendContactFormConfirmation`, `sendCallbackConfirmation`, and `auth.otp` (`helpers/otpUtils.js:30` `sendOTPEmail` returns false). Leave them as they are.
- **Already WhatsApp-only, not part of this work:** Final Message expiry (`finalMessageExpiry.js`), Broadcast, Auto Reply, Proposal WhatsApp (`leadProposalMessage.js`). They call `enqueueWhatsApp` directly.

### Team actions (keep Email + WhatsApp)

All 11 are addressed to admin emails or a developer (checked in their builders):
- `plan.request.admin`
- `sendUpdateRequestNotification`
- `sendUploadDeliveryStuck`
- `sendDeveloperAssignmentEmail`
- `sendAdminPurchaseConfirmationEmail`
- `sendAdminUPIPendingNotification`
- `sendContactRequestNotification`
- `sendCallbackRequestNotification`
- `sendAdminAutoRenewalNotification`
- `sendPlanClosureEmailToAdmin`
- `plan.purchase.admin`

Every other catalogued action goes to a customer or lead and defaults to WhatsApp only. `website.subscription.confirm` and `website.subscription.manage` stay email-only, and the screen says why.

### Changes

| Place | Change |
|---|---|
| `backend/helpers/emailCatalog.js` | Mark the 11 team actions (e.g. `audience: 'team'`). One function gives each action's default channel: team → `both`, subscription → `email`, everything else → `whatsapp` |
| `backend/models/emailControlModel.js` | `EmailPolicy.channel` (`email`/`whatsapp`/`both`), empty = the code default above |
| `backend/routes/emailControl.js` | Policy PUT accepts and validates `channel`. `/preferences` keeps `templateId` only; channel memory per admin is removed. The draft review response returns the action's channel as `defaultChannel` |
| `backend/helpers/emailController.js` `decideChannels` | When a decision has no `channels`, use the action's channel and go through `reviewDelivery.deliver`. For an automatic send (no actor) the chosen route being unavailable marks the draft `skipped` with the reason in `failure`, and records history. A review-popup send still shows the error so the admin can choose another route |
| `backend/helpers/emailController.js` `sendSystemMail` | Return a distinct `'not-sent'` for a draft skipped this way, instead of `'expired'` |
| Website `email-control-panel.tsx` | "Send via" select on each action in Email Templates. The summary at `:290` shows the real route. The popup starts from the action's channel and no longer saves a channel. History shows the reason next to "Not sent" |
| Portal `EmailReviewDialog.js` | Start from the action's channel; remove the channel read and save of the preference |
| Invoice templates in `emailDefinitions.js` | Add an `{{invoiceLink}}` required link to `/invoice-detail/<invoice._id>` on `FORNTEND_URL`, and reword "PDF attached" to "view or download your invoice" in: `sendMonthlyInvoiceEmail`, `invoice.project`, `invoice.reminder`, and `offer.payment.reminder` (reuses `invoice.reminder`) |

Invoice facts:
- The portal route `invoice-detail/:invoiceId` (`frontend/src/routes/customerRoutes.js:148`) needs login. After login the customer comes back to the same page (`ProtectedRoute` → `protectedLoginUrl(location)`). The page shows the invoice and offers a download.
- `offer.payment.reminder` already says "PDF attached" while sending no PDF (`emailController.js:319-323`). The link fixes it.

## Part B — Reservation hours, start text, closing message

### Verified facts

- **72 hours is hardcoded:**
  - backend `helpers/offerReservations.js:119` (customer) and `:144` (admin project)
  - website `src/lib/offer-reservation-rules.ts:11` `RESERVE_HOLD_HOURS`, used in `reserveCta` (`:62`) and in `src/components/campaign/public-interaction/page-content.tsx:21, 112, 115`
  - the hint text under "Reserve opens" in `src/app/admin/offers/offers-manager.tsx:215`
  - the start template text (`emailDefinitions.js:1050`)

  The portal shows only the backend deadline.
- **The offer reaches the reservation whole.** `/api/offers/live` sends the full offer, and `offerSnapshot: offer` freezes it (probe P1: a new field arrives in the snapshot). The admin project path gets its offer from the same catalogue (`helpers/projectPricing.js:16`).
- **The website offer schema is `.strict()`** (`src/lib/offers.ts:60`), so the new field must be added to `offerSchema` (probe W1).
- **Quote key:** put the new field in the signed key; do not add it to `DISPLAY_ONLY` (`src/lib/offer-quote.ts:9`). Offers without it keep their key exactly, `e983da…` for the default offer, and a set value changes the key (probe W2). A customer on the page while the admin changes the hours gets "Offer price or terms changed. Review…", which is correct.
- **The start message also goes for admin-created projects.** `adminCreateProjectOrder.js:227` drains confirmations (probe P2). Its text must not say "get your project started".
- **The start message reaches WhatsApp** on the account phone (probe P3; the queue stores `919876500001` without `+`). A Dead lead does not block it, because system mail is not a marketing event for `leadContactBlock.assertDraftMayGo` (probe P4).
- **There is no closing message today.** The expiry job selects only reservations with a project (`reservationRepricing.js:220` `dueQuery`, `projectId: {$ne: null}`) and reprices them (probe P6).
- **Release after the deadline.** Cancelling a project releases its reservation (`helpers/reservationRelease.js`: `projectId` → null), and this can happen days after the deadline (probe P5). A plain "deadline passed + no project" rule would then send a closing message days late.
- **No attach after the deadline.** An expired, unpaid reservation can't be attached to a project (`offerReservations.js:136`), so "closed, then used" can't happen.
- **Templates support optional sections:** `blocks` with `{html:'', text:''}` vanish from the message (probe P7; pattern at `emailDefinitions.js:323`).
- **Flags.** The reservation jobs run only with `OFFER_RESERVATION_JOBS_ENABLED=true` (`index.js:39`). Messages need `OFFER_RESERVATION_CONFIRMATIONS_ENABLED=true`, Reserve needs `OFFER_RESERVATIONS_ENABLED=true` (backend and website), and WhatsApp needs `ENABLE_WHATSAPP=true`. Their live values on Render are **not verified**. No new flag is added.

### Changes

| Place | Change |
|---|---|
| Website `src/lib/offers.ts` | `reservationHoldHours: z.number().int().min(1).max(720).optional()` |
| Website `offers-manager.tsx` | Field "Reservation lasts (hours)", empty = 72; remove "always 72 hours" from the Reserve-opens hint |
| Website `offer-reservation-rules.ts` | `reservationHoldHours(offer)` (invalid → 72) replaces `RESERVE_HOLD_HOURS`; `reserveCta` takes the hours; same in `page-content.tsx` (dialog, admin preview) |
| Backend `helpers/offerReservations.js` | One `holdHours(offer)` mirror (invalid → 72) used at `:119` and `:144` |
| Backend `models/offerReservationModel.js` | Closing-message state, e.g. `closureStatus` (`pending`, `sent`, `used`, `late`, `not-sent`, `failed`), plus `closureDecidedAt`, lock and next-attempt fields. Only reservations created after deploy get `pending`; older rows have no value and are never touched |
| Backend `emailDefinitions.js` + `emailCatalog.js` | `offer.reserved` text with `{{hours}}` and a `nextStep` block (customer: get the project started before the deadline or the offer expires; admin project: the project has started, pay the first bill before the deadline). New system action `offer.reservation.expired` with `{{offerTitle}}` and a required `{{offersLink}}` (`PORTFOLIO_WEBSITE_URL/offers`); add it to `SYSTEM_TRIGGERED` |
| Backend new `helpers/reservationClosure.js` | Called each minute next to `drainReservationConfirmations` (`index.js:40-42`). It decides once per reservation when its deadline (`extendedUntil` or `expiresAt`) has passed: project attached → `used`; deadline over 24 h ago → `late`; otherwise send `offer.reservation.expired` through `sendReservationMail` with dedupe key `offer-reservation-expired:<id>`. The decision is final, so a later release can't trigger it. Recheck at send time: still no project, account active, deadline still past |
| Backend `routes/autoReply.js` | `GET /api/auto-reply/reservations`: counts and running list for the box, admin-guarded like Final Message |
| Website `communication-hub.tsx` + new `reservation-panel.tsx` | Add the `reservation` panel (`PanelId`, `PANELS`, box line) through the existing `api/auto-reply` proxy |
| Portal `ReservedOffersPanel.js:40` | The toast says "The customer was emailed"; make it say the message was sent |

## Tests to write or update

- **Backend:**
  - hours frozen and taken from the offer, invalid → 72
  - start text for customer vs admin project
  - closing message: sent once, `used`, extension moves it, release after the deadline gives no message, older than 24 h → `late`, rows from before deploy untouched
  - channel default per audience, policy channel saved without wiping mode or template
  - an automatic send that can't go → `skipped` with the reason and no retry
  - subscription stays email
  - invoice link present and required
- **Existing suites:** these files expect today's email+copy behaviour or 72 hours and need updating: `tests/emailControl.test.js`, `finalMessage.test.js`, `offerReservations.test.js`, `planCheckoutPortal.test.js`, `planRequest.test.js`, `reservationRepricing.test.js`. Then run `npm run test:email`, `test:whatsapp`, `test:final-message`, `test:lead-status` and the reservation command list in `RESERVATION_AGENT_HANDOVER.md`.
- **Website:** `tests/offer-reservation-rules.test.ts`, `tests/offer-quote.test.ts`, `tests/offer-reservations.browser.mjs`, `npm run test:auto-reply`, `npx tsc --noEmit`.
- **Portal:** `tests/offer-reservations-browser.cjs`, `tests/portal-workspace-ui.browser.cjs`, `tests/reserved-offers-admin-browser.cjs`.
- **Real phone test after deploy,** with the owner's approval.

## Part C — Reminders and "Start my project" (owner decisions 7 Nov 2026)

### What the owner wants

- **Two reminders** while a reservation runs: one when 24 hours are left, one when 1 hour is left. Each shows the time left in words and the exact deadline, and links to the offer page.
- **"Start my project"** on the offer card, for a member or a client who reserved. The card's existing main button and the existing Reserve dialog are reused. No new UI section and no new field.
- **One confirm** sends two messages: the team gets the customer's details and the lead link, and the customer gets "we have received your request". Both go by Email + WhatsApp.
- **The clock stops** at the request and stays stopped until the team acts. A customer who asked is never sent "better luck next time" because the team was late.
- **The team ends the pause** with existing controls only:
  - **Create the project** on the reservation (existing project form, "Customer's reserved offer"). The countdown resumes for the first payment with the time that was left, never less than 24 hours.
  - **Extend deadline** (existing button) resumes the countdown from any future time. Shorter is allowed, e.g. 1 hour with reason "Customer declined", after which the closing message goes.
- After a resume, the customer may press Start again. Each request has its own messages.
- **A request nobody acts on** reminds the team once a day, at most 3 times.
- **Every step adds a follow-up line** on the person's one lead. The lead status never changes.
- **Defaults:** the reminders, the customer's start message and the closing message (`offer.reservation.expired`) default to Both. The team message is a team action (Both). All four new actions are system mail, so they are On from the start. Send via can change any of them.
- Reservations made before Part C ships get no reminders.

### Built (file → change)

| Place | Change |
|---|---|
| Backend `models/offerReservationModel.js` | `remindersEnabled`, `remindersSent` (`<stage>:<deadline ISO>`), `startRequestedAt`, `pausedRemainingMs`, `startRequests[]` (time left, notices, team alerts, how it ended) |
| Backend `helpers/offerReservations.js` | `isPaused`. View status `start_requested`. A paused row is never renewable. Attach on a paused row resumes with `max(time left, 24 h)` via `extendedUntil` + an extension entry. `extendReservation` on a paused row accepts any future time and clears the pause. New reservations get `remindersEnabled` |
| Backend `helpers/projectPricing.js` | A paused reservation can be selected after its old deadline |
| Backend `helpers/reservationClosure.js` | Never closes a paused row. The Reservation box lists paused rows first, with `startRequestedAt` |
| Backend new `helpers/reservationReminders.js` | 24 h / 1 h stages. A missed run sends only the latest stage. A stage is skipped when the countdown started within stage + 1 h |
| Backend new `helpers/reservationStart.js` | `requestProjectStart` (atomic against the closing job; a repeat click returns the saved request), `noteLead`, `deliverStartNotices`, `alertPendingStarts` |
| Backend `emailDefinitions.js` + `emailCatalog.js` | `offer.reservation.reminder`, `offer.reservation.lastHour`, `offer.start.request.admin` (team; daily "waiting N days" block), `offer.start.request.received`. Links: `<website>/offer/<slug>` |
| Backend `routes/offerReservations.js`, `index.js` | `POST /api/offer-reservations/:id/start`; the minute job also runs reminders, start notices and team alerts (same `OFFER_RESERVATION_JOBS_ENABLED` / `OFFER_RESERVATION_CONFIRMATIONS_ENABLED` flags) |
| Website `offer-reservation-rules.ts`, `offer-reservations.tsx`, `page-content.tsx` | Phase `requested`. The main button reads "Start my project · <time> left" (no project yet), then "Start requested · our team will contact you". The Reserve dialog shows the start text. My offers shows "Start requested" / "Paused" |
| Website `api/offer-reservations/[id]/start/route.ts`, `offer/[slug]/page.tsx` | Pass-through route. An archived offer's page sends a signed-in user to My offers instead of a 404 |
| Website `reservation-panel.tsx` | Paused rows: "Start requested · waiting …", "paused since …"; notes list the new templates |
| Portal `ReservedOffersPanel.js`, `AdminClientWorkspace.js`, `MyOffers.js` | Status "Start requested" + paused line; Extend form defaults to the resume time; the project form allows a paused reservation and says the countdown resumes; customer My offers shows the pause |

### Before deploy

- **Team recipients (pushed 7 Nov, backend only, backup `work57-team-contacts`):**
  - Every mail to the admins goes to each active admin's Admin → Settings: the contact email (else the login email) and up to two WhatsApp numbers. The rule is in `helpers/teamContacts.js` and applied in `emailController.js` `prepareMail`. The numbers come from `whatsappQueue.js` `teamPhoneRows` and `reviewDelivery.js`.
  - An admin without a number still gets the email.
  - Only while no admin has saved anything, the owner's fallback is used: `syncvap@gmail.com`, +91 92565 37003, +91 93563 93094.
  - `vacomputers.com@gmail.com` is no longer a team recipient.
  - `sendDeveloperAssignmentEmail` keeps its developer.
  - Tests: `npm run test:team-contacts` 5/5; full backend suite 798/798.
- A signed-out customer opening a reminder link sees the public card. After sign-in the card shows Start my project.
- The resume message is the existing "Offer reservation extended" text.
- Deploy the backend before the website and the portal.

## Out of scope

- The payment-due and reminder system. It runs separately. Note: `offerPaymentReminderCron` sits behind `ENABLE_CRONS`, which is off on Render.
- Any change to lead status.
- The dead actions listed in Part A.
