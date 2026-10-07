import type { Metadata } from "next";
import Link from "@/components/link";
import { AdminHeader } from "@/components/admin-layout";
import { requireStaffPage } from "@/lib/auth";
import s from "./variants.module.css";

export const metadata: Metadata = { title: "Homepage variants", robots: { index: false, follow: false } };
export default async function HomepageVariants() {
  await requireStaffPage("/admin/homepage-variants", "editor");
  return <main className="admin-main"><AdminHeader eyebrow="SAVED DESIGNS" title="Homepage variants" description="Browse saved homepage designs and open their full previews."/><article className={s.card}><div className={s.preview}><iframe src="/preview/homepage-variants/digital-presence" title="Digital Presence homepage design preview" loading="lazy" tabIndex={-1}/></div><div className={s.content}><span className={s.badge}>VARIANT 01 · SAVED</span><h2>Digital Presence</h2><p>The original saved English design: white, navy and teal, website and social media visuals, service cards, starting prices and a contact section.</p><dl><div><dt>Language</dt><dd>English</dd></div><div><dt>Layout</dt><dd>Desktop & mobile</dd></div><div><dt>Status</dt><dd>Preview only</dd></div></dl><Link className={s.button} href="/preview/homepage-variants/digital-presence" target="_blank" rel="noreferrer">Open full preview ↗</Link><p className={s.note}>The current homepage is unchanged. This saved variant is independent of the campaign page.</p></div></article></main>;
}
