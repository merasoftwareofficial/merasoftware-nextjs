import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "@/components/link";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { PackageBuilder } from "@/components/packages/package-builder";
import { getSessionUser } from "@/lib/auth";
import { pageMetadata } from "@/lib/page-seo";
import { phoneCountries } from "@/lib/phone-countries";
import { initialPackageChoice } from "@/lib/package-choice";
import { packageCustomizePath, packagePath, readCustomizablePackages } from "@/lib/package-pages-server";
import { billingLabel } from "@/lib/sales-packages";
import { settingsRepo } from "@/lib/repo";
import { DEFAULT_UNIVERSAL_TERMS } from "@/lib/offers";
import c from "@/components/campaign/campaign.module.css";
import s from "@/components/plans/plans.module.css";
export const dynamic = "force-dynamic";

// A package's customize page (src/docs/package.md §3): choose how to buy it, see the backend's price, and
// send a package start request with that choice. Only a published package with purchase settings has
// one, while package requests are on; others are a 404. While its offer runs the package page's Reserve
// keeps the price (decision 5), so this page sends the customer back there.
type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return (await readCustomizablePackages()).some(item => item.id === id) ? pageMetadata(`package-${id}-customize`) : { title: "Package not found" };
}

export default async function Page({ params, searchParams }: Props) {
  const { id } = await params;
  const item = (await readCustomizablePackages()).find(row => row.id === id);
  if (!item) notFound();
  if (item.quote.offer) redirect(packagePath(item.id));
  const initial = initialPackageChoice(item, await searchParams);
  const user = await getSessionUser();
  const countries = user ? await phoneCountries() : [];
  // The same terms as the package page without an offer (app/package/[id]): universal, then the package's own.
  const terms = [...new Set([...((await settingsRepo.get()).offerUniversalTerms ?? DEFAULT_UNIVERSAL_TERMS), ...item.terms])];
  return (
    <>
      <SiteHeader />
      <main className={c.page}>
        <div className={c.wrap}>
          <header className={s.head}>
            <div className={s.titleRow}>
              <Link className={s.back} href={packagePath(item.id)}>← Package</Link>
              <h1>{item.name}</h1>
            </div>
            <p className={s.fine}>{billingLabel(item)} package</p>
            {item.description && <p className={s.lead}>{item.description}</p>}
          </header>
          {initial
            ? <PackageBuilder item={{ id: item.id, name: item.name, billing: item.billing, portalUploads: item.portalUploads, paymentOptions: item.paymentOptions, monthly: item.monthly, inclusions: item.inclusions }}
                terms={terms} initial={initial} signedIn={!!user} countries={countries} path={packageCustomizePath(item.id)} />
            : <p style={{ textAlign: "center" }}>This package cannot be bought right now. <a className="text-link" href="mailto:contact@merasoftware.com">Contact us →</a></p>}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
