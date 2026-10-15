# Blog Management organisation

`/admin/blog-management` is the single sidebar entry for existing blog-related management. It groups Posts, Review & moderation, Organisation & access, and Blog settings.

Existing routes and APIs are retained. Posts, new article, edit article, review, comments/reports, categories and users screens share navigation back to the workspace. Drafts and Scheduled use existing post filters. Reports links to the existing reports section of Comments.

The existing Comments/View/Share settings components are moved into `/admin/blog-management/settings`; Site settings keeps a link there. No settings data or API changes.

Workspace links preserve permissions: moderator and above for posts and moderation; admin only for categories, user roles and global blog settings. Publishing and scheduling remain editor/admin actions in existing forms and APIs. The workspace does not introduce per-user writing toggles.
