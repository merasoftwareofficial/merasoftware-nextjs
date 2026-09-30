# Blog publishing correction — 29 September 2026

## Live article

- Owner explicitly approved the production cleanup in this conversation.
- Backed up the complete original record in `blog-before.ejson`.
- Applied `blog-proposed-patch.json` only after matching the original title, slug, content, SEO, comments, visibility and status. The update also matched the current timestamp to avoid overwriting a concurrent edit.
- Removed the duplicated title and eight publishing-instruction paragraphs, retaining the eleven article paragraphs.
- Moved the supplied SEO title and description into their proper fields and set comments to closed.
- Kept the slug and automatic canonical. No image was added because no actual approved image was available.
- Exactly one production record updated. Saved the resulting record in `blog-after.ejson`.
- Live HTTP verification passed; details are in `live-verification.json`.

## Local code, ready for owner review; not deployed

- Shared Tiptap-schema validation rejects malformed documents and empty/whitespace-only text, including direct API calls. Publish, approval, submission, schedule and live edits enforce it.
- Scheduled publishing skips invalid legacy content and continues with other valid due posts.
- Editor warns about possible publishing instructions without deleting or blocking legitimate SEO articles.
- Preview shows the article plus actual SEO, image, visibility, comment and publication details. Publishing/scheduling/live updates require review before any write; changing an input cancels the pending confirmation.
- Published articles use Update published article; saving no longer claims to create an unpublished revision. Unpublish does not first save unsaved edits onto the live page.
- Public list/detail/saved-post responses use an allowlist; internal fields and hidden view counts stay out. Staff retains moderation data; authors retain their own status/review feedback. Unlisted posts remain accessible by direct link but absent from public lists.
- Original files are backed up under this directory. New source files: `src/lib/content-rules.ts`, `src/lib/blog-response.ts`, `src/app/admin/blog/blog-preview.module.css`.

## Verification

- Isolated website and portal MongoDB databases: `merasoftware-fix-test`, with portal crons disabled. Owner servers on 3000/3001/8080 were not stopped.
- 12 integration groups passed using real signup/signin, real routes and MongoDB. A further scheduled-publication check confirmed invalid content stays scheduled while valid content publishes.
- Headless Chrome passed review-without-write, confirmation reset after editing, a single live PATCH, advisory warning, safe unpublish, new-post publication and mobile layout tests. No browser page errors.
- TypeScript passed. `npx eslint src`: zero errors, 16 existing unused-variable warnings. `git diff --check` passed after whitespace cleanup.
- `next build --webpack` passed in the isolated copy. Default Turbopack build could not resolve that copy's external node_modules junction; it was not a successful default-build check.
- Plain `npm run lint` also scans old rollback folders and fails on their old code. Those backups were not altered.
- Test scripts and preview screenshots are retained here.

## Remaining

- Deploy the local code changes after owner review; only article data has changed live so far.
- Choose an actual featured image if one is desired.
- Project docs remain unchanged pending the owner's review, as requested by BLOG.md.
- Test servers on 3010/8090 were stopped. Automatic approval review rejected temporary-folder/junction deletion with `blocked by policy`, so `E:/Allprojects/merasoftware-verify-tmp` remains. The two isolated test runs and their local test-state file are retained as well; production was not used for testing.
