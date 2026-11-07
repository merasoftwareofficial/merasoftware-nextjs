# Not Now — verified no-countdown working plan

Status: implemented and tested locally. No deployment, live messages or production migration. Existing Lazy/Tough records require the reviewed migration below.

## Owner's current rule

- Replace Lazy and Tough with **Not Now** (`NotNow`); Reserved is a separate later task.
- A general lead/client follow-up with a remark and Not Now prepares a review popup, including when the person is already in that stage.
- The popup starts with the existing Negative `lead.finalMessage` action and its available editable templates. Admin chooses Send or Don't Send; follow-up stage is saved independently.
- This is an ordinary reviewed message: no FinalMessage countdown, automatic expiry or Dead transition. A reply does not automatically change the person's stage. Lead remains Not Now until a person or another existing business rule changes it.
- The user has asked for the existing Negative templates. Important: the built-in standard template currently promises that the offer closes after `{{timeLimit}}` (`backend/helpers/emailDefinitions.js:101`); this text will still appear in the review although Not Now starts no timer. Custom selected templates may have similar wording. The popup permits review/editing; do not silently change the shared Negative template or claim that the offer actually closes because of Not Now.

## Verified existing paths

- `backend/helpers/leadMessage.js`: ordinary message review already offers `lead.finalMessage` using the actual saved settings/templates and the normal email/WhatsApp sender. It explicitly creates no `FinalMessage` row and starts no countdown.
- `backend/helpers/leadContactBlock.js`: ordinary reviewed messages are checked against phone-based contact restrictions again on Send. An existing active Negative cycle can block a message; stage-change reconciliation must finish or safely defer such a cycle first.
- `backend/controller/lead/updateLead.js`: general follow-ups save the stage and remark together. Offer-specific follow-ups move only the offer's stage; they must not open a Not Now popup. Converted clients use client behaviour and retain Won.
- `backend/helpers/leadStatuses.js` and `models/leadModel.js`: legacy values must stay valid for old follow-up badges and stored data even though they are no longer selectable. `clientBehaviour` has its own enum.
- `backend/helpers/leadMessage.js` uses the same action setting and fills its existing `timeLimit` value. The expiry action is not part of the new no-countdown flow; there is no automatic closing message.

## Implementation plan and checks

1. Keep one backend status list: add NotNow, remove Lazy/Tough from selectable stages while retaining legacy stored values and history. Update portal stage/behaviour choices, filters, labels, Broadcast categories and website Offer Target person categories. Check stale client requests and historical follow-up editing.
2. Reuse the ordinary message-review path with the Negative action, preserving template editor, selectable variants, channel choices, queue and contact checks. Prepare it after saving a general Not Now follow-up for both leads and clients; reopen on another such follow-up. Handle unavailable template, contact and old-cycle-in-flight cases with an honest visible result. No FinalMessage tracking row should be created for the new message.
3. Preserve Negative behaviour unchanged, including its countdown, replies, Stop, closure and same-number protection. Confirm a prior Negative cycle is stopped safely before any Not Now message can be sent; never cancel an already handed-off message as if recalled.
4. Provide a dry-run-first migration for current Lazy/Tough lead status and client behaviour, including Trash. Preserve lead IDs, Won, historical badges, offer records and timestamps where appropriate. Flag active cycles/conflicts; use conditional updates, revision checks, a backup/rollback report and idempotent retries. Migration must not generate follow-ups, reviews or messages. No production migration without explicit authorization.
5. Test lead and client follow-up, repeated follow-up, no-name lead, Off template, missing contacts, review Send/Don't Send, WhatsApp/Email/Both, custom template, previous Negative countdown, blocked numbers, follow-up for an offer, edited history, migration/rollback and stale UI. Verify no countdown, no expiry message and no automatic stage change after valid or ignored replies. Test changed filter/list/detail and repeat Negative regressions.
6. Verify deployment compatibility across backend/worker, portal and website before migration; preserve unrelated changes. No deployment or live messages in this review.

## Local implementation and validation

- Lead and client general follow-ups prepare an ordinary review using `lead.finalMessage`; the normal send path creates no FinalMessage cycle. Each later Not Now follow-up can open another review. The existing Negative timer and reply logic are unchanged.
- New selection is NotNow; old Lazy/Tough statuses and follow-up badges remain valid until migration, and converting such a legacy lead carries NotNow to the client. Portal and website Offer Target labels/filters are updated.
- `backend/scripts/migrateNotNow.js` previews by default; apply requires a new backup file and `--maintenance`, with all lead and messaging writers stopped. It flags active cycles by lead and phone, preserves follow-up history, keeps client Won, and guards stale records. Backup holds pre-change fields for operator-reviewed rollback; no production migration has been performed.
- Existing backup directories were included by TypeScript's glob, so `tsconfig.json` excludes `backup`. Originals: `backend/backup/fix5`, `frontend/backup/fix4`, `merasoftware/backup/fix13`.
- Backend regression: 283/283 passed using isolated databases and simulated transports. Additional focused cases after the run: 6/6 passed, including Not Now lead and client, repeated follow-up, disabled template, previous Negative countdown and migration. Email, WhatsApp and Both review channels passed an additional isolated test; a later migration test verified same-phone active-cycle exclusion. Portal lead filters and offer/detail browser checks passed. Website Communication and Offer Target tests: 6/6 passed; the updated Offer Target test passed again 2/2. Website TypeScript and targeted ESLint passed.
- Standard Negative template still promises a deadline. It is reused as requested and appears in review; Not Now does not operate a countdown. Review the text before sending.
- Deployment and migration require coordinated backend/worker, portal and website versions. No live data has been inspected for migration counts.
