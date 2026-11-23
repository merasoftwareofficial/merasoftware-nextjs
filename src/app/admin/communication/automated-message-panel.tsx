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
type TemplateItem = { id: string; name: string; channel: Channel; subject: string; text: string; isDefault: boolean };
type SingleMsg = { channel: Channel; subject: string; text: string; templates: TemplateItem[] };
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

type TriggerBadgeInfo = { hasTemplate: boolean; hasReminder: boolean; hasLegacy: boolean };
type MigratedLegacyMeta = { events: string[]; templateIds: string[]; ruleIds: string[] };
type LegacyPullPayload = {
  clientTemplates: TemplateItem[];
  adminTemplates: TemplateItem[];
  reminders: Partial<Reminder>[];
  control?: "auto" | "review";
  events: string[];
  templateIds: string[];
  ruleIds: string[];
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
  migratedLegacy?: MigratedLegacyMeta;
};

type ComboOption = { key: string; label: string; group: string; sub?: string; badges?: ("T" | "R" | "L")[] };

function newObjectIdHex(): string {
  const bytes = new Uint8Array(12);
  const nowSec = Math.floor(Date.now() / 1000);
  bytes[0] = (nowSec >>> 24) & 0xff;
  bytes[1] = (nowSec >>> 16) & 0xff;
  bytes[2] = (nowSec >>> 8) & 0xff;
  bytes[3] = nowSec & 0xff;
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes.subarray(4));
  } else {
    for (let i = 4; i < 12; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
}

const isHexObjectId = (id: unknown): id is string => typeof id === "string" && /^[a-f\d]{24}$/i.test(id);

const blankTemplate = (name = "Default", isDefault = true, base?: Partial<Pick<TemplateItem, "channel" | "subject" | "text">>): TemplateItem => ({
  id: newObjectIdHex(),
  name,
  channel: base?.channel === "email" || base?.channel === "both" ? base.channel : "whatsapp",
  subject: typeof base?.subject === "string" ? base.subject : "",
  text: typeof base?.text === "string" ? base.text : "",
  isDefault,
});

function syncSingleMsg(templates: TemplateItem[]): SingleMsg {
  const list = templates.length ? templates : [blankTemplate("Default", true)];
  const defIdx = list.findIndex(t => t.isDefault);
  const effectiveIdx = defIdx >= 0 ? defIdx : 0;
  const normalized = list.map((t, i) => ({ ...t, isDefault: i === effectiveIdx }));
  const def = normalized[effectiveIdx];
  return {
    channel: def.channel,
    subject: def.subject,
    text: def.text,
    templates: normalized,
  };
}

const blankMsg = (): SingleMsg => syncSingleMsg([blankTemplate("Default", true)]);
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
  if (Array.isArray(raw?.templates) && raw.templates.length > 0) {
    const items: TemplateItem[] = raw.templates.map((item, idx) => {
      const t = (item && typeof item === "object" ? item : {}) as Partial<TemplateItem>;
      return {
        id: isHexObjectId(t.id) ? t.id : newObjectIdHex(),
        name: typeof t.name === "string" && t.name.trim() ? t.name.trim() : (idx === 0 ? "Default" : `Template ${idx + 1}`),
        channel: t.channel === "email" || t.channel === "both" ? t.channel : "whatsapp",
        subject: typeof t.subject === "string" ? t.subject : "",
        text: typeof t.text === "string" ? t.text : "",
        isDefault: Boolean(t.isDefault),
      };
    });
    return syncSingleMsg(items);
  }
  return syncSingleMsg([blankTemplate("Default", true, {
    channel: raw?.channel === "email" || raw?.channel === "both" ? raw.channel : "whatsapp",
    subject: typeof raw?.subject === "string" ? raw.subject : "",
    text: typeof raw?.text === "string" ? raw.text : "",
  })]);
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

function hasMsgContent(msg: SingleMsg): boolean {
  if (msg.text.trim()) return true;
  return (msg.templates || []).some(t => Boolean(t.text.trim()));
}

function hasInstantContent(inst: InstantBlockState): boolean {
  if (inst.audience === "off") return false;
  if (inst.audience === "client") return hasMsgContent(inst.client);
  if (inst.audience === "admin") return hasMsgContent(inst.admin);
  return hasMsgContent(inst.client) || hasMsgContent(inst.admin);
}

function cleanInstantForSave(inst: InstantBlockState): InstantBlockState {
  if (inst.audience === "off") return inst;
  const hasClient = hasMsgContent(inst.client);
  const hasAdmin = hasMsgContent(inst.admin);
  if (inst.audience === "client") return hasClient ? inst : { ...inst, audience: "off" };
  if (inst.audience === "admin") return hasAdmin ? inst : { ...inst, audience: "off" };
  if (hasClient && hasAdmin) return inst;
  if (hasClient) return { ...inst, audience: "client" };
  if (hasAdmin) return { ...inst, audience: "admin" };
  return { ...inst, audience: "off" };
}

function countMsgTemplates(msg: SingleMsg): number {
  const filled = (msg.templates || []).filter(t => Boolean(t.text.trim())).length;
  return filled || (msg.text.trim() ? 1 : 0);
}

function countInstantTemplates(inst: InstantBlockState): number {
  if (inst.audience === "off") return 0;
  let total = 0;
  if (inst.audience === "client" || inst.audience === "both") total += countMsgTemplates(inst.client);
  if (inst.audience === "admin" || inst.audience === "both") total += countMsgTemplates(inst.admin);
  return total;
}

function sameSorted(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((val, i) => val === sb[i]);
}

function findMatchingTrail(form: TrailForm, trails: TrailForm[], byKey: Map<string, WorkItem>): TrailForm | null {
  if (form._id || !form.triggers.length) return null;
  const formHasScope = allTrailTriggerKeys(form).some(k => byKey.get(k)?.supportsScope);
  return trails.find(t => {
    if (!t._id || !sameSorted(t.triggers, form.triggers)) return false;
    if (!formHasScope) return true;
    if (t.scope !== form.scope) return false;
    if (form.scope === "include" || form.scope === "exclude") {
      return sameSorted(t.selectedPackages, form.selectedPackages);
    }
    return true;
  }) || null;
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
  const rootCount = countInstantTemplates(instant);
  const stageCount = stages.reduce((sum, st) => sum + countInstantTemplates(st.instant), 0);
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
                      {item.badges && item.badges.length > 0 && (
                        <span className={s.optBadges}>
                          {item.badges.includes("T") && (
                            <span className={s.optBadgeT} title="Template configured on this trigger">T</span>
                          )}
                          {item.badges.includes("R") && (
                            <span className={s.optBadgeR} title="Reminder configured on this trigger">R</span>
                          )}
                          {item.badges.includes("L") && (
                            <span className={s.optBadgeL} title="Unmigrated legacy templates or reminders available">L</span>
                          )}
                        </span>
                      )}
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
  triggerBadges,
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
  triggerBadges?: Map<string, TriggerBadgeInfo>;
  showHint?: boolean;
  onChange: (next: string[]) => void;
}) {
  const options = useMemo<ComboOption[]>(() => {
    const out: ComboOption[] = [];
    for (const group of folders) {
      for (const item of group.items) {
        if (!exclude.includes(item.key)) {
          const info = triggerBadges?.get(item.key);
          const badges: ("T" | "R" | "L")[] = [];
          if (info?.hasTemplate) badges.push("T");
          if (info?.hasReminder) badges.push("R");
          if (info?.hasLegacy) badges.push("L");
          out.push({ key: item.key, label: item.label, group: group.folder, sub: item.when, ...(badges.length ? { badges } : {}) });
        }
      }
    }
    return out;
  }, [folders, exclude, triggerBadges]);

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

function TemplateEditorBlock({
  label,
  msg,
  onChange,
}: {
  label: string;
  msg: SingleMsg;
  onChange: (next: SingleMsg) => void;
}) {
  const list = msg.templates?.length ? msg.templates : syncSingleMsg([]).templates;
  const defaultTpl = list.find(t => t.isDefault) || list[0];
  const [selectedId, setSelectedId] = useState<string>(defaultTpl.id);
  const [promptMode, setPromptMode] = useState<"" | "new" | "save_as" | "rename">("");
  const [nameInput, setNameInput] = useState("");

  const activeTpl = list.find(t => t.id === selectedId) || defaultTpl;

  function patchActive(patch: Partial<Pick<TemplateItem, "channel" | "subject" | "text">>) {
    const nextList = list.map(t => (t.id === activeTpl.id ? { ...t, ...patch } : t));
    onChange(syncSingleMsg(nextList));
  }

  function openPrompt(mode: "new" | "save_as" | "rename") {
    setPromptMode(mode);
    if (mode === "rename") setNameInput(activeTpl.name);
    else if (mode === "save_as") setNameInput(`${activeTpl.name} copy`);
    else setNameInput(`Template ${list.length + 1}`);
  }

  function confirmPrompt() {
    const clean = nameInput.trim();
    if (!clean) return;
    if (promptMode === "rename") {
      onChange(syncSingleMsg(list.map(t => (t.id === activeTpl.id ? { ...t, name: clean } : t))));
    } else if (promptMode === "save_as") {
      const created = blankTemplate(clean, false, {
        channel: activeTpl.channel,
        subject: activeTpl.subject,
        text: activeTpl.text,
      });
      onChange(syncSingleMsg([...list, created]));
      setSelectedId(created.id);
    } else if (promptMode === "new") {
      const created = blankTemplate(clean, false, { channel: activeTpl.channel, subject: "", text: "" });
      onChange(syncSingleMsg([...list, created]));
      setSelectedId(created.id);
    }
    setPromptMode("");
    setNameInput("");
  }

  function setAsDefault() {
    onChange(syncSingleMsg(list.map(t => ({ ...t, isDefault: t.id === activeTpl.id }))));
  }

  function deleteActive() {
    if (list.length <= 1) return;
    const remaining = list.filter(t => t.id !== activeTpl.id);
    const next = syncSingleMsg(remaining);
    onChange(next);
    setSelectedId(next.templates[0].id);
  }

  return (
    <div style={{ display: "grid", gap: "8px" }}>
      <div className={s.blockHead}>
        <strong className={s.labelRow}>{label}</strong>
        <span className={s.cardSub}>
          {list.length > 1
            ? `${list.length} templates · Auto sends ★ Default`
            : "Sent immediately · Auto sends ★ Default"}
        </span>
      </div>

      <div className={s.tplBar}>
        <div className={s.tplBarRow}>
          <div className={s.tplSelectGroup}>
            <span className={s.miniLabel}>Template</span>
            <select
              className={s.compactSelect}
              aria-label={`${label} template`}
              value={activeTpl.id}
              onChange={e => { setSelectedId(e.target.value); setPromptMode(""); }}
            >
              {list.map(t => (
                <option key={t.id} value={t.id}>
                  {t.name}{t.isDefault ? " ★ Default" : ""}
                </option>
              ))}
            </select>
          </div>
          <div className={s.tplActions}>
            <button type="button" className={s.miniBtn} onClick={() => openPrompt("new")}>+ New</button>
            <button type="button" className={s.miniBtn} onClick={() => openPrompt("save_as")}>Save as new</button>
            {!activeTpl.isDefault && (
              <button type="button" className={s.miniBtn} onClick={setAsDefault}>Set Default</button>
            )}
            <button type="button" className={s.miniBtn} onClick={() => openPrompt("rename")}>Rename</button>
            {list.length > 1 && (
              <button type="button" className={s.miniDangerBtn} onClick={deleteActive}>Delete</button>
            )}
          </div>
        </div>

        {promptMode && (
          <div className={s.tplPromptRow}>
            <span className={s.miniLabel}>
              {promptMode === "new" ? "New template name:" : promptMode === "save_as" ? "Save copy as:" : "Rename to:"}
            </span>
            <input
              type="text"
              className={s.tplPromptInput}
              maxLength={80}
              autoFocus
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") { e.preventDefault(); confirmPrompt(); }
                if (e.key === "Escape") { e.preventDefault(); setPromptMode(""); }
              }}
            />
            <button type="button" className={s.miniBtn} disabled={!nameInput.trim()} onClick={confirmPrompt}>Save</button>
            <button type="button" className={s.miniDangerBtn} onClick={() => setPromptMode("")}>Cancel</button>
          </div>
        )}
      </div>

      <MessageEditor
        title={label}
        step={{ amount: 0, unit: "days", pos: "after", channel: activeTpl.channel, subject: activeTpl.subject, text: activeTpl.text }}
        showTiming={false}
        onChange={patch => patchActive(patch)}
      />
    </div>
  );
}

function InstantAutoMsgBlock({
  state,
  control,
  onChangeControl,
  onChange,
}: {
  state: InstantBlockState;
  control?: "auto" | "review" | "off";
  onChangeControl?: (next: "auto" | "review") => void;
  onChange: (next: InstantBlockState) => void;
}) {
  const showClient = state.audience === "client" || state.audience === "both";
  const showAdmin = state.audience === "admin" || state.audience === "both";

  return (
    <div style={{ display: "grid", gap: "10px" }}>
      <div className={s.blockHead}>
        <div className={s.blockTitle}>
          <span className={s.stageBadge}>Template</span>
          <span>Instant auto message</span>
        </div>
        <div className={s.inlineGroup}>
          {onChangeControl && state.audience !== "off" && (
            <select
              className={s.compactSelect}
              aria-label="Instant message sending mode"
              value={control === "review" ? "review" : "auto"}
              onChange={e => onChangeControl(e.target.value === "review" ? "review" : "auto")}
            >
              <option value="auto">Auto (send immediately)</option>
              <option value="review">Review before send (Admin popup)</option>
            </select>
          )}
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
      </div>

      {state.audience === "off" && (
        <span className={s.cardSub}>Instant auto message is off for this stage.</span>
      )}

      {showClient && (
        <TemplateEditorBlock
          label="Client instant message"
          msg={state.client}
          onChange={client => onChange({ ...state, client })}
        />
      )}

      {showClient && showAdmin && <div className={s.subDivider} role="separator" />}

      {showAdmin && (
        <TemplateEditorBlock
          label="Admin / Team instant message"
          msg={state.admin}
          onChange={admin => onChange({ ...state, admin })}
        />
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
  const set = (patch: Partial<Reminder>) => onChange({ ...reminder, ...patch });

  const effectiveTriggers = reminder.startTrigger !== "__main__" ? [reminder.startTrigger] : stageTriggers;
  const allowedConds = allowedConditionIds(effectiveTriggers.map(k => byKey.get(k)));
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

      {/* 2. Client messages first, then Admin / Team messages */}
      {showClient && (
        <AudienceBlock
          who="client"
          title="Client messages"
          mode={reminder.clientMode}
          steps={reminder.clientSteps}
          baseDate={reminder.countDaysFrom}
          onModeChange={clientMode => set({ clientMode })}
          onUpdateSteps={clientSteps => set({ clientSteps })}
        />
      )}
      {showClient && showAdmin && <div className={s.subDivider} role="separator" />}
      {showAdmin && (
        <AudienceBlock
          who="admin"
          title="Admin / Team messages"
          mode={reminder.adminMode}
          steps={reminder.adminSteps}
          baseDate={reminder.countDaysFrom}
          canCopyClient={showClient}
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
  control,
  onChangeControl,
  reminders,
  folders,
  byKey,
  triggerBadges,
  onChangeTriggers,
  onChangeInstant,
  onChangeReminders,
}: {
  stageTriggers: string[];
  stageTriggersLabel: string;
  depth: number;
  showTriggerSelect?: boolean;
  instant: InstantBlockState;
  control?: "auto" | "review" | "off";
  onChangeControl?: (next: "auto" | "review") => void;
  reminders: Reminder[];
  folders: WorkFolder[];
  byKey: Map<string, WorkItem>;
  triggerBadges?: Map<string, TriggerBadgeInfo>;
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
            triggerBadges={triggerBadges}
            showHint={true}
            onChange={onChangeTriggers}
          />
        </div>
      )}

      {/* 1. Template (Instant Auto Message) */}
      <InstantAutoMsgBlock
        state={instant}
        control={control}
        onChangeControl={onChangeControl}
        onChange={onChangeInstant}
      />

      <div className={s.sectionDivider} role="separator" aria-label="End of Template, start of Follow-up Reminder">
        <span>Follow-up Reminder</span>
      </div>

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
  existingTrails,
  triggerBadges,
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
  existingTrails: TrailForm[];
  triggerBadges: Map<string, TriggerBadgeInfo>;
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
  const [legacyData, setLegacyData] = useState<LegacyPullPayload | null>(null);
  const [legacyPulled, setLegacyPulled] = useState(false);
  const [pullSeq, setPullSeq] = useState(0);
  const set = (patch: Partial<TrailForm>) => {
    if (localError) setLocalError("");
    setForm(curr => ({ ...curr, ...patch }));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const triggersCsv = useMemo(() => [...form.triggers].sort().join(","), [form.triggers]);
  useEffect(() => {
    setLegacyPulled(false);
    if (!triggersCsv) {
      setLegacyData(null);
      return;
    }
    const controller = new AbortController();
    fetch(`/api/auto-reply/action-rules/legacy-for-trigger?triggers=${encodeURIComponent(triggersCsv)}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(res => (res.ok ? res.json().catch(() => null) : null))
      .then(json => {
        if (controller.signal.aborted) return;
        const d = json?.data as LegacyPullPayload | null;
        if (d && ((d.clientTemplates?.length || 0) > 0 || (d.adminTemplates?.length || 0) > 0 || (d.reminders?.length || 0) > 0)) {
          setLegacyData(d);
        } else {
          setLegacyData(null);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setLegacyData(null);
      });
    return () => controller.abort();
  }, [triggersCsv]);

  function applyLegacyPull() {
    if (!legacyData) return;
    const hasClient = (legacyData.clientTemplates?.length || 0) > 0;
    const hasAdmin = (legacyData.adminTemplates?.length || 0) > 0;
    const nextClient = hasClient
      ? normalizeMsg({ templates: legacyData.clientTemplates })
      : form.instant.client;
    const nextAdmin = hasAdmin
      ? normalizeMsg({ templates: legacyData.adminTemplates })
      : form.instant.admin;
    let nextAudience: InstantAudience = form.instant.audience;
    if (hasClient && hasAdmin) nextAudience = "both";
    else if (hasClient) nextAudience = (nextAudience === "admin" || nextAudience === "both") ? "both" : "client";
    else if (hasAdmin) nextAudience = (nextAudience === "client" || nextAudience === "both") ? "both" : "admin";

    const pulledReminders = Array.isArray(legacyData.reminders) && legacyData.reminders.length > 0
      ? legacyData.reminders.map(r => normalizeReminder(r, 0))
      : [];

    setForm(curr => ({
      ...curr,
      control: legacyData.control || curr.control || "auto",
      instant: {
        audience: nextAudience,
        client: nextClient,
        admin: nextAdmin,
      },
      reminders: pulledReminders.length > 0 ? [...curr.reminders, ...pulledReminders] : curr.reminders,
      migratedLegacy: {
        events: [...new Set([...(curr.migratedLegacy?.events || []), ...(legacyData.events || [])])],
        templateIds: [...new Set([...(curr.migratedLegacy?.templateIds || []), ...(legacyData.templateIds || [])])],
        ruleIds: [...new Set([...(curr.migratedLegacy?.ruleIds || []), ...(legacyData.ruleIds || [])])],
      },
    }));
    setLegacyPulled(true);
    setPullSeq(v => v + 1);
  }

  const primaryKey = form.triggers[0] || "";
  const supportsScopeFor = (next: Pick<TrailForm, "triggers" | "reminders" | "stages">) =>
    allTrailTriggerKeys(next).some(k => byKey.get(k)?.supportsScope);
  const hasPackageScope = supportsScopeFor(form);
  const matchingTrail = useMemo(() => findMatchingTrail(form, existingTrails, byKey), [form, existingTrails, byKey]);
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
                triggerBadges={triggerBadges}
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

          {legacyData && (
            <div className={s.legacyBanner} data-pulled={legacyPulled} role="status">
              <div className={s.noticeText}>
                <strong>
                  {legacyPulled
                    ? "Legacy templates loaded into this form"
                    : (() => {
                        const cCount = legacyData.clientTemplates?.length || 0;
                        const aCount = legacyData.adminTemplates?.length || 0;
                        const totalTpl = cCount + aCount;
                        const remCount = legacyData.reminders?.length || 0;
                        const parts: string[] = [];
                        if (totalTpl > 0) {
                          const split = [cCount ? `${cCount} Client` : "", aCount ? `${aCount} Admin` : ""].filter(Boolean).join(", ");
                          parts.push(`${totalTpl} legacy template${totalTpl === 1 ? "" : "s"} (${split})`);
                        }
                        if (remCount > 0) parts.push(`${remCount} reminder${remCount === 1 ? "" : "s"}`);
                        return `${parts.join(" & ")} found for this trigger`;
                      })()}
                </strong>
                <span>
                  {legacyPulled
                    ? "Review or edit below. Old system stays untouched until you click Save."
                    : "Pull existing templates & reminders into this form as-is. Old system stays safe until Save."}
                </span>
              </div>
              {!legacyPulled && (
                <button type="button" className={s.primaryBtn} onClick={applyLegacyPull}>
                  Get Legacy
                </button>
              )}
            </div>
          )}

          {matchingTrail && (
            <div className={s.noticeBanner} role="status">
              <div className={s.noticeText}>
                <strong>Trail already exists for this trigger &amp; package scope</strong>
                <span>Edit the existing trail in-place instead of creating a duplicate.</span>
              </div>
              <button
                type="button"
                className={s.primaryBtn}
                onClick={() => { setLocalError(""); setForm(matchingTrail); }}
              >
                Load &amp; Edit here
              </button>
            </div>
          )}
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
            key={`${form._id || "new-root"}-${pullSeq}`}
            stageTriggers={form.triggers}
            stageTriggersLabel={rootTrigLabel}
            depth={0}
            instant={form.instant}
            control={form.control || "auto"}
            onChangeControl={control => set({ control })}
            reminders={form.reminders}
            folders={folders}
            byKey={byKey}
            triggerBadges={triggerBadges}
            onChangeInstant={instant => set({ instant })}
            onChangeReminders={updateRootReminders}
          />
        </section>

        {/* CARD 3..N: Linear Follow-up Stages */}
        {form.stages.map((stage, idx) => {
          const stageNum = idx + 3;
          const stageLabel = triggersLabel(stage.triggers, byKey);
          return (
            <div key={stage.id} style={{ display: "grid", gap: "14px" }}>
              <div className={s.sectionDivider} role="separator" aria-label={`Start of Stage ${idx + 2}`}>
                <span>Stage {idx + 2}{stageLabel ? ` — ${stageLabel}` : ""}</span>
              </div>
              <section className={s.card} data-stage="followup">
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
                  triggerBadges={triggerBadges}
                  onChangeTriggers={next => changeStageTriggers(stage, next)}
                  onChangeInstant={instant => updateStage(stage.id, { instant })}
                  onChangeReminders={rems => updateStage(stage.id, { reminder: rems[0] || null })}
                />
              </section>
            </div>
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

type ListViewTab = "trails" | "templates" | "reminders";

type DerivedTemplateRow = {
  rowKey: string;
  trail: TrailForm;
  triggerKey: string;
  triggerLabel: string;
  stageNum: number;
  audience: "client" | "admin";
  template: TemplateItem;
  scope: PackageScopeMode;
  scopeLabel: string;
  isOn: boolean;
};

type DerivedReminderRow = {
  rowKey: string;
  trail: TrailForm;
  triggerKey: string;
  triggerLabel: string;
  stageNum: number;
  reminder: Reminder;
  channels: Channel[];
  timingSummary: string;
  conditionLabel: string;
  repeatLabel: string;
  stopLabel: string;
  scope: PackageScopeMode;
  scopeLabel: string;
  isOn: boolean;
};

function channelLabel(ch: Channel) {
  if (ch === "email") return "Email";
  if (ch === "both") return "Email + WhatsApp";
  return "WhatsApp";
}

function summarizeReminderTiming(rem: Reminder): string {
  const showClient = rem.audience === "client" || rem.audience === "both";
  const steps = showClient ? rem.clientSteps : rem.adminSteps;
  if (!steps.length) return "No timing";
  const first = steps[0];
  const firstText = first.pos === "on"
    ? timingPositionLabel("on", rem.countDaysFrom)
    : `${first.amount}${first.unit === "hours" ? "h" : "d"} ${timingPositionLabel(first.pos, rem.countDaysFrom)}`;
  return steps.length > 1 ? `${firstText} (+${steps.length - 1} more)` : firstText;
}

function summarizeRepeat(rem: Reminder): string {
  if (rem.repeatMode === "permanent") return `Every ${rem.repeatEveryDays}d (${rem.repeatPerDay}x/day) until stop`;
  if (rem.repeatMode === "limited") return `Every ${rem.repeatEveryDays}d for ${rem.repeatForDays}d (${rem.repeatPerDay}x/day)`;
  return "No repeat";
}

export function AutomatedMessagesPanel({ active }: { active: boolean }) {
  const [actionsData, setActionsData] = useState<ActionsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [trails, setTrails] = useState<TrailForm[]>([]);
  const [legacyTriggers, setLegacyTriggers] = useState<string[]>([]);
  const [editing, setEditing] = useState<TrailForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [panelError, setPanelError] = useState("");
  const [reloadSeq, setReloadSeq] = useState(0);

  // 3 View Tabs + Filters (derived SSOT from trails)
  const [viewTab, setViewTab] = useState<ListViewTab>("trails");
  const [filterTrigger, setFilterTrigger] = useState("");
  const [filterScope, setFilterScope] = useState<"" | PackageScopeMode>("");
  const [filterAudience, setFilterAudience] = useState<"" | "client" | "admin">("");
  const [filterChannel, setFilterChannel] = useState<"" | Channel>("");
  const [filterStatus, setFilterStatus] = useState<"" | "active" | "paused">("");

  const load = useCallback(async (signal: AbortSignal) => {
    setLoading(true);
    try {
      const [actionsRes, trailsRes, legacyRes] = await Promise.all([
        fetch("/api/auto-reply/actions?view=catalog", { signal, cache: "no-store" }),
        fetch("/api/auto-reply/action-rules/trails", { signal, cache: "no-store" }),
        fetch("/api/auto-reply/action-rules/legacy-summary", { signal, cache: "no-store" }).catch(() => null),
      ]);
      const [actionsJson, trailsJson, legacyJson] = await Promise.all([
        actionsRes.json().catch(() => null),
        trailsRes.json().catch(() => null),
        legacyRes && legacyRes.ok ? legacyRes.json().catch(() => null) : Promise.resolve(null),
      ]);
      if (!signal.aborted) {
        if (actionsRes.ok && actionsJson?.data) setActionsData(actionsJson.data as ActionsData);
        if (trailsRes.ok && Array.isArray(trailsJson?.data)) {
          setTrails(trailsJson.data.map(normalizeTrail));
          setPanelError("");
        } else if (!trailsRes.ok) {
          setPanelError(trailsJson?.error || "Could not load saved automated messages.");
        }
        if (Array.isArray(legacyJson?.data)) {
          setLegacyTriggers(legacyJson.data.filter((k: unknown): k is string => typeof k === "string"));
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

  // Trigger dropdown T / R / L badges derived SSOT from saved Trails + unmigrated legacy summary
  const triggerBadges = useMemo(() => {
    const map = new Map<string, TriggerBadgeInfo>();
    const mark = (key: string, field: "hasTemplate" | "hasReminder" | "hasLegacy") => {
      if (!key) return;
      const prev = map.get(key) || { hasTemplate: false, hasReminder: false, hasLegacy: false };
      prev[field] = true;
      map.set(key, prev);
    };
    for (const trail of trails) {
      if (hasInstantContent(trail.instant)) {
        for (const k of trail.triggers) mark(k, "hasTemplate");
      }
      for (const rem of trail.reminders) {
        const eff = rem.startTrigger && rem.startTrigger !== "__main__" ? [rem.startTrigger] : trail.triggers;
        for (const k of eff) mark(k, "hasReminder");
      }
      for (const st of trail.stages) {
        if (hasInstantContent(st.instant)) {
          for (const k of st.triggers) mark(k, "hasTemplate");
        }
        if (st.reminder) {
          const eff = st.reminder.startTrigger && st.reminder.startTrigger !== "__main__" ? [st.reminder.startTrigger] : st.triggers;
          for (const k of eff) mark(k, "hasReminder");
        }
      }
    }
    for (const k of legacyTriggers) mark(k, "hasLegacy");
    return map;
  }, [trails, legacyTriggers]);

  // Derived Templates list (SSOT from trails)
  const allTemplateRows = useMemo<DerivedTemplateRow[]>(() => {
    const out: DerivedTemplateRow[] = [];
    for (const trail of trails) {
      const isOn = trail.enabled !== false;
      const hasScope = allTrailTriggerKeys(trail).some(k => catalog.byKey.get(k)?.supportsScope);
      const scopeLabel = hasScope ? (PACKAGE_SCOPES.find(p => p.id === trail.scope)?.label || "") : "";
      const collectStage = (triggers: string[], inst: InstantBlockState, stageNum: number) => {
        if (inst.audience === "off") return;
        const primaryTrig = triggers[0] || "";
        const trigLabel = triggers.map(k => workLabel(k, catalog.byKey)).join(" + ") || "Unspecified trigger";
        const pushWho = (who: "client" | "admin", msg: SingleMsg) => {
          const list = msg.templates?.length ? msg.templates : [];
          for (const tpl of list) {
            if (!tpl.text.trim()) continue;
            out.push({
              rowKey: `${trail._id || "t"}-s${stageNum}-${who}-${tpl.id}`,
              trail,
              triggerKey: primaryTrig,
              triggerLabel: trigLabel,
              stageNum,
              audience: who,
              template: tpl,
              scope: trail.scope,
              scopeLabel,
              isOn,
            });
          }
        };
        if (inst.audience === "client" || inst.audience === "both") pushWho("client", inst.client);
        if (inst.audience === "admin" || inst.audience === "both") pushWho("admin", inst.admin);
      };
      collectStage(trail.triggers, trail.instant, 1);
      trail.stages.forEach((st, idx) => collectStage(st.triggers, st.instant, idx + 2));
    }
    return out;
  }, [trails, catalog.byKey]);

  // Derived Reminders list (SSOT from trails)
  const allReminderRows = useMemo<DerivedReminderRow[]>(() => {
    const out: DerivedReminderRow[] = [];
    for (const trail of trails) {
      const isOn = trail.enabled !== false;
      const hasScope = allTrailTriggerKeys(trail).some(k => catalog.byKey.get(k)?.supportsScope);
      const scopeLabel = hasScope ? (PACKAGE_SCOPES.find(p => p.id === trail.scope)?.label || "") : "";
      const pushRem = (rem: Reminder, stageTriggers: string[], stageNum: number, idx: number) => {
        const effTrigs = rem.startTrigger && rem.startTrigger !== "__main__" ? [rem.startTrigger] : stageTriggers;
        const primaryTrig = effTrigs[0] || "";
        const trigLabel = effTrigs.map(k => workLabel(k, catalog.byKey)).join(" + ") || "Unspecified trigger";
        const chSet = new Set<Channel>();
        if (rem.audience === "client" || rem.audience === "both") rem.clientSteps.forEach(st => chSet.add(st.channel));
        if (rem.audience === "admin" || rem.audience === "both") rem.adminSteps.forEach(st => chSet.add(st.channel));
        const condObj = CONDITIONS.find(c => c.id === rem.condition);
        const condLabel = rem.condition === "any" ? "" : (condObj?.label || rem.condition);
        out.push({
          rowKey: `${trail._id || "t"}-s${stageNum}-r${rem.id}-${idx}`,
          trail,
          triggerKey: primaryTrig,
          triggerLabel: trigLabel,
          stageNum,
          reminder: rem,
          channels: [...chSet],
          timingSummary: summarizeReminderTiming(rem),
          conditionLabel: condLabel,
          repeatLabel: summarizeRepeat(rem),
          stopLabel: rem.stopOn.length ? rem.stopOn.map(k => workLabel(k, catalog.byKey)).join(", ") : "",
          scope: trail.scope,
          scopeLabel,
          isOn,
        });
      };
      trail.reminders.forEach((rem, idx) => pushRem(rem, trail.triggers, 1, idx));
      trail.stages.forEach((st, idx) => {
        if (st.reminder) pushRem(st.reminder, st.triggers, idx + 2, 0);
      });
    }
    return out;
  }, [trails, catalog.byKey]);

  // Distinct Trigger options present in saved trails for the filter dropdown
  const filterTriggerOptions = useMemo(() => {
    const keys = new Set<string>();
    for (const trail of trails) {
      for (const k of allTrailTriggerKeys(trail)) keys.add(k);
    }
    return [...keys].map(k => ({ key: k, label: workLabel(k, catalog.byKey) })).sort((a, b) => a.label.localeCompare(b.label));
  }, [trails, catalog.byKey]);

  const hasActiveFilter = Boolean(filterTrigger || filterScope || filterAudience || filterChannel || filterStatus);
  function clearFilters() {
    setFilterTrigger("");
    setFilterScope("");
    setFilterAudience("");
    setFilterChannel("");
    setFilterStatus("");
  }

  const filteredTrails = useMemo(() => trails.filter(trail => {
    const isOn = trail.enabled !== false;
    if (filterStatus === "active" && !isOn) return false;
    if (filterStatus === "paused" && isOn) return false;
    if (filterScope && trail.scope !== filterScope) return false;
    if (filterTrigger && !allTrailTriggerKeys(trail).includes(filterTrigger)) return false;
    if (filterAudience) {
      const matchesInstant = (inst: InstantBlockState) => inst.audience === filterAudience || inst.audience === "both";
      const matchesRem = (rem: Reminder) => rem.audience === filterAudience || rem.audience === "both";
      const ok = matchesInstant(trail.instant)
        || trail.reminders.some(matchesRem)
        || trail.stages.some(st => matchesInstant(st.instant) || (st.reminder ? matchesRem(st.reminder) : false));
      if (!ok) return false;
    }
    if (filterChannel) {
      const hasTplCh = (msg: SingleMsg) => (msg.templates || []).some(t => t.text.trim() && t.channel === filterChannel);
      const hasInstCh = (inst: InstantBlockState) => inst.audience !== "off"
        && (((inst.audience === "client" || inst.audience === "both") && hasTplCh(inst.client))
          || ((inst.audience === "admin" || inst.audience === "both") && hasTplCh(inst.admin)));
      const hasRemCh = (rem: Reminder) => ((rem.audience === "client" || rem.audience === "both") && rem.clientSteps.some(st => st.channel === filterChannel))
        || ((rem.audience === "admin" || rem.audience === "both") && rem.adminSteps.some(st => st.channel === filterChannel));
      const ok = hasInstCh(trail.instant)
        || trail.reminders.some(hasRemCh)
        || trail.stages.some(st => hasInstCh(st.instant) || (st.reminder ? hasRemCh(st.reminder) : false));
      if (!ok) return false;
    }
    return true;
  }), [trails, filterTrigger, filterScope, filterAudience, filterChannel, filterStatus]);

  const filteredTemplates = useMemo(() => allTemplateRows.filter(row => {
    if (filterStatus === "active" && !row.isOn) return false;
    if (filterStatus === "paused" && row.isOn) return false;
    if (filterScope && row.scope !== filterScope) return false;
    if (filterTrigger && row.triggerKey !== filterTrigger && !row.trail.triggers.includes(filterTrigger)) return false;
    if (filterAudience && row.audience !== filterAudience) return false;
    if (filterChannel && row.template.channel !== filterChannel) return false;
    return true;
  }), [allTemplateRows, filterTrigger, filterScope, filterAudience, filterChannel, filterStatus]);

  const filteredReminders = useMemo(() => allReminderRows.filter(row => {
    if (filterStatus === "active" && !row.isOn) return false;
    if (filterStatus === "paused" && row.isOn) return false;
    if (filterScope && row.scope !== filterScope) return false;
    if (filterTrigger && row.triggerKey !== filterTrigger) return false;
    if (filterAudience && row.reminder.audience !== filterAudience && row.reminder.audience !== "both") return false;
    if (filterChannel && !row.channels.includes(filterChannel)) return false;
    return true;
  }), [allReminderRows, filterTrigger, filterScope, filterAudience, filterChannel, filterStatus]);

  const groupedTemplates = useMemo(() => {
    const map = new Map<string, { label: string; rows: DerivedTemplateRow[] }>();
    for (const row of filteredTemplates) {
      const entry = map.get(row.triggerLabel) || { label: row.triggerLabel, rows: [] };
      entry.rows.push(row);
      map.set(row.triggerLabel, entry);
    }
    return [...map.values()];
  }, [filteredTemplates]);

  const groupedReminders = useMemo(() => {
    const map = new Map<string, { label: string; rows: DerivedReminderRow[] }>();
    for (const row of filteredReminders) {
      const entry = map.get(row.triggerLabel) || { label: row.triggerLabel, rows: [] };
      entry.rows.push(row);
      map.set(row.triggerLabel, entry);
    }
    return [...map.values()];
  }, [filteredReminders]);

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
      // Refresh legacy summary immediately so migrated triggers drop the L badge without a page reload.
      fetch("/api/auto-reply/action-rules/legacy-summary", { cache: "no-store" })
        .then(r => (r.ok ? r.json().catch(() => null) : null))
        .then(j => {
          if (Array.isArray(j?.data)) {
            setLegacyTriggers(j.data.filter((k: unknown): k is string => typeof k === "string"));
          }
        })
        .catch(() => {});
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
        <p>Create end-to-end trails in one form and manage Trails, Templates, and Reminders cleanly below.</p>
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

    {/* 3 View Tabs + Filters (SSOT derived from saved Trails) */}
    <div className={s.viewBar}>
      <div className={s.viewTabs} role="tablist" aria-label="Automated message views">
        <button type="button" role="tab" aria-selected={viewTab === "trails"} className={s.viewTab} data-active={viewTab === "trails"} onClick={() => setViewTab("trails")}>
          <span>Trails</span>
          <span className={s.tabCount}>{filteredTrails.length}</span>
        </button>
        <button type="button" role="tab" aria-selected={viewTab === "templates"} className={s.viewTab} data-active={viewTab === "templates"} onClick={() => setViewTab("templates")}>
          <span>Templates</span>
          <span className={s.tabCount}>{filteredTemplates.length}</span>
        </button>
        <button type="button" role="tab" aria-selected={viewTab === "reminders"} className={s.viewTab} data-active={viewTab === "reminders"} onClick={() => setViewTab("reminders")}>
          <span>Reminders</span>
          <span className={s.tabCount}>{filteredReminders.length}</span>
        </button>
      </div>
    </div>

    {trails.length > 0 && (
      <div className={s.filterBar} aria-label="Filter automated messages">
        <select className={s.filterSelect} aria-label="Filter by trigger point" value={filterTrigger} onChange={e => setFilterTrigger(e.target.value)}>
          <option value="">All trigger points</option>
          {filterTriggerOptions.map(opt => <option key={opt.key} value={opt.key}>{opt.label}</option>)}
        </select>
        <select className={s.filterSelect} aria-label="Filter by package scope" value={filterScope} onChange={e => setFilterScope(e.target.value as "" | PackageScopeMode)}>
          <option value="">All package scopes</option>
          {PACKAGE_SCOPES.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
        <select className={s.filterSelect} aria-label="Filter by audience" value={filterAudience} onChange={e => setFilterAudience(e.target.value as "" | "client" | "admin")}>
          <option value="">All audiences</option>
          <option value="client">Client</option>
          <option value="admin">Admin / Team</option>
        </select>
        <select className={s.filterSelect} aria-label="Filter by channel" value={filterChannel} onChange={e => setFilterChannel(e.target.value as "" | Channel)}>
          <option value="">All channels</option>
          <option value="whatsapp">WhatsApp</option>
          <option value="email">Email</option>
          <option value="both">Email + WhatsApp</option>
        </select>
        <select className={s.filterSelect} aria-label="Filter by status" value={filterStatus} onChange={e => setFilterStatus(e.target.value as "" | "active" | "paused")}>
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
        </select>
        {hasActiveFilter && (
          <button type="button" className={s.miniBtn} onClick={clearFilters}>Clear filters</button>
        )}
      </div>
    )}

    {trails.length === 0 ? (
      <div className={s.empty}>
        <strong>No automated messages yet</strong>
        <span>Click “+ Create automated msg” to create your first automated message trail.</span>
      </div>
    ) : viewTab === "trails" ? (
      filteredTrails.length === 0 ? (
        <div className={s.empty}>
          <strong>No matching trails</strong>
          <span>Try clearing or adjusting your filters above.</span>
        </div>
      ) : (
        <div className={s.list}>
          {filteredTrails.map(trail => {
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
                    {trail.control === "review" && <span className={s.reviewBadge}>Review</span>}
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
      )
    ) : viewTab === "templates" ? (
      groupedTemplates.length === 0 ? (
        <div className={s.empty}>
          <strong>No matching templates</strong>
          <span>Templates inside your saved trails appear here grouped by Trigger Point.</span>
        </div>
      ) : (
        <div className={s.list}>
          {groupedTemplates.map(group => (
            <div key={group.label} className={s.groupSection}>
              <div className={s.groupHead}>
                <span>{group.label}</span>
                <span className={s.labelMuted}>{group.rows.length} template{group.rows.length === 1 ? "" : "s"}</span>
              </div>
              {group.rows.map(row => (
                <article key={row.rowKey} className={s.listRow}>
                  <div className={s.listMain}>
                    <div className={s.listTitleRow}>
                      <strong>{row.template.name}</strong>
                      {row.template.isDefault && <span className={s.defaultBadge}>★ Default</span>}
                      <span className={s.badge}>{row.audience === "admin" ? "Admin" : "Client"}</span>
                      <span className={s.badge}>{channelLabel(row.template.channel)}</span>
                      {row.stageNum > 1 && <span className={s.badge}>Stage {row.stageNum}</span>}
                      {row.scopeLabel && <span className={s.badge}>{row.scopeLabel}</span>}
                      <span className={s.liveTag} data-live={row.isOn}>
                        <span className={s.liveDot} aria-hidden="true" />
                        {row.isOn ? "Active" : "Paused"}
                      </span>
                    </div>
                    <p className={s.listSummary}>
                      {row.template.subject ? `${row.template.subject} — ` : ""}{row.template.text}
                    </p>
                  </div>
                  <div className={s.listActions}>
                    <button type="button" className={s.ghostBtn} onClick={() => { setSaveError(""); setEditing(row.trail); }}>
                      Edit
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ))}
        </div>
      )
    ) : (
      groupedReminders.length === 0 ? (
        <div className={s.empty}>
          <strong>No matching reminders</strong>
          <span>Follow-up reminders inside your saved trails appear here grouped by Trigger Point.</span>
        </div>
      ) : (
        <div className={s.list}>
          {groupedReminders.map(group => (
            <div key={group.label} className={s.groupSection}>
              <div className={s.groupHead}>
                <span>{group.label}</span>
                <span className={s.labelMuted}>{group.rows.length} reminder{group.rows.length === 1 ? "" : "s"}</span>
              </div>
              {group.rows.map(row => (
                <article key={row.rowKey} className={s.listRow}>
                  <div className={s.listMain}>
                    <div className={s.listTitleRow}>
                      <strong>{row.timingSummary}</strong>
                      <span className={s.badge}>{audienceShort(row.reminder.audience)}</span>
                      {row.channels.map(ch => <span key={ch} className={s.badge}>{channelLabel(ch)}</span>)}
                      {row.stageNum > 1 && <span className={s.badge}>Stage {row.stageNum}</span>}
                      {row.scopeLabel && <span className={s.badge}>{row.scopeLabel}</span>}
                      <span className={s.liveTag} data-live={row.isOn}>
                        <span className={s.liveDot} aria-hidden="true" />
                        {row.isOn ? "Active" : "Paused"}
                      </span>
                    </div>
                    <p className={s.listSummary}>
                      {[row.repeatLabel, row.conditionLabel ? `Only when: ${row.conditionLabel}` : "", row.stopLabel ? `Stop: ${row.stopLabel}` : ""].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <div className={s.listActions}>
                    <button type="button" className={s.ghostBtn} onClick={() => { setSaveError(""); setEditing(row.trail); }}>
                      Edit
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ))}
        </div>
      )
    )}

    {editing && (
      <FormDialog
        key={editing._id || "new"}
        initial={editing}
        existingTrails={trails}
        triggerBadges={triggerBadges}
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
