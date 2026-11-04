import type { PortfolioEntry } from "./types";

export interface PortfolioClientGroup {
  customerId: string;
  customerName: string;
  rows: PortfolioEntry[];
  projects: number;
  services: number;
  published: number;
}

// Order date from the portal; entries synced before it existed fall back to import time.
const orderedTime = (entry: PortfolioEntry) => {
  const time = new Date(entry.source.orderedAt || entry.createdAt).getTime();
  return Number.isFinite(time) ? time : 0;
};
const newestFirst = (a: PortfolioEntry, b: PortfolioEntry) => orderedTime(b) - orderedTime(a);

// Admin list: one group per client, the client with the newest order first. Inside a
// group projects run newest first and each linked service follows its own project.
export function groupPortfolioByClient(entries: PortfolioEntry[]): PortfolioClientGroup[] {
  const byClient = new Map<string, PortfolioEntry[]>();
  for (const entry of entries) {
    const key = entry.source.customerId || "unknown";
    byClient.set(key, [...(byClient.get(key) ?? []), entry]);
  }
  const groups = [...byClient].map(([customerId, items]) => {
    const ids = new Set(items.map(item => item._id));
    const linked = (item: PortfolioEntry) => Boolean(item.source.linkedProjectId) && ids.has(item.source.linkedProjectId);
    const rows: PortfolioEntry[] = [];
    for (const item of items.filter(row => !linked(row)).sort(newestFirst)) {
      rows.push(item, ...items.filter(row => linked(row) && row.source.linkedProjectId === item._id).sort(newestFirst));
    }
    return {
      customerId, rows,
      customerName: items.find(item => item.source.customerName)?.source.customerName || "Client",
      projects: items.filter(item => item.source.type === "project").length,
      services: items.filter(item => item.source.type === "service").length,
      published: items.filter(item => item.status === "published").length,
      newest: Math.max(...items.map(orderedTime)),
    };
  });
  return groups.sort((a, b) => b.newest - a.newest).map(({ newest: ignored, ...group }) => { void ignored; return group; });
}
