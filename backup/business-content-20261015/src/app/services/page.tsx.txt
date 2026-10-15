import Link from "@/components/link"; import { PageHero } from "@/components/page-hero"; import { SiteFooter } from "@/components/site-footer"; import { SiteHeader } from "@/components/site-header"; import { services } from "@/lib/site-data";
import { pageMetadata } from "@/lib/page-seo";
import { loadVisuals } from "@/lib/section-visuals";
import { SectionVisual } from "@/components/section-visual";
// Search details are editable at /admin/page-seo, so they are read per request.
export const dynamic = "force-dynamic";
export function generateMetadata(){return pageMetadata("services");}
export default async function ServicesPage(){const visuals=await loadVisuals(["services.hero","services.website","services.seo","services.marketing"]);const cardSlots=["services.website","services.seo","services.marketing"] as const;return <><SiteHeader/><main><PageHero eyebrow="OUR SERVICES" title="Digital work with a clear job to do." text="Every engagement starts with the business outcome. Then we choose the right tools, channels and pace to get there." visual={visuals["services.hero"]}/><section className="content-section section-soft"><div className="container"><div className="card-grid">{services.map((s,i)=><Link className="info-card visual-card" href={`/services/${s.slug}`} key={s.slug}><span>0{i+1}</span><SectionVisual data={visuals[cardSlots[i]]} label={`${s.title} illustration`} /><h3>{s.title.split(" — ")[0]}</h3><p>{s.description}</p></Link>)}</div></div></section></main><SiteFooter/></>}
