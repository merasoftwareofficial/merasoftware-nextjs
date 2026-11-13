"use client";
import styles from "../email-control/email-control.module.css";
import s from "./communication.module.css";
import { LegacyReminderHistory } from "./legacy-reminder-history";
import { OfferPaymentReminders } from "./offer-payment-reminders";
import { ReminderDrafts } from "./reminder-drafts";
import { ReminderHistory } from "./reminder-history";
import { WORK_INFO, statusLine, useReminderSummary, type Work } from "./reminder-work-info";
import { ReservationPanel } from "./reservation-panel";

// One reminder work, opened: what it is, its messages, when it goes and stops, then the controls and the
// customers. The lists below are the existing systems; nothing here recreates their data.
export function ReminderWorkDetail({ work, active, portalUrl, autoAdd, back, openMessage, openBroadcast, openWhatsappHistory }: {
  work: Work; active: boolean; portalUrl: string; autoAdd: boolean; back: () => void;
  openMessage: (event: string) => void; openBroadcast: () => void; openWhatsappHistory: () => void;
}) {
  const info = WORK_INFO[work];
  const { summary } = useReminderSummary(active);
  const line = statusLine(work, summary);
  const rule = work === "monthly_package" || work === "broadcast";
  return <section aria-label="Work reminders">
    <button type="button" className={s.link} onClick={back}>← All work</button>
    <h3>{info.title}</h3>
    {line && <p>{line}</p>}
    <section className={styles.section} aria-label="Messages">
      <h4>Messages</h4>
      {info.messagesNote && <p className={styles.muted}>{info.messagesNote}</p>}
      {info.messages.length > 0 && <div className={styles.actions}>{info.messages.map(([event, label]) => <button key={event} type="button" onClick={() => openMessage(event)}>{label} settings</button>)}</div>}
      {info.messages.length > 0 && <p className={styles.muted}>These open the message wording, channel and On/Off.</p>}
    </section>
    <section className={styles.section} aria-label="When reminders go">
      <h4>When reminders go</h4>
      <ul>{info.timing.map(text => <li key={text}>{text}</li>)}</ul>
    </section>
    <section className={styles.section} aria-label="When reminders stop">
      <h4>When they stop</h4>
      <ul>{info.stops.map(text => <li key={text}>{text}</li>)}</ul>
      <p className={styles.muted}>{info.individual}</p>
    </section>
    {rule && <ReminderDrafts active={active} source={work} autoAdd={autoAdd} openSource={source => source === "broadcast" ? openBroadcast() : openMessage("plan.started")} />}
    {rule && <ReminderHistory key={work} active={active} source={work} />}
    {work === "offer_payment" && <>
      <OfferPaymentReminders portalUrl={portalUrl} active={active} openAction={() => openMessage("offer.payment.reminder")} />
      <LegacyReminderHistory source="offer_payment" active={active} defaultOpen title="Offer payment message history" openAction={openMessage} />
    </>}
    {work === "reservation" && <>
      <ReservationPanel active={active} portalUrl={portalUrl} openAction={openMessage} />
      <LegacyReminderHistory source="reservation" active={active} defaultOpen title="Reservation message history" openAction={openMessage} />
      <LegacyReminderHistory source="package_request" active={active} defaultOpen title="Package start request message history" openAction={openMessage} />
    </>}
    <p><button type="button" className={s.link} onClick={openWhatsappHistory}>WhatsApp delivery history →</button></p>
  </section>;
}
