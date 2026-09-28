import Link from "next/link";
import { Suspense } from "react";
import { getSession } from "@/lib/auth";
import { portalAddresses, portalEntryFor } from "@/lib/portal";
import { ThemeToggle } from "@/components/theme-toggle";
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
      portal={session ? portalEntryFor(session.portalRoles, portalUrl) : null}
      portalApiUrl={apiUrl}
    />
  );
}

export function SiteHeader({ dark = false }: { dark?: boolean }) {
  return (
    <header className={`site-header ${dark ? "header-dark" : ""}`}>
      <div className="container header-inner">
        <Link className="brand" href="/">
          <span>mera</span>software<span className="brand-dot">.</span>
        </Link>
        <nav>
          <Link href="/services">Services</Link>
          <Link href="/work">Work</Link>
          <Link href="/blog">Blog</Link>
          <Link href="/community">Community</Link>
          <Link href="/about">About</Link>
        </nav>
        <div className="header-actions">
          <ThemeToggle />
          <Suspense fallback={<span className="session-link session-loading" />}>
            <SessionSlot />
          </Suspense>
          <Link className="nav-cta" href="/contact">
            Let&apos;s talk <span>↗</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
