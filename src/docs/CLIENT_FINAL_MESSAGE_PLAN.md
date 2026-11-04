# Client behaviour and tracked Final Message — implementation plan

Verified locally: 2 November 2026 (India). Status: implementation in progress; no production migration, production reads, deployment or real sends performed. Client automation is gated by `CLIENT_FINAL_MESSAGE_ENABLED=true` and defaults off. Do not enable or deploy it yet: the outstanding items below are release blockers.

## Implementation progress and release blockers

- Follow-up work: client expiry and client reply decisions now atomically update the tracking row and lead through MongoDB transactions; late reply after Dead does the same. This requires a transaction-capable MongoDB replica set. Tests inject a database failure and a reply immediately before the timeout claim; both preserve the intended state. Auto Reply now preserves an unprocessed late final-message reply. Disabling the client flag stops waiting episodes; batch counts exclude conflicting phone messages. Client workspace shows behaviour and receives admin-only lead change invalidation.
- Follow-up verification: scoped final-message suite ran against a disposable MongoDB replica set (32/32 at that point); targeted switch-off and conflicting-phone tests passed 2/2; 105 other backend regression tests passed; actual portal lead/client navigation browser test and live change-stream browser test passed. Phone transport and provider are mocked. The tests do not establish real WhatsApp delivery.
- Further follow-up: `backend/scripts/migrateClientFinalMessages.js` creates a plan file with deterministic new lead IDs and account before-images; it skips ambiguous links, requires a unique partial `convertedToUserId` index, requires an explicitly declared write-maintenance window, validates database/host and rechecks candidates, and supports a repeat apply. The isolated replica-set test exercises missing prerequisites and repeated apply. No production audit, index creation or apply was run. Automatic rollback is not implemented; the plan file is not a substitute for a verified database backup.
- The portal browser exercise with the actual client page and backend verified Negative client behaviour opens a tracked review, Don't Send queues nothing and Won remains. The new test initially timed out because its helper expected a non-client Add Proposal button; the fixture navigation was corrected, and both the targeted and full browser runs passed.
- Implemented locally: client subject and revision, tracked review preparation on the portal behaviour action, expiry and reply handling, client marketing block, separate client batch, reply list labels, explicit repeat episode with stored previous snapshot, and a read-only identity audit script. Existing lead path remains covered by regression tests.
- The audit script `backend/scripts/auditClientFinalMessages.js` only reports candidate IDs and conflicts; it does not perform a migration. Existing clients with missing or ambiguous links have not been repaired. It has only been exercised against disposable test data.
- Before activation: harden recovery from partial failure between draft preparation and episode creation; a flag alone does not solve those races. Client preparation has a per-lead lease and an isolated concurrent test, but lease expiry/crash recovery still requires verification. Verify actual simultaneous inbound/timeout across separate workers, phone edits, account changes, duplicate identities and late delivery after offline gaps.
- Finish the remaining plan: verify migration rollback and uniqueness-index deployment on real production-like data; explicit handling of legacy active lead episodes on conversion; switch-off reconciliation of sent episodes and late replies; website end-to-end client tests; exact rollout and owner-number real delivery test. Current batch count covers the tested same-phone conflict, but remaining old-message cases need verification.
- Repeat episodes currently store history in the tracking row, not the lead timeline; the final UI and audit/retention rules still need review. Behaviour writes from the separate offer-target API do not open the portal review; ensure its user can recover the tracked action.
- Website `tsc --noEmit` currently reports missing imports and implicit-any errors in `backup/fix1/src/app/admin/email-control/email-control-panel.tsx`; the backup is unrelated to this change. Targeted lint for the changed website panel passes. Do not claim a clean website-wide typecheck.

## End-to-end baseline exercise — 2 November 2026

An additional exercise ran the actual local backend and browser components with isolated in-memory MongoDB databases, fake customer accounts, and fake WhatsApp/email transports. No production database, real phone, message delivery, live account migration or application implementation was used. A short-lived verification test was removed after the run.

- `node --test tests/finalMessage.test.js tests/offerTargets.test.js tests/leadCorrection.test.js tests/reviewDelivery.test.js tests/autoReply.test.js`: **127/127 passed**. Includes tracked lead review, queue/send, ignored/real replies, timeout/late reply, client behaviour, offer isolation, old-client backfill and delivery/retry paths.
- Three additional isolated route/job checks: **3/3 passed**. A Won client's Negative behaviour saves without creating a tracked message; the client's Final Message endpoint returns 409 and nothing queues. For a lead with a sent message, a test simulated conversion by updating the fixture directly: the old episode stops at expiry, client remains Won/Negative, and a new client Final Message is refused. A Won/Negative client is included in the existing Won audience until client behaviour becomes Dead, then excluded. The simulated conversion is not an end-to-end test of the conversion controller.
- Portal `node tests/lead-proposals-browser.cjs`: **passed**, actual portal components and backend routes with an isolated database and mocked providers. This run verified the lead final-message review, Don't Send/retry, bulk reviews, converted lead messaging and client/lead navigation. The earlier legacy browser timeout mentioned in broadcast.md did not recur in this run; that document's historical observation remains historical.
- Portal `node tests/lead-live-integration-browser.cjs`: **passed**, actual pages, MongoDB replica-set change streams and a separate worker connection; a final-message reply refreshed the lead view. The test reported one update visible in 853 ms; that is a single local observation, not a performance guarantee.
- These tests establish the current baseline and expose the exact client automation gap. The proposed client countdown, migration against actual existing records, safe episode replacement, and owner-number WhatsApp delivery cannot be certified until implemented and tested. Production versions and data remain unverified.

## Plan verification review — 2 November 2026

Verdict: core approach matches the existing architecture. The review identified the implementation requirements below; this is an executable design, not proof that client automation already works. Production identity audit and real delivery remain outstanding.

- **Two behaviour write routes:** backend/routes/offerTargets.js exposes PATCH /leads/:id/behaviour in addition to updateLead's setBehaviour action; the website offer-target proxy already permits this PATCH. Both must use the same transition service, revision handling and review response contract. Inspect each caller before enabling automatic popup preparation; do not prepare a review where the caller cannot display/recover it.
- **Conversion inheritance:** convertLead and ensureWonLead can carry Negative into clientBehaviour. Account conversion/creation must not accidentally prepare a second final-message review alongside the account-created review or send a client warning automatically. Inherited Negative clients become eligible for the dedicated tracked action; a deliberate admin behaviour transition opens the review. Retire obsolete lead episodes when conversion occurs, without discarding sent-message evidence.
- **Broadcast scope:** backend/helpers/broadcastAudience.js currently selects lead.status groups, including Won; it does not implement separate client-behaviour groups or per-offer groups. Existing Dead/countdown suppression must work for Won broadcasts in this change. Behaviour-based client campaign selection remains the already documented offer-target.md Step 4 dependency; do not claim that this plan alone delivers that broader targeting UI.
- **Live refresh dependency:** helpers/leadUpdates.js currently has no leads -> clients dependency. Adding behaviour summary to Client Profile requires admin-only client/communication invalidation when the canonical lead changes. Existing customer referral invalidation remains limited to authorized, non-record signals.
- **Rollout control:** no client-automation switch exists today. Implement a dedicated server-side enablement control, default OFF, governing client review preparation, tracked Send acceptance and automatic client expiry. Lead jobs remain unchanged. Turning it OFF stops/cancels client review/queued/waiting episodes safely, rather than leaving client marketing blocked indefinitely; retain actual sent history and later replies for review. Re-enabling must not restart stopped episodes implicitly.
- **Repeat attempts/history:** one-current-row-per-lead is a design choice, not an existing episode feature. Before replacing a row, preserve a complete immutable snapshot of its subject, draft, times, reply/ignored reply, decision, outcome and episode identity in schema-supported audit data on the same lead (or use retained existing History references plus a complete audit snapshot). Free-text notes alone are insufficient. Treat one episode as one reviewed attempt: failed/Don't Send retries may reuse that episode; a resolved client episode needs explicit new-episode action. Batch actions must not silently restart resolved episodes.
- **Delivery terminology:** Queue.sentAt means the transport send succeeded; it is not a delivery/read receipt. The timeout promise must say 'after sending'. A healthy heartbeat at expiry does not prove uninterrupted inbound coverage; retain current lead policy but report connection outages, and test reconnect with delayed inbound before client expiry processing. Do not claim offline periods were fully observed.

Additional verification executed during this review: `node --test tests/autoReply.test.js tests/reviewDelivery.test.js` -> **58 passed, 0 failed**, isolated MongoDB and mocked external transport/provider. The earlier 121-test result and portal check were not rerun because application code is unchanged. Total recorded backend checks across the two non-overlapping runs: 179 passed; none proves the proposed implementation.

## Objective and scope

Existing and future customers must be manageable from their canonical Matured lead: choose Negative client behaviour, review and send a tracked Final Message, wait the configured period after actual WhatsApp send, and change client behaviour to Dead if no qualifying reply arrives. Preserve Won, account identity, projects, invoices, balances, offer history and documents.

Extend the existing sender, review, queue, reply listener, minute job, timeline and contact-block helper. Do not create a second CRM, sender, timeline or copied client group. Client profile can link to this management screen; customer-facing screens must not expose internal behaviour or reasons.

This plan supersedes earlier conversational suggestions of automatic project closure and a full deal pipeline: those capabilities are not already implemented and are not prerequisites for client behaviour automation. An offer or project may explain why the relationship was marked Negative; it must not silently receive a new lifecycle or automatic financial side effect.

## Verified evidence

Paths below are relative to E:/Allprojects unless prefixed otherwise.

| Evidence | Current behaviour | Required change |
|---|---|---|
| backend/models/leadModel.js; helpers/leadStatuses.js | clientBehaviour exists on converted lead; missing means Neutral; Won is distinct | Reuse fields and status constants |
| backend/helpers/offerTargets.js, setBehaviour | Saves behaviour and timeline only; no tracked review preparation | Prepare Final Message when entering Negative, after saving behaviour |
| backend/controller/lead/updateLead.js | setBehaviour bypasses conversion edit lock correctly | Return tracking outcome in same response; retain account edit lock |
| backend/helpers/finalMessage.js, isOpenNegative/clientPhones/blockedReason/pendingLeads | Excludes converted leads, client request leads and customer phone numbers | Support canonical client Negative behaviour explicitly; retain exclusions for duplicate/request leads |
| backend/controller/lead/finalMessage.js | Count, bulk preparation and individual preparation are lead-only | Add explicit lead/client audience filtering and matching messages |
| backend/helpers/finalMessageJobs.js | Cancellation, expiry and late reply use lead.status; expiry affects non-converted Negative leads sharing phone | Resolve subject kind; client writes only clientBehaviour on its canonical linked record |
| backend/whatsapp/src/models.js | FinalMessage has unique leadId, no subject kind/cycle; one sent message cannot normally be sent again | Add backward-compatible subject identity and controlled client episodes |
| backend/whatsapp/src/inbound.js | Replies matched by phone; records during review/queued/waiting/dead; compares send time later | Retain listener and ignored-reply rules; prevent stale episode events affecting a new one |
| backend/helpers/finalMessage.js, decideReply | Decisions update lead.status, reject Won | Branch by subject: client decisions update behaviour, never Won |
| backend/routes/autoReply.js | Needs decision only lists lead.status Negative | Include Negative client behaviour, subject labels and canonical link |
| backend/helpers/leadContactBlock.js | Client Dead already blocks marketing; countdown/Needs decision explicitly ignore client numbers | Include client tracked episodes, keeping service messaging exemption |
| backend/helpers/leadPhone.js; helpers/autoReplyJobs.js; controller/lead/customerProjectRequest.js | Dead client can return to Neutral on supported incoming request/ad paths; no client tracked-episode cleanup | Reconcile episode termination and pending reply handling before returning to Neutral |
| frontend/src/pages/AdminLeadDetailPage.js | Behaviour dropdown exists; Final Message button excludes converted leads; saveBehaviour does not handle preparation outcome | Reuse review integration; enable tracked client action and subject-specific copy |
| frontend/src/pages/AdminLeadsPage.js | Matured behaviour filters exist; final-message count/bulk action is lead-only | Separate Negative Leads and Negative Clients counts/actions |
| merasoftware/src/app/admin/communication/final-message-panel.tsx | Shared settings/reply decision panel has lead-specific text | Show lead/client subject, effective state, link and clear outcome |
| backend/helpers/wonLead.js | ensureWonLead can attach an open lead by email OR phone, and returns existing linked lead without excluding trash | Do not use blindly for migration; audit ambiguity, trash and document ownership |
| backend/scripts/backfillWonLeads.js | Dry-run default; creates missing records, intentionally skips possible existing matches | Reuse conservative rules; extend audit/backup evidence before applying |
| backend/helpers/leadMessage.js; tests/leadMessage.test.js | Choosing Final Message as ordinary message content does not create tracked countdown | Keep tracked action distinct and label clearly; prevent accidental claims of tracking |
| backend/models/orderProductModel.js | Project status enum pending/in_progress/completed; separate checkpoint/service statuses exist | Do not add On Hold/Closed by writing an invented enum; project lifecycle needs separate analysis |

## Final business rules

1. Non-client Negative lead: existing lead workflow and outcomes continue unchanged.
2. Client: eligibility requires an available customer account linked by convertedToUserId to its canonical, non-trashed Won lead, with effective clientBehaviour Negative. A project-request lead is not a second client identity.
3. Changing client behaviour to Negative saves it first, adds one audit entry, and prepares the existing review popup. No message is sent until the admin chooses Send.
4. Already-Negative clients get a dedicated tracked Final Message button. Batch preparation opens one review per eligible person; no silent bulk sending.
5. Default wait is 24 hours. Existing global setting accepts 1–720 hours; each prepared message snapshots its promised hours. Changing settings must not rewrite active deadlines.
6. WhatsApp or Both: countdown starts from Queue.sentAt, not dropdown change, popup preparation or Send click. Display actual deadline in India time.
7. No reply at deadline: when eligible and worker connected/alive, set clientBehaviour Dead. Keep lead.status Won. The minute dispatcher means expiry is processed on a subsequent healthy run, not at an exact second.
8. Email-only, Don't Send, failed/expired/cancelled delivery and disabled WhatsApp do not start an automatic Dead countdown. Queue waiting is not delivery.
9. Real text, voice or photo reply goes to Needs decision; behaviour remains Negative. Listed whole replies, emoji-only and reactions are timeline-only and do not stop the timer. Preserve current configurable ignored list.
10. Decisions: Interested -> Neutral client behaviour; Keep Negative -> Negative with episode resolved; Mark Dead -> Dead behaviour. No decision sends another message.
11. Late real reply after automated Dead -> Negative + Needs decision for that same active client episode. Do not revive an unrelated manual Dead decision or a newer episode.
12. Admin changing behaviour away from Negative stops pending tracking/cancels still-pending queue work. Changing it back must not reanimate a stale timer. A sending transport operation cannot reliably be recalled.
13. Marketing is blocked from accepted WhatsApp Send through queued/waiting/undecided reply and while Dead. Existing pre-Send review alone does not block. Current Negative behaviour alone remains targetable under existing category rules; a blanket exclusion would be a separate policy change.
14. Broadcast, offer targeting, general lead messaging and proposal delivery must consult the same contact-block authority, including rechecks at existing release/Send boundaries. Project/invoice/payment service messages retain current exemptions.
15. Offer stage is independent. A client can have one lost/Negative offer without global Negative behaviour; a Matured offer is currently terminal. Do not change this as a side effect of client automation.
16. Reason is recorded in the shared timeline; optional project/offer references are context only, validated against the client when structured IDs are provided. This relationship-level action makes the whole client Dead, not only that offer/project.
17. Blacklist is not an existing synonym for Dead. Do not introduce permanent blocking, account lockout or automatic blacklist in this change.

## Implementation steps

### 1. Baseline, backup and identity audit

- Record git state for backend, frontend and website; do not overwrite unrelated work.
- Before implementation, back up touched existing files outside the repos under E:/Allprojects/backup, with manifest and hashes. New files are marked new.
- Read applicable instructions again if any additional directories enter scope; read installed Next documentation before website code edits as AGENTS.md requires.
- Build read-only client audit using explicit account ID relationships. Report available customers, canonical live links, missing links, trashed links, multiple linked leads, unlinked Won candidates, phone/email conflicts and unreachable accounts. Historical counts in broadcast.md are not current evidence.
- Do not select clients by name alone; Ramesh Kumar must be identified by account/link, with contact confirmation before real messaging.

### 2. Shared subject resolver and state transitions

- Add one backend resolver for lead vs canonical client: effective state, identity, availability, field to update and safe transition conditions. Reuse throughout preparation, jobs, decisions and blocks.
- Missing subjectKind on existing rows means legacy lead. Store explicit client kind plus linked client ID for new client rows; validate link on every transition, including conversion/deletion/contact changes during wait.
- Preserve existing one-current-row-per-lead schema unless implementation proves a different structure necessary. Add episode ID and behaviour revision (or equivalent durable concurrency token) so a state moving Negative -> Active -> Negative invalidates old jobs even though its value matches again.
- A client gets its first tracked episode even if the same record has an old lead final-message history. Archive prior episode outcome and draft reference in the shared timeline before replacing current tracking.
- For subsequent client episodes require explicit Start new final-message action after previous episode resolved; no automatic resend loop. Snapshot subject, phone, hours, draft and revision. Clear old reply/decision/deadline fields only as part of the guarded new episode operation. Preserve existing lead resend behaviour.
- Use compare-and-set on episode/state/revision and conditional target writes. Reconcile partial failures between tracking row, behaviour update and timeline so retries cannot lose a reply or falsely finish expiry. Never mark tracking dead when the guarded client write did not apply.

### 3. Preparation and sending

- Extend setBehaviour and dedicated prepare/count/batch routes to use resolver. Save remains successful if draft preparation fails, with clear recoverable notice.
- Retain existing lead.finalMessage event and template/review pipeline; broaden admin labels and editable wording to address leads and clients accurately. Do not send payment-specific wording automatically to every Negative person.
- Recheck eligibility before accepting tracked Send; existing unconditional own-final-draft contact-block exception must not authorize stale client drafts. Bind exemption to current eligible episode and draft ID.
- Normal Send Message can use content without tracking today. UI must explicitly direct tracked countdown users to Final Message action; do not silently change template selection into a business action.
- Add audience scope to count/batch actions; legacy callers default to existing lead audience. Deduplicate phone identities and show conflicts rather than sending to two client accounts sharing a phone.

### 4. Jobs, replies, reactivation and marketing

- Extend queued cancellation, send observation, expiry, late reply and decisions through resolver. Client branch never writes lead.status or fan-outs Dead to unrelated clients sharing a phone.
- Retain reply-before-expiry priority, worker health requirement, ignored-message rules and existing enqueueWhatsApp/sender transport.
- Match client countdown and Needs decision in leadContactBlock, with consistent lead/client phone identity. Phone edits must not redirect an already-sent episode; stop/reconcile and require a new reviewed send for a new destination.
- Inspect and update clearClientDead/endFinalMessage callers together: ordinary incoming final-message replies follow Needs decision; supported new project/ad request reactivation keeps existing Neutral policy but resolves prior tracking so an old timer cannot set Dead again. A pending final-message reply must not be silently cleared by unrelated inbox processing.
- Retain existing phone-level suppression against duplicate lead entries. Ambiguous shared phone prevents automated cross-account behaviour changes and requires admin review.

### 5. Portal and website UI

- Portal Matured detail: existing Behaviour dropdown remains primary control; add reason note, tracked Final Message action, queue/wait/deadline/decision state and explanation that Won stays.
- Save Behaviour must handle existing review middleware/draft metadata; prevent duplicate popup/draft creation on repeated taps.
- Portal list: Matured/Negative client filter and separately labelled pending final-message count; preserve lead actions and filters.
- Website Communication -> Final Message: common hours/ignored list, subject type and client link, subject-specific decision outcomes. Share existing backend; no parallel client panel/storage.
- Admin client profile: same behaviour summary and link to canonical lead. Missing/trashed/ambiguous link shows actionable state, not a copied editor. Never expose internal labels via customer/referral responses or live update payloads.
- Ensure backend list/detail fields and current resourceDomains observer invalidate affected lead/client/communication views; test cross-tab refresh.

### 6. Existing client migration

- No mass behaviour backfill: absent behaviour already reads Neutral. Preserve valid existing categories, IDs, timestamps and all files/history.
- Linked valid client: zero migration needed. Missing canonical record with no ambiguous candidates: create linked Won lead only, using conservative backfill pattern.
- Candidate open/unlinked Won, multiple links, conflicting phone/email, stale account or trashed link: report for explicit reconciliation; do not match by name or automatically link and reveal lead documents.
- Dry-run report -> before-image backup/manifest -> reviewed deterministic changes -> apply -> post-check -> repeat dry-run produces zero remaining automatic changes. Add runtime/link uniqueness safeguards after resolving existing duplicates.
- Migration sends nothing, prepares no reviews, starts no timers and changes no projects/invoices. Rollback removes only unchanged migration-created records and restores exact approved before-images; concurrent edits are flagged rather than overwritten.
- Verify legacy FinalMessage rows retain lead semantics. New client episode creation explicitly handles an old sent lead episode; do not reinterpret all old rows as client episodes.

## Verification and acceptance

Already executed against current code (not proposed changes):

- Backend: node --test tests/finalMessage.test.js tests/offerTargets.test.js tests/leadStatuses.test.js tests/leadCorrection.test.js tests/leadMessage.test.js tests/broadcast.test.js whatsapp/tests/inbound.test.js -> 121 passed, 0 failed.
- Portal: node tests/lead-offers-browser.cjs -> PASS (actual page components with mocked API fixtures: offers, per-offer follow-ups, behaviour, countdown and filters).
- Backend integration suites use MongoMemoryServer, actual routes/review/queue/sender/inbound/job with fake providers/transport. These prove current local behaviour, not production installation or proposed client automation.
- Plan-review follow-up: node --test tests/autoReply.test.js tests/reviewDelivery.test.js -> 58 passed, 0 failed. Covers current client inbound routing, switches, channel/review decisions and retry isolation; proposed client episode handling still requires new tests.

Required implementation acceptance matrix:

| Scenario | Expected |
|---|---|
| Existing/new client -> Negative | One review; Won unchanged; timeline once |
| Negative client already present | Individual and client-batch tracked action available |
| Old lead final message followed by conversion | Client episode allowed explicitly; lead history preserved |
| WhatsApp send delayed | No deadline until actual sentAt; queued state visible |
| 24h / custom hours | Correct frozen deadline; changing setting does not rewrite it |
| Don't Send / email-only / failed / off / offline | No automatic Dead |
| Healthy worker + deadline + no reply | Behaviour Dead exactly once; Won and finance unchanged |
| Real text / voice / photo / LID chat reply | Needs decision; no automatic Neutral |
| ok / emoji / reaction | Logged, timer continues |
| Real reply at expiry / late after automated Dead | Reply takes precedence or reopens Negative for review |
| Negative -> Active -> Negative; stale draft/job | Old episode cannot send or kill new state |
| Conversion/deletion/trash/phone edit during wait | Safe stopped/review state; no wrong subject mutation |
| Concurrent Send/expiry/decision and retry | One send/transition; recoverable partial writes |
| Shared phone, duplicate client link | No duplicate send or cross-account automatic behaviour update |
| Pending/replied/Dead client | Existing marketing entry points blocked; service paths remain available |
| New project/ad request reactivation | Prior tracking resolved; no stale deadline; current policy retained |
| Ordinary message using Final Message template | Clearly untracked; no accidental countdown |
| Old-client dry-run/apply/rerun/rollback | Conservative, repeatable, no sends or document exposure |
| Existing lead workflow and offer stages | Baseline suites still pass |
| Desktop/mobile and two admin tabs | Correct review, state, deadlines, filters and live refresh |
| Both behaviour APIs and website proxy caller | Same transition/revision semantics; recoverable review on supported callers |
| Conversion carries Negative behaviour | Eligible client action, no unsolicited final-message popup/send; old lead episode retired |
| Won broadcast with client countdown/Dead | Excluded at preview and release; no claim of behaviour-group feature completion |
| Disable/re-enable client automation | No client automatic expiry or new tracked send while disabled; no stuck block or restarted timer |
| New client episode replaces old history | Complete immutable episode evidence retained; stale events rejected |
| Reconnect with delayed inbound | Inbound/expiry ordering verified; outage limitations documented |

Run scoped backend suites above plus affected email/review delivery, autoReply and queue/sender suites. Extend portal browser tests and website communication tests for client states, then portal production build and website type/lint/build checks appropriate to changed files. Record exact commands/results; never describe old passing tests as verification of new code.

## Deployment and rollback

1. Verify actual deployed versions, WhatsApp worker heartbeat/connection, template enablement and configured hours; no current live evidence has been collected here.
2. Deploy backward-compatible backend/model handling with client automation disabled until reviewed. Worker/model deployment must understand any new episode fields before activation.
3. Apply only reviewed identity repairs, with backup; then deploy portal and website UI.
4. Owner-authorized test using owner's test client/number: review, one actual send, real reply, ignored reply, short configured timeout and marketing block. Do not test on Ramesh or another real customer without explicit send instruction.
5. Enable client automation; monitor queue outcomes, worker health, pending decisions and client behaviour changes. Legacy lead tracking remains operational.
6. Rollback disables new client preparation/expiry and stops its still-pending queue work. Preserve sent-message evidence; do not restore stale queue or tracking snapshots that could resend messages. UI can roll back while additive fields remain readable. Back up and reconcile behavioural transitions separately.

## Explicit boundaries

Automatic project suspension/closure, a full deals pipeline, per-offer tracked final messages and permanent blacklist require separate designs against their own business rules. Current implementation target is the agreed client-level Negative -> tracked Final Message -> Dead behaviour flow, including existing clients and retargeting suppression. Project/offer context may be recorded, but it does not imply automated project cancellation, debt waiver or changing a completed sale.
