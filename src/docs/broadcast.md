# Broadcast — hand-over

**Doc rule:** update this file, without being asked, from the owner's decisions and from work actually done. Correct the relevant section alongside each verified finding or completed change; keep confirmed owner decisions, current state, essential pitfalls and next steps only. Questions and undecided ideas stay in chat. Replace stale information instead of appending repeated reviews or history.

**Repos,** under `E:\Allprojects`: `backend` (Express, Render), `frontend` (customer portal and its admin), `merasoftware` (website and its admin). Paths below are inside these.

## Where the work stands (30 Oct 2026)

| Work | State |
|---|---|
| Lead status correction | Badge code is on `main` (`lead system correction 3`) and in the live portal. `New` merge, `Won` backfill and badge migration done (30 Oct). Owner's portal check of the filter is pending |
| Website Leads page | On hold (owner) until the correction is finished |
| Broadcast | Existing flow upgraded for live lead/client groups, channels and media; implementation/verification below. Real-phone media delivery is not tested |

## Final Message (first part committed; ignore list and Needs decision built 31 Oct, tests pass, not committed; real-phone test pending)

**Owner's rules:** marking a lead `Negative` opens the normal review popup: Send or Don't Send, channel, template. WhatsApp or Both: no reply within the time limit moves the lead to `Dead`; any reply of any kind keeps it `Negative` and shows it to the admin. Email only or Don't Send: no timer, it never goes `Dead` by itself. A message of only listed words (editable in the box; first list: ok, thik a, thik hai, thik hai ji, kardo ji, krdo, karde, kardo), only emojis, or an emoji reaction is not a reply: the wait goes on and it shows on the timeline. Any other message, voice or photo goes to Needs decision, where the admin picks Interested (`Contacted`), Mark Dead or Keep Negative. A real reply after `Dead` brings the lead back to `Negative`; a listed word doesn't. `Dead` sits below `Negative`, is never deleted, and is in no Broadcast group or offer. Planned do-not-disturb rules, including the countdown: `offer-target.md`. The message goes to one person once. Don't Send, expired or failed can be sent again.

- **Message:** Email Templates action `lead.finalMessage`, with a `Time limit` chip from Insert detail. One setting (Communication → Final Message, default 24 hours) fills the chip and sets the wait; a message already prepared keeps its own time.
- **Code:** `helpers/finalMessage.js` (who can get it, prepares the draft), `helpers/finalMessageJobs.js` (minute job: follows the draft and queue row, replies, deadlines), `whatsapp/src/inbound.js` (notes replies apart from Auto Reply's switches, only for numbers being waited on), `whatsapp/src/finalMessageReplies.js` (what doesn't count; `cleanText` stays as Auto Reply needs it), `FinalMessage` in `whatsapp/src/models.js`. The first message reaches the queue through the popup's decision. Replies and the three buttons change the lead only and never send.
- **Expiry reply (4 Nov, local):** new cycles automatically queue an editable `lead.finalMessageExpired` WhatsApp template after the deadline closes them with no real reply. It quotes the original Final Message and contains no hours. `helpers/finalMessageExpiry.js` owns the durable expiry outbox; queue insertion and its permanent marker commit together. Sender checks eligibility again after typing. Historical cycles do not opt in. Tests and rollout: [FINAL_MESSAGE_EXPIRY.md](FINAL_MESSAGE_EXPIRY.md). Client status repair remains deferred.
- **Buttons:** portal lead page "Send final message"; portal Leads page "Final message (n)" for leads already `Negative`, one popup per lead. The website box holds the time limit and replies only, because the review popup lives in the portal.
- **Excluded:** clients' numbers and clients' own project requests. `Dead` waits while WhatsApp isn't connected.
- **Next:** owner's review, then deploy (backend first), then a real test with the owner's number: a real reply, "ok", an emoji reaction, no reply (short time limit), Don't Send, and a reply from a LID chat. Then the owner presses the button for leads already `Negative`.
- **Tests:** backend `npm run test:final-message`; website `npm run test:auto-reply`; portal `tests/lead-proposals-browser.cjs`, `tests/inquiry-lead-browser.cjs`.
- **Rollback:** `backup\backend\work40-final-message`, `backup\frontend\work35-final-message`, `backup\merasoftware\work55-final-message`. Ignore list and Needs decision: `backup\backend\work41-final-message-decisions`, `backup\frontend\work36-final-message-decisions`, `backup\merasoftware\work56-final-message-decisions`. New files had no earlier version.

## Next steps, in order

0. **Check the portal with the owner:** the `Proposal Sent` filter must show 12 of 69. The badge migration ran on `merasoftware-db` on 30 Oct: 12 leads have `proposalSentAt`, statuses Contacted 45, Negative 4, Won 20, `remainingStatus` 0, a repeat dry run is 0/0. Old values: `E:\Allprojects\backup\backend\proposal-badge-migration-30oct.json`. If the filter still shows 0, the live backend doesn't return the field: its version isn't confirmed, only the push is.
   - The 12: 10 `Won`, sandeep singh `Negative`, Paul Singh `Contacted`. So Broadcast's `Proposal Sent` target has 1 lead today.
   - Sunil Kumar shows three options, which is correct. Adding a proposal must **not** add a fourth option: it only adds the badge. The owner asked about this; confirm it with them on a real proposal.
   - **Owner's rule:** a lead counts as `Proposal Sent` only if a file is attached. Old files are in `followUps[].attachment`, not in `proposals`, and the migration didn't read that field. Rajan Clothing Majitha (`Won`) has a proposal file but no badge; the badge corrections wait for the owner's go-ahead.
1. **Live check with the owner, on a test lead with their own number:** real proposal upload to Drive, popup, WhatsApp reaches the phone, link opens, stage unchanged, badge and timeline right. Not tested yet with a real file or phone. No popup for a phone-only lead means `ENABLE_WHATSAPP` is off on Render or the "Proposal sent" action is Off.
2. **Owner decides, then apply:**
   - Unlinked `Won` lead Jasmeet: linking shows its 1 file in that client's Documents.
   - `Won` leads whose user no longer exists: SAHILPREET KAUR, Prabhnoor Kaur, Khushpreet Kaur, sunny, Generic, Rajbir Singh. They receive any `Won` campaign until decided.
3. Check whether the other two `upload.any()` routes lose review mail (see Traps).
4. On "code likho": Website Leads page or Broadcast Phase 1. The owner chooses which goes first.

## Working rules

- Reply in Hinglish; UI, code and docs in English. The owner isn't a coder: never show `**`, `##` or `{{ }}` in the UI.
- Code only after an explicit go-ahead. Test with real code, no assumptions.
- Back up before changing a file: `E:\Allprojects\backup\<repo>\workNN`, never inside a repo. Next: backend `work37`, frontend `work34`.
- Deploy backend first, then website and portal. New response fields must be optional on frontends. Commit, push and deploy only when the owner says.
- Production data: read-only counts or writes only with the owner's permission. Portal database is `merasoftware-db`; the backend's local `.env` points at an empty dev database, and the website's `.env.local` database has no leads.

## Lead system (done)

**31 Oct local change:** Matured leads allow follow-up notes and attachments; new follow-ups keep Won, and historical note edits preserve their original badges and the lead stage. Account edits, conversion and proposal restrictions stay as before. Lead → Client uses the existing link with availability checking; Client → Lead resolves the same convertedToUserId relationship without copying data. UI label stays Matured; stored value stays Won. Verified locally: backend lead-status suite 58/58; scoped Matured browser checks 3/3 (follow-up add/edit, live bidirectional navigation, unavailable/trashed links); portal production build passed with existing warnings. The broader legacy proposal browser run timed out waiting for its WhatsApp review dialog; that unrelated flow is not verified by this change. No push or deployment.

**Owner decision:** `Proposal Sent` is a permanent badge (`lead.proposalSentAt`), not a status. Adding any proposal sets it and never changes the stage, even on `Negative`. Broadcast's `Proposal Sent` target = badge + stage `Contacted` or `Positive`. Old follow-ups keep the `Proposal Sent` badge as history.

- **Statuses, SSOT:** `backend/helpers/leadStatuses.js` (values, rules), `frontend/src/helpers/leadStatuses.js` (labels, colours, dropdowns). Change a status in these two only.
- **Stages:** `Contacted` on creation; `Contacted`, `Positive`, `Negative`, `Dead` by the admin; `Dead` also by Final Message; `Won` (shown "Matured") by becoming a client. Follow-up dropdown: these four, with the current stage chosen. Leads list: stage filter plus a separate `Proposal Sent` filter.
- **Proposals:** `components/admin/LeadProposals.js`, `controller/lead/uploadProposal.js`. Version, amount, note and timeline entry; client sees files only after conversion.
- **Proposal message:** action `lead.proposal` (Email Templates), always reviewed first. With an email: email plus its WhatsApp copy. Phone only: same popup, then `controller/lead/sendProposalWhatsapp.js` queues it once.
- **`Won`:** `helpers/wonLead.js`, called from `addRoleToUser` and the sign-in fallback; `convertLead` makes its own. `scripts/backfillWonLeads.js` never links.
- **Tests:** backend `npm run test:lead-status`; portal `node tests/lead-proposals-browser.cjs`.
- **Rollback:** `backup\backend\work34-lead-statuses`, `work35-lead-correction`, `work36-proposal-badge`; `backup\frontend\work31-lead-statuses`, `work32-lead-correction`, `work33-proposal-badge`; merge values in `backup\backend\merge-new-lead-status-30oct.json`.

**Production, 30 Oct (re-count before use):** 69 leads: Contacted 45, Negative 4, Won 20; 12 with the badge. Of 49 active non-`Won`: 41 phone only, 5 both, 2 email only, 1 neither. 14 clients: 13 linked, Jasmeet unlinked.

## Website Leads page (owner: one backend, two frontends)

`/admin/leads` is an empty placeholder. Make it real on the same backend lead routes; the portal page stays; nothing is synced or copied. Traps from code:
- `portalApiRequest` returns only `data`. Lead routes also use `code`, `emailDraftIds` and `emailStatus`, so the proxy must pass the backend's whole response and status.
- Add Lead reviews mail before saving (`/email-control/lead-preview`, not in the website's allow-list); convert and proposals review after. The website has no global popup; its review dialog is inside `email-control-panel.tsx`.
- Also needs `/admin/customers/search`. Multipart file upload needs its own forwarding; check Vercel's body limit with a real file. Backend limit is 5 MB, website media uses 4 MB.
- Menu currently shows it to editors; lead routes are admin only.

## Broadcast: confirmed scope (8 Nov 2026)

- Upgrade the existing Communication/Broadcast flow; all WhatsApp messages still use `enqueueWhatsApp`, the existing queue, dispatcher and sole sender. The owner's working 23:00–08:00 quiet hours, gaps, pause, retries and age limits are unchanged. No new daily cap.
- Audience → Leads only / Clients only → stage/badge or client behaviour. Catalog comes from backend `leadStatuses.js` (`LEAD_CATEGORIES`, `CLIENT_BEHAVIOURS`, labels and marketing eligibility). Proposal Sent stays a badge. Dead/Wrong and non-Neutral client behaviours are visible with counts but cannot be marketed to. Only active, non-guest customer accounts linked to canonical Won leads qualify as clients; customer project-request leads are excluded from the new groups. Legacy audience IDs remain readable for existing runs.
- Send via → WhatsApp only / Email only / Both. Initial default WhatsApp; an accepted send persists its choice in the existing `EmailPolicy` for `broadcast.manual`, shared by admins. Preview/failed validation do not change it. Accepted runs lock channels/content; later preference changes affect new runs only.
- Both uses every available selected destination; a valid email without a phone is eligible for email. Phone/email dedupe are independent. Counts show people, destinations and exclusions. Normal marketing blocks apply to both channels. No automatic switch to an unselected channel.
- Compose text, one library image/video, optional caption, optional separate text before/after media, and an email subject for Email/Both. Supports text-only and media-only. Reuses ImageChooser/upload, EmailEditor and the canonical Broadcast renderer. Preview shows ordered WhatsApp parts and the email representation (video thumbnail/link). Conservative Broadcast limits: JPG/PNG 5 MB, MP4 16 MB, caption 1024 characters; the library's larger upload limits do not promise send compatibility.
- New compositions auto-save on accepted Send; template reuse never makes another template or silently updates the original. Explicit Update changes the reusable template, never accepted history.
- Audience is finalized when preparation completes. Later joiners wait for the next broadcast; changed eligibility/contact details are checked before release and again at WhatsApp handoff. Already handed-off messages cannot be recalled.
- Calendar scheduling, per-lead series, inactivity targeting and reply tracking are outside this upgrade.

## Broadcast: current code / SSOT

Backend:
- `helpers/broadcastAudience.js`: one resolver for catalog counts, channel destinations, preparation and eligibility checks. `helpers/leadContactBlock.js` remains the contact-block source; a catalog request shares one block snapshot across groups.
- `models/messageTemplateModel.js`: the existing reusable store, purpose=broadcast. `helpers/broadcastContent.js`: version-2 composition wrapping the existing text codec; old templates/runs and Auto Reply keep their text-only contract. Canonical content supplies both previews and delivered text/HTML; names stay literal. Per-recipient invalid personalization is skipped without blocking other broadcasts.
- `models/broadcastModel.js`: immutable run, channel/destination/message-part outcomes, existing global gate. `helpers/broadcastJobs.js` incrementally releases one WhatsApp part through the existing enqueue; the next part requires the earlier part to be sent. Existing queue IDs and per-part outcomes survive restart/reconciliation. Preparation exclusions are also snapshotted into send history. Service rows retain release precedence.
- Recipient uniqueness is now `(broadcastId, channel, phone, email, part)`. Before preparation, the existing dispatcher backfills legacy recipient defaults, builds the replacement index, then drops only `broadcastId_1_phone_1`. Queue uniqueness and existing IDs are unchanged. Do not roll back to the old dispatcher with unfinished media/multi-channel runs.
- Email parts use existing `EmailDraft`, `emailController.decide`, `reviewDelivery`, the sole provider call and EmailHistory. Drafts are locked to email delivery; the Broadcast owns its separate WhatsApp release, preventing an automatic extra copy. `broadcast.manual` is an internal delivery/audit event, not another editable action template. Email-only works while WhatsApp is paused/offline.
- Failed emails can be retried from Broadcast with the same draft/provider key within a conservative 23-hour window. Successful parts are retained; interrupted/older uncertain deliveries require review. Generic Email Review cannot change/send Broadcast drafts; generic WhatsApp Send again still cannot bypass Broadcast gating. Normal sender retries remain unchanged.
- `helpers/broadcastMedia.js`: validates short-lived website-signed immutable library metadata. The existing Lock collection serializes save/send against asset retirement. Website deletion first checks its normal usage, then obtains authenticated backend retirement; referenced Broadcast/template assets cannot be deleted, and retired assets cannot be newly accepted. Historical runs retain their media reference. Backend errors fail deletion closed.
- `whatsapp/src/models.js`, `sender.js`, `whatsapp.js`: optional validated media payload through the existing queue and transport. No second sender, provider call or queue collection. Existing readiness/quiet-hour settings remain authoritative.
- `/api/broadcast` keeps current-account admin authorization. Dispatcher remains behind `BROADCAST_JOBS_ENABLED=true`; this work does not enable it or change any production sending setting.

Website:
- `src/app/api/broadcast/[[...path]]/route.ts`: existing dual-admin proxy; resolves selected media from `mediaRepo`, then attests its trusted metadata. Browser-supplied delivery URLs are not accepted as authority.
- `broadcast-panel.tsx`: audience/channel/composition, saved messages, both previews and delivery-part history. Failed-email retry stays inside Broadcast. Existing WhatsApp queue/history now also show image/video and caption through `WhatsappText`.
- `communication-live.tsx`: one shared SSE feed with explicit resource subscriptions. Broadcast listens to communication/leads/clients/users; other panels keep their own subscriptions. Active-only coalescing, reconnect and fallback remain; events do not replace unsaved composition. Open recipient results refresh from the shared feed.
- `src/app/api/media/[id]/route.ts`: existing deletion flow with Broadcast retirement protection; reuses the existing website request-assertion helper.

## Broadcast: verification and rollout

- Owner authorized implementation and git push (8 Nov); no production messages/data mutations were used for verification. Tests use isolated MongoDB, actual routes/proxy/editor/dispatcher/sender, with phone transport and email provider mocked.
- Backend final sequential regression: 217/217 across Broadcast (22), email/review/manual messages, queue, sender, connection, inbound and Auto Reply. Website Broadcast/email/WhatsApp: 36/36; scoped realtime browser check, TypeScript, targeted ESLint and production build passed. Final history/preview additions were rechecked with backend Broadcast 22/22 and website Broadcast 3/3.
- Backups: `E:\Allprojects\backup\backend\broadcast-upgrade-20261108-165049` and `E:\Allprojects\backup\merasoftware\broadcast-upgrade-20261108-165049` (committed baseline archives and tracked pre-work diffs). Unrelated owner documentation is excluded from this work's commits.
- Rollout order: backend/worker first, then website. No new secret is required: media attestation uses the existing shared `TOKEN_SECRET_KEY` with a separate derived signing domain. Real-phone media delivery and deployment status are not established by local tests; do not claim they are. No test broadcast is sent to real contacts without the owner authorizing it.

## Traps

- **File upload and mail:** multer loses the mail scope's async context, so no review draft is made. Lead routes use `middleware/leadFileUpload.js`; `/admin/clients/:customerId/documents` and `/user-request-update` still use `upload.any()` and are unchecked.
- **Never bulk-insert into the queue:** oldest goes first, so 500 rows block service messages for about 6 hours and can hit the 24h drop. `whatsappQueue.test.js` fails if another file writes `Queue.create`.
- **Do not let Broadcast email enqueue its own WhatsApp copy.** Its locked email-only draft and separate existing Broadcast dispatcher own the selected channels; otherwise Both would duplicate WhatsApp.
- **`enqueueWhatsApp` doesn't check `ENABLE_WHATSAPP`.** The dispatcher must.
- **Foreign numbers without `+` are unusable** (`normalizePhone` returns null). Never guess a country code.
- **Manual phase has no extra daily cap.** Do not introduce the earlier proposed releasedDay/day-limit policy without a new owner decision.
- **Incoming messages are read only for Auto Reply and Final Message** (`whatsapp/src/inbound.js`). There is no opt-out: typing STOP does nothing.
- **Ban risk stays:** Baileys, unofficial, same number as service messages. Existing queue pacing remains; no extra daily limit (owner).
- **Name new things "broadcast":** "campaign" is taken on the website.


**31 Oct list timestamps (local):** Leads use separate Added/Modified columns; Clients use Joined/Updated. Each shows date over time via one AdminDateTime component (IST, 12-hour). Leads use createdAt/updatedAt; Clients retain backend latestActivityAt as the single update/sort source, now including account updatedAt alongside existing project/payment/ticket activity. Missing values show a dash. Verified: real Leads/Clients browser rendering checks date/time and UTC-to-IST date rollover; backend controller check confirms profile/project update precedence; portal production build passes with existing warnings. No push/deploy.
