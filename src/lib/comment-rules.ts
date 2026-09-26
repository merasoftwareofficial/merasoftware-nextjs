/**
 * Comment validation and the rules that decide who may do what to a comment.
 *
 * Kept out of the route files for the same reason as blog-rules.ts: the UI
 * hides what a user cannot do and the API enforces it, and the two can only
 * agree if they read one set of rules.
 */

import { z } from "zod";
import { atLeast } from "@/lib/auth";
import type { Blog, Comment, CommentMode, CommentStatus, Settings, User } from "@/lib/repo";

export const commentInputSchema = z.object({
  blogId: z.string().min(1),
  parentId: z.string().min(1).optional(),
  body: z.string().trim().min(2, "write something first").max(2000, "keep it under 2000 characters"),
});

export const commentPatchSchema = z.object({
  action: z.enum(["approve", "hide", "show"]),
});

export const reportInputSchema = z.object({
  targetType: z.enum(["blog", "comment"]),
  targetId: z.string().min(1),
  reason: z.string().trim().min(4, "say what is wrong").max(500),
});

export type CommentInput = z.infer<typeof commentInputSchema>;
export type ReportInput = z.infer<typeof reportInputSchema>;

/**
 * The comment mode actually in force for a post.
 *
 * A post that never chose for itself follows the site setting, so an admin
 * flipping `commentDefault` moves every such post at once. A post whose editor
 * chose open / moderated / closed keeps that choice — a site default must not
 * silently reopen comments somebody deliberately closed.
 */
export function effectiveMode(blog: Blog, settings: Settings): Exclude<CommentMode, "default"> {
  if (!settings.commentsEnabled) return "closed";
  const chosen = blog.comments ?? "default";
  if (chosen !== "default") return chosen;
  return settings.commentDefault === "pending" ? "moderated" : "open";
}

/** Are new comments accepted on this post at all? */
export function commentsAccepted(blog: Blog, settings: Settings) {
  return effectiveMode(blog, settings) !== "closed";
}

/**
 * The status a new comment is created with.
 *
 * `moderated` holds it as pending until a moderator approves, which is how the
 * admin panel's "hold new comments for review" setting takes effect.
 */
export function initialCommentStatus(blog: Blog, settings: Settings): CommentStatus {
  return effectiveMode(blog, settings) === "moderated" ? "pending" : "visible";
}

/** May this user approve, hide or show other people's comments? */
export function canModerateComment(user: User | null) {
  return !!user && atLeast(user.role, "moderator");
}

/**
 * May this user delete this comment for good?
 *
 * An author may remove their own, and an admin may remove anybody's — deleting
 * takes its replies with it, so it stays above the moderator's hide.
 */
export function canDeleteComment(user: User | null, comment: Comment) {
  if (!user) return false;
  if (atLeast(user.role, "admin")) return true;
  return comment.userId === user._id;
}

/** May this user delete anybody's comment, without naming one? Admin power. */
export function canDeleteAnyComment(user: User | null) {
  return !!user && atLeast(user.role, "admin");
}

/** May this user choose the comment mode when writing or editing a post? */
export function canSetCommentMode(user: User | null) {
  return !!user && atLeast(user.role, "editor");
}

/** Which comments may this viewer see on a post? */
export function visibleStatuses(user: User | null, blog: Blog): CommentStatus[] {
  // Staff review pending comments in place; the author of the post sees them
  // too, so a held comment is not invisible to the person it is addressed to.
  if (canModerateComment(user)) return ["visible", "pending", "hidden"];
  if (user && blog.authorId === user._id) return ["visible", "pending"];
  return ["visible"];
}

/** Can this viewer see this one comment? Used when a reply targets a parent. */
export function isCommentReadable(comment: Comment, user: User | null, blog: Blog) {
  if (visibleStatuses(user, blog).includes(comment.status)) return true;
  return !!user && comment.userId === user._id;
}
