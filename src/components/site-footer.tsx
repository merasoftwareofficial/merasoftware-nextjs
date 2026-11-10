import { Suspense } from "react";
import { BUSINESS_LOCATION } from "@/lib/business-location";
/* eslint @next/next/no-img-element: off -- the logo is a static SVG in /public (see site-header.tsx). */
import Link from "@/components/link";
import { notifyOffered } from "@/components/subscribe/notify-strip";
import { BRAND_LOGO } from "@/lib/brand";
import { FEATURES } from "@/lib/features";
import { services } from "@/lib/site-data";
import { PLANS_PAGE_PATH, PLANS_PAGE_TITLE } from "@/lib/public-plans";
import { packageMenuLinks } from "@/lib/package-pages-server";
import { settingsRepo } from "@/lib/repo";
import { socialLinks } from "@/lib/social-links";
import { SocialIcon } from "@/components/social-icons";

/** "01 / WEBSITES & SOFTWARE" → "Websites & Software" (the service's own eyebrow, so no new copy). */
function serviceLabel(eyebrow: string) {
  return eyebrow.replace(/^\d+\s*\/\s*/, "").toLowerCase().replace(/(^|[\s&])([a-z])/g, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}

/** Social icons from Admin → Page SEO → Business details, plus WhatsApp. Empty list = no row. */
async function SocialRow() {
  let profiles: string[] = [];
  try { profiles = (await settingsRepo.get()).organization?.sameAs ?? []; }
  catch { /* the icons are optional; the rest of the footer still shows */ }
  const links = socialLinks(profiles, BUSINESS_LOCATION.whatsapp);
  if (!links.length) return null;
  return (
    <ul className="footer-social" aria-label="Our profiles">
      {links.map(link => (
        <li key={link.platform}>
          <a href={link.href} target="_blank" rel="noopener noreferrer" aria-label={`Mera Software on ${link.label}`} title={link.label}>
            <SocialIcon platform={link.platform} />
          </a>
        </li>
      ))}
    </ul>
  );
}

/** The package pages from the header's own list, then Plans. A failed read still shows Plans. */
async function PackageLinks() {
  const links = await packageMenuLinks();
  return <>{links.map(([label, href]) => <Link key={href} href={href}>{label}</Link>)}</>;
}

export function SiteFooter() {
  const notify = notifyOffered();
  const year = new Date().getFullYear();
  return (
    <footer className="site-footer">
      <div className="container footer-cta">
        <p>Have a project in mind? Let&apos;s talk about it.</p>
        <div className="footer-cta-actions">
          <Link className="button" href="/contact">Start a project <span>↗</span></Link>
          <a className="footer-cta-whatsapp" href={`https://wa.me/${BUSINESS_LOCATION.whatsapp}`} target="_blank" rel="noopener noreferrer">Chat on WhatsApp</a>
        </div>
      </div>

      <div className="container footer-top">
        <div>
          <Link className="brand brand-logo" href="/">
            <img src={BRAND_LOGO.dark} alt={BRAND_LOGO.alt} width={BRAND_LOGO.width} height={BRAND_LOGO.height} loading="lazy" />
          </Link>
          <p>Helping local businesses get online with websites, apps, business software and digital marketing.</p>
          <Suspense fallback={null}><SocialRow /></Suspense>
        </div>

        <nav aria-label="Services">
          <p className="footer-label">SERVICES</p>
          {services.map(service => <Link key={service.slug} href={`/services/${service.slug}`}>{serviceLabel(service.eyebrow)}</Link>)}
        </nav>

        <nav aria-label="Packages">
          <p className="footer-label">PACKAGES</p>
          <Suspense fallback={<Link href={PLANS_PAGE_PATH}>{PLANS_PAGE_TITLE}</Link>}><PackageLinks /></Suspense>
        </nav>

        <nav aria-label="Company">
          <p className="footer-label">COMPANY</p>
          <Link href="/about">About</Link>
          {FEATURES.portfolio ? <Link href="/work">Our work</Link> : null}
          <Link href="/blog">Blog</Link>
          <Link href="/community">Community</Link>
          {notify ? <Link href="/subscribe">Get notified</Link> : null}
          <Link href="/contact">Contact Us</Link>
        </nav>

        <div>
          <p className="footer-label">CONTACT</p>
          <a href="mailto:contact@merasoftware.com">contact@merasoftware.com</a>
          <a href={`https://wa.me/${BUSINESS_LOCATION.whatsapp}`} target="_blank" rel="noopener noreferrer">+91 96530 13530</a>
          <address className="footer-address">{BUSINESS_LOCATION.shortAddress}</address>
          <a href={BUSINESS_LOCATION.directionsUrl} target="_blank" rel="noopener noreferrer">View location ↗</a>
        </div>
      </div>

      <div className="container footer-bottom">
        <span>© {year} Mera Software</span>
        <Link href="/terms">Terms &amp; Conditions</Link>
        <Link href="/privacy">Privacy</Link>
      </div>
    </footer>
  );
}
