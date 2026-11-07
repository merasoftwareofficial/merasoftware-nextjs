"use client";
import { useEffect, useRef, useState } from "react";
import Link from "@/components/link";
import { categoryChoices, categoryLabel, type SalesCatalogue, type SalesPackage } from "@/lib/sales-packages";
import { useServerTime } from "@/components/use-server-time";
import { packagePagePath, type PackagePage } from "@/lib/package-pages";
import { DEFAULT_HOLD_HOURS, DEFAULT_RESERVE_WINDOW_HOURS } from "@/lib/offer-reservation-rules";
import { offerDiscountPercent, resolvedTerms, type Offer } from "@/lib/offers";
import { offerRunning } from "@/lib/offer-packages";
import { defaultPackageDesign, inheritedDesign, offerView, packageDesignSchema, packageView, type PackageDesign } from "@/lib/package-design";
import { indiaInputToUtc, toIndiaInput, formatIndiaDateTime } from "@/lib/date-time";
import { PublicInteraction, type ReservationPreview } from "@/components/campaign/public-interaction/page-content";
import s from "./packages-manager.module.css";

// The one package form (src/docs/package-offers.md, owner decisions 7 Nov 2026): 1. the package, 2. its page
// design, 3. an optional offer. The package ID and the offer link are made from their names on first save.
// Nothing about the offer is needed until "Add offer" is pressed; then every field the system needs is.

type Item = SalesPackage & { design: PackageDesign };
type PayMode = "" | "current" | "advance" | "limited_uploads" | "pay_later";
type OfferForm = {
  base?: Offer; title: string; status: "draft" | "published"; offerPrice: string; endsAt: string; payMode: PayMode;
  uploadAllowance: string; dueDays: string; reminders: string; reserveWindowHours: string; reservationHoldHours: string;
};
type Errors = Record<string, string>;

const blank: SalesPackage = { id: "", name: "", description: "", status: "draft", category: "standard_websites", regularPrice: 0, discountedPrice: 0, offerExtraPrice: 0, offerSlug: "", inclusions: [], terms: [], linkedPlanIds: [], order: 0, pages: [] };
const KEYS = Object.keys(blank) as (keyof SalesPackage)[];
const rupee = (value: number) => `₹${Number(value || 0).toLocaleString("en-IN")}`;
const lines = (value: string[]) => value.map(line => line.trim()).filter(Boolean);
const idFromName = (name: string) => name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70).replace(/-+$/, "") || "package";
const offerSlugFromName = (name: string) => name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70).replace(/-+$/, "") || "offer";

// A package saved before page design existed opens with its last offer's design (lib/package-design.ts).
function toItem(row: SalesPackage, offers: Offer[] = []): Item {
  const config = Object.fromEntries(KEYS.map(key => [key, row[key]])) as SalesPackage;
  if (config.discountedPrice === undefined) config.discountedPrice = config.regularPrice;
  if (!config.pages) config.pages = [];
  const design = inheritedDesign(row, offers.filter(offer => offer.packageId === row.id)) ?? defaultPackageDesign(row);
  return { ...config, design: { ...design } };
}
function blankOffer(): OfferForm {
  const end = new Date(Date.now() + 7 * 86400000);
  const day = toIndiaInput(end).slice(0, 10);
  return { title: "", status: "draft", offerPrice: "", endsAt: `${day}T23:59`, payMode: "", uploadAllowance: "1", dueDays: "7", reminders: "-1, 0, 3", reserveWindowHours: "", reservationHoldHours: "" };
}
function formFromOffer(offer: Offer): OfferForm {
  const policy = offer.paymentPolicy;
  return { base: offer, title: offer.title, status: offer.status === "published" ? "published" : "draft", offerPrice: String(offer.offerPrice), endsAt: toIndiaInput(offer.endsAt),
    payMode: policy?.mode ?? "current", uploadAllowance: String(policy?.uploadAllowance || 1), dueDays: String(policy?.dueDays ?? 7),
    reminders: (policy?.reminderOffsets ?? [-1, 0, 3]).join(", "), reserveWindowHours: offer.reserveWindowHours ? String(offer.reserveWindowHours) : "",
    reservationHoldHours: offer.reservationHoldHours ? String(offer.reservationHoldHours) : "" };
}
const reminderList = (value: string) => value.trim() ? value.split(",").map(part => Number(part.trim())) : [];
const hours = (value: string) => value.trim() === "" ? undefined : Number(value);

/** The offer part of a save: what the admin typed; the server adds the package values and checks it all. */
function offerPayload(form: OfferForm, item: Item): Partial<Offer> {
  const mode = (form.payMode || "current") as Exclude<PayMode, "">;
  const payload: Partial<Offer> = {
    ...(form.base ?? {}), title: form.title.trim(), status: form.status, offerPrice: Number(form.offerPrice),
    endsAt: indiaInputToUtc(form.endsAt, true), order: item.order,
    paymentPolicy: { mode, uploadAllowance: mode === "limited_uploads" ? Number(form.uploadAllowance) : 0, dueDays: Number(form.dueDays || 0),
      cycleScope: form.base?.paymentPolicy?.cycleScope ?? "first_purchase", reminderOffsets: reminderList(form.reminders) },
  };
  const window = hours(form.reserveWindowHours), hold = hours(form.reservationHoldHours);
  if (window === undefined) delete payload.reserveWindowHours; else payload.reserveWindowHours = window;
  if (hold === undefined) delete payload.reservationHoldHours; else payload.reservationHoldHours = hold;
  return payload;
}

function check(item: Item, offer: OfferForm | null, now: number): Errors {
  const errors: Errors = {};
  if (!item.name.trim()) errors.name = "Enter the package name.";
  if (!item.description.trim()) errors.description = "Enter a description.";
  if (!lines(item.inclusions).length) errors.inclusions = "List at least one item.";
  if (!(item.regularPrice > 0)) errors.regularPrice = "Enter a main price above ₹0.";
  if (!(item.discountedPrice >= 0) || item.discountedPrice > item.regularPrice) errors.discountedPrice = "Must not be more than the main price.";
  const design = packageDesignSchema.safeParse(item.design);
  if (!design.success) for (const issue of design.error.issues) errors[`design.${String(issue.path[0])}`] ??= issue.message;
  if (offer) {
    const normal = item.discountedPrice;
    if (!offer.title.trim()) errors.offerTitle = "Enter the offer name.";
    if (offer.offerPrice === "") errors.offerPrice = "Enter the offer price.";
    else if (!(Number(offer.offerPrice) >= 0) || Number(offer.offerPrice) >= normal) errors.offerPrice = `Must be below the normal price (${rupee(normal)}).`;
    let end = NaN;
    try { end = Date.parse(indiaInputToUtc(offer.endsAt, true)); } catch { /* reported below */ }
    if (!Number.isFinite(end) || (offer.status === "published" && end <= now)) errors.endsAt = "Choose a date and time in the future.";
    if (!offer.payMode) errors.payMode = "Choose how the project is paid.";
    if (offer.payMode === "limited_uploads" && !(Number.isInteger(Number(offer.uploadAllowance)) && Number(offer.uploadAllowance) >= 1)) errors.uploadAllowance = "Allow at least 1 upload.";
    if (offer.payMode && offer.payMode !== "current") {
      const due = Number(offer.dueDays);
      if (offer.dueDays === "" || !Number.isInteger(due) || due < 0 || due > 365) errors.dueDays = "Between 0 and 365 days.";
      const list = reminderList(offer.reminders);
      if (list.length > 10 || list.some(n => !Number.isInteger(n) || n < -365 || n > 365)) errors.reminders = "Whole days between -365 and 365, separated by commas.";
    }
    for (const key of ["reserveWindowHours", "reservationHoldHours"] as const) {
      const value = hours(offer[key]);
      if (value !== undefined && !(Number.isInteger(value) && value >= 1 && value <= 720)) errors[key] = "Between 1 and 720 hours.";
    }
    if (offer.status === "published" && item.status !== "published") errors.offerStatus = "Publish the package before publishing its offer.";
  }
  return errors;
}

export function PackagesManager({ initial, initialPages, initialOffers, universalTerms, openPackageId }: { initial: SalesCatalogue; initialPages: PackagePage[]; initialOffers: Offer[]; universalTerms: string[]; openPackageId?: string }) {
  const [catalogue, setCatalogue] = useState(initial);
  const [offers, setOffers] = useState(initialOffers);
  const [pages, setPages] = useState(initialPages);
  const [pageDraft, setPageDraft] = useState<{ title: string; intro: string } | null>(null);
  const [pageBusy, setPageBusy] = useState(false);
  const [pageError, setPageError] = useState("");
  const opened = openPackageId ? initial.packages.find(row => row.id === openPackageId) : undefined;
  const [item, setItem] = useState<Item | null>(opened ? toItem(opened, initialOffers) : null);
  const [creating, setCreating] = useState(false);
  const [offerForm, setOfferForm] = useState<OfferForm | null>(null);
  const [baseline, setBaseline] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // After a refused Save, the marked fields follow every change until they are right.
  const [tried, setTried] = useState(false);
  const [message, setMessage] = useState("");
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [previewState, setPreviewState] = useState<ReservationPreview>("normal");
  const preview = useRef<HTMLDialogElement>(null);
  const now = useServerTime();
  const snapshot = (next: Item | null, form: OfferForm | null) => JSON.stringify({ next, form });
  const dirty = !!item && snapshot(item, offerForm) !== baseline;

  // The offer the package form edits: its running offer, else its latest draft. Every other one is history.
  const ownOffers = (id: string) => offers.filter(offer => offer.packageId === id);
  const currentOffer = (id: string) => {
    if (!id || now === null) return undefined;
    const own = ownOffers(id);
    return own.find(offer => offerRunning(offer, now)) ?? own.filter(offer => offer.status === "draft").sort((a, b) => Date.parse(b.endsAt) - Date.parse(a.endsAt))[0];
  };
  // Opening a package from a link (?package=) loads its offer once the clock is known.
  const loadedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!item || creating || now === null || loadedFor.current === item.id) return;
    loadedFor.current = item.id;
    const current = currentOffer(item.id);
    const form = current ? formFromOffer(current) : null;
    setOfferForm(form); setBaseline(snapshot(item, form));
  // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per opened package when the clock is ready
  }, [item?.id, creating, now]);
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
    const config = next ? toItem(next, isNew ? [] : offers) : null;
    const current = config && !isNew && now !== null ? currentOffer(config.id) : undefined;
    const form = current ? formFromOffer(current) : null;
    loadedFor.current = config && !isNew ? config.id : null;
    setItem(config); setCreating(isNew); setOfferForm(form); setBaseline(snapshot(config, form));
    setError(""); setTried(false); setMessage(""); setConfirmEnd(false);
  }
  function update<K extends keyof Item>(key: K, value: Item[K]) {
    setItem(current => {
      if (!current) return current;
      const next = { ...current, [key]: value };
      // A new package's pre-filled heading follows its name until the admin writes their own.
      if (key === "name" && creating && current.design.heading === defaultPackageDesign(current).heading) next.design = { ...current.design, heading: defaultPackageDesign({ name: String(value) }).heading };
      return next;
    });
  }
  function design<K extends keyof PackageDesign>(key: K, value: string) { setItem(current => current ? { ...current, design: { ...current.design, [key]: value } } : current); }
  function offerField<K extends keyof OfferForm>(key: K, value: OfferForm[K]) { setOfferForm(current => current ? { ...current, [key]: value } : current); }
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
      const drop = (row: Item) => ({ ...row, pages: (row.pages || []).filter(slug => slug !== page.slug) });
      setItem(current => current ? drop(current) : current);
      setBaseline(current => { if (!current) return current; const saved = JSON.parse(current); return JSON.stringify({ ...saved, next: saved.next ? drop(saved.next) : saved.next }); });
      await reloadCatalogue();
    } catch (cause) { setPageError(cause instanceof Error ? cause.message : "Could not delete the page."); }
    finally { setPageBusy(false); }
  }

  // One save: everything is checked, then the package (portal) and its offer (website) are written.
  async function send(next: Item, form: OfferForm | null, isNew: boolean, done: string) {
    setBusy(true); setError(""); setMessage("");
    try {
      const config = { ...next, inclusions: lines(next.inclusions), terms: lines(next.terms), ...(isNew ? { id: "" } : {}) };
      const offerPart = form ? { creating: !form.base, offer: offerPayload(form, next) } : undefined;
      const response = await fetch("/api/packages", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ item: config, creating: isNew, ...(offerPart ? { offer: offerPart } : {}) }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Nothing was saved. Please try again.");
      const saved = toItem(result.package as SalesPackage);
      let savedForm = form;
      if (result.offer) {
        const offer = result.offer as Offer;
        setOffers(current => [...current.filter(row => row.slug !== offer.slug), offer]);
        savedForm = offer.status === "archived" ? null : formFromOffer(offer);
      }
      loadedFor.current = saved.id;
      setTried(false); setItem(saved); setCreating(false); setOfferForm(savedForm); setBaseline(snapshot(saved, result.offerError ? form : savedForm)); setConfirmEnd(false);
      setMessage(done.replace("{link}", `/package/${saved.id}`));
      if (result.offerError) { setOfferForm(form); setError(`Package saved, offer not saved: ${result.offerError}`); }
      else if (result.linkError) setError(result.linkError);
      else if (result.unsynced?.length) setError(`Package saved, but these older drafts were not updated: ${result.unsynced.join(", ")}.`);
      await reloadCatalogue();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Nothing was saved. Please try again."); }
    finally { setBusy(false); }
  }
  function save(e: React.FormEvent) {
    e.preventDefault(); if (!item || now === null) return;
    setTried(true); setError(""); setMessage("");
    if (Object.keys(check(item, offerForm, now)).length) return;
    const running = offerForm?.base && offerRunning(offerForm.base, now);
    if (running && !window.confirm(`This updates the live page of "${offerForm!.base!.title}" at once. People who already reserved keep their saved price. Save?`)) return;
    const done = !offerForm ? (creating ? "Package saved. Its page is {link}. No offer: customers see 2 prices." : "Package saved. Existing client agreements stay unchanged.")
      : offerForm.status === "published" ? "Package and offer saved. The offer is live on {link} with 3 prices and the countdown."
      : "Package and offer saved. The offer is a draft: customers still see 2 prices until you publish it.";
    void send(item, offerForm, creating, done);
  }
  // End offer = archive: it leaves the website, the package is back to 2 prices, reservations keep their price.
  function endOffer() {
    if (!item || !offerForm?.base) return;
    void send(JSON.parse(baseline).next as Item, { ...formFromOffer(offerForm.base), status: "archived" as never }, false, "Offer ended. The package page shows 2 prices again.");
  }

  if (!item) return <div>
    <p>Each package has its own page with 2 prices. Add an offer to a package to show 3 prices and a countdown. Packages have no checkout and never activate or purchase service plans.</p>
    <button className="admin-button" onClick={() => choose({ ...blank, order: catalogue.packages.length }, true)}>New package +</button>
    {catalogue.packages.map(row => {
      const running = now === null ? undefined : ownOffers(row.id).find(offer => offerRunning(offer, now));
      const draft = !running && ownOffers(row.id).some(offer => offer.status === "draft");
      return <article className={`admin-form ${s.listRow}`} key={row.id}><h2>{row.name}</h2>
        <p>{row.status} · {categoryLabel(catalogue.categories, row.category)} · {rupee(row.discountedPrice ?? row.regularPrice)} normal price</p>
        <div className={s.chips}>
          {running ? <span className={s.ok}>Offer running: {running.title} · {rupee(running.offerPrice)} · ends {formatIndiaDateTime(running.endsAt)}</span> : draft ? <span className={s.chip}>Draft offer</span> : <span className={s.chip}>No offer</span>}
          {shownOn(row).length ? shownOn(row).map(slug => <span className={s.chip} key={slug}>{pages.find(page => page.slug === slug)?.title}</span>) : <span className={s.warn}>No page assigned</span>}
        </div>
        <div className="form-actions"><button className="admin-action" onClick={() => choose(row)}>Edit package →</button><button className="admin-action" onClick={() => choose({ ...row, id: "", name: `${row.name} copy`, status: "draft", order: catalogue.packages.length, offerSlug: "" }, true)}>Duplicate</button>{row.status === "published" && <Link className="admin-action" href={`/package/${encodeURIComponent(row.id)}`} target="_blank" rel="noreferrer">View page ↗</Link>}</div>
      </article>;
    })}
  </div>;

  const errors: Errors = tried && now !== null ? check(item, offerForm, now) : {};
  const err = (key: string) => errors[key] ? <span className={s.msg}>{errors[key]}</span> : null;
  const bad = (key: string) => errors[key] ? s.bad : undefined;
  const field = (key: keyof PackageDesign, label: string, max: number, required = true, hint?: string) => <label className={`admin-field ${bad(`design.${key}`) ?? ""}`}><span>{label}{required && " *"}</span><input aria-label={label} maxLength={max} value={item.design[key]} onChange={e => design(key, e.target.value)} />{hint && <small>{hint}</small>}{err(`design.${key}`)}</label>;
  const savedOffer = offerForm?.base;
  const running = !!savedOffer && now !== null && offerRunning(savedOffer, now);
  const past = item.id ? ownOffers(item.id).filter(offer => offer.slug !== savedOffer?.slug).sort((a, b) => Date.parse(b.endsAt) - Date.parse(a.endsAt)) : [];
  const lastEnded = !offerForm ? past[0] : undefined;
  const id = creating ? idFromName(item.name) : item.id;
  const offerLink = savedOffer?.slug ?? offerSlugFromName(offerForm?.title ?? "");
  let previewEnd = NaN;
  try { previewEnd = offerForm ? Date.parse(indiaInputToUtc(offerForm.endsAt, true)) : NaN; } catch { /* not a date yet */ }
  const showOffer = !!offerForm && offerForm.offerPrice !== "" && Number.isFinite(previewEnd);
  const base = packageView({ ...item, inclusions: lines(item.inclusions), terms: lines(item.terms), id: id });
  const view = showOffer ? offerView({ ...base, title: offerForm!.title || "Offer name", offerPrice: Number(offerForm!.offerPrice), endsAt: new Date(previewEnd).toISOString(),
    ...(hours(offerForm!.reservationHoldHours) ? { reservationHoldHours: hours(offerForm!.reservationHoldHours) } : {}) }, item) : base;
  const packageTerms = [...new Set([...universalTerms, ...lines(item.terms)])];
  const percent = showOffer ? offerDiscountPercent(view) : 0;
  const leftMs = running ? Date.parse(savedOffer!.endsAt) - (now ?? 0) : 0;
  const payMode = offerForm?.payMode ?? "";

  return <>
    <button className="admin-action" disabled={busy} onClick={() => choose(null)}>← All packages</button>
    <div className={s.layout}>
      <form className={`admin-form ${s.form}`} onSubmit={save} noValidate><fieldset disabled={busy} className={s.fields}>
        {/* 1. Package */}
        <section className={s.sec}><div className={s.sechead}><h2>1. Package</h2><span className={s.tag}>Always required</span></div>
          <label className={`admin-field ${bad("name") ?? ""}`}><span>Package name *</span><input aria-label="Package name" maxLength={120} value={item.name} onChange={e => update("name", e.target.value)} />{err("name")}</label>
          <p className={s.idline}>Link: <code>/package/{id}</code> {creating ? <span>Made from the name when you first save. If it is taken, -2 is added.</span> : <><span className={s.lock}>fixed</span> <span>Renaming the package does not change the link.</span></>}</p>
          <div className="form-columns">
            <label className="admin-field"><span>Project category *</span><select aria-label="Project category" disabled={running} value={item.category} onChange={e => update("category", e.target.value)}>{categoryChoices(catalogue.categories, [item.category]).map(({ category: key, label, status }) => <option key={key} value={key}>{label}{status === "archived" ? " (archived)" : ""}</option>)}</select>{running && <small>Fixed while its offer runs.</small>}</label>
            <label className="admin-field"><span>Package status *</span><select aria-label="Status" value={item.status} onChange={e => update("status", e.target.value as SalesPackage["status"])}><option value="draft">Draft (hidden)</option><option value="published">Published</option>{!running && <option value="archived">Archived</option>}</select></label>
          </div>
          <fieldset className={s.pages} disabled={pageBusy}><legend>Show on pages</legend>
            {!shownOn(item).length && <p><span className={s.warn}>No page assigned</span> This package is not listed on a Pricing &amp; Packages page until you tick one. Its own page still works.</p>}
            {!pages.length && <p>No pages yet. Create one below; it appears under Pricing &amp; Packages in the website menu.</p>}
            {pages.map(page => <div className={s.pageRow} key={page.slug}><label><input type="checkbox" checked={!!item.pages?.includes(page.slug)} onChange={e => update("pages", e.target.checked ? [...(item.pages || []), page.slug] : (item.pages || []).filter(slug => slug !== page.slug))} /><span>{page.title} <small>{packagePagePath(page.slug)}</small></span></label><button type="button" className="admin-action" aria-label={`Delete page ${page.title}`} onClick={() => deletePage(page)}>Delete page</button></div>)}
            {pageDraft ? <div className={s.newPage}>
              <label className="admin-field"><span>New page name</span><input aria-label="New page name" maxLength={80} value={pageDraft.title} onChange={e => setPageDraft({ ...pageDraft, title: e.target.value })} /><small>Becomes the menu entry and the link, e.g. Monthly Packages → /packages/monthly-packages. The link cannot be changed later.</small></label>
              <label className="admin-field"><span>Page introduction</span><textarea aria-label="Page introduction" maxLength={500} rows={3} value={pageDraft.intro} onChange={e => setPageDraft({ ...pageDraft, intro: e.target.value })} /><small>Shown under the page heading and used as its search description.</small></label>
              <div className="form-actions"><button type="button" className="admin-button" disabled={pageDraft.title.trim().length < 2 || pageDraft.intro.trim().length < 10} onClick={createPage}>{pageBusy ? "Creating…" : "Create page"}</button><button type="button" className="admin-action" onClick={() => { setPageDraft(null); setPageError(""); }}>Cancel</button></div>
            </div> : <div><button type="button" className="admin-action" onClick={() => setPageDraft({ title: "", intro: "" })}>+ New page</button></div>}
            {pageError && <p className="form-error" role="alert">{pageError}</p>}
          </fieldset>
          <label className={`admin-field ${bad("description") ?? ""}`}><span>Description *</span><textarea aria-label="Description" maxLength={500} value={item.description} onChange={e => update("description", e.target.value)} /><small>Shown on the package card and under the page heading.</small>{err("description")}</label>
          <div className="form-columns">
            <label className={`admin-field ${bad("inclusions") ?? ""}`}><span>Included work (one per line) *</span><textarea aria-label="Included work (one item per line)" rows={6} value={item.inclusions.join("\n")} onChange={e => update("inclusions", e.target.value.split("\n"))} /><small>Saved with each client project.</small>{err("inclusions")}</label>
            <label className="admin-field"><span>Terms &amp; exclusions (one per line)</span><textarea aria-label="Terms & exclusions" rows={6} value={item.terms.join("\n")} onChange={e => update("terms", e.target.value.split("\n"))} /></label>
          </div>
          <div className={s.cols3}>
            <label className={`admin-field ${bad("regularPrice") ?? ""}`}><span>Main price (₹) *</span><input aria-label="Main price (₹)" type="number" min={0} max={10000000} step="0.01" value={item.regularPrice} onChange={e => update("regularPrice", Number(e.target.value))} /><small>Shown crossed out.</small>{err("regularPrice")}</label>
            <label className={`admin-field ${bad("discountedPrice") ?? ""}`}><span>Normal price (₹) *</span><input aria-label="Normal price (₹)" type="number" min={0} max={10000000} step="0.01" value={item.discountedPrice} onChange={e => update("discountedPrice", Number(e.target.value))} /><small>What the customer pays when no offer runs.</small>{err("discountedPrice")}</label>
            <label className="admin-field"><span>Display order</span><input aria-label="Display order" type="number" min={0} max={9999} value={item.order} onChange={e => update("order", Number(e.target.value))} /></label>
          </div>
          <label className="admin-field"><span>Related portal services (optional references)</span><select aria-label="Related portal services (optional references)" multiple size={4} value={item.linkedPlanIds} onChange={e => update("linkedPlanIds", Array.from(e.target.selectedOptions, option => option.value))}>{(catalogue.plans || []).map(plan => <option key={plan._id} value={plan._id}>{plan.serviceName} ({plan.servicePlan?.purchaseType || "service"})</option>)}</select><small>Reference only. These services are purchased separately through the portal plan flow.</small></label>
        </section>

        {/* 2. Page design */}
        <section className={s.sec}><div className={s.sechead}><h2>2. Page design</h2><span className={s.tag}>Always required</span></div>
          <p className={s.note}>The design of this package&apos;s page, with or without an offer. Pre-filled for a new package, so you only change what you want.</p>
          <div className="form-columns">{field("eyebrow", "Eyebrow text", 100)}{field("badge", "Card badge", 60, true, "While an offer runs, a % OFF badge is added by itself.")}</div>
          <div className="form-columns">{field("heading", "Main heading", 160)}{field("headingHighlight", "Highlighted heading text", 120, false)}</div>
          <div className="form-columns">{field("supportingLine", "Supporting line", 200, false)}{field("subheading", "Benefits subheading", 160)}</div>
          <div className="form-columns">{field("tagline", "Price-card tagline", 100)}{field("priceDescription", "Short price description", 200)}</div>
          <div className="form-columns">{field("ctaLabel", "Enquiry button text", 80)}{field("contactHref", "Contact link", 500, true, "mailto:, tel: or an https link.")}</div>
        </section>

        {/* 3. Offer */}
        <section className={s.sec}><div className={s.sechead}><h2>3. Offer</h2><span className={running ? s.tagRun : lastEnded ? s.tagEnd : s.tagOpt}>{running ? "Running" : offerForm ? (savedOffer ? "Draft" : "Being added") : lastEnded ? "Ended" : "Optional"}</span></div>
          {!offerForm && !lastEnded && <div className={s.emptyOffer}><p><b>No offer on this package.</b> The package page shows 2 prices (main crossed out + normal price) and no countdown. You can save the package without touching anything here.</p><button type="button" className="admin-action" onClick={() => setOfferForm(blankOffer())}>+ Add offer</button></div>}
          {!offerForm && lastEnded && <>
            <p className={s.warnNote}>The last offer &quot;{lastEnded.title}&quot; {lastEnded.status === "archived" ? "was ended" : `ended on ${formatIndiaDateTime(lastEnded.endsAt)}`}. The page is back to 2 prices. Customers who reserved keep their price until their hold ends.</p>
            <div><button type="button" className="admin-action" onClick={() => setOfferForm(blankOffer())}>+ Start new offer</button></div>
          </>}
          {offerForm && <div className={s.offerBox}>
            {running && <p className={s.idline}><span className={s.tagRun}>Running</span> Ends in <b>{Math.floor(leftMs / 86400000)}d {Math.floor(leftMs / 3600000) % 24}h</b>. Edit and save to update the live page. <Link className="admin-action" href={`/admin/offers/targets/${encodeURIComponent(savedOffer!.slug)}`}>Target people →</Link></p>}
            <div className="form-columns">
              <label className={`admin-field ${bad("offerTitle") ?? ""}`}><span>Offer name *</span><input aria-label="Offer name" maxLength={120} placeholder="e.g. Diwali Launch Offer" value={offerForm.title} onChange={e => offerField("title", e.target.value)} /><small>Shown on the card, sticky bar, emails and My offers.</small>{err("offerTitle")}</label>
              <label className={`admin-field ${bad("offerStatus") ?? ""}`}><span>Offer status *</span><select aria-label="Offer status" value={offerForm.status} onChange={e => offerField("status", e.target.value as OfferForm["status"])}><option value="draft">Draft (not on the website)</option><option value="published">Published</option></select>{err("offerStatus")}</label>
            </div>
            <p className={s.idline}>Offer link: <code>/offer/{offerLink}</code> <span className={s.lock}>auto</span> <span>Opens this package page. Made from the offer name; never reused.</span></p>
            <p className={s.inherit}>From the package (not typed again): main price <b>{rupee(item.regularPrice)}</b> · normal price <b>{rupee(item.discountedPrice)}</b> · category, included work, terms and page design.</p>
            <div className="form-columns">
              <label className={`admin-field ${bad("offerPrice") ?? ""}`}><span>Offer price (₹) *</span><input aria-label="Offer price (₹)" type="number" min={0} max={10000000} step="0.01" value={offerForm.offerPrice} onChange={e => offerField("offerPrice", e.target.value)} /><small>{percent ? `Shown as ${percent}% OFF the main price.` : "Must be below the normal price."}</small>{err("offerPrice")}</label>
              <label className={`admin-field ${bad("endsAt") ?? ""}`}><span>Expires at (India time / IST) *</span><input aria-label="Expires at (India time / IST)" type="datetime-local" value={offerForm.endsAt} onChange={e => offerField("endsAt", e.target.value)} /><small>One fixed deadline. Starts the countdown.</small>{err("endsAt")}</label>
            </div>
            <label className={`admin-field ${bad("payMode") ?? ""}`}><span>Payment rule *</span><select aria-label="Payment rule" value={payMode} onChange={e => offerField("payMode", e.target.value as PayMode)}><option value="" disabled>Choose a payment rule</option><option value="current">Keep current system rules</option><option value="advance">Advance payment</option><option value="limited_uploads">Limited uploads before payment</option><option value="pay_later">Pay later (uploads stay available)</option></select><small>Frozen onto each project started with this offer.</small>{err("payMode")}</label>
            {payMode && payMode !== "current" && <div className={s.dep}>
              <div className="form-columns">
                {payMode === "limited_uploads" && <label className={`admin-field ${bad("uploadAllowance") ?? ""}`}><span>Uploads allowed before payment *</span><input aria-label="Pre-payment upload allowance" type="number" min={1} max={10000} value={offerForm.uploadAllowance} onChange={e => offerField("uploadAllowance", e.target.value)} />{err("uploadAllowance")}</label>}
                <label className={`admin-field ${bad("dueDays") ?? ""}`}><span>Payment due after (days) *</span><input aria-label="Payment due days" type="number" min={0} max={365} value={offerForm.dueDays} onChange={e => offerField("dueDays", e.target.value)} /><small>From project creation.</small>{err("dueDays")}</label>
              </div>
              <label className={`admin-field ${bad("reminders") ?? ""}`}><span>Reminder days around the due date</span><input aria-label="Reminder offsets" value={offerForm.reminders} onChange={e => offerField("reminders", e.target.value)} /><small>-1, 0, 3 = one day before, on the day, three days after. Empty = no reminders.</small>{err("reminders")}</label>
            </div>}
            <div className="form-columns">
              <label className={`admin-field ${bad("reserveWindowHours") ?? ""}`}><span>Reserve opens (hours before the end)</span><input aria-label="Reserve opens (hours before the offer ends)" type="number" min={1} max={720} placeholder={String(DEFAULT_RESERVE_WINDOW_HOURS)} value={offerForm.reserveWindowHours} onChange={e => offerField("reserveWindowHours", e.target.value)} /><small>Empty = {DEFAULT_RESERVE_WINDOW_HOURS} hours.</small>{err("reserveWindowHours")}</label>
              <label className={`admin-field ${bad("reservationHoldHours") ?? ""}`}><span>Reservation lasts (hours)</span><input aria-label="Reservation lasts (hours)" type="number" min={1} max={720} placeholder={String(DEFAULT_HOLD_HOURS)} value={offerForm.reservationHoldHours} onChange={e => offerField("reservationHoldHours", e.target.value)} /><small>Empty = {DEFAULT_HOLD_HOURS} hours. New reservations only.</small>{err("reservationHoldHours")}</label>
            </div>
            <div className={s.row}>
              {!savedOffer && <button type="button" className="admin-action" onClick={() => setOfferForm(null)}>Remove offer</button>}
              {savedOffer && !confirmEnd && <button type="button" className="admin-action is-danger" disabled={dirty} title={dirty ? "Save or discard your changes first." : undefined} onClick={() => setConfirmEnd(true)}>{running ? "End offer" : "Delete draft offer"}</button>}
            </div>
            {confirmEnd && savedOffer && <p className={s.warnNote}>{running ? `End "${savedOffer.title}" now? It leaves the website and the package goes back to 2 prices. People who reserved keep their price.` : `Delete the draft "${savedOffer.title}"? It stays under past offers.`} <button type="button" className="admin-button danger" onClick={endOffer}>{running ? "End offer" : "Delete draft"}</button> <button type="button" className="admin-action" onClick={() => setConfirmEnd(false)}>Keep it</button></p>}
          </div>}
          {past.length > 0 && <div className={s.past}><span>Past offers (read only)</span>{past.map(offer => <div key={offer.slug}><b>{offer.title}</b><small>{rupee(offer.offerPrice)} · {offer.status === "archived" ? "ended (archived)" : offer.status === "draft" ? "draft" : `ended ${formatIndiaDateTime(offer.endsAt)}`}</small></div>)}</div>}
        </section>
      </fieldset>
      <div className={s.savebar}>
        <div className={s.result}>{Object.keys(errors).length > 0 && <p className="form-error" role="alert">Nothing was saved. Fix the marked fields first.</p>}{error && <p className="form-error" role="alert">{error}</p>}{message && <p role="status">{message}</p>}</div>
        <div className={s.row}><button type="button" className="admin-action" disabled={busy || !dirty} onClick={() => { const saved = JSON.parse(baseline); setItem(saved.next); setOfferForm(saved.form); setTried(false); setError(""); }}>Discard changes</button><button className="admin-button" disabled={busy || (!dirty && !creating)}>{busy ? "Saving…" : offerForm ? "Save package & offer" : "Save package"}</button></div>
      </div>
      </form>

      {/* Live customer preview: no request is made. */}
      <aside className={s.aside} aria-label="Customer preview">
        <div className={s.pvHead}><h3>Customer sees</h3><select aria-label="Preview state" disabled={!showOffer} value={showOffer ? previewState : "normal"} onChange={e => setPreviewState(e.target.value as ReservationPreview)}><option value="normal">Normal</option><option value="open">Reserve open</option><option value="reserved">Reserved</option></select></div>
        <p className={s.url}>merasoftware.com/package/{id}</p>
        <div className={s.pcard}>
          <p className={s.eb}>{item.design.eyebrow}</p>
          <p className={s.h}>{item.design.heading}{item.design.headingHighlight && <em>{item.design.headingHighlight}</em>}</p>
          <div className={s.ptop}><span>{item.design.tagline}</span><b>{item.design.badge}</b></div>
          <p className={s.ptitle}>{showOffer ? offerForm!.title || "Offer name" : item.name || "Package name"}</p>
          {showOffer ? <><p className={s.old}><del>{rupee(item.regularPrice)}</del> → <del>{rupee(item.discountedPrice)}</del></p><p className={s.deal}><small>OFFER PRICE {percent > 0 && <b>{percent}% OFF</b>}</small><strong>{rupee(Number(offerForm!.offerPrice))}</strong></p><p className={s.timer}>Countdown to {formatIndiaDateTime(new Date(previewEnd).toISOString())}</p></>
            : <>{item.regularPrice > item.discountedPrice && <p className={s.old}><del>{rupee(item.regularPrice)}</del></p>}<p className={s.deal}><small>PRICE</small><strong>{rupee(item.discountedPrice)}</strong></p></>}
          <p className={s.pd}>{item.design.priceDescription}</p>
          <p className={s.cta}>{showOffer ? (previewState === "open" ? `Reserve price for ${hours(offerForm!.reservationHoldHours) || DEFAULT_HOLD_HOURS} hours` : previewState === "reserved" ? "Start my project · time left" : item.design.ctaLabel) : "Start my project"} →</p>
        </div>
        <p className={s.note}>{showOffer ? "Offer mode: 3 prices and the countdown. When it ends the page shows 2 prices again without a reload." : "Package mode: 2 prices, no countdown. The main button is Start my project."}{offerForm?.status === "draft" && showOffer ? " This offer is a draft: customers still see package mode." : ""}</p>
        <button type="button" className="admin-action" onClick={() => preview.current?.showModal()}>Preview full page ↗</button>
      </aside>
    </div>
    <dialog ref={preview} className={s.preview} aria-label="Package page preview" onClick={e => { if (e.target === e.currentTarget) preview.current?.close(); }}>
      <div className={s.previewBar}><strong>Unsaved page preview</strong><button type="button" className="admin-button" onClick={() => preview.current?.close()}>Close preview</button></div>
      <PublicInteraction offer={view} terms={showOffer ? resolvedTerms(view, universalTerms) : packageTerms} preview previewReservation={showOffer ? previewState : "normal"}
        pkg={{ id, name: item.name || "Package name", live: showOffer, back: { href: "#", label: "Packages" }, packageTerms }} />
    </dialog>
  </>;
}
