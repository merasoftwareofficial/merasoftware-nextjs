import "server-only";

import { blogRepo, settingsRepo } from "@/lib/repo";
import type { Blog, HomeImageSlot, MediaAsset } from "@/lib/repo/types";

/** One place a library image is shown, with the admin page that changes it. */
export interface MediaUse {
  label: string;
  href: string;
}

const HOMEPAGE_SLOTS: Record<HomeImageSlot, string> = {
  hero: "Homepage → Hero artwork",
  "work-northstar": "Homepage → Selected work: Northstar Advisory",
  "work-oasis": "Homepage → Selected work: Oasis Living",
};

/** Every image src in a Tiptap document (image nodes only). */
function contentImageSources(node: unknown, found: string[] = []): string[] {
  if (!node || typeof node !== "object") return found;
  const { type, attrs, content } = node as { type?: unknown; attrs?: { src?: unknown }; content?: unknown };
  if (type === "image" && typeof attrs?.src === "string") found.push(attrs.src);
  if (Array.isArray(content)) for (const child of content) contentImageSources(child, found);
  return found;
}

/**
 * Whether a saved image address points at this library asset. A Cloudinary
 * delivery URL may carry transformations, but the public id (unique per
 * upload) always stays in its path.
 */
function pointsAt(src: string, asset: MediaAsset) {
  if (!src) return false;
  if (src === asset.url) return true;
  return src.startsWith("https://res.cloudinary.com/") && (src.includes(`/${asset.publicId}.`) || src.endsWith(`/${asset.publicId}`));
}

function blogLabel(blog: Blog) {
  return blog.status === "published" ? `“${blog.title}”` : `“${blog.title}” (${blog.status})`;
}

/**
 * Where each library image is used right now, keyed by asset _id. Read fresh
 * on every call, never stored, so it cannot go stale. Posts in every status
 * count: a draft's image would break when the draft is published. Images
 * that were pasted as an outside URL are not library assets and are ignored.
 */
export async function findMediaUsage(assets: MediaAsset[]): Promise<Map<string, MediaUse[]>> {
  const usage = new Map<string, MediaUse[]>(assets.map(asset => [asset._id, []]));
  if (!assets.length) return usage;

  const [settings, blogs] = await Promise.all([settingsRepo.get(), blogRepo.list()]);

  for (const [slot, image] of Object.entries(settings.homepageImages ?? {}) as [HomeImageSlot, { assetId: string } | undefined][]) {
    if (image) usage.get(image.assetId)?.push({ label: HOMEPAGE_SLOTS[slot] ?? `Homepage → ${slot}`, href: "/admin/homepage" });
  }

  for (const blog of blogs) {
    const href = `/admin/blog/${blog.slug}/edit`;
    const featured = blog.featuredImage;
    const inArticle = contentImageSources(blog.content);
    for (const asset of assets) {
      const uses = usage.get(asset._id)!;
      if (featured && (featured.publicId === asset.publicId || pointsAt(featured.url, asset))) {
        uses.push({ label: `Blog ${blogLabel(blog)} → Featured image`, href });
      }
      if (inArticle.some(src => pointsAt(src, asset))) {
        uses.push({ label: `Blog ${blogLabel(blog)} → Inside the article`, href });
      }
    }
  }

  return usage;
}
