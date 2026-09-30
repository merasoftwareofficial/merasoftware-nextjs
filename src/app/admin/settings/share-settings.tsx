"use client";

/**
 * The site-wide switch for share buttons under posts, and which buttons show.
 * A post an editor set to "show" or "hide" keeps its own choice — see
 * shareVisible(). The button list comes from share-rules.ts through the page,
 * because that file is server-only.
 */

import { useNavigate, useTask } from "@/components/loading/navigation";
import { useState } from "react";
import type { Settings } from "@/lib/repo";
import type { ShareButton } from "@/lib/share-rules";

type Option = Pick<ShareButton, "platform" | "label">;

export function ShareSettings({ settings, options }: { settings: Settings; options: Option[] }) {
  const router = useNavigate();
  const [enabled, setEnabled] = useState(settings.shareEnabled !== false);
  const [platforms, setPlatforms] = useState<Option["platform"][]>(settings.sharePlatforms ?? []);
  const { busy, track } = useTask();
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  function toggle(platform: Option["platform"], on: boolean) {
    setPlatforms(current => (on ? [...current, platform] : current.filter(item => item !== platform)));
  }

  const save = () =>
    track(async () => {
      setError("");
      setSaved(false);

      const response = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        // Kept in the readers' order, whatever order they were ticked in.
        body: JSON.stringify({ shareEnabled: enabled, sharePlatforms: options.map(option => option.platform).filter(p => platforms.includes(p)) }),
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
      <h2>Sharing</h2>

      <label className="review-index">
        <input type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)} />
        <span>Show share buttons under blog posts</span>
      </label>

      <p className="admin-subtitle">
        This is the default. A post can be set to show or hide its share buttons on its own when it is written. Members-only
        and private posts never show them. On phones, one &ldquo;Share…&rdquo; button opens the phone&apos;s own share menu.
      </p>

      <div className="admin-filters">
        {options.map(option => (
          <label key={option.platform} className="review-index">
            <input
              type="checkbox"
              checked={platforms.includes(option.platform)}
              onChange={event => toggle(option.platform, event.target.checked)}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>

      <p className="admin-subtitle">
        Share clicks are counted for the Blog posts list only — readers never see them.
      </p>

      {error ? <p className="form-error">{error}</p> : null}
      {saved ? <p className="comment-notice">Saved.</p> : null}

      <button className="admin-button" type="button" onClick={save} disabled={busy}>
        {busy ? "Saving…" : "Save share settings"}
      </button>
    </section>
  );
}
