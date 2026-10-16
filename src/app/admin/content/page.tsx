import Link from "@/components/link";
import { AdminHeader } from "@/components/admin-layout";
import { requireStaffPage } from "@/lib/auth";
import { CONTENT_PAGES } from "@/lib/website-content";
import { HomepageImageEditor } from "@/app/admin/homepage/homepage-image-editor";
import { DEFAULT_HOMEPAGE_CONTENT } from "@/lib/homepage-content";
import { settingsRepo, mediaRepo } from "@/lib/repo";
import { linkGroups } from "@/lib/link-options";
import s from "./content.module.css";
import { PageSectionEditor } from "./page-section-editor";
import { resolveAbout, resolveServices, sectionVisualIds, type ManagedPage } from "@/lib/page-content";
import { OffersManager } from "./offers-manager";
import { resolvedOffers, DEFAULT_UNIVERSAL_TERMS, DEFAULT_OFFER_LISTING } from "@/lib/offers";

export const metadata = { title: "Website Content — Admin" };
export default async function WebsiteContent({ searchParams }: { searchParams: Promise<{ page?: string; section?: string }> }) {
  const user = await requireStaffPage("/admin/content", "editor");
  const query = await searchParams;
  const page = CONTENT_PAGES.find(item => item.id === query.page) ?? CONTENT_PAGES[0];
  const section = page.sections.find(item => item.id === query.section) ?? page.sections[0];
  const home = section.homeSection ? await Promise.all([settingsRepo.get(), mediaRepo.list(), linkGroups()]) : null;
  const managedPage: ManagedPage | undefined = page.id === "about" || page.id === "services" ? page.id : undefined;
  const managed = managedPage ? await Promise.all([settingsRepo.get(), mediaRepo.list(), linkGroups()]) : null;
  const resolved = managed && managedPage ? managedPage === "about" ? resolveAbout(managed[0]) : resolveServices(managed[0]) : undefined;
  const managedContent = resolved ? (resolved as unknown as Record<string, unknown>)[section.id] : undefined;
  const managedVisuals = managed && managedPage ? Object.fromEntries(sectionVisualIds(managedPage, section.id, managedContent).flatMap(slot => managed[0].sectionVisuals?.[slot] ? [[slot, managed[0].sectionVisuals[slot]]] : [])) : {};
  const offerSettings = page.id === "offers" ? await settingsRepo.get() : null;
  return <main className="admin-main">
    <AdminHeader eyebrow="SITE CONTENT" title="Website Content" description="Choose a page and section to manage its content. About and Services include their visual controls below." action={<Link className="admin-button" href="/admin/visuals">Section visuals ↗</Link>} />
    <div className={s.layout}>
      <nav className={s.navigation} aria-label="Website content sections">
        {CONTENT_PAGES.map(group => <div className={s.group} key={group.id}>
          <h2>{group.label}</h2>
          {group.sections.map(item => <Link key={item.id} href={`/admin/content?page=${group.id}&section=${item.id}`} aria-current={group.id === page.id && item.id === section.id ? "page" : undefined}>{item.label}</Link>)}
        </div>)}
      </nav>
      <section className={s.editor} aria-labelledby="content-section-title">
        <div className={s.sectionHeader}><div><h2 id="content-section-title">{page.label} → {section.label}</h2><p>{section.description}</p></div><Link className="admin-action" href={page.href} target="_blank" rel="noreferrer">View page ↗</Link></div>
        {section.editor && <p><Link className="admin-action" href={section.editor.href}>{section.editor.label} →</Link></p>}
        {managed && managedPage && managedContent ? <PageSectionEditor key={`${page.id}.${section.id}`} page={managedPage} section={section.id} initial={managedContent} initialVisuals={managedVisuals} assets={managed[1]} links={managed[2]} /> : offerSettings ? <OffersManager key={section.id} section={section.id} initialOffers={resolvedOffers(offerSettings.offers)} initialTerms={offerSettings.offerUniversalTerms ?? DEFAULT_UNIVERSAL_TERMS} initialListing={offerSettings.offerListing ?? DEFAULT_OFFER_LISTING} /> : home && section.homeSection ? <HomepageImageEditor embedded key={`${page.id}.${section.id}`} initialSection={section.homeSection} initialContent={home[0].homepageContent ?? DEFAULT_HOMEPAGE_CONTENT} initialImages={home[0].homepageImages ?? {}} assets={home[1]} links={home[2]} role={user.role} /> : section.editor ? <div className={s.status}><p>Manage these entries in their existing editor. Published entries appear on the website.</p></div> : <div className={s.status}><span className={s.badge}>Not yet editable</span><p>This content is currently maintained in the website source. Admin editing is not connected yet.</p>{section.reference && <Link className="admin-action" href={section.reference.href}>{section.reference.label} →</Link>}</div>}
      </section>
    </div>
  </main>;
}
