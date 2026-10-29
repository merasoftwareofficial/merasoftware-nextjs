import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { PageHero } from "@/components/page-hero";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { MyPurchases } from "@/components/my-purchases";
import { AccountNavigation } from "@/components/account-navigation";
export const dynamic = "force-dynamic";
export const metadata = { title: "My purchases", robots: { index: false, follow: false } };
// Clients only (docs/plan.md decision 11): anyone else has bought nothing and goes to the Overview.
export default async function Page() {
  const session = await getSession();
  if (!session) redirect("/login?next=/account/purchases");
  if (!session.portalRoles.includes("customer")) redirect("/account");
  return (
    <>
      <SiteHeader />
      <main>
        <PageHero eyebrow="YOUR ACCOUNT" title="My purchases." text="The plans you bought and where each one stands." />
        <section className="content-section section-soft"><div className="container">
          <AccountNavigation username={session.user.username} active="/account/purchases" />
          <MyPurchases />
        </div></section>
      </main>
      <SiteFooter />
    </>
  );
}
