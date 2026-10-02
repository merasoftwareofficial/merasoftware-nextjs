import { SiteHeader } from "@/components/site-header";import { SiteFooter } from "@/components/site-footer";import { faqs } from "@/lib/site-data";
import { pageMetadata } from "@/lib/page-seo";
// Search details are editable at /admin/page-seo, so they are read per request.
export const dynamic = "force-dynamic";
export function generateMetadata(){return pageMetadata("contact");}
export default function Contact(){return <><SiteHeader/><main><section className="page-hero"><div className="container"><p className="eyebrow"><i/> START A PROJECT</p><h1>Tell us what&apos;s <em>next.</em></h1><p>Share a little about your business, the challenge and where you want to go. We&apos;ll come back with a useful next step.</p><a className="button button-dark" href="mailto:contact@merasoftware.com">contact@merasoftware.com <span>→</span></a></div></section><section className="content-section container"><div className="section-top"><p className="eyebrow"><i/> COMMON QUESTIONS</p></div><div className="faq-list" style={{marginTop:40}}>{faqs.map(([q,a])=><details key={q}><summary>{q}</summary><p>{a}</p></details>)}</div></section></main><SiteFooter/></>}
