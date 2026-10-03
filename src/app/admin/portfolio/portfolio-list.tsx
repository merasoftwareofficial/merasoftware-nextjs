"use client";
import { useState } from "react";
import Link from "@/components/link";
import type { PortfolioEntry } from "@/lib/portfolio/types";
export function PortfolioList({ entries }: { entries: PortfolioEntry[] }) {
  const [search, setSearch] = useState(""), [status, setStatus] = useState(""), [type, setType] = useState("");
  const term = search.trim().toLowerCase();
  const rows = entries.filter(row => (!status || row.status === status) && (!type || row.source.type === type) && (!term || `${row.title} ${row.source.name} ${row.source.customerName} ${row.source.state} ${row.category}`.toLowerCase().includes(term)));
  return <><div className="portfolio-admin-filters"><label className="admin-field">Search<input value={search} onChange={e => setSearch(e.target.value)} placeholder="Project, client, category or source status" /></label><label className="admin-field">Public status<select value={status} onChange={e => setStatus(e.target.value)}><option value="">All statuses</option>{["draft", "published", "hidden"].map(value => <option key={value}>{value}</option>)}</select></label><label className="admin-field">Type<select value={type} onChange={e => setType(e.target.value)}><option value="">All types</option><option value="project">Projects</option><option value="service">Services</option></select></label></div>
    {!entries.length ? <p>No projects imported yet. Configure and start the portfolio worker on the portal backend to import existing projects and services automatically.</p> : null}
    <div className="portfolio-admin-table"><table><thead><tr>{["Project / client", "Source", "Public status", "Screenshots", "Last sync", "Action"].map(label => <th key={label}>{label}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row._id}><td><strong>{row.title}</strong><br /><small>{row.source.customerName || "Client"} · {row.source.type}</small>{row.source.linkedProjectId ? <p><Link href={`/admin/portfolio/${row.source.linkedProjectId}`}>Linked project ↗</Link></p> : null}</td><td>{row.source.available ? row.source.state.replaceAll("_", " ") : "Source unavailable"}</td><td>{row.status}{row.featured ? " · Featured" : ""}</td><td>{row.capture.status}<br /><small>{row.capture.error}</small></td><td>{new Date(row.syncedAt).toLocaleString()}</td><td><Link href={`/admin/portfolio/${row._id}`}>Edit →</Link></td></tr>)}</tbody></table></div>
    {entries.length > 0 && !rows.length ? <p>No entries match these filters.</p> : null}</>;
}
