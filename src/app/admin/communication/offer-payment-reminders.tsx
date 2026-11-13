"use client";

import { useCallback, useState } from "react";
import { useCommunicationRefresh } from "@/lib/communication-live";
import { formatIndiaDateTime } from "@/lib/date-time";
import { Loader } from "@/app/admin/email-control/loader";
import styles from "../email-control/email-control.module.css";
import { ReminderPauseControl } from "./reminder-pause-control";
import { LegacyReminderHistory } from "./legacy-reminder-history";
import { InfoTip } from "./reminder-info";
import s from "./communication.module.css";

type Row = { id: string; userId: string; remindersPaused: boolean; customer: string; invoiceNumber: string; dueDate: string; outstanding: number; status: string; offsets: number[]; reason: string; reminderHistory?: { offset: number; status: string; at: string | null; whatsapp: string[] }[]; nextMilestone: { offset: number; at: string } | null };
type Reply = { view?: "active" | "completed"; page: number; pageSize: number; total: number; cronEnabled: boolean; remindersEnabled: boolean; rows: Row[] };

export function OfferPaymentReminders({ active, openAction, portalUrl = "", compact = false }: { compact?: boolean; active: boolean; openAction?: () => void; portalUrl?: string }) {
  const [page, setPage] = useState(1);
  const [view, setView] = useState<"active" | "completed">("active");
  const [data, setData] = useState<Reply | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async (signal: AbortSignal) => {
    try {
      const response = await fetch(`/api/auto-reply/payment-reminders?page=${page}&view=${view}`, { signal, cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not load payment reminders.");
      if (!signal.aborted) { setData(result.data); setError(""); }
    } catch (failure) { if (!signal.aborted) setError(failure instanceof Error ? failure.message : "Could not load payment reminders."); }
  }, [page, view]);
  useCommunicationRefresh(load, active, 5000, `${view}:${page}`);
  const ready = data?.page === page && (data.view || "active") === view;
  const refresh = async () => load(new AbortController().signal);
  const Row = compact ? "div" : "article";
  return <section className={styles.section} aria-label="Offer payment reminder invoices">
    <h3>Offer payment reminders</h3>
    <div className={styles.chips} role="group" aria-label="Offer invoice view"><button type="button" aria-pressed={view === "active"} onClick={() => { setView("active"); setPage(1); }}>Outstanding invoices</button><button type="button" aria-pressed={view === "completed"} onClick={() => { setView("completed"); setPage(1); }}>Paid / cancelled invoices</button></div>
    {compact ? <InfoTip label="Offer payment reminders"><p>Unpaid invoices with saved offer payment terms. Times are future milestones, not a promise of delivery. Overdue catch-up, payment and sending settings can change what happens.</p></InfoTip> : <p className={styles.muted}>Unpaid invoices with saved offer payment terms. Times are future milestones, not a promise of delivery; overdue catch-up, payment and sending settings can change what happens.</p>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    {!ready ? !error && <Loader label="Loading payment reminders…" /> : <>
      {!data.cronEnabled && <p className={styles.banner}>The payment reminder scheduler is off on this server.</p>}
      {!data.remindersEnabled && <p className={styles.banner}>The offer payment reminder action is Off.</p>}
      {!data.rows.length ? <p className={styles.muted}>No invoices with saved offer terms in this view.</p> : data.rows.map(row => <Row className={compact ? s.plainRow : styles.card} key={row.id}>
        <div><strong>{row.customer} · {row.invoiceNumber}</strong><p>Outstanding ₹{row.outstanding.toLocaleString("en-IN")} · Due {row.dueDate ? formatIndiaDateTime(row.dueDate) : "unavailable"}</p>
          <small>{row.reason || (row.nextMilestone ? `Next future milestone: ${formatIndiaDateTime(row.nextMilestone.at)}` : "No later milestone in the saved agreement.")}</small>
          <p className={styles.muted}>Saved reminder days: {row.offsets.length ? row.offsets.join(", ") : "none"} · {row.status.replaceAll("_", " ")}</p>
          {view === "active" && <ReminderPauseControl source="offer_payment" entityId={row.id} paused={!!row.remindersPaused} label="payment reminders" onChanged={refresh} />}
          <LegacyReminderHistory source="offer_payment" entityId={row.id} active={active} compact={compact} title="Recorded payment reminder history" openAction={openAction ? () => openAction() : undefined} />
          {portalUrl && row.userId && <a href={`${portalUrl}/admin-panel/clients/${row.userId}`} target="_blank" rel="noopener noreferrer">Open client ↗</a>}
          {openAction && !compact && <button type="button" onClick={openAction}>Payment reminder message settings (all customers)</button>}
        </div>
      </Row>)}
      <div className={styles.actions}><button type="button" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>Previous</button><span>Page {page} · {data.total} invoices</span><button type="button" disabled={page * data.pageSize >= data.total} onClick={() => setPage(value => value + 1)}>Next</button></div>
    </>}
  </section>;
}
