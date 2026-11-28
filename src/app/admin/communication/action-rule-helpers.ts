import type { ActionRuleRecord, BuiltInInfo, FormActionOption } from "./action-rule-form";

export type ActionSurface = "Admin" | "Client" | "Website" | "System";

export type TriggerOrigin = {
  id: string;
  title: string;
  surface: ActionSurface;
  method: string;
  endpoint: string;
};

export type TriggerGroup = {
  triggerKey: string;
  label: string;
  folder?: string;
  when?: string;
  entityType?: string;
  supportsScope?: boolean;
  supportsProgress?: boolean;
  supportsLimit?: boolean;
  canStop?: boolean;
  defaultStopOn?: string[];
  conditions?: { key: string; label: string }[];
  baseDates?: string[];
  systemActions?: string[] | null;
  origins: TriggerOrigin[];
  builtIn?: BuiltInInfo;
  rules?: ActionRuleRecord[];
};

export type ConditionCatalogItem = {
  key: string;
  ruleKey?: string;
  label: string;
  group: string;
  description?: string;
  entityTypes: string[];
  requiresFeature?: "progress" | "limit";
  usableIn: ("reminder" | "escalation")[];
  valueConfig?: { min: number; max: number; defaultVal: number; unit?: string };
};

export type SystemActionControlOption = {
  value: string;
  label: string;
};

export type SystemActionControlDef = {
  key: string;
  label: string;
  type: "number" | "select" | "boolean" | "text";
  defaultVal: number | string | boolean;
  min?: number;
  max?: number;
  unit?: string;
  maxLength?: number;
  placeholder?: string;
  options?: SystemActionControlOption[];
};

export type SystemActionCatalogItem = {
  key: string;
  label: string;
  group: string;
  description?: string;
  entityTypes: string[];
  emitsTrigger?: string;
  usableIn: ("escalation" | "stage_start")[];
  controls: SystemActionControlDef[];
};

export type ActionRow = {
  id: string;
  title: string;
  what: string;
  when: string;
  method: string;
  endpoint: string;
  note: string;
  surface: ActionSurface;
  category: string;
  archived: boolean;
  deleted: boolean;
  changed: boolean;
  triggerKey?: string | null;
  supportsScope?: boolean;
  conditions?: { key: string; label: string }[];
  builtIn?: BuiltInInfo;
  rules?: ActionRuleRecord[];
};

export type ActionCategory = { name: string; meaning: string };
export type ActionPackageOption = { slug: string; name: string };
export type ActionsData = {
  actions: ActionRow[];
  triggers?: TriggerGroup[];
  folders?: string[];
  stopChoices?: { key: string; label: string }[];
  surfaces: ActionSurface[];
  categories: ActionCategory[];
  packages?: ActionPackageOption[];
  conditions?: ConditionCatalogItem[];
  systemActions?: SystemActionCatalogItem[];
};

export function triggersToFormOptions(triggers: TriggerGroup[]): FormActionOption[] {
  return triggers.map(t => ({
    id: t.triggerKey,
    title: t.label,
    what: t.origins.length
      ? `Combined actions (${t.origins.length}): ${t.origins.map(o => `${o.surface} (${o.id}: ${o.title})`).join(", ")}`
      : `System work group: ${t.label}`,
    when: t.when || "",
    category: t.folder || "Business triggers",
    method: "GROUP",
    endpoint: t.triggerKey,
    triggerKey: t.triggerKey,
    supportsScope: !!t.supportsScope,
    supportsProgress: !!t.supportsProgress,
    supportsLimit: !!t.supportsLimit,
    defaultStopOn: t.defaultStopOn || [],
    conditions: t.conditions,
    builtIn: t.builtIn,
    rules: t.rules,
    isTriggerGroup: true,
    origins: t.origins,
  }));
}

export function ruleStatusLabel(rule: ActionRuleRecord) {
  if (!rule.enabled || rule.control === "off") return "Off (paused)";
  return rule.control === "review" ? "Review (holds in Review & delivery)" : "Auto (sends automatically)";
}

export function rulePreviewText(rule: ActionRuleRecord) {
  const raw = (rule.steps?.[0]?.text || "").replace(/\s+/g, " ").trim();
  return raw.length > 90 ? `${raw.slice(0, 90)}…` : raw;
}

export function ruleSummaryLine(rule: ActionRuleRecord) {
  const who = rule.audience === "admin" ? "To Admin" : "To Customer";
  const scope = rule.scope?.kind === "package" && rule.scope.packageSlug ? ` · ${rule.scope.packageSlug}`
    : rule.scope?.kind === "monthly" ? " · Monthly"
      : rule.scope?.kind === "one_time" ? " · One-time"
        : rule.scope?.kind === "offer_payment" ? " · Offer payment" : "";
  const cond = rule.condition === "unpaid" ? " · If unpaid"
    : rule.condition === "paid" ? " · If paid"
      : rule.condition === "installment_due" ? " · If installment due"
        : rule.condition === "upload_pending" ? " · If upload pending" : "";
  const prog = (rule.minProgress ?? 0) > 0 ? ` · Progress >= ${rule.minProgress}%` : "";
  const lim = rule.maxRemainingLimit !== null && rule.maxRemainingLimit !== undefined ? ` · Limit <= ${rule.maxRemainingLimit}` : "";
  const origins = rule.originFilter?.length ? ` · Only ${rule.originFilter.join(", ")}` : "";
  const timings = (rule.steps || []).map(st => {
    if (rule.kind === "template") return "immediately";
    const unit = st.unit === "hours" ? "h" : "d";
    const val = st.unit === "hours" ? (st.hours ?? 0) : (st.days ?? 0);
    if (st.timingRef === "on_due") return "on due date";
    if (st.timingRef === "before_due") return `${val}${unit} before due`;
    if (st.timingRef === "after_due") return `${val}${unit} after due`;
    return val ? `after ${val}${unit}` : "immediately";
  }).join(", ");
  const perDayText = (rule.repeat?.perDay || 1) > 1 ? ` (${rule.repeat?.perDay}x/day)` : "";
  const repeat = rule.kind === "reminder" && rule.repeat?.times ? ` · repeat ${rule.repeat.times}x every ${rule.repeat.everyDays}d${perDayText}` : "";
  const stop = rule.kind === "reminder" && rule.stopOn?.length ? ` · stops on ${rule.stopOn.join(", ")}` : "";
  return `${who}${scope}${cond}${prog}${lim}${origins} · ${timings || "immediately"}${repeat}${stop}`;
}

/** Groups Customer+Admin rules that share a non-empty `pairId` into one visual row (Customer first). */
export function groupRulesByPair<T extends ActionRuleRecord>(rules: T[]): T[][] {
  const groups: T[][] = [];
  const byPair = new Map<string, T[]>();
  for (const rule of rules) {
    const pid = (rule.pairId || "").trim();
    if (!pid) {
      groups.push([rule]);
      continue;
    }
    const existing = byPair.get(pid);
    if (existing) existing.push(rule);
    else {
      const bucket = [rule];
      byPair.set(pid, bucket);
      groups.push(bucket);
    }
  }
  for (const bucket of groups) {
    if (bucket.length > 1) {
      bucket.sort((a, b) => (a.audience === "customer" ? 0 : 1) - (b.audience === "customer" ? 0 : 1));
    }
  }
  return groups;
}

export async function setActionRuleEnabled(id: string, enabled: boolean): Promise<ActionRuleRecord | null> {
  const response = await fetch(`/api/auto-reply/action-rules/${id}/enabled`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled }),
    cache: "no-store",
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || result.message || "Could not update rule.");
  return (result.data as ActionRuleRecord) || null;
}

export async function switchActionRuleToAuto(rule: ActionRuleRecord): Promise<ActionRuleRecord | null> {
  const id = rule._id || rule.id;
  if (!id) throw new Error("Rule ID is missing.");
  const response = await fetch(`/api/auto-reply/action-rules/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...rule, actionId: "", control: "auto", enabled: true }),
    cache: "no-store",
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || result.message || "Could not switch rule to Auto.");
  return (result.data as ActionRuleRecord) || null;
}

export async function deleteActionRule(id: string): Promise<ActionRuleRecord | null> {
  const response = await fetch(`/api/auto-reply/action-rules/${id}/delete`, {
    method: "POST",
    cache: "no-store",
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || result.message || "Could not delete rule.");
  return (result.data as ActionRuleRecord) || null;
}

function mapActionRules(data: ActionsData, transform: (rules: ActionRuleRecord[]) => ActionRuleRecord[]): ActionsData {
  return {
    ...data,
    actions: data.actions.map(row => (row.rules ? { ...row, rules: transform(row.rules) } : row)),
    ...(data.triggers ? { triggers: data.triggers.map(t => (t.rules ? { ...t, rules: transform(t.rules) } : t)) } : {}),
  };
}

/** Updates one rule across both actions and triggers in local state without re-fetching /actions. */
export function patchActionRuleInData(data: ActionsData | null, updated: ActionRuleRecord): ActionsData | null {
  if (!data) return data;
  const uid = updated._id || updated.id;
  if (!uid) return data;
  return mapActionRules(data, rules => rules.map(r => ((r._id || r.id) === uid ? { ...r, ...updated } : r)));
}

/** Removes one deleted rule across both actions and triggers in local state. */
export function removeActionRuleFromData(data: ActionsData | null, id: string): ActionsData | null {
  if (!data || !id) return data;
  return mapActionRules(data, rules => rules.filter(r => (r._id || r.id) !== id));
}

export type EnrollConfirmFn = (options: {
  title: string;
  message: string;
  confirmLabel: string;
  variant: "primary";
}) => Promise<boolean>;

export async function enrollPendingActionRule(id: string, confirmFn?: EnrollConfirmFn): Promise<string> {
  const previewRes = await fetch(`/api/auto-reply/action-rules/${id}/enroll-pending`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dryRun: true }),
    cache: "no-store",
  });
  const previewData = await previewRes.json().catch(() => ({}));
  if (!previewRes.ok) throw new Error(previewData.error || previewData.message || "Could not preview pending invoices.");
  const preview = previewData.data || {};
  const count = Number(preview.count || 0);
  if (count === 0) return "No pending unpaid invoices left to enroll for this rule.";
  const sampleText = Array.isArray(preview.samples) && preview.samples.length
    ? `\nExamples:\n${preview.samples.map((s: { customer: string; amount: number }) => `• ${s.customer} (₹${Number(s.amount || 0).toLocaleString("en-IN")})`).join("\n")}`
    : "";
  const ok = confirmFn
    ? await confirmFn({
        title: "Enroll pending invoices?",
        message: `Enroll ${count} pending unpaid invoice(s) into this reminder rule?${sampleText}\n\nOnly the latest due/overdue reminder will be sent (no burst of older steps).`,
        confirmLabel: "Enroll invoices",
        variant: "primary",
      })
    : true;
  if (!ok) {
    return "";
  }
  const applyRes = await fetch(`/api/auto-reply/action-rules/${id}/enroll-pending`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dryRun: false }),
    cache: "no-store",
  });
  const applyData = await applyRes.json().catch(() => ({}));
  if (!applyRes.ok) throw new Error(applyData.error || applyData.message || "Could not enroll pending invoices.");
  const applied = applyData.data || {};
  return `Enrolled ${Number(applied.enrolled || 0)} pending unpaid invoice(s).`;
}
