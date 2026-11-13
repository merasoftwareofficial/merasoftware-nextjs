"use client";

import { useCallback, useState } from "react";
import { useCommunicationRefresh } from "@/lib/communication-live";
import { formatIndiaDateTime } from "@/lib/date-time";
import { Loader } from "@/app/admin/email-control/loader";
import styles from "../email-control/email-control.module.css";

type Source = "all" | "reservation" | "package_request" | "offer_payment";
type Row = { id: string; source: Source; entityId: string; event: string; actionLabel: string; subject: string; customer: string; context: string; milestone: string; status: string; at: string; emailStatus: string; whatsapp: { status: string; sentAt: string | null }[]; whatsappLastKnown: string | null };
type Page = { page: number; pages: number; pageSize: number; total: number; rows: Row[] };
const names: Record<string, string> = { sent: "Sent", queued: "Queued", pending: "Waiting", staged: "Prepared", sending: "Sending", failed: "Failed", skipped: "Not sent", expired: "Expired", cancelled: "Cancelled", "not-selected": "Not selected", "not-recorded": "Not recorded", unknown: "Unknown" };
const stateName = (value: string) => names[value] || value.replaceAll("_", " ");
export function LegacyReminderHistory({ source = "all", entityId, active, title = "Recorded message history", openAction, defaultOpen = false }: { source?: Source; entityId?: string; active: boolean; title?: string; openAction?: (event: string) => void; defaultOpen?: boolean }) {
  const [opened, setOpened] = useState(defaultOpen);
  const [filter, setFilter] = useState<Source>(source);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ key: string; value: Page } | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const selected = source === "all" ? filter : source;
  const key = `${selected}:${entityId || ""}:${page}`;
  const load = useCallback(async (signal: AbortSignal) => {
    try {
      const query = new URLSearchParams({ source: selected, page: String(page), ...(entityId ? { entityId } : {}) });
      const response = await fetch(`/api/auto-reply/legacy-reminder-history?${query}`, { cache: "no-store", signal });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not load message history.");
      if (!signal.aborted) { setData({ key, value: result.data }); setError(""); }
    } catch (failure) { if (!signal.aborted) setError(failure instanceof Error ? failure.message : "Could not load message history."); }
  }, [selected, page, entityId, key]);
  useCommunicationRefresh(load, active && opened, 5000, `${key}:${retry}`);
  const current = data?.key === key ? data.value : null;
  return <details open={defaultOpen} onToggle={event => { if (event.target === event.currentTarget) setOpened(event.currentTarget.open); }}>
    <summary>{title}</summary>
    {opened && <section className={styles.section} aria-label={title}>
      <p className={styles.muted}>Saved message records, including completed records. Missing old records are not recreated. WhatsApp results are shown while queue records remain available.</p>
      {source === "all" && <label className={styles.filters}>History source<select value={filter} onChange={event => { setFilter(event.target.value as Source); setPage(1); }}><option value="all">All existing workflows</option><option value="reservation">Reservations</option><option value="package_request">Package requests</option><option value="offer_payment">Offer payments</option></select></label>}
      {error && <p className={styles.error} role="alert">{error} <button type="button" onClick={() => setRetry(value => value + 1)}>Retry history</button></p>}
      {!current ? !error && <Loader label="Loading message history…" /> : <>
        {!current.rows.length ? <p>No saved message records.</p> : current.rows.map(row => <article className={styles.card} key={row.id}>
          <div><strong>{row.customer}{row.context ? ` · ${row.context}` : ""}</strong><p>{row.actionLabel}</p>{row.milestone && <p>{row.milestone}</p>}{row.subject && <p>{row.subject}</p>}
            <p>Message record: {stateName(row.status)} · {formatIndiaDateTime(row.at)}</p><p>Email: {stateName(row.emailStatus)}</p>
            <p>WhatsApp: {row.whatsapp.length ? row.whatsapp.map(copy => `${stateName(copy.status)}${copy.sentAt ? ` (${formatIndiaDateTime(copy.sentAt)})` : ""}`).join(" · ") : row.whatsappLastKnown === "queued" ? "Previously queued; current delivery record unavailable" : row.whatsappLastKnown === "not-selected" ? "Not selected" : "No current queue record"}</p>
          </div>
          {openAction && <button type="button" onClick={() => openAction(row.event)}>Open action settings</button>}
        </article>)}
        <div className={styles.actions}><button type="button" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>Previous history page</button><span>Page {current.page} of {current.pages} · {current.total} records</span><button type="button" disabled={page >= current.pages} onClick={() => setPage(value => value + 1)}>Next history page</button></div>
      </>}
    </section>}
  </details>;
}
