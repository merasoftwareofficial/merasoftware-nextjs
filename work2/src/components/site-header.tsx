import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";

export function SiteHeader({ dark = false }: { dark?: boolean }) {
  return <header className={`site-header ${dark ? "header-dark" : ""}`}><div className="container header-inner"><Link className="brand" href="/"><span>mera</span>software<span className="brand-dot">.</span></Link><nav><Link href="/services">Services</Link><Link href="/work">Work</Link><Link href="/blog">Blog</Link><Link href="/community">Community</Link><Link href="/about">About</Link></nav><div className="header-actions"><ThemeToggle /><Link className="nav-cta" href="/contact">Let&apos;s talk <span>↗</span></Link></div></div></header>;
}
