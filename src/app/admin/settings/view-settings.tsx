"use client";

/**
 * The site-wide switch for showing view counts under posts. A post an editor
 * set to "show" or "hide" keeps its own choice — see viewsVisible().
 */

import { useNavigate, useTask } from "@/components/loading/navigation";
import { useState } from "react";
import type { Settings } from "@/lib/repo";

export function ViewSettings({ settings }: { settings: Settings }) {
  const router = useNavigate();
  const [visible, setVisible] = useState(settings.viewsPublic === true);
  const { busy, track } = useTask();
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const save = () =>
    track(async () => {
      setError("");
      setSaved(false);

      const response = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ viewsPublic: visible }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.error ?? "Could not save the settings.");
        return;
      }

      setSaved(true);
      router.refresh();
    });

  return (
    <section className="admin-seo">
      <h2>Blog views</h2>

      <label className="review-index">
        <input type="checkbox" checked={visible} onChange={event => setVisible(event.target.checked)} />
        <span>Show the view count under blog posts</span>
      </label>

      <p className="admin-subtitle">
        This is the default. A post can be set to show or hide its views on its own when it is written. Views are
        always counted and shown in Blog posts, whatever this says.
      </p>

      {error ? <p className="form-error">{error}</p> : null}
      {saved ? <p className="comment-notice">Saved.</p> : null}

      <button className="admin-button" type="button" onClick={save} disabled={busy}>
        {busy ? "Saving…" : "Save view settings"}
      </button>
    </section>
  );
}
