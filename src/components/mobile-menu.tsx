"use client";

/**
 * The header menu on phones and tablets, where the inline nav is hidden
 * (globals.css, max-width 1024px). Without it a phone visitor could not reach
 * Services, Blog or About from the header at all.
 *
 * The links come from SiteHeader, so desktop and mobile always list the same
 * pages. The panel closes on navigation, Escape and a tap outside it.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export function MobileMenu({ links }: { links: [label: string, href: string][] }) {
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
          {links.map(([label, href]) => (
            <Link key={href} href={href} aria-current={pathname === href ? "page" : undefined} onClick={() => setOpen(false)}>
              {label}
            </Link>
          ))}
          <Link className="mobile-menu-cta" href="/contact" onClick={() => setOpen(false)}>
            Let&apos;s talk <span>↗</span>
          </Link>
        </nav>
      ) : null}
    </div>
  );
}
