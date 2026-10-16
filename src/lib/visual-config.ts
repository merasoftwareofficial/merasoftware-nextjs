import type { MediaAsset, SectionVisualConfig, Settings } from "@/lib/repo/types";
import { defaultVisual, pageSlots, projectSlot, VISUAL_SLOTS, type VisualSlotId, type VisualSlotInfo } from "@/lib/visual-slots";
import { resolveAbout, resolveServices } from "@/lib/page-content";

export function mergeVisual(id: VisualSlotId, saved?: SectionVisualConfig): SectionVisualConfig {
  const defaults = defaultVisual(id);
  return { ...defaults, ...saved, card: { ...defaults.card!, ...saved?.card } };
}

const contentResolvers = { about: resolveAbout, services: resolveServices };
export function visualSlotsForPage(settings: Pick<Settings, "pageContent">, page: string): VisualSlotInfo[] {
  if (Object.hasOwn(contentResolvers, page)) return pageSlots(page, contentResolvers[page as keyof typeof contentResolvers](settings));
  return VISUAL_SLOTS.filter(slot => slot.pageId === page);
}

export function activeVisualSlots(settings: Pick<Settings, "pageContent">): VisualSlotInfo[] {
  return [...new Set(VISUAL_SLOTS.map(slot => slot.pageId))].flatMap(page => visualSlotsForPage(settings, page));
}

/** Only this boundary understands old fields. Saved canonical configs always win. */
export function resolveVisualConfig(settings: Pick<Settings, "pageContent" | "sectionVisuals" | "homepageImages">, id: VisualSlotId): SectionVisualConfig {
  if (settings.sectionVisuals?.[id]) return mergeVisual(id, settings.sectionVisuals[id]);
  const hero = id === "home.hero" ? settings.homepageImages?.hero : undefined;
  if (hero) return mergeVisual(id, { ...defaultVisual(id), ...hero, mode: "both", fit: "cover" });
  if (id.startsWith("about.project.")) {
    const project = resolveAbout(settings).work.projects.find(project => projectSlot(project.id) === id);
    if (project?.imageUrl) return mergeVisual(id, { ...defaultVisual(id), mode: "media", fit: "cover", focalY: 0, alt: project.alt, externalMedia: { url: project.imageUrl, width: 0, height: 0 }, legacyLayout: "project" });
  }
  if (id === "services.hero") {
    const hero = resolveServices(settings).hero;
    if (hero.previewImageUrl) return mergeVisual(id, { ...defaultVisual(id), mode: "media", fit: "cover", focalY: 0, alt: hero.previewAlt, externalMedia: { url: hero.previewImageUrl, width: 0, height: 0 }, previewLink: { href: hero.previewHref, caption: hero.previewLabel }, legacyLayout: "services-preview" });
  }
  return mergeVisual(id);
}

export function resolveVisualConfigs(settings: Pick<Settings, "pageContent" | "sectionVisuals" | "homepageImages">, ids: readonly VisualSlotId[]) {
  return Object.fromEntries(ids.map(id => [id, resolveVisualConfig(settings, id)]));
}

export function externalVisualAsset(config: SectionVisualConfig): MediaAsset | undefined {
  if (!config.externalMedia || config.assetId) return undefined;
  return { _id: "", assetId: "", publicId: "", assetFolder: "", ...config.externalMedia, kind: "image", format: "url", bytes: 0, altText: config.alt, createdAt: "", updatedAt: "" };
}

export function visualMigrationPlan(settings: Pick<Settings, "pageContent" | "sectionVisuals" | "homepageImages">) {
  const patches: Record<string, SectionVisualConfig> = {};
  const slots = activeVisualSlots(settings);
  for (const { id } of slots) {
    if (settings.sectionVisuals?.[id]) continue;
    const config = resolveVisualConfig(settings, id);
    if (config.assetId || config.externalMedia) patches[id] = config;
  }
  const active = new Set<string>(slots.map(slot => slot.id));
  return { patches, inactive: Object.keys(settings.sectionVisuals ?? {}).filter(id => !active.has(id)) };
}
