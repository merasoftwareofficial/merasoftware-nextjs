import Link from "@/components/link"; import { PageHero } from "@/components/page-hero"; import { SiteFooter } from "@/components/site-footer"; import { SiteHeader } from "@/components/site-header"; import { services } from "@/lib/site-data";
import { pageMetadata } from "@/lib/page-seo";
// Search details are editable at /admin/page-seo, so they are read per request.
export const dynamic = "force-dynamic";
export function generateMetadata(){return pageMetadata("services");}
export default function ServicesPage(){return <><SiteHeader/><main><PageHero eyebrow="OUR SERVICES" title="Digital work with a clear job to do." text="Every engagement starts with the business outcome. Then we choose the right tools, channels and pace to get there."/><section className="content-section container"><div className="card-grid">{services.map((s,i)=><Link className="info-card" href={`/services/${s.slug}`} key={s.slug}><span>0{i+1}</span><h3>{s.title.split(" — ")[0]}</h3><p>{s.description}</p></Link>)}</div></section></main><SiteFooter/></>}
