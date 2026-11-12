"use client";

import { useCallback, useState } from "react";
import { useCommunicationRefresh } from "@/lib/communication-live";
import { formatIndiaDateTime } from "@/lib/date-time";
import { Loader } from "@/app/admin/email-control/loader";
import styles from "../email-control/email-control.module.css";

type Row = { id: string; customer: string; invoiceNumber: string; dueDate: string; outstanding: number; status: string; offsets: number[]; reason: string; nextMilestone: { offset: number; at: string } | null };
type Reply = { page: number; pageSize: number; total: number; cronEnabled: boolean; remindersEnabled: boolean; rows: Row[] };

export function OfferPaymentReminders({ active }: { active: boolean }) {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Reply | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async (signal: AbortSignal) => {
    try {
      const response = await fetch(`/api/auto-reply/payment-reminders?page=${page}`, { signal, cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not load payment reminders.");
      if (!signal.aborted) { setData(result.data); setError(""); }
    } catch (failure) { if (!signal.aborted) setError(failure instanceof Error ? failure.message : "Could not load payment reminders."); }
  }, [page]);
  useCommunicationRefresh(load, active, 5000, String(page));
  const ready = data?.page === page;
  return <section className={styles.section} aria-label="Offer payment reminder invoices">
    <h3>Offer payment reminders</h3>
    <p className={styles.muted}>Unpaid invoices with saved offer payment terms. Times are future milestones, not a promise of delivery; overdue catch-up, payment and sending settings can change what happens.</p>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {!ready ? !error && <Loader label="Loading payment reminders…" /> : <>
      {!data.cronEnabled && <p className={styles.banner}>The payment reminder scheduler is off on this server.</p>}
      {!data.remindersEnabled && <p className={styles.banner}>The offer payment reminder action is Off.</p>}
      {!data.rows.length ? <p className={styles.muted}>No unpaid invoices with saved offer terms on this page.</p> : data.rows.map(row => <article className={styles.card} key={row.id}>
        <div><strong>{row.customer} · {row.invoiceNumber}</strong><p>Outstanding ₹{row.outstanding.toLocaleString("en-IN")} · Due {row.dueDate ? formatIndiaDateTime(row.dueDate) : "unavailable"} (IST)</p>
          <small>{row.reason || (row.nextMilestone ? `Next future milestone: ${formatIndiaDateTime(row.nextMilestone.at)} (IST)` : "No later milestone in the saved agreement.")}</small>
          <p className={styles.muted}>Saved reminder days: {row.offsets.length ? row.offsets.join(", ") : "none"} · {row.status.replaceAll("_", " ")}</p></div>
      </article>)}
      <div className={styles.actions}><button type="button" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>Previous</button><span>Page {page} · {data.total} invoices</span><button type="button" disabled={page * data.pageSize >= data.total} onClick={() => setPage(value => value + 1)}>Next</button></div>
    </>}
  </section>;
}
