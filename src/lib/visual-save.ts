import { z } from "zod";
import type { MediaAsset, SectionVisualConfig } from "@/lib/repo/types";
import { normaliseVisual, visualSchema } from "@/lib/visual-validation";

/** Routes retain their own auth/atomic transactions; all visual writes share these rules. */
export function prepareVisualWrites(configs: Record<string, SectionVisualConfig>, allowed: Iterable<string>, assets: MediaAsset[]) {
  const slots = new Set(allowed), library = new Map(assets.map(asset => [asset._id, asset]));
  return Object.fromEntries(Object.entries(configs).map(([slot, input]) => {
    const fail = (message: string): never => { throw new z.ZodError([{ code: "custom", path: [slot], message }]); };
    if (!slots.has(slot)) fail("Visual is not part of this page section.");
    const config = visualSchema.parse(input);
    const asset = config.assetId ? library.get(config.assetId) : undefined;
    if (config.assetId && !asset) fail("Choose media from the library.");
    normaliseVisual(config, asset);
    // Kept solely for old source-frame configs; explicit frame controls support both kinds.
    if (slot === "home.hero" && !config.frame && config.frameShape === "source" && asset?.kind !== "video") config.frameShape = "slot";
    return [slot, config];
  }));
}
