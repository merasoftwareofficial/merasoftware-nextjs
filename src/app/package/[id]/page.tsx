import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { PublicInteraction } from "@/components/campaign/public-interaction/page-content";
import { settingsRepo } from "@/lib/repo";
import { resolvedOffers, resolvedTerms, DEFAULT_UNIVERSAL_TERMS, type Offer } from "@/lib/offers";
import { offerRunning } from "@/lib/offer-packages";
import { offerView, packageView } from "@/lib/package-design";
import { packagesHref, readPackagePages, readPublicPackagesOrNone } from "@/lib/package-pages-server";
import { packagePagePath } from "@/lib/package-pages";
import { pageMetadata } from "@/lib/page-seo";
import { getSessionUser } from "@/lib/auth";
import { offerWithQuote } from "@/lib/offer-quote";
import { phoneCountries } from "@/lib/phone-countries";
export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }> };

// A package's own page (src/docs/package-offers.md, owner decisions 7 Nov 2026). One template, two modes:
// a running offer shows 3 prices, the countdown and Reserve; without one, the main price crossed out, the
// normal price and Start my project. A draft, archived or unknown package is a 404.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return (await readPublicPackagesOrNone()).some(item => item.id === id) ? pageMetadata(`package-${id}`) : { title: "Package not found" };
}
// The running offer of this package, and its last offer: a customer who reserved that one still sees their
// reservation here after it ended.
function packageOffers(offers: Offer[], id: string, now = Date.now()) {
  const own = offers.filter(offer => offer.packageId === id && offer.status !== "draft");
  const running = own.find(offer => offerRunning(offer, now));
  const last: Offer | undefined = running ?? [...own].sort((a, b) => Date.parse(b.endsAt) - Date.parse(a.endsAt))[0];
  return { running, last };
}
export default async function Page({ params }: Props) {
  const { id } = await params;
  const item = (await readPublicPackagesOrNone()).find(row => row.id === id);
  if (!item) notFound();
  const settings = await settingsRepo.get();
  const universal = settings.offerUniversalTerms ?? DEFAULT_UNIVERSAL_TERMS;
  const { running, last } = packageOffers(resolvedOffers(settings.offers), item.id);
  const view = running ? offerView(running, item) : packageView(item, last);
  // Without an offer: the package terms and the universal terms, without an offer validity line.
  const terms = running ? resolvedTerms(running, universal) : [...new Set([...universal, ...item.terms])];
  const user = await getSessionUser();
  const reservations = process.env.OFFER_RESERVATIONS_ENABLED === "true";
  const starts = process.env.PACKAGE_START_REQUESTS_ENABLED === "true";
  // Only a signed-in owner can be asked for a missing phone, so only then load the country list.
  const countries = (reservations || starts) && user ? await phoneCountries() : undefined;
  const reservation = reservations && last ? { slug: last.slug, quoteKey: offerWithQuote(last, universal).quoteKey, signedIn: !!user, serverNow: new Date().toISOString(), countries } : undefined;
  // Back to the first menu page this package is shown on, else the first menu page.
  const pages = await readPackagePages();
  const home = pages.find(page => item.pages?.includes(page.slug));
  const back = home ? { href: packagePagePath(home.slug), label: home.title } : { href: await packagesHref(), label: "Packages" };
  return <><SiteHeader /><PublicInteraction key={user?._id || "anonymous"} offer={view} terms={terms} reservation={reservation}
    pkg={{ id: item.id, name: item.name, live: !!running, back, start: starts ? { signedIn: !!user, countries } : undefined, packageTerms: [...new Set([...universal, ...item.terms])] }} /></>;
}
