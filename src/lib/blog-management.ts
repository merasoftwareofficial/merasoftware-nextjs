import type { Role } from "@/lib/repo/types";
import { atLeast } from "@/lib/roles";

export const BLOG_MANAGEMENT_GROUPS: {
  label: string;
  items: { label: string; href: string; minimum: Role; description: string }[];
}[] = [
  { label: "Posts", items: [
    { label: "All posts", href: "/admin/blog", minimum: "moderator", description: "Browse, edit and manage existing posts." },
    { label: "Write article", href: "/admin/blog/new", minimum: "moderator", description: "Write an article using the existing editor." },
    { label: "Drafts", href: "/admin/blog?status=draft", minimum: "moderator", description: "Continue unfinished posts." },
    { label: "Scheduled", href: "/admin/blog?status=scheduled", minimum: "moderator", description: "View posts scheduled for publication." },
  ] },
  { label: "Review & moderation", items: [
    { label: "Post submissions", href: "/admin/blog/review", minimum: "moderator", description: "Approve, reject or request changes to submitted posts." },
    { label: "Comments", href: "/admin/comments", minimum: "moderator", description: "Review pending comments and manage visible or hidden comments." },
    { label: "Reports", href: "/admin/comments#reports", minimum: "moderator", description: "Review and resolve reader reports." },
  ] },
  { label: "Organisation & access", items: [
    { label: "Categories", href: "/admin/categories", minimum: "admin", description: "Manage categories and which ones members can use." },
    { label: "Users & blog roles", href: "/admin/users", minimum: "admin", description: "Manage website blog roles and ban or unban users." },
  ] },
  { label: "Blog settings", items: [
    { label: "Comments, views & sharing", href: "/admin/blog-management/settings", minimum: "admin", description: "Manage existing comment defaults, view counts and share buttons." },
  ] },
];

export function blogManagementGroups(role: Role) {
  return BLOG_MANAGEMENT_GROUPS.map(group => ({
    ...group, items: group.items.filter(item => atLeast(role, item.minimum)),
  })).filter(group => group.items.length > 0);
}
