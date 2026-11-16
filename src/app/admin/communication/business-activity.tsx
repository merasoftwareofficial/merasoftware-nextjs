"use client";

import { useCallback, useMemo, useState } from "react";
import { useCommunicationRefresh } from "@/lib/communication-live";
import { formatIndiaDateTime } from "@/lib/date-time";
import { Loader } from "@/app/admin/email-control/loader";
import styles from "../email-control/email-control.module.css";
import c from "./actions-panel.module.css";

const ACTION_LABEL: Record<string, string> = { "plan.started": "Plan-start settings", "offer.reserved": "Reservation settings" };
type Row = { id: string; kind: string; title: string; person: string; at: string; detail: string; status: string; relatedEvent?: string };

export function BusinessActivity({ active, openAction }: { active: boolean; openAction: (event: string) => void }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async (signal: AbortSignal) => {
    try {
      const response = await fetch("/api/auto-reply/business-activity", { signal, cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not load activity.");
      if (!signal.aborted) { setRows(result.data); setError(""); }
    } catch (failure) { if (!signal.aborted) setError(failure instanceof Error ? failure.message : "Could not load activity."); }
  }, []);
  useCommunicationRefresh(load, active);

  const visible = useMemo(() => {
    const list = rows || [];
    const needle = query.trim().toLowerCase();
    return needle ? list.filter(row => `${row.title} ${row.person} ${row.detail} ${row.status}`.toLowerCase().includes(needle)) : list;
  }, [rows, query]);

  return <section className={styles.section} aria-label="Recent business activity">
    <h2>Recent business activity</h2>
    <p className={styles.muted}>Recent monthly package orders, plan starts, offer reservations and accepted broadcasts, read from existing records. This is not a complete log of every action. An order can be created before its plan starts.</p>
    <div className={c.toolbar}>
      <input className={c.search} type="search" aria-label="Search business activity" placeholder="Search customer, order, or activity…" value={query} onChange={event => setQuery(event.target.value)} />
    </div>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {!rows ? !error && <Loader label="Loading activity…" /> : !visible.length ? <p>No matching activity.</p> : (
      <div className={c.tableWrap}>
        <table className={c.table}>
          <thead><tr><th>Activity</th><th>Customer &amp; details</th><th>Status &amp; time (IST)</th><th>Action</th></tr></thead>
          <tbody>
            {visible.map(row => (
              <tr key={`${row.kind}-${row.id}`}>
                <td><strong>{row.title}</strong></td>
                <td>
                  <div>{row.person}</div>
                  {row.detail && <div className={styles.muted}>{row.detail}</div>}
                </td>
                <td>
                  <div>{row.status.replaceAll("_", " ")}</div>
                  <div className={styles.muted}>{formatIndiaDateTime(row.at)}</div>
                </td>
                <td>
                  {row.relatedEvent
                    ? <button type="button" className={c.smallBtn} onClick={() => openAction(row.relatedEvent!)}>{ACTION_LABEL[row.relatedEvent] || "Actions →"}</button>
                    : <span className={styles.muted}>—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </section>;
}
