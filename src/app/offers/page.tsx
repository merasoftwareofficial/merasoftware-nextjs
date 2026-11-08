import { redirect } from "next/navigation";
import { packagesHref } from "@/lib/package-pages-server";

// Old address of the offers list, which now lives on the Pricing & Packages page (app/offer/page.tsx).
export const dynamic = "force-dynamic";
export default async function Page() { redirect(await packagesHref()); }
