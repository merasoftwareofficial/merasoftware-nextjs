"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ProjectCategory } from "@/lib/service-plans";

// Makes a project category, or (with `edit`) changes one. The portal backend keeps every rule (helpers/projectCategories.js):
// a key is permanent and a category is never deleted, only archived; the two categories the customer questionnaire uses
// cannot be archived or left without a price. Changing the base price changes the price of every NEW project and package
// made from the category; packages already saved keep the price they were saved with.
type EditableCategory = ProjectCategory & { locked?: boolean; usage?: { projects: number; features: number; packages: number } };
type Props = { nextSortOrder: number; edit?: EditableCategory; onCancel: () => void; onSaved: (category: ProjectCategory) => void | Promise<void>; send: <T>(body: Record<string, unknown>) => Promise<T> };
export function ProjectCategoryDialog({ nextSortOrder, edit, onCancel, onSaved, send }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('input, button')?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, []);
  const [name, setName] = useState(edit?.label ?? "");
  const [key, setKey] = useState(edit?.category ?? "");
  const [keyEdited, setKeyEdited] = useState(false);
  const [price, setPrice] = useState(edit?.basePrice === null || edit?.basePrice === undefined ? "" : String(edit.basePrice));
  const [description, setDescription] = useState(edit?.description ?? "");
  // Terms & conditions, one per line: a package priced from this category shows them automatically.
  const [termsText, setTermsText] = useState((edit?.terms ?? []).join("\n"));
  const [node, setNode] = useState(edit?.startingNodeTitle ?? "");
  const [sortOrder, setSortOrder] = useState(edit?.sortOrder ?? nextSortOrder);
  const [customerSelectable, setCustomerSelectable] = useState(edit?.customerSelectable ?? false);
  const [archived, setArchived] = useState(edit?.status === "archived");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const heading = edit ? "Edit project category" : "New project category";
  const used = edit?.usage;
  const priceChanged = !!edit && (price === "" ? edit.basePrice !== null && edit.basePrice !== undefined : Number(price) !== edit.basePrice);
  return createPortal(<div ref={ref} onKeyDown={event => {
    event.stopPropagation();
    if (event.key === "Escape" && !busy) { event.preventDefault(); onCancel(); }
    if (event.key === "Tab") {
      const controls = [...(ref.current?.querySelectorAll<HTMLElement>('input:not(:disabled), button:not(:disabled), select:not(:disabled), textarea:not(:disabled)') || [])];
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  }} role="dialog" aria-modal="true" aria-label={heading} style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, background: "#0f172a66" }}>
    <form className="admin-panel" style={{ maxWidth: 640, width: "100%", maxHeight: "90vh", overflowY: "auto" }} onSubmit={async event => {
      event.preventDefault(); event.stopPropagation(); if (busy) return;
      if (priceChanged && !window.confirm("Change the base price? It changes the price of every new project and package made from this category. Packages already saved keep their price.")) return;
      if (edit && archived && edit.status !== "archived" && used?.packages && !window.confirm(`${used.packages} package${used.packages === 1 ? " uses" : "s use"} this category. An archived category blocks editing their live versions until they are moved. Archive it anyway?`)) return;
      setBusy(true); setError("");
      try {
        const category = await send<ProjectCategory>({ target: "category", action: "save_project_category", ...(edit ? {} : { creating: true }),
          category: key, label: name.trim(), basePrice: price === "" ? null : Number(price), description,
          terms: termsText.split("\n").map(line => line.trim()).filter(Boolean),
          startingNodeTitle: node, sortOrder, customerSelectable, status: archived ? "archived" : "active" });
        await onSaved(category);
      } catch (cause) { setError(cause instanceof Error ? cause.message : edit ? "Could not save the category." : "Could not create category."); }
      finally { setBusy(false); }
    }}>
      <h2>{heading}</h2><fieldset disabled={busy} style={{ border: 0, padding: 0 }}>
        <label className="admin-field"><span>Category name</span><input required maxLength={60} value={name} onChange={event => {
          setName(event.target.value); if (!edit && !keyEdited) setKey(event.target.value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^[^a-z]+|_+$/g, "").slice(0, 40));
        }} /></label>
        <label className="admin-field"><span>Permanent key</span><input required readOnly={!!edit} pattern="[a-z][a-z0-9_]{2,39}" maxLength={40} value={key} onChange={event => { setKey(event.target.value); setKeyEdited(true); }} />{edit && <small>The key never changes; every project, offer and package stores it.</small>}</label>
        <label className="admin-field"><span>Base price (INR)</span><input type="number" min={0} step="0.01" value={price} onChange={event => setPrice(event.target.value)} /></label>
        <p>{edit ? "A package priced from this category and a new custom project start from this price. Packages already saved keep the price they were saved with." : "Leave the base price empty if undecided. Category creation does not enable customer project ordering."}</p>
        <label className="admin-field"><span>Description</span><textarea maxLength={1000} value={description} onChange={event => setDescription(event.target.value)} /></label>
        <label className="admin-field"><span>Terms &amp; conditions (one per line)</span><textarea rows={4} aria-label="Category terms and conditions" value={termsText} onChange={event => setTermsText(event.target.value)} /><small>A package priced from this category shows these terms automatically.</small></label>
        <label className="admin-field"><span>Starting node title</span><input maxLength={120} value={node} onChange={event => setNode(event.target.value)} /></label>
        <label className="admin-field"><span>Display order</span><input required type="number" min={0} max={9999} step={1} value={sortOrder} onChange={event => setSortOrder(Number(event.target.value))} /></label>
        <label><input type="checkbox" checked={customerSelectable} onChange={event => setCustomerSelectable(event.target.checked)} /> Customers can order this category online once priced</label>
        {edit && <label><input type="checkbox" checked={archived} disabled={edit.locked} onChange={event => setArchived(event.target.checked)} /> Archived (hidden from new projects and packages; a category is never deleted)
          {edit.locked && <small> The customer questionnaire uses this category, so it must stay active and priced.</small>}
          {used && <small> In use: {used.projects} project{used.projects === 1 ? "" : "s"}, {used.packages} package{used.packages === 1 ? "" : "s"}, {used.features} add-on{used.features === 1 ? "" : "s"}.</small>}</label>}
        {error && <p role="alert">{error}</p>}
        <div className="form-actions"><button type="button" className="admin-action" onClick={onCancel}>Cancel</button><button type="submit" className="admin-button">{busy ? "Saving…" : edit ? "Save category" : "Create category"}</button></div>
      </fieldset>
    </form>
  </div>, document.body);
}
