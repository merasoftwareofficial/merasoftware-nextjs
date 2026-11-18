"use client";
import { useEffect, useRef, useState } from "react";
import s from "./automated-message.module.css";
import {
  CONDITIONS, PACKAGE_NAMES, PACKAGE_SCOPES, PLACEHOLDERS,
  TRIGGERS, WORK_GROUPS, type Channel, type TimingRef, type Unit,
} from "./automated-message-options";

/**
 * Automated message system (UI preview only).
 * Preserves the original 3-step form (Step 1 Work & Packages -> Step 2 Instant Message -> Step 3 Reminders)
 * with the live website Reminder rule UI, unified human-readable Works/Triggers dropdowns,
 * and an infinite "+" chaining loop directly on every Stop Trigger.
 */

type MessageStep = { timingRef: TimingRef; amount: number; unit: Unit; channel: Channel; subject: string; text: string };
type InstantMsg = { on: boolean; channel: Channel; subject: string; text: string };
type AudienceChoice = "client" | "admin" | "both";
type MessageMode = "separate" | "universal";
type RepeatMode = "permanent" | "limited";

type StopChain = {
  mode: "auto_msg" | "reminder";
  clientNow: InstantMsg;
  adminNow: InstantMsg;
  reminders: Reminder[];
};

type Reminder = {
  id: number;
  startTrigger: string;
  audience: AudienceChoice;
  clientMode: MessageMode;
  adminMode: MessageMode;
  clientSteps: MessageStep[];
  adminSteps: MessageStep[];
  repeatMode: RepeatMode;
  repeatForDays: number;
  repeatEveryDays: number;
  repeatPerDay: number;
  stopOn: string[];
  stopChains: Record<string, StopChain>;
  countDaysFrom: TimingRef;
  condition: string;
  conditionValue: number;
};

type Form = {
  work: string;
  scope: string;
  include: string[];
  exclude: string[];
  clientNow: InstantMsg;
  adminNow: InstantMsg;
  reminders: Reminder[];
};

const blankStep = (timingRef: TimingRef = "before_due", amount = 3): MessageStep => ({
  timingRef, amount, unit: "days", channel: "whatsapp", subject: "", text: "",
});
const blankInstant = (): InstantMsg => ({ on: false, channel: "whatsapp", subject: "", text: "" });
let nextId = 1;
const newReminder = (defaultStop = ""): Reminder => ({
  id: nextId++,
  startTrigger: "__main_work__",
  audience: "client",
  clientMode: "separate",
  adminMode: "separate",
  clientSteps: [blankStep("before_due", 3)],
  adminSteps: [blankStep("before_due", 3)],
  repeatMode: "permanent",
  repeatForDays: 7,
  repeatEveryDays: 2,
  repeatPerDay: 1,
  stopOn: defaultStop ? [defaultStop] : [],
  stopChains: {},
  countDaysFrom: "after_action",
  condition: "any",
  conditionValue: 50,
});
const newStopChain = (mode: "auto_msg" | "reminder"): StopChain => ({
  mode,
  clientNow: blankInstant(),
  adminNow: blankInstant(),
  reminders: mode === "reminder" ? [newReminder()] : [],
});
const emptyForm = (): Form => ({
  work: "", scope: "all", include: [], exclude: [], clientNow: blankInstant(), adminNow: blankInstant(), reminders: [],
});

function toggle(list: string[], value: string) {
  return list.includes(value) ? list.filter(item => item !== value) : [...list, value];
}

function WorkOptions({ exclude = [] }: { exclude?: string[] }) {
  return <>
    {WORK_GROUPS.map(group => {
      const items = group.works.filter(w => !exclude.includes(w));
      if (!items.length) return null;
      return (
        <optgroup key={group.group} label={group.group}>
          {items.map(work => <option key={work} value={work}>{work}</option>)}
        </optgroup>
      );
    })}
  </>;
}

function applyFormat(textarea: HTMLTextAreaElement | null, current: string, kind: "bold" | "italic" | "list", onChange: (next: string) => void) {
  if (!textarea) return;
  const start = textarea.selectionStart ?? current.length;
  const end = textarea.selectionEnd ?? current.length;
  const selected = current.slice(start, end);
  let insert = selected;
  if (kind === "bold") insert = `*${selected || "bold text"}*`;
  else if (kind === "italic") insert = `_${selected || "italic text"}_`;
  else insert = selected ? selected.split("\n").map(line => line.startsWith("• ") ? line : `• ${line}`).join("\n") : "• ";
  onChange(current.slice(0, start) + insert + current.slice(end));
}

function MessageEditor({
  title, step, showTiming, canRemove, onChange, onRemove,
}: {
  title: string;
  step: MessageStep;
  showTiming: boolean;
  canRemove?: boolean;
  onChange: (patch: Partial<MessageStep>) => void;
  onRemove?: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  return <div className={s.msgCard}>
    <div className={s.msgHead}>
      <strong>{title}</strong>
      {canRemove && onRemove && <button type="button" className={s.remove} onClick={onRemove}>Remove</button>}
    </div>

    <div className={s.line}>
      {showTiming && <>
        <span>When</span>
        {step.timingRef !== "on_due" && <>
          <input type="number" min={0} max={step.unit === "hours" ? 720 : 365} aria-label={`${title} time`}
            value={step.amount} onChange={e => onChange({ amount: Math.max(0, Number(e.target.value || 0)) })} />
          <select aria-label={`${title} unit`} value={step.unit} onChange={e => onChange({ unit: e.target.value as Unit })}>
            <option value="days">days</option>
            <option value="hours">hours</option>
          </select>
        </>}
        <select aria-label={`${title} timing`} value={step.timingRef} onChange={e => onChange({ timingRef: e.target.value as TimingRef })}>
          <option value="before_due">before due / deadline</option>
          <option value="on_due">on due date</option>
          <option value="after_due">after due date</option>
          <option value="after_action">after action</option>
        </select>
      </>}
      <span>Via</span>
      <select aria-label={`${title} channel`} value={step.channel} onChange={e => onChange({ channel: e.target.value as Channel })}>
        <option value="whatsapp">WhatsApp only</option>
        <option value="email">Email only</option>
        <option value="both">Both (WhatsApp + Email)</option>
      </select>
    </div>

    {step.channel !== "whatsapp" && (
      <input type="text" className={s.subject} placeholder="Email subject" maxLength={300}
        value={step.subject} onChange={e => onChange({ subject: e.target.value })} />
    )}

    <div className={s.toolbarRow}>
      <div className={s.formatBtns} role="toolbar" aria-label="Text formatting">
        <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => applyFormat(ref.current, step.text, "bold", text => onChange({ text }))}><strong>B</strong></button>
        <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => applyFormat(ref.current, step.text, "italic", text => onChange({ text }))}><em>I</em></button>
        <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => applyFormat(ref.current, step.text, "list", text => onChange({ text }))}>• List</button>
      </div>
      <div className={s.placeholders}>
        {PLACEHOLDERS.map(ph => (
          <button key={ph} type="button" onMouseDown={e => e.preventDefault()} onClick={() => {
            const el = ref.current;
            const at = el?.selectionStart ?? step.text.length;
            const end = el?.selectionEnd ?? step.text.length;
            onChange({ text: step.text.slice(0, at) + ph + step.text.slice(end) });
          }}>{ph}</button>
        ))}
      </div>
    </div>

    <textarea ref={ref} rows={3} className={s.textarea} placeholder="Write your message here…" maxLength={10000}
      value={step.text} onChange={e => onChange({ text: e.target.value })} />
  </div>;
}

function InstantAutoMsgBlock({
  clientNow, adminNow, onClientChange, onAdminChange,
}: {
  clientNow: InstantMsg;
  adminNow: InstantMsg;
  onClientChange: (next: InstantMsg) => void;
  onAdminChange: (next: InstantMsg) => void;
}) {
  return <div className={s.instantBlock}>
    <label className={s.check}>
      <input type="checkbox" checked={clientNow.on} onChange={e => onClientChange({ ...clientNow, on: e.target.checked })} />
      Message the client right away
    </label>
    {clientNow.on && (
      <MessageEditor title="Client instant message" step={{ timingRef: "after_action", amount: 0, unit: "days", ...clientNow }}
        showTiming={false} onChange={patch => onClientChange({ ...clientNow, ...patch })} />
    )}

    <label className={s.check}>
      <input type="checkbox" checked={adminNow.on} onChange={e => onAdminChange({ ...adminNow, on: e.target.checked })} />
      Message the admin right away
    </label>
    {adminNow.on && (
      <MessageEditor title="Admin instant message" step={{ timingRef: "after_action", amount: 0, unit: "days", ...adminNow }}
        showTiming={false} onChange={patch => onAdminChange({ ...adminNow, ...patch })} />
    )}
  </div>;
}

function AudienceBlock({
  who, title, mode, steps, canCopyClient, onModeChange, onCopyClient, onUpdateSteps,
}: {
  who: "client" | "admin";
  title: string;
  mode: MessageMode;
  steps: MessageStep[];
  canCopyClient?: boolean;
  onModeChange: (mode: MessageMode) => void;
  onCopyClient?: () => void;
  onUpdateSteps: (next: MessageStep[]) => void;
}) {
  const universal = mode === "universal";
  const visible = universal ? [steps[0] || blankStep("before_due", 3)] : steps;
  return <div className={s.side}>
    <div className={s.sideHeadRow}>
      <strong>{title}</strong>
      <div className={s.syncBar}>
        <label>
          <input type="radio" checked={mode === "separate"} onChange={() => onModeChange("separate")} />
          Separate message per timing
        </label>
        <label>
          <input type="radio" checked={mode === "universal"} onChange={() => onModeChange("universal")} />
          {who === "admin" && canCopyClient ? "1 universal message (same days as Client)" : "1 universal message (all days)"}
        </label>
        {who === "admin" && canCopyClient && mode === "separate" && onCopyClient && (
          <button type="button" className={s.ghost} onClick={onCopyClient}>Copy client’s days</button>
        )}
      </div>
    </div>
    <div className={s.sideBody}>
      {visible.map((step, idx) => (
        <MessageEditor
          key={idx}
          title={universal ? `Universal ${who === "client" ? "Client" : "Admin"} message` : `Message ${idx + 1}`}
          step={step}
          showTiming={!(who === "admin" && canCopyClient && universal)}
          canRemove={!universal && steps.length > 1}
          onChange={patch => onUpdateSteps(steps.map((st, i) => i === idx ? { ...st, ...patch } : st))}
          onRemove={() => onUpdateSteps(steps.filter((_, i) => i !== idx))}
        />
      ))}
      {!universal && steps.length < 10 && (
        <button type="button" className={s.ghost} onClick={() => onUpdateSteps([...steps, blankStep("after_due", 2)])}>
          + Add another follow-up for {who === "client" ? "Client" : "Admin"}
        </button>
      )}
    </div>
  </div>;
}

function ReminderCard({
  index, reminder, inheritedTrigger, mainWork, onChange, onRemove,
}: {
  index: number;
  reminder: Reminder;
  inheritedTrigger?: string;
  mainWork: string;
  onChange: (reminder: Reminder) => void;
  onRemove: () => void;
}) {
  const set = (patch: Partial<Reminder>) => onChange({ ...reminder, ...patch });
  const condition = CONDITIONS.find(item => item.id === reminder.condition);
  const showClient = reminder.audience === "client" || reminder.audience === "both";
  const showAdmin = reminder.audience === "admin" || reminder.audience === "both";
  const [stopPick, setStopPick] = useState("");
  const [openPlusFor, setOpenPlusFor] = useState<string | null>(null);

  function copyClientDays() {
    set({
      adminMode: "separate",
      adminSteps: reminder.clientSteps.map(st => ({ ...st })),
    });
  }

  function removeStopTrigger(stopWork: string) {
    const nextChains = { ...reminder.stopChains };
    delete nextChains[stopWork];
    if (openPlusFor === stopWork) setOpenPlusFor(null);
    set({
      stopOn: reminder.stopOn.filter(x => x !== stopWork),
      stopChains: nextChains,
    });
  }

  function attachChain(stopWork: string, mode: "auto_msg" | "reminder") {
    setOpenPlusFor(null);
    set({
      stopChains: { ...reminder.stopChains, [stopWork]: newStopChain(mode) },
    });
  }

  function updateChain(stopWork: string, nextChain: StopChain) {
    set({
      stopChains: { ...reminder.stopChains, [stopWork]: nextChain },
    });
  }

  function removeChain(stopWork: string) {
    const nextChains = { ...reminder.stopChains };
    delete nextChains[stopWork];
    set({ stopChains: nextChains });
  }

  return <div className={s.reminder}>
    <header>
      <div className={s.remHeadLeft}>
        <strong>Reminder {index + 1}</strong>
        {inheritedTrigger && <span className={s.triggerBadge}>Trigger: {inheritedTrigger}</span>}
      </div>
      <button type="button" className={s.remove} aria-label={`Remove reminder ${index + 1}`} onClick={onRemove}>✕</button>
    </header>

    {/* 1. Starting trigger (only shown on top-level reminder; chained reminders inherit the Stop Trigger above) */}
    {!inheritedTrigger && (
      <div className={s.line}>
        <span>Start reminder when</span>
        <select aria-label="Start reminder trigger" value={reminder.startTrigger} onChange={e => set({ startTrigger: e.target.value })}>
          <option value="__main_work__">Same as main work ({mainWork || "selected work"})</option>
          <WorkOptions />
        </select>
      </div>
    )}

    {/* 2. Who receives */}
    <div className={s.line}>
      <span>Send to</span>
      <div className={s.segment} role="group" aria-label="Who receives">
        <button type="button" aria-pressed={reminder.audience === "client"} onClick={() => set({ audience: "client" })}>Client only</button>
        <button type="button" aria-pressed={reminder.audience === "admin"} onClick={() => set({ audience: "admin" })}>Admin only</button>
        <button type="button" aria-pressed={reminder.audience === "both"} onClick={() => set({ audience: "both" })}>Both (Client &amp; Admin)</button>
      </div>
    </div>

    {/* 3. Message builders (live website reminder UI: separate vs universal + Copy client's days) */}
    {showClient && (
      <AudienceBlock
        who="client"
        title="Message for Client"
        mode={reminder.clientMode}
        steps={reminder.clientSteps}
        onModeChange={clientMode => set({ clientMode })}
        onUpdateSteps={clientSteps => set({ clientSteps })}
      />
    )}
    {showAdmin && (
      <AudienceBlock
        who="admin"
        title="Message for Admin / Team"
        mode={reminder.adminMode}
        steps={reminder.adminSteps}
        canCopyClient={showClient}
        onModeChange={adminMode => set({ adminMode })}
        onCopyClient={copyClientDays}
        onUpdateSteps={adminSteps => set({ adminSteps })}
      />
    )}

    {/* 4. Repeat / Duration control */}
    <div className={s.repeatBox}>
      <div className={s.line}>
        <span>Repeat (last message)</span>
        <div className={s.segment} role="group" aria-label="Repeat duration">
          <button type="button" aria-pressed={reminder.repeatMode === "permanent"} onClick={() => set({ repeatMode: "permanent" })}>
            Permanent (until stop point)
          </button>
          <button type="button" aria-pressed={reminder.repeatMode === "limited"} onClick={() => set({ repeatMode: "limited" })}>
            Fixed days limit
          </button>
        </div>
      </div>
      <div className={s.line}>
        {reminder.repeatMode === "limited" && <>
          <span>For</span>
          <input type="number" min={1} max={180} aria-label="Repeat for days" value={reminder.repeatForDays}
            onChange={e => set({ repeatForDays: Math.max(1, Number(e.target.value || 1)) })} />
          <em>days</em>
        </>}
        <span>Every</span>
        <input type="number" min={1} max={90} aria-label="Repeat every days" value={reminder.repeatEveryDays}
          onChange={e => set({ repeatEveryDays: Math.max(1, Number(e.target.value || 1)) })} />
        <em>days</em>
        <span>Per day</span>
        <select aria-label="Per day" value={reminder.repeatPerDay} onChange={e => set({ repeatPerDay: Number(e.target.value || 1) })}>
          <option value={1}>1x / day</option>
          <option value={2}>2x / day (12h)</option>
          <option value={3}>3x / day (8h)</option>
          <option value={4}>4x / day (6h)</option>
        </select>
      </div>
    </div>

    {/* 5. Last rules: Count days from & Only when */}
    <div className={s.tailRules}>
      <small>Timing reference &amp; extra condition (applied to this reminder)</small>
      <div className={s.line}>
        <span>Count days from</span>
        <select aria-label="Count days from" value={reminder.countDaysFrom} onChange={e => set({ countDaysFrom: e.target.value as TimingRef })}>
          {TRIGGERS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
      </div>
      <div className={s.line}>
        <span>Only when</span>
        <select aria-label="Only when condition" value={reminder.condition} onChange={e => set({ condition: e.target.value })}>
          {CONDITIONS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
        {condition && "value" in condition && (
          <input type="number" min={0} aria-label="Condition value" value={reminder.conditionValue}
            onChange={e => set({ conditionValue: Number(e.target.value || 0) })} />
        )}
      </div>
    </div>

    {/* 6. Stop trigger (unified Works dropdown) + [ + ] button next to each stop trigger */}
    <div className={s.stopBox}>
      <div className={s.line}>
        <span>Stop reminder when</span>
        <select aria-label="Add stop trigger" value={stopPick} onChange={e => {
          const val = e.target.value;
          if (val && !reminder.stopOn.includes(val)) set({ stopOn: [...reminder.stopOn, val] });
          setStopPick("");
        }}>
          <option value="">Choose a stop trigger…</option>
          <WorkOptions exclude={reminder.stopOn} />
        </select>
      </div>

      {reminder.stopOn.length > 0 && (
        <div className={s.stopList}>
          {reminder.stopOn.map(stopWork => {
            const chain = reminder.stopChains[stopWork];
            const menuOpen = openPlusFor === stopWork;
            return (
              <div key={stopWork} className={s.stopItem}>
                <div className={s.stopRow}>
                  <span className={s.stopTag}>
                    <strong>{stopWork}</strong>
                    {!chain && (
                      <button
                        type="button"
                        className={s.plusBtn}
                        title={`Add Auto Msg or Reminder when "${stopWork}" happens`}
                        aria-label={`Add Auto Msg or Reminder on ${stopWork}`}
                        onClick={() => setOpenPlusFor(menuOpen ? null : stopWork)}
                      >
                        +
                      </button>
                    )}
                    <button type="button" className={s.tagClose} aria-label={`Remove ${stopWork}`} onClick={() => removeStopTrigger(stopWork)}>✕</button>
                  </span>

                  {!chain && menuOpen && (
                    <div className={s.plusMenu} role="group" aria-label={`Action on ${stopWork}`}>
                      <span>On “{stopWork}”:</span>
                      <button type="button" className={s.choiceBtn} onClick={() => attachChain(stopWork, "auto_msg")}>+ Auto Msg</button>
                      <button type="button" className={s.choiceBtn} onClick={() => attachChain(stopWork, "reminder")}>+ Reminder</button>
                    </div>
                  )}
                </div>

                {chain && (
                  <div className={s.chainedBlock}>
                    <div className={s.chainedHead}>
                      <strong>
                        On “{stopWork}” → {chain.mode === "auto_msg" ? "Auto Message & Follow-up" : "Follow-up Reminder"}
                      </strong>
                      <button type="button" className={s.remove} onClick={() => removeChain(stopWork)}>Remove ✕</button>
                    </div>

                    {chain.mode === "auto_msg" && (
                      <InstantAutoMsgBlock
                        clientNow={chain.clientNow}
                        adminNow={chain.adminNow}
                        onClientChange={clientNow => updateChain(stopWork, { ...chain, clientNow })}
                        onAdminChange={adminNow => updateChain(stopWork, { ...chain, adminNow })}
                      />
                    )}

                    {chain.reminders.map((subRem, subIdx) => (
                      <ReminderCard
                        key={subRem.id}
                        index={subIdx}
                        reminder={subRem}
                        inheritedTrigger={stopWork}
                        mainWork={mainWork}
                        onChange={nextSub => updateChain(stopWork, {
                          ...chain,
                          reminders: chain.reminders.map(item => item.id === subRem.id ? nextSub : item),
                        })}
                        onRemove={() => {
                          const remaining = chain.reminders.filter(item => item.id !== subRem.id);
                          if (chain.mode === "reminder" && remaining.length === 0) removeChain(stopWork);
                          else updateChain(stopWork, { ...chain, reminders: remaining });
                        }}
                      />
                    ))}

                    <button
                      type="button"
                      className={s.add}
                      onClick={() => updateChain(stopWork, { ...chain, reminders: [...chain.reminders, newReminder()] })}
                    >
                      + Add reminder
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  </div>;
}

function FormDialog({ onClose, onSave }: { onClose: () => void; onSave: () => void }) {
  const [form, setForm] = useState<Form>(emptyForm);
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
        <div>
          <h2 id="amsg-title">Create automated message</h2>
          <p>One form for the whole story: what happens, the instant message, and the reminders after it.</p>
        </div>
        <button type="button" className={s.close} aria-label="Close" onClick={onClose}>✕</button>
      </header>

      <div className={s.dialogBody}>
        <section className={s.step}>
          <h3><span>1</span>Which work should start this?</h3>
          <div className={s.line}>
            <span>Work</span>
            <select aria-label="Work" value={form.work} onChange={event => set({ work: event.target.value })}>
              <option value="">Choose a work…</option>
              <WorkOptions />
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
          <InstantAutoMsgBlock
            clientNow={form.clientNow}
            adminNow={form.adminNow}
            onClientChange={clientNow => set({ clientNow })}
            onAdminChange={adminNow => set({ adminNow })}
          />
        </section>

        <section className={s.step}>
          <h3><span>3</span>Reminders after that (optional)</h3>
          {form.reminders.map((reminder, index) => (
            <ReminderCard key={reminder.id} index={index} reminder={reminder} mainWork={form.work}
              onChange={next => set({ reminders: form.reminders.map(item => item.id === reminder.id ? next : item) })}
              onRemove={() => set({ reminders: form.reminders.filter(item => item.id !== reminder.id) })} />
          ))}
          <button type="button" className={s.add} onClick={() => set({ reminders: [...form.reminders, newReminder("Payment Recorded / Approved")] })}>+ Add reminder</button>
        </section>
      </div>

      <footer className={s.dialogFoot}>
        <small>UI preview: nothing is saved yet.</small>
        <span>
          <button type="button" className={s.ghost} onClick={onClose}>Cancel</button>
          <button type="button" className={s.primary} onClick={onSave}>Save &amp; Activate</button>
        </span>
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
