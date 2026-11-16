"use client";

import { useCallback, useMemo, useState } from "react";
import { useCommunicationRefresh } from "@/lib/communication-live";
import { formatIndiaDateTime } from "@/lib/date-time";
import styles from "../email-control/email-control.module.css";
import { Loader } from "../email-control/loader";
import { ActionRuleForm, originLabel, type ActionRuleRecord } from "./action-rule-form";
import {
  deleteActionRule,
  enrollPendingActionRule,
  groupRulesByPair,
  rulePreviewText,
  ruleStatusLabel,
  ruleSummaryLine,
  setActionRuleEnabled,
  type ActionRow,
  type ActionsData,
} from "./action-rule-helpers";
import { ActionScheduledPanel } from "./action-scheduled-panel";
import c from "./actions-panel.module.css";

type ReminderEntry = ActionRuleRecord & { actionTitle: string; actionCode: string };
type StatusFilter = "all" | "active" | "off";

/**
 * Communication > Reminders: unified list of every Reminder rule from Actions (SSOT),
 * with "+ Add reminder" opening ActionRuleForm defaulted to kind="reminder".
 */
export function RemindersPanel({ active }: { active: boolean }) {
  const [data, setData] = useState<ActionsData | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");
  const [newRule, setNewRule] = useState(false);
  const [editingRule, setEditingRule] = useState<ActionRuleRecord | null>(null);
  const [showScheduled, setShowScheduled] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [enrollingId, setEnrollingId] = useState<string | null>(null);

  const load = useCallback(async (signal: AbortSignal) => {
    try {
      const response = await fetch("/api/auto-reply/actions", { signal, cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not load reminders.");
      if (!signal.aborted) { setData(result.data); setError(""); }
    } catch (failure) {
      if (!signal.aborted) setError(failure instanceof Error ? failure.message : "Could not load reminders.");
    }
  }, []);

  useCommunicationRefresh(load, active);

  const reload = () => {
    const controller = new AbortController();
    void load(controller.signal);
  };

  const allActions: ActionRow[] = useMemo(() => data?.actions ?? [], [data]);

  // Deduplicate shared-trigger rules across actions (preferring the row matching rule.actionId).
  const reminderEntries = useMemo<ReminderEntry[]>(() => {
    const byId = new Map<string, ReminderEntry>();
    for (const row of allActions) {
      for (const rule of row.rules || []) {
        if (rule.kind !== "reminder") continue;
        const rid = rule._id || rule.id;
        if (!rid) continue;
        const existing = byId.get(rid);
        if (!existing || rule.actionId === row.id) {
          byId.set(rid, {
            ...rule,
            actionId: rule.actionId || row.id,
            actionTitle: row.title,
            actionCode: row.id,
          });
        }
      }
    }
    return [...byId.values()];
  }, [allActions]);

  const groups = useMemo(() => {
    const paired = groupRulesByPair(reminderEntries);
    const needle = query.trim().toLowerCase();
    return paired.filter(group => {
      const anyActive = group.some(r => r.enabled && r.control !== "off");
      if (statusFilter === "active" && !anyActive) return false;
      if (statusFilter === "off" && anyActive) return false;
      if (!needle) return true;
      return group.some(r =>
        r.actionTitle.toLowerCase().includes(needle)
        || r.actionCode.toLowerCase().includes(needle)
        || (r.action || "").toLowerCase().includes(needle)
        || (r.steps?.[0]?.text || "").toLowerCase().includes(needle),
      );
    });
  }, [reminderEntries, statusFilter, query]);

  const activeGroupCount = useMemo(
    () => groupRulesByPair(reminderEntries).filter(g => g.some(r => r.enabled && r.control !== "off")).length,
    [reminderEntries],
  );
  const totalGroupCount = useMemo(() => groupRulesByPair(reminderEntries).length, [reminderEntries]);

  async function toggleRule(rule: ActionRuleRecord) {
    const id = rule._id || rule.id;
    if (!id) return;
    setTogglingId(id);
    setError("");
    try {
      await setActionRuleEnabled(id, !rule.enabled);
      reload();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not update reminder.");
    } finally {
      setTogglingId(null);
    }
  }

  async function removeRule(rule: ActionRuleRecord) {
    const id = rule._id || rule.id;
    if (!id || !window.confirm("Delete this reminder permanently?")) return;
    setDeletingId(id);
    setError("");
    try {
      await deleteActionRule(id);
      reload();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not delete reminder.");
    } finally {
      setDeletingId(null);
    }
  }

  async function enrollPending(rule: ActionRuleRecord) {
    const id = rule._id || rule.id;
    if (!id) return;
    setEnrollingId(id);
    setError("");
    setNotice("");
    try {
      const msg = await enrollPendingActionRule(id);
      if (msg) setNotice(msg);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not enroll pending invoices.");
    } finally {
      setEnrollingId(null);
    }
  }

  if (showScheduled) {
    return (
      <section hidden={!active}>
        <ActionScheduledPanel
          onBack={() => setShowScheduled(false)}
          onEditRule={rule => { setShowScheduled(false); setEditingRule(rule); }}
        />
      </section>
    );
  }
  if (editingRule) {
    return (
      <section hidden={!active}>
        <ActionRuleForm
          actions={allActions}
          editingRule={editingRule}
          packages={data?.packages}
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
          actions={allActions}
          defaultKind="reminder"
          packages={data?.packages}
          onSaved={reload}
          onBack={() => setNewRule(false)}
        />
      </section>
    );
  }

  return (
    <section className={styles.section} aria-label="Action reminders" hidden={!active}>
      <p className={styles.muted}>
        All reminder rules from Actions in one place. Adding or editing here updates Actions directly.
      </p>
      {error && <p className={styles.error} role="alert">{error}</p>}
      {notice && <p role="status" className={c.notice}>{notice}</p>}

      {!data ? !error && <Loader label="Loading reminders…" /> : (
        <>
          <div className={styles.actions} style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            <button type="button" className="admin-button" onClick={() => setNewRule(true)}>+ Add reminder</button>
            <button type="button" onClick={() => setShowScheduled(true)}>Scheduled reminders</button>
          </div>

          <div role="tablist" aria-label="Filter reminders by status" className={c.segment}>
            <button type="button" role="tab" aria-selected={statusFilter === "all"} onClick={() => setStatusFilter("all")}>
              All <span className={c.badge}>({totalGroupCount})</span>
            </button>
            <button type="button" role="tab" aria-selected={statusFilter === "active"} onClick={() => setStatusFilter("active")}>
              Active <span className={c.badge}>({activeGroupCount})</span>
            </button>
            <button type="button" role="tab" aria-selected={statusFilter === "off"} onClick={() => setStatusFilter("off")}>
              Off <span className={c.badge}>({totalGroupCount - activeGroupCount})</span>
            </button>
          </div>

          <div className={c.toolbar}>
            <input
              className={c.search}
              type="search"
              aria-label="Find a reminder"
              placeholder="Find by action, trigger or message text"
              value={query}
              onChange={event => setQuery(event.target.value)}
            />
            <span className={c.count}>Showing {groups.length} {groups.length === 1 ? "reminder" : "reminders"}</span>
          </div>

          {!groups.length ? (
            <p className={styles.muted}>No reminders match this filter yet.</p>
          ) : (
            <div className={c.tableWrap}>
              <table className={c.table} aria-label="Reminders table">
                <thead>
                  <tr>
                    <th scope="col">Action &amp; Origin</th>
                    <th scope="col">How it works</th>
                    <th scope="col">Status</th>
                    <th scope="col" className={c.right}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map((group, idx) => {
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
                                  {rule.action === "invoice.created" && rule.condition === "unpaid" && rule.enabled && rule.control !== "off" && (
                                    <button type="button" className={c.manage} disabled={enrollingId === rid} onClick={() => void enrollPending(rule)}>
                                      {enrollingId === rid ? "Checking…" : "Enroll pending"}
                                    </button>
                                  )}
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
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
