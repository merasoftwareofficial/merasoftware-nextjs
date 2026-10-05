"use client";

/**
 * Moderation buttons for one comment in the admin queue, and for one report.
 *
 * Every button calls the same API the public thread uses, so the rules are
 * enforced in one place — this component only chooses which buttons to offer.
 */

import { useNavigate, useTask } from "@/components/loading/navigation";
import { useState } from "react";

export function CommentActions({
  id,
  status,
  canDelete,
}: {
  id: string;
  status: string;
  canDelete: boolean;
}) {
  const router = useNavigate();
  const { busy, track } = useTask();
  const [error, setError] = useState("");

  const run = (request: () => Promise<Response>) =>
    track(async () => {
      setError("");
      const response = await request();

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.error ?? "Could not update that comment.");
        return;
      }
      router.refresh();
    });

  const patch = (action: string) =>
    run(() =>
      fetch(`/api/comments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      }),
    );

  return (
    <span className="admin-row-actions">
      {status === "pending" ? (
        <button className="admin-action" type="button" onClick={() => patch("approve")} disabled={busy}>
          Approve
        </button>
      ) : null}

      {status === "hidden" ? (
        <button className="admin-action" type="button" onClick={() => patch("show")} disabled={busy}>
          Show
        </button>
      ) : (
        <button className="admin-action" type="button" onClick={() => patch("hide")} disabled={busy}>
          Hide
        </button>
      )}

      {canDelete ? (
        <button
          className="admin-action is-danger"
          type="button"
          disabled={busy}
          onClick={() => {
            // Deleting is permanent (hiding is the undoable choice), so it asks first, like every other delete in the panel.
            if (!window.confirm("Delete this comment permanently? This cannot be undone.")) return;
            run(() => fetch(`/api/comments/${id}`, { method: "DELETE" }));
          }}
        >
          Delete
        </button>
      ) : null}

      {error ? <span className="form-error">{error}</span> : null}
    </span>
  );
}

export function ReportActions({ id, resolved }: { id: string; resolved: boolean }) {
  const router = useNavigate();
  const { busy, track } = useTask();
  const [error, setError] = useState("");

  const toggle = () =>
    track(async () => {
      setError("");
      const response = await fetch(`/api/reports/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolved: !resolved }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.error ?? "Could not update that report.");
        return;
      }
      router.refresh();
    });

  return (
    <span className="admin-row-actions">
      <button className="admin-action" type="button" onClick={toggle} disabled={busy}>
        {resolved ? "Reopen" : "Mark resolved"}
      </button>
      {error ? <span className="form-error">{error}</span> : null}
    </span>
  );
}
