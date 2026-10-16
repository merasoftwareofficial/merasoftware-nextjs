import { AdminHeader } from "@/components/admin-layout";
import Link from "@/components/link";
import { requireStaffPage } from "@/lib/auth";
import { DEFAULT_HOMEPAGE_CONTENT } from "@/lib/homepage-content";
import { linkGroups } from "@/lib/link-options";
import { mediaRepo, settingsRepo } from "@/lib/repo";
import { activeVisualSlots, resolveVisualConfigs } from "@/lib/visual-config";
import { HomepageImageEditor } from "./homepage-image-editor";

const SLOTS = ["hero", "work-northstar", "work-oasis"];

export default async function Homepage({ searchParams }: { searchParams: Promise<{ image?: string }> }) {
  await requireStaffPage("/admin/homepage", "editor");
  // "Fix →" on /admin/seo opens one image slot's alt text.
  const { image } = await searchParams;
  const focusSlot = SLOTS.find(slot => slot === image);
  const [settings, assets, links] = await Promise.all([settingsRepo.get(), mediaRepo.list(), linkGroups()]);

  return (
    <main className="admin-main">
      <AdminHeader eyebrow="SITE CONTENT" title="Homepage" description="Edit homepage copy. Manage patterns, images, GIFs and videos in Section visuals." action={<Link className="admin-button" href="/admin/homepage-variants">Homepage variants ↗</Link>} />
      <HomepageImageEditor initialContent={settings.homepageContent ?? DEFAULT_HOMEPAGE_CONTENT} initialVisuals={resolveVisualConfigs(settings, activeVisualSlots(settings).filter(slot => slot.pageId === "home").map(slot => slot.id))} assets={assets} links={links} focusSlot={focusSlot} />
    </main>
  );
}
