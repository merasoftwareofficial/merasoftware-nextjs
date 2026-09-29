/** Shared editor validation; no auth or database imports so the form can use it. */
import { getSchema } from "@tiptap/core";
import { z } from "zod";
import { editorExtensions, isEmptyDoc } from "@/components/editor/extensions";

const schema = getSchema(editorExtensions);

export function validArticleDocument(value: unknown): boolean {
  try {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    if ((value as { type?: unknown }).type !== "doc") return false;
    const doc = schema.nodeFromJSON(value);
    doc.check();
    return !isEmptyDoc(doc.toJSON());
  } catch {
    return false;
  }
}

export const articleContentSchema = z.custom<unknown>(validArticleDocument, {
  message: "Write a valid article with readable text before saving or publishing.",
});

/** Editorial hints only: an article about SEO can legitimately discuss these labels. */
export function publishingBriefWarnings(content: unknown): string[] {
  const labels = new Set<string>();
  const walk = (value: unknown): string => {
    if (!value || typeof value !== "object") return "";
    const node = value as { type?: string; text?: string; content?: unknown[] };
    const text = node.type === "text" ? node.text ?? "" : (node.content ?? []).map(walk).join(" ");
    if (node.type === "paragraph" || node.type === "heading") {
      const match = text.trim().match(/^(?:\d+[.)]\s*)?(Featured Image|Alt Text|SEO Title|Visibility|Meta Description|Canonical URL|Comments Setting|Schedule\s*\/\s*Publish)\b/i);
      if (match) labels.add(match[1]);
    }
    return text;
  };
  walk(content);
  return [...labels];
}
