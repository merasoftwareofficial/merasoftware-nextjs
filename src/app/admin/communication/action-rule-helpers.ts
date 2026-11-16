import type { ActionRuleRecord, BuiltInInfo } from "./action-rule-form";

export type ActionSurface = "Admin" | "Client" | "Website" | "System";

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
  surfaces: ActionSurface[];
  categories: ActionCategory[];
  packages?: ActionPackageOption[];
};

export function ruleStatusLabel(rule: ActionRuleRecord) {
  return !rule.enabled || rule.control === "off" ? "Off" : rule.control === "review" ? "Review" : "Auto";
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
  const cond = rule.condition === "unpaid" ? " · If unpaid" : rule.condition === "paid" ? " · If paid" : "";
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
  return `${who}${scope}${cond} · ${timings || "immediately"}${repeat}${stop}`;
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

export async function setActionRuleEnabled(id: string, enabled: boolean) {
  const response = await fetch(`/api/auto-reply/action-rules/${id}/enabled`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled }),
    cache: "no-store",
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || result.message || "Could not update rule.");
}

export async function deleteActionRule(id: string) {
  const response = await fetch(`/api/auto-reply/action-rules/${id}/delete`, {
    method: "POST",
    cache: "no-store",
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || result.message || "Could not delete rule.");
}

export async function enrollPendingActionRule(id: string): Promise<string> {
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
  if (!window.confirm(`Enroll ${count} pending unpaid invoice(s) into this reminder rule?${sampleText}\n\nOnly the latest due/overdue reminder will be sent (no burst of older steps).`)) {
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
