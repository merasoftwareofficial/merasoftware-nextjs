# Offer Target — working plan

**Doc rule:** this is the single plan for lead categories, client behaviour, the do-not-disturb rule and offer targeting. Keep owner decisions, current state and next steps only. Replace stale information; questions stay in chat.

**Repos,** under `E:\Allprojects`: `backend` (Express, Render), `frontend` (portal and its admin), `merasoftware` (website and its admin).

## Current state (31 Oct 2026)

Steps 1, 2 and 3 are built and tested locally, awaiting the owner's review. Nothing is committed or deployed. Step 4 waits for the Broadcast deploy. Rollback: `backup\backend\work44-offer-target`, `backup\frontend\work38-offer-target`, `backup\merasoftware\work59-offer-target`; new files had no earlier version.

## Owner's goal

Sell again to existing clients and to leads, offer by offer. Each person stays one person with one lead, each offer has its own stage and follow-ups, and Broadcast can choose people by category. A Dead person is never disturbed.

## Single source for each thing

| Thing | One source | Never |
|---|---|---|
| Person's pipeline | The one `lead` record | A second lead per offer, or a separate campaign pipeline |
| Lead stage | `lead.status`; values in `backend/helpers/leadStatuses.js`, labels in `frontend/src/helpers/leadStatuses.js` | Status lists written elsewhere |
| Client category | `lead.clientBehaviour` on the client's `Won` lead | Changing the `Won` status |
| Offer content | Website offers, read through `helpers/websiteOffers.js`; the target keeps the slug and title | A copied offer catalogue |
| Offer stage | One `offerTarget` row per lead and offer | Using `lead.status` for an offer |
| Follow-ups | `lead.followUps`, with an optional `offerSlug` | A second timeline collection |
| May we market to this person? | One new helper, `helpers/leadContactBlock.js` | A separate check in each feature |
| Sending | Existing review popup, `enqueueWhatsApp` and `sender.js` | A new sender or direct queue insert |

## Categories

| Category | Stored value | Lead | Client | Marketing |
|---|---|---|---|---|
| Neutral | `Contacted` | Yes | Yes | Yes |
| Positive | `Positive` | Yes | Yes | Yes |
| Active | `Active` | Yes | Yes | Yes |
| Lazy | `Lazy` | Yes | Yes | Yes |
| Tough | `Tough` | Yes | Yes | Yes |
| Negative | `Negative` | Yes | Yes | Yes |
| Unhappy | `Unhappy` | Yes | Yes | Yes, with a warning when chosen |
| Dead | `Dead` | Yes | Yes | No |
| Wrong | `Wrong` | Yes | No | No |

- `Inquiry` and `Won` (shown as Matured) stay system-set.
- `Contacted` is only relabelled, as `Won` is shown as Matured. No production migration.
- Existing clients stay as they are: nothing is changed or backfilled. A client with no `clientBehaviour` counts as Neutral, and the team moves clients into categories, such as Unhappy, as the work goes on.
- Each person has one category at a time, chosen by the admin. Every change appears on the timeline.

## Rules

**Offer stage:** Neutral, Positive, Negative or Matured. It never changes the lead's category, and a person's stage in one offer never changes another offer.

**Do not disturb, for the whole person by phone number:**
- Blocked: `Dead`, `Wrong`, a client with behaviour Dead, a Final Message from the moment the admin presses Send until it resolves, and a real reply waiting in Needs decision. A trashed Dead or Wrong lead still counts. A client's own project request lead doesn't: only the client's behaviour decides for a client.
- The Final Message row stays `review` until its job runs, so Send is read from the draft and queue row, not from the row's status alone. The countdown counts only while the lead is still `Negative`. The Final Message itself is never stopped by its own block.
- Blocked from: Broadcast count and release, Add people, Send message, and the proposal message. A proposal file still saves.
- Not blocked: service messages for projects, invoices and payments, and Auto Reply answering someone who wrote first.
- During the countdown the stage stays `Negative` and the lead shows "Final message: countdown". Only no reply makes it `Dead`.

**Leaving the block:**

| Event | Result |
|---|---|
| Listed word such as "ok", emoji or reaction | Stays blocked |
| Real reply, voice or photo | Needs decision; stays blocked until the admin decides |
| Admin chooses Interested or Keep Negative | Block ends |
| Person writes from an ad, or sends a website or portal request | Dead lead returns to Neutral; a client's Dead behaviour returns to Neutral |
| Admin changes the stage | Block ends |
| Don't Send, or the message fails | Block ends |
| Wrong lead makes contact | Timeline note only; stays Wrong until the admin changes it |

**Becoming a client:** the lead's category carries over as behaviour. Dead or Wrong can't use Convert until the admin changes the stage. Sign-in and role paths that make a client never block: they set Neutral.

**Open requests:** a new request joins a Neutral, Positive, Active, Lazy, Tough or Unhappy lead instead of creating a second lead.

**Proposal Sent group:** badge plus Neutral, Positive, Active, Lazy or Tough.

## Build steps

### Step 1: Categories

- `leadStatuses.js` in backend and frontend: new values, labels, selectable list and open list.
- `models/leadModel.js`: `clientBehaviour`.
- `controller/lead/updateLead.js`: a new action saves behaviour, because a client's lead allows only follow-up actions today. Wrong is refused on a client's lead, a client's own request lead, and a number held by a client.
- `controller/lead/convertLead.js`, `helpers/wonLead.js`: carry the category over, read before the status becomes `Won`; block Dead and Wrong on Convert.
- `helpers/broadcastAudience.js`: new stages join the groups so a lead doesn't drop out when its stage changes, except Dead and Wrong; Contacted shows as Neutral; Proposal Sent group by the list above.
- `controller/lead/planRequest.js`, `customerProjectRequest.js`: open list; a request brings a Dead person back.
- `helpers/autoReplyJobs.js`: an ad message returns a client's Dead behaviour to Neutral.
- `controller/user/myReferredLeads.js`, `frontend/src/pages/MyReferredLeadsPage.js`: a client who referred someone sees that lead's status today. The backend sends only In progress, Matured or Closed (Negative, Dead, Wrong), so internal categories never reach a client.
- Portal lead page and Leads list: new stages, behaviour dropdown and filter.
- Website labels: "Contacted" text in `final-message-panel.tsx` and `auto-reply-panel.tsx`, and the status text in `helpers/finalMessage.js`, read Neutral.

### Step 2: Do not disturb

- New `helpers/leadContactBlock.js`: the rules above, by normalized phone.
- `helpers/broadcastAudience.js`: exclude in `audience()` and `eligible()`, and count those skipped.
- `helpers/leadMessage.js`, `controller/lead/uploadProposal.js`, `sendProposalWhatsapp.js`: refuse with a clear reason. A review popup left open is checked again when Send is pressed.
- `broadcast-panel.tsx`: show the skipped count.
- Portal: countdown badge; Send message disabled with the reason.
- Final Message's existing jobs, popup and Needs decision stay as they are.

### Step 3: Offer Target

- New `models/offerTargetModel.js`: `leadId`, `offerSlug`, `offerTitle`, `stage`, `addedBy`; unique on `leadId` and `offerSlug`.
- New `helpers/offerTargets.js`, `routes/offerTargets.js`: list, add, change stage, Bought this offer, counts.
- `updateLead.js`: a follow-up with `offerSlug` changes that target's stage, never `lead.status`, and is allowed on Matured leads. Editing the latest line of an offer changes that offer's stage. Latest-follow-up logic for the lead ignores offer lines. An offer's Negative never opens the Final Message popup.
- `controller/trash/purgeTrash.js`: purging a lead removes its targets. Target lists skip trashed leads.
- `helpers/leadUpdates.js`: also watches offer targets, so the open lead page stays live.
- `helpers/websiteOffers.js`: `findLiveWebsiteOffer` checks the offer when people are added; `catalogueOffers` gives ended offers' state.
- People come from client accounts and non-client leads; `Won` leads with no live client are not offered.
- Clients without a lead get one through `ensureWonLead` when added.
- Website: "Target people" link in `offers-manager.tsx`; new Target people page and Add people form (select a whole filter, then untick; or pick one by one); new proxy route. The offer form is unchanged.
- Only a published, running offer takes new people. An ended offer shows "Offer ended", and its data stays.
- Bought this offer: client's target goes Matured and the `Won` lead is unchanged. A non-client uses the existing Convert first, which needs a name, phone and valid email; a phone-only lead is asked for its email. The target stays on the same lead after conversion.
- A person appears once in Add people. A client's own project request lead is not listed separately.
- Portal lead page: offer box with stages; follow-up form gets General or an offer; timeline tabs All, General and one per offer.
- New people start Neutral. A number not in the system is added through Add Lead first.

### Step 4: Broadcast groups

Starts only after Broadcast passes its real-phone test and is deployed (`broadcast.md`).

- Group choices: Leads → stage; Matured Clients → behaviour, several at once; Offer → stage.
- Leads groups leave out clients, including their own project request leads and numbers held by a client.
- Unhappy shows a warning. Dead and Wrong can't be chosen.
- Membership stays live from leads and targets, never copied.
- A sent offer broadcast adds one line to that offer's timeline tab.

### Later

Offer reservation adds the person to that offer as Positive. Per-client behaviour summary.

## Working order

1. Backups before changes, under `E:\Allprojects\backup\<repo>\`. Next free: backend `work45`, frontend `work39`, merasoftware `work60`.
2. Steps 1, 2 and 3 are built and tested together, then reported once.
3. Review by the owner. Deploy only on the owner's word: backend first, then website and portal.
4. New response fields stay optional on frontends. No production writes without permission.

## Tests

- Backend `npm run test:offer-targets`: categories, each block and way out, offers. Also `test:lead-status`, `test:broadcast`, `test:final-message`, `test:lead-message`, `test:whatsapp`, `test:email`.
- Website `node --test tests/offer-targets.test.mjs`: proxy and the Target people page in a browser.
- Portal `node tests/lead-offers-browser.cjs`: lead page and Leads list.

## Traps

- A client's own project request is already a second lead (`requestedByUserId`). It stays as it is and is the one exception to one person, one lead.
- An ad message revives a Dead lead only while Auto Reply's "Add to leads" switch is on.
- `closeRow` and `decideReply` act on every Negative lead with one number; keep this in mind when testing same-number leads.
- "campaign" is already used on the website: name new things "offer target".
- Offer slugs are stable and "Delete offer" only archives, so targets keep working.
