import { BUSINESS_LOCATION } from "@/lib/business-location";
import { LocationPin } from "@/components/business-location";
import Link from "@/components/link";
import { BRAND_LOGO } from "@/lib/brand";
import { Suspense } from "react";
import { getSession } from "@/lib/auth";
import { portalAddresses, portalEntryFor } from "@/lib/portal";
import { MobileMenu, type MenuEntry, type MenuLink } from "@/components/mobile-menu";
import { NavDropdown } from "@/components/nav-dropdown";
import { packagePagePath } from "@/lib/package-pages";
import { readPackagePages } from "@/lib/package-pages-server";
import { PLANS_PAGE_PATH, PLANS_PAGE_TITLE } from "@/lib/public-plans";
import { FEATURES } from "@/lib/features";
import { SessionMenu } from "@/components/session-menu";
import { HeaderScroll } from "@/components/header-scroll";

/**
 * Reads the session cookie. Kept in its own component behind <Suspense> so the
 * rest of every page can still be prerendered — only this slot is dynamic.
 */
async function SessionSlot() {
  const session = await getSession();
  const { apiUrl, portalUrl } = portalAddresses();
  const user = session?.user;
  // Portal admin shows "admin" (already the role here), a portal customer "customer", everyone else their blog role.
  const badge = user?.role !== "admin" && session?.portalRoles.includes("customer") ? "customer" : user?.role;
  return (
    <SessionMenu
      user={user && badge ? { displayName: user.displayName, username: user.username, role: user.role, badge } : null}
      portal={session ? portalEntryFor(session.portalActiveRole, portalUrl) : null}
      portalApiUrl={apiUrl}
    />
  );
}

/** The main pages, shared by the inline nav and the phone menu. */
const NAV_LINKS: MenuLink[] = [
  ["Services", "/services"],
  ...(FEATURES.portfolio ? [["Work", "/work"] as MenuLink] : []),
  ["Blog", "/blog"],
  ["Community", "/community"],
  ["About", "/about"],
];

/**
 * The menu with "Packages" after Services, listing the admin-made package pages
 * (lib/package-pages.ts). null = still loading: the entry shows without sub-pages, so the
 * header does not shift; with no pages at all it is left out.
 */
function navEntries(packageLinks: MenuLink[] | null): MenuEntry[] {
  const [services, ...rest] = NAV_LINKS;
  if (packageLinks && !packageLinks.length) return NAV_LINKS;
  return [services, { label: "Packages", links: packageLinks ?? [] }, ...rest];
}

async function packageLinks(): Promise<MenuLink[]> {
  // The header is on every public page; a failed read hides the package sub-pages, never the page.
  // The plans page (lib/public-plans.ts) is a fixed page, so it is always listed, last.
  let pages: MenuLink[] = [];
  try { pages = (await readPackagePages()).map(page => [page.title, packagePagePath(page.slug)]); }
  catch { /* package pages hidden */ }
  return [...pages, [PLANS_PAGE_TITLE, PLANS_PAGE_PATH]];
}

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
          <a className="header-location" href={BUSINESS_LOCATION.directionsUrl} target="_blank" rel="noopener noreferrer" aria-label="Location — open directions in Google Maps"><LocationPin /><span>Location</span></a>
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
