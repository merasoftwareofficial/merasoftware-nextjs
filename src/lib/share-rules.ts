/**
 * Who sees the share buttons, which ones, and which share clicks count. Same
 * role as view-rules.ts: the API route and the pages both ask here so they
 * cannot disagree. Share counts are for the admin panel only — never shown to
 * readers — and are kept per day and platform for trends and ranking.
 */

import { atLeast } from "@/lib/auth";
import { SITE_URL } from "@/lib/structured-data";
import type { Blog, Settings, SharePlatform, User } from "@/lib/repo";

/** The buttons an admin can turn on or off, in the order readers see them. */
export const SHARE_BUTTONS: { platform: Exclude<SharePlatform, "native">; label: string }[] = [
  { platform: "whatsapp", label: "WhatsApp" },
  { platform: "facebook", label: "Facebook" },
  { platform: "x", label: "X" },
  { platform: "linkedin", label: "LinkedIn" },
  { platform: "telegram", label: "Telegram" },
  { platform: "email", label: "Email" },
  { platform: "copy", label: "Copy link" },
];

/** Every platform a share click can be counted under, including the phone's own share sheet. */
export const SHARE_PLATFORMS: SharePlatform[] = [...SHARE_BUTTONS.map(button => button.platform), "native"];

/** Short names for the admin table. */
export const SHARE_PLATFORM_SHORT: Record<SharePlatform, string> = {
  whatsapp: "WA",
  facebook: "FB",
  x: "X",
  linkedin: "LI",
  telegram: "TG",
  email: "Mail",
  copy: "Link",
  native: "Phone",
};

/**
 * Does this post show share buttons? Only a published post that anyone may
 * open by link: a members-only or private link lands a stranger on a login
 * wall, so sharing it would only look broken. The post's own choice wins over
 * the site setting, as with view counts.
 */
export function shareVisible(blog: Blog, settings: Settings) {
  if (blog.status !== "published" || blog.visibility === "members" || blog.visibility === "private") return false;
  if (blog.sharing === "show") return true;
  if (blog.sharing === "hide") return false;
  return settings.shareEnabled === true;
}

/**
 * The post's own address. Always ours, even when the canonical points elsewhere.
 *
 * WhatsApp and Telegram cache a link's preview by its exact URL and never re-read
 * it, so a post shared before it had a photo kept a preview without one. `?v=`
 * is taken from the featured image URL: a new or changed photo gives a new link
 * and a fresh preview, while text edits and reactions leave it alone. The page
 * ignores the parameter and the canonical stays clean.
 */
export function shareUrl(blog: Blog) {
  const base = `${SITE_URL}/blog/${blog.slug}`;
  const image = blog.featuredImage?.url;
  return image ? `${base}?v=${imageVersion(image)}` : base;
}

/** A short, stable fingerprint of the image URL (32-bit FNV-1a in base 36). */
function imageVersion(url: string) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < url.length; i++) {
    hash ^= url.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

export type ShareButton = { platform: Exclude<SharePlatform, "native">; label: string; href?: string };

/** The buttons this post shows, with their share links; empty when it shows none. `copy` has no link. */
export function shareButtons(blog: Blog, settings: Settings): ShareButton[] {
  if (!shareVisible(blog, settings)) return [];

  const url = encodeURIComponent(shareUrl(blog));
  const title = encodeURIComponent(blog.title);
  const links: Record<ShareButton["platform"], string | undefined> = {
    whatsapp: `https://wa.me/?text=${title}%20${url}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${url}`,
    x: `https://x.com/intent/tweet?text=${title}&url=${url}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${url}`,
    telegram: `https://t.me/share/url?url=${url}&text=${title}`,
    email: `mailto:?subject=${title}&body=${encodeURIComponent(blog.excerpt)}%0A%0A${url}`,
    copy: undefined,
  };

  const enabled = new Set(settings.sharePlatforms ?? []);
  return SHARE_BUTTONS.filter(button => enabled.has(button.platform)).map(button => ({ ...button, href: links[button.platform] }));
}

/**
 * Does a share click on this platform count? Only one the reader could have
 * made: the post shows sharing and that button is on. The phone's share sheet
 * is offered whenever sharing is. Who is excluded (author, staff) is decided
 * by shouldCount() in view-rules.ts, the same as for views.
 */
export function shareCountable(blog: Blog, settings: Settings, platform: SharePlatform) {
  if (!shareVisible(blog, settings)) return false;
  return platform === "native" || (settings.sharePlatforms ?? []).includes(platform);
}

/** May this user choose whether a post shows share buttons? Same rule as view counts. */
export function canSetShareMode(user: User | null) {
  return !!user && atLeast(user.role, "editor");
}
