"use client";

/**
 * The header menu on phones and tablets, where the inline nav is hidden
 * (globals.css, max-width 1024px). Without it a phone visitor could not reach
 * Services, Blog or About from the header at all.
 *
 * The links come from SiteHeader, so desktop and mobile always list the same
 * pages; a group (Pricing & Packages) lists its sub-pages under its name. The
 * panel closes on navigation, Escape and a tap outside it.
 */

import Link from "@/components/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export type MenuLink = [label: string, href: string];
export type MenuEntry = MenuLink | { label: string; links: MenuLink[] };

export function MobileMenu({ links }: { links: MenuEntry[] }) {
  const [open, setOpen] = useState(false);
  const [openedOn, setOpenedOn] = useState("");
  const pathname = usePathname();
  const box = useRef<HTMLDivElement>(null);

  // A route change closes the menu; tracked as state so no effect has to set state.
  const shown = open && openedOn === pathname;

  useEffect(() => {
    if (!shown) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    const onClick = (event: MouseEvent) => {
      if (box.current && !box.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("click", onClick);
    };
  }, [shown]);

  return (
    <div className="mobile-menu" ref={box}>
      <button
        className="menu-toggle"
        type="button"
        aria-expanded={shown}
        aria-controls="mobile-menu-panel"
        aria-label={shown ? "Close menu" : "Open menu"}
        onClick={() => {
          setOpenedOn(pathname);
          setOpen(!shown);
        }}
      >
        <span aria-hidden="true">{shown ? "✕" : "☰"}</span>
      </button>
      {shown ? (
        <nav className="mobile-menu-panel" id="mobile-menu-panel" aria-label="Main">
          {links.map(entry => Array.isArray(entry) ? (
            <Link key={entry[1]} href={entry[1]} aria-current={pathname === entry[1] ? "page" : undefined} onClick={() => setOpen(false)}>
              {entry[0]}
            </Link>
          ) : entry.links.length ? (
            <div className="mobile-menu-group" key={entry.label} role="group" aria-label={entry.label}>
              <span>{entry.label}</span>
              {entry.links.map(([label, href]) => (
                <Link key={href} href={href} aria-current={pathname === href ? "page" : undefined} onClick={() => setOpen(false)}>
                  {label}
                </Link>
              ))}
            </div>
          ) : null)}
          <Link className="mobile-menu-cta" href="/contact" onClick={() => setOpen(false)}>
            Let&apos;s talk <span>↗</span>
          </Link>
        </nav>
      ) : null}
    </div>
  );
}
