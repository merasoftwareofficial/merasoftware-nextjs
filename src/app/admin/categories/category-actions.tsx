"use client";

/**
 * The controls on /admin/categories. The routes check the admin role and every
 * rule (category-rules.ts); these only send the change and show the answer.
 */

import { useState } from "react";
import { useNavigate, useTask } from "@/components/loading/navigation";

type Target = { id: string; name: string };

async function send(url: string, method: string, body?: unknown) {
  const response = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  return response.ok ? { error: "" } : { error: (data.error as string) ?? "Something went wrong." };
}

const postsLabel = (count: number) => `${count} ${count === 1 ? "post" : "posts"}`;

/** Asks where the posts go, then moves them. Used for listed categories and for names found only on posts. */
function MoveControl({ from, count, targets, removes, onDone }: { from: string; count: number; targets: Target[]; removes: boolean; onDone: () => void }) {
  const router = useNavigate();
  const { busy, track } = useTask();
  const [into, setInto] = useState("");
  const [error, setError] = useState("");

  const move = () => {
    const target = targets.find(item => item.id === into);
    if (!target) return setError("Choose a category.");
    const question = `Move ${postsLabel(count)} from "${from}" to "${target.name}"?${removes ? ` "${from}" will then be removed, and its address will open "${target.name}".` : ""}`;
    if (!window.confirm(question)) return;
    return track(async () => {
      setError("");
      const result = await send("/api/categories/merge", "POST", { from, into });
      if (result.error) return setError(result.error);
      onDone();
      router.refresh();
    });
  };

  if (!targets.length) return <span className="category-muted">Add another category first.</span>;

  return (
    <span className="category-inline">
      <select aria-label={`Move the posts of ${from} to`} value={into} disabled={busy} onChange={event => setInto(event.target.value)}>
        <option value="">Move posts to…</option>
        {targets.map(target => (
          <option key={target.id} value={target.id}>
            {target.name}
          </option>
        ))}
      </select>
      <button className="admin-action" type="button" disabled={busy || !into} onClick={move}>
        {busy ? "Moving…" : "Move"}
      </button>
      {error ? <span className="form-error">{error}</span> : null}
    </span>
  );
}

export function AddCategory() {
  const router = useNavigate();
  const { busy, track } = useTask();
  const [name, setName] = useState("");
  const [membersCanUse, setMembersCanUse] = useState(false);
  const [error, setError] = useState("");

  const add = () =>
    track(async () => {
      setError("");
      const result = await send("/api/categories", "POST", { name, membersCanUse });
      if (result.error) return setError(result.error);
      setName("");
      setMembersCanUse(false);
      router.refresh();
    });

  return (
    <form
      className="category-add"
      onSubmit={event => {
        event.preventDefault();
        void add();
      }}
    >
      <label className="admin-field">
        <span>New category</span>
        <input value={name} maxLength={60} onChange={event => setName(event.target.value)} placeholder="e.g. Web strategy" />
      </label>
      <label className="review-index">
        <input type="checkbox" checked={membersCanUse} onChange={event => setMembersCanUse(event.target.checked)} />
        <span>Members can file community posts under it</span>
      </label>
      <button className="admin-button" type="submit" disabled={busy || name.trim().length < 2}>
        {busy ? "Adding…" : "Add category"}
      </button>
      {error ? <p className="form-error">{error}</p> : null}
    </form>
  );
}

/** One listed category: rename, members on/off, archive or restore, move its posts, delete when empty. */
export function CategoryActions({
  id,
  name,
  count,
  membersCanUse,
  archived,
  targets,
}: {
  id: string;
  name: string;
  count: number;
  membersCanUse: boolean;
  archived: boolean;
  targets: Target[];
}) {
  const router = useNavigate();
  const { busy, track } = useTask();
  const [mode, setMode] = useState<"" | "rename" | "move">("");
  const [nextName, setNextName] = useState(name);
  const [error, setError] = useState("");

  const patch = (body: { name?: string; membersCanUse?: boolean; archived?: boolean }) =>
    track(async () => {
      setError("");
      const result = await send(`/api/categories/${id}`, "PATCH", body);
      if (result.error) return setError(result.error);
      setMode("");
      router.refresh();
    });

  const remove = () => {
    if (!window.confirm(`Delete "${name}"? No post uses it.`)) return;
    return track(async () => {
      setError("");
      const result = await send(`/api/categories/${id}`, "DELETE");
      if (result.error) return setError(result.error);
      router.refresh();
    });
  };

  if (mode === "rename") {
    return (
      <form
        className="category-inline"
        onSubmit={event => {
          event.preventDefault();
          void patch({ name: nextName });
        }}
      >
        <input aria-label={`New name for ${name}`} value={nextName} maxLength={60} disabled={busy} onChange={event => setNextName(event.target.value)} />
        <button className="admin-action" type="submit" disabled={busy || nextName.trim().length < 2 || nextName.trim() === name}>
          {busy ? "Saving…" : "Save"}
        </button>
        <button className="admin-action" type="button" disabled={busy} onClick={() => { setMode(""); setNextName(name); setError(""); }}>
          Cancel
        </button>
        <span className="category-muted">{count ? `The name changes on ${postsLabel(count)}.` : ""}</span>
        {error ? <span className="form-error">{error}</span> : null}
      </form>
    );
  }

  if (mode === "move") {
    return (
      <span className="category-inline">
        <MoveControl from={name} count={count} targets={targets} removes onDone={() => setMode("")} />
        <button className="admin-action" type="button" disabled={busy} onClick={() => setMode("")}>
          Cancel
        </button>
      </span>
    );
  }

  return (
    <span className="category-inline">
      <button className="admin-action" type="button" disabled={busy} onClick={() => setMode("rename")}>
        Rename
      </button>
      <button className="admin-action" type="button" disabled={busy} onClick={() => patch({ membersCanUse: !membersCanUse })}>
        {membersCanUse ? "Close to members" : "Open to members"}
      </button>
      <button className="admin-action" type="button" disabled={busy} onClick={() => patch({ archived: !archived })}>
        {archived ? "Restore" : "Archive"}
      </button>
      <button className="admin-action" type="button" disabled={busy} onClick={() => setMode("move")}>
        Move posts &amp; remove
      </button>
      {count ? null : (
        <button className="admin-action is-danger" type="button" disabled={busy} onClick={remove}>
          Delete
        </button>
      )}
      {error ? <span className="form-error">{error}</span> : null}
    </span>
  );
}

/** A name posts carry that is not on the list: add it, or move its posts into a listed category. */
export function UnlistedActions({ name, count, targets, canAdd }: { name: string; count: number; targets: Target[]; canAdd: boolean }) {
  const router = useNavigate();
  const { busy, track } = useTask();
  const [error, setError] = useState("");

  const add = () =>
    track(async () => {
      setError("");
      const result = await send("/api/categories", "POST", { name, membersCanUse: false });
      if (result.error) return setError(result.error);
      router.refresh();
    });

  return (
    <span className="category-inline">
      {canAdd ? (
        <button className="admin-action" type="button" disabled={busy} onClick={add}>
          {busy ? "Adding…" : "Add to list"}
        </button>
      ) : null}
      <MoveControl from={name} count={count} targets={targets} removes={false} onDone={() => undefined} />
      {error ? <span className="form-error">{error}</span> : null}
    </span>
  );
}
