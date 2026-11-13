"use client";

import { useCallback, useMemo, useState } from "react";
import { useCommunicationRefresh } from "@/lib/communication-live";
import styles from "../email-control/email-control.module.css";
import { Loader } from "../email-control/loader";

type Surface = "Admin" | "Client" | "Website" | "System";
type ActionRow = {
  id: string;
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

// Owner's boxes. "System" holds integration and sync calls from other services.
const SURFACE_TITLES: Record<Surface, string> = {
  Admin: "Admin panel",
  Client: "Client portal",
  Website: "Website",
  System: "System",
};
const UNSORTED = "Unsorted";

export function ActionsPanel({ active }: { active: boolean }) {
  const [data, setData] = useState<ActionsData | null>(null);
  const [error, setError] = useState("");
  const [surface, setSurface] = useState<Surface>("Admin");
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

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

  // Save one action's change, then show the server's version of that row.
  async function save(id: string, change: Record<string, unknown>, done: string) {
    setSaving(true);
    setNotice("");
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
      setEditingId(null);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  const live = useMemo(() => (data?.actions ?? []).filter(row => !row.archived && !row.deleted), [data]);
  const counts = useMemo(() => {
    const result = { Admin: 0, Client: 0, Website: 0, System: 0 } as Record<Surface, number>;
    for (const row of live) result[row.surface] += 1;
    return result;
  }, [live]);

  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const rows = live.filter(row => row.surface === surface && (!needle || `${row.endpoint} ${row.category} ${row.id}`.toLowerCase().includes(needle)));
    const byCategory = new Map<string, ActionRow[]>();
    for (const row of rows) byCategory.set(row.category, [...(byCategory.get(row.category) ?? []), row]);
    // "Unsorted" always goes last.
    return [...byCategory.entries()].sort((a, b) => (a[0] === UNSORTED ? 1 : b[0] === UNSORTED ? -1 : a[0].localeCompare(b[0])));
  }, [live, surface, query]);

  const archived = (data?.actions ?? []).filter(row => row.archived && !row.deleted);
  const deleted = (data?.actions ?? []).filter(row => row.deleted);

  return <section className={styles.section} aria-label="Actions" hidden={!active}>
    <p className={styles.muted}>Every action that changes data. Manage an action to move it, archive it or remove it from this list.</p>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}

    {!data ? !error && <Loader label="Loading actions…" /> : <>
      <div role="tablist" aria-label="Where the action happens">
        {data.surfaces.map(item => <button key={item} type="button" role="tab" aria-selected={surface === item} onClick={() => { setSurface(item); setEditingId(null); }}>
          {SURFACE_TITLES[item]} <span>({counts[item]})</span>
        </button>)}
      </div>

      <input type="search" aria-label="Find an action" placeholder="Find an action" value={query} onChange={event => setQuery(event.target.value)} />

      {!groups.length ? <p>No matching actions.</p> : groups.map(([category, rows]) => <div key={category}>
        <h3>{category} <span className={styles.muted}>({rows.length})</span></h3>
        <ul>
          {rows.map(row => <li key={row.id}>
            <div>
              <code>{row.method}</code> <span>{row.endpoint}</span> <small className={styles.muted}>{row.id}</small>
              {row.note && <small className={styles.muted}> · {row.note}</small>}
              {row.changed && <small className={styles.muted}> · changed</small>}
              {" "}<button type="button" onClick={() => setEditingId(editingId === row.id ? null : row.id)} aria-expanded={editingId === row.id}>Manage</button>
            </div>
            {editingId === row.id && <ManageForm row={row} surfaces={data.surfaces} categories={data.categories} saving={saving}
              onSave={(change, done) => save(row.id, change, done)} onCancel={() => setEditingId(null)} />}
          </li>)}
        </ul>
      </div>)}

      <h2>Archived</h2>
      {!archived.length ? <p className={styles.muted}>No archived actions.</p> : data.surfaces.map(item => {
        const rows = archived.filter(row => row.surface === item);
        if (!rows.length) return null;
        return <div key={item}>
          <h3>{SURFACE_TITLES[item]}</h3>
          <ul>{rows.map(row => <li key={row.id}>
            <span>{row.category}</span> · <code>{row.method}</code> <span>{row.endpoint}</span>{" "}
            <button type="button" disabled={saving} onClick={() => save(row.id, { archived: false }, "Action restored.")}>Restore</button>
          </li>)}</ul>
        </div>;
      })}

      <h2>Deleted</h2>
      {!deleted.length ? <p className={styles.muted}>No deleted actions. Deleting only removes an action from this list; the code stays.</p> : <ul>
        {deleted.map(row => <li key={row.id}>
          <span>{SURFACE_TITLES[row.surface]} · {row.category}</span> · <code>{row.method}</code> <span>{row.endpoint}</span>{" "}
          <button type="button" disabled={saving} onClick={() => save(row.id, { deleted: false }, "Action restored.")}>Restore</button>
        </li>)}
      </ul>}
    </>}
  </section>;
}

function ManageForm({ row, surfaces, categories, saving, onSave, onCancel }: {
  row: ActionRow; surfaces: Surface[]; categories: string[]; saving: boolean;
  onSave: (change: Record<string, unknown>, done: string) => void; onCancel: () => void;
}) {
  const [surface, setSurface] = useState<Surface>(row.surface);
  const [category, setCategory] = useState(row.category);
  const listId = `categories-${row.id}`;
  return <form className={styles.section} aria-label={`Manage ${row.endpoint}`} onSubmit={event => {
    event.preventDefault();
    const change: Record<string, unknown> = {};
    if (surface !== row.surface) change.surface = surface;
    if (category.trim() !== row.category) change.category = category;
    if (!Object.keys(change).length) { onCancel(); return; }
    onSave(change, "Action saved.");
  }}>
    <label>Where it happens{" "}
      <select value={surface} onChange={event => setSurface(event.target.value as Surface)}>
        {surfaces.map(item => <option key={item} value={item}>{SURFACE_TITLES[item]}</option>)}
      </select>
    </label>{" "}
    <label>Category{" "}
      <input list={listId} value={category} onChange={event => setCategory(event.target.value)} maxLength={60} />
      <datalist id={listId}>{categories.map(item => <option key={item} value={item} />)}</datalist>
    </label>
    <div>
      <button type="submit" disabled={saving}>Save</button>{" "}
      <button type="button" disabled={saving} onClick={() => onSave({ archived: true }, "Action archived.")}>Archive</button>{" "}
      <button type="button" disabled={saving} onClick={() => onSave({ deleted: true }, "Action removed from the list.")}>Delete from list</button>{" "}
      {row.changed && <button type="button" disabled={saving} onClick={() => onSave({ reset: true }, "Action reset to its original place.")}>Reset to original</button>}{" "}
      <button type="button" disabled={saving} onClick={onCancel}>Cancel</button>
    </div>
  </form>;
}
