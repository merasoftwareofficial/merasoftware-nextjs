"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ProjectCategory } from "@/lib/service-plans";

type Props = { nextSortOrder: number; onCancel: () => void; onSaved: (category: ProjectCategory) => void | Promise<void>; send: <T>(body: Record<string, unknown>) => Promise<T> };
export function ProjectCategoryDialog({ nextSortOrder, onCancel, onSaved, send }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('input, button')?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, []);
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [keyEdited, setKeyEdited] = useState(false);
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [node, setNode] = useState("");
  const [sortOrder, setSortOrder] = useState(nextSortOrder);
  const [customerSelectable, setCustomerSelectable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return createPortal(<div ref={ref} onKeyDown={event => {
    event.stopPropagation();
    if (event.key === "Escape" && !busy) { event.preventDefault(); onCancel(); }
    if (event.key === "Tab") {
      const controls = [...(ref.current?.querySelectorAll<HTMLElement>('input:not(:disabled), button:not(:disabled), select:not(:disabled), textarea:not(:disabled)') || [])];
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  }} role="dialog" aria-modal="true" aria-label="New project category" style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, background: "#0f172a66" }}>
    <form className="admin-panel" style={{ maxWidth: 640, width: "100%", maxHeight: "90vh", overflowY: "auto" }} onSubmit={async event => {
      event.preventDefault(); event.stopPropagation(); if (busy) return;
      setBusy(true); setError("");
      try {
        const category = await send<ProjectCategory>({ target: "category", action: "save_project_category", creating: true,
          category: key, label: name.trim(), basePrice: price === "" ? null : Number(price), description,
          startingNodeTitle: node, sortOrder, customerSelectable, status: "active" });
        await onSaved(category);
      } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not create category."); }
      finally { setBusy(false); }
    }}>
      <h2>New project category</h2><fieldset disabled={busy} style={{ border: 0, padding: 0 }}>
        <label className="admin-field"><span>Category name</span><input required maxLength={60} value={name} onChange={event => {
          setName(event.target.value); if (!keyEdited) setKey(event.target.value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^[^a-z]+|_+$/g, "").slice(0, 40));
        }} /></label>
        <label className="admin-field"><span>Permanent key</span><input required pattern="[a-z][a-z0-9_]{2,39}" maxLength={40} value={key} onChange={event => { setKey(event.target.value); setKeyEdited(true); }} /></label>
        <label className="admin-field"><span>Base price (INR)</span><input type="number" min={0} step="0.01" value={price} onChange={event => setPrice(event.target.value)} /></label>
        <p>Leave the base price empty if undecided. Category creation does not enable customer project ordering.</p>
        <label className="admin-field"><span>Description</span><textarea maxLength={1000} value={description} onChange={event => setDescription(event.target.value)} /></label>
        <label className="admin-field"><span>Starting node title</span><input maxLength={120} value={node} onChange={event => setNode(event.target.value)} /></label>
        <label className="admin-field"><span>Display order</span><input required type="number" min={0} max={9999} step={1} value={sortOrder} onChange={event => setSortOrder(Number(event.target.value))} /></label>
        <label><input type="checkbox" checked={customerSelectable} onChange={event => setCustomerSelectable(event.target.checked)} /> Customers can order this category online once priced</label>
        {error && <p role="alert">{error}</p>}
        <div className="form-actions"><button type="button" className="admin-action" onClick={onCancel}>Cancel</button><button type="submit" className="admin-button">{busy ? "Saving…" : "Create category"}</button></div>
      </fieldset>
    </form>
  </div>, document.body);
}
