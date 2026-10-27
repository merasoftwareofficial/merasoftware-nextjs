"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { EmailControlPanel, type EmailView } from "@/app/admin/email-control/email-control-panel";
import { Loader } from "@/app/admin/email-control/loader";
import { connectionLabel, message, phoneLabel, WhatsappPanel, whatsappApi } from "@/app/admin/whatsapp/whatsapp-panel";
import { emailControlApi } from "@/lib/email-control-client";
import type { Application, EmailSummary } from "@/lib/email-control-types";
import type { WhatsappStatus } from "@/lib/whatsapp-types";
import s from "./communication.module.css";

/**
 * Communication: four boxes that only navigate, each opening its panel over the page. A panel opens in
 * the browser at once (no server render): its tabs, headings and fields are drawn immediately and only
 * live data loads, with a small loader in its place. A panel once opened stays ready (hidden, not
 * refreshing) so opening it again is instant. The URL follows (?panel=…&tab=…&app=…) for links and Back.
 * Live data on the boxes: WhatsApp /status (every 5 s, only while no panel is open) and the email
 * /summary counts (when the page opens and whenever a panel closes).
 */
export type HubState = { panel: string | null; tab: string | null; app: string | null };
type PanelId = "whatsapp-connection" | "whatsapp-queue" | "email-templates" | "email-review";
type Tab = { id: string; label: string };
type Panel = { group: "WhatsApp" | "Email"; title: string; description: string; tabs: Tab[]; whatsapp: boolean };
const APPS: Tab[] = [{ id: "website", label: "Website" }, { id: "portal", label: "Portal" }];
const PANELS: Record<PanelId, Panel> = {
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
type View = { panel: PanelId | null; tab: string; app: Application };

function normalize(state: HubState, portalAdmin: boolean): View {
  const panel = IDS.find(id => id === state.panel) ?? null;
  const tabs = panel ? PANELS[panel].tabs : [];
  let tab = tabs.find(item => item.id === state.tab)?.id ?? tabs[0]?.id ?? "";
  if (panel === "email-templates" && tab === "portal" && !portalAdmin) tab = "website";
  return { panel, tab, app: state.app === "portal" && portalAdmin ? "portal" : "website" };
}
function href(view: View) {
  if (!view.panel) return "/admin/communication";
  const params = new URLSearchParams({ panel: view.panel });
  if (view.tab && view.tab !== PANELS[view.panel].tabs[0]?.id) params.set("tab", view.tab);
  if (view.panel === "email-review" && view.app === "portal") params.set("app", "portal");
  return `/admin/communication?${params}`;
}
// Which mounted part a view shows: one per tab, or one per application for the email panels.
function partOf(view: View) {
  if (!view.panel) return "";
  if (view.panel === "email-review") return `email-review:${view.app}`;
  return view.tab ? `${view.panel}:${view.tab}` : view.panel;
}

export function CommunicationHub({ portalAdmin, initial }: { portalAdmin: boolean; initial: HubState }) {
  const [view, setView] = useState(() => normalize(initial, portalAdmin));
  const [mounted, setMounted] = useState(() => new Set(view.panel ? [partOf(view)] : []));
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<WhatsappStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [summary, setSummary] = useState<Partial<Record<Application, EmailSummary>>>({});
  const [summaryFailed, setSummaryFailed] = useState(false);
  const drawer = useRef<HTMLElement>(null);
  const apps: Application[] = portalAdmin ? ["website", "portal"] : ["website"];

  const go = useCallback((next: HubState, push = true) => {
    const value = normalize(next, portalAdmin);
    setView(value);
    if (value.panel) setMounted(current => current.has(partOf(value)) ? current : new Set(current).add(partOf(value)));
    if (push) window.history.pushState(null, "", href(value));
  }, [portalAdmin]);
  const close = useCallback(() => go({ panel: null, tab: null, app: null }), [go]);

  // Back / Forward move between panels like pages.
  useEffect(() => {
    const onPop = () => { const params = new URLSearchParams(window.location.search); go({ panel: params.get("panel"), tab: params.get("tab"), app: params.get("app") }, false); };
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

  // WhatsApp status for the boxes: only while no panel is open (the panels refresh their own data).
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

  // Email counts for the boxes: when the page opens and whenever a panel closes.
  useEffect(() => {
    if (view.panel) return;
    const controller = new AbortController();
    Promise.all((portalAdmin ? ["website", "portal"] as const : ["website"] as const).map(app => emailControlApi<EmailSummary>(app, "/summary", "GET", undefined, controller.signal)))
      .then(rows => { if (!controller.signal.aborted) { setSummary(Object.fromEntries(rows.map(row => [row.application, row]))); setSummaryFailed(false); } })
      .catch(() => { if (!controller.signal.aborted) setSummaryFailed(true); });
    return () => controller.abort();
  }, [portalAdmin, view.panel]);
  // A review list that loads keeps the Email Review box's count current.
  const reviewCount = useCallback((app: Application, count: number) => setSummary(current => {
    const row = current[app];
    return row && row.review !== count ? { ...current, [app]: { ...row, review: count } } : current;
  }), []);
  const websiteReview = useCallback((count: number) => reviewCount("website", count), [reviewCount]);
  const portalReview = useCallback((count: number) => reviewCount("portal", count), [reviewCount]);

  const emailTotal = (key: "review" | "actions") => apps.every(app => summary[app]) ? apps.reduce((total, app) => total + summary[app]![key], 0) : null;
  const whatsappLine = (line: (status: WhatsappStatus) => string) => !portalAdmin ? "Portal admin only" : status ? line(status) : statusError ? "Unavailable" : null;
  const emailLine = (key: "review" | "actions", word: string) => { const total = emailTotal(key); return total !== null ? `${total.toLocaleString("en-IN")} ${word}` : summaryFailed ? "—" : null; };
  const connected = !!status?.enabled && status.workerRunning && status.connection === "connected" && !status.paused;
  const waiting = status ? status.counts.pending + status.counts.sending : 0;
  const reviewTotal = emailTotal("review") ?? 0;
  const BOX_LINES: Record<PanelId, { line: string | null; tone?: "ok" | "warn" }> = {
    "whatsapp-connection": { line: whatsappLine(row => `${connectionLabel(row)}${row.paused ? " · paused" : ""}${row.phone ? ` · ${phoneLabel(row.phone)}` : ""}`), tone: status ? connected ? "ok" : "warn" : undefined },
    "whatsapp-queue": { line: whatsappLine(() => `${waiting.toLocaleString("en-IN")} waiting`) },
    "email-templates": { line: emailLine("actions", "messages") },
    "email-review": { line: emailLine("review", "waiting"), tone: reviewTotal > 0 ? "warn" : undefined },
  };

  const open = view.panel ? PANELS[view.panel] : null;
  const current = partOf(view);
  const part = (key: string) => ({ mount: mounted.has(key), shown: !!view.panel && current === key });

  function body() {
    const whatsappParts: [string, React.ReactNode][] = [
      ["whatsapp-connection", <WhatsappPanel key="c" view="connection" active={part("whatsapp-connection").shown} />],
      ["whatsapp-queue:queue", <WhatsappPanel key="q" view="queue" active={part("whatsapp-queue:queue").shown} />],
      ["whatsapp-queue:rules", <WhatsappPanel key="r" view="rules" />],
      ["whatsapp-queue:history", <WhatsappPanel key="h" view="messages" active={part("whatsapp-queue:history").shown} />],
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
    {(["WhatsApp", "Email"] as const).map(group => <section key={group} className={s.group} aria-labelledby={`group-${group}`}>
      <h2 id={`group-${group}`}>{group}</h2>
      <div className={s.boxes}>
        {IDS.filter(id => PANELS[id].group === group).map(id => {
          const { line, tone } = BOX_LINES[id];
          return <button key={id} type="button" className={s.box} data-tone={tone} disabled={PANELS[id].whatsapp && !portalAdmin} onClick={() => go({ panel: id, tab: null, app: null })}>
            <span className={s.boxTitle}>{PANELS[id].title}</span>
            <span className={s.boxLine}>{line ?? <Loader inline />}</span>
          </button>;
        })}
      </div>
    </section>)}

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
              {open.tabs.map(tab => <button key={tab.id} type="button" role="tab" aria-selected={view.tab === tab.id} disabled={view.panel === "email-templates" && tab.id === "portal" && !portalAdmin} onClick={() => go({ ...view, tab: tab.id })}>{tab.label}</button>)}
            </div>
            {view.panel === "email-templates" && <input className={s.search} type="search" aria-label="Find a message" placeholder="Find a message" value={query} onChange={event => setQuery(event.target.value)} />}
          </div>}
        </>}
        <div className={s.drawerBody}>{body()}</div>
      </aside>
    </div>}
  </div>;
}
