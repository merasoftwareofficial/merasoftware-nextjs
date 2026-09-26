/**
 * Renders stored Tiptap JSON as HTML on the server.
 *
 * Uses @tiptap/static-renderer rather than the core generateHTML helper: that
 * one serialises through the DOM and throws "window is not defined" in a
 * server component. The static renderer works without a DOM, so public article
 * pages stay server-rendered and indexable.
 */

import { renderToHTMLString } from "@tiptap/static-renderer";
import { editorExtensions } from "./extensions";

export function RichContent({ content, className = "article-body" }: { content: unknown; className?: string }) {
  if (!content || typeof content !== "object") return null;

  let html = "";
  try {
    html = renderToHTMLString({ content: content as never, extensions: editorExtensions });
  } catch {
    // A malformed stored document must not take the whole page down.
    return <div className={className}><p>This article could not be displayed.</p></div>;
  }

  return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}

/** Plain text from a Tiptap document — used for reading time and meta fallbacks. */
export function docToText(content: unknown): string {
  const parts: string[] = [];
  const walk = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    const item = node as { type?: string; text?: string; content?: unknown[] };
    if (item.type === "text" && item.text) parts.push(item.text);
    if (Array.isArray(item.content)) item.content.forEach(walk);
  };
  walk(content);
  return parts.join(" ");
}

/** Approximate reading time, at the usual 200 words per minute. */
export function readingTime(content: unknown): string {
  const words = docToText(content).trim().split(/\s+/).filter(Boolean).length;
  return `${Math.max(1, Math.round(words / 200))} min read`;
}
