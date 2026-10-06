import Link from "@/components/link";
import { Suspense } from "react";
import { getSession } from "@/lib/auth";
import { portalAddresses, portalEntryFor } from "@/lib/portal";
import { MobileMenu } from "@/components/mobile-menu";
import { FEATURES } from "@/lib/features";
import { SessionMenu } from "@/components/session-menu";

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
const NAV_LINKS: [label: string, href: string][] = [
  ["Services", "/services"],
  ...(FEATURES.portfolio ? [["Work", "/work"] as [string, string]] : []),
  ["Blog", "/blog"],
  ["Community", "/community"],
  ["About", "/about"],
];

export function SiteHeader({ dark = true }: { dark?: boolean }) {
  return (
    <header className={`site-header ${dark ? "header-dark" : ""}`}>
      <div className="container header-inner">
        <Link className="brand brand-logo" href="/">
          {/* Static SVG (text already converted to paths), so it needs no font and the browser caches it. */}
          {/* eslint-disable-next-line @next/next/no-img-element -- next/image does not serve SVG without dangerouslyAllowSVG. */}
          <img src={dark ? "/brand/merasoftware-logo-dark.svg" : "/brand/merasoftware-logo.svg"} alt="Mera Software — Digital Solutions" width={2130} height={365} />
        </Link>
        <nav>
          {NAV_LINKS.map(([label, href]) => (
            <Link key={href} href={href}>
              {label}
            </Link>
          ))}
        </nav>
        <div className="header-actions">
          <Suspense fallback={<span className="session-link session-loading" />}>
            <SessionSlot />
          </Suspense>
          <Link className="nav-cta" href="/contact">
            Let&apos;s talk <span>↗</span>
          </Link>
          <MobileMenu links={NAV_LINKS} />
        </div>
      </div>
    </header>
  );
}
