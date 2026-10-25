"use client";
import { useEffect, useState } from "react";
import { categoryChoices, categoryLabel, type SalesCatalogue, type SalesPackage } from "@/lib/sales-packages";
import { useServerTime } from "@/components/use-server-time";
import { packagePagePath, type PackagePage } from "@/lib/package-pages";
import s from "./packages-manager.module.css";
import { offerFinalPrice } from "@/lib/offers";
import { runningOfferForPackage } from "@/lib/offer-packages";

const blank: SalesPackage = { id: "", name: "", description: "", status: "draft", category: "standard_websites", regularPrice: 0, discountedPrice: 0, offerExtraPrice: 0, offerSlug: "", inclusions: [], terms: [], linkedPlanIds: [], order: 0, pages: [] };
export function PackagesManager({ initial, initialPages }: { initial: SalesCatalogue; initialPages: PackagePage[] }) {
  const [catalogue, setCatalogue] = useState(initial);
  const [pages, setPages] = useState(initialPages);
  const [pageDraft, setPageDraft] = useState<{ title: string; intro: string } | null>(null);
  const [pageBusy, setPageBusy] = useState(false);
  const [pageError, setPageError] = useState("");
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
    if (config && config.discountedPrice === undefined) config.discountedPrice = config.regularPrice;
    if (config && !config.pages) config.pages = [];
    setItem(config); setCreating(isNew); setBaseline(JSON.stringify(config)); setError(""); setMessage("");
  }
  function update<K extends keyof SalesPackage>(key: K, value: SalesPackage[K]) { setItem(current => current ? { ...current, [key]: value } : current); }
  // Pages that still exist; a package showing none of them is flagged in the list and editor.
  const shownOn = (row: SalesPackage) => (row.pages || []).filter(slug => pages.some(page => page.slug === slug));
  async function reloadCatalogue() {
    const reload = await fetch("/api/packages", { cache: "no-store" });
    if (reload.ok) setCatalogue(await reload.json());
  }
  // Page create/delete save at once, separately from the package form.
  async function createPage() {
    if (!pageDraft) return;
    setPageBusy(true); setPageError("");
    try {
      const response = await fetch("/api/package-pages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(pageDraft) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not create the page.");
      const created = (result as PackagePage[]).find(page => !pages.some(old => old.slug === page.slug));
      setPages(result); setPageDraft(null);
      if (created) setItem(current => current ? { ...current, pages: [...(current.pages || []), created.slug] } : current);
    } catch (cause) { setPageError(cause instanceof Error ? cause.message : "Could not create the page."); }
    finally { setPageBusy(false); }
  }
  async function deletePage(page: PackagePage) {
    const count = catalogue.packages.filter(row => row.pages?.includes(page.slug)).length;
    if (!window.confirm(`Delete the page "${page.title}"? It leaves the Pricing & Packages menu and its link stops working.${count ? ` It is removed from ${count} package(s); the packages themselves stay.` : ""}`)) return;
    setPageBusy(true); setPageError("");
    try {
      const response = await fetch(`/api/package-pages?slug=${encodeURIComponent(page.slug)}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not delete the page.");
      setPages(result);
      // The portal already removed the page from saved packages, so the saved baseline drops it too.
      const drop = (row: SalesPackage) => ({ ...row, pages: (row.pages || []).filter(slug => slug !== page.slug) });
      setItem(current => current ? drop(current) : current);
      setBaseline(current => current ? JSON.stringify(drop(JSON.parse(current))) : current);
      await reloadCatalogue();
    } catch (cause) { setPageError(cause instanceof Error ? cause.message : "Could not delete the page."); }
    finally { setPageBusy(false); }
  }
  async function save(e: React.FormEvent) {
    e.preventDefault(); if (!item) return; setBusy(true); setError(""); setMessage("");
    try {
      if (holder?.packageId && !window.confirm(`This updates the live offer page "${holder.title}" at once. People who already reserved keep their saved price. Save?`)) return;
      const config = { ...item, inclusions: item.inclusions.map(line => line.trim()).filter(Boolean), terms: item.terms.map(line => line.trim()).filter(Boolean) };
      const response = await fetch("/api/packages", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ item: config, creating }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not save package.");
      setItem(result); setCreating(false); setBaseline(JSON.stringify(result));
      const unsynced = response.headers.get("X-Offer-Sync-Failed");
      setMessage("Package saved. Existing client agreements stay unchanged.");
      if (unsynced) setError(`Package saved, but these offers were not updated: ${decodeURIComponent(unsynced)}. Open each offer to fix its price, then save it.`);
      await reloadCatalogue();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save package."); }
    finally { setBusy(false); }
  }
  if (!item) return <div>
    <p>Packages showcase your services. An admin selects a package while preparing a client project. Packages have no checkout and never activate or purchase service plans.</p>
    <button className="admin-button" onClick={() => choose({ ...blank, order: catalogue.packages.length }, true)}>New package +</button>
    {catalogue.packages.map(row => <article className="admin-form" key={row.id} style={{ marginTop: 24 }}><h2>{row.name}</h2><p>{row.status} · {categoryLabel(catalogue.categories, row.category)} · ₹{row.quote.finalPrice.toLocaleString("en-IN")} one-time {row.quote.offer ? `with ${row.quote.offer.title}` : "without offer"}</p><div className={s.chips}>{shownOn(row).length ? shownOn(row).map(slug => <span className={s.chip} key={slug}>{pages.find(page => page.slug === slug)?.title}</span>) : <span className={s.warn}>No page assigned</span>}</div><div className="form-actions"><button className="admin-action" onClick={() => choose(row)}>Edit package →</button><button className="admin-action" onClick={() => choose({ ...row, id: "", name: `${row.name} copy`, status: "draft", order: catalogue.packages.length }, true)}>Duplicate</button></div></article>)}
  </div>;
  // A package offer belongs to one package and is linked only from its own offer form.
  const eligible = (catalogue.offers || []).filter(offer => offer.pricingRule && offer.applicableCategories?.includes(item.category) && (!offer.packageId || offer.packageId === item.id));
  const offer = eligible.find(row => row.slug === item.offerSlug);
  const active = offer && now !== null && offer.status === "published" && Date.parse(offer.endsAt) > now;
  const preview = active ? offerFinalPrice(item.regularPrice, offer, item.offerExtraPrice) : item.discountedPrice;
  // The running offer on this package as last saved; while it runs the package keeps that offer.
  const savedRow = creating ? undefined : catalogue.packages.find(row => row.id === item.id);
  const holder = now === null ? undefined : runningOfferForPackage({ id: item.id, offerSlug: savedRow?.offerSlug ?? "" }, catalogue.offers || [], now);
  return <>
    <button className="admin-action" disabled={busy} onClick={() => choose(null)}>← All packages</button>
    <form className="admin-form" onSubmit={save}><fieldset disabled={busy} style={{ border: 0, padding: 0, display: "grid", gap: 18 }}>
      <div className="form-columns"><label className="admin-field"><span>Package name</span><input required maxLength={120} value={item.name} onChange={e => update("name", e.target.value)} /></label><label className="admin-field"><span>Permanent ID</span><input aria-label="Permanent ID" required disabled={!creating} pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={80} value={item.id} onChange={e => update("id", e.target.value)} /><small>Lowercase letters, numbers and hyphens. Fixed after creation.</small></label></div>
      <label className="admin-field"><span>Description</span><textarea required maxLength={500} value={item.description} onChange={e => update("description", e.target.value)} /></label>
      <div className="form-columns"><label className="admin-field"><span>Project category</span><select aria-label="Project category" disabled={!!holder} value={item.category} onChange={e => { update("category", e.target.value); update("offerSlug", ""); }}>{categoryChoices(catalogue.categories, [item.category]).map(({ category: id, label, status }) => <option key={id} value={id}>{label}{status === "archived" ? " (archived)" : ""}</option>)}</select></label><label className="admin-field"><span>Status</span><select aria-label="Status" value={item.status} onChange={e => update("status", e.target.value as SalesPackage["status"])}>{["draft", "published", "archived"].map(value => <option key={value}>{value}</option>)}</select></label></div>
      <fieldset className={s.pages} disabled={pageBusy}><legend>Show on pages</legend>
        {!shownOn(item).length && <p><span className={s.warn}>No page assigned</span> This package is not shown on the website until you tick a page.</p>}
        {!pages.length && <p>No pages yet. Create one below; it appears under Pricing &amp; Packages in the website menu.</p>}
        {pages.map(page => <div className={s.pageRow} key={page.slug}><label><input type="checkbox" checked={!!item.pages?.includes(page.slug)} onChange={e => update("pages", e.target.checked ? [...(item.pages || []), page.slug] : (item.pages || []).filter(slug => slug !== page.slug))} /><span>{page.title} <small>{packagePagePath(page.slug)}</small></span></label><button type="button" className="admin-action" aria-label={`Delete page ${page.title}`} onClick={() => deletePage(page)}>Delete page</button></div>)}
        {pageDraft ? <div className={s.newPage}>
          <label className="admin-field"><span>New page name</span><input aria-label="New page name" maxLength={80} value={pageDraft.title} onChange={e => setPageDraft({ ...pageDraft, title: e.target.value })} /><small>Becomes the menu entry and the link, e.g. Monthly Packages → /packages/monthly-packages. The link cannot be changed later.</small></label>
          <label className="admin-field"><span>Page introduction</span><textarea aria-label="Page introduction" maxLength={500} rows={3} value={pageDraft.intro} onChange={e => setPageDraft({ ...pageDraft, intro: e.target.value })} /><small>Shown under the page heading and used as its search description.</small></label>
          <div className="form-actions"><button type="button" className="admin-button" disabled={pageDraft.title.trim().length < 2 || pageDraft.intro.trim().length < 10} onClick={createPage}>{pageBusy ? "Creating…" : "Create page"}</button><button type="button" className="admin-action" onClick={() => { setPageDraft(null); setPageError(""); }}>Cancel</button></div>
        </div> : <div><button type="button" className="admin-action" onClick={() => setPageDraft({ title: "", intro: "" })}>+ New page</button></div>}
        {pageError && <p className="form-error" role="alert">{pageError}</p>}
      </fieldset>
      <label className="admin-field"><span>Included work (one item per line)</span><textarea aria-label="Included work (one item per line)" required rows={7} value={item.inclusions.join("\n")} onChange={e => update("inclusions", e.target.value.split("\n"))} /><small>List the complete package scope. It is saved with each client project.</small></label>
      <label className="admin-field"><span>Terms & exclusions (one per line)</span><textarea rows={5} value={item.terms.join("\n")} onChange={e => update("terms", e.target.value.split("\n"))} /></label>
      <div className="form-columns"><label className="admin-field"><span>Main price (₹)</span><input aria-label="Main price (₹)" type="number" required min={0} max={10000000} step="0.01" value={item.regularPrice} onChange={e => update("regularPrice", Number(e.target.value))} /></label><label className="admin-field"><span>Discounted price (₹)</span><input aria-label="Discounted price (₹)" type="number" required min={0} max={item.regularPrice} step="0.01" value={item.discountedPrice} onChange={e => update("discountedPrice", Number(e.target.value))} /><small>Customers pay this when no offer applies. Same as the main price means no discount.</small></label><label className="admin-field"><span>Display order</span><input type="number" min={0} max={9999} required value={item.order} onChange={e => update("order", Number(e.target.value))} /></label></div>
      {holder && <p role="note" className={s.warn}>Running offer: <strong>{holder.title}</strong>.{holder.packageId ? " Its struck prices, included work and terms come from this package, so saving here updates that offer page at once." : ""} While it runs, this package cannot be archived, change category or move to another offer. Edit that offer, or let it expire or delete it first.</p>}
      <label className="admin-field"><span>Linked offer</span><select aria-label="Linked offer" disabled={!!holder} value={item.offerSlug} onChange={e => update("offerSlug", e.target.value)}><option value="">No offer — discounted price</option>{item.offerSlug && !eligible.some(row => row.slug === item.offerSlug) && <option value={item.offerSlug}>Current offer needs configuration</option>}{eligible.map(row => <option key={row.slug} value={row.slug}>{row.title} ({row.status})</option>)}</select></label>
      {offer?.pricingRule === "fixed_price" && !offer.packageId && <label className="admin-field"><span>Extra scope above the offer bundle (₹)</span><input type="number" required min={0} max={10000000} step="0.01" value={item.offerExtraPrice} onChange={e => update("offerExtraPrice", Number(e.target.value))} /><small>Example: ₹699 starter + ₹2,000 extra scope = ₹2,699 package price.</small></label>}
      <label className="admin-field"><span>Related portal services (optional references)</span><select aria-label="Related portal services (optional references)" multiple size={5} value={item.linkedPlanIds} onChange={e => update("linkedPlanIds", Array.from(e.target.selectedOptions, option => option.value))}>{(catalogue.plans || []).map(plan => <option key={plan._id} value={plan._id}>{plan.serviceName} ({plan.servicePlan?.purchaseType || "service"})</option>)}</select><small>Reference only. These services are purchased separately through the existing portal plan flow.</small></label>
      <p role="status">Current preview: <strong>₹{Math.round(preview * 100) / 100} one-time</strong>{active ? ` with ${offer.title}` : " — no active offer applies"}. Backend verifies the final amount.</p>
    </fieldset>{error && <p className="form-error" role="alert">{error}</p>}{message && <p role="status">{message}</p>}<button className="admin-button" disabled={busy || (!dirty && !creating)}>{busy ? "Saving…" : "Save package"}</button></form>
  </>;
}
