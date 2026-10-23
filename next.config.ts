import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Preview origins must preserve directory URLs. proxy.ts retains marketing canonical URLs.
  skipTrailingSlashRedirect: true,
  distDir: process.env.NEXT_BUILD_DIR || '.next',
  async redirects() {
    // Upload links issued while the portal ran on this domain still point here; the
    // browser carries their #token fragment across the redirect to the portal page.
    const portalUrl = process.env.PORTAL_URL;
    if (!portalUrl) throw new Error("PORTAL_URL is not set — see src/docs/login.md");
    return [
      {
        source: "/external-upload",
        missing: [{ type: 'host', value: '.*-preview\\.merasoftware\\.com' }],
        destination: `${portalUrl.replace(/\/$/, "")}/external-upload`,
        permanent: false,
      },
    ];
  },
  async headers() {
    return [
      {
        // The push service worker must never be served stale, or a fix to it would not reach browsers.
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
