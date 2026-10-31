import { BUSINESS_LOCATION } from "@/lib/business-location";
import { ShareLocation } from "@/components/share-location";

export function LocationPin() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></svg>;
}

export function BusinessLocation() {
  return <section id="visit-us" className="business-location" aria-labelledby="visit-us-heading">
    <div className="container location-grid">
      <div className="location-copy">
        <p className="eyebrow"><i /> VISIT US</p>
        <h2 id="visit-us-heading">Find your way<br />to <em>Mera Software.</em></h2>
        <p className="location-intro">Find us in Majitha. Open directions for the route to our location.</p>
        <div className="location-address"><span className="location-pin"><LocationPin /></span><div>
          <h3>{BUSINESS_LOCATION.name}</h3>
          <address>{BUSINESS_LOCATION.addressLines.map(line => <span key={line}>{line}</span>)}</address>
        </div></div>
        <div className="location-actions">
          <a className="button button-dark" href={BUSINESS_LOCATION.directionsUrl} target="_blank" rel="noopener noreferrer">Get directions <span aria-hidden="true">↗</span></a>
          <ShareLocation />
        </div>
        {BUSINESS_LOCATION.reviewsUrl ? <a className="text-link" href={BUSINESS_LOCATION.reviewsUrl} target="_blank" rel="noopener noreferrer">Write a Google review ↗</a> : null}
      </div>
      <div className="location-map-card">
        <div className="location-map-caption"><span><LocationPin /> MAJITHA, PUNJAB</span><a href={BUSINESS_LOCATION.mapsUrl} target="_blank" rel="noopener noreferrer">Open in Google Maps ↗</a></div>
        <iframe src={BUSINESS_LOCATION.embedUrl} title="Mera Software Digital Solutions location on Google Maps" loading="lazy" allowFullScreen referrerPolicy="no-referrer-when-downgrade" />
        <p>{BUSINESS_LOCATION.shortAddress}</p>
      </div>
    </div>
  </section>;
}
