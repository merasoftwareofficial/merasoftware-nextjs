"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCommunicationRefresh } from "@/lib/communication-live";
import { formatIndiaDateTime } from "@/lib/date-time";
import styles from "../email-control/email-control.module.css";
import { Loader } from "../email-control/loader";
import { ActionRuleForm, originLabel, type ActionRuleRecord, type BuiltInInfo } from "./action-rule-form";
import { ActionScheduledPanel } from "./action-scheduled-panel";
import c from "./actions-panel.module.css";
import s from "./communication.module.css";

/**
 * Communication > Actions: every action that changes data, shown like a document.
 * The tabs on top are the filter (the place an action is shown in). Inside a tab, actions sit under
 * category headings (a part of the UI, such as Projects), each with its count and meaning.
 * The row itself is read-only: the tab and the heading change only from Manage.
 */
type Surface = "Admin" | "Client" | "Website" | "System";
type ActionRow = {
  id: string;
  title: string;
  what: string;
  when: string;
  method: string;
  endpoint: string;
  note: string;
  surface: Surface;
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
type Category = { name: string; meaning: string };
type PackageOption = { slug: string; name: string };
type ActionsData = { actions: ActionRow[]; surfaces: Surface[]; categories: Category[]; packages?: PackageOption[] };
type View = "all" | Surface | "archived" | "deleted";
type Change = Record<string, unknown>;
type MessageFilter = "all" | "template" | "reminder" | "none";

const SURFACE_TITLES: Record<Surface, string> = { Admin: "Admin panel", Client: "Client portal", Website: "Website", System: "System" };
const VIEWS: { id: View; label: string }[] = [
  { id: "all", label: "All" },
  { id: "Admin", label: "Admin panel" },
  { id: "Client", label: "Client portal" },
  { id: "Website", label: "Website" },
  { id: "System", label: "System" },
  { id: "archived", label: "Archived" },
  { id: "deleted", label: "Deleted" },
];
const MESSAGE_FILTERS: { id: MessageFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "template", label: "Has template" },
  { id: "reminder", label: "Has reminder" },
  { id: "none", label: "No message" },
];
const COLUMNS = 9;
const ruleStatus = (row: ActionRow) => {
  const rules = row.rules || [];
  const builtInTemplates = row.builtIn?.templates?.length || 0;
  const builtInReminders = row.builtIn?.reminders?.length || 0;
  return {
    template: rules.filter(r => r.kind === "template").length + builtInTemplates,
    reminder: rules.filter(r => r.kind === "reminder").length + builtInReminders,
  };
};

export function ActionsPanel({ active, onOpenTemplate, onOpenPanel }: {
  active: boolean;
  onOpenTemplate?: (event: string, app: "portal" | "website") => void;
  onOpenPanel?: (panel: string) => void;
}) {
  const [data, setData] = useState<ActionsData | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [view, setView] = useState<View>("all");
  const [messageFilter, setMessageFilter] = useState<MessageFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [newRule, setNewRule] = useState(false);
  const [newRuleFor, setNewRuleFor] = useState<string | null>(null);
  const [editingRule, setEditingRule] = useState<ActionRuleRecord | null>(null);
  const [detailActionId, setDetailActionId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showScheduled, setShowScheduled] = useState(false);
  const [cleaning, setCleaning] = useState(false);

  const load = useCallback(async (signal: AbortSignal) => {
    try {
      const response = await fetch("/api/auto-reply/actions", { signal, cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not load actions.");
      if (!signal.aborted) { setData(result.data); setError(""); }
    } catch (failure) {
      if (!signal.aborted) setError(failure instanceof Error ? failure.message : "Could not load actions.");
    }
  }, []);
  useCommunicationRefresh(load, active);

  // Save one action's change, then show the server's version of that row. A new category joins the list.
  async function save(id: string, change: Change, done: string) {
    setSaving(true);
    setNotice("");
    setError("");
    try {
      const response = await fetch(`/api/auto-reply/actions/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(change),
        cache: "no-store",
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not save.");
      const updated = result.data as ActionRow;
      setData(current => {
        if (!current) return current;
        const known = current.categories.some(item => item.name === updated.category);
        return {
          ...current,
          actions: current.actions.map(row => (row.id === id ? updated : row)),
          categories: known ? current.categories : [...current.categories, { name: updated.category, meaning: "" }],
        };
      });
      setNotice(done);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not save.");
    } finally {
      setSaving(false);
      setMenuFor(null);
    }
  }

  const all = useMemo(() => data?.actions ?? [], [data]);
  const counts = useMemo(() => {
    const live = all.filter(row => !row.archived && !row.deleted);
    const of = (s: Surface) => live.filter(row => row.surface === s).length;
    return {
      all: live.length, Admin: of("Admin"), Client: of("Client"), Website: of("Website"), System: of("System"),
      archived: all.filter(row => row.archived && !row.deleted).length,
      deleted: all.filter(row => row.deleted).length,
    } as Record<View, number>;
  }, [all]);
  const messageCounts = useMemo(() => {
    const live = all.filter(row => !row.archived && !row.deleted);
    const template = live.filter(row => ruleStatus(row).template > 0).length;
    const reminder = live.filter(row => ruleStatus(row).reminder > 0).length;
    const none = live.filter(row => { const status = ruleStatus(row); return status.template === 0 && status.reminder === 0; }).length;
    return { all: live.length, template, reminder, none } as Record<MessageFilter, number>;
  }, [all]);

  // Rows of the chosen tab and search, grouped under their category heading, in the heading order.
  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const rows = all.filter(row => {
      const inView = view === "archived" ? row.archived && !row.deleted
        : view === "deleted" ? row.deleted
          : !row.archived && !row.deleted && (view === "all" || row.surface === view);
      const status = ruleStatus(row);
      const inMessageFilter = messageFilter === "all" ? true
        : messageFilter === "template" ? status.template > 0
          : messageFilter === "reminder" ? status.reminder > 0
            : status.template === 0 && status.reminder === 0;
      const inCategory = categoryFilter === "all" || row.category === categoryFilter;
      return inView && inMessageFilter && inCategory && (!needle || `${row.title} ${row.what} ${row.when} ${row.id} ${row.endpoint} ${row.category}`.toLowerCase().includes(needle));
    });
    return (data?.categories ?? [])
      .map(category => ({ category, rows: rows.filter(row => row.category === category.name).sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true })) }))
      .filter(group => group.rows.length);
  }, [all, data, view, messageFilter, categoryFilter, query]);
  const shown = groups.reduce((sum, group) => sum + group.rows.length, 0);

  const reloadActions = () => {
    const controller = new AbortController();
    void load(controller.signal);
  };

  async function runCleanup() {
    setCleaning(true);
    setError("");
    setNotice("");
    try {
      const previewRes = await fetch("/api/auto-reply/action-rules/cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun: true }),
        cache: "no-store",
      });
      const previewData = await previewRes.json().catch(() => ({}));
      if (!previewRes.ok) throw new Error(previewData.error || previewData.message || "Could not preview cleanup.");
      const preview = previewData.data || {};
      const dups = Number(preview.duplicatesRemoved || 0);
      const pairs = Number(preview.pairsLinked || 0);
      if (dups === 0 && pairs === 0) {
        setNotice("No duplicate or unpaired rules found.");
        return;
      }
      if (!window.confirm(`Remove ${dups} duplicate rule(s) and link ${pairs} unpaired Both pair(s)?`)) return;
      const applyRes = await fetch("/api/auto-reply/action-rules/cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun: false }),
        cache: "no-store",
      });
      const applyData = await applyRes.json().catch(() => ({}));
      if (!applyRes.ok) throw new Error(applyData.error || applyData.message || "Cleanup failed.");
      const applied = applyData.data || {};
      setNotice(`Cleaned ${Number(applied.duplicatesRemoved || 0)} duplicate(s) and linked ${Number(applied.pairsLinked || 0)} pair(s).`);
      reloadActions();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not run cleanup.");
    } finally {
      setCleaning(false);
    }
  }

  async function toggleRuleEnabled(rule: ActionRuleRecord) {
    const id = rule._id || rule.id;
    if (!id) return;
    setTogglingId(id);
    setError("");
    try {
      const response = await fetch(`/api/auto-reply/action-rules/${id}/enabled`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !rule.enabled }),
        cache: "no-store",
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || result.message || "Could not update rule.");
      reloadActions();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not update rule.");
    } finally {
      setTogglingId(null);
    }
  }

  async function deleteRule(rule: ActionRuleRecord) {
    const id = rule._id || rule.id;
    if (!id || !window.confirm("Delete this rule permanently?")) return;
    setDeletingId(id);
    setError("");
    try {
      const response = await fetch(`/api/auto-reply/action-rules/${id}/delete`, {
        method: "POST",
        cache: "no-store",
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || result.message || "Could not delete rule.");
      reloadActions();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not delete rule.");
    } finally {
      setDeletingId(null);
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
        <ActionRuleForm actions={all} editingRule={editingRule} packages={data?.packages} onSaved={reloadActions} onBack={() => setEditingRule(null)} />
      </section>
    );
  }
  if (newRule) {
    return (
      <section hidden={!active}>
        <ActionRuleForm actions={all} packages={data?.packages} onSaved={reloadActions} onBack={() => setNewRule(false)} />
      </section>
    );
  }
  if (newRuleFor) {
    return (
      <section hidden={!active}>
        <ActionRuleForm actions={all} initialActionId={newRuleFor} packages={data?.packages} onSaved={reloadActions} onBack={() => setNewRuleFor(null)} />
      </section>
    );
  }
  const detailRow = detailActionId ? all.find(a => a.id === detailActionId) : null;
  if (detailRow) {
    return (
      <section hidden={!active}>
        <ActionDetailView
          row={detailRow}
          togglingId={togglingId}
          deletingId={deletingId}
          error={error}
          onBack={() => setDetailActionId(null)}
          onAdd={() => setNewRuleFor(detailRow.id)}
          onEdit={rule => setEditingRule({ ...rule, actionId: detailRow.id })}
          onToggle={rule => void toggleRuleEnabled(rule)}
          onDelete={rule => void deleteRule(rule)}
          onOpenTemplate={onOpenTemplate}
          onOpenPanel={onOpenPanel}
        />
      </section>
    );
  }

  return <section className={styles.section} aria-label="Actions list" hidden={!active}>
    <p className={styles.muted}>Use Manage on a row to move it to another tab or heading, archive it or remove it from the list.</p>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {notice && <p role="status" className={c.notice}>{notice}</p>}

    {!data ? !error && <Loader label="Loading actions…" /> : <>
      <div className={styles.actions} style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        <button type="button" className="admin-button" onClick={() => setNewRule(true)}>+ Add reminder or template</button>
        <button type="button" onClick={() => setShowScheduled(true)}>Scheduled reminders</button>
        <button type="button" disabled={cleaning} onClick={() => void runCleanup()}>
          {cleaning ? "Cleaning…" : "Clean up duplicates"}
        </button>
      </div>

      <div role="tablist" aria-label="Show actions" className={c.segment}>
        {VIEWS.map(item => <button key={item.id} type="button" role="tab" aria-selected={view === item.id} onClick={() => { setView(item.id); setMenuFor(null); }}>
          {item.label} <span className={c.badge}>({counts[item.id]})</span>
        </button>)}
      </div>

      <div role="tablist" aria-label="Filter by message" className={c.segment}>
        {MESSAGE_FILTERS.map(item => <button key={item.id} type="button" role="tab" aria-selected={messageFilter === item.id} onClick={() => { setMessageFilter(item.id); setMenuFor(null); }}>
          {item.label} <span className={c.badge}>({messageCounts[item.id]})</span>
        </button>)}
      </div>

      <div className={c.toolbar}>
        <input className={c.search} type="search" aria-label="Find an action" placeholder="Find by name, description or endpoint" value={query} onChange={event => setQuery(event.target.value)} />
        <select aria-label="Filter by category" value={categoryFilter} onChange={event => setCategoryFilter(event.target.value)}
          style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid var(--pn-line, var(--line))", background: "var(--pn-field, var(--paper))", color: "inherit", font: "inherit", fontSize: 13 }}>
          <option value="all">All categories</option>
          {(data?.categories ?? []).map(cat => <option key={cat.name} value={cat.name}>{cat.name}</option>)}
        </select>
        <span className={c.count}>Showing {shown} {shown === 1 ? "action" : "actions"} in {groups.length} {groups.length === 1 ? "heading" : "headings"}</span>
      </div>

      {!groups.length ? <p>No actions here.</p> : <div className={c.tableWrap}>
        <table className={c.table} aria-label="Actions table">
          <thead><tr>
            <th scope="col">Name</th>
            <th scope="col">Description</th>
            <th scope="col">ID</th>
            <th scope="col">Method</th>
            <th scope="col">Endpoint</th>
            <th scope="col">Category</th>
            <th scope="col">Note</th>
            <th scope="col">Messages</th>
            <th scope="col" className={c.right}>Manage</th>
          </tr></thead>
          {groups.map(({ category, rows }) => <Fragment key={category.name}>
            <tbody aria-label={`${category.name} (${rows.length})`}>
              <tr className={c.groupRow}>
                <th colSpan={COLUMNS} scope="rowgroup">
                  <span className={c.groupName}>{category.name}</span> <span className={c.groupCount}>({rows.length})</span>
                  {category.meaning && <span className={c.groupMeaning}>{category.meaning}</span>}
                </th>
              </tr>
              {rows.map(row => <tr key={row.id} className={c.row} data-off={row.archived || row.deleted ? "true" : "false"}>
                <td className={c.name}>{row.title}</td>
                <td className={c.description}>{row.what}<span className={c.when}>{row.when}</span></td>
                <td className={c.mono}>{row.id}</td>
                <td className={`${c.mono} ${c.method}`}>{row.method}</td>
                <td className={`${c.mono} ${c.endpoint}`}>{row.endpoint}</td>
                <td>{row.category}</td>
                <td className={c.note}>{row.note || "—"}</td>
                <td><MessageStatus row={row} onOpen={() => setDetailActionId(row.id)} /></td>
                <td className={c.right}>
                  <ManageMenu row={row} data={data} open={menuFor === row.id} saving={saving}
                    onToggle={() => setMenuFor(menuFor === row.id ? null : row.id)}
                    onClose={() => setMenuFor(null)}
                    onAction={(change, done) => void save(row.id, change, done)} />
                </td>
              </tr>)}
            </tbody>
          </Fragment>)}
        </table>
      </div>}
    </>}
  </section>;
}

function ruleSummaryLine(rule: ActionRuleRecord) {
  const who = rule.audience === "admin" ? "To Admin" : "To Customer";
  const scope = rule.scope?.kind === "package" && rule.scope.packageSlug ? ` · ${rule.scope.packageSlug}`
    : rule.scope?.kind === "monthly" ? " · Monthly"
      : rule.scope?.kind === "one_time" ? " · One-time" : "";
  const cond = rule.condition === "unpaid" ? " · If unpaid" : rule.condition === "paid" ? " · If paid" : "";
  const timings = (rule.steps || []).map(st => {
    if (rule.kind === "template") return "immediately";
    if (st.timingRef === "on_due") return "on due date";
    if (st.timingRef === "before_due") return `${st.days}d before due`;
    if (st.timingRef === "after_due") return `${st.days}d after due`;
    return st.days ? `after ${st.days}d` : "immediately";
  }).join(", ");
  const repeat = rule.kind === "reminder" && rule.repeat?.times ? ` · repeat ${rule.repeat.times}x every ${rule.repeat.everyDays}d` : "";
  const stop = rule.kind === "reminder" && rule.stopOn?.length ? ` · stops on ${rule.stopOn.join(", ")}` : "";
  return `${who}${scope}${cond} · ${timings || "immediately"}${repeat}${stop}`;
}

function MessageStatus({ row, onOpen }: { row: ActionRow; onOpen: () => void }) {
  const rules = row.rules || [];
  const builtInCount = (row.builtIn?.templates?.length || 0) + (row.builtIn?.reminders?.length || 0);
  const parts: string[] = [];
  if (rules.length) {
    const autoCount = rules.filter(r => r.enabled && r.control === "auto").length;
    const reviewCount = rules.filter(r => r.enabled && r.control === "review").length;
    const offCount = rules.length - autoCount - reviewCount;
    const states = [
      autoCount ? `${autoCount} Auto` : "",
      reviewCount ? `${reviewCount} Review` : "",
      offCount ? `${offCount} Off` : "",
    ].filter(Boolean).join(", ");
    parts.push(`${rules.length} rule${rules.length > 1 ? "s" : ""}${states ? ` (${states})` : ""}`);
  }
  if (builtInCount) parts.push(`${builtInCount} Built-in (Old)`);

  if (!parts.length && !row.triggerKey) {
    return <span className={c.count} title="Backend signal not wired yet">No signal yet</span>;
  }
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
      <span className={c.count}>{parts.length ? parts.join(" · ") : "No message"}</span>
      <button type="button" className={parts.length ? c.manage : c.messageNone} onClick={onOpen}>
        {parts.length ? "Open" : "+ Add / Open"}
      </button>
    </div>
  );
}

function ruleStatusLabel(rule: ActionRuleRecord) {
  return !rule.enabled || rule.control === "off" ? "Off" : rule.control === "review" ? "Review" : "Auto";
}

function rulePreviewText(rule: ActionRuleRecord) {
  const raw = (rule.steps?.[0]?.text || "").replace(/\s+/g, " ").trim();
  return raw.length > 90 ? `${raw.slice(0, 90)}…` : raw;
}

/** Groups Customer+Admin rules that share a non-empty `pairId` into one visual row (Customer first). */
function groupRulesByPair(rules: ActionRuleRecord[]): ActionRuleRecord[][] {
  const groups: ActionRuleRecord[][] = [];
  const byPair = new Map<string, ActionRuleRecord[]>();
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

function ActionDetailView({ row, togglingId, deletingId, error, onBack, onAdd, onEdit, onToggle, onDelete, onOpenTemplate, onOpenPanel }: {
  row: ActionRow;
  togglingId: string | null;
  deletingId: string | null;
  error: string;
  onBack: () => void;
  onAdd: () => void;
  onEdit: (rule: ActionRuleRecord) => void;
  onToggle: (rule: ActionRuleRecord) => void;
  onDelete: (rule: ActionRuleRecord) => void;
  onOpenTemplate?: (event: string, app: "portal" | "website") => void;
  onOpenPanel?: (panel: string) => void;
}) {
  const ruleGroups = groupRulesByPair(row.rules || []);
  const builtInTemplates = row.builtIn?.templates || [];
  const builtInReminders = row.builtIn?.reminders || [];

  return (
    <section aria-label={`Action details for ${row.title}`} className={s.workSection}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <button type="button" className={s.link} onClick={onBack}>← Back to Actions</button>
        {row.triggerKey && (
          <button type="button" className="admin-button" onClick={onAdd}>
            + Add message or reminder
          </button>
        )}
      </div>

      <div className={s.workToolbar}>
        <h3>{row.title} <span className={c.mono} style={{ fontSize: 13 }}>({row.id})</span></h3>
      </div>
      <p className={styles.muted}>{row.what}{row.when ? ` — ${row.when}` : ""}</p>
      {error && <p className={styles.error} role="alert">{error}</p>}

      {!ruleGroups.length && !builtInTemplates.length && !builtInReminders.length ? (
        <p>{row.triggerKey ? "No messages or reminders set for this action yet." : "Backend signal not wired yet for this action."}</p>
      ) : (
        <div className={c.tableWrap}>
          <table className={c.table} aria-label="Action messages and reminders">
            <thead>
              <tr>
                <th scope="col">Type &amp; Origin</th>
                <th scope="col">How it works</th>
                <th scope="col">Status</th>
                <th scope="col" className={c.right}>Action</th>
              </tr>
            </thead>
            <tbody>
              {ruleGroups.map((group, idx) => {
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
                      <div className={c.name}>{primary.kind === "template" ? "Template" : "Reminder"}{isPaired ? " (Both)" : ""}</div>
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
                        <button type="button" className="admin-button" onClick={() => onEdit(primary)}>Edit</button>
                        {group.map((rule, rIdx) => {
                          const rid = rule._id || rule.id || `${gid}-${rIdx}`;
                          const who = rule.audience === "admin" ? "Admin" : "Customer";
                          return (
                            <div key={rid} style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                              {isPaired && <span className={c.when} style={{ margin: 0 }}>{who}:</span>}
                              <button type="button" className={c.manage} disabled={togglingId === rid} onClick={() => onToggle(rule)}>
                                {togglingId === rid ? "Saving…" : rule.enabled && rule.control !== "off" ? "Turn Off" : "Turn On"}
                              </button>
                              <button type="button" className={c.manage} disabled={deletingId === rid} onClick={() => onDelete(rule)}>
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
              {builtInTemplates.map(tpl => (
                <tr key={`bt-${tpl.event}`} className={c.row}>
                  <td>
                    <div className={c.name}>Template</div>
                    <div className={c.when}>Origin: <strong>Built-in (Old)</strong></div>
                  </td>
                  <td className={c.description}>{tpl.label} ({tpl.event})</td>
                  <td>Built-in</td>
                  <td className={c.right}>
                    <button type="button" className={c.manage}
                      onClick={() => tpl.panel === "broadcast" ? onOpenPanel?.("broadcast") : onOpenTemplate?.(tpl.event, tpl.app)}>
                      Open old editor
                    </button>
                  </td>
                </tr>
              ))}
              {builtInReminders.map(rem => (
                <tr key={`br-${rem.panel}-${rem.label}`} className={c.row}>
                  <td>
                    <div className={c.name}>Reminder</div>
                    <div className={c.when}>Origin: <strong>Built-in (Old)</strong></div>
                  </td>
                  <td className={c.description}>{rem.label}</td>
                  <td>Built-in</td>
                  <td className={c.right}>
                    <button type="button" className={c.manage} onClick={() => onOpenPanel?.(rem.panel)}>
                      Open old editor
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

type Flyout = "filter" | "category" | null;

function ManageMenu({ row, data, open, saving, onToggle, onClose, onAction }: {
  row: ActionRow; data: ActionsData; open: boolean; saving: boolean;
  onToggle: () => void; onClose: () => void; onAction: (change: Change, done: string) => void;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [up, setUp] = useState(false);
  const [flyout, setFlyout] = useState<Flyout>(null);
  const [newName, setNewName] = useState<string | null>(null);

  // Close on a click outside or on Escape. The submenus start closed each time the menu opens.
  useEffect(() => {
    if (!open) return;
    const outside = (event: MouseEvent) => { if (wrap.current && !wrap.current.contains(event.target as Node)) onClose(); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("mousedown", outside); document.removeEventListener("keydown", escape); };
  }, [open, onClose]);

  const addCategory = () => {
    const name = (newName ?? "").replace(/\s+/g, " ").trim();
    if (!name || name === row.category) return;
    onAction({ category: name }, `Moved to the heading ${name}.`);
  };

  return <div className={c.menuWrap} ref={wrap}>
    <button type="button" className={c.manage} aria-haspopup="menu" aria-expanded={open} aria-label={`Manage ${row.id} ${row.title}`} disabled={saving}
      onClick={event => {
        setUp(window.innerHeight - event.currentTarget.getBoundingClientRect().bottom < 340);
        setFlyout(null);
        setNewName(null);
        onToggle();
      }}>Manage ▾</button>
    {open && <div className={`${c.menu} ${up ? c.menuUp : ""}`} role="menu" aria-label={`Manage ${row.id}`}>
      <div className={c.menuTitle}>{row.title}<span>{row.id} · {SURFACE_TITLES[row.surface]} · {row.category}</span></div>

      {!row.deleted && <div className={c.subWrap}>
        <button type="button" role="menuitem" aria-haspopup="menu" aria-expanded={flyout === "filter"} disabled={saving}
          onClick={() => setFlyout(flyout === "filter" ? null : "filter")}>
          <strong>Move to filter <span aria-hidden="true">▸</span></strong>
          <span>Choose the tab this action is shown in. It does not change how the action works.</span>
        </button>
        {flyout === "filter" && <div className={c.flyout} role="menu" aria-label="Move to filter">
          {data.surfaces.map(item => <button key={item} type="button" role="menuitemradio" aria-checked={row.surface === item} disabled={saving || row.surface === item}
            onClick={() => onAction({ surface: item }, `Moved to ${SURFACE_TITLES[item]}.`)}>
            <strong>{row.surface === item ? "✓ " : ""}{SURFACE_TITLES[item]}</strong>
          </button>)}
        </div>}
      </div>}

      {!row.deleted && <div className={c.subWrap}>
        <button type="button" role="menuitem" aria-haspopup="menu" aria-expanded={flyout === "category"} disabled={saving}
          onClick={() => setFlyout(flyout === "category" ? null : "category")}>
          <strong>Change category <span aria-hidden="true">▸</span></strong>
          <span>Choose the heading this action is listed under.</span>
        </button>
        {flyout === "category" && <div className={`${c.flyout} ${c.flyoutTall}`} role="menu" aria-label="Change category">
          {data.categories.map(item => <button key={item.name} type="button" role="menuitemradio" aria-checked={row.category === item.name} disabled={saving || row.category === item.name}
            onClick={() => onAction({ category: item.name }, `Moved to the heading ${item.name}.`)}>
            <strong>{row.category === item.name ? "✓ " : ""}{item.name}</strong>
          </button>)}
          {newName === null
            ? <button type="button" role="menuitem" className={c.addItem} disabled={saving} onClick={() => setNewName("")}><strong>+ New category</strong></button>
            : <form className={c.newCategory} onSubmit={event => { event.preventDefault(); addCategory(); }}>
              <input aria-label="New category name" autoFocus maxLength={60} value={newName} placeholder="Name of the new heading" onChange={event => setNewName(event.target.value)} />
              <button type="submit" className={c.saveSmall} disabled={saving || !newName.trim()}>Add</button>
            </form>}
        </div>}
      </div>}

      {!row.deleted && <button type="button" role="menuitem" disabled={saving} onClick={() => onAction({ archived: !row.archived }, row.archived ? "Action restored." : "Action archived.")}>
        <strong>{row.archived ? "Restore" : "Archive"}</strong>
        <span>{row.archived ? "Show it in its tab again." : "Hide it from the tabs. It stays in Archived."}</span>
      </button>}
      {!row.deleted && <button type="button" role="menuitem" className={c.danger} disabled={saving} onClick={() => onAction({ deleted: true }, "Action removed from the list. The code stays.")}>
        <strong>Delete from list</strong>
        <span>Remove it from this list. The code stays; restore it from Deleted.</span>
      </button>}
      {row.deleted && <button type="button" role="menuitem" disabled={saving} onClick={() => onAction({ deleted: false }, "Action restored.")}>
        <strong>Restore</strong>
        <span>Put it back in the list.</span>
      </button>}
      {row.changed && <button type="button" role="menuitem" disabled={saving} onClick={() => onAction({ reset: true }, "Action reset to its original tab and heading.")}>
        <strong>Reset to original</strong>
        <span>Put it back in the tab and heading it started in.</span>
      </button>}
    </div>}
  </div>;
}
