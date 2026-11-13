"use client";
import { useCallback, useState } from "react";
import { useCommunicationRefresh } from "@/lib/communication-live";
import { formatIndiaDateTime } from "@/lib/date-time";
import styles from "../email-control/email-control.module.css";

type Step = { offsetDays: number; subject: string; text: string; channel: "whatsapp" | "email" | "both" };
type Draft = { _id: string; name: string; source: "monthly_package" | "broadcast"; enabled: boolean; steps: Step[]; revision: number };
type Preview = { ruleId: string; revision: number; source: Draft['source']; count: number; truncated: boolean; samples: { customer: string; due: string; amount: number; steps: number }[] };
const blankStep = (): Step => ({ offsetDays: 0, subject: "", text: "", channel: "whatsapp" });
const initial = () => ({ name: "", source: "monthly_package" as const, steps: [blankStep()] });

export function ReminderDrafts({ active, openSource, source, autoAdd = false }: { active: boolean; openSource: (source: Draft['source']) => void; source?: Draft['source']; autoAdd?: boolean }) {
  const [rows, setRows] = useState<Draft[] | null>(null);
  // "Add Reminder" chosen on the work list opens this work with the new-reminder form already open: one click, not three.
  const [form, setForm] = useState<{ name: string; source: Draft["source"]; steps: Step[] }>(() => ({ ...initial(), source: autoAdd && source ? source : "monthly_package" }));
  const [editing, setEditing] = useState<Draft | null>(null);
  const [open, setOpen] = useState(autoAdd);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const load = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch('/api/auto-reply/reminder-rules', { signal, cache: 'no-store' });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not load reminder drafts.');
    if (!signal?.aborted) setRows(result.data);
  }, []);
  useCommunicationRefresh(signal => load(signal).catch(failure => { if (!signal.aborted) setError(failure instanceof Error ? failure.message : 'Could not load reminder drafts.'); }), active);
  const begin = (draft?: Draft) => {
    setEditing(draft || null); setForm(draft ? { name: draft.name, source: draft.source, steps: draft.steps.map(step => ({ ...step })) } : { ...initial(), source: source || 'monthly_package' });
    setError(''); setNotice(''); setOpen(true);
  };
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/auto-reply/reminder-rules${editing ? `/${editing._id}` : ''}`, { method: editing ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, ...(editing ? { expectedRevision: editing.revision } : {}) }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not save the draft.');
      setOpen(false); setEditing(null); setPreview(null); setNotice('Draft saved. It is not active and will not send messages.');
      await load();
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not save the draft.'); }
    finally { setBusy(false); }
  }
  const changeStep = (index: number, change: Partial<Step>) => setForm(current => ({ ...current, steps: current.steps.map((step, i) => i === index ? { ...step, ...change } : step) }));
  async function previewRule(row: Draft) {
    setBusy(true); setError(''); setNotice(''); setPreview(null);
    try {
      const response = await fetch(`/api/auto-reply/reminder-rules/${row._id}/preview`, { cache: 'no-store' });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Could not preview the rule.');
      setPreview({ ...result.data, ruleId: row._id, revision: row.revision });
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not preview the rule.'); }
    finally { setBusy(false); }
  }
  async function toggle(row: Draft) {
    const enabling = !row.enabled;
    const warning = enabling ? (row.source === 'broadcast' ? 'Activate for broadcasts accepted after this moment? A follow-up only uses original successful recipients and their original channels.' : 'Activate for future monthly-package milestones? Existing offer-policy reminders remain separate.') : 'Stop this rule? Waiting messages are checked again, but a message already handed to a provider cannot be recalled.';
    if (!window.confirm(warning)) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch(`/api/auto-reply/reminder-rules/${row._id}/enabled`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: enabling, expectedRevision: row.revision }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Could not update the rule.');
      setPreview(null); setNotice(enabling ? 'Reminder rule activated for future events.' : 'Reminder rule stopped.'); await load();
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not update the rule.'); }
    finally { setBusy(false); }
  }
  return <section className={styles.section} aria-label="Reminder drafts">
    <div className={styles.toolbar}><h3>{source ? "Reminder setup" : "Reminder rule drafts"}</h3><button type="button" className="admin-action" onClick={() => begin()}>{source ? "Add Reminder" : "Create draft"}</button></div>
    <p className={styles.banner}>Rules can be previewed and activated when both server schedulers are enabled. Existing offer reminders keep their own rules.</p>
    {notice && <p className={styles.notice} role="status">{notice}</p>}{error && <p className={styles.error} role="alert">{error}</p>}
    {rows && !rows.some(row => !source || row.source === source) && <p>No reminders have been set up for this work yet.</p>}
    {rows?.filter(row => !source || row.source === source).map(row => <article className={styles.card} key={row._id}><div><strong>{row.name}</strong><small>{row.source === 'monthly_package' ? 'Monthly package' : 'Broadcast'} · {row.steps.length} steps · {row.enabled ? 'Active' : 'Inactive'}</small></div><div className={styles.actions}><button type="button" onClick={() => openSource(row.source)}>{row.source === 'monthly_package' ? 'Plan-start message settings' : 'Open Broadcast'}</button><button type="button" className="admin-action" disabled={busy || row.enabled} onClick={() => begin(row)}>Edit draft</button>{!row.enabled && <button type="button" disabled={busy} onClick={() => void previewRule(row)}>{row.source === 'monthly_package' ? 'Preview affected cycles' : 'Preview broadcast rule'}</button>}<button type="button" disabled={busy || (!row.enabled && (preview?.ruleId !== row._id || preview.revision !== row.revision))} onClick={() => void toggle(row)}>{row.enabled ? 'Stop reminders' : 'Activate'}</button></div></article>)}
    {preview && <div className={styles.banner} role="region" aria-label="Reminder rule preview">{preview.source === 'broadcast' ? <><strong>Future broadcasts only</strong><p>Recipients are not known until a broadcast is accepted. Each original recipient qualifies only after every original part has sent; their audience membership and original channels are checked again. Earlier broadcasts are excluded.</p></> : <><strong>{preview.count}{preview.truncated ? '+' : ''} future billing cycles currently match</strong><p>The preview is an estimate based on billing data; only milestones after activation apply. Customer eligibility and payment are checked again before sending. Existing offer-policy orders are excluded.</p>{preview.samples.map((row, index) => <p key={index}>{row.customer} · ₹{row.amount.toLocaleString('en-IN')} · {formatIndiaDateTime(row.due)} (IST) · {row.steps} steps</p>)}</>}</div>}
    {open && <form onSubmit={save} className={styles.card}>
      <div style={{ width: '100%' }}>
        <label className={styles.filters}>Rule name <input value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} maxLength={100} required /></label>
        <label className={styles.filters}>Action <select disabled={!!source} value={form.source} onChange={event => setForm({ ...form, source: event.target.value as Draft['source'], steps: [blankStep()] })}><option value="monthly_package">Monthly package renewal</option><option value="broadcast">Broadcast follow-up</option></select></label>
        <p className={styles.muted}>{form.source === 'monthly_package' ? 'Days are relative to the payment due date; negative means before.' : 'Days are after the original recipient delivery.'} Available details: {form.source === 'monthly_package' ? '{{name}}, {{package}}, {{amount}}, {{dueDate}}, {{planLink}}, {{invoiceLink}}' : '{{name}}'}.</p>
        {form.steps.map((step, index) => <fieldset key={index} className={styles.section}><legend>Reminder {index + 1}</legend>
          <label className={styles.filters}>Days <input aria-label={`Days for reminder ${index + 1}`} type="number" min={form.source === 'broadcast' ? 0 : -365} max={365} value={step.offsetDays} onChange={event => changeStep(index, { offsetDays: Number(event.target.value) })} required /></label>
          <label className={styles.filters}>Send via <select value={step.channel} onChange={event => changeStep(index, { channel: event.target.value as Step['channel'] })}><option value="whatsapp">WhatsApp only</option><option value="email">Email only</option><option value="both">Both</option></select></label>
          <label className={styles.filters}>Subject <input value={step.subject} onChange={event => changeStep(index, { subject: event.target.value })} maxLength={300} required /></label>
          <label className={styles.filters}>Message <textarea value={step.text} onChange={event => changeStep(index, { text: event.target.value })} maxLength={10000} required rows={3} /></label>
          {form.steps.length > 1 && <button type="button" onClick={() => setForm({ ...form, steps: form.steps.filter((_, i) => i !== index) })}>Remove reminder</button>}
        </fieldset>)}
        <div className={styles.actions}><button type="button" disabled={form.steps.length >= 10} onClick={() => setForm({ ...form, steps: [...form.steps, blankStep()] })}>Add reminder</button><button type="button" onClick={() => setOpen(false)}>Cancel</button><button type="submit" className="admin-button" disabled={busy}>Save draft</button></div>
      </div>
    </form>}
  </section>;
}
