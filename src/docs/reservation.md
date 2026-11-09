# Offer reservations: hand-over for the next agent

Last updated 8 Nov 2026. Read this file first, before code or other docs. Everything here was checked against the code, the tests or the production data (read-only) on that date. Re-check anything time-dependent (data, deploys, flags) before you rely on it.

## 0. Start here: what is needed now

**Nothing is left to build on your own initiative.** The reservation system (stages, four reminders, short texts) is built, tested, pushed and live (§3). What remains are owner decisions and owner-approved steps. Do not start any of them without the owner's explicit go for that item (§1.1).

| # | Item | Status | Who acts | Your next step when the owner asks |
|---|---|---|---|---|
| 1 | Lazy/Tough leads → Not Now (4 leads) | Waiting for the owner | Owner runs it, or gives the agent permission | §8.1: dry run, show the result, apply only on a go |
| 2 | Nishan Singh: client behaviour Positive → Neutral | Waiting for the owner | Owner, in the portal | Nothing to code |
| 3 | Alternate numbers: should reservation messages also reach `lead.altPhone`? | **Not decided** | Owner chooses way 1 or 2 (§6) | Explain §6 again if asked; never build a new alternate path |
| 4 | Tejinderpal Singh's main number (+91 78377 18100 now; +91 73553 18100 is his alternate) | Not decided | Owner | Only if the owner picks way 2 in §6 |
| 5 | Member with an empty name + nameless Inquiry lead cannot reserve | Known pre-existing bug, not fixed | Owner decides whether to fix | Plan → verify → report → approval (§8.4) |
| 6 | Old docs still say "the lead's status never changes" | Waiting for the owner's "perfect" | Agent, after "perfect" | §8.5 |

**Do not:** push this file (the owner said so on 8 Nov); change how a reservation works (countdown, start request, project, payment, price lock); add per-reservation alternate-number logic; touch other old reservations without a go (§7); run production writes without a backup, a dry run and a guarded filter.

Related, older docs (background only; this file wins where they differ): [reservation-countdown.md](reservation-countdown.md) (Parts A–C: Send via, hours per offer, start/closing messages, reminders, Start my project), [RESERVATION_AGENT_HANDOVER.md](RESERVATION_AGENT_HANDOVER.md) (money rules: price lock, repricing, payments), [not-now-stage-plan.md](not-now-stage-plan.md), [offer-target.md](offer-target.md).

---

## 1. How to work with this owner (read before doing anything)

These rules come from real corrections in the 8 Nov session. Breaking them cost the owner time.

1. **Plan → verify → report → wait for approval → code.** Answers such as "haan, sahi hai", "bilkul sahi hai" or "jo sahi lage vo karo" settle a decision; they are **not** permission to code. Code only after the owner explicitly approves the verified report ("code likho", "start working", "fix karo"). The owner stopped work twice on 8 Nov for this.
2. **Verify a plan with real checks, not by reading alone.** Run greps over every consumer, run the existing tests for a baseline, read production data (read-only), and prove a theory with a small probe test (in-memory MongoDB). Repeat passes until a pass finds nothing new, then report.
3. **Change only what was asked.** Stage/lead logic changes must not change core working (conversion, project creation, reservation money rules, payments). If a change touches core behaviour, say so and ask.
4. **Never assume; report evidence** (file + function, test output, data count).
5. **Replies to the owner in Hinglish, short.** UI text, code, comments and docs in English.
6. **Backups before any file change**, outside the repos: `E:\Allprojects\backup\<repo>\workNN-<topic>` (next free numbers on 8 Nov: backend work63, frontend work65, merasoftware work86).
7. **Production writes only with the owner's explicit go**, with a backup of the touched records first, a dry run first, and a guard (filter on the exact current state) on every write.
8. **Push**: the owner asked for pushes after finished code work. Commit only your own files: the website repo has another session's uncommitted `offer.md` and `src/docs/package-and-offer.md` — never stage them. This hand-over file stays uncommitted unless the owner asks.
9. On Windows, do not use `sed -i` (it turns CRLF into LF). Edit with the editor tool or a small Node script that keeps the line endings. Long heredocs in Git Bash sometimes fail on quotes: write a script file and run it instead.

## 2. Repos and where things live

Under `E:\Allprojects`:

| Repo | What | Deploy |
|---|---|---|
| `backend` | Express + Mongoose API, all business logic, the WhatsApp worker, the minute jobs | Render, auto-deploys from `main` |
| `merasoftware` | Next.js website and the website admin (Offers, Offer Targets, Communication, Email Templates) | Vercel |
| `frontend` | React customer portal and portal admin (Leads, client workspace, Reserved offers) | — |

Owner rule: logic lives in the backend; website and portal only show it. One SSOT list per concept (stage lists are in `backend/helpers/leadStatuses.js`; the portal keeps a display copy in `frontend/src/helpers/leadStatuses.js`; the website panel reads the lists from the backend API).

Production portal database: `merasoftware-db` (Atlas). Its URI is in `backend/.env.portfolio.local`. The backend's own `.env` points at an empty dev database, so local tests never touch production. Read-only scripts against production are allowed; the Claude Code permission check blocks running migration scripts there ("Production Deploy") — then give the owner the exact command or ask for permission.

## 3. Current state (8 Nov 2026)

All of this is committed and pushed to `main` in all three repos.

| Work | Backend | Portal | Website |
|---|---|---|---|
| Stage cleanup (phase 1) | `cb13bfb` | `794aee8` | `136ba1f` |
| Reservation stage + four reminders (phase 2) | `189eeec` | `00c7f9c` | `fc7c114` |

**The new backend is live on Render**: on 8 Nov at 1:39 pm IST production sent an `offer.reservation.sixHours` reminder, which only the new code has.

Tests at that commit: backend full suite 836/836 (`node --test --test-concurrency=3 tests/*.test.js whatsapp/tests/*.test.js`; without the concurrency limit files fail on this PC from load, not from the code). Website: `npx tsc --noEmit`, eslint on the panel, `node --test tests/offer-targets.test.mjs`, `tests/offer-reservations.browser.mjs`, `tests/communication-live.browser.mjs`. Portal: `node tests/lead-offers-browser.cjs`, `lead-proposals-browser.cjs`, `admin-cache-browser.cjs`, `portal-workspace-ui.browser.cjs`, `reserved-offers-admin-browser.cjs`.

Rollback copies of every changed file: backend `work61-stage-cleanup`, `work62-reservation-stages`; frontend `work63-stage-cleanup`, `work64-reservation-stages`; merasoftware `work84-stage-cleanup`, `work85-reservation-stages` (all under `E:\Allprojects\backup\`).

## 4. The stage model (owner decision 8 Nov 2026)

Three layers, each with one job. All lists are in `backend/helpers/leadStatuses.js`.

1. **Lead stage** (`lead.status`) — how a new person moves towards becoming a client:
   `Inquiry → Neutral (stored "Contacted") → Positive → Reservation → Matured (stored "Won")`, exits `Not Now ("NotNow")`, `Negative → Dead`, `Wrong`.
   - System-only: `Inquiry` (WhatsApp Auto Reply; a nameless Dead lead coming back), `Reservation` (while an offer reservation runs), `Won` (only through Convert).
   - `Active`, `Lazy`, `Tough` stay valid for stored data and old follow-up badges but can't be chosen (Active = Positive now).
   - A lead needs a name except in `NAME_OPTIONAL_STATUSES` (Inquiry, Reservation, NotNow, Negative, Dead, Wrong). This is enforced by `models/leadModel.js`.
2. **Client behaviour** (`lead.clientBehaviour` on the client's Won lead) — only "may we market to this client?": Neutral (no value = Neutral), Not Now, Unhappy, Negative (final message countdown), Dead (never). Broadcast's Matured group reaches Neutral clients only (`broadcastAudience.js` `groupQuery`, `MARKETABLE_CLIENT_BEHAVIOURS`). Older values (Positive, Active, Inquiry) stay valid until changed but can't be chosen. Convert maps lead stage → behaviour with `behaviourFromStatus`: Not Now, Unhappy, Negative carry over, everything else is Neutral.
3. **Offer stage** (`offerTarget.stage`, one row per lead + offer, unique) — selling one offer: `Neutral, Positive, Reservation, Not Now, Negative, Matured ("Won")`. Admin can choose Neutral/Positive/Negative; Reservation and Not Now are set only by the reservation; Matured by "Bought this offer" or a project made on the reservation. A follow-up note on an offer may keep its current stage, including Reservation/Not Now (`controller/lead/updateLead.js`).

A Dead lead or client who writes after the closure message comes back as Neutral (a lead with no confirmed name as Inquiry, because Neutral needs a name) — `helpers/finalMessageComeback.js`, same rule as `autoReplyJobs.js` and `leadPhone.js` `clearClientDead`.

## 5. How a reservation works now

The offer's own setting **"Reservation lasts (hours)"** (`reservationHoldHours`, 1–720, empty = 72; website `src/lib/offers.ts`) is the only source of time. At reserve time the deadline is frozen on the reservation (`helpers/offerReservations.js` `holdHours`, `expiresAt`); `deadlineOf(row)` = `extendedUntil || expiresAt` drives every message, reminder and expiry. Changing the offer later never moves a running reservation.

### Flow

| Step | Code | What happens |
|---|---|---|
| Reserve | `offerReservations.js` `reserveOffer` (one transaction) | Member: their one lead is found or made (`personLead.js` `linkPersonLead`; phone is identity). Reservation row with `closureStatus: 'pending'`, `remindersEnabled: true`. Then `reservationStage.js` `onReserved`: a lead (not a client) goes to **Reservation** whatever its stage (Wrong included, owner rule), the offer stage goes to Reservation, one follow-up line. A client keeps its behaviour; only the offer stage and a line (with `offerSlug`). After the commit `finalMessageCycle.reconcileCycle` runs for a lead that moved off Negative/Dead. |
| Starter message | `offerReservationConfirmation.js` → `offer.reserved` | Name, offer, start, duration, end, next step, My offers link. Default route: WhatsApp only. |
| Reminders | `reservationReminders.js` `sendDueReminders` (minute job) | See below. |
| Start my project | `reservationStart.js` | Clock pauses (`startRequestedAt`); customer and team told; no reminder or closing while paused; team acts by creating the project or Extend deadline. Unchanged by the 8 Nov work. |
| Convert (admin button) | `controller/lead/convertLead.js` | Lead → Matured (Won), member account → customer. Blocks only Dead and Wrong leads. Resets the password on purpose (signup never verifies email). A project can only be made for a client: the portal's create-project lives in the client workspace, whose list is `roles: customer`. |
| Project on the reservation | `offerReservations.js` `attachProjectReservation` → `reservationStage.js` `onProjectAttached` | Offer stage → Matured with `boughtAt`, line "Bought …: a project was created on the reservation." Also for an admin-created offer project. |
| Deadline, no project | `reservationClosure.js` `closeDueReservations` → `decide`, then `onExpired` | Closing message `offer.reservation.expired` once. Then the offer stage Reservation → Not Now, and the lead Reservation → Not Now unless another of the person's reservations still runs. Only moves from Reservation, so a stage the admin chose is never overwritten. No Not Now review popup (that opens only from an admin follow-up). A failure in the stage step is logged and never undoes the closing decision. |

### Reminders (`reservationReminders.js`)

| Action | When | Rule |
|---|---|---|
| `offer.reservation.dayPassed` | first 24 hours over | once per reservation; only on the original countdown (no extension, no start request); only while more than 25 hours are left |
| `offer.reservation.reminder` | 24 hours left | |
| `offer.reservation.sixHours` | 6 hours left | |
| `offer.reservation.lastHour` | 1 hour left | |

Shared rules: one key per stage and deadline in `remindersSent` (`"6h:<ISO>"`), so an extension gets fresh reminders and a deadline never gets one twice; a missed run sends only the latest stage; a stage is skipped when the countdown started within stage + 1 h; nothing while paused, after a project or a locked price. **Only rows with `remindersEnabled: true` get reminders; only rows with `closureStatus: 'pending'` get the closing message.** Both switches are set at creation since Part B (5 Nov, closing) and Part C (7 Nov, reminders); older rows have neither.

Which reminders a hold gets: 72 h+ → all four; 48 h → 24 h left, 6 h, 1 h; 24 h → 6 h, 1 h; 6 h → 1 h; 2 h or less → none (starter and closing only).

### Messages and templates

- Definitions: `backend/helpers/emailDefinitions.js`; catalog (labels, trigger, audience, default route): `backend/helpers/emailCatalog.js`. All reservation actions are system mail (`SYSTEM_TRIGGERED`). The four reminders, the closing and the start-request receipt default to **Both** (`CUSTOMER_BOTH`); the starter defaults to WhatsApp only. The admin changes the route per action in Email Templates ("Send via", `EmailPolicy.channel`); a system message uses the action's Send via and its default template.
- Texts were shortened on 8 Nov (owner approved them; the price is left out). Each Standard template is an editable DB copy (`emailTemplates.js` `systemTemplate`). `replaces` moves only an **unedited** older Standard copy to the new wording; an edited copy is never touched. Production's `offer.reserved` Standard still held the reservation part 2 wording ("valid for 72 hours", git `b0a2a7b`/`beab9f4`); it is now in `replaces` and was checked to match exactly, so it moves on first use.
- WhatsApp strips `**bold**` markup: test WhatsApp text without `**`.
- Every send goes through `emailController.js` `sendReservationMail` → `sendSystemMail` → `reviewDelivery.js` `deliver` (dedupe key per message, so a retry never sends twice).

### Jobs and flags (backend `index.js`)

The minute job runs only with `OFFER_RESERVATION_JOBS_ENABLED=true`: confirmations, repricing, closure, reminders, start notices, team alerts, package start. Messages need `OFFER_RESERVATION_CONFIRMATIONS_ENABLED=true`, Reserve needs `OFFER_RESERVATIONS_ENABLED=true` (backend and website), WhatsApp needs `ENABLE_WHATSAPP=true`. Evidence they are on in production: starter messages, team start alerts and the 8 Nov six-hours reminder were all sent. `ENABLE_CRONS` (renewals, `offerPaymentReminderCron`) is a separate switch and is off.

## 6. Alternate numbers (open owner decision)

**Fact (code):** every reservation message goes through `reviewDelivery.js` `deliver`, which calls `contactNumbers.js` `withAltNumbers`. When `ALT_PHONE_SENDING_ENABLED=true`, each recipient's lead alternate number (`lead.altPhone`) also gets a WhatsApp copy. For a member the lead is found by `reservationUserId`, for a client by `wonLead.clientLeadFor`. Security messages (`sendClientAccountCreatedEmail`, `auth.otp`) never go to an alternate; marketing events skip a blocked alternate (Dead, Wrong, another person's countdown). The WhatsApp sender also drops `alt` rows while the switch is off (`whatsapp/src/sender.js`).

**Fact (production, 8 Nov):** the switch is **off** — the six-hours reminder to Tejinderpal Singh queued one WhatsApp row only.

**How a member gets an alternate number:** a person first writes on WhatsApp (Auto Reply makes an Inquiry lead with that number), then signs up or reserves with another phone. `personLead.js` keeps one lead: the account's phone becomes the main number and the WhatsApp number moves to `altPhone`. From then on messages go to the account's number only, unless the switch is on.

**The two ways, for the owner to choose (not decided yet; do nothing until the owner picks one):**
1. Turn on `ALT_PHONE_SENDING_ENABLED=true` in Render's backend environment. System-wide: every lead or client with an alternate number gets copies of every non-security message (reservation, Broadcast, final message, Send message, project messages). No code change; check the WhatsApp volume and the Sending rules hours first.
2. Change one person's main number (account `user.phone` and lead `phone`, the old one to `altPhone`), only for that person. Production write: backup, dry run, guarded update, owner's go. Keep the client's lead in sync (`wonLead.js` `syncClientLeads` does this for clients).

Either way, do not build per-reservation alternate logic: the SSOT is `withAltNumbers`.

## 7. Production data facts (read-only, 8 Nov 2026 ~1:30 pm IST; they age — re-check before acting)

- 15 customers, each with exactly one Won lead; 4 members; 1 admin. Leads live: Dead 33, Won 21, Neutral 18, Negative 8, Lazy 3, Wrong 3, Positive 2, Tough 1, Not Now 1, Inquiry 1 (before phase 2 moved Tejinderpal to Reservation). 0 Broadcasts, 0 offer targets before 8 Nov.
- Old reservations: none had `remindersEnabled`; Tejinderpal's had no `closureStatus` either. On the owner's request Tejinderpal Singh's reservation `6aec8bc801d8079ddbd73c8f` was brought into the system on 8 Nov (both switches on, then `onReserved`: lead Positive → Reservation, offer stage Reservation). Backup: `E:\Allprojects\backup\backend\tejinderpal-reservation-8nov.json`. His account and lead main number is +91 78377 18100; his first WhatsApp number +91 73553 18100 is the lead's alternate (see §6).
- Pooja (member), Nishan Singh and Gaurav Vaid (clients) reserved before Part C: no reminders, but the closing message goes at their deadlines (8 Nov 11:38 pm, 9 Nov 11:08 am, 9 Nov 6:22 pm IST) unless a project is made. Their stages don't change (no Reservation stage was set). Jasmeet Kaur's is paused (start requested) until the team acts.

## 8. Open items (owner's go needed for each)

1. **Lazy/Tough migration** (phase 1): Gurpreet Singh, Dr. Neelam, Surinderpal Singh (Lazy) and Pooja (Tough) → Not Now. None has a running final message cycle (checked by lead and by phone). Use the existing `backend/scripts/migrateNotNow.js` — dry run by default; apply needs `--apply --maintenance --backup <new file>`; it guards each write on `updatedAt` and re-checks cycles. It was blocked for the agent by the permission check: give the owner the command (with `MONGODB_URI` set to `merasoftware-db`) or ask for permission.
2. **Nishan Singh**'s client behaviour is still Positive: the owner sets it to Neutral in the portal (existing path, revision-guarded, timeline line).
3. **Alternate number** decision (§6), and whether Tejinderpal's main number should be +91 73553 18100.
4. **Pre-existing bug, not fixed (out of scope so far):** a member whose account name is empty, reserving with a phone that already has a nameless Inquiry lead, fails with "lead validation failed: name" — `personLead.js` `takeOver` moves Inquiry → Contacted, which needs a name. Reproduced on the code before the 8 Nov changes too. Possible directions (not discussed with the owner, not approved): let `takeOver` keep Inquiry when no name is known, or take the email as the name, as a new lead does (`personLead.js` case 7). Plan, verify and get approval first.
5. Docs: [reservation-countdown.md](reservation-countdown.md) still says "the lead's status is not changed by any of this" (its sections "Owner decisions", Part C, "Out of scope"); [not-now-stage-plan.md](not-now-stage-plan.md) still says "Reserved is a separate later task"; [offer-target.md](offer-target.md) predates the three layers. Update them with before/after and code locations after the owner's "perfect".

## 9. Mistakes made on 8 Nov, so you don't repeat them

- Started coding twice after a decision answer instead of an approval. → Rule §1.1.
- Wrote "add Reservation to `OPEN_LEAD_STATUSES` to avoid duplicate leads": wrong. That list is used only by `controller/lead/customerProjectRequest.js`; duplicates are prevented by `personLead.js`/`leadPhone.js` `findPersonLead`, which ignores the stage. → grep every consumer before claiming why a list matters.
- Proposed auto-converting a member when a project is made: impossible by design — a project can only be made for a client, after Convert. → Read the flow end to end (UI entry point included) before proposing.
- Proposed "no password reset" on conversion: the reset is a deliberate security rule (`clientAccount.js` `upgradeMemberToClient`). → Look for the comment explaining a rule before calling it a problem.
- Moving a Dead lead to Neutral without a name breaks its next save (proved by a probe). → Check model validation for every status you set.
- An offer stage only the system sets blocked the admin's notes until `updateLead.js` allowed keeping the current stage. → Check every place that validates a value you add.
- Assumed the production Standard template was owner-edited; it was an old code wording missing from `replaces`. → `git log -S "<text>"` before deciding.

## 10. Useful commands

- Backend focused suites: `npm run test:reservation-reminders`, `npm run test:reservation-countdown`, `npm run test:offer-targets`, `npm run test:lead-status`, `npm run test:final-message`, `npm run test:email`, and `node --test tests/offerReservations.test.js`.
- Test harness for reservations: `tests/reservationReminders.test.js` (in-memory replica set, fake email provider, real WhatsApp queue rows; `age(ms)` moves the first reservation's times back; `projectOn(id)` creates a project on a reservation).
- Read-only production check pattern: a small Node script that loads `MONGODB_URI` from `backend/.env.portfolio.local` with `dotenv.parse`, uses only `find`/`countDocuments`/`aggregate`, and never prints the URI. Collections: `offerreservations`, `leads`, `users`, `offertargets`, `emailtemplates`, `emailpolicies`, `emailhistories`, `emaildrafts`, `whatsapp_queue`, `whatsapp_final_messages`.
