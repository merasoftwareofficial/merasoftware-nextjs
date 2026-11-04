# Final Message expiry reply

Implemented locally on 4 November 2026. Backend changes only; the website's existing template editor discovers the new action from the catalog. Not deployed or verified with a real WhatsApp account.

## Owner's wording and behavior

Email Templates → Portal → Final message expired contains the editable Standard template. The default WhatsApp body is:

> Your offer period has ended, and your offer is now closed.
>
> If you need digital marketing or website-related services in the future, please visit www.merasoftware.com.

There is no time variable or hours in this template. This is a WhatsApp-only automatic reply quoting the original Final Message, without another Send popup. The existing final-message time setting still controls the deadline.

## Implementation

- `backend/helpers/emailCatalog.js` and `emailDefinitions.js`: system action `lead.finalMessageExpired`; existing editor, default-template selection and Off policy apply. No email is sent by the expiry dispatcher.
- `finalMessage.js`: newly prepared cycles opt in with `expiryEnabled`. Existing cycles without this flag, including already completed cycles, do not send expiry messages. A new episode clears the old expiry marker and quote snapshot.
- `finalMessageJobs.js`: when the original WhatsApp has sent, persist its message id, resolved chat and text on the cycle. Existing reply/deadline/Dead behavior is retained. The minute job drains the expiry outbox after processing replies and deadlines.
- `finalMessageExpiry.js`: closed, opted-in cycles with no real reply and an eligible recipient queue their expiry. Queue insertion and the permanent `expiryQueuedAt` marker share one MongoDB transaction, so interruption before commit retries and queue retention cannot cause another send. Queue has a unique partial index on `finalMessageExpiryId` (the original draft id).
- `sender.js` and `whatsapp.js`: validate eligibility before resolving and again after typing, then send the quote via Baileys `quoted`. A real reply, changed phone/stage/cycle, deleted recipient or disabled policy cancels the pending expiry. Ordinary sends retain their existing behavior.
- Existing client behavior automation is not repaired by this work. Expiry follows an eligible client cycle only if the existing flow successfully closes it. Its account/phone/revision checks still apply.

Sending follows the existing queue, pause, quiet hours and connection rules; the deadline is not a guarantee of delivery at that exact second. Failed/expired/cancelled sends remain visible in WhatsApp history. The sender's existing interrupted-send handling remains: ambiguous mid-send results are not automatically resent.

## Verification

- Backend `npm run test:final-message`: 38/38 passed, including edited template, no hours, exact quote, repeated job, retention, real reply/stage/phone cancellation, historical exclusion, transaction rollback/retry and Off policy.
- Backend `node --test whatsapp/tests/sender.test.js whatsapp/tests/connection.test.js tests/emailControl.test.js tests/whatsappQueue.test.js`: 88/88 passed, including quoted transport options and cancellation after typing.
- Website `npm run test:auto-reply`: 3/3 passed (proxy permissions and browser Final Message/Auto Reply flows).
- Tests use isolated MongoDB and simulated transports. Real-number verification remains after deployment.

## Backups and rollout

Backend originals: `E:\Allprojects\backup\backend\final-message-expiry-20261104`. Website handover original: `E:\Allprojects\backup\merasoftware\final-message-expiry-20261104`. New files have no earlier version.

Deploy backend and its embedded WhatsApp worker together, confirm the new queue index is created, then prepare a new cycle on an owner's test number. Verify the quoted expiry reply and a cancellation while it waits. No production messages were sent during implementation.
