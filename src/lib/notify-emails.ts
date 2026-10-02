/**
 * The mails of the subscribe flow. Plain markup with inline styles, since mail
 * clients ignore stylesheets. Sent through src/lib/mailer.ts.
 */

import type { Mail } from "@/lib/mailer";
import { SITE_NAME } from "@/lib/structured-data";

const escape = (value: string) =>
  value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);

function layout(heading: string, paragraphs: string[], button: { label: string; href: string }, footer: string) {
  return `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:24px;color:#1d1d1b">
<h2 style="margin:0 0 16px">${escape(heading)}</h2>
${paragraphs.map(text => `<p style="font-size:15px;line-height:1.6;margin:0 0 14px">${escape(text)}</p>`).join("\n")}
<p style="margin:24px 0"><a href="${escape(button.href)}" style="display:inline-block;padding:12px 20px;background:#1d1d1b;color:#ffffff;text-decoration:none;border-radius:100px;font-weight:bold">${escape(button.label)}</a></p>
<p style="font-size:13px;line-height:1.5;color:#6b6b66;margin:0">${escape(footer)}</p>
</div>`;
}

/** Topics as one readable line: "SEO, Parenting and offers". */
function topicLine(topics: string[]) {
  return topics.length > 1 ? `${topics.slice(0, -1).join(", ")} and ${topics.at(-1)}` : topics[0] ?? "";
}

export function confirmMail(to: string, topics: string[], confirmUrl: string): Mail {
  const intro = `Please confirm that you want updates from ${SITE_NAME} about ${topicLine(topics)}.`;
  const ignore = "If you did not ask for this, ignore this mail — nothing will be sent to you.";
  return {
    to,
    subject: `Confirm your ${SITE_NAME} updates`,
    html: layout("Confirm your subscription", [intro], { label: "Yes, send me updates", href: confirmUrl }, ignore),
    text: `${intro}\n\nConfirm: ${confirmUrl}\n\n${ignore}`,
  };
}

/** For an address that is already subscribed: its choices change only from this link. */
export function manageMail(to: string, manageUrl: string): Mail {
  const intro = `This address is already subscribed to ${SITE_NAME} updates. You can change your topics or unsubscribe from the link below.`;
  const ignore = "If you did not ask for this, ignore this mail — nothing has changed.";
  return {
    to,
    subject: `Your ${SITE_NAME} updates`,
    html: layout("Manage your updates", [intro], { label: "Manage my updates", href: manageUrl }, ignore),
    text: `${intro}\n\nManage: ${manageUrl}\n\n${ignore}`,
  };
}
