import type {
  ActionPackageOption,
  ActionsData,
  ConditionCatalogItem,
  SystemActionCatalogItem,
  TriggerGroup,
} from "./action-rule-helpers";

/**
 * Unified options & live read-only catalog builder for the Automated message system UI.
 * Loads real Trigger Points / Works and real Packages from GET /api/auto-reply/actions.
 */

export type Unit = "days" | "hours";
export type Channel = "whatsapp" | "email" | "both";
export type TimingPos = "before" | "on" | "after";
export type BaseDate = "trigger_date" | "due_date" | "grace_end_date" | "expiry_date" | "deadline_date";
export type InstantAudience = "off" | "client" | "admin" | "both";
export type ReminderAudience = "client" | "admin" | "both";
export type MessageMode = "separate" | "universal";
export type RepeatMode = "off" | "permanent" | "limited" | "until_due";
export type PackageScopeMode = "all" | "monthly" | "onetime" | "include" | "exclude";

export const MAX_CHAIN_DEPTH = 6;

export type WorkItem = {
  key: string;
  label: string;
  folder: string;
  when: string;
  entityType: string;
  supportsScope: boolean;
  supportsProgress: boolean;
  supportsLimit: boolean;
  defaultStopOn: string[];
  conditions: string[];
  baseDates?: BaseDate[];
  systemActions?: string[] | null;
};

export type WorkFolder = {
  folder: string;
  items: WorkItem[];
};

function triggerToWork(t: TriggerGroup): WorkItem {
  return {
    key: t.triggerKey,
    label: t.label,
    folder: t.folder || "Other works",
    when: t.when || "",
    entityType: t.entityType || "none",
    supportsScope: Boolean(t.supportsScope),
    supportsProgress: Boolean(t.supportsProgress),
    supportsLimit: Boolean(t.supportsLimit),
    defaultStopOn: Array.isArray(t.defaultStopOn) ? t.defaultStopOn : [],
    conditions: Array.isArray(t.conditions) && t.conditions.length
      ? t.conditions.map(c => c.key)
      : ["anytime"],
    baseDates: Array.isArray(t.baseDates) && t.baseDates.length
      ? (t.baseDates.filter((d): d is BaseDate => ["trigger_date", "due_date", "grace_end_date", "expiry_date", "deadline_date"].includes(d)))
      : ["trigger_date"],
    systemActions: Array.isArray(t.systemActions) ? t.systemActions : null,
  };
}

export function buildWorkCatalog(data: ActionsData | null): {
  folders: WorkFolder[];
  byKey: Map<string, WorkItem>;
  packages: ActionPackageOption[];
  conditions: ConditionCatalogItem[];
  systemActions: SystemActionCatalogItem[];
  isLive: boolean;
} {
  const isLive = Boolean(data?.triggers && data.triggers.length > 0);
  const raw: WorkItem[] = isLive ? data!.triggers!.map(triggerToWork) : [];
  const byKey = new Map<string, WorkItem>();
  for (const item of raw) byKey.set(item.key, item);

  const folderMap = new Map<string, WorkItem[]>();
  const preferredOrder = data?.folders?.length ? data.folders : [];
  for (const name of preferredOrder) folderMap.set(name, []);
  for (const item of raw) {
    const list = folderMap.get(item.folder) ?? [];
    list.push(item);
    folderMap.set(item.folder, list);
  }

  const folders: WorkFolder[] = [];
  for (const [folder, items] of folderMap.entries()) {
    if (items.length > 0) folders.push({ folder, items });
  }

  const conditions: ConditionCatalogItem[] = Array.isArray(data?.conditions) && data.conditions.length > 0
    ? data.conditions
    : CONDITIONS.map(c => ({
        key: c.id,
        ruleKey: c.id === "any" ? "anytime" : c.id,
        label: c.label,
        group: "General",
        entityTypes: c.id === "any" ? ["*"] : ["invoice", "order"],
        usableIn: ["reminder", "escalation"] as ("reminder" | "escalation")[],
        ...("value" in c && c.value ? { valueConfig: { min: 0, max: c.max, defaultVal: c.defaultVal } } : {}),
      }));

  const systemActions: SystemActionCatalogItem[] = Array.isArray(data?.systemActions)
    ? data.systemActions
    : [];

  return {
    folders,
    byKey,
    packages: data?.packages ?? [],
    conditions,
    systemActions,
    isLive,
  };
}

export function getApplicableBaseDates(
  workOrList: WorkItem | (WorkItem | undefined)[] | null | undefined,
): { id: BaseDate; label: string }[] {
  const list = Array.isArray(workOrList)
    ? workOrList.filter((w): w is WorkItem => Boolean(w))
    : (workOrList ? [workOrList] : []);
  if (!list.length) return BASE_DATES;
  const allowed = new Set<BaseDate>(["trigger_date"]);
  for (const w of list) {
    for (const d of w.baseDates || ["trigger_date"]) allowed.add(d);
  }
  return BASE_DATES.filter(item => allowed.has(item.id));
}

export function getApplicableConditions(
  workOrList: WorkItem | (WorkItem | undefined)[] | null | undefined,
  catalogConditions: ConditionCatalogItem[],
  mode: "reminder" | "escalation" = "reminder",
): ConditionCatalogItem[] {
  const list = Array.isArray(workOrList)
    ? workOrList.filter((w): w is WorkItem => Boolean(w))
    : (workOrList ? [workOrList] : []);
  const entityTypes = new Set(list.map(w => w.entityType || "none"));
  const hasProgress = list.some(w => w.supportsProgress);
  const hasLimit = list.some(w => w.supportsLimit);
  const triggerCondKeys = new Set<string>(["anytime", "any"]);
  for (const w of list) {
    for (const c of w.conditions || []) triggerCondKeys.add(c);
  }

  return catalogConditions.filter(item => {
    if (!item.usableIn.includes(mode)) return false;
    if (item.key === "not_stopped") return mode === "escalation";
    if (item.requiresFeature === "progress") return hasProgress;
    if (item.requiresFeature === "limit") return hasLimit;
    if (item.key === "any" || item.ruleKey === "anytime") return true;
    if (list.length > 0 && !triggerCondKeys.has(item.ruleKey || item.key) && !triggerCondKeys.has(item.key)) {
      return false;
    }
    if (item.entityTypes.includes("*")) return true;
    return item.entityTypes.some(et => entityTypes.has(et));
  });
}

const PAYMENT_AUTO_PAUSE_TRIGGERS = new Set(["invoice.created", "order.upi_pending", "plan.payment_rejected"]);

export function getApplicableSystemActions(
  workOrList: WorkItem | (WorkItem | undefined)[] | null | undefined,
  catalogActions: SystemActionCatalogItem[],
  mode: "escalation" | "stage_start" = "escalation",
): SystemActionCatalogItem[] {
  const list = Array.isArray(workOrList)
    ? workOrList.filter((w): w is WorkItem => Boolean(w))
    : (workOrList ? [workOrList] : []);
  const entityTypes = new Set(list.map(w => w.entityType || "none"));
  const isPaymentOnlyTrigger = list.length > 0 && list.every(w => PAYMENT_AUTO_PAUSE_TRIGGERS.has(w.key));
  const hasExplicitActionList = list.length > 0 && list.every(w => Array.isArray(w.systemActions) && w.systemActions.length > 0);
  const allowedActionKeys = new Set<string>();
  if (hasExplicitActionList) {
    for (const w of list) {
      for (const a of w.systemActions || []) allowedActionKeys.add(a);
    }
  }

  return catalogActions.filter(item => {
    if (!item.usableIn.includes(mode)) return false;
    // Unpaid plans auto-pause via core billing; hide redundant plan.pause on payment triggers.
    if (isPaymentOnlyTrigger && item.key === "plan.pause") return false;
    if (hasExplicitActionList) return allowedActionKeys.has(item.key);
    if (item.entityTypes.includes("*")) return true;
    return item.entityTypes.some(et => entityTypes.has(et));
  });
}

export const PACKAGE_SCOPES: { id: PackageScopeMode; label: string }[] = [
  { id: "all", label: "All packages & plans" },
  { id: "monthly", label: "Monthly packages & recurring plans" },
  { id: "onetime", label: "One-time packages & plans" },
  { id: "include", label: "Include specific packages / plans…" },
  { id: "exclude", label: "Exclude specific packages / plans…" },
];

export const BASE_DATES: { id: BaseDate; label: string }[] = [
  { id: "trigger_date", label: "Start trigger date" },
  { id: "due_date", label: "Invoice / Payment due date" },
  { id: "grace_end_date", label: "Grace end date (Pause / Expiry)" },
  { id: "expiry_date", label: "Package / Plan expiry date" },
  { id: "deadline_date", label: "Project deadline" },
];

export const CONDITIONS = [
  { id: "any", label: "No extra condition (always run)" },
  { id: "unpaid", label: "Payment is still unpaid" },
  { id: "pending_approval", label: "UPI submitted — waiting for admin approval" },
  { id: "installment_due", label: "Installment is due" },
  { id: "upload_pending", label: "Client data upload is pending" },
  { id: "progress_min", label: "Project progress is at least (%)", value: true, defaultVal: 50, max: 100 },
  { id: "limit_min", label: "Portal upload limit remaining is at least", value: true, defaultVal: 1, max: 1000 },
  { id: "limit_max", label: "Portal upload limit remaining is at most", value: true, defaultVal: 2, max: 1000 },
] as const;

export const PLACEHOLDERS: { token: string; label: string }[] = [
  { token: "{{name}}", label: "Client name" },
  { token: "{{package}}", label: "Package / Plan" },
  { token: "{{project}}", label: "Project name" },
  { token: "{{amount}}", label: "Amount" },
  { token: "{{dueDate}}", label: "Due date" },
  { token: "{{graceEndDate}}", label: "Grace end date" },
  { token: "{{graceDays}}", label: "Grace days" },
  { token: "{{progress}}", label: "Progress %" },
  { token: "{{remainingLimit}}", label: "Upload limit left" },
  { token: "{{deactivationDays}}", label: "Deactivation days left" },
  { token: "{{deactivationDate}}", label: "Deactivation date" },
  { token: "{{invoiceLink}}", label: "Invoice link" },
  { token: "{{portalLink}}", label: "Portal link" },
  { token: "{{planLink}}", label: "Plan link" },
];

const DUE_DATE_TRIGGERS = new Set(["invoice.created", "plan.started", "plan.purchased"]);
const FAST_REVIEW_TRIGGERS = new Set([
  "order.upi_pending",
  "comment.posted",
  "package.start_requested",
  "reservation.start_requested",
]);

export function defaultReminderTiming(triggerKey?: string): {
  countDaysFrom: BaseDate;
  pos: TimingPos;
  amount: number;
  unit: Unit;
} {
  if (triggerKey === "reservation.created") {
    return { countDaysFrom: "due_date", pos: "before", amount: 1, unit: "days" };
  }
  if (triggerKey && DUE_DATE_TRIGGERS.has(triggerKey)) {
    return { countDaysFrom: "due_date", pos: "before", amount: 3, unit: "days" };
  }
  if (triggerKey && FAST_REVIEW_TRIGGERS.has(triggerKey)) {
    return { countDaysFrom: "trigger_date", pos: "after", amount: 2, unit: "hours" };
  }
  return { countDaysFrom: "trigger_date", pos: "after", amount: 1, unit: "days" };
}

export function timingPositionLabel(pos: TimingPos, baseDate: BaseDate): string {
  if (baseDate === "trigger_date") {
    if (pos === "on") return "immediately (on trigger)";
    return pos === "after" ? "after trigger" : "before trigger";
  }
  const target = baseDate === "grace_end_date"
    ? "grace end date"
    : baseDate === "expiry_date"
      ? "expiry date"
      : baseDate === "deadline_date"
        ? "project deadline"
        : "due date";
  if (pos === "before") return `before ${target}`;
  if (pos === "on") return `on ${target}`;
  return `after ${target}`;
}
