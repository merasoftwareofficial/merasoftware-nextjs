# Client status and Final Message recovery

Implemented locally on 4 November 2026 across backend, portal frontend and website offer targets. No production writes, deployment, environment changes or real sends.

## Result

- The portal identifies converted records as Client and labels the existing clientBehaviour control Current status. The client follow-up form displays current status instead of an unchangeable Matured stage selector. Client list badges/filter and client workspace use the same wording. Offer-specific stages remain separate.
- Negative transitions through both admin APIs use `backend/helpers/clientStatus.js`. Repeating Negative can recover a missing review or reopen the same undecided review; it does not implicitly restart a completed cycle or send a message.
- `clientFinalMessageReadiness.js` reports specific account, link, phone, state and server-flag reasons. Preparation additionally checks the Final message action's Off policy without letting a template setting change an already-running timer.
- The detail page displays why preparation is blocked, whether a countdown actually exists, review/queue results, and a live countdown based on a server timestamp plus monotonic elapsed time. Delivery results are presented immediately from queue/draft records without waiting for the minute job. The backend remains authoritative.
- Website offer-target status changes prepare the same tracked review and provide a link to the portal to review/resume it. No first message sends just because the status was saved.

## Recovery and concurrency

- Client drafts have a deterministic recovery key based on client, behaviour revision and previous draft. If tracking persistence fails, remove the orphan from the response's review list. Its Send decision is refused until tracking exists. Retry attaches the same draft and preserves the hours it promised, even if the global time setting changed meanwhile.
- An expired/skipped review can be prepared again while the client remains Negative. Expired orphan recovery advances to a stable retry key. Compare-and-set tracking writes prevent a slow/expired-lease preparation from replacing a newer cycle; status writes also compare the current revision.
- Explicit Start new final message can retire a legacy lead episode: cancellation of unsent queue work and retirement are transactional, an in-progress send is refused, and the old episode is preserved in history. Normal Negative saves do not silently replace it.
- Queued client first messages and expiry replies recheck eligibility before sending, including after typing. Changing client status, identity or phone cancels obsolete client messages. Ordinary untracked messages that use the Final Message template retain their existing behavior.
- The timer starts from successful WhatsApp sentAt, uses its frozen configured hours, and moves clientBehaviour to Dead without removing the client account or its financial/project history. Existing real/ignored/late reply handling and the quoted expiry message remain.

## Owner's reported production client

Read-only audit of lead `6ad7525e0767c241e0663bca` in `merasoftware-db`: Won, Negative, active linked customer account, eligibility data valid when checking with automation assumed enabled, no FinalMessage tracking record. WhatsApp worker was connected with a recent heartbeat at inspection time. No record repair was indicated by this snapshot.

The deployed backend version and its actual CLIENT_FINAL_MESSAGE_ENABLED value were not accessible through this database read. The data check must not be presented as proof of a live enabled flag. Deploy the corrected backend/UI, inspect the new readiness result and verify the runtime flag. After activation prerequisites are satisfied, the existing Negative client can resume through Retry final message without toggling status. Do not bulk-start existing clients or send to this client as an activation test.

## Validation

- Backend combined Final Message, offer targets, general lead message, review delivery, sender and connection suites: 147/147 passed. Final Message suite includes seven new diagnostic/recovery/legacy/concurrency cases, in addition to the existing deadline/reply coverage.
- Website offer-target proxy/browser suite: 2/2 passed, including Negative preparing a tracked review and exposing the recovery link without queueing a message.
- Website `npx tsc --noEmit --pretty false`: passed. Targeted ESLint on the two changed offer-target components: passed.
- Portal production build: passed. Full portal lead/proposal/client navigation browser run: all checks passed with production CSS, including disabled-flag explanation, retry, no client stage dropdown, ticking server countdown and mobile layout. Immediate queued/sent presentation was also verified separately against the actual detail API before the minute job runs.
- Browser test fixtures use isolated databases and fake phone/email transports. No real WhatsApp delivery was tested. Existing build dependency age/deprecation notices were not changed.

## Backup and rollout

Original files are in `E:\Allprojects\backup\client-status-working-20261104`, separated by repository. Mobile screenshot is in its `screenshots` directory. Unrelated user edits were preserved.

Deploy backend and WhatsApp worker together before/with the portal and website. Verify transaction support and required indexes; existing migration tooling requires a reviewed maintenance plan for missing canonical records. This implementation does not guess identity matches or run that migration. Confirm the client flag, WhatsApp enablement, cron operation, template policy and worker connection. Perform controlled Send/Don't Send, real reply, ignored reply and short timeout tests on an owner's test number before treating live behavior as verified.
