/**
 * The click-to-chat link for the business WhatsApp number (wa.me). Optional message is
 * filled into the chat box; the visitor can still edit it before sending.
 */
export function whatsAppChatUrl(number: string, message?: string): string {
  const digits = number.replace(/\D/g, "");
  const base = `https://wa.me/${digits}`;
  const text = message?.trim();
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}

/** The message for a page's chat button: names the package or service when the page has one. */
export function whatsAppPageMessage(subject?: string): string {
  // Titles may end with a full stop of their own; drop it so the message does not end in "..".
  const name = subject?.trim().replace(/[.!?]+$/, "");
  return name
    ? `Hi Mera Software, I would like to know more about ${name}.`
    : "Hi Mera Software, I would like to know more about your services.";
}
