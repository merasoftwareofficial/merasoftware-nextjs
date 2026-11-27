"use client";

import { CapsuleSelect } from "@/components/capsule-select";

import { useCallback, useMemo, useState } from "react";
import { useCommunicationRefresh } from "@/lib/communication-live";
import { formatIndiaDateTime } from "@/lib/date-time";
import { Loader } from "@/app/admin/email-control/loader";
import styles from "../email-control/email-control.module.css";
import c from "./actions-panel.module.css";
import { InfoTip } from "./reminder-info";

type Source = "all" | "reservation" | "package_request" | "offer_payment";
type Row = { id: string; source: Source; entityId: string; event: string; actionLabel: string; subject: string; customer: string; context: string; milestone: string; status: string; at: string; emailStatus: string; whatsapp: { status: string; sentAt: string | null }[]; whatsappLastKnown: string | null };
type Page = { page: number; pages: number; pageSize: number; total: number; rows: Row[] };
const names: Record<string, string> = { sent: "Sent", queued: "Queued", pending: "Waiting", staged: "Prepared", sending: "Sending", failed: "Failed", skipped: "Not sent", expired: "Expired", cancelled: "Cancelled", "not-selected": "Not selected", "not-recorded": "Not recorded", unknown: "Unknown" };
const stateName = (value: string) => names[value] || value.replaceAll("_", " ");

export function LegacyReminderHistory({ source = "all", entityId, active, title = "Recorded message history", openAction, defaultOpen = false, compact = false }: { source?: Source; entityId?: string; active: boolean; title?: string; openAction?: (event: string) => void; defaultOpen?: boolean; compact?: boolean }) {
  const [opened, setOpened] = useState(defaultOpen);
  const [filter, setFilter] = useState<Source>(source);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ key: string; value: Page } | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const selected = source === "all" ? filter : source;
  const key = `${selected}:${entityId || ""}:${page}`;

  const load = useCallback(async (signal: AbortSignal) => {
    try {
      const urlQuery = new URLSearchParams({ source: selected, page: String(page), ...(entityId ? { entityId } : {}) });
      const response = await fetch(`/api/auto-reply/legacy-reminder-history?${urlQuery}`, { cache: "no-store", signal });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not load message history.");
      if (!signal.aborted) { setData({ key, value: result.data }); setError(""); }
    } catch (failure) { if (!signal.aborted) setError(failure instanceof Error ? failure.message : "Could not load message history."); }
  }, [selected, page, entityId, key]);
  useCommunicationRefresh(load, active && opened, 0, `${key}:${retry}`);

  const current = data?.key === key ? data.value : null;
  const rows = useMemo(() => {
    const list = current?.rows || [];
    const needle = query.trim().toLowerCase();
    return needle ? list.filter(row => `${row.customer} ${row.context} ${row.actionLabel} ${row.milestone} ${row.subject}`.toLowerCase().includes(needle)) : list;
  }, [current, query]);

  return <details open={defaultOpen} onToggle={event => { if (event.target === event.currentTarget) setOpened(event.currentTarget.open); }}>
    <summary>{title}</summary>
    {opened && <section className={styles.section} aria-label={title}>
      {compact ? <InfoTip label={title}><p>Saved message records, including completed ones. Missing old records are not recreated. WhatsApp results show while queue records remain.</p></InfoTip> : <p className={styles.muted}>Saved message records, including completed records. Missing old records are not recreated. WhatsApp results are shown while queue records remain available.</p>}
      <div className={c.toolbar}>
        {source === "all" && <div className={styles.filters}><span>History source</span> <CapsuleSelect ariaLabel="History source" value={filter} onChange={value => { setFilter(value as Source); setPage(1); }} options={[{ value: "all", label: "All existing workflows" }, { value: "reservation", label: "Reservations" }, { value: "package_request", label: "Package requests" }, { value: "offer_payment", label: "Offer payments" }]} /></div>}
        <input className={c.search} type="search" aria-label="Search message history" placeholder="Search customer or message…" value={query} onChange={event => setQuery(event.target.value)} />
      </div>
      {error && <p className={styles.error} role="alert">{error} <button type="button" onClick={() => setRetry(value => value + 1)}>Retry history</button></p>}
      {!current ? !error && <Loader label="Loading message history…" /> : <>
        {!rows.length ? <p>{query.trim() ? "No matching message records." : "No saved message records."}</p> : (
          <div className={c.tableWrap}>
            <table className={c.table}>
              <thead><tr><th>Customer</th><th>Message &amp; milestone</th><th>Status &amp; time</th><th>Delivery</th>{openAction && <th>Action</th>}</tr></thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.id}>
                    <td><strong>{row.customer}</strong>{row.context && <div className={styles.muted}>{row.context}</div>}</td>
                    <td>
                      <div>{row.actionLabel}</div>
                      {row.milestone && <div className={styles.muted}>{row.milestone}</div>}
                      {row.subject && <div className={styles.muted}>{row.subject}</div>}
                    </td>
                    <td>
                      <div>{stateName(row.status)}</div>
                      <div className={styles.muted}>{formatIndiaDateTime(row.at)}</div>
                    </td>
                    <td>
                      <div>Email: {stateName(row.emailStatus)}</div>
                      <div className={styles.muted}>WhatsApp: {row.whatsapp.length ? row.whatsapp.map(copy => `${stateName(copy.status)}${copy.sentAt ? ` (${formatIndiaDateTime(copy.sentAt)})` : ""}`).join(" · ") : row.whatsappLastKnown === "queued" ? "Previously queued; record unavailable" : row.whatsappLastKnown === "not-selected" ? "Not selected" : "No current queue record"}</div>
                    </td>
                    {openAction && <td><button type="button" className={c.smallBtn} onClick={() => openAction(row.event)}>Actions →</button></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className={styles.actions}><button type="button" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>Previous history page</button><span>Page {current.page} of {current.pages} · {current.total} records</span><button type="button" disabled={page >= current.pages} onClick={() => setPage(value => value + 1)}>Next history page</button></div>
      </>}
    </section>}
  </details>;
}
