"use client";

/**
 * The moderator's decision controls for one post in the review queue.
 *
 * Every button calls the existing /api/blogs/[id]/status route — the rules for
 * who may approve and what a status change does live there and in
 * blog-rules.ts, not here. This component only collects the note and the
 * index choice.
 */

import { useNavigate } from "@/components/loading/navigation";
import { useState } from "react";

type Decision = "reject" | "request-changes";

export function ReviewActions({ id, type }: { id: string; type: string }) {
  const router = useNavigate();

  // Community and discussion posts stay out of search unless the moderator
  // decides this one is worth indexing. Official posts are indexed on publish.
  const [index, setIndex] = useState(false);
  const [asking, setAsking] = useState<Decision | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function send(action: string, extra: Record<string, unknown> = {}) {
    setBusy(true);
    setError("");

    const response = await fetch(`/api/blogs/${id}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...extra }),
    });

    setBusy(false);

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setError(data.error ?? "Could not update the post.");
      return;
    }

    setAsking(null);
    setNote("");
    // The post leaves the pending queue, so the list has to be re-fetched.
    router.refresh();
  }

  if (asking) {
    const rejecting = asking === "reject";
    return (
      <div className="review-decision">
        <label className="admin-field">
          <span>{rejecting ? "Why is this rejected?" : "What should the author change?"}</span>
          <textarea
            value={note}
            onChange={event => setNote(event.target.value)}
            rows={3}
            placeholder={
              rejecting
                ? "The author sees this. Be specific."
                : "The author sees this and can edit and resubmit."
            }
          />
        </label>
        {error ? <p className="form-error">{error}</p> : null}
        <div className="review-buttons">
          <button className="admin-button secondary" type="button" onClick={() => setAsking(null)} disabled={busy}>
            Cancel
          </button>
          <button
            className="admin-button"
            type="button"
            disabled={busy || note.trim().length === 0}
            onClick={() => send(asking, { note: note.trim() })}
          >
            {busy ? "Working…" : rejecting ? "Reject post" : "Send back for changes"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="review-decision">
      {type === "official" ? null : (
        <label className="review-index">
          <input type="checkbox" checked={index} onChange={event => setIndex(event.target.checked)} />
          <span>Allow search engines to index this post</span>
        </label>
      )}

      {error ? <p className="form-error">{error}</p> : null}

      <div className="review-buttons">
        <button className="admin-button secondary" type="button" onClick={() => setAsking("request-changes")} disabled={busy}>
          Request changes
        </button>
        <button className="admin-button danger" type="button" onClick={() => setAsking("reject")} disabled={busy}>
          Reject
        </button>
        <button className="admin-button" type="button" onClick={() => send("approve", { index })} disabled={busy}>
          {busy ? "Working…" : "Approve & publish →"}
        </button>
      </div>
    </div>
  );
}
