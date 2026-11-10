/**
 * Turns the business's profile URLs (Admin → Page SEO → Business details, `organization.sameAs`)
 * into footer icons. Only known platforms get an icon; any other URL stays in the SEO data
 * but is not shown. Pure functions, so they can be tested without the server.
 */

export type SocialPlatform = "facebook" | "instagram" | "youtube" | "google" | "whatsapp";

export type SocialLink = { platform: SocialPlatform; label: string; href: string };

const LABEL: Record<SocialPlatform, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  youtube: "YouTube",
  google: "Google",
  whatsapp: "WhatsApp",
};

/** Host → platform. Matches the host itself and its subdomains (for example m.facebook.com). */
const HOSTS: [string, SocialPlatform][] = [
  ["facebook.com", "facebook"],
  ["fb.com", "facebook"],
  ["instagram.com", "instagram"],
  ["youtube.com", "youtube"],
  ["youtu.be", "youtube"],
  ["google.com", "google"],
  ["share.google", "google"],
  ["g.page", "google"],
];

/** The platform of one URL, or null when it is not a known profile. Only https links count. */
export function socialPlatformOf(url: string): SocialPlatform | null {
  let parsed: URL;
  try { parsed = new URL(url.trim()); } catch { return null; }
  if (parsed.protocol !== "https:") return null;
  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  for (const [domain, platform] of HOSTS) {
    if (host === domain || host.endsWith(`.${domain}`)) return platform;
  }
  return null;
}

/** Footer icon list from the saved profile URLs, in the order the admin entered them, one per platform. */
export function socialLinks(sameAs: string[], whatsappNumber?: string): SocialLink[] {
  const seen = new Set<SocialPlatform>();
  const links: SocialLink[] = [];
  for (const url of sameAs) {
    const platform = socialPlatformOf(url);
    if (!platform || seen.has(platform)) continue;
    seen.add(platform);
    links.push({ platform, label: LABEL[platform], href: url.trim() });
  }
  const digits = (whatsappNumber ?? "").replace(/\D/g, "");
  if (digits) links.push({ platform: "whatsapp", label: LABEL.whatsapp, href: `https://wa.me/${digits}` });
  return links;
}
