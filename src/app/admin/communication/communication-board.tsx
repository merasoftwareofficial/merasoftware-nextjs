"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "@/components/link";
import { EmailControlPanel } from "@/app/admin/email-control/email-control-panel";
import { connectionLabel, message, phoneLabel, whatsappApi } from "@/app/admin/whatsapp/whatsapp-panel";
import type { WhatsappStatus } from "@/lib/whatsapp-types";
import s from "./communication.module.css";

type Filter = "all" | "website" | "portal";
type Card = { panel: string; label: string; value: string; note: string; tone?: "ok" | "warn" | "bad" };
const count = (value: number) => value.toLocaleString("en-IN");

/**
 * The Communication control panel: a status bar (each card opens its side panel), then every
 * job that sends mail, Website and Portal in one list. The email panels own their data and
 * report only their review count here; the status bar reads WhatsApp's /status alone, so
 * the page polls one endpoint (every 5 s while visible), like the old WhatsApp number page.
 */
export function CommunicationBoard({ portalAdmin, openPanel }: { portalAdmin: boolean; openPanel: string | null }) {
  // Closing the review panel reloads the lists, so the review count matches the decisions just made.
  const [lastPanel, setLastPanel] = useState(openPanel);
  const [reload, setReload] = useState(0);
  if (lastPanel !== openPanel) { setLastPanel(openPanel); if (lastPanel === "review") setReload(value => value + 1); }
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [review, setReview] = useState<{ website?: number; portal?: number }>({});
  const [status, setStatus] = useState<WhatsappStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const websiteReview = useCallback((value: number) => setReview(current => ({ ...current, website: value })), []);
  const portalReview = useCallback((value: number) => setReview(current => ({ ...current, portal: value })), []);

  useEffect(() => {
    if (!portalAdmin) return; // WhatsApp is managed by portal admins only (proxy and backend)
    const controller = new AbortController();
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      whatsappApi<WhatsappStatus>("status", "GET", controller.signal)
        .then(data => { if (!controller.signal.aborted) { setStatus(data); setStatusError(null); } })
        .catch(error => { if (!controller.signal.aborted) setStatusError(message(error, "Could not load WhatsApp status.")); });
    };
    const first = setTimeout(refresh, 0);
    const timer = setInterval(refresh, 5000);
    return () => { controller.abort(); clearTimeout(first); clearInterval(timer); };
  }, [portalAdmin]);

  const reviewKnown = review.website !== undefined && (!portalAdmin || review.portal !== undefined);
  const reviewTotal = (review.website ?? 0) + (review.portal ?? 0);
  const whatsappValue = (value: (status: WhatsappStatus) => string) => !portalAdmin ? "Portal admin only" : status ? value(status) : statusError ? "Unavailable" : "…";
  const connected = status?.enabled && status.workerRunning && status.connection === "connected";
  const cards: Card[] = [
    { panel: "whatsapp", label: "WhatsApp", value: whatsappValue(connectionLabel), note: status?.phone ? `${phoneLabel(status.phone)}${status.paused ? " · paused" : ""}` : "Number and sending rules",
      tone: !status ? undefined : connected && !status.paused ? "ok" : "warn" },
    { panel: "queue", label: "Waiting to send", value: whatsappValue(row => count(row.counts.pending + row.counts.sending)), note: status ? `WhatsApp · sent today ${count(status.sentToday)}` : "WhatsApp queue" },
    { panel: "review", label: "Email review", value: reviewKnown ? count(reviewTotal) : "…", note: "Waiting for Send / Don’t send · history", tone: reviewKnown && reviewTotal > 0 ? "warn" : undefined },
    { panel: "whatsapp-history", label: "WhatsApp not sent", value: whatsappValue(row => count(row.counts.failed)), note: "Failed, can be sent again · history",
      tone: status && status.counts.failed > 0 ? "bad" : undefined },
  ];

  return <div className={s.board}>
    <nav className={s.cards} aria-label="Communication status">
      {cards.map(card => <Link key={card.panel} href={`/admin/communication?panel=${card.panel}`} scroll={false} className={s.card} data-tone={card.tone}>
        <span className={s.cardLabel}>{card.label}</span>
        <strong className={s.cardValue}>{card.value}</strong>
        <span className={s.cardNote}>{card.note}</span>
      </Link>)}
    </nav>
    {statusError && <p className={s.error} role="alert">{statusError}</p>}

    <div className={s.toolbar}>
      <label className={s.search}><span>Find a message</span>
        <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="e.g. contact, project, invoice" />
      </label>
      <div className={s.filter} role="group" aria-label="Show messages from">
        {(["all", "website", "portal"] as const).map(value => <button key={value} type="button" aria-pressed={filter === value} disabled={value === "portal" && !portalAdmin} onClick={() => setFilter(value)}>
          {value === "all" ? "All" : value === "website" ? "Website" : "Portal"}
        </button>)}
      </div>
    </div>
    <p className={s.hint}>Each box is one job. Open it to set who decides (asks before sending, automatic or off) and to edit its templates. Every email that really goes out is also sent on WhatsApp with the same text.</p>

    {/* Both lists stay mounted (hidden by the filter) so their review counts stay known. */}
    <div hidden={filter === "portal"}><EmailControlPanel key={`website-${reload}`} initialApplication="website" canManagePortal={portalAdmin} view="actions" showTabs={false} query={query} onReviewCount={websiteReview} /></div>
    {portalAdmin
      ? <div hidden={filter === "website"}><EmailControlPanel key={`portal-${reload}`} initialApplication="portal" canManagePortal view="actions" showTabs={false} query={query} onReviewCount={portalReview} /></div>
      : <p className={s.hint}>Portal messages can be managed only by an admin who is also a portal admin.</p>}
  </div>;
}
