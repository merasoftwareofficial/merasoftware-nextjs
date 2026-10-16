"use client";
import { useEffect, useState } from "react";
import { emailControlApi } from "@/lib/email-control-client";
import { formatIndiaDateTime } from "@/lib/date-time";
import type { Application, EmailOutboxData } from "@/lib/email-control-types";
import styles from "./email-control.module.css";

const emptyFilters = { status: "all", q: "", from: "", to: "" };
export function EmailOutbox({ application, revision }: { application: Application; revision: number }) {
  const [filters, setFilters] = useState(emptyFilters);
  const [query, setQuery] = useState({ ...emptyFilters, page: 1 });
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<{ key: string; data: EmailOutboxData } | null>(null);
  const [error, setError] = useState<{ key: string; message: string } | null>(null);
  const params = new URLSearchParams(Object.entries(query).map(([key, value]) => [key, String(value)])).toString();
  const requestKey = `${application}:${params}:${revision}:${retry}`;
  useEffect(() => {
    const controller = new AbortController();
    emailControlApi<EmailOutboxData>(application, `/outbox?${params}`, "GET", undefined, controller.signal)
      .then(data => { if (!controller.signal.aborted) { setResult({ key: requestKey, data }); setError(null); } })
      .catch(err => { if (!controller.signal.aborted) setError({ key: requestKey, message: err instanceof Error ? err.message : "Could not load Outbox." }); });
    return () => controller.abort();
  }, [application, params, requestKey]);
  const data = result?.key === requestKey ? result.data : null;
  const failure = error?.key === requestKey ? error.message : null;
  const loading = !data && !failure;
  return <section className={styles.section} aria-labelledby="outbox-title">
    <div className={styles.toolbar}><h2 id="outbox-title">Outbox</h2><button className="admin-action" disabled={loading} onClick={() => setRetry(value => value + 1)}>Refresh Outbox</button></div>
    <p className={styles.muted}>Sent mail and sending attempts for {application === "website" ? "Website" : "Portal"}. All times are IST. Sent means accepted by the email provider.</p>
    {data && <dl className={styles.summary}>
      {[["Total sent", data.summary.sent], ["Today sent (IST)", data.summary.todaySent], ["Sent recipients", data.summary.sentRecipients], ["Failed", data.summary.failed], ["Sending", data.summary.sending]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{Number(value).toLocaleString("en-IN")}</dd></div>)}
    </dl>}
    <p className={styles.muted}>Totals cover this application&apos;s full recorded history. Filters below apply to the list.</p>
    <form className={styles.filters} onSubmit={event => { event.preventDefault(); setQuery({ ...filters, page: 1 }); }}>
      <label>Search recipient or subject<input type="search" maxLength={200} value={filters.q} onChange={e => setFilters({ ...filters, q: e.target.value })} /></label>
      <label>Outbox status<select value={filters.status} onChange={e => setFilters({ ...filters, status: e.target.value })}>{["all", "sent", "failed", "sending"].map(value => <option key={value}>{value}</option>)}</select></label>
      <label>From date (IST)<input type="date" value={filters.from} onChange={e => setFilters({ ...filters, from: e.target.value })} /></label>
      <label>To date (IST)<input type="date" min={filters.from || undefined} value={filters.to} onChange={e => setFilters({ ...filters, to: e.target.value })} /></label>
      <button className="admin-action" type="submit">Apply filters</button>
      <button className="admin-action" type="button" onClick={() => { setFilters(emptyFilters); setQuery({ ...emptyFilters, page: 1 }); }}>Clear filters</button>
    </form>
    {loading && <p role="status">Loading Outbox…</p>}
    {failure && <p className={styles.error} role="alert">{failure} <button onClick={() => setRetry(value => value + 1)}>Retry Outbox</button></p>}
    {data && <>
      <p>{data.total.toLocaleString("en-IN")} matching {data.total === 1 ? "mail" : "mails"}</p>
      {!data.rows.length ? <p>No matching outgoing mail records.</p> : <div className={styles.tableWrap}><table className={styles.table}>
        <thead><tr><th>Recipient / subject</th><th>Status</th><th>Sent at (IST)</th><th>Details</th></tr></thead>
        <tbody>{data.rows.map(row => <tr key={row._id}>
          <td><strong>{row.subject}</strong><p>{row.to.join(", ")}</p><small>{row.event}</small></td>
          <td>{row.status}{row.failure && <p className={styles.error}>{row.failure}</p>}</td>
          <td>{row.sentAt ? formatIndiaDateTime(row.sentAt) : row.status === "sent" ? "Time unavailable" : "Not sent"}</td>
          <td><details><summary>Mail details</summary>
            <p>From: {row.sender || "Unavailable for this record"}</p>
            <p>Template: {row.templateName || "Unavailable for this record"}</p>
            <p>Provider ID: {row.providerId || "Unavailable"}</p>
            <p>Attempts: {row.attemptCount ?? "Unavailable"}</p>
            {row.lastAttemptAt && <p>Last attempt: {formatIndiaDateTime(row.lastAttemptAt)}</p>}
            {row.attempts?.map((attempt, index) => <p key={index}>{index + 1}. {formatIndiaDateTime(attempt.at)} · {attempt.status}{attempt.failure ? ` · ${attempt.failure}` : ""}</p>)}
          </details></td>
        </tr>)}</tbody>
      </table></div>}
      <div className={styles.toolbar}><button className="admin-action" disabled={query.page <= 1} onClick={() => setQuery({ ...query, page: query.page - 1 })}>Previous</button><span>Page {data.page} of {Math.max(1, data.pages)}</span><button className="admin-action" disabled={query.page >= data.pages} onClick={() => setQuery({ ...query, page: query.page + 1 })}>Next</button></div>
    </>}
  </section>;
}
