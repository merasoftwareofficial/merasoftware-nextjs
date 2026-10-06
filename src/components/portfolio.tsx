/* eslint @next/next/no-img-element: off -- Library images use Cloudinary delivery URLs. */
import Link from "@/components/link";
import type { PublicPortfolioEntry } from "@/lib/portfolio/types";
import { PortfolioReactions } from "@/components/portfolio-reactions";
export function PortfolioCard({ entry }: { entry: PublicPortfolioEntry }) {
  return <article className="portfolio-card"><Link href={`/work/${entry.slug}`} className="portfolio-card-link">
    {entry.cover ? <img src={entry.cover.url} alt={entry.cover.alt} loading="lazy" style={{ objectPosition: `${entry.cover.focalX}% ${entry.cover.focalY}%` }} /> : <div className="portfolio-card-media" aria-hidden="true" />}
    <div className="portfolio-card-copy"><span className="eyebrow">{entry.category.replaceAll("_", " ")}</span>{entry.brand ? <p className="portfolio-brand">{entry.brand}</p> : null}<h2>{entry.title}</h2><p>{entry.summary}</p>{entry.services.length ? <p className="portfolio-services">{entry.services.join(" · ")}</p> : null}<span className="text-link">View project ↗</span></div>
  </Link><PortfolioReactions id={entry._id} slug={entry.slug} compact /></article>;
}
export function PortfolioStory({ entry, preview = false }: { entry: PublicPortfolioEntry; preview?: boolean }) {
  return <article className="container portfolio-story"><div className="portfolio-intro"><p className="eyebrow">{entry.category.replaceAll("_", " ")}{entry.brand ? ` / ${entry.brand}` : ""}</p><h1>{entry.title}</h1><p>{entry.summary}</p>{entry.services.length ? <div className="portfolio-tags">{entry.services.map(service => <span key={service}>{service}</span>)}</div> : null}{entry.liveUrl ? <a className="button" href={entry.liveUrl} target="_blank" rel="noopener noreferrer">Visit website ↗</a> : null}</div>
    {entry.cover ? <img className="portfolio-hero-image" src={entry.cover.url} alt={entry.cover.alt} style={{ objectPosition: `${entry.cover.focalX}% ${entry.cover.focalY}%` }} /> : null}
    <div className="portfolio-story-sections">{[["The challenge", entry.problem], ["What we built", entry.solution], ["The result", entry.result]].filter(([, text]) => text).map(([label, text]) => <section key={label}><h2>{label}</h2><p>{text}</p></section>)}</div>
    {entry.gallery.length ? <section className="portfolio-gallery" aria-label="Project screenshots">{entry.gallery.map((image, index) => <figure key={`${image.assetId}-${index}`}><img src={image.url} alt={image.alt} loading="lazy" /><figcaption>{image.alt}</figcaption></figure>)}</section> : null}
    {!preview ? <PortfolioReactions id={entry._id} slug={entry.slug} /> : null}<section className="portfolio-contact"><h2>Have a similar project in mind?</h2><Link className="button" href="/contact">Start your project ↗</Link></section>
  </article>;
}
