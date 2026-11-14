"use client";
import { useState } from "react";
import s from "./communication.module.css";
import { InfoTip } from "./reminder-info";

/**
 * UI-only draft (no backend yet). The one form for an action rule: send to → steps (timing,
 * channel, message) → repeat → stop when → control → preview → save/activate. Opens as a
 * center sub-page with "← Back", per Reminder.md §3. Mock action + stop-action lists for now;
 * real lists and the save call come with the backend wiring.
 */
export type Step = { afterDays: number; channel: "whatsapp" | "email" | "both"; subject: string; text: string };
const blankStep = (): Step => ({ afterDays: 0, channel: "whatsapp", subject: "", text: "" });

// Mock catalog (phase 1 trigger actions + a couple of stop-only ones), matches helpers/actionEvents.js ACTIONS.
const MOCK_ACTIONS = [
  { key: "invoice.created", label: "Invoice created", trigger: true },
  { key: "payment.received", label: "Payment received", trigger: true },
  { key: "project.completed", label: "Project completed", trigger: true },
  { key: "plan.started", label: "Plan started", trigger: true },
];

export function ActionRuleForm({ action: fixedAction, onBack }: { action?: string; onBack: () => void }) {
  const [action, setAction] = useState(fixedAction || "");
  const [steps, setSteps] = useState<Step[]>([blankStep()]);
  const [repeatTimes, setRepeatTimes] = useState(0);
  const [repeatEvery, setRepeatEvery] = useState(2);
  const [stopOn, setStopOn] = useState<string[]>([]);
  const [control, setControl] = useState<"auto" | "off">("off");
  const [preview, setPreview] = useState(false);

  const changeStep = (index: number, change: Partial<Step>) => setSteps(current => current.map((step, i) => (i === index ? { ...step, ...change } : step)));
  const toggleStop = (key: string) => setStopOn(current => (current.includes(key) ? current.filter(item => item !== key) : [...current, key]));
  const needsStop = steps.length + repeatTimes > 1;
  const canSave = !!action && steps.every(step => step.text.trim() && (step.channel === "whatsapp" || step.subject.trim())) && (!needsStop || stopOn.length > 0);

  const summary = () => {
    const first = steps[0];
    const when = first.afterDays ? `after ${first.afterDays} days` : "now";
    const more = steps.length + repeatTimes - 1;
    const stop = stopOn.length ? ` · stop when ${stopOn.map(key => MOCK_ACTIONS.find(item => item.key === key)?.label).join(", ")}` : "";
    return `${MOCK_ACTIONS.find(item => item.key === action)?.label || "Choose an action"} · Customer · ${when}${more > 0 ? ` +${more} more` : ""}${stop}`;
  };

  return <section aria-label="Message rule" className={s.workSection}>
    <div><button type="button" className={s.link} onClick={onBack}>← Back</button></div>
    <div className={s.workToolbar}>
      <h3>{fixedAction ? "New message" : "Add reminder or template"}</h3>
      <InfoTip label="How this works"><p>Choose the action that starts this message, add one or more steps, and a stop so a reminder never runs forever.</p></InfoTip>
    </div>

    <dl className={s.facts}>
      <div className={s.factRow}>
        <dt>Action</dt>
        <dd>
          {fixedAction
            ? <strong>{MOCK_ACTIONS.find(item => item.key === fixedAction)?.label}</strong>
            : <select value={action} onChange={event => setAction(event.target.value)}>
                <option value="">Choose an action…</option>
                {MOCK_ACTIONS.filter(item => item.trigger).map(item => <option key={item.key} value={item.key}>{item.label}</option>)}
              </select>}
        </dd>
      </div>

      {steps.map((step, index) => <div className={s.factRow} key={index}>
        <dt>Message {index + 1}</dt>
        <dd style={{ display: "grid", gap: 8, width: "100%" }}>
          <label>Send after <input type="number" min={0} max={365} value={step.afterDays} onChange={event => changeStep(index, { afterDays: Number(event.target.value) })} style={{ width: 70 }} /> days (0 = right away)</label>
          <label>Send via{" "}
            <select value={step.channel} onChange={event => changeStep(index, { channel: event.target.value as Step["channel"] })}>
              <option value="whatsapp">WhatsApp only</option>
              <option value="email">Email only</option>
              <option value="both">Both</option>
            </select>
          </label>
          {step.channel !== "whatsapp" && <label>Subject <input value={step.subject} onChange={event => changeStep(index, { subject: event.target.value })} maxLength={300} /></label>}
          <label>Message
            <InfoTip label="Placeholders"><p>You can use: {"{name}, {amount}, {dueDate}, {invoiceLink}, {project}"}</p></InfoTip>
            <textarea rows={3} value={step.text} onChange={event => changeStep(index, { text: event.target.value })} maxLength={10000} style={{ display: "block", width: "100%" }} />
          </label>
          {steps.length > 1 && <button type="button" className={s.link} onClick={() => setSteps(current => current.filter((_, i) => i !== index))}>Remove this message</button>}
        </dd>
      </div>)}

      <div className={s.factRow}>
        <dt></dt>
        <dd><button type="button" disabled={steps.length >= 10} onClick={() => setSteps(current => [...current, blankStep()])}>+ Add another message</button></dd>
      </div>

      <div className={s.factRow}>
        <dt>Repeat <InfoTip label="Repeat"><p>Repeats the last message every few days, after the steps above, up to a maximum count.</p></InfoTip></dt>
        <dd>
          <label>Repeat <input type="number" min={0} max={10} value={repeatTimes} onChange={event => setRepeatTimes(Number(event.target.value))} style={{ width: 60 }} /> times</label>
          {repeatTimes > 0 && <label>every <input type="number" min={1} max={90} value={repeatEvery} onChange={event => setRepeatEvery(Number(event.target.value))} style={{ width: 60 }} /> days</label>}
        </dd>
      </div>

      <div className={s.factRow}>
        <dt>Stop when <InfoTip label="Stop when"><p>A reminder needs at least one stop, or it never saves. Stop actions apply to the same record only (e.g. this project's payment).</p></InfoTip></dt>
        <dd style={{ display: "grid", gap: 4 }}>
          {MOCK_ACTIONS.filter(item => item.key !== action).map(item => <label key={item.key}>
            <input type="checkbox" checked={stopOn.includes(item.key)} onChange={() => toggleStop(item.key)} /> {item.label}
          </label>)}
          {needsStop && !stopOn.length && <span className={s.error ?? ""} style={{ color: "crimson" }}>A reminder (more than one message) needs a stop action.</span>}
        </dd>
      </div>

      <div className={s.factRow}>
        <dt>Do also <InfoTip label="Do also"><p>Automatic data steps (e.g. change lead stage) come in a later phase. Fixed menu, never free-form, so a rule can never damage data.</p></InfoTip></dt>
        <dd><span className={s.headStatus}>Coming soon</span></dd>
      </div>

      <div className={s.factRow}>
        <dt>Control <InfoTip label="Control"><p>Auto sends by itself. Off saves the rule without sending anything. Review (approval before sending) is not available yet.</p></InfoTip></dt>
        <dd>
          <label><input type="radio" name="control" checked={control === "auto"} onChange={() => setControl("auto")} /> Auto</label>{" "}
          <label><input type="radio" name="control" checked={control === "off"} onChange={() => setControl("off")} /> Off</label>
        </dd>
      </div>
    </dl>

    {preview && <div className={s.facts}>
      <div className={s.factRow}><dt>Preview</dt><dd>{summary()}</dd></div>
    </div>}

    <div>
      <button type="button" onClick={() => setPreview(value => !value)}>{preview ? "Hide preview" : "Preview"}</button>{" "}
      <button type="button" disabled={!canSave} onClick={() => alert("UI-only draft: saving is not wired to the backend yet.\n\n" + summary())}>Save as draft</button>{" "}
      <button type="button" disabled={!canSave} onClick={() => alert("UI-only draft: activating is not wired to the backend yet.\n\n" + summary())}>Activate</button>
    </div>
  </section>;
}
