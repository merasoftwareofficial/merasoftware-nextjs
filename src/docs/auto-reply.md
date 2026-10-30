# WhatsApp Auto Reply — hand-over

**Doc rule:** update this file, without being asked, from the owner's decisions and from work actually done. Keep the current state, decisions, plan and essential traps only. Replace stale information instead of appending history. Questions and undecided ideas stay in chat.

**Repos,** under `E:\Allprojects`: `backend` (Express and the WhatsApp worker, Render), `frontend` (customer portal and its admin), `merasoftware` (website and its admin). Paths below are inside these.

## Where the work stands (30 Oct 2026)

**Step 1 is coded and tested locally, but not committed or deployed.** No reply is sent and no lead is made yet.

Next: the owner approves committing and deploying Step 1, then runs the real-number test under Plan → Step 1. Steps 2–4 come after that test.

- **Commit only Step 1's files.** Both repos also hold another session's uncommitted email-review work, such as `helpers/whatsappQueue.js`, `helpers/emailController.js` and `email-editor.tsx`.
- **Backend:** `whatsapp/src/inbound.js`, `autoReplyRules.js`, `models.js`, `whatsapp.js`, `index.js`, `whatsapp/tests/inbound.test.js`, `connection.test.js`, `helpers/autoReplyJobs.js`, `routes/autoReply.js`, `tests/autoReply.test.js`, root `index.js`, and only the `test:whatsapp` line of `package.json` (its `test:email` line belongs to the email-review work).
- **Website:** `src/app/admin/communication/auto-reply-panel.tsx`, `auto-reply.module.css`, `communication-hub.tsx`, `src/app/api/auto-reply/`, `tests/auto-reply.test.mjs`, `package.json`, this doc.
- **Rollback:** `backup\backend\work38-auto-reply-step1`, `backup\merasoftware\work53-auto-reply-step1`.

## What the owner wants

When someone replies to an ad on WhatsApp, the system recognises the message, replies by itself and saves that person as a lead for later targeting.

## Owner decisions

**Queue**
- The system never messages anyone directly. A detected message puts a reply into the existing WhatsApp queue. The reply waits its turn behind the messages ahead of it and goes out under the queue's own timing.
- No bypass of any kind: gap, typing and quiet hours all apply. A message that arrives at night gets its reply after quiet hours end.
- If a message goes to that person from our side before the auto reply's turn comes, the auto reply is not sent.

**Control**
- The first version answers **one specific message only**, the owner's ad message: `Hello! Can I get more info on this?` Short or general messages are never targeted, because an ad reply is very specific.
- The owner writes that message and its reply by hand, and can change them at any time. The reply starts as:

  ```
  Thanks for reaching out.

  ਸਾਡੀ post/video ਦੇਖ ਕੇ contact ਕਰਨ ਲਈ ਧੰਨਵਾਦ। Mera Software ਦੀ team ਜਲਦੀ ਹੀ ਤੁਹਾਡੇ ਨਾਲ ਗੱਲ ਕਰੇਗੀ।

  ਅਗਰ ਕੋਈ specific query ਹੈ, ਤਾਂ ਤੁਸੀਂ ਇੱਥੇ message drop ਕਰ ਸਕਦੇ ਹੋ।

  Best regards,
  Mera Software
  ```
- Recognising messages, sending replies and adding leads can each be switched On and Off whenever the owner wants. These switches affect Auto Reply only, not the rest of WhatsApp.
- It lives inside the Communication tab as a new **Auto Reply** box in the WhatsApp section, not on a separate page.

**Leads**
- A person added this way gets the status `Inquiry`, apart from Contacted, Positive, Negative and Won. This status is also the targeting group: no second list is kept.
- Only the phone number and basic details are saved: when they were added, which message caused it, and their WhatsApp profile name as a hint. The hint is never treated as the lead's real name.
- The admin updates the lead by hand. Filling in the name, with or without an email, moves the lead to Contacted. Until then it stays in this group.
- The admin can choose `Negative` without a name. Every other move out of `Inquiry` needs a name. The system never chooses `Negative` by itself.

## How it will work

1. **Rule:** one rule with the ad message, the reply and a name for the lead's details. An incoming message matches when it contains the whole ad message, ignoring case, extra spaces and punctuation, so `hello can i get more info on this` matches too. A single word or a part of the message never matches. The rule has no switches of its own; the three switches above it control it. It is stored so more rules could be added later, but the screen offers one.
2. **Worker** (`whatsapp/src/whatsapp.js`) listens to `messages.upsert`. It takes only text messages from other people, and only from a normal phone or LID chat (`isPnUser`, `isLidUser`). Everything else is ignored: groups, status, newsletters, bots and its own messages. It accepts both Baileys types: `notify` (live) and `append` (arrived while the worker was offline, for example during a deploy), and drops anything older than the queue's `maxAgeHours`. Messages stay unread on the phone, as today.
   Own messages are read for one purpose only: if the chat has an auto reply still waiting, or an inbox row not yet processed, that reply is cancelled with the reason shown in History. Nothing else about own messages is saved. The auto reply's own send can't cancel itself, because its row is already `sending`.
3. **No match:** nothing is saved. This number also carries the owner's other chats.
4. **Match:** the worker saves one inbox row, unique on the WhatsApp message id, so a restart or a repeat delivery can't count twice.
5. **Backend job**, every minute, processes inbox rows oldest first and one at a time, under a lock as in `broadcastJobs.js`. It runs only when `ENABLE_WHATSAPP=true`, with no new env switch. For each row it:
   - reads the switches and the rule as they stand now
   - checks whether the person is already known (below)
   - creates the lead, if adding leads is On
   - if sending is On, saves the reply text on the inbox row, then queues it with `enqueueWhatsApp`, using the inbox row's id as the queue row's `_id` (the pattern at `broadcastJobs.js:97`). One message can never queue two replies, even after a crash.
6. **`sender.js` does not change.** It stays the only code that talks to a chat. `tests/whatsappQueue.test.js` already fails if `sendMessage`, `transport.send` or `Queue.create` appears anywhere else.
7. **Results:** the job copies each reply's final queue status to its inbox row, because queue rows expire after 30 days. The box's counts come from the inbox and show replies really sent.

**"Already known"** is one helper that compares `normalizePhone` results against leads (including trashed ones, so a number the admin deleted isn't added back) and user accounts. With "Add to leads" off there is no lead to remember, so the inbox also blocks a second reply to the same number.

With all switches On:

| Who writes | Lead | Reply |
|---|---|---|
| New number, rule matches | New `Inquiry` lead | Yes |
| Same person again | Last-message time updated only | No |
| Already a lead in any status | Status unchanged | No |
| Existing client | Nothing changes | No |
| No rule matches | Nothing | No |

**Editing a rule:** a save applies to the next person. The queue row holds its own text, so a reply already waiting goes out with the old text.

**Switches (owner's decision):** the Auto Reply box has three switches, so the owner chooses exactly what to turn off.

| Switch | When Off |
|---|---|
| **Recognise messages** | Incoming messages are not matched or saved. Replies and leads stop with it, waiting replies are cancelled as below, and the other two switches show as inactive |
| **Send replies** | Messages are still recognised and leads still made, but nothing enters the queue. Replies already waiting in the queue are cancelled, with the reason shown in History |
| **Add to leads** | Messages are still recognised and replies still go, but no lead is made. Existing leads are not touched |

- Cancelling changes only rows still `pending`, the same compare-and-set as `broadcastJobs.js:24`, so a reply the sender has already claimed is not touched.
- Turning a switch back On affects new messages only. What it would have done while Off is never done later. A person who became a lead while "Send replies" was Off is already known, so writing again gets no reply either.
- The job always closes an inbox row, following the switches as they stand when it reaches the row. Rows therefore can't pile up and act later.
- These switches control Auto Reply only. Email copies, proposal messages, Broadcast, the connection and the queue carry on. The queue's Pause is separate and stops every WhatsApp message.
- All three start Off, so deploying changes nothing. The worker reads them, and the rules, for every message.
- They are stored in their own `autoReply` field on `whatsapp_state`, never inside `settings`: saving Sending rules replaces `settings` with its known keys only, which would silently wipe them (tested).

## Plan

Each step ends with the owner's check. Back up first in `E:\Allprojects\backup\<repo>\workNN`.

1. **Detection only.** Rule model, the three switches, worker listener, inbox, a backend job that only closes rows, a minimal admin box showing what was detected. Only "Recognise messages" is turned On, so nothing is sent and no lead is made, and test rows can't act later. Test on the real number:
   - a real ad message: do the number and text arrive correctly?
   - does the ad marker (`contextInfo.externalAdReply`, `ctwaClid`, `conversionSource`) arrive? If it does, "only from ads" can become an option.
   - a message sent while the worker restarts: does it arrive as `append`?
2. **Leads.** `Inquiry` status, the name rule, inquiry details on the lead including the profile-name hint, one phone-matching helper, the job creating leads, moving to Contacted on saving a name, and every fix listed under "Lead paths". The portal's Leads list shows the number for a nameless lead instead of "N/A" (`AdminLeadsPage.js:576`).
3. **Reply.** The job queues the reply through `enqueueWhatsApp`; turning switches off cancels waiting replies. Full Auto Reply box: the ad message, the reply editor, switches, counts. Queue History shows an "Auto reply" label from the row's `event`. Check on a real phone that the reply lands in the same chat, including a LID chat, and that a message typed from the owner's phone cancels a waiting reply.
4. **Targeting.** Add `Inquiry` to `GROUPS` in `helpers/broadcastAudience.js`. A Broadcast message that uses the name field skips recipients with no name, in both the count and the send, and shows how many were skipped. One rule for every group, because `Negative` leads can be nameless too. Sending needs `BROADCAST_JOBS_ENABLED=true` on Render; this is not confirmed yet.

## Lead paths that must change

`Inquiry` is set only by the system, like `Won`: it stays out of `SELECTABLE_LEAD_STATUSES`. The portal's filter and follow-up dropdown already build from these lists.

| Path | Today | Change |
|---|---|---|
| `models/leadModel.js` | `name` always required | Required except in a new `NAME_OPTIONAL_STATUSES` (`Inquiry`, `Negative`) in `helpers/leadStatuses.js`. The rule sits in the schema, so every save obeys it |
| `updateLead.js`, `followUp` and `editFollowUp` | Both change status with no name check | Any move to a status that needs a name, from `Inquiry` or from a nameless `Negative`, returns one readable error asking for the name. The schema already blocks it (tested); this replaces Mongoose's raw message |
| `updateLead.js`, `editDetails` | Never changes status | Saving a name on an `Inquiry` lead moves it to Contacted |
| `helpers/wonLead.js` | Sets `Won` on the open lead found by phone, then saves | Fill the name from the account first. Otherwise the save fails, the error is only logged, and the client never gets a `Won` lead |
| `convertLead.js` | No name check; `lead.save()` runs after the client account is made | Refuse early when the name is empty, so no half-finished conversion is left |
| `planRequest.js:153` | Finds open leads by exact phone; `addToLead` adds a note only | Add `Inquiry` to `OPEN_LEAD_STATUSES`; an `Inquiry` lead takes the form's name and email and moves to Contacted |
| `createLead.js:60`, `updateLead.js:230` | Duplicate check on exact phone text | Use the shared phone helper, so a typed `98765…` matches a saved `+9198765…` |
| Proposal upload and message | Uses `lead.name` | Ask for the name first, so no message goes out with a blank name |

## Where the changes go

| Part | Place |
|---|---|
| Listener and rule matching | `whatsapp/src/whatsapp.js`, new `whatsapp/src/inbound.js` |
| Rule and inbox schemas | `whatsapp/src/models.js`, the worker's contract with the backend |
| Backend job | New `helpers/autoReplyJobs.js`, cron in `index.js` like Broadcast |
| Admin routes | New `routes/autoReply.js` at `/api/auto-reply`, guarded by `middleware/communicationAdmin` |
| Reply text | Reuse Broadcast's `EmailEditor` and `helpers/broadcastContent.js`, with the allowed fields passed in rather than a second codec |
| Status | `helpers/leadStatuses.js` (backend) and `src/helpers/leadStatuses.js` (portal), these two only |
| Lead fields | `models/leadModel.js`, `controller/lead/updateLead.js`, `convertLead.js` |
| Website box | New panel in `src/app/admin/communication/communication-hub.tsx` (`PANELS`, `PanelId`, `BOX_LINES`, `whatsappParts`), new proxy `src/app/api/auto-reply/` |

## Traps

- **The name field prints blank.** `render` with an empty name gives `"Hi , thanks"` (tested). `broadcastContent.js` hardcodes its fields today, so the reply editor must offer no name field and the backend must refuse one. For Broadcast, see Step 4.
- **The message must stay specific.** This number has other chats, so the screen refuses an ad message under 20 characters. The current one has 35.
- **This text may be a common default.** If it isn't unique to one ad, every ad using it gets the same reply and is recorded the same way. Step 1 shows what really arrives.
- **The chat's id may not be the phone number.** WhatsApp can identify a chat by a LID instead. The system finds the real number with `key.remoteJidAlt` and `getPNForLID` (Baileys 7.0.0-rc14), which isn't proven on a real ad message yet. If no real number is found, make no lead, send no reply and show it as needing attention. A 15-digit LID passes the queue's number check (tested), so never use a LID's digits as a phone.
- **Store phones as `+` and digits,** the format `parsePhone` produces and `planRequest.js` matches on. `normalizePhone('14155552671')` returns null (tested), so a foreign number without `+` would be unusable.
- **Filter on the message's age, not only its type.** Baileys also uses `append` outside offline delivery (`messages-recv.js:346`, `:1257`) and can repeat a message as `notify` on a placeholder resend (`process-message.js:352`); the age limit and the unique message id cover these. `messageTimestamp` can be a number or a `Long`, so convert it before comparing.
- **Queue order is oldest first.** Reply rows have no `broadcastRecipientId`, so `broadcastJobs.js` treats them as service messages and holds the next Broadcast row while they wait.
- **A reply waiting past `maxAgeHours` (24) expires** if the queue is paused or WhatsApp is offline. The lead stays and the reply doesn't go.

## Tests

State on 30 Oct, after Step 1: backend `npm run test:whatsapp` passes 86 of 86, `npm run test:lead-status` 41 of 41; website `npm run test:auto-reply` 2 of 2, `test:broadcast` 2 of 2, `test:whatsapp` 10 of 10. Only the tests for Step 1 exist so far; the list below covers all the steps. `tests/leadStatuses.test.js:32-34` checks the status lists exactly and must be updated for `Inquiry`.

Added to `npm run test:whatsapp`, using the real sender:
- message filter (groups, status, own messages, repeats, `notify` and `append`, too old) and rule matching
- every row of the "who writes" table, including trashed leads and "Add to leads" off
- a part of the ad message or a short message never matches; the full message with different case, spacing or punctuation does
- every row of the "Lead paths" table, including a nameless lead whose number signs in as a client
- a switch turned Off between the inbox save and the job; "Send replies" turned Off cancels waiting replies
- one message gives one reply, including after a restart
- a message from our side cancels a waiting reply and an unprocessed inbox row, and only for that chat; the auto reply's own send doesn't cancel itself
- replies wait their turn behind older rows and respect gap and quiet hours
- each of the three switches alone; with all three Off, every other WhatsApp message still goes; saving or resetting Sending rules leaves the switches as they were
- a Broadcast using the name field skips nameless leads, in the count and the send
- nothing saved when no rule matches
- `sender.js` unchanged; existing `test:lead-status` and `test:broadcast` still pass

Real-phone testing needs the owner's go-ahead.
