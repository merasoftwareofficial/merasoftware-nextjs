import type { Metadata } from "next";
import { ClientCampaign } from "@/components/campaign/client-campaign";
export const metadata: Metadata = { title: "Find your business growth package", description: "Explore website and digital marketing packages for your business.", robots: { index: false, follow: false }, openGraph: { title: "Find a package for your business", description: "Social media, content shoots and websites — clear packages from Mera Software." } };
export default function Page() { return <ClientCampaign/>; }
