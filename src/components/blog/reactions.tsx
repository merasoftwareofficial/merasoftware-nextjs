"use client";

/**
 * Helpful / Insightful / Save for one post.
 *
 * Initial state comes in as props from the server page, so the buttons render
 * already correct — no flash of "not reacted" while a fetch resolves. After
 * that the API's own reply is the truth, because two tabs can disagree.
 */

import Link from "next/link";
import { useState } from "react";

type Props = {
  blogId: string;
  slug: string;
  signedIn: boolean;
  helpfulCount: number;
  insightfulCount: number;
  initialHelpful: boolean;
  initialInsightful: boolean;
  initialSaved: boolean;
};

export function Reactions({
  blogId,
  slug,
  signedIn,
  helpfulCount,
  insightfulCount,
  initialHelpful,
  initialInsightful,
  initialSaved,
}: Props) {
  const [helpful, setHelpful] = useState({ on: initialHelpful, count: helpfulCount });
  const [insightful, setInsightful] = useState({ on: initialInsightful, count: insightfulCount });
  const [saved, setSaved] = useState(initialSaved);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  async function react(kind: "helpful" | "insightful") {
    setBusy(kind);
    setError("");

    const response = await fetch("/api/reactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blogId, reaction: kind }),
    });
    const data = await response.json().catch(() => ({}));
    setBusy("");

    if (!response.ok) {
      setError(data.error ?? "Could not save that.");
      return;
    }

    const next = { on: data.active, count: data.count };
    if (kind === "helpful") setHelpful(next);
    else setInsightful(next);
  }

  async function save() {
    setBusy("saved");
    setError("");

    const response = await fetch("/api/saved-posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blogId }),
    });
    const data = await response.json().catch(() => ({}));
    setBusy("");

    if (!response.ok) {
      setError(data.error ?? "Could not save that.");
      return;
    }
    setSaved(data.saved);
  }

  if (!signedIn) {
    return (
      <div className="reaction-bar">
        <span className="reaction-count">
          {helpfulCount} helpful · {insightfulCount} insightful
        </span>
        <Link className="text-link" href={`/login?next=/blog/${slug}`}>
          Sign in to react and save <span>→</span>
        </Link>
      </div>
    );
  }

  return (
    <div className="reaction-bar">
      <button
        className={`reaction-button${helpful.on ? " is-on" : ""}`}
        type="button"
        onClick={() => react("helpful")}
        disabled={busy !== ""}
        aria-pressed={helpful.on}
      >
        Helpful <span>{helpful.count}</span>
      </button>

      <button
        className={`reaction-button${insightful.on ? " is-on" : ""}`}
        type="button"
        onClick={() => react("insightful")}
        disabled={busy !== ""}
        aria-pressed={insightful.on}
      >
        Insightful <span>{insightful.count}</span>
      </button>

      <button
        className={`reaction-button${saved ? " is-on" : ""}`}
        type="button"
        onClick={save}
        disabled={busy !== ""}
        aria-pressed={saved}
      >
        {saved ? "Saved" : "Save"}
      </button>

      {error ? <span className="form-error">{error}</span> : null}
    </div>
  );
}
