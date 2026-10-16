import type { SectionVisualConfig } from "@/lib/repo/types";

export const VISUAL_SLOTS = [
  { id: "home.hero", page: "Home", label: "Hero", pattern: "orbit", ratio: "4 / 3" },
  { id: "home.services", page: "Home", label: "Services", pattern: "grid", ratio: "4 / 3" },
  { id: "home.statement", page: "Home", label: "Point of view", pattern: "flow", ratio: "4 / 3" },
  { id: "home.contact", page: "Home", label: "Contact CTA", pattern: "dialogue", ratio: "4 / 3" },
  { id: "about.hero", page: "About", label: "Hero", pattern: "orbit", ratio: "4 / 3" },
  { id: "about.values", page: "About", label: "Delivery approach", pattern: "flow", ratio: "4 / 3" },
  { id: "about.presence", page: "About", label: "Digital presence", pattern: "responsive", ratio: "4 / 3" },
  { id: "about.technology", page: "About", label: "Business technology", pattern: "network", ratio: "4 / 3" },
  { id: "about.communication", page: "About", label: "Brand communication", pattern: "campaign", ratio: "4 / 3" },
  { id: "about.jasmeet", page: "About", label: "Jasmeet Kaur", pattern: "grid", ratio: "1 / 1" },
  { id: "about.sahilpreet", page: "About", label: "Sahilpreet Kaur", pattern: "orbit", ratio: "1 / 1" },
  { id: "about.deep", page: "About", label: "Deep Kaur", pattern: "flow", ratio: "1 / 1" },
  { id: "services.hero", page: "Services", label: "Hero", pattern: "grid", ratio: "4 / 3" },
  { id: "services.website", page: "Services", label: "Website development card", pattern: "grid", ratio: "1 / 1" },
  { id: "services.seo", page: "Services", label: "SEO card", pattern: "orbit", ratio: "1 / 1" },
  { id: "services.marketing", page: "Services", label: "Performance marketing card", pattern: "growth", ratio: "1 / 1" },
  { id: "services.apps", page: "Services", label: "Mobile app development card", pattern: "responsive", ratio: "1 / 1" },
  { id: "services.software", page: "Services", label: "Cloud software & CRM card", pattern: "network", ratio: "1 / 1" },
  { id: "services.social", page: "Services", label: "Social media & content card", pattern: "dialogue", ratio: "1 / 1" },
  { id: "service.website.hero", page: "Website development", label: "Hero", pattern: "grid", ratio: "4 / 3" },
  { id: "service.website.included", page: "Website development", label: "What's included", pattern: "flow", ratio: "4 / 3" },
  { id: "service.seo.hero", page: "SEO", label: "Hero", pattern: "orbit", ratio: "4 / 3" },
  { id: "service.seo.included", page: "SEO", label: "What's included", pattern: "reading", ratio: "4 / 3" },
  { id: "service.marketing.hero", page: "Performance marketing", label: "Hero", pattern: "growth", ratio: "4 / 3" },
  { id: "service.marketing.included", page: "Performance marketing", label: "What's included", pattern: "growth", ratio: "4 / 3" },
  { id: "contact.hero", page: "Contact", label: "Hero", pattern: "dialogue", ratio: "4 / 3" },
  { id: "contact.faq", page: "Contact", label: "Common questions", pattern: "dialogue", ratio: "4 / 3" },
  { id: "blog.hero", page: "Blog", label: "Hero", pattern: "reading", ratio: "4 / 3" },
  { id: "community.hero", page: "Community", label: "Hero", pattern: "dialogue", ratio: "4 / 3" },
  { id: "discussions.hero", page: "Discussions", label: "Hero", pattern: "dialogue", ratio: "4 / 3" },
  { id: "subscribe.hero", page: "Newsletter", label: "Hero", pattern: "mail", ratio: "4 / 3" },
] as const;

export type VisualSlotId = (typeof VISUAL_SLOTS)[number]["id"] | `about.person.${string}` | `about.project.${string}` | `services.item.${string}`;
export type VisualSlotInfo = { id: VisualSlotId; page: string; label: string; pattern: SectionVisualConfig["pattern"]; ratio: string };
export function slotInfo(id: string): VisualSlotInfo | undefined {
  const fixed = VISUAL_SLOTS.find(slot => slot.id === id);
  if (fixed) return fixed;
  const match = /^(about\.(person|project)|services\.item)\.([a-z0-9-]{1,80})$/.exec(id);
  if (!match) return undefined;
  return { id: id as VisualSlotId, page: id.startsWith("about.") ? "About" : "Services", label: match[3], pattern: "grid", ratio: match[2] === "person" ? "1 / 1" : "4 / 3" };
}

export function defaultVisual(id: VisualSlotId): SectionVisualConfig {
  const slot = slotInfo(id)!;
  return { mode: "pattern", pattern: slot.pattern, intensity: 65, fit: "contain", focalX: 50, focalY: 50, alt: "", ...(id === "home.hero" ? { frameShape: "slot" as const } : {}), card: { enabled: false, placement: "overlay", eyebrow: "", title: "", body: "", indexText: "", background: "#00243d", foreground: "#ffffff", accent: "#66e4ee" } };
}


