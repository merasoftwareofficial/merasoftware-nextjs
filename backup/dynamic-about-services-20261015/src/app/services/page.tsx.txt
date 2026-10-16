/* eslint @next/next/no-img-element: off -- Existing project preview. */
import { variantContent } from "@/components/campaign/public-interaction/content";
import Link from "@/components/link";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { pageMetadata } from "@/lib/page-seo";
import { loadVisuals } from "@/lib/section-visuals";
import { SectionVisual } from "@/components/section-visual";
import s from "./services.module.css";

export const dynamic = "force-dynamic";
export function generateMetadata() { return pageMetadata("services"); }

const catalogue = [
  { title: "Website Development", slot: "services.website", description: "Professional websites that present your business and make enquiries easy.", items: ["Business websites & landing pages", "Responsive design", "Dynamic content & custom features"], href: "/services/website-development", action: "View development services" },
  { title: "Mobile App Development", slot: "services.apps", description: "Custom mobile apps for your customers, services and internal teams.", items: ["Customer-facing applications", "Business workflows", "Features planned to your requirements"], href: "/contact", action: "Discuss your app" },
  { title: "Cloud Software & CRM", slot: "services.software", description: "Connected systems to organise customer information and everyday operations.", items: ["Custom CRM systems", "Cloud-based business software", "Workflow management & automation"], href: "/contact", action: "Discuss your software" },
  { title: "Online Setup & SEO", slot: "services.seo", description: "Establish your business profiles and improve how customers find you online.", items: ["Google Business Profile", "Relevant social profile setup", "Local search & website SEO"], href: "/services/seo", action: "View setup & SEO services" },
  { title: "Social Media & Content", slot: "services.social", description: "Consistent content and professional presentation on the platforms that fit your business.", items: ["Content planning, design & captions", "Social media management", "Photography & content shoots"], href: "/services/performance-marketing", action: "View content & marketing services" },
  { title: "Paid Advertising", slot: "services.marketing", description: "Targeted campaigns to promote your services to relevant audiences.", items: ["Google Ads", "Social media ad campaigns", "Campaign creative & optimisation"], href: "/services/performance-marketing", action: "View advertising services" },
] as const;

export default async function ServicesPage() {
  const visuals = await loadVisuals(["services.hero", ...catalogue.map(service => service.slot)]);
  const groups = [
    { title: "Websites, apps & software", label: "BUILD", description: "Digital experiences and systems built for your business.", services: catalogue.slice(0, 3) },
    { title: "Digital marketing", label: "GROW", description: "Visibility, content and campaigns for the right audience.", services: catalogue.slice(3) },
  ];
  const project = variantContent.work[0];
  return <><SiteHeader /><main className={s.page}>
    <section className={s.intro}><div className={`container ${s.introGrid}`}>
      <div><p className={s.eyebrow}>OUR SERVICES</p><h1>Built for business.<br /><em>Made to stand out.</em></h1><p>Websites, apps, business software and digital marketing. Find the service that fits your next step.</p></div>
      <div className={s.heroVisual}>{visuals["services.hero"]?.asset && visuals["services.hero"]?.config.mode !== "pattern" ? <SectionVisual data={visuals["services.hero"]} label="Mera Software services" /> : <a href={project.liveUrl} target="_blank" rel="noopener noreferrer"><img src={project.image} alt={project.imageAlt} width={960} height={600} /><span>Selected website work · SLN <span aria-hidden="true">↗</span></span></a>}</div>
    </div></section>
    <section className={s.catalogue} aria-label="Available services"><div className="container">
      <p className={s.hint}>Select a service to see what’s included.</p>
      <div className={s.groups}>{groups.map(group => <div className={s.group} key={group.label}>
        <div className={s.groupHeading}><span>{group.label}</span><h2>{group.title}</h2><p>{group.description}</p></div>
        <div className={s.serviceList}>{group.services.map(service => <details className={s.service} key={service.title}>
          <summary><h3>{service.title}</h3><span className={s.toggle} aria-hidden="true">+</span></summary>
          <div className={s.serviceBody}><p>{service.description}</p><ul>{service.items.map(item => <li key={item}>{item}</li>)}</ul>
            {visuals[service.slot]?.asset && visuals[service.slot]?.config.mode !== "pattern" ? <div className={s.serviceMedia}><SectionVisual data={visuals[service.slot]} label={`${service.title} preview`} /></div> : null}
            <Link className={s.serviceLink} href={service.href}>{service.action}<span aria-hidden="true">↗</span></Link>
          </div>
        </details>)}</div>
      </div>)}</div>
    </div></section>
    <section className={s.next}><div className={`container ${s.nextInner}`}><div><h2>One service or a complete package.</h2><p>Choose a plan, or talk to us about a custom requirement.</p></div><div className={s.actions}><Link className={s.button} href="/campaign/packages">Packages & pricing <span aria-hidden="true">↗</span></Link><Link className={s.contact} href="/contact">Discuss your project <span aria-hidden="true">↗</span></Link></div></div></section>
  </main><SiteFooter /></>;
}
