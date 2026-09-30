/* eslint @next/next/no-img-element: off -- Cloudinary images are not configured for next/image. */
import Link from "@/components/link";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { blogRepo, mediaRepo, settingsRepo } from "@/lib/repo";
import { services } from "@/lib/site-data";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [posts, settings] = await Promise.all([
    blogRepo.listCards({ type: "official", status: "published", visibility: "public", limit: 3 }),
    settingsRepo.get(),
  ]);
  const placements = settings.homepageImages ?? {};
  const assetIds = Object.values(placements).filter((image): image is NonNullable<typeof image> => Boolean(image)).map(image => image.assetId);
  const assets = await mediaRepo.findByIds(assetIds);
  const imageById = new Map(assets.map(asset => [asset._id, asset]));
  const heroPlacement = placements.hero;
  const heroImage = heroPlacement ? imageById.get(heroPlacement.assetId) : undefined;
  const northstarPlacement = placements["work-northstar"];
  const northstarImage = northstarPlacement ? imageById.get(northstarPlacement.assetId) : undefined;
  const oasisPlacement = placements["work-oasis"];
  const oasisImage = oasisPlacement ? imageById.get(oasisPlacement.assetId) : undefined;

  return <><SiteHeader /><main><section className="hero"><div className="hero-grid container"><div className="hero-copy"><p className="eyebrow"><i /> DIGITAL GROWTH PARTNER</p><h1>Make your digital presence <em>impossible</em> to ignore.</h1><p className="intro">We help ambitious businesses build sharper websites, win meaningful visibility, and turn attention into growth.</p><div className="hero-actions"><Link className="button button-dark" href="/contact">Start a project <span>→</span></Link><Link className="text-link" href="/services">Explore our work <span>↓</span></Link></div></div><div className="hero-art" aria-hidden={heroImage ? undefined : true}>
{heroImage ? <img className="home-hero-image" src={heroImage.url} alt={heroPlacement?.alt ?? ""} style={{ objectPosition: `${heroPlacement?.focalX ?? 50}% ${heroPlacement?.focalY ?? 50}%` }} /> : null}
<div className="orb orb-one" /><div className="orb orb-two" /><div className="arc" /><div className="signal-card"><span className="signal-label">DIGITAL SIGNAL</span><strong>01<span>/</span>01</strong><div className="signal-line" /></div><div className="plus plus-one">+</div><div className="plus plus-two">+</div></div></div><div className="marquee"><div>WEB DEVELOPMENT <b>✦</b> SEARCH ENGINE OPTIMISATION <b>✦</b> PERFORMANCE MARKETING <b>✦</b> BRAND GROWTH <b>✦</b></div></div></section>
<section className="section container"><div className="section-top"><p className="eyebrow"><i /> WHAT WE DO</p><p className="side-note">A compact, senior team for businesses ready to move with purpose.</p></div><h2 className="section-heading">Built for the work that <em>moves</em> your business forward.</h2><div className="service-list">{services.map((service, index)=><Link className="service" href={`/services/${service.slug}`} key={service.slug}><span className="service-number">0{index+1}</span><div><h3>{service.title.split(" — ")[0]}</h3><p>{service.description}</p></div><span className="service-arrow">↗</span></Link>)}</div></section>
<section className="statement"><div className="container"><p className="eyebrow"><i /> OUR POINT OF VIEW</p><h2>Growth is not a lucky break.<br />It&apos;s a system with <em>intention.</em></h2><p>Every decision connects: the story your website tells, the search terms you own, and the campaigns that bring customers in.</p></div></section>
<section className="work-preview section"><div className="container"><div className="section-top"><p className="eyebrow"><i /> SELECTED WORK</p><Link className="text-link" href="/work">See all work <span>↗</span></Link></div><h2 className="section-heading">Good work should feel <em>good</em> for business.</h2><div className="case-grid"><article className={`case-card${northstarImage ? " has-image" : ""}`}>
{northstarImage ? <img className="case-card-image" src={northstarImage.url} alt={northstarPlacement?.alt ?? ""} style={{ objectPosition: `${northstarPlacement?.focalX ?? 50}% ${northstarPlacement?.focalY ?? 50}%` }} /> : null}
<span className="case-chip">WEB + SEO</span><h3>Northstar<br />Advisory</h3><p>A more confident digital home for a growing consultancy.</p></article><article className={`case-card${oasisImage ? " has-image" : ""}`}>
{oasisImage ? <img className="case-card-image" src={oasisImage.url} alt={oasisPlacement?.alt ?? ""} style={{ objectPosition: `${oasisPlacement?.focalX ?? 50}% ${oasisPlacement?.focalY ?? 50}%` }} /> : null}
<span className="case-chip">PAID GROWTH</span><h3>Oasis<br />Living</h3><p>A focused acquisition system built around qualified enquiries.</p></article></div></div></section>
<section className="section container"><div className="section-top"><p className="eyebrow"><i /> FROM THE JOURNAL</p><Link className="text-link" href="/blog">All insights <span>↗</span></Link></div><h2 className="section-heading">Useful thinking for the next <em>move.</em></h2><div className="post-grid">{posts.map(post=><Link className="post-card" key={post._id} href={`/blog/${post.slug}`}>{post.featuredImage?.url ? <img className="post-art post-art-image home-post-image" src={post.featuredImage.url} alt={post.featuredImage.alt} loading="lazy" /> : <div className="post-art">{(post.category ?? "INSIGHTS").toUpperCase()}<br /><br />IDEAS WITH<br />COMMERCIAL INTENT</div>}<div className="post-copy"><span>{post.category ?? "Insights"}</span><h3>{post.title}</h3><div className="post-meta"><span>{post.publishedAt ? new Date(post.publishedAt).toLocaleDateString("en-GB",{day:"numeric",month:"long",year:"numeric"}) : ""}</span><span>{post.authorName}</span></div></div></Link>)}</div></section>
<section className="contact"><div className="container contact-inner"><p className="eyebrow"><i /> READY WHEN YOU ARE</p><h2>Let&apos;s build the next<br /><em>good thing.</em></h2><Link className="button button-light" href="/contact">Start a conversation <span>→</span></Link></div></section></main><SiteFooter /></>;
}
