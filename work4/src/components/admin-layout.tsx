import Link from "next/link";

const navigation = [
  ["Overview", "/admin"], ["Blog posts", "/admin/blog"], ["Categories & tags", "/admin/categories"],
  ["Homepage", "/admin/homepage"], ["Services", "/admin/services"], ["Portfolio", "/admin/portfolio"],
  ["Testimonials", "/admin/testimonials"], ["FAQs", "/admin/faqs"], ["Leads", "/admin/leads"],
  ["Media library", "/admin/media"], ["Site settings", "/admin/settings"], ["Users", "/admin/users"],
];

export function AdminLayout({ children }: { children: React.ReactNode }) {
  return <div className="admin-shell"><aside className="admin-nav"><Link className="brand" href="/"><span>mera</span>software<span className="brand-dot">.</span></Link>{navigation.map(([label, href]) => <Link key={href} href={href}>{label}</Link>)}<Link href="/">View website ↗</Link></aside>{children}</div>;
}

export function AdminHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) {
  return <header className="admin-page-header"><div><p className="eyebrow"><i /> {eyebrow}</p><h1>{title}</h1><p className="admin-subtitle">{description}</p></div>{action}</header>;
}
