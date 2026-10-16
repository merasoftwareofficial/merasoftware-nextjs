/** Website email intake uses the shared controller; delivery always needs admin approval. */
import "server-only";
import { emailControlRequest } from "@/lib/email-control-server";

export type Mail = {
  event: "website.subscription.confirm" | "website.subscription.manage";
  to: string; subject: string; html: string; text: string;
  headers?: Record<string, string>; requiredLinks?: string[];
};

/** This offers request intake, never unattended email delivery. */
export function mailConfigured() { return !!process.env.PORTAL_API_URL && !!process.env.TOKEN_SECRET_KEY; }

export async function queueWebsiteMail(mail: Mail, reference: { subscriberId: string; tokenHash: string }, dedupeKey: string): Promise<void> {
  const result = await emailControlRequest<{ queued: boolean }>("/website-drafts", "POST", {
    event: mail.event, to: [mail.to], subject: mail.subject, text: mail.text,
    headers: mail.headers, requiredLinks: mail.requiredLinks, reference, dedupeKey,
  }, { access: "intake" });
  if (!result.queued) throw new Error("Email requests are currently paused. Your topic choices have been saved.");
}
