/* eslint @next/next/no-img-element: off -- Cloudinary images are not configured for next/image. */
import Link from "@/components/link";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { DEFAULT_HOMEPAGE_CONTENT, resolveHomepageContent } from "@/lib/homepage-content";
import { blogRepo, settingsRepo } from "@/lib/repo";
import { FEATURES } from "@/lib/features";
import { portfolioRepo } from "@/lib/portfolio/repo";
import { publicPortfolio } from "@/lib/portfolio/types";
import { PortfolioCard } from "@/components/portfolio";
import { loadVisuals } from "@/lib/section-visuals";
import { SectionVisual } from "@/components/section-visual";
import { pageMetadata } from "@/lib/page-seo";
import { jsonLd, organisationLd } from "@/lib/structured-data";

export const dynamic = "force-dynamic";

/** How many times the moving strip's items repeat inside one copy (see the marquee below). */
const MARQUEE_REPEAT = 3;

/** Title, description and share image are editable at /admin/page-seo. */
export function generateMetadata() {
  return pageMetadata("home");
}

export default async function Home() {
  const [posts, settings, portfolio] = await Promise.all([
    blogRepo.listCards({ type: "official", status: "published", visibility: "public", limit: 3 }),
    settingsRepo.get(),
    portfolioRepo.list(true),
  ]);
  const content = resolveHomepageContent(settings.homepageContent ?? DEFAULT_HOMEPAGE_CONTENT);
  const visuals = await loadVisuals(["home.hero", "home.services", "home.statement", "home.contact"], settings);
  const featuredWork = portfolio.filter(entry => entry.featured).slice(0, 3).map(publicPortfolio);
  const heroVisual = visuals["home.hero"];
  const heroVideo = heroVisual?.config.mode !== "pattern" && heroVisual?.config.frameShape === "source" && heroVisual.asset?.kind === "video" && heroVisual.asset.width > 0 && heroVisual.asset.height > 0 ? heroVisual.asset : undefined;

  return <>
    {/* The business as search engines describe it; logo and profiles come from /admin/page-seo. */}
    <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(organisationLd(settings.organization))} />
    <SiteHeader />
    <main>
      <section className="hero">
        <div className="hero-grid container">
          <div className="hero-copy">
            <p className="eyebrow"><i /> {content.hero.eyebrow}</p>
            <h1>{content.hero.headingBefore} <em>{content.hero.headingEmphasis}</em> {content.hero.headingAfter}</h1>
            <p className="intro">{content.hero.description}</p>
            <div className="hero-actions">
              <Link className="button button-dark" href={content.hero.primaryHref}>{content.hero.primaryLabel} <span>→</span></Link>
              <Link className="text-link" href={content.hero.secondaryHref}>{content.hero.secondaryLabel} <span>↓</span></Link>
            </div>
          </div>
          <div className={`hero-art visual-home-hero${heroVisual?.asset ? " has-image" : ""}`} data-frame-shape={heroVideo ? "source" : heroVisual?.config.frameShape === "square" ? "square" : "slot"} style={heroVideo ? { "--media-ratio": heroVideo.width / heroVideo.height } as React.CSSProperties : undefined}>
            <SectionVisual data={heroVisual} label="Homepage hero artwork" />
          </div>
        </div>
        {/* Two identical copies slide by exactly one copy's width, so the strip loops with no jump; the second is hidden from screen readers.
            Each copy holds the items MARQUEE_REPEAT times so it is wider than a large screen, and the time grows with it so the speed stays the same. */}
        <div className="marquee"><div className="marquee-track" style={{ animationDuration: `${26 * MARQUEE_REPEAT}s` }}>{[false, true].map(copy => <div key={String(copy)} aria-hidden={copy || undefined}>{Array.from({ length: MARQUEE_REPEAT }, (_, round) => content.marquee.map((item, index) => <span key={`${round}-${index}`}>{item} <b>✦</b> </span>))}</div>)}</div></div>
      </section>

      <section className="section container">
        <div className="section-top">
          <p className="eyebrow"><i /> {content.services.eyebrow}</p>
          <p className="side-note">{content.services.sideNote}</p>
        </div>
        <h2 className="section-heading">{content.services.headingBefore} <em>{content.services.headingEmphasis}</em> {content.services.headingAfter}</h2>
        <div className="visual-feature"><div className="service-list">{content.services.items.map((service, index) => <Link className="service" href={`/services/${service.slug}`} key={service.slug}>
          <span className="service-number">0{index + 1}</span>
          <div><h3>{service.title}</h3><p>{service.description}</p></div>
          <span className="service-arrow">↗</span>
        </Link>)}</div><SectionVisual data={visuals["home.services"]} label="Services illustration" /></div>
      </section>

      <section className="statement visual-home-statement">
        <div className="container">
          <div>
          <p className="eyebrow"><i /> {content.pointOfView.eyebrow}</p>
          <h2>{content.pointOfView.headingLineOne}<br />{content.pointOfView.headingBefore} <em>{content.pointOfView.headingEmphasis}</em>{content.pointOfView.headingAfter}</h2>
          <p>{content.pointOfView.description}</p>
          </div><SectionVisual data={visuals["home.statement"]} label="Point of view illustration" />
        </div>
      </section>

      {FEATURES.portfolio && featuredWork.length > 0 ? <section className="work-preview section">
        <div className="container">
          <div className="section-top">
            <p className="eyebrow"><i /> {content.work.eyebrow}</p>
            <Link className="text-link" href="/work">{content.work.allLabel} <span>↗</span></Link>
          </div>
          <h2 className="section-heading">{content.work.headingBefore} <em>{content.work.headingEmphasis}</em> {content.work.headingAfter}</h2>
          <div className="portfolio-grid">{featuredWork.map(entry => <PortfolioCard key={entry._id} entry={entry} />)}</div>
        </div>
      </section> : null}

      <section className="section container">
        <div className="section-top">
          <p className="eyebrow"><i /> {content.insights.eyebrow}</p>
          <Link className="text-link" href="/blog">{content.insights.allLabel} <span>↗</span></Link>
        </div>
        <h2 className="section-heading">{content.insights.headingBefore} <em>{content.insights.headingEmphasis}</em>{content.insights.headingAfter}</h2>
        <div className="post-grid">{posts.map(post => <Link className="post-card" key={post._id} href={`/blog/${post.slug}`}>
          {post.featuredImage?.url ? <img className="post-art post-art-image home-post-image" src={post.featuredImage.url} alt={post.featuredImage.alt} loading="lazy" /> : <div className="post-art">{(post.category ?? "INSIGHTS").toUpperCase()}<br /><br />{content.insights.fallbackLineOne}<br />{content.insights.fallbackLineTwo}</div>}
          <div className="post-copy"><span>{post.category ?? "Insights"}</span><h3>{post.title}</h3><div className="post-meta"><span>{post.publishedAt ? new Date(post.publishedAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : ""}</span><span>{post.authorName}</span></div></div>
        </Link>)}</div>
      </section>

      <section className="contact visual-home-contact">
        <div className="container contact-inner">
          <div>
          <p className="eyebrow"><i /> {content.contact.eyebrow}</p>
          <h2>{content.contact.headingLineOne}<br /><em>{content.contact.headingEmphasis}</em></h2>
          <Link className="button button-light" href={content.contact.buttonHref}>{content.contact.buttonLabel} <span>→</span></Link>
          </div><SectionVisual data={visuals["home.contact"]} label="Contact illustration" />
        </div>
      </section>
    </main>
    <SiteFooter />
  </>;
}
