"use client";
import { useState } from "react";
import { formatIndiaDateTime } from "@/lib/date-time";
import s from "./communication.module.css";
import { InfoTip } from "./reminder-info";
import { ReminderForm } from "./reminder-form";
import { WORKS, WORK_INFO, statusLine, useReminderSummary, type Work } from "./reminder-work-info";

export function ReminderWorkList({ active, open }: { active: boolean; open: (work: Work) => void }) {
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState("");
  const { summary, error } = useReminderSummary(active);
  return <section aria-label="Reminders by work" className={s.workSection}>
    <div className={s.workToolbar}>
      <h3>Reminders</h3>
      <InfoTip label="Reminders">
        <p>Counts are a snapshot of saved schedules, not a promise that a message will be sent. Eligibility is checked again before sending.</p>
        {summary?.legacyAsOf && <p>Offer and reservation counts as of {formatIndiaDateTime(summary.legacyAsOf)} (IST).</p>}
      </InfoTip>
      <button type="button" className="admin-action" onClick={() => { setNotice(""); setAdding(true); }}>Add Reminder</button>
    </div>
    {notice && <p role="status">{notice}</p>}
    {adding && <ReminderForm onClose={() => setAdding(false)} onSaved={message => { setAdding(false); setNotice(message); }} />}
    {error && <p role="status">Summary unavailable. Open a work to see its details.</p>}
    <ul className={s.workList}>
      {WORKS.map(id => <li key={id}>
        <button type="button" className={s.workRow} onClick={() => open(id)}>
          <span className={s.workName}>{WORK_INFO[id].title}</span>
          <span className={s.workListStatus}>{statusLine(id, summary)}</span>
          <span className={s.workChevron} aria-hidden="true">›</span>
        </button>
      </li>)}
    </ul>
  </section>;
}
