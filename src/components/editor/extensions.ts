/**
 * The one extension set used by both the editor and the server renderer.
 *
 * Keeping it in a single place means what an author sees while writing is
 * exactly what a reader gets on the public page.
 *
 * StarterKit already ships the Link extension, so Link is configured through
 * StarterKit rather than added separately — adding it twice makes Tiptap warn
 * about duplicate extension names.
 */

import Image from "@tiptap/extension-image";
import StarterKit from "@tiptap/starter-kit";

/** Marks community and guest links so search engines treat them correctly. */
export const UGC_REL = "ugc nofollow noopener";
/** Paid placements must be declared as sponsored. */
export const SPONSORED_REL = "sponsored nofollow noopener";
/** Official editorial links carry no special relationship. */
export const NORMAL_REL = "noopener";

export const editorExtensions = [
  StarterKit.configure({
    heading: { levels: [2, 3, 4] },
    link: {
      openOnClick: false,
      autolink: false,
      HTMLAttributes: { rel: NORMAL_REL, target: "_blank" },
    },
  }),
  Image.configure({ HTMLAttributes: { loading: "lazy" } }),
];

/** An empty Tiptap document, used when a new post is started. */
export const emptyDoc = { type: "doc", content: [{ type: "paragraph" }] };

/** True when a Tiptap document has no visible text. */
export function isEmptyDoc(doc: unknown): boolean {
  if (!doc || typeof doc !== "object") return true;
  const node = doc as { type?: string; text?: unknown; content?: unknown[] };
  if (node.type === "text" && typeof node.text === "string") {
    return node.text.replace(/[\s\u200B-\u200D\uFEFF]/gu, "").length === 0;
  }
  return !Array.isArray(node.content) || node.content.every(isEmptyDoc);
}
