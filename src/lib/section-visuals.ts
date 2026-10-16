import type { MediaAsset, SectionVisualConfig, Settings } from "@/lib/repo/types";
import { mediaRepo, settingsRepo } from "@/lib/repo";
import { slotInfo, type VisualSlotId, type VisualSlotInfo } from "@/lib/visual-slots";
import { externalVisualAsset, resolveVisualConfig, visualSlotsForPage } from "@/lib/visual-config";

export type VisualSlotData = { config: SectionVisualConfig; asset?: MediaAsset; slot?: VisualSlotInfo };
export type Visuals = Partial<Record<VisualSlotId, VisualSlotData>>;

export async function loadPageVisuals(page: string, existingSettings?: Settings): Promise<Visuals> {
  const settings = existingSettings ?? await settingsRepo.get();
  return loadVisuals(visualSlotsForPage(settings, page).map(slot => slot.id), settings);
}

export async function loadVisuals(ids: VisualSlotId[], existingSettings?: Settings): Promise<Visuals> {
  const settings = existingSettings ?? await settingsRepo.get();
  const configs = ids.map(id => ({ id, config: resolveVisualConfig(settings, id) }));
  const assetIds = [...new Set(configs.map(item => item.config.assetId).filter((id): id is string => !!id))];
  const assets = new Map((await mediaRepo.findByIds(assetIds)).map(asset => [asset._id, asset]));
  return Object.fromEntries(configs.map(({ id, config }) => [id, { config, slot: slotInfo(id), asset: config.assetId ? assets.get(config.assetId) : externalVisualAsset(config) }])) as Visuals;
}

