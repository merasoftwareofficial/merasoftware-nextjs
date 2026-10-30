# Project nodes and admin contact settings

Local implementation; not deployed. Backups: `E:\Allprojects\backup\<repo>\node-settings-20261031-005528` (backend, frontend, merasoftware). Preserve unrelated working changes.

## Sources of truth

- Backend projectNodeService owns nodes/progress. POST `/api/admin/projects/:orderId/nodes` saves a node before preparing the existing `sendProjectUpdateEmail` review. A request UUID + fingerprint lives on that node; version-checked saves serialize concurrent appends. Replaying the same UUID returns the saved event; a different payload is refused.
- projectNodeCommunication builds recipient/name/project/progress from saved records, with a stable node draft dedupe key. Existing EmailTemplate/EmailPolicy/EmailDraft/EmailHistory and the existing reviewDelivery/WhatsApp queue handle everything after that. No second popup or transport. Off remains authoritative; no automatic admin notifications were added.
- POST `/api/admin/projects/:orderId/nodes/message` reviews/retries a saved node without changing progress. Pending/failed/staged drafts can reattach to the central request middleware; skipped/sent/queued/expired/history-only events do not create another notification. Hidden/deleted/archived/edited/starting nodes cannot prepare a message. Draft content is a snapshot of that node's progress, not a later project's progress.
- Portal AdminProjectCheckpointDetail has one Add Node action, clears inputs only after confirmed save, and offers saved-node message review. At 100% it offers completion-message review rather than an impossible additional node. Customer progress displays the saved value without integer rounding.

## Template compatibility

- The Standard project-update text is neutral and includes customer, project, node, percentage and optional portal link. Phone-only builders are supported. Only the exact untouched previous Standard wording is upgraded; edited templates/default selection remain unchanged.
- Existing non-broadcast messageTemplate records import into central EmailTemplate on project-template access, using unique legacySourceId. Old records remain, with a migration marker/reference; future central edits/deletion are authoritative. Unknown variables are skipped for review rather than guessed. No rendered customer text is converted into reusable fields.
- `node scripts/migrateNodeTemplates.js` reports remaining legacy candidates; `--apply` imports. This uses the configured DB: choose/verify the target before any operator run. No production migration was run locally.
- Popup Save Template updates the selected original; sending does not silently save a template. WhatsApp queued is not reported as delivered. Partial retries reuse existing channel snapshots and provider/queue idempotency.

## Personal settings

- GET/PATCH `/api/admin/my-settings`: authenticated current non-guest active admin only. The target is always req.userId. Returns only name, loginEmail, contactEmail, whatsappNumbers and supported countries.
- User.name is reused; User.adminContact owns contact email and up to two unique normalized country-code numbers. Login email/phone, public business details, passwords and global AdminSettings are not changed. Existing phoneNumber.js parser/country list is reused. Numbers are stored as contacts, not claimed OTP-verified.
- React `/admin-panel/settings` and Next.js `/admin/settings` use that backend. Website-only admins cannot access personal portal settings. Next proxy `/api/admin-contact-settings` also checks same-origin writes. Existing business-settings placeholder form is unchanged.

## Verification

- Backend `node --test tests/nodeSettings.test.js tests/offerReservations.test.js`: 53 passing (10 new node/settings cases + 43 reservation regressions).
- Backend `npm run test:email`: 50 passing, mocked email provider and isolated MongoDB.
- Website `npm run test:email`: 23 passing, including actual admin-contact proxy/backend authorization and persistence, plus communication browser regressions.
- Portal `node tests/email-control-browser.cjs`: existing popup/channel/original-template behavior passes.
- Portal `node tests/node-settings-browser.cjs`: failed-save preservation, single button, saved-action popup, React/Next contact forms, country codes and 100% completion state; mobile viewport interaction. Layout/auth shells are fixtures; backend rules are integration-tested separately.
- Website TypeScript and targeted ESLint pass. Portal targeted ESLint has no errors; existing workspace/project warnings remain.
- Portal `npm run build` succeeds with existing lint/Browserslist/bundle-size warnings.
- No production DB writes, real contact delivery, commit, push or deployment. Provider delivery needs a designated test recipient and deployed/configured transport. Deploy backend before frontends.
