import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { settingsRepo } from "@/lib/repo";
import { DEFAULT_UNIVERSAL_TERMS } from "@/lib/offers";
import { pageMetadata } from "@/lib/page-seo";
import { packagePath, readPublicPackagesOrNone } from "@/lib/package-pages-server";
import Link from "@/components/link";

export const dynamic = "force-dynamic";
export function generateMetadata() { return pageMetadata("terms"); }

// The public Terms & Conditions page. Nothing is typed here: the general terms are the ones saved in
// Admin > Offers > Terms & Conditions (the same list every package and offer page shows), and each
// package's own terms come from the package itself, so editing them there changes this page.
export default async function Terms() {
  const [settings, packages] = await Promise.all([settingsRepo.get(), readPublicPackagesOrNone()]);
  const general = (settings.offerUniversalTerms ?? DEFAULT_UNIVERSAL_TERMS).filter(line => line.trim());
  const byPackage = packages.filter(item => item.terms.some(line => line.trim()));
  return <><SiteHeader /><main className="article"><article className="article-inner">
    <p className="eyebrow"><i /> LEGAL</p>
    <h1>Terms &amp; Conditions</h1>
    <div className="article-body">
      {general.length ? <><h2>General terms</h2><p>These terms apply to every package and offer.</p><ol>{general.map((line, index) => <li key={index}>{line}</li>)}</ol></> : null}
      {byPackage.length ? <><h2>Terms by package</h2><p>Each package also has its own terms and exclusions.</p>
        {byPackage.map(item => <details key={item.id}><summary><strong>{item.name}</strong></summary>
          <ol>{item.terms.filter(line => line.trim()).map((line, index) => <li key={index}>{line}</li>)}</ol>
          <p><Link href={packagePath(item.id)}>View {item.name}</Link></p></details>)}</> : null}
      <h2>Offers</h2>
      <p>A limited-time offer lists its own terms, including its validity, on the offer page.</p>
    </div>
  </article></main><SiteFooter /></>;
}
