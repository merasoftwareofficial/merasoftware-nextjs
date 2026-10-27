"use client";
import { useCallback, useEffect, useState } from "react";
import { formatIndiaDateTime } from "@/lib/date-time";
import type { WhatsappMessage, WhatsappQueuePage, WhatsappQueueStatus, WhatsappStatus } from "@/lib/whatsapp-types";
import styles from "../email-control/email-control.module.css";
import own from "./whatsapp.module.css";
import { Loader } from "../email-control/loader";
import { WhatsappQueueView } from "./whatsapp-queue";
import { WhatsappSettingsSection } from "./whatsapp-settings";
import { WhatsappText } from "./whatsapp-text";

export async function whatsappApi<T>(path: string, method = "GET", signal?: AbortSignal, body?: unknown): Promise<T> {
  const response = await fetch(`/api/whatsapp/${path}`, {
    method, signal, cache: "no-store",
    ...(body !== undefined ? { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } } : {}),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Could not complete the WhatsApp request.");
  return result.data as T;
}
export const message = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;

const STATUS_LABEL: Record<WhatsappQueueStatus, string> = {
  pending: "Waiting", sending: "Sending now", sent: "Sent", failed: "Not sent", skipped: "Skipped", expired: "Expired", cancelled: "Cancelled",
};
// History holds finished messages only (waiting ones are on the Queue page), in two groups.
// "not-sent" asks the backend for failed, skipped and expired together.
type HistoryGroup = "sent" | "not-sent";
const NOT_SENT_FILTERS = [["not-sent", "All not sent"], ["failed", "Not sent (failed)"], ["skipped", "Skipped"], ["expired", "Expired"]] as const;
type NotSentFilter = (typeof NOT_SENT_FILTERS)[number][0];
const MAYBE_ARRIVED = /may or may not have arrived/i;

export function connectionLabel(status: WhatsappStatus) {
  if (!status.enabled) return "Turned off";
  if (!status.workerRunning) return "Service not running";
  return { connected: "Connected", qr: "Waiting for QR scan", "logged-out": "Unlinked", connecting: "Connecting…", disconnected: "Not connected" }[status.connection];
}
/** 0 → 12 AM, 13 → 1 PM */
export function hourLabel(hour: number) {
  return `${hour % 12 || 12} ${hour < 12 ? "AM" : "PM"}`;
}
/** 919876543210 → +91 98765 43210 */
export function phoneLabel(phone?: string | null) {
  if (!phone) return "—";
  const local = phone.slice(-10);
  return `+${phone.slice(0, -10)} ${local.slice(0, 5)} ${local.slice(5)}`;
}

/** Communication shows each part on its own page: the linked number, the message list, or the sending rules. */
/** "messages" = the History page; "queue" = the waiting messages with their time left. */
export type WhatsappView = "all" | "connection" | "messages" | "queue" | "rules";
const SUMMARY: [string, (status: WhatsappStatus) => string | number][] = [
  ["Connection", connectionLabel], ["Linked number", status => phoneLabel(status.phone)], ["Sent today", status => status.sentToday],
  ["Waiting", status => status.counts.pending], ["Not sent", status => status.counts.failed], ["Skipped", status => status.counts.skipped], ["Expired", status => status.counts.expired],
];
/** `active` = this part is on screen; while hidden it stops refreshing (Communication keeps it ready). */
export function WhatsappPanel({ view = "all", active = true }: { view?: WhatsappView; active?: boolean }) {
  const [status, setStatus] = useState<WhatsappStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [group, setGroup] = useState<HistoryGroup>("sent");
  const [notSent, setNotSent] = useState<NotSentFilter>("not-sent");
  const [page, setPage] = useState(1);
  const [queue, setQueue] = useState<WhatsappQueuePage | null>(null);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadStatus = useCallback((signal?: AbortSignal) => whatsappApi<WhatsappStatus>("status", "GET", signal)
    .then(data => { if (!signal?.aborted) { setStatus(data); setStatusError(null); } })
    .catch(error => { if (!signal?.aborted) setStatusError(message(error, "Could not load WhatsApp status.")); }), []);
  // The QR changes about every 20 seconds, so the status refreshes every 5 while this tab is visible.
  useEffect(() => {
    if (!active || view === "rules" || view === "queue") return; // these pages load on their own
    const controller = new AbortController();
    const refresh = () => { if (document.visibilityState === "visible") void loadStatus(controller.signal); };
    const first = setTimeout(refresh, 0);
    const timer = setInterval(refresh, 5000);
    return () => { controller.abort(); clearTimeout(first); clearInterval(timer); };
  }, [loadStatus, view, active]);

  // The list reloads when the totals change (a message was sent, skipped, …), the filter or page changes, or after an action.
  const countsKey = JSON.stringify(status?.counts ?? null);
  useEffect(() => {
    if (view !== "all" && view !== "messages") return;
    const controller = new AbortController();
    const query = new URLSearchParams({ status: group === "sent" ? "sent" : notSent, page: String(page) });
    whatsappApi<WhatsappQueuePage>(`queue?${query}`, "GET", controller.signal)
      .then(data => { if (!controller.signal.aborted) { setQueue(data); setQueueError(null); } })
      .catch(error => { if (!controller.signal.aborted) setQueueError(message(error, "Could not load messages.")); });
    return () => controller.abort();
  }, [group, notSent, page, countsKey, revision, view]);

  async function act(path: string, done: string) {
    setBusy(true); setNotice(null); setActionError(null);
    try {
      await whatsappApi(path, "POST");
      setNotice(done);
      await loadStatus();
      setRevision(value => value + 1);
    } catch (error) { setActionError(message(error, "That did not work. Please try again.")); }
    finally { setBusy(false); }
  }
  function unlink() {
    if (window.confirm("Unlink this WhatsApp number? Messages stop until a number is linked again by scanning the new QR code.")) {
      void act("unlink", "Unlink requested. A new QR code appears here in a few seconds.");
    }
  }
  function sendAgain(row: WhatsappMessage) {
    if (MAYBE_ARRIVED.test(row.lastError || "") && !window.confirm("This message may already have reached the customer. Sending it again can deliver it twice. Send again?")) return;
    void act(`queue/${row._id}/retry`, `Back in the queue. It goes out in its turn, at least ${status?.minGapSec ?? 30} seconds after the previous message.`);
  }

  if (view === "rules") return <div className={styles.panel}><WhatsappSettingsSection onSaved={() => undefined} /></div>;
  if (view === "queue") return <div className={styles.panel}><WhatsappQueueView active={active} /></div>;
  const notSentCount = status ? status.counts.failed + status.counts.skipped + status.counts.expired + status.counts.cancelled : null;
  const connection = view !== "messages";
  return <div className={styles.panel}>
    {statusError && <p className={styles.error} role="alert">{statusError} <button onClick={() => void loadStatus()}>Retry</button></p>}
    {connection && <>
      {status && !status.enabled && <div className={styles.banner}><strong>WhatsApp sending is turned off on the server.</strong> No WhatsApp messages are made or sent until it is turned on (server setting ENABLE_WHATSAPP).</div>}
      {status?.enabled && !status.workerRunning && <div className={styles.banner}><strong>The WhatsApp service is not running right now.</strong> It restarts on its own within a minute. If this message stays, check the server logs.</div>}
      {status?.paused && <div className={styles.banner}><strong>Sending is paused.</strong> New messages wait in the queue; a message waiting more than {status.maxAgeHours} hours expires and is not sent.</div>}
      {status?.quietNow && <div className={styles.banner}><strong>Quiet hours now.</strong> Messages wait and go out from {hourLabel(status.quietTo)} (IST).</div>}
      <p className={styles.muted}>Every email that is really sent also goes out on WhatsApp with the same text. Every WhatsApp waits in the queue and leaves one at a time{status ? `, at least ${status.minGapSec} seconds after the previous one` : ""}. There is no daily limit.</p>

      {/* The boxes are drawn at once; only their values wait for the first status. */}
      <dl className={styles.summary}>
        {SUMMARY.map(([label, value]) => {
          const shown = status && value(status);
          return <div key={label}><dt>{label}</dt><dd>{!status ? <Loader inline /> : typeof shown === "number" ? shown.toLocaleString("en-IN") : shown}</dd></div>;
        })}
      </dl>
      {status?.nextSendAt && <p className={styles.muted}>Next message can go after {formatIndiaDateTime(status.nextSendAt, { second: "2-digit" })} (IST).</p>}
      {status?.messageCap?.total_quota ? <p className={styles.muted}>WhatsApp&apos;s own limit on new chats this cycle: {status.messageCap.used_quota ?? 0} of {status.messageCap.total_quota} used.</p> : null}
      {status?.lastError && status.connection !== "connected" && <p className={styles.muted}>Last connection message: {status.lastError}</p>}

      {status?.enabled && status.workerRunning && status.connection === "qr" && status.qr && <section className={styles.section} aria-labelledby="link-title">
        <h2 id="link-title">Link your WhatsApp number</h2>
        <ol className={own.steps}>
          <li>On the phone with the business number, open WhatsApp.</li>
          <li>Go to Settings → Linked devices → Link a device.</li>
          <li>Point the phone at this code.</li>
        </ol>
        {/* eslint-disable-next-line @next/next/no-img-element -- a data: URL made by the backend; next/image adds nothing here */}
        <img className={own.qr} src={status.qr} alt="QR code to link the WhatsApp number" width={264} height={264} />
        <p className={styles.muted}>The code changes every few seconds; this page keeps it up to date.</p>
      </section>}

      <div className={styles.actions}>
        {status?.paused
          ? <button className="admin-action" disabled={busy} onClick={() => void act("resume", "Sending resumed.")}>Resume sending</button>
          : <button className="admin-action" disabled={busy || !status} onClick={() => void act("pause", "Sending paused.")}>Pause sending</button>}
        {status?.connection === "connected" && <button className="admin-action" disabled={busy || status.unlinkRequested} onClick={unlink}>{status.unlinkRequested ? "Unlinking…" : "Unlink number"}</button>}
      </div>
      {notice && <p className={styles.notice} role="status">{notice}</p>}
      {actionError && <p className={styles.error} role="alert">{actionError}</p>}

      {view === "all" && <WhatsappSettingsSection onSaved={() => void loadStatus()} />}
    </>}

    {!connection && status?.paused && <div className={styles.banner}><strong>Sending is paused.</strong> Resume it in WhatsApp Connection.</div>}
    {view !== "connection" && <section className={styles.section} aria-labelledby="messages-title">
      <div className={styles.toolbar}>
        <h2 id="messages-title">History</h2>
        <div role="group" aria-label="History group" className={`${styles.actions} ${own.tabs}`}>
          {([["sent", "Sent", status?.counts.sent], ["not-sent", "Not sent", notSentCount]] as const).map(([value, label, count]) =>
            <button key={value} type="button" className="admin-action" aria-pressed={group === value} onClick={() => { setGroup(value); setPage(1); }}>
              {label}{count === null || count === undefined ? "" : ` (${count.toLocaleString("en-IN")})`}
            </button>)}
        </div>
        {group === "not-sent" && <label className={styles.muted}>Show <select value={notSent} onChange={event => { setNotSent(event.target.value as NotSentFilter); setPage(1); }}>
          {NOT_SENT_FILTERS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>}
      </div>
      <p className={styles.muted}>Newest first. All times are IST. Finished messages are kept for 30 days. Messages still waiting are in the Queue tab.</p>
      {!queue && !queueError && <Loader label="Loading messages…" />}
      {queueError && <p className={styles.error} role="alert">{queueError} <button onClick={() => setRevision(value => value + 1)}>Retry</button></p>}
      {queue && (!queue.rows.length ? <p>No messages here yet.</p> : <div className={styles.tableWrap}><table className={styles.table}>
        <thead><tr><th>To</th><th>Message</th><th>Status</th><th>Time (IST)</th><th>Action</th></tr></thead>
        <tbody>{queue.rows.map(row => <tr key={row._id}>
          <td><strong>{phoneLabel(row.to)}</strong><small>{row.email || "—"}</small></td>
          <td><details><summary>{row.text.split("\n")[0].replace(/\*/g, "") || "Message"}</summary><WhatsappText text={row.text} /></details></td>
          <td><strong>{STATUS_LABEL[row.status]}</strong>{row.lastError && <small>{row.lastError}</small>}</td>
          <td>{row.sentAt ? <>Sent {formatIndiaDateTime(row.sentAt)}</> : <>Queued {formatIndiaDateTime(row.createdAt)}</>}</td>
          <td>{row.canRetry ? <button className="admin-action" disabled={busy} onClick={() => sendAgain(row)}>Send again</button> : "—"}</td>
        </tr>)}</tbody>
      </table></div>)}
      {queue && queue.pages > 1 && <div className={styles.toolbar}>
        <button className="admin-action" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
        <span>Page {queue.page} of {queue.pages}</span>
        <button className="admin-action" disabled={page >= queue.pages} onClick={() => setPage(page + 1)}>Next</button>
      </div>}
    </section>}
  </div>;
}
