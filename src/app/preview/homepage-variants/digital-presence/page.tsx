import type { Metadata } from "next";
import { requireStaffPage } from "@/lib/auth";
import { DigitalPresenceVariant } from "@/components/homepage-variants/digital-presence/variant";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Digital Presence — homepage variant preview", robots: { index: false, follow: false }, description: "Saved English homepage design preview for Mera Software." };
export default async function Preview() {
  await requireStaffPage("/preview/homepage-variants/digital-presence", "editor");
  return <DigitalPresenceVariant/>;
}
