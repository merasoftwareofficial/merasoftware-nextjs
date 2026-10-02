"use client";

import { useTask } from "@/components/loading/navigation";
import { PushControl } from "@/components/subscribe/push-control";
import { TopicChips, type Topic } from "@/components/subscribe/topic-chips";
import { usePush } from "@/components/subscribe/use-push";
import { useState } from "react";

export type { Topic };

/**
 * Choose topics (blog categories + Offers), then get them as browser
 * notifications and/or by email. A channel shows only when it is configured:
 * `pushKey` is the VAPID public key, `mailOn` whether mail can be sent.
 * The server decides what happens (src/lib/subscription-actions.ts).
 */
export function SubscribeForm({
  topics,
  preselected = [],
  offers: initialOffers = false,
  email: initialEmail = "",
  pushKey,
  mailOn,
}: {
  topics: Topic[];
  preselected?: string[];
  offers?: boolean;
  email?: string;
  pushKey: string | null;
  mailOn: boolean;
}) {
  const [chosen, setChosen] = useState<string[]>(preselected);
  const [offers, setOffers] = useState(initialOffers);
  const [email, setEmail] = useState(initialEmail);
  const [website, setWebsite] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [mailDone, setMailDone] = useState<"check-inbox" | "saved" | null>(null);
  const { busy, track } = useTask();
  const push = usePush(pushKey);

  const choose = (nextChosen: string[], nextOffers: boolean) => {
    setChosen(nextChosen);
    setOffers(nextOffers);
  };

  /** Runs an action with the shared error/message handling; refuses an empty choice first. */
  const act = (work: () => Promise<string | void>) =>
    track(async () => {
      setError("");
      setMessage("");
      if (!chosen.length && !offers) {
        setError("Choose at least one topic.");
        return;
      }
      try {
        const done = await work();
        if (done) setMessage(done);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "Something went wrong. Try again.");
      }
    });

  const enablePush = () =>
    act(async () => {
      const reply = await push.enable(chosen, offers);
      if (reply.categories) setChosen(reply.categories);
      return "Done — you will get a notification when a post on your topics goes live.";
    });

  const disablePush = () =>
    track(async () => {
      setError("");
      await push.disable();
      setMessage("Notifications are off in this browser.");
    });

  const subscribeMail = (event: React.FormEvent) => {
    event.preventDefault();
    return act(async () => {
      const response = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, categories: chosen, offers, website }),
      });
      const reply = (await response.json()) as { result?: "check-inbox" | "saved"; error?: string };
      if (!response.ok || !reply.result) throw new Error(reply.error || "Could not subscribe. Try again.");
      setMailDone(reply.result);
    });
  };

  return (
    <div className="subscribe-form">
      <TopicChips topics={topics} chosen={chosen} offers={offers} onChange={choose} />

      {pushKey ? <PushControl state={push.state} busy={busy} onEnable={enablePush} onDisable={disablePush} /> : null}

      {mailOn ? (
        mailDone ? (
          <p className="form-message" role="status">
            {mailDone === "saved" ? "Your email topics are saved." : "Almost done — check your inbox and click the link in our mail to confirm."}
          </p>
        ) : (
          <form className="subscribe-mail" onSubmit={subscribeMail}>
            {/* Hidden from people; a bot that fills it is ignored by the server. */}
            <input className="subscribe-trap" tabIndex={-1} autoComplete="off" aria-hidden="true" value={website} onChange={event => setWebsite(event.target.value)} name="website" />
            <div className="subscribe-row">
              <label className="auth-field">
                <span>{pushKey ? "Or by email" : "Email address"}</span>
                <input type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com" required autoComplete="email" />
              </label>
              <button className={pushKey ? "button button-light" : "button button-dark"} type="submit" disabled={busy}>
                {busy ? "Subscribing…" : "Subscribe"}
              </button>
            </div>
            <p className="subscribe-note">We send a confirmation mail first. Unsubscribe any time from the link in every mail.</p>
          </form>
        )
      ) : null}

      {message ? <p className="form-message" role="status">{message}</p> : null}
      {error ? <p className="form-error">{error}</p> : null}
    </div>
  );
}
