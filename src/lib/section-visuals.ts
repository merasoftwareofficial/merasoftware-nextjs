import type { MediaAsset, SectionVisualConfig, Settings } from "@/lib/repo/types";
import { mediaRepo, settingsRepo } from "@/lib/repo";
import { defaultVisual, type VisualSlotId } from "@/lib/visual-slots";

export type VisualSlotData = { config: SectionVisualConfig; asset?: MediaAsset };
export type Visuals = Partial<Record<VisualSlotId, VisualSlotData>>;

export async function loadVisuals(ids: VisualSlotId[], existingSettings?: Settings): Promise<Visuals> {
  const settings = existingSettings ?? await settingsRepo.get();
  const configs = ids.map(id => {
    const legacy = id === "home.hero" && !settings.sectionVisuals?.[id] ? settings.homepageImages?.hero : undefined;
    const config: SectionVisualConfig = { ...defaultVisual(id), ...(legacy ? { mode: "both", assetId: legacy.assetId, alt: legacy.alt, focalX: legacy.focalX, focalY: legacy.focalY, fit: "cover" } as const : {}), ...settings.sectionVisuals?.[id] };
    return { id, config };
  });
  const assetIds = [...new Set(configs.map(item => item.config.assetId).filter((id): id is string => !!id))];
  const assets = new Map((await mediaRepo.findByIds(assetIds)).map(asset => [asset._id, asset]));
  return Object.fromEntries(configs.map(({ id, config }) => [id, { config, asset: config.assetId ? assets.get(config.assetId) : undefined }])) as Visuals;
}

