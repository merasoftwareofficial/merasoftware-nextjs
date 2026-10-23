"use client";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@/components/loading/navigation";
import { indiaInputToUtc, toIndiaInput } from "@/lib/date-time";
import Link from "@/components/link";
import { PublicInteraction } from "@/components/campaign/public-interaction/page-content";
import { OfferPreview } from "@/components/campaign/offer-preview";
import { DEFAULT_OFFER, resolvedTerms, type Offer, type OfferListing } from "@/lib/offers";
import s from "./offers-manager.module.css";
import { categoryChoices, type ProjectCategory, type QuotedPackage, type SalesCatalogue } from "@/lib/sales-packages";
import { offerState, type OfferState } from "@/lib/admin-offers";
import { useServerTime } from "@/components/use-server-time";

function Lines({ label, value, change }: { label: string; value: string[]; change: (value: string[]) => void }) {
  return <label className="admin-field"><span>{label}</span><textarea aria-label={label} rows={6} value={value.join("\n")} onChange={event => change(event.target.value.split("\n"))} /><small>One item per line.</small></label>;
}
const cleanLines = (value: string[]) => value.map(item => item.trim()).filter(Boolean);

export function OffersManager({ initialOffers, initialTerms, initialListing, section, initialOfferSlug, createNew = false }: {
  initialOffers: Offer[]; initialTerms: string[]; initialListing: OfferListing; section: string; initialOfferSlug?: string; createNew?: boolean;
}) {
  const [offers, setOffers] = useState(initialOffers);
  const router = useNavigate();
  const [packages, setPackages] = useState<QuotedPackage[]>([]);
  const [plans, setPlans] = useState<NonNullable<SalesCatalogue["plans"]>>([]);
  // Project categories come from the portal with the sales catalogue; null = not loaded (yet).
  const [categories, setCategories] = useState<ProjectCategory[] | null>(null);
  const [catalogueFailed, setCatalogueFailed] = useState(false);
  useEffect(() => {
    if (section !== "settings") return;
    const controller = new AbortController();
    fetch("/api/packages", { cache: "no-store", signal: controller.signal }).then(response => response.ok ? response.json() : null).then(data => { if (data) { setPackages(data.packages || []); setPlans(data.plans || []); setCategories(data.categories || []); } else setCatalogueFailed(true); }).catch(error => { if (error?.name !== "AbortError") setCatalogueFailed(true); });
    return () => controller.abort();
  }, [section]);
  const initialSelected: Offer | null = section !== "settings" ? null : createNew ? { ...DEFAULT_OFFER, slug: "", title: "", status: "draft", heading: "", headingHighlight: "", description: "", supportingLine: "", mainPrice: 0, discountPrice: 0, offerPrice: 0, endsAt: "", inclusions: [], terms: [], order: initialOffers.length } : initialOffers.find(offer => offer.slug === initialOfferSlug) ?? null;
  const [selected, setSelected] = useState<Offer | null>(initialSelected);
  const [creating, setCreating] = useState(createNew);
  const [baseline, setBaseline] = useState(JSON.stringify(initialSelected));
  const [filter, setFilter] = useState<"all" | OfferState>("all");
  const now = useServerTime();
  const [terms, setTerms] = useState(initialTerms);
  const [savedTerms, setSavedTerms] = useState(initialTerms);
  const [listing, setListing] = useState(initialListing);
  const [savedListing, setSavedListing] = useState(initialListing);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const preview = useRef<HTMLDialogElement>(null);
  // Package ticks are stored on each package in the portal (offerSlug), so a package has one offer
  // and the package editor shows the same link. null = unchanged from the saved links.
  const [linked, setLinked] = useState<string[] | null>(null);
  const linkable = packages.filter(item => item.status !== "archived" && (selected?.applicableCategories || []).includes(item.category));
  const savedLinked = !selected || creating ? [] : linkable.filter(item => item.offerSlug === selected.slug).map(item => item.id);
  const linkedNow = (linked ?? savedLinked).filter(id => linkable.some(item => item.id === id));
  const linksDirty = JSON.stringify([...linkedNow].sort()) !== JSON.stringify([...savedLinked].sort());
  const dirty = section === "terms" ? JSON.stringify(terms) !== JSON.stringify(savedTerms)
    : section === "listing" ? JSON.stringify(listing) !== JSON.stringify(savedListing)
    : selected !== null && (JSON.stringify(selected) !== baseline || linksDirty);
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
  async function save(payload: object, done: (data: unknown) => void | Promise<void>) {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/offers", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not save.");
      await done(result); setMessage("Saved.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save."); }
    finally { setBusy(false); }
  }
  const notices = <>{error && <p role="alert" className="form-error">{error}</p>}{message && <p role="status">{message}</p>}</>;
  if (section === "terms") return <form className="admin-form" onSubmit={event => { event.preventDefault(); void save({ kind: "terms", terms: cleanLines(terms) }, data => { setTerms(data as string[]); setSavedTerms(data as string[]); }); }}>
    <p>Used by offers set to Universal or Combined. Changes apply to those offers immediately.</p>
    <Lines label="Universal terms" value={terms} change={setTerms} />{notices}
    <button className="admin-button" disabled={busy || !dirty}>{busy ? "Saving…" : "Save universal T&C"}</button>
  </form>;
  if (section === "listing") return <><form className="admin-form" onSubmit={event => { event.preventDefault(); void save({ kind: "listing", listing }, data => { setListing(data as OfferListing); setSavedListing(data as OfferListing); }); }}>
    <label className="admin-field"><span>Page heading</span><input required maxLength={120} value={listing.title} onChange={e => setListing({ ...listing, title: e.target.value })} /></label>
    <label className="admin-field"><span>Message when no offers are published</span><input required maxLength={300} value={listing.emptyMessage} onChange={e => setListing({ ...listing, emptyMessage: e.target.value })} /></label>
    <p>Offer cards and previews update automatically from published offers.</p>{notices}
    <button className="admin-button" disabled={busy || !dirty}>{busy ? "Saving…" : "Save listing"}</button>
  </form><div className={s.cards}>{offers.map(offer => <article key={offer.slug}><h3>{offer.title}</h3><OfferPreview offer={offer} /><Link className="admin-action" href={`/admin/offers?section=settings&offer=${encodeURIComponent(offer.slug)}`}>Edit content & settings →</Link></article>)}</div></>;
  if (!selected) return <div>
    {section === "settings" && <p>Select an offer below to open its settings.</p>}
    <div className={s.actions}><Link className="admin-button" href="/admin/offers?section=settings&new=1">New offer +</Link><label>Filter offers <select aria-label="Filter offers" value={filter} onChange={event => setFilter(event.target.value as typeof filter)}><option value="all">All</option><option value="active">Active</option><option value="expired">Expired</option><option value="draft">Draft</option><option value="archived">Archived</option></select></label></div>
    <div className={s.list}>{offers.filter(offer => filter === "all" || offerState(offer, now) === filter).map(offer => <article className={s.row} key={offer.slug}>
      <div><h3>{offer.title}</h3><p>{offerState(offer, now)} · ₹{offer.offerPrice.toLocaleString("en-IN")} · /offer/{offer.slug}</p></div>
      <div className={s.actions}><Link className="admin-action" href={`/admin/offers?section=settings&offer=${encodeURIComponent(offer.slug)}`}>Edit →</Link>{offer.status === "published" && <Link className="admin-action" href={`/offer/${offer.slug}`} target="_blank" rel="noreferrer">View ↗</Link>}</div>
    </article>)}</div>{!offers.some(offer => filter === "all" || offerState(offer, now) === filter) && <p>No offers match this filter.</p>}{notices}
  </div>;
  function update<K extends keyof Offer>(key: K, value: Offer[K]) {
    setSelected(current => {
      if (!current) return current;
      const next = { ...current, [key]: value };
      if (["pricingRule", "benefitValue", "mainPrice"].includes(key) && next.pricingRule && next.pricingRule !== "fixed_price" && next.benefitValue !== undefined) {
        next.offerPrice = Math.round((next.pricingRule === "percentage" ? next.mainPrice * (1 - next.benefitValue / 100) : next.mainPrice - next.benefitValue) * 100) / 100;
      }
      return next;
    });
  }
  // Runs after the offer itself is saved, so the portal can check the saved offer's categories and price.
  async function saveLinks(offerSlug: string) {
    const response = await fetch("/api/packages/offer-links", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ offerSlug, packageIds: linkedNow }) });
    const result = await response.json();
    if (!response.ok) throw new Error(`Offer saved, but packages were not linked: ${result.error || "please try again."}`);
    const reload = await fetch("/api/packages", { cache: "no-store" });
    if (reload.ok) setPackages((await reload.json()).packages || []);
    setLinked(null);
  }
  const policy = selected.paymentPolicy || { mode: "current" as const, uploadAllowance: 0, dueDays: 7, cycleScope: "first_purchase" as const, reminderOffsets: [-1, 0, 3] };
  const targets = selected.targets ?? ["projects"];
  const projectsEnabled = targets.includes("projects");
  const plansEnabled = targets.includes("service_plans");
  const policyUpdate = (value: Partial<NonNullable<Offer["paymentPolicy"]>>) => update("paymentPolicy", { ...policy, ...value });
  const field = (label: string, key: keyof Pick<Offer, "title" | "slug" | "eyebrow" | "heading" | "headingHighlight" | "description" | "supportingLine" | "subheading" | "tagline" | "badge" | "priceDescription" | "ctaLabel" | "contactHref">, required = true) => <label className="admin-field"><span>{label}</span><input required={required} maxLength={key === "contactHref" ? 500 : key === "slug" ? 80 : 300} disabled={key === "slug" && !creating} value={selected[key]} onChange={e => update(key, e.target.value)} /></label>;
  const previewOffer = { ...selected, inclusions: cleanLines(selected.inclusions), terms: cleanLines(selected.terms), endsAt: selected.endsAt || DEFAULT_OFFER.endsAt };
  return <>
    <div className={s.actions}><Link className="admin-action" href="/admin/offers">← All offers</Link><button className="admin-action" type="button" onClick={() => preview.current?.showModal()}>Preview changes ↗</button></div>
    <form className="admin-form" onSubmit={event => { event.preventDefault(); const next = { ...selected, inclusions: cleanLines(selected.inclusions), terms: cleanLines(selected.terms) }; void save({ kind: "offer", offer: next, creating }, async data => { const result = data as Offer; setSelected(result); setBaseline(JSON.stringify(result)); setCreating(false); setOffers(current => [...current.filter(item => item.slug !== result.slug), result].sort((a,b) => a.order-b.order)); if (linksDirty) await saveLinks(result.slug); if (creating) router.replace(`/admin/offers?section=settings&offer=${encodeURIComponent(result.slug)}`); }); }}>
      <fieldset disabled={busy} className={s.fields}>
        <h3>Offer identity</h3><div className="form-columns">{field("Offer name", "title")}{field("URL slug", "slug")}</div>
        <small>URL: /offer/{selected.slug || "your-offer"}. The URL stays fixed after creation.</small>
        <div className="form-columns"><label className="admin-field"><span>Status</span><select aria-label="Status" value={selected.status} onChange={e => update("status", e.target.value as Offer["status"])}><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option></select></label><label className="admin-field"><span>Card order</span><input type="number" min={0} max={9999} required value={selected.order} onChange={e => update("order", Number(e.target.value))} /></label></div>
        <h3>Where this offer applies</h3>
        <div className="form-columns">{(["projects", "service_plans"] as const).map(target => <label key={target}><input type="checkbox" checked={targets.includes(target)} onChange={e => update("targets", e.target.checked ? [...targets, target] : targets.filter(value => value !== target))} />{target === "projects" ? "Projects / showcase packages" : "Service-plan purchases (payment timing only)"}</label>)}</div>
        <fieldset className={s.dependentFields} disabled={!plansEnabled} aria-label="Service plan eligibility">
          <label className="admin-field"><span>Eligible service plans</span><select aria-label="Eligible service plans" multiple size={5} value={selected.planIds || []} onChange={e => update("planIds", Array.from(e.target.selectedOptions, option => option.value))}>{plans.map(plan => <option key={plan._id} value={plan._id}>{plan.serviceName}{plan.servicePlan?.capability !== "upload_data" ? " (no uploads)" : ""}</option>)}</select><small>{plansEnabled ? "Select specific plans. Their existing billing prices stay unchanged." : "Check Service-plan purchases above to select plans."}</small></label>
        </fieldset>
        <fieldset className={s.dependentFields} disabled={!projectsEnabled} aria-label="Project categories and packages">
        {!projectsEnabled && <small>Check Projects / showcase packages above to select categories and packages.</small>}
        <p>Select the project categories eligible for this offer.</p>
        {categories === null && <small role={catalogueFailed ? "alert" : undefined}>{catalogueFailed ? "Project categories could not be loaded from the portal. Already selected categories are kept; publishing checks them again." : "Loading project categories from the portal…"}</small>}
        <div className="form-columns">{categoryChoices(categories ?? undefined, selected.applicableCategories || []).map(({ category: id, label, status }) => <label key={id}><input type="checkbox" checked={selected.applicableCategories?.includes(id) ?? false} onChange={e => update("applicableCategories", e.target.checked ? [...(selected.applicableCategories || []), id] : selected.applicableCategories?.filter(value => value !== id))} /> {label}{status === "archived" ? " (archived)" : ""}</label>)}</div>
        <div className="admin-field"><span>Packages with this offer</span>
          {linkable.length ? linkable.map(item => { const ticked = linkedNow.includes(item.id); const other = item.offerSlug && item.offerSlug !== selected.slug ? offers.find(row => row.slug === item.offerSlug)?.title || item.offerSlug : ""; return <label key={item.id}><input type="checkbox" checked={ticked} onChange={e => setLinked(e.target.checked ? [...linkedNow, item.id] : linkedNow.filter(id => id !== item.id))} /> {item.name}{other ? ticked ? ` (moves here from ${other} on save)` : ` (now on ${other})` : ""}</label>; }) : <small>No packages in the selected categories yet.</small>}
          <small>A package has one offer. Ticking a package that is on another offer moves it here. The package editor shows the same link.</small></div>
        </fieldset>
        <label className="admin-field"><span>Pricing rule</span><select value={selected.pricingRule || ""} onChange={e => update("pricingRule", e.target.value as Offer["pricingRule"])}><option value="" disabled>Select a pricing rule</option><option value="fixed_price">Fixed offer bundle price</option><option value="fixed_discount">Fixed rupee discount</option><option value="percentage">Percentage discount</option></select><small>Fixed price uses the Offer price below. A package can add an explicit charge for its extra scope.</small></label>
        <h3>Payment timing</h3>
        <label className="admin-field"><span>Payment policy</span><select aria-label="Payment policy" value={policy.mode} onChange={e => policyUpdate({ mode: e.target.value as typeof policy.mode })}><option value="current">Keep current system rules</option><option value="advance">Advance payment</option><option value="limited_uploads">Limited uploads before payment</option><option value="pay_later">Pay later (uploads stay available)</option></select></label>
        {policy.mode !== "current" && <>
          {policy.mode === "limited_uploads" && <label className="admin-field"><span>Successful submissions allowed before payment</span><input aria-label="Pre-payment upload allowance" type="number" min={1} max={10000} required value={policy.uploadAllowance || ""} onChange={e => policyUpdate({ uploadAllowance: Number(e.target.value) })} /></label>}
          <label className="admin-field"><span>Payment due after how many days?</span><input aria-label="Payment due days" type="number" required min={0} max={365} value={policy.dueDays} onChange={e => policyUpdate({ dueDays: Number(e.target.value) })} /><small>From project creation or the service-cycle start. A service waiting for project completion starts its due clock on activation.</small></label>
          <label className="admin-field"><span>Plan payment-policy cycles</span><select aria-label="Payment-policy cycles" value={policy.cycleScope} onChange={e => policyUpdate({ cycleScope: e.target.value as typeof policy.cycleScope })}><option value="first_purchase">First purchase only</option><option value="every_cycle">Every billing cycle</option></select></label>
          <label className="admin-field"><span>Automatic reminder days relative to due date</span><input key={selected.slug} aria-label="Reminder offsets" defaultValue={policy.reminderOffsets.join(", ")} onBlur={e => policyUpdate({ reminderOffsets: e.target.value.trim() ? e.target.value.split(",").map(value => Number(value.trim())) : [] })} /><small>Example: -1, 0, 3 means one day before, on the due date and three days after. Empty disables reminders. Original quotas and lifecycle restrictions remain.</small></label>
        </>}
        {selected.pricingRule && selected.pricingRule !== "fixed_price" && <label className="admin-field"><span>{selected.pricingRule === "percentage" ? "Discount percentage" : "Discount amount (₹)"}</span><input type="number" required min={0} max={selected.pricingRule === "percentage" ? 100 : 10000000} step="0.01" value={selected.benefitValue ?? ""} onChange={e => update("benefitValue", Number(e.target.value))} /></label>}
        <h3>Heading & content</h3>{field("Eyebrow text", "eyebrow")}<div className="form-columns">{field("Main heading", "heading")}{field("Highlighted heading text", "headingHighlight", false)}</div>
        {field("Short description", "description")}{field("Supporting line", "supportingLine", false)}{field("Benefits subheading", "subheading")}
        <Lines label="What's included" value={selected.inclusions} change={v => update("inclusions", v)} />
        <div className="form-columns">{field("Price-card tagline", "tagline")}{field("Offer badge", "badge")}</div>
        <h3>Prices & expiry</h3><div className={s.prices}>{([ ["Main price (₹)", "mainPrice"], ["Normal discount price (₹)", "discountPrice"], ["Offer price (₹)", "offerPrice"] ] as const).map(([label,key]) => <label className="admin-field" key={key}><span>{label}</span><input type="number" min={0} max={10000000} step="0.01" required value={selected[key]} onChange={e => update(key, Number(e.target.value))} /></label>)}</div>
        {field("Short price description", "priceDescription")}
        <label className="admin-field"><span>Expires at (India time / IST)</span><input aria-label="Expires at (India time / IST)" type="datetime-local" required value={toIndiaInput(selected.endsAt)} onChange={e => update("endsAt", e.target.value ? indiaInputToUtc(e.target.value, true) : "")} /><small>One fixed deadline. The countdown never resets on refresh.</small></label>
        <h3>Enquiry action</h3>{field("CTA label", "ctaLabel")}{field("Contact destination", "contactHref")}<small>Use mailto: for email, tel: for phone, or an HTTPS contact link.</small>
        <h3>Terms & conditions</h3><label className="admin-field"><span>Terms to show</span><select aria-label="Terms to show" value={selected.termsMode} onChange={e => update("termsMode", e.target.value as Offer["termsMode"])}><option value="universal">Universal only</option><option value="offer">Offer-specific only</option><option value="combined">Universal + offer-specific</option></select></label>
        <Lines label="Offer-specific terms" value={selected.terms} change={v => update("terms", v)} /><p>Validity is added automatically from the expiry date.</p>
      </fieldset>{notices}
      <div className={s.actions}><button className="admin-button" disabled={busy || (!dirty && !creating)}>{busy ? "Saving…" : selected.status === "published" ? "Save & publish" : "Save offer"}</button><button type="button" className="admin-action" disabled={busy || !dirty} onClick={() => { setSelected(JSON.parse(baseline)); setLinked(null); setError(""); }}>Discard changes</button></div>
    </form>
    <h3>Card preview</h3><OfferPreview offer={previewOffer} />
    <dialog ref={preview} className={s.preview} aria-label="Offer preview" onClick={e => { if (e.target === e.currentTarget) preview.current?.close(); }}><div className={s.previewBar}><strong>Unsaved offer preview</strong><button type="button" className="admin-button" onClick={() => preview.current?.close()}>Close preview</button></div><PublicInteraction offer={previewOffer} terms={resolvedTerms(previewOffer, savedTerms)} preview /></dialog>
  </>;
}
