"use client";
import { useEffect, useState } from "react";
import s from "./automated-message.module.css";
import {
  CONDITIONS, PACKAGE_NAMES, PACKAGE_SCOPES, RECENT_GROUPS, STOP_POINTS, TEMPLATE_NAMES, TRIGGERS, WORK_GROUPS, type Unit,
} from "./automated-message-options";

/**
 * Automated message system (UI preview only). The list is empty and the popup form saves nothing yet:
 * this step exists so the screen can be reviewed before any logic is connected.
 */

type Slot = { offset: number; unit: Unit; template: string };
type Side = {
  on: boolean; mode: "repeat" | "daywise"; template: string;
  start: number; startUnit: Unit; every: number; everyUnit: Unit;
  limit: "stop" | "days" | "times"; limitValue: number; slots: Slot[];
};
type Reminder = { id: number; trigger: string; condition: string; conditionValue: number; client: Side; admin: Side; stopOn: string[] };
type Form = {
  work: string; scope: string; include: string[]; exclude: string[];
  clientNow: boolean; clientTemplate: string; adminNow: boolean; adminTemplate: string; reminders: Reminder[];
};

const newSlot = (): Slot => ({ offset: 1, unit: "days", template: "" });
const newSide = (on: boolean): Side => ({ on, mode: "repeat", template: "", start: 1, startUnit: "days", every: 2, everyUnit: "days", limit: "stop", limitValue: 7, slots: [newSlot()] });
let nextId = 1;
const newReminder = (): Reminder => ({ id: nextId++, trigger: "after_action", condition: "any", conditionValue: 50, client: newSide(true), admin: newSide(false), stopOn: [] });
const emptyForm = (): Form => ({ work: "", scope: "all", include: [], exclude: [], clientNow: false, clientTemplate: "", adminNow: false, adminTemplate: "", reminders: [] });

function toggle(list: string[], value: string) {
  return list.includes(value) ? list.filter(item => item !== value) : [...list, value];
}

function TemplateSelect({ value, onChange, label }: { value: string; onChange: (value: string) => void; label: string }) {
  return <select aria-label={label} value={value} onChange={event => onChange(event.target.value)}>
    <option value="">Choose a template…</option>
    {TEMPLATE_NAMES.map(name => <option key={name} value={name}>{name}</option>)}
  </select>;
}

function UnitSelect({ value, onChange, label }: { value: Unit; onChange: (value: Unit) => void; label: string }) {
  return <select aria-label={label} value={value} onChange={event => onChange(event.target.value as Unit)}>
    <option value="hours">hours</option><option value="days">days</option>
  </select>;
}

function SideEditor({ title, side, relation, onChange, onCopy }: {
  title: string; side: Side; relation: string; onChange: (side: Side) => void; onCopy?: () => void;
}) {
  const set = (patch: Partial<Side>) => onChange({ ...side, ...patch });
  const setSlot = (index: number, patch: Partial<Slot>) => set({ slots: side.slots.map((slot, at) => at === index ? { ...slot, ...patch } : slot) });
  return <div className={s.side} data-off={!side.on}>
    <label className={s.sideHead}>
      <input type="checkbox" checked={side.on} onChange={event => set({ on: event.target.checked })} />
      <strong>{title}</strong>
    </label>
    {onCopy && <button type="button" className={s.ghost} onClick={onCopy}>Copy client’s days</button>}
    {side.on && <div className={s.sideBody}>
      <div className={s.segment} role="group" aria-label={`${title} message style`}>
        <button type="button" aria-pressed={side.mode === "repeat"} onClick={() => set({ mode: "repeat" })}>Same message, repeating</button>
        <button type="button" aria-pressed={side.mode === "daywise"} onClick={() => set({ mode: "daywise" })}>Different message on each day</button>
      </div>
      {side.mode === "repeat" ? <>
        <div className={s.line}><span>Message</span><TemplateSelect label={`${title} template`} value={side.template} onChange={template => set({ template })} /></div>
        <div className={s.line}>
          <span>Start</span>
          <input type="number" min={0} aria-label={`${title} start`} value={side.start} onChange={event => set({ start: Number(event.target.value) })} />
          <UnitSelect label={`${title} start unit`} value={side.startUnit} onChange={startUnit => set({ startUnit })} />
          <em>{relation}</em>
        </div>
        <div className={s.line}>
          <span>Repeat</span>
          <em>every</em>
          <input type="number" min={0} aria-label={`${title} repeat every`} value={side.every} onChange={event => set({ every: Number(event.target.value) })} />
          <UnitSelect label={`${title} repeat unit`} value={side.everyUnit} onChange={everyUnit => set({ everyUnit })} />
          <em>(0 = send once)</em>
        </div>
        <div className={s.line}>
          <span>Keep going</span>
          <select aria-label={`${title} limit`} value={side.limit} onChange={event => set({ limit: event.target.value as Side["limit"] })}>
            <option value="stop">Until the stop point (permanent)</option>
            <option value="days">For a fixed number of days</option>
            <option value="times">For a fixed number of messages</option>
          </select>
          {side.limit !== "stop" && <>
            <input type="number" min={1} aria-label={`${title} limit value`} value={side.limitValue} onChange={event => set({ limitValue: Number(event.target.value) })} />
            <em>{side.limit === "days" ? "days" : "messages"}</em>
          </>}
        </div>
      </> : <>
        {side.slots.map((slot, index) => <div className={s.line} key={index}>
          <span>Send</span>
          <input type="number" min={0} aria-label={`${title} day ${index + 1} offset`} value={slot.offset} onChange={event => setSlot(index, { offset: Number(event.target.value) })} />
          <UnitSelect label={`${title} day ${index + 1} unit`} value={slot.unit} onChange={unit => setSlot(index, { unit })} />
          <em>{relation}</em>
          <TemplateSelect label={`${title} day ${index + 1} template`} value={slot.template} onChange={template => setSlot(index, { template })} />
          <button type="button" className={s.remove} aria-label={`Remove day ${index + 1}`} onClick={() => set({ slots: side.slots.filter((_, at) => at !== index) })}>✕</button>
        </div>)}
        <button type="button" className={s.ghost} onClick={() => set({ slots: [...side.slots, newSlot()] })}>+ Add another day</button>
      </>}
    </div>}
  </div>;
}

function ReminderCard({ index, reminder, onChange, onRemove }: { index: number; reminder: Reminder; onChange: (reminder: Reminder) => void; onRemove: () => void }) {
  const set = (patch: Partial<Reminder>) => onChange({ ...reminder, ...patch });
  const relation = TRIGGERS.find(item => item.id === reminder.trigger)?.label ?? "";
  const condition = CONDITIONS.find(item => item.id === reminder.condition);
  return <div className={s.reminder}>
    <header><strong>Reminder {index + 1}</strong><button type="button" className={s.remove} aria-label={`Remove reminder ${index + 1}`} onClick={onRemove}>✕</button></header>
    <div className={s.line}>
      <span>Count days from</span>
      <select aria-label="Start trigger" value={reminder.trigger} onChange={event => set({ trigger: event.target.value })}>
        {TRIGGERS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
      </select>
    </div>
    <div className={s.line}>
      <span>Only when</span>
      <select aria-label="Condition" value={reminder.condition} onChange={event => set({ condition: event.target.value })}>
        {CONDITIONS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
      </select>
      {condition && "value" in condition && <input type="number" min={0} aria-label="Condition value" value={reminder.conditionValue} onChange={event => set({ conditionValue: Number(event.target.value) })} />}
    </div>
    <SideEditor title="Send to Client" side={reminder.client} relation={relation} onChange={client => set({ client })} />
    <SideEditor title="Send to Admin" side={reminder.admin} relation={relation} onChange={admin => set({ admin })}
      onCopy={() => set({ admin: { ...reminder.client, on: true, slots: reminder.client.slots.map(slot => ({ ...slot })) } })} />
    <fieldset className={s.chips}>
      <legend>Stop reminders when</legend>
      {STOP_POINTS.map(point => <label key={point}><input type="checkbox" checked={reminder.stopOn.includes(point)} onChange={() => set({ stopOn: toggle(reminder.stopOn, point) })} />{point}</label>)}
    </fieldset>
  </div>;
}

function FormDialog({ onClose, onSave }: { onClose: () => void; onSave: () => void }) {
  const [form, setForm] = useState<Form>(emptyForm);
  const [preview, setPreview] = useState("");
  const set = (patch: Partial<Form>) => setForm(current => ({ ...current, ...patch }));
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return <div className={s.overlay}>
    <div className={s.backdrop} onClick={onClose} />
    <div className={s.dialog} role="dialog" aria-modal="true" aria-labelledby="amsg-title">
      <header className={s.dialogHead}>
        <div><h2 id="amsg-title">Create automated message</h2><p>One form for the whole story: what happens, the instant message, and the reminders after it.</p></div>
        <button type="button" className={s.close} aria-label="Close" onClick={onClose}>✕</button>
      </header>

      <div className={s.dialogBody}>
        <section className={s.step}>
          <h3><span>1</span>Which work should start this?</h3>
          {RECENT_GROUPS.length > 0 && <div className={s.recent}>
            <small>Recent groups</small>
            {RECENT_GROUPS.map(group => <button key={group.label} type="button" className={s.chip} onClick={() => set({ work: group.work, scope: group.scope })}>{group.label}</button>)}
          </div>}
          <div className={s.line}>
            <span>Work</span>
            <select aria-label="Work" value={form.work} onChange={event => set({ work: event.target.value })}>
              <option value="">Choose a work…</option>
              {WORK_GROUPS.map(group => <optgroup key={group.group} label={group.group}>{group.works.map(work => <option key={work} value={work}>{work}</option>)}</optgroup>)}
            </select>
          </div>
          <div className={s.line}>
            <span>Packages</span>
            <select aria-label="Package scope" value={form.scope} onChange={event => set({ scope: event.target.value })}>
              {PACKAGE_SCOPES.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </div>
          {form.scope === "selected" && <div className={s.pick}>
            <fieldset className={s.chips}><legend>Include</legend>
              {PACKAGE_NAMES.map(name => <label key={name}><input type="checkbox" checked={form.include.includes(name)} onChange={() => set({ include: toggle(form.include, name) })} />{name}</label>)}
            </fieldset>
            <fieldset className={s.chips}><legend>Exclude</legend>
              {PACKAGE_NAMES.map(name => <label key={name}><input type="checkbox" checked={form.exclude.includes(name)} onChange={() => set({ exclude: toggle(form.exclude, name) })} />{name}</label>)}
            </fieldset>
          </div>}
        </section>

        <section className={s.step}>
          <h3><span>2</span>Instant message (sent as soon as the work happens)</h3>
          <div className={s.line}>
            <label className={s.check}><input type="checkbox" checked={form.clientNow} onChange={event => set({ clientNow: event.target.checked })} />Message the client</label>
            {form.clientNow && <><TemplateSelect label="Client instant template" value={form.clientTemplate} onChange={clientTemplate => set({ clientTemplate })} />
              <button type="button" className={s.ghost} onClick={() => setPreview(form.clientTemplate)}>Preview</button></>}
          </div>
          <div className={s.line}>
            <label className={s.check}><input type="checkbox" checked={form.adminNow} onChange={event => set({ adminNow: event.target.checked })} />Message the admin</label>
            {form.adminNow && <><TemplateSelect label="Admin instant template" value={form.adminTemplate} onChange={adminTemplate => set({ adminTemplate })} />
              <button type="button" className={s.ghost} onClick={() => setPreview(form.adminTemplate)}>Preview</button></>}
          </div>
          {preview && <p className={s.note}>Preview of “{preview}” will show the real message here once the form is connected.</p>}
        </section>

        <section className={s.step}>
          <h3><span>3</span>Reminders after that (optional)</h3>
          {form.reminders.map((reminder, index) => <ReminderCard key={reminder.id} index={index} reminder={reminder}
            onChange={next => set({ reminders: form.reminders.map(item => item.id === reminder.id ? next : item) })}
            onRemove={() => set({ reminders: form.reminders.filter(item => item.id !== reminder.id) })} />)}
          <button type="button" className={s.add} onClick={() => set({ reminders: [...form.reminders, newReminder()] })}>+ Add reminder</button>
        </section>
      </div>

      <footer className={s.dialogFoot}>
        <small>UI preview: nothing is saved yet.</small>
        <span><button type="button" className={s.ghost} onClick={onClose}>Cancel</button><button type="button" className={s.primary} onClick={onSave}>Save &amp; Activate</button></span>
      </footer>
    </div>
  </div>;
}

export function AutomatedMessagesPanel({ active }: { active: boolean }) {
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState(false);
  if (!active && !open) return null;
  return <section className={s.panel} aria-label="Automated message system">
    <div className={s.toolbar}>
      <p>Every automated message and reminder, one per work. Click <strong>Edit</strong> on a row to open its form.</p>
      <button type="button" className={s.primary} onClick={() => { setNotice(false); setOpen(true); }}>+ Create automated msg</button>
    </div>
    {notice && <p className={s.notice}>This is a UI preview, so nothing was saved. The form will be connected in the next step.</p>}
    <div className={s.empty}><strong>No automated messages yet</strong><span>Use “Create automated msg” to open the form.</span></div>
    {open && <FormDialog onClose={() => setOpen(false)} onSave={() => { setOpen(false); setNotice(true); }} />}
  </section>;
}
