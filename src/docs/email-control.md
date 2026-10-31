# Email / message review — current hand-over

Update this doc alongside verified corrections and completed work. Keep current decisions, essential contracts, pitfalls and next actions; replace stale notes, no repeated history. Replies Hinglish; UI/code/docs English. No raw markup or template syntax in UI.

Repos under E:\Allprojects: backend (delivery/templates, Render), merasoftware (website admin, Vercel), frontend (portal review popup, Vercel). Back up before edits outside repos. Commit/push/deploy and production writes only on owner instruction; deploy backend first, then website/portal. No production contacts or real messages were used during this work.

## Current work

Project-node review integration and personal admin contact settings: see [node-communication-settings.md](node-communication-settings.md) for current contracts, migration and verification. Both reuse this communication pipeline.

Compact review upgrade is implemented and tested locally, not committed/pushed/deployed. Owner review and real-contact test remain pending. Owner now requires popup saves to create a new purpose-scoped template, preserving existing templates and defaults.

- Popup: recipient/attachment summary → Send via (Email/WhatsApp/Both) → template dropdown → subject/message editor → collapsible details/preview → Save template, Don't Send, Send. Missing contacts/channels disabled with a reason; backend validates again. WhatsApp is queued, not claimed delivered.
- Save template in both shared review popups creates a new custom template through POST /templates with sourceTemplateId, event and a visible New template name. The backend derives the action from the source and rejects mismatches/application violations. The new ID is added to the current dropdown and selected. Originals and EmailPolicy.defaultTemplate remain unchanged. Send uses current edits once; it does not silently save them. Name chips remain reusable; actual customer values appear only in preview/output. Explicit template-management Edit still uses PUT with revision protection.
- Default template selection still belongs to EmailPolicy.defaultTemplate, otherwise Standard. Multiple saved templates already existed and are reused. Older drafts without a known source template cannot save over a guessed template; selecting an original explicitly enables editing it.
- Automatic/customer/system actions retain existing On/Off behavior and legacy email→WhatsApp copy flow. This change adds explicit channel selection to reviewed messages, not new automatic sending rules.

## SSOT and files

Backend:
- helpers/emailCatalog.js and emailDefinitions.js own action identities, definitions, fields and build data. Never invent a second variable registry.
- models/emailControlModel.js owns EmailTemplate, EmailPolicy, EmailDraft and EmailHistory. Templates store canonical subject/text; documents are derived by emailDoc.js. emailMarkup.js owns rendering, literal value escaping and required links.
- helpers/emailTemplates.js: templateWithDocs/templateFromEditor reuse existing editor conversion. composeTemplate returns sourceTemplateId; prepareMail persists it. editableReview returns OPTIONAL templateDoc/templateSubjectDoc, selectedTemplateId, templateLabel and templateRevision, plus a current templatePreviewHtml/templatePreviewSubject matching the source editor; legacy doc/text remain rendered for older clients. reviewSubjectFromEditor resolves subject chips. Review fields include all allowed action fields, including empty optional values/sections.
- routes/emailControl.js: original-template metadata on GET draft and template-choice preview; existing PUT /templates/:id supports expectedUpdatedAt compare-and-set. It scopes saves by action/application/admin. New POST /review-preview serves only unsaved lead.created/lead.proposal previews; it never sends. Final values/contacts come from saved business records.
- helpers/emailController.js: decide dispatches explicit selections to reviewDelivery.js; decideEmail is the existing single email-provider call. Do not add another provider call. Legacy callers without explicit channels still use existing behavior.
- helpers/reviewDelivery.js owns channel availability, first-attempt snapshot, renewable processing claim and partial retry. EmailDraft.delivery stores chosen channels, frozen content/recipient phones, emailStatus/whatsappStatus and temporary lease. Retry cannot change content/channels; already accepted email is not sent again. WhatsApp enqueue failure can be retried without repeating successful email, and vice versa. Email provider keeps its existing draft idempotency key.
- helpers/whatsappQueue.js remains the only queue insertion path; enqueueWhatsAppForEmail now also accepts frozen recipients + strict error reporting for reviewed delivery. Unique emailDraftId+email prevents duplicate enqueues on retries. The existing sender alone sends and owns pacing/transport retries; no queue bypass or extra Broadcast coupling.
- History stores only channel outcome metadata, not delivery bodies/leases. WhatsApp-only uses queued status and is excluded from email-sent totals. A partial failure remains reviewable even if email audit says sent: emailOutbox.reconcileSent and summary must not hide explicit-channel unfinished delivery.

Frontends:
- Website src/app/admin/email-control/email-control-panel.tsx and email-editor.tsx; optional types in src/lib/email-control-types.ts. Existing proxy template/draft routes are reused, no new website data store. Compact editor keeps optional details behind a disclosure; labels/chips, not code syntax.
- Portal src/components/EmailReviewDialog.js and EmailEditor.js; src/helpers/emailReview.js serializes popups. Saved-draft popup now performs its decision while open, keeps partial failures visible and returns processedResult; decideDraft MUST NOT submit that result again. Legacy response fields remain optional.
- setEditable(..., false) in both editors is essential: enabling/disabling is not a content change, otherwise previews/typing can be reset. Stable labelsKey prevents editor rebuilds on every render.

## Special paths and boundaries

- Add Lead is reviewed before saving: AdminLeadsPage sends form name/email/phone to /lead-preview. Preview can select templates and save new copies but cannot send. createLead re-derives values/contact from validated form, saves the business record, then requestMiddleware decides the prepared draft. Duplicate/refused business actions never deliver. Result messageDelivery reports email sent / WhatsApp queued / unfinished delivery.
- Phone-only proposals keep the existing LeadProposals preview/decision endpoint. leadProposalMessage.js now shares original-template metadata/selection and subject-chip handling; it permits WhatsApp only, derives values/link from the saved lead/proposal and uses a deterministic queue ID per lead/version. Existing proposal claim remains. No second popup or new email draft is created for that path.
- Both means independent email acceptance and WhatsApp queue submission. One may succeed while the other fails; only unfinished submission retries. Once queued, WhatsApp transport outcomes/retries live in the existing WhatsApp queue UI.
- Files remain email attachments; WhatsApp sends text and its links, as before. Required links survive edits. Invoice reminder counters change on email acceptance only. Subscription confirmation requires email; website proxy still validates subscriber/token/state before approval.
- Current/legacy filled review text must NEVER be reverse-converted into a reusable template by matching customer names. Do not weaken app/event/admin checks, replay a business action for preview/save/retry, or create a second template/sender/converter.

## Verification / next action

- Backend npm run test:email includes existing emailControl and new reviewDelivery integration tests: original chips/explicit-edit stale save/new-copy action isolation, three channel choices, contact validation, double submit, partial retries, unsaved leads and phone-only proposal. In-memory MongoDB, provider mocked, no real messages.
- Website npm run test:email uses actual proxy/backend/database and browser editor. New compact case checks source chips, new-template POST and WhatsApp-only without email. Legacy tests open the new details disclosure where needed.
- Portal node tests/email-control-browser.cjs covers legacy flow plus compact source chips/channel selection/new-template POST and processedResult exactly once.
- Passed: backend email 51/51 (includes 10 new delivery cases), lead-status 41/41 and current WhatsApp suite 86/86; website email 23/23, portal browser script (legacy + compact flow), TypeScript and targeted ESLint. Source-preview alignment was also rechecked after the final correction. No real provider/phone delivery tested.
- Pre-change backups in each repo's external backup directory: E:\Allprojects\backup\<repo>\review-channels-20261030-232825. New files have no old version. Preserve concurrent unrelated Auto Reply work.
- Next: owner reviews compact popup; real-email/phone test and deployment remain pending owner instruction. No production setting was enabled by this work.


## Popup save correction — 31 October 2026

Both shared review surfaces now create new custom records rather than updating their selected source. This covers portal saved drafts, pre-save Add Lead and phone-only proposal previews, plus website Communication review. Existing POST /templates, EmailTemplate, event registry, editor conversion and purpose-filtered templateOptions remain the only pipeline. Explicit template-management edits/resets retain their existing behavior. Lead-page manual messaging remains deferred.

Regression proof: two successive copies survive in later drafts, Standard/custom source and default remain unchanged, chips stay reusable, other purposes cannot select the copy, and saving sends nothing. Website actual-backend browser and portal browser checks verify new ID selection and retained originals/options. Backend 51/51, website 23/23 and portal browser checks pass locally; no production writes or messages. Backups: backend backup/fix1, portal backup/fix2, website backup/fix1.
