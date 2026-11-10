"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { addOnInput, blankAddOn } from "@/lib/add-ons";
import type { AddOn } from "@/lib/sales-packages";
import type { ProjectCategory } from "@/lib/service-plans";

// Makes, changes or deletes an add-on service (Additional Features / Upgrades) from the package form. The portal backend
// owns every rule: a service customers already bought cannot be deleted (hide it instead). A change of price reaches new
// projects and packages made from now on; packages already saved keep the prices they were saved with.
type Props = { edit?: AddOn; categories: ProjectCategory[]; onCancel: () => void; onChanged: (result: { id: string; removed?: boolean }) => void | Promise<void> };
export function AddOnDialog({ edit, categories, onCancel, onChanged }: Props) {
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const heading = edit ? "Edit add-on service" : "New add-on service";
  // Active categories, plus any archived one this add-on is already tagged with so it stays visible.
  const choices = categories.filter(row => row.status !== "archived" || chosen.includes(row.category));
  async function call(method: "POST" | "DELETE", body: Record<string, unknown>) {
    const response = await fetch("/api/add-ons", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "The portal did not accept this. Please try again.");
    return result as { id: string };
  }
  return createPortal(<div ref={ref} onKeyDown={event => {
    event.stopPropagation();
    if (event.key === "Escape" && !busy) { event.preventDefault(); onCancel(); }
    if (event.key === "Tab") {
      const controls = [...(ref.current?.querySelectorAll<HTMLElement>('input:not(:disabled), button:not(:disabled), select:not(:disabled), textarea:not(:disabled)') || [])];
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  }} role="dialog" aria-modal="true" aria-label={heading} style={{ position: "fixed", inset: 0, zIndex: 110, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, background: "#0f172a66" }}>
    <form className="admin-panel" style={{ maxWidth: 640, width: "100%", maxHeight: "90vh", overflowY: "auto" }} onSubmit={async event => {
      event.preventDefault(); event.stopPropagation(); if (busy) return;
      const unitPrice = Number(price);
      if (!name.trim()) { setError("Enter the add-on name."); return; }
      if (price === "" || !Number.isFinite(unitPrice) || unitPrice < 0) { setError("Enter a price of ₹0 or more."); return; }
      if (scoped && !chosen.length) { setError("Choose at least one category, or choose all categories."); return; }
      if (edit && unitPrice !== edit.unitPrice && !window.confirm("Change the price? New projects and packages use the new price. Packages already saved keep their saved price.")) return;
      setBusy(true); setError("");
      try {
        const saved = await call("POST", { ...(edit ? { id: edit.id } : {}), name: name.trim(), unitPrice, description: description.trim(), isHidden: hidden, isQuantityBased: perUnit, compatibleWith: scoped ? chosen : [] });
        await onChanged({ id: saved.id });
      } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save the add-on."); }
      finally { setBusy(false); }
    }}>
      <h2>{heading}</h2><fieldset disabled={busy} style={{ border: 0, padding: 0 }}>
        <label className="admin-field"><span>Add-on name *</span><input required maxLength={120} value={name} onChange={event => setName(event.target.value)} /></label>
        <label className="admin-field"><span>Price (₹) *</span><input type="number" min={0} max={10000000} step="0.01" value={price} onChange={event => setPrice(event.target.value)} /><small>{perUnit ? "The price of one unit; the package counts how many." : "A fixed price, counted once."}</small></label>
        <label className="admin-field"><span>Description</span><textarea maxLength={1000} value={description} onChange={event => setDescription(event.target.value)} /></label>
        <label><input type="checkbox" checked={perUnit} onChange={event => setPerUnit(event.target.checked)} /> Price per unit (it can be taken more than once, e.g. extra pages)</label>
        <label><input type="checkbox" checked={hidden} onChange={event => setHidden(event.target.checked)} /> Hidden (not offered for new projects or packages)</label>
        <fieldset style={{ border: 0, padding: 0 }}><legend>Offered for</legend>
          <label><input type="radio" name="addon-scope" checked={!scoped} onChange={() => setScoped(false)} /> All categories</label>
          <label><input type="radio" name="addon-scope" checked={scoped} onChange={() => setScoped(true)} /> Only the categories I choose</label>
          {scoped && choices.map(row => <label key={row.category} style={{ display: "block" }}><input type="checkbox" checked={chosen.includes(row.category)} onChange={event => setChosen(current => event.target.checked ? [...current, row.category] : current.filter(key => key !== row.category))} /> {row.label}{row.status === "archived" ? " (archived)" : ""}</label>)}
        </fieldset>
        {error && <p role="alert">{error}</p>}
        <div className="form-actions">
          {edit && <button type="button" className="admin-action" onClick={async () => {
            if (!window.confirm(`Delete "${edit.name}"? Packages already saved keep it as they were saved. A service customers already bought cannot be deleted; hide it instead.`)) return;
            setBusy(true); setError("");
            try { await call("DELETE", { id: edit.id }); await onChanged({ id: edit.id, removed: true }); }
            catch (cause) { setError(cause instanceof Error ? cause.message : "Could not delete the add-on."); }
            finally { setBusy(false); }
          }}>Delete add-on</button>}
          <button type="button" className="admin-action" onClick={onCancel}>Cancel</button>
          <button type="submit" className="admin-button">{busy ? "Saving…" : edit ? "Save add-on" : "Create add-on"}</button>
        </div>
      </fieldset>
    </form>
  </div>, document.body);
}
