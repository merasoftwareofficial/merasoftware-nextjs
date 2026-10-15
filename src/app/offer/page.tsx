/* eslint @next/next/no-img-element: off -- local offer screenshots retain their original preview dimensions. */
import type { Metadata } from "next";
import Link from "@/components/link";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { serviceOffers } from "@/lib/service-offers";
import s from "./offers.module.css";

export const metadata: Metadata = {
  title: "Business promotion offers",
  description: "Browse our business promotion offers.",
  robots: { index: false, follow: false },
};

export default function OffersPage() {
  return <>
    <SiteHeader />
    <main className={s.page}>
      <div className="container">
        <Link className={s.back} href="/">← Home</Link>
        <h1>Offers</h1>
        <div className={s.grid}>
          {serviceOffers.map(offer => <Link className={s.card} href={offer.href} key={offer.slug}>
            <div className={s.preview}>
              <img src={offer.preview.src} alt={offer.preview.alt} width={offer.preview.width} height={offer.preview.height} />
            </div>
            <div className={s.content}>
              <span className={s.label}>{offer.label}</span>
              <h2>{offer.title}</h2>
              <p>{offer.description}</p>
              <span className={s.action}>View offer <span aria-hidden="true">→</span></span>
            </div>
          </Link>)}
        </div>
      </div>
    </main>
    <SiteFooter />
  </>;
}
