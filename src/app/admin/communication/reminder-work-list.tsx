"use client";
import { formatIndiaDateTime } from "@/lib/date-time";
import s from "./communication.module.css";
import { InfoTip } from "./reminder-info";
import { WORKS, WORK_INFO, statusLine, useReminderSummary, type Work } from "./reminder-work-info";

export function ReminderWorkList({ active, open, openActions }: { active: boolean; open: (work: Work) => void; openActions?: () => void }) {
  const { summary, error } = useReminderSummary(active);
  return <section aria-label="Reminders by work" className={s.workSection}>
    <div className={s.workToolbar}>
      <h3>Reminders</h3>
      <InfoTip label="Reminders">
        <p>Counts are a snapshot of saved schedules, not a promise that a message will be sent. Eligibility is checked again before sending.</p>
        {summary?.legacyAsOf && <p>Offer and reservation counts as of {formatIndiaDateTime(summary.legacyAsOf)} (IST).</p>}
      </InfoTip>
      {openActions && <button type="button" className="admin-action" onClick={openActions}>Manage in Actions →</button>}
    </div>
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
