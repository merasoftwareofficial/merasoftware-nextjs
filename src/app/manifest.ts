import type { MetadataRoute } from "next";
import { BRAND_ICONS } from "@/lib/brand";
import { SITE_DESCRIPTION, SITE_NAME } from "@/lib/structured-data";

/**
 * Web app manifest. Lets the site be added to a home screen, which iPhone
 * requires before it allows push notifications (src/docs/NOTIFICATIONS.md).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE_NAME,
    short_name: SITE_NAME,
    description: SITE_DESCRIPTION,
    start_url: "/",
    display: "standalone",
    background_color: "#f4f8fc",
    theme_color: "#00243d",
    icons: [
      { src: BRAND_ICONS.icon192, sizes: "192x192", type: "image/png" },
      { src: BRAND_ICONS.icon512, sizes: "512x512", type: "image/png" },
    ],
  };
}
