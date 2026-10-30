"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { EmailControlPanel, type EmailView } from "@/app/admin/email-control/email-control-panel";
import { Loader } from "@/app/admin/email-control/loader";
import { connectionLabel, type HistoryGroup, message, phoneLabel, WhatsappPanel, whatsappApi } from "@/app/admin/whatsapp/whatsapp-panel";
import { formatIndiaDate, indiaDayKey } from "@/lib/date-time";
import { emailControlApi } from "@/lib/email-control-client";
import type { Application, EmailSummary } from "@/lib/email-control-types";
import type { WhatsappQueuePage, WhatsappQueueStatus, WhatsappStatus } from "@/lib/whatsapp-types";
import s from "./communication.module.css";
import { BroadcastPanel } from "./broadcast-panel";

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
export type HubState = { panel: string | null; tab: string | null; app: string | null; show?: string | null };
type PanelId = "whatsapp-connection" | "whatsapp-queue" | "broadcast" | "email-templates" | "email-review";
type Tab = { id: string; label: string };
type Panel = { group: "WhatsApp" | "Email"; title: string; description: string; tabs: Tab[]; whatsapp: boolean };
const APPS: Tab[] = [{ id: "website", label: "Website" }, { id: "portal", label: "Portal" }];
const PANELS: Record<PanelId, Panel> = {
  "broadcast": { group: "WhatsApp", title: "Broadcast", whatsapp: true, tabs: [], description: "Choose a lead group, write or reuse a message, and send through the WhatsApp queue." },
  "whatsapp-connection": { group: "WhatsApp", title: "WhatsApp Connection", whatsapp: true, tabs: [],
    description: "The linked number: connection, QR code, pause and unlink." },
  "whatsapp-queue": { group: "WhatsApp", title: "WhatsApp Queue", whatsapp: true,
    tabs: [{ id: "queue", label: "Queue" }, { id: "rules", label: "Sending rules" }, { id: "history", label: "History" }],
    description: "Messages waiting to go, the rules that pace them, and every finished message." },
  "email-templates": { group: "Email", title: "Email Templates", whatsapp: false, tabs: APPS,
    description: "Each job’s mails: who decides, the default template and the editor. WhatsApp sends the same text." },
  "email-review": { group: "Email", title: "Email Review", whatsapp: false,
    tabs: [{ id: "review", label: "Review" }, { id: "outbox", label: "Outbox" }, { id: "history", label: "History" }],
    description: "Mails waiting for Send / Don’t send, the Outbox and every decision." },
};
const IDS = Object.keys(PANELS) as PanelId[];
type View = { panel: PanelId | null; tab: string; app: Application; show: HistoryGroup | null };

function normalize(state: HubState, portalAdmin: boolean): View {
  const panel = IDS.find(id => id === state.panel) ?? null;
  const tabs = panel ? PANELS[panel].tabs : [];
  let tab = tabs.find(item => item.id === state.tab)?.id ?? tabs[0]?.id ?? "";
  if (panel === "email-templates" && tab === "portal" && !portalAdmin) tab = "website";
  const show = panel === "whatsapp-queue" && tab === "history" && state.show === "not-sent" ? "not-sent" : null;
  return { panel, tab, app: state.app === "portal" && portalAdmin ? "portal" : "website", show };
}
function href(view: View) {
  if (!view.panel) return "/admin/communication";
  const params = new URLSearchParams({ panel: view.panel });
  if (view.tab && view.tab !== PANELS[view.panel].tabs[0]?.id) params.set("tab", view.tab);
  if (view.panel === "email-review" && view.app === "portal") params.set("app", "portal");
  if (view.show) params.set("show", view.show);
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

export function CommunicationHub({ portalAdmin, initial }: { portalAdmin: boolean; initial: HubState }) {
  const [view, setView] = useState(() => normalize(initial, portalAdmin));
  const [mounted, setMounted] = useState(() => new Set(view.panel ? [partOf(view)] : []));
  const [historyShow, setHistoryShow] = useState<HistoryGroup>(view.show ?? "sent");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<WhatsappStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [summary, setSummary] = useState<Partial<Record<Application, EmailSummary>>>({});
  const [summaryFailed, setSummaryFailed] = useState(false);
  const [whatsappRecent, setWhatsappRecent] = useState<WhatsappQueuePage | null>(null);
  const drawer = useRef<HTMLElement>(null);
  const apps: Application[] = portalAdmin ? ["website", "portal"] : ["website"];

  const go = useCallback((next: HubState, push = true) => {
    const value = normalize(next, portalAdmin);
    setView(value);
    if (value.panel) setMounted(current => current.has(partOf(value)) ? current : new Set(current).add(partOf(value)));
    if (value.panel === "whatsapp-queue" && value.tab === "history") setHistoryShow(value.show ?? "sent");
    if (push) window.history.pushState(null, "", href(value));
  }, [portalAdmin]);
  const close = useCallback(() => go({ panel: null, tab: null, app: null }), [go]);

  // Back / Forward move between panels like pages.
  useEffect(() => {
    const onPop = () => {
      const params = new URLSearchParams(window.location.search);
      go({ panel: params.get("panel"), tab: params.get("tab"), app: params.get("app"), show: params.get("show") }, false);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [go]);

  // An open panel: focus it, hold the page still, and close on Esc (an open email dialog takes Esc first).
  useEffect(() => {
    if (!view.panel) return;
    drawer.current?.focus();
    const page = document.documentElement, overflow = page.style.overflow;
    page.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape" && !document.querySelector("dialog[open]")) close(); };
    document.addEventListener("keydown", onKey);
    return () => { page.style.overflow = overflow; document.removeEventListener("keydown", onKey); };
  }, [view.panel, close]);

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

  // Email counts and the last decisions: when the page opens and whenever a panel closes.
  useEffect(() => {
    if (view.panel) return;
    const controller = new AbortController();
    Promise.all((portalAdmin ? ["website", "portal"] as const : ["website"] as const).map(app => emailControlApi<EmailSummary>(app, "/summary", "GET", undefined, controller.signal)))
      .then(rows => { if (!controller.signal.aborted) { setSummary(Object.fromEntries(rows.map(row => [row.application, row]))); setSummaryFailed(false); } })
      .catch(() => { if (!controller.signal.aborted) setSummaryFailed(true); });
    return () => controller.abort();
  }, [portalAdmin, view.panel]);
  // A review list that loads keeps the Email Review count current.
  const reviewCount = useCallback((app: Application, count: number) => setSummary(current => {
    const row = current[app];
    return row && row.review !== count ? { ...current, [app]: { ...row, review: count } } : current;
  }), []);
  const websiteReview = useCallback((count: number) => reviewCount("website", count), [reviewCount]);
  const portalReview = useCallback((count: number) => reviewCount("portal", count), [reviewCount]);

  const emailReady = apps.every(app => summary[app]);
  const emailTotal = (key: "review" | "actions") => emailReady ? apps.reduce((total, app) => total + summary[app]![key], 0) : null;
  const whatsappLine = (line: (status: WhatsappStatus) => string) => !portalAdmin ? "Portal admin only" : status ? line(status) : statusError ? "Unavailable" : null;
  const emailLine = (key: "review" | "actions", word: string) => { const total = emailTotal(key); return total !== null ? `${total.toLocaleString("en-IN")} ${word}` : summaryFailed ? "—" : null; };
  const connected = !!status?.enabled && status.workerRunning && status.connection === "connected" && !status.paused;
  const waiting = status ? status.counts.pending + status.counts.sending : 0;
  const BOX_LINES: Record<PanelId, { line: string | null; tone?: "ok" | "warn" }> = {
    "broadcast": { line: portalAdmin ? "Lead groups · saved messages" : "Portal admin only" },
    "whatsapp-connection": { line: whatsappLine(row => `${connectionLabel(row)}${row.paused ? " · paused" : ""}${row.phone ? ` · ${phoneLabel(row.phone)}` : ""}`), tone: status ? connected ? "ok" : "warn" : undefined },
    "whatsapp-queue": { line: whatsappLine(() => `${waiting.toLocaleString("en-IN")} waiting`) },
    "email-templates": { line: emailLine("actions", "messages") },
    "email-review": { line: emailLine("review", "waiting"), tone: (emailTotal("review") ?? 0) > 0 ? "warn" : undefined },
  };

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
      ["whatsapp-connection", <WhatsappPanel key="c" view="connection" active={part("whatsapp-connection").shown} />],
      ["whatsapp-queue:queue", <WhatsappPanel key="q" view="queue" active={part("whatsapp-queue:queue").shown} />],
      ["whatsapp-queue:rules", <WhatsappPanel key="r" view="rules" />],
      ["whatsapp-queue:history", <WhatsappPanel key="h" view="messages" show={historyShow} active={part("whatsapp-queue:history").shown} />],
    ];
    const emailParts: [string, React.ReactNode][] = apps.flatMap(app => [
      [`email-templates:${app}`, <EmailControlPanel key={`t-${app}`} initialApplication={app} canManagePortal={portalAdmin} view="actions" showTabs={false} query={query} />],
      [`email-review:${app}`, <EmailControlPanel key={`r-${app}`} initialApplication={app} canManagePortal={portalAdmin} view={(view.panel === "email-review" ? view.tab : "review") as EmailView} showTabs={false} onReviewCount={app === "website" ? websiteReview : portalReview} />],
    ] as [string, React.ReactNode][]);
    return <>
      {open?.whatsapp && !portalAdmin && <div className={s.locked}><span>Portal admin only</span><p>WhatsApp can be managed only by an admin who is also a portal admin.</p></div>}
      {(portalAdmin ? [...whatsappParts, ...emailParts] : emailParts).map(([key, node]) => part(key).mount && <div key={key} hidden={!part(key).shown}>{node}</div>)}
    </>;
  }

  return <div className={s.hub}>
    <nav className={s.boxes} aria-label="Communication">
      {IDS.map(id => {
        const { line, tone } = BOX_LINES[id];
        return <button key={id} type="button" className={s.box} data-tone={tone} disabled={PANELS[id].whatsapp && !portalAdmin} onClick={() => go({ panel: id, tab: null, app: null })}>
          <span className={s.boxGroup} aria-hidden="true">{PANELS[id].group}</span>
          <span className={s.boxTitle}>{PANELS[id].title}</span>
          <span className={s.boxLine}>{line ?? <Loader inline />}</span>
        </button>;
      })}
    </nav>

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

    {mounted.size > 0 && <div className={s.drawerLayer} hidden={!open}>
      <div className={s.backdrop} onClick={close} aria-hidden="true" />
      <aside ref={drawer} className={s.drawer} role="dialog" aria-modal="true" aria-labelledby="communication-panel-title" tabIndex={-1}>
        {open && view.panel && <>
          <header className={s.drawerHeader}>
            <div><h2 id="communication-panel-title">{open.title}</h2><p>{open.description}</p></div>
            <button type="button" className="admin-action" onClick={close}>Close</button>
          </header>
          {(open.tabs.length > 0 || view.panel === "email-review") && <div className={s.tabBar}>
            {view.panel === "email-review" && portalAdmin && <div className={s.switch} role="group" aria-label="Application">
              {APPS.map(app => <button key={app.id} type="button" aria-pressed={view.app === app.id} onClick={() => go({ ...view, app: app.id })}>{app.label}</button>)}
            </div>}
            <div className={s.tabs} role="tablist" aria-label={`${open.title} sections`}>
              {open.tabs.map(tab => <button key={tab.id} type="button" role="tab" aria-selected={view.tab === tab.id} disabled={view.panel === "email-templates" && tab.id === "portal" && !portalAdmin} onClick={() => go({ ...view, tab: tab.id, show: null })}>{tab.label}</button>)}
            </div>
            {view.panel === "email-templates" && <input className={s.search} type="search" aria-label="Find a message" placeholder="Find a message" value={query} onChange={event => setQuery(event.target.value)} />}
          </div>}
        </>}
        <div className={s.drawerBody}>{body()}</div>
      </aside>
    </div>}
  </div>;
}
