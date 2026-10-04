/**
 * Renders stored Tiptap JSON as HTML on the server.
 *
 * Uses @tiptap/static-renderer rather than the core generateHTML helper: that
 * one serialises through the DOM and throws "window is not defined" in a
 * server component. The static renderer works without a DOM, so public article
 * pages stay server-rendered and indexable.
 */

import { renderToHTMLString } from "@tiptap/static-renderer";
import type { BlogFaq, ContentsMode } from "@/lib/repo/types";
import { editorExtensions } from "./extensions";

/** "auto" lists an article's sections only when it is long enough to need it: this many sections… */
export const CONTENTS_MIN_SECTIONS = 3;
/** …and this many words (about a five-minute read at readingTime's 200 a minute). */
export const CONTENTS_MIN_WORDS = 1000;
const FAQ_HEADING = "Frequently asked questions";

function escapeHtml(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** A readable, unique anchor for each heading text. */
function anchorIds(texts: string[]) {
  const used = new Set<string>();
  return texts.map(text => {
    const base = text.toLowerCase().replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-").slice(0, 60) || "section";
    let id = base;
    for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
    used.add(id);
    return id;
  });
}

/**
 * The text of every heading at `level`, in document order — the order the
 * renderer writes each one.
 */
function headingTexts(content: unknown, level: number) {
  const text = (node: unknown): string => {
    if (!node || typeof node !== "object") return "";
    const item = node as { type?: string; text?: string; content?: unknown[] };
    return item.type === "text" ? item.text ?? "" : (item.content ?? []).map(text).join("");
  };
  const found: string[] = [];
  const walk = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    const item = node as { type?: string; attrs?: { level?: number }; content?: unknown[] };
    if (item.type === "heading" && item.attrs?.level === level) found.push(text(item));
    else (item.content ?? []).forEach(walk);
  };
  walk(content);
  return found;
}

/**
 * Whether an article lists its sections, and which heading level they are.
 * The sections are its largest headings: H2, or H3 when it has no H2 (some
 * writers build a whole article from H3s). "show" needs two entries to be a
 * list at all; "auto" waits for CONTENTS_MIN_SECTIONS and CONTENTS_MIN_WORDS.
 * The admin form and the rendered article both ask here, so they agree.
 */
export function contentsPlan(content: unknown, mode: ContentsMode = "auto", faqCount = 0) {
  const h2 = headingTexts(content, 2);
  const level = h2.length ? 2 : 3;
  const sections = h2.length ? h2 : headingTexts(content, 3);
  const words = docToText(content).trim().split(/\s+/).filter(Boolean).length;
  const entries = sections.length + (faqCount ? 1 : 0);
  const show = mode === "hide" ? false : mode === "show" ? entries >= 2 : sections.length >= CONTENTS_MIN_SECTIONS && words >= CONTENTS_MIN_WORDS;
  return { show, level, sections, words };
}

/**
 * `contents` (the post's ContentsMode) gives every section heading an anchor
 * and, when contentsPlan says so, lists them first. Without it (the review
 * queue) there is no list and no anchors.
 * `faqs` adds the post's questions after the article (FAQPage data is the
 * page's job, structured-data.ts). Both are top-level blocks of the body, so
 * the reading card pages them like any paragraph.
 */
export function RichContent({ content, className = "article-body", contents, faqs }: { content: unknown; className?: string; contents?: ContentsMode; faqs?: BlogFaq[] }) {
  if (!content || typeof content !== "object") return null;

  let html = "";
  try {
    html = renderToHTMLString({ content: content as never, extensions: editorExtensions });
  } catch {
    // A malformed stored document must not take the whole page down.
    return <div className={className}><p>This article could not be displayed.</p></div>;
  }

  const questions = faqs?.filter(faq => faq.question && faq.answer) ?? [];
  if (contents) {
    const plan = contentsPlan(content, contents, questions.length);
    const texts = plan.sections;
    const ids = anchorIds([...texts, ...(questions.length ? [FAQ_HEADING] : [])]);
    // The renderer writes each heading bare (<h2>, <h3>), in document order.
    let index = 0;
    html = html.replace(new RegExp(`<h${plan.level}>`, "g"), match => (index < texts.length ? `<h${plan.level} id="${ids[index++]}">` : match));
    const entries = ids.map((id, i) => [id, i < texts.length ? texts[i] : FAQ_HEADING] as const);
    if (plan.show) {
      html = `<nav class="article-toc" aria-label="Contents"><p>Contents</p><ol>${entries.map(([id, label]) => `<li><a href="#${id}">${escapeHtml(label)}</a></li>`).join("")}</ol></nav>${html}`;
    }
    if (questions.length) html += `<h2 id="${ids[ids.length - 1]}">${FAQ_HEADING}</h2>`;
  } else if (questions.length) {
    html += `<h2>${FAQ_HEADING}</h2>`;
  }
  for (const faq of questions) {
    const paragraphs = faq.answer.split(/\n{2,}/).map(part => `<p>${escapeHtml(part).replace(/\n/g, "<br>")}</p>`);
    html += `<h3>${escapeHtml(faq.question)}</h3>${paragraphs.join("")}`;
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
