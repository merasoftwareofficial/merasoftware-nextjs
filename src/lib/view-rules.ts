/**
 * Who counts as a view, and who sees the count. Same role as comment-rules.ts:
 * the API route and the pages both ask here so they cannot disagree.
 */

import { createHmac } from "node:crypto";
import { atLeast } from "@/lib/auth";
import { isReadable } from "@/lib/blog-rules";
import type { Blog, Settings, User } from "@/lib/repo";

/** Crawlers, link previews and scripted clients. A view is a person reading. */
const BOT = /bot|crawl|spider|slurp|mediapartners|facebookexternalhit|embedly|preview|whatsapp|telegram|skype|curl|wget|python|java\/|go-http|headless|lighthouse|pingdom|uptime|monitor/i;

export function isBot(userAgent: string) {
  return !userAgent || BOT.test(userAgent);
}

/**
 * Does this reader's visit count? Only a published post the reader may open,
 * and never its own author or staff — their visits are work, not readership.
 */
export function shouldCount(viewer: User | null, blog: Blog) {
  if (blog.status !== "published" || !isReadable(blog, viewer)) return false;
  if (viewer && (viewer._id === blog.authorId || atLeast(viewer.role, "moderator"))) return false;
  return true;
}

/**
 * The visitor key: a keyed hash of IP, browser and post. Without the secret it
 * cannot be turned back into an IP, and it is deleted after 24 hours, so no
 * reader can be followed across days. Null when VIEW_HASH_SECRET is not set.
 */
export function visitorKey(ip: string, userAgent: string, blogId: string) {
  const secret = process.env.VIEW_HASH_SECRET;
  if (!secret) return null;
  return createHmac("sha256", secret).update(`${ip}|${userAgent}|${blogId}`).digest("hex");
}

/** Calendar day in India time (YYYY-MM-DD), `daysAgo` days before now. */
export function dayKey(daysAgo = 0) {
  const date = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(date);
}

/** Is the view count shown to readers? The post's own choice wins over the site setting. */
export function viewsVisible(blog: Blog, settings: Settings) {
  if (blog.showViews === "show") return true;
  if (blog.showViews === "hide") return false;
  return settings.viewsPublic === true;
}

/** May this user choose whether a post shows its view count? Same rule as comments. */
export function canSetViewMode(user: User | null) {
  return !!user && atLeast(user.role, "editor");
}

export function formatViews(count: number) {
  return `${count.toLocaleString("en-IN")} ${count === 1 ? "view" : "views"}`;
}
