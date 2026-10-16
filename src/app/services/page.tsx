/* eslint @next/next/no-img-element: off -- Existing project preview. */
import { settingsRepo } from "@/lib/repo";
import { resolveServices, serviceSlot } from "@/lib/page-content";
import { ContentHeading } from "@/components/content-heading";
import Link from "@/components/link";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { pageMetadata } from "@/lib/page-seo";
import { loadPageVisuals } from "@/lib/section-visuals";
import { SectionVisual } from "@/components/section-visual";
import s from "./services.module.css";

export const dynamic = "force-dynamic";
export function generateMetadata() { return pageMetadata("services"); }

export default async function ServicesPage() {
  const settings = await settingsRepo.get();
  const content = resolveServices(settings);
  const catalogue = content.catalogue.groups.flatMap(group => group.items);
  const visuals = await loadPageVisuals("services", settings);
  return <><SiteHeader /><main className={s.page}>
    {content.hero.enabled ? <section className={s.intro}><div className={`container ${s.introGrid}`}>
      <div><p className={s.eyebrow}>{content.hero.eyebrow}</p><ContentHeading content={content.hero} level={1} /><p>{content.hero.description}</p></div>
      <div className={s.heroVisual}>{settings.sectionVisuals?.["services.hero"] || visuals["services.hero"]?.asset ? <SectionVisual data={visuals["services.hero"]} label="Mera Software services" /> : null}</div>
    </div></section> : null}
    {content.catalogue.enabled ? <section className={s.catalogue} aria-label="Available services"><div className="container">
      <p className={s.hint}>{content.catalogue.hint}</p>
      <div className={s.groups}>{content.catalogue.groups.map(group => <div className={s.group} key={group.id}>
        <div className={s.groupHeading}><span>{group.label}</span><h2>{group.title}</h2><p>{group.description}</p></div>
        <div className={s.serviceList}>{group.items.map(service => <details className={s.service} key={service.id}>
          <summary><h3>{service.title}</h3><span className={s.toggle} aria-hidden="true">+</span></summary>
          <div className={s.serviceBody}><p>{service.description}</p><ul>{service.inclusions.map(item => <li key={item}>{item}</li>)}</ul>
            {settings.sectionVisuals?.[serviceSlot(service.id)] ? <div className={s.serviceMedia}><SectionVisual data={visuals[serviceSlot(service.id)]} label={`${service.title} preview`} /></div> : null}
            {service.href && service.action ? <Link className={s.serviceLink} href={service.href}>{service.action}<span aria-hidden="true">↗</span></Link> : null}
          </div>
        </details>)}</div>
      </div>)}</div>
    </div></section> : null}
    {content.contact.enabled ? <section className={s.next}><div className={`container ${s.nextInner}`}><div><h2>{content.contact.heading}</h2><p>{content.contact.description}</p></div><div className={s.actions}>{content.contact.buttonHref && content.contact.buttonLabel ? <Link className={s.button} href={content.contact.buttonHref}>{content.contact.buttonLabel} <span aria-hidden="true">↗</span></Link> : null}{content.contact.secondaryHref && content.contact.secondaryLabel ? <Link className={s.contact} href={content.contact.secondaryHref}>{content.contact.secondaryLabel} <span aria-hidden="true">↗</span></Link> : null}</div></div></section> : null}
  </main><SiteFooter /></>;
}
