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
 * Compact, zero-blink UI with searchable multi-select comboboxes & segmented controls.
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

type TrailStage = {
  id: number;
  triggers: string[];
  instant: InstantBlockState;
  reminder: Reminder | null;
};

type TrailForm = {
  _id?: string;
  triggers: string[];
  scope: PackageScopeMode;
  selectedPackages: string[];
  instant: InstantBlockState;
  reminders: Reminder[];
  stages: TrailStage[];
  enabled?: boolean;
  control?: "auto" | "review" | "off";
};

type ComboOption = { key: string; label: string; group: string; sub?: string };

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

const newTrailStage = (mode: "template" | "reminder", prefillTriggers: string[], defaultStops: string[] = []): TrailStage => ({
  id: nextId++,
  triggers: [...prefillTriggers],
  instant: blankInstant(mode === "template" ? "client" : "off"),
  reminder: mode === "reminder" ? newReminder(defaultStops, prefillTriggers[0]) : null,
});

const emptyForm = (): TrailForm => ({
  triggers: [],
  scope: "all",
  selectedPackages: [],
  instant: blankInstant("client"),
  reminders: [],
  stages: [],
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

function flattenLegacyChains(reminders: Reminder[], outStages: TrailStage[]) {
  for (const rem of reminders) {
    for (const stopKey of rem.stopOn) {
      const ch = rem.stopChains?.[stopKey];
      if (!ch) continue;
      const firstSub = ch.reminders[0] || null;
      outStages.push({
        id: nextId++,
        triggers: [stopKey],
        instant: ch.instant,
        reminder: firstSub ? { ...firstSub, stopChains: {} } : null,
      });
      if (ch.reminders.length > 0) flattenLegacyChains(ch.reminders, outStages);
    }
    rem.stopChains = {};
  }
}

function normalizeTrail(raw: unknown): TrailForm {
  const t = (raw && typeof raw === "object" ? raw : {}) as Partial<TrailForm>;
  const reminders = Array.isArray(t.reminders) ? t.reminders.map(rem => normalizeReminder(rem, 0)) : [];
  const rawStages: unknown[] = Array.isArray(t.stages) ? t.stages : [];
  let stages: TrailStage[] = rawStages
    .filter((st): st is Partial<TrailStage> & { trigger?: unknown } => Boolean(st && typeof st === "object"))
    .slice(0, MAX_CHAIN_DEPTH)
    .map(st => {
      const id = typeof st.id === "number" && Number.isFinite(st.id) ? st.id : nextId++;
      if (id >= nextId) nextId = id + 1;
      const stageTriggers = Array.isArray(st.triggers) && st.triggers.length
        ? st.triggers.filter((k): k is string => typeof k === "string" && Boolean(k))
        : (typeof st.trigger === "string" && st.trigger ? [st.trigger] : []);
      return {
        id,
        triggers: [...new Set(stageTriggers)],
        instant: normalizeInstant(st.instant),
        reminder: st.reminder ? normalizeReminder(st.reminder, 0) : null,
      };
    });
  if (stages.length === 0) {
    const flattened: TrailStage[] = [];
    flattenLegacyChains(reminders, flattened);
    stages = flattened.slice(0, MAX_CHAIN_DEPTH);
  }
  return {
    ...(t._id ? { _id: String(t._id) } : {}),
    triggers: Array.isArray(t.triggers) ? t.triggers.filter((k): k is string => typeof k === "string" && Boolean(k)) : [],
    scope: t.scope === "monthly" || t.scope === "onetime" || t.scope === "include" || t.scope === "exclude" ? t.scope : "all",
    selectedPackages: Array.isArray(t.selectedPackages) ? t.selectedPackages.filter((s): s is string => typeof s === "string" && Boolean(s)) : [],
    instant: normalizeInstant(t.instant),
    reminders,
    stages,
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

function triggersLabel(keys: string[], byKey: Map<string, WorkItem>) {
  if (!keys.length) return "";
  const first = workLabel(keys[0], byKey);
  return keys.length > 1 ? `${first} +${keys.length - 1}` : first;
}

function allTrailTriggerKeys(form: Pick<TrailForm, "triggers" | "reminders" | "stages">): string[] {
  const keys: string[] = [...form.triggers];
  for (const rem of form.reminders) {
    if (rem.startTrigger && rem.startTrigger !== "__main__") keys.push(rem.startTrigger);
  }
  for (const st of form.stages) {
    keys.push(...st.triggers);
    if (st.reminder?.startTrigger && st.reminder.startTrigger !== "__main__") keys.push(st.reminder.startTrigger);
  }
  return keys;
}

function countReminders(reminders: Reminder[], stages: TrailStage[] = []): number {
  const rootCount = reminders.length;
  const stageCount = stages.reduce((sum, st) => sum + (st.reminder ? 1 : 0), 0);
  return rootCount + stageCount;
}

function countTemplates(instant: InstantBlockState, stages: TrailStage[] = []): number {
  const rootCount = hasInstantContent(instant) ? 1 : 0;
  const stageCount = stages.reduce((sum, st) => sum + (hasInstantContent(st.instant) ? 1 : 0), 0);
  return rootCount + stageCount;
}

function cleanSingleReminder(
  rem: Reminder,
  effTriggers: string[],
  stageLabel: string,
  byKey: Map<string, WorkItem>,
): { reminder?: Reminder; error?: string } {
  const allowedConds = allowedConditionIds(effTriggers.map(k => byKey.get(k)));
  const condition = allowedConds.includes(rem.condition) ? rem.condition : "any";
  const fixStep = (st: MessageStep): MessageStep => (
    rem.countDaysFrom === "trigger_date" && st.pos === "before" ? { ...st, pos: "after" } : st
  );
  const clientSteps = rem.clientSteps.map(fixStep);
  const adminSteps = rem.adminSteps.map(fixStep);

  const showClient = rem.audience === "client" || rem.audience === "both";
  const showAdmin = rem.audience === "admin" || rem.audience === "both";
  const label = triggersLabel(effTriggers, byKey);

  if (showClient) {
    const missing = rem.clientMode === "universal"
      ? !clientSteps[0]?.text.trim()
      : clientSteps.some(st => !st.text.trim());
    if (missing) return { error: `Write the Client message in ${stageLabel} Reminder (${label}).` };
  }
  if (showAdmin) {
    const missing = rem.adminMode === "universal"
      ? !adminSteps[0]?.text.trim()
      : adminSteps.some(st => !st.text.trim());
    if (missing) return { error: `Write the Admin message in ${stageLabel} Reminder (${label}).` };
  }

  const maxSteps = Math.max(showClient ? clientSteps.length : 0, showAdmin ? adminSteps.length : 0);
  if ((rem.repeatMode === "permanent" || rem.repeatMode === "limited" || maxSteps > 1) && rem.stopOn.length === 0) {
    return { error: `Add at least one Stop Trigger for ${stageLabel} Reminder (${label}).` };
  }

  return {
    reminder: {
      ...rem,
      condition,
      stopOn: rem.stopOn.filter(k => !effTriggers.includes(k)),
      clientSteps,
      adminSteps,
      stopChains: {},
    },
  };
}

function prepareTrailForSave(form: TrailForm, byKey: Map<string, WorkItem>): { trail: TrailForm; error: string | null } {
  if (!form.triggers.length) return { trail: form, error: "Choose at least one trigger point." };

  const hasScope = allTrailTriggerKeys(form).some(k => byKey.get(k)?.supportsScope);
  if (hasScope && (form.scope === "include" || form.scope === "exclude") && form.selectedPackages.length === 0) {
    return {
      trail: form,
      error: `Select at least one package to ${form.scope} (or switch Packages to All).`,
    };
  }

  const cleanInstant = cleanInstantForSave(form.instant);
  const cleanReminders: Reminder[] = [];
  for (let i = 0; i < form.reminders.length; i++) {
    const rem = form.reminders[i];
    const effTriggers = rem.startTrigger !== "__main__" ? [rem.startTrigger] : form.triggers;
    const res = cleanSingleReminder(rem, effTriggers, `Stage 1`, byKey);
    if (res.error || !res.reminder) return { trail: form, error: res.error || "Invalid reminder." };
    cleanReminders.push(res.reminder);
  }

  const cleanStages: TrailStage[] = [];
  for (let i = 0; i < form.stages.length; i++) {
    const st = form.stages[i];
    const stageNum = i + 2;
    if (!st.triggers.length) return { trail: form, error: `Choose at least one trigger point for Stage ${stageNum}.` };
    const stInstant = cleanInstantForSave(st.instant);
    let stReminder: Reminder | null = null;
    if (st.reminder) {
      const effTriggers = st.reminder.startTrigger !== "__main__" ? [st.reminder.startTrigger] : st.triggers;
      const res = cleanSingleReminder(st.reminder, effTriggers, `Stage ${stageNum}`, byKey);
      if (res.error || !res.reminder) return { trail: form, error: res.error || "Invalid reminder." };
      stReminder = res.reminder;
    }
    if (stInstant.audience === "off" && !stReminder) {
      return { trail: form, error: `Stage ${stageNum} (${triggersLabel(st.triggers, byKey)}) is empty — write a Template, add a Reminder, or remove Stage ${stageNum}.` };
    }
    cleanStages.push({
      id: st.id,
      triggers: st.triggers,
      instant: stInstant,
      reminder: stReminder,
    });
  }

  if (cleanInstant.audience === "off" && cleanReminders.length === 0 && cleanStages.length === 0) {
    return { trail: form, error: "Write a Template (Auto Message) or add at least one Reminder before saving." };
  }

  return {
    trail: { ...form, instant: cleanInstant, reminders: cleanReminders, stages: cleanStages },
    error: null,
  };
}

function buildFlowTokens(form: TrailForm, byKey: Map<string, WorkItem>): string[] {
  if (!form.triggers.length) return [];
  const out: string[] = [triggersLabel(form.triggers, byKey)];
  if (form.instant.audience !== "off") out.push(`Instant (${audienceShort(form.instant.audience)})`);
  for (const rem of form.reminders) {
    out.push(`Reminder (${audienceShort(rem.audience)})`);
    if (rem.stopOn.length) out.push(`Stop: ${triggersLabel(rem.stopOn, byKey)}`);
  }
  form.stages.forEach((st, idx) => {
    const label = triggersLabel(st.triggers, byKey) || `Stage ${idx + 2}`;
    if (st.instant.audience !== "off") out.push(`${label}: Instant`);
    if (st.reminder) {
      out.push(`${label}: Reminder`);
      if (st.reminder.stopOn.length) out.push(`Stop: ${triggersLabel(st.reminder.stopOn, byKey)}`);
    }
  });
  return out;
}

/**
 * Searchable multi-select combobox with inline chips, grouped options, and Escape safety.
 * Used as SSOT for Trigger points, Stop triggers, and Include/Exclude packages.
 */
function SearchableMultiSelect({
  ariaLabel,
  placeholder,
  addPlaceholder,
  options,
  values,
  onChange,
}: {
  ariaLabel: string;
  placeholder: string;
  addPlaceholder: string;
  options: ComboOption[];
  values: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [menuStyle, setMenuStyle] = useState<{ top?: number; bottom?: number; left: number; width: number; maxHeight: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const labelByKey = useMemo(() => {
    const m = new Map<string, string>();
    for (const o of options) m.set(o.key, o.label);
    return m;
  }, [options]);

  const updateMenuPos = useCallback(() => {
    const el = boxRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom - 12;
    const spaceAbove = rect.top - 12;
    const openDown = spaceBelow >= 260 || spaceBelow >= spaceAbove;
    const maxHeight = Math.min(540, Math.max(220, openDown ? spaceBelow : spaceAbove));
    setMenuStyle({
      left: rect.left,
      width: rect.width,
      maxHeight,
      ...(openDown ? { top: rect.bottom + 4 } : { bottom: window.innerHeight - rect.top + 4 }),
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    updateMenuPos();
    const onDocDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onScrollOrResize = () => updateMenuPos();
    document.addEventListener("mousedown", onDocDown);
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      document.removeEventListener("mousedown", onDocDown);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open, updateMenuPos]);

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = options.filter(o =>
      !q || o.label.toLowerCase().includes(q) || o.group.toLowerCase().includes(q) || (o.sub || "").toLowerCase().includes(q),
    );
    const map = new Map<string, ComboOption[]>();
    for (const o of filtered) {
      const list = map.get(o.group) || [];
      list.push(o);
      map.set(o.group, list);
    }
    return Array.from(map.entries());
  }, [options, query]);

  function toggleKey(key: string) {
    if (values.includes(key)) onChange(values.filter(k => k !== key));
    else onChange([...values, key]);
    inputRef.current?.focus();
    requestAnimationFrame(updateMenuPos);
  }

  return (
    <div
      ref={wrapRef}
      className={s.comboWrap}
      onKeyDown={e => {
        if (e.key === "Escape" && open) {
          e.stopPropagation();
          setOpen(false);
        }
      }}
    >
      <div
        ref={boxRef}
        className={s.comboBox}
        data-open={open}
        onClick={() => { setOpen(true); inputRef.current?.focus(); }}
      >
        {values.map(k => {
          const name = labelByKey.get(k) || k;
          return (
            <span key={k} className={s.comboChip}>
              <span>{name}</span>
              <button
                type="button"
                aria-label={`Remove ${name}`}
                onClick={e => { e.stopPropagation(); onChange(values.filter(x => x !== k)); }}
              >✕</button>
            </span>
          );
        })}
        <input
          ref={inputRef}
          type="text"
          className={s.comboInput}
          aria-label={ariaLabel}
          placeholder={values.length > 0 ? addPlaceholder : placeholder}
          value={query}
          onFocus={() => setOpen(true)}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
        />
        <span className={s.comboCaret} aria-hidden="true">▾</span>
      </div>

      {open && menuStyle && (
        <div
          className={s.comboMenu}
          style={menuStyle}
          role="listbox"
          aria-multiselectable="true"
        >
          {grouped.length === 0 ? (
            <div className={s.comboEmpty}>No matching items</div>
          ) : (
            grouped.map(([group, list]) => (
              <div key={group}>
                <div className={s.comboGroup}>{group}</div>
                {list.map(item => {
                  const selected = values.includes(item.key);
                  return (
                    <button
                      key={item.key}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      title={item.sub || item.label}
                      className={s.comboOpt}
                      data-selected={selected}
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => toggleKey(item.key)}
                    >
                      <span className={s.comboCheck} aria-hidden="true">✓</span>
                      <span className={s.comboOptLabel}>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function MultiTriggerSelect({
  ariaLabel,
  emptyPlaceholder,
  addPlaceholder,
  values,
  exclude = [],
  folders,
  byKey,
  showHint = false,
  onChange,
}: {
  ariaLabel: string;
  emptyPlaceholder: string;
  addPlaceholder: string;
  values: string[];
  exclude?: string[];
  folders: WorkFolder[];
  byKey: Map<string, WorkItem>;
  showHint?: boolean;
  onChange: (next: string[]) => void;
}) {
  const options = useMemo<ComboOption[]>(() => {
    const out: ComboOption[] = [];
    for (const group of folders) {
      for (const item of group.items) {
        if (!exclude.includes(item.key)) {
          out.push({ key: item.key, label: item.label, group: group.folder, sub: item.when });
        }
      }
    }
    return out;
  }, [folders, exclude]);

  const primaryWork = values.length === 1 ? byKey.get(values[0]) : undefined;
  const hintText = values.length === 0
    ? "Select one or more works that trigger this step."
    : values.length === 1
      ? (primaryWork?.when || "")
      : `${values.length} triggers selected in this group.`;

  return <>
    <SearchableMultiSelect
      ariaLabel={ariaLabel}
      placeholder={emptyPlaceholder}
      addPlaceholder={addPlaceholder}
      options={options}
      values={values}
      onChange={onChange}
    />
    {showHint && <p className={s.whenHint}>{hintText}</p>}
  </>;
}

function WorkOptions({ folders, exclude = [] }: { folders: WorkFolder[]; exclude?: string[] }) {
  return <>
    {folders.map(group => {
      const items = group.items.filter(item => !exclude.includes(item.key));
      if (!items.length) return null;
      return (
        <optgroup key={group.folder} label={group.folder}>
          {items.map(item => (
            <option key={item.key} value={item.key}>{item.label}</option>
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
    {(showTiming || canRemove) && (
      <div className={s.msgTitleRow}>
        <strong>{title}</strong>
        {canRemove && onRemove && (
          <button type="button" className={s.miniDangerBtn} onClick={onRemove}>Remove</button>
        )}
      </div>
    )}

    {showTiming && (
      <div className={s.timingRow}>
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

    <div className={s.msgTop}>
      <div className={s.inlineGroup}>
        <span className={s.miniLabel}>Channel</span>
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
  const [subTab, setSubTab] = useState<"client" | "admin">("client");
  const activeKey: "client" | "admin" = state.audience === "both" ? subTab : (state.audience === "admin" ? "admin" : "client");

  return (
    <div style={{ display: "grid", gap: "8px" }}>
      <div className={s.blockHead}>
        <div className={s.blockTitle}>
          <span className={s.stageBadge}>Template</span>
          <span>Instant auto message</span>
        </div>
        <select
          className={s.compactSelect}
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

      {state.audience === "off" ? (
        <span className={s.cardSub}>Instant auto message is off for this stage.</span>
      ) : (
        <>
          {state.audience === "both" && (
            <div className={s.blockHead}>
              <div className={s.seg} role="tablist" aria-label="Instant message recipient tab">
                <button
                  type="button"
                  role="tab"
                  aria-selected={subTab === "client"}
                  className={s.segBtn}
                  data-active={subTab === "client"}
                  onClick={() => setSubTab("client")}
                >
                  Client message
                  {state.client.text.trim() && <span className={s.tabDot} aria-hidden="true" />}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={subTab === "admin"}
                  className={s.segBtn}
                  data-active={subTab === "admin"}
                  onClick={() => setSubTab("admin")}
                >
                  Admin / Team message
                  {state.admin.text.trim() && <span className={s.tabDot} aria-hidden="true" />}
                </button>
              </div>
              <span className={s.cardSub}>Sent immediately on trigger</span>
            </div>
          )}

          <MessageEditor
            title={activeKey === "admin" ? "Admin instant message" : "Client instant message"}
            step={{ amount: 0, unit: "days", pos: "after", ...(activeKey === "admin" ? state.admin : state.client) }}
            showTiming={false}
            onChange={patch => {
              if (activeKey === "admin") onChange({ ...state, admin: { ...state.admin, ...patch } });
              else onChange({ ...state, client: { ...state.client, ...patch } });
            }}
          />
        </>
      )}
    </div>
  );
}

function AudienceBlock({
  who,
  title,
  mode,
  steps,
  baseDate,
  canCopyClient,
  hideHeaderTitle = false,
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
  hideHeaderTitle?: boolean;
  onModeChange: (mode: MessageMode) => void;
  onCopyClient?: () => void;
  onUpdateSteps: (next: MessageStep[]) => void;
}) {
  const universal = mode === "universal";
  const adminSyncsClient = who === "admin" && Boolean(canCopyClient) && universal;
  const primaryStep = steps[0] || blankStep(baseDate === "trigger_date" ? "after" : "before", 3);

  return (
    <div style={{ display: "grid", gap: "8px" }}>
      <div className={s.blockHead}>
        {!hideHeaderTitle ? <strong className={s.labelRow}>{title}</strong> : <span />}
        <div className={s.inlineGroup}>
          {who === "admin" && canCopyClient && mode === "separate" && onCopyClient && (
            <button type="button" className={s.miniBtn} onClick={onCopyClient}>Copy client&apos;s days</button>
          )}
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
                <button type="button" className={s.miniDangerBtn} aria-label="Remove timing" onClick={() => onUpdateSteps(steps.filter((_, i) => i !== idx))}>Remove</button>
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
        <span className={s.cardSub}>Follows Client&apos;s timings automatically — write one message for Admin below.</span>
      )}

      {universal ? (
        <MessageEditor
          title={`Universal ${who === "client" ? "Client" : "Admin"} message`}
          step={primaryStep}
          showTiming={false}
          onChange={patch => onUpdateSteps(steps.map(st => ({ ...st, channel: patch.channel ?? st.channel, subject: patch.subject ?? st.subject, text: patch.text ?? st.text })))}
        />
      ) : (
        <div style={{ display: "grid", gap: "8px" }}>
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
    </div>
  );
}

function ReminderCard({
  index,
  depth,
  reminder,
  stageTriggers,
  stageTriggersLabel,
  folders,
  byKey,
  onChange,
  onRemove,
}: {
  index: number;
  depth: number;
  reminder: Reminder;
  stageTriggers: string[];
  stageTriggersLabel: string;
  folders: WorkFolder[];
  byKey: Map<string, WorkItem>;
  onChange: (reminder: Reminder) => void;
  onRemove: () => void;
}) {
  const [subTab, setSubTab] = useState<"client" | "admin">("client");
  const set = (patch: Partial<Reminder>) => onChange({ ...reminder, ...patch });

  const effectiveTriggers = reminder.startTrigger !== "__main__" ? [reminder.startTrigger] : stageTriggers;
  const allowedConds = allowedConditionIds(effectiveTriggers.map(k => byKey.get(k)));
  const visibleConditions = CONDITIONS.filter(c => allowedConds.includes(c.id));
  const safeCondition = allowedConds.includes(reminder.condition) ? reminder.condition : "any";
  const conditionDef = CONDITIONS.find(item => item.id === safeCondition);

  const showClient = reminder.audience === "client" || reminder.audience === "both";
  const showAdmin = reminder.audience === "admin" || reminder.audience === "both";
  const activeWho: "client" | "admin" = reminder.audience === "both" ? subTab : (reminder.audience === "admin" ? "admin" : "client");

  const msgCount = (showClient ? reminder.clientSteps.length : 0) + (showAdmin ? reminder.adminSteps.length : 0);
  const repeatSummary = reminder.repeatMode === "permanent"
    ? "Repeat: Permanent"
    : reminder.repeatMode === "limited"
      ? `Repeat: ${reminder.repeatForDays}d`
      : "No repeat";
  const stopSummary = reminder.stopOn.length > 0
    ? `Stops on: ${triggersLabel(reminder.stopOn, byKey)}`
    : "No stop trigger";

  function copyClientDays() {
    set({
      adminMode: "separate",
      adminSteps: reminder.clientSteps.map(st => ({ ...st })),
    });
  }

  function handleStartTriggerChange(nextStart: string) {
    const targetKeys = nextStart === "__main__" ? stageTriggers : [nextStart];
    const nextAllowed = allowedConditionIds(targetKeys.map(k => byKey.get(k)));
    set({
      startTrigger: nextStart,
      condition: nextAllowed.includes(reminder.condition) ? reminder.condition : "any",
      stopOn: reminder.stopOn.filter(k => !targetKeys.includes(k)),
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

  return <div className={s.remCard} data-depth={Math.min(depth, 3)}>
    <header className={s.remHeader}>
      <div className={s.remHeaderInfo}>
        <strong>Reminder {index + 1}</strong>
        <span className={s.summaryMeta}>
          {audienceShort(reminder.audience)} · {msgCount} msg{msgCount === 1 ? "" : "s"} · {repeatSummary} · {stopSummary}
        </span>
      </div>
      <div className={s.remHeaderActions}>
        <button
          type="button"
          className={s.miniDangerBtn}
          aria-label={`Remove reminder ${index + 1}`}
          onClick={onRemove}
        >
          Remove
        </button>
      </div>
    </header>

    <div className={s.remBody}>
      {/* 1. Start trigger + Send to (2-column compact row) */}
      <div className={s.grid2}>
        <div className={s.field}>
          <label className={s.labelRow}><span>Start when</span></label>
          <select
            className={s.select}
            aria-label="Start reminder trigger"
            value={reminder.startTrigger}
            onChange={e => handleStartTriggerChange(e.target.value)}
          >
            <option value="__main__">Same as stage trigger ({stageTriggersLabel || "selected trigger"})</option>
            <WorkOptions folders={folders} />
          </select>
        </div>

        <div className={s.field}>
          <label className={s.labelRow}><span>Send to</span></label>
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
      </div>

      {/* 2. Audience Sub-tabs when Both + Message Editor */}
      {reminder.audience === "both" && (
        <div className={s.seg} style={{ justifySelf: "start" }} role="tablist" aria-label="Reminder recipient tab">
          <button
            type="button"
            role="tab"
            aria-selected={subTab === "client"}
            className={s.segBtn}
            data-active={subTab === "client"}
            onClick={() => setSubTab("client")}
          >
            Client ({reminder.clientSteps.length})
            {reminder.clientSteps.some(st => st.text.trim()) && <span className={s.tabDot} aria-hidden="true" />}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={subTab === "admin"}
            className={s.segBtn}
            data-active={subTab === "admin"}
            onClick={() => setSubTab("admin")}
          >
            Admin / Team ({reminder.adminSteps.length})
            {reminder.adminSteps.some(st => st.text.trim()) && <span className={s.tabDot} aria-hidden="true" />}
          </button>
        </div>
      )}

      {activeWho === "client" && showClient && (
        <AudienceBlock
          who="client"
          title="Client schedule"
          mode={reminder.clientMode}
          steps={reminder.clientSteps}
          baseDate={reminder.countDaysFrom}
          hideHeaderTitle={reminder.audience === "both"}
          onModeChange={clientMode => set({ clientMode })}
          onUpdateSteps={clientSteps => set({ clientSteps })}
        />
      )}
      {activeWho === "admin" && showAdmin && (
        <AudienceBlock
          who="admin"
          title="Admin / Team schedule"
          mode={reminder.adminMode}
          steps={reminder.adminSteps}
          baseDate={reminder.countDaysFrom}
          canCopyClient={showClient}
          hideHeaderTitle={reminder.audience === "both"}
          onModeChange={adminMode => set({ adminMode })}
          onCopyClient={copyClientDays}
          onUpdateSteps={adminSteps => set({ adminSteps })}
        />
      )}

      {/* 3. Base Date & Only When (2-column) + Repeat (clean full row) + Stop triggers */}
      <div className={s.grid2}>
        <div className={s.field}>
          <label className={s.labelRow}><span>Count days from</span></label>
          <select
            className={s.select}
            aria-label="Count days from"
            value={reminder.countDaysFrom}
            onChange={e => handleBaseDateChange(e.target.value as BaseDate)}
          >
            {BASE_DATES.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </div>

        <div className={s.field} data-disabled={visibleConditions.length <= 1}>
          <label className={s.labelRow}><span>Only when</span></label>
          <div className={s.inlineRow}>
            <select
              className={s.select}
              style={{ flex: 1 }}
              aria-label="Only when condition"
              disabled={visibleConditions.length <= 1}
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

        <div className={`${s.field} ${s.fieldFull}`}>
          <label className={s.labelRow}><span>Repeat</span></label>
          <div className={s.inlineRow}>
            <select
              className={s.compactSelect}
              aria-label="Repeat mode"
              value={reminder.repeatMode}
              onChange={e => set({ repeatMode: e.target.value as RepeatMode })}
            >
              <option value="off">Off (No repeat — scheduled messages only)</option>
              <option value="permanent">Permanent (until stop trigger happens)</option>
              <option value="limited">Fixed days limit</option>
            </select>
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
            {reminder.repeatMode !== "off" && (
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
            )}
          </div>
        </div>

        {/* 4. Stop triggers (searchable multi-select SSOT) */}
        <div className={`${s.field} ${s.fieldFull}`}>
          <label className={s.labelRow}>
            <span>Stop when</span>
            <span className={s.labelMuted}>Reminders stop immediately when any selected work happens</span>
          </label>
          <MultiTriggerSelect
            ariaLabel="Add stop trigger"
            emptyPlaceholder="Search & select stop triggers…"
            addPlaceholder="Add another stop trigger…"
            values={reminder.stopOn}
            exclude={effectiveTriggers}
            folders={folders}
            byKey={byKey}
            onChange={stopOn => set({ stopOn })}
          />
        </div>
      </div>
    </div>
  </div>;
}

function TrailStageBlock({
  stageTriggers,
  stageTriggersLabel,
  depth,
  showTriggerSelect,
  instant,
  reminders,
  folders,
  byKey,
  onChangeTriggers,
  onChangeInstant,
  onChangeReminders,
}: {
  stageTriggers: string[];
  stageTriggersLabel: string;
  depth: number;
  showTriggerSelect?: boolean;
  instant: InstantBlockState;
  reminders: Reminder[];
  folders: WorkFolder[];
  byKey: Map<string, WorkItem>;
  onChangeTriggers?: (next: string[]) => void;
  onChangeInstant: (next: InstantBlockState) => void;
  onChangeReminders: (next: Reminder[]) => void;
}) {
  function addStageReminder() {
    const defaultStops = [...new Set(
      stageTriggers.flatMap(k => byKey.get(k)?.defaultStopOn || []),
    )].filter(k => byKey.has(k) && !stageTriggers.includes(k));
    onChangeReminders([...reminders, newReminder(defaultStops, stageTriggers[0])]);
  }

  return (
    <div style={{ display: "grid", gap: "12px" }}>
      {showTriggerSelect && onChangeTriggers && (
        <div className={s.field}>
          <label className={s.labelRow}>
            <span>Trigger point</span>
            <span className={s.labelMuted}>{stageTriggers.length} selected</span>
          </label>
          <MultiTriggerSelect
            ariaLabel={`Stage ${depth + 1} trigger point`}
            emptyPlaceholder="Search & select trigger point…"
            addPlaceholder="Add another trigger…"
            values={stageTriggers}
            folders={folders}
            byKey={byKey}
            showHint={true}
            onChange={onChangeTriggers}
          />
        </div>
      )}

      {/* 1. Template (Instant Auto Message) */}
      <InstantAutoMsgBlock state={instant} onChange={onChangeInstant} />

      <div className={s.divider} />

      {/* 2. Follow-up Reminder */}
      <div style={{ display: "grid", gap: "8px" }}>
        <div className={s.blockHead}>
          <div className={s.blockTitle}>
            <span className={s.stageBadge} data-kind="reminder">Reminder</span>
            <span>Follow-up reminder</span>
          </div>
          <span className={s.cardSub}>
            {reminders.length > 0 ? "Set Stop when inside, then continue trail below" : "Optional — send scheduled follow-ups"}
          </span>
        </div>

        {reminders.map((rem, idx) => (
          <ReminderCard
            key={rem.id}
            index={idx}
            depth={depth}
            reminder={rem}
            stageTriggers={stageTriggers}
            stageTriggersLabel={stageTriggersLabel}
            folders={folders}
            byKey={byKey}
            onChange={next => onChangeReminders(reminders.map(item => item.id === rem.id ? next : item))}
            onRemove={() => onChangeReminders(reminders.filter(item => item.id !== rem.id))}
          />
        ))}
        {reminders.length === 0 && (
          <button type="button" className={s.addBtn} onClick={addStageReminder}>
            {stageTriggersLabel ? `+ Add reminder on “${stageTriggersLabel}”` : "+ Add follow-up reminder"}
          </button>
        )}
      </div>
    </div>
  );
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
  const supportsScopeFor = (next: Pick<TrailForm, "triggers" | "reminders" | "stages">) =>
    allTrailTriggerKeys(next).some(k => byKey.get(k)?.supportsScope);
  const hasPackageScope = supportsScopeFor(form);
  const flowTokens = useMemo(() => buildFlowTokens(form, byKey), [form, byKey]);
  const totalTemplates = useMemo(() => countTemplates(form.instant, form.stages), [form.instant, form.stages]);
  const totalReminders = useMemo(() => countReminders(form.reminders, form.stages), [form.reminders, form.stages]);

  const packageOptions = useMemo<ComboOption[]>(() => (
    packages.map(p => ({ key: p.slug, label: p.name, group: "Packages & Plans" }))
  ), [packages]);

  function changeRootTriggers(nextTriggers: string[]) {
    const nextAllowed = allowedConditionIds(nextTriggers.map(k => byKey.get(k)));
    const nextReminders = form.reminders.map(rem => (
      rem.startTrigger === "__main__"
        ? {
            ...rem,
            condition: nextAllowed.includes(rem.condition) ? rem.condition : "any",
            stopOn: rem.stopOn.filter(k => !nextTriggers.includes(k)),
          }
        : rem
    ));
    const stillSupportsScope = supportsScopeFor({ ...form, triggers: nextTriggers, reminders: nextReminders });
    set({
      triggers: nextTriggers,
      reminders: nextReminders,
      ...(stillSupportsScope ? {} : { scope: "all", selectedPackages: [] }),
    });
  }

  function updateRootReminders(nextReminders: Reminder[]) {
    const stillSupportsScope = supportsScopeFor({ ...form, reminders: nextReminders });
    set({
      reminders: nextReminders,
      ...(stillSupportsScope ? {} : { scope: "all", selectedPackages: [] }),
    });
  }

  function lastStopTriggers(): string[] {
    for (let i = form.stages.length - 1; i >= 0; i--) {
      const rem = form.stages[i].reminder;
      if (rem?.stopOn?.length) return [...rem.stopOn];
    }
    for (let i = form.reminders.length - 1; i >= 0; i--) {
      if (form.reminders[i].stopOn.length) return [...form.reminders[i].stopOn];
    }
    return [];
  }

  function addStage(mode: "template" | "reminder") {
    const prefill = lastStopTriggers();
    const defaultStops = [...new Set(
      prefill.flatMap(k => byKey.get(k)?.defaultStopOn || []),
    )].filter(k => byKey.has(k) && !prefill.includes(k));
    set({ stages: [...form.stages, newTrailStage(mode, prefill, defaultStops)] });
  }

  function updateStage(stageId: number, patch: Partial<TrailStage>) {
    const nextStages = form.stages.map(st => (st.id === stageId ? { ...st, ...patch } : st));
    const stillSupportsScope = supportsScopeFor({ ...form, stages: nextStages });
    set({
      stages: nextStages,
      ...(stillSupportsScope ? {} : { scope: "all", selectedPackages: [] }),
    });
  }

  function changeStageTriggers(stage: TrailStage, nextTriggers: string[]) {
    let nextReminder = stage.reminder;
    if (nextReminder && nextReminder.startTrigger === "__main__") {
      const nextAllowed = allowedConditionIds(nextTriggers.map(k => byKey.get(k)));
      nextReminder = {
        ...nextReminder,
        condition: nextAllowed.includes(nextReminder.condition) ? nextReminder.condition : "any",
        stopOn: nextReminder.stopOn.filter(k => !nextTriggers.includes(k)),
      };
    }
    updateStage(stage.id, { triggers: nextTriggers, reminder: nextReminder });
  }

  function removeStage(stageId: number) {
    const nextStages = form.stages.filter(st => st.id !== stageId);
    const stillSupportsScope = supportsScopeFor({ ...form, stages: nextStages });
    set({
      stages: nextStages,
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

  const rootTrigLabel = triggersLabel(form.triggers, byKey);

  return <div className={s.overlay}>
    <div className={s.backdrop} onClick={onClose} />
    <div className={s.dialog} role="dialog" aria-modal="true" aria-labelledby="amsg-title">
      <header className={s.dialogHead}>
        <div>
          <h2 id="amsg-title">{form._id ? "Edit automated message" : "Create automated message"}</h2>
          <p>Configure trigger, instant message, follow-up reminders, and next stages in one compact flow.</p>
        </div>
        <div className={s.headRight}>
          <span className={s.liveTag} data-live={isLive}>
            <span className={s.liveDot} aria-hidden="true" />
            {isLive ? "Live catalog" : "Preview catalog"}
          </span>
          <button type="button" className={s.closeBtn} aria-label="Close" onClick={onClose}>✕</button>
        </div>
      </header>

      {/* Fixed-height Live Flow Strip — zero blink/jump */}
      <div className={s.flowStrip} aria-label="Live trail summary">
        {flowTokens.length === 0 ? (
          <span className={s.flowEmpty}>Trail preview: choose a Trigger point below to see your live automation flow.</span>
        ) : (
          flowTokens.map((tok, i) => (
            <span key={`${tok}-${i}`} className={s.flowItem}>
              {i > 0 && <span className={s.flowArrow}>→</span>}
              <span className={s.flowPill} data-kind={i === 0 ? "trigger" : "step"}>{tok}</span>
            </span>
          ))
        )}
      </div>

      <div className={s.dialogBody}>
        {/* CARD 1: Trigger & Package Scope */}
        <section className={s.card}>
          <div className={s.cardHead}>
            <div className={s.cardTitle}>
              <span className={s.stepNum}>1</span>
              <h3>Trigger &amp; scope</h3>
            </div>
            <span className={s.cardSub}>Searchable multi-select</span>
          </div>

          <div className={s.grid2}>
            <div className={s.field}>
              <label className={s.labelRow}>
                <span>Trigger point</span>
                <span className={s.labelMuted}>{form.triggers.length} selected</span>
              </label>
              <MultiTriggerSelect
                ariaLabel="Primary trigger point"
                emptyPlaceholder="Search & select trigger point…"
                addPlaceholder="Add another trigger…"
                values={form.triggers}
                folders={folders}
                byKey={byKey}
                showHint={true}
                onChange={changeRootTriggers}
              />
            </div>

            <div className={s.field} data-disabled={!hasPackageScope}>
              <label className={s.labelRow}>
                <span>Packages</span>
                <span className={s.labelMuted}>
                  {hasPackageScope ? "Applies to selected triggers" : "Available for package/order triggers"}
                </span>
              </label>
              <select
                className={s.select}
                aria-label="Package scope"
                disabled={!hasPackageScope}
                value={form.scope}
                onChange={e => set({ scope: e.target.value as PackageScopeMode, selectedPackages: [] })}
              >
                {PACKAGE_SCOPES.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>

              {hasPackageScope && (form.scope === "include" || form.scope === "exclude") && (
                <SearchableMultiSelect
                  ariaLabel="Pick packages"
                  placeholder={packages.length ? `Select packages to ${form.scope}…` : "No live packages loaded"}
                  addPlaceholder="Add another package…"
                  options={packageOptions}
                  values={form.selectedPackages}
                  onChange={selectedPackages => set({ selectedPackages })}
                />
              )}
            </div>
          </div>
        </section>

        {/* CARD 2: Stage 1 (Template + Reminder) */}
        <section className={s.card}>
          <div className={s.cardHead}>
            <div className={s.cardTitle}>
              <span className={s.stepNum}>2</span>
              <h3>Stage 1 — Messages &amp; reminder</h3>
            </div>
            <span className={s.cardSub}>{rootTrigLabel ? `On: ${rootTrigLabel}` : "Waiting for trigger…"}</span>
          </div>

          <TrailStageBlock
            stageTriggers={form.triggers}
            stageTriggersLabel={rootTrigLabel}
            depth={0}
            instant={form.instant}
            reminders={form.reminders}
            folders={folders}
            byKey={byKey}
            onChangeInstant={instant => set({ instant })}
            onChangeReminders={updateRootReminders}
          />
        </section>

        {/* CARD 3..N: Linear Follow-up Stages */}
        {form.stages.map((stage, idx) => {
          const stageNum = idx + 3;
          const stageLabel = triggersLabel(stage.triggers, byKey);
          return (
            <section key={stage.id} className={s.card} data-stage="followup">
              <div className={s.cardHead}>
                <div className={s.cardTitle}>
                  <span className={s.stepNum}>{stageNum}</span>
                  <h3>Stage {idx + 2}{stageLabel ? ` — On “${stageLabel}”` : ""}</h3>
                </div>
                <button type="button" className={s.miniDangerBtn} onClick={() => removeStage(stage.id)}>Remove stage</button>
              </div>

              <TrailStageBlock
                stageTriggers={stage.triggers}
                stageTriggersLabel={stageLabel}
                depth={idx + 1}
                showTriggerSelect={true}
                instant={stage.instant}
                reminders={stage.reminder ? [stage.reminder] : []}
                folders={folders}
                byKey={byKey}
                onChangeTriggers={next => changeStageTriggers(stage, next)}
                onChangeInstant={instant => updateStage(stage.id, { instant })}
                onChangeReminders={rems => updateStage(stage.id, { reminder: rems[0] || null })}
              />
            </section>
          );
        })}

        {/* Bottom "+ Continue trail" Bar (fixed slot when under max depth) */}
        {form.stages.length < MAX_CHAIN_DEPTH && (
          <div className={s.continueBox} data-disabled={!primaryKey}>
            <div className={s.continueText}>
              <strong>+ Continue trail</strong>
              <span>
                {!primaryKey
                  ? "Choose a trigger point first to add follow-up stages"
                  : lastStopTriggers().length > 0
                    ? `Next stage pre-selects “${triggersLabel(lastStopTriggers(), byKey)}” (editable)`
                    : "Add another Template or Reminder stage"}
              </span>
            </div>
            <div className={s.continueActions}>
              <button type="button" className={s.ghostBtn} disabled={!primaryKey} onClick={() => addStage("template")}>+ Template stage</button>
              <button type="button" className={s.ghostBtn} disabled={!primaryKey} onClick={() => addStage("reminder")}>+ Reminder stage</button>
            </div>
          </div>
        )}
      </div>

      <footer className={s.dialogFoot}>
        <small style={(localError || error) ? { color: "var(--pn-err, #b91c1c)", fontWeight: 600 } : undefined}>
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
          <span className={s.liveDot} aria-hidden="true" />
          {loading && !catalog.isLive ? "Loading live works…" : catalog.isLive ? `${catalog.byKey.size} works · ${catalog.packages.length} packages` : "Fallback catalog"}
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

    {panelError && <p className={s.whenHint} style={{ color: "var(--pn-err, #b91c1c)", fontWeight: 600 }}>{panelError}</p>}

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
          const hasScope = allTrailTriggerKeys(trail).some(k => catalog.byKey.get(k)?.supportsScope);
          const scopeLabel = PACKAGE_SCOPES.find(p => p.id === trail.scope)?.label;
          const isOn = trail.enabled !== false;
          const busy = busyId === trail._id;
          return (
            <article key={trail._id} className={s.listRow}>
              <div className={s.listMain}>
                <div className={s.listTitleRow}>
                  <strong>{title}</strong>
                  {hasScope && scopeLabel && <span className={s.badge}>{scopeLabel}</span>}
                  <span className={s.liveTag} data-live={isOn}>
                    <span className={s.liveDot} aria-hidden="true" />
                    {isOn ? "Active" : "Paused"}
                  </span>
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
        key={editing._id || "new"}
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
