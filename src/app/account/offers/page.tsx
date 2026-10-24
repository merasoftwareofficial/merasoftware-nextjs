import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { MyOffers } from "@/components/offer-reservations";
export const dynamic = "force-dynamic";
export const metadata = { title: "My offers", robots: { index: false, follow: false } };
export default async function Page() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/account/offers");
  return <><SiteHeader /><main className="content-section"><div className="container"><h1>My offers</h1><p>Your reserved offers and their payment deadlines. Expired offers stay in your history.</p><MyOffers key={user._id} serverNow={new Date().toISOString()} /></div></main><SiteFooter /></>;
}
