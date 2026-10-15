/* eslint @next/next/no-img-element: off -- the logo is a static SVG in /public (see site-header.tsx). */
import Link from "@/components/link";
import { notifyOffered } from "@/components/subscribe/notify-strip";
import { BRAND_LOGO } from "@/lib/brand";
import { FEATURES } from "@/lib/features";

// The "Stay updated" band lives on /blog only (see NotifyStrip); the footer keeps a plain "Get notified" link.
export function SiteFooter() { const notify = notifyOffered(); return <footer className="site-footer"><div className="container footer-top"><div><Link className="brand brand-logo" href="/"><img src={BRAND_LOGO.dark} alt={BRAND_LOGO.alt} width={BRAND_LOGO.width} height={BRAND_LOGO.height} loading="lazy" /></Link><p>Helping local businesses get online with websites, apps, business software and digital marketing.</p></div><div><p className="footer-label">EXPLORE</p><Link href="/services">Services</Link>{FEATURES.portfolio ? <Link href="/work">Our work</Link> : null}<Link href="/blog">Blog</Link>{notify ? <Link href="/subscribe">Get notified</Link> : null}</div><div><p className="footer-label">CONTACT</p><a href="mailto:contact@merasoftware.com">contact@merasoftware.com</a><Link href="/contact">Start a project ↗</Link></div></div><div className="container footer-bottom"><span>© 2026 Mera Software</span><Link href="/privacy">Privacy</Link><Link href="/admin">Admin</Link></div></footer>; }
