# Blog & Community — Implementation Plan

## Goal

Build a real Mera Software blog/community system that creates SEO traffic and brings useful members together. It must not become a spam or paid-backlink publishing website.

## Local first, online later

```text
Now:   Next.js + local MongoDB + Firebase dev/Emulator + Cloudinary dev account
Later: Vercel + MongoDB Atlas + Firebase production + Cloudinary production
```

Use the same code in both stages; only environment variables/database change. No dummy/mock completion is acceptable.

Do not use LocalStorage or JSON files as a temporary blog database. Build against local MongoDB now so production migration only changes credentials:

```text
MONGODB_URI: local MongoDB → MongoDB Atlas
Firebase:    development/Emulator → production Firebase
Cloudinary:  development account/folder → production account/folder
Next.js:     localhost → Vercel
```

## Current build mode

First complete the full local UI structure and interactive flows: write post, submit review, comments, reactions, saved posts, discussion creation and admin moderation screens. These flows may use temporary in-browser state and reset on refresh until database setup is complete. Do not describe this stage as persistent data working.

After UI approval, connect the same flows to MongoDB/Firebase/Cloudinary without changing the user journey.

## Required public areas

```text
/blog                 Official Mera Software articles
/community            Approved member/guest articles
/discussions          Short questions, tips and discussions
/topics/[slug]        Topic/category hub
/members/[username]   Member profile and approved posts
/account/saved        Logged-in member's saved blogs
```

## Users and publishing flow

```text
Visitor       Read public content
Member        Login, profile, comments, reactions, saves, draft/submission
Moderator     Review posts/comments/reports
Editor        Manage official posts and SEO
Admin         Full users, settings and content control

Member: Write → Save Draft → Submit for Review → Approve/Reject/Request Changes → Publish
```

Members must not directly public-publish at launch.

## Blog types and visibility

- Official: company-written; public/indexable after publish.
- Community: member/guest-written; review required.
- Discussion: short community post; moderation required.
- Public: anyone can read.
- Members-only: login required; noindex.
- Private: author/admin/selected users only; noindex.
- Unlisted: direct link only; noindex and excluded from listings/sitemap.

Statuses: `draft`, `pending`, `published`, `scheduled`, `rejected`, `archived`.

## Required functionality

### Editor

- Rich-text editor (Tiptap preferred), not plain textarea.
- Title, slug, excerpt, content, category/tags, featured image + alt text.
- SEO title, meta description, Open Graph image, preview.
- Admin: draft, publish, schedule, archive, reject/request changes.
- Member: draft and submit-for-review.

### Engagement

- Login-only comments and replies.
- Moderator approval/hide/delete and report-spam feature.
- Helpful 👍: one reaction per user; public aggregate count.
- Insightful 💡: one reaction per user; public aggregate count.
- Saved 🔖: private member list at `/account/saved`.
- All posts, comments, reactions and saves must persist in MongoDB.

### Community quality and SEO

- New community posts start `noindex`; moderator can make quality/relevant public posts indexable.
- Only published + public + indexable records enter sitemap.
- Guest/member external links use `rel="ugc"`; paid links use `rel="sponsored"`.
- Reject copied, irrelevant, spam, casino/adult and backlink-only content.
- Public articles need metadata, canonical URL, Article/Breadcrumb/Author schema, related posts and topic/internal links.

### Admin modules

- Official post CRUD, community review queue, comments/reports, categories/tags.
- Member profiles, role changes and bans.
- Cloudinary media upload/replace/delete.
- Blog visibility/status/SEO controls.
- Analytics: most Helpful, Insightful and Saved content.

## Data and security

```text
MongoDB: users, profiles, blogs, categories, tags, comments, reports,
reactions, saved_posts, media, notifications, audit_logs

Firebase: identity/login and role verification
Cloudinary: images only; store URL/publicId in MongoDB
```

Cloudinary API secret stays server-side. Verify Firebase token and role on every protected API call; never trust client-provided role/user ID.

## Exact implementation order

1. Install/start local MongoDB; create `.env.local`; verify database connection.
2. Firebase client login, profile creation, roles and protected routes.
3. Replace `src/lib/site-data.ts` public blog placeholders with MongoDB reads.
4. Build real official blog CRUD + rich editor + draft/publish flow.
5. Build Cloudinary signed upload UI/API.
6. Build community/discussion submission and moderator queue.
7. Build comments, replies, reports, Helpful/Insightful/Saved and account saved page.
8. Add public author/topic pages, search, related posts, noindex/index rules, sitemap/schema.
9. Test every permission and flow locally before Vercel migration.

## Current status

- Foundation exists: Blog/Reaction/SavedPost models and `/api/blogs`, `/api/reactions`, `/api/saved-posts`.
- Not complete: local DB setup, Firebase client auth, form/API connections, Cloudinary, comments/moderation/community pages, SEO dynamic data.
- Existing blog/admin pages are placeholder UI and must be replaced/connected during the steps above.
