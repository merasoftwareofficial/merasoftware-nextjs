import Link from "@/components/link";
import { BRAND_LOGO } from "@/lib/brand";
import { Suspense } from "react";
import { portalAddresses } from "@/lib/portal";
import { MobileMenu, type MenuEntry, type MenuLink } from "@/components/mobile-menu";
import { NavDropdown } from "@/components/nav-dropdown";
import { packageMenuLinks } from "@/lib/package-pages-server";
import { FEATURES } from "@/lib/features";
import { SessionMenu } from "@/components/session-menu";
import { HeaderScroll } from "@/components/header-scroll";

function SessionSlot() {
  const { apiUrl } = portalAddresses();
  return <SessionMenu portalApiUrl={apiUrl} />;
}

const SERVICE_LINKS: MenuLink[] = [
  ["All Services", "/services"],
  ["Websites & Software", "/services/website-development"],
  ["Online Setup & Search", "/services/seo"],
  ["Content & Promotion", "/services/performance-marketing"],
];

const COMMUNITY_LINKS: MenuLink[] = [
  ["Blog", "/blog"],
  ["Community", "/community"],
];

const ABOUT_LINKS: MenuLink[] = [
  ["About Us", "/about"],
  ...(FEATURES.portfolio ? [["Our Work", "/work"] as MenuLink] : []),
  ["Contact Us", "/contact"],
];

/**
 * Compact 5-item header menu shared by desktop nav and mobile menu:
 * Home · Services (dropdown) · Packages (dropdown, omitted if empty) · Community (dropdown) · About (dropdown).
 */
function navEntries(packageLinks: MenuLink[] | null): MenuEntry[] {
  const entries: MenuEntry[] = [
    ["Home", "/"],
    { label: "Services", links: SERVICE_LINKS },
  ];
  if (!packageLinks || packageLinks.length > 0) {
    entries.push({ label: "Packages", links: packageLinks ?? [] });
  }
  entries.push(
    { label: "Community", links: COMMUNITY_LINKS },
    { label: "About", links: ABOUT_LINKS },
  );
  return entries;
}

/** The header is on every public page; the list itself lives in lib/package-pages-server.ts (shared with the footer). */
const packageLinks = packageMenuLinks;

function NavLinks({ entries }: { entries: MenuEntry[] }) {
  return (
    <nav>
      {entries.map(entry => Array.isArray(entry)
        ? <Link key={entry[1]} href={entry[1]}>{entry[0]}</Link>
        : <NavDropdown key={entry.label} label={entry.label} links={entry.links} />)}
    </nav>
  );
}

async function NavSlot() {
  return <NavLinks entries={navEntries(await packageLinks())} />;
}

async function MobileMenuSlot() {
  return <MobileMenu links={navEntries(await packageLinks())} />;
}

export function SiteHeader({ dark = true }: { dark?: boolean }) {
  return (
    <header className={`site-header ${dark ? "header-dark" : "header-light"}`}>
      <HeaderScroll />
      <div className="container header-inner">
        <Link className="brand brand-logo" href="/">
          {/* Static SVGs (text already converted to paths): no font needed, cached by the browser. CSS shows the version matching the header background, including while scrolling. */}
          {/* eslint-disable-next-line @next/next/no-img-element -- next/image does not serve SVG without dangerouslyAllowSVG. */}
          <img className="logo-on-dark" src={BRAND_LOGO.dark} alt={BRAND_LOGO.alt} width={BRAND_LOGO.width} height={BRAND_LOGO.height} />
          {/* eslint-disable-next-line @next/next/no-img-element -- as above. */}
          <img className="logo-on-light" src={BRAND_LOGO.light} alt={BRAND_LOGO.alt} width={BRAND_LOGO.width} height={BRAND_LOGO.height} />
        </Link>
        <Suspense fallback={<NavLinks entries={navEntries(null)} />}>
          <NavSlot />
        </Suspense>
        <div className="header-actions">
          <Suspense fallback={<span className="session-link session-loading" />}>
            <SessionSlot />
          </Suspense>
          <Link className="nav-cta" href="/contact">
            Let&apos;s talk <span>↗</span>
          </Link>
          <Suspense fallback={<MobileMenu links={navEntries(null)} />}>
            <MobileMenuSlot />
          </Suspense>
        </div>
      </div>
    </header>
  );
}
