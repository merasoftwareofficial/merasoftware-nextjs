import type { MediaAsset, SectionVisualConfig } from "@/lib/repo/types";
import { slotInfo } from "@/lib/visual-slots";

export type FrameSize = { width: number; height: number };
export type VisualFrame = NonNullable<SectionVisualConfig["frame"]>;
export type VisualCrop = NonNullable<SectionVisualConfig["crop"]>;
export const DEFAULT_CROP: VisualCrop = { zoom: 1, x: 0, y: 0, free: false };

/** Preferred CSS-pixel dimensions; the renderer scales them down to the column. */
export function recommendedFrame(id: string): VisualFrame {
  const slot = slotInfo(id);
  if (!slot) throw new Error(`Unknown visual slot: ${id}`);
  return { ...slot.recommendedFrame };
}

/** Legacy configs are read without silently rewriting their saved composition. */
export function resolveFrame(config: SectionVisualConfig, id: string, asset?: MediaAsset): VisualFrame {
  if (config.frame) return config.frame;
  const frame = { ...slotInfo(id)!.defaultFrame };
  if (config.frameShape === "square") return { ...frame, height: frame.width };
  if (config.frameShape === "source" && asset?.width && asset.height) {
    return { ...frame, height: Math.max(40, Math.min(2400, Math.round(frame.width * asset.height / asset.width))) };
  }
  return frame;
}

export function mediaGeometry(frame: FrameSize, asset: FrameSize, fit: SectionVisualConfig["fit"], crop: VisualCrop) {
  const source = asset.width > 0 && asset.height > 0 ? asset : frame;
  const fitScale = (fit === "cover" ? Math.max : Math.min)(frame.width / source.width, frame.height / source.height);
  const zoom = !crop.free && fit === "cover" ? Math.max(1, crop.zoom) : crop.zoom;
  const width = source.width * fitScale * zoom;
  const height = source.height * fitScale * zoom;
  const limitX = Math.abs(width - frame.width) / (2 * frame.width) * 100;
  const limitY = Math.abs(height - frame.height) / (2 * frame.height) * 100;
  const clamp = (value: number, limit: number) => Math.max(-limit, Math.min(limit, value));
  return { width, height, x: crop.free ? crop.x : clamp(crop.x, limitX), y: crop.free ? crop.y : clamp(crop.y, limitY), limitX, limitY };
}

/** Convert object-position into frame-relative movement when editing older media. */
export function resolveCrop(config: SectionVisualConfig, frame: FrameSize, asset?: MediaAsset): VisualCrop {
  if (config.crop) return config.crop;
  const inset = config.mode === "both" && config.frameShape !== "source";
  const box = { width: frame.width * (inset ? .72 : 1), height: frame.height * (inset ? .74 : 1) };
  const geometry = mediaGeometry(frame, asset ?? frame, config.fit, DEFAULT_CROP);
  const fitted = mediaGeometry(box, asset ?? frame, config.fit, DEFAULT_CROP);
  const zoom = fitted.width / geometry.width;
  const clampPosition = (value: number) => Math.max(-200, Math.min(200, value));
  return {
    zoom, free: inset,
    x: clampPosition((box.width - fitted.width) / frame.width * (config.focalX - 50)),
    y: clampPosition((box.height - fitted.height) / frame.height * (config.focalY - 50)),
  };
}
