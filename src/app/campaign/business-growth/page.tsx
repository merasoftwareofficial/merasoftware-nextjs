import type { Metadata } from "next";
import { PublicInteraction } from "@/components/campaign/public-interaction/page-content";
export const metadata: Metadata = { title: "Business growth starter — Mera Software", description: "A starter-offer design preview for Amritsar business owners. Explore our work and discuss websites, Google visibility and social media.", robots: { index: false, follow: false }, openGraph: { title: "Get your business noticed online.", description: "Explore Mera Software’s work and talk to our team about your business." } };
export default function Page() { return <PublicInteraction/>; }
