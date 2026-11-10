/**
 * Grouping, short names and status for the Page SEO admin (/admin/page-seo).
 * Pure functions on the page key and label, so they can be tested without the server.
 */

export const PAGE_GROUPS = ["Main", "Services", "Packages", "Plans", "Business"] as const;
export type PageGroup = (typeof PAGE_GROUPS)[number];

/** Which tab a page belongs to. Keys come from lib/page-seo.ts (fixed pages and dynamic pages). */
export function pageGroup(key: string): PageGroup {
  if (key === "organization") return "Business";
  if (key.startsWith("service-")) return "Services";
  if (key.startsWith("packages-") || key.startsWith("package-")) return "Packages";
  if (key === "plans" || key.startsWith("plans-")) return "Plans";
  return "Main";
}

/**
 * The page's own name, without the group word that the tab already shows
 * ("Service: ", "Packages: ", "Package: ", "Plans: "). A customize page says so at the end.
 */
export function pageName(label: string): string {
  const customize = / · customize$/.test(label);
  const base = label.replace(/ · customize$/, "").replace(/^(Service|Packages|Package|Plans): /, "");
  return customize ? `${base} (customize page)` : base;
}

export type PageStatus = "todo" | "custom" | "builtin";

/** "todo" when the checklist has open issues, "custom" when an editor saved text, else "builtin". */
export function pageStatus(issues: number, hasSavedText: boolean): PageStatus {
  if (issues > 0) return "todo";
  return hasSavedText ? "custom" : "builtin";
}

export const STATUS_LABEL: Record<PageStatus, string> = {
  todo: "Needs attention",
  custom: "Custom text",
  builtin: "Built-in text",
};
