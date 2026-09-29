# Project Instructions

- Project: `E:\Allprojects\merasoftware`.
- Brand/domain/email: Mera Software / `merasoftware.com` / `contact@merasoftware.com`.
- One Next.js full-stack project, deployed on Vercel (`merasoftware-nextjs`, see `login.md`) on the MongoDB driver. Cloudinary uploads are not configured yet. Firebase Auth is on hold — login comes from the client portal (`login.md`).
- Storage uses `src/lib/repo/`. JSON in `.data/*.json` is the local default; MongoDB mode uses `DATA_DRIVER=mongo` and `MONGODB_URI` (database defaults to `merasoftware`). Never import a driver directly or add LocalStorage as a data store.
- This repo's `origin` is `merasoftwareofficial/merasoftware-nextjs`; `main` is synced. Push permission belongs to each GitHub repo separately. Use the `merasoftwareofficial` account; for a `Vast-Academy` repo, invite it with Write access and accept the invite first.
- The client portal lives in `E:\Allprojects\frontend` (`merasoftwareofficial/merasoftware-frontend-portal`) and `E:\Allprojects\backend` (`merasoftwareofficial/merasoftware-backend`) since 28 Sep 2026. `account-android-app/AccountApp` push dry-run passed on 26 Sep 2026; access to `account-android-app/backend` is not verified. These live in separate folders/repos; check `origin` before pushing.
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
- Sign in at `/login` with a client-portal account (email + password); "Create account" there makes a blog-only member. Editor or Admin publishes directly; a Moderator approves members' posts; a Member can only submit for review. Blog roles are set at `/admin/users` (full role table in `BLOG.md`).
