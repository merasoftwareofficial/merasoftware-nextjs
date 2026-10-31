"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import s from "./offer-targets.module.css";

type Stage = "Contacted" | "Positive" | "Negative" | "Won";
type Row = { id: string; leadId: string; type: "client" | "lead"; name: string; phone: string; category: string; stage: Stage; blockLabel?: string };
type Counts = { total: number; clients: number; leads: number; stages: Record<string, number>; categories: Record<string, number> };
type Candidate = { type: "client" | "lead"; id: string; name: string; phone: string; email: string; category: string; inOffer: boolean; block?: string; blockLabel?: string };
type AddResult = { added: number; already: number; skipped: { name: string; reason: string }[] };

const LABELS: Record<string, string> = { Contacted: "Neutral", Won: "Matured" };
const label = (value: string) => LABELS[value] || value;
const STAGES: Stage[] = ["Contacted", "Positive", "Negative"];
const BEHAVIOURS = ["Contacted", "Positive", "Active", "Lazy", "Tough", "Negative", "Unhappy", "Dead"];
const LEAD_CATEGORIES = ["Inquiry", "Contacted", "Positive", "Active", "Lazy", "Tough", "Negative", "Unhappy", "Dead", "Wrong"];
const personKey = (row: { type: string; id: string }) => `${row.type}:${row.id}`;

async function api<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(`/api/offer-targets/${path}`, { method, cache: "no-store", headers: { "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Request failed.");
  return result.data;
}
const errorText = (error: unknown) => error instanceof Error ? error.message : "Request failed.";

export function OfferTargetsPanel({ slug, running, ended }: { slug: string; running: boolean; ended: boolean }) {
  const offerPath = `offers/${encodeURIComponent(slug)}`;
  const [rows, setRows] = useState<Row[] | null>(null);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [stageFilter, setStageFilter] = useState("all");
  const [adding, setAdding] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [kind, setKind] = useState<"client" | "lead">("client");
  const [categories, setCategories] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [skipped, setSkipped] = useState<AddResult["skipped"]>([]);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const data = await api<{ rows: Row[]; counts: Counts }>(offerPath);
    setRows(data.rows);
    setCounts(data.counts);
  }, [offerPath]);
  useEffect(() => {
    let live = true;
    api<{ rows: Row[]; counts: Counts }>(offerPath)
      .then((data) => { if (live) { setRows(data.rows); setCounts(data.counts); } })
      .catch((failure) => { if (live) setError(errorText(failure)); });
    return () => { live = false; };
  }, [offerPath]);

  const openAdd = async () => {
    setAdding(true); setNotice(""); setSkipped([]); setError(""); setChosen(new Set());
    try { setCandidates(await api<Candidate[]>(`${offerPath}/candidates`)); }
    catch (failure) { setError(errorText(failure)); }
  };
  const act = async (work: () => Promise<unknown>) => {
    setBusy(true); setError("");
    try { await work(); await load(); }
    catch (failure) { setError(errorText(failure)); await load().catch(() => {}); }
    finally { setBusy(false); }
  };

  const ofKind = useMemo(() => (candidates || []).filter(row => row.type === kind), [candidates, kind]);
  const categoryCounts = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const row of ofKind) totals[row.category] = (totals[row.category] || 0) + 1;
    return totals;
  }, [ofKind]);
  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return ofKind.filter(row => (!categories.length || categories.includes(row.category))
      && (!query || `${row.name} ${row.phone} ${row.email}`.toLowerCase().includes(query)));
  }, [categories, ofKind, search]);
  const selectable = useMemo(() => visible.filter(row => !row.block && !row.inOffer), [visible]);
  const chosenRows = (candidates || []).filter(row => chosen.has(personKey(row)));
  const unhappy = chosenRows.filter(row => row.category === "Unhappy").length;

  const toggle = (row: Candidate) => setChosen((current) => {
    const next = new Set(current);
    if (next.has(personKey(row))) next.delete(personKey(row)); else next.add(personKey(row));
    return next;
  });
  const selectAll = () => setChosen(current => new Set([...current, ...selectable.map(personKey)]));
  const clearVisible = () => setChosen((current) => {
    const next = new Set(current);
    for (const row of visible) next.delete(personKey(row));
    return next;
  });
  const addChosen = () => act(async () => {
    const result = await api<AddResult>(`${offerPath}/people`, "POST", { people: chosenRows.map(row => ({ type: row.type, id: row.id })) });
    setNotice(`${result.added} added.${result.already ? ` ${result.already} already in this offer.` : ""}${result.skipped.length ? ` ${result.skipped.length} left out.` : ""}`);
    setSkipped(result.skipped);
    setChosen(new Set());
    setAdding(false);
  });

  const shown = (rows || []).filter(row => stageFilter === "all" || row.stage === stageFilter);

  return <div className={s.panel}>
    {ended && <p className={s.warn}>Offer ended. New people and new messages stop here; this list and its follow-ups stay.</p>}
    {!running && !ended && <p className={s.warn}>This offer is not published, so people can&apos;t be added yet.</p>}
    {error && <p className={s.error} role="alert">{error}</p>}
    {notice && <p className={s.notice} role="status">{notice}</p>}
    {skipped.length > 0 && <details className={s.skipped}><summary>Who was left out</summary><ul>{skipped.map((row, index) => <li key={index}><b>{row.name || "Unnamed"}</b>: {row.reason}</li>)}</ul></details>}

    <section className={s.counts} aria-label="Counts for this offer">
      {[["People", counts?.total], ["Existing clients", counts?.clients], ["Leads", counts?.leads], ["Neutral", counts?.stages.Contacted], ["Positive", counts?.stages.Positive], ["Negative", counts?.stages.Negative], ["Matured", counts?.stages.Won]].map(([name, value]) => <div key={name as string}><strong>{rows ? value || 0 : "–"}</strong><span>{name}</span></div>)}
    </section>

    <div className={s.bar}>
      <label className={s.field}>Stage
        <select value={stageFilter} onChange={event => setStageFilter(event.target.value)}>
          <option value="all">All</option>
          {[...STAGES, "Won"].map(stage => <option key={stage} value={stage}>{label(stage)}</option>)}
        </select>
      </label>
      {running && <button type="button" className={s.primary} onClick={() => adding ? setAdding(false) : void openAdd()}>{adding ? "Close" : "Add people"}</button>}
    </div>

    {adding && <section className={s.add} aria-label="Add people">
      <div className={s.tabs} role="group" aria-label="Who to choose from">
        {([["client", "Matured Clients"], ["lead", "Leads"]] as const).map(([id, name]) => <button key={id} type="button" aria-pressed={kind === id} onClick={() => { setKind(id); setCategories([]); }}>{name}</button>)}
      </div>
      <fieldset className={s.categories}><legend>{kind === "client" ? "Client behaviour" : "Lead stage"}</legend>
        {(kind === "client" ? BEHAVIOURS : LEAD_CATEGORIES).map(category => <label key={category}><input type="checkbox" checked={categories.includes(category)} onChange={() => setCategories(current => current.includes(category) ? current.filter(item => item !== category) : [...current, category])} /> {label(category)} <small>{categoryCounts[category] || 0}</small></label>)}
      </fieldset>
      <label className={s.field}>Search by name, phone or email<input value={search} onChange={event => setSearch(event.target.value)} /></label>
      <div className={s.bar}>
        <button type="button" onClick={selectAll} disabled={!selectable.length}>Select all ({selectable.length})</button>
        <button type="button" onClick={clearVisible}>Clear</button>
      </div>
      {!candidates && !error && <p className={s.muted}>Loading people…</p>}
      {candidates && !visible.length && <p className={s.muted}>No one matches this filter.</p>}
      <ul className={s.pick}>{visible.map(row => <li key={personKey(row)} data-off={row.block || row.inOffer ? "" : undefined}><label>
        <input type="checkbox" disabled={Boolean(row.block || row.inOffer)} checked={chosen.has(personKey(row))} onChange={() => toggle(row)} />
        <span className={s.who}><b>{row.name || row.phone || "Unnamed"}</b><small>{row.phone || row.email}</small></span>
        <span className={s.tag}>{label(row.category)}</span>
        {row.inOffer ? <span className={s.reason}>Already in this offer</span> : row.blockLabel ? <span className={s.reason}>{row.blockLabel}</span> : null}
      </label></li>)}</ul>
      {unhappy > 0 && <p className={s.warn}>{unhappy} chosen {unhappy === 1 ? "person is" : "people are"} Unhappy. Please think before marketing to them.</p>}
      <div className={s.bar}><button type="button" className={s.primary} disabled={busy || !chosenRows.length} onClick={() => void addChosen()}>{busy ? "Adding…" : `Add ${chosenRows.length} to offer`}</button></div>
    </section>}

    {!rows && !error && <p className={s.muted}>Loading…</p>}
    {rows && !shown.length && <p className={s.muted}>{rows.length ? "No one at this stage." : "No one in this offer yet."}</p>}
    {shown.length > 0 && <ul className={s.list}>{shown.map(row => <li key={row.id}>
      <div className={s.who}><b>{row.name || row.phone || "Unnamed"}</b><small>{row.type === "client" ? "Existing client" : "Lead"}{row.phone ? ` · ${row.phone}` : ""}</small>{row.blockLabel && <span className={s.reason}>{row.blockLabel}</span>}</div>
      <div className={s.cell}>{row.type === "client"
        ? <label className={s.field}>Behaviour<select value={row.category} disabled={busy} onChange={event => void act(() => api(`leads/${row.leadId}/behaviour`, "PATCH", { behaviour: event.target.value }))}>{BEHAVIOURS.map(value => <option key={value} value={value}>{label(value)}</option>)}</select></label>
        : <div className={s.field}>Lead stage<span className={s.tag}>{label(row.category)}</span></div>}
      </div>
      <div className={s.cell}>{row.stage === "Won"
        ? <div className={s.field}>Offer stage<span className={s.tag}>Matured</span></div>
        : <label className={s.field}>Offer stage<select value={row.stage} disabled={busy} onChange={event => void act(() => api(`people/${row.id}/stage`, "PATCH", { stage: event.target.value }))}>{STAGES.map(stage => <option key={stage} value={stage}>{label(stage)}</option>)}</select></label>}
      </div>
      <div className={s.cell}>{row.stage !== "Won" && <button type="button" disabled={busy} onClick={() => void act(() => api(`people/${row.id}/bought`, "POST", {}))}>Bought this offer</button>}</div>
    </li>)}</ul>}
  </div>;
}
