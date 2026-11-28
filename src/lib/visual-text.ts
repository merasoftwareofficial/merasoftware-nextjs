/**
 * SSOT Visual Text Formatting utilities (server + client safe, zero DOM dependency).
 *
 * - Website fields (e.g. Package description): store clean sanitized HTML
 *   (<p>, <br>, <strong>, <em>, <u>, <ul>, <ol>, <li>) so Enter paragraph gaps
 *   and inline formatting render identically in editor, cards, pages & previews.
 * - Automated Message fields (WhatsApp + Email): editor displays true WYSIWYG
 *   visual formatting while serializing to clean multi-channel markup
 *   (**bold**, _italic_, bullet/numbered lists, real \n\n paragraph gaps).
 * - Legacy plain text and *bold* / _italic_ strings load seamlessly without raw stars.
 */

const ALLOWED_TAGS = new Set(["p", "br", "strong", "b", "em", "i", "u", "ul", "ol", "li"]);
const HTML_TAG_RE = /<\/?(?:p|br|strong|b|em|i|u|ul|ol|li)\b[^>]*>/i;

export function escapeHtml(value: string): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

/** True when a stored string already contains supported visual formatting HTML. */
export function isVisualHtml(value: string | null | undefined): boolean {
  return typeof value === "string" && HTML_TAG_RE.test(value);
}

/**
 * Strict allowlist sanitizer: keeps only safe formatting tags with zero attributes.
 * Normalizes <b> -> <strong> and <i> -> <em>.
 */
export function sanitizeVisualHtml(raw: string | null | undefined): string {
  if (!raw || typeof raw !== "string") return "";
  const cleaned = raw
    .replace(/<(script|style|iframe|object|embed)[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<\/?([a-z0-9]+)(?:\s[^>]*)?>/gi, (match, tagName: string) => {
      const lower = tagName.toLowerCase();
      if (!ALLOWED_TAGS.has(lower)) return "";
      const isClose = match.startsWith("</");
      if (lower === "br") return isClose ? "" : "<br>";
      const normalized = lower === "b" ? "strong" : lower === "i" ? "em" : lower;
      return isClose ? `</${normalized}>` : `<${normalized}>`;
    })
    .trim();
  return cleaned;
}

function inlineLegacyToHtml(line: string): string {
  const escaped = escapeHtml(line);
  // Convert **bold**, *bold*, and _italic_ into HTML without touching mid-word underscores
  return escaped
    .replace(/\*\*([^*\n]+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^\w*])\*([^*\n]+?)\*(?=$|[^\w*])/g, "$1<strong>$2</strong>")
    .replace(/(^|[^\w])_([^_\n]+?)_(?=$|[^\w])/g, "$1<em>$2</em>");
}

/**
 * Converts plain text, legacy bold/italic markup, or existing HTML
 * into clean sanitized visual HTML for both Tiptap editing and website rendering.
 */
export function textToVisualHtml(value: string | null | undefined): string {
  if (!value || typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (isVisualHtml(trimmed)) return sanitizeVisualHtml(trimmed);

  const blocks = trimmed.split(/\r?\n\s*\r?\n/);
  const htmlBlocks = blocks.map(block => {
    const lines = block.split(/\r?\n/);
    const nonEmpty = lines.filter(l => l.trim().length > 0);
    if (!nonEmpty.length) return "<p><br></p>";

    if (nonEmpty.every(l => /^\s*(?:•|-)\s+/.test(l))) {
      const items = nonEmpty
        .map(l => `<li><p>${inlineLegacyToHtml(l.replace(/^\s*(?:•|-)\s+/, ""))}</p></li>`)
        .join("");
      return `<ul>${items}</ul>`;
    }

    if (nonEmpty.every(l => /^\s*\d+\.\s+/.test(l))) {
      const items = nonEmpty
        .map(l => `<li><p>${inlineLegacyToHtml(l.replace(/^\s*\d+\.\s+/, ""))}</p></li>`)
        .join("");
      return `<ol>${items}</ol>`;
    }

    return `<p>${lines.map(inlineLegacyToHtml).join("<br>")}</p>`;
  });

  return htmlBlocks.join("");
}

/**
 * Strips all HTML tags and legacy markup symbols to clean plain text
 * (for SEO meta descriptions, validation checks, and character counts).
 */
export function visualHtmlToPlainText(value: string | null | undefined): string {
  if (!value || typeof value !== "string") return "";
  if (!isVisualHtml(value)) {
    return value
      .replace(/\*\*([^*\n]+?)\*\*/g, "$1")
      .replace(/(^|[^\w*])\*([^*\n]+?)\*(?=$|[^\w*])/g, "$1$2")
      .replace(/(^|[^\w])_([^_\n]+?)_(?=$|[^\w])/g, "$1$2")
      .replace(/\s+/g, " ")
      .trim();
  }
  const text = value
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/(p|li|ul|ol)>/gi, " ")
    .replace(/<[^>]+>/g, "");
  return decodeHtmlEntities(text).replace(/\s+/g, " ").trim();
}

/**
 * Converts Tiptap HTML into clean multi-channel message markup
 * compatible with Email (emailMarkup.js) and WhatsApp delivery:
 * - <strong> -> **text**
 * - <em> -> _text_
 * - <ul><li> -> • item
 * - <ol><li> -> 1. item
 * - Paragraph gaps -> \n\n (real line breaks preserved)
 */
export function visualHtmlToMessageMarkup(html: string | null | undefined): string {
  if (!html || typeof html !== "string") return "";
  const safe = sanitizeVisualHtml(html);
  if (!safe) return "";

  const convertInline = (fragment: string): string => {
    const withMarks = fragment
      .replace(/<strong>([\s\S]*?)<\/strong>/gi, (_, inner: string) => {
        const clean = convertInline(inner);
        return clean.trim() ? `**${clean}**` : clean;
      })
      .replace(/<em>([\s\S]*?)<\/em>/gi, (_, inner: string) => {
        const clean = convertInline(inner);
        return clean.trim() ? `_${clean}_` : clean;
      })
      .replace(/<u>([\s\S]*?)<\/u>/gi, (_, inner: string) => convertInline(inner))
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "");
    return decodeHtmlEntities(withMarks);
  };

  const parts: string[] = [];
  const blockRe = /<(p|ul|ol)>([\s\S]*?)<\/\1>/gi;
  let match: RegExpExecArray | null;
  let matchedAny = false;

  while ((match = blockRe.exec(safe)) !== null) {
    matchedAny = true;
    const tag = match[1].toLowerCase();
    const inner = match[2];

    if (tag === "p") {
      const line = convertInline(inner).replace(/\r\n/g, "\n");
      parts.push(line);
    } else if (tag === "ul") {
      const items: string[] = [];
      const liRe = /<li>([\s\S]*?)<\/li>/gi;
      let li: RegExpExecArray | null;
      while ((li = liRe.exec(inner)) !== null) {
        const text = convertInline(li[1].replace(/<\/?p>/gi, "")).trim();
        if (text) items.push(`• ${text}`);
      }
      if (items.length) parts.push(items.join("\n"));
    } else if (tag === "ol") {
      const items: string[] = [];
      const liRe = /<li>([\s\S]*?)<\/li>/gi;
      let li: RegExpExecArray | null;
      let idx = 1;
      while ((li = liRe.exec(inner)) !== null) {
        const text = convertInline(li[1].replace(/<\/?p>/gi, "")).trim();
        if (text) items.push(`${idx++}. ${text}`);
      }
      if (items.length) parts.push(items.join("\n"));
    }
  }

  if (!matchedAny) return convertInline(safe).trim();

  // Preserve intentional blank paragraphs as double newlines, trim leading/trailing empties
  while (parts.length && parts[0].trim() === "") parts.shift();
  while (parts.length && parts[parts.length - 1].trim() === "") parts.pop();
  return parts.join("\n\n");
}

/**
 * Safely merges a legacy non-empty `supportingLine` onto a new line at the end of `description`
 * so removing the `supportingLine` UI field never loses existing written content.
 */
export function mergeSupportingLineIntoDescription(description: string, supportingLine?: string): string {
  const extra = (supportingLine ?? "").trim();
  if (!extra) return description;
  const plainDesc = visualHtmlToPlainText(description).toLowerCase();
  if (plainDesc.includes(extra.toLowerCase())) return description;
  if (!description.trim()) return `<p>${escapeHtml(extra)}</p>`;
  const baseHtml = textToVisualHtml(description);
  return `${baseHtml}<p>${escapeHtml(extra)}</p>`;
}
