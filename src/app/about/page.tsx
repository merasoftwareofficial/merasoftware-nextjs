import { PageHero } from "@/components/page-hero";import { SiteHeader } from "@/components/site-header";import { SiteFooter } from "@/components/site-footer";
import { pageMetadata } from "@/lib/page-seo";
// Search details are editable at /admin/page-seo, so they are read per request.
export const dynamic = "force-dynamic";
export function generateMetadata(){return pageMetadata("about");}
export default function About(){return <><SiteHeader/><main><PageHero eyebrow="ABOUT MERA SOFTWARE" title="Small by design. Serious about the details." text="We pair strategic clarity with considered digital execution, so your marketing feels connected instead of cobbled together."/><section className="content-section container"><div className="result-grid" style={{marginTop:0}}><article><span>01</span><h3>Clear</h3><p>We make complex digital work easier to understand and act on.</p></article><article><span>02</span><h3>Curious</h3><p>We ask better questions before reaching for familiar answers.</p></article><article><span>03</span><h3>Accountable</h3><p>We measure the work by its contribution to your business.</p></article></div></section></main><SiteFooter/></>}
