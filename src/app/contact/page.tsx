import { SiteHeader } from "@/components/site-header";import { SiteFooter } from "@/components/site-footer";import { faqs } from "@/lib/site-data";
import { pageMetadata } from "@/lib/page-seo";
import { loadVisuals } from "@/lib/section-visuals";
import { SectionVisual } from "@/components/section-visual";
// Search details are editable at /admin/page-seo, so they are read per request.
export const dynamic = "force-dynamic";
export function generateMetadata(){return pageMetadata("contact");}
export default async function Contact(){const visuals=await loadVisuals(["contact.hero","contact.faq"]);return <><SiteHeader/><main><section className="page-hero"><div className="container visual-page-hero"><div><p className="eyebrow"><i/> START A PROJECT</p><h1>Tell us what&apos;s <em>next.</em></h1><p>Share a little about your business, the challenge and where you want to go. We&apos;ll come back with a useful next step.</p><a className="button button-dark" href="mailto:contact@merasoftware.com">contact@merasoftware.com <span>→</span></a></div><SectionVisual data={visuals["contact.hero"]} label="Contact illustration" /></div></section><section className="content-section container"><div className="section-top"><p className="eyebrow"><i/> COMMON QUESTIONS</p></div><div className="visual-feature"><div className="faq-list" style={{marginTop:40}}>{faqs.map(([q,a])=><details key={q}><summary>{q}</summary><p>{a}</p></details>)}</div><SectionVisual data={visuals["contact.faq"]} label="Questions illustration" /></div></section></main><SiteFooter/></>}
