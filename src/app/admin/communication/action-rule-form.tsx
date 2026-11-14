"use client";
import { useState } from "react";
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
  repeat: { times: number; everyDays: number };
  stopOn: string[];
  control: "auto" | "off";
  enabled: boolean;
  revision?: number;
};

export type FormActionOption = {
  id: string;
  title: string;
  method: string;
  endpoint: string;
  triggerKey?: string | null;
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
const PLACEHOLDERS = ["{name}", "{amount}", "{dueDate}", "{invoiceLink}", "{project}", "{planName}", "{duration}"];

const FALLBACK_ACTIONS: FormActionOption[] = [
  { id: "S_INV", title: "Invoice created (amount > 0)", method: "SYSTEM", endpoint: "signal: invoice.created", triggerKey: "invoice.created" },
  { id: "S_PAY", title: "Payment received (full)", method: "SYSTEM", endpoint: "signal: payment.received", triggerKey: "payment.received" },
  { id: "S_PRJ", title: "Project completed (100% progress)", method: "SYSTEM", endpoint: "signal: project.completed", triggerKey: "project.completed" },
  { id: "S_PLN", title: "Plan started", method: "SYSTEM", endpoint: "signal: plan.started", triggerKey: "plan.started" },
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
  const initialRow = actionOptions.find(a => a.id === (editingRule?.actionId || initialActionId) || (editingRule?.action && a.triggerKey === editingRule.action));

  const [editingId, setEditingId] = useState<string | null>(editingRule?._id || editingRule?.id || null);
  const [kind, setKind] = useState<"template" | "reminder">(editingRule?.kind || "template");
  const [selectedActionId, setSelectedActionId] = useState<string>(initialRow?.id || "");
  const [audienceChoice, setAudienceChoice] = useState<AudienceChoice>(editingRule?.audience || "customer");
  const [condition, setCondition] = useState<RuleCondition>(editingRule?.condition || "anytime");
  const [scopeKind, setScopeKind] = useState<RuleScopeKind>(editingRule?.scope?.kind || "all");
  const [packageSlug, setPackageSlug] = useState<string>(editingRule?.scope?.packageSlug || packages[0]?.slug || "digital-growth-package");
  const [control, setControl] = useState<"auto" | "off">(editingRule?.control || "auto");
  const [showPlaceholders, setShowPlaceholders] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [lastFocused, setLastFocused] = useState<{ who: "customer" | "admin"; idx: number }>({ who: editingRule?.audience || "customer", idx: 0 });

  const initialTargetCfg: TargetConfig = editingRule
    ? {
        steps: editingRule.steps.length ? editingRule.steps.map(st => ({ ...st })) : [blankStep()],
        repeatTimes: editingRule.repeat?.times || 0,
        repeatEvery: editingRule.repeat?.everyDays || 2,
        stopOn: [...(editingRule.stopOn || [])],
      }
    : blankTarget(false);

  const [customerCfg, setCustomerCfg] = useState<TargetConfig>(editingRule?.audience === "admin" ? blankTarget(false) : initialTargetCfg);
  const [adminCfg, setAdminCfg] = useState<TargetConfig>(editingRule?.audience === "admin" ? initialTargetCfg : blankTarget(false));

  const currentRow = actionOptions.find(a => a.id === selectedActionId);
  const existingRules = currentRow?.rules || [];
  const targets: ("customer" | "admin")[] = audienceChoice === "both" ? ["customer", "admin"] : [audienceChoice];
  const isRem = kind === "reminder";

  function loadExistingRule(rule: ActionRuleRecord) {
    setEditingId(rule._id || rule.id || null);
    setKind(rule.kind);
    setAudienceChoice(rule.audience);
    setCondition(rule.condition || "anytime");
    setScopeKind(rule.scope?.kind || "all");
    setPackageSlug(rule.scope?.packageSlug || "digital-growth-package");
    setControl(rule.control || "auto");
    const cfg: TargetConfig = {
      steps: rule.steps.length ? rule.steps.map(st => ({ ...st })) : [blankStep()],
      repeatTimes: rule.repeat?.times || 0,
      repeatEvery: rule.repeat?.everyDays || 2,
      stopOn: [...(rule.stopOn || [])],
    };
    if (rule.audience === "admin") setAdminCfg(cfg);
    else setCustomerCfg(cfg);
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

  function insertPlaceholder(ph: string) {
    const who = audienceChoice === "both" ? lastFocused.who : audienceChoice;
    updateTarget(who, prev => {
      const idx = Math.min(lastFocused.idx, prev.steps.length - 1);
      return {
        ...prev,
        steps: prev.steps.map((st, i) => (i === idx ? { ...st, text: (st.text ? `${st.text} ` : "") + ph } : st)),
      };
    });
  }

  const targetValid = (cfg: TargetConfig) => {
    const stepsOk = cfg.steps.every(st => st.text.trim() && (st.channel === "whatsapp" || st.subject.trim()));
    const stopOk = !isRem || cfg.stopOn.length > 0;
    return stepsOk && stopOk;
  };

  const canSave = !!selectedActionId && !saving && targets.every(who => targetValid(who === "customer" ? customerCfg : adminCfg));

  async function save(controlOverride: "auto" | "off") {
    if (!currentRow) return;
    setSaving(true);
    setError("");
    setNotice("");
    const actionKey = currentRow.triggerKey || currentRow.id;
    const scope = { kind: scopeKind, ...(scopeKind === "package" ? { packageSlug } : {}) };

    const buildPayload = (who: "customer" | "admin") => {
      const cfg = who === "customer" ? customerCfg : adminCfg;
      return {
        kind,
        action: actionKey,
        actionId: currentRow.id,
        audience: who,
        condition,
        scope,
        steps: cfg.steps.map(st => ({
          timingRef: isRem ? st.timingRef : "after_action",
          days: isRem && st.timingRef !== "on_due" ? st.days : 0,
          channel: st.channel,
          subject: st.channel === "whatsapp" ? "" : st.subject.trim(),
          text: st.text.trim(),
        })),
        repeat: isRem && cfg.repeatTimes > 0 ? { times: cfg.repeatTimes, everyDays: cfg.repeatEvery } : { times: 0, everyDays: 2 },
        stopOn: isRem ? cfg.stopOn : [],
        control: controlOverride,
        enabled: controlOverride === "auto",
      };
    };

    try {
      if (editingId && targets.length === 1) {
        const response = await fetch(`/api/auto-reply/action-rules/${editingId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildPayload(targets[0])),
          cache: "no-store",
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || result.message || "Could not update rule.");
      } else {
        for (const who of targets) {
          const response = await fetch("/api/auto-reply/action-rules", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(buildPayload(who)),
            cache: "no-store",
          });
          const result = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(result.error || result.message || "Could not save rule.");
        }
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
        {editingId && <span style={{ fontSize: 12, color: "var(--pn-muted, var(--muted))" }}>Editing existing rule — saves as a new version</span>}
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
          <dd style={{ display: "grid", gap: 4, width: "100%" }}>
            <select value={selectedActionId} onChange={e => { setSelectedActionId(e.target.value); setEditingId(null); }}>
              <option value="">Choose an action…</option>
              {actionOptions.map(item => (
                <option key={item.id} value={item.id}>{item.id} — {item.title}</option>
              ))}
            </select>
            {currentRow && <span style={{ fontSize: 12, color: "var(--pn-muted, var(--muted))", fontFamily: "monospace" }}>{currentRow.method} {currentRow.endpoint}</span>}
          </dd>
        </div>

        <div className={s.factRow}>
          <dt>3. Who receives</dt>
          <dd>
            <label style={{ cursor: "pointer" }}><input type="radio" name="audience" checked={audienceChoice === "customer"} onChange={() => setAudienceChoice("customer")} /> Customer</label>
            <label style={{ cursor: "pointer" }}><input type="radio" name="audience" checked={audienceChoice === "admin"} onChange={() => setAudienceChoice("admin")} /> Admin / Team</label>
            <label style={{ cursor: "pointer" }}><input type="radio" name="audience" checked={audienceChoice === "both"} onChange={() => setAudienceChoice("both")} /> Both (different messages)</label>
          </dd>
        </div>

        <div className={s.factRow}>
          <dt>4. Condition <InfoTip label="Only if"><p>Send only when payment is pending (unpaid) or only when already paid — useful when a plan starts with or without payment.</p></InfoTip></dt>
          <dd>
            <select value={condition} onChange={e => setCondition(e.target.value as RuleCondition)}>
              <option value="anytime">Anytime (always)</option>
              <option value="unpaid">Only if payment is pending (unpaid)</option>
              <option value="paid">Only if already paid</option>
            </select>
          </dd>
        </div>

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
            <button key={ph} type="button" onClick={() => insertPlaceholder(ph)}
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
        return (
          <dl key={who} className={s.facts}>
            <div className={s.factRow}>
              <dt>{label}</dt>
              <dd style={{ display: "grid", gap: 12, width: "100%" }}>
                {cfg.steps.map((step, idx) => (
                  <div key={idx} style={{ display: "grid", gap: 8, padding: 10, border: "1px solid var(--line)", borderRadius: 8 }}>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", justifyContent: "space-between" }}>
                      <strong style={{ fontSize: 12 }}>{isRem ? `Message ${idx + 1}` : "Message"}</strong>
                      {isRem && cfg.steps.length > 1 && (
                        <button type="button" className={s.link} onClick={() => updateTarget(who, p => ({ ...p, steps: p.steps.filter((_, i) => i !== idx) }))}>
                          Remove
                        </button>
                      )}
                    </div>

                    <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
                      {isRem && (
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

                    <textarea rows={3} placeholder={`Write ${who} message…`} value={step.text} maxLength={10000}
                      onFocus={() => setLastFocused({ who, idx })}
                      onChange={e => updateTarget(who, p => ({ ...p, steps: p.steps.map((st, i) => i === idx ? { ...st, text: e.target.value } : st) }))} />
                  </div>
                ))}

                {isRem && cfg.steps.length < 10 && (
                  <div>
                    <button type="button" onClick={() => updateTarget(who, p => ({ ...p, steps: [...p.steps, blankStep("after_due", 2)] }))}>
                      + Add another follow-up for {who === "customer" ? "Customer" : "Admin"}
                    </button>
                  </div>
                )}
              </dd>
            </div>

            {isRem && (
              <>
                <div className={s.factRow}>
                  <dt>Repeat ({who})</dt>
                  <dd>
                    <label>Repeat <input type="number" min={0} max={10} value={cfg.repeatTimes} style={{ width: 60 }}
                      onChange={e => updateTarget(who, p => ({ ...p, repeatTimes: Math.max(0, Number(e.target.value || 0)) }))} /> times</label>
                    {cfg.repeatTimes > 0 && (
                      <label>every <input type="number" min={1} max={90} value={cfg.repeatEvery} style={{ width: 60 }}
                        onChange={e => updateTarget(who, p => ({ ...p, repeatEvery: Math.max(1, Number(e.target.value || 1)) }))} /> days</label>
                    )}
                  </dd>
                </div>

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
              </>
            )}
          </dl>
        );
      })}

      {/* Control & Preview */}
      <dl className={s.facts}>
        <div className={s.factRow}>
          <dt>6. Control <InfoTip label="Control"><p>Auto sends automatically. Review (approval before sending) is coming soon. Off saves without sending.</p></InfoTip></dt>
          <dd>
            <label style={{ cursor: "pointer" }}><input type="radio" name="control" checked={control === "auto"} onChange={() => setControl("auto")} /> Auto</label>
            <label style={{ opacity: 0.6 }} title="Coming soon"><input type="radio" name="control" disabled /> Review (coming soon)</label>
            <label style={{ cursor: "pointer" }}><input type="radio" name="control" checked={control === "off"} onChange={() => setControl("off")} /> Off</label>
          </dd>
        </div>

        <div className={s.factRow}>
          <dt>Summary Preview</dt>
          <dd style={{ display: "grid", gap: 4 }}>
            {targets.map(who => {
              const cfg = who === "customer" ? customerCfg : adminCfg;
              const first = cfg.steps[0];
              const when = timingSummary(first, isRem);
              const condText = condition === "unpaid" ? "if unpaid" : condition === "paid" ? "if paid" : "";
              const scopeText = scopeKind === "package" ? packageSlug : scopeKind === "monthly" ? "monthly" : scopeKind === "one_time" ? "one-time" : "";
              return (
                <div key={who}>
                  <strong>{currentRow?.title || "Choose an action"}</strong> → {who === "admin" ? "Admin" : "Customer"} · {when}
                  {condText ? ` · ${condText}` : ""}{scopeText ? ` · ${scopeText}` : ""}
                  {isRem && cfg.repeatTimes > 0 ? ` · repeat ${cfg.repeatTimes}x every ${cfg.repeatEvery}d` : ""}
                  {isRem && cfg.stopOn.length ? ` · stop when ${cfg.stopOn.map(k => STOP_CHOICES.find(c => c.key === k)?.label || k).join(", ")}` : ""}
                  {` · ${control === "auto" ? "Auto" : "Off"}`}
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
        <button type="button" className="admin-button" disabled={!canSave} onClick={() => void save("auto")}>
          {saving ? "Saving…" : "Save & Activate"}
        </button>
      </div>
    </section>
  );
}
