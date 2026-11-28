"use client";
import { useEffect, useRef, useState } from "react";
import { AdminModal, ConfirmDialog, DangerButton, useConfirmDialog } from "@/components/admin-confirm-dialog";
import { addOnInput, blankAddOn } from "@/lib/add-ons";
import Link from "@/components/link";
import type { AddOn } from "@/lib/sales-packages";
import type { ProjectCategory } from "@/lib/service-plans";

export type AddOnChangeResult = {
  id: string;
  removed?: boolean;
  hidden?: boolean;
  updatedPackages?: string[];
};

async function callAddOnApi(method: "POST" | "DELETE", body: Record<string, unknown>) {
  const response = await fetch("/api/add-ons", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "The portal did not accept this. Please try again.");
  return result as { id: string; updatedPackages?: string[] };
}

/**
 * Shared 3-option Delete confirmation popup for an add-on.
 * Used both from the Add-ons table and from inside AddOnDialog.
 */
export function AddOnDeleteDialog({
  addOn,
  onCancel,
  onDone,
}: {
  addOn: AddOn;
  onCancel: () => void;
  onDone: (result: AddOnChangeResult) => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [confirmPermanent, setConfirmPermanent] = useState(false);
  const [error, setError] = useState("");

  async function runAction(action: () => Promise<AddOnChangeResult>, fallback: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await action();
      await onDone(res);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : fallback);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <ConfirmDialog
        open
        title="Delete add-on?"
        message={<>Remove <strong>&ldquo;{addOn.name}&rdquo;</strong>? Existing customer orders and paid invoices always stay safe.</>}
        infoContent={
          <>
            <span><strong>Hide:</strong> Hides from new packages; keeps live packages safe.</span>
            <span><strong>List only:</strong> Deletes from add-ons list; live packages keep their saved copy.</span>
            <span><strong>Delete permanently:</strong> Removes add-on, price &amp; terms from all live packages too.</span>
          </>
        }
        alertOnly
        busy={busy}
        error={error}
        onCancel={onCancel}
        extraActions={
          <>
            <button
              type="button"
              className="admin-dialog-btn"
              disabled={busy}
              onClick={() => void runAction(async () => {
                await callAddOnApi("POST", { ...addOnInput(addOn), isHidden: true });
                return { id: addOn.id, hidden: true };
              }, "Could not hide the add-on.")}
            >
              Hide
            </button>
            <button
              type="button"
              className="admin-dialog-btn"
              disabled={busy}
              onClick={() => void runAction(async () => {
                await callAddOnApi("DELETE", { id: addOn.id, mode: "catalog_only" });
                return { id: addOn.id, removed: true };
              }, "Could not delete the add-on.")}
            >
              List only
            </button>
            <DangerButton
              disabled={busy}
              onClick={() => { setError(""); setConfirmPermanent(true); }}
            >
              Delete permanently
            </DangerButton>
          </>
        }
      />
      <ConfirmDialog
        open={confirmPermanent}
        zIndex={1250}
        title="Permanently delete add-on?"
        dangerTitle
        message={<>This will permanently delete <strong>&ldquo;{addOn.name}&rdquo;</strong> and remove it (along with its price &amp; terms) from all live packages. This cannot be undone.</>}
        cancelLabel="Back"
        confirmLabel="Delete permanently"
        busyLabel="Deleting…"
        busy={busy}
        error={error}
        onCancel={() => { setError(""); setConfirmPermanent(false); }}
        onConfirm={() => runAction(async () => {
          const res = await callAddOnApi("DELETE", { id: addOn.id, mode: "remove_from_packages" });
          return { id: addOn.id, removed: true, updatedPackages: res.updatedPackages };
        }, "Could not permanently delete the add-on.")}
      />
    </>
  );
}

// Makes, changes or deletes an add-on service (Additional Features / Upgrades) from the package form. The portal backend
// owns every rule: a service customers already bought cannot be deleted (hide it instead). A change of price reaches new
// projects and packages made from now on; packages already saved keep the prices they were saved with.
type Props = { edit?: AddOn; categories: ProjectCategory[]; usedInPackages?: { id: string; name: string }[]; onCancel: () => void; onChanged: (result: AddOnChangeResult) => void | Promise<void> };
export function AddOnDialog({ edit, categories, usedInPackages, onCancel, onChanged }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('input, button')?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, []);
  const start = edit ? addOnInput(edit) : blankAddOn();
  const [name, setName] = useState(start.name);
  const [price, setPrice] = useState(edit ? String(start.unitPrice) : "");
  const [description, setDescription] = useState(start.description);
  const [hidden, setHidden] = useState(start.isHidden);
  const [perUnit, setPerUnit] = useState(start.isQuantityBased);
  const [scoped, setScoped] = useState(start.compatibleWith.length > 0);
  const [chosen, setChosen] = useState<string[]>(start.compatibleWith);
  // Terms & conditions, one per line: the package that includes this add-on shows them automatically.
  const [termsText, setTermsText] = useState(start.terms.join("\n"));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const heading = edit ? "Edit add-on service" : "New add-on service";
  // Active categories, plus any archived one this add-on is already tagged with so it stays visible.
  const choices = categories.filter(row => row.status !== "archived" || chosen.includes(row.category));
  return (
    <AdminModal open title={heading} size="md" busy={busy || confirmDelete} onClose={onCancel}>
      <div ref={ref}>
        <form className="admin-panel" onSubmit={async event => {
      event.preventDefault(); event.stopPropagation(); if (busy) return;
      const unitPrice = Number(price);
      if (!name.trim()) { setError("Enter the add-on name."); return; }
      if (price === "" || !Number.isFinite(unitPrice) || unitPrice < 0) { setError("Enter a price of ₹0 or more."); return; }
      if (scoped && !chosen.length) { setError("Choose at least one category, or choose all categories."); return; }
      if (edit && unitPrice !== edit.unitPrice && !(await confirm({
        title: "Change add-on price?",
        message: "New projects and packages use the new price. Packages already saved keep their saved price.",
        confirmLabel: "Change price",
        variant: "primary",
      }))) return;
      setBusy(true); setError("");
      try {
        const terms = termsText.split("\n").map(line => line.trim()).filter(Boolean);
        const saved = await callAddOnApi("POST", { ...(edit ? { id: edit.id } : {}), name: name.trim(), unitPrice, description: description.trim(), isHidden: hidden, isQuantityBased: perUnit, compatibleWith: scoped ? chosen : [], terms });
        await onChanged({ id: saved.id });
      } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save the add-on."); }
      finally { setBusy(false); }
    }}>
      <fieldset disabled={busy} style={{ border: 0, padding: 0 }}>
        <label className="admin-field"><span>Add-on name *</span><input required maxLength={120} value={name} onChange={event => setName(event.target.value)} /></label>
        <label className="admin-field"><span>Price (₹) *</span><input type="number" min={0} max={10000000} step="0.01" value={price} onChange={event => setPrice(event.target.value)} /><small>{perUnit ? "The price of one unit; the package counts how many." : "A fixed price, counted once."}</small></label>
        <label className="admin-field"><span>Description</span><textarea maxLength={1000} value={description} onChange={event => setDescription(event.target.value)} /></label>
        <label className="admin-field"><span>Terms &amp; conditions (one per line)</span><textarea rows={4} aria-label="Terms and conditions" value={termsText} onChange={event => setTermsText(event.target.value)} /><small>A package that includes this add-on shows these terms automatically.</small></label>
        <label><input type="checkbox" checked={perUnit} onChange={event => setPerUnit(event.target.checked)} /> Price per unit (it can be taken more than once, e.g. extra pages)</label>
        <label><input type="checkbox" checked={hidden} onChange={event => setHidden(event.target.checked)} /> Hidden (not offered for new projects or packages)</label>
        <fieldset style={{ border: 0, padding: 0 }}><legend>Offered for</legend>
          <label><input type="radio" name="addon-scope" checked={!scoped} onChange={() => setScoped(false)} /> All categories</label>
          <label><input type="radio" name="addon-scope" checked={scoped} onChange={() => setScoped(true)} /> Only the categories I choose</label>
          {scoped && choices.map(row => <label key={row.category} style={{ display: "block" }}><input type="checkbox" checked={chosen.includes(row.category)} onChange={event => setChosen(current => event.target.checked ? [...current, row.category] : current.filter(key => key !== row.category))} /> {row.label}{row.status === "archived" ? " (archived)" : ""}</label>)}
        </fieldset>
        {edit && usedInPackages !== undefined && (
          <div style={{ marginTop: 14, padding: "10px 12px", borderRadius: 8, border: "1px solid var(--pn-line)", background: "var(--pn-raised)", fontSize: 13 }}>
            <strong style={{ display: "block", marginBottom: 4, color: "var(--pn-text)" }}>
              Used in packages ({usedInPackages.length})
            </strong>
            {usedInPackages.length ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 12px", maxHeight: 110, overflowY: "auto" }}>
                {usedInPackages.map(pkg => (
                  <Link key={pkg.id} href={`/admin/packages?package=${encodeURIComponent(pkg.id)}`} style={{ color: "var(--pn-accent)", fontWeight: 600 }}>
                    {pkg.name} →
                  </Link>
                ))}
              </div>
            ) : (
              <span style={{ color: "var(--pn-muted)" }}>Not used in any saved package yet.</span>
            )}
          </div>
        )}
        {error && <p role="alert">{error}</p>}
        <div className="form-actions">
          {edit && <DangerButton onClick={() => setConfirmDelete(true)}>Delete add-on</DangerButton>}
          <button type="button" className="admin-action" onClick={onCancel}>Cancel</button>
          <button type="submit" className="admin-button">{busy ? "Saving…" : edit ? "Save add-on" : "Create add-on"}</button>
        </div>
      </fieldset>
    </form>
    {confirmDialog}
    {edit && confirmDelete && (
      <AddOnDeleteDialog
        addOn={edit}
        onCancel={() => setConfirmDelete(false)}
        onDone={async res => {
          setConfirmDelete(false);
          await onChanged(res);
        }}
      />
    )}
      </div>
    </AdminModal>
  );
}
