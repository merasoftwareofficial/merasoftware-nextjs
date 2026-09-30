/**
 * How a category or tag becomes a /topics/[slug] address.
 *
 * The one rule for the article's tag links, the topic page and the sitemap.
 * It was once written out in each of the three, and the sitemap copy put a raw
 * "&" into sitemap.xml, which is invalid XML and made the whole file unreadable
 * to crawlers.
 *
 * The slug itself is unchanged ("Mental Health & Parenting" is still
 * "mental-health-&-parenting"), so no existing link breaks; topicPath() only
 * percent-encodes it for use in a URL.
 */

export function topicSlug(value: string) {
  return value.toLowerCase().replace(/\s+/g, "-");
}

/** The site-relative address of a topic, safe in an href and in XML. */
export function topicPath(value: string) {
  return `/topics/${encodeURIComponent(topicSlug(value))}`;
}

/**
 * Does this category or tag belong to the topic in the URL?
 *
 * The route param may arrive encoded ("%26") or decoded ("&") depending on how
 * the link was written, so both forms match.
 */
export function topicMatches(value: string, slug: string) {
  return topicSlug(value) === decodeSlug(slug).toLowerCase();
}

/** The readable form of a URL slug, for headings and titles. */
export function topicLabel(slug: string) {
  return decodeSlug(slug).replaceAll("-", " ");
}

function decodeSlug(slug: string) {
  try {
    return decodeURIComponent(slug);
  } catch {
    // A stray "%" that is not an escape: the slug is already plain text.
    return slug;
  }
}
