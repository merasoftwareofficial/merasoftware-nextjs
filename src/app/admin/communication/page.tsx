import { redirect } from "next/navigation";
import { AdminHeader } from "@/components/admin-layout";
import { getSession, requireStaffPage } from "@/lib/auth";
import { EmailControlPanel } from "@/app/admin/email-control/email-control-panel";
import { WhatsappPanel } from "@/app/admin/whatsapp/whatsapp-panel";
import { CommunicationBoard } from "./communication-board";
import { CommunicationDrawer } from "./communication-drawer";
import s from "./communication.module.css";

// One control panel for every message the site sends. Email and WhatsApp share one template per action:
// WhatsApp sends the email's own text once the email is sent (backend helpers/whatsappQueue.js).
// No WhatsApp is sent directly: every one waits in the queue and leaves one at a time.
// The list shows every job (Website and Portal together); the rest opens in a side panel (?panel=…).
// Old links (/admin/email-control, /admin/whatsapp, ?view=…) redirect here.
type Panel = { title: string; description: string; portalAdmin?: boolean };
const PANELS: Record<string, Panel> = {
  review: { title: "Email review and history", description: "Mails waiting for Send / Don’t send, the Outbox and every decision. Drafts expire after 23 hours; a failed send can be retried." },
  queue: { title: "WhatsApp queue", portalAdmin: true, description: "Messages waiting to go, in the order they will leave, with the time left for each. One message at a time; a sent one moves to history." },
  "whatsapp-history": { title: "WhatsApp history", portalAdmin: true, description: "Finished WhatsApp messages, newest first: Sent, and Not sent (failed, skipped or expired). A failed one can be sent again within 24 hours." },
  whatsapp: { title: "WhatsApp number and sending rules", portalAdmin: true, description: "The linked number (connection, QR code, pause, unlink) and the speed, typing and quiet hours for every WhatsApp." },
};
// The views of the old left menu → the side panel that now holds them (null = the list itself).
const OLD_VIEWS: Record<string, string | null> = {
  "website-actions": null, "portal-actions": null, "whatsapp-rules": "whatsapp", "whatsapp-number": "whatsapp",
  "whatsapp-queue": "queue", "website-history": "review", "portal-history": "review", "whatsapp-history": "whatsapp-history",
};

export const metadata = { title: "Communication — Admin" };
export default async function CommunicationPage({ searchParams }: { searchParams: Promise<{ view?: string; panel?: string }> }) {
  await requireStaffPage("/admin/communication", "admin");
  const session = await getSession();
  const portalAdmin = !!session?.portalRoles.includes("admin");
  const query = await searchParams;
  if (query.view !== undefined) {
    const panel = OLD_VIEWS[query.view] ?? null;
    redirect(panel ? `/admin/communication?panel=${panel}` : "/admin/communication");
  }
  const id = query.panel && Object.hasOwn(PANELS, query.panel) ? query.panel : null;
  const panel = id ? PANELS[id] : null;
  return <main className="admin-main">
    <AdminHeader eyebrow="COMMUNICATION" title="Communication" description="Every message the site sends, by job: its email, the WhatsApp copy, who decides and its templates. The cards open the queue, review, history and WhatsApp settings." />
    <CommunicationBoard portalAdmin={portalAdmin} openPanel={id} />
    {id && panel && <CommunicationDrawer key={id} title={panel.title} description={panel.description}>
      {panel.portalAdmin && !portalAdmin ? <div className={s.locked}><span>Portal admin only</span><p>This part can be managed only by an admin who is also a portal admin.</p></div>
        : id === "review" ? <div className={s.stack}>
            <EmailControlPanel initialApplication="website" canManagePortal={portalAdmin} view="activity" showTabs={false} />
            {portalAdmin && <EmailControlPanel initialApplication="portal" canManagePortal view="activity" showTabs={false} />}
          </div>
        : id === "queue" ? <WhatsappPanel view="queue" />
        : id === "whatsapp-history" ? <WhatsappPanel view="messages" />
        : <div className={s.stack}><WhatsappPanel view="connection" /><WhatsappPanel view="rules" /></div>}
    </CommunicationDrawer>}
  </main>;
}
