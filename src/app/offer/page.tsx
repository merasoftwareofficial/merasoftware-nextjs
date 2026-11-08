import { redirect } from "next/navigation";
import { packagesHref } from "@/lib/package-pages-server";

// The offers list was removed on 8 Nov 2026: running offers are shown first on the Pricing & Packages
// page (components/campaign/staff-packages.tsx). Old links land there. An offer's own page stays at
// /offer/<slug> (app/offer/[slug]).
export const dynamic = "force-dynamic";
export default async function Page() { redirect(await packagesHref()); }
