"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCommunicationRefresh } from "@/lib/communication-live";
import styles from "../email-control/email-control.module.css";
import { Loader } from "../email-control/loader";
import c from "./actions-panel.module.css";

type Surface = "Admin" | "Client" | "Website" | "System";
type ActionRow = {
  id: string;
  title: string;
  what: string;
  when: string;
  method: string;
  endpoint: string;
  note: string;
  surface: Surface;
  category: string;
  archived: boolean;
  deleted: boolean;
  changed: boolean;
};
type ActionsData = { actions: ActionRow[]; surfaces: Surface[]; categories: string[] };
type View = "all" | Surface | "archived" | "deleted";
type SortKey = "id" | "title" | "surface" | "category";

const SURFACE_TITLES: Record<Surface, string> = { Admin: "Admin panel", Client: "Client portal", Website: "Website", System: "System" };
const SURFACE_DOT: Record<Surface, string> = { Admin: "#007f99", Client: "#6b5ce7", Website: "#1f8a4c", System: "#8a8f98" };
const VIEWS: { id: View; label: string }[] = [
  { id: "all", label: "All" },
  { id: "Admin", label: "Admin panel" },
  { id: "Client", label: "Client portal" },
  { id: "Website", label: "Website" },
  { id: "System", label: "System" },
  { id: "archived", label: "Archived" },
  { id: "deleted", label: "Deleted" },
];

export function ActionsPanel({ active }: { active: boolean }) {
  const [data, setData] = useState<ActionsData | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [view, setView] = useState<View>("all");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "id", desc: false });
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; draft: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (signal: AbortSignal) => {
    try {
      const response = await fetch("/api/auto-reply/actions", { signal, cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not load actions.");
      if (!signal.aborted) { setData(result.data); setError(""); }
    } catch (failure) {
      if (!signal.aborted) setError(failure instanceof Error ? failure.message : "Could not load actions.");
    }
  }, []);
  useCommunicationRefresh(load, active);

  // Save one action's change, then replace that row with the server's version.
  async function save(id: string, change: Record<string, unknown>, done: string) {
    setSaving(true);
    setNotice("");
    setError("");
    try {
      const response = await fetch(`/api/auto-reply/actions/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(change),
        cache: "no-store",
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not save.");
      const updated = result.data as ActionRow;
      setData(current => current && { ...current, actions: current.actions.map(row => (row.id === id ? updated : row)) });
      setNotice(done);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not save.");
    } finally {
      setSaving(false);
      setMenuFor(null);
      setEditing(null);
    }
  }

  const all = useMemo(() => data?.actions ?? [], [data]);
  const counts = useMemo(() => {
    const live = all.filter(row => !row.archived && !row.deleted);
    const surfaceCount = (s: Surface) => live.filter(row => row.surface === s).length;
    return {
      all: live.length,
      Admin: surfaceCount("Admin"), Client: surfaceCount("Client"), Website: surfaceCount("Website"), System: surfaceCount("System"),
      archived: all.filter(row => row.archived && !row.deleted).length,
      deleted: all.filter(row => row.deleted).length,
    } as Record<View, number>;
  }, [all]);

  // Rows of the chosen view, then the search and category filter, then the sort.
  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const inView = all.filter(row => {
      if (view === "archived") return row.archived && !row.deleted;
      if (view === "deleted") return row.deleted;
      if (row.archived || row.deleted) return false;
      return view === "all" || row.surface === view;
    });
    const filtered = inView.filter(row =>
      (!category || row.category === category) &&
      (!needle || `${row.title} ${row.what} ${row.when} ${row.id} ${row.endpoint} ${row.category}`.toLowerCase().includes(needle)));
    const valueOf = (row: ActionRow) => (sort.key === "surface" ? row.surface : sort.key === "title" ? row.title : sort.key === "category" ? row.category : row.id);
    return [...filtered].sort((a, b) => {
      const result = String(valueOf(a)).localeCompare(String(valueOf(b)), undefined, { numeric: true });
      return sort.desc ? -result : result;
    });
  }, [all, view, query, category, sort]);

  const sortHeader = (key: SortKey, label: string) => (
    <th aria-sort={sort.key === key ? (sort.desc ? "descending" : "ascending") : "none"}>
      <button type="button" onClick={() => setSort(current => ({ key, desc: current.key === key ? !current.desc : false }))}>
        {label}{sort.key === key ? (sort.desc ? " ▼" : " ▲") : ""}
      </button>
    </th>
  );

  function commitCategory(row: ActionRow) {
    const next = editing?.draft.replace(/\s+/g, " ").trim() ?? "";
    setEditing(null);
    if (!next || next === row.category) return;
    void save(row.id, { category: next }, "Category saved.");
  }

  return <section className={styles.section} aria-label="Actions list" hidden={!active}>
    <p className={styles.muted}>Each action in plain words. Change Where or Category right in the row; use Manage for archive, delete or reset.</p>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}

    {!data ? !error && <Loader label="Loading actions…" /> : <>
      <div role="tablist" aria-label="Show actions" className={c.segment}>
        {VIEWS.map(item => <button key={item.id} type="button" role="tab" aria-selected={view === item.id} onClick={() => { setView(item.id); setMenuFor(null); }}>
          {item.id in SURFACE_DOT && <span className={c.dot} style={{ background: SURFACE_DOT[item.id as Surface] }} aria-hidden="true" />}
          {item.label} <span className={c.badge}>({counts[item.id]})</span>
        </button>)}
      </div>

      <div className={c.toolbar}>
        <div>
          <input className={c.search} type="search" aria-label="Find an action" placeholder="Find by name, what it does, or endpoint" value={query} onChange={event => setQuery(event.target.value)} />{" "}
          <select className={c.select} aria-label="Category" value={category} onChange={event => setCategory(event.target.value)}>
            <option value="">All categories</option>
            {data.categories.map(item => <option key={item} value={item}>{item}</option>)}
          </select>
        </div>
        <span className={c.count}>Showing {rows.length} {rows.length === 1 ? "action" : "actions"}</span>
      </div>

      {!rows.length ? <p>No actions here.</p> : <div className={c.tableWrap}>
        <table className={c.table} aria-label="Actions table">
          <thead><tr>
            {sortHeader("title", "Action")}
            <th>What it does</th>
            <th>When it happens</th>
            {sortHeader("surface", "Where")}
            {sortHeader("category", "Category")}
            <th>Status</th>
            <th className={c.right}>Manage</th>
          </tr></thead>
          <tbody>
            {rows.map(row => <tr key={row.id} data-off={row.archived || row.deleted ? "true" : "false"}>
              <td className={c.actionCell}>
                <div className={c.actionBox}>
                  <strong>{row.title}</strong>
                  <span className={c.meta}>{row.id} · <code className={c.method}>{row.method}</code> <code className={c.endpoint}>{row.endpoint}</code></span>
                  {row.note && <span className={c.note}>{row.note}</span>}
                </div>
              </td>
              <td className={c.wrapText}>{row.what}</td>
              <td className={c.wrapText}>{row.when}</td>
              <td>
                <select className={c.inlineSelect} aria-label={`Where ${row.id}`} value={row.surface} disabled={saving || row.deleted}
                  onChange={event => { const next = event.target.value as Surface; if (next !== row.surface) void save(row.id, { surface: next }, `Moved to ${SURFACE_TITLES[next]}.`); }}>
                  {data.surfaces.map(item => <option key={item} value={item}>{SURFACE_TITLES[item]}</option>)}
                </select>
              </td>
              <td>
                {editing?.id === row.id ? <input className={c.cellInput} aria-label={`Category for ${row.id}`} autoFocus list="action-categories" value={editing.draft}
                  onChange={event => setEditing({ id: row.id, draft: event.target.value })}
                  onBlur={() => commitCategory(row)}
                  onKeyDown={event => {
                    if (event.key === "Enter") { event.preventDefault(); commitCategory(row); }
                    if (event.key === "Escape") { event.preventDefault(); setEditing(null); }
                  }} />
                  : <button type="button" className={c.cellButton} title="Click to change the category" disabled={saving || row.deleted}
                    onClick={() => setEditing({ id: row.id, draft: row.category })}>{row.category}</button>}
              </td>
              <td>
                {row.deleted && <span className={`${c.status} ${c.statusDeleted}`}>Deleted</span>}
                {row.archived && !row.deleted && <span className={`${c.status} ${c.statusArchived}`}>Archived</span>}
                {row.changed && !row.archived && !row.deleted && <span className={`${c.status} ${c.statusChanged}`}>Changed</span>}
              </td>
              <td className={c.right}>
                <ManageMenu row={row} open={menuFor === row.id} saving={saving}
                  onToggle={() => setMenuFor(menuFor === row.id ? null : row.id)}
                  onClose={() => setMenuFor(null)}
                  onAction={(change, done) => void save(row.id, change, done)} />
              </td>
            </tr>)}
          </tbody>
        </table>
        <datalist id="action-categories">{data.categories.map(item => <option key={item} value={item} />)}</datalist>
      </div>}
    </>}
  </section>;
}

function ManageMenu({ row, open, saving, onToggle, onClose, onAction }: {
  row: ActionRow; open: boolean; saving: boolean;
  onToggle: () => void; onClose: () => void; onAction: (change: Record<string, unknown>, done: string) => void;
}) {
  const wrap = useRef<HTMLDivElement>(null);

  // Close on a click outside the menu or on Escape.
  useEffect(() => {
    if (!open) return;
    const outside = (event: MouseEvent) => { if (wrap.current && !wrap.current.contains(event.target as Node)) onClose(); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("mousedown", outside); document.removeEventListener("keydown", escape); };
  }, [open, onClose]);

  return <div className={c.menuWrap} ref={wrap}>
    <button type="button" className={c.manage} aria-haspopup="menu" aria-expanded={open} aria-label={`Manage ${row.id} ${row.title}`}
      onClick={onToggle} disabled={saving}>Manage ▾</button>
    {open && <div className={c.menu} role="menu" aria-label={`Manage ${row.id}`}>
      <div className={c.menuTitle}>{row.title}<br /><span>{row.id} · {row.endpoint}</span></div>
      {!row.deleted && <button type="button" role="menuitem" disabled={saving} onClick={() => onAction({ archived: !row.archived }, row.archived ? "Action restored." : "Action archived.")}>
        <strong>{row.archived ? "Restore" : "Archive"}</strong>
        <span>{row.archived ? "Show it in the list again." : "Hide it from the list. It stays in Archived."}</span>
      </button>}
      {!row.deleted && <button type="button" role="menuitem" className={c.danger} disabled={saving} onClick={() => onAction({ deleted: true }, "Action removed from the list. The code stays.")}>
        <strong>Delete from list</strong>
        <span>Remove it from this list. The code stays; Restore it from Deleted.</span>
      </button>}
      {row.deleted && <button type="button" role="menuitem" disabled={saving} onClick={() => onAction({ deleted: false }, "Action restored.")}>
        <strong>Restore</strong>
        <span>Put it back in the list.</span>
      </button>}
      {row.changed && <button type="button" role="menuitem" disabled={saving} onClick={() => onAction({ reset: true }, "Action reset to its original place.")}>
        <strong>Reset to original</strong>
        <span>Put it back where the catalog has it.</span>
      </button>}
    </div>}
  </div>;
}
