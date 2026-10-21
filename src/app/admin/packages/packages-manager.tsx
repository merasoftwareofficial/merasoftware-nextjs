"use client";
import { useEffect, useState } from "react";
import { PROJECT_CATEGORIES, type SalesCatalogue, type SalesPackage } from "@/lib/sales-packages";
import { useServerTime } from "@/components/use-server-time";

const blank: SalesPackage = { id: "", name: "", description: "", status: "draft", category: "standard_websites", regularPrice: 0, offerExtraPrice: 0, offerSlug: "", inclusions: [], terms: [], linkedPlanIds: [], order: 0 };
export function PackagesManager({ initial }: { initial: SalesCatalogue }) {
  const [catalogue, setCatalogue] = useState(initial);
  const [item, setItem] = useState<SalesPackage | null>(null);
  const [creating, setCreating] = useState(false);
  const [baseline, setBaseline] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const now = useServerTime();
  const dirty = !!item && JSON.stringify(item) !== baseline;
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    const guard = (e: MouseEvent) => {
      const link = e.target instanceof Element ? e.target.closest("a[href]") : null;
      if (link && link.getAttribute("target") !== "_blank" && !window.confirm("Discard unsaved package changes?")) { e.preventDefault(); e.stopPropagation(); }
    };
    window.addEventListener("beforeunload", warn); document.addEventListener("click", guard, true);
    return () => { window.removeEventListener("beforeunload", warn); document.removeEventListener("click", guard, true); };
  }, [dirty]);
  function choose(next: SalesPackage | null, isNew = false) {
    if (dirty && !window.confirm("Discard unsaved package changes?")) return;
    // Strip the calculated quote before editing; only package configuration is saved.
    const config = next ? Object.fromEntries(Object.keys(blank).map(key => [key, next[key as keyof SalesPackage]])) as SalesPackage : null;
    setItem(config); setCreating(isNew); setBaseline(JSON.stringify(config)); setError(""); setMessage("");
  }
  function update<K extends keyof SalesPackage>(key: K, value: SalesPackage[K]) { setItem(current => current ? { ...current, [key]: value } : current); }
  async function save(e: React.FormEvent) {
    e.preventDefault(); if (!item) return; setBusy(true); setError(""); setMessage("");
    try {
      const config = { ...item, inclusions: item.inclusions.map(line => line.trim()).filter(Boolean), terms: item.terms.map(line => line.trim()).filter(Boolean) };
      const response = await fetch("/api/packages", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ item: config, creating }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not save package.");
      setItem(result); setCreating(false); setBaseline(JSON.stringify(result));
      setMessage("Package saved. Existing client agreements stay unchanged.");
      const reload = await fetch("/api/packages", { cache: "no-store" });
      if (reload.ok) setCatalogue(await reload.json());
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save package."); }
    finally { setBusy(false); }
  }
  if (!item) return <div>
    <p>Packages showcase your services. An admin selects a package while preparing a client project. Packages have no checkout and never activate or purchase service plans.</p>
    <button className="admin-button" onClick={() => choose({ ...blank, order: catalogue.packages.length }, true)}>New package +</button>
    {catalogue.packages.map(row => <article className="admin-form" key={row.id} style={{ marginTop: 24 }}><h2>{row.name}</h2><p>{row.status} · {PROJECT_CATEGORIES[row.category]} · ₹{row.quote.finalPrice.toLocaleString("en-IN")} one-time {row.quote.offer ? `with ${row.quote.offer.title}` : "at regular price"}</p><div className="form-actions"><button className="admin-action" onClick={() => choose(row)}>Edit package →</button><button className="admin-action" onClick={() => choose({ ...row, id: "", name: `${row.name} copy`, status: "draft", order: catalogue.packages.length }, true)}>Duplicate</button></div></article>)}
  </div>;
  const eligible = (catalogue.offers || []).filter(offer => offer.pricingRule && offer.applicableCategories?.includes(item.category) && (!offer.packageIds?.length || offer.packageIds.includes(item.id)));
  const offer = eligible.find(row => row.slug === item.offerSlug);
  const active = offer && now !== null && offer.status === "published" && Date.parse(offer.endsAt) > now;
  const preview = active ? offer.pricingRule === "fixed_price" ? offer.offerPrice + item.offerExtraPrice : offer.pricingRule === "percentage" ? item.regularPrice * (1 - Number(offer.benefitValue) / 100) : item.regularPrice - Number(offer.benefitValue) : item.regularPrice;
  return <>
    <button className="admin-action" disabled={busy} onClick={() => choose(null)}>← All packages</button>
    <form className="admin-form" onSubmit={save}><fieldset disabled={busy} style={{ border: 0, padding: 0, display: "grid", gap: 18 }}>
      <div className="form-columns"><label className="admin-field"><span>Package name</span><input required maxLength={120} value={item.name} onChange={e => update("name", e.target.value)} /></label><label className="admin-field"><span>Permanent ID</span><input aria-label="Permanent ID" required disabled={!creating} pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={80} value={item.id} onChange={e => update("id", e.target.value)} /><small>Lowercase letters, numbers and hyphens. Fixed after creation.</small></label></div>
      <label className="admin-field"><span>Description</span><textarea required maxLength={500} value={item.description} onChange={e => update("description", e.target.value)} /></label>
      <div className="form-columns"><label className="admin-field"><span>Project category</span><select aria-label="Project category" value={item.category} onChange={e => { update("category", e.target.value as SalesPackage["category"]); update("offerSlug", ""); }}>{Object.entries(PROJECT_CATEGORIES).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label><label className="admin-field"><span>Status</span><select aria-label="Status" value={item.status} onChange={e => update("status", e.target.value as SalesPackage["status"])}>{["draft", "published", "archived"].map(value => <option key={value}>{value}</option>)}</select></label></div>
      <label className="admin-field"><span>Included work (one item per line)</span><textarea aria-label="Included work (one item per line)" required rows={7} value={item.inclusions.join("\n")} onChange={e => update("inclusions", e.target.value.split("\n"))} /><small>List the complete package scope. It is saved with each client project.</small></label>
      <label className="admin-field"><span>Terms & exclusions (one per line)</span><textarea rows={5} value={item.terms.join("\n")} onChange={e => update("terms", e.target.value.split("\n"))} /></label>
      <div className="form-columns"><label className="admin-field"><span>Regular one-time price (₹)</span><input type="number" required min={0} max={10000000} step="0.01" value={item.regularPrice} onChange={e => update("regularPrice", Number(e.target.value))} /></label><label className="admin-field"><span>Display order</span><input type="number" min={0} max={9999} required value={item.order} onChange={e => update("order", Number(e.target.value))} /></label></div>
      <label className="admin-field"><span>Linked offer</span><select aria-label="Linked offer" value={item.offerSlug} onChange={e => update("offerSlug", e.target.value)}><option value="">No offer — regular price</option>{item.offerSlug && !eligible.some(row => row.slug === item.offerSlug) && <option value={item.offerSlug}>Current offer needs configuration</option>}{eligible.map(row => <option key={row.slug} value={row.slug}>{row.title} ({row.status})</option>)}</select></label>
      {offer?.pricingRule === "fixed_price" && <label className="admin-field"><span>Extra scope above the offer bundle (₹)</span><input type="number" required min={0} max={10000000} step="0.01" value={item.offerExtraPrice} onChange={e => update("offerExtraPrice", Number(e.target.value))} /><small>Example: ₹699 starter + ₹2,000 extra scope = ₹2,699 package price.</small></label>}
      <label className="admin-field"><span>Related portal services (optional references)</span><select aria-label="Related portal services (optional references)" multiple size={5} value={item.linkedPlanIds} onChange={e => update("linkedPlanIds", Array.from(e.target.selectedOptions, option => option.value))}>{(catalogue.plans || []).map(plan => <option key={plan._id} value={plan._id}>{plan.serviceName} ({plan.servicePlan?.purchaseType || "service"})</option>)}</select><small>Reference only. These services are purchased separately through the existing portal plan flow.</small></label>
      <p role="status">Current preview: <strong>₹{Math.round(preview * 100) / 100} one-time</strong>{active ? ` with ${offer.title}` : " — no active offer applies"}. Backend verifies the final amount.</p>
    </fieldset>{error && <p className="form-error" role="alert">{error}</p>}{message && <p role="status">{message}</p>}<button className="admin-button" disabled={busy || (!dirty && !creating)}>{busy ? "Saving…" : "Save package"}</button></form>
  </>;
}
