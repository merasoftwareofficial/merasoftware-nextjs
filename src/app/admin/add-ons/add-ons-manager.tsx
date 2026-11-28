"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Link from "@/components/link";
import { AddOnDeleteDialog, AddOnDialog, type AddOnChangeResult } from "@/components/add-on-dialog";
import { ConfirmDialog, DeleteIconButton } from "@/components/admin-confirm-dialog";
import { CapsuleSelect } from "@/components/capsule-select";
import { addOnInput } from "@/lib/add-ons";
import { categoryLabel, type AddOn, type SalesCatalogue } from "@/lib/sales-packages";

type VisibilityFilter = "all" | "visible" | "hidden";
type AddOnSort = "modified" | "added" | "name_asc" | "name_desc" | "price_asc" | "price_desc";

const SORT_KEY = "add-on-list-sort";
const DEFAULT_SORT: AddOnSort = "modified";
const SORTS: { value: AddOnSort; label: string }[] = [
  { value: "modified", label: "Recently modified" },
  { value: "added", label: "Recently added" },
  { value: "name_asc", label: "Name: A to Z" },
  { value: "name_desc", label: "Name: Z to A" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
];
const noSubscription = () => () => {};

function readAddOnSort(): AddOnSort {
  try {
    const saved = window.localStorage.getItem(SORT_KEY);
    return SORTS.find(s => s.value === saved)?.value ?? DEFAULT_SORT;
  } catch { return DEFAULT_SORT; }
}

function rememberAddOnSort(sort: AddOnSort) {
  try { window.localStorage.setItem(SORT_KEY, sort); }
  catch { /* Ignore blocked storage */ }
}

function timeOf(iso?: string): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

const rupee = (value: number) => `₹${Number(value || 0).toLocaleString("en-IN")}`;

/**
 * Admin manager for portal add-on services (Additional Features / Upgrades).
 * Reuses AddOnDialog and `/api/add-ons` as the single source of truth.
 */
export function AddOnsManager({ initial }: { initial: SalesCatalogue }) {
  const [catalogue, setCatalogue] = useState(initial);
  const [visibility, setVisibility] = useState<VisibilityFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const rememberedSort = useSyncExternalStore(noSubscription, readAddOnSort, () => DEFAULT_SORT);
  const [pickedSort, setPickedSort] = useState<AddOnSort | null>(null);
  const sort = pickedSort ?? rememberedSort;
  const pickSort = (next: AddOnSort) => { setPickedSort(next); rememberAddOnSort(next); };
  const [dialog, setDialog] = useState<{ edit?: AddOn } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AddOn | null>(null);
  const [usedInPopup, setUsedInPopup] = useState<AddOn | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reloading, setReloading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const addOns = useMemo(() => catalogue.addOns ?? [], [catalogue.addOns]);
  const categories = useMemo(() => catalogue.categories ?? [], [catalogue.categories]);
  const packages = useMemo(() => catalogue.packages ?? [], [catalogue.packages]);

  const packagesByAddOn = useMemo(() => {
    const map = new Map<string, { id: string; name: string }[]>();
    for (const pkg of packages) {
      for (const row of pkg.pricing?.services ?? []) {
        const list = map.get(row.featureId) ?? [];
        list.push({ id: pkg.id, name: pkg.name });
        map.set(row.featureId, list);
      }
    }
    return map;
  }, [packages]);

  useEffect(() => {
    if (!usedInPopup) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); setUsedInPopup(null); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [usedInPopup]);

  const categoryOptions = useMemo(() => {
    const active = categories.filter(c => c.status !== "archived");
    const usedArchived = categories.filter(
      c => c.status === "archived" && addOns.some(a => a.compatibleWith.includes(c.category)),
    );
    return [
      { value: "all", label: "All category scopes" },
      { value: "__global", label: "Offered for all categories" },
      ...[...active, ...usedArchived].map(c => ({
        value: c.category,
        label: `${c.label}${c.status === "archived" ? " (archived)" : ""}`,
      })),
    ];
  }, [categories, addOns]);

  const filtered = useMemo(() => {
    const list = addOns.filter(row => {
      if (visibility === "visible" && row.isHidden) return false;
      if (visibility === "hidden" && !row.isHidden) return false;
      if (categoryFilter === "__global" && row.compatibleWith.length > 0) return false;
      if (categoryFilter !== "all" && categoryFilter !== "__global") {
        if (row.compatibleWith.length > 0 && !row.compatibleWith.includes(categoryFilter)) return false;
      }
      return true;
    });
    const byName = (a: AddOn, b: AddOn) => a.name.localeCompare(b.name, "en", { sensitivity: "base" });
    return [...list].sort((a, b) => {
      if (sort === "name_asc") return byName(a, b);
      if (sort === "name_desc") return byName(b, a);
      if (sort === "price_asc") return (a.unitPrice - b.unitPrice) || byName(a, b);
      if (sort === "price_desc") return (b.unitPrice - a.unitPrice) || byName(a, b);
      const first = timeOf(sort === "added" ? a.createdAt : a.updatedAt);
      const second = timeOf(sort === "added" ? b.createdAt : b.updatedAt);
      if (first === null || second === null) return first === second ? byName(a, b) : first === null ? 1 : -1;
      return (second - first) || byName(a, b);
    });
  }, [addOns, visibility, categoryFilter, sort]);

  async function reload() {
    setReloading(true);
    setError("");
    try {
      const response = await fetch("/api/packages", { cache: "no-store" });
      if (!response.ok) throw new Error("Could not reload add-ons.");
      setCatalogue(await response.json() as SalesCatalogue);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not reload add-ons.");
    } finally {
      setReloading(false);
    }
  }

  async function toggleHidden(row: AddOn) {
    setBusyId(row.id);
    setError("");
    setNotice("");
    try {
      const payload = { ...addOnInput(row), isHidden: !row.isHidden };
      const response = await fetch("/api/add-ons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Could not update add-on visibility.");
      setNotice(row.isHidden ? `"${row.name}" is now visible for new projects and packages.` : `"${row.name}" is now hidden from new projects and packages.`);
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update add-on.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDialogChanged(result: AddOnChangeResult) {
    setDialog(null);
    setDeleteTarget(null);
    if (result.hidden) {
      setNotice("Add-on hidden from new projects and packages.");
    } else if (result.removed && result.updatedPackages !== undefined) {
      setNotice(
        result.updatedPackages.length
          ? `Add-on permanently deleted and removed from ${result.updatedPackages.length} live package(s): ${result.updatedPackages.join(", ")}.`
          : "Add-on permanently deleted.",
      );
    } else {
      setNotice(result.removed ? "Add-on deleted." : "Add-on saved.");
    }
    await reload();
  }

  const visibleCount = addOns.filter(a => !a.isHidden).length;
  const hiddenCount = addOns.length - visibleCount;
  const visibilityTabs: { value: VisibilityFilter; label: string }[] = [
    { value: "all", label: `All (${addOns.length})` },
    { value: "visible", label: `Visible (${visibleCount})` },
    { value: "hidden", label: `Hidden (${hiddenCount})` },
  ];
  const popupPackages = usedInPopup ? (packagesByAddOn.get(usedInPopup.id) ?? []) : [];

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div className="form-actions" style={{ marginTop: 0, justifyContent: "space-between", flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <div role="group" aria-label="Filter by visibility" style={{ display: "inline-flex", gap: 6, flexWrap: "wrap" }}>
            {visibilityTabs.map(tab => {
              const active = visibility === tab.value;
              return (
                <button
                  key={tab.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setVisibility(tab.value)}
                  style={{
                    padding: "7px 14px",
                    borderRadius: "var(--r-pill, 999px)",
                    border: active ? "1.5px solid var(--pn-accent)" : "1px solid var(--pn-line)",
                    background: active ? "color-mix(in srgb, var(--pn-accent) 12%, var(--pn-card))" : "var(--pn-card)",
                    color: active ? "var(--pn-accent)" : "var(--pn-soft)",
                    fontWeight: active ? 700 : 600,
                    fontSize: "var(--fs-meta)",
                    cursor: "pointer",
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
          <CapsuleSelect
            prefix="Category:"
            ariaLabel="Filter by category"
            value={categoryFilter}
            onChange={setCategoryFilter}
            options={categoryOptions}
          />
          <CapsuleSelect
            prefix="Sort:"
            ariaLabel="Sort add-ons"
            value={sort}
            onChange={value => pickSort(value as AddOnSort)}
            options={SORTS}
          />
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button type="button" className="admin-action" disabled={reloading || !!busyId} onClick={() => void reload()}>
            {reloading ? "Refreshing…" : "Refresh add-ons"}
          </button>
          <button type="button" className="admin-button" disabled={reloading || !!busyId} onClick={() => { setError(""); setNotice(""); setDialog({}); }}>
            New add-on +
          </button>
        </div>
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}

      {!filtered.length ? (
        <div className="admin-panel">
          <p>{addOns.length ? "No add-ons match these filters." : "No add-ons yet. Create your first add-on to use it in automatic packages and custom projects."}</p>
        </div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Add-on Name</th>
                <th>Price</th>
                <th>Type</th>
                <th>Status</th>
                <th>Offered For</th>
                <th>Terms</th>
                <th>Used In</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(row => {
                const usedIn = packagesByAddOn.get(row.id) ?? [];
                const busy = busyId === row.id || reloading;
                const scopeText = row.compatibleWith.length
                  ? row.compatibleWith.map(key => categoryLabel(categories, key)).join(", ")
                  : "All categories";
                return (
                  <tr key={row.id}>
                    <td>
                      <strong style={{ color: "var(--pn-text)" }}>{row.name}</strong>
                    </td>
                    <td style={{ whiteSpace: "nowrap", fontWeight: 600 }}>{rupee(row.unitPrice)}</td>
                    <td style={{ whiteSpace: "nowrap" }}>{row.isQuantityBased ? "Per unit" : "Fixed"}</td>
                    <td>
                      <span className={`status ${row.isHidden ? "status-draft" : "status-live"}`}>
                        {row.isHidden ? "Hidden" : "Visible"}
                      </span>
                    </td>
                    <td>{scopeText}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {row.terms?.length ? `${row.terms.length} ${row.terms.length === 1 ? "line" : "lines"}` : "—"}
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {usedIn.length ? (
                        <button
                          type="button"
                          className="admin-action"
                          onClick={() => setUsedInPopup(row)}
                          style={{
                            padding: "4px 10px",
                            borderRadius: "var(--r-pill, 999px)",
                            border: "1px solid var(--pn-line)",
                            background: "var(--pn-raised)",
                            fontSize: "var(--fs-label)",
                          }}
                        >
                          {usedIn.length} {usedIn.length === 1 ? "package" : "packages"}
                        </button>
                      ) : "—"}
                    </td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      <div style={{ display: "inline-flex", gap: 12, alignItems: "center" }}>
                        <button type="button" className="admin-action" disabled={busy} onClick={() => void toggleHidden(row)}>
                          {busyId === row.id ? "Updating…" : row.isHidden ? "Show" : "Hide"}
                        </button>
                        <button type="button" className="admin-action" disabled={busy} onClick={() => { setError(""); setNotice(""); setDialog({ edit: row }); }}>
                          Edit
                        </button>
                        <DeleteIconButton
                          disabled={busy}
                          ariaLabel={`Delete ${row.name}`}
                          title={`Delete ${row.name}`}
                          onClick={() => { setError(""); setNotice(""); setDeleteTarget(row); }}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(usedInPopup)}
        title={usedInPopup?.name ?? ""}
        variant="primary"
        cancelLabel="Close"
        onCancel={() => setUsedInPopup(null)}
        message={
          usedInPopup ? (
            <>
              <p style={{ margin: "0 0 10px" }}>Used in {popupPackages.length} {popupPackages.length === 1 ? "package" : "packages"}:</p>
              <div style={{ display: "grid", gap: 8, maxHeight: "48vh", overflowY: "auto" }}>
                {popupPackages.map(pkg => (
                  <Link
                    key={pkg.id}
                    href={`/admin/packages?package=${encodeURIComponent(pkg.id)}`}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "10px 12px",
                      borderRadius: 8,
                      border: "1px solid var(--pn-line)",
                      background: "var(--pn-raised)",
                      color: "var(--pn-text)",
                      fontWeight: 600,
                      fontSize: 14,
                    }}
                  >
                    <span>{pkg.name}</span>
                    <span style={{ color: "var(--pn-accent)", fontSize: 13 }}>Open →</span>
                  </Link>
                ))}
              </div>
            </>
          ) : ""
        }
      />

      {dialog && (
        <AddOnDialog
          edit={dialog.edit}
          categories={categories}
          usedInPackages={dialog.edit ? (packagesByAddOn.get(dialog.edit.id) ?? []) : undefined}
          onCancel={() => setDialog(null)}
          onChanged={handleDialogChanged}
        />
      )}

      {deleteTarget && (
        <AddOnDeleteDialog
          addOn={deleteTarget}
          onCancel={() => setDeleteTarget(null)}
          onDone={handleDialogChanged}
        />
      )}
    </div>
  );
}
