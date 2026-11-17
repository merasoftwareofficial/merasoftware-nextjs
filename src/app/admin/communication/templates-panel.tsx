"use client";

import { useCallback, useMemo, useState } from "react";
import { useCommunicationRefresh } from "@/lib/communication-live";
import { formatIndiaDateTime } from "@/lib/date-time";
import styles from "../email-control/email-control.module.css";
import { Loader } from "../email-control/loader";
import { ActionRuleForm, originLabel, type ActionRuleRecord, type BuiltInInfo } from "./action-rule-form";
import {
  deleteActionRule,
  groupRulesByPair,
  rulePreviewText,
  ruleStatusLabel,
  ruleSummaryLine,
  setActionRuleEnabled,
  triggersToFormOptions,
  type ActionRow,
  type ActionsData,
} from "./action-rule-helpers";
import c from "./actions-panel.module.css";

type TemplateEntry = ActionRuleRecord & { actionTitle: string; actionCode: string };
type BuiltInTemplateEntry = BuiltInInfo["templates"][number] & { actionTitles: string[]; actionCodes: string[] };
type StatusFilter = "all" | "active" | "off";

/**
 * Communication > Automatic messages: unified list of every Template rule from Actions (SSOT)
 * plus any remaining unmigrated Built-in (Old) templates, with "+ Add automatic message"
 * opening ActionRuleForm defaulted to kind="template".
 */
export function TemplatesPanel({
  active,
  onOpenPanel,
}: {
  active: boolean;
  onOpenPanel?: (panel: string) => void;
}) {
  const [data, setData] = useState<ActionsData | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");
  const [newRule, setNewRule] = useState(false);
  const [editingRule, setEditingRule] = useState<ActionRuleRecord | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [migrating, setMigrating] = useState(false);

  const load = useCallback(async (signal: AbortSignal) => {
    try {
      const response = await fetch("/api/auto-reply/actions", { signal, cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not load automatic messages.");
      if (!signal.aborted) { setData(result.data); setError(""); }
    } catch (failure) {
      if (!signal.aborted) setError(failure instanceof Error ? failure.message : "Could not load automatic messages.");
    }
  }, []);

  useCommunicationRefresh(load, active);

  const reload = () => {
    const controller = new AbortController();
    void load(controller.signal);
  };

  const allActions: ActionRow[] = useMemo(() => data?.actions ?? [], [data]);
  const triggers = useMemo(() => data?.triggers ?? [], [data]);
  const formActions = useMemo(
    () => (triggers.length ? triggersToFormOptions(triggers) : allActions),
    [triggers, allActions],
  );

  // Deduplicate shared-trigger rules across Work Groups (or fallback actions).
  const templateEntries = useMemo<TemplateEntry[]>(() => {
    const byId = new Map<string, TemplateEntry>();
    if (triggers.length) {
      for (const trigger of triggers) {
        for (const rule of trigger.rules || []) {
          if (rule.kind !== "template") continue;
          const rid = rule._id || rule.id;
          if (!rid || byId.has(rid)) continue;
          byId.set(rid, {
            ...rule,
            actionId: "",
            actionTitle: rule.purpose || trigger.label,
            actionCode: trigger.triggerKey,
          });
        }
      }
      return [...byId.values()];
    }
    for (const row of allActions) {
      for (const rule of row.rules || []) {
        if (rule.kind !== "template") continue;
        const rid = rule._id || rule.id;
        if (!rid) continue;
        const existing = byId.get(rid);
        if (!existing || rule.actionId === row.id) {
          byId.set(rid, {
            ...rule,
            actionId: rule.actionId || row.id,
            actionTitle: rule.purpose || row.title,
            actionCode: row.id,
          });
        }
      }
    }
    return [...byId.values()];
  }, [triggers, allActions]);

  // Deduplicate any remaining unmigrated Built-in (Old) templates by event key.
  const builtInEntries = useMemo<BuiltInTemplateEntry[]>(() => {
    const byEvent = new Map<string, BuiltInTemplateEntry>();
    for (const row of allActions) {
      for (const tpl of row.builtIn?.templates || []) {
        const existing = byEvent.get(tpl.event);
        if (existing) {
          if (!existing.actionCodes.includes(row.id)) {
            existing.actionCodes.push(row.id);
            existing.actionTitles.push(row.title);
          }
        } else {
          byEvent.set(tpl.event, {
            ...tpl,
            actionTitles: [row.title],
            actionCodes: [row.id],
          });
        }
      }
    }
    return [...byEvent.values()];
  }, [allActions]);

  const allRuleGroups = useMemo(() => groupRulesByPair(templateEntries), [templateEntries]);

  const filteredRuleGroups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return allRuleGroups.filter(group => {
      const anyActive = group.some(r => r.enabled && r.control !== "off");
      if (statusFilter === "active" && !anyActive) return false;
      if (statusFilter === "off" && anyActive) return false;
      if (!needle) return true;
      return group.some(r =>
        r.actionTitle.toLowerCase().includes(needle)
        || r.actionCode.toLowerCase().includes(needle)
        || (r.action || "").toLowerCase().includes(needle)
        || (r.steps?.[0]?.subject || "").toLowerCase().includes(needle)
        || (r.steps?.[0]?.text || "").toLowerCase().includes(needle),
      );
    });
  }, [allRuleGroups, statusFilter, query]);

  const filteredBuiltIns = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return builtInEntries.filter(tpl => {
      const isActive = tpl.active !== false && tpl.mode !== "off";
      if (statusFilter === "active" && !isActive) return false;
      if (statusFilter === "off" && isActive) return false;
      if (!needle) return true;
      return (
        tpl.label.toLowerCase().includes(needle)
        || tpl.event.toLowerCase().includes(needle)
        || tpl.actionTitles.some(t => t.toLowerCase().includes(needle))
        || tpl.actionCodes.some(id => id.toLowerCase().includes(needle))
      );
    });
  }, [builtInEntries, statusFilter, query]);

  const totalCount = allRuleGroups.length + builtInEntries.length;
  const activeCount =
    allRuleGroups.filter(g => g.some(r => r.enabled && r.control !== "off")).length
    + builtInEntries.filter(t => t.active !== false && t.mode !== "off").length;
  const shownCount = filteredRuleGroups.length + filteredBuiltIns.length;

  async function toggleRule(rule: ActionRuleRecord) {
    const id = rule._id || rule.id;
    if (!id) return;
    setTogglingId(id);
    setError("");
    try {
      await setActionRuleEnabled(id, !rule.enabled);
      reload();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not update automatic message.");
    } finally {
      setTogglingId(null);
    }
  }

  async function removeRule(rule: ActionRuleRecord) {
    const id = rule._id || rule.id;
    if (!id || !window.confirm("Delete this automatic message permanently?")) return;
    setDeletingId(id);
    setError("");
    try {
      await deleteActionRule(id);
      reload();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not delete automatic message.");
    } finally {
      setDeletingId(null);
    }
  }

  async function runMigrate() {
    setMigrating(true);
    setError("");
    setNotice("");
    try {
      const previewRes = await fetch("/api/auto-reply/action-rules/migrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun: true }),
        cache: "no-store",
      });
      const previewJson = await previewRes.json().catch(() => ({}));
      if (!previewRes.ok) throw new Error(previewJson.error || previewJson.message || "Could not preview migration.");
      const p = previewJson.data || {};
      const count = Number(p.migrated || 0);
      if (count === 0) {
        setNotice(`All supported built-in templates are already migrated (${Number(p.skipped || 0)} skipped).`);
        return;
      }
      if (!window.confirm(`Migrate ${count} built-in item(s) to Action rules? (${Number(p.skipped || 0)} already migrated will be skipped.)`)) return;
      const applyRes = await fetch("/api/auto-reply/action-rules/migrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun: false }),
        cache: "no-store",
      });
      const applyJson = await applyRes.json().catch(() => ({}));
      if (!applyRes.ok) throw new Error(applyJson.error || applyJson.message || "Migration failed.");
      const a = applyJson.data || {};
      setNotice(`Migration complete: ${Number(a.migrated || 0)} migrated, ${Number(a.skipped || 0)} already existed.`);
      reload();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Migration failed.");
    } finally {
      setMigrating(false);
    }
  }

  if (editingRule) {
    return (
      <section hidden={!active}>
        <ActionRuleForm
          actions={formActions}
          editingRule={editingRule}
          packages={data?.packages}
          stopChoices={data?.stopChoices}
          onSaved={reload}
          onBack={() => setEditingRule(null)}
        />
      </section>
    );
  }
  if (newRule) {
    return (
      <section hidden={!active}>
        <ActionRuleForm
          actions={formActions}
          defaultKind="template"
          packages={data?.packages}
          stopChoices={data?.stopChoices}
          onSaved={reload}
          onBack={() => setNewRule(false)}
        />
      </section>
    );
  }

  return (
    <section className={styles.section} aria-label="Automatic messages" hidden={!active}>
      <p className={styles.muted}>
        All automatic message templates from Actions (plus any remaining built-in templates) in one place. Adding or editing here updates Actions directly.
      </p>
      {error && <p className={styles.error} role="alert">{error}</p>}
      {notice && <p role="status" className={c.notice}>{notice}</p>}

      {!data ? !error && <Loader label="Loading automatic messages…" /> : (
        <>
          <div className={styles.actions} style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            <button type="button" className="admin-button" onClick={() => setNewRule(true)}>+ Add automatic message</button>
            {builtInEntries.length > 0 && (
              <button type="button" disabled={migrating} onClick={() => void runMigrate()}>
                {migrating ? "Migrating…" : `Migrate built-in templates (${builtInEntries.length})`}
              </button>
            )}
          </div>

          <div role="tablist" aria-label="Filter automatic messages by status" className={c.segment}>
            <button type="button" role="tab" aria-selected={statusFilter === "all"} onClick={() => setStatusFilter("all")}>
              All <span className={c.badge}>({totalCount})</span>
            </button>
            <button type="button" role="tab" aria-selected={statusFilter === "active"} onClick={() => setStatusFilter("active")}>
              Active <span className={c.badge}>({activeCount})</span>
            </button>
            <button type="button" role="tab" aria-selected={statusFilter === "off"} onClick={() => setStatusFilter("off")}>
              Off <span className={c.badge}>({totalCount - activeCount})</span>
            </button>
          </div>

          <div className={c.toolbar}>
            <input
              className={c.search}
              type="search"
              aria-label="Find an automatic message"
              placeholder="Find by action, event, subject or message text"
              value={query}
              onChange={event => setQuery(event.target.value)}
            />
            <span className={c.count}>Showing {shownCount} {shownCount === 1 ? "template" : "templates"}</span>
          </div>

          {!shownCount ? (
            <p className={styles.muted}>No automatic messages match this filter yet.</p>
          ) : (
            <div className={c.tableWrap}>
              <table className={c.table} aria-label="Automatic messages table">
                <thead>
                  <tr>
                    <th scope="col">Action &amp; Origin</th>
                    <th scope="col">How it works</th>
                    <th scope="col">Status</th>
                    <th scope="col" className={c.right}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRuleGroups.map((group, idx) => {
                    const primary = group[0];
                    const isPaired = group.length > 1;
                    const gid = primary._id || primary.id || String(idx);
                    const latestEdited = group
                      .map(r => r.updatedAt)
                      .filter((d): d is string => Boolean(d))
                      .sort((a, b) => +new Date(b) - +new Date(a))[0];

                    return (
                      <tr key={gid} className={c.row}>
                        <td>
                          <div className={c.name}>
                            {primary.actionTitle} <span className={c.mono}>({primary.actionCode})</span>
                            {isPaired ? " · Both" : ""}
                          </div>
                          <div className={c.when}>Origin: <strong>{originLabel(primary.origin)}</strong></div>
                          {primary.createdAt && <div className={c.when}>Created: {formatIndiaDateTime(primary.createdAt)}</div>}
                          {latestEdited && <div className={c.when}>Edited: {formatIndiaDateTime(latestEdited)}</div>}
                        </td>
                        <td className={c.description}>
                          <div style={{ display: "grid", gap: isPaired ? 10 : 0 }}>
                            {group.map((rule, rIdx) => {
                              const rid = rule._id || rule.id || `${gid}-${rIdx}`;
                              const preview = rulePreviewText(rule);
                              return (
                                <div key={rid} style={isPaired && rIdx > 0 ? { borderTop: "1px solid var(--pn-line, var(--line))", paddingTop: 8 } : undefined}>
                                  <div>{ruleSummaryLine(rule)}</div>
                                  {rule.steps?.[0]?.subject && <div className={c.when}>Subject: {rule.steps[0].subject}</div>}
                                  {preview && <div className={c.when}>Message: &ldquo;{preview}&rdquo;</div>}
                                </div>
                              );
                            })}
                          </div>
                        </td>
                        <td>
                          <div style={{ display: "grid", gap: isPaired ? 8 : 0 }}>
                            {group.map((rule, rIdx) => {
                              const rid = rule._id || rule.id || `${gid}-${rIdx}`;
                              const who = rule.audience === "admin" ? "Admin" : "Customer";
                              return (
                                <div key={rid}>
                                  <strong>{isPaired ? `${who}: ${ruleStatusLabel(rule)}` : ruleStatusLabel(rule)}</strong>
                                </div>
                              );
                            })}
                          </div>
                        </td>
                        <td className={c.right}>
                          <div style={{ display: "grid", gap: 6, justifyItems: "end" }}>
                            <button type="button" className="admin-button" onClick={() => setEditingRule(primary)}>Edit</button>
                            {group.map((rule, rIdx) => {
                              const rid = rule._id || rule.id || `${gid}-${rIdx}`;
                              const who = rule.audience === "admin" ? "Admin" : "Customer";
                              return (
                                <div key={rid} style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                                  {isPaired && <span className={c.when} style={{ margin: 0 }}>{who}:</span>}
                                  <button type="button" className={c.manage} disabled={togglingId === rid} onClick={() => void toggleRule(rule)}>
                                    {togglingId === rid ? "Saving…" : rule.enabled && rule.control !== "off" ? "Turn Off" : "Turn On"}
                                  </button>
                                  <button type="button" className={c.manage} disabled={deletingId === rid} onClick={() => void removeRule(rule)}>
                                    {deletingId === rid ? "Deleting…" : "Delete"}
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredBuiltIns.map(tpl => (
                    <tr key={`bt-${tpl.event}`} className={c.row}>
                      <td>
                        <div className={c.name}>
                          {tpl.label} <span className={c.mono}>({tpl.actionCodes.join(", ")})</span>
                        </div>
                        <div className={c.when}>Origin: <strong>Built-in (Old)</strong></div>
                      </td>
                      <td className={c.description}>
                        <div>{tpl.actionTitles.join(" · ")}</div>
                        <div className={c.when}>Event: {tpl.event}</div>
                      </td>
                      <td>
                        <strong>{tpl.mode === "off" || tpl.active === false ? "Built-in · Off" : tpl.mode === "auto" ? "Built-in · Auto" : tpl.mode === "review" ? "Built-in · Review" : "Built-in"}</strong>
                      </td>
                      <td className={c.right}>
                        <button
                          type="button"
                          className={c.manage}
                          onClick={() => onOpenPanel?.(tpl.panel === "broadcast" ? "broadcast" : "actions")}
                        >
                          {tpl.panel === "broadcast" ? "Open Broadcast" : "Open in Actions"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
