import { redirect } from "next/navigation";
import Link from "@/components/link";
import { AccountNavigation, AccountOverview } from "@/components/account-navigation";
import styles from "@/components/account-navigation.module.css";
import { PageHero } from "@/components/page-hero";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "My Account", robots: { index: false, follow: false } };

export default async function Account() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/account");

  return (
    <>
      <SiteHeader />
      <main>
        <PageHero eyebrow="YOUR ACCOUNT" title="My Account." text="Your profile, posts, offers and preferences in one place." />
        <section className="content-section section-soft"><div className="container">
          <AccountNavigation username={user.username} active="/account" />
          <div className={styles.actions}><Link className="button button-dark" href="/community/write">Write a post <span aria-hidden="true">→</span></Link></div>
          <AccountOverview username={user.username} />
        </div></section>
      </main>
      <SiteFooter />
    </>
  );
}
