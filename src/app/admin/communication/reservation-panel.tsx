"use client";

import { CapsuleSelect } from "@/components/capsule-select";

import { Fragment, useCallback, useMemo, useState } from "react";
import { useCommunicationRefresh } from "@/lib/communication-live";
import { Loader } from "@/app/admin/email-control/loader";
import { phoneLabel } from "@/app/admin/whatsapp/whatsapp-panel";
import { useServerTime } from "@/components/use-server-time";
import { formatIndiaDate } from "@/lib/date-time";
import { PAYMENT_OPTION_WORDS } from "@/lib/package-choice";
import { PURCHASE_LABELS, tenureLabel } from "@/lib/public-plans";
import type { PackageChoice } from "@/lib/sales-packages";
import styles from "../email-control/email-control.module.css";
import c from "./actions-panel.module.css";
import s from "./communication.module.css";
import b from "./broadcast.module.css";
import { LegacyReminderHistory } from "./legacy-reminder-history";
import { InfoTip } from "./reminder-info";
import { ReminderPauseControl } from "./reminder-pause-control";
import { RESERVATION_MESSAGES } from "./reminder-work-info";

type TeamReminder = { at: string; number: number } | null;
type ReminderRecord = { key: string; event: string | null; status: string; at: string | null; whatsapp: string[] };
type Running = {
  id: string;
  userId: string;
  remindersEnabled: boolean;
  remindersPaused: boolean;
  teamRemindersPaused: boolean;
  teamControlAvailable?: boolean;
  teamReminderAttempts?: number;
  teamActionEnabled?: boolean;
  reminderHistory?: ReminderRecord[];
  customer: string;
  phone: string;
  offer: string;
  reservedAt: string;
  deadline: string;
  extended: boolean;
  hours: number;
  startRequestedAt: string | null;
  upcomingReminder?: { event: string; at: string; actionEnabled?: boolean } | null;
  teamReminder?: TeamReminder;
};
type PackageStart = {
  id: string;
  customer: string;
  phone: string;
  package: string;
  price: number | null;
  requestedAt: string;
  userId?: string;
  remindersPaused?: boolean;
  teamReminderAttempts?: number;
  teamActionEnabled?: boolean;
  choice?: PackageChoice | null;
  kind?: "buy" | "callback";
  teamReminder?: TeamReminder;
  messageHistory?: ReminderRecord[];
};
type PaidCandidate = {
  id: string;
  createdAt: string;
  totalAmount: number;
  paidAt: string;
  category: string;
  offerCategories: string[];
  categoryMismatch: boolean;
  offerRecorded: boolean;
  itemNames: string[];
};
type PaidPreview = { reservationId: string; offerSlug: string; offerTitle: string; reservedPrice: number; candidates: PaidCandidate[]; limited: boolean };
type Overview = {
  serverNow: string;
  reservationScheduler?: { jobsEnabled: boolean; confirmationsEnabled: boolean };
  packageRequestScheduler?: { jobsEnabled: boolean; requestsEnabled: boolean };
  counts: { running: number; used: number; expired: number; closures: Record<string, number> };
  running: Running[];
  recentClosed?: { id: string; userId: string; customer: string; offer: string; status: "project_linked" | "expired"; closureStatus: string | null; reminderHistory: ReminderRecord[] }[];
  packageStarts?: PackageStart[];
};
type ResTab = "running" | "package_starts" | "closed";
type PauseFilter = "all" | "active" | "paused";

async function loadOverview(signal?: AbortSignal): Promise<Overview> {
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

function choiceText(choice: PackageChoice) {
  if (choice.paymentOption) return PAYMENT_OPTION_WORDS[choice.paymentOption].title;
  return [choice.billingCycle ? PURCHASE_LABELS[choice.billingCycle] : "", choice.tenureMonths ? tenureLabel(choice.tenureMonths) : ""].filter(Boolean).join(" · ");
}

export function ReservationPanel({ active = true, portalUrl = "", openAction }: { active?: boolean; portalUrl?: string; openAction?: (event: string) => void; compact?: boolean }) {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<ResTab>("running");
  const [pauseFilter, setPauseFilter] = useState<PauseFilter>("all");
  const [query, setQuery] = useState("");
  const [historyFor, setHistoryFor] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [paidPreview, setPaidPreview] = useState<PaidPreview | null>(null);
  const [paidOrder, setPaidOrder] = useState("");
  const [paidReason, setPaidReason] = useState("");
  const [paidSlug, setPaidSlug] = useState("");
  const [ackMismatch, setAckMismatch] = useState(false);
  const serverNow = useServerTime();

  const refresh = useCallback(async (signal?: AbortSignal) => {
    const next = await loadOverview(signal);
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
      const response = await fetch(`/api/auto-reply/reservations/${row.id}/reconcile-paid-project`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: paidOrder, reason: paidReason, confirmSlug: paidSlug, acknowledgeMismatch: ackMismatch }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not link the project.");
      setPaidPreview(null);
      await refresh();
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
  const needle = query.trim().toLowerCase();

  const runningRows = useMemo(() => (data?.running ?? []).filter(row => {
    const paused = row.startRequestedAt ? !!row.teamRemindersPaused : !!row.remindersPaused;
    if (pauseFilter === "active" && paused) return false;
    if (pauseFilter === "paused" && !paused) return false;
    if (!needle) return true;
    return (row.customer || "").toLowerCase().includes(needle)
      || (row.phone || "").toLowerCase().includes(needle)
      || (row.offer || "").toLowerCase().includes(needle);
  }), [data, pauseFilter, needle]);

  const packageRows = useMemo(() => (data?.packageStarts ?? []).filter(row => {
    if (pauseFilter === "active" && row.remindersPaused) return false;
    if (pauseFilter === "paused" && !row.remindersPaused) return false;
    if (!needle) return true;
    return (row.customer || "").toLowerCase().includes(needle)
      || (row.phone || "").toLowerCase().includes(needle)
      || (row.package || "").toLowerCase().includes(needle);
  }), [data, pauseFilter, needle]);

  const closedRows = useMemo(() => (data?.recentClosed ?? []).filter(row => {
    if (!needle) return true;
    return (row.customer || "").toLowerCase().includes(needle) || (row.offer || "").toLowerCase().includes(needle);
  }), [data, needle]);

  const closures = data ? CLOSURES.filter(([key]) => data.counts.closures[key]).map(([key, label]) => `${data.counts.closures[key].toLocaleString("en-IN")} ${label}`) : [];

  return (
    <section className={styles.section} aria-label="Reservation">
      <div className={s.workToolbar}>
        <h3>Offer reservations &amp; package requests</h3>
        <InfoTip label="How reservations work">
          <p>Each offer sets how long its reservation lasts. Reminders can go after 24h and with 24h, 6h or 1h left. Pressing Start project pauses the customer countdown and reminds the team once a day (max 3).</p>
          <p>Message wording, channels and schedules are managed in <strong>Actions</strong>.</p>
        </InfoTip>
        {openAction && (
          <button type="button" className="admin-action" onClick={() => openAction(RESERVATION_MESSAGES[0]?.[0] || "offer.reservation.reminder")}>
            Edit reservation rules →
          </button>
        )}
      </div>

      {error && <p role="alert" className={styles.error}>{error}</p>}
      {data?.reservationScheduler && (!data.reservationScheduler.jobsEnabled || !data.reservationScheduler.confirmationsEnabled) && (
        <p className={styles.banner}>Reservation reminder jobs are off on this server. Listed milestones show timing only.</p>
      )}
      {tab === "package_starts" && data?.packageRequestScheduler && (!data.packageRequestScheduler.jobsEnabled || !data.packageRequestScheduler.requestsEnabled) && (
        <p className={styles.banner}>Package request reminder jobs are off on this server. Listed milestones show timing only.</p>
      )}

      <div role="tablist" aria-label="Reservation sections" className={c.segment}>
        <button type="button" role="tab" aria-selected={tab === "running"} onClick={() => { setTab("running"); setHistoryFor(null); }}>
          Running <span className={c.badge}>({data ? data.counts.running : 0})</span>
        </button>
        <button type="button" role="tab" aria-selected={tab === "package_starts"} onClick={() => { setTab("package_starts"); setHistoryFor(null); }}>
          Package requests <span className={c.badge}>({data?.packageStarts?.length ?? 0})</span>
        </button>
        <button type="button" role="tab" aria-selected={tab === "closed"} onClick={() => { setTab("closed"); setHistoryFor(null); }}>
          Recently closed <span className={c.badge}>({data?.recentClosed?.length ?? 0})</span>
        </button>
      </div>

      {tab !== "closed" && (
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
          aria-label="Find a reservation or request"
          placeholder="Find by customer, phone, offer or package"
          value={query}
          onChange={event => setQuery(event.target.value)}
        />
        {data && tab === "running" && (
          <span className={c.count}>
            {data.counts.used.toLocaleString("en-IN")} linked · {data.counts.expired.toLocaleString("en-IN")} expired
            {closures.length > 0 ? ` (${closures.join(" · ")})` : ""}
          </span>
        )}
      </div>

      {!data ? !error && <Loader label="Loading reservations…" /> : (
        <>
          {tab === "running" && (
            !runningRows.length ? <p className={styles.muted}>No running reservations match this filter.</p> : (
              <div className={c.tableWrap}>
                <table className={c.table} aria-label="Running reservations table">
                  <thead>
                    <tr>
                      <th scope="col">Customer &amp; Offer</th>
                      <th scope="col">Deadline</th>
                      <th scope="col">Next Reminder</th>
                      <th scope="col">Status</th>
                      <th scope="col" className={c.right}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runningRows.map(row => {
                      const isHistoryOpen = historyFor === row.id;
                      const isPaused = row.startRequestedAt ? !!row.teamRemindersPaused : !!row.remindersPaused;
                      return (
                        <Fragment key={row.id}>
                          <tr className={c.row}>
                            <td>
                              <div className={c.name}>{row.customer || "Customer"}</div>
                              <div className={c.when}>{row.offer} · {row.hours}h{row.phone ? ` · ${phoneLabel(row.phone)}` : ""}</div>
                              {portalUrl && row.userId && (
                                <div className={c.when}>
                                  <a href={`${portalUrl}/admin-panel/clients/${row.userId}`} target="_blank" rel="noopener noreferrer">Open client ↗</a>
                                </div>
                              )}
                            </td>
                            <td>
                              <div className={c.name}>
                                {row.startRequestedAt ? `Start requested · waiting ${waiting(Date.parse(row.startRequestedAt), now)}` : timeLeft(Date.parse(row.deadline), now)}
                              </div>
                              <div className={c.when}>
                                {row.startRequestedAt ? `Paused since ${when(row.startRequestedAt)}` : `Ends ${when(row.deadline)}${row.extended ? " (extended)" : ""}`}
                              </div>
                            </td>
                            <td className={c.description}>
                              {row.startRequestedAt ? (
                                <>
                                  <div>{row.teamReminder ? `Team alert ${row.teamReminder.number}/3 from ${when(row.teamReminder.at)}` : `${row.teamReminderAttempts || 0}/3 team alerts sent`}</div>
                                  <div className={c.when}>Customer countdown held</div>
                                </>
                              ) : row.upcomingReminder ? (
                                <>
                                  <div>{when(row.upcomingReminder.at)}</div>
                                  <div className={c.when}>{row.upcomingReminder.actionEnabled === false ? "Rule Off" : "Scheduled"}</div>
                                </>
                              ) : (
                                <span className={c.when}>No upcoming milestone</span>
                              )}
                            </td>
                            <td>
                              <strong>{isPaused ? "Paused" : "Active"}</strong>
                            </td>
                            <td className={c.right}>
                              <div style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                                {row.remindersEnabled && !row.startRequestedAt && (
                                  <ReminderPauseControl compact source="reservation" entityId={row.id} paused={!!row.remindersPaused} label="customer reminders" onChanged={refresh} />
                                )}
                                {row.teamControlAvailable && (
                                  <ReminderPauseControl compact source="reservation_team" entityId={row.id} paused={!!row.teamRemindersPaused} label="team reminders" onChanged={refresh} />
                                )}
                                <button type="button" className={c.manage} disabled={!!busyId} onClick={() => void openPaidProjects(row)}>
                                  Link paid project
                                </button>
                                <button type="button" className={c.manage} onClick={() => setHistoryFor(isHistoryOpen ? null : row.id)}>
                                  {isHistoryOpen ? "Hide history" : "History"}
                                </button>
                              </div>
                            </td>
                          </tr>
                          {paidPreview?.reservationId === row.id && (
                            <tr className={c.row}>
                              <td colSpan={5}>
                                <section className={b.preview} aria-label="Review paid project link">
                                  <h4>Review paid project for {paidPreview.offerTitle}</h4>
                                  <p>Only this customer&apos;s unlinked, fully paid projects with the same price and in-window payment are shown.</p>
                                  {paidPreview.limited && <p>Only the latest 100 projects were checked.</p>}
                                  {!paidPreview.candidates.length ? <p>No eligible paid project found. Open the client for a full review.</p> : (
                                    <>
                                      <div className={b.field}><span>Paid project</span>
                                        <CapsuleSelect
                                          ariaLabel="Paid project"
                                          value={paidOrder}
                                          onChange={value => { setPaidOrder(value); setAckMismatch(false); }}
                                          options={[
                                            { value: "", label: "Choose a project" },
                                            ...paidPreview.candidates.map(candidate => ({
                                              value: candidate.id,
                                              label: `${candidate.itemNames.join(", ") || candidate.id} · ₹${candidate.totalAmount.toLocaleString("en-IN")} · ${when(candidate.createdAt)}`,
                                            })),
                                          ]}
                                        />
                                      </div>
                                      {paidPreview.candidates.filter(candidate => candidate.id === paidOrder).map(candidate => (
                                        <div key={candidate.id}>
                                          <p>Project ID: {candidate.id} · Paid {when(candidate.paidAt)} (IST) · Amount ₹{candidate.totalAmount.toLocaleString("en-IN")}.</p>
                                          <p>Project category: {candidate.category || "not recorded"} · Offer categories: {candidate.offerCategories.join(", ") || "not recorded"}.</p>
                                          {!candidate.offerRecorded && <p>No offer agreement was recorded on this project. Verify before linking.</p>}
                                          {candidate.categoryMismatch && (
                                            <label><input type="checkbox" checked={ackMismatch} onChange={event => setAckMismatch(event.target.checked)} /> I reviewed the category mismatch and confirm.</label>
                                          )}
                                        </div>
                                      ))}
                                      <label className={b.field}>Reason for linking<input value={paidReason} maxLength={300} onChange={event => setPaidReason(event.target.value)} /></label>
                                      <label className={b.field}>Type offer code {paidPreview.offerSlug} to confirm<input value={paidSlug} onChange={event => setPaidSlug(event.target.value)} /></label>
                                      <div className={b.actions}>
                                        <button type="button" onClick={() => setPaidPreview(null)}>Cancel review</button>
                                        <button
                                          type="button"
                                          disabled={!!busyId || !paidOrder || !paidReason.trim() || paidSlug !== paidPreview.offerSlug || (!!paidPreview.candidates.find(candidate => candidate.id === paidOrder)?.categoryMismatch && !ackMismatch)}
                                          onClick={() => void reconcilePaidProject(row)}
                                        >
                                          Link paid project
                                        </button>
                                      </div>
                                    </>
                                  )}
                                </section>
                              </td>
                            </tr>
                          )}
                          {isHistoryOpen && (
                            <tr className={c.row}>
                              <td colSpan={5}>
                                <LegacyReminderHistory source="reservation" entityId={row.id} active={active} defaultOpen compact title="Reservation message history" openAction={openAction} />
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          )}

          {tab === "package_starts" && (
            !packageRows.length ? <p className={styles.muted}>No open package requests match this filter.</p> : (
              <div className={c.tableWrap}>
                <table className={c.table} aria-label="Package start requests table">
                  <thead>
                    <tr>
                      <th scope="col">Customer &amp; Package</th>
                      <th scope="col">Requested</th>
                      <th scope="col">Team Alerts</th>
                      <th scope="col">Status</th>
                      <th scope="col" className={c.right}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {packageRows.map(row => {
                      const isHistoryOpen = historyFor === row.id;
                      return (
                        <Fragment key={row.id}>
                          <tr className={c.row}>
                            <td>
                              <div className={c.name}>{row.customer || "Customer"}</div>
                              <div className={c.when}>
                                {row.package}{row.price !== null ? ` · ₹${row.price.toLocaleString("en-IN")}` : ""}
                                {row.choice ? ` · ${choiceText(row.choice)}` : ""}
                                {row.phone ? ` · ${phoneLabel(row.phone)}` : ""}
                              </div>
                              {portalUrl && row.userId && (
                                <div className={c.when}>
                                  <a href={`${portalUrl}/admin-panel/clients/${row.userId}?startRequest=${row.id}`} target="_blank" rel="noopener noreferrer">Create project ↗</a>
                                </div>
                              )}
                            </td>
                            <td>
                              <div className={c.name}>{row.kind === "buy" ? "Started buying" : "Callback requested"}</div>
                              <div className={c.when}>Waiting {waiting(Date.parse(row.requestedAt), now)} · {when(row.requestedAt)}</div>
                            </td>
                            <td className={c.description}>
                              <div>{row.teamReminder ? `Alert ${row.teamReminder.number}/3 from ${when(row.teamReminder.at)}` : `${row.teamReminderAttempts || 0}/3 alerts processed`}</div>
                              {(row.teamReminderAttempts || 0) >= 3 && <div className={c.when}>Max alerts reached</div>}
                            </td>
                            <td>
                              <strong>{row.remindersPaused ? "Paused" : "Active"}</strong>
                            </td>
                            <td className={c.right}>
                              <div style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                                <ReminderPauseControl compact source="package_request" entityId={row.id} paused={!!row.remindersPaused} label="request team reminders" onChanged={refresh} />
                                <button type="button" className={c.manage} disabled={!!busyId} onClick={() => void closePackageRequest(row)}>
                                  {busyId === row.id ? "Saving…" : "Close request"}
                                </button>
                                <button type="button" className={c.manage} onClick={() => setHistoryFor(isHistoryOpen ? null : row.id)}>
                                  {isHistoryOpen ? "Hide history" : "History"}
                                </button>
                              </div>
                            </td>
                          </tr>
                          {isHistoryOpen && (
                            <tr className={c.row}>
                              <td colSpan={5}>
                                <LegacyReminderHistory source="package_request" entityId={row.id} active={active} defaultOpen compact title="Request message history" openAction={openAction} />
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          )}

          {tab === "closed" && (
            !closedRows.length ? <p className={styles.muted}>No completed or expired reservations match this filter.</p> : (
              <div className={c.tableWrap}>
                <table className={c.table} aria-label="Recently closed reservations table">
                  <thead>
                    <tr>
                      <th scope="col">Customer &amp; Offer</th>
                      <th scope="col">Outcome</th>
                      <th scope="col" className={c.right}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {closedRows.map(row => {
                      const isHistoryOpen = historyFor === row.id;
                      return (
                        <Fragment key={row.id}>
                          <tr className={c.row}>
                            <td>
                              <div className={c.name}>{row.customer || "Customer"}</div>
                              <div className={c.when}>{row.offer}</div>
                              {portalUrl && row.userId && (
                                <div className={c.when}>
                                  <a href={`${portalUrl}/admin-panel/clients/${row.userId}`} target="_blank" rel="noopener noreferrer">Open client ↗</a>
                                </div>
                              )}
                            </td>
                            <td>
                              <strong>{row.status === "project_linked" ? "Project linked" : "Expired"}</strong>
                              {row.closureStatus && row.status === "expired" && (
                                <div className={c.when}>Expiry message: {row.closureStatus}</div>
                              )}
                            </td>
                            <td className={c.right}>
                              <button type="button" className={c.manage} onClick={() => setHistoryFor(isHistoryOpen ? null : row.id)}>
                                {isHistoryOpen ? "Hide history" : "History"}
                              </button>
                            </td>
                          </tr>
                          {isHistoryOpen && (
                            <tr className={c.row}>
                              <td colSpan={3}>
                                <LegacyReminderHistory source="reservation" entityId={row.id} active={active} defaultOpen compact title="Reservation message history" openAction={openAction} />
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          )}
        </>
      )}
    </section>
  );
}
