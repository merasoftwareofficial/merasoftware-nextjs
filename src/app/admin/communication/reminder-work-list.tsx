"use client";
import { useState } from "react";
import { formatIndiaDateTime } from "@/lib/date-time";
import s from "./communication.module.css";
import { WORKS, WORK_INFO, statusLine, useReminderSummary, type Work } from "./reminder-work-info";

export function ReminderWorkList({ active, open }: { active: boolean; open: (work: Work, add?: boolean) => void }) {
  const [adding, setAdding] = useState(false);
  const { summary, error } = useReminderSummary(active);
  return <section aria-label="Reminders by work">
    <h3>Choose a work</h3>
    <button type="button" className="admin-action" onClick={() => setAdding(value => !value)}>Add Reminder</button>
    {adding && <div role="region" aria-label="Choose work for new reminder"><p>Choose where the reminder belongs.</p>
      {WORKS.map(id => <p key={id}><button type="button" onClick={() => open(id, WORK_INFO[id].canAdd)}>{WORK_INFO[id].title}</button> {WORK_INFO[id].addNote}</p>)}
    </div>}
    <p>Open a work to see its messages, timing and customers. Counts are a snapshot of saved schedules, not a promise that a message will be sent: eligibility is checked again before sending.</p>
    {summary?.legacyAsOf && <p>Offer and reservation counts as of {formatIndiaDateTime(summary.legacyAsOf)} (IST).</p>}
    {error && <p role="status">Reminder summary is unavailable. Open a work to see its current details.</p>}
    {WORKS.map(id => {
      const line = statusLine(id, summary);
      return <article className={s.quickCard} key={id}><strong>{WORK_INFO[id].title}</strong><span>{WORK_INFO[id].description}</span>
        {line && <span>{line}</span>}
        <button type="button" onClick={() => open(id)}>Open →</button></article>;
    })}
  </section>;
}
