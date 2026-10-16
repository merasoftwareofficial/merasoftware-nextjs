/* eslint @next/next/no-img-element: off -- Existing Cloudinary project previews. */
import Link from "@/components/link";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { SectionVisual } from "@/components/section-visual";
import { settingsRepo } from "@/lib/repo";
import { resolveAbout, memberSlot, projectSlot } from "@/lib/page-content";
import { ContentHeading } from "@/components/content-heading";
import { pageMetadata } from "@/lib/page-seo";
import { loadPageVisuals } from "@/lib/section-visuals";
import s from "./about.module.css";

export const dynamic = "force-dynamic";
export function generateMetadata() { return pageMetadata("about"); }

export default async function About() {
  const settings = await settingsRepo.get();
  const content = resolveAbout(settings);
  const visuals = await loadPageVisuals("about", settings);
  return <><SiteHeader /><main className={s.page}>
    {content.hero.enabled ? <section className={s.hero}><div className={`container ${s.heroGrid}`}>
      <div><p className={s.eyebrow}>{content.hero.eyebrow}</p>
        <ContentHeading content={content.hero} level={1} />
        <p className={s.lead}>{content.hero.lead}</p>
        <p className={s.copy}>{content.hero.description}</p>
        {content.hero.buttonHref && content.hero.buttonLabel ? <Link className={s.button} href={content.hero.buttonHref}>{content.hero.buttonLabel} <span aria-hidden="true">↗</span></Link> : null}
      </div><div className={`${s.frame} ${s.heroFrame}`}><SectionVisual data={visuals["about.hero"]} label="Mera Software brand visual" /></div>
    </div></section> : null}

    {content.purpose.enabled ? <section className={s.purpose}><div className={`container ${s.split}`}>
      <div><p className={s.eyebrow}>{content.purpose.eyebrow}</p><ContentHeading content={content.purpose} /></div>
      <div>{content.purpose.paragraphs.map((paragraph, index) => <p className={s.copy} key={index}>{paragraph}</p>)}</div>
    </div></section> : null}

    {content.approach.enabled ? <section className={s.soft}><div className={`container ${s.split}`}>
      <div className={s.frame}><SectionVisual data={visuals["about.presence"]} label="Understanding your business and digital needs" /></div>
      <div><p className={s.eyebrow}>{content.approach.eyebrow}</p><ContentHeading content={content.approach} />
        {content.approach.paragraphs.map((paragraph, index) => <p className={s.copy} key={index}>{paragraph}</p>)}
        {content.approach.buttonHref && content.approach.buttonLabel ? <Link className={s.textLink} href={content.approach.buttonHref}>{content.approach.buttonLabel} <span aria-hidden="true">↗</span></Link> : null}
      </div>
    </div></section> : null}

    {content.leadership.enabled ? <section className={s.section}><div className="container">
      <div className={s.heading}><p className={s.eyebrow}>{content.leadership.eyebrow}</p><ContentHeading content={content.leadership} /></div>
      <div className={s.leadership}>{content.leadership.members.map(({ id, name, position, role, description }) => <article key={id}>
        <div className={`${s.frame} ${s.personFrame}`}><SectionVisual data={visuals[memberSlot(id)]} label={`${name} profile`}>{(!visuals[memberSlot(id)]?.asset || visuals[memberSlot(id)]?.config.mode === "pattern") ? <span className={s.initials} aria-hidden="true">{name.split(" ").map(part => part[0]).join("")}</span> : null}</SectionVisual></div>
        <div><p className={s.position}>{position}</p><h3>{name}</h3><p className={s.role}>{role}</p></div><p className={s.bio}>{description}</p>
      </article>)}</div>
    </div></section> : null}

    {content.partnership.enabled ? <section className={s.dark}><div className={`container ${s.split}`}>
      <div><p className={s.eyebrow}>{content.partnership.eyebrow}</p><ContentHeading content={content.partnership} />
        {content.partnership.paragraphs.map((paragraph, index) => <p className={s.copy} key={index}>{paragraph}</p>)}
      </div><div className={s.frame}><SectionVisual data={visuals["about.values"]} label="Project coordination and client visibility" /></div>
    </div></section> : null}

    {content.work.enabled ? <section className={s.section}><div className="container">
      <div className={s.heading}><p className={s.eyebrow}>{content.work.eyebrow}</p><ContentHeading content={content.work} /></div>
      <div className={s.projects}>{content.work.projects.map(project => <a className={s.project} key={project.id} href={project.href || undefined} target="_blank" rel="noopener noreferrer">
        <div className={s.projectImage}><SectionVisual data={visuals[projectSlot(project.id)]} label={project.alt || project.brand} /></div>
        <div className={s.projectCaption}><div><p className={s.position}>{project.category}</p><h3>{project.brand}</h3><p className={s.copy}>{project.description}</p></div>{project.href ? <span aria-label="Visit website in a new tab">↗</span> : null}</div>
      </a>)}</div>
    </div></section> : null}

    {content.contact.enabled ? <section className={s.cta}><div className="container"><div><p className={s.eyebrow}>{content.contact.eyebrow}</p><ContentHeading content={content.contact} /><p className={s.copy}>{content.contact.description}</p></div>{content.contact.buttonHref && content.contact.buttonLabel ? <Link className={s.button} href={content.contact.buttonHref}>{content.contact.buttonLabel} <span aria-hidden="true">↗</span></Link> : null}</div></section> : null}
  </main><SiteFooter /></>;
}
