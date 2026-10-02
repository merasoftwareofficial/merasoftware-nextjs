"use client";

import { useTask } from "@/components/loading/navigation";
import { PushControl } from "@/components/subscribe/push-control";
import { TopicChips, type Topic } from "@/components/subscribe/topic-chips";
import { usePush } from "@/components/subscribe/use-push";
import { useState } from "react";

type EmailState = "off" | "pending" | "active" | "unsubscribed" | "bounced";

const EMAIL_TEXT: Record<EmailState, string> = {
  off: "Email updates are off.",
  pending: "Waiting for you to confirm — check your inbox for our mail.",
  active: "Email updates are on.",
  unsubscribed: "You unsubscribed from email updates.",
  bounced: "Mail to this address could not be delivered, so email updates are off.",
};

/**
 * Change what you are notified about, turn this browser's notifications on or
 * off, or stop the mail. `token` is the manage link's secret; without it the
 * server uses the signed-in account or this browser's notification cookie.
 */
export function PreferencesForm({
  token,
  topics,
  email,
  emailStatus: initialStatus,
  categories: initialCategories,
  offers: initialOffers,
  pushKey,
}: {
  token?: string;
  topics: Topic[];
  email: string | null;
  emailStatus: EmailState;
  categories: string[];
  offers: boolean;
  pushKey: string | null;
}) {
  const [chosen, setChosen] = useState(initialCategories);
  const [offers, setOffers] = useState(initialOffers);
  const [emailStatus, setEmailStatus] = useState(initialStatus);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const { busy, track } = useTask();
  const push = usePush(pushKey);

  async function call(url: string, method: string, body: object) {
    const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const reply = (await response.json()) as { error?: string; emailStatus?: EmailState; categories?: string[]; offers?: boolean };
    if (!response.ok) throw new Error(reply.error || "Could not save. Try again.");
    return reply;
  }

  const act = (work: () => Promise<string>) =>
    track(async () => {
      setError("");
      setMessage("");
      try {
        setMessage(await work());
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "Could not save. Try again.");
      }
    });

  const save = (event: React.FormEvent) => {
    event.preventDefault();
    return act(async () => {
      const reply = await call("/api/subscriptions/me", "PATCH", { token, categories: chosen, offers });
      setChosen(reply.categories ?? chosen);
      setOffers(reply.offers ?? offers);
      return "Your topics are saved.";
    });
  };

  const enablePush = () =>
    act(async () => {
      if (!chosen.length && !offers) throw new Error("Choose at least one topic.");
      await push.enable(chosen, offers);
      return "Notifications are on in this browser.";
    });

  const disablePush = () =>
    act(async () => {
      await push.disable();
      return "Notifications are off in this browser.";
    });

  const stopMail = () =>
    act(async () => {
      const reply = await call("/api/subscribe/unsubscribe", "POST", { token });
      setEmailStatus(reply.emailStatus ?? "unsubscribed");
      return "You will get no more mail from us.";
    });

  return (
    <form className="subscribe-box" onSubmit={save}>
      <p className="eyebrow">
        <i /> YOUR TOPICS
      </p>
      <TopicChips topics={topics} chosen={chosen} offers={offers} onChange={(nextChosen, nextOffers) => { setChosen(nextChosen); setOffers(nextOffers); }} />
      <div className="form-actions">
        <button className="button button-dark" type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save topics"}
        </button>
      </div>

      {pushKey ? (
        <div className="subscribe-channel">
          <p className="eyebrow">
            <i /> THIS BROWSER
          </p>
          {push.state === "on" ? (
            <div className="subscribe-row push-row">
              <p className="subscribe-note">🔔 Notifications are on in this browser.</p>
              <button className="admin-action" type="button" disabled={busy} onClick={disablePush}>
                Turn off in this browser
              </button>
            </div>
          ) : (
            <PushControl state={push.state} busy={busy} onEnable={enablePush} onDisable={disablePush} />
          )}
        </div>
      ) : null}

      {email ? (
        <div className="subscribe-channel">
          <p className="eyebrow">
            <i /> EMAIL
          </p>
          <p className="subscribe-lead">
            <b>{email}</b> {EMAIL_TEXT[emailStatus]}
          </p>
          {emailStatus === "active" || emailStatus === "pending" ? (
            <button className="admin-action" type="button" onClick={stopMail} disabled={busy}>
              Unsubscribe from email
            </button>
          ) : null}
        </div>
      ) : null}

      {message ? <p className="form-message" role="status">{message}</p> : null}
      {error ? <p className="form-error">{error}</p> : null}
    </form>
  );
}
