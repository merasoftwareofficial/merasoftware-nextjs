/**
 * How SEO checks (lib/seo-rules.ts) are shown in the panel: a one-line hint
 * under a field, and a checklist for a whole post.
 *
 * No hooks, so server pages (review queue, /admin/seo) and the client blog
 * form render the same markup.
 */

import Link from "@/components/link";
import { SEO_LIMITS, type SeoCheck, type SeoField } from "@/lib/seo-rules";
import { SITE_URL } from "@/lib/structured-data";

const MARK = { ok: "✓", warning: "!", error: "✕" } as const;

/** The checks for one field, as lines under it. Nothing when there are none. */
export function SeoHint({ checks, field }: { checks: SeoCheck[]; field: SeoField }) {
  const own = checks.filter(check => check.field === field);
  if (!own.length) return null;
  return (
    <>
      {own.map(check => (
        <small key={check.id} className={`seo-hint seo-${check.level}`}>
          <b aria-hidden="true">{MARK[check.level]}</b> {check.label}: {check.message}
        </small>
      ))}
    </>
  );
}

/**
 * A list of checks. Each issue gets a fix control: `onFix` in the form (jumps
 * to the field), or `fixHref` elsewhere (opens the editor at the field).
 */
export function SeoChecklist({
  checks,
  onFix,
  fixHref,
}: {
  checks: SeoCheck[];
  onFix?: (field: SeoField) => void;
  fixHref?: (check: SeoCheck) => string;
}) {
  return (
    <ul className="seo-checklist">
      {checks.map(check => (
        <li key={check.id} className={`seo-${check.level}`}>
          <b aria-hidden="true">{MARK[check.level]}</b>
          <span>
            <strong>{check.label}</strong> — {check.message}
          </span>
          {check.level === "ok" ? null : onFix ? (
            <button type="button" className="admin-action" onClick={() => onFix(check.field)}>
              Fix →
            </button>
          ) : fixHref ? (
            <Link className="admin-action" href={fixHref(check)}>
              Fix →
            </Link>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/** Roughly how a Google result shows a page; the cut-off points follow SEO_LIMITS. */
export function SerpPreview({ path, title, description }: { path: string; title: string; description: string }) {
  const cut = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);
  const crumbs = path.split("/").filter(Boolean);
  return (
    <div className="serp-preview" aria-label="Google result preview">
      <span className="serp-label">Google preview</span>
      <span className="serp-url">{[SITE_URL.replace(/^https?:\/\//, ""), ...crumbs].join(" › ")}</span>
      <span className="serp-title">{cut(title, SEO_LIMITS.titleMax)}</span>
      <span className="serp-description">{description ? cut(description, SEO_LIMITS.descriptionMax) : "Google will pick text from the page."}</span>
    </div>
  );
}

/**
 * Scrolls to a field (by element id) and puts the cursor in it, with a short
 * highlight. The article editor and the image picker are wrappers, so the
 * first thing inside them that takes focus is used.
 */
export function focusSeoField(id: string) {
  const target = document.getElementById(id);
  if (!target) return;
  target.scrollIntoView({ behavior: "smooth", block: "center" });
  const focusable = target.matches("input, textarea, select, button")
    ? target
    : target.querySelector<HTMLElement>("[contenteditable='true'], input, textarea, select, button");
  focusable?.focus({ preventScroll: true });
  target.classList.add("seo-target");
  window.setTimeout(() => target.classList.remove("seo-target"), 2400);
}
