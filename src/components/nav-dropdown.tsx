"use client";

/**
 * A header menu entry with sub-pages (the "Pricing & Packages" menu). Opens on
 * hover or focus (globals.css) and on click/tap; Escape, a click outside and a
 * route change close it. Phones use the same links in MobileMenu instead.
 */

import Link from "@/components/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export function NavDropdown({ label, links }: { label: string; links: [label: string, href: string][] }) {
  const [openedOn, setOpenedOn] = useState<string | null>(null);
  const pathname = usePathname();
  const box = useRef<HTMLDivElement>(null);
  const open = openedOn === pathname;

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpenedOn(null);
    const onClick = (event: MouseEvent) => {
      if (box.current && !box.current.contains(event.target as Node)) setOpenedOn(null);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("click", onClick);
    };
  }, [open]);

  return (
    <div className="nav-dropdown" ref={box} data-open={open || undefined}>
      <button type="button" aria-expanded={open} aria-haspopup="true" onClick={() => setOpenedOn(open ? null : pathname)}>
        {label} <span aria-hidden="true">▾</span>
      </button>
      {links.length ? (
        <div className="nav-dropdown-panel">
          {links.map(([text, href]) => (
            <Link key={href} href={href} aria-current={pathname === href ? "page" : undefined} onClick={() => setOpenedOn(null)}>
              {text}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
