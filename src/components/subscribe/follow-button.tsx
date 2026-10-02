"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { READER_PAGE_EVENT, type ReaderPage } from "@/components/blog/article-reader";
import { useTask } from "@/components/loading/navigation";
import { NOTE } from "@/components/subscribe/push-control";
import { usePush } from "@/components/subscribe/use-push";

/** "Not now" on the prompt keeps it away this long, per browser. */
const DISMISS_KEY = "follow-prompt-dismissed";
const DISMISS_MS = 7 * 24 * 60 * 60 * 1000;
/** The prompt comes half-way through the reader's pages, or after this long on a one-page post. */
const PROMPT_AFTER_MS = 30_000;

/** True when "Not now" was chosen lately; true too when storage is blocked, so the prompt never nags. */
function recentlyDismissed() {
  try {
    const at = Number(window.localStorage.getItem(DISMISS_KEY));
    return !!at && Date.now() - at < DISMISS_MS;
  } catch {
    return true;
  }
}

function rememberDismiss() {
  try {
    window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    // Storage blocked: the prompt simply comes back next visit.
  }
}

type Choices = { categories: string[]; offers: boolean };

/**
 * "Follow SEO": one click turns push on for one category (src/docs/NOTIFICATIONS.md).
 * The first follow on a browser asks the browser's permission (POST
 * /api/push-devices); after that a follow or unfollow only changes the topics
 * (PATCH /api/subscriptions/me). Following means this browser gets the push, so
 * a category followed on another device still shows "Follow" here.
 *
 * `prompt` adds the small card offering the same follow half-way through the
 * article (the reader's READER_PAGE_EVENT) or after PROMPT_AFTER_MS. The card is
 * portalled to <body>: the button sits in the reader's first page, which the
 * reader hides once the visitor turns past it.
 */
export function FollowButton({
  category,
  initial,
  pushKey,
  prompt = false,
}: {
  category: { _id: string; name: string };
  /** The visitor's saved choices; empty when they have none. */
  initial: Choices;
  pushKey: string | null;
  prompt?: boolean;
}) {
  const push = usePush(pushKey);
  const { busy, track } = useTask();
  const [choices, setChoices] = useState<Choices>(initial);
  const [error, setError] = useState("");
  const [promptState, setPromptState] = useState<"hidden" | "open" | "done">("hidden");
  /** Set once the visitor used the button: they have decided, so the prompt stays away. */
  const [decided, setDecided] = useState(false);

  const following = push.state === "on" && choices.categories.includes(category._id);
  // A browser that cannot get push is never offered the prompt.
  const promptable = prompt && !decided && !following && (push.state === "off" || push.state === "on");

  useEffect(() => {
    if (!promptable || promptState !== "hidden") return;
    const open = () => {
      if (!recentlyDismissed()) setPromptState("open");
    };
    const onPage = (event: Event) => {
      const { page, count } = (event as CustomEvent<ReaderPage>).detail;
      // At least one page turned, so a two-page post does not offer it on arrival.
      if (page >= 1 && page + 1 >= Math.ceil(count / 2)) open();
    };
    const timer = window.setTimeout(open, PROMPT_AFTER_MS);
    window.addEventListener(READER_PAGE_EVENT, onPage);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener(READER_PAGE_EVENT, onPage);
    };
  }, [promptable, promptState]);

  /** Saves `next` for this browser; asks permission only when push is not on here yet. */
  async function save(next: Choices): Promise<Choices> {
    if (push.state === "on") {
      const response = await fetch("/api/subscriptions/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      const reply = (await response.json()) as Partial<Choices> & { error?: string };
      if (response.ok) return { categories: reply.categories ?? next.categories, offers: reply.offers ?? next.offers };
      // 404: this browser has push but its settings were lost (cookie cleared); register it again.
      if (response.status !== 404) throw new Error(reply.error || "Could not save. Try again.");
    }
    const reply = await push.enable(next.categories, next.offers);
    return { categories: reply.categories ?? next.categories, offers: reply.offers ?? next.offers };
  }

  /** Follows or unfollows; true when it worked. */
  const toggle = () =>
    track(async () => {
      setError("");
      const blocked = NOTE[push.state];
      if (blocked) {
        setError(blocked);
        return false;
      }
      const categories = following
        ? choices.categories.filter(id => id !== category._id)
        : [...new Set([...choices.categories, category._id])];
      try {
        setChoices(await save({ ...choices, categories }));
        return true;
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "Something went wrong. Try again.");
        return false;
      }
    });

  const acceptPrompt = async () => {
    if (await toggle()) {
      setPromptState("done");
      window.setTimeout(() => setPromptState(state => (state === "done" ? "hidden" : state)), 4000);
    }
  };

  const dismissPrompt = () => {
    rememberDismiss();
    setPromptState("hidden");
    setError("");
  };

  return (
    <>
      <span className="follow-topic">
        <button
          className={following ? "follow-button is-on" : "follow-button"}
          type="button"
          aria-pressed={following}
          aria-label={`${following ? "Following" : "Follow"} ${category.name}`}
          disabled={busy || push.state === "loading"}
          onClick={() => {
            setDecided(true);
            setPromptState("hidden");
            void toggle();
          }}
        >
          {/* The category name stands right beside the button, so the label is one word. */}
          {following ? "✓ Following" : "Follow"}
        </button>
        {error && promptState !== "open" ? <span className="follow-error" role="status">{error}</span> : null}
      </span>

      {promptState !== "hidden" ? createPortal(
        <aside className="follow-prompt" role="dialog" aria-label={`Notifications for ${category.name}`}>
          {promptState === "done" ? (
            <p className="follow-prompt-title" role="status">
              <b>✓</b> You will get new {category.name} posts on this device.
            </p>
          ) : (
            <>
              <button className="follow-prompt-close" type="button" aria-label="Close" onClick={dismissPrompt}>
                ×
              </button>
              <p className="follow-prompt-title">🔔 New {category.name} posts on your phone?</p>
              <p className="follow-prompt-text">Free, no login. Turn off anytime.</p>
              <div className="follow-prompt-actions">
                <button className="button button-dark" type="button" disabled={busy} onClick={() => void acceptPrompt()}>
                  {busy ? "Turning on…" : "Yes, notify me"}
                </button>
                <button className="follow-prompt-later" type="button" onClick={dismissPrompt}>
                  Not now
                </button>
              </div>
              {error ? <p className="form-error">{error}</p> : null}
            </>
          )}
        </aside>,
        document.body,
      ) : null}
    </>
  );
}
