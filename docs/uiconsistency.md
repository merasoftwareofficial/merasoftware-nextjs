# Mera Software Control Panel — UI Consistency Plan (SSOT)

> **Purpose:** Single handoff & reference document for standardizing **Delete Buttons** and **Pop-up / Confirmation Dialogs** across the entire Mera Software Control Panel (`src/app/admin/` and `src/components/`). Any agent picking up this work should read this file first before making changes.
>
> **Status:** Analysis & Planning complete. **No code changes made yet** (awaiting owner approval).

---

## 1. Owner's Requirements & Vision

1. **Delete Button Consistency (SSOT):**
   - Every Delete button in the Control Panel must share one consistent visual design, modeled on **Communication → Automated Message System** (`src/app/admin/communication/automated-message-panel.tsx` L5122–5138) and **Packages → Add-ons** (`src/app/admin/add-ons/add-ons-manager.tsx` L315–341):
     - **Solid red background** (`#dc2626`), **solid red border** (`#dc2626`), **white icon/text** (`#ffffff`), hover `#b91c1c`.
     - Compact rounded button (`border-radius: 6px`–`7px`, `padding: 5px 9px` for icon-only, `inline-flex`, `align-items: center`, `justify-content: center`) with the standard 15×15 trash SVG icon.
2. **Pop-up / Confirmation Dialog Consistency (SSOT):**
   - Eliminate native browser `window.confirm()` (and `window.alert()` where used) across the Control Panel.
   - Pressing any Delete button (or confirmation action) must open a **compact custom pop-up** matching the **Automated Message System** (`automated-message-panel.tsx` L5345–5392) and **Add-ons** (`add-on-dialog.tsx` `AddOnDeleteDialog` L71–324) look & feel.
3. **Single Source of Truth (SSOT) Architecture:**
   - Do **not** copy-paste modal JSX or inline `#dc2626` styles per page.
   - Build reusable shared components in `src/components/` so all admin pages consume the exact same UI, tokens, keyboard handling (`Escape`), portal rendering (`createPortal` to `document.body`), and accessibility attributes.

---

## 2. Visual & Technical Blueprint (From Reference Implementations)

### A. Reference 1 — Automated Message System (`src/app/admin/communication/automated-message-panel.tsx`)
- **Delete Icon Button (L5122–5138):**
  - `background: "#dc2626"`, `borderColor: "#dc2626"`, `color: "#ffffff"`, `display: "inline-flex"`, `alignItems: "center"`, `justifyContent: "center"`, `padding: 5px 9px`, `borderRadius: 6px`.
  - 15×15 Trash SVG (`viewBox="0 0 24 24"`, `strokeWidth="2"`, `stroke="currentColor"`).
- **Compact Delete Modal (L5345–5392 + `automated-message.module.css` L1092–1118):**
  - Overlay: `position: fixed; inset: 0; z-index: 250; display: grid; place-items: center; padding: 16px;`
  - Backdrop: `background: rgb(0 0 0 / .58); backdrop-filter: blur(2px);` (click to dismiss when not busy).
  - Dialog card: `width: min(460px, 100%)`, `border: 1px solid var(--pn-line)`, `border-radius: 14px`, `background: var(--pn-card)`, `color: var(--pn-text)`, `box-shadow: 0 24px 60px -10px rgb(0 0 0 / .38)`, `overflow: hidden`.
  - Inner body: `padding: 22px 24px; display: flex; flex-direction: column; gap: 14px;`
  - Title: `<strong style={{ fontSize: 16 }}>...</strong>`
  - Message: `fontSize: 13.5, lineHeight: 1.55, opacity: 0.9`
  - Footer actions: `display: flex; justify-content: flex-end; gap: 10px; margin-top: 6px;` — neutral `Cancel` button + solid red `#dc2626` `Delete permanently` button (`color: #ffffff`).

### B. Reference 2 — Packages → Add-ons (`src/components/add-on-dialog.tsx` `AddOnDeleteDialog`)
- Adds portal rendering (`createPortal(..., document.body)`) so parent `overflow` / `z-index` never clips the modal.
- Adds `Escape` key listener (capture phase, disabled while `busy`).
- Adds optional header controls:
  - Optional `i` info toggle button (for multi-option explanations).
  - Red circular `X` close button (`28×28`, `borderRadius: 999`, `background: "#dc2626"`, `color: "#ffffff"`).
- Supports inline error display (`className="form-error" role="alert"`) and async `busy` state (`"Deleting…"`).

---

## 3. Codebase Audit — Current Fragmentation & Evidence

### A. Delete Buttons & `window.confirm()` on Delete/Remove Actions
| File | Current Delete Button UI | Current Confirmation Mechanism |
|---|---|---|
| `src/app/admin/communication/automated-message-panel.tsx` | Trail row (L5122): **Reference solid red trash icon**; Inline remove (L1498, L2221, L2402, L2584, L4432): `.miniDangerBtn` (solid red); Template delete (L1859): `.miniDangerBtn` | Trail delete (L5345): **Reference custom modal**; Template delete (L1798): **`window.confirm(...)`** |
| `src/app/admin/add-ons/add-ons-manager.tsx` + `src/components/add-on-dialog.tsx` | Table row (L315): **Reference solid red trash icon** | **`AddOnDeleteDialog`** (Reference 3-option custom modal) |
| `src/app/admin/packages/packages-manager.tsx` | Table row Force Delete (L664): `admin-action is-danger` (plain outline/text trash icon, NOT solid red); Delete page (L858): `admin-action`; Discard/Delete draft (L880): `admin-action is-danger`; End/Delete offer (L840): `admin-action is-danger` | Force delete (L444): **`window.confirm(...)`**; Delete page (L512): **`window.confirm(...)`**; Discard/Delete draft (L614): **`window.confirm(...)`**; End/Delete offer (L842): inline `<p className={s.warnNote}>` |
| `src/app/admin/blog/blog-form.tsx` | L750: `admin-button danger` (`Delete`) | L373: **`window.confirm("Delete this post permanently?")`** |
| `src/app/admin/categories/category-actions.tsx` | L196: `admin-action is-danger` (`Delete`) | L139: **`window.confirm(...)`** |
| `src/app/admin/comments/comment-actions.tsx` | L68: `admin-action is-danger` (`Delete`) | L73: **`window.confirm("Delete this comment permanently?...")`** |
| `src/app/admin/communication/actions-panel.tsx` | L662: `className={c.manage}` (plain button `Delete`) | L201: **`window.confirm("Delete this rule permanently?")`** |
| `src/app/admin/communication/broadcast-panel.tsx` | Text/action button | L113: **`window.confirm(...)`** |
| `src/app/admin/communication/reminder-history.tsx` | Cancel step action | L53: **`window.confirm("Cancel this scheduled reminder step?")`** |
| `src/app/admin/communication/templates-panel.tsx` | Delete action | L196: **`window.confirm("Delete this automatic message permanently?")`** |
| `src/app/admin/content/page-section-editor.tsx` | L40: unstyled `<button>Remove</button>` | L40: **`window.confirm("Remove this entry from the section?")`** |
| `src/app/admin/media/media-uploader.tsx` | L205: `admin-action is-danger` (`Delete`) | L151: **`window.confirm(...)`** (+ `window.alert` on L163) |
| `src/app/admin/offers/offers-manager.tsx` | L194: `admin-action` (non-red `Delete offer`) | L148: **`window.confirm(...)`** |
| `src/app/admin/plans/plans-manager.tsx` | L97, L99: `admin-action` (non-red `Remove` / `Delete forever`) | L59: **`window.confirm(...)`** |
| `src/app/admin/settings/admin-contact-settings.tsx`, `business-settings.jsx`, `invoice-business-settings.tsx` | Inline `Remove` text buttons (WhatsApp number / address line) | Direct inline removal (can use `DangerButton` / `DeleteIconButton` for visual consistency) |

### B. Other `window.confirm()` Non-Delete Pop-ups in Admin
These also break pop-up consistency by using native browser `window.confirm()` instead of the compact custom pop-up:
- `categories/category-actions.tsx:37` (Move posts between categories)
- `communication/action-rule-helpers.ts:268` (Enroll pending unpaid invoices)
- `communication/bandwidth-panel.tsx:108` (Reset in-memory bandwidth counters)
- `communication/reminder-pause-control.tsx:14` (Pause/Resume reminder)
- `communication/reservation-panel.tsx:147, 164` (Link paid project / Close package request)
- `communication/templates-panel.tsx:229` (Migrate built-in items to Action rules)
- `content/page-section-editor.tsx:89` (Discard unsaved changes)
- `email-control/email-control-panel.tsx:102, 148` (Discard unsaved template / Reset built-in template)
- `packages/packages-manager.tsx:460, 598` (Publish/Archive package, Update live page)
- `plans/plans-manager.tsx:179` (Discard unsaved plan changes)
- `users/user-actions.tsx:53` (Ban user — uses `admin-action is-danger`)
- `visuals/visuals-editor.tsx:42` (Discard unsaved visual changes)
- `whatsapp/whatsapp-panel.tsx:93, 98` (Unlink WhatsApp number / Resend maybe-arrived message)
- `whatsapp/whatsapp-settings.tsx:67` (Reset sending rules)

### C. Existing Custom Pop-ups with Different Styling (Visual Drift)
- `src/app/globals.css` `.homepage-unsaved-backdrop` / `.homepage-unsaved-dialog`: `border-radius: 8px`, `max-width: 520px`, `z-index: 1000`, no backdrop blur — used by `src/components/unsaved-guard.tsx` and `add-ons-manager.tsx` (`usedInPopup`).
- `src/components/add-on-dialog.tsx` (L364) & `src/components/project-category-dialog.tsx` (L45): `background: #0f172a66`, `zIndex: 100/110`.
- `src/app/admin/blog/blog-form.tsx` (L689) & `src/app/admin/communication/automated-message-panel.tsx` (L3879): large editor/preview modals (keep wide layout for editors, but align backdrop/border-radius/close styling where appropriate).

---

## 4. Proposed SSOT Architecture & Implementation Plan

### Step 1: Create SSOT UI Primitives (`src/components/admin-confirm-dialog.tsx` + `src/components/admin-action-buttons.tsx` or `src/components/ui/confirm-dialog.tsx`)
1. **`ConfirmDialog` (SSOT Compact Pop-up):**
   - Rendered via `createPortal(..., document.body)` at `z-index: 250` (with optional `zIndex` override for nested dialogs like `260`).
   - Exact visual spec from Automated Message / Add-ons:
     - Backdrop: `rgb(0 0 0 / .58)` + `backdrop-filter: blur(2px)`, click-outside to close (unless `busy`).
     - Card: `width: min(460px, 100%)`, `border: 1px solid var(--pn-line)`, `border-radius: 14px`, `background: var(--pn-card)`, `color: var(--pn-text)`, `box-shadow: 0 24px 60px -10px rgb(0 0 0 / .38)`, `padding: 22px 24px`, `gap: 14px`.
     - Header: Bold `16px` title (optional danger color `#dc2626` for permanent/irreversible warnings), optional `i` info toggle (`infoContent`), and red circular `X` close button (`28×28`).
     - Body: `13.5px`, `line-height: 1.55`, `opacity: 0.9`, plus optional `error` alert (`className="form-error" role="alert"`).
     - Footer: `Cancel` (or custom `cancelLabel`) + primary/danger action button(s) (`variant="danger"` → solid `#dc2626` white text; `variant="primary"` → `var(--pn-accent)`), supporting async `onConfirm` with automatic `busy` state (`"Deleting…"` / `"Working…"`) or extra custom action buttons (for 3-option flows like `AddOnDeleteDialog`), plus `alertOnly` mode for single-button notices (replacing `window.alert` in `media-uploader.tsx:163`).
     - Keyboard: `Escape` closes when not `busy`; focus management.
     - Dark-mode safety: `globals.css` L83 (`body:has(.admin-shell[data-theme="dark"])`) already defines `--pn-card`, `--pn-line`, `--pn-text`, `--pn-muted`, `--pn-raised`, `--pn-accent` on `body`, so `createPortal(..., document.body)` inherits dark mode automatically.
2. **`useConfirmDialog()` Hook (Imperative SSOT helper, like `useUnsavedGuard`):**
   - Returns `{ confirm, dialog }` so async handlers that previously wrote `if (!window.confirm(...)) return;` (including `action-rule-helpers.ts:268` via callback) can cleanly `await confirm({ title, message, confirmLabel, variant })` without per-page modal state boilerplate.
3. **`DeleteIconButton` & `DangerButton` (SSOT Delete Buttons):**
   - `DeleteIconButton`: Solid red `#dc2626` (`hover: #b91c1c`), white 15×15 trash SVG, `borderRadius: 6px`, `padding: 5px 9px`, `aria-label`, `title`, `disabled` state (`opacity: 0.55`).
   - `DangerButton`: Solid red `#dc2626` (`hover: #b91c1c`), white text (`borderRadius: 7px`, `padding: 7px 14px`, `fontWeight: 700`) for labeled `"Delete"` / `"Delete permanently"` / `"Remove"` buttons.
   - Shared CSS classes in `globals.css` (or a dedicated CSS module) so hover/focus/disabled states work cleanly without inline style duplication.

### Step 2: Refactor Reference Components onto SSOT
- Update `automated-message-panel.tsx` (trail delete button + trail delete modal + template delete `window.confirm`) to use `DeleteIconButton` + `ConfirmDialog`.
- Update `add-ons-manager.tsx` and `add-on-dialog.tsx` (`AddOnDeleteDialog`) to use `DeleteIconButton` + `ConfirmDialog` (preserving its 3-option `Hide` / `List only` / `Delete permanently` flow).

### Step 3: Migrate All Control Panel Delete Flows (Zero `window.confirm` on Deletes)
- `packages/packages-manager.tsx` (Force delete button → `DeleteIconButton`; Force delete, Delete page, Discard/Delete draft, End/Delete offer → `ConfirmDialog`)
- `plans/plans-manager.tsx` (`Remove` / `Delete forever` → `DangerButton` / `DeleteIconButton` + `ConfirmDialog`)
- `offers/offers-manager.tsx` (`Delete offer` → `DangerButton` + `ConfirmDialog`)
- `communication/actions-panel.tsx`, `templates-panel.tsx`, `broadcast-panel.tsx`, `reminder-history.tsx`
- `blog/blog-form.tsx`, `categories/category-actions.tsx`, `comments/comment-actions.tsx`
- `media/media-uploader.tsx`, `content/page-section-editor.tsx`

### Step 4: Migrate Remaining Non-Delete `window.confirm()` & Align Other Compact Pop-ups
- Replace all remaining `window.confirm()` calls (`whatsapp-panel.tsx`, `whatsapp-settings.tsx`, `email-control-panel.tsx`, `users/user-actions.tsx`, `visuals-editor.tsx`, `bandwidth-panel.tsx`, `reservation-panel.tsx`, `reminder-pause-control.tsx`, `action-rule-helpers.ts`, `plans-manager.tsx` discard, `page-section-editor.tsx` discard) with `ConfirmDialog` (`variant="primary"` or `variant="danger"` as appropriate).
- Optionally align `unsaved-guard.tsx` (`.homepage-unsaved-dialog`) and `usedInPopup` in `add-ons-manager.tsx` to share the same `14px` radius, `rgb(0 0 0 / .58)` + blur backdrop, and `460px`–`520px` card polish.

### Step 5: Verification
- Search `src/app/admin/` for any remaining `window.confirm(` or `window.alert(`.
- Run TypeScript check (`npx tsc --noEmit`) and relevant Playwright/browser tests in `tests/`.
- Visually verify light & dark themes (`[data-theme="dark"]`) in the Control Panel.

---

## 5. Rules for Any Agent Implementing This
1. **Always take backup first** in `E:\Allprojects\backup\merasoftware\workNN\` before editing files.
2. **Never break existing backend API contracts or business rules** (e.g., `AddOnDeleteDialog`'s 3-option delete, `packages-manager.tsx`'s force delete/draft rules, `plans-manager.tsx`'s retire vs purge).
3. **Keep it clean & SSOT:** No per-page duplicate modal markup or hardcoded inline `#dc2626` button styles once the SSOT components exist.
