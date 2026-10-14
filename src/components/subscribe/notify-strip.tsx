import Link from "@/components/link";
import { mailConfigured } from "@/lib/mailer";
import { pushConfigured } from "@/lib/push";

/** Whether the site offers "Get notified" at all. Outside production it always does, like the box (see SubscribeBox). */
export function notifyOffered() {
  return pushConfigured() || mailConfigured() || process.env.NODE_ENV !== "production";
}

/** Navy "Stay updated" band. Only on pages about posts (/blog), not in the site footer (owner choice, 12 Oct 2026). */
export function NotifyStrip() {
  if (!notifyOffered()) return null;
  return <section className="notify-strip"><div className="container footer-notify"><div><p className="footer-label">STAY UPDATED</p><p>Get notified when we publish on the topics you choose. Free, no login needed.</p></div><Link className="button footer-notify-button" href="/subscribe">Get notified <span>→</span></Link></div></section>;
}
