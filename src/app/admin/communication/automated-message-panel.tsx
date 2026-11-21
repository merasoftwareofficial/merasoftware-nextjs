"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCommunicationRefresh } from "@/lib/communication-live";
import type { ActionPackageOption, ActionsData } from "./action-rule-helpers";
import s from "./automated-message.module.css";
import {
  allowedConditionIds, BASE_DATES, buildWorkCatalog, CONDITIONS,
  defaultReminderTiming, MAX_CHAIN_DEPTH, PACKAGE_SCOPES, PLACEHOLDERS,
  timingPositionLabel,
  type BaseDate, type Channel, type InstantAudience, type MessageMode,
  type PackageScopeMode, type ReminderAudience, type RepeatMode,
  type TimingPos, type Unit, type WorkFolder, type WorkItem,
} from "./automated-message-options";

/**
 * Automated message system — Single-Form End-to-End Trail (SSOT).
 * Every stage (root & Stop-Trigger chained) uses the same TrailStageBlock:
 * Trigger -> Template (Auto Message) -> Reminder -> Stop Trigger (+ Next stage) -> ...
 */

type TimingSlot = { amount: number; unit: Unit; pos: TimingPos };
type MessageStep = TimingSlot & { channel: Channel; subject: string; text: string };
type SingleMsg = { channel: Channel; subject: string; text: string };
type InstantBlockState = { audience: InstantAudience; client: SingleMsg; admin: SingleMsg };

type StopChain = {
  instant: InstantBlockState;
  reminders: Reminder[];
};

type Reminder = {
  id: number;
  startTrigger: string;
  audience: ReminderAudience;
  clientMode: MessageMode;
  adminMode: MessageMode;
  clientSteps: MessageStep[];
  adminSteps: MessageStep[];
  repeatMode: RepeatMode;
  repeatForDays: number;
  repeatEveryDays: number;
  repeatPerDay: number;
  countDaysFrom: BaseDate;
  condition: string;
  conditionValue: number;
  stopOn: string[];
  stopChains: Record<string, StopChain>;
};

type TrailForm = {
  _id?: string;
  triggers: string[];
  scope: PackageScopeMode;
  selectedPackages: string[];
  instant: InstantBlockState;
  reminders: Reminder[];
  enabled?: boolean;
  control?: "auto" | "review" | "off";
};

const blankMsg = (): SingleMsg => ({ channel: "whatsapp", subject: "", text: "" });
const blankStep = (pos: TimingPos = "before", amount = 3, unit: Unit = "days"): MessageStep => ({
  amount, unit, pos, channel: "whatsapp", subject: "", text: "",
});
const blankInstant = (audience: InstantAudience = "off"): InstantBlockState => ({
  audience, client: blankMsg(), admin: blankMsg(),
});

let nextId = 1;
const newReminder = (defaultStops: string[] = [], triggerKey?: string): Reminder => {
  const timing = defaultReminderTiming(triggerKey);
  return {
    id: nextId++,
    startTrigger: "__main__",
    audience: "client",
    clientMode: "separate",
    adminMode: "separate",
    clientSteps: [blankStep(timing.pos, timing.amount, timing.unit)],
    adminSteps: [blankStep(timing.pos, timing.amount, timing.unit)],
    repeatMode: "off",
    repeatForDays: 7,
    repeatEveryDays: 2,
    repeatPerDay: 1,
    countDaysFrom: timing.countDaysFrom,
    condition: "any",
    conditionValue: 50,
    stopOn: [...defaultStops],
    stopChains: {},
  };
};

const newStopChain = (defaultStops: string[] = []): StopChain => ({
  instant: blankInstant("client"),
  reminders: [],
});

const emptyForm = (): TrailForm => ({
  triggers: [],
  scope: "all",
  selectedPackages: [],
  instant: blankInstant("client"),
  reminders: [],
});

function normalizeMsg(raw: Partial<SingleMsg> | null | undefined): SingleMsg {
  const base = blankMsg();
  return {
    channel: raw?.channel === "email" || raw?.channel === "both" ? raw.channel : base.channel,
    subject: typeof raw?.subject === "string" ? raw.subject : "",
    text: typeof raw?.text === "string" ? raw.text : "",
  };
}

function normalizeInstant(raw: Partial<InstantBlockState> | null | undefined): InstantBlockState {
  const aud = raw?.audience;
  return {
    audience: aud === "client" || aud === "admin" || aud === "both" ? aud : "off",
    client: normalizeMsg(raw?.client),
    admin: normalizeMsg(raw?.admin),
  };
}

function normalizeSteps(raw: unknown): MessageStep[] {
  if (!Array.isArray(raw) || raw.length === 0) return [blankStep("before", 3)];
  return raw.map(item => {
    const st = (item && typeof item === "object" ? item : {}) as Partial<MessageStep>;
    return {
      amount: typeof st.amount === "number" && Number.isFinite(st.amount) ? Math.max(0, st.amount) : 3,
      unit: st.unit === "hours" ? "hours" : "days",
      pos: st.pos === "on" || st.pos === "after" ? st.pos : "before",
      ...normalizeMsg(st),
    };
  });
}

function normalizeReminder(raw: unknown, depth = 0): Reminder {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<Reminder>;
  const id = typeof r.id === "number" && Number.isFinite(r.id) ? r.id : nextId++;
  if (id >= nextId) nextId = id + 1;
  const rawChains = depth < MAX_CHAIN_DEPTH && r.stopChains && typeof r.stopChains === "object" ? r.stopChains : {};
  const stopChains: Record<string, StopChain> = {};
  for (const [stopKey, ch] of Object.entries(rawChains)) {
    if (!ch || typeof ch !== "object") continue;
    const rawCh = ch as Partial<StopChain>;
    stopChains[stopKey] = {
      instant: normalizeInstant(rawCh.instant),
      reminders: Array.isArray(rawCh.reminders) ? rawCh.reminders.map(sub => normalizeReminder(sub, depth + 1)) : [],
    };
  }
  return {
    id,
    startTrigger: typeof r.startTrigger === "string" && r.startTrigger ? r.startTrigger : "__main__",
    audience: r.audience === "admin" || r.audience === "both" ? r.audience : "client",
    clientMode: r.clientMode === "universal" ? "universal" : "separate",
    adminMode: r.adminMode === "universal" ? "universal" : "separate",
    clientSteps: normalizeSteps(r.clientSteps),
    adminSteps: normalizeSteps(r.adminSteps),
    repeatMode: r.repeatMode === "permanent" || r.repeatMode === "limited" ? r.repeatMode : "off",
    repeatForDays: typeof r.repeatForDays === "number" && Number.isFinite(r.repeatForDays) ? Math.max(1, r.repeatForDays) : 7,
    repeatEveryDays: typeof r.repeatEveryDays === "number" && Number.isFinite(r.repeatEveryDays) ? Math.max(1, r.repeatEveryDays) : 2,
    repeatPerDay: typeof r.repeatPerDay === "number" && Number.isFinite(r.repeatPerDay) ? Math.min(4, Math.max(1, r.repeatPerDay)) : 1,
    countDaysFrom: r.countDaysFrom === "trigger_date" || r.countDaysFrom === "expiry_date" || r.countDaysFrom === "deadline_date" ? r.countDaysFrom : "due_date",
    condition: typeof r.condition === "string" && r.condition ? r.condition : "any",
    conditionValue: typeof r.conditionValue === "number" && Number.isFinite(r.conditionValue) ? Math.max(0, r.conditionValue) : 50,
    stopOn: Array.isArray(r.stopOn) ? r.stopOn.filter((k): k is string => typeof k === "string" && Boolean(k)) : [],
    stopChains,
  };
}

function normalizeTrail(raw: unknown): TrailForm {
  const t = (raw && typeof raw === "object" ? raw : {}) as Partial<TrailForm>;
  return {
    ...(t._id ? { _id: String(t._id) } : {}),
    triggers: Array.isArray(t.triggers) ? t.triggers.filter((k): k is string => typeof k === "string" && Boolean(k)) : [],
    scope: t.scope === "monthly" || t.scope === "onetime" || t.scope === "include" || t.scope === "exclude" ? t.scope : "all",
    selectedPackages: Array.isArray(t.selectedPackages) ? t.selectedPackages.filter((s): s is string => typeof s === "string" && Boolean(s)) : [],
    instant: normalizeInstant(t.instant),
    reminders: Array.isArray(t.reminders) ? t.reminders.map(rem => normalizeReminder(rem, 0)) : [],
    ...(t.enabled !== undefined ? { enabled: Boolean(t.enabled) } : {}),
    ...(t.control === "auto" || t.control === "review" || t.control === "off" ? { control: t.control } : {}),
  };
}

function workLabel(key: string, byKey: Map<string, WorkItem>) {
  return byKey.get(key)?.label || key;
}

function audienceShort(aud: InstantAudience | ReminderAudience) {
  if (aud === "client") return "Client";
  if (aud === "admin") return "Admin";
  if (aud === "both") return "Client + Admin";
  return "Off";
}

function hasInstantContent(inst: InstantBlockState): boolean {
  if (inst.audience === "off") return false;
  if (inst.audience === "client") return Boolean(inst.client.text.trim());
  if (inst.audience === "admin") return Boolean(inst.admin.text.trim());
  return Boolean(inst.client.text.trim() || inst.admin.text.trim());
}

function cleanInstantForSave(inst: InstantBlockState): InstantBlockState {
  if (inst.audience === "off") return inst;
  const hasClient = Boolean(inst.client.text.trim());
  const hasAdmin = Boolean(inst.admin.text.trim());
  if (inst.audience === "client") return hasClient ? inst : { ...inst, audience: "off" };
  if (inst.audience === "admin") return hasAdmin ? inst : { ...inst, audience: "off" };
  if (hasClient && hasAdmin) return inst;
  if (hasClient) return { ...inst, audience: "client" };
  if (hasAdmin) return { ...inst, audience: "admin" };
  return { ...inst, audience: "off" };
}

function countReminders(reminders: Reminder[]): number {
  return reminders.reduce((sum, rem) => {
    const nested = Object.values(rem.stopChains).reduce((acc, ch) => acc + countReminders(ch.reminders), 0);
    return sum + 1 + nested;
  }, 0);
}

function countTemplates(instant: InstantBlockState, reminders: Reminder[]): number {
  const self = hasInstantContent(instant) ? 1 : 0;
  return self + reminders.reduce((sum, rem) => {
    const nested = Object.values(rem.stopChains).reduce((acc, ch) => acc + countTemplates(ch.instant, ch.reminders), 0);
    return sum + nested;
  }, 0);
}

function prepareTrailForSave(form: TrailForm, byKey: Map<string, WorkItem>): { trail: TrailForm; error: string | null } {
  if (!form.triggers.length) return { trail: form, error: "Choose at least one trigger point." };

  const cleanInstant = cleanInstantForSave(form.instant);

  const cleanReminderList = (
    reminders: Reminder[],
    parentTrigger: string,
    depth: number,
  ): { list: Reminder[]; error: string | null } => {
    const out: Reminder[] = [];
    for (let i = 0; i < reminders.length; i++) {
      const rem = reminders[i];
      const effTrigger = depth === 0 && rem.startTrigger !== "__main__" ? rem.startTrigger : parentTrigger;
      const work = byKey.get(effTrigger);
      const allowedConds = allowedConditionIds(work);
      const condition = allowedConds.includes(rem.condition) ? rem.condition : "any";
      const fixStep = (st: MessageStep): MessageStep => (
        rem.countDaysFrom === "trigger_date" && st.pos === "before" ? { ...st, pos: "after" } : st
      );
      const clientSteps = rem.clientSteps.map(fixStep);
      const adminSteps = rem.adminSteps.map(fixStep);

      const showClient = rem.audience === "client" || rem.audience === "both";
      const showAdmin = rem.audience === "admin" || rem.audience === "both";
      const label = workLabel(effTrigger, byKey);

      if (showClient) {
        const missing = rem.clientMode === "universal"
          ? !clientSteps[0]?.text.trim()
          : clientSteps.some(st => !st.text.trim());
        if (missing) return { list: [], error: `Write the Client message in Reminder ${i + 1} (${label}).` };
      }
      if (showAdmin) {
        const missing = rem.adminMode === "universal"
          ? !adminSteps[0]?.text.trim()
          : adminSteps.some(st => !st.text.trim());
        if (missing) return { list: [], error: `Write the Admin message in Reminder ${i + 1} (${label}).` };
      }

      const maxSteps = Math.max(showClient ? clientSteps.length : 0, showAdmin ? adminSteps.length : 0);
      if ((rem.repeatMode === "permanent" || rem.repeatMode === "limited" || maxSteps > 1) && rem.stopOn.length === 0) {
        return { list: [], error: `Add at least one Stop Trigger for Reminder ${i + 1} (${label}).` };
      }

      const nextChains: Record<string, StopChain> = {};
      for (const stopKey of rem.stopOn) {
        const ch = rem.stopChains[stopKey];
        if (!ch) continue;
        const chInstant = cleanInstantForSave(ch.instant);
        const sub = cleanReminderList(ch.reminders, stopKey, depth + 1);
        if (sub.error) return { list: [], error: sub.error };
        if (chInstant.audience === "off" && sub.list.length === 0) {
          return { list: [], error: `Stage on "${workLabel(stopKey, byKey)}" is empty — add a Template/Reminder or remove the stage.` };
        }
        nextChains[stopKey] = { instant: chInstant, reminders: sub.list };
      }

      out.push({
        ...rem,
        condition,
        clientSteps,
        adminSteps,
        stopChains: nextChains,
      });
    }
    return { list: out, error: null };
  };

  const cleaned = cleanReminderList(form.reminders, form.triggers[0], 0);
  if (cleaned.error) return { trail: form, error: cleaned.error };
  if (cleanInstant.audience === "off" && cleaned.list.length === 0) {
    return { trail: form, error: "Write a Template (Auto Message) or add at least one Reminder before saving." };
  }

  return {
    trail: { ...form, instant: cleanInstant, reminders: cleaned.list },
    error: null,
  };
}

function buildFlowTokens(form: TrailForm, byKey: Map<string, WorkItem>): string[] {
  const out: string[] = [];
  if (form.triggers.length > 0) {
    const first = workLabel(form.triggers[0], byKey);
    out.push(form.triggers.length > 1 ? `${first} +${form.triggers.length - 1}` : first);
  }
  if (form.instant.audience !== "off") {
    out.push(`Template (${audienceShort(form.instant.audience)})`);
  }
  const walk = (reminders: Reminder[], depth: number) => {
    if (depth > MAX_CHAIN_DEPTH) return;
    reminders.forEach((rem, idx) => {
      out.push(`Reminder ${idx + 1} (${audienceShort(rem.audience)})`);
      for (const stopKey of rem.stopOn) {
        const ch = rem.stopChains[stopKey];
        if (!ch) continue;
        out.push(`Stop: ${workLabel(stopKey, byKey)}`);
        if (ch.instant.audience !== "off") out.push(`Template (${audienceShort(ch.instant.audience)})`);
        walk(ch.reminders, depth + 1);
      }
    });
  };
  walk(form.reminders, 0);
  return out;
}

function WorkOptions({ folders, exclude = [] }: { folders: WorkFolder[]; exclude?: string[] }) {
  return <>
    {folders.map(group => {
      const items = group.items.filter(item => !exclude.includes(item.key));
      if (!items.length) return null;
      return (
        <optgroup key={group.folder} label={group.folder}>
          {items.map(item => (
            <option key={item.key} value={item.key}>
              {item.label}
            </option>
          ))}
        </optgroup>
      );
    })}
  </>;
}

function applyFormat(
  textarea: HTMLTextAreaElement | null,
  current: string,
  kind: "bold" | "italic" | "list",
  onChange: (next: string) => void,
) {
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
  title,
  step,
  showTiming,
  baseDate = "due_date",
  canRemove,
  onChange,
  onRemove,
}: {
  title: string;
  step: MessageStep;
  showTiming: boolean;
  baseDate?: BaseDate;
  canRemove?: boolean;
  onChange: (patch: Partial<MessageStep>) => void;
  onRemove?: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const effectivePos = baseDate === "trigger_date" && step.pos === "before" ? "after" : step.pos;
  return <div className={s.msgCard}>
    <div className={s.msgHead}>
      <strong>{title}</strong>
      {canRemove && onRemove && (
        <button type="button" className={s.iconBtn} onClick={onRemove}>Remove</button>
      )}
    </div>

    <div className={s.controlRow}>
      {showTiming && (
        <div className={s.inlineGroup}>
          <span className={s.miniLabel}>When</span>
          {effectivePos !== "on" && <>
            <input
              type="number"
              className={s.numInput}
              min={0}
              max={step.unit === "hours" ? 720 : 365}
              aria-label={`${title} amount`}
              value={step.amount}
              onChange={e => onChange({ amount: Math.max(0, Number(e.target.value || 0)) })}
            />
            <select
              className={s.compactSelect}
              aria-label={`${title} unit`}
              value={step.unit}
              onChange={e => onChange({ unit: e.target.value as Unit })}
            >
              <option value="days">days</option>
              <option value="hours">hours</option>
            </select>
          </>}
          <select
            className={s.compactSelect}
            aria-label={`${title} position`}
            value={effectivePos}
            onChange={e => onChange({ pos: e.target.value as TimingPos })}
          >
            {baseDate !== "trigger_date" && (
              <option value="before">{timingPositionLabel("before", baseDate)}</option>
            )}
            <option value="on">{timingPositionLabel("on", baseDate)}</option>
            <option value="after">{timingPositionLabel("after", baseDate)}</option>
          </select>
        </div>
      )}

      <div className={s.inlineGroup}>
        <span className={s.miniLabel}>Via</span>
        <select
          className={s.compactSelect}
          aria-label={`${title} channel`}
          value={step.channel}
          onChange={e => onChange({ channel: e.target.value as Channel })}
        >
          <option value="whatsapp">WhatsApp only</option>
          <option value="email">Email only</option>
          <option value="both">Both (WhatsApp + Email)</option>
        </select>
      </div>
    </div>

    {step.channel !== "whatsapp" && (
      <input
        type="text"
        className={s.textInput}
        placeholder="Email subject…"
        maxLength={300}
        value={step.subject}
        onChange={e => onChange({ subject: e.target.value })}
      />
    )}

    <div className={s.toolbarRow}>
      <div className={s.formatBtns} role="toolbar" aria-label="Text formatting">
        <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => applyFormat(ref.current, step.text, "bold", text => onChange({ text }))}><strong>B</strong></button>
        <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => applyFormat(ref.current, step.text, "italic", text => onChange({ text }))}><em>I</em></button>
        <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => applyFormat(ref.current, step.text, "list", text => onChange({ text }))}>• List</button>
      </div>
      <select
        className={s.varSelect}
        aria-label="Insert variable"
        value=""
        onChange={e => {
          const token = e.target.value;
          if (!token) return;
          const el = ref.current;
          const start = el?.selectionStart ?? step.text.length;
          const end = el?.selectionEnd ?? step.text.length;
          onChange({ text: step.text.slice(0, start) + token + step.text.slice(end) });
        }}
      >
        <option value="">Insert variable ▾</option>
        {PLACEHOLDERS.map(ph => (
          <option key={ph.token} value={ph.token}>{ph.label} ({ph.token})</option>
        ))}
      </select>
    </div>

    <textarea
      ref={ref}
      rows={3}
      className={s.textarea}
      placeholder="Write your message here…"
      maxLength={10000}
      value={step.text}
      onChange={e => onChange({ text: e.target.value })}
    />
  </div>;
}

function InstantAutoMsgBlock({
  state,
  onChange,
}: {
  state: InstantBlockState;
  onChange: (next: InstantBlockState) => void;
}) {
  const showClient = state.audience === "client" || state.audience === "both";
  const showAdmin = state.audience === "admin" || state.audience === "both";
  return <div className={s.stack}>
    <div className={s.fieldRow}>
      <label className={s.fieldLabel}>Send to</label>
      <select
        className={s.select}
        aria-label="Instant message audience"
        value={state.audience}
        onChange={e => onChange({ ...state, audience: e.target.value as InstantAudience })}
      >
        <option value="off">Off (Don&apos;t send instant message)</option>
        <option value="client">Client only</option>
        <option value="admin">Admin / Team only</option>
        <option value="both">Both (Client &amp; Admin)</option>
      </select>
    </div>

    {showClient && (
      <div className={s.audienceCard}>
        <div className={s.audienceHead}>
          <strong>Client</strong>
          <span className={s.badge}>Sent immediately</span>
        </div>
        <MessageEditor
          title="Client instant message"
          step={{ amount: 0, unit: "days", pos: "after", ...state.client }}
          showTiming={false}
          onChange={patch => onChange({ ...state, client: { ...state.client, ...patch } })}
        />
      </div>
    )}

    {showAdmin && (
      <div className={s.audienceCard}>
        <div className={s.audienceHead}>
          <strong>Admin / Team</strong>
          <span className={s.badge}>Sent immediately</span>
        </div>
        <MessageEditor
          title="Admin instant message"
          step={{ amount: 0, unit: "days", pos: "after", ...state.admin }}
          showTiming={false}
          onChange={patch => onChange({ ...state, admin: { ...state.admin, ...patch } })}
        />
      </div>
    )}
  </div>;
}

function AudienceBlock({
  who,
  title,
  mode,
  steps,
  baseDate,
  canCopyClient,
  onModeChange,
  onCopyClient,
  onUpdateSteps,
}: {
  who: "client" | "admin";
  title: string;
  mode: MessageMode;
  steps: MessageStep[];
  baseDate: BaseDate;
  canCopyClient?: boolean;
  onModeChange: (mode: MessageMode) => void;
  onCopyClient?: () => void;
  onUpdateSteps: (next: MessageStep[]) => void;
}) {
  const universal = mode === "universal";
  const adminSyncsClient = who === "admin" && Boolean(canCopyClient) && universal;
  const primaryStep = steps[0] || blankStep(baseDate === "trigger_date" ? "after" : "before", 3);

  return <div className={s.audienceCard}>
    <div className={s.audienceHead}>
      <strong>{title}</strong>
      <div className={s.audienceTools}>
        <select
          className={s.compactSelect}
          aria-label={`${title} message style`}
          value={mode}
          onChange={e => onModeChange(e.target.value as MessageMode)}
        >
          <option value="separate">Separate message per timing</option>
          <option value="universal">
            {who === "admin" && canCopyClient ? "1 universal message (same days as Client)" : "1 universal message (all timings)"}
          </option>
        </select>
        {who === "admin" && canCopyClient && mode === "separate" && onCopyClient && (
          <button type="button" className={s.ghostBtn} onClick={onCopyClient}>Copy client&apos;s days</button>
        )}
      </div>
    </div>

    {universal && !adminSyncsClient && (
      <div className={s.timingList}>
        <span className={s.miniLabel}>Timings (shared by this message)</span>
        {steps.map((slot, idx) => (
          <div key={idx} className={s.timingRow}>
            <span className={s.timingNum}>#{idx + 1}</span>
            {slot.pos !== "on" && <>
              <input
                type="number"
                className={s.numInput}
                min={0}
                max={slot.unit === "hours" ? 720 : 365}
                value={slot.amount}
                onChange={e => onUpdateSteps(steps.map((st, i) => i === idx ? { ...st, amount: Math.max(0, Number(e.target.value || 0)) } : st))}
              />
              <select
                className={s.compactSelect}
                value={slot.unit}
                onChange={e => onUpdateSteps(steps.map((st, i) => i === idx ? { ...st, unit: e.target.value as Unit } : st))}
              >
                <option value="days">days</option>
                <option value="hours">hours</option>
              </select>
            </>}
            <select
              className={s.compactSelect}
              value={baseDate === "trigger_date" && slot.pos === "before" ? "after" : slot.pos}
              onChange={e => onUpdateSteps(steps.map((st, i) => i === idx ? { ...st, pos: e.target.value as TimingPos } : st))}
            >
              {baseDate !== "trigger_date" && (
                <option value="before">{timingPositionLabel("before", baseDate)}</option>
              )}
              <option value="on">{timingPositionLabel("on", baseDate)}</option>
              <option value="after">{timingPositionLabel("after", baseDate)}</option>
            </select>
            {steps.length > 1 && (
              <button type="button" className={s.iconBtn} aria-label="Remove timing" onClick={() => onUpdateSteps(steps.filter((_, i) => i !== idx))}>✕</button>
            )}
          </div>
        ))}
        {steps.length < 10 && (
          <button type="button" className={s.subtleAdd} onClick={() => onUpdateSteps([...steps, blankStep("after", 2)])}>
            + Add timing
          </button>
        )}
      </div>
    )}

    {adminSyncsClient && (
      <p className={s.hint}>Follows Client&apos;s timings automatically — write one message for Admin below.</p>
    )}

    {universal ? (
      <MessageEditor
        title={`Universal ${who === "client" ? "Client" : "Admin"} message`}
        step={primaryStep}
        showTiming={false}
        onChange={patch => onUpdateSteps(steps.map(st => ({ ...st, channel: patch.channel ?? st.channel, subject: patch.subject ?? st.subject, text: patch.text ?? st.text })))}
      />
    ) : (
      <div className={s.stack}>
        {steps.map((step, idx) => (
          <MessageEditor
            key={idx}
            title={`Message ${idx + 1}`}
            step={step}
            showTiming={true}
            baseDate={baseDate}
            canRemove={steps.length > 1}
            onChange={patch => onUpdateSteps(steps.map((st, i) => i === idx ? { ...st, ...patch } : st))}
            onRemove={() => onUpdateSteps(steps.filter((_, i) => i !== idx))}
          />
        ))}
        {steps.length < 10 && (
          <button type="button" className={s.subtleAdd} onClick={() => onUpdateSteps([...steps, blankStep("after", 2)])}>
            + Add follow-up message
          </button>
        )}
      </div>
    )}
  </div>;
}

function ReminderCard({
  index,
  depth,
  reminder,
  inheritedTrigger,
  mainTriggerKey,
  mainTriggerLabel,
  ancestorTriggers,
  folders,
  byKey,
  onChange,
  onRemove,
}: {
  index: number;
  depth: number;
  reminder: Reminder;
  inheritedTrigger?: string;
  mainTriggerKey: string;
  mainTriggerLabel: string;
  ancestorTriggers: string[];
  folders: WorkFolder[];
  byKey: Map<string, WorkItem>;
  onChange: (reminder: Reminder) => void;
  onRemove: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [collapsedChains, setCollapsedChains] = useState<Record<string, boolean>>({});
  const set = (patch: Partial<Reminder>) => onChange({ ...reminder, ...patch });

  const effectiveTrigger = inheritedTrigger || (reminder.startTrigger !== "__main__" ? reminder.startTrigger : mainTriggerKey);
  const effectiveWork = effectiveTrigger ? byKey.get(effectiveTrigger) : undefined;
  const allowedConds = allowedConditionIds(effectiveWork);
  const visibleConditions = CONDITIONS.filter(c => allowedConds.includes(c.id));
  const safeCondition = allowedConds.includes(reminder.condition) ? reminder.condition : "any";
  const conditionDef = CONDITIONS.find(item => item.id === safeCondition);

  const showClient = reminder.audience === "client" || reminder.audience === "both";
  const showAdmin = reminder.audience === "admin" || reminder.audience === "both";

  const msgCount = (showClient ? reminder.clientSteps.length : 0) + (showAdmin ? reminder.adminSteps.length : 0);
  const repeatSummary = reminder.repeatMode === "permanent"
    ? "Repeat: Permanent"
    : reminder.repeatMode === "limited"
      ? `Repeat: ${reminder.repeatForDays}d`
      : "No repeat";
  const stopSummary = reminder.stopOn.length > 0
    ? `Stops on: ${workLabel(reminder.stopOn[0], byKey)}${reminder.stopOn.length > 1 ? ` +${reminder.stopOn.length - 1}` : ""}`
    : "No stop trigger";

  function copyClientDays() {
    set({
      adminMode: "separate",
      adminSteps: reminder.clientSteps.map(st => ({ ...st })),
    });
  }

  function handleStartTriggerChange(nextStart: string) {
    const targetKey = nextStart === "__main__" ? mainTriggerKey : nextStart;
    const targetWork = targetKey ? byKey.get(targetKey) : undefined;
    const nextAllowed = allowedConditionIds(targetWork);
    set({
      startTrigger: nextStart,
      condition: nextAllowed.includes(reminder.condition) ? reminder.condition : "any",
    });
  }

  function handleBaseDateChange(nextBase: BaseDate) {
    if (nextBase === "trigger_date") {
      const fixPos = (st: MessageStep): MessageStep => (st.pos === "before" ? { ...st, pos: "after" } : st);
      set({
        countDaysFrom: nextBase,
        clientSteps: reminder.clientSteps.map(fixPos),
        adminSteps: reminder.adminSteps.map(fixPos),
      });
      return;
    }
    set({ countDaysFrom: nextBase });
  }

  function removeStopTrigger(stopKey: string) {
    const nextChains = { ...reminder.stopChains };
    delete nextChains[stopKey];
    set({
      stopOn: reminder.stopOn.filter(k => k !== stopKey),
      stopChains: nextChains,
    });
  }

  function attachChain(stopKey: string) {
    set({
      stopChains: { ...reminder.stopChains, [stopKey]: newStopChain() },
    });
  }

  function updateChain(stopKey: string, next: StopChain) {
    set({ stopChains: { ...reminder.stopChains, [stopKey]: next } });
  }

  function removeChain(stopKey: string) {
    const nextChains = { ...reminder.stopChains };
    delete nextChains[stopKey];
    set({ stopChains: nextChains });
  }

  const nextAncestors = effectiveTrigger && !ancestorTriggers.includes(effectiveTrigger)
    ? [...ancestorTriggers, effectiveTrigger]
    : ancestorTriggers;

  return <div className={s.remCard} data-depth={Math.min(depth, 3)}>
    <header className={s.remHeader}>
      <button type="button" className={s.collapseBtn} onClick={() => setCollapsed(v => !v)} aria-expanded={!collapsed}>
        <span className={s.chevron}>{collapsed ? "▸" : "▾"}</span>
        <strong>Reminder {index + 1}</strong>
        {inheritedTrigger && (
          <span className={s.triggerPill}>On: {workLabel(inheritedTrigger, byKey)}</span>
        )}
        <span className={s.summaryMeta}>
          {audienceShort(reminder.audience)} · {msgCount} msg{msgCount === 1 ? "" : "s"} · {repeatSummary} · {stopSummary}
        </span>
      </button>
      <button type="button" className={s.iconBtn} aria-label={`Remove reminder ${index + 1}`} onClick={onRemove}>✕</button>
    </header>

    {!collapsed && <div className={s.remBody}>
      {/* 1. Start trigger (hidden on chained reminders because Stop Trigger above is already the trigger) */}
      {!inheritedTrigger && (
        <div className={s.fieldRow}>
          <label className={s.fieldLabel}>Start when</label>
          <select
            className={s.select}
            aria-label="Start reminder trigger"
            value={reminder.startTrigger}
            onChange={e => handleStartTriggerChange(e.target.value)}
          >
            <option value="__main__">Same as main trigger ({mainTriggerLabel || "selected trigger"})</option>
            <WorkOptions folders={folders} />
          </select>
        </div>
      )}

      {/* 2. Send to (consistent dropdown) */}
      <div className={s.fieldRow}>
        <label className={s.fieldLabel}>Send to</label>
        <select
          className={s.select}
          aria-label="Reminder audience"
          value={reminder.audience}
          onChange={e => set({ audience: e.target.value as ReminderAudience })}
        >
          <option value="client">Client only</option>
          <option value="admin">Admin / Team only</option>
          <option value="both">Both (Client &amp; Admin)</option>
        </select>
      </div>

      {/* 3. Message editors */}
      {showClient && (
        <AudienceBlock
          who="client"
          title="Client"
          mode={reminder.clientMode}
          steps={reminder.clientSteps}
          baseDate={reminder.countDaysFrom}
          onModeChange={clientMode => set({ clientMode })}
          onUpdateSteps={clientSteps => set({ clientSteps })}
        />
      )}
      {showAdmin && (
        <AudienceBlock
          who="admin"
          title="Admin / Team"
          mode={reminder.adminMode}
          steps={reminder.adminSteps}
          baseDate={reminder.countDaysFrom}
          canCopyClient={showClient}
          onModeChange={adminMode => set({ adminMode })}
          onCopyClient={copyClientDays}
          onUpdateSteps={adminSteps => set({ adminSteps })}
        />
      )}

      {/* 4. Repeat (dropdown-first, includes Off) */}
      <div className={s.subBox}>
        <div className={s.fieldRow}>
          <label className={s.fieldLabel}>Repeat</label>
          <select
            className={s.select}
            aria-label="Repeat mode"
            value={reminder.repeatMode}
            onChange={e => set({ repeatMode: e.target.value as RepeatMode })}
          >
            <option value="off">Off (No repeat — scheduled messages only)</option>
            <option value="permanent">Permanent (until stop trigger happens)</option>
            <option value="limited">Fixed days limit</option>
          </select>
        </div>

        {reminder.repeatMode !== "off" && (
          <div className={s.controlRow}>
            {reminder.repeatMode === "limited" && (
              <div className={s.inlineGroup}>
                <span className={s.miniLabel}>For</span>
                <input
                  type="number"
                  className={s.numInput}
                  min={1}
                  max={180}
                  aria-label="Repeat for days"
                  value={reminder.repeatForDays}
                  onChange={e => set({ repeatForDays: Math.max(1, Number(e.target.value || 1)) })}
                />
                <span className={s.unitText}>days</span>
              </div>
            )}
            <div className={s.inlineGroup}>
              <span className={s.miniLabel}>Every</span>
              <input
                type="number"
                className={s.numInput}
                min={1}
                max={90}
                aria-label="Repeat every days"
                value={reminder.repeatEveryDays}
                onChange={e => set({ repeatEveryDays: Math.max(1, Number(e.target.value || 1)) })}
              />
              <span className={s.unitText}>days</span>
            </div>
            <div className={s.inlineGroup}>
              <span className={s.miniLabel}>Frequency</span>
              <select
                className={s.compactSelect}
                aria-label="Per day frequency"
                value={reminder.repeatPerDay}
                onChange={e => set({ repeatPerDay: Number(e.target.value || 1) })}
              >
                <option value={1}>1x / day</option>
                <option value={2}>2x / day (every 12h)</option>
                <option value={3}>3x / day (every 8h)</option>
                <option value={4}>4x / day (every 6h)</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* 5. Base date & condition (at the end, zero duplication with When) */}
      <div className={s.subBox}>
        <div className={s.fieldRow}>
          <label className={s.fieldLabel}>Count days from</label>
          <select
            className={s.select}
            aria-label="Count days from"
            value={reminder.countDaysFrom}
            onChange={e => handleBaseDateChange(e.target.value as BaseDate)}
          >
            {BASE_DATES.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </div>
        {visibleConditions.length > 1 && (
          <div className={s.fieldRow}>
            <label className={s.fieldLabel}>Only when</label>
            <div className={s.inlineGroup}>
              <select
                className={s.select}
                aria-label="Only when condition"
                value={safeCondition}
                onChange={e => {
                  const nextIdVal = e.target.value;
                  const found = CONDITIONS.find(c => c.id === nextIdVal);
                  set({
                    condition: nextIdVal,
                    conditionValue: found && "defaultVal" in found ? found.defaultVal : reminder.conditionValue,
                  });
                }}
              >
                {visibleConditions.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
              {conditionDef && "value" in conditionDef && (
                <input
                  type="number"
                  className={s.numInput}
                  min={0}
                  max={conditionDef.max}
                  aria-label="Condition value"
                  value={reminder.conditionValue}
                  onChange={e => set({ conditionValue: Math.max(0, Number(e.target.value || 0)) })}
                />
              )}
            </div>
          </div>
        )}
      </div>

      {/* 6. Stop triggers + [ + Next stage ] Template -> Reminder loop */}
      <div className={s.stopBox}>
        <div className={s.fieldRow}>
          <label className={s.fieldLabel}>Stop when</label>
          <select
            className={s.select}
            aria-label="Add stop trigger"
            value=""
            onChange={e => {
              const val = e.target.value;
              if (val && !reminder.stopOn.includes(val)) set({ stopOn: [...reminder.stopOn, val] });
            }}
          >
            <option value="">Add a stop trigger…</option>
            <WorkOptions folders={folders} exclude={effectiveTrigger ? [...reminder.stopOn, effectiveTrigger] : reminder.stopOn} />
          </select>
        </div>

        {reminder.stopOn.length > 0 && (
          <div className={s.stopList}>
            {reminder.stopOn.map(stopKey => {
              const stopName = workLabel(stopKey, byKey);
              const chain = reminder.stopChains[stopKey];
              const chainCollapsed = Boolean(collapsedChains[stopKey]);
              const canChain = !chain && depth + 1 < MAX_CHAIN_DEPTH && !nextAncestors.includes(stopKey);
              return (
                <div key={stopKey} className={s.stopItem}>
                  <div className={s.stopChipRow}>
                    <span className={s.stopChip} data-linked={Boolean(chain)}>
                      <span>{stopName}</span>
                      {canChain && (
                        <button
                          type="button"
                          className={s.plusBtn}
                          title={`Continue trail on "${stopName}" (Template → Reminder)`}
                          aria-label={`Start next stage on ${stopName}`}
                          onClick={() => attachChain(stopKey)}
                        >
                          + Next stage
                        </button>
                      )}
                      <button type="button" className={s.chipClose} aria-label={`Remove ${stopName}`} onClick={() => removeStopTrigger(stopKey)}>✕</button>
                    </span>
                  </div>

                  {chain && (
                    <div className={s.chainBranch} data-depth={Math.min(depth + 1, 3)}>
                      <header className={s.chainHead}>
                        <button
                          type="button"
                          className={s.collapseBtn}
                          aria-expanded={!chainCollapsed}
                          onClick={() => setCollapsedChains(prev => ({ ...prev, [stopKey]: !prev[stopKey] }))}
                        >
                          <span className={s.chevron}>{chainCollapsed ? "▸" : "▾"}</span>
                          <strong>Next stage on “{stopName}”</strong>
                          <span className={s.summaryMeta}>
                            {chain.instant.audience !== "off" ? `Template (${audienceShort(chain.instant.audience)})` : "Template off"}
                            {chain.reminders.length > 0 ? ` · ${chain.reminders.length} reminder${chain.reminders.length > 1 ? "s" : ""}` : ""}
                          </span>
                        </button>
                        <button type="button" className={s.iconBtn} onClick={() => removeChain(stopKey)}>Remove stage</button>
                      </header>

                      {!chainCollapsed && <div className={s.chainBody}>
                        <TrailStageBlock
                          triggerKey={stopKey}
                          triggerLabel={stopName}
                          depth={depth + 1}
                          mainTriggerKey={mainTriggerKey}
                          mainTriggerLabel={mainTriggerLabel}
                          ancestorTriggers={[...nextAncestors, stopKey]}
                          instant={chain.instant}
                          reminders={chain.reminders}
                          folders={folders}
                          byKey={byKey}
                          onChangeInstant={instant => updateChain(stopKey, { ...chain, instant })}
                          onChangeReminders={reminders => updateChain(stopKey, { ...chain, reminders })}
                        />
                      </div>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>}
  </div>;
}

function TrailStageBlock({
  triggerKey,
  triggerLabel,
  depth,
  mainTriggerKey,
  mainTriggerLabel,
  ancestorTriggers,
  instant,
  reminders,
  folders,
  byKey,
  onChangeInstant,
  onChangeReminders,
}: {
  triggerKey: string;
  triggerLabel: string;
  depth: number;
  mainTriggerKey: string;
  mainTriggerLabel: string;
  ancestorTriggers: string[];
  instant: InstantBlockState;
  reminders: Reminder[];
  folders: WorkFolder[];
  byKey: Map<string, WorkItem>;
  onChangeInstant: (next: InstantBlockState) => void;
  onChangeReminders: (next: Reminder[]) => void;
}) {
  function addStageReminder() {
    const defaultStops = (byKey.get(triggerKey)?.defaultStopOn || []).filter(k => byKey.has(k) && k !== triggerKey);
    onChangeReminders([...reminders, newReminder(defaultStops, triggerKey)]);
  }

  return <div className={s.stageStack}>
    {/* 1. Template (Auto Message) */}
    <div className={s.stageSection}>
      <div className={s.stageSectionHead}>
        <div className={s.stageTitleGroup}>
          <span className={s.stageBadge}>Template</span>
          <strong>Instant auto message</strong>
        </div>
        <span className={s.summaryMeta}>
          {triggerLabel ? `Sent immediately when “${triggerLabel}” happens` : "Sent immediately on trigger"}
        </span>
      </div>
      <InstantAutoMsgBlock state={instant} onChange={onChangeInstant} />
    </div>

    {/* 2. Follow-up Reminders (+ Stop-Trigger Next Stage Loop) */}
    <div className={s.stageSection}>
      <div className={s.stageSectionHead}>
        <div className={s.stageTitleGroup}>
          <span className={s.stageBadge} data-kind="reminder">Reminder</span>
          <strong>Follow-up reminders</strong>
        </div>
        <span className={s.summaryMeta}>
          {reminders.length > 0 ? "Click “+ Next stage” on a Stop Trigger below to continue the loop" : "Optional — add a reminder after this template"}
        </span>
      </div>

      <div className={s.stack}>
        {reminders.map((rem, idx) => (
          <ReminderCard
            key={rem.id}
            index={idx}
            depth={depth}
            reminder={rem}
            inheritedTrigger={depth > 0 ? triggerKey : undefined}
            mainTriggerKey={mainTriggerKey}
            mainTriggerLabel={mainTriggerLabel}
            ancestorTriggers={ancestorTriggers}
            folders={folders}
            byKey={byKey}
            onChange={next => onChangeReminders(reminders.map(item => item.id === rem.id ? next : item))}
            onRemove={() => onChangeReminders(reminders.filter(item => item.id !== rem.id))}
          />
        ))}
        <button
          type="button"
          className={reminders.length > 0 ? s.subtleStageAdd : s.addBtn}
          onClick={addStageReminder}
        >
          {reminders.length > 0
            ? "+ Add another reminder on same trigger"
            : depth > 0
              ? `+ Add reminder on “${triggerLabel}”`
              : "+ Add reminder"}
        </button>
      </div>
    </div>
  </div>;
}

function FormDialog({
  initial,
  folders,
  byKey,
  packages,
  isLive,
  saving,
  error,
  onClose,
  onSave,
}: {
  initial: TrailForm;
  folders: WorkFolder[];
  byKey: Map<string, WorkItem>;
  packages: ActionPackageOption[];
  isLive: boolean;
  saving: boolean;
  error: string;
  onClose: () => void;
  onSave: (form: TrailForm) => void;
}) {
  const [form, setForm] = useState<TrailForm>(initial);
  const [localError, setLocalError] = useState("");
  const set = (patch: Partial<TrailForm>) => {
    if (localError) setLocalError("");
    setForm(curr => ({ ...curr, ...patch }));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const primaryKey = form.triggers[0] || "";
  const extraKeys = form.triggers.slice(1);
  const primaryWork = primaryKey ? byKey.get(primaryKey) : undefined;
  const hasPackageScope = form.triggers.some(k => byKey.get(k)?.supportsScope);
  const flowTokens = useMemo(() => buildFlowTokens(form, byKey), [form, byKey]);
  const totalTemplates = useMemo(() => countTemplates(form.instant, form.reminders), [form.instant, form.reminders]);
  const totalReminders = useMemo(() => countReminders(form.reminders), [form.reminders]);

  function setPrimaryTrigger(nextKey: string) {
    const nextTriggers = nextKey ? [nextKey, ...extraKeys.filter(k => k !== nextKey)] : [];
    const stillSupportsScope = nextTriggers.some(k => byKey.get(k)?.supportsScope);
    const nextAllowed = allowedConditionIds(nextKey ? byKey.get(nextKey) : undefined);
    const nextReminders = form.reminders.map(rem => (
      rem.startTrigger === "__main__" && !nextAllowed.includes(rem.condition)
        ? { ...rem, condition: "any" }
        : rem
    ));
    set({
      triggers: nextTriggers,
      reminders: nextReminders,
      ...(stillSupportsScope ? {} : { scope: "all", selectedPackages: [] }),
    });
  }

  function addExtraTrigger(key: string) {
    if (!key || form.triggers.includes(key)) return;
    set({ triggers: [...form.triggers, key] });
  }

  function removeExtraTrigger(key: string) {
    const nextTriggers = form.triggers.filter(k => k !== key);
    const stillSupportsScope = nextTriggers.some(k => byKey.get(k)?.supportsScope);
    set({
      triggers: nextTriggers,
      ...(stillSupportsScope ? {} : { scope: "all", selectedPackages: [] }),
    });
  }

  function handleSaveClick() {
    const { trail, error: valError } = prepareTrailForSave(form, byKey);
    if (valError) {
      setLocalError(valError);
      return;
    }
    setLocalError("");
    onSave(trail);
  }

  const pkgBySlug = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of packages) map.set(p.slug, p.name);
    return map;
  }, [packages]);

  return <div className={s.overlay}>
    <div className={s.backdrop} onClick={onClose} />
    <div className={s.dialog} role="dialog" aria-modal="true" aria-labelledby="amsg-title">
      <header className={s.dialogHead}>
        <div>
          <h2 id="amsg-title">{form._id ? "Edit automated message" : "Create automated message"}</h2>
          <p>Start with a trigger point, add an instant message, and chain reminders as far as you need.</p>
        </div>
        <div className={s.headRight}>
          <span className={s.liveTag} data-live={isLive}>{isLive ? "Live catalog" : "Preview catalog"}</span>
          <button type="button" className={s.closeBtn} aria-label="Close" onClick={onClose}>✕</button>
        </div>
      </header>

      {flowTokens.length > 0 && (
        <div className={s.flowStrip} aria-label="Live trail summary">
          {flowTokens.map((tok, i) => (
            <span key={`${tok}-${i}`} className={s.flowItem}>
              {i > 0 && <span className={s.flowArrow}>→</span>}
              <span className={s.flowPill}>{tok}</span>
            </span>
          ))}
        </div>
      )}

      <div className={s.dialogBody}>
        <div className={s.timeline}>
          {/* STEP 1: Trigger Point (+ conditional Packages) */}
          <section className={s.step}>
            <div className={s.stepHead}>
              <span className={s.stepNum}>1</span>
              <div>
                <h3>Trigger point</h3>
                <p>Which work starts this automated message trail?</p>
              </div>
            </div>

            <div className={s.fieldRow}>
              <label className={s.fieldLabel}>Trigger</label>
              <div className={s.triggerControls}>
                <select
                  className={s.select}
                  aria-label="Primary trigger point"
                  value={primaryKey}
                  onChange={e => setPrimaryTrigger(e.target.value)}
                >
                  <option value="">Choose a trigger point…</option>
                  <WorkOptions folders={folders} />
                </select>

                {primaryKey && (
                  <select
                    className={s.compactSelect}
                    aria-label="Also trigger on"
                    value=""
                    onChange={e => addExtraTrigger(e.target.value)}
                  >
                    <option value="">+ Also trigger on…</option>
                    <WorkOptions folders={folders} exclude={form.triggers} />
                  </select>
                )}
              </div>
            </div>

            {primaryWork?.when && (
              <p className={s.hint}>{primaryWork.when}</p>
            )}

            {extraKeys.length > 0 && (
              <div className={s.chipList}>
                {extraKeys.map(key => (
                  <span key={key} className={s.chip}>
                    {workLabel(key, byKey)}
                    <button type="button" className={s.chipClose} aria-label={`Remove ${workLabel(key, byKey)}`} onClick={() => removeExtraTrigger(key)}>✕</button>
                  </span>
                ))}
              </div>
            )}

            {/* Packages ONLY shown when selected trigger supports package scope */}
            {hasPackageScope && (
              <div className={s.subBox}>
                <div className={s.fieldRow}>
                  <label className={s.fieldLabel}>Packages</label>
                  <select
                    className={s.select}
                    aria-label="Package scope"
                    value={form.scope}
                    onChange={e => set({ scope: e.target.value as PackageScopeMode, selectedPackages: [] })}
                  >
                    {PACKAGE_SCOPES.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
                  </select>
                </div>

                {(form.scope === "include" || form.scope === "exclude") && (
                  <div className={s.stack}>
                    <div className={s.fieldRow}>
                      <label className={s.fieldLabel}>{form.scope === "include" ? "Include" : "Exclude"}</label>
                      <select
                        className={s.select}
                        aria-label="Pick package"
                        value=""
                        onChange={e => {
                          const slug = e.target.value;
                          if (slug && !form.selectedPackages.includes(slug)) {
                            set({ selectedPackages: [...form.selectedPackages, slug] });
                          }
                        }}
                      >
                        <option value="">{packages.length ? "Select a package…" : "No live packages loaded"}</option>
                        {packages
                          .filter(p => !form.selectedPackages.includes(p.slug))
                          .map(p => <option key={p.slug} value={p.slug}>{p.name}</option>)}
                      </select>
                    </div>

                    {form.selectedPackages.length > 0 && (
                      <div className={s.chipList}>
                        {form.selectedPackages.map(slug => (
                          <span key={slug} className={s.chip}>
                            {pkgBySlug.get(slug) || slug}
                            <button
                              type="button"
                              className={s.chipClose}
                              aria-label={`Remove ${slug}`}
                              onClick={() => set({ selectedPackages: form.selectedPackages.filter(x => x !== slug) })}
                            >✕</button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </section>

          {/* STEP 2: Unified Trail Loop (Template -> Reminder -> Stop Trigger -> Next Stage) */}
          <section className={s.step}>
            <div className={s.stepHead}>
              <span className={s.stepNum}>2</span>
              <div>
                <h3>Message &amp; reminder trail</h3>
                <p>Start with an instant Template (Auto Message), add a Reminder, and click <strong>+ Next stage</strong> on any Stop Trigger to continue the Template → Reminder loop.</p>
              </div>
            </div>

            <TrailStageBlock
              triggerKey={primaryKey}
              triggerLabel={primaryKey ? workLabel(primaryKey, byKey) : ""}
              depth={0}
              mainTriggerKey={primaryKey}
              mainTriggerLabel={primaryKey ? workLabel(primaryKey, byKey) : ""}
              ancestorTriggers={form.triggers}
              instant={form.instant}
              reminders={form.reminders}
              folders={folders}
              byKey={byKey}
              onChangeInstant={instant => set({ instant })}
              onChangeReminders={reminders => set({ reminders })}
            />
          </section>
        </div>
      </div>

      <footer className={s.dialogFoot}>
        <small style={(localError || error) ? { color: "var(--pn-err, #8b2a21)", fontWeight: 600 } : undefined}>
          {localError || error
            ? (localError || error)
            : primaryKey
              ? `${totalTemplates} template${totalTemplates === 1 ? "" : "s"} · ${totalReminders} reminder${totalReminders === 1 ? "" : "s"} ready to save`
              : "Choose a trigger point to save."}
        </small>
        <div className={s.footActions}>
          <button type="button" className={s.ghostBtn} disabled={saving} onClick={onClose}>Cancel</button>
          <button
            type="button"
            className={s.primaryBtn}
            disabled={!primaryKey || saving}
            onClick={handleSaveClick}
          >
            {saving ? "Saving…" : form._id ? "Save changes" : "Save automated msg"}
          </button>
        </div>
      </footer>
    </div>
  </div>;
}

export function AutomatedMessagesPanel({ active }: { active: boolean }) {
  const [actionsData, setActionsData] = useState<ActionsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [trails, setTrails] = useState<TrailForm[]>([]);
  const [editing, setEditing] = useState<TrailForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [panelError, setPanelError] = useState("");
  const [reloadSeq, setReloadSeq] = useState(0);

  const load = useCallback(async (signal: AbortSignal) => {
    setLoading(true);
    try {
      const [actionsRes, trailsRes] = await Promise.all([
        fetch("/api/auto-reply/actions?view=catalog", { signal, cache: "no-store" }),
        fetch("/api/auto-reply/action-rules/trails", { signal, cache: "no-store" }),
      ]);
      const [actionsJson, trailsJson] = await Promise.all([
        actionsRes.json().catch(() => null),
        trailsRes.json().catch(() => null),
      ]);
      if (!signal.aborted) {
        if (actionsRes.ok && actionsJson?.data) setActionsData(actionsJson.data as ActionsData);
        if (trailsRes.ok && Array.isArray(trailsJson?.data)) {
          setTrails(trailsJson.data.map(normalizeTrail));
          setPanelError("");
        } else if (!trailsRes.ok) {
          setPanelError(trailsJson?.error || "Could not load saved automated messages.");
        }
      }
    } catch {
      // Graceful fallback if offline
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, []);

  useCommunicationRefresh(load, active, 0, String(reloadSeq), "");

  const catalog = useMemo(() => buildWorkCatalog(actionsData), [actionsData]);

  async function saveTrail(form: TrailForm) {
    setSaving(true);
    setSaveError("");
    try {
      const isEdit = Boolean(form._id);
      const url = isEdit ? `/api/auto-reply/action-rules/trails/${form._id}` : "/api/auto-reply/action-rules/trails";
      const response = await fetch(url, {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.data) {
        throw new Error(result?.error || "Could not save automated message.");
      }
      const saved = normalizeTrail(result.data);
      setTrails(curr => isEdit ? curr.map(t => t._id === saved._id ? saved : t) : [saved, ...curr]);
      setEditing(null);
      setPanelError("");
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Could not save automated message.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleEnabled(trail: TrailForm) {
    if (!trail._id) return;
    setBusyId(trail._id);
    setPanelError("");
    try {
      const response = await fetch(`/api/auto-reply/action-rules/trails/${trail._id}/enabled`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !trail.enabled }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.data) throw new Error(result?.error || "Could not update status.");
      const updated = normalizeTrail(result.data);
      setTrails(curr => curr.map(t => t._id === updated._id ? updated : t));
    } catch (err) {
      setPanelError(err instanceof Error ? err.message : "Could not update status.");
    } finally {
      setBusyId(null);
    }
  }

  async function removeTrail(trail: TrailForm) {
    if (!trail._id) return;
    setBusyId(trail._id);
    setPanelError("");
    try {
      const response = await fetch(`/api/auto-reply/action-rules/trails/${trail._id}/delete`, {
        method: "POST",
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || "Could not delete automated message.");
      setTrails(curr => curr.filter(t => t._id !== trail._id));
    } catch (err) {
      setPanelError(err instanceof Error ? err.message : "Could not delete automated message.");
    } finally {
      setBusyId(null);
    }
  }

  if (!active && !editing) return null;

  return <section className={s.panel} aria-label="Automated message system">
    <div className={s.toolbar}>
      <div className={s.toolbarText}>
        <p>Every automated message and reminder trail, one row per work. Click <strong>Edit</strong> to open its form.</p>
        <span className={s.liveTag} data-live={catalog.isLive}>
          {loading && !catalog.isLive ? "Loading live works…" : catalog.isLive ? `${catalog.byKey.size} works · ${catalog.packages.length} packages loaded` : "Fallback catalog"}
        </span>
      </div>
      <div className={s.listActions}>
        <button type="button" className={s.ghostBtn} disabled={loading} onClick={() => setReloadSeq(v => v + 1)}>
          {loading ? "Refreshing…" : "Refresh"}
        </button>
        <button type="button" className={s.primaryBtn} onClick={() => { setSaveError(""); setEditing(emptyForm()); }}>
          + Create automated msg
        </button>
      </div>
    </div>

    {panelError && <p className={s.hint} style={{ color: "var(--pn-err, #8b2a21)", fontWeight: 600 }}>{panelError}</p>}

    {trails.length === 0 ? (
      <div className={s.empty}>
        <strong>No automated messages yet</strong>
        <span>Click “+ Create automated msg” to create your first automated message trail.</span>
      </div>
    ) : (
      <div className={s.list}>
        {trails.map(trail => {
          const title = trail.triggers.map(k => workLabel(k, catalog.byKey)).join(" + ");
          const tokens = buildFlowTokens(trail, catalog.byKey).slice(1);
          const hasScope = trail.triggers.some(k => catalog.byKey.get(k)?.supportsScope);
          const scopeLabel = PACKAGE_SCOPES.find(p => p.id === trail.scope)?.label;
          const isOn = trail.enabled !== false;
          const busy = busyId === trail._id;
          return (
            <article key={trail._id} className={s.listRow}>
              <div className={s.listMain}>
                <div className={s.listTitleRow}>
                  <strong>{title}</strong>
                  {hasScope && scopeLabel && <span className={s.badge}>{scopeLabel}</span>}
                  <span className={s.liveTag} data-live={isOn}>{isOn ? "Active" : "Paused"}</span>
                </div>
                <p className={s.listSummary}>
                  {tokens.length ? tokens.join(" → ") : "Trigger only (no message or reminder added yet)"}
                </p>
              </div>
              <div className={s.listActions}>
                <button type="button" className={s.ghostBtn} disabled={busy} onClick={() => void toggleEnabled(trail)}>
                  {isOn ? "Pause" : "Activate"}
                </button>
                <button type="button" className={s.ghostBtn} disabled={busy} onClick={() => { setSaveError(""); setEditing(trail); }}>
                  Edit
                </button>
                <button type="button" className={s.iconBtn} disabled={busy} aria-label={`Delete ${title}`} onClick={() => void removeTrail(trail)}>✕</button>
              </div>
            </article>
          );
        })}
      </div>
    )}

    {editing && (
      <FormDialog
        initial={editing}
        folders={catalog.folders}
        byKey={catalog.byKey}
        packages={catalog.packages}
        isLive={catalog.isLive}
        saving={saving}
        error={saveError}
        onClose={() => { if (!saving) { setSaveError(""); setEditing(null); } }}
        onSave={form => { void saveTrail(form); }}
      />
    )}
  </section>;
}
