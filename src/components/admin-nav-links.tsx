"use client";

/**
 * The admin sidebar's links, in their configured order, with the open page
 * marked. The shell (admin-layout.tsx) stays a server component and passes only
 * the groups this role may see; this part exists because the /admin layout
 * persists through navigation, so only the client knows the current URL.
 *
 * An item with `sub` opens while the page is one of its pages and lists its
 * sub-tabs under it. The open group comes from the URL alone, so only one group
 * is open at a time and a fresh /admin shows every group collapsed.
 *
 * `soft` items stay on the page when they point at it: the Communication page
 * switches panels from its own URL, so a sidebar click there only changes the
 * URL and does not reload the page.
 */

import type { MouseEvent, ReactNode } from "react";
import Link from "@/components/link";
import { usePathname, useSearchParams } from "next/navigation";
import { communicationSectionOf } from "@/app/admin/communication/communication-sections";

export type AdminNavSub = { label: string; href: string; section?: string };
export type AdminNavItem = { label: string; href: string; also?: string[]; sub?: AdminNavSub[]; soft?: boolean };
export type AdminNavGroup = { title?: string; items: AdminNavItem[] };

/** "/admin" is every page's prefix, so Overview matches only itself. */
function under(pathname: string, path: string) {
  return pathname === path || (path !== "/admin" && pathname.startsWith(`${path}/`));
}

function pathOf(href: string) {
  return href.split("?")[0];
}

function NavRow({ href, label, active, soft, pathname, sub = false }: { href: string; label: string; active: boolean; soft: boolean; pathname: string; sub?: boolean }) {
  // Plain clicks on a soft link that points at this page only update the URL; the page follows it.
  const onClick = soft
    ? (event: MouseEvent<HTMLAnchorElement>) => {
        if (pathOf(href) !== pathname || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        window.history.pushState(null, "", href);
      }
    : undefined;
  return <Link href={href} onClick={onClick} className={[sub ? "admin-nav-sub" : "", active ? "active" : ""].filter(Boolean).join(" ") || undefined} aria-current={active ? "page" : undefined}>{label}</Link>;
}

export function AdminNavLinks({ groups }: { groups: AdminNavGroup[] }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const panel = params?.get("panel") ?? null;
  const tab = params?.get("tab") ?? null;
  const rows: ReactNode[] = [];
  for (const { items } of groups) {
    for (const { label, href, also = [], sub, soft = false } of items) {
      const active = [href, ...also].some(path => under(pathname, path));
      rows.push(<NavRow key={href} href={href} label={label} active={active} soft={soft} pathname={pathname} />);
      if (!sub || !active) continue;
      for (const child of sub) {
        // A Communication section is active by its panel; any other sub-tab by its page path (a nested page counts).
        const childActive = child.section !== undefined ? pathOf(child.href) === pathname && communicationSectionOf(panel, tab) === child.section : under(pathname, pathOf(child.href));
        rows.push(<NavRow key={child.href} href={child.href} label={child.label} active={childActive} soft={soft} pathname={pathname} sub />);
      }
    }
  }
  return rows;
}
