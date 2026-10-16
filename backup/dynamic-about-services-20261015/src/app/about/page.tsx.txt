/* eslint @next/next/no-img-element: off -- Existing Cloudinary project previews. */
import Link from "@/components/link";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { SectionVisual } from "@/components/section-visual";
import { variantContent } from "@/components/campaign/public-interaction/content";
import { pageMetadata } from "@/lib/page-seo";
import { loadVisuals } from "@/lib/section-visuals";
import s from "./about.module.css";

export const dynamic = "force-dynamic";
export function generateMetadata() { return pageMetadata("about"); }

const leadership = [
  ["Jasmeet Kaur", "Co-owner", "Development & Delivery", "Leads business direction, technical development and project delivery."],
  ["Sahilpreet Kaur", "Co-owner", "Creative & Canada Client Relations", "Shapes creative content and UI design, and manages client relationships in Canada."],
  ["Deep Kaur", "Management", "Marketing & Operations Manager", "Coordinates marketing activities and daily operations to keep planned work on track."],
];

export default async function About() {
  const peopleSlots = ["about.jasmeet", "about.sahilpreet", "about.deep"] as const;
  const visuals = await loadVisuals(["about.hero", "about.presence", "about.values", ...peopleSlots]);
  return <><SiteHeader /><main className={s.page}>
    <section className={s.hero}><div className={`container ${s.heroGrid}`}>
      <div><p className={s.eyebrow}>ABOUT MERA SOFTWARE · EST. 2022</p>
        <h1>Built around business.<br /><em>Driven by responsibility.</em></h1>
        <p className={s.lead}>Established in 2022, Mera Software helps local businesses build their online presence, connect with customers and improve operations through digital solutions.</p>
        <p className={s.copy}>We bring business understanding, creative design and technical development into one coordinated service.</p>
        <Link className={s.button} href="/contact">Talk to our team <span aria-hidden="true">↗</span></Link>
      </div><div className={`${s.frame} ${s.heroFrame}`}><SectionVisual data={visuals["about.hero"]} label="Mera Software brand visual" /></div>
    </div></section>

    <section className={s.purpose}><div className={`container ${s.split}`}>
      <div><p className={s.eyebrow}>OUR PURPOSE</p><h2>Making digital decisions clearer.<br /><em>Making execution dependable.</em></h2></div>
      <div><p className={s.copy}>Mera Software began when Jasmeet Kaur saw the challenges businesses faced in moving online—from unclear advice to poorly managed services.</p>
        <p className={s.copy}>That experience shaped our purpose: to give business owners informed guidance, relevant solutions and clear responsibility for the work.</p></div>
    </div></section>

    <section className={s.soft}><div className={`container ${s.split}`}>
      <div className={s.frame}><SectionVisual data={visuals["about.presence"]} label="Understanding your business and digital needs" /></div>
      <div><p className={s.eyebrow}>OUR APPROACH</p><h2>Your business determines <em>the solution.</em></h2>
        <p className={s.copy}>We understand your services, customers and priorities before recommending platforms or technology.</p>
        <p className={s.copy}>From business profiles and websites to mobile apps, CRM and marketing, our work follows a plan suited to your needs. We coordinate the content, design and development required to deliver it.</p>
        <Link className={s.textLink} href="/services">Explore our expertise <span aria-hidden="true">↗</span></Link>
      </div>
    </div></section>

    <section className={s.section}><div className="container">
      <div className={s.heading}><p className={s.eyebrow}>LEADERSHIP & MANAGEMENT</p><h2>The people behind <em>Mera Software.</em></h2></div>
      <div className={s.leadership}>{leadership.map(([name, position, role, description], index) => <article key={name}>
        <div className={`${s.frame} ${s.personFrame}`}><SectionVisual data={visuals[peopleSlots[index]]} label={`${name} profile`} />{(!visuals[peopleSlots[index]]?.asset || visuals[peopleSlots[index]]?.config.mode === "pattern") ? <span className={s.initials} aria-hidden="true">{name.split(" ").map(part => part[0]).join("")}</span> : null}</div>
        <div><p className={s.position}>{position}</p><h3>{name}</h3><p className={s.role}>{role}</p></div><p className={s.bio}>{description}</p>
      </article>)}</div>
    </div></section>

    <section className={s.dark}><div className={`container ${s.split}`}>
      <div><p className={s.eyebrow}>WORKING WITH US</p><h2>Clear responsibility.<br /><em>Visible progress. Continued support.</em></h2>
        <p className={s.copy}>Projects follow an agreed scope, with progress available through our client portal and email notifications.</p>
        <p className={s.copy}>Beyond completion, we support updates, improvements and ongoing promotion through suitable service arrangements.</p>
      </div><div className={s.frame}><SectionVisual data={visuals["about.values"]} label="Project coordination and client visibility" /></div>
    </div></section>

    <section className={s.section}><div className="container">
      <div className={s.heading}><p className={s.eyebrow}>SELECTED WORK</p><h2>Our capabilities, reflected<br /><em>in our work.</em></h2></div>
      <div className={s.projects}>{variantContent.work.slice(0, 2).map(project => <a className={s.project} key={project.url} href={project.liveUrl} target="_blank" rel="noopener noreferrer">
        <div className={s.projectImage}><img src={project.image} alt={project.imageAlt} loading="lazy" width={960} height={600} /></div>
        <div className={s.projectCaption}><div><p className={s.position}>{project.category}</p><h3>{project.brand}</h3><p className={s.copy}>{project.description}</p></div><span aria-label="Visit website in a new tab">↗</span></div>
      </a>)}</div>
    </div></section>

    <section className={s.cta}><div className="container"><div><p className={s.eyebrow}>LET’S CONNECT</p><h2>Let’s understand what your<br />business needs <em>next.</em></h2><p className={s.copy}>Share your requirements with our team. We will help you define a practical way forward.</p></div><Link className={s.button} href="/contact">Start a conversation <span aria-hidden="true">↗</span></Link></div></section>
  </main><SiteFooter /></>;
}
