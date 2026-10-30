"use client";
import { useCallback, useEffect, useState } from "react";
import { formatIndiaDateTime } from "@/lib/date-time";
import type { WhatsappStopped, WhatsappUpcoming, WhatsappUpcomingRow } from "@/lib/whatsapp-types";
import styles from "../email-control/email-control.module.css";
import { Loader } from "../email-control/loader";
import own from "./whatsapp.module.css";
import { message, phoneLabel, whatsappApi } from "./whatsapp-panel";
import { WhatsappText } from "./whatsapp-text";

// The WhatsApp queue: every message still waiting, in the order it will leave, with the time left.
// The times come from the backend (whatsapp/src/schedule.js), worked out from the same sending rules
// the sender uses; this page only counts down. A sent message leaves this list and shows in History.
const STOPPED: Record<WhatsappStopped, string> = {
  off: "WhatsApp sending is turned off on the server, so nothing leaves the queue.",
  "not-running": "The WhatsApp service is not running right now, so nothing leaves the queue. It restarts on its own within a minute.",
  paused: "Sending is paused. Resume it in WhatsApp Connection; until then nothing leaves the queue.",
  offline: "The WhatsApp number is not connected, so nothing leaves the queue. Link it in WhatsApp Connection.",
};

/** 9 h 5 min · 2 min 30 s · 45 s */
export function timeLeft(ms: number) {
  if (ms <= 1000) return "any moment now";
  const total = Math.round(ms / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours) return `${hours} h ${minutes} min`;
  if (minutes) return `${minutes} min ${seconds} s`;
  return `${seconds} s`;
}

/** `active` = the Queue tab is on screen; while hidden it stops refreshing (Communication keeps it ready). */
export function WhatsappQueueView({ active = true }: { active?: boolean }) {
  const [data, setData] = useState<{ reply: WhatsappUpcoming; offset: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(() => Date.now());

  // offset = the backend clock minus this computer's clock, so a wrong local clock never shifts the countdown.
  const load = useCallback((signal?: AbortSignal) => whatsappApi<WhatsappUpcoming>("queue/upcoming", "GET", signal)
    .then(reply => { if (!signal?.aborted) { setData({ reply, offset: new Date(reply.now).getTime() - Date.now() }); setError(null); } })
    .catch(failure => { if (!signal?.aborted) setError(message(failure, "Could not load the WhatsApp queue.")); }), []);
  // The list refreshes every 5 seconds while the tab is visible; the countdown moves every second.
  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    const refresh = () => { if (document.visibilityState === "visible") void load(controller.signal); };
    const first = setTimeout(refresh, 0);
    const timer = setInterval(refresh, 5000);
    const clock = setInterval(() => setTick(Date.now()), 1000);
    return () => { controller.abort(); clearTimeout(first); clearInterval(timer); clearInterval(clock); };
  }, [load, active]);

  // The summary and the section are drawn at once; only their values wait for the first reply.
  const reply = data?.reply;
  const now = tick + (data?.offset ?? 0);
  const next = reply?.rows.find(row => row.eta && row.status === "pending");
  const left = (row: WhatsappUpcomingRow) => {
    if (row.status === "sending") return "Sending now";
    if (row.willExpire) return "Will expire: it would wait too long";
    if (!row.eta) return "Waiting";
    return `~${timeLeft(new Date(row.eta).getTime() - now)}`;
  };
  const summary: [string, string | undefined][] = [["In the queue", reply?.total.toLocaleString("en-IN")], ["Sent today", reply?.sentToday.toLocaleString("en-IN")],
    ["Next message", !reply ? undefined : next?.eta ? `in ~${timeLeft(new Date(next.eta).getTime() - now)}` : reply.rows.some(row => row.status === "sending") ? "Sending now" : "—"]];

  return <>
    {error && <p className={styles.error} role="alert">{error} {!data && <button onClick={() => void load()}>Retry</button>}</p>}
    {reply?.stopped && <div className={styles.banner} role="note"><strong>Queue stopped.</strong> {STOPPED[reply.stopped]}</div>}
    {reply && !reply.stopped && reply.quietUntil && <div className={styles.banner} role="note"><strong>Quiet hours now.</strong> Waiting messages go out from {formatIndiaDateTime(reply.quietUntil)} (IST), one by one.</div>}

    <dl className={styles.summary}>
      {summary.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value ?? <Loader inline />}</dd></div>)}
    </dl>

    <section className={styles.section} aria-labelledby="queue-title">
      <div className={styles.toolbar}><h2 id="queue-title">Waiting messages</h2></div>
      <p className={styles.muted}>In the order they will leave. One message at a time, with the gap and “typing…” between them. Times are estimates (the gap has a random part) and are in IST.</p>
      {!reply ? !error && <Loader label="Loading the queue…" /> : !reply.rows.length ? <p>The queue is empty. A new message leaves within about 10 seconds.</p> : <div className={styles.tableWrap}><table className={styles.table}>
        <thead><tr><th>#</th><th>To</th><th>Message</th><th>Status</th><th>Leaves (IST)</th><th>Time left</th></tr></thead>
        <tbody>{reply.rows.map(row => <tr key={row._id}>
          <td>{row.position}</td>
          <td><strong>{phoneLabel(row.to)}</strong><small>{row.event === "auto-reply" ? "Auto reply" : row.email || "—"}</small></td>
          <td><details><summary>{row.text.split("\n")[0].replace(/\*/g, "") || "Message"}</summary><WhatsappText text={row.text} /></details></td>
          <td><strong>{row.status === "sending" ? "Sending now" : row.attempts ? `Trying again (try ${row.attempts + 1})` : "Waiting"}</strong>{row.lastError && <small>{row.lastError}</small>}</td>
          <td>{row.eta && row.status === "pending" ? formatIndiaDateTime(row.eta, { second: "2-digit" }) : "—"}</td>
          <td className={own.left}>{left(row)}</td>
        </tr>)}</tbody>
      </table></div>}
      {reply && reply.total > reply.rows.length && <p className={styles.muted}>Showing the first {reply.rows.length.toLocaleString("en-IN")} of {reply.total.toLocaleString("en-IN")} waiting messages.</p>}
    </section>
  </>;
}
