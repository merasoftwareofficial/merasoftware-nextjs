import type { SectionVisualConfig } from "@/lib/repo/types";

export const VISUAL_SLOTS = [
  { id: "home.hero", page: "Home", label: "Hero", pattern: "orbit", ratio: "4 / 3" },
  { id: "home.services", page: "Home", label: "Services", pattern: "grid", ratio: "4 / 3" },
  { id: "home.statement", page: "Home", label: "Point of view", pattern: "flow", ratio: "4 / 3" },
  { id: "home.contact", page: "Home", label: "Contact CTA", pattern: "dialogue", ratio: "4 / 3" },
  { id: "about.hero", page: "About", label: "Hero", pattern: "orbit", ratio: "4 / 3" },
  { id: "about.values", page: "About", label: "Values", pattern: "flow", ratio: "4 / 3" },
  { id: "services.hero", page: "Services", label: "Hero", pattern: "grid", ratio: "4 / 3" },
  { id: "services.website", page: "Services", label: "Website development card", pattern: "grid", ratio: "1 / 1" },
  { id: "services.seo", page: "Services", label: "SEO card", pattern: "orbit", ratio: "1 / 1" },
  { id: "services.marketing", page: "Services", label: "Performance marketing card", pattern: "growth", ratio: "1 / 1" },
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

export type VisualSlotId = (typeof VISUAL_SLOTS)[number]["id"];
export function slotInfo(id: string) { return VISUAL_SLOTS.find(slot => slot.id === id); }

export function defaultVisual(id: VisualSlotId): SectionVisualConfig {
  const slot = slotInfo(id)!;
  return { mode: "pattern", pattern: slot.pattern, intensity: 65, fit: "contain", focalX: 50, focalY: 50, alt: "" };
}


