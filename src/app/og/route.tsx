/**
 * GET /og?title=…  — the generated share image (1200 × 630 PNG).
 *
 * Used wherever a page has no image of its own: the layout default, a site
 * page without a share image (lib/page-seo.ts) and a post without a featured
 * image. Without it, links shared on WhatsApp, LinkedIn or X show no picture.
 *
 * A route rather than an opengraph-image file on purpose: file-based images
 * override every page's own image (Next's rule), which would hide featured
 * images. Here each page chooses it explicitly.
 */

import { ImageResponse } from "next/og";
import { BRAND_LOGO } from "@/lib/brand";
import { SITE_NAME, SITE_TITLE, SITE_URL } from "@/lib/structured-data";

const SIZE = { width: 1200, height: 630 };

/** The dark-background logo as a data URI: the image renderer cannot read files from /public by path. */
async function logoDataUri(request: Request) {
  const response = await fetch(new URL(BRAND_LOGO.dark, request.url));
  if (!response.ok) return null;
  return `data:image/svg+xml;base64,${Buffer.from(await response.arrayBuffer()).toString("base64")}`;
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const title = (params.get("title")?.trim() || SITE_TITLE).slice(0, 110);
  const label = (params.get("label")?.trim() || "").slice(0, 40).toUpperCase();
  const host = new URL(SITE_URL).hostname;
  const logo = await logoDataUri(request).catch(() => null);

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "72px 80px", background: "#00243d", color: "#f4f8fc" }}>
        {/* 66px tall; the width follows the logo file. The text fallback only shows if it could not be fetched. */}
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element -- rendered by next/og, not the browser.
          <img src={logo} width={Math.round((66 * BRAND_LOGO.width) / BRAND_LOGO.height)} height={66} alt="" />
        ) : (
          <div style={{ display: "flex", fontSize: 34, fontWeight: 700, color: "#66e4ee" }}>{SITE_NAME}</div>
        )}
        <div style={{ display: "flex", flexDirection: "column" }}>
          {label ? <div style={{ display: "flex", fontSize: 26, letterSpacing: 4, color: "#66e4ee", marginBottom: 24 }}>{label}</div> : null}
          <div style={{ display: "flex", fontSize: title.length > 60 ? 58 : 70, fontWeight: 700, lineHeight: 1.12 }}>{title}</div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 26, color: "#b6cddd" }}>
          <span>{SITE_NAME}</span>
          <span>{host}</span>
        </div>
      </div>
    ),
    {
      ...SIZE,
      // Titles change only when an editor saves; a day of caching is plenty.
      headers: { "Cache-Control": "public, max-age=86400, s-maxage=86400" },
    },
  );
}
