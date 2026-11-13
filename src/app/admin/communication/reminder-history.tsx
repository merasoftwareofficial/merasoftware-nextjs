"use client";
import { useCallback, useState } from "react";
import { useCommunicationRefresh } from "@/lib/communication-live";
import { formatIndiaDateTime } from "@/lib/date-time";
import { Loader } from "@/app/admin/email-control/loader";
import styles from "../email-control/email-control.module.css";
import s from "./communication.module.css";
import { InfoTip } from "./reminder-info";

type Row = { _id: string; customer: string; ruleName: string; source: string; dueAt: string; status: string; reason?: string; channel: string; channelOutcomes?: { email?: string; whatsapp?: string } };
type View = 'all' | 'upcoming' | 'today' | 'sent' | 'sent_today' | 'attention';
type Reply = { page: number; pageSize: number; view: View; total: number; rows: Row[] };
export function ReminderHistory({ active, source, compact = false }: { active: boolean; source?: "monthly_package" | "broadcast"; compact?: boolean }) {
  const [page, setPage] = useState(1), [data, setData] = useState<Reply | null>(null), [error, setError] = useState("");
  const [view, setView] = useState<View>('all');
  const [retrying, setRetrying] = useState("");
  const load = useCallback(async (signal: AbortSignal) => {
    try {
      const response = await fetch(`/api/auto-reply/reminder-runs?page=${page}&view=${view}${source ? `&source=${source}` : ""}`, { signal, cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not load reminder activity.');
      if (!signal.aborted) { setData(result.data); setError(''); }
    } catch (failure) { if (!signal.aborted) setError(failure instanceof Error ? failure.message : 'Could not load reminder activity.'); }
  }, [page, view, source]);
  useCommunicationRefresh(load, active, 5000, `${page}:${view}`);
  async function retry(id: string) {
    setRetrying(id); setError('');
    try {
      const response = await fetch(`/api/auto-reply/reminder-runs/${id}/retry`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not retry this reminder.');
      await load(new AbortController().signal);
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not retry this reminder.'); }
    finally { setRetrying(''); }
  }
  const ready = data?.page === page && data.view === view;
  const Row = compact ? "div" : "article";
  return <section className={styles.section} aria-label="New reminder activity">
    {compact ? <div className={s.workToolbar}><h3>Activity</h3><InfoTip label="Activity"><p>Scheduled and finished steps from the new rule system. Queued means waiting for WhatsApp, not delivered.</p></InfoTip></div> : <h3>New reminder activity</h3>}
    {!compact && <p className={styles.muted}>Scheduled and finished steps from the new rule system. Existing offer reminders are shown separately. Queued means waiting for WhatsApp, not delivered.</p>}
    <label className={styles.filters}>Show <select value={view} onChange={event => { setPage(1); setView(event.target.value as View); }}><option value="all">All reminder steps</option><option value="upcoming">Upcoming scheduled</option><option value="today">Due today (India time)</option><option value="sent_today">Fully sent today (India time)</option><option value="sent">Sent</option><option value="attention">Needs attention</option></select></label>
    {view === 'sent_today' && <p className={styles.muted}>Shows deliveries with a recorded completion time for all selected channels. Older records without a completion time are not counted.</p>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    {!ready ? !error && <Loader label="Loading reminder activity…" /> : <>
      {!data.rows.length ? <p>{compact ? "No steps yet." : "No reminder steps yet. Steps appear after a reminder rule is active and the server scheduler has run."}</p> : data.rows.map(row => <Row className={compact ? s.plainRow : styles.card} key={row._id}><div>
        <strong>{row.customer} · {row.ruleName}</strong><p>{row.source === 'monthly_package' ? 'Monthly package' : 'Broadcast'} · {formatIndiaDateTime(row.dueAt)} (IST)</p>
        <small>{row.status.replaceAll('_', ' ')} · {row.channel}{row.channelOutcomes ? ` · Email: ${row.channelOutcomes.email || 'unknown'} · WhatsApp: ${row.channelOutcomes.whatsapp || 'unknown'}` : ''}</small>{row.reason && <p className={styles.muted}>{row.reason}</p>}
      </div>{row.status === 'partial' && row.channelOutcomes?.email === 'sent' && row.channelOutcomes?.whatsapp === 'failed' && <button type="button" disabled={!!retrying} onClick={() => retry(row._id)}>{retrying === row._id ? 'Retrying…' : 'Retry WhatsApp queue'}</button>}</Row>)}
      <div className={styles.actions}><button type="button" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>Previous</button><span>Page {page} · {data.total} steps</span><button type="button" disabled={page * data.pageSize >= data.total} onClick={() => setPage(value => value + 1)}>Next</button></div>
    </>}
  </section>;
}
