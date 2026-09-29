"use client";

/**
 * The site-wide comment controls — the only part of this settings page that is
 * wired to storage. Business details below it are still a placeholder form.
 *
 * These two values decide what a post does when it says "default", so changing
 * them here moves every such post at once. A post whose editor chose open,
 * moderated or closed keeps its own choice — see effectiveMode().
 */

import { useNavigate } from "@/components/loading/navigation";
import { useState } from "react";
import type { Settings } from "@/lib/repo";

export function CommentSettings({ settings }: { settings: Settings }) {
  const router = useNavigate();
  const [enabled, setEnabled] = useState(settings.commentsEnabled);
  const [hold, setHold] = useState(settings.commentDefault === "pending");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  async function save() {
    setBusy(true);
    setError("");
    setSaved(false);

    const response = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        commentsEnabled: enabled,
        commentDefault: hold ? "pending" : "visible",
      }),
    });
    setBusy(false);

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setError(data.error ?? "Could not save the settings.");
      return;
    }

    setSaved(true);
    router.refresh();
  }

  return (
    <section className="admin-seo">
      <h2>Comments</h2>

      <label className="review-index">
        <input type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)} />
        <span>Allow comments on the site</span>
      </label>

      <label className="review-index">
        <input
          type="checkbox"
          checked={hold}
          onChange={event => setHold(event.target.checked)}
          disabled={!enabled}
        />
        <span>Hold new comments for review before they appear</span>
      </label>

      <p className="admin-subtitle">
        This is the default. A post can be set to open, moderated or closed on its own when it is written.
      </p>

      {error ? <p className="form-error">{error}</p> : null}
      {saved ? <p className="comment-notice">Saved.</p> : null}

      <button className="admin-button" type="button" onClick={save} disabled={busy}>
        {busy ? "Saving…" : "Save comment settings"}
      </button>
    </section>
  );
}
