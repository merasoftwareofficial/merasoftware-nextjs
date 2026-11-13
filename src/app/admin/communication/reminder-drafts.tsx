"use client";
import { useCallback, useState } from "react";
import { useCommunicationRefresh } from "@/lib/communication-live";
import { formatIndiaDateTime } from "@/lib/date-time";
import styles from "../email-control/email-control.module.css";
import s from "./communication.module.css";
import { ReminderForm, type RuleDraft } from "./reminder-form";

type Draft = RuleDraft;
type Preview = { ruleId: string; revision: number; source: Draft["source"]; count: number; truncated: boolean; samples: { customer: string; due: string; amount: number; steps: number }[] };

/** The rules of one work (or all rules on the Rules tab). Creating and editing happen in ReminderForm. */
export function ReminderDrafts({ active, openSource, source, compact = false }: { compact?: boolean; active: boolean; openSource: (source: Draft["source"]) => void; source?: Draft["source"] }) {
  const [rows, setRows] = useState<Draft[] | null>(null);
  const [form, setForm] = useState<{ editing: Draft | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const load = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch("/api/auto-reply/reminder-rules", { signal, cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not load reminder drafts.");
    if (!signal?.aborted) setRows(result.data);
  }, []);
  useCommunicationRefresh(signal => load(signal).catch(failure => { if (!signal.aborted) setError(failure instanceof Error ? failure.message : "Could not load reminder drafts."); }), active);
  async function previewRule(row: Draft) {
    setBusy(true); setError(""); setNotice(""); setPreview(null);
    try {
      const response = await fetch(`/api/auto-reply/reminder-rules/${row._id}/preview`, { cache: "no-store" });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || "Could not preview the rule.");
      setPreview({ ...result.data, ruleId: row._id, revision: row.revision });
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Could not preview the rule."); }
    finally { setBusy(false); }
  }
  async function toggle(row: Draft) {
    const enabling = !row.enabled;
    const warning = enabling ? (row.source === "broadcast" ? "Activate for broadcasts accepted after this moment? A follow-up only uses original successful recipients and their original channels." : "Activate for future monthly-package milestones? Existing offer-policy reminders remain separate.") : "Stop this rule? Waiting messages are checked again, but a message already handed to a provider cannot be recalled.";
    if (!window.confirm(warning)) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/auto-reply/reminder-rules/${row._id}/enabled`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: enabling, expectedRevision: row.revision }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || "Could not update the rule.");
      setPreview(null); setNotice(enabling ? "Reminder rule activated for future events." : "Reminder rule stopped."); await load();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Could not update the rule."); }
    finally { setBusy(false); }
  }
  const Row = compact ? "div" : "article";
  const shown = rows?.filter(row => !source || row.source === source) ?? null;
  return <section className={styles.section} aria-label="Reminder drafts">
    <div className={styles.toolbar}>
      <h3>{compact ? "Rules" : source ? "Reminder setup" : "Reminder rule drafts"}</h3>
      <button type="button" className="admin-action" onClick={() => { setError(""); setNotice(""); setForm({ editing: null }); }}>{source || compact ? "Add Reminder" : "Create draft"}</button>
    </div>
    {!compact && <p className={styles.banner}>Rules can be previewed and activated when both server schedulers are enabled. Existing offer reminders keep their own rules.</p>}
    {notice && <p className={styles.notice} role="status">{notice}</p>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    {shown && !shown.length && <p>No reminders have been set up for this work yet.</p>}
    {shown?.map(row => <Row className={compact ? s.plainRow : styles.card} key={row._id}>
      <div><strong>{row.name}</strong><small>{row.source === "monthly_package" ? "Monthly payment" : "Broadcast"} · {row.steps.length} steps · {row.enabled ? "Active" : "Inactive"}</small></div>
      <div className={styles.actions}>
        <button type="button" onClick={() => openSource(row.source)}>{row.source === "monthly_package" ? "Plan-start message settings" : "Open Broadcast"}</button>
        <button type="button" className="admin-action" disabled={busy || row.enabled} onClick={() => { setError(""); setNotice(""); setForm({ editing: row }); }}>Edit draft</button>
        {!row.enabled && <button type="button" disabled={busy} onClick={() => void previewRule(row)}>{row.source === "monthly_package" ? "Preview affected cycles" : "Preview broadcast rule"}</button>}
        <button type="button" disabled={busy || (!row.enabled && (preview?.ruleId !== row._id || preview.revision !== row.revision))} onClick={() => void toggle(row)}>{row.enabled ? "Stop reminders" : "Activate"}</button>
      </div>
    </Row>)}
    {preview && <div className={styles.banner} role="region" aria-label="Reminder rule preview">{preview.source === "broadcast" ? <><strong>Future broadcasts only</strong><p>Recipients are not known until a broadcast is accepted. Each original recipient qualifies only after every original part has sent; their audience membership and original channels are checked again. Earlier broadcasts are excluded.</p></> : <><strong>{preview.count}{preview.truncated ? "+" : ""} future billing cycles currently match</strong><p>The preview is an estimate based on billing data; only milestones after activation apply. Customer eligibility and payment are checked again before sending. Existing offer-policy orders are excluded.</p>{preview.samples.map((row, index) => <p key={index}>{row.customer} · ₹{row.amount.toLocaleString("en-IN")} · {formatIndiaDateTime(row.due)} (IST) · {row.steps} steps</p>)}</>}</div>}
    {form && <ReminderForm source={source} editing={form.editing} onClose={() => setForm(null)} onSaved={message => { setForm(null); setPreview(null); setNotice(message); void load(); }} />}
  </section>;
}
