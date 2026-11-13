"use client";
import { useCommunicationRefresh } from "@/lib/communication-live";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { EmailControlPanel, type EmailView } from "@/app/admin/email-control/email-control-panel";
import { Loader } from "@/app/admin/email-control/loader";
import { connectionLabel, type HistoryGroup, message, phoneLabel, WhatsappPanel, whatsappApi } from "@/app/admin/whatsapp/whatsapp-panel";
import { formatIndiaDate, indiaDayKey } from "@/lib/date-time";
import { emailControlApi } from "@/lib/email-control-client";
import type { Application, EmailSummary } from "@/lib/email-control-types";
import type { WhatsappQueuePage, WhatsappQueueStatus, WhatsappStatus } from "@/lib/whatsapp-types";
import s from "./communication.module.css";
import { AutoReplyPanel } from "./auto-reply-panel";
import { FinalMessagePanel } from "./final-message-panel";
import { ReservationPanel } from "./reservation-panel";
import { BroadcastPanel } from "./broadcast-panel";
import { OfferPaymentReminders } from "./offer-payment-reminders";
import { LegacyReminderHistory } from "./legacy-reminder-history";
import { BusinessActivity } from "./business-activity";
import { ReminderDrafts } from "./reminder-drafts";
import { ReminderHistory } from "./reminder-history";
import { ReminderWorkList } from "./reminder-work-list";
import { ReminderWorkDetail } from "./reminder-work-detail";

/**
 * Communication: navigation boxes, then what needs attention and the recent emails and
 * WhatsApp messages; every line opens the panel that holds it. A panel opens in the browser at once (no
 * server render): its tabs, headings and fields are drawn immediately and only live data loads, with a
 * small loader in its place. A panel once opened stays ready (hidden, not refreshing), so opening it again
 * is instant. The URL follows (?panel=…&tab=…&app=…&show=…) for links and Back.
 * Live data on this page: WhatsApp /status (every 5 s, only while no panel is open), the WhatsApp history's
 * first page (when those counts change), and the email /summary (counts + last 5, when the page opens and
 * whenever a panel closes). Activity is Communication's own: emails and WhatsApp messages only.
 */
export type HubState = { panel: string | null; tab: string | null; app: string | null; show?: string | null; event?: string | null };
type PanelId = "whatsapp-connection" | "whatsapp-queue" | "broadcast" | "auto-reply" | "final-message" | "reservation" | "reminders" | "business-activity" | "email-templates" | "email-review";
type Tab = { id: string; label: string };
type Panel = { group: "WhatsApp" | "Email"; title: string; description: string; tabs: Tab[]; whatsapp: boolean };
const APPS: Tab[] = [{ id: "website", label: "Website" }, { id: "portal", label: "Portal" }];
const PANELS: Record<PanelId, Panel> = {
  "broadcast": { group: "WhatsApp", title: "Broadcast", whatsapp: true, tabs: [], description: "Choose leads or clients, compose text and media, and send via WhatsApp, Email or Both." },
  "auto-reply": { group: "WhatsApp", title: "Auto Reply", whatsapp: true, tabs: [], description: "Recognise the ad message, reply through the queue and add the number to Leads." },
  "final-message": { group: "WhatsApp", title: "Final Message", whatsapp: true, tabs: [], description: "The time limit for a Negative lead's last message, and the replies that came back." },
  "reservation": { group: "WhatsApp", title: "Reservation", whatsapp: true, tabs: [], description: "Offer reservations running now with their time left, and the expiry messages sent." },
  "reminders": { group: "WhatsApp", title: "Reminders", whatsapp: true, tabs: [], description: "Existing reminder settings and running reservations." },
  "business-activity": { group: "WhatsApp", title: "Business Activity", whatsapp: true, tabs: [], description: "Recent package orders, plan starts, offer reservations and broadcasts." },
  "whatsapp-connection": { group: "WhatsApp", title: "WhatsApp Connection", whatsapp: true, tabs: [],
    description: "The linked number: connection, QR code, pause and unlink." },
  "whatsapp-queue": { group: "WhatsApp", title: "WhatsApp Queue", whatsapp: true,
    tabs: [{ id: "queue", label: "Queue" }, { id: "rules", label: "Sending rules" }, { id: "history", label: "History" }],
    description: "Messages waiting to go, the rules that pace them, and every finished message." },
  "email-templates": { group: "Email", title: "Message Templates", whatsapp: false, tabs: APPS,
    description: "Each job’s mails: who decides, the default template and the editor. WhatsApp sends the same text." },
  "email-review": { group: "Email", title: "Email Review", whatsapp: false,
    tabs: [{ id: "review", label: "Review" }, { id: "outbox", label: "Outbox" }, { id: "history", label: "History" }],
    description: "Mails waiting for Send / Don’t send, the Outbox and every decision." },
};
const IDS = Object.keys(PANELS) as PanelId[];
type View = { panel: PanelId | null; tab: string; app: Application; show: HistoryGroup | null; event: string | null };

function normalize(state: HubState, portalAdmin: boolean): View {
  const panel = IDS.find(id => id === state.panel) ?? null;
  const tabs = panel ? PANELS[panel].tabs : [];
  let tab = tabs.find(item => item.id === state.tab)?.id ?? tabs[0]?.id ?? "";
  if (panel === "email-templates" && tab === "portal" && !portalAdmin) tab = "website";
  const show = panel === "whatsapp-queue" && tab === "history" && state.show === "not-sent" ? "not-sent" : null;
  return { panel, tab, app: state.app === "portal" && portalAdmin ? "portal" : "website", show, event: panel === "email-templates" && /^[\w.]{1,100}$/.test(state.event || "") ? state.event! : null };
}
function href(view: View) {
  if (!view.panel) return "/admin/communication";
  const params = new URLSearchParams({ panel: view.panel });
  if (view.tab && view.tab !== PANELS[view.panel].tabs[0]?.id) params.set("tab", view.tab);
  if (view.panel === "email-review" && view.app === "portal") params.set("app", "portal");
  if (view.show) params.set("show", view.show);
  if (view.event) params.set("event", view.event);
  return `/admin/communication?${params}`;
}
// Which mounted part a view shows: one per tab, or one per application for the email panels.
function partOf(view: View) {
  if (!view.panel) return "";
  if (view.panel === "email-review") return `email-review:${view.app}`;
  return view.tab ? `${view.panel}:${view.tab}` : view.panel;
}

// Recent activity: one list of emails and WhatsApp messages, newest first.
type Activity = { id: string; channel: "email" | "whatsapp"; status: string; tone: "ok" | "warn" | "bad" | "muted"; subject: string; to: string; at: string; open: HubState };
const RECENT_ROWS = 8;
const EMAIL_STATUS: Record<string, [string, Activity["tone"]]> = {
  sent: ["Sent", "ok"], pending: ["Waiting for review", "warn"], sending: ["Sending", "muted"], failed: ["Failed", "bad"], skipped: ["Not sent", "muted"], expired: ["Expired", "muted"],
};
const WHATSAPP_STATUS: Record<WhatsappQueueStatus, [string, Activity["tone"]]> = {
  sent: ["Sent", "ok"], pending: ["Waiting", "muted"], sending: ["Sending", "muted"], failed: ["Failed", "bad"], skipped: ["Skipped", "muted"], expired: ["Expired", "muted"], cancelled: ["Cancelled", "muted"],
};
/** Today: "2:04 pm"; earlier: "27 Oct, 2:04 pm" (IST). */
function when(at: string) {
  const time = { hour: "numeric", minute: "2-digit", hour12: true } as const;
  return indiaDayKey(at) === indiaDayKey() ? formatIndiaDate(at, { day: undefined, month: undefined, year: undefined, ...time }) : formatIndiaDate(at, { year: undefined, ...time });
}

export function CommunicationHub({ portalAdmin, initial, portalUrl = "" }: { portalAdmin: boolean; initial: HubState; portalUrl?: string }) {
  const [view, setView] = useState(() => normalize(initial, portalAdmin));
  const [mounted, setMounted] = useState(() => new Set(view.panel ? [partOf(view)] : []));
  const [historyShow, setHistoryShow] = useState<HistoryGroup>(view.show ?? "sent");
  const [query, setQuery] = useState("");
  const [reminderSection, setReminderSection] = useState<"work" | "rules" | "activity" | "existing">("work");
  const [reminderWork, setReminderWork] = useState<"monthly_package" | "offer_payment" | "reservation" | "broadcast" | null>(null);
  const [reminderAdd, setReminderAdd] = useState(false);
  const [status, setStatus] = useState<WhatsappStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [summary, setSummary] = useState<Partial<Record<Application, EmailSummary>>>({});
  const [summaryFailed, setSummaryFailed] = useState(false);
  const [whatsappRecent, setWhatsappRecent] = useState<WhatsappQueuePage | null>(null);
  const apps: Application[] = portalAdmin ? ["website", "portal"] : ["website"];

  const go = useCallback((next: HubState, push = true) => {
    const value = normalize(next, portalAdmin);
    setView(value);
    if (value.panel) setMounted(current => current.has(partOf(value)) ? current : new Set(current).add(partOf(value)));
    if (value.panel === "whatsapp-queue" && value.tab === "history") setHistoryShow(value.show ?? "sent");
    if (push) window.history.pushState(null, "", href(value));
  }, [portalAdmin]);

  // Back / Forward move between panels like pages.
  useEffect(() => {
    const onPop = () => {
      const params = new URLSearchParams(window.location.search);
      go({ panel: params.get("panel"), tab: params.get("tab"), app: params.get("app"), show: params.get("show"), event: params.get("event") }, false);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [go]);

  // The sidebar's sub-tabs change the URL on this same page, which does not remount the hub, so the hub follows the URL too.
  const search = useSearchParams()?.toString() ?? null;
  const [syncedSearch, setSyncedSearch] = useState(search);
  if (search !== syncedSearch) {
    setSyncedSearch(search);
    if (search !== null) {
      const params = new URLSearchParams(search);
      const next = normalize({ panel: params.get("panel"), tab: params.get("tab"), app: params.get("app"), show: params.get("show"), event: params.get("event") }, portalAdmin);
      if (href(next) !== href(view)) go(next, false);
    }
  }

  // WhatsApp status for the boxes and warnings: only while no panel is open (the panels refresh their own data).
  useEffect(() => {
    if (!portalAdmin || view.panel) return;
    const controller = new AbortController();
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      whatsappApi<WhatsappStatus>("status", "GET", controller.signal)
        .then(data => { if (!controller.signal.aborted) { setStatus(data); setStatusError(null); } })
        .catch(error => { if (!controller.signal.aborted) setStatusError(message(error, "Unavailable")); });
    };
    const first = setTimeout(refresh, 0);
    const timer = setInterval(refresh, 5000);
    return () => { controller.abort(); clearTimeout(first); clearInterval(timer); };
  }, [portalAdmin, view.panel]);

  // Recent WhatsApp messages: the history's first page, again only when the status counts change.
  const countsKey = JSON.stringify(status?.counts ?? null);
  useEffect(() => {
    if (!portalAdmin || view.panel || countsKey === "null") return;
    const controller = new AbortController();
    whatsappApi<WhatsappQueuePage>("queue?status=all&page=1", "GET", controller.signal)
      .then(data => { if (!controller.signal.aborted) setWhatsappRecent(data); })
      .catch(() => { /* the list keeps its last rows; the status line already reports trouble */ });
    return () => controller.abort();
  }, [portalAdmin, view.panel, countsKey]);

  // Email counts refresh on authorized events or when returning to the hub.
  useCommunicationRefresh(signal => Promise.all((portalAdmin ? ["website", "portal"] as const : ["website"] as const).map(app => emailControlApi<EmailSummary>(app, "/summary", "GET", undefined, signal)))
    .then(rows => { if (!signal.aborted) { setSummary(Object.fromEntries(rows.map(row => [row.application, row]))); setSummaryFailed(false); } })
    .catch(() => { if (!signal.aborted) setSummaryFailed(true); }), !view.panel, 0);
  // A review list that loads keeps the Email Review count current.
  const reviewCount = useCallback((app: Application, count: number) => setSummary(current => {
    const row = current[app];
    return row && row.review !== count ? { ...current, [app]: { ...row, review: count } } : current;
  }), []);
  const websiteReview = useCallback((count: number) => reviewCount("website", count), [reviewCount]);
  const portalReview = useCallback((count: number) => reviewCount("portal", count), [reviewCount]);

  const emailReady = apps.every(app => summary[app]);
  // Needs attention: only what asks for work now; each line opens the place to deal with it.
  const attention: { text: string; link: string; open: HubState }[] = [];
  for (const app of apps) {
    const count = summary[app]?.review ?? 0;
    if (count) attention.push({ text: `${count} ${portalAdmin ? `${app} ` : ""}${count === 1 ? "email" : "emails"} waiting for review`, link: "Review", open: { panel: "email-review", tab: "review", app } });
  }
  if (portalAdmin && status) {
    const connection: HubState = { panel: "whatsapp-connection", tab: null, app: null };
    if (!status.enabled) attention.push({ text: "WhatsApp sending is turned off on the server", link: "Details", open: connection });
    else if (!status.workerRunning) attention.push({ text: "The WhatsApp service is not running", link: "Details", open: connection });
    else if (status.connection !== "connected") attention.push({ text: `WhatsApp is not connected (${connectionLabel(status)})`, link: "Connect", open: connection });
    if (status.paused) attention.push({ text: "WhatsApp sending is paused", link: "Resume", open: connection });
    if (status.counts.failed) attention.push({ text: `${status.counts.failed} WhatsApp ${status.counts.failed === 1 ? "message" : "messages"} not sent`, link: "View", open: { panel: "whatsapp-queue", tab: "history", app: null, show: "not-sent" } });
  }
  const attentionReady = (emailReady || summaryFailed) && (!portalAdmin || !!status || !!statusError);

  const activity: Activity[] = [
    ...apps.flatMap(app => (summary[app]?.recent ?? []).map(row => {
      const [label, tone] = EMAIL_STATUS[row.status] ?? [row.status, "muted" as const];
      return { id: `e-${row._id}`, channel: "email" as const, status: label, tone, subject: row.subject || row.label, to: row.to.join(", "), at: row.at,
        open: { panel: "email-review", tab: row.status === "pending" || row.status === "failed" ? "review" : "history", app: row.application } };
    })),
    ...(portalAdmin ? whatsappRecent?.rows ?? [] : []).slice(0, 5).map(row => {
      const [label, tone] = WHATSAPP_STATUS[row.status];
      const waitingRow = row.status === "pending" || row.status === "sending";
      return { id: `w-${row._id}`, channel: "whatsapp" as const, status: label, tone, subject: row.text.split("\n")[0].replace(/\*/g, "") || "Message", to: phoneLabel(row.to), at: row.sentAt || row.createdAt,
        open: waitingRow ? { panel: "whatsapp-queue", tab: "queue", app: null } : { panel: "whatsapp-queue", tab: "history", app: null, show: row.status === "sent" ? null : "not-sent" } };
    }),
  ].sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, RECENT_ROWS);
  const activityReady = (emailReady || summaryFailed) && (!portalAdmin || !!whatsappRecent || !!statusError);

  const open = view.panel ? PANELS[view.panel] : null;
  const current = partOf(view);
  const part = (key: string) => ({ mount: mounted.has(key), shown: !!view.panel && current === key });

  function body() {
    const whatsappParts: [string, React.ReactNode][] = [
      ["broadcast", <BroadcastPanel key="b" active={part("broadcast").shown} />],
      ["business-activity", <BusinessActivity key="activity" active={part("business-activity").shown} openAction={event => go({ panel: "email-templates", tab: "portal", app: null, event })} />],
      ["auto-reply", <AutoReplyPanel key="a" active={part("auto-reply").shown} />],
      ["final-message", <FinalMessagePanel key="f" active={part("final-message").shown} />],
      ["reservation", <ReservationPanel key="v" active={part("reservation").shown} portalUrl={portalUrl} openAction={event => go({ panel: "email-templates", tab: "portal", app: null, event })} />],
      ["reminders", <section key="reminders" aria-label="Existing reminders">
        <div className={s.subNav} role="group" aria-label="Reminder sections">
          {([ ["work", "By work"], ["activity", "Reminder activity"], ["rules", "Rules"], ["existing", "Existing offer & reservation reminders"] ] as const).map(([id, label]) => <button type="button" key={id} aria-pressed={reminderSection === id} onClick={() => setReminderSection(id)}>{label}</button>)}
        </div>
        <div hidden={reminderSection !== "work"}>
          {!reminderWork ? <ReminderWorkList active={part("reminders").shown && reminderSection === "work"} open={(work, add) => { setReminderAdd(!!add); setReminderWork(work); }} /> : <ReminderWorkDetail work={reminderWork} active={part("reminders").shown && reminderSection === "work"} portalUrl={portalUrl} autoAdd={reminderAdd} back={() => setReminderWork(null)}
            openMessage={event => go({ panel: "email-templates", tab: "portal", app: null, event })} openBroadcast={() => go({ panel: "broadcast", tab: null, app: null })} openWhatsappHistory={() => go({ panel: "whatsapp-queue", tab: "history", app: null })} />}
        </div>
        <div hidden={reminderSection !== "rules"}><ReminderDrafts active={part("reminders").shown && reminderSection === "rules"} openSource={source => source === 'broadcast' ? go({ panel: 'broadcast', tab: null, app: null }) : go({ panel: 'email-templates', tab: 'portal', app: null, event: 'plan.started' })} /></div>
        <div hidden={reminderSection !== "activity"}>
          <ReminderHistory active={part("reminders").shown && reminderSection === "activity"} />
          <LegacyReminderHistory source="all" defaultOpen active={part("reminders").shown && reminderSection === "activity"} title="Offer and reservation message history" openAction={event => go({ panel: "email-templates", tab: "portal", app: null, event })} />
        </div>
        <div hidden={reminderSection !== "existing"}>
          <p>Existing reminder schedules continue to follow each offer&apos;s saved agreement and the reservation system. This is not a complete schedule of upcoming reminders.</p>
          <p><button type="button" className={s.link} onClick={() => go({ panel: "email-templates", tab: "portal", app: null, event: "offer.payment.reminder" })}>Offer payment reminder settings →</button></p>
          <p><button type="button" className={s.link} onClick={() => go({ panel: "email-templates", tab: "portal", app: null, event: "offer.reservation.reminder" })}>Reservation reminder message →</button></p>
          <p><button type="button" className={s.link} onClick={() => go({ panel: "whatsapp-queue", tab: "history", app: null })}>WhatsApp delivery history →</button></p>
          <OfferPaymentReminders portalUrl={portalUrl} active={part("reminders").shown && reminderSection === "existing"} openAction={() => go({ panel: "email-templates", tab: "portal", app: null, event: "offer.payment.reminder" })} />
          <LegacyReminderHistory source="all" active={part("reminders").shown && reminderSection === "existing"} title="All existing reminder message history" openAction={event => go({ panel: "email-templates", tab: "portal", app: null, event })} />
          <ReservationPanel active={part("reminders").shown && reminderSection === "existing"} portalUrl={portalUrl} openAction={event => go({ panel: "email-templates", tab: "portal", app: null, event })} />
        </div>
      </section>],
      ["whatsapp-connection", <WhatsappPanel key="c" view="connection" active={part("whatsapp-connection").shown} />],
      ["whatsapp-queue:queue", <WhatsappPanel key="q" view="queue" active={part("whatsapp-queue:queue").shown} />],
      ["whatsapp-queue:rules", <WhatsappPanel key="r" view="rules" />],
      ["whatsapp-queue:history", <WhatsappPanel key="h" view="messages" show={historyShow} active={part("whatsapp-queue:history").shown} />],
    ];
    const emailParts: [string, React.ReactNode][] = apps.flatMap(app => [
      [`email-templates:${app}`, <EmailControlPanel workspace key={`t-${app}`} initialApplication={app} active={part(`email-templates:${app}`).shown} canManagePortal={portalAdmin} view="actions" showTabs={false} query={query} eventKey={view.event} onClearEvent={() => go({ ...view, event: null })} onOpenReminders={() => go({ panel: 'reminders', tab: null, app: null })} />],
      [`email-review:${app}`, <EmailControlPanel workspace key={`r-${app}`} initialApplication={app} active={part(`email-review:${app}`).shown} canManagePortal={portalAdmin} view={(view.panel === "email-review" ? view.tab : "review") as EmailView} showTabs={false} onReviewCount={app === "website" ? websiteReview : portalReview} />],
    ] as [string, React.ReactNode][]);
    return <>
      {open?.whatsapp && !portalAdmin && <div className={s.locked}><span>Portal admin only</span><p>WhatsApp can be managed only by an admin who is also a portal admin.</p></div>}
      {(portalAdmin ? [...whatsappParts, ...emailParts] : emailParts).map(([key, node]) => part(key).mount && <div key={key} hidden={!part(key).shown}>{node}</div>)}
    </>;
  }

  return <div className={s.hub}>
    {!open && <>
      <div className={s.quickActions}>
        <button type="button" className={s.quickCard} onClick={() => go({ panel: "broadcast", tab: null, app: null })}><strong>Send a broadcast</strong><span>Reach a selected group →</span></button>
        <button type="button" className={s.quickCard} onClick={() => go({ panel: "email-templates", tab: null, app: null })}><strong>Automatic messages</strong><span>Find an action and manage its message →</span></button>
        <button type="button" className={s.quickCard} onClick={() => go({ panel: "reminders", tab: null, app: null })}><strong>Reminders</strong><span>View rules and reminder activity →</span></button>
      </div>
    <div className={s.overview}>
      <section className={s.card} aria-labelledby="attention-title">
        <header className={s.cardHeader}><h2 id="attention-title">Needs attention</h2></header>
        {!attentionReady ? <Loader label="Checking…" /> : !attention.length ? <p className={s.allGood}>✓ Nothing needs attention.</p>
          : <ul className={s.attention}>{attention.map(item => <li key={item.text}>
              <span className={s.attentionText}>{item.text}</span>
              <button type="button" className={s.link} onClick={() => go(item.open)}>{item.link} →</button>
            </li>)}</ul>}
      </section>

      <section className={s.card} aria-labelledby="activity-title">
        <header className={s.cardHeader}>
          <h2 id="activity-title">Recent activity</h2>
          <span className={s.cardLinks}>
            <button type="button" className={s.link} onClick={() => go({ panel: "email-review", tab: "history", app: null })}>Email history →</button>
            {portalAdmin && <button type="button" className={s.link} onClick={() => go({ panel: "whatsapp-queue", tab: "history", app: null })}>WhatsApp history →</button>}
          </span>
        </header>
        {!activityReady ? <Loader label="Loading recent messages…" /> : !activity.length ? <p className={s.allGood}>No emails or WhatsApp messages yet.</p>
          : <ul className={s.activity}>{activity.map(row => <li key={row.id}>
              <button type="button" onClick={() => go(row.open)}>
                <span className={s.channel} aria-label={row.channel === "email" ? "Email" : "WhatsApp"}>{row.channel === "email" ? "✉" : "💬"}</span>
                <span className={s.status} data-tone={row.tone}>{row.status}</span>
                <span className={s.subject}>{row.subject}</span>
                <span className={s.to}>→ {row.to || "—"}</span>
                <span className={s.when}>{when(row.at)}</span>
              </button>
            </li>)}</ul>}
      </section>
    </div>

    </>}
    {mounted.size > 0 && <section className={s.workspace} hidden={!open} aria-label={open?.title}>
      {open && view.panel && <>
        <header className={s.workspaceHeader}><div><h2>{open.title}</h2><p>{open.description}</p></div></header>
        {(["email-review", "whatsapp-queue", "business-activity"].includes(view.panel) && !(view.panel === "whatsapp-queue" && view.tab === "rules")) && <div className={s.subNav} aria-label="Review and delivery sections">
          <button type="button" aria-pressed={view.panel === "email-review"} onClick={() => go({ panel: "email-review", tab: null, app: null })}>Email review & history</button>
          {portalAdmin && <><button type="button" aria-pressed={view.panel === "whatsapp-queue"} onClick={() => go({ panel: "whatsapp-queue", tab: null, app: null })}>WhatsApp queue & history</button><button type="button" aria-pressed={view.panel === "business-activity"} onClick={() => go({ panel: "business-activity", tab: null, app: null })}>Business activity</button></>}
        </div>}
        {(["whatsapp-connection", "auto-reply", "final-message", "reservation"].includes(view.panel) || (view.panel === "whatsapp-queue" && view.tab === "rules")) && <div className={s.subNav} aria-label="Workflows and settings sections">
          {([ ["whatsapp-connection", "Connection"], ["whatsapp-queue", "Sending rules"], ["auto-reply", "Auto Reply"], ["final-message", "Final Message"], ["reservation", "Reservations"] ] as const).map(([id, label]) => <button key={id} type="button" aria-pressed={view.panel === id} disabled={!portalAdmin} onClick={() => go({ panel: id, tab: id === "whatsapp-queue" ? "rules" : null, app: null })}>{label}</button>)}
        </div>}
        {(open.tabs.length > 0 || view.panel === "email-review") && <div className={s.tabBar}>
          {view.panel === "email-review" && portalAdmin && <div className={s.switch} role="group" aria-label="Application">{APPS.map(app => <button key={app.id} type="button" aria-pressed={view.app === app.id} onClick={() => go({ ...view, app: app.id })}>{app.label}</button>)}</div>}
          <div className={s.tabs} role="tablist" aria-label={`${open.title} sections`}>{open.tabs.map(tab => <button key={tab.id} type="button" role="tab" aria-selected={view.tab === tab.id} disabled={view.panel === "email-templates" && tab.id === "portal" && !portalAdmin} onClick={() => go({ ...view, tab: tab.id, show: null, event: null })}>{tab.label}</button>)}</div>
          {view.panel === "email-templates" && <input className={s.search} type="search" aria-label="Find a message" placeholder="Find a message" value={query} onChange={event => setQuery(event.target.value)} />}
        </div>}
      </>}
      <div className={s.workspaceBody}>{body()}</div>
    </section>}
  </div>;
}
