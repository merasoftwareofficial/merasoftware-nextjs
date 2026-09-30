import { PageHero } from "@/components/page-hero";import { SiteHeader } from "@/components/site-header";import { SiteFooter } from "@/components/site-footer";
import { notFound } from "next/navigation";
import { FEATURES } from "@/lib/features";
export const metadata={title:"Our Work"};
/** Off while the portfolio has no real projects (lib/features.ts): a 404, so search engines drop it. */
export default function Work(){if(!FEATURES.portfolio)notFound();return <><SiteHeader/><main><PageHero eyebrow="SELECTED WORK" title="Work that makes the next move clearer." text="A selection of digital foundations and growth systems designed around specific business challenges."/><section className="content-section container"><div className="case-grid"><article className="case-card"><span className="case-chip">WEB + SEO</span><h3>Northstar<br/>Advisory</h3><p>Brand and website strategy for a consultancy ready to be found.</p></article><article className="case-card"><span className="case-chip">PAID GROWTH</span><h3>Oasis<br/>Living</h3><p>A qualified lead-generation system with better visibility.</p></article></div></section></main><SiteFooter/></>}
