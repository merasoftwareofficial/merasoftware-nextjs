import Link from "@/components/link";
import { FEATURES } from "@/lib/features";
import { mailConfigured } from "@/lib/mailer";
import { pushConfigured } from "@/lib/push";

export function SiteFooter() { return <footer className="site-footer"><div className="container footer-top"><div><Link className="brand" href="/"><span>mera</span>software<span className="brand-dot">.</span></Link><p>Digital marketing, software &amp; web development for businesses moving forward.</p></div><div><p className="footer-label">EXPLORE</p><Link href="/services">Services</Link>{FEATURES.portfolio ? <Link href="/work">Our work</Link> : null}<Link href="/blog">Blog</Link>{pushConfigured() || mailConfigured() ? <Link href="/subscribe">Get notified</Link> : null}</div><div><p className="footer-label">CONTACT</p><a href="mailto:contact@merasoftware.com">contact@merasoftware.com</a><Link href="/contact">Start a project ↗</Link></div></div><div className="container footer-bottom"><span>© 2026 Mera Software</span><Link href="/privacy">Privacy</Link><Link href="/admin">Admin</Link></div></footer>; }
