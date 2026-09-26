/**
 * Blog validation and the rules that decide who may do what to a post.
 *
 * Kept out of the route files so the admin UI and the API agree on one set of
 * rules — the UI hides what a user cannot do, the API enforces it.
 */

import { z } from "zod";
import { atLeast, type Role } from "@/lib/auth";
import type { Blog, BlogStatus, User } from "@/lib/repo";

export const blogInputSchema = z.object({
  title: z.string().trim().min(8, "needs at least 8 characters").max(160),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "use lowercase letters, numbers and hyphens only")
    .max(120),
  excerpt: z.string().trim().min(20, "needs at least 20 characters").max(400),
  content: z.unknown(),
  type: z.enum(["official", "community", "discussion"]),
  visibility: z.enum(["public", "members", "private", "unlisted"]).default("public"),
  category: z.string().trim().max(60).optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(12).default([]),
  featuredImage: z
    .object({
      url: z.string().url().or(z.literal("")),
      publicId: z.string().default(""),
      alt: z.string().trim().max(160).default(""),
    })
    .optional(),
  seo: z
    .object({
      title: z.string().trim().max(70).default(""),
      description: z.string().trim().max(180).default(""),
      canonical: z.string().url().or(z.literal("")).default(""),
    })
    .optional(),
  scheduledFor: z.string().datetime().optional(),
});

export type BlogInput = z.infer<typeof blogInputSchema>;

/** Every status change the API accepts, as an action name. */
export const STATUS_ACTIONS = [
  "save-draft",
  "submit",
  "approve",
  "reject",
  "request-changes",
  "publish",
  "schedule",
  "archive",
  "unpublish",
] as const;

export type StatusAction = (typeof STATUS_ACTIONS)[number];

export const statusActionSchema = z.object({
  action: z.enum(STATUS_ACTIONS),
  note: z.string().trim().max(500).optional(),
  scheduledFor: z.string().datetime().optional(),
  /** Moderators use this when approving a community post that deserves indexing. */
  index: z.boolean().optional(),
});

/** Minimum role required for each action. */
const ACTION_ROLE: Record<StatusAction, Role> = {
  "save-draft": "member",
  submit: "member",
  approve: "moderator",
  reject: "moderator",
  "request-changes": "moderator",
  publish: "editor",
  schedule: "editor",
  archive: "editor",
  unpublish: "editor",
};

/** The status a post lands in after an action succeeds. */
const ACTION_STATUS: Record<StatusAction, BlogStatus> = {
  "save-draft": "draft",
  submit: "pending",
  approve: "published",
  reject: "rejected",
  "request-changes": "draft",
  publish: "published",
  schedule: "scheduled",
  archive: "archived",
  unpublish: "draft",
};

export function statusFor(action: StatusAction) {
  return ACTION_STATUS[action];
}

/** Is this user allowed to run this action on this post? */
export function canRunAction(user: User, blog: Blog, action: StatusAction) {
  const owner = blog.authorId === user._id;

  // Authors always control their own unpublished work.
  if (owner && (action === "save-draft" || action === "submit")) return true;

  // Only staff may act on someone else's post, or move anything to a public state.
  return atLeast(user.role, ACTION_ROLE[action]);
}

/** May this user edit the post body? */
export function canEdit(user: User, blog: Blog) {
  if (blog.authorId === user._id && blog.status !== "published") return true;
  if (blog.type === "official") return atLeast(user.role, "editor");
  return atLeast(user.role, "moderator");
}

/** May this user delete the post? */
export function canDelete(user: User, blog: Blog) {
  if (blog.authorId === user._id && blog.status === "draft") return true;
  return atLeast(user.role, "admin");
}

/**
 * Where a newly created post starts: always an unpublished, unindexed draft.
 *
 * Nothing reaches the public web from creation alone. An editor moves an
 * official post on with `publish`; a member's post only becomes public through
 * `submit` and then a moderator's `approve`, which is where the index decision
 * is made — BLOG.md requires that members cannot publish directly.
 */
export function initialState(_type: BlogInput["type"], _user: User) {
  return { status: "draft" as BlogStatus, noIndex: true };
}

/** Can this post be shown to this viewer? Used by every public page. */
export function isReadable(blog: Blog, viewer: User | null) {
  if (viewer && (blog.authorId === viewer._id || atLeast(viewer.role, "moderator"))) return true;
  if (blog.status !== "published") return false;
  if (blog.visibility === "private") return false;
  if (blog.visibility === "members") return !!viewer;
  return true; // public and unlisted are both readable by link
}
