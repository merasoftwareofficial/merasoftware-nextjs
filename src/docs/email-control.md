# Email Control — templates, editor and sending rules (hand-over)

Read this whole file before touching email. It is the hand-over for the email work started 17 Oct 2026: owner decisions, how the system works end to end, where every piece lives, how to test it, the traps already hit, and the exact next steps with the research already done. Code-level weak points are in `CODE_AUDIT.md` (§ Email); the portal map `E:\Allprojects\frontend\src\DOCS\CODEBASE_MAP.md` §6b is the short current-state summary for portal/backend readers.

Three repos are involved: `E:\Allprojects\backend` (all logic, Render), `E:\Allprojects\merasoftware` (this site — the Email Control panel, Vercel), `E:\Allprojects\frontend` (portal — the review popup, Vercel). The portal's own `/admin-panel/email-control` page only redirects here.

## Owner decisions (17 Oct 2026, in order)

- An action's built-in wording is its **default template, editable** in the panel. One action can have **several templates**; the admin can pick **any of them when sending**, with the default preselected.
- Every mail uses **one branded layout** (navy header, footer); the admin edits only the content.
- The editor must be **human-friendly, like the blog editor** — "user coding nahi karega, sirf text edit karega". Never show `**`, `##` or `{{ }}`; details appear as named chips.
- **Mail a customer's own action starts gets no popup and no approval** — "approval ki kya jarurat … hum hi decide karenge". Its only setting is **On** (sends at once) or **Off** (no mail). Off until an admin turns it on.
- Actions an admin performs keep the Send / Don't Send popup.
- Every mail that really sends must become editable. For the 19 actions that never send, Claude proposed hiding their rows until a feature uses them (option A) vs. templates for all (option B); **the owner has not decided** — ask before step 4.
- Fixes must be clean and whole-system, never patches ("patch work nahi").

## Status

| Step | State |
|---|---|
| Pilot: Project created + Project cancelled as editable built-in templates, template choice when sending, branded layout | Done, pushed, live (owner confirmed by screenshot) |
| 1. Customer actions On/Off section | Done, owner approved ("bilkul sahi") |
| 2. Blog-style visual editor (website panel + portal popup) | Built and tested 17 Oct 2026, **awaiting owner review**; not pushed |
| 3. Migrate the 9 remaining live mails | Not started — research below |
| 4. The 19 never-sent actions | Waits for the owner's A/B call |

Pushing and deploying is the owner's job. Deploy order for every step: **backend first**, then website and portal.

## How a mail works (end to end)

1. A request handler calls a builder (`backend/helpers/emailService.js`, wrapped by `withEvent`) or `queueMail(event, mail, values)` directly. Mail is prepared **only inside a request**: `requestMiddleware` (`helpers/emailController.js`) opens a scope; cron, background jobs and requests without a signed-in, active, non-guest user get `suppressed` — nothing is created, nothing is sent.
2. `prepareMail` → `applyDefault` picks the content: policy Off → nothing; customer-started action not On → nothing; the lead form's already-reviewed mail (`reviewed: true`) → used as is; otherwise the policy's default template, else the action's **system template**, else (action not migrated) the builder's own HTML ("Built-in action template").
3. An `EmailDraft` is stored (`staged`). When the business response succeeds it becomes `pending` and a history row is written; on failure the staged draft is deleted.
4. **Admin action:** the response carries `emailDraftIds` + `emailStatus: 'awaiting-review'`. The portal's fetch interceptor (`frontend/src/helpers/emailReview.js`) opens `components/EmailReviewDialog.js`. **Customer action:** no ids are returned; if the action is On, `sendAutomatic()` runs after the response.
5. `decide()` is the **only** call to Resend. The first attempt locks the content; a retry reuses the same idempotency key and payload. Failed mail waits in Email Control → Pending email review.

## Where everything lives

| Concern | File | Notes |
|---|---|---|
| Action list, customer vs admin | `backend/helpers/emailCatalog.js` | 30 actions; `CUSTOMER_TRIGGERED` = the 3 customer-started ones |
| Draft, policy, send, auto-send | `backend/helpers/emailController.js` | `applyDefault`, `reviewedMail`, `sendAutomatic`, `decide`, `draftAccess` |
| Renderer + layout | `backend/helpers/emailMarkup.js` | stored-text markup, escapes, branded layout, `tableBlock` |
| Editor ↔ stored text | `backend/helpers/emailDoc.js` | `markupToDoc`, `docToMarkup`, `subjectToDoc`, `docToSubject` — the only conversion |
| Built-in templates | `backend/helpers/emailTemplates.js` | per migrated action: wording, variables (label, hint, sample), sections, `build()` data mapping; system template create/reset; editor helpers |
| API | `backend/routes/emailControl.js` | mounted at `/api/email-control` |
| Models | `backend/models/emailControlModel.js` | `EmailTemplate` (`system`), `EmailPolicy` (`review`/`auto`/`off`), `EmailDraft`, `EmailHistory` |
| Legacy builders | `backend/helpers/emailService.js` | 2 migrated builders are 2-line calls to `sendTemplatedEmail`; the rest still build HTML |
| Panel | `src/app/admin/email-control/email-control-panel.tsx` | tabs, rules tables, customer section, template dialog, review dialog |
| Website editor | `src/app/admin/email-control/email-editor.tsx` | Tiptap 3; `EmailEditor`, `EmailPreview`, `chipDoc`, `plainDoc`, `docHasContent` |
| Proxy | `src/app/api/email-control/[[...path]]/route.ts` | **allow-list** of backend paths — add every new backend route here |
| Types | `src/lib/email-control-types.ts` | optional fields = may be missing from an older backend |
| Portal popup | `frontend/src/components/EmailReviewDialog.js`, `EmailEditor.js` | Tiptap 2; template dropdown only when `templateOptions` arrives (admins) |
| Portal queue | `frontend/src/helpers/emailReview.js` | intercepts responses with `emailDraftIds`; lead form uses `reviewEmail(preview)` |

## Stored text vs. editor document

- **Stored text** (templates' `text`/`subject`, drafts' `text`) is plain text with a small markup the user never sees: `**bold**`, `## ` heading line, `- ` list line, bare `https://` links, `{{variable}}`, and a section such as `{{refundTable}}` alone on a line. A backslash makes the next of `\ * # - {` literal. Values are inserted escaped (`render`), so a customer named `**A**` cannot become bold. Subjects are plain (`render(..., { plain: true })`).
- `render` drops a line whose placeholders are **all empty** — that is how optional details (offer, reason, refunds) disappear without template logic.
- **Editor document** = Tiptap JSON: `paragraph` (with `hardBreak`), `heading` level 2, `bulletList`/`listItem`, `bold` and `link` marks, `emailVariable` (inline chip, `attrs.key`) and `emailSection` (block chip, `attrs.key`). `docToMarkup` refuses anything else and any unknown key (`status 400`). Nested lists are flattened; a link whose text differs from its URL becomes `text (url)`.
- The format in the database never changed, so there was no data migration. A round trip may only normalise layout (e.g. a blank line after a heading); the rendered mail and the document must stay identical — the backend test checks both system templates.
- API shape: templates come with `doc` + `subjectDoc`; saves/previews accept them (plain `subject`/`text` still accepted). Drafts come with `doc` + `editorFields` (`variables` = details this mail has values for, `blocks` = its sections, each with `label`/`hint`); previews and decisions accept `doc`. A reviewer's chips are filled with that draft's own values (`reviewedMail`).

## The panel today

- **Portal tab, admin actions table:** sending rule (Ask before sending / Off), default template, Add template, Edit buttons.
- **"Customer actions (automatic)"** section: Update request received, New update request (admin), UPI payment pending (admin) — **On — send automatically / Off**, Off by default (no policy row = Off; an old `review` row also counts as Off).
- **Built-in template** (Project created, Project cancelled): "Edit Standard (built-in)", "Reset to original", cannot be deleted; "Add template" copies its wording. Other actions show "Built-in action template" (code HTML, not editable; can only be replaced by a custom template using `{{subject}}`, `{{message}}`, plus `{{name}}` for New lead welcome).
- **Template dialog:** name, one-line subject editor (chips allowed), message editor (Bold · Heading · • List · Insert detail…), "Preview sample" (real layout with sample values, region "Sample email"), "Reset to original" for built-ins.
- **Review dialog** (panel and portal popup): template dropdown (admins only; built-in listed first), subject input, message editor with this mail's chips and sections, "Update preview", Send / Don't Send.

## Before → after (17 Oct 2026)

- Templates were plain text with only `{{subject}}`/`{{message}}`; built-in wording was invisible; an edited mail went out as a pre-wrapped text box (`textHtml`, removed). Now: system templates, branded layout, visual editor.
- Customers got the Send / Don't Send popup for their own actions. Now: On/Off, no popup.
- The cancellation reason was inserted unescaped; a missing name printed "Hello undefined"; a link inside quotes broke (`&quot` inside `href`). All fixed.
- The lead popup's reviewed mail was wrapped again by the lead's default template. Now the reviewed text is final.
- Old upload links on `www` answered 404; now redirected (see `login.md`).

## Tests (run all three after any change)

- Backend: `cd E:\Allprojects\backend && npm run test:email` — 32 tests, in-memory MongoDB, Resend mocked.
- Website: `npm run test:email` here — 15 tests: route tests through the real proxy plus Playwright browser tests of the bundled panel against a real in-memory backend. The harness serves only the panel's CSS module, **not `globals.css`**, so the blog toolbar classes look unstyled in its screenshots; the live site is styled.
- Portal: `cd E:\Allprojects\frontend && node tests/email-control-browser.cjs` — popup with mocked responses (uses this repo's esbuild/playwright).
- Selectors: the editor is a contenteditable with `aria-label` ("Message", "Subject") — `fill()` works, `inputValue()`/`isDisabled()` do not (check `contenteditable="false"`); chips are `[data-email-variable=key]` / `[data-email-section=key]`; insert via the select labelled "Insert detail into Message".

## Traps already hit (do not repeat)

- **Deploy order crashed the live page once:** Vercel shipped the panel before Render shipped the backend, and the panel read a missing `catalog`. Every frontend must work when a new response field is missing (`?.`, optional types, `plainDoc` fallbacks).
- **Counts:** "9 live / 21 dead" was said once and was wrong. Real: 11 live (2 migrated + 9 to go), 19 never sent. Re-check by grep before quoting.
- **Tiptap editor rebuilt on every render** when its labels depended on a fresh `[]` default — key editor options by content (`labelsKey`).
- **Two "Subject" texts** in the template dialog (editor + sample) break `getByText` — scope to the "Sample email" region.
- **Tooling on this PC:** Git Bash heredocs swallow backslashes (edit JS with backslashes through files or the editor, not inline heredocs); `grep -c $'\r$'` does not detect CRLF here — use `file`. Git normalises line endings (`core.autocrlf=true`, index is LF), so working-copy CRLF/LF differences never reach a commit.
- The admin review route without `?application=` limits an admin to their own drafts; Email Control always sends `application`, so retries go through it.

## Next: step 3 — migrate the 9 remaining live mails

Pattern (copy `sendProjectCreatedEmail`): add a definition to `emailTemplates.js` (subject, text, variables with label/hint/sample, sections, `build(...)` returning `{ to, values, blocks }`), make the builder a 2-line `sendTemplatedEmail` call or pass `values` to `queueMail`, delete the old HTML, add backend tests (draft content, empty lines dropped, escaping) and a round-trip check. One section at a time, owner review between sections.

| Mail (event) | Trigger / caller | Data available | Watch out |
|---|---|---|---|
| New lead welcome (`lead.created`) | admin; `createLead.js` + `POST /lead-preview` (`routes/emailControl.js`) | lead name, email | the popup reviews **before** the lead exists (`reviewed: true` path); keep preview and send on the same template |
| Update request received (`sendUserConfirmation`) | **customer**; `submitUpdateRequest.js` → `sendUserConfirmation(populatedRequest)` | `userId.name/email`, `updatePlanId.productId.serviceName` | **throws for a project** (no `productId`) — map the service/project name safely; customer section (On/Off) |
| New update request (`sendUpdateRequestNotification`) | **customer**; same file → `(populatedRequest, adminEmails)` | customer name/email, service, `files.length`, instructions list, `ADMIN_DASHBOARD_URL` | goes to admins; instructions = a section block; same project crash |
| UPI payment pending (`sendAdminUPIPendingNotification`) | **customer**; `createOrder.js` → `(populatedOrder)` | customer, order id, quantity, price, discount, coupon, total, paid, remaining, dashboard link | goes to admins; amounts use `toLocaleString()` without locale today — use `en-IN` |
| Monthly invoice (`sendMonthlyInvoiceEmail`) | admin; `monthlyInvoiceController.js` `resendPaymentRecordInvoice` → `(user, order, invoice, pdf)` | name, `order.productId.serviceName`, invoice no./date, period start/end, due date, amount | keep the PDF attachment |
| Payment reminder (`invoice.reminder`) | admin; `sendPaymentRecordReminder` → `queueMail` | name, reminder message (admin text or `reminderTemplates.gentle/overdue/final`), invoice no., amount, due date | PDF attachment; `reminderInvoice` counter must still update only on delivery |
| Project payment summary (`invoice.project`) | admin; `projectFinalInvoiceController.js` `resendProjectFinalInvoice` | name, invoice no. | PDF attachment |
| Subscription confirmation / management (`website.subscription.confirm/manage`) | public; this site's `src/lib/notify-emails.ts` (`confirmMail`, `manageMail`) → `POST /website-drafts` | site name, topics line, confirm/manage URL | `requiredLinks` must stay; the site sends its own `html` today — move wording to the backend and send values only; the decision for these is validated by this site's proxy |

## Step 4 — the 19 never-sent actions

18 builders have no caller (verified by grep 17 Oct 2026): `sendAdminAutoRenewalNotification`, `sendAdminPurchaseConfirmationEmail`, `sendCallbackConfirmation`, `sendCallbackRequestNotification`, `sendContactFormConfirmation`, `sendContactRequestNotification`, `sendDeveloperAssignedNotification`, `sendDeveloperAssignmentEmail`, `sendMonthlyLimitedPlanActivationEmail`, `sendPaymentRejectionEmail`, `sendPlanClosureEmailToAdmin`, `sendPlanClosureEmailToCustomer`, `sendProjectMessageEmail`, `sendProjectUpdateEmail`, `sendPurchaseConfirmationEmail`, `sendUpdateCompletedNotification`, `sendWalletRechargeConfirmationEmail`, `sendWalletRechargeRejectionEmail`. The 19th, `auth.otp`, is called only by the unauthenticated `/resend-otp`, so it is always suppressed. Do nothing until the owner chooses A (hide rows) or B (templates for all).

## Backups

Numbered rollback folders from this work (each holds the files as they were before that step): `work98-external-upload-redirect`, `work99-email-templates` (pilot), `work100-catalog-guard`, `work101-customer-email-control`, `work102-docs`, `work103-visual-editor` — in each repo that the step touched.
