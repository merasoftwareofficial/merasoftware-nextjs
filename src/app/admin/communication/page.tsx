import { redirect } from "next/navigation";
import { AdminHeader } from "@/components/admin-layout";
import { getSession, requireStaffPage } from "@/lib/auth";
import { CommunicationHub, type HubState } from "./communication-hub";

// One control panel for every message the site sends: four boxes (WhatsApp Connection, WhatsApp Queue,
// Email Templates, Email Review), each opening its own side panel in the browser — no server render per
// click. Email and WhatsApp share one template per action: WhatsApp sends the email's own text once the
// email is sent (backend helpers/whatsappQueue.js); every WhatsApp waits in the queue.
// ?panel=…&tab=…&app=… opens a panel directly. Old links (/admin/email-control, /admin/whatsapp, the old
// left menu's ?view=… and the first card layout's ?panel=…) redirect to the panel that now holds them.
const OLD_LINKS: Record<string, string> = {
  "view:website-actions": "panel=email-templates", "view:portal-actions": "panel=email-templates&tab=portal",
  "view:whatsapp-rules": "panel=whatsapp-queue&tab=rules", "view:whatsapp-number": "panel=whatsapp-connection",
  "view:whatsapp-queue": "panel=whatsapp-queue", "view:whatsapp-history": "panel=whatsapp-queue&tab=history",
  "view:website-history": "panel=email-review", "view:portal-history": "panel=email-review&app=portal",
  "panel:queue": "panel=whatsapp-queue", "panel:whatsapp": "panel=whatsapp-connection",
  "panel:whatsapp-history": "panel=whatsapp-queue&tab=history&show=not-sent", "panel:review": "panel=email-review",
};

export const metadata = { title: "Communication — Admin" };
export default async function CommunicationPage({ searchParams }: { searchParams: Promise<{ view?: string; panel?: string; tab?: string; app?: string; show?: string }> }) {
  await requireStaffPage("/admin/communication", "admin");
  const session = await getSession();
  const portalAdmin = !!session?.portalRoles.includes("admin");
  const query = await searchParams;
  const old = query.view !== undefined ? `view:${query.view}` : query.panel !== undefined ? `panel:${query.panel}` : "";
  if (query.view !== undefined || Object.hasOwn(OLD_LINKS, old)) redirect(`/admin/communication${OLD_LINKS[old] ? `?${OLD_LINKS[old]}` : ""}`);
  const initial: HubState = { panel: query.panel ?? null, tab: query.tab ?? null, app: query.app ?? null, show: query.show ?? null };
  return <main className="admin-main">
    <AdminHeader eyebrow="COMMUNICATION" title="Communication" description="Every email and WhatsApp the site sends, in one place." />
    <CommunicationHub portalAdmin={portalAdmin} initial={initial} />
  </main>;
}
