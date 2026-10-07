/* eslint @next/next/no-img-element: off -- the logo is a static SVG in /public (see site-header.tsx). */
import Link from "@/components/link";
import { atLeast, type Role } from "@/lib/auth";
import { StaffAlerts } from "@/components/staff-alerts";
import { ThemeToggle } from "@/components/theme-toggle";

/** Every nav entry, with the lowest role that may open it. */
const navigation: [label: string, href: string, minimum: Role][] = [
  ["Overview", "/admin", "moderator"], ["Blog posts", "/admin/blog", "moderator"],
  ["Review queue", "/admin/blog/review", "moderator"],
  ["Categories", "/admin/categories", "admin"],
  ["Comments", "/admin/comments", "moderator"],
  ["Homepage", "/admin/homepage", "editor"], ["Section visuals", "/admin/visuals", "editor"], ["Services", "/admin/services", "editor"],
  ["Portfolio", "/admin/portfolio", "editor"], ["Testimonials", "/admin/testimonials", "editor"],
  ["FAQs", "/admin/faqs", "editor"], ["Leads", "/admin/leads", "editor"],
  ["Media library", "/admin/media", "editor"], ["SEO health", "/admin/seo", "editor"], ["Page SEO", "/admin/page-seo", "editor"], ["Site settings", "/admin/settings", "admin"],
  ["Users", "/admin/users", "admin"],
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
export function AdminLayout({ children, role = "visitor", pushKey = null }: { children: React.ReactNode; role?: Role; pushKey?: string | null }) {
  const visible = navigation.filter(([, , minimum]) => atLeast(role, minimum));
  return <div className="admin-shell"><aside className="admin-nav"><Link className="brand brand-logo admin-brand" href="/"><img className="logo-on-light" src="/brand/merasoftware-logo.svg" alt="Mera Software — Digital Solutions" width={2130} height={365} /><img className="logo-on-dark" src="/brand/merasoftware-logo-dark.svg" alt="Mera Software — Digital Solutions" width={2130} height={365} /></Link>{visible.map(([label, href]) => <Link key={href} href={href}>{label}</Link>)}<ThemeToggle /><Link href="/">View website ↗</Link></aside>{children}{pushKey ? <StaffAlerts publicKey={pushKey} /> : null}</div>;
}

export function AdminHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) {
  return <header className="admin-page-header"><div><p className="eyebrow"><i /> {eyebrow}</p><h1>{title}</h1><p className="admin-subtitle">{description}</p></div>{action}</header>;
}
