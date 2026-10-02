/**
 * The one place mail leaves the website (src/docs/NOTIFICATIONS.md).
 *
 * Sends through Resend's REST API when RESEND_API_KEY and FROM_EMAIL are set.
 * Until then nothing is sent: outside production the mail is printed to the
 * server log so the flow can be tested, and production logs one warning.
 * Callers treat `false` as "not sent" and keep the work for later.
 */

export type Mail = {
  to: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
};

export function mailConfigured() {
  return !!process.env.RESEND_API_KEY && !!process.env.FROM_EMAIL;
}

let warned = false;

export async function sendMail(mail: Mail): Promise<boolean> {
  if (!mailConfigured()) {
    if (process.env.NODE_ENV !== "production") {
      console.info(`[mail] not configured — would send to ${mail.to}: ${mail.subject}\n${mail.text}`);
    } else if (!warned) {
      warned = true;
      console.warn("[mail] RESEND_API_KEY / FROM_EMAIL are not set; no mail is sent.");
    }
    return false;
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: `${process.env.FROM_NAME || "Mera Software"} <${process.env.FROM_EMAIL}>`,
        to: [mail.to],
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        headers: mail.headers,
      }),
    });
    if (!response.ok) {
      console.error("[mail] Resend refused the mail", response.status, await response.text());
      return false;
    }
    return true;
  } catch (error) {
    console.error("[mail] sending failed", error);
    return false;
  }
}
