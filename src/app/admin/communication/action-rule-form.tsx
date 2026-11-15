"use client";
import { useRef, useState } from "react";
import { formatIndiaDateTime } from "@/lib/date-time";
import s from "./communication.module.css";
import { InfoTip } from "./reminder-info";

/**
 * Single-page top-to-bottom form for action-based Templates & Reminders (Reminder.md §3-4).
 * Supports Customer, Admin, or Both (saving Both as two independent rules), Only-if conditions,
 * package/billing scope, and due-date relative timing.
 */
export type TimingRef = "after_action" | "before_due" | "on_due" | "after_due";
export type RuleStep = {
  timingRef: TimingRef;
  days: number;
  channel: "whatsapp" | "email" | "both";
  subject: string;
  text: string;
};
export type RuleCondition = "anytime" | "unpaid" | "paid";
export type RuleScopeKind = "all" | "monthly" | "one_time" | "package";
export type DoAlsoType = "change_lead_stage" | "add_lead_note" | "stop_reminders";
export type DoAlsoStep = { type: DoAlsoType; stage?: string; note?: string };
export type RuleOrigin = "new" | "migrated" | "migrated_edited";
export const originLabel = (origin?: RuleOrigin) =>
  origin === "migrated_edited" ? "Migrated · Edited" : origin === "migrated" ? "Migrated" : "New";
export type ActionRuleRecord = {
  _id?: string;
  id?: string;
  kind: "template" | "reminder";
  action: string;
  actionId?: string;
  audience: "customer" | "admin";
  condition: RuleCondition;
  scope: { kind: RuleScopeKind; packageSlug?: string };
  steps: RuleStep[];
  repeat: { times: number; everyDays: number; perDay?: number };
  stopOn: string[];
  doAlso?: DoAlsoStep[];
  control: "auto" | "review" | "off";
  enabled: boolean;
  origin?: RuleOrigin;
  migratedFrom?: string;
  pairId?: string;
  createdAt?: string;
  updatedAt?: string;
  revision?: number;
};

export type ConditionOption = { key: string; label: string };
export type BuiltInInfo = {
  templates: { event: string; label: string; app: "portal" | "website"; panel?: "email-templates" | "broadcast" }[];
  reminders: { panel: string; label: string }[];
};
export type FormActionOption = {
  id: string;
  title: string;
  what?: string;
  when?: string;
  category?: string;
  method: string;
  endpoint: string;
  triggerKey?: string | null;
  supportsScope?: boolean;
  conditions?: ConditionOption[];
  builtIn?: BuiltInInfo;
  rules?: ActionRuleRecord[];
};

type AudienceChoice = "customer" | "admin" | "both";
type TargetConfig = {
  steps: RuleStep[];
  repeatTimes: number;
  repeatEvery: number;
  stopOn: string[];
};

const STOP_CHOICES = [
  { key: "payment.received", label: "Payment received" },
  { key: "plan.started", label: "Plan started" },
  { key: "project.completed", label: "Project completed" },
];
const LEAD_STAGES = [
  { value: "Contacted", label: "Neutral" },
  { value: "Positive", label: "Positive" },
  { value: "NotNow", label: "Not Now" },
  { value: "Negative", label: "Negative" },
  { value: "Unhappy", label: "Unhappy" },
  { value: "Dead", label: "Dead" },
  { value: "Wrong", label: "Wrong" },
];
const PLACEHOLDERS = [
  "{{name}}", "{{amount}}", "{{dueDate}}", "{{invoiceLink}}", "{{projectLink}}",
  "{{packageLink}}", "{{portalLink}}", "{{project}}", "{{planName}}", "{{duration}}",
  "{{email}}", "{{phone}}",
];

const PAY_CONDS: ConditionOption[] = [
  { key: "anytime", label: "Anytime (always)" },
  { key: "unpaid", label: "Only if payment is pending (unpaid)" },
  { key: "paid", label: "Only if already paid" },
];
const FALLBACK_ACTIONS: FormActionOption[] = [
  { id: "S_INV", title: "Invoice created (amount > 0)", category: "Orders & invoices", what: "Runs when a billed invoice is created.", method: "SYSTEM", endpoint: "signal: invoice.created", triggerKey: "invoice.created", supportsScope: true, conditions: PAY_CONDS },
  { id: "S_PAY", title: "Payment received (full)", category: "Orders & invoices", what: "Runs when an invoice is marked fully paid.", method: "SYSTEM", endpoint: "signal: payment.received", triggerKey: "payment.received", supportsScope: false, conditions: [{ key: "anytime", label: "Anytime (always)" }] },
  { id: "S_PRJ", title: "Project completed (100% progress)", category: "Projects", what: "Runs when project progress reaches 100%.", method: "SYSTEM", endpoint: "signal: project.completed", triggerKey: "project.completed", supportsScope: true, conditions: PAY_CONDS },
  { id: "S_PLN", title: "Plan started", category: "Plans & packages", what: "Runs when a plan or package starts.", method: "SYSTEM", endpoint: "signal: plan.started", triggerKey: "plan.started", supportsScope: true, conditions: PAY_CONDS },
];

const blankStep = (timingRef: TimingRef = "after_action", days = 0): RuleStep => ({
  timingRef,
  days,
  channel: "whatsapp",
  subject: "",
  text: "",
});

const blankTarget = (isReminder = false): TargetConfig => ({
  steps: [blankStep(isReminder ? "before_due" : "after_action", isReminder ? 3 : 0)],
  repeatTimes: 0,
  repeatEvery: 2,
  stopOn: [],
});

function timingSummary(step: RuleStep, isReminder: boolean) {
  if (!isReminder) return "now";
  if (step.timingRef === "on_due") return "on due date";
  if (step.timingRef === "before_due") return `${step.days} day${step.days === 1 ? "" : "s"} before due date`;
  if (step.timingRef === "after_due") return `${step.days} day${step.days === 1 ? "" : "s"} after due date`;
  return step.days ? `${step.days} day${step.days === 1 ? "" : "s"} after action` : "right away";
}

export function ActionRuleForm({
  actions = [],
  initialActionId = "",
  editingRule = null,
  packages = [],
  onSaved,
  onBack,
}: {
  actions?: FormActionOption[];
  initialActionId?: string;
  editingRule?: ActionRuleRecord | null;
  packages?: { slug: string; name: string }[];
  onSaved?: () => void;
  onBack: () => void;
}) {
  const actionOptions = actions.length ? actions : FALLBACK_ACTIONS;
  const targetActionId = editingRule?.actionId || initialActionId;
  const initialRow = (targetActionId ? actionOptions.find(a => a.id === targetActionId) : undefined)
    || (editingRule?.action ? actionOptions.find(a => a.triggerKey === editingRule.action) : undefined);
  const editingRuleId = editingRule?._id || editingRule?.id || null;
  const initialPartner = editingRule?.pairId && initialRow?.rules
    ? initialRow.rules.find(r => (r._id || r.id) !== editingRuleId && r.pairId === editingRule.pairId && r.audience !== editingRule.audience) || null
    : null;
  const toTargetCfg = (rule: ActionRuleRecord): TargetConfig => ({
    steps: rule.steps.length ? rule.steps.map(st => ({ ...st })) : [blankStep()],
    repeatTimes: rule.repeat?.times || 0,
    repeatEvery: rule.repeat?.everyDays || 2,
    stopOn: [...(rule.stopOn || [])],
  });
  const initCustomerRule = editingRule?.audience === "customer" ? editingRule : initialPartner?.audience === "customer" ? initialPartner : null;
  const initAdminRule = editingRule?.audience === "admin" ? editingRule : initialPartner?.audience === "admin" ? initialPartner : null;
  const initUniversal = Boolean(
    initCustomerRule && initAdminRule && editingRule?.kind === "reminder" &&
    initAdminRule.steps.length > 1 &&
    initAdminRule.steps.every(st => st.channel === initAdminRule.steps[0].channel && st.subject === initAdminRule.steps[0].subject && st.text === initAdminRule.steps[0].text),
  );

  const [editingId, setEditingId] = useState<string | null>(editingRuleId);
  const [companionId, setCompanionId] = useState<string | null>(initialPartner?._id || initialPartner?.id || null);
  const [editingAudience, setEditingAudience] = useState<"customer" | "admin">(editingRule?.audience || "customer");
  const [activePairId, setActivePairId] = useState<string>(editingRule?.pairId || "");
  const [kind, setKind] = useState<"template" | "reminder">(editingRule?.kind || "template");
  const [selectedActionId, setSelectedActionId] = useState<string>(initialRow?.id || "");
  const [readyOnly, setReadyOnly] = useState<boolean>(initialRow ? !!initialRow.triggerKey : true);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [actionSearch, setActionSearch] = useState<string>("");
  const [audienceChoice, setAudienceChoice] = useState<AudienceChoice>(initialPartner ? "both" : (editingRule?.audience || "customer"));
  const [condition, setCondition] = useState<RuleCondition>(editingRule?.condition || "anytime");
  const [scopeKind, setScopeKind] = useState<RuleScopeKind>(editingRule?.scope?.kind || "all");
  const [packageSlug, setPackageSlug] = useState<string>(editingRule?.scope?.packageSlug || packages[0]?.slug || "digital-growth-package");
  const [doAlso, setDoAlso] = useState<DoAlsoStep[]>(editingRule?.doAlso ? editingRule.doAlso.map(d => ({ ...d })) : []);
  const [control, setControl] = useState<"auto" | "review" | "off">(editingRule?.control || "auto");
  const initRepeat = initCustomerRule?.repeat || editingRule?.repeat;
  const [repeatTimes, setRepeatTimes] = useState<number>(initRepeat?.times || 0);
  const [repeatEvery, setRepeatEvery] = useState<number>(initRepeat?.everyDays || 2);
  const [repeatPerDay, setRepeatPerDay] = useState<number>(initRepeat?.perDay || 1);
  const [adminSyncMode, setAdminSyncMode] = useState<"separate" | "universal">(initUniversal ? "universal" : "separate");
  const [showPlaceholders, setShowPlaceholders] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [lastFocused, setLastFocused] = useState<{ who: "customer" | "admin"; idx: number }>({ who: initCustomerRule ? "customer" : (editingRule?.audience || "customer"), idx: 0 });
  const textareaRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});

  const [customerCfg, setCustomerCfg] = useState<TargetConfig>(initCustomerRule ? toTargetCfg(initCustomerRule) : blankTarget(false));
  const [adminCfg, setAdminCfg] = useState<TargetConfig>(initAdminRule ? toTargetCfg(initAdminRule) : blankTarget(false));

  const currentRow = actionOptions.find(a => a.id === selectedActionId);
  const existingRules = currentRow?.rules || [];
  const existingCustomerRem = existingRules.find(r => r.kind === "reminder" && r.audience === "customer");
  const targets: ("customer" | "admin")[] = audienceChoice === "both" ? ["customer", "admin"] : [audienceChoice];
  const isRem = kind === "reminder";
  const isAdminUniversal = audienceChoice === "both" && isRem && adminSyncMode === "universal";

  const resolvedAdminCfg = (): TargetConfig => {
    if (!isAdminUniversal) return adminCfg;
    const base = adminCfg.steps[0] || blankStep();
    return {
      steps: customerCfg.steps.map(st => ({
        timingRef: st.timingRef,
        days: st.days,
        channel: base.channel,
        subject: base.subject,
        text: base.text,
      })),
      repeatTimes,
      repeatEvery,
      stopOn: [...customerCfg.stopOn],
    };
  };

  function copyTimingsFrom(source: { steps: { timingRef: TimingRef; days: number; channel: RuleStep["channel"] }[]; repeatTimes: number; repeatEvery: number; stopOn: string[] }) {
    setAdminSyncMode("separate");
    setAdminCfg(prev => ({
      steps: source.steps.map((st, idx) => ({
        timingRef: st.timingRef,
        days: st.days,
        channel: prev.steps[idx]?.channel || st.channel,
        subject: prev.steps[idx]?.subject || "",
        text: prev.steps[idx]?.text || "",
      })),
      repeatTimes,
      repeatEvery,
      stopOn: [...source.stopOn],
    }));
  }
  const availableConditions = currentRow?.conditions?.length ? currentRow.conditions : [{ key: "anytime", label: "Anytime (always)" }];
  const supportsScope = !!currentRow?.supportsScope;
  const actionCategories = [...new Set(actionOptions.map(a => a.category || "Other"))].sort();
  const filteredActions = actionOptions.filter(a => {
    if (a.id === selectedActionId) return true;
    if (readyOnly && !a.triggerKey) return false;
    if (categoryFilter !== "all" && (a.category || "Other") !== categoryFilter) return false;
    const q = actionSearch.trim().toLowerCase();
    if (!q) return true;
    return `${a.id} ${a.title} ${a.what || ""} ${a.when || ""} ${a.endpoint} ${a.category || ""}`.toLowerCase().includes(q);
  });
  const groupedActions = actionCategories
    .map(cat => ({ category: cat, items: filteredActions.filter(a => (a.category || "Other") === cat) }))
    .filter(g => g.items.length > 0);

  function selectAction(nextId: string) {
    setSelectedActionId(nextId);
    setEditingId(null);
    setCompanionId(null);
    setActivePairId("");
    const nextRow = actionOptions.find(a => a.id === nextId);
    const nextConds = (nextRow?.conditions || [{ key: "anytime" }]).map(c => c.key);
    if (!nextConds.includes(condition)) setCondition("anytime");
    if (!nextRow?.supportsScope) setScopeKind("all");
  }

  function loadExistingRule(rule: ActionRuleRecord) {
    const rid = rule._id || rule.id || null;
    const partner = rule.pairId
      ? existingRules.find(r => (r._id || r.id) !== rid && r.pairId === rule.pairId && r.audience !== rule.audience) || null
      : null;
    setEditingId(rid);
    setCompanionId(partner?._id || partner?.id || null);
    setEditingAudience(rule.audience);
    setActivePairId(rule.pairId || "");
    setKind(rule.kind);
    setAudienceChoice(partner ? "both" : rule.audience);
    setCondition(rule.condition || "anytime");
    setScopeKind(rule.scope?.kind || "all");
    setPackageSlug(rule.scope?.packageSlug || "digital-growth-package");
    setDoAlso(rule.doAlso ? rule.doAlso.map(d => ({ ...d })) : []);
    setControl(rule.control || "auto");
    setAdminSyncMode("separate");
    const cRule = rule.audience === "customer" ? rule : partner?.audience === "customer" ? partner : null;
    const aRule = rule.audience === "admin" ? rule : partner?.audience === "admin" ? partner : null;
    if (cRule) setCustomerCfg(toTargetCfg(cRule));
    if (aRule) setAdminCfg(toTargetCfg(aRule));
    setError("");
    setNotice("");
  }

  function switchKind(next: "template" | "reminder") {
    setKind(next);
    if (next === "reminder") {
      if (customerCfg.steps[0]?.timingRef === "after_action" && customerCfg.steps[0]?.days === 0) {
        setCustomerCfg(c => ({ ...c, steps: [{ ...c.steps[0], timingRef: "before_due", days: 3 }, ...c.steps.slice(1)] }));
      }
      if (adminCfg.steps[0]?.timingRef === "after_action" && adminCfg.steps[0]?.days === 0) {
        setAdminCfg(c => ({ ...c, steps: [{ ...c.steps[0], timingRef: "before_due", days: 3 }, ...c.steps.slice(1)] }));
      }
    }
  }

  function updateTarget(who: "customer" | "admin", updater: (prev: TargetConfig) => TargetConfig) {
    if (who === "customer") setCustomerCfg(updater);
    else setAdminCfg(updater);
  }

  function applyToTextarea(
    who: "customer" | "admin",
    idx: number,
    transform: (text: string, start: number, end: number) => { text: string; cursorStart: number; cursorEnd?: number },
  ) {
    const targetCfg = who === "customer" ? customerCfg : adminCfg;
    const safeIdx = Math.min(idx, targetCfg.steps.length - 1);
    const key = `${who}:${safeIdx}`;
    const el = textareaRefs.current[key];
    const currentText = targetCfg.steps[safeIdx]?.text ?? "";
    const start = typeof el?.selectionStart === "number" ? el.selectionStart : currentText.length;
    const end = typeof el?.selectionEnd === "number" ? el.selectionEnd : currentText.length;
    const res = transform(currentText, start, end);
    const nextText = res.text.slice(0, 10000);
    const nextStart = Math.min(res.cursorStart, nextText.length);
    const nextEnd = Math.min(res.cursorEnd ?? res.cursorStart, nextText.length);

    updateTarget(who, prev => ({
      ...prev,
      steps: prev.steps.map((st, i) => (i === safeIdx ? { ...st, text: nextText } : st)),
    }));
    requestAnimationFrame(() => {
      const targetEl = textareaRefs.current[key];
      if (targetEl) {
        targetEl.focus();
        targetEl.setSelectionRange(nextStart, nextEnd);
      }
    });
  }

  function insertPlaceholder(ph: string) {
    const who = audienceChoice === "both" ? lastFocused.who : audienceChoice;
    applyToTextarea(who, lastFocused.idx, (text, start, end) => ({
      text: text.slice(0, start) + ph + text.slice(end),
      cursorStart: start + ph.length,
    }));
  }

  function formatStepText(who: "customer" | "admin", idx: number, mode: "bold" | "italic" | "list") {
    applyToTextarea(who, idx, (text, start, end) => {
      const selected = text.slice(start, end);
      if (mode === "list") {
        const prefix = start > 0 && text[start - 1] !== "\n" ? "\n- " : "- ";
        const body = selected ? selected.replace(/\n/g, "\n- ") : "";
        return { text: text.slice(0, start) + prefix + body + text.slice(end), cursorStart: start + prefix.length + body.length };
      }
      const mark = mode === "bold" ? "**" : "_";
      const inner = selected || (mode === "bold" ? "bold text" : "italic text");
      const wrapped = `${mark}${inner}${mark}`;
      return {
        text: text.slice(0, start) + wrapped + text.slice(end),
        cursorStart: selected ? start + wrapped.length : start + mark.length,
        cursorEnd: selected ? start + wrapped.length : start + mark.length + inner.length,
      };
    });
  }

  const targetValid = (cfg: TargetConfig) => {
    const stepsOk = cfg.steps.every(st => st.text.trim() && (st.channel === "whatsapp" || st.subject.trim()));
    const stopOk = !isRem || cfg.stopOn.length > 0;
    const totalOk = !isRem || cfg.steps.length + repeatTimes * repeatPerDay <= 60;
    return stepsOk && stopOk && totalOk;
  };

  const doAlsoValid = doAlso.every(d => d.type !== "add_lead_note" || (d.note || "").trim().length > 0);
  const canSave = !!selectedActionId && !!currentRow?.triggerKey && !saving && doAlsoValid && targets.every(who => targetValid(who === "customer" ? customerCfg : resolvedAdminCfg()));

  async function save(controlOverride: "auto" | "review" | "off") {
    if (!currentRow?.triggerKey) return;
    setSaving(true);
    setError("");
    setNotice("");
    const actionKey = currentRow.triggerKey;
    const scope = supportsScope ? { kind: scopeKind, ...(scopeKind === "package" ? { packageSlug } : {}) } : { kind: "all" };

    const nextPairId = audienceChoice === "both"
      ? (activePairId || (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `pair-${Date.now()}`))
      : "";
    const buildPayload = (who: "customer" | "admin") => {
      const cfg = who === "customer" ? customerCfg : resolvedAdminCfg();
      return {
        kind,
        action: actionKey,
        actionId: currentRow.id,
        audience: who,
        pairId: nextPairId,
        condition,
        scope,
        steps: cfg.steps.map(st => ({
          timingRef: isRem ? st.timingRef : "after_action",
          days: isRem && st.timingRef !== "on_due" ? st.days : 0,
          channel: st.channel,
          subject: st.channel === "whatsapp" ? "" : st.subject.trim(),
          text: st.text.trim(),
        })),
        repeat: isRem && repeatTimes > 0 ? { times: repeatTimes, everyDays: repeatEvery, perDay: repeatPerDay } : { times: 0, everyDays: 2, perDay: 1 },
        stopOn: isRem ? cfg.stopOn : [],
        doAlso: who === "customer" || targets.length === 1 ? doAlso.map(d => ({ type: d.type, ...(d.type === "change_lead_stage" ? { stage: d.stage || "Positive" } : {}), ...(d.type === "add_lead_note" ? { note: (d.note || "").trim() } : {}) })) : [],
        control: controlOverride,
        enabled: controlOverride !== "off",
      };
    };

    try {
      const saveTarget = async (who: "customer" | "admin") => {
        let targetId: string | null = null;
        if (editingId) {
          if (targets.length === 1 || who === editingAudience) {
            targetId = editingId;
          } else if (companionId) {
            targetId = companionId;
          } else {
            const companion = existingRules.find(r =>
              (r._id || r.id) !== editingId &&
              r.audience === who &&
              r.kind === kind &&
              (r.condition || "anytime") === condition &&
              (r.scope?.kind || "all") === scopeKind &&
              (scopeKind !== "package" || (r.scope?.packageSlug || "") === packageSlug),
            );
            targetId = companion?._id || companion?.id || null;
          }
        }
        const url = targetId ? `/api/auto-reply/action-rules/${targetId}` : "/api/auto-reply/action-rules";
        const method = targetId ? "PUT" : "POST";
        const response = await fetch(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildPayload(who)),
          cache: "no-store",
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || result.message || `Could not ${targetId ? "update" : "save"} rule.`);
      };
      for (const who of targets) {
        await saveTarget(who);
      }
      onSaved?.();
      onBack();
    } catch (failure) {
      const msg = failure instanceof Error ? failure.message : "Could not save rule.";
      setError(msg.includes("Unknown Auto Reply action") ? "UI form ready — backend rule API is being wired in the next step." : msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section aria-label="Message and reminder rule form" className={s.workSection}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <button type="button" className={s.link} onClick={onBack}>← Back to Actions</button>
        {editingId && (
          <span style={{ fontSize: 12, color: "var(--pn-muted, var(--muted))" }}>
            Origin: <strong>{originLabel(editingRule?.origin)}</strong>
            {editingRule?.createdAt ? ` · Created ${formatIndiaDateTime(editingRule.createdAt)}` : ""}
            {editingRule?.updatedAt ? ` · Edited ${formatIndiaDateTime(editingRule.updatedAt)}` : ""}
            {" · Saves as a new version"}
          </span>
        )}
      </div>

      <div className={s.workToolbar}>
        <h3>{editingId ? `Edit ${kind} — ${currentRow?.title || selectedActionId}` : "Add message or reminder"}</h3>
      </div>

      {error && <p style={{ color: "crimson", margin: 0, fontSize: 13 }} role="alert">{error}</p>}
      {notice && <p style={{ color: "var(--brand-link)", margin: 0, fontSize: 13 }} role="status">{notice}</p>}

      {existingRules.length > 0 && (
        <div className={s.facts}>
          <div className={s.factRow}>
            <dt>Existing rules</dt>
            <dd style={{ gap: 8 }}>
              {existingRules.map((rule, idx) => {
                const rid = rule._id || rule.id || String(idx);
                return (
                  <button key={rid} type="button" onClick={() => loadExistingRule(rule)}>
                    {rule.audience === "admin" ? "Admin" : "Customer"} · {rule.kind} ({rule.control})
                  </button>
                );
              })}
            </dd>
          </div>
        </div>
      )}

      {/* 1-4: Core choices */}
      <dl className={s.facts}>
        <div className={s.factRow}>
          <dt>1. Type</dt>
          <dd>
            <label style={{ cursor: "pointer" }}>
              <input type="radio" name="ruleKind" checked={kind === "template"} onChange={() => switchKind("template")} /> Template (one-time)
            </label>
            <label style={{ cursor: "pointer" }}>
              <input type="radio" name="ruleKind" checked={kind === "reminder"} onChange={() => switchKind("reminder")} /> Reminder (follow-up)
            </label>
          </dd>
        </div>

        <div className={s.factRow}>
          <dt>2. Action</dt>
          <dd style={{ display: "grid", gap: 8, width: "100%" }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
              <select aria-label="Filter action category" value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
                <option value="all">All categories</option>
                {actionCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
              </select>
              <input type="search" aria-label="Search action" placeholder="Search by name, description, ID or endpoint…"
                value={actionSearch} onChange={e => setActionSearch(e.target.value)} style={{ flex: "1 1 220px", minWidth: 180 }} />
              <label style={{ fontSize: 12, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5 }}>
                <input type="checkbox" checked={readyOnly} onChange={e => setReadyOnly(e.target.checked)} /> Ready for rules only
              </label>
            </div>

            <select value={selectedActionId} onChange={e => selectAction(e.target.value)}>
              <option value="">Choose an action ({filteredActions.length} matching)…</option>
              {groupedActions.map(group => (
                <optgroup key={group.category} label={group.category}>
                  {group.items.map(item => (
                    <option key={item.id} value={item.id}>
                      {item.id} — {item.title}{item.rules?.length ? ` (${item.rules.length} rule${item.rules.length > 1 ? "s" : ""})` : ""}{!item.triggerKey ? " [no signal]" : ""}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>

            {currentRow && (
              <div style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--surface)", fontSize: 12, display: "grid", gap: 3 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                  <strong>{currentRow.category || "Action"} · {currentRow.id}</strong>
                  <span style={{ color: currentRow.triggerKey ? "var(--brand-link)" : "crimson", fontWeight: 600 }}>
                    {currentRow.triggerKey ? `Ready (${currentRow.triggerKey})` : "Signal not wired yet — select a Ready action"}
                  </span>
                </div>
                {currentRow.what && <div>{currentRow.what}</div>}
                {currentRow.when && <div style={{ color: "var(--pn-muted, var(--muted))" }}>{currentRow.when}</div>}
                <div style={{ fontFamily: "monospace", color: "var(--pn-muted, var(--muted))" }}>{currentRow.method} {currentRow.endpoint}</div>
                {((currentRow.builtIn?.templates.length ?? 0) > 0 || (currentRow.builtIn?.reminders.length ?? 0) > 0) && (
                  <div style={{ marginTop: 4, padding: "6px 8px", borderRadius: 6, background: "color-mix(in srgb, #b26a00 12%, transparent)", color: "inherit" }}>
                    <strong>Built-in message already active:</strong>{" "}
                    {[
                      ...(currentRow.builtIn?.templates.map(t => t.label) ?? []),
                      ...(currentRow.builtIn?.reminders.map(r => r.label) ?? []),
                    ].join(", ")}. Adding a rule here sends alongside it.
                  </div>
                )}
              </div>
            )}
          </dd>
        </div>

        <div className={s.factRow}>
          <dt>3. Who receives</dt>
          <dd>
            <label style={{ cursor: "pointer" }}><input type="radio" name="audience" checked={audienceChoice === "customer"} onChange={() => setAudienceChoice("customer")} /> Customer</label>
            <label style={{ cursor: "pointer" }}><input type="radio" name="audience" checked={audienceChoice === "admin"} onChange={() => setAudienceChoice("admin")} /> Admin / Team</label>
            <label style={{ cursor: "pointer" }}><input type="radio" name="audience" checked={audienceChoice === "both"} onChange={() => setAudienceChoice("both")} /> Both (different messages)</label>
            {audienceChoice === "both" && (
              <span style={{ display: "block", width: "100%", fontSize: 12, color: "var(--pn-muted, var(--muted))", marginTop: 4 }}>
                Saves 2 separate rules (one for Customer, one for Admin) so each can be edited or paused independently.
              </span>
            )}
          </dd>
        </div>

        <div className={s.factRow}>
          <dt>4. Condition <InfoTip label="Only if"><p>Conditions available for the chosen action.</p></InfoTip></dt>
          <dd>
            <select value={condition} onChange={e => setCondition(e.target.value as RuleCondition)}>
              {availableConditions.map(opt => (
                <option key={opt.key} value={opt.key}>{opt.label}</option>
              ))}
            </select>
          </dd>
        </div>

        {supportsScope && (
          <div className={s.factRow}>
            <dt>Applies to <InfoTip label="Scope"><p>Apply to all packages/plans, only monthly plans, only one-time packages, or one specific package.</p></InfoTip></dt>
            <dd style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
              <select value={scopeKind} onChange={e => setScopeKind(e.target.value as RuleScopeKind)}>
                <option value="all">All packages &amp; plans</option>
                <option value="monthly">Monthly plans only</option>
                <option value="one_time">One-time packages only</option>
                <option value="package">Specific package…</option>
              </select>
              {scopeKind === "package" && (
                packages.length > 0 ? (
                  <select value={packageSlug} onChange={e => setPackageSlug(e.target.value)}>
                    {packages.map(pkg => <option key={pkg.slug} value={pkg.slug}>{pkg.name} ({pkg.slug})</option>)}
                  </select>
                ) : (
                  <input value={packageSlug} onChange={e => setPackageSlug(e.target.value)} placeholder="e.g. digital-growth-package" />
                )
              )}
            </dd>
          </div>
        )}
      </dl>

      {/* Placeholders helper */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <strong style={{ fontSize: 14 }}>5. Messages &amp; timing</strong>
        <button type="button" className={s.link} onClick={() => setShowPlaceholders(v => !v)}>
          {showPlaceholders ? "Hide placeholders" : "(i) Show placeholders"}
        </button>
      </div>
      {showPlaceholders && (
        <div className={s.facts} style={{ padding: 12, display: "flex", flexWrap: "wrap", gap: 8 }}>
          {PLACEHOLDERS.map(ph => (
            <button key={ph} type="button" onMouseDown={e => e.preventDefault()} onClick={() => insertPlaceholder(ph)}
              style={{ padding: "2px 8px", borderRadius: 6, border: "1px solid var(--line)", background: "var(--surface)", fontFamily: "monospace", fontSize: 12, cursor: "pointer" }}>
              {ph}
            </button>
          ))}
        </div>
      )}

      {/* Audience message/rule blocks */}
      {targets.map(who => {
        const cfg = who === "customer" ? customerCfg : adminCfg;
        const label = who === "customer" ? "Message for Customer" : "Message for Admin / Team";
        const adminUniversal = who === "admin" && isAdminUniversal;
        const visibleSteps = adminUniversal ? [cfg.steps[0] || blankStep()] : cfg.steps;
        return (
          <dl key={who} className={s.facts}>
            <div className={s.factRow}>
              <dt>{label}</dt>
              <dd style={{ display: "grid", gap: 12, width: "100%" }}>
                {who === "admin" && isRem && (audienceChoice === "both" || existingCustomerRem) && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--surface)", fontSize: 12 }}>
                    {audienceChoice === "both" && (
                      <>
                        <label style={{ cursor: "pointer" }}>
                          <input type="radio" name="adminSync" checked={adminSyncMode === "separate"} onChange={() => setAdminSyncMode("separate")} /> Separate message per timing
                        </label>
                        <label style={{ cursor: "pointer" }}>
                          <input type="radio" name="adminSync" checked={adminSyncMode === "universal"} onChange={() => setAdminSyncMode("universal")} /> 1 universal message (same timings as Customer)
                        </label>
                        {adminSyncMode === "separate" && (
                          <button type="button" onClick={() => copyTimingsFrom(customerCfg)}>Copy timings from Customer</button>
                        )}
                      </>
                    )}
                    {audienceChoice === "admin" && existingCustomerRem && (
                      <button type="button" onClick={() => copyTimingsFrom({
                        steps: existingCustomerRem.steps,
                        repeatTimes: existingCustomerRem.repeat?.times || 0,
                        repeatEvery: existingCustomerRem.repeat?.everyDays || 2,
                        stopOn: existingCustomerRem.stopOn || [],
                      })}>
                        Copy timings from existing Customer rule ({existingCustomerRem.steps.length} steps)
                      </button>
                    )}
                  </div>
                )}

                {visibleSteps.map((step, idx) => (
                  <div key={idx} style={{ display: "grid", gap: 8, padding: 10, border: "1px solid var(--line)", borderRadius: 8 }}>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", justifyContent: "space-between" }}>
                      <strong style={{ fontSize: 12 }}>{adminUniversal ? "Universal Admin message (all Customer timings)" : isRem ? `Message ${idx + 1}` : "Message"}</strong>
                      {isRem && !adminUniversal && cfg.steps.length > 1 && (
                        <button type="button" className={s.link} onClick={() => updateTarget(who, p => ({ ...p, steps: p.steps.filter((_, i) => i !== idx) }))}>
                          Remove
                        </button>
                      )}
                    </div>

                    <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
                      {isRem && !adminUniversal && (
                        <>
                          {step.timingRef !== "on_due" && (
                            <input type="number" min={0} max={365} value={step.days} style={{ width: 65 }}
                              onChange={e => updateTarget(who, p => ({ ...p, steps: p.steps.map((st, i) => i === idx ? { ...st, days: Math.max(0, Number(e.target.value || 0)) } : st) }))} />
                          )}
                          <select value={step.timingRef}
                            onChange={e => updateTarget(who, p => ({ ...p, steps: p.steps.map((st, i) => i === idx ? { ...st, timingRef: e.target.value as TimingRef } : st) }))}>
                            <option value="before_due">days before due date</option>
                            <option value="on_due">on due date</option>
                            <option value="after_due">days after due date</option>
                            <option value="after_action">days after action</option>
                          </select>
                        </>
                      )}

                      <select value={step.channel}
                        onChange={e => updateTarget(who, p => ({ ...p, steps: p.steps.map((st, i) => i === idx ? { ...st, channel: e.target.value as RuleStep["channel"] } : st) }))}>
                        <option value="whatsapp">WhatsApp only</option>
                        <option value="email">Email only</option>
                        <option value="both">Both</option>
                      </select>
                    </div>

                    {step.channel !== "whatsapp" && (
                      <input type="text" placeholder="Email subject" value={step.subject} maxLength={300}
                        onChange={e => updateTarget(who, p => ({ ...p, steps: p.steps.map((st, i) => i === idx ? { ...st, subject: e.target.value } : st) }))} />
                    )}

                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }} role="toolbar" aria-label="Text formatting">
                      <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => formatStepText(who, idx, "bold")}
                        style={{ padding: "2px 8px", borderRadius: 6, border: "1px solid var(--line)", background: "var(--surface)", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
                        title="Bold (works in Email & WhatsApp)">
                        B
                      </button>
                      <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => formatStepText(who, idx, "italic")}
                        style={{ padding: "2px 8px", borderRadius: 6, border: "1px solid var(--line)", background: "var(--surface)", fontSize: 12, fontStyle: "italic", cursor: "pointer" }}
                        title="Italic (works in Email & WhatsApp)">
                        I
                      </button>
                      <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => formatStepText(who, idx, "list")}
                        style={{ padding: "2px 8px", borderRadius: 6, border: "1px solid var(--line)", background: "var(--surface)", fontSize: 12, cursor: "pointer" }}
                        title="Bullet list">
                        • List
                      </button>
                    </div>

                    <textarea rows={3} placeholder={`Write ${who} message…`} value={step.text} maxLength={10000}
                      ref={el => { textareaRefs.current[`${who}:${idx}`] = el; }}
                      onFocus={() => setLastFocused({ who, idx })}
                      onChange={e => updateTarget(who, p => ({ ...p, steps: p.steps.map((st, i) => i === idx ? { ...st, text: e.target.value } : st) }))} />
                  </div>
                ))}

                {isRem && !adminUniversal && cfg.steps.length < 10 && (
                  <div>
                    <button type="button" onClick={() => updateTarget(who, p => ({ ...p, steps: [...p.steps, blankStep("after_due", 2)] }))}>
                      + Add another follow-up for {who === "customer" ? "Customer" : "Admin"}
                    </button>
                  </div>
                )}
              </dd>
            </div>

            {isRem && adminUniversal && (
              <div className={s.factRow}>
                <dt>Timing &amp; Stop</dt>
                <dd style={{ fontSize: 12, color: "var(--pn-muted, var(--muted))" }}>
                  Uses the same {customerCfg.steps.length} timing step{customerCfg.steps.length === 1 ? "" : "s"}, repeat, and stop conditions as Customer.
                </dd>
              </div>
            )}

            {isRem && !adminUniversal && (
              <div className={s.factRow}>
                <dt>Stop when ({who}) <InfoTip label="Stop when"><p>Stops immediately when the stop action happens for the same record, and also re-checks the database right before every send.</p></InfoTip></dt>
                <dd style={{ display: "grid", gap: 4 }}>
                  {STOP_CHOICES.map(item => (
                    <label key={item.key} style={{ cursor: "pointer" }}>
                      <input type="checkbox" checked={cfg.stopOn.includes(item.key)}
                        onChange={() => updateTarget(who, p => ({ ...p, stopOn: p.stopOn.includes(item.key) ? p.stopOn.filter(k => k !== item.key) : [...p.stopOn, item.key] }))} /> {item.label}
                    </label>
                  ))}
                  {cfg.stopOn.length === 0 && <span style={{ color: "crimson", fontSize: 12 }}>Select at least one stop action.</span>}
                </dd>
              </div>
            )}
          </dl>
        );
      })}

      {/* Shared Repeat, Do also, Control & Preview */}
      <dl className={s.facts}>
        {isRem && (
          <div className={s.factRow}>
            <dt>Repeat (last message) <InfoTip label="Repeat"><p>Repeats the last message for {targets.length > 1 ? "both Customer and Admin" : targets[0] === "admin" ? "Admin" : "Customer"} until a stop action happens.</p></InfoTip></dt>
            <dd style={{ display: "grid", gap: 6 }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
                <label>Repeat <input type="number" min={0} max={60} value={repeatTimes} style={{ width: 64 }}
                  onChange={e => setRepeatTimes(Math.min(60, Math.max(0, Number(e.target.value || 0))))} /> times</label>
                {repeatTimes > 0 && (
                  <>
                    <label>every <input type="number" min={1} max={90} value={repeatEvery} style={{ width: 60 }}
                      onChange={e => setRepeatEvery(Math.min(90, Math.max(1, Number(e.target.value || 1))))} /> days</label>
                    <label>
                      <select value={repeatPerDay} onChange={e => setRepeatPerDay(Number(e.target.value || 1))}>
                        <option value={1}>1 time a day</option>
                        <option value={2}>2 times a day (every 12h)</option>
                        <option value={3}>3 times a day (every 8h)</option>
                        <option value={4}>4 times a day (every 6h)</option>
                      </select>
                    </label>
                  </>
                )}
              </div>
              {repeatTimes > 0 && (
                <span style={{ fontSize: 12, color: "var(--pn-muted, var(--muted))" }}>
                  Repeats the last message {repeatTimes} time{repeatTimes === 1 ? "" : "s"}, every {repeatEvery} day{repeatEvery === 1 ? "" : "s"}, {repeatPerDay}x/day ({repeatTimes * repeatPerDay} extra send{repeatTimes * repeatPerDay === 1 ? "" : "s"} over {repeatTimes * repeatEvery} day{repeatTimes * repeatEvery === 1 ? "" : "s"}{targets.length > 1 ? " — applies to both Customer & Admin" : ""}).
                </span>
              )}
              {targets.some(w => (w === "customer" ? customerCfg : resolvedAdminCfg()).steps.length + repeatTimes * repeatPerDay > 60) && (
                <span style={{ color: "crimson", fontSize: 12 }}>Total messages (steps + repeats) cannot exceed 60 per receiver.</span>
              )}
            </dd>
          </div>
        )}
        <div className={s.factRow}>
          <dt>6. Do also (optional) <InfoTip label="Do also"><p>Fixed automatic steps that run right after the first message goes out (never touches Matured/Won leads&apos; stage).</p></InfoTip></dt>
          <dd style={{ display: "grid", gap: 8 }}>
            {doAlso.map((step, idx) => (
              <div key={idx} style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                <select value={step.type} onChange={e => {
                  const next = e.target.value as DoAlsoType;
                  setDoAlso(prev => prev.map((it, i) => i === idx ? { type: next, ...(next === "change_lead_stage" ? { stage: "Positive" } : next === "add_lead_note" ? { note: "" } : {}) } : it));
                }}>
                  <option value="change_lead_stage">Change lead stage</option>
                  <option value="add_lead_note">Add follow-up note</option>
                  <option value="stop_reminders">Stop other scheduled reminders</option>
                </select>
                {step.type === "change_lead_stage" && (
                  <select value={step.stage || "Positive"} onChange={e => setDoAlso(prev => prev.map((it, i) => i === idx ? { ...it, stage: e.target.value } : it))}>
                    {LEAD_STAGES.map(st => <option key={st.value} value={st.value}>{st.label}</option>)}
                  </select>
                )}
                {step.type === "add_lead_note" && (
                  <input type="text" placeholder="Note (e.g. Auto-replied to {name})" value={step.note || ""} maxLength={500} style={{ minWidth: 240 }}
                    onChange={e => setDoAlso(prev => prev.map((it, i) => i === idx ? { ...it, note: e.target.value } : it))} />
                )}
                <button type="button" className={s.link} onClick={() => setDoAlso(prev => prev.filter((_, i) => i !== idx))}>Remove</button>
              </div>
            ))}
            {doAlso.length < 5 && (
              <div>
                <button type="button" onClick={() => setDoAlso(prev => [...prev, { type: "change_lead_stage", stage: "Positive" }])}>
                  + Add automatic step
                </button>
              </div>
            )}
          </dd>
        </div>

        <div className={s.factRow}>
          <dt>7. Control <InfoTip label="Control"><p>Auto sends automatically. Review holds messages in Email Review until you click Send. Off saves without sending.</p></InfoTip></dt>
          <dd style={{ display: "grid", gap: 6 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
              <label style={{ cursor: "pointer" }}><input type="radio" name="control" checked={control === "auto"} onChange={() => setControl("auto")} /> Auto</label>
              <label style={{ cursor: "pointer" }}><input type="radio" name="control" checked={control === "review"} onChange={() => setControl("review")} /> Review (approve before sending)</label>
              <label style={{ cursor: "pointer" }}><input type="radio" name="control" checked={control === "off"} onChange={() => setControl("off")} /> Off</label>
            </div>
            {control === "review" && (
              <span style={{ fontSize: 12, color: "var(--pn-muted, var(--muted))" }}>
                Messages will wait in Communication → Review &amp; delivery → Review until you click Send.
              </span>
            )}
          </dd>
        </div>

        <div className={s.factRow}>
          <dt>Summary Preview</dt>
          <dd style={{ display: "grid", gap: 4 }}>
            {targets.map(who => {
              const cfg = who === "customer" ? customerCfg : resolvedAdminCfg();
              const first = cfg.steps[0];
              const when = timingSummary(first, isRem);
              const condText = condition === "unpaid" ? "if unpaid" : condition === "paid" ? "if paid" : "";
              const scopeText = scopeKind === "package" ? packageSlug : scopeKind === "monthly" ? "monthly" : scopeKind === "one_time" ? "one-time" : "";
              return (
                <div key={who}>
                  <strong>{currentRow?.title || "Choose an action"}</strong> → {who === "admin" ? "Admin" : "Customer"} · {when}
                  {condText ? ` · ${condText}` : ""}{scopeText ? ` · ${scopeText}` : ""}
                  {isRem && repeatTimes > 0 ? ` · repeat ${repeatTimes}x every ${repeatEvery}d${repeatPerDay > 1 ? ` (${repeatPerDay}x/day)` : ""}` : ""}
                  {isRem && cfg.stopOn.length ? ` · stop when ${cfg.stopOn.map(k => STOP_CHOICES.find(c => c.key === k)?.label || k).join(", ")}` : ""}
                  {(who === "customer" || targets.length === 1) && doAlso.length > 0 ? ` · then ${doAlso.map(d => d.type === "change_lead_stage" ? `stage → ${LEAD_STAGES.find(l => l.value === d.stage)?.label || d.stage}` : d.type === "add_lead_note" ? "add note" : "stop reminders").join(", ")}` : ""}
                  {` · ${control === "auto" ? "Auto" : control === "review" ? "Review" : "Off"}`}
                </div>
              );
            })}
          </dd>
        </div>
      </dl>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        <button type="button" disabled={!canSave} onClick={() => void save("off")}>
          {saving ? "Saving…" : "Save as draft (Off)"}
        </button>
        <button type="button" className="admin-button" disabled={!canSave} onClick={() => void save(control === "review" ? "review" : "auto")}>
          {saving ? "Saving…" : control === "review" ? "Save in Review mode" : "Save & Activate"}
        </button>
      </div>
    </section>
  );
}
