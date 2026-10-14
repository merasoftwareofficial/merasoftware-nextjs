import type { Metadata } from "next";
import Link from "@/components/link";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { StaffPackages } from "@/components/campaign/staff-packages";
import s from "@/components/campaign/campaign.module.css";
export const metadata: Metadata = { title: "Online promotion packages & pricing", description: "Compare Google visibility, social media management and website packages for your business.", robots: { index: false, follow: false } };
export default function Page() {
  return <><SiteHeader /><main className={s.page}><div className={s.wrap}><div style={{ paddingTop: 32, marginBottom: 24 }}><Link className="text-link" href="/">← Back to home</Link></div><StaffPackages /></div></main><SiteFooter /></>;
}
