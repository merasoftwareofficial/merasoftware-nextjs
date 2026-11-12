"use client";

import { useCallback, useState } from "react";
import { useCommunicationRefresh } from "@/lib/communication-live";
import { formatIndiaDateTime } from "@/lib/date-time";
import { Loader } from "@/app/admin/email-control/loader";
import styles from "../email-control/email-control.module.css";

const ACTION_LABEL: Record<string, string> = { 'plan.started': 'Plan-start message settings', 'offer.reserved': 'Reservation message settings' };
type Row = { id: string; kind: string; title: string; person: string; at: string; detail: string; status: string; relatedEvent?: string };
export function BusinessActivity({ active, openAction }: { active: boolean; openAction: (event: string) => void }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async (signal: AbortSignal) => {
    try {
      const response = await fetch('/api/auto-reply/business-activity', { signal, cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not load activity.');
      if (!signal.aborted) { setRows(result.data); setError(''); }
    } catch (failure) { if (!signal.aborted) setError(failure instanceof Error ? failure.message : 'Could not load activity.'); }
  }, []);
  useCommunicationRefresh(load, active);
  return <section className={styles.section} aria-label="Recent business activity">
    <h2>Recent business activity</h2>
    <p className={styles.muted}>Recent monthly package orders, plan starts, offer reservations and accepted broadcasts, read from existing records. This is not a complete log of every action. An order can be created before its plan starts.</p>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {!rows ? !error && <Loader label="Loading activity…" /> : !rows.length ? <p>No matching activity.</p> : rows.map(row => <article className={styles.card} key={`${row.kind}-${row.id}`}>
      <div><strong>{row.title}</strong><p>{row.person} · {row.detail}</p><small>{row.status.replaceAll('_', ' ')} · {formatIndiaDateTime(row.at)} (IST)</small></div>
      {row.relatedEvent && <button type="button" className="admin-action" onClick={() => openAction(row.relatedEvent!)}>{ACTION_LABEL[row.relatedEvent] || 'Message settings'}</button>}
    </article>)}
  </section>;
}
