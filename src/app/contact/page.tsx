import { BusinessLocation } from "@/components/business-location";
import { ContactForm } from "@/components/contact-form";
import s from "@/components/contact-form.module.css";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { faqs } from "@/lib/site-data";
import { pageMetadata } from "@/lib/page-seo";
import { phoneCountries } from "@/lib/phone-countries";
import { loadPageVisuals } from "@/lib/section-visuals";
import { SectionVisual } from "@/components/section-visual";

// Search details are editable at /admin/page-seo, so they are read per request.
export const revalidate = 3600;
export function generateMetadata() { return pageMetadata("contact"); }

export default async function Contact() {
  const [visuals, countries] = await Promise.all([loadPageVisuals("contact"), phoneCountries()]);
  return (
    <>
      <SiteHeader />
      <main>
        <section className="page-hero">
          <div className="container visual-page-hero">
            <div>
              <p className="eyebrow"><i /> CONTACT US</p>
              <h1>Tell us what your <em>business needs.</em></h1>
              <p>New to digital? You do not need technical knowledge. Share your requirement and our team will help you choose the right next step.</p>
              <div className={s.badges}>
                <span className={s.badge}><b>✓</b> Response within 1 business day</span>
                <span className={s.badge}><b>✓</b> Clear scope &amp; estimate</span>
              </div>
            </div>
            <SectionVisual data={visuals["contact.hero"]} label="Contact illustration" />
          </div>
        </section>

        <section id="contact-form" className="content-section section-soft">
          <div className={`container ${s.grid}`}>
            <div className={s.info}>
              <p className="eyebrow"><i /> PROJECT ENQUIRY</p>
              <h2>Have a project in mind? <em>Let&apos;s talk.</em></h2>
              <p className={s.lead}>Share what you are planning to build or promote. Our team will review your requirement and reach out with the right approach.</p>
              <div className={s.meta}>
                <div className={s.metaItem}>
                  <span className={s.metaIcon} aria-hidden="true">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>
                  </span>
                  <div className={s.metaText}>
                    <span className={s.metaLabel}>EMAIL</span>
                    <a className={s.metaValue} href="mailto:contact@merasoftware.com">contact@merasoftware.com</a>
                  </div>
                </div>
              </div>
              <a className={`button button-dark ${s.writeBtn}`} href="mailto:contact@merasoftware.com">Write us <span>→</span></a>
            </div>
            <ContactForm countries={countries} />
          </div>
        </section>

        <BusinessLocation />

        <section className="content-section section-soft">
          <div className="container">
            <div className="section-top"><p className="eyebrow"><i /> COMMON QUESTIONS</p></div>
            <div className="visual-feature">
              <div className="faq-list" style={{ marginTop: 40 }}>
                {faqs.map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}
              </div>
              <SectionVisual data={visuals["contact.faq"]} label="Questions illustration" />
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
