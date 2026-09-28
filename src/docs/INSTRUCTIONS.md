# Project Instructions

- Project: `E:\Allprojects\merasoftware`.
- Brand/domain/email: Mera Software / `merasoftware.com` / `contact@merasoftware.com`.
- One Next.js full-stack project. JSON and MongoDB drivers are implemented; Vercel deployment and Cloudinary uploads are not configured yet. Firebase Auth is on hold — login will come from the client portal (`login.md`). MongoDB build and connection ping pass; live CRUD still needs verification.
- Storage uses `src/lib/repo/`. JSON in `.data/*.json` is the local default; MongoDB mode uses `DATA_DRIVER=mongo` and `MONGODB_URI` (database defaults to `merasoftware`). Never import a driver directly or add LocalStorage as a data store.
- This repo's `origin` is `merasoftwareofficial/merasoftware-nextjs`; `main` is synced. Push permission belongs to each GitHub repo separately. Use the `merasoftwareofficial` account; for a `Vast-Academy` repo, invite it with Write access and accept the invite first.
- Verified 26 Sep 2026: `merasoftware-new/frontend` pushed and is synced; `account-android-app/AccountApp` push dry-run passed. Access to `merasoftware-new/backend` and `account-android-app/backend` is not verified. These live in separate folders/repos; check `origin` before pushing.
- Keep `.env.local` and numbered `workN` rollback folders out of commits.
- Do not claim mock UI or unconfigured integrations are functional.
- Light/dark theme: black and gray with green-lime accents. No large bright/neon-lime surfaces; use gray instead.
- Keep text readable; do not use extra-small text.
- Explain in short Hinglish. Read these docs before auditing unrelated files.
- These docs hold the owner's instructions. Whatever is decided or corrected in conversation must be written here so it survives the session; do not record your own opinions or unapproved suggestions as if they were instructions.

## Must-have scope

- Official business website: digital marketing, SEO, ads, software and website development.
- Public website + secure admin management panel in the same project.
- Public pages: Home, services, work, blog, about, contact and legal pages.
- Management: homepage/services/portfolio/FAQs, blogs, community moderation, media, leads, settings and users.
- Real local working is required: real storage, real login, real save/publish/reaction/comment flows; no fake completion.
- Sign in at `/login` (development session, no password). Editor or Admin role is needed to publish; Member can only submit for review.
