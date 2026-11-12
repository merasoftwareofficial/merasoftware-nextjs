"use client";
import { useCommunicationRefresh } from "@/lib/communication-live";

import { useCallback, useState } from "react";
import { Loader } from "@/app/admin/email-control/loader";
import { phoneLabel } from "@/app/admin/whatsapp/whatsapp-panel";
import { useServerTime } from "@/components/use-server-time";
import { formatIndiaDate } from "@/lib/date-time";
import { PAYMENT_OPTION_WORDS } from "@/lib/package-choice";
import { PURCHASE_LABELS, tenureLabel } from "@/lib/public-plans";
import type { PackageChoice } from "@/lib/sales-packages";
import s from "./broadcast.module.css";
import a from "./auto-reply.module.css";
import { ReminderPauseControl } from "./reminder-pause-control";
import { LegacyReminderHistory } from "./legacy-reminder-history";

// startRequestedAt: the customer pressed Start my project; the clock is paused until the team acts.
type TeamReminder = { at: string; number: number } | null;
type ReminderRecord = { key: string; event: string | null; status: string; at: string | null; whatsapp: string[] };
type Running = { id: string; userId: string; remindersEnabled: boolean; remindersPaused: boolean; teamRemindersPaused: boolean; teamControlAvailable?: boolean; teamReminderAttempts?: number; teamActionEnabled?: boolean; reminderHistory?: ReminderRecord[]; customer: string; phone: string; offer: string; reservedAt: string; deadline: string; extended: boolean; hours: number; startRequestedAt: string | null; upcomingReminder?: { event: string; at: string; actionEnabled?: boolean } | null; teamReminder?: TeamReminder };
// An open request on a package (backend helpers/packageStart.js): the customer started buying it (buy) or asked for a callback.
// choice: what the customer picked on the package's customize page (src/docs/package.md §3), when it has one.
type PackageStart = { id: string; customer: string; phone: string; package: string; price: number | null; requestedAt: string;
  userId?: string; remindersPaused?: boolean; teamReminderAttempts?: number; teamActionEnabled?: boolean; choice?: PackageChoice | null; kind?: "buy" | "callback"; teamReminder?: TeamReminder; messageHistory?: ReminderRecord[] };
type PaidCandidate = { id: string; createdAt: string; totalAmount: number; paidAt: string; category: string; offerCategories: string[]; categoryMismatch: boolean; offerRecorded: boolean; itemNames: string[] };
type PaidPreview = { reservationId: string; offerSlug: string; offerTitle: string; reservedPrice: number; candidates: PaidCandidate[]; limited: boolean };
type Overview = { serverNow: string; reservationScheduler?: { jobsEnabled: boolean; confirmationsEnabled: boolean }; packageRequestScheduler?: { jobsEnabled: boolean; requestsEnabled: boolean }; counts: { running: number; used: number; expired: number; closures: Record<string, number> }; running: Running[]; recentClosed?: { id: string; userId: string; customer: string; offer: string; status: "project_linked" | "expired"; closureStatus: string | null; reminderHistory: ReminderRecord[] }[]; packageStarts?: PackageStart[] };
async function load(signal?: AbortSignal): Promise<Overview> {
  const response = await fetch("/api/auto-reply/reservations", { signal, cache: "no-store" });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Reservation request failed.");
  return result.data;
}
const CLOSURES: [string, string][] = [["sent", "sent or queued"], ["not-sent", "not sent"], ["late", "too late to send"], ["failed", "will retry"]];
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
// (Admin → Offers); the three messages are Message Templates actions, sent by their Send via.
// "2 installments", or "Quarterly · 1 year".
function choiceText(choice: PackageChoice) {
  if (choice.paymentOption) return PAYMENT_OPTION_WORDS[choice.paymentOption].title;
  return [choice.billingCycle ? PURCHASE_LABELS[choice.billingCycle] : "", choice.tenureMonths ? tenureLabel(choice.tenureMonths) : ""].filter(Boolean).join(" · ");
}
export function ReservationPanel({ active = true, portalUrl = "", openAction }: { active?: boolean; portalUrl?: string; openAction?: (event: string) => void }) {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [paidPreview, setPaidPreview] = useState<PaidPreview | null>(null);
  const [paidOrder, setPaidOrder] = useState("");
  const [paidReason, setPaidReason] = useState("");
  const [paidSlug, setPaidSlug] = useState("");
  const [ackMismatch, setAckMismatch] = useState(false);
  const serverNow = useServerTime();
  const refresh = useCallback(async (signal?: AbortSignal) => {
    const next = await load(signal);
    if (!signal?.aborted) { setData(next); setError(""); }
  }, []);
  useCommunicationRefresh(signal => refresh(signal).catch(failure => { if (!signal.aborted) setError(failure instanceof Error ? failure.message : "Request failed."); }), active);
  async function openPaidProjects(row: Running) {
    setBusyId(row.id); setError(""); setPaidPreview(null); setPaidOrder(""); setPaidReason(""); setPaidSlug(""); setAckMismatch(false);
    try {
      const response = await fetch(`/api/auto-reply/reservations/${row.id}/paid-projects`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not load paid projects.");
      setPaidPreview({ ...result.data, reservationId: row.id });
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Could not load paid projects."); }
    finally { setBusyId(null); }
  }
  async function reconcilePaidProject(row: Running) {
    if (!paidPreview || !paidOrder || !paidReason.trim() || paidSlug !== paidPreview.offerSlug) return;
    if (!window.confirm("Link this paid project to this reservation? This records an administrative reconciliation. The project's price, invoice and payment will not be changed.")) return;
    setBusyId(row.id); setError("");
    try {
      const response = await fetch(`/api/auto-reply/reservations/${row.id}/reconcile-paid-project`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId: paidOrder, reason: paidReason, confirmSlug: paidSlug, acknowledgeMismatch: ackMismatch }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not link the project.");
      setPaidPreview(null); await refresh();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Could not link the project."); }
    finally { setBusyId(null); }
  }
  async function closePackageRequest(row: PackageStart) {
    if (!window.confirm("Close this package request? Future team reminders for this request will stop. This does not cancel a project or payment.")) return;
    setBusyId(row.id); setError("");
    try {
      const response = await fetch(`/api/auto-reply/package-starts/${row.id}/close`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not close the request.");
      await refresh();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Could not close the request."); }
    finally { setBusyId(null); }
  }
  const now = serverNow ?? (data ? Date.parse(data.serverNow) : 0);
  const closures = data ? CLOSURES.filter(([key]) => data.counts.closures[key]).map(([key, label]) => `${data.counts.closures[key].toLocaleString("en-IN")} ${label}`) : [];
  return <section className={s.panel} aria-label="Reservation">
    {error && <p role="alert" className={s.error}>{error}</p>}
    {data?.reservationScheduler && (!data.reservationScheduler.jobsEnabled || !data.reservationScheduler.confirmationsEnabled) && <p className={s.note}>Reservation reminder jobs are off on this server. Milestones below show timing only and will not send while the jobs are off.</p>}
    <div className={a.detected}>
      <h3>Running{data ? ` (${data.counts.running.toLocaleString("en-IN")})` : ""}</h3>
      {data && <><p className={s.note}>{data.counts.used.toLocaleString("en-IN")} {data.counts.used === 1 ? "reservation" : "reservations"} linked to a project · {data.counts.expired.toLocaleString("en-IN")} expired {data.counts.expired === 1 ? "reservation" : "reservations"}</p>
        {closures.length > 0 && <p className={s.note}>Expiry message records: {closures.join(" · ")}. A queued WhatsApp message may still be waiting.</p>}</>}
      {!data ? <Loader label="Loading…" /> : !data.running.length ? <p className={s.note}>No reservation is running.</p>
        : <ul>{data.running.map(row => <li key={row.id}>
            <div className={a.who}>
              <strong>{row.customer || "Customer"}</strong>
              {row.phone && <span>{phoneLabel(row.phone)}</span>}
              <span>{row.startRequestedAt ? `Start requested · waiting ${waiting(Date.parse(row.startRequestedAt), now)}` : timeLeft(Date.parse(row.deadline), now)}</span>
            </div>
            <p>{row.offer} · {row.hours} hours · {row.startRequestedAt ? `paused since ${when(row.startRequestedAt)}` : `ends ${when(row.deadline)}${row.extended ? " (extended)" : ""}`}</p>
            {row.upcomingReminder && <p>Upcoming reminder milestone: {when(row.upcomingReminder.at)} (IST). {row.upcomingReminder.actionEnabled === false ? "This reminder action is Off; it will not send while Off." : "Subject to current eligibility and sending settings."}</p>}
            <div className={s.actions}>
              <button type="button" disabled={!!busyId} onClick={() => void openPaidProjects(row)}>Review matching paid projects</button>
              {openAction && <button type="button" onClick={() => openAction(row.startRequestedAt ? "offer.start.request.admin" : row.upcomingReminder?.event || "offer.reservation.reminder")}>Message and channel settings (all customers)</button>}
              {portalUrl && row.userId && <a href={`${portalUrl}/admin-panel/clients/${row.userId}`} target="_blank" rel="noopener noreferrer">Open client ↗</a>}
            </div>
            {row.startRequestedAt && <p>Customer countdown reminders are held while this start request is open. Team reminders are managed separately.</p>}
            {row.remindersEnabled && <ReminderPauseControl source="reservation" entityId={row.id} paused={!!row.remindersPaused} label="customer reminders" onChanged={refresh} />}
            {row.teamControlAvailable && <ReminderPauseControl source="reservation_team" entityId={row.id} paused={!!row.teamRemindersPaused} label="reservation team reminders" onChanged={refresh} />}
            {paidPreview?.reservationId === row.id && <section className={s.preview} aria-label="Review paid project link">
              <h4>Review paid project for {paidPreview.offerTitle}</h4>
              <p>Only this customer&apos;s unlinked, fully paid projects with the same price and in-window payment are shown. This does not prove the offer was selected at purchase.</p>
              {paidPreview.limited && <p>Only the latest 100 projects were checked.</p>}
              {!paidPreview.candidates.length ? <p>No eligible paid project found. Open the client for a full review.</p> : <>
                <label className={s.field}>Paid project<select value={paidOrder} onChange={event => { setPaidOrder(event.target.value); setAckMismatch(false); }}><option value="">Choose a project</option>{paidPreview.candidates.map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.itemNames.join(", ") || candidate.id} · ₹{candidate.totalAmount.toLocaleString("en-IN")} · {when(candidate.createdAt)}</option>)}</select></label>
                {paidPreview.candidates.filter(candidate => candidate.id === paidOrder).map(candidate => <div key={candidate.id}>
                  <p>Project ID: {candidate.id} · Paid {when(candidate.paidAt)} (IST) · Amount ₹{candidate.totalAmount.toLocaleString("en-IN")}.</p>
                  <p>Project category: {candidate.category || "not recorded"} · Offer categories: {candidate.offerCategories.join(", ") || "not recorded"}.</p>
                  {!candidate.offerRecorded && <p>No offer agreement was recorded on this project. Verify this is the intended reservation before linking.</p>}
                  {candidate.categoryMismatch && <label><input type="checkbox" checked={ackMismatch} onChange={event => setAckMismatch(event.target.checked)} /> I reviewed the category mismatch and confirm this is the intended project.</label>}
                </div>)}
                <label className={s.field}>Reason for linking<input value={paidReason} maxLength={300} onChange={event => setPaidReason(event.target.value)} /></label>
                <label className={s.field}>Type offer code {paidPreview.offerSlug} to confirm<input value={paidSlug} onChange={event => setPaidSlug(event.target.value)} /></label>
                <div className={s.actions}><button type="button" onClick={() => setPaidPreview(null)}>Cancel review</button><button type="button" disabled={!!busyId || !paidOrder || !paidReason.trim() || paidSlug !== paidPreview.offerSlug || (!!paidPreview.candidates.find(candidate => candidate.id === paidOrder)?.categoryMismatch && !ackMismatch)} onClick={() => void reconcilePaidProject(row)}>Link paid project</button></div>
              </>}
            </section>}
            <LegacyReminderHistory source="reservation" entityId={row.id} active={active} title="Reservation message history" openAction={openAction} />
            {row.teamReminder && <p>Team reminder {row.teamReminder.number}/3 eligible from {when(row.teamReminder.at)} (IST). {row.teamActionEnabled === false ? "The team reminder action is Off." : "Subject to sending settings."}</p>}
            {row.startRequestedAt && <p className={s.note}>{row.teamReminderAttempts || 0}/3 daily team milestones processed. Check message history for actual delivery.{(row.teamReminderAttempts || 0) >= 3 ? " No more daily team reminders are planned." : ""}</p>}
          </li>)}</ul>}
    </div>
    <div className={a.detected}>
      <details><summary>Recently completed or expired reservations ({data?.recentClosed?.length || 0})</summary>
        <p className={s.note}>Showing up to the 50 most recently updated completed or expired reservations. WhatsApp queue records may expire; missing history is not recreated.</p>
        {!data ? <Loader label="Loading…" /> : !data.recentClosed?.length ? <p>No completed or expired reservations found.</p> : <ul>{data.recentClosed.map(row => <li key={row.id}>
          <div className={a.who}><strong>{row.customer || "Customer"}</strong><span>{row.status === "project_linked" ? "Project linked" : "Expired"}</span></div>
          <p>{row.offer}{row.closureStatus && row.status === "expired" ? ` · Expiry message record: ${row.closureStatus}` : ""}</p>
          <LegacyReminderHistory source="reservation" entityId={row.id} active={active} title="Reservation message history" openAction={openAction} />
          {portalUrl && row.userId && <a href={`${portalUrl}/admin-panel/clients/${row.userId}`} target="_blank" rel="noopener noreferrer">Open client ↗</a>}
        </li>)}</ul>}
      </details>
    </div>
    <div className={a.detected}>
      <h3>Package start requests{data?.packageStarts ? ` (${data.packageStarts.length.toLocaleString("en-IN")})` : ""}</h3>
      {data?.packageRequestScheduler && (!data.packageRequestScheduler.jobsEnabled || !data.packageRequestScheduler.requestsEnabled) && <p className={s.note}>Package request reminder jobs are off on this server. Listed milestones show timing only.</p>}
      {!data ? <Loader label="Loading…" /> : !data.packageStarts?.length ? <p className={s.note}>No open request.</p>
        : <ul>{data.packageStarts.map(row => <li key={row.id}>
            <div className={a.who}>
              <strong>{row.customer || "Customer"}</strong>
              {row.phone && <span>{phoneLabel(row.phone)}</span>}
              <span>{row.kind === "buy" ? "Started buying" : "Callback requested"}</span>
              <span>waiting {waiting(Date.parse(row.requestedAt), now)}</span>
            </div>
            <p>{row.package}{row.price !== null ? ` · ₹${row.price.toLocaleString("en-IN")}` : ""}{row.choice ? ` · ${choiceText(row.choice)}` : ""} · asked {when(row.requestedAt)}</p>
            {row.teamReminder && <p>Team reminder {row.teamReminder.number}/3 eligible from {when(row.teamReminder.at)} (IST). {row.teamActionEnabled === false ? "The team reminder action is Off." : "Subject to sending settings."}</p>}
            <p className={s.note}>{row.teamReminderAttempts || 0}/3 daily team milestones processed. Check message history for actual delivery.{(row.teamReminderAttempts || 0) >= 3 ? " No more daily team reminders are planned." : ""}</p>
            <LegacyReminderHistory source="package_request" entityId={row.id} active={active} title="Request message history" openAction={openAction} />
            <ReminderPauseControl source="package_request" entityId={row.id} paused={!!row.remindersPaused} label="request team reminders" onChanged={refresh} />
            <button type="button" disabled={!!busyId} onClick={() => void closePackageRequest(row)}>{busyId === row.id ? "Saving…" : "Close request"}</button>
            {openAction && <button type="button" onClick={() => openAction("package.start.request.admin")}>Team reminder message settings (all customers)</button>}
            {/* The project is made with the portal's own form, filled from this request (frontend AdminClientWorkspace.js). */}
            {portalUrl && row.userId && <a href={`${portalUrl}/admin-panel/clients/${row.userId}?startRequest=${row.id}`} target="_blank" rel="noopener noreferrer">Create project ↗</a>}
          </li>)}</ul>}
      <p className={s.note}>Get this package or Arrange a callback on a package page. No price is held. Creating the project on that package closes the request; the team can also close it on the client&apos;s Reserved offers in the portal.</p>
    </div>
    <p className={s.note}>Each offer sets how long its reservation lasts (Admin → Offers → Reservation lasts). The countdown starts when the customer reserves. When a project is created on the reservation, the normal project message goes and nothing else. When the time ends with no project, the customer gets the offer-expired message once, with the offers page link. To give one customer more time, use Extend deadline on the client&apos;s page in the portal.</p>
    <p className={s.note}>Depending on the reservation&apos;s length and status, reminders can go after the first 24 hours and with 24, 6 or 1 hours left. Start my project pauses the countdown until a project is created or Extend deadline resumes it. The team is reminded once a day, up to 3 times.</p>
    {openAction && <details><summary>Reservation message settings (apply to all customers)</summary>
      <p className={s.note}>These links open the existing action settings for message wording, channel and On/Off. The reminder times are currently fixed by the reservation system.</p>
      <div className={s.actions}>{([
        ["offer.reserved", "Reservation confirmation"],
        ["offer.reservation.extended", "Deadline extension"],
        ["offer.reservation.expired", "Reservation expiry"],
        ["offer.start.request.admin", "Start request and team reminder"],
        ["offer.start.request.received", "Start request acknowledgement"],
        ["offer.reservation.dayPassed", "After 24 hours"],
        ["offer.reservation.reminder", "24 hours left"],
        ["offer.reservation.sixHours", "6 hours left"],
        ["offer.reservation.lastHour", "1 hour left"],
      ] as const).map(([event, label]) => <button key={event} type="button" onClick={() => openAction(event)}>{label} settings</button>)}</div>
    </details>}
    <p className={s.note}>Edit the words and choose Send via in Message Templates → Portal → Offers: reservation confirmation, extension, expiry, each reminder, and the start-request messages.</p>
  </section>;
}
