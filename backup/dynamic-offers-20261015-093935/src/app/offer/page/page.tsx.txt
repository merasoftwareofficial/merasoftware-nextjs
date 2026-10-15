import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { PublicInteraction } from "@/components/campaign/public-interaction/page-content";
export const metadata: Metadata = {
  title: "Business Growth Starter — Mera Software",
  description: "Explore the Business Growth Starter offer, included services, pricing and terms.",
  robots: { index: false, follow: false },
};
export default function Page() { return <><SiteHeader /><PublicInteraction /></>; }
