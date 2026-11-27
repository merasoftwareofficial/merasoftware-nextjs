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

import { useEffect, useSyncExternalStore, type MouseEvent } from "react";
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

function NavIcon({ href }: { href: string }) {
  const props = { className: "admin-nav-icon", width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.85, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true as const };
  switch (href) {
    case "/admin": return <svg {...props}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>;
    case "/admin/leads": return <svg {...props}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>;
    case "/admin/packages": return <svg {...props}><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" /><path d="m3.3 7 8.7 5 8.7-5" /><path d="M12 22V12" /></svg>;
    case "/admin/communication": return <svg {...props}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>;
    case "/admin/content": return <svg {...props}><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18" /><path d="M9 21V9" /></svg>;
    case "/admin/blog-management": return <svg {...props}><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>;
    case "/admin/seo": return <svg {...props}><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>;
    case "/admin/page-seo": return <svg {...props}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M8 13h8" /><path d="M8 17h5" /></svg>;
    case "/admin/bandwidth": return <svg {...props}><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg>;
    case "/admin/settings": return <svg {...props}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>;
    default: return null;
  }
}

function NavRow({ href, label, active, soft, pathname, sub = false, hasSub = false }: { href: string; label: string; active: boolean; soft: boolean; pathname: string; sub?: boolean; hasSub?: boolean }) {
  // Plain clicks on a soft link that points at this page only update the URL; the page follows it.
  const onClick = soft
    ? (event: MouseEvent<HTMLAnchorElement>) => {
        if (pathOf(href) !== pathname || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        window.history.pushState(null, "", href);
      }
    : undefined;
  return <Link href={href} title={label} onClick={onClick} className={[sub ? "admin-nav-sub" : "", active ? "active" : ""].filter(Boolean).join(" ") || undefined} aria-current={active ? "page" : undefined} aria-expanded={hasSub ? active : undefined}>
    {!sub && <NavIcon href={href} />}
    <span className="admin-nav-label">{label}</span>
    {hasSub && <svg className="admin-nav-chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>}
  </Link>;
}

export function AdminNavLinks({ groups }: { groups: AdminNavGroup[] }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const panel = params?.get("panel") ?? null;
  const tab = params?.get("tab") ?? null;
  return <>{groups.map(({ title, items }, index) => (
    <div key={title ?? `group-${index}`} className="admin-nav-group">
      {index > 0 && <hr className="admin-nav-sep" />}
      {items.map(({ label, href, also = [], sub, soft = false }) => {
        const active = [href, ...also].some(path => under(pathname, path));
        return <div key={href} className="admin-nav-item">
          <NavRow href={href} label={label} active={active} soft={soft} pathname={pathname} hasSub={!!sub?.length} />
          {sub && active && <div className="admin-nav-sublist">
            {sub.map(child => {
              const childActive = child.section !== undefined ? pathOf(child.href) === pathname && communicationSectionOf(panel, tab) === child.section : under(pathname, pathOf(child.href));
              return <NavRow key={child.href} href={child.href} label={child.label} active={childActive} soft={soft} pathname={pathname} sub />;
            })}
          </div>}
        </div>;
      })}
    </div>
  ))}</>;
}

const WIDTH_KEY = "admin-nav-width";
const COLLAPSED_KEY = "admin-nav-collapsed";
const MIN_WIDTH = 190;
const MAX_WIDTH = 340;
const RAIL_WIDTH = 68;
const NAV_EVENT = "admin-nav-resize";

function readWidth() {
  try {
    const saved = Number(localStorage.getItem(WIDTH_KEY));
    return Number.isFinite(saved) && saved >= MIN_WIDTH && saved <= MAX_WIDTH ? saved : 240;
  } catch { return 240; }
}

function readCollapsed() {
  try { return localStorage.getItem(COLLAPSED_KEY) === "1"; } catch { return false; }
}

function subscribeNav(onChange: () => void) {
  window.addEventListener(NAV_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(NAV_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function applyShellWidth(width: number, collapsed: boolean) {
  const shell = document.querySelector<HTMLElement>(".admin-shell");
  if (!shell) return;
  shell.style.setProperty("--admin-nav-width", `${collapsed ? RAIL_WIDTH : width}px`);
  if (collapsed) shell.setAttribute("data-nav-collapsed", "true");
  else shell.removeAttribute("data-nav-collapsed");
}

export function AdminNavResizeControls() {
  const collapsed = useSyncExternalStore(subscribeNav, readCollapsed, () => false);

  useEffect(() => {
    applyShellWidth(readWidth(), collapsed);
  }, [collapsed]);

  const toggleCollapse = () => {
    const next = !collapsed;
    try { localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0"); } catch { /* ignore */ }
    applyShellWidth(readWidth(), next);
    window.dispatchEvent(new Event(NAV_EVENT));
  };

  const startResize = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    if (!document.querySelector(".admin-shell")) return;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    const onMove = (moveEvent: PointerEvent) => {
      const clamped = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(moveEvent.clientX)));
      applyShellWidth(clamped, false);
      try {
        localStorage.setItem(WIDTH_KEY, String(clamped));
        localStorage.setItem(COLLAPSED_KEY, "0");
      } catch { /* ignore */ }
      window.dispatchEvent(new Event(NAV_EVENT));
    };
    const onUp = () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return <>
    <button type="button" className="admin-nav-collapse" onClick={toggleCollapse} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} title={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {collapsed ? <path d="m9 18 6-6-6-6" /> : <path d="m15 18-6-6 6-6" />}
      </svg>
    </button>
    <div className="admin-nav-resizer" role="separator" aria-orientation="vertical" aria-label="Resize sidebar" title="Drag to resize sidebar" onPointerDown={startResize} />
  </>;
}
