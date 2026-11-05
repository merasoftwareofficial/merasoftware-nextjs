# Signup and Lead: one main phone = one person = one lead

Last updated 6 Nov 2026. Read this file before continuing.

Repos:
- Backend: `E:\Allprojects\backend` (Express/MongoDB).
- Portal: `E:\Allprojects\frontend` (React).
- Website: `E:\Allprojects\merasoftware` (Next.js; this document).

## 0. Start here

- Read owner decisions in section 3. These replace old proposals, especially Trash identity rules and final-message dual delivery.
- Phases 1-6 are implemented and locally validated. Do not rebuild them from an older plan. Changes remain uncommitted and undeployed; existing staged changes have been preserved.
- For current implementation and verification, read sections 5-7. Section 8 is the remaining work.
- No production audit, migration, cleanup, commit or deployment has been run. Owner approval for coding is not approval for these operations.
- Reply in Hinglish. Back up before changing any file. Keep this document forward-only.

## 1. Now / next

**Done:** Phases 1-6, including the previously missing regression coverage and the three recovery-test failures. Full backend and WhatsApp worker tests pass; portal production build passes.

**Next:** owner-run production read-only audit (section 10), then design the Phase 7 preview from its counts. Separately prepare approved production deployment/index migration and enable alt sending only after indexes are ready. The alt switch defaults off.

## 2. Scope

One person should reuse their one lead across signup, reservation, plan requests and conversion. Main phone is identity; alt is contact only. Preserve working service, guest, team, partner and referral behavior; do not widen scope. Portal admin creation is the explicit exception that bypasses website signup leads.

## 3. Owner decisions (final, do not re-ask)

1. **One main phone = one person = one lead.** The phone is the identity. Email is lead data.
2. **Signup creates a lead**, or updates the person's existing lead. This replaces decision 11 in `OFFER_RESERVATION_REMINDER_PLAN.md` ("reservation creates the lead").
3. **Signup is refused** when the email or the main phone already belongs to a live account: "This number/email is already registered. Please sign in."
   - A guest account does not count. A banned (`isActive: false`) account counts.
   - A trashed account (`deletedAt` set) **counts** until it is purged (owner, 6 Nov). It can still be restored, and restore does not check the phone, so freeing its phone would give one phone two live accounts. Its email is already blocked today by the unique email index. Only a purged account no longer counts.
   - The portal's admin Add-account forms follow the same phone rule: an account on a phone that a live or trashed account holds is refused, and the error names that account (owner, 6 Nov).
   - Signup OTP comes later, for signup only, never login. Do not build it now. A provision already exists: `SIGNUP_PHONE_OTP_ENABLED` and `phoneVerified` in `helpers/phoneNumber.js`.
4. **The alt phone is for contact only, never login or identity.**
   - Identity (signup refusal, linking, duplicate-lead checks, convert) uses **main numbers only**.
   - Contact uses **main + alt**: sending, recognising an incoming reply, do-not-disturb, and not messaging one number twice.
   - The alt number exists only on leads, entered by an admin. Signup has no alt field.
5. **Every message also goes to the alt number**, broadcasts included. **Security messages go only to the number the user entered** (the account's main phone):
   - `sendClientAccountCreatedEmail` (login details)
   - `auth.otp` (defined, nothing sends it yet)
   - anything else carrying login data
6. **Signup lead rules**, checked in this order:

| # | Situation | Result |
|---|---|---|
| 1 | Email already on a live or trashed account | Signup refused (already the behaviour today) |
| 2 | Main phone already on a live or trashed account | Signup refused (new) |
| 3 | Main phone = a free lead's **main** phone | Link that lead (`reservationUserId`). Lead email ← account email; the old email goes into a follow-up note "Signed up on website. Earlier email: …" |
| 4 | Email = a free lead's email | Link that lead. Account phone becomes the lead's main phone; the old phone moves to `altPhone`, or into a note if `altPhone` is already set. Run `reconcileCycle` because the phone changed |
| 5 | Phone matches lead A, email matches lead B | Link A (the phone wins). Note on B: "Same email signed up, see lead A" |
| 6 | Phone only equals some lead's **alt** phone | New lead. Note on that lead: "A website account (email) signed up with this lead's alternate number" |
| 7 | No match | New lead: source "Website signup", status `Contacted` (`DEFAULT_LEAD_STATUS`). It joins broadcasts and offer targets like any Contacted lead |

   - **Free lead** = not deleted, `convertedToUserId` null, `requestedByUserId` null, and `reservationUserId` null or this account. A match that is not free counts as no match, and gets a note.
   - Keep the existing status rules: Inquiry → Contacted (`claimInquiryLead`), Dead/Negative-waiting → Contacted and Wrong stays Wrong (`leadForNewRequest`).
   - A WhatsApp-guessed name is replaced by the signup name (`helpers/leadName.js hasConfirmedName`).
   - A trashed lead that matches is restored, like `autoReplyJobs.reopen` does.
   - The lead step must **never fail the signup**: log the error, and the Phase 7 backfill fixes misses.
7. **Out of scope (owner, 6 Nov):**
   - the guest/demo system (to be removed later), including the pre-existing bug where a live guest's email blocks website signup
   - the team, partner and referral systems (to be fixed later), including a "don't market to team numbers" guard
   - `helpers/guestIdentityMatch.js` stays as is

   One exception is kept: the portal's Add-account forms must not get signup leads (Phase 3).
8. Keep it simple: no "possible duplicate" flags and no merge button. Every case has one clear result.
9. **Final message goes to both numbers** (owner, 6 Nov), for leads and clients:
   - One countdown for the person. It starts when the first copy is sent.
   - A reply from either number counts as a reply and stops the countdown.
   - Our own manual message to either number stops it, as on the main number today. Automatic messages (broadcasts and the like) do not.
   - The closing (Dead) message also goes to both numbers.
   - An invalid or blocked alt number gets nothing; the main number still gets it. If only one copy can be sent, that one starts the countdown.
   - A main-phone change ends the cycle (as today). An alt-phone change does not; the new alt number is used from then on.
10. The manual lead form keeps its email duplicate check unchanged. Only the phone part changes (main only, alt never blocks).

## 4. Terms

- **Main phone**: `lead.phone` and `user.phone`.
- **Alt phone**: `lead.altPhone`.
- **Phone key**: `helpers/leadPhone.js phoneKey()`, the normalised form. Always compare keys, never raw text.
- **Member**: a website account with roles `['member']` (blog-only, no portal).
- **Client**: an account with role `customer` (not a guest). Their lead is the Won lead with `convertedToUserId`.
- **Linked lead**: a member's lead with `reservationUserId` (unique partial index, `models/leadModel.js:262`).

## 5. Implemented behavior (Phases 1-6)

| Area | Current implementation |
|---|---|
| Canonical client lead | `helpers/wonLead.js clientLeadFor` and exported `CLIENT_LEAD_ORDER`; consistent batch selection in offers/final messages. Duplicate-link/shared-client readiness guards remain. |
| Identity/contact | `helpers/leadPhone.js`: main-only identity; `leadPhoneKeys`, contact lookup main before alt, alt recognition, session-aware final-message ending and selected-lead revival. |
| Signup lead | `helpers/personLead.js linkPersonLead`: account link first, phone before email, seven-case rules below, ownership protection, notes, Trash restore, status/name rules; own transaction or caller session. Lead failure never fails a saved signup. |
| Accounts | `helpers/accountCreation.js` shares validation/hashing/referral behavior; refuses main phones held by non-guests, including banned/Trash. Public signup stays member-only. |
| Portal Add-account | `POST /api/admin/create-account`, DB admin permission and explicit role allowlist; no team signup lead; customer gets Won lead. Four portal modals share the new endpoint. |
| Other entry points | Reservation and member plan request use the linker; reservation session/reconciliation preserved. Only actual plan requests start the repeat window. Manual lead forms link a main-phone member or report its existing lead. Email duplicate checks remain. |
| Conversion | Phone-matched member requires confirmation and retains account ID/login email; earlier lead email is noted. Phone-matched upgrade and lead conversion commit in one transaction, with current identity/admin/ownership rechecked. Other-account conflicts never create a second account. |
| Alt selection | `helpers/contactNumbers.js`: explicit recipient context, client canonical/member-linked lead, guarded fallback. Multiple email recipients resolve their own alts. Security events main-only. |
| Delivery | Reviewed/automatic/proposal/broadcast paths add normalized valid alts when switched on. Reviewed recipients freeze at first attempt; proposal partial failure retries without repeating the successful number. Review and unsaved previews show destinations. |
| Blocks | A Dead/Wrong/client-dead lead blocks both its numbers. A separate block on only this person's alt drops that alt while permitting main. Marketing/service exceptions remain. Cycle numbers are blocked during countdown/reply review. |
| Final messages | `finalMessageCopies.js` tracks all copies. First successful copy starts one timer; main identity never becomes alt. Both-number replies/manual outgoing messages count; automated outgoing messages do not stop. Per-chat send evidence drives per-chat closure quotes. Stop/expiry/handoff guards cover every copy. |
| Alt edits mid-cycle | `finalMessageCycle.js` transaction replaces unsent destinations without resetting countdown, retains prior send evidence, and can reach a new alt in its own chat. A typing claim is cancelled before replacement; transport handoff must settle before a change proceeds. |
| Recovery | Legacy `recoverFinalMessageClosures.js` accepts either the old unique cycle index or the new unique cycle+number index. It explicitly excludes dual-number evidence from legacy recovery; normal dispatcher owns dual cycles. |
| Queue migration | `scripts/migrateQueueDraftIndex.js`: preview first, explicit target; creates replacement indexes before dropping old ones. Locally tested for preview, apply, retry and uniqueness. |

**Switch:** `ALT_PHONE_SENDING_ENABLED=true` enables alt sending. Defaults off. When enabled in production, configure it consistently for both backend and WhatsApp worker. Worker checks it before transport and again before handoff, so a queued alt copy is cancelled when switched off. Broadcast and closure alt copies carry the queue alt flag. Blocking/alt inbound recognition work with the switch off too. Already handed-off messages cannot be recalled.

**Production prerequisites:** new `emailDraftId+email+to` and `finalMessageExpiryId+to` unique indexes, plus cycle altPhone index, must be ready before enabling alt delivery. Model edits alone do not remove old live indexes. No live index action is authorized by this implementation.

## 6. Verification result

- Latest full explicit backend + WhatsApp worker run: **775 tests, 775 passed, 0 failed, 0 skipped**. Includes all `tests/*.test.js` / `.test.mjs` and `whatsapp/tests` discovered by `rg`. `npm test` remains a placeholder; it was not used as validation.
- Portal `npm run build`: **Compiled successfully**. Existing toolchain deprecation/Browserslist age notices do not fail the build. No portal source changes were needed in this validation turn.
- New coverage: signup outcomes and ownership/status rules; banned/Trash/guest phone handling; public/admin role boundaries; manual lead linking; phone conversion and failure rollback; first plan request after signup; reviewed/automatic/proposal/broadcast alts; invalid/duplicate/blocked alt; security/switch rules; frozen retries; local index migration; lead/client dual final-message timers; either-number replies; manual vs automated outgoing messages; one-copy success; per-chat closure quotes; Stop during alt handoff; alt edits during waiting/typing; client-alt incoming ad recognition; queued alt switch-off.
- Against the pre-Phase-2 backup, 29 selected new behavior checks failed and one existing signup-resilience safeguard passed. Tests were run in a separate backup checkout with isolated MongoDB, never by overwriting the working repository. Further regression checks reproduced each newly fixed conversion/contact/typing/switch issue before its fix.
- Fixed original 3 failures: all were caused by recovery requiring the obsolete closure-cycle-only index. Recovery tests now pass without dropping the uniqueness requirement.
- Fixed additional proven gaps: alt-edit queue destination drift and typing race; phone conversion partial commit; multi-recipient alt resolution; queued alt delivery after switch-off.
- `git diff --check` and staged diff check pass. No production connection, real provider delivery, backfill, commit or deployment was performed. These checks validate local behavior, not the contents of production.

## 7. Backups and evidence

- Phase 1: `E:\Allprojects\backup\backend\work52-person-lead-phase1`.
- Phase 2-6 original implementation: backend `work53-person-lead-phase2-6`, portal `work58-person-lead-phase2-6` under their respective `E:\Allprojects\backup` repository folders.
- Validation/fixes: `E:\Allprojects\backup\backend\work54-person-lead-validation` (source/tests before this turn's edits, full-suite logs and isolated old-code proof checkout).
- Portal source/build log: `E:\Allprojects\backup\frontend\work59-person-lead-validation`.
- Prior handover: `E:\Allprojects\backup\merasoftware\work77-signup-validation`.
- Final test log: backend validation folder `final-suite.log`; old-code evidence `old-code-proof.log`; portal evidence `build.log` in the portal backup.
- These changes remain staged/unstaged exactly as local work; no staging/commit operation was performed in this validation turn. Check free workNN numbers before further edits.

## 8. Remaining work

**Phase 7: production data audit and cleanup**
1. Owner runs section 10's read-only audit and shares SUMMARY. Production credentials do not belong in local project environment files.
2. Design preview-only linking/creation for unlinked members, same-main-phone duplicate lead cleanup, and multiple-Won-lead cleanup from actual counts. Alt/email overlap is not blanket permission to merge people.
3. Inventory and repoint all affected lead references (offers, reservations, drafts, inbox, cycles and other referencing collections); preserve notes, proposals and history.
4. Owner reviews the concrete preview and separately approves any production cleanup/backfill. No cleanup has run yet.

**Separate production rollout approval**
- Review/approve deployment of backend + worker + portal, and preview/apply of queue index migration. Do not enable the alt switch before the index migration. Set the switch consistently on backend and worker; start off.
- Production deployment, index application and runtime switch changes are pending; coding approval did not authorize them.
- Production-specific validation follows deployment using the owner's approved scope. Local tests/build do not assert live rollout success.

**Known boundary:** application lookup checks cannot enforce unique main phones for two simultaneous signups without a database constraint. OTP and a normalized partial unique main-phone index after cleanup remain separate owner decisions. Guest/demo and broader team/partner/referral redesign stay out of scope.

## 9. Working rules for this owner

- Reply in **Hinglish**. Code, docs and UI text are in English.
- Answer what was asked, directly. When something is unclear, ask first.
- Code only after an explicit "code likho" / "fix karo" / "haan" / "proceed". "Analyze", "batao", "explain" and "verify" mean report only.
- Back up before **any** file change, outside repos: `E:\Allprojects\backup\<repo>\workNN`.
- Never commit, deploy, run prod writes, change live indexes or run backfills without explicit approval.
- Local `.env` points at a dev database, not production. Never put production credentials locally. The owner runs prod scripts.
- On Windows, never use `sed -i` (it turns CRLF into LF). Match by content, not line number.
- Prove a theory with a runnable test or a read-only data check before fixing. Prove a new test fails on the old code.
- Reuse existing patterns and helpers. No new abstraction unless it removes a real duplicate.
- Docs record owner decisions and done work. Open questions stay in chat, except this file's §1 list.

## 10. Read-only audit (owner runs it)

`E:\Allprojects\backend\scripts\readOnlyAuditPersonLeads.js` blocks every write and loads no models. It was tested on mock data only.

```powershell
$env:MONGODB_URI = "<production URI>"; node scripts/readOnlyAuditPersonLeads.js
Remove-Item Env:MONGODB_URI
```

It reports:
- members linked / not linked, and their match by main phone, alt phone or email
- phone and email pointing at different leads
- duplicate phone groups
- clients with a separate open lead, no Won lead, or more than one Won lead
- phones shared by live accounts
- alt-phone counts

`--detail` lists lead ids (numbers are masked to the last 4 digits). Ask the owner for the block between `SUMMARY START` and `SUMMARY END`.
