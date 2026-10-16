import { z } from "zod";
import { VISUAL_PATTERN_IDS } from "@/lib/visual-patterns";
import type { MediaAsset } from "@/lib/repo/types";

export const visualSchema = z.object({
  mode: z.enum(["pattern", "media", "both"]), assetId: z.string().optional(),
  pattern: z.enum(["default", ...VISUAL_PATTERN_IDS]), intensity: z.number().min(0).max(100),
  fit: z.enum(["contain", "cover"]), focalX: z.number().min(0).max(100), focalY: z.number().min(0).max(100), alt: z.string().trim().max(300),
  frameShape: z.enum(["slot", "square", "source"]).optional(),
  card: z.object({ enabled: z.boolean(), placement: z.enum(["overlay", "below"]), eyebrow: z.string().max(100), title: z.string().max(180), body: z.string().max(1200), indexText: z.string().max(40), background: z.string().regex(/^#[0-9a-fA-F]{6}$/), foreground: z.string().regex(/^#[0-9a-fA-F]{6}$/), accent: z.string().regex(/^#[0-9a-fA-F]{6}$/) }).strict().optional(),
}).strict();
export function normaliseVisual(config: z.infer<typeof visualSchema>, asset?: MediaAsset | null) {
  if (!config.assetId && config.mode !== "pattern") config.mode = "pattern";
  if (config.frameShape === "source" && (config.mode === "pattern" || !asset?.width || !asset.height)) config.frameShape = "slot";
  return config;
}
