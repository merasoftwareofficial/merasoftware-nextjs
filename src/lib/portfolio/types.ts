export type PortfolioStatus = "draft" | "published" | "hidden";
export type PortfolioReaction = "like" | "impressive";
export interface PortfolioSource {
  id: string;
  revision: number;
  available: boolean;
  type: "project" | "service";
  customerId: string;
  customerName: string;
  name: string;
  category: string;
  state: string;
  linkedProjectId: string;
  url: string;
  captureAllowed: boolean;
  progress?: number | null;
  orderedAt?: string;
}
export interface PortfolioImage {
  assetId: string;
  url: string;
  alt: string;
  focalX: number;
  focalY: number;
}
export interface PortfolioCapture {
  status: "idle" | "queued" | "running" | "ready" | "failed";
  url: string;
  token: string;
  attempts: number;
  nextAttemptAt: number;
  leaseUntil: number;
  error: string;
  completedAt: string;
  candidates: PortfolioImage[];
}
export interface PortfolioEntry {
  _id: string;
  source: PortfolioSource;
  title: string;
  slug: string;
  brand: string;
  category: string;
  summary: string;
  problem: string;
  solution: string;
  result: string;
  services: string[];
  liveUrl: string;
  showLiveUrl?: boolean;
  cover: PortfolioImage | null;
  gallery: PortfolioImage[];
  status: PortfolioStatus;
  featured: boolean;
  sortOrder: number;
  capture: PortfolioCapture;
  createdAt: string;
  updatedAt: string;
  syncedAt: string;
}
export interface PublicPortfolioEntry {
  _id: string;
  title: string;
  slug: string;
  brand: string;
  category: string;
  summary: string;
  problem: string;
  solution: string;
  result: string;
  services: string[];
  liveUrl: string;
  cover: PortfolioImage | null;
  gallery: PortfolioImage[];
  featured: boolean;
  type: "project" | "service";
  updatedAt: string;
}
/** "https://site.com" and "https://site.com/" are one URL. */
export function sameUrl(a: string, b: string) {
  const normal = (value: string) => { try { return value.trim() ? new URL(value.trim()).toString() : ""; } catch { return value.trim(); } };
  return normal(a) === normal(b);
}
// Entries saved before the toggle existed keep their old behaviour: a link only if one was entered.
export const showsLiveUrl = (entry: PortfolioEntry) => entry.showLiveUrl ?? Boolean(entry.liveUrl);
// The portal URL is the source of truth; liveUrl is the website's earlier copy, kept as a
// fallback until older entries are migrated to the portal.
export const projectUrl = (entry: PortfolioEntry) => entry.source.url || entry.liveUrl;
export const publicPortfolio = (entry: PortfolioEntry): PublicPortfolioEntry => ({
  _id: entry._id, title: entry.title, slug: entry.slug, brand: entry.brand,
  category: entry.category, summary: entry.summary, problem: entry.problem,
  solution: entry.solution, result: entry.result, services: entry.services,
  liveUrl: showsLiveUrl(entry) ? projectUrl(entry) : "", cover: entry.cover, gallery: entry.gallery,
  featured: entry.featured, type: entry.source.type, updatedAt: entry.updatedAt,
});
export const isPublicPortfolio = (entry: PortfolioEntry) =>
  entry.status === "published" && entry.source.available && !entry.source.linkedProjectId;
