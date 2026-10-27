/* eslint @next/next/no-img-element: off -- the logo is a static SVG in /public (see site-header.tsx). */
import Link from "@/components/link";
import { BRAND_LOGO } from "@/lib/brand";
import { atLeast, type Role } from "@/lib/auth";
import { StaffAlerts } from "@/components/staff-alerts";
import { ThemeToggle } from "@/components/theme-toggle";
import { AdminNavLinks, type AdminNavGroup, type AdminNavItem } from "@/components/admin-nav-links";

/**
 * Every nav entry, grouped so related work sits together, with the lowest role
 * that may open it. `also` = pages reached from inside that entry, which keep it
 * marked as the open one.
 */
const navigation: { title?: string; items: (AdminNavItem & { minimum: Role })[] }[] = [
  { items: [{ label: "Overview", href: "/admin", minimum: "moderator" }] },
  { title: "Business", items: [
    { label: "Leads", href: "/admin/leads", minimum: "editor" },
    { label: "Offers", href: "/admin/offers", minimum: "admin", also: ["/admin/packages"] },
    { label: "Communication", href: "/admin/communication", minimum: "admin", also: ["/admin/email-control", "/admin/whatsapp"] },
  ] },
  { title: "Website", items: [
    { label: "Website Content", href: "/admin/content", minimum: "editor" },
    { label: "Homepage variants", href: "/admin/homepage-variants", minimum: "editor" },
    { label: "Section visuals", href: "/admin/visuals", minimum: "editor" },
    { label: "Portfolio", href: "/admin/portfolio", minimum: "editor" },
    { label: "Media library", href: "/admin/media", minimum: "editor" },
  ] },
  { title: "Blog", items: [{ label: "Blog Management", href: "/admin/blog-management", minimum: "moderator", also: ["/admin/blog", "/admin/comments", "/admin/categories", "/admin/users"] }] },
  { title: "SEO", items: [
    { label: "SEO health", href: "/admin/seo", minimum: "editor" },
    { label: "Page SEO", href: "/admin/page-seo", minimum: "editor" },
  ] },
  { title: "Settings", items: [{ label: "Site settings", href: "/admin/settings", minimum: "admin" }] },
];

/**
 * `role` comes from the signed-in user. The panel is staff-only; hiding what a
 * role cannot open keeps them out of pages that would only answer "Not allowed"
 * — every page still checks for itself (requireStaffPage).
 *
 * `pushKey` is the VAPID public key, passed only for an admin while push is
 * configured: then the admin-alert card asks this browser for permission
 * (owner decision, 3 Oct 2026: alerts go to admins only).
 */
export function AdminLayout({ children, role = "visitor", pushKey = null, salesAdmin = false }: { children: React.ReactNode; role?: Role; pushKey?: string | null; salesAdmin?: boolean }) {
  // A group whose entries this role cannot open is dropped, heading and all.
  const visible: AdminNavGroup[] = navigation
    .map(({ title, items }) => ({ title, items: items.filter(({ href, minimum }) => atLeast(role, minimum) && (href !== "/admin/offers" || salesAdmin)).map(({ label, href, also }) => ({ label, href, also })) }))
    .filter(group => group.items.length);
  return <div className="admin-shell"><aside className="admin-nav"><Link className="brand brand-logo admin-brand" href="/"><img className="logo-on-light" src={BRAND_LOGO.light} alt={BRAND_LOGO.alt} width={BRAND_LOGO.width} height={BRAND_LOGO.height} /><img className="logo-on-dark" src={BRAND_LOGO.dark} alt={BRAND_LOGO.alt} width={BRAND_LOGO.width} height={BRAND_LOGO.height} /></Link><AdminNavLinks groups={visible} /><ThemeToggle /><Link href="/">View website ↗</Link></aside>{children}{pushKey ? <StaffAlerts publicKey={pushKey} /> : null}</div>;
}

export function AdminHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) {
  return <header className="admin-page-header"><div><p className="eyebrow"><i /> {eyebrow}</p><h1>{title}</h1><p className="admin-subtitle">{description}</p></div>{action}</header>;
}
