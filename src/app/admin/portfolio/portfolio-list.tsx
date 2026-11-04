"use client";
import { formatIndiaDate, formatIndiaDateTime } from "@/lib/date-time";
import { useState } from "react";
import Link from "@/components/link";
import type { PortfolioEntry } from "@/lib/portfolio/types";
import { groupPortfolioByClient } from "@/lib/portfolio/client-groups";
import { isSourceCompleted, sourceStatusText } from "@/lib/portfolio/source-status";
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;
const domain = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; } };
export function PortfolioList({ entries, portalUrl }: { entries: PortfolioEntry[]; portalUrl: string }) {
  const [search, setSearch] = useState(""), [status, setStatus] = useState(""), [type, setType] = useState("");
  const term = search.trim().toLowerCase();
  const rows = entries.filter(row => (!status || row.status === status) && (!type || row.source.type === type) && (!term || `${row.title} ${row.source.name} ${row.source.customerName} ${sourceStatusText(row.source)} ${row.category} ${row.source.url}`.toLowerCase().includes(term)));
  const titles = new Map(entries.map(row => [row._id, row.title]));
  const groups = groupPortfolioByClient(rows);
  return <><div className="portfolio-admin-filters"><label className="admin-field">Search<input value={search} onChange={e => setSearch(e.target.value)} placeholder="Project, client, website or progress" /></label><label className="admin-field">Public status<select value={status} onChange={e => setStatus(e.target.value)}><option value="">All statuses</option>{["draft", "published", "hidden"].map(value => <option key={value}>{value}</option>)}</select></label><label className="admin-field">Type<select value={type} onChange={e => setType(e.target.value)}><option value="">All types</option><option value="project">Projects</option><option value="service">Services</option></select></label></div>
    {!entries.length ? <p>No projects imported yet. Configure and start the portfolio worker on the portal backend to import existing projects and services automatically.</p> : null}
    <div className="portfolio-admin-table"><table><thead><tr>{["Project", "Progress", "Public status", "Screenshots", "Last sync", "Action"].map(label => <th key={label}>{label}</th>)}</tr></thead>
      {groups.map(group => <tbody key={group.customerId}>
        <tr className="portfolio-client-row"><th colSpan={6} scope="rowgroup"><span>{group.customerName}</span><small>{[plural(group.projects, "project"), group.services ? plural(group.services, "service") : "", `${group.published} published`].filter(Boolean).join(" · ")}</small>{portalUrl && group.customerId !== "unknown" ? <a href={`${portalUrl}/admin-panel/clients/${group.customerId}`} target="_blank" rel="noopener noreferrer">Open client in portal ↗</a> : null}</th></tr>
        {group.rows.map(row => { const linkedTo = row.source.linkedProjectId; const site = domain(row.source.url); return <tr key={row._id} className={linkedTo ? "portfolio-linked-row" : undefined}>
          <td><strong>{row.title}</strong>{row.title !== row.source.name ? <><br /><small>Portal name: {row.source.name}</small></> : null}<br /><small>{[row.source.type, site, row.source.orderedAt ? `Ordered ${formatIndiaDate(row.source.orderedAt)}` : "", `#${row._id.slice(-6)}`].filter(Boolean).join(" · ")}{portalUrl && row.source.type === "project" ? <> · <a href={`${portalUrl}/admin-panel/project-details/${row._id}`} target="_blank" rel="noopener noreferrer">Portal ↗</a></> : null}</small>{linkedTo ? <p><Link href={`/admin/portfolio/${linkedTo}`}>Linked to {titles.get(linkedTo) || "project"} ↗</Link></p> : null}</td>
          <td>{isSourceCompleted(row.source) ? <span className="status status-live">Completed</span> : sourceStatusText(row.source)}</td>
          <td><span className={row.status === "published" ? "status status-live" : row.status === "draft" ? "status status-draft" : "status"}>{row.status}</span>{row.featured ? " · Featured" : ""}</td>
          <td>{row.capture.status}<br /><small>{row.capture.error}</small></td><td>{formatIndiaDateTime(row.syncedAt)}</td><td><Link href={`/admin/portfolio/${row._id}`}>Edit →</Link></td></tr>; })}
      </tbody>)}</table></div>
    {entries.length > 0 && !rows.length ? <p>No entries match these filters.</p> : null}</>;
}
