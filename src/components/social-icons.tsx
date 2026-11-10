/**
 * Footer social icons. Facebook and WhatsApp reuse the filled brand marks from share-icons.tsx.
 * Instagram, YouTube and Google are drawn with strokes, so they match the generic icons there.
 */

import type { SocialPlatform } from "@/lib/social-links";
import { BRAND } from "@/components/blog/share-icons";

const STROKE: Partial<Record<SocialPlatform, string[]>> = {
  instagram: [
    "M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5Z",
    "M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10Z",
  ],
  youtube: [
    "M22.5 7.2a2.8 2.8 0 0 0-2-2C18.8 4.7 12 4.7 12 4.7s-6.8 0-8.5.5a2.8 2.8 0 0 0-2 2A29 29 0 0 0 1 12a29 29 0 0 0 .5 4.8 2.8 2.8 0 0 0 2 2c1.7.5 8.5.5 8.5.5s6.8 0 8.5-.5a2.8 2.8 0 0 0 2-2A29 29 0 0 0 23 12a29 29 0 0 0-.5-4.8Z",
    "m9.8 15.5 5.7-3.5-5.7-3.5v7Z",
  ],
  google: [
    "M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3Z",
    "M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22Z",
    "M6.4 13.9a6 6 0 0 1 0-3.8V7.5H3.1a10 10 0 0 0 0 9l3.3-2.6Z",
    "M12 6c1.5 0 2.8.5 3.8 1.5l2.9-2.9A10 10 0 0 0 3.1 7.5l3.3 2.6C7.2 7.8 9.4 6 12 6Z",
  ],
};

export function SocialIcon({ platform }: { platform: SocialPlatform }) {
  // Facebook and WhatsApp have a filled mark in BRAND; the others are stroked.
  const filled = platform === "facebook" || platform === "whatsapp" ? BRAND[platform] : undefined;
  if (filled) {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d={filled} />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {(STROKE[platform] ?? []).map(d => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
