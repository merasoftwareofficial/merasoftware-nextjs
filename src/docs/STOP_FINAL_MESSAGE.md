# Stop countdown

Implemented locally on 4 November 2026. No production changes or real messages.

Correction update: the earlier implementation had four verified Stop/classification defects. The corrected backend/worker is documented in [FINAL_MESSAGE_CORRECTIONS.md](../../../backend/docs/FINAL_MESSAGE_CORRECTIONS.md), with 292/292 local regression checks passing. Deployment and historical recovery remain pending; the validation paragraph below records earlier checks, not production evidence.

## Admin control

Lead/client detail has Stop countdown for an active review, queued first message, waiting timer or unsent closure. The admin enters a reason, such as a client's request by phone, and confirms. The request includes the current draft id so a stale page cannot stop a newer cycle.

The shared backend stop service records stoppedAt/reason/source/actor, cancels pending or explicitly preparing original/closure queue rows, invalidates an undecided draft, and adds one timeline note. The lead/client's current status, original sent time and deadline are unchanged. Repeat Stop is idempotent. Typing can be stopped before the committed transport handoff. An already sent closure or committed handoff cannot be recalled; legacy sending work with unknown phase is handled conservatively.

Stopped cycles are excluded from expiry dispatch and historical recovery. They do not resume on the next cron or a repeated Negative save. Start new final message is an explicit action; the prior stopped episode is archived and a new timer starts only after its new WhatsApp message sends.

## Our outgoing messages

Ordinary outgoing messages from the connected phone, and successful manual messages sent through the system, stop the relevant cycle even when Auto Reply detection is Off. Reactions, protocol/housekeeping events and recognized automated queue messages do not stop it. The automated first Final Message and expiry reply must not stop themselves.

Outgoing checks are retained on tracked cycles. The existing sender also retains per-attempt ID/source metadata before transport, independently of queue/draft TTL. This is identity bookkeeping, not another queue. Successful manual sends are recoverable without an echo or immediate sender callback; ambiguous delivery/provenance holds closure for reconciliation. New cycles retain a precise start timestamp so earlier system manual attempts cannot stop a new episode. Historical direct-phone conversation cannot be inferred from absent evidence.

Stopping and timeout write the same tracking row in transactions. The lead timeout now commits its Dead transition transactionally as the client timeout already did. Pending queue cancellation shares the stop transaction, so a concurrent sender claim cannot silently bypass it. No new sending path is introduced.

## Validation and rollout

The combined Final Message/offer targets/general message/inbound/sender regression run passed 144 checks before the additional deadline-interleaving test; admin permission and stop-before-timeout targeted tests passed. The final Final Message/inbound run passed 63/63. Full portal browser checks passed, including the phone-call reason, unchanged Negative status, disappearing countdown and explicit restart action. The final portal production build passed. All fixtures use isolated MongoDB replica sets/fake transports.

Backup: `E:\Allprojects\backup\stop-countdown-20261104`, separated by repository. Deploy backend and worker with the portal UI, then verify an owner's test number. Transaction-capable MongoDB is required. No production backfill or closure batch has been applied by this work.
