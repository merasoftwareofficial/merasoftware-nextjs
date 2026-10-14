/* eslint @next/next/no-img-element: off -- existing static brand SVG. */
import type { Metadata } from "next";
import { StaffPackages } from "@/components/campaign/staff-packages";
import s from "@/components/campaign/campaign.module.css";
import { BRAND_LOGO } from "@/lib/brand";
export const metadata: Metadata = { title: "Digital marketing & website packages", robots: { index: false, follow: false } };
export default function Page() {
  return <main className={s.page}><div className={s.wrap}><header className={s.top}><img className={s.logo} src={BRAND_LOGO.light} alt={BRAND_LOGO.alt} width={BRAND_LOGO.width} height={BRAND_LOGO.height}/><span className={s.badge}>PACKAGE SHOWCASE</span></header><StaffPackages/></div></main>;
}
