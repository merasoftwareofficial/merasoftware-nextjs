"use client";
import { useEffect, useState } from "react";
import type { WhatsappNumberSetting, WhatsappSettings, WhatsappSettingsReply } from "@/lib/whatsapp-types";
import styles from "../email-control/email-control.module.css";
import own from "./whatsapp.module.css";
import { Loader } from "../email-control/loader";
import { hourLabel, message, whatsappApi } from "./whatsapp-panel";

// Sending rules (ban safety). Limits and recommended values come from the backend (whatsapp/src/settings.js),
// which checks every save again; this form only shows them.
type NumberField = { key: WhatsappNumberSetting; label: string; unit: string; hint: string };
type Group = { title: string; toggle?: { key: "typing" | "quietHours"; label: string }; fields: NumberField[]; hours?: boolean };
const GROUPS: Group[] = [
  { title: "Speed", fields: [
    { key: "minGapSec", label: "Gap between messages", unit: "seconds", hint: "The least time between two messages. Longer is safer." },
    { key: "jitterSec", label: "Random extra gap", unit: "seconds", hint: "Up to this much more, chosen at random each time, so the gap is never the same." },
  ] },
  { title: "Typing", toggle: { key: "typing", label: "Show “typing…” before each message" }, fields: [
    { key: "typingMinSec", label: "Shortest typing time", unit: "seconds", hint: "Longer messages type for longer: 1 second more per 100 letters." },
    { key: "typingMaxSec", label: "Longest typing time", unit: "seconds", hint: "Typing never lasts longer than this." },
  ] },
  { title: "Quiet hours (India time)", toggle: { key: "quietHours", label: "No messages at night" }, hours: true, fields: [
    { key: "quietFrom", label: "Stop at", unit: "", hint: "Messages made after this wait in the queue." },
    { key: "quietTo", label: "Start again at", unit: "", hint: "Waiting messages go out from this hour, one by one." },
  ] },
  { title: "When sending fails", fields: [
    { key: "retryDelayMin", label: "Wait before trying again", unit: "minutes", hint: "After a failed try, the message waits this long." },
    { key: "maxAttempts", label: "Tries per message", unit: "tries", hint: "After the last try the message shows as Not sent." },
    { key: "maxAgeHours", label: "Drop a message after", unit: "hours", hint: "A message still waiting this long is never sent late." },
  ] },
];
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
type Form = Record<WhatsappNumberSetting, string> & Pick<WhatsappSettings, "typing" | "quietHours">;
const toForm = (settings: WhatsappSettings) => Object.fromEntries(Object.entries(settings)
  .map(([key, value]) => [key, typeof value === "number" ? String(value) : value])) as Form;
const fromForm = (form: Form) => Object.fromEntries(Object.entries(form)
  .map(([key, value]) => [key, typeof value === "string" ? Number(value) : value])) as WhatsappSettings;

export function WhatsappSettingsSection({ onSaved }: { onSaved: () => void }) {
  const [reply, setReply] = useState<WhatsappSettingsReply | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function show(data: WhatsappSettingsReply) { setReply(data); setForm(toForm(data.settings)); }
  useEffect(() => {
    const controller = new AbortController();
    whatsappApi<WhatsappSettingsReply>("settings", "GET", controller.signal)
      .then(data => { if (!controller.signal.aborted) show(data); })
      .catch(failure => { if (!controller.signal.aborted) setLoadError(message(failure, "Could not load the sending rules.")); });
    return () => controller.abort();
  }, []);

  async function send(path: string, body: unknown, done: string) {
    setBusy(true); setNotice(null); setError(null);
    try {
      show(await whatsappApi<WhatsappSettingsReply>(path, "POST", undefined, body));
      setNotice(done);
      onSaved();
    } catch (failure) { setError(message(failure, "Could not save. Please try again.")); }
    finally { setBusy(false); }
  }
  function reset() {
    if (window.confirm("Put every sending rule back to the recommended value?")) void send("settings/reset", undefined, "Recommended rules restored. They apply from the next message.");
  }

  return <section className={styles.section} aria-labelledby="rules-title">
    <h2 id="rules-title">Sending rules</h2>
    <p className={styles.muted}>These rules keep the number looking like a person, not a robot, so WhatsApp is less likely to block it. A change applies from the next message.</p>
    {loadError && <p className={styles.error} role="alert">{loadError}</p>}
    {/* Until the saved rules arrive, every group, label and hint is drawn with a loader where its value goes. */}
    {(!form || !reply) && !loadError && <div aria-busy="true">
      {GROUPS.map(group => <fieldset key={group.title} className={own.group} disabled>
        <legend>{group.title}</legend>
        {group.toggle && <span className={own.toggle}>{group.toggle.label} <Loader inline /></span>}
        <div className={own.fields}>
          {group.fields.map(field => <div key={field.key} className={own.field}><span>{field.label}</span><Loader inline /><small>{field.hint}</small></div>)}
        </div>
      </fieldset>)}
      <div className={styles.actions}><button type="button" className="admin-action" disabled>Save rules</button><button type="button" className="admin-action" disabled>Reset to recommended</button></div>
    </div>}
    {form && reply && <form onSubmit={event => { event.preventDefault(); void send("settings", fromForm(form), "Sending rules saved. They apply from the next message."); }}>
      {GROUPS.map(group => {
        const off = group.toggle ? !form[group.toggle.key] : false;
        return <fieldset key={group.title} className={own.group}>
          <legend>{group.title}</legend>
          {group.toggle && <label className={own.toggle}>
            <input type="checkbox" checked={form[group.toggle.key]} onChange={event => setForm({ ...form, [group.toggle!.key]: event.target.checked })} />
            {group.toggle.label} <small>(recommended: {reply.recommended[group.toggle.key] ? "on" : "off"})</small>
          </label>}
          <div className={own.fields}>
            {group.fields.map(field => {
              const [min, max] = reply.limits[field.key];
              const recommended = reply.recommended[field.key];
              return <label key={field.key} className={own.field}>
                <span>{field.label}</span>
                {group.hours
                  ? <select value={form[field.key]} disabled={off} onChange={event => setForm({ ...form, [field.key]: event.target.value })}>
                      {HOURS.map(hour => <option key={hour} value={hour}>{hourLabel(hour)}</option>)}
                    </select>
                  : <span className={own.inputRow}>
                      <input type="number" inputMode="numeric" min={min} max={max} step={1} required value={form[field.key]} disabled={off}
                        onChange={event => setForm({ ...form, [field.key]: event.target.value })} />
                      {field.unit}
                    </span>}
                <small>{field.hint} Recommended: {group.hours ? hourLabel(recommended) : `${recommended} ${field.unit}`}{group.hours ? "" : ` (allowed ${min}–${max})`}.</small>
              </label>;
            })}
          </div>
        </fieldset>;
      })}
      {reply.warnings.map(warning => <div key={warning} className={styles.banner} role="note"><strong>Please check:</strong> {warning}</div>)}
      <div className={styles.actions}>
        <button type="submit" className="admin-action" disabled={busy}>Save rules</button>
        <button type="button" className="admin-action" disabled={busy} onClick={reset}>Reset to recommended</button>
      </div>
      {notice && <p className={styles.notice} role="status">{notice}</p>}
      {error && <p className={styles.error} role="alert">{error}</p>}
    </form>}
  </section>;
}
