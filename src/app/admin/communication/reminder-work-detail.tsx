"use client";
import s from "./communication.module.css";
import { InfoTip } from "./reminder-info";
import { LegacyReminderHistory } from "./legacy-reminder-history";
import { OfferPaymentReminders } from "./offer-payment-reminders";
import { ReminderDrafts } from "./reminder-drafts";
import { ReminderHistory } from "./reminder-history";
import { WORK_INFO, statusLine, useReminderSummary, type Work } from "./reminder-work-info";
import { ReservationPanel } from "./reservation-panel";

// One reminder work, opened. Short facts in a plain list; the explanations sit in (i) popups. Below them, the
// existing data lists for this work (nothing here recreates their data).
export function ReminderWorkDetail({ work, active, portalUrl, back, openMessage, openBroadcast, openWhatsappHistory }: {
  work: Work; active: boolean; portalUrl: string; back: () => void;
  openMessage: (event: string) => void; openBroadcast: () => void; openWhatsappHistory: () => void;
}) {
  const info = WORK_INFO[work];
  const { summary } = useReminderSummary(active);
  const line = statusLine(work, summary);
  const rule = work === "monthly_package" || work === "broadcast";
  return <section aria-label="Work reminders" className={s.workSection}>
    <div><button type="button" className={s.link} onClick={back}>← All work</button></div>
    <div className={s.workToolbar}>
      <h3>{info.title}</h3>
      <InfoTip label={info.title}><p>{info.about}</p></InfoTip>
      {line && <span className={s.headStatus}>{line}</span>}
    </div>
    <dl className={s.facts}>
      <div className={s.factRow}>
        <dt>Messages</dt>
        <dd>{info.messages.length
          ? info.messages.map(([event, label]) => <button key={event} type="button" onClick={() => openMessage(event)}>{label} →</button>)
          : <span>Set in each step below</span>}</dd>
      </div>
      <div className={s.factRow}>
        <dt>Timing <InfoTip label="Timing"><ul>{info.timing.info.map(text => <li key={text}>{text}</li>)}</ul></InfoTip></dt>
        <dd><span>{info.timing.short}</span></dd>
      </div>
      <div className={s.factRow}>
        <dt>Stops <InfoTip label="Stops"><ul>{info.stops.info.map(text => <li key={text}>{text}</li>)}</ul></InfoTip></dt>
        <dd><span>{info.stops.short}</span></dd>
      </div>
      <div className={s.factRow}>
        <dt>Control <InfoTip label="Control"><p>{info.control.info}</p></InfoTip></dt>
        <dd><span>{info.control.short}</span></dd>
      </div>
      <div className={s.factRow}>
        <dt>WhatsApp</dt>
        <dd><button type="button" onClick={openWhatsappHistory}>Delivery history →</button></dd>
      </div>
    </dl>
    {rule && <ReminderDrafts compact active={active} source={work} openSource={source => source === "broadcast" ? openBroadcast() : openMessage("plan.started")} />}
    {rule && <ReminderHistory compact key={work} active={active} source={work} />}
    {work === "offer_payment" && <>
      <OfferPaymentReminders compact portalUrl={portalUrl} active={active} openAction={() => openMessage("offer.payment.reminder")} />
      <LegacyReminderHistory compact source="offer_payment" active={active} defaultOpen title="Message history" openAction={openMessage} />
    </>}
    {work === "reservation" && <>
      <ReservationPanel compact active={active} portalUrl={portalUrl} openAction={openMessage} />
      <LegacyReminderHistory compact source="reservation" active={active} defaultOpen title="Reservation message history" openAction={openMessage} />
      <LegacyReminderHistory compact source="package_request" active={active} defaultOpen title="Package start request history" openAction={openMessage} />
    </>}
  </section>;
}
