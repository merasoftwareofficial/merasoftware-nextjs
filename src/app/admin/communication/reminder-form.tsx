"use client";
import { useEffect, useState } from "react";
import styles from "../email-control/email-control.module.css";
import s from "./communication.module.css";
import { InfoTip } from "./reminder-info";

export type Step = { offsetDays: number; subject: string; text: string; channel: "whatsapp" | "email" | "both" };
export type RuleDraft = { _id: string; name: string; source: "monthly_package" | "broadcast"; enabled: boolean; steps: Step[]; revision: number };

const blankStep = (): Step => ({ offsetDays: 0, subject: "", text: "", channel: "whatsapp" });
export const SAVED_MESSAGE = "Draft saved. It is not active and will not send messages.";

/**
 * The one form for a new reminder rule (or for editing an inactive one). It opens as a side panel over the page,
 * and Save closes it, so the user lands back on the same page. The work is the first field, or fixed when the
 * form is opened from that work's own page.
 */
export function ReminderForm({ onClose, onSaved, source, editing = null }: {
  onClose: () => void; onSaved: (message: string) => void; source?: RuleDraft["source"]; editing?: RuleDraft | null;
}) {
  const [form, setForm] = useState<{ name: string; source: RuleDraft["source"]; steps: Step[] }>(() => editing
    ? { name: editing.name, source: editing.source, steps: editing.steps.map(step => ({ ...step })) }
    : { name: "", source: source || "monthly_package", steps: [blankStep()] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const monthly = form.source === "monthly_package";

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const changeStep = (index: number, change: Partial<Step>) => setForm(current => ({ ...current, steps: current.steps.map((step, i) => i === index ? { ...step, ...change } : step) }));

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/auto-reply/reminder-rules${editing ? `/${editing._id}` : ""}`, {
        method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, ...(editing ? { expectedRevision: editing.revision } : {}) }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not save the draft.");
      onSaved(SAVED_MESSAGE);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not save the draft.");
    } finally {
      setBusy(false);
    }
  }

  return <div className={s.drawerLayer}>
    <aside className={s.drawer} role="dialog" aria-modal="true" aria-label={editing ? "Edit reminder" : "New reminder"}>
      <div className={s.drawerHeader}>
        <h2>{editing ? "Edit reminder" : "New reminder"}</h2>
        <button type="button" onClick={onClose} aria-label="Close">✕</button>
      </div>
      <form className={s.drawerBody} onSubmit={save}>
        <label className={styles.filters}>Work
          <select disabled={!!source || !!editing} value={form.source} onChange={event => setForm({ name: form.name, source: event.target.value as RuleDraft["source"], steps: [blankStep()] })}>
            <option value="monthly_package">Monthly payment</option>
            <option value="broadcast">Broadcast follow-up</option>
          </select>
        </label>
        <label className={styles.filters}>Rule name <input value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} maxLength={100} required /></label>

        {form.steps.map((step, index) => <fieldset key={index} className={styles.section}>
          <legend>Reminder {index + 1}</legend>
          <label className={styles.filters}>{monthly ? "Days (negative = before the due date)" : "Days after delivery"}
            <input aria-label={`Days for reminder ${index + 1}`} type="number" min={monthly ? -365 : 0} max={365} value={step.offsetDays} onChange={event => changeStep(index, { offsetDays: Number(event.target.value) })} required />
          </label>
          <label className={styles.filters}>Send via
            <select value={step.channel} onChange={event => changeStep(index, { channel: event.target.value as Step["channel"] })}>
              <option value="whatsapp">WhatsApp only</option>
              <option value="email">Email only</option>
              <option value="both">Both</option>
            </select>
          </label>
          <label className={styles.filters}>Subject <input value={step.subject} onChange={event => changeStep(index, { subject: event.target.value })} maxLength={300} required /></label>
          <label className={styles.filters}>Message <textarea value={step.text} onChange={event => changeStep(index, { text: event.target.value })} maxLength={10000} required rows={3} /></label>
          <div className={styles.actions}>
            <InfoTip label="Message placeholders">
              <p>You can use: {monthly ? "{{name}}, {{package}}, {{amount}}, {{dueDate}}, {{planLink}}, {{invoiceLink}}" : "{{name}}"}</p>
            </InfoTip>
            {form.steps.length > 1 && <button type="button" onClick={() => setForm({ ...form, steps: form.steps.filter((_, i) => i !== index) })}>Remove reminder</button>}
          </div>
        </fieldset>)}

        <div className={styles.actions}>
          <button type="button" disabled={form.steps.length >= 10} onClick={() => setForm({ ...form, steps: [...form.steps, blankStep()] })}>Add reminder</button>
        </div>
        {error && <p className={styles.error} role="alert">{error}</p>}
        <div className={styles.actions}>
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="submit" className="admin-button" disabled={busy}>Save draft</button>
        </div>
      </form>
    </aside>
  </div>;
}
