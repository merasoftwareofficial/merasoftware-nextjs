import type { SectionVisualConfig } from "@/lib/repo/types";

type Frame = NonNullable<SectionVisualConfig["frame"]>;
const frames = {
  feature: { width: 480, height: 360, radius: 12 },
  hero: { width: 430, height: 323, radius: 0 },
  aboutHero: { width: 480, height: 480, radius: 12 },
  person: { width: 280, height: 350, radius: 12 },
  servicesHero: { width: 450, height: 225, radius: 10 },
  service: { width: 240, height: 240, radius: 8 },
  project: { width: 560, height: 315, radius: 8 },
} satisfies Record<string, Frame>;

// Page, section, stable ID, pattern and frame defaults have one owner.
const definitions = [
  ["home", "hero", "home.hero", "Home", "Hero", "orbit", "hero"],
  ["home", "services", "home.services", "Home", "Services", "grid", "feature"],
  ["home", "pointOfView", "home.statement", "Home", "Point of view", "flow", "feature"],
  ["home", "contact", "home.contact", "Home", "Contact CTA", "dialogue", "feature"],
  ["about", "hero", "about.hero", "About", "Hero", "orbit", "aboutHero"],
  ["about", "partnership", "about.values", "About", "Delivery approach", "flow", "feature"],
  ["about", "approach", "about.presence", "About", "Digital presence", "responsive", "feature"],
  ["about", "leadership", "about.jasmeet", "About", "Jasmeet Kaur", "grid", "person"],
  ["about", "leadership", "about.sahilpreet", "About", "Sahilpreet Kaur", "orbit", "person"],
  ["about", "leadership", "about.deep", "About", "Deep Kaur", "flow", "person"],
  ["services", "hero", "services.hero", "Services", "Hero", "grid", "servicesHero"],
  ["services", "catalogue", "services.website", "Services", "Website development card", "grid", "service"],
  ["services", "catalogue", "services.seo", "Services", "SEO card", "orbit", "service"],
  ["services", "catalogue", "services.marketing", "Services", "Performance marketing card", "growth", "service"],
  ["services", "catalogue", "services.apps", "Services", "Mobile app development card", "responsive", "service"],
  ["services", "catalogue", "services.software", "Services", "Cloud software & CRM card", "network", "service"],
  ["services", "catalogue", "services.social", "Services", "Social media & content card", "dialogue", "service"],
  ["website-development", "hero", "service.website.hero", "Website development", "Hero", "grid", "feature"],
  ["website-development", "included", "service.website.included", "Website development", "What's included", "flow", "feature"],
  ["seo", "hero", "service.seo.hero", "SEO", "Hero", "orbit", "feature"],
  ["seo", "included", "service.seo.included", "SEO", "What's included", "reading", "feature"],
  ["performance-marketing", "hero", "service.marketing.hero", "Performance marketing", "Hero", "growth", "feature"],
  ["performance-marketing", "included", "service.marketing.included", "Performance marketing", "What's included", "growth", "feature"],
  ["contact", "hero", "contact.hero", "Contact", "Hero", "dialogue", "feature"],
  ["contact", "faq", "contact.faq", "Contact", "Common questions", "dialogue", "feature"],
  ["blog", "hero", "blog.hero", "Blog", "Hero", "reading", "feature"],
  ["community", "hero", "community.hero", "Community", "Hero", "dialogue", "feature"],
  ["discussions", "hero", "discussions.hero", "Discussions", "Hero", "dialogue", "feature"],
  ["newsletter", "hero", "subscribe.hero", "Newsletter", "Hero", "mail", "feature"],
] as const;

export type VisualSlotId = (typeof definitions)[number][2] | `about.person.${string}` | `about.project.${string}` | `services.item.${string}`;
export type VisualSlotInfo = {
  id: VisualSlotId; pageId: string; section: string; page: string; label: string;
  pattern: SectionVisualConfig["pattern"]; ratio: string; defaultFrame: Frame; recommendedFrame: Frame;
  legacyRatio: string; legacyMobileRatio: string; patternPadding: number;
};
export const VISUAL_SLOTS: VisualSlotInfo[] = definitions.map(([pageId, section, id, page, label, pattern, profile]) => ({
  id, pageId, section, page, label, pattern, ratio: `${frames[profile].width} / ${frames[profile].height}`,
  defaultFrame: frames[profile], recommendedFrame: frames[profile],
  legacyRatio: id === "home.hero" ? "524 / 394" : id === "about.hero" ? "1 / 1" : id === "services.hero" ? "2 / 1" : "4 / 3",
  legacyMobileRatio: id === "home.hero" ? "524 / 394" : id === "services.hero" ? "2 / 1" : "4 / 3",
  patternPadding: pageId === "about" && profile !== "person" ? profile === "aboutHero" ? 36 : 24 : 0,
}));

export const memberSlot = (id: string): VisualSlotId => VISUAL_SLOTS.some(slot => slot.section === "leadership" && slot.id === `about.${id}`) ? `about.${id}` as VisualSlotId : `about.person.${id}`;
export const serviceSlot = (id: string): VisualSlotId => VISUAL_SLOTS.some(slot => slot.section === "catalogue" && slot.id === `services.${id}`) ? `services.${id}` as VisualSlotId : `services.item.${id}`;
export const projectSlot = (id: string): VisualSlotId => `about.project.${id}`;

export function slotInfo(id: string): VisualSlotInfo | undefined {
  const fixed = VISUAL_SLOTS.find(slot => slot.id === id);
  if (fixed) return fixed;
  const match = /^(about\.(person|project)|services\.item)\.([a-z0-9-]{1,80})$/.exec(id);
  if (!match) return undefined;
  const profile = match[2] === "person" ? "person" : match[2] === "project" ? "project" : "service";
  const frame = frames[profile];
  return { id: id as VisualSlotId, pageId: id.startsWith("about.") ? "about" : "services", section: profile === "person" ? "leadership" : profile === "project" ? "work" : "catalogue", page: id.startsWith("about.") ? "About" : "Services", label: match[3], pattern: "grid", ratio: `${frame.width} / ${frame.height}`, defaultFrame: frame, recommendedFrame: frame, legacyRatio: "4 / 3", legacyMobileRatio: "4 / 3", patternPadding: 0 };
}

type Entry = { id: string; name?: string; title?: string; brand?: string };
const dynamicConnections = [
  { pageId: "about", section: "leadership", entries: (content: unknown): Entry[] => (content as { members?: Entry[] })?.members ?? [], slot: memberSlot },
  { pageId: "about", section: "work", entries: (content: unknown): Entry[] => (content as { projects?: Entry[] })?.projects ?? [], slot: projectSlot },
  { pageId: "services", section: "catalogue", entries: (content: unknown): Entry[] => (content as { groups?: { items: Entry[] }[] })?.groups?.flatMap(group => group.items) ?? [], slot: serviceSlot },
];
export function sectionSlots(page: string, section: string, content?: unknown): VisualSlotInfo[] {
  const connection = dynamicConnections.find(item => item.pageId === page && item.section === section);
  if (connection) return connection.entries(content).flatMap(entry => { const slot = slotInfo(connection.slot(entry.id)); return slot ? [{ ...slot, label: entry.name || entry.title || entry.brand || slot.label }] : []; });
  return VISUAL_SLOTS.filter(slot => slot.pageId === page && slot.section === section);
}

export function pageSlots(page: string, content: Record<string, unknown>): VisualSlotInfo[] {
  const dynamic = dynamicConnections.filter(item => item.pageId === page);
  return [...VISUAL_SLOTS.filter(slot => slot.pageId === page && !dynamic.some(item => item.section === slot.section)), ...dynamic.flatMap(item => sectionSlots(page, item.section, content[item.section]))];
}

export function defaultVisual(id: VisualSlotId): SectionVisualConfig {
  const slot = slotInfo(id);
  if (!slot) throw new Error(`Unknown visual slot: ${id}`);
  const person = slot.section === "leadership";
  return { mode: "pattern", pattern: slot.pattern, intensity: 65, fit: person ? "cover" : "contain", focalX: 50, focalY: 50, alt: "", ...(person ? { frame: { ...slot.defaultFrame } } : {}), ...(id === "home.hero" ? { frameShape: "slot" as const } : {}), card: { enabled: false, placement: "overlay", eyebrow: "", title: "", body: "", indexText: "", background: "#00243d", foreground: "#ffffff", accent: "#66e4ee" } };
}
