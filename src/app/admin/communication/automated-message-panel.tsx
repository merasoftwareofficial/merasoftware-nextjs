"use client";
import { useEffect, useRef, useState } from "react";
import s from "./automated-message.module.css";
import {
  CONDITIONS, PACKAGE_NAMES, PACKAGE_SCOPES, PLACEHOLDERS,
  TRIGGERS, WORK_GROUPS, type Channel, type TimingRef, type Unit,
} from "./automated-message-options";

/**
 * Automated message system (UI preview only).
 * Implements the Owner's Chain / Trail architecture:
 * - Every trigger point (Stage trigger, Reminder start trigger, Reminder stop trigger) comes from the same unified Works list.
 * - On any Stop Trigger that ends a reminder, the admin can chain the next Stage (another Auto Msg and/or another Reminder)
 *   and grow the trail as long as needed.
 */

type MessageStep = { timingRef: TimingRef; amount: number; unit: Unit; channel: Channel; subject: string; text: string };
type InstantMsg = { on: boolean; channel: Channel; subject: string; text: string };
type AudienceChoice = "client" | "admin" | "both";
type MessageMode = "separate" | "universal";
type RepeatMode = "permanent" | "limited";

type ReminderRule = {
  on: boolean;
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
  countDaysFrom: TimingRef;
  condition: string;
  conditionValue: number;
};

type TrailStage = {
  id: number;
  fromPreviousStop: boolean;
  work: string;
  clientNow: InstantMsg;
  adminNow: InstantMsg;
  reminder: ReminderRule;
};

type Form = {
  scope: string;
  include: string[];
  exclude: string[];
  stages: TrailStage[];
};

const blankStep = (timingRef: TimingRef = "before_due", amount = 3): MessageStep => ({
  timingRef, amount, unit: "days", channel: "whatsapp", subject: "", text: "",
});
const blankInstant = (on = false): InstantMsg => ({ on, channel: "whatsapp", subject: "", text: "" });

let nextStageId = 1;
const newReminderRule = (on = true, defaultStop = "Payment Recorded / Approved"): ReminderRule => ({
  on,
  startTrigger: "__stage_work__",
  audience: "client",
  clientMode: "separate",
  adminMode: "separate",
  clientSteps: [blankStep("after_action", 1)],
  adminSteps: [blankStep("after_action", 1)],
  repeatMode: "permanent",
  repeatForDays: 7,
  repeatEveryDays: 2,
  repeatPerDay: 1,
  stopOn: defaultStop ? [defaultStop] : [],
  countDaysFrom: "after_action",
  condition: "any",
  conditionValue: 50,
});

const newStage = (work = "Package or Plan Bought", fromPreviousStop = false): TrailStage => ({
  id: nextStageId++,
  fromPreviousStop,
  work,
  clientNow: blankInstant(true),
  adminNow: blankInstant(false),
  reminder: newReminderRule(true, work === "Package or Plan Bought" ? "Payment Recorded / Approved" : ""),
});

const emptyForm = (): Form => ({
  scope: "all",
  include: [],
  exclude: [],
  stages: [newStage("Package or Plan Bought", false)],
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
          <option value="after_action">after trigger</option>
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
  const visible = universal ? [steps[0] || blankStep("after_action", 1)] : steps;
  return <div className={s.side}>
    <div className={s.sideHeadRow}>
      <strong>{title}</strong>
      <div className={s.syncBar}>
        <label>
          <input type="radio" checked={mode === "separate"} onChange={() => onModeChange("separate")} />
          Separate message per day / timing
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
          title={universal ? `Universal ${who === "client" ? "Client" : "Admin"} message` : `Day / Step ${idx + 1} Message`}
          step={step}
          showTiming={!(who === "admin" && canCopyClient && universal)}
          canRemove={!universal && steps.length > 1}
          onChange={patch => onUpdateSteps(steps.map((st, i) => i === idx ? { ...st, ...patch } : st))}
          onRemove={() => onUpdateSteps(steps.filter((_, i) => i !== idx))}
        />
      ))}
      {!universal && steps.length < 10 && (
        <button type="button" className={s.ghost} onClick={() => onUpdateSteps([...steps, blankStep("after_due", 2)])}>
          + Add another day / follow-up for {who === "client" ? "Client" : "Admin"}
        </button>
      )}
    </div>
  </div>;
}

function StageCard({
  index, stage, allStages, onChange, onRemove, onChainFromStop,
}: {
  index: number;
  stage: TrailStage;
  allStages: TrailStage[];
  onChange: (next: TrailStage) => void;
  onRemove?: () => void;
  onChainFromStop: (stopWork: string) => void;
}) {
  const set = (patch: Partial<TrailStage>) => onChange({ ...stage, ...patch });
  const rem = stage.reminder;
  const setRem = (patch: Partial<ReminderRule>) => set({ reminder: { ...rem, ...patch } });
  const condition = CONDITIONS.find(item => item.id === rem.condition);
  const showClient = rem.audience === "client" || rem.audience === "both";
  const showAdmin = rem.audience === "admin" || rem.audience === "both";
  const [stopPick, setStopPick] = useState("");

  return <>
    {index > 0 && (
      <div className={s.chainLink}>
        <span>⛓ Next link in the trail (triggered when the stop point above happens)</span>
      </div>
    )}

    <section className={s.stage}>
      <header className={s.stageHead}>
        <div className={s.stageTitle}>
          <span className={s.badge}>Stage {index + 1}</span>
          <div>
            <h3>{stage.fromPreviousStop ? `When "${stage.work || "Stop Trigger"}" happens` : "Starting Work / Trigger Point"}</h3>
            <p>{stage.fromPreviousStop
              ? "This trigger stopped the previous reminder—now decide what Auto Msg or next Reminder should start on it."
              : "Pick the work (trigger point) that begins this trail."}</p>
          </div>
        </div>
        {onRemove && <button type="button" className={s.remove} onClick={onRemove}>Remove stage ✕</button>}
      </header>

      {/* Trigger Work selector (unified list) */}
      <div className={s.line}>
        <span>Trigger work</span>
        <select aria-label={`Stage ${index + 1} trigger work`} value={stage.work} onChange={e => set({ work: e.target.value })}>
          <option value="">Choose a trigger work…</option>
          <WorkOptions />
        </select>
      </div>

      {/* Part A: Auto Msg on this trigger */}
      <div className={s.subSection}>
        <div className={s.subHead}>
          <strong>A. Auto Message on “{stage.work || "this trigger"}” (Instant)</strong>
        </div>
        <label className={s.check}>
          <input type="checkbox" checked={stage.clientNow.on} onChange={e => set({ clientNow: { ...stage.clientNow, on: e.target.checked } })} />
          Send Auto Msg to Client right away
        </label>
        {stage.clientNow.on && (
          <MessageEditor title="Client instant auto message" step={{ timingRef: "after_action", amount: 0, unit: "days", ...stage.clientNow }}
            showTiming={false} onChange={patch => set({ clientNow: { ...stage.clientNow, ...patch } })} />
        )}

        <label className={s.check}>
          <input type="checkbox" checked={stage.adminNow.on} onChange={e => set({ adminNow: { ...stage.adminNow, on: e.target.checked } })} />
          Send Auto Msg to Admin right away
        </label>
        {stage.adminNow.on && (
          <MessageEditor title="Admin instant auto message" step={{ timingRef: "after_action", amount: 0, unit: "days", ...stage.adminNow }}
            showTiming={false} onChange={patch => set({ adminNow: { ...stage.adminNow, ...patch } })} />
        )}
      </div>

      {/* Part B: Reminder on this trigger */}
      {!rem.on ? (
        <button type="button" className={s.add} onClick={() => setRem({ on: true })}>
          + Start a Reminder from “{stage.work || "this trigger"}”
        </button>
      ) : (
        <div className={s.reminder}>
          <header>
            <strong>B. Follow-up Reminder for Stage {index + 1}</strong>
            <button type="button" className={s.remove} onClick={() => setRem({ on: false })}>Remove reminder ✕</button>
          </header>

          {/* 1. Starting trigger from the same unified Works list */}
          <div className={s.line}>
            <span>Start reminder on</span>
            <select aria-label="Reminder start trigger" value={rem.startTrigger} onChange={e => setRem({ startTrigger: e.target.value })}>
              <option value="__stage_work__">Same trigger as this stage ({stage.work || "selected work"})</option>
              <WorkOptions />
            </select>
          </div>

          {/* 2. Who receives */}
          <div className={s.line}>
            <span>Send to</span>
            <div className={s.segment} role="group" aria-label="Who receives">
              <button type="button" aria-pressed={rem.audience === "client"} onClick={() => setRem({ audience: "client" })}>Client only</button>
              <button type="button" aria-pressed={rem.audience === "admin"} onClick={() => setRem({ audience: "admin" })}>Admin only</button>
              <button type="button" aria-pressed={rem.audience === "both"} onClick={() => setRem({ audience: "both" })}>Both (Client &amp; Admin)</button>
            </div>
          </div>

          {/* 3. Message builders (Client & Admin both support day-wise vs universal + Copy client days) */}
          {showClient && (
            <AudienceBlock
              who="client"
              title="Reminder Messages for Client"
              mode={rem.clientMode}
              steps={rem.clientSteps}
              onModeChange={clientMode => setRem({ clientMode })}
              onUpdateSteps={clientSteps => setRem({ clientSteps })}
            />
          )}
          {showAdmin && (
            <AudienceBlock
              who="admin"
              title="Reminder Messages for Admin / Team"
              mode={rem.adminMode}
              steps={rem.adminSteps}
              canCopyClient={showClient}
              onModeChange={adminMode => setRem({ adminMode })}
              onCopyClient={() => setRem({ adminMode: "separate", adminSteps: rem.clientSteps.map(st => ({ ...st })) })}
              onUpdateSteps={adminSteps => setRem({ adminSteps })}
            />
          )}

          {/* 4. Repeat / Duration control */}
          <div className={s.repeatBox}>
            <div className={s.line}>
              <span>Repeat duration</span>
              <div className={s.segment} role="group" aria-label="Repeat duration">
                <button type="button" aria-pressed={rem.repeatMode === "permanent"} onClick={() => setRem({ repeatMode: "permanent" })}>
                  Permanent (until stop trigger)
                </button>
                <button type="button" aria-pressed={rem.repeatMode === "limited"} onClick={() => setRem({ repeatMode: "limited" })}>
                  Fixed days limit
                </button>
              </div>
            </div>
            <div className={s.line}>
              {rem.repeatMode === "limited" && <>
                <span>For</span>
                <input type="number" min={1} max={180} aria-label="Repeat for days" value={rem.repeatForDays}
                  onChange={e => setRem({ repeatForDays: Math.max(1, Number(e.target.value || 1)) })} />
                <em>days</em>
              </>}
              <span>Every</span>
              <input type="number" min={1} max={90} aria-label="Repeat every days" value={rem.repeatEveryDays}
                onChange={e => setRem({ repeatEveryDays: Math.max(1, Number(e.target.value || 1)) })} />
              <em>days</em>
              <span>Per day</span>
              <select aria-label="Per day" value={rem.repeatPerDay} onChange={e => setRem({ repeatPerDay: Number(e.target.value || 1) })}>
                <option value={1}>1x / day</option>
                <option value={2}>2x / day (12h)</option>
                <option value={3}>3x / day (8h)</option>
                <option value={4}>4x / day (6h)</option>
              </select>
            </div>
          </div>

          {/* 5. Stop Trigger (from the exact same unified Works list) + Direct Chain Continuation! */}
          <div className={s.stopBox}>
            <div className={s.line}>
              <span>Stop reminder when</span>
              <select aria-label="Add stop trigger" value={stopPick} onChange={e => {
                const val = e.target.value;
                if (val && !rem.stopOn.includes(val)) setRem({ stopOn: [...rem.stopOn, val] });
                setStopPick("");
              }}>
                <option value="">Choose a stop trigger work to add…</option>
                <WorkOptions exclude={rem.stopOn} />
              </select>
            </div>

            {rem.stopOn.length > 0 && (
              <div className={s.stopCards}>
                {rem.stopOn.map(stopWork => {
                  const linkedIdx = allStages.findIndex((st, idx) => idx > index && st.work === stopWork);
                  return (
                    <div key={stopWork} className={s.stopCard}>
                      <div className={s.stopCardMain}>
                        <strong>Stops when: {stopWork}</strong>
                        <button type="button" className={s.remove} aria-label={`Remove ${stopWork}`}
                          onClick={() => setRem({ stopOn: rem.stopOn.filter(x => x !== stopWork) })}>✕</button>
                      </div>
                      <div className={s.stopCardChain}>
                        {linkedIdx >= 0 ? (
                          <span className={s.linkedBadge}>✓ Trail continues on “{stopWork}” in Stage {linkedIdx + 1} below</span>
                        ) : (
                          <button type="button" className={s.chainBtn} onClick={() => onChainFromStop(stopWork)}>
                            ⛓ On “{stopWork}” → + Send next Auto Msg or start another Reminder
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 6. Last: Count days from & Only when */}
          <div className={s.tailRules}>
            <small>Timing reference &amp; extra condition (applied at the end of this reminder rule)</small>
            <div className={s.line}>
              <span>Count days from</span>
              <select aria-label="Count days from" value={rem.countDaysFrom} onChange={e => setRem({ countDaysFrom: e.target.value as TimingRef })}>
                {TRIGGERS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </div>
            <div className={s.line}>
              <span>Only when</span>
              <select aria-label="Only when condition" value={rem.condition} onChange={e => setRem({ condition: e.target.value })}>
                {CONDITIONS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
              {condition && "value" in condition && (
                <input type="number" min={0} aria-label="Condition value" value={rem.conditionValue}
                  onChange={e => setRem({ conditionValue: Number(e.target.value || 0) })} />
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  </>;
}

function FormDialog({ onClose, onSave }: { onClose: () => void; onSave: () => void }) {
  const [form, setForm] = useState<Form>(emptyForm);
  const set = (patch: Partial<Form>) => setForm(current => ({ ...current, ...patch }));
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function chainStageAfter(afterIndex: number, stopWork: string) {
    setForm(current => {
      const next = [...current.stages];
      next.splice(afterIndex + 1, 0, newStage(stopWork, true));
      return { ...current, stages: next };
    });
  }

  return <div className={s.overlay}>
    <div className={s.backdrop} onClick={onClose} />
    <div className={s.dialog} role="dialog" aria-modal="true" aria-labelledby="amsg-title">
      <header className={s.dialogHead}>
        <div>
          <h2 id="amsg-title">Create automated message trail</h2>
          <p>Start with a trigger work, attach an Auto Msg and a Reminder, and continue the trail right from the trigger point that stops the reminder.</p>
        </div>
        <button type="button" className={s.close} aria-label="Close" onClick={onClose}>✕</button>
      </header>

      <div className={s.dialogBody}>
        {/* Package Scope at top */}
        <section className={s.scopeBar}>
          <div className={s.line}>
            <span>Packages scope</span>
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

        {/* Continuous Chain of Stages */}
        {form.stages.map((stage, index) => (
          <StageCard
            key={stage.id}
            index={index}
            stage={stage}
            allStages={form.stages}
            onChange={next => set({ stages: form.stages.map(item => item.id === stage.id ? next : item) })}
            onRemove={form.stages.length > 1 ? () => set({ stages: form.stages.filter(item => item.id !== stage.id) }) : undefined}
            onChainFromStop={stopWork => chainStageAfter(index, stopWork)}
          />
        ))}
      </div>

      <footer className={s.dialogFoot}>
        <small>UI preview ({form.stages.length} {form.stages.length === 1 ? "stage" : "chained stages"} in trail): nothing is saved yet.</small>
        <span>
          <button type="button" className={s.ghost} onClick={onClose}>Cancel</button>
          <button type="button" className={s.primary} onClick={onSave}>Save &amp; Activate Trail</button>
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
      <p>Every automated message and reminder trail, starting directly with its Work name and an <strong>Edit</strong> button.</p>
      <button type="button" className={s.primary} onClick={() => { setNotice(false); setOpen(true); }}>+ Create automated msg</button>
    </div>
    {notice && <p className={s.notice}>This is a UI preview, so nothing was saved. The form will be connected in the next step.</p>}
    <div className={s.empty}><strong>No automated message trails yet</strong><span>Use “Create automated msg” to open the trail form.</span></div>
    {open && <FormDialog onClose={() => setOpen(false)} onSave={() => { setOpen(false); setNotice(true); }} />}
  </section>;
}
