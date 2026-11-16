"use client";
import { useCallback, useMemo, useState } from "react";
import { useCommunicationRefresh } from "@/lib/communication-live";
import { formatIndiaDateTime } from "@/lib/date-time";
import { Loader } from "@/app/admin/email-control/loader";
import styles from "../email-control/email-control.module.css";
import c from "./actions-panel.module.css";
import s from "./communication.module.css";
import { InfoTip } from "./reminder-info";

type Row = { _id: string; customer: string; ruleName: string; source: string; dueAt: string; status: string; reason?: string; channel: string; channelOutcomes?: { email?: string; whatsapp?: string } };
type View = "all" | "upcoming" | "today" | "sent" | "sent_today" | "attention";
type Reply = { page: number; pageSize: number; view: View; total: number; rows: Row[] };

export function ReminderHistory({ active, source, compact = false }: { active: boolean; source?: "monthly_package" | "broadcast"; compact?: boolean }) {
  const [page, setPage] = useState(1), [data, setData] = useState<Reply | null>(null), [error, setError] = useState("");
  const [view, setView] = useState<View>("all");
  const [query, setQuery] = useState("");
  const [retrying, setRetrying] = useState("");

  const load = useCallback(async (signal: AbortSignal) => {
    try {
      const response = await fetch(`/api/auto-reply/reminder-runs?page=${page}&view=${view}${source ? `&source=${source}` : ""}`, { signal, cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not load reminder activity.");
      if (!signal.aborted) { setData(result.data); setError(""); }
    } catch (failure) { if (!signal.aborted) setError(failure instanceof Error ? failure.message : "Could not load reminder activity."); }
  }, [page, view, source]);
  useCommunicationRefresh(load, active, 5000, `${page}:${view}`);

  async function retry(id: string) {
    setRetrying(id); setError("");
    try {
      const response = await fetch(`/api/auto-reply/reminder-runs/${id}/retry`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not retry this reminder.");
      await load(new AbortController().signal);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Could not retry this reminder."); }
    finally { setRetrying(""); }
  }

  const ready = data?.page === page && data.view === view;
  const rows = useMemo(() => {
    const list = data?.rows || [];
    const needle = query.trim().toLowerCase();
    return needle ? list.filter(row => `${row.customer} ${row.ruleName} ${row.status} ${row.reason || ""}`.toLowerCase().includes(needle)) : list;
  }, [data, query]);

  return <section className={styles.section} aria-label="New reminder activity">
    {compact ? <div className={s.workToolbar}><h3>Activity</h3><InfoTip label="Activity"><p>Scheduled and finished steps from the new rule system. Queued means waiting for WhatsApp, not delivered.</p></InfoTip></div> : <h3>New reminder activity</h3>}
    {!compact && <p className={styles.muted}>Scheduled and finished steps from the new rule system. Existing offer reminders are shown separately. Queued means waiting for WhatsApp, not delivered.</p>}
    <div className={c.toolbar}>
      <label className={styles.filters}>Show <select value={view} onChange={event => { setPage(1); setView(event.target.value as View); }}><option value="all">All reminder steps</option><option value="upcoming">Upcoming scheduled</option><option value="today">Due today (India time)</option><option value="sent_today">Fully sent today (India time)</option><option value="sent">Sent</option><option value="attention">Needs attention</option></select></label>
      <input className={c.search} type="search" aria-label="Search reminder activity" placeholder="Search customer or rule…" value={query} onChange={event => setQuery(event.target.value)} />
    </div>
    {view === "sent_today" && <p className={styles.muted}>Shows deliveries with a recorded completion time for all selected channels. Older records without a completion time are not counted.</p>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    {!ready ? !error && <Loader label="Loading reminder activity…" /> : <>
      {!rows.length ? <p>{compact ? "No steps yet." : query.trim() ? "No matching reminder steps." : "No reminder steps yet. Steps appear after a reminder rule is active and the server scheduler has run."}</p> : (
        <div className={c.tableWrap}>
          <table className={c.table}>
            <thead><tr><th>Customer</th><th>Rule &amp; source</th><th>Due (IST)</th><th>Status &amp; delivery</th><th>Action</th></tr></thead>
            <tbody>
              {rows.map(row => (
                <tr key={row._id}>
                  <td><strong>{row.customer}</strong></td>
                  <td>
                    <div>{row.ruleName}</div>
                    <div className={styles.muted}>{row.source === "monthly_package" ? "Monthly package" : "Broadcast"}</div>
                  </td>
                  <td>{formatIndiaDateTime(row.dueAt)}</td>
                  <td>
                    <div>{row.status.replaceAll("_", " ")} · {row.channel}</div>
                    {row.channelOutcomes && <div className={styles.muted}>Email: {row.channelOutcomes.email || "unknown"} · WhatsApp: {row.channelOutcomes.whatsapp || "unknown"}</div>}
                    {row.reason && <div className={styles.muted}>{row.reason}</div>}
                  </td>
                  <td>
                    {row.status === "partial" && row.channelOutcomes?.email === "sent" && row.channelOutcomes?.whatsapp === "failed"
                      ? <button type="button" className={c.smallBtn} disabled={!!retrying} onClick={() => retry(row._id)}>{retrying === row._id ? "Retrying…" : "Retry WhatsApp queue"}</button>
                      : <span className={styles.muted}>—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className={styles.actions}><button type="button" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>Previous</button><span>Page {page} · {data.total} steps</span><button type="button" disabled={page * data.pageSize >= data.total} onClick={() => setPage(value => value + 1)}>Next</button></div>
    </>}
  </section>;
}
