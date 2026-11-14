"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCommunicationRefresh } from "@/lib/communication-live";
import styles from "../email-control/email-control.module.css";
import { Loader } from "../email-control/loader";
import { ActionRuleForm } from "./action-rule-form";
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
};
type Category = { name: string; meaning: string };
type ActionsData = { actions: ActionRow[]; surfaces: Surface[]; categories: Category[] };
type View = "all" | Surface | "archived" | "deleted";
type Change = Record<string, unknown>;
type MessageFilter = "all" | "template" | "reminder" | "none";
type RuleStatus = { template: number; reminder: number };

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
// UI-only mock: which actions already have a template and/or a reminder, for the row badge and
// the "Has template / Has reminder / No message" filter. Real counts come with the backend wiring.
const MOCK_RULE_STATUS: Record<string, RuleStatus> = {};
const ruleStatus = (id: string): RuleStatus => MOCK_RULE_STATUS[id] || { template: 0, reminder: 0 };

export function ActionsPanel({ active }: { active: boolean }) {
  const [data, setData] = useState<ActionsData | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [view, setView] = useState<View>("all");
  const [messageFilter, setMessageFilter] = useState<MessageFilter>("all");
  const [query, setQuery] = useState("");
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [messagesFor, setMessagesFor] = useState<ActionRow | null>(null);
  const [newRule, setNewRule] = useState(false);

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
    const template = live.filter(row => ruleStatus(row.id).template > 0).length;
    const reminder = live.filter(row => ruleStatus(row.id).reminder > 0).length;
    const none = live.filter(row => { const status = ruleStatus(row.id); return status.template === 0 && status.reminder === 0; }).length;
    return { all: live.length, template, reminder, none } as Record<MessageFilter, number>;
  }, [all]);

  // Rows of the chosen tab and search, grouped under their category heading, in the heading order.
  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const rows = all.filter(row => {
      const inView = view === "archived" ? row.archived && !row.deleted
        : view === "deleted" ? row.deleted
          : !row.archived && !row.deleted && (view === "all" || row.surface === view);
      const status = ruleStatus(row.id);
      const inMessageFilter = messageFilter === "all" ? true
        : messageFilter === "template" ? status.template > 0
          : messageFilter === "reminder" ? status.reminder > 0
            : status.template === 0 && status.reminder === 0;
      return inView && inMessageFilter && (!needle || `${row.title} ${row.what} ${row.when} ${row.id} ${row.endpoint} ${row.category}`.toLowerCase().includes(needle));
    });
    return (data?.categories ?? [])
      .map(category => ({ category, rows: rows.filter(row => row.category === category.name).sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true })) }))
      .filter(group => group.rows.length);
  }, [all, data, view, messageFilter, query]);
  const shown = groups.reduce((sum, group) => sum + group.rows.length, 0);

  if (messagesFor) return <section hidden={!active}><ActionMessages row={messagesFor} back={() => setMessagesFor(null)} /></section>;
  if (newRule) return <section hidden={!active}><ActionRuleForm onBack={() => setNewRule(false)} /></section>;

  return <section className={styles.section} aria-label="Actions list" hidden={!active}>
    <p className={styles.muted}>Use Manage on a row to move it to another tab or heading, archive it or remove it from the list.</p>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {notice && <p role="status" className={c.notice}>{notice}</p>}

    {!data ? !error && <Loader label="Loading actions…" /> : <>
      <div className={styles.actions}><button type="button" className="admin-button" onClick={() => setNewRule(true)}>+ Add reminder or template</button></div>

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
                <td><MessageStatus row={row} onOpen={() => setMessagesFor(row)} /></td>
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

// What is attached to this action, at a glance: a plain "+ Add message" when nothing is, or
// Template / Reminder tags (with a count past one) so the owner never has to open a row to know.
function MessageStatus({ row, onOpen }: { row: ActionRow; onOpen: () => void }) {
  const status = ruleStatus(row.id);
  if (!status.template && !status.reminder) return <button type="button" className={c.messageNone} onClick={onOpen}>+ Add message</button>;
  return <button type="button" className={c.messageTags} onClick={onOpen} aria-label={`Edit messages for ${row.title}`}>
    {status.template > 0 && <span className={c.tagTemplate}>Template{status.template > 1 ? ` (${status.template})` : ""}</span>}
    {status.reminder > 0 && <span className={c.tagReminder}>Reminder{status.reminder > 1 ? ` (${status.reminder})` : ""}</span>}
  </button>;
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

/**
 * One action's rules (Reminder.md §4). UI-only: rule counts come from MOCK_RULE_STATUS, matching
 * the row's own badge. "+ Add message" opens the same form with the action already chosen.
 * Note: the action row's ID (e.g. "A29") is the Actions-list ID, not an action-rule trigger key
 * (e.g. "invoice.created", helpers/actionEvents.js). The two are mapped only once the backend is
 * wired (phase 2); until then the form here opens with no action pre-selected.
 */
function ActionMessages({ row, back }: { row: ActionRow; back: () => void }) {
  const [adding, setAdding] = useState(false);
  const status = ruleStatus(row.id);
  if (adding) return <ActionRuleForm onBack={() => setAdding(false)} />;
  return <section aria-label="Action messages" className={s.workSection}>
    <div><button type="button" className={s.link} onClick={back}>← All actions</button></div>
    <div className={s.workToolbar}><h3>{row.title}</h3></div>
    <p className={styles.muted}>{row.what}</p>
    {!status.template && !status.reminder ? <p>No message or reminder is set for this action yet.</p>
      : <p>{[status.template > 0 && `${status.template} template${status.template > 1 ? "s" : ""}`, status.reminder > 0 && `${status.reminder} reminder${status.reminder > 1 ? "s" : ""}`].filter(Boolean).join(" and ")} set for this action.</p>}
    <button type="button" className="admin-button" onClick={() => setAdding(true)}>+ Add message</button>
  </section>;
}
