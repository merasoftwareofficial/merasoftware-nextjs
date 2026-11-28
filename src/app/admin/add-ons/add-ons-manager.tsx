"use client";

import { useMemo, useState } from "react";
import { AddOnDialog } from "@/components/add-on-dialog";
import { CapsuleSelect } from "@/components/capsule-select";
import { addOnInput } from "@/lib/add-ons";
import { categoryLabel, type AddOn, type SalesCatalogue } from "@/lib/sales-packages";

type VisibilityFilter = "all" | "visible" | "hidden";

const rupee = (value: number) => `₹${Number(value || 0).toLocaleString("en-IN")}`;

/**
 * Admin manager for portal add-on services (Additional Features / Upgrades).
 * Reuses AddOnDialog and `/api/add-ons` as the single source of truth.
 */
export function AddOnsManager({ initial }: { initial: SalesCatalogue }) {
  const [catalogue, setCatalogue] = useState(initial);
  const [visibility, setVisibility] = useState<VisibilityFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [dialog, setDialog] = useState<{ edit?: AddOn } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reloading, setReloading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const addOns = useMemo(() => catalogue.addOns ?? [], [catalogue.addOns]);
  const categories = useMemo(() => catalogue.categories ?? [], [catalogue.categories]);

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
    return addOns.filter(row => {
      if (visibility === "visible" && row.isHidden) return false;
      if (visibility === "hidden" && !row.isHidden) return false;
      if (categoryFilter === "__global" && row.compatibleWith.length > 0) return false;
      if (categoryFilter !== "all" && categoryFilter !== "__global") {
        if (row.compatibleWith.length > 0 && !row.compatibleWith.includes(categoryFilter)) return false;
      }
      return true;
    });
  }, [addOns, visibility, categoryFilter]);

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

  async function handleDialogChanged(result: { id: string; removed?: boolean }) {
    setDialog(null);
    setNotice(result.removed ? "Add-on deleted." : "Add-on saved.");
    await reload();
  }

  const visibleCount = addOns.filter(a => !a.isHidden).length;
  const hiddenCount = addOns.length - visibleCount;
  const visibilityTabs: { value: VisibilityFilter; label: string }[] = [
    { value: "all", label: `All (${addOns.length})` },
    { value: "visible", label: `Visible (${visibleCount})` },
    { value: "hidden", label: `Hidden (${hiddenCount})` },
  ];

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
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(row => {
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
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      <div style={{ display: "inline-flex", gap: 12, alignItems: "center" }}>
                        <button type="button" className="admin-action" disabled={busy} onClick={() => void toggleHidden(row)}>
                          {busyId === row.id ? "Updating…" : row.isHidden ? "Show" : "Hide"}
                        </button>
                        <button type="button" className="admin-action" disabled={busy} onClick={() => { setError(""); setNotice(""); setDialog({ edit: row }); }}>
                          Edit
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {dialog && (
        <AddOnDialog
          edit={dialog.edit}
          categories={categories}
          onCancel={() => setDialog(null)}
          onChanged={handleDialogChanged}
        />
      )}
    </div>
  );
}
