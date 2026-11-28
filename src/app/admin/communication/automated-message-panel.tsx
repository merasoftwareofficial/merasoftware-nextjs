"use client";

import { CapsuleSelect } from "@/components/capsule-select";
import { ConfirmDialog, DeleteIconButton, useConfirmDialog } from "@/components/admin-confirm-dialog";
import { useUnsavedGuard } from "@/components/unsaved-guard";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useCommunicationRefresh } from "@/lib/communication-live";
import { NumberInput } from "@/components/number-input";
import type {
  ActionPackageOption,
  ActionsData,
  ConditionCatalogItem,
  SystemActionCatalogItem,
  SystemActionControlDef,
} from "./action-rule-helpers";
import s from "./automated-message.module.css";
import {
  buildWorkCatalog, CONDITIONS, defaultReminderTiming,
  getApplicableBaseDates, getApplicableConditions, getApplicableSystemActions,
  MAX_CHAIN_DEPTH, PACKAGE_SCOPES, PLACEHOLDERS,
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

type SystemActionItem = {
  key: string;
  config: Record<string, string | number | boolean>;
};

type TimeoutConfig = {
  enabled: boolean;
  afterDays: number;
  condition: string;
  conditionValue: number;
  actions: SystemActionItem[];
  nextStageId: number | null;
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
  onTimeout?: TimeoutConfig;
  stopChains: Record<string, StopChain>;
};

type TrailStage = {
  id: number;
  source?: "trigger" | "previous_timeout";
  parentStageId?: number;
  triggers: string[];
  onStartActions?: SystemActionItem[];
  instant: InstantBlockState;
  reminder: Reminder | null;
  migratedLegacy?: MigratedLegacyMeta;
};

type QuickSaveResult = { ok: boolean; message?: string };

type TriggerBadgeInfo = { hasTemplate: boolean; hasReminder: boolean; hasLegacy: boolean };
type MigratedLegacyMeta = { events: string[]; templateIds: string[]; ruleIds: string[] };
type LegacyPullPayload = {
  clientTemplates: TemplateItem[];
  adminTemplates: TemplateItem[];
  reminders: Partial<Reminder>[];
  control?: "auto" | "review";
  adminActionControl?: "auto" | "review" | "off";
  userActionControl?: "auto" | "review" | "off";
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
  adminActionControl?: "auto" | "review" | "off";
  userActionControl?: "auto" | "review" | "off";
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
  const isPaymentDue = triggerKey === "invoice.created";
  const isDueAnchored = timing.countDaysFrom !== "trigger_date";
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
    condition: isPaymentDue ? "unpaid" : "any",
    conditionValue: 50,
    stopOn: [...defaultStops],
    onTimeout: {
      enabled: false,
      afterDays: isDueAnchored ? 0 : 5,
      condition: isPaymentDue ? "unpaid" : "not_stopped",
      conditionValue: 50,
      actions: [],
      nextStageId: null,
    },
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
      channel: st.channel === "email" || st.channel === "both" ? st.channel : "whatsapp",
      subject: typeof st.subject === "string" ? st.subject : "",
      text: typeof st.text === "string" ? st.text : "",
    };
  });
}

const defaultTimeoutConfig = (fallbackDays = 5): TimeoutConfig => ({
  enabled: false,
  afterDays: fallbackDays,
  condition: "not_stopped",
  conditionValue: 50,
  actions: [],
  nextStageId: null,
});

function normalizeSystemActions(raw: unknown): SystemActionItem[] {
  if (!Array.isArray(raw)) return [];
  const out: SystemActionItem[] = [];
  for (const item of raw.slice(0, 5)) {
    if (!item || typeof item !== "object") continue;
    const obj = item as { key?: unknown; config?: unknown };
    const key = typeof obj.key === "string" ? obj.key.trim() : "";
    if (!key) continue;
    const rawCfg = obj.config && typeof obj.config === "object" ? (obj.config as Record<string, unknown>) : {};
    const config: Record<string, string | number | boolean> = {};
    for (const [k, v] of Object.entries(rawCfg)) {
      if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") config[k] = v;
    }
    out.push({ key, config });
  }
  return out;
}

function normalizeTimeoutConfig(raw: unknown, fallbackDays = 5): TimeoutConfig {
  const t = (raw && typeof raw === "object" ? raw : {}) as Partial<TimeoutConfig>;
  const afterDays = typeof t.afterDays === "number" && Number.isFinite(t.afterDays)
    ? Math.max(0, Math.min(365, Math.round(t.afterDays)))
    : Math.max(0, fallbackDays);
  const condVal = typeof t.conditionValue === "number" && Number.isFinite(t.conditionValue)
    ? Math.max(0, t.conditionValue)
    : 50;
  const nextStageId = typeof t.nextStageId === "number" && Number.isFinite(t.nextStageId) && t.nextStageId > 0
    ? Math.round(t.nextStageId)
    : null;
  return {
    enabled: Boolean(t.enabled),
    afterDays,
    condition: typeof t.condition === "string" && t.condition.trim() ? t.condition.trim() : "not_stopped",
    conditionValue: condVal,
    actions: normalizeSystemActions(t.actions),
    nextStageId,
  };
}

function defaultConfigForAction(def: SystemActionCatalogItem): Record<string, string | number | boolean> {
  const cfg: Record<string, string | number | boolean> = {};
  for (const ctrl of def.controls || []) {
    cfg[ctrl.key] = ctrl.defaultVal;
  }
  return cfg;
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
  const safeForDays = typeof r.repeatForDays === "number" && Number.isFinite(r.repeatForDays) ? Math.max(1, r.repeatForDays) : 7;
  const countDaysFrom: BaseDate = r.countDaysFrom === "trigger_date" || r.countDaysFrom === "grace_end_date" || r.countDaysFrom === "expiry_date" || r.countDaysFrom === "deadline_date" ? r.countDaysFrom : "due_date";
  const repeatMode: RepeatMode = r.repeatMode === "permanent" || r.repeatMode === "limited"
    ? r.repeatMode
    : (r.repeatMode === "until_due" && countDaysFrom !== "trigger_date" ? "until_due" : "off");
  const timeoutFallback = countDaysFrom === "trigger_date" ? safeForDays : 0;
  return {
    id,
    startTrigger: typeof r.startTrigger === "string" && r.startTrigger ? r.startTrigger : "__main__",
    audience: r.audience === "admin" || r.audience === "both" ? r.audience : "client",
    clientMode: r.clientMode === "universal" ? "universal" : "separate",
    adminMode: r.adminMode === "universal" ? "universal" : "separate",
    clientSteps: normalizeSteps(r.clientSteps),
    adminSteps: normalizeSteps(r.adminSteps),
    repeatMode,
    repeatForDays: safeForDays,
    repeatEveryDays: typeof r.repeatEveryDays === "number" && Number.isFinite(r.repeatEveryDays) ? Math.max(1, r.repeatEveryDays) : 2,
    repeatPerDay: typeof r.repeatPerDay === "number" && Number.isFinite(r.repeatPerDay) ? Math.min(4, Math.max(1, r.repeatPerDay)) : 1,
    countDaysFrom,
    condition: typeof r.condition === "string" && r.condition ? r.condition : "any",
    conditionValue: typeof r.conditionValue === "number" && Number.isFinite(r.conditionValue) ? Math.max(0, r.conditionValue) : 50,
    stopOn: Array.isArray(r.stopOn) ? r.stopOn.filter((k): k is string => typeof k === "string" && Boolean(k)) : [],
    onTimeout: normalizeTimeoutConfig(r.onTimeout, timeoutFallback),
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
        source: st.source === "previous_timeout" ? "previous_timeout" : "trigger",
        parentStageId: typeof st.parentStageId === "number" && Number.isFinite(st.parentStageId) ? st.parentStageId : 0,
        triggers: [...new Set(stageTriggers)],
        onStartActions: normalizeSystemActions(st.onStartActions),
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
    ...(t.adminActionControl === "auto" || t.adminActionControl === "review" || t.adminActionControl === "off" ? { adminActionControl: t.adminActionControl } : {}),
    ...(t.userActionControl === "auto" || t.userActionControl === "review" || t.userActionControl === "off" ? { userActionControl: t.userActionControl } : {}),
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

type EditFocus =
  | { mode: "full" }
  | { mode: "template"; stageIndex: number; audience?: "client" | "admin"; templateId?: string }
  | { mode: "reminder"; stageIndex: number };

type RelatedTrailMatch = {
  trail: TrailForm;
  isExactMatch: boolean;
  whereLabels: string[];
  scopeLabel: string;
  templateSummaries: string[];
  reminderCount: number;
  isOn: boolean;
};

type TriggerCoverageInfo = {
  triggerKey: string;
  triggerLabel: string;
  activeCount: number;
  pausedCount: number;
  activeTemplates: number;
  activeReminders: number;
  inCurrentTrailStage: number | null;
  scopeLabels: string[];
};

function summarizeInstantNames(inst: InstantBlockState): string[] {
  if (inst.audience === "off") return [];
  const out: string[] = [];
  const push = (who: "Client" | "Admin", msg: SingleMsg) => {
    for (const tpl of msg.templates || []) {
      if (!tpl.text.trim()) continue;
      out.push(`${tpl.name}${tpl.isDefault ? " ★" : ""} (${who})`);
    }
  };
  if (inst.audience === "client" || inst.audience === "both") push("Client", inst.client);
  if (inst.audience === "admin" || inst.audience === "both") push("Admin", inst.admin);
  return out;
}

function findRelatedTrails(form: TrailForm, trails: TrailForm[], byKey: Map<string, WorkItem>): RelatedTrailMatch[] {
  if (form._id || !form.triggers.length) return [];
  const selected = new Set(form.triggers);
  const formHasScope = allTrailTriggerKeys(form).some(k => byKey.get(k)?.supportsScope);
  const matches: RelatedTrailMatch[] = [];

  for (const t of trails) {
    if (!t._id) continue;
    const whereLabels: string[] = [];
    const templateSummaries: string[] = [];
    let reminderCount = 0;

    const rootMatches = t.triggers.some(k => selected.has(k));
    const rootCustomRemMatches = t.reminders.filter(
      rem => rem.startTrigger && rem.startTrigger !== "__main__" && selected.has(rem.startTrigger),
    );
    if (rootMatches || rootCustomRemMatches.length > 0) {
      whereLabels.push("Stage 1");
      if (rootMatches) {
        templateSummaries.push(...summarizeInstantNames(t.instant));
        reminderCount += t.reminders.filter(rem => !rem.startTrigger || rem.startTrigger === "__main__").length;
      }
      reminderCount += rootCustomRemMatches.length;
    }

    t.stages.forEach((st, idx) => {
      const stMatches = st.triggers.some(k => selected.has(k));
      const stCustomRem = st.reminder?.startTrigger && st.reminder.startTrigger !== "__main__" && selected.has(st.reminder.startTrigger);
      if (stMatches || stCustomRem) {
        whereLabels.push(`Stage ${idx + 2}`);
        if (stMatches) {
          templateSummaries.push(...summarizeInstantNames(st.instant));
          if (st.reminder && (!st.reminder.startTrigger || st.reminder.startTrigger === "__main__")) reminderCount += 1;
        }
        if (stCustomRem) reminderCount += 1;
      }
    });

    if (whereLabels.length === 0) continue;

    const exactScope = !formHasScope
      || (t.scope === form.scope && (
        (form.scope !== "include" && form.scope !== "exclude")
        || sameSorted(t.selectedPackages, form.selectedPackages)
      ));
    const isExactMatch = sameSorted(t.triggers, form.triggers) && exactScope;
    const trailHasScope = allTrailTriggerKeys(t).some(k => byKey.get(k)?.supportsScope);
    const scopeLabel = trailHasScope
      ? (t.scope === "include" || t.scope === "exclude"
        ? `${t.scope === "include" ? "Include" : "Exclude"} ${t.selectedPackages.length} pkg${t.selectedPackages.length === 1 ? "" : "s"}`
        : (PACKAGE_SCOPES.find(p => p.id === t.scope)?.label || ""))
      : "";

    matches.push({
      trail: t,
      isExactMatch,
      whereLabels,
      scopeLabel,
      templateSummaries,
      reminderCount,
      isOn: t.enabled !== false,
    });
  }

  return matches.sort((a, b) => {
    if (a.isExactMatch !== b.isExactMatch) return a.isExactMatch ? -1 : 1;
    if (a.isOn !== b.isOn) return a.isOn ? -1 : 1;
    return 0;
  });
}

function describeTriggerCoverage(
  triggerKeys: string[],
  trails: TrailForm[],
  currentTrailId: string | undefined,
  currentStages: TrailStage[],
  byKey: Map<string, WorkItem>,
): TriggerCoverageInfo[] {
  const uniqueKeys = [...new Set(triggerKeys.filter(Boolean))];
  const out: TriggerCoverageInfo[] = [];

  for (const key of uniqueKeys) {
    let activeCount = 0;
    let pausedCount = 0;
    let activeTemplates = 0;
    let activeReminders = 0;
    const scopeSet = new Set<string>();

    for (const t of trails) {
      if (!t._id || (currentTrailId && t._id === currentTrailId)) continue;
      let tTpl = 0;
      let tRem = 0;
      if (t.triggers.includes(key)) {
        tTpl += countInstantTemplates(t.instant);
        tRem += t.reminders.filter(rem => !rem.startTrigger || rem.startTrigger === "__main__").length;
      }
      tRem += t.reminders.filter(rem => rem.startTrigger === key).length;
      for (const st of t.stages) {
        if (st.triggers.includes(key)) {
          tTpl += countInstantTemplates(st.instant);
          if (st.reminder && (!st.reminder.startTrigger || st.reminder.startTrigger === "__main__")) tRem += 1;
        }
        if (st.reminder?.startTrigger === key) tRem += 1;
      }
      if (tTpl === 0 && tRem === 0) continue;

      if (t.enabled !== false) {
        activeCount += 1;
        activeTemplates += tTpl;
        activeReminders += tRem;
        const hasScope = allTrailTriggerKeys(t).some(k => byKey.get(k)?.supportsScope);
        if (hasScope) {
          const lbl = PACKAGE_SCOPES.find(p => p.id === t.scope)?.label;
          if (lbl) scopeSet.add(lbl);
        }
      } else {
        pausedCount += 1;
      }
    }

    const stageIdx = currentStages.findIndex(st => st.triggers.includes(key));
    const inCurrentTrailStage = stageIdx >= 0 ? stageIdx + 2 : null;

    if (activeCount > 0 || pausedCount > 0 || inCurrentTrailStage !== null) {
      out.push({
        triggerKey: key,
        triggerLabel: workLabel(key, byKey),
        activeCount,
        pausedCount,
        activeTemplates,
        activeReminders,
        inCurrentTrailStage,
        scopeLabels: [...scopeSet],
      });
    }
  }

  return out;
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

type PreviewRequest = {
  title: string;
  channel: Channel;
  subject: string;
  text: string;
  triggerLabel?: string;
};

const SAMPLE_PREVIEW_VALUES: Record<string, string> = {
  name: "Rahul Sharma",
  package: "Monthly Growth Plan",
  planName: "Monthly Growth Plan",
  project: "Website Redesign",
  amount: "₹4,999",
  dueDate: "15 Dec 2026",
  progress: "60%",
  remainingLimit: "2",
  invoiceLink: "https://merasoftware.com/invoice/sample",
  portalLink: "https://merasoftware.com/portal",
  planLink: "https://merasoftware.com/plan/sample",
  projectLink: "https://merasoftware.com/project/sample",
  packageLink: "https://merasoftware.com/package/monthly-growth",
  email: "rahul@example.com",
  phone: "+91 98765 43210",
  duration: "1 month",
};

function fillSampleVariables(raw: string): string {
  return String(raw || "").replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key: string) => (
    Object.prototype.hasOwnProperty.call(SAMPLE_PREVIEW_VALUES, key) ? SAMPLE_PREVIEW_VALUES[key] : match
  ));
}

function smartPreviewSubject(subject: string, text: string, fallback = "Automated Message"): { value: string; isFallback: boolean } {
  const cleanSub = fillSampleVariables(subject).replace(/[\r\n]+/g, " ").trim();
  if (cleanSub) return { value: cleanSub, isFallback: false };
  const firstLine = fillSampleVariables(text)
    .split(/\r?\n/)
    .map(l => l.replace(/^[\s#*•\-_]+/, "").replace(/[*_]+/g, "").trim())
    .find(Boolean);
  if (firstLine) return { value: firstLine.slice(0, 80), isFallback: true };
  return { value: fallback, isFallback: true };
}

function renderFormattedLines(text: string) {
  const lines = text.split(/\r?\n/);
  return lines.map((line, lineIdx) => {
    const tokens: (string | { kind: "bold" | "italic"; val: string })[] = [];
    const regex = /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|_[^_\n]+_)/g;
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(line)) !== null) {
      if (m.index > last) tokens.push(line.slice(last, m.index));
      const raw = m[0];
      if (raw.startsWith("**") && raw.endsWith("**")) tokens.push({ kind: "bold", val: raw.slice(2, -2) });
      else if (raw.startsWith("*") && raw.endsWith("*")) tokens.push({ kind: "bold", val: raw.slice(1, -1) });
      else if (raw.startsWith("_") && raw.endsWith("_")) tokens.push({ kind: "italic", val: raw.slice(1, -1) });
      last = m.index + raw.length;
    }
    if (last < line.length) tokens.push(line.slice(last));
    return (
      <span key={lineIdx}>
        {lineIdx > 0 && "\n"}
        {tokens.map((tok, i) => (
          typeof tok === "string"
            ? tok
            : tok.kind === "bold"
              ? <strong key={i}>{tok.val}</strong>
              : <em key={i}>{tok.val}</em>
        ))}
      </span>
    );
  });
}

function MessagePreviewModal({
  item,
  onClose,
}: {
  item: PreviewRequest;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"whatsapp" | "email">(item.channel === "email" ? "email" : "whatsapp");
  const filledText = fillSampleVariables(item.text);
  const sub = smartPreviewSubject(item.subject, item.text, item.triggerLabel || "Mera Software Notification");

  return (
    <div className={s.previewOverlay}>
      <div className={s.previewBackdrop} onClick={onClose} />
      <div className={s.previewDialog} role="dialog" aria-modal="true" aria-label="Message preview">
        <header className={s.previewHead}>
          <div>
            <h3>Message preview — {item.title}</h3>
            <p>Sample values filled (Rahul Sharma · ₹4,999 · 15 Dec 2026 · Monthly Growth Plan)</p>
          </div>
          <button type="button" className={s.closeBtn} aria-label="Close preview" onClick={onClose}>✕</button>
        </header>

        {item.channel === "both" && (
          <div className={s.previewTabs} role="tablist" aria-label="Preview channel">
            <button
              type="button"
              role="tab"
              aria-selected={tab === "whatsapp"}
              className={s.viewTab}
              data-active={tab === "whatsapp"}
              onClick={() => setTab("whatsapp")}
            >
              WhatsApp Preview
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "email"}
              className={s.viewTab}
              data-active={tab === "email"}
              onClick={() => setTab("email")}
            >
              Email HTML Preview
            </button>
          </div>
        )}

        <div className={s.previewBody}>
          {(item.channel === "whatsapp" || (item.channel === "both" && tab === "whatsapp")) ? (
            <>
              <div className={s.waCanvas}>
                <div className={s.waBubble}>
                  {filledText.trim() ? renderFormattedLines(filledText) : <em>(Message box is empty)</em>}
                </div>
              </div>
              <p className={s.waMetaNote}>
                WhatsApp sends your exact Message box as-is (Email subject is never added as a heading on WhatsApp).
              </p>
            </>
          ) : (
            <div className={s.emailPreviewCard}>
              <div className={s.emailSubjectBar}>
                <strong>Subject:</strong>{" "}
                {sub.value}
                {sub.isFallback && <span className={s.labelMuted}> (auto fallback — add an Email subject before saving)</span>}
              </div>
              <div className={s.emailShell}>
                <div className={s.emailBrandHead}>Mera Software</div>
                <div className={s.emailBrandBody}>
                  {filledText.trim() ? renderFormattedLines(filledText) : <em>(Message box is empty)</em>}
                </div>
                <div className={s.emailBrandFoot}>© {new Date().getFullYear()} Mera Software. All rights reserved.</div>
              </div>
            </div>
          )}
        </div>

        <footer className={s.previewFoot}>
          <small>Press Esc or Close to return to editing.</small>
          <button type="button" className={s.primaryBtn} onClick={onClose}>Close preview</button>
        </footer>
      </div>
    </div>
  );
}

type AccordionCtrl = {
  isOpen: (id: string) => boolean;
  toggle: (id: string, multi: boolean) => void;
  openOnly: (id: string) => void;
  openPreview: (req: PreviewRequest) => void;
};

function collectVisibleBoxIds(form: TrailForm, focus: EditFocus): string[] {
  const ids: string[] = [];
  const pushInstant = (prefix: string, inst: InstantBlockState) => {
    if (inst.audience === "client" || inst.audience === "both") ids.push(`${prefix}-tpl-client`);
    if (inst.audience === "admin" || inst.audience === "both") ids.push(`${prefix}-tpl-admin`);
  };
  const pushReminder = (prefix: string, rem: Reminder) => {
    if (rem.audience === "client" || rem.audience === "both") {
      if (rem.clientMode === "universal") ids.push(`${prefix}-r${rem.id}-client-u`);
      else rem.clientSteps.forEach((_, i) => ids.push(`${prefix}-r${rem.id}-client-${i}`));
    }
    if (rem.audience === "admin" || rem.audience === "both") {
      if (rem.adminMode === "universal") ids.push(`${prefix}-r${rem.id}-admin-u`);
      else rem.adminSteps.forEach((_, i) => ids.push(`${prefix}-r${rem.id}-admin-${i}`));
    }
  };

  if (focus.mode === "template") {
    if (focus.stageIndex === 0) pushInstant("s0", form.instant);
    else {
      const st = form.stages[focus.stageIndex - 1];
      if (st) pushInstant(`st${st.id}`, st.instant);
    }
    return ids;
  }
  if (focus.mode === "reminder") {
    if (focus.stageIndex === 0) form.reminders.forEach(rem => pushReminder("s0", rem));
    else {
      const st = form.stages[focus.stageIndex - 1];
      if (st?.reminder) pushReminder(`st${st.id}`, st.reminder);
    }
    return ids;
  }

  pushInstant("s0", form.instant);
  form.reminders.forEach(rem => pushReminder("s0", rem));
  for (const st of form.stages) {
    pushInstant(`st${st.id}`, st.instant);
    if (st.reminder) pushReminder(`st${st.id}`, st.reminder);
  }
  return ids;
}

function defaultOpenBoxId(form: TrailForm, focus: EditFocus): string | null {
  if (focus.mode === "template") {
    const prefix = focus.stageIndex === 0 ? "s0" : `st${form.stages[focus.stageIndex - 1]?.id ?? 0}`;
    const inst = focus.stageIndex === 0 ? form.instant : form.stages[focus.stageIndex - 1]?.instant;
    if (focus.audience === "admin" && (inst?.audience === "admin" || inst?.audience === "both")) {
      return `${prefix}-tpl-admin`;
    }
    if (focus.audience === "client" && (inst?.audience === "client" || inst?.audience === "both")) {
      return `${prefix}-tpl-client`;
    }
  }
  const all = collectVisibleBoxIds(form, focus);
  return all[0] || null;
}

function cleanSingleReminder(
  rem: Reminder,
  effTriggers: string[],
  stageLabel: string,
  stagePrefix: string,
  byKey: Map<string, WorkItem>,
  catalogConditions: ConditionCatalogItem[] = [],
): { reminder?: Reminder; error?: string; errorBoxId?: string } {
  const effWorks = effTriggers.map(k => byKey.get(k));
  const liveConds = getApplicableConditions(effWorks, catalogConditions, "reminder");
  const allowedConds = liveConds.map(c => c.key);
  const condition = allowedConds.includes(rem.condition) ? rem.condition : "any";
  const repeatMode: RepeatMode = rem.countDaysFrom === "trigger_date" && rem.repeatMode === "until_due" ? "off" : rem.repeatMode;
  const onTimeout = repeatMode === "permanent" && rem.onTimeout?.enabled
    ? { ...rem.onTimeout, enabled: false }
    : rem.onTimeout;
  const fixStep = (st: MessageStep): MessageStep => (
    rem.countDaysFrom === "trigger_date" && st.pos === "before" ? { ...st, pos: "after" } : st
  );
  const clientSteps = rem.clientSteps.map(fixStep);
  const adminSteps = rem.adminSteps.map(fixStep);

  const showClient = rem.audience === "client" || rem.audience === "both";
  const showAdmin = rem.audience === "admin" || rem.audience === "both";
  const label = triggersLabel(effTriggers, byKey);

  if (showClient) {
    if (rem.clientMode === "universal") {
      if (!clientSteps[0]?.text.trim()) {
        return { error: `Write the Client message in ${stageLabel} Reminder (${label}).`, errorBoxId: `${stagePrefix}-r${rem.id}-client-u` };
      }
      if (clientSteps[0]?.channel !== "whatsapp" && !clientSteps[0]?.subject.trim()) {
        return { error: `Write the Email subject for Client message in ${stageLabel} Reminder (${label}).`, errorBoxId: `${stagePrefix}-r${rem.id}-client-u` };
      }
    } else {
      const badIdx = clientSteps.findIndex(st => !st.text.trim());
      if (badIdx >= 0) {
        return { error: `Write the Client message in ${stageLabel} Reminder (${label}).`, errorBoxId: `${stagePrefix}-r${rem.id}-client-${badIdx}` };
      }
      const badSubIdx = clientSteps.findIndex(st => st.channel !== "whatsapp" && !st.subject.trim());
      if (badSubIdx >= 0) {
        return { error: `Write the Email subject for Client Message ${badSubIdx + 1} in ${stageLabel} Reminder (${label}).`, errorBoxId: `${stagePrefix}-r${rem.id}-client-${badSubIdx}` };
      }
    }
  }
  if (showAdmin) {
    if (rem.adminMode === "universal") {
      if (!adminSteps[0]?.text.trim()) {
        return { error: `Write the Admin message in ${stageLabel} Reminder (${label}).`, errorBoxId: `${stagePrefix}-r${rem.id}-admin-u` };
      }
      if (adminSteps[0]?.channel !== "whatsapp" && !adminSteps[0]?.subject.trim()) {
        return { error: `Write the Email subject for Admin message in ${stageLabel} Reminder (${label}).`, errorBoxId: `${stagePrefix}-r${rem.id}-admin-u` };
      }
    } else {
      const badIdx = adminSteps.findIndex(st => !st.text.trim());
      if (badIdx >= 0) {
        return { error: `Write the Admin message in ${stageLabel} Reminder (${label}).`, errorBoxId: `${stagePrefix}-r${rem.id}-admin-${badIdx}` };
      }
      const badSubIdx = adminSteps.findIndex(st => st.channel !== "whatsapp" && !st.subject.trim());
      if (badSubIdx >= 0) {
        return { error: `Write the Email subject for Admin Message ${badSubIdx + 1} in ${stageLabel} Reminder (${label}).`, errorBoxId: `${stagePrefix}-r${rem.id}-admin-${badSubIdx}` };
      }
    }
  }

  const maxSteps = Math.max(showClient ? clientSteps.length : 0, showAdmin ? adminSteps.length : 0);
  const cleanStopOn = rem.stopOn.filter(k => !effTriggers.includes(k));
  if ((repeatMode === "permanent" || repeatMode === "limited" || repeatMode === "until_due" || maxSteps > 1) && cleanStopOn.length === 0) {
    return { error: `Add at least one Stop Trigger for ${stageLabel} Reminder (${label}).` };
  }

  return {
    reminder: {
      ...rem,
      repeatMode,
      onTimeout,
      condition,
      stopOn: cleanStopOn,
      clientSteps,
      adminSteps,
      stopChains: {},
    },
  };
}

function checkInstantSubjects(
  inst: InstantBlockState,
  stageLabel: string,
  stagePrefix: string,
): { error: string; errorBoxId: string } | null {
  if (inst.audience === "off") return null;
  const checkWho = (who: "client" | "admin", msg: SingleMsg) => {
    for (const tpl of msg.templates || []) {
      if (!tpl.text.trim()) continue;
      if (tpl.channel !== "whatsapp" && !tpl.subject.trim()) {
        return {
          error: `Write the Email subject for ${who === "admin" ? "Admin" : "Client"} template “${tpl.name}” in ${stageLabel}.`,
          errorBoxId: `${stagePrefix}-tpl-${who}`,
        };
      }
    }
    return null;
  };
  if (inst.audience === "client" || inst.audience === "both") {
    const err = checkWho("client", inst.client);
    if (err) return err;
  }
  if (inst.audience === "admin" || inst.audience === "both") {
    const err = checkWho("admin", inst.admin);
    if (err) return err;
  }
  return null;
}

function mergeLegacyTemplates(current: SingleMsg, pulled: TemplateItem[]): SingleMsg {
  const existing = (current.templates || []).filter(t => t.text.trim().length > 0);
  const normalizedPulled = normalizeMsg({ templates: pulled }).templates.filter(t => t.text.trim().length > 0);
  if (existing.length === 0) return normalizeMsg({ templates: normalizedPulled });
  const seenIds = new Set(existing.map(t => t.id.toLowerCase()));
  const seenContent = new Set(existing.map(t => `${t.name.trim().toLowerCase()}::${t.text.trim()}`));
  const extras: TemplateItem[] = [];
  for (const item of normalizedPulled) {
    const idKey = item.id.toLowerCase();
    const contentKey = `${item.name.trim().toLowerCase()}::${item.text.trim()}`;
    if (seenIds.has(idKey) || seenContent.has(contentKey)) continue;
    seenIds.add(idKey);
    seenContent.add(contentKey);
    extras.push({ ...item, isDefault: false });
  }
  return syncSingleMsg([...existing, ...extras].slice(0, 25));
}

function mergeLegacyMeta(items: Array<MigratedLegacyMeta | undefined>): MigratedLegacyMeta | undefined {
  const events = [...new Set(items.flatMap(m => m?.events || []).filter(Boolean))];
  const templateIds = [...new Set(items.flatMap(m => m?.templateIds || []).filter(Boolean))];
  const ruleIds = [...new Set(items.flatMap(m => m?.ruleIds || []).filter(Boolean))];
  if (!events.length && !templateIds.length && !ruleIds.length) return undefined;
  return { events, templateIds, ruleIds };
}

function formSnapshotKey(f: TrailForm): string {
  return JSON.stringify({
    triggers: f.triggers,
    scope: f.scope,
    selectedPackages: f.selectedPackages,
    instant: f.instant,
    reminders: f.reminders,
    stages: f.stages,
    control: f.control,
    adminActionControl: f.adminActionControl,
    userActionControl: f.userActionControl,
    migratedLegacy: f.migratedLegacy,
  });
}

function prepareTrailForSave(form: TrailForm, byKey: Map<string, WorkItem>, catalogConditions: ConditionCatalogItem[] = []): { trail: TrailForm; error: string | null; errorBoxId?: string } {
  if (!form.triggers.length) return { trail: form, error: "Choose at least one trigger point." };

  const hasScope = allTrailTriggerKeys(form).some(k => byKey.get(k)?.supportsScope);
  if (hasScope && (form.scope === "include" || form.scope === "exclude") && form.selectedPackages.length === 0) {
    return {
      trail: form,
      error: `Select at least one package to ${form.scope} (or switch Packages to All).`,
    };
  }

  const cleanInstant = cleanInstantForSave(form.instant);
  const rootSubErr = checkInstantSubjects(cleanInstant, "Stage 1", "s0");
  if (rootSubErr) return { trail: form, error: rootSubErr.error, errorBoxId: rootSubErr.errorBoxId };
  const cleanReminders: Reminder[] = [];
  for (let i = 0; i < form.reminders.length; i++) {
    const rem = form.reminders[i];
    const effTriggers = rem.startTrigger !== "__main__" ? [rem.startTrigger] : form.triggers;
    const res = cleanSingleReminder(rem, effTriggers, `Stage 1`, "s0", byKey, catalogConditions);
    if (res.error || !res.reminder) return { trail: form, error: res.error || "Invalid reminder.", errorBoxId: res.errorBoxId };
    cleanReminders.push(res.reminder);
  }

  const cleanStages: TrailStage[] = [];
  for (let i = 0; i < form.stages.length; i++) {
    const st = form.stages[i];
    const stageNum = i + 2;
    const isTimeoutStage = st.source === "previous_timeout";
    const effStageTriggers = st.triggers.length ? st.triggers : (isTimeoutStage ? form.triggers : []);
    if (!effStageTriggers.length) return { trail: form, error: `Choose at least one trigger point for Stage ${stageNum}.` };
    const stInstant = cleanInstantForSave(st.instant);
    const stSubErr = checkInstantSubjects(stInstant, `Stage ${stageNum}`, `st${st.id}`);
    if (stSubErr) return { trail: form, error: stSubErr.error, errorBoxId: stSubErr.errorBoxId };
    let stReminder: Reminder | null = null;
    if (st.reminder) {
      const effTriggers = st.reminder.startTrigger !== "__main__" ? [st.reminder.startTrigger] : effStageTriggers;
      const res = cleanSingleReminder(st.reminder, effTriggers, `Stage ${stageNum}`, `st${st.id}`, byKey, catalogConditions);
      if (res.error || !res.reminder) return { trail: form, error: res.error || "Invalid reminder.", errorBoxId: res.errorBoxId };
      stReminder = res.reminder;
    }
    const cleanStartActions = normalizeSystemActions(st.onStartActions);
    if (stInstant.audience === "off" && !stReminder && cleanStartActions.length === 0) {
      return { trail: form, error: `Stage ${stageNum} (${isTimeoutStage ? "After timeout" : triggersLabel(effStageTriggers, byKey)}) is empty — write a Template, add a Reminder, select a Start Action, or remove Stage ${stageNum}.` };
    }
    cleanStages.push({
      id: st.id,
      source: isTimeoutStage ? "previous_timeout" : "trigger",
      parentStageId: st.parentStageId ?? 0,
      triggers: effStageTriggers,
      onStartActions: cleanStartActions,
      instant: stInstant,
      reminder: stReminder,
    });
  }

  if (cleanInstant.audience === "off" && cleanReminders.length === 0 && cleanStages.length === 0) {
    return { trail: form, error: "Write a Template (Auto Message) or add at least one Reminder before saving." };
  }

  const mergedMigratedLegacy = mergeLegacyMeta([
    form.migratedLegacy,
    ...form.stages.map(st => st.migratedLegacy),
  ]);

  return {
    trail: {
      ...form,
      instant: cleanInstant,
      reminders: cleanReminders,
      stages: cleanStages,
      migratedLegacy: mergedMigratedLegacy,
    },
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
  single = false,
  onChange,
}: {
  ariaLabel: string;
  placeholder: string;
  addPlaceholder: string;
  options: ComboOption[];
  values: string[];
  single?: boolean;
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
    const width = single ? Math.min(window.innerWidth - rect.left - 12, Math.max(rect.width, 300)) : rect.width;
    setMenuStyle({
      left: rect.left,
      width,
      maxHeight,
      ...(openDown ? { top: rect.bottom + 4 } : { bottom: window.innerHeight - rect.top + 4 }),
    });
  }, [single]);

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
    if (single) {
      onChange([key]);
      setQuery("");
      setOpen(false);
      return;
    }
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
              {!single && (
                <button
                  type="button"
                  aria-label={`Remove ${name}`}
                  onClick={e => { e.stopPropagation(); onChange(values.filter(x => x !== k)); }}
                >✕</button>
              )}
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
          aria-multiselectable={!single}
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
  single = false,
  defaultOption,
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
  single?: boolean;
  defaultOption?: { key: string; label: string };
  onChange: (next: string[]) => void;
}) {
  const options = useMemo<ComboOption[]>(() => {
    const out: ComboOption[] = defaultOption ? [{ key: defaultOption.key, label: defaultOption.label, group: "Default" }] : [];
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
  }, [folders, exclude, triggerBadges, defaultOption]);

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
      single={single}
      onChange={onChange}
    />
    {showHint && <p className={s.whenHint}>{hintText}</p>}
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
  flat = false,
  hideChannel = false,
  onPreview,
  onMoveUp,
  onMoveDown,
  onChange,
  onRemove,
}: {
  title: string;
  step: MessageStep;
  showTiming: boolean;
  baseDate?: BaseDate;
  canRemove?: boolean;
  flat?: boolean;
  hideChannel?: boolean;
  boxId?: string;
  accordion?: AccordionCtrl;
  onPreview?: (req: PreviewRequest) => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onChange: (patch: Partial<MessageStep>) => void;
  onRemove?: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const effectivePos = baseDate === "trigger_date" && step.pos === "before" ? "after" : step.pos;

  function insertPlaceholder(token: string) {
    const el = ref.current;
    const start = el?.selectionStart ?? step.text.length;
    const end = el?.selectionEnd ?? step.text.length;
    const nextText = step.text.slice(0, start) + token + step.text.slice(end);
    onChange({ text: nextText });
    const caret = start + token.length;
    if (el) {
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(caret, caret);
      });
    }
  }

  return <div className={flat ? s.docFlatGroup : s.msgCard}>
    {(showTiming || canRemove || onMoveUp || onMoveDown) && (
      <div className={s.msgTitleRow}>
        <strong>{title}</strong>
        <div className={s.inlineGroup}>
          {onMoveUp && (
            <button type="button" className={s.miniBtn} onClick={onMoveUp}>↑ Move up</button>
          )}
          {onMoveDown && (
            <button type="button" className={s.miniBtn} onClick={onMoveDown}>↓ Move down</button>
          )}
          {canRemove && onRemove && (
            <button type="button" className={s.miniDangerBtn} onClick={onRemove}>Remove</button>
          )}
        </div>
      </div>
    )}

    {(showTiming || !hideChannel) && (
      <div className={showTiming && !hideChannel ? s.timingChannelRow : s.stackField}>
        {showTiming && (
          <div className={s.stackField}>
            <label className={s.stackLabel}>When to send</label>
            <div className={effectivePos !== "on" ? s.timingFields : s.stackField}>
              {effectivePos !== "on" && <>
                <NumberInput
                  className={s.numInput}
                  min={0}
                  max={step.unit === "hours" ? 720 : 365}
                  aria-label={`${title} amount`}
                  value={step.amount}
                  emptyOnBlur="zero"
                  onValueChange={n => onChange({ amount: Math.max(0, n) })}
                />
                <CapsuleSelect
                  className={s.compactSelect}
                  ariaLabel={`${title} unit`}
                  value={step.unit}
                  onChange={value => onChange({ unit: value as Unit })}
                  options={[{ value: "days", label: "days" }, { value: "hours", label: "hours" }]}
                />
              </>}
              <CapsuleSelect
                className={s.select}
                ariaLabel={`${title} position`}
                value={effectivePos}
                onChange={value => onChange({ pos: value as TimingPos })}
                options={[
                  ...(baseDate !== "trigger_date" ? [{ value: "before", label: timingPositionLabel("before", baseDate) }] : []),
                  { value: "on", label: timingPositionLabel("on", baseDate) },
                  { value: "after", label: timingPositionLabel("after", baseDate) },
                ]}
              />
            </div>
          </div>
        )}

        {!hideChannel && (
          <div className={s.stackField}>
            <label className={s.stackLabel}>Channel</label>
            <CapsuleSelect
              className={s.select}
              ariaLabel={`${title} channel`}
              value={step.channel}
              onChange={value => onChange({ channel: value as Channel })}
              options={[
                { value: "whatsapp", label: "WhatsApp only" },
                { value: "email", label: "Email only" },
                { value: "both", label: "Both (WhatsApp + Email)" },
              ]}
            />
          </div>
        )}
      </div>
    )}

    <div className={s.stackField}>
      <label className={s.stackLabel}>Email subject</label>
      <input
        type="text"
        className={s.textInput}
        aria-label={`${title} email subject`}
        placeholder={step.channel === "whatsapp"
          ? "Email subject (optional for WhatsApp — ready if switched to Email/Both later)"
          : "Email subject (required for Email)…"}
        maxLength={300}
        value={step.subject}
        onChange={e => onChange({ subject: e.target.value })}
      />
      {step.channel !== "whatsapp" && !step.subject.trim() && (
        <span className={s.subjectWarn}>Add an Email subject to send via Email.</span>
      )}
    </div>

    <div className={s.stackField}>
      <div className={s.msgTop}>
        <label className={s.stackLabel}>Message text</label>
        <div className={s.toolbarRow}>
          <div className={s.formatBtns} role="toolbar" aria-label="Text formatting">
            <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => applyFormat(ref.current, step.text, "bold", text => onChange({ text }))}><strong>B</strong></button>
            <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => applyFormat(ref.current, step.text, "italic", text => onChange({ text }))}><em>I</em></button>
            <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => applyFormat(ref.current, step.text, "list", text => onChange({ text }))}>• List</button>
          </div>
          {onPreview && (
            <button
              type="button"
              className={s.miniBtn}
              onClick={() => onPreview({
                title,
                channel: step.channel,
                subject: step.subject,
                text: step.text,
              })}
            >
              Preview
            </button>
          )}
        </div>
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

      <div className={s.varPillList}>
        <span className={s.stackHint}>Insert variable:</span>
        {PLACEHOLDERS.map(ph => (
          <button
            key={ph.token}
            type="button"
            className={s.varPill}
            title={ph.label}
            onMouseDown={e => e.preventDefault()}
            onClick={() => insertPlaceholder(ph.token)}
          >
            {ph.token}
          </button>
        ))}
      </div>
    </div>
  </div>;
}

function TemplateEditorBlock({
  label,
  msg,
  initialTemplateId,
  boxId,
  accordion,
  saving,
  hasUnsavedLegacy,
  syncSnapSeq = 0,
  onQuickSave,
  onChange,
}: {
  label: string;
  msg: SingleMsg;
  initialTemplateId?: string;
  boxId?: string;
  accordion?: AccordionCtrl;
  saving?: boolean;
  hasUnsavedLegacy?: boolean;
  syncSnapSeq?: number;
  onQuickSave?: (next: SingleMsg) => Promise<QuickSaveResult>;
  onChange: (next: SingleMsg) => void;
}) {
  const list = msg.templates?.length ? msg.templates : syncSingleMsg([]).templates;
  const defaultTpl = list.find(t => t.isDefault) || list[0];
  const [selectedId, setSelectedId] = useState<string>(() => (
    initialTemplateId && list.some(t => t.id === initialTemplateId) ? initialTemplateId : defaultTpl.id
  ));
  const [promptMode, setPromptMode] = useState<"" | "new" | "save_as" | "rename">("");
  const [nameInput, setNameInput] = useState("");
  const [promptError, setPromptError] = useState("");
  const [savedNotice, setSavedNotice] = useState("");
  const [quickBusy, setQuickBusy] = useState(false);
  const [savedSnap, setSavedSnap] = useState<Record<string, { channel: Channel; subject: string; text: string }>>(() =>
    Object.fromEntries(list.map(t => [t.id, { channel: t.channel, subject: t.subject, text: t.text }])),
  );

  useEffect(() => {
    if (!syncSnapSeq) return;
    setSavedSnap(Object.fromEntries(list.map(t => [t.id, { channel: t.channel, subject: t.subject, text: t.text }])));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncSnapSeq]);

  const activeTpl = list.find(t => t.id === selectedId) || defaultTpl;
  const snap = savedSnap[activeTpl.id] || { channel: activeTpl.channel, subject: activeTpl.subject, text: activeTpl.text };
  const isDirty = activeTpl.channel !== snap.channel || activeTpl.subject !== snap.subject || activeTpl.text !== snap.text;
  const canSave = isDirty || Boolean(hasUnsavedLegacy);
  const busy = Boolean(saving) || quickBusy;

  function flashSaved(labelText = "Saved ✓") {
    setSavedNotice(labelText);
    window.setTimeout(() => setSavedNotice(curr => (curr === labelText ? "" : curr)), 2400);
  }

  function patchActive(patch: Partial<Pick<TemplateItem, "channel" | "subject" | "text">>) {
    if (savedNotice) setSavedNotice("");
    if (promptError) setPromptError("");
    const nextList = list.map(t => (t.id === activeTpl.id ? { ...t, ...patch } : t));
    onChange(syncSingleMsg(nextList));
  }

  async function runQuickSave(nextMsg: SingleMsg, okLabel: string, draftLabel?: string, snapUpdate?: { id: string; channel: Channel; subject: string; text: string }) {
    if (!onQuickSave) {
      if (snapUpdate) {
        setSavedSnap(curr => ({ ...curr, [snapUpdate.id]: { channel: snapUpdate.channel, subject: snapUpdate.subject, text: snapUpdate.text } }));
      }
      flashSaved(draftLabel || okLabel);
      return;
    }
    setQuickBusy(true);
    try {
      const res = await onQuickSave(nextMsg);
      if (res.ok) {
        if (snapUpdate) {
          setSavedSnap(curr => ({ ...curr, [snapUpdate.id]: { channel: snapUpdate.channel, subject: snapUpdate.subject, text: snapUpdate.text } }));
        }
        setPromptError("");
        flashSaved(okLabel);
      } else if (draftLabel) {
        flashSaved(draftLabel);
      } else {
        setPromptError(res.message || "Could not save yet — complete required fields first.");
      }
    } finally {
      setQuickBusy(false);
    }
  }

  async function saveActiveTemplate() {
    if (!canSave || busy) return;
    const nextMsg = syncSingleMsg(list);
    onChange(nextMsg);
    await runQuickSave(nextMsg, "Saved ✓", undefined, {
      id: activeTpl.id,
      channel: activeTpl.channel,
      subject: activeTpl.subject,
      text: activeTpl.text,
    });
  }

  function openPrompt(mode: "new" | "save_as" | "rename") {
    setPromptMode(mode);
    setPromptError("");
    if (mode === "rename") setNameInput(activeTpl.name);
    else if (mode === "save_as") setNameInput(`${activeTpl.name} copy`);
    else setNameInput(`Template ${list.length + 1}`);
  }

  async function confirmPrompt() {
    const clean = nameInput.trim();
    if (!clean || busy) return;
    const duplicate = list.some(t =>
      (promptMode === "rename" ? t.id !== activeTpl.id : true)
      && t.name.trim().toLowerCase() === clean.toLowerCase(),
    );
    if (duplicate) {
      setPromptError("A template with this name already exists.");
      return;
    }
    const mode = promptMode;
    setPromptMode("");
    setNameInput("");
    setPromptError("");
    if (mode === "rename") {
      const nextMsg = syncSingleMsg(list.map(t => (t.id === activeTpl.id ? { ...t, name: clean } : t)));
      onChange(nextMsg);
      await runQuickSave(nextMsg, "Saved ✓", "Renamed in form");
    } else if (mode === "save_as") {
      const created = blankTemplate(clean, false, {
        channel: activeTpl.channel,
        subject: activeTpl.subject,
        text: activeTpl.text,
      });
      // Keep original template at its last saved snapshot so Save as new never overwrites it.
      const restored = list.map(t => (t.id === activeTpl.id ? { ...t, ...snap } : t));
      const nextMsg = syncSingleMsg([...restored, created]);
      onChange(nextMsg);
      setSavedSnap(curr => ({
        ...curr,
        [created.id]: { channel: created.channel, subject: created.subject, text: created.text },
      }));
      setSelectedId(created.id);
      await runQuickSave(nextMsg, "Saved ✓", "Added in form · Click Save changes");
    } else if (mode === "new") {
      const created = blankTemplate(clean, false, { channel: activeTpl.channel, subject: "", text: "" });
      onChange(syncSingleMsg([...list, created]));
      setSavedSnap(curr => ({
        ...curr,
        [created.id]: { channel: created.channel, subject: "", text: "" },
      }));
      setSelectedId(created.id);
    }
  }

  function setAsDefault() {
    if (busy) return;
    const nextMsg = syncSingleMsg(list.map(t => ({ ...t, isDefault: t.id === activeTpl.id })));
    onChange(nextMsg);
    void runQuickSave(nextMsg, "Saved ✓", "Default updated in form");
  }

  const { confirm, dialog: confirmDialog } = useConfirmDialog();

  async function deleteActive() {
    if (list.length <= 1 || busy) return;
    if (!(await confirm({
      title: "Delete template?",
      message: <>Delete template <strong>&ldquo;{activeTpl.name}&rdquo;</strong>? This cannot be undone.</>,
      confirmLabel: "Delete permanently",
    }))) return;
    const remaining = list.filter(t => t.id !== activeTpl.id);
    const next = syncSingleMsg(remaining);
    onChange(next);
    setSelectedId(next.templates[0].id);
    void runQuickSave(next, "Saved ✓", "Deleted in form");
  }

  const collapsible = Boolean(boxId && accordion);
  const expanded = !collapsible || accordion!.isOpen(boxId!);
  const chBrief = activeTpl.channel === "both" ? "Email + WhatsApp" : activeTpl.channel === "email" ? "Email" : "WhatsApp";
  const tplCountBrief = list.length > 1 ? `${list.length} templates · ${activeTpl.name}` : activeTpl.name;
  const textSnippet = activeTpl.text.trim() ? activeTpl.text.trim().replace(/\s+/g, " ") : "Not written yet";

  const bodyContent = (
    <div className={s.docMsgItem}>
      <div className={s.docFlatGroup}>
        <div className={s.gridTemplateChannel}>
          <div className={s.stackField}>
            <label className={s.stackLabel}>Saved template</label>
            <CapsuleSelect
              className={s.select}
              ariaLabel={`${label} template`}
              value={activeTpl.id}
              onChange={value => { setSelectedId(value); setPromptMode(""); setPromptError(""); setSavedNotice(""); }}
              options={list.map(t => ({ value: t.id, label: `${t.name}${t.isDefault ? " ★ Default" : ""}` }))}
            />
            <span className={s.stackHint}>Automatic sending always uses the ★ Default template</span>
          </div>

          <div className={s.stackField}>
            <label className={s.stackLabel}>Channel</label>
            <CapsuleSelect
              className={s.select}
              ariaLabel={`${label} channel`}
              value={activeTpl.channel}
              onChange={value => patchActive({ channel: value as Channel })}
              options={[
                { value: "whatsapp", label: "WhatsApp only" },
                { value: "email", label: "Email only" },
                { value: "both", label: "Both (WhatsApp + Email)" },
              ]}
            />
          </div>
        </div>
        <div className={s.tplActions}>
          <button
            type="button"
            className={canSave ? s.miniPrimaryBtn : s.miniBtn}
            disabled={!canSave || busy}
            onClick={() => { void saveActiveTemplate(); }}
          >
            {quickBusy ? "Saving…" : "Save"}
          </button>
          <button type="button" className={s.miniBtn} disabled={busy} onClick={() => openPrompt("save_as")}>Save as new</button>
          <button type="button" className={s.miniBtn} disabled={busy} onClick={() => openPrompt("new")}>+ New</button>
          {!activeTpl.isDefault && (
            <button type="button" className={s.miniBtn} disabled={busy} onClick={setAsDefault}>Set Default</button>
          )}
          <button type="button" className={s.miniBtn} disabled={busy} onClick={() => openPrompt("rename")}>Rename</button>
          {list.length > 1 && (
            <button type="button" className={s.miniDangerBtn} disabled={busy} onClick={() => void deleteActive()}>Delete</button>
          )}
          {savedNotice && <span className={s.tplSavedTag}>{savedNotice}</span>}
          {confirmDialog}
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
              onChange={e => { setNameInput(e.target.value); if (promptError) setPromptError(""); }}
              onKeyDown={e => {
                if (e.key === "Enter") { e.preventDefault(); void confirmPrompt(); }
                if (e.key === "Escape") { e.preventDefault(); setPromptMode(""); setPromptError(""); }
              }}
            />
            <button type="button" className={s.miniBtn} disabled={!nameInput.trim() || busy} onClick={() => { void confirmPrompt(); }}>Save</button>
            <button type="button" className={s.miniBtn} onClick={() => { setPromptMode(""); setPromptError(""); }}>Cancel</button>
          </div>
        )}
        {promptError && <span className={s.tplErrText}>{promptError}</span>}
      </div>

      <MessageEditor
        title={`${label} — ${activeTpl.name}`}
        step={{ amount: 0, unit: "days", pos: "after", channel: activeTpl.channel, subject: activeTpl.subject, text: activeTpl.text }}
        showTiming={false}
        hideChannel={true}
        flat={true}
        onPreview={accordion?.openPreview}
        onChange={patch => patchActive(patch)}
      />
    </div>
  );

  return (
    <div className={s.docBox}>
      <div className={s.blockHead}>
        <span className={s.audienceBadge}>{label}</span>
        <span className={s.cardSub}>
          {list.length > 1
            ? `${list.length} templates · Auto sends ★ Default`
            : "Sent immediately · Auto sends ★ Default"}
        </span>
      </div>
      {bodyContent}
    </div>
  );
}

function InstantAutoMsgBlock({
  state,
  stagePrefix = "s0",
  accordion,
  adminActionControl,
  userActionControl,
  focusAudience,
  focusTemplateId,
  saving,
  hasUnsavedLegacy,
  syncSnapSeq = 0,
  onQuickSaveAudience,
  onChangeAdminControl,
  onChangeUserControl,
  onChange,
}: {
  state: InstantBlockState;
  stagePrefix?: string;
  accordion?: AccordionCtrl;
  adminActionControl?: "auto" | "review" | "off";
  userActionControl?: "auto" | "review" | "off";
  focusAudience?: "client" | "admin";
  focusTemplateId?: string;
  saving?: boolean;
  hasUnsavedLegacy?: boolean;
  syncSnapSeq?: number;
  onQuickSaveAudience?: (who: "client" | "admin", next: SingleMsg) => Promise<QuickSaveResult>;
  onChangeAdminControl?: (next: "auto" | "review" | "off") => void;
  onChangeUserControl?: (next: "auto" | "review" | "off") => void;
  onChange: (next: InstantBlockState) => void;
}) {
  const showClient = state.audience === "client" || state.audience === "both";
  const showAdmin = state.audience === "admin" || state.audience === "both";

  return (
    <div style={{ display: "grid", gap: "10px" }} data-outline-section={`${stagePrefix}-instant`}>
      <div className={s.blockHead}>
        <div className={s.blockTitle}>
          <span className={s.stageBadge}>Instant auto message</span>
        </div>
        <div className={s.inlineGroup}>
          <CapsuleSelect
            className={s.compactSelect}
            ariaLabel="Instant message audience"
            value={state.audience}
            onChange={value => {
              const nextAud = value as InstantAudience;
              onChange({ ...state, audience: nextAud });
              if (accordion) {
                if (nextAud === "admin") accordion.openOnly(`${stagePrefix}-tpl-admin`);
                else if (nextAud === "client") accordion.openOnly(`${stagePrefix}-tpl-client`);
                else if (nextAud === "both" && state.audience === "off") accordion.openOnly(`${stagePrefix}-tpl-client`);
              }
            }}
            options={[
              { value: "off", label: "Off (Don't send instant message)" },
              { value: "client", label: "Client only" },
              { value: "admin", label: "Admin / Team only" },
              { value: "both", label: "Both (Client & Admin)" },
            ]}
          />
        </div>
      </div>

      {onChangeAdminControl && onChangeUserControl && state.audience !== "off" && (
        <div className={s.grid2}>
          <div className={s.stackField}>
            <label className={s.stackLabel}>When Admin does it</label>
            <CapsuleSelect
              className={s.select}
              ariaLabel="When Admin performs this trigger"
              value={adminActionControl || "auto"}
              onChange={value => onChangeAdminControl(value as "auto" | "review" | "off")}
              options={[
                { value: "auto", label: "Auto (send immediately)" },
                { value: "review", label: "Review popup" },
                { value: "off", label: "Off" },
              ]}
            />
          </div>
          <div className={s.stackField}>
            <label className={s.stackLabel}>When User / Client does it</label>
            <CapsuleSelect
              className={s.select}
              ariaLabel="When User or Client performs this trigger"
              value={userActionControl || "auto"}
              onChange={value => onChangeUserControl(value as "auto" | "review" | "off")}
              options={[
                { value: "auto", label: "Auto (send immediately)" },
                { value: "review", label: "Hold in Review & delivery" },
                { value: "off", label: "Off" },
              ]}
            />
          </div>
        </div>
      )}

      {state.audience === "off" && (
        <span className={s.cardSub}>Instant auto message is off for this stage.</span>
      )}

      {showClient && (
        <div data-outline-section={`${stagePrefix}-tpl-client`}>
          <TemplateEditorBlock
            label="Client instant message"
            msg={state.client}
            initialTemplateId={focusAudience === "client" ? focusTemplateId : undefined}
            boxId={`${stagePrefix}-tpl-client`}
            accordion={accordion}
            saving={saving}
            hasUnsavedLegacy={hasUnsavedLegacy}
            syncSnapSeq={syncSnapSeq}
            onQuickSave={onQuickSaveAudience ? next => onQuickSaveAudience("client", next) : undefined}
            onChange={client => onChange({ ...state, client })}
          />
        </div>
      )}

      {showClient && showAdmin && <div className={s.subDivider} role="separator" />}

      {showAdmin && (
        <div data-outline-section={`${stagePrefix}-tpl-admin`}>
          <TemplateEditorBlock
            label="Admin / Team instant message"
            msg={state.admin}
            initialTemplateId={focusAudience === "admin" ? focusTemplateId : undefined}
            boxId={`${stagePrefix}-tpl-admin`}
            accordion={accordion}
            saving={saving}
            hasUnsavedLegacy={hasUnsavedLegacy}
            syncSnapSeq={syncSnapSeq}
            onQuickSave={onQuickSaveAudience ? next => onQuickSaveAudience("admin", next) : undefined}
            onChange={admin => onChange({ ...state, admin })}
          />
        </div>
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
  boxPrefix,
  accordion,
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
  boxPrefix?: string;
  accordion?: AccordionCtrl;
  onModeChange: (mode: MessageMode) => void;
  onCopyClient?: () => void;
  onUpdateSteps: (next: MessageStep[]) => void;
}) {
  const universal = who === "admin" && mode === "universal";
  const adminSyncsClient = who === "admin" && Boolean(canCopyClient) && universal;
  const primaryStep = steps[0] || blankStep(baseDate === "trigger_date" ? "after" : "before", 3);

  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const pendingFlipRef = useRef<{ oldTops: number[]; fromIdx: number; toIdx: number } | null>(null);
  const moveTimerRef = useRef<number | null>(null);
  const displacedTimerRef = useRef<number | null>(null);
  const [moveAnim, setMoveAnim] = useState<{ movedIdx: number; displacedIdx: number | null } | null>(null);

  useEffect(() => () => {
    if (moveTimerRef.current !== null) window.clearTimeout(moveTimerRef.current);
    if (displacedTimerRef.current !== null) window.clearTimeout(displacedTimerRef.current);
  }, []);

  useLayoutEffect(() => {
    const flip = pendingFlipRef.current;
    if (!flip) return;
    pendingFlipRef.current = null;

    const reducedMotion = typeof window !== "undefined"
      && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const { oldTops, fromIdx, toIdx } = flip;
    const elTo = itemRefs.current[toIdx];
    const elFrom = itemRefs.current[fromIdx];
    const targets: Array<{ el: HTMLDivElement; oldTop: number; scale: number; zIndex: string }> = [];
    if (elTo && oldTops[fromIdx] !== undefined) targets.push({ el: elTo, oldTop: oldTops[fromIdx], scale: 1.01, zIndex: "2" });
    if (elFrom && oldTops[toIdx] !== undefined) targets.push({ el: elFrom, oldTop: oldTops[toIdx], scale: 0.985, zIndex: "1" });

    if (!reducedMotion && targets.length > 0) {
      for (const { el, oldTop, scale, zIndex } of targets) {
        const newTop = el.getBoundingClientRect().top;
        const deltaY = oldTop - newTop;
        el.style.position = "relative";
        el.style.zIndex = zIndex;
        if (Math.abs(deltaY) > 1) {
          el.style.transition = "none";
          el.style.transform = `translateY(${deltaY}px) scale(${scale})`;
        }
      }
      // Force reflow so the inverted transform commits before transitioning
      void elTo?.offsetHeight;
      void elFrom?.offsetHeight;
      for (const { el } of targets) {
        el.style.transition = "transform 360ms cubic-bezier(0.22, 1, 0.36, 1)";
        el.style.transform = "";
      }
    }

    if (displacedTimerRef.current !== null) window.clearTimeout(displacedTimerRef.current);
    displacedTimerRef.current = window.setTimeout(() => {
      for (const { el } of targets) {
        el.style.transition = "";
        el.style.transform = "";
        el.style.zIndex = "";
        el.style.position = "";
      }
      setMoveAnim(prev => (prev ? { ...prev, displacedIdx: null } : null));
      if (elTo) {
        const rect = elTo.getBoundingClientRect();
        if (rect.top < 0 || rect.bottom > window.innerHeight) {
          elTo.scrollIntoView({ block: "nearest", behavior: reducedMotion ? "auto" : "smooth" });
        }
      }
    }, reducedMotion ? 0 : 380);
  }, [steps]);

  function moveStep(idx: number, dir: -1 | 1) {
    const nextIdx = idx + dir;
    if (nextIdx < 0 || nextIdx >= steps.length) return;
    const oldTops = steps.map((_, i) => itemRefs.current[i]?.getBoundingClientRect().top ?? 0);
    pendingFlipRef.current = { oldTops, fromIdx: idx, toIdx: nextIdx };
    setMoveAnim({ movedIdx: nextIdx, displacedIdx: idx });
    if (moveTimerRef.current !== null) window.clearTimeout(moveTimerRef.current);
    moveTimerRef.current = window.setTimeout(() => setMoveAnim(null), 900);
    const next = [...steps];
    const [moved] = next.splice(idx, 1);
    next.splice(nextIdx, 0, moved);
    onUpdateSteps(next);
  }

  return (
    <div className={s.docBox}>
      <div className={s.blockHead}>
        {!hideHeaderTitle ? <span className={s.audienceBadge}>{title}</span> : <span />}
        {who === "admin" && (
          <div className={s.inlineGroup}>
            {canCopyClient && mode === "separate" && onCopyClient && (
              <button type="button" className={s.miniBtn} onClick={onCopyClient}>Copy client&apos;s days</button>
            )}
            <CapsuleSelect
              className={s.compactSelect}
              ariaLabel={`${title} message style`}
              value={mode}
              onChange={value => onModeChange(value as MessageMode)}
              options={[
                { value: "separate", label: "Separate message per timing" },
                { value: "universal", label: canCopyClient ? "1 universal message (same days as Client)" : "1 universal message (all timings)" },
              ]}
            />
          </div>
        )}
      </div>

      {universal && !adminSyncsClient && (
        <div className={s.timingList}>
          <span className={s.miniLabel}>Timings (shared by this message)</span>
          {steps.map((slot, idx) => (
            <div key={idx} className={s.timingRow}>
              <span className={s.timingNum}>#{idx + 1}</span>
              {slot.pos !== "on" && <>
                <NumberInput
                  className={s.numInput}
                  min={0}
                  max={slot.unit === "hours" ? 720 : 365}
                  value={slot.amount}
                  emptyOnBlur="zero"
                  onValueChange={n => onUpdateSteps(steps.map((st, i) => i === idx ? { ...st, amount: Math.max(0, n) } : st))}
                />
                <CapsuleSelect
                  className={s.compactSelect}
                  ariaLabel="Timing unit"
                  value={slot.unit}
                  onChange={value => onUpdateSteps(steps.map((st, i) => i === idx ? { ...st, unit: value as Unit } : st))}
                  options={[{ value: "days", label: "days" }, { value: "hours", label: "hours" }]}
                />
              </>}
              <CapsuleSelect
                className={s.compactSelect}
                ariaLabel="Timing position"
                value={baseDate === "trigger_date" && slot.pos === "before" ? "after" : slot.pos}
                onChange={value => onUpdateSteps(steps.map((st, i) => i === idx ? { ...st, pos: value as TimingPos } : st))}
                options={[
                  ...(baseDate !== "trigger_date" ? [{ value: "before", label: timingPositionLabel("before", baseDate) }] : []),
                  { value: "on", label: timingPositionLabel("on", baseDate) },
                  { value: "after", label: timingPositionLabel("after", baseDate) },
                ]}
              />
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
        <>
          <div className={s.docDivider} role="separator" />
          <MessageEditor
            title="Universal Admin message"
            step={primaryStep}
            showTiming={false}
            flat={true}
            onPreview={accordion?.openPreview}
            onChange={patch => onUpdateSteps(steps.map(st => ({ ...st, channel: patch.channel ?? st.channel, subject: patch.subject ?? st.subject, text: patch.text ?? st.text })))}
          />
        </>
      ) : (
        <div className={s.docFlatGroup}>
          <div className={s.docDivider} role="separator" />
          {steps.map((step, idx) => (
            <div
              key={idx}
              ref={el => { itemRefs.current[idx] = el; }}
              className={s.docMsgItem}
              data-just-moved={moveAnim?.movedIdx === idx ? "true" : undefined}
              data-just-displaced={moveAnim?.displacedIdx === idx ? "true" : undefined}
            >
              <MessageEditor
                title={`Message #${idx + 1}`}
                step={step}
                showTiming={true}
                baseDate={baseDate}
                canRemove={steps.length > 1}
                flat={true}
                onPreview={accordion?.openPreview}
                onMoveUp={idx > 0 ? () => moveStep(idx, -1) : undefined}
                onMoveDown={idx < steps.length - 1 ? () => moveStep(idx, 1) : undefined}
                onChange={patch => onUpdateSteps(steps.map((st, i) => i === idx ? { ...st, ...patch } : st))}
                onRemove={() => onUpdateSteps(steps.filter((_, i) => i !== idx))}
              />
            </div>
          ))}
          {steps.length < 10 && (
            <button
              type="button"
              className={s.subtleAdd}
              onClick={() => onUpdateSteps([...steps, blankStep("after", 2)])}
            >
              + Add follow-up message
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function ActionControlField({
  ctrl,
  value,
  onChange,
}: {
  ctrl: SystemActionControlDef;
  value: string | number | boolean | undefined;
  onChange: (next: string | number | boolean) => void;
}) {
  if (ctrl.type === "boolean") {
    return (
      <label className={s.actionCheckLabel}>
        <input
          type="checkbox"
          checked={value !== undefined ? Boolean(value) : Boolean(ctrl.defaultVal)}
          onChange={e => onChange(e.target.checked)}
        />
        <span>{ctrl.label}</span>
      </label>
    );
  }
  if (ctrl.type === "select") {
    const val = typeof value === "string" ? value : String(ctrl.defaultVal ?? "");
    return (
      <div className={s.stackField}>
        <label className={s.stackLabel}>{ctrl.label}</label>
        <CapsuleSelect className={s.select} ariaLabel={ctrl.label} value={val} onChange={onChange} options={(ctrl.options || []).map(opt => ({ value: opt.value, label: opt.label }))} />
      </div>
    );
  }
  if (ctrl.type === "number") {
    const numVal = typeof value === "number" && Number.isFinite(value) ? value : Number(ctrl.defaultVal ?? 1);
    return (
      <div className={s.stackField}>
        <label className={s.stackLabel}>{ctrl.label}{ctrl.unit ? ` (${ctrl.unit})` : ""}</label>
        <NumberInput
          className={s.numInput}
          min={ctrl.min ?? 0}
          max={ctrl.max ?? 365}
          value={numVal}
          emptyOnBlur="revert"
          onValueChange={n => onChange(n)}
        />
      </div>
    );
  }
  const strVal = typeof value === "string" ? value : String(ctrl.defaultVal ?? "");
  return (
    <div className={s.stackField}>
      <label className={s.stackLabel}>{ctrl.label}</label>
      <input
        type="text"
        className={s.input}
        maxLength={ctrl.maxLength ?? 300}
        placeholder={ctrl.placeholder || ""}
        value={strVal}
        onChange={e => onChange(e.target.value)}
      />
    </div>
  );
}

function SystemActionsEditor({
  actions,
  availableActions,
  onChange,
  emptyLabel = "+ Select system action…",
}: {
  actions: SystemActionItem[];
  availableActions: SystemActionCatalogItem[];
  onChange: (next: SystemActionItem[]) => void;
  emptyLabel?: string;
}) {
  const byActionKey = useMemo(() => new Map(availableActions.map(a => [a.key, a])), [availableActions]);
  const selectedKeys = useMemo(() => new Set(actions.map(a => a.key)), [actions]);
  const pickable = useMemo(() => availableActions.filter(a => !selectedKeys.has(a.key)), [availableActions, selectedKeys]);

  function addAction(key: string) {
    if (!key) return;
    const def = byActionKey.get(key);
    if (!def) return;
    onChange([...actions, { key, config: defaultConfigForAction(def) }]);
  }

  function updateActionConfig(idx: number, ctrlKey: string, val: string | number | boolean) {
    onChange(actions.map((item, i) => (
      i === idx ? { ...item, config: { ...item.config, [ctrlKey]: val } } : item
    )));
  }

  function removeAction(idx: number) {
    onChange(actions.filter((_, i) => i !== idx));
  }

  const groupedPickable = useMemo(() => {
    const map = new Map<string, SystemActionCatalogItem[]>();
    for (const item of pickable) {
      const list = map.get(item.group) || [];
      list.push(item);
      map.set(item.group, list);
    }
    return [...map.entries()];
  }, [pickable]);

  return (
    <div className={s.actionList}>
      {actions.map((item, idx) => {
        const def = byActionKey.get(item.key);
        return (
          <div key={`${item.key}-${idx}`} className={s.actionItemCard}>
            <div className={s.actionItemHead}>
              <span className={s.actionItemTitle}>{def?.label || item.key}</span>
              <button type="button" className={s.miniDangerBtn} onClick={() => removeAction(idx)}>
                Remove
              </button>
            </div>
            {def?.description && <span className={s.stackHint}>{def.description}</span>}
            {def && def.controls.length > 0 && (
              <div className={s.actionControlsGrid}>
                {def.controls.map(ctrl => (
                  <ActionControlField
                    key={ctrl.key}
                    ctrl={ctrl}
                    value={item.config[ctrl.key]}
                    onChange={val => updateActionConfig(idx, ctrl.key, val)}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
      {pickable.length > 0 && actions.length < 5 && (
        <CapsuleSelect
          className={s.select}
          ariaLabel="Add system action"
          value=""
          onChange={addAction}
          options={[
            { value: "", label: emptyLabel },
            ...groupedPickable.flatMap(([group, items]) => items.map(a => ({ value: a.key, label: `${group} · ${a.label}` }))),
          ]}
        />
      )}
    </div>
  );
}

function ReminderCard({
  index,
  depth,
  stagePrefix = "s0",
  stageId = 0,
  accordion,
  reminder,
  stageTriggers,
  stageTriggersLabel,
  folders,
  byKey,
  catalogConditions = [],
  catalogActions = [],
  triggerBadges,
  existingTrails,
  currentTrailId,
  currentStages,
  onCreateTimeoutStage,
  onChange,
  onRemove,
}: {
  index: number;
  depth: number;
  stagePrefix?: string;
  stageId?: number;
  accordion?: AccordionCtrl;
  reminder: Reminder;
  stageTriggers: string[];
  stageTriggersLabel: string;
  folders: WorkFolder[];
  byKey: Map<string, WorkItem>;
  catalogConditions?: ConditionCatalogItem[];
  catalogActions?: SystemActionCatalogItem[];
  triggerBadges?: Map<string, TriggerBadgeInfo>;
  existingTrails?: TrailForm[];
  currentTrailId?: string;
  currentStages?: TrailStage[];
  onCreateTimeoutStage?: (parentStageId: number, parentTriggers: string[], parentStopOn: string[]) => number;
  onChange: (reminder: Reminder) => void;
  onRemove: () => void;
}) {
  const set = (patch: Partial<Reminder>) => onChange({ ...reminder, ...patch });

  const effectiveTriggers = reminder.startTrigger !== "__main__" ? [reminder.startTrigger] : stageTriggers;
  const effectiveWorks = effectiveTriggers.map(k => byKey.get(k));
  const liveReminderConds = useMemo(
    () => getApplicableConditions(effectiveWorks, catalogConditions, "reminder"),
    [effectiveWorks, catalogConditions],
  );
  const liveEscalationActions = useMemo(
    () => getApplicableSystemActions(effectiveWorks, catalogActions, "escalation"),
    [effectiveWorks, catalogActions],
  );
  const allowedConds = liveReminderConds.map(c => c.key);
  const visibleConditions = liveReminderConds.map(c => ({ id: c.key, label: c.label, valueConfig: c.valueConfig }));
  const safeCondition = allowedConds.includes(reminder.condition) ? reminder.condition : "any";
  const conditionDef = visibleConditions.find(item => item.id === safeCondition);

  const visibleBaseDates = useMemo(
    () => getApplicableBaseDates(effectiveWorks),
    [effectiveWorks],
  );
  const safeBaseDate: BaseDate = visibleBaseDates.some(d => d.id === reminder.countDaysFrom)
    ? reminder.countDaysFrom
    : (visibleBaseDates[0]?.id || "trigger_date");
  const isDueAnchored = safeBaseDate !== "trigger_date";
  const dueTargetLabel = safeBaseDate === "grace_end_date"
    ? "grace end date"
    : safeBaseDate === "expiry_date"
      ? "expiry date"
      : safeBaseDate === "deadline_date"
        ? "project deadline"
        : "due date";
  const timeoutCfg: TimeoutConfig = reminder.onTimeout || defaultTimeoutConfig(isDueAnchored ? 0 : (reminder.repeatForDays || 5));
  const setTimeoutCfg = (patch: Partial<TimeoutConfig>) => set({ onTimeout: { ...timeoutCfg, ...patch } });
  const hasStageContinueAction = timeoutCfg.actions.some(a => a.key === "stage.continue");
  const timeoutStages = (currentStages || []).filter(st => st.source === "previous_timeout" && st.id !== stageId);

  const showClient = reminder.audience === "client" || reminder.audience === "both";
  const showAdmin = reminder.audience === "admin" || reminder.audience === "both";

  const msgCount = (showClient ? reminder.clientSteps.length : 0) + (showAdmin ? reminder.adminSteps.length : 0);
  const repeatSummary = reminder.repeatMode === "permanent"
    ? "Repeat: Permanent"
    : reminder.repeatMode === "until_due"
      ? `Repeat: Until ${dueTargetLabel}`
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
    const targetWorks = targetKeys.map(k => byKey.get(k));
    const liveNext = getApplicableConditions(targetWorks, catalogConditions, "reminder");
    const nextAllowed = liveNext.map(c => c.key);
    const nextBaseDates = getApplicableBaseDates(targetWorks);
    const nextBase: BaseDate = nextBaseDates.some(d => d.id === reminder.countDaysFrom)
      ? reminder.countDaysFrom
      : (nextBaseDates[0]?.id || "trigger_date");
    const fixPos = (st: MessageStep): MessageStep => (nextBase === "trigger_date" && st.pos === "before" ? { ...st, pos: "after" } : st);
    set({
      startTrigger: nextStart,
      countDaysFrom: nextBase,
      repeatMode: nextBase === "trigger_date" && reminder.repeatMode === "until_due" ? "off" : reminder.repeatMode,
      clientSteps: reminder.clientSteps.map(fixPos),
      adminSteps: reminder.adminSteps.map(fixPos),
      condition: nextAllowed.includes(reminder.condition) ? reminder.condition : "any",
      stopOn: reminder.stopOn.filter(k => !targetKeys.includes(k)),
    });
  }

  function handleBaseDateChange(nextBase: BaseDate) {
    if (nextBase === "trigger_date") {
      const fixPos = (st: MessageStep): MessageStep => (st.pos === "before" ? { ...st, pos: "after" } : st);
      set({
        countDaysFrom: nextBase,
        repeatMode: reminder.repeatMode === "until_due" ? "off" : reminder.repeatMode,
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
      {/* 1. Start trigger + Send to + Count days from (3-column compact header row) */}
      <div className={s.grid3}>
        <div className={s.field}>
          <label className={s.labelRow}><span>Start when</span></label>
          <MultiTriggerSelect
            single
            ariaLabel="Start reminder trigger"
            emptyPlaceholder="Search & select trigger…"
            addPlaceholder="Change trigger…"
            values={[reminder.startTrigger || "__main__"]}
            folders={folders}
            byKey={byKey}
            defaultOption={{ key: "__main__", label: `Same as stage trigger (${stageTriggersLabel || "selected trigger"})` }}
            onChange={next => handleStartTriggerChange(next[0] || "__main__")}
          />
        </div>

        <div className={s.field}>
          <label className={s.labelRow}><span>Send to</span></label>
          <CapsuleSelect
            className={s.select}
            ariaLabel="Reminder audience"
            value={reminder.audience}
            onChange={value => {
              const nextAud = value as ReminderAudience;
              set({ audience: nextAud });
              if (accordion) {
                if (nextAud === "admin") {
                  accordion.openOnly(`${stagePrefix}-r${reminder.id}-admin-${reminder.adminMode === "universal" ? "u" : "0"}`);
                } else if (nextAud === "client") {
                  accordion.openOnly(`${stagePrefix}-r${reminder.id}-client-${reminder.clientMode === "universal" ? "u" : "0"}`);
                } else if (nextAud === "both" && reminder.audience === "client") {
                  accordion.openOnly(`${stagePrefix}-r${reminder.id}-admin-${reminder.adminMode === "universal" ? "u" : "0"}`);
                } else if (nextAud === "both" && reminder.audience === "admin") {
                  accordion.openOnly(`${stagePrefix}-r${reminder.id}-client-${reminder.clientMode === "universal" ? "u" : "0"}`);
                }
              }
            }}
            options={[
              { value: "client", label: "Client only" },
              { value: "admin", label: "Admin / Team only" },
              { value: "both", label: "Both (Client & Admin)" },
            ]}
          />
        </div>

        <div className={s.field}>
          <label className={s.labelRow}><span>Count days from</span></label>
          <CapsuleSelect
            className={s.select}
            ariaLabel="Count days from"
            disabled={visibleBaseDates.length <= 1}
            value={safeBaseDate}
            onChange={value => handleBaseDateChange(value as BaseDate)}
            options={visibleBaseDates.map(item => ({ value: item.id, label: item.label }))}
          />
        </div>
      </div>

      {/* 2. Client messages first, then Admin / Team messages */}
      {showClient && (
        <div data-outline-section={`${stagePrefix}-rem-client`}>
          <AudienceBlock
            who="client"
            title="Client messages"
            mode={reminder.clientMode}
            steps={reminder.clientSteps}
            baseDate={safeBaseDate}
            boxPrefix={`${stagePrefix}-r${reminder.id}-client`}
            accordion={accordion}
            onModeChange={clientMode => {
              set({ clientMode });
              if (accordion) {
                accordion.openOnly(`${stagePrefix}-r${reminder.id}-client-${clientMode === "universal" ? "u" : "0"}`);
              }
            }}
            onUpdateSteps={clientSteps => set({ clientSteps })}
          />
        </div>
      )}
      {showClient && showAdmin && <div className={s.subDivider} role="separator" />}
      {showAdmin && (
        <div data-outline-section={`${stagePrefix}-rem-admin`}>
          <AudienceBlock
            who="admin"
            title="Admin / Team messages"
            mode={reminder.adminMode}
            steps={reminder.adminSteps}
            baseDate={safeBaseDate}
            canCopyClient={showClient}
            boxPrefix={`${stagePrefix}-r${reminder.id}-admin`}
            accordion={accordion}
            onModeChange={adminMode => {
              set({ adminMode });
              if (accordion) {
                accordion.openOnly(`${stagePrefix}-r${reminder.id}-admin-${adminMode === "universal" ? "u" : "0"}`);
              }
            }}
            onCopyClient={copyClientDays}
            onUpdateSteps={adminSteps => set({ adminSteps })}
          />
        </div>
      )}

      {/* 3. Send only if (live SSOT trigger-specific condition — auto-hidden when only Always) + Repeat + Stop + Escalation */}
      <div className={s.grid2}>
        {visibleConditions.length > 1 && (
        <div className={`${s.field} ${s.fieldFull}`}>
          <label className={s.labelRow}><span>Send only if</span></label>
          <div className={s.inlineRow}>
            <CapsuleSelect
              className={s.select}
              ariaLabel="Send only if condition"
              value={safeCondition}
              onChange={nextIdVal => {
                const found = visibleConditions.find(c => c.id === nextIdVal);
                set({
                  condition: nextIdVal,
                  conditionValue: found?.valueConfig ? found.valueConfig.defaultVal : reminder.conditionValue,
                });
              }}
              options={visibleConditions.map(item => ({ value: item.id, label: item.label }))}
            />
            {conditionDef?.valueConfig && (
              <NumberInput
                className={s.numInput}
                min={conditionDef.valueConfig.min}
                max={conditionDef.valueConfig.max}
                aria-label="Condition value"
                value={reminder.conditionValue}
                emptyOnBlur="zero"
                onValueChange={n => set({ conditionValue: Math.max(0, n) })}
              />
            )}
          </div>
        </div>
        )}

        <div className={`${s.stackField} ${s.fieldFull}`}>
          <div className={s.gridRepeat}>
            <div className={s.stackField}>
              <label className={s.stackLabel}>Repeat mode</label>
              <CapsuleSelect
                className={s.select}
                ariaLabel="Repeat mode"
                value={reminder.repeatMode}
                onChange={value => {
                  const nextMode = value as RepeatMode;
                  set({
                    repeatMode: nextMode,
                    ...(nextMode === "permanent" && timeoutCfg.enabled ? { onTimeout: { ...timeoutCfg, enabled: false } } : {}),
                  });
                }}
                options={[
                  { value: "off", label: "Off (No repeat — scheduled only)" },
                  ...(isDueAnchored ? [{ value: "until_due", label: `Until ${dueTargetLabel}` }] : []),
                  { value: "permanent", label: "Permanent (until stop trigger)" },
                  { value: "limited", label: "Fixed days limit" },
                ]}
              />
            </div>
            {reminder.repeatMode === "limited" && (
              <div className={s.stackField}>
                <label className={s.stackLabel}>For (days)</label>
                <NumberInput
                  className={s.numInput}
                  min={1}
                  max={180}
                  aria-label="Repeat for days"
                  value={reminder.repeatForDays}
                  emptyOnBlur="revert"
                  onValueChange={n => set({ repeatForDays: Math.max(1, n) })}
                />
              </div>
            )}
            {reminder.repeatMode !== "off" && (
              <>
                <div className={s.stackField}>
                  <label className={s.stackLabel}>Every (days)</label>
                  <NumberInput
                    className={s.numInput}
                    min={1}
                    max={90}
                    aria-label="Repeat every days"
                    value={reminder.repeatEveryDays}
                    emptyOnBlur="revert"
                    onValueChange={n => set({ repeatEveryDays: Math.max(1, n) })}
                  />
                </div>
                <div className={s.stackField}>
                  <label className={s.stackLabel}>Per day</label>
                  <CapsuleSelect
                    className={s.select}
                    ariaLabel="Per day frequency"
                    value={String(reminder.repeatPerDay)}
                    onChange={value => set({ repeatPerDay: Number(value || 1) })}
                    options={[
                      { value: "1", label: "1x / day" },
                      { value: "2", label: "2x / day (every 12h)" },
                      { value: "3", label: "3x / day (every 8h)" },
                      { value: "4", label: "4x / day (every 6h)" },
                    ]}
                  />
                </div>
              </>
            )}
          </div>
        </div>

        {/* 4. Stop triggers (searchable multi-select SSOT) */}
        <div className={`${s.stackField} ${s.fieldFull}`}>
          <label className={s.stackLabel}>Stop when</label>
          <MultiTriggerSelect
            ariaLabel="Add stop trigger"
            emptyPlaceholder="Search & select stop triggers…"
            addPlaceholder="Add another stop trigger…"
            values={reminder.stopOn}
            exclude={effectiveTriggers}
            folders={folders}
            byKey={byKey}
            triggerBadges={triggerBadges}
            onChange={stopOn => set({ stopOn })}
          />
          <span className={s.stackHint}>Reminders stop immediately when any selected work happens</span>
          {(() => {
            const cov = describeTriggerCoverage(
              reminder.stopOn,
              existingTrails || [],
              currentTrailId,
              currentStages || [],
              byKey,
            );
            if (!cov.length) return null;
            return (
              <div className={s.stopNotes}>
                {cov.map(info => {
                  const parts: string[] = [];
                  if (info.activeTemplates > 0) parts.push(`${info.activeTemplates} active template${info.activeTemplates === 1 ? "" : "s"}`);
                  if (info.activeReminders > 0) parts.push(`${info.activeReminders} active reminder${info.activeReminders === 1 ? "" : "s"}`);
                  if (info.activeCount > 0) {
                    const scopeNote = info.scopeLabels.length ? ` (${info.scopeLabels.join(", ")})` : "";
                    return (
                      <div key={info.triggerKey} className={s.stopInfoNote}>
                        ✓ “{info.triggerLabel}” already has {parts.join(" & ")} in another trail{scopeNote} — it will run automatically when this reminder stops. No need to add Stage 2 unless you want a separate message.
                      </div>
                    );
                  }
                  if (info.inCurrentTrailStage !== null) {
                    return (
                      <div key={info.triggerKey} className={s.stopInfoNote}>
                        ✓ “{info.triggerLabel}” is already handled in Stage {info.inCurrentTrailStage} of this trail.
                      </div>
                    );
                  }
                  return (
                    <div key={info.triggerKey} className={s.stopInfoNote} data-kind="paused">
                      Note: “{info.triggerLabel}” exists in {info.pausedCount} paused trail{info.pausedCount === 1 ? "" : "s"} (currently off — won&apos;t send until activated).
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>

        {/* 5. After Wait / Timeout: Condition (Left) -> System Action (Right) — hidden on Permanent repeat */}
        {reminder.repeatMode !== "permanent" && (
        <div className={`${s.timeoutBox} ${s.fieldFull}`} data-enabled={timeoutCfg.enabled}>
          <div className={s.timeoutHead}>
            <label className={s.timeoutToggle}>
              <input
                type="checkbox"
                checked={timeoutCfg.enabled}
                onChange={e => {
                  const enabled = e.target.checked;
                  setTimeoutCfg({
                    enabled,
                    ...(enabled && !isDueAnchored && !timeoutCfg.afterDays && reminder.repeatMode === "limited" ? { afterDays: reminder.repeatForDays } : {}),
                  });
                }}
              />
              <span>{isDueAnchored ? `On ${dueTargetLabel} — run System Action` : "If not stopped after wait period — run System Action"}</span>
            </label>
            {timeoutCfg.enabled && (
              <div className={s.timeoutWaitRow}>
                <span>{isDueAnchored ? `On ${dueTargetLabel} +` : "After"}</span>
                <NumberInput
                  className={s.numInput}
                  min={0}
                  max={365}
                  aria-label="Wait days before system action"
                  value={timeoutCfg.afterDays}
                  emptyOnBlur="zero"
                  onValueChange={n => setTimeoutCfg({ afterDays: Math.max(0, Math.min(365, n)) })}
                />
                <span>{isDueAnchored ? "extra days" : "days"}</span>
              </div>
            )}
          </div>

          {timeoutCfg.enabled && (
            <div className={s.stackField}>
              {/* System Action (SSOT from backend, trigger-filtered) */}
              <div className={s.stackField}>
                <label className={s.stackLabel}>System Action (what system does if still not stopped)</label>
                <SystemActionsEditor
                  actions={timeoutCfg.actions}
                  availableActions={liveEscalationActions}
                  onChange={nextActions => {
                    const stillHasContinue = nextActions.some(a => a.key === "stage.continue");
                    setTimeoutCfg({
                      actions: nextActions,
                      ...(!stillHasContinue ? { nextStageId: null } : {}),
                    });
                  }}
                />
                {hasStageContinueAction && (
                  <div className={s.stageLinkRow}>
                    <span>Target stage:</span>
                    <CapsuleSelect
                      className={s.select}
                      ariaLabel="Target timeout stage"
                      value={timeoutCfg.nextStageId !== null && timeoutCfg.nextStageId !== undefined ? String(timeoutCfg.nextStageId) : ""}
                      onChange={value => setTimeoutCfg({ nextStageId: value ? Number(value) : null })}
                      options={[
                        { value: "", label: "Select linked stage…" },
                        ...timeoutStages.map(st => {
                          const idxPos = (currentStages || []).findIndex(item => item.id === st.id);
                          return { value: String(st.id), label: `Stage ${idxPos >= 0 ? idxPos + 2 : st.id} (After timeout)` };
                        }),
                      ]}
                    />
                    {onCreateTimeoutStage && (currentStages?.length || 0) < MAX_CHAIN_DEPTH && (
                      <button
                        type="button"
                        className={s.miniBtn}
                        onClick={() => {
                          const newId = onCreateTimeoutStage(stageId, effectiveTriggers, reminder.stopOn);
                          setTimeoutCfg({ nextStageId: newId });
                        }}
                      >
                        + Create &amp; link Stage {(currentStages?.length || 0) + 2}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        )}
      </div>
    </div>
  </div>;
}

function TrailStageBlock({
  stagePrefix = "s0",
  stageId = 0,
  accordion,
  stageTriggers,
  stageTriggersLabel,
  depth,
  showTriggerSelect,
  instant,
  adminActionControl,
  userActionControl,
  focusAudience,
  focusTemplateId,
  saving,
  legacyRefreshSeq = 0,
  syncSnapSeq = 0,
  stageLegacyPulled = false,
  onApplyStageLegacy,
  onQuickSaveAudience,
  onChangeAdminControl,
  onChangeUserControl,
  reminders,
  folders,
  byKey,
  catalogConditions = [],
  catalogActions = [],
  triggerBadges,
  existingTrails,
  currentTrailId,
  currentStages,
  duplicateWarningItems,
  onCreateTimeoutStage,
  onChangeTriggers,
  onChangeInstant,
  onChangeReminders,
}: {
  stagePrefix?: string;
  stageId?: number;
  accordion?: AccordionCtrl;
  stageTriggers: string[];
  stageTriggersLabel: string;
  depth: number;
  showTriggerSelect?: boolean;
  instant: InstantBlockState;
  adminActionControl?: "auto" | "review" | "off";
  userActionControl?: "auto" | "review" | "off";
  focusAudience?: "client" | "admin";
  focusTemplateId?: string;
  saving?: boolean;
  legacyRefreshSeq?: number;
  syncSnapSeq?: number;
  stageLegacyPulled?: boolean;
  onApplyStageLegacy?: (payload: LegacyPullPayload) => void;
  onQuickSaveAudience?: (who: "client" | "admin", next: SingleMsg) => Promise<QuickSaveResult>;
  onChangeAdminControl?: (next: "auto" | "review" | "off") => void;
  onChangeUserControl?: (next: "auto" | "review" | "off") => void;
  reminders: Reminder[];
  folders: WorkFolder[];
  byKey: Map<string, WorkItem>;
  catalogConditions?: ConditionCatalogItem[];
  catalogActions?: SystemActionCatalogItem[];
  triggerBadges?: Map<string, TriggerBadgeInfo>;
  existingTrails?: TrailForm[];
  currentTrailId?: string;
  currentStages?: TrailStage[];
  duplicateWarningItems?: TriggerCoverageInfo[];
  onCreateTimeoutStage?: (parentStageId: number, parentTriggers: string[], parentStopOn: string[]) => number;
  onChangeTriggers?: (next: string[]) => void;
  onChangeInstant: (next: InstantBlockState) => void;
  onChangeReminders: (next: Reminder[]) => void;
}) {
  const [stageLegacyData, setStageLegacyData] = useState<LegacyPullPayload | null>(null);
  const stageTriggersCsv = useMemo(() => [...stageTriggers].sort().join(","), [stageTriggers]);
  const canPullLegacy = Boolean(showTriggerSelect && onApplyStageLegacy);

  useEffect(() => {
    if (!canPullLegacy || !stageTriggersCsv) {
      setStageLegacyData(null);
      return;
    }
    const controller = new AbortController();
    fetch(`/api/auto-reply/action-rules/legacy-for-trigger?triggers=${encodeURIComponent(stageTriggersCsv)}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(res => (res.ok ? res.json().catch(() => null) : null))
      .then(json => {
        if (controller.signal.aborted) return;
        const d = json?.data as LegacyPullPayload | null;
        if (d && ((d.clientTemplates?.length || 0) > 0 || (d.adminTemplates?.length || 0) > 0 || (d.reminders?.length || 0) > 0)) {
          setStageLegacyData(d);
        } else {
          setStageLegacyData(null);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setStageLegacyData(null);
      });
    return () => controller.abort();
  }, [canPullLegacy, stageTriggersCsv, legacyRefreshSeq]);

  function addStageReminder() {
    const defaultStops = [...new Set(
      stageTriggers.flatMap(k => byKey.get(k)?.defaultStopOn || []),
    )].filter(k => byKey.has(k) && !stageTriggers.includes(k));
    const created = newReminder(defaultStops, stageTriggers[0]);
    onChangeReminders([...reminders, created]);
    if (accordion) accordion.openOnly(`${stagePrefix}-r${created.id}-client-0`);
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
          {stageLegacyData && onApplyStageLegacy && (
            <div className={s.legacyBanner} data-pulled={stageLegacyPulled} role="status">
              <div className={s.noticeText}>
                <strong>
                  {stageLegacyPulled
                    ? `Legacy templates loaded into Stage ${depth + 1}`
                    : (() => {
                        const cCount = stageLegacyData.clientTemplates?.length || 0;
                        const aCount = stageLegacyData.adminTemplates?.length || 0;
                        const totalTpl = cCount + aCount;
                        const remCount = stageLegacyData.reminders?.length || 0;
                        const parts: string[] = [];
                        if (totalTpl > 0) {
                          const split = [cCount ? `${cCount} Client` : "", aCount ? `${aCount} Admin` : ""].filter(Boolean).join(", ");
                          parts.push(`${totalTpl} legacy template${totalTpl === 1 ? "" : "s"} (${split})`);
                        }
                        if (remCount > 0) parts.push(`${remCount} reminder${remCount === 1 ? "" : "s"}`);
                        return `${parts.join(" & ")} found for Stage ${depth + 1}`;
                      })()}
                </strong>
                <span>
                  {stageLegacyPulled
                    ? "Review or edit below. Old system stays untouched until you click Save."
                    : "Pull existing templates & reminders into this stage as-is. Old system stays safe until Save."}
                </span>
              </div>
              {!stageLegacyPulled && (
                <button
                  type="button"
                  className={s.primaryBtn}
                  onClick={() => onApplyStageLegacy(stageLegacyData)}
                >
                  Get Legacy
                </button>
              )}
            </div>
          )}
          {duplicateWarningItems && duplicateWarningItems.length > 0 && (
            <div className={s.stopNotes}>
              {duplicateWarningItems.map(info => {
                const parts: string[] = [];
                if (info.activeTemplates > 0) parts.push(`${info.activeTemplates} active template${info.activeTemplates === 1 ? "" : "s"}`);
                if (info.activeReminders > 0) parts.push(`${info.activeReminders} active reminder${info.activeReminders === 1 ? "" : "s"}`);
                const scopeNote = info.scopeLabels.length ? ` (${info.scopeLabels.join(", ")})` : "";
                return (
                  <div key={info.triggerKey} className={s.dupWarnNote} role="status">
                    Heads up: “{info.triggerLabel}” already has {parts.join(" & ")} in another active trail{scopeNote}. Adding a message here may send a duplicate.
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 1. Template (Instant Auto Message) */}
      <InstantAutoMsgBlock
        state={instant}
        stagePrefix={stagePrefix}
        accordion={accordion}
        adminActionControl={adminActionControl}
        userActionControl={userActionControl}
        focusAudience={focusAudience}
        focusTemplateId={focusTemplateId}
        saving={saving}
        hasUnsavedLegacy={stageLegacyPulled}
        syncSnapSeq={syncSnapSeq}
        onQuickSaveAudience={onQuickSaveAudience}
        onChangeAdminControl={onChangeAdminControl}
        onChangeUserControl={onChangeUserControl}
        onChange={onChangeInstant}
      />

      <div className={s.sectionDivider} role="separator" aria-label="End of Template, start of Follow-up Reminder">
        <span>Follow-up Reminder</span>
      </div>

      {/* 2. Follow-up Reminder */}
      <div style={{ display: "grid", gap: "8px" }} data-outline-section={`${stagePrefix}-reminder`}>
        <div className={s.blockHead}>
          <div className={s.blockTitle}>
            <span className={s.stageBadge}>Follow-up reminder</span>
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
            stagePrefix={stagePrefix}
            accordion={accordion}
            reminder={rem}
            stageTriggers={stageTriggers}
            stageTriggersLabel={stageTriggersLabel}
            folders={folders}
            byKey={byKey}
            stageId={stageId}
            catalogConditions={catalogConditions}
            catalogActions={catalogActions}
            triggerBadges={triggerBadges}
            existingTrails={existingTrails}
            currentTrailId={currentTrailId}
            currentStages={currentStages}
            onCreateTimeoutStage={onCreateTimeoutStage}
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
  initialFocus,
  existingTrails,
  triggerBadges,
  folders,
  byKey,
  packages,
  catalogConditions = [],
  catalogActions = [],
  isLive,
  saving,
  error,
  onClose,
  onSave,
  onRefresh,
}: {
  initial: TrailForm;
  initialFocus?: EditFocus;
  existingTrails: TrailForm[];
  triggerBadges: Map<string, TriggerBadgeInfo>;
  folders: WorkFolder[];
  byKey: Map<string, WorkItem>;
  packages: ActionPackageOption[];
  catalogConditions?: ConditionCatalogItem[];
  catalogActions?: SystemActionCatalogItem[];
  isLive: boolean;
  saving: boolean;
  error: string;
  onClose: () => void;
  onSave: (form: TrailForm, opts?: { keepOpen?: boolean }) => Promise<TrailForm | null> | void;
  onRefresh?: (trailId?: string) => Promise<{ ok: boolean; trail?: TrailForm | null; deleted?: boolean; error?: string }>;
}) {
  const [form, setForm] = useState<TrailForm>(initial);
  const formRef = useRef<TrailForm>(form);
  formRef.current = form;
  const [savedSnapKey, setSavedSnapKey] = useState<string>(() => formSnapshotKey(initial));
  const [refreshing, setRefreshing] = useState(false);
  const [confirmRefreshOpen, setConfirmRefreshOpen] = useState(false);
  const [statusNotice, setStatusNotice] = useState("");
  const [syncSnapSeq, setSyncSnapSeq] = useState(0);
  const [activeFocus, setActiveFocus] = useState<EditFocus>(initialFocus || { mode: "full" });
  const [activeOutline, setActiveOutline] = useState<string>("trigger");
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const scrollLockUntilRef = useRef(0);
  const [openBoxIds, setOpenBoxIds] = useState<Set<string>>(() => {
    const first = defaultOpenBoxId(initial, initialFocus || { mode: "full" });
    return first ? new Set([first]) : new Set();
  });
  const [localError, setLocalError] = useState("");
  const [previewItem, setPreviewItem] = useState<PreviewRequest | null>(null);
  const [legacyData, setLegacyData] = useState<LegacyPullPayload | null>(null);
  const [legacyPulled, setLegacyPulled] = useState(false);
  const [pullSeq, setPullSeq] = useState(0);
  const [stagePullSeq, setStagePullSeq] = useState<Record<number, number>>({});
  const [legacyRefreshSeq, setLegacyRefreshSeq] = useState(0);
  const [autoLoadedFromTrigger, setAutoLoadedFromTrigger] = useState(false);
  const [autoLoadedDirty, setAutoLoadedDirty] = useState(false);
  const [skipAutoLoad, setSkipAutoLoad] = useState(false);

  const rootTrigLabelRef = useRef("");
  const accordion = useMemo<AccordionCtrl>(() => ({
    isOpen: (id: string) => openBoxIds.has(id),
    toggle: (id: string, multi: boolean) => {
      setOpenBoxIds(curr => {
        if (multi) {
          const next = new Set(curr);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        }
        if (curr.size === 1 && curr.has(id)) return new Set();
        return new Set([id]);
      });
    },
    openOnly: (id: string) => {
      setOpenBoxIds(new Set([id]));
    },
    openPreview: (req: PreviewRequest) => {
      setPreviewItem({ ...req, triggerLabel: req.triggerLabel || rootTrigLabelRef.current });
    },
  }), [openBoxIds]);

  const [collapsedOutline, setCollapsedOutline] = useState<Record<string, boolean>>({});

  function toggleOutlineFold(stagePrefix: string) {
    setCollapsedOutline(curr => ({ ...curr, [stagePrefix]: !curr[stagePrefix] }));
  }

  function jumpToOutline(sectionId: string) {
    const body = bodyRef.current;
    if (!body) return;
    const target = body.querySelector<HTMLElement>(`[data-outline-section="${sectionId}"]`);
    if (!target) return;
    setActiveOutline(sectionId);
    scrollLockUntilRef.current = Date.now() + 550;
    const top = target.getBoundingClientRect().top - body.getBoundingClientRect().top + body.scrollTop;
    body.scrollTo({ top: Math.max(0, top - 16), behavior: "smooth" });
  }

  function handleBodyScroll() {
    if (Date.now() < scrollLockUntilRef.current) return;
    const body = bodyRef.current;
    if (!body) return;
    const sections = Array.from(body.querySelectorAll<HTMLElement>("[data-outline-section]"));
    if (!sections.length) return;
    const bodyTop = body.getBoundingClientRect().top;
    const threshold = 56;
    let current = sections[0].getAttribute("data-outline-section") || "trigger";
    for (const sec of sections) {
      const relTop = sec.getBoundingClientRect().top - bodyTop;
      if (relTop <= threshold) {
        current = sec.getAttribute("data-outline-section") || current;
      } else {
        break;
      }
    }
    setActiveOutline(curr => (curr === current ? curr : current));
  }
  const set = (patch: Partial<TrailForm>) => {
    if (localError) setLocalError("");
    if (
      autoLoadedFromTrigger
      && !autoLoadedDirty
      && (
        "instant" in patch
        || "reminders" in patch
        || "stages" in patch
        || "scope" in patch
        || "selectedPackages" in patch
        || "control" in patch
        || "adminActionControl" in patch
        || "userActionControl" in patch
      )
    ) {
      setAutoLoadedDirty(true);
    }
    setForm(curr => ({ ...curr, ...patch }));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (previewItem) {
        setPreviewItem(null);
        return;
      }
      if (confirmRefreshOpen) {
        setConfirmRefreshOpen(false);
        return;
      }
      requestClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [previewItem, confirmRefreshOpen]);

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
    const hadExistingTemplates =
      (form.instant.client.templates || []).some(t => t.text.trim().length > 0)
      || (form.instant.admin.templates || []).some(t => t.text.trim().length > 0);

    const nextClient = hasClient
      ? mergeLegacyTemplates(form.instant.client, legacyData.clientTemplates)
      : form.instant.client;
    const nextAdmin = hasAdmin
      ? mergeLegacyTemplates(form.instant.admin, legacyData.adminTemplates)
      : form.instant.admin;
    let nextAudience: InstantAudience = form.instant.audience;
    if (hasClient && hasAdmin) nextAudience = "both";
    else if (hasClient) nextAudience = (nextAudience === "admin" || nextAudience === "both") ? "both" : "client";
    else if (hasAdmin) nextAudience = (nextAudience === "client" || nextAudience === "both") ? "both" : "admin";

    const alreadyPulledRules = new Set(form.migratedLegacy?.ruleIds || []);
    const incomingRuleIds = Array.isArray(legacyData.ruleIds) ? legacyData.ruleIds : [];
    const pulledReminders = Array.isArray(legacyData.reminders) && legacyData.reminders.length > 0
      ? legacyData.reminders
          .filter((_, idx) => !incomingRuleIds[idx] || !alreadyPulledRules.has(incomingRuleIds[idx]))
          .map(r => normalizeReminder(r, 0))
      : [];

    setForm(curr => ({
      ...curr,
      control: hadExistingTemplates ? (curr.control || "auto") : (legacyData.control || curr.control || "auto"),
      adminActionControl: hadExistingTemplates
        ? (curr.adminActionControl || (curr.control === "review" ? "review" : "auto"))
        : (legacyData.adminActionControl || legacyData.control || curr.adminActionControl || "auto"),
      userActionControl: hadExistingTemplates
        ? (curr.userActionControl || (curr.control === "review" ? "review" : "auto"))
        : (legacyData.userActionControl || curr.userActionControl || "auto"),
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
    if (hasClient) accordion.openOnly("s0-tpl-client");
    else if (hasAdmin) accordion.openOnly("s0-tpl-admin");
    else if (pulledReminders.length > 0) accordion.openOnly(`s0-r${pulledReminders[0].id}-client-0`);
  }

  const primaryKey = form.triggers[0] || "";
  const supportsScopeFor = (next: Pick<TrailForm, "triggers" | "reminders" | "stages">) =>
    allTrailTriggerKeys(next).some(k => byKey.get(k)?.supportsScope);
  const hasPackageScope = supportsScopeFor(form);
  const relatedTrails = useMemo(() => findRelatedTrails(form, existingTrails, byKey), [form, existingTrails, byKey]);
  const totalTemplates = useMemo(() => countTemplates(form.instant, form.stages), [form.instant, form.stages]);
  const totalReminders = useMemo(() => countReminders(form.reminders, form.stages), [form.reminders, form.stages]);

  const packageOptions = useMemo<ComboOption[]>(() => (
    packages.map(p => ({ key: p.slug, label: p.name, group: "Packages & Plans" }))
  ), [packages]);

  function isFormBlank(f: TrailForm): boolean {
    return !hasInstantContent(f.instant) && f.reminders.length === 0 && f.stages.length === 0 && !f.migratedLegacy;
  }

  function loadExistingIntoForm(trail: TrailForm, fromAuto: boolean) {
    setLocalError("");
    setLegacyPulled(false);
    setConfirmRefreshOpen(false);
    setForm(trail);
    setSavedSnapKey(formSnapshotKey(trail));
    setAutoLoadedFromTrigger(fromAuto);
    setAutoLoadedDirty(false);
    setPullSeq(v => v + 1);
    const first = defaultOpenBoxId(trail, { mode: "full" });
    if (first) accordion.openOnly(first);
  }

  function changeRootTriggers(nextTriggers: string[]) {
    // If an existing trail was just auto-loaded and the user has not edited it yet,
    // clearing or switching triggers resets cleanly instead of mutating the loaded trail's triggers.
    if (autoLoadedFromTrigger && !autoLoadedDirty) {
      if (nextTriggers.length === 0) {
        setLocalError("");
        setLegacyPulled(false);
        setAutoLoadedFromTrigger(false);
        setForm(emptyForm());
        setPullSeq(v => v + 1);
        accordion.openOnly("s0-tpl-client");
        return;
      }
      const exactMatches = existingTrails.filter(t => Boolean(t._id) && sameSorted(t.triggers, nextTriggers));
      if (exactMatches.length === 1) {
        loadExistingIntoForm(exactMatches[0], true);
        return;
      }
      setLocalError("");
      setLegacyPulled(false);
      setAutoLoadedFromTrigger(false);
      setForm({ ...emptyForm(), triggers: nextTriggers });
      setPullSeq(v => v + 1);
      accordion.openOnly("s0-tpl-client");
      return;
    }

    // If user cleared all triggers in a fresh new form, re-enable auto-load for the next trigger they pick.
    if (!form._id && nextTriggers.length === 0 && skipAutoLoad) {
      setSkipAutoLoad(false);
    }

    // Auto-get existing saved trail when creating a new trail on an untouched form and 1 exact match exists.
    if (!form._id && !skipAutoLoad && nextTriggers.length > 0 && isFormBlank(form)) {
      const exactMatches = existingTrails.filter(t => Boolean(t._id) && sameSorted(t.triggers, nextTriggers));
      if (exactMatches.length === 1) {
        loadExistingIntoForm(exactMatches[0], true);
        return;
      }
    }

    const nextWorks = nextTriggers.map(k => byKey.get(k));
    const liveNext = getApplicableConditions(nextWorks, catalogConditions, "reminder");
    const nextAllowed = liveNext.map(c => c.key);
    const nextBaseDates = getApplicableBaseDates(nextWorks);
    const nextReminders = form.reminders.map(rem => {
      if (rem.startTrigger !== "__main__") return rem;
      const nextBase: BaseDate = nextBaseDates.some(d => d.id === rem.countDaysFrom)
        ? rem.countDaysFrom
        : (nextBaseDates[0]?.id || "trigger_date");
      const fixPos = (st: MessageStep): MessageStep => (nextBase === "trigger_date" && st.pos === "before" ? { ...st, pos: "after" } : st);
      return {
        ...rem,
        countDaysFrom: nextBase,
        repeatMode: nextBase === "trigger_date" && rem.repeatMode === "until_due" ? "off" : rem.repeatMode,
        clientSteps: rem.clientSteps.map(fixPos),
        adminSteps: rem.adminSteps.map(fixPos),
        condition: nextAllowed.includes(rem.condition) ? rem.condition : "any",
        stopOn: rem.stopOn.filter(k => !nextTriggers.includes(k)),
      };
    });
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
    const created = newTrailStage(mode, prefill, defaultStops);
    set({ stages: [...form.stages, created] });
    if (mode === "template") accordion.openOnly(`st${created.id}-tpl-client`);
    else if (created.reminder) accordion.openOnly(`st${created.id}-r${created.reminder.id}-client-0`);
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
      const rem = nextReminder;
      const nextWorks = nextTriggers.map(k => byKey.get(k));
      const liveNext = getApplicableConditions(nextWorks, catalogConditions, "reminder");
      const nextAllowed = liveNext.map(c => c.key);
      const nextBaseDates = getApplicableBaseDates(nextWorks);
      const nextBase: BaseDate = nextBaseDates.some(d => d.id === rem.countDaysFrom)
        ? rem.countDaysFrom
        : (nextBaseDates[0]?.id || "trigger_date");
      const fixPos = (st: MessageStep): MessageStep => (nextBase === "trigger_date" && st.pos === "before" ? { ...st, pos: "after" } : st);
      nextReminder = {
        ...rem,
        countDaysFrom: nextBase,
        repeatMode: nextBase === "trigger_date" && rem.repeatMode === "until_due" ? "off" : rem.repeatMode,
        clientSteps: rem.clientSteps.map(fixPos),
        adminSteps: rem.adminSteps.map(fixPos),
        condition: nextAllowed.includes(rem.condition) ? rem.condition : "any",
        stopOn: rem.stopOn.filter(k => !nextTriggers.includes(k)),
      };
    }
    updateStage(stage.id, { triggers: nextTriggers, reminder: nextReminder, migratedLegacy: undefined });
  }

  function applyStageLegacyPull(stageId: number, payload: LegacyPullPayload) {
    const stage = formRef.current.stages.find(st => st.id === stageId);
    if (!stage) return;
    const hasClient = (payload.clientTemplates?.length || 0) > 0;
    const hasAdmin = (payload.adminTemplates?.length || 0) > 0;

    const nextClient = hasClient
      ? mergeLegacyTemplates(stage.instant.client, payload.clientTemplates)
      : stage.instant.client;
    const nextAdmin = hasAdmin
      ? mergeLegacyTemplates(stage.instant.admin, payload.adminTemplates)
      : stage.instant.admin;
    let nextAudience: InstantAudience = stage.instant.audience;
    if (hasClient && hasAdmin) nextAudience = "both";
    else if (hasClient) nextAudience = (nextAudience === "admin" || nextAudience === "both") ? "both" : "client";
    else if (hasAdmin) nextAudience = (nextAudience === "client" || nextAudience === "both") ? "both" : "admin";

    let nextReminder = stage.reminder;
    const pulledRems = Array.isArray(payload.reminders) && payload.reminders.length > 0
      ? payload.reminders.map(r => normalizeReminder(r, 0))
      : [];
    if (!nextReminder && pulledRems.length > 0) {
      let mergedRem = pulledRems[0];
      if (pulledRems.length > 1) {
        const other = pulledRems.find(r => r.audience !== mergedRem.audience);
        if (other && mergedRem.audience !== "both" && other.audience !== "both") {
          mergedRem = {
            ...mergedRem,
            audience: "both",
            clientSteps: mergedRem.audience === "client" ? mergedRem.clientSteps : other.clientSteps,
            adminSteps: mergedRem.audience === "admin" ? mergedRem.adminSteps : other.adminSteps,
          };
        }
      }
      nextReminder = mergedRem;
    }

    const nextMeta = mergeLegacyMeta([
      stage.migratedLegacy,
      {
        events: payload.events || [],
        templateIds: payload.templateIds || [],
        ruleIds: payload.ruleIds || [],
      },
    ]);

    updateStage(stageId, {
      instant: { audience: nextAudience, client: nextClient, admin: nextAdmin },
      reminder: nextReminder,
      migratedLegacy: nextMeta,
    });
    setStagePullSeq(curr => ({ ...curr, [stageId]: (curr[stageId] || 0) + 1 }));
    if (hasClient) accordion.openOnly(`st${stageId}-tpl-client`);
    else if (hasAdmin) accordion.openOnly(`st${stageId}-tpl-admin`);
    else if (nextReminder) accordion.openOnly(`st${stageId}-r${nextReminder.id}-client-0`);
  }

  function flashStatus(labelText: string) {
    setStatusNotice(labelText);
    window.setTimeout(() => setStatusNotice(curr => (curr === labelText ? "" : curr)), 2600);
  }

  async function quickSaveWithPatch(buildNext: (curr: TrailForm) => TrailForm, opts?: { syncTemplates?: boolean }): Promise<QuickSaveResult> {
    const nextForm = buildNext(formRef.current);
    const { trail, error: valError, errorBoxId } = prepareTrailForSave(nextForm, byKey, catalogConditions);
    if (valError) {
      setLocalError(valError);
      if (errorBoxId) accordion.openOnly(errorBoxId);
      return { ok: false, message: valError };
    }
    setLocalError("");
    const saved = await onSave(trail, { keepOpen: true });
    if (!saved) {
      return { ok: false, message: "Could not save changes." };
    }
    const cleanNext: TrailForm = {
      ...nextForm,
      _id: saved._id,
      migratedLegacy: undefined,
      stages: nextForm.stages.map(st => ({ ...st, migratedLegacy: undefined })),
    };
    setForm(curr => ({
      ...curr,
      _id: saved._id,
      migratedLegacy: undefined,
      stages: curr.stages.map(st => ({ ...st, migratedLegacy: undefined })),
    }));
    setSavedSnapKey(formSnapshotKey(cleanNext));
    setConfirmRefreshOpen(false);
    if (opts?.syncTemplates) setSyncSnapSeq(v => v + 1);
    if (trail.migratedLegacy) {
      setLegacyData(null);
      setLegacyPulled(false);
      setLegacyRefreshSeq(v => v + 1);
    }
    return { ok: true };
  }

  const hasPendingChanges = useMemo(() => formSnapshotKey(form) !== savedSnapKey, [form, savedSnapKey]);

  async function runRefresh() {
    if (refreshing || saving) return;
    setConfirmRefreshOpen(false);
    setLocalError("");
    if (!onRefresh) {
      const next = form._id ? initial : emptyForm();
      setForm(next);
      setSavedSnapKey(formSnapshotKey(next));
      setPullSeq(v => v + 1);
      setLegacyRefreshSeq(v => v + 1);
      flashStatus("Refreshed ✓");
      return;
    }
    setRefreshing(true);
    try {
      const res = await onRefresh(formRef.current._id);
      if (!res.ok) {
        setLocalError(res.error || "Could not refresh latest data.");
        return;
      }
      if (res.deleted) {
        setLocalError("This trail was deleted elsewhere.");
        return;
      }
      const next = res.trail || emptyForm();
      setForm(next);
      setSavedSnapKey(formSnapshotKey(next));
      setLegacyPulled(false);
      setAutoLoadedFromTrigger(false);
      setAutoLoadedDirty(false);
      setPullSeq(v => v + 1);
      setLegacyRefreshSeq(v => v + 1);
      const first = defaultOpenBoxId(next, activeFocus);
      if (first) accordion.openOnly(first);
      flashStatus("Refreshed ✓");
    } finally {
      setRefreshing(false);
    }
  }

  function handleRefreshClick() {
    if (refreshing || saving) return;
    if (hasPendingChanges) {
      setConfirmRefreshOpen(true);
      return;
    }
    void runRefresh();
  }

  async function handleSaveStayOpen() {
    if (saving || refreshing) return;
    const res = await quickSaveWithPatch(curr => curr, { syncTemplates: true });
    if (res.ok) flashStatus("Saved ✓");
  }

  function quickSaveRootAudience(who: "client" | "admin", nextMsg: SingleMsg) {
    return quickSaveWithPatch(curr => ({
      ...curr,
      instant: { ...curr.instant, [who]: nextMsg },
    }));
  }

  function quickSaveStageAudience(stageId: number, who: "client" | "admin", nextMsg: SingleMsg) {
    return quickSaveWithPatch(curr => ({
      ...curr,
      stages: curr.stages.map(st => (
        st.id === stageId ? { ...st, instant: { ...st.instant, [who]: nextMsg } } : st
      )),
    }));
  }

  function createTimeoutStage(parentStageId: number, parentTriggers: string[], parentStopOn: string[]): number {
    const newId = nextId++;
    const rem = newReminder(parentStopOn, parentTriggers[0]);
    rem.countDaysFrom = "trigger_date";
    rem.clientSteps = [blankStep("after", 1, "days")];
    rem.adminSteps = [blankStep("after", 1, "days")];
    rem.repeatMode = "limited";
    rem.repeatForDays = 3;
    rem.repeatEveryDays = 1;
    const created: TrailStage = {
      id: newId,
      source: "previous_timeout",
      parentStageId,
      triggers: [...parentTriggers],
      onStartActions: [],
      instant: blankInstant("client"),
      reminder: rem,
    };
    set({ stages: [...form.stages, created] });
    accordion.openOnly(`st${created.id}-tpl-client`);
    return newId;
  }

  function removeStage(stageId: number) {
    const clearDangling = (r: Reminder): Reminder => (
      r.onTimeout?.nextStageId === stageId
        ? { ...r, onTimeout: { ...r.onTimeout, nextStageId: null } }
        : r
    );
    const nextReminders = form.reminders.map(clearDangling);
    const nextStages = form.stages
      .filter(st => st.id !== stageId)
      .map(st => (st.reminder ? { ...st, reminder: clearDangling(st.reminder) } : st));
    const stillSupportsScope = supportsScopeFor({ ...form, reminders: nextReminders, stages: nextStages });
    set({
      reminders: nextReminders,
      stages: nextStages,
      ...(stillSupportsScope ? {} : { scope: "all", selectedPackages: [] }),
    });
  }

  function handleSaveClick() {
    const { trail, error: valError, errorBoxId } = prepareTrailForSave(form, byKey, catalogConditions);
    if (valError) {
      setLocalError(valError);
      if (errorBoxId) accordion.openOnly(errorBoxId);
      return;
    }
    setLocalError("");
    onSave(trail);
  }

  async function saveForGuard(): Promise<boolean> {
    const { trail, error: valError, errorBoxId } = prepareTrailForSave(form, byKey, catalogConditions);
    if (valError) {
      setLocalError(valError);
      if (errorBoxId) accordion.openOnly(errorBoxId);
      return false;
    }
    setLocalError("");
    const saved = await onSave(trail);
    return Boolean(saved);
  }

  const { guard: guardUnsaved, dialog: unsavedDialog } = useUnsavedGuard({
    dirty: hasPendingChanges,
    busy: saving || refreshing,
    saveLabel: "Save changes & close",
    discardLabel: "Discard & close",
    onSave: saveForGuard,
    onDiscard: onClose,
  });
  const requestClose = () => guardUnsaved(onClose);

  const rootTrigLabel = triggersLabel(form.triggers, byKey);
  rootTrigLabelRef.current = rootTrigLabel;
  const lastStops = lastStopTriggers();
  const lastStopActiveCov = useMemo(
    () => describeTriggerCoverage(lastStops, existingTrails, form._id, form.stages, byKey).filter(c => c.activeCount > 0),
    [lastStops, existingTrails, form._id, form.stages, byKey],
  );

  const isFocused = activeFocus.mode !== "full";
  const focusStageIdx = activeFocus.mode !== "full" ? activeFocus.stageIndex : 0;
  const focusStageObj = focusStageIdx > 0 ? form.stages[focusStageIdx - 1] : null;
  const focusStageTriggers = focusStageIdx === 0 ? form.triggers : (focusStageObj?.triggers || []);
  const focusStageLabel = triggersLabel(focusStageTriggers, byKey) || rootTrigLabel;
  const focusScopeLabel = hasPackageScope ? (PACKAGE_SCOPES.find(p => p.id === form.scope)?.label || "") : "";

  function addFocusedStageReminder() {
    const defaultStops = [...new Set(
      focusStageTriggers.flatMap(k => byKey.get(k)?.defaultStopOn || []),
    )].filter(k => byKey.has(k) && !focusStageTriggers.includes(k));
    const created = newReminder(defaultStops, focusStageTriggers[0]);
    if (focusStageIdx === 0) {
      updateRootReminders([...form.reminders, created]);
      accordion.openOnly(`s0-r${created.id}-client-0`);
    } else if (focusStageObj) {
      updateStage(focusStageObj.id, { reminder: created });
      accordion.openOnly(`st${focusStageObj.id}-r${created.id}-client-0`);
    }
  }

  return <div className={s.overlay}>
    <div className={s.backdrop} onClick={requestClose} />
    <div className={s.dialog} role="dialog" aria-modal="true" aria-labelledby="amsg-title">
      <header className={s.dialogHead}>
        <div>
          <h2 id="amsg-title">
            {activeFocus.mode === "template"
              ? `Edit templates — ${focusStageLabel || "Trigger"}`
              : activeFocus.mode === "reminder"
                ? `Edit reminders — ${focusStageLabel || "Trigger"}`
                : (form._id ? "Edit automated message" : "Create automated message")}
          </h2>
          <p>
            {isFocused
              ? "Editing directly inside the saved trail — other stages and rules stay untouched."
              : "Configure trigger, instant message, follow-up reminders, and next stages in one compact flow."}
          </p>
        </div>
        <div className={s.headRight}>
          {statusNotice && <span className={s.tplSavedTag}>{statusNotice}</span>}
          <button
            type="button"
            className={s.miniBtn}
            disabled={saving || refreshing}
            title="Fetch latest saved data from server (or undo unsaved edits)"
            onClick={handleRefreshClick}
          >
            {refreshing ? "Refreshing…" : "↻ Refresh"}
          </button>
          <span className={s.liveTag} data-live={isLive}>
            <span className={s.liveDot} aria-hidden="true" />
            {isLive ? "Live catalog" : "Preview catalog"}
          </span>
          <button type="button" className={s.closeBtn} aria-label="Close" onClick={requestClose}>✕</button>
        </div>
      </header>

      {confirmRefreshOpen && (
        <div className={s.focusStrip} role="alert" style={{ background: "#fff7ed", borderBottomColor: "#fed7aa" }}>
          <div className={s.focusStripInfo}>
            <strong style={{ color: "#9a3412" }}>Unsaved changes pending</strong>
            <span style={{ color: "#9a3412" }}>
              Refreshing will discard your unsaved edits and load the latest saved data.
            </span>
          </div>
          <div className={s.flowStripActions}>
            <button type="button" className={s.miniBtn} onClick={() => setConfirmRefreshOpen(false)}>Keep editing</button>
            <button type="button" className={s.miniDangerBtn} disabled={refreshing} onClick={() => { void runRefresh(); }}>
              Discard &amp; Refresh
            </button>
          </div>
        </div>
      )}

      {isFocused && (
        <div className={s.focusStrip} aria-label="Parent trail context">
          <div className={s.focusStripInfo}>
            <span>Part of Trail:</span>
            <strong>{rootTrigLabel || "Saved trail"}</strong>
            <span className={s.badge}>Stage {focusStageIdx + 1}</span>
            {focusScopeLabel && <span className={s.badge}>{focusScopeLabel}</span>}
          </div>
          <div className={s.flowStripActions}>
            <button
              type="button"
              className={s.miniBtn}
              onClick={() => setActiveFocus({ mode: "full" })}
            >
              Open full trail →
            </button>
          </div>
        </div>
      )}

      <div className={!isFocused ? s.dialogSplit : undefined} style={isFocused ? { display: "flex", flexDirection: "column", flex: 1, minHeight: 0 } : undefined}>
        {!isFocused && (
          <aside className={s.outlineRail} aria-label="Trail outline">
            <div className={s.outlineHeading}>Trail outline</div>

            <div className={s.outlineCard} data-active={activeOutline === "trigger"}>
              <div className={s.outlineCardHead}>
                <button
                  type="button"
                  className={s.outlineCardBtn}
                  onClick={() => jumpToOutline("trigger")}
                >
                  <span className={s.outlineNum}>1</span>
                  <span className={s.outlineText}>
                    <span className={s.outlineTitle}>Trigger &amp; scope</span>
                    <span className={s.outlineSub}>
                      {rootTrigLabel ? rootTrigLabel.split("(")[0].trim() : "Select trigger"}
                    </span>
                  </span>
                </button>
              </div>
            </div>

            {[
              {
                prefix: "s0",
                num: 2,
                title: "Stage 1",
                sub: rootTrigLabel ? rootTrigLabel.split("(")[0].trim() : "Primary stage",
                instant: form.instant,
                rem: form.reminders[0] || null,
              },
              ...form.stages.map((stage, idx) => {
                const lbl = triggersLabel(stage.triggers, byKey);
                return {
                  prefix: `st${stage.id}`,
                  num: idx + 3,
                  title: `Stage ${idx + 2}`,
                  sub: stage.source === "previous_timeout"
                    ? "After timeout"
                    : (lbl ? lbl.split("(")[0].trim() : "Follow-up stage"),
                  instant: stage.instant,
                  rem: stage.reminder,
                };
              }),
            ].map(item => {
              const stageActive = activeOutline === item.prefix || activeOutline.startsWith(`${item.prefix}-`);
              const folded = Boolean(collapsedOutline[item.prefix]);
              const showInstClient = item.instant.audience === "client" || item.instant.audience === "both";
              const showInstAdmin = item.instant.audience === "admin" || item.instant.audience === "both";
              const showRemClient = Boolean(item.rem && (item.rem.audience === "client" || item.rem.audience === "both"));
              const showRemAdmin = Boolean(item.rem && (item.rem.audience === "admin" || item.rem.audience === "both"));

              return (
                <div key={item.prefix}>
                  <div className={s.outlineConnector} aria-hidden="true" />
                  <div className={s.outlineCard} data-active={stageActive}>
                    <div className={s.outlineCardHead}>
                      <button
                        type="button"
                        className={s.outlineCardBtn}
                        onClick={() => jumpToOutline(item.prefix)}
                      >
                        <span className={s.outlineNum}>{item.num}</span>
                        <span className={s.outlineText}>
                          <span className={s.outlineTitle}>{item.title}</span>
                          <span className={s.outlineSub}>{item.sub}</span>
                        </span>
                      </button>
                      <button
                        type="button"
                        className={s.outlineFoldBtn}
                        aria-label={folded ? `Expand ${item.title} outline` : `Collapse ${item.title} outline`}
                        onClick={() => toggleOutlineFold(item.prefix)}
                      >
                        {folded ? "▸" : "▾"}
                      </button>
                    </div>

                    {!folded && (
                      <div className={s.outlineSubList}>
                        <button
                          type="button"
                          className={s.outlineSubLink}
                          data-active={activeOutline === `${item.prefix}-instant`}
                          onClick={() => jumpToOutline(`${item.prefix}-instant`)}
                        >
                          <span>Instant auto message</span>
                          <span>{item.instant.audience === "off" ? "Off" : ""}</span>
                        </button>
                        {showInstClient && (
                          <button
                            type="button"
                            className={`${s.outlineSubLink} ${s.outlineLeafLink}`}
                            data-active={activeOutline === `${item.prefix}-tpl-client`}
                            onClick={() => jumpToOutline(`${item.prefix}-tpl-client`)}
                          >
                            <span>Client</span>
                            <span>{item.instant.client.templates?.length || 1}</span>
                          </button>
                        )}
                        {showInstAdmin && (
                          <button
                            type="button"
                            className={`${s.outlineSubLink} ${s.outlineLeafLink}`}
                            data-active={activeOutline === `${item.prefix}-tpl-admin`}
                            onClick={() => jumpToOutline(`${item.prefix}-tpl-admin`)}
                          >
                            <span>Admin / Team</span>
                            <span>{item.instant.admin.templates?.length || 1}</span>
                          </button>
                        )}

                        <button
                          type="button"
                          className={s.outlineSubLink}
                          data-active={activeOutline === `${item.prefix}-reminder`}
                          onClick={() => jumpToOutline(`${item.prefix}-reminder`)}
                        >
                          <span>Follow-up reminder</span>
                          <span>{item.rem ? "" : "Off"}</span>
                        </button>
                        {showRemClient && item.rem && (
                          <button
                            type="button"
                            className={`${s.outlineSubLink} ${s.outlineLeafLink}`}
                            data-active={activeOutline === `${item.prefix}-rem-client`}
                            onClick={() => jumpToOutline(`${item.prefix}-rem-client`)}
                          >
                            <span>Client</span>
                            <span>{item.rem.clientSteps.length}</span>
                          </button>
                        )}
                        {showRemAdmin && item.rem && (
                          <button
                            type="button"
                            className={`${s.outlineSubLink} ${s.outlineLeafLink}`}
                            data-active={activeOutline === `${item.prefix}-rem-admin`}
                            onClick={() => jumpToOutline(`${item.prefix}-rem-admin`)}
                          >
                            <span>Admin / Team</span>
                            <span>{item.rem.adminSteps.length}</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </aside>
        )}

      <div className={s.dialogBody} ref={bodyRef} onScroll={handleBodyScroll}>
        {activeFocus.mode === "template" ? (
          <section className={s.card}>
            <div className={s.cardHead}>
              <div className={s.cardTitle}>
                <span className={s.stepNum}>{focusStageIdx + 1}</span>
                <h3>Stage {focusStageIdx + 1} — Templates</h3>
              </div>
              <span className={s.cardSub}>On: {focusStageLabel}</span>
            </div>
            <InstantAutoMsgBlock
              key={`focus-tpl-s${focusStageIdx}-${activeFocus.audience || "all"}-${activeFocus.templateId || "def"}-${pullSeq}`}
              state={focusStageIdx === 0 ? form.instant : (focusStageObj?.instant || blankInstant("client"))}
              stagePrefix={focusStageIdx === 0 ? "s0" : `st${focusStageObj?.id ?? 0}`}
              accordion={accordion}
              adminActionControl={focusStageIdx === 0 ? (form.adminActionControl || (form.control === "review" ? "review" : "auto")) : undefined}
              userActionControl={focusStageIdx === 0 ? (form.userActionControl || (form.control === "review" ? "review" : "auto")) : undefined}
              focusAudience={activeFocus.audience}
              focusTemplateId={activeFocus.templateId}
              saving={saving}
              syncSnapSeq={syncSnapSeq}
              onQuickSaveAudience={(who, nextMsg) => (
                focusStageIdx === 0
                  ? quickSaveRootAudience(who, nextMsg)
                  : (focusStageObj ? quickSaveStageAudience(focusStageObj.id, who, nextMsg) : Promise.resolve({ ok: false }))
              )}
              onChangeAdminControl={focusStageIdx === 0 ? (adminActionControl => set({ adminActionControl })) : undefined}
              onChangeUserControl={focusStageIdx === 0 ? (userActionControl => set({ userActionControl })) : undefined}
              onChange={instant => {
                if (focusStageIdx === 0) set({ instant });
                else if (focusStageObj) updateStage(focusStageObj.id, { instant });
              }}
            />
          </section>
        ) : activeFocus.mode === "reminder" ? (
          <section className={s.card}>
            <div className={s.cardHead}>
              <div className={s.cardTitle}>
                <span className={s.stepNum}>{focusStageIdx + 1}</span>
                <h3>Stage {focusStageIdx + 1} — Follow-up reminders</h3>
              </div>
              <span className={s.cardSub}>On: {focusStageLabel}</span>
            </div>
            {(() => {
              const stageRems = focusStageIdx === 0
                ? form.reminders
                : (focusStageObj?.reminder ? [focusStageObj.reminder] : []);
              return (
                <div style={{ display: "grid", gap: "10px" }}>
                  {stageRems.map((rem, idx) => (
                    <ReminderCard
                      key={rem.id}
                      index={idx}
                      depth={focusStageIdx}
                      stagePrefix={focusStageIdx === 0 ? "s0" : `st${focusStageObj?.id ?? 0}`}
                      accordion={accordion}
                      reminder={rem}
                      stageTriggers={focusStageTriggers}
                      stageTriggersLabel={focusStageLabel}
                      folders={folders}
                      byKey={byKey}
                      triggerBadges={triggerBadges}
                      existingTrails={existingTrails}
                      currentTrailId={form._id}
                      currentStages={form.stages}
                      onChange={next => {
                        if (focusStageIdx === 0) {
                          updateRootReminders(form.reminders.map(item => item.id === rem.id ? next : item));
                        } else if (focusStageObj) {
                          updateStage(focusStageObj.id, { reminder: next });
                        }
                      }}
                      onRemove={() => {
                        if (focusStageIdx === 0) {
                          updateRootReminders(form.reminders.filter(item => item.id !== rem.id));
                        } else if (focusStageObj) {
                          updateStage(focusStageObj.id, { reminder: null });
                        }
                      }}
                    />
                  ))}
                  {stageRems.length === 0 && (
                    <button type="button" className={s.addBtn} onClick={addFocusedStageReminder}>
                      {focusStageLabel ? `+ Add reminder on “${focusStageLabel}”` : "+ Add follow-up reminder"}
                    </button>
                  )}
                </div>
              );
            })()}
          </section>
        ) : (
        <>
        {/* CARD 1: Trigger & Package Scope */}
        <section className={s.card} data-outline-section="trigger">
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
              <CapsuleSelect
                className={s.select}
                ariaLabel="Package scope"
                disabled={!hasPackageScope}
                value={form.scope}
                onChange={value => set({ scope: value as PackageScopeMode, selectedPackages: [] })}
                options={PACKAGE_SCOPES.map(item => ({ value: item.id, label: item.label }))}
              />

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

          {autoLoadedFromTrigger && (
            <div className={s.legacyBanner} data-pulled={true} role="status">
              <div className={s.noticeText}>
                <strong>Existing trail loaded for this trigger</strong>
                <span>You are editing the saved trail (templates, reminders &amp; settings loaded as-is).</span>
              </div>
              <button
                type="button"
                className={s.ghostBtn}
                onClick={() => {
                  const keepTriggers = [...form.triggers];
                  setLocalError("");
                  setLegacyPulled(false);
                  setAutoLoadedFromTrigger(false);
                  setAutoLoadedDirty(false);
                  setSkipAutoLoad(true);
                  setForm({ ...emptyForm(), triggers: keepTriggers });
                  setPullSeq(v => v + 1);
                  accordion.openOnly("s0-tpl-client");
                }}
              >
                Create separate instead
              </button>
            </div>
          )}

          {relatedTrails.length > 0 && (
            <div className={s.relatedBox} role="status">
              <div className={s.relatedHead}>
                <strong>Already configured on this trigger ({relatedTrails.length})</strong>
                <span>Edit an existing trail below instead of creating a duplicate, or continue for a different package scope.</span>
              </div>
              <div className={s.relatedList}>
                {relatedTrails.map(match => {
                  const title = match.trail.triggers.map(k => workLabel(k, byKey)).join(" + ");
                  const tplPreview = match.templateSummaries.length
                    ? `Templates: ${match.templateSummaries.slice(0, 3).join(", ")}${match.templateSummaries.length > 3 ? ` +${match.templateSummaries.length - 3} more` : ""}`
                    : "No templates";
                  const remPreview = match.reminderCount > 0
                    ? `${match.reminderCount} reminder${match.reminderCount === 1 ? "" : "s"}`
                    : "No reminders";
                  return (
                    <div key={match.trail._id} className={s.relatedItem} data-exact={match.isExactMatch}>
                      <div className={s.relatedMain}>
                        <div className={s.listTitleRow}>
                          <strong>{title}</strong>
                          {match.isExactMatch && <span className={s.exactTag}>Exact match</span>}
                          {match.whereLabels.map(lbl => <span key={lbl} className={s.badge}>{lbl}</span>)}
                          {match.scopeLabel && <span className={s.badge}>{match.scopeLabel}</span>}
                          <span className={s.liveTag} data-live={match.isOn}>
                            <span className={s.liveDot} aria-hidden="true" />
                            {match.isOn ? "Active" : "Paused"}
                          </span>
                        </div>
                        <span className={s.relatedMeta}>{tplPreview} · {remPreview}</span>
                      </div>
                      <button
                        type="button"
                        className={match.isExactMatch ? s.primaryBtn : s.ghostBtn}
                        onClick={() => loadExistingIntoForm(match.trail, false)}
                      >
                        Load &amp; Edit here
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        {/* CARD 2: Stage 1 (Template + Reminder) */}
        <section className={s.card} data-outline-section="s0">
          <div className={s.cardHead}>
            <div className={s.cardTitle}>
              <span className={s.stepNum}>2</span>
              <h3>Stage 1 — Messages &amp; reminder</h3>
            </div>
            <span className={s.cardSub}>{rootTrigLabel ? `On: ${rootTrigLabel}` : "Waiting for trigger…"}</span>
          </div>

          <TrailStageBlock
            key={`root-${pullSeq}`}
            stagePrefix="s0"
            accordion={accordion}
            stageTriggers={form.triggers}
            stageTriggersLabel={rootTrigLabel}
            depth={0}
            instant={form.instant}
            adminActionControl={form.adminActionControl || (form.control === "review" ? "review" : "auto")}
            userActionControl={form.userActionControl || (form.control === "review" ? "review" : "auto")}
            saving={saving}
            syncSnapSeq={syncSnapSeq}
            stageLegacyPulled={Boolean(form.migratedLegacy)}
            onQuickSaveAudience={quickSaveRootAudience}
            onChangeAdminControl={adminActionControl => set({ adminActionControl })}
            onChangeUserControl={userActionControl => set({ userActionControl })}
            reminders={form.reminders}
            folders={folders}
            byKey={byKey}
            triggerBadges={triggerBadges}
            stageId={0}
            catalogConditions={catalogConditions}
            catalogActions={catalogActions}
            existingTrails={existingTrails}
            currentTrailId={form._id}
            currentStages={form.stages}
            onCreateTimeoutStage={createTimeoutStage}
            onChangeInstant={instant => set({ instant })}
            onChangeReminders={updateRootReminders}
          />
        </section>

        {/* CARD 3..N: Linear Follow-up Stages */}
        {form.stages.map((stage, idx) => {
          const stageNum = idx + 3;
          const isTimeoutStage = stage.source === "previous_timeout";
          const stageLabel = triggersLabel(stage.triggers, byKey);
          const stageWorks = stage.triggers.map(k => byKey.get(k));
          const stageStartActionsAvail = getApplicableSystemActions(stageWorks, catalogActions, "stage_start");
          const stageDupWarn = isTimeoutStage
            ? []
            : describeTriggerCoverage(
                stage.triggers,
                existingTrails,
                form._id,
                [],
                byKey,
              ).filter(c => c.activeCount > 0);
          return (
            <div key={stage.id} data-outline-section={`st${stage.id}`} style={{ display: "grid", gap: "14px" }}>
              <div className={s.sectionDivider} role="separator" aria-label={`Start of Stage ${idx + 2}`}>
                <span>
                  Stage {idx + 2}{isTimeoutStage ? " — After previous stage timeout" : (stageLabel ? ` — ${stageLabel}` : "")}
                </span>
              </div>
              <section className={s.card} data-stage="followup">
                <div className={s.cardHead}>
                  <div className={s.cardTitle}>
                    <span className={s.stepNum}>{stageNum}</span>
                    <h3>
                      Stage {idx + 2}{isTimeoutStage ? " — After timeout (Grace / Follow-up)" : (stageLabel ? ` — On “${stageLabel}”` : "")}
                    </h3>
                  </div>
                  <button type="button" className={s.miniDangerBtn} onClick={() => removeStage(stage.id)}>Remove stage</button>
                </div>

                {isTimeoutStage && (
                  <div className={s.stageStartBox}>
                    <div className={s.stageStartHead}>
                      <strong>On Stage {idx + 2} Start — System Action (Optional)</strong>
                      <span className={s.stackHint}>Runs automatically the moment this stage begins (e.g. Start Deactivation Countdown)</span>
                    </div>
                    <SystemActionsEditor
                      actions={stage.onStartActions || []}
                      availableActions={stageStartActionsAvail}
                      emptyLabel="+ Add start action (e.g. Plan Deactivation Countdown)…"
                      onChange={onStartActions => updateStage(stage.id, { onStartActions })}
                    />
                  </div>
                )}

                <TrailStageBlock
                  key={`st-${stage.id}-${pullSeq}-${stagePullSeq[stage.id] || 0}`}
                  stagePrefix={`st${stage.id}`}
                  stageId={stage.id}
                  accordion={accordion}
                  stageTriggers={stage.triggers}
                  stageTriggersLabel={stageLabel}
                  depth={idx + 1}
                  showTriggerSelect={!isTimeoutStage}
                  instant={stage.instant}
                  saving={saving}
                  legacyRefreshSeq={legacyRefreshSeq}
                  syncSnapSeq={syncSnapSeq}
                  stageLegacyPulled={Boolean(stage.migratedLegacy)}
                  onApplyStageLegacy={payload => applyStageLegacyPull(stage.id, payload)}
                  onQuickSaveAudience={(who, nextMsg) => quickSaveStageAudience(stage.id, who, nextMsg)}
                  reminders={stage.reminder ? [stage.reminder] : []}
                  folders={folders}
                  byKey={byKey}
                  catalogConditions={catalogConditions}
                  catalogActions={catalogActions}
                  triggerBadges={triggerBadges}
                  existingTrails={existingTrails}
                  currentTrailId={form._id}
                  currentStages={form.stages}
                  duplicateWarningItems={stageDupWarn}
                  onCreateTimeoutStage={createTimeoutStage}
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
                  : lastStopActiveCov.length > 0
                    ? `“${lastStopActiveCov.map(c => c.triggerLabel).join(", ")}” already has an active trail (runs automatically on stop). Add a stage only if you need a separate message.`
                    : lastStops.length > 0
                      ? `Next stage pre-selects “${triggersLabel(lastStops, byKey)}” (editable)`
                      : "Add another Template or Reminder stage"}
              </span>
            </div>
            <div className={s.continueActions}>
              <button type="button" className={s.ghostBtn} disabled={!primaryKey} onClick={() => addStage("template")}>+ Template stage</button>
              <button type="button" className={s.ghostBtn} disabled={!primaryKey} onClick={() => addStage("reminder")}>+ Reminder stage</button>
            </div>
          </div>
        )}
        </>
        )}
      </div>
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
          {statusNotice && <span className={s.tplSavedTag}>{statusNotice}</span>}
          <button type="button" className={s.ghostBtn} disabled={saving || refreshing} onClick={requestClose}>Cancel</button>
          <button
            type="button"
            className={s.ghostBtn}
            disabled={!primaryKey || saving || refreshing}
            onClick={() => { void handleSaveStayOpen(); }}
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
          <button
            type="button"
            className={s.primaryBtn}
            disabled={!primaryKey || saving || refreshing}
            onClick={handleSaveClick}
          >
            {saving ? "Saving…" : "Save changes & close"}
          </button>
        </div>
      </footer>
    </div>
    {previewItem && (
      <MessagePreviewModal item={previewItem} onClose={() => setPreviewItem(null)} />
    )}
    {unsavedDialog}
  </div>;
}

type ListViewTab = "trails" | "templates" | "reminders";

type DerivedTemplateRow = {
  rowKey: string;
  cardKey: string;
  trail: TrailForm;
  trailRootLabel: string;
  stageTriggers: string[];
  triggerKey: string;
  triggerLabel: string;
  stageNum: number;
  stageIndex: number;
  audience: "client" | "admin";
  template: TemplateItem;
  scope: PackageScopeMode;
  scopeLabel: string;
  isOn: boolean;
};

type DerivedReminderRow = {
  rowKey: string;
  cardKey: string;
  trail: TrailForm;
  trailRootLabel: string;
  stageTriggers: string[];
  triggerKey: string;
  triggerLabel: string;
  stageNum: number;
  stageIndex: number;
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
  if (rem.repeatMode === "until_due") return `Every ${rem.repeatEveryDays}d (${rem.repeatPerDay}x/day) until due date`;
  if (rem.repeatMode === "limited") return `Every ${rem.repeatEveryDays}d for ${rem.repeatForDays}d (${rem.repeatPerDay}x/day)`;
  return "No repeat";
}

export function AutomatedMessagesPanel({ active }: { active: boolean }) {
  const [actionsData, setActionsData] = useState<ActionsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [trails, setTrails] = useState<TrailForm[]>([]);
  const [legacyTriggers, setLegacyTriggers] = useState<string[]>([]);
  const [editing, setEditing] = useState<{ trail: TrailForm; focus: EditFocus } | null>(null);
  const [expandedTplCards, setExpandedTplCards] = useState<Record<string, boolean>>({});
  const [expandedRemCards, setExpandedRemCards] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pendingDeleteTrail, setPendingDeleteTrail] = useState<{ trail: TrailForm; title: string } | null>(null);
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
      const trailRootLabel = trail.triggers.map(k => workLabel(k, catalog.byKey)).join(" + ") || "Saved trail";
      const collectStage = (triggers: string[], inst: InstantBlockState, stageNum: number) => {
        if (inst.audience === "off") return;
        const primaryTrig = triggers[0] || "";
        const trigLabel = triggers.map(k => workLabel(k, catalog.byKey)).join(" + ") || "Unspecified trigger";
        const cardKey = `${trail._id || "t"}::s${stageNum}`;
        const pushWho = (who: "client" | "admin", msg: SingleMsg) => {
          const list = msg.templates?.length ? msg.templates : [];
          for (const tpl of list) {
            if (!tpl.text.trim()) continue;
            out.push({
              rowKey: `${trail._id || "t"}-s${stageNum}-${who}-${tpl.id}`,
              cardKey,
              trail,
              trailRootLabel,
              stageTriggers: triggers,
              triggerKey: primaryTrig,
              triggerLabel: trigLabel,
              stageNum,
              stageIndex: stageNum - 1,
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
      const trailRootLabel = trail.triggers.map(k => workLabel(k, catalog.byKey)).join(" + ") || "Saved trail";
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
          cardKey: `${trail._id || "t"}::s${stageNum}::${primaryTrig}`,
          trail,
          trailRootLabel,
          stageTriggers: effTrigs,
          triggerKey: primaryTrig,
          triggerLabel: trigLabel,
          stageNum,
          stageIndex: stageNum - 1,
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
    if (filterTrigger && !row.stageTriggers.includes(filterTrigger)) return false;
    if (filterAudience && row.audience !== filterAudience) return false;
    if (filterChannel && row.template.channel !== filterChannel) return false;
    return true;
  }), [allTemplateRows, filterTrigger, filterScope, filterAudience, filterChannel, filterStatus]);

  const filteredReminders = useMemo(() => allReminderRows.filter(row => {
    if (filterStatus === "active" && !row.isOn) return false;
    if (filterStatus === "paused" && row.isOn) return false;
    if (filterScope && row.scope !== filterScope) return false;
    if (filterTrigger && !row.stageTriggers.includes(filterTrigger)) return false;
    if (filterAudience && row.reminder.audience !== filterAudience && row.reminder.audience !== "both") return false;
    if (filterChannel && !row.channels.includes(filterChannel)) return false;
    return true;
  }), [allReminderRows, filterTrigger, filterScope, filterAudience, filterChannel, filterStatus]);

  const templateCards = useMemo(() => {
    const map = new Map<string, {
      cardKey: string;
      triggerLabel: string;
      trail: TrailForm;
      trailRootLabel: string;
      stageNum: number;
      stageIndex: number;
      scopeLabel: string;
      isOn: boolean;
      rows: DerivedTemplateRow[];
    }>();
    for (const row of filteredTemplates) {
      const entry = map.get(row.cardKey) || {
        cardKey: row.cardKey,
        triggerLabel: row.triggerLabel,
        trail: row.trail,
        trailRootLabel: row.trailRootLabel,
        stageNum: row.stageNum,
        stageIndex: row.stageIndex,
        scopeLabel: row.scopeLabel,
        isOn: row.isOn,
        rows: [],
      };
      entry.rows.push(row);
      map.set(row.cardKey, entry);
    }
    return [...map.values()].sort((a, b) => a.triggerLabel.localeCompare(b.triggerLabel));
  }, [filteredTemplates]);

  const reminderCards = useMemo(() => {
    const map = new Map<string, {
      cardKey: string;
      triggerLabel: string;
      trail: TrailForm;
      trailRootLabel: string;
      stageNum: number;
      stageIndex: number;
      scopeLabel: string;
      isOn: boolean;
      rows: DerivedReminderRow[];
    }>();
    for (const row of filteredReminders) {
      const entry = map.get(row.cardKey) || {
        cardKey: row.cardKey,
        triggerLabel: row.triggerLabel,
        trail: row.trail,
        trailRootLabel: row.trailRootLabel,
        stageNum: row.stageNum,
        stageIndex: row.stageIndex,
        scopeLabel: row.scopeLabel,
        isOn: row.isOn,
        rows: [],
      };
      entry.rows.push(row);
      map.set(row.cardKey, entry);
    }
    return [...map.values()].sort((a, b) => a.triggerLabel.localeCompare(b.triggerLabel));
  }, [filteredReminders]);

  async function refreshTrailData(trailId?: string): Promise<{ ok: boolean; trail?: TrailForm | null; deleted?: boolean; error?: string }> {
    try {
      const [trailsRes, legacyRes] = await Promise.all([
        fetch("/api/auto-reply/action-rules/trails", { cache: "no-store" }),
        fetch("/api/auto-reply/action-rules/legacy-summary", { cache: "no-store" }).catch(() => null),
      ]);
      const [trailsJson, legacyJson] = await Promise.all([
        trailsRes.json().catch(() => null),
        legacyRes && legacyRes.ok ? legacyRes.json().catch(() => null) : Promise.resolve(null),
      ]);
      if (!trailsRes.ok) {
        return { ok: false, error: trailsJson?.error || "Could not refresh latest trails." };
      }
      const nextTrails = Array.isArray(trailsJson?.data) ? trailsJson.data.map(normalizeTrail) : [];
      setTrails(nextTrails);
      if (Array.isArray(legacyJson?.data)) {
        setLegacyTriggers(legacyJson.data.filter((k: unknown): k is string => typeof k === "string"));
      }
      if (trailId) {
        const found = nextTrails.find((t: TrailForm) => t._id === trailId) || null;
        if (!found) return { ok: true, deleted: true, trail: null };
        return { ok: true, trail: found };
      }
      return { ok: true, trail: null };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Could not refresh latest data." };
    }
  }

  async function saveTrail(form: TrailForm, opts?: { keepOpen?: boolean }): Promise<TrailForm | null> {
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
      if (!opts?.keepOpen) setEditing(null);
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
      return saved;
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Could not save automated message.");
      return null;
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
        <button type="button" className={s.primaryBtn} onClick={() => { setSaveError(""); setEditing({ trail: emptyForm(), focus: { mode: "full" } }); }}>
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
        <CapsuleSelect className={s.filterSelect} ariaLabel="Filter by trigger point" value={filterTrigger} onChange={setFilterTrigger} options={[{ value: "", label: "All trigger points" }, ...filterTriggerOptions.map(opt => ({ value: opt.key, label: opt.label }))]} />
        <CapsuleSelect className={s.filterSelect} ariaLabel="Filter by package scope" value={filterScope} onChange={value => setFilterScope(value as "" | PackageScopeMode)} options={[{ value: "", label: "All package scopes" }, ...PACKAGE_SCOPES.map(item => ({ value: item.id, label: item.label }))]} />
        <CapsuleSelect className={s.filterSelect} ariaLabel="Filter by audience" value={filterAudience} onChange={value => setFilterAudience(value as "" | "client" | "admin")} options={[{ value: "", label: "All audiences" }, { value: "client", label: "Client" }, { value: "admin", label: "Admin / Team" }]} />
        <CapsuleSelect className={s.filterSelect} ariaLabel="Filter by channel" value={filterChannel} onChange={value => setFilterChannel(value as "" | Channel)} options={[{ value: "", label: "All channels" }, { value: "whatsapp", label: "WhatsApp" }, { value: "email", label: "Email" }, { value: "both", label: "Email + WhatsApp" }]} />
        <CapsuleSelect className={s.filterSelect} ariaLabel="Filter by status" value={filterStatus} onChange={value => setFilterStatus(value as "" | "active" | "paused")} options={[{ value: "", label: "All statuses" }, { value: "active", label: "Active" }, { value: "paused", label: "Paused" }]} />
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
                    {(trail.control === "review" || trail.adminActionControl === "review" || trail.userActionControl === "review") && <span className={s.reviewBadge}>Review</span>}
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
                  <button type="button" className={s.ghostBtn} disabled={busy} onClick={() => { setSaveError(""); setEditing({ trail, focus: { mode: "full" } }); }}>
                    Edit
                  </button>
                  <DeleteIconButton
                    disabled={busy}
                    title={`Delete ${title}`}
                    ariaLabel={`Delete ${title}`}
                    onClick={() => setPendingDeleteTrail({ trail, title })}
                  />
                </div>
              </article>
            );
          })}
        </div>
      )
    ) : viewTab === "templates" ? (
      templateCards.length === 0 ? (
        <div className={s.empty}>
          <strong>No matching templates</strong>
          <span>Templates inside your saved trails appear here organized by Trigger Point.</span>
        </div>
      ) : (
        <div className={s.list}>
          {templateCards.map(card => {
            const expanded = Boolean(expandedTplCards[card.cardKey]);
            const clientCount = card.rows.filter(r => r.audience === "client").length;
            const adminCount = card.rows.filter(r => r.audience === "admin").length;
            const splitParts = [
              clientCount ? `${clientCount} Client` : "",
              adminCount ? `${adminCount} Admin` : "",
            ].filter(Boolean).join(", ");
            return (
              <article key={card.cardKey} className={s.triggerCard}>
                <div className={s.triggerCardHead}>
                  <div className={s.listMain}>
                    <div className={s.listTitleRow}>
                      <strong>{card.triggerLabel}</strong>
                      <span className={s.badge}>
                        {card.rows.length} template{card.rows.length === 1 ? "" : "s"}{splitParts ? ` (${splitParts})` : ""}
                      </span>
                      {card.scopeLabel && <span className={s.badge}>{card.scopeLabel}</span>}
                      {card.stageNum > 1 && (
                        <span className={s.badge}>From: {card.trailRootLabel} · Stage {card.stageNum}</span>
                      )}
                      <span className={s.liveTag} data-live={card.isOn}>
                        <span className={s.liveDot} aria-hidden="true" />
                        {card.isOn ? "Active" : "Paused"}
                      </span>
                    </div>
                    <p className={s.listSummary}>
                      {card.rows.slice(0, 3).map(r => `${r.template.name}${r.template.isDefault ? " ★" : ""} (${r.audience === "admin" ? "Admin" : "Client"})`).join(" · ")}
                      {card.rows.length > 3 ? ` · +${card.rows.length - 3} more` : ""}
                    </p>
                  </div>
                  <div className={s.listActions}>
                    <button
                      type="button"
                      className={s.miniBtn}
                      aria-expanded={expanded}
                      onClick={() => setExpandedTplCards(curr => ({ ...curr, [card.cardKey]: !curr[card.cardKey] }))}
                    >
                      {expanded ? "▴ Hide" : "▾ Details"}
                    </button>
                    <button
                      type="button"
                      className={s.ghostBtn}
                      onClick={() => {
                        setSaveError("");
                        setEditing({ trail: card.trail, focus: { mode: "template", stageIndex: card.stageIndex } });
                      }}
                    >
                      Edit
                    </button>
                  </div>
                </div>
                {expanded && (
                  <div className={s.triggerCardBody}>
                    {card.rows.map(row => (
                      <div key={row.rowKey} className={s.subItemRow}>
                        <div className={s.listMain}>
                          <div className={s.listTitleRow}>
                            <strong>{row.template.name}</strong>
                            {row.template.isDefault && <span className={s.defaultBadge}>★ Default</span>}
                            <span className={s.badge}>{row.audience === "admin" ? "Admin" : "Client"}</span>
                            <span className={s.badge}>{channelLabel(row.template.channel)}</span>
                          </div>
                          <p className={s.listSummary}>
                            {row.template.subject ? `${row.template.subject} — ` : ""}{row.template.text}
                          </p>
                        </div>
                        <div className={s.listActions}>
                          <button
                            type="button"
                            className={s.miniBtn}
                            onClick={() => {
                              setSaveError("");
                              setEditing({
                                trail: row.trail,
                                focus: {
                                  mode: "template",
                                  stageIndex: row.stageIndex,
                                  audience: row.audience,
                                  templateId: row.template.id,
                                },
                              });
                            }}
                          >
                            Edit
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )
    ) : (
      reminderCards.length === 0 ? (
        <div className={s.empty}>
          <strong>No matching reminders</strong>
          <span>Follow-up reminders inside your saved trails appear here organized by Trigger Point.</span>
        </div>
      ) : (
        <div className={s.list}>
          {reminderCards.map(card => {
            const expanded = Boolean(expandedRemCards[card.cardKey]);
            const firstRow = card.rows[0];
            return (
              <article key={card.cardKey} className={s.triggerCard}>
                <div className={s.triggerCardHead}>
                  <div className={s.listMain}>
                    <div className={s.listTitleRow}>
                      <strong>{card.triggerLabel}</strong>
                      <span className={s.badge}>
                        {card.rows.length} reminder{card.rows.length === 1 ? "" : "s"}
                      </span>
                      {card.scopeLabel && <span className={s.badge}>{card.scopeLabel}</span>}
                      {card.stageNum > 1 && (
                        <span className={s.badge}>From: {card.trailRootLabel} · Stage {card.stageNum}</span>
                      )}
                      <span className={s.liveTag} data-live={card.isOn}>
                        <span className={s.liveDot} aria-hidden="true" />
                        {card.isOn ? "Active" : "Paused"}
                      </span>
                    </div>
                    <p className={s.listSummary}>
                      {[
                        firstRow.timingSummary,
                        audienceShort(firstRow.reminder.audience),
                        firstRow.stopLabel ? `Stop: ${firstRow.stopLabel}` : "",
                        card.rows.length > 1 ? `+${card.rows.length - 1} more` : "",
                      ].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <div className={s.listActions}>
                    <button
                      type="button"
                      className={s.miniBtn}
                      aria-expanded={expanded}
                      onClick={() => setExpandedRemCards(curr => ({ ...curr, [card.cardKey]: !curr[card.cardKey] }))}
                    >
                      {expanded ? "▴ Hide" : "▾ Details"}
                    </button>
                    <button
                      type="button"
                      className={s.ghostBtn}
                      onClick={() => {
                        setSaveError("");
                        setEditing({ trail: card.trail, focus: { mode: "reminder", stageIndex: card.stageIndex } });
                      }}
                    >
                      Edit
                    </button>
                  </div>
                </div>
                {expanded && (
                  <div className={s.triggerCardBody}>
                    {card.rows.map(row => (
                      <div key={row.rowKey} className={s.subItemRow}>
                        <div className={s.listMain}>
                          <div className={s.listTitleRow}>
                            <strong>{row.timingSummary}</strong>
                            <span className={s.badge}>{audienceShort(row.reminder.audience)}</span>
                            {row.channels.map(ch => <span key={ch} className={s.badge}>{channelLabel(ch)}</span>)}
                          </div>
                          <p className={s.listSummary}>
                            {[row.repeatLabel, row.conditionLabel ? `Only when: ${row.conditionLabel}` : "", row.stopLabel ? `Stop: ${row.stopLabel}` : ""].filter(Boolean).join(" · ")}
                          </p>
                        </div>
                        <div className={s.listActions}>
                          <button
                            type="button"
                            className={s.miniBtn}
                            onClick={() => {
                              setSaveError("");
                              setEditing({ trail: row.trail, focus: { mode: "reminder", stageIndex: row.stageIndex } });
                            }}
                          >
                            Edit
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )
    )}

    <ConfirmDialog
      open={Boolean(pendingDeleteTrail)}
      title="Delete trail?"
      message={pendingDeleteTrail ? <>Are you sure you want to permanently delete <strong>&ldquo;{pendingDeleteTrail.title}&rdquo;</strong>? All its templates, reminders, stages, and scheduled runs will be removed and cannot be undone.</> : ""}
      confirmLabel="Delete permanently"
      busyLabel="Deleting…"
      busy={Boolean(busyId)}
      onCancel={() => setPendingDeleteTrail(null)}
      onConfirm={async () => {
        if (!pendingDeleteTrail) return;
        const target = pendingDeleteTrail.trail;
        await removeTrail(target);
        setPendingDeleteTrail(null);
      }}
    />

    {editing && (
      <FormDialog
        key={`${editing.trail._id || "new"}-${editing.focus.mode}-${editing.focus.mode !== "full" ? editing.focus.stageIndex : "all"}`}
        initial={editing.trail}
        initialFocus={editing.focus}
        existingTrails={trails}
        triggerBadges={triggerBadges}
        folders={catalog.folders}
        byKey={catalog.byKey}
        packages={catalog.packages}
        catalogConditions={catalog.conditions}
        catalogActions={catalog.systemActions}
        isLive={catalog.isLive}
        saving={saving}
        error={saveError}
        onClose={() => { if (!saving) { setSaveError(""); setEditing(null); } }}
        onSave={(form, opts) => saveTrail(form, opts)}
        onRefresh={refreshTrailData}
      />
    )}
  </section>;
}
