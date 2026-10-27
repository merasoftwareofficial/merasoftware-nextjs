"use client";

/**
 * The admin sidebar's links, in their configured order, with the open page
 * marked. The shell (admin-layout.tsx) stays a server component and passes only
 * the groups this role may see; this part exists because the /admin layout
 * persists through navigation, so only the client knows the current path.
 */

import Link from "@/components/link";
import { usePathname } from "next/navigation";

export type AdminNavItem = { label: string; href: string; also?: string[] };
export type AdminNavGroup = { title?: string; items: AdminNavItem[] };

/** "/admin" is every page's prefix, so Overview matches only itself. */
function under(pathname: string, path: string) {
  return pathname === path || (path !== "/admin" && pathname.startsWith(`${path}/`));
}

export function AdminNavLinks({ groups }: { groups: AdminNavGroup[] }) {
  const pathname = usePathname();
  return groups.flatMap(({ items }) =>
    items.map(({ label, href, also = [] }) => {
      const active = [href, ...also].some(path => under(pathname, path));
      return <Link key={href} href={href} className={active ? "active" : undefined} aria-current={active ? "page" : undefined}>{label}</Link>;
    })
  );
}
