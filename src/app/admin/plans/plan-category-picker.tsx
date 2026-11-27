"use client";
import { useState } from "react";
import { CapsuleSelect } from "@/components/capsule-select";
import type { PlanCatalogue, ProjectCategory } from "@/lib/service-plans";
import { ProjectCategoryDialog } from "@/components/project-category-dialog";
type Props = { catalogue: PlanCatalogue; categoryKey: string; busy: boolean; onSelect: (key: string) => void;
  onCatalogue: (catalogue: PlanCatalogue) => void; send: <T>(body: Record<string, unknown>) => Promise<T>; reload: () => Promise<PlanCatalogue> };
export function PlanCategoryPicker({ catalogue, categoryKey, busy, onSelect, onCatalogue, send, reload }: Props) {
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const categories = catalogue.categories.filter(row => (!row.legacy && row.status === "active") || row.key === categoryKey);
  async function saved(category: ProjectCategory) {
    onSelect(category.category); setCreating(false);
    const entry = { ...category, key: category.category, status: category.status === "archived" ? "archived" as const : "active" as const, sortOrder: category.sortOrder || 0 };
    onCatalogue({ ...catalogue, categories: [...catalogue.categories, entry], projectCategories: [...catalogue.projectCategories, category] });
    try { onCatalogue(await reload()); } catch { setError("Category created and selected. Refresh categories to update the list."); }
  }
  return <div><div className="admin-field"><span>Project category</span><CapsuleSelect ariaLabel="Plan category" value={categoryKey} disabled={busy} onChange={onSelect} options={[{ value: "", label: "Choose a category", disabled: true }, ...categories.map(row => ({ value: row.key, label: `${row.label}${row.legacy ? " (needs category mapping)" : row.status === "archived" ? " (archived)" : ""}` }))]} /></div><button type="button" className="admin-action" disabled={busy} onClick={() => { setError(""); setCreating(true); }}>+ New category</button>
  {error && <p role="alert">{error}</p>}
  {creating && <ProjectCategoryDialog nextSortOrder={Math.min(9999, Math.max(0, ...catalogue.projectCategories.map(row => row.sortOrder || 0)) + 1)} onCancel={() => setCreating(false)} onSaved={saved} send={send} />}
  </div>;
}
