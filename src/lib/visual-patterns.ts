/** Selectable business illustrations. Keep legacy "default" as a flow alias, not a separate choice. */
export const VISUAL_PATTERN_IDS = [
  "orbit", "grid", "flow", "growth", "dialogue", "reading", "mail",
  "strategy", "roadmap", "collaboration", "pillars", "responsive", "search",
  "audit", "campaign", "conversion", "analytics", "checklist", "network", "spotlight",
] as const;

export type VisualPatternId = (typeof VISUAL_PATTERN_IDS)[number];

export const VISUAL_PATTERN_DETAILS: Record<VisualPatternId, { label: string; description: string }> = {
  orbit: { label: "Orbit", description: "Focus and connected opportunities." },
  grid: { label: "Grid", description: "A structured digital layout." },
  flow: { label: "Flow", description: "Ideas and actions working together." },
  growth: { label: "Growth", description: "Progress across measurable stages." },
  dialogue: { label: "Dialogue", description: "A conversation with customers." },
  reading: { label: "Reading", description: "Articles, knowledge and learning." },
  mail: { label: "Mail", description: "Messages and updates." },
  strategy: { label: "Strategy", description: "A compass pointing toward a clear goal." },
  roadmap: { label: "Roadmap", description: "Milestones along a business journey." },
  collaboration: { label: "Collaboration", description: "People contributing to shared work." },
  pillars: { label: "Pillars", description: "Three foundations supporting a result." },
  responsive: { label: "Responsive screens", description: "One website across desktop and mobile." },
  search: { label: "Search visibility", description: "A business result being found in search." },
  audit: { label: "Site audit", description: "Technical checks and improvements." },
  campaign: { label: "Campaign", description: "A message reaching its audience." },
  conversion: { label: "Conversion path", description: "Visitors moving toward an action." },
  analytics: { label: "Analytics", description: "Performance data revealing direction." },
  checklist: { label: "Checklist", description: "Clear priorities and completed work." },
  network: { label: "Network", description: "Connected channels and relationships." },
  spotlight: { label: "Spotlight", description: "A product or idea taking center stage." },
};
