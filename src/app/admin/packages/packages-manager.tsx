"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "@/components/link";
import { categoryChoices, categoryLabel, PACKAGE_PAYMENT_OPTIONS, priceUnit, type AddOn, type PackageCycle, type PackageDraft, type PackageMonthly, type SalesCatalogue, type SalesPackage } from "@/lib/sales-packages";
import { addOnLine, addOnOffered, choicesForCategory, isAddOnLine, previewPrice, termsBoxText, typedFromTermsBox, typedTermsOf, type SavedPricing } from "@/lib/package-pricing";
import { PackagePriceBuilder } from "./package-price-builder";
import { readPriceMode, rememberPriceMode, type PriceMode } from "@/lib/package-price-mode";
import { AddOnDialog } from "@/components/add-on-dialog";
import { CYCLE_MONTHS, PURCHASE_LABELS } from "@/lib/public-plans";
import { useServerTime } from "@/components/use-server-time";
import { packagePagePath, type PackagePage } from "@/lib/package-pages";
import { DEFAULT_HOLD_HOURS, DEFAULT_RESERVE_WINDOW_HOURS } from "@/lib/offer-reservation-rules";
import { offerDiscountPercent, resolvedTerms, type Offer } from "@/lib/offers";
import { offerRunning } from "@/lib/offer-packages";
import { defaultPackageDesign, inheritedDesign, offerView, packageDesignSchema, packageView, type PackageDesign } from "@/lib/package-design";
import { indiaInputToUtc, toIndiaInput, formatIndiaDateTime, formatIndiaDate } from "@/lib/date-time";
import { adminEntry, arrangePackages, categoryFilterChoices, draftEntry, typeFilterChoices, usableOptions, type Entry, type PackageListOptions, type PackageSort } from "@/lib/package-list";
import { ADMIN_DEFAULT_SORT, readAdminSort, rememberAdminSort } from "@/lib/package-sort-memory";
import { PublicInteraction, type ReservationPreview } from "@/components/campaign/public-interaction/page-content";
import { ProjectCategoryDialog } from "@/components/project-category-dialog";
import type { ProjectCategory as SavedCategory } from "@/lib/service-plans";
import s from "./packages-manager.module.css";

// The one package form (src/docs/project.md, owner decisions 9 Nov 2026): 1. the project it sells (name, category,
// how it is bought, price, included work), 2. an optional offer, 3. where the website shows it, 4. its page design.
// The package ID and the offer link are made from their names on first save.
// Nothing about the offer is needed until "Add offer" is pressed; then every field the system needs is.
// Save draft keeps the whole form as a working copy with only the package name (and the offer name) filled;
// nothing in prices, pages or the portal sees it. Publish checks everything and makes it live. A published
// package keeps its own copy until "Publish changes" or "Discard draft" (owner decisions 7 Nov 2026).

// repriceFromCurrent: "Update to current prices" was pressed; it is sent with the save and is not kept on the package.
type Item = SalesPackage & { design: PackageDesign; repriceFromCurrent?: boolean };
type PayMode = "" | "current" | "advance" | "limited_uploads" | "pay_later";
type OfferForm = {
  base?: Offer; title: string; status: "draft" | "published"; offerPrice: string; endsAt: string; payMode: PayMode;
  advanceType: "fixed" | "percentage"; advanceValue: string; uploadAllowance: string; dueDays: string; reminders: string; reserveWindowHours: string; reservationHoldHours: string;
};
type Errors = Record<string, string>;
// A new project category is saved by the portal backend through the plan catalogue route, as the plan form does.
async function sendCategory<T>(body: Record<string, unknown>): Promise<T> {
  const response = await fetch("/api/plans", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "The portal did not accept this. Please try again.");
  return result as T;
}

// A new package starts one-time and fully paid; whether it has portal uploads and its category are always chosen.
const blank: SalesPackage = { id: "", name: "", description: "", status: "draft", category: "", regularPrice: 0, discountedPrice: 0, offerExtraPrice: 0, offerSlug: "", inclusions: [], terms: [], linkedPlanIds: [], order: 0, pages: [],
  billing: "one_time", portalUploads: undefined, paymentOptions: ["full"], monthly: undefined,
  // A new one-time package is priced from its category and add-ons (services: []); an older package has none and keeps its typed price.
  services: [], pricing: undefined };
// A package switched to monthly starts billed every month, for up to a year, at one fixed monthly price, with
// unlimited updates when it has portal uploads (src/docs/monthlypackage.md; no price per file).
const blankMonthly: PackageMonthly = { billingOptions: [{ billingCycle: "monthly", discountPercent: 0 }], maxTenureMonths: 12, uploadsPerMonth: null };
// Only today's monthly settings: a copy saved with the old price-per-file fields loses them (the portal refuses them).
const cleanMonthly = (raw: Partial<PackageMonthly> & Record<string, unknown>): PackageMonthly => ({
  billingOptions: Array.isArray(raw.billingOptions) ? raw.billingOptions : blankMonthly.billingOptions,
  maxTenureMonths: Number.isInteger(raw.maxTenureMonths) ? Number(raw.maxTenureMonths) : 12,
  uploadsPerMonth: Number.isInteger(raw.uploadsPerMonth) ? Number(raw.uploadsPerMonth) : null });
const CYCLES = Object.keys(CYCLE_MONTHS) as PackageCycle[];
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
  // What the form edits of the frozen pricing is only which add-ons and how many. A hand-priced package has none (its row has no
  // services either); a new package starts with an empty list, so it is priced from its category and add-ons.
  if (row.pricing) config.services = row.pricing.services.map(({ featureId, quantity }) => ({ featureId, quantity }));
  // The form holds only the admin's own terms; the automatic ones (category and add-ons) come from the selection and are shown read-only.
  config.terms = typedTermsOf(row.terms ?? [], row.pricing);
  const design = inheritedDesign(row, offers.filter(offer => offer.packageId === row.id)) ?? defaultPackageDesign(row);
  // Live packages are published or archived; an older hidden package goes live when it is published.
  if (config.status === "draft") config.status = "published";
  return { ...config, design: { ...design } };
}
// A new offer still marked draft is not published with the package; it stays in the working copy.
const keptOffer = (form: OfferForm | null) => form && !form.base && form.status === "draft" ? form : null;
const ENDED_NOTE ="The offer in this draft was ended meanwhile, so it was left out. Add a new offer if you want one.";
// A working copy holds the form as typed. Its offer is matched to that offer as it is now: one that was ended
// meanwhile is left out, so it is never published again.
function fromDraft(draft: PackageDraft, offers: Offer[]): { item: Item; form: OfferForm | null; dropped: boolean } {
  const raw = draft.data.item as Partial<Item>;
  const item: Item = { ...blank, status: "published", ...raw, id: draft.packageId, name: String(raw.name ?? draft.name),
    inclusions: Array.isArray(raw.inclusions) ? raw.inclusions : [], terms: Array.isArray(raw.terms) ? raw.terms : [],
    linkedPlanIds: Array.isArray(raw.linkedPlanIds) ? raw.linkedPlanIds : [], pages: Array.isArray(raw.pages) ? raw.pages : [],
    // Only what the copy holds: an older package's copy gets no purchase settings it never had.
    billing: raw.billing, portalUploads: raw.portalUploads, paymentOptions: raw.paymentOptions, monthly: raw.monthly ? cleanMonthly(raw.monthly as PackageMonthly & Record<string, unknown>) : undefined,
    // A copy made before add-on pricing has no services and keeps its typed price; nothing is filled in for it.
    services: Array.isArray(raw.services) ? raw.services : undefined, pricing: raw.pricing, repriceFromCurrent: raw.repriceFromCurrent === true ? true : undefined,
    design: { ...defaultPackageDesign({ name: String(raw.name ?? draft.name) }), ...(raw.design ?? {}) } };
  const saved = draft.data.offer as OfferForm | null | undefined;
  if (!saved) return { item, form: null, dropped: false };
  if (!saved.base) return { item, form: { ...blankOffer(), ...saved }, dropped: false };
  const base = offers.find(offer => offer.slug === saved.base!.slug);
  if (!base || base.status === "archived") return { item, form: null, dropped: true };
  return { item, form: { ...saved, base }, dropped: false };
}
function blankOffer(): OfferForm {
  const end = new Date(Date.now() + 7 * 86400000);
  const day = toIndiaInput(end).slice(0, 10);
  return { title: "", status: "draft", offerPrice: "", endsAt: `${day}T23:59`, payMode: "", advanceType: "fixed", advanceValue: "", uploadAllowance: "1", dueDays: "7", reminders: "-1, 0, 3", reserveWindowHours: "", reservationHoldHours: "" };
}
function formFromOffer(offer: Offer): OfferForm {
  const policy = offer.paymentPolicy;
  return { base: offer, title: offer.title, status: offer.status === "published" ? "published" : "draft", offerPrice: String(offer.offerPrice), endsAt: toIndiaInput(offer.endsAt),
    payMode: policy?.mode ?? "current", advanceType: policy?.minimumAdvance?.type ?? "fixed", advanceValue: policy?.minimumAdvance ? String(policy.minimumAdvance.value) : "", uploadAllowance: String(policy?.uploadAllowance || 1), dueDays: String(policy?.dueDays ?? 7),
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
    paymentPolicy: { mode, ...(mode === "advance" && form.advanceValue ? { minimumAdvance: { type: form.advanceType, value: Number(form.advanceValue) } } : {}), uploadAllowance: mode === "limited_uploads" ? Number(form.uploadAllowance) : 0, dueDays: Number(form.dueDays || 0),
      cycleScope: form.base?.paymentPolicy?.cycleScope ?? "first_purchase", reminderOffsets: reminderList(form.reminders) },
  };
  const window = hours(form.reserveWindowHours), hold = hours(form.reservationHoldHours);
  if (window === undefined) delete payload.reserveWindowHours; else payload.reserveWindowHours = window;
  if (hold === undefined) delete payload.reservationHoldHours; else payload.reservationHoldHours = hold;
  return payload;
}

function check(item: Item, offer: OfferForm | null, now: number, extra: Errors = {}): Errors {
  const errors: Errors = {};
  if (!item.name.trim()) errors.name = "Enter the package name.";
  if (!item.category) errors.category = "Choose a project category.";
  if (!item.description.trim()) errors.description = "Enter a description.";
  if (!lines(item.inclusions).length) errors.inclusions = "List at least one item.";
  if (!(item.regularPrice > 0)) errors.regularPrice = item.services !== undefined ? "The main price must be above ₹0: set the category's base price or tick an add-on." : "Enter a main price above ₹0.";
  if (!(item.discountedPrice >= 0) || item.discountedPrice > item.regularPrice) errors.discountedPrice = "Must not be more than the main price.";
  // How customers buy it: all three together (package.md decision 7). An older package without them may stay as it is.
  if (item.billing || item.portalUploads !== undefined || item.paymentOptions?.length) {
    if (!item.billing) errors.billing = "Choose how this package is billed.";
    if (item.portalUploads === undefined) errors.portalUploads = "Choose whether the client sends files in the portal.";
    if (item.billing !== "monthly" && !item.paymentOptions?.length) errors.paymentOptions = "Tick at least one way to pay.";
  }
  // A monthly package (src/docs/monthlypackage.md); the portal backend checks the same rules again (servicePlanPricing.js).
  const m = item.billing === "monthly" ? item.monthly : undefined;
  if (m) {
    const whole = (value: unknown, min: number, max: number) => Number.isInteger(value) && Number(value) >= min && Number(value) <= max;
    if (!m.billingOptions.length) errors.monthlyCycles = "Tick at least one billing cycle.";
    else if (m.billingOptions.some(option => !(option.discountPercent >= 0 && option.discountPercent < 100))) errors.monthlyCycles = "Discounts are from 0 up to 99%.";
    if (!whole(m.maxTenureMonths, 1, 12)) errors.monthlyLength = "From 1 to 12 months.";
    else if (m.billingOptions.some(option => CYCLE_MONTHS[option.billingCycle] > m.maxTenureMonths)) errors.monthlyLength = "Must not be shorter than a ticked billing cycle.";
    if (item.portalUploads && m.uploadsPerMonth !== null && m.uploadsPerMonth !== undefined && !whole(m.uploadsPerMonth, 1, 31)) errors.monthlyUploads = "From 1 to 31 updates a month, or unlimited.";
  }
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
    if (offer.payMode === "advance" && (!(Number(offer.advanceValue) > 0) || (offer.advanceType === "percentage" && Number(offer.advanceValue) > 100))) errors.advanceValue = offer.advanceType === "percentage" ? "Enter a percentage from 0.01 to 100." : "Enter a minimum advance above ₹0.";
    if (offer.payMode === "advance" && item.billing === "monthly") errors.payMode = "Advance token payment is only for one-time project packages.";
    if (offer.payMode === "advance" && offer.advanceType === "fixed" && Number(offer.advanceValue) > Number(offer.offerPrice)) errors.advanceValue = "Cannot exceed the offer price.";
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
  return { ...errors, ...extra };
}

// The list's filter and sort (lib/package-list.ts, owner decisions 12 Nov 2026): type and category chips only for what the open
// tab has, and a sort that opens by "Recently modified" and then remembers the admin's last pick (lib/package-sort-memory.ts).
const ADMIN_SORTS: { value: PackageSort; label: string }[] = [
  { value: "modified", label: "Recently modified" },
  { value: "added", label: "Recently added" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
  { value: "default", label: "Display order" },
];
const noSubscription = () => () => {};
type ListLine = { row: SalesPackage; copyLine: boolean } | { draft: PackageDraft };
function FilterChips({ label, choices, selected, onPick }: { label: string; choices: { value: string; label: string; count: number }[]; selected: string; onPick: (value: string) => void }) {
  return <div className={s.filterRow} role="group" aria-label={`Filter by ${label.toLowerCase()}`}>
    <span className={s.filterLabel}>{label}</span>
    {choices.map(choice => <button key={choice.value} type="button" className={selected === choice.value ? s.filterOn : s.filterBtn} aria-pressed={selected === choice.value} onClick={() => onPick(choice.value)}>{choice.label} <span className={s.count}>{choice.count}</span></button>)}
  </div>;
}

export function PackagesManager({ initial, initialPages, initialOffers, universalTerms, openPackageId }: { initial: SalesCatalogue; initialPages: PackagePage[]; initialOffers: Offer[]; universalTerms: string[]; openPackageId?: string }) {
  const [catalogue, setCatalogue] = useState(initial);
  const [offers, setOffers] = useState(initialOffers);
  const [pages, setPages] = useState(initialPages);
  const [listTab, setListTab] = useState<"live" | "drafts" | "archived">("live");
  const [listFilter, setListFilter] = useState<Pick<PackageListOptions, "type" | "category">>({ type: "all", category: "all" });
  // The sort the admin picked this visit wins; before a pick, the one remembered in this browser (server and first paint use the default).
  const rememberedSort = useSyncExternalStore(noSubscription, () => readAdminSort(), () => ADMIN_DEFAULT_SORT);
  const [pickedSort, setPickedSort] = useState<PackageSort | null>(null);
  const listSort = pickedSort ?? rememberedSort;
  const pickSort = (sort: PackageSort) => { setPickedSort(sort); rememberAdminSort(sort); };
  const [pageDraft, setPageDraft] = useState<{ title: string; intro: string } | null>(null);
  const [pageBusy, setPageBusy] = useState(false);
  const [pageError, setPageError] = useState("");
  const [drafts, setDrafts] = useState<PackageDraft[]>(initial.drafts ?? []);
  // ?package=<id> opens its working copy when it has one, else the live package.
  const openedDraft = openPackageId ? (initial.drafts ?? []).find(row => row.packageId === openPackageId) : undefined;
  const opened = openPackageId && !openedDraft ? initial.packages.find(row => row.id === openPackageId) : undefined;
  const openedCopy = openedDraft ? fromDraft(openedDraft, initialOffers) : undefined;
  const [item, setItem] = useState<Item | null>(openedCopy?.item ?? (opened ? toItem(opened, initialOffers) : null));
  // creating = not live yet: a new package, or a draft that was never published.
  const [creating, setCreating] = useState(!!openedDraft && !initial.packages.some(row => row.id === openPackageId));
  const [offerForm, setOfferForm] = useState<OfferForm | null>(openedCopy?.form ?? null);
  // The working copy's version (0 = no copy saved yet); a save or publish from an older one is refused.
  const [draftVersion, setDraftVersion] = useState(openedDraft?.version ?? 0);
  const [baseline, setBaseline] = useState(openedCopy ? JSON.stringify({ next: openedCopy.item, form: openedCopy.form }) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(openedCopy?.dropped ? ENDED_NOTE : "");
  // After a refused Save, the marked fields follow every change until they are right.
  const [tried, setTried] = useState(false);
  const [message, setMessage] = useState("");
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [previewState, setPreviewState] = useState<ReservationPreview>("normal");
  const [newCategory, setNewCategory] = useState(false);
  const [categoryNote, setCategoryNote] = useState("");
  const [editCategory, setEditCategory] = useState(false);
  const [addOnDialog, setAddOnDialog] = useState<{ edit?: AddOn } | null>(null);
  const preview = useRef<HTMLDialogElement>(null);
  const now = useServerTime();
  const snapshot = (next: Item | null, form: OfferForm | null) => JSON.stringify({ next, form });
  const dirty = !!item && snapshot(item, offerForm) !== baseline;

  // A package is priced from its category and add-on services (package-price-builder.tsx, lib/package-pricing.ts); the portal
  // backend reads the real prices and freezes them on save. A monthly package's parts make its monthly price (owner decision
  // 11 Nov 2026). A package saved before this keeps its typed price.
  const addOns = catalogue.addOns ?? [];
  const savedRow = item?.id ? catalogue.packages.find(row => row.id === item.id) : undefined;
  const savedPricing: SavedPricing = savedRow?.pricing ? { category: savedRow.category, pricing: savedRow.pricing } : undefined;
  const autoPriced = !!item && !!item.billing && item.services !== undefined;
  const categoryEntry = item ? (catalogue.categories ?? []).find(row => row.category === item.category) : undefined;
  const auto = autoPriced && item && item.category ? previewPrice({ category: item.category, basePrice: categoryEntry?.basePrice, categoryTerms: categoryEntry?.terms ?? [], choices: item.services ?? [], addOns, saved: savedPricing, refresh: item.repriceFromCurrent === true }) : null;
  const autoErrors: Errors = auto?.problems.length ? { services: auto.problems[0] } : {};
  const autoTotal = auto?.total ?? null;
  // The main price follows the parts. The discount price follows it while there is no discount, so a new package starts without one.
  // (State is adjusted while rendering, guarded so it settles at once: no effect and no extra paint with a stale price.)
  if (item && autoPriced && autoTotal !== null && item.regularPrice !== autoTotal) {
    setItem({ ...item, regularPrice: autoTotal, discountedPrice: item.discountedPrice === item.regularPrice ? autoTotal : item.discountedPrice });
  }

  // The offer the package form edits: its running offer, else its latest draft. Every other one is history.
  const ownOffers = (id: string, list = offers) => list.filter(offer => offer.packageId === id);
  const currentOffer = (id: string, list = offers) => {
    if (!id || now === null) return undefined;
    const own = ownOffers(id, list);
    return own.find(offer => offerRunning(offer, now)) ?? own.filter(offer => offer.status === "draft").sort((a, b) => Date.parse(b.endsAt) - Date.parse(a.endsAt))[0];
  };
  // Opening a package from a link (?package=) loads its offer once the clock is known; a working copy has its own.
  const loadedFor = useRef<string | null>(openedDraft ? openedDraft.packageId : null);
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

  function show(config: Item | null, form: OfferForm | null, isNew: boolean, version: number, note = "") {
    loadedFor.current = config && config.id ? config.id : null;
    setItem(config); setCreating(isNew); setOfferForm(form); setDraftVersion(version); setBaseline(snapshot(config, form));
    setError(note); setTried(false); setMessage(""); setConfirmEnd(false);
  }
  // A package opens its working copy when it has one, else the live package and its current offer.
  function open(id: string, list = drafts, live = catalogue.packages, offerList = offers) {
    const draft = list.find(row => row.packageId === id);
    const row = live.find(entry => entry.id === id);
    if (draft) { const copy = fromDraft(draft, offerList); return show(copy.item, copy.form, !row, draft.version, copy.dropped ? ENDED_NOTE : ""); }
    if (!row) return show(null, null, false, 0);
    const current = now !== null ? currentOffer(id, offerList) : undefined;
    show(toItem(row, offerList), current ? formFromOffer(current) : null, false, 0);
  }
  function choose(next: SalesPackage | null, isNew = false) {
    if (dirty && !window.confirm("Discard unsaved package changes?")) return;
    if (next && !isNew) return open(next.id);
    show(next ? toItem(next, []) : null, null, isNew, 0);
  }
  function chooseDraft(draft: PackageDraft) {
    if (dirty && !window.confirm("Discard unsaved package changes?")) return;
    open(draft.packageId);
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
  // One-time is sold with payment options; monthly with its billing cycles and length (package.md decision 7).
  function chooseBilling(billing: SalesPackage["billing"]) {
    setError("");
    // The price method stays as it is (automatic or manual, both for one-time and monthly); a package without settings yet takes the remembered one.
    setItem(current => {
      if (!current) return current;
      const services = current.services ?? (savedRow || readPriceMode() === "manual" ? undefined : []);
      const next: Item = { ...current, billing, services, ...(billing === "monthly"
        ? { paymentOptions: undefined, monthly: current.monthly ?? { ...blankMonthly }, offerExtraPrice: 0 }
        : { paymentOptions: current.paymentOptions?.length ? current.paymentOptions : ["full"], monthly: undefined }) };
      return services === undefined ? withTypedCategory(next) : next;
    });
  }
  // The category of a package whose price is typed (manual or monthly): the portal still starts its projects from it. The
  // first active category in display order is used; a category already chosen is kept.
  const defaultCategory = () => [...(catalogue.categories ?? [])].filter(row => row.status !== "archived")
    .sort((a, b) => (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999))[0]?.category ?? "";
  const withTypedCategory = <T extends { category: string }>(row: T): T => row.category ? row : { ...row, category: defaultCategory() };
  // Only a new package chooses how it is priced; a saved one keeps the way it was made (the portal refuses a switch).
  function choosePriceMode(mode: PriceMode) {
    rememberPriceMode(mode);
    setItem(current => {
      if (!current) return current;
      const next: Item = { ...current, repriceFromCurrent: undefined, services: mode === "automatic" ? [] : undefined, ...(mode === "automatic" ? { discountedPrice: current.regularPrice } : {}) };
      return mode === "manual" ? withTypedCategory(next) : next;
    });
  }
  function changeCategory(value: string) {
    const kept = item?.services ? choicesForCategory(item.services, value, addOns, savedPricing) : undefined;
    const dropped = item?.services && kept ? item.services.length - kept.length : 0;
    setCategoryNote(dropped ? dropped + (dropped === 1 ? " add-on was" : " add-ons were") + " not offered for this category and removed." : "");
    setItem(current => current ? { ...current, category: value, ...(kept ? { services: kept } : {}) } : current);
  }
  function toggleService(addOn: AddOn, on: boolean) {
    setItem(current => {
      if (!current?.services) return current;
      const services = on ? [...current.services.filter(row => row.featureId !== addOn.id), { featureId: addOn.id, quantity: 1 }] : current.services.filter(row => row.featureId !== addOn.id);
      // The included work names each ticked add-on once (with its number when sold by quantity), and drops it again when it is unticked.
      const inclusions = on ? [...current.inclusions.filter(line => line.trim() && !isAddOnLine(line, addOn.name)), addOnLine(addOn.name, 1, addOn.isQuantityBased)] : current.inclusions.filter(line => !isAddOnLine(line, addOn.name));
      return { ...current, services, inclusions };
    });
  }
  // A new number also changes the add-on's line in the included work. The name comes from the price preview (the saved name for a saved add-on).
  function setQuantity(id: string, quantity: number) {
    const priced = auto?.lines.find(row => row.featureId === id);
    setItem(current => current?.services ? {
      ...current,
      services: current.services.map(row => row.featureId === id ? { ...row, quantity } : row),
      inclusions: priced ? current.inclusions.map(line => isAddOnLine(line, priced.name) ? addOnLine(priced.name, quantity, priced.isQuantityBased) : line) : current.inclusions,
    } : current);
  }
  // An add-on made, changed or deleted in its dialog: the list is read again; a new one is ticked when this category offers it.
  async function addOnChanged(result: { id: string; removed?: boolean }) {
    const isNew = !addOnDialog?.edit;
    setAddOnDialog(null);
    // A deleted add-on leaves this form too, unless the saved package holds it (it then keeps it as it was saved, marked as no longer offered).
    const gone = result.removed ? addOns.find(row => row.id === result.id) : undefined;
    if (gone && !savedPricing?.pricing?.services.some(row => row.featureId === gone.id)) toggleService(gone, false);
    const fresh = await reloadCatalogue();
    const created = !result.removed && isNew ? fresh?.addOns?.find(row => row.id === result.id) : undefined;
    if (created && item?.category && item.services && addOnOffered(created, item.category)) toggleService(created, true);
  }
  function setMonthly(part: Partial<PackageMonthly>) { setItem(current => current?.monthly ? { ...current, monthly: { ...current.monthly, ...part } } : current); }
  function design<K extends keyof PackageDesign>(key: K, value: string) { setItem(current => current ? { ...current, design: { ...current.design, [key]: value } } : current); }
  function offerField<K extends keyof OfferForm>(key: K, value: OfferForm[K]) { setOfferForm(current => current ? { ...current, [key]: value } : current); }
  // Pages that still exist; a package showing none of them is flagged in the list and editor.
  const shownOn = (row: SalesPackage) => (row.pages || []).filter(slug => pages.some(page => page.slug === slug));
  async function reloadCatalogue(): Promise<SalesCatalogue | null> {
    const reload = await fetch("/api/packages", { cache: "no-store" });
    if (!reload.ok) return null;
    const next = await reload.json() as SalesCatalogue;
    setCatalogue(next); setDrafts(next.drafts ?? []);
    return next;
  }
  async function deletePackage(row: SalesPackage, hasDraft: boolean) {
    const stateNote = row.status === "published" ? " It is live and will disappear from the website." : "";
    const draftNote = hasDraft ? " Its draft in progress will be deleted too." : "";
    if (!window.confirm(`Force delete "${row.name}" permanently? It will be removed from the package catalogue.${stateNote}${draftNote} Existing customer projects, orders, invoices and payments will stay safe.`)) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/packages", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ packageId: row.id }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "The package could not be deleted. Please try again.");
      // The portal response is the source of truth. This is not an optimistic removal.
      setCatalogue(current => ({ ...current, packages: current.packages.filter(item => item.id !== row.id) }));
      setDrafts(current => current.filter(draft => draft.packageId !== row.id));
      setMessage(`"${row.name}" was deleted permanently.`);
      if (!await reloadCatalogue()) setError("Package deleted. Reload the page to refresh the catalogue.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The package could not be deleted. Please try again."); }
    finally { setBusy(false); }
  }
  async function changePackageStatus(row: SalesPackage, action: "published" | "archived") {
    const publishing = action === "published";
    if (!window.confirm(`${publishing ? "Publish" : "Archive"} "${row.name}"?${publishing ? " It will be available on the website." : " It will be hidden from new customers."}`)) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/packages/lifecycle", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ packageId: row.id, action }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "The package status could not be changed. Please try again.");
      // The portal applies the existing package-save rules to its current row.
      // Keep the quoted list shape until the authoritative catalogue reloads.
      setCatalogue(current => ({ ...current, packages: current.packages.map(item => item.id === row.id ? { ...item, status: action } : item) }));
      setMessage(`"${row.name}" was ${publishing ? "published" : "archived"}.`);
      if (!await reloadCatalogue()) setError(`Package ${publishing ? "published" : "archived"}. Reload the page to refresh the catalogue.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The package status could not be changed. Please try again."); }
    finally { setBusy(false); }
  }
  // A category made from the package form is selected at once and the list is read again from the portal.
  async function categorySaved(saved: SavedCategory) {
    const edited = editCategory;
    setNewCategory(false); setEditCategory(false); setCategoryNote("");
    if (!edited) update("category", saved.category);
    const entry = { ...(catalogue.categories || []).find(row => row.category === saved.category), ...saved, status: saved.status === "archived" ? "archived" as const : "active" as const };
    setCatalogue(current => ({ ...current, categories: [...(current.categories || []).filter(row => row.category !== saved.category), entry] }));
    try { if (!await reloadCatalogue()) throw new Error(); }
    catch { setCategoryNote(edited ? "Category saved. Reload the page to refresh the category list." : "Category created and selected. Reload the page to refresh the category list."); }
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

  // Save draft: only the package name (and the offer name when an offer was added). Nothing goes live.
  async function saveDraft() {
    if (!item) return;
    setTried(false); setError(""); setMessage("");
    if (!item.name.trim()) { setError("Enter the package name to save a draft."); return; }
    if (offerForm && !offerForm.title.trim()) { setError("Enter the offer name to save the offer in the draft."); return; }
    setBusy(true);
    try {
      const response = await fetch("/api/packages/drafts", { method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save", ...(item.id ? { packageId: item.id, version: draftVersion } : {}), data: { item, offer: offerForm } }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "The draft was not saved. Please try again.");
      const draft = result as PackageDraft;
      const next = { ...item, id: draft.packageId };
      setDrafts(current => [draft, ...current.filter(row => row.packageId !== draft.packageId)]);
      loadedFor.current = draft.packageId;
      setItem(next); setDraftVersion(draft.version); setBaseline(snapshot(next, offerForm));
      setMessage(creating ? `Draft saved. Its link /package/${draft.packageId} goes live when you publish.` : "Draft saved. The live page stays as it is until you publish the changes.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The draft was not saved. Please try again."); }
    finally { setBusy(false); }
  }
  // Publish: everything is checked, then the package (portal) and its offer (website) are written, and the
  // working copy is removed. An offer still marked draft is not published; it stays in the copy.
  async function send(next: Item, form: OfferForm | null, isNew: boolean, done: string, draft?: { version: number; keepOffer?: OfferForm }, reopen = false) {
    setBusy(true); setError(""); setMessage("");
    try {
      const config = { ...next, inclusions: lines(next.inclusions), terms: lines(next.terms),
        ...(next.billing === "monthly" && next.monthly ? { monthly: { ...next.monthly, uploadsPerMonth: next.portalUploads ? next.monthly.uploadsPerMonth ?? null : null } } : {}) };
      const offerPart = form ? { creating: !form.base, offer: offerPayload(form, next) } : undefined;
      const response = await fetch("/api/packages", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ item: config, creating: isNew, ...(offerPart ? { offer: offerPart } : {}), ...(draft ? { draft } : {}) }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Nothing was published. Please try again.");
      const saved = toItem(result.package as SalesPackage);
      if (isNew && saved.billing === "one_time") rememberPriceMode(saved.pricing ? "automatic" : "manual");
      setCatalogue(current => ({ ...current, packages: current.packages.some(row => row.id === saved.id) ? current.packages.map(row => row.id === saved.id ? { ...row, ...(result.package as SalesPackage) } : row) : [...current.packages, result.package as SalesCatalogue["packages"][number]] }));
      let savedForm = form;
      let offerList = offers;
      if (result.offer) {
        const offer = result.offer as Offer;
        offerList = [...offers.filter(row => row.slug !== offer.slug), offer];
        setOffers(offerList);
        savedForm = offer.status === "archived" ? null : formFromOffer(offer);
      }
      const keptDraft = result.draft as PackageDraft | null;
      if (draft && !result.offerError) {
        setDrafts(current => [...(keptDraft ? [keptDraft] : []), ...current.filter(row => row.packageId !== saved.id)]);
        setDraftVersion(keptDraft?.version ?? 0);
        if (keptDraft) savedForm = draft.keepOffer ?? null;
      }
      loadedFor.current = saved.id;
      setTried(false); setItem(saved); setCreating(false); setOfferForm(savedForm); setBaseline(snapshot(saved, result.offerError ? form : savedForm)); setConfirmEnd(false);
      setMessage(done.replace("{link}", `/package/${saved.id}`));
      if (result.offerError) { setOfferForm(form); setError(`Package published, offer not published: ${result.offerError} The draft is kept.`); }
      else if (result.linkError) setError(result.linkError);
      else if (result.draftError) setError(`Published, but the draft: ${result.draftError}`);
      else if (result.unsynced?.length) setError(`Package saved, but these older drafts were not updated: ${result.unsynced.join(", ")}.`);
      const fresh = await reloadCatalogue();
      // Ending an offer leaves the rest of the working copy as it was: open it again as it is now.
      if (reopen && fresh) { open(saved.id, fresh.drafts ?? [], fresh.packages, offerList); setMessage(done.replace("{link}", `/package/${saved.id}`)); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Nothing was published. Please try again."); }
    finally { setBusy(false); }
  }
  function save(e: React.FormEvent) {
    e.preventDefault(); if (!item || now === null) return;
    setTried(true); setError(""); setMessage("");
    const keep = keptOffer(offerForm);
    const sending = keep ? null : offerForm;
    if (Object.keys(check(item, sending, now, autoErrors)).length) return;
    const running = sending?.base && offerRunning(sending.base, now);
    if (running && !window.confirm(`This updates the live page of "${sending!.base!.title}" at once. People who already reserved keep their saved price. Publish?`)) return;
    const done = !sending ? (keep ? "Package published. The offer stays in the draft until you publish it." : creating ? "Package published. Its page is {link}. No offer: customers see 2 prices." : "Changes published. Existing client agreements stay unchanged.")
      : sending.status === "published" ? "Package and offer published. The offer is live on {link} with 3 prices and the countdown."
      : "Package published. The offer is not live: customers see 2 prices.";
    void send(item, sending, creating, done, { version: draftVersion, ...(keep ? { keepOffer: keep } : {}) });
  }
  // End offer = archive, at once: it leaves the website, the package is back to 2 prices, reservations keep their
  // price. The live package is sent as it is; a working copy keeps its other changes.
  function endOffer() {
    const live = item && catalogue.packages.find(row => row.id === item.id);
    if (!live || !offerForm?.base) return;
    void send(toItem(live, offers), { ...formFromOffer(offerForm.base), status: "archived" as never }, false, "Offer ended. The package page shows 2 prices again.", undefined, true);
  }
  // Discard draft: a published package goes back to what is live; a never-published one is deleted.
  async function discardDraft() {
    if (!item || !draftVersion) return;
    if (!window.confirm(creating ? `Delete the draft "${item.name}"? It was never published, so nothing on the website changes.` : "Discard the draft? The form goes back to what is live now.")) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/packages/drafts", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete", packageId: item.id, version: draftVersion }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "The draft was not discarded. Please try again.");
      const rest = drafts.filter(row => row.packageId !== item.id);
      setDrafts(rest);
      if (creating) show(null, null, false, 0); else open(item.id, rest);
      setMessage(creating ? "Draft deleted." : "Draft discarded. The form shows the live package.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The draft was not discarded. Please try again."); }
    finally { setBusy(false); }
  }

  // The list (owner, 9 Nov 2026): three tabs, Live / Drafts / Archived, one line per package so the admin barely
  // scrolls. Every package has at most one draft (unique packageId in the backend); its line says so and opens
  // that draft, never a new copy.
  const liveRows = catalogue.packages.filter(row => row.status === "published");
  const hiddenRows = catalogue.packages.filter(row => row.status === "draft"); // older hidden packages; one with a draft shows it on its line
  const archivedRows = catalogue.packages.filter(row => row.status === "archived");
  const newDrafts = drafts.filter(draft => !catalogue.packages.some(row => row.id === draft.packageId));
  const changeDrafts = drafts.filter(draft => catalogue.packages.some(row => row.id === draft.packageId && row.status !== "draft"));
  const draftCount = newDrafts.length + hiddenRows.length + changeDrafts.length;
  const savedAt = (draft: PackageDraft) => draft.updatedAt ? `saved ${formatIndiaDateTime(draft.updatedAt)}` : "";
  const packageLine = (row: SalesPackage, copyLine = false) => {
    const running = now === null ? undefined : ownOffers(row.id).find(offer => offerRunning(offer, now));
    const draftOffer = !running && ownOffers(row.id).some(offer => offer.status === "draft");
    const copy = drafts.find(draft => draft.packageId === row.id);
    const draftLocked = !!copy;
    const archiveDisabled = busy || draftLocked;
    const lockedTitle = draftLocked ? "Continue or discard the draft first." : undefined;
    const onPages = shownOn(row);
    // When the list is sorted by a date, the line shows that date, so the order explains itself. An older package has none until it is next saved.
    const sortedDate = listSort === "modified" ? row.updatedAt : listSort === "added" ? row.createdAt : undefined;
    const dateNote = sortedDate ? ` · ${listSort === "modified" ? "modified" : "added"} ${formatIndiaDate(sortedDate)}` : "";
    return <li className={s.line} key={`${copyLine ? "copy-" : ""}${row.id}`}>
      <div className={s.lineMain}><b>{copy && copyLine ? copy.name : row.name}</b>
        <small>{copyLine ? `Changes to ${row.status === "published" ? "a live" : "an archived"} package · ${row.status === "published" ? "live page unchanged" : "stays hidden"} until you publish` : `${row.status === "draft" ? "Hidden, never published · " : ""}${categoryLabel(catalogue.categories, row.category)} · ${onPages.length ? onPages.map(slug => pages.find(page => page.slug === slug)?.title).join(", ") : "no page"}${dateNote}`}</small></div>
      <span className={s.linePrice}>{rupee(row.discountedPrice ?? row.regularPrice)}</span>
      <span className={s.lineTags}>
        {running ? <span className={s.ok} title={`Ends ${formatIndiaDateTime(running.endsAt)}`}>Offer: {running.title} · {rupee(running.offerPrice)}</span> : draftOffer ? <span className={s.chip}>Offer not published</span> : <span className={s.chip}>No offer</span>}
        {copy && <span className={s.warn} title={savedAt(copy)}>Draft in progress</span>}
        {!onPages.length && !copyLine && <span className={s.warn}>No page</span>}
      </span>
      <span className={s.lineActions}><button className="admin-action" onClick={() => choose(row)}>{copy ? "Continue draft →" : "Edit →"}</button>
        {!copyLine && <button className="admin-action" onClick={() => choose({ ...row, id: "", name: `${row.name} copy`, status: "published", order: catalogue.packages.length, offerSlug: "" }, true)}>Duplicate</button>}
        {!copyLine && row.status !== "published" && <button type="button" className="admin-action" disabled={busy || draftLocked} title={lockedTitle} onClick={() => void changePackageStatus(row, "published")}>Publish</button>}
        {!copyLine && row.status !== "archived" && <button type="button" className="admin-action" disabled={archiveDisabled} title={running ? `Archive package and end "${running.title}".` : lockedTitle} onClick={() => void changePackageStatus(row, "archived")}>Archive</button>}
        {!copyLine && <button type="button" className="admin-action is-danger" disabled={busy} aria-label={`Force delete ${row.name} permanently`} title="Force delete permanently" onClick={() => void deletePackage(row, draftLocked)}><svg aria-hidden="true" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v5M14 11v5"/></svg></button>}
        {!copyLine && row.status === "published" && <Link className="admin-action" href={`/package/${encodeURIComponent(row.id)}`} target="_blank" rel="noreferrer">View ↗</Link>}</span>
    </li>;
  };
  const newDraftLine = (draft: PackageDraft) => <li className={s.line} key={`draft-${draft.packageId}`}>
    <div className={s.lineMain}><b>{draft.name}</b><small>New package, not published · link /package/{draft.packageId} is reserved</small></div>
    <span className={s.linePrice}>—</span>
    <span className={s.lineTags}><span className={s.warn} title={savedAt(draft)}>Draft</span></span>
    <span className={s.lineActions}><button className="admin-action" onClick={() => chooseDraft(draft)}>Edit draft →</button></span>
  </li>;
  const tabs = [["live", "Live", liveRows.length], ["drafts", "Drafts", draftCount], ["archived", "Archived", archivedRows.length]] as const;
  // The lines of the open tab, with the facts the filter and sort need. A tab keeps its own counts above; the filter only narrows what is listed.
  const packageLineEntry = (row: SalesPackage, copyLine = false): Entry<ListLine> => adminEntry<ListLine>({ row, copyLine }, row);
  const tabLines: Entry<ListLine>[] = listTab === "live" ? liveRows.map(row => packageLineEntry(row))
    : listTab === "archived" ? archivedRows.map(row => packageLineEntry(row))
    : [...newDrafts.map(draft => draftEntry<ListLine>({ draft }, draft)),
      ...changeDrafts.map(draft => packageLineEntry(catalogue.packages.find(row => row.id === draft.packageId)!, true)),
      ...hiddenRows.map(row => packageLineEntry(row))];
  const listOptions = usableOptions({ ...listFilter, sort: listSort, offersOnly: false }, tabLines);
  const shownLines = arrangePackages(tabLines, listOptions);
  const typeChoicesNow = typeFilterChoices(tabLines);
  const categoryChoicesNow = categoryFilterChoices(tabLines, catalogue.categories ?? []);
  const allChoice = { value: "all", label: "All", count: tabLines.length };

  if (!item) return <div>
    <div className={s.listTop}><p>Each package has its own page with 2 prices; an offer adds a third price and a countdown. A package has only one draft, and editing it always opens that draft.</p>
      <button className="admin-button" onClick={() => { const manual = readPriceMode() === "manual"; const fresh: SalesPackage = { ...blank, status: "published", order: catalogue.packages.length, services: manual ? undefined : [] }; choose(manual ? withTypedCategory(fresh) : fresh, true); }}>New package +</button></div>
    {message && <p role="status">{message}</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className={s.tabs} role="tablist" aria-label="Packages">{tabs.map(([key, label, count]) => <button key={key} type="button" role="tab" aria-selected={listTab === key} className={listTab === key ? s.tabOn : s.tab} onClick={() => setListTab(key)}>{label} <span className={s.count}>{count}</span></button>)}</div>
    {tabLines.length > 0 && <div className={s.filters}>
      {typeChoicesNow.length > 1 && <FilterChips label="Type" choices={[allChoice, ...typeChoicesNow]} selected={listOptions.type} onPick={value => setListFilter(current => ({ ...current, type: value as PackageListOptions["type"] }))} />}
      {categoryChoicesNow.length > 1 && <FilterChips label="Category" choices={[allChoice, ...categoryChoicesNow]} selected={listOptions.category} onPick={value => setListFilter(current => ({ ...current, category: value }))} />}
      <label className={s.sortField}><span>Sort by</span><select aria-label="Sort packages" value={listSort} onChange={event => pickSort(event.target.value as PackageSort)}>{ADMIN_SORTS.map(sort => <option key={sort.value} value={sort.value}>{sort.label}</option>)}</select></label>
    </div>}
    <ul className={s.lines} role="tabpanel" aria-label={tabs.find(([key]) => key === listTab)?.[1]}>
      {shownLines.map(({ item: line }) => "draft" in line ? newDraftLine(line.draft) : packageLine(line.row, line.copyLine))}
      {!tabLines.length && <li className={s.empty}>{listTab === "live" ? "No package is live." : listTab === "drafts" ? "No drafts." : "No archived packages."}</li>}
      {tabLines.length > 0 && !shownLines.length && <li className={s.empty}>No packages match this filter. <button type="button" className="admin-action" onClick={() => setListFilter({ type: "all", category: "all" })}>Show all</button></li>}
    </ul>
  </div>;

  const errors: Errors = tried && now !== null ? check(item, keptOffer(offerForm) ? null : offerForm, now, autoErrors) : {};
  const err = (key: string) => errors[key] ? <span className={s.msg}>{errors[key]}</span> : null;
  const bad = (key: string) => errors[key] ? s.bad : undefined;
  const monthly = item.billing === "monthly" ? item.monthly : undefined;
  const field = (key: keyof PackageDesign, label: string, max: number, required = true, hint?: string) => <label className={`admin-field ${bad(`design.${key}`) ?? ""}`}><span>{label}{required && " *"}</span><input aria-label={label} maxLength={max} value={item.design[key]} onChange={e => design(key, e.target.value)} />{hint && <small>{hint}</small>}{err(`design.${key}`)}</label>;
  const savedOffer = offerForm?.base;
  const running = !!savedOffer && now !== null && offerRunning(savedOffer, now);
  const past = item.id ? ownOffers(item.id).filter(offer => offer.slug !== savedOffer?.slug).sort((a, b) => Date.parse(b.endsAt) - Date.parse(a.endsAt)) : [];
  const lastEnded = !offerForm ? past[0] : undefined;
  const id = creating ? item.id || idFromName(item.name) : item.id;
  const offerLink = savedOffer?.slug ?? offerSlugFromName(offerForm?.title ?? "");
  let previewEnd = NaN;
  try { previewEnd = offerForm ? Date.parse(indiaInputToUtc(offerForm.endsAt, true)) : NaN; } catch { /* not a date yet */ }
  const showOffer = !!offerForm && offerForm.offerPrice !== "" && Number.isFinite(previewEnd);
  const shown = item;
  // The preview shows what the customer will read: the admin's terms, then the automatic ones of the current selection.
  const base = packageView({ ...shown, inclusions: lines(item.inclusions), terms: [...lines(item.terms), ...(auto?.terms ?? [])], id: id });
  const view = showOffer ? offerView({ ...base, title: offerForm!.title || "Offer name", offerPrice: Number(offerForm!.offerPrice), endsAt: new Date(previewEnd).toISOString(),
    ...(hours(offerForm!.reservationHoldHours) ? { reservationHoldHours: hours(offerForm!.reservationHoldHours) } : {}) }, shown) : base;
  const packageTerms = [...new Set([...universalTerms, ...lines(item.terms), ...(auto?.terms ?? [])])];
  const percent = showOffer ? offerDiscountPercent(view) : 0;
  const leftMs = running ? Date.parse(savedOffer!.endsAt) - (now ?? 0) : 0;
  const payMode = offerForm?.payMode ?? "";

  return <>
    <button className="admin-action" disabled={busy} onClick={() => choose(null)}>← All packages</button>
    <div className={s.layout}>
      <form className={`admin-form ${s.form}`} onSubmit={save} noValidate><fieldset disabled={busy} className={s.fields}>
        {/* 1. Project */}
        {draftVersion > 0 && <p className={s.warnNote}>{creating ? "Draft: not published yet. Save draft keeps your work; Publish checks every field and makes it live." : "You are editing the draft of a published package. The live page stays as it is until you press Publish changes."}</p>}
        <section className={s.sec}><div className={s.sechead}><h2>1. Project</h2><span className={s.tag}>Required to publish</span></div>
          <p className={s.note}>What the client gets. Every project made from this package starts with these settings; its starting step and project description come from the category.</p>
          <label className={`admin-field ${bad("name") ?? ""}`}><span>Package name * <small>(needed to save a draft)</small></span><input aria-label="Package name" maxLength={120} value={item.name} onChange={e => update("name", e.target.value)} />{err("name")}</label>
          <p className={s.idline}>Link: <code>/package/{id}</code> {creating ? item.id ? <><span className={s.lock}>reserved</span> <span>Kept for this package; it goes live when you publish.</span></> : <span>Made from the name when you first save. If it is taken, -2 is added.</span> :<><span className={s.lock}>fixed</span> <span>Renaming the package does not change the link.</span></>}</p>
          {addOnDialog && <AddOnDialog edit={addOnDialog.edit} categories={catalogue.categories ?? []} onCancel={() => setAddOnDialog(null)} onChanged={addOnChanged} />}
          <label className={`admin-field ${bad("description") ?? ""}`}><span>Description *</span><textarea aria-label="Description" maxLength={500} value={item.description} onChange={e => update("description", e.target.value)} /><small>Shown on the package card and under the page heading.</small>{err("description")}</label>
          <fieldset className={s.pages}><legend>How customers buy this package</legend>
            {!item.billing && item.portalUploads === undefined && !item.paymentOptions?.length && <p><span className={s.warn}>Older settings</span> This package works as before. Choose these options to turn on its customize page.</p>}
            <label className={`admin-field ${bad("billing") ?? ""}`}><span>Billing *</span><select aria-label="Billing" value={item.billing ?? ""} onChange={e => chooseBilling((e.target.value || undefined) as SalesPackage["billing"])}>{!item.billing && <option value="">Not chosen yet</option>}<option value="one_time">One-time</option><option value="monthly">Monthly</option></select>{err("billing")}</label>
            <div className={s.choices} role="radiogroup" aria-label="Portal uploads"><span>Portal uploads *</span>
              <label><input type="radio" name="portalUploads" checked={item.portalUploads === true} onChange={() => update("portalUploads", true)} /> Yes: the client sends files in the portal</label>
              <label><input type="radio" name="portalUploads" checked={item.portalUploads === false} onChange={() => update("portalUploads", false)} /> No: progress updates only</label>
              {err("portalUploads")}</div>
            {item.billing !== "monthly" ? <div className={s.choices} role="group" aria-label="Ways to pay"><span>Ways to pay *</span>
              {PACKAGE_PAYMENT_OPTIONS.map(option => <label key={option.value}><input type="checkbox" checked={!!item.paymentOptions?.includes(option.value)} onChange={e => update("paymentOptions", PACKAGE_PAYMENT_OPTIONS.map(row => row.value).filter(value => value === option.value ? e.target.checked : !!item.paymentOptions?.includes(value)))} /> {option.label}</label>)}
              {err("paymentOptions")}</div> : monthly && <>
              <p className={s.note}>A monthly package runs as a plan in the client portal: a bill every billing period, at the price bought for the whole length. The client can stop it any time; it ends after the period paid for.</p>
              {item.portalUploads && <div className={`${s.choices} ${bad("monthlyUploads") ?? ""}`} role="radiogroup" aria-label="Updates a month"><span>Updates a month *</span>
                <label><input type="radio" name="monthlyUploads" checked={!monthly.uploadsPerMonth} onChange={() => setMonthly({ uploadsPerMonth: null })} /> Unlimited</label>
                <label><input type="radio" name="monthlyUploads" checked={!!monthly.uploadsPerMonth} onChange={() => setMonthly({ uploadsPerMonth: monthly.uploadsPerMonth || 4 })} /> Limited:{" "}
                  <input aria-label="Number of updates a month" type="number" min={1} max={31} className={s.percent} disabled={!monthly.uploadsPerMonth} value={monthly.uploadsPerMonth ?? ""} onChange={e => setMonthly({ uploadsPerMonth: Number(e.target.value) })} /> a month, open again every month</label>
                {err("monthlyUploads")}</div>}
              <div className={`${s.choices} ${bad("monthlyCycles") ?? ""}`} role="group" aria-label="Billing cycles"><span>Billing cycles and discount *</span>
                {CYCLES.map(cycle => { const option = monthly.billingOptions.find(row => row.billingCycle === cycle); return <label key={cycle}>
                  <input type="checkbox" checked={!!option} onChange={e => setMonthly({ billingOptions: CYCLES.flatMap(value => value === cycle ? (e.target.checked ? [{ billingCycle: cycle, discountPercent: 0 }] : []) : monthly.billingOptions.filter(row => row.billingCycle === value)) })} /> {PURCHASE_LABELS[cycle]}
                  {option && <><input aria-label={`${PURCHASE_LABELS[cycle]} discount %`} type="number" min={0} max={99} step="0.01" className={s.percent} value={option.discountPercent} onChange={e => setMonthly({ billingOptions: monthly.billingOptions.map(row => row.billingCycle === cycle ? { ...row, discountPercent: Number(e.target.value) } : row) })} /> % off</>}
                </label>; })}
                {err("monthlyCycles")}</div>
              <label className={`admin-field ${bad("monthlyLength") ?? ""}`}><span>Longest length (months) *</span><input aria-label="Longest length in months" type="number" min={1} max={12} value={monthly.maxTenureMonths} onChange={e => setMonthly({ maxTenureMonths: Number(e.target.value) })} /><small>The client buys 1 to 12 months; to continue after that, they buy it again.</small>{err("monthlyLength")}</label>
            </>}
          {item.billing && (creating
            ? <div className={s.choices} role="radiogroup" aria-label="Price method"><span>Price method *</span>
              <label><input type="radio" name="priceMode" checked={autoPriced} onChange={() => choosePriceMode("automatic")} /> Automatic: the main price{item.billing === "monthly" ? " (a month)" : ""} comes from the category and add-ons</label>
              <label><input type="radio" name="priceMode" checked={!autoPriced} onChange={() => choosePriceMode("manual")} /> Manual: you type the main and discount price</label></div>
            : <p className={s.note}>Price method: <b>{savedRow?.pricing ? "Automatic (from category and add-ons)" : "Manual (typed prices)"}</b>. A saved package keeps the way its price was set; duplicate it to make a copy priced the other way.</p>)}
          {item.billing === "monthly" && autoPriced && <p className={s.note}>The prices below are for one month; every billing period is worked out from them, with its discount.</p>}
          {/* Only an automatic package takes its base price and add-ons from its category, so only it shows the category. A typed
              package (manual) has no category field or buttons on screen; it still saves the default category. */}
          {autoPriced && <>
            <label className={`admin-field ${bad("category") ?? ""}`}><span>Project category *</span><select aria-label="Project category" disabled={running} value={item.category} onChange={e => changeCategory(e.target.value)}>{!item.category && <option value="">Choose a category</option>}{categoryChoices(catalogue.categories, item.category ? [item.category] : []).map(({ category: key, label, status }) => <option key={key} value={key}>{label}{status === "archived" ? " (archived)" : ""}</option>)}</select>
              {running && <small>Fixed while its offer runs.</small>}
              {!catalogue.categories?.length && <span className={s.msg} role="alert">The category list did not load from the portal. Reload the page; until then only a new category can be chosen.</span>}
              {categoryNote && <small role="status">{categoryNote}</small>}{err("category")}</label>
            <div>{!running && <button type="button" className="admin-action" onClick={() => { setCategoryNote(""); setNewCategory(true); }}>+ New category</button>}{" "}
              {categoryEntry && <button type="button" className="admin-action" onClick={() => { setCategoryNote(""); setEditCategory(true); }}>Edit category</button>}</div>
            {editCategory && categoryEntry && <ProjectCategoryDialog edit={categoryEntry} nextSortOrder={categoryEntry.sortOrder ?? 0} onCancel={() => setEditCategory(false)} onSaved={categorySaved} send={sendCategory} />}
            {newCategory && <ProjectCategoryDialog nextSortOrder={Math.min(9999, Math.max(0, ...(catalogue.categories || []).map(row => row.sortOrder || 0)) + 1)} onCancel={() => setNewCategory(false)} onSaved={categorySaved} send={sendCategory} />}
          </>}
          {autoPriced ? <PackagePriceBuilder category={item.category} categoryEntry={categoryEntry} addOns={addOns} choices={item.services ?? []} saved={savedPricing}
            refresh={item.repriceFromCurrent === true} preview={auto ?? { base: null, baseFrozen: false, lines: [], total: null, problems: [], terms: [] }} regularPrice={item.regularPrice} discountedPrice={item.discountedPrice}
            error={err} bad={bad} onToggle={toggleService} onQuantity={setQuantity} onRefresh={on => update("repriceFromCurrent", on ? true : undefined)}
            onDiscount={value => update("discountedPrice", value)} onNewAddOn={() => setAddOnDialog({})} onEditAddOn={row => setAddOnDialog({ edit: row })} />
          : <>
            <div className={s.cols3} role="group" aria-label="Prices">
            <label className={`admin-field ${bad("regularPrice") ?? ""}`}><span>Main price (₹{item.billing === "monthly" ? ` ${priceUnit(item)}` : ""}) *</span><input aria-label="Main price (₹)" type="number" min={0} max={10000000} step="0.01" value={item.regularPrice} onChange={e => update("regularPrice", Number(e.target.value))} /><small>Shown crossed out.</small>{err("regularPrice")}</label>
            <label className={`admin-field ${bad("discountedPrice") ?? ""}`}><span>Normal price (₹{item.billing === "monthly" ? ` ${priceUnit(item)}` : ""}) *</span><input aria-label="Normal price (₹)" type="number" min={0} max={10000000} step="0.01" value={item.discountedPrice} onChange={e => update("discountedPrice", Number(e.target.value))} /><small>What the customer pays when no offer runs.</small>{err("discountedPrice")}</label>
          </div></>}
          </fieldset>
          <div className="form-columns">
            <label className={`admin-field ${bad("inclusions") ?? ""}`}><span>Included work (one per line) *</span><textarea aria-label="Included work (one item per line)" rows={6} value={item.inclusions.join("\n")} onChange={e => update("inclusions", e.target.value.split("\n"))} /><small>Saved with each client project.</small>{err("inclusions")}</label>
            <label className="admin-field"><span>Terms &amp; exclusions (one per line)</span><textarea aria-label="Terms & exclusions" rows={6} value={termsBoxText(auto?.terms ?? [], item.terms)} onChange={e => update("terms", typedFromTermsBox(e.target.value, auto?.terms ?? []))} />
              {auto && auto.terms.length > 0 && <small>The first {auto.terms.length} line{auto.terms.length === 1 ? " comes" : "s come"} from the category and add-ons you chose; add your own below them.</small>}</label>
          </div>
        </section>

        {/* 2. Offer */}
        <section className={s.sec}><div className={s.sechead}><h2>2. Offer</h2><span className={running ? s.tagRun : lastEnded ? s.tagEnd : s.tagOpt}>{running ? "Running" : offerForm ? (savedOffer ? "Draft" : "Being added") : lastEnded ? "Ended" : "Optional"}</span></div>
          {!offerForm && !lastEnded && <div className={s.emptyOffer}><p><b>No offer on this package.</b> The package page shows 2 prices (main crossed out + normal price) and no countdown. You can save the package without touching anything here.</p><button type="button" className="admin-action" onClick={() => setOfferForm(blankOffer())}>+ Add offer</button></div>}
          {!offerForm && lastEnded && <>
            <p className={s.warnNote}>The last offer &quot;{lastEnded.title}&quot; {lastEnded.status === "archived" ? "was ended" : `ended on ${formatIndiaDateTime(lastEnded.endsAt)}`}. The page is back to 2 prices. Customers who reserved keep their price until their hold ends.</p>
            <div><button type="button" className="admin-action" onClick={() => setOfferForm(blankOffer())}>+ Start new offer</button></div>
          </>}
          {offerForm && <div className={s.offerBox}>
            {running && <p className={s.idline}><span className={s.tagRun}>Running</span> Ends in <b>{Math.floor(leftMs / 86400000)}d {Math.floor(leftMs / 3600000) % 24}h</b>. Edit and save to update the live page. <Link className="admin-action" href={`/admin/offers/targets/${encodeURIComponent(savedOffer!.slug)}`}>Target people →</Link></p>}
            <div className="form-columns">
              <label className={`admin-field ${bad("offerTitle") ?? ""}`}><span>Offer name *</span><input aria-label="Offer name" maxLength={120} placeholder="e.g. Diwali Launch Offer" value={offerForm.title} onChange={e => offerField("title", e.target.value)} /><small>Shown on the card, sticky bar, emails and My offers.</small>{err("offerTitle")}</label>
              <label className={`admin-field ${bad("offerStatus") ?? ""}`}><span>Offer status *</span><select aria-label="Offer status" value={offerForm.status} onChange={e => offerField("status", e.target.value as OfferForm["status"])}><option value="draft">{savedOffer ? "Draft (not on the website)" : "Draft (kept in the package draft)"}</option><option value="published">Published</option></select>{!savedOffer && offerForm.status === "draft" && <small>Publish keeps this offer in the draft. Choose Published to make it live with the package.</small>}{err("offerStatus")}</label>
            </div>
            <p className={s.idline}>Offer link: <code>/offer/{offerLink}</code> <span className={s.lock}>auto</span> <span>Opens this package page. Made from the offer name; never reused.</span></p>
            <p className={s.inherit}>From the package (not typed again): {shown.regularPrice > shown.discountedPrice ? <>main price <b>{rupee(shown.regularPrice)}</b> · normal price <b>{rupee(shown.discountedPrice)}</b></> : <>price <b>{rupee(shown.discountedPrice)}</b></>} · category, included work, terms and page design.</p>
            <div className="form-columns">
              <label className={`admin-field ${bad("offerPrice") ?? ""}`}><span>Offer price (₹{item.billing === "monthly" ? ` ${priceUnit(item)}` : ""}) *</span><input aria-label="Offer price (₹)" type="number" min={0} max={10000000} step="0.01" value={offerForm.offerPrice} onChange={e => offerField("offerPrice", e.target.value)} /><small>{percent ? `Shown as ${percent}% OFF the main price.` : "Must be below the normal price."}</small>{err("offerPrice")}</label>
              <label className={`admin-field ${bad("endsAt") ?? ""}`}><span>Expires at (India time / IST) *</span><input aria-label="Expires at (India time / IST)" type="datetime-local" value={offerForm.endsAt} onChange={e => offerField("endsAt", e.target.value)} /><small>One fixed deadline. Starts the countdown.</small>{err("endsAt")}</label>
            </div>
            <label className={`admin-field ${bad("payMode") ?? ""}`}><span>Payment rule *</span><select aria-label="Payment rule" value={payMode} onChange={e => offerField("payMode", e.target.value as PayMode)}><option value="" disabled>Choose a payment rule</option><option value="current">Keep current system rules</option><option value="advance">Advance payment</option><option value="limited_uploads">Limited uploads before payment</option><option value="pay_later">Pay later (uploads stay available)</option></select><small>Frozen onto each project started with this offer.</small>{err("payMode")}</label>
            {payMode && payMode !== "current" && <div className={s.dep}>
              <div className="form-columns">
                {payMode === "advance" && <><label className="admin-field"><span>Minimum advance type *</span><select aria-label="Minimum advance type" value={offerForm.advanceType} onChange={e => offerField("advanceType", e.target.value as OfferForm["advanceType"])}><option value="fixed">Fixed amount (₹)</option><option value="percentage">Percentage</option></select></label><label className={`admin-field ${bad("advanceValue") ?? ""}`}><span>Minimum advance *</span><input aria-label="Minimum advance" type="number" min={0.01} max={offerForm.advanceType === "percentage" ? 100 : 10000000} step="0.01" value={offerForm.advanceValue} onChange={e => offerField("advanceValue", e.target.value)} /><small>The customer may pay this amount or more to start the project.</small>{err("advanceValue")}</label></>}
                {payMode === "limited_uploads" && <label className={`admin-field ${bad("uploadAllowance") ?? ""}`}><span>Uploads allowed before payment *</span><input aria-label="Pre-payment upload allowance" type="number" min={1} max={10000} value={offerForm.uploadAllowance} onChange={e => offerField("uploadAllowance", e.target.value)} />{err("uploadAllowance")}</label>}
                <label className={`admin-field ${bad("dueDays") ?? ""}`}><span>Payment due after (days) *</span><input aria-label="Payment due days" type="number" min={0} max={365} value={offerForm.dueDays} onChange={e => offerField("dueDays", e.target.value)} /><small>From project creation.</small>{err("dueDays")}</label>
              </div>
              <label className={`admin-field ${bad("reminders") ?? ""}`}><span>Reminder days around the due date</span><input aria-label="Reminder offsets" value={offerForm.reminders} onChange={e => offerField("reminders", e.target.value)} /><small>-1, 0, 3 = one day before, on the day, three days after. Empty = no reminders.</small>{err("reminders")}</label>
            </div>}
            <fieldset className={s.pages}><legend>Reservation (optional)</legend>
            <p className={s.note}>When customers may hold the offer price before it ends. Leave empty for the usual times.</p>
            <div className="form-columns">
              <label className={`admin-field ${bad("reserveWindowHours") ?? ""}`}><span>Reserve opens (hours before the end)</span><input aria-label="Reserve opens (hours before the offer ends)" type="number" min={1} max={720} placeholder={String(DEFAULT_RESERVE_WINDOW_HOURS)} value={offerForm.reserveWindowHours} onChange={e => offerField("reserveWindowHours", e.target.value)} /><small>Empty = {DEFAULT_RESERVE_WINDOW_HOURS} hours.</small>{err("reserveWindowHours")}</label>
              <label className={`admin-field ${bad("reservationHoldHours") ?? ""}`}><span>Reservation lasts (hours)</span><input aria-label="Reservation lasts (hours)" type="number" min={1} max={720} placeholder={String(DEFAULT_HOLD_HOURS)} value={offerForm.reservationHoldHours} onChange={e => offerField("reservationHoldHours", e.target.value)} /><small>Empty = {DEFAULT_HOLD_HOURS} hours. New reservations only.</small>{err("reservationHoldHours")}</label>
            </div>
            </fieldset>
            <div className={s.row}>
              {!savedOffer && <button type="button" className="admin-action" onClick={() => setOfferForm(null)}>Remove offer</button>}
              {savedOffer && !confirmEnd && <button type="button" className="admin-action is-danger" disabled={dirty} title={dirty ? "Save or discard your changes first." : undefined} onClick={() => setConfirmEnd(true)}>{running ? "End offer" : "Delete draft offer"}</button>}
            </div>
            {confirmEnd && savedOffer && <p className={s.warnNote}>{running ? `End "${savedOffer.title}" now? It leaves the website and the package goes back to 2 prices. People who reserved keep their price.` : `Delete the draft "${savedOffer.title}"? It stays under past offers.`} <button type="button" className="admin-button danger" onClick={endOffer}>{running ? "End offer" : "Delete draft"}</button> <button type="button" className="admin-action" onClick={() => setConfirmEnd(false)}>Keep it</button></p>}
          </div>}
          {past.length > 0 && <div className={s.past}><span>Past offers (read only)</span>{past.map(offer => <div key={offer.slug}><b>{offer.title}</b><small>{rupee(offer.offerPrice)} · {offer.status === "archived" ? "ended (archived)" : offer.status === "draft" ? "draft" : `ended ${formatIndiaDateTime(offer.endsAt)}`}</small></div>)}</div>}
        </section>

        {/* 3. Website display: where the package is shown. It never changes a client project. */}
        <section className={s.sec}><div className={s.sechead}><h2>3. Website display</h2></div>
          <p className={s.note}>Where this package appears on the website. None of this changes a client project.</p>
          <div className="form-columns">
            <label className="admin-field"><span>When published *</span><select aria-label="Status" value={item.status} onChange={e => update("status", e.target.value as SalesPackage["status"])}><option value="published">Show on the website</option>{!running && <option value="archived">Archived (hidden)</option>}</select><small>Archived hides the package; it can be shown again later.</small></label>
            <label className="admin-field"><span>Display order</span><input aria-label="Display order" type="number" min={0} max={9999} value={item.order} onChange={e => update("order", Number(e.target.value))} /></label>
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
        </section>

        {/* 4. Page design */}
        <section className={s.sec}><div className={s.sechead}><h2>4. Page design</h2><span className={s.tag}>Required to publish</span></div>
          <p className={s.note}>The design of this package&apos;s page, with or without an offer. Pre-filled for a new package, so you only change what you want.</p>
          <div className="form-columns">{field("eyebrow", "Eyebrow text", 100)}{field("badge", "Card badge", 60, true, "While an offer runs, a % OFF badge is added by itself.")}</div>
          <div className="form-columns">{field("heading", "Main heading", 160)}{field("headingHighlight", "Highlighted heading text", 120, false)}</div>
          <div className="form-columns">{field("supportingLine", "Supporting line", 200, false)}{field("subheading", "Benefits subheading", 160)}</div>
          <div className="form-columns">{field("tagline", "Price-card tagline", 100)}{field("priceDescription", "Short price description", 200)}</div>
          <div className="form-columns">{field("ctaLabel", "Enquiry button text", 80)}{field("contactHref", "Contact link", 500, true, "mailto:, tel: or an https link.")}</div>
        </section>
      </fieldset>
      <div className={s.savebar}>
        <div className={s.result}>{Object.keys(errors).length > 0 && <p className="form-error" role="alert">Not published. Fix the marked fields first, or press Save draft to keep your work.</p>}{error && <p className="form-error" role="alert">{error}</p>}{message && <p role="status">{message}</p>}</div>
        <div className={s.row}><button type="button" className="admin-action" disabled={busy || !dirty} onClick={() => { const saved = JSON.parse(baseline); setItem(saved.next); setOfferForm(saved.form); setTried(false); setError(""); }}>Discard changes</button>{draftVersion > 0 && <button type="button" className="admin-action is-danger" disabled={busy} onClick={discardDraft}>{creating ? "Delete draft" : "Discard draft"}</button>}<button type="button" className="admin-action" disabled={busy || (!dirty && (draftVersion > 0 || !creating))} onClick={saveDraft}>Save draft</button><button className="admin-button" disabled={busy || (!dirty && !creating && !draftVersion)}>{busy ? "Working…" : creating ? "Publish" : "Publish changes"}</button></div>
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
          {showOffer ? <><p className={s.old}><del>{rupee(shown.regularPrice)}</del>{shown.regularPrice > shown.discountedPrice && <> → <del>{rupee(shown.discountedPrice)}</del></>}</p><p className={s.deal}><small>OFFER PRICE {percent > 0 && <b>{percent}% OFF</b>}</small><strong>{rupee(Number(offerForm!.offerPrice))}</strong></p><p className={s.timer}>Countdown to {formatIndiaDateTime(new Date(previewEnd).toISOString())}</p></>
            : <>{shown.regularPrice > shown.discountedPrice && <p className={s.old}><del>{rupee(shown.regularPrice)}</del></p>}<p className={s.deal}><small>PRICE</small><strong>{rupee(shown.discountedPrice)}</strong></p></>}
          <p className={s.pd}>{item.design.priceDescription}</p>
          <p className={s.cta}>{showOffer ? (previewState === "open" ? `Reserve price for ${hours(offerForm!.reservationHoldHours) || DEFAULT_HOLD_HOURS} hours${item.billing ? " · Get this package" : ""} · Arrange a callback` : previewState === "reserved" ? "Start my project · time left · Arrange a callback" : item.billing ? "Get this package · Arrange a callback" : "Arrange a callback") : item.billing ? "Get this package · Arrange a callback" : "Arrange a callback"} →</p>
        </div>
        <p className={s.note}>{showOffer ? "Offer mode: 3 prices and the countdown. When it ends the page shows 2 prices again without a reload." : "Package mode: 2 prices, no countdown. A package with purchase settings shows Get this package and Arrange a callback; any other shows Arrange a callback."}{offerForm?.status === "draft" && showOffer ? " This offer is a draft: customers still see package mode." : ""}</p>
        <button type="button" className="admin-action" onClick={() => preview.current?.showModal()}>Preview full page ↗</button>
      </aside>
    </div>
    <dialog ref={preview} className={s.preview} aria-label="Package page preview" onClick={e => { if (e.target === e.currentTarget) preview.current?.close(); }}>
      <div className={s.previewBar}><strong>Unsaved page preview</strong><button type="button" className="admin-button" onClick={() => preview.current?.close()}>Close preview</button></div>
      <PublicInteraction offer={view} terms={showOffer ? resolvedTerms(view, universalTerms) : packageTerms} preview previewReservation={showOffer ? previewState : "normal"}
        pkg={{ id, name: item.name || "Package name", live: showOffer, back: { href: "#", label: "Packages" }, packageTerms, customize: item.billing ? "#" : undefined }} />
    </dialog>
  </>;
}
