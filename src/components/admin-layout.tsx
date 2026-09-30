import Link from "@/components/link";
import { atLeast, type Role } from "@/lib/auth";
import { ThemeToggle } from "@/components/theme-toggle";

/**
 * Every nav entry, with the lowest role that may open it.
 *
 * Only screens that save what they show are listed. Services, Portfolio,
 * Testimonials, FAQs and Leads are still placeholder
 * screens whose buttons save nothing, so they stay out of the menu until each
 * is built for real; their routes are left in place.
 */
const navigation: [label: string, href: string, minimum: Role][] = [
  ["Overview", "/admin", "moderator"], ["Blog posts", "/admin/blog", "moderator"],
  ["Review queue", "/admin/blog/review", "moderator"],
  ["Categories", "/admin/categories", "admin"],
  ["Comments", "/admin/comments", "moderator"],
  ["Homepage", "/admin/homepage", "editor"],
  ["Media library", "/admin/media", "editor"], ["Site settings", "/admin/settings", "admin"],
  ["Users", "/admin/users", "admin"],
];

/**
 * `role` comes from the signed-in user. The panel is staff-only; hiding what a
 * role cannot open keeps them out of pages that would only answer "Not allowed"
 * — every page still checks for itself (requireStaffPage).
 */
export function AdminLayout({ children, role = "visitor" }: { children: React.ReactNode; role?: Role }) {
  const visible = navigation.filter(([, , minimum]) => atLeast(role, minimum));
  return <div className="admin-shell"><aside className="admin-nav"><Link className="brand" href="/"><span>mera</span>software<span className="brand-dot">.</span></Link>{visible.map(([label, href]) => <Link key={href} href={href}>{label}</Link>)}<ThemeToggle /><Link href="/">View website ↗</Link></aside>{children}</div>;
}

export function AdminHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) {
  return <header className="admin-page-header"><div><p className="eyebrow"><i /> {eyebrow}</p><h1>{title}</h1><p className="admin-subtitle">{description}</p></div>{action}</header>;
}
