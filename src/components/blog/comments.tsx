"use client";

/**
 * The comment thread under an article.
 *
 * Server-rendered rows arrive as props so the thread is in the HTML for a
 * reader and for search engines; every change after that re-fetches the list
 * from /api/comments, which returns only the rows this viewer may see.
 *
 * No permission decision is made here — the API enforces all of them. The
 * flags passed in only decide which buttons are worth showing.
 */

import Link from "@/components/link";
import { useTask } from "@/components/loading/navigation";
import { useState } from "react";
import type { Comment } from "@/lib/repo";

type Props = {
  blogId: string;
  slug: string;
  comments: Comment[];
  viewerId: string | null;
  canModerate: boolean;
  canDeleteAny: boolean;
  /** False when the post or the site has comments switched off. */
  accepting: boolean;
  /** True when a new comment waits for a moderator, so we can say so. */
  moderated: boolean;
};

function when(value: string) {
  return new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function Comments({
  blogId,
  slug,
  comments: initial,
  viewerId,
  canModerate,
  canDeleteAny,
  accepting,
  moderated,
}: Props) {
  const [comments, setComments] = useState(initial);
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [reporting, setReporting] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const { busy, track } = useTask();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const top = comments.filter(row => !row.parentId);
  const repliesOf = (id: string) => comments.filter(row => row.parentId === id);

  async function reload() {
    const response = await fetch(`/api/comments?blogId=${blogId}`);
    if (!response.ok) return;
    const data = await response.json();
    setComments(data.comments ?? []);
  }

  async function send(text: string, parentId?: string) {
    if (!text.trim()) return;
    await track(async () => {
      setError("");
      setNotice("");

      const response = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blogId, body: text.trim(), parentId }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(data.error ?? "Could not post that.");
        return;
      }

      if (parentId) setReplyBody("");
      else setBody("");
      setReplyTo(null);
      if (data.status === "pending") setNotice("Posted — a moderator will review it before it appears.");
      await reload();
    });
  }

  const moderate = (id: string, action: "approve" | "hide" | "show") =>
    track(async () => {
      setError("");
      const response = await fetch(`/api/comments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.error ?? "Could not update that comment.");
        return;
      }
      await reload();
    });

  const remove = (id: string) =>
    track(async () => {
      setError("");
      const response = await fetch(`/api/comments/${id}`, { method: "DELETE" });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.error ?? "Could not delete that comment.");
        return;
      }
      await reload();
    });

  const report = (id: string) =>
    track(async () => {
      setError("");
      const response = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetType: "comment", targetId: id, reason: reason.trim() }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.error ?? "Could not send that report.");
        return;
      }
      setReporting(null);
      setReason("");
      setNotice("Reported. A moderator will look at it.");
    });

  function row(comment: Comment, isReply: boolean) {
    const mine = viewerId === comment.userId;
    const replies = repliesOf(comment._id);

    return (
      <li className={`comment${isReply ? " is-reply" : ""}`} key={comment._id}>
        <div className="comment-head">
          <b>{comment.userName}</b>
          <span className="comment-when">{when(comment.createdAt)}</span>
          {comment.status !== "visible" ? (
            <span className="comment-flag">{comment.status === "pending" ? "Awaiting review" : "Hidden"}</span>
          ) : null}
        </div>

        <p className="comment-body">{comment.body}</p>

        <div className="comment-actions">
          {viewerId && accepting && !isReply ? (
            <button type="button" onClick={() => setReplyTo(replyTo === comment._id ? null : comment._id)}>
              Reply
            </button>
          ) : null}

          {canModerate && comment.status === "pending" ? (
            <button type="button" onClick={() => moderate(comment._id, "approve")} disabled={busy}>
              Approve
            </button>
          ) : null}

          {canModerate && comment.status !== "hidden" ? (
            <button type="button" onClick={() => moderate(comment._id, "hide")} disabled={busy}>
              Hide
            </button>
          ) : null}

          {canModerate && comment.status === "hidden" ? (
            <button type="button" onClick={() => moderate(comment._id, "show")} disabled={busy}>
              Show
            </button>
          ) : null}

          {mine || canDeleteAny ? (
            <button type="button" className="is-danger" onClick={() => remove(comment._id)} disabled={busy}>
              Delete
            </button>
          ) : null}

          {viewerId && !mine ? (
            <button type="button" onClick={() => setReporting(reporting === comment._id ? null : comment._id)}>
              Report
            </button>
          ) : null}
        </div>

        {reporting === comment._id ? (
          <div className="comment-report">
            <input
              value={reason}
              onChange={event => setReason(event.target.value)}
              placeholder="What is wrong with this comment?"
            />
            <button className="admin-button" type="button" onClick={() => report(comment._id)} disabled={busy}>
              Send report
            </button>
          </div>
        ) : null}

        {replyTo === comment._id ? (
          <div className="comment-reply-form">
            <textarea
              value={replyBody}
              onChange={event => setReplyBody(event.target.value)}
              rows={3}
              placeholder={`Reply to ${comment.userName}`}
            />
            <div className="comment-form-actions">
              <button className="admin-button secondary" type="button" onClick={() => setReplyTo(null)}>
                Cancel
              </button>
              <button
                className="admin-button"
                type="button"
                onClick={() => send(replyBody, comment._id)}
                disabled={busy || replyBody.trim().length < 2}
              >
                {busy ? "Posting…" : "Post reply"}
              </button>
            </div>
          </div>
        ) : null}

        {replies.length ? <ul className="comment-replies">{replies.map(reply => row(reply, true))}</ul> : null}
      </li>
    );
  }

  return (
    <section className="comments" id="comments">
      <div className="section-top">
        <p className="eyebrow">
          <i /> {comments.length === 0 ? "COMMENTS" : `COMMENTS · ${comments.length}`}
        </p>
      </div>

      {!accepting ? (
        <p className="comment-closed">Comments are closed on this post.</p>
      ) : !viewerId ? (
        <p className="comment-closed">
          <Link className="text-link" href={`/login?next=/blog/${slug}`}>
            Sign in to join the discussion <span>→</span>
          </Link>
        </p>
      ) : (
        <div className="comment-form">
          <textarea
            value={body}
            onChange={event => setBody(event.target.value)}
            rows={4}
            placeholder={moderated ? "Your comment is reviewed before it appears." : "Add your comment"}
          />
          <div className="comment-form-actions">
            <button
              className="admin-button"
              type="button"
              onClick={() => send(body)}
              disabled={busy || body.trim().length < 2}
            >
              {busy ? "Posting…" : "Post comment"}
            </button>
          </div>
        </div>
      )}

      {error ? <p className="form-error">{error}</p> : null}
      {notice ? <p className="comment-notice">{notice}</p> : null}

      {top.length === 0 ? (
        <p className="comment-empty">No comments yet.</p>
      ) : (
        <ul className="comment-list">{top.map(comment => row(comment, false))}</ul>
      )}
    </section>
  );
}
