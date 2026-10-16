import { z } from "zod";
import { VISUAL_PATTERN_IDS } from "@/lib/visual-patterns";
import type { MediaAsset } from "@/lib/repo/types";
import { contentHref } from "@/lib/page-content";

export const visualSchema = z.object({
  mode: z.enum(["pattern", "media", "both"]), assetId: z.string().optional(),
  externalMedia: z.object({ url: z.url().refine(value => new URL(value).protocol === "https:", "Use an HTTPS image URL."), width: z.number().finite().min(0).max(100000), height: z.number().finite().min(0).max(100000) }).strict().optional(),
  previewLink: z.object({ href: contentHref, caption: z.string().max(300) }).strict().optional(),
  legacyLayout: z.enum(["project", "services-preview"]).optional(),
  pattern: z.enum(["default", ...VISUAL_PATTERN_IDS]), intensity: z.number().min(0).max(100),
  fit: z.enum(["contain", "cover"]), focalX: z.number().min(0).max(100), focalY: z.number().min(0).max(100), alt: z.string().trim().max(300),
  frameShape: z.enum(["slot", "square", "source"]).optional(),
  frame: z.object({
    width: z.number().finite().min(40).max(2400), height: z.number().finite().min(40).max(2400),
    radius: z.number().finite().min(0).max(200),
    mobile: z.object({ width: z.number().finite().min(40).max(2400), height: z.number().finite().min(40).max(2400) }).strict().optional(),
  }).strict().optional(),
  crop: z.object({ zoom: z.number().finite().min(.1).max(5), x: z.number().finite().min(-200).max(200), y: z.number().finite().min(-200).max(200), free: z.boolean() }).strict().optional(),
  card: z.object({ enabled: z.boolean(), placement: z.enum(["overlay", "below"]), eyebrow: z.string().max(100), title: z.string().max(180), body: z.string().max(1200), indexText: z.string().max(40), background: z.string().regex(/^#[0-9a-fA-F]{6}$/), foreground: z.string().regex(/^#[0-9a-fA-F]{6}$/), accent: z.string().regex(/^#[0-9a-fA-F]{6}$/) }).strict().optional(),
}).strict();
export function normaliseVisual(config: z.infer<typeof visualSchema>, asset?: MediaAsset | null) {
  if (config.assetId) delete config.externalMedia;
  if (!config.assetId && !config.externalMedia && config.mode !== "pattern") config.mode = "pattern";
  if (config.frame) delete config.legacyLayout;
  if (config.frameShape === "source" && (config.mode === "pattern" || !asset?.width || !asset.height)) config.frameShape = "slot";
  return config;
}
