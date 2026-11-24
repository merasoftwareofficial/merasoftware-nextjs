# Mera Software — Modern UI Redesign Blueprint (`new-design.md`)

This document is the Single Source of Truth (SSOT) for modernizing the Mera Software public website UI. It is written so any future chat or agent can resume work with full context and zero regressions.

---

## 1. Core Objective & Non-Negotiable Rules

- **Goal:** Upgrade the visual UI of `e:\Allprojects\merasoftware` to a crisp, modern, agency-grade look matching the approved HTML prototype.
- **Approved Visual Prototype:** `E:\Allprojects\merasoftware-home-preview.html`
- **Brand Color Palette (100% Unchanged):** Must strictly use the existing tokens in `src/app/brand-colors.css`:
  - `--brand-navy: #00243d`
  - `--brand-blue: #073b60`
  - `--brand-teal: #007f99`
  - `--brand-cyan: #00b8cc`
  - `--brand-cyan-light: #66e4ee`
  - `--brand-link: #006b80`
  - `--brand-ice: #ddf5f7`
  - `--brand-white: #ffffff`
  - `--brand-paper: #f4f8fc`
  - `--brand-surface: #e8f0f6`
  - `--brand-line: #ccdce8`
  - `--brand-muted: #4c6475`
  - Dark surface tokens: `--brand-dark-bg: #001b2e`, `--brand-dark-card: #062d47`, `--brand-dark-field: #002239`, `--brand-dark-line: #28506a`, `--brand-dark-muted: #b6cddd`
- **Zero Content Changes:** Do not alter copy, headings, labels, links, dynamic CMS fields (`src/lib/homepage-content.ts`), SEO metadata, JSON-LD, or navigation structure.
- **Zero Functional / System Regressions:**
  - Photo, GIF, video (`<video>`), focal-point, and admin custom-crop geometry (`src/components/section-visual.tsx`, `src/app/visual-layout.css`, `src/lib/visual-slots.ts`) must remain 100% intact.
  - Header scroll behavior (`HeaderScroll`), dropdowns (`NavDropdown`), mobile menu (`MobileMenu`), and auth/session menu (`SessionMenu`) must remain 100% intact.
  - Admin panel styling (`.admin-shell`) and `tests/admin-typography.test.mjs` must remain 100% intact.
  - Portfolio reactions (`PortfolioReactions`) and location copy/share (`ShareLocation`) must remain 100% intact.
- **Backup Rule:** Before editing any repo files, copy only the files about to be modified to `E:\Allprojects\backup\merasoftware\workNN\` (next available: `work104`) preserving relative paths.

---

## 2. Design System Spec (From Approved Prototype)

### Typography
- **Primary Sans (`--font-geist-sans`):** `Geist` (already loaded in `src/app/layout.tsx`, previously unused because `globals.css` hardcoded `Arial, Helvetica, sans-serif`).
- **Monospace (`--font-geist-mono`):** `Geist_Mono` (already loaded in `src/app/layout.tsx`) — used for eyebrow badges, service numbers (`01`, `02`, `03`), category tags, marquee, and footer labels.
- **Editorial Serif (`--font-serif`):** `Instrument_Serif` (`weight: "400"`, `style: ["normal", "italic"]`, via `next/font/google`) — used for `<em>` emphasis words in display headings (replacing `Georgia, serif` with `-0.09em` tracking).
- **Heading Tracking:** Refined `-0.035em` to `-0.04em` (replacing cramped `-0.06em` on Arial).
- **Public Typography SSOT (Strict Min Floor `13px`, 1 Single `:root` Block in `src/app/globals.css`):**
  Every redesigned public rule MUST use these `--pub-*` tokens (never hardcoded `px` font sizes; decorative icons/symbols use relative `em`). Admin panel keeps its separate `.admin-shell` `--fs-*` tokens untouched.
  - `--pub-tag: 13px` (eyebrow pills, category tags, service `01/02/03`, marquee, footer labels, map caption, mobile menu group headers)
  - `--pub-hint: 13px` (dates/author meta, footer-bottom, location status, portfolio service list)
  - `--pub-ui: 16px` (header nav, dropdown links, session trigger/links, buttons, CTAs, footer links/address, location secondary button)
  - `--pub-body: 16px` (all body paragraphs, service/portfolio descriptions, side-note, address, mobile menu links, packages/offers callout)
  - `--pub-lead: clamp(17px, 1.35vw, 19.5px)` (hero intro, statement body)
  - `--pub-card-title: 21px` (service `h3`, portfolio `h2`, journal `h3`, visual callout `h3`)
  - `--pub-cta-title: clamp(19px, 2vw, 24px)` (footer CTA headline)
  - `--pub-h2-sm: clamp(28px, 3.8vw, 48px)` (Visit Us heading)
  - `--pub-h2: clamp(30px, 4.5vw, 58px)` (section headings, statement `h2`, contact `h2`)
  - `--pub-h1: clamp(38px, 5.5vw, 76px)` (Hero `h1`)
  - Guarded by `npm run test:public-typography` (`tests/public-typography.test.mjs`).
  - *Phase 2–4 migration note:* Remaining public pages (`contact-form.module.css`, campaign/variant preview modules, and inner page styles) should adopt these exact `--pub-*` tokens when upgraded.

### Radii, Elevation & Motion Tokens
- Radii: `--r-sm: 10px`, `--r-md: 16px`, `--r-lg: 24px`, `--r-xl: 32px`, `--r-pill: 999px`
- Shadows (tinted with brand navy `0 36 61`):
  - `--shadow-sm: 0 2px 6px rgb(0 36 61 / .04), 0 8px 20px rgb(0 36 61 / .06)`
  - `--shadow-md: 0 4px 12px rgb(0 36 61 / .06), 0 18px 40px rgb(0 36 61 / .10)`
  - `--shadow-lg: 0 10px 28px rgb(0 36 61 / .10), 0 28px 64px rgb(0 36 61 / .14)`
- Easing: `--ease-out-expo: cubic-bezier(0.22, 1, 0.36, 1)`
- Respect `@media (prefers-reduced-motion: reduce)` everywhere.

---

## 3. Verified Guardrails (Caught During Multi-Pass Audit)

These exact constraints were verified against `tests/` and core components and **must never be violated**:

1. **Hero & Section Visual Geometry (`tests/page-content-browser.mjs` lines 93, 95, 98):**
   - `.hero-art .section-visual` width is asserted to equal `430px ± 2px` (default) and `380px ± 2px` (when edited in Admin), with aspect ratio matching the admin preview within `0.01`.
   - On `390px` mobile, `.hero-art .section-visual` width must be `250px < width <= 358px` and aspect ratio must match `430 / 242 ± 0.02`.
   - **Rule:** Do NOT add `padding`, width overrides, or box-shrinking borders onto `.section-visual` or `.hero-art.visual-home-hero`.
   - **Rule (Frameless Media):** Never paint a card background, border ring, or box-shadow behind uploaded images/videos (`.section-visual:has(.section-visual-media)` must stay 100% frameless so transparent or white-bg cutouts blend seamlessly). Only apply subtle card framing to pattern-only slots (`.section-visual:not(:has(.section-visual-media))`). Keep the right side of `.hero` pure `#ffffff` behind hero media.
   - **Rule:** Never touch `src/app/visual-layout.css` or `src/components/section-visual.tsx` media/video/crop logic.

2. **Zero Horizontal Overflow on Mobile `390px` (`tests/page-content-browser.mjs` & `tests/portfolio-browser.mjs`):**
   - Both test suites assert `document.documentElement.scrollWidth > innerWidth === false` at `390px`.
   - **Rule:** All ambient radial glows, dot grids, and decorative pseudo-elements on `.hero`, `.statement`, and `.contact` must be clipped inside `overflow: hidden` / `overflow-x: clip`.

3. **SSR / Static-Markup Visibility (`tests/page-content-browser-build.mjs`):**
   - `tests/page-content-browser.mjs` renders `Home()` using `renderToStaticMarkup` (no client hydration).
   - **Rule:** Never set default `opacity: 0` on sections in CSS waiting for JS. All sections must be `opacity: 1` by default on SSR/no-JS. Any scroll animation must be strictly progressive (or CSS hover/transition micro-interactions only).

4. **Admin Panel Isolation (`tests/admin-typography.test.mjs`):**
   - Asserts exact `.admin-shell{--fs-tag:13px;--fs-label:13px;--fs-meta:14px;--fs-ui:15px...}` in `globals.css`.
   - **Rule:** Do not modify any `.admin-*` or `.pn-*` rules in `globals.css`.

5. **Header Interactive States (`header-scroll.tsx`, `nav-dropdown.tsx`, `mobile-menu.tsx`, `session-menu.tsx`):**
   - Preserve `data-scrolled` and `data-hidden` behavior on `.site-header` (including `--header-height` and `--header-offset`).
   - Preserve `.nav-dropdown:hover` AND `.nav-dropdown[data-open]` opening the dropdown panel.
   - Keep `.site-header[data-scrolled] .mobile-menu-panel` solid background (no page text bleeding through).
   - Keep both `.site-header.header-dark` and `.site-header.header-light` working cleanly.

6. **Test CSS Bundle Alignment (`tests/page-content-browser.mjs` line 14):**
   - Focused browser QA loads `brand-colors.css` + `globals.css` + CSS imported by page components. Keep public redesign styles inside `globals.css`, `portfolio.css`, and existing CSS modules so QA and production always match 1:1.

---

## 4. Phase 1 Scope & File Plan (Homepage + Header + Footer)

### Files to Backup (`E:\Allprojects\backup\merasoftware\work104\`) & Modify
1. `src/app/layout.tsx`
   - Import `Instrument_Serif` from `next/font/google` (`variable: "--font-serif"`, `weight: "400"`, `style: ["normal", "italic"]`, `subsets: ["latin"]`) and append `${instrumentSerif.variable}` to `<html>`.
2. `src/app/globals.css`
   - **Typography & Tokens:** Switch `body` to `var(--font-geist-sans)`, `em` emphasis to `var(--font-serif)`, add modern radius/shadow/easing CSS variables, clean up line 17 blanket `!important` overrides safely for public pages while keeping readable floors and `.admin-shell` untouched.
   - **Header (`.site-header`):** Translucent navy glassmorphism (`backdrop-filter: blur(16px)`), subtle cyan-tinted border, pill hover on nav links, animated floating `.nav-dropdown-panel` (supporting `:hover` + `[data-open]`), refined `.session-link`, `.session-trigger`, `.session-dropdown`, and `.nav-cta`.
   - **Hero (`.hero`, `.hero-grid`, `.eyebrow`, `.button`, `.text-link`, `.hero-art`):** Ambient `--brand-ice` radial glow + faint dot-grid backdrop (clipped with `overflow: hidden`), pill `.eyebrow` badge, refined display `h1` & `.intro`, button hover lift + arrow slide, elevated shadow/ring framing on `.hero-art` without altering `.section-visual` dimensions.
   - **Marquee (`.marquee`, `.marquee-track`):** Mono uppercase tracking, subtle cyan top/bottom hairline, smooth left/right gradient fade masks (`mask-image`), pause-on-hover.
   - **Services (`.service-list`, `.service`, `.service-number`, `.service-arrow`, `.visual-feature`):** Interactive rounded cards on `.section-soft`, left cyan accent bar on hover, mono `01/02/03` pill badge, circular `↗` icon button, framed visual slot (zero dimension interference).
   - **Point of View (`.statement`):** Deep navy radial spotlight + fine architectural grid overlay (clipped), frosted dark visual frame.
   - **From The Journal (`.post-grid`, `.post-card`, `.post-art`, `.home-post-image`, `.post-copy`, `.post-meta`):** `16 / 10` media ratio with hover zoom, branded navy-to-blue gradient fallback art, pill category tag, crisp title hover, hairline divider above `.post-meta`.
   - **Contact CTA (`.contact`, `.contact-inner`):** Rounded spotlight card inside `.container` (`border-radius: 32px`, soft `--brand-ice` gradient, cyan hairline border, elevated shadow) + preserved `SectionVisual`.
   - **Visit Us (`.business-location`, `.location-address`, `.location-pin`, `.location-map-card`, `.location-secondary`):** Clean white address card with teal pin badge, sleek map header & elevated map frame, refined button styling (keeping `ShareLocation` status/input intact).
   - **Footer (`.site-footer`, `.footer-cta`, `.footer-top`, `.footer-label`, `.footer-bottom`):** Top cyan gradient hairline, refined CTA strip, mono labels, smooth hover states, untouched `.whatsapp-float`.
3. `src/app/portfolio.css`
   - Upgrade `.portfolio-card` with `16 / 10` media hover zoom, pill category tag, smooth `translateY(-5px)` lift & elevated shadow, clean footer link transition, keeping `.portfolio-reactions.compact` and `390px` mobile layout overflow-free.
4. `src/components/campaign/homepage-ctas.module.css`
   - Style `.packages` as a clean rounded inline callout bar (`background: var(--brand-white)`, border, flex space-between) and refine `.offers` link under Contact CTA.
5. `src/app/page.tsx` *(minimal/optional wrapper only if needed for marquee fade mask or contact card container — zero content, data, or visual-slot changes)*.

### Files Explicitly Untouched in Phase 1
- `src/app/brand-colors.css` (palette values unchanged)
- `src/app/visual-layout.css`
- `src/components/section-visual.tsx`
- `src/lib/homepage-content.ts`, `src/lib/visual-slots.ts`, `src/lib/section-visuals.ts`
- `src/components/site-header.tsx`, `src/components/header-scroll.tsx`, `src/components/nav-dropdown.tsx`, `src/components/mobile-menu.tsx`, `src/components/session-menu.tsx`
- `src/components/site-footer.tsx`, `src/components/portfolio.tsx`, `src/components/business-location.tsx`, `src/components/share-location.tsx`
- Everything under `src/app/admin/**`, `src/app/api/**`, `tests/**`

---

## 5. Verification Checklist (After Implementation)

1. **Automated Checks:**
   - `npm run lint`
   - `npm run build`
   - `npm run test:admin-typography`
   - `npm run test:content`
   - `npm run test:content:browser` *(verifies Hero video/image/crop geometry at 1440px & 390px + zero overflow!)*
   - `npm run test:portfolio`
2. **Manual / Live Browser Visual Audit (`http://localhost:3000`):**
   - Compare Desktop (`1440px`) and Mobile (`390px`) side-by-side against `E:\Allprojects\merasoftware-home-preview.html`.
   - Verify real logo SVG swap, sticky header scroll hide/show, dropdown hover + click, mobile menu, real Cloudinary images/videos in Hero/Services/Statement/Contact, portfolio cards + reactions, journal cards, Visit Us map + Copy map link, and WhatsApp float.

---

## 6. Current Progress & Next Chat Handoff

### Completed (Verified with `next build` + Automated Tests)
- **Phase 1 — Homepage (`/`), Header, Footer, Visit Us & Public Typography SSOT:**
  - `src/app/layout.tsx` (`Instrument_Serif` `--font-serif` added alongside `Geist` & `Geist_Mono`)
  - `src/app/globals.css` (single `:root` `--pub-*` SSOT with `--pub-ui: 16px` & min `13px` floor, Glassmorphic Header, Hero, Marquee, Services, Point of View, Journal, Contact CTA, Visit Us, Footer, `.page-hero`, `.result-grid`, frameless media rule)
  - `src/app/portfolio.css`, `src/components/campaign/homepage-ctas.module.css`
  - `tests/public-typography.test.mjs` (`npm run test:public-typography` in `package.json`)
- **Phase 2 — All Services (`/services`) & Detail Pages (`/services/[slug]`):**
  - `src/app/services/services.module.css` (centered/ambient intro hero, frameless media, dynamic interactive accordion cards matching Home/Detail feel, rounded bottom CTA)
  - `src/app/services/[slug]/page.tsx` (removed inline `fontSize` overrides; uses `--pub-*` SSOT)
- **Phase 3a — Packages Pages (`/packages/one-time-packages`, `/packages/monthly-packages`, `/packages/[slug]`):**
  - `src/components/campaign/staff-packages.tsx` (replaced native `<select>` with header-consistent `SortMenu` capsule dropdown opening on hover or click/tap)
  - `src/components/campaign/campaign.module.css` (centered compact `.pkgHero`, Option 3 Apple/Linear segmented pill track with `.pkgFilterLabel` hidden, capsule `SortMenu` panel, modern `24px`-radius `.pkgCard` with `✓` checkmarks, price divider, pill CTA)
- **Backups:** `work104` through `work114` saved under `E:\Allprojects\backup\merasoftware\`. **Next available backup folder: `work115`**.

### Immediate Next Task for New Chat (Phase 3b — `/plans` & `/plans/[plan]`)
An initial CSS pass was applied to `src/components/plans/plans.module.css` and `.showcaseHero` in `campaign.module.css`, **but the owner noted `/plans` still lacks full parity with `/packages/one-time-packages`**. Before editing, take `work115` backup of `src/app/plans/page.tsx`, `src/components/plans/plan-card.tsx`, and `src/components/plans/plans.module.css`, then:
1. **`src/app/plans/page.tsx`:** Remove the leftover `← Back to home` link (line 36) and the standalone `4 plans` pill (`<div className={c.pills}>...</div>`, line 41) so the hero matches `/packages/[slug]`.
2. **`src/components/plans/plan-card.tsx` & `src/components/plans/plans.module.css`:**
   - Match `PackageCard` visual rhythm: `grid-auto-rows: 1fr` on `.grid`, equal-height `h3` (`2-line` clamp + `min-height: 2.5em`) and `.description` (`2-line` clamp + `min-height: 3.1em`) so price & CTA align horizontally across every row.
   - Make the whole card clickable (`::after { inset: 0 }` on `.button` link + `.card:has(a:focus-visible)` focus ring).
   - Match `.range` to `.pkgAmount` (`34px` bold `--brand-teal` with hairline divider) and style `.benefit` cleanly.
3. **Verify:** `npx eslint src/app/plans/page.tsx src/components/plans/plan-card.tsx && npm run test:public-typography && node --import tsx --test tests/public-plans.test.ts && npm run build`.
4. After `/plans`, proceed to `/plans/[plan]` (PlanBuilder), `/package/[id]`, `/offers`, `/about`, `/work`, `/contact`, `/blog`, `/community`, and Auth/Account pages.
