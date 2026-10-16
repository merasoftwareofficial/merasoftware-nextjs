/** Website mail is prepared by the portal SSOT; it never contacts a provider.
 * Public/cron email is disabled. Authenticated portal admins may prepare drafts
 * and review them in the shared Email Control screen.
 */
import { cookies } from "next/headers";

export type Mail = {
  event?: "website.subscription.confirm" | "website.subscription.manage";
  to: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
};

// The public newsletter must not offer a delivery flow while unattended mail is off.
export function mailConfigured() { return false; }

export async function sendMail(mail: Mail): Promise<boolean> {
  if (!mail.event || !process.env.PORTAL_API_URL) return false;
  try {
    const token = (await cookies()).get("token")?.value;
    if (!token) return false;
    await fetch(`${process.env.PORTAL_API_URL.replace(/\/$/, "")}/api/email-control/website-drafts`, {
      method: "POST", cache: "no-store", signal: AbortSignal.timeout(10000),
      headers: { "Content-Type": "application/json", Cookie: `token=${token}` },
      body: JSON.stringify({ event: mail.event, to: [mail.to], subject: mail.subject, text: mail.text, headers: mail.headers }),
    });
  } catch { /* Unavailable review service never falls back to automatic delivery. */ }
  // Preparing a draft is never reported as delivery (no confirmSentAt stamp).
  return false;
}
