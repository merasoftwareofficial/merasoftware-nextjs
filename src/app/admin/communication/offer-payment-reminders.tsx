"use client";

import { Fragment, useCallback, useMemo, useState } from "react";
import { useCommunicationRefresh } from "@/lib/communication-live";
import { formatIndiaDateTime } from "@/lib/date-time";
import { Loader } from "@/app/admin/email-control/loader";
import styles from "../email-control/email-control.module.css";
import c from "./actions-panel.module.css";
import s from "./communication.module.css";
import { LegacyReminderHistory } from "./legacy-reminder-history";
import { InfoTip } from "./reminder-info";
import { ReminderPauseControl } from "./reminder-pause-control";

type Row = {
  id: string;
  userId: string;
  remindersPaused: boolean;
  customer: string;
  invoiceNumber: string;
  dueDate: string;
  outstanding: number;
  status: string;
  offsets: number[];
  reason: string;
  reminderHistory?: { offset: number; status: string; at: string | null; whatsapp: string[] }[];
  nextMilestone: { offset: number; at: string } | null;
};
type Reply = { view?: "active" | "completed"; page: number; pageSize: number; total: number; cronEnabled: boolean; remindersEnabled: boolean; rows: Row[] };
type PauseFilter = "all" | "active" | "paused";

function formatOffset(offset: number) {
  if (offset === 0) return "On due date";
  return offset < 0 ? `${Math.abs(offset)}d before due` : `${offset}d after due`;
}

export function OfferPaymentReminders({ active, openAction, portalUrl = "" }: { compact?: boolean; active: boolean; openAction?: () => void; portalUrl?: string }) {
  const [page, setPage] = useState(1);
  const [view, setView] = useState<"active" | "completed">("active");
  const [pauseFilter, setPauseFilter] = useState<PauseFilter>("all");
  const [query, setQuery] = useState("");
  const [historyFor, setHistoryFor] = useState<string | null>(null);
  const [data, setData] = useState<Reply | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async (signal: AbortSignal) => {
    try {
      const response = await fetch(`/api/auto-reply/payment-reminders?page=${page}&view=${view}`, { signal, cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not load payment reminders.");
      if (!signal.aborted) { setData(result.data); setError(""); }
    } catch (failure) {
      if (!signal.aborted) setError(failure instanceof Error ? failure.message : "Could not load payment reminders.");
    }
  }, [page, view]);

  useCommunicationRefresh(load, active, 5000, `${view}:${page}`);
  const ready = data?.page === page && (data.view || "active") === view;
  const refresh = async () => load(new AbortController().signal);

  const filteredRows = useMemo(() => {
    const rows = data?.rows ?? [];
    const needle = query.trim().toLowerCase();
    return rows.filter(row => {
      if (view === "active") {
        if (pauseFilter === "active" && row.remindersPaused) return false;
        if (pauseFilter === "paused" && !row.remindersPaused) return false;
      }
      if (!needle) return true;
      return row.customer.toLowerCase().includes(needle) || row.invoiceNumber.toLowerCase().includes(needle);
    });
  }, [data, view, pauseFilter, query]);

  return (
    <section className={styles.section} aria-label="Offer payment reminder invoices">
      <div className={s.workToolbar}>
        <h3>Offer payment reminders</h3>
        <InfoTip label="Offer payment reminders">
          <p>Unpaid invoices with saved offer payment terms. Times are future milestones, not a promise of delivery; overdue catch-up, payment and sending settings can change what happens.</p>
        </InfoTip>
        {openAction && (
          <button type="button" className="admin-action" onClick={openAction}>Edit offer reminder rule →</button>
        )}
      </div>

      <div role="tablist" aria-label="Offer invoice view" className={c.segment}>
        <button type="button" role="tab" aria-selected={view === "active"} onClick={() => { setView("active"); setPage(1); setHistoryFor(null); }}>
          Outstanding invoices
        </button>
        <button type="button" role="tab" aria-selected={view === "completed"} onClick={() => { setView("completed"); setPage(1); setPauseFilter("all"); setHistoryFor(null); }}>
          Paid / cancelled invoices
        </button>
      </div>

      {view === "active" && (
        <div role="tablist" aria-label="Filter by reminder status" className={c.segment}>
          <button type="button" role="tab" aria-selected={pauseFilter === "all"} onClick={() => setPauseFilter("all")}>All</button>
          <button type="button" role="tab" aria-selected={pauseFilter === "active"} onClick={() => setPauseFilter("active")}>Active</button>
          <button type="button" role="tab" aria-selected={pauseFilter === "paused"} onClick={() => setPauseFilter("paused")}>Paused</button>
        </div>
      )}

      <div className={c.toolbar}>
        <input
          className={c.search}
          type="search"
          aria-label="Find an invoice"
          placeholder="Find by customer name or invoice number"
          value={query}
          onChange={event => setQuery(event.target.value)}
        />
        {ready && <span className={c.count}>Showing {filteredRows.length} of {data.total} invoices</span>}
      </div>

      {error && <p className={styles.error} role="alert">{error}</p>}
      {!ready ? !error && <Loader label="Loading payment reminders…" /> : (
        <>
          {!data.cronEnabled && <p className={styles.banner}>The payment reminder scheduler is off on this server.</p>}
          {!data.remindersEnabled && <p className={styles.banner}>The offer payment reminder rule is Off.</p>}
          {!filteredRows.length ? (
            <p className={styles.muted}>No invoices match this filter.</p>
          ) : (
            <div className={c.tableWrap}>
              <table className={c.table} aria-label="Offer payment reminders table">
                <thead>
                  <tr>
                    <th scope="col">Customer &amp; Invoice</th>
                    <th scope="col">Amount &amp; Due</th>
                    <th scope="col">Schedule</th>
                    <th scope="col">Status</th>
                    <th scope="col" className={c.right}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map(row => {
                    const isHistoryOpen = historyFor === row.id;
                    const scheduleText = row.offsets.length ? row.offsets.map(formatOffset).join(", ") : "No saved schedule";
                    const nextText = row.reason || (row.nextMilestone ? `Next: ${formatIndiaDateTime(row.nextMilestone.at)}` : "All milestones passed");
                    return (
                      <Fragment key={row.id}>
                        <tr className={c.row}>
                          <td>
                            <div className={c.name}>{row.customer}</div>
                            <div className={c.mono}>{row.invoiceNumber}</div>
                            {portalUrl && row.userId && (
                              <div className={c.when}>
                                <a href={`${portalUrl}/admin-panel/clients/${row.userId}`} target="_blank" rel="noopener noreferrer">Open client ↗</a>
                              </div>
                            )}
                          </td>
                          <td>
                            <div className={c.name}>₹{row.outstanding.toLocaleString("en-IN")}</div>
                            <div className={c.when}>{row.dueDate ? `Due ${formatIndiaDateTime(row.dueDate)}` : "Due date unavailable"}</div>
                          </td>
                          <td className={c.description}>
                            <div>{scheduleText}</div>
                            <div className={c.when}>{nextText}</div>
                          </td>
                          <td>
                            <strong>{view === "completed" ? row.status.replaceAll("_", " ") : row.remindersPaused ? "Paused" : "Active"}</strong>
                          </td>
                          <td className={c.right}>
                            <div style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                              {view === "active" && (
                                <ReminderPauseControl compact source="offer_payment" entityId={row.id} paused={!!row.remindersPaused} label="payment reminders" onChanged={refresh} />
                              )}
                              <button type="button" className={c.manage} onClick={() => setHistoryFor(isHistoryOpen ? null : row.id)}>
                                {isHistoryOpen ? "Hide history" : "History"}
                              </button>
                            </div>
                          </td>
                        </tr>
                        {isHistoryOpen && (
                          <tr className={c.row}>
                            <td colSpan={5}>
                              <LegacyReminderHistory source="offer_payment" entityId={row.id} active={active} defaultOpen compact title={`History for ${row.invoiceNumber}`} openAction={openAction ? () => openAction() : undefined} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div className={styles.actions}>
            <button type="button" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>Previous</button>
            <span>Page {page} · {data.total} invoices</span>
            <button type="button" disabled={page * data.pageSize >= data.total} onClick={() => setPage(value => value + 1)}>Next</button>
          </div>
        </>
      )}
    </section>
  );
}
