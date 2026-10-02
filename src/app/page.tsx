/* eslint @next/next/no-img-element: off -- Cloudinary images are not configured for next/image. */
import Link from "@/components/link";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { DEFAULT_HOMEPAGE_CONTENT, resolveHomepageContent } from "@/lib/homepage-content";
import { blogRepo, mediaRepo, settingsRepo } from "@/lib/repo";
import { FEATURES } from "@/lib/features";
import { loadVisuals } from "@/lib/section-visuals";
import { SectionVisual } from "@/components/section-visual";
import { pageMetadata } from "@/lib/page-seo";
import { jsonLd, organisationLd } from "@/lib/structured-data";

export const dynamic = "force-dynamic";

/** Title, description and share image are editable at /admin/page-seo. */
export function generateMetadata() {
  return pageMetadata("home");
}

export default async function Home() {
  const [posts, settings] = await Promise.all([
    blogRepo.listCards({ type: "official", status: "published", visibility: "public", limit: 3 }),
    settingsRepo.get(),
  ]);
  const content = resolveHomepageContent(settings.homepageContent ?? DEFAULT_HOMEPAGE_CONTENT);
  const visuals = await loadVisuals(["home.hero", "home.services", "home.statement", "home.contact"], settings);
  const placements = settings.homepageImages ?? {};
  const assetIds = Object.values(placements)
    .filter((image): image is NonNullable<typeof image> => Boolean(image))
    .map(image => image.assetId);
  const assets = await mediaRepo.findByIds(assetIds);
  const imageById = new Map(assets.map(asset => [asset._id, asset]));
  const workImageSlots = ["work-northstar", "work-oasis"] as const;

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
          <div className="hero-art visual-home-hero">
            <SectionVisual data={visuals["home.hero"]} label="Homepage hero artwork" />
            {visuals["home.hero"]?.config.mode !== "media" ? <div className="signal-card"><span className="signal-label">{content.hero.signalLabel}</span><strong>{content.hero.signalPrimary}<span>/</span>{content.hero.signalSecondary}</strong><div className="signal-line" /></div> : null}
          </div>
        </div>
        <div className="marquee"><div>{content.marquee.map((item, index) => <span key={`${item}-${index}`}>{item} <b>✦</b> </span>)}</div></div>
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

      {FEATURES.portfolio ? <section className="work-preview section">
        <div className="container">
          <div className="section-top">
            <p className="eyebrow"><i /> {content.work.eyebrow}</p>
            <Link className="text-link" href="/work">{content.work.allLabel} <span>↗</span></Link>
          </div>
          <h2 className="section-heading">{content.work.headingBefore} <em>{content.work.headingEmphasis}</em> {content.work.headingAfter}</h2>
          <div className="case-grid">{content.work.cards.map((card, index) => {
            const slot = workImageSlots[index];
            const placement = placements[slot];
            const image = placement ? imageById.get(placement.assetId) : undefined;
            return <article className={`case-card${image ? " has-image" : ""}`} key={slot}>
              {image ? <img className="case-card-image" src={image.url} alt={placement?.alt ?? ""} style={{ objectPosition: `${placement?.focalX ?? 50}% ${placement?.focalY ?? 50}%` }} /> : null}
              <span className="case-chip">{card.tag}</span><h3>{card.titleLineOne}<br />{card.titleLineTwo}</h3><p>{card.description}</p>
            </article>;
          })}</div>
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
