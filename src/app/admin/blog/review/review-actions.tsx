"use client";

/**
 * The moderator's decision controls for one post in the review queue.
 *
 * Every button calls the existing /api/blogs/[id]/status route — the rules for
 * who may approve and what a status change does live there and in
 * blog-rules.ts, not here. This component only collects the note and the
 * index choice.
 */

import { useNavigate, useTask } from "@/components/loading/navigation";
import { useState } from "react";
import { SeoChecklist } from "@/components/seo-checks";
import type { SeoCheck } from "@/lib/seo-rules";

type Decision = "reject" | "request-changes" | "approve";

export function ReviewActions({ id, type, slug, seoIssues }: { id: string; type: string; slug: string; seoIssues: SeoCheck[] }) {
  const router = useNavigate();

  // Community and discussion posts stay out of search unless the moderator
  // decides this one is worth indexing. Official posts are indexed on publish.
  const [index, setIndex] = useState(false);
  const [asking, setAsking] = useState<Decision | null>(null);
  const [note, setNote] = useState("");
  const { busy, track } = useTask();
  const [error, setError] = useState("");

  const send = (action: string, extra: Record<string, unknown> = {}) =>
    track(async () => {
      setError("");

      const response = await fetch(`/api/blogs/${id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.error ?? "Could not update the post.");
        return;
      }

      setAsking(null);
      setNote("");
      // The post leaves the pending queue, so the list has to be re-fetched.
      router.refresh();
    });

  // SEO issues are shown once before approving; the moderator may approve anyway.
  if (asking === "approve") {
    return (
      <div className="review-decision seo-review">
        <p>
          <b>
            {seoIssues.length} SEO issue{seoIssues.length === 1 ? "" : "s"} on this post.
          </b>{" "}
          Fix them in the editor, ask the author to change them, or approve anyway.
        </p>
        <SeoChecklist checks={seoIssues} fixHref={check => `/admin/blog/${slug}/edit#${check.field}`} />
        {error ? <p className="form-error">{error}</p> : null}
        <div className="review-buttons">
          <button className="admin-button secondary" type="button" onClick={() => setAsking(null)} disabled={busy}>
            Cancel
          </button>
          <button className="admin-button secondary" type="button" onClick={() => setAsking("request-changes")} disabled={busy}>
            Request changes
          </button>
          <button className="admin-button" type="button" onClick={() => send("approve", { index })} disabled={busy}>
            {busy ? "Working…" : "Approve anyway →"}
          </button>
        </div>
      </div>
    );
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
        <button className="admin-button" type="button" onClick={() => (seoIssues.length ? setAsking("approve") : send("approve", { index }))} disabled={busy}>
          {busy ? "Working…" : "Approve & publish →"}
        </button>
      </div>
    </div>
  );
}
