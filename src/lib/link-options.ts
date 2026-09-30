/**
 * The pages an admin link field can point at — the choices in LinkPicker.
 *
 * Built from the same sources the site itself uses (the page list, the
 * services, the published posts), so a new service or post appears in every
 * link dropdown by itself, and a switched-off page (lib/features.ts) never
 * does. The API routes check saved links against the same list, so a typo'd
 * path cannot be saved even by a hand-made request.
 */

import { FEATURES } from "@/lib/features";
import { blogRepo } from "@/lib/repo";
import { services } from "@/lib/site-data";

export type LinkOption = { label: string; href: string };
export type LinkGroup = { label: string; options: LinkOption[] };

/** The site's own pages a visitor can open without signing in. */
const PAGES: LinkOption[] = [
  { label: "Home", href: "/" },
  { label: "Services", href: "/services" },
  ...(FEATURES.portfolio ? [{ label: "Work", href: "/work" }] : []),
  { label: "Blog", href: "/blog" },
  { label: "Community", href: "/community" },
  { label: "Discussions", href: "/discussions" },
  { label: "About", href: "/about" },
  { label: "Contact", href: "/contact" },
  { label: "Privacy", href: "/privacy" },
];

/**
 * Published, public posts only: a members-only, private or unlisted post is
 * not a page every visitor can open, so a public button must not point at it.
 */
export async function linkGroups(): Promise<LinkGroup[]> {
  const posts = (await blogRepo.listCards({ status: "published" })).filter(post => post.visibility === "public");
  return [
    { label: "Pages", options: PAGES },
    { label: "Services", options: services.map(service => ({ label: service.title.split(" — ")[0], href: `/services/${service.slug}` })) },
    { label: "Blog posts", options: posts.map(post => ({ label: post.title, href: `/blog/${post.slug}` })) },
  ].filter(group => group.options.length > 0);
}

/**
 * Is this saved link acceptable? An address on this site must be one of the
 * choices above, or a topic or member page (reachable, just not offered in
 * the dropdown). Links elsewhere (https, mailto) were already checked for
 * format by the content schema.
 */
export async function unknownSitePaths(hrefs: string[]) {
  const known = new Set((await linkGroups()).flatMap(group => group.options.map(option => option.href)));
  return hrefs.filter(href => {
    if (!href.startsWith("/")) return false;
    const path = href.split(/[?#]/)[0] || "/";
    return !known.has(path) && !/^\/(topics|members)\/[^/]+$/.test(path);
  });
}
