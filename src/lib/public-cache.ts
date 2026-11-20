import "server-only";
import { revalidatePath } from "next/cache";

const CORE_PUBLIC_PATHS = [
  "/",
  "/about",
  "/contact",
  "/terms",
  "/services",
  "/offers",
  "/plans",
  "/work",
  "/blog",
  "/community",
  "/discussions",
  "/subscribe",
  "/sitemap.xml",
] as const;

/**
 * Purges Vercel's ISR/route cache for public marketing and listing pages after an admin save.
 * Safe no-op when called outside a Next.js request context (e.g. unit tests).
 */
export function invalidatePublicPages(...extraPaths: string[]) {
  try {
    for (const path of CORE_PUBLIC_PATHS) revalidatePath(path);
    for (const path of extraPaths) if (path) revalidatePath(path);
    revalidatePath("/services/[slug]", "page");
    revalidatePath("/offers/[slug]", "page");
    revalidatePath("/packages/[slug]", "page");
    revalidatePath("/work/[slug]", "page");
    revalidatePath("/blog/[slug]", "page");
    revalidatePath("/topics/[slug]", "page");
  } catch { /* Outside Next.js request context (e.g. unit tests). */ }
}
