# Broadcast — hand-over

**Doc rule:** update this file, without being asked, from the owner's decisions and from work actually done. Correct the relevant section alongside each verified finding or completed change; keep confirmed owner decisions, current state, essential pitfalls and next steps only. Questions and undecided ideas stay in chat. Replace stale information instead of appending repeated reviews or history.

**Repos,** under `E:\Allprojects`: `backend` (Express, Render), `frontend` (customer portal and its admin), `merasoftware` (website and its admin). Paths below are inside these.

## Where the work stands (30 Oct 2026)

| Work | State |
|---|---|
| Lead status correction | Badge code is on `main` (`lead system correction 3`) and in the live portal. `New` merge, `Won` backfill and badge migration done (30 Oct). Owner's portal check of the filter is pending |
| Website Leads page | On hold (owner) until the correction is finished |
| Broadcast | Manual core implemented locally; verification below. Not committed, pushed, deployed or tested on a real phone |

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

**Owner decision:** `Proposal Sent` is a permanent badge (`lead.proposalSentAt`), not a status. Adding any proposal sets it and never changes the stage, even on `Negative`. Broadcast's `Proposal Sent` target = badge + stage `Contacted` or `Positive`. Old follow-ups keep the `Proposal Sent` badge as history.

- **Statuses, SSOT:** `backend/helpers/leadStatuses.js` (values, rules), `frontend/src/helpers/leadStatuses.js` (labels, colours, dropdowns). Change a status in these two only.
- **Stages:** `Contacted` on creation; `Contacted`, `Positive`, `Negative` by the admin; `Won` (shown "Matured") by becoming a client. Follow-up dropdown: the three, with the current stage chosen. Leads list: stage filter plus a separate `Proposal Sent` filter.
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

## Broadcast: confirmed scope and order

- Communication → Broadcast, one compact panel: group dropdown → recent/saved-message dropdown → formatted message editor with Recipient name insertion → Save Draft/Update, Preview, Send → progress/history. UI/code/docs English; replies Hinglish.
- Contacted, Positive, Negative and Won (label Matured) groups include that stage regardless of proposal badge. Proposal Sent = badge + Contacted/Positive only. Group membership comes from live leads, never copied groups.
- New typed/pasted composition auto-saves once on accepted Send. Selecting a saved template never creates another template, even if edited for that send. Only explicit Update changes the reusable template. Deleting/editing it never changes send history. Save Draft does not send. Recent ordering uses lastUsedAt.
- Owner confirmed: NO extra marketing daily limit or one-per-person/day limit now. Existing WhatsApp gaps, retries, pause, quiet hours and age limits remain.
- Every message MUST enter the existing WhatsApp Q via enqueueWhatsApp; sender.js is the only transport. No direct-send path, second sender, email copy, or bulk queue insertion.
- Owner tests manual core first → owner's calendar schedule (group/message/date/repeat) → owner tests → agent additions individually, asking before each: per-lead date-based series; inactivity targeting; Interested/Call me tracking. Calendar late joiners miss earlier runs; per-lead series gives each lead its whole series. Calendar scheduling and these additions are NOT implemented.

## Broadcast: current code / SSOT

Backend:
- helpers/broadcastAudience.js imports helpers/leadStatuses.js and normalizePhone from whatsappQueue.js. Owns catalog, count, stage/badge query and release-time recheck. Excludes trash/unusable phones, dedupes normalized phone; lowest lead ID wins within the group. Current phase includes requestedByUserId leads. Counts are previews, not delivery promises.
- models/messageTemplateModel.js is the reusable store: purpose=broadcast; missing/legacy purpose stays legacy. Broadcast service scopes CRUD to broadcast; legacy list/update/delete exclude it. No second template collection.
- helpers/broadcastContent.js owns canonical JSON document validation, field catalog, encode/decode, text/HTML preview and WhatsApp rendering. Same renderer/field values for preview/send; names are literal. EmailEditor reused with WhatsApp capabilities; email formatting unchanged. Do NOT add another frontend converter. Canonical document is serialized in message; generated output is derived.
- models/broadcastModel.js: Broadcast (immutable send body/request fingerprint, preparing/ready/finished), BroadcastRecipient (phone-unique per broadcast, persistent outcomes), BroadcastGate (one globally held recipient). helpers/broadcastService.js: idempotent send acceptance, recoverable auto-save, templates and recent 30 broadcasts; paginated recipient reasons.
- helpers/broadcastJobs.js prepares/reconciles and incrementally releases one recipient through enqueueWhatsApp. Global renewable lease plus persistent recipient gate and deterministic queue ID/unique broadcastRecipientId prevent duplicate release. Every pending/sending Broadcast Q row holds further Broadcast release. Due service rows take precedence at release; existing oldest-due sender order remains, not strict priority.
- whatsapp/src/models.js owns the actual Q schema/index; arbitrary enqueue fields otherwise get dropped. Queue TTL is 30 days; recipient outcomes survive separately. Pending rows are cancelled when recheck sees changed stage/phone; an already sending message cannot be recalled, and a change between dispatcher checks and sender claim can still send.
- helpers/whatsappReadiness.js shares heartbeat/off/pause/connection policy; settings.js owns quiet hours. middleware/communicationAdmin.js shares current-account admin checks for WhatsApp/Broadcast.
- routes/broadcast.js mounted at /api/broadcast. index.js minute dispatcher is gated by BROADCAST_JOBS_ENABLED=true, independent of ENABLE_CRONS. Missing switch is OFF. A failed Broadcast row has no generic Q Send again action (would bypass release gating); automatic sender retries still work. Service-message retry is unchanged.

Website:
- src/app/api/broadcast/[[...path]]/route.ts: dual website/portal-admin guard, allow-listed operations, backend forwarding.
- communication-hub.tsx: Broadcast navigation and mounted panel. broadcast-panel.tsx + broadcast.module.css: manual flow, safe server-rendered preview, progress/recipient reasons. No Scheduled tab yet.
- email-editor.tsx: WhatsApp mode enables italic/disables headings/sections; labelled chips. setEditable(..., false) is essential: changing disabled state must NOT emit content edits or it clears previews.

## Broadcast: verification and next action

- Tests use isolated MongoDB and real backend routes, website proxy/editor and real queue sender with only phone transport mocked. No production data or real phone messages used.
- Backend: npm run test:broadcast (10 cases), included in npm run test:whatsapp. Covers group/badge matrix, normalized-phone dedupe, literal fields/HTML escaping, template purpose isolation, idempotency/crash recovery, concurrent dispatchers, real sender gap/service ordering, eligibility cancellation and readiness.
- Passed: backend WhatsApp suite 65/65 (includes Broadcast 10/10), backend email 40/40; website Broadcast 2/2 (real proxy + browser/manual flow and mobile), email 21/21, WhatsApp 10/10. TypeScript and targeted ESLint passed. Real-phone delivery and production deployment remain untested.
- Backups: E:\Allprojects\backup\backend\work37-broadcast-manual and E:\Allprojects\backup\merasoftware\work-broadcast-manual-20261030-220404. New files have no pre-existing version. Next backend backup must use the next free work number.
- Next: owner reviews manual flow; commit/push/deploy only on request, backend first. Deploy dispatcher switch OFF, then owner-authorized test with their own number before wider activation. Live lead/proposal checks above remain pending.
## Traps

- **File upload and mail:** multer loses the mail scope's async context, so no review draft is made. Lead routes use `middleware/leadFileUpload.js`; `/admin/clients/:customerId/documents` and `/user-request-update` still use `upload.any()` and are unchecked.
- **Never bulk-insert into the queue:** oldest goes first, so 500 rows block service messages for about 6 hours and can hit the 24h drop. `whatsappQueue.test.js` fails if another file writes `Queue.create`.
- **WhatsApp otherwise only copies sent email,** so most leads, who have no email, need the direct queue path. Don't send Broadcast through email: it would duplicate.
- **`enqueueWhatsApp` doesn't check `ENABLE_WHATSAPP`.** The dispatcher must.
- **Foreign numbers without `+` are unusable** (`normalizePhone` returns null). Never guess a country code.
- **Manual phase has no extra daily cap.** Do not introduce the earlier proposed releasedDay/day-limit policy without a new owner decision.
- **No incoming messages are read** (no `messages.upsert`), so typing STOP can't work; use the link.
- **Ban risk stays:** Baileys, unofficial, same number as service messages. Existing queue pacing remains; no extra daily limit (owner).
- **Name new things "broadcast":** "campaign" is taken on the website.

