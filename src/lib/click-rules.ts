/**
 * Which clicks on an article count, and how the admin panel names them. Same
 * role as share-rules.ts: the API route and the panel both ask here. Click
 * counts are for the admin panel only, never shown to readers, and are kept
 * per day and placement to show what readers do at the end of a page.
 */

import type { Blog, ClickPlacement } from "@/lib/repo";

/** Every placement a click is counted under, in the order the panel shows them. */
export const CLICK_PLACEMENTS: ClickPlacement[] = ["related", "next-page"];

/** Short names for the admin table. */
export const CLICK_PLACEMENT_SHORT: Record<ClickPlacement, string> = {
  related: "Related",
  "next-page": "Next page",
};

/** Could the page have shown this related post? A different, published post. */
export function relatedCountable(source: Blog, target: Blog) {
  return target._id !== source._id && target.status === "published";
}

/**
 * Highest page number counted. Pages follow the reader's screen
 * (article-reader.tsx), so the server cannot know a post's exact count; this
 * only keeps nonsense out.
 */
const MAX_PAGE = 200;

/** Could the reader have turned to this page? Page 2 onwards. */
export function pageCountable(page: number) {
  return Number.isInteger(page) && page >= 2 && page <= MAX_PAGE;
}
