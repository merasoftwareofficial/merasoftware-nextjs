# Email Control — templates and sending rules

Panel: `/admin/email-control` (Website and Portal tabs). How the backend sends, renders and stores mail — and which actions have a live caller — is in the portal map, `E:\Allprojects\frontend\src\DOCS\CODEBASE_MAP.md` §6b. This file holds the owner's decisions, what the panel does, and the plan.

## Owner decisions (17 Oct 2026)

- An action's built-in wording is its **default template, editable** in the panel. One action can have **several templates**; the admin can pick **any of them when sending**, with the default preselected.
- Every mail uses **one branded layout** (navy header, footer). The admin edits only the content.
- The editor must be **human-friendly, like the blog editor**: the user only edits text and never sees codes such as `**`, `##` or `{{ }}`. Details like the customer name appear as named chips. Not built yet (plan step 2).
- **Mail a customer's own action starts gets no popup and no approval** — the owner decides beforehand which mail an action sends ("approval ki kya jarurat … hum hi decide karenge"). Its only setting is **On** (sends at once) or **Off** (no mail). Off until an admin turns it on.
- Actions an admin performs keep the Send / Don't Send popup.
- Every mail that really sends must become editable (plan step 3). For the 19 actions that never send, Claude proposed hiding their rows until a feature uses them; the owner has not decided yet.

## What the panel does now

- **Portal tab, admin actions table:** sending rule (Ask before sending / Off), default template, Add template, and Edit buttons.
- **"Customer actions (automatic)" section** (Portal tab): the three customer-started mails — Update request received, New update request (admin), UPI payment pending (admin) — with **On — send automatically / Off**. A failed automatic send waits under Pending email review; only an admin can retry it.
- **Built-in template** (only Project created and Project cancelled so far): "Edit Standard (built-in)" opens it; "Reset to original" restores the shipped wording; it cannot be deleted. "Add template" starts from the built-in wording. "Preview sample" shows the real design.
- Other actions still show "Built-in action template": their wording lives in code and cannot be edited, only replaced by a custom template.
- **Review dialog** (panel and portal popup): template dropdown (admins only), Bold / Heading / List buttons, "Update preview".
- Code: `src/app/admin/email-control/email-control-panel.tsx` (panel), `template-text-editor.tsx` (current markup editor + preview), `src/app/api/email-control/[[...path]]/route.ts` (proxy with an allow-list of backend paths). Tests: `npm run test:email`.
- **Before 17 Oct 2026:** one table only, every action "Ask before sending / Off", customers got the popup for their own actions, templates were plain text with `{{subject}}`/`{{message}}`, and the built-in wording could not be seen or edited.

## Plan (approved 17 Oct 2026)

1. **Customer actions On/Off** — done (17 Oct 2026).
2. **Blog-style visual editor** (TipTap — v3 on the website, v2 already in the portal; no new package): Bold, Heading, Bullet list and an "Insert detail" menu with named chips; the same editor in the template editor, the panel review and the portal popup. The stored text format stays as it is. The backend alone converts between it and the editor document, so both apps share one conversion and no saved template needs migrating.
3. **Migrate the 9 remaining live mails**, one section at a time: New lead welcome; Update request received; New update request (admin, instructions list as a section); UPI payment pending (admin); Monthly invoice, Payment reminder and Project payment summary (PDF attachment kept); Subscription confirmation and Subscription management (required link kept).
4. **The 19 never-sent actions** — waits for the owner's call (hide rows vs. templates for all).

Deploy order for every step: backend first, then website and portal; every frontend must still work while a new response field is missing.
