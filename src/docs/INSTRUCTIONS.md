# Project Instructions

- Project: `E:\Allprojects\merasoftware`.
- Brand/domain/email: Mera Software / `merasoftware.com` / `contact@merasoftware.com`.
- One Next.js full-stack project, deployed on Vercel (`merasoftware-nextjs`, see `login.md`) on the MongoDB driver. Cloudinary has a verified server connection and `/admin/media` upload test (`CLOUDINARY.md`); blog/editor upload integration is pending. Firebase Auth is on hold — login comes from the client portal (`login.md`).
- Storage uses `src/lib/repo/`. JSON in `.data/*.json` is the local default; MongoDB mode uses `DATA_DRIVER=mongo` and `MONGODB_URI` (database defaults to `merasoftware`). Never import a driver directly or add LocalStorage as a data store.
- This repo's `origin` is `merasoftwareofficial/merasoftware-nextjs`; `main` is synced. Push permission belongs to each GitHub repo separately. Use the `merasoftwareofficial` account; for a `Vast-Academy` repo, invite it with Write access and accept the invite first.
- The client portal lives in `E:\Allprojects\frontend` (`merasoftwareofficial/merasoftware-frontend-portal`) and `E:\Allprojects\backend` (`merasoftwareofficial/merasoftware-backend`) since 28 Sep 2026. `account-android-app/AccountApp` push dry-run passed on 26 Sep 2026; access to `account-android-app/backend` is not verified. These live in separate folders/repos; check `origin` before pushing.
- Keep `.env.local` and numbered `workN` rollback folders out of commits.
- Do not claim mock UI or unconfigured integrations are functional.
- Public theme: navy, teal and cyan from the logo. White is the main page surface; soft blue-grey and pale cyan sections provide deliberate separation. Admin retains light/dark themes.
- Keep text readable; do not use extra-small text.
- Explain in short Hinglish. Read these docs before auditing unrelated files.
- These docs hold the owner's instructions. Whatever is decided or corrected in conversation must be written here so it survives the session; do not record your own opinions or unapproved suggestions as if they were instructions.

## Must-have scope

- Official business website: digital marketing, SEO, ads, software and website development.
- Public website + secure admin management panel in the same project.
- Public pages: Home, services, work, blog, about, contact and legal pages.
- Management: homepage/services/portfolio/FAQs, blogs, community moderation, media, leads, settings and users.
- Real local working is required: real storage, real login, real save/publish/reaction/comment flows; no fake completion.
- Sign in at `/login` with a client-portal account (email + password); "Create account" there makes a blog-only member. Editor or Admin publishes directly; a Moderator approves members' posts; a Member can only submit for review. Blog roles are set at `/admin/users` (full role table in `BLOG.md`).

## Brand logo (owner approved, 6 Oct 2026)

- Files: `public/brand/merasoftware-logo.svg` (light backgrounds) and `public/brand/merasoftware-logo-dark.svg` (navy/dark backgrounds). Both are static SVG with the text converted to paths, so they need no font; viewBox `0 180 2130 365`.
- Design: the owner's reference logo (four slanted bands forming an "M" + "MERA SOFTWARE / Digital Solutions"), redrawn from measured coordinates of the reference image ("word-fit" version A), in the owner's teal/navy colours.
  - Light: "MERA" `#02203a`, "SOFTWARE" `#027896`, "Digital Solutions" `#021d36`; teal bands, navy right band.
  - Dark: "MERA" `#f4f8fc`, "SOFTWARE" `#00b8cc`, "Digital Solutions" `#b6cddd`, right band blue `#1673b5`→`#2a8fd0`; every colour is from `src/app/brand-colors.css` and has at least 3:1 contrast on `--brand-navy`.
  - Inner shapes (the pale triangle, the dark overlap) must stay inside their band's edges — corrected on owner's review (the triangle was 5.8px outside the left band).
- Where used: `src/components/site-header.tsx` → `SiteHeader` renders `<img>` in `.brand.brand-logo`; `dark` (default `true`, set by owner) picks the dark file. Size in `src/app/globals.css` (end of file): 50px high, 38px below 700px.
- Before: the header showed the text logo `mera software.` (`<span>mera</span>software<span className="brand-dot">.</span>`). The footer (`site-footer.tsx`) and admin sidebar (`admin-layout.tsx`) still use that text logo — not changed.
- To change colours or shapes, edit both SVG files together; source script and preview were in the session scratchpad (not in the repo). Backups: `work73/` (header + CSS before the logo), `work74/` (SVGs before the shape fix).

## Shared visual rules (owner approved, 6 Oct 2026)

- Use shared surface, border, radius and shadow tokens in `src/app/brand-colors.css`; avoid homepage-only portfolio card overrides.
- Home: white hero and services, navy statement, white portfolio, soft blue-grey insights, pale cyan contact and navy footer.
- Home and `/work` use the same portfolio card styling and bottom-aligned project links. Services/blog cards share the public card border, corner and elevation rules.
