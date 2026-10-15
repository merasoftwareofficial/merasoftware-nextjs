"use client";
import { useEffect, useRef, useState } from "react";
import Link from "@/components/link";
import { PublicInteraction } from "@/components/campaign/public-interaction/page-content";
import { OfferPreview } from "@/components/campaign/offer-preview";
import { DEFAULT_OFFER, resolvedTerms, type Offer, type OfferListing } from "@/lib/offers";
import s from "./offers-manager.module.css";

function toIndiaInput(iso: string) {
  if (!iso || !Number.isFinite(Date.parse(iso))) return "";
  return new Date(Date.parse(iso) + 330 * 60000).toISOString().slice(0, 16);
}
function Lines({ label, value, change }: { label: string; value: string[]; change: (value: string[]) => void }) {
  return <label className="admin-field"><span>{label}</span><textarea aria-label={label} rows={6} value={value.join("\n")} onChange={event => change(event.target.value.split("\n"))} /><small>One item per line.</small></label>;
}
const cleanLines = (value: string[]) => value.map(item => item.trim()).filter(Boolean);

export function OffersManager({ initialOffers, initialTerms, initialListing, section }: {
  initialOffers: Offer[]; initialTerms: string[]; initialListing: OfferListing; section: string;
}) {
  const [offers, setOffers] = useState(initialOffers);
  const [selected, setSelected] = useState<Offer | null>(null);
  const [creating, setCreating] = useState(false);
  const [baseline, setBaseline] = useState("");
  const [terms, setTerms] = useState(initialTerms);
  const [savedTerms, setSavedTerms] = useState(initialTerms);
  const [listing, setListing] = useState(initialListing);
  const [savedListing, setSavedListing] = useState(initialListing);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const preview = useRef<HTMLDialogElement>(null);
  const dirty = section === "terms" ? JSON.stringify(terms) !== JSON.stringify(savedTerms)
    : section === "listing" ? JSON.stringify(listing) !== JSON.stringify(savedListing)
    : selected !== null && JSON.stringify(selected) !== baseline;
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    const guard = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!link || link.getAttribute("target") === "_blank") return;
      if (!window.confirm("Discard unsaved offer changes?")) { event.preventDefault(); event.stopPropagation(); }
    };
    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", guard, true);
    return () => { window.removeEventListener("beforeunload", warn); document.removeEventListener("click", guard, true); };
  }, [dirty]);
  function choose(offer: Offer | null, isNew = false) {
    if (dirty && !window.confirm("Discard unsaved offer changes?")) return;
    setSelected(offer); setCreating(isNew); setBaseline(JSON.stringify(offer)); setError(""); setMessage("");
  }
  async function save(payload: object, done: (data: unknown) => void) {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/offers", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not save.");
      done(result); setMessage("Saved.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save."); }
    finally { setBusy(false); }
  }
  const notices = <>{error && <p role="alert" className="form-error">{error}</p>}{message && <p role="status">{message}</p>}</>;
  if (section === "terms") return <form className="admin-form" onSubmit={event => { event.preventDefault(); void save({ kind: "terms", terms: cleanLines(terms) }, data => { setTerms(data as string[]); setSavedTerms(data as string[]); }); }}>
    <p>Used by offers set to Universal or Combined. Changes apply to those offers immediately.</p>
    <Lines label="Universal terms" value={terms} change={setTerms} />{notices}
    <button className="admin-button" disabled={busy || !dirty}>{busy ? "Saving…" : "Save universal T&C"}</button>
  </form>;
  if (section === "listing") return <form className="admin-form" onSubmit={event => { event.preventDefault(); void save({ kind: "listing", listing }, data => { setListing(data as OfferListing); setSavedListing(data as OfferListing); }); }}>
    <label className="admin-field"><span>Page heading</span><input required maxLength={120} value={listing.title} onChange={e => setListing({ ...listing, title: e.target.value })} /></label>
    <label className="admin-field"><span>Message when no offers are published</span><input required maxLength={300} value={listing.emptyMessage} onChange={e => setListing({ ...listing, emptyMessage: e.target.value })} /></label>
    <p>Offer cards and previews update automatically from published offers.</p>{notices}
    <button className="admin-button" disabled={busy || !dirty}>{busy ? "Saving…" : "Save listing"}</button>
  </form>;
  if (!selected) return <div>
    <button className="admin-button" type="button" onClick={() => choose({ ...DEFAULT_OFFER, slug: "", title: "", status: "draft", heading: "", headingHighlight: "", description: "", supportingLine: "", mainPrice: 0, discountPrice: 0, offerPrice: 0, endsAt: "", inclusions: [], terms: [], order: offers.length }, true)}>New offer +</button>
    <div className={s.list}>{offers.map(offer => <article className={s.row} key={offer.slug}>
      <div><h3>{offer.title}</h3><p>{offer.status} · ₹{offer.offerPrice.toLocaleString("en-IN")} · /offer/{offer.slug}</p></div>
      <div className={s.actions}><button type="button" className="admin-action" onClick={() => choose(offer)}>Edit →</button>{offer.status === "published" && <Link className="admin-action" href={`/offer/${offer.slug}`} target="_blank" rel="noreferrer">View ↗</Link>}</div>
    </article>)}</div>{notices}
  </div>;
  function update<K extends keyof Offer>(key: K, value: Offer[K]) { setSelected(current => current ? { ...current, [key]: value } : current); }
  const field = (label: string, key: keyof Pick<Offer, "title" | "slug" | "eyebrow" | "heading" | "headingHighlight" | "description" | "supportingLine" | "subheading" | "tagline" | "badge" | "priceDescription" | "ctaLabel" | "contactHref">, required = true) => <label className="admin-field"><span>{label}</span><input required={required} maxLength={key === "contactHref" ? 500 : key === "slug" ? 80 : 300} disabled={key === "slug" && !creating} value={selected[key]} onChange={e => update(key, e.target.value)} /></label>;
  const previewOffer = { ...selected, inclusions: cleanLines(selected.inclusions), terms: cleanLines(selected.terms), endsAt: selected.endsAt || DEFAULT_OFFER.endsAt };
  return <>
    <div className={s.actions}><button className="admin-action" type="button" disabled={busy} onClick={() => choose(null)}>← All offers</button><button className="admin-action" type="button" onClick={() => preview.current?.showModal()}>Preview changes ↗</button></div>
    <form className="admin-form" onSubmit={event => { event.preventDefault(); const next = { ...selected, inclusions: cleanLines(selected.inclusions), terms: cleanLines(selected.terms) }; void save({ kind: "offer", offer: next, creating }, data => { const result = data as Offer; setSelected(result); setBaseline(JSON.stringify(result)); setCreating(false); setOffers(current => [...current.filter(item => item.slug !== result.slug), result].sort((a,b) => a.order-b.order)); }); }}>
      <fieldset disabled={busy} className={s.fields}>
        <h3>Offer identity</h3><div className="form-columns">{field("Offer name", "title")}{field("URL slug", "slug")}</div>
        <small>URL: /offer/{selected.slug || "your-offer"}. The URL stays fixed after creation.</small>
        <div className="form-columns"><label className="admin-field"><span>Status</span><select aria-label="Status" value={selected.status} onChange={e => update("status", e.target.value as Offer["status"])}><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option></select></label><label className="admin-field"><span>Card order</span><input type="number" min={0} max={9999} required value={selected.order} onChange={e => update("order", Number(e.target.value))} /></label></div>
        <h3>Heading & content</h3>{field("Eyebrow text", "eyebrow")}<div className="form-columns">{field("Main heading", "heading")}{field("Highlighted heading text", "headingHighlight", false)}</div>
        {field("Short description", "description")}{field("Supporting line", "supportingLine", false)}{field("Benefits subheading", "subheading")}
        <Lines label="What's included" value={selected.inclusions} change={v => update("inclusions", v)} />
        <div className="form-columns">{field("Price-card tagline", "tagline")}{field("Offer badge", "badge")}</div>
        <h3>Prices & expiry</h3><div className={s.prices}>{([ ["Main price (₹)", "mainPrice"], ["Normal discount price (₹)", "discountPrice"], ["Offer price (₹)", "offerPrice"] ] as const).map(([label,key]) => <label className="admin-field" key={key}><span>{label}</span><input type="number" min={0} max={10000000} step="0.01" required value={selected[key]} onChange={e => update(key, Number(e.target.value))} /></label>)}</div>
        {field("Short price description", "priceDescription")}
        <label className="admin-field"><span>Expires at (India time / IST)</span><input aria-label="Expires at (India time / IST)" type="datetime-local" required value={toIndiaInput(selected.endsAt)} onChange={e => update("endsAt", e.target.value ? `${e.target.value}:59+05:30` : "")} /><small>One fixed deadline. The countdown never resets on refresh.</small></label>
        <h3>Enquiry action</h3>{field("CTA label", "ctaLabel")}{field("Contact destination", "contactHref")}<small>Use mailto: for email, tel: for phone, or an HTTPS contact link.</small>
        <h3>Terms & conditions</h3><label className="admin-field"><span>Terms to show</span><select aria-label="Terms to show" value={selected.termsMode} onChange={e => update("termsMode", e.target.value as Offer["termsMode"])}><option value="universal">Universal only</option><option value="offer">Offer-specific only</option><option value="combined">Universal + offer-specific</option></select></label>
        <Lines label="Offer-specific terms" value={selected.terms} change={v => update("terms", v)} /><p>Validity is added automatically from the expiry date.</p>
      </fieldset>{notices}
      <div className={s.actions}><button className="admin-button" disabled={busy || (!dirty && !creating)}>{busy ? "Saving…" : selected.status === "published" ? "Save & publish" : "Save offer"}</button><button type="button" className="admin-action" disabled={busy || !dirty} onClick={() => { setSelected(JSON.parse(baseline)); setError(""); }}>Discard changes</button></div>
    </form>
    <h3>Card preview</h3><OfferPreview offer={previewOffer} />
    <dialog ref={preview} className={s.preview} aria-label="Offer preview" onClick={e => { if (e.target === e.currentTarget) preview.current?.close(); }}><div className={s.previewBar}><strong>Unsaved offer preview</strong><button type="button" className="admin-button" onClick={() => preview.current?.close()}>Close preview</button></div><PublicInteraction offer={previewOffer} terms={resolvedTerms(previewOffer, savedTerms)} preview /></dialog>
  </>;
}
