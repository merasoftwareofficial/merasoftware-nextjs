"use client";
import { useCommunicationRefresh } from "@/lib/communication-live";

import { useCallback, useState } from "react";
import { Loader } from "@/app/admin/email-control/loader";
import { phoneLabel } from "@/app/admin/whatsapp/whatsapp-panel";
import { useServerTime } from "@/components/use-server-time";
import { formatIndiaDate } from "@/lib/date-time";
import s from "./broadcast.module.css";
import a from "./auto-reply.module.css";

// startRequestedAt: the customer pressed Start my project; the clock is paused until the team acts.
type Running = { id: string; customer: string; phone: string; offer: string; reservedAt: string; deadline: string; extended: boolean; hours: number; startRequestedAt: string | null };
// A Start my project request on a package without an offer (backend helpers/packageStart.js).
type PackageStart = { id: string; customer: string; phone: string; package: string; price: number | null; requestedAt: string };
type Overview = { serverNow: string; counts: { running: number; used: number; expired: number; closures: Record<string, number> }; running: Running[]; packageStarts?: PackageStart[] };
async function load(signal?: AbortSignal): Promise<Overview> {
  const response = await fetch("/api/auto-reply/reservations", { signal, cache: "no-store" });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Reservation request failed.");
  return result.data;
}
const CLOSURES: [string, string][] = [["sent", "expiry messages sent"], ["not-sent", "not sent"], ["late", "too late to send"], ["failed", "will retry"]];
function timeLeft(until: number, now: number) {
  const minutes = Math.max(0, Math.floor((until - now) / 60000));
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m left` : `${minutes}m left`;
}
function waiting(since: number, now: number) {
  const hours = Math.max(0, Math.floor((now - since) / 3600000));
  return hours >= 24 ? `${Math.floor(hours / 24)}d ${hours % 24}h` : `${hours}h`;
}
const when = (value: string) => formatIndiaDate(value, { year: undefined, hour: "numeric", minute: "2-digit", hour12: true });

// How offer reservations stand (merasoftware/src/docs/reservation-countdown.md). The hours are set on each offer
// (Admin → Offers); the three messages are Email Templates actions, sent by their Send via.
export function ReservationPanel({ active = true }: { active?: boolean }) {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState("");
  const serverNow = useServerTime();
  const refresh = useCallback(async (signal?: AbortSignal) => {
    const next = await load(signal);
    if (!signal?.aborted) { setData(next); setError(""); }
  }, []);
  useCommunicationRefresh(signal => refresh(signal).catch(failure => { if (!signal.aborted) setError(failure instanceof Error ? failure.message : "Request failed."); }), active);
  const now = serverNow ?? (data ? Date.parse(data.serverNow) : 0);
  const closures = data ? CLOSURES.filter(([key]) => data.counts.closures[key]).map(([key, label]) => `${data.counts.closures[key].toLocaleString("en-IN")} ${label}`) : [];
  return <section className={s.panel} aria-label="Reservation">
    {error && <p role="alert" className={s.error}>{error}</p>}
    <div className={a.detected}>
      <h3>Running{data ? ` (${data.counts.running.toLocaleString("en-IN")})` : ""}</h3>
      {data && <p className={s.note}>{data.counts.used.toLocaleString("en-IN")} used for a project · {data.counts.expired.toLocaleString("en-IN")} expired{closures.length ? ` · ${closures.join(" · ")}` : ""}</p>}
      {!data ? <Loader label="Loading…" /> : !data.running.length ? <p className={s.note}>No reservation is running.</p>
        : <ul>{data.running.map(row => <li key={row.id}>
            <div className={a.who}>
              <strong>{row.customer || "Customer"}</strong>
              {row.phone && <span>{phoneLabel(row.phone)}</span>}
              <span>{row.startRequestedAt ? `Start requested · waiting ${waiting(Date.parse(row.startRequestedAt), now)}` : timeLeft(Date.parse(row.deadline), now)}</span>
            </div>
            <p>{row.offer} · {row.hours} hours · {row.startRequestedAt ? `paused since ${when(row.startRequestedAt)}` : `ends ${when(row.deadline)}${row.extended ? " (extended)" : ""}`}</p>
          </li>)}</ul>}
    </div>
    <div className={a.detected}>
      <h3>Package start requests{data?.packageStarts ? ` (${data.packageStarts.length.toLocaleString("en-IN")})` : ""}</h3>
      {!data ? <Loader label="Loading…" /> : !data.packageStarts?.length ? <p className={s.note}>No open request.</p>
        : <ul>{data.packageStarts.map(row => <li key={row.id}>
            <div className={a.who}>
              <strong>{row.customer || "Customer"}</strong>
              {row.phone && <span>{phoneLabel(row.phone)}</span>}
              <span>waiting {waiting(Date.parse(row.requestedAt), now)}</span>
            </div>
            <p>{row.package}{row.price !== null ? ` · ₹${row.price.toLocaleString("en-IN")}` : ""} · asked {when(row.requestedAt)}</p>
          </li>)}</ul>}
      <p className={s.note}>Start my project on a package page without an offer. No price is held. Creating the project on that package closes the request; the team can also close it on the client&apos;s Reserved offers in the portal.</p>
    </div>
    <p className={s.note}>Each offer sets how long its reservation lasts (Admin → Offers → Reservation lasts). The countdown starts when the customer reserves. When a project is created on the reservation, the normal project message goes and nothing else. When the time ends with no project, the customer gets the offer-expired message once, with the offers page link. To give one customer more time, use Extend deadline on the client&apos;s page in the portal.</p>
    <p className={s.note}>The customer is reminded when 24 hours and when 1 hour are left. Start my project on the offer page pauses the countdown and tells the team; it stays paused until a project is created on it, or Extend deadline resumes it. The team is reminded once a day, up to 3 times.</p>
    <p className={s.note}>Edit the words and choose Send via in Email Templates → Portal → Offers: Offer reservation confirmation, extended, expired, the two reminders, the two Start project request messages and the two Package start request messages.</p>
  </section>;
}
