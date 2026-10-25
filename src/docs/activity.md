# Admin control panel & Activity system — hand-over

Written 25 October 2026 (Asia/Kolkata) for the next agent. Status: **direction decided by the owner, nothing built yet.** Read this file to the end before planning any admin, activity or notification work.

## 1. Words used in this file (the owner was confused by them once)

| Word | Repo | What it is | Has screens? |
|---|---|---|---|
| **Website** | `E:/Allprojects/merasoftware` | Next.js. Public site **and the admin control panel** (`/admin/...`) | Yes |
| **Portal** | `E:/Allprojects/frontend` | React. Customer app ("My Portal") **and an older admin panel** (`/admin-panel/...`) | Yes |
| **Backend** | `E:/Allprojects/backend` | Node.js + Express + MongoDB on **Render** (`api.merasoftware.com`). Data, money logic, email/WhatsApp engine | **No** |

The backend is **not** React and **not** the portal. Say "backend (Express, Render)" when talking to the owner, never just "portal backend" or "React backend". The owner first understood "the activity data lives in the backend" as "the activity panel lives in the portal" and rejected it. It does not.

## 2. Owner decisions (25 Oct 2026). Do not re-litigate

1. **One control panel: the website.** Everything is shown and managed from the website admin panel. Two panels create confusion; the owner wants all control and activity in one place.
2. **The work happens in the backend.** Screens are on the website; data, rules, money and sending stay in the Express backend on Render. The website talks to it server-to-server. This pattern already works for packages (`src/lib/sales-catalogue-server.ts` → `salesBackend()`) and for Email/WhatsApp control (UI on the website, engine and history in the backend).
3. **No new admin features in the portal's React admin panel.** Existing portal admin work moves to the website step by step (proposed order in §5).
4. **The customer portal stays as it is for now.** Moving customer screens to the website may come later. It is a separate decision and not part of this work.
5. **Activity system:** the activity record is created in the **backend** where the action happens. The bell and Activity page are in the **website control panel**. Admin alerts by email/WhatsApp go through the **existing** Email Control and WhatsApp queue, with the alert settings in the website's Communication tab. Nothing about it is built in the portal.

Rule text to put in the project rules when the owner confirms the wording (shown to the owner, not yet written anywhere else):

> Every new admin feature is built in the website control panel. Data and logic stay in the backend. Nothing new is built in the portal's admin panel; its existing work moves to the website step by step.

## 3. Why the record lives in the backend (the owner accepted this after the comparison)

Most activity happens in the backend: signup, sign-in, offer reservation, tickets, update requests/uploads, payments, renewals, contact/callback forms. Saving the record in the same place and request means nothing is lost. If the website stored it, every backend action would need a network call to the website, which can fail or be slow. Only a few events start on the website (blog comments, community posts, newsletter subscribe). Those are sent to the backend over the existing server-to-server integration.

For the admin the experience is the same either way: they only ever open the website panel.

## 4. What exists today (verified in code, 25 Oct 2026)

### Admin alerts that exist

| User action | Admin alert | Evidence |
|---|---|---|
| Website update request (data/files) | Admin email + portal in-app bell | backend `controller/user/submitUpdateRequest.js:295`, `:303` |
| Purchase | Admin email | `helpers/emailCatalog.js` `sendAdminPurchaseConfirmationEmail` |
| UPI payment pending | Admin email | `sendAdminUPIPendingNotification` |
| Auto renewal | Admin email | `sendAdminAutoRenewalNotification` |
| Plan closure | Admin email | `sendPlanClosureEmailToAdmin` |
| Contact form / callback | Admin email | `sendContactRequestNotification`, `sendCallbackRequestNotification` |

### Gaps (the owner asked about these)

| User action | Admin alert today |
|---|---|
| **Offer reserved** | **None.** Only the customer gets `offer.reserved` (`helpers/emailDefinitions.js:903`). A Lead is created silently (source "Offer reservation", `helpers/offerReservations.js:89`) and is seen only when the Leads list is opened |
| **New signup** | **None** (`controller/user/userSignUp.js` has no admin mail or notification) |
| **New ticket / ticket reply** | **None** (`controller/user/createTicketController.js`, `replyTicketController.js`) |

### Older in-app notifications (check before reusing)

`models/notificationModel.js` + `helpers/notificationService.js` hold per-user notifications with `isAdmin`. They cover only a few types (update request, purchase, project messages…). `createUpdateRequestNotification` finds admins by the legacy `role: 'ADMIN'` field (`notificationService.js:33`), while the rest of the system uses the `roles` array. Whether live admins still have `role: 'ADMIN'` is **not verified**: if not, the admin bell is empty. Check live data (read-only, owner approval) before deciding. The intended direction is that the new Activity record replaces this, so only one notification system remains.

### Where admin work is today

| Work | Panel |
|---|---|
| Offers, packages, package pages, content, blog, SEO, Email Control, WhatsApp/Communication | Website `/admin/...` |
| Clients, client workspace, projects, payments/approvals, invoices, tickets, leads | Portal `/admin-panel/...` |
| **Reserved offers** (extend deadline, apply reserved price) | Portal → Clients → client → **Projects** tab → "Reserved offers" box (`frontend/src/components/admin/ReservedOffersPanel.js`, used at `pages/AdminClientWorkspace.js:1813`). No list of all reservations exists |

Access: one account for both apps. A portal `admin` is a website admin automatically (`src/lib/auth.ts:52`, `src/docs/login.md`). Offers/packages also need the portal **active** role to be admin (`src/lib/sales-catalogue-server.ts:9`).

## 5. Proposed roadmap (agent's proposal; the owner agreed to the direction, not yet to each phase)

Each phase needs its own plan → owner "yes" → code → review, like all work here.

| Phase | Work | Risk |
|---|---|---|
| 0 | Write the rule from §2 into the project docs (exact wording approved first) | None |
| 1 | **Activity system**: backend activity record (signup, reservation, ticket, upload, payment, contact…), website bell + Activity page, admin alert choices via existing Email Control/WhatsApp; plus a website list of all reservations | Low (new screens) |
| 2 | Leads and tickets in the website panel | Low–medium |
| 3 | Clients and client workspace: read first, then actions through the existing backend APIs | Medium |
| 4 | Payments and approvals, last and most carefully | High |
| 5 | Portal admin panel redirects to the website admin | — |

While both panels exist, a website page whose work is still in the portal should link to it ("This is done in the portal for now →").

Do **not** rewrite backend money/reservation logic to move a screen. Only the UI moves. The portal admin workspace is large (`AdminClientWorkspace.js` is 4,500+ lines) and holds payment approvals, so a big-bang move is not acceptable.

## 6. How to work with this owner

- Hinglish, short. Understand → short review ("kya samjha, kya karunga") → owner's yes → code → owner review → docs only after "perfect". Docs need before → after with exact file/function.
- Ask only about requirements, one question at a time. The owner leaves system design to the agent but expects evidence (file:line, tests, screenshots), not assumptions.
- When the owner says "verify karlo", re-audit with real tool calls; stop when a pass finds nothing new. "Bina code change kiye" means read-only: revert anything already started.
- Backups before any change, outside the repo: `E:\Allprojects\backup\<repo>\workNN-name` with a sha256 manifest.
- **Never test by saving on running local servers.** The website `.env.local` points at the **production** database, the local backend at a dev database, and the local backend reads offers from `localhost:3000`. Use disposable fixtures (see `tests/offers-components.mjs`).
- Commit, push and deploy only when the owner asks.

## 7. Relation to the current work

The "original plan" the owner returns to is **offers ↔ packages** (`src/docs/dynamic-offers.md`):

- **Phase 1 (package ↔ offer SSOT)** is committed and deployed by the owner (`168918c`).
- **Phase 2** (Reserve on the offer card + per-offer reserve window, backend `reservationRefusal` and package version) is coded locally, **not committed or deployed**. Deploy the backend first.
- Both are documented, with before → after, in `src/docs/dynamic-offers.md`.

The Activity work in this file starts only after those, unless the owner reorders.
