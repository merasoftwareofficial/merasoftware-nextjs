import Link from "@/components/link";
import { AdminHeader } from "@/components/admin-layout";
import { getSession, requireStaffPage } from "@/lib/auth";
import { EmailControlPanel } from "@/app/admin/email-control/email-control-panel";
import { WhatsappPanel } from "@/app/admin/whatsapp/whatsapp-panel";
import s from "@/app/admin/content/content.module.css";

// One place for every message the site sends. Email and WhatsApp share one template per action:
// WhatsApp sends the email's own text once the email is sent (backend helpers/whatsappQueue.js).
// Old links (/admin/email-control, /admin/whatsapp) redirect here.
type View = { id: string; label: string; description: string; portalAdmin?: boolean };
const GROUPS: { label: string; views: View[] }[] = [
  { label: "Messages", views: [
    { id: "website-actions", label: "Website actions", description: "Each website action: whether its mail is sent, its default template and the template editor. The same text goes out on WhatsApp." },
    { id: "portal-actions", label: "Portal actions", portalAdmin: true, description: "Each portal action: whether its mail is sent, its default template and the template editor. The same text goes out on WhatsApp." },
  ] },
  { label: "Sending rules", views: [
    { id: "whatsapp-rules", label: "WhatsApp sending rules", portalAdmin: true, description: "Speed, daily limit, typing and quiet hours for WhatsApp. Email rules are set per action under Messages." },
  ] },
  { label: "History", views: [
    { id: "website-history", label: "Website emails", description: "Emails waiting for review, the Outbox and the decision history." },
    { id: "portal-history", label: "Portal emails", portalAdmin: true, description: "Emails waiting for review, the Outbox and the decision history." },
    { id: "whatsapp-history", label: "WhatsApp messages", portalAdmin: true, description: "Every WhatsApp message, newest first. A message that was not sent can be sent again within 24 hours." },
  ] },
  { label: "Connections", views: [
    { id: "whatsapp-number", label: "WhatsApp number", portalAdmin: true, description: "The linked WhatsApp number: connection, QR code, pause and unlink." },
  ] },
];
const VIEWS = GROUPS.flatMap(group => group.views);

export const metadata = { title: "Communication — Admin" };
export default async function CommunicationPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  await requireStaffPage("/admin/communication", "admin");
  const session = await getSession();
  const portalAdmin = !!session?.portalRoles.includes("admin");
  const query = await searchParams;
  const view = VIEWS.find(item => item.id === query.view) ?? VIEWS[0];
  const application = view.id.startsWith("portal") ? "portal" : "website";
  return <main className="admin-main">
    <AdminHeader eyebrow="COMMUNICATION" title="Communication" description="Email and WhatsApp in one place: one template per action, sending rules, history and the WhatsApp connection." />
    <div className={s.layout}>
      <nav className={s.navigation} aria-label="Communication sections">
        {GROUPS.map(group => <div className={s.group} key={group.label}>
          <h2>{group.label}</h2>
          {group.views.map(item => <Link key={item.id} href={`/admin/communication?view=${item.id}`} aria-current={item.id === view.id ? "page" : undefined}>{item.label}</Link>)}
        </div>)}
      </nav>
      <section className={s.editor} aria-labelledby="communication-section-title">
        <div className={s.sectionHeader}><div><h2 id="communication-section-title">{view.label}</h2><p>{view.description}</p></div></div>
        {view.portalAdmin && !portalAdmin ? <div className={s.status}><span className={s.badge}>Portal admin only</span><p>This part can be managed only by an admin who is also a portal admin.</p></div>
          : view.id.endsWith("-actions") ? <EmailControlPanel key={view.id} initialApplication={application} canManagePortal={portalAdmin} view="actions" showTabs={false} />
          : view.id.endsWith("-history") && view.id !== "whatsapp-history" ? <EmailControlPanel key={view.id} initialApplication={application} canManagePortal={portalAdmin} view="activity" showTabs={false} />
          : <WhatsappPanel key={view.id} view={view.id === "whatsapp-rules" ? "rules" : view.id === "whatsapp-history" ? "messages" : "connection"} />}
      </section>
    </div>
  </main>;
}
